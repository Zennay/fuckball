'use strict';
// Player-facing gamepad setup: input preview and calibration, no simulation or network writes.
(function(){
 const home=document.getElementById('homeView');
 if(!home)return;
 const KEY='fuckball.gamepad.v1';
 const MODES=[
  ['default','A / X / right trigger'],
  ['face','Any face button (A / B / X / Y)'],
  ['trigger','Right trigger only'],
  ['shoulder','Right shoulder or right trigger']
 ];
 const make=(tag,className,text)=>{
  const el=document.createElement(tag);if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
 };
 const setup=make('section','controller-setup');
 setup.setAttribute('aria-label','Controller setup');
 const intro=make('div','controller-setup-copy');
 intro.append(make('span','eyebrow','PLAY YOUR WAY'),make('h2','','CONTROLLER READY.'),
  make('p','','Check a connected controller, tune stick drift and choose a kick mapping before playing. Keyboard controls remain available.'));
 const launch=make('button','primary','🎮 Configure controller');launch.type='button';
 setup.append(intro,launch);
 const anchor=home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',setup);else home.append(setup);
 const dialog=make('dialog','controller-setup-dialog');
 dialog.setAttribute('aria-labelledby','controllerSetupTitle');
 const heading=make('h2','', 'CONTROLLER SETUP.');heading.id='controllerSetupTitle';
 const privacy=make('p','controller-setup-privacy','Local controller diagnostics only. Button presses, hardware IDs and settings are never uploaded.');
 const state=make('p','controller-setup-state','Connect a controller and press a button.');
 state.setAttribute('role','status');state.setAttribute('aria-live','polite');
 const board=make('section','controller-setup-preview');
 const boardHead=make('h3','','LIVE INPUT PREVIEW');
 const visual=make('div','controller-setup-stick');
 visual.setAttribute('role','img');visual.setAttribute('aria-label','Stick centered');
 const axes=make('span','controller-setup-axes');const dot=make('span','controller-setup-dot');
 visual.append(axes,dot);
 const readout=make('div','controller-setup-readout');
 const direction=make('strong','','Neutral');
 const kick=make('strong','','Kick released');
 readout.append(direction,kick);board.append(boardHead,visual,readout);
 const fields=make('div','controller-setup-fields');
 const mappingLabel=make('label','','Kick buttons');
 const mapping=make('select');mapping.setAttribute('aria-label','Gamepad kick mapping');
 for(const [v,label] of MODES)mapping.add(new Option(label,v));
 mappingLabel.append(mapping);
 const deadLabel=make('label','','Stick deadzone');
 const slider=make('input');slider.type='range';slider.min='.15';slider.max='.65';slider.step='.05';
 slider.setAttribute('aria-label','Gamepad stick deadzone');
 const deadValue=make('output','','30%');
 const sliderRow=make('div','controller-setup-slider');sliderRow.append(slider,deadValue);deadLabel.append(sliderRow);
 fields.append(mappingLabel,deadLabel);
 const calibrate=make('button','','◎ Measure resting stick (2s)');calibrate.type='button';
 const hint=make('p','controller-setup-hint','Rest the stick and release every button before calibrating. This only recommends a deadzone; you choose whether to apply it.');
 const actions=make('div','controller-setup-actions');
 const apply=make('button','primary','Apply recommended deadzone');apply.type='button';apply.disabled=true;
 const reset=make('button','','Restore defaults');reset.type='button';
 const done=make('button','','Done');done.type='button';
 actions.append(apply,reset,done);
 dialog.append(heading,privacy,state,board,fields,calibrate,hint,actions);
 document.body.append(dialog);
 let config={kick:'default',deadzone:.30},suggestion=null,sampling=null,lastMessage='',active=false;
 function read(){
  try{
   const saved=JSON.parse(localStorage.getItem(KEY)||'null');
   if(!saved||typeof saved!=='object'||Array.isArray(saved))return;
   if(MODES.some(([k])=>k===saved.kick))config.kick=saved.kick;
   if(Number.isFinite(saved.deadzone)&&saved.deadzone>=.15&&saved.deadzone<=.65)
    config.deadzone=saved.deadzone;
  }catch{/* Keep safe defaults. */}
 }
 read();
 function fill(){
  mapping.value=config.kick;slider.value=String(config.deadzone);
  deadValue.textContent=Math.round(config.deadzone*100)+'%';
 }
 fill();
 function persist(){
  let saved=false;
  try{
   localStorage.setItem(KEY,JSON.stringify(config));saved=true;
  }catch{/* Still apply to the current tab through the same app input path. */}
  window.dispatchEvent(new CustomEvent('fuckball-gamepad-config',{detail:{...config}}));
  hint.textContent=saved?'Settings saved on this device and applied immediately to the existing gamepad input.':
   'Settings apply in this tab, but browser storage blocked saving across visits.';
 }
 mapping.onchange=()=>{
  if(!MODES.some(([key])=>key===mapping.value))return;
  config.kick=mapping.value;persist();
 };
 slider.oninput=()=>{
  const value=Number(slider.value);
  if(!Number.isFinite(value)||value<.15||value>.65)return;
  config.deadzone=value;fill();persist();
 };
 reset.onclick=()=>{
  config={kick:'default',deadzone:.30};suggestion=null;
  apply.disabled=true;fill();persist();
  hint.textContent='Standard kick mapping and 30% deadzone restored.';
 };
 const held=(pad,i)=>pad.buttons?.[i]?.pressed===true||
  (Number(pad.buttons?.[i]?.value)||0)>.6;
 function isKick(pad){
  if(config.kick==='face')return [0,1,2,3].some(i=>held(pad,i));
  if(config.kick==='trigger')return held(pad,7);
  if(config.kick==='shoulder')return held(pad,5)||held(pad,7);
  return held(pad,0)||held(pad,2)||held(pad,7);
 }
 function controller(){
  if(typeof navigator.getGamepads!=='function')return null;
  try{return Array.from(navigator.getGamepads()).find(p=>p?.connected)||null;}
  catch{return null;}
 }
 function present(pad){
  if(!pad){
   const msg='No connected controller detected. Connect one and press a gamepad button.';
   if(lastMessage!==msg){state.textContent=msg;lastMessage=msg;}
   visual.setAttribute('aria-label','No gamepad connected');
   dot.style.left='50%';dot.style.top='50%';
   direction.textContent='No input';kick.textContent='Kick unavailable';
   return;
  }
  const msg='Connected · '+String(pad.id||'Gamepad').slice(0,72)+
   ' · '+pad.buttons.length+' buttons · '+pad.axes.length+' axes.';
  if(msg!==lastMessage){state.textContent=msg;lastMessage=msg;}
  const rawX=Number.isFinite(pad.axes?.[0])?pad.axes[0]:0;
  const rawY=Number.isFinite(pad.axes?.[1])?pad.axes[1]:0;
  const x=held(pad,14)?-1:held(pad,15)?1:Math.abs(rawX)>=config.deadzone?rawX:0;
  const y=held(pad,12)?-1:held(pad,13)?1:Math.abs(rawY)>=config.deadzone?rawY:0;
  dot.style.left=(50+Math.max(-1,Math.min(1,x))*42)+'%';
  dot.style.top=(50+Math.max(-1,Math.min(1,y))*42)+'%';
  visual.setAttribute('aria-label','Controller movement: '+Math.round(x*100)+'% horizontal, '+Math.round(y*100)+'% vertical');
  direction.textContent='Move · X '+Math.round(x*100)+'% / Y '+Math.round(y*100)+'%';
  kick.textContent=isKick(pad)?'● KICK PRESSED':'○ Kick released';
  kick.classList.toggle('is-pressed',isKick(pad));
  if(!sampling)return;
  sampling.count++;
  const drift=Math.max(Math.abs(rawX),Math.abs(rawY));
  sampling.max=Math.max(sampling.max,drift);
  if(drift>.40)sampling.moved=true;
  if(performance.now()-sampling.started<2000)return;
  const sample=sampling;sampling=null;calibrate.disabled=false;
  if(sample.moved||sample.count<6){
   suggestion=null;apply.disabled=true;
   hint.textContent='Calibration cancelled: the stick moved significantly or no stable samples arrived. Leave it centered and retry.';
   return;
  }
  // A little headroom over actual resting drift, within the game's supported limits.
  suggestion=Math.max(.15,Math.min(.65,Math.ceil((sample.max+.08)*20)/20));
  suggestion=Math.round(suggestion*100)/100;
  apply.disabled=false;
  hint.textContent='Measured resting drift '+Math.round(sample.max*100)+'%. Recommended deadzone '+
   Math.round(suggestion*100)+'%. Apply it or adjust the slider manually.';
 }
 calibrate.onclick=()=>{
  if(!controller()){
   hint.textContent='Connect a controller and press a button before measuring drift.';return;
  }
  sampling={started:performance.now(),max:0,moved:false,count:0};
  suggestion=null;apply.disabled=true;calibrate.disabled=true;
  hint.textContent='Measuring for two seconds. Keep the left stick still and centered.';
 };
 apply.onclick=()=>{
  if(!Number.isFinite(suggestion)||suggestion<.15||suggestion>.65)return;
  config.deadzone=suggestion;suggestion=null;apply.disabled=true;
  fill();persist();
 };
 function close(){
  if(dialog.open)dialog.close();
  else dialog.removeAttribute('open');
  launch.focus();
 }
 done.onclick=close;
 dialog.addEventListener('close',()=>{
  active=false;sampling=null;calibrate.disabled=false;launch.focus();
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 launch.onclick=()=>{
  if(typeof dialog.showModal!=='function'){
   state.textContent='Your browser does not support the controller setup dialog.';return;
  }
  fill();sampling=null;suggestion=null;apply.disabled=true;active=true;
  hint.textContent='This input preview does not move players or join a room. Leave the stick centered to measure resting drift.';
  dialog.showModal();mapping.focus();
 };
 window.setInterval(()=>{if(active&&dialog.open&&!document.hidden)present(controller());},120);
 window.addEventListener('gamepadconnected',()=>{if(active)present(controller());});
 window.addEventListener('gamepaddisconnected',()=>{if(active)present(controller());});
})();