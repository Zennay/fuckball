'use strict';
// Human-readable local training history; never mixes self-owned data with server career.
(function(){
 const profile=document.getElementById('careerProfileView');if(!profile)return;
 const sources={goals:'fuckball-local-goal-rush-history-v1',
  team:'fuckball.teamwork-native-drill.v1',matches:'fuckball.local-practice-journal.v1',
  first:'fuckball.first-play-guide.v1',academy:'fuckball.solo-academy.v1'};
 const el=(tag,text,klass)=>{
  const n=document.createElement(tag);
  if(text!==undefined&&text!==null)n.textContent=String(text);
  if(klass)n.className=klass;return n;
 };
 const button=(label,cb)=>{const b=el('button',label);b.type='button';b.onclick=cb;return b;};
 const validAt=n=>Number.isSafeInteger(n)&&n>0&&n<=Date.now()+86400000;
 const date=n=>new Date(n).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
 const htmlEscape=x=>String(x??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=key=>{
  try{const raw=localStorage.getItem(key);
   return raw===null?null:JSON.parse(raw);
  }catch{return undefined;}
 };
 const validGoal=x=>x&&validAt(x.at)&&[60,120,180].includes(x.duration)&&
  [1,3,5].includes(x.target)&&Number.isSafeInteger(x.goals)&&x.goals>=0&&x.goals<=999&&
  Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=180&&
  typeof x.completed==='boolean';
 const validTeam=x=>x&&validAt(x.at)&&[120,180,300].includes(x.seconds)&&
  [2,4,6].includes(x.target)&&Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&
  Number.isSafeInteger(x.attempts)&&x.attempts>=0&&x.attempts<=9999&&
  Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=300&&
  typeof x.completed==='boolean';
 const validMatch=x=>x&&validAt(x.at)&&['bot','practice','2v2','4v4'].includes(x.mode)&&
  [1,2].includes(x.side)&&Number.isSafeInteger(x.red)&&x.red>=0&&x.red<=999&&
  Number.isSafeInteger(x.blue)&&x.blue>=0&&x.blue<=999&&
  Number.isSafeInteger(x.seconds)&&x.seconds>=1&&x.seconds<=14400&&
  typeof x.stadium==='string'&&x.stadium.length<=48;
 const readRows=(id,max,validator)=>{
  const raw=read(sources[id]);
  if(raw===null)return {entries:[],problem:false};
  if(!Array.isArray(raw)||raw.length>max)return {entries:[],problem:true};
  const entries=raw.filter(validator);
  return {entries,problem:entries.length!==raw.length};
 };
 function load(){
  const goals=readRows('goals',20,validGoal);
  const team=readRows('team',20,validTeam);
  const matches=readRows('matches',30,validMatch);
  const rawFirst=read(sources.first);
  const first=rawFirst?.version===1&&validAt(rawFirst.at)?rawFirst.at:null;
  const rawAcademy=read(sources.academy);
  const academy=rawAcademy?.version===1&&
   Number.isSafeInteger(rawAcademy.next)&&rawAcademy.next>=0&&rawAcademy.next<=12&&
   Array.isArray(rawAcademy.proofs)&&rawAcademy.proofs.length===rawAcademy.next?
    rawAcademy.next:0;
  const issues=[goals.problem,team.problem,matches.problem,
   rawFirst!==null&&rawFirst!==undefined&&!first,
   rawAcademy!==null&&rawAcademy!==undefined&&academy===0].filter(Boolean).length;
  const wins=matches.entries.filter(x=>x.side===1?x.red>x.blue:x.blue>x.red);
  const draws=matches.entries.filter(x=>x.red===x.blue);
  const losses=matches.entries.length-wins.length-draws.length;
  const goalWins=goals.entries.filter(x=>x.completed===true&&x.goals>=x.target);
  const teamWins=team.entries.filter(x=>x.completed===true&&x.links>=x.target);
  const activities=[
   ...matches.entries.map(x=>({at:x.at,kind:'SOLO MATCH',
    title:(x.side===1?x.red>x.blue:x.blue>x.red)?'Win':
     x.red===x.blue?'Draw':'Loss',
    detail:x.mode.toUpperCase()+' · Red '+x.red+' – Blue '+x.blue+' · '+x.seconds+'s recorded play'})),
   ...goals.entries.map(x=>({at:x.at,kind:'GOAL RUSH',
    title:x.goals+' / '+x.target+' goals',detail:x.duration+'s · '+
     (x.completed?'Target reached':'Target not reached')})),
   ...team.entries.map(x=>({at:x.at,kind:'TEAMWORK',
    title:x.links+' / '+x.target+' native follow-ups',detail:x.seconds+
     's · '+(x.completed?'Link-up target reached':'Target not reached')})),
   ...(first?[{at:first,kind:'FIRST TOUCH',title:'Native tutorial completed',
     detail:'Moved, kicked and scored in the local first-play guide.'}]:[])
  ].sort((a,b)=>b.at-a.at);
  return {goals,team,matches,wins,draws,losses,goalWins,teamWins,first,academy,
   activities,issues};
 }
 const root=el('section',null,'offline-passport');
 root.setAttribute('aria-label','Offline personal training passport');
 const head=el('div',null,'offline-passport-head');
 const caption=el('div');
 caption.append(el('span','THIS DEVICE · NOT RANKED','offline-passport-kicker'),
  el('h2','OFFLINE PLAYER PASSPORT.'),
  el('p','Your real native solo practice results in one profile. These browser-only observations are not server ratings, verified assists or global achievements.'));
 const actions=el('div',null,'offline-passport-actions');
 const refresh=button('↻ Refresh local results',render);
 const academyLink=button('Solo Academy ↗',()=>{
  document.getElementById('tabHome')?.click();
  const academy=document.querySelector('.solo-academy');
  academy?.scrollIntoView({block:'start',behavior:'auto'});
 });
 const exportButton=button('↓ Printable private passport',download);
 actions.append(refresh,academyLink,exportButton);head.append(caption,actions);
 const facts=el('div',null,'offline-passport-facts');
 const sections=el('div',null,'offline-passport-sections');
 const formPanel=el('section',null,'offline-passport-form');
 formPanel.append(el('h3','REAL RECENT LOCAL ACTIVITY'));
 const timeline=el('ol',null,'offline-passport-timeline');
 formPanel.append(timeline);
 const footer=el('p','Drill goals and team follow-ups are recorded by existing native offline game modes. No server ranking, opponent identity, account tokens, IP address or HBR2 replay files are collected. Sharing a printed copy is your choice.');
 const status=el('p',null,'offline-passport-status');status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 root.append(head,facts,sections,formPanel,footer,status);
 const anchor=profile.querySelector('.local-vault')||profile.querySelector('.career-profile-footnote');
 if(anchor)anchor.insertAdjacentElement('beforebegin',root);else profile.append(root);
 let model=null;
 function fact(name,value,subtext){
  const box=el('article',null,'offline-passport-fact');
  box.append(el('strong',value),el('span',name),el('small',subtext));facts.append(box);
 }
 function bar(title,total,successes,sub){
  const block=el('article',null,'offline-passport-bar');
  const titleRow=el('div');titleRow.append(el('strong',title),el('span',successes+' / '+total));
  const track=el('div',null,'offline-passport-track');
  const fill=el('div');fill.style.width=total?Math.round(100*successes/total)+'%':'0%';
  track.append(fill);
  block.append(titleRow,track,el('p',sub));sections.append(block);
 }
 function render(){
  model=load();
  facts.replaceChildren();sections.replaceChildren();timeline.replaceChildren();
  fact('Real local games',model.matches.entries.length,
   model.wins.length+' wins · '+model.draws.length+' draws · '+model.losses+' losses');
  fact('Goal Rush sessions',model.goals.entries.length,
   model.goalWins.length+' target met · '+model.goals.entries.reduce((a,x)=>a+x.goals,0)+' actual goals');
  fact('Teamwork drills',model.team.entries.length,
   model.teamWins.length+' target met · '+model.team.entries.reduce((a,x)=>a+x.links,0)+' native kick follow-ups');
  fact('Solo Academy',model.academy+' / 12',
   model.first?'First Touch completed '+date(model.first):'First Touch lesson not yet recorded');
  bar('Goal Rush target completion',model.goals.entries.length,model.goalWins.length,
   'Real timed scoring drills only · not official matches.');
  bar('Teamwork target completion',model.team.entries.length,model.teamWins.length,
   'Observed teammate kick follow-ups; not verified completed passes.');
  bar('Solo-vs-AI wins',model.matches.entries.length,model.wins.length,
   'Genuine local finished games; no Elo or ranked matchmaking.');
  for(const row of model.activities.slice(0,16)){
   const li=el('li',null,'offline-passport-entry');
   li.append(el('time',date(row.at)),el('strong',row.kind+' · '+row.title),
    el('span',row.detail));timeline.append(li);
  }
  if(!model.activities.length)timeline.append(el('li','No native local practice results on this device yet.'));
  status.textContent=(model.issues?model.issues+' unreadable or incomplete data source(s) excluded. ':'')+
   'Showing '+Math.min(model.activities.length,16)+' most recent locally recorded activities. Download contains all retained records in this overview.';
  exportButton.disabled=!model.activities.length&&!model.academy;
 }
 function download(){
  if(!model)return;
  if(!confirm('Download a printable PRIVATE offline training summary? It includes your local match and drill history, not account credentials.'))return;
  const facts=[
   ['Local matches',model.matches.entries.length],
   ['Wins / Draws / Losses',model.wins.length+' / '+model.draws.length+' / '+model.losses],
   ['Goal Rush attempts / target met',model.goals.entries.length+' / '+model.goalWins.length],
   ['Teamwork attempts / target met',model.team.entries.length+' / '+model.teamWins.length],
   ['Solo Academy missions',model.academy+' / 12']
  ];
  const rows=model.activities.map(row=>'<tr><td>'+htmlEscape(date(row.at))+'</td><td>'+
   htmlEscape(row.kind)+'</td><td>'+htmlEscape(row.title)+'</td><td>'+
   htmlEscape(row.detail)+'</td></tr>').join('');
  const data='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
   '<title>Fuckball — private offline player passport</title><style>'+
   'body{font:14px system-ui,sans-serif;max-width:1050px;margin:32px auto;padding:0 20px;color:#19352e}'+
   'h1{font-size:26px}p{line-height:1.6}table{width:100%;border-collapse:collapse;font-size:12px}'+
   'th,td{border:1px solid #aabdb2;padding:9px;text-align:left;overflow-wrap:anywhere;vertical-align:top}'+
   'th{background:#e6ede7}tr{break-inside:avoid}@media print{body{margin:0}}'+
   '</style></head><body><h1>Private offline player passport</h1>'+
   '<p>Locally recorded native solo practice only. Not a ranked rating, official server receipt or proof of skill.</p>'+
   '<table><tbody>'+facts.map(x=>'<tr><th>'+htmlEscape(x[0])+'</th><td>'+
    htmlEscape(x[1])+'</td></tr>').join('')+'</tbody></table>'+
   '<h2>Recorded local activities</h2><table><thead><tr><th>Date</th><th>Mode</th>'+
   '<th>Recorded result</th><th>Context</th></tr></thead><tbody>'+rows+
   '</tbody></table></body></html>';
  const url=URL.createObjectURL(new Blob([data],{type:'text/html;charset=utf-8'}));
  const link=el('a');link.href=url;link.download='fuckball-private-offline-passport.html';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent='Printable offline passport saved locally. No data was uploaded.';
 }
 window.addEventListener('storage',e=>{
  if(e.key===null||Object.values(sources).includes(e.key))render();
 });
 document.querySelector('.career-profile-open')?.addEventListener('click',render);
 render();
})();
