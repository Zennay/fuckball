'use strict';
// Server-routed Custom Room team-only chat. A missing capability NEVER falls
// back to public chat; the active player's team/bench is verified again server-side.
(function(){
 const form=document.getElementById('chatForm');
 const input=document.getElementById('chatInput');
 const corner=document.getElementById('hudCorner');
 if(!form||!input||!corner)return;
 const row=document.createElement('div');row.className='team-chat-channel';
 const label=document.createElement('label');label.textContent='SEND TO';
 const choice=document.createElement('select');
 choice.setAttribute('aria-label','Chat recipients');
 const publicOption=new Option('ROOM · Everyone','room');
 const privateOption=new Option('TEAM · Teammates only','team');
 choice.add(publicOption);choice.add(privateOption);choice.value='room';
 label.append(choice);
 const note=document.createElement('span');note.className='team-chat-note';note.setAttribute('role','status');
 note.textContent='Room messages are visible to all players.';
 row.append(label,note);
 form.prepend(row);
 const actions=document.createElement('div');actions.className='team-chat-quick';
 actions.hidden=true;
 const heading=document.createElement('span');heading.textContent='TEAM ONLY · ';
 const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const phrases=['Pass to me!','Cover back!','Switch sides!','I will defend!'];
 actions.append(heading);
 let recent=-Infinity;
 let current=null;
 function link(){return typeof serverLink!=='undefined'?serverLink:null;}
 function liveTransport(l){return !!l?.room&&l.ws?.readyState===1;}
 function eligible(l){
  return liveTransport(l)&&!l.quickMatchMode&&l.roomControl?.teamChatSupported===true;
 }
 function side(l){
  if(!eligible(l))return 0;
  const id=typeof networkPlayerId!=='undefined'?networkPlayerId:null;
  if(!Number.isSafeInteger(id)||id<=0)return 0;
  const people=typeof room!=='undefined'?room?.state?.players:null;
  const person=people?.find?.(p=>p.id===id);
  const native=typeof person?.team==='number'?person.team:person?.team?.id;
  if(native===1||native===2)return native;
  if(native!==0)return 0;
  const benches=l?.roomState?.benches;
  const bench=Array.isArray(benches)?benches.find(p=>Array.isArray(p)&&p[0]===id):null;
  return bench?.[1]===1||bench?.[1]===2?bench[1]:0;
 }
 function sync(){
  const l=link(),next=l?.room||null;
  if(next!==current){current=next;choice.value='room';recent=-Infinity;}
  row.hidden=!next;
  const supported=eligible(l),joinedSide=side(l);
  privateOption.disabled=!supported||!joinedSide;
  actions.hidden=!supported||!joinedSide||!l?.room;
  if(!liveTransport(l)){
   note.textContent=l?.room?
    'Connection lost · team messages cannot be sent until this room reconnects. Your draft is preserved.':
    'Join an online room to send authenticated chat.';
  }else if(choice.value==='team'){
   note.textContent=supported&&joinedSide?
    (joinedSide===1?'RED':'BLUE')+' only · server-routed, no opponent/spectator delivery.':
    'Team membership changed or server unsupported. Send blocked until you select ROOM.';
  }else{
   note.textContent=supported?'Room = public. Choose TEAM to address your actual side.':
    'Public room chat. Private team chat requires an updated room server.';
  }
  const isTeam=choice.value==='team';
  choice.classList.toggle('private-channel',isTeam);
  input.placeholder=isTeam?'Team-only message · Enter to send':
   'Public room message · Enter to send';
  return supported&&joinedSide;
 }
 function audience(l){
  // Never silently expose an intended team message to the entire room.
  if(choice.value!=='team')return 'room';
  return eligible(l)&&!!side(l)?'team':null;
 }
 choice.addEventListener('change',sync);
 for(const phrase of phrases){
  const button=document.createElement('button');button.type='button';button.textContent=phrase;
  button.setAttribute('aria-label','Send private team chat: '+phrase);
  button.addEventListener('click',()=>{
   const l=link();
   if(!liveTransport(l)){
    status.textContent='Room connection is not open; no team call sent. Reconnect first.';
    sync();return;
   }
   if(!eligible(l)||!side(l)){status.textContent='Join a Red or Blue team first.';sync();return;}
   if(input.value.trim()){status.textContent='Finish your current chat draft first.';return;}
   if(Math.max(l.roomControl?.chatMuteUntil||0,l.chatMutedUntil||0)>FuckballRoomServerTime.now(l)){
    status.textContent='Your chat is muted by the host.';return;
   }
   const now=performance.now();
   if(now-recent<2500){status.textContent='Slow down: one team call every 2.5 seconds.';return;}
   choice.value='team';sync();
   if(audience(l)!=='team'){status.textContent='Team chat unavailable; nothing sent.';return;}
   if(typeof form.requestSubmit!=='function'){
    status.textContent='Native chat submission is unavailable; no call sent.';return;
   }
   input.value=phrase;
   try{
    form.requestSubmit();
    recent=now;
    status.textContent='Submitted on the open team channel · server moderation and delivery remain authoritative.';
   }catch{
    input.value='';
    status.textContent='Could not send team message.';
   }
  });
  actions.append(button);
 }
 actions.append(status);
 corner.append(actions);
 // The client channel selector must reflect changing rooms, teams and bans.
 // No periodic background traffic is emitted.
 window.FuckballTeamChat={sync,audience};
 sync();
})();
