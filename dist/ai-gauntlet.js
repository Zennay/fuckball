'use strict';
// Genuine offline 1v1 AI ladder. Only native engine ticks/goals can complete a round.
// No physics, policy, network, match receipt or ranked state is changed.
(function(){
 const home=document.getElementById('homeView'),pitch=document.getElementById('matchView');
 if(!home||!pitch||!document.getElementById('quickPractice'))return;
 const KEY='fuckball.ai-gauntlet-run.v1',HISTORY='fuckball.ai-gauntlet-history.v1';
 const ROUTES={standard:['easy','normal','hard'],elite:['normal','hard','elite']};
 const DAY=86400000,MAX_HISTORY=12;
 const make=(tag,label,klass)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(label!=null)n.textContent=label;return n;};
 const validAt=n=>Number.isSafeInteger(n)&&n>0&&n<=Date.now()+DAY&&n>=Date.now()-30*DAY;
 const validRound=(r,level,duration)=>r&&r.level===level&&r.duration===duration&&
  Number.isSafeInteger(r.for)&&Number.isSafeInteger(r.against)&&r.for>=0&&r.for<=999&&
  r.against>=0&&r.against<=999&&r.for>r.against&&validAt(r.at);
 function parse(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}}
 function readRun(){
  const r=parse(KEY);
  if(!r||r.version!==1||!Object.hasOwn(ROUTES,r.route)||![60,120].includes(r.duration)||
   !validAt(r.startedAt)||!Number.isSafeInteger(r.retries)||r.retries<0||r.retries>999||
   !Array.isArray(r.wins)||r.wins.length>2)return null;
  if(!r.wins.every((w,i)=>validRound(w,ROUTES[r.route][i],r.duration)&&w.at>=r.startedAt))return null;
  return r;
 }
 function readHistory(){
  const rows=parse(HISTORY);
  if(!Array.isArray(rows))return[];
  return rows.slice(0,MAX_HISTORY).filter(r=>r&&r.version===1&&Object.hasOwn(ROUTES,r.route)&&
   [60,120].includes(r.duration)&&validAt(r.startedAt)&&validAt(r.finishedAt)&&
   r.finishedAt>=r.startedAt&&r.finishedAt-r.startedAt<=30*DAY&&
   Number.isSafeInteger(r.retries)&&r.retries>=0&&r.retries<=999&&
   Array.isArray(r.wins)&&r.wins.length===3&&
   r.wins.every((w,i)=>validRound(w,ROUTES[r.route][i],r.duration)&&w.at>=r.startedAt&&w.at<=r.finishedAt));
 }
 const persist=(k,obj)=>{try{localStorage.setItem(k,JSON.stringify(obj));return true;}catch{return false;}};
 const panel=make('section',null,'ai-gauntlet-setup');
 panel.setAttribute('aria-label','Native offline AI gauntlet');
 panel.append(make('h2','AI GAUNTLET.'),make('p','Beat three real 1v1 AI opponents in order. Easy → Normal → Hard, or Normal → Hard → Elite. Each round lasts the full native active clock; a draw or loss means replaying that stage. No Elo, bots in human queues or altered physics.'));
 const fields=make('div',null,'ai-gauntlet-fields');
 const routeLabel=make('label','Ladder');
 const route=make('select');route.setAttribute('aria-label','AI ladder');
 route.add(new Option('Standard · Easy → Normal → Hard','standard'));
 route.add(new Option('Elite · Normal → Hard → Elite','elite'));routeLabel.append(route);
 const durationLabel=make('label','Round length');
 const duration=make('select');duration.setAttribute('aria-label','Native round length');
 for(const s of [60,120])duration.add(new Option(s+' active seconds',String(s)));
 durationLabel.append(duration);
 const newRun=make('button','START NEW LADDER','primary');newRun.type='button';
 const launch=make('button','PLAY NEXT ROUND','primary');launch.type='button';
 const abandon=make('button','Reset ladder');abandon.type='button';
 fields.append(routeLabel,durationLabel,newRun,launch,abandon);
 const status=make('p','Choose a ladder to begin.','ai-gauntlet-status');status.setAttribute('role','status');
 const stages=make('ol',null,'ai-gauntlet-stages');
 const historyBox=make('section',null,'ai-gauntlet-history');
 const historyHead=make('div',null,'ai-gauntlet-history-head');
 const exportBtn=make('button','Export completed ladders');exportBtn.type='button';
 const clearBtn=make('button','Clear history');clearBtn.type='button';
 historyHead.append(make('h3','COMPLETED LOCAL LADDERS'),exportBtn,clearBtn);
 const results=make('div',null,'ai-gauntlet-results');
 historyBox.append(historyHead,results);panel.append(fields,status,stages,historyBox);
 const anchor=home.querySelector('.clean-sheet-setup')||home.querySelector('.native-ball-burst')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);
 const hud=make('aside',null,'ai-gauntlet-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Active local AI gauntlet');
 const title=make('strong','AI GAUNTLET · LOCAL 1v1');
 const clock=make('span','');
 const score=make('p','');score.setAttribute('role','status');
 const bar=make('progress');bar.max=100;bar.value=0;bar.setAttribute('aria-label','Native round completion');
 const hudButtons=make('div',null,'ai-gauntlet-actions');
 const stop=make('button','Stop stage');stop.type='button';
 const next=make('button','Next / retry');next.type='button';next.hidden=true;
 const dismiss=make('button','Close');dismiss.type='button';dismiss.hidden=true;
 hudButtons.append(stop,next,dismiss);hud.append(title,clock,score,bar,hudButtons);pitch.append(hud);
 let current=null,run=readRun();
 function paint(){
  run=readRun();stages.replaceChildren();
  route.disabled=duration.disabled=!!run;
  launch.disabled=!run||!!current;abandon.disabled=!run||!!current;
  newRun.textContent=run?'RESTART LADDER':'START NEW LADDER';
  for(const [i,level] of (run?ROUTES[run.route]:ROUTES[route.value]).entries()){
   const item=make('li');
   const won=run?.wins[i];const state=won?'✓ ':run?.wins.length===i?'▶ ':'○ ';
   item.append(make('strong',state+(i+1)+'. '+level.toUpperCase()),
    make('span',won?won.for+'–'+won.against+' · '+won.duration+'s native win':run?.wins.length===i?'Current stage':'Not yet unlocked'));
   stages.append(item);
  }
  if(!current)status.textContent=run?
   'Stage '+(run.wins.length+1)+' of 3 · '+run.retries+' replay(s). Finish a full native '+run.duration+'s round and outscore the AI.':
   'Start a fresh ladder. Your winning rounds are saved locally between visits.';
  paintHistory();
 }
 function paintHistory(){
  const rows=readHistory();results.replaceChildren();exportBtn.disabled=clearBtn.disabled=!rows.length;
  if(!rows.length){results.append(make('p','No full three-win native AI ladders completed yet.'));return;}
  for(const r of rows.slice(0,6)){
   const row=make('article',null,'ai-gauntlet-result');
   row.append(make('strong',(r.route==='elite'?'ELITE':'STANDARD')+' · 3 native wins'),
    make('span',r.wins.map(w=>w.level+' '+w.for+'–'+w.against).join(' · ')),
    make('small',r.duration+'s per stage · '+r.retries+' replay(s) · '+new Date(r.finishedAt).toLocaleDateString()));
   results.append(row);
  }
 }
 function validNative(){
  if(serverLink||peerConnected||replay||!room||!started||pitch.hidden||!room.gameState)return false;
  if(!Number.isSafeInteger(room.currentFrameNo)||room.currentFrameNo<0)return false;
  const mine=room.state?.players?.find?.(p=>p.id===1),enemy=room.state?.players?.find?.(p=>p.id===2);
  return mine&&enemy&&[1,2].includes(mine.team?.id)&&enemy.team?.id===3-mine.team.id&&
   !botIds.has(1)&&botIds.has(2)&&Number.isSafeInteger(room.gameState.redScore)&&
   Number.isSafeInteger(room.gameState.blueScore);
 }
 function nativeScore(s){
  const g=s.room.gameState;
  return s.side===1?[g.redScore,g.blueScore]:[g.blueScore,g.redScore];
 }
 function restore(s){
  if(!s)return;
  // Never overwrite an intentional user change to the bot level while playing.
  if(settings.botLevels?.[2]===s.level){
   if(s.prior===undefined)delete settings.botLevels[2];else settings.botLevels[2]=s.prior;
  }
 }
 function endStage(message,complete=false){
  const s=current;if(!s)return;current=null;restore(s);
  const [ours,theirs]=complete&&s.room?.gameState?nativeScore(s):[s.lastFor,s.lastAgainst],won=complete&&ours>s.firstFor&&theirs>=s.firstAgainst&&
   ours-s.firstFor>theirs-s.firstAgainst;
  if(complete){
   const deltaFor=ours-s.firstFor,deltaAgainst=theirs-s.firstAgainst;
   if(won){
    const record={level:s.level,duration:s.duration,for:deltaFor,against:deltaAgainst,at:Date.now()};
    s.run.wins.push(record);
    if(s.run.wins.length===3){
     const completed={...s.run,finishedAt:Date.now()};
     if(!persist(HISTORY,[completed,...readHistory()].slice(0,MAX_HISTORY)))
      status.textContent='Three wins completed, but browser history could not be saved.';
     try{localStorage.removeItem(KEY);}catch{}
    }else if(!persist(KEY,s.run))status.textContent='Win scored, but local stage progress could not be saved.';
   }else{
    s.run.retries=Math.min(999,s.run.retries+1);
    if(!persist(KEY,s.run))status.textContent='Round finished, but retry count could not be saved.';
   }
  }
  title.textContent=complete?(won?'ROUND WON · NATIVE SCORE':'ROUND NOT WON · NATIVE SCORE'):message;
  clock.textContent=complete?(ours-s.firstFor)+'–'+(theirs-s.firstAgainst)+' after '+s.duration+' active seconds':'Interrupted; no round credited';
  score.textContent=won?(s.run.wins.length===3?'Ladder completed!':'Stage cleared. Choose the next opponent manually.'):
   complete?'Outscore the AI over a full clock to advance. Retry this opponent.':'This incomplete game did not change your ladder.';
  stop.hidden=true;next.hidden=false;dismiss.hidden=false;bar.value=complete?100:bar.value;
  paint();
 }
 function leave(){if(current){restore(current);current=null;}hud.hidden=true;stop.hidden=false;next.hidden=true;dismiss.hidden=true;title.textContent='AI GAUNTLET · LOCAL 1v1';}

 function tick(){
  const s=current;if(!s)return;
  if(document.hidden){endStage('TAB HIDDEN');return;}
  if(!validNative()||room!==s.room||settings.botLevels?.[2]!==s.level){
   endStage('GAME OR OPPONENT CHANGED');return;
  }
  const frame=room.currentFrameNo,delta=frame-s.frame;
  const [ours,theirs]=nativeScore(s);
  if(delta<0||delta>240||ours<s.firstFor||theirs<s.firstAgainst){
   endStage('MATCH RESTARTED');return;
  }
  if(!paused)s.frames+=delta;
  s.frame=frame;s.lastFor=ours;s.lastAgainst=theirs;
  clock.textContent=Math.max(0,Math.ceil((s.duration*60-s.frames)/60))+'s left · '+s.level.toUpperCase()+' AI';
  score.textContent='Native score: '+(ours-s.firstFor)+' – '+(theirs-s.firstAgainst)+
   ' · '+(s.frames>=s.duration*60?'Round complete':'Beat the AI over the full clock');
  bar.value=Math.min(100,Math.floor(100*s.frames/(s.duration*60)));
  if(s.frames>=s.duration*60)endStage('ROUND FINISHED',true);
 }
 function blocked(){
  if(serverLink||peerConnected)return 'Disconnect from the active online room or peer first.';
  if(typeof pendingSessionBlock==='function'){
   const reason=pendingSessionBlock();if(reason)return reason;
  }
  return '';
 }
 function beginStage(){
  if(current)return;
  run=readRun();if(!run){status.textContent='Start a valid new local ladder first.';return;}
  const reason=blocked();if(reason){status.textContent=reason;return;}
  if((started||replay)&&!window.confirm('Replace this local match/replay with a fresh native AI gauntlet round? Unsaved progress or recording will be lost.')){
   status.textContent='Current local session kept. Stage not started.';return;
  }
  const level=ROUTES[run.route][run.wins.length];
  if(!level)return;
  const prior=settings.botLevels?.[2];settings.botLevels??={};
  settings.botLevels[2]=level;leave();
  try{
   if(!quickPlay('bot',true,true)||!validNative())
    throw Error('Native local 1v1 could not start. Existing online rights remain unchanged.');
   const side=room.state.players.find(p=>p.id===1).team.id,g=room.gameState;
   const s={room,run,level,prior,side,duration:run.duration,frames:0,
    frame:room.currentFrameNo,firstFor:side===1?g.redScore:g.blueScore,
    firstAgainst:side===1?g.blueScore:g.redScore,
    lastFor:side===1?g.redScore:g.blueScore,lastAgainst:side===1?g.blueScore:g.redScore};
   current=s;title.textContent='STAGE '+(run.wins.length+1)+' / 3 · '+level.toUpperCase()+' AI';
   clock.textContent=run.duration+'s left';score.textContent='Native score: 0 – 0';
   bar.value=0;hud.hidden=false;stop.hidden=false;next.hidden=true;dismiss.hidden=true;
   status.textContent='Round playing in the authentic local engine. No online or ranked play.';
   paint();
  }catch(error){
   restore({level,prior});leave();status.textContent=error?.message||'Could not start local practice.';
  }
 }
 newRun.onclick=()=>{
  if(current){status.textContent='Stop the current native stage before starting a new ladder.';return;}
  if(readRun()&&!confirm('Discard the saved unfinished gauntlet and start from stage one? Completed history stays.'))return;
  const selected=route.value,seconds=Number(duration.value);
  if(!Object.hasOwn(ROUTES,selected)||![60,120].includes(seconds)){status.textContent='Choose valid options.';return;}
  const fresh={version:1,route:selected,duration:seconds,startedAt:Date.now(),retries:0,wins:[]};
  if(!persist(KEY,fresh)){status.textContent='Local storage unavailable; progress cannot be saved.';return;}
  paint();
 };
 launch.onclick=beginStage;
 abandon.onclick=()=>{
  if(current||!readRun())return;
  if(!confirm('Reset unfinished AI Gauntlet progress on this device? Saved completed ladders will remain.'))return;
  try{localStorage.removeItem(KEY);}catch{status.textContent='Unable to clear browser storage.';return;}
  paint();
 };
 stop.onclick=()=>endStage('STAGE STOPPED');
 next.onclick=()=>{leave();beginStage();};
 dismiss.onclick=leave;
 exportBtn.onclick=()=>{
  const rows=readHistory();if(!rows.length)return;
  const payload={format:'fuckball-native-local-ai-gauntlet',version:1,
   source:'device-only-unranked-real-native-game-scores',exportedAt:new Date().toISOString(),
   note:'Completed offline 1v1 native-tick ladders, not verified skill ratings or ranked outcomes.',ladders:rows};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=make('a');
  a.href=url;a.download='fuckball-ai-gauntlet-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clearBtn.onclick=()=>{
  if(!readHistory().length||!confirm('Erase only completed local AI Gauntlet history on this device?'))return;
  try{localStorage.removeItem(HISTORY);}catch{status.textContent='Browser storage unavailable.';return;}
  paintHistory();
 };
 route.onchange=paint;
 window.addEventListener('storage',event=>{
  if(event.key!==KEY&&event.key!==HISTORY)return;
  if(current&&event.key===KEY){
   endStage('LADDER CHANGED IN ANOTHER TAB');
   return;
  }
  paint();
 });
 window.setInterval(tick,150);
 paint();
})();

