'use strict';
// Only deliberately published rooms appear here. No member usernames, IPs,
// signed-in identities, private invite links or undisclosed rooms are queried.
(function(){
 const home=$('homeView');
 if(!home)return;
 const anchor=home.querySelector('.quick-queue-panel')||home.querySelector('.mode-cards');
 if(!anchor)return;
 const section=document.createElement('section');section.className='room-browser';
 section.setAttribute('aria-label','Public online rooms');
 const heading=document.createElement('div');heading.className='room-browser-heading';
 const h=document.createElement('h2');h.textContent='PUBLIC ROOMS.';
 const badge=document.createElement('span');badge.textContent='HOST-APPROVED LISTINGS';
 heading.append(h,badge);
 const intro=document.createElement('p');
 intro.textContent='Discover rooms whose hosts chose to be visible. Private links never appear here. Rooms may fill or close after this list loads.';
 const toolbar=document.createElement('div');toolbar.className='room-browser-tools';
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Browse rooms';
 toggle.className='primary';toggle.setAttribute('aria-expanded','false');
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh';refresh.hidden=true;
 const find=document.createElement('button');find.type='button';find.textContent='⚽ Find an open room';find.hidden=true;
 find.className='room-browser-find';find.title='Find a fresh, public room using your visible filters';
 toolbar.append(toggle,refresh,find);
 const filters=document.createElement('div');filters.className='room-browser-filters';filters.hidden=true;
 const search=document.createElement('input');search.type='search';search.maxLength=60;
 search.placeholder='Room code or stadium';search.setAttribute('aria-label','Find a public room');
 const statusFilter=document.createElement('select');statusFilter.setAttribute('aria-label','Room activity');
 for(const [value,label] of [['all','Any activity'],['lobby','Waiting in lobby'],['playing','In progress']])
  statusFilter.add(new Option(label,value));
 const modeFilter=document.createElement('select');modeFilter.setAttribute('aria-label','Room format');
 for(const value of ['all','1v1','2v2','3v3','4v4','custom'])
  modeFilter.add(new Option(value==='all'?'Any mode':value==='custom'?'Custom / bots':value,value));
 const order=document.createElement('select');order.setAttribute('aria-label','Sort public rooms');
 for(const [value,label] of [['default','Server order'],['pinned','Pinned first'],['most','Most players'],['fewest','Fewest players'],['stadium','Stadium A–Z']])
  order.add(new Option(label,value));
 const accessFilter=document.createElement('select');accessFilter.setAttribute('aria-label','Available room seats');
 for(const [value,label] of [['all','All rooms'],['space','Rooms with open seats'],['guest','Guest-accessible with seats'],['lobby','Open lobbies']])
  accessFilter.add(new Option(label,value));
 for(const control of [search,statusFilter,modeFilter,order,accessFilter])filters.append(control);
 const body=document.createElement('div');body.className='room-browser-body';body.hidden=true;
 const status=document.createElement('p');status.className='room-browser-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const savedSection=document.createElement('section');savedSection.className='room-browser-saved';
 const savedHeading=document.createElement('div');savedHeading.className='room-browser-saved-heading';
 const savedTitle=document.createElement('strong');savedTitle.textContent='PINNED ROOMS';
 const clearSaved=document.createElement('button');clearSaved.type='button';clearSaved.textContent='Clear pinned';
 savedHeading.append(savedTitle,clearSaved);
 const savedNote=document.createElement('p');
 savedNote.textContent='Only rooms you intentionally pin are saved on this device. A room may later become unavailable or unlisted; opening a saved code still requires server admission.';
 const savedGrid=document.createElement('div');savedGrid.className='room-browser-saved-list';
 savedSection.append(savedHeading,savedNote,savedGrid);
 const list=document.createElement('div');list.className='room-browser-list';
 body.append(savedSection,status,list);section.append(heading,intro,toolbar,filters,body);
 anchor.insertAdjacentElement('afterend',section);
 let sequence=0,busy=false,interval=null,shown=false,roomsCache=[],lastLoadedAt=0;
 const SAVED_KEY='fuckball.pinned-public-rooms.v1',SAVED_LIMIT=12;
 const validRoom=code=>typeof code==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(code);
 function readPinned(){
  let raw;
  try{raw=localStorage.getItem(SAVED_KEY);}catch{throw Error('Saved room storage is unavailable.');}
  if(!raw)return[];
  let saved;try{saved=JSON.parse(raw);}catch{throw Error('Saved room storage is corrupt.');}
  if(!Array.isArray(saved)||saved.length>SAVED_LIMIT||
     saved.some(code=>!validRoom(code))||new Set(saved).size!==saved.length)
   throw Error('Saved room storage is invalid.');
  return saved;
 }
 function savePinned(list){
  if(!Array.isArray(list)||list.length>SAVED_LIMIT||
     list.some(code=>!validRoom(code)))throw Error('Invalid pinned room list.');
  try{localStorage.setItem(SAVED_KEY,JSON.stringify(list));}
  catch{throw Error('Could not save room pins to this device.');}
 }
 function openSavedRoom(code){
  if(serverLink?.room){status.textContent='Leave your current room first.';return;}
  // A pinned code is not evidence that a room is still open or public.
  // The native join API makes the current access and room existence checks.
  showJoinScreen(code);
 }
 function renderPinned(pins){
  savedSection.hidden=!pins.length;
  savedGrid.replaceChildren();
  for(const code of pins){
   const published=roomsCache.find(r=>r.room===code);
   const card=document.createElement('article');card.className='room-browser-saved-card';
   const info=document.createElement('div');info.className='room-browser-info';
   const label=document.createElement('strong');label.textContent='★ '+code;
   const hint=document.createElement('small');
   hint.textContent=published?
    'Currently public · '+published.players+' online · '+published.map:
    'Availability and access unknown · previously pinned code';
   info.append(label,hint);
   const actions=document.createElement('div');actions.className='room-browser-actions';
   const open=button('Open saved room',()=>openSavedRoom(code));
   const remove=button('Unpin',()=>{
    try{savePinned(readPinned().filter(value=>value!==code));renderRooms();
     status.textContent='Unpinned '+code+' from this device.';}
    catch(e){status.textContent=e.message;}
   });
   actions.append(open,remove);card.append(info,actions);savedGrid.append(card);
  }
 }
 clearSaved.onclick=()=>{
  if(!confirm('Remove all pinned room codes from this device?'))return;
  try{savePinned([]);renderRooms();status.textContent='Pinned room codes cleared from this device.';}
  catch(e){status.textContent=e.message;}
 };
 function button(label,click){
  const item=document.createElement('button');item.type='button';
  item.textContent=label;item.onclick=click;return item;
 }
 function capacity(room){return Number.isSafeInteger(room.capacity)&&room.capacity>=1&&room.capacity<=128?room.capacity:null;}
 function freeSeats(room){const cap=capacity(room);return cap===null?null:Math.max(0,cap-room.occupied);}
 function canBrowseJoin(room){
  const seats=freeSeats(room);
  return seats!==null&&seats>0;
 }
 function requestJoin(room){
  if(serverLink?.room||peerConnected){
   status.textContent='Leave the current match before joining a different room.';return false;
  }
  if(document.querySelector('.quick-queue-actions button:not([hidden])')||
     document.querySelector('.quick-ready:not([hidden])')){
   status.textContent='Cancel your human Quick Match search or ready-check before joining a room.';return false;
  }
  // A public listing never grants permission. The native join screen and
  // authoritative server re-check current account, capacity and visibility.
  showJoinScreen(room.room);
  if(room.requiresAccount&&!settings.account?.token){
   $('joinPlay').hidden=true;$('joinAuth').hidden=false;
  }
  return true;
 }
 function putRoom(room,pins){
  if(!room||typeof room.room!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(room.room)||
    !Number.isSafeInteger(room.players)||room.players<0||room.players>128)return;
  const card=document.createElement('article');card.className='room-browser-entry';
  card.dataset.publicRoom=room.room;card.tabIndex=-1;
  const copy=document.createElement('div');copy.className='room-browser-info';
  const title=document.createElement('strong');title.textContent='ROOM '+room.room;
  const details=document.createElement('small');
  details.textContent=room.players+' online · '+(Number.isSafeInteger(room.occupied)?room.occupied:room.players)+'/'+([8,12,16,24,64].includes(room.capacity)?room.capacity:'?')+' seats occupied · '+(room.requiresAccount?'Account required':'Guests allowed')+' · '+(room.started?'In progress':'Lobby')+
   ' · '+(['1v1','2v2','3v3','4v4'].includes(room.mode)?room.mode.toUpperCase():'Custom')+
   ' · '+String(room.map||'Stadium').slice(0,60)+
   ' · '+(freeSeats(room)===null?'Capacity not reported':freeSeats(room)+' open seats');
  copy.append(title,details);
  const actions=document.createElement('div');actions.className='room-browser-actions';
  const join=button('Join room',()=>requestJoin(room));
  join.className='primary';
  if(!canBrowseJoin(room)){join.disabled=true;join.textContent=freeSeats(room)===0?'Room full':'Availability unknown';}
  else if(room.requiresAccount&&!settings.account?.token){join.textContent='Sign in to join';}
  const share=button('Copy invite',async()=>{
   const url=location.origin+location.pathname+'?room='+encodeURIComponent(room.room);
   try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);status.textContent='Public room link copied.';
   }catch{status.textContent='Copy this URL to invite a friend: '+url;}
  });
  const pin=button(pins.includes(room.room)?'★ Unpin room':'☆ Pin room',()=>{
   try{
    const current=readPinned(),exists=current.includes(room.room);
    if(!exists&&current.length>=SAVED_LIMIT)
     throw Error('Only twelve room pins can be saved. Unpin an old room first.');
    savePinned(exists?current.filter(code=>code!==room.room):[...current,room.room]);
    renderRooms();
    status.textContent=(exists?'Unpinned ':'Pinned ')+room.room+' on this device.';
   }catch(e){status.textContent=e.message||'Unable to update pinned rooms.';}
  });
  pin.setAttribute('aria-pressed',String(pins.includes(room.room)));
  actions.append(join,share,pin);card.append(copy,actions);list.append(card);
 }
 function renderRooms(){
  if(!shown)return;
  let pins=[];
  try{pins=readPinned();}catch(e){status.textContent=e.message;return;}
  renderPinned(pins);
  const needle=search.value.trim().toLocaleLowerCase();
  const visible=roomsCache.filter(r=>
   (statusFilter.value==='all'||(statusFilter.value==='playing'?r.started:!r.started))&&
   (accessFilter.value==='all'||
    accessFilter.value==='space'&&canBrowseJoin(r)||
    accessFilter.value==='guest'&&canBrowseJoin(r)&&!r.requiresAccount||
    accessFilter.value==='lobby'&&canBrowseJoin(r)&&!r.started)&&
   (modeFilter.value==='all'||(modeFilter.value==='custom'?
    !['1v1','2v2','3v3','4v4'].includes(r.mode):r.mode===modeFilter.value))&&
   (!needle||r.room.toLocaleLowerCase().includes(needle)||
    r.map.toLocaleLowerCase().includes(needle)));
  if(order.value==='pinned')visible.sort((a,b)=>Number(pins.includes(b.room))-Number(pins.includes(a.room))||a.room.localeCompare(b.room));
  else if(order.value==='most')visible.sort((a,b)=>b.players-a.players||a.room.localeCompare(b.room));
  else if(order.value==='fewest')visible.sort((a,b)=>a.players-b.players||a.room.localeCompare(b.room));
  else if(order.value==='stadium')visible.sort((a,b)=>a.map.localeCompare(b.map)||a.room.localeCompare(b.room));
  list.replaceChildren();
  for(const room of visible)putRoom(room,pins);
  const age=lastLoadedAt>0?Math.max(0,Math.floor((Date.now()-lastLoadedAt)/1000)):null;
  const freshness=age===null?'No current server snapshot':age<45?'Updated '+age+'s ago':'Old snapshot ('+age+'s); refresh before joining';
  status.textContent=roomsCache.length?
   visible.length+' of '+roomsCache.length+' public rooms shown · '+freshness+' · refresh every 20s.':
   'No public rooms right now. You can create a private invite room instead.';
  if(roomsCache.length&&!visible.length)
   status.textContent='No public rooms match these filters. Change the search or refresh.';
 }
 for(const control of [search,statusFilter,modeFilter,order,accessFilter]){
  control.addEventListener(control===search?'input':'change',renderRooms);
 }
 async function load(){
  if(!shown||busy)return false;
  busy=true;const current=++sequence;refresh.disabled=true;
  status.textContent='Loading public rooms…';
  try{
   const response=await fetch('/api/public-rooms',{cache:'no-store'});
   if(!response.ok)throw Error('Room directory unavailable.');
   const result=await response.json();
   if(!shown||current!==sequence)return;
   if(!Array.isArray(result.rooms)||result.rooms.length>16)throw Error('Unexpected directory response.');
   // Only the already public, host-approved directory enters the local
   // search cache. Never combine it with the broader /api/rooms endpoint.
   roomsCache=result.rooms.filter(room=>room&&
    typeof room.room==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(room.room)&&
    Number.isSafeInteger(room.players)&&room.players>=0&&room.players<=128&&
    Number.isSafeInteger(room.occupied)&&room.occupied>=room.players&&room.occupied<=128&&
    typeof room.started==='boolean'&&typeof room.map==='string'&&
    room.map.length<=60&&typeof room.mode==='string');
   lastLoadedAt=Date.now();
   renderRooms();
   return true;
  }catch(e){if(current===sequence&&shown)status.textContent=e.message||'Room directory unavailable.';return false;}
  finally{busy=false;refresh.disabled=false;}
 }
 function close(){
  shown=false;sequence++;roomsCache=[];lastLoadedAt=0;body.hidden=true;refresh.hidden=true;find.hidden=true;filters.hidden=true;
  toggle.textContent='Browse rooms';toggle.setAttribute('aria-expanded','false');
  if(interval){clearInterval(interval);interval=null;}
 }
 toggle.onclick=()=>{
  if(shown){close();return;}
  shown=true;body.hidden=false;refresh.hidden=false;find.hidden=false;filters.hidden=false;
  toggle.textContent='Hide rooms';toggle.setAttribute('aria-expanded','true');
  renderRooms();load();interval=setInterval(()=>{if(shown&&document.visibilityState==='visible')load();},20000);
 };
 refresh.onclick=load;
 find.onclick=async()=>{
  if(!shown||busy)return;
  if(serverLink?.room||peerConnected||
     document.querySelector('.quick-queue-actions button:not([hidden])')||
     document.querySelector('.quick-ready:not([hidden])')){
   status.textContent='Leave your active match or cancel Quick Match before choosing a public room.';return;
  }
  find.disabled=true;
  status.textContent='Checking fresh public room listings…';
  try{
   // Never recommend a previously cached / possibly now private room if
   // fresh public-host approval cannot be retrieved.
   if(!await load())return;
   const loggedIn=!!settings.account?.token;
   const candidates=roomsCache.filter(r=>canBrowseJoin(r)&&
    (loggedIn||!r.requiresAccount)&&
    (statusFilter.value==='all'||(statusFilter.value==='playing'?r.started:!r.started))&&
    (accessFilter.value==='all'||accessFilter.value==='space'||
     accessFilter.value==='guest'&&!r.requiresAccount||
     accessFilter.value==='lobby'&&!r.started)&&
    (modeFilter.value==='all'||modeFilter.value==='custom'?
      !['1v1','2v2','3v3','4v4'].includes(r.mode):r.mode===modeFilter.value)&&
    (!search.value.trim()||r.room.toLowerCase().includes(search.value.trim().toLowerCase())||
     r.map.toLowerCase().includes(search.value.trim().toLowerCase())));
   if(!candidates.length){
    status.textContent='No currently advertised room matches your filters and account access. Try another format or refresh.';
    return;
   }
   let pins=[];try{pins=readPinned();}catch{}
   // Prefer a lobby with actual human occupancy, then explicitly pinned
   // hosts; never infer skill, server ping or room quality.
   candidates.sort((a,b)=>Number(!a.started)-Number(!b.started)||
    Number(pins.includes(a.room))-Number(pins.includes(b.room))||
    Math.min(a.players,8)-Math.min(b.players,8)||
    a.room.localeCompare(b.room));
   const chosen=candidates[candidates.length-1];
   if(!requestJoin(chosen))return;
   status.textContent='Selected public room '+chosen.room+'. The server will check its current access and capacity.';
  }finally{find.disabled=false;}
 };
 document.addEventListener('visibilitychange',()=>{
  if(shown&&document.visibilityState==='visible')load();
 });
})();
