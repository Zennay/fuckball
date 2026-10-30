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
  assert.equal(app.evalJS('serverLink'),null,behavior+' leaves no orphaned socket');
 }finally{app.evalJS('disconnect();room.destroy()');}
}
(async()=>{await check('refused');await check('timeout');console.log('PASS spectator intent preserved after capability denial and timeout; never silently joins as player');})().catch(e=>{console.error(e);process.exitCode=1;});
