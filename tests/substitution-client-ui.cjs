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
  // Simulate a reserved native room seat temporarily disconnected while the
  // server and remaining human sockets stay real. The native server rejects
  // bench mutations for that player; the host must not advertise/send them.
  r.setConnected(9,false);
  await until(()=>a.evalJS('serverLink.roomState?.disconnectedIds?.includes(9)'),
    'native disconnected reserved seat delivered to host');
  assert.equal(a.elements.get('subBenchPlayer').children.some(x=>x.value==='9'),false,
    'reconnecting spectator is excluded from assignable bench choices');
  a.evalJS('window.origRosterSend=serverLink.send;window.heldRosterSends=[];serverLink.send=d=>window.heldRosterSends.push(d)');
  a.elements.get('subBenchPlayer').value='9';
  a.elements.get('subAssignBench').onclick();
  a.elements.get('subClearBench').onclick();
  assert.equal(a.evalJS('window.heldRosterSends.length'),0,
    'stale direct host bench actions must never send for reserved disconnected seat');
  a.evalJS('serverLink.send=window.origRosterSend');
  r.setConnected(9,true);
  await until(()=>a.evalJS('!serverLink.roomState?.disconnectedIds?.includes(9)'),
    'native reserved seat reconnected');
  await until(()=>a.elements.get('subBenchPlayer').children.some(x=>x.value==='9'),
    'reconnected player becomes bench eligible again');
  a.elements.get('subBenchPlayer').value='9';
  a.elements.get('subAssignBench').click();
  await until(()=>r.benches.get(9)===1,'host assigned guest to red bench');
  await until(()=>a.elements.get('subInPlayer').children.some(x=>x.value==='9'),'bench appears as valid incoming');
  // Genuine room status with a synthetic reconnect-reserved human slot.
  r.setConnected(3,false);
  await until(()=>a.evalJS('serverLink.roomState?.disconnectedIds?.includes(3)'),
    'active reserved seat disconnected on native server');
  assert.equal(a.elements.get('subOutPlayer').children.some(x=>x.value==='3'),false,
    'reconnecting active member is not a valid outgoing substitution choice');
  assert.equal(a.elements.get('subCaptainPlayer').children.some(x=>x.value==='3'),false,
    'reconnecting player is not a captain choice');
  a.evalJS('window.reservedOriginalSend=serverLink.send;window.reservedSends=[];serverLink.send=d=>window.reservedSends.push(d)');
  a.elements.get('subCaptainPlayer').value='3';a.elements.get('subAppointCaptain').onclick();
  a.elements.get('subOutPlayer').value='3';a.elements.get('subInPlayer').value='9';
  a.elements.get('subPropose').onclick();
  assert.equal(a.evalJS('window.reservedSends.length'),0,
    'stale captain and substitution clicks cannot send for disconnected ID');
  a.evalJS('serverLink.send=window.reservedOriginalSend');
  r.setConnected(3,true);
  await until(()=>a.elements.get('subCaptainPlayer').children.some(x=>x.value==='3'),
    'reconnected active player eligible again');
  a.elements.get('subCaptainPlayer').value='3';
  a.elements.get('subAppointCaptain').click();
  await until(()=>r.captains.get(1)===3,'host appointed own-team captain');
  // Admit a temporary second bench player to verify simultaneous red/blue
  // pending proposal state; unlike a fake roster these are real native peers.
  const blueGuest=await joinHuman(url,id,sockets,10);
  await until(()=>a.elements.get('subBenchPlayer').children.some(x=>x.value==='10'),'tenth peer in bench selector');
  a.elements.get('subTeam').value='2';a.elements.get('subTeam').onchange();
  a.elements.get('subBenchPlayer').value='10';a.elements.get('subAssignBench').click();
  await until(()=>r.benches.get(10)===2,'blue team has own real bench player');
  // Send a genuine Blue request before an unrelated delayed Red proposal.
  // The Red panel must not claim it is waiting for Blue's consent.
  a.elements.get('subOutPlayer').value='2';
  a.elements.get('subInPlayer').value='10';
  a.elements.get('subPropose').click();
  await until(()=>r.pendingSubs.get(2)?.inId===10,'real Blue pending on server');
  await until(()=>a.evalJS('serverLink.roomState?.pendingSubs?.some(p=>p.team===2)'),
    'Blue pending delivered to host');
  a.elements.get('subTeam').value='1';a.elements.get('subTeam').onchange();
  assert.match(a.elements.get('subPending').textContent,/No substitution pending/i,
    'Red panel does not display Blue pending request as its own status');
  a.elements.get('subTeam').value='2';a.elements.get('subTeam').onchange();
  assert.match(a.elements.get('subPending').textContent,/Blue:.*awaiting player consent/i,
    'Blue panel still shows its own authoritative pending request');
  a.elements.get('subTeam').value='1';a.elements.get('subTeam').onchange();
  a.elements.get('subOutPlayer').value='1';a.elements.get('subInPlayer').value='9';
  // The native Blue server queue remains live while Red awaits its own send.
  // Only the Red outgoing transport is delayed here, not any room state.
  a.evalJS('window.firstSubSend=serverLink.send;window.firstSubDelayed=[];serverLink.send=d=>window.firstSubDelayed.push(d)');
  a.elements.get('subPropose').click();
  assert.equal(a.evalJS('window.firstSubDelayed.length'),1);
  assert.match(a.elements.get('subPending').textContent,/waiting for server/i,
    'pending Red local receipt remains visible alongside genuine Blue queue');
  assert.doesNotMatch(a.elements.get('subPending').textContent,/Blue:/,
    'Red status never impersonates other teams');
  a.elements.get('subTeam').value='2';a.elements.get('subTeam').onchange();
  assert.match(a.elements.get('subPending').textContent,/Blue:.*awaiting player consent/i,
    'Blue server request remains visible while Red is awaiting acknowledgement');
  a.evalJS('serverLink.send=window.firstSubSend;subProposalReceipts.get(1).sentAt=Date.now()-2500;renderSubPanel()');
  // A non-proposer may not withdraw another human's native request.
  const blueRequestId=r.pendingSubs.get(2).requestId;
  blueGuest.send(JSON.stringify({type:'subCancel',team:2,requestId:blueRequestId}));
  await wait(60);
  assert.equal(r.pendingSubs.get(2)?.requestId,blueRequestId,
    'server rejects cancellation by a different non-host player');
  // Host explicitly withdraws a mistaken Blue proposal. Synthetic delay of
  // the outgoing click is the only fake transport; server and roster are real.
  a.evalJS('window.realCancelSend=serverLink.send;window.heldCancels=[];serverLink.send=d=>window.heldCancels.push(d)');
  a.elements.get('subCancel').click();a.elements.get('subCancel').click();
  assert.equal(a.evalJS('window.heldCancels.length'),1,'fast double-click sends only one withdrawal');
  assert.equal(a.elements.get('subCancel').disabled,true,
    'withdraw button waits for native server confirmation');
  assert.match(a.elements.get('subPending').textContent,/withdrawal sent, waiting for server/i);
  a.evalJS('serverLink.send=window.realCancelSend;window.realCancelSend(window.heldCancels[0])');
  await until(()=>!r.pendingSubs.has(2),'host successfully withdrew native Blue request');
  await until(()=>a.elements.get('subPropose').disabled===false,
    'host can propose a corrected swap without 60-second lock');
  assert.equal(a.elements.get('subCancel').disabled,true,
    'no nonexistent proposal may be cancelled');
  // A delayed obsolete cancellation cannot remove a newer Blue request.
  blueGuest.send(JSON.stringify({type:'subCancel',team:2,requestId:blueRequestId}));
  await wait(50);
  a.elements.get('subTeam').value='1';a.elements.get('subTeam').onchange();

  // Synthetic transport loss on a real admitted host: do not expose controls
  // that cannot reach the server, nor send from direct/keyboard handlers.
  a.evalJS('window.offlineOldWs=serverLink.ws;window.offlineOldSend=serverLink.send;window.offlineSends=[];serverLink.ws={readyState:3};serverLink.send=d=>window.offlineSends.push(d);renderSubPanel()');
  for(const id of ['subAssignBench','subClearBench','subAppointCaptain','subPropose'])
    assert.equal(a.elements.get(id).disabled,true,id+' disabled on disconnected host');
  assert.match(a.elements.get('subSummary').textContent,/Connection unavailable/i);
  a.evalJS("document.getElementById('subAppointCaptain').onclick();document.getElementById('subAssignBench').onclick();document.getElementById('subPropose').onclick()");
  assert.equal(a.evalJS('window.offlineSends.length'),0,'offline host sends no unconfirmed roster mutations');
  a.evalJS('serverLink.ws=window.offlineOldWs;serverLink.send=window.offlineOldSend;renderSubPanel()');
  assert.equal(a.elements.get('subAppointCaptain').disabled,false,'host controls recover with transport');


  a.elements.get('subOutPlayer').value='1';
  a.elements.get('subInPlayer').value='9';
  // Two rapid taps while awaiting a native server receipt must be one
  // explicit proposal, never two writes and a confusing duplicate rejection.
  a.evalJS('window.originalProposalSend=serverLink.send;window.delayedProposal=[];serverLink.send=d=>window.delayedProposal.push(d)');
  a.elements.get('subPropose').click();a.elements.get('subPropose').click();
  assert.equal(a.evalJS('window.delayedProposal.length'),1,'only one pending substitution proposal on fast double-tap');
  assert.equal(a.elements.get('subPropose').disabled,true,'proposal action shows waiting state before receipt');
  assert.match(a.elements.get('subPending').textContent,/waiting for server/i,'pending proposal explicitly awaits authoritative server status');
  assert.doesNotMatch(a.elements.get('subPending').textContent,/Blue:/,
    'Red pending message must not be hidden by an unrelated Blue server queue');
  // An unanswered blue proposal must not overwrite the still-pending red
  // proposal. Both use a real native roster; only transmissions are delayed.
  a.elements.get('subTeam').value='2';a.elements.get('subTeam').onchange();
  a.elements.get('subOutPlayer').value='2';a.elements.get('subInPlayer').value='10';
  a.elements.get('subPropose').click();
  assert.equal(a.evalJS('window.delayedProposal.length'),2,'independent blue proposal is sent once');
  a.elements.get('subTeam').value='1';a.elements.get('subTeam').onchange();
  assert.equal(a.elements.get('subPropose').disabled,true,'red proposal remains pending after proposing for blue');
  a.elements.get('subPropose').onclick();
  assert.equal(a.evalJS('window.delayedProposal.length'),2,'switching teams must not duplicate pending red proposal');
  blueGuest.close();
  await until(()=>r.clients.size===9,'temporary tenth blue spectator leaves');

  a.evalJS('serverLink.send=window.originalProposalSend;subProposalReceipts.get(1).sentAt=Date.now()-2500;renderSubPanel()');
  assert.equal(a.evalJS('subProposalReceipts.has(2)'),true,
    'expiring red receipt must not erase the still-pending blue proposal');
  assert.equal(a.elements.get('subPropose').disabled,false,'no receipt allows an explicit human retry');
  a.elements.get('subPropose').click();
  await until(()=>r.pendingSubs.get(1)?.inId===9,'host proposed spectator swap');
  await until(()=>!b.elements.get('subConsent').hidden,'incoming guest sees consent prompt');
  assert.equal(b.elements.get('subConsentText').textContent.includes('Red'),true);
  b.evalJS('window.offlineOldWs=serverLink.ws;window.offlineOldSend=serverLink.send;window.offlineSends=[];serverLink.ws={readyState:3};serverLink.send=d=>window.offlineSends.push(d);renderSubPanel();renderGlobalSubConsent()');
  assert.equal(b.elements.get('subApprove').disabled,true,'offline incoming guest cannot accept');
  assert.equal(b.elements.get('subDecline').disabled,true,'offline incoming guest cannot decline');
  assert.match(b.elements.get('subConsentText').textContent,/Connection unavailable/i);
  b.evalJS("document.getElementById('subApprove').onclick();document.getElementById('subDecline').onclick()");
  assert.equal(b.evalJS('window.offlineSends.length'),0,'offline substitution consent sends zero votes');
  b.evalJS('serverLink.ws=window.offlineOldWs;serverLink.send=window.offlineOldSend;renderSubPanel();renderGlobalSubConsent()');
  assert.equal(b.elements.get('subApprove').disabled,false,'incoming guest can accept only after socket recovery');

  // A slow/no server receipt must never duplicate an explicit human choice.
  // Delay only the test client's outgoing send; real native room stays pending.
  b.evalJS('window.heldSubSend=serverLink.send;window.heldSubVotes=[];serverLink.send=d=>window.heldSubVotes.push(d)');
  b.elements.get('subApprove').click();b.elements.get('subApprove').click();
  assert.equal(b.evalJS('window.heldSubVotes.length'),1,'one deliberate human click is sent only once before receipt');
  assert.equal(b.elements.get('subApprove').disabled,true,'do not advertise duplicate acceptance while waiting');
  b.evalJS('serverLink.send=window.heldSubSend;subConsentReceipt.sentAt=Date.now()-2500;renderGlobalSubConsent()');
  assert.equal(b.elements.get('subApprove').disabled,false,'user can retry explicitly after missing receipt');
  b.elements.get('subApprove').click();
  await until(()=>r.hb.getPlayer(9).team===1,'guest approved pregame substitution');
  assert.equal(r.hb.getPlayer(1).team,0);
  assert.equal(r.benches.get(1),1);
  assert.equal(r.captains.get(1),3);
  assert.equal(r.subEvents.length,1,'only completed swap becomes a match event');
  assert.equal(r.subEvents[0].requestedBy,1,'owner is recorded as proposer');
  await until(()=>b.elements.get('subPending').textContent.includes('Last completed swap'),
    'spectator sees completed swap history from authoritative room status');
  assert.match(b.elements.get('subPending').textContent,/Red:/);
  assert.equal(r.clients.size,9);
  assert.equal(r.sockets.size,9);

  // Owner becomes the next entrant. Consent alone during a live game cannot
  // promote them; the server must receive a real pause from the host.
  a.elements.get('startButton').click();
  await until(()=>r.started,'host started real game');
  assert.equal(r.subEvents.length,0,'new match history begins empty');
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
  // The second real substitution is accepted from the global Home/My Games
  // consent dock, through the same native single-receipt guard.
  a.evalJS("document.getElementById('matchView').hidden=true;renderGlobalSubConsent()");
  assert.equal(a.evalJS('globalSubConsent.hidden'),false,
    'global substitution consent is visible outside the match menu');
  a.evalJS('globalSubAccept.events.click()');
  await until(()=>r.pendingSubs.get(1)?.accepted===true,'entrant accepted live swap from global dock');
  await until(()=>/accepted, pause to apply.*[0-9]+s remaining/i.test(
    a.elements.get('subPending').textContent),
    'host sees genuine bounded pause deadline after independent human approval');
  assert(r.pendingSubs.get(1).expiresAt-Date.now()>50000,
    'actual native consent refreshes the room-authoritative pause deadline');
  // Browser and match-host system clocks can disagree by minutes. The visible
  // server deadline must still be correct for a consenting real player.
  a.evalJS('globalThis.__nativeDateNow=Date.now;Date.now=()=>__nativeDateNow()+180000;renderSubPanel()');
  try {
   assert.match(a.elements.get('subPending').textContent,/accepted, pause to apply.*[5-6][0-9]s remaining/i,
    'server clock, not a fast local clock, controls the displayed swap deadline');
   a.evalJS('Date.now=()=>__nativeDateNow()-180000;renderSubPanel()');
   assert.match(a.elements.get('subPending').textContent,/accepted, pause to apply.*[5-6][0-9]s remaining/i,
    'server clock, not a slow local clock, controls the displayed swap deadline');
  } finally {
   a.evalJS('Date.now=__nativeDateNow;renderSubPanel()');
  }
  // A server expiry must keep visibly counting down after its status receipt,
  // including on a match host with a wildly incorrect system clock.
  a.evalJS('globalThis.__nativeLastRoomReceive=serverLink.roomStatusReceivedAt;serverLink.roomStatusReceivedAt=performance.now()-25000;renderSubPanel()');
  try {
   assert.match(a.elements.get('subPending').textContent,/accepted, pause to apply.*3[4-6]s remaining/i,
    'displayed server-authoritative countdown reflects elapsed monotonic time');
  } finally {
   a.evalJS('serverLink.roomStatusReceivedAt=__nativeLastRoomReceive;renderSubPanel()');
  }
  const selectedOutgoing=a.elements.get('subOutPlayer').value;
  a.evalJS('globalThis.__nativeMenuWasOpen=menuOpen;menuOpen=true;serverLink.roomStatusReceivedAt=performance.now()-25000');
  try {
   await until(()=>/accepted, pause to apply.*3[4-6]s remaining/i.test(
     a.elements.get('subPending').textContent),'live countdown ticker refreshes without new server status');
   assert.equal(a.elements.get('subOutPlayer').value,selectedOutgoing,
     'countdown-only refresh must not interrupt the human roster selection');
  } finally {
   a.evalJS('menuOpen=__nativeMenuWasOpen;serverLink.roomStatusReceivedAt=__nativeLastRoomReceive;renderSubPanel()');
  }
  assert.equal(r.hb.getPlayer(1).team,0,'accepted live swap remains benched');
  assert.equal(r.hb.getPlayer(9).team,1,'incumbent remains on field');
  a.evalJS('togglePause()');
  await until(()=>r.paused&&r.hb.getPlayer(1).team===1,'server pause executes accepted swap');
  assert.equal(r.hb.getPlayer(9).team,0);
  assert.equal(r.pendingSubs.size,0);
  assert.equal(r.subEvents.length,1,'pause completes exactly one match receipt');
  assert.equal(r.subEvents[0].inId,1);
  await until(()=>b.elements.get('subPending').textContent.includes('Last completed swap'),
    'player-facing room menu shows paused match completed swap');
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
