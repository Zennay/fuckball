'use strict';
// Optional, device-local progression; evidence only from native saved solo games/drills.
(function(){
 const home=document.getElementById('homeView');
 if(!home)return;
 const KEY='fuckball.solo-academy.v1',DAY=86400000,MAX=12;
 const tasks=[
  {chapter:'FIRST WHISTLE',name:'Learn the pitch',type:'touch',goal:1,
   detail:'Move, kick and score once in the existing native First Touch lesson.'},
  {chapter:'FIRST WHISTLE',name:'First finish',type:'goals',goal:1,duration:120,
   detail:'Reach at least one Goal Rush goal in a completed 2-minute drill.'},
  {chapter:'FIRST WHISTLE',name:'Teammate touch',type:'team',goal:2,duration:180,
   detail:'Complete two native teammate follow-ups in the 3-minute Teamwork drill.'},
  {chapter:'FINISHER',name:'Three on target',type:'goals',goal:3,duration:120,
   detail:'Meet the three-goal target during a completed 2-minute Goal Rush.'},
  {chapter:'FINISHER',name:'Win locally',type:'match',goal:1,
   detail:'Win a completed local match with a verified native opposing AI and no other human field players.'},
  {chapter:'FINISHER',name:'Five-goal focus',type:'goals',goal:5,duration:180,
   detail:'Meet the five-goal target during a completed 3-minute Goal Rush.'},
  {chapter:'LINK-UP',name:'Four-team chain',type:'team',goal:4,duration:180,
   detail:'Record four native follow-ups in a completed 3-minute Teamwork drill.'},
  {chapter:'LINK-UP',name:'Short burst',type:'goals',goal:3,duration:60,
   detail:'Reach three goals in one completed 60-second Goal Rush.'},
  {chapter:'LINK-UP',name:'Six-team chain',type:'team',goal:6,duration:300,
   detail:'Record six teammate follow-ups in a completed five-minute Teamwork drill.'},
  {chapter:'FINAL THIRD',name:'Quick five',type:'goals',goal:5,duration:120,
   detail:'Meet the five-goal target during a completed two-minute Goal Rush.'},
  {chapter:'FINAL THIRD',name:'Win another solo match',type:'match',goal:1,
   detail:'Win a fresh completed local match with a verified native opposing AI after arming this mission.'},
  {chapter:'FINAL THIRD',name:'Fast team six',type:'team',goal:6,duration:120,
   detail:'Complete six native team follow-ups in one two-minute Teamwork drill.'}
 ];
 const keys={goals:'fuckball-local-goal-rush-history-v1',
  team:'fuckball.teamwork-native-drill.v1',match:'fuckball.local-practice-journal.v1',
  touch:'fuckball.first-play-guide.v1'};
 const tabByType={touch:'first',goals:'goals',team:'team'};
 const make=(tag,value,cls)=>{
  const node=document.createElement(tag);
  if(value!==undefined&&value!==null)node.textContent=String(value);
  if(cls)node.className=cls;return node;
 };
 const button=(label,cb)=>{const b=make('button',label);b.type='button';b.onclick=cb;return b;};
 const validAt=n=>Number.isSafeInteger(n)&&n>0&&n<=Date.now()+DAY;
 const freshAt=(at,armed)=>validAt(at)&&at>armed&&at<=Date.now()+60000;
 function validProof(proof,index){
  if(!proof||proof.mission!==index||proof.type!==tasks[index].type||
    !validAt(proof.at)||!validAt(proof.armedAt)||proof.at<=proof.armedAt||
    proof.at-proof.armedAt<0)return false;
  return true;
 }
 function decode(raw){
  if(!raw)return null;
  let x;try{x=JSON.parse(raw);}catch{return false;}
  if(!x||x.version!==1||!validAt(x.startedAt)||!Number.isSafeInteger(x.next)||
    x.next<0||x.next>MAX||!Array.isArray(x.proofs)||x.proofs.length!==x.next||
    !x.proofs.every(validProof)||!(x.armedAt===null||validAt(x.armedAt))||
    (x.next===MAX&&x.armedAt!==null)||x.proofs.some((p,i)=>i&&p.armedAt<x.proofs[i-1].at))
   return false;
  if(x.proofs.length&&x.startedAt>x.proofs[0].armedAt)return false;
  if(x.armedAt!==null&&x.proofs.length&&x.armedAt<x.proofs.at(-1).at)return false;
  return {version:1,startedAt:x.startedAt,next:x.next,armedAt:x.armedAt,
   proofs:x.proofs.map(p=>({mission:p.mission,type:p.type,at:p.at,armedAt:p.armedAt}))};
 }
 function rawState(){try{return localStorage.getItem(KEY);}catch{return undefined;}}
 let snapshot=rawState(),state=decode(snapshot);
 const root=make('section',null,'solo-academy');
 root.setAttribute('aria-label','Offline Solo Academy campaign');
 const head=make('div',null,'solo-academy-head');
 const title=make('div');title.append(make('span','OFFLINE · REAL LOCAL GAMEPLAY','solo-academy-kicker'),
  make('h2','SOLO ACADEMY.'),make('p','12 sequential, self-paced missions across four chapters. Each mission checks a NEW saved result from the native First Touch, Goal Rush, Teamwork or solo-vs-AI mode. No badges are online rankings.'));
 const prog=make('div',null,'solo-academy-progress');
 const number=make('strong'),label=make('span');prog.append(number,label);
 head.append(title,prog);
 const chapters=make('div',null,'solo-academy-chapters');
 const active=make('section',null,'solo-academy-active');
 active.setAttribute('aria-label','Current Academy mission');
 const activeHead=make('h3'),activeDetail=make('p');
 const evidence=make('p',null,'solo-academy-evidence');
 const actions=make('div',null,'solo-academy-actions');
 const start=button('▶ Start Academy',begin);
 const arm=button('Arm this mission',armMission);
 const open=button('Open native drill →',openMode);
 const check=button('↻ Check native completion',advance);
 const exportButton=button('↓ Export private Academy record',exportRecord);
 const reset=button('Reset Academy',resetAcademy);
 actions.append(start,arm,open,check,exportButton,reset);
 const status=make('p',null,'solo-academy-status');status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 active.append(activeHead,activeDetail,evidence,actions,status);
 const foot=make('p','A new timestamped drill record is required AFTER you arm each step. Existing completed records are not reused. Drill completions come from the existing local game; solo wins require a newly saved native AI-opponent receipt, and older ambiguous results are not eligible. Team kick follow-ups are not verified passes, and solo results are unranked. The campaign never submits or changes multiplayer results.');
 root.append(head,chapters,active,foot);
 const anchor=home.querySelector('.practice-focus-coach')||
  home.querySelector('.practice-circuit')||home.querySelector('.practice-lab');
 if(anchor)anchor.insertAdjacentElement('afterend',root);else home.append(root);
 function saveState(next){
  if(!next||decode(JSON.stringify(next))===false){
   status.textContent='Cannot save invalid campaign progression.';return false;
  }
  try{
   const existing=localStorage.getItem(KEY);
   if(existing!==snapshot){
    snapshot=existing;state=decode(existing);render();
    status.textContent='The campaign changed in another tab. Latest data loaded; repeat the action.';
    return false;
   }
   const text=JSON.stringify(next);
   localStorage.setItem(KEY,text);
   snapshot=text;state=decode(text);render();return true;
  }catch{
   status.textContent='Browser storage unavailable. Campaign not changed.';return false;
  }
 }
 function begin(){
  if(state===false)return void(status.textContent='Campaign storage unreadable. Export or recover it manually before starting; it has not been overwritten.');
  if(state)return;
  if(saveState({version:1,startedAt:Date.now(),next:0,armedAt:null,proofs:[]}))
   status.textContent='Academy started. Arm the first mission and play the native lesson.';
 }
 function armMission(){
  if(!state||state===false||state.next>=MAX||state.armedAt!==null)return;
  const next={...state,armedAt:Date.now()};
  if(saveState(next))status.textContent='Mission armed. Only a fresh native result saved after now can count.';
 }
 function decodeRecord(type,row){
  if(!row||typeof row!=='object'||Array.isArray(row)||!validAt(row.at))return null;
  if(type==='goals'){
   if(![60,120,180].includes(row.duration)||![1,3,5].includes(row.target)||
    !Number.isSafeInteger(row.goals)||row.goals<0||row.goals>999||
    !Number.isSafeInteger(row.elapsed)||row.elapsed<0||row.elapsed>180||
    typeof row.completed!=='boolean')return null;
  }else if(type==='team'){
   if(![120,180,300].includes(row.seconds)||![2,4,6].includes(row.target)||
    !Number.isSafeInteger(row.links)||row.links<0||row.links>99||
    !Number.isSafeInteger(row.attempts)||row.attempts<0||row.attempts>9999||
    !Number.isSafeInteger(row.elapsed)||row.elapsed<0||row.elapsed>300||
    typeof row.completed!=='boolean')return null;
  }else if(type==='match'){
   // Legacy practice journal rows have no proof that an AI opponent was on
   // the pitch. They stay visible locally but cannot validate AI missions.
   if(row.aiOpponent!==true||
    !['bot','practice','2v2','4v4'].includes(row.mode)||![1,2].includes(row.side)||
    !Number.isSafeInteger(row.red)||row.red<0||row.red>999||
    !Number.isSafeInteger(row.blue)||row.blue<0||row.blue>999||
    !Number.isSafeInteger(row.seconds)||row.seconds<1||row.seconds>14400||
    typeof row.stadium!=='string'||row.stadium.length>48)return null;
  }else return null;
  return row;
 }
 function evidenceFor(task,armed){
  let raw;try{raw=JSON.parse(localStorage.getItem(keys[task.type])||'null');}catch{return null;}
  if(task.type==='touch'){
   return raw?.version===1&&freshAt(raw.at,armed)?raw.at:null;
  }
  const limit=task.type==='match'?30:20;
  if(!Array.isArray(raw)||raw.length>limit)return null;
  const found=raw.map(x=>decodeRecord(task.type,x)).filter(Boolean)
   .filter(x=>freshAt(x.at,armed))
   .filter(x=>{
    if(task.type==='match'){
     return x.aiOpponent===true&&(x.side===1?x.red>x.blue:x.blue>x.red);
    }
    return x.completed===true&&
     (task.type==='goals'?x.goals:x.links)>=task.goal&&
     (task.type==='goals'?x.duration:x.seconds)===task.duration;
   }).sort((a,b)=>a.at-b.at)[0];
  return found?.at??null;
 }
 function advance(){
  if(!state||state===false||state.next>=MAX||state.armedAt===null)return;
  const task=tasks[state.next],proofAt=evidenceFor(task,state.armedAt);
  if(!proofAt){
   status.textContent='No new eligible native result yet. Complete the selected lesson or drill and return here to check. Prior activity never counts.';
   return;
  }
  const next={...state,next:state.next+1,armedAt:null,
   proofs:[...state.proofs,{mission:state.next,type:task.type,armedAt:state.armedAt,at:proofAt}]};
  if(saveState(next))status.textContent=next.next===MAX?
   'All 12 locally evidenced missions completed. Your private Academy record is ready to export.':
   'Mission complete from a fresh saved local result! Arm the next step when ready.';
 }
 function openMode(){
  if(!state||state===false||state.next>=MAX)return;
  if(state.armedAt===null){
   status.textContent='Arm the mission first, then open the native training mode.';return;
  }
  const task=tasks[state.next];
  if(task.type==='match'){
   const quick=document.getElementById('quickPractice');
   quick?.scrollIntoView({block:'center'});
   quick?.focus({preventScroll:true});
   status.textContent='Choose SOLO TRAINING and finish a local match against a native AI opponent. Old journal results without verified opponents do not count.';
   return;
  }
  const lab=home.querySelector('.practice-lab-disclosure'),tab=document.getElementById('practice-lab-tab-'+tabByType[task.type]);
  if(!lab||!tab){
   status.textContent='Native Practice Lab controls are unavailable. The mission was not changed.';return;
  }
  lab.open=true;tab.click();
  if(task.type==='goals'||task.type==='team'){
   const scope=home.querySelector(task.type==='goals'?'.goal-rush-setup':'.teamwork-panel');
   const selectors=scope?.querySelectorAll('select')||[];
   const duration=String(task.duration),target=String(task.goal);
   for(const [n,wanted]of [[0,duration],[1,target]]){
    const select=selectors[n];
    if(select&&[...select.options].some(x=>x.value===wanted)){
     select.value=wanted;select.dispatchEvent(new Event('change',{bubbles:true}));
    }
   }
  }
  lab.scrollIntoView({block:'start',behavior:
   window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  status.textContent='Native '+task.name+' settings selected when supported. Press its original Start button when ready. No match was auto-started.';
 }
 function exportRecord(){
  if(!state||state===false)return;
  const packed={format:'fuckball-solo-academy',version:1,exportedAt:new Date().toISOString(),
   source:'local recorded drill evidence; non-ranked and not server-verified',
   completed:state.next,startedAt:state.startedAt,
   proofs:state.proofs.map((p,i)=>({mission:i+1,title:tasks[i].name,
    completedAt:new Date(p.at).toISOString(),kind:p.type}))};
  const blob=new Blob([JSON.stringify(packed,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=make('a');
  a.href=url;a.download='fuckball-solo-academy-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent='Private Academy record downloaded locally. This is not a verified skill rating.';
 }
 function resetAcademy(){
  if(!state||state===false)return;
  if(!confirm('Reset your private Solo Academy progress? Existing native Goal Rush, Teamwork, First Touch and match history are preserved.'))return;
  try{
   const existing=localStorage.getItem(KEY);
   if(existing!==snapshot){
    snapshot=existing;state=decode(existing);render();
    status.textContent='Another tab changed this campaign. Reload before resetting.';return;
   }
   localStorage.removeItem(KEY);snapshot=null;state=null;render();
   status.textContent='Only the Academy progress was reset. Native practice records were preserved.';
  }catch{status.textContent='Storage unavailable; no campaign progress deleted.';}
 }
 function render(){
  const done=state&&state!==false?state.next:0;
  number.textContent=done+' / '+MAX;label.textContent=done===MAX?'ACADEMY COMPLETE':'NATIVE MISSIONS';
  prog.setAttribute('role','progressbar');prog.setAttribute('aria-label','Solo Academy missions');
  prog.setAttribute('aria-valuemin','0');prog.setAttribute('aria-valuemax',String(MAX));
  prog.setAttribute('aria-valuenow',String(done));
  chapters.replaceChildren();
  for(let chapter=0;chapter<4;chapter++){
   const group=make('section',null,'solo-academy-chapter');
   const begin=chapter*3,end=begin+3;
   group.append(make('h3',(chapter+1)+' / 4 · '+tasks[begin].chapter),
    make('p',tasks.slice(begin,end).filter((_,i)=>begin+i<done).length+' of 3 missions finished'));
   const list=make('ol');
   for(let n=begin;n<end;n++){
    const item=make('li',null,'solo-academy-task');
    item.dataset.state=n<done?'complete':n===done?'current':'locked';
    item.append(make('span',n<done?'✓':n===done?'▶':'○'),
     make('strong',tasks[n].name),
     make('small',n<done?'Backed by locally saved completion':n===done?'CURRENT STEP':'Later chapter'));
    list.append(item);
   }
   group.append(list);chapters.append(group);
  }
  start.hidden=!!state;arm.hidden=open.hidden=check.hidden=!state||state===false||done>=MAX;
  reset.hidden=exportButton.hidden=!state||state===false;
  if(state===false){
   activeHead.textContent='Existing Academy data is unreadable';
   activeDetail.textContent='No local state was overwritten. Recover your browser storage manually before starting.';
   evidence.textContent='Existing native game records remain untouched.';return;
  }
  if(!state){
   activeHead.textContent='A 12-mission solo season, on your own terms';
   activeDetail.textContent='Start a private campaign, arm the first step, then play in the existing native Practice Lab.';
   evidence.textContent='No campaign has been started on this device.';return;
  }
  if(done===MAX){
   activeHead.textContent='Academy completed · all four chapters';
   activeDetail.textContent='Every mission was credited after an armed, newly timestamped native completion. Replay any existing solo mode whenever you like.';
   evidence.textContent='Finished: '+new Date(state.proofs.at(-1).at).toLocaleString();return;
  }
  const t=tasks[done];
  activeHead.textContent='MISSION '+(done+1)+' / '+MAX+' · '+t.name;
  activeDetail.textContent=t.detail;
  evidence.textContent=state.armedAt===null?
   'Not armed yet. Press Arm this mission before playing; existing history will not count.':
   'Armed '+new Date(state.armedAt).toLocaleString()+'. Complete a fresh real local drill, then Check native completion.';
  arm.hidden=state.armedAt!==null;
  open.disabled=check.disabled=state.armedAt===null;
 }
 // Nonmodal companion for genuine local play only. It never observes,
 // starts or changes an online room, and never guesses at unsaved results.
 const match=document.getElementById('matchView');
 const companion=make('aside',null,'solo-academy-companion');
 companion.hidden=true;companion.setAttribute('aria-label','Current offline Academy mission');
 const companionHeading=make('strong');
 const companionText=make('span');
 const companionButtons=make('div',null,'solo-academy-companion-actions');
 const companionClaim=button('Claim saved result',()=>{
  advance();showCompanion();
 });
 const companionHome=button('Academy ↗',()=>{
  document.getElementById('tabHome')?.click();
  root.scrollIntoView({block:'start',behavior:'auto'});
  check.focus({preventScroll:true});
 });
 companionButtons.append(companionClaim,companionHome);
 companion.append(companionHeading,companionText,companionButtons);
 match?.append(companion);
 function showCompanion(){
  const active=state&&state!==false&&state.next<MAX&&state.armedAt!==null;
  const safeLocal=typeof serverLink!=='undefined'&&!serverLink&&
   typeof peerConnected!=='undefined'&&!peerConnected&&
   typeof replay!=='undefined'&&!replay&&
   typeof started!=='undefined'&&!!started&&!match?.hidden&&!document.hidden;
  const competingHUD=!!match?.querySelector('.practice-circuit-hud:not([hidden])');
  const show=active&&safeLocal&&!competingHUD;
  if(!show){companion.hidden=true;return;}
  const task=tasks[state.next];
  const result=evidenceFor(task,state.armedAt);
  companionHeading.textContent='SOLO ACADEMY · '+(state.next+1)+' / '+MAX+' · '+task.name;
  companionText.textContent=result?
   'A matching fresh native completion is saved. Claim to advance this private campaign.':
   'Armed: '+task.detail+' Play in the original local mode; unsaved activity never counts.';
  companion.dataset.complete=result?'yes':'no';
  companionClaim.hidden=!result;
  companion.hidden=false;
 }
 if(match){
  setInterval(showCompanion,1300);
  document.getElementById('tabHome')?.addEventListener('click',()=>{companion.hidden=true;});
 }
 window.addEventListener('storage',e=>{
  if(e.key!==KEY&&e.key!==null)return;
  snapshot=rawState();state=decode(snapshot);render();
  status.textContent='Academy progress updated from another tab.';
 });
 root.addEventListener('focusin',()=>{if(state?.armedAt!==null)render();});
 render();
})();
