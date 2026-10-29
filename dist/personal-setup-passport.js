'use strict';
// Portable player setup: ONLY explicit control/accessibility keys, never
// 'fuckball.settings' as a whole (which may contain account credentials).
(function(){
 const home=document.querySelector('.club-header .profile');
 const pane=document.querySelector('#menuVideoPane .rm-form');
 if(!home&&!pane)return;
 const FORMAT='fuckball-player-setup',VERSION=1,MAX_BYTES=24576;
 const entries=[
  ['keyboard','Keyboard bindings','Active movement, kick and chat buttons',null],
  ['keyboardSlots','Saved keyboard slots','Your three personal keyboard profiles','fuckball.keyboard-layouts.v1'],
  ['touch','Touch layout','Thumb controls, size, position and visibility','fuckball.touch-controls.v1'],
  ['controller','Controller setup','Movement, kick mapping, deadzone and optional vibration','fuckball.gamepad.v1'],
  ['accessibility','Accessibility','Contrast, text size, motion and team markers','fuckball.accessibility.v1']
 ];
 const actions=['up','down','left','right','kick','chat'];
 const validCode=/^(?:Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Numpad(?:[0-9]|Enter|Add|Subtract|Multiply|Divide|Decimal))$/;
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 const keys=(value,allowed,required=allowed)=>{
  if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k))||
   required.some(k=>!Object.hasOwn(value,k)))throw Error('Unsupported settings fields.');
 };
 const isNumber=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 function bindings(raw){
  keys(raw,actions);
  const used=new Set(),normalized={};
  for(const action of actions){
   const pair=raw[action];
   if(!Array.isArray(pair)||pair.length!==2)throw Error('Keyboard keys need two slots.');
   normalized[action]=pair.map(code=>{
    if(typeof code!=='string'||code.length>24||
       (code!==''&&!validCode.test(code))||(code!==''&&used.has(code)))
     throw Error('Invalid or conflicting keyboard key.');
    if(code)used.add(code);
    return code;
   });
   if(action!=='chat'&&!normalized[action].some(Boolean))throw Error('Every move/kick action needs a key.');
  }
  return normalized;
 }
 function slots(raw){
  keys(raw,['version','slots']);
  if(raw.version!==1||!Array.isArray(raw.slots)||raw.slots.length!==3)throw Error('Unsupported keyboard profiles.');
  return {version:1,slots:raw.slots.map(v=>v===null?null:bindings(v))};
 }
 function touch(raw){
  keys(raw,['hand','scale','deadzone','edge','lift','opacity'],
   ['hand','scale','deadzone']);
  if(!['left','right'].includes(raw.hand))throw Error('Invalid touch handedness.');
  const numbers={scale:[.75,1.5],deadzone:[4,24],edge:[8,72],lift:[0,140],opacity:[40,100]};
  const normal={hand:raw.hand,scale:raw.scale,deadzone:raw.deadzone,
   edge:raw.edge===undefined?20:raw.edge,lift:raw.lift===undefined?0:raw.lift,
   opacity:raw.opacity===undefined?85:raw.opacity};
  for(const [key,[min,max]] of Object.entries(numbers)){
   if(!isNumber(normal[key],min,max)||key!=='scale'&&!Number.isInteger(normal[key]))
    throw Error('Invalid '+key+' in touch layout.');
  }
  return normal;
 }
 function controller(raw){
  keys(raw,['kick','deadzone','stick','invertX','invertY','kickPulse','goalPulse'],['kick','deadzone']);
  const goodKick=['default','face','trigger','shoulder'].includes(raw.kick)||
   /^button:(?:[0-8]|10|11)$/.test(raw.kick);
  const stick=raw.stick===undefined?'left':raw.stick;
  const invertX=raw.invertX===undefined?false:raw.invertX;
  const invertY=raw.invertY===undefined?false:raw.invertY;
  const kickPulse=raw.kickPulse===undefined?false:raw.kickPulse;
  const goalPulse=raw.goalPulse===undefined?false:raw.goalPulse;
  if(!goodKick||!isNumber(raw.deadzone,.15,.65)||
   !['left','right'].includes(stick)||typeof invertX!=='boolean'||
   typeof invertY!=='boolean'||typeof kickPulse!=='boolean'||
   typeof goalPulse!=='boolean')throw Error('Invalid controller settings.');
  return {kick:raw.kick,deadzone:raw.deadzone,stick,invertX,invertY,kickPulse,goalPulse};
 }
 function accessibility(raw){
  keys(raw,['version','contrast','large','motion','opaque','teamMarks']);
  if(raw.version!==1||['contrast','large','motion','opaque','teamMarks']
   .some(key=>typeof raw[key]!=='boolean'))throw Error('Invalid accessibility settings.');
  return {version:1,contrast:raw.contrast,large:raw.large,motion:raw.motion,
   opaque:raw.opaque,teamMarks:raw.teamMarks};
 }
 const validators={keyboard:bindings,keyboardSlots:slots,touch,controller,accessibility};
 const defaults={
  keyboardSlots:()=>({version:1,slots:[null,null,null]}),
  touch:()=>({hand:'right',scale:1,deadzone:10,edge:20,lift:0,opacity:85}),
  controller:()=>({kick:'default',deadzone:.30,stick:'left',invertX:false,invertY:false,
    kickPulse:false,goalPulse:false}),
  accessibility:()=>({version:1,contrast:!!window.matchMedia?.('(prefers-contrast: more)')?.matches,
   large:false,motion:!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
   opaque:false,teamMarks:false})
 };
 function safeRead(key,fallback){
  try{const stored=localStorage.getItem(key);
   return stored===null?fallback():JSON.parse(stored);
  }catch{throw Error('Could not read saved '+key+'.');}
 }
 function current(selected=entries.map(item=>item[0])){
  const parts={};
  if(selected.includes('keyboard'))parts.keyboard=bindings(settings.keys);
  for(const [kind,, ,storageKey] of entries){
   if(kind==='keyboard'||!selected.includes(kind))continue;
   parts[kind]=validators[kind](safeRead(storageKey,defaults[kind]));
  }
  return parts;
 }
 function parse(data){
  keys(data,['format','version','exportedAt','parts'],['format','version','parts']);
  if(data.format!==FORMAT||data.version!==VERSION)throw Error('This is not a supported Fuckball setup file.');
  if(!object(data.parts)||Object.keys(data.parts).length<1||
     Object.keys(data.parts).some(key=>!Object.hasOwn(validators,key)))throw Error('Unknown setup category.');
  const result={};
  for(const [key,value] of Object.entries(data.parts))result[key]=validators[key](value);
  return result;
 }
 const trigger=(label,container)=>{
  const btn=document.createElement('button');btn.type='button';btn.className='setup-passport-trigger';
  btn.textContent=label;btn.title='Back up or restore local input and accessibility preferences';
  container.append(btn);return btn;
 };
 const buttons=[];
 if(home)buttons.push(trigger('⇄ My setup',home));
 if(pane){
  const line=document.createElement('section');line.className='setup-passport-entry';
  const heading=document.createElement('h3');heading.textContent='MY DEVICE SETUP.';
  const desc=document.createElement('p');
  desc.textContent='Move keyboard, touch, controller and accessibility settings between devices without exporting account details.';
  line.append(heading,desc);
  buttons.push(trigger('⇄ Back up or restore setup',line));pane.append(line);
 }
 const dialog=document.createElement('dialog');dialog.className='setup-passport-dialog';
 dialog.setAttribute('aria-labelledby','setupPassportTitle');
 const heading=document.createElement('h2');heading.id='setupPassportTitle';heading.textContent='MY SETUP PASSPORT.';
 const intro=document.createElement('p');
 intro.textContent='Only gameplay control layouts and accessibility preferences. No account token, room link, messages, replays or stats leave this device.';
 const section=document.createElement('section');section.className='setup-passport-choices';
 const summary=document.createElement('strong');
 summary.textContent='CHOOSE WHICH SETTINGS TO BACK UP OR RESTORE';
 const selections=new Map();
 for(const [kind,label,help] of entries){
  const row=document.createElement('label');row.className='setup-passport-choice';
  const box=document.createElement('input');box.type='checkbox';box.checked=true;
  const info=document.createElement('span');const strong=document.createElement('strong');strong.textContent=label;
  const small=document.createElement('small');small.textContent=help;
  info.append(strong,small);row.append(box,info);selections.set(kind,box);section.append(row);
 }
 const status=document.createElement('p');status.className='setup-passport-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const preview=document.createElement('section');preview.className='setup-passport-preview';
 preview.hidden=true;preview.setAttribute('aria-label','Validated device settings replacement preview');
 const previewTitle=document.createElement('strong');
 previewTitle.textContent='PREVIEW · THESE CATEGORIES MAY CHANGE';
 const previewList=document.createElement('ul');
 preview.append(previewTitle,previewList);
 const buttonsRow=document.createElement('div');buttonsRow.className='setup-passport-actions';
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Export safe .json';
 const choose=document.createElement('button');choose.type='button';choose.textContent='↑ Select .json';
 const apply=document.createElement('button');apply.type='button';apply.className='primary';
 apply.textContent='Replace selected & reload';apply.disabled=true;
 const close=document.createElement('button');close.type='button';close.textContent='Done';
 buttonsRow.append(exportButton,choose,apply,close);
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 dialog.append(heading,intro,summary,section,preview,status,buttonsRow,file);
 document.body.append(dialog);
 let pending=null,opener=null,selectionStamp=0,baseline=null;
 function snapshot(kind){
  if(kind==='keyboard')return JSON.stringify(settings.keys);
  const row=entries.find(x=>x[0]===kind);
  return localStorage.getItem(row[3]);
 }
 function previewParts(parsed){
  previewList.replaceChildren();
  baseline=new Map();
  for(const [kind,label] of entries){
   if(!Object.hasOwn(parsed,kind))continue;
   // The source file is schema-validated already; inspect only the actual
   // selected category, never the complete (account-bearing) app settings.
   const line=document.createElement('li');
   let result='Saved controls unavailable on this device';
   try{
    baseline.set(kind,snapshot(kind));
    const existing=current([kind])[kind];
    result=JSON.stringify(existing)===JSON.stringify(parsed[kind])?
     'Already matches the saved setup':'Will replace this category on this device';
   }catch{baseline.set(kind,null);}
   line.textContent=label+' · '+result;
   previewList.append(line);
  }
  preview.hidden=false;
 }
 // A user setting restore reloads this page and destroys every in-flight
 // WebSocket, WebRTC, native room-recovery timer and local game engine.
 // Hidden UI never constitutes consent to discard a human or solo session.
 function importBlocker(){
  if(typeof serverLink!=='undefined'&&serverLink)
   return 'Leave or cancel the active online room, join or human search first.';
  if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
   return 'Choose Stop reconnecting in your original room before restoring.';
  if(typeof peerConnected!=='undefined'&&peerConnected||
     typeof peer!=='undefined'&&peer)
   return 'Disconnect the current direct-peer match or handshake first.';
  if(typeof replay!=='undefined'&&replay)
   return 'Close your replay before changing device controls.';
  if(typeof started!=='undefined'&&started)
   return 'Finish and stop your current local match before restoring controls.';
  if(document.getElementById('matchView')?.hidden===false)
   return 'Return to Home and leave active play before restoring controls.';
  if(document.getElementById('joinScreen')?.hidden===false)
   return 'Finish or close the current room invitation before restoring.';
  if(document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])'))
   return 'Cancel the human matchmaking queue or ready check first.';
  return '';
 }
 for(const btn of buttons)btn.addEventListener('click',event=>{
  opener=event.currentTarget;selectionStamp++;pending=null;baseline=null;
  apply.disabled=true;preview.hidden=true;previewList.replaceChildren();
  section.hidden=false;
  for(const [,box] of selections){box.checked=true;box.parentElement.hidden=false;}
  status.textContent='Select a private backup category, or open a setup file to preview it before restoring.';
  dialog.showModal();
 });
 function exit(){if(dialog.open)dialog.close();}
 dialog.addEventListener('close',()=>{
  selectionStamp++;pending=null;baseline=null;apply.disabled=true;
  opener?.focus();opener=null;
 });
 close.onclick=exit;
 exportButton.onclick=()=>{
  const kinds=entries.filter(([kind])=>selections.get(kind).checked&&
   !selections.get(kind).parentElement.hidden).map(([kind])=>kind);
  if(!kinds.length){status.textContent='Choose at least one control category to back up.';return;}
  let payload;
  try{payload=JSON.stringify({format:FORMAT,version:VERSION,
   exportedAt:new Date().toISOString(),parts:current(kinds)},null,2);}
  catch(error){status.textContent='Cannot export device settings: '+error.message;return;}
  if(new Blob([payload]).size>MAX_BYTES){status.textContent='Setup exceeds 24 KiB export limit.';return;}
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fuckball-player-setup.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Exported '+kinds.length+
   ' selected control categories privately. No account credentials or network upload.';
 };
 choose.onclick=()=>{
  selectionStamp++;pending=null;baseline=null;preview.hidden=true;
  apply.disabled=true;file.value='';file.click();
 };
 file.addEventListener('change',async()=>{
  const stamp=++selectionStamp;
  pending=null;baseline=null;apply.disabled=true;preview.hidden=true;section.hidden=true;
  const selectedFile=file.files?.[0];if(!selectedFile)return;
  if(selectedFile.size>MAX_BYTES){status.textContent='Setup file exceeds 24 KiB.';return;}
  try{
   const text=await selectedFile.text();
   if(stamp!==selectionStamp||!dialog.open)return;
   const parsed=parse(JSON.parse(text));
   previewParts(parsed);
   pending=parsed;
   for(const [kind,box] of selections){
    box.parentElement.hidden=!Object.hasOwn(parsed,kind);
    box.checked=Object.hasOwn(parsed,kind);
   }
   section.hidden=false;
   status.textContent='Validated '+Object.keys(parsed).length+
    ' categories. Review the preview and choose what to replace; no settings changed.';
   apply.disabled=false;
  }catch(error){
   if(stamp===selectionStamp&&dialog.open)
    status.textContent='Import rejected: '+(error.message||'Invalid setup file');
  }
 });
 apply.onclick=()=>{
  if(!pending)return;
  const blocked=importBlocker();
  if(blocked){
   status.textContent='Device setup not changed: '+blocked;
   return;
  }
  const chosen=entries.filter(([kind])=>pending[kind]&&selections.get(kind).checked);
  if(!chosen.length){status.textContent='Select at least one category to restore.';return;}
  // Import data was previewed earlier. If another tab or menu changed an
  // affected control in the meantime, never clobber that new live preference.
  function previewUnchanged(){
   if(!baseline)return false;
   try{return chosen.every(([kind])=>baseline.has(kind)&&
     baseline.get(kind)===snapshot(kind));}
   catch{return false;}
  }
  if(!previewUnchanged()){
   status.textContent='A selected control layout changed since preview. Re-select the file to review the latest device settings.';
   return;
  }
  const types=chosen.map(([,label])=>label).join(', ');
  if(!window.confirm('Replace '+types+' on this device, then reload Fuckball? Your existing account stays signed in.'))return;
  // The native confirmation can remain open while another browser tab writes.
  if(!previewUnchanged()){
   status.textContent='Your existing controls changed during confirmation. Re-select the setup file before replacing them.';
   return;
  }
  const afterConfirm=importBlocker();
  if(afterConfirm){status.textContent='Setup kept unchanged: '+afterConfirm;return;}
  const backups=new Map(),olderKeys=JSON.parse(JSON.stringify(settings.keys));
  try{
   for(const [kind,,,key] of chosen){
    if(key){backups.set(key,localStorage.getItem(key));localStorage.setItem(key,JSON.stringify(pending[kind]));}
   }
   if(chosen.some(([kind])=>kind==='keyboard')){
    settings.keys=pending.keyboard;savePrefs();
    const stored=JSON.parse(localStorage.getItem('fuckball.settings')||'null');
    if(JSON.stringify(stored?.keys)!==JSON.stringify(pending.keyboard))
     throw Error('Current keyboard bindings could not be saved.');
   }
   for(const [kind,,,key] of chosen)if(key&&localStorage.getItem(key)!==JSON.stringify(pending[kind]))
    throw Error('Storage did not preserve '+kind+'.');
   status.textContent='Selected settings restored; reloading to activate the original controls.';
   // Reload immediately after a committed transaction, avoiding a window in
   // which a player might launch with half of the old/new input mappings.
   location.reload();
  }catch(error){
   settings.keys=olderKeys;savePrefs();
   for(const [key,value] of backups){
    try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}
   }
   status.textContent='Could not complete restore; previous device settings were kept where possible. '+error.message;
  }
 };
})();
