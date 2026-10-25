'use strict';
// Player-initiated preset chat through the EXISTING moderated native room.
// Not team-private: all connected room participants may receive these calls.
(function(){
 const match=document.getElementById('matchView');
 const quick=match?.querySelector('#fbQuickActions .in-game-quick-grid');
 const quickSheet=match?.querySelector('#fbQuickActions');
 if(!match||!quick||!quickSheet)return;
 const KEY='fuckball.quick-calls.v1',MAX=80;
 const DEFAULTS=[
  'I am open for a pass!',
  'Cover the middle!',
  'Rotate back!',
  'Hold our shape!',
  'I will defend!',
  'Great play!'
 ];
 const make=(tag,label,cls)=>{const e=document.createElement(tag);
  if(label!==undefined&&label!==null)e.textContent=String(label);
  if(cls)e.className=cls;return e;};
 const valid=v=>typeof v==='string'&&v.trim()===v&&v.length>=2&&v.length<=MAX&&
  !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/u.test(v);
 const verified=x=>x&&x.version===1&&Array.isArray(x.messages)&&
  x.messages.length===6&&x.messages.every(valid);
 function read(){
  try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return verified(x)?x.messages.slice():DEFAULTS.slice();}
  catch{return DEFAULTS.slice();}
 }
 // A room code is not a connection identity: a quick rejoin can reuse the
 // same code with a different socket/permissions. Never carry an open public
 // chat picker or its send action into another session.
 let messages=read(),sent=[],lastSession=null,openedSession=null;
 const launch=make('button',null,'in-game-quick-action match-quick-call-open');launch.type='button';
 launch.append(make('strong','✦ QUICK CALLS'),make('span','Send one preset line to everyone in this actual online room'));
 launch.setAttribute('aria-label','Open room-wide quick chat calls');
 quick.append(launch);
 const panel=make('section',null,'match-quick-calls');
 panel.setAttribute('aria-label','Send native room-wide chat calls');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.hidden=true;
 const heading=make('header',null,'match-quick-calls-head');
 const title=make('div');
 title.append(make('span','HUMAN MATCH COMMUNICATION','match-quick-calls-eyebrow'),
  make('h2','QUICK CALLS.'));
 const close=make('button','✕');close.type='button';close.setAttribute('aria-label','Close quick calls');
 heading.append(title,close);
 const intro=make('p','Each click sends one real message using this server’s existing public room chat. Opponents and spectators can also see it. Your incoming chat filter does NOT make outgoing calls private; server mute and rate limits still apply.');
 const destination=make('p',null,'match-quick-calls-destination');
 destination.setAttribute('role','status');
 const options=make('div',null,'match-quick-calls-options');
 const status=make('p','Select one message to send.','match-quick-calls-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const editor=make('details',null,'match-quick-calls-editor');
 editor.append(make('summary','Customize six local phrases · no auto-send'));
 const form=make('div',null,'match-quick-calls-fields');
 const inputs=[];
 // A concurrent browser tab can save new phrases while the player is
 // drafting another set. Preserve the human's uncommitted editor values.
 let editing=false,externalRevision=false;
 for(let i=0;i<6;i++){
  const label=make('label','Quick call '+(i+1)),input=make('input');
  input.type='text';input.maxLength=MAX;input.autocomplete='off';
  input.setAttribute('aria-label','Quick call message '+(i+1));inputs.push(input);
  input.addEventListener('input',()=>{
   editing=inputs.some((field,j)=>field.value!==messages[j]);
  });
  label.append(input);form.append(label);
 }
 const save=make('button','Save these six phrases'),reset=make('button','Restore defaults');
 save.type=reset.type='button';
 const tools=make('div',null,'match-quick-calls-tools');
 tools.append(save,reset);editor.append(form,tools);
 panel.append(heading,intro,destination,options,status,editor);
 match.append(panel);
 // Live movement, held kick, touch, P2 and controller input must never leak
 // underneath a public-chat picker. The shared native surface gate already
 // protects all seats; Quick Calls must own it for its entire open lifetime.
 let opened=false;
 window.fuckballQuickCallsOpen=false;
 function actualRoom(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  return link?.room&&link.ws?.readyState===1?link:null;
 }
 function usable(requireOriginal=true){
  const link=actualRoom();
  if(!link||match.hidden||document.hidden||
     document.getElementById('pauseMenu')?.hidden===false||
     document.querySelector('dialog[open]'))return null;
  // Only the session on which a person deliberately opened the picker may
  // receive its message. This is independently checked on every send, not
  // just by the 1.2-second presentation refresh.
  if(requireOriginal&&(!opened||panel.hidden||openedSession!==link))return null;
  const until=Math.max(link.chatMutedUntil||0,link.roomControl?.chatMuteUntil||0);
  return{link,until};
 }
 function showEditor(){
  // Rerendering the menu during an active edit must never discard inputs.
  if(editor.open&&editing)return;
  inputs.forEach((input,i)=>{input.value=messages[i];});
  editing=false;
 }
 function closePanel(focus=true){
  if(!opened)return;
  opened=false;openedSession=null;panel.hidden=true;
  window.fuckballQuickCallsOpen=false;
  // Quick Actions may have opened through a user-initiated panel switch:
  // never clear the other panel's active input ownership.
  window.fuckballQuickActionsOpen=!quickSheet.hidden;
  if(typeof releaseInputs==='function')releaseInputs();
  if(focus&&!launch.hidden&&match.hidden===false)launch.focus({preventScroll:true});
 }
 window.fuckballCloseQuickCalls=closePanel;
 function drawOptions(){
  options.replaceChildren();
  for(const [i,msg] of messages.entries()){
   const button=make('button',null,'match-quick-calls-message');
   button.type='button';
   button.append(make('span',String(i+1).padStart(2,'0')),make('strong',msg));
   button.onclick=()=>send(i);
   options.append(button);
  }
  showEditor();
 }
 function update(){
  const link=actualRoom();
  launch.hidden=!link||match.hidden||document.hidden;
  if(lastSession!==link){
   // Real native disconnect, reconnect, or a different room is a new
   // messaging audience even when the eight-character room code matches.
   lastSession=link;sent=[];
   if(opened)closePanel(false);
  }
  if(opened&&(openedSession!==link||match.hidden||document.hidden||
     document.getElementById('pauseMenu')?.hidden===false||
     !!document.querySelector('dialog[open]')))
   closePanel(false);
  if(!opened)return;
  const state=usable(),until=state?.until||0;
  const now=Date.now();
  sent=sent.filter(t=>now-t<10000);
  const wait=sent.length>=3||sent.length>0&&now-sent[sent.length-1]<3000;
  options.querySelectorAll('button').forEach(b=>{b.disabled=!state||until>now||wait;});
  if(!state)status.textContent='Join a real online room before sending calls.';
  else if(until>now)status.textContent='Your chat is currently muted by the server. Quick Calls cannot bypass it.';
 }
 function send(i){
  const state=usable();if(!state||!valid(messages[i])){status.textContent='No active native room chat is available.';return;}
  const now=Date.now();
  if(state.until>now){status.textContent='Room host muted your chat. No call sent.';update();return;}
  sent=sent.filter(t=>now-t<10000);
  if(sent.length>=3||sent.length&&now-sent[sent.length-1]<3000){
   status.textContent='Quick Calls cooldown. Wait before sending another message.';update();return;
  }
  // Actual moderation, bans, server rate limits and transport identity
  // remain authoritative. The client does not claim the room delivered it.
  try{
   // Native send silently ignores packets whenever WebSocket is not OPEN.
   // Check the original admitted socket again at the moment of submission;
   // do not charge the human a cooldown or report a send that never happened.
   const link=state.link;
   if(serverLink!==link||openedSession!==link||link.ws?.readyState!==1){
    status.textContent='Connection changed. No call was submitted; rejoin the room to retry.';
    update();return;
   }
   link.send({type:'chat',text:messages[i]});
   // Delivery is still subject to the actual server's moderation/receipt;
   // an OPEN transport only proves a submission attempt, not delivery.
   sent.push(now);
   status.textContent='Attempted via this room’s connected chat: "'+messages[i]+'". Delivery is not yet confirmed by the server.';
  }catch{status.textContent='The game server could not accept this call.';}
  update();
 }
 launch.onclick=()=>{
  const state=usable(false);
  if(!state||opened||document.getElementById('pauseMenu')?.hidden===false||
     document.querySelector('dialog[open]'))return;
  const nativeClose=quickSheet.querySelector('.in-game-quick-heading button');
  if(nativeClose)nativeClose.click();
  // Close the originating sheet BEFORE acquiring the new input lease, so
  // its teardown cannot re-enable movement while a chat option is focused.
  window.fuckballQuickCallsOpen=true;
  window.fuckballQuickActionsOpen=true;
  if(typeof releaseInputs==='function')releaseInputs();
  openedSession=state.link;lastSession=state.link;
  opened=true;panel.hidden=false;
  destination.textContent='Sending to this connected public room only · '+
   state.link.room+' · opponents and spectators can see every message.';
  drawOptions();update();
  close.focus({preventScroll:true});
 };
 close.onclick=()=>closePanel();
 // An outside tap dismisses the picker. Consume the first pointer event
 // on the pitch so closing a chat sheet cannot itself kick/move the human.
 document.addEventListener('pointerdown',event=>{
  if(!opened||panel.contains(event.target))return;
  // Consume only genuine human gameplay pointer surfaces. Toolbar/menu
  // buttons may still open their original controls with one intentional tap.
  if(event.target.closest?.('#gameCanvas,#joystick,#touchKick')){
   event.preventDefault();
   event.stopPropagation();
  }
  closePanel(false);
 },true);
 // Keyboard focus can move elsewhere while the non-modal picker remains
 // open. Escape always dismisses this picker first, not a background match.
 window.addEventListener('keydown',event=>{
  if(!opened||event.key!=='Escape')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closePanel();
 },true);
 // Match menus and native dialogs take precedence as soon as they open,
 // rather than leaving a Quick Calls input lease active until the next poll.
 if(typeof MutationObserver==='function'){
  const nativeOverlayWatch=new MutationObserver(update);
  const menu=document.getElementById('pauseMenu');
  if(menu)nativeOverlayWatch.observe(menu,{attributes:true,attributeFilter:['hidden']});
  nativeOverlayWatch.observe(match,{attributes:true,attributeFilter:['hidden']});
  for(const dialog of document.querySelectorAll('dialog'))
   nativeOverlayWatch.observe(dialog,{attributes:true,attributeFilter:['open']});
 }
 save.onclick=()=>{
  const next=inputs.map(x=>x.value);
  if(!next.every(valid)){status.textContent='Use six unique or repeated printable lines, each 2–80 characters, without control characters.';return;}
  messages=next.slice();editing=false;externalRevision=false;drawOptions();
  try{localStorage.setItem(KEY,JSON.stringify({version:1,messages}));status.textContent='Six phrases saved on this device. Nothing was sent.';}
  catch{status.textContent='Browser storage unavailable. Phrases updated in this tab only.';}
  update();
 };
 reset.onclick=()=>{
  messages=DEFAULTS.slice();editing=false;externalRevision=false;drawOptions();
  try{localStorage.removeItem(KEY);}catch{}
  status.textContent='Default phrases restored on this device. No messages were sent.';
  update();
 };
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  if(editor.open&&editing){
   // Do not replace six unsaved human entries with another tab's saved
   // phrases. The player explicitly chooses Save (overwrite) or Restore.
   externalRevision=true;
   if(opened)status.textContent='Another tab changed saved phrases. Your unsaved edits are preserved; Save to replace the saved version, or Restore defaults.';
   return;
  }
  messages=read();editing=false;externalRevision=false;
  if(opened){drawOptions();status.textContent='Saved phrases updated from another tab. Nothing was sent.';update();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&opened)closePanel(false);else update();});
 window.addEventListener('blur',()=>{if(opened)closePanel(false);});
 // Native disconnect/admission immediately closes the old sender rather
 // than waiting for the polling interval. The original room server owns the
 // event; neither a new channel nor chat request is created here.
 window.addEventListener('fuckball:native-session-state',update);
 // Home and Play are present in both the full app and headless native
 // browser contract. My Games transitions are guarded by usable() on send
 // and the existing UI refresh, without assuming an optional tab element.
 for(const id of ['tabHome','tabPlay']){
  const tab=document.getElementById(id);
  tab?.addEventListener('click',()=>queueMicrotask(update));
 }
 const poll=setInterval(update,1200);poll?.unref?.();
 update();
})();