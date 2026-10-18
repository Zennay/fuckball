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
  if(serverLink?.room||serverLink?.quickMatchMode){
   status.textContent='Leave your current match or matchmaking queue before joining another room.';
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
})();
