'use strict';
// Visible controller for the existing native room reconnect transport. It never
// stores an account token or private resume ticket, nor sends room messages.
(function(){
 const match=document.getElementById('matchView');
 if(!match)return;
 const panel=document.createElement('aside');
 panel.className='native-room-recovery';
 panel.hidden=true;
 panel.setAttribute('aria-label','Room connection recovery');
 panel.setAttribute('role','region');
 panel.tabIndex=-1;
 const tag=document.createElement('span');tag.className='native-room-recovery-tag';tag.textContent='ROOM CONNECTION';
 const title=document.createElement('h2');title.textContent='Connection interrupted';
 const description=document.createElement('p');description.className='native-room-recovery-description';
 const progress=document.createElement('p');progress.className='native-room-recovery-progress';
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const actions=document.createElement('div');actions.className='native-room-recovery-actions';
 const retry=document.createElement('button');retry.type='button';retry.className='primary';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Leave room';
 actions.append(retry,cancel);
 const note=document.createElement('p');note.className='native-room-recovery-note';
 note.textContent='Existing room and player identity are requested from the server. A restored slot is never guaranteed; no bot is substituted for you.';
 panel.append(tag,title,description,progress,actions,note);
 // Keep recovery visible while the player browses Home or My Games. The
 // original matchView is frequently hidden at the moment the socket drops.
 // This panel is strictly a view onto the existing reconnect/cancel callbacks.
 document.body.append(panel);
 // Recovery is not over until the native server actually admits the room.
 // After welcome, give players browsing Home/My Games an explicit way to
 // return to the ongoing match without moving their team or auto-resuming.
 const restored=document.createElement('aside');
 restored.className='native-room-restored';restored.hidden=true;
 restored.setAttribute('role','region');
 restored.setAttribute('aria-label','Server-confirmed room reconnection');
 const restoredText=document.createElement('div');
 const restoredTitle=document.createElement('strong');
 restoredTitle.textContent='ROOM CONNECTION RESTORED';
 const restoredDetail=document.createElement('p');
 restoredDetail.setAttribute('role','status');
 restoredDetail.setAttribute('aria-live','polite');
 restoredText.append(restoredTitle,restoredDetail);
 const restoredActions=document.createElement('div');
 restoredActions.className='native-room-restored-actions';
 const returnButton=document.createElement('button');
 returnButton.type='button';returnButton.className='primary';
 returnButton.textContent='↗ Return to match';
 const stayButton=document.createElement('button');
 stayButton.type='button';stayButton.textContent='Stay here';
 restoredActions.append(returnButton,stayButton);
 restored.append(restoredText,restoredActions);
 document.body.append(restored);
 let refreshTimer=null,deadline=0,handlers=null;
 let pendingWelcomeLink=null,restoredLink=null;
 function forgetRestored(){
  pendingWelcomeLink=null;restoredLink=null;restored.hidden=true;
 }
 function refreshRestored(){
  const link=typeof serverLink==='undefined'?null:serverLink;
  if(restoredLink&&(link!==restoredLink||!link.room)){
   forgetRestored();return;
  }
  restored.hidden=!restoredLink||!link?.room||!match.hidden;
 }
 function observeNativeSession(){
  const link=typeof serverLink==='undefined'?null:serverLink;
  if(pendingWelcomeLink){
   const expected=pendingWelcomeLink;
   pendingWelcomeLink=null;
   // A welcome-admitted native room is the *only* success receipt.
   // A failed or deliberately cancelled recovery cannot show success.
   if(link===expected&&link?.room&&link.reconnect===true){
    restoredLink=link;
    restoredTitle.textContent=link.identityChanged?
     'ROOM CONNECTED · NEW PLAYER ID':'ROOM CONNECTION RESTORED';
    restoredDetail.textContent=link.identityChanged?
     'The server admitted a new player identity. Review your team before continuing.':
     'The server accepted your room connection. Check the lineup before resuming play.';
   }
  }
  refreshRestored();
 }
 returnButton.addEventListener('click',()=>{
  if(!restoredLink||typeof serverLink==='undefined'||
     serverLink!==restoredLink||!serverLink.room){forgetRestored();return;}
  document.getElementById('tabPlay')?.click();
  forgetRestored();
 });
 stayButton.addEventListener('click',forgetRestored);
 window.addEventListener('fuckball:native-session-state',observeNativeSession);
 const restoredTicker=setInterval(refreshRestored,1000);
 restoredTicker?.unref?.();
 function hide(){
  // Native welcome calls hide immediately before publishing the admitted
  // room + native-session-state. Bind the resulting receipt to this *exact*
  // reconnect socket; any other socket/failed leave is ignored.
  if(handlers?.phase==='connecting'&&typeof serverLink!=='undefined'&&
     serverLink?.reconnect===true&&!serverLink?.room)
   pendingWelcomeLink=serverLink;
  if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null;}
  handlers=null;deadline=0;panel.hidden=true;
  retry.onclick=null;cancel.onclick=null;
 }
 function show(info){
  if(!info||!['waiting','connecting','offline','failed'].includes(info.phase))return;
  const firstAppearance=panel.hidden;
  hide();forgetRestored();handlers=info;panel.hidden=false;
  if(firstAppearance)panel.focus({preventScroll:true});
  tag.textContent=info.quickMatchMode?'HUMAN QUICK MATCH · '+info.quickMatchMode.toUpperCase():
   'ROOM CONNECTION';
  note.textContent=info.quickMatchMode?
   'This retry uses the server-issued ticket for your original human-only match. Only the server can restore your exact slot; no new search, replacement bot, or new player identity is created.':
   'Existing room and player identity are requested from the server. A restored slot is never guaranteed; no bot is substituted for you.';
  title.textContent=info.phase==='failed'?'Could not rejoin your room':
   info.phase==='offline'?'Your device is offline':
   info.phase==='connecting'?'Joining your room again…':'Connection interrupted';
  description.textContent=info.phase==='failed'?
   'Automatic attempts ended. Choose whether to try the original room again or leave.':
   info.phase==='offline'?
   'The browser reports no connection. We will continue when it reports being online again, unless you cancel.':
   info.phase==='connecting'?
   'Contacting the original room server. Your spot and match state are restored only if it accepts your identity.':
   'The connection dropped. We will retry this room automatically unless you cancel.';
  const current=Number.isSafeInteger(info.attempt)?info.attempt:0;
  const max=Number.isSafeInteger(info.max)?info.max:3;
  deadline=Number.isFinite(info.delay)&&info.delay>0?performance.now()+info.delay:0;
  function update(){
   const base=info.phase==='failed'?'Automatic reconnect stopped':
    info.phase==='offline'?'Waiting for the device to come online':
    info.phase==='connecting'?'Attempt '+current+' of '+max+' · contacting server':
    'Attempt '+current+' of '+max+' · retry in '+Math.max(0,Math.ceil((deadline-performance.now())/1000))+'s';
   progress.textContent=base;
  }
  update();
  if(deadline)refreshTimer=setInterval(update,250);
  retry.hidden=info.phase==='connecting';
  retry.textContent=info.phase==='failed'?'Try joining again':info.phase==='offline'?'Retry connection':'Reconnect now';
  retry.disabled=typeof info.retry!=='function';
  retry.onclick=()=>{if(handlers!==info)return;info.retry?.();};
  cancel.textContent=info.phase==='failed'?'Back to home':'Stop reconnecting';
  cancel.onclick=()=>{if(handlers!==info)return;info.cancel?.();};
 }
 window.FuckballRoomRecovery={show,hide};
 window.addEventListener('pagehide',()=>{
  hide();forgetRestored();clearInterval(restoredTicker);
 });
})();
