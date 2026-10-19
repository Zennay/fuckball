'use strict';
// UTC-stable player-owned week of genuine offline native drill options.
// This is a shared *schedule*, never a server challenge or a result claim.
(function(){
 const host=document.querySelector('.practice-lab-content');
 if(!host||!document.querySelector('.challenge-exchange'))return;
 const DAY=86400000;
 const CONFIG=[
  {id:'goals',name:'Goal Rush',selector:'.goal-rush-setup',params:[['duration',[60,120,180]],['target',[1,3,5]]],store:'fuckball-local-goal-rush-history-v1',fields:['duration','target']},
  {id:'team',name:'Teamwork',selector:'.teamwork-panel',params:[['duration',[120,180,300]],['target',[2,4,6]]],store:'fuckball.teamwork-native-drill.v1',fields:['seconds','target']},
  {id:'defense',name:'Clean Sheet',selector:'.clean-sheet-setup',params:[['duration',[60,120,180]],['allowance',[0,1,2]]],store:'fuckball.clean-sheet-history.v1',fields:['duration','allowance']},
  {id:'rockets',name:'Rocket Kick',selector:'.native-ball-burst',params:[['duration',[60,120,180]],['threshold',[3,5,7]],['target',[1,3,5]]],store:'fuckball.native-ball-burst-history.v1',fields:['duration','threshold','target']},
  {id:'comeback',name:'Comeback Arena',selector:'.comeback-arena',params:[['deficit',[1,2,3]],['duration',[60,120,180]]],store:'fuckball.native-comeback-arena.v1',fields:['deficit','duration']}
 ].filter(x=>document.querySelector(x.selector));
 if(!CONFIG.length)return;
 const el=(tag,t,cls)=>{const n=document.createElement(tag);
  if(t!==undefined&&t!==null)n.textContent=String(t);
  if(cls)n.className=cls;return n;};
 const wrap=el('details',null,'daily-practice');
 const summary=el('summary','DAILY PRACTICE · 7-DAY OFFLINE CHALLENGE BOARD');
 const intro=el('p','One deterministic UTC-day exercise from the real offline engine, with no account, matchmaking or leaderboard. Everyone with the same game version sees the same suggested options; only a completed native drill can create local attempt history.');
 const badge=el('p',null,'daily-practice-badge');badge.setAttribute('role','status');
 const grid=el('div',null,'daily-practice-grid');
 const actions=el('div',null,'daily-practice-actions');
 const csv=el('button','↓ Save 7-day practice plan (.csv)');
 const refresh=el('button','↻ Update day');csv.type=refresh.type='button';
 const status=el('p',null,'daily-practice-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 actions.append(csv,refresh);wrap.append(summary,intro,badge,grid,actions,status);
 const exchange=host.querySelector('.challenge-exchange');
 exchange.insertAdjacentElement('afterend',wrap);
 const isoDay=n=>new Date(n*DAY).toISOString().slice(0,10);
 const today=()=>Math.floor(Date.now()/DAY);
 let displayed=-1;
 // The same numbered UTC day always selects the same native options.
 function mission(day){
  const idx=((day%CONFIG.length)+CONFIG.length)%CONFIG.length,def=CONFIG[idx];
  const options={};def.params.forEach(([key,values],i)=>{
   options[key]=values[((day*7+idx*11+i*5)%values.length+values.length)%values.length];
  });
  return{version:1,mode:def.id,name:'UTC Daily Practice · '+isoDay(day)+' · '+def.name,options};
 }
 function link(item){
  const url=new URL(location.pathname,location.origin);url.hash=
   'practice-challenge='+encodeURIComponent(JSON.stringify(item));return url.href;
 }
 function matchesLocal(day,item){
  const def=CONFIG.find(c=>c.id===item.mode);
  try{
   const data=JSON.parse(localStorage.getItem(def.store)||'[]');
   if(!Array.isArray(data)||data.length>20)return null;
   const start=day*DAY,end=start+DAY;
   const found=data.filter(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||
     !Number.isSafeInteger(row.at)||row.at<start||row.at>=end||
     row.at>Date.now()+DAY||typeof row.completed!=='boolean')return false;
    return def.fields.every((field,index)=>row[field]===item.options[def.params[index][0]]);
   });
   return{attempts:found.length,met:found.filter(row=>row.completed).length};
  }catch{return null;}
 }
 function prepare(item){
  const def=CONFIG.find(c=>c.id===item.mode),card=document.querySelector(def.selector);
  const fields=card?.querySelectorAll('label select');
  if(!card||!fields||fields.length<def.params.length){
   status.textContent='This native drill is unavailable; no match started.';return;
  }
  for(const [index,[key]] of def.params.entries()){
   if(![...fields[index].options].some(o=>o.value===String(item.options[key]))){
    status.textContent='This native drill no longer supports these parameters.';return;
   }
  }
  for(const [index,[key]] of def.params.entries()){
   fields[index].value=String(item.options[key]);
   fields[index].dispatchEvent(new Event('change',{bubbles:true}));
  }
  const lab=document.querySelector('.practice-lab-disclosure');if(lab)lab.open=true;
  document.getElementById('practice-lab-tab-'+def.id)?.click();
  card.scrollIntoView({block:'nearest',behavior:'auto'});
  card.querySelector('button.primary')?.focus({preventScroll:true});
  status.textContent=item.name+' prepared. Press the real START button when ready.';
 }
 async function copy(item){
  const url=link(item);
  try{
   if(!navigator.clipboard?.writeText)throw Error('No clipboard');
   await navigator.clipboard.writeText(url);
   status.textContent='Daily challenge link copied. No account or results shared.';
  }catch{
   const input=el('textarea');input.value=url;input.rows=2;
   input.setAttribute('aria-label','Copy daily challenge link');
   status.replaceChildren(el('span','Copy this challenge URL: '),input);
   input.focus();input.select();
  }
 }
 function render(force=false){
  const now=today();if(now===displayed&&!force)return;
  displayed=now;grid.replaceChildren();
  badge.textContent='TODAY '+isoDay(now)+' UTC · offline, unranked suggestions';
  for(let offset=0;offset<7;offset++){
   const day=now+offset,item=mission(day),def=CONFIG.find(x=>x.id===item.mode);
   const card=el('article',null,'daily-practice-card');
   if(offset===0)card.classList.add('daily-practice-today');
   const title=el('strong',(offset===0?'TODAY · ':offset===1?'TOMORROW · ':'DAY '+(offset+1)+' · ')+isoDay(day));
   const mode=el('h3',def.name);
   const info=el('p',def.params.map(([k])=>k+': '+item.options[k]).join(' · '));
   const rec=matchesLocal(day,item);
   const evidence=el('small',rec?
    rec.attempts+' matching retained local attempt'+(rec.attempts===1?'':'s')+
    ', '+rec.met+' objective'+(rec.met===1?'':'s')+' met':
    'Local history unavailable');
   evidence.title='Matching native offline settings and UTC date only; not proof a daily challenge link was used.';
   const actions=el('div',null,'daily-practice-card-actions');
   const go=el('button','Prepare native drill'),share=el('button','Copy challenge');
   go.type=share.type='button';
   go.onclick=()=>prepare(item);share.onclick=()=>copy(item);
   actions.append(go,share);card.append(title,mode,info,evidence,actions);grid.append(card);
  }
 }
 function csvEscape(value){return '"'+String(value).replace(/"/g,'""')+'"';}
 csv.onclick=()=>{
  const rows=[['UTC date','Native drill','Settings','Purpose']];
  for(let i=0;i<7;i++){const item=mission(today()+i);
   rows.push([isoDay(today()+i),CONFIG.find(x=>x.id===item.mode).name,
    Object.entries(item.options).map(([k,v])=>k+'='+v).join('; '),'Device-only offline objective, not verified competition']);
  }
  const data='\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a=el('a');a.href=url;a.download='fuckball-seven-day-native-practice.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  status.textContent='7-day native practice plan saved; no account or result data included.';
 };
 refresh.onclick=()=>{render(true);status.textContent='Updated for UTC day '+isoDay(today())+'.';};
 wrap.addEventListener('toggle',()=>{if(wrap.open)render(true);});
 window.addEventListener('storage',event=>{if(wrap.open&&CONFIG.some(x=>x.store===event.key))render(true);});
 render();
 setInterval(()=>{if(wrap.open)render();},60000);
})();