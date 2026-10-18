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
  ijkl:{up:['KeyI',''],down:['KeyK',''],left:['KeyJ',''],right:['KeyL',''],kick:['KeyO',''],chat:['Enter','']},
  esdf:{up:['KeyE',''],down:['KeyD',''],left:['KeyS',''],right:['KeyF',''],kick:['KeyG',''],chat:['Enter','']},
  numpad:{up:['Numpad8',''],down:['Numpad5',''],left:['Numpad4',''],right:['Numpad6',''],kick:['Numpad0',''],chat:['NumpadEnter','']}
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
 for(const [id,label] of [['standard','Default'],['arrows','Arrow keys'],['wasd','WASD'],['ijkl','IJKL'],['esdf','ESDF · left hand'],['numpad','Numpad · right hand']]){
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;
  btn.addEventListener('click',()=>apply(builtins[id],label));presets.append(btn);
 }
 const slotLabel=document.createElement('label');slotLabel.textContent='Personal layout slot';
 const slot=document.createElement('select');slot.setAttribute('aria-label','Personal keyboard layout slot');
 const homeSlot=document.createElement('select');homeSlot.setAttribute('aria-label','Personal slot on Play screen');
 let quickStatus=null,quickPreview=null,liveCheck=null;
 const names={up:'↑ Up',down:'↓ Down',left:'← Left',right:'→ Right',kick:'⚽ Kick',chat:'💬 Chat'};
 const description=code=>code.replace(/^Key/,'').replace(/^Numpad/,'Num ').replace(/^Arrow/,'Arrow ').replace(/^Digit/,'');
 const pressed=new Set();
 function updateHomeKeys(){
  if(!quickPreview)return;
  quickPreview.replaceChildren();
  for(const action of actions){
   const row=document.createElement('div');row.className='keyboard-quick-key';
   const label=document.createElement('strong');label.textContent=names[action];
   const controls=document.createElement('span');
   const codes=settings.keys[action]||[];
   controls.textContent=codes.filter(Boolean).map(description).join(' · ')||'Not assigned';
   row.append(label,controls);quickPreview.append(row);
  }
  if(liveCheck)showLiveKeys();
 }
 function showLiveKeys(){
  if(!liveCheck)return;
  const found=actions.filter(a=>(settings.keys[a]||[]).some(code=>pressed.has(code)));
  liveCheck.textContent=found.length?'Detected: '+found.map(k=>names[k]).join(' · '):
   'Focus here, then press your assigned controls to check them without starting a match.';
 }
 function refreshSlots(){
  const selected=slot.value||homeSlot.value||'0';
  slot.replaceChildren();homeSlot.replaceChildren();
  for(let n=0;n<3;n++){
   const name='Slot '+(n+1)+(saved[n]?' · saved':' · empty');
   slot.add(new Option(name,String(n)));
   homeSlot.add(new Option(name,String(n)));
  }
  slot.value=homeSlot.value=['0','1','2'].includes(selected)?selected:'0';
 }
 refreshSlots();slotLabel.append(slot);
 const actionsRow=document.createElement('div');actionsRow.className='keyboard-layout-actions';
 function button(label,handler){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);actionsRow.append(b);return b;}
 function message(text,error=false){
  status.textContent=text;status.classList.toggle('error',error);
  if(quickStatus){quickStatus.textContent=text;quickStatus.classList.toggle('error',error);}
  updateHomeKeys();
 }
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
 function saveCurrent(){
  let current;
  try{current=validate(settings.keys);}catch(e){message(e.message,true);return;}
  const index=Number(slot.value);
  if(saved[index]&&!window.confirm('Replace your previously saved layout in Slot '+(index+1)+'?'))return;
  saved[index]=current;
  message(persist()?'Slot '+(index+1)+' saved on this device.':'Saved for this visit; browser storage is unavailable.',false);
  refreshSlots();
 }
 button('Save current',saveCurrent);
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
 // Real, editable keyboard profiles now start on the Play home screen too.
 // No match startup, game input, network traffic or account write is necessary.
 const home=document.getElementById('homeView');
 if(home){
  const quick=document.createElement('section');quick.className='keyboard-quick-start';
  quick.setAttribute('aria-label','Keyboard quick start and key preview');
  const top=document.createElement('div');top.className='keyboard-quick-head';
  const heading=document.createElement('div');
  const eyebrow=document.createElement('span');eyebrow.textContent='PLAY YOUR WAY · KEYBOARD';
  const headline=document.createElement('h2');headline.textContent='KEYBOARD READY.';
  const help=document.createElement('p');
  help.textContent='Select a ready-made keyboard layout or load a personal slot before entering a match. Press keys in the safe preview to see exactly what your controls do.';
  heading.append(eyebrow,headline,help);top.append(heading);
  const presets=document.createElement('div');presets.className='keyboard-quick-presets';
  for(const [key,label] of [
   ['standard','Default'],['wasd','WASD'],['arrows','Arrows'],['ijkl','IJKL'],
   ['esdf','ESDF · one hand'],['numpad','Numpad · one hand']]){
   const preset=document.createElement('button');preset.type='button';preset.textContent=label;
   preset.addEventListener('click',()=>apply(builtins[key],label+' keyboard layout'));
   presets.append(preset);
  }
  const slotRow=document.createElement('div');slotRow.className='keyboard-quick-slots';
  const slotName=document.createElement('label');slotName.textContent='Personal profile';
  slotName.append(homeSlot);
  homeSlot.onchange=()=>{slot.value=homeSlot.value;};
  slot.onchange=()=>{homeSlot.value=slot.value;};
  const load=document.createElement('button');load.type='button';load.textContent='Load personal slot';
  load.onclick=()=>{
   const index=Number(homeSlot.value);
   if(!saved[index]){message('Selected personal slot is empty.',true);return;}
   apply(saved[index],'Personal slot '+(index+1));
  };
  const save=document.createElement('button');save.type='button';save.textContent='Save current to slot';
  save.onclick=()=>{slot.value=homeSlot.value;saveCurrent();};
  slotRow.append(slotName,load,save);
  const currentTitle=document.createElement('h3');currentTitle.textContent='YOUR CURRENT KEYS';
  quickPreview=document.createElement('div');quickPreview.className='keyboard-quick-map';
  liveCheck=document.createElement('div');liveCheck.tabIndex=0;liveCheck.className='keyboard-quick-live';
  liveCheck.setAttribute('role','group');liveCheck.setAttribute('aria-label','Check keyboard controls safely here');
  liveCheck.addEventListener('keydown',event=>{
   if(!codePattern.test(event.code))return;
   event.preventDefault();event.stopPropagation();pressed.add(event.code);showLiveKeys();
  });
  liveCheck.addEventListener('keyup',event=>{
   if(!codePattern.test(event.code))return;
   event.preventDefault();event.stopPropagation();pressed.delete(event.code);showLiveKeys();
  });
  liveCheck.addEventListener('blur',()=>{pressed.clear();showLiveKeys();});
  quickStatus=document.createElement('p');quickStatus.className='keyboard-quick-status';
  quickStatus.setAttribute('role','status');quickStatus.setAttribute('aria-live','polite');
  const footer=document.createElement('p');footer.className='keyboard-quick-help';
  footer.textContent='To remap individual keys, use Match Menu → Controls. Changes apply to the existing keyboard input path; live physics and online rules never change.';
  quick.append(top,presets,slotRow,currentTitle,quickPreview,liveCheck,quickStatus,footer);
  const homeAnchor=home.querySelector('.controller-setup')||home.querySelector('.mode-cards');
  if(homeAnchor)homeAnchor.insertAdjacentElement('afterend',quick);
  else home.append(quick);
  updateHomeKeys();
  document.getElementById('tabHome')?.addEventListener('click',updateHomeKeys);
  window.addEventListener('focus',()=>{if(!home.hidden)updateHomeKeys();});
 }
 const subtitle=document.createElement('p');subtitle.className='keyboard-layout-disclaimer';
 subtitle.textContent='Import files contain keyboard codes only. Avoid loading layout files from sources you do not trust.';
 panel.append(subtitle);
 list.insertAdjacentElement('afterend',panel);
})();
