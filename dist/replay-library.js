'use strict';
// Local replay archive. This is not an official/ranked match history: no server
// result is trusted or uploaded, and nothing is shared between devices.
const ReplayLibrary=(()=>{
 const DB_NAME='fuckball-local-replays',MAX_FILE=32*1024*1024,MAX_TOTAL=160*1024*1024,MAX_ITEMS=30;
 let database=null;
 function parseRecording(bytes){
  const data=Replay.readAll(bytes);
  const frames=Number.isSafeInteger(data?.totalFrames)&&data.totalFrames>0?data.totalFrames:0;
  const markers=Array.isArray(data?.goalMarkers)?data.goalMarkers:[];
  const goals=markers.filter(m=>m&&Number.isSafeInteger(m.frameNo)&&m.frameNo>=0&&
   (!frames||m.frameNo<=frames)&&[1,2].includes(m.teamId)).slice(0,128)
   .map(m=>({frameNo:m.frameNo,teamId:m.teamId}));
  return{frames,goals};
 }

 function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Local replay storage failed.'));});}
 async function db(){
  if(!('indexedDB'in window))throw Error('This browser does not support local replay storage.');
  if(database)return database;
  database=await new Promise((resolve,reject)=>{
   const open=indexedDB.open(DB_NAME,1);
   open.onupgradeneeded=()=>{
    const d=open.result;
    if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'id'});
    if(!d.objectStoreNames.contains('data'))d.createObjectStore('data');
   };
   open.onsuccess=()=>resolve(open.result);
   open.onerror=()=>reject(open.error||Error('Cannot open replay storage.'));
   open.onblocked=()=>reject(Error('Close other game tabs to update replay storage.'));
  });
  database.onversionchange=()=>{database.close();database=null;};
  return database;
 }
 async function list(){
  const d=await db(),tx=d.transaction('meta','readonly'),items=await request(tx.objectStore('meta').getAll());
  return items.sort((a,b)=>b.createdAt-a.createdAt);
 }
 async function save(bytes,name){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(!bytes.length||bytes.length>MAX_FILE)throw Error('Replay must be between 1 byte and 32 MB.');
  // Validate HBR2 before committing any bytes; never interpret replay metadata as HTML.
  const recording=parseRecording(bytes);
  const items=await list(),total=items.reduce((sum,item)=>sum+item.size,0);
  if(items.length>=MAX_ITEMS||total+bytes.length>MAX_TOTAL)
   throw Error('My Games is full. Delete an older recording to free space (30 items / 160 MB).');
  const random=crypto.getRandomValues(new Uint8Array(16));const id=Array.from(random,b=>b.toString(16).padStart(2,'0')).join(''),createdAt=Date.now();
  const item={id,createdAt,size:bytes.length,name:String(name||'Replay.hbr2').slice(0,100),...recording};
  const d=await db();
  await new Promise((resolve,reject)=>{
   const tx=d.transaction(['meta','data'],'readwrite');
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Could not save replay.'));
   tx.onabort=()=>reject(tx.error||Error('Could not save replay.'));
   tx.objectStore('meta').add(item);
   tx.objectStore('data').add(new Blob([bytes],{type:'application/octet-stream'}),id);
  });
  return item;
 }
 async function get(id){
  const d=await db(),tx=d.transaction(['meta','data'],'readonly');
  const [item,blob]=await Promise.all([
   request(tx.objectStore('meta').get(id)),request(tx.objectStore('data').get(id))
  ]);
  if(!item||!blob)throw Error('Replay no longer available.');
  if(blob.size>MAX_FILE)throw Error('Saved replay exceeds 32 MB.');
  return {item,bytes:new Uint8Array(await blob.arrayBuffer())};
 }
 async function remove(id){
  const d=await db();
  await new Promise((resolve,reject)=>{
   const tx=d.transaction(['meta','data'],'readwrite');
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Could not delete replay.'));
   tx.onabort=()=>reject(tx.error||Error('Could not delete replay.'));
   tx.objectStore('meta').delete(id);tx.objectStore('data').delete(id);
  });
 }
 async function updateMeta(id,change){
  const d=await db();
  return new Promise((resolve,reject)=>{
   const tx=d.transaction('meta','readwrite'),store=tx.objectStore('meta');
   let saved;
   const lookup=store.get(id);
   lookup.onsuccess=()=>{
    if(!lookup.result){tx.abort();return;}
    saved=change(lookup.result);
    store.put(saved);
   };
   tx.oncomplete=()=>resolve(saved);
   tx.onerror=()=>reject(tx.error||Error('Could not update replay.'));
   tx.onabort=()=>reject(Error('Replay missing or could not be updated.'));
  });
 }
 function normalizeTags(raw){
  if(raw===undefined)return[];
  if(!Array.isArray(raw)||raw.length>8)throw Error('A replay can have at most 8 tags.');
  const seen=new Set();
  return raw.map(value=>{
   if(typeof value!=='string')throw Error('Replay tag must be text.');
   const tag=value.trim().replace(/\s+/g,' ');
   if(!tag||tag.length>24||/[\x00-\x1f\x7f<>]/.test(tag))
    throw Error('Replay tags must be 1–24 characters without control characters or brackets.');
   const key=tag.toLocaleLowerCase();
   if(seen.has(key))throw Error('Duplicate replay tag.');
   seen.add(key);return tag;
  });
 }
 function setTags(id,tags){
  const normalized=normalizeTags(tags);
  return updateMeta(id,item=>({...item,tags:normalized}));
 }
 function rename(id,value){
  let name=String(value||'').trim().replace(/[\\/<>:"|?*\x00-\x1f]/g,'_');
  if(!name)throw Error('Replay name cannot be empty.');
  if(!/\.hbr2$/i.test(name))name=name.slice(0,95)+'.hbr2';
  name=name.slice(0,100);
  return updateMeta(id,item=>({...item,name}));
 }
 function setFavorite(id,value){return updateMeta(id,item=>({...item,favorite:value===true}));}
 function normalizeBookmarks(raw,frames){
  if(raw===undefined)return[];
  if(!Array.isArray(raw)||raw.length>30)throw Error('A replay can have at most 30 bookmarks.');
  const limit=Number.isSafeInteger(frames)&&frames>0?frames:60*60*8*60;
  const seen=new Set();
  return raw.map(entry=>{
   if(!entry||typeof entry!=='object'||!Number.isSafeInteger(entry.frameNo)||
    entry.frameNo<0||entry.frameNo>limit||typeof entry.label!=='string'||
    !entry.label.trim()||entry.label.trim().length>48||/[\x00-\x1f]/.test(entry.label)||
    seen.has(entry.frameNo))throw Error('Replay bookmark is invalid.');
   seen.add(entry.frameNo);
   return{frameNo:entry.frameNo,label:entry.label.trim()};
  }).sort((a,b)=>a.frameNo-b.frameNo);
 }
 function addBookmark(id,frameNo,label){
  return updateMeta(id,item=>({...item,bookmarks:normalizeBookmarks([
   ...(item.bookmarks||[]),{frameNo,label}],item.frames)}));
 }
 function removeBookmark(id,frameNo){
  return updateMeta(id,item=>({...item,bookmarks:normalizeBookmarks(
   (item.bookmarks||[]).filter(b=>b.frameNo!==frameNo),item.frames)}));
 }
 // Only portable user-owned archives may restore local display metadata.
 // Never import account IDs, server results or any claim of verified rankings.
 function restoreDetails(id,details){
  if(!details||typeof details.favorite!=='boolean'||!Number.isSafeInteger(details.createdAt)||
   details.createdAt<=0||details.createdAt>Date.now()+86400000)throw Error('Invalid replay metadata.');
  return updateMeta(id,item=>({...item,createdAt:details.createdAt,favorite:details.favorite,
   bookmarks:normalizeBookmarks(details.bookmarks,item.frames),
   tags:normalizeTags(details.tags)}));
 }
 return{list,save,get,remove,parseRecording,rename,setFavorite,restoreDetails,
  normalizeBookmarks,addBookmark,removeBookmark,normalizeTags,setTags};
})();
const gamesList=$('gamesList'),gamesStatus=$('gamesStatus'),gamesEmpty=$('gamesEmpty');
const gamesSearch=$('gamesSearch'),gamesSort=$('gamesSort');
gamesSort.add(new Option('Favorites first','favorites'));
let favoritesOnly=false,activeLocalReplayId=null,selectedTag='all';
const tagsFilterLabel=document.createElement('label');tagsFilterLabel.textContent='Collection tag';
const tagsFilter=document.createElement('select');tagsFilter.setAttribute('aria-label','Filter replays by collection tag');
tagsFilter.className='games-tags-filter';tagsFilter.add(new Option('All tags','all'));
tagsFilterLabel.append(tagsFilter);
document.querySelector('.my-games-tools').insertBefore(tagsFilterLabel,$('gamesImport'));
tagsFilter.onchange=()=>{selectedTag=tagsFilter.value;renderMyGames();};
const favoritesToggle=document.createElement('button');
favoritesToggle.type='button';favoritesToggle.className='games-favorites-toggle';
favoritesToggle.setAttribute('aria-pressed','false');
favoritesToggle.textContent='☆ Favorites';
favoritesToggle.onclick=()=>{
 favoritesOnly=!favoritesOnly;favoritesToggle.setAttribute('aria-pressed',String(favoritesOnly));
 renderMyGames();
};
document.querySelector('.my-games-tools').insertBefore(favoritesToggle,$('gamesImport'));

function recordingLength(frames){
 if(!Number.isSafeInteger(frames)||frames<=0)return 'Duration unknown';
 return 'Recording '+fmt(frames/60);
}
function goalsLabel(item){
 if(!Array.isArray(item.goals))return 'Goal markers unavailable';
 const red=item.goals.filter(x=>x.teamId===1).length;
 const blue=item.goals.filter(x=>x.teamId===2).length;
 return 'Recorded goals '+red+' red · '+blue+' blue';
}

function gamesMessage(message){gamesStatus.textContent=message;}
function editGameName(item){
 const dialog=document.createElement('dialog');dialog.className='game-rename-dialog';
 const form=document.createElement('form');form.className='game-rename-form';
 const heading=document.createElement('h2');heading.textContent='Rename recording';
 const label=document.createElement('label');label.textContent='New replay name';
 const input=document.createElement('input');input.type='text';input.maxLength=100;
 input.value=item.name;input.required=true;label.append(input);
 const actions=document.createElement('div');actions.className='game-rename-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
 const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Save name';
 actions.append(cancel,save);form.append(heading,label,actions);dialog.append(form);
 form.onsubmit=async event=>{
  event.preventDefault();save.disabled=true;
  try{await ReplayLibrary.rename(item.id,input.value);dialog.close();await renderMyGames();}
  catch(e){gamesMessage('Rename failed: '+(e.message||String(e)));save.disabled=false;}
 };
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.append(dialog);dialog.showModal();input.focus();input.select();
}
function editGameTags(item){
 const dialog=document.createElement('dialog');dialog.className='game-rename-dialog';
 const form=document.createElement('form');form.className='game-rename-form';
 const heading=document.createElement('h2');heading.textContent='Organize recording';
 const hint=document.createElement('p');hint.className='games-tag-hint';
 hint.textContent='Add up to 8 labels, separated by commas (24 characters each). Kept on this device and included in your ZIP backups.';
 const label=document.createElement('label');label.textContent='Collection tags';
 const input=document.createElement('input');input.type='text';input.maxLength=220;
 input.placeholder='Tournament, best goals, training';input.value=(item.tags||[]).join(', ');
 label.append(input);
 const actions=document.createElement('div');actions.className='game-rename-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
 const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Save tags';
 actions.append(cancel,save);form.append(heading,hint,label,actions);dialog.append(form);
 form.onsubmit=async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const tags=input.value.trim()?input.value.split(',').map(tag=>tag.trim()):[];
   await ReplayLibrary.setTags(item.id,tags);
   dialog.close();await renderMyGames();
  }catch(e){hint.textContent=e.message||'Could not save tags.';save.disabled=false;}
 };
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 document.body.append(dialog);dialog.showModal();input.focus();
}
function makeGameButton(text,description,handler){
 const button=document.createElement('button');button.type='button';button.textContent=text;
 button.setAttribute('aria-label',description);
 button.onclick=async()=>{button.disabled=true;try{await handler();}catch(e){gamesMessage(e.message||'Replay action failed.');}finally{button.disabled=false;}};
 return button;
}
async function renderMyGames(){
 gamesMessage('Loading local replays…');
 try{
  const all=await ReplayLibrary.list(),term=gamesSearch.value.trim().toLocaleLowerCase();
  const availableTags=new Map();
  for(const item of all)for(const tag of ReplayLibrary.normalizeTags(item.tags)){
   const key=tag.toLocaleLowerCase();if(!availableTags.has(key))availableTags.set(key,tag);
  }
  if(selectedTag!=='all'&&!availableTags.has(selectedTag))selectedTag='all';
  tagsFilter.replaceChildren(new Option('All tags','all'));
  for(const [key,name] of [...availableTags].sort((a,b)=>a[1].localeCompare(b[1])))
   tagsFilter.add(new Option(name,key));
  tagsFilter.value=selectedTag;
  const items=all.filter(item=>item.name.toLocaleLowerCase().includes(term)&&
   (!favoritesOnly||item.favorite===true)&&
   (selectedTag==='all'||(item.tags||[]).some(tag=>tag.toLocaleLowerCase()===selectedTag)));
  const favoriteCount=all.filter(item=>item.favorite===true).length;
  favoritesToggle.textContent=(favoritesOnly?'★ Show all':'☆ Favorites')+' ('+favoriteCount+')';
  if(gamesSort.value==='oldest')items.sort((a,b)=>a.createdAt-b.createdAt);
  if(gamesSort.value==='longest')items.sort((a,b)=>(b.frames||0)-(a.frames||0)||b.createdAt-a.createdAt);
  if(gamesSort.value==='favorites')items.sort((a,b)=>Number(b.favorite===true)-Number(a.favorite===true)||b.createdAt-a.createdAt);
  gamesList.replaceChildren();gamesEmpty.hidden=all.length!==0;
  $('gamesCount').textContent=all.length+' / 30 saved';
  for(const item of items){
   const row=document.createElement('article');row.className='game-entry'+(item.favorite===true?' game-entry-favorite':'');
   const detail=document.createElement('div');detail.className='game-entry-info';
   const title=document.createElement('strong');title.textContent=item.name;
   const metadata=document.createElement('span');
   metadata.textContent=new Date(item.createdAt).toLocaleString()+' · '+(item.size/1048576).toFixed(1)+' MB · '+recordingLength(item.frames)+' · '+goalsLabel(item)+' · '+(item.bookmarks?.length||0)+' saved moments · LOCAL';
   detail.append(title,metadata);
   if(item.tags?.length){
    const chips=document.createElement('div');chips.className='games-tag-chips';
    for(const tag of item.tags){
     const chip=document.createElement('span');chip.className='games-tag-chip';
     chip.textContent=tag;chips.append(chip);
    }
    detail.append(chips);
   }
   const controls=document.createElement('div');controls.className='game-entry-actions';
   const star=makeGameButton(item.favorite===true?'★ Saved':'☆ Favorite',
    'Toggle favorite for '+item.name,async()=>{
     await ReplayLibrary.setFavorite(item.id,item.favorite!==true);await renderMyGames();
    });
   star.className='game-star';star.setAttribute('aria-pressed',String(item.favorite===true));
   controls.append(
    makeGameButton('▶ Watch','Watch '+item.name,async()=>{
     const {bytes}=await ReplayLibrary.get(item.id);
     loadReplay(bytes,item.name);activeLocalReplayId=item.id;
     if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();gamesMessage('');
    }),
    star,
    makeGameButton('Rename','Rename '+item.name,()=>editGameName(item)),
    makeGameButton('Tags','Organize '+item.name+' into collections',()=>editGameTags(item)),
    makeGameButton('↓ Export','Download '+item.name,async()=>{
     const {bytes}=await ReplayLibrary.get(item.id);
     saveReplayDownload(bytes,item.name);
    }),
    makeGameButton('Delete','Delete '+item.name,async()=>{
     if(!confirm('Delete this replay from this browser? This cannot be undone.'))return;
     await ReplayLibrary.remove(item.id);await renderMyGames();
    })
   );
   row.append(detail,controls);gamesList.append(row);
  }
  gamesMessage(all.length?'Stored only in this browser. Goal markers are from unverified recordings.':(term?'':'Import a recording to get started.'));
  if(all.length&&!items.length)gamesMessage('No replays match the current search, favorites and tag filters.');
 }catch(e){
  gamesEmpty.hidden=true;gamesList.replaceChildren();
  gamesMessage('Local replay storage is unavailable: '+(e.message||'Unknown error')+'. Downloads still work.');
 }
}
const saveReplayDownload=saveBlob;
saveBlob=function(bytes,name,type){
 // Keep the original user-requested download even if IndexedDB is blocked/full.
 saveReplayDownload(bytes,name,type);
 if(/\.hbr2$/i.test(name)&&bytes&&bytes.length){
  ReplayLibrary.save(bytes,name).then(()=>{
   if(!$('gamesView').hidden)renderMyGames();
  }).catch(e=>notify('Replay downloaded, but not stored in My Games: '+e.message));
 }
};
$('gamesImport').onclick=()=>$('gamesImportFile').click();
$('gamesImportFile').onchange=async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 gamesMessage('Importing replay…');
 try{
  if(file.size>32*1024*1024)throw Error('Replay exceeds 32 MB.');
  await ReplayLibrary.save(new Uint8Array(await file.arrayBuffer()),file.name);
  await renderMyGames();gamesMessage('Replay added to My Games.');
 }catch(err){gamesMessage('Import failed: '+(err.message||String(err)));}
};

gamesSearch.addEventListener('input',()=>renderMyGames());
gamesSort.addEventListener('change',()=>renderMyGames());
function renderReplayMoments(bytes){
 const target=$('replayMoments');target.replaceChildren();
 const recording=ReplayLibrary.parseRecording(bytes),goals=recording.goals;
 target.hidden=!goals.length;
 if(!goals.length)return;
 const legend=document.createElement('strong');legend.textContent='Jump to goal';target.append(legend);
 goals.forEach((goal,i)=>{
  const b=document.createElement('button');b.type='button';b.className='replay-moment '+(goal.teamId===1?'red':'blue');
  b.textContent=(goal.teamId===1?'RED':'BLUE')+' '+(i+1)+' · '+fmt(goal.frameNo/60);
  b.setAttribute('aria-label','Seek to '+(goal.teamId===1?'red':'blue')+' goal at '+fmt(goal.frameNo/60));
  b.onclick=()=>{
   if(!replay)return;
   replay.setTime(Math.min(replay.length(),goal.frameNo*1000/60));
   replay.setSpeed(1);$('replayToggle').textContent='Ⅱ';
  };target.append(b);
 });
}
const replayLoadWithMoments=loadReplay;
loadReplay=function(bytes,name){
 replayLoadWithMoments(bytes,name);
 renderReplayMoments(bytes);
};
const replayCloseWithMoments=closeReplay;
closeReplay=function(){
 replayCloseWithMoments();
 $('replayMoments').hidden=true;$('replayMoments').replaceChildren();
};
