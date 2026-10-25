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
  ['shoulder','Right shoulder or right trigger'],
  ...[0,1,2,3,4,5,6,7,8,10,11].map(n=>['button:'+n,'One button · '+n])
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
  make('p','','Use left or right stick, reverse stick axes and choose your kick button. Tune drift while you watch live input before playing. Keyboard controls stay available.'));
 const launch=make('button','primary','🎮 Configure controller');launch.type='button';
 setup.append(intro,launch);
 const anchor=home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',setup);else home.append(setup);
 const dialog=make('dialog','controller-setup-dialog');
 dialog.setAttribute('aria-labelledby','controllerSetupTitle');
 const heading=make('h2','', 'CONTROLLER SETUP.');heading.id='controllerSetupTitle';
 const privacy=make('p','controller-setup-privacy','Local controller diagnostics only. Controller selection is limited to this tab; no button presses, hardware IDs or settings are uploaded.');
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
 const deviceLabel=make('label','','Controller in this tab');
 const deviceSelect=make('select');deviceSelect.setAttribute('aria-label','Choose which gamepad controls your player');
 const rebind=make('button','controller-setup-rebind','↻ Bind selected controller to P1');
 rebind.type='button';
 rebind.setAttribute('aria-label','Explicitly bind the selected gamepad to player one');
 deviceLabel.append(deviceSelect,rebind);
 const mappingLabel=make('label','','Kick buttons');
 const mapping=make('select');mapping.setAttribute('aria-label','Gamepad kick mapping');
 for(const [v,label] of MODES)mapping.add(new Option(label,v));
 mappingLabel.append(mapping);
 const stickLabel=make('label','','Move with');
 const stick=make('select');stick.setAttribute('aria-label','Controller movement stick');
 stick.add(new Option('Left stick','left'));stick.add(new Option('Right stick','right'));
 stickLabel.append(stick);
 const invertLabel=make('fieldset','controller-setup-invert');
 const invertLegend=make('legend','','Direction accessibility');
 const invertX=make('input');invertX.type='checkbox';
 const invertXLabel=make('label','','Reverse horizontal stick');invertXLabel.prepend(invertX);
 const invertY=make('input');invertY.type='checkbox';
 const invertYLabel=make('label','','Reverse vertical stick');invertYLabel.prepend(invertY);
 invertLabel.append(invertLegend,invertXLabel,invertYLabel);
 const deadLabel=make('label','','Stick deadzone');
 const slider=make('input');slider.type='range';slider.min='.15';slider.max='.65';slider.step='.05';
 slider.setAttribute('aria-label','Gamepad stick deadzone');
 const deadValue=make('output','','30%');
 const sliderRow=make('div','controller-setup-slider');sliderRow.append(slider,deadValue);deadLabel.append(sliderRow);
 const rumbleGroup=make('fieldset','controller-setup-haptics');
 const rumbleLegend=make('legend','','Controller vibration · optional, off by default');
 const kickPulse=make('input');kickPulse.type='checkbox';
 const goalPulse=make('input');goalPulse.type='checkbox';
 const kickPulseLabel=make('label','','Vibrate briefly when kicking');kickPulseLabel.prepend(kickPulse);
 const goalPulseLabel=make('label','','Vibrate when a goal is registered');goalPulseLabel.prepend(goalPulse);
 const rumbleHint=make('small','','Only the selected controller may vibrate during active play. Unsupported gamepads remain silent. No gameplay or network settings change.');
 rumbleGroup.append(rumbleLegend,kickPulseLabel,goalPulseLabel,rumbleHint);
 fields.append(deviceLabel,mappingLabel,stickLabel,deadLabel,invertLabel,rumbleGroup);
 const bindButton=make('button','controller-setup-bind','◎ Press a button to bind kick');
 bindButton.type='button';
 const calibrate=make('button','','◎ Measure resting stick (2s)');calibrate.type='button';
 const hint=make('p','controller-setup-hint','Rest the stick and release every button before calibrating. This only recommends a deadzone; you choose whether to apply it.');
 const actions=make('div','controller-setup-actions');
 const apply=make('button','primary','Apply recommended deadzone');apply.type='button';apply.disabled=true;
 const reset=make('button','','Restore defaults');reset.type='button';
 const done=make('button','','Done');done.type='button';
 actions.append(apply,reset,done);
 dialog.append(heading,privacy,state,board,fields,bindButton,calibrate,hint,actions);
 document.body.append(dialog);
 const kickValid=k=>MODES.some(([key])=>key===k);
 let config={kick:'default',deadzone:.30,stick:'left',invertX:false,invertY:false,
  kickPulse:false,goalPulse:false},
  suggestion=null,sampling=null,lastMessage='',active=false;
 let selectedSource=null,deviceSignature='',binding=null,boundSource=null;
 const allowedButtons=[0,1,2,3,4,5,6,7,8,10,11];
 function cancelBinding(message){
  binding=null;bindButton.textContent='◎ Press a button to bind kick';
  if(message)hint.textContent=message;
 }
 function scanBinding(){
  if(!binding)return;
  const task=binding;
  if(!active||!dialog.open||document.hidden)return cancelBinding('Binding stopped when the dialog or tab closed.');
  const pad=controller();
  if(!pad||!pad.connected||pad.index!==task.index||pad.id!==task.id)
   return cancelBinding('Selected controller disconnected or was replaced. No kick binding was saved.');
  if(performance.now()-task.startedAt>8000)
   return cancelBinding('No button detected within eight seconds. Choose Press a button to retry.');
  const down=allowedButtons.filter(i=>held(pad,i));
  if(!task.armed){
   if(down.length===0){task.armed=true;hint.textContent='Now press exactly one kick button. Menu/Start and D-pad buttons are reserved.';}
   else hint.textContent='Release all buttons first, then press the desired kick button.';
  }else if(down.length===1){
   const n=down[0];
   cancelBinding();
   config.kick='button:'+n;
   fill();persist();
   hint.textContent='Kick is now bound to button '+n+' on this device. The in-match menu uses the same setting.';
   return;
  }else if(down.length>1){
   task.armed=false;
   hint.textContent='More than one button pressed. Release all buttons and press only one.';
  }
  if(binding===task)requestAnimationFrame(scanBinding);
 }
 bindButton.onclick=()=>{
  if(binding)return cancelBinding('Kick binding cancelled; your previous mapping is unchanged.');
  const pad=controller();
  if(!pad)return void(hint.textContent='Connect and select a controller before binding its kick button.');
  cancelCalibration();
  binding={index:pad.index,id:pad.id,armed:false,startedAt:performance.now()};
  bindButton.textContent='Cancel button binding';
  hint.textContent='Release all buttons; then press the desired kick button within eight seconds.';
  requestAnimationFrame(scanBinding);
 };
 function cancelCalibration(){
  sampling=null;calibrate.disabled=false;suggestion=null;apply.disabled=true;
 }
 function read(){
  try{
   const saved=JSON.parse(localStorage.getItem(KEY)||'null');
   if(!saved||typeof saved!=='object'||Array.isArray(saved))return;
   if(kickValid(saved.kick))config.kick=saved.kick;
   if(['left','right'].includes(saved.stick))config.stick=saved.stick;
   if(typeof saved.invertX==='boolean')config.invertX=saved.invertX;
   if(typeof saved.invertY==='boolean')config.invertY=saved.invertY;
   if(typeof saved.kickPulse==='boolean')config.kickPulse=saved.kickPulse;
   if(typeof saved.goalPulse==='boolean')config.goalPulse=saved.goalPulse;
   if(Number.isFinite(saved.deadzone)&&saved.deadzone>=.15&&saved.deadzone<=.65)
    config.deadzone=saved.deadzone;
  }catch{/* Keep safe defaults. */}
 }
 read();
 function fill(){
  mapping.value=config.kick;slider.value=String(config.deadzone);
  stick.value=config.stick;invertX.checked=config.invertX;invertY.checked=config.invertY;
  kickPulse.checked=config.kickPulse;goalPulse.checked=config.goalPulse;
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
  if(!kickValid(mapping.value))return;
  config.kick=mapping.value;persist();
 };
 stick.onchange=()=>{
  if(!['left','right'].includes(stick.value))return;
  config.stick=stick.value;sampling=null;calibrate.disabled=false;suggestion=null;
  apply.disabled=true;persist();
 };
 invertX.onchange=()=>{config.invertX=invertX.checked;persist();};
 invertY.onchange=()=>{config.invertY=invertY.checked;persist();};
 kickPulse.onchange=()=>{config.kickPulse=kickPulse.checked;persist();};
 goalPulse.onchange=()=>{config.goalPulse=goalPulse.checked;persist();};
 slider.oninput=()=>{
  const value=Number(slider.value);
  if(!Number.isFinite(value)||value<.15||value>.65)return;
  config.deadzone=value;fill();persist();
 };
 reset.onclick=()=>{
  cancelBinding();
  config={kick:'default',deadzone:.30,stick:'left',invertX:false,invertY:false,
   kickPulse:false,goalPulse:false};suggestion=null;
  apply.disabled=true;fill();persist();
  hint.textContent='Standard kick mapping and 30% deadzone restored.';
 };
 const held=(pad,i)=>pad.buttons?.[i]?.pressed===true||
  (Number(pad.buttons?.[i]?.value)||0)>.6;
 function isKick(pad){
  if(config.kick.startsWith('button:'))return held(pad,Number(config.kick.slice(7)));
  if(config.kick==='face')return [0,1,2,3].some(i=>held(pad,i));
  if(config.kick==='trigger')return held(pad,7);
  if(config.kick==='shoulder')return held(pad,5)||held(pad,7);
  return held(pad,0)||held(pad,2)||held(pad,7);
 }
 function availableControllers(){
  if(typeof navigator.getGamepads!=='function')return [];
  try{return Array.from(navigator.getGamepads()).filter(p=>
   p?.connected&&Number.isSafeInteger(p.index)&&p.index>=0&&p.index<=15);}
  catch{return [];}
 }
 function controller(){
  const pads=availableControllers();
  // Automatic controller previews cannot offer P2's locked gamepad as P1.
  const reserved=window.fuckballCouchPad?.reservedPort?.()??null;
  return selectedSource===null?
   pads.find(p=>p.index!==reserved)||null:
   pads.find(p=>p.index===selectedSource)||null;
 }
 function refreshSources(){
  const pads=availableControllers();
  const signature=pads.map(p=>p.index+':'+String(p.id).slice(0,70)).join('|')+';'+selectedSource;
  if(signature===deviceSignature)return;
  deviceSignature=signature;
  deviceSelect.replaceChildren(new Option('Automatic · first connected controller','auto'));
  for(const pad of pads)deviceSelect.add(new Option('Port '+(pad.index+1)+' · '+
    String(pad.id||'Controller').slice(0,58),String(pad.index)));
  if(selectedSource!==null&&!pads.some(p=>p.index===selectedSource)){
   deviceSelect.add(new Option('Port '+(selectedSource+1)+' · disconnected',String(selectedSource)));
  }
  deviceSelect.value=selectedSource===null?'auto':String(selectedSource);
 }
 rebind.onclick=()=>{
  if(['couchRivals','couchRivals3v3','couchRivals4v4']
      .includes(document.getElementById('mode')?.value)){
   hint.textContent='Four-human rivals reserve both gamepads for Blue players. Player 1 uses the keyboard.';
   return;
  }
  const pad=controller();
  if(!pad){
   hint.textContent='Connect the chosen controller before binding it to Player 1.';
   state.textContent='No connected controller on the selected port.';
   return;
  }
  // Previewing a device never grants it movement/kick authority. Only this
  // explicit click may bind the chosen physical controller to P1.
  const reserved=window.fuckballCouchPad?.reservedPort?.()??null;
  if(pad.index===reserved){
   hint.textContent='This controller is reserved for Player 2. Choose an unreserved controller before binding Player 1.';
   return;
  }
  // Convert an automatic preview into an explicit physical port selection.
  // Otherwise the previewed controller and the gamepad module's sticky
  // automatic preference could refer to two different connected devices.
  selectedSource=pad.index;boundSource=pad.index;deviceSignature='';refreshSources();
  // One deliberate P1 authorization; browser/game code owns the live port
  // and hardware-id lock. It neutralizes the old source before any new input.
  window.dispatchEvent(new CustomEvent('fuckball:controller-source',{
   detail:{index:pad.index}}));
  cancelBinding();
  cancelCalibration();
  hint.textContent='Player 1 explicitly bound to port '+(pad.index+1)+
   '. Movement and kick now use only that gamepad during this live match.';
  lastMessage='';present(pad);
 };
 deviceSelect.onchange=()=>{
  const choice=deviceSelect.value;
  const next=choice==='auto'?null:Number(choice);
  if(next!==null&&(!Number.isSafeInteger(next)||next<0||next>15))return;
  selectedSource=next;deviceSignature='';
  cancelBinding('Controller changed; previous pending binding cancelled.');
  cancelCalibration();
  lastMessage='';
  // Selecting a row is PREVIEW ONLY, especially during an active multiplayer
  // round. Never hand P1 authority to another human's pad on this change.
  refreshSources();present(controller());
  const preview=next===null?'Automatic preview':('Port '+(next+1)+' preview');
  hint.textContent=preview+' selected. '+(boundSource===null?
   'No controller was explicitly bound from this setup panel yet.':
   'Your last explicit P1 binding remains on port '+(boundSource+1)+'.')+
   ' Press Bind selected controller to P1 to change gameplay input.';
 };
 function present(pad){
  if(!pad){
   if(sampling){
    sampling=null;calibrate.disabled=false;suggestion=null;apply.disabled=true;
    hint.textContent='Controller disconnected during calibration. Reconnect it and restart the measurement.';
   }
   const msg=selectedSource===null?'No connected controller detected. Connect one and press a gamepad button.':
    'Selected controller on port '+(selectedSource+1)+' is disconnected. Select another controller or Automatic.';
   if(lastMessage!==msg){state.textContent=msg;lastMessage=msg;}
   visual.setAttribute('aria-label','No gamepad connected');
   dot.style.left='50%';dot.style.top='50%';
   direction.textContent='No input';kick.textContent='Kick unavailable';
   return;
  }
  const seat=window.fuckballGamepad?.sourceStatus?.();
  const needsRebind=seat?.locked&&seat.connected===false;
  const msg=needsRebind?
   'Controller available, but the active P1 gamepad was disconnected or replaced. Click Bind selected controller to P1 before gameplay resumes.':
   'Connected · '+String(pad.id||'Gamepad').slice(0,72)+
   ' · '+pad.buttons.length+' buttons · '+pad.axes.length+' axes · '+
   (typeof pad.vibrationActuator?.playEffect==='function'?'vibration available':'no vibration support')+'.';
  if(msg!==lastMessage){state.textContent=msg;lastMessage=msg;}
  const index=config.stick==='right'?2:0;
  const rawX=Number.isFinite(pad.axes?.[index])?pad.axes[index]:0;
  const rawY=Number.isFinite(pad.axes?.[index+1])?pad.axes[index+1]:0;
  let x=Math.abs(rawX)>=config.deadzone?rawX:0;
  let y=Math.abs(rawY)>=config.deadzone?rawY:0;
  if(config.invertX)x=-x;if(config.invertY)y=-y;
  if(held(pad,14))x=-1;if(held(pad,15))x=1;
  if(held(pad,12))y=-1;if(held(pad,13))y=1;
  dot.style.left=(50+Math.max(-1,Math.min(1,x))*42)+'%';
  dot.style.top=(50+Math.max(-1,Math.min(1,y))*42)+'%';
  visual.setAttribute('aria-label','Controller movement: '+Math.round(x*100)+'% horizontal, '+Math.round(y*100)+'% vertical');
  direction.textContent='Move · X '+Math.round(x*100)+'% / Y '+Math.round(y*100)+'%';
  kick.textContent=isKick(pad)?'● KICK PRESSED':'○ Kick released';
  kick.classList.toggle('is-pressed',isKick(pad));
  if(!sampling)return;
  // A disconnected/reassigned Gamepad API port must never supply calibration
  // samples or a recommendation for a different person's controller.
  if(!pad.connected||pad.index!==sampling.index||pad.id!==sampling.id){
   cancelCalibration();
   hint.textContent='Controller disconnected or changed during calibration. Nothing was applied; restart with your chosen controller.';
   return;
  }
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
  cancelBinding();
  const pad=controller();
  if(!pad){
   hint.textContent='Connect a controller and press a button before measuring drift.';return;
  }
  sampling={index:pad.index,id:pad.id,started:performance.now(),
   max:0,moved:false,count:0};
  suggestion=null;apply.disabled=true;calibrate.disabled=true;
  hint.textContent='Measuring for two seconds. Keep the left stick still and centered.';
 };
 apply.onclick=()=>{
  if(!Number.isFinite(suggestion)||suggestion<.15||suggestion>.65)return;
  config.deadzone=suggestion;suggestion=null;apply.disabled=true;
  fill();persist();
 };
 function close(){
  cancelBinding();
  if(dialog.open)dialog.close();
  else dialog.removeAttribute('open');
  launch.focus();
 }
 done.onclick=close;
 dialog.addEventListener('close',()=>{
  cancelBinding();active=false;sampling=null;calibrate.disabled=false;launch.focus();
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 launch.onclick=()=>{
  if(typeof dialog.showModal!=='function'){
   state.textContent='Your browser does not support the controller setup dialog.';return;
  }
  cancelBinding();fill();refreshSources();sampling=null;suggestion=null;apply.disabled=true;active=true;
  hint.textContent='Only the chosen stick is calibrated. Inverting axes affects analog movement, while D-pad directions stay unchanged. This preview never joins a room.';
  dialog.showModal();mapping.focus();
 };
 window.addEventListener('fuckball-gamepad-config',event=>{
  const v=event.detail;
  if(!v||!kickValid(v.kick)||!Number.isFinite(v.deadzone)||v.deadzone<.15||
   v.deadzone>.65||!['left','right'].includes(v.stick)||
   typeof v.invertX!=='boolean'||typeof v.invertY!=='boolean'||
   (v.kickPulse!==undefined&&typeof v.kickPulse!=='boolean')||
   (v.goalPulse!==undefined&&typeof v.goalPulse!=='boolean'))return;
  config={kick:v.kick,deadzone:v.deadzone,stick:v.stick,
   invertX:v.invertX,invertY:v.invertY,kickPulse:v.kickPulse??false,goalPulse:v.goalPulse??false};
  fill();
 });
 window.setInterval(()=>{if(active&&dialog.open&&!document.hidden){refreshSources();present(controller());}},120);
 window.addEventListener('gamepadconnected',()=>{if(active){refreshSources();present(controller());}});
 window.addEventListener('gamepaddisconnected',()=>{if(active){refreshSources();present(controller());}});
 function suspendCapture(){
  if(binding)cancelBinding('Button binding cancelled because the game is no longer focused.');
  if(sampling){
   cancelCalibration();
   hint.textContent='Stick calibration cancelled when focus was lost. Restart with a still controller.';
  }
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendCapture();});
 window.addEventListener('blur',suspendCapture);
})();