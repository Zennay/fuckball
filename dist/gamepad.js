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
 info.append(title,label);settingsPanel.append(info);
 const neutral=()=>({x:0,y:0,kick:false});
 let active=null,lastSignature='',wasStart=false,connected='',polling=true;
 const isHeld=(pad,index)=>pad.buttons?.[index]?.pressed===true||
  (Number(pad.buttons?.[index]?.value)||0)>.6;
 const magnitude=axis=>Number.isFinite(axis)&&Math.abs(axis)>=.32?Math.sign(axis):0;
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
  return{x,y,kick:isHeld(pad,0)||isHeld(pad,2)||isHeld(pad,7)};
 }
 function playable(){
  return !document.hidden&&!$('matchView').hidden&&$('joinScreen').hidden&&
   !menuOpen&&started&&!paused&&!replay&&$('mode').value!=='watch';
 }
 function read(){return playable()?sample(controller()):neutral();}
 function describe(pad){
  const next=pad?'Connected: '+String(pad.id||'Controller').slice(0,70)+
   ' · left stick / D-pad move · A/X/RT kick · Start menu.':
   'No controller active. Connect a gamepad and press a button. Keyboard and touch still work.';
  if(next!==connected){connected=next;label.textContent=next;}
 }
 function frame(){
  if(!polling)return;
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
 window.addEventListener('pagehide',()=>{polling=false;});
})();
