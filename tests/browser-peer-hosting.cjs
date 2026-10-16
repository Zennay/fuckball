'use strict';
// Real Chromium, real WebRTC data channels, real Web Worker host: two browser pages in one online room.
// The room moves server → page A → server → page A, then page A closes and the server takes over.
// Run: node tests/browser-peer-hosting.cjs (needs the `playwright` package and Chromium).
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=10000,what='condition'){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(50);}throw Error('Timed out: '+what);}
(async()=>{
 let target='server';const app=createServer({peerHosting:true,forceHost:()=>target,migrationCooldown:0,standbyTimeout:800});const {port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
 try{
  const open=async()=>{const ctx=await browser.newContext({viewport:{width:1280,height:800}});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return page;};
  const A=await open(),B=await open(),base='http://127.0.0.1:'+port+'/';
  await A.goto(base);await A.evaluate(()=>connectServer(true));await until(()=>A.evaluate(()=>!!serverLink?.room&&peerConnected),10000,'A creates a room');
  const room=await A.evaluate(()=>serverLink.room);await B.goto(base+'?room='+room);await until(()=>B.evaluate(()=>peerConnected),10000,'B joins by link');
  await A.evaluate(()=>serverLink.send({type:'configure',mode:'bot',started:true}));
  const meshOpen=p=>p.evaluate(()=>{const n=serverLink?.net;return !!n&&[...n.peers.values()].some(x=>x.ch?.readyState==='open');});
  await until(async()=>await meshOpen(A)&&await meshOpen(B),15000,'WebRTC data channel between the pages');
  const ids={A:await A.evaluate(()=>networkPlayerId),B:await B.evaluate(()=>networkPlayerId)};
  const authority=p=>p.evaluate(()=>serverLink.net.authority),seq=p=>p.evaluate(()=>net.receivedSequence);
  const myX=(p,id)=>p.evaluate(id=>room.state.players.find(q=>q.id===id)?.disc?.pos.x??null,id);
  async function moves(page,id,key){if(await page.evaluate(()=>menuOpen)){await page.keyboard.press('Escape');await wait(100);}const x0=await myX(page,id);await page.keyboard.down(key);await wait(700);await page.keyboard.up(key);await wait(300);return Math.abs((await myX(page,id))-x0);}

  // server → A
  target=ids.A;await until(async()=>await authority(A)===ids.A&&await authority(B)===ids.A,15000,'both pages on host A');
  assert.equal(await A.evaluate(()=>serverLink.net.hosting),true,'page A hosts in its worker');assert.equal(app.rooms.get(room).authority,ids.A);
  let s0=await seq(B);await wait(800);assert((await seq(B))-s0>=15,'B keeps receiving snapshots from A (~30/s)');
  assert(await moves(B,ids.B,'ArrowLeft')>20,'B controls its player through A');assert(await moves(A,ids.A,'ArrowRight')>20,'A controls its own player while hosting');
  assert.match(await B.evaluate(()=>$('connectionText').textContent),/Hosted by/);

  // A → server
  target='server';await until(async()=>await authority(A)==='server'&&await authority(B)==='server',15000,'back on the server');
  s0=await seq(B);await wait(800);assert((await seq(B))-s0>=15,'server snapshots resume');assert(await moves(B,ids.B,'ArrowRight')>20,'B controls its player on the server');

  // server → A, then A disappears: failover
  target=ids.A;await until(async()=>await authority(B)===ids.A,15000,'host A again');target='server';
  await A.close();await until(async()=>await authority(B)==='server',15000,'failover after the host closed');
  s0=await seq(B);await wait(800);assert((await seq(B))-s0>=15,'B continues after failover');assert(await moves(B,ids.B,'ArrowLeft')>20,'B still plays');
  assert.deepEqual(errors.filter(e=>!/favicon|ERR_CONNECTION/.test(e)),[],'no page errors');
  console.log('PASS real Chromium peer hosting: WebRTC mesh, worker host, handovers server↔page, players keep control, failover when the hosting page closes');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
