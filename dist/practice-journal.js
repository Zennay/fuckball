'use strict';
// Browser-private journal of genuinely completed LOCAL human-vs-AI games.
// Never accepts remote scores, creates ranked results or touches multiplayer.
(function(){
 const games=document.getElementById('gamesView');
 if(!games)return;
 const KEY='fuckball.local-practice-journal.v1',MAX=30;
 const modes={bot:'1v1 vs AI',practice:'Solo practice','2v2':'2v2 practice','4v4':'4v4 practice'};
 const focusOptions={none:'No focus set',finishing:'Finishing',passing:'Passing',defense:'Defending',positioning:'Positioning',decision:'Decision-making'};
 const panel=document.createElement('section');panel.className='local-practice-journal';
 panel.setAttribute('aria-label','Private local practice journal');
 const header=document.createElement('div');header.className='local-journal-heading';
 const headline=document.createElement('div');
 const title=document.createElement('h2');title.textContent='PRACTICE JOURNAL.';
 const subtitle=document.createElement('p');subtitle.textContent='Real completed solo-vs-AI matches on this device. Not ranked, online or server-verified. Only this browser can see them.';
 headline.append(title,subtitle);
 const count=document.createElement('span');count.className='local-journal-count';
 header.append(headline,count);
 const controls=document.createElement('div');controls.className='local-journal-controls';
 const filterLabel=document.createElement('label');filterLabel.textContent='Outcome';
 const filter=document.createElement('select');filter.setAttribute('aria-label','Filter local matches by result');
 for(const [v,label]of [['all','All results'],['win','Wins'],['loss','Losses'],['draw','Draws']])filter.add(new Option(label,v));
 filterLabel.append(filter);
 const focusFilterLabel=document.createElement('label');focusFilterLabel.textContent='Training focus';
 const focusFilter=document.createElement('select');focusFilter.setAttribute('aria-label','Filter by personal practice focus');
 for(const [value,name]of [['all','All focuses'],...Object.entries(focusOptions)])focusFilter.add(new Option(name,value));
 focusFilterLabel.append(focusFilter);
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Export local history';
 const clearButton=document.createElement('button');clearButton.type='button';clearButton.textContent='Clear journal';clearButton.className='danger';
 const refreshButton=document.createElement('button');refreshButton.type='button';
 refreshButton.textContent='↻ Reload saved journal';
 controls.append(filterLabel,focusFilterLabel,exportButton,clearButton,refreshButton);
 const recovery=document.createElement('aside');recovery.className='local-journal-recovery';
 recovery.setAttribute('role','region');recovery.setAttribute('aria-label','Journal data recovery');
 recovery.hidden=true;
 const recoveryTitle=document.createElement('strong');
 recoveryTitle.textContent='YOUR SAVED JOURNAL NEEDS RECOVERY';
 const recoveryDetails=document.createElement('p');
 const recoveryActions=document.createElement('div');recoveryActions.className='local-journal-recovery-actions';
 const rawBackup=document.createElement('button');rawBackup.type='button';
 rawBackup.textContent='↓ Export original raw journal';
 const resetDamaged=document.createElement('button');resetDamaged.type='button';
 resetDamaged.className='danger';resetDamaged.textContent='Reset damaged journal';
 recoveryActions.append(rawBackup,resetDamaged);
 recovery.append(recoveryTitle,recoveryDetails,recoveryActions);
 let requestedRawBackup=null;
 const stats=document.createElement('div');stats.className='local-journal-stats';
 const list=document.createElement('div');list.className='local-journal-list';
 list.setAttribute('aria-label','Completed local practice matches');
 const feedback=document.createElement('p');feedback.className='local-journal-feedback';
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 panel.append(header,controls,recovery,stats,list,feedback);games.append(panel);
 function clean(entry){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const {at,mode,stadium,side,red,blue,seconds}=entry;
  if(!Number.isSafeInteger(at)||at<=0||at>Date.now()+86400000)return null;
  if(!Object.hasOwn(modes,mode)||![1,2].includes(side))return null;
  if(!Number.isSafeInteger(red)||red<0||red>999||!Number.isSafeInteger(blue)||blue<0||blue>999)return null;
  if(!Number.isSafeInteger(seconds)||seconds<1||seconds>14400)return null;
  if(typeof stadium!=='string'||stadium.length>48)return null;
  const focus=typeof entry.focus==='string'&&Object.hasOwn(focusOptions,entry.focus)?entry.focus:'none';
  const note=typeof entry.note==='string'?entry.note.slice(0,240):'';
  // The legacy journal had no evidence of a real native opponent. Preserve
  // its historical rows, but never upgrade them into proven AI game receipts.
  return {at,mode,stadium,side,red,blue,seconds,focus,note,
   aiOpponent:entry.aiOpponent===true};
 }
 // Invalid or unreadable storage is not an empty journal. In particular, a
 // failed JSON parse must never be replaced by a freshly completed game.
 // Preserve the original raw bytes for an intentional private-device export.
 function snapshot(){
  let raw;
  try{raw=localStorage.getItem(KEY);}catch{
   return{items:[],raw:null,error:'unavailable'};
  }
  if(raw===null)return{items:[],raw:null,error:null};
  let entries;
  try{entries=JSON.parse(raw);}catch{
   return{items:[],raw,error:'corrupt'};
  }
  if(!Array.isArray(entries)||entries.length>MAX||
     entries.some(entry=>clean(entry)===null))
   return{items:[],raw,error:'corrupt'};
  return{items:entries.map(clean),raw,error:null};
 }
 function read(){return snapshot().items;}
 // localStorage is not transactional. Re-read immediately before writing and
 // verify the bytes afterwards; never claim a save on a stale/invalid base.
 function persist(entries,expectedRaw){
  if(!Array.isArray(entries)||entries.some(e=>clean(e)===null))
   return{ok:false,reason:'invalid'};
  const payload=JSON.stringify(entries.slice(0,MAX));
  try{
   const latest=snapshot();
   if(latest.error)return{ok:false,reason:latest.error};
   if(expectedRaw!==latest.raw)return{ok:false,reason:'changed'};
   localStorage.setItem(KEY,payload);
   return localStorage.getItem(KEY)===payload?
    {ok:true}:{ok:false,reason:'unverified'};
  }catch{return{ok:false,reason:'unavailable'};}
 }
 const outcome=e=>{
  const ours=e.side===1?e.red:e.blue,theirs=e.side===1?e.blue:e.red;
  return ours>theirs?'win':ours<theirs?'loss':'draw';
 };
 const duration=e=>Math.floor(e.seconds/60)+'m '+String(e.seconds%60).padStart(2,'0')+'s';
 function render(){
  const stored=snapshot(),items=stored.items;
  recovery.hidden=!stored.error;
  if(stored.error){
   recoveryDetails.textContent=stored.error==='unavailable'?
    'The browser cannot read local storage. Results and notes cannot be safely saved until access is restored.':
    'Saved journal data is unreadable or has an unsupported shape. Its original bytes are still stored; no new match or note will overwrite them. Export the raw backup before choosing any reset.';
   rawBackup.hidden=stored.error!=='corrupt';
   resetDamaged.hidden=stored.error!=='corrupt';
   resetDamaged.disabled=stored.error!=='corrupt'||requestedRawBackup!==stored.raw;
  }
  const wins=items.filter(e=>outcome(e)==='win').length,
   losses=items.filter(e=>outcome(e)==='loss').length,draws=items.length-wins-losses;
  count.textContent=items.length+' / '+MAX+' local matches';
  stats.replaceChildren();
  const lastFive=items.slice(0,5);
  const recent=lastFive.length?lastFive.map(e=>({win:'W',draw:'D',loss:'L'})[outcome(e)]).join(' · '):'—';
  for(const [label,value]of [['Completed',items.length],['Wins',wins],['Draws',draws],['Losses',losses],['Last 5 form',recent]]){
   const tile=document.createElement('div'),num=document.createElement('strong'),caption=document.createElement('span');
   tile.className='local-journal-stat';num.textContent=String(value);caption.textContent=label;
   tile.append(num,caption);stats.append(tile);
  }
  const filtered=items.map((e,index)=>({e,index})).filter(({e})=>
   (filter.value==='all'||outcome(e)===filter.value)&&
   (focusFilter.value==='all'||e.focus===focusFilter.value));
  list.replaceChildren();
  if(!filtered.length){
   const empty=document.createElement('p');empty.className='local-journal-empty';
   empty.textContent=items.length?'No local matches match this filter.':'Complete a local Solo Practice game to record your first result here. Stopping/resetting manually does not count as finishing.';
   list.append(empty);
  }
  for(const {e,index} of filtered){
   const row=document.createElement('article');row.className='local-journal-row';
   const result=document.createElement('b');const kind=outcome(e);
   result.className='local-journal-outcome '+kind;result.textContent=kind==='win'?'WIN':kind==='loss'?'LOSS':'DRAW';
   const body=document.createElement('div');body.className='local-journal-match';
   const name=document.createElement('strong');name.textContent=modes[e.mode]+' · '+e.red+' – '+e.blue;
   const meta=document.createElement('span');
   meta.textContent='You: '+(e.side===1?'Red':'Blue')+' · '+(e.stadium||'Custom field')+
    ' · '+duration(e)+' · '+new Date(e.at).toLocaleString()+
    (e.aiOpponent?' · Native opposing AI verified':' · Legacy opponent not verified');
   const coaching=document.createElement('details');coaching.className='local-journal-coaching';
   const summary=document.createElement('summary');
   summary.textContent='Personal notes · '+focusOptions[e.focus]+(e.note?' · saved':'');
   const form=document.createElement('div');form.className='local-journal-edit';
   // When another tab updates this journal, preserve any unsaved human text
   // instead of blindly replacing the open DOM editor during a storage event.
   form.dataset.dirty='false';
   const focusLabel=document.createElement('label');focusLabel.textContent='Focus this match';
   const pick=document.createElement('select');
   pick.setAttribute('aria-label','Match '+new Date(e.at).toLocaleDateString()+' focus');
   for(const [key,label]of Object.entries(focusOptions))pick.add(new Option(label,key));
   pick.value=e.focus;focusLabel.append(pick);
   const noteLabel=document.createElement('label');noteLabel.textContent='What went well? What to improve? (240 characters)';
   const note=document.createElement('textarea');note.maxLength=240;note.rows=3;
   note.placeholder='E.g. I pressed too early; aim for the free corner next game.';
   note.value=e.note;noteLabel.append(note);
   pick.addEventListener('change',()=>{form.dataset.dirty='true';});
   note.addEventListener('input',()=>{form.dataset.dirty='true';});
   const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='Save private note';
   save.addEventListener('click',()=>{
    const latest=snapshot();
    if(latest.error){
     feedback.textContent='Journal storage cannot be safely read. Your unsaved note is preserved here; recover the raw journal first.';
     return;
    }
    const current=latest.items,item=current[index];
    // Match identity and both original editor values must still be current.
    // Otherwise saving a stale open editor could erase another tab's notes.
    if(!item||item.at!==e.at||item.mode!==e.mode||item.stadium!==e.stadium||
       item.side!==e.side||item.red!==e.red||item.blue!==e.blue||
       item.seconds!==e.seconds||item.aiOpponent!==e.aiOpponent||
       item.focus!==e.focus||item.note!==e.note){
     feedback.textContent='This match or its coaching note changed in another tab. Your draft is still here. Reload saved journal before editing.';
     return;
    }
    item.focus=pick.value;item.note=note.value.trim().slice(0,240);
    const saved=persist(current,latest.raw);
    if(!saved.ok){
     feedback.textContent='Note not saved ('+saved.reason+'). Your draft remains here; reload or recover saved data before retrying.';
     return;
    }
    feedback.textContent='Coaching focus and note verified on this device.';
    render();
   });
   form.append(focusLabel,noteLabel,save);coaching.append(summary,form);
   body.append(name,meta,coaching);row.append(result,body);list.append(row);
  }
  exportButton.disabled=clearButton.disabled=!!stored.error||!items.length;
 }
 filter.addEventListener('change',render);
 focusFilter.addEventListener('change',render);
 refreshButton.addEventListener('click',()=>{
  requestedRawBackup=null;render();
  feedback.textContent='Reloaded the latest journal stored on this device.';
 });
 function downloadPrivateRaw(raw){
  const url=URL.createObjectURL(new Blob([raw],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;
  anchor.download='fuckball-original-practice-journal-'+new Date().toISOString().slice(0,10)+'.txt';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 rawBackup.addEventListener('click',()=>{
  const latest=snapshot();
  if(latest.error!=='corrupt'||typeof latest.raw!=='string'){
   feedback.textContent='The saved journal changed. Reload before exporting its raw backup.';
   return;
  }
  try{
   downloadPrivateRaw(latest.raw);
   // A download was requested, not a claim that the browser completed it.
   requestedRawBackup=latest.raw;
   feedback.textContent='Original raw journal download requested. Keep this private recovery copy safe before resetting.';
   render();
  }catch{
   feedback.textContent='The browser could not prepare a raw backup. Your original journal remains untouched.';
  }
 });
 resetDamaged.addEventListener('click',()=>{
  const latest=snapshot();
  if(latest.error!=='corrupt'||requestedRawBackup!==latest.raw){
   feedback.textContent='Export the latest raw journal before choosing a reset.';
   render();return;
  }
  if(!window.confirm('You requested a raw recovery copy. Resetting now will delete the unreadable original journal from this device. Continue?'))return;
  if(!window.confirm('Last confirmation: erase this damaged journal? It cannot be reconstructed unless your downloaded raw backup is usable.'))return;
  try{
   // Refuse to delete if a different tab repaired or replaced the data.
   if(localStorage.getItem(KEY)!==latest.raw){
    feedback.textContent='The journal changed in another tab. Nothing was deleted.';
    render();return;
   }
   localStorage.removeItem(KEY);
   if(localStorage.getItem(KEY)!==null)throw Error('unverified');
   requestedRawBackup=null;
   render();
   feedback.textContent='Damaged journal reset after an explicit raw backup request. A new private journal can now be created.';
  }catch{
   feedback.textContent='Reset not verified. Your existing journal was not intentionally overwritten.';
  }
 });
 exportButton.addEventListener('click',()=>{
  const items=read();if(!items.length)return;
  const data={format:'fuckball-local-practice-journal',version:1,source:'browser-private-unverified-solo-matches',exportedAt:new Date().toISOString(),matches:items};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fuckball-local-practice-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  feedback.textContent='Local journal exported. No account or server upload.';
 });
 clearButton.addEventListener('click',()=>{
  const before=snapshot();
  if(before.error||!before.items.length)return;
  const items=before.items;
  if(!window.confirm('Delete all '+items.length+' local practice results from this browser? Online results and HBR2 replays are not affected.'))return;
  if(!window.confirm('This cannot be undone unless you exported a backup. Delete the local journal?'))return;
  try{
   const latest=snapshot();
   if(latest.error||latest.raw!==before.raw){
    feedback.textContent='Journal changed during confirmation. Reload before deleting.';return;
   }
   localStorage.removeItem(KEY);
   if(localStorage.getItem(KEY)!==null)throw Error('unverified');
  }catch{feedback.textContent='Storage is unavailable or deletion could not be verified.';return;}
  render();feedback.textContent='Local practice journal cleared.';
 });
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  requestedRawBackup=null;
  if(list.querySelector('.local-journal-edit[data-dirty="true"]')){
   feedback.textContent='Journal changed in another tab. Your unsaved note remains here. Copy it first, then Reload saved journal.';
   return;
  }
  render();
 });
 render();
 let observation=null;
 function eligible(){
  if(replay||peerConnected||serverLink||!room||!started)return null;
  const mode=document.getElementById('mode')?.value;
  if(!Object.hasOwn(modes,mode)||mode==='watch'||mode==='local'||botIds.has(1))return null;
  const human=room.state?.players?.find?.(p=>p.id===1);
  if(!human||![1,2].includes(human.team?.id)||!human.disc)return null;
  // Only a native completed match with exactly one human on the field and a
  // physically present opposing AI can count as local human-vs-AI. The mode
  // selector alone is not proof: couch teams, substituted bots, empty rooms
  // and queued online joins must never become Academy solo-win evidence.
  const others=room.state.players.filter(p=>p.id!==1&&
   [1,2].includes(p.team?.id));
  if(!others.length||!others.every(p=>botIds.has(p.id))||
     !others.some(p=>p.team.id!==human.team.id&&p.disc))return null;
  return {mode,side:human.team.id,aiOpponent:true};
 }
 // No new events, network calls or game-state mutations: inspect real frames
 // only. After a native score/time limit ends, gameState becomes null.
 function sample(){
  // A completed native match can drop its gameState and player discs
  // together. Preserve the prior real-score observation until completion.
  const game=room?.gameState;
  if(!game){
   if(!observation||observation.room!==room||!started||paused||
      peerConnected||serverLink?.room||replay){observation=null;return;}
   const e=clean({...observation,at:Date.now(),seconds:Math.round(observation.seconds)});
   observation=null;
   if(!e)return;
   const previous=snapshot();
   if(previous.error){
    feedback.textContent='Match finished, but saved journal data is unreadable. Original records were preserved. Recover the private raw backup before adding results.';
    render();return;
   }
   const entries=previous.items;entries.unshift(e);
   const saved=persist(entries,previous.raw);
   if(saved.ok)render();
   else feedback.textContent='Match finished, but the journal was not safely saved ('+saved.reason+'). Existing records were not intentionally cleared.';
   return;
  }
  const player=eligible();
  if(!player){observation=null;return;}
  const g=game,frame=room.currentFrameNo;
  if(!Number.isSafeInteger(frame)||frame<0)return;
  if(g){
   const red=g.redScore,blue=g.blueScore,time=g.timeElapsed;
   if(!Number.isSafeInteger(red)||!Number.isSafeInteger(blue)||
      !Number.isFinite(time)||time<0)return;
   if(!observation||observation.room!==room||observation.mode!==player.mode||
      observation.side!==player.side||frame<observation.frame||
      time+0.5<observation.seconds||red<observation.red||blue<observation.blue){
    observation={room,mode:player.mode,side:player.side,
     aiOpponent:player.aiOpponent,
     stadium:String(room.state?.stadium?.name||'').slice(0,48),
     frame,red,blue,seconds:time};
   }else Object.assign(observation,{frame,red,blue,seconds:time,
    aiOpponent:player.aiOpponent});
   return;
  }
 }
 window.setInterval(sample,160);
})();
