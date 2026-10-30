'use strict';
// Real Chromium, synthetic queue availability only. No human matching or
// account action. Exercises an HTTP response with a hung JSON body.
const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,why){for(let i=0;i<75;i++){if(await fn())return;await sleep(70);}throw Error('Timeout: '+why);}
const response=n=>({humanOnly:true,ranked:false,modes:{
 '1v1':{waiting:n,confirming:0,needed:2},'2v2':{waiting:0,confirming:0,needed:4},
 '3v3':{waiting:0,confirming:0,needed:6},'4v4':{waiting:0,confirming:0,needed:8}
}});
(async()=>{
 const app=createServer({peerHosting:false,dataDir:null}),{port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(()=>{
   const originalFetch=fetch.bind(window);
   window.__deadline=[];window.__oldBody=null;
   const originalTimeout=setTimeout.bind(window);
   window.setTimeout=(cb,ms,...args)=>{
    if(ms===5000)window.__deadline.push(cb);
    return originalTimeout(cb,ms,...args);
   };
   window.fetch=(url,opts)=>url==='/api/quick-match/availability'?
     Promise.resolve({ok:true,json:()=>new Promise(resolve=>window.__oldBody=resolve)}):
     originalFetch(url,opts);
  });
  const refresh=page.locator('.quick-queue-availability-actions button');
  await refresh.click();
  await until(()=>page.evaluate(()=>!!window.__oldBody&&window.__deadline.length>0),'hung JSON body');
  assert.equal(await refresh.isDisabled(),true,'pending refresh visible to user');
  await page.evaluate(()=>window.__deadline.at(-1)());
  await until(async()=>!(await refresh.isDisabled()),'five-second deadline restores refresh control');
  assert.match(await page.locator('.quick-queue-availability').innerText(),
   /unavailable|retry|timed out/i,'no verified human queue claim after body timeout');
  await page.evaluate(()=>{
   window.fetch=(url,opts)=>url==='/api/quick-match/availability'?
    Promise.resolve({ok:true,json:async()=>({humanOnly:true,ranked:false,modes:{
     '1v1':{waiting:2,confirming:0,needed:2},
     '2v2':{waiting:0,confirming:0,needed:4},
     '3v3':{waiting:0,confirming:0,needed:6},
     '4v4':{waiting:0,confirming:0,needed:8}}})}):
    window.__otherFetch?.(url,opts);
  });
  await refresh.click();
  await until(async()=>/2 waiting/.test(await page.locator('.quick-queue-modes').innerText()),'manual retry recovers verified queue');
  await page.evaluate(()=>window.__oldBody({humanOnly:true,ranked:false,modes:{
   '1v1':{waiting:12,confirming:0,needed:2},
   '2v2':{waiting:0,confirming:0,needed:4},
   '3v3':{waiting:0,confirming:0,needed:6},
   '4v4':{waiting:0,confirming:0,needed:8}}}));
  await sleep(150);
  assert.match(await page.locator('.quick-queue-modes').innerText(),/2 waiting/,
   'late expired body cannot replace newer server-verified queue occupancy');
  assert.deepEqual(errors,[],'no real browser runtime errors');
  console.log('PASS Chromium: hung queue JSON deadline, manual retry, new verified occupancy, stale completion ignored');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
