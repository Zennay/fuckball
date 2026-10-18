'use strict';
// Custom-room host tools. Permission checks and kick/ban admission are enforced
// by the native server; this interface never grants authority.
(function(){
 const pane=$('menuMatchPane');
 if(!pane)return;
 const panel=document.createElement('section');
 panel.className='room-admin-panel';panel.hidden=true;
 panel.setAttribute('aria-label','Online room moderation');
 const heading=document.createElement('div');heading.className='room-admin-heading';
 const title=document.createElement('strong');title.textContent='ROOM CONTROL';
 const state=document.createElement('span');state.className='room-admin-state';
 heading.append(title,state);
 const description=document.createElement('p');
 description.textContent='Hosts can set account-only entry, limit room size including benches and spectators, lock joins and moderate chat without stopping play. New admission rules never eject current players or cancel their valid reconnect tickets.';
 const controls=document.createElement('div');controls.className='room-admin-actions';
 const lock=document.createElement('button');lock.type='button';lock.className='primary';
 const clubLock=document.createElement('button');clubLock.type='button';
 clubLock.className='room-club-lock';clubLock.textContent='Club-only room';
 const listing=document.createElement('button');listing.type='button';
 listing.className='room-listing-toggle';listing.textContent='List publicly';
 const accountsOnly=document.createElement('button');accountsOnly.type='button';
 accountsOnly.textContent='Require account for new joins';
 const capacityWrap=document.createElement('label');capacityWrap.textContent='Room capacity';
 const capacity=document.createElement('select');
 capacity.setAttribute('aria-label','Maximum human participants including bench and spectators');
 for(const limit of [8,12,16,24,64])capacity.add(new Option(limit===64?'Open room · up to 64 people':limit+' people',String(limit)));
 capacityWrap.append(capacity);
 const targetWrap=document.createElement('label');targetWrap.textContent='Connected player';
 const target=document.createElement('select');target.setAttribute('aria-label','Player to moderate');
 targetWrap.append(target);
 const kick=document.createElement('button');kick.type='button';kick.textContent='Remove';
 const ban=document.createElement('button');ban.type='button';ban.className='danger';ban.textContent='Suspend 10 min';
 const muteChat=document.createElement('button');muteChat.type='button';muteChat.textContent='Mute chat 10 min';
 controls.append(lock,clubLock,listing,accountsOnly,capacityWrap,targetWrap,muteChat,kick,ban);
 const notice=document.createElement('p');notice.className='room-admin-notice';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 panel.append(heading,description,controls,notice);
 pane.append(panel);
 function label(player){return (player.team?.id===1?'RED':player.team?.id===2?'BLUE':'BENCH')+' · '+String(player.name||'Player').slice(0,25);}
 function render(){
  const link=serverLink;
  if(!link?.room){panel.hidden=true;return;}
  panel.hidden=false;
  const isOwner=!!link.isOwner,locked=link.roomControl?.locked===true,listed=link.roomControl?.listed===true,clubOnly=link.roomControl?.clubOnly===true;
  state.textContent=locked?'🔒 Closed to new players':clubOnly?'🛡 Club members only':listed?'🌍 Public room · opt-in':'🔗 Unlisted · invite link only';
  state.textContent+=' · '+(link.roomControl?.connectedHumans??'?')+'/'+(link.roomControl?.maxHumans??64)+' participants';
  if(link.roomControl?.accountsOnly)state.textContent+=' · signed-in only';
  state.classList.toggle('locked',locked);
  controls.hidden=!isOwner;
  if(!isOwner){notice.textContent=locked?'The host has locked the room. Your game continues.':'The room host controls entry and moderation.';return;}
  lock.textContent=locked?'Unlock joins':'Lock joins';lock.disabled=false;
  clubLock.hidden=!clubOnly&&!link.roomControl?.canClubLock;
  clubLock.textContent=clubOnly?'Allow other invited players':'Restrict to my Club';
  clubLock.setAttribute('aria-pressed',String(clubOnly));
  clubLock.disabled=false;
  clubLock.title=clubOnly?
   'Disable Club-only admission. The room stays unlisted.':
   'All current players must be signed-in members of your Club.';
  listing.textContent=listed?'Remove from public rooms':'List room publicly';
  listing.disabled=locked||clubOnly;listing.setAttribute('aria-pressed',String(listed));
  listing.title=clubOnly?'Club-only rooms cannot appear in public listings.':locked?'Unlock joins to publish this room.':'Anyone can see and join a public room.';
  accountsOnly.textContent=link.roomControl?.accountsOnly?'Allow guests for new joins':'Require sign-in for new joins';
  accountsOnly.setAttribute('aria-pressed',String(link.roomControl?.accountsOnly===true));
  accountsOnly.disabled=false;
  const currentCapacity=String(link.roomControl?.maxHumans??64);
  if(capacity.value!==currentCapacity)capacity.value=currentCapacity;
  capacity.disabled=false;
  const current=target.value,players=room?.state?.players||[];
  const eligible=players.filter(p=>Number.isSafeInteger(p.id)&&p.id!==networkPlayerId&&!botIds.has(p.id));
  const signature=JSON.stringify(eligible.map(p=>[p.id,p.name,p.team?.id]));
  if(signature!==target.dataset.roster){
   target.dataset.roster=signature;target.replaceChildren();
   for(const p of eligible){
    const option=document.createElement('option');
    option.value=String(p.id);option.textContent=label(p);target.append(option);
   }
   if(eligible.some(p=>String(p.id)===current))target.value=current;
  }
  const available=eligible.length>0;
  kick.disabled=ban.disabled=muteChat.disabled=!available;
  const selectedId=Number(target.value);
  const muted=(link.roomControl?.chatMutes||[]).some(m=>m[0]===selectedId&&m[1]>Date.now());
  muteChat.textContent=muted?'Unmute chat':'Mute chat 10 min';
  muteChat.setAttribute('aria-pressed',String(muted));
  if(!available)notice.textContent='Nobody else is connected to this room.';
  else if(notice.textContent==='Nobody else is connected to this room.')notice.textContent='';
 }
 function send(action,id){
  if(!serverLink?.isOwner||!serverLink.room)return;
  serverLink.send({type:'roomAdmin',action,...(id!==undefined?{id}:{})});
 }
 clubLock.onclick=()=>{
  if(!serverLink?.isOwner)return;
  const restricted=serverLink.roomControl?.clubOnly===true;
  if(!restricted&&!confirm('Restrict this room to signed-in members of your Club? Every connected person must already be a member.'))return;
  clubLock.disabled=true;
  send(restricted?'clubOpen':'clubOnly');
  notice.textContent=restricted?'Reopening to invited players…':'Checking Club membership and restricting room…';
 };
 listing.onclick=()=>{
  if(!serverLink?.isOwner||serverLink.roomControl?.locked)return;
  listing.disabled=true;
  send(serverLink.roomControl?.listed?'unpublish':'publish');
  notice.textContent='Updating room visibility…';
 };
 lock.onclick=()=>{if(!serverLink?.isOwner)return;lock.disabled=true;send(serverLink.roomControl?.locked?'unlock':'lock');notice.textContent='Updating room admission…';};
 accountsOnly.onclick=()=>{
  if(!serverLink?.isOwner)return;
  const now=serverLink.roomControl?.accountsOnly===true;
  accountsOnly.disabled=true;send(now?'allowGuests':'accountsOnly');
  notice.textContent=now?'Allowing guests to join…':'Requiring accounts for new joins…';
 };
 capacity.onchange=()=>{
  if(!serverLink?.isOwner)return;
  const limit=Number(capacity.value);
  if(![8,12,16,24,64].includes(limit))return;
  if(limit<(serverLink.roomControl?.connectedHumans??0)){
   notice.textContent='This limit is smaller than the current roster.';
   capacity.value=String(serverLink.roomControl?.maxHumans??64);return;
  }
  capacity.disabled=true;
  serverLink.send({type:'roomAdmin',action:'capacity',limit});
  notice.textContent='Updating room size limit…';
 };
 function selectPlayer(){const id=Number(target.value);return Number.isSafeInteger(id)&&id>0&&id!==networkPlayerId?id:null;}
 target.addEventListener('change',render);
 muteChat.onclick=()=>{
  const id=selectPlayer();if(id===null||!serverLink?.isOwner)return;
  const muted=(serverLink.roomControl?.chatMutes||[]).some(m=>m[0]===id&&m[1]>Date.now());
  send(muted?'unmuteChat':'muteChat',id);
  notice.textContent=muted?'Restoring player chat…':'Muting player chat for 10 minutes…';
  muteChat.disabled=true;
 };
 kick.onclick=()=>{
  const id=selectPlayer(),name=target.selectedOptions?.[0]?.textContent||'this player';
  if(id===null||!serverLink?.isOwner)return;
  if(confirm('Remove '+name+' from this room?')){send('kick',id);notice.textContent='Removing player…';}
 };
 ban.onclick=()=>{
  const id=selectPlayer(),name=target.selectedOptions?.[0]?.textContent||'this player';
  if(id===null||!serverLink?.isOwner)return;
  if(confirm('Suspend '+name+' from this room for 10 minutes? Only signed-in players can be temporarily banned.')){
   send('ban',id);notice.textContent='Requesting temporary room suspension…';
  }
 };
 window.renderCustomRoomAdmin=render;
})();
