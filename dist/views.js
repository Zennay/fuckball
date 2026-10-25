'use strict';
// A live multiplayer session is never silently replaced by My Games/replays.
// Keep one small non-invasive resume affordance next to the local library.
const gamesSessionHost=$('gamesView');
const gamesSessionNotice=document.createElement('aside');
gamesSessionNotice.className='games-session-notice';
gamesSessionNotice.hidden=true;
gamesSessionNotice.setAttribute('aria-label','Current game session');
const gamesSessionText=document.createElement('div');
const gamesSessionTitle=document.createElement('strong');
const gamesSessionDescription=document.createElement('p');
gamesSessionText.append(gamesSessionTitle,gamesSessionDescription);
const gamesSessionActions=document.createElement('div');
gamesSessionActions.className='games-session-actions';
const gamesSessionReturn=document.createElement('button');
gamesSessionReturn.type='button';gamesSessionReturn.className='primary';
gamesSessionReturn.textContent='↗ Return to match';
const gamesSessionMenu=document.createElement('button');
gamesSessionMenu.type='button';gamesSessionMenu.textContent='Room controls';
gamesSessionActions.append(gamesSessionReturn,gamesSessionMenu);
gamesSessionNotice.append(gamesSessionText,gamesSessionActions);
if(typeof gamesSessionHost.prepend==='function')gamesSessionHost.prepend(gamesSessionNotice);
else gamesSessionHost.append(gamesSessionNotice);
function refreshGamesSession(){
 const native=typeof serverLink!=='undefined'?serverLink:null;
 const direct=typeof peerConnected!=='undefined'&&peerConnected;
 const pending=typeof peer!=='undefined'&&!!peer;
 const activeRoom=!!native?.room;
 const activeLocal=!native&&!direct&&!pending&&typeof started!=='undefined'&&started&&
  typeof replay!=='undefined'&&!replay;
 const hasSession=!!native||direct||pending||activeLocal;
 gamesSessionNotice.hidden=!hasSession;
 if(!hasSession)return;
 gamesSessionTitle.textContent=activeRoom?'ONLINE ROOM STILL OPEN':
  direct?'DIRECT MATCH STILL OPEN':
  activeLocal?'LOCAL MATCH STILL ACTIVE':'MULTIPLAYER CONNECTION IN PROGRESS';
 gamesSessionDescription.textContent=activeRoom?
  (native.roomState?.started?'Your live room continues while you browse My Games. ':
   'Your online lobby is still connected. ')+
  'Leave it explicitly before opening a replay.':
  direct?'Your direct-peer match continues here. Disconnect explicitly before watching a replay.':
  activeLocal?'Your local game and its current score are preserved while you browse My Games. Return to the pitch, then stop the match explicitly before watching a replay. The local game is paused while this view is open.':
  'Finish or cancel this connection before opening a replay. Nothing will be disconnected automatically.';
 gamesSessionReturn.textContent=activeRoom||direct||activeLocal?'↗ Return to match':'↗ View connection';
 gamesSessionMenu.textContent=activeLocal?'Match controls':'Room controls';
 gamesSessionMenu.hidden=!activeRoom&&!direct&&!activeLocal;
}
gamesSessionReturn.addEventListener('click',()=>{$('tabPlay').click();});
gamesSessionMenu.addEventListener('click',()=>{
 $('tabPlay').click();
 if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
});
// The connection may change while someone is reading their local library.
// This is presentation only: no new socket, match polling or server messages.
const gamesSessionPoll=setInterval(()=>{
 if(!gamesSessionHost.hidden)refreshGamesSession();
},1400);
gamesSessionPoll?.unref?.();
window.addEventListener('focus',refreshGamesSession);
document.addEventListener('visibilitychange',refreshGamesSession);
// Keep offline replay decode/render work off-screen only while visible.
// A viewer can browse My Games without silently advancing past goal moments.
let parkedReplay=null;
function showView(view){
 const wasWatchingReplay=view!=='play'&&!$('matchView').hidden&&!!replay;
 if(wasWatchingReplay){
  const speed=replay.getSpeed();
  parkedReplay={instance:replay,speed:Number.isFinite(speed)?speed:0};
  if(speed>0){replay.setSpeed(0);$('replayToggle').textContent='▶';}
 }
 const leavingOnline=view!=='play'&&!$('matchView').hidden&&!!serverLink?.room;
 releaseInputs();
 for(const [key,id]of [['home','homeView'],['play','matchView'],['games','gamesView']])
  $(id).hidden=key!==view;
 for(const [key,id]of [['home','tabHome'],['play','tabPlay'],['games','tabReplay']])
  $(id).classList.toggle('active',key===view);
 if(view==='games')refreshGamesSession();
 if(view==='play'){
  // Resume only the exact same replay the viewer parked. New recordings
  // opened from the library must not inherit a previous replay's speed.
  if(parkedReplay){
   const parked=parkedReplay;parkedReplay=null;
   if(replay===parked.instance&&parked.speed>0){
    replay.setSpeed(parked.speed);
    $('replayToggle').textContent='Ⅱ';
   }
  }
  $('gameCanvas').focus();renderer.render();
 }else{
  if(view==='games'&&typeof renderMyGames==='function')renderMyGames();
  // Only solo sandbox matches are automatically paused on navigation.
  // Never send a host-authorized PAUSE message merely because the owner
  // opens Home or My Games. Server matches stay live until explicitly paused.
  if(started&&!paused&&!serverLink&&!peerConnected&&!replay)togglePause();
 }
 if(leavingOnline)notify('Your online room is still running. Return via Kick off to continue playing; pause or leave explicitly.');
}
$('tabHome').onclick=()=>showView('home');$('tabPlay').onclick=()=>showView('play');$('tabReplay').onclick=()=>showView('games');
// Central safety boundary for ALL original Home and practice entry points.
// Native WebSocket host/match authority cannot be replaced by a local-mode click.
function pendingSessionBlock(){
 if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
  return 'Room recovery is still active. Choose Stop reconnecting before starting another game.';
 if(serverLink)return serverLink.room?
  'Leave your current native online room explicitly before changing game modes.':
  'Cancel your current native online connection or human search before changing game modes.';
 if(peerConnected)return 'Disconnect from the current direct-peer match before changing game modes.';
 if(document.querySelector('.quick-queue-actions button:not([hidden])')||
    document.querySelector('.quick-ready:not([hidden])'))
  return 'Finish or cancel the human matchmaking queue or ready check first.';
 if(document.getElementById('joinScreen')?.hidden===false)
  return 'Close the active sign-in or room invitation before starting another game.';
 return '';
}
function quickPlay(mode,localConsent=false,timedNativeDrill=false){
 const reason=pendingSessionBlock();
 if(reason){notify(reason);return false;}
 // Explicitly confirmed drill launchers pass localConsent=true. Direct Home
 // cards must ask the player themselves before replacing a local session.
 if((started||replay)&&!localConsent&&
    !window.confirm('Replace your active local match or replay with a new '+mode+
      ' session? Unsaved local progress or recording may be lost.')){
  notify('Current local match or replay kept.');return false;
 }
 if(typeof closeMatchMenu==='function')closeMatchMenu();
 if(replay)closeReplay();
 $('mode').value=mode;rosterPreset='';started=false;
 // Explicitly started local timed drills may disable ONLY local score/time caps.
 // Ordinary quick-play, external rooms, peers and persisted player defaults remain unchanged.
 const unlimited=timedNativeDrill===true&&localConsent===true&&['bot','4v4','local'].includes(mode);
 showView('play');resetMatch(true,unlimited);
 if(typeof closeMatchMenu==='function')closeMatchMenu();
 return true;
}
function startNativeCustomRoom(localConsent=false){
 const reason=pendingSessionBlock();
 if(reason){notify(reason);return false;}
 if((started||replay)&&!localConsent&&
    !window.confirm('Leave your current local game or replay to open a new online room? Unsaved progress may be lost.')){
  notify('Current local game or replay kept.');return false;
 }
 // A human-specified WebSocket endpoint is valid even when this web host
 // intentionally does not supply a default server. Existing connectServer
 // still checks protocol, active sessions and server-issued permissions.
 if(typeof connectServer==='function'&&$('serverAddress').value.trim())connectServer(true);
 else{showView('play');openDialog('networkDialog');}
 return true;
}
function openHumanQuickMatch(){
 showView('home');
 const panel=document.querySelector('.quick-queue-panel');
 if(!panel)return;
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 panel.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
 const first=panel.querySelector('.quick-queue-mode:not(:disabled)');
 first?.focus({preventScroll:true});
}
$('heroFindMatch').onclick=$('quickMatch').onclick=openHumanQuickMatch;
$('heroPlay').onclick=()=>quickPlay('bot');
$('quickPractice').onclick=()=>quickPlay('bot');$('quickSquad').onclick=()=>quickPlay('4v4');$('quickOnline').onclick=()=>startNativeCustomRoom();$('quickReplay').onclick=()=>showView('games');
showView('home');
$('botDifficulty').value=settings.difficulty||'hard';$('botDifficulty').onchange=()=>{settings.difficulty=$('botDifficulty').value;settings.botLevels={};savePrefs();if(serverLink?.isOwner)serverLink.send({type:'difficulty',difficulty:settings.difficulty,botLevels:{},teamProfile:settings.teamProfile});rosterKey='';updateRoster();};
$('watchBots').onclick=()=>quickPlay('watch');
