'use strict';
// Product-core: display the *admitted player's* native team and bench identity
// on Home/My Games, without duplicating the separately owned native bench or
// host-pause actions. The actual room menu keeps every mutation/permission gate.
(function(){
 const home=document.querySelector('#homeView');
 const games=document.querySelector('#gamesView');
 if(!home&&!games)return;
 const build=(tag,copy,className)=>{
  const el=document.createElement(tag);
  if(copy!==undefined)el.textContent=copy;
  if(className)el.className=className;
  return el;
 };
 const cards=[];
 function liveRole(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||link.quickMatchMode||link.ws?.readyState!==1||
     !link.roomState||link.roomState.room!==link.room||
     !Number.isSafeInteger(link.roomState.round)||link.roomState.round<0)return null;
  const id=typeof networkPlayerId==='number'?networkPlayerId:null;
  const playerList=typeof room!=='undefined'?room?.state?.players:null;
  if(!Number.isSafeInteger(id)||id<=0||!Array.isArray(playerList))return null;
  const player=playerList.find(p=>p?.id===id);
  if(!player||typeof botIds!=='undefined'&&botIds?.has?.(id))return null;
  const side=typeof player.team==='number'?player.team:player.team?.id;
  if(![0,1,2].includes(side))return null;
  const state=link.roomState;
  if(Array.isArray(state.disconnectedIds)&&state.disconnectedIds.includes(id))return null;
  const benches=Array.isArray(state.benches)?state.benches:[];
  const mine=benches.find(v=>Array.isArray(v)&&v[0]===id);
  const assigned=mine&&[1,2].includes(mine[1])?mine[1]:0;
  const available=side===0&&assigned!==0&&
   Array.isArray(state.benchReadyIds)&&state.benchReadyIds.includes(id);
  return{link,id,side,assigned,available,started:state.started===true,
   paused:state.paused===true,completed:!!state.lastResult};
 }
 function describe(role){
  const label=role.side===1?'PLAYING FOR RED':role.side===2?'PLAYING FOR BLUE':
   role.assigned===1?'RED TEAM BENCH':role.assigned===2?'BLUE TEAM BENCH':
    'NEUTRAL SPECTATOR';
  const phase=role.started?(role.paused?'ROUND PAUSED':'ROUND LIVE'):
   role.completed?'BETWEEN ROUNDS':'ROOM LOBBY';
  const availability=role.side===0&&role.assigned!==0?
   role.available?' · AVAILABLE TO SUBSTITUTE':' · NOT MARKED AVAILABLE':'';
  return label+' · '+phase+availability;
 }
 function openNativeBench(){
  const before=liveRole();
  if(!before)return;
  document.querySelector('#tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  else document.querySelector('#matchMenuButton')?.click();
  // Another room may have become active during navigation. Never offer stale
  // team choices or forward a click to a wrong room.
  const after=liveRole();
  if(!after||before.link!==after.link||before.id!==after.id)return;
  const panel=document.querySelector('.self-bench-panel');
  if(!panel||panel.hidden)return;
  panel.scrollIntoView?.({behavior:'auto',block:'nearest'});
  const candidate=[...panel.querySelectorAll('button')]
   .find(b=>!b.hidden&&!b.disabled);
  (candidate||panel).focus?.({preventScroll:true});
 }
 for(const [view,heading]of [[home,'YOUR TEAM'],[games,'YOUR CURRENT ROOM']]){
  if(!view)continue;
  const section=build('aside',undefined,'native-role-summary');
  section.hidden=true;
  section.setAttribute('aria-label','Current server-confirmed room team');
  const title=build('strong',heading);
  const roleText=build('p','', 'native-role-summary-role');
  roleText.setAttribute('role','status');
  roleText.setAttribute('aria-live','polite');
  const context=build('p',
   'A bench assignment does not put you on the pitch. A real host or captain must request the substitution, and you must consent.',
   'native-role-summary-hint');
  const open=build('button','↗ View team and bench choices','native-role-summary-open');
  open.type='button';
  open.addEventListener('click',openNativeBench);
  section.append(title,roleText,context,open);
  const currentRoom=view===home?view.querySelector('.play-hub-current-room'):null;
  if(currentRoom)currentRoom.insertAdjacentElement('afterend',section);
  else view.prepend(section);
  cards.push({section,roleText,context});
 }
 function refresh(){
  const role=liveRole();
  for(const card of cards){
   card.section.hidden=!role;
   if(!role){card.roleText.textContent='';continue;}
   const text=describe(role);
   if(card.roleText.textContent!==text)card.roleText.textContent=text;
   card.context.hidden=role.side!==0;
  }
 }
 const clock=setInterval(()=>{if(!document.hidden)refresh();},1100);
 clock?.unref?.();
 window.addEventListener('focus',refresh);
 window.addEventListener('fuckball:native-session-state',refresh);
 document.addEventListener('visibilitychange',refresh);
 for(const selector of ['#tabHome','#tabPlay','#tabGames']){
  document.querySelector(selector)?.addEventListener('click',()=>queueMicrotask(refresh));
 }
 refresh();
})();
