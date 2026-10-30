'use strict';
// Real Chromium: stalled clipboard permissions must not trap the invite UI or
// replace a later human-selected room. All invitation data is synthetic.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,what){for(let i=0;i<90;i++){if(await fn())return;await wait(60);}throw Error('Timeout: '+what);}
(async()=>{
 const server=createServer({peerHosting:false,dataDir:null}),{port}=await server.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  await page.evaluate(()=>{
   window.__clipboardResolvers=[];window.__clipboardDeadline=null;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
    readText:()=>new Promise(resolve=>window.__clipboardResolvers.push(resolve))
   }});
   const timeout=window.setTimeout.bind(window);
   window.setTimeout=(cb,ms,...args)=>{
    if(ms===8000&&typeof cb==='function')window.__clipboardDeadline=cb;
    return timeout(cb,ms,...args);
   };
  });
  const paste=page.locator('.direct-invite-actions button').first();
  const input=page.locator('input[aria-label="Paste same-site room invitation URL or code"]');
  const status=page.locator('.direct-invite-status');
  await paste.click();
  await until(()=>paste.isDisabled(),'clipboard permission pending');
  await input.fill('ABCDEFGH');
  await until(async()=>!(await paste.isDisabled()),'manual edit releases stalled clipboard');
  await page.evaluate(()=>window.__clipboardResolvers[0]('ZZZZZZZZ'));
  await wait(100);
  assert.equal(await input.inputValue(),'ABCDEFGH','late clipboard must not erase human edit');
  await paste.click();
  await until(()=>page.evaluate(()=>window.__clipboardResolvers.length===2),'second clipboard pending');
  await page.locator('#tabPlay').click();
  await until(async()=>!(await paste.isDisabled()),'navigation releases stalled clipboard');
  await page.evaluate(()=>document.getElementById('tabHome').click());
  await paste.click();
  await until(()=>page.evaluate(()=>typeof window.__clipboardDeadline==='function'),'bounded clipboard deadline');
  await page.evaluate(()=>window.__clipboardDeadline());
  await until(async()=>!(await paste.isDisabled()),'timeout releases paste button');
  assert.match(await status.textContent(),/clipboard|paste manually|retry/i,'helpful timeout message');
  await paste.click();
  await until(()=>page.evaluate(()=>window.__clipboardResolvers.length===4),'retry clipboard');
  await page.evaluate(()=>window.__clipboardResolvers[3]('BCDFGHJK'));
  await until(async()=>await input.inputValue()==='BCDFGHJK','valid latest clipboard result');
  assert.equal(await page.evaluate(()=>serverLink?.room||null),null,'no automatic native join');
  assert.deepEqual(errors,[],'browser errors');
  console.log('PASS real Chromium: clipboard permission cancel on edit/navigation, deadline, retry, last human input wins, no autojoin');
 }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
