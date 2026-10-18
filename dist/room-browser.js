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
 toolbar.append(toggle,refresh);
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
 for(const [value,label] of [['default','Server order'],['most','Most players'],['fewest','Fewest players'],['stadium','Stadium A–Z']])
  order.add(new Option(label,value));
 for(const control of [search,statusFilter,modeFilter,order])filters.append(control);
 const body=document.createElement('div');body.className='room-browser-body';body.hidden=true;
 const status=document.createElement('p');status.className='room-browser-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const list=document.createElement('div');list.className='room-browser-list';
 body.append(status,list);section.append(heading,intro,toolbar,filters,body);
 anchor.insertAdjacentElement('afterend',section);
 let sequence=0,busy=false,interval=null,shown=false,roomsCache=[];
 function button(label,click){
  const item=document.createElement('button');item.type='button';
  item.textContent=label;item.onclick=click;return item;
 }
 function putRoom(room){
  if(!room||typeof room.room!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(room.room)||
    !Number.isSafeInteger(room.players)||room.players<0||room.players>128)return;
  const card=document.createElement('article');card.className='room-browser-entry';
  const copy=document.createElement('div');copy.className='room-browser-info';
  const title=document.createElement('strong');title.textContent='ROOM '+room.room;
  const details=document.createElement('small');
  details.textContent=room.players+' online · '+(Number.isSafeInteger(room.occupied)?room.occupied:room.players)+'/'+([8,12,16,24,64].includes(room.capacity)?room.capacity:'?')+' seats occupied · '+(room.requiresAccount?'Account required':'Guests allowed')+' · '+(room.started?'In progress':'Lobby')+
   ' · '+(['1v1','2v2','3v3','4v4'].includes(room.mode)?room.mode.toUpperCase():'Custom')+
   ' · '+String(room.map||'Stadium').slice(0,60);
  copy.append(title,details);
  const actions=document.createElement('div');actions.className='room-browser-actions';
  const join=button('Join room',()=>{
   if(serverLink?.room){
    status.textContent='Leave your current room before joining another.';return;
   }
   if(room.requiresAccount&&!settings.account?.token){showJoinScreen(room.room);$('joinPlay').hidden=true;$('joinAuth').hidden=false;return;}
   showJoinScreen(room.room);
  });
  join.className='primary';
  if((Number.isSafeInteger(room.occupied)?room.occupied:room.players)>=room.capacity){join.disabled=true;join.textContent='Room full';}
  else if(room.requiresAccount&&!settings.account?.token){join.textContent='Sign in to join';}
  const share=button('Copy invite',async()=>{
   const url=location.origin+location.pathname+'?room='+encodeURIComponent(room.room);
   try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);status.textContent='Public room link copied.';
   }catch{status.textContent='Copy this URL to invite a friend: '+url;}
  });
  actions.append(join,share);card.append(copy,actions);list.append(card);
 }
 function renderRooms(){
  if(!shown)return;
  const needle=search.value.trim().toLocaleLowerCase();
  const visible=roomsCache.filter(r=>
   (statusFilter.value==='all'||(statusFilter.value==='playing'?r.started:!r.started))&&
   (modeFilter.value==='all'||(modeFilter.value==='custom'?
    !['1v1','2v2','3v3','4v4'].includes(r.mode):r.mode===modeFilter.value))&&
   (!needle||r.room.toLocaleLowerCase().includes(needle)||
    r.map.toLocaleLowerCase().includes(needle)));
  if(order.value==='most')visible.sort((a,b)=>b.players-a.players||a.room.localeCompare(b.room));
  else if(order.value==='fewest')visible.sort((a,b)=>a.players-b.players||a.room.localeCompare(b.room));
  else if(order.value==='stadium')visible.sort((a,b)=>a.map.localeCompare(b.map)||a.room.localeCompare(b.room));
  list.replaceChildren();
  for(const room of visible)putRoom(room);
  status.textContent=roomsCache.length?
   visible.length+' of '+roomsCache.length+' public rooms shown · listings refresh every 20s.':
   'No public rooms right now. You can create a private invite room instead.';
  if(roomsCache.length&&!visible.length)
   status.textContent='No public rooms match these filters. Change the search or refresh.';
 }
 for(const control of [search,statusFilter,modeFilter,order]){
  control.addEventListener(control===search?'input':'change',renderRooms);
 }
 async function load(){
  if(!shown||busy)return;
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
   renderRooms();
  }catch(e){if(current===sequence&&shown)status.textContent=e.message||'Room directory unavailable.';}
  finally{busy=false;refresh.disabled=false;}
 }
 function close(){
  shown=false;sequence++;roomsCache=[];body.hidden=true;refresh.hidden=true;filters.hidden=true;
  toggle.textContent='Browse rooms';toggle.setAttribute('aria-expanded','false');
  if(interval){clearInterval(interval);interval=null;}
 }
 toggle.onclick=()=>{
  if(shown){close();return;}
  shown=true;body.hidden=false;refresh.hidden=false;filters.hidden=false;
  toggle.textContent='Hide rooms';toggle.setAttribute('aria-expanded','true');
  load();interval=setInterval(()=>{if(shown&&document.visibilityState==='visible')load();},20000);
 };
 refresh.onclick=load;
 document.addEventListener('visibilitychange',()=>{
  if(shown&&document.visibilityState==='visible')load();
 });
})();
