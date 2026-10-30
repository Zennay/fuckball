'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let n=0;n<150;n++){if(await fn())return;await sleep(80)}throw Error('Timeout '+label)}
(async()=>{
const app=createServer({peerHosting:false,dataDir:null}),{port}=await app.listen(0),br=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
const errors=[],page=async()=>{const p=await br.newPage();p.on('pageerror',e=>errors.push(e.message));return p};
const a=await page(),b=await page(),url='http://127.0.0.1:'+port+'/';
a.on('dialog',d=>d.accept());
await a.goto(url);await a.evaluate(()=>connectServer(true));
await until(()=>a.evaluate(()=>serverLink?.roomState?.matchFormatOptions?.length===4),'host');
const code=await a.evaluate(()=>serverLink.room);
await b.goto(url+'?room='+code);await b.click('#joinGuest');
await until(()=>b.evaluate(()=>serverLink?.roomState?.matchFormatOptions?.length===4),'guest');
const options=await a.evaluate(()=>serverLink.roomState.matchFormatOptions);
const round=await a.evaluate(()=>serverLink.roomState.round);
await a.evaluate(()=>{window.__wall=Date.now;Date.now=()=>__wall()+360000});
await b.evaluate(()=>{window.__wall=Date.now;Date.now=()=>__wall()-360000});
const vote=async p=>p.evaluate(()=>{const i=document.querySelector('.native-match-format-choices input[value="0"]');
i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}));
document.querySelector('.native-match-format-actions button:first-child').click()});
await until(()=>b.evaluate(()=>document.querySelectorAll('.native-match-format-choices input').length===4&&
 !document.querySelector('.native-match-format-actions button').disabled),'guest enabled');
await until(()=>a.evaluate(()=>document.querySelectorAll('.native-match-format-choices input').length===4),'host rendered');
await vote(b);
const id=await b.evaluate(()=>networkPlayerId);
await until(()=>b.evaluate(id=>serverLink.roomState.matchFormatVotes.some(v=>v[0]===id&&v[1]===0),id),'guest vote');
await vote(a);
await until(()=>a.evaluate(()=>serverLink.roomState.matchFormatWinner===0),'winner');
await until(()=>a.evaluate(()=>!document.querySelector('.native-match-format-actions button:nth-child(3)').disabled),'apply enabled');
await a.evaluate(()=>document.querySelector('.native-match-format-actions button:nth-child(3)').click());
await until(()=>a.evaluate(x=>serverLink.roomState.round!==x.round&&
serverLink.roomState.timeLimit===x.minutes&&serverLink.roomState.scoreLimit===x.goals,
{round,minutes:options[0].minutes,goals:options[0].goals}),'host apply');
await until(()=>b.evaluate(round=>serverLink?.roomState?.round!==round,round),'guest sees new round');
await sleep(1200);
await until(()=>b.evaluate(()=>!document.querySelector('.native-match-format-actions button')?.disabled),'new lobby');
await b.evaluate(()=>{const send=serverLink.send.bind(serverLink);window.__send=send;
serverLink.send=d=>d.type==='matchFormatVote'?undefined:send(d);
const i=document.querySelector('.native-match-format-choices input[value="1"]');
i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}));
document.querySelector('.native-match-format-actions button:first-child').click();
Date.now=()=>__wall()+360000});
await sleep(1250);
assert.match(await b.locator('.native-match-format-status').innerText(),/waiting for server-confirmed/i,
'wall clock jump must not trigger false timeout');
assert.equal(await b.evaluate(id=>serverLink.roomState.matchFormatVotes.some(v=>v[0]===id),id),false);
await sleep(3400);
assert.match(await b.locator('.native-match-format-status').innerText(),/No server vote update/i);
await b.evaluate(()=>{serverLink.send=__send;Date.now=__wall});
await a.evaluate(()=>{Date.now=__wall});
// A second real two-human vote tests the host's distinct apply receipt.
await vote(b);
await until(()=>b.evaluate(id=>serverLink.roomState.matchFormatVotes.some(v=>v[0]===id),id),'second guest vote');
await vote(a);
await until(()=>a.evaluate(()=>serverLink.roomState.matchFormatWinner===0),'second winner');
await until(()=>a.evaluate(()=>!document.querySelector('.native-match-format-actions button:nth-child(3)').disabled),'second host apply enabled');
const before=await a.evaluate(()=>serverLink.roomState.round);
await a.evaluate(()=>{
const send=serverLink.send.bind(serverLink);window.__applySend=send;
serverLink.send=d=>d.type==='matchFormatApply'?undefined:send(d);
document.querySelector('.native-match-format-actions button:nth-child(3)').click();
Date.now=()=>__wall()-360000;
});
await sleep(1250);
assert.match(await a.locator('.native-match-format-status').innerText(),/Host request sent/i,
 'host apply must await a real native server receipt despite clock jump');
assert.equal(await a.evaluate(()=>serverLink.roomState.round),before);
await sleep(3400);
assert.match(await a.locator('.native-match-format-status').innerText(),/No host action receipt/i);
await a.evaluate(()=>{serverLink.send=__applySend;Date.now=__wall});
assert.deepEqual(errors,[]);
console.log('PASS real two-human format vote, host apply, lost receipt and +/-6m clock');
await b.close();await a.close();
}finally{await br.close();await app.close()}
})().catch(e=>{console.error(e);process.exit(1)});
