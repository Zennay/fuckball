'use strict';
// Installable local-practice experience. Online rooms, matchmaking, Club
// features and account history remain server-only, never simulated offline.
(function(){
 const home=document.getElementById('homeView');
 const cards=home?.querySelector('.mode-cards');
 if(!cards)return;
 const panel=document.createElement('section');
 panel.className='pwa-panel';panel.setAttribute('aria-label','Install and offline practice');
 const heading=document.createElement('div');heading.className='pwa-heading';
 const title=document.createElement('strong');title.textContent='PLAY ANYWHERE.';
 const network=document.createElement('span');network.className='pwa-network';
 network.setAttribute('role','status');network.setAttribute('aria-live','polite');
 heading.append(title,network);
 const description=document.createElement('p');
 description.textContent='Install Fuckball for quick access and offline solo practice. Your own downloaded HBR2 replays stay on this device. Online matches, friends, results and accounts always require the actual server.';
 const actions=document.createElement('div');actions.className='pwa-actions';
 const install=document.createElement('button');install.type='button';
 install.className='primary';install.textContent='↓ Install Fuckball';install.hidden=true;
 const local=document.createElement('button');local.type='button';
 local.textContent='▶ Practice 1v1';
 const squad=document.createElement('button');squad.type='button';
 squad.textContent='Play local 4v4';
 actions.append(install,local,squad);
 // These game launchers are separate from the human Quick Match queue.
 // Never interrupt a server room, direct-peer match or pending human ready check.
 const launchNotice=document.createElement('p');launchNotice.className='pwa-launch-notice';
 launchNotice.setAttribute('role','status');launchNotice.setAttribute('aria-live','polite');
 // Attached with the other panel content below.
 function onlineConflict(){
  if(typeof serverLink!=='undefined'&&serverLink)
   return serverLink.room?'Leave your active native online room explicitly before starting offline practice.':
    'An online connection or human search is in progress. Cancel it explicitly before practising.';
  if(typeof peerConnected!=='undefined'&&peerConnected)
   return 'Disconnect from your current peer room before starting offline practice.';
  if(typeof serverLink!=='undefined'&&serverLink?.quickMatchMode)
   return 'Cancel your existing human Quick Match search or ready check first.';
  if(document.querySelector('.quick-queue-actions button:not([hidden])')||
     document.querySelector('.quick-ready:not([hidden])'))
   return 'Cancel the active human queue or ready check before practising.';
  if(document.getElementById('joinScreen')?.hidden===false)
   return 'Close your open room invitation before starting a local match.';
  return null;
 }
 function beginPractice(id,description){
  const conflict=onlineConflict();
  if(conflict){launchNotice.textContent=conflict;return;}
  const control=document.getElementById(id);
  if(!control||control.disabled){launchNotice.textContent=description+' cannot start right now. Use the original game controls.';return;}
  // Opening another local mode may end an in-progress solo game or replay.
  // The player decides whether to discard that local session.
  if(document.getElementById('matchView')?.hidden===false&&
      ((typeof started!=='undefined'&&started)||(typeof replay!=='undefined'&&replay))&&
      !window.confirm('Leave the current local game or replay to start '+description+'? Unsaved local progress may be lost.'))return;
  if(!quickPlay(id==='quickSquad'?'4v4':'bot',true)){
   launchNotice.textContent='The original local game did not start; your existing session was kept.';return;
  }
  launchNotice.textContent='Opened '+description+' using the existing local game controls. No human matchmaking was started.';
 }
 local.onclick=()=>beginPractice('quickPractice','local 1v1 practice');
 squad.onclick=()=>beginPractice('quickSquad','local 4v4 practice');
 const setup=document.createElement('p');setup.className='pwa-setup';
 setup.setAttribute('role','status');setup.setAttribute('aria-live','polite');
 setup.textContent='Offline availability is being prepared on this device…';
 const offline=document.createElement('section');offline.className='pwa-offline-readiness';
 const offlineHeading=document.createElement('strong');offlineHeading.textContent='OFFLINE PACK & UPDATES';
 const offlineStatus=document.createElement('p');offlineStatus.setAttribute('role','status');
 offlineStatus.setAttribute('aria-live','polite');
 offlineStatus.textContent='Checking device files…';
 const offlineActions=document.createElement('div');offlineActions.className='pwa-offline-actions';
 const inspect=document.createElement('button');inspect.type='button';inspect.textContent='Check saved files';
 const checkUpdate=document.createElement('button');checkUpdate.type='button';checkUpdate.textContent='Check for new version';
 const reload=document.createElement('button');reload.type='button';reload.textContent='Reload newest version';
 reload.hidden=true;
 offlineActions.append(inspect,checkUpdate,reload);
 offline.append(offlineHeading,offlineStatus,offlineActions);
 const help=document.createElement('details');help.className='pwa-help';
 const summary=document.createElement('summary');summary.textContent='How do I install it?';
 const tip=document.createElement('p');
 tip.textContent='When an Install button appears here, use it. On iPhone/iPad, use Share → Add to Home Screen in Safari. On other browsers, look for Install or Add to Home Screen in the browser menu. Play online only when connected to a Fuckball game server.';
 help.append(summary,tip);
 panel.append(heading,description,actions,launchNotice,setup,offline,help);
 cards.insertAdjacentElement('afterend',panel);
 let pending=null,ready=false,registered=null,newVersion=false,installed=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
 const update=()=>{
  network.textContent=navigator.onLine?'● NETWORK AVAILABLE':'● OFFLINE · LOCAL PRACTICE';
  network.classList.toggle('offline',!navigator.onLine);
  install.hidden=installed||!pending;
 };
 window.addEventListener('online',update);
 window.addEventListener('offline',update);
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();pending=event;update();
 });
 window.addEventListener('appinstalled',()=>{
  installed=true;pending=null;setup.textContent='Fuckball installed. Offline practice is available after its files have been saved.';update();
 });
 install.onclick=async()=>{
  if(!pending)return;
  const event=pending;pending=null;update();
  try{
   await event.prompt();
   const outcome=await event.userChoice;
   if(outcome?.outcome!=='accepted')setup.textContent='You can install Fuckball later from this page or the browser menu.';
  }catch{setup.textContent='Installation not available here. Try the browser’s Add to Home Screen option.';}
 };
 update();
 // An offline pack is playable only when *all* of its saved HTML's
 // startup scripts and styles are present, not merely six handpicked files.
 // Never inspect or cache online rooms, accounts, invites, or API responses.
 const essential=['./','app.js','room-core.js','vendor/haxball.js','ai/policy.js','replay-library.js'];
 async function inspectCache(){
  if(!('caches' in window)){offlineStatus.textContent='Cache inspection is not supported here.';return;}
  try{
   const names=(await caches.keys()).filter(x=>/^fuckball-offline-practice-v[0-9]+$/.test(x))
    .sort((a,b)=>Number(b.split('-v').pop())-Number(a.split('-v').pop()));
   if(!names.length){offlineStatus.textContent='No offline practice pack stored on this device.';return;}
   const cache=await caches.open(names[0]);
   const scope=new URL('./',registered?.scope||location.href);
   const shell=await cache.match(scope.href);
   if(!shell){offlineStatus.textContent='Offline game shell is missing. Reconnect to reinstall local practice.';return;}
   // DOMParser constructs an inert document; no scripts execute and no
   // additional network fetch is made while reading cached markup.
   if(typeof DOMParser!=='function'){
    offlineStatus.textContent='This browser cannot verify the complete offline game pack.';
    return;
   }
   const markup=new DOMParser().parseFromString(await shell.text(),'text/html');
   const required=new Set(essential.map(path=>new URL(path,scope).href));
   for(const node of markup.querySelectorAll('script[src],link[rel~="stylesheet"][href]')){
    const file=node.getAttribute(node.tagName.toLowerCase()==='script'?'src':'href');
    if(!file)continue;
    const url=new URL(file,scope);
    if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||
       url.search||url.hash||!(/\.(?:js|css)$/i.test(url.pathname)))continue;
    required.add(url.href);
   }
   // Bound the work for malformed or unexpectedly huge cached HTML.
   if(required.size>400){
    offlineStatus.textContent='Unexpected offline game bundle. Reconnect to refresh the installation.';
    return;
   }
   const files=[...required],found=await Promise.all(files.map(url=>cache.match(url)));
   const missing=files.filter((_,i)=>!found[i]);
   if(!missing.length){
    offlineStatus.textContent='Offline game is ready ('+files.length+'/'+files.length+
     ' startup files saved). Local matches and your own downloaded replays can start without internet; online rooms still need the server.';
   }else{
    const names=missing.slice(0,3).map(url=>decodeURIComponent(new URL(url).pathname.split('/').pop()));
    offlineStatus.textContent='Offline pack incomplete ('+(files.length-missing.length)+'/'+
     files.length+' startup files). Missing '+names.join(', ')+
     (missing.length>3?' and '+(missing.length-3)+' more':'')+
     '. Reconnect, check for updates, and reopen Fuckball before starting offline.';
   }
  }catch{
   offlineStatus.textContent='Browser storage cannot be inspected; offline readiness is unverified.';
  }
 }
 function safeToReload(){
  // Do not interrupt a match, native room, Quick Match search or ready check.
  if(!document.getElementById('matchView')?.hidden||
      (typeof peerConnected!=='undefined'&&peerConnected)||
      (typeof serverLink!=='undefined'&&!!serverLink)||
      document.querySelector('.quick-queue-actions button:not([hidden])')||
      document.querySelector('.quick-ready:not([hidden])'))return false;
  return !document.hidden;
 }
 inspect.addEventListener('click',inspectCache);
 checkUpdate.addEventListener('click',async()=>{
  if(!registered){offlineStatus.textContent='Offline service is not ready to check updates.';return;}
  checkUpdate.disabled=true;offlineStatus.textContent='Checking the public offline package…';
  try{await registered.update();await inspectCache();
   if(!newVersion)offlineStatus.textContent+=' No new version confirmed yet.';}
  catch{offlineStatus.textContent='Could not check for updates. Keep a connection and try again.';}
  finally{checkUpdate.disabled=false;}
 });
 reload.addEventListener('click',()=>{
  if(!newVersion)return;
  if(!safeToReload()){
   offlineStatus.textContent='Finish your active game or queue before reloading. No match was interrupted.';return;
  }
  if(window.confirm('Reload Fuckball to use the updated offline package?'))location.reload();
 });
 if('serviceWorker'in navigator){
  const hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
   if(hadController){newVersion=true;reload.hidden=false;
    offlineStatus.textContent='New offline package activated. Reload from Home when you are not in a match or queue.';}
   else inspectCache();
  });
 }
 if(!('serviceWorker'in navigator)||!window.isSecureContext){
  setup.textContent='Offline files need HTTPS or localhost. You can still play normally with a connection.';
  return;
 }
 navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
  registered=reg;
  return navigator.serviceWorker.ready;
 }).then(()=>{
  ready=true;
  setup.textContent='Offline registration is active. Check the saved pack below for local practice readiness.';
  return inspectCache();
 }).catch(()=>{
  setup.textContent='Offline preparation is unavailable right now. Keep a connection to load the game.';
 });
})();
