'use strict';
// User-curated replay study order. Device-only IDs, not online playlists or ranks.
(function(){
 const games=document.getElementById('gamesView');
 const controls=document.getElementById('replayControls');
 if(!games||!controls||typeof ReplayLibrary==='undefined')return;
 const KEY='fuckball-local-replay-review-queue.v1',MAX=8;
 const make=(tag,className,content)=>{
  const x=document.createElement(tag);if(className)x.className=className;
  if(content!==undefined)x.textContent=content;return x;
 };
 const root=make('section','replay-review-queue');
 root.setAttribute('aria-label','My private replay review queue');
 const heading=make('header','replay-queue-head');
 const text=make('div');
 text.append(make('span','eyebrow','MY GAMES · ON THIS DEVICE'),
  make('h2','','REPLAY REVIEW QUEUE.'),
  make('p','','Build a personal watchlist of up to eight HBR2 recordings. Choose the order, then review one at a time. No online match results or files are uploaded.'));
 const update=make('button','','↻ Refresh library');update.type='button';
 heading.append(text,update);
 const addRow=make('div','replay-queue-add');
 const selector=document.createElement('select');
 selector.setAttribute('aria-label','Choose an HBR2 recording to add to review queue');
 const add=make('button','','+ Add recording');add.type='button';
 addRow.append(selector,add);
 const list=make('ol','replay-queue-list');
 const foot=make('div','replay-queue-footer');
 const count=make('span','','0 / 8 recordings');
 const start=make('button','','▶ Start review');start.type='button';start.className='primary';
 const clear=make('button','','Clear review queue');clear.type='button';
 foot.append(count,start,clear);
 const feedback=make('p','replay-queue-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 root.append(heading,addRow,list,foot,feedback);
 const anchor=games.querySelector('.replay-compare-studio')||
  games.querySelector('.local-replay-insights')||document.getElementById('gamesList');
 games.insertBefore(root,anchor);
 const mini=make('div','replay-queue-playback');mini.hidden=true;
 mini.setAttribute('aria-label','Active replay review');
 const progress=make('strong','replay-queue-progress');
 const prev=make('button','','← Previous');prev.type='button';
 const next=make('button','','Next →');next.type='button';
 const autoLabel=make('label','replay-queue-auto');
 const auto=document.createElement('input');auto.type='checkbox';
 autoLabel.append(auto,document.createTextNode(' Auto-next'));
 const finish=make('button','','Finish review');finish.type='button';
 mini.append(progress,prev,next,autoLabel,finish);controls.append(mini);
 const validId=id=>typeof id==='string'&&/^[0-9a-f]{32}$/.test(id);
 const validMeta=x=>x&&validId(x.id)&&typeof x.name==='string'&&x.name.length<=100&&
  Number.isSafeInteger(x.createdAt)&&x.createdAt>0&&x.createdAt<=Date.now()+86400000&&
  Number.isSafeInteger(x.size)&&x.size>0&&x.size<=32*1048576&&
  Number.isSafeInteger(x.frames)&&x.frames>=0&&x.frames<=86400000;
 function read(){
  try{
   const value=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(value)||value.length>MAX||value.some(x=>!validId(x)))return[];
   return [...new Set(value)];
  }catch{return[];}
 }
 function save(queue){
  try{localStorage.setItem(KEY,JSON.stringify(queue.slice(0,MAX)));return true;}
  catch{feedback.textContent='Cannot save queue: browser storage is unavailable.';return false;}
 }
 let queue=read(),items=[],active=-1,loading=false,serial=0,transitioning=false,lastObserved=-1,seenProgress=false;
 const byId=id=>items.find(x=>x.id===id);
 const minutes=frames=>{
  if(!Number.isSafeInteger(frames)||frames<=0)return 'Length unknown';
  return Math.floor(frames/3600)+'m '+String(Math.floor(frames%3600/60)).padStart(2,'0')+'s';
 };
 function render(){
  list.replaceChildren();selector.replaceChildren();
  count.textContent=queue.length+' / '+MAX+' recordings';
  const available=items.filter(item=>!queue.includes(item.id));
  selector.add(new Option(available.length?'Choose a local replay':'No more eligible recordings',''));
  for(const item of available)selector.add(new Option(item.name,item.id));
  add.disabled=queue.length>=MAX||!available.length;
  clear.disabled=start.disabled=!queue.length;
  for(const [index,id] of queue.entries()){
   const item=byId(id);
   const row=make('li','replay-queue-item');
   const number=make('span','replay-queue-number',String(index+1).padStart(2,'0'));
   const info=make('div','replay-queue-info');
   info.append(make('strong','',item?.name||'Recording unavailable'),
    make('small','',item?minutes(item.frames)+' · saved '+new Date(item.createdAt).toLocaleDateString():'Removed from this device'));
   const buttons=make('div','replay-queue-buttons');
   function control(label,action,disabled=false){
    const button=make('button','',label);button.type='button';button.disabled=disabled;
    button.onclick=action;buttons.append(button);
   }
   control('↑',()=>move(index,-1),index===0);
   control('↓',()=>move(index,1),index===queue.length-1);
   control('▶ Watch',()=>begin(index),!item);
   control('Remove',()=>{const next=queue.filter((_,n)=>n!==index);if(save(next)){queue=next;endSession();render();}});
   row.append(number,info,buttons);list.append(row);
  }
  if(!queue.length)list.append(make('li','replay-queue-empty',
   'Your queue is empty. Add local recordings to build a focused study session.'));
  updateMini();
 }
 function move(index,offset){
  const dest=index+offset;if(dest<0||dest>=queue.length)return;
  const next=[...queue];[next[index],next[dest]]=[next[dest],next[index]];
  if(save(next)){queue=next;endSession();render();}
 }
 async function refreshLibrary(){
  const token=++serial;
  try{
   const all=(await ReplayLibrary.list()).filter(validMeta).slice(0,30);
   if(token!==serial)return;
   items=all;
   render();
   feedback.textContent='Review queue ready. Offline playback uses the same HBR2 viewer as My Games.';
  }catch(error){
   if(token!==serial)return;
   feedback.textContent='Could not load local replays: '+(error.message||'Browser storage error');
   items=[];render();
  }
 }
 function endSession(){
  active=-1;auto.checked=false;seenProgress=false;lastObserved=-1;
  mini.hidden=true;
 }
 function updateMini(){
  mini.hidden=active<0||!queue.length;
  if(mini.hidden)return;
  const item=byId(queue[active]);
  progress.textContent=(active+1)+' / '+queue.length+' · '+(item?.name||'Unavailable');
  prev.disabled=active<=0||loading;
  next.disabled=active>=queue.length-1||loading;
 }
 async function begin(index){
  if(loading||index<0||index>=queue.length)return;
  const id=queue[index],item=byId(id);
  if(!item){feedback.textContent='This recording was removed. Refresh your library and remove it from the queue.';return;}
  loading=true;feedback.textContent='Opening replay '+(index+1)+' of '+queue.length+'…';
  try{
   const saved=await ReplayLibrary.get(id);
   if(saved.item.id!==id||saved.bytes.length>32*1048576)
    throw Error('This local HBR2 replay is not available.');
   loadReplay(saved.bytes,item.name);
   activeLocalReplayId=id;
   active=index;lastObserved=-1;seenProgress=false;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   feedback.textContent='Review '+(index+1)+' / '+queue.length+' started. Use Next / Previous above the replay.';
  }catch(error){
   feedback.textContent='Could not open recording: '+(error.message||'Playback error');
  }finally{loading=false;updateMini();}
 }
 update.onclick=refreshLibrary;
 add.onclick=()=>{
  const id=selector.value;
  if(!validId(id)||!byId(id)||queue.includes(id)||queue.length>=MAX)return;
  const next=[...queue,id];
  if(save(next)){queue=next;render();feedback.textContent='Recording added to your private review queue.';}
 };
 start.onclick=()=>begin(0);
 clear.onclick=()=>{
  if(!queue.length||!confirm('Clear the local review queue? Your HBR2 recordings are NOT deleted.'))return;
  if(save([])){queue=[];endSession();render();feedback.textContent='Review queue cleared. Saved replays are unchanged.';}
 };
 prev.onclick=()=>begin(active-1);
 next.onclick=()=>begin(active+1);
 finish.onclick=()=>{
  endSession();feedback.textContent='Review session closed. Your personal queue stays saved.';render();
 };
 auto.addEventListener('change',()=>{lastObserved=-1;seenProgress=false;});
 // Auto-next is opt-in and only while the same known local replay is on screen.
 // Never start another recording from a hidden tab or after another UI replaces playback.
 window.setInterval(()=>{
  if(active>=0&&activeLocalReplayId!==queue[active]){endSession();return;}
  if(active<0||loading||transitioning||!auto.checked||document.hidden||
   controls.hidden||typeof replay==='undefined'||!replay)return;
  if(activeLocalReplayId!==queue[active]){endSession();return;}
  const pos=replay.getTime(),end=replay.length();
  if(!Number.isFinite(pos)||!Number.isFinite(end)||end<=0)return;
  if(lastObserved>=0&&pos>lastObserved+20)seenProgress=true;
  lastObserved=pos;
  if(seenProgress&&pos>=end-80&&active<queue.length-1){
   transitioning=true;begin(active+1).finally(()=>{transitioning=false;});
  }
 },500);
 window.addEventListener('fuckball:review-collection',event=>{
  const ids=event.detail?.ids;
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX||
   ids.some(id=>!validId(id)||!byId(id))||new Set(ids).size!==ids.length){
   feedback.textContent='Collection contains missing or invalid local replay shortcuts. Refresh and try again.';
   return;
  }
  if(save(ids)){queue=[...ids];endSession();render();
   feedback.textContent='Loaded '+ids.length+' HBR2 recordings from a private collection. Choose Start review to begin.';
  }
 });
 window.addEventListener('storage',event=>{
  if(event.key===KEY){queue=read();endSession();render();}
 });
 document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&!games.hidden)refreshLibrary();
 });
 document.getElementById('replayClose')?.addEventListener('click',endSession);
 document.getElementById('tabReplay')?.addEventListener('click',refreshLibrary);
 refreshLibrary();
})();