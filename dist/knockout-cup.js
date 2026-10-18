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
      if(!x||x.id!==m.id||x.round!==m.round||x.game!==m.game||
        !validScore(x.homeScore)||!validScore(x.awayScore)||
        ![null,'home','away'].includes(x.tiebreak))throw Error('Invalid fixture or score.');
      const partial=(x.homeScore===null)!==(x.awayScore===null);
      const tied=x.homeScore!==null&&x.homeScore===x.awayScore;
      if(partial||(tied&&x.tiebreak===null)||(!tied&&x.tiebreak!==null))
        throw Error('A knockout fixture needs two scores and a winner after a draw.');
      return {...m,homeScore:x.homeScore,awayScore:x.awayScore,tiebreak:x.tiebreak};
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
    cups=[];message='Saved cups could not be verified. Restore a valid private backup.';
  }
  function save(updated){
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
  const current=()=>cups.find(c=>c.id===active)||null;
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
  const printButton=btn('Print bracket',()=>{section.open=true;window.print();});
  const importFile=el('input');importFile.type='file';importFile.accept='.json,application/json';importFile.hidden=true;
  const importButton=btn('↑ Restore JSON',()=>importFile.click());
  const deleteButton=btn('Delete cup',deleteCup,'knockout-delete');
  toolbar.append(picker,add,exportButton,csvButton,printButton,importButton,deleteButton,importFile);
  const summary=el('div',null,'knockout-progress');
  const bracket=el('div',null,'knockout-bracket');bracket.setAttribute('aria-label','Knockout bracket');
  const notification=el('p',null,'knockout-message');notification.setAttribute('role','status');notification.setAttribute('aria-live','polite');
  body.append(description,toolbar,setup,summary,bracket,notification);
  section.append(title,body);main.append(section);
  const anchor=home.querySelector('.tournament-desk')||home.querySelector('.formation-studio')||
    home.querySelector('.mode-cards');
  if(anchor)anchor.insertAdjacentElement('afterend',main);else home.append(main);
  const info=text=>{message=text;notification.textContent=text;};
  picker.onchange=()=>{active=picker.value;message='';render();};
  function roundName(round,total){
    const entrants=total/(2**round);
    if(entrants===2)return 'FINAL';
    if(entrants===4)return 'SEMI-FINALS';
    if(entrants===8)return 'QUARTER-FINALS';
    return 'ROUND OF '+entrants;
  }
  function render(){
    if(!current()&&cups.length)active=cups[0].id;
    const c=current();
    picker.replaceChildren(new Option('Choose a cup…',''));
    for(const t of cups)picker.add(new Option(t.name,t.id));
    picker.value=c?.id||'';
    for(const button of [exportButton,csvButton,printButton,deleteButton])button.disabled=!c;
    summary.replaceChildren();bracket.replaceChildren();
    notification.textContent=message||'Everything stays private to this browser. Results are manual and unverified.';
    if(!c)return;
    const complete=c.matches.filter(m=>m.homeScore!==null).length;
    const final=resolve(c,roundsFor(c.teams.length)-1,0).winner;
    summary.append(el('strong',c.name),el('span',complete+' / '+c.matches.length+' knockout games recorded'));
    const meter=el('progress');meter.max=c.matches.length;meter.value=complete;meter.setAttribute('aria-label','Cup progress');
    summary.append(meter);
    if(final!==null)summary.append(el('strong','🏆 '+c.teams[final]+' · manually recorded cup winner','knockout-winner'));
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
    const rows=[['Round','Match','Home','Away','Home goals','Away goals','Tiebreak','Winner','Status']];
    for(const m of c.matches){
      const r=resolve(c,m.round,m.game);
      rows.push([roundName(m.round,c.teams.length),m.id,
        r.home===null?'TBD':c.teams[r.home],r.away===null?'TBD':c.teams[r.away],
        m.homeScore===null?'':m.homeScore,m.awayScore===null?'':m.awayScore,
        m.tiebreak||'',r.winner===null?'':c.teams[r.winner],
        m.homeScore===null?'Pending':'Manual · unverified']);
    }
    download(slug(c)+'-matches.csv','\uFEFF'+rows.map(r=>r.map(csvField).join(',')).join('\r\n')+'\r\n',
      'text/csv;charset=utf-8');
    info('Unofficial private cup schedule and results downloaded.');
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
      cups=incoming;storageSnapshot=event.newValue;message='Private cup list refreshed from another tab.';render();
    }catch{info('A second tab changed cup data. Reload to inspect it before editing.');}
  });
  render();
})();