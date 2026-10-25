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
 const FOCUS_KEY='fuckball.chat-focus.v1';
 const FOCUS_MODES={all:'All players',teammates:'My team only',opponents:'Opponents only',spectators:'Spectators only',quiet:'Quiet pitch'};
 function readFocus(){try{const saved=JSON.parse(localStorage.getItem(FOCUS_KEY)||'null');
  return saved?.version===1&&Object.hasOwn(FOCUS_MODES,saved.mode)?saved.mode:'all';
 }catch{return'all';}}
 let focus=readFocus();
 const focusControls=document.createElement('div');focusControls.className='native-chat-focus';
 const focusLabel=document.createElement('label');focusLabel.textContent='Incoming room messages';
 const focusSelect=document.createElement('select');focusSelect.setAttribute('aria-label','Incoming room chat filter');
 for(const [mode,label] of Object.entries(FOCUS_MODES))focusSelect.add(new Option(label,mode));
 focusSelect.value=focus;focusLabel.append(focusSelect);
 const focusNote=document.createElement('p');focusNote.className='native-chat-focus-note';
 focusNote.textContent='Filters hide incoming messages on this device only. They do not restrict who sees what you send, mute a server player or affect match events.';
 focusControls.append(focusLabel,focusNote);
 const status=document.createElement('p');status.className='native-chat-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const players=document.createElement('div');players.className='native-chat-players';
 panel.append(title,description,focusControls,status,players);settingsPane.append(panel);
 let roomId=null,muted=new Set();
 // Keep the real chat handler as the only sender. A form submitted while
 // the WebSocket is down must not be consumed as a fake successful local or
 // server message, or silently throw away the player's unsent text.
 const chatForm=document.getElementById('chatForm');
 const chatInput=document.getElementById('chatInput');
 const sendFeedback=document.createElement('p');
 sendFeedback.className='native-chat-send-feedback';
 sendFeedback.setAttribute('role','status');
 sendFeedback.setAttribute('aria-live','polite');
 sendFeedback.hidden=true;
 chatForm?.append(sendFeedback);
 let onlineDraftRoom=null,privateDraft=false;
 function preserveDraftAudience(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!onlineDraftRoom&&link?.room)onlineDraftRoom=link.room;
  // Never let a previously team-only draft silently turn public if the
  // native channel picker resets while a player reconnects or changes teams.
  if(link?.room&&window.FuckballTeamChat?.audience(link)==='team')
   privateDraft=true;
 }
 chatInput?.addEventListener('focus',()=>{
  preserveDraftAudience();sendFeedback.hidden=true;
 });
 chatInput?.addEventListener('input',()=>{
  preserveDraftAudience();sendFeedback.hidden=true;
 });
 chatForm?.addEventListener('change',()=>{
  if(chatInput?.value.trim())preserveDraftAudience();
 });
 chatForm?.addEventListener('focusout',event=>{
  if(chatForm.hidden&&!chatForm.contains(event.relatedTarget)){
   onlineDraftRoom=null;privateDraft=false;
  }
 });
 chatForm?.addEventListener('submit',event=>{
  const link=typeof serverLink!=='undefined'?serverLink:null;
  // Any pending native connection or stale online chat draft is not a local
  // chat session. The sender must consciously reconnect or leave the form.
  const wrongRoom=!!onlineDraftRoom&&!!link?.room&&link.room!==onlineDraftRoom;
  const blocked=link&&(!link.room||link.ws?.readyState!==1)||
    !!onlineDraftRoom&&!link?.room;
  const wrongAudience=privateDraft&&window.FuckballTeamChat?.audience(link)!=='team';
  const until=Math.max(link?.chatMutedUntil||0,link?.roomControl?.chatMuteUntil||0);
  if(!wrongRoom&&!blocked&&!wrongAudience&&!(link?.room&&until>Date.now()))return;
  event.preventDefault();event.stopImmediatePropagation();
  sendFeedback.textContent=wrongRoom?
   'This draft was written for another room. Close chat and start a new message before sending to these players.':
   blocked?'Room connection unavailable. Your draft is kept here; reconnect to the same room first.':
   wrongAudience?'This was a private team draft. Select a valid TEAM channel again before sending; it will not be posted publicly.':
   'The room host muted your chat. Your unsent draft is still here.';
  sendFeedback.hidden=false;
  chatInput?.focus({preventScroll:true});
 },true);
 // A connected human room stays active while Home/My Games is on screen.
 // The HUD chat log lives on the hidden pitch; keep a bounded ephemeral
 // catch-up inbox on this device, without sending or saving chat messages.
 let unread=0,expanded=false;
 const recentChat=[];
 const chatDock=document.createElement('section');
 chatDock.className='native-room-chat-inbox';chatDock.hidden=true;
 chatDock.setAttribute('aria-label','Current human room chat');
 const chatDockSummary=document.createElement('button');
 chatDockSummary.type='button';chatDockSummary.className='native-room-chat-inbox-toggle';
 chatDockSummary.setAttribute('aria-expanded','false');
 const chatDockPanel=document.createElement('div');
 chatDockPanel.className='native-room-chat-inbox-panel';chatDockPanel.hidden=true;
 const chatDockHead=document.createElement('strong');
 chatDockHead.textContent='ROOM CHAT · THIS SESSION';
 const chatDockHelp=document.createElement('p');
 chatDockHelp.className='native-room-chat-inbox-help';
 chatDockHelp.textContent='Messages visible to you from this room. Kept only in memory, never stored or sent by this inbox.';
 const chatDockMessages=document.createElement('ol');
 chatDockMessages.className='native-room-chat-inbox-messages';
 chatDockMessages.setAttribute('aria-label','Recent messages from this connected room');
 const chatDockActions=document.createElement('div');
 chatDockActions.className='native-room-chat-inbox-actions';
 const chatDockView=document.createElement('button');
 chatDockView.type='button';chatDockView.textContent='↗ View match chat';
 const chatDockClose=document.createElement('button');
 chatDockClose.type='button';chatDockClose.textContent='Close';
 chatDockActions.append(chatDockView,chatDockClose);
 chatDockPanel.append(chatDockHead,chatDockHelp,chatDockMessages,chatDockActions);
 chatDock.append(chatDockSummary,chatDockPanel);document.body.append(chatDock);
 function renderInboxMessages(){
  chatDockMessages.replaceChildren();
  const displayed=recentChat.filter(entry=>!muted.has(entry.from)&&
   visibleMessage(entry.from));
  if(!displayed.length){
   const empty=document.createElement('li');
   empty.textContent='No visible room messages yet.';
   chatDockMessages.append(empty);return;
  }
  for(const entry of displayed){
   const item=document.createElement('li');
   const label=document.createElement('strong');
   label.textContent=(entry.channel==='team'?'TEAM · ':'ROOM · ')+entry.name;
   const content=document.createElement('span');content.textContent=entry.text;
   item.append(label,content);chatDockMessages.append(item);
  }
  chatDockMessages.scrollTop=chatDockMessages.scrollHeight;
 }
 function updateRoomChatInbox(){
  const connected=currentRoom();
  const match=document.getElementById('matchView');
  const onPitch=match?.hidden===false&&document.hidden!==true;
  // Authoritative ready/rematch/recovery decisions take priority over chat.
  const urgent=document.querySelector('.quick-ready-dock:not([hidden]),.native-rematch-dock:not([hidden]),.native-room-recovery:not([hidden])');
  if(onPitch){unread=0;expanded=false;}
  chatDock.hidden=!connected||onPitch||!!urgent;
  chatDockPanel.hidden=!expanded||chatDock.hidden;
  chatDockSummary.textContent=unread?
   '● '+unread+(unread===99?'+':'')+' unread room message'+(unread===1?'':'s')+
   ' · '+(expanded?'Hide':'Read'):
   '◌ Room chat · '+(expanded?'Hide':'Read recent');
  chatDockSummary.setAttribute('aria-expanded',String(!chatDockPanel.hidden));
 }
 chatDockSummary.addEventListener('click',()=>{
  if(!currentRoom()||chatDock.hidden)return;
  expanded=!expanded;
  if(expanded){unread=0;renderInboxMessages();}
  updateRoomChatInbox();
 });
 chatDockClose.addEventListener('click',()=>{
  expanded=false;updateRoomChatInbox();chatDockSummary.focus?.();
 });
 chatDockView.addEventListener('click',()=>{
  if(!currentRoom())return;
  const go=document.getElementById('tabPlay');
  go?.click();
  if(document.getElementById('matchView')?.hidden===false){
   unread=0;expanded=false;
   const original=document.getElementById('chatLog');
   if(original){original.tabIndex=-1;original.focus?.({preventScroll:true});original.scrollTop=original.scrollHeight;}
   updateRoomChatInbox();
  }
 });
 const inboxTicker=setInterval(updateRoomChatInbox,1400);
 inboxTicker?.unref?.();
 for(const id of ['tabHome','tabPlay','tabReplay'])
  document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(updateRoomChatInbox));
 window.addEventListener('focus',updateRoomChatInbox);
 window.addEventListener('fuckball:native-session-state',updateRoomChatInbox);
 document.addEventListener('visibilitychange',updateRoomChatInbox);
 focusSelect.addEventListener('change',()=>{
  if(!Object.hasOwn(FOCUS_MODES,focusSelect.value))return;
  focus=focusSelect.value;
  try{localStorage.setItem(FOCUS_KEY,JSON.stringify({version:1,mode:focus}));}catch{}
  // Changing what this device may display also clears the temporary catch-up
  // copy, so previously received content never bypasses a new quiet filter.
  recentChat.length=0;unread=0;expanded=false;updateRoomChatInbox();
  rows();
 });
 function visibleMessage(sender){
  if(focus==='quiet')return false;
  if(focus==='all')return true;
  const people=room?.state?.players;
  const benches=serverLink?.roomState?.benches;
  const teamFor=id=>{
   const player=people?.find?.(p=>p?.id===id);
   const native=typeof player?.team==='number'?player.team:player?.team?.id;
   if(native===1||native===2)return native;
   if(native!==0)return null;
   const bench=Array.isArray(benches)?benches.find(x=>
    Array.isArray(x)&&x[0]===id&&[1,2].includes(x[1])):null;
   return bench?.[1]||0;
  };
  const theirs=teamFor(sender),ours=teamFor(networkPlayerId);
  if(![0,1,2].includes(theirs))return false;
  if(focus==='spectators')return theirs===0;
  if(![1,2].includes(ours)||![1,2].includes(theirs))return false;
  return focus==='teammates'?theirs===ours:focus==='opponents'&&theirs!==ours;
 }
 window.setRoomChatFocus=mode=>{
  if(!Object.hasOwn(FOCUS_MODES,mode))return false;
  focusSelect.value=mode;focusSelect.dispatchEvent(new Event('change'));return true;
 };
 function currentRoom(){
  const next=serverLink?.room||null;
  if(next!==roomId){
   roomId=next;muted.clear();recentChat.length=0;unread=0;expanded=false;
  }
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
  const until=serverLink?.roomControl?.chatMuteUntil||serverLink?.chatMutedUntil||0;
  status.textContent=until>Date.now()?
   'Your chat is muted by this room’s host until '+new Date(until).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'. You can still play and read chat.':
   candidates.length?muted.size+' player(s) muted in this room · showing: '+FOCUS_MODES[focus]+'.':
   'Incoming filter: '+FOCUS_MODES[focus]+'. Other players appear after joining.';
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
    recentChat.length=0;unread=0;expanded=false;updateRoomChatInbox();
    rows();
   };
   row.append(name,button);
   if(settings?.account?.token){
    const report=document.createElement('button');report.type='button';
    report.className='native-chat-report';report.textContent='Report…';
    report.setAttribute('aria-label','Open private report form for '+name.textContent);
    report.onclick=()=>{
     if(!serverLink?.room||serverLink.room!==current||
       !room?.state?.players?.some?.(p=>p.id===player.id&&!botIds.has(player.id))){
      status.textContent='Player left; reopen the room roster.';return;
     }
     if(typeof openMatchMenu!=='function')return;
     openMatchMenu('menuMatchPane','menuMatch');
     window.renderPlayerReportPanel?.();
     const form=document.querySelector('#menuMatchPane .player-report-panel');
     const select=form?.querySelector('select[aria-label="Player to report"]');
     if(select&&[...select.options].some(x=>x.value===String(player.id))){
      select.value=String(player.id);
      form.querySelector('textarea')?.focus();
     }else status.textContent='Player no longer reportable in this room.';
    };
    row.append(report);
   }
   players.append(row);
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
  if(muted.has(message.from)||!visibleMessage(message.from))return;
  let channel=null;
  if(message.channel==='team'){
   if(![1,2].includes(message.team))return;
   log('[TEAM · '+(message.team===1?'RED':'BLUE')+'] '+message.name+': '+message.text,false);
   document.querySelector('#chatLog .chat-line:last-child')?.classList.add('native-team-message');
   channel='team';
  }else if(message.channel===undefined||message.channel==='room'){
   log(message.name+': '+message.text,false);
   channel='room';
  }
  if(channel){
   recentChat.push({from:message.from,channel,name:message.name,text:message.text});
   if(recentChat.length>20)recentChat.shift();
   const match=document.getElementById('matchView');
   if(message.from!==networkPlayerId&&(match?.hidden!==false||document.hidden===true)&&!expanded)
    unread=Math.min(99,unread+1);
   if(expanded)renderInboxMessages();
   updateRoomChatInbox();
  }
 };

 // Tactical callouts use the EXISTING authenticated room chat submit path.
 // No new message type, server authority, background sending or player automation.
 const corner=document.getElementById('hudCorner'),form=document.getElementById('chatForm');
 const match=document.getElementById('matchView');
 const input=document.getElementById('chatInput');
 if(corner&&form&&input){
  const KEY='fuckball.tactical-callouts.v1';
  const defaults=['Pass!', 'Switch sides!', 'Mark left!', 'Mark right!'];
  const fixed=['I am open!', 'Defend!', 'Nice play!', 'Good game!'];
  function clean(value){
   if(typeof value!=='string'||value.length>48||!value.trim()||
     /^\//.test(value.trim())||/[\u0000-\u001f\u007f-\u009f]/.test(value))
    throw Error('Use 1–48 plain characters, not a slash command.');
   return value.trim();
  }
  let chosen=[...defaults];
  try{
   const parsed=JSON.parse(localStorage.getItem(KEY)||'null');
   if(parsed?.version===1&&Array.isArray(parsed.calls)&&parsed.calls.length===4)
    chosen=parsed.calls.map(clean);
  }catch{}
  const focusToggle=document.createElement('button');focusToggle.type='button';
  focusToggle.className='native-chat-quick-focus';
  focusToggle.setAttribute('aria-label','Toggle quiet incoming room chat');
  function renderFocusToggle(){
   focusToggle.textContent=focus==='quiet'?'◌ INCOMING CHAT HIDDEN':'◌ HIDE INCOMING CHAT';
   focusToggle.setAttribute('aria-pressed',String(focus==='quiet'));
  }
  focusToggle.onclick=()=>window.setRoomChatFocus(focus==='quiet'?'all':'quiet');
  focusSelect.addEventListener('change',renderFocusToggle);
  focusSelect.addEventListener('changeFromOtherTab',renderFocusToggle);
  renderFocusToggle();
  const toolbar=document.createElement('div');toolbar.className='tactical-callouts';
  toolbar.hidden=true;
  const toggle=document.createElement('button');toggle.type='button';
  toggle.className='tactical-callouts-toggle';toggle.textContent='⚑ CHAT CALLS';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Show team chat callouts');
  const tray=document.createElement('div');tray.className='tactical-callouts-tray';tray.hidden=true;
  tray.setAttribute('role','group');tray.setAttribute('aria-label','Send a quick room chat message');
  const notice=document.createElement('p');notice.className='tactical-callouts-notice';
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const customButtons=[];
  const now=()=>performance.now();
  let lastSent=-Infinity,expanded=false;
  function updateVisibility(){
   const available=!!serverLink?.room&&serverLink.ws?.readyState===1&&
    !match.hidden&&!replay&&!document.hidden;
   toolbar.hidden=!available;
   if(!available&&expanded){expanded=false;tray.hidden=true;toggle.setAttribute('aria-expanded','false');}
   return available;
  }
  function sendCall(text){
   if(!updateVisibility()||!serverLink?.room||serverLink.ws?.readyState!==1){
    notice.textContent='Room connection unavailable. Reconnect before sending a call.';
    return;
   }
   if(now()-lastSent<2500){notice.textContent='One callout every 2.5 seconds. Keep chat useful.';return;}
   if(input.value.trim()){
    notice.textContent='Finish your current chat draft first; it was not replaced.';
    return;
   }
   const mutedUntil=Math.max(serverLink?.roomControl?.chatMuteUntil||0,serverLink?.chatMutedUntil||0);
   if(mutedUntil>Date.now()){
    notice.textContent='Room chat is muted by the host right now.';return;
   }
   const audience=window.FuckballTeamChat?.audience(serverLink);
   if(audience===null){notice.textContent='Team chat unavailable; message not sent.';return;}
   if(typeof form.requestSubmit!=='function'||typeof form.onsubmit!=='function'){
    notice.textContent='Native chat is not ready; nothing was sent.';return;
   }
   // The installed native chat handler preserves server moderation/rate limits,
   // sender attribution and real acknowledgement; never log a fake send.
   input.value=text;
   try{
    form.requestSubmit();
    lastSent=now();
    notice.textContent='Submitted via open '+(audience==='team'?'team-only':'room')+
     ' chat · server controls delivery and moderation.';
   }catch{
    input.value='';
    notice.textContent='Could not open room chat.';
   }
  }
  function addCall(text,container){
   const button=document.createElement('button');button.type='button';
   button.textContent=text;button.setAttribute('aria-label','Send room chat: '+text);
   button.addEventListener('click',()=>sendCall(button.textContent));
   container.append(button);return button;
  }
  const favorites=document.createElement('div');favorites.className='tactical-callouts-favorites';
  for(const value of chosen)customButtons.push(addCall(value,favorites));
  const standard=document.createElement('div');standard.className='tactical-callouts-defaults';
  for(const value of fixed)addCall(value,standard);
  tray.append(favorites,standard,notice);toolbar.append(toggle,focusToggle,tray);corner.append(toolbar);
  toggle.addEventListener('click',()=>{
   if(!updateVisibility())return;
   expanded=!expanded;tray.hidden=!expanded;
   toggle.setAttribute('aria-expanded',String(expanded));
   if(expanded){notice.textContent='Tap to send using the selected ROOM or TEAM chat channel.';customButtons[0]?.focus();}
  });
  const editor=document.createElement('section');editor.className='tactical-callouts-editor';
  const editorTitle=document.createElement('h3');editorTitle.textContent='CHAT CALLOUTS.';
  const editorHelp=document.createElement('p');
  editorHelp.textContent='Set four one-tap phrases for team communication. A tap sends through ordinary authenticated room chat; no automation or extra chat rights. Your phrases stay on this device.';
  const fields=document.createElement('div');fields.className='tactical-callouts-fields';
  const editors=[];
  for(let i=0;i<4;i++){
   const label=document.createElement('label');label.textContent='Shortcut '+(i+1);
   const edit=document.createElement('input');edit.type='text';edit.maxLength=48;
   edit.value=chosen[i];edit.setAttribute('aria-label','Quick chat shortcut '+(i+1));
   label.append(edit);fields.append(label);editors.push(edit);
  }
  const buttons=document.createElement('div');buttons.className='tactical-callouts-editor-actions';
  const save=document.createElement('button');save.type='button';save.textContent='Save phrases';
  const reset=document.createElement('button');reset.type='button';reset.textContent='Reset phrases';
  const editorStatus=document.createElement('p');editorStatus.setAttribute('role','status');

  // Optional role templates and portable local phrase sets. No automatic chat.
  const ROLE_CALLS={
   general:defaults,
   goalkeeper:['Keeper ready!','Mark the far post!','Clear the ball!','I have goal!'],
   defender:['Hold our shape!','Cover my position!','Pass back if pressed!','Switch the wing!'],
   playmaker:['I am open!','One-two pass!','Make the run!','Play to the wing!'],
   striker:['Pass into space!','Cross to me!','I can shoot!','Follow the rebound!']
  };
  const pack=document.createElement('section');pack.className='tactical-callouts-role-packs';
  const heading=document.createElement('strong');heading.textContent='POSITION CALL PACKS · GK / DM / AM / ST';
  const message=document.createElement('p');
  message.textContent='Choose four editable quick-chat phrases. Loading a preset or file never sends a message or changes your actual team role.';
  const roles=document.createElement('select');roles.setAttribute('aria-label','Position quick chat presets');
  for(const [id,label] of [['general','General'],['goalkeeper','GK · Goalkeeper'],
   ['defender','DM · Defensive midfielder'],['playmaker','AM · Playmaker'],
   ['striker','ST · Striker']])roles.add(new Option(label,id));
  const apply=document.createElement('button');apply.type='button';apply.textContent='Use this position pack';
  const portable=document.createElement('div');portable.className='tactical-callouts-portable';
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Export phrases';
  const importButton=document.createElement('button');importButton.type='button';importButton.textContent='↑ Restore phrases';
  const inputFile=document.createElement('input');inputFile.type='file';inputFile.accept='.json,application/json';inputFile.hidden=true;
  portable.append(exportButton,importButton,inputFile);
  pack.append(heading,message,roles,apply,portable);
  function applyValues(values){
   for(let i=0;i<4;i++)editors[i].value=values[i];
   save.onclick(); // Route through the existing validated, device-local Save action.
   chosen.forEach((value,i)=>customButtons[i].setAttribute('aria-label','Send room chat: '+value));
  }
  apply.onclick=()=>{
   const phrases=ROLE_CALLS[roles.value];if(!phrases)return;
   if(!window.confirm('Replace your four private phrases with '+roles.selectedOptions[0].textContent+
    '? This sends no message.'))return;
   applyValues(phrases.map(clean));
  };
  exportButton.onclick=()=>{
   const data=JSON.stringify({format:'fuckball-private-room-callouts',version:1,calls:chosen});
   const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='fuckball-private-team-calls.json';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   editorStatus.textContent='Current saved phrases downloaded locally; no chat sent.';
  };
  importButton.onclick=()=>inputFile.click();
  inputFile.onchange=async()=>{
   const file=inputFile.files?.[0];inputFile.value='';
   if(!file)return;
   if(file.size<1||file.size>4096)return void(editorStatus.textContent='Choose a callout JSON backup smaller than 4 KiB.');
   let before;try{before=localStorage.getItem(KEY);}catch{before=null;}
   try{
    const incoming=JSON.parse(await file.text());
    if(!incoming||incoming.format!=='fuckball-private-room-callouts'||incoming.version!==1||
      !Array.isArray(incoming.calls)||incoming.calls.length!==4)
     throw Error('Not a valid private four-callout file');
    const phrases=incoming.calls.map(clean);
    let latest;try{latest=localStorage.getItem(KEY);}catch{latest=null;}
    if(before!==latest)throw Error('Another tab changed saved phrases. Reopen the file to retry');
    if(!window.confirm('Replace your four saved phrases with this file? No chat will be sent.'))return;
    applyValues(phrases);
   }catch(error){editorStatus.textContent='Could not restore your phrases: '+String(error.message||'Invalid backup');}
  };

  buttons.append(save,reset);
  save.onclick=()=>{
   let values;
   try{values=editors.map(edit=>clean(edit.value));}
   catch(error){editorStatus.textContent=error.message;return;}
   chosen=values;chosen.forEach((value,i)=>customButtons[i].textContent=value);
   try{localStorage.setItem(KEY,JSON.stringify({version:1,calls:chosen}));
    editorStatus.textContent='Saved on this device.';}
   catch{editorStatus.textContent='Applied for this visit; device storage unavailable.';}
  };
  reset.onclick=()=>{
   if(!window.confirm('Restore the four default team callouts?'))return;
   chosen=[...defaults];chosen.forEach((value,i)=>{editors[i].value=value;customButtons[i].textContent=value;});
   try{localStorage.removeItem(KEY);}catch{}
   editorStatus.textContent='Default phrases restored.';
  };
  editor.append(editorTitle,editorHelp,fields,pack,buttons,editorStatus);settingsPane.append(editor);
  window.setInterval(updateVisibility,800);
  document.addEventListener('visibilitychange',updateVisibility);
  updateVisibility();
 }

 window.addEventListener('storage',event=>{
  if(event.key===FOCUS_KEY||event.key===null){
   focus=readFocus();focusSelect.value=focus;
   rows();focusSelect.dispatchEvent(new Event('changeFromOtherTab'));
  }
 });
 document.getElementById('menuVideo')?.addEventListener('click',rows);
 rows();
})();
