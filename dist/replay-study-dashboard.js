'use strict';
// Browser-private study overview across real, locally saved HBR2 replay notes.
(function(){
 const games=document.getElementById('gamesView');
 if(!games||typeof ReplayLibrary==='undefined')return;
 const e=(tag,content='',cls='')=>{
  const el=document.createElement(tag);el.textContent=content;
  if(cls)el.className=cls;return el;
 };
 const main=e('section','','replay-study-dashboard');
 main.setAttribute('aria-label','Private cross-replay study dashboard');
 const heading=e('header','','study-head'),title=e('div');
 title.append(e('span','MY GAMES · PRIVATE TRAINING','study-eyebrow'),
  e('h2','REPLAY STUDY HUB.'),e('p','Find repeated decisions across your own saved HBR2 recordings and jump to the original frame. This is personal coaching, not official match analysis.'));
 const refresh=e('button','↻ Refresh insights');refresh.type='button';
 heading.append(title,refresh);
 const controls=e('div','','study-controls');
 const searchLabel=e('label','Find an observation'),search=e('input');
 search.type='search';search.placeholder='Replay, note, training goal';search.maxLength=120;
 search.setAttribute('aria-label','Search personal replay notes');searchLabel.append(search);
 const focusLabel=e('label','Training theme'),focus=e('select');
 for(const [id,text] of [['all','All themes'],['decision','Decision-making'],['positioning','Positioning'],
  ['passing','Passing'],['defense','Defending'],['finishing','Finishing'],['other','Other']])focus.add(new Option(text,id));
 focusLabel.append(focus);
 const periodLabel=e('label','Recording age'),period=e('select');
 for(const [id,text] of [['all','All recordings'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']])period.add(new Option(text,id));
 periodLabel.append(period);
 controls.append(searchLabel,focusLabel,periodLabel);
 const overview=e('div','','study-overview'),list=e('ol','','study-results');
 const reportPanel=e('section','','study-reports');
 const reportSummary=e('p','Only your currently filtered local notes are exported. This is an annotation report, not a performance score.');
 const reportActions=e('div','','study-report-actions');
 const exportCSV=e('button','↓ Filtered notes CSV');exportCSV.type='button';
 const exportTXT=e('button','↓ Training debrief TXT');exportTXT.type='button';
 reportActions.append(exportCSV,exportTXT);reportPanel.append(
  e('h3','YOUR PRIVATE REPLAY DEBRIEF'),reportSummary,reportActions);
 const more=e('button','Show more observations');more.type='button';more.className='study-more';
 const status=e('p','','study-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 main.append(heading,controls,overview,reportPanel,list,more,status);
 // Keep this separate from replay queue ownership and its auto-next logic.
 const anchor=games.querySelector('.replay-review-queue')||games.querySelector('.replay-compare-studio')||
  document.getElementById('gamesList');
 games.insertBefore(main,anchor);
 const frameStamp=n=>Math.floor(n/3600)+':'+String(Math.floor(n%3600/60)).padStart(2,'0');
 const validId=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
 let observations=[],visible=20,loading=false,opening=false,generation=0,invalid=0;
 const labels={decision:'Decision-making',positioning:'Positioning',passing:'Passing',
  defense:'Defending',finishing:'Finishing',other:'Other'};
 const now=()=>Date.now();
 function matched(item){
  const term=search.value.trim().toLocaleLowerCase(),days=Number(period.value);
  return (focus.value==='all'||focus.value===item.category)&&
   (!Number.isFinite(days)||days===0||item.recordedAt>=now()-days*86400000)&&
   (!term||[item.label,item.text,item.name,item.category].some(value=>value.toLocaleLowerCase().includes(term)));
 }
 function view(){
  const selected=observations.filter(matched);
  const recordings=new Set(selected.map(n=>n.id)).size;
  const counts=new Map();
  for(const entry of selected)counts.set(entry.category,(counts.get(entry.category)||0)+1);
  overview.replaceChildren();
  exportCSV.disabled=exportTXT.disabled=!selected.length||loading||opening;
  const intro=e('strong',selected.length+' saved observations · '+recordings+' recordings');
  overview.append(intro);
  for(const [category,total] of [...counts].sort((a,b)=>b[1]-a[1])){
   const chip=e('span',labels[category]+': '+total,'study-chip');overview.append(chip);
  }
  list.replaceChildren();
  if(!selected.length){
   list.append(e('li',observations.length?'No saved notes match these filters.':'No saved timeline notes yet. Open a saved replay and add notes to build your personal study hub.','study-empty'));
  }
  for(const note of selected.slice(0,visible)){
   const row=e('li','','study-entry'),content=e('div','','study-entry-copy');
   const top=e('div','','study-entry-top');
   top.append(e('span',frameStamp(note.frameNo),'study-time'),e('span',labels[note.category],'study-category'));
   const savedDate=new Date(note.recordedAt).toLocaleDateString();
   content.append(top,e('strong',note.label),e('p',note.text),
    e('small',note.name+' · recording saved '+savedDate));
   const open=e('button','▶ Review moment');open.type='button';
   open.setAttribute('aria-label','Open '+note.name+' at '+frameStamp(note.frameNo));
   open.onclick=()=>jump(note);
   row.append(content,open);list.append(row);
  }
  more.hidden=selected.length<=visible;
  more.textContent='Show more ('+(selected.length-visible)+' remaining)';
  if(!loading&&!opening)status.textContent='Showing '+Math.min(visible,selected.length)+' of '+selected.length+' private observations'+
   (invalid?' · '+invalid+' recordings skipped because their notes could not be read':'')+'.';
 }
 
 // Export only actual saved observation metadata; no replay file, image or account is uploaded.
 function filteredNotes(){return observations.filter(matched);}
 function downloadReport(content,name,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 function cleanLine(value){return String(value??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').slice(0,600);}
 const savedUTC=value=>Number.isFinite(new Date(value).getTime())?new Date(value).toISOString():'Unknown';
 function reportNotes(){
  const entries=filteredNotes();
  if(!entries.length||loading||opening)return null;
  return entries.slice().sort((a,b)=>b.recordedAt-a.recordedAt||a.frameNo-b.frameNo);
 }
 function exportObservationsCSV(){
  const notes=reportNotes();if(!notes)return;
  const cell=input=>{
   let value=cleanLine(input);
   if(/^\s*[=+\-@]/.test(value))value="'"+value;
   return '"'+value.replace(/"/g,'""')+'"';
  };
  const rows=[['Replay name','Date saved (UTC)','Replay time','Theme','Note title','Observation'],
   ...notes.map(n=>[n.name,savedUTC(n.recordedAt),frameStamp(n.frameNo),
    labels[n.category]||'Other',n.label,n.text])];
  downloadReport('\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n',
   'fuckball-private-replay-study.csv','text/csv;charset=utf-8');
  status.textContent='Downloaded '+notes.length+' local observations from the selected filters. No replay content or account information was sent.';
 }
 function exportTrainingDebrief(){
  const notes=reportNotes();if(!notes)return;
  const unique=new Set(notes.map(n=>n.id)).size;
  const counts=new Map();
  for(const n of notes)counts.set(n.category,(counts.get(n.category)||0)+1);
  const themes=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const out=[
   'FUCKBALL · PERSONAL REPLAY DEBRIEF',
   'Player-written annotations on locally saved HBR2 recordings.',
   'Not verified match performance, AI analysis, an Elo or an assessment of skill.',
   '',
   'Selected filters: '+cleanLine(search.value||'none')+
    ' | '+cleanLine(focus.selectedOptions[0]?.textContent||'all')+
    ' | '+cleanLine(period.selectedOptions[0]?.textContent||'all'),
   'Observations: '+notes.length+' | Source recordings: '+unique,
   'The most annotated theme is not necessarily the weakest skill.',
   '',
   'ANNOTATED THEMES (NUMBER OF SAVED NOTES)',
   ...themes.map(([theme,count])=>'  '+(labels[theme]||'Other')+': '+count),
   '',
   'PERSONAL STUDY TIMELINE'
  ];
  for(const n of notes){
   out.push('');
   out.push(cleanLine(n.name)+' · '+savedUTC(n.recordedAt).slice(0,10)+
    ' · '+frameStamp(n.frameNo)+' · '+(labels[n.category]||'Other'));
   out.push('  '+cleanLine(n.label));
   if(n.text)out.push('  '+cleanLine(n.text));
  }
  out.push('','These notes remain local until you choose to share the downloaded file.');
  downloadReport(out.join('\r\n')+'\r\n','fuckball-private-replay-debrief.txt',
   'text/plain;charset=utf-8');
  status.textContent='Downloaded a personal study debrief from '+notes.length+' saved annotations. No server data changed.';
 }
 exportCSV.addEventListener('click',exportObservationsCSV);
 exportTXT.addEventListener('click',exportTrainingDebrief);

 async function jump(note){
  if(opening||loading||!validId(note.id))return;
  opening=true;status.textContent='Opening stored replay at '+frameStamp(note.frameNo)+'…';
  try{
   const saved=await ReplayLibrary.get(note.id);
   if(saved.item.id!==note.id||saved.bytes.length>32*1048576)
    throw Error('This replay is no longer available.');
   // Re-check the note against currently saved metadata; a deleted note is not a valid cue.
   const verified=ReplayLibrary.normalizeNotes(saved.item.notes,saved.item.frames)
    .find(n=>n.frameNo===note.frameNo&&n.label===note.label);
   if(!verified)throw Error('This note was changed or removed. Refresh the study hub.');
   loadReplay(saved.bytes,saved.item.name);
   activeLocalReplayId=note.id;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   if(activeLocalReplayId!==note.id||!replay)return;
   const timestamp=Math.max(0,verified.frameNo*1000/60);
   replay.setTime(Math.min(timestamp,replay.length()));
   replay.setSpeed(0);
   document.getElementById('replayToggle').textContent='▶';
  }catch(error){status.textContent='Could not open study moment: '+(error.message||'Local replay unavailable');}
  finally{opening=false;}
 }
 async function load(){
  if(loading||opening)return;
  const token=++generation;loading=true;refresh.disabled=true;let succeeded=false;
  status.textContent='Reading your saved offline replay notes…';
  try{
   const raw=await ReplayLibrary.list(),updated=[];let skipped=0;
   for(const item of raw.slice(0,30)){
    if(!validId(item.id)||typeof item.name!=='string'||!Number.isSafeInteger(item.createdAt))continue;
    try{
     const notes=ReplayLibrary.normalizeNotes(item.notes,item.frames);
     for(const note of notes){
      updated.push({...note,id:item.id,name:item.name.slice(0,100),recordedAt:item.createdAt});
     }
    }catch{skipped++;}
   }
   if(token!==generation)return;
   observations=updated.sort((a,b)=>b.recordedAt-a.recordedAt||a.frameNo-b.frameNo);
   invalid=skipped;visible=20;succeeded=true;
  }catch(error){status.textContent='Cannot load private study notes: '+(error.message||'Browser storage unavailable');}
  finally{loading=false;refresh.disabled=false;if(succeeded)view();}
 }
 search.oninput=()=>{visible=20;view();};
 focus.onchange=period.onchange=()=>{visible=20;view();};
 more.onclick=()=>{visible+=20;view();};
 refresh.onclick=load;
 // Refresh when returning to My Games after adding notes in a replay.
 document.getElementById('tabReplay')?.addEventListener('click',load);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!games.hidden)load();});
 load();
})();