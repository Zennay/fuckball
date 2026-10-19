'use strict';
// Local, opt-in 3-stage training circuit using authentic saved drill completions.
// It never starts a match on its own, modifies game rules, or awards online results.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 if(!home||!match)return;
 const STATE='fuckball.practice-circuit.v1',HISTORY='fuckball.practice-circuit-history.v1',DAY=86400000;
 const TYPES={
  touch:{name:'First Touch',description:'Move, kick and score in the existing native solo tutorial.',route:'touch'},
  goals:{name:'Goal Rush',description:'Finish a real timed shooting target against local AI.',route:'goals'},
  team:{name:'Teamwork',description:'Complete a real team-link target in native 4v4 practice.',route:'team'},
  defense:{name:'Clean Sheet',description:'Concede at most your chosen target in a full-clock real native local 1v1.',route:'defense'},
  rockets:{name:'Rocket Kick',description:'Hit your raw native ball-speed burst target after real human kicks.',route:'rockets'},
  ladder:{name:'AI Gauntlet',description:'Complete all three full-clock native 1v1 AI stages.',route:'ladder'},
  comeback:{name:'Comeback Arena',description:'Overcome a virtual goal deficit with a complete genuine local 1v1.',route:'comeback'},
  keepaway:{name:'Keep Away',description:'Reach the consecutive native kick target against local AI in a full active local clock.',route:'keepaway'}
 };
 const PRESETS=[
  {name:'Fundamentals · touch → finishing → team play',order:['touch','goals','team']},
  {name:'Striker focus · finishing → touch → team play',order:['goals','touch','team']},
  {name:'Team focus · team play → touch → finishing',order:['team','touch','goals']},
  {name:'Defender focus · clean sheet → first touch → teamwork',order:['defense','touch','team']},
  {name:'Complete player · finishing → clean sheet → teamwork',order:['goals','defense','team']},
  {name:'Rocket striker · finishing → rocket kick → clean sheet',order:['goals','rockets','defense']},
  {name:'All-rounder · rocket kick → teamwork → clean sheet',order:['rockets','team','defense']},
  {name:'AI challenger · goal rush → clean sheet → AI gauntlet',order:['goals','defense','ladder']},
  {name:'Elite preparation · first touch → rocket kick → AI gauntlet',order:['touch','rockets','ladder']},
  {name:'Comeback striker · finishing → defending → comeback',order:['goals','defense','comeback']},
  {name:'Pressure specialist · first touch → teamwork → comeback',order:['touch','team','comeback']},
  {name:'Ball control · touch → keep away → teamwork',order:['touch','keepaway','team']},
  {name:'Press resistant · keep away → rockets → comeback',order:['keepaway','rockets','comeback']}
 ];
 const make=(tag,cls='',value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el;};
 function data(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
 const validAt=at=>Number.isSafeInteger(at)&&at>0&&at<=Date.now()+DAY;
 function validOrder(order){
  return Array.isArray(order)&&order.length===3&&new Set(order).size===3&&
   order.every(key=>Object.hasOwn(TYPES,key));
 }
 function readState(){
  const s=data(STATE);
  if(!s||s.version!==1||!validOrder(s.order)||!validAt(s.startedAt)||
   !Number.isSafeInteger(s.done)||s.done<0||s.done>2||
   !(s.armedStep===null||s.armedStep===s.done)||
   !Number.isSafeInteger(s.armedAt)||s.armedAt<0||
   !Number.isSafeInteger(s.baseline)||s.baseline<0)return null;
  if(s.startedAt<Date.now()-DAY)return null;
  return s;
 }
 function saveState(s){
  try{localStorage.setItem(STATE,JSON.stringify(s));return true;}catch{return false;}
 }
 function readHistory(){
  const rows=data(HISTORY);if(!Array.isArray(rows))return[];
  return rows.slice(0,12).filter(x=>x?.version===1&&validOrder(x.order)&&
   validAt(x.startedAt)&&validAt(x.finishedAt)&&x.finishedAt>=x.startedAt&&
   x.finishedAt-x.startedAt<=DAY);
 }
 function saveHistory(rows){
  try{localStorage.setItem(HISTORY,JSON.stringify(rows.slice(0,12)));return true;}
  catch{return false;}
 }
 function latestSuccess(type){
  if(type==='comeback'){
   const rows=data('fuckball.native-comeback-arena.v1');
   if(!Array.isArray(rows)||rows.length>20)return 0;
   let latest=0;
   for(const x of rows){
    if(!x||![60,120,180].includes(x.duration)||![1,2,3].includes(x.deficit)||
     !validAt(x.at)||!Number.isSafeInteger(x.elapsed)||
     x.elapsed<x.duration||x.elapsed>x.duration+1||
     !Number.isSafeInteger(x.scored)||x.scored<0||x.scored>999||
     !Number.isSafeInteger(x.conceded)||x.conceded<0||x.conceded>999||
     x.completed!==true||x.scored<=x.conceded+x.deficit)continue;
    latest=Math.max(latest,x.at);
   }
   return latest;
  }
  if(type==='keepaway'){
   const rows=data('fuckball.native-keep-away.v1');
   if(!Array.isArray(rows)||rows.length>20)return 0;
   let latest=0;
   for(const x of rows){
    if(!x||![60,120,180].includes(x.duration)||![3,5,8].includes(x.target)||
     !validAt(x.at)||!Number.isSafeInteger(x.best)||x.best<x.target||x.best>999||
     !Number.isSafeInteger(x.kicks)||x.kicks<x.best||x.kicks>9999||
     !Number.isSafeInteger(x.breaks)||x.breaks<0||x.breaks>9999||
     !Number.isSafeInteger(x.elapsed)||x.elapsed<x.duration||x.elapsed>x.duration+1||
     x.completed!==true)continue;
    latest=Math.max(latest,x.at);
   }
   return latest;
  }
  if(type==='ladder'){
   const rows=data('fuckball.ai-gauntlet-history.v1');
   if(!Array.isArray(rows)||rows.length>12)return 0;
   const levels={standard:['easy','normal','hard'],elite:['normal','hard','elite']};
   let latest=0;
   for(const r of rows){
    if(!r||r.version!==1||!Object.hasOwn(levels,r.route)||
     ![60,120].includes(r.duration)||!validAt(r.finishedAt)||!validAt(r.startedAt)||
     r.finishedAt<r.startedAt||r.finishedAt-r.startedAt>30*DAY||
     !Array.isArray(r.wins)||r.wins.length!==3||
     !r.wins.every((w,i)=>w&&w.level===levels[r.route][i]&&
      w.duration===r.duration&&validAt(w.at)&&w.at>=r.startedAt&&w.at<=r.finishedAt&&
      Number.isSafeInteger(w.for)&&Number.isSafeInteger(w.against)&&
      w.for>w.against&&w.against>=0&&w.for<=999))continue;
    latest=Math.max(latest,r.finishedAt);
   }
   return latest;
  }
  if(type==='touch'){
   const value=data('fuckball.first-play-guide.v1');
   return value?.version===1&&validAt(value.at)?value.at:0;
  }
  const key=type==='goals'?'fuckball-local-goal-rush-history-v1':
   type==='defense'?'fuckball.clean-sheet-history.v1':
   type==='rockets'?'fuckball.native-ball-burst-history.v1':'fuckball.teamwork-native-drill.v1';
  const rows=data(key);
  if(!Array.isArray(rows))return 0;
  let latest=0;
  for(const x of rows.slice(0,20)){
   if(!x||x.completed!==true||!validAt(x.at))continue;
   if(type==='goals'){
    if(![60,120,180].includes(x.duration)||![1,3,5].includes(x.target)||
      !Number.isSafeInteger(x.goals)||x.goals<x.target||x.goals>999||
      !Number.isSafeInteger(x.elapsed)||x.elapsed<0||x.elapsed>180)continue;
   }else if(type==='rockets'){
    if(![60,120,180].includes(x.duration)||![3,5,7].includes(x.threshold)||
     ![1,3,5].includes(x.target)||!Number.isSafeInteger(x.hits)||x.hits<x.target||x.hits>999||
     !Number.isSafeInteger(x.kicks)||x.kicks<x.hits||x.kicks>9999||
     !Number.isSafeInteger(x.elapsed)||x.elapsed<0||x.elapsed>x.duration+1||
     !Number.isFinite(x.peak)||x.peak<0||x.peak>1000)continue;
   }else if(type==='defense'){
    if(![60,120,180].includes(x.duration)||![0,1,2].includes(x.allowance)||
     !Number.isSafeInteger(x.conceded)||x.conceded<0||x.conceded>999||
     !Number.isSafeInteger(x.scored)||x.scored<0||x.scored>999||
     !Number.isSafeInteger(x.elapsed)||x.elapsed<x.duration||x.elapsed>x.duration+1||
     x.completed!==(x.conceded<=x.allowance))continue;
   }else{
    if(![120,180,300].includes(x.seconds)||![2,4,6].includes(x.target)||
     !Number.isSafeInteger(x.links)||x.links<x.target||x.links>99||
     !Number.isSafeInteger(x.attempts)||x.attempts<0||x.attempts>9999||
     !Number.isSafeInteger(x.elapsed)||x.elapsed<0||x.elapsed>300)continue;
   }
   latest=Math.max(latest,x.at);
  }
  return latest;
 }
 const section=make('section','practice-circuit'),header=make('div','practice-circuit-header'),copy=make('div');
 section.setAttribute('aria-label','Private guided practice circuit');
 copy.append(make('span','eyebrow','OFFLINE TRAINING · REAL SAVED DRILLS'),
   make('h2','','TRAINING CIRCUIT.'),
   make('p','','Build a three-stage routine from existing native drills. Every stage is credited only after a new, genuine local completion is saved. Nothing affects online results.'));
 const selector=make('select');selector.setAttribute('aria-label','Choose a three-stage training circuit');
 for(const [i,p] of PRESETS.entries())selector.add(new Option(p.name,String(i)));
 const start=make('button','primary','▶ Start circuit');start.type='button';
 const headActions=make('div','practice-circuit-controls');headActions.append(selector,start);
 header.append(copy,headActions);
 const live=make('div','practice-circuit-live'),progress=make('div','practice-circuit-progress'),rows=make('ol','practice-circuit-steps');
 const detail=make('p','practice-circuit-detail'),toolbar=make('div','practice-circuit-actions');
 const open=make('button','primary','Open next drill'),refresh=make('button','','↻ Check saved progress'),abandon=make('button','','End circuit');
 for(const btn of [open,refresh,abandon]){btn.type='button';toolbar.append(btn);}
 detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
 live.append(progress,rows,detail,toolbar);
 const archive=make('div','practice-circuit-history');
 archive.append(make('h3','','PREVIOUS CIRCUITS'),make('p','','Only completed device-local circuits. No server results, ranked ratings or claims about other players.'));
 const historyList=make('ol','practice-circuit-records');
 const archiveActions=make('div','practice-circuit-actions'),download=make('button','','↓ Export my circuits'),clear=make('button','','Clear history');
 download.type=clear.type='button';archiveActions.append(download,clear);
 archive.append(historyList,archiveActions);
 const status=make('p','practice-circuit-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 section.append(header,live,archive,status);
 const anchor=home.querySelector('.practice-weekly-plan')||home.querySelector('.practice-lab')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 const hud=make('aside','practice-circuit-hud'),hudText=make('span','','');
 const hudBack=make('button','','↗ Training Circuit');hudBack.type='button';
 hudBack.onclick=()=>{document.getElementById('tabHome')?.click();section.scrollIntoView({block:'start',behavior:'smooth'});};
 hud.append(hudText,hudBack);match.append(hud);
 let session=readState();
 const label=key=>TYPES[key]?.name||'Unknown';
 const elapsed=(from,to)=>Math.max(0,Math.round((to-from)/60000))+' min';
 function renderHistory(){
  const past=readHistory();historyList.replaceChildren();
  if(!past.length)historyList.append(make('li','','No completed circuits saved on this device.'));
  for(const row of past){
   const item=make('li','practice-circuit-record');
   item.append(make('strong','',new Date(row.finishedAt).toLocaleDateString()+' · '+elapsed(row.startedAt,row.finishedAt)),
     make('span','',row.order.map(label).join(' → ')));
   historyList.append(item);
  }
  download.disabled=clear.disabled=!past.length;
 }
 function online(){
  return (typeof serverLink!=='undefined'&&!!serverLink?.room)||
   (typeof peerConnected!=='undefined'&&peerConnected===true)||
   !!document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])');
 }
 function render(message){
  live.hidden=!session;selector.disabled=start.disabled=!!session;
  hud.hidden=!session||match.hidden||online();
  if(!session){hudText.textContent='';renderHistory();if(message)status.textContent=message;return;}
  progress.textContent='STAGE '+(session.done+1)+' / 3 · '+session.order.map((key,i)=>i<session.done?'✓':i===session.done?'◉':'○').join('   ');
  rows.replaceChildren();
  session.order.forEach((key,i)=>{
   const row=make('li',i<session.done?'is-complete':i===session.done?'is-current':'is-upcoming');
   row.append(make('strong','',String(i+1).padStart(2,'0')+' · '+label(key)),
    make('span','',i<session.done?'Completed from a saved drill':i===session.done?'Next · '+TYPES[key].description:'Upcoming'));
   rows.append(row);
  });
  const armed=session.armedStep===session.done;
  detail.textContent=message||(armed?
   'Tracking '+label(session.order[session.done])+'. Finish the target in the actual drill; interrupted or unsuccessful attempts do not count.':
   'Select Open next drill to arm this stage. Earlier saved scores never count as new progress.');
  open.textContent=armed?'↗ Return to '+label(session.order[session.done]):'▶ Open '+label(session.order[session.done]);
  hudText.textContent='CIRCUIT '+(session.done+1)+'/3 · '+label(session.order[session.done])+(armed?' · tracking':' · open drill');
  renderHistory();
 }
 function completed(){
  if(!session||session.armedStep!==session.done||!session.armedAt)return false;
  const at=latestSuccess(session.order[session.done]);
  if(at<=session.baseline||at<session.armedAt||at>Date.now())return false;
  session.done++;
  if(session.done===3){
   const finishedAt=Date.now(),row={version:1,startedAt:session.startedAt,finishedAt,order:session.order};
   const archived=saveHistory([row,...readHistory()]);
   try{localStorage.removeItem(STATE);}catch{}
   session=null;
   render(archived?'Circuit completed! Three new real local drill completions saved.':'Circuit completed; history could not be saved in this browser.');
   return true;
  }
  session.armedStep=null;session.armedAt=0;session.baseline=0;
  if(!saveState(session))status.textContent='Stage completed but browser storage is unavailable.';
  render('Stage completed with a saved local result. Open '+label(session.order[session.done])+' to continue.');
  return true;
 }
 start.onclick=()=>{
  if(session)return;
  if(online()){status.textContent='Leave the online room or Quick Match queue before starting offline training.';return;}
  const order=PRESETS[Number(selector.value)]?.order;
  if(!validOrder(order))return;
  session={version:1,startedAt:Date.now(),order:[...order],done:0,armedStep:null,armedAt:0,baseline:0};
  if(!saveState(session)){session=null;status.textContent='Cannot start: browser storage is unavailable.';return;}
  render('Circuit created. Open the first drill to begin tracking new completions.');
 };
 function openDrill(){
  if(!session||online()){status.textContent='Leave online matches or queues before opening a local drill.';return;}
  completed();if(!session)return;
  const step=session.order[session.done];
  // Reopening a previously armed drill keeps its original baseline.
  if(session.armedStep!==session.done){
   session.armedStep=session.done;session.armedAt=Date.now();session.baseline=latestSuccess(step);
   if(!saveState(session)){
    session.armedStep=null;session.armedAt=0;session.baseline=0;
    status.textContent='Cannot track the drill: browser storage is unavailable.';return;
   }
  }
  const lab=home.querySelector('.practice-lab-disclosure');
  if(lab)lab.open=true;
  const tab=document.getElementById('practice-lab-tab-'+(step==='touch'?'first':step));
  tab?.click();
  tab?.scrollIntoView({block:'center',behavior:'smooth'});
  const drill=step==='touch'?'.first-play-card':step==='goals'?'.goal-rush-setup':
   step==='defense'?'.clean-sheet-setup':step==='rockets'?'.native-ball-burst':
   step==='ladder'?'.ai-gauntlet-setup':step==='comeback'?'.comeback-arena':
   step==='keepaway'?'.keep-away-setup':'.teamwork-panel';
  home.querySelector(drill+' button.primary')?.focus();
  render('Tracking '+label(step)+'. Press START inside the actual drill, then complete its in-game goal.');
 }
 open.onclick=openDrill;
 refresh.onclick=()=>{if(!completed())render('No new successful saved result for this stage yet.');};
 abandon.onclick=()=>{
  if(!session||!confirm('End your unfinished circuit? Local drill results and previous completed circuits stay saved.'))return;
  session=null;try{localStorage.removeItem(STATE);}catch{}
  render('Unfinished circuit ended. Original practice records remain untouched.');
 };
 download.onclick=()=>{
  const rows=readHistory();if(!rows.length)return;
  const snapshot={format:'fuckball-local-practice-circuits',version:1,
   source:'device-only-unverified-training',exportedAt:new Date().toISOString(),circuits:rows};
  const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='fuckball-training-circuits-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Private circuit history downloaded. Nothing was uploaded.';
 };
 clear.onclick=()=>{
  if(!readHistory().length||!confirm('Delete your completed circuit summaries on this device? Individual drill histories stay saved.'))return;
  try{localStorage.removeItem(HISTORY);}catch{status.textContent='Cannot clear history while local storage is unavailable.';return;}
  render('Only circuit summaries were cleared; the real drill records remain.');
 };
 window.setInterval(()=>{
  if(!session)return;
  // A circuit is a short, intentional session, not permanent surveillance.
  if(session.startedAt<Date.now()-DAY){
   session=null;try{localStorage.removeItem(STATE);}catch{}
   render('The unfinished 24-hour circuit expired. Saved individual drill results remain.');
   return;
  }
  if(!completed())hud.hidden=match.hidden||online();
 },1800);
 // A practice snapshot restore in this same tab does not raise StorageEvent;
 // refresh the completed-circuit list without disturbing a running drill.
 window.addEventListener('fuckball-practice-circuits-updated',()=>renderHistory());
 window.addEventListener('storage',event=>{
  if([STATE,HISTORY,'fuckball.first-play-guide.v1','fuckball-local-goal-rush-history-v1',
   'fuckball.teamwork-native-drill.v1','fuckball.clean-sheet-history.v1',
   'fuckball.native-ball-burst-history.v1','fuckball.ai-gauntlet-history.v1'].includes(event.key)){
   session=readState();if(!completed())render();
  }
 });
 render();
})();