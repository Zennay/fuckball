'use strict';
// Device-private bulk replay organization. Never changes HBR2 bytes, official
// server results, accounts, room connections, or online player identity.
(function(){
 const view=document.getElementById('gamesView');
 const list=view?.querySelector('#gamesList');
 if(!view||!list||typeof ReplayLibrary==='undefined')return;
 const MAX=30;
 const el=(tag,value,cls)=>{
  const e=document.createElement(tag);
  if(value!==undefined&&value!==null)e.textContent=String(value);
  if(cls)e.className=cls;
  return e;
 };
 const button=(label,handler)=>{
  const b=el('button',label);b.type='button';b.addEventListener('click',handler);return b;
 };
 const section=el('section',null,'replay-bulk-organizer');
 section.setAttribute('aria-label','Organize saved private HBR2 recordings');
 const details=el('details');
 const summary=el('summary','▦ ORGANIZE MULTIPLE REPLAYS · OPEN');
 details.append(summary);
 const body=el('div',null,'replay-bulk-body');
 const intro=el('p','Select your own local HBR2 recordings and apply a shared label or favorite status in one action. Recordings and coaching notes remain untouched; no cloud sync or official match stats.');
 const header=el('div',null,'replay-bulk-tools');
 const filter=el('input');filter.type='search';filter.maxLength=80;filter.placeholder='Find recording…';
 filter.setAttribute('aria-label','Filter private recordings for bulk organization');
 const show=el('select');show.setAttribute('aria-label','Choose recordings to display');
 for(const [value,title] of [['all','All recordings'],['favorite','Favorites only'],['other','Not favorite']])
  show.add(new Option(title,value));
 const refresh=button('↻ Refresh',refreshAll);
 const all=button('Select visible',()=>{for(const item of visible())selected.add(item.id);render();});
 const clear=button('Clear selection',()=>{selected.clear();render();});
 header.append(filter,show,refresh,all,clear);
 const selectedStatus=el('p','No recordings selected.','replay-bulk-selected');
 const rows=el('div',null,'replay-bulk-recordings');
 const tagTools=el('div',null,'replay-bulk-tag-tools');
 const tag=el('input');tag.type='text';tag.maxLength=24;tag.placeholder='e.g. Best saves';
 tag.setAttribute('aria-label','Tag to add or remove');
 const addTag=button('＋ Add label',()=>changeTag('add'));
 const removeTag=button('− Remove label',()=>changeTag('remove'));
 const mark=button('★ Mark favorites',()=>changeFavorite(true));
 const unmark=button('☆ Unmark favorites',()=>changeFavorite(false));
 tagTools.append(tag,addTag,removeTag,mark,unmark);
 const message=el('p',null,'replay-bulk-status');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 body.append(intro,header,selectedStatus,rows,tagTools,message);
 details.append(body);section.append(details);
 view.insertBefore(section,list);
 let records=[],selected=new Set(),busy=false,loading=0;
 const nameOk=item=>item&&typeof item.id==='string'&&/^[a-f0-9]{32}$/.test(item.id)&&
  typeof item.name==='string'&&item.name.length>=1&&item.name.length<=100;
 const favorite=item=>item.favorite===true;
 function visible(){
  const term=filter.value.trim().toLocaleLowerCase();
  return records.filter(item=>
   (show.value==='all'||(show.value==='favorite'&&favorite(item))||
    (show.value==='other'&&!favorite(item)))&&
   (!term||item.name.toLocaleLowerCase().includes(term)));
 }
 function render(){
  rows.replaceChildren();
  const listed=visible();
  const validIDs=new Set(records.map(item=>item.id));
  for(const id of selected)if(!validIDs.has(id))selected.delete(id);
  all.disabled=busy||!listed.length||listed.every(item=>selected.has(item.id));
  clear.disabled=busy||!selected.size;
  const count=selected.size;
  selectedStatus.textContent=count+' of '+records.length+' locally saved recordings selected';
  tag.disabled=busy||!count;
  for(const b of [addTag,removeTag,mark,unmark])b.disabled=busy||!count;
  filter.disabled=show.disabled=refresh.disabled=busy;
  if(!listed.length)rows.append(el('p',records.length?'No recordings match this filter.':'No recordings saved on this device.'));
  for(const item of listed){
   const row=el('label',null,'replay-bulk-row');
   const check=el('input');check.type='checkbox';check.checked=selected.has(item.id);check.disabled=busy;
   check.setAttribute('aria-label','Select '+item.name);
   check.addEventListener('change',()=>{
    if(check.checked)selected.add(item.id);else selected.delete(item.id);
    render();
   });
   const title=el('span',null,'replay-bulk-record');
   title.append(el('strong',item.name),
    el('small',(favorite(item)?'★ Favorite · ':'')+
      (Array.isArray(item.tags)&&item.tags.length?item.tags.join(' · '):'No tags')));
   row.append(check,title);rows.append(row);
  }
 }
 async function refreshAll(){
  if(busy)return;
  const epoch=++loading;
  message.textContent='Reading your private recordings…';
  try{
   const items=await ReplayLibrary.list();
   if(epoch!==loading)return;
   records=items.filter(nameOk).slice(0,MAX);
   render();
   message.textContent=records.length?
    'Select recordings to organize. Existing HBR2 files are unchanged.':
    'Save or import a replay in My Games first.';
  }catch(error){
   if(epoch!==loading)return;
   records=[];selected.clear();render();
   message.textContent='Local replay storage is unavailable: '+(error.message||'Unknown browser error');
  }
 }
 function selection(){
  const ids=new Set(selected);
  return records.filter(item=>ids.has(item.id));
 }
 function ensureTag(){
  const value=tag.value.trim().replace(/\s+/g,' ');
  // Canonical validation; no control characters or markup in stored tags.
  const normalized=ReplayLibrary.normalizeTags([value]);
  return normalized[0];
 }
 async function apply(label,operation){
  if(busy||!selected.size)return;
  const ids=selection().map(item=>item.id);
  if(ids.length!==selected.size||ids.length>MAX){
   message.textContent='Selection changed. Refresh your recordings and try again.';return;
  }
  busy=true;render();let applied=0,skipped=0,problem='';
  try{
   for(const id of ids){
    const item=(await ReplayLibrary.list()).find(x=>x.id===id);
    if(!item){problem='A selected replay was removed in another tab.';break;}
    const result=operation(item);
    if(result===null){skipped++;continue;}
    try{
     if(result.kind==='tags')await ReplayLibrary.setTags(id,result.value);
     else if(result.kind==='favorite')await ReplayLibrary.setFavorite(id,result.value);
     else throw Error('Invalid bulk edit');
     applied++;
    }catch(error){problem=error.message||'Replay update failed.';break;}
   }
  }catch(error){problem=error.message||'Unable to access replay storage.';}
  finally{
   busy=false;selected.clear();
   await refreshAll();
   if(typeof renderMyGames==='function')await renderMyGames();
   message.textContent=(problem?'Stopped: '+problem+' · ':'')+
    applied+' recordings updated, '+skipped+' already matched.'+
    (problem?' Earlier updates remain saved.':'');
  }
 }
 function changeTag(mode){
  let value;
  try{value=ensureTag();}
  catch(error){message.textContent=error.message||'Invalid label.';return;}
  if(mode==='add')return apply('Add label',item=>{
   const existing=ReplayLibrary.normalizeTags(item.tags);
   if(existing.some(x=>x.toLocaleLowerCase()===value.toLocaleLowerCase()))return null;
   if(existing.length>=8)throw Error('A selected replay already has the maximum eight labels.');
   return {kind:'tags',value:[...existing,value]};
  });
  return apply('Remove label',item=>{
   const existing=ReplayLibrary.normalizeTags(item.tags);
   const next=existing.filter(x=>x.toLocaleLowerCase()!==value.toLocaleLowerCase());
   return next.length===existing.length?null:{kind:'tags',value:next};
  });
 }
 function changeFavorite(value){
  return apply('Favorite',item=>favorite(item)===value?null:{kind:'favorite',value});
 }
 filter.addEventListener('input',render);
 show.addEventListener('change',render);
 details.addEventListener('toggle',()=>{if(details.open)refreshAll();});
 document.getElementById('tabReplay')?.addEventListener('click',()=>{if(details.open)refreshAll();});
 window.addEventListener('fuckball:local-replay-library-change',()=>{if(details.open)refreshAll();});
 window.addEventListener('focus',()=>{if(details.open&&!view.hidden)refreshAll();});
 render();
})();