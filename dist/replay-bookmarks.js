'use strict';
// Timestamp notes for locally saved HBR2 recordings. These never go to the server.
(function(){
 const controls=$('replayControls');
 if(!controls||typeof ReplayLibrary==='undefined')return;
 const markButton=document.createElement('button');
 markButton.type='button';markButton.className='replay-add-bookmark';
 markButton.textContent='＋ Save moment';markButton.hidden=true;
 markButton.setAttribute('aria-label','Add a named moment at the current replay time');
 const moments=document.createElement('div');
 moments.className='replay-bookmarks';moments.hidden=true;
 moments.setAttribute('aria-label','Your saved replay moments');
 controls.append(markButton,moments);
 let generation=0,editor=null;
 function closeEditor(){
  const pending=editor;editor=null;
  if(pending?.open)pending.close();
 }
 const selectFrame=(frameNo,id,playback)=>{
  if(!replay||replay!==playback||activeLocalReplayId!==id||controls.hidden)return;
  // Bookmarks are review markers, just like the local event timeline and
  // coaching notes: arrive paused so a goal/decision cannot pass unnoticed.
  replay.setTime(Math.min(replay.length(),frameNo*1000/60));
  replay.setSpeed(0);$('replayToggle').textContent='▶';
 };
 async function refreshReplayBookmarks(){
  const token=++generation,id=activeLocalReplayId,playback=replay;
  markButton.hidden=!id||!playback;
  moments.replaceChildren();moments.hidden=true;
  if(!id||!replay)return;
  try{
   const item=(await ReplayLibrary.list()).find(x=>x.id===id);
   if(token!==generation||id!==activeLocalReplayId||replay!==playback)return;
   if(!item){markButton.hidden=true;return;}
   const saved=ReplayLibrary.normalizeBookmarks(item.bookmarks,item.frames);
   markButton.disabled=saved.length>=30;
   markButton.title=saved.length>=30?'Maximum 30 moments per recording':'Mark the current time in this recording';
   if(!saved.length)return;
   moments.hidden=false;
   const heading=document.createElement('strong');
   heading.textContent='Saved moments · '+saved.length+'/30';moments.append(heading);
   for(const entry of saved){
    const group=document.createElement('span');group.className='replay-bookmark';
    const go=document.createElement('button');go.type='button';
    go.className='replay-moment';
    go.textContent=fmt(entry.frameNo/60)+' · '+entry.label;
    go.title='Jump to '+entry.label;
    go.onclick=()=>selectFrame(entry.frameNo,id,playback);
    const remove=document.createElement('button');remove.type='button';
    remove.className='replay-remove-bookmark';remove.textContent='×';
    remove.setAttribute('aria-label','Remove moment '+entry.label);
    remove.onclick=async()=>{
     if(id!==activeLocalReplayId||replay!==playback||remove.disabled)return;
     remove.disabled=true;
     try{await ReplayLibrary.removeBookmark(id,entry.frameNo);
      if(id===activeLocalReplayId&&replay===playback)await refreshReplayBookmarks();}
     catch(e){if(id===activeLocalReplayId&&replay===playback)
      notify('Could not delete moment: '+(e.message||'storage error'));
      remove.disabled=false;}
    };
    group.append(go,remove);moments.append(group);
   }
  }catch(e){if(token===generation)notify('Could not read saved moments: '+(e.message||'storage error'));}
 }
 // Defined as a global function declaration so My Games can refresh after
 // setting its selected recording, without delaying ordinary replay playback.
 window.refreshReplayBookmarks=refreshReplayBookmarks;
 markButton.onclick=()=>{
  if(!activeLocalReplayId||!replay)return;
  const id=activeLocalReplayId,playback=replay,position=Math.round(replay.getTime()/1000*60);
  if(!Number.isSafeInteger(position)||position<0)return;
  closeEditor();
  const dialog=document.createElement('dialog');dialog.className='replay-bookmark-dialog';
  editor=dialog;
  const form=document.createElement('form');form.className='replay-bookmark-form';
  const h=document.createElement('h2');h.textContent='Save replay moment';
  const note=document.createElement('p');note.textContent='Bookmark this recording at '+fmt(position/60)+'.';
  const label=document.createElement('label');label.textContent='Moment name';
  const input=document.createElement('input');input.type='text';input.required=true;
  input.maxLength=48;input.value='Moment at '+fmt(position/60);
  label.append(input);
  const actions=document.createElement('div');actions.className='replay-bookmark-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
  const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Save moment';
  cancel.onclick=()=>dialog.close();actions.append(cancel,save);
  form.append(h,note,label,actions);dialog.append(form);document.body.append(dialog);
  dialog.addEventListener('close',()=>{
   if(editor===dialog)editor=null;
   dialog.remove();
  },{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();
   if(id!==activeLocalReplayId||replay!==playback||editor!==dialog){
    note.textContent='Recording changed. Reopen the current replay to save this moment.';
    return;
   }
   save.disabled=true;
   try{
    await ReplayLibrary.addBookmark(id,position,input.value);
    if(editor===dialog)dialog.close();
    if(id===activeLocalReplayId&&replay===playback)await refreshReplayBookmarks();
   }catch(e){
    note.textContent=e.message||'Could not save this moment.';
    save.disabled=false;
   }
  };
  dialog.showModal();input.focus();input.select();
 };
 const oldLoad=loadReplay;
 loadReplay=function(bytes,name){
  // The engine may reject corrupt HBR2 or an active human match before
  // changing playback. Never detach the *previous* saved replay's ID first.
  const previousReplay=replay,previousId=activeLocalReplayId;
  try{oldLoad(bytes,name);}
  catch(error){
   if(replay===previousReplay)activeLocalReplayId=previousId;
   else{activeLocalReplayId=null;closeEditor();
    refreshReplayBookmarks();window.refreshReplayNotes?.();}
   throw error;
  }
  // A real recording switch invalidates any old bookmark/editor and notes.
  // My Games binds the new ID after load, then explicitly refreshes both.
  closeEditor();activeLocalReplayId=null;generation++;
  refreshReplayBookmarks();
  window.refreshReplayNotes?.();
 };
 const oldClose=closeReplay;
 closeReplay=function(){
  closeEditor();activeLocalReplayId=null;generation++;
  oldClose();markButton.hidden=true;moments.hidden=true;moments.replaceChildren();
 };
})();
