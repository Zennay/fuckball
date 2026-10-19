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
  if(!active?.room||active.quickMatchMode||!safeRoom(active.room))return null;
  // Derive the invitation from the same current browser site used for native room links.
  // Ignore any externally supplied inviteLink input or saved stale room code.
  if(location.protocol!=='https:'&&location.protocol!=='http:')return null;
  const url=new URL(location.pathname,location.origin);
  url.searchParams.set('room',active.room);
  return {room:active.room,url:url.href,control:active.roomControl||{}};
 }
 function eligibility(data){
  const settings=data.control;
  if(settings.locked)return 'LOCKED · no new admissions currently';
  if(settings.clubOnly)return 'CLUB-ONLY · membership required';
  if(settings.accountsOnly)return 'ACCOUNT REQUIRED';
  if(settings.listed)return 'PUBLICLY LISTED · server admission required';
  return 'UNLISTED · invite link only';
 }
 function warning(data){
  const s=data.control;
  if(s.locked)return 'The room is locked. This link will not unlock it or admit new players.';
  if(s.clubOnly)return 'Only eligible Club members can enter. Sending this link does not grant Club membership.';
  if(s.accountsOnly)return 'Recipients must sign in. This link does not create an account or grant admission.';
  return s.listed?
   'This room is currently public. It can become unlisted, full or closed after sharing.':
   'Unlisted codes may still work until the room closes. Share only with intended recipients.';
 }
 function refresh(){
  const next=snapshot();section.hidden=!next;
  if(!next){hideQr();current=null;link.value='';code.textContent='';return;}
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
 async function copy(value,message){
  if(typeof navigator.clipboard?.writeText!=='function')
   throw Error('Clipboard access is unavailable. Select and copy the displayed link instead.');
  await navigator.clipboard.writeText(value);
  status.textContent=message;
 }
 button('Copy invite link',async()=>{
  try{const room=currentRoom();await copy(room.url,'Room invite link copied. Only the server can admit recipients.');}
  catch(e){status.textContent=e.message||'Could not copy invitation.';}
 });
 button('Copy room code',async()=>{
  try{const room=currentRoom();await copy(room.room,'Eight-character room code copied. No join attempt was made.');}
  catch(e){status.textContent=e.message||'Could not copy code.';}
 });
 button('Share via device',async()=>{
  try{
   const room=currentRoom();
   if(typeof navigator.share!=='function')throw Error('Device sharing is unavailable. Use Copy invite link instead.');
   const details=eligibility(room);
   await navigator.share({title:'Fuckball Custom Room '+room.room,
    text:'Join my Fuckball Custom Room · '+details+'. Entry requires approval from the live game server.',
    url:room.url});
   status.textContent='Room invitation handed to your device share sheet; admission remains server-controlled.';
  }catch(e){
   if(e?.name==='AbortError')status.textContent='Sharing cancelled.';
   else status.textContent=e.message||'Device sharing failed.';
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
   if(snapshot()?.url!==currentRoomData.url)
    throw Error('Room changed during QR export. Open the new room and try again.');
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
 // The menu is controlled by the existing game UI. Refresh only while opened,
 // never fetch a room directory, persist a code or mutate server settings.
 let latestRoom='';
 setInterval(()=>{
  const visible=typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
  if(!visible){section.hidden=true;if(renderedQrUrl)hideQr();return;}
  const next=snapshot();
  if(!next){section.hidden=true;current=null;latestRoom='';hideQr();return;}
  if(next.room!==latestRoom||next.url!==link.value||
    eligibility(next)!==state.textContent||warning(next)!==caution.textContent){
   latestRoom=next.room;status.textContent='';refresh();
  }else section.hidden=false;
 },1000);
 refresh();
})();