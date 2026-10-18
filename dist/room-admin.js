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
 description.textContent='The host can stop new joins without ending the game, remove disruptive players, and suspend signed-in players from this room for 10 minutes. Current players and valid reconnects keep their slots.';
 const controls=document.createElement('div');controls.className='room-admin-actions';
 const lock=document.createElement('button');lock.type='button';lock.className='primary';
 const targetWrap=document.createElement('label');targetWrap.textContent='Connected player';
 const target=document.createElement('select');target.setAttribute('aria-label','Player to moderate');
 targetWrap.append(target);
 const kick=document.createElement('button');kick.type='button';kick.textContent='Remove';
 const ban=document.createElement('button');ban.type='button';ban.className='danger';ban.textContent='Suspend 10 min';
 controls.append(lock,targetWrap,kick,ban);
 const notice=document.createElement('p');notice.className='room-admin-notice';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 panel.append(heading,description,controls,notice);
 pane.append(panel);
 function label(player){return (player.team?.id===1?'RED':player.team?.id===2?'BLUE':'BENCH')+' · '+String(player.name||'Player').slice(0,25);}
 function render(){
  const link=serverLink;
  if(!link?.room){panel.hidden=true;return;}
  panel.hidden=false;
  const isOwner=!!link.isOwner,locked=link.roomControl?.locked===true;
  state.textContent=locked?'🔒 Closed to new players':'🔓 Open to invites';
  state.classList.toggle('locked',locked);
  controls.hidden=!isOwner;
  if(!isOwner){notice.textContent=locked?'The host has locked the room. Your game continues.':'The room host controls entry and moderation.';return;}
  lock.textContent=locked?'Unlock joins':'Lock joins';lock.disabled=false;
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
  kick.disabled=ban.disabled=!available;
  if(!available)notice.textContent='Nobody else is connected to this room.';
  else if(notice.textContent==='Nobody else is connected to this room.')notice.textContent='';
 }
 function send(action,id){
  if(!serverLink?.isOwner||!serverLink.room)return;
  serverLink.send({type:'roomAdmin',action,...(id!==undefined?{id}:{})});
 }
 lock.onclick=()=>{if(!serverLink?.isOwner)return;lock.disabled=true;send(serverLink.roomControl?.locked?'unlock':'lock');notice.textContent='Updating room admission…';};
 function selectPlayer(){const id=Number(target.value);return Number.isSafeInteger(id)&&id>0&&id!==networkPlayerId?id:null;}
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
