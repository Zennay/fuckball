'use strict';
// Real localhost WebSocket end-to-end acceptance for the player-facing 4v4
// substitution UI. All browsers are deterministic canvas/DOM VM clients;
// no production host, Docker, third-party URL or real account is contacted.
const assert=require('node:assert/strict');
const {createApp}=require('./app-smoke.cjs');
const {createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,what){
 for(let i=0;i<250;i++){if(fn())return fn();await wait(20);}
 throw Error('Timed out: '+what);
}
function configure(app,url){
 app.win.WebSocket=WebSocket;
 app.win.location.protocol='http:';
 app.elements.get('serverAddress').value=url;
}
async function joinHuman(url,room,sockets,index){
 const ws=new WebSocket(url),messages=[];
 ws.onmessage=e=>{if(typeof e.data==='string')messages.push(JSON.parse(e.data));};
 sockets.push(ws);
 await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail;});
 ws.send(JSON.stringify({type:'join',room,name:'Member '+index,netcode:3}));
 await until(()=>messages.find(x=>x.type==='welcome'),'raw guest '+index+' welcome');
 return ws;
}
(async()=>{
 const server=createServer({peerHosting:false}),addr=await server.listen(0);
 const url='ws://127.0.0.1:'+addr.port+'/ws',sockets=[];
 const a=createApp();let b=null;
 try{
  configure(a,url);
  a.elements.get('createServerRoom').click();
  await until(()=>a.evalJS('peerConnected&&!!serverLink?.room'),'host joined');
  const id=a.evalJS('serverLink.room'),r=server.rooms.get(id);
  assert.equal(a.evalJS('networkPlayerId'),1);
  // Fill exactly eight active human slots, then join a ninth as a spectator.
  for(let n=2;n<=8;n++)await joinHuman(url,id,sockets,n);
  assert.equal(r.hb.getPlayerList().filter(p=>p.team===1).length,4);
  assert.equal(r.hb.getPlayerList().filter(p=>p.team===2).length,4);
  const host='127.0.0.1:'+addr.port;
  const location={hostname:'127.0.0.1',host,protocol:'http:',origin:'http://'+host,pathname:'/',search:'?room='+id,href:'http://'+host+'/?room='+id};
  b=createApp({location,globals:{WebSocket,history:{replaceState(){}}}});
  b.elements.get('joinGuest').click();
  await until(()=>b.evalJS('peerConnected&&!!serverLink?.room'),'spectator joined using invite');
  assert.equal(b.evalJS('networkPlayerId'),9);
  assert.equal(r.hb.getPlayer(9).team,0);
  await until(()=>!a.elements.get('subPanel').hidden&&!b.elements.get('subPanel').hidden,'online substitution menu visible');
  assert.equal(b.elements.get('subAssignBench').disabled,true,'spectator cannot assign bench from UI');
  assert.equal(b.elements.get('subAppointCaptain').disabled,true,'spectator cannot appoint captain');
  assert.equal(b.elements.get('subPropose').disabled,true,'spectator cannot nominate unassigned swaps');
  assert.equal(b.elements.get('subConsent').hidden,true,'no unrequested acceptance control');

  a.elements.get('subTeam').value='1';a.elements.get('subTeam').onchange();
  await until(()=>a.elements.get('subBenchPlayer').children.some(x=>x.value==='9'),'spectator in host bench selector');
  a.elements.get('subBenchPlayer').value='9';
  a.elements.get('subAssignBench').click();
  await until(()=>r.benches.get(9)===1,'host assigned guest to red bench');
  await until(()=>a.elements.get('subInPlayer').children.some(x=>x.value==='9'),'bench appears as valid incoming');
  a.elements.get('subCaptainPlayer').value='3';
  a.elements.get('subAppointCaptain').click();
  await until(()=>r.captains.get(1)===3,'host appointed own-team captain');

  a.elements.get('subOutPlayer').value='1';
  a.elements.get('subInPlayer').value='9';
  a.elements.get('subPropose').click();
  await until(()=>r.pendingSubs.get(1)?.inId===9,'host proposed spectator swap');
  await until(()=>!b.elements.get('subConsent').hidden,'incoming guest sees consent prompt');
  assert.equal(b.elements.get('subConsentText').textContent.includes('Red'),true);
  b.elements.get('subApprove').click();
  await until(()=>r.hb.getPlayer(9).team===1,'guest approved pregame substitution');
  assert.equal(r.hb.getPlayer(1).team,0);
  assert.equal(r.benches.get(1),1);
  assert.equal(r.captains.get(1),3);
  assert.equal(r.clients.size,9);
  assert.equal(r.sockets.size,9);

  // Owner becomes the next entrant. Consent alone during a live game cannot
  // promote them; the server must receive a real pause from the host.
  a.elements.get('startButton').click();
  await until(()=>r.started,'host started real game');
  // Room menu displays server-sourced time updates while the match is
  // running, without requiring a goal, pause or room refresh.
  await until(()=>r.activeFrames.get(9)>=60,'active entrant accrues one second');
  await until(()=>/Your active time: [1-9][0-9]*\.[0-9]s/.test(
    b.elements.get('subSummary').textContent),'entrants live play clock updates in spectator UI');
  assert.match(a.elements.get('subSummary').textContent,/Your active time: 0\.0s/,
    'benched former host must not be credited playing time');
  await until(()=>a.elements.get('subInPlayer').children.some(x=>x.value==='1'),'former host appears on red bench');
  a.elements.get('subOutPlayer').value='9';
  a.elements.get('subInPlayer').value='1';
  a.elements.get('subPropose').click();
  await until(()=>r.pendingSubs.get(1)?.inId===1,'second swap requested from menu');
  await until(()=>!a.elements.get('subConsent').hidden,'host on bench sees own consent prompt');
  a.elements.get('subApprove').click();
  await until(()=>r.pendingSubs.get(1)?.accepted===true,'entrant accepted live swap');
  assert.equal(r.hb.getPlayer(1).team,0,'accepted live swap remains benched');
  assert.equal(r.hb.getPlayer(9).team,1,'incumbent remains on field');
  a.evalJS('togglePause()');
  await until(()=>r.paused&&r.hb.getPlayer(1).team===1,'server pause executes accepted swap');
  assert.equal(r.hb.getPlayer(9).team,0);
  assert.equal(r.pendingSubs.size,0);
  assert.equal(r.clients.size,9);
  assert.equal(r.sockets.size,9);
  assert.equal(r.hb.getPlayerList().filter(p=>p.team===1).length,4);
  assert.equal(r.hb.getPlayerList().filter(p=>p.team===2).length,4);
  await until(()=>b.elements.get('subConsent').hidden,'accepted request cannot remain actionable');
  console.log('PASS real WS online UI: 9 humans, bench/captain, own-socket consent, pause-gated swap, unchanged rooms');
 }finally{
  for(const app of [a,b])if(app)try{app.evalJS('disconnect();room.destroy()');}catch{}
  sockets.forEach(s=>s.close());
  await server.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
