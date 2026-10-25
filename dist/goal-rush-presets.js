'use strict';
// Local user-owned presets for the existing Goal Rush challenge; never touches the game engine.
(function(){
 const card=document.querySelector('.goal-rush-setup'),fields=card?.querySelector('.goal-rush-fields');
 if(!card||!fields)return;
 const duration=fields.querySelector('select[aria-label="Goal Rush drill duration"]');
 const target=fields.querySelector('select[aria-label="Goal Rush target goals"]');
 const launch=fields.querySelector('button.primary');
 if(!duration||!target||!launch)return;
 const KEY='fuckball.local-goal-rush-presets.v1',MAX=8,MAX_FILE=12*1024;
 const tag=(name,text,cls)=>{const n=document.createElement(name);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const section=tag('section',undefined,'goal-rush-presets');
 const heading=tag('div',undefined,'rush-preset-head');
 heading.append(tag('h3','MY DRILL PRESETS.'),tag('p','Save your favourite offline duration and target combinations. Private to this browser, never ranked or shared.'));
 const saveRow=tag('div',undefined,'rush-preset-save');
 const nameLabel=tag('label','Preset name'),name=tag('input');
 name.type='text';name.placeholder='Finishing warm-up';name.maxLength=32;name.required=true;nameLabel.append(name);
 const save=tag('button','＋ Save selected drill');save.type='button';saveRow.append(nameLabel,save);
 const presetsLabel=tag('label','Saved drills'),pick=tag('select');
 pick.setAttribute('aria-label','Select a saved Goal Rush drill');presetsLabel.append(pick);
 const actions=tag('div',undefined,'rush-preset-actions'),load=tag('button','Load settings'),
  start=tag('button','▶ Start saved drill'),remove=tag('button','Delete preset');
 for(const b of [load,start,remove]){b.type='button';actions.append(b);}
 const portable=tag('div',undefined,'rush-preset-portable');
 const backup=tag('button','↓ Export presets'),restore=tag('button','↑ Import presets');
 const upload=tag('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;
 for(const b of [backup,restore]){b.type='button';portable.append(b);}
 portable.append(upload);
 const feedback=tag('p',undefined,'rush-preset-feedback');
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 section.append(heading,saveRow,presetsLabel,actions,portable,feedback);
 fields.insertAdjacentElement('afterend',section);
 const validName=value=>typeof value==='string'&&!!value.trim()&&value.trim().length<=32&&
  !/[\x00-\x1f\x7f<>]/.test(value);
 function normalize(input){
  if(!Array.isArray(input)||input.length>MAX)throw Error('Drill preset limit is eight.');
  const seen=new Set();
  return input.map(item=>{
   if(!item||typeof item!=='object'||Array.isArray(item)||!validName(item.name)||
    ![60,120,180].includes(item.duration)||![1,3,5].includes(item.target))
    throw Error('Invalid saved Goal Rush configuration.');
   const clean=item.name.trim(),key=clean.toLocaleLowerCase();
   if(seen.has(key))throw Error('Two saved drills cannot share a name.');
   seen.add(key);return{name:clean,duration:item.duration,target:item.target};
  });
 }
 function read(){
  try{return normalize(JSON.parse(localStorage.getItem(KEY)||'[]'));}
  catch{return[];}
 }
 function write(list){
  const clean=normalize(list);
  localStorage.setItem(KEY,JSON.stringify(clean));
  return clean;
 }
 let items=read();
 function render(selected){
  const preferred=selected||pick.value;pick.replaceChildren();
  pick.add(new Option(items.length?'Choose a saved drill':'No saved drills yet',''));
  for(const item of items)pick.add(new Option(item.name+' · '+item.duration+'s / '+item.target+' goals',item.name));
  pick.value=items.some(x=>x.name===preferred)?preferred:'';
  load.disabled=start.disabled=remove.disabled=!pick.value;
  backup.disabled=!items.length;save.disabled=items.length>=MAX;
 }
 function choose(){
  const item=items.find(x=>x.name===pick.value);
  if(!item)throw Error('Select an available saved drill.');
  return item;
 }
 save.onclick=()=>{
  try{
   // Read at the moment of editing rather than overwriting changes another
   // game tab made after this panel was opened.
   items=read();
   const label=name.value.trim();
   if(!validName(label))throw Error('Choose a name of 1–32 characters.');
   if(items.length>=MAX)throw Error('Eight presets saved; delete one first.');
   items=write([...items,{name:label,duration:Number(duration.value),target:Number(target.value)}]);
   render(label);name.value='';
   feedback.textContent='Saved '+label+' on this device. Your Goal Rush attempts are unchanged.';
  }catch(error){feedback.textContent='Cannot save preset: '+(error.message||'Browser storage unavailable');}
 };
 function apply(){
  const chosen=choose();
  duration.value=String(chosen.duration);target.value=String(chosen.target);
  duration.dispatchEvent(new Event('change',{bubbles:true}));
  feedback.textContent='Loaded '+chosen.name+' · '+chosen.duration+' seconds / '+chosen.target+' goals.';
 }
 load.onclick=()=>{try{apply();}catch(error){feedback.textContent=error.message||'Cannot load drill.';}};
 start.onclick=()=>{
  try{apply();launch.click();}catch(error){feedback.textContent=error.message||'Cannot launch saved drill.';}
 };
 remove.onclick=()=>{
  try{
   const selected=pick.value;
   items=read();
   const chosen=items.find(x=>x.name===selected);
   if(!chosen)throw Error('This preset changed in another tab. Refresh and choose again.');
   const before=localStorage.getItem(KEY);
   if(!confirm('Delete local preset "'+chosen.name+'"? Existing practice attempts will remain.'))return;
   if(localStorage.getItem(KEY)!==before)
    throw Error('Presets changed in another tab while confirming. Nothing was removed.');
   items=write(items.filter(x=>x.name!==chosen.name));
   render();feedback.textContent='Removed '+chosen.name+'. Goal Rush records are unchanged.';
  }catch(error){feedback.textContent=error.message||'Cannot remove preset.';}
 };
 function download(blob,filename){
  const url=URL.createObjectURL(blob),link=tag('a');
  link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 backup.onclick=()=>{
  if(!items.length)return;
  const payload={format:'fuckball-goal-rush-presets',version:1,source:'local-user-defined',presets:items};
  download(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),
   'fuckball-goal-rush-drills-'+new Date().toISOString().slice(0,10)+'.json');
  feedback.textContent='Exported '+items.length+' local drill presets; personal bests and results are not included.';
 };
 restore.onclick=()=>upload.click();
 upload.onchange=async()=>{
  const file=upload.files?.[0];upload.value='';if(!file)return;
  // File parsing and confirmation are asynchronous; a second browser tab
  // can save new drills meanwhile. Never overwrite those unseen updates.
  const original=localStorage.getItem(KEY);
  if(file.size<=0||file.size>MAX_FILE){feedback.textContent='Import refused: JSON must be at most 12 KB.';return;}
  try{
   const data=JSON.parse(await file.text());
   if(data?.format!=='fuckball-goal-rush-presets'||data.version!==1||data.source!=='local-user-defined')
    throw Error('Unsupported Goal Rush preset backup.');
   const incoming=normalize(data.presets);
   if(localStorage.getItem(KEY)!==original)
    throw Error('Saved drills changed in another tab during file reading. Import cancelled; try again.');
   const current=read();
   if(!confirm('Replace '+current.length+' local Goal Rush presets with '+incoming.length+
    ' from this file? Attempts, best scores and weekly goals will not change.'))return;
   if(localStorage.getItem(KEY)!==original)
    throw Error('Saved drills changed while import confirmation was open. Import cancelled.');
   items=write(incoming);render();
   feedback.textContent='Restored '+items.length+' saved drill setups on this device.';
  }catch(error){feedback.textContent='Import refused: '+(error.message||'Cannot read file');}
 };
 pick.onchange=()=>render(pick.value);
 window.addEventListener('storage',event=>{
  if(event.key===KEY||event.key===null){
   items=read();render();
   feedback.textContent='Saved drills were updated in another tab. Review selection before playing.';
  }
 });
 render();
})();