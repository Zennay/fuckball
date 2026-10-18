'use strict';
// Portable backups for screenshots the player explicitly saved on this device.
// Restores only PNGs with a matching manifest/hash, atomically, into existing
// IndexedDB. No account, server, player identity, chat or ranked data included.
(function(){
 const dialog=document.querySelector('.moment-dialog');
 const tools=dialog?.querySelector('.moment-tools');
 const status=dialog?.querySelector('.moment-status');
 if(!dialog||!tools||!status)return;
 const DATABASE='fuckball-local-moments-v1',STORE='moments';
 const LIMIT=24,MAX_PNG=8*1048576,MAX_TOTAL=96*1048576,MAX_ARCHIVE=105*1048576;
 const MAX_MANIFEST=32768,FORMAT='fuckball-private-moments';
 const exportButton=document.createElement('button');exportButton.type='button';
 exportButton.textContent='↓ Backup photos · ZIP';
 const importButton=document.createElement('button');importButton.type='button';
 importButton.textContent='↑ Restore ZIP';
 const picker=document.createElement('input');picker.type='file';picker.hidden=true;
 picker.accept='.zip,application/zip';picker.setAttribute('aria-label','Restore saved photo ZIP');
 tools.append(exportButton,importButton,picker);
 const note=document.createElement('p');note.className='moment-backup-note';
 note.textContent='A photo ZIP includes your pitch images, captions and favorites. Keep backups private: visible names and match scores may appear in screenshots. Restoring never overwrites existing photos.';
 dialog.querySelector('.moment-shell')?.insertBefore(note,status);
 let busy=false;
 function setBusy(value){
  busy=value;exportButton.disabled=importButton.disabled=value;
 }
 function requireSecureZip(){
  if(typeof JSZip!=='function')throw Error('ZIP support is unavailable.');
  if(!crypto?.subtle)throw Error('Photo backup needs HTTPS or localhost for secure checksums.');
 }
 function validId(id){return typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);}
 function validAt(value){return Number.isSafeInteger(value)&&value>0&&value<=Date.now()+86400000;}
 function label(value){
  if(typeof value!=='string'||value.length>80||!value.trim())throw Error('Invalid photo caption.');
  return value.trim();
 }
 function zipSize(file){
  const size=file?._data?.uncompressedSize;
  if(!Number.isSafeInteger(size)||size<0)throw Error('ZIP entry size unavailable.');
  return size;
 }
 async function digest(bytes){
  const result=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(result,b=>b.toString(16).padStart(2,'0')).join('');
 }
 function hasPngSignature(bytes){
  if(bytes.length<45)return false;
  const head=[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82];
  if(head.some((value,i)=>bytes[i]!==value))return false;
  const end=[0,0,0,0,73,69,78,68,174,66,96,130];
  return end.every((value,i)=>bytes[bytes.length-12+i]===value);
 }
 function openDb(){
  return new Promise((resolve,reject)=>{
   if(!window.indexedDB){reject(Error('Local photo storage unavailable.'));return;}
   const request=indexedDB.open(DATABASE,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(STORE))
     request.result.createObjectStore(STORE,{keyPath:'id'});
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('Local photo database could not be opened.'));
   request.onblocked=()=>reject(Error('Close other Fuckball tabs and retry.'));
  });
 }
 async function readAll(){
  const db=await openDb();
  try{
   return await new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readonly');
    const request=transaction.objectStore(STORE).getAll();
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('Saved photos could not be read.'));
   });
  }finally{db.close();}
 }
 function download(blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='fuckball-private-moments-'+new Date().toISOString().slice(0,10)+'.zip';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function backup(){
  requireSecureZip();
  const rows=(await readAll()).filter(item=>item?.blob instanceof Blob);
  if(!rows.length)throw Error('Capture a local photo before making a backup.');
  if(rows.length>LIMIT||rows.reduce((n,row)=>n+row.blob.size,0)>MAX_TOTAL)
   throw Error('Saved photos exceed archive limits.');
  const zip=new JSZip(),entries=[],ids=new Set();
  for(const row of rows){
   if(!validId(row.id)||ids.has(row.id)||!validAt(row.at)||row.blob.size>MAX_PNG||
     !row.blob.size)throw Error('One saved photo has invalid metadata.');
   ids.add(row.id);
   const bytes=new Uint8Array(await row.blob.arrayBuffer());
   if(!hasPngSignature(bytes))throw Error('Only real PNG screenshots can be exported.');
   const path='images/'+row.id+'.png';
   zip.file(path,bytes,{binary:true,compression:'STORE',createFolders:false});
   entries.push({id:row.id,path,at:row.at,label:label(row.label||'Match snapshot'),
    favorite:row.favorite===true,size:bytes.length,sha256:await digest(bytes)});
   status.textContent='Packing local photo '+entries.length+' / '+rows.length+'…';
  }
  const manifest=JSON.stringify({format:FORMAT,version:1,entries});
  if(new TextEncoder().encode(manifest).length>MAX_MANIFEST)throw Error('Photo index exceeds the size limit.');
  zip.file('manifest.json',manifest,{compression:'STORE'});
  const blob=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
  if(blob.size>MAX_ARCHIVE)throw Error('Backup is over 105 MB.');
  download(blob);
  status.textContent='Private photo backup downloaded · '+rows.length+' PNG files. Nothing uploaded.';
 }
 async function parse(zip){
  const index=zip.file('manifest.json');
  if(!index||zipSize(index)>MAX_MANIFEST)throw Error('Not a supported Moments ZIP.');
  let data;try{data=JSON.parse(await index.async('string'));}
  catch{throw Error('Photo backup manifest is damaged.');}
  if(data?.format!==FORMAT||data.version!==1||
   !Array.isArray(data.entries)||data.entries.length>LIMIT)throw Error('Unsupported photo ZIP version or count.');
  const ids=new Set(),paths=new Set(['manifest.json']),items=[];
  let total=0;
  for(const row of data.entries){
   if(!row||!validId(row.id)||ids.has(row.id)||!validAt(row.at)||
    row.path!=='images/'+row.id+'.png'||typeof row.favorite!=='boolean'||
    !Number.isSafeInteger(row.size)||row.size<=0||row.size>MAX_PNG||
    typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))
    throw Error('Invalid photo record or duplicate in backup.');
   label(row.label);
   const zipped=zip.file(row.path);
   if(!zipped||zipSize(zipped)!==row.size)throw Error('Image missing or mismatched size.');
   total+=row.size;if(total>MAX_TOTAL)throw Error('Backup exceeds 96 MB of images.');
   ids.add(row.id);paths.add(row.path);
   items.push(row);
  }
  const extra=Object.keys(zip.files).filter(path=>!paths.has(path)&&path!=='images/');
  if(extra.length)throw Error('Unrecognized files in photo ZIP.');
  return items;
 }
 async function restore(file){
  requireSecureZip();
  if(!file||file.size<=0||file.size>MAX_ARCHIVE)throw Error('Choose a photo ZIP under 105 MB.');
  status.textContent='Reading photo backup…';
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const list=await parse(zip);
  const old=await readAll(),existing=new Map(old.map(row=>[row.id,row]));
  const prepared=[];let skipped=0;
  // Validate all image hashes before writing anything to IndexedDB.
  for(const row of list){
   const bytes=await zip.file(row.path).async('uint8array');
   if(bytes.length!==row.size||!hasPngSignature(bytes)||await digest(bytes)!==row.sha256)
    throw Error('Image integrity check failed in backup.');
   const previous=existing.get(row.id);
   if(previous){
    if(!(previous.blob instanceof Blob)||previous.blob.size!==bytes.length||
      await digest(await previous.blob.arrayBuffer())!==row.sha256)
     throw Error('Photo ID already exists with different content; no existing photo was replaced.');
    skipped++;continue;
   }
   prepared.push({...row,blob:new Blob([bytes],{type:'image/png'})});
   status.textContent='Checking photo '+(prepared.length+skipped)+' / '+list.length+'…';
  }
  if(!prepared.length){
   status.textContent='All '+skipped+' backup photos are already on this device.';return;
  }
  if(old.length+prepared.length>LIMIT||
   old.reduce((sum,row)=>sum+(row.blob instanceof Blob?row.blob.size:0),0)+
    prepared.reduce((sum,row)=>sum+row.size,0)>MAX_TOTAL)
   throw Error('Not enough photo storage. Delete non-favorites or export older images first.');
  const db=await openDb();
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
    let reason=null;
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(reason||tx.error||Error('Photo restore was cancelled.'));
    tx.onerror=()=>{reason=reason||tx.error||Error('Local database write failed.');};
    // Capacity is rechecked within the write transaction, guarding other tabs.
    const request=store.getAll();
    request.onsuccess=()=>{
     const current=request.result;
     if(current.length+prepared.length>LIMIT||
      current.reduce((sum,row)=>sum+(row.blob instanceof Blob?row.blob.size:0),0)+
       prepared.reduce((sum,row)=>sum+row.size,0)>MAX_TOTAL||
      prepared.some(row=>current.some(item=>item.id===row.id))){
      reason=Error('Photo library changed or is full; no photos imported.');tx.abort();return;
     }
     for(const row of prepared)
      store.add({id:row.id,at:row.at,label:row.label,favorite:row.favorite,blob:row.blob});
    };
   });
  }finally{db.close();}
  status.textContent='Restored '+prepared.length+' photos'+(skipped?' · '+skipped+' already saved':'')+
   '. Your library stays local; reopen Moments to refresh.';
  const refresh=tools.querySelector('button:nth-of-type(1)');
  if(dialog.open&&refresh?.textContent?.includes('Refresh'))refresh.click();
 }
 exportButton.addEventListener('click',async()=>{
  if(busy)return;setBusy(true);
  try{await backup();}catch(error){status.textContent='Backup unavailable: '+(error.message||'unexpected error');}
  finally{setBusy(false);}
 });
 importButton.addEventListener('click',()=>{if(!busy)picker.click();});
 picker.addEventListener('change',async()=>{
  const file=picker.files?.[0];picker.value='';if(!file||busy)return;
  setBusy(true);
  try{await restore(file);}
  catch(error){status.textContent='Restore refused: '+(error.message||'unsupported archive');}
  finally{setBusy(false);}
 });
})();