'use strict';
// Native Match Center: read-only, human-visible information from actual HaxBall
// room snapshots. No invented results, pings, roles, rankings or match writes.
(function(){
 const match=document.getElementById('matchView');
 const canvas=document.getElementById('gameCanvas');
 const corner=document.querySelector('.hud-top-right');
 if(!match||!canvas||!corner)return;
 const button=document.createElement('button');button.type='button';
 button.className='hud-button match-center-trigger';button.textContent='▤ SCOREBOARD';
 button.title='Show actual live roster and match clock (hold Tab while the pitch is focused)';
 button.setAttribute('aria-label','Open match scoreboard');
 button.setAttribute('aria-expanded','false');
 corner.insertBefore(button,corner.firstChild);
 const panel=document.createElement('section');panel.className='match-center';
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');
 panel.setAttribute('aria-label','Live game scoreboard and team roster');
 panel.hidden=true;
 const header=document.createElement('header');header.className='match-center-head';
 const heading=document.createElement('div');
 const kicker=document.createElement('span');kicker.className='match-center-kicker';kicker.textContent='MATCH CENTER';
 const title=document.createElement('h2');title.textContent='LIVE SCOREBOARD';
 heading.append(kicker,title);
 const close=document.createElement('button');close.type='button';close.textContent='✕';
 close.setAttribute('aria-label','Close match scoreboard');
 header.append(heading,close);
 const badge=document.createElement('p');badge.className='match-center-badge';
 const score=document.createElement('div');score.className='match-center-score';
 const redScore=document.createElement('strong'),blueScore=document.createElement('strong');
 redScore.className='red';blueScore.className='blue';
 const vs=document.createElement('span');vs.textContent='–';
 const clock=document.createElement('time');clock.textContent='00:00';
 score.append(redScore,vs,blueScore,clock);
 const teams=document.createElement('div');teams.className='match-center-teams';
 const red=document.createElement('section'),blue=document.createElement('section');
 for(const [column,label,side] of [[red,'RED','red'],[blue,'BLUE','blue']]){
  column.className='match-center-team '+side;
  const h=document.createElement('h3');h.textContent=label;column.append(h);
 }
 teams.append(red,blue);
 const spectators=document.createElement('section');spectators.className='match-center-spectators';
 const spectatorsTitle=document.createElement('h3');spectatorsTitle.textContent='SPECTATORS / INACTIVE';
 const spectatorsList=document.createElement('div');spectatorsList.className='match-center-roster';
 spectators.append(spectatorsTitle,spectatorsList);
 const footer=document.createElement('p');footer.className='match-center-footer';
 footer.textContent='Current local snapshot only · latency is shown only when individually measured by the server. No ratings or match statistics are inferred.';

 const feed=document.createElement('section');feed.className='match-center-feed';
 const feedHeading=document.createElement('div');feedHeading.className='match-center-feed-heading';
 const feedTitle=document.createElement('h3');feedTitle.textContent='LIVE MATCH OBSERVATIONS';
 const feedActions=document.createElement('div');feedActions.className='match-center-feed-actions';
 const downloadFeed=document.createElement('button');downloadFeed.type='button';
 downloadFeed.textContent='↓ Save my notes';downloadFeed.title='Download only observed changes on this device';
 const clearFeed=document.createElement('button');clearFeed.type='button';clearFeed.textContent='Clear';
 feedActions.append(downloadFeed,clearFeed);feedHeading.append(feedTitle,feedActions);
 const feedIntro=document.createElement('p');feedIntro.textContent='Local, observed scoreboard changes follow the same match when you visit Home or My Games. While away, events cannot be reconstructed. This is NOT an official event feed; scorer identity, fouls, assists and match results are never inferred.';
 const feedList=document.createElement('ol');feedList.className='match-center-feed-list';
 const feedStatus=document.createElement('p');feedStatus.className='match-center-feed-status';
 feedStatus.setAttribute('role','status');feedStatus.setAttribute('aria-live','polite');
 feed.append(feedHeading,feedIntro,feedList,feedStatus);
 panel.append(header,badge,score,teams,spectators,feed,footer);match.append(panel);
 let sticky=false,holding=false,lastSignature='',wasAvailable=false;
 let timeline=[],snapshot=null,sessionId='',sessionRoom=null,historyInterrupted=false;
 const MAX_HISTORY=40;
 // The room code alone is not proof of the current match/round.
 // Wait for server-issued room identity and round before showing native scores.
 function verifiedNativeRound(){
  if(!serverLink?.room)return null;
  const info=serverLink.roomState;
  return info?.room===serverLink.room&&Number.isSafeInteger(info.round)&&
    info.round>=0&&info.round<=1000000000?info.round:null;
 }
 function liveSnapshot(){
  if(typeof replay!=='undefined'&&replay)return null;
  const isNative=!!serverLink?.room;
  const verifiedRound=isNative?verifiedNativeRound():null;
  if(isNative&&verifiedRound===null)return null;
  const g=room?.gameState;
  if(!g||![g.redScore,g.blueScore,g.timeElapsed].every(Number.isFinite)||
    !Number.isSafeInteger(g.redScore)||!Number.isSafeInteger(g.blueScore)||
    g.redScore<0||g.blueScore<0||g.redScore>500||g.blueScore>500||
    g.timeElapsed<0||g.timeElapsed>86400)return null;
  const kind=isNative?'native online room':peerConnected?'direct peer room':'local practice';
  // Even a 0-0 restart within three seconds is a different server round.
  const key=isNative?'native:'+serverLink.room+':round:'+verifiedRound:
   peerConnected?'peer':'local';
  return {key,kind,round:verifiedRound,red:g.redScore,blue:g.blueScore,
   elapsed:Math.floor(g.timeElapsed)};
 }
 function formatClock(seconds){
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 }
 function addObservation(label,reading,gap=false){
  timeline.push({clock:formatClock(reading.elapsed),red:reading.red,blue:reading.blue,
   detail:label,observedAt:new Date().toISOString(),gap:gap===true});
  if(timeline.length>MAX_HISTORY)timeline.shift();
  lastSignature='';
 }
 function renderObservations(){
  feedList.replaceChildren();
  for(const entry of [...timeline].reverse()){
   const item=document.createElement('li');
   if(entry.gap===true)item.className='match-center-feed-gap';
   const clock=document.createElement('time');clock.textContent=entry.clock;
   const detail=document.createElement('span');detail.textContent=entry.detail;
   const score=document.createElement('small');score.textContent=entry.red+'–'+entry.blue;
   item.append(clock,detail,score);feedList.append(item);
  }
  if(!timeline.length){
   const item=document.createElement('li');item.className='match-center-feed-empty';
   item.textContent='No live changes observed. Open a local or online match to begin.';
   feedList.append(item);
  }
  const gaps=timeline.filter(item=>item.gap===true).length;
  feedStatus.textContent=timeline.length+' local observations'+
   (gaps?' · '+gaps+' unobserved viewing gap'+(gaps===1?'':'s'):'')+
   '. No server upload, official scoring or persistent tracking.';
  downloadFeed.disabled=!timeline.length;
 }
 function resetObservations(){
  timeline=[];sessionId='';sessionRoom=null;snapshot=null;
  historyInterrupted=false;lastSignature='';
 }
 function observe(){
  // App navigation hides the pitch but does not end an ongoing game.
  // Preserve authentic, local observations until the next visible snapshot
  // proves we have changed rooms, started another session or lost game data.
  if(match.hidden||document.hidden){
   if(sessionId||timeline.length)historyInterrupted=true;
   return;
  }
  const reading=liveSnapshot();
  if(!reading){
   if(serverLink?.room){
    // A reconnect may expose the socket before its authoritative room
    // status. Keep prior notes but never append a stale local snapshot.
    if(sessionId||timeline.length)historyInterrupted=true;
   }else if(sessionId||timeline.length)resetObservations();
   return;
  }
  if(sessionRoom!==room||sessionId!==reading.key){
   sessionRoom=room;sessionId=reading.key;timeline=[];snapshot=null;historyInterrupted=false;
  }
  const prior=snapshot;
  if(!prior){
   addObservation('Scoreboard snapshot first observed ('+reading.kind+
    (reading.round===null?'':', server round '+reading.round)+').',reading);
  }else if(reading.elapsed+3<prior.elapsed||reading.red<prior.red||reading.blue<prior.blue){
   timeline=[];addObservation('Match clock or score reset; observation history restarted.',reading);
  }else if(reading.red!==prior.red||reading.blue!==prior.blue){
   const redDelta=reading.red-prior.red,blueDelta=reading.blue-prior.blue;
   const single=redDelta+blueDelta===1&&(redDelta===1||blueDelta===1);
   const description=historyInterrupted?'Scoreboard changed while away from the pitch; individual events are unknown.':
    single?(redDelta?'Red':'Blue')+' score increased by one (scorer unknown).':
    'Scoreboard changed by multiple points (cause unknown).';
   addObservation(description,reading,historyInterrupted);
  }else if(historyInterrupted&&reading.elapsed-prior.elapsed>=3){
   // An unchanged score never implies no activity while the view was hidden.
   addObservation('Returned after viewing another screen; activity during the gap was not observed.',reading,true);
  }
  snapshot=reading;historyInterrupted=false;
 }
 downloadFeed.addEventListener('click',()=>{
  if(!timeline.length)return;
  const lines=['# Fuckball local match observations','',
   'Player-owned, unverified scoreboard notes. Not an official match result.',
   'No room identifiers, player names, accounts, chat or authentication data included.','',
   'Context: '+(snapshot?.kind||'local view')+
    (snapshot?.round===null||snapshot?.round===undefined?'':' · server round '+snapshot.round),'',
   ...timeline.map(x=>'- ['+x.clock+'] '+(x.gap?'[UNOBSERVED INTERVAL] ':'')+
    x.detail+' Score observed: '+x.red+'-'+x.blue)];
  const blob=new Blob([lines.join('\n')+'\n'],{type:'text/markdown'});
  if(blob.size>16384){feedStatus.textContent='Too many observations to export safely.';return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='fuckball-private-scoreboard-notes.md';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  feedStatus.textContent='Private observations exported to Markdown. No upload.';
 });
 clearFeed.addEventListener('click',()=>{
  timeline=[];renderObservations();
  feedStatus.textContent='Local observation history cleared. Current score remains unchanged.';
 });
 renderObservations();
 function eligible(){
  return !match.hidden&&!document.hidden&&
   (typeof room!=='undefined'&&!!room||typeof replay!=='undefined'&&!!replay);
 }
 function roster(){
  if(serverLink?.room&&verifiedNativeRound()===null)return [];
  const state=(typeof replay!=='undefined'&&replay)?replay.state:room?.state;
  return Array.isArray(state?.players)?state.players.filter(p=>
   Number.isSafeInteger(p?.id)&&p.id>=0&&[0,1,2].includes(p.team?.id)).slice(0,128):[];
 }
 function labelFor(p){
  let name=String(p.name||'Player').slice(0,32);
  if(p.id===networkPlayerId&&serverLink?.room)name+=' · YOU';
  if(p.aiControlled===true)name+=' · BOT';
  if(Number.isSafeInteger(serverLink?.roomControl?.owner)&&p.id===serverLink.roomControl.owner)
   name+=' · HOST';
  return name;
 }
 function pingFor(p){
  if(!serverLink?.room||!(serverLink.serverPings instanceof Map))return null;
  const r=serverLink.serverPings.get(p.id);
  // Zero ms is a valid server-measured LAN RTT, unlike a missing sample.
  return Number.isFinite(r)&&r>=0&&r<=10000?Math.round(r):null;
 }
 function fill(container,list){
  const items=document.createElement('div');items.className='match-center-roster';
  if(!list.length){
   const note=document.createElement('p');note.className='match-center-empty';
   note.textContent='No connected players in this group.';items.append(note);
  }
  for(const p of list){
   const row=document.createElement('div');row.className='match-center-player';
   const name=document.createElement('span');name.textContent=labelFor(p);
   const latency=document.createElement('small');const ping=pingFor(p);
   latency.textContent=ping===null?'—':ping+' ms RTT';
   latency.title=ping===null?'No player-specific server measurement available':'Existing server-measured round trip, not one-way delay';
   row.append(name,latency);items.append(row);
  }
  container.replaceChildren(items);
 }
 function render(force=false){
  if(!eligible())return;
  const pendingRound=!!serverLink?.room&&verifiedNativeRound()===null;
  const g=pendingRound?null:
   (typeof replay!=='undefined'&&replay?replay:room)?.gameState;
  const users=pendingRound?[]:roster();
  const scores=[g?.redScore,g?.blueScore].map(n=>Number.isSafeInteger(n)&&n>=0?n:'—');
  const elapsed=Number.isFinite(g?.timeElapsed)&&g.timeElapsed>=0?Math.floor(g.timeElapsed):0;
  const time=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  const inGame=!!g;
  const mode=typeof replay!=='undefined'&&replay?'LOCAL REPLAY · UNVERIFIED':
   serverLink?.room?(pendingRound?'NATIVE ROOM · AWAITING SERVER STATUS':
    'NATIVE ROOM · VERIFIED ROUND '+verifiedNativeRound()+' · LIVE SNAPSHOT'):
   peerConnected?'DIRECT PEER ROOM':'LOCAL PRACTICE';
  const state=inGame?(paused?'PAUSED':'PLAYING'):'WAITING / INTERMISSION';
  const signature=JSON.stringify([scores,time,mode,state,timeline.length,users.map(p=>
   [p.id,p.name,p.team.id,p.aiControlled,pingFor(p)]),serverLink?.roomControl?.owner]);
  if(!force&&signature===lastSignature)return;
  lastSignature=signature;
  badge.textContent=mode+' · '+state;
  redScore.textContent=String(scores[0]);blueScore.textContent=String(scores[1]);
  clock.textContent=time;
  fill(red,users.filter(p=>p.team.id===1));
  fill(blue,users.filter(p=>p.team.id===2));
  const inactive=users.filter(p=>p.team.id===0);
  spectators.hidden=!inactive.length;
  fill(spectatorsList,inactive);
  renderObservations();
 }
 function setVisible(){
  const visible=(sticky||holding)&&eligible()&&document.getElementById('pauseMenu')?.hidden!==false;
  panel.hidden=!visible;button.setAttribute('aria-expanded',String(visible));
  button.hidden=match.hidden||!eligible();
  if(visible)render(true);
 }
 function closePanel(){
  sticky=false;holding=false;setVisible();
 }
 button.addEventListener('click',()=>{
  if(!eligible())return;
  sticky=!sticky;holding=false;setVisible();
 });
 close.addEventListener('click',()=>{closePanel();button.focus();});
 // Tab displays a temporary scoreboard only when canvas itself has keyboard
 // focus. Everywhere else, browser Tab navigation is preserved.
 window.addEventListener('keydown',event=>{
  if(event.code==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&
    document.activeElement===canvas&&!document.querySelector('dialog[open]')&&
    document.getElementById('pauseMenu')?.hidden!==false&&
    document.getElementById('chatForm')?.hidden!==false&&eligible()){
   event.preventDefault();event.stopPropagation();
   if(!holding){holding=true;setVisible();}
  }
  if(event.code==='Escape'&&!panel.hidden&&!holding){
   // Native Esc menu still has precedence; panel cannot block gameplay.
   closePanel();
  }
 },true);
 window.addEventListener('keyup',event=>{
  if(event.code==='Tab'&&holding){event.preventDefault();holding=false;setVisible();}
 },true);
 window.addEventListener('blur',()=>{holding=false;setVisible();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)closePanel();});
 window.setInterval(()=>{
  observe();
  if(!eligible()||document.getElementById('pauseMenu')?.hidden===false){
   if(sticky||holding)closePanel();
   button.hidden=true;return;
  }
  button.hidden=false;
  if(!panel.hidden)render();
 },500);
 setVisible();
})();