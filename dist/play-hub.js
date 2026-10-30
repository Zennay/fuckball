'use strict';
// Play Hub: explicit entry points into existing game modes, never a new queue,
// substitute server, ranked claim, or replacement for native consent checks.
(function(){
 const home=document.getElementById('homeView');
 const hero=home?.querySelector('.hero-grid');
 if(!home||!hero)return;
 const node=(tag,value,klass)=>{
  const el=document.createElement(tag);
  if(value!==undefined&&value!==null)el.textContent=String(value);
  if(klass)el.className=klass;
  return el;
 };
 const action=(label,click,klass)=>{
  const el=node('button',label,klass);el.type='button';
  el.addEventListener('click',click);return el;
 };
 const STORAGE='fuckball.play-hub.v1';
 const playlists=['1v1','2v2','3v3','4v4'];
 const chooseFromStorage=()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
   return saved?.version===1&&playlists.includes(saved.mode)?saved.mode:'1v1';
  }catch{return '1v1';}
 };
 let playlist=chooseFromStorage();
 let nativeQueue={searching:false,ready:false,accepted:false,confirming:false,mode:null,waiting:0,needed:0,expiresAt:null,recovery:null};
 let postMatch=null,postMatchScore=null,postMatchInfo=null,postMatchOpen=null,postMatchRequest=null;
 let dismissedMatchKey=null;
 function verifiedResult(){
  // A client never fabricates a final score or grants an online rematch.
  // These values are only displayed after the native server reports the round.
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const state=link?.roomState,result=state?.lastResult;
  if(!link?.room||!state||state.started||!result||
     !Number.isSafeInteger(result.red)||!Number.isSafeInteger(result.blue)||
     result.red<0||result.blue<0||result.red>99||result.blue>99)return null;
  const round=Number.isSafeInteger(result.round)&&result.round>0?result.round:0;
  const key=[link.room,round,result.red,result.blue,result.winner].join(':');
  return{link,state,result,key};
 }
 function showNativeRematch(){
  const receipt=verifiedResult();
  if(!receipt)return false;
  document.getElementById('tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  else document.getElementById('matchMenuButton')?.click();
  if(typeof renderNextMatchPanel==='function')renderNextMatchPanel();
  const end=document.getElementById('nextMatchPanel');
  if(!end||end.hidden||document.getElementById('pauseMenu')?.hidden!==false)return false;
  end.scrollIntoView({block:'nearest',behavior:'auto'});
  // Consent, request and new-game authority remain exactly the native buttons.
  const preferred=['rematchAccept','rematchRequest','nextGame']
   .map(id=>document.getElementById(id))
   .find(button=>button&&!button.hidden&&!button.disabled);
  if(preferred)preferred.focus({preventScroll:true});
  else{end.tabIndex=-1;end.focus({preventScroll:true});}
  return true;
 }
 const heroFind=document.getElementById('heroFindMatch');
 const section=node('section',null,'play-hub');
 section.setAttribute('aria-label','Choose how to play Fuckball');
 const intro=node('header',null,'play-hub-header');
 const heading=node('div',null,'play-hub-heading');
 heading.append(node('span','START HERE · GAME MODES','play-hub-kicker'),
  node('h2','READY TO PLAY?'),
  node('p','Find a real human match, join a player room or train against local bots. The existing game controls remain in charge.'));
 const current=node('button','↗ Return to current game','play-hub-resume');
 current.type='button';current.hidden=true;
 current.addEventListener('click',()=>{
  if(activeState().pending){viewPendingConnection();return;}
  if(verifiedResult()){
   if(!showNativeRematch())announce('The final result is available, but the room menu could not open.');
   return;
  }
  document.getElementById('tabPlay')?.click();
 });
 intro.append(heading,current);
 // Native room joins may take time. Keep the in-flight connection observable
 // and cancellable from Home, without constructing a second socket or queue.
 const connectionCard=node('aside',null,'play-hub-connecting');
 connectionCard.hidden=true;
 connectionCard.setAttribute('aria-label','Online room connection in progress');
 const connectionHeading=node('strong','CONNECTING TO A ROOM');
 const connectionDetail=node('p','Waiting for the existing server connection.','play-hub-connecting-detail');
 connectionDetail.setAttribute('role','status');
 connectionDetail.setAttribute('aria-live','polite');
 const connectionActions=node('div',null,'play-hub-connecting-actions');
 function viewPendingConnection(){
  const state=activeState();
  if(!state.pending)return announce('Your connection changed. Check the current room status.');
  document.getElementById('tabPlay')?.click();
  if(typeof openDialog==='function'&&document.getElementById('networkDialog')?.open!==true)
   openDialog('networkDialog');
  announce('Opened the original online connection controls; no second connection was started.');
 }
 function cancelPendingConnection(){
  const state=activeState();
  if(!state.pending)return announce('The connection already changed. No disconnect was sent.');
  // The real native button invokes the original disconnect cleanup: WebSocket,
  // pending join state, access key, reconnect timers and local room controls.
  const native=document.getElementById('disconnectPeer');
  if(!native||native.disabled)return announce('The native disconnect control is not available.');
  native.click();
  announce('Cancelled the pending connection using the original room controls.');
  refresh();
 }
 const connectionView=action('↗ View connection',viewPendingConnection,'play-hub-secondary');
 const connectionCancel=action('× Cancel joining',cancelPendingConnection,'play-hub-connection-cancel');
 connectionActions.append(connectionView,connectionCancel);
 connectionCard.append(connectionHeading,connectionDetail,connectionActions);
 // One contextual, server-authorized room strip replaces digging through
 // the match menu/network dialog to return, invite friends or leave.
 // It is deliberately absent for human Quick Match: no private invites for
 // the server-controlled, ranked-independent matching queue.
 const activeRoomCard=node('aside',null,'play-hub-current-room');
 activeRoomCard.hidden=true;
 activeRoomCard.setAttribute('aria-label','Your current online room');
 const roomCopy=node('div',null,'play-hub-current-room-copy');
 const roomHead=node('strong','YOU ARE IN A ROOM');
 const roomDetail=node('p','','play-hub-current-room-detail');
 const roomAdmission=node('small','Invites use the server’s existing room access rules.','play-hub-current-room-admission');
 roomCopy.append(roomHead,roomDetail,roomAdmission);
 const currentRoomActions=node('div',null,'play-hub-current-room-actions');
 function currentInvitableRoom(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||link.quickMatchMode)return null;
  const invite=document.getElementById('inviteLink')?.value;
  if(!link.invite||link.invite!==invite)return null;
  return link;
 }
 function nativeRoomAction(id,description){
  const link=currentInvitableRoom();
  if(!link)return announce('Your previous room has ended. No '+description+' was sent.');
  const control=document.getElementById(id);
  if(!control||control.disabled)return announce('The original '+description+' control is unavailable.');
  control.click();
 }
 const roomReturn=action('↗ Return to match',()=>{
  if(!currentInvitableRoom())return announce('You are no longer connected to that room.');
  document.getElementById('tabPlay')?.click();
 },'play-hub-current-room-return');
 const roomCopyInvite=action('Copy invite',()=>nativeRoomAction('copyInvite','invite copy'),'play-hub-current-room-copy-link');
 const roomShareInvite=action('Share',()=>nativeRoomAction('shareInvite','invite share'),'play-hub-current-room-share');
 const roomLeave=action('Leave room',()=>{
  if(!currentInvitableRoom())return announce('The room has already ended.');
  if(typeof window.confirm==='function'&&
     !window.confirm('Leave your current online room? Your place in the match will be lost.'))return;
  nativeRoomAction('disconnectPeer','disconnect');
  announce('Leaving through the original online room controls.');
 },'play-hub-current-room-leave');
 currentRoomActions.append(roomReturn,roomCopyInvite,roomShareInvite,roomLeave);
 activeRoomCard.append(roomCopy,currentRoomActions);
 const grid=node('div',null,'play-hub-grid');
 const human=node('article',null,'play-hub-card play-hub-human');
 const humanCopy=node('div');
 humanCopy.append(node('span','01 · ONLINE · REAL PLAYERS','play-hub-label'),
  node('h3','HUMAN QUICK MATCH'),
  node('p','Choose 1v1, 2v2, 3v3 or 4v4. Sign in, search and accept a match using the existing server-owned ready check. No bots or ranked rating.'));
 const modes=node('div',null,'play-hub-formats');
 modes.setAttribute('role','group');modes.setAttribute('aria-label','Preferred human Quick Match size');
 const modeButtons=new Map();
 const status=node('p','Choose your format, then open the real Quick Match controls.','play-hub-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const primary=action('Configure human Quick Match →',openQueue,'play-hub-primary');
 const queueNow=action('▶ Find 1v1 now',findHumanNow,'play-hub-queue-now');
 queueNow.title='Start the real human matchmaking queue with one deliberate click. Every player still has to accept the ready check.';
 const queueCancel=action('× Cancel current search',()=>{
  const native=home.querySelector('.quick-queue-actions button:not([hidden])');
  if(!native||native.disabled||!nativeQueue.searching||nativeQueue.ready)
   return announce('The human search is no longer active. No cancellation was sent.');
  native.click();
  announce('Cancelled the search using the existing server-owned queue controls.');
 },'play-hub-cancel');
 queueCancel.hidden=true;
 const recoveryCard=node('section',null,'play-hub-recovery');
 recoveryCard.setAttribute('aria-label','Recover interrupted human search');
 recoveryCard.hidden=true;
 const recoveryHead=node('strong','SEARCH INTERRUPTED');
 const recoveryDetail=node('p','','play-hub-recovery-detail');
 const recoveryActions=node('div',null,'play-hub-recovery-actions');
 function nativeRecoveryAction(index){
  if(nativeQueue.searching||nativeQueue.ready||!nativeQueue.recovery)
   return announce('Search status changed. Review the current server-owned queue first.');
  const box=home.querySelector('.quick-queue-recovery:not([hidden])');
  const control=box?.querySelectorAll('.quick-queue-recovery-actions button')?.[index];
  if(!control||control.disabled)return announce('That recovery action is no longer available.');
  control.click();
 }
 const retrySearch=action('↻ Retry human match',()=>nativeRecoveryAction(0),'play-hub-retry');
 const recoveryServer=action('Change server',()=>nativeRecoveryAction(1),'play-hub-secondary');
 const recoveryDismiss=action('Dismiss',()=>nativeRecoveryAction(2),'play-hub-secondary');
 recoveryActions.append(retrySearch,recoveryServer,recoveryDismiss);
 recoveryCard.append(recoveryHead,recoveryDetail,recoveryActions);
 for(const mode of playlists){
  const b=action(mode,()=>chooseMode(mode),'play-hub-format');
  b.setAttribute('aria-label',mode+' human Quick Match, '+(2*Number(mode[0]))+' total real players');
  modes.append(b);modeButtons.set(mode,b);
 }
 human.append(humanCopy,modes,queueNow,queueCancel,recoveryCard,primary);
 const rooms=node('article',null,'play-hub-card');
 rooms.append(node('span','02 · ONLINE · CUSTOM ROOM','play-hub-label'),
  node('h3','PLAY WITH FRIENDS'),
  node('p','Browse host-published rooms or explicitly create your own. Existing room permissions, login rules and private invitations are enforced by the server.'));
 const roomActions=node('div',null,'play-hub-actions');
 roomActions.append(
  action('Browse rooms',openPublicRooms,'play-hub-secondary'),
  action('Join by invite',()=>{
   const state=activeState();
   if(state.server||state.pending||state.peer||state.inQueue||state.ready)
    return announce('Leave your active room or cancel your human matchmaking queue before joining another room.');
   openSection('.direct-invite-join','The invitation form is unavailable.',
    'Enter your invitation, then choose Join room. The server decides access.',
    'input[aria-label="Paste same-site room invitation URL or code"]');
  },'play-hub-secondary'),
  action('Create a room',()=>{
   if(!canSwitch('create a room'))return;
   const b=document.getElementById('quickOnline');
   if(!b||b.disabled)return announce('Creating a room is unavailable.');
   if(!startNativeCustomRoom(true))return announce('Existing room setup was not started.');
   announce('Opening existing room creation controls.');
  },'play-hub-secondary')
 );
 rooms.append(roomActions);
 const practice=node('article',null,'play-hub-card');
 practice.append(node('span','03 · LOCAL · NO ACCOUNT REQUIRED','play-hub-label'),
  node('h3','PRACTISE NOW'),
  node('p','Play against local AI with the original engine. These modes never send you into human matchmaking.'));
 const practiceActions=node('div',null,'play-hub-actions');
 practiceActions.append(
  action('▶ Solo 1v1',()=>startLocal('quickPractice','solo training'),'play-hub-secondary'),
  action('▶ Local 4v4',()=>startLocal('quickSquad','local 4v4'),'play-hub-secondary')
 );
 practice.append(practiceActions);
 const library=node('article',null,'play-hub-card');
 library.append(node('span','04 · ON YOUR DEVICE','play-hub-label'),
  node('h3','REWATCH & IMPROVE'),
  node('p','Open genuine recordings and your local practice tools. Replays are not proof of a server-ranked result.'));
 const libraryActions=node('div',null,'play-hub-actions');
 libraryActions.append(
  action('My Games →',()=>document.getElementById('tabReplay')?.click(),'play-hub-secondary'),
  action('Practice Lab',()=>openSection('.practice-lab','Practice Lab is unavailable.','Practice Lab opened.'),'play-hub-secondary')
 );
 library.append(libraryActions);
 const extras=node('details',null,'play-hub-extras');
 const extrasToggle=node('summary','More ways to play · practice and replays');
 extrasToggle.setAttribute('aria-label','Show local practice and replay options');
 const extrasGrid=node('div',null,'play-hub-extras-grid');
 extrasGrid.append(practice,library);extras.append(extrasToggle,extrasGrid);
 grid.append(human,rooms);
 const footer=node('div',null,'play-hub-footer');
 const hint=node('span','Online matchmaking needs a live server and human consent. Training is local.','play-hub-hint');
 const network=node('span',null,'play-hub-network');
 footer.append(hint,network);
 section.append(intro,connectionCard,activeRoomCard,grid,extras,status,footer);
 hero.insertAdjacentElement('afterend',section);
 function activeState(){
  // Never infer queue/match ownership from personal settings or browser online status.
  const server=typeof serverLink!=='undefined'&&!!serverLink?.room;
  const pending=typeof serverLink!=='undefined'&&!!serverLink&&!serverLink.room&&!serverLink.quickMatchMode;
  const peer=typeof peerConnected!=='undefined'&&!!peerConnected;
  const inQueue=!!home.querySelector('.quick-queue-actions button:not([hidden])');
  const ready=!!home.querySelector('.quick-ready:not([hidden])');
  const local=typeof started!=='undefined'&&!!started;
  const playingReplay=typeof replay!=='undefined'&&!!replay;
  return {server,pending,peer,inQueue,ready,local,playingReplay};
 }
 function announce(message){status.textContent=message;}
 function canSwitch(what){
  if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
   return void announce('Your room is reconnecting. Choose Stop reconnecting first before you '+what+'.');
  const state=activeState();
  if(state.pending)return void announce('An online room is still connecting. Cancel that connection explicitly before you '+what+'.');
  if(state.server||state.peer)
   return void announce('You are connected to a live room. Return to the match and leave it explicitly before you '+what+'.');
  if(state.inQueue||state.ready)
   return void announce('Finish or cancel the existing human search/ready check before you '+what+'.');
  if(state.local||state.playingReplay){
   if(!window.confirm('Leave your current local game or replay to '+what+'? Unsaved progress may be lost.'))return false;
  }
  return true;
 }
 function startLocal(id,name){
  if(!canSwitch('start '+name))return;
  const b=document.getElementById(id);
  if(!b||b.disabled)return announce(name+' is unavailable.');
  if(!quickPlay(id==='quickSquad'?'4v4':'bot',true)){
   announce(name+' could not start; the prior session remains.');return;
  }
  announce('Opened '+name+' via the original local game controls.');
 }
 function reveal(target,focusSelector){
  const details=target.matches('details')?target:target.querySelector('details');
  if(details)details.open=true;
  target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});
  const control=focusSelector?target.querySelector(focusSelector):
   target.querySelector('button:not([disabled]):not([hidden]),summary,input,select');
  if(control&&!control.disabled&&!control.hidden)control.focus({preventScroll:true});
 }
 function openSection(selector,error,success,focusSelector){
  const target=home.querySelector(selector);
  if(!target)return announce(error);
  reveal(target,focusSelector);announce(success);
 }
 function openPublicRooms(){
  const browser=home.querySelector('.room-browser');
  const toggle=browser?.querySelector('.room-browser-tools button[aria-expanded]');
  if(!browser||!toggle||toggle.disabled)
   return announce('The host-published room directory is unavailable. You can still join using an invite.');
  // The original browser owns public-room eligibility, refresh and server
  // admission. One explicit click expands it once; never close an open list.
  if(toggle.getAttribute('aria-expanded')!=='true')toggle.click();
  if(toggle.getAttribute('aria-expanded')!=='true')
   return announce('Could not open the room directory. You can still join by invite.');
  reveal(browser,'.room-browser-filters input[aria-label="Find a public room"]');
  announce('Showing the host-published directory from this website. Choose a room to request entry; listings do not grant access.');
 }
 function openQueue(){
  const state=activeState();
  if(state.server||state.pending||state.peer||state.local||state.playingReplay)
   return announce('A room is connecting or a game is open. Finish or leave it before searching for humans.');
  if(state.inQueue||state.ready)return openSection('.quick-queue-panel',
   'The existing human queue is unavailable.','Returning to your ongoing search or ready check.');
  const native=home.querySelector('.quick-queue-panel');
  if(!native)return announce('The real human matchmaking controls are not available.');
  const preferred=native.querySelector('select[aria-label="Preferred human Quick Match format"]');
  if(preferred){
   preferred.value=playlist;
   preferred.dispatchEvent(new Event('change',{bubbles:true}));
  }
  reveal(native);
  announce('Ready to search for '+playlist+'. Choose the native Find Match button to join; no search has started yet.');
 }
 function findHumanNow(){
  const state=activeState();
  if(nativeQueue.recovery&&!nativeQueue.searching&&!nativeQueue.ready){
   nativeRecoveryAction(0);return;
  }
  // This is a real, deliberate click from the player: forward it to the
  // existing native consent button, with exactly the same expiry/disabled gate.
  if(nativeQueue.ready){
   const box=home.querySelector('.quick-ready:not([hidden])');
   const accept=box?.querySelector('.quick-ready-actions button.primary');
   if(!nativeQueue.accepted&&accept&&!accept.disabled&&
      Number.isSafeInteger(nativeQueue.expiresAt)&&Date.now()<nativeQueue.expiresAt){
    accept.click();reveal(box);
    announce('Ready confirmation sent for '+nativeQueue.mode+'. Waiting for the server receipt; no acceptance is assumed.');
   }else if(box){
    reveal(box);
    announce(nativeQueue.accepted?'The server confirmed your readiness. Waiting for other humans.':
     nativeQueue.confirming?'Your confirmation is still awaiting the server receipt.':
     'Check the native ready deadline or retry explicitly if no receipt arrived.');
   }else announce('The ready check is no longer available.');
   return;
  }
  if(state.pending){viewPendingConnection();return;}
  if(state.server||state.peer||state.local||state.playingReplay){
   current.click();return;
  }
  if(state.inQueue||state.ready||nativeQueue.searching)
   return openSection('.quick-queue-panel','The human queue is unavailable.',
    'An existing search is active. You can cancel it there; no duplicate search was started.');
  const native=home.querySelector('.quick-queue-panel');
  const preferred=native?.querySelector('select[aria-label="Preferred human Quick Match format"]');
  const start=native?.querySelector('.quick-queue-shortcut-actions button.primary');
  // Never synthesize a network request, bypass the server-owned queue, or accept ready.
  if(!native||!preferred||!start||start.disabled)
   return openQueue();
  preferred.value=playlist;
  preferred.dispatchEvent(new Event('change',{bubbles:true}));
  if(!settings.account?.token){
   // Forward the same deliberate click to the native sign-in gate. It opens
   // the real account UI without starting a queue or inventing credentials.
   start.click();
   announce('Sign in or create a Fuckball account to find real players. Searching will require a new click after login.');
   return;
  }
  const address=document.getElementById('serverAddress')?.value.trim();
  if(!address){
   openQueue();
   if(typeof openDialog==='function'&&document.getElementById('networkDialog')?.open!==true)
    openDialog('networkDialog');
   announce('Choose a game server first. Connecting or searching never starts automatically.');
   return;
  }
  // Native start still validates URL, server authentication and account
  // permissions. This UI never opens its own socket or accepts ready checks.
  start.click();
  const feedback=native.querySelector('.quick-queue-status');
  if(feedback)feedback.tabIndex=-1;
  reveal(native,'.quick-queue-status');
  announce('Submitted your '+playlist+' request to the native controls. Check below for server acceptance or a connection error; each human must confirm.');
 }
 function chooseMode(mode){
  if(!playlists.includes(mode))return;
  playlist=mode;
  for(const [id,b] of modeButtons){
   const active=id===mode;
   b.classList.toggle('selected',active);
   b.setAttribute('aria-pressed',String(active));
  }
  primary.textContent='Configure '+mode+' human match →';
  queueNow.textContent='▶ Find '+mode+' now';
  const state=activeState();
  if(state.inQueue||state.ready){
   announce('You selected '+mode+' for next time. Your current queue or ready check was not changed.');
  }else announce('Selected '+mode+' · '+(2*Number(mode[0]))+' real players total. Open Quick Match to choose when to search.');
  try{localStorage.setItem(STORAGE,JSON.stringify({version:1,mode}));}
  catch{announce('Selected '+mode+' for this visit. Private browser preferences could not be saved.');}
 }
 function refresh(){
  const state=activeState();
  refreshPostMatch();
  const activeRoom=currentInvitableRoom();
  activeRoomCard.hidden=!activeRoom;
  // During an admitted friend room, focus Home on that ongoing match instead
  // of offering duplicate start actions that admission correctly rejects.
  section.classList.toggle('is-in-room',!!activeRoom);
  if(activeRoom){
   // Distinguish a real admitted lobby, live match and completed round. Never
   // infer server admission, room occupancy or player permissions locally.
   const state=activeRoom.roomState;
   const phase=state?.started?'MATCH LIVE':
    state?.lastResult?'MATCH COMPLETE · REMATCH AVAILABLE':'ROOM LOBBY';
   const role=activeRoom.isOwner?' · HOST':' · PLAYER / SPECTATOR';
   const head=phase+' · '+activeRoom.room;
   if(roomHead.textContent!==head)roomHead.textContent=head;
   const detail=phase+role+' · Invite friends or return to the match.';
   if(roomDetail.textContent!==detail)roomDetail.textContent=detail;
  }
  connectionCard.hidden=!state.pending;
  if(state.pending){
   const detail=document.getElementById('serverRoomStatus')?.textContent?.trim();
   const link=typeof serverLink!=='undefined'?serverLink:null;
   const timed=link?.admissionTimer!=null&&Number.isFinite(link.admissionStartedAt)&&
    Date.now()<link.admissionStartedAt+20000;
   const left=timed?Math.max(1,Math.ceil((link.admissionStartedAt+20000-Date.now())/1000)):null;
   const copy=(detail||'Waiting for the existing server handshake.').slice(0,180)+
    (link?.quickQueueAcknowledged?' Human-only queue acknowledged; no bots added.':
     left===null?' The connection outcome appears here.':
      ' '+left+'s until '+(link.admissionStage==='opening'?'transport-open':'server-admission')+' timeout.')+
    ' View connection settings or cancel explicitly.';
   if(connectionDetail.textContent!==copy)connectionDetail.textContent=copy;
  }
  const canCancel=nativeQueue.searching&&!nativeQueue.ready;
  queueCancel.hidden=!canCancel;
  queueCancel.disabled=!canCancel;
  const recovery=nativeQueue.recovery;
  recoveryCard.hidden=!recovery||nativeQueue.searching||nativeQueue.ready;
  if(!recoveryCard.hidden){
   const text=String(recovery.reason||'The human queue ended. Try again or choose another server.').slice(0,180);
   if(recoveryDetail.textContent!==text)recoveryDetail.textContent=text;
   recoveryHead.textContent=recovery.party?'FRIENDS PARTY SEARCH ENDED':'SEARCH INTERRUPTED';
   retrySearch.textContent=recovery.party?'↗ Return to friends party':
    '↻ Retry '+recovery.mode+' human match';
  }
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const postGame=!!link?.room&&!!link.roomState?.lastResult&&!link.roomState?.started&&
   !document.getElementById('nextMatchPanel')?.hidden;
  if(state.pending){
   queueNow.textContent='↗ View online connection';queueNow.disabled=false;
  }else if(nativeQueue.ready){
   const remaining=Math.max(0,Math.ceil((nativeQueue.expiresAt-Date.now())/1000));
   queueNow.textContent=nativeQueue.accepted?'✓ Ready · waiting for players':
    nativeQueue.confirming?'… Waiting for server receipt · '+remaining+'s':
    '✓ Accept '+nativeQueue.mode+' match · '+remaining+'s';
   queueNow.disabled=nativeQueue.accepted||nativeQueue.confirming||remaining===0;
  }else if(nativeQueue.searching||state.inQueue){
   queueNow.textContent='↗ View current human search';queueNow.disabled=false;
  }else if(state.server||state.peer||state.local||state.playingReplay){
   queueNow.textContent='↗ Return to current game';queueNow.disabled=false;
  }else if(recovery){
   queueNow.textContent=recovery.party?'↗ Return to friends party':
    '↻ Retry '+recovery.mode+' human match';queueNow.disabled=false;
  }else{
   queueNow.textContent='▶ Find '+playlist+' now';queueNow.disabled=false;
  }
  if(heroFind){
   const label=state.pending?'VIEW ROOM CONNECTION':
    nativeQueue.ready?(nativeQueue.accepted?'SERVER CONFIRMED · WAITING FOR PLAYERS':
     nativeQueue.confirming?'SENDING READY CONFIRMATION':
     'ACCEPT MATCH · '+Math.max(0,Math.ceil((nativeQueue.expiresAt-Date.now())/1000))+'s'):
    nativeQueue.searching||state.inQueue?'VIEW CURRENT SEARCH':
    state.server||state.peer||state.local||state.playingReplay?'RETURN TO GAME':
    recovery?(recovery.party?'VIEW FRIENDS PARTY':'RETRY HUMAN MATCH'):
    'FIND A QUICK MATCH';
   if(heroFind.dataset.playStateLabel!==label){heroFind.textContent=label+' ↗';heroFind.dataset.playStateLabel=label;}
   heroFind.disabled=nativeQueue.ready&&(nativeQueue.accepted||nativeQueue.confirming);
  }
  current.hidden=!(state.pending||state.server||state.peer||state.local||state.playingReplay);
  if(state.pending){
   current.textContent='↗ View connecting room';
   network.textContent='● CONNECTING · YOU CAN CANCEL';
  }else if(state.server||state.peer){
   current.textContent=postGame?'↗ Review result / rematch':'↗ Return to online room';
   network.textContent='● ONLINE ROOM ACTIVE';
  }else if(nativeQueue.ready){
   network.textContent=nativeQueue.accepted?'● SERVER CONFIRMED · WAITING FOR OTHERS':
    nativeQueue.confirming?'● READY SENT · WAITING FOR SERVER RECEIPT':
    '● ACTION NEEDED · CONFIRM HUMAN MATCH';
  }else if(nativeQueue.searching||state.inQueue){
   network.textContent='● HUMAN SEARCH · '+nativeQueue.waiting+' OF '+nativeQueue.needed+' AVAILABLE';
  }else if(recovery){
   network.textContent=recovery.party?
    '● PARTY SEARCH ENDED · RESTART VIA FRIENDS PARTY':
    '● SEARCH INTERRUPTED · RETRY OR CHANGE SERVER';
  }else if(state.local||state.playingReplay){
   current.textContent='↗ Return to '+(state.playingReplay?'replay':'local game');
   network.textContent='● LOCAL GAME ACTIVE';
  }else if(navigator.onLine===false){
   network.textContent='● OFFLINE · ONLINE MATCHES UNAVAILABLE';
  }else if(!settings.account?.token){
   network.textContent='● SIGN IN REQUIRED FOR HUMAN QUICK MATCH';
  }else if(!document.getElementById('serverAddress')?.value.trim()){
   network.textContent='● SELECT A SERVER BEFORE HUMAN QUICK MATCH';
  }else{
   network.textContent='● SERVER SELECTED · CONNECTION NOT VERIFIED';
  }
 }
 // Keep one obvious, context-aware action at the very top. During a game
 // or an active search it cannot start another queue or silently abandon play.
 // Idle clicks still go through the original hero control unchanged.
 heroFind?.addEventListener('click',event=>{
  // The hero button now directly performs its advertised action for a guest,
  // an idle signed-in player, active queue and an ongoing native match.
  // The existing native Quick Match/ready gates always remain authoritative.
  event.preventDefault();
  event.stopImmediatePropagation();
  const state=activeState();
  if(state.pending)viewPendingConnection();
  else if(state.server||state.peer||state.local||state.playingReplay)current.click();
  else findHumanNow();
 },true);
 window.addEventListener('fuckball:quick-match-state',event=>{
  const data=event.detail;
  if(!data||typeof data.searching!=='boolean'||typeof data.ready!=='boolean')return;
  const newlyReady=data.ready&&!nativeQueue.ready;
  const newlyAccepted=data.accepted&&!nativeQueue.accepted;
  const safeRecovery=data.recovery&&typeof data.recovery==='object'&&
   [...playlists,'club4v4'].includes(data.recovery.mode)&&
   typeof data.recovery.reason==='string'?
   {mode:data.recovery.mode,party:data.recovery.party===true,
    reason:data.recovery.reason.slice(0,180)}:null;
  nativeQueue={...data,recovery:safeRecovery};
  if(newlyReady){
   announce('MATCH FOUND · '+data.mode+'. All real players must explicitly confirm before '+new Date(data.expiresAt).toLocaleTimeString()+'.');
   if(!document.hidden&&!home.hidden){
    const box=home.querySelector('.quick-ready:not([hidden])');
    if(box){
     box.scrollIntoView({block:'center',behavior:'auto'});
     box.querySelector('.quick-ready-actions button.primary:not([disabled])')?.focus({preventScroll:true});
    }
   }
  }else if(newlyAccepted)announce('Ready confirmed. Waiting for every other real player to accept.');
  refresh();
 });
 function refreshPostMatch(){
  if(!postMatch)return;
  const receipt=verifiedResult();
  postMatch.hidden=!receipt||dismissedMatchKey===receipt.key;
  if(!receipt)return;
  const {link,state,result}=receipt;
  const winner=result.winner===1?'RED WIN':result.winner===2?'BLUE WIN':'DRAW';
  const round=Number.isSafeInteger(result.round)&&result.round>0?'ROUND '+result.round+' · ':'';
  const score=round+winner+' · '+result.red+' : '+result.blue;
  if(postMatchScore.textContent!==score)postMatchScore.textContent=score;
  const vote=link.quickMatchMode?link.quickRematch:state.rematch;
  const waiting=Array.isArray(vote?.required)?vote.required.length:0;
  const accepted=Array.isArray(vote?.accepted)?vote.accepted.length:0;
  const requesting=typeof postgameRequestPending!=='undefined'&&
   postgameRequestPending?.link===link;
  const retry=typeof postgameRequestNotice!=='undefined'&&
   postgameRequestNotice?.link===link;
  const detail=requesting?'Server response pending · your request was sent; do not resubmit.':
   vote&&waiting>0?'Human rematch · '+accepted+' of '+waiting+' confirmed. Each player chooses.':
   retry?postgameRequestNotice.message:
   link.ws?.readyState!==1?'Server connection unavailable · reconnect before requesting a rematch.':
   'Official room result · next match remains server-controlled.';
  if(postMatchInfo.textContent!==detail)postMatchInfo.textContent=detail;
  postMatchOpen.textContent=requesting?'View pending server request →':
   vote?'Review rematch consent →':'Review result & rematch →';
 const eligible=!!result&&!vote&&(!!link.quickMatchMode||!!link.isOwner);
 postMatchRequest.hidden=!eligible;
 postMatchRequest.disabled=!!requesting||link.ws?.readyState!==1;
 postMatchRequest.textContent=requesting?'Waiting for server receipt…':
  link.ws?.readyState!==1?'Reconnect to request rematch':'↻ Request rematch';
 }
 // Local full-time has no server proposal: use the original offline
 // engine's result receipt and original native Start button for a rematch.
 // Keep this separate from the server-authoritative rematch ribbon above.
 let offlineFulltime=null,offlineFulltimeSerial=0,offlineFulltimeDismissed=null;
 const localCards=[];
 function offlineFulltimeResult(){
  if(!offlineFulltime||offlineFulltimeDismissed===offlineFulltime.id)return null;
  if(typeof room==='undefined'||room!==offlineFulltime.room||
     typeof serverLink!=='undefined'&&!!serverLink||
     typeof peerConnected!=='undefined'&&peerConnected||
     typeof peer!=='undefined'&&!!peer||
     typeof replay!=='undefined'&&!!replay){
   offlineFulltime=null;return null;
  }
  return offlineFulltime;
 }
 function canRepeatLocalMatch(item){
  return !!item&&typeof started!=='undefined'&&!started&&
   !room.gameState&&!document.getElementById('startButton')?.disabled;
 }
 function localRestart(){
  const entry=offlineFulltimeResult();
  if(!entry||!canRepeatLocalMatch(entry))
   return announce('Full time is still finishing, or that local match has ended. Review the game controls first.');
  const blocker=typeof pendingSessionBlock==='function'?pendingSessionBlock():'';
  if(blocker)return announce(blocker);
  const native=document.getElementById('startButton');
  native.click(); // Original offline reset reuses native teams / stadium.
  if(!started)return announce('The native match did not restart. Check the match controls.');
  offlineFulltime=null;
  offlineFulltimeDismissed=null;
  refreshOfflineFulltime();
  announce('New local round started with the same teams and stadium.');
 }
 function reviewLocalTeams(){
  const entry=offlineFulltimeResult();
  if(!entry)return announce('That local result is no longer active.');
  document.getElementById('tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  document.getElementById('startButton')?.focus?.({preventScroll:true});
 }
 function makeLocalFulltimeCard(inMenu){
  const card=node('section',null,'play-local-fulltime'+(inMenu?' play-local-fulltime-menu':''));
  card.hidden=true;
  card.setAttribute('aria-label','Finished local game');
  const copy=node('div',null,'play-local-fulltime-content');
  copy.append(node('span','FULL TIME · LOCAL GAME','play-local-fulltime-label'));
  const score=node('strong','','play-local-fulltime-score');
  const detail=node('p','','play-local-fulltime-detail');
  detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
  copy.append(score,detail);
  const actions=node('div',null,'play-local-fulltime-actions');
  const play=action('↻ Play again',localRestart,'primary');
  const review=action('Review teams',reviewLocalTeams,'');
  const dismiss=action('Dismiss',()=>{
   if(offlineFulltime)offlineFulltimeDismissed=offlineFulltime.id;
   refreshOfflineFulltime();
  },'');
  actions.append(play,review,dismiss);
  card.append(copy,actions);
  localCards.push({card,score,detail,play,review});
  return card;
 }
 const homeLocalFulltime=makeLocalFulltimeCard(false);
 intro.insertAdjacentElement('afterend',homeLocalFulltime);
 const originalLocalMatchMenu=document.getElementById('nextMatchPanel');
 if(originalLocalMatchMenu)
  originalLocalMatchMenu.insertAdjacentElement('afterend',makeLocalFulltimeCard(true));
 function refreshOfflineFulltime(){
  const receipt=offlineFulltimeResult(),ready=canRepeatLocalMatch(receipt);
  for(const {card,score,detail,play,review} of localCards){
   card.hidden=!receipt;
   if(!receipt)continue;
   const label=receipt.winner===1?'RED WINS':
    receipt.winner===2?'BLUE WINS':'DRAW';
   const nativeScore=Number.isSafeInteger(receipt.red)&&
    Number.isSafeInteger(receipt.blue)?' · '+receipt.red+' : '+receipt.blue:'';
   const head=label+nativeScore;
   if(score.textContent!==head)score.textContent=head;
   const info=ready?'Local-only result · restart with the same teams and stadium.':
    'Final whistle · the engine is finishing this round before another kickoff.';
   if(detail.textContent!==info)detail.textContent=info;
   play.disabled=!ready;
   review.disabled=false;
  }
 }
 window.addEventListener('fuckball:local-fulltime',event=>{
  const data=event.detail;
  if(!data||data.room!==room||![0,1,2].includes(data.winner))return;
  offlineFulltime={room:data.room,winner:data.winner,mode:data.mode,
   red:data.red,blue:data.blue,id:++offlineFulltimeSerial};
  offlineFulltimeDismissed=null;
  refreshOfflineFulltime();
 });
 window.addEventListener('fuckball:local-match-kickoff',()=>{
  offlineFulltime=null;offlineFulltimeDismissed=null;refreshOfflineFulltime();
 });
 const localFulltimeRefresh=setInterval(()=>{
  if(offlineFulltime)refreshOfflineFulltime();
 },600);
 localFulltimeRefresh?.unref?.();

 const observer=new MutationObserver(()=>refresh());
 const match=document.getElementById('matchView');
 if(match){
  postMatch=node('section',null,'play-postmatch-ribbon');
  postMatch.setAttribute('aria-label','Finished online match · next action');
  postMatch.hidden=true;
  const contents=node('div',null,'play-postmatch-content');
  contents.append(node('span','FULL TIME · NATIVE ONLINE RESULT','play-postmatch-eyebrow'));
  postMatchScore=node('strong','','play-postmatch-score');
  postMatchInfo=node('span','','play-postmatch-info');
  contents.append(postMatchScore,postMatchInfo);
  const controls=node('div',null,'play-postmatch-actions');
  postMatchOpen=action('Review result & rematch →',()=>{
   if(!showNativeRematch())postMatchInfo.textContent='Open the room menu to review this result.';
  },'play-postmatch-open');
  const dismiss=action('Watch pitch',()=>{
   const receipt=verifiedResult();
   if(receipt){dismissedMatchKey=receipt.key;refreshPostMatch();}
  },'play-postmatch-dismiss');
  // One explicit postgame click forwards to the original native request
  // gate. A guest cannot create a private-room proposal. Nothing auto-votes.
  postMatchRequest=action('↻ Request rematch',()=>{
   const receipt=verifiedResult();
   if(!receipt||typeof renderNextMatchPanel!=='function')return;
   renderNextMatchPanel();
   const original=document.getElementById('rematchRequest');
   if(!original||original.hidden||original.disabled){
    showNativeRematch();return;
   }
   original.click();
   refreshPostMatch();
   const pending=typeof postgameRequestPending!=='undefined'&&
    postgameRequestPending?.link===receipt.link;
   announce(pending?'Native rematch request sent · awaiting server response.':
    'Review the native match menu for current server status.');
  },'play-postmatch-request');
  controls.append(postMatchRequest,postMatchOpen,dismiss);postMatch.append(contents,controls);
  match.append(postMatch);
  observer.observe(match,{attributes:true,attributeFilter:['hidden']});
 }
 const next=document.getElementById('nextMatchPanel');
 if(next)observer.observe(next,{subtree:true,attributes:true,childList:true,characterData:true,attributeFilter:['hidden']});
 const q=home.querySelector('.quick-queue-panel');
 if(q)observer.observe(q,{subtree:true,attributes:true,attributeFilter:['hidden']});
 window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
 window.addEventListener('fuckball:native-session-state',refresh);
 // View-only 1-second countdown, never sends or retries any packet.
 const deadlineTicker=setInterval(()=>{if(!connectionCard.hidden&&!home.hidden)refresh();},1000);
 deadlineTicker?.unref?.();
 document.getElementById('tabHome')?.addEventListener('click',refresh);
 document.getElementById('tabPlay')?.addEventListener('click',refresh);
 window.addEventListener('focus',refresh);
 document.getElementById('serverAddress')?.addEventListener('change',refresh);
 document.getElementById('accountButton')?.addEventListener('click',refresh);
 const accountStatus=document.getElementById('accountStatus');
 if(accountStatus)observer.observe(accountStatus,{subtree:true,characterData:true,childList:true});
 chooseMode(playlist);refresh();
})();