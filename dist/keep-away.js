'use strict';
// Native Keep Away: measure only real local player-ball kick events on the
// approved sandbox engine. Consecutive touches are NOT claimed as possession,
// passes, official match outcomes or competitive ratings.
(function(){
 const home=document.getElementById('homeView'),pitch=document.getElementById('matchView');
 if(!home||!pitch||!document.getElementById('quickPractice'))return;
 const KEY='fuckball.native-keep-away.v1',DURATIONS=[60,120,180],TARGETS=[3,5,8],MAX=20;
 const el=(tag,text,className)=>{
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  if(className)node.className=className;
  return node;
 };
 const panel=el('section',null,'keep-away-setup');
 panel.setAttribute('aria-label','Keep Away native ball-control practice');
 const head=el('h2','KEEP AWAY.');
 const intro=el('p','Hold the ball under pressure against a real local AI opponent. Build a streak of actual native kicks before the AI kicks or either side scores. This is a ball-touch streak, not verified possession or a ranked statistic.');
 const fields=el('div',null,'keep-away-fields');
 const timeLabel=el('label','Active drill clock'),time=el('select');
 time.setAttribute('aria-label','Keep Away duration');
 for(const seconds of DURATIONS)time.add(new Option(seconds===60?'1 minute':seconds/60+' minutes',String(seconds)));
 time.value='120';timeLabel.append(time);
 const targetLabel=el('label','Kick streak target'),target=el('select');
 target.setAttribute('aria-label','Consecutive human native kicks target');
 for(const n of TARGETS)target.add(new Option(n+' consecutive kicks',String(n)));
 target.value='5';targetLabel.append(target);
 const launch=el('button','▶ START KEEP AWAY');launch.type='button';launch.className='primary';
 fields.append(timeLabel,targetLabel,launch);
 const message=el('p','Kick repeatedly without an AI kick or goal breaking your streak.','keep-away-message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const history=el('section',null,'keep-away-history');
 const rowhead=el('div',null,'keep-away-history-head');
 rowhead.append(el('h3','MY KEEP AWAY ATTEMPTS'));
 const exportButton=el('button','↓ Export private results'),clearButton=el('button','Clear local results');
 for(const b of [exportButton,clearButton])b.type='button';
 rowhead.append(exportButton,clearButton);
 const attempts=el('div',null,'keep-away-history-rows');
 history.append(rowhead,attempts);
 panel.append(head,intro,fields,message,history);
 // One deliberate Return action for a parked native local session, visible
 // from either Home or My Games. It never starts a new game or auto-unpauses.
 const returnPanel=el('aside',null,'keep-away-return');
 returnPanel.hidden=true;
 returnPanel.setAttribute('role','region');
 returnPanel.setAttribute('aria-label','Paused Keep Away session');
 const returnText=el('p');
 returnText.setAttribute('role','status');
 const returnButton=el('button','↗ Return to Keep Away');
 returnButton.type='button';
 returnPanel.append(returnText,returnButton);
 document.body.append(returnPanel);
 const anchor=home.querySelector('.comeback-arena')||home.querySelector('.ai-gauntlet-setup')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);

 const hud=el('aside',null,'keep-away-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Active Keep Away local drill');
 const badge=el('strong','KEEP AWAY · LOCAL AI');
 const clock=el('span',null,'keep-away-clock');
 const progress=el('p',null,'keep-away-progress');
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const bar=el('progress');bar.min=0;bar.max=100;bar.value=0;
 bar.setAttribute('aria-label','Best consecutive native kick streak against local AI');
 const controls=el('div',null,'keep-away-actions');
 const stop=el('button','Stop drill'),again=el('button','Play again'),dismiss=el('button','Dismiss');
 for(const b of [stop,again,dismiss])b.type='button';
 again.hidden=true;dismiss.hidden=true;controls.append(stop,again,dismiss);
 hud.append(badge,clock,progress,bar,controls);pitch.append(hud);

 let active=null,parked=false;
 function updateReturn(){
  returnPanel.hidden=!active||!parked||!pitch.hidden||document.hidden;
  if(returnPanel.hidden)return;
  const s=active;
  returnText.textContent='Keep Away is paused · '+s.best+' best consecutive kicks · '+
   Math.max(0,s.duration-Math.ceil(s.frames/60))+
   's of real active play left. Your original local match is preserved.';
 }
 returnButton.addEventListener('click',()=>{
  if(!active||!parked||!pitch.hidden||document.hidden)return;
  document.getElementById('tabPlay')?.click();
  // Leave the original match paused. Only the existing Pause/Resume
  // control can resume the simulation and the drill clock.
  updateReturn();
 });
 const read=()=>{
  try{
   const data=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(data)||data.length>MAX)return[];
   return data.filter(a=>a&&DURATIONS.includes(a.duration)&&TARGETS.includes(a.target)&&
    Number.isSafeInteger(a.at)&&a.at>0&&a.at<Date.now()+86400000&&
    Number.isSafeInteger(a.best)&&a.best>=0&&a.best<=999&&
    Number.isSafeInteger(a.kicks)&&a.kicks>=a.best&&a.kicks<=9999&&
    Number.isSafeInteger(a.breaks)&&a.breaks>=0&&a.breaks<=9999&&
    Number.isSafeInteger(a.elapsed)&&a.elapsed>=a.duration&&a.elapsed<=a.duration+1&&
    typeof a.completed==='boolean'&&a.completed===(a.best>=a.target));
  }catch{return[];}
 };
 function renderHistory(){
  const rows=read();attempts.replaceChildren();
  exportButton.disabled=clearButton.disabled=!rows.length;
  if(!rows.length){
   attempts.append(el('p','Complete a full local Keep Away clock to save your first result.'));
   return;
  }
  for(const a of rows.slice(0,8)){
   const item=el('article',null,'keep-away-history-row');
   const title=el('strong',(a.completed?'TARGET REACHED':'KEEP PRACTISING')+' · '+a.best+' / '+a.target+' kick streak');
   const detail=el('span',a.kicks+' genuine human kicks · '+a.breaks+' streak breaks · '+a.duration+'s · '+new Date(a.at).toLocaleDateString());
   item.append(title,detail);attempts.append(item);
  }
  attempts.append(el('p',rows.filter(a=>a.completed).length+' of '+rows.length+' recent local full-clock attempts reached their target.','keep-away-history-note'));
 }
 function save(s){
  const entry={at:Date.now(),duration:s.duration,target:s.target,
   best:s.best,kicks:s.kicks,breaks:s.breaks,elapsed:s.duration,completed:s.best>=s.target};
  try{localStorage.setItem(KEY,JSON.stringify([entry,...read()].slice(0,MAX)));}
  catch{message.textContent='Drill complete. Browser storage could not save this result.';}
  renderHistory();
 }
 exportButton.onclick=()=>{
  const rows=read();if(!rows.length)return;
  const payload={format:'fuckball-native-local-keep-away',version:1,
   source:'private-local-native-kick-events',exportedAt:new Date().toISOString(),
   disclaimer:'Kick streak only; not ball possession, successful passes, ranking, or a verified match result.',
   attempts:rows};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=el('a');a.href=url;a.download='fuckball-keep-away-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clearButton.onclick=()=>{
  if(!read().length||!confirm('Remove only the Keep Away practice history on this device? Other drills, replays and online matches are not affected.'))return;
  try{localStorage.removeItem(KEY);message.textContent='Keep Away history cleared on this device.';}
  catch{message.textContent='Could not access browser storage.';}
  renderHistory();
 };
 renderHistory();
 // Saved full-clock results are device-local and shared by every same-origin
 // tab. Refresh the real persisted rows rather than showing an old empty
 // list, exporting stale entries, or silently making the player restart.
 // An active in-memory drill never gains kicks/time from this storage event.
 function refreshPrivateHistory(external=false){
  renderHistory();
  if(external){
   const count=read().length;
   message.textContent=count?
    'Keep Away results refreshed from another browser tab · '+count+' saved attempt'+
    (count===1?'':'s')+'.':
    'Keep Away results changed in another browser tab. Your live drill is unchanged.';
  }
 }
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  refreshPrivateHistory(true);
 });
 // On browsers that pause background tabs, focus is a safe opportunity to
 // re-read the same private storage without touching the native game state.
 window.addEventListener('focus',()=>refreshPrivateHistory(false));
 const own=()=>room?.state?.players?.find?.(p=>p.id===1);
 // Only the real opposing bot, on the currently visible approved sandbox
 // pitch, can interrupt a player's kick streak. Unknown IDs and spectators
 // must not fabricate a lost streak.
 function opposingBotKick(s,d){
  if(!Number.isSafeInteger(d.playerId)||d.playerId===1||
     !botIds?.has?.(d.playerId)||![1,2].includes(d.team)||
     d.team===s.side)return false;
  const player=room?.state?.players?.find?.(p=>p.id===d.playerId);
  return !!player&&player.team?.id===d.team;
 }
 const ready=()=>!serverLink&&!peerConnected&&!replay&&started&&!pitch.hidden&&
  document.getElementById('mode')?.value==='bot'&&room?.gameState&&
  Number.isSafeInteger(room.currentFrameNo)&&own()?.disc&&[1,2].includes(own()?.team?.id)&&
  !botIds.has(1)&&room.state.players.some(p=>p.id!==1&&botIds.has(p.id)&&
   [1,2].includes(p.team?.id)&&p.team?.id!==own()?.team?.id);
 function denied(){
  if(serverLink||peerConnected)return 'Disconnect from your online room or direct peer before local practice.';
  if(document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])'))
   return 'Cancel or finish human Quick Match before local practice.';
  if(document.getElementById('joinScreen')?.hidden===false)return 'Close the pending room invitation first.';
  return '';
 }
 const nativeScore=()=>[room.gameState.redScore,room.gameState.blueScore];
 function paint(s){
  clock.textContent=Math.max(0,Math.ceil((s.duration*60-s.frames)/60))+'s left · '+s.streak+' current / '+s.target+' target';
  const reason=s.lastBreakReason&&room.currentFrameNo-s.lastBreakFrame<180?
   ' · Last break: '+s.lastBreakReason:'';
  progress.textContent=(parked||paused?'Paused · explicitly resume the original local match. ':'')+
   s.best+' best streak · '+s.kicks+' actual own kicks · '+s.breaks+' streak breaks'+reason;
  bar.value=Math.min(100,Math.round(s.best/s.target*100));
 }
 function finish(label,complete=false){
  const s=active;if(!s)return;active=null;parked=false;updateReturn();
  if(complete)save(s);
  badge.textContent=label;
  clock.textContent='Best '+s.best+' consecutive native kicks · '+s.kicks+' total';
  progress.textContent=complete?(s.best>=s.target?
   'Target achieved in a complete local challenge.':'Full clock completed; try to build a longer streak.'):
   'Interrupted or stopped; only full-clock local practice is stored.';
  stop.hidden=true;again.hidden=false;dismiss.hidden=false;
 }
 function close(){
  active=null;parked=false;updateReturn();
  hud.hidden=true;badge.textContent='KEEP AWAY · LOCAL AI';
  stop.hidden=false;again.hidden=true;dismiss.hidden=true;
 }
 window.addEventListener('fuckball:local-native-kick',event=>{
  const s=active,d=event.detail;
  if(!s||!d||document.hidden||!ready()||room!==s.room||d.room!==s.room||
   !Number.isSafeInteger(d.frame)||d.frame<s.frame||
   d.frame>room.currentFrameNo||paused||own()?.team?.id!==s.side)return;
  // The source event fires only for native physical kicks. Duplicate callbacks
  // by the same player in the same engine frame cannot inflate a streak.
  if(s.lastKickFrame===d.frame&&s.lastKickId===d.playerId)return;
  s.lastKickFrame=d.frame;s.lastKickId=d.playerId;
  if(d.playerId===1&&d.team===s.side){
   s.kicks=Math.min(9999,s.kicks+1);
   s.streak=Math.min(999,s.streak+1);
   s.best=Math.max(s.best,s.streak);
  }else if(s.streak&&opposingBotKick(s,d)){
   s.streak=0;s.breaks=Math.min(9999,s.breaks+1);
   s.lastBreakFrame=d.frame;s.lastBreakReason='Opposing AI kick';
  }
  paint(s);
 });
 function park(){
  const s=active;if(!s)return;
  // Do not keep advertising a paused old drill if a different offline game
  // or online session replaced its actual native room while off-screen.
  if(room!==s.room||serverLink||peerConnected||replay||!started||
     own()?.team?.id!==s.side||room.currentFrameNo<s.frame){
   finish('KEEP AWAY · GAME CHANGED');return;
  }
  // Neutralize the real offline match while it cannot be observed. Goal
  // Rush follows the same native pause path; never alter physics or frames.
  if(!serverLink&&!peerConnected&&!replay&&room===s.room&&started&&!paused)
   togglePause();
  if(room===s.room&&Number.isSafeInteger(room.currentFrameNo))
   s.frame=room.currentFrameNo;
  parked=true;paint(s);updateReturn();
 }
 function tick(){
  const s=active;if(!s)return;
  if(document.hidden||pitch.hidden){park();return;}
  if(!ready()||room!==s.room||own()?.team?.id!==s.side||
   room.currentFrameNo<s.frame){
   finish('KEEP AWAY · GAME CHANGED');return;
  }
  const frame=room.currentFrameNo;
  if(parked||paused){
   s.frame=frame;
   if(!paused)parked=false;
   paint(s);updateReturn();
   return;
  }
  s.frames+=Math.max(0,frame-s.frame);
  s.frame=frame;
  const current=nativeScore();
  if(current[0]<s.score[0]||current[1]<s.score[1]){
   finish('KEEP AWAY · MATCH RESTARTED');return;
  }
  if(current[0]!==s.score[0]||current[1]!==s.score[1]){
   if(s.streak){
    s.streak=0;s.breaks=Math.min(9999,s.breaks+1);
    s.lastBreakFrame=frame;s.lastBreakReason='Native match goal';
   }
   s.score=current;
  }
  paint(s);
  if(s.frames>=s.duration*60)finish('KEEP AWAY · TIME UP',true);
 }
 launch.onclick=()=>{
  const blocking=denied();if(blocking){message.textContent=blocking;return;}
  if((started||replay)&&!confirm('Start a fresh real offline Keep Away 1v1? Your current unsaved local match or replay will be replaced.')){
   message.textContent='Existing match preserved.';return;
  }
  const duration=Number(time.value),goal=Number(target.value);
  if(!DURATIONS.includes(duration)||!TARGETS.includes(goal))return;
  close();
  try{
   if(!quickPlay('bot',true,true)||!ready())throw Error('Native 1v1 local AI practice is unavailable.');
   active={room,side:own().team.id,duration,target:goal,frame:room.currentFrameNo,
    frames:0,score:nativeScore(),kicks:0,streak:0,best:0,breaks:0,
    lastKickFrame:-1,lastKickId:-1,lastBreakFrame:-1,lastBreakReason:''};
   parked=false;updateReturn();
   badge.textContent='KEEP AWAY · LOCAL AI';
   hud.hidden=false;stop.hidden=false;again.hidden=true;dismiss.hidden=true;
   message.textContent='Keep Away is live. Use real movement and kicks; no alternate simulation.';
   paint(active);
  }catch(error){close();message.textContent=error?.message||'Local practice unavailable.';}
 };
 stop.onclick=()=>finish('KEEP AWAY · STOPPED');
 again.onclick=()=>launch.click();
 dismiss.onclick=close;
 window.setInterval(tick,125);
 const previousShowView=showView;
 showView=function(next){
  if(next!=='play'&&active)park();
  previousShowView(next);
  updateReturn();
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&active)park();
  else updateReturn();
 });
 window.addEventListener('focus',updateReturn);
})();