'use strict';
// Optional, device-local entry points: no online history or server tracking.
(function(){
 const home=document.getElementById('homeView');
 if(!home||typeof ReplayLibrary==='undefined')return;
 const make=(tag,klass,content)=>{
  const el=document.createElement(tag);if(klass)el.className=klass;
  if(content!==undefined)el.textContent=content;return el;
 };
 const section=make('section','continue-playing');
 section.setAttribute('aria-label','Continue your local play');
 const heading=make('div','continue-playing-head');
 const intro=make('div');
 intro.append(make('span','eyebrow','ON THIS DEVICE'),make('h2','','CONTINUE PLAYING.'),
  make('p','','Your recent HBR2 recordings and offline practice, ready for another session. Human Quick Match still needs a live server.'));
 const actions=make('div','continue-playing-actions');
 const library=make('button','','My Games ↗');library.type='button';
 const practice=make('button','','Practice Lab ↗');practice.type='button';
 actions.append(library,practice);heading.append(intro,actions);
 const grid=make('div','continue-playing-grid');
 const live=make('aside','continue-playing-live');live.hidden=true;
 live.setAttribute('aria-label','Existing active game or connection');
 const liveInfo=make('div','continue-playing-live-copy');
 const liveTitle=make('strong','','MATCH STILL OPEN');
 const liveDescription=make('p','','Return to your existing session before opening a recording.');
 liveDescription.setAttribute('role','status');
 liveInfo.append(liveTitle,liveDescription);
 const liveReturn=make('button','primary','↗ Return to current game');
 liveReturn.type='button';
 live.append(liveInfo,liveReturn);
 const note=make('p','continue-playing-note','No personal data is uploaded by this panel.');
 note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 section.append(heading,live,grid,note);
 const lab=home.querySelector('.practice-lab');
 const cards=home.querySelector('.mode-cards');
 if(lab)lab.insertAdjacentElement('beforebegin',section);
 else if(cards)cards.insertAdjacentElement('afterend',section);
 else home.append(section);
 library.onclick=()=>document.getElementById('tabReplay')?.click();
 practice.onclick=()=>{
  const block=home.querySelector('.practice-lab');
  const disclosure=home.querySelector('.practice-lab-disclosure');
  if(disclosure){disclosure.open=true;block?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  document.getElementById('quickPractice')?.click();
 };
 let busy=false,version=0;
 // The Home shortcuts are read-only observers of server/peer/local authority.
 function active(){
  if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
   return ['recovery','ORIGINAL ROOM RECONNECTING','Use the native reconnect/stop controls before opening a saved recording.'];
  if(typeof serverLink!=='undefined'&&serverLink)
   return serverLink.room?['online','ONLINE ROOM STILL OPEN','Your original online game remains connected.']:
    ['connecting','ONLINE CONNECTION PENDING','Your server handshake or human search is still in progress.'];
  if(typeof peerConnected!=='undefined'&&peerConnected)
   return ['peer','DIRECT MATCH STILL OPEN','Your original human peer match is still active.'];
  if(typeof peer!=='undefined'&&peer)
   return ['peer-pending','DIRECT CONNECTION PENDING','Cancel or finish your original direct-peer handshake.'];
  if(home.querySelector('.quick-ready:not([hidden]),.quick-queue-actions button:not([hidden])'))
   return ['queue','HUMAN MATCH SEARCH ACTIVE','Use the original ready/cancel controls before opening a replay.'];
  if(typeof replay!=='undefined'&&replay)
   return ['replay','REPLAY ALREADY OPEN','Return to your recording or close it explicitly.'];
  if(typeof started!=='undefined'&&started)
   return ['local','LOCAL MATCH STILL OPEN','Your offline game is preserved. Return or stop it explicitly before watching a saved replay.'];
  return null;
 }
 function refreshSession(){
  const now=active();
  live.hidden=!now;
  if(now){
   liveTitle.textContent=now[1];
   liveDescription.textContent=now[2]+
    (now[0]==='local'&&typeof paused!=='undefined'&&paused?' It is paused; resume from the original pitch controls.':'');
   liveReturn.textContent=now[0]==='recovery'?'↗ View reconnect controls':
    now[0]==='queue'?'↗ View ready check':'↗ Return to original session';
  }
  for(const button of grid.querySelectorAll('[data-saved-replay]')){
   button.disabled=!!now||busy;
   button.title=busy?'A saved replay is already loading.':
    now?'Finish or explicitly close the current game before opening a saved recording.':'';
  }
 }
 liveReturn.addEventListener('click',()=>{
  const now=active();if(!now)return refreshSession();
  if(now[0]==='recovery'){
   const panel=document.querySelector('.native-room-recovery:not([hidden])');
   if(panel){panel.focus?.({preventScroll:true});return;}
  }
  if(now[0]==='queue'){
   const panel=home.querySelector('.quick-ready:not([hidden]),.quick-queue-panel:not([hidden])');
   panel?.scrollIntoView?.({behavior:'auto',block:'center'});
   (panel?.querySelector('button:not([disabled]):not([hidden])')||panel)
    ?.focus?.({preventScroll:true});return;
  }
  document.getElementById('tabPlay')?.click();
  if(now[0]==='connecting'&&typeof openDialog==='function'&&
    document.getElementById('networkDialog')?.open!==true)openDialog('networkDialog');
  note.textContent='Returned to the existing session. No new match or replay was started.';
 });

 const date=timestamp=>new Date(timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'});
 const duration=frames=>Number.isSafeInteger(frames)&&frames>0?
  Math.floor(frames/3600)+'m '+String(Math.floor(frames%3600/60)).padStart(2,'0')+'s':'Length unknown';
 function recentPractice(){
  const sources=[
   {key:'fuckball-local-goal-rush-history-v1',kind:'Goal Rush',valid:x=>
    [60,120,180].includes(x.duration)&&[1,3,5].includes(x.target)&&
    Number.isSafeInteger(x.goals)&&x.goals>=0&&x.goals<=999&&typeof x.completed==='boolean',
    title:x=>x.goals+' / '+x.target+' recorded goals'},
   {key:'fuckball.teamwork-native-drill.v1',kind:'Teamwork',valid:x=>
    [120,180,300].includes(x.seconds)&&[2,4,6].includes(x.target)&&
    Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&typeof x.completed==='boolean',
    title:x=>x.links+' / '+x.target+' teammate kick links'},
   {key:'fuckball.native-sudden-death.v1',kind:'Sudden Death',valid:x=>{
    if(![3,5,7].includes(x.bestOf)||![60,90,120].includes(x.duration)||
     !Array.isArray(x.rounds)||x.rounds.length<1||x.rounds.length>x.bestOf||
     !Number.isSafeInteger(x.draws)||x.draws<0||x.draws>7)return false;
    const couch=x.opponent==='human',first=couch?'player1':'human',
     second=couch?'player2':'ai',a=couch?x.player1:x.human,b=couch?x.player2:x.ai;
    return (couch||x.opponent===undefined||x.opponent==='ai')&&
     Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a<=7&&b<=7&&
     a+b+x.draws===x.rounds.length&&
     x.rounds.every(r=>r&&[first,second,'draw'].includes(r.winner)&&
      Number.isSafeInteger(r.frames)&&r.frames>=0&&r.frames<=x.duration*60+120)&&
     x.winner===(a>b?first:b>a?second:'draw')&&
     (x.rounds.length===x.bestOf||a>=Math.floor(x.bestOf/2)+1||
      b>=Math.floor(x.bestOf/2)+1);
   },
    title:x=>x.opponent==='human'?
     'Player 1 '+x.player1+' · Player 2 '+x.player2+' · '+x.draws+' drawn':
     'You '+x.human+' · AI '+x.ai+' · '+x.draws+' drawn rounds'},
   {key:'fuckball.local-practice-journal.v1',kind:'Solo Practice',valid:x=>
    ['bot','practice','2v2','4v4'].includes(x.mode)&&[1,2].includes(x.side)&&
    Number.isSafeInteger(x.red)&&x.red>=0&&x.red<=999&&
    Number.isSafeInteger(x.blue)&&x.blue>=0&&x.blue<=999,
    title:x=>'Red '+x.red+' · Blue '+x.blue}
  ];
  const results=[];
  for(const source of sources){
   let entries;
   try{entries=JSON.parse(localStorage.getItem(source.key)||'[]');}catch{continue;}
   if(!Array.isArray(entries))continue;
   for(const entry of entries.slice(0,30)){
    if(!entry||!Number.isSafeInteger(entry.at)||entry.at<=0||
      entry.at>Date.now()+86400000||!source.valid(entry))continue;
    results.push({kind:source.kind,at:entry.at,title:source.title(entry)});
   }
  }
  return results.sort((a,b)=>b.at-a.at)[0]||null;
 }
 const validReplay=r=>r&&typeof r.id==='string'&&/^[0-9a-f]{32}$/.test(r.id)&&
  typeof r.name==='string'&&r.name.length<=100&&
  Number.isSafeInteger(r.createdAt)&&r.createdAt>0&&r.createdAt<=Date.now()+86400000&&
  Number.isSafeInteger(r.size)&&r.size>0&&r.size<=32*1048576&&
  Number.isSafeInteger(r.frames)&&r.frames>=0&&r.frames<=86400000;
 function reportSessionConflict(){
  const existing=active();
  if(!existing)return false;
  note.textContent='Your '+existing[1].toLowerCase()+
   ' is still active. Finish or explicitly close it before opening another replay.';
  refreshSession();return true;
 }
 async function refreshOpenedAnnotations(){
  try{
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   note.textContent='Replay opened from this browser.';
  }catch{
   // A failed private notes store must not be reported as a failed HBR2
   // playback after the engine already switched to the saved recording.
   note.textContent='Replay opened. Saved notes are temporarily unavailable.';
  }
 }
 async function watch(item){
  if(busy||reportSessionConflict())return;
  busy=true;note.textContent='Opening local recording…';refreshSession();
  try{
   const saved=await ReplayLibrary.get(item.id);
   if(!saved?.item||saved.item.id!==item.id||
      !saved.bytes||!Number.isSafeInteger(saved.bytes.byteLength)||
      !saved.bytes.byteLength||saved.bytes.byteLength>32*1048576)
    throw Error('Saved recording is unavailable.');
   // IndexedDB is async. A real human may start an online search, direct
   // peer or LOCAL match before it resolves; honor the later live session.
   const newer=active();
   if(newer)throw Error('Your '+newer[1].toLowerCase()+
    ' became active while reading the recording. Nothing was replaced.');
   loadReplay(saved.bytes,saved.item.name);
   activeLocalReplayId=item.id;
   await refreshOpenedAnnotations();
  }catch(error){note.textContent='Could not open replay: '+(error?.message||'Storage error');}
  finally{busy=false;refreshSession();}
 }
 function card(title,subtitle,tag,buttonText,handler){
  const box=make('article','continue-playing-card');
  const badge=make('span','continue-playing-badge',tag);
  const name=make('strong','',title);
  const description=make('p','',subtitle);
  const button=make('button','',buttonText);button.type='button';button.onclick=handler;
  if(buttonText.startsWith('▶ '))button.setAttribute('data-saved-replay','true');
  box.append(badge,name,description,button);
  return box;
 }
 async function render(){
  const token=++version;
  try{
   const all=(await ReplayLibrary.list()).filter(validReplay);
   if(token!==version)return;
   grid.replaceChildren();
   const sorted=all.sort((a,b)=>Number(b.favorite===true)-Number(a.favorite===true)||b.createdAt-a.createdAt).slice(0,30);
   // Keep one or two recording shortcuts; no full library duplication on the Play home.
   for(const item of sorted.slice(0,2)){
    const position=window.FuckballReplayResume?.get?.(item.id);
    const clock=position?Math.floor(position.ms/60000)+'m '+String(Math.floor(position.ms/1000)%60).padStart(2,'0')+'s':'';
    grid.append(card(item.name,duration(item.frames)+' recorded · saved '+date(item.createdAt)+
      (position?' · unfinished at '+clock:''),
     item.favorite===true?'★ FAVORITE REPLAY':'LOCAL HBR2 REPLAY',
     position?'▶ Continue at '+clock:'▶ Watch replay',async()=>{
      if(busy)return;
      if(!position)return watch(item);
      if(reportSessionConflict())return;
      // One in-flight Home action at a time; the original resume component
      // remains authoritative for private seek time and playback admission.
      busy=true;note.textContent='Restoring saved playback…';refreshSession();
      try{
       const success=await window.FuckballReplayResume?.open?.(item.id);
       note.textContent=success?'Saved playback resumed.':
        'Could not resume. Open My Games to inspect your private saved position.';
      }catch(error){note.textContent='Could not resume: '+(error?.message||'Storage error');}
      finally{busy=false;refreshSession();}
    }));
   }
   const latest=recentPractice();
   if(latest){
    grid.append(card(latest.kind,latest.title+' · '+date(latest.at),
     'LAST LOCAL PRACTICE','Open practice',()=>practice.click()));
   }else{
    grid.append(card('Train against AI','Try a goal challenge, practice teamwork or play your first solo match.',
     'OFFLINE PRACTICE','Start practice',()=>practice.click()));
   }
   if(!all.length&&latest===null){
    note.textContent='Your first locally saved replay or completed drill will appear here automatically.';
   }else note.textContent='Personal device shortcuts only · not ranked or server-verified history.';
  }catch(error){
   if(token!==version)return;
   grid.replaceChildren(card('Your local recordings','Open My Games to import or view HBR2 files.',
    'STORAGE UNAVAILABLE','Open My Games',()=>library.click()));
   note.textContent='Could not read browser replay storage: '+(error.message||'Storage unavailable');
  }
  refreshSession();
 }
 document.getElementById('tabHome')?.addEventListener('click',()=>{
  refreshSession();render();
 });
 window.addEventListener('focus',()=>{if(!home.hidden)render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!home.hidden)render();});
 window.addEventListener('storage',()=>{if(!home.hidden)render();});
 window.addEventListener('fuckball:native-session-state',refreshSession);
 const sessionTick=setInterval(()=>{if(!home.hidden)refreshSession();},1400);
 sessionTick?.unref?.();
 refreshSession();render();
})();