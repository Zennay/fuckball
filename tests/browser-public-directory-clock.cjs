'use strict';
// Real Chromium directory UI with synthetic, host-approved public listing.
// All join actions remain server-owned; this checks UI freshness only.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await sleep(80);}throw Error('Timeout '+label);}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null});
 const {port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/public-rooms',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({rooms:[{room:'ABCDEFGH',players:1,occupied:1,capacity:8,started:false,map:'BFF Big',mode:'4v4',requiresAccount:false}]})
  }));
  await page.goto('http://127.0.0.1:'+port+'/');
  const directory=page.locator('.room-browser');
  await directory.getByRole('button',{name:'Browse rooms'}).click();
  await until(()=>directory.locator('.room-browser-entry').count().then(x=>x===1),'public room listing');
  const join=directory.locator('.room-browser-entry button[data-room-action="join"]');
  assert.equal(await join.isDisabled(),false,'fresh host-listed available room can open server join dialog');
  await directory.locator('.room-browser-entry button[data-room-action="pin"]').click();
  const pinBadge=directory.locator('.room-browser-saved-card .room-browser-availability');
  assert.match(await pinBadge.textContent(),/OPEN SEATS/,'fresh pinned availability has a verified listing');
  await page.evaluate(()=>{
   window.__originalDirectoryWall=Date.now;
   Date.now=()=>window.__originalDirectoryWall()+360000;
   document.querySelector('.room-browser-filters input[type="search"]')?.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.equal(await join.isDisabled(),false,'forward +6m wall-clock change must not make fresh listing stale');
  assert.match(await pinBadge.textContent(),/OPEN SEATS/,'pinned room must remain fresh under wall-clock shift');
  await page.evaluate(()=>{
   Date.now=()=>window.__originalDirectoryWall()-360000;
   const mono=performance.now.bind(performance);
   Object.defineProperty(performance,'now',{configurable:true,value:()=>mono()+50000});
   document.querySelector('.room-browser-filters input[type="search"]')?.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert.equal(await join.isDisabled(),true,'after 50s elapsed, backward wall-clock jump must not preserve expired room availability');
  assert.match(await pinBadge.textContent(),/CURRENT STATUS UNKNOWN/,'pinned stale listing cannot advertise open seats');
  assert.match(await directory.locator('.room-browser-status').textContent(),/Old snapshot|refresh before joining/);
  assert.equal(await page.locator('#joinScreen').isHidden(),true,'server-owned join dialog never opens automatically');
  assert.deepEqual(errors,[],'no Chromium errors');
  console.log('PASS real Chromium public-room freshness: +/-6m wall clock, monotonic 50s expiry, no implicit join');
  await page.close();
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
