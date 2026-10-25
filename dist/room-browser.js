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
 intro.textContent='Only rooms their hosts choose to list appear here. Joining still requires server approval.';
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
 for(const [value,label] of [['default','Server order'],['pinned','Pinned first'],['most','Most players'],['fewest','Fewest players'],['seats','Most available seats'],['stadium','Stadium A–Z']])
  order.add(new Option(label,value));
 const accessFilter=document.createElement('select');accessFilter.setAttribute('aria-label','Available room seats');
 for(const [value,label] of [['all','All rooms'],['space','Rooms with open seats'],['eligible','Rooms I can join'],['guest','Guest-accessible with seats'],['lobby','Open lobbies']])
  accessFilter.add(new Option(label,value));
 for(const control of [search,statusFilter,modeFilter,order,accessFilter])filters.append(control);
 const resetFilters=document.createElement('button');
 resetFilters.type='button';resetFilters.className='room-browser-reset';
 resetFilters.textContent='Clear filters';
 resetFilters.title='Show every currently advertised public room again';
 filters.append(resetFilters);
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
 const bookmarkBar=document.createElement('section');bookmarkBar.className='room-browser-transfer';
 bookmarkBar.setAttribute('aria-label','Portable public room bookmarks');
 const bookmarkTitle=document.createElement('strong');bookmarkTitle.textContent='MY PUBLIC ROOM BOOKMARKS';
 const bookmarkHelp=document.createElement('p');bookmarkHelp.textContent='Export or import only room codes you deliberately pinned. Rooms may become private or disappear; imported codes do not prove current visibility or grant entry.';
 const transferActions=document.createElement('div');transferActions.className='room-browser-transfer-actions';
 const exportPins=document.createElement('button');exportPins.type='button';exportPins.textContent='↓ Export pinned rooms';
 const importPins=document.createElement('button');importPins.type='button';importPins.textContent='↑ Import pinned rooms';
 const importFile=document.createElement('input');importFile.type='file';importFile.accept='.json,application/json';importFile.hidden=true;
 importFile.setAttribute('aria-label','Private JSON file of pinned public room codes');
 const replaceLabel=document.createElement('label');replaceLabel.className='room-browser-transfer-replace';
 const replacePins=document.createElement('input');replacePins.type='checkbox';
 replaceLabel.append(replacePins,document.createTextNode('Replace my current pins (default: add)'));
 transferActions.append(exportPins,importPins,replaceLabel,importFile);
 bookmarkBar.append(bookmarkTitle,bookmarkHelp,transferActions);
 const list=document.createElement('div');list.className='room-browser-list';
 const watchBar=document.createElement('section');watchBar.className='room-browser-watch';
 watchBar.setAttribute('aria-label','Pinned public room live availability');
 const watchButton=document.createElement('button');watchButton.type='button';
 watchButton.textContent='◎ Watch pinned availability';watchButton.setAttribute('aria-pressed','false');
 const watchText=document.createElement('p');watchText.setAttribute('role','status');
 watchText.setAttribute('aria-live','polite');
 watchText.textContent='Optional, tab-visible only. Uses the existing public-room refresh; no background tracking or automatic joins.';
 watchBar.append(watchButton,watchText);
 body.append(bookmarkBar,watchBar,savedSection,status,list);section.append(heading,intro,toolbar,filters,body);
 anchor.insertAdjacentElement('afterend',section);
 let sequence=0,busy=false,interval=null,shown=false,roomsCache=[],lastLoadedAt=0;
 // A directory left expanded on a hidden Home screen must not keep polling
 // the game server or advertising an active watch during live gameplay.
 const directoryVisible=()=>shown&&!home.hidden&&document.visibilityState!=='hidden';
 let watching=false,sawSnapshot=false,previousAvailable=new Set();
 const PUBLIC_LISTING_MAX_AGE=45000;
 const listingFresh=()=>lastLoadedAt>0&&Date.now()-lastLoadedAt<=PUBLIC_LISTING_MAX_AGE;
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
  catchupWatchBaseline();
 }
 function downloadPins(){
  let pins;
  try{pins=readPinned();}catch(error){status.textContent=error.message;return;}
  if(!pins.length)return void(status.textContent='Pin a public room before exporting its code.');
  if(!confirm('Export '+pins.length+' saved room code(s) to a local JSON file? The codes may still reach rooms later made private. Share this file carefully.'))return;
  const payload={format:'fuckball-public-room-bookmarks',version:1,
   exportedAt:new Date().toISOString(),rooms:pins};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{
   type:'application/json;charset=utf-8'
  }));
  const a=document.createElement('a');a.href=url;
  a.download='fuckball-public-room-bookmarks.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Pinned room code backup downloaded locally. No server upload or invitation sent.';
 }
 exportPins.onclick=downloadPins;
 importPins.onclick=()=>{importFile.value='';importFile.click();};
 importFile.onchange=async()=>{
  const file=importFile.files?.[0];importFile.value='';
  if(!file)return;
  if(file.size<1||file.size>4096)
   return void(status.textContent='Choose a bookmark JSON file between 1 byte and 4 KiB.');
  try{
   const parsed=JSON.parse(await file.text());
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
      Object.keys(parsed).some(k=>!['format','version','exportedAt','rooms'].includes(k))||
      parsed.format!=='fuckball-public-room-bookmarks'||parsed.version!==1||
      !Array.isArray(parsed.rooms)||parsed.rooms.length<1||parsed.rooms.length>SAVED_LIMIT||
      parsed.rooms.some(code=>!validRoom(code))||
      new Set(parsed.rooms).size!==parsed.rooms.length||
      (parsed.exportedAt!==undefined&&
       (typeof parsed.exportedAt!=='string'||parsed.exportedAt.length>35)))
    throw Error('The file is not a supported public room bookmark export.');
   const original=localStorage.getItem(SAVED_KEY);
   const existing=readPinned(),replace=replacePins.checked;
   const proposal=replace?[...parsed.rooms]:
    [...existing,...parsed.rooms.filter(code=>!existing.includes(code))];
   if(proposal.length>SAVED_LIMIT)
    throw Error('Combined bookmarks exceed twelve rooms. Unpin rooms or choose Replace before importing.');
   if(!confirm((replace?'Replace '+existing.length+' saved pin(s) with ':
      'Add '+(proposal.length-existing.length)+' new pin(s) to ')+
      parsed.rooms.length+' imported public-room code(s)? This does not join rooms or verify current access.'))return;
   if(localStorage.getItem(SAVED_KEY)!==original)
    throw Error('Bookmarks changed in another tab during import. Reload the list and try again.');
   savePinned(proposal);renderRooms();
   status.textContent='Imported '+proposal.length+' pinned room codes on this device; join still requires server admission.';
  }catch(error){status.textContent='Import refused: '+(error.message||'Invalid bookmark file.');}
 };
 function sessionBlock(){
  // Every entry point must share native ownership/queue/reconnect admission.
  // A room listing is not permission to replace a human's existing session.
  if(typeof onlineSessionConflict==='function')return onlineSessionConflict();
  if(serverLink||peerConnected||typeof peer!=='undefined'&&peer)
   return 'Leave the current connection before opening another room.';
  return '';
 }
 function busyWithMatch(){return !!sessionBlock();}
 function openSavedRoom(code){
  if(busyWithMatch()){
   status.textContent=sessionBlock()||'Finish your current game before opening another room.';
   return;
  }
  // A pinned code never proves that access is still allowed.
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
   const age=lastLoadedAt?Math.max(0,Math.floor((Date.now()-lastLoadedAt)/1000)):null;
   hint.textContent=published?
    (age!==null&&age<=45?'Recently advertised public':'Previously advertised public')+
    ' · last seen '+(age??'?')+'s ago · '+published.players+' players · '+published.map:
    'Not in the last public listing · access and availability unknown';
   const current=!!published&&canBrowseJoin(published);
   const badge=document.createElement('span');badge.className='room-browser-availability';
   badge.dataset.open=current?'yes':'no';
   badge.textContent=current?'PUBLIC · OPEN SEATS':
    (published&&listingFresh()?'PUBLIC · NO FREE SEATS':'CURRENT STATUS UNKNOWN');
   info.append(label,badge,hint);
   const actions=document.createElement('div');actions.className='room-browser-actions';
   const joinOpen=button(published?.requiresAccount?'Sign in / join public':'Join public room',
     ()=>{if(published)requestJoin(published);});
   joinOpen.disabled=!current;joinOpen.className='room-browser-live-join';
   const open=button('Open saved room',()=>openSavedRoom(code));
   const remove=button('Unpin',()=>{
    try{savePinned(readPinned().filter(value=>value!==code));renderRooms();
     status.textContent='Unpinned '+code+' from this device.';}
    catch(e){status.textContent=e.message;}
   });
   actions.append(joinOpen,open,remove);card.append(info,actions);savedGrid.append(card);
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
 const standardRoomModes=['1v1','2v2','3v3','4v4'];
 function matchesMode(room){
  const selected=modeFilter.value;
  return selected==='all'||(selected==='custom'?
   !standardRoomModes.includes(room.mode):room.mode===selected);
 }
 function capacity(room){return Number.isSafeInteger(room.capacity)&&room.capacity>=1&&room.capacity<=128?room.capacity:null;}
 function freeSeats(room){const cap=capacity(room);return cap===null?null:Math.max(0,cap-room.occupied);}
 function canBrowseJoin(room){
  const seats=freeSeats(room);
  // A once-public room might have been unpublished, ended or moved private.
  // Old directory results are only historical display data, not admission hints.
  return listingFresh()&&roomsCache.some(x=>x.room===room.room)&&seats!==null&&seats>0;
 }
 function availablePins(){
  let pins=[];try{pins=readPinned();}catch{return new Set();}
  return new Set(pins.filter(code=>{
   const room=roomsCache.find(r=>r.room===code);
   return !!room&&canBrowseJoin(room);
  }));
 }
 // Fresh public-listing data only. Pin and visibility changes are baselined
 // rather than mistaken for a server transition; an old code is never trusted.
 function catchupWatchBaseline(){
  sawSnapshot=false;previousAvailable=new Set();
  if(watching&&listingFresh()){
   previousAvailable=availablePins();sawSnapshot=true;
  }
 }
 function watchFreshListing(){
  if(!watching)return;
  const open=availablePins();
  if(!sawSnapshot){previousAvailable=open;sawSnapshot=true;}
  else{
   const arrivals=[...open].filter(code=>!previousAvailable.has(code));
   if(arrivals.length){
    watchText.textContent='New since the previous public listing: '+arrivals.join(', ')+
     '. These pinned rooms advertise a free seat now. Server entry is still checked when you join.';
   }
   previousAvailable=open;
   if(arrivals.length)return;
  }
  watchText.textContent=
   open.size+' pinned public room'+(open.size===1?'':'s')+
   ' currently advertise open seats. Availability can change at any moment.';
 }
 watchButton.addEventListener('click',()=>{
  watching=!watching;
  watchButton.setAttribute('aria-pressed',String(watching));
  watchButton.textContent=watching?'● Stop watching':'◎ Watch pinned availability';
  watchText.textContent=watching?
   'Watching only while this room directory is open and this tab is visible. Waiting for refreshed public listings.':
   'Watch stopped. Nothing runs in the background.';
  catchupWatchBaseline();
  if(watching&&directoryVisible()&&listingFresh())watchFreshListing();
  else if(watching&&!directoryVisible())watchText.textContent=
   'Availability watch paused outside the visible public-room browser.';
 });
 function requestJoin(room){
  if(!canBrowseJoin(room)){
   status.textContent='Room directory is stale, unavailable or full. Refresh before attempting to join. Server admission is always required.';
   return false;
  }
  if(busyWithMatch()){
   status.textContent=sessionBlock()||'Leave your current match before joining another room.';
   return false;
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
  watchBar.hidden=!pins.length;
  const needle=search.value.trim().toLocaleLowerCase();
  const visible=roomsCache.filter(r=>
   (statusFilter.value==='all'||(statusFilter.value==='playing'?r.started:!r.started))&&
   (accessFilter.value==='all'||
    accessFilter.value==='space'&&canBrowseJoin(r)||
    accessFilter.value==='eligible'&&canBrowseJoin(r)&&(!r.requiresAccount||!!settings.account?.token)||
    accessFilter.value==='guest'&&canBrowseJoin(r)&&!r.requiresAccount||
    accessFilter.value==='lobby'&&canBrowseJoin(r)&&!r.started)&&
   matchesMode(r)&&
   (!needle||r.room.toLocaleLowerCase().includes(needle)||
    r.map.toLocaleLowerCase().includes(needle)));
  if(order.value==='pinned')visible.sort((a,b)=>Number(pins.includes(b.room))-Number(pins.includes(a.room))||a.room.localeCompare(b.room));
  else if(order.value==='most')visible.sort((a,b)=>b.players-a.players||a.room.localeCompare(b.room));
  else if(order.value==='fewest')visible.sort((a,b)=>a.players-b.players||a.room.localeCompare(b.room));
  else if(order.value==='seats')visible.sort((a,b)=>(freeSeats(b)??-1)-(freeSeats(a)??-1)||a.room.localeCompare(b.room));
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
 resetFilters.onclick=()=>{
  search.value='';statusFilter.value='all';modeFilter.value='all';
  order.value='default';accessFilter.value='all';renderRooms();
 };
 async function load(){
  if(!directoryVisible()||busy)return false;
  busy=true;const current=++sequence;refresh.disabled=true;
  status.textContent='Loading public rooms…';
  try{
   const response=await fetch('/api/public-rooms',{cache:'no-store'});
   if(!response.ok)throw Error('Room directory unavailable.');
   const result=await response.json();
   if(!directoryVisible()||current!==sequence)return false;
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
   watchFreshListing();
   renderRooms();
   return true;
  }catch(e){
   if(current===sequence&&shown){
    // Network failure invalidates the directory, but never touches saved pins.
    // A stale published code must not remain as an actionable public listing.
    roomsCache=[];lastLoadedAt=0;catchupWatchBaseline();renderRooms();
    if(watching)watchText.textContent='Public directory is unavailable; no pinned room is confirmed open.';
    status.textContent=(e.message||'Room directory unavailable.')+' Pinned room codes are kept, but current public availability is unknown.';
   }
   return false;
  }
  finally{busy=false;refresh.disabled=false;}
 }
 function close(){
  shown=false;sequence++;roomsCache=[];lastLoadedAt=0;catchupWatchBaseline();body.hidden=true;refresh.hidden=true;find.hidden=true;filters.hidden=true;
  toggle.textContent='Browse rooms';toggle.setAttribute('aria-expanded','false');
  if(interval){clearInterval(interval);interval=null;}
 }
 toggle.onclick=()=>{
  if(shown){close();return;}
  shown=true;body.hidden=false;refresh.hidden=false;find.hidden=false;filters.hidden=false;
  toggle.textContent='Hide rooms';toggle.setAttribute('aria-expanded','true');
  renderRooms();load();
  interval=setInterval(()=>{if(directoryVisible())load();},20000);
 };
 refresh.onclick=load;
 find.onclick=async()=>{
  if(!directoryVisible()||busy)return;
  const blocked=sessionBlock();
  if(blocked){status.textContent=blocked;return;}
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
     accessFilter.value==='eligible'&&(loggedIn||!r.requiresAccount)||
     accessFilter.value==='guest'&&!r.requiresAccount||
     accessFilter.value==='lobby'&&!r.started)&&
    matchesMode(r)&&
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
 function syncDirectoryVisibility(){
  if(!shown)return;
  if(!directoryVisible()){
   if(watching)watchText.textContent=
    'Availability watch paused while the public-room browser is not visible. No background refresh or automatic join.';
   return;
  }
  // A cached listing is never proof of availability after returning from
  // gameplay. Fetch a fresh host-approved snapshot before enabling joins.
  catchupWatchBaseline();
  if(!busy)load();
 }
 document.addEventListener('visibilitychange',syncDirectoryVisibility);
 window.addEventListener('focus',syncDirectoryVisibility);
 // Home navigation uses the existing tab; the 20-second tick handles
 // programmatic view switches without adding any new game-state polling.
 document.getElementById('tabHome')?.addEventListener('click',
  ()=>setTimeout(syncDirectoryVisibility,0));
 window.addEventListener('storage',event=>{
  if(shown&&(event.key===SAVED_KEY||event.key===null))renderRooms();
 });
})();
