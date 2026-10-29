'use strict';
// A training coach built only from genuine, device-local saved practice results.
// Suggestions never adjust physics, award ranks, or begin a match automatically.
(function(){
 const home=document.getElementById('homeView');
 if(!home)return;
 const keys={
  goals:'fuckball-local-goal-rush-history-v1',
  team:'fuckball.teamwork-native-drill.v1',
  matches:'fuckball.local-practice-journal.v1',
  first:'fuckball.first-play-guide.v1'
 };
 const types=[
  {id:'goals',name:'Finishing',mode:'Goal Rush',tab:'goals'},
  {id:'team',name:'Team links',mode:'Teamwork',tab:'team'},
  {id:'matches',name:'Match experience',mode:'Solo vs AI',tab:null}
 ];
 const el=(tag,klass,value)=>{
  const node=document.createElement(tag);if(klass)node.className=klass;
  if(value!==undefined)node.textContent=String(value);
  return node;
 };
 const root=el('section','practice-focus-coach');
 root.setAttribute('aria-label','Offline personal training insights and next drill');
 const header=el('header','practice-focus-heading');
 header.append(el('span','practice-focus-kicker','OFFLINE · OWN SAVED RESULTS'),
  el('h2','','YOUR TRAINING FOCUS.'),
  el('p','','Compare your actual recent local drills, understand the current gap and open a suggested native drill. Your results stay in this browser and are not a ranked rating.'));
 const details=el('div','practice-focus-summary');
 const integrity=el('p','practice-focus-integrity');
 integrity.setAttribute('role','status');
 integrity.setAttribute('aria-live','polite');
 const cards=el('div','practice-focus-cards');
 const recommendation=el('section','practice-focus-next');
 recommendation.setAttribute('aria-label','Suggested next practice');
 const nextHead=el('strong','practice-focus-next-heading','NEXT TRAINING STEP');
 const nextText=el('p','practice-focus-next-text');
 const nextButtons=el('div','practice-focus-next-actions');
 const launch=el('button','primary','Open suggested drill');launch.type='button';
 const viewHistory=el('button','','See practice journal');viewHistory.type='button';
 nextButtons.append(launch,viewHistory);
 recommendation.append(nextHead,nextText,nextButtons);
 const footer=el('div','practice-focus-actions');
 const refresh=el('button','','↻ Refresh actual results');refresh.type='button';
 const exportButton=el('button','','↓ Save private focus summary');exportButton.type='button';
 const feedback=el('p','practice-focus-status');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 footer.append(refresh,exportButton);
 root.append(header,details,integrity,cards,recommendation,footer,feedback);
 const anchor=home.querySelector('.practice-weekly-plan')||
  home.querySelector('.practice-lab')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',root);else home.append(root);
 const now=()=>Date.now();
 function read(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
 }
 function validAt(value){return Number.isSafeInteger(value)&&value>0&&value<=now()+86400000;}
 function valid(row,type){
  if(!row||typeof row!=='object'||Array.isArray(row)||!validAt(row.at))return false;
  if(type==='goals')return [60,120,180].includes(row.duration)&&
   [1,3,5].includes(row.target)&&Number.isSafeInteger(row.goals)&&
   row.goals>=0&&row.goals<=999&&Number.isSafeInteger(row.elapsed)&&
   row.elapsed>=0&&row.elapsed<=row.duration+1&&
   row.completed===(row.goals>=row.target);
  if(type==='team')return [120,180,300].includes(row.seconds)&&
   [2,4,6].includes(row.target)&&Number.isSafeInteger(row.links)&&
   row.links>=0&&row.links<=99&&Number.isSafeInteger(row.attempts)&&
   row.attempts>=0&&row.attempts<=9999&&Number.isSafeInteger(row.elapsed)&&
   row.elapsed>=0&&row.elapsed<=row.seconds+1&&
   row.completed===(row.links>=row.target);
  return ['bot','practice','2v2','4v4'].includes(row.mode)&&
   [1,2].includes(row.side)&&Number.isSafeInteger(row.red)&&
   row.red>=0&&row.red<=999&&Number.isSafeInteger(row.blue)&&
   row.blue>=0&&row.blue<=999&&Number.isSafeInteger(row.seconds)&&
   row.seconds>0&&row.seconds<=14400&&typeof row.stadium==='string'&&
   row.stadium.length<=48;
 }
 function entries(type){
  const cap=type==='matches'?30:20;
  // Do not silently describe damaged or overlong stored evidence as an empty
  // training history. Never edit or discard these source records here.
  let raw;
  try{raw=localStorage.getItem(keys[type]);}
  catch{return{rows:[],excluded:0,unreadable:true};}
  if(raw===null)return{rows:[],excluded:0,unreadable:false};
  let rows;
  try{rows=JSON.parse(raw);}catch{return{rows:[],excluded:0,unreadable:true};}
  if(!Array.isArray(rows)||rows.length>cap)
   return{rows:[],excluded:0,unreadable:true};
  const clean=rows.filter(row=>valid(row,type))
   .sort((a,b)=>b.at-a.at).slice(0,cap);
  return{rows:clean,excluded:rows.length-clean.length,unreadable:false};
 }
 function success(row,type){
  if(type==='matches'){
   const ours=row.side===1?row.red:row.blue,other=row.side===1?row.blue:row.red;
   return ours>other;
  }
  return row.completed===true;
 }
 function insight(type){
  const evidence=entries(type),list=evidence.rows;
  const recent=list.slice(0,5),older=list.slice(5,10);
  const completed=recent.filter(x=>success(x,type)).length;
  const rate=recent.length?Math.round(completed/recent.length*100):null;
  const previous=older.length>=2?Math.round(older.filter(x=>success(x,type)).length/older.length*100):null;
  const diff=rate!==null&&previous!==null?rate-previous:null;
  return {type,list,recent,older,completed,rate,previous,diff,
   excluded:evidence.excluded,unreadable:evidence.unreadable};
 }
 function shortDate(at){return new Date(at).toLocaleDateString(undefined,{day:'numeric',month:'short'});}
 const model={current:[],chosen:null};
 function formatChange(v){
  return v.diff===null?'Need more prior attempts to compare':
   v.diff===0?'No change vs preceding attempts':
   (v.diff>0?'+':'')+v.diff+' percentage points vs preceding attempts';
 }
 function renderCard(data){
  const card=el('article','practice-focus-card');
  const label=el('h3','',types.find(x=>x.id===data.type).name);
  const rate=el('strong','practice-focus-rate',
   data.rate===null?'No results':data.completed+' / '+data.recent.length);
  const note=el('p','','Recent '+(data.type==='matches'?'wins':'targets achieved')+
   ' · last '+data.recent.length+' actual saved '+(data.type==='matches'?'matches':'attempts'));
  const meter=el('div','practice-focus-meter');meter.setAttribute('role','progressbar');
  meter.setAttribute('aria-label',label.textContent+' recent success percentage');
  meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
  meter.setAttribute('aria-valuenow',String(data.rate??0));
  const fill=el('span','');fill.style.width=(data.rate??0)+'%';meter.append(fill);
  const comparison=el('small','practice-focus-comparison',
   data.rate===null?'Finish a local activity to establish a real baseline.':
   data.rate+'% in '+data.recent.length+' recent records · '+formatChange(data));
  const open=el('button','','Open '+(types.find(x=>x.id===data.type).mode));
  open.type='button';open.onclick=()=>openActivity(data.type,null);
  card.append(label,rate,note,meter,comparison,open);return card;
 }
 function recommend(insights){
  const first=read(keys.first);
  const firstDone=first?.version===1&&validAt(first.at);
  if(!firstDone&&insights.every(x=>x.list.length===0))
   return {type:'first',message:'Start with First Touch: movement, kicking and a real local goal. No results have been recorded on this device yet.'};
  const goals=insights.find(x=>x.type==='goals'),team=insights.find(x=>x.type==='team');
  // Never treat zero observations as a proven weak skill.
  if(!goals.recent.length&&team.recent.length)
   return {type:'goals',message:'You have recorded Teamwork attempts but no Goal Rush attempts. Establish a finishing baseline before comparing skills.'};
  if(!team.recent.length&&goals.recent.length)
   return {type:'team',message:'You have recorded Goal Rush attempts but no Teamwork attempts. Establish a link-up baseline before comparing skills.'};
  if(!goals.recent.length&&!team.recent.length)
   return {type:firstDone?'goals':'first',message:firstDone?
    'First Touch is completed. Record a real Goal Rush attempt to start your finishing history.':
    'Complete First Touch to build basic match controls, then start a timed scoring challenge.'};
  const target=goals.rate<=team.rate?goals:team;
  const label=target.type==='goals'?'finishing':'team link-up play';
  return {type:target.type,message:
   'Based on your last '+target.recent.length+' recorded '+(target.type==='goals'?'Goal Rush':'Teamwork')+
   ' attempts, '+label+' has the lower observed target-completion rate ('+target.rate+
   '%). Repeat an achievable drill, then review your newly saved outcome. This is a suggestion, not a skill rating.'};
 }
 function suggestedSettings(type){
  if(type==='goals'){
   const recent=model.current.find(x=>x.type==='goals')?.recent||[];
   const last=recent[0];
   const duration=last?.duration||120;
   const targets=[1,3,5];
   let desired=last?.target||1;
   if(recent.length>=2&&recent[0].completed&&recent[1].completed){
    desired=targets[Math.min(targets.length-1,Math.max(0,targets.indexOf(desired))+1)];
   }
   return {duration:String(duration),target:String(desired)};
  }
  if(type==='team'){
   const recent=model.current.find(x=>x.type==='team')?.recent||[];
   const last=recent[0],targets=[2,4,6];
   let desired=last?.target||2;
   if(recent.length>=2&&recent[0].completed&&recent[1].completed)
    desired=targets[Math.min(2,Math.max(0,targets.indexOf(desired))+1)];
   return {duration:String(last?.seconds||180),target:String(desired)};
  }
  return null;
 }
 function openActivity(type,settings){
  if(type==='matches'){
   document.getElementById('tabReplay')?.click();
   document.querySelector('.local-practice-journal')?.scrollIntoView({block:'start'});
   feedback.textContent='Opened your private completed local match journal.';
   return;
  }
  const tab=type==='first'?'first':type;
  const lab=home.querySelector('.practice-lab-disclosure');
  const select=home.querySelector('#practice-lab-tab-'+tab);
  if(!lab||!select){
   feedback.textContent='The original '+tab+' drill is unavailable on this device.';
   return;
  }
  lab.open=true;select.click();
  const scope=tab==='goals'?home.querySelector('.goal-rush-setup'):
   tab==='team'?home.querySelector('.teamwork-panel'):null;
  if(settings&&scope){
   const duration=scope.querySelector('select[aria-label="'+
    (tab==='goals'?'Goal Rush drill duration':'Teamwork training duration')+'"]');
   const target=scope.querySelector('select[aria-label="'+
    (tab==='goals'?'Goal Rush target goals':'Target consecutive teammate kicks')+'"]');
   if(duration&&[...duration.options].some(x=>x.value===settings.duration)){
    duration.value=settings.duration;
    duration.dispatchEvent(new Event('change',{bubbles:true}));
   }
   if(target&&[...target.options].some(x=>x.value===settings.target)){
    target.value=settings.target;target.dispatchEvent(new Event('change',{bubbles:true}));
   }
  }
  lab.scrollIntoView({block:'start',behavior:
   window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  feedback.textContent='Opened '+(types.find(x=>x.id===type)?.mode||'First Touch')+
   ' in Practice Lab. Settings are suggestions only; press its original Start button when ready.';
 }
 function render(){
  model.current=types.map(x=>insight(x.id));
  model.chosen=recommend(model.current);
  const damaged=model.current.filter(x=>x.unreadable);
  const excluded=model.current.reduce((sum,x)=>sum+x.excluded,0);
  integrity.textContent=damaged.length||excluded?
   'Some device-only results were excluded from training advice: '+
   (damaged.length?damaged.map(x=>types.find(t=>t.id===x.type).name)
    .join(', ')+' storage unreadable or beyond safety limits. ':'')+
   (excluded?excluded+' internally inconsistent attempt(s) ignored. ':'')+
   'Existing raw records were not modified. Review the original local drill history.':
   '';
  const all=model.current.reduce((sum,x)=>sum+x.list.length,0);
  const completed=model.current.reduce((sum,x)=>sum+x.list.filter(y=>success(y,x.type)).length,0);
  details.textContent=all?
   all+' consistent locally saved activity records · '+completed+
    ' actual targets met / wins across different drill types (not directly comparable).':
   damaged.length||excluded?'No consistent attempts available for a reliable comparison.':
   'No local activity records on this device yet.';
  cards.replaceChildren(...model.current.map(renderCard));
  nextText.textContent=model.chosen.message;
  const title=model.chosen.type==='first'?'First Touch':
   types.find(x=>x.id===model.chosen.type)?.mode||'Practice';
  launch.textContent='Open '+title+' with suggested settings →';
  exportButton.disabled=!all;
 }
 launch.onclick=()=>{
  // Same-tab native drill writes do not trigger a StorageEvent here.
  // Re-read the saved attempt receipts before advising or launching a drill.
  render();
  const choice=model.chosen;
  if(choice)openActivity(choice.type,suggestedSettings(choice.type));
 };
 viewHistory.onclick=()=>openActivity('matches',null);
 refresh.onclick=()=>{render();feedback.textContent='Updated from actual local records; no server contacted.';};
 exportButton.onclick=()=>{
  // The exported advice must represent current device evidence, not a
  // previously rendered snapshot from before a drill or another tab.
  render();
  const all=model.current.reduce((sum,x)=>sum+x.list.length,0);if(!all)return;
  const textLines=['# Fuckball · private training focus','',
   'Device-local, unverified observations only. Not ranked and not a medical or performance assessment.',
   'Exported '+new Date().toLocaleString(),
   'Only internally consistent saved attempts included; invalid or unreadable source records are neither overwritten nor claimed as success.',
   ...(integrity.textContent?[integrity.textContent]:[]),'',
   ...model.current.flatMap(x=>{
    const name=types.find(y=>y.id===x.type).name;
    return [name+': '+(x.rate===null?'No valid attempts':x.completed+'/'+x.recent.length+
     ' recent successes ('+x.rate+'%)'),formatChange(x),
     'Last recorded: '+(x.recent.length?shortDate(x.recent[0].at):'none'),''];
   }),
   'Suggested next practice: '+model.chosen.message];
  const blob=new Blob([textLines.join(String.fromCharCode(10))],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='fuckball-training-focus.md';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  feedback.textContent='Saved a private training summary. No player identity or online score was included.';
 };
 document.getElementById('tabHome')?.addEventListener('click',render);
 window.addEventListener('storage',event=>{
  if(event.key===null||Object.values(keys).includes(event.key))render();
 });
 render();
})();