'use strict';
// Host-pinned Custom Room briefing, supplied by the real room control-plane.
// This client never invents an announcement or writes any authoritative data.
(function(){
 const menu=document.getElementById('menuMatchPane'),match=document.getElementById('matchView');
 if(!menu||!match)return;
 const panel=document.createElement('section');
 panel.className='room-notice-panel';panel.hidden=true;
 panel.setAttribute('aria-label','Custom Room pinned notice');
 const heading=document.createElement('h3');heading.textContent='📌 ROOM BRIEFING';
 const body=document.createElement('p');body.className='room-notice-body';
 const by=document.createElement('small');by.className='room-notice-by';
 const editor=document.createElement('div');editor.className='room-notice-editor';editor.hidden=true;
 const label=document.createElement('label');label.textContent='Host announcement (max 120 characters)';
 const input=document.createElement('textarea');input.rows=2;input.maxLength=120;
 input.placeholder='Match format, rotation plan or code of conduct…';
 input.setAttribute('aria-label','Host pinned room announcement');
 label.append(input);
 const actions=document.createElement('div');actions.className='room-notice-actions';
 const save=document.createElement('button');save.type='button';save.className='primary';
 save.textContent='📌 Pin announcement';
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';
 const notice=document.createElement('p');notice.className='room-notice-status';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 actions.append(save,clear);editor.append(label,actions,notice);
 panel.append(heading,body,by,editor);menu.prepend(panel);
 const hud=document.createElement('aside');hud.className='room-notice-hud';hud.hidden=true;
 hud.setAttribute('aria-label','Host pinned room notice');
 const hudTitle=document.createElement('strong');hudTitle.textContent='📌 HOST BRIEFING';
 const hudText=document.createElement('span');
 const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Hide';
 dismiss.setAttribute('aria-label','Hide room briefing overlay on this device');
 const showNotice=document.createElement('button');showNotice.type='button';
 showNotice.className='room-notice-show';showNotice.textContent='📌 Show briefing';
 showNotice.hidden=true;showNotice.setAttribute('aria-label','Restore room briefing overlay');
 hud.append(hudTitle,hudText,dismiss);match.append(hud,showNotice);
 // On Home/My Games the original match HUD is hidden. Surface only the
 // server-authored pinned briefing here, never a draft or inferred host text.
 const away=document.createElement('aside');away.className='room-notice-away';
 away.hidden=true;away.setAttribute('aria-label','Current room host briefing');
 const awayCopy=document.createElement('div');awayCopy.className='room-notice-away-copy';
 const awayTitle=document.createElement('strong');awayTitle.textContent='📌 ROOM HOST BRIEFING';
 const awayText=document.createElement('p');
 const awayBy=document.createElement('small');
 awayCopy.append(awayTitle,awayText,awayBy);
 const awayActions=document.createElement('div');awayActions.className='room-notice-away-actions';
 const awayView=document.createElement('button');awayView.type='button';
 awayView.textContent='↗ View match';
 const awayDismiss=document.createElement('button');awayDismiss.type='button';
 awayDismiss.textContent='Hide';
 awayActions.append(awayView,awayDismiss);
 away.append(awayCopy,awayActions);document.body.append(away);
 const awayRestore=document.createElement('button');
 awayRestore.type='button';awayRestore.className='room-notice-away-restore';
 awayRestore.textContent='📌 Show room briefing';awayRestore.hidden=true;
 document.body.append(awayRestore);
 let activeRoom=null,activeSession=null,hiddenHud=false,seenKey=null,hiddenAwayKey=null;
 let pendingEdit=null;
 // A room code is a shareable locator, not a unique live WebSocket session.
 // The same code can be joined again with a different verified player/host.
 const noticeKey=data=>data&&Number.isSafeInteger(data.at)?
  JSON.stringify([data.at,data.by,data.text]):null;
 function current(){return typeof serverLink!=='undefined'?serverLink:null;}
 function canEdit(link){return !!link?.room&&link.ws?.readyState===1&&
  !link.quickMatchMode&&link.roomControl?.roomNoticeSupported===true&&link.isOwner===true;}
 function render(){
  const link=current(),currentId=link?.room||null;
  const sessionChanged=link!==activeSession,roomChanged=currentId!==activeRoom;
  if(sessionChanged||roomChanged){
   activeRoom=currentId;activeSession=link;
   hiddenHud=false;hiddenAwayKey=null;seenKey=null;
   // A prior socket's optimistic server receipt cannot confirm actions in a
   // newly admitted session, even when the visible shareable room code matches.
   const lostPending=!!pendingEdit;
   pendingEdit=null;
   // Do not move an unsent briefing or its dismissal between connections.
   input.value='';
   notice.textContent=lostPending&&currentId?
    'Room connection changed. Your earlier briefing update was not confirmed. Review the current server notice before editing.':'';
  }
  const supported=!!currentId&&!link?.quickMatchMode&&
   link.roomControl?.roomNoticeSupported===true;
  const data=supported?link.roomControl.notice:null;
  panel.hidden=!supported;
  editor.hidden=!canEdit(link);
  if(!supported){
   hud.hidden=true;showNotice.hidden=true;away.hidden=true;awayRestore.hidden=true;
   if(pendingEdit){pendingEdit=null;notice.textContent='Room is no longer available; no edit confirmed.';}
   return;
  }
  body.textContent=data?.text||'No briefing pinned by this room host.';
  by.textContent=data?'Pinned by '+data.by:'Only the current host can pin or change this note.';
  const version=noticeKey(data);
  if(version!==seenKey){
   seenKey=version;
   // Distinguish a truly changed server briefing even if two updates have
   // the same timestamp. Never overwrite a currently focused host draft.
   if(document.activeElement!==input)input.value=data?.text||'';
  }
  // The local click is not server confirmation. Only a later authoritative
  // roomControl state that matches this room and requested content is proof.
  if(pendingEdit){
   const expected=pendingEdit.text;
   const confirmed=pendingEdit.session===link&&pendingEdit.room===currentId&&
    (expected===null?!data?.text:
     data?.text===expected&&Number.isSafeInteger(data.at)&&data.at>pendingEdit.afterAt);
   if(confirmed){
    pendingEdit=null;notice.textContent='The server now shows your requested briefing.';
   }else if(Date.now()>=pendingEdit.until){
    pendingEdit=null;notice.textContent='No server confirmation received. Check the room connection and retry explicitly.';
   }
  }
  const available=!!data?.text&&!match.hidden;
  hud.hidden=!available||hiddenHud;
  showNotice.hidden=!available||!hiddenHud;
  if(data)hudText.textContent=data.text;
  save.disabled=!canEdit(link)||!!pendingEdit;
  clear.disabled=!data||!canEdit(link)||!!pendingEdit;
  // Honor consent overlays before a passive briefing; never obscure an
  // active ready check, rematch vote, reconnect or substitute consent.
  const urgent=!!document.querySelector(
   '.quick-ready-dock:not([hidden]),.native-rematch-dock:not([hidden]),'+
   '.native-room-recovery:not([hidden]),.native-sub-consent-dock:not([hidden])');
  const awayEligible=!!data?.text&&match.hidden&&!urgent;
  const dismissed=hiddenAwayKey!==null&&hiddenAwayKey===version;
  away.hidden=!awayEligible||dismissed;
  awayRestore.hidden=!awayEligible||!dismissed;
  if(awayEligible){
   if(awayText.textContent!==data.text)awayText.textContent=data.text;
   awayBy.textContent='Pinned by '+data.by+' · this room only';
  }
 }
 function send(type){
  const link=current();
  if(!canEdit(link)){
   notice.textContent='Only the connected room host can change the briefing. Your draft was not sent.';
   return;
  }
  if(pendingEdit){notice.textContent='Waiting for the room server. No duplicate update was sent.';return;}
  let expected=null;
  if(type==='roomNoticeSet'){
   const value=input.value.trim();
   if(!value||value.length>120||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(value)){
    notice.textContent='Enter 1–120 printable characters.';return;
   }
   expected=value;
  }
  const now=Date.now();
  try{
   link.send(expected===null?{type}:{type,text:expected});
   pendingEdit={session:link,room:link.room,text:expected,
    afterAt:link.roomControl?.notice?.at||0,
    until:now+6000};
   notice.textContent='Sent to the room server; waiting for its updated briefing.';
   render();
  }catch{
   pendingEdit=null;
   notice.textContent='Could not send to this room. Your draft is preserved; retry after reconnecting.';
  }
 }
 save.onclick=()=>send('roomNoticeSet');
 clear.onclick=()=>send('roomNoticeClear');
 dismiss.onclick=()=>{hiddenHud=true;render();};
 showNotice.onclick=()=>{hiddenHud=false;render();};
 awayView.onclick=()=>{document.getElementById('tabPlay')?.click();render();};
 awayDismiss.onclick=()=>{hiddenAwayKey=noticeKey(current()?.roomControl?.notice);render();};
 awayRestore.onclick=()=>{hiddenAwayKey=null;render();awayView.focus?.({preventScroll:true});};
 window.FuckballRoomNotice={sync:render};
 render();
 // Disconnect/welcome transitions must immediately invalidate old room UI,
 // rather than leaving a dismissed or falsely confirmed notice for 1.5s.
 window.addEventListener('fuckball:native-session-state',render);
 document.addEventListener('visibilitychange',render);
 window.addEventListener('focus',render);
 setInterval(render,1500); // local HUD/menu state only, no background sending.
})();
