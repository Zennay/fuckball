'use strict';
// #31/#match-history prerequisite: room recordings remain host-owned,
// native-decodable, and accessible to the new rightful owner after handover.
// The backend must not leak replay bytes to unrelated room participants.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const {createRuntime}=require('../headless/runtime.cjs');
const Replay=createRuntime().API.Replay;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){
  for(let i=0;i<280;i++){const v=fn();if(v)return v;await sleep(12);}
  throw Error('Timeout: '+label);
}
async function connect(url,sockets,opts){
  const ws=new WebSocket(url);ws.messages=[];
  ws.onmessage=e=>{if(typeof e.data==='string')ws.messages.push(JSON.parse(e.data));};
  sockets.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('WebSocket connection timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...opts}));
  const reply=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),
    'room join');
  assert.equal(reply.type,'welcome',JSON.stringify(reply));
  return {ws,id:reply.id,room:reply.room};
}
const ofType=(client,type)=>client.ws.messages.filter(m=>m.type===type);
async function recordStart(host,room,label){
  const offset=ofType(host,'recordingStatus').length;
  host.ws.send(JSON.stringify({type:'record'}));
  const m=await until(()=>ofType(host,'recordingStatus')[offset],label+' start receipt');
  assert.equal(m.active,true,label+': owner started recording');
  assert.equal(room.hb._room.isRecording(),true,label+': native recorder active');
}
async function recordStop(host,room,label){
  const start=ofType(host,'recordingStatus').length;
  const bytesStart=ofType(host,'recording').length;
  host.ws.send(JSON.stringify({type:'record'}));
  const status=await until(()=>ofType(host,'recordingStatus')[start],
    label+' stop receipt');
  assert.equal(status.active,false,label+': owner stopped recording');
  const payload=await until(()=>ofType(host,'recording')[bytesStart],
    label+' native replay payload');
  assert.equal(room.hb._room.isRecording(),false,label+': recorder stopped');
  assert.equal(typeof payload.bytes,'string');
  assert.match(payload.bytes,/^[A-Za-z0-9+/]+={0,2}$/);
  const bytes=Uint8Array.from(Buffer.from(payload.bytes,'base64'));
  assert(bytes.length>30,label+': native nonempty replay data');
  const parsed=Replay.readAll(bytes);
  assert(parsed.roomData?.stadium?.name==='BFF Big v4',
    label+': native BFF stadium roundtrips from the replay');
  assert(Array.isArray(parsed.events),label+': native replay decoded event list');
  return {length:bytes.length,frames:parsed.totalFrames,events:parsed.events.length};
}
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0);
  const url='ws://127.0.0.1:'+port+'/ws',sockets=[];
  try{
    const host=await connect(url,sockets,{create:true,name:'Replay owner'});
    const successor=await connect(url,sockets,{room:host.room,name:'Future owner'});
    const spectator=await connect(url,sockets,{room:host.room,name:'Spectator'});
    const room=app.rooms.get(host.room);
    const originalLink=room.id;
    host.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started===true,'native match start');
    await recordStart(host,room,'owner round 1');

    //  Unauthenticated player cannot toggle recording, even with forged host fields.
    const errors=ofType(spectator,'error').length;
    spectator.ws.send(JSON.stringify({type:'record',owner:host.id,admin:true}));
    const denied=await until(()=>ofType(spectator,'error')[errors],'spectator denied');
    assert.match(denied.message,/Only the host/i);
    assert.equal(room.hb._room.isRecording(),true,
      'spectator request cannot prematurely stop recorder');
    assert.equal(ofType(successor,'recording').length,0);
    assert.equal(ofType(spectator,'recording').length,0);

    const firstFrame=room.frame;
    await until(()=>room.frame>=firstFrame+15,'15 native recorded frames');
    const first=await recordStop(host,room,'owner round 1');
    assert.equal(ofType(successor,'recording').length,0,
      'replay bytes may not be broadcast to other sockets');
    assert.equal(ofType(spectator,'recording').length,0,
      'private replay bytes may not be broadcast to spectators');

    // A second active recording survives server-owner disconnect. The new
    // rightful owner, not the old socket or the spectator, is permitted to
    // stop the same native recorder and receive its bytes.
    await recordStart(host,room,'handover round 2');
    const frame=room.frame;
    await until(()=>room.frame>=frame+12,'12 pre-handover recorded frames');
    host.ws.close();
    await until(()=>room.owner===successor.id,'owner transferred to successor');
    assert.equal(app.rooms.get(originalLink),room,'room link retained');
    assert.equal(room.hb._room.isRecording(),true,
      'recording remains active while authoritative server hands over owner');
    assert.equal(room.clients.size,2,'only departing owner disconnected');
    const spectatorErrors=ofType(spectator,'error').length;
    spectator.ws.send(JSON.stringify({type:'record',owner:host.id,admin:true}));
    await until(()=>ofType(spectator,'error').length>spectatorErrors,
      'spectator cannot claim former host after handover');
    const nextFrame=room.frame;
    await until(()=>room.frame>=nextFrame+15,'15 post-handover recorded frames');
    const second=await recordStop(successor,room,'successor round 2');
    assert.equal(ofType(spectator,'recording').length,0,
      'recording never leaks after owner transfer');
    assert.equal(ofType(host,'recording').length,1,
      'disconnected owner cannot receive new replay bytes');
    assert.equal(room.owner,successor.id);
    assert.equal(room.id,originalLink);
    assert.equal(room.clients.size,2);
    console.log('PASS native replay ownership: host-only start/stop, BFF decoding, private delivery, owner handover, '+first.length+'+'+second.length+' replay bytes');
  }finally{
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
