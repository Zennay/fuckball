'use strict';
// Regression for #73: parser exceptions must never produce a blank WebSocket
// diagnostic or partially mutate an already running native BFF match.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(check,desc){
 for(let i=0;i<240;i++){const v=check();if(v)return v;await delay(12);}
 throw Error('Timeout: '+desc);
}
async function connect(url,all,details){
 const ws=new WebSocket(url);ws.messages=[];ws.binary=0;
 ws.onmessage=e=>{if(typeof e.data==='string')ws.messages.push(JSON.parse(e.data));else ws.binary++;};
 all.push(ws);
 await new Promise((ok,bad)=>{ws.onopen=ok;ws.onerror=bad;});
 ws.send(JSON.stringify({type:'join',netcode:3,...details}));
 const response=await until(()=>ws.messages.find(m=>m.type==='welcome'||m.type==='error'),'join result');
 assert.equal(response.type,'welcome',JSON.stringify(response));
 return {ws,...response};
}
function state(room){
 const s=room.hb.getScores();
 return {id:room.id,owner:room.owner,mode:room.mode,started:room.started,
  paused:room.paused,stadium:room.hb._room.state.stadium.name,
  scoreLimit:s.scoreLimit,timeLimit:s.timeLimit,
  players:room.hb.getPlayerList().map(p=>[p.id,p.team]).sort((a,b)=>a[0]-b[0])};
}
(async()=>{
 const app=createServer({peerHosting:false});const {port}=await app.listen(0);
 const url='ws://127.0.0.1:'+port+'/ws',sockets=[];
 try{
  const host=await connect(url,sockets,{create:true,name:'Owner'});
  await connect(url,sockets,{room:host.room,name:'Guest'});
  const room=app.rooms.get(host.room);
  host.ws.send(JSON.stringify({type:'start'}));
  await until(()=>room.started&&host.ws.binary>5,'active native match');
  const baseline=state(room),checks=[
   ['invalid stadium bytes',{stadium:'not-a-valid-hbs-stadium',started:false}],
   ['truncated JSON',{stadium:'{"name":',started:false}],
   ['empty stadium',{stadium:'',started:false}],
   ['blank stadium',{stadium:' ',started:false}],
   ['non-string stadium',{stadium:{name:'Classic'},started:false}],
   ['array stadium',{stadium:[],started:false}],
   ['boolean stadium',{stadium:false,started:false}],
   ['unsupported mode',{mode:'6v6',started:false}],
   ['blank mode',{mode:'',started:false}],
   ['array mode',{mode:['4v4'],started:false}],
   ['negative score',{scoreLimit:-1,started:false}],
   ['oversized score',{scoreLimit:100,started:false}],
   ['fractional score',{scoreLimit:0.5,started:false}],
   ['noninteger time',{timeLimit:'3',started:false}],
   ['negative time',{timeLimit:-1,started:false}],
   ['null team profile',{teamProfile:null,started:false}],
   ['array team profile',{teamProfile:[],started:false}],
   ['string team profile',{teamProfile:'invalid',started:false}],
   ['number team profile',{teamProfile:100,started:false}],
  ];
  for(const [label,params]of checks){
   const errors=host.ws.messages.filter(m=>m.type==='error').length;
   const frame=room.frame,packets=host.ws.binary;
   host.ws.send(JSON.stringify({type:'configure',...params}));
   const e=await until(()=>host.ws.messages.filter(m=>m.type==='error')[errors],label);
   assert.equal(typeof e.message,'string',label+' must include a diagnostic');
   assert(e.message.length>0&&e.message.length<200,label+' nonsecret bounded diagnostic');
   if(Object.hasOwn(params,'stadium'))assert.equal(e.message,'Invalid stadium.',label+' hides parser details');
   if(Object.hasOwn(params,'teamProfile'))assert.equal(e.message,'Invalid team profile.',label+' rejects invalid profile before reset');
   assert.deepEqual(state(room),baseline,label+' cannot mutate approved running match');
   await until(()=>room.frame>frame&&host.ws.binary>packets,label+' native game remains active');
  }
  // Source-bound error-envelope negative test. A native API may throw a
  // string rather than Error; never stringify that untrusted payload or
  // silently send JSON without a message.
  const originalHandler=room.message;
  try{
   room.message=()=>{throw 'synthetic-secret-must-not-leak';};
   const errorCount=host.ws.messages.filter(m=>m.type==='error').length;
   host.ws.send(JSON.stringify({type:'chat',text:'test non-Error fallback'}));
   const fallback=await until(()=>host.ws.messages.filter(m=>m.type==='error')[errorCount],
    'non-Error fallback envelope');
   assert.equal(fallback.message,'Invalid room request.');
   assert(!JSON.stringify(fallback).includes('synthetic-secret'),'synthetic exception payload stays private');
   assert.deepEqual(state(room),baseline,'bad internal exception must not reset active room');
  }finally{room.message=originalHandler;}
  const previous=host.ws.messages.filter(m=>m.type==='error').length;
  host.ws.send(JSON.stringify({type:'configure',mode:'4v4',scoreLimit:5,timeLimit:8,started:true}));
  await until(()=>room.hb.getScores().scoreLimit===5&&room.hb.getScores().timeLimit===8,'valid configuration');
  assert.equal(host.ws.messages.filter(m=>m.type==='error').length,previous,'valid config has no error');
  assert.equal(room.id,host.room);
  assert.equal(room.hb._room.state.stadium.name,'BFF Big v4');
  assert.equal(room.owner,host.id);
  assert.equal(room.clients.size,2);
  console.log('PASS #73 native custom stadium diagnostics: '+checks.length+' malformed requests fail atomically; valid match change succeeds');
 } finally {
  for(const ws of sockets)ws.close();
  await app.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
