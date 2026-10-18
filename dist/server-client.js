'use strict';
const defaultServer=location.hostname.endsWith('.chatgpt.site')?'':(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';$('serverAddress').value=defaultServer;
$('preserveGuestSlot').checked=settings.guestReconnect===true;
$('preserveGuestSlot').onchange=()=>{settings.guestReconnect=$('preserveGuestSlot').checked;savePrefs();};
const baseDisconnect=disconnect;disconnect=function(){const link=serverLink;serverLink=null;if(link?.net){link.net.close();clearInterval(link.netTimer);link.net=null;}hostLabel='';$('inviteButton').hidden=true;if(link){link.ws.onclose=null;if(link.ws.readyState===1)link.send({type:'leave'});link.ws.close();setRoomParam(null);}baseDisconnect();networkPlayerId=2;rosterKey='';updateRoster();if(typeof refreshMenu==='function')refreshMenu();};
const baseSetButtons=setButtons;setButtons=function(){baseSetButtons();if(serverLink?.isOwner){for(const id of ['startButton','resetButton','mode','stadium','scoreLimit','timeLimit','importStadium','editorButton','botDifficulty','joinRed','joinBlue','joinSpec','addBotRed','addBotBlue','swapTeams','allSpec'])$(id).disabled=!!replay;$('pauseButton').disabled=!started||!!replay;$('recordButton').disabled=!started||!!replay;}else if(serverLink){for(const id of ['joinRed','joinBlue','joinSpec','addBotRed','addBotBlue','watchBots','swapTeams','allSpec','scoreLimit','timeLimit','stadium'])$(id).disabled=true;}};
const baseReset=resetMatch;resetMatch=function(play=true){if(!serverLink)return baseReset(play);if(!serverLink.isOwner)return;serverLink.send({type:'configure',mode:['bot','2v2','4v4'].includes($('mode').value)?$('mode').value:'bot',stadium:Utils.exportStadium(stadium),difficulty:settings.difficulty,botLevels:settings.botLevels,teamProfile:settings.teamProfile,scoreLimit:+$('scoreLimit').value,timeLimit:+$('timeLimit').value,started:play,paused:false});};
const baseStartStop=startStop;startStop=function(){if(serverLink){if(serverLink.isOwner)serverLink.send({type:started?'stop':'start'});return;}baseStartStop();};$('startButton').onclick=startStop;
const baseTogglePause=togglePause;togglePause=function(){if(serverLink){if(!serverLink.isOwner||!started)return;paused=!paused;releaseInputs();serverLink.send({type:'pause',value:paused});setButtons();return;}baseTogglePause();};
const baseRecord=record;record=function(){if(serverLink){if(serverLink.isOwner)serverLink.send({type:'record'});return;}baseRecord();};$('recordButton').onclick=record;
const baseModeChange=$('mode').onchange;$('mode').onchange=()=>{if(serverLink)resetMatch(started);else baseModeChange();};
function connectServer(create,roomId='',joinName='',resumeContext=null){try{const address=$('serverAddress').value.trim();if(!address)throw Error('Enter a server address.');const url=new URL(address);if(!['ws:','wss:'].includes(url.protocol))throw Error('Use a ws:// or wss:// address.');if(location.protocol==='https:'&&url.protocol!=='wss:')throw Error('HTTPS requires a wss:// server.');disconnect();if(replay)closeReplay();showView('play');const ws=new WebSocket(url),link={ws,isOwner:false,reconnect:!!resumeContext,retries:resumeContext?.retries||0,previousId:resumeContext?.previousId,resumeTicket:resumeContext?.ticket||null,send:data=>{if(ws.readyState===1)ws.send(JSON.stringify(data));}};serverLink=link;ws.binaryType='arraybuffer';$('serverRoomStatus').textContent='Connecting…';
 $('inviteBox').hidden=true;ws.onopen=()=>link.send({type:'join',create,room:roomId,name:joinName||settings.name,token:settings.account?.token||undefined,netcode:settings.netcode==='classic'?2:3,mesh:peerHostingSupported(),resumeOptIn:settings.guestReconnect===true,resume:resumeContext?.ticket||undefined});ws.onerror=()=>{$('serverRoomStatus').textContent='Could not connect to server.';};ws.onclose=()=>{if(serverLink!==link)return;const room=link.room,tries=(link.retries||0),previousId=link.previousId??networkPlayerId,ticket=link.resumeTicket;disconnect();if(link.failed)return;
  // Dropped connection (Wi-Fi switch, proxy hiccup): rejoin the same room a few times.
  if(room&&tries<3){const delay=1000*2**tries;notify('Connection lost. Reconnecting… ('+(tries+1)+'/3)');setTimeout(()=>{if(serverLink)return;connectServer(false,room,'',{ticket,previousId,retries:tries+1});},delay);}else notify('Disconnected.');};
 ws.onmessage=event=>{if(serverLink!==link)return;if(event.data instanceof ArrayBuffer){try{if(link.net)link.net.serverBinary(event.data);else receiveSnapshot(event.data);}catch{notify('Invalid server snapshot.');}return;}let d;try{d=JSON.parse(event.data);}catch{return;}
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
 if(d.type==='welcome'){link.retries=0;link.identityChanged=!!(link.reconnect&&Number.isSafeInteger(link.previousId)&&link.previousId!==d.id);networkPlayerId=d.id;link.isOwner=d.owner===d.id;link.room=d.room;peerRole='guest';net.receivedSequence=0;predictor.reset();enableV3(d.netcode===3);const shim={readyState:'open',get bufferedAmount(){return ws.bufferedAmount;},send:data=>{if(link.net&&typeof data==='string'){let m=null;try{m=JSON.parse(data);}catch{}if(m&&link.net.route(m))return;}ws.send(data);},close(){}};setupChannel(shim);shim.onopen();const invite=inviteUrl(d.room);link.invite=invite;$('inviteLink').value=invite;$('inviteBox').hidden=false;$('inviteButton').hidden=false;setRoomParam(d.room);$('connectionText').textContent='Online room · headless server';$('serverRoomStatus').textContent=create?'Room ready. Send the link to your friends.':'Joined via room link.';if($('networkDialog').open)$('networkDialog').close();if(link.reconnect)notify(d.resumed?'Reconnected to your original player slot. Team and play time preserved.':link.identityChanged?'Connected with a new player slot.':'Reconnected');else openMatchMenu();if(create)copyInvite(true);else if(!link.reconnect)notify('Joined room');setButtons();rosterKey='';updateRoster();refreshMenu();updateCamera();}
 else if(d.type==='room'){link.roomState=d;link.isOwner=d.owner===networkPlayerId;botIds=new Set(d.botIds||[]);$('mode').value=d.mode;settings.difficulty=d.difficulty||'hard';settings.botLevels=d.botLevels||{};$('botDifficulty').value=settings.difficulty;updateRoster();link.roomText='Room '+d.room+' · '+d.players+' online'+(link.isOwner?' · Host':'');$('connectionText').textContent=link.roomText+hostLabel+(link.identityChanged?' · New player ID':'');setButtons();rosterKey='';updateRoster();renderSubPanel();}
 else if(d.type==='error'&&link.reconnect&&/^Session (expired|belongs)/.test(d.message)){link.failed=true;ws.close();showJoinScreen(roomId||'', 'Your former player slot expired. Join again to get a new slot.');}
 else if(d.type==='error'&&!peerConnected&&/^Name reserved/.test(d.message)){link.failed=true;ws.close();showJoinScreen(roomId||'',d.message);}
 else if(d.type==='error'){const message=inviteError(d.message);$('serverRoomStatus').textContent=message;notify(message);if(!peerConnected){link.failed=true;if(!create){setRoomParam(null);if(!$('networkDialog').open)openDialog('networkDialog');}ws.close();}}
 else if(d.type==='recordingStatus'){$('recordIndicator').hidden=!d.active;$('recordButton').textContent=d.active?'■ Save recording':'● Record';}
 else if(d.type==='recording'){const decoded=atob(d.bytes);saveBlob(Uint8Array.from(decoded,c=>c.charCodeAt(0)),'fuckball-server-'+Date.now()+'.hbr2','application/octet-stream');notify('Replay saved.');}
 else if(d.type==='playingTime'){if(link.roomState&&Array.isArray(d.activeFrames)){link.roomState.activeFrames=d.activeFrames;if(menuOpen)renderSubPanel();}}
 else if(d.type==='subApplied'){notify('Substitution: '+d.outId+' → '+d.inId+' ('+(d.team===1?'Red':'Blue')+').');renderSubPanel();}
 else if(d.type==='matchResult'){notify((d.winner===1?'Red':d.winner===2?'Blue':'Neither side')+' wins · '+d.red+' : '+d.blue+'.');openMatchMenu();}
 else if(d.type==='matchRestart'){notify(d.rematch?'Rematch started · teams swapped':'New game started');if(menuOpen)closeMatchMenu();}
 else if(d.type==='goal'){beep(650,.22);log((d.team===1?'Red':'Blue')+' scores');}
 else channel?.onmessage?.(event);
 };
 }catch(e){$('serverRoomStatus').textContent=e.message;notify(e.message);}}
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
const inviteRoom=(()=>{try{const m=/[?&]room=([^&#]*)/.exec(location.search||'');return m?decodeURIComponent(m[1].replace(/\+/g,' ')):'';}catch{return'';}})().trim().toUpperCase();
if(inviteRoom){if(!/^[A-Z0-9]{6,12}$/.test(inviteRoom)){setRoomParam(null);notify('Invalid invite link.');}else if(!defaultServer){notify('Invite links need the Fuckball online server.');}else{showView('play');showJoinScreen(inviteRoom);}}


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
function showJoinScreen(room,error=''){joinRoomId=room;$('joinRoomCode').textContent=room||'';$('joinScreen').hidden=false;$('joinPlay').hidden=!room;$('joinAuth').hidden=!!room;$('joinError').textContent=error;if(typeof closeMatchMenu==='function')closeMatchMenu();renderAccount();if(room){$('joinName').value=settings.account?.username||(settings.name!=='Player'?settings.name:'');$('joinName').focus();}else $('authUser').focus();}
function hideJoinScreen(){$('joinScreen').hidden=true;$('joinError').textContent='';}
function renderAccount(){const a=settings.account;$('joinAccount').textContent=a?'Logged in as '+a.username+'.':'';$('joinShowLogin').hidden=!!a;$('joinName').disabled=!!a;$('accountStatus').textContent=a?'Logged in as '+a.username:'Not logged in · nickname only';$('accountButton').textContent=a?'Log out':'Log in / create account';}
function joinRoom(name){if(!joinRoomId)return;hideJoinScreen();connectServer(false,joinRoomId,name);}
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
function renderNextMatchPanel(){
 const panel=$('nextMatchPanel'),link=serverLink,state=link?.roomState;
 panel.hidden=!(link?.room&&state&&!state.started);
 if(panel.hidden)return;
 const result=state.lastResult,request=state.rematch;
 $('nextMatchTitle').textContent=result?'Round '+result.round+' · '+result.red+' : '+result.blue:'Ready for another game';
 const voters=new Set(request?.required||[]),approved=new Set(request?.accepted||[]);
 $('nextMatchInfo').textContent=request?
   'Rematch awaiting '+(voters.size-approved.size)+' of '+voters.size+' active players · expires shortly':
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
 const host=!!link.isOwner;
 $('rematchRequest').hidden=!result||!!request||!host;
 $('rematchRequest').disabled=!result||!!request||!host;
 $('nextGame').hidden=!host;
 $('nextGame').disabled=!host;
 const canVote=!!request&&voters.has(networkPlayerId)&&!approved.has(networkPlayerId);
 $('rematchAccept').hidden=!canVote;
 $('rematchDecline').hidden=!canVote;
}
$('rematchRequest').onclick=()=>serverLink?.send({type:'rematchRequest'});
$('nextGame').onclick=()=>serverLink?.send({type:'newGame'});
$('rematchAccept').onclick=()=>{
 const request=serverLink?.roomState?.rematch;
 if(request)serverLink.send({type:'rematchVote',id:request.id,accept:true});
};
$('rematchDecline').onclick=()=>{
 const request=serverLink?.roomState?.rematch;
 if(request)serverLink.send({type:'rematchVote',id:request.id,accept:false});
};
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
accountMatchSection.append(accountMatchHeader,accountMatchStatus,accountMatchSummary,accountMatchList);
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
.server-match-history [role=status]{font-size:12px;color:#c6ddc3}
`;
(document.head||document.body).append(accountMatchStyle);
let accountMatchLoad=0,accountHistoryItems=[];
async function renderAccountMatchHistory(){
 const load=++accountMatchLoad,status=accountMatchStatus,list=accountMatchList;
 list.replaceChildren();accountMatchSummary.textContent='';accountHistoryItems=[];exportServerHistory.disabled=true;eraseServerHistory.disabled=true;
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
 }catch{
  if(load===accountMatchLoad)status.textContent='Could not load server results. Local replays are still available.';
 }
}
refreshServerHistory.onclick=renderAccountMatchHistory;
exportServerHistory.onclick=()=>{
 if(!accountHistoryItems.length||!settings.account?.token)return;
 const payload={source:'native-server',ranked:false,exportedAt:new Date().toISOString(),items:accountHistoryItems};
 const bytes=new TextEncoder().encode(JSON.stringify(payload,null,2));
 saveBlob(bytes,'fuckball-my-server-results-'+new Date().toISOString().slice(0,10)+'.json','application/json');
};
eraseServerHistory.onclick=async()=>{
 const token=settings.account?.token;
 if(!token||!accountHistoryItems.length)return;
 if(typeof window.confirm!=='function'||!window.confirm('Permanently delete all your server-recorded match results? This cannot be undone. Local replay files will remain.'))return;
 eraseServerHistory.disabled=true;accountMatchStatus.textContent='Removing your stored server results…';
 try{
  const response=await fetch('/api/match-history',{method:'DELETE',headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)throw Error('Could not delete your results.');
  if(settings.account?.token===token)await renderAccountMatchHistory();
 }catch{if(settings.account?.token===token){accountMatchStatus.textContent='Could not delete server results. Please try again.';eraseServerHistory.disabled=false;}}
};
const showViewWithServerHistory=showView;
showView=function(view){showViewWithServerHistory(view);if(view==='games')renderAccountMatchHistory();};
