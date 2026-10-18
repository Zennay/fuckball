'use strict';
// Private replay collections: curated sets of local HBR2 IDs, not server games.
(function(){
 const games=document.getElementById('gamesView');
 if(!games||typeof ReplayLibrary==='undefined')return;
 const KEY='fuckball.replay-collections.v1',MAX_COLLECTIONS=12,MAX_REPLAYS=30,MAX_CHARS=60*1024;
 const make=(tag,content,cls)=>{
  const e=document.createElement(tag);
  if(content!==undefined&&content!==null)e.textContent=String(content);
  if(cls)e.className=cls;
  return e;
 };
 const button=(title,action,cls)=>{
  const e=make('button',title,cls);e.type='button';e.addEventListener('click',action);return e;
 };
 const idValid=id=>typeof id==='string'&&/^[0-9a-f]{32}$/.test(id);
 const titleValid=s=>typeof s==='string'&&s.trim()===s&&s.length>0&&s.length<=60&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(s);
 const descriptionValid=s=>typeof s==='string'&&s.trim()===s&&s.length<=280&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(s);
 function check(entry){
  if(!entry||!idValid(entry.id)||!titleValid(entry.title)||!descriptionValid(entry.description)||
   !Number.isSafeInteger(entry.updatedAt)||entry.updatedAt<=0||
   entry.updatedAt>Date.now()+86400000||!Array.isArray(entry.replays)||
   entry.replays.length>MAX_REPLAYS||entry.replays.some(x=>!idValid(x))||
   new Set(entry.replays).size!==entry.replays.length)
   throw Error('Invalid replay collection.');
  return {version:1,id:entry.id,title:entry.title,description:entry.description,
   updatedAt:entry.updatedAt,replays:[...entry.replays]};
 }
 function checkAll(items){
  if(!Array.isArray(items)||items.length>MAX_COLLECTIONS)throw Error('Collection limit exceeded.');
  const collections=items.map(check);
  if(new Set(collections.map(x=>x.id)).size!==collections.length)
   throw Error('Duplicate collection identity.');
  return collections;
 }
 const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),
  n=>n.toString(16).padStart(2,'0')).join('');
 const validMeta=i=>i&&idValid(i.id)&&typeof i.name==='string'&&i.name.length<=100&&
  Number.isSafeInteger(i.size)&&i.size>0&&i.size<=32*1048576&&
  Number.isSafeInteger(i.frames)&&i.frames>=0&&i.frames<=86400000;
 const heading=make('header',undefined,'replay-collections-head');
 const intro=make('div');
 intro.append(make('span','MY GAMES · PRIVATE REPLAY ORGANISER','replay-collections-eyebrow'),
  make('h2','YOUR COLLECTIONS.'),make('p','Keep permanent folders for best goals, opponent studies or your own tactics. Curate real saved HBR2 recordings without copying files or changing online match records.'));
 const reload=button('↻ Refresh',()=>refresh());
 heading.append(intro,reload);
 const panel=make('section',undefined,'replay-collections');
 panel.setAttribute('aria-label','Local replay collections');
 const tools=make('div',undefined,'replay-collections-tools');
 const picker=make('select');picker.setAttribute('aria-label','Select a replay collection');
 const create=button('＋ New collection',newCollection);
 const rename=button('Edit name / notes',editCollection);
 const remove=button('Delete collection',deleteCollection);
 const exportButton=button('↓ Collection JSON',exportCollection);
 const studyButton=button('↓ Study guide',exportStudyGuide);
 const importButton=button('↑ Restore collection',()=>fileInput.click());
 const fileInput=make('input');fileInput.type='file';
 fileInput.accept='.json,application/json';fileInput.hidden=true;
 tools.append(picker,create,rename,remove,exportButton,studyButton,importButton,fileInput);
 const detail=make('div',undefined,'replay-collections-detail');
 const itemsList=make('ol',undefined,'replay-collections-items');
 const available=make('div',undefined,'replay-collections-add');
 const search=make('input');search.type='search';search.maxLength=100;
 search.placeholder='Filter your local HBR2 recordings';
 search.setAttribute('aria-label','Find a saved recording for the collection');
 const selector=make('select');selector.setAttribute('aria-label','Saved replay to add');
 const add=button('＋ Add replay',addReplay);
 available.append(search,selector,add);
 const feedback=make('p',undefined,'replay-collections-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 panel.append(heading,tools,detail,itemsList,available,feedback);
 const anchor=games.querySelector('.replay-review-queue')||games.querySelector('.replay-study-dashboard')||
  games.querySelector('.replay-compare-studio')||document.getElementById('gamesList');
 if(anchor)games.insertBefore(panel,anchor);else games.append(panel);
 let collectionList=[],active='',snapshot=null,library=[],busy=false,serial=0,message='';
 const current=()=>collectionList.find(x=>x.id===active)||null;
 function read(){
  const raw=localStorage.getItem(KEY);
  if(raw===null)return {data:[],raw:null};
  if(raw.length>MAX_CHARS)throw Error('Stored collections exceed the local limit.');
  return {data:checkAll(JSON.parse(raw)),raw};
 }
 try{const value=read();collectionList=value.data;snapshot=value.raw;}
 catch{message='Saved collection list was invalid. Download any existing backups before editing.';}
 function persist(list){
  const validated=checkAll(list),text=JSON.stringify(validated);
  if(text.length>MAX_CHARS)throw Error('Collection storage limit reached.');
  if(localStorage.getItem(KEY)!==snapshot)
   throw Error('Collections changed in another tab. Refresh before saving.');
  localStorage.setItem(KEY,text);collectionList=validated;snapshot=text;
 }
 function notice(text){message=text;feedback.textContent=text;}
 function modify(entry,patch,text){
  try{
   const updated=check({...entry,...patch,updatedAt:Date.now()});
   persist(collectionList.map(x=>x.id===entry.id?updated:x));
   notice(text);render();
  }catch(err){notice(err.message||'Cannot save collection.');}
 }
 function newCollection(){
  if(collectionList.length>=MAX_COLLECTIONS)return notice('Maximum 12 private replay collections.');
  const title=window.prompt('New replay collection name (1–60 characters):','Best goals');
  if(title===null)return;
  const clean=title.trim();
  if(!titleValid(clean))return notice('Use 1–60 printable characters for a collection name.');
  const fresh=check({id:uid(),title:clean,description:'',updatedAt:Date.now(),replays:[]});
  try{persist([...collectionList,fresh]);active=fresh.id;notice('Private collection created.');render();}
  catch(err){notice(err.message||'Unable to create private collection.');}
 }
 function editCollection(){
  const c=current();if(!c)return;
  const name=window.prompt('Collection name:',c.title);if(name===null)return;
  const description=window.prompt('Private collection notes (max 280 characters):',c.description);
  if(description===null)return;
  if(!titleValid(name.trim())||!descriptionValid(description.trim()))
   return notice('Use a printable name and notes of up to 280 characters.');
  modify(c,{title:name.trim(),description:description.trim()},'Collection name and notes saved locally.');
 }
 function deleteCollection(){
  const c=current();if(!c||!window.confirm('Delete collection "'+c.title+'"? Your original HBR2 recordings remain untouched.'))return;
  try{persist(collectionList.filter(x=>x.id!==c.id));active='';notice('Collection deleted. Recordings were preserved.');render();}
  catch(err){notice(err.message||'Cannot delete collection.');}
 }
 function addReplay(){
  const c=current(),id=selector.value;
  if(!c||!idValid(id)||!library.some(x=>x.id===id))return;
  if(c.replays.includes(id))return notice('Recording is already in this collection.');
  if(c.replays.length>=MAX_REPLAYS)return notice('Maximum 30 recordings per collection.');
  modify(c,{replays:[...c.replays,id]},'Recording added to this private collection.');
 }
 function shift(index,delta){
  const c=current();if(!c)return;
  const to=index+delta;if(to<0||to>=c.replays.length)return;
  const next=[...c.replays];[next[index],next[to]]=[next[to],next[index]];
  modify(c,{replays:next},'Collection order updated.');
 }
 const byId=id=>library.find(x=>x.id===id);
 let opening=false;
 async function openRecording(id){
  const item=byId(id);
  if(!item||opening)return;
  opening=true;notice('Opening locally saved HBR2 recording…');
  try{
   const saved=await ReplayLibrary.get(id);
   if(saved.item.id!==id||saved.bytes.length<=0||saved.bytes.length>32*1048576)
    throw Error('The local replay is no longer available.');
   loadReplay(saved.bytes,saved.item.name);
   activeLocalReplayId=id;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   notice('Opened '+saved.item.name+' from private collection. Replay remains stored in My Games.');
  }catch(err){notice('Replay could not be opened: '+(err.message||'Local recording unavailable'));}
  finally{opening=false;}
 }
 function render(){
  if(!current()&&collectionList.length)active=collectionList[0].id;
  const c=current();
  picker.replaceChildren(new Option('Choose a collection…',''));
  for(const x of collectionList)picker.add(new Option(x.title,x.id));
  picker.value=c?.id||'';
  for(const b of [rename,remove,exportButton,studyButton])b.disabled=!c;
  detail.replaceChildren();itemsList.replaceChildren();
  if(!c){
   detail.append(make('p','Create a private collection to organise saved HBR2 recordings.'));
   add.disabled=selector.disabled=search.disabled=true;selector.replaceChildren();
   notice(message||'No replay collections saved on this device.');
   return;
  }
  const info=make('div',undefined,'replay-collections-summary');
  info.append(make('strong',c.title),make('span',c.replays.length+' / '+MAX_REPLAYS+' recordings'));
  if(c.description)info.append(make('p',c.description));
  detail.append(info);
  for(const [index,id] of c.replays.entries()){
   const item=byId(id);
   const row=make('li',undefined,'replay-collections-item');
   const left=make('div',undefined,'replay-collections-name');
   left.append(make('strong',item?.name||'Missing local recording'),
    make('small',item?(Math.floor(item.frames/60)+' sec · '+(item.favorite?'★ favorite':'saved locally')):
      'The HBR2 file is not on this device. Remove its shortcut.'));
   const actions=make('div',undefined,'replay-collections-item-actions');
   const up=button('↑',()=>shift(index,-1));up.disabled=index===0;up.title='Move earlier';
   const down=button('↓',()=>shift(index,1));down.disabled=index===c.replays.length-1;down.title='Move later';
   const watch=button('▶ Open',()=>openRecording(id));watch.disabled=!item||opening;
   const del=button('Remove',()=>modify(c,{replays:c.replays.filter(x=>x!==id)},
    'Only the collection shortcut was removed; the HBR2 recording is unchanged.'));
   actions.append(up,down,watch,del);row.append(left,actions);itemsList.append(row);
  }
  if(!c.replays.length)itemsList.append(make('li','No recordings in this collection yet.','replay-collections-empty'));
  const filtered=library.filter(x=>!c.replays.includes(x.id)&&
   x.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
  selector.replaceChildren(new Option(filtered.length?'Choose a recording…':'No matching recordings',''));
  for(const x of filtered)selector.add(new Option(x.name,x.id));
  add.disabled=selector.disabled=!filtered.length||c.replays.length>=MAX_REPLAYS;
  search.disabled=false;
  feedback.textContent=message||'Private collection only · actual recordings remain in My Games.';
 }
 async function refresh(){
  const token=++serial;reload.disabled=true;
  try{
   const value=read();if(token!==serial)return;
   collectionList=value.data;snapshot=value.raw;
   library=(await ReplayLibrary.list()).filter(validMeta).slice(0,30);
   if(token!==serial)return;
   notice('Refreshed '+library.length+' local recordings and '+collectionList.length+' private collections.');
   render();
  }catch(err){notice('Cannot refresh saved replay library: '+(err.message||'Storage error'));render();}
  finally{reload.disabled=false;}
 }
 picker.onchange=()=>{active=picker.value;message='';render();};
 search.oninput=render;
 const filename=c=>'fuckball-collection-'+c.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,30)+'.json';
 async function exportStudyGuide(){
  const c=current();if(!c||busy)return;
  busy=true;studyButton.disabled=true;
  try{
   const heading=s=>String(s).replace(/[\\`*_{|}\[\]<>#]/g,'\\ function exportCollection(){').replace(/\r?\n/g,' ');
   const minutes=frames=>{
    const seconds=Math.floor(frames/60);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
   };
   const rows=['# '+heading(c.title),'','Private replay study guide · device-local, user-owned HBR2 metadata, not verified match history.','',
    c.description?heading(c.description):'','',c.replays.length+' recording shortcuts',''];
   const libraryIds=new Map(library.map(x=>[x.id,x]));
   for(const [index,id]of c.replays.entries()){
    const item=libraryIds.get(id);
    rows.push('## '+(index+1)+'. '+heading(item?.name||'Unavailable local HBR2'),'');
    if(!item){rows.push('Recording not available on this device.','');continue;}
    rows.push('Duration: '+minutes(item.frames)+' · Local recording ID: '+id,'');
    try{
     const goals=Array.isArray(item.goals)?item.goals.filter(x=>Number.isSafeInteger(x?.frameNo)&&
      x.frameNo>=0&&x.frameNo<=item.frames&&[1,2].includes(x.teamId)).slice(0,128):[];
     if(goals.length){rows.push('### Recorded goal markers','');
      for(const g of goals)rows.push('- '+minutes(g.frameNo)+' · '+(g.teamId===1?'Red':'Blue')+' goal marker');
      rows.push('');
     }
     const notes=ReplayLibrary.normalizeNotes(item.notes,item.frames);
     if(notes.length){rows.push('### Personal timeline notes','');
      for(const n of notes)rows.push('- '+minutes(n.frameNo)+' · '+heading(n.label)+' ['+heading(n.category)+']: '+heading(n.text));
      rows.push('');
     }
     const review=ReplayLibrary.normalizeReview(item.review);
     if(review){rows.push('### Personal coaching review','',
      'Focus: '+heading(review.focus)+' · Self-rating: '+review.rating+'/5','',
      review.note?heading(review.note):'',review.next?'Next action: '+heading(review.next):'','');}
    }catch{rows.push('Some locally stored notes could not be verified and were omitted.','');}
   }
   if(!rows.length||rows.join('\n').length>96*1024)throw Error('Study guide is too large.');
   const data=rows.join('\n'),url=URL.createObjectURL(new Blob([data],{type:'text/markdown;charset=utf-8'}));
   const a=make('a');a.href=url;a.download=filename(c).replace(/\.json$/,'.md');a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   notice('Private study guide saved with local goal markers and your own coaching notes.');
  }catch(err){notice(err.message||'Could not prepare the private study guide.');}
  finally{busy=false;studyButton.disabled=!current();}
 }
 function exportCollection(){
  const c=current();if(!c)return;
  const body=JSON.stringify({format:'fuckball-local-replay-collection',version:1,
   name:c.title,description:c.description,replays:c.replays,
   notice:'Only local replay IDs and notes, not the original HBR2 bytes or online results.'},null,2);
  const url=URL.createObjectURL(new Blob([body],{type:'application/json'})),a=make('a');
  a.href=url;a.download=filename(c);a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  notice('Collection index downloaded. Use the existing My Games ZIP backup for actual HBR2 files.');
 }
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];fileInput.value='';if(!file)return;
  if(file.size<=0||file.size>16*1024)return notice('Collection JSON must be below 16 KiB.');
  if(collectionList.length>=MAX_COLLECTIONS)return notice('Maximum 12 collections. Export and delete one before restoring.');
  try{
   const source=JSON.parse(await file.text());
   if(source?.format!=='fuckball-local-replay-collection'||source.version!==1||
    !titleValid(source.name)||!descriptionValid(source.description)||
    !Array.isArray(source.replays)||source.replays.length>MAX_REPLAYS||
    source.replays.some(x=>!idValid(x))||new Set(source.replays).size!==source.replays.length)
    throw Error('Invalid collection backup.');
   // A collection backup has no recordings; import only shortcuts present in this browser.
   const locallyAvailable=new Set(library.map(x=>x.id));
   const existing=source.replays.filter(id=>locallyAvailable.has(id));
   if(!window.confirm('Restore "'+source.name+'" with '+existing.length+' locally available HBR2 shortcuts? '+
    (source.replays.length-existing.length)+' unavailable recording links will be skipped.'))return;
   const item=check({id:uid(),title:source.name,description:source.description,
    updatedAt:Date.now(),replays:existing});
   persist([...collectionList,item]);active=item.id;
   notice('Collection restored without overwriting recordings or importing absent files.');render();
  }catch(err){notice('Collection import refused: '+(err.message||'Unsupported backup'));}
 });
 window.addEventListener('storage',e=>{
  if(e.key!==KEY)return;
  try{const value=read();collectionList=value.data;snapshot=value.raw;message='Collection index updated in another tab.';render();}
  catch{notice('Another tab changed collection data; refresh before saving.');}
 });
 document.getElementById('tabReplay')?.addEventListener('click',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!games.hidden)refresh();});
 refresh();
})();