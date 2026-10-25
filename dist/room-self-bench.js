'use strict';
// Native player-owned bench controls. RoomCore, not this client, checks the
// authenticated socket identity and the actual game/consent state.
(function(){
 const host=document.getElementById('subPanel');
 if(!host)return;
 const make=(tag,label,cls)=>{const e=document.createElement(tag);
  if(label!==undefined&&label!==null)e.textContent=String(label);
  if(cls)e.className=cls;return e;};
 const panel=make('section',null,'self-bench-panel');
 panel.setAttribute('aria-label','Your team bench and sit-out controls');
 const title=make('div',null,'self-bench-heading');
 title.append(make('strong','MY TEAM BENCH'),make('span','SELF-SERVICE · SERVER CONTROLLED'));
 const description=make('p','Choose a Red or Blue team bench without asking the host to move your spectator. Your bench assignment never puts you on the pitch; the real captain/host must request a substitution and you must accept it.');
 const state=make('p','Waiting for the native room roster.','self-bench-state');
 state.setAttribute('role','status');state.setAttribute('aria-live','polite');
 const buttons=make('div',null,'self-bench-actions');
 const askPause=make('button','Ask host to pause'),hostPause=make('button','Pause current game'),
  red=make('button','Join Red bench'),blue=make('button','Join Blue bench'),
  spec=make('button','Be neutral spectator'),sit=make('button','Sit out → my team bench'),
  readyButton=make('button','I am available to substitute');
 for(const button of [red,blue,spec,sit,readyButton,askPause]){button.type='button';buttons.append(button);}
 const feedback=make('p',null,'self-bench-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const rules=make('small','Sitting out is only allowed when the game has not started or the actual host has paused it. Pending substitutions cannot be bypassed. Your available flag only signals interest: the captain/host must still ask and you must individually consent. These controls are unavailable in human Quick Match.');
 const requestBanner=make('div',null,'self-bench-pause-banner');
 requestBanner.hidden=true;
 const requestText=make('p');
 requestBanner.append(requestText,hostPause);
 // The 30-second server-issued request remains visible from Home/My Games.
 // Both controls require the host's explicit click and reuse the same native
 // pause handler; neither grants new permission or changes server policy.
 const prompt=make('aside',null,'self-bench-pause-prompt');
 prompt.hidden=true;prompt.setAttribute('aria-label','Host pause request');
 const promptText=make('p','A player requested a pause for a team substitution.');
 promptText.setAttribute('role','status');
 const promptActions=make('div',null,'self-bench-pause-prompt-actions');
 const promptView=make('button','↗ View in room');
 const promptPause=make('button','Ⅱ Pause game now','primary');
 for(const button of [promptView,promptPause])button.type='button';
 promptActions.append(promptView,promptPause);
 prompt.append(promptText,promptActions);
 document.body.append(prompt);
 panel.append(title,description,state,buttons,requestBanner,feedback,rules);
 host.prepend(panel);
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const teamOf=p=>typeof p?.team==='number'?p.team:p?.team?.id;
 let pending=null,previousRoom=null,previousLink=null,latest='',nextPauseAsk=0;
 let pauseAwaiting=null,hostPauseAwaiting=null;
 const socketOpen=link=>link?.ws?.readyState===1;
 function native(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||link.quickMatchMode||!link.roomState||!validId(networkPlayerId)||
   !Array.isArray(room?.state?.players)||room.state.players.length>128)return null;
  const p=room.state.players.find(x=>x?.id===networkPlayerId);
  if(!p||![0,1,2].includes(teamOf(p))||
   (typeof botIds!=='undefined'&&botIds?.has?.(networkPlayerId)))return null;
  const side=teamOf(p),data=link.roomState;
  const assigned=new Map(Array.isArray(data.benches)?data.benches:[]).get(networkPlayerId);
  const chosen=[1,2].includes(assigned)?assigned:0;
  const ready=Array.isArray(data.benchReadyIds)&&data.benchReadyIds.includes(networkPlayerId);
  const disconnected=Array.isArray(data.disconnectedIds)&&data.disconnectedIds.includes(networkPlayerId);
  const requested=data.pauseRequest&&typeof data.pauseRequest==='object'&&
   Number.isSafeInteger(data.pauseRequest.by)&&[1,2].includes(data.pauseRequest.team)&&
   Number.isSafeInteger(data.pauseRequest.expiresAt)&&data.pauseRequest.expiresAt>Date.now()?
   data.pauseRequest:null;
  const involved=Array.isArray(data.pendingSubs)&&data.pendingSubs.some(x=>
   x&&(x.inId===networkPlayerId||x.outId===networkPlayerId||x.requestedBy===networkPlayerId));
  return{link,side,chosen,ready:ready&&chosen!==0,disconnected,involved,requested,
   online:socketOpen(link),
   started:typeof started!=='undefined'&&started===true,
   paused:typeof paused!=='undefined'&&paused===true};
 }
 function reset(){
  pending=null;previousRoom=null;previousLink=null;pauseAwaiting=null;hostPauseAwaiting=null;
  nextPauseAsk=0;latest='';panel.hidden=true;requestBanner.hidden=true;prompt.hidden=true;feedback.textContent='';
 }
 function render(){
  const data=native();
  if(!data){if(!panel.hidden)reset();return;}
  panel.hidden=false;
  if(previousRoom!==data.link.room||previousLink!==data.link){
   pending=null;pauseAwaiting=null;hostPauseAwaiting=null;nextPauseAsk=0;
   previousRoom=data.link.room;previousLink=data.link;feedback.textContent='';
  }
  const role=data.side===1?'Playing for Red':data.side===2?'Playing for Blue':
   data.chosen===1?'Waiting on Red bench':data.chosen===2?'Waiting on Blue bench':
   'Neutral spectator';
  const allowed=data.online&&!data.disconnected&&!data.involved;
  if(hostPauseAwaiting){
   if(data.link!==hostPauseAwaiting.link||data.link.roomState?.paused===true){
    if(data.link===hostPauseAwaiting.link&&data.link.roomState?.paused===true)
     feedback.textContent='Room server confirmed the pause. Bench rotation can now proceed.';
    hostPauseAwaiting=null;
   }else if(Date.now()-hostPauseAwaiting.at>6500){
    feedback.textContent='The room has not confirmed this pause. Check the original room controls before retrying.';
    hostPauseAwaiting=null;
   }
  }
  if(pauseAwaiting){
   if(data.requested?.by===networkPlayerId){
    nextPauseAsk=Date.now()+45000;
    feedback.textContent='Native room confirmed your pause request. Only the host can pause.';
    pauseAwaiting=null;
   }else if(!data.online||Date.now()-pauseAwaiting.at>=6500){
    feedback.textContent=data.online?
     'No server receipt for the pause request. Check room status before trying again.':
     'The connection closed before the pause request was confirmed. Reconnect first.';
    pauseAwaiting=null;
   }
  }
  state.textContent=role+
   (data.started?(data.paused?' · match paused':' · match in progress'):' · lobby / break')+
   (data.side===0&&data.chosen!==0?(data.ready?' · AVAILABLE FOR SUB':' · NOT MARKED AVAILABLE'):'')+
   (data.involved?' · active substitution request':'')+
   (data.disconnected?' · reconnecting':'')+
   (!data.online?' · room connection not open':'');
  red.hidden=blue.hidden=spec.hidden=data.side!==0;
  sit.hidden=data.side===0;
  askPause.hidden=!(data.side>0&&data.started&&!data.paused&&!data.link.isOwner);
  askPause.disabled=!data.online||data.disconnected||!!data.requested||
   !!pauseAwaiting||Date.now()<nextPauseAsk;
  requestBanner.hidden=!(data.link.isOwner&&data.requested&&data.started&&!data.paused);
  // A menu over the hidden pitch is not a visible response to the host.
  const pitchVisible=document.getElementById('matchView')?.hidden===false;
  const nativeRequestVisible=pitchVisible&&
   document.getElementById('pauseMenu')?.hidden===false;
  const urgent=!!document.querySelector(
   '.quick-ready-dock:not([hidden]),.native-rematch-dock:not([hidden]),.native-room-recovery:not([hidden])');
  prompt.hidden=requestBanner.hidden||nativeRequestVisible||urgent;
  promptPause.disabled=!data.online||!data.link.isOwner||!data.requested||
   !data.started||data.paused||!!hostPauseAwaiting;
  if(!requestBanner.hidden){
   const nativePlayer=room?.state?.players?.find(x=>x.id===data.requested.by);
   const name=typeof nativePlayer?.name==='string'?nativePlayer.name.trim().slice(0,25):'An active player';
   const copy=name+' requested a real pause for bench rotation. You decide whether to pause.';
   requestText.textContent=copy;
   if(promptText.textContent!==copy)promptText.textContent=copy;
   hostPause.disabled=!data.online||!data.link.isOwner||!data.started||data.paused;
  }
  readyButton.hidden=data.side!==0||data.chosen===0;
  readyButton.disabled=!allowed||data.side!==0||data.chosen===0;
  readyButton.textContent=data.ready?'Set unavailable for substitutions':'I am available to substitute';
  readyButton.setAttribute('aria-pressed',String(data.ready));
  red.disabled=blue.disabled=spec.disabled=!(allowed&&data.side===0);
  red.disabled=red.disabled||data.chosen===1;
  blue.disabled=blue.disabled||data.chosen===2;
  spec.disabled=spec.disabled||data.chosen===0;
  sit.disabled=!allowed||data.side===0||data.started&&!data.paused;
  for(const [button,selected]of [[red,data.side===0&&data.chosen===1],
   [blue,data.side===0&&data.chosen===2],[spec,data.side===0&&data.chosen===0]]){
   button.setAttribute('aria-pressed',String(selected));
  }
  sit.title=data.started&&!data.paused?'Ask the host for a real pause before sitting out.':
   'Relinquish your own active position; remain on your current team bench.';
  const signature=JSON.stringify([data.link.room,data.side,data.chosen,data.involved,data.disconnected,
   data.started,data.paused,data.ready,data.requested]);
  if(pending&&pending.room===data.link.room){
   const confirmed=pending.type==='ready'?data.ready===pending.ready&&data.chosen>0:
    pending.type==='sit'?data.side===0&&data.chosen===pending.team:
    data.side===0&&data.chosen===pending.team;
   if(confirmed){
    feedback.textContent='Native room confirmed: '+(pending.type==='sit'?
     'you have sat out on your original team bench.':pending.type==='ready'?
     (data.ready?'you are marked available to be invited. Consent is still required.':'availability switched off.'):
     'your spectator bench choice is updated.');
    pending=null;
   }else if(Date.now()-pending.at>8000){
    feedback.textContent='The room did not confirm the requested change. Check your connection and the native room status.';
    pending=null;
   }
  }
  if(latest!==signature)latest=signature;
 }
 function dispatch(type,team){
  const data=native();
  if(!data||!data.online||data.disconnected||data.involved||pending){
   if(data&&!data.online)feedback.textContent=
    'Not connected to the native room. Reconnect before changing the bench.';
   return;
  }
  if(type==='bench'&&(data.side!==0||![0,1,2].includes(team)||data.chosen===team))return;
  if(type==='sit'&&(![1,2].includes(data.side)||data.started&&!data.paused))return;
  if(type==='ready'&&(data.side!==0||![1,2].includes(data.chosen)))return;
  if(type==='sit'&&
   !window.confirm('Leave your active '+(data.side===1?'Red':'Blue')+
    ' slot and sit on your team bench? The host must authorize a future substitution to bring you back.'))return;
  pending={room:data.link.room,type,team:type==='sit'?data.side:team,
   ready:type==='ready'?!data.ready:null,at:Date.now()};
  feedback.textContent='Sent your own bench request. Waiting for the native server to confirm.';
  try{data.link.send(type==='sit'?{type:'selfSitOut'}:
   type==='ready'?{type:'selfBenchReady',ready:!data.ready}:{type:'selfBench',team});}
  catch{pending=null;feedback.textContent='Could not send the request to the game server.';}
 }
 red.onclick=()=>dispatch('bench',1);
 blue.onclick=()=>dispatch('bench',2);
 spec.onclick=()=>dispatch('bench',0);
 askPause.onclick=()=>{
  const data=native();
  if(!data||!data.online||!data.started||data.paused||data.link.isOwner||data.side===0||
   data.disconnected||data.requested||pauseAwaiting||Date.now()<nextPauseAsk){
   if(data&&!data.online)feedback.textContent='Room connection unavailable; no pause request was sent.';
   return;
  }
  // Native send does nothing if the socket is closed. A sent request is
  // not a confirmed request; the room's pauseRequest.by is authoritative.
  pauseAwaiting={at:Date.now()};
  feedback.textContent='Pause request sent; awaiting confirmation from the native room.';
  try{data.link.send({type:'selfPauseRequest'});}
  catch{pauseAwaiting=null;feedback.textContent='Could not contact the room host.';}
 };
 function confirmHostPause(){
  const data=native(),nativeButton=document.getElementById('pauseButton');
  if(!data?.online||!data.link.isOwner||!data.requested||
     !data.started||data.paused||!!hostPauseAwaiting||
     !nativeButton||nativeButton.disabled)return;
  hostPauseAwaiting={link:data.link,at:Date.now()};
  // The existing authoritative room handler is still the only sender.
  nativeButton.click();
  feedback.textContent='Pause submitted using native host controls; awaiting the room server.';
  render();
 }
 hostPause.onclick=confirmHostPause;
 promptPause.onclick=confirmHostPause;
 promptView.onclick=()=>{
  const data=native();
  if(!data?.online||!data.link.isOwner||!data.requested||
     !data.started||data.paused)return;
  // Unlike the former prompt, navigate first: an offscreen native menu
  // must not pretend that the requested host action is visible to the user.
  document.getElementById('tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  const target=document.getElementById('subPanel');
  target?.scrollIntoView?.({block:'nearest',behavior:'auto'});
  if(!requestBanner.hidden)hostPause.focus?.({preventScroll:true});
  render();
 };
 sit.onclick=()=>dispatch('sit');
 readyButton.onclick=()=>dispatch('ready');
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 // Poll only the existing native room state; no extra network requests or
 // player rosters are persisted, and each click sends at most one message.
 setInterval(()=>{if(!document.hidden)render();},1100);
 render();
})();