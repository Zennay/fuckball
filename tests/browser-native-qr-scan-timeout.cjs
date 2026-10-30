'use strict';
// Real Chromium: hanging native QR recognition must release a live camera;
// a late rejection after human Stop must not overwrite their Stop message.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,msg){for(let i=0;i<100;i++){if(await f())return;await pause(65);}throw Error('Timeout '+msg);}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null}),{port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__nativeCount=0;window.__nativeDeadline=null;window.__tracksStopped=0;
   window.BarcodeDetector=class{constructor(){} detect(){window.__nativeCount++;return new Promise(()=>{});}};
   Object.defineProperty(HTMLVideoElement.prototype,'readyState',{configurable:true,get:()=>4});
   const nativeTimer=window.setTimeout.bind(window);
   window.setTimeout=(callback,ms,...rest)=>{
    if(ms===6000&&typeof callback==='function')window.__nativeDeadline=callback;
    return nativeTimer(callback,ms,...rest);
   };
  });
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(()=>{
   navigator.mediaDevices.getUserMedia=async()=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const stream=canvas.captureStream(1);
    for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.__tracksStopped++;stop();};}
    return stream;
   };
   HTMLVideoElement.prototype.play=async()=>{};
  });
  const start=page.getByRole('button',{name:/Scan QR with camera/i});
  await start.click();
  await until(()=>page.evaluate(()=>window.__nativeCount>=1),'native detector attempt');
  await until(()=>page.evaluate(()=>typeof window.__nativeDeadline==='function'),'bounded native detect timeout');
  await page.evaluate(()=>window.__nativeDeadline());
  await until(()=>page.evaluate(()=>window.__tracksStopped===1),'timeout stops native camera');
  assert.match(await page.locator('.direct-invite-status').textContent(),/QR detection unavailable|timed out/i);
  assert.equal(await page.evaluate(()=>serverLink?.room||null),null,'no autojoin');
  assert.equal(await start.isDisabled(),false,'camera can be retried');
  await start.click();
  await until(()=>page.evaluate(()=>window.__nativeCount>=2),'second detection');
  await page.locator('.direct-invite-qr-camera button').click();
  await until(()=>page.evaluate(()=>window.__tracksStopped===2),'manual stop track');
  const before=await page.locator('.direct-invite-status').textContent();
  await pause(50);
  assert.equal(await page.locator('.direct-invite-status').textContent(),before,'manual Stop message retained');
  // The old detector still awaits its six-second timeout. A fresh user's
  // Scan must not inherit the previous camera's busy flag.
  await page.evaluate(()=>{window.__abandonedDeadline=window.__nativeDeadline;});
  await start.click();
  await page.waitForFunction(()=>window.__nativeCount>=3,null,{timeout:2200});
  await page.evaluate(()=>window.__abandonedDeadline());
  await pause(60);
  assert.match(await page.locator('.direct-invite-status').textContent(),/Camera active/,'late old error does not stop the new camera');
  await page.locator('.direct-invite-qr-camera button').click();
  await until(()=>page.evaluate(()=>window.__tracksStopped===3),'fresh scan camera stopped');
  const stopped=await page.locator('.direct-invite-status').textContent();
  await page.evaluate(()=>window.__nativeDeadline());
  await pause(50);
  assert.equal(await page.locator('.direct-invite-status').textContent(),stopped,'late native timeout does not overwrite human Stop');
  assert.deepEqual(errors,[]);
  console.log('PASS Chromium: stalled native QR scan times out, releases camera, retries and preserves human Stop');
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
