'use strict';
// Real WebSocket message-flood quality gate: one guest exceeding the 180/s
// inbound cap must not freeze the shared native simulation, alter room owner,
// grant privileges or stop normal clients' traffic.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){
  for(let i=0;i<250;i++){const v=fn();if(v)return v;await sleep(15);}
  throw Error('Timeout: '+label);
}
async function connect(url,sockets,join){
  const ws=new WebSocket(url);ws.messages=[];ws.snapshots=0;
  ws.onmessage=e=>{
    if(typeof e.data==='string')ws.messages.push(JSON.parse(e.data));
    else ws.snapshots++;
  };
  sockets.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('Socket opening timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...join}));
  const m=await until(()=>ws.messages.find(x=>x.type==='welcome'||x.type==='error'),'welcome');
  assert.equal(m.type,'welcome',JSON.stringify(m));
  return {ws,id:m.id,room:m.room};
}
const count=(c,type)=>c.ws.messages.filter(m=>m.type===type).length;
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0),url='ws://127.0.0.1:'+port+'/ws',sockets=[];
  try{
    const host=await connect(url,sockets,{create:true,name:'Owner'});
    const abusive=await connect(url,sockets,{room:host.room,name:'Flooding guest'});
    const guest=await connect(url,sockets,{room:host.room,name:'Healthy guest'});
    const room=app.rooms.get(host.room);
    host.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started,'game started');
    await until(()=>host.ws.snapshots>=4,'native snapshots flowing before burst');
    const beforeFrame=room.frame,denyBase=count(abusive,'error');
    const t0=performance.now();
    for(let i=0;i<205;i++)abusive.ws.send(JSON.stringify({type:'ping',t:i}));
    const denied=await until(()=>abusive.ws.messages.filter(m=>m.type==='error')
      .slice(denyBase).find(m=>/Too many messages/.test(m.message)),'burst rate limited');
    assert.match(denied.message,/Too many messages/);
    assert(performance.now()-t0<1000,'burst must exceed cap in same interval');
    assert.equal(room.owner,host.id,'rate limit cannot transfer ownership');
    assert.equal(room.clients.size,3);
    assert.equal(app.rooms.get(host.room),room,'existing room remains mapped');
    assert.equal(room.started,true,'server match continues');
    const snapshots=host.ws.snapshots;
    await until(()=>host.ws.snapshots>=snapshots+3,'healthy host still receives frames');
    assert(room.frame>beforeFrame,'native tick clock advances despite flood');

    // A blocked guest cannot sneak a host command through message overflow.
    const forged=count(abusive,'error');
    abusive.ws.send(JSON.stringify({type:'configure',mode:'bot',owner:host.id,admin:true}));
    await until(()=>count(abusive,'error')>forged,'abusive admin request rejected');
    assert.equal(room.mode,'4v4');
    assert.equal(room.owner,host.id);

    const chatOffset=count(host,'chat');
    guest.ws.send(JSON.stringify({type:'chat',text:'Healthy-after-flood'}));
    const delivered=await until(()=>host.ws.messages.filter(m=>m.type==='chat')[chatOffset],
      'unaffected guest chat');
    assert.match(delivered.text,/Healthy-after-flood/);

    await sleep(1150);
    const good=count(host,'chat');
    abusive.ws.send(JSON.stringify({type:'chat',text:'Recovered-after-window'}));
    const recovery=await until(()=>host.ws.messages.filter(m=>m.type==='chat')[good],
      'guest can recover next rate window');
    assert.match(recovery.text,/Recovered-after-window/);
    assert.equal(room.clients.size,3,'abuse did not evict healthy players');
    assert.equal(room.started,true);
    assert(host.ws.snapshots>snapshots+10,'match never lost snapshot progress');
    console.log('PASS real 205-request flood: inbound rate limiter denies abuse while room simulation, healthy peer and window recovery survive');
  }finally{
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
