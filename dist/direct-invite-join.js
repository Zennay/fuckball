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
 // A pasted clipboard/QR result is provisional until the human explicitly
 // chooses Join. Late browser permissions or image decoding must never
 // replace a newer manually typed invitation or revive a departed view.
 let invitationEpoch=0;
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
  if(home.hidden||document.hidden)return;
  const conflict=typeof onlineSessionConflict==='function'?onlineSessionConflict():'';
  if(conflict){status.textContent=conflict;return;}
  try{
   const code=parseInvite(input.value);
   // Hosted pages intentionally do not assume a server endpoint. The native
   // join form lets the user explicitly choose the host's WebSocket server.
   // Do not discard an otherwise valid link or create a connection here.
   // Commit the human's final selected code before opening the original join
   // form. Shut down camera capture and discard every pending clipboard/image
   // response, including permission prompts that resolve after navigation.
   invitationEpoch++;imageEpoch++;cancelClipboardRead();activeImageRead?.abort();stopScan();
   status.textContent='Opening '+code+' · room admission and account requirements are checked by the server.';
   showJoinScreen(code);
  }catch(error){status.textContent=error?.message||'Could not open the invitation.';}
 };
 let activeClipboardRead=null;
 function cancelClipboardRead(){activeClipboardRead?.();}
 paste.onclick=async()=>{
  // Switching to clipboard gives the person control immediately, even when
  // clipboard access is unsupported or the permission prompt hangs.
  if(stream||!scanner.hidden)stopScan();
  imageEpoch++;activeImageRead?.abort();
  if(typeof navigator.clipboard?.readText!=='function'){
   status.textContent='Clipboard reading is unavailable. Paste a link into the field manually.';
   input.focus();return;
  }
  const request=++invitationEpoch,original=input.value;
  let rejectWait=null,timer=null;
  const canceled=new Promise((_,reject)=>{
   rejectWait=()=>reject(Error('Clipboard request canceled.'));
  });
  activeClipboardRead=rejectWait;
  paste.disabled=true;
  status.textContent='Waiting for clipboard permission · your existing room code is preserved.';
  try{
   // Permission prompts can remain open forever: don't trap Paste or
   // overwrite a newer human-entered invite after navigation.
   const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Clipboard did not respond. Paste manually or retry.')),8000);
   });
   const value=await Promise.race([navigator.clipboard.readText(),canceled,deadline]);
   if(request!==invitationEpoch||home.hidden||document.hidden||
      input.value!==original)return;
   if(!value||value.length>2048)throw Error('Clipboard is empty or the link is too long.');
   imageEpoch++;activeImageRead?.abort();
   if(stream||!scanner.hidden)stopScan();
   input.value=value;input.focus();
   status.textContent='Invitation pasted. Review the link and choose Join room.';
  }catch(error){
   if(request===invitationEpoch&&!home.hidden&&!document.hidden)
    status.textContent=error?.message||'Clipboard access was denied. Paste manually.';
  }finally{
   clearTimeout(timer);
   if(activeClipboardRead===rejectWait){activeClipboardRead=null;paste.disabled=false;}
  }
 };
 // Optional QR recognition: local camera or private image, NEVER auto-join.
 // All decoded values pass the identical strict same-origin invite parser.
 let detector=null;
 try{if(typeof BarcodeDetector==='function')detector=new BarcodeDetector({formats:['qr_code']});}
 catch{detector=null;}
 // Firefox and browsers without BarcodeDetector can decode on-device using a
 // bundled, lazy-loaded jsQR fallback. Only the explicit scan action loads it.
 let fallbackLoad=null;
 async function readyDecoder(signal){
  if(detector||typeof window.jsQR==='function')return;
  if(!fallbackLoad){
   fallbackLoad=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='vendor/jsQR.js';script.async=true;
    let settled=false;
    const timer=setTimeout(()=>finish(Error('Local QR decoder took too long to load. Try again or paste the invitation.')),8000);
    function finish(error){
     if(settled)return;
     settled=true;clearTimeout(timer);
     script.onload=null;script.onerror=null;
     if(error){script.remove();reject(error);}else resolve();
    }
    script.onload=()=>typeof window.jsQR==='function'?finish():finish(Error('Local QR decoder unavailable.'));
    script.onerror=()=>finish(Error('Could not load local QR decoder. Paste the room link instead.'));
    document.head.append(script);
   }).catch(error=>{fallbackLoad=null;throw error;});
  }
  if(!signal)return fallbackLoad;
  if(signal.aborted)throw Error('Image read canceled.');
  let onAbort;
  const canceled=new Promise((_,reject)=>{
   onAbort=()=>reject(Error('Image read canceled.'));
   signal.addEventListener('abort',onAbort,{once:true});
  });
  try{return await Promise.race([fallbackLoad,canceled]);}
  finally{signal.removeEventListener('abort',onAbort);}
 }
 const localFrame=document.createElement('canvas');
 const localContext=localFrame.getContext('2d',{willReadFrequently:true});
 async function decodeQR(source){
  if(detector)return detector.detect(source);
  await readyDecoder();
  if(!localContext)throw Error('Cannot decode QR on this device. Paste the invite instead.');
  const width=source.videoWidth||source.width, height=source.videoHeight||source.height;
  if(!(width>0&&height>0))return [];
  const scale=Math.min(1,1280/Math.max(width,height));
  localFrame.width=Math.max(1,Math.round(width*scale));
  localFrame.height=Math.max(1,Math.round(height*scale));
  localContext.drawImage(source,0,0,localFrame.width,localFrame.height);
  const pixels=localContext.getImageData(0,0,localFrame.width,localFrame.height);
  const qr=window.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
  return qr&&typeof qr.data==='string'?[{rawValue:qr.data}]:[];
 }
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
 // Every request captures an epoch. A slow permission or decoder promise
 // must never reactivate an abandoned camera after navigating away.
 let scanEpoch=0,imageEpoch=0;
 let activeImageRead=null;
 input.addEventListener('input',()=>{
  invitationEpoch++;imageEpoch++;activeImageRead?.abort();cancelClipboardRead();
  // A person typing a room code takes ownership of the input immediately:
  // late camera permissions and in-flight image scans cannot overwrite it.
  if(stream||!scanner.hidden)stopScan();
  status.textContent='Your edited invitation is ready for review. Choose Join room to continue.';
 });
 function stopScan(){
  scanEpoch++;
  if(scanTimer!==null){clearInterval(scanTimer);scanTimer=null;}
  const active=stream;stream=null;
  if(active)for(const track of active.getTracks())track.stop();
  video.pause?.();
  video.srcObject=null;scanner.hidden=true;
  scan.disabled=typeof navigator.mediaDevices?.getUserMedia!=='function';
 }
 function acceptScanned(raw){
  try{
   const code=parseInvite(raw);
   invitationEpoch++;imageEpoch++;cancelClipboardRead();
   stopScan();input.value=code;input.focus();
   status.textContent='QR read: valid room code '+code+'. Review and choose Join room; live server admission is still required.';
   return true;
  }catch(error){
   if(raw!==lastInvalid){lastInvalid=raw;
    status.textContent='QR rejected: '+(error?.message||'not a same-site room invitation')+'. Keep scanning or paste a valid invitation.';}
   return false;
  }
 }
 scan.disabled=typeof navigator.mediaDevices?.getUserMedia!=='function';
 imageFile.disabled=typeof createImageBitmap!=='function'&&
  !(typeof Image==='function'&&typeof URL==='function'&&typeof URL.createObjectURL==='function');
 if(scan.disabled){
  status.textContent='QR camera scanning is unavailable in this browser. Pasting the same-site invitation URL or room code still works.';
 }
 scan.onclick=async()=>{
  if(stream||scan.disabled||home.hidden||document.hidden)return;
  const attempt=++scanEpoch;
  invitationEpoch++;imageEpoch++;activeImageRead?.abort();cancelClipboardRead();
  scan.disabled=true;lastInvalid='';
  // Show Stop even while a permission prompt or lazy decoder is outstanding.
  scanner.hidden=false;
  scannerHint.textContent='Opening the camera… Choose Stop camera to cancel. No QR will be joined automatically.';
  status.textContent='Waiting for local QR camera access. Choose Stop camera to cancel.';
  try{
   await readyDecoder();
   if(attempt!==scanEpoch||home.hidden||document.hidden)return;
   const acquired=await navigator.mediaDevices.getUserMedia({
    audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}}
   });
   // A granted browser permission can arrive after the player left Home or
   // pressed Stop. Immediately release every late track, never attach video.
   if(attempt!==scanEpoch||home.hidden||document.hidden){
    acquired.getTracks().forEach(t=>t.stop());return;
   }
   stream=acquired;video.srcObject=acquired;
   await video.play();
   if(attempt!==scanEpoch||home.hidden||document.hidden){stopScan();return;}
   scannerHint.textContent='Point at a QR from this site. A scan only fills the invite field; you must explicitly choose Join room.';
   status.textContent='Camera active on your device. No footage is uploaded or retained.';
   scanTimer=setInterval(async()=>{
    if(detecting||!stream||home.hidden||document.hidden||scanner.hidden||video.readyState<2)return;
    const currentStream=stream;detecting=true;
    try{
     const found=await decodeQR(video);
     if(stream!==currentStream||home.hidden||document.hidden)return;
     for(const item of found||[]){if(typeof item.rawValue==='string'&&acceptScanned(item.rawValue))break;}
    }catch{status.textContent='QR detection unavailable. Stop camera and paste the invitation instead.';stopScan();}
    finally{detecting=false;}
   },400);
  }catch(error){
   // Do not overwrite a deliberate Stop/navigate message with a late error.
   if(attempt!==scanEpoch)return;
   stopScan();
   status.textContent='Camera could not start: '+(error?.message||'permission denied')+'. Paste the invitation or choose an image.';
  }
 };
 close.onclick=()=>{
  stopScan();scan.focus();
  status.textContent='Camera stopped. Paste a link or try another image.';
 };
 // A local file can still be decoded on browsers without ImageBitmap.
 // The object URL is revoked as soon as the image loads; the decoded pixels
 // never leave this browser and the usual strict room admission remains.
 async function loadQRImage(file,signal){
  if(typeof createImageBitmap==='function'){
   try{
    // A native decoder can also stall. Cancel its wait promptly and close
    // a late bitmap rather than retaining pixels after the player left.
    const work=Promise.resolve().then(()=>createImageBitmap(file));
    return await new Promise((resolve,reject)=>{
     let settled=false,timer=null;
     function finish(error,bitmap){
      if(settled){bitmap?.close?.();return;}
      settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(error)reject(error);else resolve(bitmap);
     }
     function abort(){finish(Error('Image read canceled.'));}
     if(signal?.aborted){abort();return;}
     signal?.addEventListener('abort',abort,{once:true});
     timer=setTimeout(()=>finish(Error('Image decoding timed out. Try another image.')),12000);
     work.then(bitmap=>finish(null,bitmap),error=>finish(error));
    });
   }catch(error){
    // A native decoder error may use the local Image fallback; cancellation
    // and timeout are final, so never begin a second decoder after either.
    if(signal?.aborted||error?.message?.startsWith('Image decoding timed out.')||
       typeof Image!=='function'||typeof URL==='undefined'||typeof URL.createObjectURL!=='function')throw error;
   }
  }
  if(typeof Image!=='function'||typeof URL==='undefined'||typeof URL.createObjectURL!=='function')
   throw Error('Local image decoding is unavailable. Paste the invitation instead.');
  const objectURL=URL.createObjectURL(file);
  try{
   return await new Promise((resolve,reject)=>{
    const image=new Image();
    let settled=false,timer=null;
    function abort(){finish(Error('Image read canceled.'));}
    function finish(error){
     if(settled)return;
     settled=true;clearTimeout(timer);
     signal?.removeEventListener('abort',abort);
     image.onload=null;image.onerror=null;
     if(error){image.removeAttribute?.('src');reject(error);}
     else resolve(image);
    }
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(Error('Image decoding timed out. Try another image.')),12000);
    image.onload=()=>finish(null);
    image.onerror=()=>finish(Error('Could not decode the selected image.'));
    image.src=objectURL;
   });
  }finally{URL.revokeObjectURL(objectURL);}
 }
 imageFile.onchange=async()=>{
  const file=imageFile.files?.[0];imageFile.value='';
  if(!file)return;
  invitationEpoch++;cancelClipboardRead();
  // Choosing a local file replaces live scanning; release the actual camera
  // before any decoder work, even for invalid or unopenable images.
  if(stream||!scanner.hidden)stopScan();
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>6*1024*1024){
   status.textContent='Choose a PNG, JPEG or WebP image under 6 MB.';return;
  }
  activeImageRead?.abort();
  const request=++imageEpoch;
  const controller=typeof AbortController==='function'?new AbortController():null;
  activeImageRead=controller;
  invitationEpoch++;
  imageFile.disabled=true;
  try{
   await readyDecoder(controller?.signal);
   if(request!==imageEpoch||home.hidden||document.hidden)return;
   const bitmap=await loadQRImage(file,controller?.signal);
   try{
    if(bitmap.width>4096||bitmap.height>4096)throw Error('Image dimensions exceed 4096 pixels.');
    if(request!==imageEpoch||home.hidden||document.hidden)return;
    const found=await decodeQR(bitmap);
    if(request!==imageEpoch||home.hidden||document.hidden)return;
    if(!found?.some(item=>typeof item.rawValue==='string'&&acceptScanned(item.rawValue)))
     status.textContent='No valid same-site room QR found. Paste a link or use another image.';
   }finally{bitmap.close?.();}
  }catch(error){
   if(request===imageEpoch&&!home.hidden&&!document.hidden)
    status.textContent=error?.message||'Could not read QR from this image.';
  }finally{if(activeImageRead===controller)activeImageRead=null;imageFile.disabled=false;}
 };
 function leaveInviteView(){
  if(!home.hidden&&!document.hidden)return;
  invitationEpoch++;imageEpoch++;activeImageRead?.abort();cancelClipboardRead(); // Abandoned local image cannot retain its Blob URL.
  if(stream||!scanner.hidden){
   stopScan();
   status.textContent='Camera stopped when you left the invite screen. Open Home to scan again.';
  }
 }
 document.addEventListener('visibilitychange',leaveInviteView);
 window.addEventListener('pagehide',()=>{invitationEpoch++;imageEpoch++;activeImageRead?.abort();cancelClipboardRead();stopScan();});
 // The game navigates between in-page views without hiding the browser tab.
 // A page-visibility event alone would leave the physical camera capturing.
 for(const id of ['tabPlay','tabReplay'])
  document.querySelector('#'+id)?.addEventListener('click',()=>queueMicrotask(leaveInviteView));
 if(typeof MutationObserver==='function')
  new MutationObserver(leaveInviteView).observe(home,{attributes:true,attributeFilter:['hidden']});
})();
