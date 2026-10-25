'use strict';
const NATIVE_ROOM_CODE=/^[A-HJ-NP-Z2-9]{8}$/; // Same alphabet as server-issued room IDs
const defaultServer=location.hostname.endsWith('.chatgpt.site')?'':(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';$('serverAddress').value=defaultServer;
$('preserveGuestSlot').checked=settings.guestReconnect===true;
$('preserveGuestSlot').onchange=()=>{settings.guestReconnect=$('preserveGuestSlot').checked;savePrefs();};
// Disconnect recovery is entirely client-side scheduling. Server authority,
 // account sessions, guest tickets, and any restored team slots remain unchanged.
const roomRecovery={timer:null,offlineRetry:null,context:null};
function clearRoomRecovery(){
 if(roomRecovery.timer!==null)clearTimeout(roomRecovery.timer);
 roomRecovery.timer=null;roomRecovery.offlineRetry=null;roomRecovery.context=null;
 window.FuckballRoomRecovery?.hide();
}
function cancelRoomRecovery(){
 if(serverLink?.recoveryAttempt)disconnect();
 else clearRoomRecovery();
 showView('home');
 notify('Room reconnect cancelled.');
}
function retryRoomRecovery(info,attempt){
 if(serverLink)return;
 clearRoomRecovery();
 if(navigator.onLine===false){offerRoomRecovery({...info,offline:true,tries:attempt===0?0:info.tries});return;}
 connectServer(false,info.room,info.name,
  {ticket:info.ticket,previousId:info.previousId,retries:attempt,roomRecovery:true});
 if(serverLink?.recoveryAttempt)window.FuckballRoomRecovery?.show({
  phase:'connecting',attempt:attempt||1,max:3,cancel:cancelRoomRecovery
 });
 else if(!serverLink)offerRoomRecovery({...info,tries:3,offline:false});
}
function offerRoomRecovery(info){
 if(!NATIVE_ROOM_CODE.test(info.room||''))return;
 clearRoomRecovery();roomRecovery.context=info;
 if(info.tries>=3){
  window.FuckballRoomRecovery?.show({
   phase:'failed',attempt:3,max:3,
   retry:()=>retryRoomRecovery({...info,tries:0},0),cancel:cancelRoomRecovery
  });return;
 }
 if(navigator.onLine===false){
  roomRecovery.offlineRetry=()=>retryRoomRecovery(info,info.tries+1);
  window.FuckballRoomRecovery?.show({
   phase:'offline',attempt:info.tries+1,max:3,
   retry:roomRecovery.offlineRetry,cancel:cancelRoomRecovery
  });return;
 }
 const attempt=info.tries+1,delay=1000*2**info.tries;
 roomRecovery.timer=setTimeout(()=>retryRoomRecovery(info,attempt),delay);
 window.FuckballRoomRecovery?.show({
  phase:'waiting',attempt,max:3,delay,
  retry:()=>retryRoomRecovery(info,attempt),cancel:cancelRoomRecovery
 });
}
window.addEventListener('online',()=>{const next=roomRecovery.offlineRetry;if(next)next();});
window.addEventListener('offline',()=>{
 if(roomRecovery.context&&roomRecovery.timer!==null)
  offerRoomRecovery({...roomRecovery.context,offline:true});
});
// Switching visible tabs is not an instruction to abandon a human room.
// Recovery remains active and its cancel action remains explicit/visible
// across Match, Home and My Games (including during a connection attempt).
// Real disconnect, pagehide, or deliberately joining another room still
// clears timers, preventing stale retry requests after a session change.
window.addEventListener('pagehide',clearRoomRecovery);
const originalQuickPlay=quickPlay;
quickPlay=function(...args){
 const launched=originalQuickPlay(...args);
 if(launched&&roomRecovery.context)clearRoomRecovery();
 return launched;
};
let offlineRoomLimits=null;
// Read-only UI notification: room admission and disconnect stay entirely native.
function notifyNativeSessionView(){
 if(typeof CustomEvent==='function'&&typeof window.dispatchEvent==='function')
  window.dispatchEvent(new CustomEvent('fuckball:native-session-state'));
}
const baseDisconnect=disconnect;disconnect=function(){clearRoomRecovery();clearNativeRematchVote();const link=serverLink;clearQuickRematchAlert(link);const oldLimits=offlineRoomLimits;offlineRoomLimits=null;serverLink=null;if(link?.spectatorProbeTimer)clearTimeout(link.spectatorProbeTimer);if(link?.net){link.net.close();clearInterval(link.netTimer);link.net=null;}hostLabel='';$('inviteButton').hidden=true;if(link){link.ws.onclose=null;if(link.ws.readyState===1)link.send({type:'leave'});link.ws.close();setRoomParam(null);}baseDisconnect();if(oldLimits){$('scoreLimit').querySelectorAll?.('option[data-online-limit]')?.forEach(option=>option.remove());$('timeLimit').value=oldLimits.time;$('scoreLimit').value=oldLimits.score;}networkPlayerId=2;rosterKey='';updateRoster();if(typeof refreshMenu==='function')refreshMenu();
 notifyNativeSessionView();};
const baseSetButtons=setButtons;setButtons=function(){baseSetButtons();if(serverLink?.isOwner){for(const id of ['startButton','resetButton','mode','stadium','scoreLimit','timeLimit','importStadium','editorButton','botDifficulty','joinRed','joinBlue','joinSpec','addBotRed','addBotBlue','swapTeams','allSpec'])$(id).disabled=!!replay;$('pauseButton').disabled=!started||!!replay;$('recordButton').disabled=!started||!!replay;}else if(serverLink){for(const id of ['joinRed','joinBlue','joinSpec','addBotRed','addBotBlue','watchBots','swapTeams','allSpec','scoreLimit','timeLimit','stadium'])$(id).disabled=true;}};
const baseReset=resetMatch;resetMatch=function(play=true){if(!serverLink)return baseReset(play);if(!serverLink.isOwner)return;serverLink.send({type:'configure',mode:['bot','2v2','4v4'].includes($('mode').value)?$('mode').value:'bot',stadium:Utils.exportStadium(stadium),difficulty:settings.difficulty,botLevels:settings.botLevels,teamProfile:settings.teamProfile,scoreLimit:+$('scoreLimit').value,timeLimit:+$('timeLimit').value,started:play,paused:false});};
const baseStartStop=startStop;startStop=function(){if(serverLink){if(serverLink.isOwner)serverLink.send({type:started?'stop':'start'});return;}baseStartStop();};$('startButton').onclick=startStop;
const baseTogglePause=togglePause;togglePause=function(){if(serverLink){if(!serverLink.isOwner||!started)return;paused=!paused;releaseInputs();serverLink.send({type:'pause',value:paused});setButtons();return;}baseTogglePause();};
const baseRecord=record;record=function(){if(serverLink){if(serverLink.isOwner)serverLink.send({type:'record'});return;}baseRecord();};$('recordButton').onclick=record;
const baseModeChange=$('mode').onchange;$('mode').onchange=()=>{if(serverLink)resetMatch(started);else baseModeChange();};
function clearQuickRematchAlert(link){
 if(link?.quickRematchNotice){try{link.quickRematchNotice.close();}catch{}link.quickRematchNotice=null;}
 if(link?.quickRematchTimer){clearTimeout(link.quickRematchTimer);link.quickRematchTimer=null;}
}
function showQuickRematchAlert(link){
 if(!settings.quickMatchAlerts||!document.hidden||!window.isSecureContext||
    typeof Notification==='undefined'||Notification.permission!=='granted')return;
 clearQuickRematchAlert(link);
 try{
  const notice=new Notification('Fuckball · Human rematch proposed',{
   body:'Return to the match menu to accept or decline within 45 seconds. No auto-accept.',
   tag:'fuckball-quick-rematch',silent:false
  });
  link.quickRematchNotice=notice;
  notice.onclick=()=>{window.focus();clearQuickRematchAlert(link);};
  link.quickRematchTimer=setTimeout(()=>clearQuickRematchAlert(link),45000);
 }catch{}
}
// One fail-closed admission gate for every native online entry point: Quick
// Match, invite joins, host creation and public-room admission. Only explicit
// Leave/Cancel may destroy an existing human session or reconnect plan.
function onlineSessionConflict(resumeContext=null,startingNewQueue=false){
 if(roomRecovery.context&&!resumeContext?.roomRecovery)
  return 'Your original room is reconnecting. Choose Stop reconnecting before starting another online session.';
 if(serverLink)
  return serverLink.room?
   'Leave your current online room explicitly before joining or creating another.':
   'Cancel the existing online connection or human search before starting another.';
 if(typeof peerConnected!=='undefined'&&peerConnected||
    typeof peer!=='undefined'&&peer)
  return 'Disconnect your direct-peer game or pending connection before starting an online room.';
 // Quick Match exposes its own Cancel button just before connecting. Do
 // not mistake that freshly initiated user action for a previous session.
 // All other entry points and existing ready checks remain blocked.
 if(document.querySelector('.quick-ready:not([hidden])')||
    !startingNewQueue&&document.querySelector('.quick-queue-actions button:not([hidden])'))
  return 'Cancel the active human queue or ready check before starting another online room.';
 return '';
}
function connectServer(create,roomId='',joinName='',resumeContext=null,quickMode=null,partyQueue=false,clubPractice=false,spectate=false){try{const address=$('serverAddress').value.trim();if(!address)throw Error('Enter a server address.');const url=new URL(address);if(!['ws:','wss:'].includes(url.protocol))throw Error('Use a ws:// or wss:// address.');if(location.protocol==='https:'&&url.protocol!=='wss:')throw Error('HTTPS requires a wss:// server.');
 // Validate room credentials and current-session ownership BEFORE any
 // destructive disconnect, view change, replay close or local HUD mutation.
 const blocked=onlineSessionConflict(resumeContext,!!quickMode);
 if(blocked)throw Error(blocked);
 const accessKey=!create&&!resumeContext&&!quickMode&&roomId?
 (document.getElementById('joinRoomAccessKey')?.value||''):'';
 if(accessKey&&url.protocol!=='wss:'&&!['localhost','127.0.0.1','::1'].includes(url.hostname))
  throw Error('Room access keys require a secure WSS connection.');
 disconnect();
 if(replay)closeReplay();
 showView(quickMode?'home':'play');
 if(!offlineRoomLimits)offlineRoomLimits={time:$('timeLimit').value,score:$('scoreLimit').value};
 const ws=new WebSocket(url),link={ws,temporaryRoomKey:accessKey||null,authToken:settings.account?.token||null,isOwner:false,quickMatchMode:quickMode||null,partyQueue:partyQueue===true,reconnect:!!resumeContext,recoveryAttempt:resumeContext?.roomRecovery===true,requestedSpectate:spectate===true&&!create&&!resumeContext&&!quickMode,joinName:joinName||settings.name,retries:resumeContext?.retries||0,previousId:resumeContext?.previousId,resumeTicket:resumeContext?.ticket||null,send:data=>{if(ws.readyState===1)ws.send(JSON.stringify(data));}};serverLink=link;ws.binaryType='arraybuffer';$('serverRoomStatus').textContent='Connecting…';
 notifyNativeSessionView();
 $('inviteBox').hidden=true;const sendJoin=()=>{link.send(quickMode?{type:'queueJoin',mode:quickMode,
 token:settings.account?.token||undefined,party:link.partyQueue,netcode:settings.netcode==='classic'?2:3}:
 {type:'join',create,clubPractice:clubPractice===true,room:roomId,name:joinName||settings.name,
 spectate:link.requestedSpectate||undefined,accessKey:link.temporaryRoomKey||undefined,token:settings.account?.token||undefined,
 netcode:settings.netcode==='classic'?2:3,mesh:peerHostingSupported(),
 resumeOptIn:settings.guestReconnect===true,resume:resumeContext?.ticket||undefined});
 link.temporaryRoomKey=null;
 const keyInput=document.getElementById('joinRoomAccessKey');
 if(keyInput)keyInput.value='';
 };
 ws.onopen=()=>{
  if(!link.requestedSpectate){sendJoin();return;}
  // Require a successful pre-join capability exchange: old room servers
  // must never receive a WATCH join that they would treat as a player.
  link.spectatorJoinAwaiting=true;
  link.send({type:'spectatorAdmissionInfo'});
  link.spectatorProbeTimer=setTimeout(()=>{
   if(serverLink!==link||!link.spectatorJoinAwaiting)return;
   link.failed=true;disconnect();showJoinScreen(roomId,
    'This server cannot guarantee spectator entry; no room was joined.');
  },4500);
 };ws.onerror=()=>{
  $('serverRoomStatus').textContent='Could not connect to server.';
  notifyNativeSessionView();
 };ws.onclose=event=>{if(serverLink!==link)return;if(link.quickMatchMode&&!link.room)window.onQuickMatchEvent?.({type:'queueStatus',status:'disconnected'});if(event?.code===4004){
    link.failed=true;
    if(settings.account?.token===link.authToken){settings.account=null;savePrefs();renderAccount();}
    disconnect();showView('home');notify('Your account session was revoked. Please sign in again.');return;
   }
   if(event?.code===4003){link.failed=true;disconnect();showView('home');notify('Removed from this room by the host.');return;}
   // A requested invite code is not proof of admission. Only a native
   // welcome-assigned room (or an already-authorized recovery attempt) may
   // trigger room recovery; otherwise the player stays in an explicit join
   // workflow and never claims to be reconnecting to an unjoined slot.
   const admitted=!!link.room;
   const retryingOriginal=link.recoveryAttempt===true&&resumeContext?.roomRecovery===true;
   const room=link.room||(retryingOriginal?roomId:'');
   const tries=link.retries||0,previousId=admitted?networkPlayerId:
    (link.previousId??networkPlayerId),ticket=link.resumeTicket,name=link.joinName;
   const retryJoin=!create&&!link.quickMatchMode&&!admitted&&!retryingOriginal&&
    NATIVE_ROOM_CODE.test(roomId);
   const retrySpectator=link.requestedSpectate;
   disconnect();if(link.failed)return;
   if(room&&!link.quickMatchMode){
    notify('Connection lost. Room recovery available.');
    offerRoomRecovery({room,tries,previousId,ticket,name});
   }else if(retryJoin){
    // No slot was ever admitted, so show a normal (manual) join retry. No
    // ticket is fabricated and no background reconnect is scheduled.
    showView('play');
    showJoinScreen(roomId,'The server connection ended before joining. Review the room and retry explicitly.');
    if(retrySpectator)$('joinSpectator').checked=true;
   }else notify('Disconnected.');
  };
 ws.onmessage=event=>{if(serverLink!==link)return;if(event.data instanceof ArrayBuffer){try{if(link.net)link.net.serverBinary(event.data);else receiveSnapshot(event.data);}catch{notify('Invalid server snapshot.');}return;}let d;try{d=JSON.parse(event.data);}catch{return;}
 if(link.spectatorJoinAwaiting){
  if(d.type==='spectatorAdmissionInfo'&&d.supported===true){
   link.spectatorJoinAwaiting=false;
   clearTimeout(link.spectatorProbeTimer);link.spectatorProbeTimer=null;
   sendJoin();return;
  }
  if(d.type==='error'||d.type==='spectatorAdmissionInfo'){
   link.failed=true;disconnect();showJoinScreen(roomId,
    'This server cannot guarantee spectator-only entry; no room was joined.');
   return;
  }
 }
 if(['queueStatus','queueReady','queueReadyAccepted','queueReadyProgress','queueReadyAborted','quickMatchFound','quickMatchCancelled'].includes(d.type)){
  if(d.type==='quickMatchFound'){link.quickMatchMode=d.mode;link.roomControl={locked:true};}
  if(d.type==='quickMatchCancelled')notify(d.reason||'Quick Match cancelled.');
  window.onQuickMatchEvent?.(d);
  return;
 }
 if(d.type==='quickRematchStatus'){
   // Room-local server policy, no client-chosen match result or permissions.
   const required=Array.isArray(d.required)&&d.required.length<=8?
    d.required.filter(id=>Number.isSafeInteger(id)&&id>0):[];
   const accepted=Array.isArray(d.accepted)&&d.accepted.length<=8?
    d.accepted.filter(id=>required.includes(id)):[];
   link.quickRematch=d.status==='pending'&&Number.isSafeInteger(d.id)&&
    Number.isSafeInteger(d.expiresAt)&&d.expiresAt>Date.now()?
    {id:d.id,required,accepted,expiresAt:d.expiresAt}:null;
   if(d.status!=='pending')clearQuickRematchAlert(link);
   if(d.status==='cancelled')notify(d.reason||'Quick Match rematch cancelled.');
   else if(d.status==='pending'&&!link.quickRematchSeen?.has(d.id)){
    link.quickRematchSeen??=new Set();
    link.quickRematchSeen.add(d.id);
    notify('Human rematch proposal · confirm in Match menu within 45s.');
    showQuickRematchAlert(link);
    if(!menuOpen)openMatchMenu();
   }
   renderNextMatchPanel();return;
  }
  if(d.type==='sessionRevoked'){
    link.failed=true;
    if(settings.account?.token===link.authToken){settings.account=null;savePrefs();renderAccount();}
    disconnect();showView('home');notify('Your account session was revoked. Please sign in again.');return;
   }
   if(d.type==='roomRemoved'){
  link.failed=true;
  const reason=typeof d.reason==='string'?d.reason.slice(0,160):'You were removed by the room host.';
  disconnect();showView('home');notify(reason);return;
 }
 if(d.type==='roomControl'){
  if(typeof d.locked==='boolean')link.roomControl={locked:d.locked,listed:d.listed===true,clubOnly:d.clubOnly===true,canClubLock:d.canClubLock===true,owner:d.owner,accountsOnly:d.accountsOnly===true,
    maxHumans:[8,12,16,24,64].includes(d.maxHumans)?d.maxHumans:64,
    connectedHumans:Number.isSafeInteger(d.connectedHumans)?d.connectedHumans:0,
    spectatorLimitSupported:d.spectatorLimitSupported===true&&!link.quickMatchMode,
    spectatorLimit:[0,4,8,16,64].includes(d.spectatorLimit)?d.spectatorLimit:64,
    spectatorCount:Number.isSafeInteger(d.spectatorCount)&&d.spectatorCount>=0&&d.spectatorCount<=64?d.spectatorCount:0,
    chatMuteUntil:Number.isSafeInteger(d.chatMuteUntil)&&d.chatMuteUntil>Date.now()?d.chatMuteUntil:null,
    chatMutes:Array.isArray(d.chatMutes)&&d.chatMutes.length<=128?d.chatMutes.filter(m=>Array.isArray(m)&&m.length===2&&Number.isSafeInteger(m[0])&&m[0]>0&&Number.isSafeInteger(m[1])&&m[1]>Date.now()):[],
    teamChatSupported:d.teamChatSupported===true&&!link.quickMatchMode,
    spectatorCheerSupported:d.spectatorCheerSupported===true&&!link.quickMatchMode,
    accessKeySupported:d.accessKeySupported===true&&!link.quickMatchMode,accessKeyRequired:d.accessKeyRequired===true,
    accessKeyRevision:Number.isSafeInteger(d.accessKeyRevision)&&d.accessKeyRevision>=0?d.accessKeyRevision:0,
    roomNoticeSupported:d.roomNoticeSupported===true&&!link.quickMatchMode,
    notice:d.notice&&typeof d.notice.text==='string'&&d.notice.text.length<=120&&
      typeof d.notice.by==='string'&&d.notice.by.length<=25&&
      Number.isSafeInteger(d.notice.at)?d.notice:null};
  window.renderCustomRoomAdmin?.();window.renderNativeChatMute?.();window.FuckballTeamChat?.sync();window.FuckballSpectatorCheer?.sync();window.FuckballRoomNotice?.sync();window.renderRoomAccessKey?.();return;
 }
 if(d.type==='chatModeration'){
   const until=Number.isSafeInteger(d.until)&&d.until>Date.now()?d.until:null;
   link.chatMutedUntil=d.muted===true?until:null;
   notify(until?'The room host muted your chat for up to 10 minutes.':'Your room chat is available again.');
   window.renderNativeChatMute?.();
   return;
  }
  if(d.type==='resumeTicket'){if(typeof d.ticket==='string'&&/^[0-9a-f]{64}$/.test(d.ticket))link.resumeTicket=d.ticket;return;}
 // Roster RTT is measured by a server-issued challenge, not by a client's claimed ping.
 if(d.type==='latencyProbe'){
  if(typeof d.nonce==='string'&&/^[a-f0-9]{24}$/.test(d.nonce))link.send({type:'latencyReply',nonce:d.nonce});
  return;
 }
 if(d.type==='latencyRoster'){
  if(Array.isArray(d.samples)&&d.measuredTo==='server'&&d.samples.length<=256){
   link.serverPings=new Map(d.samples.filter(s=>Array.isArray(s)&&s.length===2&&
    Number.isSafeInteger(s[0])&&s[0]>0&&(s[1]===null||
     Number.isSafeInteger(s[1])&&s[1]>=0&&s[1]<=10000)));
   renderRoomPings();
  }
  return;
 }
 if(d.type==='peering'){if(!link.net)startPeering(link,ws);return;}if(link.net&&link.net.handleServer(d))return;
 if(d.type==='welcome'){
  // Fail closed: an old server may silently ignore the new spectate option.
  // Never put a player who explicitly selected WATCH into an active lineup.
  if(link.requestedSpectate&&d.spectatorAdmission!==true){
   link.failed=true;disconnect();showJoinScreen(roomId||d.room,
    'This server cannot guarantee spectator entry. The join was cancelled.');return;
  }
  link.recoveryAttempt=false;window.FuckballRoomRecovery?.hide();if(link.quickMatchMode)showView('play');link.retries=0;link.identityChanged=!!(link.reconnect&&Number.isSafeInteger(link.previousId)&&link.previousId!==d.id);networkPlayerId=d.id;link.isOwner=d.owner===d.id&&!link.quickMatchMode;link.room=d.room;
  notifyNativeSessionView();peerRole='guest';net.receivedSequence=0;predictor.reset();enableV3(d.netcode===3);const shim={readyState:'open',get bufferedAmount(){return ws.bufferedAmount;},send:data=>{if(link.net&&typeof data==='string'){let m=null;try{m=JSON.parse(data);}catch{}if(m&&link.net.route(m))return;}ws.send(data);},close(){}};setupChannel(shim);shim.onopen();const invite=inviteUrl(d.room);link.invite=invite;$('inviteLink').value=invite;$('inviteBox').hidden=!!link.quickMatchMode;$('inviteButton').hidden=!!link.quickMatchMode;if(!link.quickMatchMode)setRoomParam(d.room);$('connectionText').textContent='Online room · headless server';$('serverRoomStatus').textContent=create?'Room ready. Send the link to your friends.':'Joined via room link.';if($('networkDialog').open)$('networkDialog').close();if(link.reconnect)notify(d.resumed?'Reconnected to your original player slot. Team and play time preserved.':link.identityChanged?'Connected with a new player slot.':'Reconnected');else if(!link.quickMatchMode)openMatchMenu();else if(menuOpen)closeMatchMenu();if(create)copyInvite(true);else if(!link.reconnect&&!link.quickMatchMode)notify(d.spectatorAdmission?
 'Joined as spectator. Ask the host for a team or bench slot.':'Joined room');setButtons();rosterKey='';updateRoster();refreshMenu();updateCamera();}
 else if(d.type==='room'){link.roomState=d;
  if(link.roomControl?.spectatorLimitSupported===true&&
     Number.isSafeInteger(d.spectatorCount)&&d.spectatorCount>=0&&d.spectatorCount<=64)
   link.roomControl.spectatorCount=d.spectatorCount;
  link.isOwner=d.owner===networkPlayerId&&!link.quickMatchMode;botIds=new Set(d.botIds||[]);$('mode').value=link.quickMatchMode?(d.mode==='1v1'?'bot':d.mode==='3v3'||d.mode==='club4v4'?'4v4':d.mode):d.mode;settings.difficulty=d.difficulty||'hard';settings.botLevels=d.botLevels||{};$('botDifficulty').value=settings.difficulty;
  // Server-verified native limits supersede stale offline presets while
  // online. Restore the original local controls only on disconnect.
  if(Number.isSafeInteger(d.scoreLimit)&&d.scoreLimit>=0&&d.scoreLimit<=99){
   const select=$('scoreLimit');
   select.querySelectorAll?.('option[data-online-limit]')?.forEach(option=>option.remove());
   if(typeof select.add==='function'&&typeof Option==='function'&&
    ![...(select.options||[])].some(option=>Number(option.value)===d.scoreLimit)){
    const option=new Option(String(d.scoreLimit),String(d.scoreLimit));
    if(option.dataset)option.dataset.onlineLimit='true';else option.setAttribute?.('data-online-limit','true');select.add(option);
   }
   select.value=String(d.scoreLimit);
  }
  if(Number.isSafeInteger(d.timeLimit)&&d.timeLimit>=0&&d.timeLimit<=99)
   $('timeLimit').value=String(d.timeLimit);
  updateRoster();link.roomText=(link.quickMatchMode?'Casual human Quick Match '+link.quickMatchMode:'Room '+d.room)+' · '+d.players+' online'+(link.isOwner?' · Host':'');$('connectionText').textContent=link.roomText+hostLabel+(link.identityChanged?' · New player ID':'');setButtons();rosterKey='';updateRoster();renderSubPanel();window.renderCustomRoomAdmin?.();window.renderPlayerReportPanel?.();window.FuckballTeamChat?.sync();window.FuckballSpectatorCheer?.sync();window.FuckballRoomNotice?.sync();window.renderRoomAccessKey?.();}
 else if(d.type==='error'&&link.reconnect&&/^Session (expired|belongs)/.test(d.message)){link.failed=true;ws.close();showJoinScreen(roomId||'', 'Your former player slot expired. Join again to get a new slot.');}
 else if(d.type==='error'&&!create&&!link.room&&typeof d.message==='string'&&
    (d.message.startsWith('This room is not accepting new spectators or bench participants.')||
     d.message.startsWith('This room is full.')||
     d.message.startsWith('Room capacity is below the number of current')||
     d.message.startsWith('Room access changed before admission.')||
     d.message.startsWith('This room was locked before you could join.')||
     d.message.startsWith('This room filled while the connection was being prepared.')||
     d.message.startsWith('This room now requires a signed-in account.'))){
   link.failed=true;ws.close();showJoinScreen(roomId,d.message);
   if(document.getElementById('joinSpectator'))
    $('joinSpectator').checked=link.requestedSpectate;
   return;
  }
 else if(d.type==='error'&&!create&&!link.room&&typeof d.message==='string'&&
    /^(Private room access key required or incorrect\.|Too many room access attempts\.)/.test(d.message)){
   link.failed=true;ws.close();
   showJoinScreen(roomId,d.message);
   if(document.getElementById('joinSpectator'))$('joinSpectator').checked=link.requestedSpectate;
   return;
  }
 else if(d.type==='error'&&!peerConnected&&/^Name reserved/.test(d.message)){link.failed=true;ws.close();showJoinScreen(roomId||'',d.message);}
 else if(d.type==='error'){
  const message=inviteError(typeof d.message==='string'?d.message.slice(0,180):
   'The server rejected this room request.');
  $('serverRoomStatus').textContent=message;notify(message);
  if(!peerConnected){
   link.failed=true;
   if(!create&&!link.quickMatchMode&&!link.room&&NATIVE_ROOM_CODE.test(roomId)){
    // A server's denial is not proof of an admitted seat. Immediately clear
    // the rejected socket; preserve the human's invite and explicit retry UI.
    const watch=link.requestedSpectate;
    disconnect();showView('play');showJoinScreen(roomId,message);
    if(watch)$('joinSpectator').checked=true;
   }else{
    if(!create){setRoomParam(null);if(!$('networkDialog').open)openDialog('networkDialog');}
    ws.close();
   }
  }
 }
 else if(d.type==='recordingStatus'){$('recordIndicator').hidden=!d.active;$('recordButton').textContent=d.active?'■ Save recording':'● Record';}
 else if(d.type==='recording'){const decoded=atob(d.bytes);saveBlob(Uint8Array.from(decoded,c=>c.charCodeAt(0)),'fuckball-server-'+Date.now()+'.hbr2','application/octet-stream');notify('Replay saved.');}
 else if(d.type==='playingTime'){if(link.roomState&&Array.isArray(d.activeFrames)){link.roomState.activeFrames=d.activeFrames;if(menuOpen)renderSubPanel();}}
 else if(d.type==='subApplied'){notify('Substitution: '+d.outId+' → '+d.inId+' ('+(d.team===1?'Red':'Blue')+').');renderSubPanel();}
 else if(d.type==='matchResult'){notify((d.winner===1?'Red':d.winner===2?'Blue':'Neither side')+' wins · '+d.red+' : '+d.blue+'.');openMatchMenu();}
 else if(d.type==='matchRestart'){link.quickRematch=null;clearQuickRematchAlert(link);notify(d.rematch?'Rematch started · teams swapped':'New game started');if(menuOpen)closeMatchMenu();}
 else if(d.type==='goal'){beep(650,.22);log((d.team===1?'Red':'Blue')+' scores');}
 else if(d.type==='playerReportStatus'){window.onPlayerReportStatus?.(d);}
 else if(d.type==='chat'){window.onNativeRoomChat?.(d);}
 else if(d.type==='spectatorCheer'){window.FuckballSpectatorCheer?.receive(d);}
 else channel?.onmessage?.(event);
 };
 }catch(e){$('serverRoomStatus').textContent=e.message;notify(e.message);return false;}}
function inviteUrl(room){const origin=location.origin&&location.origin!=='null'?location.origin:location.protocol+'//'+location.host;return origin+(location.pathname||'/')+'?room='+encodeURIComponent(room);}
function setRoomParam(room){try{if(typeof history==='undefined'||!history.replaceState||!location.href)return;const url=new URL(location.href);if(room)url.searchParams.set('room',room);else url.searchParams.delete('room');history.replaceState(null,'',url.pathname+url.search+url.hash);}catch{}}
function inviteError(message){if(message==='Room not found.')return'This invite link has expired: the room was closed. Create a new room to play.';return message;}
// navigator.clipboard only exists on HTTPS/localhost; plain-HTTP servers need
// the textarea + execCommand fallback (inside the click gesture).
async function copyText(text){try{if(navigator.clipboard?.writeText&&window.isSecureContext!==false){await navigator.clipboard.writeText(text);return true;}}catch{}try{const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.top='0';t.style.opacity='0';document.body.append(t);t.select();t.setSelectionRange?.(0,text.length);let ok=false;try{ok=document.execCommand('copy');}finally{try{t.remove();}catch{}}return !!ok;}catch{return false;}}
async function copyInvite(silent){const value=$('inviteLink').value;if(!value)return;if(await copyText(value))notify('Room link copied: '+value);else notify(silent?'Room ready · press “Copy room link” to share it':'Copy failed. Link: '+value);}
$('createServerRoom').onclick=()=>connectServer(true);$('copyInvite').onclick=()=>copyInvite(false);$('inviteButton').onclick=$('menuCopyLink').onclick=()=>copyInvite(false);
$('shareInvite').onclick=async()=>{const url=$('inviteLink').value;if(!url)return;if(navigator.share){try{await navigator.share({title:'Fuckball',text:'Join my Fuckball room',url});}catch{}}else copyInvite(false);};
const baseDisconnectPeer=$('disconnectPeer').onclick;$('disconnectPeer').onclick=e=>{const leaving=!!serverLink;baseDisconnectPeer?.(e);if(leaving){setRoomParam(null);$('inviteBox').hidden=true;$('inviteLink').value='';$('serverRoomStatus').textContent='Left the room.';}};
// Match the same canonical 8-character code and one-parameter link format
// accepted by manual paste / local QR scanners. A duplicate `room` key or
// extra query parameter must not silently choose one of several invites.
const inviteQuery=(()=>{
 try{
  // Reuse the standard URL constructor already used by native invites;
  // minimal browser runtimes need not provide URLSearchParams separately.
  const params=new URL(location.href).searchParams;
  if(!params.has('room'))return{room:'',invalid:false};
  const rooms=params.getAll('room');
  if(params.size!==1||rooms.length!==1)return{room:'',invalid:true};
  const room=String(rooms[0]||'').trim().toUpperCase();
  return NATIVE_ROOM_CODE.test(room)?{room,invalid:false}:{room:'',invalid:true};
 }catch{return{room:'',invalid:true};}
})();
if(inviteQuery.invalid){setRoomParam(null);notify('Invalid or ambiguous room invitation. Paste a valid eight-character code.');}
else if(inviteQuery.room){
 if(!defaultServer)notify('Invite links need the Fuckball online server.');
 else{showView('play');showJoinScreen(inviteQuery.room);}
}


/* Peer hosting (dist/peer-net.js, docs/netcode-plan.md): the room server may move the simulation to the
   browser with the best connection for everyone, and back, at an exact frame. Settings → Peer hosting. */
var hostLabel=''; // var: connectServer can run (invite link) before this line is reached
function peerHostingSupported(){return settings.peerHost!==false&&settings.netcode!=='classic'&&typeof RTCPeerConnection!=='undefined'&&typeof Worker!=='undefined'&&typeof FuckballPeerNet!=='undefined';}
function startPeering(link,ws){
 link.net=FuckballPeerNet.createPeerNet({selfId:networkPlayerId,
  sendServer:d=>{if(ws.readyState===1)ws.send(JSON.stringify(d));},sendServerBinary:bytes=>{if(ws.readyState===1)ws.send(bytes);},
  deliverJson:d=>channel?.onmessage?.({data:JSON.stringify(d)}),deliverSnapshot:buf=>{try{receiveSnapshot(buf);}catch{}},
  createPeerConnection:config=>new RTCPeerConnection(config),createWorker:()=>new Worker('host-worker.js'),
  now:()=>performance.now(),absNow:()=>performance.timeOrigin+performance.now(),createClock:FuckballRenderTiming.createClock,encodeState:FuckballRoomCore.encodeState,
  canHost:()=>settings.peerHost!==false&&document.visibilityState!=='hidden',
  // A new host: restart the clock estimate from samples taken against it before the switch.
  onClockSwitch:samples=>{predictor.pingClock.reset();for(const s of samples)predictor.pong(s.frame,s.sentAt);},
  onAuthority:info=>{const host=info.pending??info.host;if(info.pending==null){hostLabel=host==='server'?'':host===networkPlayerId?' · Hosted by you':' · Hosted by '+(info.name||link.hostName||'a player');if(host===networkPlayerId)notify('Your browser now hosts this room (best connection for everyone).');}else link.hostName=info.name;$('connectionText').textContent=(link.roomText||'Online room')+hostLabel+(link.identityChanged?' · New player ID':'');},
  onError:message=>console.warn('Peer host:',message)});
 link.netTimer=setInterval(()=>{if(serverLink===link)link.net?.tick();},50);
}
document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')serverLink?.net?.relinquish('tab hidden');});
// Join screen for room links: nickname, guest with a random name, or account.
var joinRoomId; // var: the room-link handler above runs before this line
function showJoinScreen(room,error=''){joinRoomId=room;
 if(document.getElementById('joinRoomAccessKey'))$('joinRoomAccessKey').value='';
 if(document.getElementById('joinSpectator'))$('joinSpectator').checked=false;
 $('joinRoomCode').textContent=room||'';
 $('joinDifferentCode').value=room||'';
 $('joinAlternatives').hidden=!room||!error;
 $('joinScreen').hidden=false;$('joinPlay').hidden=!room;$('joinAuth').hidden=!!room;$('joinError').textContent=error;if(typeof closeMatchMenu==='function')closeMatchMenu();renderAccount();if(room){$('joinName').value=settings.account?.username||(settings.name!=='Player'?settings.name:'');$('joinName').focus();}else $('authUser').focus();}
function hideJoinScreen(){$('joinScreen').hidden=true;$('joinError').textContent='';}
// An expired or mistyped invitation can be replaced deliberately without
// starting a WebSocket, reusing any temporary access key or inventing a seat.
$('joinChangeRoom').onclick=()=>{
 const next=$('joinDifferentCode').value.trim().toUpperCase();
 if(!NATIVE_ROOM_CODE.test(next)){
  $('joinError').textContent='Enter a valid eight-character room code before continuing.';
  return;
 }
 const previousName=$('joinName').value,watch=$('joinSpectator').checked;
 showJoinScreen(next,'Room updated. Select Join or Join as guest to connect.');
 $('joinName').value=previousName;
 $('joinSpectator').checked=watch;
 $('joinDifferentCode').value=next;
};
$('joinDifferentCode').addEventListener('keydown',e=>{
 if(e.key==='Enter'||e.code==='Enter'){e.preventDefault();$('joinChangeRoom').click();}
});
$('joinBrowseRooms').onclick=()=>{
 hideJoinScreen();setRoomParam(null);showView('home');
 // Browse only existing host-published listings; this is not a room join.
 const browser=$('homeView').querySelector('.room-browser');
 const toggle=browser?.querySelector('.room-browser-tools button');
 if(toggle&&toggle.getAttribute('aria-expanded')==='false')toggle.click();
 browser?.scrollIntoView?.({behavior:'auto',block:'start'});
};
$('joinCancel').onclick=()=>{hideJoinScreen();setRoomParam(null);showView('home');};
function renderAccount(){const a=settings.account;$('joinAccount').textContent=a?'Logged in as '+a.username+'.':'';$('joinShowLogin').hidden=!!a;$('joinName').disabled=!!a;$('accountStatus').textContent=a?'Logged in as '+a.username:'Not logged in · nickname only';$('accountButton').textContent=a?'Log out':'Log in / create account';}
function joinRoom(name){
 if(!joinRoomId)return;
 const blocked=onlineSessionConflict();
 if(blocked){$('joinError').textContent=blocked;return;}
 const watch=$('joinSpectator').checked;
 // Keep the join form and its room code/nickname/spectator choice if native
 // validation rejects this request synchronously. It must never vanish before
 // a WebSocket was actually created.
 const outcome=connectServer(false,joinRoomId,name,null,null,false,false,watch);
 if(outcome===false){
  $('joinError').textContent=$('serverRoomStatus').textContent||
   'Could not start the room connection. Check your server and retry.';
  $('joinAlternatives').hidden=false;
  $('joinName').focus({preventScroll:true});
  return;
 }
 hideJoinScreen();
}
$('joinWithName').onclick=()=>{if(settings.account){joinRoom(settings.account.username);return;}const n=$('joinName').value.trim();if(!n){$('joinError').textContent='Enter a nickname or join as guest.';return;}setName(n);joinRoom(settings.name);};
$('joinName').addEventListener('keydown',e=>{if(e.key==='Enter'||e.code==='Enter'){e.preventDefault();$('joinWithName').onclick();}});
$('joinGuest').onclick=()=>joinRoom('Guest '+String(Math.floor(1000+Math.random()*9000)));
$('joinShowLogin').onclick=()=>{$('joinPlay').hidden=true;$('joinAuth').hidden=false;$('joinError').textContent='';$('authUser').focus();};
$('authBack').onclick=()=>{if(joinRoomId){$('joinAuth').hidden=true;$('joinPlay').hidden=false;$('joinError').textContent='';}else hideJoinScreen();};
async function authRequest(route){const username=$('authUser').value.trim(),password=$('authPass').value;try{const res=await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const d=await res.json();if(!res.ok)throw Error(d.error||'Request failed.');settings.account={username:d.username,token:d.token};setName(d.username);$('authPass').value='';renderAccount();notify('Logged in as '+d.username);if(joinRoomId)joinRoom(d.username);else hideJoinScreen();}catch(e){$('joinError').textContent=e.message;}}
$('joinAuth').onsubmit=e=>{e.preventDefault();authRequest('/api/login');};$('authRegister').onclick=()=>authRequest('/api/register');
$('accountButton').onclick=()=>{if(settings.account){const token=settings.account.token;settings.account=null;savePrefs();renderAccount();fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}).catch(()=>{});notify('Logged out');}else showJoinScreen('');};
renderAccount();
// Drop a stored session the server no longer knows.
if(settings.account?.token&&defaultServer)fetch('/api/me',{headers:{Authorization:'Bearer '+settings.account.token}}).then(r=>{if(r.status===401){settings.account=null;savePrefs();renderAccount();}}).catch(()=>{});


// Player-facing online 4v4 substitutions. Every action is authorized again by
// the server; UI state and local button visibility are never permission grants.
function populateSubSelect(id,items,empty){
 const control=$(id),previous=control.value;
 control.replaceChildren();
 if(!items.length){const opt=document.createElement('option');opt.value='';opt.textContent=empty;control.append(opt);control.value='';return;}
 for(const item of items){const option=document.createElement('option');option.value=String(item.id);option.textContent=item.name;control.append(option);}
 control.value=items.some(item=>String(item.id)===previous)?previous:String(items[0].id);
}
// A native vote is not a confirmed human decision until the SERVER echoes
// this player in the accepted roster (or closes a declined proposal).
// Keep pending sends scoped to the admitted room + immutable proposal ID.
let nativeRematchVotePending=null,nativeRematchVoteNotice=null;
function clearNativeRematchVote(){
 if(nativeRematchVotePending?.timer)clearTimeout(nativeRematchVotePending.timer);
 nativeRematchVotePending=null;nativeRematchVoteNotice=null;
}
function rematchVoteRequest(link=serverLink){
 if(!link?.room||!link.roomState||link.roomState.started)return null;
 return link.quickMatchMode?link.quickRematch:link.roomState.rematch;
}
function syncNativeRematchVote(link,request){
 const pending=nativeRematchVotePending,notice=nativeRematchVoteNotice;
 const accepted=Array.isArray(request?.accepted)&&request.accepted.includes(networkPlayerId);
 const same=!!link&&!!request&&Number.isSafeInteger(request.id)&&
  link.room&&request.id===(pending?.id??notice?.id)&&
  link===(pending?.link??notice?.link);
 if(pending&&(!same||accepted))clearNativeRematchVote();
 else if(notice&&(!same||accepted))nativeRematchVoteNotice=null;
}
function submitNativeRematchVote(accept){
 const link=serverLink,request=rematchVoteRequest(link);
 if(!request||!Number.isSafeInteger(request.id)||
    !Array.isArray(request.required)||!request.required.includes(networkPlayerId)||
    !Array.isArray(request.accepted)||request.accepted.includes(networkPlayerId)||
    Number.isSafeInteger(request.expiresAt)&&Date.now()>=request.expiresAt)return;
 if(nativeRematchVotePending?.link===link&&nativeRematchVotePending.id===request.id)return;
 const id=request.id;
 if(link.ws?.readyState!==1){
  nativeRematchVoteNotice={link,id,message:'Connection unavailable. Reconnect or retry explicitly before the deadline.'};
  renderNextMatchPanel();return;
 }
 // A single explicit human action is sent through the existing native socket,
 // never auto-retried, auto-accepted or interpreted as a server receipt.
 try{
  link.send({type:link.quickMatchMode?'quickRematchVote':'rematchVote',id,accept});
 }catch{
  nativeRematchVoteNotice={link,id,message:'Vote could not be sent. Retry explicitly before the deadline.'};
  renderNextMatchPanel();return;
 }
 const pending={link,id,accept,timer:null};
 nativeRematchVotePending=pending;nativeRematchVoteNotice=null;
 pending.timer=setTimeout(()=>{
  if(nativeRematchVotePending!==pending)return;
  nativeRematchVotePending=null;
  nativeRematchVoteNotice={link,id,message:'No server receipt yet. Retry explicitly before the deadline.'};
  renderNextMatchPanel();
 },2300);
 renderNextMatchPanel();
}
function renderNextMatchPanel(){
 const panel=$('nextMatchPanel'),link=serverLink,state=link?.roomState;
 const request=rematchVoteRequest(link);
 syncNativeRematchVote(link,request);
 panel.hidden=!(link?.room&&state&&!state.started);
 if(panel.hidden){renderGlobalRematchDock();return;}
 const result=state.lastResult,quick=!!link.quickMatchMode;
 $('nextMatchTitle').textContent=result?'Round '+result.round+' · '+result.red+' : '+result.blue:'Ready for another game';
 const voters=new Set(request?.required||[]),approved=new Set(request?.accepted||[]);
 const seconds=Number.isSafeInteger(request?.expiresAt)?
  Math.max(0,Math.ceil((request.expiresAt-Date.now())/1000)):null;
 const pending=nativeRematchVotePending?.link===link&&nativeRematchVotePending.id===request?.id;
 const notice=nativeRematchVoteNotice?.link===link&&nativeRematchVoteNotice.id===request?.id?
  nativeRematchVoteNotice.message:'';
 $('nextMatchInfo').textContent=request?
   (pending?'Your '+(nativeRematchVotePending.accept?'accept':'decline')+' vote was sent · awaiting server receipt. ':
    notice?notice+' ':'')+
   'Rematch awaiting '+(voters.size-approved.size)+' of '+voters.size+' players'+
   (seconds===null?'':' · '+seconds+'s left'):
   result?(result.winner===1?'Red wins':result.winner===2?'Blue wins':'Draw')+' · keep playing with the same room link':
   'Everyone remains connected to this room.';
 const list=$('nextMatchPlayers');list.replaceChildren();
 for(const p of Array.isArray(result?.finalPlayers)?result.finalPlayers:[]){
  if(!p||typeof p.name!=='string'||!Number.isFinite(p.playedFrames))continue;
  const line=document.createElement('li'),name=document.createElement('span'),time=document.createElement('small');
  name.textContent=(p.finalTeam===1?'🔴 ':p.finalTeam===2?'🔵 ':'⚪ ')+p.name;
  time.textContent=(Math.max(0,p.playedFrames)/60).toFixed(1)+'s active · final side';
  line.append(name,time);list.append(line);
 }
 const host=!!link.isOwner,canRequest=quick?!!result&&!!state&&!state.started:host;
 $('rematchRequest').hidden=!result||!!request||!canRequest;
 $('rematchRequest').textContent=quick?'Request human rematch':'Request rematch';
 $('rematchRequest').disabled=!result||!!request||!canRequest;
 $('nextGame').hidden=!host;
 $('nextGame').disabled=!host;
 const canVote=!!request&&voters.has(networkPlayerId)&&!approved.has(networkPlayerId)&&
  (seconds===null||seconds>0);
 $('rematchAccept').hidden=!canVote;
 $('rematchDecline').hidden=!canVote;
 $('rematchAccept').disabled=!!pending;
 $('rematchDecline').disabled=!!pending;
 renderGlobalRematchDock();
}
$('rematchRequest').onclick=()=>serverLink?.send({type:serverLink?.quickMatchMode?'quickRematchRequest':'rematchRequest'});
$('nextGame').onclick=()=>serverLink?.send({type:'newGame'});
$('rematchAccept').onclick=()=>submitNativeRematchVote(true);
$('rematchDecline').onclick=()=>submitNativeRematchVote(false);
// A rematch can be proposed for only 45 seconds. If a human is reading My
// Games or Home when the server vote arrives, the native menu is invisible.
// Mirror the existing consent instead of constructing a second voting path.
const globalRematchDock=document.createElement('aside');
globalRematchDock.className='native-rematch-dock';
globalRematchDock.hidden=true;
globalRematchDock.setAttribute('role','region');
globalRematchDock.setAttribute('aria-label','Current human rematch vote');
const globalRematchCopy=document.createElement('div');
globalRematchCopy.className='native-rematch-dock-copy';
const globalRematchTitle=document.createElement('strong');
const globalRematchStatus=document.createElement('p');
globalRematchStatus.setAttribute('role','status');
globalRematchStatus.setAttribute('aria-live','polite');
globalRematchCopy.append(globalRematchTitle,globalRematchStatus);
const globalRematchActions=document.createElement('div');
globalRematchActions.className='native-rematch-dock-actions';
const globalRematchAccept=document.createElement('button');
globalRematchAccept.type='button';globalRematchAccept.className='primary';
globalRematchAccept.textContent='✓ Accept rematch';
const globalRematchDecline=document.createElement('button');
globalRematchDecline.type='button';globalRematchDecline.textContent='Decline';
const globalRematchView=document.createElement('button');
globalRematchView.type='button';globalRematchView.textContent='View match';
globalRematchActions.append(globalRematchAccept,globalRematchDecline,globalRematchView);
globalRematchDock.append(globalRematchCopy,globalRematchActions);
document.body.append(globalRematchDock);
function currentRematchVote(){
 const link=serverLink,state=link?.roomState;
 if(!link?.room||!state?.lastResult||state.started)return null;
 const vote=link.quickMatchMode?link.quickRematch:state.rematch;
 if(!vote||!Number.isSafeInteger(vote.id)||!Array.isArray(vote.required)||
    !Array.isArray(vote.accepted)||!vote.required.includes(networkPlayerId))return null;
 const expires=Number.isSafeInteger(vote.expiresAt)?vote.expiresAt:null;
 if(expires!==null&&expires<=Date.now())return null;
 const approved=vote.accepted.includes(networkPlayerId);
 return{link,vote,approved,expires};
}
function renderGlobalRematchDock(){
 const state=currentRematchVote();
 const menuVisible=!$('matchView').hidden&&!$('pauseMenu').hidden&&!$('nextMatchPanel').hidden;
 globalRematchDock.hidden=!state||menuVisible;
 if(globalRematchDock.hidden)return;
 const vote=state.vote,remaining=state.expires===null?null:
  Math.max(0,Math.ceil((state.expires-Date.now())/1000));
 const pending=nativeRematchVotePending?.link===state.link&&nativeRematchVotePending.id===vote.id;
 const notice=nativeRematchVoteNotice?.link===state.link&&nativeRematchVoteNotice.id===vote.id?
  nativeRematchVoteNotice.message:'';
 globalRematchTitle.textContent=state.approved?'YOUR REMATCH VOTE IS CONFIRMED':
  pending?'VOTE SENT · AWAITING SERVER RECEIPT':
  notice?'SERVER RECEIPT MISSING · YOU MAY RETRY':
  'HUMAN REMATCH · YOUR DECISION NEEDED';
 const approved=vote.accepted.filter(id=>vote.required.includes(id)).length;
 const text=(state.link.quickMatchMode?'Casual human rematch':'Room rematch')+
  ' · '+approved+' / '+vote.required.length+' human players confirmed'+
  (remaining===null?'':' · '+remaining+'s left')+
  (state.approved?' · Waiting for remaining players.':
   ' · Accept or decline before the server deadline.');
 const feedback=pending?'Vote sent · waiting for server receipt. ':
  notice?notice+' ':'';
 if(globalRematchStatus.textContent!==feedback+text)
  globalRematchStatus.textContent=feedback+text;
 globalRematchAccept.hidden=state.approved;
 globalRematchDecline.hidden=state.approved;
 globalRematchAccept.disabled=!!pending;
 globalRematchDecline.disabled=!!pending;
}
function sendGlobalRematchVote(accept){
 const state=currentRematchVote();
 if(!state||state.approved||globalRematchDock.hidden)return;
 // Render the original menu vote before forwarding the user's actual click.
 // This preserves native proposal-id checks, server permission and protocol.
 renderNextMatchPanel();
 const original=$(accept?'rematchAccept':'rematchDecline');
 if(original.hidden||original.disabled)return;
 original.click();
 renderGlobalRematchDock();
}
globalRematchAccept.addEventListener('click',()=>sendGlobalRematchVote(true));
globalRematchDecline.addEventListener('click',()=>sendGlobalRematchVote(false));
globalRematchView.addEventListener('click',()=>{
 if(!currentRematchVote())return;
 $('tabPlay').click();
 if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
 renderNextMatchPanel();
 $('nextMatchPanel').scrollIntoView?.({behavior:'auto',block:'nearest'});
 const choice=!$('rematchAccept').hidden?$('rematchAccept'):$('nextMatchPanel');
 choice.focus?.({preventScroll:true});
 renderGlobalRematchDock();
});
const globalRematchTicker=setInterval(renderGlobalRematchDock,1000);
globalRematchTicker?.unref?.();
// Home and Play exist in both the full app and minimal original runtime.
// My Games is still covered by the one-second view-state refresh tick.
for(const id of ['tabHome','tabPlay'])
 $(id)?.addEventListener('click',()=>queueMicrotask(renderGlobalRematchDock));

function renderSubPanel(){
 const panel=$('subPanel'),link=serverLink,state=link?.roomState;
 panel.hidden=!(link?.room&&state);
 renderNextMatchPanel();
 if(panel.hidden)return;
 const players=(room?.state?.players||[]).filter(p=>Number.isSafeInteger(p.id)&&!botIds.has(p.id));
 const nameOf=id=>players.find(p=>p.id===id)?.name||'Player '+id;
 const team=Number($('subTeam').value)===2?2:1;
 const teamName=team===1?'Red':'Blue',benches=new Map(state.benches||[]),captains=new Map(state.captains||[]),offline=new Set(state.disconnectedIds||[]);
 const active=players.filter(p=>p.team?.id===team||p.team===team);
 const inactive=players.filter(p=>p.team?.id===0||p.team===0);
 const bench=inactive.filter(p=>benches.get(p.id)===team&&!offline.has(p.id));
 const asOption=p=>({id:p.id,name:(p.name||'Player '+p.id)+(offline.has(p.id)?' · reconnecting':'')});
 populateSubSelect('subBenchPlayer',inactive.map(asOption),'No inactive players');
 populateSubSelect('subOutPlayer',active.map(asOption),'No active players');
 populateSubSelect('subInPlayer',bench.map(asOption),'No available team bench players');
 populateSubSelect('subCaptainPlayer',[{id:0,name:'No captain'},...active.map(asOption)],'No active players');
 const roleCaptain=captains.get(team),isHost=!!link.isOwner;
 const mayPropose=isHost||roleCaptain===networkPlayerId;
 $('subAssignBench').disabled=!isHost||!inactive.length;
 $('subClearBench').disabled=!isHost||!inactive.length;
 $('subAppointCaptain').disabled=!isHost;
 const queued=(state.pendingSubs||[]).find(p=>p.team===team);
 $('subPropose').disabled=!mayPropose||!active.length||!bench.length||!!queued;
 const timeFrames=new Map(state.activeFrames||[]);
 const total=(timeFrames.get(networkPlayerId)||0)/60;
 $('subSummary').textContent=(isHost?'Host':roleCaptain===networkPlayerId?'Team captain':'Player')+
  (offline.size?' · '+offline.size+' reconnecting':'')+
  ' · '+teamName+' captain: '+(roleCaptain?nameOf(roleCaptain):'not assigned')+
  ' · Your active time: '+total.toFixed(1)+'s';
 const requests=state.pendingSubs||[];
 const recent=Array.isArray(state.recentSubs)?state.recentSubs.at(-1):null;
 $('subPending').textContent=requests.length?
  requests.map(p=>(p.team===1?'Red':'Blue')+': '+nameOf(p.outId)+' → '+nameOf(p.inId)+
   (p.accepted?' · accepted, waiting for pause':' · awaiting player consent')).join(' | '):
  recent&&[1,2].includes(recent.team)&&Number.isSafeInteger(recent.frame)?
   'Last completed swap · '+(recent.team===1?'Red':'Blue')+': '+
   nameOf(recent.outId)+' → '+nameOf(recent.inId)+' · frame '+recent.frame:
   'No substitution pending.';
 const yourRequest=requests.find(p=>p.inId===networkPlayerId&&!p.accepted&&Number.isSafeInteger(p.requestId));
 $('subConsent').hidden=!yourRequest;
 $('subConsentText').textContent=yourRequest?
  'Enter '+(yourRequest.team===1?'Red':'Blue')+' for '+nameOf(yourRequest.outId)+'?':'';
}
const baseOnlineRefreshMenu=refreshMenu;
refreshMenu=function(){baseOnlineRefreshMenu();renderSubPanel();};
// Room-status can arrive before the subsequent native player snapshot. Refresh
// selectors only when the real roster signature changes, not on every 30Hz
// snapshot (which would disrupt the player's in-progress selection).
function renderRoomPings(){
 const link=serverLink;if(!link?.room)return;
 for(const row of document.querySelectorAll('#teamColumns .rm-player[data-player]')){
  const id=Number(row.getAttribute('data-player'));
  let tag=row.querySelector('.rm-ping');
  if(botIds.has(id)){tag?.remove();continue;}
  if(!tag){tag=document.createElement('span');tag.className='rm-ping';row.append(tag);}
  const ms=link.serverPings?.get(id);
  tag.textContent=Number.isInteger(ms)?ms+' ms':'— ms';
  tag.title='Measured WebSocket round-trip to the room server. Peer-host latency can differ.';
  tag.setAttribute('aria-label','Server ping '+(Number.isInteger(ms)?ms+' milliseconds':'not available'));
  tag.classList.toggle('rm-ping-poor',Number.isInteger(ms)&&ms>180);
 }
}
const baseOnlineUpdateRoster=updateRoster;
updateRoster=function(){
 const previous=rosterKey;
 baseOnlineUpdateRoster();
 if(menuOpen&&serverLink?.roomState&&rosterKey!==previous)renderSubPanel();
 if(rosterKey!==previous)renderRoomPings();
};
$('subTeam').onchange=renderSubPanel;
$('subAssignBench').onclick=()=>{
 if(serverLink?.isOwner)serverLink.send({type:'bench',id:Number($('subBenchPlayer').value),team:Number($('subTeam').value)});
};
$('subClearBench').onclick=()=>{
 if(serverLink?.isOwner)serverLink.send({type:'bench',id:Number($('subBenchPlayer').value),team:0});
};
$('subAppointCaptain').onclick=()=>{
 if(serverLink?.isOwner)serverLink.send({type:'appointCaptain',team:Number($('subTeam').value),id:Number($('subCaptainPlayer').value)});
};
$('subPropose').onclick=()=>{
 if(!serverLink?.roomState)return;
 const team=Number($('subTeam').value);
 if(!serverLink.isOwner&&new Map(serverLink.roomState.captains||[]).get(team)!==networkPlayerId)return;
 serverLink.send({type:'subRequest',outId:Number($('subOutPlayer').value),inId:Number($('subInPlayer').value)});
};
for(const [id,accept]of [['subApprove',true],['subDecline',false]])$(id).onclick=()=>{
 const pending=serverLink?.roomState?.pendingSubs?.find(p=>p.inId===networkPlayerId&&!p.accepted&&Number.isSafeInteger(p.requestId));
 if(!pending)return;
 serverLink.send({type:'subAccept',team:pending.team,outId:pending.outId,requestId:pending.requestId,accept});
};
renderSubPanel();


// My Games: server-backed results are a separate, authenticated feed.
// Local HBR2 files remain unverified browser recordings, never rankings.
const accountMatchSection=document.createElement('section');
accountMatchSection.className='server-match-history';
const accountMatchHeader=document.createElement('div'),accountMatchIntro=document.createElement('div');
accountMatchHeader.className='server-history-head';
const accountMatchEyebrow=document.createElement('span'),accountMatchTitle=document.createElement('h2'),accountMatchDescription=document.createElement('p');
accountMatchEyebrow.className='eyebrow';accountMatchEyebrow.textContent='SIGNED-IN MATCH HISTORY';
accountMatchTitle.textContent='SERVER RESULTS.';
accountMatchDescription.textContent='Completed matches on the native room server only. These are not ranked or anti-cheat verified.';
accountMatchIntro.append(accountMatchEyebrow,accountMatchTitle,accountMatchDescription);
const accountMatchActions=document.createElement('div');accountMatchActions.className='server-history-actions';
const refreshServerHistory=document.createElement('button');refreshServerHistory.type='button';refreshServerHistory.textContent='↻ Refresh';
const exportServerHistory=document.createElement('button');exportServerHistory.type='button';exportServerHistory.textContent='↓ Export JSON';
const eraseServerHistory=document.createElement('button');eraseServerHistory.type='button';eraseServerHistory.textContent='Delete my server results';eraseServerHistory.className='danger';
accountMatchActions.append(refreshServerHistory,exportServerHistory,eraseServerHistory);
accountMatchHeader.append(accountMatchIntro,accountMatchActions);
const accountMatchStatus=document.createElement('p');accountMatchStatus.setAttribute('role','status');accountMatchStatus.setAttribute('aria-live','polite');
const accountMatchSummary=document.createElement('p');accountMatchSummary.className='server-history-summary';
const accountMatchList=document.createElement('div');accountMatchList.className='server-history-list';
const accountCareerPanel=document.createElement('section');accountCareerPanel.className='server-career-panel';
accountCareerPanel.setAttribute('aria-label','My server-recorded career statistics');
accountMatchSection.append(accountMatchHeader,accountMatchStatus,accountCareerPanel,accountMatchSummary,accountMatchList);
$('gamesView').append(accountMatchSection);
const accountMatchStyle=document.createElement('style');
accountMatchStyle.textContent=`
.server-match-history{max-width:1180px;margin:24px auto;padding:20px;border:1px solid #455249;border-radius:12px;background:#15201bee;color:#edf4ed}
.server-history-head{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
.server-history-head h2{margin:5px 0 7px;font-size:clamp(20px,2.3vw,32px);font-weight:900;font-style:italic;letter-spacing:-1px}
.server-history-head p{font-size:12px;color:#aabdb2;max-width:600px;margin:0 0 8px}
.server-history-actions{display:flex;flex-wrap:wrap;gap:8px}
.server-history-actions button{border-radius:8px;padding:10px 14px}
.server-history-actions button.danger{border-color:#944a4a;color:#ffd7d7;background:#3c2525}
.server-history-actions button:disabled{opacity:.5;cursor:not-allowed}
.server-history-summary{font-size:13px;color:#c6ff42;font-weight:700}
.server-history-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px;margin-top:12px}
.server-history-item{border:1px solid #53635288;background:#ffffff08;border-radius:9px;padding:13px 15px;display:flex;flex-direction:column;gap:8px}
.server-history-item strong{font-size:18px;color:#f0f9e9}
.server-history-item span,.server-history-item small{font-size:12px;color:#afc4b5}
.server-history-result{color:#c6ff42!important;font-weight:800}
.server-career-panel{margin:17px 0;display:grid;gap:10px}
.server-career-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,135px),1fr));gap:9px}
.server-career-metric{border:1px solid #687d6588;border-radius:10px;padding:16px;background:#24372a;display:grid;gap:7px}
.server-career-metric strong{font-size:22px;color:#d6ff9b;font-variant-numeric:tabular-nums}
.server-career-metric span{text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#a7bfad}
.server-career-note{font-size:12px;line-height:1.5;color:#bbcdbc}
.server-match-history [role=status]{font-size:12px;color:#c6ddc3}
`;
(document.head||document.body).append(accountMatchStyle);
let accountMatchLoad=0,accountHistoryItems=[],accountCareerData=null,accountCareerMatches=0;
async function renderAccountCareer(token,load){
 try{
  const response=await fetch('/api/player-stats',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(load!==accountMatchLoad||settings.account?.token!==token)return;
  if(response.status===401){accountCareerPanel.textContent='Log in again to see your career totals.';return;}
  if(!response.ok)throw Error('Statistics unavailable.');
  const data=await response.json(),stats=data?.stats;
  if(!data.durable||!stats){accountCareerPanel.textContent='Career totals require persistent server storage.';return;}
  if(stats.source!=='native-server'||stats.ranked!==false||
     !Number.isSafeInteger(stats.matches)||stats.matches<0||
     ['wins','draws','losses','goalsFor','goalsAgainst','playedFrames','bestWinStreak'].some(k=>!Number.isSafeInteger(stats[k])||stats[k]<0)||
     stats.matches!==stats.wins+stats.draws+stats.losses)
   throw Error('Invalid statistics.');
  accountCareerData=stats;accountCareerMatches=stats.matches;
  eraseServerHistory.disabled=accountHistoryItems.length===0&&stats.matches===0;
  const grid=document.createElement('div');grid.className='server-career-grid';
  const winRate=stats.matches?(stats.wins*100/stats.matches).toFixed(1)+'%':'—';
  const fields=[
   ['SERVER MATCHES',String(stats.matches)],
   ['WIN RATE',winRate],
   ['W · D · L',stats.wins+' · '+stats.draws+' · '+stats.losses],
   ['GOALS',stats.goalsFor+' : '+stats.goalsAgainst],
   ['ACTIVE TIME',(stats.playedFrames/3600).toFixed(1)+' min'],
   ['BEST WIN STREAK',String(stats.bestWinStreak)]
  ];
  for(const [label,value]of fields){
   const card=document.createElement('div');card.className='server-career-metric';
   const caption=document.createElement('span'),number=document.createElement('strong');
   caption.textContent=label;number.textContent=value;card.append(caption,number);grid.append(card);
  }
  const note=document.createElement('p');note.className='server-career-note';
  const start=Number.isSafeInteger(stats.firstAt)?new Date(stats.firstAt).toLocaleDateString():'your first recorded match';
  const modes=stats.modes||{};
  note.textContent='Native-server results recorded since '+start+
   ' · '+(modes['1v1']||0)+' 1v1 · '+(modes['2v2']||0)+' 2v2 · '+(modes['3v3']||0)+' 3v3 · '+(modes['4v4']||0)+' 4v4 · '+(modes.bot||0)+
   ' bot-mode matches. Survives trimming of recent history while this server keeps its data. Not ranked; guest and peer-hosted results are excluded.';
  accountCareerPanel.replaceChildren(grid,note);
 }catch{
  if(load===accountMatchLoad&&settings.account?.token===token)
   accountCareerPanel.textContent='Career totals are currently unavailable. Recent matches remain visible.';
 }
}
async function renderAccountMatchHistory(){
 const load=++accountMatchLoad,status=accountMatchStatus,list=accountMatchList;
 list.replaceChildren();accountMatchSummary.textContent='';accountCareerPanel.replaceChildren();accountHistoryItems=[];accountCareerData=null;accountCareerMatches=0;exportServerHistory.disabled=true;eraseServerHistory.disabled=true;
 const token=settings.account?.token;
 if(!token){status.textContent='Log in from the online room to see your completed server matches.';return;}
 status.textContent='Loading server results…';
 try{
  const response=await fetch('/api/match-history',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(load!==accountMatchLoad||settings.account?.token!==token)return;
  if(response.status===401){status.textContent='Your login expired. Sign in again to see server results.';return;}
  if(!response.ok)throw Error('Server results are currently unavailable.');
  const data=await response.json();
  if(!Array.isArray(data.items)||data.source!=='native-server')throw Error('Server returned an invalid result list.');
  const items=data.items.slice(0,50);
  accountHistoryItems=items;
  exportServerHistory.disabled=!items.length;
  eraseServerHistory.disabled=!data.durable||!items.length;
  const wins=items.filter(x=>x.winner===x.team).length,draws=items.filter(x=>x.winner===0).length,losses=items.length-wins-draws;
  const minutes=items.reduce((total,x)=>total+(Number.isSafeInteger(x.playedFrames)?x.playedFrames:0),0)/3600;
  accountMatchSummary.textContent=items.length?('Last '+items.length+' · '+wins+' wins · '+draws+' draws · '+losses+' losses · '+minutes.toFixed(1)+' min on pitch'):'';
  for(const item of items){
   if(!item||!Number.isSafeInteger(item.red)||!Number.isSafeInteger(item.blue)||
      !Number.isSafeInteger(item.at)||![0,1,2].includes(item.team)||!Number.isSafeInteger(item.playedFrames))continue;
   const card=document.createElement('article'),title=document.createElement('strong'),result=document.createElement('span'),details=document.createElement('small');
   card.className='server-history-item';title.textContent='ROUND '+item.round+' · '+item.red+' : '+item.blue;
   result.className='server-history-result';
   result.textContent=item.winner===0?'DRAW':item.winner===item.team?'WIN':'LOSS';
   const side=item.team===1?'Red':'Blue';
   details.textContent=new Date(item.at).toLocaleString()+' · '+side+' · '+(item.playedFrames/60).toFixed(1)+'s active · '+item.mode+' · server-recorded, unranked';
   card.append(title,result,details);list.append(card);
  }
  status.textContent=items.length?items.length+' recent server-recorded match results · no competitive rating assigned.':
   'No server-recorded results yet. Play a completed online match while signed in.';
  if(data.durable===false)status.textContent+=' This server has no persistent history store.';
  if(data.durable)await renderAccountCareer(token,load);
 }catch{
  if(load===accountMatchLoad)status.textContent='Could not load server results. Local replays are still available.';
 }
}
refreshServerHistory.onclick=renderAccountMatchHistory;
exportServerHistory.onclick=()=>{
 if(!accountHistoryItems.length||!settings.account?.token)return;
 const payload={source:'native-server',ranked:false,exportedAt:new Date().toISOString(),career:accountCareerData,items:accountHistoryItems};
 const bytes=new TextEncoder().encode(JSON.stringify(payload,null,2));
 saveBlob(bytes,'fuckball-my-server-results-'+new Date().toISOString().slice(0,10)+'.json','application/json');
};
eraseServerHistory.onclick=async()=>{
 const token=settings.account?.token;
 if(!token||(!accountHistoryItems.length&&!accountCareerMatches))return;
 if(typeof window.confirm!=='function'||!window.confirm('Permanently delete all server-recorded match results AND career statistics? This cannot be undone. Local replay files will remain.'))return;
 eraseServerHistory.disabled=true;accountMatchStatus.textContent='Removing your stored server results…';
 try{
  const response=await fetch('/api/match-history',{method:'DELETE',headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw Error('Could not delete your results.');
  if(settings.account?.token===token)await renderAccountMatchHistory();
 }catch{if(settings.account?.token===token){accountMatchStatus.textContent='Could not delete server results. Please try again.';eraseServerHistory.disabled=false;}}
};
const showViewWithServerHistory=showView;
showView=function(view){showViewWithServerHistory(view);if(view==='games')renderAccountMatchHistory();};
