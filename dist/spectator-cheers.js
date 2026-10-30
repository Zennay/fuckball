'use strict';
// Real Custom Room spectator cheers. Server admission, moderation and rate limits
// apply on every click; these UI reactions never modify the 60 Hz simulation.
(function(){
 const match=document.getElementById('matchView');
 if(!match||typeof spectatorToolbar==='undefined')return;
 const KINDS=Object.freeze({clap:'👏',fire:'🔥',ball:'⚽',heart:'💚'});
 const tray=document.createElement('div');tray.className='spectator-cheer-actions';
 tray.hidden=true;tray.setAttribute('role','group');tray.setAttribute('aria-label','Send spectator cheers');
 const label=document.createElement('span');label.className='spectator-cheer-label';
 label.textContent='CHEER · PUBLIC';
 tray.append(label);
 const flash=document.createElement('span');flash.className='spectator-cheer-status';
 flash.setAttribute('role','status');
 flash.setAttribute('aria-live','polite');
 const eventBox=document.createElement('div');eventBox.className='spectator-cheer-feed';
 eventBox.setAttribute('aria-label','Spectator reactions');
 eventBox.setAttribute('aria-live','off');eventBox.hidden=true;
 match.append(eventBox);
 const hide=document.createElement('button');hide.type='button';hide.className='spectator-cheer-hide';
 hide.setAttribute('aria-label','Toggle spectator reaction overlays');
 let show=true;
 try{show=localStorage.getItem('fuckball.spectator-cheers.visible')!=='no';}catch{}
 function updateHide(){hide.textContent=show?'Cheer overlays: ON':'Cheer overlays: OFF';
  hide.setAttribute('aria-pressed',String(show));if(!show){eventBox.replaceChildren();eventBox.hidden=true;}}
 hide.onclick=()=>{show=!show;try{localStorage.setItem('fuckball.spectator-cheers.visible',show?'yes':'no');}catch{}
  updateHide();};
 updateHide();
 let currentRoom=null,currentLink=null,lastSent=0,lastReceived=0;
 let pending=null,pendingTimer=null;
 const cheerButtons=[];
 function clearPending(){
  if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null;}
  pending=null;
 }
 function awaitingReceipt(link){
  return !!pending&&pending.link===link&&pending.room===link?.room;
 }
 function nativeSpectator(l){
  // The native send helper intentionally ignores closed sockets. Do not tell
  // a human they cheered, or consume the local cooldown, when no packet left.
  if(!l?.room||l?.ws?.readyState!==1||l?.quickMatchMode||
     l?.roomControl?.spectatorCheerSupported!==true)return false;
  if(typeof networkPlayerId!=='number'||networkPlayerId<1)return false;
  const players=typeof room!=='undefined'?room?.state?.players:null;
  const player=players?.find?.(p=>p?.id===networkPlayerId);
  const team=typeof player?.team==='number'?player.team:player?.team?.id;
  return team===0&&!botIds.has(networkPlayerId)&&
   !l?.roomState?.disconnectedIds?.includes?.(networkPlayerId);
 }
 function sync(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const next=link?.room||null;
  if(next!==currentRoom||link!==currentLink){
   const abandoned=!!pending;
   clearPending();currentRoom=next;currentLink=link;
   eventBox.replaceChildren();eventBox.hidden=true;
   lastSent=0;lastReceived=0;
   flash.textContent=abandoned&&next?
    'Previous cheer was not confirmed. A new room connection is active.':'';
  }
  if(pending&&link?.ws?.readyState!==1){
   clearPending();
   flash.textContent='Connection interrupted before server confirmation. Reconnect to cheer.';
  }
  const supported=!!next&&!link.quickMatchMode&&link.roomControl?.spectatorCheerSupported===true;
  tray.hidden=!nativeSpectator(link)||match.hidden||document.hidden||
   typeof replay!=='undefined'&&!!replay;
  hide.hidden=!supported;
  for(const button of cheerButtons)button.disabled=tray.hidden||awaitingReceipt(link);
 }
 for(const [kind,emoji] of Object.entries(KINDS)){
  const button=document.createElement('button');button.type='button';
  button.textContent=emoji;button.title='Cheer '+kind;
  button.setAttribute('aria-label','Send '+kind+' reaction to Custom Room');
  button.addEventListener('click',()=>{
   const link=typeof serverLink!=='undefined'?serverLink:null;
   if(!nativeSpectator(link)||match.hidden||document.hidden||
      typeof replay!=='undefined'&&!!replay){
    flash.textContent='Join as a connected spectator and return to the live match to cheer.';
    sync();return;
   }
   if(awaitingReceipt(link)){
    flash.textContent='Waiting for the room server to confirm your previous cheer.';
    return;
   }
   if((link.chatMutedUntil||link.roomControl?.chatMuteUntil||0)>FuckballRoomServerTime.now(link)){
    flash.textContent='Cheering is muted by the host.';return;
   }
   const now=performance.now();
   if(now-lastSent<3100){flash.textContent='Cheer available every three seconds.';return;}
   // Only one bounded, allowlisted reaction. Never send names/room state.
   // A send is NOT a receipt: muted, rate-limited or unadmitted actions may
   // never be echoed. Wait for this exact socket's server broadcast.
   try{link.send({type:'spectatorCheer',kind});}
   catch{flash.textContent='Could not send cheer. Check connection and retry.';return;}
   lastSent=now;
   const attempt={link,room:link.room,kind};
   pending=attempt;
   flash.textContent='Cheer sent · waiting for public server confirmation…';
   pendingTimer=setTimeout(()=>{
    if(pending!==attempt)return;
    clearPending();
    flash.textContent='No server receipt for this cheer. You can retry explicitly.';
    sync();
   },4700);
   sync();
  });
  cheerButtons.push(button);
  tray.append(button);
 }
 tray.append(flash);
 spectatorToolbar.append(tray,hide);
 function receive(d){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||
    d?.room!==link.room||link.quickMatchMode||
    !Number.isSafeInteger(d.from)||d.from<1||
    typeof d.name!=='string'||d.name.length<1||d.name.length>25||
    typeof d.kind!=='string'||!Object.hasOwn(KINDS,d.kind)||
    !Number.isSafeInteger(d.at)||d.at<=0)return;
  const serverNow=FuckballRoomServerTime.now(link);
  if(serverNow-d.at>20000||d.at>serverNow+10000)return;
  // The server broadcasts accepted cheers back to their sender. Treat
  // only that same original link/room/player/kind as an authoritative receipt.
  if(awaitingReceipt(link)&&d.from===networkPlayerId&&d.kind===pending.kind){
   clearPending();lastReceived=performance.now();
   flash.textContent='✓ Cheer accepted and broadcast by the room server.';
   sync();
  }
  if(!show||document.hidden||match.hidden)return;
  const row=document.createElement('div');row.className='spectator-cheer-line';
  const badge=document.createElement('span');badge.textContent=KINDS[d.kind];
  const author=document.createElement('span');author.textContent=d.name+' is cheering';
  row.append(badge,author);eventBox.append(row);eventBox.hidden=false;
  while(eventBox.childElementCount>4)eventBox.firstElementChild?.remove();
  const token=++lastReceived;
  setTimeout(()=>{row.remove();if(token===lastReceived&&!eventBox.childElementCount)eventBox.hidden=true;},4800);
 }
 document.addEventListener('visibilitychange',sync);
 window.FuckballSpectatorCheer={sync,receive};
 sync();
 setInterval(sync,1200); // UI only, never sends packets automatically.
})();
