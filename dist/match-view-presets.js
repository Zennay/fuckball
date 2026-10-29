'use strict';
// One-click player-side visual configurations through EXISTING settings UI.
// Never change native simulation, online host, latency prediction or controls.
(function(){
 const parent=document.querySelector('#menuVideoPane .rm-form');
 if(!parent)return;
 const el=(tag,text,cls)=>{const x=document.createElement(tag);
  if(text!==undefined)x.textContent=String(text);
  if(cls)x.className=cls;return x;};
 const presets=[
  {id:'balanced',title:'BALANCED',description:'Original native rendering, full pitch and normal HUD. Keeps your sound and chat preferences.',quality:'native',fps:'0',camera:'stadium',zoom:'1',sound:null,focus:'standard',chat:null},
  {id:'performance',title:'PERFORMANCE',description:'70% rendering, 60 FPS cap, wide camera and focused HUD. Keeps your sound and chat.',quality:'performance',fps:'60',camera:'stadium',zoom:'1',sound:null,focus:'focus',chat:null},
  {id:'quiet',title:'QUIET PITCH',description:'Explicitly mute local effects and hide pitch chat while keeping real room chat available.',quality:'native',fps:'0',camera:'stadium',zoom:'1',sound:false,focus:'focus',chat:true},
  {id:'contrast',title:'HIGH VISIBILITY',description:'Higher-contrast local scoreboard and menus. Keeps your sound and pitch chat choices.',quality:'native',fps:'0',camera:'stadium',zoom:'1',sound:null,focus:'contrast',chat:null},
  {id:'spectator',title:'SPECTATOR VIEW',description:'Wide pitch and readable scoreboard without changing server spectator rights or sound/chat.',quality:'native',fps:'0',camera:'stadium',zoom:'0.95',sound:null,focus:'contrast',chat:null}
 ];
 const section=el('section',null,'match-view-presets');
 section.setAttribute('aria-label','Apply a complete local match view preset');
 section.append(el('h3','MATCH VIEW PRESETS.'));
 section.append(el('p','Change your local match view in one click. Only Quiet Pitch changes local sound or hides pitch chat; all other views keep your existing audio and chat choices. Undo is available until you change settings elsewhere. Physics, network, player controls and server chat rights stay unchanged.'));
 const cards=el('div',null,'match-view-presets-grid');
 const status=el('p',null,'match-view-presets-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const restore=el('button','↶ Undo last preset');restore.type='button';restore.hidden=true;
 section.append(cards,restore,status);parent.append(section);
 const ids=['renderQuality','fpsLimit','cameraMode','matchZoom','matchSound'];
 const readControls=()=>{
  const map={};for(const id of ids){map[id]=document.getElementById(id);if(!map[id])return null;}
  map.focus=document.querySelector('[aria-label="Match focus appearance"]');
  map.chat=document.querySelector('.rm-match-focus-check input');
  if(!map.focus||!map.chat)return null;
  return map;
 };
 function capture(controls){
  return{quality:controls.renderQuality.value,fps:controls.fpsLimit.value,
   camera:controls.cameraMode.value,zoom:controls.matchZoom.value,
   sound:controls.matchSound.checked,focus:controls.focus.value,chat:controls.chat.checked};
 }
 let undo=null,undoExpected=null,applying=false;
 const presetButtons=new Map();
 const equal=(a,b)=>!!a&&!!b&&['quality','fps','camera','zoom','sound','focus','chat'].every(k=>String(a[k])===String(b[k]));
 // Null means "inherit the player's current device preferences", not a
 // new audio/chat choice. Quiet Pitch explicitly opts out of both.
 const resolve=(preset,current)=>({...preset,
  sound:preset.sound===null?current.sound:preset.sound,
  chat:preset.chat===null?current.chat:preset.chat
 });
 const valid=choice=>['native','performance'].includes(choice.quality)&&
  ['0','60','120','144','165','240','360','480','1000','-1'].includes(choice.fps)&&
  ['stadium','follow'].includes(choice.camera)&&Number.isFinite(Number(choice.zoom))&&
  Number(choice.zoom)>=.6&&Number(choice.zoom)<=2&&
  typeof choice.sound==='boolean'&&['standard','focus','contrast'].includes(choice.focus)&&
  typeof choice.chat==='boolean';
 function optionsAvailable(choice,controls){
  for(const [key,node] of [['quality',controls.renderQuality],['fps',controls.fpsLimit],
   ['camera',controls.cameraMode],['focus',controls.focus]]){
   if(![...node.options].some(x=>x.value===String(choice[key])))return false;
  }
  const zoom=controls.matchZoom;
  if(zoom.min!==''&&Number(choice.zoom)<Number(zoom.min))return false;
  if(zoom.max!==''&&Number(choice.zoom)>Number(zoom.max))return false;
  return true;
 }
 function clearUndo(){undo=null;undoExpected=null;restore.hidden=true;}
 function syncCards(){
  const controls=readControls(),now=controls?capture(controls):null;
  for(const preset of presets){
   const card=presetButtons.get(preset.id);
   if(!card)continue;
   const choice=controls?resolve(preset,now):null;
   card.disabled=!controls||!optionsAvailable(choice,controls);
   card.setAttribute('aria-pressed',String(equal(now,choice)));
  }
 }
 function writeNative(controls,choice){
  // Every change and rollback goes through the original local settings
  // handlers. Never touch server authority, ball physics or render clocks.
  const changes=[
   [controls.renderQuality,'value','quality','change'],
   [controls.fpsLimit,'value','fps','change'],
   [controls.cameraMode,'value','camera','change'],
   [controls.matchZoom,'value','zoom','input'],
   [controls.matchSound,'checked','sound','change'],
   [controls.focus,'value','focus','change'],
   [controls.chat,'checked','chat','change']
  ];
  for(const [node,property,key,event]of changes){
   const next=key==='zoom'?String(choice[key]):choice[key];
   if(node[property]===next)continue;
   node[property]=next;
   node.dispatchEvent(new Event(event,{bubbles:true}));
  }
 }
 function apply(preset,withUndo){
  const controls=readControls();
  const before=controls?capture(controls):null;
  const choice=before?resolve(preset,before):null;
  if(!controls||!valid(choice)||!optionsAvailable(choice,controls)){
   status.textContent='A required native match option is unavailable. Nothing changed.';
   syncCards();return false;
  }
  applying=true;
  try{
   writeNative(controls,choice);
   if(!equal(capture(controls),choice))throw Error('Native option did not apply.');
   if(withUndo){undo=before;undoExpected=capture(controls);restore.hidden=false;}
   else clearUndo();
   syncCards();return true;
  }catch{
   // This is a transaction, not seven independent half-applied preferences.
   // Roll back through the same native handlers if even one step rejects.
   try{
    writeNative(controls,before);
    if(!equal(capture(controls),before))throw Error('Rollback incomplete.');
    status.textContent='Preset failed; previous match settings were restored.';
   }catch{
    status.textContent='Preset partly failed and previous settings could not be fully restored. Check the native Video settings.';
   }
   clearUndo();syncCards();return false;
  }finally{applying=false;}
 }
 for(const preset of presets){
  const card=el('button',null,'match-view-preset-card');card.type='button';
  card.setAttribute('aria-pressed','false');
  card.append(el('strong',preset.title),el('small',preset.description),
   el('em',preset.id==='quiet'?'Also changes local sound and pitch-chat visibility.':
     'Preserves your current sound and chat choices.'));
  presetButtons.set(preset.id,card);
  card.onclick=()=>{
   if(apply(preset,true))status.textContent=preset.title+' view applied. Undo remains available while these settings are unchanged.';
  };
  cards.append(card);
 }
 restore.onclick=()=>{
  if(!undo)return;
  const controls=readControls();
  if(!controls||!equal(capture(controls),undoExpected)){
   clearUndo();syncCards();
   status.textContent='View settings changed since the preset. Undo was cancelled to keep your newer choices.';
   return;
  }
  if(apply(undo,false))status.textContent='Previous native match view restored.';
 };
 // Any manual native settings change makes an earlier undo unsafe.
 // Do not overwrite the user's newer accessibility or performance choices.
 const controls=readControls();
 if(controls){
  const changed=()=>{
   if(applying)return;
   if(undo&&!equal(capture(controls),undoExpected)){
    clearUndo();
    status.textContent='Match settings changed manually. Previous preset undo is no longer available.';
   }
   syncCards();
  };
  for(const node of [controls.renderQuality,controls.fpsLimit,controls.cameraMode,
   controls.matchZoom,controls.matchSound,controls.focus,controls.chat]){
   node.addEventListener('change',changed);
   if(node===controls.matchZoom)node.addEventListener('input',changed);
  }
 }
 syncCards();
 // A second tab may change native settings while this window is idle.
 // Never let an older one-click Undo silently undo newer preferences.
 window.addEventListener('storage',event=>{
  if(event.key!=='fuckball.settings'&&event.key!==null)return;
  if(undo){
   clearUndo();
   status.textContent='Another tab updated your match settings. Previous preset Undo was cancelled.';
  }
  syncCards();
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearUndo();});
 window.addEventListener('pagehide',clearUndo);
})();