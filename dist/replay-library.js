'use strict';
// Local replay archive. This is not an official/ranked match history: no server
// result is trusted or uploaded, and nothing is shared between devices.
const ReplayLibrary=(()=>{
 const DB_NAME='fuckball-local-replays',MAX_FILE=32*1024*1024,MAX_TOTAL=160*1024*1024,MAX_ITEMS=30;
 let database=null;
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
  Replay.readAll(bytes);
  const items=await list(),total=items.reduce((sum,item)=>sum+item.size,0);
  if(items.length>=MAX_ITEMS||total+bytes.length>MAX_TOTAL)
   throw Error('My Games is full. Delete an older recording to free space (30 items / 160 MB).');
  const random=crypto.getRandomValues(new Uint8Array(16));const id=Array.from(random,b=>b.toString(16).padStart(2,'0')).join(''),createdAt=Date.now();
  const item={id,createdAt,size:bytes.length,name:String(name||'Replay.hbr2').slice(0,100)};
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
 return{list,save,get,remove};
})();
const gamesList=$('gamesList'),gamesStatus=$('gamesStatus'),gamesEmpty=$('gamesEmpty');
function gamesMessage(message){gamesStatus.textContent=message;}
function makeGameButton(text,description,handler){
 const button=document.createElement('button');button.type='button';button.textContent=text;
 button.setAttribute('aria-label',description);
 button.onclick=async()=>{button.disabled=true;try{await handler();}catch(e){gamesMessage(e.message||'Replay action failed.');}finally{button.disabled=false;}};
 return button;
}
async function renderMyGames(){
 gamesMessage('Loading local replays…');
 try{
  const items=await ReplayLibrary.list();
  gamesList.replaceChildren();gamesEmpty.hidden=items.length!==0;
  $('gamesCount').textContent=items.length+' / 30 saved';
  for(const item of items){
   const row=document.createElement('article');row.className='game-entry';
   const detail=document.createElement('div');detail.className='game-entry-info';
   const title=document.createElement('strong');title.textContent=item.name;
   const metadata=document.createElement('span');
   metadata.textContent=new Date(item.createdAt).toLocaleString()+' · '+(item.size/1048576).toFixed(1)+' MB · LOCAL';
   detail.append(title,metadata);
   const controls=document.createElement('div');controls.className='game-entry-actions';
   controls.append(
    makeGameButton('▶ Watch','Watch '+item.name,async()=>{
     const {bytes}=await ReplayLibrary.get(item.id);
     loadReplay(bytes,item.name);gamesMessage('');
    }),
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
  gamesMessage(items.length?'Stored only in this browser. These are not verified match results.':'');
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
