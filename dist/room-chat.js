'use strict';
// Device-only mute controls for genuine native room chat. Never changes another
// player's account, server permissions or the match state.
(function(){
 const settingsPane=document.querySelector('#menuVideoPane .rm-form');
 if(!settingsPane)return;
 const panel=document.createElement('section');
 panel.className='native-chat-settings';panel.setAttribute('aria-label','Room chat controls');
 const title=document.createElement('h3');title.textContent='ROOM CHAT.';
 const description=document.createElement('p');
 description.textContent='Online messages come from your room server. Mute a player to hide their messages on this device only; this does not remove, block or report them.';
 const status=document.createElement('p');status.className='native-chat-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const players=document.createElement('div');players.className='native-chat-players';
 panel.append(title,description,status,players);settingsPane.append(panel);
 let roomId=null,muted=new Set();
 function currentRoom(){
  const next=serverLink?.room||null;
  if(next!==roomId){roomId=next;muted.clear();}
  return roomId;
 }
 function rows(){
  players.replaceChildren();
  const current=currentRoom();
  panel.hidden=!current;
  if(!current)return;
  const all=room?.state?.players;
  const candidates=Array.isArray(all)?all.filter(p=>
   Number.isSafeInteger(p?.id)&&p.id>0&&p.id!==networkPlayerId&&
   p.aiControlled!==true&&!botIds.has(p.id)).slice(0,64):[];
  status.textContent=candidates.length?
   muted.size+' muted in room '+current+' · changes are temporary.':
   'Other players will appear here after you join their room.';
  for(const player of candidates){
   const row=document.createElement('div');row.className='native-chat-player';
   const name=document.createElement('span');
   name.textContent=String(player.name||'Player').slice(0,25)+' · #'+player.id;
   const button=document.createElement('button');button.type='button';
   const blocked=muted.has(player.id);
   button.textContent=blocked?'Unmute':'Mute';button.setAttribute('aria-pressed',String(blocked));
   button.setAttribute('aria-label',(blocked?'Unmute ':'Mute ')+name.textContent);
   button.onclick=()=>{
    if(muted.has(player.id))muted.delete(player.id);
    else muted.add(player.id);
    rows();
   };
   row.append(name,button);players.append(row);
  }
 }
 window.renderNativeChatMute=rows;
 window.onNativeRoomChat=message=>{
  const current=currentRoom();
  if(!current||message?.room!==current||
     !Number.isSafeInteger(message.from)||message.from<1||
     typeof message.name!=='string'||message.name.length>25||
     typeof message.text!=='string'||message.text.length<1||message.text.length>140||
     /[\u0000-\u001f\u007f-\u009f]/.test(message.text))return;
  if(muted.has(message.from))return;
  log(message.name+': '+message.text,false);
 };
 rows();
})();
