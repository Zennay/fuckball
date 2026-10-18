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
 intro.textContent='Practise link-up play with your 4v4 AI team: kick the ball, then get a teammate to kick it before an opponent does. Every link is detected from real engine kicks — not a claimed completed pass.';
 head.append(heading,intro);
 const fields=document.createElement('div');fields.className='teamwork-fields';
 const durationLabel=document.createElement('label');durationLabel.textContent='Active play time';
 const duration=document.createElement('select');duration.setAttribute('aria-label','Teamwork training duration');
 for(const sec of [120,180,300])duration.add(new Option(sec/60+' minutes',String(sec)));
 durationLabel.append(duration);
 const targetLabel=document.createElement('label');targetLabel.textContent='Link-up target';
 const target=document.createElement('select');target.setAttribute('aria-label','Target consecutive teammate kicks');
 for(const n of [2,4,6])target.add(new Option(n+' team links',String(n)));
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
 function read(){
  try{
   const list=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(list))return[];
   return list.slice(0,MAX).filter(x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<Date.now()+86400000&&
    [120,180,300].includes(x.seconds)&&[2,4,6].includes(x.target)&&
    Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&
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
   const left=document.createElement('b');left.textContent=a.links+' / '+a.target+' links · '+(a.completed?'GOAL MET':'TIME UP');
   const right=document.createElement('span');
   right.textContent=a.attempts+' human kick(s) · '+a.elapsed+'s active · '+new Date(a.at).toLocaleDateString();
   row.append(left,right);recordRows.append(row);
  }
 }
 function save(s){
  const a={at:Date.now(),seconds:s.duration,target:s.target,links:s.links,
   attempts:s.attempts,elapsed:Math.min(300,Math.ceil(s.frames/60)),completed:s.links>=s.target};
  try{localStorage.setItem(KEY,JSON.stringify([a,...read()].slice(0,MAX)));}catch{status.textContent='Drill ended, but private history could not be saved.';}
  refresh();
 }
 exportButton.onclick=()=>{
  const list=read();if(!list.length)return;
  const pack={format:'fuckball-local-teamwork-drill',version:1,source:'browser-private-native-kicks-not-verified-passes',exportedAt:new Date().toISOString(),attempts:list};
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
 function ready(){
  if(serverLink||peerConnected||replay||!room||!started||paused||match.hidden)return null;
  if(document.getElementById('mode')?.value!=='4v4'||!room.gameState)return null;
  const human=room.state?.players?.find?.(p=>p.id===1);
  const team=human?.team?.id;
  if(!human?.disc||![1,2].includes(team)||botIds.has(1))return null;
  if(!room.state.players.some(p=>p.id!==1&&p.team?.id===team&&botIds.has(p.id)))return null;
  return team;
 }
 function blocked(){
  if(serverLink||peerConnected)return 'Leave or cancel the active online room or connecting session before starting a local drill.';
  if(document.querySelector('.quick-queue-actions button:not([hidden])'))return 'Cancel the human Quick Match search before local practice.';
  const readyCheck=document.querySelector('.quick-ready:not([hidden])');
  if(readyCheck)return 'Complete or decline the human matchmaking ready-check first.';
  if(document.getElementById('joinScreen')?.hidden===false)return 'Close the open room invitation before starting local practice.';
  return '';
 }
 function paint(){
  const s=session;if(!s)return;
  const remain=Math.max(0,Math.ceil((s.duration*60-s.frames)/60));
  score.textContent=s.links+' / '+s.target+' links · '+remain+'s left';
  feedback.textContent=s.pending?'Good kick — now get an AI teammate to touch the ball before an opponent.':
   'Kick the ball, then keep it with your AI teammates. Native kicks only.';
  bar.setAttribute('aria-valuemax',String(s.target));
  bar.setAttribute('aria-valuenow',String(Math.min(s.links,s.target)));
  fill.style.width=Math.min(100,s.links/s.target*100)+'%';
 }
 function finish(message,saveAttempt=true){
  const s=session;if(!s)return;
  session=null;
  if(saveAttempt)save(s);
  badge.textContent=message;
  score.textContent=s.links+' real team link(s) · '+s.attempts+' human kicks';
  feedback.textContent=saveAttempt?'Private offline practice only. A teammate follow-up is not proof of a completed pass.':
   'This attempt was interrupted and was not saved.';
  stop.hidden=true;restart.hidden=false;dismiss.hidden=false;
 }
 function quit(){
  session=null;hud.hidden=true;badge.textContent='TEAMWORK · AI 4V4';
  stop.hidden=false;restart.hidden=true;dismiss.hidden=true;
 }
 launch.onclick=()=>{
  const reason=blocked();if(reason){status.textContent=reason;return;}
  if((started||replay)&&!window.confirm('Start Teamwork with a fresh local 4v4 match? Your current local game or replay will be replaced and unsaved progress may be lost.')){
   status.textContent='Current local game or replay kept. Teamwork did not start.';return;
  }
  quit();
  squad.click(); // Existing sandbox 4v4 setup; no new engine or modified rules.
  const side=ready();
  if(!side){status.textContent='4v4 local practice could not start. Use 4v4 Practice first.';return;}
  const seconds=Number(duration.value),goal=Number(target.value);
  if(![120,180,300].includes(seconds)||![2,4,6].includes(goal))return;
  session={room,side,duration:seconds,target:goal,frame:room.currentFrameNo,
   frames:0,links:0,attempts:0,pending:0};
  hud.hidden=false;status.textContent='Teamwork training running in local 4v4.';
  paint();
 };
 stop.onclick=()=>finish('TEAMWORK · STOPPED',false);
 restart.onclick=()=>launch.click(); // Retain the completed HUD until launch consent is granted.
 dismiss.onclick=quit;
 window.addEventListener('fuckball:local-native-kick',event=>{
  const s=session,d=event.detail;
  if(!s||!d||d.room!==s.room||document.hidden||ready()!==s.side||
    !Number.isSafeInteger(d.frame)||d.frame<s.frame)return;
  if(d.playerId===1&&d.team===s.side){
   s.attempts++;s.pending=d.frame+1;paint();return;
  }
  if(d.team===s.side&&botIds.has(d.playerId)){
   if(s.pending&&d.frame>=s.pending){s.links++;s.pending=0;paint();
    if(s.links>=s.target)finish('TEAMWORK · TARGET MET');}
   return;
  }
  // A kick by the opposition breaks a potential passing sequence.
  if(d.team!==s.side){s.pending=0;paint();}
 });
 function tick(){
  const s=session;if(!s)return;
  if(document.hidden){finish('TEAMWORK · TAB HIDDEN',false);return;}
  if(match.hidden){finish('TEAMWORK · LEFT PITCH',false);return;}
  if(paused){feedback.textContent='Paused. Resume the local match to continue your timed teamwork drill.';return;}
  if(ready()!==s.side||room!==s.room||room.currentFrameNo<s.frame){
   finish('TEAMWORK · MATCH CHANGED',false);return;
  }
  const frame=room.currentFrameNo;
  s.frames+=Math.max(0,frame-s.frame);s.frame=frame;
  if(s.frames>=s.duration*60){finish('TEAMWORK · TIME UP');return;}
  paint();
 }
 window.setInterval(tick,180);
})();
