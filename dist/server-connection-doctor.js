'use strict';
// Explicit, private, same-origin preflight for the selected native game server.
// A fetch round-trip is HTTP diagnostic latency, NOT game RTT, and does not
// grant authentication, join matchmaking, change rooms or update any state.
(function(){
 const dialog=document.getElementById('networkDialog'),address=document.getElementById('serverAddress');
 if(!dialog||!address)return;
 const block=document.createElement('section');block.className='connection-doctor';
 block.setAttribute('aria-label','On-demand native game server diagnostics');
 const h=document.createElement('h3');h.textContent='SERVER CONNECTION DOCTOR';
 const intro=document.createElement('p');
 intro.textContent='Check the actual selected game server before joining. Only an explicit click sends two read-only same-origin requests. No match is started, no credentials are sent and local practice still works offline.';
 const controls=document.createElement('div');controls.className='connection-doctor-actions';
 const check=document.createElement('button');check.type='button';check.textContent='↻ Check selected server';
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copy private summary';
 copy.disabled=true;controls.append(check,copy);
 const status=document.createElement('p');status.className='connection-doctor-status';status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 const metrics=document.createElement('dl');metrics.className='connection-doctor-grid';
 const fields=[
  ['target','Target'],['health','Server health'],['release','Server release'],
  ['engine','Native engine'],['netcode','Transport'],['rooms','Active rooms'],
  ['queue','Human casual queues'],['roundtrip','HTTP response time'],['checked','Checked at']
 ];
 const slots={};
 for(const [key,label] of fields){
  const card=document.createElement('div');card.className='connection-doctor-tile';
  const name=document.createElement('dt');name.textContent=label;
  const value=document.createElement('dd');value.textContent='—';card.append(name,value);
  slots[key]=value;metrics.append(card);
 }
 const warning=document.createElement('p');warning.className='connection-doctor-footnote';
 warning.textContent='HTTP response time is not in-match ping; a healthy endpoint does not guarantee a free opponent or successful WebSocket connection. This diagnostic does not attempt to test external hosts.';
 block.append(h,intro,controls,status,metrics,warning);
 const form=dialog.querySelector('.server-room-form');
 if(form)form.insertAdjacentElement('afterend',block);else dialog.append(block);
 const original='Open Online Rooms to check the selected same-origin native server.';
 let last=null,request=0,controller=null;
 const MODES=['1v1','2v2','3v3','4v4'];
 function selected(){
  const value=address.value.trim();
  if(!value)return {ok:false,message:'Configure a native multiplayer WebSocket server first.'};
  let url;
  try{url=new URL(value);}catch{return{ok:false,message:'Enter a valid ws:// or wss:// game server address.'};}
  if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password)
   return{ok:false,message:'Use a valid WebSocket URL without embedded credentials.'};
  if(location.protocol==='https:'&&url.protocol!=='wss:')
   return{ok:false,message:'The current HTTPS page requires a secure wss:// server.'};
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  if(url.host!==location.host||url.protocol!==protocol||url.pathname!=='/ws'||url.search||url.hash)
   return{ok:false,message:'Selected WebSocket host differs from this website, or does not use its native /ws endpoint. Never substitute this website’s /health for another server.'};
  return {ok:true,display:'This website’s native /ws endpoint'};
 }
 function cancel(){
  request++;
  if(controller){controller.abort();controller=null;}
  check.disabled=false;copy.disabled=true;last=null;
 }
 function blank(text){
  Object.values(slots).forEach(node=>node.textContent='—');
  slots.target.textContent=text||'Not configured';
 }
 address.addEventListener('input',()=>{
  cancel();const s=selected();blank(s.ok?s.display:'Different/invalid server');status.textContent=s.ok?original:s.message;
 });
 dialog.addEventListener('close',()=>{
  cancel();status.textContent='Check cancelled or cleared when the dialog closed.';
 });
 function validHealth(d){
  return d?.ok===true&&d.engine==='node-haxball-2.3.1'&&
   typeof d.release==='string'&&/^[a-zA-Z0-9._/-]{1,80}$/.test(d.release)&&
   d.physicsHz===60&&Number.isSafeInteger(d.snapshotHz)&&d.snapshotHz>0&&d.snapshotHz<=120&&
   [2,3].includes(d.netcode)&&Number.isSafeInteger(d.rooms)&&d.rooms>=0&&d.rooms<=100000&&
   typeof d.peerHosting==='boolean';
 }
 function validQueue(d){
  if(!d||d.humanOnly!==true||d.ranked!==false||!d.modes)return null;
  let waiting=0,confirming=0;
  for(const mode of MODES){
   const row=d.modes[mode],need=Number(mode[0])*2;
   if(!row||row.needed!==need||![row.waiting,row.confirming].every(n=>
      Number.isSafeInteger(n)&&n>=0&&n<=128))return null;
   waiting+=row.waiting;confirming+=row.confirming;
  }
  return{waiting,confirming};
 }
 async function json(url,signal){
  const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',
   redirect:'error',headers:{Accept:'application/json'},signal});
  if(!response.ok||!response.headers.get('Content-Type')?.toLowerCase().includes('application/json'))
   throw Error('The selected native server endpoint did not return valid JSON.');
  const body=await response.text();
  if(body.length>8192)throw Error('The response exceeds the safe status size.');
  try{return JSON.parse(body);}catch{throw Error('The server sent unreadable diagnostics.');}
 }
 check.onclick=async()=>{
  cancel();blank('Not verified');const target=selected();
  if(!target.ok){status.textContent=target.message;return;}
  if(navigator.onLine===false){status.textContent='Browser reports offline; no live server request sent.';return;}
  check.disabled=true;const ticket=++request,ctrl=new AbortController();controller=ctrl;
  const timeout=setTimeout(()=>ctrl.abort(),6500),time=performance.now();
  status.textContent='Checking the selected native server (read-only)…';
  try{
   // Both paths are on the SAME origin, never the possibly user-supplied URL.
   const health=await json('/health',ctrl.signal);
   if(!validHealth(health))throw Error('The response is not a compatible native Fuckball server health record.');
   const httpMs=Math.max(0,Math.round(performance.now()-time));
   let occupancy=null,queueError='';
   try{
    occupancy=validQueue(await json('/api/quick-match/availability',ctrl.signal));
    if(!occupancy)queueError='Queue payload not verified; no player totals shown.';
   }catch(error){queueError=ctrl.signal.aborted?'Queue check cancelled.':'Human queue endpoint unavailable.';}
   if(ticket!==request||!dialog.open||!selected().ok||ctrl.signal.aborted)return;
   const checked=new Date();
   last={release:health.release,engine:health.engine,physicsHz:health.physicsHz,
    snapshotHz:health.snapshotHz,rooms:health.rooms,netcode:health.netcode,
    peerHosting:health.peerHosting,waiting:occupancy?.waiting??null,
    confirming:occupancy?.confirming??null,httpMs,checkedAt:checked.toISOString()};
   slots.target.textContent=target.display;
   slots.health.textContent='Genuine native server responded · HTTP healthy';
   slots.release.textContent=health.release==='local'?'Local/unidentified release':health.release;
   slots.engine.textContent=health.engine+' · '+health.physicsHz+' Hz physics · '+health.snapshotHz+' Hz snapshots';
   slots.netcode.textContent='Native netcode v'+health.netcode+(health.peerHosting?' · peer hosting enabled':' · server-hosted');
   slots.rooms.textContent=String(health.rooms);
   slots.queue.textContent=occupancy?occupancy.waiting+' waiting · '+occupancy.confirming+' confirming · casual human only':queueError;
   slots.roundtrip.textContent=httpMs+' ms health endpoint HTTP response · not gameplay RTT';
   slots.checked.textContent=checked.toLocaleString();
   status.textContent=occupancy?'Native server and real-player queue endpoint both verified. This is NOT confirmation that a match can be joined.':
    'Native health endpoint verified. '+queueError;
   copy.disabled=false;
  }catch(error){
   if(ticket===request){
    last=null;copy.disabled=true;
    slots.health.textContent='Could not verify live native server';
    status.textContent=ctrl.signal.aborted?
     'Server check timed out or was cancelled. No online status inferred.':
     String(error?.message||'Native server is unavailable.').slice(0,170);
   }
  }finally{
   clearTimeout(timeout);
   if(ticket===request){controller=null;check.disabled=false;}
  }
 };
 copy.onclick=async()=>{
  if(!last||!selected().ok||!dialog.open)return;
  const lines=[
   'Fuckball private native-server preflight',
   'Checked: '+last.checkedAt,
   'Release: '+last.release,
   'Engine: '+last.engine+' / physics '+last.physicsHz+' Hz / snapshots '+last.snapshotHz+' Hz',
   'Netcode v'+last.netcode+' / peer hosting '+(last.peerHosting?'supported':'disabled'),
   'Rooms on selected native server: '+last.rooms,
   'Human queue occupancy: '+(last.waiting===null?'not verified':last.waiting+' waiting, '+last.confirming+' confirming'),
   'HTTP health roundtrip: '+last.httpMs+' ms (NOT gameplay ping)',
   'No credentials, identity, room IDs or opponent information included.'];
  try{
   await navigator.clipboard.writeText(lines.join('\n'));
   if(!dialog.open||!selected().ok)return;
   status.textContent='Private diagnostic summary copied. No credentials, user identity or server URL included.';
  }catch{status.textContent='Clipboard unavailable; select and copy the visible numbers manually.';}
 };
 const initial=selected();blank(initial.ok?initial.display:'Unverified server');
 status.textContent=initial.ok?original:initial.message;
})();
