'use strict';
// HaxBall-style room menu: a translucent overlay on top of the running match.
// Opening it never pauses the game; P (or the Pause button) does that.
let menuOpen=false;
const menuPanes={menuMatch:'menuMatchPane',menuHelp:'menuControlsPane',menuVideo:'menuVideoPane'};
function refreshMenu(){const g=(replay||room).gameState;$('menuScore').textContent=(g?.redScore||0)+' : '+(g?.blueScore||0);$('menuClock').textContent=fmt(g?.timeElapsed);$('menuStadium').textContent=(replay?.state?.stadium||stadium).name;$('cameraMode').value=settings.camera||'stadium';$('matchZoom').value=settings.zoom;$('matchZoomValue').textContent=settings.zoom.toFixed(2)+'×';$('matchSound').checked=settings.sound;if(document.activeElement!==$('menuName'))$('menuName').value=settings.name;const online=!!serverLink;$('menuCopyLink').hidden=!online;$('inviteButton').hidden=!online;$('menuOnline').hidden=online||peerConnected;$('disconnectPeer').hidden=true;}
function menuPane(id,button){for(const [b,pane]of Object.entries(menuPanes)){$(pane).hidden=pane!==id;$(b).classList.toggle('selected',b===button);}if(id==='menuControlsPane')renderBindings();}
function openMatchMenu(pane='menuMatchPane',button='menuMatch'){if($('matchView').hidden)showView('play');if(!$('chatForm').hidden)closeChat();if(!menuOpen){releaseInputs();menuOpen=true;$('pauseMenu').hidden=false;document.body.classList.add('menu-open');}updateLobby();rosterKey='';updateRoster();refreshMenu();menuPane(pane,button);}
function closeMatchMenu(){if(!menuOpen)return;cancelBinding();menuOpen=false;$('pauseMenu').hidden=true;document.body.classList.remove('menu-open');updateLobby();$('gameCanvas').focus();}
function toggleMatchMenu(){if(menuOpen)closeMatchMenu();else openMatchMenu();}
const originalShowView=showView;showView=function(view){if(view!=='play')closeMatchMenu();originalShowView(view);document.body.classList.toggle('match-active',view==='play');updateCamera();scheduleFastFrames();if(view==='play'&&!started&&!replay&&!menuOpen)openMatchMenu();};
document.addEventListener('visibilitychange',scheduleFastFrames);
// Starting from the menu drops you straight into the match.
const originalStartStop=startStop;startStop=function(){const wasStarted=started;originalStartStop();if(!wasStarted)closeMatchMenu();};
let cameraSignature='';function updateCamera(render=true){if(!renderer)return;const rect=$('gameCanvas').getBoundingClientRect(),map=replay?.state?.stadium||stadium;if((settings.camera||'stadium')==='stadium'){renderer.followPlayerId=-1;renderer.zoomCoeff=Math.max(.1,Math.min(rect.width/(map.width*2+90),rect.height/(map.height*2+100)))*settings.zoom;}else{renderer.followPlayerId=peerRole==='guest'?networkPlayerId:1;renderer.zoomCoeff=settings.zoom;}if(render)renderer.render();}
// Refit from the active state on every frame, including remote snapshots and replay seeks.
const originalRender=renderer.render;renderer.render=function(...args){const map=replay?.state?.stadium||stadium,key=[map?.width,map?.height,settings.camera,settings.zoom,peerRole,networkPlayerId].join(':');if(key!==cameraSignature){cameraSignature=key;updateCamera(false);}return originalRender.apply(this,args);};
$('matchMenuButton').onclick=toggleMatchMenu;for(const b of Object.keys(menuPanes))$(b).onclick=()=>menuPane(menuPanes[b],b);
$('menuHome').onclick=()=>{if(serverLink||peerConnected)disconnect();showView('home');};$('compatButton').onclick=()=>openDialog('compatDialog');
$('menuFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('matchView').requestFullscreen();}catch{notify('Fullscreen is unavailable.');}};
$('helpButton').onclick=()=>{showView('play');openMatchMenu('menuControlsPane','menuHelp');};
$('cameraMode').onchange=()=>{settings.camera=$('cameraMode').value;savePrefs();updateCamera();};$('matchZoom').oninput=()=>{settings.zoom=+$('matchZoom').value;$('matchZoomValue').textContent=settings.zoom.toFixed(2)+'×';savePrefs();updateCamera();};$('matchSound').onchange=()=>{settings.sound=$('matchSound').checked;savePrefs();};
$('menuName').onchange=()=>setName($('menuName').value);
$('lobbyStart').onclick=()=>{if(!started)startStop();};$('lobbyMenu').onclick=()=>openMatchMenu();
const originalLoadReplay=loadReplay;loadReplay=function(bytes,name){closeMatchMenu();showView('play');originalLoadReplay(bytes,name);updateCamera();};const originalCloseReplay=closeReplay;closeReplay=function(){originalCloseReplay();updateCamera();};

// Drag players between Red, Spectators and Blue. Pointer events cover mouse,
// pen and touch; the drop target is the column under the pointer.
let drag=null;
function requestMove(id,team){if(serverLink){if(serverLink.isOwner)serverLink.send({type:'team',id,team});}else movePlayer(id,team);}
function columnAt(x,y){let el=document.elementFromPoint?.(x,y);while(el&&el.getAttribute){const t=el.getAttribute('data-team');if(t!==null&&t!==undefined)return +t;el=el.parentElement;}return null;}
function rowOf(el){while(el&&el!==document.body){if(el.playerId!==undefined)return el;el=el.parentElement;}return null;}
$('teamColumns').addEventListener('pointerdown',e=>{if(e.button>0||!rosterEditable()||['SELECT','BUTTON','OPTION'].includes(e.target.tagName))return;const row=rowOf(e.target);if(!row)return;drag={id:row.playerId,row,x:e.clientX,y:e.clientY,moved:false,ghost:null};});
window.addEventListener('pointermove',e=>{if(!drag)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;if(!drag.moved){drag.moved=true;drag.ghost=drag.row.cloneNode(true);drag.ghost.classList.add('rm-ghost');document.body.append(drag.ghost);drag.row.classList.add('rm-dragging');}drag.ghost.style.transform=`translate(${e.clientX+8}px,${e.clientY-14}px)`;const team=columnAt(e.clientX,e.clientY);for(const c of document.querySelectorAll('.rm-team'))c.classList.toggle('rm-drop',c.getAttribute('data-team')===String(team));});
function endDrag(e){if(!drag)return;const d=drag;drag=null;d.ghost?.remove();d.row.classList.remove('rm-dragging');for(const c of document.querySelectorAll('.rm-team'))c.classList.remove('rm-drop');if(d.moved&&e?.type==='pointerup'){const team=columnAt(e.clientX,e.clientY);if(team!==null)requestMove(d.id,team);}}
window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);

// Rebindable controls. Two slots per action; changes apply immediately.
const actionNames={up:'Move up',down:'Move down',left:'Move left',right:'Move right',kick:'Kick',chat:'Open chat'};
let binding=null;
function keyLabel(code){if(!code)return'—';return code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Arrow(.*)$/,'$1 arrow').replace(/^Numpad/,'Num ').replace(/(Left|Right)$/,' $1').replace(/^Space$/,'Space').toUpperCase();}
function renderBindings(){const list=$('bindingList');list.replaceChildren();for(const [action,label]of Object.entries(actionNames)){const row=document.createElement('div');row.className='rm-binding';const name=document.createElement('span');name.textContent=label;row.append(name);for(const slot of [0,1]){const b=document.createElement('button');b.className='rm-key'+(binding&&binding.action===action&&binding.slot===slot?' listening':'');b.textContent=binding&&binding.action===action&&binding.slot===slot?'Press a key…':keyLabel(settings.keys[action][slot]);b.onclick=()=>{binding={action,slot};renderBindings();};row.append(b);}list.append(row);}$('chatKeyLabel').textContent=keyLabel(settings.keys.chat.find(Boolean)||'');$('hudChatHint').textContent=keyLabel(settings.keys.chat.find(Boolean)||'')+' · chat';}
function cancelBinding(){if(binding){binding=null;renderBindings();}}
function assignBinding(code){const {action,slot}=binding;binding=null;if(code){for(const a of Object.keys(settings.keys))settings.keys[a]=settings.keys[a].map(c=>c===code?'':c);}settings.keys[action][slot]=code;savePrefs();releaseInputs();renderBindings();}
$('resetBindings').onclick=()=>{settings.keys=Object.fromEntries(Object.entries(defaultBindings).map(([k,v])=>[k,[...v]]));binding=null;savePrefs();renderBindings();};
renderBindings();

// Capture before gameplay input. Menu keys never move a player.
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||!$('joinScreen').hidden)return;if(binding){e.preventDefault();e.stopImmediatePropagation();if(e.code==='Escape')cancelBinding();else assignBinding(e.code==='Backspace'||e.code==='Delete'?'':e.code);return;}
 if(e.code==='Escape'){if(e.target===$('chatInput'))return;e.preventDefault();e.stopImmediatePropagation();if($('matchView').hidden)showView('play');else toggleMatchMenu();return;}
 if(menuOpen){if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.code==='KeyP'&&!e.repeat){e.preventDefault();togglePause();}e.stopImmediatePropagation();}},true);
window.addEventListener('resize',updateCamera);document.addEventListener('fullscreenchange',updateCamera);
showView('home');
