'use strict';
// Visible controller for the existing native room reconnect transport. It never
// stores an account token or private resume ticket, nor sends room messages.
(function(){
 const match=document.getElementById('matchView');
 if(!match)return;
 const panel=document.createElement('aside');
 panel.className='native-room-recovery';
 panel.hidden=true;
 panel.setAttribute('aria-label','Room connection recovery');
 panel.setAttribute('role','region');
 panel.tabIndex=-1;
 const tag=document.createElement('span');tag.className='native-room-recovery-tag';tag.textContent='ROOM CONNECTION';
 const title=document.createElement('h2');title.textContent='Connection interrupted';
 const description=document.createElement('p');description.className='native-room-recovery-description';
 const progress=document.createElement('p');progress.className='native-room-recovery-progress';
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const actions=document.createElement('div');actions.className='native-room-recovery-actions';
 const retry=document.createElement('button');retry.type='button';retry.className='primary';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Leave room';
 actions.append(retry,cancel);
 const note=document.createElement('p');note.className='native-room-recovery-note';
 note.textContent='Existing room and player identity are requested from the server. A restored slot is never guaranteed; no bot is substituted for you.';
 panel.append(tag,title,description,progress,actions,note);
 // Keep recovery visible while the player browses Home or My Games. The
 // original matchView is frequently hidden at the moment the socket drops.
 // This panel is strictly a view onto the existing reconnect/cancel callbacks.
 document.body.append(panel);
 let refreshTimer=null,deadline=0,handlers=null;
 function hide(){
  if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null;}
  handlers=null;deadline=0;panel.hidden=true;
  retry.onclick=null;cancel.onclick=null;
 }
 function show(info){
  if(!info||!['waiting','connecting','offline','failed'].includes(info.phase))return;
  const firstAppearance=panel.hidden;
  hide();handlers=info;panel.hidden=false;
  if(firstAppearance)panel.focus({preventScroll:true});
  title.textContent=info.phase==='failed'?'Could not rejoin your room':
   info.phase==='offline'?'Your device is offline':
   info.phase==='connecting'?'Joining your room again…':'Connection interrupted';
  description.textContent=info.phase==='failed'?
   'Automatic attempts ended. Choose whether to try the original room again or leave.':
   info.phase==='offline'?
   'The browser reports no connection. We will continue when it reports being online again, unless you cancel.':
   info.phase==='connecting'?
   'Contacting the original room server. Your spot and match state are restored only if it accepts your identity.':
   'The connection dropped. We will retry this room automatically unless you cancel.';
  const current=Number.isSafeInteger(info.attempt)?info.attempt:0;
  const max=Number.isSafeInteger(info.max)?info.max:3;
  deadline=Number.isFinite(info.delay)&&info.delay>0?Date.now()+info.delay:0;
  function update(){
   const base=info.phase==='failed'?'Automatic reconnect stopped':
    info.phase==='offline'?'Waiting for the device to come online':
    info.phase==='connecting'?'Attempt '+current+' of '+max+' · contacting server':
    'Attempt '+current+' of '+max+' · retry in '+Math.max(0,Math.ceil((deadline-Date.now())/1000))+'s';
   progress.textContent=base;
  }
  update();
  if(deadline)refreshTimer=setInterval(update,250);
  retry.hidden=info.phase==='connecting';
  retry.textContent=info.phase==='failed'?'Try joining again':info.phase==='offline'?'Retry connection':'Reconnect now';
  retry.disabled=typeof info.retry!=='function';
  retry.onclick=()=>{if(handlers!==info)return;info.retry?.();};
  cancel.textContent=info.phase==='failed'?'Back to home':'Stop reconnecting';
  cancel.onclick=()=>{if(handlers!==info)return;info.cancel?.();};
 }
 window.FuckballRoomRecovery={show,hide};
 window.addEventListener('pagehide',hide);
})();
