'use strict';
// Native local-kick + genuine HaxBall physics ball speed training.
// Speed is in raw engine velocity units, never km/h, pass completion, Elo or
// authoritative shot-attribution. Does not modify physics, AI or input handling.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 if(!home||!match||!document.getElementById('quickPractice'))return;
 const KEY='fuckball.native-ball-burst-history.v1',MAX=20;
 const DUR=[60,120,180],TARGET=[3,5,7],KICKS=[1,3,5];
 const mk=(tag,value,klass)=>{const x=document.createElement(tag);if(value!==null&&value!==undefined)x.textContent=String(value);if(klass)x.className=klass;return x;};
 const panel=mk('section',null,'native-ball-burst');
 panel.setAttribute('aria-label','Local native ball-speed burst training');
 panel.append(mk('h2','ROCKET KICK CHALLENGE.'));
 panel.append(mk('p','Train forceful kicks against a genuine opposing native AI player. Only real human kick events and ball velocity from the existing physics engine count; changing the lineup discards the attempt. Values are RAW GAME SPEED UNITS, not km/h or proven shot quality.'));
 const controls=mk('div',null,'native-ball-burst-controls');
 function option(label,values,format,selected){
  const wrap=mk('label',label),select=mk('select');
  select.setAttribute('aria-label',label);
  for(const v of values)select.add(new Option(format(v),String(v)));
  select.value=String(selected);wrap.append(select);controls.append(wrap);return select;
 }
 const duration=option('Active drill clock',DUR,v=>v+' seconds',120);
 const threshold=option('Minimum observed burst',TARGET,v=>'Speed '+v+'+ game units',5);
 const needed=option('Qualifying own kicks',KICKS,v=>v+' kick'+(v===1?'':'s'),3);
 const launch=mk('button','▶ START ROCKET PRACTICE');launch.className='primary';launch.type='button';
 controls.append(launch);
 const message=mk('p','A kick counts only when the native engine records your kick and the ball reaches the chosen speed shortly afterwards. Other players’ kicks cancel that sample.','native-ball-burst-message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const resultHeader=mk('div',null,'native-ball-burst-result-header');
 resultHeader.append(mk('h3','MY REAL LOCAL BURSTS'));
 const exportBtn=mk('button','↓ Export'),eraseBtn=mk('button','Clear history');
 exportBtn.type=eraseBtn.type='button';resultHeader.append(exportBtn,eraseBtn);
 const history=mk('div',null,'native-ball-burst-history');
 panel.append(controls,message,resultHeader,history);
 const anchor=home.querySelector('.clean-sheet-setup')||home.querySelector('.teamwork-panel')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);
 const hud=mk('aside',null,'native-ball-burst-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Actual native ball speed challenge');
 const title=mk('strong','ROCKET KICK · LOCAL AI');
 const score=mk('span',null,'native-ball-burst-score');
 const detail=mk('p',null,'native-ball-burst-detail');detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
 const progress=mk('progress');progress.max=100;progress.value=0;progress.setAttribute('aria-label','Qualifying human kicks versus selected target');
 const hudButtons=mk('div',null,'native-ball-burst-buttons');
 const stop=mk('button','Stop drill'),retry=mk('button','Play again'),close=mk('button','Dismiss');
 for(const b of [stop,retry,close])b.type='button';
 retry.hidden=close.hidden=true;hudButtons.append(stop,retry,close);
 hud.append(title,score,detail,progress,hudButtons);match.append(hud);
 let active=null;
 function valid(row){
  return row&&Number.isSafeInteger(row.at)&&row.at>0&&row.at<=Date.now()+86400000&&
   DUR.includes(row.duration)&&TARGET.includes(row.threshold)&&KICKS.includes(row.target)&&
   Number.isSafeInteger(row.hits)&&row.hits>=0&&row.hits<=999&&
   Number.isSafeInteger(row.kicks)&&row.kicks>=row.hits&&row.kicks<=9999&&
   Number.isSafeInteger(row.elapsed)&&row.elapsed>=0&&row.elapsed<=row.duration+1&&
   Number.isFinite(row.peak)&&row.peak>=0&&row.peak<=1000&&
   typeof row.completed==='boolean'&&row.completed===(row.hits>=row.target);
 }
 function read(){
  try{
   const rows=JSON.parse(localStorage.getItem(KEY)||'[]');
   return Array.isArray(rows)&&rows.length<=MAX?rows.filter(valid):[];
  }catch{return[];}
 }
 function drawHistory(){
  const rows=read();history.replaceChildren();exportBtn.disabled=eraseBtn.disabled=!rows.length;
  if(!rows.length){history.append(mk('p','Finish a real local Rocket Kick challenge to build your private history.'));return;}
  for(const row of rows.slice(0,7)){
   const item=mk('article',null,'native-ball-burst-row');
   item.append(mk('strong',(row.completed?'TARGET REACHED':'TIME UP')+' · '+row.hits+' / '+row.target+' qualifying kicks'),
    mk('span',row.kicks+' native human kicks · peak '+row.peak.toFixed(1)+' engine units · '+row.elapsed+'s played · '+new Date(row.at).toLocaleDateString()));
   history.append(item);
  }
  const best=Math.max(...rows.map(x=>x.peak));
  history.append(mk('p','Private personal best observed post-kick ball speed: '+best.toFixed(1)+' raw native engine units. Not km/h or official shooting power.','native-ball-burst-best'));
 }
 function persist(s){
  const row={at:Date.now(),duration:s.duration,threshold:s.threshold,
   target:s.target,hits:s.hits,kicks:s.kicks,peak:Math.round(s.peak*10)/10,
   elapsed:Math.min(s.duration,Math.ceil(s.frames/60)),completed:s.hits>=s.target};
  try{localStorage.setItem(KEY,JSON.stringify([row,...read()].slice(0,MAX)));}
  catch{message.textContent='Your drill finished, but local history could not be saved.';}
  drawHistory();
 }
 exportBtn.onclick=()=>{
  const attempts=read();if(!attempts.length)return;
  const payload={format:'fuckball-local-native-ball-speed',version:1,
   source:'browser-private-native-human-kicks-and-physics',
   notice:'RAW GAME ENGINE ball-speed observations only. Not actual km/h, officially verified shots, saves or rankings.',
   exportedAt:new Date().toISOString(),attempts};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=mk('a');link.href=url;
  link.download='fuckball-native-ball-bursts-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 eraseBtn.onclick=()=>{
  if(!read().length||!confirm('Permanently clear your private Rocket Kick drill results on this device? Online scores, other drills and original replays stay untouched.'))return;
  try{localStorage.removeItem(KEY);message.textContent='Only Rocket Kick practice history was cleared.';}
  catch{message.textContent='Unable to clear private practice history.';}
  drawHistory();
 };
 drawHistory();
 const ownTeam=()=>room?.state?.players?.find?.(p=>p.id===1)?.team?.id;
 const ready=()=>{
  if(serverLink||peerConnected||replay||!room||!started||match.hidden||!room.gameState)return false;
  const own=room.state?.players?.find?.(p=>p.id===1);
  if(document.getElementById('mode')?.value!=='bot'||!own?.disc||
     ![1,2].includes(own.team?.id)||botIds.has(1))return false;
  // A bot ID alone is insufficient: a friendly bot, absent opponent or
  // disabled native AI must not yield an apparently verified kick result.
  const players=room.state?.players;
  if(!Array.isArray(players))return false;
  const field=players.filter(p=>[1,2].includes(p?.team?.id));
  if(field.length!==2)return false;
  const opponent=field.find(p=>p.id!==1);
  return !!opponent?.disc&&opponent.team.id===(own.team.id===1?2:1)&&
   botIds.has(opponent.id)&&opponent.aiControlled===true;
 };
 const denied=()=>{
  if(serverLink||peerConnected)return 'Leave your online room or direct-peer connection before starting local practice.';
  if(document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])'))
   return 'Cancel the current human queue or ready check first.';
  if(document.getElementById('joinScreen')?.hidden===false)return 'Close the pending sign-in or room invitation first.';
  return '';
 };
 const velocity=()=>{
  const b=room?.state?.gameState?.physicsState?.discs?.[0]?.speed;
  if(!b||!Number.isFinite(b.x)||!Number.isFinite(b.y))return null;
  const n=Math.hypot(b.x,b.y);return Number.isFinite(n)&&n>=0&&n<=1000?n:null;
 };
 function paint(s){
  const left=Math.max(0,Math.ceil((s.duration*60-s.frames)/60));
  score.textContent=s.hits+' / '+s.target+' qualifying kicks · '+left+'s left';
  detail.textContent=s.kicks+' actual human kicks · peak '+s.peak.toFixed(1)+' engine speed units'+
   (s.pending?' · measuring last own kick…':s.lastMeasured===null?'':
    ' · last measured '+s.lastMeasured.toFixed(1)+(s.lastQualified?' · reached speed goal':' · under speed goal'));
  progress.value=Math.min(100,Math.round(s.hits/s.target*100));
 }
 function finish(label,saveAttempt=false){
  const s=active;if(!s)return;
  // The last measured kick and its saved history must belong to a genuine
  // uninterrupted one-human-versus-one-opposing-AI native match.
  if(saveAttempt&&(!ready()||room!==s.room||ownTeam()!==s.side)){
   label='ROCKET KICK · OPPONENT CHANGED';
   saveAttempt=false;
  }
  // Do not count an unfinished/overridden native kick measurement.
  active=null;
  if(saveAttempt)persist(s);
  title.textContent=label;score.textContent=s.hits+' / '+s.target+' verified native kick bursts';
  detail.textContent=saveAttempt?
   'Peak '+s.peak.toFixed(1)+' raw engine ball-speed units · '+Math.ceil(s.frames/60)+'s active offline play. Not an official match statistic.':
   'Interrupted or stopped. No attempt was saved.';
  stop.hidden=true;retry.hidden=false;close.hidden=false;
 }
 function quit(){
  active=null;hud.hidden=true;title.textContent='ROCKET KICK · LOCAL AI';
  stop.hidden=false;retry.hidden=true;close.hidden=true;
 }
 function finalizeKick(s){
  if(!s.pending)return;
  if(s.pending.samples>0){s.lastMeasured=s.pending.peak;s.lastQualified=s.pending.peak>=s.threshold;}
  if(s.pending.samples>0&&s.pending.peak>=s.threshold){
   s.hits++;
   if(s.hits>=s.target){s.pending=null;finish('ROCKET KICK · TARGET MET',true);return;}
  }
  s.pending=null;
 }
 window.addEventListener('fuckball:local-native-kick',event=>{
  const s=active,info=event.detail;
  if(!s||!info||info.room!==s.room||document.hidden||!ready()||ownTeam()!==s.side||
   !Number.isSafeInteger(info.frame)||info.frame<s.frame)return;
  // A different native kicker ends attribution before we could credit a burst.
  if(info.playerId!==1||info.team!==s.side){s.pending=null;return;}
  if(s.pending)finalizeKick(s);
  if(!active)return;
  s.kicks=Math.min(9999,s.kicks+1);
  s.pending={start:info.frame,peak:0,samples:0};
 });
 function tick(){
  const s=active;if(!s)return;
  if(document.hidden){finish('ROCKET KICK · TAB HIDDEN');return;}
  if(!ready()||room!==s.room||ownTeam()!==s.side||
   !Number.isSafeInteger(room.currentFrameNo)||room.currentFrameNo<s.frame){
   finish('ROCKET KICK · MATCH / OPPONENT CHANGED');return;
  }
  const frame=room.currentFrameNo;
  if(!paused){
   s.frames+=Math.max(0,frame-s.frame);
   const pending=s.pending;
   if(pending&&frame>pending.start&&frame<=pending.start+9){
    const n=velocity();
    if(n!==null){pending.samples++;pending.peak=Math.max(pending.peak,n);s.peak=Math.max(s.peak,n);}
   }
   if(pending&&frame>pending.start+9)finalizeKick(s);
  }
  s.frame=frame;if(!active)return;
  if(s.frames>=s.duration*60){finalizeKick(s);if(active)finish('ROCKET KICK · TIME UP',true);return;}
  paint(s);
 }
 launch.onclick=()=>{
  const problem=denied();if(problem){message.textContent=problem;return;}
  if((started||replay)&&!confirm('Start a fresh Rocket Kick local AI match? Your current unsaved local game or replay will be replaced.')){
   message.textContent='Current local game kept. Rocket Kick not started.';return;
  }
  const time=Number(duration.value),speed=Number(threshold.value),goal=Number(needed.value);
  if(!DUR.includes(time)||!TARGET.includes(speed)||!KICKS.includes(goal))return;
  quit();
  try{
   if(!quickPlay('bot',true,true))throw Error('Original local 1v1 refused a new practice game.');
   if(!ready())throw Error('Native 1v1 with local AI is not available.');
   active={room,side:ownTeam(),duration:time,threshold:speed,target:goal,
    frame:room.currentFrameNo,frames:0,hits:0,kicks:0,peak:0,pending:null,
    lastMeasured:null,lastQualified:false};
   hud.hidden=false;title.textContent='ROCKET KICK · LOCAL AI';
   stop.hidden=false;retry.hidden=true;close.hidden=true;
   message.textContent='Rocket Kick running from genuine local native physics.';
   paint(active);
  }catch(error){quit();message.textContent=error?.message||'Practice mode unavailable.';}
 };
 stop.onclick=()=>finish('ROCKET KICK · STOPPED');
 retry.onclick=()=>launch.click();
 close.onclick=quit;
 window.setInterval(tick,110);
 const previousShowView=showView;
 showView=function(next){if(next!=='play'&&active)finish('ROCKET KICK · LEFT PITCH');previousShowView(next);};
})();
