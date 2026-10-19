'use strict';
// Account-scoped career overview backed by native-server match receipts only.
// No fabricated ratings, client-submitted scores, local replay inference or
// cross-account reads. The server authenticates every request.
(function(){
 const header=document.querySelector('.club-header .profile');
 if(!header)return;
 const view=document.createElement('section');view.id='careerProfileView';
 view.className='career-profile';view.hidden=true;
 view.setAttribute('aria-label','My player profile');
 const top=document.createElement('header');top.className='career-profile-head';
 const caption=document.createElement('span');caption.className='eyebrow';caption.textContent='YOUR FOOTBALL JOURNEY';
 const title=document.createElement('h1');title.textContent='MY PROFILE.';
 const subtitle=document.createElement('p');
 subtitle.textContent='Your account, real server-recorded matches and career progression. No invented rank, no client-claimed results.';
 const profileActions=document.createElement('div');profileActions.className='career-profile-actions';
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh';
 const download=document.createElement('button');download.type='button';download.textContent='↓ Export my stats';
 const games=document.createElement('button');games.type='button';games.textContent='My Games →';
 games.className='primary';
 profileActions.append(refresh,download,games);
 top.append(caption,title,subtitle,profileActions);
 const status=document.createElement('p');status.className='career-profile-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const identity=document.createElement('section');identity.className='career-identity';
 const avatar=document.createElement('span');avatar.className='career-avatar';avatar.setAttribute('aria-hidden','true');
 const who=document.createElement('div');who.className='career-identity-info';
 const name=document.createElement('h2'),identitySub=document.createElement('p');
 who.append(name,identitySub);
 const login=document.createElement('button');login.type='button';login.className='primary';
 login.textContent='Sign in / create account';
 identity.append(avatar,who,login);
 const metrics=document.createElement('div');metrics.className='career-metrics';
 const milestonesHost=document.createElement('div');milestonesHost.className='native-career-milestones-anchor';
 metrics.setAttribute('aria-label','Career match statistics');
 const formSection=document.createElement('section');formSection.className='career-form';
 formSection.setAttribute('aria-label','Recent match form and activity');formSection.hidden=true;
 const formHeading=document.createElement('h2');formHeading.textContent='MATCH FORM.';
 const formNote=document.createElement('p');formNote.textContent=
  'Recent native-server rounds only, capped at your latest 50 receipts. This is not an Elo rating or a lifetime total.';
 const formCards=document.createElement('div');formCards.className='career-form-cards';
 const formModes=document.createElement('div');formModes.className='career-form-modes';
 const formActivity=document.createElement('div');formActivity.className='career-form-activity';
 formSection.append(formHeading,formNote,formCards,formModes,formActivity);
 const modes=document.createElement('section');modes.className='career-modes';
 const mh=document.createElement('h2');mh.textContent='PLAYLIST HISTORY.';
 const modeNote=document.createElement('p');modeNote.textContent='Matches counted on this server only; these are not ranked ratings.';
 const modeRows=document.createElement('div');modeRows.className='career-mode-rows';
 modes.append(mh,modeNote,modeRows);
 const recent=document.createElement('section');recent.className='career-recent';
 const rh=document.createElement('h2');rh.textContent='RECENT MATCHES.';
 const recentNote=document.createElement('p');recentNote.textContent='Only signed-in matches stored by this server appear here. Locally saved HBR2 replays are available in My Games.';
 const recentRows=document.createElement('div');recentRows.className='career-recent-list';
 recent.append(rh,recentNote,recentRows);
 const footer=document.createElement('p');footer.className='career-profile-footnote';
 footer.textContent='Career totals may outlive the limited list of recent match receipts. Statistics depend on this server retaining its data directory; they are not global, ranked or cross-server.';
 view.append(top,status,identity,metrics,milestonesHost,formSection,modes,recent,footer);
 const main=document.querySelector('#matchView');
 (main?.parentElement||document.body).insertBefore(view,main||null);
 const open=document.createElement('button');open.type='button';open.className='career-profile-open';
 open.textContent='Profile';open.setAttribute('aria-label','Open my player profile');
 header.insertBefore(open,header.querySelector('#helpButton')||null);
 const originalShowView=showView;
 let generation=0,current=null,loadedToken=null,observedToken=settings.account?.token||null,observedUsername=settings.account?.username||null;
 showView=function(next){
  originalShowView(next);
  const visible=next==='profile';
  view.hidden=!visible;open.classList.toggle('active',visible);
  open.setAttribute('aria-current',visible?'page':'false');
  if(visible)load();
  else generation++;
 };
 open.onclick=()=>showView('profile');
 games.onclick=()=>showView('games');
 login.onclick=()=>showJoinScreen('');
 refresh.onclick=()=>load();
 download.disabled=true;
 const fmt=n=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString():'—';
 const ratio=(a,b)=>b?Math.round(a*100/b)+'%':'—';
 const outcomes={1:'RED',2:'BLUE'};
 function clear(){
  metrics.replaceChildren();milestonesHost.replaceChildren();modeRows.replaceChildren();recentRows.replaceChildren();
  formCards.replaceChildren();formModes.replaceChildren();formActivity.replaceChildren();
  formSection.hidden=true;download.disabled=true;current=null;loadedToken=null;
 }
 function metric(label,value,detail=''){
  const card=document.createElement('article');card.className='career-metric';
  const number=document.createElement('strong');number.textContent=value;
  const name=document.createElement('span');name.textContent=label;
  card.append(number,name);
  if(detail){const sub=document.createElement('small');sub.textContent=detail;card.append(sub);}
  metrics.append(card);
 }
 function renderStats(stats){
  metrics.replaceChildren();modeRows.replaceChildren();
  metric('Matches',fmt(stats.matches),'Completed server rounds');
  metric('Victories',fmt(stats.wins),ratio(stats.wins,stats.matches)+' win rate');
  metric('Draws',fmt(stats.draws));
  metric('Defeats',fmt(stats.losses));
  metric('Goals for',fmt(stats.goalsFor));
  metric('Goals against',fmt(stats.goalsAgainst));
  metric('Active minutes',fmt(Math.floor(stats.playedFrames/3600)),'Paused and bench time excluded');
  metric('Best win streak',fmt(stats.bestWinStreak));
  const total=stats.matches||0;
  const modeNames={bot:'Vs AI','1v1':'1v1','2v2':'2v2','3v3':'3v3','4v4':'4v4'};
  for(const [mode,label]of Object.entries(modeNames)){
   const count=stats.modes?.[mode]||0;
   const row=document.createElement('div');row.className='career-mode-row';
   const top=document.createElement('div');top.className='career-mode-label';
   const left=document.createElement('strong');left.textContent=label;
   const right=document.createElement('span');right.textContent=fmt(count)+' matches';
   top.append(left,right);
   const track=document.createElement('div');track.className='career-mode-track';
   track.setAttribute('role','progressbar');track.setAttribute('aria-label',label+' share of total matches');
   track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
   const width=total?Math.round(100*count/total):0;
   track.setAttribute('aria-valuenow',String(width));
   const fill=document.createElement('div');fill.style.width=width+'%';track.append(fill);
   row.append(top,track);modeRows.append(row);
  }
 }
 const formOutcomes=Object.freeze({win:'WIN',draw:'DRAW',loss:'LOSS'});
 function matchResult(entry){
  return entry.winner===0?'draw':entry.winner===entry.team?'win':'loss';
 }
 function safeReceipt(entry){
  return entry&&typeof entry==='object'&&entry.source==='native-server'&&
   entry.ranked===false&&['bot','1v1','2v2','3v3','4v4'].includes(entry.mode)&&
   [1,2].includes(entry.team)&&[0,1,2].includes(entry.winner)&&
   [entry.red,entry.blue,entry.at,entry.playedFrames].every(n=>Number.isSafeInteger(n)&&n>=0)&&
   entry.at>0&&entry.playedFrames>0&&entry.red<=999&&entry.blue<=999;
 }
 function formCard(label,value,detail){
  const card=document.createElement('div');card.className='career-form-card';
  const number=document.createElement('strong');number.textContent=value;
  const caption=document.createElement('span');caption.textContent=label;
  const description=document.createElement('small');description.textContent=detail;
  card.append(number,caption,description);formCards.append(card);
 }
 function renderForm(items){
  formCards.replaceChildren();formModes.replaceChildren();formActivity.replaceChildren();
  formSection.hidden=false;
  const ordered=items.filter(safeReceipt).sort((a,b)=>b.at-a.at).slice(0,50);
  if(!ordered.length){
   const empty=document.createElement('p');empty.className='career-no-matches';
   empty.textContent='Complete a signed-in native-server match to see your recent form.';
   formCards.append(empty);return;
  }
  const recentTen=ordered.slice(0,10);
  const countResult=(group,result)=>group.filter(m=>matchResult(m)===result).length;
  const wins=countResult(recentTen,'win'),draws=countResult(recentTen,'draw'),
   losses=countResult(recentTen,'loss');
  let streak=0,streakKind=null;
  for(const match of ordered){
   const outcome=matchResult(match);
   if(streakKind===null)streakKind=outcome;
   if(outcome!==streakKind)break;
   streak++;
  }
  const goalDifference=recentTen.reduce((sum,m)=>sum+(m.team===1?m.red-m.blue:m.blue-m.red),0);
  formCard('Last '+recentTen.length+' rounds',wins+'W · '+draws+'D · '+losses+'L',
   'Native-server results, including AI modes when played.');
  formCard('Current form streak',streak+' '+formOutcomes[streakKind]+(streak===1?'':'S'),
   'Consecutive results within the available recent receipts.');
  formCard('Goal difference',(goalDifference>0?'+':'')+goalDifference,
   'Goals scored minus conceded in those rounds.');
  const previous=ordered.slice(10,20);
  if(recentTen.length===10&&previous.length===10){
   const delta=Math.round(100*countResult(recentTen,'win')/10)-
    Math.round(100*countResult(previous,'win')/10);
   formCard('Win-rate shift',(delta>0?'+':'')+delta+' pp',
    'Latest 10 versus preceding 10 server rounds; not a skill rating.');
  }
  const formats=document.createElement('h3');formats.textContent='RECENT RESULTS BY FORMAT';
  formModes.append(formats);
  for(const mode of ['1v1','2v2','3v3','4v4','bot']){
   const games=ordered.filter(m=>m.mode===mode);
   if(!games.length)continue;
   const line=document.createElement('div');line.className='career-form-mode';
   const label=document.createElement('span');label.textContent=
    (mode==='bot'?'Vs AI':mode)+' · '+games.length+' rounds';
   const track=document.createElement('div');track.className='career-form-track';
   track.setAttribute('aria-label',games.length+' recent '+mode+' results: '+
    countResult(games,'win')+' wins, '+countResult(games,'draw')+' draws, '+
    countResult(games,'loss')+' losses');
   for(const result of ['win','draw','loss']){
    const width=100*countResult(games,result)/games.length;
    if(!width)continue;
    const bar=document.createElement('span');bar.className='career-form-'+result;
    bar.style.width=width+'%';bar.title=countResult(games,result)+' '+result;
    track.append(bar);
   }
   line.append(label,track);formModes.append(line);
  }
  const activityTitle=document.createElement('h3');activityTitle.textContent='LAST 7 DAYS';
  formActivity.append(activityTitle);
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const grid=document.createElement('div');grid.className='career-form-week';
  const days=Array.from({length:7},(_,i)=>{
   const from=new Date(today);from.setDate(today.getDate()-(6-i));
   const until=new Date(from);until.setDate(from.getDate()+1);
   return{from,until,rounds:ordered.filter(m=>m.at>=from.getTime()&&m.at<until.getTime()).length};
  });
  const max=Math.max(1,...days.map(day=>day.rounds));
  for(const day of days){
   const bar=document.createElement('div');bar.className='career-form-day';
   const column=document.createElement('span');column.className='career-form-day-column';
   const fill=document.createElement('span');fill.className='career-form-day-fill';
   fill.style.height=(day.rounds?Math.max(8,100*day.rounds/max):0)+'%';
   column.append(fill);column.title=day.rounds+' completed rounds';
   const label=document.createElement('small');label.textContent=
    day.from.toLocaleDateString(undefined,{weekday:'short'});
   const amount=document.createElement('b');amount.textContent=day.rounds;
   bar.append(column,label,amount);grid.append(bar);
  }
  formActivity.append(grid);
 }
 function renderRecent(items){
  recentRows.replaceChildren();
  if(!items.length){
   const empty=document.createElement('p');empty.className='career-no-matches';
   empty.textContent='No eligible server-recorded matches yet. Finish a room match while signed in to build your history.';
   recentRows.append(empty);return;
  }
  for(const match of items.slice(0,12)){
   const card=document.createElement('article');card.className='career-result';
   const own=match.team===1?match.red:match.blue;
   const other=match.team===1?match.blue:match.red;
   const outcome=match.winner===0?'DRAW':match.winner===match.team?'WIN':'LOSS';
   card.classList.add('career-result-'+outcome.toLowerCase());
   const badge=document.createElement('strong');badge.textContent=outcome;
   const score=document.createElement('span');score.className='career-result-score';
   score.textContent=own+' : '+other;
   const details=document.createElement('div');details.className='career-result-details';
   const label=document.createElement('b');label.textContent=match.mode+' · '+outcomes[match.team];
   const date=document.createElement('small');
   date.textContent=new Date(match.at).toLocaleString()+' · '+Math.floor(match.playedFrames/3600)+' active min';
   details.append(label,date);card.append(badge,score,details);recentRows.append(card);
  }
 }
 async function load(){
  const loadId=++generation,account=settings.account,token=account?.token;
  clear();avatar.textContent=(account?.username||'?').slice(0,1).toUpperCase();
  name.textContent=account?.username||'Guest player';
  identitySub.textContent=token?'Account on this server · server-only record':'Sign in to see your private career history.';
  login.hidden=!!token;
  if(!token){
   status.textContent='Sign in from this server to view your career. Guests can still play casual Custom Rooms.';
   modes.hidden=true;recent.hidden=true;return;
  }
  status.textContent='Loading your account career…';modes.hidden=false;recent.hidden=false;
  refresh.disabled=true;
  try{
   const headers={Authorization:'Bearer '+token};
   const [a,b]=await Promise.all([
    fetch('/api/player-stats',{headers,cache:'no-store'}),
    fetch('/api/match-history',{headers,cache:'no-store'})
   ]);
   if(loadId!==generation||settings.account?.token!==token||settings.account?.username!==account.username)return;
   if(a.status===401||b.status===401)throw Error('Session expired. Sign in again to view your stats.');
   if(!a.ok||!b.ok)throw Error('The server could not load your statistics.');
   const [statsResponse,matchesResponse]=await Promise.all([a.json(),b.json()]);
   if(loadId!==generation||settings.account?.token!==token||settings.account?.username!==account.username)return;
   if(!statsResponse?.durable||!statsResponse.stats||!matchesResponse?.durable)
    throw Error('Persistent server storage is unavailable. Local replays remain in My Games.');
   const stats=statsResponse.stats;
   if(!Number.isSafeInteger(stats.matches)||stats.matches<0||!Array.isArray(matchesResponse.items))
    throw Error('Unexpected statistics response.');
   current={stats,items:matchesResponse.items.slice(0,50),account:account.username};loadedToken=token;
   renderStats(stats);
   window.FuckballNativeCareerMilestones?.mount(milestonesHost,stats,account.username,()=>
    !!current&&current.account===account.username&&loadedToken===token&&
    settings.account?.token===token&&settings.account?.username===account.username&&!view.hidden);renderForm(current.items);renderRecent(current.items);
   download.disabled=false;
   status.textContent='Account data loaded for '+account.username+' · '+fmt(stats.matches)+
    ' server-recorded matches. Not ranked; no fabricated ratings.';
  }catch(e){if(loadId===generation){clear();status.textContent=e.message||'Career data unavailable.';}}
  finally{if(loadId===generation)refresh.disabled=false;}
 }
 // Both the menu and the export button must follow the current signed-in
 // account, even if logout happens while the Profile tab stays open.
 function accountChanged(){
  const token=settings.account?.token||null;
  const username=settings.account?.username||null;
  if(observedToken===token&&observedUsername===username)return;
  observedToken=token;observedUsername=username;
  generation++;clear();
  if(!view.hidden)load();
  else{
   avatar.textContent=(username||'?').slice(0,1).toUpperCase();
   name.textContent=username||'Guest player';
   identitySub.textContent='Open Profile to load your signed-in server history.';
  }
 }
 const accountLabel=document.getElementById('joinAccount');
 if(accountLabel)new MutationObserver(accountChanged).observe(accountLabel,
  {childList:true,subtree:true,characterData:true});
 window.addEventListener('storage',event=>{
  if(event.key!==null&&event.key!=='fuckball.settings')return;
  try{
   const stored=JSON.parse(localStorage.getItem('fuckball.settings')||'null')?.account;
   if(stored?.token!==settings.account?.token||stored?.username!==settings.account?.username){
    generation++;clear();
    status.textContent='Account changed in another tab. Reload before viewing private career data.';
    if(!view.hidden)name.textContent='Private career hidden';
   }
  }catch{
   generation++;clear();status.textContent='Account storage changed. Reload before accessing private career data.';
  }
 });
 download.onclick=()=>{
  if(!current||!loadedToken||loadedToken!==settings.account?.token||
   current.account!==settings.account?.username){
   status.textContent='Sign in and reload your own account stats before exporting.';return;
  }
  const bytes=new Blob([JSON.stringify({source:'fuckball-native-server',
   ranked:false,exportedAt:new Date().toISOString(),...current},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(bytes),link=document.createElement('a');
  link.href=url;link.download='fuckball-career-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
})();
