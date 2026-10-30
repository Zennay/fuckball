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
  // In mobile Chrome, other game panels can widen the *layout* viewport;
  // ensure these fixed, consent-critical controls use the visual viewport.
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));
  await mobile.goto('http://127.0.0.1:'+port);
  await mobile.evaluate(()=>{
   networkPlayerId=2;window.mobileRematchSends=[];
   serverLink={room:'SYNTHETIC',isOwner:true,quickMatchMode:null,ws:{readyState:1},
    send:d=>window.mobileRematchSends.push(d),roomState:{room:'SYNTHETIC',round:6,
    started:false,lastResult:{round:6,red:2,blue:2,winner:0,finalPlayers:[]},rematch:null}};
   document.getElementById('homeView').hidden=true;
   document.getElementById('matchView').hidden=false;
   document.getElementById('pauseMenu').hidden=true;
   document.body.classList.remove('menu-open');
   window.dispatchEvent(new Event('fuckball:native-session-state'));
  });
  const inside=rect=>rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=390&&rect.y+rect.height<=844;
  const mobileRequest=mobile.locator('.play-postmatch-request');
  assert(inside(await mobileRequest.boundingBox()),'mobile rematch CTA fits visual viewport');
  await mobileRequest.tap({timeout:8000});
  assert.deepEqual(await mobile.evaluate(()=>window.mobileRematchSends.map(x=>x.type)),['rematchRequest']);
  await mobile.evaluate(()=>{
   clearPostgameRequest();serverLink.roomState.rematch={id:10,required:[1,2],accepted:[1],expiresAt:Date.now()+45000};
   document.getElementById('matchView').hidden=true;renderGlobalRematchDock();
  });
  const mobileVote=mobile.locator('.native-rematch-dock-actions button.primary');
  assert(inside(await mobileVote.boundingBox()),'mobile consent CTA fits visual viewport');
  await mobileVote.tap({timeout:8000});
  assert.deepEqual(await mobile.evaluate(()=>window.mobileRematchSends.map(x=>x.type)),['rematchRequest','rematchVote']);
  assert.deepEqual(mobileErrors,[],'no mobile browser errors');
  await mobile.evaluate(()=>{clearNativeRematchVote();serverLink=null});
  await mobile.close();
  // Landscape mobile browsers can widen layout CSS pixels beyond the actual
  // visual viewport when another game panel overflows horizontally.
  const landscape=await browser.newPage({viewport:{width:740,height:360},isMobile:true,hasTouch:true});
  await landscape.goto('http://127.0.0.1:'+port);
  await landscape.evaluate(()=>{
   networkPlayerId=2;window.landscapeRematchSends=[];
   serverLink={room:'SYNTHETIC',isOwner:true,quickMatchMode:null,ws:{readyState:1},
    send:d=>window.landscapeRematchSends.push(d),roomState:{room:'SYNTHETIC',round:7,
    started:false,lastResult:{round:7,red:3,blue:1,winner:1,finalPlayers:[]},rematch:null}};
   document.getElementById('homeView').hidden=true;
   document.getElementById('matchView').hidden=false;
   window.dispatchEvent(new Event('fuckball:native-session-state'));
  });
  const fitsVisual=async selector=>landscape.evaluate(s=>{
   const e=document.querySelector(s),r=e?.getBoundingClientRect(),v=visualViewport;
   return !e?.hidden&&!!r&&r.left>=v.offsetLeft&&r.top>=v.offsetTop&&
    r.right<=v.offsetLeft+v.width+.5&&r.bottom<=v.offsetTop+v.height+.5;
  },selector);
  assert(await fitsVisual('.play-postmatch-request'),'landscape rematch CTA must fit visual viewport');
  await landscape.setViewportSize({width:800,height:340});
  assert(await fitsVisual('.play-postmatch-request'),'rotated landscape request remains inside visible screen');
  await landscape.locator('.play-postmatch-request').tap({timeout:8000});
  assert.deepEqual(await landscape.evaluate(()=>window.landscapeRematchSends.map(x=>x.type)),['rematchRequest']);
  await landscape.evaluate(()=>{
   clearPostgameRequest();serverLink.roomState.rematch={id:20,required:[1,2],accepted:[1],expiresAt:Date.now()+45000};
   document.getElementById('matchView').hidden=true;renderGlobalRematchDock();
  });
  assert(await fitsVisual('.native-rematch-dock-actions button.primary'),'landscape consent CTA must fit visual viewport');
  assert(await fitsVisual('.native-rematch-dock-actions button:not(.primary)'),'landscape decline CTA must fit visual viewport');
  await landscape.setViewportSize({width:390,height:844});
  for(let wait=0;wait<30&&!await fitsVisual('.native-rematch-dock-actions button.primary');wait++)await new Promise(r=>setTimeout(r,100));
  assert(await fitsVisual('.native-rematch-dock-actions button.primary'),'consent remains visible when returning to portrait');
  await landscape.locator('.native-rematch-dock-actions button.primary').tap({timeout:8000});
  assert.deepEqual(await landscape.evaluate(()=>window.landscapeRematchSends.map(x=>x.type)),['rematchRequest','rematchVote']);
  await landscape.evaluate(()=>{clearNativeRematchVote();serverLink=null});
  await landscape.close();
  console.log('PASS Chromium postgame rematch ribbon: real native request once, no guest override, quick-match native path, no duplicate proposal, mobile touch request + consent (all fixtures synthetic)');
 }finally{await browser.close();await app.close()}
})().catch(e=>{console.error(e);process.exit(1)});
