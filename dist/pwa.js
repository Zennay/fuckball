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
 local.textContent='▶ Practice 1v1';local.onclick=()=>document.getElementById('quickMatch')?.click();
 const squad=document.createElement('button');squad.type='button';
 squad.textContent='Play local 4v4';squad.onclick=()=>document.getElementById('quickSquad')?.click();
 actions.append(install,local,squad);
 const setup=document.createElement('p');setup.className='pwa-setup';
 setup.setAttribute('role','status');setup.setAttribute('aria-live','polite');
 setup.textContent='Offline availability is being prepared on this device…';
 const help=document.createElement('details');help.className='pwa-help';
 const summary=document.createElement('summary');summary.textContent='How do I install it?';
 const tip=document.createElement('p');
 tip.textContent='When an Install button appears here, use it. On iPhone/iPad, use Share → Add to Home Screen in Safari. On other browsers, look for Install or Add to Home Screen in the browser menu. Play online only when connected to a Fuckball game server.';
 help.append(summary,tip);
 panel.append(heading,description,actions,setup,help);
 cards.insertAdjacentElement('afterend',panel);
 let pending=null,ready=false,installed=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
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
 if(!('serviceWorker'in navigator)||!window.isSecureContext){
  setup.textContent='Offline files need HTTPS or localhost. You can still play normally with a connection.';
  return;
 }
 navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(()=>{
  return navigator.serviceWorker.ready;
 }).then(()=>{
  ready=true;
  setup.textContent='Offline solo practice prepared. Matchmaking, private rooms and account data always need a connection.';
 }).catch(()=>{
  setup.textContent='Offline preparation is unavailable right now. Keep a connection to load the game.';
 });
})();
