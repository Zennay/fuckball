'use strict';
// Read-only aggregate of browser-private friendly competitions. No official match claims.
(function(){
 const home=document.getElementById('homeView');if(!home)return;
 const LEAGUES='fuckball.local-tournaments.v1';
 const CUPS='fuckball.private-knockout-cups.v1';
 const SERIES='fuckball.private-series.v1';
 const dom=(tag,value,cls)=>{
  const e=document.createElement(tag);if(value!==undefined&&value!==null)e.textContent=String(value);
  if(cls)e.className=cls;return e;
 };
 const button=(text,fn)=>{
  const b=dom('button',text);b.type='button';b.onclick=fn;return b;
 };
 const cleanName=s=>typeof s==='string'&&s.length>0&&s.length<=60&&s===s.trim()&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(s);
 const safeScore=n=>n===null||(Number.isSafeInteger(n)&&n>=0&&n<=99);
 const safeTime=n=>n===null||(Number.isSafeInteger(n)&&n>=1577836800000&&n<=4102444800000);
 function read(key,maxChars,maxItems){
  const text=localStorage.getItem(key);
  if(!text)return [];
  if(text.length>maxChars)throw Error('Local competition data is unusually large.');
  const data=JSON.parse(text);
  if(!Array.isArray(data)||data.length>maxItems)throw Error('Local competition collection is invalid.');
  return data;
 }
 function league(raw){
  if(!raw||raw.version!==1||typeof raw.id!=='string'||
   !/^[a-f0-9-]{16,50}$/i.test(raw.id)||!cleanName(raw.name)||!Array.isArray(raw.teams)||
   raw.teams.length<2||raw.teams.length>12||raw.teams.some(x=>!cleanName(x))||
   new Set(raw.teams.map(x=>x.toLocaleLowerCase())).size!==raw.teams.length||
   ![1,2].includes(raw.legs)||!Array.isArray(raw.fixtures)||raw.fixtures.length>132)
   throw Error('Invalid local league.');
  const rounds=[],teams=raw.teams,seenFixtures=new Set();
  for(const x of raw.fixtures){
   if(!x||typeof x.id!=='string'||!/^r[1-9]\d*g[1-9]\d*$/.test(x.id)||
    seenFixtures.has(x.id)||!Number.isSafeInteger(x.round)||x.round<1||x.round>24||
    !Number.isSafeInteger(x.home)||!Number.isSafeInteger(x.away)||
    x.home<0||x.home>=teams.length||x.away<0||x.away>=teams.length||x.home===x.away||
    !safeScore(x.homeScore)||!safeScore(x.awayScore)||
    ((x.homeScore===null)!==(x.awayScore===null))||
    !safeTime(x.kickoff===undefined?null:x.kickoff)||
    typeof (x.venue===undefined?'':x.venue)!=='string'||
    (x.venue||'').length>60)throw Error('Invalid league fixture.');
   seenFixtures.add(x.id);
   rounds.push({...x,kickoff:x.kickoff===undefined?null:x.kickoff,venue:x.venue||''});
  }
  // Only compute a self-reported leader for a partially completed league.
  const table=teams.map((name,i)=>({name,i,pts:0,gd:0,gf:0,p:0}));
  for(const f of rounds){
   if(f.homeScore===null)continue;
   const h=table[f.home],a=table[f.away],hg=f.homeScore,ag=f.awayScore;
   h.p++;a.p++;h.gf+=hg;a.gf+=ag;h.gd+=hg-ag;a.gd+=ag-hg;
   if(hg>ag)h.pts+=3;else if(ag>hg)a.pts+=3;else{h.pts++;a.pts++;}
  }
  table.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
  const count=rounds.filter(f=>f.homeScore!==null).length;
  const allFixtures=rounds.map(f=>({
   tournamentId:raw.id,fixtureId:f.id,
   uid:raw.id+'-'+f.id,round:f.round,
   home:teams[f.home],away:teams[f.away],
   time:f.kickoff,venue:f.venue,competition:raw.name,
   homeScore:f.homeScore,awayScore:f.awayScore
  }));
  return {type:'League',id:raw.id,name:raw.name,played:count,total:rounds.length,fixtures:allFixtures,
   leader:count?table[0]?.name:null,
   upcoming:rounds.filter(f=>f.homeScore===null&&f.kickoff!==null&&f.kickoff>Date.now())
    .map(f=>({name:teams[f.home]+' vs '+teams[f.away],time:f.kickoff,
      venue:f.venue,competition:raw.name,
      uid:String(raw.id||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,50)+'-'+String(f.id||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,30)}))};
 }
 function cup(raw){
  if(!raw||raw.version!==1||typeof raw.id!=='string'||
   !/^[a-f0-9-]{16,50}$/i.test(raw.id)||
   !cleanName(raw.name)||![2,4,8,16].includes(raw.teams?.length)||
   raw.teams.some(t=>!cleanName(t))||!Array.isArray(raw.matches)||
   raw.matches.length!==raw.teams.length-1)
   throw Error('Invalid local cup.');
  const rounds=Math.log2(raw.teams.length),matches=new Map();
  for(let r=0,i=0;r<rounds;r++){
   for(let g=0;g<raw.teams.length/(2**(r+1));g++,i++){
    const m=raw.matches[i];
    if(!m||m.id!=='r'+(r+1)+'m'+(g+1)||m.round!==r||m.game!==g||
     !safeScore(m.homeScore)||!safeScore(m.awayScore)||
     !safeTime(m.kickoff===undefined?null:m.kickoff)||
     typeof (m.venue===undefined?'':m.venue)!=='string'||
     (m.venue||'').length>60||(m.venue||'')!==(m.venue||'').trim()||
     /[\u0000-\u001f\u007f-\u009f]/.test(m.venue||'')||
     ((m.homeScore===null)!==(m.awayScore===null))||
     ![null,'home','away'].includes(m.tiebreak)||
     (m.homeScore!==null&&m.homeScore===m.awayScore&&m.tiebreak===null)||
     (m.homeScore!==null&&m.homeScore!==m.awayScore&&m.tiebreak!==null))
     throw Error('Invalid local knockout fixture.');
    matches.set(m.id,m);
   }
  }
  const resolve=(r,g)=>{
   const m=matches.get('r'+(r+1)+'m'+(g+1));
   if(!m)return null;
   const h=r===0?g*2:resolve(r-1,g*2);
   const a=r===0?g*2+1:resolve(r-1,g*2+1);
   if(h===null||a===null||m.homeScore===null)return null;
   if(m.homeScore>m.awayScore)return h;
   if(m.homeScore<m.awayScore)return a;
   return m.tiebreak==='home'?h:m.tiebreak==='away'?a:null;
  };
  const cupFixtures=[];
  for(let round=0;round<rounds;round++){
   for(let game=0;game<raw.teams.length/(2**(round+1));game++){
    const match=matches.get('r'+(round+1)+'m'+(game+1));
    const home=round===0?game*2:resolve(round-1,game*2);
    const away=round===0?game*2+1:resolve(round-1,game*2+1);
    const unlocked=home!==null&&away!==null;
    if(match.homeScore!==null&&!unlocked)
     throw Error('A private cup result has missing qualifiers.');
    cupFixtures.push({
     type:'Knockout',cupId:raw.id,matchId:match.id,
     round:round+1,competition:raw.name,
     home:home===null?'Qualifying winner pending':raw.teams[home],
     away:away===null?'Qualifying winner pending':raw.teams[away],
     homeScore:match.homeScore,awayScore:match.awayScore,
     tiebreak:match.tiebreak,unlocked,time:match.kickoff===undefined?null:match.kickoff,
     venue:match.venue||'',uid:raw.id+'-'+match.id
    });
   }
  }
  const count=cupFixtures.filter(x=>x.homeScore!==null).length;
  const upcoming=cupFixtures.filter(f=>f.homeScore===null&&f.time!==null&&f.time>Date.now())
   .map(f=>({name:f.home+' vs '+f.away+' · Round '+f.round,time:f.time,venue:f.venue,
    competition:raw.name,uid:f.uid,type:'Knockout',cupId:raw.id,matchId:f.matchId}));
  const winner=resolve(rounds-1,0);
  return {type:'Knockout',id:raw.id,name:raw.name,played:count,total:matches.size,
   fixtures:cupFixtures,
   leader:winner===null?null:raw.teams[winner],upcoming};
 }
 function series(raw){
  if(!raw||raw.version!==1||typeof raw.id!=='string'||!/^[a-f0-9-]{16,50}$/i.test(raw.id)||
   !cleanName(raw.name)||!cleanName(raw.red)||!cleanName(raw.blue)||
   raw.red.length>35||raw.blue.length>35||raw.red.toLowerCase()===raw.blue.toLowerCase()||
   ![3,5,7].includes(raw.bestOf)||!Array.isArray(raw.games)||raw.games.length!==raw.bestOf)
   throw Error('Invalid private best-of series.');
  const needed=Math.floor(raw.bestOf/2)+1;
  let red=0,blue=0,recorded=0,seenEmpty=false,decided=false;
  const fixtures=[];
  for(let i=0;i<raw.bestOf;i++){
   const g=raw.games[i],time=g?.kickoff===undefined?null:g.kickoff,venue=g?.venue??'';
   if(!g||g.id!=='g'+(i+1)||!safeScore(g.redScore)||!safeScore(g.blueScore)||
     (g.redScore===null)!==(g.blueScore===null)||
     (g.redScore!==null&&g.redScore===g.blueScore)||!safeTime(time)||
     typeof venue!=='string'||venue.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(venue))
    throw Error('Invalid private best-of game.');
   if(g.redScore===null)seenEmpty=true;
   else{
    if(seenEmpty||decided)throw Error('Private best-of result order is invalid.');
    recorded++;if(g.redScore>g.blueScore)red++;else blue++;
    if(red>=needed||blue>=needed)decided=true;
   }
   fixtures.push({type:'Series',seriesId:raw.id,gameId:g.id,round:i+1,
    competition:raw.name,home:raw.red,away:raw.blue,
    homeScore:g.redScore,awayScore:g.blueScore,time,venue,unlocked:!decided&&i===recorded,
    active:!decided,uid:raw.id+'-'+g.id});
  }
  const winner=red>=needed?raw.red:blue>=needed?raw.blue:null;
  const upcoming=winner?[]:fixtures.filter(f=>f.homeScore===null&&f.time!==null&&f.time>Date.now())
   .map(f=>({name:f.home+' vs '+f.away+' · Game '+f.round,time:f.time,
    venue:f.venue,competition:raw.name,uid:f.uid,type:'Series',seriesId:raw.id,gameId:f.gameId}));
  return {type:'Series',id:raw.id,name:raw.name,total:raw.bestOf,played:recorded,
   leader:winner||(red>blue?raw.red:blue>red?raw.blue:null),winner,fixtures,upcoming};
 }
 const section=dom('section',null,'matchday-hub');
 section.setAttribute('aria-label','Private Matchday Hub');
 const details=dom('details',null,'matchday-disclosure');
 details.append(dom('summary','📋 MATCHDAY HUB · OPEN'));
 const content=dom('div',null,'matchday-body');
 const header=dom('div',null,'matchday-header');
 const lead=dom('div');
 lead.append(dom('h2','YOUR MATCHDAY.'),dom('p','One private overview of your local leagues, knockouts, best-of series and planned friendlies. All results are self-entered and not verified by game servers.'));
 const buttons=dom('div',null,'matchday-actions');
 const go=(selector)=>{
  const target=home.querySelector(selector);if(!target)return;
  const panel=target.querySelector('details');if(panel)panel.open=true;
  target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});
  target.querySelector('summary')?.focus({preventScroll:true});
 };
 buttons.append(button('🗓 Plan league rounds',()=>{
   go('.tournament-desk');
   window.dispatchEvent(new Event('fuckball:open-private-league-planner'));
  }),button('🏆 Leagues',()=>go('.tournament-desk')),
  button('🏅 Cups',()=>go('.knockout-desk')),
  button('⚔ Best-of series',()=>go('.best-of-series')),
  button('⚽ Tactics',()=>go('.formation-studio')),
  button('✓ Attendance',()=>{attendancePanel.open=true;renderAttendance();attendancePanel.scrollIntoView({block:'start'});}),
  button('↻ Refresh',()=>render()),button('↓ Complete fixture CSV',exportCSV),
  button('↓ All fixtures ICS',exportCalendar));
 header.append(lead,buttons);
 const totals=dom('div',null,'matchday-totals');
 const competitionList=dom('div',null,'matchday-competitions');
 const control=dom('section',null,'matchday-control');
 control.setAttribute('aria-label','Private league, knockout and best-of-series control center');
 const controlHeader=dom('div',null,'matchday-control-header');
 const controlIntro=dom('div');
 controlIntro.append(dom('h3','MATCHDAY CONTROL CENTER'),
  dom('p','Find league, cup and best-of-series games and open their existing private editors. Only the original editors save scores and kickoffs. Nothing here records official server outcomes.'));
 const controlTools=dom('div',null,'matchday-control-tools');
 const search=dom('input');search.type='search';search.maxLength=90;
 search.placeholder='Search league or team…';
 search.setAttribute('aria-label','Search all private fixtures and series games');
 const display=dom('select');display.setAttribute('aria-label','Filter private league fixtures');
 for(const [value,label]of [
   ['pending','Still to play'],['ready','Ready for result'],
   ['undated','League needs kickoff'],['scheduled','Scheduled ahead'],
   ['completed','Manually recorded'],['all','Every fixture']
 ])display.add(new Option(label,value));
 const refresh=button('↻ Refresh fixtures',()=>render());
 controlTools.append(search,display,refresh);
 controlHeader.append(controlIntro,controlTools);
 const controlRows=dom('div',null,'matchday-control-rows');
 const controlStatus=dom('p',null,'matchday-control-status');
 controlStatus.setAttribute('role','status');controlStatus.setAttribute('aria-live','polite');
 control.append(controlHeader,controlRows,controlStatus);
 const upcoming=dom('div',null,'matchday-upcoming');
 const note=dom('p',null,'matchday-status');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 const attendancePanel=dom('details',null,'matchday-attendance');
 attendancePanel.append(dom('summary','✓ PRIVATE MATCH ATTENDANCE · OPEN'));
 content.append(header,totals,competitionList,control,upcoming,attendancePanel,note);details.append(content);section.append(details);
 const cards=home.querySelector('.mode-cards');
 if(cards)cards.insertAdjacentElement('afterend',section);else home.append(section);
 let competitions=[],upcomingMatches=[],allUpcoming=[],failures=0,fixtureCards=[];
 const openFixture=(f,field)=>{
   if(f.type==='Series'){
     window.dispatchEvent(new CustomEvent('fuckball:open-private-series',
      {detail:{id:f.seriesId,gameId:f.gameId,field}}));
     controlStatus.textContent='Opened '+f.competition+' · Game '+f.round+
      ' in its original series editor. Scores are stored only through that editor.';
     return;
   }
   if(f.type==='Knockout')
     window.dispatchEvent(new CustomEvent('fuckball:open-private-cup-fixture',{
       detail:{cupId:f.cupId,matchId:f.matchId}
     }));
   else
     window.dispatchEvent(new CustomEvent('fuckball:open-private-league-fixture',{
       detail:{tournamentId:f.tournamentId,fixtureId:f.fixtureId,field}
     }));
   controlStatus.textContent='Opening the original private competition editor. Only its Save buttons change local results.';
 };
 function renderControl(){
   const term=search.value.trim().toLocaleLowerCase(),mode=display.value,now=Date.now();
   const matching=fixtureCards.filter(f=>
     (!term||[f.home,f.away,f.competition].some(x=>x.toLocaleLowerCase().includes(term)))&&
     (mode==='all'||
      (mode==='pending'&&f.homeScore===null&&f.active!==false)||
      (mode==='ready'&&f.homeScore===null&&f.unlocked!==false&&f.active!==false)||
      (mode==='undated'&&f.homeScore===null&&f.time===null&&f.active!==false)||
      (mode==='scheduled'&&f.homeScore===null&&f.time!==null&&f.time>=now&&f.active!==false)||
      (mode==='completed'&&f.homeScore!==null))
   );
   const ordered=matching.sort((a,b)=>{
     const at=a.time===null?Number.MAX_SAFE_INTEGER:a.time;
     const bt=b.time===null?Number.MAX_SAFE_INTEGER:b.time;
     return at-bt||a.competition.localeCompare(b.competition)||a.round-b.round;
   });
   const limit=30,visible=ordered.slice(0,limit);
   controlRows.replaceChildren();
   for(const f of visible){
     const card=dom('article',null,'matchday-control-row');
     const info=dom('div',null,'matchday-control-fixture');
     const when=(f.time===null?'Kickoff not set':
       new Date(f.time).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}))+
       (f.type==='Knockout'?(f.unlocked?' · Both qualifiers known':' · Qualifiers pending'):'');
     const result=f.homeScore===null?'Score not recorded':
       f.homeScore+' – '+f.awayScore+
       (f.tiebreak?' · '+(f.tiebreak==='home'?f.home:f.away)+' won tiebreak':'')+
       ' · self-reported';
     info.append(dom('small',f.competition+' · '+f.type+' · '+(f.type==='Series'?'Game':'Round')+' '+f.round),
       dom('strong',f.home+' vs '+f.away),
       dom('span',when+' · '+result+(f.venue?' · '+f.venue:'')));
     const actions=dom('div',null,'matchday-control-row-actions');
     actions.append(button(f.type==='Knockout'&&f.unlocked===false?'View bracket':
       f.homeScore===null?'Record score':'Edit score',()=>openFixture(f,'score')));
     actions.append(button(f.time===null?'Set kickoff':'Edit kickoff',()=>openFixture(f,'schedule')));
     if(f.type!=='Knockout'){
       actions.append(button('Poster',()=>window.dispatchEvent(
         new CustomEvent('fuckball:open-private-poster-fixture',{detail:{uid:f.uid}}))));
     }
     card.append(info,actions);controlRows.append(card);
   }
   if(!visible.length)controlRows.append(dom('p',
     fixtureCards.length?'No private fixtures match your search and filter.':
     'No local league, cup or series fixtures yet. Create a private competition first.'));
   controlStatus.textContent=matching.length+' of '+fixtureCards.length+
     ' private competition fixtures shown'+(matching.length>limit?' · first '+limit+' displayed; refine your search':'')+
     '. Scores here are never server-verified.';
 }
 search.addEventListener('input',renderControl);
 display.addEventListener('change',renderControl);
 function render(){
  let leagueData=[],cupData=[],seriesData=[];failures=0;
  try{leagueData=read(LEAGUES,128*1024,8).map(league);}catch{failures++;}
  try{cupData=read(CUPS,96*1024,8).map(cup);}catch{failures++;}
   try{seriesData=read(SERIES,128*1024,12).map(series);}catch{failures++;}
  competitions=[...leagueData,...cupData,...seriesData].sort((a,b)=>a.name.localeCompare(b.name));
  fixtureCards=[...leagueData,...cupData,...seriesData].flatMap(c=>c.fixtures);
  renderControl();
  allUpcoming=[...leagueData,...cupData,...seriesData].flatMap(c=>c.upcoming).sort((a,b)=>a.time-b.time);
  upcomingMatches=allUpcoming.slice(0,12);
  totals.replaceChildren();
  const finished=competitions.reduce((n,c)=>n+c.played,0);
  const summary=[
   ['Competitions',competitions.length],
   ['Leagues',leagueData.length],
   ['Knockouts',cupData.length],
    ['Best-of series',seriesData.length],
   ['Manual results',finished],
   ['Future kickoffs',allUpcoming.length]
  ];
  for(const [name,count]of summary){
   const box=dom('article',null,'matchday-stat');
   box.append(dom('strong',count),dom('span',name));totals.append(box);
  }
  competitionList.replaceChildren(dom('h3','SAVED COMPETITIONS'));
  if(!competitions.length)
   competitionList.append(dom('p','No readable private competitions yet. Create a league, cup or best-of series below.'));
  for(const c of competitions){
   const card=dom('article',null,'matchday-competition');
   const body=dom('div');
   body.append(dom('small',c.type.toUpperCase()),dom('strong',c.name),
    dom('p',c.played+' of '+c.total+' friendly results recorded'+
      (c.leader?' · '+(c.type==='Knockout'||c.winner?'Winner':'Current leader')+': '+c.leader:'')));
   const open=button('Open '+c.type,()=>window.dispatchEvent(
     c.type==='Series'?new CustomEvent('fuckball:open-private-series',{detail:{id:c.id}}):
     new CustomEvent('fuckball:open-private-competition',{detail:{type:c.type,id:c.id}})));
   card.append(body,open);competitionList.append(card);
  }
  upcoming.replaceChildren(dom('h3','UPCOMING PRIVATE FIXTURES'));
  if(!upcomingMatches.length)
   upcoming.append(dom('p','No future kickoff times in readable leagues, knockouts or active series. Schedule a private game first.'));
  for(const f of upcomingMatches){
   const row=dom('article',null,'matchday-upcoming-item');
   const date=new Date(f.time).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
   row.append(dom('time',date),dom('strong',f.name),
    dom('span',f.competition+(f.venue?' · '+f.venue:'')));
   if(f.type==='Series')row.append(button('Open series',()=>window.dispatchEvent(
    new CustomEvent('fuckball:open-private-series',{detail:{id:f.seriesId,gameId:f.gameId,field:'schedule'}}))));
   if(f.type==='Knockout')row.append(button('Open cup fixture',()=>window.dispatchEvent(
    new CustomEvent('fuckball:open-private-cup-fixture',{detail:{cupId:f.cupId,matchId:f.matchId}}))));
   else row.append(button('Design poster',()=>window.dispatchEvent(
    new CustomEvent('fuckball:open-private-poster-fixture',{detail:{uid:f.uid}}))));
   upcoming.append(row);
  }
  renderAttendance();
  note.textContent=(failures?'Some local competition data was invalid or unavailable and has been excluded. ':'')+
    'All outcomes are manually entered, unverified and remain on this device. No online rooms or accounts were queried.';
 }
 function exportCSV(){
  if(!competitions.length&&!upcomingMatches.length)return;
  const sanitize=x=>{
   let value=String(x);
   if(/^\s*[=+\-@]/.test(value))value="'"+value;
   return '"'+value.replace(/"/g,'""')+'"';
  };
  const rows=[['Competition type','Name','Recorded fixtures','Total fixtures','Leader or winner (manual)'],
   ...competitions.map(c=>[c.type,c.name,c.played,c.total,c.leader||''])];
  rows.push([],['Private fixture ID','Type','Competition','Round or game','Home / provisional qualifier',
   'Away / provisional qualifier','Local kickoff','UTC kickoff','Venue','Score status',
   'Self-entered home goals','Self-entered away goals','Self-entered tiebreak','Qualifiers']);
  const exported=fixtureCards.filter(f=>f.homeScore!==null||f.active!==false)
   .sort((a,b)=>(a.time??Number.MAX_SAFE_INTEGER)-(b.time??Number.MAX_SAFE_INTEGER)||
    a.competition.localeCompare(b.competition)||a.round-b.round);
  for(const f of exported){
   const id=f.fixtureId||f.matchId||f.gameId;
   rows.push([id,f.type,f.competition,f.round,f.home,f.away,
    f.time===null?'':new Date(f.time).toLocaleString(),
    f.time===null?'':new Date(f.time).toISOString(),f.venue,
    f.homeScore===null?'Not played':'Manually recorded — unverified',
    f.homeScore===null?'':f.homeScore,f.awayScore===null?'':f.awayScore,
    f.tiebreak||'',f.type==='Knockout'?(f.unlocked?'Known':'Pending'):'']);
  }
  const data='\uFEFF'+rows.map(row=>row.map(sanitize).join(',')).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a=dom('a');a.href=url;a.download='fuckball-private-matchday-complete-fixtures.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  note.textContent='Local CSV exported with '+exported.length+
   ' actual private fixture rows, including provisional cup pairings and self-entered scores. No server verification implied.';
 }
 function exportCalendar(){
  if(!allUpcoming.length)return void(note.textContent='Set a kickoff in a league, cup or active series first.');
  const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
  const date=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const fold=s=>{
   let line='',column=0;
   for(const ch of s){
    const length=new TextEncoder().encode(ch).length;
    if(column+length>72){line+='\r\n ';column=1;}
    line+=ch;column+=length;
   }
   return line;
  };
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN',
   'PRODID:-//Fuckball//Private Matchday Hub//EN'];
  const items=allUpcoming.slice(0,200);
  for(const [index,f]of items.entries()){
   const uid=(f.uid||'fixture-'+index).replace(/[^a-zA-Z0-9-]/g,'').slice(0,90);
   lines.push('BEGIN:VEVENT','UID:'+uid+'@local.fuckball',
    'DTSTAMP:'+date(Date.now()),'DTSTART:'+date(f.time),'DURATION:PT1H',
    'SUMMARY:'+escape(f.name),
    'DESCRIPTION:'+escape('Private friendly in '+f.competition+'. Not verified by game servers.'),
    ...(f.venue?['LOCATION:'+escape(f.venue)]:[]),'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const output=lines.map(fold).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([output],{type:'text/calendar;charset=utf-8'}));
  const a=dom('a');a.href=url;a.download='fuckball-private-matchday.ics';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  note.textContent=items.length+' private upcoming friendlies exported with 60-minute placeholder durations. No invitations sent.';
 }

 // Private RSVP board: only the existing validated browser-private fixtures are selectable.
 // These labels are organiser-entered, never server-sourced availability or accounts.
 const ATTENDANCE_KEY='fuckball.private-match-attendance.v1';
 const attendanceBody=dom('div',null,'matchday-attendance-body');
 attendanceBody.append(dom('h3','WHO CAN PLAY?'),
  dom('p','Organise available friends into provisional 4v4 Red and Blue lineups or a bench. The roster stays on this device; it never assigns real online room teams.'));
 const fixtureChoice=dom('select');
 fixtureChoice.setAttribute('aria-label','Choose a private fixture for availability');
 const picker=dom('label',null,'matchday-attendance-picker');
 picker.append(dom('span','SELECT MATCH'),fixtureChoice);
 const counts=dom('div',null,'matchday-attendance-counts');
 const lineupPreview=dom('div',null,'matchday-lineup-preview');
 lineupPreview.setAttribute('aria-label','Provisional private 4v4 team preview');
 const peopleView=dom('div',null,'matchday-attendance-rows');
 const form=dom('form',null,'matchday-attendance-form');
 const friend=dom('input');friend.required=true;friend.maxLength=35;friend.placeholder='Player or friend';
 friend.setAttribute('aria-label','Friend name');
 const response=dom('select');response.setAttribute('aria-label','Availability');
 for(const [v,label] of [['going','Going'],['maybe','Maybe'],['out','Cannot play']])
  response.add(new Option(label,v));
 const noteField=dom('input');noteField.maxLength=120;noteField.placeholder='Optional note';
 noteField.setAttribute('aria-label','Availability note');
 const add=dom('button','+ Add');add.type='submit';form.append(friend,response,noteField,add);
 const lineupActions=dom('div',null,'matchday-lineup-actions');
 const arrange=button('↔ Arrange available players',arrangeLineups);
 const resetDraft=button('↺ Clear draft teams',clearLineups);
 lineupActions.append(arrange,resetDraft);
 const tools=dom('div',null,'matchday-attendance-actions');
 const csv=button('↓ Attendance CSV',exportAttendanceCSV);
 const teamSheet=button('↓ Print team sheet',downloadTeamSheet);
 const copySheet=button('Copy team sheet text',copyTeamSheet);
 const backup=button('↓ Backup JSON',exportAttendanceJSON);
 const upload=dom('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;
 const restore=button('↑ Restore JSON',()=>upload.click());
 const clear=button('Clear match list',clearAttendance);
 tools.append(csv,teamSheet,copySheet,backup,restore,clear,upload);
 const info=dom('p',null,'matchday-attendance-message');
 info.setAttribute('role','status');info.setAttribute('aria-live','polite');
 attendanceBody.append(picker,counts,lineupPreview,lineupActions,peopleView,form,tools,info);
 attendancePanel.append(attendanceBody);
 const attendeeKey=f=>f.type+':'+(f.tournamentId||f.cupId||f.seriesId)+':'+(f.fixtureId||f.matchId||f.gameId);
 const attendeePattern=/^(?:League|Knockout|Series):[a-f0-9-]{16,50}:(?:r[1-9]\d*g[1-9]\d*|r[1-9]\d*m[1-9]\d*|g[1-7])$/i;
 const safeGuest=s=>typeof s==='string'&&s===s.trim()&&s.length>0&&s.length<=35&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(s);
 const safeNote=s=>typeof s==='string'&&s.length<=120&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(s);
 const choices=['going','maybe','out'];
 const lineupSides=['bench','red','blue'];
 let chosen='',rsvpRows=[],rsvpSnapshot='',rsvpAvailable=false;
 function eligible(){
  const seen=new Set();
  return fixtureCards.filter(f=>f.homeScore===null&&f.active!==false)
   .map(f=>({...f,attendanceId:attendeeKey(f)}))
   .filter(f=>attendeePattern.test(f.attendanceId)&&!seen.has(f.attendanceId)&&seen.add(f.attendanceId))
   .sort((a,b)=>(a.time??Number.MAX_SAFE_INTEGER)-(b.time??Number.MAX_SAFE_INTEGER)||
    a.competition.localeCompare(b.competition)||a.round-b.round);
 }
 function parseRSVP(raw){
  if(raw.length>1024*1024)throw Error('Backup exceeds the 1 MiB size limit');
  if(!raw)return [];
  const parsed=JSON.parse(raw);
  if(!parsed||parsed.version!==1||!Array.isArray(parsed.entries)||parsed.entries.length>200)
   throw Error('Invalid attendance backup format');
  const keys=new Set();
  for(const entry of parsed.entries){
   if(!entry||typeof entry.key!=='string'||!attendeePattern.test(entry.key)||
     keys.has(entry.key)||!Array.isArray(entry.people)||entry.people.length>24)
    throw Error('Invalid match attendance collection');
   keys.add(entry.key);
   const names=new Set();let red=0,blue=0;
   for(const p of entry.people){
    const side=p?.side===undefined?'bench':p.side;
    if(!p||!safeGuest(p.name)||!choices.includes(p.status)||!safeNote(p.note)||
      !lineupSides.includes(side)||(side!=='bench'&&p.status!=='going')||
      names.has(p.name.toLocaleLowerCase()))throw Error('Invalid private player or side');
    names.add(p.name.toLocaleLowerCase());
    if(side==='red')red++;if(side==='blue')blue++;
   }
   if(red>4||blue>4)throw Error('Private lineups are limited to four players per team');
  }
  return parsed.entries.map(e=>({key:e.key,people:e.people.map(p=>({
   name:p.name,status:p.status,note:p.note,side:p.side===undefined?'bench':p.side
  }))}));
 }
 function loadRSVP(){
  try{
   const raw=localStorage.getItem(ATTENDANCE_KEY)||'';
   const data=parseRSVP(raw);
   rsvpSnapshot=raw;rsvpRows=data;rsvpAvailable=true;return true;
  }catch{
   rsvpAvailable=false;rsvpRows=[];
   info.textContent='Existing private attendance storage is invalid or unavailable. It has not been overwritten. Restore browser storage before editing.';
   return false;
  }
 }
 function roster(){return rsvpRows.find(e=>e.key===chosen)?.people||[];}
 function changeRows(mutator){
  if(!rsvpAvailable)return false;
  try{
   if((localStorage.getItem(ATTENDANCE_KEY)||'')!==rsvpSnapshot){
    loadRSVP();renderAttendance();
    info.textContent='Another tab changed attendance. Latest data loaded; repeat your action.';
    return false;
   }
   const rows=rsvpRows.map(e=>({key:e.key,people:e.people.map(p=>({...p}))}));
   mutator(rows);
   const filtered=rows.filter(e=>e.people.length);
   const serialized=JSON.stringify({version:1,entries:filtered});
   if(serialized.length>1024*1024)throw Error('1 MiB storage limit reached');
   localStorage.setItem(ATTENDANCE_KEY,serialized);
   rsvpRows=filtered;rsvpSnapshot=serialized;
   renderAttendance();return true;
  }catch(e){
   info.textContent='Not saved: '+String(e.message||'storage unavailable')+'. Your online matches are unchanged.';
   return false;
  }
 }
 function editRoster(fn){
  if(!chosen||!eligible().some(f=>f.attendanceId===chosen))return false;
  return changeRows(rows=>{
   let entry=rows.find(e=>e.key===chosen);
   if(!entry){if(rows.length>=200)throw Error('200 match limit');
    entry={key:chosen,people:[]};rows.push(entry);}
   fn(entry.people);
  });
 }
 function renderAttendance(){
  const fixtures=eligible(),valid=new Set(fixtures.map(f=>f.attendanceId));
  if(!valid.has(chosen))chosen=fixtures[0]?.attendanceId||'';
  fixtureChoice.replaceChildren();
  for(const f of fixtures){
   const when=f.time===null?'Not scheduled':new Date(f.time).toLocaleString(undefined,{dateStyle:'short',timeStyle:'short'});
   fixtureChoice.add(new Option(f.competition+' · '+f.home+' vs '+f.away+' · '+when,f.attendanceId));
  }
  fixtureChoice.value=chosen;fixtureChoice.disabled=!fixtures.length;
  const active=!!chosen&&rsvpAvailable;
  for(const el of [friend,response,noteField,add,csv,teamSheet,copySheet,clear,arrange,resetDraft])el.disabled=!active;
  // Completed private fixtures must not make old, user-owned attendance backups inaccessible.
  backup.disabled=!rsvpAvailable;
  restore.disabled=!rsvpAvailable;
  peopleView.replaceChildren();counts.replaceChildren();lineupPreview.replaceChildren();
  const selected=roster();
  arrange.disabled=!active||selected.filter(p=>p.status==='going').length<2;
  resetDraft.disabled=!active||!selected.some(p=>p.side==='red'||p.side==='blue');
  for(const [status,label] of [['going','Going'],['maybe','Maybe'],['out','Out']])
   counts.append(dom('span',label+': '+selected.filter(p=>p.status===status).length));
  for(const [side,label] of [['red','Red'],['blue','Blue']])
   counts.append(dom('span',label+': '+selected.filter(p=>p.side===side).length+'/4'));
  counts.append(dom('span','Going on bench: '+selected.filter(p=>p.status==='going'&&p.side==='bench').length));
  for(const [side,title] of [['red','RED · DRAFT'],['blue','BLUE · DRAFT'],['bench','READY BENCH']]){
   const list=dom('ul');
   const members=selected.filter(p=>p.status==='going'&&p.side===side);
   for(const p of members)list.append(dom('li',p.name));
   if(!members.length)list.append(dom('li','No players assigned'));
   const card=dom('section',null,'matchday-lineup-card matchday-lineup-'+side);
   card.append(dom('h4',title+' · '+members.length+(side==='bench'?'':'/4')),list);
   lineupPreview.append(card);
  }
  if(!rsvpAvailable){
   peopleView.append(dom('p','No editing is allowed until unreadable local attendance data is recovered.'));return;
  }
  if(!fixtures.length)peopleView.append(dom('p','Create an unsplayed private league, cup or best-of game first.'));
  else if(!selected.length)peopleView.append(dom('p','Add friends below to track their organiser-entered availability.'));
  for(const p of selected){
   const row=dom('div',null,'matchday-attendance-row'),label=dom('strong',p.name);
   const state=dom('select');state.setAttribute('aria-label','Availability for '+p.name);
   for(const [value,name] of [['going','Going'],['maybe','Maybe'],['out','Cannot play']])
    state.add(new Option(name,value));
   state.value=p.status;
   state.addEventListener('change',()=>{
    editRoster(people=>{const target=people.find(x=>x.name===p.name);
     if(!target)throw Error('Player no longer exists');
     target.status=state.value;if(target.status!=='going')target.side='bench';});
   });
   const side=dom('select');side.setAttribute('aria-label','Provisional team for '+p.name);
   for(const [value,label] of [['bench','Bench / unassigned'],['red','Red team'],['blue','Blue team']])
    side.add(new Option(label,value));
   side.value=p.side||'bench';side.disabled=p.status!=='going';
   side.addEventListener('change',()=>{
    const newSide=side.value;
    if(newSide===(p.side||'bench'))return;
    const saved=editRoster(people=>{
     const current=people.find(x=>x.name===p.name);
     if(!current||current.status!=='going')throw Error('Only Going players can join a team');
     if(newSide!=='bench'&&people.filter(x=>x.side===newSide).length>=4)
      throw Error('Provisional '+newSide+' is already at four players');
     current.side=newSide;
    });
    if(!saved)side.value=p.side||'bench';
   });
   const note=dom('input');note.value=p.note;note.maxLength=120;
   note.placeholder='Optional note';note.setAttribute('aria-label','Note for '+p.name);
   const save=button('Save note',()=>{
    const value=note.value.trim();
    if(!safeNote(value))return void(info.textContent='Note must be 120 characters or fewer.');
    editRoster(people=>{const target=people.find(x=>x.name===p.name);
     if(!target)throw Error('Player no longer exists');target.note=value;});
   });
   const remove=button('Remove',()=>{
    if(!confirm('Remove '+p.name+' from this private match list?'))return;
    editRoster(people=>{const idx=people.findIndex(x=>x.name===p.name);
     if(idx<0)throw Error('Player no longer exists');people.splice(idx,1);});
   });
   row.append(label,state,side,note,save,remove);peopleView.append(row);
  }
  info.textContent=fixtures.length+' private unsplayed fixtures · '+selected.length+
   ' listed friends. Draft sides are not actual online room assignments.';
 }
 function arrangeLineups(){
  const eligiblePeople=roster().filter(p=>p.status==='going');
  if(eligiblePeople.length<2)return void(info.textContent='At least two Going players are needed to arrange private teams.');
  if(!confirm('Arrange up to eight Going players in saved order, alternating Red and Blue? Existing draft sides will be replaced. This does not affect a live room.'))return;
  const ok=editRoster(people=>{
   let count=0;
   for(const p of people){
    p.side=p.status==='going'&&count<8?(count++%2===0?'red':'blue'):'bench';
   }
  });
  if(ok)info.textContent='Provisional Red/Blue lineups refreshed from the Going list, not skill ratings. Remaining players stay on the bench.';
 }
 function clearLineups(){
  if(!roster().some(p=>p.side==='red'||p.side==='blue'))return;
  if(!confirm('Move everyone back to the private bench while preserving their availability and notes?'))return;
  const ok=editRoster(people=>{for(const p of people)p.side='bench';});
  if(ok)info.textContent='Private draft cleared. Availability and notes are unchanged.';
 }
 fixtureChoice.addEventListener('change',()=>{chosen=fixtureChoice.value;renderAttendance();});
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const name=friend.value.trim(),note=noteField.value.trim(),status=response.value;
  if(!safeGuest(name)||!safeNote(note)||!choices.includes(status))
   return void(info.textContent='Name must be 1–35 characters; optional note at most 120.');
  if(editRoster(people=>{
   if(people.length>=24)throw Error('24-person per-match limit');
   if(people.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))
    throw Error('Player already listed');
   people.push({name,status,note,side:'bench'});
  })){friend.value='';noteField.value='';friend.focus();}
 });
 function saveLocal(content,filename,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=dom('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 
 // Export explicitly selected organiser-owned draft only. Deliberately exclude
 // private notes, accounts, invite URLs and authenticated result claims.
 function teamSheetModel(){
  if(!rsvpAvailable||!chosen)throw Error('Select an unsplayed private fixture first');
  const fixture=eligible().find(f=>f.attendanceId===chosen);
  if(!fixture)throw Error('Selected fixture is no longer available');
  const people=roster();
  const groups=[
   {title:'RED · PROVISIONAL',members:people.filter(p=>p.status==='going'&&p.side==='red')},
   {title:'BLUE · PROVISIONAL',members:people.filter(p=>p.status==='going'&&p.side==='blue')},
   {title:'READY BENCH',members:people.filter(p=>p.status==='going'&&p.side==='bench')},
   {title:'MAYBE',members:people.filter(p=>p.status==='maybe')},
   {title:'UNAVAILABLE',members:people.filter(p=>p.status==='out')}
  ];
  return {fixture,groups,kickoff:fixture.time===null?'Not scheduled':
    new Date(fixture.time).toLocaleString(undefined,{dateStyle:'full',timeStyle:'short'}),
   venue:fixture.venue||'Not set'};
 }
 function teamSheetText(model){
  const {fixture,groups,kickoff,venue}=model;
  const lines=['FUCKBALL · PRIVATE MATCH TEAM SHEET','UNOFFICIAL / ORGANISER-ENTERED',
   fixture.competition,'Fixture: '+fixture.home+' vs '+fixture.away,
   'Kickoff: '+kickoff,'Venue: '+venue,''];
  for(const group of groups){
   lines.push(group.title+' ('+group.members.length+')');
   if(!group.members.length)lines.push('  —');
   else for(const p of group.members)lines.push('  • '+p.name);
   lines.push('');
  }
  lines.push('Draft teams only. No actual online team assignment, invitations, authenticated attendance or official results.',
   'Private notes intentionally excluded.');
  return lines.join('\n');
 }
 function teamSheetHTML(model){
  const escape=s=>String(s).replace(/[&<>"']/g,ch=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const {fixture,groups,kickoff,venue}=model;
  const cards=groups.map((group,index)=>
   '<section class="card '+['red','blue','bench','maybe','out'][index]+'">'+
   '<div class="card-head"><h2>'+escape(group.title)+'</h2><b>'+group.members.length+'</b></div>'+
   '<ul>'+(group.members.length?group.members.map(p=>'<li>'+escape(p.name)+'</li>').join(''):
   '<li class="empty">No players assigned</li>')+'</ul></section>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
   '<title>Private match team sheet</title>'+
   '<style>'+
   '*{box-sizing:border-box}body{margin:0;background:#eaf0ee;color:#142e2c;font:16px system-ui,-apple-system,sans-serif}'+
   'main{max-width:900px;margin:30px auto;background:#fff;border-radius:18px;padding:36px;box-shadow:0 12px 40px #1233}'+
   '.eyebrow{letter-spacing:.14em;text-transform:uppercase;color:#3d7167;font-size:.76rem;font-weight:900}'+
   'h1{font-size:clamp(1.6rem,4vw,2.7rem);letter-spacing:-.04em;margin:10px 0 4px}'+
   '.fixture{font-size:1.1rem;font-weight:750;margin:4px 0 18px}'+
   '.meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}.meta span{padding:9px 12px;background:#eff4f0;border-radius:8px}'+
   '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.card{border:1px solid #c7d5cc;border-radius:12px;overflow:hidden}'+
   '.card-head{padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:#e6efeb}'+
   '.red .card-head{border-left:5px solid #c8524f}.blue .card-head{border-left:5px solid #4f86cd}'+
   '.bench .card-head{border-left:5px solid #9aab43}.maybe .card-head{border-left:5px solid #cf9c51}'+
   '.out .card-head{border-left:5px solid #8c9b9b}'+
   '.card-head h2{font-size:.83rem;letter-spacing:.06em;margin:0}.card-head b{font-variant-numeric:tabular-nums}'+
   'ul{list-style:none;margin:0;padding:12px 16px}li{overflow-wrap:anywhere;padding:7px 0;border-bottom:1px solid #ecf1ee}li:last-child{border:0}'+
   '.empty{color:#737e79;font-style:italic}.foot{margin-top:24px;color:#596a63;font-size:.8rem;line-height:1.5}'+
   '@media(max-width:620px){main{margin:0;padding:20px;border-radius:0}.grid{grid-template-columns:1fr}}'+
   '@media print{body{background:white}main{margin:0;padding:0;box-shadow:none;max-width:none}.card{break-inside:avoid}.grid{gap:9px}}'+
   '</style></head><body><main><div class="eyebrow">FUCKBALL / PRIVATE GAME NIGHT</div>'+
   '<h1>'+escape(fixture.competition)+'</h1>'+
   '<p class="fixture">'+escape(fixture.home)+' vs '+escape(fixture.away)+'</p>'+
   '<div class="meta"><span>Kickoff: '+escape(kickoff)+'</span><span>Venue: '+escape(venue)+'</span></div>'+
   '<div class="grid">'+cards+'</div>'+
   '<p class="foot">UNOFFICIAL ORGANISER-ENTERED TEAM DRAFT. No verified attendance, actual online team assignment, invitations or match results. Private notes excluded. Save or print locally.</p>'+
   '</main></body></html>';
 }
 function downloadTeamSheet(){
  try{
   const model=teamSheetModel();
   saveLocal(teamSheetHTML(model),'fuckball-private-match-team-sheet.html','text/html;charset=utf-8');
   info.textContent='Printable private match team sheet downloaded. Personal notes were excluded. Opening or sharing this file is your choice.';
  }catch(e){info.textContent=String(e.message||'Unable to export team sheet');}
 }
 async function copyTeamSheet(){
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard is unavailable; download the team sheet instead');
   await navigator.clipboard.writeText(teamSheetText(teamSheetModel()));
   info.textContent='Private team sheet text copied on your request. Notes excluded; share it only with your intended players.';
  }catch(e){info.textContent='Not copied: '+String(e.message||'clipboard unavailable');}
 }

 function exportAttendanceCSV(){
  if(!chosen||!rsvpAvailable)return;
  const fixture=eligible().find(f=>f.attendanceId===chosen);if(!fixture)return;
  const cell=x=>{
   let s=String(x);if(/^\s*[=+\-@]/.test(s))s="'"+s;
   return '"'+s.replace(/"/g,'""')+'"';
  };
  const rows=[['Competition','Match','Person','Availability','Provisional side','Note'],
   ...roster().map(p=>[fixture.competition,fixture.home+' vs '+fixture.away,p.name,p.status,p.side==='red'?'Red':p.side==='blue'?'Blue':'Bench / unassigned',p.note])];
  saveLocal('\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n',
   'fuckball-private-attendance.csv','text/csv;charset=utf-8');
 }
 function exportAttendanceJSON(){
  if(!rsvpAvailable)return;
  saveLocal(JSON.stringify({version:1,entries:rsvpRows},null,2),
   'fuckball-private-attendance.json','application/json');
 }
 function clearAttendance(){
  if(!chosen||!roster().length)return;
  if(!confirm('Clear this selected private match attendance list?')||
    !confirm('Confirm permanent removal of this match list unless backed up.'))return;
  changeRows(rows=>{const i=rows.findIndex(e=>e.key===chosen);if(i>=0)rows.splice(i,1);});
 }
 upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];upload.value='';
  if(!file||!rsvpAvailable)return;
  if(file.size>1024*1024)return void(info.textContent='JSON backup exceeds 1 MiB.');
  try{
   const imported=parseRSVP(await file.text()),valid=new Set(eligible().map(f=>f.attendanceId));
   let added=0,skipped=0,benched=0;
   const applied=changeRows(rows=>{
    for(const e of imported){
     if(!valid.has(e.key)){skipped+=e.people.length;continue;}
     let target=rows.find(x=>x.key===e.key);
     if(!target){if(rows.length>=200)throw Error('200 match limit');target={key:e.key,people:[]};rows.push(target);}
     for(const p of e.people){
      if(target.people.some(x=>x.name.toLocaleLowerCase()===p.name.toLocaleLowerCase())||
        target.people.length>=24){skipped++;continue;}
      let side=p.side||'bench';
       if(side!=='bench'&&target.people.filter(x=>x.side===side).length>=4){
        side='bench';benched++;
       }
       target.people.push({...p,side});added++;
     }
    }
   });
   if(applied)info.textContent='Restored '+added+' new friends; '+skipped+
    ' skipped, '+benched+' placed on the provisional bench because their team was full. Existing names were not overwritten.';
  }catch(e){info.textContent='No data imported: '+String(e.message||'invalid JSON')+'.';}
 });
 window.addEventListener('storage',event=>{
  if(event.key!==ATTENDANCE_KEY)return;
  loadRSVP();renderAttendance();
  if(rsvpAvailable)info.textContent='Attendance updated in another tab; latest saved roster loaded.';
 });
 loadRSVP();

 details.addEventListener('toggle',()=>{if(details.open)render();});
 document.getElementById('tabHome')?.addEventListener('click',render);
 window.addEventListener('fuckball:private-competition-change',render);
 window.addEventListener('storage',event=>{if([LEAGUES,CUPS,SERIES].includes(event.key))render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&details.open)render();});
 render();
})();