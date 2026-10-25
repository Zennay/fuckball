'use strict';
// Human + AI TEAMWORK drill. Progress is earned only when the approved native
// HaxBall engine reports actual consecutive kicks by the human and a teammate.
// It is NOT a pass-completion stat or a ranked/online result.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 const squad=document.getElementById('quickSquad');
 if(!home||!match||!squad)return;
 const KEY='fuckball.teamwork-native-drill.v1',MAX=20;
 const panel=document.createElement('section');panel.className='teamwork-panel';
 panel.setAttribute('aria-label','Offline AI teamwork practice');
 const head=document.createElement('div');head.className='teamwork-panel-head';
 const heading=document.createElement('h2');heading.textContent='TEAMWORK TRAINING.';
 const intro=document.createElement('p');
 intro.textContent='Build a genuine streak of different teammates kicking consecutively, beginning with your own kick. Opponent touches, repeated kicks by one player and stoppages reset the current streak. Total links and your best streak are tracked separately. This is unranked practice from native kicks, not verified completed passes.';
 head.append(heading,intro);
 const fields=document.createElement('div');fields.className='teamwork-fields';
 const durationLabel=document.createElement('label');durationLabel.textContent='Active play time';
 const duration=document.createElement('select');duration.setAttribute('aria-label','Teamwork training duration');
 for(const sec of [120,180,300])duration.add(new Option(sec/60+' minutes',String(sec)));
 durationLabel.append(duration);
 const targetLabel=document.createElement('label');targetLabel.textContent='Consecutive link target';
 const target=document.createElement('select');target.setAttribute('aria-label','Target consecutive teammate kicks');
 for(const n of [2,4,6])target.add(new Option(n+' consecutive links',String(n)));
 target.value='4';targetLabel.append(target);
 const launch=document.createElement('button');launch.type='button';launch.className='primary';launch.textContent='▶ START TEAMWORK';
 fields.append(durationLabel,targetLabel,launch);
 const status=document.createElement('p');status.className='teamwork-home-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const records=document.createElement('div');records.className='teamwork-records';
 const recordHead=document.createElement('div');recordHead.className='teamwork-record-head';
 const recordTitle=document.createElement('strong');recordTitle.textContent='RECENT LOCAL SESSIONS';
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Export';
 const clearButton=document.createElement('button');clearButton.type='button';clearButton.textContent='Clear';
 recordHead.append(recordTitle,exportButton,clearButton);
 const recordRows=document.createElement('div');recordRows.className='teamwork-record-rows';
 records.append(recordHead,recordRows);panel.append(head,fields,status,records);
 const anchor=home.querySelector('.goal-rush-setup')||home.querySelector('.first-play-card')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);
 const hud=document.createElement('aside');hud.className='teamwork-hud';hud.hidden=true;
 hud.setAttribute('aria-label','Live local teamwork coaching');
 const badge=document.createElement('strong');badge.textContent='TEAMWORK · AI 4V4';
 const score=document.createElement('span');score.className='teamwork-score';
 score.setAttribute('aria-live','polite');
 const feedback=document.createElement('p');feedback.className='teamwork-feedback';
 const bar=document.createElement('div');bar.className='teamwork-progress';bar.setAttribute('role','progressbar');
 bar.setAttribute('aria-label','Consecutive teammate kick links');
 bar.setAttribute('aria-valuemin','0');
 const fill=document.createElement('span');bar.append(fill);
 const hudActions=document.createElement('div');hudActions.className='teamwork-hud-actions';
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop drill';
 const restart=document.createElement('button');restart.type='button';restart.textContent='Retry';restart.hidden=true;
 const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Close';dismiss.hidden=true;
 hudActions.append(stop,restart,dismiss);hud.append(badge,score,feedback,bar,hudActions);match.append(hud);
 let session=null;
 // A hidden app view is not permission to discard real, unranked practice.
 // Preserve the original room and native 60 Hz clock; never simulate frames.
 const parkedDock=document.createElement('aside');
 parkedDock.className='teamwork-parked-dock';parkedDock.hidden=true;
 parkedDock.setAttribute('aria-label','Paused Teamwork drill');
 const parkedText=document.createElement('p');
 parkedText.setAttribute('role','status');parkedText.setAttribute('aria-live','polite');
 const parkedActions=document.createElement('div');
 const returnToDrill=document.createElement('button');
 returnToDrill.type='button';returnToDrill.className='primary';
 returnToDrill.textContent='↗ Return to Teamwork';
 const endParked=document.createElement('button');
 endParked.type='button';endParked.textContent='End drill';
 parkedActions.append(returnToDrill,endParked);
 parkedDock.append(parkedText,parkedActions);document.body.append(parkedDock);
 function updateParkedDock(){
  const s=session;
  parkedDock.hidden=!s||!s.parked||!match.hidden||document.hidden;
  if(parkedDock.hidden)return;
  parkedText.textContent='TEAMWORK PAUSED · best '+s.bestStreak+' / '+s.target+
   ' consecutive native team links · '+
   Math.max(0,Math.ceil((s.duration*60-s.frames)/60))+
   's active time left. Return to the same pitch, then explicitly resume.';
 }
 returnToDrill.onclick=()=>{
  const s=session;
  if(!s||!s.parked||!match.hidden||document.hidden)return;
  if(!ownsOriginalDrill(s)){finish('TEAMWORK · MATCH CHANGED',false);return;}
  document.getElementById('tabPlay')?.click();
  updateParkedDock();
 };
 endParked.onclick=()=>finish('TEAMWORK · STOPPED',false);
 function read(){
  try{
   const list=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(list))return[];
   return list.slice(0,MAX).filter(x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<Date.now()+86400000&&
    [120,180,300].includes(x.seconds)&&[2,4,6].includes(x.target)&&
    Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&
    (x.bestStreak===undefined||Number.isSafeInteger(x.bestStreak)&&
     x.bestStreak>=0&&x.bestStreak<=x.links)&&
    Number.isSafeInteger(x.attempts)&&x.attempts>=0&&x.attempts<=9999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=300&&
    typeof x.completed==='boolean');
  }catch{return[];}
 }
 function refresh(){
  const list=read();recordRows.replaceChildren();
  exportButton.disabled=clearButton.disabled=!list.length;
  if(!list.length){
   const empty=document.createElement('p');empty.textContent='No saved teamwork drills on this device yet.';
   recordRows.append(empty);return;
  }
  for(const a of list.slice(0,5)){
   const row=document.createElement('div');row.className='teamwork-record-row';
   const left=document.createElement('b');left.textContent=Number.isSafeInteger(a.bestStreak)?
    'Best '+a.bestStreak+' / '+a.target+' consecutive links · '+
    (a.completed?'GOAL MET':'TIME UP'):
    a.links+' total links · LEGACY SESSION (streak not measured)';
   const right=document.createElement('span');
   right.textContent=a.attempts+' human kick(s) · '+a.elapsed+'s active · '+new Date(a.at).toLocaleDateString();
   row.append(left,right);recordRows.append(row);
  }
 }
 function save(s){
  const a={at:Date.now(),seconds:s.duration,target:s.target,links:s.links,
   bestStreak:s.bestStreak,attempts:s.attempts,
   elapsed:Math.min(300,Math.ceil(s.frames/60)),completed:s.bestStreak>=s.target};
  try{localStorage.setItem(KEY,JSON.stringify([a,...read()].slice(0,MAX)));}catch{status.textContent='Drill ended, but private history could not be saved.';}
  refresh();
 }
 exportButton.onclick=()=>{
  const list=read();if(!list.length)return;
  const pack={format:'fuckball-local-teamwork-drill',version:2,source:'browser-private-native-kicks-not-verified-passes',scoring:'best-consecutive-distinct-teammate-kicks-starting-with-human; legacy version 1 totals are not streaks',exportedAt:new Date().toISOString(),attempts:list};
  const url=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fuckball-teamwork-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clearButton.onclick=()=>{
  if(!read().length)return;
  if(!confirm('Delete all local teamwork drill history? Online results, Goal Rush and replays are unaffected.'))return;
  try{localStorage.removeItem(KEY);status.textContent='Local teamwork history deleted.';}
  catch{status.textContent='Browser storage is unavailable.';}
  refresh();
 };
 refresh();
 function localSide(){
  if(serverLink||peerConnected||typeof peer!=='undefined'&&peer||
     replay||!room||!started)return null;
  if(document.getElementById('mode')?.value!=='4v4'||!room.gameState)return null;
  const human=room.state?.players?.find?.(p=>p.id===1);
  const team=human?.team?.id;
  if(!human?.disc||![1,2].includes(team)||botIds.has(1))return null;
  if(!room.state.players.some(p=>p.id!==1&&p.team?.id===team&&botIds.has(p.id)))return null;
  return team;
 }
 function ready(){
  return paused||match.hidden||document.hidden?null:localSide();
 }
 function ownsOriginalDrill(s){
  return !!s&&room===s.room&&localSide()===s.side&&
   Number.isSafeInteger(room.currentFrameNo)&&room.currentFrameNo>=s.frame;
 }
 function parkDrill(){
  const s=session;if(!s)return;
  if(!ownsOriginalDrill(s)){finish('TEAMWORK · MATCH CHANGED',false);return;}
  if(!s.parked){
   // A resumed drill must earn a new real team sequence, not carry an old
   // possession through a hidden view / missed physics events.
   s.streak=0;s.lastKicker=null;s.lastKickKey=null;
   // Pause the genuine offline game via its existing input-safe control.
   // Never pause a native/peer match, and never automatically unpause.
   if(!paused)togglePause();
   s.parked=true;s.frame=room.currentFrameNo;
   status.textContent='Teamwork parked safely. Return to the original match and press Resume.';
  }
  feedback.textContent='Parked · current streak reset; best consecutive links retained. Resume the original pitch explicitly.';
  updateParkedDock();
 }
 function blocked(){
  if(serverLink||peerConnected||typeof peer!=='undefined'&&peer)
   return 'Leave or cancel the active online room or direct-peer connection before starting a local drill.';
  if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
   return 'Stop the current native room reconnect explicitly before starting a local drill.';
  if(document.querySelector('.quick-queue-actions button:not([hidden])'))return 'Cancel the human Quick Match search before local practice.';
  const readyCheck=document.querySelector('.quick-ready:not([hidden])');
  if(readyCheck)return 'Complete or decline the human matchmaking ready-check first.';
  if(document.getElementById('joinScreen')?.hidden===false)return 'Close the open room invitation before starting local practice.';
  return '';
 }
 function paint(){
  const s=session;if(!s)return;
  const remain=Math.max(0,Math.ceil((s.duration*60-s.frames)/60));
  score.textContent=s.streak+' / '+s.target+' consecutive · best '+s.bestStreak+
   ' · '+remain+'s left';
  feedback.textContent=s.lastKicker===1?'Good kick — have a different AI teammate kick next.':
   s.lastKicker!==null?'Team possession: each *different* teammate kick extends the streak.':
   'Kick to begin a new possession; opponent touches or repeated self-kicks reset the streak.';
  bar.setAttribute('aria-valuemax',String(s.target));
  bar.setAttribute('aria-valuenow',String(Math.min(s.streak,s.target)));
  fill.style.width=Math.min(100,s.streak/s.target*100)+'%';
 }
 function finish(message,saveAttempt=true){
  const s=session;if(!s)return;
  session=null;updateParkedDock();
  if(saveAttempt)save(s);
  badge.textContent=message;
  score.textContent='Best '+s.bestStreak+' consecutive · '+s.links+
   ' total links · '+s.attempts+' human kicks';
  feedback.textContent=saveAttempt?'Private offline practice only. A teammate follow-up is not proof of a completed pass.':
   'This attempt was interrupted and was not saved.';
  stop.hidden=true;restart.hidden=false;dismiss.hidden=false;
 }
 function quit(){
  session=null;updateParkedDock();
  hud.hidden=true;badge.textContent='TEAMWORK · AI 4V4';
  stop.hidden=false;restart.hidden=true;dismiss.hidden=true;
 }
 launch.onclick=()=>{
  const reason=blocked();if(reason){status.textContent=reason;return;}
  if((started||replay)&&!window.confirm('Start Teamwork with a fresh local 4v4 match? Your current local game or replay will be replaced and unsaved progress may be lost.')){
   status.textContent='Current local game or replay kept. Teamwork did not start.';return;
  }
  quit();
  if(!quickPlay('4v4',true,true)){
   status.textContent='Original local 4v4 did not start; your session was preserved.';return;
  } // Existing sandbox 4v4 setup, no alternate game engine.
  const side=ready();
  if(!side){status.textContent='4v4 local practice could not start. Use 4v4 Practice first.';return;}
  const seconds=Number(duration.value),goal=Number(target.value);
  if(![120,180,300].includes(seconds)||![2,4,6].includes(goal))return;
  session={room,side,duration:seconds,target:goal,frame:room.currentFrameNo,
   frames:0,links:0,streak:0,bestStreak:0,attempts:0,
   lastKicker:null,lastKickKey:null,
   redScore:room.gameState.redScore,blueScore:room.gameState.blueScore,parked:false};
  hud.hidden=false;status.textContent='Teamwork training running in local 4v4.';
  paint();
 };
 stop.onclick=()=>finish('TEAMWORK · STOPPED',false);
 restart.onclick=()=>launch.click(); // Retain the completed HUD until launch consent is granted.
 dismiss.onclick=quit;
 // Count an actual succession of different players on the same side,
 // anchored by a native human kick. Totals alone never satisfy the target.
 // No model prediction, ball-proximity guess or simulated input is credited.
 window.addEventListener('fuckball:local-native-kick',event=>{
  const s=session,d=event.detail;
  if(!s||!d||s.parked||d.room!==s.room||document.hidden||ready()!==s.side||
     !Number.isSafeInteger(d.frame)||d.frame<s.frame||
     !Number.isSafeInteger(d.playerId)||d.playerId<1||
     ![1,2].includes(d.team))return;
  const key=d.frame+':'+d.playerId;
  if(key===s.lastKickKey)return; // duplicate event != second native kick
  s.lastKickKey=key;
  if(d.team!==s.side){
   s.streak=0;s.lastKicker=null;paint();return;
  }
  if(d.playerId!==1&&!botIds.has(d.playerId)){
   s.streak=0;s.lastKicker=null;paint();return;
  }
  if(d.playerId===1)s.attempts++;
  if(s.lastKicker!==null&&s.lastKicker!==d.playerId){
   s.streak++;s.links++;s.bestStreak=Math.max(s.bestStreak,s.streak);
  }else if(s.lastKicker===d.playerId){
   // Two successive touches from the same person are not team links.
   s.streak=0;
  }
  // A bot cannot open the drill's possession: first kick must be the human.
  if(s.lastKicker!==null||d.playerId===1)s.lastKicker=d.playerId;
  paint();
  if(s.streak>=s.target)finish('TEAMWORK · STREAK ACHIEVED');
 });
 function tick(){
  const s=session;if(!s)return;
  if(!ownsOriginalDrill(s)){finish('TEAMWORK · MATCH CHANGED',false);return;}
  if(document.hidden||match.hidden){parkDrill();return;}
  const frame=room.currentFrameNo;
  const gs=room.gameState;
  if(gs&&(gs.redScore!==s.redScore||gs.blueScore!==s.blueScore)){
   s.redScore=gs.redScore;s.blueScore=gs.blueScore;
   s.streak=0;s.lastKicker=null;s.lastKickKey=null;
  }
  if(s.parked){
   // First foreground tick is a baseline only, even if native physics
   // advanced a frame immediately after the player's explicit Resume.
   s.frame=frame;
   if(!paused){s.parked=false;paint(s);updateParkedDock();}
   else feedback.textContent='Paused. Press the original Resume control to continue Teamwork.';
   return;
  }
  if(paused){
   s.frame=frame;s.streak=0;s.lastKicker=null;s.lastKickKey=null;
   feedback.textContent='Paused · current streak reset; best stays saved. Resume to build a new chain.';
   return;
  }
  s.frames+=Math.max(0,frame-s.frame);s.frame=frame;
  if(s.frames>=s.duration*60){finish('TEAMWORK · TIME UP');return;}
  paint();
 }
 const previousShowView=showView;
 showView=function(next){
  if(next!=='play'&&session)parkDrill();
  previousShowView(next);
  updateParkedDock();
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&session)parkDrill();
  else updateParkedDock();
 });
 window.addEventListener('blur',()=>{if(session)parkDrill();});
 window.addEventListener('focus',updateParkedDock);
 window.setInterval(tick,180);
})();
