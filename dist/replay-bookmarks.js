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
 let generation=0;
 const selectFrame=(frameNo)=>{
  if(!replay)return;
  replay.setTime(Math.min(replay.length(),frameNo*1000/60));
  replay.setSpeed(1);$('replayToggle').textContent='Ⅱ';
 };
 async function refreshReplayBookmarks(){
  const token=++generation,id=activeLocalReplayId;
  markButton.hidden=!id||!replay;
  moments.replaceChildren();moments.hidden=true;
  if(!id||!replay)return;
  try{
   const item=(await ReplayLibrary.list()).find(x=>x.id===id);
   if(token!==generation||id!==activeLocalReplayId||!replay)return;
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
    go.onclick=()=>selectFrame(entry.frameNo);
    const remove=document.createElement('button');remove.type='button';
    remove.className='replay-remove-bookmark';remove.textContent='×';
    remove.setAttribute('aria-label','Remove moment '+entry.label);
    remove.onclick=async()=>{
     remove.disabled=true;
     try{await ReplayLibrary.removeBookmark(id,entry.frameNo);await refreshReplayBookmarks();}
     catch(e){notify('Could not delete moment: '+(e.message||'storage error'));remove.disabled=false;}
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
  const id=activeLocalReplayId,position=Math.round(replay.getTime()/1000*60);
  if(!Number.isSafeInteger(position)||position<0)return;
  const dialog=document.createElement('dialog');dialog.className='replay-bookmark-dialog';
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
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();save.disabled=true;
   try{
    await ReplayLibrary.addBookmark(id,position,input.value);
    dialog.close();
    if(id===activeLocalReplayId)await refreshReplayBookmarks();
   }catch(e){
    note.textContent=e.message||'Could not save this moment.';
    save.disabled=false;
   }
  };
  dialog.showModal();input.focus();input.select();
 };
 const oldLoad=loadReplay;
 loadReplay=function(bytes,name){
  activeLocalReplayId=null;
  oldLoad(bytes,name);
  refreshReplayBookmarks();
 };
 const oldClose=closeReplay;
 closeReplay=function(){
  activeLocalReplayId=null;generation++;
  oldClose();markButton.hidden=true;moments.hidden=true;moments.replaceChildren();
 };
})();
