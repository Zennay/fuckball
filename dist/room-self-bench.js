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
 const red=make('button','Join Red bench'),blue=make('button','Join Blue bench'),
  spec=make('button','Be neutral spectator'),sit=make('button','Sit out → my team bench'),
  readyButton=make('button','I am available to substitute');
 for(const button of [red,blue,spec,sit,readyButton]){button.type='button';buttons.append(button);}
 const feedback=make('p',null,'self-bench-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const rules=make('small','Sitting out is only allowed when the game has not started or the actual host has paused it. Pending substitutions cannot be bypassed. Your available flag only signals interest: the captain/host must still ask and you must individually consent. These controls are unavailable in human Quick Match.');
 panel.append(title,description,state,buttons,feedback,rules);
 host.prepend(panel);
 const validId=id=>Number.isSafeInteger(id)&&id>0;
 const teamOf=p=>typeof p?.team==='number'?p.team:p?.team?.id;
 let pending=null,previousRoom=null,latest='';
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
  const involved=Array.isArray(data.pendingSubs)&&data.pendingSubs.some(x=>
   x&&(x.inId===networkPlayerId||x.outId===networkPlayerId||x.requestedBy===networkPlayerId));
  return{link,side,chosen,ready:ready&&chosen!==0,disconnected,involved,
   started:typeof started!=='undefined'&&started===true,
   paused:typeof paused!=='undefined'&&paused===true};
 }
 function reset(){
  pending=null;previousRoom=null;latest='';
  panel.hidden=true;feedback.textContent='';
 }
 function render(){
  const data=native();
  if(!data){if(!panel.hidden)reset();return;}
  panel.hidden=false;
  if(previousRoom!==data.link.room){
   pending=null;previousRoom=data.link.room;feedback.textContent='';
  }
  const role=data.side===1?'Playing for Red':data.side===2?'Playing for Blue':
   data.chosen===1?'Waiting on Red bench':data.chosen===2?'Waiting on Blue bench':
   'Neutral spectator';
  const allowed=!data.disconnected&&!data.involved;
  state.textContent=role+
   (data.started?(data.paused?' · match paused':' · match in progress'):' · lobby / break')+
   (data.side===0&&data.chosen!==0?(data.ready?' · AVAILABLE FOR SUB':' · NOT MARKED AVAILABLE'):'')+
   (data.involved?' · active substitution request':'')+
   (data.disconnected?' · reconnecting':'');
  red.hidden=blue.hidden=spec.hidden=data.side!==0;
  sit.hidden=data.side===0;
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
   data.started,data.paused,data.ready]);
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
  const data=native();if(!data||data.disconnected||data.involved||pending)return;
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
 sit.onclick=()=>dispatch('sit');
 readyButton.onclick=()=>dispatch('ready');
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 // Poll only the existing native room state; no extra network requests or
 // player rosters are persisted, and each click sends at most one message.
 setInterval(()=>{if(!document.hidden)render();},1100);
 render();
})();