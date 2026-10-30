'use strict';
// Synthetic admitted room only. Real Chromium clipboard permission can hang;
// users must recover and newer room/session choices must win.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,msg){for(let i=0;i<90;i++){if(await fn())return;await wait(70);}throw Error('Timeout: '+msg);}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null}),{port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(()=>{
   window.__writes=[];window.__deadlines=[];
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:value=>new Promise(resolve=>window.__writes.push({value,resolve}))}});
   const nativeTimeout=setTimeout.bind(window);
   window.setTimeout=(callback,ms,...args)=>{
    if(ms===7000)window.__deadlines.push(callback);
    return nativeTimeout(callback,ms,...args);
   };
   // This is UI-only synthetic admitted state; no real room or join is created.
   serverLink={room:'BCDFGHJK',ws:{readyState:1},roomControl:{listed:false}};
   window.dispatchEvent(new Event('fuckball:native-session-state'));
  });
  await page.locator('#tabReplay').click();
  const home=page.locator('#gamesView .room-invite-view-card');
  await until(()=>home.isVisible(),'synthetic admitted room view');
  const buttons=home.locator('.room-invite-view-actions button');
  const feedback=home.locator('.room-invite-view-message');
  await buttons.nth(0).click();
  await until(()=>page.evaluate(()=>window.__writes.length===1),'initial clipboard write');
  await until(()=>page.evaluate(()=>window.__deadlines.length>=1),'bounded clipboard write deadline');
  await page.evaluate(()=>window.__deadlines[0]());
  await until(async()=>/timed out|manually|copy manually|clipboard/i.test(await feedback.textContent()),'timeout gives manual fallback');
  const field=home.locator('input[aria-label="Current online Custom Room invite link"]');
  const selected=await field.evaluate(el=>[el.selectionStart,el.selectionEnd,el.value.length]);
  assert.deepEqual(selected,[0,selected[2],selected[2]],'manual link selected after clipboard timeout');
  await wait(1150);
  assert.equal(await field.evaluate(el=>el.selectionEnd),selected[2],'background room refresh preserves manual selection');
  await buttons.nth(0).click();
  await until(()=>page.evaluate(()=>window.__writes.length===2),'fresh clipboard retry');
  await page.evaluate(()=>window.__writes[1].resolve());
  await until(async()=>/copied/i.test(await feedback.textContent()),'successful retry');
  // Do not let the completion of an old room's pending write declare success.
  await buttons.nth(0).click();
  await until(()=>page.evaluate(()=>window.__writes.length===3),'third write pending');
  await page.evaluate(()=>{serverLink={room:'BCDFGHJK',ws:{readyState:1},roomControl:{locked:true}};window.dispatchEvent(new Event('fuckball:native-session-state'));window.__writes[2].resolve();});
  await wait(120);
  assert.doesNotMatch(await feedback.textContent(),/invite copied/i,'old socket must not claim a new room invitation');
  assert.match(await feedback.textContent(),/room session changed.*clipboard|previous invite/i,'warn if old clipboard write could finish');
  // The full Match menu uses the same bounded clipboard recovery.
  await page.locator('#tabPlay').click();
  await page.evaluate(()=>openMatchMenu('menuMatchPane','menuMatch'));
  const menu=page.locator('.room-invite-center');
  await until(()=>menu.isVisible(),'live room share in Match menu');
  const menuActions=menu.locator('.room-invite-center-actions button');
  const menuStatus=menu.locator('.room-invite-center-status');
  await menuActions.nth(0).click();
  await until(()=>page.evaluate(()=>window.__writes.length===4),'menu link write pending');
  await until(()=>page.evaluate(()=>window.__deadlines.length>=4),'menu write has deadline');
  await page.evaluate(()=>window.__deadlines[3]());
  await until(async()=>/timed out/i.test(await menuStatus.textContent()),'menu invite gives manual fallback');
  await menuActions.nth(1).click();
  await until(()=>page.evaluate(()=>window.__writes.length===5),'menu code retry pending');
  await page.evaluate(()=>window.__writes[4].resolve());
  await until(async()=>/code copied/i.test(await menuStatus.textContent()),'menu room code copy succeeds');
  // Real race: the socket changes just before clicking Copy, before the
  // one-second menu refresh. The new-room attempt must still show its result.
  await page.evaluate(()=>{serverLink={room:'BCDFGHKM',ws:{readyState:1},roomControl:{listed:false}};});
  await menuActions.nth(1).click();
  await until(()=>page.evaluate(()=>window.__writes.length===6),'immediately copy from switched session');
  assert.equal(await page.evaluate(()=>window.__writes[5].value),'BCDFGHKM','share latest socket code');
  await page.evaluate(()=>window.__writes[5].resolve());
  await until(async()=>/code copied/i.test(await menuStatus.textContent()),'new room copy receipt survives synchronous refresh');
  // Real Chromium: a WebView may never invoke canvas.toBlob for the local
  // scannable poster, permanently disabling Save unless export is bounded.
  await page.evaluate(()=>{
   window.__qrExports=[];window.__qrExportDeadline=null;
   const original=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(callback,type){
    if(this.width===1200&&this.height===900){
     window.__qrExports.push(callback);
     if(window.__qrExports.length===1)return;
    }
    return original.call(this,callback,type);
   };
   const timer=window.setTimeout.bind(window);
   window.setTimeout=(callback,ms,...args)=>{
    if(ms===8000)window.__qrExportDeadline=callback;
    return timer(callback,ms,...args);
   };
  });
  await menuActions.nth(3).click();
  const save=menu.locator('.room-invite-qr-download');
  await until(()=>save.isVisible(),'native QR generated in current room');
  await save.click();
  await until(()=>page.evaluate(()=>window.__qrExports.length===1),'local PNG exporter pending');
  await until(()=>page.evaluate(()=>typeof window.__qrExportDeadline==='function'),'bounded poster export deadline');
  await page.evaluate(()=>window.__qrExportDeadline());
  await until(async()=>!await save.isDisabled(),'PNG export timeout permits retry');
  assert.match(await menuStatus.textContent(),/PNG.*timed out|export.*timed out/i,'helpful PNG timeout receipt');
  let downloads=0;page.on('download',()=>downloads++);
  const downloadPromise=page.waitForEvent('download',{timeout:9000});
  await save.click();
  const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'fuckball-room-BCDFGHKM-qr.png','retry exports current synthetic room card');
  await page.evaluate(()=>window.__qrExports[0](new Blob(['late'],{type:'image/png'})));
  await wait(120);
  assert.equal(downloads,1,'late PNG completion cannot trigger a second stale download');
  assert([null,'BCDFGHKM'].includes(await page.evaluate(()=>serverLink?.room??null)),'PNG cannot autojoin another room');
  assert.deepEqual(errors,[],'no browser exceptions');
  assert.equal(await page.evaluate(()=>serverLink.room),'BCDFGHKM','synthetic room change remained UI-only, never autojoined');
  console.log('PASS real Chromium: room share clipboard timeout, manual fallback, retry, stale session ignored');
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
