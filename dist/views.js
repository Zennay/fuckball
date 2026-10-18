'use strict';
function showView(view){releaseInputs();for(const [key,id]of [['home','homeView'],['play','matchView'],['games','gamesView']])$(id).hidden=key!==view;for(const [key,id]of [['home','tabHome'],['play','tabPlay'],['games','tabReplay']])$(id).classList.toggle('active',key===view);if(view==='play'){$('gameCanvas').focus();renderer.render();}else{if(view==='games'&&typeof renderMyGames==='function')renderMyGames();if(started&&!paused&&!peerConnected&&!replay)togglePause();}}
$('tabHome').onclick=()=>showView('home');$('tabPlay').onclick=()=>showView('play');$('tabReplay').onclick=()=>showView('games');
function quickPlay(mode){if(typeof closeMatchMenu==='function')closeMatchMenu();if(replay)closeReplay();if(peerConnected)disconnect();$('mode').value=mode;rosterPreset='';started=false;showView('play');resetMatch(true);if(typeof closeMatchMenu==='function')closeMatchMenu();}
function openHumanQuickMatch(){
 showView('home');
 const panel=document.querySelector('.quick-queue-panel');
 if(!panel)return;
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 panel.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
 const first=panel.querySelector('.quick-queue-mode:not(:disabled)');
 first?.focus({preventScroll:true});
}
$('heroPlay').onclick=$('quickMatch').onclick=openHumanQuickMatch;
$('quickPractice').onclick=()=>quickPlay('bot');$('quickSquad').onclick=()=>quickPlay('4v4');$('quickOnline').onclick=()=>{if(typeof connectServer==='function'&&defaultServer)connectServer(true);else{showView('play');openDialog('networkDialog');}};$('quickReplay').onclick=()=>showView('games');
showView('home');
$('botDifficulty').value=settings.difficulty||'hard';$('botDifficulty').onchange=()=>{settings.difficulty=$('botDifficulty').value;settings.botLevels={};savePrefs();if(serverLink?.isOwner)serverLink.send({type:'difficulty',difficulty:settings.difficulty,botLevels:{},teamProfile:settings.teamProfile});rosterKey='';updateRoster();};
$('watchBots').onclick=()=>quickPlay('watch');
