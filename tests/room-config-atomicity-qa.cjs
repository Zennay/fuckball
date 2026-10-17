'use strict';
// Approved native gameplay and live room state must survive malformed owner
// configurations: validation must complete before any stop/reset is attempted.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,what){
  for(let i=0;i<220;i++){const value=fn();if(value)return value;await sleep(12);}
  throw Error('Timeout: '+what);
}
async function connect(url,all,join){
  const ws=new WebSocket(url);ws.messages=[];ws.binaryCount=0;
  ws.onmessage=e=>{
    if(typeof e.data==='string')ws.messages.push(JSON.parse(e.data));
    else ws.binaryCount++;
  };
  all.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('WebSocket open timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...join}));
  const msg=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),
    'join');
  assert.equal(msg.type,'welcome',JSON.stringify(msg));
  return {ws,id:msg.id,room:msg.room};
}
function checkConfig(room){
  const s=room.hb.getScores();
  return {
    started:room.started,paused:room.paused,owner:room.owner,mode:room.mode,
    difficulty:room.difficulty,stadium:room.hb._room.state.stadium.name,
    scoreLimit:s.scoreLimit,timeLimit:s.timeLimit,
    players:room.hb.getPlayerList().map(p=>[p.id,p.team]).sort((a,b)=>a[0]-b[0])
  };
}
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0),url='ws://127.0.0.1:'+port+'/ws',sockets=[];
  try{
    const owner=await connect(url,sockets,{create:true,name:'Owner'});
    const guest=await connect(url,sockets,{room:owner.room,name:'Guest'});
    const room=app.rooms.get(owner.room);
    owner.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started===true,'game starts');
    await until(()=>owner.ws.binaryCount>=5,'native game snapshots available');
    const baseline=checkConfig(room);
    assert.equal(baseline.stadium,'BFF Big v4');
    assert.equal(baseline.mode,'4v4');
    const attack=[
      ['unsupported game mode',{mode:'8v8',started:false,scoreLimit:1}],
      ['array mode instead of string',{mode:['4v4'],started:false}],
      ['negative score limit',{scoreLimit:-1,started:false}],
      ['too large score limit',{scoreLimit:100,started:false}],
      ['fractional score limit',{scoreLimit:1.5,started:false}],
      ['negative time limit',{timeLimit:-1,started:false}],
      ['too large time limit',{timeLimit:100,started:false}],
      ['string time limit',{timeLimit:'5',started:false}],
      ['object time limit',{timeLimit:{value:4},started:false}],
      ['wrong-type stadium',{stadium:{name:'Classic'},started:false}],
      ['invalid stadium bytes',{stadium:'not-a-valid-hbs-stadium',started:false}],
      ['partial stadium JSON',{stadium:'{"name":',started:false}]
    ];
    let accepted=0;
    for(const [label,data] of attack){
      const beforeError=owner.ws.messages.filter(m=>m.type==='error').length;
      const beforeTick=room.frame,beforeSnapshots=owner.ws.binaryCount;
      owner.ws.send(JSON.stringify({type:'configure',...data}));
      const err=await until(()=>owner.ws.messages.filter(m=>m.type==='error')[beforeError],
        label+' validation error');
      assert(err.message.length>0,label+': server supplies diagnostic');
      assert.deepEqual(checkConfig(room),baseline,
        label+': invalid setup must not reset/start/stop or change BFF configuration');
      await until(()=>room.frame>beforeTick,label+': native clock still progresses');
      await until(()=>owner.ws.binaryCount>beforeSnapshots,
        label+': current game continues producing real snapshots');
      assert.equal(room.owner,owner.id);
      assert.equal(room.clients.size,2);
      accepted++;
    }
    // The invalid requests did not poison the host's future right to apply
    // a permitted limit and restart. Native BFF stadium and room identity stay.
    owner.ws.send(JSON.stringify({
      type:'configure',mode:'4v4',scoreLimit:5,timeLimit:8,started:true
    }));
    await until(()=>room.hb.getScores().scoreLimit===5&&
      room.hb.getScores().timeLimit===8,'valid host configuration applied');
    assert.equal(room.started,true);
    assert.equal(room.hb._room.state.stadium.name,'BFF Big v4');
    assert.equal(room.owner,owner.id);
    assert.equal(room.clients.size,2);
    assert.equal(app.rooms.get(owner.room),room,'shareable room link unchanged');
    const state=room.hb.getScores();
    assert.equal(state.red,0);assert.equal(state.blue,0);
    console.log('PASS room config atomicity: '+accepted+
      ' malformed owner requests fail before native BFF reset; gameplay and authorized restart survive');
  }finally{
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
