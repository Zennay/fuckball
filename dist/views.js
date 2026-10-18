'use strict';
function showView(view){releaseInputs();for(const [key,id]of [['home','homeView'],['play','matchView'],['games','gamesView']])$(id).hidden=key!==view;for(const [key,id]of [['home','tabHome'],['play','tabPlay'],['games','tabReplay']])$(id).classList.toggle('active',key===view);if(view==='play'){$('gameCanvas').focus();renderer.render();}else{if(view==='games'&&typeof renderMyGames==='function')renderMyGames();if(started&&!paused&&!peerConnected&&!replay)togglePause();}}
$('tabHome').onclick=()=>showView('home');$('tabPlay').onclick=()=>showView('play');$('tabReplay').onclick=()=>showView('games');
// Central safety boundary for ALL original Home and practice entry points.
// Native WebSocket host/match authority cannot be replaced by a local-mode click.
function pendingSessionBlock(){
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
function quickPlay(mode,localConsent=false){
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
 showView('play');resetMatch(true);
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
 if(typeof connectServer==='function'&&defaultServer)connectServer(true);
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
