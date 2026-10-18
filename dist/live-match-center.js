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
 panel.append(header,badge,score,teams,spectators,footer);match.append(panel);
 let sticky=false,holding=false,lastSignature='',wasAvailable=false;
 function eligible(){
  return !match.hidden&&!document.hidden&&
   (typeof room!=='undefined'&&!!room||typeof replay!=='undefined'&&!!replay);
 }
 function roster(){
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
  return Number.isFinite(r)&&r>=1&&r<=10000?Math.round(r):null;
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
  const g=(typeof replay!=='undefined'&&replay?replay:room)?.gameState;
  const users=roster();
  const scores=[g?.redScore,g?.blueScore].map(n=>Number.isSafeInteger(n)&&n>=0?n:'—');
  const elapsed=Number.isFinite(g?.timeElapsed)&&g.timeElapsed>=0?Math.floor(g.timeElapsed):0;
  const time=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0');
  const inGame=!!g;
  const mode=typeof replay!=='undefined'&&replay?'LOCAL REPLAY · UNVERIFIED':serverLink?.room?
   'NATIVE ONLINE ROOM · LIVE SNAPSHOT':peerConnected?'DIRECT PEER ROOM':'LOCAL PRACTICE';
  const state=inGame?(paused?'PAUSED':'PLAYING'):'WAITING / INTERMISSION';
  const signature=JSON.stringify([scores,time,mode,state,users.map(p=>
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
  if(!eligible()||document.getElementById('pauseMenu')?.hidden===false){
   if(sticky||holding)closePanel();
   button.hidden=true;return;
  }
  button.hidden=false;
  if(!panel.hidden)render();
 },500);
 setVisible();
})();