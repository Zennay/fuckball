'use strict';
// Synthetic public host-approved directory; real Chromium. No real joins,
// no account tokens and no remote game server traffic.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,name){for(let i=0;i<75;i++){if(await fn())return;await wait(80);}throw Error('Timed out: '+name);}
(async()=>{
 const app=createServer({peerHosting:false,dataDir:null});
 const {port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(port=>{
   window.__publicFetches=0;
   const original=fetch.bind(window);
   window.fetch=(url,options)=>url==='/api/public-rooms'?
     (window.__publicFetches++,Promise.resolve({ok:true,json:async()=>({rooms:[{
       room:'BCDFGHJK',players:2,occupied:2,capacity:8,started:false,
       map:'Synthetic Training Stadium',mode:'4v4',requiresAccount:false
     }]})})):original(url,options);
   const input=document.getElementById('serverAddress');
   input.value='ws://127.0.0.1:'+port+'/ws';input.dispatchEvent(new Event('input'));
  },port);
  await page.locator('.room-browser-tools button').first().click();
  await until(()=>page.locator('.room-browser-entry').count(),'first host-approved listing');
  assert.equal(await page.locator('.room-browser-entry button[data-room-action=join]').isEnabled(),true);
  // An exact same-host socket may still point at a different tenant. Public
  // HTTP room codes for the default /ws MUST NOT be labeled live for it.
  const before=await page.evaluate(()=>__publicFetches);
  await page.evaluate(port=>{
   const input=document.getElementById('serverAddress');
   input.value='ws://127.0.0.1:'+port+'/ws?tenant=other';
   input.dispatchEvent(new Event('input'));
  },port);
  await until(async()=>await page.locator('.room-browser-entry').count()===0,'old host listing invalidated');
  await page.locator('.room-browser-tools button').nth(1).click();
  await wait(250);
  assert.equal(await page.evaluate(()=>__publicFetches),before,
   'different tenant must not fetch default-host public room inventory');
  assert.match(await page.locator('.room-browser-status').textContent(),
   /selected|different|server|\/ws|current site/i,'server mismatch offers actionable explanation');
  // Switching back to this site's exact server recovers the native browse flow.
  await page.evaluate(port=>{
   const input=document.getElementById('serverAddress');
   input.value='ws://127.0.0.1:'+port+'/ws';input.dispatchEvent(new Event('input'));
  },port);
  await until(()=>page.locator('.room-browser-entry').count(),'room listing restored on same backend');
  assert.equal(await page.locator('.room-browser-entry button[data-room-action=join]').isEnabled(),true);
  // An already pending same-site response must not resurrect its rooms
  // after switching the selected WebSocket to a different tenant.
  await page.evaluate(()=>{
   window.__oldDirectoryFetch=window.fetch;
   window.fetch=(url,opts)=>url==='/api/public-rooms'?
    new Promise(resolve=>{window.__lateDirectory=()=>resolve({
     ok:true,json:async()=>({rooms:[{room:'BCDFGHJK',players:2,occupied:2,
      capacity:8,started:false,map:'Synthetic Training Stadium',mode:'4v4',
      requiresAccount:false}]})
    });}):window.__oldDirectoryFetch(url,opts);
  });
  await page.locator('.room-browser-tools button').nth(1).click();
  await until(()=>page.evaluate(()=>typeof __lateDirectory==='function'),'stalled old-server request');
  await page.evaluate(port=>{
   const input=document.getElementById('serverAddress');
   input.value='ws://127.0.0.1:'+port+'/ws?tenant=other';
   input.dispatchEvent(new Event('input'));
   window.__lateDirectory();window.fetch=window.__oldDirectoryFetch;
  },port);
  await wait(170);
  assert.equal(await page.locator('.room-browser-entry').count(),0,
   'late old-server listing must never be resurrected after switching server');
  await page.evaluate(port=>{
   const input=document.getElementById('serverAddress');
   input.value='ws://127.0.0.1:'+port+'/ws';input.dispatchEvent(new Event('input'));
  },port);
  await until(()=>page.locator('.room-browser-entry').count(),'live room listing restored after canceled old request');
  // Browser storage corruption cannot make every public room disappear.
  await page.evaluate(()=>{
   localStorage.setItem('fuckball.pinned-public-rooms.v1','{broken-json');
   window.dispatchEvent(new StorageEvent('storage',{key:'fuckball.pinned-public-rooms.v1'}));
  });
  await until(async()=>await page.locator('.room-browser-reset-corrupt').isVisible(),
   'explicit recovery control for invalid device bookmarks');
  assert.equal(await page.locator('.room-browser-entry').count(),1,
   'unreadable bookmarks must not block live public-room discovery');
  assert.match(await page.locator('.room-browser-status').textContent(),/saved|pins|corrupt|repair/i);
  page.once('dialog',d=>d.accept());
  await page.locator('.room-browser-reset-corrupt').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('fuckball.pinned-public-rooms.v1')),null,
   'corrupt bookmarks only erased after explicit confirmation');
  assert.equal(await page.locator('.room-browser-entry button[data-room-action=join]').isEnabled(),true);
  assert.deepEqual(errors,[],'no real Chromium exceptions');
  console.log('PASS Chromium public directory: backend identity, stale listing rejection, recovery to live rooms, explicit corrupt-bookmark repair');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
