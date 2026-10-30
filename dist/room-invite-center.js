'use strict';
// Invitations for the *existing* authenticated native Custom Room.
// Never creates public listings, joins on behalf of others or grants admission.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const section=document.createElement('section');
 section.className='room-invite-center';
 section.setAttribute('aria-label','Share this Custom Room');
 const heading=document.createElement('div');heading.className='room-invite-center-heading';
 const title=document.createElement('strong');title.textContent='INVITE YOUR TEAM.';
 const state=document.createElement('span');state.className='room-invite-center-state';
 heading.append(title,state);
 const description=document.createElement('p');
 description.textContent='Share a direct invite to this Custom Room. Only the live server decides whether a person can enter; sharing never publishes the room or bypasses passwords, Club membership or account requirements.';
 const linkLabel=document.createElement('label');linkLabel.textContent='Current room invite';
 const link=document.createElement('input');link.type='text';link.readOnly=true;link.spellcheck=false;
 link.setAttribute('aria-label','Current room invitation URL');
 linkLabel.append(link);
 const code=document.createElement('strong');code.className='room-invite-center-code';
 const actions=document.createElement('div');actions.className='room-invite-center-actions';
 function button(value,handler){
  const result=document.createElement('button');result.type='button';result.textContent=value;
  result.addEventListener('click',handler);actions.append(result);return result;
 }
 const status=document.createElement('p');status.className='room-invite-center-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const caution=document.createElement('p');caution.className='room-invite-center-caution';
 let current=null;
 const safeRoom=room=>typeof room==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(room);
 function snapshot(){
  const active=typeof serverLink==='undefined'?null:serverLink;
  // A room code retained on the client is not a live room invitation.
  // The original server-admitted WebSocket must still be open and usable.
  if(!active?.room||active.quickMatchMode||!safeRoom(active.room)||
     active.failed||active.recoveryAttempt||active.ws?.readyState!==1)return null;
  // Derive the invitation from the same current browser site used for native room links.
  // Ignore any externally supplied inviteLink input or saved stale room code.
  if(location.protocol!=='https:'&&location.protocol!=='http:')return null;
  const url=new URL(location.pathname,location.origin);
  url.searchParams.set('room',active.room);
  const current={room:active.room,url:url.href,control:active.roomControl||null,
   session:active,socket:active.ws};
  // Freeze the admission text at the moment a share/export starts. The server
  // can replace or mutate roomControl while a clipboard/share/PNG promise
  // awaits permission; checking only the room code would miss that change.
  return{...current,accessLabel:eligibility(current),accessNotice:warning(current)};
 }
 function eligibility(data){
  const settings=data.control;
  if(!settings)return 'ROOM VERIFIED · ACCESS RULES PENDING';
  if(settings.locked)return 'LOCKED · no new admissions currently';
  const requirements=[];
  if(settings.clubOnly)requirements.push('CLUB MEMBERSHIP REQUIRED');
  if(settings.accountsOnly)requirements.push('SIGN-IN REQUIRED');
  if(settings.accessKeyRequired===true)requirements.push('ACCESS KEY REQUIRED');
  if(requirements.length)return requirements.join(' · ');
  if(settings.listed)return 'PUBLICLY LISTED · server admission required';
  return 'UNLISTED · invite link only';
 }
 function warning(data){
  const s=data.control;
  if(!s)return 'The game server has confirmed this room code but has not reported all admission rules yet. Sharing never grants access.';
  if(s.locked)return 'The room is locked. This link will not unlock it or admit new players.';
  const requirements=[];
  if(s.clubOnly)requirements.push('Recipients must belong to the approved Club.');
  if(s.accountsOnly)requirements.push('Recipients must sign in.');
  if(s.accessKeyRequired===true)
   requirements.push('An access key is also required; share it separately, never inside this invite URL.');
  if(requirements.length)
   return requirements.join(' ')+' Only the server can admit visitors.';
  return s.listed?
   'This room is currently public. It can become unlisted, full or closed after sharing.':
   'Unlisted codes may still work until the room closes. Share only with intended recipients.';
 }
 // An original room ID may be reused after a real disconnect/reconnect.
 // Socket/link identity prevents reusing old QR and asynchronous UI receipts.
 const sameSession=(a,b)=>!!a&&!!b&&a.session===b.session&&
  a.socket===b.socket&&a.url===b.url;
 const sameSharePolicy=(a,b)=>sameSession(a,b)&&
  a.accessLabel===b.accessLabel&&a.accessNotice===b.accessNotice;
 // Browser clipboard permission can hang. Always recover to a manual share.
 function writeInviteClipboard(value){
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(err)=>{if(settled)return;settled=true;clearTimeout(deadline);if(err)reject(err);else resolve();};
   const deadline=setTimeout(()=>finish(Error('Clipboard timed out. Select the current invite manually, or retry.')),7000);
   try{Promise.resolve(navigator.clipboard.writeText(value)).then(()=>finish(),finish);}
   catch(err){finish(err);}
  });
 }

 function shareReceipt(previous,success){
  const current=snapshot();
  if(!sameSession(previous,current))
   return 'Room disconnected or changed while sharing. An older invitation may have been copied or sent; review the current room.';
  if(!sameSharePolicy(previous,current))
   return 'Room access rules changed while sharing. The link may have been copied or sent; review current admission requirements before inviting.';
  return success;
 }
 let menuShareEpoch=0;
 function showShareResult(epoch,message){
  if(epoch===menuShareEpoch)status.textContent=message;
 }
 function refresh(){
  const next=snapshot();section.hidden=!next;
  if(!next){
   if(current)menuShareEpoch++;
   hideQr();current=null;link.value='';code.textContent='';
   state.textContent='';caution.textContent='';status.textContent='';
   return;
  }
  if(current&&!sameSession(current,next)){
   menuShareEpoch++;hideQr();status.textContent='Room connection changed. Review the current invite.';
  }
  if(renderedQrUrl&&renderedQrUrl!==next.url)hideQr();
  // Keep copy/share actions bound to the *currently* active room.
  current=next;code.textContent='ROOM '+next.room;link.value=next.url;
  state.textContent=eligibility(next);
  caution.textContent=warning(next);
 }
 const currentRoom=()=>{
  const now=snapshot();
  if(!now)throw Error('No shareable native Custom Room is currently active.');
  refresh();return now;
 };
 async function copy(room,value,message,epoch){
  if(typeof navigator.clipboard?.writeText!=='function')
   throw Error('Clipboard access is unavailable. Select and copy the displayed link instead.');
  await writeInviteClipboard(value);
  showShareResult(epoch,shareReceipt(room,message));
 }
 button('Copy invite link',async()=>{
  const epoch=++menuShareEpoch;
  try{const room=currentRoom();showShareResult(epoch,'Copying current room link…');await copy(room,room.url,'Room invite link copied. Only the server can admit recipients.',epoch);}
  catch(e){if(epoch===menuShareEpoch){link.select?.();showShareResult(epoch,e.message||'Could not copy invitation. Select the current link manually.');}}
 });
 button('Copy room code',async()=>{
  const epoch=++menuShareEpoch;
  try{const room=currentRoom();showShareResult(epoch,'Copying current room code…');await copy(room,room.room,'Eight-character room code copied. No join attempt was made.',epoch);}
  catch(e){showShareResult(epoch,(e.message||'Could not copy code.')+' Use the visible code for manual copying.');}
 });
 button('Share via device',async()=>{
  const epoch=++menuShareEpoch;
  try{
   const room=currentRoom();
   if(typeof navigator.share!=='function')throw Error('Device sharing is unavailable. Use Copy invite link instead.');
   const details=eligibility(room);
   await navigator.share({title:'Fuckball Custom Room '+room.room,
    text:'Join my Fuckball Custom Room · '+details+'. Entry requires approval from the live game server.',
    url:room.url});
   showShareResult(epoch,shareReceipt(room,
    'Room invitation handed to your device share sheet; admission remains server-controlled.'));
  }catch(e){
   showShareResult(epoch,e?.name==='AbortError'?'Sharing cancelled.':
    e.message||'Device sharing failed.');
  }
 });
 // QR is encoded entirely in-browser from the currently valid, native room URL.
 // The local bundled MIT generator never sends private invitation codes away.
 const qrPanel=document.createElement('section');qrPanel.className='room-invite-qr';qrPanel.hidden=true;
 qrPanel.setAttribute('aria-label','Scan this room invitation QR');
 const qrHeading=document.createElement('strong');qrHeading.textContent='SCAN TO JOIN THIS ROOM';
 const qrCanvas=document.createElement('div');qrCanvas.className='room-invite-qr-image';
 const qrCodeText=document.createElement('p');qrCodeText.className='room-invite-qr-code';
 const qrHelp=document.createElement('p');
 qrHelp.textContent='Scan with the Fuckball Join your team QR reader or your phone camera. Sharing this link does not bypass the server’s room permissions.';
 qrPanel.append(qrHeading,qrCanvas,qrCodeText,qrHelp);
 let renderedQrUrl=null;
 function hideQr(){
  renderedQrUrl=null;qrPanel.hidden=true;qrCanvas.replaceChildren();
  qrCodeText.textContent='';
  if(typeof qrButton!=='undefined'){
   qrButton.textContent='Show room QR';qrButton.setAttribute('aria-expanded','false');
  }
 }
 const qrButton=button('Show room QR',()=>{
  try{
   const now=currentRoom();
   if(renderedQrUrl===now.url){hideQr();return;}
   hideQr();
   if(typeof QRCode!=='function')throw Error('QR rendering unavailable. Copy the native invite link instead.');
   new QRCode(qrCanvas,{text:now.url,width:224,height:224,colorDark:'#122c2b',
    colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
   renderedQrUrl=now.url;qrCodeText.textContent='ROOM '+now.room;
   qrPanel.hidden=false;qrButton.textContent='Hide room QR';
   qrButton.setAttribute('aria-expanded','true');
   status.textContent='QR generated on this device. '+warning(now);
  }catch(error){
   hideQr();status.textContent=error?.message||'Could not generate a room QR.';
  }
 });
 qrButton.setAttribute('aria-expanded','false');
 qrButton.setAttribute('aria-controls','roomInviteQr');
 qrPanel.id='roomInviteQr';
 // Shareable, scannable invite poster; rendered from the *current* local QR.
 // Never reuses a stale QR, uploads the URL or grants room admission.
 const downloadQr=document.createElement('button');downloadQr.type='button';
 downloadQr.className='room-invite-qr-download';
 downloadQr.textContent='↓ Save scannable QR card (PNG)';
 qrPanel.append(downloadQr);
 downloadQr.onclick=async()=>{
  downloadQr.disabled=true;
  try{
   const currentRoomData=currentRoom();
   if(renderedQrUrl!==currentRoomData.url||qrPanel.hidden)
    throw Error('Show the live room QR before saving its card.');
   const qrImage=qrCanvas.querySelector('canvas')||qrCanvas.querySelector('img');
   if(!qrImage)throw Error('Could not read the QR on this device.');
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('PNG drawing is unavailable on this device.');
   // Keep the artwork self-contained: no remote images, fonts or APIs.
   ctx.fillStyle='#0d2629';ctx.fillRect(0,0,1200,900);
   ctx.fillStyle='#d9f4ac';ctx.fillRect(0,0,1200,16);
   ctx.font='800 34px system-ui,sans-serif';
   ctx.fillText('FUCKBALL · CUSTOM ROOM',70,95);
   ctx.fillStyle='#d0e7dc';ctx.font='600 26px system-ui,sans-serif';
   ctx.fillText('SCAN TO JOIN',70,175);
   ctx.fillStyle='#ffffff';ctx.font='800 82px ui-monospace,monospace';
   ctx.fillText(currentRoomData.room,65,275);
   ctx.fillStyle='#daf1db';ctx.font='600 24px system-ui,sans-serif';
   ctx.fillText('This invite is not a pass.',70,340);
   ctx.fillText('The game server decides access.',70,382);
   ctx.fillStyle='#244744';ctx.fillRect(65,435,500,138);
   ctx.fillStyle='#e5f6c4';ctx.font='750 26px system-ui,sans-serif';
   ctx.fillText('ROOM ACCESS',90,480);
   const roomStatus=eligibility(currentRoomData);
   ctx.font='650 20px system-ui,sans-serif';
   // Access status is server-reported at card creation; it can change.
   ctx.fillText(roomStatus.slice(0,43),90,531,440);
   ctx.fillStyle='#fff';ctx.fillRect(685,150,438,438);
   ctx.drawImage(qrImage,712,177,384,384);
   ctx.font='600 25px system-ui,sans-serif';ctx.fillStyle='#d7ebdf';
   ctx.fillText('Current site:',70,661);
   ctx.font='500 20px ui-monospace,monospace';
   const address=currentRoomData.url;
   // Draw at most two visibly bounded lines; QR still encodes the full URL.
   ctx.fillText(address.slice(0,75),70,701,1050);
   if(address.length>75)ctx.fillText(address.slice(75,150),70,732,1050);
   ctx.fillStyle='#afc8bf';ctx.font='500 19px system-ui,sans-serif';
   ctx.fillText('A live Custom Room may be locked, full, restricted or closed after sharing.',70,818,1070);
   ctx.fillText('Open via Fuckball. Joining requires a separate deliberate action.',70,851,1070);
   const blob=await new Promise((resolve,reject)=>
    canvas.toBlob(value=>value?resolve(value):reject(Error('Cannot export this QR image.')),'image/png'));
   const latest=snapshot();
   if(!sameSession(currentRoomData,latest))
    throw Error('Room disconnected or changed during QR export. Open its live room QR and try again.');
   if(!sameSharePolicy(currentRoomData,latest))
    throw Error('Room admission settings changed during QR export. Refresh the access notice and generate a current card.');
   if(renderedQrUrl!==currentRoomData.url||qrPanel.hidden)
    throw Error('The current QR was closed or replaced during export; show it again.');
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=url;
   link.download='fuckball-room-'+currentRoomData.room+'-qr.png';
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
   status.textContent='Scannable QR invite PNG saved locally. Share only with intended recipients. '+warning(currentRoomData);
  }catch(error){
   status.textContent=error?.message||'Could not create your QR invitation image.';
  }finally{downloadQr.disabled=false;}
 };
 function escapeXml(value){
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
   .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
 }
 button('Download invite card SVG',()=>{
  try{
   const room=currentRoom(),safeUrl=escapeXml(room.url);
   const copy=escapeXml(eligibility(room)),notice=escapeXml(warning(room));
   const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'+
    '<title>Fuckball Custom Room '+room.room+' invitation</title>'+
    '<rect width="1200" height="630" fill="#102a31"/>'+
    '<rect width="1200" height="14" fill="#d5f68e"/>'+
    '<text x="65" y="98" font-family="system-ui,sans-serif" font-size="39" font-weight="800" fill="#ddf8ad">FUCKBALL · CUSTOM ROOM</text>'+
    '<text x="65" y="193" font-family="system-ui,sans-serif" font-size="31" fill="#c0d7cc">JOIN WITH THIS CODE</text>'+
    '<rect x="63" y="230" width="1074" height="145" rx="20" fill="#244c4a"/>'+
    '<text x="100" y="331" font-family="ui-monospace,monospace" font-size="95" font-weight="800" letter-spacing="13" fill="#fff">'+room.room+'</text>'+
    '<text x="68" y="438" font-family="system-ui,sans-serif" font-size="26" fill="#dff2e4">'+copy+'</text>'+
    '<text x="68" y="496" font-family="system-ui,sans-serif" font-size="19" fill="#c6dfd9">Code is for this website only. Open the link from your message to join.</text>'+
    '<text x="68" y="532" font-family="system-ui,sans-serif" font-size="17" fill="#c6dfd9">'+
    escapeXml(room.url.length>100?room.url.slice(0,97)+'…':room.url)+'</text>'+
    '<a href="'+safeUrl+'"><text x="68" y="576" font-family="system-ui,sans-serif" font-size="20" fill="#e4ffbe" text-decoration="underline">OPEN INVITE LINK ↗</text></a>'+
    '<text x="68" y="608" font-family="system-ui,sans-serif" font-size="13" fill="#b7cbc7">Unofficial invite. Server may reject access. Codes can expire.</text></svg>';
   // Only a locally generated, minimal image is downloaded; no network call.
   const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
   const url=URL.createObjectURL(blob);
   const anchor=document.createElement('a');anchor.href=url;
   anchor.download='fuckball-room-'+room.room+'-invite.svg';
   document.body.append(anchor);anchor.click();anchor.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
   status.textContent='Invite card saved locally. '+warning(room);
  }catch(e){status.textContent=e.message||'Could not export invitation card.';}
 });
 const reload=button('↻ Refresh room access',()=>{refresh();status.textContent=current?
  'Current room invitation and server-reported admission settings refreshed.':'No active Custom Room.';});
 reload.className='room-invite-center-refresh';
 section.append(heading,description,code,linkLabel,actions,qrPanel,caution,status);
 pane.append(section);section.hidden=true;
 // One-click invite sharing from both high-traffic views. These are read-only
 // affordances for the *same* server-confirmed native Custom Room, not another
 // room directory, public listing, client-owned join or permission override.
 const shareViews=[];
 function makeShareView(host,place){
  if(!host)return;
  const card=document.createElement('aside');card.className='room-invite-view-card';
  card.hidden=true;card.setAttribute('aria-label','Share current online Custom Room');
  const heading=document.createElement('div');heading.className='room-invite-view-heading';
  const summary=document.createElement('div');summary.className='room-invite-view-summary';
  const eyebrow=document.createElement('strong');eyebrow.textContent='PLAY WITH FRIENDS';
  const caption=document.createElement('p');caption.textContent='Share your current, server-confirmed room.';
  summary.append(eyebrow,caption);
  const roomTag=document.createElement('code');roomTag.className='room-invite-view-code';
  heading.append(summary,roomTag);
  const admission=document.createElement('p');admission.className='room-invite-view-access';
  const field=document.createElement('input');field.type='text';field.readOnly=true;
  field.spellcheck=false;field.setAttribute('aria-label','Current online Custom Room invite link');
  const actionsView=document.createElement('div');actionsView.className='room-invite-view-actions';
  const message=document.createElement('p');message.className='room-invite-view-message';
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  function control(label,run){
   const b=document.createElement('button');b.type='button';b.textContent=label;
   b.addEventListener('click',run);actionsView.append(b);return b;
  }
  let viewShareEpoch=0,pendingClipboardEpoch=null;
  const reportChanged=origin=>{
   const now=snapshot();
   if(!sameSession(origin,now))
    message.textContent='The live room session changed. An older invitation may have been shared; review the new room.';
   else if(!sameSharePolicy(origin,now))
    message.textContent='Room access rules changed during sharing. Check the current requirements before sending invitations.';
  };
  async function copyChoice(kind){
   const epoch=++viewShareEpoch;
   const room=snapshot();
   if(!room){message.textContent='No active online Custom Room to invite anyone to.';return;}
   const value=kind==='code'?room.room:room.url;
   if(typeof navigator.clipboard?.writeText!=='function'){
    field.value=room.url;field.select?.();
    message.textContent=kind==='code'?
     'Clipboard unavailable. Use the visible eight-character room code.':
     'Clipboard unavailable. The current link is selected for manual copying.';
    return;
   }
   try{
    message.textContent=kind==='code'?'Copying room code…':'Copying current room link…';
    pendingClipboardEpoch=epoch;
    await writeInviteClipboard(value);
    if(epoch!==viewShareEpoch)return;
    message.textContent=kind==='code'?'Current room code copied.':'Current room invite copied.';
    reportChanged(room);
   }catch(error){
    if(epoch!==viewShareEpoch)return;
    const latest=snapshot();
    field.value=latest?.url||'';
    if(kind!=='code'&&latest)field.select?.();
    message.textContent=kind==='code'?
     'Clipboard unavailable or timed out. Copy the visible room code manually, or retry.':
     (error?.message?.includes('timed out')?'Clipboard timed out. ':'Clipboard unavailable. ')+
     'The current invite link is selected for manual copying; you can retry.';
   }finally{if(pendingClipboardEpoch===epoch)pendingClipboardEpoch=null;}
  }
  control('Copy invite',()=>copyChoice('link'));
  control('Copy code',()=>copyChoice('code'));
  control('Share',async()=>{
   const epoch=++viewShareEpoch;
   const room=snapshot();
   if(!room){message.textContent='No current room to share.';return;}
   if(typeof navigator.share!=='function'){
    message.textContent='Device sharing is unavailable. Use Copy invite.';return;
   }
   try{
    await navigator.share({title:'Fuckball Custom Room '+room.room,
     text:'Join our Fuckball room. '+eligibility(room)+'. The server decides admission.',
     url:room.url});
    if(epoch!==viewShareEpoch)return;
    message.textContent='Invite passed to your device share sheet.';
    reportChanged(room);
   }catch(e){
    if(epoch===viewShareEpoch)message.textContent=e?.name==='AbortError'?'Sharing cancelled.':
     'Device sharing failed. You can still copy the invite.';
   }
  });
  control('Show QR',()=>{
   const room=snapshot();
   if(!room){message.textContent='This Custom Room is no longer connected.';return;}
   document.getElementById('tabPlay')?.click();
   if(typeof openMatchMenu!=='function'){
    message.textContent='Open Match menu to view the current room QR.';return;
   }
   openMatchMenu('menuMatchPane','menuMatch');
   refresh();
   if(!sameSession(room,snapshot())){
    message.textContent='Room session changed. Open the current room invite instead.';return;
   }
   if(renderedQrUrl!==room.url)qrButton.click();
   if(!qrPanel.hidden)qrPanel.scrollIntoView?.({behavior:'auto',block:'nearest'});
  });
  card.append(heading,admission,field,actionsView,message);
  host.prepend(card);shareViews.push({place,host,card,roomTag,admission,field,message,
   invalidate:()=>{const pending=pendingClipboardEpoch!==null;viewShareEpoch++;pendingClipboardEpoch=null;return pending;},last:'',lastSession:null,lastSocket:null});
 }
 makeShareView(document.getElementById('homeView'),'home');
 makeShareView(document.getElementById('gamesView'),'games');
 function syncShareViews(){
  const active=snapshot();
  for(const view of shareViews){
   const {host,card,roomTag,admission,field,message}=view;
   const visible=!!active&&!host.hidden;
   card.hidden=!visible;
   if(!visible){if(view.lastSession||view.lastSocket)view.invalidate();view.lastSession=null;view.lastSocket=null;continue;}
   const identity=active.room+'|'+active.url;
   if(view.last!==identity||view.lastSession!==active.session||
      view.lastSocket!==active.socket){
    const pending=(view.lastSession||view.lastSocket)&&view.invalidate();
    view.last=identity;view.lastSession=active.session;
    view.lastSocket=active.socket;message.textContent=pending?
     'Room session changed during copying. The clipboard may contain the previous invite; copy the new link again.':'';
   }
   roomTag.textContent=active.room;
   if(field.value!==active.url)field.value=active.url;
   admission.textContent=eligibility(active)+' · '+warning(active);
  }
 }
 setInterval(syncShareViews,1000);
 document.getElementById('tabHome')?.addEventListener('click',()=>queueMicrotask(syncShareViews));
 window.addEventListener('fuckball:native-session-state',syncShareViews);
 syncShareViews();
 // The menu is controlled by the existing game UI. Refresh only while opened,
 // never fetch a room directory, persist a code or mutate server settings.
 let latestRoom='';
 setInterval(()=>{
  const visible=typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
  if(!visible){section.hidden=true;if(renderedQrUrl)hideQr();return;}
  const next=snapshot();
  if(!next){latestRoom='';refresh();return;}
  if(!sameSession(current,next)||next.room!==latestRoom||next.url!==link.value||
    eligibility(next)!==state.textContent||warning(next)!==caution.textContent){
   latestRoom=next.room;status.textContent='';refresh();
  }else section.hidden=false;
 },1000);
 refresh();
})();