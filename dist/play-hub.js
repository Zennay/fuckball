'use strict';
// Play Hub: explicit entry points into existing game modes, never a new queue,
// substitute server, ranked claim, or replacement for native consent checks.
(function(){
 const home=document.getElementById('homeView');
 const hero=home?.querySelector('.hero-grid');
 if(!home||!hero)return;
 const node=(tag,value,klass)=>{
  const el=document.createElement(tag);
  if(value!==undefined&&value!==null)el.textContent=String(value);
  if(klass)el.className=klass;
  return el;
 };
 const action=(label,click,klass)=>{
  const el=node('button',label,klass);el.type='button';
  el.addEventListener('click',click);return el;
 };
 const STORAGE='fuckball.play-hub.v1';
 const playlists=['1v1','2v2','3v3','4v4'];
 const chooseFromStorage=()=>{
  try{
   const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');
   return saved?.version===1&&playlists.includes(saved.mode)?saved.mode:'1v1';
  }catch{return '1v1';}
 };
 let playlist=chooseFromStorage();
 let nativeQueue={searching:false,ready:false,accepted:false,mode:null,waiting:0,needed:0,expiresAt:null};
 const heroFind=document.getElementById('heroFindMatch');
 const section=node('section',null,'play-hub');
 section.setAttribute('aria-label','Choose how to play Fuckball');
 const intro=node('header',null,'play-hub-header');
 const heading=node('div',null,'play-hub-heading');
 heading.append(node('span','START HERE · GAME MODES','play-hub-kicker'),
  node('h2','READY TO PLAY?'),
  node('p','Find a real human match, join a player room or train against local bots. The existing game controls remain in charge.'));
 const current=node('button','↗ Return to current game','play-hub-resume');
 current.type='button';current.hidden=true;
 current.addEventListener('click',()=>{
  document.getElementById('tabPlay')?.click();
  const end=document.getElementById('nextMatchPanel');
  if(end&&!end.hidden){
   end.scrollIntoView({block:'nearest',behavior:'auto'});
   const resume=end.querySelector('button:not([hidden]):not([disabled])');
   if(resume)resume.focus({preventScroll:true});
  }
 });
 intro.append(heading,current);
 const grid=node('div',null,'play-hub-grid');
 const human=node('article',null,'play-hub-card play-hub-human');
 const humanCopy=node('div');
 humanCopy.append(node('span','01 · ONLINE · REAL PLAYERS','play-hub-label'),
  node('h3','HUMAN QUICK MATCH'),
  node('p','Choose 1v1, 2v2, 3v3 or 4v4. Sign in, search and accept a match using the existing server-owned ready check. No bots or ranked rating.'));
 const modes=node('div',null,'play-hub-formats');
 modes.setAttribute('role','group');modes.setAttribute('aria-label','Preferred human Quick Match size');
 const modeButtons=new Map();
 const status=node('p','Choose your format, then open the real Quick Match controls.','play-hub-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const primary=action('Configure human Quick Match →',openQueue,'play-hub-primary');
 const queueNow=action('▶ Find 1v1 now',findHumanNow,'play-hub-queue-now');
 queueNow.title='Start the real human matchmaking queue with one deliberate click. Every player still has to accept the ready check.';
 for(const mode of playlists){
  const b=action(mode,()=>chooseMode(mode),'play-hub-format');
  b.setAttribute('aria-label',mode+' human Quick Match, '+(2*Number(mode[0]))+' total real players');
  modes.append(b);modeButtons.set(mode,b);
 }
 human.append(humanCopy,modes,queueNow,primary);
 const rooms=node('article',null,'play-hub-card');
 rooms.append(node('span','02 · ONLINE · CUSTOM ROOM','play-hub-label'),
  node('h3','PLAY WITH FRIENDS'),
  node('p','Browse host-published rooms or explicitly create your own. Existing room permissions, login rules and private invitations are enforced by the server.'));
 const roomActions=node('div',null,'play-hub-actions');
 roomActions.append(
  action('Browse rooms',()=>openSection('.room-browser','No public room browser is available here.','Public room browser opened.'),'play-hub-secondary'),
  action('Join by invite',()=>{
   const state=activeState();
   if(state.server||state.pending||state.peer||state.inQueue||state.ready)
    return announce('Leave your active room or cancel your human matchmaking queue before joining another room.');
   openSection('.direct-invite-join','The invitation form is unavailable.',
    'Paste an invite URL or room code, then confirm the join. Only the server can admit you.');
  },'play-hub-secondary'),
  action('Create a room',()=>{
   if(!canSwitch('create a room'))return;
   const b=document.getElementById('quickOnline');
   if(!b||b.disabled)return announce('Creating a room is unavailable.');
   if(!startNativeCustomRoom(true))return announce('Existing room setup was not started.');
   announce('Opening existing room creation controls.');
  },'play-hub-secondary')
 );
 rooms.append(roomActions);
 const practice=node('article',null,'play-hub-card');
 practice.append(node('span','03 · LOCAL · NO ACCOUNT REQUIRED','play-hub-label'),
  node('h3','PRACTISE NOW'),
  node('p','Play against local AI with the original engine. These modes never send you into human matchmaking.'));
 const practiceActions=node('div',null,'play-hub-actions');
 practiceActions.append(
  action('▶ Solo 1v1',()=>startLocal('quickPractice','solo training'),'play-hub-secondary'),
  action('▶ Local 4v4',()=>startLocal('quickSquad','local 4v4'),'play-hub-secondary')
 );
 practice.append(practiceActions);
 const library=node('article',null,'play-hub-card');
 library.append(node('span','04 · ON YOUR DEVICE','play-hub-label'),
  node('h3','REWATCH & IMPROVE'),
  node('p','Open genuine recordings and your local practice tools. Replays are not proof of a server-ranked result.'));
 const libraryActions=node('div',null,'play-hub-actions');
 libraryActions.append(
  action('My Games →',()=>document.getElementById('tabReplay')?.click(),'play-hub-secondary'),
  action('Practice Lab',()=>openSection('.practice-lab','Practice Lab is unavailable.','Practice Lab opened.'),'play-hub-secondary')
 );
 library.append(libraryActions);
 grid.append(human,rooms,practice,library);
 const footer=node('div',null,'play-hub-footer');
 const hint=node('span','Online matchmaking needs a live server and human consent. Training is local.','play-hub-hint');
 const network=node('span',null,'play-hub-network');
 footer.append(hint,network);
 section.append(intro,grid,status,footer);
 hero.insertAdjacentElement('afterend',section);
 function activeState(){
  // Never infer queue/match ownership from personal settings or browser online status.
  const server=typeof serverLink!=='undefined'&&!!serverLink?.room;
  const pending=typeof serverLink!=='undefined'&&!!serverLink&&!serverLink.room&&!serverLink.quickMatchMode;
  const peer=typeof peerConnected!=='undefined'&&!!peerConnected;
  const inQueue=!!home.querySelector('.quick-queue-actions button:not([hidden])');
  const ready=!!home.querySelector('.quick-ready:not([hidden])');
  const local=typeof started!=='undefined'&&!!started;
  const playingReplay=typeof replay!=='undefined'&&!!replay;
  return {server,pending,peer,inQueue,ready,local,playingReplay};
 }
 function announce(message){status.textContent=message;}
 function canSwitch(what){
  const state=activeState();
  if(state.pending)return void announce('An online room is still connecting. Cancel that connection explicitly before you '+what+'.');
  if(state.server||state.peer)
   return void announce('You are connected to a live room. Return to the match and leave it explicitly before you '+what+'.');
  if(state.inQueue||state.ready)
   return void announce('Finish or cancel the existing human search/ready check before you '+what+'.');
  if(state.local||state.playingReplay){
   if(!window.confirm('Leave your current local game or replay to '+what+'? Unsaved progress may be lost.'))return false;
  }
  return true;
 }
 function startLocal(id,name){
  if(!canSwitch('start '+name))return;
  const b=document.getElementById(id);
  if(!b||b.disabled)return announce(name+' is unavailable.');
  if(!quickPlay(id==='quickSquad'?'4v4':'bot',true)){
   announce(name+' could not start; the prior session remains.');return;
  }
  announce('Opened '+name+' via the original local game controls.');
 }
 function reveal(target){
  const details=target.matches('details')?target:target.querySelector('details');
  if(details)details.open=true;
  target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});
  const control=target.querySelector('button:not([disabled]):not([hidden]),summary,input,select');
  if(control)control.focus({preventScroll:true});
 }
 function openSection(selector,error,success){
  const target=home.querySelector(selector);
  if(!target)return announce(error);
  reveal(target);announce(success);
 }
 function openQueue(){
  const state=activeState();
  if(state.server||state.pending||state.peer||state.local||state.playingReplay)
   return announce('A room is connecting or a game is open. Finish or leave it before searching for humans.');
  if(state.inQueue||state.ready)return openSection('.quick-queue-panel',
   'The existing human queue is unavailable.','Returning to your ongoing search or ready check.');
  const native=home.querySelector('.quick-queue-panel');
  if(!native)return announce('The real human matchmaking controls are not available.');
  const preferred=native.querySelector('select[aria-label="Preferred human Quick Match format"]');
  if(preferred){
   preferred.value=playlist;
   preferred.dispatchEvent(new Event('change',{bubbles:true}));
  }
  reveal(native);
  announce('Ready to search for '+playlist+'. Choose the native Find Match button to join; no search has started yet.');
 }
 function findHumanNow(){
  const state=activeState();
  // This is a real, deliberate click from the player: forward it to the
  // existing native consent button, with exactly the same expiry/disabled gate.
  if(nativeQueue.ready){
   const box=home.querySelector('.quick-ready:not([hidden])');
   const accept=box?.querySelector('.quick-ready-actions button.primary');
   if(!nativeQueue.accepted&&accept&&!accept.disabled&&
      Number.isSafeInteger(nativeQueue.expiresAt)&&Date.now()<nativeQueue.expiresAt){
    accept.click();reveal(box);
    announce('You confirmed the '+nativeQueue.mode+' match using the server-owned ready check. Waiting for all real players.');
   }else if(box){
    reveal(box);
    announce(nativeQueue.accepted?'You are ready. The other human players still need to confirm.':
     'This ready check has expired. Follow the native match status to retry.');
   }else announce('The ready check is no longer available.');
   return;
  }
  if(state.server||state.pending||state.peer||state.local||state.playingReplay)
   return announce('Finish or cancel your connecting room, game or replay before starting human Quick Match.');
  if(state.inQueue||state.ready||nativeQueue.searching)
   return openSection('.quick-queue-panel','The human queue is unavailable.',
    'An existing search is active. You can cancel it there; no duplicate search was started.');
  const native=home.querySelector('.quick-queue-panel');
  const preferred=native?.querySelector('select[aria-label="Preferred human Quick Match format"]');
  const start=native?.querySelector('.quick-queue-shortcut-actions button.primary');
  // Never synthesize a network request, bypass the server-owned queue, or accept ready.
  if(!native||!preferred||!start||start.disabled)
   return openQueue();
  if(!settings.account?.token||!document.getElementById('serverAddress')?.value.trim()){
   openQueue();
   return announce('Sign in and choose a live multiplayer server before starting. The native Quick Match controls are open.');
  }
  preferred.value=playlist;
  preferred.dispatchEvent(new Event('change',{bubbles:true}));
  start.click();
  reveal(native);
  announce('Requested a real '+playlist+' human search through the native server queue. Every human must still accept the ready check.');
 }
 function chooseMode(mode){
  if(!playlists.includes(mode))return;
  playlist=mode;
  for(const [id,b] of modeButtons){
   const active=id===mode;
   b.classList.toggle('selected',active);
   b.setAttribute('aria-pressed',String(active));
  }
  primary.textContent='Configure '+mode+' human match →';
  queueNow.textContent='▶ Find '+mode+' now';
  const state=activeState();
  if(state.inQueue||state.ready){
   announce('You selected '+mode+' for next time. Your current queue or ready check was not changed.');
  }else announce('Selected '+mode+' · '+(2*Number(mode[0]))+' real players total. Open Quick Match to choose when to search.');
  try{localStorage.setItem(STORAGE,JSON.stringify({version:1,mode}));}
  catch{announce('Selected '+mode+' for this visit. Private browser preferences could not be saved.');}
 }
 function refresh(){
  const state=activeState();
  const postGame=!!document.getElementById('nextMatchPanel')&&!document.getElementById('nextMatchPanel').hidden;
  if(nativeQueue.ready){
   const remaining=Math.max(0,Math.ceil((nativeQueue.expiresAt-Date.now())/1000));
   queueNow.textContent=nativeQueue.accepted?'✓ Ready · waiting for players':
    '✓ Accept '+nativeQueue.mode+' match · '+remaining+'s';
   queueNow.disabled=nativeQueue.accepted||remaining===0;
  }else if(nativeQueue.searching||state.inQueue){
   queueNow.textContent='↗ View current human search';queueNow.disabled=false;
  }else if(state.server||state.peer||state.local||state.playingReplay){
   queueNow.textContent='↗ Return to current game';queueNow.disabled=false;
  }else{
   queueNow.textContent='▶ Find '+playlist+' now';queueNow.disabled=false;
  }
  if(heroFind){
   const label=nativeQueue.ready?(nativeQueue.accepted?'WAITING FOR PLAYERS':
     'ACCEPT MATCH · '+Math.max(0,Math.ceil((nativeQueue.expiresAt-Date.now())/1000))+'s'):
    nativeQueue.searching||state.inQueue?'VIEW CURRENT SEARCH':
    state.server||state.peer||state.local||state.playingReplay?'RETURN TO GAME':
    'FIND A QUICK MATCH';
   if(heroFind.dataset.playStateLabel!==label){heroFind.textContent=label+' ↗';heroFind.dataset.playStateLabel=label;}
   heroFind.disabled=nativeQueue.ready&&nativeQueue.accepted;
  }
  current.hidden=!(state.server||state.peer||state.local||state.playingReplay);
  if(state.server||state.peer){
   current.textContent=postGame?'↗ Review result / rematch':'↗ Return to online room';
   network.textContent='● ONLINE ROOM ACTIVE';
  }else if(state.pending){
   network.textContent='● CONNECTING TO ONLINE ROOM';
  }else if(nativeQueue.ready){
   network.textContent=nativeQueue.accepted?'● READY · WAITING FOR OTHER PLAYERS':
    '● ACTION NEEDED · CONFIRM HUMAN MATCH';
  }else if(nativeQueue.searching||state.inQueue){
   network.textContent='● HUMAN SEARCH · '+nativeQueue.waiting+' OF '+nativeQueue.needed+' AVAILABLE';
  }else if(state.local||state.playingReplay){
   current.textContent='↗ Return to '+(state.playingReplay?'replay':'local game');
   network.textContent='● LOCAL GAME ACTIVE';
  }else{
   network.textContent=navigator.onLine?'● ONLINE CONNECTION REPORTED':'● BROWSER REPORTS OFFLINE';
  }
 }
 // Keep one obvious, context-aware action at the very top. During a game
 // or an active search it cannot start another queue or silently abandon play.
 // Idle clicks still go through the original hero control unchanged.
 heroFind?.addEventListener('click',event=>{
  const state=activeState();
  if(nativeQueue.ready||nativeQueue.searching||state.inQueue||
     state.server||state.pending||state.peer||state.local||state.playingReplay){
   event.preventDefault();event.stopImmediatePropagation();
   if(state.server||state.peer||state.local||state.playingReplay){
    current.click();
   }else if(state.pending){
    announce('Connecting to the server. Keep this connection or cancel it in the native online controls.');
   }else findHumanNow();
  }
 },true);
 window.addEventListener('fuckball:quick-match-state',event=>{
  const data=event.detail;
  if(!data||typeof data.searching!=='boolean'||typeof data.ready!=='boolean')return;
  const newlyReady=data.ready&&!nativeQueue.ready;
  const newlyAccepted=data.accepted&&!nativeQueue.accepted;
  nativeQueue=data;
  if(newlyReady){
   announce('MATCH FOUND · '+data.mode+'. All real players must explicitly confirm before '+new Date(data.expiresAt).toLocaleTimeString()+'.');
   if(!document.hidden&&!home.hidden){
    const box=home.querySelector('.quick-ready:not([hidden])');
    if(box){
     box.scrollIntoView({block:'center',behavior:'auto'});
     box.querySelector('.quick-ready-actions button.primary:not([disabled])')?.focus({preventScroll:true});
    }
   }
  }else if(newlyAccepted)announce('Ready confirmed. Waiting for every other real player to accept.');
  refresh();
 });
 const observer=new MutationObserver(()=>refresh());
 const match=document.getElementById('matchView');
 if(match)observer.observe(match,{attributes:true,attributeFilter:['hidden']});
 const q=home.querySelector('.quick-queue-panel');
 if(q)observer.observe(q,{subtree:true,attributes:true,attributeFilter:['hidden']});
 window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
 document.getElementById('tabHome')?.addEventListener('click',refresh);
 document.getElementById('tabPlay')?.addEventListener('click',refresh);
 window.addEventListener('focus',refresh);
 chooseMode(playlist);refresh();
})();