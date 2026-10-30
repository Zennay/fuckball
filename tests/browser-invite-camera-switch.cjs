'use strict';
// Real Chromium privacy/user-choice regression: switching invite methods must
// stop an active local QR camera before waiting on a new permission/decoder.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,why){for(let i=0;i<90;i++){if(await fn())return;await wait(60);}throw Error('Timeout: '+why);}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null}),{port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(()=>{
   window.jsQR=()=>null;window.__cameraStopped=0;window.__clipboardResolve=null;
   navigator.mediaDevices.getUserMedia=async()=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const stream=canvas.captureStream(1);
    const track=stream.getTracks()[0],stop=track.stop.bind(track);
    track.stop=()=>{window.__cameraStopped++;stop();};
    return stream;
   };
   HTMLVideoElement.prototype.play=async()=>{};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
    readText:()=>new Promise(resolve=>{window.__clipboardResolve=resolve;})
   }});
  });
  const scan=page.getByRole('button',{name:/Scan QR with camera/i});
  const paste=page.locator('.direct-invite-actions button').first();
  const file=page.locator('input[aria-label="Read a room invitation QR from a local image"]');
  await scan.click();
  await until(()=>page.evaluate(()=>document.querySelector('.direct-invite-qr-camera').hidden===false),'camera preview');
  await until(()=>page.locator('.direct-invite-status').textContent().then(t=>t.includes('Camera active')),'camera active');
  await paste.click();
  await until(()=>page.evaluate(()=>window.__cameraStopped===1),'switch to clipboard stops camera immediately');
  assert.equal(await paste.isDisabled(),true,'clipboard permission still unresolved');
  await page.evaluate(()=>window.__clipboardResolve('ABCDEFGH'));
  const input=page.locator('input[aria-label="Paste same-site room invitation URL or code"]');
  await until(async()=>await input.inputValue()==='ABCDEFGH','explicit clipboard input');
  // A person choosing an image instead of the live scanner must release
  // the camera immediately, even if native image decoding itself hangs.
  await scan.click();
  await until(()=>page.evaluate(()=>document.querySelector('.direct-invite-status').textContent.includes('Camera active')),'second camera');
  await page.evaluate(()=>{window.createImageBitmap=()=>new Promise(()=>{});});
  const png={name:'synthetic-qr.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xUAAAAASUVORK5CYII=','base64')};
  await file.setInputFiles(png);
  await until(()=>page.evaluate(()=>window.__cameraStopped===2),'switch to file releases camera before decoder');
  await page.locator('#tabPlay').click();
  await until(async()=>!await file.isDisabled(),'abandoned image canceled');
  // Unsupported clipboard is still a deliberate method switch: the active
  // camera must stop, then offer manual paste instead of recording forever.
  await page.evaluate(()=>document.getElementById('tabHome').click());
  await scan.click();
  await until(()=>page.locator('.direct-invite-status').textContent().then(t=>t.includes('Camera active')),'third camera');
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});
  await paste.click();
  await until(()=>page.evaluate(()=>window.__cameraStopped===3),'unsupported clipboard stops camera');
  assert.match(await page.locator('.direct-invite-status').textContent(),/Clipboard reading is unavailable/);
  assert.equal(await page.evaluate(()=>serverLink?.room||null),null,'no automatic room join');
  assert.deepEqual(errors,[]);
  console.log('PASS real Chromium: clipboard/image take camera ownership immediately; pending permission/decoder cannot capture or autojoin');
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
