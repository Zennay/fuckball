'use strict';
// Goal gallery uses only local HBR2 metadata, never server-verified match results.
(function(){
 if(!document.getElementById('gamesView')||typeof ReplayLibrary==='undefined')return;
 const view=document.getElementById('gamesView');
 const gallery=document.createElement('section');gallery.className='goal-gallery';
 gallery.setAttribute('aria-label','My replay goal gallery');
 const head=document.createElement('div');head.className='goal-gallery-head';
 const title=document.createElement('div');const heading=document.createElement('h2');
 heading.textContent='GOAL GALLERY';
 const hint=document.createElement('p');
 hint.textContent='Jump to goals in replays saved on this device. Recording markers are not verified online match results.';
 title.append(heading,hint);
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh goals';
 const reelButton=document.createElement('button');reelButton.type='button';
 reelButton.className='goal-gallery-reel';reelButton.textContent='▶ Play filtered highlights';
 reelButton.title='Automatically play up to 60 locally saved goals, around 3 seconds before and 4 seconds after each marker';
 head.append(title,refresh,reelButton);
 const controls=document.createElement('div');controls.className='goal-gallery-filters';
 const side=document.createElement('select');side.setAttribute('aria-label','Filter goals by scoring side');
 for(const [value,label] of [['all','Both sides'],['1','Red goals'],['2','Blue goals']])side.add(new Option(label,value));
 const tag=document.createElement('select');tag.setAttribute('aria-label','Filter replay goals by collection tag');
 tag.add(new Option('All collections','all'));
 const favorites=document.createElement('label'),check=document.createElement('input');check.type='checkbox';
 favorites.append(check,document.createTextNode(' Favorites only'));
 controls.append(side,tag,favorites);
 const summary=document.createElement('p');summary.className='goal-gallery-summary';
 summary.setAttribute('aria-live','polite');
 const grid=document.createElement('div');grid.className='goal-gallery-grid';
 gallery.append(head,controls,summary,grid);
 const gamesList=document.getElementById('gamesList');gamesList.parentNode.insertBefore(gallery,gamesList);
 const navigation=document.createElement('div');navigation.className='goal-gallery-navigation';navigation.hidden=true;
 const prev=document.createElement('button'),next=document.createElement('button'),position=document.createElement('span');
 prev.type=next.type='button';prev.textContent='‹ Previous goal';next.textContent='Next goal ›';
 const stopReelButton=document.createElement('button');stopReelButton.type='button';
 stopReelButton.hidden=true;stopReelButton.textContent='■ Stop reel';
 stopReelButton.className='goal-gallery-stop';
 navigation.append(prev,position,next,stopReelButton);
 document.getElementById('replayControls').append(navigation);
 let generation=0,moments=[],selection=-1,opening=false;
 let reelActive=false,reelTimer=null,reelToken=0;
 function stopReel(){
  reelActive=false;reelToken++;
  if(reelTimer){clearTimeout(reelTimer);reelTimer=null;}
  stopReelButton.hidden=true;reelButton.textContent='▶ Play filtered highlights';
  if(navigation.hidden===false&&selection>=0)
   position.textContent='Goal '+(selection+1)+' / '+moments.length;
 }
 async function playReelMoment(index){
  if(!reelActive)return;
  const token=reelToken;
  await openMoment(index,token);
  if(!reelActive||token!==reelToken)return;
  if(selection!==index||!replay){stopReel();return;}
  const marker=moments[index].frameNo*1000/60;
  const end=Math.min(replay.length(),marker+4000);
  const duration=Math.max(500,Math.min(11000,end-replay.getTime()));
  position.textContent='Reel '+(index+1)+' / '+moments.length+' · local replay';
  reelTimer=setTimeout(()=>{
   reelTimer=null;
   if(!reelActive||token!==reelToken)return;
   // A user-paused replay must not silently jump to a different recording.
   if(replay?.getSpeed()===0&&replay.getTime()<replay.length()-250){stopReel();return;}
   if(index===moments.length-1){stopReel();return;}
   playReelMoment(index+1);
  },duration);
 }
 const clock=frame=>Math.floor(frame/3600)+':'+String(Math.floor(frame%3600/60)).padStart(2,'0');
 function availableTags(items){
  const choices=new Map();
  for(const item of items)if(Array.isArray(item.tags))
   for(const name of item.tags){
    if(typeof name!=='string'||!name.trim()||name.length>24)continue;
    const key=name.toLocaleLowerCase();
    if(!choices.has(key))choices.set(key,name);
   }
  return choices;
 }
 function present(item,g){
  const card=document.createElement('article');card.className='goal-gallery-card';
  card.classList.add(g.teamId===1?'goal-gallery-red':'goal-gallery-blue');
  const score=document.createElement('strong');
  score.textContent=(g.teamId===1?'RED':'BLUE')+' GOAL';
  const name=document.createElement('span');name.className='goal-gallery-title';
  name.textContent=item.name;
  const details=document.createElement('small');
  details.textContent=clock(g.frameNo)+' · '+new Date(item.createdAt).toLocaleDateString();
  const button=document.createElement('button');button.type='button';button.textContent='▶ Watch goal';
  button.setAttribute('aria-label','Watch '+(g.teamId===1?'red':'blue')+' goal at '+clock(g.frameNo)+' in '+item.name);
  button.onclick=()=>{stopReel();openMoment(moments.indexOf(g));};
  card.append(score,name,details,button);return card;
 }
 function render(items){
  const sideValue=side.value,tagValue=tag.value,favoriteOnly=check.checked;
  moments=items.flatMap(item=>{
   if(!Array.isArray(item.goals))return[];
   if(favoriteOnly&&item.favorite!==true)return[];
   if(tagValue!=='all'&&!(item.tags||[]).some(t=>typeof t==='string'&&t.toLocaleLowerCase()===tagValue))return[];
   return item.goals.filter(g=>g&&Number.isSafeInteger(g.frameNo)&&g.frameNo>=0&&
    (item.frames===0||g.frameNo<=item.frames)&&[1,2].includes(g.teamId)&&
    (sideValue==='all'||String(g.teamId)===sideValue)).slice(0,128)
    .map(g=>({item,frameNo:g.frameNo,teamId:g.teamId}));
  }).sort((a,b)=>b.item.createdAt-a.item.createdAt||b.frameNo-a.frameNo).slice(0,60);
  grid.replaceChildren();
  summary.textContent=moments.length?
   'Showing '+moments.length+' recent recorded goals (maximum 60) · device-local and unverified':
   'No goal markers match these filters. Import or record a local HBR2 match.';
  for(const goal of moments)grid.append(present(goal.item,goal));
  reelButton.disabled=!moments.length;
  reelButton.textContent=moments.length?'▶ Play '+moments.length+' highlights':'No goals to play';
  // Previous/next controls remain tied to the filtered list only.
  if(selection>=moments.length){selection=-1;navigation.hidden=true;}
 }
 async function openMoment(index,reelRequestToken=null){
  if(opening||index<0||index>=moments.length)return;
  const moment=moments[index],stamp=generation;
  opening=true;
  try{
   const saved=await ReplayLibrary.get(moment.item.id);
   if(stamp!==generation||reelRequestToken!==null&&(!reelActive||reelRequestToken!==reelToken))return;
   loadReplay(saved.bytes,moment.item.name);
   activeLocalReplayId=moment.item.id;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   if(stamp!==generation||!replay)return;
   replay.setTime(Math.max(0,moment.frameNo-180)*1000/60);
   replay.setSpeed(1);document.getElementById('replayToggle').textContent='Ⅱ';
   selection=index;navigation.hidden=false;
   position.textContent='Goal '+(index+1)+' / '+moments.length;
   prev.disabled=index===0;next.disabled=index===moments.length-1;
  }catch(error){
   summary.textContent='Could not open recorded goal: '+(error?.message||'local file unavailable');
  }finally{opening=false;}
 }
 prev.onclick=()=>{stopReel();openMoment(selection-1);};
 next.onclick=()=>{stopReel();openMoment(selection+1);};
 stopReelButton.onclick=stopReel;
 reelButton.onclick=()=>{
  if(reelActive){stopReel();return;}
  if(opening||!moments.length)return;
  reelActive=true;reelToken++;
  reelButton.textContent='■ Stop highlight reel';
  stopReelButton.hidden=false;
  playReelMoment(0);
 };
 async function refreshGallery(){
  if(reelActive)stopReel();
  const stamp=++generation;refresh.disabled=true;
  summary.textContent='Loading saved goal markers…';
  try{
   const items=await ReplayLibrary.list();if(stamp!==generation)return;
   const current=tag.value,choices=availableTags(items);
   tag.replaceChildren(new Option('All collections','all'));
   for(const [key,name] of [...choices].sort((a,b)=>a[1].localeCompare(b[1])))
    tag.add(new Option(name,key));
   tag.value=choices.has(current)?current:'all';
   render(items);
  }catch(error){
   if(stamp===generation){grid.replaceChildren();summary.textContent='Replay gallery unavailable: '+(error?.message||'local storage error');}
  }finally{if(stamp===generation)refresh.disabled=false;}
 }
 side.onchange=check.onchange=()=>refreshGallery();
 tag.onchange=()=>refreshGallery();
 refresh.onclick=()=>refreshGallery();
 const previousShowView=showView;
 showView=function(next){previousShowView(next);if(next==='games')refreshGallery();};
 const previousCloseReplay=closeReplay;
 closeReplay=function(){stopReel();previousCloseReplay();navigation.hidden=true;selection=-1;};
 const previousLoadReplay=loadReplay;
 loadReplay=function(...args){
  if(reelActive&&!opening)stopReel();
  return previousLoadReplay(...args);
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopReel();});
})();
