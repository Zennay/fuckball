'use strict';
// Real Chromium smoke test: checks the immersive layout and interaction flow,
// not just the Node DOM simulator used in render.test.js.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const port=3469;
const server=spawn(process.execPath,['server.js'],{
  cwd:require('node:path').resolve(__dirname,'..'),
  env:{...process.env,PORT:String(port)},stdio:'pipe'
});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForServer(){
  for(let i=0;i<50;i++){
    try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok)return;}catch{}
    await delay(100);
  }
  throw Error('Local server did not start');
}
(async()=>{
  let browser;
  try{
    await waitForServer();
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'networkidle'});
    await page.waitForSelector('#pitch');
    const view=await page.locator('#pitch').boundingBox();
    assert.ok(Math.abs(view.width-1440)<=2,'arena should use entire viewport width');
    assert.ok(Math.abs(view.height-900)<=2,'arena should use entire viewport height');
    assert.equal(await page.locator('#extrapValue').textContent(),'0 ms');
    await page.locator('#optionsToggle').click();
    assert.equal(await page.locator('#optionsScreen').getAttribute('aria-hidden'),'false');
    await page.locator('#extrapNumber').fill('175');
    assert.equal(await page.locator('#extrapValue').textContent(),'175 ms');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#optionsScreen').getAttribute('aria-hidden'),'true');
    await page.locator('#chatText').fill('/extrapolation 140');
    await page.locator('#sendChat').click();
    assert.equal(await page.locator('#extrapValue').textContent(),'140 ms');
    await page.locator('#chatText').fill('how do I shoot?');
    await page.locator('#sendChat').click();
    assert.match(await page.locator('#chatlog').innerText(),/RIVAL AI:.*Space/s);
    // Every offline match size must be selectable in the actual browser.
    await page.locator('#lobbyToggle').click();
    await page.locator('#soloTeams').selectOption('0');
    assert.equal(await page.locator('#roster .playerrow').count(),1,'free training has no AI');
    await page.locator('#soloTeams').selectOption('4');
    assert.equal(await page.locator('#roster .playerrow').count(),8,'4v4 has seven AI players');
    assert.match(await page.locator('#modeTag').textContent(),/4v4/);
    await page.locator('#lobbyToggle').click();
    await page.locator('#fullscreenHint').click();
    const fullscreen=await page.evaluate(()=>Boolean(document.fullscreenElement)||document.getElementById('appShell').classList.contains('is-maximized'));
    assert.equal(fullscreen,true,'fullscreen requires a click and should then activate');
    assert.deepEqual(errors,[],'browser must not throw JavaScript errors');
    await page.screenshot({path:'fuckball-immersive-smoke.png'});
    // Narrow displays must also use every available pixel without horizontal
    // overflow, even with touch controls and the always-available chat dock.
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'networkidle'});
    const mobile=await page.locator('#pitch').boundingBox();
    assert.ok(Math.abs(mobile.width-390)<=2&&Math.abs(mobile.height-844)<=2,
      'mobile pitch should cover the complete 390x844 viewport');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'mobile layout should not scroll sideways');
    await page.screenshot({path:'fuckball-mobile-smoke.png'});
    assert.deepEqual(errors,[],'no browser errors on desktop or mobile');
    console.log('PASS: desktop 1440x900 + mobile 390x844, Escape options, extrapolation, bot chat, 0/1/2/4 bots, fullscreen');
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
})().catch(err=>{console.error(err);process.exitCode=1;server.kill('SIGTERM');});
