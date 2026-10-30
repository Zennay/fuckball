'use strict';
// Cross-browser local room-QR import when createImageBitmap is unavailable.
// QR content is synthetic and never triggers server admission by itself.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){
 for(let i=0;i<100;i++){if(await check())return;await wait(80);}
 throw Error('Timed out: '+label);
}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null});
 const {port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(window,'createImageBitmap',{
   configurable:true,value:undefined
  }));
  await page.goto('http://127.0.0.1:'+port+'/');
  const file=page.locator('input[aria-label="Read a room invitation QR from a local image"]');
  assert.equal(await file.isDisabled(),false,'local QR image import remains available without createImageBitmap');
  const png=await page.evaluate(async()=>{
   const element=document.createElement('div');
   document.body.append(element);
   new QRCode(element,{text:'ABCDEFGH',width:256,height:256,correctLevel:QRCode.CorrectLevel.H});
   await new Promise(resolve=>setTimeout(resolve,100));
   const canvas=element.querySelector('canvas');
   if(!canvas)throw Error('Synthetic QR generator did not produce canvas');
   const result=canvas.toDataURL('image/png');
   element.remove();
   return result;
  });
  await file.setInputFiles({name:'synthetic-room-invite.png',mimeType:'image/png',
   buffer:Buffer.from(png.split(',')[1],'base64')});
  await until(()=>page.evaluate(()=>
   document.querySelector('.direct-invite-form input')?.value==='ABCDEFGH'),
   'synthetic QR recognized as an editable invite');
  const outcome=await page.evaluate(()=>({
   input:document.querySelector('.direct-invite-form input')?.value,
   status:document.querySelector('.direct-invite-status')?.textContent,
   serverRoom:typeof serverLink==='undefined'?null:serverLink?.room||null,
   joinVisible:!document.getElementById('joinScreen').hidden
  }));
  assert.equal(outcome.input,'ABCDEFGH');
  assert.match(outcome.status,/QR read: valid room code/);
  assert.equal(outcome.serverRoom,null,'decoding is not a server join');
  assert.equal(outcome.joinVisible,false,'user must still explicitly choose Join room');
  assert.deepEqual(errors,[],'no browser exceptions');
  console.log('PASS real Chromium local synthetic QR image fallback with no ImageBitmap, explicit human join retained');
  await page.close();
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
