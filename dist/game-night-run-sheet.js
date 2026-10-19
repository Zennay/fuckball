'use strict';
// A private, print-friendly day programme built only from saved organiser fixtures.
(function(){
 const make=(tag,text,cls)=>{
  const el=document.createElement(tag);if(text!==undefined&&text!==null)el.textContent=String(text);
  if(cls)el.className=cls;return el;
 };
 const button=(text,fn)=>{const b=make('button',text);b.type='button';b.onclick=fn;return b;};
 const dateKey=n=>{
  const d=new Date(n),pad=v=>String(v).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 };
 const timeText=n=>new Date(n).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
 const localDay=day=>new Date(day+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'long',month:'long',year:'numeric'});
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const key=f=>f.type+':'+(f.tournamentId||f.cupId||f.seriesId)+':'+(f.fixtureId||f.matchId||f.gameId);
 const finalScore=f=>Number.isSafeInteger(f.homeScore)&&Number.isSafeInteger(f.awayScore);
 function create({onOpenFixture,onAttendance}){
  const section=make('section',null,'game-night-run-sheet');
  section.setAttribute('aria-label','Private game night run sheet');
  section.append(make('h3','GAME NIGHT RUN SHEET'),
   make('p','One printable day programme from the dates and venues you saved. Match durations and player arrival are not verified. No invites or online match results are generated.'));
  const controls=make('div',null,'game-night-run-controls');
  const select=make('select');select.setAttribute('aria-label','Choose saved private fixture date');
  const selectWrap=make('label','Game day');selectWrap.append(select);
  const includeNames=make('input');includeNames.type='checkbox';
  const namesLabel=make('label',null,'game-night-run-private');
  namesLabel.append(includeNames,make('span','Include privately saved Going player names in print'));
  const printButton=button('↓ Print-ready HTML',savePrint);
  controls.append(selectWrap,namesLabel,printButton);
  const metrics=make('div',null,'game-night-run-stats');
  const list=make('div',null,'game-night-run-list');
  const status=make('p',null,'game-night-run-status');status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  section.append(controls,metrics,list,status);
  let fixtures=[],rosters=new Map(),readable=true;
  function chosen(){return fixtures.filter(f=>dateKey(f.time)===select.value);}
  function lookup(f){
   const people=rosters.get(key(f))||[];
   return {people,going:people.filter(p=>p.status==='going'),
    maybe:people.filter(p=>p.status==='maybe'),out:people.filter(p=>p.status==='out')};
  }
  function refresh(){
   const items=chosen();list.replaceChildren();metrics.replaceChildren();
   const recorded=items.filter(finalScore).length;
   const venues=new Set(items.filter(f=>f.venue).map(f=>f.venue.toLocaleLowerCase())).size;
   const plans=[['Fixtures',items.length],['Entered scores',recorded],
    ['Unplayed',items.length-recorded],['Named venues',venues]];
   for(const [name,number]of plans){
    const box=make('div',null,'game-night-run-stat');
    box.append(make('strong',number),make('span',name));metrics.append(box);
   }
   for(const f of items.slice(0,30)){
    const row=make('article',null,'game-night-run-row');
    const time=make('time',timeText(f.time));
    const info=make('div',null,'game-night-run-info');
    info.append(make('small',f.type+' · '+f.competition+' · '+(f.type==='Series'?'Game':'Round')+' '+f.round),
     make('strong',f.home+' vs '+f.away),
     make('span',(f.venue||'Venue not entered')+' · '+
      (finalScore(f)?'Manual score '+f.homeScore+'–'+f.awayScore:'Score not entered')));
    const counts=make('span',null,'game-night-run-attendance');
    if(readable&&!finalScore(f)&&f.active!==false){
     const people=lookup(f);
     counts.textContent='Private RSVP: '+people.going.length+' Going, '+
      people.maybe.length+' Maybe, '+people.out.length+' Out';
     if(includeNames.checked&&people.going.length)
      counts.textContent+=' · Going: '+people.going.map(p=>p.name).join(', ');
     info.append(counts);
    }
    const actions=make('div',null,'game-night-run-actions');
    actions.append(button('Open fixture',()=>onOpenFixture(f,finalScore(f)?'score':'schedule')));
    if(!finalScore(f)&&f.active!==false&&f.unlocked!==false)
     actions.append(button('Attendance',()=>onAttendance(key(f))));
    row.append(time,info,actions);list.append(row);
   }
   if(!items.length)list.append(make('p','No organiser-scheduled fixtures on this date.'));
   status.textContent=items.length>30?
    'Showing 30 of '+items.length+' saved fixtures. The HTML programme includes the complete day.':
    items.length+' organiser-saved fixtures. All scores are manually entered and unverified.';
   printButton.disabled=!items.length;
   includeNames.disabled=!readable;
   if(!readable){includeNames.checked=false;
    status.textContent+=' Attendance storage is unreadable; no private RSVP details are included.';}
  }
  function page(){
   const items=chosen();
   const body=items.map(f=>{
    const people=readable?lookup(f):null;
    const attendance=people&&!finalScore(f)?
      'Private RSVP: '+people.going.length+' Going / '+people.maybe.length+' Maybe / '+
        people.out.length+' Out'+(includeNames.checked&&people.going.length?
        ' · Going: '+people.going.map(p=>p.name).join(', '):''):'';
    return '<tr><td>'+escape(timeText(f.time))+'</td><td>'+
     escape(f.competition)+'</td><td>'+escape(f.home+' vs '+f.away)+'</td><td>'+
     escape(f.venue||'Not entered')+'</td><td>'+
     escape(finalScore(f)?'Manually entered '+f.homeScore+'–'+f.awayScore:'Unplayed / unrecorded')+
     '</td><td>'+escape(attendance)+'</td></tr>';
   }).join('');
   return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
    '<title>Fuckball · Private game night '+escape(select.value)+'</title>'+
    '<style>body{font:14px system-ui;margin:32px auto;max-width:1180px;padding:0 20px;color:#182b2d}'+
    'h1{font-size:26px}p{line-height:1.6}table{border-collapse:collapse;width:100%;font-size:12px}'+
    'th,td{border:1px solid #afc6be;padding:9px;text-align:left;overflow-wrap:anywhere;vertical-align:top}'+
    'th{background:#e4eee7}tr{break-inside:avoid}@media print{body{margin:0;padding:0}table{font-size:10px}}'+
    '</style></head><body><h1>Private game night · '+escape(localDay(select.value))+'</h1>'+
    '<p>Organiser-entered schedule, not an official online fixture list. Times are local. '+
    'No match duration or attendance is guaranteed. Share private names only with their consent.</p>'+
    '<p>'+items.length+' fixtures · '+items.filter(finalScore).length+
    ' privately recorded scores'+(includeNames.checked?' · Going names included by request':' · Private names excluded')+'</p>'+
    '<table><thead><tr><th>Time</th><th>Competition</th><th>Teams</th><th>Venue</th>'+
    '<th>Result status</th><th>Private RSVP</th></tr></thead><tbody>'+body+
    '</tbody></table></body></html>';
  }
  function savePrint(){
   if(!chosen().length)return;
   if(includeNames.checked&&!window.confirm(
    'This printable report will disclose privately saved Going player names. Download and share it only with permission.'))return;
   const url=URL.createObjectURL(new Blob([page()],{type:'text/html;charset=utf-8'}));
   const a=make('a');a.href=url;a.download='fuckball-private-game-night-'+select.value+'.html';
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent='Complete private day programme downloaded for offline opening or printing. Nothing was uploaded.';
  }
  function render(nextFixtures,nextRows,attendanceReadable){
   fixtures=(Array.isArray(nextFixtures)?nextFixtures:[])
    .filter(f=>Number.isSafeInteger(f.time)&&f.time>0&&
     (f.active!==false||finalScore(f)))
    .sort((a,b)=>a.time-b.time||fName(a).localeCompare(fName(b)));
   function fName(f){return f.competition+f.home+f.away;}
   readable=attendanceReadable;
   rosters=new Map((readable&&Array.isArray(nextRows)?nextRows:[])
    .map(row=>[row.key,row.people]));
   const dates=[...new Set(fixtures.map(f=>dateKey(f.time)))];
   const previous=select.value;
   select.replaceChildren();
   for(const date of dates){const option=make('option',localDay(date));option.value=date;select.append(option);}
   select.disabled=!dates.length;
   const today=dateKey(Date.now());
   select.value=dates.includes(previous)?previous:dates.find(d=>d>=today)||dates.at(-1)||'';
   refresh();
  }
  select.addEventListener('change',refresh);
  includeNames.addEventListener('change',refresh);
  return {element:section,render};
 }
 window.FuckballGameNightRunSheet=Object.freeze({create});
})();
