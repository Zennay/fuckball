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
 let editBaseline=messages.slice();
 const identical=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
 const unsaved=()=>inputs.some((x,i)=>x.value!==editBaseline[i]);
 function showConflict(){
  conflictNotice.hidden=false;conflictActions.hidden=false;
  status.textContent='Unsaved local edits protected. Loading or overwriting another tab’s changes requires an explicit choice; no chat was sent.';
 }
 function hideConflict(){conflictNotice.hidden=true;conflictActions.hidden=true;}
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
 for(let i=0;i<6;i++){
  const label=make('label','Quick call '+(i+1)),input=make('input');
  input.type='text';input.maxLength=MAX;input.autocomplete='off';
  input.setAttribute('aria-label','Quick call message '+(i+1));inputs.push(input);
  label.append(input);form.append(label);
 }
 const save=make('button','Save these six phrases'),reset=make('button','Restore defaults');
 save.type=reset.type='button';
 const tools=make('div',null,'match-quick-calls-tools');
 tools.append(save,reset);
 const conflictNotice=make('p','Another tab saved different quick calls. Your unsaved edits are still here. Choose which version to keep.','match-quick-calls-conflict');
 conflictNotice.setAttribute('role','alert');conflictNotice.hidden=true;
 const conflictActions=make('div',null,'match-quick-calls-conflict-actions');
 const loadOther=make('button','Load other tab’s saved calls');
 const saveAnyway=make('button','Save my edits instead');
 loadOther.type=saveAnyway.type='button';
 conflictActions.append(loadOther,saveAnyway);conflictActions.hidden=true;
 editor.append(form,tools,conflictNotice,conflictActions);
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
  inputs.forEach((input,i)=>{input.value=messages[i];});
  editBaseline=messages.slice();hideConflict();
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
 function drawOptions(preserveEditor=false){
  options.replaceChildren();
  for(const [i,msg] of messages.entries()){
   const button=make('button',null,'match-quick-calls-message');
   button.type='button';
   button.append(make('span',String(i+1).padStart(2,'0')),make('strong',msg));
   button.onclick=()=>send(i);
   options.append(button);
  }
  if(!preserveEditor)showEditor();
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
   state.link.send({type:'chat',text:messages[i]});sent.push(now);
   status.textContent='Submitted to native room chat: "'+messages[i]+'". Actual delivery depends on server moderation.';
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
 // An external save can arrive while the player is typing in the six
 // local editor fields. Never discard a partially typed human draft and never
 // silently overwrite another tab's confirmed values with stale inputs.
 for(const input of inputs)input.addEventListener('input',()=>{
  if(!opened)return;
  if(unsaved()){
   status.textContent='Unsaved edits in this tab. Room messages still use the visible saved presets until you explicitly save.';
  }else if(conflictNotice.hidden){
   status.textContent='No unsaved preset changes. Nothing has been sent.';
  }
 });
 function persistEdits(overwrite=false){
  if(!opened)return;
  const next=inputs.map(x=>x.value);
  if(!next.every(valid)){
   status.textContent='Use six printable phrases, each 2–80 characters, without control characters.';
   return;
  }
  const stored=read();
  if(!overwrite&&!identical(stored,editBaseline)){
   // This also catches changes missed while this tab was suspended and no
   // storage event reached it. Keep the typed inputs and ask for a choice.
   messages=stored;drawOptions(true);showConflict();update();return;
  }
  messages=next.slice();drawOptions();
  try{
   localStorage.setItem(KEY,JSON.stringify({version:1,messages}));
   status.textContent=overwrite?
    'Your explicit choice replaced the other tab’s saved presets on this device. No chat was sent.':
    'Phrases saved only on this device. Nothing was sent.';
  }catch{
   status.textContent='Browser storage unavailable. Phrases updated in this tab only; other tabs are unchanged.';
  }
  update();
 }
 save.onclick=()=>persistEdits(false);
 saveAnyway.onclick=()=>persistEdits(true);
 loadOther.onclick=()=>{
  // This deliberately discards this tab's unsaved editor fields; the external
  // version is re-read at click time, never copied from an obsolete event.
  messages=read();drawOptions();
  status.textContent='Loaded the most recently saved presets from this device. Your prior unsaved edits were not sent.';
  update();
 };
 reset.onclick=()=>{
  // Restore defaults is already an explicit destructive preference action.
  // It never sends chat or touches a match/server session.
  messages=DEFAULTS.slice();drawOptions();
  try{localStorage.removeItem(KEY);}
  catch{status.textContent='Storage unavailable. Defaults apply in this tab only.';update();return;}
  status.textContent='Default phrases restored on this device. No messages were sent.';
  update();
 };
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  const keepEditor=opened&&unsaved();
  messages=read();
  if(opened){
   drawOptions(keepEditor);
   if(keepEditor){
    if(!identical(messages,editBaseline))showConflict();
    else status.textContent='Your unsaved edits are preserved. Other-tab presets match your editing baseline.';
   }else status.textContent='Saved quick-call presets updated from another tab. Nothing was sent.';
   update();
  }
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