'use strict';
function showView(view){releaseInputs();for(const [key,id]of [['home','homeView'],['play','matchView']])$(id).hidden=key!==view;for(const [key,id]of [['home','tabHome'],['play','tabPlay']])$(id).classList.toggle('active',key===view);$('tabReplay').classList.remove('active');if(view==='play'){$('gameCanvas').focus();renderer.render();}else if(started&&!paused&&!peerConnected&&!replay)togglePause();}
$('tabHome').onclick=()=>showView('home');$('tabPlay').onclick=()=>showView('play');$('tabReplay').onclick=()=>{showView('play');$('replayFile').click();};
function quickPlay(mode){if(typeof closeMatchMenu==='function')closeMatchMenu();if(replay)closeReplay();if(peerConnected)disconnect();$('mode').value=mode;rosterPreset='';started=false;showView('play');resetMatch(true);if(typeof closeMatchMenu==='function')closeMatchMenu();}
$('heroPlay').onclick=$('quickMatch').onclick=()=>quickPlay('bot');$('quickSquad').onclick=()=>quickPlay('4v4');$('quickOnline').onclick=()=>{if(typeof connectServer==='function'&&defaultServer)connectServer(true);else{showView('play');openDialog('networkDialog');}};$('quickReplay').onclick=()=>{showView('play');$('replayFile').click();};
showView('home');
$('botDifficulty').value=settings.difficulty||'hard';$('botDifficulty').onchange=()=>{settings.difficulty=$('botDifficulty').value;settings.botLevels={};savePrefs();if(serverLink?.isOwner)serverLink.send({type:'difficulty',difficulty:settings.difficulty,botLevels:{},teamProfile:settings.teamProfile});rosterKey='';updateRoster();};
$('watchBots').onclick=()=>quickPlay('watch');
