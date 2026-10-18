'use strict';
// Private, device-only friendly tournament organiser. No server scores or ranked results.
(function () {
  const host=document.getElementById('homeView');
  if(!host)return;
  const KEY='fuckball.local-tournaments.v1',MAX_STORE=128*1024,MAX_IMPORT=96*1024;
  const MAX_TOURNAMENTS=8,MAX_TEAMS=12,MAX_SCORE=99;
  const make=(tag,txt,cls)=>{
    const node=document.createElement(tag);
    if(txt!==undefined&&txt!==null)node.textContent=String(txt);
    if(cls)node.className=cls;
    return node;
  };
  function label(text,control){const l=make('label',text);l.append(control);return l;}
  function button(text,cb,cls){const b=make('button',text,cls);b.type='button';b.addEventListener('click',cb);return b;}
  const safeName=(s,max)=>typeof s==='string'&&s.trim()===s&&s.length>=1&&s.length<=max&&
    !/[\u0000-\u001f\u007f-\u009f]/.test(s);
  const validTime=n=>Number.isSafeInteger(n)&&n>0&&n<=Date.now()+86400000;
  const validId=s=>typeof s==='string'&&/^[a-f0-9-]{16,50}$/i.test(s);
  const newId=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const pairings=(count,legs)=>{
    const positions=Array.from({length:count},(_,i)=>i);
    if(count%2)positions.push(-1);
    const total=positions.length,rounds=[];
    for(let r=0;r<total-1;r++){
      const games=[];
      for(let i=0;i<total/2;i++){
        const a=positions[i],b=positions[total-1-i];
        if(a<0||b<0)continue;
        const swap=(r+i)%2===1;
        games.push({round:r+1,home:swap?b:a,away:swap?a:b});
      }
      rounds.push(games);
      positions.splice(1,0,positions.pop());
    }
    if(legs===2){
      const offset=rounds.length;
      for(let r=0;r<offset;r++)rounds.push(rounds[r].map(g=>({
        round:g.round+offset,home:g.away,away:g.home
      })));
    }
    return rounds.flatMap((round,i)=>round.map((g,j)=>({
      id:'r'+(i+1)+'g'+(j+1),...g,homeScore:null,awayScore:null,kickoff:null,venue:''
    })));
  };
  const resultValid=(a,b)=>(a===null&&b===null)||
    (Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a<=MAX_SCORE&&b<=MAX_SCORE);
  // Optional kickoff is a local organiser note, never a real-server fixture.
  const scheduleValid=n=>n===null||(Number.isSafeInteger(n)&&n>=1577836800000&&n<=4102444800000);
  const venueValid=s=>typeof s==='string'&&s.length<=60&&s===s.trim()&&
    !/[\u0000-\u001f\u007f-\u009f]/.test(s);
  const localValue=n=>{
    if(n===null)return '';
    const d=new Date(n),pad=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+
      pad(d.getHours())+':'+pad(d.getMinutes());
  };
  function normalize(raw){
    if(!raw||raw.version!==1||!validId(raw.id)||!safeName(raw.name,60)||
      !Array.isArray(raw.teams)||raw.teams.length<2||raw.teams.length>MAX_TEAMS||
      ![1,2].includes(raw.legs)||!validTime(raw.createdAt)||!validTime(raw.updatedAt)||
      raw.updatedAt<raw.createdAt||!Array.isArray(raw.fixtures))throw Error('Invalid tournament format.');
    const teams=raw.teams.slice();
    if(teams.some(t=>!safeName(t,30))||
      new Set(teams.map(t=>t.toLocaleLowerCase())).size!==teams.length)
      throw Error('Team names must be unique, 1–30 characters each.');
    const template=pairings(teams.length,raw.legs);
    if(raw.fixtures.length!==template.length)throw Error('Schedule is incomplete.');
    const fixtures=template.map((t,i)=>{
      const f=raw.fixtures[i];
      if(!f||f.id!==t.id||f.round!==t.round||f.home!==t.home||f.away!==t.away||
        !resultValid(f.homeScore,f.awayScore))throw Error('Schedule or score cannot be verified.');
      const kickoff=f.kickoff===undefined?null:f.kickoff;
      const venue=f.venue===undefined?'':f.venue;
      if(!scheduleValid(kickoff)||!venueValid(venue))throw Error('Invalid fixture calendar details.');
      return {...t,homeScore:f.homeScore,awayScore:f.awayScore,kickoff,venue};
    });
    return {version:1,id:raw.id,name:raw.name,teams,legs:raw.legs,
      createdAt:raw.createdAt,updatedAt:raw.updatedAt,fixtures};
  }
  let tournaments=[],activeId='',filter='pending',message='';
  // Guard against silently overwriting another tab's tournament edits, or
  // erasing unreadable stored data. A reload/recovery is required on conflict.
  let storageSnapshot=null,storageHealthy=true,recoveryBackupPrepared=false;
  try{
    const stored=localStorage.getItem(KEY);
    storageSnapshot=stored;
    if(stored&&stored.length<=MAX_STORE){
      const parsed=JSON.parse(stored);
      if(!Array.isArray(parsed)||parsed.length>MAX_TOURNAMENTS)throw Error('Invalid saved collection');
      const seen=new Set();
      tournaments=parsed.map(normalize);
      for(const t of tournaments){if(seen.has(t.id))throw Error('Duplicate tournament');seen.add(t.id);}
    }else if(stored)throw Error('Stored tournament data exceeds the supported storage limit.');
  }catch{tournaments=[];storageHealthy=false;
    message='Stored tournament data could not be verified. Export or recover it before making changes.';}
  function persist(next){
    if(next.length>MAX_TOURNAMENTS)throw Error('Maximum eight tournaments on this device.');
    const data=JSON.stringify(next);
    if(data.length>MAX_STORE)throw Error('Local tournament storage is full.');
    if(!storageHealthy)throw Error('Stored tournaments are unreadable. Recover or reload before writing.');
    if(localStorage.getItem(KEY)!==storageSnapshot)
      throw Error('Tournament data changed in another tab. Reload to keep both sets of edits.');
    localStorage.setItem(KEY,data);  // Only the canonical local organiser may mutate league results.
    storageSnapshot=data;tournaments=next;
    window.dispatchEvent(new Event('fuckball:private-competition-change'));
  }
  const panel=make('section',null,'tournament-desk');
  panel.setAttribute('aria-label','Private friendly tournament desk');
  const details=make('details',null,'tournament-disclosure');
  const summary=make('summary','🏆 FRIENDLY TOURNAMENT DESK · OPEN');
  const inner=make('div',null,'tournament-inner');
  const intro=make('p','Plan private round-robin fixtures, record results yourself and see the table. This does not verify match results or affect rankings, clubs, servers or matchmaking.');
  const status=make('p',null,'tournament-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const actions=make('div',null,'tournament-actions');
  const select=make('select');select.setAttribute('aria-label','Choose local tournament');
  const add=button('＋ New tournament',()=>{setup.hidden=!setup.hidden;if(!setup.hidden)nameInput.focus();});
  const exportButton=button('↓ Backup JSON',exportJSON);
  const csvButton=button('↓ Table CSV',exportCSV);
  const scheduleCsv=button('↓ Fixtures CSV',exportFixturesCSV);
  const calendarButton=button('↓ Calendar ICS',exportCalendar);
  const plannerButton=button('🗓 Plan all kickoffs',()=>{
    if(!current())return inform('Create or select a private league first.');
    planner.hidden=!planner.hidden;invalidatePlan();
    if(!planner.hidden)firstKickoff.focus();
  });
  const importButton=button('↑ Restore JSON',()=>upload.click());
  const remove=button('Delete tournament',deleteTournament,'tournament-danger');
  const upload=make('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;
  actions.append(select,add,plannerButton,exportButton,csvButton,scheduleCsv,calendarButton,importButton,remove,upload);
  const setup=make('form',null,'tournament-setup');setup.hidden=true;
  const nameInput=make('input');nameInput.required=true;nameInput.maxLength=60;nameInput.value='Weekend cup';
  const teamsInput=make('textarea');teamsInput.required=true;teamsInput.maxLength=480;
  teamsInput.rows=5;teamsInput.placeholder='Red Dragons\nBlue Comets\nUnited\nCity';
  const legs=make('select');legs.add(new Option('Single round robin','1'));legs.add(new Option('Home and away','2'));
  const create=make('button','Create fixture calendar');create.type='submit';
  const cancel=button('Cancel',()=>{setup.hidden=true;});
  setup.append(label('Tournament name',nameInput),label('Teams · one name per line · 2–12',teamsInput),
    label('Schedule',legs),create,cancel);
  // Plan local fixtures as one atomic competition edit; never manufacture scores.
  const planner=make('section',null,'tournament-batch-planner');planner.hidden=true;
  planner.setAttribute('aria-label','Plan private league kickoffs');
  const plannerTitle=make('h3','PLAN THE WHOLE LEAGUE');
  const plannerLead=make('p','Choose your first local kickoff and spacing. Preview every proposed fixture before saving. Played results are always protected; existing kickoff dates are kept by default.');
  const plannerForm=make('form',null,'tournament-batch-form');
  const firstKickoff=make('input');firstKickoff.type='datetime-local';firstKickoff.required=true;
  firstKickoff.setAttribute('aria-label','First local kickoff');
  const slotMinutes=make('input');slotMinutes.type='number';slotMinutes.min='15';slotMinutes.max='240';
  slotMinutes.step='15';slotMinutes.value='60';slotMinutes.required=true;
  const roundDays=make('input');roundDays.type='number';roundDays.min='1';roundDays.max='30';
  roundDays.step='1';roundDays.value='7';roundDays.required=true;
  const sharedVenue=make('input');sharedVenue.type='text';sharedVenue.maxLength=60;
  sharedVenue.placeholder='Optional, e.g. Main arena';
  const keepDates=make('input');keepDates.type='checkbox';keepDates.checked=true;
  const keepLabel=label('Keep existing kickoff dates',keepDates);keepLabel.className='tournament-batch-keep';
  const showPlan=button('Preview schedule',previewKickoffs);
  const applyPlan=make('button','Confirm and save kickoffs');applyPlan.type='submit';applyPlan.disabled=true;
  const cancelPlan=button('Close planner',()=>{planner.hidden=true;invalidatePlan();});
  const plannerPreview=make('div',null,'tournament-batch-preview');
  plannerPreview.setAttribute('role','status');plannerPreview.setAttribute('aria-live','polite');
  plannerForm.append(label('First kickoff · local time',firstKickoff),
    label('Minutes between games',slotMinutes),label('Days between rounds',roundDays),
    label('Shared venue · optional',sharedVenue),keepLabel,showPlan,applyPlan,cancelPlan);
  planner.append(plannerTitle,plannerLead,plannerForm,plannerPreview);
  for(const input of [firstKickoff,slotMinutes,roundDays,sharedVenue,keepDates]){
    input.addEventListener('input',invalidatePlan);
    input.addEventListener('change',invalidatePlan);
  }
  let pendingPlan=null;
  function invalidatePlan(){
    pendingPlan=null;applyPlan.disabled=true;
    plannerPreview.replaceChildren();
  }
  const planSignature=()=>JSON.stringify([activeId,storageSnapshot,firstKickoff.value,
    slotMinutes.value,roundDays.value,sharedVenue.value,keepDates.checked]);
  function calculateKickoffs(){
    const t=current();
    if(!t||!storageHealthy)throw Error('Select a readable private league first.');
    const value=firstKickoff.value;
    if(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(value))
      throw Error('Choose a valid first kickoff in your local timezone.');
    const start=new Date(value);
    if(!Number.isFinite(start.getTime())||localValue(start.getTime())!==value||
       !scheduleValid(start.getTime()))
      throw Error('First kickoff is invalid or outside supported dates.');
    const slot=Number(slotMinutes.value),gap=Number(roundDays.value);
    if(!Number.isSafeInteger(slot)||slot<15||slot>240||slot%15!==0||
       !Number.isSafeInteger(gap)||gap<1||gap>30)
      throw Error('Use a 15–240 minute slot (in steps of 15) and 1–30 days between rounds.');
    const venue=sharedVenue.value.trim();
    if(!venueValid(venue))throw Error('Venue must be 60 characters or fewer, without control characters.');
    const changes=[],replacement=new Map(),roundSlots=new Map();
    for(const f of t.fixtures){
      const index=roundSlots.get(f.round)||0;roundSlots.set(f.round,index+1);
      if(f.homeScore!==null||(keepDates.checked&&f.kickoff!==null))continue;
      const kickoff=new Date(start.getTime());
      // setDate preserves local wall-clock kickoff across daylight-saving changes.
      kickoff.setDate(start.getDate()+(f.round-1)*gap);
      kickoff.setMinutes(kickoff.getMinutes()+index*slot);
      const time=kickoff.getTime();
      if(!scheduleValid(time))throw Error('The proposed dates exceed the supported calendar range.');
      changes.push({fixture:f,time,venue:venue||f.venue});
      replacement.set(f.id,{...f,kickoff:time,venue:venue||f.venue});
    }
    if(!changes.length)throw Error('No unplayed fixtures need new dates. Uncheck Keep existing dates to reschedule.');
    const candidate=normalize({...t,updatedAt:Math.max(Date.now(),t.createdAt),
      fixtures:t.fixtures.map(f=>replacement.get(f.id)||f)});
    return {candidate,changes,signature:planSignature(),tournamentId:t.id};
  }
  function previewKickoffs(){
    invalidatePlan();
    try{
      const plan=calculateKickoffs();
      pendingPlan=plan;applyPlan.disabled=false;
      plannerPreview.append(make('strong',plan.changes.length+' proposed kickoff dates · unofficial, stored only on this device.'));
      const list=make('ol');
      for(const {fixture,time,venue} of plan.changes.slice(0,10)){
        list.append(make('li',plan.candidate.teams[fixture.home]+' vs '+
          plan.candidate.teams[fixture.away]+' · '+new Date(time).toLocaleString(undefined,
            {dateStyle:'medium',timeStyle:'short'})+(venue?' · '+venue:'')));
      }
      plannerPreview.append(list);
      if(plan.changes.length>10)plannerPreview.append(make('p',
        '+ '+(plan.changes.length-10)+' more fixtures will be assigned dates.'));
      plannerPreview.append(make('p','No played scores will change. Existing kickoffs '+
        (keepDates.checked?'remain untouched.':'for unplayed games will be replaced.')+
        ' Export the existing JSON backup first if you want a separate copy.'));
    }catch(error){
      plannerPreview.append(make('p',error.message||'Could not prepare schedule.'));
    }
  }
  plannerForm.onsubmit=event=>{
    event.preventDefault();
    if(!pendingPlan||pendingPlan.signature!==planSignature()||
       pendingPlan.tournamentId!==current()?.id){
      invalidatePlan();return inform('The proposed schedule changed. Preview again before saving.');
    }
    if(!window.confirm('Save '+pendingPlan.changes.length+
      ' private kickoff times for "'+pendingPlan.candidate.name+
      '"? Existing played results will not be changed.'))return;
    try{
      persist(tournaments.map(t=>t.id===pendingPlan.tournamentId?pendingPlan.candidate:t));
      const count=pendingPlan.changes.length;
      invalidatePlan();planner.hidden=true;
      message=count+' local kickoff dates saved. Export Calendar ICS to share the proposed schedule.';
      render();
    }catch(error){
      invalidatePlan();inform('Schedule not saved: '+(error.message||'Local storage changed.'));
    }
  };
  const overview=make('div',null,'tournament-overview');
  const standings=make('div',null,'tournament-standings');
  const fixtures=make('div',null,'tournament-fixtures');
  const recovery=make('section',null,'tournament-recovery');recovery.hidden=true;
  const warning=make('p','Stored tournaments cannot be read safely. New results are blocked to protect the original browser data. Export the original bytes before deliberately resetting this one local collection.');
  const recoveryDownload=button('↓ Download untouched stored data',()=>{
    try{
      const saved=localStorage.getItem(KEY);
      if(!saved||saved!==storageSnapshot)throw Error('Data changed in another tab; reload first.');
      const blob=new Blob([saved],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(blob),link=make('a');
      link.href=url;link.download='fuckball-unreadable-tournaments-backup.json';
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      recoveryBackupPrepared=true;
      inform('Backup download initiated. Check that you have the file before resetting anything.');
    }catch(err){inform('Unable to prepare recovery backup: '+(err.message||'Storage unavailable'));}
  });
  const recoveryReset=button('Reset only unreadable league storage',()=>{
    if(!recoveryBackupPrepared)return inform('Download your original league data before resetting.');
    if(!window.confirm('Have you verified that the original tournament backup was downloaded?'))return;
    if(!window.confirm('Permanently clear ONLY unreadable private tournament data in this browser? Your other Fuckball data will not be touched.'))return;
    try{
      if(localStorage.getItem(KEY)!==storageSnapshot)throw Error('Data changed in another tab; reload first.');
      localStorage.removeItem(KEY);
      storageSnapshot=null;storageHealthy=true;recoveryBackupPrepared=false;
      tournaments=[];activeId='';filter='pending';
      message='Unreadable local tournament collection reset by your request. Your backup remains on your device.';
      render();
      window.dispatchEvent(new Event('fuckball:private-competition-change'));
    }catch(err){inform('Recovery cancelled: '+(err.message||'Storage unavailable'));}
  },'tournament-danger');
  recovery.append(warning,recoveryDownload,recoveryReset);
  inner.append(intro,actions,setup,planner,status,recovery,overview,standings,fixtures);
  details.append(summary,inner);panel.append(details);
  const homeCards=host.querySelector('.mode-cards');
  if(homeCards)homeCards.insertAdjacentElement('afterend',panel);else host.append(panel);
  const current=()=>tournaments.find(t=>t.id===activeId)||null;
  function inform(text){message=text;status.textContent=text;}
  const num=n=>String(n).padStart(2,'0');
  function tableFor(t){
    const rows=t.teams.map((name,i)=>({name,index:i,P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0}));
    for(const f of t.fixtures){
      if(f.homeScore===null)continue;
      const home=rows[f.home],away=rows[f.away],h=f.homeScore,a=f.awayScore;
      home.P++;away.P++;home.GF+=h;home.GA+=a;away.GF+=a;away.GA+=h;
      if(h>a){home.W++;away.L++;home.Pts+=3;}
      else if(a>h){away.W++;home.L++;away.Pts+=3;}
      else{home.D++;away.D++;home.Pts++;away.Pts++;}
    }
    rows.forEach(x=>x.GD=x.GF-x.GA);
    return rows.sort((a,b)=>b.Pts-a.Pts||b.GD-a.GD||b.GF-a.GF||a.name.localeCompare(b.name));
  }
  function render(){
    recovery.hidden=storageHealthy;
    const saved=current();
    select.replaceChildren(new Option('Select a tournament…',''));
    for(const t of tournaments)select.add(new Option(t.name,t.id));
    if(!saved&&tournaments.length){activeId=tournaments[0].id;}
    select.value=current()?.id||'';
    const t=current(),enabled=!!t;
    exportButton.disabled=csvButton.disabled=scheduleCsv.disabled=calendarButton.disabled=remove.disabled=!enabled;
    plannerButton.disabled=!enabled;
    inform(message||(t?'Stored on this device only · scores are manual and unverified.':'Create or restore a private tournament to begin.'));
    overview.replaceChildren();standings.replaceChildren();fixtures.replaceChildren();
    if(!t)return;
    const done=t.fixtures.filter(f=>f.homeScore!==null).length;
    const caption=make('div',null,'tournament-progress');
    caption.append(make('strong',t.name),make('span',done+' / '+t.fixtures.length+' fixtures recorded · '+
      (t.legs===2?'Home and away':'Single round robin')));
    const meter=make('progress');meter.max=t.fixtures.length;meter.value=done;meter.setAttribute('aria-label','Fixtures recorded');
    overview.append(caption,meter);
    const title=make('h3','LEAGUE TABLE · FRIENDLY');
    const table=make('table'),head=make('thead'),header=make('tr');
    for(const field of ['#','Team','P','W','D','L','GF','GA','GD','Pts'])header.append(make('th',field));
    head.append(header);table.append(head);
    const body=make('tbody');
    for(const [position,row] of tableFor(t).entries()){
      const tr=make('tr');
      for(const val of [position+1,row.name,row.P,row.W,row.D,row.L,row.GF,row.GA,row.GD,row.Pts])
        tr.append(make('td',val));
      body.append(tr);
    }
    table.append(body);const scroll=make('div',null,'tournament-table-scroll');scroll.append(table);
    standings.append(title,scroll);
    const gamesHeader=make('div',null,'tournament-fixtures-head');
    gamesHeader.append(make('h3','FIXTURE CALENDAR'));
    const filterSelect=make('select');
    filterSelect.setAttribute('aria-label','Filter tournament fixtures');
    filterSelect.add(new Option('Still to play','pending'));
    filterSelect.add(new Option('All fixtures','all'));
    filterSelect.add(new Option('Upcoming scheduled','upcoming'));
    const lastRound=Math.max(...t.fixtures.map(f=>f.round));
    for(let n=1;n<=lastRound;n++)filterSelect.add(new Option('Round '+n,'round'+n));
    filterSelect.value=filter;
    if(filterSelect.value!==filter)filter='pending';
    filterSelect.value=filter;
    filterSelect.onchange=()=>{filter=filterSelect.value;render();};
    gamesHeader.append(filterSelect);fixtures.append(gamesHeader);
    const visible=t.fixtures.filter(f=>filter==='all'||
      (filter==='pending'&&f.homeScore===null)||
      (filter==='upcoming'&&f.kickoff!==null&&f.kickoff>=Date.now()&&f.homeScore===null)||
      (filter.startsWith('round')&&f.round===Number(filter.slice(5))))
      .sort((a,b)=>filter==='upcoming'?a.kickoff-b.kickoff:a.round-b.round);
    if(!visible.length)fixtures.append(make('p',filter==='pending'?
      'All scheduled matches have a recorded score. Congratulations on finishing the fixture list.':'No fixtures in this view.'));
    for(const f of visible){
      const row=make('form',null,'tournament-match');
      row.dataset.fixtureId=f.id;
      const matchLabel=make('div',null,'tournament-match-name');
      matchLabel.append(make('small','ROUND '+num(f.round)),
        make('strong',t.teams[f.home]+' vs '+t.teams[f.away]));
      const hs=make('input');hs.type='number';hs.min='0';hs.max=String(MAX_SCORE);hs.step='1';
      hs.inputMode='numeric';hs.placeholder='–';hs.required=true;
      hs.setAttribute('aria-label',t.teams[f.home]+' goals');
      const as=make('input');as.type='number';as.min='0';as.max=String(MAX_SCORE);as.step='1';
      as.inputMode='numeric';as.placeholder='–';as.required=true;
      as.setAttribute('aria-label',t.teams[f.away]+' goals');
      if(f.homeScore!==null){hs.value=String(f.homeScore);as.value=String(f.awayScore);}
      const save=make('button',f.homeScore===null?'Save score':'Update');save.type='submit';
      const clear=button('Clear',()=>{
        try{updateScore(t.id,f.id,null,null);}catch(err){inform(err.message||'Could not clear score.');}
      });clear.disabled=f.homeScore===null;
      row.append(matchLabel,hs,make('span','–'),as,save,clear);
      const scheduling=make('div',null,'tournament-scheduling');
      const when=make('input');when.type='datetime-local';when.value=localValue(f.kickoff);
      when.setAttribute('aria-label','Local kickoff time for '+t.teams[f.home]+' versus '+t.teams[f.away]);
      const venue=make('input');venue.type='text';venue.maxLength=60;venue.value=f.venue;
      venue.placeholder='Venue (optional)';
      const schedule=button(f.kickoff===null?'Set kickoff':'Update kickoff',()=>{
        const value=when.value.trim(),place=venue.value.trim();
        if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
          return inform('Choose a local kickoff date and time first.');
        const d=new Date(value),time=d.getTime();
        if(!Number.isFinite(time)||!scheduleValid(time)||localValue(time)!==value)
          return inform('Kickoff date/time is outside the supported range or invalid locally.');
        try{updateSchedule(t.id,f.id,time,place);}catch(err){inform(err.message||'Could not save kickoff.');}
      });
      const unschedule=button('Remove date',()=>{
        try{updateSchedule(t.id,f.id,null,'');}catch(err){inform(err.message||'Could not remove kickoff.');}
      });unschedule.disabled=f.kickoff===null;
      scheduling.append(label('Kickoff · your local time',when),label('Venue',venue),schedule,unschedule);
      row.append(scheduling);
      row.onsubmit=event=>{
        event.preventDefault();
        const values=[hs.value.trim(),as.value.trim()];
        if(values.some(x=>! /^(0|[1-9]\d?)$/.test(x)))return inform('Use whole-number scores from 0 to 99.');
        const [h,a]=values.map(Number);
        try{updateScore(t.id,f.id,h,a);}catch(err){inform(err.message||'Score could not be stored.');}
      };
      fixtures.append(row);
    }
  }
  function updateSchedule(id,fixtureId,kickoff,venue){
    if(!scheduleValid(kickoff)||!venueValid(venue))throw Error('Invalid local fixture details.');
    const original=tournaments.find(t=>t.id===id);
    if(!original||!original.fixtures.some(f=>f.id===fixtureId))
      throw Error('Fixture is no longer available.');
    const updated={...original,updatedAt:Math.max(Date.now(),original.createdAt),
      fixtures:original.fixtures.map(f=>f.id===fixtureId?{...f,kickoff,venue}:f)};
    persist(tournaments.map(t=>t.id===id?normalize(updated):t));
    message=kickoff===null?'Local fixture date removed.':'Local fixture date saved (unverified).';
    render();
  }
  function updateScore(id,fixtureId,h,a){
    if(!resultValid(h,a))throw Error('Only complete scores from 0 to 99 are allowed.');
    const original=tournaments.find(t=>t.id===id);
    if(!original)throw Error('This tournament changed. Refresh the panel.');
    const found=original.fixtures.some(f=>f.id===fixtureId);
    if(!found)throw Error('The selected fixture is no longer available.');
    const updated={...original,updatedAt:Math.max(Date.now(),original.createdAt),
      fixtures:original.fixtures.map(f=>f.id===fixtureId?{...f,homeScore:h,awayScore:a}:f)};
    persist(tournaments.map(t=>t.id===id?normalize(updated):t));
    message=h===null?'Fixture cleared.':'Score saved to this browser, not to an online game.';
    render();
  }
  setup.onsubmit=event=>{
    event.preventDefault();
    const cleanName=nameInput.value.trim();
    const teams=teamsInput.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!safeName(cleanName,60)||teams.length<2||teams.length>MAX_TEAMS||
      teams.some(x=>!safeName(x,30))||new Set(teams.map(x=>x.toLocaleLowerCase())).size!==teams.length)
      return inform('Enter a tournament name and 2–12 unique team names (max 30 characters each).');
    if(tournaments.length>=MAX_TOURNAMENTS)return inform('Eight saved tournaments is the local limit. Export one before deleting.');
    const now=Date.now(),t=normalize({version:1,id:newId(),name:cleanName,teams,
      legs:Number(legs.value),createdAt:now,updatedAt:now,fixtures:pairings(teams.length,Number(legs.value))});
    try{persist([...tournaments,t]);activeId=t.id;filter='pending';setup.hidden=true;
      message='Tournament created. Enter scores after each real friendly match.';render();}
    catch(err){inform(err.message||'Cannot save local tournament.');}
  };
  select.onchange=()=>{activeId=select.value;filter='pending';message='';invalidatePlan();planner.hidden=true;render();};
  function deleteTournament(){
    const t=current();if(!t)return;
    if(!window.confirm('Delete "'+t.name+'" and its local scores? Export a backup first.'))return;
    try{persist(tournaments.filter(x=>x.id!==t.id));activeId='';filter='pending';
      message='Local tournament deleted.';render();}
    catch(err){inform(err.message||'Could not delete tournament.');}
  }
  function saveFile(name,data,type){
    const blob=new Blob([data],{type}),url=URL.createObjectURL(blob);
    const link=make('a');link.href=url;link.download=name;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  const filename=t=>'fuckball-'+t.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40).replace(/^-|-$/g,'')||'tournament';
  function exportJSON(){
    const t=current();if(!t)return;
    const out={...t,exportedAt:Date.now(),notice:'Unofficial manual friendly results; no server verification'};
    saveFile(filename(t)+'.json',JSON.stringify(out,null,2),'application/json');
    inform('Private tournament JSON saved to your downloads.');
  }
  const csvCell=value=>{
    let v=String(value);
    if(/^[=+\-@\t\r]/.test(v))v="'"+v;
    return '"'+v.replace(/"/g,'""')+'"';
  };
  function exportCSV(){
    const t=current();if(!t)return;
    const rows=[['Position','Team','Played','Won','Drawn','Lost','For','Against','Difference','Points'],
      ...tableFor(t).map((r,i)=>[i+1,r.name,r.P,r.W,r.D,r.L,r.GF,r.GA,r.GD,r.Pts])];
    saveFile(filename(t)+'-table.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n',
      'text/csv;charset=utf-8');
    inform('Unofficial standings exported as local CSV.');
  }
  function exportFixturesCSV(){
    const t=current();if(!t)return;
    const rows=[['Round','Home','Away','Kickoff ISO UTC','Venue','Home goals','Away goals','Result status'],
      ...t.fixtures.map(f=>[f.round,t.teams[f.home],t.teams[f.away],
        f.kickoff===null?'':new Date(f.kickoff).toISOString(),
        f.venue,f.homeScore===null?'':f.homeScore,f.awayScore===null?'':f.awayScore,
        f.homeScore===null?'Unplayed':'Manually recorded · unverified'])];
    saveFile(filename(t)+'-fixtures.csv','\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n',
      'text/csv;charset=utf-8');
    inform('Private fixture schedule exported as CSV.');
  }
  function exportCalendar(){
    const t=current();if(!t)return;
    const scheduled=t.fixtures.filter(f=>f.kickoff!==null);
    if(!scheduled.length)return inform('Schedule at least one kickoff before exporting a calendar.');
    const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
    const stamp=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const fold=s=>{
      const encoder=new TextEncoder();let out='',width=0;
      for(const char of s){
        const bytes=encoder.encode(char).length;
        if(width+bytes>72){out+='\r\n ';width=1;}
        out+=char;width+=bytes;
      }
      return out;
    };
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN',
      'PRODID:-//Fuckball//Private Friendly Calendar//EN',
      'X-WR-CALNAME:'+escape(t.name+' · private friendlies')];
    for(const f of scheduled){
      lines.push('BEGIN:VEVENT','UID:'+f.id+'.'+t.id+'@local.fuckball',
        'DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(f.kickoff),
        'DURATION:PT1H',
        'SUMMARY:'+escape(t.teams[f.home]+' vs '+t.teams[f.away]),
        'DESCRIPTION:'+escape('Unofficial friendly schedule. Not verified by Fuckball servers.'),
        ...(f.venue?['LOCATION:'+escape(f.venue)]:[]),'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    saveFile(filename(t)+'-fixtures.ics',lines.map(fold).join('\r\n')+'\r\n','text/calendar;charset=utf-8');
    inform('Private calendar downloaded: '+scheduled.length+' scheduled friendlies, 60-minute placeholder duration.');
  }
  upload.onchange=async()=>{
    const file=upload.files?.[0];upload.value='';if(!file)return;
    if(file.size>MAX_IMPORT||file.size===0)return inform('Use a local tournament JSON smaller than 96 KiB.');
    if(tournaments.length>=MAX_TOURNAMENTS)return inform('Export and delete one tournament before importing another.');
    try{
      const raw=JSON.parse(await file.text()),checked=normalize(raw);
      if(!window.confirm('Restore "'+checked.name+'" as a separate local tournament?'))return;
      const now=Date.now(),copy={...checked,id:newId(),createdAt:now,updatedAt:now};
      persist([...tournaments,normalize(copy)]);activeId=copy.id;filter='pending';
      message='Tournament restored as a new device-local copy.';render();
    }catch(err){inform('Import refused: '+(err.message||'Invalid local tournament file.'));}
  };
  window.addEventListener('fuckball:open-private-competition',event=>{
    const ref=event.detail;
    if(ref?.type!=='League'||typeof ref.id!=='string')return;
    const selected=tournaments.find(t=>t.id===ref.id);
    if(!selected)return inform('This local league is no longer available.');
    activeId=selected.id;filter='pending';message='Opened '+selected.name+' · results are private and unverified.';
    details.open=true;render();
    panel.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
      'auto':'smooth',block:'start'});
    select.focus({preventScroll:true});
  });
  // Matchday Control Center is navigation-only. The actual score and schedule
  // remain submitted through the existing Tournament Desk forms/validators.
  window.addEventListener('fuckball:open-private-league-fixture',event=>{
    const request=event.detail;
    if(!request||typeof request.tournamentId!=='string'||
      typeof request.fixtureId!=='string'||!['score','schedule'].includes(request.field))return;
    const target=tournaments.find(t=>t.id===request.tournamentId);
    const fixture=target?.fixtures.find(f=>f.id===request.fixtureId);
    if(!fixture)return inform('This private fixture is no longer available on this device.');
    activeId=target.id;filter='round'+fixture.round;
    message='Editing '+target.teams[fixture.home]+' vs '+target.teams[fixture.away]+
      ' · all details are private and unverified.';
    details.open=true;render();
    const row=Array.from(fixtures.querySelectorAll('.tournament-match')).find(el=>
      el.dataset.fixtureId===fixture.id);
    if(!row)return inform('The selected fixture could not be opened.');
    row.classList.add('tournament-match-target');
    row.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
      'auto':'smooth',block:'center'});
    const input=row.querySelector(request.field==='score'?'input[type="number"]':'input[type="datetime-local"]');
    input?.focus({preventScroll:true});
  });
  window.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    try{
      if(event.newValue?.length>MAX_STORE)throw Error();
      const candidate=event.newValue?JSON.parse(event.newValue):[];
      if(!Array.isArray(candidate)||candidate.length>MAX_TOURNAMENTS)throw Error();
      const incoming=candidate.map(normalize);
      if(new Set(incoming.map(x=>x.id)).size!==incoming.length)throw Error();
      tournaments=incoming;storageSnapshot=event.newValue;storageHealthy=true;
      recoveryBackupPrepared=false;
      invalidatePlan();message='Tournament data refreshed from another tab.';render();
    }catch{storageSnapshot=event.newValue;storageHealthy=false;
      recoveryBackupPrepared=false;recovery.hidden=false;
      inform('Another tab changed tournament data. Reload or recover it before saving.');}
  });
  render();
})();