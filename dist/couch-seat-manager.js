'use strict';
// Read-only native Gamepad API readiness display for four-human couch sessions.
// Never sends controller IDs or input diagnostics to an online room.
(function(){
 const home=document.getElementById('homeView');
 const panel=home?.querySelector('.couch-rivals-names');
 if(!panel||!window.fuckballCouchRivals?.preview)return;
 const el=(tag,text,klass)=>{const e=document.createElement(tag);
  if(text!=null)e.textContent=text;if(klass)e.className=klass;return e;};
 const shell=el('section',null,'couch-seat-manager');
 shell.append(el('h3','CONTROLLER LINEUP · LIVE'));
 shell.append(el('p','Red P1: WASD/F · Red P2: arrows/Enter. Blue needs two separate standard gamepads. Press a button on each controller so the browser can detect them.'));
 const info=el('p','Checking controller seats…','couch-seat-readiness');
 info.setAttribute('role','status');info.setAttribute('aria-live','polite');
 const seats=el('div',null,'couch-seat-grid');
 const rows=new Map();
 for(const id of [3,4]){
  const row=el('div',null,'couch-seat');
  const title=el('strong','BLUE · PLAYER '+id);
  const location=el('span','No gamepad','couch-seat-location');
  const activity=el('output','Move the stick or press A / X to preview input.','couch-seat-input');
  row.append(title,location,activity);seats.append(row);
  rows.set(id,{row,location,activity});
 }
 shell.append(info,seats);panel.append(shell);
 let lastStatus='',lastTime=0;
 const held=(pad,index)=>pad?.buttons?.[index]?.pressed===true||
  (Number(pad?.buttons?.[index]?.value)||0)>.6;
 function paint(now){
  requestAnimationFrame(paint);
  if(document.hidden||!panel.open||home.hidden||now-lastTime<120)return;
  lastTime=now;
  const selection=window.fuckballCouchRivals.preview();
  const status=selection.locked?
   (selection.ok?'BLUE LIVE · BOTH ORIGINAL CONTROLLERS CONNECTED':
    'BLUE LIVE · LOST SEAT · REBIND REQUIRED · '+selection.message):
   selection.ok?'BLUE READY · 2 / 2 separate standard gamepads':
    (selection.message||'Waiting for two separate controllers');
  if(status!==lastStatus){lastStatus=status;info.textContent=status;}
  let attached=[];
  try{attached=Array.from(navigator.getGamepads?.()||[]);}catch{}
  for(const id of [3,4]){
   const row=rows.get(id),choice=selection.players?.find(p=>p.seat===id);
   // A new gamepad with another hardware identity is NOT the locked seat.
   // Prefer the authoritative lock receipt over the live free-port preview.
   const pad=choice&&Number.isSafeInteger(choice.index)?attached[choice.index]:null;
   if(!choice||choice.connected===false||!pad||!pad.connected||
      String(pad.id||'Controller').slice(0,60)!==choice.id){
    row.row.classList.remove('ready');
    const previous=choice&&Number.isSafeInteger(choice.index)?
     'PORT '+(choice.index+1)+' · ORIGINAL CONTROLLER LOST':'NO RESERVED CONTROLLER';
    row.location.textContent=previous;
    row.activity.textContent=selection.locked?
     'P'+id+' input is NEUTRAL. Reconnect the original device or choose Bind / replace Player '+id+'.':
     'Connect a standard controller and assign a unique port.';
    continue;
   }
   row.row.classList.add('ready');
   row.location.textContent='PORT '+(pad.index+1)+' · '+choice.id.slice(0,32)+
    (selection.locked?' · LOCKED P'+id:' · PREVIEW');
   let x=Number(pad.axes?.[0])||0,y=Number(pad.axes?.[1])||0;
   x=Math.abs(x)<.3?0:Math.sign(x);y=Math.abs(y)<.3?0:Math.sign(y);
   if(held(pad,14))x=-1;if(held(pad,15))x=1;
   if(held(pad,12))y=-1;if(held(pad,13))y=1;
   const horizontal=x<0?'←':x>0?'→':'·',vertical=y<0?'↑':y>0?'↓':'·';
   row.activity.textContent='MOVE '+horizontal+' '+vertical+' · '+
    (held(pad,0)||held(pad,2)||held(pad,7)?'● KICK HELD':'○ KICK RELEASED');
  }
 }
 requestAnimationFrame(paint);

 // An unplugged Blue controller must not cost its human team a goal while
 // the other three players keep playing. The approved Couch Rivals module
 // already locks original Gamepad API seats and neutralizes lost input.
 // Recover using its explicit per-human rebind rather than assigning ports.
 const recovery=el('aside',null,'couch-live-recovery');
 recovery.hidden=true;
 recovery.setAttribute('role','region');
 recovery.setAttribute('aria-label','Couch match controller recovery');
 const recoveryHeading=el('strong','LOCAL MATCH · CONTROLLER LOST');
 const recoveryInfo=el('p','','couch-live-recovery-status');
 recoveryInfo.setAttribute('role','status');
 recoveryInfo.setAttribute('aria-live','polite');
 const recoverySeats=el('div',null,'couch-live-recovery-seats');
 const recoveryRows=new Map();
 for(const seat of [3,4]){
  const field=el('div',null,'couch-live-recovery-seat');
  const heading=el('label','Blue player '+seat+' · controller port');
  const select=el('select');
  select.setAttribute('aria-label','Choose replacement controller for player '+seat);
  const bind=el('button','↻ Bind player '+seat+' controller');
  bind.type='button';
  bind.addEventListener('click',()=>{
   if(!liveCouchSession())return;
   const source=select.value==='auto'?'auto':Number(select.value);
   const outcome=window.fuckballCouchRivals?.rebind?.(seat,source);
   if(outcome?.message)recoveryInfo.textContent=outcome.message;
   renderRecovery();
  });
  heading.append(select);field.append(heading,bind);
  recoveryRows.set(seat,{field,select,bind});
  recoverySeats.append(field);
 }
 const recoveryActions=el('div',null,'couch-live-recovery-actions');
 const resume=el('button','▶ Resume once all controllers are bound');
 resume.type='button';resume.className='primary';
 const returnToPitch=el('button','↗ Return to pitch');
 returnToPitch.type='button';
 recoveryActions.append(resume,returnToPitch);
 recovery.append(recoveryHeading,recoveryInfo,recoverySeats,recoveryActions);
 document.body.append(recovery);
 let recoveryRequired=false,lastPorts='';
 function liveCouchSession(){
  return typeof started!=='undefined'&&started&&
   typeof serverLink!=='undefined'&&!serverLink&&
   typeof peerConnected!=='undefined'&&!peerConnected&&
   typeof peer!=='undefined'&&!peer&&
   typeof replay!=='undefined'&&!replay&&
   ['couchRivals','couchRivals3v3','couchRivals4v4']
    .includes(document.getElementById('mode')?.value);
 }
 function renderRecovery(){
  if(!liveCouchSession()){
   recoveryRequired=false;recovery.hidden=true;lastPorts='';return;
  }
  // Browsers may suppress Gamepad API snapshots in background tabs. A
  // missing background snapshot is not proof a human unplugged their pad;
  // the existing local focus guard already pauses the match when hidden.
  if(document.hidden){recovery.hidden=true;return;}
  const state=window.fuckballCouchRivals?.seatStatus?.();
  if(!state)return;
  const missing=state.assigned?state.missing:[3,4];
  if(missing.length){
   recoveryRequired=true;
   // The real local pause path stops the physics clock and clears held
   // movement/kick commands. Never pause native/peer online matches.
   if(!paused)togglePause();
  }
  if(!recoveryRequired){recovery.hidden=true;return;}
  if(!missing.length&&!paused){recoveryRequired=false;recovery.hidden=true;return;}
  recovery.hidden=document.hidden;
  if(recovery.hidden)return;
  recoveryHeading.textContent=missing.length?'LOCAL MATCH PAUSED · CONTROLLER LOST':
   'CONTROLLERS READY · MATCH PAUSED';
  if(missing.length){
   const message='Blue '+missing.map(id=>'P'+id).join(' and ')+
    ' lost its original controller. The match is paused; input stays neutral. '+
    'Select a free port and explicitly bind each player. No automatic replacement.';
   if(!recoveryInfo.textContent||!recoveryInfo.textContent.startsWith('Blue '))
    recoveryInfo.textContent=message;
   else if(!recoveryInfo.textContent.includes(missing.map(id=>'P'+id).join(' and ')))
    recoveryInfo.textContent=message;
  }else{
   recoveryInfo.textContent='Both original human seats are explicitly bound. '+
    'Resume only when all four players are ready.';
  }
  const pads=window.fuckballCouchRivals?.available?.()||[];
  const signature=pads.map(p=>p.index+':'+p.id).join('|')+'|'+
   state.seats.map(s=>s.seat+':'+s.port).join('|');
  if(signature!==lastPorts){
   lastPorts=signature;
   for(const seat of [3,4]){
    const row=recoveryRows.get(seat),other=state.seats.find(s=>s.seat!==seat);
    const previous=row.select.value||'auto';
    row.select.replaceChildren();
    row.select.add(new Option('Choose only available free controller','auto'));
    const free=pads.filter(p=>p.index!==other?.port);
    for(const pad of free)
     row.select.add(new Option('Port '+(pad.index+1)+' · '+pad.id.slice(0,44),String(pad.index)));
    row.select.value=free.some(p=>String(p.index)===previous)?previous:'auto';
    row.bind.disabled=!free.length;
   }
  }
  for(const seat of [3,4])recoveryRows.get(seat).field.hidden=!missing.includes(seat);
  resume.disabled=!!missing.length||!paused||document.hidden;
  returnToPitch.hidden=!document.getElementById('matchView')?.hidden;
 }
 resume.addEventListener('click',()=>{
  if(!liveCouchSession()||!recoveryRequired)return;
  if(window.fuckballCouchRivals.seatStatus()?.missing.length||!paused)return;
  if(document.hidden||document.getElementById('matchView')?.hidden||
    typeof menuOpen!=='undefined'&&menuOpen||
    document.querySelector('dialog[open]')){
   recoveryInfo.textContent='Return to the pitch and close any match menu before resuming.';
   return;
  }
  togglePause();renderRecovery();
 });
 returnToPitch.addEventListener('click',()=>{
  if(!liveCouchSession())return;
  document.getElementById('tabPlay')?.click();
  renderRecovery();
 });
 const recoveryTicker=setInterval(renderRecovery,300);
 recoveryTicker?.unref?.();
 window.addEventListener('gamepaddisconnected',()=>queueMicrotask(renderRecovery));
 window.addEventListener('gamepadconnected',()=>queueMicrotask(renderRecovery));
 document.addEventListener('visibilitychange',renderRecovery);
 window.addEventListener('focus',renderRecovery);
 renderRecovery();
})();
