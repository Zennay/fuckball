'use strict';
// Portable offline backups for My Games. These are user-owned local recordings,
// not authenticated server results, ranked history, or a cloud synchronization API.
(function(){
 const MAX_ITEMS=30,MAX_TOTAL=160*1024*1024,MAX_FILE=32*1024*1024;
 const MAX_ZIP=192*1024*1024,MAX_MANIFEST=262144;
 const archiveFile=document.createElement('input');
 archiveFile.type='file';archiveFile.accept='.zip,application/zip';archiveFile.hidden=true;
 archiveFile.id='gamesBackupFile';document.body.append(archiveFile);
 const tools=document.querySelector('.my-games-tools');
 if(!tools||typeof ReplayLibrary==='undefined')return;
 const exportButton=document.createElement('button');
 exportButton.type='button';exportButton.className='games-backup-button';
 exportButton.textContent='↓ Backup all · ZIP';
 exportButton.title='Export local HBR2 recordings, bookmarks, tags and time-specific coaching notes';
 const importButton=document.createElement('button');
 importButton.type='button';importButton.className='games-backup-button';
 importButton.textContent='↑ Restore ZIP';
 importButton.title='Restore an offline My Games archive without overwriting your current recordings';
 tools.append(exportButton,importButton);

 function requireZip(){
  if(typeof JSZip!=='function')throw Error('ZIP support is unavailable in this browser.');
  if(!globalThis.crypto?.subtle)throw Error('Secure browser context required for replay backup integrity (use HTTPS or localhost).');
 }
 async function sha256(bytes){
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
 }
 function normalizedName(value){
  if(typeof value!=='string'||!value.trim()||value.length>100)throw Error('Invalid recording name in backup.');
  let name=value.trim().replace(/[\\/< >:"|?*\x00-\x1f]/g,'_');
  if(!/\.hbr2$/i.test(name))name=name.slice(0,95)+'.hbr2';
  return name.slice(0,100);
 }
 function validDate(value){
  return Number.isSafeInteger(value)&&value>0&&value<=Date.now()+86400000;
 }
 function zipSize(entry){
  // Central-directory uncompressed sizes are checked before allocation.
  const size=entry?._data?.uncompressedSize;
  if(!Number.isSafeInteger(size)||size<0)throw Error('ZIP entry size is unavailable; archive refused.');
  return size;
 }
 function downloadArchive(blob){
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='fuckball-my-games-'+new Date().toISOString().slice(0,10)+'.zip';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function exportArchive(){
  requireZip();
  const items=await ReplayLibrary.list();
  if(!items.length)throw Error('No recordings to back up yet.');
  if(items.length>MAX_ITEMS)throw Error('Too many recordings for one backup.');
  const zip=new JSZip(),entries=[];
  for(let i=0;i<items.length;i++){
   const item=items[i],saved=await ReplayLibrary.get(item.id),bytes=saved.bytes;
   if(!/^[a-f0-9]{32}$/.test(item.id)||bytes.length>MAX_FILE)
    throw Error('A saved replay cannot be archived.');
   const path='replays/'+item.id+'.hbr2';
   zip.file(path,bytes,{binary:true,compression:'STORE',createFolders:false});
   entries.push({id:item.id,path,name:normalizedName(item.name),createdAt:item.createdAt,
    size:bytes.length,favorite:item.favorite===true,
    bookmarks:ReplayLibrary.normalizeBookmarks(item.bookmarks,item.frames),
    tags:ReplayLibrary.normalizeTags(item.tags),
     review:ReplayLibrary.normalizeReview(item.review),
     notes:ReplayLibrary.normalizeNotes(item.notes,item.frames),sha256:await sha256(bytes)});
   gamesMessage('Preparing backup '+(i+1)+' / '+items.length+'…');
  }
  const manifest=JSON.stringify({format:'fuckball-local-replays',version:1,entries});
  if(manifest.length>MAX_MANIFEST)throw Error('Backup index exceeded the size limit.');
  zip.file('manifest.json',manifest,{compression:'STORE'});
  const blob=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true},
   info=>gamesMessage('Packing replays '+Math.floor(info.percent)+'%…'));
  if(blob.size>MAX_ZIP)throw Error('ZIP backup would exceed 192 MB.');
  downloadArchive(blob);
  gamesMessage('Backup downloaded: '+items.length+' replays · offline archive, not official match results.');
 }
 function parseManifest(zip){
  const file=zip.file('manifest.json');
  if(!file||zipSize(file)>MAX_MANIFEST)throw Error('This is not a compatible My Games backup.');
  return file.async('string').then(raw=>{
   let data;try{data=JSON.parse(raw);}catch{throw Error('Backup manifest is malformed.');}
   if(data?.format!=='fuckball-local-replays'||data.version!==1||
      !Array.isArray(data.entries)||data.entries.length>MAX_ITEMS)
    throw Error('Unsupported or oversized My Games backup.');
   const paths=new Set(['manifest.json']);
   for(const entry of data.entries){
    if(!entry||typeof entry!=='object'||!/^[a-f0-9]{32}$/.test(entry.id)||
     entry.path!=='replays/'+entry.id+'.hbr2'||paths.has(entry.path)||
     typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||
     !Number.isSafeInteger(entry.size)||entry.size<=0||entry.size>MAX_FILE||
     !validDate(entry.createdAt)||typeof entry.favorite!=='boolean')
     throw Error('Backup contains an invalid replay record.');
    normalizedName(entry.name);
    // Bookmarks are optional for legacy v1 archives, mandatory to validate when present.
    // The frame count is checked against the actual HBR2 after decompression.
    ReplayLibrary.normalizeBookmarks(entry.bookmarks);
    ReplayLibrary.normalizeTags(entry.tags);ReplayLibrary.normalizeReview(entry.review);
    ReplayLibrary.normalizeNotes(entry.notes);
    const zipped=zip.file(entry.path);
    if(!zipped||zipSize(zipped)!==entry.size)throw Error('Backup replay is missing or has an invalid size.');
    paths.add(entry.path);
   }
   const unexpected=Object.keys(zip.files).filter(path=>!paths.has(path)&&path!=='replays/');
   if(unexpected.length)throw Error('Backup contains unexpected ZIP files.');
   if(data.entries.reduce((total,x)=>total+x.size,0)>MAX_TOTAL)
    throw Error('Backup exceeds the 160 MB library limit.');
   return data.entries;
  });
 }
 async function importArchive(file){
  requireZip();
  if(!file||file.size<=0||file.size>MAX_ZIP)throw Error('Backup must be a ZIP of at most 192 MB.');
  gamesMessage('Reading archive index…');
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const entries=await parseManifest(zip);
  const existing=await ReplayLibrary.list(),prepared=[],hashCache=new Map();
  let total=existing.reduce((n,x)=>n+x.size,0),skipped=0;
  // Fully inspect replay content and declared digests before writing to storage.
  // Malformed archives cannot partially import valid-looking entries.
  for(let i=0;i<entries.length;i++){
   const entry=entries[i],bytes=await zip.file(entry.path).async('uint8array');
   if(bytes.length!==entry.size||await sha256(bytes)!==entry.sha256)
    throw Error('Replay checksum mismatch: '+normalizedName(entry.name));
   let recording;
   try{recording=ReplayLibrary.parseRecording(bytes);}catch{throw Error('Invalid HBR2 replay: '+normalizedName(entry.name));}
   try{ReplayLibrary.normalizeBookmarks(entry.bookmarks,recording.frames);ReplayLibrary.normalizeTags(entry.tags);ReplayLibrary.normalizeReview(entry.review);
    ReplayLibrary.normalizeNotes(entry.notes,recording.frames);}
   catch{throw Error('Invalid bookmarks in replay: '+normalizedName(entry.name));}
   const normalized=normalizedName(entry.name);
   let duplicate=false;
   for(const other of existing){
    if(other.size!==bytes.length||other.name!==normalized)continue;
    if(!hashCache.has(other.id)){
     const current=await ReplayLibrary.get(other.id);
     hashCache.set(other.id,await sha256(current.bytes));
    }
    if(hashCache.get(other.id)===entry.sha256){duplicate=true;break;}
   }
   if(!duplicate&&prepared.some(x=>x.entry.sha256===entry.sha256&&x.name===normalized))duplicate=true;
   if(duplicate){skipped++;continue;}
   total+=bytes.length;
   if(existing.length+prepared.length+1>MAX_ITEMS||total>MAX_TOTAL)
    throw Error('Not enough space in My Games. Remove older recordings before restoring this backup.');
   prepared.push({entry,name:normalized,bytes});
   gamesMessage('Checking replays '+(i+1)+' / '+entries.length+'…');
  }
  const inserted=[];
  try{
   for(let i=0;i<prepared.length;i++){
    const item=prepared[i],saved=await ReplayLibrary.save(item.bytes,item.name);
    inserted.push(saved.id);
    await ReplayLibrary.restoreDetails(saved.id,{createdAt:item.entry.createdAt,favorite:item.entry.favorite,
     bookmarks:item.entry.bookmarks,tags:item.entry.tags,review:item.entry.review,notes:item.entry.notes});
    gamesMessage('Restoring '+(i+1)+' / '+prepared.length+'…');
   }
  }catch(error){
   await Promise.allSettled(inserted.map(id=>ReplayLibrary.remove(id)));
   throw Error('Restore was rolled back: '+(error.message||'storage failed'));
  }
  await renderMyGames();
  gamesMessage('Restored '+inserted.length+' replay'+(inserted.length===1?'':'s')+
   (skipped?' · '+skipped+' already here':'')+'. Stored locally; not ranked or server-verified.');
 }
 let archiveBusy=false;
 function busy(value){
  archiveBusy=value;
  exportButton.disabled=importButton.disabled=value;
 }
 // Coordinate only import-in-progress state with the local HBR2 desk. No
 // player data, replay bytes, server results or session info are shared.
 window.FuckballReplayArchive={isBusy:()=>archiveBusy};
 function hasActiveTransfer(){
  if(archiveBusy||window.FuckballReplayImportDesk?.isBusy?.()){
   gamesMessage('Another local replay import or ZIP transfer is in progress. Finish it before starting another.');
   return true;
  }
  return false;
 }
 exportButton.addEventListener('click',async()=>{
  if(hasActiveTransfer())return;
  busy(true);
  try{await exportArchive();}catch(error){gamesMessage('Backup failed: '+error.message);}
  finally{busy(false);}
 });
 importButton.addEventListener('click',()=>{
  if(hasActiveTransfer())return;
  archiveFile.click();
 });
 archiveFile.addEventListener('change',async()=>{
  const file=archiveFile.files?.[0];archiveFile.value='';if(!file||hasActiveTransfer())return;
  busy(true);
  try{await importArchive(file);}catch(error){gamesMessage('Restore failed: '+error.message);}
  finally{busy(false);}
 });
 const view=document.getElementById('gamesView');
 view.addEventListener('dragover',event=>{
  if(event.dataTransfer?.types?.includes('Files'))event.preventDefault();
 });
 view.addEventListener('drop',async event=>{
  // A staged HBR2 drop was already handled by the import desk. ZIP archives
  // are a separate destructive-to-storage operation and must never consume
  // a bubbled HBR2 drop, or silently ignore other files in a mixed batch.
  if(event.defaultPrevented||!event.dataTransfer?.files?.length)return;
  event.preventDefault();
  const files=Array.from(event.dataTransfer.files);
  if(files.length!==1||!/\.zip$/i.test(files[0].name)){
   gamesMessage('Drop exactly one My Games ZIP backup. Drop individual .hbr2 files in the import desk.');
   return;
  }
  if(hasActiveTransfer())return;
  const file=files[0];
  if(typeof window.confirm!=='function'||!window.confirm(
   'Restore the '+file.name+' ZIP backup into My Games? This may add recordings to device storage. Existing recordings are never overwritten.')){
   gamesMessage('ZIP restore cancelled. Your local recordings were left unchanged.');
   return;
  }
  busy(true);
  try{await importArchive(file);}catch(error){gamesMessage('Restore failed: '+error.message);}
  finally{busy(false);}
 });
})();