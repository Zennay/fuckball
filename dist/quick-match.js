'use strict';
// Human-only Quick Match discovery. Search is never a bot simulation or ranked
// season, and the client cannot award ratings or start its own match.
(function(){
 const home=$('homeView');
 if(!home)return;
 const panel=document.createElement('section');panel.className='quick-queue-panel';
 panel.setAttribute('aria-label','Human Quick Match');
 const heading=document.createElement('div');heading.className='quick-queue-heading';
 const title=document.createElement('h2');title.textContent='QUICK MATCH.';
 const badge=document.createElement('span');badge.textContent='REAL PEOPLE · CASUAL';badge.className='quick-queue-badge';
 heading.append(title,badge);
 const description=document.createElement('p');
 description.textContent='Find real players on this server in 1v1–4v4. Teams are balanced using server career results, with a preference for similarly sized friend parties. No filler bots or ranked ratings.';
 const modes=document.createElement('div');modes.className='quick-queue-modes';
 const modeButtons=[],modeDetails=new Map();
 const playlistLabel=mode=>mode==='club4v4'?'Club vs Club 4v4':mode;
 const availability=document.createElement('p');availability.className='quick-queue-availability';
 availability.setAttribute('role','status');availability.setAttribute('aria-live','polite');
 availability.textContent='Live queue occupancy is loading · this server only; no estimated wait times.';
 const notice=document.createElement('p');notice.className='quick-queue-status';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 notice.textContent='Sign in with a Fuckball account to search for a match.';
 const actions=document.createElement('div');actions.className='quick-queue-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='× Cancel search';cancel.hidden=true;
 actions.append(cancel);
 const alertControls=document.createElement('div');alertControls.className='quick-queue-alerts';
 const alertButton=document.createElement('button');alertButton.type='button';
 const alertHelp=document.createElement('span');
 alertHelp.textContent='Optional browser alerts while this tab is in the background. No auto-accept, no push service.';
 alertControls.append(alertButton,alertHelp);
 const recovery=document.createElement('section');
 recovery.className='quick-queue-recovery';recovery.hidden=true;
 recovery.setAttribute('aria-label','Human Quick Match recovery');
 const recoveryHeading=document.createElement('strong');
 recoveryHeading.textContent='SEARCH INTERRUPTED';
 const recoveryReason=document.createElement('p');recoveryReason.setAttribute('role','status');
 const recoveryActions=document.createElement('div');recoveryActions.className='quick-queue-recovery-actions';
 const retry=document.createElement('button');retry.type='button';retry.className='primary';
 const changeServer=document.createElement('button');changeServer.type='button';
 const dismissRecovery=document.createElement('button');dismissRecovery.type='button';
 retry.textContent='↻ Retry human search';changeServer.textContent='⚙ Check game server';
 dismissRecovery.textContent='Dismiss';
 recoveryActions.append(retry,changeServer,dismissRecovery);
 recovery.append(recoveryHeading,recoveryReason,recoveryActions);
 const readyBox=document.createElement('section');readyBox.className='quick-ready';readyBox.hidden=true;
 readyBox.setAttribute('aria-label','Match ready check');
 const readyTitle=document.createElement('h3');readyTitle.textContent='MATCH FOUND.';
 const readyText=document.createElement('p');readyText.textContent='Confirm to play with real people.';
 const readyProgress=document.createElement('p');readyProgress.className='quick-ready-progress';
 readyProgress.setAttribute('role','status');readyProgress.setAttribute('aria-live','polite');
 const readyActions=document.createElement('div');readyActions.className='quick-ready-actions';
 const acceptReady=document.createElement('button');acceptReady.type='button';
 acceptReady.className='primary';acceptReady.textContent='✓ I’m ready';
 const declineReady=document.createElement('button');declineReady.type='button';declineReady.textContent='Decline';
 readyActions.append(acceptReady,declineReady);
 readyBox.append(readyTitle,readyText,readyProgress,readyActions);
 panel.append(heading,description,modes,availability,alertControls,notice,recovery,readyBox,actions);
 // The authentic server ready-check has a short deadline. If the player
 // navigated to My Games or the pitch, the original Home-only card is hidden.
 // Reflect it across views, forwarding explicit clicks to native consent only.
 const readyDock=document.createElement('aside');
 readyDock.className='quick-ready-dock';readyDock.hidden=true;
 readyDock.setAttribute('role','region');
 readyDock.setAttribute('aria-label','Human match ready confirmation');
 const readyDockCopy=document.createElement('div');
 readyDockCopy.className='quick-ready-dock-copy';
 const readyDockTitle=document.createElement('strong');
 readyDockTitle.textContent='REAL MATCH FOUND';
 const readyDockProgress=document.createElement('p');
 readyDockProgress.className='quick-ready-dock-progress';
 readyDockProgress.setAttribute('role','status');
 readyDockProgress.setAttribute('aria-live','polite');
 readyDockCopy.append(readyDockTitle,readyDockProgress);
 const readyDockActions=document.createElement('div');
 readyDockActions.className='quick-ready-dock-actions';
 const dockAccept=document.createElement('button');
 dockAccept.type='button';dockAccept.className='primary';
 const dockDecline=document.createElement('button');
 dockDecline.type='button';dockDecline.textContent='Decline';
 const dockReview=document.createElement('button');
 dockReview.type='button';dockReview.className='quick-dock-review';
 dockReview.textContent='View in Play';
 const dockRetry=document.createElement('button');
 dockRetry.type='button';dockRetry.className='quick-dock-retry';dockRetry.hidden=true;
 const dockDismiss=document.createElement('button');
 dockDismiss.type='button';dockDismiss.className='quick-dock-dismiss';dockDismiss.hidden=true;
 dockDismiss.textContent='Dismiss';
 readyDockActions.append(dockAccept,dockDecline,dockRetry,dockReview,dockDismiss);
 readyDock.append(readyDockCopy,readyDockActions);
 document.body.append(readyDock);
 function readyRemainingMs(){return ready?FuckballQuickReadyTime.remaining(ready.deadlineMono,performance.now()):0;}
 const canRespond=()=>!!ready&&readyRemainingMs()>0&&!readyDock.hidden;
 dockAccept.addEventListener('click',()=>{
  if(!canRespond()||readyAccepted||acceptReady.disabled)return;
  // The one original server-owned ready response (including proposal ID,
  // expiry and consent state) remains the only authority for acceptance.
  acceptReady.click();
 });
 dockDecline.addEventListener('click',()=>{
  if(!canRespond()||declineReady.disabled)return;
  declineReady.click();
 });
 // These are deliberate user clicks forwarded to the same native recovery
 // actions; never synthesize server acknowledgements or ready consent.
 dockRetry.addEventListener('click',()=>{
  if(ready||recovery.hidden||readyDock.hidden)return;
  retry.click();refresh();
 });
 dockDismiss.addEventListener('click',()=>{
  if(ready||recovery.hidden||readyDock.hidden)return;
  dismissRecovery.click();
 });
 dockReview.addEventListener('click',()=>{
  const recover=!ready&&!recovery.hidden;
  if(!ready&&!recover)return;
  document.getElementById('tabHome')?.click();
  (recover?recovery:readyBox).scrollIntoView({behavior:'auto',block:'center'});
  (recover?retry:readyAccepted?readyProgress:acceptReady).focus?.({preventScroll:true});
 });
 const cards=home.querySelector('.mode-cards')||home;
 cards.insertAdjacentElement('afterend',panel);
 // The chosen format is a private device preference. Queueing always requires
 // a deliberate user click and goes through the existing server authority.
 const PREF_KEY='fuckball.quick-match-preferred-mode.v1';
 const standardModes=['1v1','2v2','3v3','4v4'];
 function loadPreferred(){
  try{
   const saved=JSON.parse(localStorage.getItem(PREF_KEY)||'null');
   return saved?.version===1&&standardModes.includes(saved.mode)?saved.mode:'1v1';
  }catch{return'1v1';}
 }
 let preferred=loadPreferred();
 const shortcut=document.createElement('div');shortcut.className='quick-queue-shortcut';
 const shortcutCopy=document.createElement('div');shortcutCopy.className='quick-queue-shortcut-copy';
 const shortcutHead=document.createElement('strong');shortcutHead.textContent='YOUR QUICK START';
 const shortcutDesc=document.createElement('p');
 shortcutDesc.textContent='Choose your default format to join the real human queue with one deliberate click. No auto-join, ranked claims or filler bots.';
 shortcutCopy.append(shortcutHead,shortcutDesc);
 const shortcutActions=document.createElement('div');shortcutActions.className='quick-queue-shortcut-actions';
 const preferredLabel=document.createElement('label');preferredLabel.textContent='Preferred format';
 const preferredSelect=document.createElement('select');
 preferredSelect.setAttribute('aria-label','Preferred human Quick Match format');
 for(const mode of standardModes)preferredSelect.add(new Option(mode+' · '+(Number(mode[0])*2)+' humans',mode));
 preferredLabel.append(preferredSelect);
 const quickStart=document.createElement('button');quickStart.type='button';quickStart.className='primary';
 shortcutActions.append(preferredLabel,quickStart);shortcut.append(shortcutCopy,shortcutActions);
 panel.insertBefore(shortcut,modes);
 function setPreferred(mode,store=true){
  if(!standardModes.includes(mode))return;
  preferred=mode;preferredSelect.value=mode;
  quickStart.textContent='▶ Find '+mode+' match';
  quickStart.setAttribute('aria-label','Search for a real-player '+mode+' Quick Match');
  for(const b of modeButtons){
   b.classList.toggle('is-preferred',b.dataset.playlist===mode);
   b.title=b.dataset.playlist===mode?'Your preferred format':'Find real players for '+b.dataset.playlist;
  }
  if(store){
   try{localStorage.setItem(PREF_KEY,JSON.stringify({version:1,mode}));}
   catch{shortcutDesc.textContent='Preference is active for this visit; browser storage is unavailable.';}
  }
 }
 preferredSelect.onchange=()=>setPreferred(preferredSelect.value);
 quickStart.onclick=()=>start(preferred);
 setPreferred(preferred,false);
 let searching=false,matchMode=null,queuedAt=0,clock=null,waiting=0,needed=0;
 let lastAttempt=null;
 function hideRecovery(){recovery.hidden=true;}
 function showRecovery(reason){
  if(!lastAttempt){hideRecovery();return;}
  const reasonText=String(reason||'Search interrupted.').slice(0,160);
  if(lastAttempt.party){
   // A party launch is server-issued and expires. Reusing it or silently
   // requeueing could misrepresent other teammates' readiness.
   recoveryHeading.textContent='FRIENDS PARTY SEARCH ENDED';
   recoveryReason.textContent=reasonText+
    ' Return to your existing friends party. All teammates must ready up and the leader must explicitly start a new search.';
   retry.textContent='↗ Open friends party';
  }else{
   recoveryHeading.textContent='SEARCH INTERRUPTED';
   recoveryReason.textContent=reasonText+
    ' A new search needs another explicit click; no ready check is restored.';
   retry.textContent='↻ Retry '+lastAttempt.mode+' human search';
  }
  recovery.hidden=false;
 }
 retry.onclick=()=>{
  if(searching||ready||serverLink?.room||peerConnected){
   recoveryReason.textContent='Finish your current match, connection or ready check first.';return;
  }
  if(!lastAttempt){hideRecovery();return;}
  if(lastAttempt.party){
   // This is navigation, not a party launch, server request or automatic
   // restoration of an expired teammate consent.
   if(typeof window.openFriendParty==='function')window.openFriendParty();
   else recoveryReason.textContent='Open Friends → Party to arrange a new human search.';
   return;
  }
  const mode=lastAttempt.mode;
  try{if(serverLink?.quickMatchMode&&!serverLink.room)disconnect();}catch{}
  start(mode,false);
 };
 changeServer.onclick=()=>{
  if(searching||serverLink?.room){
   recoveryReason.textContent='Cancel the queue or leave the current room first.';return;
  }
  if(typeof openDialog==='function'){
   openDialog('networkDialog');document.getElementById('serverAddress')?.focus();
  }else recoveryReason.textContent='Open Online Rooms to configure the server.';
 };
 dismissRecovery.onclick=()=>{hideRecovery();refresh();};
 let ready=null,readyAccepted=false,readyConfirming=false,readyNoReceipt=false,readyReceiptTimer=null;
 function clearReadyReceipt(){
  if(readyReceiptTimer!==null){clearTimeout(readyReceiptTimer);readyReceiptTimer=null;}
  readyConfirming=false;readyNoReceipt=false;
 }
 let readyNotification=null,titleFlash=null,titleBeforeAlert=null,readyNotificationTimer=null;
 function clearReadyAlert(){
  if(titleFlash){clearInterval(titleFlash);titleFlash=null;}
  if(titleBeforeAlert!==null){document.title=titleBeforeAlert;titleBeforeAlert=null;}
  if(readyNotification){try{readyNotification.close();}catch{}readyNotification=null;}
  if(readyNotificationTimer){clearTimeout(readyNotificationTimer);readyNotificationTimer=null;}
 }
 function updateAlertButton(){
  const supported=typeof Notification!=='undefined'&&window.isSecureContext===true;
  const enabled=settings.quickMatchAlerts===true&&supported&&Notification.permission==='granted';
  alertButton.textContent=enabled?'🔔 Match alerts on · turn off':'🔕 Enable background match alerts';
  alertButton.setAttribute('aria-pressed',String(enabled));
  alertButton.disabled=!supported;
  if(!supported)alertHelp.textContent='Background notifications require an HTTPS or localhost browser with Notification support.';
  else if(Notification.permission==='denied')alertHelp.textContent='Notifications are blocked by your browser. Change site permissions to enable them.';
  else alertHelp.textContent='Optional browser alert during the 15-second ready check when this tab is hidden. You must return and confirm manually.';
 }
 alertButton.onclick=async()=>{
  if(settings.quickMatchAlerts===true){
   settings.quickMatchAlerts=false;savePrefs();clearReadyAlert();updateAlertButton();return;
  }
  if(typeof Notification==='undefined'||window.isSecureContext!==true)return;
  try{
   const permission=Notification.permission==='default'?
    await Notification.requestPermission():Notification.permission;
   settings.quickMatchAlerts=permission==='granted';savePrefs();updateAlertButton();
  }catch{alertHelp.textContent='The browser could not enable notifications.';}
 };
 updateAlertButton();
 function alertReady(mode,expiresAt){
  clearReadyAlert();
  if(settings.quickMatchAlerts!==true||typeof Notification==='undefined'||
     Notification.permission!=='granted'||!document.hidden)return;
  titleBeforeAlert=document.title;
  let highlight=false;
  titleFlash=setInterval(()=>{
   highlight=!highlight;
   document.title=highlight?'⚽ MATCH FOUND — CONFIRM':titleBeforeAlert;
  },800);
  try{
   readyNotification=new Notification('Fuckball · '+mode+' match found',{
    body:'Return to your game tab and confirm. Every human player must accept.',
    tag:'fuckball-ready-check',silent:false
   });
   readyNotification.onclick=()=>{window.focus();clearReadyAlert();};
  }catch{readyNotification=null;}
  readyNotificationTimer=setTimeout(clearReadyAlert,
   Math.max(500,Math.min(15000,readyRemainingMs())));
 }
 window.addEventListener('focus',clearReadyAlert);
 readyProgress.tabIndex=-1;
 // Navigation does not create a new match proposal or reset its countdown:
 // the dock merely follows the same state when the view is changed.
 for(const id of ['tabHome','tabPlay','tabGames'])
  document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(refresh));
 function refresh(){
  modeButtons.forEach(b=>b.disabled=searching);
  preferredSelect.disabled=quickStart.disabled=searching;
  if(typeof pulseAction!=='undefined')pulseAction.disabled=searching||!pulseMode;
  cancel.hidden=!searching;
  readyBox.hidden=!ready;
  // A floating read-only mirror is only needed when Home's native
  // controls are hidden behind another app view. The native buttons remain
  // the sole sender of ready / decline messages to the server.
  const recoveryOutsideHome=!ready&&!recovery.hidden&&home.hidden;
  readyDock.hidden=!(ready&&home.hidden)&&!recoveryOutsideHome;
  readyDock.classList.toggle('is-recovery',recoveryOutsideHome);
  readyDock.setAttribute('aria-label',recoveryOutsideHome?
   'Interrupted human match recovery':'Human match ready confirmation');
  if(recoveryOutsideHome){
   readyDock.classList.remove('is-confirmed');
   readyDockTitle.textContent=recoveryHeading.textContent;
   readyDockProgress.textContent=recoveryReason.textContent;
   dockAccept.hidden=true;dockDecline.hidden=true;
   dockRetry.hidden=false;dockDismiss.hidden=false;
   dockRetry.textContent=retry.textContent;
   dockReview.textContent='Review recovery in Play';
  }else{
   dockAccept.hidden=false;dockDecline.hidden=readyAccepted;
   dockRetry.hidden=true;dockDismiss.hidden=true;
   dockReview.textContent='View in Play';
  }
  if(ready){
   const seconds=Math.max(0,Math.ceil((readyRemainingMs())/1000));
   readyDockTitle.textContent=readyAccepted?'SERVER CONFIRMED · WAITING FOR HUMANS':
    readyConfirming?'SENDING READY · WAIT FOR SERVER':
    seconds===0?'READY CHECK EXPIRED':
    readyNoReceipt?'NO SERVER RECEIPT · TRY AGAIN':'MATCH FOUND · CONFIRM TO PLAY';
   const dockText=playlistLabel(ready.mode)+' · '+ready.ready+' of '+ready.players+
    ' real players confirmed · '+seconds+'s left'+
    (readyAccepted?' · the server confirmed your acceptance.':
     readyConfirming?' · awaiting server receipt.':
     readyNoReceipt?' · no receipt yet; explicitly retry if time remains.':'');
   if(readyDockProgress.textContent!==dockText)readyDockProgress.textContent=dockText;
   dockAccept.textContent=readyAccepted?'✓ Server confirmed':
    readyConfirming?'… Sending':'✓ I’m ready';
   // The mirror has its own expiry/accepted guard. Native buttons perform
   // the last validation on click; do not carry a stale disabled state from
   // the previous proposal while the new ready-check is rendering.
   dockAccept.disabled=readyAccepted||readyConfirming||seconds===0;
   // Once this exact proposal has a real server receipt, Decline cannot
   // reverse the accepted vote. The server would reject a second response.
   dockDecline.hidden=readyAccepted;
   dockDecline.disabled=readyAccepted||seconds===0;
  }
  if(ready){
   const remain=Math.max(0,Math.ceil((readyRemainingMs())/1000));
   readyTitle.textContent=readyAccepted?'SERVER CONFIRMED · WAITING FOR PLAYERS':
    readyConfirming?'SENDING READY · WAIT FOR SERVER':
    remain===0?'READY CHECK EXPIRED':'MATCH FOUND.';
   readyBox.classList.toggle('is-confirmed',readyAccepted);
   readyDock.classList.toggle('is-confirmed',readyAccepted);
   readyText.textContent=readyAccepted?
    'The server received your vote. Waiting for the remaining real people.':
    'All '+ready.players+' human players must confirm. Casual '+playlistLabel(ready.mode)+', no ranked rating.';
   readyProgress.textContent=ready.ready+' / '+ready.players+' confirmed · '+remain+
    's left'+(readyAccepted?' · Server received your acceptance; waiting for others.':
     readyConfirming?' · Sending your confirmation to the server…':
     readyNoReceipt?' · No server receipt; you may retry.':'');
   acceptReady.textContent=readyAccepted?'✓ Server confirmed':
    readyConfirming?'… Waiting for server':'✓ I’m ready';
   acceptReady.disabled=readyAccepted||readyConfirming||remain===0;
   declineReady.hidden=readyAccepted;
   declineReady.disabled=readyAccepted||remain===0;
   notice.textContent=readyAccepted?'Your acceptance was confirmed by the server. Waiting for other humans.':
    readyConfirming?'Waiting for the server to acknowledge your ready confirmation…':
    readyNoReceipt?'The server has not acknowledged your confirmation. Try again before time runs out.':
    'Your proposed match is waiting for every player to accept.';
  }else if(searching&&queuedAt){
   const duration=Math.max(0,Math.floor((performance.now()-queuedAt)/1000));
   // The client has only *requested* queue admission until the server
   // answers. Do not display made-up player occupancy while connecting.
   const acknowledged=serverLink?.quickQueueAcknowledged===true;
   notice.textContent=acknowledged?
    'Searching for '+playlistLabel(matchMode)+' · '+waiting+' of '+needed+
     ' human players available · '+duration+'s elapsed. No bots will be added.':
    'Connecting to the human-match server · '+duration+
     's elapsed. Server confirmation required before searching (20s timeout).';
  }
  // A read-only reflection of the real human queue. The Play landing page may
  // display it or forward an *explicit* player click to native ready controls.
  // No queue ownership, ready consent or server authority is transferred.
  if(typeof CustomEvent==='function'&&typeof window.dispatchEvent==='function')
   window.dispatchEvent(new CustomEvent('fuckball:quick-match-state',{detail:{
    searching,mode:matchMode,ready:!!ready,accepted:readyAccepted,
    confirming:readyConfirming,
    waiting,needed,expiresAt:ready?ready.expiresAt:null,remainingMs:readyRemainingMs(),
    recovery:!recovery.hidden&&lastAttempt&&
     [...standardModes,'club4v4'].includes(lastAttempt.mode)?{
      mode:lastAttempt.mode,party:lastAttempt.party===true,
      reason:recoveryReason.textContent.slice(0,180)
     }:null
   }}));
 }
 function stopClock(){if(clock){clearInterval(clock);clock=null;}}
 function done(message,offerRetry=false,forceRecovery=false){
  const wasSearching=searching;
  clearReadyAlert();clearReadyReceipt();searching=false;matchMode=null;ready=null;readyAccepted=false;
  stopClock();notice.textContent=String(message||'Search ended.').slice(0,240);
  if(offerRetry&&(wasSearching||forceRecovery))showRecovery(message);else hideRecovery();
  // Publish the *final* state after the native recovery choice exists.
  // Previously the landing page saw only an idle queue and could not offer retry.
  refresh();
 }
 function start(mode,party=false){
  if(searching)return;
  // A reconnect countdown and a pending/custom/native/direct-peer connection
  // must never be destroyed merely by pressing Find Match.
  const conflict=typeof onlineSessionConflict==='function'?onlineSessionConflict():null;
  if(conflict){notice.textContent=conflict;return;}
  if(serverLink?.room){notice.textContent='Leave your current room before starting another match.';return;}
  if(navigator.onLine===false){
   const offlineText='Your device is offline. Reconnect before trying another human search.';
   notice.textContent=offlineText;
   if(!recovery.hidden){recoveryReason.textContent=offlineText;refresh();}
   return;
  }
  if(!settings.account?.token){
   notice.textContent='Log in or create a free account, then select a playlist.';
   showJoinScreen('');return;
  }
  const address=$('serverAddress')?.value.trim();
  if(!address){
   notice.textContent='Configure a game server before searching for human opponents.';return;
  }
  try{
   const url=new URL(address);
   if(!['ws:','wss:'].includes(url.protocol)||!url.host||url.username||url.password||
      (location.protocol==='https:'&&url.protocol!=='wss:'))throw Error('invalid');
  }catch{
   notice.textContent='Invalid server address. Choose a compatible WebSocket server in Online Rooms.';
   return;
  }
  if(!party&&standardModes.includes(mode))setPreferred(mode);
  hideRecovery();lastAttempt={mode,party};
  clearReadyReceipt();
  searching=true;matchMode=mode;ready=null;readyAccepted=false;queuedAt=performance.now();waiting=1;needed=mode==='club4v4'?8:Number(mode[0])*2;
  refresh();stopClock();clock=setInterval(refresh,1000);
  // Native transport construction may fail by returning false *or* throwing.
  // Neither outcome may strand a human in an unacknowledged searching state.
  let connected=false;
  try{connected=connectServer(false,'','',null,mode,party)!==false;}catch{}
  if(!connected){
   // An interrupted constructor may leave a partial Quick Match socket.
   // Never tear down an already admitted room or unrelated peer session.
   if(serverLink?.quickMatchMode&&!serverLink.room){
    try{disconnect();}catch{}
   }
   done('Could not connect to the game server. Check Online Rooms and retry.',true);
  }
 }
 for(const mode of ['1v1','2v2','3v3','4v4']){
  const b=document.createElement('button');b.type='button';b.className='quick-queue-mode';b.dataset.playlist=mode;
  const name=document.createElement('strong');name.textContent=mode;
  const sub=document.createElement('small');
  sub.textContent=(Number(mode[0])*2)+' real players · one server';
  b.append(name,sub);b.onclick=()=>start(mode);
  modes.append(b);modeButtons.push(b);modeDetails.set(mode,sub);
 }
 setPreferred(preferred,false);
 // Discover honest, current occupancy only on this server, never estimated bots,
 // global concurrency, matchmaking guarantees or another player's identity.
 let listingRequest=0,addressTimer=null;
 const availabilityActions=document.createElement('div');
 availabilityActions.className='quick-queue-availability-actions';
 const manualRefresh=document.createElement('button');
 manualRefresh.type='button';manualRefresh.textContent='↻ Refresh queue counts';
 manualRefresh.setAttribute('aria-label','Refresh live occupancy of the selected game server');
 availabilityActions.append(manualRefresh);
 availability.insertAdjacentElement('afterend',availabilityActions);
 // Uses the same validated human-only queue snapshot as the four mode tiles.
 // Observed occupancy is NOT an ETA, matchmaking guarantee or ranking metric.
 const pulse=document.createElement('section');pulse.className='quick-queue-pulse';pulse.hidden=true;
 pulse.setAttribute('aria-label','Human queue snapshot suggestion');
 const pulseHead=document.createElement('strong');pulseHead.textContent='LIVE HUMAN QUEUE PULSE';
 const pulseDetail=document.createElement('p');pulseDetail.setAttribute('role','status');
 pulseDetail.setAttribute('aria-live','polite');
 const pulseAction=document.createElement('button');pulseAction.type='button';
 pulseAction.className='primary';
 const pulseWarning=document.createElement('small');
 pulseWarning.textContent='Occupancy on your selected server only. Not a wait estimate, ranked result, or promise of an opponent. Matchmaking and ready checks remain server-controlled.';
 pulse.append(pulseHead,pulseDetail,pulseAction,pulseWarning);
 availabilityActions.insertAdjacentElement('afterend',pulse);
 let pulseMode=null,pulseAt=0,previousPulse=null;
 const clearPulse=()=>{pulse.hidden=true;pulseMode=null;pulseAt=0;previousPulse=null;};
 pulseAction.addEventListener('click',()=>{
  if(!pulseMode||searching||document.hidden||home.hidden||
     !sameOriginGameServer().valid||performance.now()-pulseAt>25000){
   clearPulse();notice.textContent='Current queue snapshot expired. Refresh queue counts before choosing an observed playlist.';
   return;
  }
  // Every entry requires a fresh user click; never automatically changes queue.
  start(pulseMode);
 });
 function updatePulse(data){
  const candidates=standardModes.map(mode=>({mode,...data.modes[mode]}));
  candidates.sort((a,b)=>(b.waiting+b.confirming)-(a.waiting+a.confirming)||
    b.waiting-a.waiting||standardModes.indexOf(a.mode)-standardModes.indexOf(b.mode));
  const best=candidates[0],total=best.waiting+best.confirming;
  const delta=previousPulse&&previousPulse.mode===best.mode?
    total-previousPulse.total:null;
  previousPulse={mode:best.mode,total};pulseAt=performance.now();pulse.hidden=false;
  pulseMode=total>0?best.mode:null;
  pulseDetail.textContent=total?
   'Most occupied right now: '+best.mode+' · '+best.waiting+' waiting, '+best.confirming+
    ' confirming'+(delta===null?'':delta>0?' · '+delta+' more than last refresh':
      delta<0?' · '+Math.abs(delta)+' fewer than last refresh':' · unchanged since last refresh')+'.':
   'No human players waiting or confirming in these queues right now. Any playlist can still be started manually.';
  pulseAction.hidden=!pulseMode;pulseAction.disabled=searching||!pulseMode;
  pulseAction.textContent=pulseMode?'▶ Search '+pulseMode+' with real people':'';
 }

 const genericLabels=()=>{
  for(const [mode,sub]of modeDetails)
   sub.textContent=(Number(mode[0])*2)+' human players required';
 };
 // The selectable WS server and same-origin HTTP API may NOT point to the
 // same backend. Never present website occupancy as another server's queue.
 function sameOriginGameServer(){
  const address=document.getElementById('serverAddress')?.value.trim();
  if(!address)return{valid:false,label:'Choose a multiplayer server before checking its live queues.'};
  let selected;
  try{selected=new URL(address);}catch{
   return{valid:false,label:'Enter a valid ws:// or wss:// game server address.'};
  }
  if(!['ws:','wss:'].includes(selected.protocol))
   return{valid:false,label:'Queue status requires a websocket game server address.'};
  const scheme=location.protocol==='https:'?'wss:':'ws:';
  if(selected.host!==location.host||selected.protocol!==scheme||selected.pathname!=='/ws'||
     selected.username||selected.password||selected.search||selected.hash)
   return{valid:false,label:'Selected server: '+selected.host+'. Queue counts from this website may refer to another server, so they are hidden. You can still connect and search normally.'};
  return{valid:true};
 }
 async function loadAvailability(){
  if(document.hidden||home.hidden){clearPulse();return;}
  const requestId=++listingRequest;
  const selected=sameOriginGameServer();
  if(!selected.valid){
   clearPulse();genericLabels();availability.textContent=selected.label;manualRefresh.disabled=false;
   return;
  }
  if(navigator.onLine===false){
   clearPulse();genericLabels();availability.textContent='You appear offline · real-player queues require a connection.';
   manualRefresh.disabled=false;return;
  }
  manualRefresh.disabled=true;
  const abort=new AbortController();
  let timer=null;
  // AbortSignal normally cancels both HTTP and response.json(), but some
  // WebViews/service-worker handlers can stall body decoding indefinitely.
  // Race the entire response pipeline so manual Retry always recovers.
  const deadline=new Promise((_,reject)=>{
   timer=setTimeout(()=>{
    abort.abort();reject(Error('Live queue response timed out.'));
   },5000);
  });
  try{
   const data=await Promise.race([(async()=>{
    const response=await fetch('/api/quick-match/availability',{
     cache:'no-store',signal:abort.signal
    });
    if(!response.ok)throw Error('Live queue endpoint unavailable.');
    return response.json();
   })(),deadline]);
   if(requestId!==listingRequest||document.hidden||home.hidden)return;
   if(data?.humanOnly!==true||data.ranked!==false||!data.modes)
    throw Error('Queue response does not represent real players.');
   for(const [mode,sub]of modeDetails){
    const row=data.modes[mode];
    if(!row||row.needed!==Number(mode[0])*2||
       ![row.waiting,row.confirming].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=128))
     throw Error('Live queue response is invalid.');
   }
   for(const [mode,sub]of modeDetails){
    const row=data.modes[mode];
    sub.textContent=row.waiting+' waiting · '+row.confirming+
      ' confirming · '+row.needed+' needed';
   }
   updatePulse(data);
   window.dispatchEvent(new CustomEvent('fuckball:queue-availability',{detail:{
    modes:data.modes,humanOnly:data.humanOnly,ranked:data.ranked,server:location.host,at:Date.now(),observedMono:performance.now()
   }}));
   availability.textContent='Real-player queues on your selected server ('+location.host+') · refreshed just now. Ready-check acceptance is still required.';
  }catch{
   if(requestId!==listingRequest)return;
   window.dispatchEvent(new Event('fuckball:queue-unavailable'));
   clearPulse();genericLabels();availability.textContent='Live queue counts unavailable. Local games remain playable.';
  }finally{clearTimeout(timer);if(requestId===listingRequest)manualRefresh.disabled=false;}
 }
 manualRefresh.onclick=loadAvailability;
 // Autocomplete and server selection can commit through change alone;
 // both event paths must revoke any old verified occupancy immediately.
 function onServerAddressChange(){
  clearPulse();++listingRequest;clearTimeout(addressTimer);genericLabels();
  manualRefresh.disabled=false;
  window.dispatchEvent(new Event('fuckball:queue-unavailable'));
  availability.textContent='Checking whether live counts belong to your selected game server…';
  addressTimer=setTimeout(loadAvailability,450);
 }
 const selectedAddress=document.getElementById('serverAddress');
 selectedAddress?.addEventListener('input',onServerAddressChange);
 selectedAddress?.addEventListener('change',onServerAddressChange);
 // Moving to My Games or the pitch hides Home without a browser tab
 // visibilitychange. Revoke the old server snapshot at that transition,
 // regardless of whether navigation came from a click or a keyboard route.
 let homeWasVisible=!home.hidden;
 new MutationObserver(()=>{
  const visible=!home.hidden;
  if(visible===homeWasVisible)return;
  homeWasVisible=visible;
  ++listingRequest;clearTimeout(addressTimer);clearPulse();genericLabels();
  manualRefresh.disabled=false;
  window.dispatchEvent(new Event('fuckball:queue-unavailable'));
  // The same transition can hide a 15-second human ready check. Render the
  // real server-owned accept/decline mirror immediately on My Games/Play.
  refresh();
  if(visible){
   availability.textContent='Refreshing real-player counts for this server…';
   loadAvailability();
  }else availability.textContent='Queue counts paused outside Play. Return to refresh.';
 }).observe(home,{attributes:true,attributeFilter:['hidden']});
 setInterval(()=>{if(!document.hidden&&!home.hidden)loadAvailability();},15000);
 document.addEventListener('visibilitychange',()=>{
  // An observed human queue count is only evidence from the foreground
  // session. Invalidate any in-flight body as soon as the player leaves;
  // otherwise stale tiles keep claiming real opponents on return.
  ++listingRequest;
  clearPulse();genericLabels();manualRefresh.disabled=false;
  window.dispatchEvent(new Event('fuckball:queue-unavailable'));
  if(document.visibilityState==='visible'){
   availability.textContent='Refreshing real-player counts for this server…';
   clearReadyAlert();loadAvailability();
  }else{
   availability.textContent='Queue counts paused while this tab is hidden. Return to refresh.';
   // A player may background the browser AFTER the server sent the 15s
   // proposal. The original alert only ran at proposal-arrival time, so this
   // path would silently hide the only confirmation controls. Existing
   // opted-in browser notifications apply to the still-active proposal.
   // This never auto-accepts, requeues, renews or extends the server timer.
   if(ready&&!readyAccepted&&Number.isSafeInteger(ready.expiresAt)&&
      readyRemainingMs()>0)
    alertReady(ready.mode,ready.expiresAt);
  }
 });
 window.addEventListener('online',loadAvailability);
 window.addEventListener('offline',()=>{
  loadAvailability();
  // A real device-offline signal terminates only an unadmitted human search.
  // Do not silently requeue, renew consent, or disconnect a joined room.
  if(!searching||serverLink?.room||peerConnected)return;
  if(serverLink?.quickMatchMode&&!serverLink.room){
   try{disconnect();}catch{}
  }
  done('Network went offline. Reconnect and choose Retry to search again.',true);
 });
 loadAvailability();
 acceptReady.onclick=()=>{
  if(!ready||readyAccepted||readyConfirming||readyRemainingMs()<=0)return;
  // serverLink.send is deliberately a no-op on an unopened WebSocket.
  // Never treat a local click or that no-op as human consent acknowledged.
  if(!serverLink?.ws||serverLink.ws.readyState!==1){
   readyNoReceipt=true;refresh();return;
  }
  const id=ready.id;
  try{
   serverLink.send({type:'queueReadyResponse',id,accept:true});
   readyConfirming=true;readyNoReceipt=false;clearReadyAlert();refresh();
   // No automatic retry, auto-consent, or guessed receipt. Another explicit
   // click is allowed if the server has not acknowledged before the deadline.
   readyReceiptTimer=setTimeout(()=>{
    readyReceiptTimer=null;
    if(!ready||ready.id!==id||readyAccepted)return;
    readyConfirming=false;readyNoReceipt=true;refresh();
   },2300);
  }catch{
   readyConfirming=false;readyNoReceipt=true;refresh();
  }
 };
 declineReady.onclick=()=>{
  if(!ready||readyAccepted||readyRemainingMs()<=0)return;
  clearReadyReceipt();
  try{serverLink?.send({type:'queueReadyResponse',id:ready.id,accept:false});}catch{}
  disconnect();done('You declined the match. Search again when ready.');
 };
 cancel.onclick=()=>{
  if(!searching)return;
  try{serverLink?.send({type:'queueCancel'});}catch{}
  disconnect();done('Search cancelled. Choose another playlist whenever you want.');
 };
 window.startPartyQuickMatch=mode=>{
  if(!['2v2','3v3','4v4','club4v4'].includes(mode))return false;
  if(searching||serverLink?.room)return false;
  start(mode,true);return searching;
 };
 window.onQuickMatchEvent=d=>{
  if(d.type==='queueReady'){
   if(!searching||!Number.isSafeInteger(d.expiresAt)||typeof d.id!=='string'||
      d.mode!==matchMode||d.players!==needed||d.humanOnly!==true)return;
   // A repeated server proposal is not a new invitation to vote. In
   // particular, retain pending and acknowledged consent and the original
   // monotonic deadline; a replay cannot restart the human ready window.
   if(ready?.id===d.id){refresh();return;}
   clearReadyReceipt();
   ready={id:d.id,mode:d.mode,players:d.players,expiresAt:d.expiresAt,ready:0,
    deadlineMono:FuckballQuickReadyTime.deadline(d.expiresAt,d.serverNow,performance.now(),Date.now())};
   readyAccepted=false;refresh();alertReady(d.mode,d.expiresAt);
  }else if(d.type==='queueReadyProgress'){
   if(!ready||ready.id!==d.id)return;
   // Accepted votes only accumulate inside one proposal. Delayed
   // progress events must not make an acknowledged teammate disappear.
   if(Number.isSafeInteger(d.ready)&&d.ready>=ready.ready&&d.ready<=ready.players)
    ready.ready=d.ready;
   refresh();
  }else if(d.type==='queueReadyAccepted'){
   if(ready&&ready.id===d.id){
    clearReadyReceipt();readyAccepted=true;clearReadyAlert();
    if(Number.isSafeInteger(d.ready)&&d.ready>=0&&d.ready<=ready.players)
     ready.ready=Math.max(ready.ready,d.ready);
    refresh();
   }
  }else if(d.type==='queueReadyAborted'){
   if(!ready||ready.id!==d.id)return;
   ready=null;readyAccepted=false;clearReadyAlert();clearReadyReceipt();
   if(d.requeued===true){
    refresh();notice.textContent=(d.reason||'Not everyone accepted.')+' Searching again…';
   }else{
    // Decliners, silent players and expired sessions must explicitly
    // restart searching: never join the next match without a new action.
    try{disconnect();}catch{}
    done(d.reason||'Ready check ended. Start another search.',true);
   }
  }else if(d.type==='quickMatchFound'){
   done('Matched with '+d.players+' real people. Your casual '+playlistLabel(d.mode)+' game is starting.');
   notify('Real-player Quick Match '+playlistLabel(d.mode)+' · no bots, no ranked rating.');
  }else if(d.type==='quickMatchCancelled'){
   // A match can be cancelled before this client receives its room receipt.
   // In that case the original queue socket is still admission-owned;
   // release it or the next explicit human search hits a stale-session guard.
   // Preserve an already joined room so the player can inspect its result.
   const unadmitted=!!serverLink?.quickMatchMode&&!serverLink.room;
   if(unadmitted){
    try{disconnect();}catch{}
   }
   // A quickMatchFound receipt can precede room admission and already clear
   // searching. Still offer a human-initiated retry if this room never joined.
   done(d.reason||'Your match was cancelled.',true,unadmitted);
  }else if(d.type==='queueStatus'){
   if(d.status==='partyGathering'&&searching&&d.mode===matchMode&&d.humanOnly===true){
    notice.textContent='Gathering your party · '+d.waiting+' of '+d.needed+' teammates connected.';
   }else if(d.status==='waiting'&&searching&&d.mode===matchMode&&d.humanOnly===true){
    waiting=d.waiting;needed=d.needed;refresh();
   }else if(['cancelled','error','disconnected'].includes(d.status)&&
    (searching||(!ready&&serverLink?.quickMatchMode&&!serverLink.room))){
    // Match-found may clear searching before room admission. Terminal
    // status is still authoritative for that unadmitted Quick Match socket.
    // Never disconnect a successfully joined room or auto-queue again.
    const reason=d.reason||(d.status==='cancelled'?'Human search cancelled.':
     'Human match search ended on the server.');
    const unadmitted=!!serverLink?.quickMatchMode&&!serverLink.room;
    if(unadmitted){
     try{disconnect();}catch{}
    }
    done(reason,true,unadmitted);
   }
  }
 };
})();
