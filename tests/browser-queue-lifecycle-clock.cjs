'use strict';
// Real Chromium; queue counts and account are SYNTHETIC fixtures, no external traffic.
const assert=require('node:assert/strict');
const {chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
(async()=>{const app=createServer({peerHosting:false}),{port}=await app.listen(0);
const br=await chromium.launch({headless:true,args:['--no-sandbox']});
try{const p=await br.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto('http://127.0.0.1:'+port);
await p.evaluate(port=>{
 window.__wall=Date.now;window.__mono=performance.now.bind(performance);
 Date.now=()=>__wall()+360000;
 document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
 const fetchReal=window.fetch.bind(window);
 window.fetch=(url,opts)=>url==='/api/quick-match/availability'?
  Promise.resolve({ok:true,json:async()=>({humanOnly:true,ranked:false,modes:{
   '1v1':{waiting:2,confirming:0,needed:2},'2v2':{waiting:1,confirming:0,needed:4},
   '3v3':{waiting:0,confirming:0,needed:6},'4v4':{waiting:0,confirming:0,needed:8}}})}):fetchReal(url,opts);
 document.getElementById('serverAddress').dispatchEvent(new Event('input'));
},port);
await p.locator('.human-queue-watch-controls button').first().evaluate(e=>e.click());
await p.waitForFunction(()=>document.querySelector('.human-queue-watch')?.dataset.watchState==='ready');
assert.equal(await p.locator('#homeView .season-line .status-pill').getAttribute('data-state'),'live');
await p.evaluate(()=>{Date.now=()=>__wall()-360000;window.dispatchEvent(new Event('online'))});
assert.equal(await p.locator('#homeView .season-line .status-pill').getAttribute('data-state'),'live',
 'device clock jump must not invalidate verified queue data');
// Isolate expiry from the fixture's automatic 15s refresh. A new real
// snapshot is expected to be live; the check here is for the old one only.
await p.waitForTimeout(150);
await p.evaluate(()=>{
 const previous=window.fetch;
 window.fetch=(url,opts)=>url==='/api/quick-match/availability'?
  new Promise(()=>{}):previous(url,opts);
 Object.defineProperty(performance,'now',{configurable:true,value:()=>__mono()+26000});
});
// Wait for each component's local freshness tick, not the online event (which
// correctly requests a fresh server snapshot and would reset freshness).
await p.waitForFunction(()=>document.querySelector('#homeView .season-line .status-pill')?.dataset.state==='unknown',{},{timeout:9000});
assert.equal(await p.locator('#homeView .season-line .status-pill').getAttribute('data-state'),'unknown',
 'monotone expiry clears stale verified occupancy');
await p.locator('.quick-queue-pulse button.primary').evaluate(e=>e.click());
assert.match(await p.locator('.quick-queue-status').innerText(),/snapshot expired/i,
 'stale pulse never starts a human queue');
await p.evaluate(()=>{
 Object.defineProperty(performance,'now',{configurable:true,value:__mono});
 settings.account={token:'synthetic-ui-fixture'};
 connectServer=()=>true;
 window.startPartyQuickMatch('2v2');
});
await p.waitForTimeout(1200);
const status=await p.locator('.quick-queue-status').innerText();
assert.match(status,/\b[012]s elapsed\b/,'queue elapsed stays accurate under -6m clock: '+status);
assert.deepEqual(errors,[],'no browser errors');
console.log('PASS Chromium: live queue, wall-clock jump, monotone 25s freshness, pulse reject and search elapsed');
await p.close();}finally{await br.close();await app.close()}
})().catch(e=>{console.error(e);process.exit(1)});
