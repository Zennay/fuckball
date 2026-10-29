'use strict';
// Device-local, unofficial knockout cups. Never reads authoritative match/server state.
(function(){
  const home=document.getElementById('homeView');
  if(!home)return;
  const KEY='fuckball.private-knockout-cups.v1',MAX=8,LIMIT=96*1024;
  const el=(tag,content,cls)=>{
    const node=document.createElement(tag);
    if(content!==undefined&&content!==null)node.textContent=String(content);
    if(cls)node.className=cls;
    return node;
  };
  const btn=(name,handler,cls)=>{
    const button=el('button',name,cls);button.type='button';button.onclick=handler;return button;
  };
  const validName=(s,max)=>typeof s==='string'&&s===s.trim()&&s.length>0&&s.length<=max&&
    !/[\u0000-\u001f\u007f-\u009f]/.test(s);
  const validId=s=>typeof s==='string'&&/^[a-f0-9-]{16,50}$/i.test(s);
  const validTimestamp=s=>Number.isSafeInteger(s)&&s>=1600000000000&&s<=Date.now()+86400000;
  const validScore=s=>s===null||(Number.isSafeInteger(s)&&s>=0&&s<=99);
  const validKickoff=n=>n===null||(Number.isSafeInteger(n)&&n>=1577836800000&&n<=4102444800000);
  const validVenue=s=>typeof s==='string'&&s.length<=60&&s===s.trim()&&
    !/[\u0000-\u001f\u007f-\u009f]/.test(s);
  const localDate=n=>{
    if(n===null)return '';
    const d=new Date(n),pad=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+
      pad(d.getHours())+':'+pad(d.getMinutes());
  };
  const uid=()=>crypto.randomUUID?crypto.randomUUID():
    Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const roundsFor=n=>Math.log2(n);
  const key=(round,game)=>'r'+(round+1)+'m'+(game+1);
  const template=n=>{
    const matches=[];
    for(let round=0;round<roundsFor(n);round++){
      for(let game=0;game<n/(2**(round+1));game++){
        matches.push({id:key(round,game),round,game,homeScore:null,awayScore:null,tiebreak:null});
      }
    }
    return matches;
  };
  function fixture(t,round,game){return t.matches.find(m=>m.round===round&&m.game===game);}
  function resolve(t,round,game,seen=new Set()){
    const match=fixture(t,round,game);
    if(!match||seen.has(match.id))return {home:null,away:null,winner:null};
    seen.add(match.id);
    const home=round===0?2*game:resolve(t,round-1,game*2,seen).winner;
    const away=round===0?2*game+1:resolve(t,round-1,game*2+1,seen).winner;
    let winner=null;
    if(home!==null&&away!==null&&match.homeScore!==null&&match.awayScore!==null){
      if(match.homeScore>match.awayScore)winner=home;
      else if(match.awayScore>match.homeScore)winner=away;
      else if(match.tiebreak==='home')winner=home;
      else if(match.tiebreak==='away')winner=away;
    }
    return {home,away,winner};
  }
  function normalize(source){
    if(!source||source.version!==1||!validId(source.id)||!validName(source.name,60)||
      ![2,4,8,16].includes(source.teams?.length)||
      !Array.isArray(source.matches)||!validTimestamp(source.createdAt)||
      !validTimestamp(source.updatedAt)||source.updatedAt<source.createdAt)
      throw Error('Invalid private cup format.');
    const teams=source.teams.slice();
    if(teams.some(n=>!validName(n,35))||
      new Set(teams.map(n=>n.toLocaleLowerCase())).size!==teams.length)
      throw Error('Every cup team must have a unique name of 1–35 characters.');
    const expected=template(teams.length);
    if(source.matches.length!==expected.length)throw Error('Incomplete knockout bracket.');
    const matches=expected.map((m,i)=>{
      const x=source.matches[i];
      const kickoff=x?.kickoff===undefined?null:x.kickoff;
      const venue=x?.venue===undefined?'':x.venue;
      if(!validKickoff(kickoff)||!validVenue(venue))
        throw Error('Invalid private cup kickoff or venue.');
      if(!x||x.id!==m.id||x.round!==m.round||x.game!==m.game||
        !validScore(x.homeScore)||!validScore(x.awayScore)||
        ![null,'home','away'].includes(x.tiebreak))throw Error('Invalid fixture or score.');
      const partial=(x.homeScore===null)!==(x.awayScore===null);
      const tied=x.homeScore!==null&&x.homeScore===x.awayScore;
      if(partial||(tied&&x.tiebreak===null)||(!tied&&x.tiebreak!==null))
        throw Error('A knockout fixture needs two scores and a winner after a draw.');
      return {...m,homeScore:x.homeScore,awayScore:x.awayScore,tiebreak:x.tiebreak,
        kickoff,venue};
    });
    const safe={version:1,id:source.id,name:source.name,teams,matches,
      createdAt:source.createdAt,updatedAt:source.updatedAt};
    for(const m of safe.matches){
      if(m.homeScore===null)continue;
      const {home,away}=resolve(safe,m.round,m.game);
      if(home===null||away===null)
        throw Error('A later result has no qualifying teams.');
    }
    return safe;
  }
  const initial=(name,teams)=>{
    const now=Date.now();
    return normalize({version:1,id:uid(),name,teams,matches:template(teams.length),
      createdAt:now,updatedAt:now});
  };
  let cups=[],active='',message='',showAll=true,storageSnapshot=null;
  let storageUnsafe=false,recoveryDownloaded=false;
  try{
    storageSnapshot=localStorage.getItem(KEY);
    if(storageSnapshot!==null){
      if(storageSnapshot.length>LIMIT)throw Error();
      const parsed=JSON.parse(storageSnapshot);
      if(!Array.isArray(parsed)||parsed.length>MAX)throw Error();
      cups=parsed.map(normalize);
      if(new Set(cups.map(c=>c.id)).size!==cups.length)throw Error();
    }
  }catch{
    cups=[];storageUnsafe=true;
    message='Saved cup data could not be verified. Editing is locked to protect your original results.';
  }
  function save(updated){
    if(storageUnsafe)throw Error('Saved cups are unreadable. Download the original recovery copy before explicitly resetting or editing.');
    if(!Array.isArray(updated)||updated.length>MAX)throw Error('Cup limit reached.');
    const text=JSON.stringify(updated);
    if(text.length>LIMIT)throw Error('Local cup storage is full. Export and remove old cups.');
    // Do not replace writes from another tab with an old in-memory snapshot.
    if(localStorage.getItem(KEY)!==storageSnapshot)
      throw Error('Another tab changed cup data. Reload the page before editing.');
    localStorage.setItem(KEY,text);
    storageSnapshot=text;cups=updated;
    window.dispatchEvent(new Event('fuckball:private-competition-change'));
  }
  const current=()=>storageUnsafe?null:cups.find(c=>c.id===active)||null;
  const main=el('section',null,'knockout-desk');
  main.setAttribute('aria-label','Private knockout cup builder');
  const section=el('details',null,'knockout-disclosure');
  const title=el('summary','🏅 KNOCKOUT CUP BUILDER · OPEN');
  const body=el('div',null,'knockout-body');
  const description=el('p','Organise a private elimination cup with automatically advancing winners. Scores are entered by you; nothing here claims an official online result.');
  const toolbar=el('div',null,'knockout-toolbar');
  const picker=el('select');picker.setAttribute('aria-label','Choose private knockout cup');
  const setup=el('form',null,'knockout-setup');setup.hidden=true;
  const cupName=el('input');cupName.required=true;cupName.maxLength=60;cupName.value='Sunday knockout';
  const names=el('textarea');names.required=true;names.maxLength=650;names.rows=8;
  names.placeholder='One unique team per line\n2, 4, 8 or 16 teams';
  const randomize=el('input');randomize.type='checkbox';randomize.checked=true;
  const create=el('button','Create bracket');create.type='submit';
  const close=btn('Cancel',()=>{setup.hidden=true;});
  const label=(name,input)=>{
    const l=el('label');l.append(el('span',name),input);return l;
  };
  setup.append(label('Cup name',cupName),label('Entrants · one per line',names),
    label('Randomise the initial bracket',randomize),create,close);
  const add=btn('＋ New cup',()=>{setup.hidden=!setup.hidden;if(!setup.hidden)cupName.focus();});
  const exportButton=btn('↓ Save JSON',exportCup);
  const csvButton=btn('↓ Match CSV',exportMatches);
  const calendarButton=btn('↓ Calendar ICS',exportCupCalendar);
  const printButton=btn('Print bracket',()=>{section.open=true;window.print();});
  const importFile=el('input');importFile.type='file';importFile.accept='.json,application/json';importFile.hidden=true;
  const importButton=btn('↑ Restore JSON',()=>importFile.click());
  const deleteButton=btn('Delete cup',deleteCup,'knockout-delete');
  toolbar.append(picker,add,exportButton,csvButton,calendarButton,printButton,importButton,deleteButton,importFile);
  // Corrupt / unsupported local progress must never become an apparently empty
  // cup list that a new Create / Restore / Remove operation can overwrite.
  const recoveryPanel=el('section',null,'knockout-storage-recovery');
  recoveryPanel.hidden=true;recoveryPanel.setAttribute('role','region');
  recoveryPanel.setAttribute('aria-label','Recover existing private knockout cups');
  const recoveryHeading=el('strong','YOUR PRIVATE CUP RESULTS NEED RECOVERY');
  const recoveryText=el('p');
  recoveryText.setAttribute('role','status');
  const recoveryActions=el('div',null,'knockout-storage-recovery-actions');
  const recoveryExport=btn('↓ Download original recovery copy',downloadOriginalCupStorage);
  const recoveryReset=btn('Delete unreadable data & start fresh',resetUnreadableCupStorage,'knockout-delete');
  recoveryActions.append(recoveryExport,recoveryReset);
  recoveryPanel.append(recoveryHeading,recoveryText,recoveryActions);
  const summary=el('div',null,'knockout-progress');
  const seriesHandoff=el('section',null,'knockout-series-handoff');
  const seriesLead=el('div',null,'knockout-series-handoff-copy');
  seriesLead.append(el('strong','⚔ TURN A CUP FINAL INTO A BEST-OF SERIES'),
    el('p','When both finalists are known, create a separate private series. Cup results are never copied, replaced or verified.'));
  const seriesActions=el('div',null,'knockout-series-handoff-actions');
  const seriesFormat=el('select');
  seriesFormat.setAttribute('aria-label','Best-of length for a separate cup-final series');
  for(const n of [3,5,7])seriesFormat.add(new Option('Best of '+n,String(n)));
  const makeSeries=btn('Create final series',()=>{
   const selected=current();
   if(!selected)return info('Select a private knockout cup first.');
   if(localStorage.getItem(KEY)!==storageSnapshot)
    return info('Cup data changed in another tab. Refresh before creating its final series.');
   const teams=resolve(selected,roundsFor(selected.teams.length)-1,0);
   if(teams.home===null||teams.away===null)
    return info('Play the previous cup rounds to determine both finalists first.');
   const bestOf=Number(seriesFormat.value);
   if(![3,5,7].includes(bestOf))return info('Choose best of 3, 5 or 7.');
   const homeTeam=selected.teams[teams.home],awayTeam=selected.teams[teams.away];
   if(!window.confirm('Create a NEW, separate best-of-'+bestOf+' series for '+
     homeTeam+' vs '+awayTeam+'? No cup result is copied or altered; all new games begin unplayed and unverified.'))return;
   window.dispatchEvent(new CustomEvent('fuckball:create-private-series',{
    detail:{sourceId:selected.id,sourceName:selected.name,red:homeTeam,blue:awayTeam,bestOf}
   }));
  });
  seriesActions.append(seriesFormat,makeSeries);
  seriesHandoff.append(seriesLead,seriesActions);seriesHandoff.hidden=true;
  const bracket=el('div',null,'knockout-bracket');bracket.setAttribute('aria-label','Knockout bracket');
  const notification=el('p',null,'knockout-message');notification.setAttribute('role','status');notification.setAttribute('aria-live','polite');
  body.append(description,recoveryPanel,toolbar,setup,summary,seriesHandoff,bracket,notification);
  section.append(title,body);main.append(section);
  const anchor=home.querySelector('.tournament-desk')||home.querySelector('.formation-studio')||
    home.querySelector('.mode-cards');
  if(anchor)anchor.insertAdjacentElement('afterend',main);else home.append(main);
  const info=text=>{message=text;notification.textContent=text;};
  picker.onchange=()=>{active=picker.value;message='';render();};
  window.addEventListener('fuckball:private-series-created',event=>{
   if(event.detail?.ok===true)info('Separate private best-of series created. Cup progress stays unchanged.');
   else if(event.detail?.ok===false)info('Best-of series was not created: '+
    String(event.detail.reason||'Local storage unavailable.').slice(0,160));
  });
  function roundName(round,total){
    const entrants=total/(2**round);
    if(entrants===2)return 'FINAL';
    if(entrants===4)return 'SEMI-FINALS';
    if(entrants===8)return 'QUARTER-FINALS';
    return 'ROUND OF '+entrants;
  }
  function render(){
    recoveryPanel.hidden=!storageUnsafe;
    if(storageUnsafe){
      const readable=storageSnapshot!==null;
      recoveryText.textContent=readable?
        'Saved cup data exists but cannot be safely interpreted. No cup scores, imports, deletions or new cups can overwrite it. Download the exact original bytes first.':
        'Browser storage could not be read. All cup edits are locked. Check browser permissions or reload; nothing has been cleared.';
      recoveryExport.disabled=!readable;
      recoveryReset.disabled=!readable||!recoveryDownloaded;
      setup.hidden=true;
    }
    for(const button of [add,importButton])button.disabled=storageUnsafe;
    picker.disabled=storageUnsafe;
    if(!current()&&cups.length&&!storageUnsafe)active=cups[0].id;
    const c=current();
    picker.replaceChildren(new Option('Choose a cup…',''));
    for(const t of cups)picker.add(new Option(t.name,t.id));
    picker.value=c?.id||'';
    for(const button of [exportButton,csvButton,calendarButton,printButton,deleteButton])button.disabled=!c||storageUnsafe;
    summary.replaceChildren();bracket.replaceChildren();
    notification.textContent=message||'Everything stays private to this browser. Results are manual and unverified.';
    if(!c)return;
    const complete=c.matches.filter(m=>m.homeScore!==null).length;
    const final=resolve(c,roundsFor(c.teams.length)-1,0).winner;
    summary.append(el('strong',c.name),el('span',complete+' / '+c.matches.length+' knockout games recorded'));
    const meter=el('progress');meter.max=c.matches.length;meter.value=complete;meter.setAttribute('aria-label','Cup progress');
    summary.append(meter);
    if(final!==null)summary.append(el('strong','🏆 '+c.teams[final]+' · manually recorded cup winner','knockout-winner'));
    const finalists=resolve(c,roundsFor(c.teams.length)-1,0);
    seriesHandoff.hidden=finalists.home===null||finalists.away===null;
    if(!seriesHandoff.hidden){
     seriesLead.querySelector('p').textContent='Finalists: '+c.teams[finalists.home]+' vs '+
      c.teams[finalists.away]+'. New series games start unplayed; this cup stays unchanged.';
    }
    const cols=el('div',null,'knockout-rounds');
    for(let round=0;round<roundsFor(c.teams.length);round++){
      const column=el('section',null,'knockout-round');
      column.append(el('h3',roundName(round,c.teams.length)));
      for(const match of c.matches.filter(m=>m.round===round)){
        const people=resolve(c,round,match.game);
        const fixture=el('form',null,'knockout-match');
        fixture.dataset.matchId=match.id;
        const title=el('small','MATCH '+String(match.game+1));
        const homeName=people.home===null?'Winner pending':c.teams[people.home];
        const awayName=people.away===null?'Winner pending':c.teams[people.away];
        const homeRow=el('label',null,'knockout-team');
        const awayRow=el('label',null,'knockout-team');
        const hs=el('input');hs.type='number';hs.min='0';hs.max='99';hs.step='1';hs.inputMode='numeric';hs.required=true;
        hs.placeholder='–';hs.setAttribute('aria-label',homeName+' goals');
        const as=el('input');as.type='number';as.min='0';as.max='99';as.step='1';as.inputMode='numeric';as.required=true;
        as.placeholder='–';as.setAttribute('aria-label',awayName+' goals');
        if(match.homeScore!==null)hs.value=String(match.homeScore);
        if(match.awayScore!==null)as.value=String(match.awayScore);
        homeRow.append(el('span',homeName),hs);awayRow.append(el('span',awayName),as);
        const ties=el('select');ties.setAttribute('aria-label','Winner after tied regular-time result');
        ties.add(new Option('Tiebreak winner…',''));
        ties.add(new Option(homeName+' won tiebreak','home'));
        ties.add(new Option(awayName+' won tiebreak','away'));
        ties.value=match.tiebreak||'';
        ties.hidden=!(hs.value!==''&&hs.value===as.value);
        const checkTie=()=>{ties.hidden=!(hs.value!==''&&as.value!==''&&hs.value===as.value);};
        hs.addEventListener('input',checkTie);as.addEventListener('input',checkTie);
        const buttons=el('div',null,'knockout-match-actions');
        const saveButton=el('button',match.homeScore===null?'Record result':'Update result');
        saveButton.type='submit';saveButton.disabled=people.home===null||people.away===null;
        const clear=btn('Clear',()=>{
          try{apply(match,null,null,null);}catch(error){info(error.message||'Unable to clear fixture.');}
        });
        clear.disabled=match.homeScore===null;
        buttons.append(saveButton,clear);
        fixture.append(title,homeRow,awayRow,ties,buttons);
        const schedule=el('details',null,'knockout-match-schedule');
        const scheduleSummary=el('summary',match.kickoff===null?'Set private kickoff':
          'Kickoff · '+new Date(match.kickoff).toLocaleString(undefined,{dateStyle:'short',timeStyle:'short'}));
        const scheduleFields=el('div',null,'knockout-schedule-fields');
        const kickoffField=el('input');kickoffField.type='datetime-local';
        kickoffField.value=localDate(match.kickoff);
        kickoffField.setAttribute('aria-label','Local kickoff for '+homeName+' versus '+awayName);
        const venueField=el('input');venueField.type='text';venueField.maxLength=60;
        venueField.value=match.venue;venueField.placeholder='Optional venue';
        const applySchedule=btn('Save kickoff',()=>{
          const value=kickoffField.value.trim(),place=venueField.value.trim();
          if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
            return info('Choose a valid private local kickoff first.');
          const when=new Date(value).getTime();
          if(!validKickoff(when)||localDate(when)!==value)
            return info('Kickoff is invalid or outside the supported calendar range.');
          try{scheduleMatch(match.id,when,place);}
          catch(error){info(error.message||'Could not save cup kickoff.');}
        });
        const clearSchedule=btn('Remove kickoff',()=>{
          try{scheduleMatch(match.id,null,'');}
          catch(error){info(error.message||'Could not remove kickoff.');}
        });clearSchedule.disabled=match.kickoff===null;
        scheduleFields.append(label('Local date and time',kickoffField),
          label('Venue',venueField),applySchedule,clearSchedule);
        schedule.append(scheduleSummary,scheduleFields);fixture.append(schedule);
        if(people.home===null||people.away===null){
          fixture.classList.add('pending');
          fixture.append(el('small','Finish the preceding fixtures to unlock this match.'));
        }else if(people.winner!==null){
          fixture.append(el('small','Advances: '+c.teams[people.winner],'knockout-advances'));
        }
        fixture.onsubmit=event=>{
          event.preventDefault();
          const score=[hs.value.trim(),as.value.trim()];
          if(score.some(n=>! /^(0|[1-9]\d?)$/.test(n)))
            return info('Record both whole-number scores from 0 to 99.');
          const [h,a]=score.map(Number),tie=h===a?ties.value:null;
          if(h===a&&!['home','away'].includes(tie))
            return info('Choose which team won the tiebreak after a draw.');
          try{apply(match,h,a,tie);}catch(error){info(error.message||'Could not record score.');}
        };
        column.append(fixture);
      }
      cols.append(column);
    }
    bracket.append(cols);
  }
  function scheduleMatch(matchId,kickoff,venue){
    if(!validKickoff(kickoff)||!validVenue(venue))
      throw Error('Cup kickoff time or venue is invalid.');
    const c=current();
    if(!c||!c.matches.some(m=>m.id===matchId))
      throw Error('This private cup fixture is no longer available.');
    const candidate=normalize({...c,updatedAt:Math.max(Date.now(),c.createdAt),
      matches:c.matches.map(m=>m.id===matchId?{...m,kickoff,venue}:m)});
    save(cups.map(item=>item.id===c.id?candidate:item));
    message=kickoff===null?'Private cup kickoff removed.':
      'Private cup kickoff saved. No rooms were created and no invitations were sent.';
    render();
  }
  function apply(match,homeScore,awayScore,tiebreak){
    const c=current();
    if(!c)throw Error('Cup no longer exists.');
    const old=resolve(c,match.round,match.game);
    if(old.home===null||old.away===null)throw Error('Both qualifying teams are required.');
    const candidate={...c,updatedAt:Math.max(Date.now(),c.createdAt),
      matches:c.matches.map(m=>m.id===match.id?{...m,homeScore,awayScore,tiebreak}:m)};
    const newWinner=resolve(candidate,match.round,match.game).winner;
    if(old.winner!==newWinner){
      const affected=[];
      for(let round=match.round+1;round<roundsFor(c.teams.length);round++){
        const slot=Math.floor(match.game/(2**(round-match.round)));
        const f=fixture(candidate,round,slot);
        if(f&&f.homeScore!==null)affected.push(f);
      }
      if(affected.length&&!window.confirm('Changing this winner will clear '+affected.length+
        ' later result(s) on the affected bracket path. Continue?'))return;
      const ids=new Set(affected.map(m=>m.id));
      candidate.matches=candidate.matches.map(m=>ids.has(m.id)?
        {...m,homeScore:null,awayScore:null,tiebreak:null}:m);
    }
    const valid=normalize(candidate);
    save(cups.map(p=>p.id===c.id?valid:p));
    message=homeScore===null?'Private fixture cleared.':
      'Result recorded privately. All advancing teams were recalculated.';
    render();
  }
  setup.onsubmit=event=>{
    event.preventDefault();
    const title=cupName.value.trim();
    const participants=names.value.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
    if(!validName(title,60)||![2,4,8,16].includes(participants.length)||
      participants.some(n=>!validName(n,35))||
      new Set(participants.map(n=>n.toLocaleLowerCase())).size!==participants.length)
      return info('Use a cup name and exactly 2, 4, 8 or 16 unique team names (max 35 characters).');
    if(cups.length>=MAX)return info('Eight local cups maximum; export and remove one first.');
    if(randomize.checked){
      // Cryptographic randomness is for fair local shuffling, NOT trusted tournament seeding.
      for(let i=participants.length-1;i>0;i--){
        const roll=new Uint32Array(1);crypto.getRandomValues(roll);
        const j=roll[0]%(i+1);
        [participants[i],participants[j]]=[participants[j],participants[i]];
      }
    }
    try{
      const cup=initial(title,participants);
      save([...cups,cup]);active=cup.id;setup.hidden=true;
      message='Knockout cup created. Record the actual friendly scores to advance winners.';render();
    }catch(error){info(error.message||'Could not save cup locally.');}
  };
  function deleteCup(){
    const c=current();if(!c||!window.confirm('Delete the private cup "'+c.name+'" and all its manual results?'))return;
    try{save(cups.filter(x=>x.id!==c.id));active='';message='Cup deleted from this browser.';render();}
    catch(error){info(error.message||'Local deletion failed.');}
  }
  function download(filename,content,type){
    const url=URL.createObjectURL(new Blob([content],{type})),anchor=el('a');
    anchor.href=url;anchor.download=filename;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  const slug=c=>'fuckball-cup-'+(c.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)||'private');
  function downloadOriginalCupStorage(){
    if(!storageUnsafe||storageSnapshot===null)return info('No readable original storage to export. Nothing was changed.');
    try{
      const original=localStorage.getItem(KEY);
      if(original!==storageSnapshot)throw Error('Cup data changed in another tab. Reload before downloading the original.');
      // Deliberately preserve original bytes, even if JSON cannot be parsed.
      // A .txt copy is NOT represented as a validated importable backup.
      download('fuckball-knockout-original-recovery.txt',original,'text/plain;charset=utf-8');
      recoveryDownloaded=true;
      message='Original cup storage downloaded as text. Keep this copy safe before considering a reset.';
      render();
    }catch(error){info(error.message||'Could not download original private cup data. No data was changed.');}
  }
  function resetUnreadableCupStorage(){
    if(!storageUnsafe||!recoveryDownloaded||storageSnapshot===null)
      return info('First download the original readable recovery copy. Nothing was deleted.');
    try{
      if(localStorage.getItem(KEY)!==storageSnapshot)
        throw Error('Cup data changed in another tab. Reload before deleting anything.');
      if(!window.confirm('DELETE unreadable private cup data from this browser? Only do this AFTER saving your original recovery copy. This cannot be undone.'))return;
      // The consent applies only to the raw bytes the user backed up.
      if(localStorage.getItem(KEY)!==storageSnapshot)
        throw Error('Cup data changed while confirming. Reload; no data was deleted.');
      localStorage.removeItem(KEY);
      if(localStorage.getItem(KEY)!==null)throw Error('Browser did not confirm removal. Reload to inspect your saved cups.');
      storageSnapshot=null;storageUnsafe=false;recoveryDownloaded=false;
      cups=[];active='';message='Original recovery copy retained in your downloads. Empty private cups are now unlocked.';
      render();
      window.dispatchEvent(new Event('fuckball:private-competition-change'));
    }catch(error){info(error.message||'Reset was refused. Existing cup data was not deliberately overwritten.');}
  }
  function exportCup(){
    const c=current();if(!c)return;
    download(slug(c)+'.json',JSON.stringify({...c,note:'Manual, unverified friendly results'},null,2),'application/json');
    info('Private cup backup downloaded as JSON.');
  }
  const csvField=value=>{
    let s=String(value);
    if(/^[\s]*[=+@\-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  function exportMatches(){
    const c=current();if(!c)return;
    const rows=[['Round','Match','Home','Away','Kickoff UTC','Venue','Home goals','Away goals','Tiebreak','Winner','Status']];
    for(const m of c.matches){
      const r=resolve(c,m.round,m.game);
      rows.push([roundName(m.round,c.teams.length),m.id,
        r.home===null?'TBD':c.teams[r.home],r.away===null?'TBD':c.teams[r.away],
        m.kickoff===null?'':new Date(m.kickoff).toISOString(),m.venue,
        m.homeScore===null?'':m.homeScore,m.awayScore===null?'':m.awayScore,
        m.tiebreak||'',r.winner===null?'':c.teams[r.winner],
        m.homeScore===null?'Pending':'Manual · unverified']);
    }
    download(slug(c)+'-matches.csv','\uFEFF'+rows.map(r=>r.map(csvField).join(',')).join('\r\n')+'\r\n',
      'text/csv;charset=utf-8');
    info('Unofficial private cup schedule and results downloaded.');
  }
  function exportCupCalendar(){
    const c=current();if(!c)return;
    const scheduled=c.matches.filter(m=>m.kickoff!==null);
    if(!scheduled.length)return info('Set a private kickoff on a cup match before exporting its calendar.');
    const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;')
      .replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
    const stamp=n=>new Date(n).toISOString().replace(/[-:]/g,'')
      .replace(/\.\d{3}Z$/,'Z');
    const fold=s=>{
      let line='',column=0;
      for(const ch of s){
        const size=new TextEncoder().encode(ch).length;
        if(column+size>72){line+='\r\n ';column=1;}
        line+=ch;column+=size;
      }
      return line;
    };
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN',
      'PRODID:-//Fuckball//Private Knockout Cup//EN'];
    for(const m of scheduled){
      const r=resolve(c,m.round,m.game);
      const home=r.home===null?'Qualifier to be decided':c.teams[r.home];
      const away=r.away===null?'Qualifier to be decided':c.teams[r.away];
      lines.push('BEGIN:VEVENT','UID:'+m.id+'.'+c.id+'@local.fuckball',
        'DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(m.kickoff),'DURATION:PT1H',
        'SUMMARY:'+escape(home+' vs '+away+' · '+c.name),
        'DESCRIPTION:'+escape('Private knockout friendly. Qualifiers and results are manually recorded, not server-verified.'),
        ...(m.venue?['LOCATION:'+escape(m.venue)]:[]),'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    download(slug(c)+'-private-calendar.ics',lines.map(fold).join('\r\n')+'\r\n',
      'text/calendar;charset=utf-8');
    info(scheduled.length+' tentative private cup kickoffs saved in an ICS calendar. No invitations sent.');
  }
  importFile.onchange=async()=>{
    const file=importFile.files?.[0];importFile.value='';
    if(!file)return;
    if(file.size<=0||file.size>48*1024)return info('Choose a JSON backup smaller than 48 KiB.');
    if(cups.length>=MAX)return info('Export and delete a cup before restoring another.');
    try{
      const source=normalize(JSON.parse(await file.text()));
      if(!window.confirm('Restore "'+source.name+'" as an additional private cup?'))return;
      const now=Date.now(),copy=normalize({...source,id:uid(),createdAt:now,updatedAt:now});
      save([...cups,copy]);active=copy.id;message='Backup restored as a separate local cup.';render();
    }catch(error){info('Import refused: '+(error.message||'Invalid cup backup.'));}
  };
  // Player-initiated league qualifier handoff. All winners stay user-entered.
  window.addEventListener('fuckball:create-private-playoff',event=>{
    const d=event.detail;
    const reply=(ok,reason='')=>window.dispatchEvent(new CustomEvent(
      'fuckball:private-playoff-created',{detail:{ok,reason}}));
    if(!d||typeof d.sourceId!=='string'||!validId(d.sourceId)||
      !validName(d.sourceName,60)||![2,4,8].includes(d.teams?.length)||
      d.teams.some(n=>!validName(n,35))||
      new Set(d.teams.map(n=>n.toLocaleLowerCase())).size!==d.teams.length||
      !Number.isSafeInteger(d.recorded)||d.recorded<1||
      !Number.isSafeInteger(d.total)||d.total<d.recorded||d.total>132)
      return reply(false,'The selected league qualifiers are invalid.');
    if(cups.length>=MAX)return reply(false,'The eight private cup slots are full.');
    try{
      const title=('Playoffs · '+d.sourceName).slice(0,60).trim();
      const created=initial(title,d.teams.slice());
      save([...cups,created]);
      active=created.id;message='Seeded from your self-reported league standings · not verified online.';
      section.open=true;render();reply(true);
      main.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
        'auto':'smooth',block:'start'});
      picker.focus({preventScroll:true});
    }catch(error){reply(false,error.message||'Local cup storage could not be updated.');}
  });
  window.addEventListener('fuckball:open-private-competition',event=>{
    const ref=event.detail;
    if(ref?.type!=='Knockout'||typeof ref.id!=='string')return;
    const selected=cups.find(c=>c.id===ref.id);
    if(!selected)return info('This private cup no longer exists.');
    active=selected.id;message='Opened '+selected.name+' · results are manually entered.';
    section.open=true;render();
    main.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
      'auto':'smooth',block:'start'});
    picker.focus({preventScroll:true});
  });
  // External Matchday Hub actions only locate the existing private cup form.
  // They cannot write results or bypass qualifying teams/tiebreak validation.
  window.addEventListener('fuckball:open-private-cup-fixture',event=>{
    const request=event.detail;
    if(!request||typeof request.cupId!=='string'||
      typeof request.matchId!=='string')return;
    const selectedCup=cups.find(c=>c.id===request.cupId);
    const match=selectedCup?.matches.find(m=>m.id===request.matchId);
    if(!match)return info('This private cup match is no longer available.');
    active=selectedCup.id;section.open=true;
    message='Editing an unofficial private knockout result. Winners advance only via the saved bracket.';
    render();
    const target=Array.from(bracket.querySelectorAll('.knockout-match')).find(el=>
      el.dataset.matchId===match.id);
    if(!target)return info('The selected match could not be displayed.');
    target.classList.add('knockout-match-target');
    target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
      'auto':'smooth',block:'center'});
    const input=target.querySelector('input[type="number"]:not(:disabled)');
    if(input?.closest('form')?.querySelector('button[type="submit"]:not(:disabled)'))
      input.focus({preventScroll:true});
    else info('Complete the preceding cup matches before this knockout fixture can be scored.');
  });
  window.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    try{
      const p=event.newValue?JSON.parse(event.newValue):[];
      if(!Array.isArray(p)||p.length>MAX||event.newValue?.length>LIMIT)throw Error();
      const incoming=p.map(normalize);
      if(new Set(incoming.map(x=>x.id)).size!==incoming.length)throw Error();
      cups=incoming;storageSnapshot=event.newValue;
      storageUnsafe=false;recoveryDownloaded=false;
      message='Private cup list refreshed from another tab.';render();
    }catch{
      // An invalid update from another tab must not leave earlier cups looking
      // editable when the actual stored collection is no longer trustworthy.
      cups=[];active='';storageSnapshot=event.newValue;
      storageUnsafe=true;recoveryDownloaded=false;
      message='Another tab saved unreadable cup data. Writes are locked; preserve the original before resetting.';
      render();
    }
  });
  render();
})();