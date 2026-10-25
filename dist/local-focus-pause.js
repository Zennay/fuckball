'use strict';
// A local sandbox/couch match must not keep advancing while nobody can
// control it. Online matches, room recovery and direct peers are authoritative
// shared sessions: never pause them on another player's behalf.
(function(){
 const match=document.getElementById('matchView');
 if(!match)return;
 const sheet=document.createElement('aside');
 sheet.className='local-focus-pause';
 sheet.hidden=true;
 sheet.setAttribute('role','region');
 sheet.setAttribute('aria-label','Local game paused when app lost focus');
 const copy=document.createElement('div');
 const heading=document.createElement('strong');
 heading.textContent='LOCAL MATCH PAUSED';
 const reason=document.createElement('p');
 reason.textContent='You switched away from the game. The score, players and recording are preserved. Resume only when everyone is ready.';
 reason.setAttribute('role','status');
 copy.append(heading,reason);
 const controls=document.createElement('div');
 controls.className='local-focus-pause-actions';
 const resume=document.createElement('button');
 resume.className='primary';resume.type='button';
 resume.textContent='▶ Resume local match';
 const menu=document.createElement('button');
 menu.type='button';menu.textContent='Match controls';
 controls.append(resume,menu);
 sheet.append(copy,controls);
 match.append(sheet);
 let pausedByFocus=false;
 function localSession(){
  return typeof started!=='undefined'&&started&&
   typeof serverLink!=='undefined'&&!serverLink&&
   typeof peerConnected!=='undefined'&&!peerConnected&&
   typeof peer!=='undefined'&&!peer&&
   typeof replay!=='undefined'&&!replay;
 }
 function paint(){
  if(pausedByFocus&&(!localSession()||!paused))pausedByFocus=false;
  sheet.hidden=!pausedByFocus||match.hidden||document.hidden;
  // Do not turn a manual pause into an automatic resume or steal game input.
  // The resume button remains the only new in-view continuation action.
 }
 function pauseWhenAway(){
  if(!localSession()||paused||match.hidden)return;
  // Reuse the original local pause implementation and input release.
  // Do not reset or stop the match, discard a recording, or send a network
  // pause to a guest/host/room. The user must explicitly resume later.
  togglePause();
  pausedByFocus=paused===true;
  if(pausedByFocus)reason.textContent='The game lost window focus. Score, players, and unsaved recording are preserved. Resume when ready.';
  paint();
 }
 // showView already safely pauses local-only matches on Home/My Games, but
 // the original focus-loss overlay never marked that pause as resumable.
 // Capture that exact local transition without pausing a server host,
 // peer match, replay, or an intentionally paused local match.
 const originalShowView=showView;
 showView=function(view){
  const leavingActiveLocal=view!=='play'&&!match.hidden&&localSession()&&!paused;
  originalShowView(view);
  if(leavingActiveLocal&&localSession()&&paused){
   pausedByFocus=true;
   heading.textContent='LOCAL MATCH PAUSED';
   reason.textContent='You switched to Home or My Games. Your local score, players, and recording are preserved. Return here to resume intentionally.';
  }
  paint();
 };
 resume.addEventListener('click',()=>{
  if(!pausedByFocus||!localSession()||!paused||document.hidden||match.hidden)return;
  togglePause();
  paint();
 });
 menu.addEventListener('click',()=>{
  if(match.hidden||!pausedByFocus)return;
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  else document.getElementById('matchMenuButton')?.click();
  paint();
 });
 window.addEventListener('blur',pauseWhenAway);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)pauseWhenAway();
  paint();
 });
 window.addEventListener('focus',paint);
 for(const id of ['pauseButton','startButton','resetButton','tabPlay','tabHome','tabReplay']){
  document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(paint));
 }
 // The existing P keyboard shortcut, native menu and local modes can change
 // pause state without a button click; this timer only mirrors their state.
 const refresh=setInterval(paint,700);
 refresh?.unref?.();
 paint();
})();
