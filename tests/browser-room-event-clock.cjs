'use strict';
// Real headless Custom Room and two Chromium clients, synthetic device clock offsets.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let n=0;n<150;n++){if(await fn())return;await sleep(80);}throw Error('Timed out: '+label)}
(async()=>{const app=createServer({peerHosting:false,dataDir:null}),{port}=await app.listen(0);
const br=await chromium.launch({headless:true,args:['--no-sandbox']});
try{const errors=[],make=async()=>{const p=await br.newPage();p.on('pageerror',e=>errors.push(e.message));return p};
const A=await make(),B=await make(),base='http://127.0.0.1:'+port+'/';
await A.goto(base);await A.evaluate(()=>connectServer(true));
await until(()=>A.evaluate(()=>!!serverLink?.room),'host room');
const code=await A.evaluate(()=>serverLink.room);
await B.goto(base+'?room='+code);await B.click('#joinGuest');
await until(()=>B.evaluate(()=>!!serverLink?.roomServerClock),'guest with server receipt');
const id=await B.evaluate(()=>networkPlayerId);
await A.evaluate(id=>serverLink.send({type:'team',id,team:0}),id);
await until(()=>app.rooms.get(code).hb.getPlayer(id)?.team===0,'host authoritatively moves guest to neutral spectator');
await A.evaluate(()=>{window.__wallOriginal=Date.now;Date.now=()=>__wallOriginal()+360000;document.getElementById('matchView').hidden=false});
await B.evaluate(()=>{window.__wallOriginal=Date.now;Date.now=()=>__wallOriginal()-360000;document.getElementById('matchView').hidden=false});
await B.evaluate(()=>serverLink.send({type:'spectatorCheer',kind:'clap'}));
await until(()=>A.locator('.spectator-cheer-feed').evaluate(e=>e.childElementCount===1),'host sees accepted cheer');
await until(()=>B.locator('.spectator-cheer-feed').evaluate(e=>e.childElementCount===1),'spectator sees server echo');
assert.match(await A.locator('.spectator-cheer-feed').innerText(),/is cheering/);
assert.match(await B.locator('.spectator-cheer-feed').innerText(),/is cheering/);
// The same actual room must still honor the 30s native team pause request
// despite +6min host and -6min guest browser clocks.
await A.evaluate(id=>serverLink.send({type:'team',id,team:2}),id);
await until(()=>app.rooms.get(code).hb.getPlayer(id)?.team===2,'guest placed on Blue');
await A.evaluate(()=>serverLink.send({type:'configure',mode:'bot',started:true}));
await until(()=>app.rooms.get(code).started,'real native match starts');
await B.evaluate(()=>serverLink.send({type:'selfPauseRequest'}));
await until(()=>A.evaluate(()=>!!serverLink?.roomState?.pauseRequest),'server pause request reaches host');
await until(()=>A.locator('.self-bench-pause-prompt').evaluate(e=>!e.hidden),
 'host sees authoritative 30-second pause prompt despite +6min clock');
assert.match(await A.locator('.self-bench-pause-prompt').innerText(),/pause/i);
// The host's real pause prompt must be based on the server's 30-second receipt,
// not on either browser wall clock. Referee UI uses the same server-time helper.
await A.evaluate(()=>{Date.now=__wallOriginal});await B.evaluate(()=>{Date.now=__wallOriginal});
assert.deepEqual(errors,[],'browser script errors');
console.log('PASS real two Chromium room sockets: server cheer broadcast survives +/-6m device clock skew');
await B.close();await A.close();
}finally{await br.close();await app.close()}
})().catch(e=>{console.error(e);process.exit(1)});
