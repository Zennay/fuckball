'use strict';
// Play / Social / My Games / Profile pages, live scoreboards with ping, full-time summary and on-device match history.
const HISTORY_KEY='fuckball.history',HISTORY_MIN_SECONDS=120,HISTORY_LIMIT=50,SIZE_MODES=['bot','2v2','3v3','4v4'];
const MODE_NAMES={bot:'1v1',local:'Shared keyboard',practice:'Practice','2v2':'2v2','3v3':'3v3','4v4':'4v4',watch:'4v4 bots'};
let teamSize=[1,2,3,4].includes(settings.teamSize)?settings.teamSize:4,pings={},matchLog={goals:[],lastKick:null},pendingResult=null,summary=null,resultTimer=null,endTimer=null;
function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=String(text);return e;}
function readHistory(){try{const list=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(list)?list:[];}catch{return [];}}
function writeHistory(list){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(list.slice(0,HISTORY_LIMIT)));}catch{}}
function ownId(){return peerRole==='guest'?networkPlayerId:1;}
function isBot(p){return p.bot??(serverLink?p.id>=100:botIds.has(p.id));}
// Local room (offline or direct-connection host) owns the simulation and sees every kick.
function localAuthority(){return !serverLink&&!(peerConnected&&peerRole==='guest')&&!replay;}
function pingText(p){if(isBot(p))return ['BOT',''];if(p.id===ownId()&&peerConnected)return pingValue(net.rtt);if(serverLink&&Number.isFinite(pings[p.id]))return pingValue(pings[p.id]);return [peerConnected?'—':'LOCAL',''];}
function pingValue(ms){ms=Math.round(ms);return [ms+' ms',ms>=150?'bad':ms>=80?'warn':''];}
function goalsBy(goals,id){let scored=0,own=0;for(const g of goals)if(g.id===id){if(g.own)own++;else scored++;}return [scored,own];}
function snapshotPlayers(){return ((replay?.state||room?.state)?.players||[]).map(p=>({id:p.id,name:p.name,team:p.team.id,bot:isBot(p)}));}
function renderBoard(target,players,goals){
 target.replaceChildren();
 for(const [team,name]of [[1,'red'],[2,'blue']]){
  const column=el('div','board-team '+name),head=el('div','board-row board-head');head.append(el('span','board-name',name.toUpperCase()),el('span','board-goals','G'),el('span','board-ping','PING'));column.append(head);
  for(const p of players.filter(p=>p.team===team)){
   const row=el('div','board-row'+(p.id===ownId()&&!replay?' you':'')),label=el('span','board-name',p.name);
   if(p.id===ownId()&&!replay&&$('mode').value!=='watch')label.append(el('i','board-tag','YOU'));else if(p.bot)label.append(el('i','board-tag','BOT'));
   const [scored,own]=goalsBy(goals,p.id),[ping,quality]=pingText(p);
   row.append(label,el('span','board-goals',scored+(own?' · '+own+' OG':'')),el('span','board-ping '+quality,ping));column.append(row);
  }
  target.append(column);
 }
 const spectators=players.filter(p=>p.team!==1&&p.team!==2);if(spectators.length)target.append(el('p','board-spectators','Spectators · '+spectators.map(p=>p.name).join(', ')));
}
// Match events: scorer is the last player to kick the ball; a kick by the conceding team is an own goal.
matchHooks.kick=id=>{if(localAuthority())matchLog.lastKick=id;};
matchHooks.goal=team=>{if(!localAuthority())return;const p=room.state.players.find(p=>p.id===matchLog.lastKick);matchLog.goals.push({team,id:p?.id??null,name:p?.name||'',own:!!p&&p.team.id!==team,time:room.gameState?.timeElapsed||0});};
matchHooks.end=()=>{if(!localAuthority())return;const g=room.gameState;pendingResult={red:g?.redScore||0,blue:g?.blueScore||0,time:g?.timeElapsed||0,mode:$('mode').value,map:stadium.name,goals:[...matchLog.goals],players:snapshotPlayers(),online:false};clearTimeout(endTimer);endTimer=setTimeout(matchHooks.fullTime,3000);};
// The engine keeps the finished game (victory animation) for a few seconds; end the match for the UI after 3 s.
matchHooks.fullTime=()=>{clearTimeout(endTimer);if(!pendingResult||replay)return;const result=pendingResult;pendingResult=null;started=false;paused=false;releaseInputs();setButtons();showSummary(result);};
matchHooks.server=d=>{
 if(d.type==='pings'&&d.pings&&typeof d.pings==='object')pings=d.pings;
 else if(d.type==='room'&&Array.isArray(d.goals))matchLog.goals=d.goals.slice(0,99);
 else if(d.type==='goal'&&d.scorer)matchLog.goals.push(d.scorer);
 else if(d.type==='result'){const result={red:+d.red||0,blue:+d.blue||0,time:+d.time||0,mode:String(d.mode||$('mode').value),map:String(d.map||stadium.name),goals:Array.isArray(d.goals)?d.goals.slice(0,99):[],players:snapshotPlayers(),online:true};clearTimeout(resultTimer);resultTimer=setTimeout(()=>{if(serverLink)showSummary(result);},2000);}
};
function showSummary(result){
 const mode=result.mode,me=result.players.find(p=>p.id===ownId()),team=['watch','local'].includes(mode)?0:me?.team===1||me?.team===2?me.team:0;
 const outcome=result.red===result.blue?'D':(result.red>result.blue)===(team===1)?'W':'L',winner=result.red>result.blue?'RED WINS':result.blue>result.red?'BLUE WINS':'DRAW';
 $('summaryTitle').textContent=team?{W:'YOU WIN',L:'YOU LOSE',D:'DRAW'}[outcome]:winner;
 $('summaryStadium').textContent='FULL TIME · '+String(result.map).toUpperCase();
 $('summaryScore').textContent=result.red+' : '+result.blue;
 $('summaryMeta').textContent=fmt(result.time)+' · '+(MODE_NAMES[mode]||mode)+(result.online?' · Online room':'')+(team?' · You played '+(team===1?'Red':'Blue'):'');
 renderBoard($('summaryBoard'),result.players,result.goals);
 const eligible=mode!=='watch'&&result.time>=HISTORY_MIN_SECONDS;
 if(eligible){const [scored]=goalsBy(result.goals,ownId());writeHistory([{at:Date.now(),mode,map:String(result.map).slice(0,60),red:result.red,blue:result.blue,time:result.time,team,result:team?outcome:null,goals:team?scored:0,online:result.online,scorers:result.goals.filter(g=>g.name).slice(0,30).map(g=>({team:g.team,name:String(g.name).slice(0,25),own:!!g.own}))},...readHistory()]);renderGames();}
 $('summaryNote').textContent=eligible?'Saved to My Games.':mode==='watch'?'Bot-only matches are not saved.':'Not saved to My Games: under '+fmt(HISTORY_MIN_SECONDS)+' played.';
 const host=!serverLink||serverLink.isOwner;$('summaryRematch').disabled=$('summaryNew').disabled=!host;$('summaryRematch').title=host?'Same players, sides swapped':'The host decides';
 summary=result;releaseInputs();$('startOverlay').hidden=true;$('matchSummary').hidden=false;document.body.classList.add('summary-open');$('summaryRematch').focus();
}
function hideSummary(){if(!summary)return;summary=null;$('matchSummary').hidden=true;document.body.classList.remove('summary-open');}
$('summaryRematch').onclick=()=>{if(serverLink){if(serverLink.isOwner)serverLink.send({type:'rematch'});hideSummary();return;}myTeam=myTeam===1?2:1;resetMatch(true);};
$('summaryNew').onclick=()=>{if(serverLink){if(serverLink.isOwner)serverLink.send({type:'start'});hideSummary();return;}resetMatch(true);};
$('summaryExit').onclick=()=>{hideSummary();if(serverLink||peerConnected)leaveRoom();showView('home');};
function leaveRoom(){$('disconnectPeer').onclick({});}
const lobbyBaseReset=resetMatch;resetMatch=function(play=true){hideSummary();pendingResult=null;clearTimeout(endTimer);if(!serverLink)matchLog={goals:[],lastKick:null};return lobbyBaseReset(play);};
const lobbyBaseButtons=setButtons;setButtons=function(){lobbyBaseButtons();if(summary)$('startOverlay').hidden=true;};
const lobbyBaseDisconnect=disconnect;disconnect=function(){clearTimeout(resultTimer);pings={};matchLog={goals:[],lastKick:null};lobbyBaseDisconnect();};
// Play page: team size, bot difficulty and the main action.
function sizeMode(){return SIZE_MODES[teamSize-1];}
function refreshPlay(){
 for(let i=1;i<=4;i++){$('size'+i).classList.toggle('selected',i===teamSize);$('size'+i).setAttribute?.('aria-checked',String(i===teamSize));}
 const level=settings.difficulty||'hard';for(const name of ['Easy','Normal','Hard','Elite']){$('diff'+name).classList.toggle('selected',name.toLowerCase()===level);$('diff'+name).setAttribute?.('aria-checked',String(name.toLowerCase()===level));}
 $('heroPlayDetail').textContent=(teamSize===1?'You vs 1 bot':'You + '+(teamSize-1)+' bot'+(teamSize>2?'s':'')+' vs '+teamSize+' bots')+' · '+level[0].toUpperCase()+level.slice(1);
 $('heroSizeCaption').textContent=teamSize+'v'+teamSize;
 $('homeStatus').textContent=serverLink?.room?'● IN ROOM '+serverLink.room:'● READY TO PLAY';
}
for(let i=1;i<=4;i++)$('size'+i).onclick=()=>{teamSize=i;settings.teamSize=i;savePrefs();refreshPlay();};
for(const name of ['Easy','Normal','Hard','Elite'])$('diff'+name).onclick=()=>{$('botDifficulty').value=name.toLowerCase();$('botDifficulty').onchange();refreshPlay();};
$('heroPlay').onclick=()=>quickPlay(sizeMode());
function createRoom(){if(!$('serverAddress').value){showView('play');openDialog('networkDialog');return;}$('mode').value=sizeMode();connectServer(true);}
$('quickOnline').onclick=$('socialCreateRoom').onclick=createRoom;
$('joinLinkForm').onsubmit=e=>{e.preventDefault();const value=$('joinLinkInput').value.trim(),m=/[?&]room=([A-Za-z0-9]+)/.exec(value)||/^([A-Za-z0-9]{6,12})$/.exec(value);if(!m){notify('Paste the full invite link.');return;}$('joinLinkInput').value='';connectServer(false,m[1].toUpperCase());};
$('joinLinkButton').onclick=()=>$('joinLinkForm').onsubmit({preventDefault(){}});
// My Games: on-device history and totals.
function renderGames(){
 const list=readHistory(),mine=list.filter(g=>g.team);let w=0,d=0,l=0,goals=0,time=0;for(const g of mine){if(g.result==='W')w++;else if(g.result==='D')d++;else if(g.result==='L')l++;goals+=+g.goals||0;time+=+g.time||0;}
 $('statGames').textContent=mine.length;$('statRecord').textContent=w+'-'+d+'-'+l;$('statGoals').textContent=goals;$('statTime').textContent=Math.floor(time/3600)?Math.floor(time/3600)+'h '+String(Math.floor(time/60)%60).padStart(2,'0')+'m':fmt(time);
 $('gamesList').replaceChildren();$('gamesEmpty').hidden=list.length>0;$('gamesClear').hidden=!list.length;
 for(const g of list){
  const row=el('div','game-row'),badge=el('span','game-result '+(g.result||'none').toLowerCase(),g.result||'—'),main=el('div','game-main'),score=el('strong','game-score');
  score.append(el('b','red','RED'),document.createTextNode(' '+(+g.red||0)+' : '+(+g.blue||0)+' '),el('b','blue','BLUE'));
  const when=new Date(+g.at||0),meta=el('small','game-meta',[MODE_NAMES[g.mode]||g.mode,g.map,fmt(g.time),g.online?'Online':'Offline',when.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' '+when.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})].join(' · '));
  main.append(score,meta);if(Array.isArray(g.scorers)&&g.scorers.length)main.append(el('small','game-scorers','Goals · '+g.scorers.map(s=>s.name+(s.own?' (OG)':'')).join(', ')));
  row.append(badge,main,el('span','game-goals',g.team?(+g.goals||0)+' G':''));$('gamesList').append(row);
 }
}
$('gamesOpenReplay').onclick=()=>$('replayFile').click();
$('gamesClear').onclick=()=>{if(window.confirm&&!window.confirm('Delete all saved matches on this device?'))return;writeHistory([]);renderGames();};
// Profile and accessibility preferences.
function applyPreferences(){document.body.classList.toggle('reduce-transparency',!!settings.reduceTransparency);document.body.classList.toggle('reduce-motion',!!settings.reduceMotion);$('reduceTransparency').checked=$('menuReduceTransparency').checked=!!settings.reduceTransparency;$('reduceMotion').checked=!!settings.reduceMotion;$('profileSound').checked=!!settings.sound;$('profileNameInput').value=settings.name;$('profileDisc').textContent=(settings.name[0]||'P').toUpperCase();}
for(const id of ['reduceTransparency','menuReduceTransparency'])$(id).onchange=()=>{settings.reduceTransparency=$(id).checked;savePrefs();applyPreferences();};
$('reduceMotion').onchange=()=>{settings.reduceMotion=$('reduceMotion').checked;savePrefs();applyPreferences();};
$('profileSound').onchange=()=>{settings.sound=$('profileSound').checked;savePrefs();};
$('profileSave').onclick=()=>{$('nickname').value=$('profileNameInput').value;$('zoom').value=settings.zoom;$('soundEnabled').checked=settings.sound;$('saveSettings').onclick();applyPreferences();};
$('profileControls').onclick=()=>openDialog('helpDialog');
$('settingsButton').onclick=$('profileChip').onclick=()=>showView('profile');
// In-match menu: scoreboard first, Invite only in online rooms, Leave exits the room.
menuItems.splice(1,0,'menuInvite');
function refreshBoards(){
 if(menuOpen){renderBoard($('menuBoard'),snapshotPlayers(),replay?[]:matchLog.goals);$('menuState').textContent=replay?'REPLAY':paused?'PAUSED':started?'LIVE':'NOT STARTED';$('menuInvite').hidden=!serverLink;}
 if(!$('tabBoard').hidden)renderTabBoard();
 $('tabPlay').hidden=!(started||serverLink||replay||peerConnected);
}
function renderTabBoard(){const g=(replay||room)?.gameState,board=el('div','board');renderBoard(board,snapshotPlayers(),replay?[]:matchLog.goals);const head=el('div','tab-board-head');head.append(el('b','red','RED'),el('strong','',(g?.redScore||0)+' : '+(g?.blueScore||0)),el('b','blue','BLUE'),el('time','',fmt(g?.timeElapsed)));$('tabBoard').replaceChildren(head,board);}
const lobbyBaseRefreshMenu=refreshMenu;refreshMenu=function(){lobbyBaseRefreshMenu();refreshBoards();};
$('menuInvite').onclick=()=>copyInvite(false);
$('menuHome').onclick=()=>{if(serverLink||peerConnected)leaveRoom();showView('home');};
const lobbyBaseShowView=showView;showView=function(view){lobbyBaseShowView(view);if(view!=='play')$('tabBoard').hidden=true;if(view==='home')refreshPlay();if(view==='games')renderGames();if(view==='profile')applyPreferences();refreshBoards();};
// Hold Tab during a match for the scoreboard; it never pauses or captures movement keys.
window.addEventListener('keydown',e=>{if(e.code!=='Tab'||$('matchView').hidden||menuOpen||summary||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;e.preventDefault();if($('tabBoard').hidden){$('tabBoard').hidden=false;renderTabBoard();}},true);
window.addEventListener('keyup',e=>{if(e.code==='Tab')$('tabBoard').hidden=true;});
window.addEventListener('blur',()=>{$('tabBoard').hidden=true;});
const boardTimer=setInterval(refreshBoards,500);boardTimer.unref?.();
applyPreferences();refreshPlay();renderGames();refreshBoards();
