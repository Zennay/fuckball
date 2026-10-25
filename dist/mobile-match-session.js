'use strict';
// Opt-in browser display tools. Never alter movement, simulation, netcode,
// account state or room permissions. No storage, server requests or telemetry.
(function(){
 const match=document.getElementById('matchView');
 const pane=document.querySelector('#menuVideoPane .rm-form');
 const corner=document.querySelector('.hud-top-right');
 if(!match||!pane||!corner)return;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const section=el('section',undefined,'mobile-match-session');
 section.setAttribute('aria-label','Immersive match display controls');
 section.append(el('h3','MATCH DISPLAY.'));
 const intro=el('p','Keep your screen on while actually playing, or enter fullscreen. Everything is optional, device-local and reversible. Browser permissions and battery settings stay in control.');
 section.append(intro);
 const actions=el('div',undefined,'mobile-match-session-actions');
 const wake=el('button','Keep screen awake');wake.type='button';
 const fullscreen=el('button','Enter fullscreen');fullscreen.type='button';
 actions.append(wake,fullscreen);
 const landscapeLabel=el('label',undefined,'mobile-match-session-landscape');
 const landscape=el('input');landscape.type='checkbox';
 landscapeLabel.append(landscape,document.createTextNode('Try landscape orientation in fullscreen (where allowed)'));
 const status=el('p','Off · normal device sleep rules apply','mobile-match-session-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const hint=el('p','Wake protection automatically releases if you leave the pitch or hide the tab. It never keeps an idle server game awake.','mobile-match-session-hint');
 section.append(actions,landscapeLabel,status,hint);
 pane.append(section);
 const quick=el('button','☀ AWAKE OFF','hud-button mobile-match-session-quick');quick.type='button';
 quick.setAttribute('aria-label','Toggle match screen wake lock');
 quick.setAttribute('aria-pressed','false');
 corner.append(quick);
 let wanted=false,sentinel=null,pending=false,generation=0,orientationLocked=false;
 const supported=!!navigator.wakeLock?.request;
 // An opt-in wake lock should follow actual foreground gameplay, not merely
 // an old started flag left behind by pause, playback or a spectator seat.
 function powerEligibility(){
  if(document.hidden||match.hidden)return{active:false,reason:'return to the visible pitch'};
  if(typeof document.hasFocus==='function'&&!document.hasFocus())
   return{active:false,reason:'focus the game window'};
  if(typeof started==='undefined'||started!==true)
   return{active:false,reason:'start a live match'};
  if(typeof paused!=='undefined'&&paused)
   return{active:false,reason:'resume the paused match'};
  if(typeof replay!=='undefined'&&replay)
   return{active:false,reason:'leave replay playback'};
  if(typeof menuOpen!=='undefined'&&menuOpen)
   return{active:false,reason:'close the match menu'};
  if(document.querySelector?.('dialog[open]'))
   return{active:false,reason:'close the open dialog'};
  if(document.getElementById('mode')?.value==='watch')
   return{active:false,reason:'switch from watching to playing'};
  // Never keep an online spectator device awake just because the server
  // match continues. Native server admission and team state stay authoritative.
  const online=typeof serverLink!=='undefined'&&!!serverLink?.room;
  const guest=typeof peerConnected!=='undefined'&&peerConnected&&
   typeof peerRole!=='undefined'&&peerRole==='guest';
  if(online||guest){
   const mine=typeof networkPlayerId!=='undefined'?networkPlayerId:1;
   const players=typeof room!=='undefined'?room?.state?.players:null;
   if(!Array.isArray(players))return{active:false,reason:'wait for the active player roster'};
   const player=players.find(p=>p.id===mine);
   if(!player||![1,2].includes(player.team?.id))
    return{active:false,reason:'enter an active playing team'};
  }
  return{active:true,reason:'playing on the visible pitch'};
 }
 const active=()=>powerEligibility().active;
 function render(message){
  wake.disabled=quick.disabled=!supported;
  wake.textContent=wanted?'Allow normal screen sleep':'Keep screen awake';
  const eligibility=powerEligibility();
  quick.textContent=!supported?'☀ UNAVAILABLE':sentinel?'☀ AWAKE ON':
   wanted?'☀ ARMED':'☀ AWAKE OFF';
  quick.setAttribute('aria-pressed',String(wanted));
  quick.title=!supported?'Screen Wake Lock is unavailable here':wanted?
   'Disable opt-in screen wake protection':'Enable screen protection for this match';
  fullscreen.textContent=document.fullscreenElement?'Leave fullscreen':'Enter fullscreen';
  if(message)status.textContent=message;
  else if(!supported)status.textContent='Screen Wake Lock is unavailable in this browser or context. Fullscreen may still work.';
  else if(sentinel)status.textContent='Screen stay-awake active on the visible match. Device may revoke it.';
  else if(wanted)status.textContent=pending?'Requesting display access…':
   'Armed · '+(eligibility.active?'waiting for device activation':
    eligibility.reason)+'. Screen wake protection resumes automatically only during active play.';
  else status.textContent='Off · normal device sleep rules apply.';
 }
 async function release(){
  generation++;
  const previous=sentinel;sentinel=null;
  if(previous){try{await previous.release();}catch{}}
  render();
 }
 async function acquire(){
  if(!supported||!wanted||!active()||pending||sentinel)return;
  pending=true;const serial=++generation;render();
  try{
   const lock=await navigator.wakeLock.request('screen');
   if(serial!==generation||!wanted||!active()){
    try{await lock.release();}catch{}
    return;
   }
   sentinel=lock;
   lock.addEventListener('release',()=>{
    if(sentinel!==lock)return;
    sentinel=null;wanted=false;
    // Do not spin or retry if the OS revokes a foreground lock.
    // A later visibility change or explicit user action may retry.
    render('Display protection was released by the device. Tap Keep screen awake to retry.');
   },{once:true});
   render();
  }catch{
   if(serial===generation){
    wanted=false;
    render('Screen wake permission is unavailable or denied. Normal screen sleep restored.');
   }
  }finally{
   pending=false;
   if(serial!==generation&&wanted&&active()&&!sentinel)acquire();
  }
 }
 async function toggleWake(){
  if(!supported){render();return;}
  wanted=!wanted;
  if(!wanted){await release();return;}
  render();
  if(active())await acquire();
 }
 wake.onclick=toggleWake;quick.onclick=toggleWake;
 async function unlockOrientation(){
  if(!orientationLocked)return;
  orientationLocked=false;
  try{screen.orientation?.unlock?.();}catch{}
 }
 async function applyLandscape(){
  if(!landscape.checked||!document.fullscreenElement)return;
  try{
   if(typeof screen.orientation?.lock!=='function')throw Error('unsupported');
   await screen.orientation.lock('landscape');
   orientationLocked=true;render('Fullscreen landscape requested on this device.');
  }catch{
   orientationLocked=false;render('Fullscreen is active, but this browser did not allow landscape lock.');
  }
 }
 fullscreen.onclick=async()=>{
  try{
   if(document.fullscreenElement){
    await document.exitFullscreen();
    await unlockOrientation();
    render();return;
   }
   if(typeof match.requestFullscreen!=='function')throw Error('unsupported');
   await match.requestFullscreen();
   await applyLandscape();render();
  }catch{
   render('Fullscreen was declined by this browser or device.');
  }
 };
 landscape.addEventListener('change',async()=>{
  if(!landscape.checked){await unlockOrientation();render('Orientation returned to device control.');}
  else await applyLandscape();
 });
 document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement)unlockOrientation();
  render();
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){release();return;}
  if(wanted&&active())acquire();else render();
 });
 window.addEventListener('pagehide',()=>{wanted=false;release();unlockOrientation();});
 // Keep power behaviour aligned with the actual foreground match, not a menu
 // setting or an unverified claim that a match is still in progress.
 let lastActive=false;
 function syncMatchPower(){
  const now=active();
  if(!now&&(sentinel||pending))release();
  else if(now&&wanted&&!sentinel&&!pending)acquire();
  else if(now!==lastActive)render();
  lastActive=now;
 }
 // The client can pause, switch team, enter replay, navigate home or lose
 // server admission without a document visibility event. Synchronize locally
 // without messages, storage, an extra server timer or gameplay changes.
 setInterval(syncMatchPower,900);
 window.addEventListener('focus',syncMatchPower);
 window.addEventListener('blur',syncMatchPower);
 window.addEventListener('fuckball:native-session-state',syncMatchPower);
 for(const id of ['pauseButton','startButton','tabHome','tabPlay','tabGames'])
  document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(syncMatchPower));
 render();
})();
