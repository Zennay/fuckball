'use strict';
// Network-facing input integrity gate: untrusted v3 events must not forge ACKs,
// move another player's native disc or bypass the bounded 64-event batch.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){
  for(let n=0;n<260;n++){const value=fn();if(value)return value;await sleep(12);}
  throw Error('Timed out: '+label);
}
async function join(url,connections,opts){
  const ws=new WebSocket(url);
  ws.binaryType='arraybuffer';ws.messages=[];ws.acks=[];
  ws.onmessage=e=>{
    if(typeof e.data==='string'){ws.messages.push(JSON.parse(e.data));return;}
    if(!(e.data instanceof ArrayBuffer)||e.data.byteLength<20)return;
    const v=new DataView(e.data);
    if(v.getUint32(0)===0x46423203)ws.acks.push({ack:v.getUint32(8),frame:v.getUint32(12)});
  };
  connections.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('WebSocket open timed out');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...opts}));
  const welcome=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),
    'WebSocket welcome');
  assert.equal(welcome.type,'welcome',JSON.stringify(welcome));
  return {ws,id:welcome.id,room:welcome.room};
}
const acked=(client,n)=>client.ws.acks.some(x=>x.ack===n);
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0);
  const url='ws://127.0.0.1:'+port+'/ws';
  const connections=[];
  try{
    const host=await join(url,connections,{create:true,name:'Input owner'});
    const guest=await join(url,connections,{room:host.room,name:'Input guest'});
    const room=app.rooms.get(host.room);
    const timeline=room.clients.get(guest.id).timeline;
    assert(timeline,'guest negotiated real v3 input timeline');
    const ownInput=id=>room.hb._room.state.players.find(p=>p.id===id)?.input;
    assert.equal(timeline.appliedSeq,0);
    host.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started,'room started');
    const frame=()=>room.frame+2;

    guest.ws.send(JSON.stringify({type:'in',c:[[1,frame(),8]]}));
    await until(()=>acked(guest,1),'valid input ACK 1 in native v3 snapshot');
    assert.equal(timeline.appliedSeq,1);
    assert.equal(ownInput(guest.id),8,'right-direction input reached own native player');
    assert.equal(ownInput(host.id),0,'guest input cannot affect host');

    guest.ws.send(JSON.stringify({type:'in',c:[[2,frame(),0]]}));
    await until(()=>acked(guest,2),'valid release ACK 2');
    assert.equal(ownInput(guest.id),0,'released input is actually applied');

    // Unsafe wire values must be dropped without incrementing ACK, changing
    // current input or canceling the established room state. Each carries a
    // would-be newer seq=3, so a mistaken parse can steal future acknowledgments.
    const junk=[
      [3,frame(),32],[3,frame(),-1],[3,frame(),1.5],
      [3,frame(),'8'],[3,'future',8],['3',frame(),8],
      [3,frame()],[0,frame(),8],[-3,frame(),8],
      [0x100000000,frame(),8],null,{},'not a tuple',
      [3,null,8],[3,{},8]
    ];
    for(const sample of junk){
      guest.ws.send(JSON.stringify({type:'in',c:[sample]}));
    }
    await sleep(140);
    assert.equal(timeline.lastSeq,2,'malformed newer events cannot advance lastSeq');
    assert.equal(timeline.appliedSeq,2,'malformed newer events cannot fake an ACK');
    assert.equal(timeline.current,0,'malformed input cannot alter effective input');
    assert.equal(ownInput(guest.id),0,'malformed input cannot change native direction');
    assert.equal(ownInput(host.id),0,'malformed input cannot control another player');
    assert(guest.ws.acks.at(-1)?.ack===2,'native snapshots must report unchanged ACK');

    // A valid new input with a forged id must apply only to this socket's own
    // authenticated/assigned room identity; duplicates must not replay.
    guest.ws.send(JSON.stringify({type:'in',id:host.id,owner:host.id,
      c:[[3,frame(),4],[2,frame(),16],[3,frame(),16]]}));
    await until(()=>acked(guest,3),'valid sequenced input ACK 3');
    assert.equal(timeline.lastSeq,3);
    assert.equal(timeline.appliedSeq,3);
    assert.equal(ownInput(guest.id),4,'only first accepted sequence executes');
    assert.equal(ownInput(host.id),0,'wire-supplied player id cannot spoof host');

    // Exactly 64 elements are accepted as a bounded batch, but invalid
    // elements must never suppress a later well-formed last event.
    const maxBatch=Array.from({length:63},()=>[4,frame(),100]);
    maxBatch.push([4,frame(),0]);
    guest.ws.send(JSON.stringify({type:'in',c:maxBatch}));
    await until(()=>acked(guest,4),'bounded 64-event batch ACK 4');
    assert.equal(ownInput(guest.id),0);
    assert.equal(timeline.appliedSeq,4);

    const errorsBefore=guest.ws.messages.filter(m=>m.type==='error').length;
    const tooLarge=[[5,frame(),8],...Array.from({length:64},()=>[5,frame(),0])];
    guest.ws.send(JSON.stringify({type:'in',c:tooLarge}));
    const error=await until(()=>guest.ws.messages.filter(m=>m.type==='error')[errorsBefore],
      'overlength input batch rejected');
    assert.match(error.message,/Invalid input/);
    await sleep(65);
    assert.equal(timeline.lastSeq,4,'oversized batch must not accept first valid event');
    assert.equal(timeline.appliedSeq,4,'oversized batch cannot move native ACK');
    assert.equal(ownInput(guest.id),0,'oversized batch cannot move guest');
    assert.equal(room.clients.size,2);
    assert.equal(room.owner,host.id);
    assert.equal(app.rooms.get(host.room),room);
    console.log('PASS real v3 input gate: 15 malformed candidates, per-socket identity, deduplication, 64 valid/invalid batch and 65-event fail-closed ACK');
  }finally{
    for(const ws of connections)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
