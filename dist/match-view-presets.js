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
  {id:'balanced',title:'BALANCED',description:'Original native rendering, full stadium view and normal HUD.',quality:'native',fps:'0',camera:'stadium',zoom:'1',sound:true,focus:'standard',chat:false},
  {id:'performance',title:'PERFORMANCE',description:'Lightweight 70% rendering, 60 FPS cap, full-pitch camera, distraction-reduced HUD.',quality:'performance',fps:'60',camera:'stadium',zoom:'1',sound:true,focus:'focus',chat:false},
  {id:'quiet',title:'QUIET PITCH',description:'Focused UI, local pitch-chat text hidden and sound effects off. No one is muted on the server.',quality:'native',fps:'0',camera:'stadium',zoom:'1',sound:false,focus:'focus',chat:true},
  {id:'contrast',title:'HIGH VISIBILITY',description:'High-contrast local HUD and menus; gameplay stays unchanged.',quality:'native',fps:'0',camera:'stadium',zoom:'1',sound:true,focus:'contrast',chat:false},
  {id:'spectator',title:'SPECTATOR VIEW',description:'Wide full-pitch view and clear native-resolution scoreboard; spectator permissions unchanged.',quality:'native',fps:'0',camera:'stadium',zoom:'0.95',sound:true,focus:'contrast',chat:false}
 ];
 const section=el('section',null,'match-view-presets');
 section.setAttribute('aria-label','Apply a complete local match view preset');
 section.append(el('h3','MATCH VIEW PRESETS.'));
 section.append(el('p','Switch several existing local visual and audio options in one click. Everything is reversible; physics, netcode, opponent visibility, gamepad controls and server chat rights are unchanged.'));
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
 let undo=null;
 const valid=choice=>['native','performance'].includes(choice.quality)&&
  ['0','60','120','144','165','240','360','480','1000','-1'].includes(choice.fps)&&
  ['stadium','follow'].includes(choice.camera)&&Number.isFinite(Number(choice.zoom))&&
  Number(choice.zoom)>=.6&&Number(choice.zoom)<=2&&
  typeof choice.sound==='boolean'&&['standard','focus','contrast'].includes(choice.focus)&&
  typeof choice.chat==='boolean';
 function apply(choice,withUndo){
  const controls=readControls();
  if(!controls||!valid(choice)){
   status.textContent='These native match settings are unavailable. Nothing changed.';return false;
  }
  for(const [key,node]of [['quality',controls.renderQuality],['fps',controls.fpsLimit],
   ['camera',controls.cameraMode],['focus',controls.focus]]){
   if(![...node.options].some(x=>x.value===String(choice[key]))){
    status.textContent='A native match option is unavailable. Nothing changed.';return false;
   }
  }
  const before=capture(controls);
  try{
   // Call existing authoritative client settings handlers; do not update
   // engine state, simulation timing, prediction or the network directly.
   controls.renderQuality.value=choice.quality;controls.renderQuality.dispatchEvent(new Event('change',{bubbles:true}));
   controls.fpsLimit.value=choice.fps;controls.fpsLimit.dispatchEvent(new Event('change',{bubbles:true}));
   controls.cameraMode.value=choice.camera;controls.cameraMode.dispatchEvent(new Event('change',{bubbles:true}));
   controls.matchZoom.value=String(choice.zoom);controls.matchZoom.dispatchEvent(new Event('input',{bubbles:true}));
   controls.matchSound.checked=choice.sound;controls.matchSound.dispatchEvent(new Event('change',{bubbles:true}));
   controls.focus.value=choice.focus;controls.focus.dispatchEvent(new Event('change',{bubbles:true}));
   controls.chat.checked=choice.chat;controls.chat.dispatchEvent(new Event('change',{bubbles:true}));
   if(withUndo){undo=before;restore.hidden=false;}else{undo=null;restore.hidden=true;}
   return true;
  }catch{
   status.textContent='The browser could not apply every local setting. Review the native Settings panel.';
   return false;
  }
 }
 for(const preset of presets){
  const card=el('button',null,'match-view-preset-card');card.type='button';
  card.append(el('strong',preset.title),el('small',preset.description));
  card.onclick=()=>{
   if(apply(preset,true))status.textContent=preset.title+' view applied locally. Undo available until the next preset or navigation.';
  };
  cards.append(card);
 }
 restore.onclick=()=>{
  if(!undo)return;
  const previous=undo;
  if(apply(previous,false))status.textContent='Previous native match view restored.';
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden){undo=null;restore.hidden=true;}});
 window.addEventListener('pagehide',()=>{undo=null;restore.hidden=true;});
})();