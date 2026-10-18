'use strict';
// Optional, purely local arcade objective over the existing approved solo game.
// Never changes engine physics, AI policies, server outcomes or ranked ratings.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 if(!home||!match||!document.getElementById('quickPractice'))return;
 const STORAGE='fuckball-local-goal-rush-v1';
 const card=document.createElement('section');card.className='goal-rush-setup';
 card.setAttribute('aria-label','Local goal rush practice');
 const title=document.createElement('h2');title.textContent='GOAL RUSH.';
 const explanation=document.createElement('p');
 explanation.textContent='A timed, offline scoring challenge inside the real 1v1-vs-AI practice match. No rankings, virtual rewards or changed game physics.';
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
 card.append(title,explanation,fields,history);
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
 let session=null;
 function readBest(){
  try{
   const parsed=JSON.parse(localStorage.getItem(STORAGE)||'{}');
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return{};
   return Object.fromEntries(Object.entries(parsed).filter(([k,v])=>
    /^(60|120|180)$/.test(k)&&Number.isSafeInteger(v)&&v>=0&&v<=999));
  }catch{return{};}
 }
 function updateBest(){
  const best=readBest(),time=duration.value;
  history.textContent=Number.isSafeInteger(best[time])?
   'Personal best for '+time+'s: '+best[time]+' goal(s) · stored only in this browser.':
   'No personal best saved for '+time+'s yet. Records stay on this device.';
 }
 duration.onchange=updateBest;
 updateBest();
 const localReady=()=>!serverLink?.room&&!peerConnected&&!replay&&
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
  progress.textContent=s.goalSide===1?'Playing RED vs AI · no ranked result':'Playing BLUE vs AI · no ranked result';
 }
 function finish(message,save=true){
  const s=session;if(!s)return;
  session=null;
  if(save)saveRecord(s.duration,s.goals);
  status.textContent=message;
  clock.textContent=s.goals+' goal(s) in '+Math.ceil(s.frames/60)+'s of active local play';
  progress.textContent=s.goals>=s.target?'Target achieved!': 'Target not reached. Continue practicing anytime.';
  stop.hidden=true;restart.hidden=false;dismiss.hidden=false;
 }
 function quit(){
  if(session){session=null;status.textContent='GOAL RUSH · STOPPED';}
  hud.hidden=true;stop.hidden=false;restart.hidden=true;dismiss.hidden=true;
  updateBest();
 }
 function tick(){
  const s=session;if(!s)return;
  if(document.hidden){quit();history.textContent='Goal Rush stopped because the tab was hidden. Start a new challenge anytime.';return;}
  if(!localReady()||!started||$('matchView').hidden){finish('DRILL INTERRUPTED',false);return;}
  if(ownSide()!==s.goalSide||room!==s.room||room.currentFrameNo<s.frame){finish('TEAMS OR MATCH CHANGED',false);return;}
  const frame=room.currentFrameNo;
  if(!paused){
   s.frames+=Math.max(0,frame-s.frame);
  }
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
  if(session)quit();
  try{
   document.getElementById('quickPractice').click();
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
   status.textContent='GOAL RUSH · LOCAL';stop.hidden=false;restart.hidden=true;dismiss.hidden=true;
   hud.hidden=false;updateHUD(session);
  }catch(error){history.textContent=error.message||'Practice challenge unavailable.';session=null;hud.hidden=true;}
 };
 stop.onclick=()=>{finish('DRILL STOPPED',false);};
 restart.onclick=()=>{quit();launch.click();};
 dismiss.onclick=quit;
 window.setInterval(tick,150);
 const previousShowView=showView;
 showView=function(next){
  if(next!=='play'&&session)quit();
  previousShowView(next);
 };
})();
