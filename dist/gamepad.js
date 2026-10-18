'use strict';
// Native browser Gamepad API: one local controller drives the same approved
// keyboard/touch input path. No new wire messages or physics changes.
(function(){
 const settingsPanel=document.querySelector('#menuVideoPane .rm-form');
 if(!settingsPanel)return;
 const info=document.createElement('div');info.className='gamepad-status';
 info.setAttribute('role','status');info.setAttribute('aria-live','polite');
 const title=document.createElement('strong');title.textContent='GAMEPAD';
 const label=document.createElement('span');
 label.textContent='Connect a controller · left stick / D-pad to move · A/X/RT to kick · Start for menu.';
 const options=document.createElement('div');options.className='gamepad-preferences';
 const kickLabel=document.createElement('label');kickLabel.textContent='Kick buttons';
 const kickSelect=document.createElement('select');kickSelect.setAttribute('aria-label','Gamepad kick button mapping');
 for(const [value,name] of [
  ['default','A / X / right trigger'],['face','Any face button (A/B/X/Y)'],
  ['trigger','Right trigger only'],['shoulder','Right shoulder / trigger']
 ])kickSelect.add(new Option(name,value));
 kickLabel.append(kickSelect);
 const deadzoneLabel=document.createElement('label');deadzoneLabel.textContent='Stick deadzone';
 const deadzoneValue=document.createElement('output');
 const deadzone=document.createElement('input');deadzone.type='range';
 deadzone.min='.15';deadzone.max='.65';deadzone.step='.05';
 deadzone.setAttribute('aria-label','Controller stick deadzone');
 deadzoneLabel.append(deadzone,deadzoneValue);
 options.append(kickLabel,deadzoneLabel);
 info.append(title,label,options);settingsPanel.append(info);
 const KEY='fuckball.gamepad.v1';
 let preferences={kick:'default',deadzone:.30};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(['default','face','trigger','shoulder'].includes(saved.kick))preferences.kick=saved.kick;
  if(Number.isFinite(saved.deadzone)&&saved.deadzone>=.15&&saved.deadzone<=.65)
   preferences.deadzone=saved.deadzone;
 }catch{}
 kickSelect.value=preferences.kick;
 deadzone.value=String(preferences.deadzone);
 deadzoneValue.textContent=Math.round(preferences.deadzone*100)+'%';
 function save(){
  try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}
 }
 kickSelect.onchange=()=>{preferences.kick=kickSelect.value;save();};
 deadzone.oninput=()=>{
  preferences.deadzone=Number(deadzone.value);
  deadzoneValue.textContent=Math.round(preferences.deadzone*100)+'%';
  save();
 };
 const neutral=()=>({x:0,y:0,kick:false});
 let active=null,lastSignature='',wasStart=false,connected='';
 const isHeld=(pad,index)=>pad.buttons?.[index]?.pressed===true||
  (Number(pad.buttons?.[index]?.value)||0)>.6;
 const magnitude=axis=>Number.isFinite(axis)&&Math.abs(axis)>=preferences.deadzone?Math.sign(axis):0;
 const kicking=pad=>{
  if(preferences.kick==='face')return [0,1,2,3].some(i=>isHeld(pad,i));
  if(preferences.kick==='trigger')return isHeld(pad,7);
  if(preferences.kick==='shoulder')return isHeld(pad,5)||isHeld(pad,7);
  return isHeld(pad,0)||isHeld(pad,2)||isHeld(pad,7);
 };
 function controller(){
  if(typeof navigator.getGamepads!=='function')return null;
  try{
   const pads=navigator.getGamepads();
   const current=active===null?null:pads[active];
   if(current?.connected)return current;
   const next=Array.from(pads).find(p=>p?.connected);
   active=next?.index??null;
   return next||null;
  }catch{return null;}
 }
 function sample(pad){
  if(!pad)return neutral();
  let x=magnitude(pad.axes?.[0]),y=magnitude(pad.axes?.[1]);
  if(isHeld(pad,14))x=-1;
  if(isHeld(pad,15))x=1;
  if(isHeld(pad,12))y=-1;
  if(isHeld(pad,13))y=1;
  return{x,y,kick:kicking(pad)};
 }
 function playable(){
  return !document.hidden&&!$('matchView').hidden&&$('joinScreen').hidden&&
   !menuOpen&&started&&!paused&&!replay&&$('mode').value!=='watch';
 }
 function read(){return playable()?sample(controller()):neutral();}
 function describe(pad){
  const next=pad?'Connected: '+String(pad.id||'Controller').slice(0,70)+
   ' · stick / D-pad move · configured buttons kick · Start menu.':
   'No controller active. Connect a gamepad and press a button. Keyboard and touch still work.';
  if(next!==connected){connected=next;label.textContent=next;}
 }
 function frame(){
  const pad=controller();
  describe(pad);
  const start=pad?isHeld(pad,9):false;
  if(start&&!wasStart&&!$('matchView').hidden&&$('joinScreen').hidden){
   // Menu control is edge-triggered, never fires repeatedly while held.
   toggleMatchMenu();
  }
  wasStart=start;
  const state=read(),signature=[state.x,state.y,state.kick,playable()].join(':');
  if(signature!==lastSignature){
   lastSignature=signature;
   // Route through the existing de-duplicating sendInput() path.
   // The app handles local game, signed-in server and peer guest identically.
   if(started&&!paused&&!replay)refreshInput();
  }
  requestAnimationFrame(frame);
 }
 window.fuckballGamepad={read};
 requestAnimationFrame(frame);
})();
