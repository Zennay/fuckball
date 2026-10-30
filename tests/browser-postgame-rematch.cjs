'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
(async()=>{
 const app=createServer({peerHosting:false}),{port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);
  await page.evaluate(()=>{
   networkPlayerId=2;window.syntheticRematchSends=[];
   serverLink={room:'SYNTHETIC',quickMatchMode:null,isOwner:true,ws:{readyState:1},
    send:d=>window.syntheticRematchSends.push(d),roomState:{room:'SYNTHETIC',round:4,
    started:false,lastResult:{round:4,red:2,blue:1,winner:1,finalPlayers:[]},rematch:null}};
   document.getElementById('homeView').hidden=true;
   document.getElementById('matchView').hidden=false;
   document.getElementById('pauseMenu').hidden=true;
   document.body.classList.remove('menu-open');
   window.dispatchEvent(new Event('fuckball:native-session-state'));
  });
  const button=page.locator('.play-postmatch-request');
  assert.equal(await button.evaluate(e=>e.hidden),false,'native owner sees a direct rematch action');
  await button.evaluate(e=>e.click());
  assert.deepEqual(await page.evaluate(()=>window.syntheticRematchSends.map(d=>d.type)),['rematchRequest']);
  assert.equal(await button.evaluate(e=>e.disabled),true,'in-flight request prevents duplicate send');
  await button.evaluate(e=>e.click());
  assert.equal(await page.evaluate(()=>window.syntheticRematchSends.length),1);
  await page.evaluate(()=>{
   clearPostgameRequest();serverLink.isOwner=false;
   window.dispatchEvent(new Event('fuckball:native-session-state'));
  });
  assert.equal(await button.evaluate(e=>e.hidden),true,'guest cannot create a private rematch');
  await page.evaluate(()=>{
   serverLink.quickMatchMode='1v1';
   window.dispatchEvent(new Event('fuckball:native-session-state'));
  });
  assert.equal(await button.evaluate(e=>e.hidden),false,'human quick-match player may request');
  await button.evaluate(e=>e.click());
  assert.deepEqual(await page.evaluate(()=>window.syntheticRematchSends.map(d=>d.type)),['rematchRequest','quickRematchRequest']);
  await page.evaluate(()=>{serverLink.roomState.rematch={id:12,required:[1,2],accepted:[1],expiresAt:Date.now()+45000};serverLink.quickMatchMode=null;window.dispatchEvent(new Event('fuckball:native-session-state'));});
  assert.equal(await button.evaluate(e=>e.hidden),true,'active proposal blocks repeat');
  await page.evaluate(()=>{clearPostgameRequest();serverLink.roomState.rematch=null;serverLink.quickMatchMode='1v1';serverLink.ws.readyState=3;window.dispatchEvent(new Event('fuckball:native-session-state'))});
  assert.equal(await button.evaluate(e=>e.disabled),true,'no rematch requests on dead socket');
  assert.match(await button.textContent(),/Reconnect to request rematch/);
  await button.evaluate(e=>e.click());
  assert.equal(await page.evaluate(()=>window.syntheticRematchSends.length),2);
  assert.deepEqual(errors,[],'no browser errors');
  await page.evaluate(()=>{clearPostgameRequest();serverLink=null});
  console.log('PASS Chromium postgame rematch ribbon: real native request once, no guest override, quick-match native path, no duplicate proposal (all fixtures synthetic)');
 }finally{await browser.close();await app.close()}
})().catch(e=>{console.error(e);process.exit(1)});
