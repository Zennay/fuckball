'use strict';
// Quality baseline for Custom Rooms: the 16-room resource cap must not become
// a global connection cap, and closed room slots must be reusable safely.
// This is distinct from the still-unimplemented 4v4 active roster limit #31.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,attempts=250){
  for(let attempt=0;attempt<attempts;attempt++){
    const result=fn();
    if(result)return result;
    await delay(12);
  }
  throw Error('Timed out: '+label);
}
async function open(url,all) {
  const ws=new WebSocket(url);
  ws.messages=[];
  ws.onmessage=event=>{
    if(typeof event.data==='string')ws.messages.push(JSON.parse(event.data));
  };
  all.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    delay(4000).then(()=>{throw Error('WebSocket connection timeout');})
  ]);
  return ws;
}
async function join(ws,request) {
  const offset=ws.messages.length;
  ws.send(JSON.stringify({type:'join',netcode:3,...request}));
  return until(()=>ws.messages.slice(offset).find(m=>m.type==='welcome'||m.type==='error'),
    'join or admission error');
}
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0);
  const url='ws://127.0.0.1:'+port+'/ws';
  const sockets=[];
  try {
    const owners=[],codes=new Set();
    for(let i=0;i<16;i++){
      const ws=await open(url,sockets);
      const reply=await join(ws,{create:true,name:'Room owner '+i});
      assert.equal(reply.type,'welcome','room '+i+' must be admitted');
      assert.match(reply.room,/^[A-HJ-NP-Z2-9]{8}$/);
      assert(!codes.has(reply.room),'all live room links are distinct');
      codes.add(reply.room);
      owners.push({ws,id:reply.room});
    }
    assert.equal(app.rooms.size,16,'independent room-count cap reached');
    const full=await open(url,sockets);
    const refused=await join(full,{create:true,name:'Overflow room'});
    assert.equal(refused.type,'error','17th new room must be denied');
    assert.match(refused.message,/server is full/i);
    assert.equal(app.rooms.size,16,'failed room creation must not leak an orphan');

    // Existing rooms remain joinable despite the *room count* limit.
    const guest=await open(url,sockets);
    const joined=await join(guest,{room:owners[0].id,name:'Spectator at full capacity'});
    assert.equal(joined.type,'welcome','full room count must not reject existing-room guests');
    assert.equal(joined.room,owners[0].id);
    assert.equal(app.rooms.get(owners[0].id).clients.size,2);
    assert.equal(app.rooms.size,16);
    const api=await fetch('http://127.0.0.1:'+port+'/api/rooms');
    assert.equal(api.status,200);
    const listing=await api.json();
    assert.equal(listing.length,16,'room directory count matches actual active rooms');
    assert(listing.every(item=>item.players>=1 && !Object.hasOwn(item,'id') &&
      !Object.hasOwn(item,'code') && !Object.hasOwn(item,'room')),
      'room directory cannot leak invitation identifiers');

    // A room leaves only when its final WebSocket leaves. Reuse one freed slot
    // over the same socket previously denied admission (no service restart).
    const expired=owners.at(-1);
    expired.ws.close();
    await until(()=>!app.rooms.has(expired.id),'last owner closed room');
    assert.equal(app.rooms.size,15);
    const recovered=await join(full,{create:true,name:'Reused room capacity'});
    assert.equal(recovered.type,'welcome','denied socket can create after capacity is freed');
    assert(!codes.has(recovered.room),'new room must not reuse a currently known link');
    assert.equal(app.rooms.size,16,'room count recovers to exact maximum');
    assert(!app.rooms.has(expired.id),'expired room link remains invalid');

    // Closing the host of a room with a guest must not delete that room early.
    owners[0].ws.close();
    await until(()=>app.rooms.get(owners[0].id)?.clients.size===1,
      'guest survives owner disconnect');
    assert.equal(app.rooms.size,16);
    guest.close();
    await until(()=>!app.rooms.has(owners[0].id),
      'room is removed after final remaining guest leaves');
    assert.equal(app.rooms.size,15);
    console.log('PASS room lifecycle: 16 distinct rooms, deny room 17, join existing when full, 1-slot reuse, invite privacy, owner handover, final cleanup');
  } finally {
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
