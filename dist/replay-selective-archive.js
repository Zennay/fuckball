'use strict';
// Explicit selective export of authentic local HBR2 files. The ZIP format is
// compatible with the existing My Games Restore ZIP; there is no upload.
(function(){
 const view=document.getElementById('gamesView'),list=view?.querySelector('#gamesList');
 if(!view||!list||typeof ReplayLibrary==='undefined')return;
 const MAX_CHOSEN=10,MAX_TOTAL=80*1024*1024,MAX_FILE=32*1024*1024;
 const MAX_ZIP=96*1024*1024,MAX_MANIFEST=262144;
 const node=(tag,text,cls)=>{
  const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;return e;
 };
 const button=(label,handler)=>{
  const b=node('button',label);b.type='button';b.addEventListener('click',handler);return b;
 };
 const panel=node('section',null,'replay-selective-archive');
 panel.setAttribute('aria-label','Export selected local HBR2 recordings');
 const details=node('details');
 const summary=node('summary','▣ EXPORT SELECTED REPLAYS · OPEN');
 const content=node('div',null,'replay-selective-body');
 const intro=node('p','Choose the recordings you want to back up or transfer. This creates an offline ZIP compatible with My Games → Restore ZIP. HBR2 files can contain real player names, so inspect the archive before sharing it with anyone.');
 const toolbar=node('div',null,'replay-selective-tools');
 const find=node('input');find.type='search';find.maxLength=80;find.placeholder='Find replay…';
 find.setAttribute('aria-label','Filter your local replays for selective export');
 const selectVisible=button('Select visible',()=>{
  for(const item of visible())if(selected.size<MAX_CHOSEN)selected.add(item.id);
  render();
 });
 const clear=button('Clear selection',()=>{selected.clear();render();});
 const refresh=button('↻ Refresh',refreshRecords);
 toolbar.append(find,selectVisible,clear,refresh);
 const recordsBox=node('div',null,'replay-selective-records');
 const selectionInfo=node('p','No recordings selected.','replay-selective-selection');
 const controls=node('div',null,'replay-selective-controls');
 const download=button('↓ Export selected ZIP',createArchive);
 const status=node('p','Nothing is uploaded. Exports happen only when you click the download button.','replay-selective-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 controls.append(download);
 content.append(intro,toolbar,recordsBox,selectionInfo,controls,status);
 details.append(summary,content);panel.append(details);
 view.insertBefore(panel,list);
 let files=[],selected=new Set(),busy=false,version=0;
 const nameOkay=x=>typeof x==='string'&&x.trim().length>0&&x.length<=100;
 const itemOkay=x=>x&&/^[a-f0-9]{32}$/.test(x.id||'')&&nameOkay(x.name)&&
  Number.isSafeInteger(x.createdAt)&&x.createdAt>0&&x.createdAt<=Date.now()+86400000&&
  Number.isSafeInteger(x.size)&&x.size>0&&x.size<=MAX_FILE;
 const bytes=x=>x>=1048576?(x/1048576).toFixed(1)+' MB':Math.ceil(x/1024)+' KB';
 const visible=()=>files.filter(x=>!find.value.trim()||
  x.name.toLocaleLowerCase().includes(find.value.trim().toLocaleLowerCase()));
 const chosen=()=>files.filter(x=>selected.has(x.id));
 function render(){
  recordsBox.replaceChildren();
  const valid=new Set(files.map(x=>x.id));
  for(const id of selected)if(!valid.has(id))selected.delete(id);
  const filtered=visible();
  selectVisible.disabled=busy||selected.size>=MAX_CHOSEN||!filtered.some(x=>!selected.has(x.id));
  clear.disabled=busy||selected.size===0;
  find.disabled=refresh.disabled=busy;
  for(const item of filtered){
   const row=node('label',null,'replay-selective-row');
   const check=node('input');check.type='checkbox';check.checked=selected.has(item.id);
   check.disabled=busy||(!check.checked&&selected.size>=MAX_CHOSEN);
   check.setAttribute('aria-label','Include '+item.name+' in the private ZIP');
   check.addEventListener('change',()=>{
    if(check.checked&&selected.size<MAX_CHOSEN)selected.add(item.id);
    else selected.delete(item.id);
    render();
   });
   const detail=node('span',null,'replay-selective-file');
   detail.append(node('strong',item.name),
    node('small',bytes(item.size)+' · '+(item.favorite===true?'★ favorite':'local replay')));
   row.append(check,detail);recordsBox.append(row);
  }
  if(!filtered.length)recordsBox.append(node('p',files.length?'No recordings match your search.':'Your local replay library is empty.'));
  const n=chosen().reduce((sum,x)=>sum+x.size,0);
  selectionInfo.textContent=selected.size+' selected (max '+MAX_CHOSEN+') · '+bytes(n)+' / 80 MB private export limit';
  download.disabled=busy||!selected.size||n>MAX_TOTAL;
 }
 async function refreshRecords(){
  if(busy)return;
  const stamp=++version;
  status.textContent='Reading locally saved recordings…';
  try{
   const list=await ReplayLibrary.list();
   if(stamp!==version)return;
   files=list.filter(itemOkay).slice(0,30);
   render();status.textContent=files.length?
    'Choose files, then export when ready. Only this device is read.':
    'Save or import recordings in My Games to create a selective archive.';
  }catch(error){
   if(stamp!==version)return;
   files=[];selected.clear();render();
   status.textContent='Replay storage cannot be read: '+(error.message||'Storage unavailable');
  }
 }
 const sha256=async value=>{
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',value));
  return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
 };
 function safeName(value){
  if(!nameOkay(value))throw Error('An existing recording has an invalid filename.');
  let name=value.trim().replace(/[\\/< >:"|?*\x00-\x1f]/g,'_');
  if(!/\.hbr2$/i.test(name))name=name.slice(0,95)+'.hbr2';
  return name.slice(0,100);
 }
 function saveDownload(blob){
  const url=URL.createObjectURL(blob);
  const a=node('a');a.href=url;
  a.download='fuckball-selected-replays-'+new Date().toISOString().slice(0,10)+'.zip';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function createArchive(){
  if(busy||!selected.size)return;
  if(typeof JSZip!=='function'||!globalThis.crypto?.subtle)
   return void(status.textContent='ZIP export needs a secure browser context (HTTPS or localhost).');
  const items=chosen();
  const sum=items.reduce((n,x)=>n+x.size,0);
  if(!items.length||items.length>MAX_CHOSEN||sum>MAX_TOTAL)
   return void(status.textContent='Selection exceeds the safe export limits.');
  if(!confirm('Export '+items.length+' local HBR2 recording(s)? They may contain player names and private match information. Only share the ZIP with people you trust.'))
   return void(status.textContent='Export cancelled. Nothing was downloaded or uploaded.');
  busy=true;render();
  try{
   const archive=new JSZip(),entries=[];
   let consumed=0;
   for(const [index,item] of items.entries()){
    const latest=await ReplayLibrary.get(item.id);
    if(!itemOkay(latest.item)||latest.bytes.length!==latest.item.size||latest.bytes.length>MAX_FILE)
     throw Error('A selected recording changed or became invalid.');
    const bytesData=latest.bytes;
    consumed+=bytesData.length;
    if(consumed>MAX_TOTAL)throw Error('Selected recording data exceeds 80 MB.');
    const path='replays/'+item.id+'.hbr2';
    archive.file(path,bytesData,{binary:true,compression:'STORE',createFolders:false});
    entries.push({id:item.id,path,name:safeName(latest.item.name),
     createdAt:latest.item.createdAt,size:bytesData.length,
     favorite:latest.item.favorite===true,
     bookmarks:ReplayLibrary.normalizeBookmarks(latest.item.bookmarks,latest.item.frames),
     tags:ReplayLibrary.normalizeTags(latest.item.tags),
     review:ReplayLibrary.normalizeReview(latest.item.review),
     notes:ReplayLibrary.normalizeNotes(latest.item.notes,latest.item.frames),
     sha256:await sha256(bytesData)});
    status.textContent='Preparing private recording '+(index+1)+' / '+items.length+'…';
   }
   const manifest=JSON.stringify({format:'fuckball-local-replays',version:1,entries});
   if(manifest.length>MAX_MANIFEST)throw Error('Replay archive index is too large.');
   archive.file('manifest.json',manifest,{compression:'STORE'});
   const blob=await archive.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
   if(blob.size>MAX_ZIP)throw Error('ZIP is too large to export.');
   saveDownload(blob);
   status.textContent='Saved '+items.length+' selected replays as a compatible private ZIP. No upload.';
  }catch(error){
   status.textContent='Export unavailable: '+(error.message||'Unknown archive error')+'. No local replay was changed.';
  }finally{
   busy=false;const summary=status.textContent;render();status.textContent=summary;
  }
 }
 find.addEventListener('input',render);
 details.addEventListener('toggle',()=>{if(details.open)refreshRecords();});
 document.getElementById('tabReplay')?.addEventListener('click',()=>{if(details.open)refreshRecords();});
 window.addEventListener('focus',()=>{if(details.open&&!view.hidden)refreshRecords();});
 window.addEventListener('fuckball:local-replay-library-change',()=>{if(details.open)refreshRecords();});
 render();
})();