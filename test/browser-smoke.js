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
    assert.equal(await page.locator('#extrapValue').textContent(),'135 ms');
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
    await page.locator('#fullscreenHint').click();
    const fullscreen=await page.evaluate(()=>Boolean(document.fullscreenElement)||document.getElementById('appShell').classList.contains('is-maximized'));
    assert.equal(fullscreen,true,'fullscreen requires a click and should then activate');
    assert.deepEqual(errors,[],'browser must not throw JavaScript errors');
    await page.screenshot({path:'fuckball-immersive-smoke.png'});
    console.log('PASS: 1440x900 viewport, Escape options, 135/175/140ms extrap, bot chat, fullscreen');
  }finally{
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
})().catch(err=>{console.error(err);process.exitCode=1;server.kill('SIGTERM');});
