'use strict';
// Real Chromium against the real server: the UDP-style data channel opens, carries
// snapshots, inputs and pings, inputs are acknowledged, and the HUD says UDP.
// Skips (exit 0) when Playwright or the optional node-datachannel is not installed.
const assert=require('node:assert/strict'),{execSync}=require('node:child_process');
let chromium;try{({chromium}=require('playwright'));}catch{try{({chromium}=require(execSync('npm root -g').toString().trim()+'/playwright'));}catch{}}
const RTC=require('../headless/rtc.cjs');
if(!chromium||!RTC.available){console.log('SKIP WebRTC browser test (needs playwright and node-datachannel)');process.exit(0);}
const{createServer}=require('../headless/server.cjs');
(async()=>{const app=createServer(),addr=await app.listen(0,'127.0.0.1'),browser=await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH?{}:{});
 try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+addr.port+'/');await page.evaluate(()=>connectServer(true));
  await page.waitForFunction(()=>serverLink?.dc?.readyState==='open',null,{timeout:15000});
  const client=[...[...app.rooms.values()][0].clients.keys()][0];assert(client.rtc?.ready,'server sends on the data channel');
  await page.evaluate(()=>serverLink.send({type:'configure',mode:'bot',started:true}));await page.waitForFunction(()=>started&&net.lastSnapshot>0);
  const x0=await page.evaluate(()=>room.state.players.find(p=>p.id===networkPlayerId).disc.pos.x);
  await page.evaluate(()=>closeMatchMenu?.());await page.mouse.click(5,5);await page.keyboard.down('ArrowRight');await page.waitForTimeout(500);await page.keyboard.up('ArrowRight');
  await page.waitForFunction(()=>predictor.pending.length===0&&predictor.pingClock.size>0);
  const r=await page.evaluate(()=>({x:room.state.players.find(p=>p.id===networkPlayerId).disc.pos.x,hud:document.getElementById('netStats').textContent}));
  assert(r.x>x0+5,'input over UDP moved the player on the server');assert.match(r.hud,/^UDP/);assert.deepEqual(errors,[]);
  console.log('PASS real Chromium opens the UDP data channel to the server; snapshots, inputs and pings use it and inputs are acknowledged');
 }finally{await browser.close();await app.close();}})().catch(e=>{console.error(e);process.exit(1);});
