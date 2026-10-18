'use strict';
// User-owned Stadium Locker. Maps are validated by the game's existing native
// stadium parser and stored locally; this never uploads or applies a map in
// an online / peer / replay match.
(function(){
 const parent=document.querySelector('#menuVideoPane .rm-form');
 if(!parent||typeof Utils==='undefined'||typeof Utils.parseStadium!=='function'||typeof applyMap!=='function')return;
 const DB='fuckball-stadium-locker-v1',STORE='stadiums';
 const MAX_ITEMS=12,MAX_BYTES=16*1024*1024,MAX_MAP=2*1024*1024;
 const section=document.createElement('section');section.className='stadium-locker';
 section.setAttribute('aria-label','My saved local stadiums');
 const heading=document.createElement('h3');heading.textContent='STADIUM LOCKER.';
 const intro=document.createElement('p');intro.textContent='Build a personal collection of real HaxBall stadiums. Save your current field or import .hbs, then load it into a LOCAL match. Online rooms and replay playback are never changed by this locker.';
 const top=document.createElement('div');top.className='stadium-locker-top';
 const label=document.createElement('label');label.textContent='Collection label (optional)';
 const alias=document.createElement('input');alias.type='text';alias.maxLength=60;alias.placeholder='e.g. Fast 4v4 arena';
 alias.setAttribute('aria-label','Custom name for the saved stadium');label.append(alias);
 const save=document.createElement('button');save.type='button';save.textContent='☆ Save current stadium';
 const fileImport=document.createElement('button');fileImport.type='button';fileImport.textContent='↓ Import .hbs';
 top.append(label,save,fileImport);
 const actions=document.createElement('div');actions.className='stadium-locker-actions';
 const backup=document.createElement('button');backup.type='button';backup.textContent='↑ Export collection .json';
 const restore=document.createElement('button');restore.type='button';restore.textContent='↓ Import collection .json';
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh collection';
 actions.append(backup,restore,refresh);
 const file=document.createElement('input');file.type='file';file.accept='.hbs,.json,application/json';file.hidden=true;
 const backupFile=document.createElement('input');backupFile.type='file';backupFile.accept='.json,application/json';backupFile.hidden=true;
 const status=document.createElement('p');status.className='stadium-locker-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const summary=document.createElement('p');summary.className='stadium-locker-summary';
 const cards=document.createElement('div');cards.className='stadium-locker-cards';
 section.append(heading,intro,top,actions,file,backupFile,status,summary,cards);parent.append(section);
 const humanBytes=n=>(n/1048576).toFixed(1)+' MiB';
 let dbPromise=null,renderEpoch=0,busy=false;
 function request(op){return new Promise((ok,fail)=>{op.onsuccess=()=>ok(op.result);op.onerror=()=>fail(op.error||Error('Local storage request failed.'));});}
 function database(){
  if(!('indexedDB'in window))return Promise.reject(Error('IndexedDB is unavailable in this browser.'));
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((ok,fail)=>{
   const open=indexedDB.open(DB,1);
   open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains(STORE))
    open.result.createObjectStore(STORE,{keyPath:'id'});};
   open.onsuccess=()=>{const db=open.result;db.onversionchange=()=>{db.close();dbPromise=null;};ok(db);};
   open.onerror=()=>fail(open.error||Error('Stadium storage could not be opened.'));
   open.onblocked=()=>fail(Error('Close other Fuckball tabs before using Stadium Locker.'));
  }).catch(error=>{dbPromise=null;throw error;});
  return dbPromise;
 }
 async function all(){
  const db=await database();
  const transaction=db.transaction(STORE,'readonly');
  const rows=await request(transaction.objectStore(STORE).getAll());
  return rows.sort((a,b)=>b.createdAt-a.createdAt);
 }
 function safeName(name){return String(name||'stadium').replace(/[^a-z0-9._-]/gi,'_').slice(0,55)||'stadium';}
 function normalizeName(value){const name=String(value||'').trim();
  if(name.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(name))throw Error('Invalid stadium label.');
  return name;
 }
 function normalize(text,labelValue){
  if(typeof text!=='string'||!text.length||new Blob([text]).size>MAX_MAP)
   throw Error('A stadium must be under 2 MiB.');
  // The exact parser used by the game's existing Import Stadium control.
  const parsed=Utils.parseStadium(text);
  if(!parsed||typeof parsed.name!=='string'||!parsed.name.trim()||
    !Number.isFinite(parsed.width)||!Number.isFinite(parsed.height)||
    parsed.width<=0||parsed.height<=0||parsed.width>10000||parsed.height>10000)
   throw Error('Not a valid named HaxBall stadium.');
  const code=Utils.exportStadium(parsed),size=new Blob([code]).size;
  if(!size||size>MAX_MAP)throw Error('Validated stadium exceeds the 2 MiB limit.');
  return {name:parsed.name.slice(0,60),alias:normalizeName(labelValue)||parsed.name.slice(0,60),
   width:Math.round(parsed.width),height:Math.round(parsed.height),code,size};
 }
 function randomId(){return [...crypto.getRandomValues(new Uint8Array(16))]
  .map(n=>n.toString(16).padStart(2,'0')).join('');}
 async function addMany(items){
  if(!Array.isArray(items)||!items.length)return 0;
  const db=await database();
  return new Promise((resolve,reject)=>{
   let result=0,reason=null;
   const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
   const query=store.getAll();
   query.onsuccess=()=>{
    const present=query.result;
    const known=new Set(present.map(m=>m.code));
    const fresh=[];
    for(const item of items)if(!known.has(item.code)){
     known.add(item.code);fresh.push({...item,id:randomId(),createdAt:Date.now()+fresh.length});
    }
    const size=present.reduce((sum,m)=>sum+(m.size||0),0)+fresh.reduce((sum,m)=>sum+m.size,0);
    if(present.length+fresh.length>MAX_ITEMS){reason=Error('Stadium Locker holds up to 12 unique maps.');tx.abort();return;}
    if(size>MAX_BYTES){reason=Error('Stadium Locker collection cannot exceed 16 MiB.');tx.abort();return;}
    result=fresh.length;for(const item of fresh)store.add(item);
   };
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(reason||tx.error||Error('Could not save stadiums.'));
   tx.onabort=()=>reject(reason||tx.error||Error('Stadium import cancelled.'));
  });
 }
 async function remove(id){
  const db=await database();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');
   tx.objectStore(STORE).delete(id);
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Could not remove stadium.'));
  });
 }
 function download(content,name,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function localRoomFree(){
  if(typeof replay!=='undefined'&&replay)return 'Close the replay before changing a stadium.';
  if(typeof serverLink!=='undefined'&&serverLink?.room)return 'Leave your online room before loading a local stadium.';
  if(typeof peerConnected!=='undefined'&&peerConnected)return 'Disconnect your direct peer match before loading a stadium.';
  if(document.querySelector('.quick-queue-actions button:not([hidden])')||
    document.querySelector('.quick-ready:not([hidden])'))
   return 'Cancel the active human Quick Match search before changing a stadium.';
  return null;
 }
 function button(text,action){
  const el=document.createElement('button');el.type='button';el.textContent=text;
  el.addEventListener('click',action);return el;
 }
 function card(map){
  const el=document.createElement('article');el.className='stadium-locker-card';
  const title=document.createElement('strong');title.textContent=map.alias;
  const details=document.createElement('small');
  details.textContent='Actual stadium: '+map.name+' · '+map.width+' × '+map.height+
   ' · '+humanBytes(map.size)+' · device only';
  const tools=document.createElement('div');tools.className='stadium-locker-card-actions';
  const load=button('▶ Load locally',()=>{
   if(busy)return;
   const blocked=localRoomFree();if(blocked){status.textContent=blocked;return;}
   if(typeof started!=='undefined'&&started&&
      !window.confirm('Switch stadium and restart your current local match? Unsaved gameplay may be lost.'))return;
   try{
    applyMap(map.code);
    status.textContent='Loaded '+map.name+' through the native local stadium loader.';
   }catch(error){status.textContent='Stadium could not be loaded: '+(error.message||'Invalid map.');}
  });
  const exportButton=button('↓ Export .hbs',()=>{
   download(map.code,safeName(map.alias)+'.hbs','application/json');
   status.textContent='Local stadium exported. No upload.';
  });
  const removeButton=button('Delete',async()=>{
   if(busy||!window.confirm('Delete '+map.alias+' from this device? Your game will not be changed.'))return;
   busy=true;try{await remove(map.id);status.textContent='Deleted saved stadium '+map.alias+'.';}
   catch(error){status.textContent=error.message||'Delete failed.';}
   finally{busy=false;render();}
  });removeButton.className='stadium-locker-delete';
  tools.append(load,exportButton,removeButton);el.append(title,details,tools);return el;
 }
 async function render(){
  const token=++renderEpoch;
  try{
   const items=await all();if(token!==renderEpoch)return;
   const used=items.reduce((sum,item)=>sum+item.size,0);
   summary.textContent=items.length+' / 12 saved stadiums · '+humanBytes(used)+' / 16.0 MiB used';
   cards.replaceChildren();
   for(const item of items)cards.append(card(item));
   if(!items.length){const empty=document.createElement('p');
    empty.textContent='Nothing saved yet. Save your current stadium or import a .hbs file.';
    cards.append(empty);}
  }catch(error){if(token===renderEpoch)summary.textContent=error.message||'Local stadium storage unavailable.';}
 }
 save.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;try{
   if(typeof stadium==='undefined'||!stadium)throw Error('No current stadium to save.');
   const item=normalize(Utils.exportStadium(stadium),alias.value);
   const count=await addMany([item]);
   status.textContent=count?'Saved '+item.alias+' on this device.':'That stadium is already in your locker.';
   alias.value='';
  }catch(error){status.textContent=error.message||'Could not save this stadium.';}
  finally{busy=false;render();}
 });
 fileImport.addEventListener('click',()=>{file.value='';file.click();});
 file.addEventListener('change',async()=>{
  const candidate=file.files?.[0];if(!candidate||busy)return;
  busy=true;try{
   if(candidate.size>MAX_MAP)throw Error('Stadium file exceeds 2 MiB.');
   const normalized=normalize(await candidate.text(),alias.value);
   const count=await addMany([normalized]);
   status.textContent=count?'Imported '+normalized.alias+' into your local locker.':'This stadium was already saved.';
   alias.value='';
  }catch(error){status.textContent=error.message||'Cannot read this stadium file.';}
  finally{busy=false;render();}
 });
 backup.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;try{
   const items=await all();if(!items.length)throw Error('Save a stadium before exporting a collection.');
   const content=JSON.stringify({format:'fuckball-stadium-locker',version:1,
    stadiums:items.map(x=>({alias:x.alias,code:x.code}))});
   download(content,'fuckball-stadium-collection.json','application/json');
   status.textContent='Saved '+items.length+' personal stadiums to a local JSON backup.';
  }catch(error){status.textContent=error.message||'Collection export failed.';}
  finally{busy=false;}
 });
 restore.addEventListener('click',()=>{backupFile.value='';backupFile.click();});
 backupFile.addEventListener('change',async()=>{
  const candidate=backupFile.files?.[0];if(!candidate||busy)return;
  busy=true;try{
   if(candidate.size>MAX_BYTES+4096)throw Error('Collection backup is too large.');
   const raw=JSON.parse(await candidate.text());
   if(!raw||raw.format!=='fuckball-stadium-locker'||raw.version!==1||
      !Array.isArray(raw.stadiums)||raw.stadiums.length<1||raw.stadiums.length>MAX_ITEMS)
    throw Error('Not a supported Stadium Locker collection.');
   const imported=raw.stadiums.map(item=>{
    if(!item||typeof item.code!=='string'||typeof item.alias!=='string')throw Error('Invalid stadium entry.');
    return normalize(item.code,item.alias);
   });
   if(!window.confirm('Add these '+imported.length+' validated stadiums to your local collection? Existing maps will not be replaced.'))return;
   const count=await addMany(imported);
   status.textContent='Imported '+count+' new stadiums; duplicates skipped. No current game changed.';
  }catch(error){status.textContent=error.message||'Collection import failed; existing maps are unchanged.';}
  finally{busy=false;render();}
 });
 refresh.addEventListener('click',render);
 render();
})();