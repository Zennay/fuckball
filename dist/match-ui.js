'use strict';
// HaxBall-style room menu: a translucent overlay on top of the running match.
// Opening it never pauses the game; P (or the Pause button) does that.
let menuOpen=false;
const menuPanes={menuMatch:'menuMatchPane',menuHelp:'menuControlsPane',menuVideo:'menuVideoPane'};
function refreshMenu(){refreshSpectatorControls(true);window.renderCustomRoomAdmin?.();window.renderRoomPresets?.();window.renderNativeChatMute?.();const g=(replay||room).gameState;$('menuScore').textContent=(g?.redScore||0)+' : '+(g?.blueScore||0);$('menuClock').textContent=fmt(g?.timeElapsed);$('menuStadium').textContent=(replay?.state?.stadium||stadium).name;$('cameraMode').value=settings.camera||'stadium';$('matchZoom').value=settings.zoom;$('matchZoomValue').textContent=settings.zoom.toFixed(2)+'×';$('matchSound').checked=settings.sound;if(document.activeElement!==$('menuName'))$('menuName').value=settings.name;const online=!!serverLink;$('menuCopyLink').hidden=!online;$('inviteButton').hidden=!online;$('menuOnline').hidden=online||peerConnected;$('disconnectPeer').hidden=true;}
function menuPane(id,button){for(const [b,pane]of Object.entries(menuPanes)){$(pane).hidden=pane!==id;$(b).classList.toggle('selected',b===button);}if(id==='menuControlsPane')renderBindings();}
function openMatchMenu(pane='menuMatchPane',button='menuMatch'){if($('matchView').hidden)showView('play');if(!$('chatForm').hidden)closeChat();if(!menuOpen){releaseInputs();menuOpen=true;$('pauseMenu').hidden=false;document.body.classList.add('menu-open');}updateLobby();rosterKey='';updateRoster();refreshMenu();menuPane(pane,button);$(button)?.focus?.();$('pauseMenu').setAttribute?.('aria-modal','true');}
function closeMatchMenu(){if(!menuOpen)return;cancelBinding();menuOpen=false;$('pauseMenu').hidden=true;refreshSpectatorControls(true);document.body.classList.remove('menu-open');$('pauseMenu').removeAttribute?.('aria-modal');updateLobby();$('gameCanvas').focus();}
function toggleMatchMenu(){if(menuOpen)closeMatchMenu();else openMatchMenu();}
const originalShowView=showView;showView=function(view){if(view!=='play')closeMatchMenu();originalShowView(view);document.body.classList.toggle('match-active',view==='play');updateCamera();scheduleFastFrames();if(view==='play'&&!started&&!replay&&!menuOpen)openMatchMenu();};
document.addEventListener('visibilitychange',scheduleFastFrames);
// Starting from the menu drops you straight into the match.
const originalStartStop=startStop;startStop=function(){const wasStarted=started;originalStartStop();if(!wasStarted)closeMatchMenu();};
// Spectators and replay viewers can follow any active player without taking
// control of them. The selection is intentionally local-only and cannot send
// room commands or alter authoritative match state.
let cameraSignature='',spectatorTargetId=null,spectatorRosterKey='',spectatorUiDue=0;
const spectatorToolbar=document.createElement('div');
spectatorToolbar.className='spectator-camera-toolbar';spectatorToolbar.hidden=true;
spectatorToolbar.setAttribute('aria-label','Spectator camera');
const spectatorPrevious=document.createElement('button'),spectatorNext=document.createElement('button');
const spectatorCaption=document.createElement('span');
spectatorPrevious.type=spectatorNext.type='button';
spectatorPrevious.textContent='‹';spectatorNext.textContent='›';
spectatorPrevious.setAttribute('aria-label','Follow previous player');
spectatorNext.setAttribute('aria-label','Follow next player');
spectatorCaption.setAttribute('aria-live','polite');
spectatorToolbar.append(spectatorPrevious,spectatorCaption,spectatorNext);
$('matchView').append(spectatorToolbar);
const spectatorSetting=document.createElement('label');
spectatorSetting.className='spectator-target-setting';
spectatorSetting.textContent='Spectator target';
const spectatorSelect=document.createElement('select');
spectatorSelect.setAttribute('aria-label','Player to follow');
const spectatorHint=document.createElement('small');
spectatorHint.textContent='Changes your camera only. Your team and match remain unchanged.';
spectatorSetting.append(spectatorSelect,spectatorHint);
$('menuVideoPane').querySelector('.rm-form')?.append(spectatorSetting);
function cameraPlayers(){
 const players=(replay?.state||room?.state)?.players;
 return Array.isArray(players)?players.filter(p=>Number.isSafeInteger(p?.id)&&[1,2].includes(p.team?.id))
  .map(p=>({id:p.id,name:String(p.name||'Player').slice(0,25),side:p.team.id}))
  .sort((a,b)=>a.side-b.side||a.id-b.id):[];
}
function isSpectatorCamera(){
 if(replay)return true;
 if(!serverLink&&$('mode')?.value==='watch')return true;
 const players=room?.state?.players||[];
 const id=serverLink?networkPlayerId:1;
 return players.some(p=>p.id===id&&p.team?.id===0);
}
function spectatorTarget(players){
 if(!players.length)return null;
 return players.find(p=>p.id===spectatorTargetId)||players[0];
}
function chooseSpectatorTarget(id){
 const players=cameraPlayers(),selected=players.find(p=>p.id===id);
 if(!selected||!isSpectatorCamera())return;
 spectatorTargetId=selected.id;
 settings.camera='follow';$('cameraMode').value='follow';savePrefs();
 cameraSignature='';refreshSpectatorControls(true);updateCamera();
}
function cycleSpectatorTarget(delta){
 const players=cameraPlayers(),selected=spectatorTarget(players);
 if(!selected)return;
 const next=(players.findIndex(p=>p.id===selected.id)+delta+players.length)%players.length;
 chooseSpectatorTarget(players[next].id);
}
spectatorPrevious.onclick=()=>cycleSpectatorTarget(-1);
spectatorNext.onclick=()=>cycleSpectatorTarget(1);
spectatorSelect.onchange=()=>chooseSpectatorTarget(Number(spectatorSelect.value));
function refreshSpectatorControls(force=false){
 const active=isSpectatorCamera(),players=active?cameraPlayers():[];
 const rosterKey=JSON.stringify([active,players,spectatorTargetId,settings.camera,menuOpen,$('matchView').hidden]);
 if(!force&&rosterKey===spectatorRosterKey)return;
 spectatorRosterKey=rosterKey;
 const target=spectatorTarget(players),show=active&&players.length>0;
 spectatorToolbar.hidden=!show||$('matchView').hidden||menuOpen;
 spectatorSetting.hidden=!show;
 if(!show){spectatorSelect.replaceChildren();return;}
 const currentOptions=spectatorSelect.options||spectatorSelect.children||[];
 if(force||currentOptions.length!==players.length||
    [...currentOptions].some((o,i)=>Number(o.value)!==players[i].id)){
  spectatorSelect.replaceChildren();
  for(const p of players){const option=document.createElement('option');option.value=String(p.id);option.textContent=(p.side===1?'RED':'BLUE')+' · '+p.name;spectatorSelect.add(option);}
 }
 spectatorSelect.value=String(target.id);
 spectatorPrevious.disabled=spectatorNext.disabled=players.length<=1;
 spectatorCaption.textContent=settings.camera==='stadium'?'FULL PITCH · select a player':
  (target.side===1?'RED':'BLUE')+' · '+target.name;
}
function updateCamera(render=true){
 if(!renderer)return;
 const rect=$('gameCanvas').getBoundingClientRect(),map=replay?.state?.stadium||stadium;
 if((settings.camera||'stadium')==='stadium'){
  renderer.followPlayerId=-1;
  renderer.zoomCoeff=Math.max(.1,Math.min(rect.width/(map.width*2+90),rect.height/(map.height*2+100)))*settings.zoom;
 }else{
  const selected=isSpectatorCamera()?spectatorTarget(cameraPlayers()):null;
  renderer.followPlayerId=selected?.id??(peerRole==='guest'?networkPlayerId:1);
  renderer.zoomCoeff=settings.zoom;
 }
 if(render)renderer.render();
}
// Refit after remote snapshots/replay seeks without rebuilding menu options
// on every high-refresh rendered frame.
const originalRender=renderer.render;
renderer.render=function(...args){
 const map=replay?.state?.stadium||stadium,watching=isSpectatorCamera();
 const target=watching?spectatorTarget(cameraPlayers())?.id:null;
 const key=[map?.width,map?.height,settings.camera,settings.zoom,peerRole,networkPlayerId,watching,target].join(':');
 if(key!==cameraSignature){cameraSignature=key;updateCamera(false);}
 if(performance.now()>=spectatorUiDue){spectatorUiDue=performance.now()+250;refreshSpectatorControls();}
 return originalRender.apply(this,args);
};
// The window capture listener complements (never replaces) the game's document input listener.
window.addEventListener('keydown',event=>{
 if(event.repeat||menuOpen||!isSpectatorCamera()||!$('joinScreen').hidden||
    $('matchView').hidden||['INPUT','SELECT','TEXTAREA'].includes(event.target?.tagName))return;
 if(event.code==='BracketLeft'||event.code==='BracketRight'){
  event.preventDefault();cycleSpectatorTarget(event.code==='BracketRight'?1:-1);
 }
},true);

$('matchMenuButton').onclick=toggleMatchMenu;for(const b of Object.keys(menuPanes))$(b).onclick=()=>menuPane(menuPanes[b],b);
$('menuHome').onclick=()=>{if(serverLink||peerConnected)disconnect();showView('home');};$('compatButton').onclick=()=>openDialog('compatDialog');
$('menuFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('matchView').requestFullscreen();}catch{notify('Fullscreen is unavailable.');}};
$('helpButton').onclick=()=>{showView('play');openMatchMenu('menuControlsPane','menuHelp');};
$('cameraMode').onchange=()=>{settings.camera=$('cameraMode').value;savePrefs();cameraSignature='';refreshSpectatorControls(true);updateCamera();};$('matchZoom').oninput=()=>{settings.zoom=+$('matchZoom').value;$('matchZoomValue').textContent=settings.zoom.toFixed(2)+'×';savePrefs();updateCamera();};$('matchSound').onchange=()=>{settings.sound=$('matchSound').checked;savePrefs();};
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
 if(menuOpen&&e.code==='Tab'){
  const focusables=[...$('pauseMenu').querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')].filter(el=>!el.closest('[hidden]')&&el.getClientRects().length);
  if(focusables.length){e.preventDefault();e.stopImmediatePropagation();const idx=focusables.indexOf(document.activeElement),next=e.shiftKey?(idx<=0?focusables.length-1:idx-1):(idx<0||idx===focusables.length-1?0:idx+1);focusables[next].focus();}return;
 }
 if(menuOpen){if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.code==='KeyP'&&!e.repeat){e.preventDefault();togglePause();}e.stopImmediatePropagation();}},true);
window.addEventListener('resize',updateCamera);document.addEventListener('fullscreenchange',updateCamera);
// Match menu accessibility/performance options are persisted with ordinary preferences.
// The user's choice overrides the OS hint; an unset preference follows the OS.
function menuPreference(key,media){
 return typeof settings[key]==='boolean'?settings[key]:!!window.matchMedia?.(media)?.matches;
}
function applyMenuPerformance(){
 document.body.classList.toggle('low-menu-transparency',menuPreference('menuLowTransparency','(prefers-reduced-transparency: reduce)'));
 document.body.classList.toggle('low-menu-motion',menuPreference('menuLowMotion','(prefers-reduced-motion: reduce)'));
}
const menuPerformance=$('menuVideoPane');
for(const [key,label,media] of [
 ['menuLowTransparency','Reduce transparency · remove menu blur','(prefers-reduced-transparency: reduce)'],
 ['menuLowMotion','Reduce motion · disable menu animations','(prefers-reduced-motion: reduce)']
]){
 const row=document.createElement('label');row.className='rm-check rm-performance-option';
 const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=menuPreference(key,media);
 checkbox.onchange=()=>{settings[key]=checkbox.checked;savePrefs();applyMenuPerformance();};
 const caption=document.createElement('span');caption.textContent=label;row.append(checkbox,caption);menuPerformance.append(row);
}
applyMenuPerformance();
showView('home');
