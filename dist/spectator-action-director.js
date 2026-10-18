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
 let enabled=false,lastRoom=null,lastChange=0,previousId=null,lastAvailable=false;
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
 function updateUi(text){
  toggle.setAttribute('aria-pressed',String(enabled));
  toggle.textContent=enabled?'◉ AUTO CAM ON':'◎ AUTO CAM';
  toggle.title=enabled?'Stop automatically following actual ball action':'Auto-follow nearest active player to ball';
  if(text)status.textContent=text;
 }
 function stop(reason){
  enabled=false;previousId=null;lastChange=0;
  updateUi(reason||'Automatic camera stopped. Select a player manually at any time.');
 }
 mode.addEventListener('change',()=>{
  try{localStorage.setItem(STORAGE,JSON.stringify({version:1,mode:mode.value}));}
  catch{status.textContent='Preference applies until the tab closes; storage is unavailable.';}
  if(enabled){previousId=null;lastChange=0;}
 });
 toggle.addEventListener('click',()=>{
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
  const current=activeRoom();
  if(current!==lastRoom){lastRoom=current;if(enabled)stop('Room changed. Re-enable Auto Cam for this match.');}
  const valid=available();
  if(!valid){if(enabled)stop('Spectator view ended.');return;}
  if(!enabled)return;
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