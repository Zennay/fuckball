'use strict';
// Native HBR2 recording delivery. Reuses the sole approved sandbox recorder and
// ReplayLibrary's HBR2 parser/IndexedDB transaction; never creates online ranks.
(function(){
 const pane=document.getElementById('menuMatchPane');
 const match=document.getElementById('matchView');
 const recordButton=document.getElementById('recordButton');
 if(!pane||!match||!recordButton||typeof ReplayLibrary==='undefined')return;
 const KEY='fuckball.recording-studio.v1',MAX_FILE=32*1024*1024;
 const make=(tag,value,klass)=>{
  const e=document.createElement(tag);
  if(value!==undefined&&value!==null)e.textContent=String(value);
  if(klass)e.className=klass;
  return e;
 };
 const root=make('section',null,'recording-studio');
 root.setAttribute('aria-label','Private native recording studio');
 const heading=make('strong','RECORDING STUDIO · MY GAMES');
 const lead=make('p','Record the existing local engine as a genuine HBR2. Original HBR2 downloads are always kept. A cross-view recording reminder lets you return or download before navigating away; the browser may warn before closing a tab with unsaved footage. Saving a second private copy in My Games requires your explicit choice below. Never uploads or produces ranked results.');
 const choices=make('div',null,'recording-studio-choices');
 const autoLabel=make('label'),auto=make('input');auto.type='checkbox';
 autoLabel.append(auto,document.createTextNode(' Start recording automatically on each new offline kick-off'));
 const libraryLabel=make('label'),library=make('input');library.type='checkbox';
 libraryLabel.append(library,document.createTextNode(' Also save downloaded HBR2 recordings to My Games (optional)'));
 choices.append(autoLabel,libraryLabel);
 const actions=make('div',null,'recording-studio-actions');
 const toggle=make('button','● Start recording');
 const open=make('button','Open My Games ↗');
 const status=make('p','Manual recording remains available via ● Record.','recording-studio-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 for(const b of [toggle,open])b.type='button';
 actions.append(toggle,open);
 root.append(heading,lead,choices,actions,status);
 pane.append(root);
 // The original menu is hidden on Home / My Games. Keep the live offline
 // recording visible there so switching views cannot conceal an unsaved HBR2.
 const continuity=make('aside',null,'recording-studio-continuity');
 continuity.hidden=true;
 continuity.setAttribute('role','region');
 continuity.setAttribute('aria-label','Unsaved local match recording');
 const continuityCopy=make('div',null,'recording-studio-continuity-copy');
 const continuityTitle=make('strong','● LOCAL HBR2 RECORDING IN PROGRESS');
 const continuityStatus=make('p','Recording your current local match. Download before closing this tab.');
 continuityStatus.setAttribute('role','status');
 const continuityActions=make('div',null,'recording-studio-continuity-actions');
 const continuityReturn=make('button','↗ Return to pitch');
 const continuitySave=make('button','■ Stop & download HBR2');
 continuitySave.className='primary';
 for(const button of [continuityReturn,continuitySave])button.type='button';
 continuityActions.append(continuityReturn,continuitySave);
 continuityCopy.append(continuityTitle,continuityStatus);
 continuity.append(continuityCopy,continuityActions);
 document.body.append(continuity);
 const hud=make('aside',null,'recording-studio-hud');
 hud.hidden=true;hud.setAttribute('aria-label','Native HBR2 recording status');
 const badge=make('strong','● HBR2 RECORDING');
 const hint=make('span','Offline recording · private device');
 hud.append(badge,hint);match.append(hud);
 const read=()=>{
  try{
   const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
   return raw&&raw.version===1&&typeof raw.auto==='boolean'&&
    typeof raw.library==='boolean'?raw:{version:1,auto:false,library:false};
  }catch{return {version:1,auto:false,library:false};}
 };
 const preference=read();
 auto.checked=preference.auto;library.checked=preference.library;
 function persist(){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,auto:auto.checked,library:library.checked}));}
  catch{status.textContent='Browser storage unavailable. Preferences apply only until this tab closes.';}
 }
 function localGame(){
  return typeof serverLink!=='undefined'&&!serverLink&&
   typeof peerConnected!=='undefined'&&!peerConnected&&
   typeof replay!=='undefined'&&!replay&&
   typeof started!=='undefined'&&started&&!!room&&
   (typeof pendingSessionBlock!=='function'||!pendingSessionBlock())&&
   document.getElementById('joinScreen')?.hidden!==false&&
   !document.querySelector('.quick-ready:not([hidden])');
 }
 function recording(){return !!room&&typeof room.isRecording==='function'&&room.isRecording();}
 // Recording may still be active after the game stops naturally. Do not
 // require 'started' merely to finish and download already-captured frames.
 function ownedLocalRecording(){
  return recording()&&typeof serverLink!=='undefined'&&!serverLink&&
   typeof peerConnected!=='undefined'&&!peerConnected&&
   typeof replay!=='undefined'&&!replay;
 }
 function stopAndDownload(){
  if(!ownedLocalRecording())return false;
  // Original recorder owns HBR2 bytes, original download and optional
  // ReplayLibrary opt-in. No second recording/parser/save path.
  finishRecording();
  status.textContent='Original HBR2 download requested. Import in My Games if automatic saving is off.';
  refresh();
  return true;
 }
 continuityReturn.addEventListener('click',()=>{
  if(!ownedLocalRecording())return;
  document.getElementById('tabPlay')?.click();
  document.getElementById('gameCanvas')?.focus?.({preventScroll:true});
 });
 continuitySave.addEventListener('click',()=>stopAndDownload());
 window.addEventListener('beforeunload',event=>{
  if(!ownedLocalRecording())return;
  // Browser may show its standard unsaved-data confirmation. Never claim
  // pagehide/unload can complete a download reliably.
  event.preventDefault();event.returnValue='';
 });
 function refresh(){
  const active=recording(),offline=localGame(),owned=ownedLocalRecording();
  toggle.disabled=!offline&&!owned;
  toggle.textContent=active?'■ Stop & download HBR2':'● Start recording';
  hud.hidden=!active||!owned||match.hidden;
  continuity.hidden=!owned||!match.hidden;
  continuityStatus.textContent=typeof started!=='undefined'&&!started?
   'Match stopped, but your HBR2 is still unsaved. Download it now before closing this tab.':
   'The offline match is still recording. Return to pitch or stop & download your HBR2.';
  root.dataset.active=active?'yes':'no';
 }
 toggle.onclick=()=>{
  if(ownedLocalRecording()){stopAndDownload();return;}
  if(!localGame()){status.textContent='Manual recording here is only available in a local offline game.';return;}
  if(recordButton.disabled){status.textContent='Native recorder is unavailable for this session.';return;}
  recordButton.click();
  status.textContent=recording()?
   'Native recording in progress. Stop it to download its original HBR2.':
   'Recording stopped. The original HBR2 was downloaded when available.';
  refresh();
 };
 open.onclick=()=>document.getElementById('tabReplay')?.click();
 auto.onchange=()=>{persist();status.textContent=auto.checked?
  'Auto-record armed for your next offline kick-off. No active game was restarted.':
  'New offline games will not start recording automatically.';};
 library.onchange=()=>{persist();status.textContent=library.checked?
  'Finished HBR2 will download and also be saved to My Games when browser storage permits.':
  'Only the original HBR2 download will be generated.';};
 window.addEventListener('fuckball:local-match-kickoff',()=>{
  if(!auto.checked||!localGame()||recording()||recordButton.disabled)return;
  recordButton.click();
  refresh();
  status.textContent=recording()?
   'Automatically recording real native offline play. Original HBR2 download stays enabled.':
   'The native recorder did not start. Try the manual Record button.';
 });
 // An in-progress replay or room never triggers a background recording.
 let pending=Promise.resolve(),saving=0;
 // The native recorder still reports when local capture stops, but the
 // library receives a single completion event from the original download
 // function. Do not save again on this second signal.
 window.addEventListener('fuckball:native-hbr2-finished',refresh);
 window.addEventListener('fuckball:hbr2-downloaded',event=>{
  const detail=event.detail;
  refresh();
  if(!library.checked){
   status.textContent='Original HBR2 downloaded. Automatic My Games saving is off. Use Import in My Games whenever you want a local copy.';
   return;
  }
  // Server and offline native HBR2 downloads follow the same explicit
  // opt-in, one canonical ReplayLibrary.save transaction per download.
  if(!detail||!(detail.bytes instanceof Uint8Array)||!detail.bytes.byteLength||
   detail.bytes.byteLength>MAX_FILE){
   status.textContent='Original HBR2 downloaded. My Games did not save a copy because this exceeds the 32 MB per-file limit.';
   return;
  }
  if(saving>=2){
   status.textContent='Original HBR2 downloaded. Too many local saves are pending; import this file manually in My Games.';
   return;
  }
  // Copy only what the canonical recorder emitted; never simulate a replay.
  saving++;
  const bytes=detail.bytes,name=String(detail.name||'native-recording.hbr2').slice(0,100);
  status.textContent='Original HBR2 downloaded. Saving the native recording in My Games…';
  pending=pending.catch(()=>{}).then(async()=>{
   try{
    const item=await ReplayLibrary.save(bytes,name);
    status.textContent='Saved '+item.name+' in My Games ('+
     (item.size/1048576).toFixed(1)+' MB) · original HBR2 downloaded.';
    if(typeof window.Event==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new window.Event('fuckball:local-replay-library-change'));
    if(typeof renderMyGames==='function'&&
     document.getElementById('gamesView')?.hidden===false)await renderMyGames();
   }catch(error){
    status.textContent='Original HBR2 downloaded but My Games could not save: '+
     (error?.message||'Local storage unavailable')+'. Import the downloaded file later.';
   }finally{saving--;}
  });
 });
 window.setInterval(refresh,850);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 refresh();
})();
