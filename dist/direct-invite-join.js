'use strict';
// Direct invite join UX: never trusts a pasted link to grant room access.
// The existing native account/guest and room-admission flow remains authoritative.
(function(){
 const home=document.getElementById('homeView');
 if(!home||typeof showJoinScreen!=='function')return;
 const section=document.createElement('section');section.className='direct-invite-join';
 section.setAttribute('aria-label','Join a private or shared room');
 const title=document.createElement('div');
 const kicker=document.createElement('span');kicker.className='eyebrow';kicker.textContent='HAVE A ROOM INVITE?';
 const heading=document.createElement('h2');heading.textContent='JOIN YOUR TEAM.';
 const description=document.createElement('p');
 description.textContent='Paste a Fuckball room invite or enter its eight-character code. The server checks room access and availability when you join; private rooms are never listed publicly.';
 title.append(kicker,heading,description);
 const form=document.createElement('form');form.className='direct-invite-form';
 const label=document.createElement('label');label.textContent='Room invitation';
 const input=document.createElement('input');input.type='text';input.maxLength=2048;
 input.autocomplete='off';input.spellcheck=false;input.inputMode='url';
 input.placeholder='Paste an invite link or room code';
 input.setAttribute('aria-label','Paste same-site room invitation URL or code');
 label.append(input);
 const actions=document.createElement('div');actions.className='direct-invite-actions';
 const paste=document.createElement('button');paste.type='button';paste.textContent='Paste from clipboard';
 const join=document.createElement('button');join.type='submit';join.className='primary';join.textContent='JOIN ROOM ↗';
 actions.append(paste,join);form.append(label,actions);
 const status=document.createElement('p');status.className='direct-invite-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.textContent='Private invitation codes remain on this page only. No room lookup occurs until you confirm joining.';
 section.append(title,form,status);
 const anchor=home.querySelector('.room-browser')||home.querySelector('.quick-queue-panel');
 if(anchor)anchor.insertAdjacentElement('afterend',section);
 else home.append(section);
 const ROOM=/^[A-HJ-NP-Z2-9]{8}$/;
 function parseInvite(value){
  if(typeof value!=='string'||value.length>2048)throw Error('Room invitation is too long.');
  const raw=value.trim();
  if(!raw)throw Error('Paste an invitation link or enter a room code.');
  const direct=raw.toUpperCase();
  if(ROOM.test(direct))return direct;
  if(/^[A-Z0-9]{6,12}$/.test(direct))
   throw Error('Room code must contain eight allowed letters/numbers; check your invitation.');
  let link;
  try{link=new URL(raw,location.origin+location.pathname);}
  catch{throw Error('This is not a valid Fuckball invitation URL.');}
  if(!['http:','https:'].includes(link.protocol)||link.origin!==location.origin||
   link.pathname!==location.pathname||link.username||link.password||link.hash)
   throw Error('Only room invitations from this exact Fuckball site are accepted.');
  if(link.searchParams.size!==1||link.searchParams.getAll('room').length!==1)
   throw Error('Invitation URL must contain only one room code.');
  const code=String(link.searchParams.get('room')||'').trim().toUpperCase();
  if(!ROOM.test(code))throw Error('Invalid room code in invitation.');
  return code;
 }
 form.onsubmit=event=>{
  event.preventDefault();
  if(serverLink){
   status.textContent='Leave or cancel the current online room, connection or human queue before joining another room.';
   return;
  }
  try{
   const code=parseInvite(input.value);
   if(!defaultServer)throw Error('Connect to a Fuckball multiplayer server to join rooms.');
   status.textContent='Opening '+code+' · room admission and account requirements are checked by the server.';
   showJoinScreen(code);
  }catch(error){status.textContent=error?.message||'Could not open the invitation.';}
 };
 paste.onclick=async()=>{
  if(typeof navigator.clipboard?.readText!=='function'){
   status.textContent='Clipboard reading is unavailable. Paste a link into the field manually.';
   input.focus();return;
  }
  paste.disabled=true;
  try{
   const value=await navigator.clipboard.readText();
   if(!value||value.length>2048)throw Error('Clipboard is empty or the link is too long.');
   input.value=value;input.focus();status.textContent='Invitation pasted. Review the link and choose Join room.';
  }catch(error){status.textContent=error?.message||'Clipboard access was denied. Paste manually.';}
  finally{paste.disabled=false;}
 };
 // Optional QR recognition: local camera or private image, NEVER auto-join.
 // All decoded values pass the identical strict same-origin invite parser.
 let detector=null;
 try{if(typeof BarcodeDetector==='function')detector=new BarcodeDetector({formats:['qr_code']});}
 catch{detector=null;}
 const qrActions=document.createElement('div');qrActions.className='direct-invite-qr-actions';
 const scan=document.createElement('button');scan.type='button';scan.textContent='▣ Scan QR with camera';
 const imageLabel=document.createElement('label');imageLabel.textContent='Read QR from image';
 const imageFile=document.createElement('input');imageFile.type='file';
 imageFile.accept='image/png,image/jpeg,image/webp';imageFile.setAttribute('aria-label','Read a room invitation QR from a local image');
 imageLabel.append(imageFile);qrActions.append(scan,imageLabel);
 form.insertAdjacentElement('afterend',qrActions);
 const scanner=document.createElement('section');scanner.className='direct-invite-qr-camera';scanner.hidden=true;
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;
 video.setAttribute('aria-label','Live camera preview for invitation QR');
 const close=document.createElement('button');close.type='button';close.textContent='Stop camera';
 const scannerHint=document.createElement('p');
 scannerHint.textContent='Point at a QR with a Fuckball invite from this website. Scanning only fills the invitation field; joining requires your own confirmation.';
 scanner.append(video,scannerHint,close);qrActions.insertAdjacentElement('afterend',scanner);
 let stream=null,scanTimer=null,detecting=false,lastInvalid='';
 function stopScan(){
  if(scanTimer!==null){clearInterval(scanTimer);scanTimer=null;}
  const active=stream;stream=null;
  if(active)for(const track of active.getTracks())track.stop();
  video.srcObject=null;scanner.hidden=true;scan.disabled=false;
 }
 function acceptScanned(raw){
  try{
   const code=parseInvite(raw);
   stopScan();input.value=code;input.focus();
   status.textContent='QR read: valid room code '+code+'. Review and choose Join room; live server admission is still required.';
   return true;
  }catch(error){
   if(raw!==lastInvalid){lastInvalid=raw;
    status.textContent='QR rejected: '+(error?.message||'not a same-site room invitation')+'. Keep scanning or paste a valid invitation.';}
   return false;
  }
 }
 scan.disabled=!detector||typeof navigator.mediaDevices?.getUserMedia!=='function';
 imageFile.disabled=!detector||typeof createImageBitmap!=='function';
 if(scan.disabled){
  status.textContent='QR camera scanning is unavailable in this browser. Pasting the same-site invitation URL or room code still works.';
 }
 scan.onclick=async()=>{
  if(!detector||stream)return;
  scan.disabled=true;lastInvalid='';
  try{
   const acquired=await navigator.mediaDevices.getUserMedia({
    audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}}
   });
   if(document.hidden){acquired.getTracks().forEach(t=>t.stop());throw Error('Open the Play tab to scan.');}
   stream=acquired;video.srcObject=acquired;scanner.hidden=false;
   await video.play();
   status.textContent='Camera active on your device. No footage is uploaded or retained.';
   scanTimer=setInterval(async()=>{
    if(detecting||!stream||document.hidden||scanner.hidden||video.readyState<2)return;
    const currentStream=stream;detecting=true;
    try{
     const found=await detector.detect(video);
     if(stream!==currentStream||document.hidden)return;
     for(const item of found||[]){if(typeof item.rawValue==='string'&&acceptScanned(item.rawValue))break;}
    }catch{status.textContent='QR detection unavailable. Stop camera and paste the invitation instead.';stopScan();}
    finally{detecting=false;}
   },400);
  }catch(error){
   stopScan();
   status.textContent='Camera could not start: '+(error?.message||'permission denied')+'. Paste the invitation or choose an image.';
  }
 };
 close.onclick=()=>{stopScan();scan.focus();status.textContent='Camera stopped. Paste a link or try another image.';};
 imageFile.onchange=async()=>{
  const file=imageFile.files?.[0];imageFile.value='';
  if(!file||!detector||typeof createImageBitmap!=='function')return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6*1024*1024){
   status.textContent='Choose a PNG, JPEG or WebP image under 6 MB.';return;
  }
  imageFile.disabled=true;
  try{
   const bitmap=await createImageBitmap(file);
   try{
    if(bitmap.width>4096||bitmap.height>4096)throw Error('Image dimensions exceed 4096 pixels.');
    const found=await detector.detect(bitmap);
    if(!found?.some(item=>typeof item.rawValue==='string'&&acceptScanned(item.rawValue)))
     status.textContent='No valid same-site room QR found. Paste a link or use another image.';
   }finally{bitmap.close();}
  }catch(error){status.textContent=error?.message||'Could not read QR from this image.';}
  finally{imageFile.disabled=false;}
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScan();});
 window.addEventListener('pagehide',stopScan);
})();
