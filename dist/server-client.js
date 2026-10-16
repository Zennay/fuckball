'use strict';
const defaultServer=location.hostname.endsWith('.chatgpt.site')?'':(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';$('serverAddress').value=defaultServer;
const baseDisconnect=disconnect;disconnect=function(){const link=serverLink;serverLink=null;if(link?.net){link.net.close();clearInterval(link.netTimer);link.net=null;}hostLabel='';$('inviteButton').hidden=true;if(link){link.ws.onclose=null;link.ws.close();setRoomParam(null);}baseDisconnect();networkPlayerId=2;rosterKey='';updateRoster();if(typeof refreshMenu==='function')refreshMenu();};
const baseSetButtons=setButtons;setButtons=function(){baseSetButtons();if(serverLink?.isOwner){for(const id of ['startButton','resetButton','mode','stadium','scoreLimit','timeLimit','importStadium','editorButton','botDifficulty','joinRed','joinBlue','joinSpec','addBotRed','addBotBlue'])$(id).disabled=!!replay;$('pauseButton').disabled=!started||!!replay;$('recordButton').disabled=!started||!!replay;}else if(serverLink){for(const id of ['joinRed','joinBlue','joinSpec','addBotRed','addBotBlue','watchBots'])$(id).disabled=true;}};
const baseReset=resetMatch;resetMatch=function(play=true){if(!serverLink)return baseReset(play);if(!serverLink.isOwner)return;serverLink.send({type:'configure',mode:['bot','2v2','4v4'].includes($('mode').value)?$('mode').value:'bot',stadium:Utils.exportStadium(stadium),difficulty:settings.difficulty,botLevels:settings.botLevels,teamProfile:settings.teamProfile,scoreLimit:+$('scoreLimit').value,timeLimit:+$('timeLimit').value,started:play,paused:false});};
const baseStartStop=startStop;startStop=function(){if(serverLink){if(serverLink.isOwner)serverLink.send({type:started?'stop':'start'});return;}baseStartStop();};$('startButton').onclick=startStop;
const baseTogglePause=togglePause;togglePause=function(){if(serverLink){if(!serverLink.isOwner||!started)return;paused=!paused;releaseInputs();serverLink.send({type:'pause',value:paused});setButtons();return;}baseTogglePause();};
const baseRecord=record;record=function(){if(serverLink){if(serverLink.isOwner)serverLink.send({type:'record'});return;}baseRecord();};$('recordButton').onclick=record;
const baseModeChange=$('mode').onchange;$('mode').onchange=()=>{if(serverLink)resetMatch(started);else baseModeChange();};
function connectServer(create,roomId=''){try{const address=$('serverAddress').value.trim();if(!address)throw Error('Enter a server address.');const url=new URL(address);if(!['ws:','wss:'].includes(url.protocol))throw Error('Use a ws:// or wss:// address.');if(location.protocol==='https:'&&url.protocol!=='wss:')throw Error('HTTPS requires a wss:// server.');disconnect();if(replay)closeReplay();showView('play');const ws=new WebSocket(url),link={ws,isOwner:false,send:data=>{if(ws.readyState===1)ws.send(JSON.stringify(data));}};serverLink=link;ws.binaryType='arraybuffer';$('serverRoomStatus').textContent='Connecting…';
 $('inviteBox').hidden=true;ws.onopen=()=>link.send({type:'join',create,room:roomId,name:settings.name,netcode:settings.netcode==='classic'?2:3,mesh:peerHostingSupported()});ws.onerror=()=>{$('serverRoomStatus').textContent='Could not connect to server.';};ws.onclose=()=>{if(serverLink===link){disconnect();if(!link.failed)notify('Disconnected.');}};
 ws.onmessage=event=>{if(serverLink!==link)return;if(event.data instanceof ArrayBuffer){try{if(link.net)link.net.serverBinary(event.data);else receiveSnapshot(event.data);}catch{notify('Invalid server snapshot.');}return;}let d;try{d=JSON.parse(event.data);}catch{return;}
 if(d.type==='peering'){if(!link.net)startPeering(link,ws);return;}if(link.net&&link.net.handleServer(d))return;
 if(d.type==='welcome'){networkPlayerId=d.id;link.isOwner=d.owner===d.id;link.room=d.room;peerRole='guest';net.receivedSequence=0;predictor.reset();enableV3(d.netcode===3);const shim={readyState:'open',get bufferedAmount(){return ws.bufferedAmount;},send:data=>{if(link.net&&typeof data==='string'){let m=null;try{m=JSON.parse(data);}catch{}if(m&&link.net.route(m))return;}ws.send(data);},close(){}};setupChannel(shim);shim.onopen();const invite=inviteUrl(d.room);link.invite=invite;$('inviteLink').value=invite;$('inviteBox').hidden=false;$('inviteButton').hidden=false;setRoomParam(d.room);$('connectionText').textContent='Online room · headless server';$('serverRoomStatus').textContent=create?'Room ready. Send the link to your friends.':'Joined via room link.';if($('networkDialog').open)$('networkDialog').close();openMatchMenu();if(create)copyInvite(true);else notify('Joined room');setButtons();rosterKey='';updateRoster();refreshMenu();updateCamera();}
 else if(d.type==='room'){link.isOwner=d.owner===networkPlayerId;$('mode').value=d.mode;settings.difficulty=d.difficulty||'hard';settings.botLevels=d.botLevels||{};$('botDifficulty').value=settings.difficulty;updateRoster();link.roomText='Room '+d.room+' · '+d.players+' online'+(link.isOwner?' · Room owner':'');$('connectionText').textContent=link.roomText+hostLabel;setButtons();rosterKey='';updateRoster();}
 else if(d.type==='error'){const message=inviteError(d.message);$('serverRoomStatus').textContent=message;notify(message);if(!peerConnected){link.failed=true;if(!create){setRoomParam(null);if(!$('networkDialog').open)openDialog('networkDialog');}ws.close();}}
 else if(d.type==='recordingStatus'){$('recordIndicator').hidden=!d.active;$('recordButton').textContent=d.active?'■ Save recording':'● Record';}
 else if(d.type==='recording'){const decoded=atob(d.bytes);saveBlob(Uint8Array.from(decoded,c=>c.charCodeAt(0)),'fuckball-server-'+Date.now()+'.hbr2','application/octet-stream');notify('Replay saved.');}
 else if(d.type==='goal'){beep(650,.22);log((d.team===1?'Red':'Blue')+' scores');}
 else channel?.onmessage?.(event);
 };
 }catch(e){$('serverRoomStatus').textContent=e.message;notify(e.message);}}
function inviteUrl(room){const origin=location.origin&&location.origin!=='null'?location.origin:location.protocol+'//'+location.host;return origin+(location.pathname||'/')+'?room='+encodeURIComponent(room);}
function setRoomParam(room){try{if(typeof history==='undefined'||!history.replaceState||!location.href)return;const url=new URL(location.href);if(room)url.searchParams.set('room',room);else url.searchParams.delete('room');history.replaceState(null,'',url.pathname+url.search+url.hash);}catch{}}
function inviteError(message){if(message==='Room not found.')return'This invite link has expired: the room was closed. Create a new room to play.';if(message==='Room is full.')return'This room is full (8 players). Ask the host for a new room.';return message;}
// navigator.clipboard only exists on HTTPS/localhost; plain-HTTP servers need
// the textarea + execCommand fallback (inside the click gesture).
async function copyText(text){try{if(navigator.clipboard?.writeText&&window.isSecureContext!==false){await navigator.clipboard.writeText(text);return true;}}catch{}try{const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.top='0';t.style.opacity='0';document.body.append(t);t.select();t.setSelectionRange?.(0,text.length);let ok=false;try{ok=document.execCommand('copy');}finally{try{t.remove();}catch{}}return !!ok;}catch{return false;}}
async function copyInvite(silent){const value=$('inviteLink').value;if(!value)return;if(await copyText(value))notify('Room link copied: '+value);else notify(silent?'Room ready · press “Copy room link” to share it':'Copy failed. Link: '+value);}
$('createServerRoom').onclick=()=>connectServer(true);$('copyInvite').onclick=()=>copyInvite(false);$('inviteButton').onclick=$('menuCopyLink').onclick=()=>copyInvite(false);
$('shareInvite').onclick=async()=>{const url=$('inviteLink').value;if(!url)return;if(navigator.share){try{await navigator.share({title:'Fuckball',text:'Join my Fuckball room',url});}catch{}}else copyInvite(false);};
const baseDisconnectPeer=$('disconnectPeer').onclick;$('disconnectPeer').onclick=e=>{const leaving=!!serverLink;baseDisconnectPeer?.(e);if(leaving){setRoomParam(null);$('inviteBox').hidden=true;$('inviteLink').value='';$('serverRoomStatus').textContent='Left the room.';}};
const inviteRoom=(()=>{try{const m=/[?&]room=([^&#]*)/.exec(location.search||'');return m?decodeURIComponent(m[1].replace(/\+/g,' ')):'';}catch{return'';}})().trim().toUpperCase();
if(inviteRoom){if(!/^[A-Z0-9]{6,12}$/.test(inviteRoom)){setRoomParam(null);notify('Invalid invite link.');}else if(!defaultServer){notify('Invite links need the Fuckball online server.');}else{showView('play');connectServer(false,inviteRoom);}}


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
  onAuthority:info=>{const host=info.pending??info.host;if(info.pending==null){hostLabel=host==='server'?'':host===networkPlayerId?' · Hosted by you':' · Hosted by '+(info.name||link.hostName||'a player');if(host===networkPlayerId)notify('Your browser now hosts this room (best connection for everyone).');}else link.hostName=info.name;$('connectionText').textContent=(link.roomText||'Online room')+hostLabel;},
  onError:message=>console.warn('Peer host:',message)});
 link.netTimer=setInterval(()=>{if(serverLink===link)link.net?.tick();},50);
}
document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')serverLink?.net?.relinquish('tab hidden');});
