'use strict';
// Private tactical annotations over snapshots of user-owned HBR2 replay frames.
// Never affects physics, live players, accounts, server results or ranked play.
(function(){
 const controls=document.getElementById('replayControls');
 const pitch=document.getElementById('gameCanvas');
 const games=document.getElementById('gamesView');
 if(!controls||!pitch||!games||typeof ReplayLibrary==='undefined')return;
 const DB='fuckball-replay-tactics-v1',STORE='boards',MAX=15,MAX_BYTES=48*1048576,MAX_ONE=4*1048576;
 const create=(tag,klass,label)=>{
  const x=document.createElement(tag);if(klass)x.className=klass;
  if(label!==undefined)x.textContent=label;return x;
 };
 const trigger=create('button','tactics-open','✎ Tactics board');
 trigger.type='button';trigger.title='Freeze the visible locally saved replay frame and draw a tactical review';
 controls.append(trigger);
 const panel=create('section','tactics-library');
 const header=create('div','tactics-library-head');
 const caption=create('div');
 caption.append(create('span','eyebrow','REPLAY STUDY · THIS DEVICE'),
  create('h2','','TACTICS BOARDS.'),
  create('p','','Freeze a frame from your own HBR2 recording, annotate movement and share a PNG. No cloud copy or official performance claim.'));
 const refresh=create('button','','↻ Refresh boards');refresh.type='button';
 header.append(caption,refresh);
 const status=create('p','tactics-library-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const gallery=create('div','tactics-gallery');
 panel.append(header,status,gallery);
 const anchor=games.querySelector('.replay-review-queue')||games.querySelector('.replay-compare-studio')||
  games.querySelector('.goal-gallery')||document.getElementById('gamesList');
 games.insertBefore(panel,anchor);
 const editor=document.createElement('dialog');editor.className='tactics-editor-dialog';
 editor.setAttribute('aria-label','Replay tactics drawing board');
 const shell=create('div','tactics-editor-shell');
 const top=create('header','tactics-editor-head');
 const title=create('div');title.append(create('span','eyebrow','LOCAL FRAME ANNOTATION'),
  create('h2','','TACTICS BOARD.'));
 const close=create('button','','×');close.type='button';close.setAttribute('aria-label','Close tactics editor');
 top.append(title,close);
 const desc=create('p','tactics-editor-desc',
  'Draw over the captured frame. Labels or player names visible in the underlying replay may be included in exports. Everything stays on this device.');
 const details=create('div','tactics-editor-details');
 const nameLabel=create('label','','Board title');
 const name=document.createElement('input');name.type='text';name.maxLength=80;
 name.setAttribute('aria-label','Tactics board title');nameLabel.append(name);
 const modeLabel=create('label','','Tool');
 const mode=document.createElement('select');mode.setAttribute('aria-label','Drawing tool');
 for(const [v,l] of [['arrow','Arrow →'],['circle','Circle'],['line','Line'],['text','Text label']])mode.add(new Option(l,v));
 modeLabel.append(mode);
 const colorLabel=create('label','','Color');
 const color=document.createElement('select');color.setAttribute('aria-label','Annotation color');
 for(const [v,l] of [['#eaf1a7','Lime'],['#f69a8c','Red'],['#82c0fa','Blue'],['#ffffff','White']])color.add(new Option(l,v));
 colorLabel.append(color);
 const textLabel=create('label','','Text (text tool)');
 const textValue=document.createElement('input');textValue.type='text';textValue.maxLength=28;
 textValue.placeholder='e.g. Overlap';textLabel.append(textValue);
 details.append(nameLabel,modeLabel,colorLabel,textLabel);
 const drawing=create('div','tactics-drawing');
 const canvas=document.createElement('canvas');canvas.className='tactics-canvas';
 canvas.setAttribute('aria-label','Tactics frame with draggable arrow, circle and line annotations. Text tool adds a label at tap position.');
 const hint=create('small','','Drag to draw; with Text, tap once to place a label. Replay is paused while capturing.');
 drawing.append(canvas,hint);
 const actions=create('div','tactics-editor-actions');
 const undo=create('button','','↶ Undo');undo.type='button';
 const clear=create('button','','Clear drawings');clear.type='button';
 const download=create('button','','↓ Export annotated PNG');download.type='button';
 const save=create('button','primary','Save board on device');save.type='button';
 actions.append(undo,clear,download,save);
 const feedback=create('p','tactics-editor-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 shell.append(top,desc,details,drawing,actions,feedback);editor.append(shell);document.body.append(editor);
 let database=null,session=null,generation=0,thumbs=[],image=null,pending=null,stroke=null;
 function openDb(){
  if(database)return Promise.resolve(database);
  return new Promise((resolve,reject)=>{
   if(!window.indexedDB){reject(Error('This browser does not support private tactics storage.'));return;}
   const req=indexedDB.open(DB,1);
   req.onupgradeneeded=()=>{
    if(!req.result.objectStoreNames.contains(STORE))
     req.result.createObjectStore(STORE,{keyPath:'id'});
   };
   req.onsuccess=()=>{
    database=req.result;database.onversionchange=()=>{database.close();database=null;};
    resolve(database);
   };
   req.onerror=()=>reject(req.error||Error('Cannot open tactics storage.'));
   req.onblocked=()=>reject(Error('Close other game tabs, then retry.'));
  });
 }
 function request(req){return new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Local storage request failed.'));
 });}
 async function readAll(){
  const db=await openDb(),tx=db.transaction(STORE,'readonly');
  const data=await request(tx.objectStore(STORE).getAll());
  return data.filter(x=>x&&typeof x.id==='string'&&/^[a-f0-9]{32}$/.test(x.id)&&
   x.snapshot instanceof Blob&&x.snapshot.size>0&&x.snapshot.size<=MAX_ONE&&
   Number.isSafeInteger(x.createdAt)&&x.createdAt>0&&x.createdAt<=Date.now()+86400000)
   .sort((a,b)=>b.createdAt-a.createdAt);
 }
 function mutate(callback){
  return openDb().then(db=>new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readwrite');
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Could not update board storage.'));
   tx.onabort=()=>reject(tx.error||Error('Board update cancelled.'));
   callback(tx.objectStore(STORE));
  }));
 }
 const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
 const validId=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 function revokeThumbs(){for(const url of thumbs)URL.revokeObjectURL(url);thumbs=[];}
 const safeTitle=x=>typeof x==='string'&&x.trim()?x.trim().slice(0,80):'Untitled tactics board';
 async function paintGallery(){
  const token=++generation;status.textContent='Loading private boards…';
  try{
   const boards=await readAll();
   if(token!==generation)return;
   revokeThumbs();gallery.replaceChildren();
   status.textContent=boards.length+' / '+MAX+' boards saved locally · '+Math.ceil(boards.reduce((n,x)=>n+x.snapshot.size,0)/1048576)+' MB of 48 MB';
   if(!boards.length){
    gallery.append(create('p','tactics-empty','No tactical boards yet. Open your own HBR2 replay, pause at a key moment and choose “Tactics board”.'));
    return;
   }
   for(const item of boards){
    const card=create('article','tactics-card');
    const preview=create('img','');
    preview.loading='lazy';preview.alt='Saved tactics frame: '+safeTitle(item.title);
    const url=URL.createObjectURL(item.snapshot);thumbs.push(url);preview.src=url;
    preview.title='Open Edit to inspect annotations on the full captured frame';
    const meta=create('div','tactics-card-content');
    const when=new Date(item.createdAt).toLocaleString();
    meta.append(create('strong','',safeTitle(item.title)),
     create('small','',when+' · '+(item.shapes?.length||0)+' drawing(s) · local frame'));
    const buttons=create('div','tactics-card-actions');
    const editButton=create('button','','✎ Edit');
    editButton.type='button';editButton.onclick=()=>openExisting(item).catch(err=>status.textContent=err.message);
    const exportButton=create('button','','↓ PNG');exportButton.type='button';
    exportButton.onclick=()=>openExisting(item,true).catch(err=>status.textContent=err.message);
    const remove=create('button','','Delete');remove.type='button';
    remove.onclick=async()=>{
     if(!confirm('Permanently delete this private tactics board? The original HBR2 replay will not be deleted.'))return;
     try{await mutate(store=>store.delete(item.id));await paintGallery();}
     catch(err){status.textContent=err.message||'Could not delete tactics board.';}
    };
    buttons.append(editButton,exportButton,remove);meta.append(buttons);card.append(preview,meta);gallery.append(card);
   }
  }catch(err){if(token===generation)status.textContent='Private board storage unavailable: '+(err.message||'Unknown error');}
 }
 async function imageFrom(blob){
  return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(blob),picture=new Image();
   picture.onload=()=>{URL.revokeObjectURL(url);resolve(picture);};
   picture.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Saved tactics frame cannot be decoded.'));};
   picture.src=url;
  });
 }
 function drawShape(ctx,shape){
  const w=ctx.canvas.width,h=ctx.canvas.height;
  const x1=shape.x1*w,y1=shape.y1*h,x2=shape.x2*w,y2=shape.y2*h;
  ctx.save();ctx.strokeStyle=shape.color;ctx.fillStyle=shape.color;
  ctx.lineWidth=Math.max(3,Math.round(w/300));ctx.lineCap='round';ctx.lineJoin='round';
  if(shape.type==='text'){
   ctx.font='bold '+Math.max(14,Math.round(w/40))+'px system-ui,sans-serif';
   ctx.lineWidth=4;ctx.strokeStyle='#15272d';ctx.strokeText(shape.text,x1,y1);
   ctx.fillText(shape.text,x1,y1);
  }else if(shape.type==='circle'){
   ctx.beginPath();ctx.ellipse((x1+x2)/2,(y1+y2)/2,
    Math.max(3,Math.abs(x2-x1)/2),Math.max(3,Math.abs(y2-y1)/2),0,0,Math.PI*2);ctx.stroke();
  }else{
   ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
   if(shape.type==='arrow'){
    const angle=Math.atan2(y2-y1,x2-x1),size=Math.max(13,w/44);
    ctx.beginPath();ctx.moveTo(x2,y2);
    ctx.lineTo(x2-Math.cos(angle-.48)*size,y2-Math.sin(angle-.48)*size);
    ctx.moveTo(x2,y2);
    ctx.lineTo(x2-Math.cos(angle+.48)*size,y2-Math.sin(angle+.48)*size);
    ctx.stroke();
   }
  }ctx.restore();
 }
 function repaint(){
  if(!image||!session)return;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  for(const shape of session.shapes)drawShape(ctx,shape);
  if(pending)drawShape(ctx,pending);
  undo.disabled=clear.disabled=!session.shapes.length;
 }
 function coordinates(event){
  const box=canvas.getBoundingClientRect();
  return{x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),
   y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};
 }
 const point=(v,x)=>Math.round(v[x]*10000)/10000;
 function shape(type,start,end){
  const x1=point(start,'x'),y1=point(start,'y'),x2=point(end,'x'),y2=point(end,'y');
  return{type,color:color.value,x1,y1,x2,y2,...(type==='text'?{text:textValue.value.trim().slice(0,28)}:{})};
 }
 async function openEditor(data){
  if(editor.open)editor.close();
  image=await imageFrom(data.snapshot);
  session={...data,shapes:Array.isArray(data.shapes)?data.shapes.slice(0,90):[]};
  pending=null;stroke=null;
  const aspect=Math.max(.3,Math.min(5,image.naturalWidth/image.naturalHeight));
  canvas.width=Math.min(1280,image.naturalWidth);
  canvas.height=Math.max(1,Math.round(canvas.width/aspect));
  name.value=safeTitle(data.title);mode.value='arrow';color.value='#eaf1a7';textValue.value='';
  repaint();feedback.textContent='Changes are private until you choose Save.';
  editor.showModal();
 }
 async function capture(){
  if(!replay||controls.hidden||!validId(activeLocalReplayId)){
   status.textContent='Open an HBR2 replay saved in My Games before capturing a board.';return;
  }
  const replayId=activeLocalReplayId,frameNo=Math.max(0,Math.round(replay.getTime()/1000*60));
  const stored=(await ReplayLibrary.list()).find(x=>x.id===replayId);
  if(!stored||!pitch.width||!pitch.height)throw Error('The current local replay or pitch is unavailable.');
  const oldSpeed=replay.getSpeed();replay.setSpeed(0);
  const width=Math.min(1280,pitch.width),height=Math.max(1,Math.round(width*pitch.height/pitch.width));
  const frozen=document.createElement('canvas');frozen.width=width;frozen.height=height;
  frozen.getContext('2d').drawImage(pitch,0,0,width,height);
  const snapshot=await new Promise((resolve,reject)=>frozen.toBlob(
   b=>b?resolve(b):reject(Error('Could not capture a frame.')),'image/png'));
  if(snapshot.size>MAX_ONE)throw Error('This frame is over the 4 MB board limit.');
  const data={id:randomId(),replayId,frameNo,title:(stored.name||'Replay').slice(0,45)+' · '+Math.floor(frameNo/60)+'s',
   createdAt:Date.now(),snapshot,shapes:[]};
  await openEditor(data);
  // The player requested an independent still; do not resume the replay.
  if(replay&&activeLocalReplayId===replayId){
   document.getElementById('replayToggle').textContent='▶';
   if(oldSpeed!==0)feedback.textContent='Replay paused. Saving this board does not change the original HBR2 file.';
  }
 }
 async function openExisting(item,exportOnly=false){
  await openEditor(item);
  if(exportOnly)download.click();
 }
 function saveBlob(blob,filename){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 close.onclick=()=>editor.close();
 undo.onclick=()=>{if(session?.shapes.length){session.shapes.pop();repaint();}};
 clear.onclick=()=>{
  if(!session?.shapes.length)return;
  if(!confirm('Clear this board’s drawn annotations? The captured image is preserved.'))return;
  session.shapes=[];repaint();
 };
 canvas.addEventListener('pointerdown',event=>{
  if(!session||event.button!==0)return;
  event.preventDefault();
  const start=coordinates(event),type=mode.value;
  if(type==='text'){
   if(!textValue.value.trim()){feedback.textContent='Enter a text label first.';return;}
   if(session.shapes.length>=90){feedback.textContent='Maximum 90 annotations per board.';return;}
   session.shapes.push(shape(type,start,start));repaint();return;
  }
  stroke={pointer:event.pointerId,start};
  canvas.setPointerCapture(event.pointerId);
  pending=shape(type,start,start);repaint();
 });
 canvas.addEventListener('pointermove',event=>{
  if(!stroke||stroke.pointer!==event.pointerId)return;
  pending=shape(mode.value,stroke.start,coordinates(event));repaint();
 });
 function endStroke(event){
  if(!stroke||stroke.pointer!==event.pointerId)return;
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  const finish=coordinates(event);
  const x=finish.x-stroke.start.x,y=finish.y-stroke.start.y;
  if(x*x+y*y>0.00008&&session.shapes.length<90)
   session.shapes.push(shape(mode.value,stroke.start,finish));
  else if(session.shapes.length>=90)feedback.textContent='Maximum 90 annotations per board.';
  stroke=null;pending=null;repaint();
 }
 canvas.addEventListener('pointerup',endStroke);
 canvas.addEventListener('pointercancel',()=>{
  stroke=null;pending=null;repaint();
 });
 download.onclick=()=>{
  if(!session)return;
  canvas.toBlob(blob=>{
   if(!blob){feedback.textContent='Could not encode annotated image.';return;}
   if(blob.size>MAX_ONE){feedback.textContent='Annotated PNG exceeds 4 MB. Simplify and try again.';return;}
   saveBlob(blob,'fuckball-tactics-'+session.id.slice(0,8)+'.png');
   feedback.textContent='Annotated PNG exported locally. Review visible player names before sharing.';
  },'image/png');
 };
 save.onclick=async()=>{
  if(!session||!session.snapshot)return;
  const titleValue=name.value.trim().replace(/\s+/g,' ').slice(0,80);
  if(!titleValue){feedback.textContent='Enter a title before saving.';name.focus();return;}
  save.disabled=true;
  try{
   const current=await readAll();
   const other=current.filter(x=>x.id!==session.id);
   if(other.length>=MAX||other.reduce((n,x)=>n+x.snapshot.size,0)+session.snapshot.size>MAX_BYTES)
    throw Error('Private boards are full (15 boards / 48 MB). Delete an older board first.');
   const saved={...session,title:titleValue,shapes:session.shapes.slice(0,90)};
   await mutate(store=>store.put(saved));
   session=saved;
   feedback.textContent='Saved locally. The original replay and online results were not changed.';
   await paintGallery();
  }catch(err){feedback.textContent=err.message||'Could not save tactics board.';}
  finally{save.disabled=false;}
 };
 editor.addEventListener('close',()=>{
  image=null;pending=null;stroke=null;session=null;
 });
 trigger.onclick=()=>capture().catch(error=>{
  const message=error.message||'Capture unavailable.';
  status.textContent=message;
  if(typeof notify==='function')notify(message);
 });
 refresh.onclick=paintGallery;
 document.getElementById('tabReplay')?.addEventListener('click',paintGallery);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!games.hidden)paintGallery();});

 // Portable backups of already-owned pitch drawings. Never inspect/upload
 // accounts, server match data, hidden invites or credentials.
 const backupButton=create('button','','↓ Backup boards · ZIP');
 const restoreButton=create('button','','↑ Restore boards · ZIP');
 backupButton.type=restoreButton.type='button';
 const chooser=document.createElement('input');chooser.type='file';chooser.accept='.zip,application/zip';chooser.hidden=true;
 chooser.setAttribute('aria-label','Choose a tactics board ZIP backup');
 panel.append(chooser);header.append(backupButton,restoreButton);
 const ZIP_LIMIT=56*1048576,INDEX_LIMIT=128*1024;
 function requireArchive(){
  if(typeof JSZip!=='function')throw Error('ZIP tools are not available in this browser.');
  if(!globalThis.crypto?.subtle)throw Error('HTTPS or localhost is required for secure ZIP integrity.');
 }
 function zipEntrySize(entry){
  const size=entry?._data?.uncompressedSize;
  if(!Number.isSafeInteger(size)||size<0)throw Error('Archive size cannot be verified.');
  return size;
 }
 async function digest(bytes){
  const sum=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...sum].map(x=>x.toString(16).padStart(2,'0')).join('');
 }
 function validateDrawing(raw){
  if(!Array.isArray(raw)||raw.length>90)throw Error('Invalid drawing collection.');
  const colors=new Set(['#eaf1a7','#f69a8c','#82c0fa','#ffffff']);
  return raw.map(x=>{
   if(!x||!['arrow','circle','line','text'].includes(x.type)||!colors.has(x.color)||
    ![x.x1,x.x2,x.y1,x.y2].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))
    throw Error('An imported annotation is invalid.');
   if(x.type==='text'&&
    (typeof x.text!=='string'||!x.text.trim()||x.text.length>28||
     /[\x00-\x1f\x7f]/.test(x.text)))
    throw Error('A text annotation is invalid.');
   return{x1:x.x1,y1:x.y1,x2:x.x2,y2:x.y2,type:x.type,color:x.color,
    ...(x.type==='text'?{text:x.text}:{})};
  });
 }
 function validateIndexItem(row){
  if(!row||!validId(row.id)||!validId(row.replayId)||
   typeof row.title!=='string'||!row.title.trim()||row.title.length>80||
   !Number.isSafeInteger(row.frameNo)||row.frameNo<0||row.frameNo>86400000||
   !Number.isSafeInteger(row.createdAt)||row.createdAt<=0||row.createdAt>Date.now()+86400000||
   row.path!=='frames/'+row.id+'.png'||!/^[0-9a-f]{64}$/.test(row.sha256)||
   !Number.isSafeInteger(row.size)||row.size<=0||row.size>MAX_ONE)
   throw Error('A tactics board metadata record is invalid.');
  return validateDrawing(row.shapes);
 }
 function isPng(bytes){
  if(bytes.length<24)return false;
  const signature=[137,80,78,71,13,10,26,10];
  if(!signature.every((v,i)=>bytes[i]===v))return false;
  const header=String.fromCharCode(...bytes.slice(12,16));
  if(header!=='IHDR')return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  return width>0&&height>0&&width<=4096&&height<=4096;
 }
 function setBackupBusy(value){backupButton.disabled=restoreButton.disabled=value;}
 async function exportBoards(){
  requireArchive();
  const boards=await readAll();
  if(!boards.length)throw Error('Save your first tactics board before making a backup.');
  if(boards.length>MAX||boards.reduce((n,x)=>n+x.snapshot.size,0)>MAX_BYTES)
   throw Error('Private boards exceed the portable backup limits.');
  const archive=new JSZip(),rows=[];
  for(let i=0;i<boards.length;i++){
   const x=boards[i],bytes=new Uint8Array(await x.snapshot.arrayBuffer());
   if(!isPng(bytes))throw Error('A saved tactics frame is not a valid PNG.');
   const shapes=validateDrawing(x.shapes);
   const meta={id:x.id,replayId:x.replayId,frameNo:x.frameNo,title:safeTitle(x.title),
    createdAt:x.createdAt,shapes,path:'frames/'+x.id+'.png',size:bytes.length,sha256:await digest(bytes)};
   validateIndexItem(meta);
   rows.push(meta);archive.file(meta.path,bytes,{binary:true,compression:'STORE',createFolders:false});
   status.textContent='Collecting private board '+(i+1)+' / '+boards.length+'…';
  }
  const json=JSON.stringify({format:'fuckball-local-tactics-boards',version:1,boards:rows});
  if(json.length>INDEX_LIMIT)throw Error('Tactics backup metadata is too large.');
  archive.file('manifest.json',json,{compression:'STORE'});
  const zip=await archive.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
  if(zip.size>ZIP_LIMIT)throw Error('ZIP backup exceeds 56 MB.');
  saveBlob(zip,'fuckball-tactics-backup-'+new Date().toISOString().slice(0,10)+'.zip');
  status.textContent='Private backup downloaded · '+boards.length+' boards. No cloud upload.';
 }
 async function importBoards(file){
  requireArchive();
  if(!file||file.size<=0||file.size>ZIP_LIMIT)
   throw Error('Choose a tactics backup ZIP under 56 MB.');
  const archive=await JSZip.loadAsync(await file.arrayBuffer());
  const index=archive.file('manifest.json');
  if(!index||zipEntrySize(index)>INDEX_LIMIT)throw Error('Not a supported tactics ZIP.');
  let data;
  try{data=JSON.parse(await index.async('string'));}
  catch{throw Error('Invalid backup manifest.');}
  if(data?.format!=='fuckball-local-tactics-boards'||data.version!==1||
   !Array.isArray(data.boards)||data.boards.length>MAX)
   throw Error('Unsupported or oversized tactics backup.');
  const allowed=new Set(['manifest.json']),ids=new Set();
  let declaredSize=0;
  for(const row of data.boards){
   validateIndexItem(row);
   if(ids.has(row.id))throw Error('Archive contains a duplicate board ID.');
   ids.add(row.id);allowed.add(row.path);
   const entry=archive.file(row.path);
   if(!entry||zipEntrySize(entry)!==row.size)throw Error('Tactics backup has an invalid frame size.');
   declaredSize+=row.size;
  }
  if(declaredSize>MAX_BYTES)throw Error('Tactics backup exceeds 48 MB.');
  if(Object.keys(archive.files).some(key=>!allowed.has(key)&&key!=='frames/'))
   throw Error('Unexpected files in tactics backup.');
  const existing=await readAll(),byId=new Map(existing.map(item=>[item.id,item]));
  const pending=[];let skipped=0;
  for(const row of data.boards){
   const bytes=await archive.file(row.path).async('uint8array');
   if(bytes.length!==row.size||!isPng(bytes)||await digest(bytes)!==row.sha256)
    throw Error('Backup integrity failed for '+safeTitle(row.title));
   if(byId.has(row.id)){
    const prior=new Uint8Array(await byId.get(row.id).snapshot.arrayBuffer());
    if(await digest(prior)!==row.sha256)throw Error('Conflicting tactics board ID. Existing board kept.');
    skipped++;continue;
   }
   const blob=new Blob([bytes],{type:'image/png'});
   // Decode with the browser before writing anything to IndexedDB.
   await imageFrom(blob);
   pending.push({id:row.id,replayId:row.replayId,frameNo:row.frameNo,
    title:row.title,createdAt:row.createdAt,shapes:validateDrawing(row.shapes),snapshot:blob});
   status.textContent='Verifying tactics frame '+(pending.length+skipped)+' / '+data.boards.length+'…';
  }
  if(existing.length+pending.length>MAX||
   existing.reduce((n,x)=>n+x.snapshot.size,0)+pending.reduce((n,x)=>n+x.snapshot.size,0)>MAX_BYTES)
   throw Error('Not enough room for these boards (15 items / 48 MB).');
  if(!pending.length){
   status.textContent='All '+skipped+' boards already exist on this device.';return;
  }
  if(!confirm('Restore '+pending.length+' private tactics board(s) without replacing '+existing.length+
   ' existing board(s)? PNG frames may display player-name labels.'))return;
  // One transaction: capacity/decoder/hash checks happen before any writes.
  await mutate(store=>{for(const item of pending)store.add(item);});
  await paintGallery();
  status.textContent='Restored '+pending.length+' private board(s)'+(skipped?' · '+skipped+' already here':'')+
   '. No original replay files or online data were changed.';
 }
 backupButton.onclick=async()=>{
  setBackupBusy(true);try{await exportBoards();}
  catch(error){status.textContent='Backup unavailable: '+(error.message||'Unknown error');}
  finally{setBackupBusy(false);}
 };
 restoreButton.onclick=()=>chooser.click();
 chooser.onchange=async()=>{
  const file=chooser.files?.[0];chooser.value='';if(!file)return;
  setBackupBusy(true);
  try{await importBoards(file);}
  catch(error){status.textContent='Restore refused: '+(error.message||'Invalid backup');}
  finally{setBackupBusy(false);}
 };

 paintGallery();
})();