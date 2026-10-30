'use strict';
// Real browser proof: a local QR decoder script that never loads must not trap
// the upload input after navigation; timeout must permit a safe retry.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){
 for(let i=0;i<90;i++){if(await check())return;await delay(60);}
 throw Error('Timeout waiting for '+label);
}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null});
 const {port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(()=>{window.BarcodeDetector=undefined;});
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(()=>{
   window.__blockedScripts=[];
   window.__decoderDeadline=null;
   const append=document.head.append.bind(document.head);
   document.head.append=function(...elements){
    const script=elements.find(e=>e.tagName==='SCRIPT'&&e.src.includes('/vendor/jsQR.js'));
    if(script){window.__blockedScripts.push(script);return script;}
    return append(...elements);
   };
   const originalTimeout=window.setTimeout.bind(window);
   window.setTimeout=function(fn,ms,...args){
    if(ms===8000&&typeof fn==='function')window.__decoderDeadline=fn;
    return originalTimeout(fn,ms,...args);
   };
  });
  const file=page.locator('input[aria-label="Read a room invitation QR from a local image"]');
  const png={name:'synthetic-local-qr.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xUAAAAASUVORK5CYII=','base64')};
  await file.setInputFiles(png);
  await until(()=>page.evaluate(()=>window.__blockedScripts.length===1),'stalled decoder script');
  assert.equal(await file.isDisabled(),true);
  await page.locator('#tabPlay').click();
  await until(async()=>!await file.isDisabled(),'image input canceled on leaving Home');
  assert.equal(await page.evaluate(()=>serverLink?.room||null),null);
  await page.evaluate(()=>document.getElementById('tabHome').click());
  await file.setInputFiles(png);
  await until(()=>page.evaluate(()=>typeof window.__decoderDeadline==='function'),'decoder deadline registered');
  await page.evaluate(()=>window.__decoderDeadline());
  await until(async()=>!await file.isDisabled(),'decoder deadline releases input');
  assert.match(await page.locator('.direct-invite-status').textContent(),/too long|load|unavailable/i);
  await file.setInputFiles(png);
  await until(()=>page.evaluate(()=>window.__blockedScripts.length===2),'fresh retry script');
  await page.evaluate(()=>{window.jsQR=()=>null;window.__blockedScripts[1].onload();});
  await until(async()=>!await file.isDisabled(),'successful loader retry');
  assert.equal(await page.evaluate(()=>serverLink?.room||null),null);
  assert.deepEqual(errors,[],'uncaught Chromium errors');
  console.log('PASS real Chromium: canceled QR script load, deadline, retry, and no unconsented room join');
 }finally{await browser.close();await server.close();}
})().catch(err=>{console.error(err);process.exitCode=1});