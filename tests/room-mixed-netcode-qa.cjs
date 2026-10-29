'use strict';
// A native room can legitimately contain a legacy v2 client and a stamped v3
// client. Snapshot formats, ACKs, input commands and owner handover must not
// cross formats or let one peer spoof the other.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){
  for(let n=0;n<230;n++){const v=fn();if(v)return v;await sleep(15);}
  throw Error('Timeout: '+label);
}
async function connect(url,sockets,opts){
  const ws=new WebSocket(url);ws.binaryType='arraybuffer';
  ws.messages=[];ws.frames=[];
  ws.onmessage=e=>{
    if(typeof e.data==='string'){ws.messages.push(JSON.parse(e.data));return;}
    if(!(e.data instanceof ArrayBuffer)||e.data.byteLength<16)return;
    const v=new DataView(e.data);
    ws.frames.push({magic:v.getUint32(0),seq:v.getUint32(4),
      ack:v.getUint32(8),frame:v.getUint32(12),length:e.data.byteLength});
  };
  sockets.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('Socket open timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',...opts}));
  const m=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),
    'native admission');
  assert.equal(m.type,'welcome',JSON.stringify(m));
  return {ws,id:m.id,room:m.room,welcome:m};
}
function nativeInput(room,id){
  return room.hb._room.state.players.find(p=>p.id===id).input;
}
async function denied(client,d,label){
  const before=client.ws.messages.filter(m=>m.type==='error').length;
  client.ws.send(JSON.stringify(d));
  const error=await until(()=>client.ws.messages.filter(m=>m.type==='error')[before],label);
  assert.match(error.message,/Invalid input/i);
}
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0),url='ws://127.0.0.1:'+port+'/ws',sockets=[];
  try{
    const modern=await connect(url,sockets,{create:true,netcode:3,name:'Modern host'});
    const legacy=await connect(url,sockets,{room:modern.room,netcode:2,name:'Legacy guest'});
    const room=app.rooms.get(modern.room);
    assert.equal(modern.welcome.netcode,3);
    assert.equal(legacy.welcome.netcode,2);
    assert(room.clients.get(modern.id).timeline,'v3 owns host input buffer');
    assert.equal(room.clients.get(legacy.id).timeline,null,
      'v2 legacy client uses immediate input');
    modern.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started,'match start');
    await until(()=>modern.ws.frames.length>=5&&legacy.ws.frames.length>=5,
      'both snapshot types are broadcast');
    const v3=modern.ws.frames.at(-1),v2=legacy.ws.frames.at(-1);
    assert.equal(v3.magic,0x46423203,'v3 header magic');
    assert.equal(v2.magic,0x46423201,'v2 header magic');
    assert(v3.length>20&&v2.length>16,'correct binary native snapshot sizes');
    assert(v3.frame>0&&v2.frame>0);
    assert(v3.seq>0&&v2.seq>0);

    await denied(modern,{type:'input',value:8,seq:998},
      'legacy payload must fail on v3 client');
    await denied(legacy,{type:'in',c:[[998,room.frame+2,8]]},
      'stamped payload must fail on v2 client');
    assert.equal(nativeInput(room,modern.id),0);
    assert.equal(nativeInput(room,legacy.id),0);

    legacy.ws.send(JSON.stringify({type:'input',value:4,seq:12}));
    await until(()=>legacy.ws.frames.some(f=>f.ack===12),'legacy seq12 ACK');
    assert.equal(nativeInput(room,legacy.id),4,'legacy peer moves only itself');
    assert.equal(nativeInput(room,modern.id),0,'legacy input never applies to v3 host');
    assert.equal(room.clients.get(legacy.id).lastInputSeq,12);
    assert.equal(room.clients.get(modern.id).timeline.appliedSeq,0);

    modern.ws.send(JSON.stringify({type:'in',c:[[1,room.frame+2,8]]}));
    await until(()=>modern.ws.frames.some(f=>f.ack===1),'v3 seq1 ACK');
    assert.equal(nativeInput(room,modern.id),8,'v3 input moves only modern host');
    assert.equal(nativeInput(room,legacy.id),4,'v3 input cannot change legacy guest');
    assert.equal(room.clients.get(modern.id).timeline.appliedSeq,1);
    assert.equal(room.clients.get(legacy.id).lastInputSeq,12);
    assert.equal(modern.ws.frames.at(-1).ack,1);
    assert.equal(legacy.ws.frames.at(-1).ack,12);
    assert(modern.ws.frames.every(f=>f.magic===0x46423203));
    assert(legacy.ws.frames.every(f=>f.magic===0x46423201));

    const oldLink=modern.room,frame=room.frame;
    modern.ws.close();
    await until(()=>room.owner===legacy.id,'legacy guest becomes owner');
    assert.equal(app.rooms.get(oldLink),room);
    assert.equal(room.clients.size,1);
    assert.equal(room.started,true);
    const before=legacy.ws.frames.length;
    await until(()=>legacy.ws.frames.length>=before+3,'v2 snapshots survive handover');
    assert(room.frame>frame,'native room ticks survive mixed-version owner change');
    legacy.ws.send(JSON.stringify({type:'pause',value:true}));
    await until(()=>room.paused===true,'new owner controls match');
    assert.equal(room.owner,legacy.id);
    console.log('PASS real v2/v3 mixed room: binary formats, independent ACKs and inputs, rejection of wrong protocol, legacy owner handover');
  }finally{
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
