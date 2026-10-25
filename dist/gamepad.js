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
  ['trigger','Right trigger only'],['shoulder','Right shoulder / trigger'],
  ...[0,1,2,3,4,5,6,7,8,10,11].map(n=>['button:'+n,'One button · '+n])
 ])kickSelect.add(new Option(name,value));
 kickLabel.append(kickSelect);
 const deadzoneLabel=document.createElement('label');deadzoneLabel.textContent='Stick deadzone';
 const deadzoneValue=document.createElement('output');
 const deadzone=document.createElement('input');deadzone.type='range';
 deadzone.min='.15';deadzone.max='.65';deadzone.step='.05';
 deadzone.setAttribute('aria-label','Controller stick deadzone');
 deadzoneLabel.append(deadzone,deadzoneValue);
 const stickLabel=document.createElement('label');stickLabel.textContent='Movement stick';
 const stickSelect=document.createElement('select');stickSelect.setAttribute('aria-label','Movement stick');
 stickSelect.add(new Option('Left stick','left'));stickSelect.add(new Option('Right stick','right'));
 stickLabel.append(stickSelect);
 const axisRow=document.createElement('div');axisRow.className='gamepad-axis-options';
 const flipXLabel=document.createElement('label');const flipX=document.createElement('input');
 flipX.type='checkbox';flipXLabel.append(flipX,document.createTextNode('Reverse horizontal stick'));
 const flipYLabel=document.createElement('label');const flipY=document.createElement('input');
 flipY.type='checkbox';flipYLabel.append(flipY,document.createTextNode('Reverse vertical stick'));
 axisRow.append(flipXLabel,flipYLabel);
 const pulseRow=document.createElement('div');pulseRow.className='gamepad-haptic-options';
 const kickPulseLabel=document.createElement('label');const kickPulse=document.createElement('input');
 kickPulse.type='checkbox';kickPulseLabel.append(kickPulse,document.createTextNode('Gentle kick vibration'));
 const goalPulseLabel=document.createElement('label');const goalPulse=document.createElement('input');
 goalPulse.type='checkbox';goalPulseLabel.append(goalPulse,document.createTextNode('Goal vibration'));
 pulseRow.append(kickPulseLabel,goalPulseLabel);
 options.append(kickLabel,deadzoneLabel,stickLabel,axisRow,pulseRow);
 info.append(title,label,options);settingsPanel.append(info);
 const KEY='fuckball.gamepad.v1';
 const kickValid=k=>['default','face','trigger','shoulder'].includes(k)||/^button:(?:[0-8]|10|11)$/.test(k);
 let preferences={kick:'default',deadzone:.30,stick:'left',invertX:false,invertY:false,
  kickPulse:false,goalPulse:false};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(kickValid(saved.kick))preferences.kick=saved.kick;
  if(['left','right'].includes(saved.stick))preferences.stick=saved.stick;
  if(typeof saved.invertX==='boolean')preferences.invertX=saved.invertX;
  if(typeof saved.invertY==='boolean')preferences.invertY=saved.invertY;
  if(typeof saved.kickPulse==='boolean')preferences.kickPulse=saved.kickPulse;
  if(typeof saved.goalPulse==='boolean')preferences.goalPulse=saved.goalPulse;
  if(Number.isFinite(saved.deadzone)&&saved.deadzone>=.15&&saved.deadzone<=.65)
   preferences.deadzone=saved.deadzone;
 }catch{}
 kickSelect.value=preferences.kick;
 deadzone.value=String(preferences.deadzone);
 deadzoneValue.textContent=Math.round(preferences.deadzone*100)+'%';
 stickSelect.value=preferences.stick;flipX.checked=preferences.invertX;flipY.checked=preferences.invertY;
 kickPulse.checked=preferences.kickPulse;goalPulse.checked=preferences.goalPulse;
 function save(){
  try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}
  window.dispatchEvent(new CustomEvent('fuckball-gamepad-config',{detail:{...preferences}}));
 }
 kickSelect.onchange=()=>{if(!kickValid(kickSelect.value))return;preferences.kick=kickSelect.value;save();};
 stickSelect.onchange=()=>{if(!['left','right'].includes(stickSelect.value))return;
  preferences.stick=stickSelect.value;save();lastSignature='';};
 flipX.onchange=()=>{preferences.invertX=flipX.checked;save();lastSignature='';};
 flipY.onchange=()=>{preferences.invertY=flipY.checked;save();lastSignature='';};
 kickPulse.onchange=()=>{preferences.kickPulse=kickPulse.checked;save();};
 goalPulse.onchange=()=>{preferences.goalPulse=goalPulse.checked;save();};
 deadzone.oninput=()=>{
  preferences.deadzone=Number(deadzone.value);
  deadzoneValue.textContent=Math.round(preferences.deadzone*100)+'%';
  save();
 };
 const neutral=()=>({x:0,y:0,kick:false});
 let active=null,chosenIndex=null,lastSignature='',wasStart=false,connected='';
 // Preserve one human's actual controller identity for a live two-player
 // couch session. A newly plugged-in controller using the old port cannot
 // silently inherit the first player's movement or kick permission.
 let localSeatOne=null,localSeatLocked=false;
 // A live P1 session owns its exact Gamepad API port + hardware identity.
 // Otherwise a disconnected pad could be replaced by a different person's
 // controller on the same port, unintentionally moving/kicking online.
 let liveSeatOne=null,liveSeatLocked=false;
 // The live-seat lock correctly rejects an unplugged/replaced controller,
 // but its warning used to exist only deep inside Video Settings. Give the
 // player a safe, visible recovery path without automatically authorizing a
 // newly connected controller (or stealing Player 2's physical port).
 const recovery=document.createElement('aside');
 recovery.className='gamepad-seat-recovery';
 recovery.hidden=true;recovery.setAttribute('role','region');
 recovery.setAttribute('aria-label','Gamepad disconnected during live match');
 const recoveryTitle=document.createElement('strong');
 recoveryTitle.textContent='CONTROLLER LOST · P1 INPUT NEUTRAL';
 const recoveryDetail=document.createElement('p');
 recoveryDetail.textContent='This controller stopped controlling Player 1. Keyboard and touch remain available. Rebind explicitly to use a controller again.';
 const recoveryActions=document.createElement('div');
 recoveryActions.className='gamepad-seat-recovery-actions';
 const openSetup=document.createElement('button');
 openSetup.type='button';openSetup.className='primary';
 openSetup.textContent='↻ Rebind controller';
 const keepKeyboard=document.createElement('button');
 keepKeyboard.type='button';keepKeyboard.textContent='Use keyboard / touch';
 recoveryActions.append(openSetup,keepKeyboard);
 recovery.append(recoveryTitle,recoveryDetail,recoveryActions);
 document.body.append(recovery);
 let acknowledgedLoss=null;
 function lostPlayerOneSeat(){
  const seat=localSeatLocked&&localTwoHumanMode()?localSeatOne:
   liveSeatLocked&&liveP1Session()?liveSeatOne:null;
  return seat?.lost===true?seat:null;
 }
 function refreshControllerRecovery(){
  const lost=lostPlayerOneSeat();
  const visible=!!lost&&lost!==acknowledgedLoss&&
   typeof started!=='undefined'&&started&&
   !replay&&!document.getElementById('matchView')?.hidden;
  recovery.hidden=!visible;
  if(!visible)return;
  recoveryDetail.textContent='Player 1 controller on port '+(lost.index+1)+
   ' disconnected or changed. Its movement and kick stay neutral until you explicitly rebind. Keyboard and touch still work.';
 }
 openSetup.addEventListener('click',()=>{
  if(recovery.hidden||!lostPlayerOneSeat())return;
  const open=window.fuckballControllerSetup?.open;
  if(typeof open==='function'){
   if(open()===false)recoveryDetail.textContent='This browser cannot open Controller Setup. Keyboard and touch remain available.';
  }else recoveryDetail.textContent='Controller Setup is unavailable here. Open Configure controller on Home to explicitly bind Player 1.';
 });
 keepKeyboard.addEventListener('click',()=>{
  acknowledgedLoss=lostPlayerOneSeat();refreshControllerRecovery();
 });
 const isCouchRivals=()=>['couchRivals','couchRivals3v3','couchRivals4v4']
  .includes($('mode').value);
 const liveP1Session=()=>typeof started!=='undefined'&&started&&
  !replay&&!isCouchRivals()&&!localTwoHumanMode();
 function liveSeatPad(pads){
  const seat=liveSeatOne;
  if(!seat||seat.lost)return null;
  const pad=pads[seat.index];
  // A pad model's ID is not a unique physical identity. Once a live seat
  // disappears, a different pad with the same model on the same port must
  // not recover kick/movement without the player's explicit Bind action.
  if(!pad?.connected||pad.index!==seat.index||pad.id!==seat.id){
   seat.lost=true;return null;
  }
  return pad.index!==reservedP2()?pad:null;
 }
 const localTwoHumanMode=()=>typeof started!=='undefined'&&started&&
  !serverLink&&!peerConnected&&!replay&&
  ['local','coop2v2','coop3v3','coop4v4'].includes($('mode').value);
 const reservedP2=()=>window.fuckballCouchPad?.reservedPort?.()??null;
 let lastHeldKick=false,lastScore=null,lastHapticAt=0;
 const isHeld=(pad,index)=>pad.buttons?.[index]?.pressed===true||
  (Number(pad.buttons?.[index]?.value)||0)>.6;
 const magnitude=axis=>Number.isFinite(axis)&&Math.abs(axis)>=preferences.deadzone?Math.sign(axis):0;
 const kicking=pad=>{
  if(preferences.kick.startsWith('button:'))return isHeld(pad,Number(preferences.kick.slice(7)));
  if(preferences.kick==='face')return [0,1,2,3].some(i=>isHeld(pad,i));
  if(preferences.kick==='trigger')return isHeld(pad,7);
  if(preferences.kick==='shoulder')return isHeld(pad,5)||isHeld(pad,7);
  return isHeld(pad,0)||isHeld(pad,2)||isHeld(pad,7);
 };
 function controller(){
  if(typeof navigator.getGamepads!=='function')return null;
  try{
   const pads=navigator.getGamepads();
   if(localSeatLocked&&localTwoHumanMode()){
    if(!localSeatOne||localSeatOne.lost)return null;
    const pinned=pads[localSeatOne.index];
    if(!pinned?.connected||pinned.id!==localSeatOne.id||
       pinned.index!==localSeatOne.index){
     localSeatOne.lost=true;return null;
    }
    return pinned.index!==reservedP2()?pinned:null;
   }
   // No live match may auto-handoff movement/kick authority when a gamepad is
   // unplugged or a new pad occupies the same Gamepad API port. The original
   // human must choose Bind controller in the setup UI to authorize a change.
   if(!liveP1Session()){liveSeatLocked=false;liveSeatOne=null;}
   else{
    if(!liveSeatLocked){
     const candidate=chosenIndex===null?
      (pads[active]?.connected&&pads[active]?.index!==reservedP2()?pads[active]:
       Array.from(pads).find(p=>p?.connected&&p.index!==reservedP2())):
      pads[chosenIndex];
     liveSeatOne=candidate?.connected&&candidate.index!==reservedP2()?
      {index:candidate.index,id:candidate.id}:null;
     liveSeatLocked=true;
    }
    return liveSeatPad(pads);
   }
   // Explicit choices never fall back to another player's controller on disconnect.
   if(chosenIndex!==null){
    const chosen=pads[chosenIndex];
    return chosen?.connected&&chosen.index!==reservedP2()?chosen:null;
   }
   const current=active===null?null:pads[active];
   if(current?.connected&&current.index!==reservedP2())return current;
   const next=Array.from(pads).find(p=>p?.connected&&p.index!==reservedP2());
   active=next?.index??null;
   return next||null;
  }catch{return null;}
 }
 function sample(pad){
  if(!pad)return neutral();
  const index=preferences.stick==='right'?2:0;
  let x=magnitude(pad.axes?.[index]),y=magnitude(pad.axes?.[index+1]);
  if(preferences.invertX)x=-x;
  if(preferences.invertY)y=-y;
  if(isHeld(pad,14))x=-1;
  if(isHeld(pad,15))x=1;
  if(isHeld(pad,12))y=-1;
  if(isHeld(pad,13))y=1;
  return{x,y,kick:kicking(pad)};
 }
 function playable(){
  // Same input boundary as keyboard and touch: dialogs/chat, hidden views and
  // lost window focus must never reapply a held controller direction.
  return canControlLiveMatch();
 }
 function read(){return playable()&&!['couchRivals','couchRivals3v3','couchRivals4v4'].includes($('mode').value)?sample(controller()):neutral();}
 function describe(pad){
  const seatMissing=!pad&&liveP1Session()&&liveSeatLocked;
  const next=pad?'Connected: '+String(pad.id||'Controller').slice(0,70)+
   ' · stick / D-pad move · configured buttons kick · Start menu.':
   seatMissing?'Gamepad changed or disconnected. Movement and kick are neutral until you explicitly rebind in Controller Setup.':
   'No controller active. Connect a gamepad and press a button. Keyboard and touch still work.';
  if(next!==connected){connected=next;label.textContent=next;}
 }
 // Haptics are optional local physical feedback, not a gameplay command.
 // Unsupported browsers/controllers silently continue with normal controls.
 function pulse(pad,kind){
  if(!pad||!playable())return;
  const actuator=pad.vibrationActuator;
  if(!actuator||typeof actuator.playEffect!=='function')return;
  const now=performance.now();
  if(now-lastHapticAt<(kind==='goal'?300:100))return;
  lastHapticAt=now;
  const goal=kind==='goal';
  try{
   const pending=actuator.playEffect('dual-rumble',{duration:goal?155:36,
    startDelay:0,weakMagnitude:goal?.5:.18,strongMagnitude:goal?.26:0});
   if(pending&&typeof pending.catch==='function')pending.catch(()=>{});
  }catch{/* No supported rumble actuator; continue the normal input path. */}
 }
 function updateHaptics(pad){
  const allowed=playable();
  const pressed=!!pad&&kicking(pad);
  if(allowed&&preferences.kickPulse&&pressed&&!lastHeldKick)pulse(pad,'kick');
  lastHeldKick=pressed;
  const state=allowed&&typeof room!=='undefined'?room?.gameState:null;
  const red=state?.redScore,blue=state?.blueScore;
  if(!allowed||!Number.isSafeInteger(red)||!Number.isSafeInteger(blue)){
   lastScore=null;return;
  }
  if(lastScore&&lastScore.room===room&&red>=lastScore.red&&blue>=lastScore.blue&&
   (red>lastScore.red||blue>lastScore.blue)&&preferences.goalPulse)pulse(pad,'goal');
  lastScore={room,red,blue};
 }
 function frame(){
  const pad=controller();
  refreshControllerRecovery();
  describe(pad);
  const start=pad?isHeld(pad,9):false;
  if(start&&!wasStart&&!['couchRivals','couchRivals3v3','couchRivals4v4'].includes($('mode').value)&&
     windowInputFocused&&!document.hidden&&!$('matchView').hidden&&
     $('joinScreen').hidden&&$('chatForm').hidden&&
     !document.querySelector('dialog[open]')){
   // Menu control is edge-triggered, never fires repeatedly while held.
   toggleMatchMenu();
  }
  wasStart=start;
  updateHaptics(pad);
  const state=read(),signature=[state.x,state.y,state.kick,playable()].join(':');
  if(signature!==lastSignature){
   lastSignature=signature;
   // Route through the existing de-duplicating sendInput() path.
   // The app handles local game, signed-in server and peer guest identically.
   if(started&&!paused&&!replay)refreshInput();
  }
  requestAnimationFrame(frame);
 }
 // Controller setup on the Play screen can update the existing input pipeline
 // immediately; no page reload, alternate movement messages or server changes.
 window.addEventListener('fuckball-gamepad-config',event=>{
  const next=event.detail;
  if(!next||!kickValid(next.kick)||
   !Number.isFinite(next.deadzone)||next.deadzone<.15||next.deadzone>.65||
   (next.stick!==undefined&&!['left','right'].includes(next.stick))||
   (next.invertX!==undefined&&typeof next.invertX!=='boolean')||
   (next.invertY!==undefined&&typeof next.invertY!=='boolean')||
   (next.kickPulse!==undefined&&typeof next.kickPulse!=='boolean')||
   (next.goalPulse!==undefined&&typeof next.goalPulse!=='boolean'))return;
  preferences.kick=next.kick;
  preferences.deadzone=next.deadzone;
  preferences.stick=next.stick||'left';
  preferences.invertX=next.invertX??false;preferences.invertY=next.invertY??false;
  preferences.kickPulse=next.kickPulse??false;preferences.goalPulse=next.goalPulse??false;
  kickSelect.value=next.kick;deadzone.value=String(next.deadzone);
  stickSelect.value=preferences.stick;flipX.checked=preferences.invertX;
  flipY.checked=preferences.invertY;
  kickPulse.checked=preferences.kickPulse;goalPulse.checked=preferences.goalPulse;
  deadzoneValue.textContent=Math.round(next.deadzone*100)+'%';
  lastSignature=''; // Reapply a held input on the next native animation frame.
 });
 // The Play-screen source selector chooses an ephemeral Gamepad API index.
 // No hardware ID is saved or sent to a server; a disconnected choice is neutral.
 window.addEventListener('fuckball:controller-source',event=>{
  const index=event.detail?.index;
  if(index!==null&&(!Number.isSafeInteger(index)||index<0||index>15))return;
  chosenIndex=index;active=null;lastSignature='';connected='';
  // This event is a deliberate player action, including rebinding the same
  // port. It is the only mid-match way to authorize a different controller.
  if(liveP1Session()){
   let pads=[];
   try{pads=typeof navigator.getGamepads==='function'?navigator.getGamepads():[];}catch{}
   const selected=index===null?
    Array.from(pads).find(p=>p?.connected&&p.index!==reservedP2()):
    pads[index];
   liveSeatOne=selected?.connected&&selected.index!==reservedP2()?
    {index:selected.index,id:selected.id}:null;
   liveSeatLocked=true;
  }
  if(localSeatLocked&&localTwoHumanMode()){
   const pads=typeof navigator.getGamepads==='function'?navigator.getGamepads():[];
   const chosen=index===null?
    Array.from(pads).find(p=>p?.connected&&p.index!==reservedP2()):
    pads[index];
   localSeatOne=chosen?.connected&&chosen.index!==reservedP2()?
    {index:chosen.index,id:chosen.id}:null;
  }
  // Require a fresh Start press on the new controller instead of opening
  // the in-game menu just because Start was held during the switch.
  wasStart=true;
 });
 window.fuckballGamepad={read,sourceIndex:()=>controller()?.index??null,
  sourceStatus:()=>{
   if(localSeatLocked&&localTwoHumanMode())return{
    locked:true,connected:!!controller(),port:localSeatOne?.index??null};
   return {locked:liveSeatLocked&&liveP1Session(),
    connected:!!controller(),port:liveSeatOne?.index??null};
  }};
 window.addEventListener('fuckball:local-match-kickoff',()=>{
  localSeatLocked=false;
  liveSeatLocked=false;liveSeatOne=null;
  if(!localTwoHumanMode())return;
  const pad=controller();
  localSeatOne=pad?{index:pad.index,id:pad.id}:null;
  localSeatLocked=true;
  lastSignature='';
 });
 // Some browsers disconnect and reconnect an identical controller between
 // two animation frames. Observe the disconnect event too so port+model ID
 // reuse never inherits P1's human seat without an explicit rebind.
 window.addEventListener('gamepaddisconnected',event=>{
  const index=event?.gamepad?.index;
  if(!Number.isSafeInteger(index))return;
  if(liveSeatLocked&&liveSeatOne?.index===index)liveSeatOne.lost=true;
  if(localSeatLocked&&localSeatOne?.index===index)localSeatOne.lost=true;
  lastSignature='';wasStart=true;
  refreshControllerRecovery();
  if(typeof refreshInput==='function'&&typeof started!=='undefined'&&started)
   refreshInput();
 });
 // App blur/visibility handlers deliberately release input; reapply the
 // held controller state after focus even when its axes never changed.
 window.addEventListener('focus',()=>{lastSignature='';});
 document.addEventListener('visibilitychange',()=>{lastSignature='';});
 requestAnimationFrame(frame);
})();
