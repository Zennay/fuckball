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
 controls.append(filterLabel,focusFilterLabel,exportButton,clearButton);
 const stats=document.createElement('div');stats.className='local-journal-stats';
 const list=document.createElement('div');list.className='local-journal-list';
 list.setAttribute('aria-label','Completed local practice matches');
 const feedback=document.createElement('p');feedback.className='local-journal-feedback';
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 panel.append(header,controls,stats,list,feedback);games.append(panel);
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
  return {at,mode,stadium,side,red,blue,seconds,focus,note};
 }
 function read(){
  try{
   const entries=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(entries))return[];
   return entries.slice(0,MAX).map(clean).filter(Boolean);
  }catch{return[];}
 }
 function persist(entries){
  try{localStorage.setItem(KEY,JSON.stringify(entries.slice(0,MAX)));return true;}
  catch{return false;}
 }
 const outcome=e=>{
  const ours=e.side===1?e.red:e.blue,theirs=e.side===1?e.blue:e.red;
  return ours>theirs?'win':ours<theirs?'loss':'draw';
 };
 const duration=e=>Math.floor(e.seconds/60)+'m '+String(e.seconds%60).padStart(2,'0')+'s';
 function render(){
  const items=read(), wins=items.filter(e=>outcome(e)==='win').length,
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
   meta.textContent='You: '+(e.side===1?'Red':'Blue')+' · '+(e.stadium||'Custom field')+' · '+duration(e)+' · '+new Date(e.at).toLocaleString();
   const coaching=document.createElement('details');coaching.className='local-journal-coaching';
   const summary=document.createElement('summary');
   summary.textContent='Personal notes · '+focusOptions[e.focus]+(e.note?' · saved':'');
   const form=document.createElement('div');form.className='local-journal-edit';
   const focusLabel=document.createElement('label');focusLabel.textContent='Focus this match';
   const pick=document.createElement('select');
   pick.setAttribute('aria-label','Match '+new Date(e.at).toLocaleDateString()+' focus');
   for(const [key,label]of Object.entries(focusOptions))pick.add(new Option(label,key));
   pick.value=e.focus;focusLabel.append(pick);
   const noteLabel=document.createElement('label');noteLabel.textContent='What went well? What to improve? (240 characters)';
   const note=document.createElement('textarea');note.maxLength=240;note.rows=3;
   note.placeholder='E.g. I pressed too early; aim for the free corner next game.';
   note.value=e.note;noteLabel.append(note);
   const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='Save private note';
   save.addEventListener('click',()=>{
    const current=read(),item=current[index];
    // Another tab may have changed the ordered local log while this editor was open.
    if(!item||item.at!==e.at||item.mode!==e.mode||item.red!==e.red||item.blue!==e.blue){
     feedback.textContent='The journal changed. Reload the entry before editing.';render();return;
    }
    item.focus=pick.value;item.note=note.value.trim().slice(0,240);
    if(!persist(current)){feedback.textContent='Browser storage is unavailable. Note not saved.';return;}
    feedback.textContent='Coaching focus and note saved privately on this device.';
    render();
   });
   form.append(focusLabel,noteLabel,save);coaching.append(summary,form);
   body.append(name,meta,coaching);row.append(result,body);list.append(row);
  }
  exportButton.disabled=clearButton.disabled=!items.length;
 }
 filter.addEventListener('change',render);
 focusFilter.addEventListener('change',render);
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
  const items=read();if(!items.length)return;
  if(!window.confirm('Delete all '+items.length+' local practice results from this browser? Online results and HBR2 replays are not affected.'))return;
  if(!window.confirm('This cannot be undone unless you exported a backup. Delete the local journal?'))return;
  try{localStorage.removeItem(KEY);}catch{feedback.textContent='Storage is unavailable; journal could not be deleted.';return;}
  feedback.textContent='Local practice journal cleared.';render();
 });
 window.addEventListener('storage',event=>{if(event.key===KEY)render();});
 render();
 let observation=null;
 function eligible(){
  if(replay||peerConnected||serverLink?.room||!room||!started)return null;
  const mode=document.getElementById('mode')?.value;
  if(!Object.hasOwn(modes,mode)||mode==='watch'||mode==='local'||botIds.has(1))return null;
  const human=room.state?.players?.find?.(p=>p.id===1);
  if(!human||![1,2].includes(human.team?.id)||!human.disc)return null;
  return {mode,side:human.team.id};
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
   const entries=read();entries.unshift(e);
   if(persist(entries))render();
   else feedback.textContent='Match finished, but local browser storage is unavailable.';
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
     stadium:String(room.state?.stadium?.name||'').slice(0,48),
     frame,red,blue,seconds:time};
   }else Object.assign(observation,{frame,red,blue,seconds:time});
   return;
  }
 }
 window.setInterval(sample,160);
})();
