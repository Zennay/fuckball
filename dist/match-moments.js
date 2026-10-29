'use strict';
// Voluntary device-local pitch screenshots. Never represents a screenshot as an
// authenticated result, ranked match, or backed-up HBR2 recording.
(function(){
 const pitch=document.getElementById('gameCanvas');
 const hud=document.querySelector('.hud-top-right');
 const matchActions=document.querySelector('.rm-head-actions');
 const nav=document.querySelector('.main-nav');
 if(!pitch||!hud||!nav)return;
 const DATABASE='fuckball-local-moments-v1',STORE='moments',LIMIT=24,MAX_TOTAL=96*1048576,MAX_IMAGE=8*1048576;
 const capture=document.createElement('button');capture.type='button';capture.className='hud-button moment-capture';
 capture.textContent='◎ Capture';capture.setAttribute('aria-label','Capture the current pitch as a local screenshot');
 hud.prepend(capture);
 const menuCapture=capture.cloneNode(true);menuCapture.className='moment-menu-capture';
 menuCapture.onclick=()=>capture.click();matchActions?.append(menuCapture);
 const library=document.createElement('button');library.type='button';
 library.className='moment-library-open';library.textContent='Moments';
 library.setAttribute('aria-label','Open locally saved match screenshots');nav.append(library);
 const dialog=document.createElement('dialog');dialog.className='moment-dialog';
 dialog.setAttribute('aria-label','My locally saved match moments');
 const shell=document.createElement('div');shell.className='moment-shell';
 const heading=document.createElement('header');heading.className='moment-head';
 const title=document.createElement('h2');title.textContent='MY MOMENTS.';
 const close=document.createElement('button');close.type='button';close.textContent='×';
 close.setAttribute('aria-label','Close moments');close.onclick=()=>dialog.close();
 heading.append(title,close);
 const description=document.createElement('p');description.className='moment-description';
 description.textContent='Screenshots stay on this browser. They are not HBR2 replays, verified results, ranks or cloud backups. Download any image before clearing browser storage.';
 const tools=document.createElement('div');tools.className='moment-tools';
 const count=document.createElement('strong');count.textContent='0 saved';
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh';
 const searchLabel=document.createElement('label');searchLabel.className='moment-filter-label';searchLabel.textContent='Find';
 const search=document.createElement('input');search.type='search';search.maxLength=80;
 search.placeholder='Search captions';search.setAttribute('aria-label','Search private photo captions');
 searchLabel.append(search);
 const filterLabel=document.createElement('label');filterLabel.className='moment-filter-label';filterLabel.textContent='Show';
 const favoriteFilter=document.createElement('select');favoriteFilter.setAttribute('aria-label','Filter saved moments');
 favoriteFilter.add(new Option('All photos','all'));favoriteFilter.add(new Option('★ Favorites','favorite'));
 filterLabel.append(favoriteFilter);
 const erase=document.createElement('button');erase.type='button';erase.className='moment-danger';
 erase.textContent='Delete all photos';
 const clearOthers=document.createElement('button');clearOthers.type='button';clearOthers.className='moment-danger';
 clearOthers.textContent='Delete non-favorites';
 tools.append(count,searchLabel,filterLabel,refresh,clearOthers,erase);
 const status=document.createElement('p');status.className='moment-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const list=document.createElement('div');list.className='moment-grid';
 shell.append(heading,description,tools,status,list);dialog.append(shell);document.body.append(dialog);
 let dbPromise=null,building=false,rendering=0,urls=[];
 function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
   if(!window.indexedDB){reject(Error('This browser does not support local photo storage.'));return;}
   const request=indexedDB.open(DATABASE,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(STORE))
     request.result.createObjectStore(STORE,{keyPath:'id'});
   };
   request.onsuccess=()=>{
    request.result.onversionchange=()=>{request.result.close();dbPromise=null;};
    resolve(request.result);
   };
   request.onerror=()=>reject(request.error||Error('Photo database unavailable.'));
   request.onblocked=()=>reject(Error('Close other Fuckball tabs and try again.'));
  }).catch(err=>{dbPromise=null;throw err;});
  return dbPromise;
 }
 const req=request=>new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Local photo storage failed.'));
 });
 async function all(){
  const db=await openDb();
  const tx=db.transaction(STORE,'readonly');
  const records=await req(tx.objectStore(STORE).getAll());
  return records.filter(r=>r&&r.blob instanceof Blob&&Number.isSafeInteger(r.at)&&r.at>0)
   .sort((a,b)=>b.at-a.at);
 }
 async function edit(operation){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');
   let abortReason=null;
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(abortReason||tx.error||Error('Photo could not be saved.'));
   tx.onabort=()=>reject(abortReason||tx.error||Error('Photo operation was cancelled.'));
   const abort=error=>{
    abortReason=error||Error('Photo operation was cancelled.');
    try{tx.abort();}catch{reject(abortReason);}
   };
   try{operation(tx.objectStore(STORE),abort);}
   catch(error){abort(error);}
  });
 }
 function cleanup(){for(const url of urls)URL.revokeObjectURL(url);urls=[];}
 function filename(entry){
  const date=new Date(entry.at).toISOString().replace(/[:.]/g,'-');
  return 'fuckball-moment-'+date+'.png';
 }
 function download(entry){
  const url=URL.createObjectURL(entry.blob);
  const link=document.createElement('a');link.href=url;link.download=filename(entry);
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function share(entry){
  const file=new File([entry.blob],filename(entry),{type:'image/png'});
  if(!navigator.canShare?.({files:[file]})){
   download(entry);status.textContent='Browser sharing unavailable · PNG downloaded instead.';return;
  }
  try{await navigator.share({files:[file],title:'Fuckball local match moment'});}
  catch(err){if(err?.name!=='AbortError')status.textContent='Sharing unavailable: '+(err.message||'Try download.');}
 }
 function action(text,doIt){
  const b=document.createElement('button');b.type='button';b.textContent=text;
  b.onclick=async()=>{
   b.disabled=true;
   try{await doIt();}
   catch(err){status.textContent=err.message||'Could not complete the photo action.';}
   finally{b.disabled=false;}
  };
  return b;
 }
 // Reuse the existing IndexedDB record: no migration or additional user data.
 async function updatePhoto(id,changes){
  await edit(store=>{
   const request=store.get(id);
   request.onsuccess=()=>{
    const current=request.result;
    if(current&&current.blob instanceof Blob)store.put({...current,...changes});
   };
  });
 }
 function makeEditor(item){
  const editor=document.createElement('dialog');editor.className='moment-edit-dialog';
  const form=document.createElement('form');form.className='moment-edit-form';
  const h=document.createElement('h2');h.textContent='Name this moment';
  const desc=document.createElement('p');
  desc.textContent='Only the local gallery caption changes. The original PNG stays untouched.';
  const label=document.createElement('label');label.textContent='Caption (max 80 characters)';
  const input=document.createElement('input');input.type='text';input.required=true;
  input.maxLength=80;input.value=String(item.label||'Match snapshot').slice(0,80);
  label.append(input);
  const buttons=document.createElement('div');buttons.className='moment-edit-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
  const save=document.createElement('button');save.type='submit';save.className='primary';save.textContent='Save caption';
  cancel.onclick=()=>editor.close();
  buttons.append(cancel,save);form.append(h,desc,label,buttons);editor.append(form);
  document.body.append(editor);
  editor.addEventListener('close',()=>editor.remove(),{once:true});
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const caption=input.value.trim().replace(/\\s+/g,' ');
   if(!caption){input.setCustomValidity('Enter a short caption.');input.reportValidity();return;}
   save.disabled=true;
   try{await updatePhoto(item.id,{label:caption});editor.close();await render();}
   catch(error){desc.textContent=error.message||'Caption could not be saved.';save.disabled=false;}
  });
  input.addEventListener('input',()=>input.setCustomValidity(''));
  editor.showModal();input.focus();input.select();
 }
 function viewPhoto(item){
  const viewer=document.createElement('dialog');viewer.className='moment-view-dialog';
  viewer.setAttribute('aria-label','Full size saved pitch moment');
  const close=document.createElement('button');close.type='button';close.textContent='Close photo';
  const image=document.createElement('img');image.alt='Saved pitch: '+String(item.label||'Match snapshot').slice(0,80);
  const url=URL.createObjectURL(item.blob);image.src=url;
  const caption=document.createElement('p');caption.textContent=String(item.label||'Match snapshot');
  viewer.append(close,image,caption);document.body.append(viewer);
  close.onclick=()=>viewer.close();
  viewer.addEventListener('close',()=>{URL.revokeObjectURL(url);viewer.remove();},{once:true});
  viewer.showModal();close.focus();
 }
 async function render(){
  const seq=++rendering;
  status.textContent='Loading moments…';
  const items=await all();
  if(seq!==rendering||!dialog.open)return;
  cleanup();list.replaceChildren();
  const favorites=items.filter(item=>item.favorite===true).length;
  count.textContent=items.length+' / '+LIMIT+' saved · ★ '+favorites;
  erase.disabled=!items.length;
  clearOthers.disabled=items.length===favorites;
  const term=search.value.trim().toLocaleLowerCase();
  const shown=items.filter(item=>(favoriteFilter.value!=='favorite'||item.favorite===true)&&
    String(item.label||'Match snapshot').toLocaleLowerCase().includes(term))
   .sort((a,b)=>Number(b.favorite===true)-Number(a.favorite===true)||b.at-a.at);
  if(!shown.length){
   const empty=document.createElement('p');empty.className='moment-empty';
   empty.textContent=items.length?'No saved moments match this search or filter.':
    'No screenshots yet. While in a match, press ◎ Capture to save a moment here.';
   list.append(empty);status.textContent='Private local screenshots only.';return;
  }
  for(const item of shown){
   const card=document.createElement('article');
   card.className='moment-card'+(item.favorite===true?' moment-card-favorite':'');
   const preview=document.createElement('img');preview.alt='Pitch screenshot from '+new Date(item.at).toLocaleString();
   preview.loading='lazy';preview.src=URL.createObjectURL(item.blob);urls.push(preview.src);
   const previewButton=document.createElement('button');previewButton.type='button';
   previewButton.className='moment-preview';previewButton.setAttribute('aria-label','Enlarge '+String(item.label||'saved moment'));
   previewButton.onclick=()=>viewPhoto(item);previewButton.append(preview);
   const label=document.createElement('strong');label.textContent=item.label||'Match snapshot';
   const meta=document.createElement('small');meta.textContent=new Date(item.at).toLocaleString()+
    ' · '+(item.blob.size/1048576).toFixed(1)+' MB · LOCAL';
   const buttons=document.createElement('div');buttons.className='moment-card-actions';
   buttons.append(
    action(item.favorite===true?'★ Favorite':'☆ Favorite',async()=>{
     await updatePhoto(item.id,{favorite:item.favorite!==true});await render();
    }),
    action('Edit caption',()=>makeEditor(item)),
    action('↓ PNG',()=>download(item)),
    action('Share',()=>share(item)),
    action('Delete',async()=>{
     if(!confirm('Delete this saved screenshot from this browser?'))return;
     await edit(store=>store.delete(item.id));await render();
    })
   );card.append(previewButton,label,meta,buttons);list.append(card);
  }
  status.textContent='Favorites stay pinned to the top. Only your browser stores these photos.';
 }
 search.addEventListener('input',()=>render().catch(e=>status.textContent=e.message));
 favoriteFilter.addEventListener('change',()=>render().catch(e=>status.textContent=e.message));
 clearOthers.onclick=async()=>{
  const items=await all(),others=items.filter(item=>item.favorite!==true);
  if(!others.length)return;
  if(!confirm('Delete '+others.length+' non-favorite screenshots? Favorites are preserved.'))return;
  try{
   // The user confirmed only the photos visible as non-favorites. Reread
   // each one in the SAME read-write transaction before deletion: another
   // tab may have starred it during the confirmation dialog.
   await edit(store=>{
    for(const item of others){
     const check=store.get(item.id);
     check.onsuccess=()=>{
      const latest=check.result;
      if(latest&&latest.favorite!==true)store.delete(item.id);
     };
    }
   });
   await render();
  }catch(error){status.textContent=error.message||'Could not delete non-favorites.';}
 };
 async function snap(){
  if(building)return;
  if(document.getElementById('matchView')?.hidden){
   status.textContent='Open a match or replay before capturing the pitch.';return;
  }
  building=true;capture.disabled=true;menuCapture.disabled=true;
  try{
   if(!pitch.width||!pitch.height)throw Error('Pitch is not ready to capture.');
   const limit=Math.min(1,1920/pitch.width,1080/pitch.height),width=Math.max(1,Math.floor(pitch.width*limit)),
    height=Math.max(1,Math.floor(pitch.height*limit));
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+56;
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Image capture not supported here.');
   ctx.fillStyle='#15282c';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(pitch,0,56,width,height);
   ctx.fillStyle='#162b32';ctx.fillRect(0,0,width,56);
   ctx.fillStyle='#d3efa1';ctx.font='bold 20px system-ui,sans-serif';
   ctx.fillText('FUCKBALL',14,35);
   ctx.fillStyle='#f1f6ee';ctx.font='bold 18px system-ui,sans-serif';
   const score=String(document.getElementById('redScore')?.textContent||'0')+' : '+
    String(document.getElementById('blueScore')?.textContent||'0');
   ctx.textAlign='right';ctx.fillText(score+'  ·  '+String(document.getElementById('clock')?.textContent||'00:00'),width-14,35);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(
    value=>value?resolve(value):reject(Error('Pitch screenshot could not be encoded.')),'image/png'));
   if(blob.size>MAX_IMAGE)throw Error('Screenshot exceeds 8 MB. Lower rendering resolution and try again.');
   const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
   const entry={id,blob,at:Date.now(),label:'Pitch · '+score+' · '+String(document.getElementById('clock')?.textContent||'00:00')};
   // The size/count check and insertion MUST share one write transaction.
   // Separate all() → add() transactions race across multiple open tabs and
   // allow more than the promised 24 photos / 96 MB. IndexedDB serializes
   // overlapping readwrite transactions on the same object store.
   await edit((store,abort)=>{
    const lookup=store.getAll();
    lookup.onsuccess=()=>{
     const existing=(lookup.result||[]).filter(p=>p&&p.blob instanceof Blob);
     const used=existing.reduce((sum,p)=>sum+p.blob.size,0);
     if(existing.length>=LIMIT||used+blob.size>MAX_TOTAL){
      abort(Error('Moments gallery is full (24 pictures / 96 MB). Delete older photos first.'));
      return;
     }
     store.add(entry);
    };
   });
   notify('Match moment saved on this device · open Moments to share or download.');
   if(dialog.open)await render();
  }catch(err){notify(err.message||'Could not capture pitch.');}
  finally{building=false;capture.disabled=false;menuCapture.disabled=false;}
 }
 capture.onclick=snap;
 library.onclick=()=>{dialog.showModal();render().catch(e=>status.textContent=e.message);};
 const refreshOpenGallery=()=>{
  if(dialog.open)render().catch(e=>status.textContent=e.message||'Could not refresh moments.');
 };
 // Another tab may have saved, starred or removed a moment. Refresh from
 // the authoritative IndexedDB store on return, not from stale card data.
 window.addEventListener('focus',refreshOpenGallery);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshOpenGallery();});
 refresh.onclick=()=>render().catch(e=>status.textContent=e.message);
 erase.onclick=async()=>{
  try{
   const visibleAtPrompt=await all();
   if(!visibleAtPrompt.length)return;
   if(!confirm('Delete ALL '+visibleAtPrompt.length+' local match screenshots, including favorites? Replay files stay untouched.'))return;
   if(!confirm('This permanently removes the screenshots you just reviewed. Continue?'))return;
   // Never clear the whole store after a slow confirmation: another tab
   // could have captured a NEW photo while the browser dialog was open.
   await edit(store=>{for(const photo of visibleAtPrompt)store.delete(photo.id);});
   await render();
  }catch(e){status.textContent=e.message||'Could not erase photos.';}
 };
 dialog.addEventListener('close',()=>{rendering++;cleanup();});
 window.addEventListener('keydown',event=>{
  if(event.repeat||event.code!=='F8'||event.altKey||event.ctrlKey||event.metaKey||
     document.getElementById('matchView')?.hidden||
     ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
  event.preventDefault();snap();
 });
})();
