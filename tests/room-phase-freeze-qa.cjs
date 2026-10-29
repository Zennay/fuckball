'use strict';
// Real-socket match phase regression for #31: pause/stop/start are
// server-authoritative, freeze the native physics and preserve room identity.
// No 4v4 bench or rematch feature is claimed by this existing-state test.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){
  for(let i=0;i<250;i++){const value=fn();if(value)return value;await sleep(12);}
  throw Error('Timed out: '+label);
}
async function connect(url,connections,join){
  const ws=new WebSocket(url);ws.binaryType='arraybuffer';ws.messages=[];ws.packets=0;ws.acks=[];
  ws.onmessage=event=>{
    if(typeof event.data==='string'){ws.messages.push(JSON.parse(event.data));return;}
    ws.packets++;
    if(event.data instanceof ArrayBuffer&&event.data.byteLength>=20){
      const v=new DataView(event.data);
      if(v.getUint32(0)===0x46423203)ws.acks.push(v.getUint32(8));
    }
  };
  connections.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('socket connection timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...join}));
  const response=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),
    'welcome');
  assert.equal(response.type,'welcome',JSON.stringify(response));
  return {ws,id:response.id,room:response.room};
}
const status=(client,predicate)=>client.ws.messages.find(m=>m.type==='status'&&predicate(m));
function capture(room,id){
  const state=room.hb._room.state;
  const player=state.players.find(p=>p.id===id);
  assert(player?.disc,'human native disc exists');
  const ball=state.gameState?.physicsState?.discs?.[0];
  assert(ball,'native game ball exists');
  const scores=room.hb.getScores();
  return {
    ball:[ball.pos.x,ball.pos.y,ball.speed.x,ball.speed.y],
    player:[player.disc.pos.x,player.disc.pos.y,player.disc.speed.x,player.disc.speed.y],
    scores:[scores.red,scores.blue,scores.time]
  };
}
async function main(){
  const app=createServer({peerHosting:false});
  const address=await app.listen(0);
  const url='ws://127.0.0.1:'+address.port+'/ws',connections=[];
  try{
    const host=await connect(url,connections,{create:true,name:'Phase host'});
    const guest=await connect(url,connections,{room:host.room,name:'Phase guest'});
    const room=app.rooms.get(host.room);
    assert.equal(room.owner,host.id);
    assert.equal(room.clients.size,2);
    const hostSocket=room.sockets.get(host.id),guestSocket=room.sockets.get(guest.id);
    assert(hostSocket&&guestSocket,'both native WebSockets retained');

    host.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started===true,'host starts room');
    assert(status(host,s=>s.started&&!s.paused));
    assert(status(guest,s=>s.started&&!s.paused));
    await until(()=>host.ws.packets>=4,'real advancing snapshots');
    const beforePause=capture(room,host.id),frameBeforePause=room.frame;

    const guestErrors=guest.ws.messages.filter(m=>m.type==='error').length;
    guest.ws.send(JSON.stringify({type:'pause',value:true,owner:host.id,admin:true}));
    const refused=await until(()=>guest.ws.messages.filter(m=>m.type==='error')[guestErrors],
      'guest pause permission denial');
    assert.match(refused.message,/Only the host/i);
    assert.equal(room.paused,false,'guest cannot force a pause');

    host.ws.send(JSON.stringify({type:'pause',value:true}));
    await until(()=>room.paused===true,'host pauses room');
    const frozen=capture(room,host.id);
    await sleep(180);
    const later=capture(room,host.id);
    assert(room.frame>frameBeforePause,'server clock keeps ticking while paused');
    assert.deepEqual(later,frozen,'pause freezes ball, own player and score/time');
    await sleep(60);
    const pausedPacketCount=host.ws.packets;
    await sleep(100);
    assert.equal(host.ws.packets,pausedPacketCount,
      'paused game cannot stream advancing gameplay snapshots');

    // Guest cannot stop a paused match or forge ownership; rejection must not
    // reset paused room, remove teammates, or change the share link.
    const guestBefore=guest.ws.messages.filter(m=>m.type==='error').length;
    guest.ws.send(JSON.stringify({type:'stop',owner:host.id,admin:true}));
    await until(()=>guest.ws.messages.filter(m=>m.type==='error').length>guestBefore,
      'guest stop denied');
    assert.equal(room.started,true);
    assert.equal(room.paused,true);
    assert.equal(app.rooms.get(host.room),room);

    // A future-stamped guest direction is acknowledged on the native input
    // timeline while paused, but must never move the player's actual disc.
    const guestFrozen=capture(room,guest.id),timeline=room.clients.get(guest.id).timeline;
    assert(timeline,'guest negotiated stamped v3 input');
    guest.ws.send(JSON.stringify({type:'in',c:[[1,room.frame+3,8]]}));
    await until(()=>timeline.appliedSeq===1,'paused future frame input enters timeline');
    assert.equal(timeline.current,8);
    assert.deepEqual(capture(room,guest.id),guestFrozen,
      'pending input cannot move guest or game clock during the pause');
    // Duplicate packets with the same sequence cannot override the already
    // accepted pending direction at the pause boundary.
    guest.ws.send(JSON.stringify({type:'in',c:[[1,room.frame+2,4]]}));
    await sleep(85);
    assert.equal(timeline.appliedSeq,1,'replayed seq1 input cannot overwrite ACK');
    assert.equal(timeline.current,8,'replayed seq1 does not reverse direction');
    assert.deepEqual(capture(room,guest.id),guestFrozen,
      'duplicate/replayed input never advances paused physics');
    assert(!guest.ws.acks.includes(1),
      'paused game suppresses new gameplay snapshots until resumed');

    host.ws.send(JSON.stringify({type:'pause',value:false}));
    await until(()=>room.paused===false,'host resumes');
    const resumedAt=room.frame;
    await until(()=>room.frame>resumedAt+6,'native simulation advances after resume');
    assert.equal(room.started,true);
    const resumed=capture(room,host.id);
    assert(resumed.scores[2]>=later.scores[2],
      'resuming cannot rewind match time');
    await until(()=>host.ws.packets>pausedPacketCount,'binary snapshots resume');
    await until(()=>guest.ws.acks.includes(1),'guest receives replay ACK after resume');
    const beforeMoved=guestFrozen.player[0];
    await until(()=>capture(room,guest.id).player[0]>beforeMoved+0.25,
      'queued rightward input moves only after authoritative resume');
    assert.equal(timeline.appliedSeq,1);

    host.ws.send(JSON.stringify({type:'stop'}));
    await until(()=>room.started===false,'host stops match');
    assert.equal(room.paused,false,'stop clears UI pause flag');
    const stopped=capture(room,host.id);
    await sleep(160);
    assert.deepEqual(capture(room,host.id),stopped,
      'stopped match cannot simulate native physics or time');
    const stoppedPackets=host.ws.packets;
    await sleep(100);
    assert.equal(host.ws.packets,stoppedPackets,'stop suppresses gameplay snapshots');

    host.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started===true,'host starts a new match');
    assert.equal(room.paused,false);
    assert.equal(room.owner,host.id);
    assert.equal(room.clients.size,2);
    assert.equal(room.sockets.size,2);
    assert.equal(app.rooms.get(host.room),room,'room link persists through phases');
    assert.equal(room.sockets.get(guest.id),guestSocket,'guest socket never reconnects');
    assert.equal(room.sockets.get(host.id),hostSocket,'host socket never reconnects');
    const restarted=capture(room,host.id);
    assert.deepEqual(restarted.scores.slice(0,2),[0,0],'new game starts with zero score');
    console.log('PASS authoritative match phases: guest denial, native pause/stop freeze, queued v3 input and post-resume ACK, new-game reset and stable sockets');
  }finally{
    for(const ws of connections)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
