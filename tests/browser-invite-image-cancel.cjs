'use strict';
// Real Chromium checks an intentionally non-resolving, synthetic local QR image.
// Leaving Home and a bounded decoder timeout must not retain a blob URL,
// disable the file input forever, or join any room without explicit consent.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<75;i++){if(await fn())return;await sleep(65);}throw Error('Timeout '+label);}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null}),{port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/');
 await page.evaluate(()=>{
  window.createImageBitmap=undefined;
  window.__createdBlobURLs=[];window.__revokedBlobURLs=[];window.__decoderTimeout=null;
  const origCreate=URL.createObjectURL.bind(URL),origRevoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=origCreate(blob);window.__createdBlobURLs.push(url);return url;};
  URL.revokeObjectURL=url=>{window.__revokedBlobURLs.push(url);return origRevoke(url);};
  window.Image=class {set src(value){this._src=value;}get src(){return this._src;}removeAttribute(){}get width(){return 256;}get height(){return 256;}};
  const origTimer=window.setTimeout.bind(window);
  window.setTimeout=(cb,ms,...args)=>{if(ms>=8000&&ms<=15000&&typeof cb==='function')window.__decoderTimeout=cb;return origTimer(cb,ms,...args);};
 });
 const file=page.locator('input[aria-label="Read a room invitation QR from a local image"]');
 const png={name:'synthetic-hanging-image.png',mimeType:'image/png',
   buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xUAAAAASUVORK5CYII=','base64')};
 await file.setInputFiles(png);
 await until(()=>page.evaluate(()=>window.__createdBlobURLs.length===1),'pending image Blob');
 assert.equal(await file.isDisabled(),true);
 await page.locator('#tabPlay').click();
 await until(()=>page.evaluate(()=>window.__revokedBlobURLs.length===1),'navigation must release image Blob');
 assert.equal(await file.isDisabled(),false,'canceled image input returns to usable state');
 assert.equal(await page.evaluate(()=>serverLink?.room||null),null,'no server joining on cancel');
 await page.evaluate(()=>document.getElementById('tabHome').click());
 await file.setInputFiles(png);
 await until(()=>page.evaluate(()=>window.__createdBlobURLs.length===2),'second pending image');
 const timeoutRegistered=await page.evaluate(()=>typeof window.__decoderTimeout==='function');
 assert.equal(timeoutRegistered,true,'hung local image decode must have a deadline');
 await page.evaluate(()=>window.__decoderTimeout());
 await until(()=>page.evaluate(()=>window.__revokedBlobURLs.length===2),'deadline must release image Blob');
 assert.equal(await file.isDisabled(),false,'timeout permits new QR upload');
 assert.match(await page.locator('.direct-invite-status').textContent(),/timed out|too long/i);
 assert.equal(await page.evaluate(()=>serverLink?.room||null),null,'timeout never joins a room');
 await page.evaluate(()=>{window.createImageBitmap=()=>new Promise(()=>{});});
 await file.setInputFiles(png);
 await until(()=>file.isDisabled(),'pending native ImageBitmap');
 await page.locator('.direct-invite-form input').fill('ABCDEFGH');
 await until(()=>file.isDisabled().then(disabled=>!disabled),'manual edit cancels pending native ImageBitmap');
 assert.equal(await file.isDisabled(),false,'manual input cancels a stuck scan');
 assert.equal(await page.locator('.direct-invite-form input').inputValue(),'ABCDEFGH','manual invitation remains authoritative');
 assert.deepEqual(errors,[],'no uncaught browser errors');
 console.log('PASS real Chromium: never-loading QR image cancels/revokes on navigation and deadline; upload reusable; no autojoin');
 await page.close();
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
