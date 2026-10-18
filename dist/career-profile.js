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
 metrics.setAttribute('aria-label','Career match statistics');
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
 view.append(top,status,identity,metrics,modes,recent,footer);
 const main=document.querySelector('#matchView');
 (main?.parentElement||document.body).insertBefore(view,main||null);
 const open=document.createElement('button');open.type='button';open.className='career-profile-open';
 open.textContent='Profile';open.setAttribute('aria-label','Open my player profile');
 header.insertBefore(open,header.querySelector('#helpButton')||null);
 const originalShowView=showView;
 let generation=0,current=null;
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
  metrics.replaceChildren();modeRows.replaceChildren();recentRows.replaceChildren();
  download.disabled=true;current=null;
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
   if(loadId!==generation||settings.account?.token!==token)return;
   if(a.status===401||b.status===401)throw Error('Session expired. Sign in again to view your stats.');
   if(!a.ok||!b.ok)throw Error('The server could not load your statistics.');
   const [statsResponse,matchesResponse]=await Promise.all([a.json(),b.json()]);
   if(loadId!==generation||settings.account?.token!==token)return;
   if(!statsResponse?.durable||!statsResponse.stats||!matchesResponse?.durable)
    throw Error('Persistent server storage is unavailable. Local replays remain in My Games.');
   const stats=statsResponse.stats;
   if(!Number.isSafeInteger(stats.matches)||stats.matches<0||!Array.isArray(matchesResponse.items))
    throw Error('Unexpected statistics response.');
   current={stats,items:matchesResponse.items.slice(0,50),account:account.username};
   renderStats(stats);renderRecent(current.items);
   download.disabled=false;
   status.textContent='Account data loaded for '+account.username+' · '+fmt(stats.matches)+
    ' server-recorded matches. Not ranked; no fabricated ratings.';
  }catch(e){if(loadId===generation){clear();status.textContent=e.message||'Career data unavailable.';}}
  finally{if(loadId===generation)refresh.disabled=false;}
 }
 download.onclick=()=>{
  if(!current)return;
  const bytes=new Blob([JSON.stringify({source:'fuckball-native-server',
   ranked:false,exportedAt:new Date().toISOString(),...current},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(bytes),link=document.createElement('a');
  link.href=url;link.download='fuckball-career-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
})();
