'use strict';
// Synthetic server selection and WebSocket error receipts. Real Chromium UI;
// never joins a real human queue or authenticates a remote game server.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
async function until(predicate,reason){
 for(let i=0;i<70;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,70));}
 throw Error('Timeout: '+reason);
}
(async()=>{
 const app=createServer({peerHosting:false,dataDir:null});
 const {port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(port=>{
   window.__queueCalls=0;
   window.__nativeFetch=fetch.bind(window);
   window.fetch=(url,options)=>{
    if(url==='/api/quick-match/availability'){
     window.__queueCalls++;
     return Promise.resolve({ok:true,json:async()=>({
      humanOnly:true,ranked:false,modes:{
       '1v1':{waiting:3,confirming:0,needed:2},
       '2v2':{waiting:0,confirming:0,needed:4},
       '3v3':{waiting:0,confirming:0,needed:6},
       '4v4':{waiting:0,confirming:0,needed:8}
      }
     })});
    }
    return window.__nativeFetch(url,options);
   };
   const address=document.querySelector('#serverAddress');
   address.value='ws://127.0.0.1:'+port+'/ws';
   address.dispatchEvent(new Event('input'));
  },port);
  await until(()=>page.evaluate(()=>window.__queueCalls>0),'valid same-site socket loads queue');
  assert.match(await page.locator('.quick-queue-availability').innerText(),/Real-player queues/i);
  // Same host is NOT sufficient if the selected socket uses a distinct query
  // context. HTTP /api/quick-match/availability represents only plain /ws.
  const oldCalls=await page.evaluate(port=>{
   document.querySelector('#serverAddress').value='ws://127.0.0.1:'+port+'/ws?tenant=other';
   document.querySelector('#serverAddress').dispatchEvent(new Event('input'));
   return window.__queueCalls;
  },port);
  await page.waitForTimeout(650);
  await page.locator('.quick-queue-availability-actions button').click();
  await page.waitForTimeout(120);
  const newCalls=await page.evaluate(()=>window.__queueCalls);
  assert.equal(newCalls,oldCalls,'tenant-qualified socket must not fetch default-server occupancy');
  assert.match(await page.locator('.quick-queue-availability').innerText(),/hidden|another server|same server/i,
   'do not advertise main-site player counts for a distinct socket context');
  // An old WebSocket can signal a delayed error *after* its owner was torn
  // down. The current session must keep its own connection status.
  const socket=await page.evaluate(port=>{
   const instances=[];
   class FakeSocket {
    constructor(url){this.url=url;this.readyState=0;instances.push(this);}
    close(){this.readyState=3;}
    send(){}
   }
   window.WebSocket=FakeSocket;
   document.querySelector('#serverAddress').value='ws://127.0.0.1:'+port+'/ws';
   const first=connectServer(false,'');
   const old=instances[0];
   disconnect();
   const second=connectServer(false,'');
   const newest=instances[1];
   const before=document.querySelector('#serverRoomStatus').textContent;
   if(old?.onerror)old.onerror(new Event('error'));
   return {first,second,created:instances.length,stillCurrent:serverLink?.ws===newest,
    before,after:document.querySelector('#serverRoomStatus').textContent};
  },port);
  assert.equal(socket.created,2,'two sequential synthetic native sessions created');
  assert.equal(socket.stillCurrent,true,'latest socket remains the active owner');
  assert.equal(socket.after,socket.before,'late obsolete socket error cannot overwrite new connection status');
  assert.deepEqual(errors,[],'no browser runtime errors');
  console.log('PASS Chromium: same-host tenant socket never claims other queue occupancy; stale previous WebSocket error cannot overwrite new session');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
