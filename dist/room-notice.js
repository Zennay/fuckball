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
 let activeRoom=null,hiddenHud=false,seenAt=0,submitted=false;
 function current(){return typeof serverLink!=='undefined'?serverLink:null;}
 function canEdit(link){return !!link?.room&&!link.quickMatchMode&&
  link.roomControl?.roomNoticeSupported===true&&link.isOwner===true;}
 function render(){
  const link=current(),currentId=link?.room||null;
  if(currentId!==activeRoom){
   activeRoom=currentId;hiddenHud=false;seenAt=0;submitted=false;
   input.value='';notice.textContent='';
  }
  const supported=!!currentId&&!link?.quickMatchMode&&
   link.roomControl?.roomNoticeSupported===true;
  const data=supported?link.roomControl.notice:null;
  panel.hidden=!supported;
  editor.hidden=!canEdit(link);
  if(!supported){hud.hidden=true;showNotice.hidden=true;return;}
  body.textContent=data?.text||'No briefing pinned by this room host.';
  by.textContent=data?'Pinned by '+data.by:'Only the current host can pin or change this note.';
  if(data?.at!==seenAt){
   seenAt=data?.at||0;
   if(document.activeElement!==input)input.value=data?.text||'';
   if(submitted){notice.textContent='Room server confirmed the updated briefing.';submitted=false;}
  }
  const available=!!data?.text&&!match.hidden;
  hud.hidden=!available||hiddenHud;
  showNotice.hidden=!available||!hiddenHud;
  if(data)hudText.textContent=data.text;
  clear.disabled=!data;
 }
 function send(type){
  const link=current();
  if(!canEdit(link)){notice.textContent='You must be the connected room host.';return;}
  if(type==='roomNoticeSet'){
   const value=input.value.trim();
   if(!value||value.length>120||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(value)){
    notice.textContent='Enter 1–120 printable characters.';return;
   }
   link.send({type,text:value});
  }else link.send({type});
  submitted=true;
  notice.textContent='Submitted to room server; awaiting authoritative update.';
 }
 save.onclick=()=>send('roomNoticeSet');
 clear.onclick=()=>send('roomNoticeClear');
 dismiss.onclick=()=>{hiddenHud=true;render();};
 showNotice.onclick=()=>{hiddenHud=false;render();};
 window.FuckballRoomNotice={sync:render};
 render();
 setInterval(render,1500); // local HUD/menu state only, no background sending.
})();
