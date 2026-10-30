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
  // Backgrounding invalidates *displayed* real-human counts immediately,
  // even without a server response or a reconnect. Returning must fetch
  // fresh evidence before showing any numbers again.
  await page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,value:true});
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
   document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.doesNotMatch(await page.locator('.quick-queue-modes').innerText(),/2 waiting/,
   'hidden tab cannot retain verified player occupancy');
  assert.match(await page.locator('.quick-queue-availability').innerText(),/paused/i);
  await page.evaluate(()=>{
   Object.defineProperty(document,'hidden',{configurable:true,value:false});
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await until(async()=>/2 waiting/.test(await page.locator('.quick-queue-modes').innerText()),
   'foreground refresh restores real verified occupancy');
  // Some browsers/credential managers commit a selected server with only a
  // change event. Never leave counts from the previous endpoint visible.
  await page.evaluate(()=>{
   const selected=document.getElementById('serverAddress');
   selected.value='ws://another-server.invalid/ws';
   selected.dispatchEvent(new Event('change',{bubbles:true}));
  });
  assert.doesNotMatch(await page.locator('.quick-queue-modes').innerText(),/2 waiting/,
   'server selection change must immediately invalidate old human counts');
  await page.evaluate(()=>{
   const selected=document.getElementById('serverAddress');
   selected.value=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
   selected.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await until(async()=>/2 waiting/.test(await page.locator('.quick-queue-modes').innerText()),
   'same-site server reselect loads real human counts again');
  // In-app Games navigation hides the Play view without a browser-level
  // visibilitychange. Returning must revoke stale occupancy until refreshed.
  await page.evaluate(()=>document.getElementById('tabReplay').click());
  await until(()=>page.evaluate(()=>document.getElementById('homeView').hidden),
   'My Games hides Play view');
  assert.doesNotMatch(await page.locator('.quick-queue-modes').innerText(),/2 waiting/,
   'in-app navigation cannot retain stale human occupancy');
  await page.evaluate(()=>document.getElementById('tabHome').click());
  await until(async()=>/2 waiting/.test(await page.locator('.quick-queue-modes').innerText()),
   'return to Play refreshes actual human queue');
  // A real 15-second human ready check must remain actionable when the
  // player immediately enters My Games; the dock must not wait for the
  // one-second queue refresh interval to notice that Home was hidden.
  await page.evaluate(()=>{
   settings.account={token:'synthetic-ready-fixture'};
   connectServer=()=>true;
   if(!window.startPartyQuickMatch('2v2'))throw Error('could not start synthetic search');
   const now=Date.now();
   window.onQuickMatchEvent({type:'queueReady',id:'local-ready',mode:'2v2',
     players:4,humanOnly:true,expiresAt:now+15000,serverNow:now});
   document.getElementById('tabReplay').click();
  });
  await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),false,
   '15s human ready confirmation is immediately visible inside My Games');
  assert.equal(await page.locator('.quick-ready-dock button.primary').isEnabled(),true,
   'human accept action is visible and still requires explicit consent');
  await page.evaluate(()=>document.getElementById('tabHome').click());
  await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),true,
   'returning to Play hides redundant ready dock');
  assert.equal(await page.locator('.quick-ready').evaluate(e=>e.hidden),false,
   'original server-owned ready card remains available');
  assert.deepEqual(errors,[],'no real browser runtime errors');
  console.log('PASS Chromium: human queue truthfulness and 15s ready visibility across My Games navigation');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
