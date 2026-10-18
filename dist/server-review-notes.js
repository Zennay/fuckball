'use strict';
// Private, optional review notes attached to legitimate server match receipts.
// Never syncs or modifies server results, accounts, ratings or replay files.
(function(){
 const PREFIX='fuckball.online-match-review.v1.';
 const FOCUSES=['none','finishing','passing','defending','positioning','teamwork','decisions'];
 let refreshToolbar=()=>{};
 window.addEventListener('fuckball:online-review-updated',()=>refreshToolbar());
 window.addEventListener('storage',event=>{if(event.key?.startsWith(PREFIX))refreshToolbar();});
 const LABELS={none:'No focus',finishing:'Finishing',passing:'Passing',defending:'Defending',
  positioning:'Positioning',teamwork:'Teamwork',decisions:'Decision making'};
 const identity=user=>typeof user==='string'&&user.length>0&&user.length<=80?
  PREFIX+encodeURIComponent(user.toLowerCase())+'.':null;
 const receipt=id=>typeof id==='string'&&/^[0-9a-f]{24}$/.test(id);
 function parse(raw){
  if(!raw)return null;
  try{
   const value=JSON.parse(raw);
   return value?.version===1&&FOCUSES.includes(value.focus)&&
    typeof value.note==='string'&&value.note.length<=280&&
    Number.isSafeInteger(value.updatedAt)&&value.updatedAt>0?
    {focus:value.focus,note:value.note,updatedAt:value.updatedAt}:null;
  }catch{return null;}
 }
 function records(user){
  const prefix=identity(user);
  if(!prefix)return [];
  const output=[];
  try{
   for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(typeof key!=='string'||!key.startsWith(prefix))continue;
    const id=key.slice(prefix.length);
    if(!receipt(id))continue;
    const value=parse(localStorage.getItem(key));
    if(value)output.push({id,...value});
   }
  }catch{}
  return output.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100);
 }
 function hasNote(user,item){
  const prefix=identity(user);
  if(!prefix||!receipt(item?.id))return false;
  try{return !!parse(localStorage.getItem(prefix+item.id));}catch{return false;}
 }
 function renderInto(host,item,user,authorized){
  if(!host||!receipt(item?.id)||!identity(user))return;
  const key=identity(user)+item.id;
  const frame=document.createElement('section');frame.className='native-match-review';
  frame.setAttribute('aria-label','Private review for this online result');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='native-match-review-toggle';
  const editor=document.createElement('div');editor.className='native-match-review-editor';editor.hidden=true;
  const explanation=document.createElement('p');
  explanation.textContent='Private coaching notes on this device, linked to this genuine unranked server result. Not shared with teammates or uploaded.';
  const focusLabel=document.createElement('label');focusLabel.textContent='Focus to improve';
  const focus=document.createElement('select');focus.setAttribute('aria-label','Next match improvement focus');
  FOCUSES.forEach(value=>focus.add(new Option(LABELS[value],value)));
  focusLabel.append(focus);
  const noteLabel=document.createElement('label');noteLabel.textContent='What happened? (280 characters max)';
  const note=document.createElement('textarea');note.rows=3;note.maxLength=280;
  note.placeholder='One decision to repeat or improve next game…';
  note.setAttribute('aria-label','Private match review note');
  noteLabel.append(note);
  const actions=document.createElement('div');actions.className='native-match-review-actions';
  const save=document.createElement('button');save.type='button';save.textContent='Save private review';
  const remove=document.createElement('button');remove.type='button';remove.textContent='Delete review';
  actions.append(save,remove);
  const status=document.createElement('p');status.className='native-match-review-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  editor.append(explanation,focusLabel,noteLabel,actions,status);
  frame.append(toggle,editor);host.append(frame);
  let previousRaw=null;
  function updateLabel(){
   const value=parse(previousRaw);
   toggle.textContent=value?'✎ Review saved · '+LABELS[value.focus]+' ▾':'＋ Review this match ▾';
   toggle.setAttribute('aria-expanded',String(!editor.hidden));
   remove.disabled=!value;
  }
  function open(){
   if(typeof authorized!=='function'||!authorized()){
    status.textContent='Sign in and reload your own verified results before editing reviews.';
    return;
   }
   try{
    previousRaw=localStorage.getItem(key);
    const value=parse(previousRaw);
    focus.value=value?.focus||'none';note.value=value?.note||'';
    editor.hidden=false;status.textContent='Only saved on this browser. Not part of your server career.';
    updateLabel();note.focus();
   }catch{status.textContent='Private browser storage is unavailable.';}
  }
  toggle.onclick=()=>{
   if(!editor.hidden){editor.hidden=true;updateLabel();return;}
   open();
  };
  function stillOwned(){
   if(typeof authorized!=='function'||!authorized()){
    status.textContent='Your signed-in account or result list changed. Reopen My Games.';
    return false;
   }
   try{
    if(localStorage.getItem(key)!==previousRaw){
     status.textContent='This review changed in another tab. Close and reopen to load the newer version.';
     return false;
    }
   }catch{status.textContent='Private storage is unavailable.';return false;}
   return true;
  }
  save.onclick=()=>{
   if(!stillOwned())return;
   const text=note.value.trim(),value=focus.value;
   if(!FOCUSES.includes(value)||text.length>280||(!text&&value==='none')){
    status.textContent='Choose a coaching focus or write a note (up to 280 characters).';return;
   }
   if(previousRaw===null&&records(user).length>=100){
    status.textContent='100 local reviews saved. Export and delete old reviews before saving more.';return;
   }
   try{
    const encoded=JSON.stringify({version:1,focus:value,note:text,updatedAt:Date.now()});
    localStorage.setItem(key,encoded);previousRaw=encoded;updateLabel();
    status.textContent='Review saved on this device only.';
    window.dispatchEvent(new Event('fuckball:online-review-updated'));
   }catch{status.textContent='Browser storage refused the note. Nothing was uploaded.';}
  };
  remove.onclick=()=>{
   if(!stillOwned())return;
   if(!confirm('Delete your device-only review for this match? The genuine server result will remain.'))return;
   try{
    localStorage.removeItem(key);previousRaw=null;focus.value='none';note.value='';
    updateLabel();status.textContent='Local review deleted. Original match receipt preserved.';
    window.dispatchEvent(new Event('fuckball:online-review-updated'));
   }catch{status.textContent='Could not delete this local review.';}
  };
  try{previousRaw=localStorage.getItem(key);}catch{}
  updateLabel();
 }
 function renderToolbar(host,user,authorized,currentReceipts){
  if(!host||!identity(user))return;
  const panel=document.createElement('section');panel.className='native-review-vault';
  const heading=document.createElement('strong');heading.textContent='PRIVATE ONLINE MATCH REVIEWS';
  const detail=document.createElement('p');
  const actions=document.createElement('div');actions.className='native-review-vault-actions';
  const download=document.createElement('button');download.type='button';
  download.textContent='↓ Export my review notes';
  const wipe=document.createElement('button');wipe.type='button';
  wipe.textContent='Clear device reviews';wipe.className='native-review-vault-wipe';
  const status=document.createElement('p');status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  actions.append(download,wipe);panel.append(heading,detail,actions,status);host.replaceChildren(panel);
  function validSession(){
   if(typeof authorized!=='function'||!authorized()){
    status.textContent='Account session changed. Reload My Games before accessing private notes.';
    return false;
   }
   return true;
  }
  const refreshCoach=window.FuckballPrivateMatchCoach?.mount(panel,user,validSession,currentReceipts,()=>records(user))||(()=>{});
  const update=()=>{
   const total=records(user).length;
   detail.textContent=total+' saved device-only coaching review'+(total===1?'':'s')+
    ' for this signed-in handle. Your last 50 genuine server results can be reviewed above. No rankings or shared messages.';
   wipe.disabled=download.disabled=!total;
   refreshCoach();
  };
  // Add-only restore of private notes for receipts verified by this signed-in server.
  // Never imports results, changes ratings or overwrites an existing local review.
  const importButton=document.createElement('button');importButton.type='button';
  importButton.textContent='↑ Restore recent notes';
  const importFile=document.createElement('input');importFile.type='file';importFile.hidden=true;
  importFile.accept='.json,application/json';
  actions.append(importButton,importFile);
  importButton.onclick=()=>{
   if(!validSession())return;
   importFile.click();
  };
  importFile.onchange=async()=>{
   const file=importFile.files?.[0];importFile.value='';
   if(!file)return;
   if(!validSession())return;
   if(file.size>128*1024){
    status.textContent='Review import exceeds 128 KB. Select a smaller exported JSON file.';
    return;
   }
   importButton.disabled=true;
   try{
    const payload=JSON.parse(await file.text());
    if(!validSession())return;
    if(payload?.version!==1||payload.source!=='fuckball-local-review'||
      payload.ranked!==false||typeof payload.account!=='string'||
      payload.account.toLowerCase()!==user.toLowerCase()||
      !Array.isArray(payload.items)||payload.items.length>100)
      throw Error('Choose a private review export for this signed-in account.');
    const distinct=new Set();
    for(const item of payload.items){
     if(!receipt(item?.id)||distinct.has(item.id)||!FOCUSES.includes(item.focus)||
       typeof item.note!=='string'||item.note.length>280||
       !Number.isSafeInteger(item.updatedAt)||item.updatedAt<=0)
      throw Error('Review file contains an invalid or duplicate entry.');
     distinct.add(item.id);
    }
    // Can only link notes to currently authenticated, native-server receipts.
    const serverIds=new Set((currentReceipts||[]).filter(row=>receipt(row?.id)).map(row=>row.id));
    const eligible=payload.items.filter(item=>serverIds.has(item.id));
    const missing=payload.items.length-eligible.length;
    const prefix=identity(user);
    const fresh=eligible.filter(item=>localStorage.getItem(prefix+item.id)===null);
    const existing=eligible.length-fresh.length;
    if(!fresh.length){
     status.textContent='Nothing to restore: '+missing+' older receipts unavailable in current server history; '+existing+' reviews already exist.';
     return;
    }
    if(records(user).length+fresh.length>100)
     throw Error('This device would exceed 100 reviews. Export and clear old reviews before restoring.');
    if(!confirm('Restore '+fresh.length+' device-only review(s) for genuine recent matches? Existing notes will not be overwritten.'))return;
    if(!validSession())return;
    // Re-check absence after user confirmation; never overwrite a concurrent edit.
    if(fresh.some(item=>localStorage.getItem(prefix+item.id)!==null))
     throw Error('Reviews changed in another tab. Reopen the import to avoid overwriting them.');
    const written=[];
    try{
     for(const item of fresh){
      const key=prefix+item.id;
      localStorage.setItem(key,JSON.stringify({version:1,focus:item.focus,note:item.note,updatedAt:item.updatedAt}));
      written.push(key);
     }
    }catch(error){
     for(const key of written){try{localStorage.removeItem(key);}catch{}}
     throw Error('Browser storage rejected the import. Newly added notes were rolled back where possible.');
    }
    status.textContent=fresh.length+' private review(s) restored, '+existing+' existing kept; '+
      missing+' older receipts skipped because their original server data is not in the recent authenticated history.';
    update();window.dispatchEvent(new Event('fuckball:online-review-imported'));
   }catch(error){
    status.textContent=error?.message||'Could not import private review notes.';
   }finally{importButton.disabled=false;}
  };
  download.onclick=()=>{
   if(!validSession())return;
   const items=records(user);
   if(!items.length){status.textContent='No local notes to export.';return;}
   try{
    const payload={version:1,source:'fuckball-local-review',ranked:false,
     exportedAt:new Date().toISOString(),account:user,
     notice:'Private device-owned notes, not server-verified analysis, match ratings or HBR2 replays.',
     items};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;
    a.download='fuckball-private-online-match-reviews-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent=items.length+' private reviews exported locally. The file contains your username and match receipt IDs: share carefully.';
   }catch{status.textContent='Review export could not be created.';}
  };
  wipe.onclick=()=>{
   if(!validSession())return;
   const own=records(user);
   if(!own.length)return;
   if(!confirm('Delete '+own.length+' private notes for this account from this browser? Genuine server match results and replay recordings remain.'))return;
   try{
    const prefix=identity(user);
    for(const value of own)localStorage.removeItem(prefix+value.id);
    status.textContent=own.length+' device-only reviews cleared. Server results unchanged.';
    update();window.dispatchEvent(new Event('fuckball:online-review-updated'));
   }catch{status.textContent='Some local notes could not be cleared.';}
  };
  refreshToolbar=()=>{if(host.isConnected&&validSession())update();};
  update();
 }
 window.FuckballOnlineMatchReviews={renderInto,renderToolbar,hasNote};
})();
