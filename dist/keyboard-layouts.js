'use strict';
// Player-owned keyboard layouts. Never changes authoritative input/physics rules.
(function(){
 const list=document.getElementById('bindingList');
 if(!list||typeof settings==='undefined'||typeof renderBindings!=='function')return;
 const storeKey='fuckball.keyboard-layouts.v1',actions=['up','down','left','right','kick','chat'];
 const builtins={
  standard:Object.fromEntries(actions.map(k=>[k,[...defaultBindings[k]]])),
  arrows:{up:['ArrowUp',''],down:['ArrowDown',''],left:['ArrowLeft',''],right:['ArrowRight',''],kick:['Space',''],chat:['Enter','']},
  wasd:{up:['KeyW',''],down:['KeyS',''],left:['KeyA',''],right:['KeyD',''],kick:['Space',''],chat:['Enter','']},
  ijkl:{up:['KeyI',''],down:['KeyK',''],left:['KeyJ',''],right:['KeyL',''],kick:['KeyO',''],chat:['Enter','']}
 };
 const codePattern=/^(?:Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Numpad(?:[0-9]|Enter|Add|Subtract|Multiply|Divide|Decimal))$/;
 function validate(source){
  if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Invalid keyboard layout.');
  if(Object.keys(source).some(k=>!actions.includes(k)))throw Error('Unknown keyboard action.');
  const result={},used=new Set();
  for(const action of actions){
   const arr=source[action];
   if(!Array.isArray(arr)||arr.length!==2)throw Error('Each action needs two key slots.');
   result[action]=arr.map(code=>{
    if(typeof code!=='string'||(code!==''&&!codePattern.test(code)))throw Error('Unsupported key code.');
    if(code&&used.has(code))throw Error('One key cannot control two actions.');
    if(code)used.add(code);
    return code;
   });
  }
  for(const key of actions.filter(x=>x!=='chat'))
   if(!result[key].some(Boolean))throw Error('Movement and kick actions each need a key.');
  return result;
 }
 let saved=[null,null,null];
 try{
  const parsed=JSON.parse(localStorage.getItem(storeKey)||'null');
  if(parsed?.version===1&&Array.isArray(parsed.slots)&&parsed.slots.length===3)
   saved=parsed.slots.map(item=>{try{return item?validate(item):null;}catch{return null;}});
 }catch{}
 const panel=document.createElement('section');panel.className='keyboard-layouts';
 panel.setAttribute('aria-label','Keyboard layout presets');
 const title=document.createElement('h3');title.textContent='KEYBOARD PROFILES.';
 const desc=document.createElement('p');
 desc.textContent='Try a ready-made layout, keep up to three personal layouts or move one to another device. Switches take effect immediately; online rules and physics do not change.';
 const presets=document.createElement('div');presets.className='keyboard-layout-presets';
 for(const [id,label] of [['standard','Default'],['arrows','Arrow keys'],['wasd','WASD'],['ijkl','IJKL']]){
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;
  btn.addEventListener('click',()=>apply(builtins[id],label));presets.append(btn);
 }
 const slotLabel=document.createElement('label');slotLabel.textContent='Personal layout slot';
 const slot=document.createElement('select');slot.setAttribute('aria-label','Personal keyboard layout slot');
 function refreshSlots(){
  const selected=slot.value;
  slot.replaceChildren();
  for(let n=0;n<3;n++)slot.add(new Option('Slot '+(n+1)+(saved[n]?' · saved':' · empty'),String(n)));
  if(['0','1','2'].includes(selected))slot.value=selected;
 }
 refreshSlots();slotLabel.append(slot);
 const actionsRow=document.createElement('div');actionsRow.className='keyboard-layout-actions';
 function button(label,handler){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);actionsRow.append(b);return b;}
 function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
 function persist(){
  try{localStorage.setItem(storeKey,JSON.stringify({version:1,slots:saved}));return true;}
  catch{return false;}
 }
 function apply(source,name){
  let mapping;
  try{mapping=validate(source);}catch(e){message(e.message,true);return;}
  if(typeof cancelBinding==='function')cancelBinding();
  if(typeof releaseInputs==='function')releaseInputs();
  settings.keys=mapping;
  savePrefs();
  renderBindings();
  message(name+' is active. Key changes below still work normally.');
 }
 button('Save current',()=>{
  let current;
  try{current=validate(settings.keys);}catch(e){message(e.message,true);return;}
  const index=Number(slot.value);
  if(saved[index]&&!window.confirm('Replace your previously saved layout in Slot '+(index+1)+'?'))return;
  saved[index]=current;
  message(persist()?'Slot '+(index+1)+' saved on this device.':'Saved for this visit; browser storage is unavailable.',false);
  refreshSlots();
 });
 button('Load slot',()=>{
  const index=Number(slot.value);
  if(!saved[index]){message('Nothing saved in this slot yet.',true);return;}
  apply(saved[index],'Slot '+(index+1));
 });
 button('Delete slot',()=>{
  const index=Number(slot.value);
  if(!saved[index]){message('Slot already empty.');return;}
  if(!window.confirm('Permanently delete the local keyboard layout in Slot '+(index+1)+'?'))return;
  saved[index]=null;
  message(persist()?'Slot deleted.':'Slot cleared for this visit; browser storage is unavailable.');
  refreshSlots();
 });
 const shareRow=document.createElement('div');shareRow.className='keyboard-layout-share';
 button('Export current .json',()=>{
  let current;
  try{current=validate(settings.keys);}catch(e){message(e.message,true);return;}
  const payload=JSON.stringify({format:'fuckball-keyboard-profile',version:1,bindings:current},null,2);
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='fuckball-keyboard-layout.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  message('Layout exported locally. No account or network upload.');
 });
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 const importButton=button('Import .json',()=>{file.value='';file.click();});
 file.addEventListener('change',async()=>{
  const candidate=file.files?.[0];if(!candidate)return;
  if(candidate.size>4096){message('File too large (maximum 4 KB).',true);return;}
  try{
   const parsed=JSON.parse(await candidate.text());
   if(parsed?.format!=='fuckball-keyboard-profile'||parsed.version!==1)
    throw Error('Not a supported Fuckball layout file.');
   const imported=validate(parsed.bindings);
   if(!window.confirm('Replace your CURRENT keyboard bindings with this file? Your saved slots will not change.'))return;
   apply(imported,'Imported layout');
  }catch(e){message(e.message||'Could not read the layout file.',true);}
 });
 const status=document.createElement('p');status.className='keyboard-layout-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.textContent='Current keys are stored by Fuckball settings; saved slots stay in this browser only.';
 panel.append(title,desc,presets,slotLabel,actionsRow,file,status);
 const subtitle=document.createElement('p');subtitle.className='keyboard-layout-disclaimer';
 subtitle.textContent='Import files contain keyboard codes only. Avoid loading layout files from sources you do not trust.';
 panel.append(subtitle);
 list.insertAdjacentElement('afterend',panel);
})();
