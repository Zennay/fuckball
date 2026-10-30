'use strict';
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=11000,what='condition'){const stop=Date.now()+ms;while(Date.now()<stop){if(await fn())return;await wait(70);}throw Error('Timed out: '+what);}
(async()=>{const app=createServer({peerHosting:false,dataDir:null}),{port}=await app.listen(0),br=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
try{
 const page=async()=>{const p=await br.newPage();p.on('pageerror',e=>errors.push(e.message));return p};
 const A=await page(),B=await page(),base='http://127.0.0.1:'+port+'/';
 await A.goto(base);await A.evaluate(()=>connectServer(true));
 await until(()=>A.evaluate(()=>!!serverLink?.room),10000,'host room');const room=await A.evaluate(()=>serverLink.room);
 await B.goto(base+'?room='+room);await B.click('#joinGuest');await until(()=>B.evaluate(()=>!!serverLink?.room),10000,'guest room');
 const r=app.rooms.get(room);assert(r);
 await A.evaluate(()=>serverLink.send({type:'configure',mode:'bot',started:true}));
 await until(()=>r.started,10000,'native game start');
 await until(()=>A.evaluate(()=>serverLink?.roomState?.started===true),6000,'room packet reports started play');
 r.hb.onTeamVictory();
 await until(()=>A.evaluate(()=>!!serverLink?.roomState?.lastResult),10000,'host receives native match result');
 await until(()=>B.evaluate(()=>!!serverLink?.roomState?.lastResult),10000,'guest receives native result');
 assert.equal(await A.evaluate(()=>serverLink.roomState.started),false,'native room packet says full-time has stopped');
 await until(()=>A.locator('.play-postmatch-request').evaluate(e=>!e.hidden),8000,'full-time ribbon available');
 await A.locator('.play-postmatch-request').evaluate(e=>e.click());
 await until(()=>!!r.rematch,5000,'real server rematch proposal');
 assert.equal(r.rematch.required.size,2,'two human players must approve');
 assert.equal(r.rematch.accepted.size,1,'host starts with own consent');
 // A spectator is not a voter. Their connection loss must not erase a
 // consent-critical proposal between two real connected human players.
 const C=await page();await C.goto(base+'?room='+room);await C.click('#joinGuest');
 await until(()=>C.evaluate(()=>!!serverLink?.room),10000,'spectator joins after full-time');
 const spectatorId=await C.evaluate(()=>networkPlayerId);
 assert.equal(r.hb.getPlayer(spectatorId)?.team,0,'late joiner is a true spectator');
 assert.equal(r.rematch.required.size,2,'spectator never becomes a rematch voter');
 await C.close();
 await until(()=>r.disconnected.has(spectatorId)||!r.clients.has(spectatorId),7000,'spectator connection dropped');
 assert(r.rematch,'spectator disconnect must preserve the active rematch ballot');
 assert.equal(r.rematch.accepted.size,1,'no added or forged consent after spectator leaves');
 // Raw native host traffic must not skip a pending second-human rematch vote.
 await A.evaluate(()=>{window.rematchBypassErrors=[];serverLink.ws.addEventListener('message',e=>{try{const packet=JSON.parse(e.data);if(packet.type==='error')window.rematchBypassErrors.push(packet.message)}catch{}})});
 for(const packet of [{type:'start'},{type:'configure',started:true},{type:'newGame'},{type:'swap'},{type:'addBot',team:0}]){
  const before=await A.evaluate(()=>window.rematchBypassErrors.length);
  await A.evaluate(p=>serverLink.send(p),packet);
  await until(()=>A.evaluate(n=>window.rematchBypassErrors.length>n,before),5000,'explicit server rejection for '+packet.type);
  assert.equal(r.started,false,packet.type+' must not bypass rematch consent');
  assert(r.rematch,'original rematch proposal stays pending');
  assert.equal(r.rematch.accepted.size,1,'guest vote remains unaccepted');
  assert(r.lastResult,'result receipt remains authoritative');
 }
 await until(()=>B.evaluate(()=>!document.getElementById('rematchAccept').hidden),5000,'guest consent button');
 await B.evaluate(()=>document.getElementById('rematchAccept').click());
 await until(()=>r.started&&r.round>1,8000,'two-human server accepted rematch');
 await until(()=>A.evaluate(()=>serverLink?.roomState?.started&&!serverLink.roomState.lastResult),7000,'new native round on host');
 assert.equal(r.rematch,null,'server vote cleared');
 // Explicit decline permits a normal new game; no forced rematch or stuck room.
 r.hb.onTeamVictory();
 await until(()=>!r.started&&!!r.lastResult,5000,'next full-time result');
 await A.evaluate(()=>serverLink.send({type:'rematchRequest'}));
 await until(()=>!!r.rematch,5000,'second consent proposal');
 const secondVote=r.rematch.id;
 await B.evaluate(id=>serverLink.send({type:'rematchVote',id,accept:false}),secondVote);
 await until(()=>r.rematch===null,5000,'explicit guest declines rematch');
 assert.equal(r.started,false,'decline does not silently restart');
 const beforeNewGame=r.round;
 await A.evaluate(()=>serverLink.send({type:'newGame'}));
 await until(()=>r.started&&r.round>beforeNewGame,5000,'host chooses new game after decline');
 assert.equal(r.rematch,null,'no obsolete vote crosses a fresh round');
 // Actual voter disconnect still invalidates the vote: a former decision
 // never silently covers a player who needs to reconnect and decide again.
 r.hb.onTeamVictory();
 await until(()=>!r.started&&!!r.lastResult,5000,'third completed round');
 await A.evaluate(()=>serverLink.send({type:'rematchRequest'}));
 await until(()=>r.rematch?.required.size===2,5000,'third full human vote');
 const votingGuestId=await B.evaluate(()=>networkPlayerId);
 await B.close();
 await until(()=>r.disconnected.has(votingGuestId)||!r.clients.has(votingGuestId),7000,'voting guest disconnected');
 assert.equal(r.rematch,null,'actual voting player leaving invalidates vote');
 assert.equal(r.started,false,'no restart without genuine second human');
 assert.deepEqual(errors,[],'no JS page errors');
 console.log('PASS native victory-callback driven real WebSocket 2-browser flow: admitted host/guest -> native onGameVictory -> postgame ribbon -> native rematch proposal -> second human consent -> authoritative new round');
}finally{await br.close();await app.close();}})().catch(e=>{console.error(e);process.exit(1)});
