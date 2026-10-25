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
})();
