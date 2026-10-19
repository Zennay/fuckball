'use strict';
// User-owned, offline coaching notes for saved HBR2 replay frames only.
(function(){
 const controls=document.getElementById('replayControls');
 if(!controls||typeof ReplayLibrary==='undefined')return;
 const node=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
 const root=node('details','','replay-timeline-notes'),title=node('summary','✎ Replay notebook · moments and decisions');
 const panel=node('section','','replay-notes-panel'),help=node('p','Write up to 12 frame-specific observations, jump back to decisions, and carry them with your private My Games ZIP backup. This is not an official match review.');
 const toolbar=node('div','','replay-notes-toolbar'),add=node('button','＋ Note at current frame'),prev=node('button','‹ Previous'),next=node('button','Next ›'),exportBtn=node('button','↓ Coaching report');
 for(const b of [add,prev,next,exportBtn]){b.type='button';toolbar.append(b);}
 const status=node('p','','replay-notes-status'),list=node('ol','','replay-notes-list');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(help,toolbar,status,list);root.append(title,panel);controls.append(root);
 let id='',notes=[],selectedReplay=null,busy=false,generation=0;
 const frame=()=>Math.max(0,Math.round(replay.getTime()*60/1000));
 const format=n=>Math.floor(n/3600)+':'+String(Math.floor(n%3600/60)).padStart(2,'0');
 const playing=()=>!controls.hidden&&!document.getElementById('matchView').hidden&&typeof replay!=='undefined'&&!!replay&&
  typeof activeLocalReplayId==='string'&&/^[a-f0-9]{32}$/.test(activeLocalReplayId);
 const current=()=>playing()&&id===activeLocalReplayId&&replay===selectedReplay;
 function seek(n){if(!current())return;replay.setTime(Math.min(replay.length(),n*1000/60));replay.setSpeed(0);document.getElementById('replayToggle').textContent='▶';status.textContent='Paused at '+format(n);}
 function seekNote(direction){
  const at=frame(),entry=direction>0?notes.find(n=>n.frameNo>at+15):[...notes].reverse().find(n=>n.frameNo<at-15);
  if(entry)seek(entry.frameNo);else status.textContent=direction>0?'No later notes.':'No earlier notes.';
 }
 prev.onclick=()=>seekNote(-1);next.onclick=()=>seekNote(1);
 exportBtn.onclick=()=>{
  if(!current()||!notes.length)return;
  const lines=['# Personal replay coaching report','','Generated '+new Date().toLocaleString(),
   'Private notes from a locally saved HBR2 recording. Not verified match statistics.',''];
  for(const note of notes){
   const safe=value=>String(value).replace(/[\r\n]+/g,' ').replace(/[<>]/g,'').trim();
   lines.push('## '+format(note.frameNo)+' — '+safe(note.label),'',
    '**Focus:** '+safe(note.category),'',safe(note.text),'');
  }
  const blob=new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='fuckball-replay-coaching-'+new Date().toISOString().slice(0,10)+'.md';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Private coaching report downloaded. Share only if you choose to.';
 };
 function render(){
  root.hidden=!current();if(root.hidden)return;
  add.disabled=busy||notes.length>=12;prev.disabled=next.disabled=exportBtn.disabled=busy||!notes.length;
  list.replaceChildren();status.textContent=notes.length+'/12 private coaching notes';
  if(!notes.length){list.append(node('li','No notes yet. Pause at a decision, then add your first observation.'));return;}
  for(const note of notes){
   const row=node('li','','replay-notes-entry'),info=node('div','','replay-notes-copy'),actions=node('div','','replay-notes-actions');
   info.append(node('strong',format(note.frameNo)+' · '+note.label),node('small',note.category),node('p',note.text));
   const jump=node('button','▶ Jump'),edit=node('button','Edit'),remove=node('button','Delete');
   for(const b of [jump,edit,remove]){b.type='button';actions.append(b);}
   jump.onclick=()=>seek(note.frameNo);edit.onclick=()=>openEditor(note);
   remove.onclick=async()=>{if(!current()||!confirm('Delete this private note? The recording will remain saved.'))return;await save(notes.filter(n=>n.frameNo!==note.frameNo));};
   row.append(info,actions);list.append(row);
  }
 }
 async function save(updated){
  if(!current()||busy)return false;
  const token=selectedReplay,replayId=id;busy=true;add.disabled=true;
  try{
   const updatedItem=await ReplayLibrary.setNotes(replayId,updated);
   if(replay!==token||activeLocalReplayId!==replayId)return false;
   notes=ReplayLibrary.normalizeNotes(updatedItem.notes,updatedItem.frames);render();return true;
  }catch(error){status.textContent='Cannot save note: '+(error.message||'Local storage unavailable');return false;}
  finally{busy=false;if(current())add.disabled=notes.length>=12;}
 }
 function openEditor(existing){
  if(!current()||busy)return;
  const replayId=id,at=existing?.frameNo??frame(),dialog=node('dialog','','replay-notes-dialog'),form=node('form','','replay-notes-form');
  const heading=node('h2',existing?'Edit your note':'New coaching note'),message=node('p','Recorded moment '+format(at)+' · kept only in My Games.');
  const label=node('label','Moment title'),name=node('input');name.type='text';name.maxLength=60;name.required=true;name.value=existing?.label||'Moment at '+format(at);label.append(name);
  const typeLabel=node('label','Training focus'),type=node('select');
  for(const c of ['decision','positioning','passing','defense','finishing','other'])type.add(new Option(c[0].toUpperCase()+c.slice(1),c));
  type.value=existing?.category||'decision';typeLabel.append(type);
  const bodyLabel=node('label','What happened / what to improve? (360 characters)'),body=node('textarea');body.maxLength=360;body.required=true;body.rows=4;body.value=existing?.text||'';bodyLabel.append(body);
  const actions=node('div','','replay-notes-actions'),cancel=node('button','Cancel'),submit=node('button','Save note');
  cancel.type='button';cancel.onclick=()=>dialog.close();submit.type='submit';submit.className='primary';actions.append(cancel,submit);
  form.append(heading,message,label,typeLabel,bodyLabel,actions);dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();
   if(!current()||id!==replayId){message.textContent='Replay changed; reopen it to save a note.';return;}
   const candidate=[...notes.filter(n=>n.frameNo!==at),{frameNo:at,label:name.value,category:type.value,text:body.value}];
   try{ReplayLibrary.normalizeNotes(candidate);submit.disabled=true;
    if(await save(candidate))dialog.close();else {message.textContent='Save failed; your changes are still in this form.';submit.disabled=false;}
   }catch(error){message.textContent=error.message||'Invalid note.';submit.disabled=false;}
  };
  dialog.showModal();body.focus();
 }
 add.onclick=()=>{if(!current()||busy)return;const found=notes.find(n=>n.frameNo===frame());if(found)openEditor(found);else if(notes.length<12)openEditor(null);};
 async function refresh(){
  const serial=++generation,replayId=activeLocalReplayId;
  id='';notes=[];selectedReplay=null;root.hidden=true;
  if(!playing())return;
  const playback=replay;
  try{
   const item=(await ReplayLibrary.list()).find(n=>n.id===replayId);
   if(serial!==generation||!item||!playing()||activeLocalReplayId!==replayId||replay!==playback)return;
   notes=ReplayLibrary.normalizeNotes(item.notes,item.frames);selectedReplay=playback;id=replayId;render();
  }catch(error){if(serial===generation){root.hidden=false;status.textContent='Cannot read coaching notes: '+(error.message||'Browser storage unavailable');}}
 }
 window.refreshReplayNotes=refresh;
 const close=closeReplay;closeReplay=function(){generation++;root.hidden=true;id='';notes=[];close();};
 root.hidden=true;
})();