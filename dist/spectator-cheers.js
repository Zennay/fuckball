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
 let currentRoom=null,lastSent=0,lastReceived=0;
 function nativeSpectator(l){
  if(!l?.room||l?.quickMatchMode||l?.roomControl?.spectatorCheerSupported!==true)return false;
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
  if(next!==currentRoom){currentRoom=next;eventBox.replaceChildren();eventBox.hidden=true;
   lastSent=0;lastReceived=0;flash.textContent='';}
  const supported=!!next&&!link.quickMatchMode&&link.roomControl?.spectatorCheerSupported===true;
  tray.hidden=!nativeSpectator(link)||match.hidden||document.hidden||
   typeof replay!=='undefined'&&!!replay;
  hide.hidden=!supported;
  if(supported&&tray.hidden)flash.textContent='';
 }
 for(const [kind,emoji] of Object.entries(KINDS)){
  const button=document.createElement('button');button.type='button';
  button.textContent=emoji;button.title='Cheer '+kind;
  button.setAttribute('aria-label','Send '+kind+' reaction to Custom Room');
  button.addEventListener('click',()=>{
   const link=typeof serverLink!=='undefined'?serverLink:null;
   if(!nativeSpectator(link)){flash.textContent='Only connected spectators can cheer.';sync();return;}
   if((link.chatMutedUntil||link.roomControl?.chatMuteUntil||0)>Date.now()){
    flash.textContent='Cheering is muted by the host.';return;
   }
   const now=performance.now();
   if(now-lastSent<3100){flash.textContent='Cheer available every three seconds.';return;}
   // Only one bounded, allowlisted reaction. Never send names/room state.
   link.send({type:'spectatorCheer',kind});
   lastSent=now;
   flash.textContent='Sent to room server · subject to moderation.';
  });
  tray.append(button);
 }
 tray.append(flash);
 spectatorToolbar.append(tray,hide);
 function receive(d){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!show||document.hidden||match.hidden||!link?.room||
    d?.room!==link.room||link.quickMatchMode||
    !Number.isSafeInteger(d.from)||d.from<1||
    typeof d.name!=='string'||d.name.length<1||d.name.length>25||
    typeof d.kind!=='string'||!Object.hasOwn(KINDS,d.kind)||
    !Number.isSafeInteger(d.at)||d.at<=0)return;
  if(Date.now()-d.at>20000||d.at>Date.now()+10000)return;
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
