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
 const prompt=make('button','Pause requested · Open room controls','self-bench-pause-prompt');
 prompt.type='button';prompt.hidden=true;prompt.setAttribute('aria-label','Open native room controls to review pause request');
 // The 30-second authoritative pause request stays visible on Home/My Games.
 // It only opens existing native room controls; it never pauses automatically.
 document.body.append(prompt);
 panel.append(title,description,state,buttons,requestBanner,feedback,rules);
 host.prepend(panel);
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const teamOf=p=>typeof p?.team==='number'?p.team:p?.team?.id;
 let pending=null,previousRoom=null,previousLink=null,latest='',nextPauseAsk=0;
 let pauseAwaiting=null;
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
 // The original team/bench controls live deep inside the match menu.
 // During a connected Custom Room lobby, players reading Home/My Games can
 // miss that they are a spectator and fail to mark themselves available for
 // a real host-authorized substitution. Surface the actual server roster and
 // forward deliberate clicks to the original controls, never a new protocol.
 const benchShortcuts=[];
 for(const [selector,titleText]of [['#homeView','YOUR TEAM IN THIS ROOM'],
                                    ['#gamesView','YOUR CURRENT ROOM TEAM']]){
  const view=document.querySelector(selector);
  if(!view)continue;
  const shortcut=make('aside',null,'self-bench-shortcut');
  shortcut.hidden=true;
  shortcut.setAttribute('aria-label','Native room team and bench');
  const heading=make('strong',titleText);
  const role=make('p','Waiting for your native team status.','self-bench-shortcut-role');
  role.setAttribute('role','status');
  role.setAttribute('aria-live','polite');
  const note=make('p','','self-bench-shortcut-note');
  const actions=make('div',null,'self-bench-shortcut-actions');
  const buttons=[];
  for(const [source,label]of [[red,'Red bench'],[blue,'Blue bench'],
      [spec,'Neutral spectator'],[readyButton,'Mark available']]){
   const button=make('button',label);button.type='button';
   button.addEventListener('click',()=>{
    const now=native();
    if(!now||!now.online||now.disconnected||source.hidden||source.disabled){
     note.textContent='Your native team status changed. Open the room menu to review it.';
     render();return;
    }
    source.click(); // source dispatch has server and permission checks
    note.textContent=feedback.textContent||
     'Waiting for the real room server to confirm this choice.';
    render();
   });
   actions.append(button);
   buttons.push({button,source});
  }
  const open=make('button','↗ Open team controls');
  open.type='button';open.className='self-bench-shortcut-open';
  open.addEventListener('click',()=>{
   if(!native())return;
   document.querySelector('#tabPlay')?.click();
   if(typeof openMatchMenu==='function')
    openMatchMenu('menuMatchPane','menuMatch');
   else document.querySelector('#matchMenuButton')?.click();
   panel.scrollIntoView?.({block:'nearest',behavior:'auto'});
   const first=[red,blue,spec,readyButton].find(b=>!b.hidden&&!b.disabled);
   (first||panel).focus?.({preventScroll:true});
  });
  actions.append(open);
  shortcut.append(heading,role,note,actions);
  const roomCard=selector==='#homeView'?
   view.querySelector('.play-hub-current-room'):null;
  if(roomCard)roomCard.insertAdjacentElement('afterend',shortcut);
  else view.prepend(shortcut);
  benchShortcuts.push({shortcut,role,note,buttons});
 }
 function renderBenchShortcuts(data){
  for(const item of benchShortcuts){
   item.shortcut.hidden=!data;
   if(!data){item.note.textContent='';continue;}
   const team=data.side===1?'RED · ON THE PITCH':
    data.side===2?'BLUE · ON THE PITCH':
    data.chosen===1?'RED · TEAM BENCH':
    data.chosen===2?'BLUE · TEAM BENCH':'NEUTRAL SPECTATOR';
   const phase=data.started?(data.paused?'MATCH PAUSED':'MATCH LIVE'):
    'ROOM LOBBY / BREAK';
   const line=team+' · '+phase+
    (!data.online?' · CONNECTION LOST':data.disconnected?' · RECONNECTING':
     data.side===0&&data.chosen!==0?
      (data.ready?' · AVAILABLE TO SUB':' · NOT AVAILABLE TO SUB'):'');
   if(item.role.textContent!==line)item.role.textContent=line;
   // Never promise a successful team change before authoritative receipt.
   const message=feedback.textContent;
   if(item.note.textContent!==message)item.note.textContent=message;
   for(const {button,source}of item.buttons){
    button.hidden=source.hidden;
    button.disabled=source.disabled||!data.online||data.disconnected;
    button.textContent=source===readyButton?source.textContent:
     button.textContent;
    button.setAttribute('aria-pressed',
     source.getAttribute('aria-pressed')||'false');
   }
  }
 }
 function reset(){
  pending=null;previousRoom=null;previousLink=null;pauseAwaiting=null;
  nextPauseAsk=0;latest='';panel.hidden=true;requestBanner.hidden=true;prompt.hidden=true;feedback.textContent='';
  renderBenchShortcuts(null);
 }
 function render(){
  const data=native();
  if(!data){if(!panel.hidden)reset();return;}
  panel.hidden=false;
  if(previousRoom!==data.link.room||previousLink!==data.link){
   pending=null;pauseAwaiting=null;nextPauseAsk=0;
   previousRoom=data.link.room;previousLink=data.link;feedback.textContent='';
  }
  const role=data.side===1?'Playing for Red':data.side===2?'Playing for Blue':
   data.chosen===1?'Waiting on Red bench':data.chosen===2?'Waiting on Blue bench':
   'Neutral spectator';
  const allowed=data.online&&!data.disconnected&&!data.involved;
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
  prompt.hidden=requestBanner.hidden||!!document.getElementById('pauseMenu')&&!document.getElementById('pauseMenu').hidden;
  if(!requestBanner.hidden){
   const nativePlayer=room?.state?.players?.find(x=>x.id===data.requested.by);
   const name=typeof nativePlayer?.name==='string'?nativePlayer.name.trim().slice(0,25):'An active player';
   requestText.textContent=name+' requested a real pause for bench rotation. You decide whether to pause.';
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
  renderBenchShortcuts(data);
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
 hostPause.onclick=()=>{
  const data=native();
  const nativeButton=document.getElementById('pauseButton');
  if(!data?.online||!data.link.isOwner||!data.started||data.paused||
   !data.requested||!nativeButton||nativeButton.disabled)return;
  nativeButton.click();feedback.textContent='Native pause requested by host. Wait for the room server to confirm.';
 };
 prompt.onclick=()=>{
  const data=native();
  if(!data?.online||!data.link.isOwner||!data.requested||!data.started||data.paused)return;
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  else document.getElementById('tabPlay')?.click();
  hostPause.focus({preventScroll:true});
 };
 sit.onclick=()=>dispatch('sit');
 readyButton.onclick=()=>dispatch('ready');
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 // Poll only the existing native room state; no extra network requests or
 // player rosters are persisted, and each click sends at most one message.
 setInterval(()=>{if(!document.hidden)render();},1100);
 render();
})();