'use strict';
// Player-owned, device-local weekly practice plan. Observes existing native
// exercise records only; never mutates simulation, matchmaking or ratings.
(function(){
 const home=document.getElementById('homeView');
 if(!home)return;
 const PLAN_KEY='fuckball.weekly-practice-plan.v1';
 const SOURCES=[
  {id:'goals',name:'Finishing',key:'fuckball-local-goal-rush-history-v1',limit:20,tab:'goals',type:'goal'},
  {id:'team',name:'Teamwork',key:'fuckball.teamwork-native-drill.v1',limit:20,tab:'team',type:'team'},
  {id:'matches',name:'Match experience',key:'fuckball.local-practice-journal.v1',limit:30,tab:null,type:'match'}
 ];
 const defaultGoals={goals:3,team:2,matches:2};
 const FIRST_TOUCH_KEY='fuckball.first-play-guide.v1',GOAL_BEST_KEY='fuckball-local-goal-rush-v1';
 const GOAL_DURATIONS=['60','120','180'];
 function readMilestones(){
  const first=readJson(FIRST_TOUCH_KEY),best=readJson(GOAL_BEST_KEY),goalRushBest={};
  for(const duration of GOAL_DURATIONS)
   if(best&&Number.isSafeInteger(best[duration])&&best[duration]>=0&&best[duration]<=999)
    goalRushBest[duration]=best[duration];
  return{firstTouchAt:first?.version===1&&Number.isSafeInteger(first.at)&&first.at>0&&
   first.at<=Date.now()+86400000?first.at:null,goalRushBest};
 }
 function snapshotMilestones(value){
  if(value===undefined)return{firstTouchAt:null,goalRushBest:{}}; // old v1 export
  if(!value||typeof value!=='object'||Array.isArray(value)||
   !(value.firstTouchAt===null||(Number.isSafeInteger(value.firstTouchAt)&&
     value.firstTouchAt>0&&value.firstTouchAt<=Date.now()+86400000))||
   !value.goalRushBest||typeof value.goalRushBest!=='object'||
   Array.isArray(value.goalRushBest))throw Error('Invalid private practice milestones.');
  const goalRushBest={};
  for(const [duration,result] of Object.entries(value.goalRushBest)){
   if(!GOAL_DURATIONS.includes(duration)||!Number.isSafeInteger(result)||result<0||result>999)
    throw Error('Invalid Goal Rush personal best in backup.');
   goalRushBest[duration]=result;
  }
  return{firstTouchAt:value.firstTouchAt,goalRushBest};
 }

 const section=document.createElement('section');section.className='practice-weekly-plan';
 section.setAttribute('aria-label','Your private weekly practice plan');
 const top=document.createElement('div');top.className='practice-plan-top';
 const heading=document.createElement('div');
 const kicker=document.createElement('span');kicker.className='practice-plan-kicker';kicker.textContent='OFFLINE · YOUR WEEK';
 const title=document.createElement('h2');title.textContent='PRACTICE PLAN.';
 const detail=document.createElement('p');
 detail.textContent='Set weekly targets across real local drills and finished practice matches. Progress stays in this browser; this is not a verified leaderboard or competitive rank.';
 heading.append(kicker,title,detail);
 const week=document.createElement('span');week.className='practice-plan-week';
 top.append(heading,week);
 const cards=document.createElement('div');cards.className='practice-plan-cards';
 const actions=document.createElement('div');actions.className='practice-plan-actions';
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Export practice snapshot';
 const refreshButton=document.createElement('button');refreshButton.type='button';refreshButton.textContent='↻ Refresh progress';
 const notice=document.createElement('p');notice.className='practice-plan-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const importButton=document.createElement('button');importButton.type='button';
 importButton.textContent='↑ Restore practice snapshot';
 const importFile=document.createElement('input');importFile.type='file';
 importFile.accept='.json,application/json';importFile.hidden=true;
 importFile.setAttribute('aria-label','Choose private practice snapshot JSON');
 const restoreTargetLabel=document.createElement('label');
 restoreTargetLabel.className='practice-plan-restore-goals';
 const restoreTargets=document.createElement('input');restoreTargets.type='checkbox';
 restoreTargetLabel.append(restoreTargets,document.createTextNode('Restore weekly targets too'));
 actions.append(refreshButton,exportButton,importButton,restoreTargetLabel,importFile);
 const trend=document.createElement('div');trend.className='practice-plan-trend';
 const streak=document.createElement('p');streak.className='practice-plan-streak';
 section.append(top,cards,trend,streak,actions,notice);
 const anchor=home.querySelector('.practice-lab')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);
 else home.append(section);
 const cardRefs=new Map();
 const create=(tag,klass,text)=>{
  const element=document.createElement(tag);if(klass)element.className=klass;
  if(text!==undefined)element.textContent=text;return element;
 };
 function readJson(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
 }
 function validRecord(row,type){
  if(!row||typeof row!=='object'||Array.isArray(row)||
   !Number.isSafeInteger(row.at)||row.at<=0||row.at>Date.now()+86400000)return false;
  if(type==='goal')return [60,120,180].includes(row.duration)&&[1,3,5].includes(row.target)&&
   Number.isSafeInteger(row.goals)&&row.goals>=0&&row.goals<=999&&
   Number.isSafeInteger(row.elapsed)&&row.elapsed>=0&&row.elapsed<=180&&
   typeof row.completed==='boolean';
  if(type==='team')return [120,180,300].includes(row.seconds)&&[2,4,6].includes(row.target)&&
   Number.isSafeInteger(row.links)&&row.links>=0&&row.links<=99&&
   Number.isSafeInteger(row.attempts)&&row.attempts>=0&&row.attempts<=9999&&
   Number.isSafeInteger(row.elapsed)&&row.elapsed>=0&&row.elapsed<=300&&
   typeof row.completed==='boolean';
  return ['bot','practice','2v2','4v4'].includes(row.mode)&&[1,2].includes(row.side)&&
   Number.isSafeInteger(row.red)&&row.red>=0&&row.red<=999&&
   Number.isSafeInteger(row.blue)&&row.blue>=0&&row.blue<=999&&
   Number.isSafeInteger(row.seconds)&&row.seconds>0&&row.seconds<=14400&&
   typeof row.stadium==='string'&&row.stadium.length<=48;
 }
 function records(source){
  const data=readJson(source.key);
  return Array.isArray(data)?data.slice(0,source.limit).filter(row=>validRecord(row,source.type)):[];
 }
 function monday(date){
  const d=new Date(date);d.setHours(0,0,0,0);
  d.setDate(d.getDate()-(d.getDay()+6)%7);return d;
 }
 function weekStart(){return monday(new Date()).getTime();}
 function goals(){
  const value=readJson(PLAN_KEY),target={...defaultGoals};
  if(value&&value.version===1&&value.goals&&typeof value.goals==='object'){
   for(const id of Object.keys(defaultGoals))
    if(Number.isSafeInteger(value.goals[id])&&value.goals[id]>=0&&value.goals[id]<=14)
     target[id]=value.goals[id];
  }
  return target;
 }
 function persistGoal(id,value){
  const next=goals();next[id]=value;
  try{localStorage.setItem(PLAN_KEY,JSON.stringify({version:1,goals:next}));
   notice.textContent='Weekly targets saved on this device.';}
  catch{notice.textContent='Browser storage is unavailable; target not saved.';}
  render();
 }
 function openActivity(source){
  if(source.id==='matches'){
   document.getElementById('tabReplay')?.click();
   document.querySelector('.local-practice-journal')?.scrollIntoView({behavior:'smooth',block:'start'});
   return;
  }
  const lab=home.querySelector('.practice-lab-disclosure');
  if(lab)lab.open=true;
  document.getElementById('practice-lab-tab-'+source.tab)?.click();
  home.querySelector('.practice-lab')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 for(const source of SOURCES){
  const card=create('article','practice-plan-card');
  const row=create('div','practice-plan-card-head');
  const label=create('h3','',source.name);
  const value=create('strong','practice-plan-value','0 / 0');
  row.append(label,value);
  const bar=create('div','practice-plan-bar');
  bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',source.name+' sessions this week');
  bar.setAttribute('aria-valuemin','0');const fill=create('span','');
  bar.append(fill);
  const footer=create('div','practice-plan-card-footer');
  const selector=create('label','practice-plan-goal-label','Weekly goal');
  const select=document.createElement('select');select.setAttribute('aria-label','Weekly '+source.name+' target');
  for(let i=0;i<=14;i++)select.add(new Option(i===0?'No target':String(i),String(i)));
  select.onchange=()=>persistGoal(source.id,Number(select.value));
  selector.append(select);
  const start=create('button','','Open '+source.name.toLowerCase());
  start.type='button';start.onclick=()=>openActivity(source);
  footer.append(selector,start);
  const caption=create('small','practice-plan-card-caption');
  card.append(row,bar,caption,footer);cards.append(card);
  cardRefs.set(source.id,{value,bar,fill,select,caption});
 }
 function localDay(timestamp){
  const d=new Date(timestamp);return [d.getFullYear(),d.getMonth(),d.getDate()].join('-');
 }
 function render(){
  const start=weekStart(),end=start+7*86400000,targets=goals();
  const all=SOURCES.map(source=>({source,entries:records(source)}));
  const dates=[...new Set(all.flatMap(({entries})=>entries.map(e=>localDay(e.at))))];
  const thisWeek=all.reduce((sum,{entries})=>sum+entries.filter(e=>e.at>=start&&e.at<end).length,0);
  week.textContent='WEEK OF '+monday(new Date()).toLocaleDateString(undefined,{day:'numeric',month:'short'});
  let complete=0;
  for(const {source,entries} of all){
   const target=targets[source.id],count=entries.filter(e=>e.at>=start&&e.at<end).length;
   const {value,bar,fill,select,caption}=cardRefs.get(source.id);
   select.value=String(target);value.textContent=count+' / '+(target||'—');
   bar.setAttribute('aria-valuemax',String(Math.max(1,target)));
   bar.setAttribute('aria-valuenow',String(Math.min(Math.max(1,target),count)));
   fill.style.width=target?Math.min(100,Math.round(count/target*100))+'%':'0%';
   caption.textContent=target?(count>=target?'Weekly goal reached':'Sessions remaining: '+(target-count)):'No target set';
   if(target&&count>=target)complete++;
  }
  trend.replaceChildren();
  const graph=create('div','practice-plan-days');graph.setAttribute('aria-label','Local practice activity for the last seven days');
  for(let offset=6;offset>=0;offset--){
   const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-offset);
   const key=localDay(d.getTime());
   const count=all.reduce((sum,{entries})=>sum+entries.filter(e=>localDay(e.at)===key).length,0);
   const column=create('div','practice-plan-day');
   const line=create('div','practice-plan-day-bar');
   const fill=create('span','');fill.style.height=(count?Math.max(13,Math.min(100,count*24)):0)+'%';
   line.append(fill);
   const text=create('small','',d.toLocaleDateString(undefined,{weekday:'short'}));
   column.title=d.toLocaleDateString()+' · '+count+' saved local sessions';
   column.append(line,text);graph.append(column);
  }
  const summary=create('div','practice-plan-summary');
  summary.append(create('strong','',thisWeek+' saved sessions this week'),
   create('span','',complete+' / '+SOURCES.filter(x=>targets[x.id]>0).length+' targets reached'));
  trend.append(summary,graph);
  let day=new Date();day.setHours(0,0,0,0);
  let streakCount=0;
  while(dates.includes(localDay(day.getTime()))&&streakCount<30){
   streakCount++;day.setDate(day.getDate()-1);
  }
  streak.textContent=streakCount?streakCount+'-day active practice streak · saved local records only':
   'No practice saved today yet. Open a drill or complete a local match to add real progress.';
  exportButton.disabled=!all.some(x=>x.entries.length);
 }
 refreshButton.onclick=()=>{render();notice.textContent='Updated from practice records saved in this browser.';};
 exportButton.onclick=()=>{
  const streams=Object.fromEntries(SOURCES.map(x=>[x.id,records(x)]));
  if(!Object.values(streams).some(a=>a.length))return;
  const pack={format:'fuckball-personal-practice-snapshot',version:1,
   source:'device-local-unverified-practice',exportedAt:new Date().toISOString(),
   targets:goals(),sessions:streams,milestones:readMilestones(),
   note:'Personal backup only. Source records are not signed or online ranked results.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;
  link.download='fuckball-practice-snapshot-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  notice.textContent='Private practice snapshot downloaded. Nothing was uploaded.';
 };
 // Restore only exports from this local feature, never claimed as verified matches.
 function normalizeSnapshotRecord(value,source){
  if(!validRecord(value,source.type))throw Error('Backup has an invalid '+source.name+' record.');
  if(source.type==='goal')return{at:value.at,duration:value.duration,target:value.target,
   goals:value.goals,elapsed:value.elapsed,completed:value.completed};
  if(source.type==='team')return{at:value.at,seconds:value.seconds,target:value.target,
   links:value.links,attempts:value.attempts,elapsed:value.elapsed,completed:value.completed};
  const allowedFocus=['none','finishing','passing','defense','positioning','decision'];
  const focus=typeof value.focus==='string'&&allowedFocus.includes(value.focus)?value.focus:'none';
  const note=typeof value.note==='string'?value.note.slice(0,240):'';
  return{at:value.at,mode:value.mode,stadium:value.stadium,side:value.side,red:value.red,
   blue:value.blue,seconds:value.seconds,focus,note};
 }
 function targetSnapshot(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Missing saved weekly goals.');
  const result={};
  for(const key of Object.keys(defaultGoals)){
   const value=data[key];
   if(!Number.isSafeInteger(value)||value<0||value>14)
    throw Error('Invalid weekly target for '+key+'.');
   result[key]=value;
  }
  return result;
 }
 function preparedSnapshot(data){
  if(data?.format!=='fuckball-personal-practice-snapshot'||data.version!==1||
   data.source!=='device-local-unverified-practice'||!data.sessions||
   typeof data.sessions!=='object'||Array.isArray(data.sessions))
   throw Error('This is not a Fuckball local practice snapshot.');
  const targets=targetSnapshot(data.targets),streams={};
  for(const source of SOURCES){
   const list=data.sessions[source.id];
   if(!Array.isArray(list)||list.length>source.limit)
    throw Error('Backup exceeds local '+source.name+' history limit.');
   streams[source.id]=list.map(item=>normalizeSnapshotRecord(item,source));
  }
  if(Object.keys(data.sessions).some(key=>!SOURCES.some(x=>x.id===key)))
   throw Error('Unknown session type in practice backup.');
  return{targets,streams,milestones:snapshotMilestones(data.milestones)};
 }
 function mergeSnapshot(snapshot){
  const updates=new Map(),changes={};let added=0,skipped=0;
  for(const source of SOURCES){
   const current=records(source).map(e=>normalizeSnapshotRecord(e,source));
   const saved=snapshot.streams[source.id],merged=[...current],known=new Set(current.map(x=>JSON.stringify(x)));
   // Importing a snapshot never rewrites or silently discards current sessions.
   for(const record of saved){
    const signature=JSON.stringify(record);
    if(known.has(signature)){skipped++;continue;}
    if(merged.some(item=>item.at===record.at))
     throw Error('Conflicting '+source.name+' timestamp; no existing result was changed.');
    merged.push(record);known.add(signature);added++;
   }
   if(merged.length>source.limit)
    throw Error(source.name+' history is full. Export or clear old local results before restoring.');
   merged.sort((a,b)=>b.at-a.at);
   updates.set(source.key,JSON.stringify(merged));changes[source.id]=merged.length-current.length;
  }
  if(restoreTargets.checked)
   updates.set(PLAN_KEY,JSON.stringify({version:1,goals:snapshot.targets}));
  return{updates,added,skipped,changes};
 }
 async function importSnapshot(file){
  if(!file||file.size<=0||file.size>128*1024)throw Error('Choose a valid local snapshot smaller than 128 KB.');
  let parsed;try{parsed=JSON.parse(await file.text());}
  catch{throw Error('Practice snapshot is not valid JSON.');}
  const snapshot=preparedSnapshot(parsed),result=mergeSnapshot(snapshot);
  const count=result.added;
  if(!count&&!restoreTargets.checked){
   notice.textContent='All snapshot sessions are already saved locally. No changes made.';return;
  }
  const ask='Restore '+count+' new local practice session'+(count===1?'':'s')+
   (restoreTargets.checked?' and apply the saved weekly goals':'')+
   '? Existing history remains untouched. These are private, unverified practice records.';
  if(!window.confirm(ask)){notice.textContent='Practice restore cancelled.';return;}
  // localStorage offers no multi-key transaction: stage originals so quota
  // failures can be rolled back instead of hiding partially written histories.
  const originals=new Map();
  try{
   for(const key of result.updates.keys())originals.set(key,localStorage.getItem(key));
   for(const [key,value] of result.updates)localStorage.setItem(key,value);
  }catch(error){
   let rolledBack=true;
   for(const [key,original] of originals){
    try{if(original===null)localStorage.removeItem(key);else localStorage.setItem(key,original);}
    catch{rolledBack=false;}
   }
   throw Error(rolledBack?'Browser storage refused the restore; prior data was restored.':
    'Browser storage failed and rollback could not be guaranteed. Inspect your local journals before retrying.');
  }
  render();
  notice.textContent='Imported '+count+' private practice session'+(count===1?'':'s')+
   (result.skipped?' · '+result.skipped+' duplicates skipped':'')+
   (restoreTargets.checked?' · weekly goals restored':'')+'. No server upload.';
 }
 importButton.onclick=()=>importFile.click();
 importFile.addEventListener('change',async()=>{
  const file=importFile.files?.[0];importFile.value='';if(!file)return;
  importButton.disabled=true;
  try{await importSnapshot(file);}
  catch(error){notice.textContent='Practice restore refused: '+(error.message||'invalid snapshot');}
  finally{importButton.disabled=false;}
 });
 home.addEventListener('focusin',render);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 window.addEventListener('storage',e=>{if(e.key===PLAN_KEY||SOURCES.some(s=>s.key===e.key))render();});
 window.setInterval(()=>{if(!document.hidden&&!home.hidden)render();},15000);
 render();
})();