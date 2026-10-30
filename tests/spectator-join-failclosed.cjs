'use strict';
const assert=require('node:assert/strict');
const {createApp}=require('./app-smoke.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(behavior){
 let joins=0, probes=0;
 class ProbeSocket{
  constructor(){this.readyState=0;setImmediate(()=>{this.readyState=1;this.onopen?.();});}
  send(payload){const request=JSON.parse(payload);
   if(request.type==='join'){joins++;return;}
   if(request.type==='spectatorAdmissionInfo'){
    probes++;
    if(behavior==='refused')setImmediate(()=>this.onmessage?.({data:JSON.stringify({type:'spectatorAdmissionInfo',supported:false})}));
    if(behavior==='error')setImmediate(()=>this.onmessage?.({data:JSON.stringify({type:'error',message:'Spectator access requires sign in'})}));
   }
  }
  close(){this.readyState=3;this.onclose?.({code:1000});}
 }
 const app=createApp({location:{hostname:'127.0.0.1',host:'127.0.0.1:8080',protocol:'http:'},globals:{WebSocket:ProbeSocket}});
 try{
  app.elements.get('serverAddress').value='ws://127.0.0.1:8080/ws';
  app.evalJS("showJoinScreen('ABCDEFGH')");
  app.elements.get('joinSpectator').checked=true;
  app.elements.get('joinName').value='Viewer';
  app.elements.get('joinWithName').click();
  await sleep(behavior==='timeout'?4700:80);
  assert.equal(probes,1,behavior+' checks native spectator capability first');
  assert.equal(joins,0,behavior+' must never send a native player join');
  assert.equal(app.elements.get('joinScreen').hidden,false,behavior+' returns to original join form');
  assert.equal(app.elements.get('joinSpectator').checked,true,behavior+' must retain explicit spectator intent');
  if(behavior==='error')assert.match(app.elements.get('joinError').textContent,/Spectator access requires sign in/,'native spectator rejection reason remains actionable');
  assert.equal(app.evalJS('serverLink'),null,behavior+' leaves no orphaned socket');
 }finally{app.evalJS('disconnect();room.destroy()');}
}
async function checkTransportCloseFailure(throws){
 let joins=0, closes=0;
 class StalledSocket{
  constructor(){this.readyState=0;setImmediate(()=>{this.readyState=1;this.onopen?.();});}
  send(payload){if(JSON.parse(payload).type==='join')joins++;}
  close(){closes++;if(throws)throw Error('synthetic close failure');}
 }
 const app=createApp({location:{hostname:'127.0.0.1',host:'127.0.0.1:8080',protocol:'http:'},globals:{WebSocket:StalledSocket}});
 try{
  app.elements.get('serverAddress').value='ws://127.0.0.1:8080/ws';
  app.evalJS("showJoinScreen('ABCDEFGH')");
  app.elements.get('joinSpectator').checked=true;
  app.elements.get('joinName').value='Watcher';
  app.elements.get('joinWithName').click();
  await sleep(30);
  const old=app.evalJS('serverLink.ws');
  assert(old,'pending spectator preflight');
  app.evalJS('serverLink.admissionTimer._onTimeout()');
  old.onmessage?.({data:JSON.stringify({type:'spectatorAdmissionInfo',supported:true})});
  assert.equal(joins,0,'late capability acknowledgement must not send join');
  if(!throws)await sleep(1650);
  assert(closes>0,'timeout requested transport close');
  assert.equal(app.evalJS('serverLink'),null,'timed-out connection released');
  assert.equal(app.elements.get('joinScreen').hidden,false,'manual retry remains available');
  assert.equal(app.elements.get('joinSpectator').checked,true,'WATCH intent retained');
  assert.match(app.elements.get('joinError').textContent,/20 seconds/,'timeout explained');
 }finally{app.evalJS('disconnect();room.destroy()');}
}
(async()=>{
 await check('refused');await check('error');await check('timeout');
 await checkTransportCloseFailure(true);await checkTransportCloseFailure(false);
 console.log('PASS spectator denial, timeout, stalled/throwing close and late replies');
})().catch(e=>{console.error(e);process.exitCode=1;});
