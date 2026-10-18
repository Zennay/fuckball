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
 const erase=document.createElement('button');erase.type='button';erase.className='moment-danger';
 erase.textContent='Delete all photos';
 tools.append(count,refresh,erase);
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
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error||Error('Photo could not be saved.'));
   tx.onabort=()=>reject(tx.error||Error('Photo operation was cancelled.'));
   operation(tx.objectStore(STORE));
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
 async function render(){
  const seq=++rendering;
  status.textContent='Loading moments…';
  const items=await all();
  if(seq!==rendering||!dialog.open)return;
  cleanup();list.replaceChildren();count.textContent=items.length+' / '+LIMIT+' saved';
  erase.disabled=!items.length;
  if(!items.length){
   const empty=document.createElement('p');empty.className='moment-empty';
   empty.textContent='No screenshots yet. While in a match, press ◎ Capture to save a moment here.';
   list.append(empty);status.textContent='Only you can see moments stored in this browser.';return;
  }
  for(const item of items){
   const card=document.createElement('article');card.className='moment-card';
   const preview=document.createElement('img');preview.alt='Pitch screenshot from '+new Date(item.at).toLocaleString();
   preview.loading='lazy';preview.src=URL.createObjectURL(item.blob);urls.push(preview.src);
   const label=document.createElement('strong');label.textContent=item.label||'Match snapshot';
   const meta=document.createElement('small');meta.textContent=new Date(item.at).toLocaleString()+
    ' · '+(item.blob.size/1048576).toFixed(1)+' MB · LOCAL';
   const buttons=document.createElement('div');buttons.className='moment-card-actions';
   buttons.append(
    action('↓ PNG',()=>download(item)),
    action('Share',()=>share(item)),
    action('Delete',async()=>{
     if(!confirm('Delete this saved screenshot from this browser?'))return;
     await edit(store=>store.delete(item.id));await render();
    })
   );card.append(preview,label,meta,buttons);list.append(card);
  }
  status.textContent='Photos are local, not authenticated match records.';
 }
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
   const existing=await all(),used=existing.reduce((sum,p)=>sum+p.blob.size,0);
   if(existing.length>=LIMIT||used+blob.size>MAX_TOTAL)
    throw Error('Moments gallery is full (24 pictures / 96 MB). Delete older photos first.');
   const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
   const entry={id,blob,at:Date.now(),label:'Pitch · '+score+' · '+String(document.getElementById('clock')?.textContent||'00:00')};
   await edit(store=>store.add(entry));
   notify('Match moment saved on this device · open Moments to share or download.');
   if(dialog.open)await render();
  }catch(err){notify(err.message||'Could not capture pitch.');}
  finally{building=false;capture.disabled=false;menuCapture.disabled=false;}
 }
 capture.onclick=snap;
 library.onclick=()=>{dialog.showModal();render().catch(e=>status.textContent=e.message);};
 refresh.onclick=()=>render().catch(e=>status.textContent=e.message);
 erase.onclick=async()=>{
  if(!confirm('Delete ALL local match screenshots? This does not remove replay files.'))return;
  try{await edit(store=>store.clear());await render();}
  catch(e){status.textContent=e.message||'Could not erase photos.';}
 };
 dialog.addEventListener('close',()=>{rendering++;cleanup();});
 window.addEventListener('keydown',event=>{
  if(event.repeat||event.code!=='F8'||event.altKey||event.ctrlKey||event.metaKey||
     document.getElementById('matchView')?.hidden||
     ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
  event.preventDefault();snap();
 });
})();
