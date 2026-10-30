'use strict';
// Synthetic queue receipts only; no real users, matchmaking or production server.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
(async()=>{
 const app=createServer({peerHosting:false,dataDir:null});
 const {port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  const prepared=await page.evaluate(port=>{
   document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
   settings.account={token:'synthetic-test-token'};
   connectServer=()=>true;
   window.__sent=[];
   const began=window.startPartyQuickMatch('2v2');
   serverLink={ws:{readyState:1},send:msg=>window.__sent.push(msg),room:null};
   const now=Date.now();
   window.__proposal={type:'queueReady',id:'test-proposal-A',mode:'2v2',players:4,humanOnly:true,expiresAt:now+15000,serverNow:now};
   window.onQuickMatchEvent(window.__proposal);
   return began;
  },port);
  assert.equal(prepared,true,'human search fixture starts only by explicit click');
  const ready=page.locator('.quick-ready');
  await ready.locator('button.primary').click();
  let result=await page.evaluate(()=>({votes:__sent.length,disabled:document.querySelector('.quick-ready .primary').disabled}));
  assert.equal(result.votes,1,'one explicit acceptance sent');
  assert.equal(result.disabled,true,'pending receipt blocks duplicate consent');
  await page.evaluate(()=>window.onQuickMatchEvent({...window.__proposal,expiresAt:Date.now()+60000}));
  result=await page.evaluate(()=>({disabled:document.querySelector('.quick-ready .primary').disabled,text:document.querySelector('.quick-ready-progress').textContent}));
  assert.equal(result.disabled,true,'duplicate proposal must not unlock pending vote');
  assert.match(result.text,/Sending|Waiting/i,'duplicate preserves pending receipt status');
  await page.evaluate(()=>window.onQuickMatchEvent({type:'queueReadyAccepted',id:'test-proposal-A',ready:1}));
  await page.evaluate(()=>window.onQuickMatchEvent({...window.__proposal,expiresAt:Date.now()+60000}));
  result=await page.evaluate(()=>({disabled:document.querySelector('.quick-ready .primary').disabled,text:document.querySelector('.quick-ready-progress').textContent}));
  assert.equal(result.disabled,true,'duplicate cannot reset server-confirmed human consent');
  assert.match(result.text,/Server received your acceptance/i,'confirm remains server-authoritative');
  await page.evaluate(()=>{
   window.onQuickMatchEvent({type:'queueReadyProgress',id:'test-proposal-A',ready:3});
   window.onQuickMatchEvent({type:'queueReadyProgress',id:'test-proposal-A',ready:1});
   window.onQuickMatchEvent({type:'queueReadyAccepted',id:'test-proposal-A',ready:2});
  });
  assert.match(await ready.locator('.quick-ready-progress').textContent(),/3 \/ 4 confirmed/,
   'delayed out-of-order progress/ack cannot erase real accepted votes');
  await page.evaluate(()=>window.onQuickMatchEvent({type:'queueReady',...window.__proposal,id:'test-proposal-B'}));
  result=await page.evaluate(()=>({disabled:document.querySelector('.quick-ready .primary').disabled,text:document.querySelector('.quick-ready-progress').textContent}));
  assert.equal(result.disabled,false,'a genuinely different proposal gets independent explicit consent');
  // The server can cancel a newly formed match before a client has the room
  // receipt. The resulting unadmitted quick-queue WebSocket must be released
  // so a deliberate new search is not blocked by orphan session guards.
  await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:null,ws:{readyState:1,onclose:null,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   window.onQuickMatchEvent({type:'quickMatchCancelled',reason:'A team left before room receipt.'});
  });
  assert.equal(await page.evaluate(()=>serverLink),null,
   'server cancellation before room receipt tears down orphan queue transport');
  assert.equal(await page.evaluate(()=>window.startPartyQuickMatch('2v2')),true,
   'human can explicitly start a fresh search after terminal cancellation');
  // Server cancellation *after* a room receipt is not a leave request.
  // Keep the joined room for a player to inspect and explicitly exit.
  assert.equal(await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:'SYNTHETICROOM',ws:{readyState:1,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   const before=serverLink;
   window.onQuickMatchEvent({type:'quickMatchCancelled',reason:'A player left the room.'});
   return serverLink===before;
  }),true,'cancelled in-room game is not silently disconnected');
  assert.deepEqual(errors,[],'no Chromium runtime errors');
  console.log('PASS Chromium duplicate ready receipts preserve pending and server-confirmed consent; new proposal remains actionable');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
