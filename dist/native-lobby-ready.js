'use strict';
// Server-authoritative pre-kickoff presence. No local ready claims, match starts,
// or ranked/Quick Match participation are created by this panel.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const el=(tag,content,cls)=>{
  const node=document.createElement(tag);
  if(content!==undefined&&content!==null)node.textContent=String(content);
  if(cls)node.className=cls;
  return node;
 };
 const panel=el('section',null,'native-lobby-ready');
 panel.setAttribute('aria-label','Custom Room pre-match readiness');
 panel.hidden=true;
 const heading=el('div',null,'native-lobby-ready-header');
 heading.append(el('strong','KICKOFF READY CHECK.'),el('span','HUMANS · CUSTOM ROOM'));
 const intro=el('p','Confirm your own readiness before kickoff. The server tracks real active players; spectators and AI never count. This is advisory: only the host can start the actual match.');
 const progress=el('p',null,'native-lobby-ready-progress');
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const list=el('ul',null,'native-lobby-ready-roster');
 const controls=el('div',null,'native-lobby-ready-actions');
 const toggle=el('button','I AM READY');toggle.type='button';toggle.className='primary';
 toggle.setAttribute('aria-pressed','false');
 const refresh=el('button','Refresh room state');refresh.type='button';
 controls.append(toggle,refresh);
 const kickoffControls=el('div',null,'native-lobby-kickoff-controls');
 const lengthLabel=el('label','Host countdown');
 const length=el('select');length.setAttribute('aria-label','Host kickoff countdown duration');
 for(const n of [3,5,10])length.add(new Option(n+' seconds',String(n)));
 length.value='5';lengthLabel.append(length);
 const count=el('button','START READY COUNTDOWN');count.type='button';count.className='primary';
 const cancelCount=el('button','CANCEL COUNTDOWN');cancelCount.type='button';
 kickoffControls.append(lengthLabel,count,cancelCount);
 const kickoffStatus=el('p',null,'native-lobby-kickoff-status');
 kickoffStatus.setAttribute('role','status');kickoffStatus.setAttribute('aria-live','polite');
 const note=el('p',null,'native-lobby-ready-note');
 note.textContent='Each active human must opt in. Moving team, disconnecting or starting a new round clears readiness. Host kickoff still uses the original Start button.';
 panel.append(heading,intro,progress,list,controls,kickoffControls,kickoffStatus,note);
 const anchor=document.getElementById('subPanel');
 if(anchor?.parentElement===pane)anchor.insertAdjacentElement('beforebegin',panel);
 else pane.append(panel);
 const match=document.getElementById('matchView');
 const onPitch=el('aside',null,'native-lobby-kickoff-hud');
 onPitch.hidden=true;
 onPitch.setAttribute('aria-label','Server countdown to kickoff');
 onPitch.setAttribute('role','status');
 if(match)match.append(onPitch);
 // A Custom Room lobby can remain active while a player browses Home or
 // My Games. The original readiness controls live inside a hidden menu.
 // Mirror authoritative server readiness globally; never infer consent from
 // a click or start a match without the host's existing native control.
 const dock=el('aside',null,'native-lobby-ready-dock');
 dock.hidden=true;dock.setAttribute('role','region');
 dock.setAttribute('aria-label','Current Custom Room kickoff readiness');
 const dockContent=el('div',null,'native-lobby-ready-dock-content');
 const dockTitle=el('strong','CUSTOM ROOM · WAITING FOR KICKOFF');
 const dockProgress=el('p',null,'native-lobby-ready-dock-progress');
 dockProgress.setAttribute('role','status');dockProgress.setAttribute('aria-live','polite');
 dockContent.append(dockTitle,dockProgress);
 const dockActions=el('div',null,'native-lobby-ready-dock-actions');
 const dockToggle=el('button','✓ I AM READY');dockToggle.type='button';
 dockToggle.className='primary';
 const dockView=el('button','↗ View room');dockView.type='button';
 // Hosts can operate the same native kickoff controls when the match menu
 // is hidden; votes and the countdown remain server-authoritative.
 const dockHost=el('div',null,'native-lobby-ready-dock-host');
 const dockLengthLabel=el('label','Kickoff countdown');
 const dockLength=el('select');
 dockLength.setAttribute('aria-label','Kickoff countdown duration');
 for(const seconds of [3,5,10]){
  const option=el('option',seconds+' seconds');option.value=String(seconds);
  dockLength.append(option);
 }
 dockLength.value=length.value;
 dockLengthLabel.append(dockLength);
 const dockStart=el('button','Start countdown');
 dockStart.type='button';dockStart.className='primary';
 const dockCancel=el('button','Cancel countdown');
 dockCancel.type='button';
 const dockHostFeedback=el('span',null,'native-lobby-ready-dock-feedback');
 dockHostFeedback.setAttribute('role','status');
 dockHostFeedback.setAttribute('aria-live','polite');
 dockHost.append(dockLengthLabel,dockStart,dockCancel,dockHostFeedback);
 dockActions.append(dockToggle,dockView);
 dock.append(dockContent,dockActions,dockHost);
 document.body.append(dock);
 let lastSignature='';
 // On a newly admitted or reconnected room, room.state.players can still
 // contain the previous local game's players until the first binary snapshot.
 // A native welcome + textual room event is NOT a roster receipt. This gate
 // is scoped to the current socket because disconnect() resets net counters.
 function hasCurrentNativeRoster(link){
  const state=link?.roomState;
  if(!link?.room||!state||link.ws?.readyState!==1)return false;
  if(typeof state.room==='string'&&state.room!==link.room)return false;
  return typeof net!=='undefined'&&Number.isSafeInteger(net.receivedSequence)&&
   net.receivedSequence>0&&Number.isFinite(net.lastSnapshot)&&net.lastSnapshot>0;
 }
 function lobbySummary(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!state||state.started||state.lastResult)return null;
  const supported=Array.isArray(state.lobbyReadyIds)&&state.lobbyReadyIds.length<=128;
  const ready=supported?new Set(state.lobbyReadyIds.filter(Number.isSafeInteger)):new Set();
  const disconnected=new Set(Array.isArray(state.disconnectedIds)?state.disconnectedIds:[]);
  const rosterVerified=hasCurrentNativeRoster(link);
  const roster=rosterVerified&&typeof room!=='undefined'?room?.state?.players:[];
  const active=(Array.isArray(roster)?roster:[]).filter(p=>
   Number.isSafeInteger(p?.id)&&!botIds.has(p.id)&&
   !disconnected.has(p.id)&&[1,2].includes(p?.team?.id));
  const own=active.find(p=>p.id===networkPlayerId);
  const countdown=state.kickoff;
  const remaining=countdown&&Number.isSafeInteger(countdown.framesLeft)&&
   countdown.framesLeft>=0?Math.max(1,Math.ceil(countdown.framesLeft/60)):null;
  const red=active.some(p=>p.team.id===1),blue=active.some(p=>p.team.id===2);
  const allReady=active.length>=2&&red&&blue&&
   active.every(p=>ready.has(p.id));
  const canHost=link.isOwner===true&&Object.hasOwn(state,'kickoff')&&
   !state.lastResult&&supported;
  return{link,supported,rosterVerified,active,own,ready,remaining,
   canSchedule:rosterVerified&&canHost&&allReady&&!countdown,
   // Host cancellation of a server-issued countdown is always safe, even
   // before first visual roster snapshot; starting a new one never is.
   canCancel:canHost&&!!countdown,canHost,allReady};
 }
 function renderGlobalLobby(){
  const state=lobbySummary();
  // The authentic menu is visible only when its parent pitch is visible.
  const nativeVisible=!!match&&!match.hidden&&
   typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
  dock.hidden=!state||nativeVisible;
  if(dock.hidden)return;
  const confirmed=state.active.filter(p=>state.ready.has(p.id)).length;
  const ownReady=!!state.own&&state.ready.has(state.own.id);
  dockTitle.textContent=state.remaining!==null?
   'KICKOFF IN '+state.remaining+' · SERVER COUNTDOWN':
   'CUSTOM ROOM · KICKOFF READINESS';
  const text=!state.supported?
   'This server has not reported lobby readiness. View the room for the native Start control.':
   !state.rosterVerified?
   'Waiting for the first current-room server frame before showing players or sending readiness.':
   state.active.length===0?'No active human players on Red or Blue yet.':
   confirmed+' / '+state.active.length+' connected humans confirmed'+
    (state.own?(ownReady?' · you are server-confirmed ready.':
     ' · your readiness is needed.'):' · join a team to ready up.');
  if(dockProgress.textContent!==text)dockProgress.textContent=text;
  dockToggle.hidden=!state.supported||!state.rosterVerified||!state.own;
  dockToggle.disabled=state.remaining!==null;
  dockToggle.textContent=ownReady?'✓ READY · CHANGE TO NOT READY':'✓ I AM READY';
  dockHost.hidden=!state.canHost;
  dockLengthLabel.hidden=!!state.canCancel;
  dockStart.hidden=!!state.canCancel;
  dockStart.disabled=!state.canSchedule;
  dockLength.disabled=!state.canSchedule;
  dockCancel.hidden=!state.canCancel;
  if(state.canCancel){
   dockHostFeedback.textContent='Server countdown running · '+
    (state.remaining===null?'check the match for the current count':
     state.remaining+'s left')+'. Only the host can cancel.';
  }else if(state.canHost){
   dockHostFeedback.textContent=state.canSchedule?
    'Both teams and every connected human are ready. Host may begin.':
    'Waiting for ready humans on both teams. No countdown started.';
  }
 }
 dockToggle.addEventListener('click',()=>{
  const snap=lobbySummary();
  if(!snap?.supported||!snap.own||snap.remaining!==null)return;
  // Keep one source of consent. The original handler checks current team,
  // disconnected state and room authority immediately before sending.
  render();
  if(!toggle.disabled)toggle.click();
  renderGlobalLobby();
 });
 function invokeNativeKickoff(cancel){
  const snapshot=lobbySummary();
  if(!snapshot?.canHost||
     cancel&&!snapshot.canCancel||!cancel&&!snapshot.canSchedule)return;
  // Use the same server-authorized native handlers and verify their actual
  // disabled state at click time. Never start or cancel on behalf of users.
  if(!cancel)length.value=dockLength.value;
  render();
  const original=cancel?cancelCount:count;
  if(original.hidden||original.disabled)return;
  original.click();
  dockHostFeedback.textContent=cancel?
   'Cancellation requested · waiting for server state.':
   'Kickoff requested · waiting for server confirmation.';
 }
 dockStart.addEventListener('click',()=>invokeNativeKickoff(false));
 dockCancel.addEventListener('click',()=>invokeNativeKickoff(true));
 dockView.addEventListener('click',()=>{
  if(!lobbySummary())return;
  document.getElementById('tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  render();renderGlobalLobby();
  panel.scrollIntoView?.({behavior:'auto',block:'nearest'});
  const focus=!toggle.disabled?toggle:panel;
  focus.focus?.({preventScroll:true});
 });

 // Server-confirmed finished rounds need a way back to authentic results from
 // My Games. The pre-kickoff dock must never overlap a rematch or offer an
 // irrelevant readiness action after the server has recorded a result.
 const finishedDock=el('aside',null,'native-finished-round-dock');
 finishedDock.hidden=true;finishedDock.setAttribute('role','region');
 finishedDock.setAttribute('aria-label','Your finished Custom Room game');
 const finishedCopy=el('div',null,'native-finished-round-copy');
 const finishedTitle=el('strong','ROUND FINISHED');
 const finishedDetail=el('p',null,'native-finished-round-detail');
 finishedDetail.setAttribute('role','status');
 finishedDetail.setAttribute('aria-live','polite');
 finishedCopy.append(finishedTitle,finishedDetail);
 const finishedActions=el('div',null,'native-finished-round-actions');
 const finishedReview=el('button','↗ See result and teams');
 finishedReview.type='button';finishedReview.className='primary';
 const finishedRematch=el('button','↻ Request human rematch');
 finishedRematch.type='button';
 finishedActions.append(finishedReview,finishedRematch);
 finishedDock.append(finishedCopy,finishedActions);
 document.body.append(finishedDock);
 function finishedRound(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!state||state.started||
     !state.lastResult||state.rematch)return null;
  return{link,state,result:state.lastResult};
 }
 function renderFinishedRound(){
  const current=finishedRound();
  const nativeMenuVisible=!!match&&!match.hidden&&
   typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
  // Home has its own original Play Hub post-match card. Show this short
  // follow-up only when browsing other views, without overlay duplication.
  const onHome=document.getElementById('homeView')?.hidden===false;
  finishedDock.hidden=!current||nativeMenuVisible||onHome;
  if(finishedDock.hidden)return;
  const result=current.result;
  finishedTitle.textContent=Number.isSafeInteger(result.round)&&result.round>0?
   'ROUND '+result.round+' COMPLETE':'MATCH COMPLETE';
  const red=Number(result.red),blue=Number(result.blue);
  const scored=Number.isFinite(red)&&Number.isFinite(blue)&&red>=0&&blue>=0;
  const detail=scored?'RED '+red+' : '+blue+' BLUE':'The server confirmed the final result';
  const copy=detail+' · '+(current.link.isOwner?
   'You can request a new vote with the original room controls.':
   'Return to the room to review players and the next round.');
  if(finishedDetail.textContent!==copy)finishedDetail.textContent=copy;
  finishedRematch.hidden=!current.link.isOwner;
 }
 function openFinishedRoom(){
  if(!finishedRound())return;
  document.getElementById('tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  if(typeof renderNextMatchPanel==='function')renderNextMatchPanel();
  const original=document.getElementById('nextMatchPanel');
  original?.scrollIntoView?.({behavior:'auto',block:'nearest'});
  const action=['rematchRequest','nextGame'].map(id=>document.getElementById(id))
   .find(node=>node&&!node.hidden&&!node.disabled);
  (action||original)?.focus?.({preventScroll:true});
  renderFinishedRound();
 }
 finishedReview.addEventListener('click',openFinishedRoom);
 finishedRematch.addEventListener('click',()=>{
  const snapshot=finishedRound();
  if(!snapshot?.link.isOwner||finishedDock.hidden)return;
  // Native request owns every server permission, proposal ID, and readiness
  // gate. The dock cannot manufacture a vote or enter an online match.
  if(typeof renderNextMatchPanel==='function')renderNextMatchPanel();
  const original=document.getElementById('rematchRequest');
  if(!original||original.hidden||original.disabled)return;
  original.click();
  finishedDetail.textContent='Rematch requested · waiting for the room server.';
 });

 function renderCountdown(){
  const link=typeof serverLink!=='undefined'?serverLink:null,state=link?.roomState;
  const countdown=state?.kickoff;
  const live=!!(link?.room&&!link.quickMatchMode&&!state?.started&&
   countdown&&Number.isSafeInteger(countdown.framesLeft)&&countdown.framesLeft>=0&&
   [3,5,10].includes(countdown.seconds));
  onPitch.hidden=!live;
  if(live)onPitch.textContent='KICKOFF IN '+Math.max(1,Math.ceil(countdown.framesLeft/60))+' · SERVER COUNTDOWN';
 }
 function render(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const state=link?.roomState;
  renderCountdown();
  if(!link?.room||link.quickMatchMode||!state){
   panel.hidden=true;lastSignature='';return;
  }
  // A completed server round belongs to the native results/rematch workflow,
  // not the pre-kickoff readiness screen.
  panel.hidden=!!state.started||!!state.lastResult;
  if(panel.hidden)return;
  // A room event can arrive before its first authenticated native snapshot.
  // Do not display a roster from an older match or offer local ready/kickoff
  // controls until this exact socket has delivered current game-state frames.
  if(!hasCurrentNativeRoster(link)){
   lastSignature='';
   toggle.disabled=true;refresh.disabled=false;
   kickoffControls.hidden=true;
   list.replaceChildren(el('li','Waiting for current-room player snapshot…'));
   progress.textContent='Checking this room’s live players with the game server…';
   note.textContent='Your previous local roster is not used for new room readiness. The server will provide the current players.';
   return;
  }
  const available=Array.isArray(state.lobbyReadyIds)&&state.lobbyReadyIds.length<=128;
  if(!available){
   kickoffControls.hidden=true;kickoffStatus.textContent='';
   toggle.disabled=true;refresh.disabled=true;list.replaceChildren();
   progress.textContent='This room server does not expose player readiness yet.';
   note.textContent='Only server-authoritative ready status is accepted. Existing Start controls remain available.';
   return;
  }
  note.textContent='Every player opts in themselves. An advisory ready check never starts, pauses, ranks or edits a match.';
  const confirmed=new Set(state.lobbyReadyIds.filter(Number.isSafeInteger));
  const absent=new Set(Array.isArray(state.disconnectedIds)?state.disconnectedIds:[]);
  const native=typeof room!=='undefined'?room?.state?.players:[];
  const active=(Array.isArray(native)?native:[]).filter(p=>
   Number.isSafeInteger(p?.id)&&!botIds.has(p.id)&&!absent.has(p.id)&&
   [1,2].includes(p?.team?.id));
  const own=active.find(p=>p.id===networkPlayerId);
  const chosen=!!own&&confirmed.has(own.id);
  const ready=active.filter(p=>confirmed.has(p.id)).length;
  const signature=JSON.stringify([state.round,state.started,networkPlayerId,active.map(p=>[p.id,p.name,p.team?.id]),[...confirmed].sort((a,b)=>a-b)]);
  if(signature!==lastSignature){
   lastSignature=signature;list.replaceChildren();
   const order=[...active].sort((a,b)=>a.team.id-b.team.id||a.id-b.id);
   for(const p of order.slice(0,16)){
    const row=el('li',null,'native-lobby-ready-player');
    const name=el('span',(p.team.id===1?'RED · ':'BLUE · ')+(p.name||'Player '+p.id)+(p.id===networkPlayerId?' · YOU':''));
    const marker=el('span',confirmed.has(p.id)?'✓ READY':'○ WAITING');
    marker.className=confirmed.has(p.id)?'is-ready':'is-waiting';
    row.append(name,marker);list.append(row);
   }
   if(!active.length)list.append(el('li','Waiting for the real native player roster…'));
  }
  progress.textContent=active.length?
   ready+' / '+active.length+' connected active humans ready'+(ready===active.length?' · Team is ready for host kickoff':' · Awaiting players'):
   'No active connected humans to ready up yet.';
  toggle.disabled=!own;
  toggle.textContent=chosen?'CHANGE TO NOT READY':'I AM READY';
  toggle.setAttribute('aria-pressed',String(chosen));
  refresh.disabled=false;
  const supports=Object.hasOwn(state,'kickoff'),running=!!state.kickoff;
  const host=!!link.isOwner;
  const red=active.some(p=>p.team.id===1),blue=active.some(p=>p.team.id===2);
  const allReady=active.length>=2&&red&&blue&&ready===active.length;
  kickoffControls.hidden=!supports||!host||!!state.lastResult;
  length.disabled=!host||running;
  count.hidden=running;cancelCount.hidden=!running;
  count.disabled=!allReady||!host||running;
  cancelCount.disabled=!host||!running;
  kickoffStatus.textContent=!supports?
   'This room server does not support the optional kickoff countdown.':
   running?'Native kickoff starts in '+Math.max(1,Math.ceil(state.kickoff.framesLeft/60))+
    ' seconds. The host can cancel; roster changes cancel automatically.':
   state.lastResult?'A finished round must use the existing next-game/rematch flow.':
   allReady?'Teams confirmed. Host can optionally schedule a native countdown.':
   'Waiting for ready humans on both Red and Blue before a countdown.';
 }
 toggle.onclick=()=>{
  const link=serverLink,state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!Array.isArray(state?.lobbyReadyIds)||
     state.started||!hasCurrentNativeRoster(link))return;
  const myId=networkPlayerId;
  const own=room?.state?.players?.find?.(p=>p.id===myId);
  if(![1,2].includes(own?.team?.id)||botIds.has(myId)||
   state.disconnectedIds?.includes(myId))return;
  const current=state.lobbyReadyIds.includes(myId);
  link.send({type:'lobbyReady',ready:!current});
  progress.textContent='Sending your own readiness to the room server…';
 };
 count.onclick=()=>{
  const link=serverLink,state=link?.roomState,n=Number(length.value);
  if(!link?.room||!link.isOwner||link.quickMatchMode||state?.started||state?.lastResult||
   !hasCurrentNativeRoster(link)||!Object.hasOwn(state||{},'kickoff')||
   state.kickoff||![3,5,10].includes(n))return;
  link.send({type:'kickoffCountdown',seconds:n});
  kickoffStatus.textContent='Requesting a native server-controlled kickoff…';
 };
 cancelCount.onclick=()=>{
  const link=serverLink,state=link?.roomState;
  if(!link?.room||!link.isOwner||!state?.kickoff||link.quickMatchMode)return;
  link.send({type:'kickoffCountdown',cancel:true});
  kickoffStatus.textContent='Requesting countdown cancellation…';
 };
 refresh.onclick=render;
 const shown=()=>typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
 setInterval(()=>{
  if(shown())render();
  else{panel.hidden=true;renderCountdown();}
  renderGlobalLobby();
  renderFinishedRound();
 },750);
 render();renderGlobalLobby();renderFinishedRound();
})();
