'use strict';
// First-play coaching uses actual local HaxBall states/events, never a fake match.
// The guide observes the approved engine and cannot change physics or results.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 const practice=document.getElementById('quickPractice');
 if(!home||!match||!practice)return;
 const store='fuckball.first-play-guide.v1';
 const card=document.createElement('section');card.className='first-play-card';
 card.setAttribute('aria-label','First match guided practice');
 const kicker=document.createElement('span');kicker.className='first-play-kicker';
 kicker.textContent='NEW TO FUCKBALL?';
 const title=document.createElement('h2');title.textContent='FIRST TOUCH.';
 const description=document.createElement('p');
 description.textContent='Learn to move, kick the real ball and score against the local AI. Three live challenges, no account required. Your approved game physics stay unchanged.';
 const badge=document.createElement('p');badge.className='first-play-record';
 const start=document.createElement('button');start.type='button';start.className='primary';start.textContent='▶ START FIRST MATCH';
 const resume=document.createElement('button');resume.type='button';
 resume.className='first-play-return';resume.textContent='↗ Return to current match';
 resume.hidden=true;
 const result=document.createElement('p');result.className='first-play-home-status';
 result.setAttribute('role','status');result.setAttribute('aria-live','polite');
 card.append(kicker,title,description,badge,start,resume,result);
 const after=home.querySelector('.goal-rush-setup')||home.querySelector('.mode-cards');
 if(after)after.insertAdjacentElement('afterend',card);else home.append(card);
 const hud=document.createElement('aside');hud.className='first-play-hud';hud.hidden=true;
 hud.setAttribute('aria-label','First match coaching');
 const heading=document.createElement('strong');
 const step=document.createElement('span');step.className='first-play-step';
 const detail=document.createElement('p');detail.className='first-play-detail';
 detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
 const bar=document.createElement('div');bar.className='first-play-bar';
 bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','First match coaching progress');
 bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','3');
 const fill=document.createElement('span');bar.append(fill);
 const actions=document.createElement('div');actions.className='first-play-actions';
 const restart=document.createElement('button');restart.type='button';restart.textContent='Try again';
 const quit=document.createElement('button');quit.type='button';quit.textContent='Leave guide';
 const online=document.createElement('button');online.type='button';online.className='primary';online.textContent='Find real players';online.hidden=true;
 actions.append(restart,quit,online);hud.append(heading,step,detail,bar,actions);
 match.append(hud);
 const stages=[
  ['01 / 03 · MOVE','Move around the pitch using your movement keys. Reach 70 field units of real player movement.'],
  ['02 / 03 · KICK','Get close to the ball and kick it using your Kick control. This step counts a kick reported by the actual game engine.'],
  ['03 / 03 · SCORE','Score one goal for your own team against the AI. The scoreboard must register it.']
 ];
 let session=null;
 function localRoom(){
  if(serverLink||peerConnected||replay||!room||!room.gameState||!started||paused||match.hidden)return null;
  const player=room.state?.players?.find?.(p=>p.id===1);
  return player?.disc&&[1,2].includes(player.team?.id)?player:null;
 }
 function completedAt(){
  try{const x=JSON.parse(localStorage.getItem(store)||'null');
   return x?.version===1&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<=Date.now()+86400000?x.at:null;
  }catch{return null;}
 }
 function updateHome(){
  const at=completedAt();
  badge.textContent=at?'Completed on '+new Date(at).toLocaleDateString()+'. Replay this guide whenever you like.':'Local solo lesson · 3 real gameplay challenges · no ranked stats.';
 }
 updateHome();
 function progress(stage){
  const count=Math.min(3,Math.max(0,stage));
  bar.setAttribute('aria-valuenow',String(count));fill.style.width=count/3*100+'%';
 }
 function render(){
  const s=session;if(!s)return;
  progress(s.stage);
  if(s.stage===3){
   heading.textContent='FIRST TOUCH · COMPLETE';
   step.textContent='YOU DID IT!';
   detail.textContent='You moved, landed a real kick and scored in the approved local 1v1 game. Keep practising or explicitly choose to find human opponents.';
   online.hidden=false;return;
  }
  heading.textContent='FIRST TOUCH · LOCAL PRACTICE';
  step.textContent=stages[s.stage][0];
  detail.textContent=stages[s.stage][1]+(s.stage===0?' · '+Math.floor(s.moved)+'/70': '');
  online.hidden=true;
 }
 function finish(why){
  session=null;hud.hidden=true;result.textContent=why||'Guide ended. The local game can continue.';
 }
 function unavailable(){
  if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
   return 'Your original online room is reconnecting. Choose Stop reconnecting before starting a solo lesson.';
  if(typeof peer!=='undefined'&&peer)
   return 'Finish or cancel your pending direct-peer connection before starting a solo lesson.';
  // Share the original native safety gate with every other local game launcher,
  // rather than allowing the First Touch card to suggest a game can begin while
  // it will be rejected by quickPlay().
  if(typeof pendingSessionBlock==='function'){
   const reason=pendingSessionBlock();
   if(reason)return reason;
  }
  if(serverLink||peerConnected)return 'Leave or cancel your existing online room or connecting session before starting a solo tutorial.';
  const queue=document.querySelector('.quick-queue-actions button:not([hidden])');
  const ready=document.querySelector('.quick-ready:not([hidden])');
  if(queue||ready)return 'Cancel your human Quick Match search or ready-check before practising.';
  const join=document.getElementById('joinScreen');
  if(join&&!join.hidden)return 'Finish or close your room invitation before starting a local game.';
  return null;
 }
 function sessionPresent(){
  return !!(typeof roomRecovery!=='undefined'&&roomRecovery.context||
   typeof serverLink!=='undefined'&&serverLink||
   typeof peerConnected!=='undefined'&&peerConnected||
   typeof peer!=='undefined'&&peer||
   typeof started!=='undefined'&&started||
   typeof replay!=='undefined'&&replay||
   document.querySelector('.quick-ready:not([hidden]),.quick-queue-actions button:not([hidden])'));
 }
 function refreshSessionReturn(){
  const visible=sessionPresent();
  resume.hidden=!visible;
  resume.textContent=typeof roomRecovery!=='undefined'&&roomRecovery.context?
   '↗ View original room recovery':
   document.querySelector('.quick-ready:not([hidden]),.quick-queue-actions button:not([hidden])')?
   '↗ View human match confirmation':'↗ Return to existing game';
 }
 function returnToSession(){
  refreshSessionReturn();
  if(resume.hidden){result.textContent='There is no ongoing session to return to.';return;}
  const recovery=document.querySelector('.native-room-recovery:not([hidden])');
  if(recovery){
   recovery.focus?.({preventScroll:true});
   result.textContent='Original room recovery controls are shown; no other game was started.';
   return;
  }
  const searching=home.querySelector('.quick-ready:not([hidden]),.quick-queue-actions button:not([hidden])');
  const human=searching?home.querySelector('.quick-ready:not([hidden]),.quick-queue-panel:not([hidden])'):null;
  if(human){
   human.scrollIntoView?.({behavior:'auto',block:'center'});
   (human.querySelector('button:not([disabled]):not([hidden])')||human)
    .focus?.({preventScroll:true});
   result.textContent='Original human matchmaking controls are here; no second search was started.';
   return;
  }
  if(typeof showView==='function')showView('play');
  else document.getElementById('tabPlay')?.click();
  result.textContent='Returned to the existing game or connection. No new session was created.';
 }
 resume.addEventListener('click',returnToSession);
 function launch(){
  const blocked=unavailable();if(blocked){
   result.textContent=blocked;refreshSessionReturn();return;
  }
  if((started||replay)&&!window.confirm('Restart local practice for First Touch? Your current local game or replay will be replaced and unsaved progress may be lost.')){
   result.textContent='First Touch not started; your current local game or replay was kept.';return;
  }
  if(session)finish();
  if(!quickPlay('bot',true)){
   result.textContent='The original local practice did not start; your current session was kept.';return;
  } // Original Home game mode, after deliberate replacement consent.
  const player=localRoom();
  if(!player){result.textContent='Local practice did not start. Please try the Solo Practice button.';return;}
  session={room,stage:0,moved:0,lastPos:{x:player.disc.pos.x,y:player.disc.pos.y},
   frame:room.currentFrameNo,side:player.team.id,score:null};
  result.textContent='Guide running in the local pitch.';
  hud.hidden=false;render();refreshSessionReturn();
 }
 start.addEventListener('click',launch);
 document.getElementById('tabHome')?.addEventListener('click',refreshSessionReturn);
 window.addEventListener('focus',refreshSessionReturn);
 window.addEventListener('fuckball:native-session-state',refreshSessionReturn);
 setInterval(()=>{if(!home.hidden)refreshSessionReturn();},1800);
 refreshSessionReturn();
 restart.addEventListener('click',launch);
 quit.addEventListener('click',()=>finish('First Touch closed; your local match stays available.'));
 online.addEventListener('click',()=>{
  if(!session||session.stage!==3)return;
  finish('Lesson completed. Human matchmaking requires your explicit choice and sign-in.');
  if(typeof openHumanQuickMatch==='function')openHumanQuickMatch();
 });
 window.addEventListener('fuckball:local-kick',event=>{
  const s=session;
  if(!s||s.stage!==1||event.detail?.room!==s.room||event.detail?.playerId!==1)return;
  if(!localRoom()||s.frame>event.detail?.frame)return;
  s.stage=2;s.frame=room.currentFrameNo;
  const g=room.gameState;
  s.score=s.side===1?g.redScore:g.blueScore;
  render();
 });
 function tick(){
  const s=session;if(!s)return;
  if(document.hidden)return;
  if(match.hidden){finish('Lesson closed after leaving the pitch. Start again from Home.');return;}
  const p=localRoom();
  if(!p){ // A normal manual pause is not a failed lesson.
   if(paused&&!peerConnected&&!serverLink){detail.textContent='Match paused. Resume to continue the lesson.';return;}
   finish('The local match changed. Start a fresh guided practice from Home.');return;
  }
  if(s.room!==room||p.team.id!==s.side||room.currentFrameNo<s.frame){
   finish('Match restarted or teams changed. Start the lesson again.');return;
  }
  const frame=room.currentFrameNo;
  if(s.stage===0&&frame>s.frame){
   const current=p.disc.pos,dx=current.x-s.lastPos.x,dy=current.y-s.lastPos.y;
   const displacement=Math.hypot(dx,dy);
   if(Number.isFinite(displacement)&&displacement<75)s.moved+=displacement;
   s.lastPos={x:current.x,y:current.y};
   if(s.moved>=70){s.stage=1;render();}
   else detail.textContent=stages[0][1]+' · '+Math.floor(s.moved)+'/70';
  }
  if(s.stage===2){
   const score=s.side===1?room.gameState.redScore:room.gameState.blueScore;
   if(score<s.score){finish('Score was reset. Restart the guide to continue.');return;}
   if(score>s.score){
    s.stage=3;render();
    try{localStorage.setItem(store,JSON.stringify({version:1,at:Date.now()}));}catch{}
    updateHome();
   }
  }
  s.frame=frame;
 }
 window.setInterval(tick,180);
})();
