'use strict';
// Spectator Action Director. Reads genuine native match positions to select
// a camera target; never sends input, mutates the game, or invents highlights.
(function(){
 if(typeof isSpectatorCamera!=='function'||typeof chooseSpectatorTarget!=='function'||
    typeof cameraPlayers!=='function'||typeof spectatorToolbar==='undefined')return;
 const match=document.getElementById('matchView');
 const pane=document.querySelector('#menuVideoPane .rm-form');
 if(!match||!pane)return;
 const STORAGE='fuckball.spectator-director.v1';
 const title=document.createElement('section');title.className='spectator-director-settings';
 const heading=document.createElement('h3');heading.textContent='SPECTATOR DIRECTOR.';
 const info=document.createElement('p');info.textContent='While spectating a real match, the camera can follow the player closest to the actual ball. This only moves your local view, never players or match state. Manual camera controls switch Auto off.';
 const modeLabel=document.createElement('label');modeLabel.textContent='Auto-follow preference';
 const mode=document.createElement('select');mode.setAttribute('aria-label','Automated spectator camera team');
 for(const [id,label] of [['all','Closest player · both teams'],['red','Red team near ball'],['blue','Blue team near ball']])
  mode.add(new Option(label,id));
 modeLabel.append(mode);
 const status=document.createElement('p');status.className='spectator-director-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 title.append(heading,info,modeLabel,status);pane.append(title);
 const toggle=document.createElement('button');toggle.type='button';toggle.className='spectator-director-toggle';
 toggle.setAttribute('aria-label','Toggle automatic spectator camera');toggle.textContent='◎ AUTO CAM';
 toggle.setAttribute('aria-pressed','false');
 spectatorToolbar.append(toggle);
 let enabled=false,lastRoom=null,lastChange=0,previousId=null;
 let previousClock=null,previousScore=null;
 let lastNativeLink=null,lastNativeRound=null;
 let frameBaseline=0,hasCurrentNativeFrame=false;
 try{const stored=JSON.parse(localStorage.getItem(STORAGE)||'null');
  if(stored?.version===1&&['all','red','blue'].includes(stored.mode))mode.value=stored.mode;
 }catch{}
 function available(){
  if(document.hidden||match.hidden||!document.getElementById('pauseMenu')?.hidden||
     typeof replay!=='undefined'&&replay||!isSpectatorCamera())return false;
  return !!(serverLink?.room||(!serverLink&&document.getElementById('mode')?.value==='watch'));
 }
 function activeRoom(){
  return serverLink?.room||(!serverLink&&document.getElementById('mode')?.value==='watch'?'local-watch':null);
 }
 // Even a *recent* shared renderer timestamp may belong to the previous
 // WebSocket or previous round. Observe a new receipt for this exact native
 // link before assigning a local camera target.
 function syncNativeSession(){
  const link=typeof serverLink!=='undefined'&&serverLink?.room?serverLink:null;
  const round=link&&Number.isSafeInteger(link.roomState?.round)?link.roomState.round:null;
  const at=typeof net!=='undefined'&&Number.isFinite(net?.lastSnapshot)?
   net.lastSnapshot:0;
  if(link!==lastNativeLink||round!==lastNativeRound){
   lastNativeLink=link;lastNativeRound=round;
   frameBaseline=at;hasCurrentNativeFrame=false;
   previousId=null;lastChange=0;
   if(enabled&&link)stop('Room or round changed. Enable Auto Cam again after a fresh server frame.');
  }
  if(link&&at>frameBaseline&&at>0&&at<=performance.now())
   hasCurrentNativeFrame=true;
 }
 // The last received snapshot can still be present in the shared game
 // renderer long after native transport stopped delivering new frames.
 // Local Watch Bots do not use native snapshot timing.
 function freshNativeFrame(){
  if(!serverLink?.room)return true;
  if(!hasCurrentNativeFrame||serverLink.roomState?.started!==true||
     serverLink.roomState?.paused===true)return false;
  const at=typeof net!=='undefined'?net?.lastSnapshot:0;
  const age=performance.now()-at;
  return Number.isFinite(at)&&at>0&&age>=0&&age<=3500;
 }
 function updateUi(text){
  toggle.setAttribute('aria-pressed',String(enabled));
  toggle.textContent=enabled?'◉ AUTO CAM ON':'◎ AUTO CAM';
  toggle.title=enabled?'Stop automatically following actual ball action':'Auto-follow nearest active player to ball';
  if(text)status.textContent=text;
 }
 function stop(reason){
  enabled=false;previousId=null;lastChange=0;previousClock=null;previousScore=null;
  updateUi(reason||'Automatic camera stopped. Select a player manually at any time.');
 }
 mode.addEventListener('change',()=>{
  try{localStorage.setItem(STORAGE,JSON.stringify({version:1,mode:mode.value}));}
  catch{status.textContent='Preference applies until the tab closes; storage is unavailable.';}
  if(enabled){previousId=null;lastChange=0;}
 });
 toggle.addEventListener('click',()=>{
  syncNativeSession();
  if(!available()){stop('Join the spectator bench or use Watch Bots to enable Auto Cam.');return;}
  enabled=!enabled;previousId=null;lastChange=0;
  updateUi(enabled?'Automatic spectator camera enabled. Only your local view changes.':'Auto camera disabled. Manual follow is available.');
 });
 // Respect explicit player choice; avoid auto-follow undoing a manual switch.
 spectatorPrevious.addEventListener('click',()=>{if(enabled)stop('Manual player selection restored.');});
 spectatorNext.addEventListener('click',()=>{if(enabled)stop('Manual player selection restored.');});
 spectatorSelect.addEventListener('change',()=>{if(enabled)stop('Manual camera selection restored.');});
 document.getElementById('cameraMode')?.addEventListener('change',()=>{
  if(enabled)stop('Manual camera setting restored.');
 });
 function coordinates(){
  const game=(typeof replay!=='undefined'&&replay)?replay.gameState:room?.gameState;
  const ball=game?.physicsState?.discs?.[0]?.pos;
  if(!Number.isFinite(ball?.x)||!Number.isFinite(ball?.y))return null;
  const live=room?.state?.players;
  if(!Array.isArray(live))return null;
  const players=live.filter(p=>Number.isSafeInteger(p?.id)&&p.id>=0&&
   [1,2].includes(p.team?.id)&&
   Number.isFinite(p.disc?.pos?.x)&&Number.isFinite(p.disc?.pos?.y)&&
   (mode.value==='all'||(mode.value==='red'?p.team.id===1:p.team.id===2)));
  const scored=players.map(p=>({id:p.id,side:p.team.id,
   distance:Math.hypot(p.disc.pos.x-ball.x,p.disc.pos.y-ball.y)}))
   .filter(p=>Number.isFinite(p.distance));
  scored.sort((a,b)=>a.distance-b.distance||a.id-b.id);
  return scored;
 }
 function tick(){
  syncNativeSession();
  const current=activeRoom();
  if(current!==lastRoom){
   lastRoom=current;previousClock=null;previousScore=null;
   if(enabled)stop('Room changed. Re-enable Auto Cam for this match.');
  }
  const valid=available();
  if(!valid){if(enabled)stop('Spectator view ended.');return;}
  if(!enabled)return;
  if(!freshNativeFrame()){
   previousId=null;lastChange=0;
   status.textContent='Waiting for a fresh live server frame. Auto Cam is holding your last camera; no stale target selection.';
   return;
  }
  // A new round can use the same native room ID and reused player IDs.
  // Reset the old target/dwell so the spectator does not stick to the
  // previous round's formation. Never alter any player or game state.
  const g=room?.gameState;
  const clock=Number.isFinite(g?.timeElapsed)&&g.timeElapsed>=0?g.timeElapsed:null;
  const score=Number.isSafeInteger(g?.redScore)&&Number.isSafeInteger(g?.blueScore)&&
   g.redScore>=0&&g.blueScore>=0?{red:g.redScore,blue:g.blueScore}:null;
  if(clock!==null&&previousClock!==null&&clock+0.5<previousClock||
     score!==null&&previousScore!==null&&
      (score.red<previousScore.red||score.blue<previousScore.blue)){
   previousId=null;lastChange=0;
   status.textContent='New round detected. Auto Cam is choosing from current live players.';
  }
  previousClock=clock;previousScore=score;
  const list=coordinates();if(!list?.length){
   status.textContent='Waiting for real ball and player positions; keeping your current camera.';return;
  }
  const best=list[0],currentPlayer=list.find(p=>p.id===previousId);
  const now=performance.now();
  // A margin and a bounded dwell prevent camera flickering on close tackles.
  if(currentPlayer&&currentPlayer.distance<=best.distance+24)return;
  if(now-lastChange<2800)return;
  try{
   chooseSpectatorTarget(best.id);previousId=best.id;lastChange=now;
   const side=best.side===1?'Red':'Blue';
   const visible=room?.state?.players.find(p=>p.id===best.id);
   const player=String(visible?.name||'Player').slice(0,25);
   status.textContent='Auto Cam: '+side+' · '+player+' closest to the recorded live ball position. Camera only.';
  }catch{stop('Automatic camera unavailable; manual viewing remains active.');}
 }
 const interval=window.setInterval(tick,900);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&enabled)stop('Auto Cam paused when the tab became hidden.');
 });
 updateUi('Auto Cam is off by default. Choose a team, then enable it from the spectator toolbar.');
})();