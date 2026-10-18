'use strict';
// Read-only aggregate of browser-private friendly competitions. No official match claims.
(function(){
 const home=document.getElementById('homeView');if(!home)return;
 const LEAGUES='fuckball.local-tournaments.v1';
 const CUPS='fuckball.private-knockout-cups.v1';
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
     tiebreak:match.tiebreak,unlocked,time:null,venue:''
    });
   }
  }
  const count=cupFixtures.filter(x=>x.homeScore!==null).length;
  const winner=resolve(rounds-1,0);
  return {type:'Knockout',id:raw.id,name:raw.name,played:count,total:matches.size,
   fixtures:cupFixtures,
   leader:winner===null?null:raw.teams[winner],upcoming:[]};
 }
 const section=dom('section',null,'matchday-hub');
 section.setAttribute('aria-label','Private Matchday Hub');
 const details=dom('details',null,'matchday-disclosure');
 details.append(dom('summary','📋 MATCHDAY HUB · OPEN'));
 const content=dom('div',null,'matchday-body');
 const header=dom('div',null,'matchday-header');
 const lead=dom('div');
 lead.append(dom('h2','YOUR MATCHDAY.'),dom('p','One private overview of your local leagues, knockouts and planned friendlies. All results are self-entered and not verified by game servers.'));
 const buttons=dom('div',null,'matchday-actions');
 const go=(selector)=>{
  const target=home.querySelector(selector);if(!target)return;
  const panel=target.querySelector('details');if(panel)panel.open=true;
  target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});
  target.querySelector('summary')?.focus({preventScroll:true});
 };
 buttons.append(button('🏆 Leagues',()=>go('.tournament-desk')),
  button('🏅 Cups',()=>go('.knockout-desk')),
  button('⚽ Tactics',()=>go('.formation-studio')),
  button('↻ Refresh',()=>render()),button('↓ Overview CSV',exportCSV),
  button('↓ All fixtures ICS',exportCalendar));
 header.append(lead,buttons);
 const totals=dom('div',null,'matchday-totals');
 const competitionList=dom('div',null,'matchday-competitions');
 const control=dom('section',null,'matchday-control');
 control.setAttribute('aria-label','Private league and knockout fixture control center');
 const controlHeader=dom('div',null,'matchday-control-header');
 const controlIntro=dom('div');
 controlIntro.append(dom('h3','MATCHDAY CONTROL CENTER'),
  dom('p','Find private league and knockout fixtures, enter self-reported results in the existing competition editors, or schedule league kickoffs. Nothing here records official server outcomes.'));
 const controlTools=dom('div',null,'matchday-control-tools');
 const search=dom('input');search.type='search';search.maxLength=90;
 search.placeholder='Search league or team…';
 search.setAttribute('aria-label','Search private league fixtures');
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
 content.append(header,totals,competitionList,control,upcoming,note);details.append(content);section.append(details);
 const cards=home.querySelector('.mode-cards');
 if(cards)cards.insertAdjacentElement('afterend',section);else home.append(section);
 let competitions=[],upcomingMatches=[],allUpcoming=[],failures=0,fixtureCards=[];
 const openFixture=(f,field)=>{
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
      (mode==='pending'&&f.homeScore===null)||
      (mode==='ready'&&f.homeScore===null&&f.unlocked!==false)||
      (mode==='undated'&&f.type!=='Knockout'&&f.homeScore===null&&f.time===null)||
      (mode==='scheduled'&&f.type!=='Knockout'&&f.homeScore===null&&f.time!==null&&f.time>=now)||
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
     const when=f.type==='Knockout'?
       (f.unlocked?'Both qualifiers known':'Waiting for previous round'):
       f.time===null?'Kickoff not set':
       new Date(f.time).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
     const result=f.homeScore===null?'Score not recorded':
       f.homeScore+' – '+f.awayScore+
       (f.tiebreak?' · '+(f.tiebreak==='home'?f.home:f.away)+' won tiebreak':'')+
       ' · self-reported';
     info.append(dom('small',f.competition+' · '+f.type+' · Round '+f.round),
       dom('strong',f.home+' vs '+f.away),
       dom('span',when+' · '+result+(f.venue?' · '+f.venue:'')));
     const actions=dom('div',null,'matchday-control-row-actions');
     actions.append(button(f.type==='Knockout'&&f.unlocked===false?'View bracket':
       f.homeScore===null?'Record score':'Edit score',()=>openFixture(f,'score')));
     if(f.type!=='Knockout'){
       actions.append(button(f.time===null?'Set kickoff':'Edit kickoff',()=>openFixture(f,'schedule')));
       actions.append(button('Poster',()=>window.dispatchEvent(
         new CustomEvent('fuckball:open-private-poster-fixture',{detail:{uid:f.uid}}))));
     }
     card.append(info,actions);controlRows.append(card);
   }
   if(!visible.length)controlRows.append(dom('p',
     fixtureCards.length?'No private fixtures match your search and filter.':
     'No local league or cup fixtures yet. Create a tournament or knockout cup first.'));
   controlStatus.textContent=matching.length+' of '+fixtureCards.length+
     ' private competition fixtures shown'+(matching.length>limit?' · first '+limit+' displayed; refine your search':'')+
     '. Scores here are never server-verified.';
 }
 search.addEventListener('input',renderControl);
 display.addEventListener('change',renderControl);
 function render(){
  let leagueData=[],cupData=[];failures=0;
  try{leagueData=read(LEAGUES,128*1024,8).map(league);}catch{failures++;}
  try{cupData=read(CUPS,96*1024,8).map(cup);}catch{failures++;}
  competitions=[...leagueData,...cupData].sort((a,b)=>a.name.localeCompare(b.name));
  fixtureCards=[...leagueData,...cupData].flatMap(c=>c.fixtures);
  renderControl();
  allUpcoming=leagueData.flatMap(c=>c.upcoming).sort((a,b)=>a.time-b.time);
  upcomingMatches=allUpcoming.slice(0,12);
  totals.replaceChildren();
  const finished=competitions.reduce((n,c)=>n+c.played,0);
  const summary=[
   ['Competitions',competitions.length],
   ['Leagues',leagueData.length],
   ['Knockouts',cupData.length],
   ['Manual results',finished],
   ['Future kickoffs',allUpcoming.length]
  ];
  for(const [name,count]of summary){
   const box=dom('article',null,'matchday-stat');
   box.append(dom('strong',count),dom('span',name));totals.append(box);
  }
  competitionList.replaceChildren(dom('h3','SAVED COMPETITIONS'));
  if(!competitions.length)
   competitionList.append(dom('p','No readable private competitions yet. Create a league or knockout cup below.'));
  for(const c of competitions){
   const card=dom('article',null,'matchday-competition');
   const body=dom('div');
   body.append(dom('small',c.type.toUpperCase()),dom('strong',c.name),
    dom('p',c.played+' of '+c.total+' friendly results recorded'+
      (c.leader?' · '+(c.type==='Knockout'?'Winner':'Current leader')+': '+c.leader:'')));
   const open=button('Open '+c.type,()=>window.dispatchEvent(
     new CustomEvent('fuckball:open-private-competition',{detail:{type:c.type,id:c.id}})));
   card.append(body,open);competitionList.append(card);
  }
  upcoming.replaceChildren(dom('h3','UPCOMING PRIVATE FIXTURES'));
  if(!upcomingMatches.length)
   upcoming.append(dom('p','No future kickoff times set in your local leagues. Add a time in the fixture calendar below.'));
  for(const f of upcomingMatches){
   const row=dom('article',null,'matchday-upcoming-item');
   const date=new Date(f.time).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
   row.append(dom('time',date),dom('strong',f.name),
    dom('span',f.competition+(f.venue?' · '+f.venue:'')));
   row.append(button('Design poster',()=>window.dispatchEvent(
    new CustomEvent('fuckball:open-private-poster-fixture',{detail:{uid:f.uid}}))));
   upcoming.append(row);
  }
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
  rows.push([],['Upcoming fixture','Competition','Local kickoff','Venue']);
  for(const f of upcomingMatches)rows.push([f.name,f.competition,new Date(f.time).toLocaleString(),f.venue]);
  const data='\uFEFF'+rows.map(row=>row.map(sanitize).join(',')).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a=dom('a');a.href=url;a.download='fuckball-private-matchday-overview.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  note.textContent='Local, unofficial competition overview saved to CSV.';
 }
 function exportCalendar(){
  if(!allUpcoming.length)return void(note.textContent='Set a kickoff in a private league first.');
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
 details.addEventListener('toggle',()=>{if(details.open)render();});
 document.getElementById('tabHome')?.addEventListener('click',render);
 window.addEventListener('fuckball:private-competition-change',render);
 window.addEventListener('storage',event=>{if(event.key===LEAGUES||event.key===CUPS)render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&details.open)render();});
 render();
})();