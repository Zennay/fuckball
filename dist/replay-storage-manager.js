'use strict';
// Local HBR2 storage management. Explicit double-confirmed deletion only;
// never touches account/server match results, ratings, browser cache or backups.
(function(){
 const view=document.getElementById('gamesView'),list=document.getElementById('gamesList');
 if(!view||!list||typeof ReplayLibrary==='undefined')return;
 const LIMIT_BYTES=160*1024*1024,MAX_ITEMS=30,MAX_FILE=32*1024*1024;
 const panel=document.createElement('section');panel.className='replay-storage-manager';
 panel.setAttribute('aria-label','Manage local HBR2 replay storage');
 const header=document.createElement('div');header.className='replay-storage-head';
 const intro=document.createElement('div');
 const kicker=document.createElement('span');kicker.className='eyebrow';kicker.textContent='MY GAMES · DEVICE STORAGE';
 const title=document.createElement('h2');title.textContent='STORAGE MANAGER.';
 const note=document.createElement('p');
 note.textContent='Review replay storage, protect favorites and safely remove multiple recordings. This changes only HBR2 files stored in this browser, not online account results.';
 intro.append(kicker,title,note);
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh storage';
 header.append(intro,refresh);
 const usage=document.createElement('div');usage.className='replay-storage-usage';
 const meterText=document.createElement('strong');meterText.className='replay-storage-total';
 const meter=document.createElement('progress');meter.max=LIMIT_BYTES;meter.value=0;
 meter.setAttribute('aria-label','Local replay storage usage');
 const slots=document.createElement('span');slots.className='replay-storage-slots';
 usage.append(meterText,meter,slots);
 const tools=document.createElement('div');tools.className='replay-storage-tools';
 const minimum=document.createElement('label');minimum.textContent='Show';
 const filter=document.createElement('select');filter.setAttribute('aria-label','Filter recordings by file size');
 for(const [value,label] of [['all','Every replay'],['5','Over 5 MB'],['10','Over 10 MB'],['20','Over 20 MB']])
  filter.add(new Option(label,value));
 minimum.append(filter);
 const protectLabel=document.createElement('label');protectLabel.className='replay-storage-protect';
 const protect=document.createElement('input');protect.type='checkbox';protect.checked=true;
 protectLabel.append(protect,document.createTextNode(' Protect favorites'));
 const selectAll=document.createElement('button');selectAll.type='button';selectAll.textContent='Select eligible visible';
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear selection';
 tools.append(minimum,protectLabel,selectAll,clear);
 const status=document.createElement('p');status.className='replay-storage-status';
 status.setAttribute('aria-live','polite');status.setAttribute('role','status');
 const rows=document.createElement('div');rows.className='replay-storage-rows';
 const actions=document.createElement('div');actions.className='replay-storage-actions';
 const selection=document.createElement('span');selection.textContent='Nothing selected';
 const remove=document.createElement('button');remove.type='button';remove.className='replay-storage-delete';
 remove.textContent='Delete selected';remove.disabled=true;
 const caution=document.createElement('p');caution.className='replay-storage-caution';
 caution.textContent='Deleting local HBR2 files is permanent. Use Backup all · ZIP in My Games first to keep copies of important recordings.';
 actions.append(selection,remove);
 panel.append(header,usage,tools,status,rows,actions,caution);
 view.insertBefore(panel,list);
 const bytesLabel=bytes=>bytes<1024*1024?(bytes/1024).toFixed(0)+' KB':(bytes/1048576).toFixed(1)+' MB';
 const isValid=item=>item&&typeof item.id==='string'&&/^[a-f0-9]{32}$/.test(item.id)&&
  Number.isSafeInteger(item.size)&&item.size>=1&&item.size<=MAX_FILE&&
  typeof item.name==='string'&&item.name.length<=100;
 let files=[],selected=new Set(),busy=false,generation=0;
 const eligible=item=>!protect.checked||item.favorite!==true;
 const visible=()=>files.filter(item=>filter.value==='all'||item.size>Number(filter.value)*1048576);
 function selectedItems(){
  return files.filter(item=>selected.has(item.id)&&eligible(item));
 }
 function updateActions(){
  const actual=selectedItems();
  const bytes=actual.reduce((sum,item)=>sum+item.size,0);
  selection.textContent=actual.length?
   actual.length+' selected · '+bytesLabel(bytes)+' to remove':
   'Nothing selected';
  remove.disabled=busy||!actual.length;
  selectAll.disabled=busy||!visible().some(eligible);
  clear.disabled=busy||!selected.size;
 }
 function render(){
  const used=files.reduce((sum,item)=>sum+item.size,0);
  const display=Math.min(used,LIMIT_BYTES);
  meter.value=display;
  meterText.textContent=bytesLabel(used)+' / 160 MB used';
  slots.textContent=files.length+' / '+MAX_ITEMS+' replay slots used · '+bytesLabel(Math.max(0,LIMIT_BYTES-used))+' remaining';
  rows.replaceChildren();
  const filtered=visible().slice().sort((a,b)=>b.size-a.size||b.createdAt-a.createdAt);
  if(!filtered.length){
   const empty=document.createElement('p');
   empty.textContent=files.length?'No recordings match this size filter.':'No local recordings stored yet.';
   rows.append(empty);
  }
  for(const item of filtered){
   const row=document.createElement('label');row.className='replay-storage-row';
   const checkbox=document.createElement('input');checkbox.type='checkbox';
   checkbox.checked=selected.has(item.id)&&eligible(item);
   checkbox.disabled=busy||!eligible(item);
   checkbox.setAttribute('aria-label','Select '+item.name+' for local deletion');
   checkbox.addEventListener('change',()=>{
    if(checkbox.checked&&eligible(item))selected.add(item.id);
    else selected.delete(item.id);
    updateActions();
   });
   const info=document.createElement('span');info.className='replay-storage-row-info';
   const name=document.createElement('strong');name.textContent=item.name;
   const details=document.createElement('small');
   details.textContent=bytesLabel(item.size)+' · '+new Date(item.createdAt).toLocaleDateString()+
    (item.favorite===true?' · ★ Favorite':'')+
    (item.favorite===true&&protect.checked?' · Protected':'');
   info.append(name,details);
   row.append(checkbox,info);rows.append(row);
  }
  updateActions();
 }
 async function load(message){
  const stamp=++generation;refresh.disabled=true;
  status.textContent=message||'Reading saved replay sizes…';
  try{
   const items=await ReplayLibrary.list();
   if(stamp!==generation)return;
   if(!Array.isArray(items)||items.length>MAX_ITEMS||!items.every(isValid))
    throw Error('Local replay index is inconsistent. No files were changed.');
   files=items;
   const known=new Set(files.map(item=>item.id));
   selected=new Set([...selected].filter(id=>known.has(id)));
   if(protect.checked)for(const item of files)if(!eligible(item))selected.delete(item.id);
   render();
   status.textContent=files.length?
    'Only recordings saved on this device are shown. Favorite protection is '+(protect.checked?'on.':'off.') :
    'My Games is empty. You can import an HBR2 replay above.';
  }catch(error){
   if(stamp===generation){
    files=[];selected.clear();rows.replaceChildren();meter.value=0;meterText.textContent='Unavailable';
    slots.textContent='';updateActions();
    status.textContent=error?.message||'Cannot access local recording metadata.';
   }
  }finally{if(stamp===generation)refresh.disabled=false;}
 }
 async function erase(){
  if(busy)return;
  const chosen=selectedItems(),count=chosen.length;
  if(!count)return;
  const total=chosen.reduce((sum,item)=>sum+item.size,0);
  const favoriteCount=chosen.filter(item=>item.favorite===true).length;
  if(!confirm('Delete '+count+' local HBR2 recording(s), freeing approximately '+bytesLabel(total)+'?'+
    (favoriteCount?' Includes '+favoriteCount+' favorite(s).':'')+
    ' This does not erase account history.'))return;
  if(!confirm('Final confirmation: permanently delete these '+count+
    ' recordings from THIS BROWSER? Local replay bookmarks and goal markers for them will also be lost.'))return;
  busy=true;refresh.disabled=true;remove.disabled=true;selectAll.disabled=true;clear.disabled=true;
  let deleted=0,failed=0,finalNotice='';
  try{
   // Re-read just before deleting: never remove an id absent from this fresh index.
   const fresh=await ReplayLibrary.list();
   const byId=new Map(fresh.map(item=>[item.id,item]));
   for(const item of chosen){
    const latest=byId.get(item.id);
    if(!latest||!isValid(latest)||latest.size!==item.size||
      (protect.checked&&latest.favorite===true)){failed++;continue;}
    try{
     await ReplayLibrary.remove(item.id);deleted++;selected.delete(item.id);
     status.textContent='Removing selected local replays: '+deleted+' / '+count+'…';
    }catch(error){failed++;}
   }
   await renderMyGames();
   finalNotice='Deleted '+deleted+' local replay(s)'+
    (failed?' · '+failed+' were not deleted (refresh and review).':' · online results unaffected.');
  }catch(error){
   finalNotice='No more recordings were deleted: '+(error?.message||'storage error');
  }finally{busy=false;refresh.disabled=false;await load();if(finalNotice)status.textContent=finalNotice;}
 }
 filter.onchange=render;
 protect.onchange=()=>{
  if(protect.checked)for(const item of files)if(item.favorite===true)selected.delete(item.id);
  render();
 };
 selectAll.onclick=()=>{for(const item of visible())if(eligible(item))selected.add(item.id);render();};
 clear.onclick=()=>{selected.clear();render();};
 refresh.onclick=()=>load();
 remove.onclick=erase;
 const previousRenderMyGames=renderMyGames;
 renderMyGames=async function(...args){
  const value=await previousRenderMyGames(...args);
  if(!view.hidden&&!busy)load();
  return value;
 };
})();
