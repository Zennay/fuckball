'use strict';
// #31 prerequisite: simultaneous private Custom Rooms must isolate authority,
// chat, configuration, team state and owner failover without relying on the
// incomplete 4v4 bench/active-slot implementation.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,what){
  for(let n=0;n<240;n++){const value=fn();if(value)return value;await wait(15);}
  throw Error('Timed out: '+what);
}
async function open(url,sockets){
  const ws=new WebSocket(url);
  ws.messages=[];
  ws.onmessage=event=>{
    if(typeof event.data==='string')ws.messages.push(JSON.parse(event.data));
  };
  sockets.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    wait(4000).then(()=>{throw Error('WebSocket open timeout');})
  ]);
  return ws;
}
async function join(url,sockets,name,room){
  const ws=await open(url,sockets);
  ws.send(JSON.stringify({type:'join',name,netcode:3,
    ...(room?{room}:{create:true})}));
  const response=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),
    name+' admitted');
  assert.equal(response.type,'welcome',name+': '+JSON.stringify(response));
  return {ws,id:response.id,room:response.room};
}
const messages=(client,type)=>client.ws.messages.filter(m=>m.type===type);
async function reject(client,command,room,label){
  const prior=messages(client,'error').length;
  const snapshot=JSON.stringify({
    owner:room.owner,started:room.started,difficulty:room.difficulty,
    players:room.hb.getPlayerList().map(p=>[p.id,p.team]).sort((a,b)=>a[0]-b[0])
  });
  client.ws.send(JSON.stringify(command));
  const error=await until(()=>messages(client,'error')[prior],label+' denied');
  assert.match(error.message,/Only the host can change the match/);
  assert.equal(JSON.stringify({
    owner:room.owner,started:room.started,difficulty:room.difficulty,
    players:room.hb.getPlayerList().map(p=>[p.id,p.team]).sort((a,b)=>a[0]-b[0])
  }),snapshot,label+': unauthorized action leaves authoritative state unchanged');
}
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0);
  const url='ws://127.0.0.1:'+port+'/ws';
  const sockets=[];
  try {
    const a=await join(url,sockets,'Alpha owner');
    const ag=await join(url,sockets,'Alpha guest',a.room);
    const b=await join(url,sockets,'Beta owner');
    const bg=await join(url,sockets,'Beta guest',b.room);
    assert.notEqual(a.room,b.room,'private room links must not collide');
    const ra=app.rooms.get(a.room),rb=app.rooms.get(b.room);
    assert(ra&&rb&&ra!==rb,'two distinct authoritative room cores');
    assert.equal(app.rooms.size,2);
    assert.equal(ra.owner,a.id);
    assert.equal(rb.owner,b.id);
    assert.equal(ra.clients.size,2);
    assert.equal(rb.clients.size,2);
    const initialB=rb.hb.getPlayerList().map(p=>[p.id,p.team]);

    // Room A chats may reach A participants only, never B subscribers.
    const aChat=messages(a,'chat').length,bChat=messages(b,'chat').length;
    const bgChat=messages(bg,'chat').length;
    ag.ws.send(JSON.stringify({type:'chat',text:'Alpha-private-marker'}));
    const received=await until(()=>messages(a,'chat')[aChat],'alpha host receives private chat');
    assert.match(received.text,/Alpha-private-marker/);
    await wait(100);
    assert.equal(messages(b,'chat').length,bChat,'beta host cannot hear alpha chat');
    assert.equal(messages(bg,'chat').length,bgChat,'beta guest cannot hear alpha chat');

    // Owner A may control only A. A guest may control neither room.
    a.ws.send(JSON.stringify({type:'start'}));
    await until(()=>ra.started===true,'alpha match starts');
    assert.equal(rb.started,false,'starting alpha cannot start beta');
    a.ws.send(JSON.stringify({type:'difficulty',difficulty:'elite'}));
    await until(()=>ra.difficulty==='elite','alpha difficulty update');
    assert.equal(rb.difficulty,'hard','beta AI difficulty remains independent');
    await reject(ag,{type:'start',owner:b.id,room:b.room,admin:true},ra,
      'cross-room owner spoof');
    await reject(ag,{type:'team',id:bg.id,team:0,owner:b.id,admin:true},ra,
      'cross-room target id spoof');
    assert.deepEqual(rb.hb.getPlayerList().map(p=>[p.id,p.team]),initialB,
      'forged cross-room target cannot change beta players');

    a.ws.send(JSON.stringify({type:'team',id:ag.id,team:0}));
    await until(()=>ra.hb.getPlayer(ag.id).team===0,'alpha owner moves alpha guest');
    assert.deepEqual(rb.hb.getPlayerList().map(p=>[p.id,p.team]),initialB,
      'legitimate alpha team change cannot affect beta team state');

    // Start B independently, then rotate A owner; B stays alive and owned by B.
    b.ws.send(JSON.stringify({type:'start'}));
    await until(()=>rb.started===true,'beta starts');
    assert.equal(ra.started,true,'beta start does not reset alpha');
    a.ws.close();
    await until(()=>ra.owner===ag.id,'alpha owner handover');
    assert.equal(app.rooms.get(b.room),rb,'beta room unchanged by alpha leave');
    assert.equal(rb.owner,b.id,'beta ownership stays independent');
    assert.equal(rb.clients.size,2,'beta member count stable');
    ag.ws.send(JSON.stringify({type:'stop'}));
    await until(()=>ra.started===false,'alpha successor stops alpha');
    assert.equal(rb.started,true,'alpha successor stop cannot stop beta');

    const betaChat=messages(b,'chat').length,alphaChat=messages(ag,'chat').length;
    bg.ws.send(JSON.stringify({type:'chat',text:'Beta-private-marker'}));
    const betaReceived=await until(()=>messages(b,'chat')[betaChat],
      'beta owner receives beta chat');
    assert.match(betaReceived.text,/Beta-private-marker/);
    await wait(100);
    assert.equal(messages(ag,'chat').length,alphaChat,'alpha survivor cannot hear beta chat');

    ag.ws.close();
    await until(()=>!app.rooms.has(a.room),'last alpha guest leaves');
    assert.equal(app.rooms.get(b.room),rb,'beta room survives alpha cleanup');
    assert.equal(rb.owner,b.id);
    assert.equal(rb.clients.size,2);
    b.ws.close();
    await until(()=>rb.owner===bg.id,'beta owner handover after alpha cleanup');
    bg.ws.close();
    await until(()=>app.rooms.size===0,'beta room cleanup');
    console.log('PASS custom room isolation: independent chat, controls, team/AI state, owner transfer and cleanup across 2 live rooms');
  } finally {
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
