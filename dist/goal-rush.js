'use strict';
// Optional, purely local arcade objective over the existing approved solo game.
// Never changes engine physics, AI policies, server outcomes or ranked ratings.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 if(!home||!match||!document.getElementById('quickPractice'))return;
 const STORAGE='fuckball-local-goal-rush-v1';
 const ATTEMPTS='fuckball-local-goal-rush-history-v1';
 const card=document.createElement('section');card.className='goal-rush-setup';
 card.setAttribute('aria-label','Local goal rush practice');
 const title=document.createElement('h2');title.textContent='GOAL RUSH.';
 const explanation=document.createElement('p');
 explanation.textContent='A timed, offline scoring challenge inside the real 1v1-vs-AI match. The score/time caps are disabled for this drill only, so five real goals are possible; your normal match defaults remain unchanged. No rankings, rewards or changed physics.';
 const fields=document.createElement('div');fields.className='goal-rush-fields';
 const durationLabel=document.createElement('label');durationLabel.textContent='Drill length';
 const duration=document.createElement('select');duration.setAttribute('aria-label','Goal Rush drill duration');
 for(const [value,label] of [['60','60 seconds'],['120','2 minutes'],['180','3 minutes']])duration.add(new Option(label,value));
 durationLabel.append(duration);
 const targetLabel=document.createElement('label');targetLabel.textContent='Target';
 const target=document.createElement('select');target.setAttribute('aria-label','Goal Rush target goals');
 for(const [value,label] of [['1','1 goal'],['3','3 goals'],['5','5 goals']])target.add(new Option(label,value));
 target.value='3';targetLabel.append(target);
 const launch=document.createElement('button');launch.type='button';launch.className='primary';
 launch.textContent='▶ START GOAL RUSH';
 fields.append(durationLabel,targetLabel,launch);
 const history=document.createElement('p');history.className='goal-rush-history';
 history.setAttribute('role','status');history.setAttribute('aria-live','polite');
 const journey=document.createElement('section');journey.className='goal-rush-journey';
 const journeyTitle=document.createElement('h3');journeyTitle.textContent='YOUR RECENT DRILLS';
 const journeyNote=document.createElement('p');
 journeyNote.textContent='Only completed local practice attempts are recorded here. These are not verified match statistics or rankings.';
 const journeyRows=document.createElement('div');journeyRows.className='goal-rush-journey-rows';
 const journeyActions=document.createElement('div');journeyActions.className='goal-rush-journey-actions';
 const exportJourney=document.createElement('button');exportJourney.type='button';
 exportJourney.textContent='↓ Export my progress';
 const clearJourney=document.createElement('button');clearJourney.type='button';
 clearJourney.textContent='Clear attempt history';
 journeyActions.append(exportJourney,clearJourney);
 journey.append(journeyTitle,journeyNote,journeyRows,journeyActions);
 const pausedDrill=document.createElement('aside');
 pausedDrill.className='goal-rush-return';pausedDrill.hidden=true;
 pausedDrill.setAttribute('role','region');
 pausedDrill.setAttribute('aria-label','Paused Goal Rush practice');
 const pausedDrillText=document.createElement('p');
 pausedDrillText.setAttribute('role','status');
 const returnToDrill=document.createElement('button');
 returnToDrill.type='button';returnToDrill.textContent='↗ Return to paused Goal Rush';
 pausedDrill.append(pausedDrillText,returnToDrill);
 card.append(title,explanation,fields,history,pausedDrill,journey);
 const quickPanel=home.querySelector('.quick-queue-panel');
 if(quickPanel)quickPanel.insertAdjacentElement('afterend',card);
 else home.append(card);
 const hud=document.createElement('aside');hud.className='goal-rush-hud';hud.hidden=true;
 hud.setAttribute('aria-label','Local practice challenge');
 const status=document.createElement('strong');status.textContent='GOAL RUSH · LOCAL';
 const clock=document.createElement('span');clock.className='goal-rush-clock';
 const progress=document.createElement('p');progress.className='goal-rush-progress';
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const stop=document.createElement('button');stop.type='button';stop.textContent='Stop drill';
 const restart=document.createElement('button');restart.type='button';restart.textContent='Play again';
 restart.hidden=true;
 const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Dismiss';
 dismiss.hidden=true;
 hud.append(status,clock,progress,stop,restart,dismiss);
 match.append(hud);
 let session=null,parked=false;
 function updateReturn(){
  pausedDrill.hidden=!session||!parked||document.hidden||!match.hidden;
  if(!pausedDrill.hidden){
   pausedDrillText.textContent='Your '+session.duration+'s drill is paused at '+session.goals+
    ' / '+session.target+' goals with '+Math.max(0,session.duration-Math.ceil(session.frames/60))+
    's of active play left. The original local match is still here.';
  }
 }
 returnToDrill.onclick=()=>{
  if(!session||!parked||!match.hidden||document.hidden)return;
  document.getElementById('tabPlay')?.click();
  updateReturn();
  // Never resume automatically. Existing local-focus controls own that action.
 };
 function readBest(){
  try{
   const parsed=JSON.parse(localStorage.getItem(STORAGE)||'{}');
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return{};
   return Object.fromEntries(Object.entries(parsed).filter(([k,v])=>
    /^(60|120|180)$/.test(k)&&Number.isSafeInteger(v)&&v>=0&&v<=999));
  }catch{return{};}
 }
 function readAttempts(){
  try{
   const value=JSON.parse(localStorage.getItem(ATTEMPTS)||'[]');
   if(!Array.isArray(value)||value.length>20)return[];
   return value.filter(a=>a&&[60,120,180].includes(a.duration)&&
    [1,3,5].includes(a.target)&&Number.isSafeInteger(a.goals)&&a.goals>=0&&a.goals<=999&&
    Number.isSafeInteger(a.elapsed)&&a.elapsed>=0&&a.elapsed<=180&&
    Number.isSafeInteger(a.at)&&a.at>0&&a.at<=Date.now()+86400000&&
    typeof a.completed==='boolean');
  }catch{return[];}
 }
 function renderAttempts(){
  const all=readAttempts();
  journeyRows.replaceChildren();
  exportJourney.disabled=clearJourney.disabled=!all.length;
  if(!all.length){
   const empty=document.createElement('p');empty.textContent='Finish a Goal Rush drill to build your local progress history.';
   journeyRows.append(empty);return;
  }
  for(const a of all.slice(0,6)){
   const row=document.createElement('article');row.className='goal-rush-journey-row';
   const label=document.createElement('strong');
   label.textContent=a.goals+' / '+a.target+' goals · '+(a.completed?'TARGET MET':'TIME UP');
   const sub=document.createElement('span');sub.textContent=a.duration+'s drill · '+a.elapsed+'s played · '+new Date(a.at).toLocaleDateString();
   const track=document.createElement('div');track.className='goal-rush-attempt-meter';
   const fill=document.createElement('span');
   fill.style.width=Math.min(100,Math.round(a.goals/a.target*100))+'%';
   track.append(fill);row.append(label,sub,track);journeyRows.append(row);
  }
 }
 function saveAttempt(s){
  const attempt={duration:s.duration,target:s.target,goals:s.goals,
   elapsed:Math.min(180,Math.max(0,Math.ceil(s.frames/60))),
   completed:s.goals>=s.target,at:Date.now()};
  const entries=[attempt,...readAttempts()].slice(0,20);
  try{localStorage.setItem(ATTEMPTS,JSON.stringify(entries));}catch{}
  renderAttempts();
 }
 exportJourney.onclick=()=>{
  const attempts=readAttempts();if(!attempts.length)return;
  const output={format:'fuckball-local-goal-rush',version:1,
   source:'unverified-local-practice',exportedAt:new Date().toISOString(),attempts};
  const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download='fuckball-goal-rush-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clearJourney.onclick=()=>{
  if(!confirm('Clear all Goal Rush attempt history from this device? Personal bests will remain.'))return;
  try{localStorage.removeItem(ATTEMPTS);}catch{}
  renderAttempts();
 };
 renderAttempts();
 function updateBest(){
  const best=readBest(),time=duration.value;
  history.textContent=Number.isSafeInteger(best[time])?
   'Personal best for '+time+'s: '+best[time]+' goal(s) · stored only in this browser.':
   'No personal best saved for '+time+'s yet. Records stay on this device.';
 }
 duration.onchange=updateBest;
 updateBest();
 const localReady=()=>!serverLink&&!peerConnected&&!replay&&
  !!room&&typeof room.currentFrameNo==='number'&&
  !!room.gameState&&Number.isSafeInteger(room.gameState.redScore)&&
  Number.isSafeInteger(room.gameState.blueScore);
 function ownSide(){
  const player=room?.state?.players?.find?.(p=>p.id===1);
  const team=player?.team?.id;
  return [1,2].includes(team)?team:null;
 }
 function saveRecord(seconds,goals){
  if(![60,120,180].includes(seconds)||!Number.isSafeInteger(goals)||goals<0||goals>999)return;
  const best=readBest();
  if(best[seconds]===undefined||goals>best[seconds]){
   best[seconds]=goals;
   try{localStorage.setItem(STORAGE,JSON.stringify(best));}catch{}
  }
  updateBest();
 }
 function updateHUD(s){
  const remain=Math.max(0,Math.ceil((s.duration*60-s.frames)/60));
  clock.textContent=remain+'s left · '+s.goals+' / '+s.target+' goals';
  progress.textContent=paused||parked?
   'Paused · return to the pitch and explicitly resume the original local match. No drill time is lost.':
   s.goalSide===1?'Playing RED vs AI · no ranked result':'Playing BLUE vs AI · no ranked result';
 }
 function finish(message,save=true){
  const s=session;if(!s)return;
  session=null;parked=false;updateReturn();
  if(save){saveRecord(s.duration,s.goals);saveAttempt(s);}
  status.textContent=message;
  clock.textContent=s.goals+' goal(s) in '+Math.ceil(s.frames/60)+'s of active local play';
  progress.textContent=s.goals>=s.target?'Target achieved!': 'Target not reached. Continue practicing anytime.';
  stop.hidden=true;restart.hidden=false;dismiss.hidden=false;
 }
 function quit(){
  if(session){session=null;parked=false;updateReturn();status.textContent='GOAL RUSH · STOPPED';}
  hud.hidden=true;stop.hidden=false;restart.hidden=true;dismiss.hidden=true;
  updateBest();
 }
 function parkDrill(){
  const s=session;if(!s)return;
  if(localReady()&&started&&room===s.room&&!paused){
   // Pause the *existing* native local match. We do not reset the room,
   // advance simulation or send a pause to any online human session.
   togglePause();
  }
  if(localReady()&&room===s.room)s.frame=room.currentFrameNo;
  parked=true;updateHUD(s);updateReturn();
 }
 function tick(){
  const s=session;if(!s)return;
  if(document.hidden||match.hidden){parkDrill();return;}
  if(!localReady()||!started){finish('DRILL INTERRUPTED',false);return;}
  if(ownSide()!==s.goalSide||room!==s.room||room.currentFrameNo<s.frame){
   finish('TEAMS OR MATCH CHANGED',false);return;
  }
  const frame=room.currentFrameNo;
  // A background or paused interval never accrues challenge time. The first
  // real foreground frame is the new baseline and needs explicit local resume.
  if(parked||paused){
   s.frame=frame;
   if(!paused)parked=false;
   updateHUD(s);updateReturn();
   return;
  }
  s.frames+=Math.max(0,frame-s.frame);
  s.frame=frame;
  const score=s.goalSide===1?room.gameState.redScore:room.gameState.blueScore;
  const opposite=s.goalSide===1?room.gameState.blueScore:room.gameState.redScore;
  if(score<s.initialScore||opposite<s.opponentScore){finish('MATCH RESTARTED',false);return;}
  s.goals=Math.min(999,score-s.initialScore);
  updateHUD(s);
  if(s.goals>=s.target){finish('GOAL RUSH · COMPLETE');return;}
  if(s.frames>=s.duration*60){finish('GOAL RUSH · TIME UP');}
 }
 launch.onclick=()=>{
  if(serverLink||peerConnected){history.textContent='Leave or cancel your existing online room, connection or human queue before starting Goal Rush.';return;}
  if(document.querySelector('.quick-queue-actions button:not([hidden])')||
     document.querySelector('.quick-ready:not([hidden])')||
     document.getElementById('joinScreen')?.hidden===false){
   history.textContent='Finish or cancel the active human matchmaking or room invitation first.';return;
  }
  if((started||replay)&&!window.confirm('Start Goal Rush in a fresh local 1v1 match? Your current local game or replay will be replaced and unsaved progress may be lost.')){
   history.textContent='Current local game or replay kept. Goal Rush did not start.';return;
  }
  if(session)quit();
  try{
   if(!quickPlay('bot',true,true))throw Error('Original local 1v1 could not start without preserving your session.');
   if(!localReady()||!started)throw Error('Local 1v1 practice could not start.');
   const side=ownSide();
   if(!side)throw Error('Join Red or Blue to start a scoring drill.');
   const seconds=Number(duration.value),count=Number(target.value);
   if(![60,120,180].includes(seconds)||![1,3,5].includes(count))
    throw Error('Choose a supported drill.');
   const g=room.gameState;
   session={duration:seconds,target:count,frames:0,frame:room.currentFrameNo,
    initialScore:side===1?g.redScore:g.blueScore,opponentScore:side===1?g.blueScore:g.redScore,
    goals:0,goalSide:side,room};
   parked=false;updateReturn();
   status.textContent='GOAL RUSH · LOCAL';stop.hidden=false;restart.hidden=true;dismiss.hidden=true;
   hud.hidden=false;updateHUD(session);
  }catch(error){history.textContent=error.message||'Practice challenge unavailable.';
   session=null;parked=false;updateReturn();hud.hidden=true;}
 };
 stop.onclick=()=>{finish('DRILL STOPPED',false);};
 restart.onclick=()=>launch.click(); // Retain the completed HUD until launch consent is granted.
 dismiss.onclick=quit;
 window.setInterval(tick,150);
 const previousShowView=showView;
 showView=function(next){
  if(next!=='play'&&session)parkDrill();
  previousShowView(next);
  updateReturn();
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&session)parkDrill();
  else updateReturn();
 });
 window.addEventListener('focus',updateReturn);
})();
