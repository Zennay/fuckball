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
 // Navigation automatically pauses local/couch games in views.js. Previously
 // this sheet knew only about window blur, so returning from My Games left
 // an unexplained paused match and no obvious resume path.
 // This small cross-view card uses the *same* match and its native controls;
 // it never restarts simulation, discards recording or pauses an online room.
 const returnCard=document.createElement('aside');
 returnCard.className='local-match-return-card';
 returnCard.hidden=true;
 returnCard.setAttribute('role','region');
 returnCard.setAttribute('aria-label','Local match ready to continue');
 const returnCopy=document.createElement('div');
 const returnHeading=document.createElement('strong');
 returnHeading.textContent='YOUR LOCAL MATCH IS SAVED IN PLACE';
 const returnInfo=document.createElement('p');
 returnInfo.textContent='Score, teams and any ongoing recording remain in this session. Return to the pitch, then resume when ready.';
 returnInfo.setAttribute('role','status');
 returnCopy.append(returnHeading,returnInfo);
 const returnActions=document.createElement('div');
 returnActions.className='local-match-return-actions';
 const back=document.createElement('button');
 back.type='button';back.className='primary';back.textContent='↗ Return to paused match';
 const dismiss=document.createElement('button');
 dismiss.type='button';dismiss.textContent='Keep browsing';
 returnActions.append(back,dismiss);
 returnCard.append(returnCopy,returnActions);
 document.body.append(returnCard);
 let pausedByFocus=false,dismissedReturn=false,pausedForBlockedControls=false;
 const chatForm=document.getElementById('chatForm');
 // A local solo/couch game has no remote referee who may pause on our behalf.
 // While a real settings dialog or the in-pitch composer owns input, the
 // original local engine must stop instead of letting bots score unattended.
 // The normal translucent match menu is deliberately NOT a blocking dialog.
 function blockedControls(){
  const dialog=document.querySelector?.('dialog[open]');
  if(dialog)return 'dialog';
  if(chatForm&&!chatForm.hidden&&!match.hidden)return 'chat';
  return '';
 }
 function localSession(){
  return typeof started!=='undefined'&&started&&
   typeof serverLink!=='undefined'&&!serverLink&&
   typeof peerConnected!=='undefined'&&!peerConnected&&
   typeof peer!=='undefined'&&!peer&&
   typeof replay!=='undefined'&&!replay;
 }
 function paint(){
  const local=localSession();
  // An internal screen transition can happen programmatically, not only
  // through Home / My Games button clicks. Ensure the local game stops before
  // the user loses control, using the original native pause path.
  const blocked=local?blockedControls():'';
  if(local&&(match.hidden||blocked)&&!paused)pauseWhenAway(blocked);
  // views.js already pauses local sessions when navigating. Adopt that
  // existing pause for the return UI; never resume automatically.
  if(local&&match.hidden&&paused)pausedByFocus=true;
  if(pausedByFocus&&(!local||!paused)){
   pausedByFocus=false;pausedForBlockedControls=false;
  }
  // A manually paused room stays manually paused; neither form nor dialog
  // reopening acquires ownership or automatically resumes a local match.
  if(pausedByFocus&&blocked)pausedForBlockedControls=true;
  if(pausedByFocus&&pausedForBlockedControls){
   reason.textContent=blocked==='dialog'?
    'A settings dialog is open. Your local score, players and recording are preserved. Close it before choosing Resume.':
    blocked==='chat'?
    'Chat input owns the controls. Your local match is paused until you finish composing and choose Resume.':
    'Your local match was paused while an overlay owned the controls. Resume when everybody is ready.';
  }else{
   reason.textContent='You switched away from the game. The score, players and recording are preserved. Resume only when everyone is ready.';
  }
  if(!local||!match.hidden)dismissedReturn=false;
  sheet.hidden=!pausedByFocus||match.hidden||document.hidden||!!blocked;
  returnCard.hidden=!local||!paused||!match.hidden||document.hidden||!!blocked||dismissedReturn;
 }
 function pauseWhenAway(cause=''){
  if(!localSession()||paused)return;
  // Reuse the original local pause implementation and input release.
  // Do not reset or stop the match, discard a recording, or send a network
  // pause to a guest/host/room. The user must explicitly resume later.
  togglePause();
  pausedByFocus=paused===true;
  pausedForBlockedControls=pausedByFocus&&(cause==='dialog'||cause==='chat');
  paint();
 }
 resume.addEventListener('click',()=>{
  if(!pausedByFocus||!localSession()||!paused||document.hidden||match.hidden||blockedControls())return;
  togglePause();
  paint();
 });
 menu.addEventListener('click',()=>{
  if(match.hidden||!pausedByFocus)return;
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  else document.getElementById('matchMenuButton')?.click();
  paint();
 });
 back.addEventListener('click',()=>{
  // Preserve paused state until the player explicitly taps Resume on the
  // original pitch. No silent game start, score reset or network mutation.
  if(!localSession()||!paused||!match.hidden)return;
  document.getElementById('tabPlay')?.click();
  queueMicrotask(paint);
 });
 dismiss.addEventListener('click',()=>{dismissedReturn=true;paint();});
 if(typeof MutationObserver!=='undefined'){
  // Handle both scripted view changes and modal/chat focus ownership
  // immediately. The existing bounded timer is a fallback, not the trigger
  // for a potentially unopposed 700ms of local simulation.
  const observer=new MutationObserver(paint);
  observer.observe(match,{attributes:true,attributeFilter:['hidden']});
  for(const dialog of document.querySelectorAll?.('dialog')||[])
   observer.observe(dialog,{attributes:true,attributeFilter:['open']});
  if(chatForm)observer.observe(chatForm,{attributes:true,attributeFilter:['hidden']});
 }
 window.addEventListener('blur',pauseWhenAway);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)pauseWhenAway();
  paint();
 });
 window.addEventListener('focus',paint);
 // Keyboard focus can move into an existing chat field without navigation.
 // Only local games are ever paused; native WebSocket/peer sessions are exempt.
 document.addEventListener?.('focusin',paint);
 for(const id of ['pauseButton','startButton','resetButton','tabPlay','tabHome','tabReplay']){
  document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(paint));
 }
 // The existing P keyboard shortcut, native menu and local modes can change
 // pause state without a button click; this timer only mirrors their state.
 const refresh=setInterval(paint,700);
 refresh?.unref?.();
 paint();
})();
