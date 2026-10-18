'use strict';
// Device-local host presets for Custom Rooms. No online permissions are inferred
// from the UI: the server rechecks every configuration mutation.
(function(){
 const pane=$('menuMatchPane');
 if(!pane)return;
 const KEY='fuckball.custom-room-presets.v1',LIMIT=8,MAX_MAP=65536;
 const section=document.createElement('section');section.className='room-presets';
 section.setAttribute('aria-label','Saved Custom Room presets');
 const heading=document.createElement('div');heading.className='room-presets-heading';
 const title=document.createElement('strong');title.textContent='ROOM PRESETS.';
 const subtitle=document.createElement('span');subtitle.textContent='SAVED ON THIS DEVICE';
 heading.append(title,subtitle);
 const help=document.createElement('p');help.textContent='Save a favorite stadium, team mode and game limits. Only the host can apply presets to an online room.';
 const status=document.createElement('p');status.className='room-presets-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const create=document.createElement('form');create.className='room-presets-save';
 const name=document.createElement('input');name.type='text';name.maxLength=36;
 name.placeholder='Preset name (e.g. Club 4v4)';name.autocomplete='off';
 name.setAttribute('aria-label','New room preset name');name.required=true;
 const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Save current room';
 create.append(name,save);
 const list=document.createElement('div');list.className='room-presets-list';
 section.append(heading,help,create,status,list);
 pane.append(section);
 const control=id=>$(id);
 const allowed=['bot','2v2','4v4'];
 function read(){
  let raw;
  try{raw=localStorage.getItem(KEY);}catch{throw Error('Local preset storage is unavailable.');}
  if(!raw)return[];
  let result;try{result=JSON.parse(raw);}catch{throw Error('Stored room presets are invalid.');}
  if(!Array.isArray(result)||result.length>LIMIT)throw Error('Stored room presets are invalid.');
  if(result.some(x=>!x||typeof x.name!=='string'||x.name.length<1||x.name.length>36||
   typeof x.id!=='string'||!/^[a-f0-9]{16}$/.test(x.id)||
   !allowed.includes(x.mode)||!Number.isInteger(x.scoreLimit)||x.scoreLimit<0||x.scoreLimit>99||
   !Number.isInteger(x.timeLimit)||x.timeLimit<0||x.timeLimit>99||
   typeof x.stadium!=='string'||x.stadium.length<1||x.stadium.length>MAX_MAP))
   throw Error('Stored room presets are invalid.');
  return result;
 }
 function write(items){
  try{localStorage.setItem(KEY,JSON.stringify(items));}
  catch{throw Error('Could not save presets on this device.');}
 }
 const hostAllowed=()=>!replay&&(!serverLink||serverLink.isOwner&&!serverLink.quickMatchMode);
 const message=text=>status.textContent=text;
 function capture(){
  const mode=control('mode').value;
  const scoreLimit=Number(control('scoreLimit').value),timeLimit=Number(control('timeLimit').value);
  if(!allowed.includes(mode)||![scoreLimit,timeLimit].every(x=>Number.isInteger(x)&&x>=0&&x<=99))
   throw Error('Choose valid room settings before saving.');
  const map=Utils.exportStadium(stadium);
  if(typeof map!=='string'||map.length>MAX_MAP)throw Error('This custom stadium exceeds the 64 KB preset limit.');
  // Parsing the map before persistence avoids storing unapplicable configurations.
  if(!Utils.parseStadium(map))throw Error('The current stadium could not be saved.');
  return{mode,scoreLimit,timeLimit,stadium:map};
 }
 function apply(preset){
  if(!hostAllowed()){message('Only the host can change Custom Room settings.');return;}
  if(serverLink?.room&&started&&!confirm('Applying a room preset restarts the current match. Continue?'))return;
  try{
   const checked=Utils.parseStadium(preset.stadium);
   if(!checked)throw Error('Preset stadium is incompatible.');
   control('mode').value=preset.mode;
   control('scoreLimit').value=String(preset.scoreLimit);
   control('timeLimit').value=String(preset.timeLimit);
   settings.timeLimit=preset.timeLimit;savePrefs();rosterPreset='';
   // applyMap performs the existing approved native configure/reset path.
   // The server still validates permissions and stadium before resetting.
   applyMap(preset.stadium);
   message('Applied '+preset.name+' · '+preset.mode+' · '+preset.scoreLimit+' goals · '+preset.timeLimit+' min.');
  }catch(e){message(e.message||'Could not apply room preset.');}
 }
 function render(){
  const writable=hostAllowed(),items=read();
  create.hidden=!writable;
  list.replaceChildren();
  if(!items.length){
   const empty=document.createElement('p');empty.className='room-presets-empty';
   empty.textContent='No presets on this device yet. Save your current room configuration to create one.';
   list.append(empty);
  }
  for(const preset of items){
   const row=document.createElement('article');row.className='room-presets-entry';
   const details=document.createElement('div');details.className='room-presets-details';
   const strong=document.createElement('strong');strong.textContent=preset.name;
   const small=document.createElement('small');small.textContent=
    preset.mode+' · '+preset.scoreLimit+' goals · '+preset.timeLimit+' minutes';
   details.append(strong,small);
   const buttons=document.createElement('div');buttons.className='room-presets-buttons';
   const use=document.createElement('button');use.type='button';use.textContent='Use preset';
   use.className='primary';use.disabled=!writable;use.onclick=()=>apply(preset);
   const del=document.createElement('button');del.type='button';del.textContent='Delete';
   del.className='room-presets-delete';
   del.onclick=()=>{
    if(!confirm('Delete the saved '+preset.name+' room preset from this browser?'))return;
    try{write(read().filter(x=>x.id!==preset.id));render();message('Preset deleted.');}
    catch(e){message(e.message||'Unable to delete preset.');}
   };
   buttons.append(use,del);row.append(details,buttons);list.append(row);
  }
 }
 create.onsubmit=e=>{
  e.preventDefault();
  if(!hostAllowed()){message('Only the room host can save the current room settings.');return;}
  const title=name.value.trim().replace(/\s+/g,' ');
  if(!title||title.length>36){message('Enter a preset name up to 36 characters.');return;}
  try{
   const current=read(),settings=capture();
   const existing=current.find(x=>x.name.toLowerCase()===title.toLowerCase());
   if(existing){
    if(!confirm('Replace the saved preset '+existing.name+'?'))return;
    Object.assign(existing,settings,{name:title});
   }else{
    if(current.length>=LIMIT)throw Error('You can save up to eight presets. Delete one first.');
    const bytes=crypto.getRandomValues(new Uint8Array(8));
    const id=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    current.push({id,name:title,...settings});
   }
   write(current);name.value='';render();message('Saved '+title+' on this device.');
  }catch(err){message(err.message||'Preset could not be saved.');}
 };
 window.renderRoomPresets=()=>{
  try{render();}catch(e){list.replaceChildren();message(e.message||'Preset storage unavailable.');}
 };
 window.renderRoomPresets();
})();
