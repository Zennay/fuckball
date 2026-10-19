'use strict';
// Human-readable local training history; never mixes self-owned data with server career.
(function(){
 const profile=document.getElementById('careerProfileView');if(!profile)return;
 const sources={goals:'fuckball-local-goal-rush-history-v1',
  team:'fuckball.teamwork-native-drill.v1',defense:'fuckball.clean-sheet-history.v1',
  rockets:'fuckball.native-ball-burst-history.v1',
  ladders:'fuckball.ai-gauntlet-history.v1',
  matches:'fuckball.local-practice-journal.v1',
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
 const validDefense=x=>x&&validAt(x.at)&&[60,120,180].includes(x.duration)&&
  [0,1,2].includes(x.allowance)&&Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
  Number.isSafeInteger(x.scored)&&x.scored>=0&&x.scored<=999&&
  Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
  typeof x.completed==='boolean'&&x.completed===(x.conceded<=x.allowance);
 const validRocket=x=>x&&validAt(x.at)&&[60,120,180].includes(x.duration)&&
  [3,5,7].includes(x.threshold)&&[1,3,5].includes(x.target)&&
  Number.isSafeInteger(x.hits)&&x.hits>=0&&x.hits<=999&&
  Number.isSafeInteger(x.kicks)&&x.kicks>=x.hits&&x.kicks<=9999&&
  Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=x.duration+1&&
  Number.isFinite(x.peak)&&x.peak>=0&&x.peak<=1000&&
  typeof x.completed==='boolean'&&x.completed===(x.hits>=x.target);
 const ladderLevels={standard:['easy','normal','hard'],elite:['normal','hard','elite']};
 const validLadder=x=>x&&x.version===1&&Object.hasOwn(ladderLevels,x.route)&&
  [60,120].includes(x.duration)&&validAt(x.startedAt)&&validAt(x.finishedAt)&&
  x.finishedAt>=x.startedAt&&x.finishedAt-x.startedAt<=30*86400000&&
  Number.isSafeInteger(x.retries)&&x.retries>=0&&x.retries<=999&&
  Array.isArray(x.wins)&&x.wins.length===3&&x.wins.every((w,i)=>w&&
   w.level===ladderLevels[x.route][i]&&w.duration===x.duration&&validAt(w.at)&&
   w.at>=x.startedAt&&w.at<=x.finishedAt&&Number.isSafeInteger(w.for)&&
   Number.isSafeInteger(w.against)&&w.for>w.against&&w.against>=0&&w.for<=999);
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
  const defense=readRows('defense',20,validDefense);
  const rockets=readRows('rockets',20,validRocket);
  const ladders=readRows('ladders',12,validLadder);
  const pending=read('fuckball.ai-gauntlet-run.v1');
  const currentLadder=pending?.version===1&&Object.hasOwn(ladderLevels,pending.route)&&
   [60,120].includes(pending.duration)&&validAt(pending.startedAt)&&
   Array.isArray(pending.wins)&&pending.wins.length<=2&&
   pending.wins.every((w,i)=>w&&w.level===ladderLevels[pending.route][i]&&
    w.duration===pending.duration&&validAt(w.at)&&w.at>=pending.startedAt&&
    Number.isSafeInteger(w.for)&&Number.isSafeInteger(w.against)&&
    w.for>w.against&&w.against>=0&&w.for<=999)?pending:null;
  const matches=readRows('matches',30,validMatch);
  const rawFirst=read(sources.first);
  const first=rawFirst?.version===1&&validAt(rawFirst.at)?rawFirst.at:null;
  const rawAcademy=read(sources.academy);
  const academy=rawAcademy?.version===1&&
   Number.isSafeInteger(rawAcademy.next)&&rawAcademy.next>=0&&rawAcademy.next<=12&&
   Array.isArray(rawAcademy.proofs)&&rawAcademy.proofs.length===rawAcademy.next?
    rawAcademy.next:0;
  const issues=[goals.problem,team.problem,defense.problem,rockets.problem,ladders.problem,matches.problem,
   rawFirst!==null&&rawFirst!==undefined&&!first,
   rawAcademy!==null&&rawAcademy!==undefined&&academy===0].filter(Boolean).length;
  const wins=matches.entries.filter(x=>x.side===1?x.red>x.blue:x.blue>x.red);
  const draws=matches.entries.filter(x=>x.red===x.blue);
  const losses=matches.entries.length-wins.length-draws.length;
  const goalWins=goals.entries.filter(x=>x.completed===true&&x.goals>=x.target);
  const teamWins=team.entries.filter(x=>x.completed===true&&x.links>=x.target);
  const defenseWins=defense.entries.filter(x=>x.completed);
  const rocketWins=rockets.entries.filter(x=>x.completed);
  const activities=[
   ...ladders.entries.map(x=>({at:x.finishedAt,kind:'AI GAUNTLET',
    title:(x.route==='elite'?'Elite':'Standard')+' ladder · 3 genuine wins',
    detail:x.wins.map(w=>w.level+' '+w.for+'–'+w.against).join(' · ')+
     ' · '+x.duration+'s per native round · '+x.retries+' replays · device only'})),
   ...matches.entries.map(x=>({at:x.at,kind:'SOLO MATCH',
    title:(x.side===1?x.red>x.blue:x.blue>x.red)?'Win':
     x.red===x.blue?'Draw':'Loss',
    detail:x.mode.toUpperCase()+' · Red '+x.red+' – Blue '+x.blue+' · '+x.seconds+'s recorded play'})),
   ...goals.entries.map(x=>({at:x.at,kind:'GOAL RUSH',
    title:x.goals+' / '+x.target+' goals',detail:x.duration+'s · '+
     (x.completed?'Target reached':'Target not reached')})),
   ...rockets.entries.map(x=>({at:x.at,kind:'ROCKET KICK',
    title:x.hits+' / '+x.target+' qualifying native kicks',
    detail:x.kicks+' human kicks · peak '+x.peak.toFixed(1)+' raw engine ball-speed units · '+
     x.elapsed+'s active · '+(x.completed?'Goal met':'Time up')})),
   ...defense.entries.map(x=>({at:x.at,kind:'CLEAN SHEET',
    title:x.conceded+' conceded / '+x.allowance+' allowed',
    detail:x.duration+'s real active local play · '+x.scored+' scored · '+
     (x.completed?'Defensive goal met':'Defensive goal missed')})),
   ...team.entries.map(x=>({at:x.at,kind:'TEAMWORK',
    title:x.links+' / '+x.target+' native follow-ups',detail:x.seconds+
     's · '+(x.completed?'Link-up target reached':'Target not reached')})),
   ...(first?[{at:first,kind:'FIRST TOUCH',title:'Native tutorial completed',
     detail:'Moved, kicked and scored in the local first-play guide.'}]:[])
  ].sort((a,b)=>b.at-a.at);
  return {goals,team,defense,rockets,ladders,currentLadder,matches,wins,draws,losses,goalWins,teamWins,defenseWins,rocketWins,first,academy,
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
 const ladderLink=button('AI Gauntlet ↗',()=>{
  document.getElementById('tabHome')?.click();
  const disclosure=document.querySelector('.practice-lab-disclosure');
  if(disclosure)disclosure.open=true;
  document.getElementById('practice-lab-tab-ladder')?.click();
  document.querySelector('.ai-gauntlet-setup')?.scrollIntoView({block:'start',behavior:'auto'});
 });
 const insightLink=button('Practice Insights ↗',()=>{
  document.getElementById('tabHome')?.click();
  const lab=document.querySelector('.practice-lab-disclosure');
  if(lab)lab.open=true;
  const insights=document.querySelector('.practice-insights');
  if(insights){insights.open=true;insights.scrollIntoView({block:'start',behavior:'auto'});}
 });
 const exportButton=button('↓ Printable private passport',download);
 actions.append(refresh,academyLink,ladderLink,insightLink,exportButton);head.append(caption,actions);
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
  fact('Rocket Kick drills',model.rockets.entries.length,
   model.rocketWins.length+' target met · '+model.rockets.entries.reduce((n,x)=>n+x.hits,0)+' real kick bursts');
  fact('Clean Sheet drills',model.defense.entries.length,
   model.defenseWins.length+' defensive goals met · '+
    model.defense.entries.filter(x=>x.conceded===0).length+' complete clean sheets');
  fact('Teamwork drills',model.team.entries.length,
   model.teamWins.length+' target met · '+model.team.entries.reduce((a,x)=>a+x.links,0)+' native kick follow-ups');
  fact('AI Gauntlet',model.ladders.entries.length+' completed',
   model.ladders.entries.filter(x=>x.route==='elite').length+' elite ladders · '+
    (model.currentLadder?'stage '+(model.currentLadder.wins.length+1)+'/3 in progress':'no ladder in progress'));
  fact('Solo Academy',model.academy+' / 12',
   model.first?'First Touch completed '+date(model.first):'First Touch lesson not yet recorded');
  bar('Goal Rush target completion',model.goals.entries.length,model.goalWins.length,
   'Real timed scoring drills only · not official matches.');
  bar('Teamwork target completion',model.team.entries.length,model.teamWins.length,
   'Observed teammate kick follow-ups; not verified completed passes.');
  bar('Rocket Kick target completion',model.rockets.entries.length,model.rocketWins.length,
   'Observed raw native ball speed after real kicks; not real-world shot speed.');
  bar('Defensive goal completion',model.defense.entries.length,model.defenseWins.length,
   'Full-clock native local 1v1 only; counts actual conceded goals, not saves.');
  bar('Elite AI ladders',model.ladders.entries.length,
   model.ladders.entries.filter(x=>x.route==='elite').length,
   'Three native 1v1 stage wins each; unranked and local to this device.');
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
   ['Clean Sheet attempts / target met',model.defense.entries.length+' / '+model.defenseWins.length],
   ['Rocket Kick attempts / target met',model.rockets.entries.length+' / '+model.rocketWins.length],
   ['AI Gauntlet ladders / elite',model.ladders.entries.length+' / '+model.ladders.entries.filter(x=>x.route==='elite').length],
   ['Current native Gauntlet stage',model.currentLadder?(model.currentLadder.wins.length+1)+' / 3 · '+model.currentLadder.route:'Not started'],
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
