'use strict';
// Voluntary local data archives. Never read general settings, tokens or account data.
(function(){
 const profile=document.getElementById('careerProfileView');if(!profile)return;
 const make=(tag,text,klass)=>{
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  if(klass)node.className=klass;return node;
 };
 const click=(label,handler)=>{
  const b=make('button',label);b.type='button';b.addEventListener('click',handler);return b;
 };
 const SCOPES=[
  {id:'league',key:'fuckball.local-tournaments.v1',name:'Private leagues',limit:8,chars:128*1024},
  {id:'cup',key:'fuckball.private-knockout-cups.v1',name:'Private knockout cups',limit:8,chars:96*1024},
  {id:'series',key:'fuckball.private-series.v1',name:'Private best-of series',limit:12,chars:128*1024},
  {id:'attendance',key:'fuckball.private-match-attendance.v1',name:'Private match attendance',limit:200,chars:1024*1024},
  {id:'pins',key:'fuckball.pinned-public-rooms.v1',name:'Pinned public room codes',limit:12,chars:4096}
 ];
 const known=new Map(SCOPES.map(scope=>[scope.id,scope]));
 const format='fuckball-local-data-vault',version=1,MAX_FILE=1536*1024;
 const itemValid=(scope,item)=>{
  if(scope.id==='pins')return typeof item==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(item);
  if(scope.id==='attendance')return !!item&&typeof item==='object'&&
   typeof item.key==='string'&&Array.isArray(item.people)&&item.people.length<=24;
  return !!item&&typeof item==='object'&&!Array.isArray(item)&&item.version===1&&
   typeof item.id==='string'&&/^[a-f0-9-]{16,50}$/i.test(item.id)&&
   typeof item.name==='string'&&item.name.length>0&&item.name.length<=60;
 };
 function validate(scope,items){
  if(!Array.isArray(items)||items.length>scope.limit||!items.every(item=>itemValid(scope,item)))
   throw Error(scope.name+': unexpected source data. Use the original editor for recovery.');
  if(JSON.stringify(items).length>scope.chars)
   throw Error(scope.name+': source exceeds the supported size.');
  const ids=items.map(item=>scope.id==='pins'?item:
   scope.id==='attendance'?item.key:item.id);
  if(new Set(ids).size!==ids.length)throw Error(scope.name+': duplicate records.');
  return items;
 }
 function read(scope){
  const raw=localStorage.getItem(scope.key);
  if(raw===null)return [];
  if(raw.length>scope.chars)throw Error(scope.name+': saved data too large.');
  const parsed=JSON.parse(raw);
  return validate(scope,scope.id==='attendance'?
   (parsed?.version===1&&Array.isArray(parsed.entries)?parsed.entries:null):parsed);
 }
 function save(name,payload){
  const json=typeof payload==='string'?payload:JSON.stringify(payload,null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const link=make('a');link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 const panel=make('section',null,'local-vault');
 panel.setAttribute('aria-label','Device-local data vault');
 const title=make('h2','MY LOCAL DATA VAULT.');
 const intro=make('p','Review and archive private competition plans, attendance notes and room bookmarks saved on this device. These are NOT your online account, HBR2 replay files or authenticated match results.');
 const warning=make('p','Exports can reveal private friend names, schedules, notes and bookmarked room codes. Keep downloaded files private. No data is uploaded or deleted by this vault.','local-vault-warning');
 const top=make('div',null,'local-vault-actions');
 const downloadAll=click('↓ Export selected archive',()=>downloadArchive());
 const browse=click('Browse native backup files',()=>{
  try{showArchive(archive().datasets.map(dataset=>({
   scope:known.get(dataset.scope),items:dataset.items
  })));
   message.textContent='Select an individual native-format backup. No local records were altered.';
  }catch(e){message.textContent=e.message||'Private data unavailable.';}
 });
 const refresh=click('↻ Refresh local inventory',()=>renderOwn());
 const upload=make('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;
 upload.setAttribute('aria-label','Import vault archive for inspection');
 const importButton=click('↑ Open archive for extraction',()=>upload.click());
 top.append(downloadAll,browse,importButton,refresh,upload);
 const allScopes=make('div',null,'local-vault-categories');
 const extractSection=make('section',null,'local-vault-extraction');
 extractSection.hidden=true;extractSection.append(make('h3','ARCHIVE CONTENTS (NOT RESTORED)'));
 const extractInfo=make('p');
 const extractList=make('div',null,'local-vault-extract-list');
 extractSection.append(extractInfo,extractList);
 const message=make('p',null,'local-vault-message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 panel.append(title,intro,warning,top,allScopes,extractSection,message);
 profile.insertBefore(panel,profile.querySelector('.career-profile-footnote'));
 const checks=new Map();
 for(const scope of SCOPES){
  const row=make('article',null,'local-vault-category');
  const check=make('input');check.type='checkbox';check.checked=true;
  check.setAttribute('aria-label','Include '+scope.name+' in archive');
  const text=make('div');const label=make('strong',scope.name);
  const detail=make('span');detail.setAttribute('aria-live','polite');
  text.append(label,detail);row.append(check,text);allScopes.append(row);
  checks.set(scope.id,{check,detail});
 }
 function renderOwn(){
  let readable=0,problems=0;
  for(const scope of SCOPES){
   const {check,detail}=checks.get(scope.id);
   try{
    const items=read(scope);
    detail.textContent=items.length+' record'+(items.length===1?'':'s')+
     ' · up to '+Math.round(scope.chars/1024)+' KiB per category';
    check.disabled=false;readable++;
   }catch{
    detail.textContent='Unreadable private data · excluded from archive, not overwritten.';
    check.checked=false;check.disabled=true;problems++;
   }
  }
  downloadAll.disabled=browse.disabled=readable===0;
  message.textContent=(problems?problems+' category read failure(s). ':'')+
   'Only the five explicitly listed browser keys are inspected. Your account credentials and IndexedDB replays are never included.';
 }
 function archive(){
  const selected=SCOPES.filter(scope=>checks.get(scope.id).check.checked);
  if(!selected.length)throw Error('Choose at least one local data category.');
  const datasets=selected.map(scope=>({scope:scope.id,items:read(scope)}));
  const packed={format,version,createdAt:new Date().toISOString(),datasets,
   note:'Private, user-entered device data only. Extraction never restores data automatically.'};
  if(JSON.stringify(packed).length>MAX_FILE)throw Error('Archive exceeds 1.5 MiB. Export fewer categories.');
  return packed;
 }
 function downloadArchive(){
  try{
   const packed=archive();
   if(!confirm('Download '+packed.datasets.length+
    ' selected private data categories? The JSON may include friend names, locations and notes.'))return;
   save('fuckball-private-data-vault-'+new Date().toISOString().slice(0,10)+'.json',packed);
   message.textContent='Private device archive downloaded. It is not an online-account export or a one-click restore.';
  }catch(e){message.textContent=e.message||'Archive unavailable.';}
 }
 function unpack(value){
  if(!value||value.format!==format||value.version!==version||
    !Array.isArray(value.datasets)||value.datasets.length>SCOPES.length)
   throw Error('Unsupported private data archive.');
  const used=new Set(),datasets=[];
  for(const record of value.datasets){
   const scope=known.get(record?.scope);
   if(!scope||used.has(scope.id))throw Error('Unknown or repeated archive category.');
   used.add(scope.id);validate(scope,record.items);
   datasets.push({scope,items:record.items});
  }
  return datasets;
 }
 function exportItem(scope,item){
  switch(scope.id){
  case 'league':return {...item,exportedAt:Date.now(),
   notice:'Unofficial manual friendly results; no server verification'};
  case 'cup':return {...item,note:'Manual, unverified friendly results'};
  default:return item;
  }
 }
 function showArchive(datasets){
  extractList.replaceChildren();
  extractInfo.textContent='Preview only: '+datasets.length+
   ' categories. Nothing has been written to browser storage. Download a native-format file below, then restore it through its original private editor.';
  for(const {scope,items}of datasets){
   const group=make('div',null,'local-vault-extract-group');
   group.append(make('strong',scope.name+' · '+items.length+' records'));
   const actions=make('div',null,'local-vault-extract-actions');
   if(scope.id==='league'||scope.id==='cup'){
    for(const [i,item] of items.entries()){
     const name=(typeof item.name==='string'?item.name:'item')
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,32)||'item';
     actions.append(click('↓ '+(item.name||'Private item'),()=>{
      save('fuckball-'+scope.id+'-'+name+'-'+(i+1)+'.json',exportItem(scope,item));
      message.textContent='Individual '+scope.name+' backup downloaded. Restore only through the matching original editor.';
     }));
    }
   }else if(scope.id==='series'){
    actions.append(click('↓ Best-of series backup',()=>save('fuckball-private-series.json',
     {format:'fuckball-private-series',version:1,exportedAt:Date.now(),series:items})));
   }else if(scope.id==='attendance'){
    actions.append(click('↓ Attendance backup',()=>save('fuckball-private-attendance.json',
     {version:1,entries:items})));
   }else if(scope.id==='pins'){
    actions.append(click('↓ Public bookmarks backup',()=>save('fuckball-public-room-bookmarks.json',
     {format:'fuckball-public-room-bookmarks',version:1,exportedAt:new Date().toISOString(),rooms:items})));
   }
   if(!actions.children.length)actions.append(make('p','No records in this category.'));
   group.append(actions);extractList.append(group);
  }
  extractSection.hidden=false;
 }
 upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];upload.value='';
  if(!file)return;
  if(file.size>MAX_FILE||file.size===0){
   message.textContent='Choose a private vault JSON archive up to 1.5 MiB.';return;
  }
  try{
   const datasets=unpack(JSON.parse(await file.text()));
   showArchive(datasets);
   message.textContent='Private archive opened in memory only; choose which original backup files to extract.';
  }catch(e){
   extractSection.hidden=true;extractList.replaceChildren();
   message.textContent='Archive refused without writing browser data: '+(e.message||'invalid file');
  }
 });
 window.addEventListener('storage',event=>{
  if(SCOPES.some(scope=>scope.key===event.key)||event.key===null)renderOwn();
 });
 document.querySelector('.career-profile-open')?.addEventListener('click',renderOwn);
 renderOwn();
})();
