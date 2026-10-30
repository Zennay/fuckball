'use strict';
// Public-room readiness must expire visibly even when the HTTP refresh is
// stalled; verified host approval is a short-lived snapshot, never admission.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,name){for(let i=0;i<100;i++){if(await fn())return;await sleep(75);}throw Error('Timeout '+name);}
(async()=>{
 const app=createServer({peerHosting:false,dataDir:null}),{port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let reads=0;
 await page.route('**/api/public-rooms',route=>{
  reads++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   rooms:[{room:'ABCDEFGH',players:1,occupied:1,capacity:8,started:false,map:'Synthetic Field',mode:'4v4',requiresAccount:false}]
  })});
 });
 await page.goto('http://127.0.0.1:'+port+'/');
 await page.evaluate(()=>{
  const nativeSetTimeout=window.setTimeout.bind(window);
  window.__liveExpiryTick=null;
  window.setTimeout=(cb,delay,...rest)=>{
   if(delay>44000&&delay<46000&&typeof cb==='function')window.__liveExpiryTick=cb;
   return nativeSetTimeout(cb,delay,...rest);
  };
 });
 const directory=page.locator('.room-browser');
 await directory.getByRole('button',{name:'Browse rooms'}).click();
 await until(()=>directory.locator('.room-browser-entry').count().then(n=>n===1),'fresh public room');
 const join=directory.locator('.room-browser-entry button[data-room-action="join"]');
 await directory.locator('.room-browser-entry button[data-room-action="pin"]').click();
 const pinned=directory.locator('.room-browser-saved-card .room-browser-availability');
 assert.equal(await join.isDisabled(),false);
 assert.match(await pinned.textContent(),/OPEN SEATS/);
 const captured=await page.evaluate(()=>typeof window.__liveExpiryTick==='function');
 assert.equal(captured,true,'public directory schedules an expiry repaint without another HTTP response');
 const beforeRequests=reads;
 await page.evaluate(()=>{
  const wall=Date.now,mono=performance.now.bind(performance);
  Date.now=()=>wall()-360000;
  Object.defineProperty(performance,'now',{configurable:true,value:()=>mono()+50000});
  window.__liveExpiryTick();
 });
 assert.equal(await join.isDisabled(),true,'visible Join automatically disables when HTTP snapshot expires');
 assert.match(await pinned.textContent(),/CURRENT STATUS UNKNOWN/,'pinned room no longer claims verified seats');
 assert.match(await directory.locator('.room-browser-status').textContent(),/Old snapshot|refresh before joining/);
 assert.equal(reads,beforeRequests,'expiry UI does not launch automatic network requests');
 assert.equal(await page.locator('#joinScreen').isHidden(),true,'no silent room join');
 await directory.getByRole('button',{name:/Refresh/}).click();
 await until(()=>join.isDisabled().then(disabled=>!disabled),'fresh server listing after manual refresh');
 assert.match(await pinned.textContent(),/OPEN SEATS/,'new host-approved listing re-enables available pinned room');
 assert.deepEqual(errors,[],'no native UI errors');
 console.log('PASS real Chromium: stale public rooms and pinned Join auto-expire visually at 45s, manual refresh restores server-approved availability, no auto-join');
 await page.close();
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
