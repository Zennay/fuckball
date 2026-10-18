'use strict';
// Private HBR2 import desk. Uses ReplayLibrary.save as the only parser and writer.
// No server outcomes, account data, room state or artificial match results.
(function(){
 const view=document.getElementById('gamesView');
 const library=document.getElementById('gamesList');
 if(!view||!library||typeof ReplayLibrary==='undefined')return;
 const MAX_BATCH=10,MAX_FILE=32*1024*1024,MAX_TOTAL=160*1024*1024,MAX_ITEMS=30;
 const make=(tag,text,cls)=>{
  const el=document.createElement(tag);
  if(text!==undefined&&text!==null)el.textContent=String(text);
  if(cls)el.className=cls;return el;
 };
 const button=(text,click)=>{
  const b=make('button',text);b.type='button';b.addEventListener('click',click);return b;
 };
 const section=make('section',null,'replay-import-desk');
 section.setAttribute('aria-label','Import locally recorded HBR2 matches');
 const header=make('div',null,'replay-import-head');
 const intro=make('div',null,'replay-import-intro');
 intro.append(make('span','HBR2 · LOCAL IMPORT','replay-import-label'),
  make('h2','BRING YOUR REPLAYS.'),
  make('p','Drop up to 10 genuine .hbr2 recordings, review the files, then explicitly import into My Games. The existing HBR2 parser and local 30-recording / 160 MB limits always apply.'));
 const usage=make('span','Checking replay storage…','replay-import-usage');
 header.append(intro,usage);
 const zone=make('div',null,'replay-import-zone');
 zone.setAttribute('role','button');zone.setAttribute('tabindex','0');
 zone.setAttribute('aria-label','Drop HBR2 recordings or press Enter to select files');
 const zoneIcon=make('strong','⇪','replay-import-icon');
 zone.append(zoneIcon,make('strong','Drop .hbr2 recordings here'),
  make('span','or press Enter / click to browse · files stay on this device'));
 const choose=make('input');choose.type='file';choose.accept='.hbr2';choose.multiple=true;
 choose.hidden=true;choose.setAttribute('aria-label','Choose HBR2 replay files');
 const previews=make('div',null,'replay-import-previews');
 const status=make('p','No recordings selected.','replay-import-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=make('div',null,'replay-import-actions');
 const importButton=button('↓ Import selected replays',importFiles);
 const clearButton=button('Clear selection',()=>{selected=[];render();});
 importButton.disabled=clearButton.disabled=true;
 actions.append(importButton,clearButton);
 section.append(header,zone,choose,previews,status,actions);
 view.insertBefore(section,library);
 let selected=[],busy=false,usedCount=null,usedBytes=null;
 const fileInfo=file=>file&&typeof file.name==='string'&&
  /\.hbr2$/i.test(file.name)&&file.name.length<=255&&
  Number.isSafeInteger(file.size)&&file.size>0&&file.size<=MAX_FILE;
 const bytes=number=>number>=1048576?(number/1048576).toFixed(1)+' MB':Math.ceil(number/1024)+' KB';
 const totals=arr=>arr.reduce((n,f)=>n+f.size,0);
 function preflight(files){
  if(files.length<1||files.length>MAX_BATCH)throw Error('Choose between 1 and 10 recordings at once.');
  if(files.some(f=>!fileInfo(f)))throw Error('Only nonempty .hbr2 recordings up to 32 MB each are supported.');
  if(totals(files)>MAX_TOTAL)throw Error('Batch exceeds the entire 160 MB local replay limit.');
 }
 async function updateUsage(){
  try{
   const all=await ReplayLibrary.list();
   usedCount=all.length;usedBytes=all.reduce((total,item)=>total+item.size,0);
   usage.textContent=all.length+' / 30 saved · '+bytes(usedBytes)+' / 160 MB';
  }catch{
   usedCount=usedBytes=null;usage.textContent='Storage availability is unknown';
  }
 }
 function render(){
  previews.replaceChildren();
  let error='';
  try{if(selected.length)preflight(selected);}
  catch(e){error=e.message||'These files cannot be imported.';}
  for(const [i,file] of selected.entries()){
   const row=make('div',null,'replay-import-row');
   const detail=make('div',null,'replay-import-file');
   detail.append(make('strong',file.name),make('small',bytes(file.size)));
   const remove=button('Remove',()=>{
    if(busy)return;selected=selected.filter((_,index)=>index!==i);render();
   });
   remove.disabled=busy;
   row.append(detail,remove);previews.append(row);
  }
  if(!selected.length)previews.append(make('p','Selected recordings will appear here before import.','replay-import-empty'));
  let storageWarning='';
  if(selected.length&&usedCount!==null){
   const slots=MAX_ITEMS-usedCount;
   const remaining=MAX_TOTAL-usedBytes;
   if(selected.length>slots||totals(selected)>remaining)
    storageWarning='Insufficient local replay capacity. Free space in Storage Manager before importing.';
  }
  if(error||storageWarning)status.textContent=error||storageWarning;
  else status.textContent=selected.length?
   selected.length+' selected · '+bytes(totals(selected))+
    ' · Not imported until you confirm.':'No recordings selected.';
  importButton.disabled=busy||!selected.length||!!error||!!storageWarning;
  clearButton.disabled=busy||!selected.length;
  choose.disabled=busy;zone.classList.toggle('is-busy',busy);
  zone.setAttribute('aria-disabled',String(busy));
 }
 function stage(files){
  if(busy)return;
  // A fresh drag/drop or picker selection replaces, rather than silently
  // combining with a previously selected batch.
  const incoming=Array.from(files||[]).slice(0,MAX_BATCH+1);
  if(incoming.length>MAX_BATCH){
   selected=[];render();status.textContent='Maximum 10 recordings per batch. Nothing was imported.';
   return;
  }
  selected=incoming;render();
 }
 function browse(){
  if(busy)return;
  choose.click();
 }
 choose.addEventListener('change',event=>{
  stage(event.target.files);event.target.value='';
 });
 zone.addEventListener('click',browse);
 zone.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){
   event.preventDefault();browse();
  }
 });
 let dragDepth=0;
 zone.addEventListener('dragenter',event=>{
  if(busy||!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
  event.preventDefault();dragDepth++;zone.classList.add('dragging');
 });
 zone.addEventListener('dragover',event=>{
  if(busy||!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
  event.preventDefault();event.dataTransfer.dropEffect='copy';
 });
 zone.addEventListener('dragleave',event=>{
  if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
  event.preventDefault();dragDepth=Math.max(0,dragDepth-1);
  if(!dragDepth)zone.classList.remove('dragging');
 });
 zone.addEventListener('drop',event=>{
  if(busy||!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
  event.preventDefault();dragDepth=0;zone.classList.remove('dragging');
  stage(event.dataTransfer.files);
 });
 async function importFiles(){
  if(busy||!selected.length)return;
  const files=[...selected];
  try{preflight(files);}catch(error){
   status.textContent=error.message;return;
  }
  busy=true;render();let completed=0,failed=null;
  try{
   const existing=await ReplayLibrary.list();
   const remaining=MAX_TOTAL-existing.reduce((n,item)=>n+item.size,0);
   if(existing.length+files.length>MAX_ITEMS||totals(files)>remaining)
    throw Error('Not enough space. Remove old recordings in Storage Manager before importing.');
   for(const [index,file] of files.entries()){
    status.textContent='Importing recording '+(index+1)+' of '+files.length+'…';
    try{
     if(!fileInfo(file))throw Error('Invalid file size or .hbr2 extension');
     // Parser, transaction, source limits and sanitization belong to the
     // one canonical device-local recording library.
     await ReplayLibrary.save(new Uint8Array(await file.arrayBuffer()),file.name);
     completed++;
    }catch(e){failed=e.message||'Invalid HBR2 recording';break;}
   }
   if(completed){
    selected=files.slice(completed);
    await renderMyGames();
    window.dispatchEvent(new Event('fuckball:local-replay-library-change'));
   }
   status.textContent=failed?
    completed+' saved, import stopped: '+failed+
     '. Files not yet imported remain selected. Already saved recordings are kept.':
    completed+' genuine local recordings saved to My Games. They are not official server results.';
  }catch(error){
   status.textContent='Import could not start: '+(error.message||'Replay storage unavailable')+'. No files were added.';
  }finally{
   busy=false;await updateUsage();
   const finalText=status.textContent;render();status.textContent=finalText;
  }
 }
 const tab=document.getElementById('tabReplay');
 tab?.addEventListener('click',()=>{if(!busy)updateUsage().then(render);});
 window.addEventListener('focus',()=>{if(!view.hidden&&!busy)updateUsage().then(render);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!view.hidden&&!busy)updateUsage().then(render);});
 window.addEventListener('fuckball:local-replay-library-change',()=>{if(!busy)updateUsage().then(render);});
 updateUsage().then(render);
})();