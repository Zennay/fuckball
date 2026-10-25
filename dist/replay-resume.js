'use strict';
// Browser-private HBR2 replay position resume. Never affects online matches,
// records files, transmits playback state or auto-opens an unknown recording.
(function(){
 const games=document.getElementById('gamesView');
 const controls=document.getElementById('replayControls');
 const pitch=document.getElementById('matchView');
 if(!games||!controls||!pitch||typeof ReplayLibrary==='undefined')return;
 const KEY='fuckball.local-replay-resume.v1',LIMIT=30,AGE=90*86400000;
 const idValid=id=>typeof id==='string'&&/^[0-9a-f]{32}$/.test(id);
 const itemValid=x=>x&&idValid(x.id)&&Number.isSafeInteger(x.ms)&&x.ms>=2000&&
  x.ms<=864000000&&Number.isSafeInteger(x.duration)&&x.duration>2000&&
  x.duration<=864000000&&x.ms<x.duration-1500&&
  Number.isSafeInteger(x.at)&&x.at>0&&x.at<=Date.now()+86400000&&Date.now()-x.at<=AGE;
 const mk=(tag,value,cls)=>{
  const e=document.createElement(tag);
  if(value!==undefined&&value!==null)e.textContent=String(value);
  if(cls)e.className=cls;return e;
 };
 const format=ms=>{
  const secs=Math.floor(ms/1000);
  return String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
 };
 function read(){
  try{
   const raw=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(raw)||raw.length>LIMIT+5)return[];
   return raw.filter(itemValid).slice(0,LIMIT);
  }catch{return[];}
 }
 function persist(records){
  const clean=records.filter(itemValid).sort((a,b)=>b.at-a.at).slice(0,LIMIT);
  try{localStorage.setItem(KEY,JSON.stringify(clean));return true;}catch{return false;}
 }
 function lookup(id){return read().find(x=>x.id===id)||null;}
 function discard(id){
  if(!idValid(id))return false;
  const saved=persist(read().filter(x=>x.id!==id));
  if(!saved)feedback.textContent='Could not forget position: browser storage is unavailable.';
  refreshControls();return saved;
 }
 function forgetPosition(id){
  const live=current();
  if(live?.id===id)forgottenReplay=live.instance;
  return discard(id);
 }
 const section=mk('section',null,'replay-resume-library');
 section.setAttribute('aria-label','Continue watching saved local HBR2 replays');
 const heading=mk('div',null,'replay-resume-heading');
 heading.append(mk('h2','CONTINUE WATCHING.'),
  mk('p','Pick up a saved HBR2 recording at your last watched position. Progress stays on this device; no gameplay, ranked results or cloud sync.'));
 const reload=mk('button','↻ Refresh saved positions');
 reload.type='button';heading.append(reload);
 const list=mk('div',null,'replay-resume-items');
 const feedback=mk('p','Only your own saved recordings can resume.','replay-resume-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 section.append(heading,list,feedback);
 const anchor=games.querySelector('.replay-review-queue')||games.querySelector('.replay-study-dashboard')||
  document.getElementById('gamesList');
 if(anchor)games.insertBefore(section,anchor);else games.append(section);

 const panel=mk('section',null,'replay-resume-controls');
 panel.setAttribute('aria-label','Resume current local saved replay');
 const label=mk('span',null,'replay-resume-state');
 const resume=mk('button','▶ Resume saved position');
 resume.type='button';
 const forget=mk('button','Forget saved position');forget.type='button';
 panel.append(label,resume,forget);controls.append(panel);

 let activeReplay=null,activeId=null,lastSaved=0,lastObserved=0,forgottenReplay=null;
 let sessionStartedAt=0,sessionStartedAtMs=0,explicitRewind=false;
 let viewToken=0,busy=false,painted='';
 const current=()=>{
  const id=typeof activeLocalReplayId==='string'?activeLocalReplayId:'';
  if(!idValid(id)||typeof replay==='undefined'||!replay||controls.hidden||pitch.hidden)return null;
  const duration=replay.length(),ms=replay.getTime();
  if(!Number.isFinite(duration)||!Number.isFinite(ms)||duration<=2000||duration>864000000)return null;
  return {id,instance:replay,ms:Math.max(0,ms),duration};
 };
 // Navigation/closing should save the most recent visible frame before
 // showView hides the pitch or closeReplay destroys the original instance.
 // Forced snapshots bypass only the regular write throttle, not validation.
 function savePlayhead(force=false){
  const s=current();
  if(!s||s.instance===forgottenReplay)return;
  if(activeReplay!==s.instance||activeId!==s.id){
   activeReplay=s.instance;activeId=s.id;
   lastSaved=0;lastObserved=0;
   sessionStartedAt=Date.now();sessionStartedAtMs=s.ms;explicitRewind=false;
  }
  // Only real locally opened HBR2 playback counts; near-end plays are complete.
  if(s.ms>=s.duration-1500){
   discard(s.id);lastObserved=s.ms;return;
  }
  if(s.ms<2000||s.ms>864000000)return;
  const ms=Math.round(s.ms);
  if(!force&&Math.abs(ms-lastObserved)<250)return;
  const existing=lookup(s.id);
  const now=Date.now();
  // A new viewer autoplays at zero even when a later position is saved.
  // Preserve that position during a brief preview. A deliberate seek or
  // genuinely rewatching ten seconds and advancing >=3s means the player
  // chose this earlier position; the saved checkpoint must follow them.
  const rewatching=now-sessionStartedAt>=10000&&
   s.ms-sessionStartedAtMs>=3000;
  if(existing&&ms<existing.ms&&!explicitRewind&&!rewatching)return;
  if(existing&&now-lastSaved<4500&&!force)return;
  if(existing&&existing.ms===ms&&existing.duration===Math.round(s.duration))return;
  const entry={id:s.id,ms,duration:Math.round(s.duration),at:now};
  if(persist([entry,...read().filter(x=>x.id!==s.id)])){
   lastSaved=now;lastObserved=ms;
  }
 }
 function refreshControls(){
  const s=current();
  const saved=s?lookup(s.id):null;
  // Do not present a stale "resume" button for a different currently loaded file.
  const key=(s?.id||'')+'|'+(saved?.ms||0)+'|'+(s?.duration||0);
  if(key===painted)return;
  painted=key;
  panel.hidden=!saved;
  if(!saved)return;
  label.textContent='Saved locally · '+format(saved.ms)+' / '+format(saved.duration);
  resume.textContent='▶ Resume at '+format(saved.ms);
  resume.disabled=!s||saved.ms>=s.duration-1500;
 }
 resume.onclick=()=>{
  const s=current();
  const saved=s?lookup(s.id):null;
  if(!s||!saved)return;
  const jump=Math.min(s.duration-500,Math.max(0,saved.ms));
  s.instance.setTime(jump);
  explicitRewind=true;
  label.textContent='Resumed private HBR2 playback at '+format(jump);
  feedback.textContent='Your local playback position was restored; no recording was modified.';
 };
 forget.onclick=()=>{
  const s=current();if(!s)return;
  forgetPosition(s.id);renderLibrary();
 };

 async function openSaved(id){
  if(busy||!idValid(id))return false;
  if(typeof serverLink!=='undefined'&&serverLink||
    typeof peerConnected!=='undefined'&&peerConnected||
    typeof pendingSessionBlock==='function'&&pendingSessionBlock()){
   feedback.textContent='Leave the current online room, peer or human queue first.';return;
  }
  const saved=lookup(id);
  if(!saved){feedback.textContent='This recorded position has already been cleared.';return;}
  if((typeof started!=='undefined'&&started||typeof replay!=='undefined'&&replay)&&
   !window.confirm('Open the saved replay? The current local match or replay will be replaced.')){
   feedback.textContent='Existing playback preserved.';return;
  }
  busy=true;feedback.textContent='Opening saved HBR2 playback…';
  try{
   const file=await ReplayLibrary.get(id);
   if(!file?.item||file.item.id!==id||file.bytes.length>32*1024*1024)
    throw Error('This local replay is no longer available.');
   // Re-evaluate admission after the asynchronous browser database read.
   if(typeof pendingSessionBlock==='function'&&pendingSessionBlock())
    throw Error('Your online session changed; replay has not been opened.');
   loadReplay(file.bytes,file.item.name);
   activeLocalReplayId=id;
   if(!replay||!Number.isFinite(replay.length()))throw Error('Replay player unavailable.');
   replay.setTime(Math.min(replay.length()-500,saved.ms));
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   feedback.textContent='Resumed '+file.item.name+' at '+format(saved.ms)+' (private local playback).';
   refreshControls();
   return true;
  }catch(error){feedback.textContent=error?.message||'Could not resume replay.';return false;}
  finally{busy=false;}
 }
 async function renderLibrary(){
  const token=++viewToken,items=read();
  list.replaceChildren();
  if(!items.length){list.append(mk('p','No unfinished locally saved recordings yet. Watch one in My Games and come back to continue.'));return;}
  try{
   const library=await ReplayLibrary.list();
   if(token!==viewToken)return;
   const byId=new Map(library.filter(x=>x&&idValid(x.id)).map(x=>[x.id,x]));
   const rows=items.filter(x=>byId.has(x.id));
   list.replaceChildren();
   if(!rows.length){
    list.append(mk('p','None of these playback positions still belong to a saved recording.'));return;
   }
   for(const item of rows.slice(0,8)){
    const meta=byId.get(item.id);
    const row=mk('article',null,'replay-resume-item');
    const details=mk('div',null,'replay-resume-details');
    details.append(mk('strong',String(meta.name||'Saved HBR2').slice(0,100)),
     mk('small',format(item.ms)+' of '+format(item.duration)+' · private saved playhead'));
    const action=mk('button','▶ Continue');
    action.type='button';action.onclick=()=>openSaved(item.id);
    const remove=mk('button','Forget');remove.type='button';
    remove.onclick=()=>{forgetPosition(item.id);renderLibrary();};
    row.append(details,action,remove);list.append(row);
   }
  }catch(error){
   if(token===viewToken)feedback.textContent='Could not read saved replays: '+(error?.message||'Unavailable');
  }
 }
 window.FuckballReplayResume=Object.freeze({get:lookup,open:openSaved});
 reload.type='button';reload.onclick=renderLibrary;
 // Capture occurs before the existing tab onclick changes pitch.hidden,
 // and before Close destroys the replay. No new navigation or playback
 // hooks are installed on the multiplayer/gameplay engine.
 for(const id of ['tabHome','tabReplay','replayClose']){
  document.getElementById(id)?.addEventListener('click',()=>savePlayhead(true),true);
 }
 // Native replay Seek sets the real playhead before 'change'; this flags a
 // conscious rewind even if it lies earlier than an older saved checkpoint.
 document.getElementById('replaySeek')?.addEventListener('change',()=>{
  explicitRewind=true;savePlayhead(true);
 });
 document.getElementById('tabReplay')?.addEventListener('click',()=>renderLibrary());
 window.addEventListener('storage',event=>{
  if(event.key===KEY||event.key===null){painted='';refreshControls();if(!games.hidden)renderLibrary();}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)savePlayhead(true);
  else{painted='';refreshControls();}
 });
 window.addEventListener('pagehide',()=>savePlayhead(true));
 window.setInterval(()=>{
  if(document.hidden)return;
  savePlayhead();refreshControls();
 },1200);
 renderLibrary();
 refreshControls();
})();
