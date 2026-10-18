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
  const until=serverLink?.roomControl?.chatMuteUntil||serverLink?.chatMutedUntil||0;
  status.textContent=until>Date.now()?
   'Your chat is muted by this room’s host until '+new Date(until).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'. You can still play and read chat.':
   candidates.length?muted.size+' players hidden on this device · changes are temporary.':
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
  const toolbar=document.createElement('div');toolbar.className='tactical-callouts';
  toolbar.hidden=true;
  const toggle=document.createElement('button');toggle.type='button';
  toggle.className='tactical-callouts-toggle';toggle.textContent='⚑ TEAM CALLS';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Show team chat callouts');
  const tray=document.createElement('div');tray.className='tactical-callouts-tray';tray.hidden=true;
  tray.setAttribute('role','group');tray.setAttribute('aria-label','Send a quick room chat message');
  const notice=document.createElement('p');notice.className='tactical-callouts-notice';
  notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const customButtons=[];
  const now=()=>performance.now();
  let lastSent=-Infinity,expanded=false;
  function updateVisibility(){
   const available=!!serverLink?.room&&!match.hidden&&!replay&&!document.hidden;
   toolbar.hidden=!available;
   if(!available&&expanded){expanded=false;tray.hidden=true;toggle.setAttribute('aria-expanded','false');}
   return available;
  }
  function sendCall(text){
   if(!updateVisibility()||!serverLink?.room)return;
   if(now()-lastSent<2500){notice.textContent='One callout every 2.5 seconds. Keep chat useful.';return;}
   if(input.value.trim()){
    notice.textContent='Finish your current chat draft first; it was not replaced.';
    return;
   }
   const mutedUntil=serverLink?.roomControl?.chatMuteUntil||serverLink?.chatMutedUntil||0;
   if(mutedUntil>Date.now()){
    notice.textContent='Room chat is muted by the host right now.';return;
   }
   if(!form.onsubmit){
    notice.textContent='Chat is not ready yet.';return;
   }
   // The installed native chat handler preserves server moderation/rate limits,
   // sender attribution and real acknowledgement; never log a fake send.
   input.value=text;
   try{
    form.requestSubmit();
    lastSent=now();
    notice.textContent='Sent to room chat · subject to server rules.';
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
  tray.append(favorites,standard,notice);toolbar.append(toggle,tray);corner.append(toolbar);
  toggle.addEventListener('click',()=>{
   if(!updateVisibility())return;
   expanded=!expanded;tray.hidden=!expanded;
   toggle.setAttribute('aria-expanded',String(expanded));
   if(expanded){notice.textContent='Tap a phrase to send it. Visible to room players.';customButtons[0]?.focus();}
  });
  const editor=document.createElement('section');editor.className='tactical-callouts-editor';
  const editorTitle=document.createElement('h3');editorTitle.textContent='TEAM CALLOUTS.';
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

 rows();
})();
