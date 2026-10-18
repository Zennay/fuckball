'use strict';
// Local-only mobile input ergonomics: never changes the approved native
// physics, player speed, kick strength, or transmitted input format.
(function(){
 const controls=document.querySelector('.touch-controls');
 const pane=document.querySelector('#menuVideoPane .rm-form');
 if(!controls||!pane)return;
 const KEY='fuckball.touch-controls.v1';
 const defaults={hand:'right',scale:1,deadzone:10};
 const config={...defaults};
 try{
  const stored=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(['right','left'].includes(stored.hand))config.hand=stored.hand;
  if(Number.isFinite(stored.scale)&&stored.scale>=.75&&stored.scale<=1.5)
   config.scale=Math.round(stored.scale*20)/20;
  if(Number.isSafeInteger(stored.deadzone)&&stored.deadzone>=4&&stored.deadzone<=24)
   config.deadzone=stored.deadzone;
 }catch{}
 window.touchControlSettings=config;
 const section=document.createElement('section');section.className='touch-settings';
 section.setAttribute('aria-label','Mobile touch controls');
 const header=document.createElement('h3');header.textContent='TOUCH CONTROLS.';
 const info=document.createElement('p');
 info.textContent='Move the joystick and Kick button to the most comfortable side, adjust their size and choose how far to push before movement starts. Changes stay on this device.';
 const grid=document.createElement('div');grid.className='touch-settings-grid';
 const leftLabel=document.createElement('label');leftLabel.className='touch-settings-check';
 const hand=document.createElement('input');hand.type='checkbox';
 const handText=document.createElement('span');handText.textContent='Left-handed: Kick on the left';
 leftLabel.append(hand,handText);
 const sizeLabel=document.createElement('label');sizeLabel.textContent='Control size';
 const size=document.createElement('input');size.type='range';
 size.min='.75';size.max='1.5';size.step='.05';size.setAttribute('aria-label','Touch controls size');
 const sizeValue=document.createElement('output');sizeLabel.append(size,sizeValue);
 const deadLabel=document.createElement('label');deadLabel.textContent='Joystick deadzone';
 const deadzone=document.createElement('input');deadzone.type='range';
 deadzone.min='4';deadzone.max='24';deadzone.step='2';
 deadzone.setAttribute('aria-label','Joystick deadzone in pixels');
 const deadValue=document.createElement('output');deadLabel.append(deadzone,deadValue);
 grid.append(leftLabel,sizeLabel,deadLabel);
 const reset=document.createElement('button');reset.type='button';reset.textContent='Reset touch layout';
 reset.className='touch-settings-reset';
 const status=document.createElement('p');status.className='touch-settings-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 section.append(header,info,grid,reset,status);pane.append(section);
 function apply(){
  const scale=config.scale;
  controls.classList.toggle('fb-touch-left',config.hand==='left');
  controls.style.setProperty('--fb-touch-pad',Math.round(88*scale)+'px');
  controls.style.setProperty('--fb-touch-stick',Math.round(38*scale)+'px');
  controls.style.setProperty('--fb-touch-kick',Math.round(72*scale)+'px');
  hand.checked=config.hand==='left';
  size.value=String(scale);sizeValue.textContent=Math.round(scale*100)+'%';
  deadzone.value=String(config.deadzone);
  deadValue.textContent=config.deadzone+' px ('+Math.round(config.deadzone*scale)+' scaled)';
  status.textContent=(config.hand==='left'?'Kick left · joystick right':'Joystick left · Kick right')+
   ' · local touch settings only.';
 }
 function save(){
  try{localStorage.setItem(KEY,JSON.stringify(config));}
  catch{status.textContent='Settings applied until this page closes; browser storage unavailable.';}
 }
 hand.onchange=()=>{config.hand=hand.checked?'left':'right';apply();save();};
 size.oninput=()=>{config.scale=Math.round(Number(size.value)*20)/20;apply();save();};
 deadzone.oninput=()=>{config.deadzone=Number(deadzone.value);apply();save();};
 reset.onclick=()=>{
  Object.assign(config,defaults);apply();save();
  status.textContent='Default touch layout restored on this device.';
 };
 apply();
})();
