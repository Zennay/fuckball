'use strict';
// Player-owned mobile controls. Layout changes never alter native 60 Hz physics
// or the existing joystick/kick pointer events.
(function(){
 const controls=document.querySelector('.touch-controls');
 const pane=document.querySelector('#menuVideoPane .rm-form');
 if(!controls||!pane)return;
 const KEY='fuckball.touch-controls.v1';
 const defaults=Object.freeze({hand:'right',scale:1,deadzone:10,edge:20,lift:0,opacity:85});
 const config={...defaults};
 // Only a meaningful hit-target/axis change invalidates an already held
 // finger. Cosmetic opacity changes and duplicate viewport resize events
 // must never resend neutral input to a live human game.
 let appliedInputGeometry=null;
 const fields=['hand','scale','deadzone','edge','lift','opacity'];
 function valid(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid touch layout.');
  const next={...defaults};
  if(value.hand!==undefined){
   if(!['right','left'].includes(value.hand))throw Error('Unsupported hand preference.');
   next.hand=value.hand;
  }
  const bounds={scale:[.75,1.5],deadzone:[4,24],edge:[8,72],lift:[0,140],opacity:[40,100]};
  for(const [key,[min,max]] of Object.entries(bounds)){
   if(value[key]===undefined)continue;
   if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<min||value[key]>max)
    throw Error('Invalid '+key+' setting.');
   if(key!=='scale'&&!Number.isInteger(value[key]))throw Error('Invalid '+key+' value.');
   next[key]=value[key];
  }
  return next;
 }
 try{Object.assign(config,valid(JSON.parse(localStorage.getItem(KEY)||'null')||{}));}catch{}
 // The input handler reads scale and deadzone from this same object.
 window.touchControlSettings=config;
 const section=document.createElement('section');
 section.className='touch-settings';
 section.setAttribute('aria-label','Touch Layout Studio');
 const title=document.createElement('h3');title.textContent='TOUCH LAYOUT STUDIO.';
 const intro=document.createElement('p');
 intro.textContent='Make joystick and Kick comfortable for your thumbs. Changes preview immediately, stay on this device and never change movement speed, kick strength or online rules.';
 const presets=document.createElement('div');presets.className='touch-layout-presets';
 const presetOptions=[
  ['Balanced',{scale:1,deadzone:10,edge:20,lift:0,opacity:85}],
  ['Thumb reach',{scale:1.2,deadzone:12,edge:12,lift:48,opacity:95}],
  ['Compact',{scale:.85,deadzone:8,edge:35,lift:8,opacity:65}]
 ];
 const preview=document.createElement('div');preview.className='touch-layout-preview';
 preview.setAttribute('aria-hidden','true');
 const field=document.createElement('div');field.className='touch-layout-field';
 const move=document.createElement('span');move.className='touch-layout-move';move.textContent='MOVE';
 const kick=document.createElement('span');kick.className='touch-layout-kick';kick.textContent='KICK';
 field.append(move,kick);preview.append(field);
 const previewCaption=document.createElement('p');previewCaption.className='touch-layout-preview-caption';
 previewCaption.textContent='Preview of thumb placement · not an active game input';
 const grid=document.createElement('div');grid.className='touch-settings-grid';
 const handLabel=document.createElement('label');handLabel.className='touch-settings-check';
 const hand=document.createElement('input');hand.type='checkbox';
 hand.setAttribute('aria-label','Kick on the left side');
 const handText=document.createElement('span');handText.textContent='Left-handed · Kick on left';
 handLabel.append(hand,handText);grid.append(handLabel);
 function slider(label,key,min,max,step,unit){
  const row=document.createElement('label');row.textContent=label;
  const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;
  input.setAttribute('aria-label',label);
  const value=document.createElement('output');input.setAttribute('aria-describedby','touchValue'+key);
  value.id='touchValue'+key;row.append(input,value);grid.append(row);
  input.addEventListener('input',()=>{
   config[key]=key==='scale'?Math.round(Number(input.value)*20)/20:Number(input.value);
   apply();persist();
  });
  return {input,value,unit};
 }
 const size=slider('Control size','scale',.75,1.5,.05,'%');
 const zone=slider('Joystick deadzone','deadzone',4,24,2,'px');
 const edge=slider('Thumb distance from edges','edge',8,72,2,'px');
 const lift=slider('Lift controls above the bottom','lift',0,140,10,'px');
 const opacity=slider('Control visibility','opacity',40,100,5,'%');
 const status=document.createElement('p');status.className='touch-settings-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=document.createElement('div');actions.className='touch-settings-actions';
 function button(label,callback,parent=actions){
  const el=document.createElement('button');el.type='button';el.textContent=label;el.addEventListener('click',callback);
  parent.append(el);return el;
 }
 function persist(){
  try{localStorage.setItem(KEY,JSON.stringify(config));return true;}
  catch{status.textContent='Layout applied for this visit; browser storage unavailable.';return false;}
 }
 function boundedPlacement(){
  // The visible viewport may be much narrower than window.innerWidth when
  // browser zoom, split-screen or software chrome is active. Account for
  // BOTH thumbs, safe outer edges, and the actual flex padding/gap.
  const viewport=window.visualViewport;
  const width=Math.max(180,Math.min(window.innerWidth||320,
   Number.isFinite(viewport?.width)&&viewport.width>0?viewport.width:Infinity));
  const height=Math.max(120,Math.min(window.innerHeight||480,
   Number.isFinite(viewport?.height)&&viewport.height>0?viewport.height:Infinity));
  const reserved=40; // maximum 2×16px padding + 8px flex gap
  const minSize=.75*(88+72);
  const edge=Math.min(config.edge,Math.max(8,
   Math.floor((width-minSize-reserved)/2)));
  // Landscape phones have less room above the bottom browser/safe-area bar.
  // Keep BOTH thumbs below the score HUD without changing the native
  // joystick radius, kick strength, or the player's saved preference.
  const bottomReserved=64,topReserved=54;
  const heightScale=(height-bottomReserved-topReserved)/88;
  const actualScale=Math.min(config.scale,Math.max(.75,Math.min(
   (width-2*edge-reserved)/(88+72),heightScale)));
  const maxInset=Math.max(8,Math.floor(
   (width-(88+72)*actualScale-reserved)/2));
  const maxLift=Math.max(0,Math.floor(
   height-bottomReserved-topReserved-88*actualScale));
  return {scale:actualScale,edge:Math.min(edge,maxInset),
   lift:Math.min(config.lift,maxLift),width,height};
 }
 function apply(){
  const placed=boundedPlacement();
  controls.classList.toggle('fb-touch-left',config.hand==='left');
  controls.style.setProperty('--fb-touch-pad',Math.round(88*placed.scale)+'px');
  controls.style.setProperty('--fb-touch-stick',Math.round(38*placed.scale)+'px');
  controls.style.setProperty('--fb-touch-kick',Math.round(72*placed.scale)+'px');
  controls.style.setProperty('--fb-touch-edge',placed.edge+'px');
  controls.style.setProperty('--fb-touch-lift',placed.lift+'px');
  controls.style.setProperty('--fb-touch-opacity',String(config.opacity/100));
  // Share the *effective* size with the joystick handler, which uses this
  // exact value for its deadzone and travel radius.
  window.touchControlSettings={...config,scale:placed.scale};
  hand.checked=config.hand==='left';
  for(const [control,key,format] of [
   [size,'scale',v=>Math.round(v*100)+'%'],
   [zone,'deadzone',v=>v+' px'],
   [edge,'edge',v=>v+' px'+(placed.edge!==v?' · fits at '+placed.edge+' px':'')],
   [lift,'lift',v=>v+' px'],
   [opacity,'opacity',v=>v+'%']
  ]){control.input.value=String(config[key]);control.value.textContent=format(config[key]);}
  field.classList.toggle('touch-preview-left',config.hand==='left');
  field.style.setProperty('--preview-edge',Math.max(4,placed.edge/3)+'px');
  field.style.setProperty('--preview-lift',Math.round(placed.lift/3)+'px');
  field.style.setProperty('--preview-scale',String(placed.scale));
  field.style.setProperty('--preview-opacity',String(config.opacity/100));
  status.textContent=(config.hand==='left'?'Kick left':'Kick right')+' · '+Math.round(placed.scale*100)+
   '% controls'+(placed.scale<config.scale?' (size fitted to screen)':'')+
   (placed.lift<config.lift?' · lift fitted to '+placed.lift+'px':'')+
   ' · '+config.deadzone+' px deadzone · device only';
  // A layout applied twice by window.resize AND visualViewport.resize must
  // release a held touch at most once. Opacity-only edits are purely visual.
  const geometry=[config.hand,placed.scale,placed.edge,placed.lift,
   config.deadzone].join(':');
  if(geometry!==appliedInputGeometry){
   appliedInputGeometry=geometry;
   if(typeof window.CustomEvent==='function'&&typeof window.dispatchEvent==='function')
    window.dispatchEvent(new window.CustomEvent('fuckball:touch-layout-applied'));
  }
 }
 hand.addEventListener('change',()=>{config.hand=hand.checked?'left':'right';apply();persist();});
 for(const [name,settings] of presetOptions)
  button(name,()=>{Object.assign(config,settings);apply();persist();status.textContent=name+' preset applied.';},presets);
 button('Restore defaults',()=>{
  if(!window.confirm('Restore the default touch layout on this device?'))return;
  Object.assign(config,defaults);apply();persist();
  status.textContent='Default touch layout restored.';
 });
 button('Export layout .json',()=>{
  const payload=JSON.stringify({format:'fuckball-touch-layout',version:1,layout:config},null,2);
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fuckball-touch-layout.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Exported locally. No server upload.';
 });
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
 button('Import layout .json',()=>{input.value='';input.click();});
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file)return;
  if(file.size>4096){status.textContent='Layout file exceeds 4 KB.';return;}
  try{
   const data=JSON.parse(await file.text());
   if(!data||data.format!=='fuckball-touch-layout'||data.version!==1||
      !data.layout||fields.some(key=>!Object.hasOwn(data.layout,key)))
    throw Error('Unsupported touch layout file.');
   if(Object.keys(data.layout).some(key=>!fields.includes(key)))
    throw Error('Unknown touch layout setting.');
   const next=valid(data.layout);
   if(!window.confirm('Replace the current touch layout with this imported profile?'))return;
   Object.assign(config,next);apply();persist();
   status.textContent='Imported touch layout applied on this device.';
  }catch(error){status.textContent=error.message||'Could not open layout file.';}
 });
 actions.append(input);
 section.append(title,intro,presets,preview,previewCaption,grid,actions,status);
 pane.append(section);
 window.addEventListener('resize',apply,{passive:true});
 window.visualViewport?.addEventListener?.('resize',apply,{passive:true});
 apply();
})();