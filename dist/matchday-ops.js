'use strict';
// Organiser-owned device-local planning hints, not official matches or online scores.
(function(){
 const make=(tag,value,cls)=>{
  const node=document.createElement(tag);
  if(value!==undefined&&value!==null)node.textContent=String(value);
  if(cls)node.className=cls;return node;
 };
 const btn=(label,action)=>{
  const node=make('button',label);node.type='button';
  node.addEventListener('click',action);return node;
 };
 const exportCSV=rows=>{
  const cell=v=>{
   let text=String(v??'');
   if(/^\s*[=+\-@\t\r]/.test(text))text="'"+text;
   return '"'+text.replace(/"/g,'""')+'"';
  };
  const csv='\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=make('a');link.href=url;link.download='fuckball-private-matchday-actions.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 const fixtureKey=f=>f.type+':'+(f.tournamentId||f.cupId||f.seriesId)+
  ':'+(f.fixtureId||f.matchId||f.gameId);
 const niceDate=time=>time===null?'No kickoff planned':
  new Date(time).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
 const eligible=f=>f&&f.homeScore===null&&f.active!==false&&f.unlocked!==false;
 function create({onOpenFixture,onAttendance}){
  const section=make('section',null,'matchday-ops');
  section.setAttribute('aria-label','Private matchday operations board');
  section.append(make('h3','MATCHDAY ACTION BOARD'),
   make('p','Organiser reminders from your saved private fixtures and optional 4v4 draft rosters. These are not official games, server results or confirmed player commitments.'));
  const totals=make('div',null,'matchday-ops-metrics');
  const toolbar=make('div',null,'matchday-ops-toolbar');
  const search=make('input');search.type='search';search.maxLength=90;
  search.placeholder='Find fixture or team';search.setAttribute('aria-label','Search private matchday actions');
  const filter=make('select');filter.setAttribute('aria-label','Choose action category');
  for(const [key,text] of [['all','All actions'],['overdue','Planned kickoff passed'],['unscheduled','Kickoff missing'],
   ['lineup','4v4 draft incomplete'],['soon','Kickoff within 72 hours']]){
   const option=make('option',text);option.value=key;filter.append(option);
  }
  const download=btn('↓ Complete action CSV',()=>{
   const rows=[['Category','Competition','Type','Round/Game','Home','Away','Kickoff (local)',
    'Venue','Going','Red draft','Blue draft','Organiser note','Private / unverified']];
   for(const action of actions.filter(matches))rows.push([
    action.category,action.fixture.competition,action.fixture.type,action.fixture.round,
    action.fixture.home,action.fixture.away,action.fixture.time===null?'':niceDate(action.fixture.time),
    action.fixture.venue||'',action.going,action.red,action.blue,action.description,'Yes']);
   exportCSV(rows);status.textContent='Complete filtered action CSV saved locally. No data was sent.';
  });
  toolbar.append(search,filter,download);
  const list=make('div',null,'matchday-ops-list');
  const footer=make('div',null,'matchday-ops-footer');
  const showMore=btn('Show 12 more actions',()=>{limit+=12;draw();});
  const summary=make('p',null,'matchday-ops-summary');summary.setAttribute('aria-live','polite');
  footer.append(summary,showMore);
  const status=make('p',null,'matchday-ops-status');status.setAttribute('role','status');
  section.append(totals,toolbar,list,footer,status);
  let actions=[],limit=12,selected='';
  const matches=action=>{
   const needle=search.value.trim().toLocaleLowerCase();
   const f=action.fixture;
   return (filter.value==='all'||action.category===filter.value)&&
    (!needle||[f.competition,f.home,f.away,f.venue||''].some(value=>
     value.toLocaleLowerCase().includes(needle)));
  };
  const counts=()=>{
   totals.replaceChildren();
   for(const [name,key] of [['Past kickoffs','overdue'],['No kickoff','unscheduled'],
    ['4v4 draft gaps','lineup'],['Within 72h','soon']]){
    const item=make('div',null,'matchday-ops-stat');
    item.append(make('strong',actions.filter(x=>x.category===key).length),make('span',name));
    totals.append(item);
   }
  };
  function draw(){
   const shown=actions.filter(matches);list.replaceChildren();
   for(const item of shown.slice(0,limit)){
    const f=item.fixture;
    const card=make('article',null,'matchday-ops-row');
    card.dataset.category=item.category;
    const intro=make('div',null,'matchday-ops-row-info');
    intro.append(make('small',item.label+' · '+f.type+' · '+f.competition),
     make('strong',f.home+' vs '+f.away),
     make('span',niceDate(f.time)+(f.venue?' · '+f.venue:'')),
     make('p',item.description));
    const controls=make('div',null,'matchday-ops-row-actions');
    if(item.category==='lineup'){
     controls.append(btn('Review availability',()=>onAttendance(fixtureKey(f))));
    }else if(item.category==='unscheduled'){
     controls.append(btn('Plan kickoff',()=>onOpenFixture(f,'schedule')));
    }else if(item.category==='overdue'){
     controls.append(btn('Review original fixture',()=>onOpenFixture(f,'score')));
    }else{
     controls.append(btn('Open match',()=>onOpenFixture(f,'schedule')));
    }
    card.append(intro,controls);list.append(card);
   }
   if(!shown.length)list.append(make('p',actions.length?
    'No private actions match these filters.':'No actionable private fixture reminders right now.'));
   showMore.hidden=shown.length<=limit;
   download.disabled=!shown.length;
   summary.textContent='Showing '+Math.min(shown.length,limit)+' of '+shown.length+
    ' local reminders · no results or player availability inferred from real server games.';
  }
  function render(fixtures,rosters,attendanceReadable){
   const now=Date.now(),soon=now+72*3600000;
   actions=[];const list=Array.isArray(fixtures)?fixtures:[];
   const rosterById=new Map((attendanceReadable&&Array.isArray(rosters)?rosters:[])
    .map(entry=>[entry.key,entry.people]));
   for(const f of list.filter(eligible)){
    const people=rosterById.get(fixtureKey(f))||[];
    const going=people.filter(p=>p.status==='going').length;
    const red=people.filter(p=>p.status==='going'&&p.side==='red').length;
    const blue=people.filter(p=>p.status==='going'&&p.side==='blue').length;
    const base={fixture:f,going,red,blue};
    if(f.time!==null&&f.time<now){
     actions.push({...base,category:'overdue',label:'KICKOFF TIME PASSED',
      description:'The saved kickoff is in the past, but no result was entered. This is a reminder to check your private fixture, not evidence that a game was played.'});
    }else if(f.time===null){
     actions.push({...base,category:'unscheduled',label:'NO KICKOFF SET',
      description:'This eligible fixture has no saved kickoff. Plan it in the original competition editor.'});
    }else if(f.time<=soon){
     actions.push({...base,category:'soon',label:'UPCOMING SOON',
      description:'The organiser-saved kickoff falls within the next 72 hours. Review the date and venue; participation remains unconfirmed.'});
    }
    // Optional separate 4v4 draft alert, never a live team-size requirement.
    if(attendanceReadable&&f.time!==null&&f.time>=now&&f.time<=soon&&
      (red<4||blue<4)){
     actions.push({...base,category:'lineup',label:'OPTIONAL 4v4 DRAFT',
      description:'Provisional Red '+red+'/4 · Blue '+blue+'/4 · '+going+
       ' marked Going. Finish arranging a friendly 4v4 draft if this is a 4v4 match; smaller game formats do not require eight.'});
    }
   }
   const rank={overdue:0,soon:1,lineup:2,unscheduled:3};
   actions.sort((a,b)=>rank[a.category]-rank[b.category]||
    (a.fixture.time??Infinity)-(b.fixture.time??Infinity)||
    fixtureKey(a.fixture).localeCompare(fixtureKey(b.fixture)));
   if(!attendanceReadable)status.textContent=
    'Private attendance storage is unreadable; optional 4v4 roster hints are hidden. Existing fixture data was not changed.';
   else if(status.textContent.startsWith('Private attendance storage'))status.textContent='';
   limit=12;counts();draw();
  }
  search.addEventListener('input',()=>{limit=12;draw();});
  filter.addEventListener('change',()=>{limit=12;draw();});
  return {element:section,render};
 }
 window.FuckballMatchdayOps=Object.freeze({create});
})();
