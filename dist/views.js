'use strict';
// Main navigation: Play (home), Social, My Games, Profile, plus the match itself.
const views=[['home','homeView','tabHome'],['social','socialView','tabSocial'],['games','gamesView','tabGames'],['profile','profileView','tabProfile'],['play','matchView','tabPlay']];
function showView(view){releaseInputs();for(const [key,id,tab]of views){$(id).hidden=key!==view;$(tab).classList.toggle('active',key===view);}if(view==='play'){$('gameCanvas').focus();renderer.render();}else if(started&&!paused&&!peerConnected&&!replay)togglePause();}
for(const [key,,tab]of views)$(tab).onclick=()=>showView(key);
function quickPlay(mode){if(typeof closeMatchMenu==='function')closeMatchMenu(false);if(replay)closeReplay();if(peerConnected)disconnect();$('mode').value=mode;showView('play');resetMatch(true);}
$('quickOnline').onclick=()=>{showView('play');openDialog('networkDialog');};$('quickReplay').onclick=()=>{showView('play');$('replayFile').click();};
showView('home');
$('botDifficulty').value=settings.difficulty||'hard';$('botDifficulty').onchange=()=>{settings.difficulty=$('botDifficulty').value;settings.botLevels={};savePrefs();if(serverLink?.isOwner)serverLink.send({type:'difficulty',difficulty:settings.difficulty,botLevels:{},teamProfile:settings.teamProfile});updateRoster();};
$('watchBots').onclick=$('watchHome').onclick=()=>quickPlay('watch');$('playPractice').onclick=()=>quickPlay('practice');$('playLocal').onclick=()=>quickPlay('local');
