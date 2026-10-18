'use strict';
// Human-only Quick Match discovery. Search is never a bot simulation or ranked
// season, and the client cannot award ratings or start its own match.
(function(){
 const home=$('homeView');
 if(!home)return;
 const panel=document.createElement('section');panel.className='quick-queue-panel';
 panel.setAttribute('aria-label','Human Quick Match');
 const heading=document.createElement('div');heading.className='quick-queue-heading';
 const title=document.createElement('h2');title.textContent='QUICK MATCH.';
 const badge=document.createElement('span');badge.textContent='REAL PEOPLE · CASUAL';badge.className='quick-queue-badge';
 heading.append(title,badge);
 const description=document.createElement('p');
 description.textContent='Find real players on this server in 1v1–4v4. Teams are balanced using server career results, with a preference for similarly sized friend parties. No filler bots or ranked ratings.';
 const modes=document.createElement('div');modes.className='quick-queue-modes';
 const modeButtons=[],modeDetails=new Map();
 const availability=document.createElement('p');availability.className='quick-queue-availability';
 availability.setAttribute('role','status');availability.setAttribute('aria-live','polite');
 availability.textContent='Live queue occupancy is loading · this server only; no estimated wait times.';
 const notice=document.createElement('p');notice.className='quick-queue-status';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 notice.textContent='Sign in with a Fuckball account to search for a match.';
 const actions=document.createElement('div');actions.className='quick-queue-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='× Cancel search';cancel.hidden=true;
 actions.append(cancel);
 const readyBox=document.createElement('section');readyBox.className='quick-ready';readyBox.hidden=true;
 readyBox.setAttribute('aria-label','Match ready check');
 const readyTitle=document.createElement('h3');readyTitle.textContent='MATCH FOUND.';
 const readyText=document.createElement('p');readyText.textContent='Confirm to play with real people.';
 const readyProgress=document.createElement('p');readyProgress.className='quick-ready-progress';
 readyProgress.setAttribute('role','status');readyProgress.setAttribute('aria-live','polite');
 const readyActions=document.createElement('div');readyActions.className='quick-ready-actions';
 const acceptReady=document.createElement('button');acceptReady.type='button';
 acceptReady.className='primary';acceptReady.textContent='✓ I’m ready';
 const declineReady=document.createElement('button');declineReady.type='button';declineReady.textContent='Decline';
 readyActions.append(acceptReady,declineReady);
 readyBox.append(readyTitle,readyText,readyProgress,readyActions);
 panel.append(heading,description,modes,availability,notice,readyBox,actions);
 const cards=home.querySelector('.mode-cards')||home;
 cards.insertAdjacentElement('afterend',panel);
 let searching=false,matchMode=null,queuedAt=0,clock=null,waiting=0,needed=0;
 let ready=null,readyAccepted=false;
 function refresh(){
  modeButtons.forEach(b=>b.disabled=searching);
  cancel.hidden=!searching;
  readyBox.hidden=!ready;
  if(ready){
   const remain=Math.max(0,Math.ceil((ready.expiresAt-Date.now())/1000));
   readyText.textContent='All '+ready.players+' human players must confirm. Casual '+ready.mode+', no ranked rating.';
   readyProgress.textContent=ready.ready+' / '+ready.players+' confirmed · '+remain+
    's left'+(readyAccepted?' · You’re ready. Waiting for others.':'');
   acceptReady.disabled=readyAccepted||remain===0;
   declineReady.disabled=remain===0;
   notice.textContent='Your proposed match is waiting for every player to accept.';
  }else if(searching&&queuedAt){
   const duration=Math.max(0,Math.floor((Date.now()-queuedAt)/1000));
   notice.textContent='Searching for '+matchMode+' · '+waiting+' of '+needed+
    ' human players available · '+duration+'s elapsed. No bots will be added.';
  }
 }
 function stopClock(){if(clock){clearInterval(clock);clock=null;}}
 function done(message){
  searching=false;matchMode=null;ready=null;readyAccepted=false;stopClock();refresh();notice.textContent=message;
 }
 function start(mode,party=false){
  if(searching)return;
  if(serverLink?.room){notice.textContent='Leave your current room before starting another match.';return;}
  if(!settings.account?.token){
   notice.textContent='Log in or create a free account, then select a playlist.';
   showJoinScreen('');return;
  }
  if(!$('serverAddress').value.trim()){
   notice.textContent='Connect to a Fuckball multiplayer server to find human opponents.';return;
  }
  searching=true;matchMode=mode;ready=null;readyAccepted=false;queuedAt=Date.now();waiting=1;needed=Number(mode[0])*2;
  refresh();stopClock();clock=setInterval(refresh,1000);
  connectServer(false,'','',null,mode,party);
 }
 for(const mode of ['1v1','2v2','3v3','4v4']){
  const b=document.createElement('button');b.type='button';b.className='quick-queue-mode';
  const name=document.createElement('strong');name.textContent=mode;
  const sub=document.createElement('small');
  sub.textContent=(Number(mode[0])*2)+' real players · one server';
  b.append(name,sub);b.onclick=()=>start(mode);
  modes.append(b);modeButtons.push(b);modeDetails.set(mode,sub);
 }
 // Discover honest, current occupancy only on this server, never estimated bots,
 // global concurrency, matchmaking guarantees or another player's identity.
 let listingRequest=0;
 const genericLabels=()=>{
  for(const [mode,sub]of modeDetails)
   sub.textContent=(Number(mode[0])*2)+' human players required';
 };
 async function loadAvailability(){
  if(document.hidden||home.hidden)return;
  const requestId=++listingRequest;
  if(navigator.onLine===false){
   genericLabels();availability.textContent='You appear offline · connect to view real player queues.';
   return;
  }
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);
  try{
   const response=await fetch('/api/quick-match/availability',{
    cache:'no-store',signal:abort.signal
   });
   if(!response.ok)throw Error('Live queue endpoint unavailable.');
   const data=await response.json();
   if(requestId!==listingRequest||document.hidden||home.hidden)return;
   if(data?.humanOnly!==true||data.ranked!==false||!data.modes)
    throw Error('Queue response does not represent real players.');
   for(const [mode,sub]of modeDetails){
    const row=data.modes[mode];
    if(!row||row.needed!==Number(mode[0])*2||
       ![row.waiting,row.confirming].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=128))
     throw Error('Live queue response is invalid.');
   }
   for(const [mode,sub]of modeDetails){
    const row=data.modes[mode];
    sub.textContent=row.waiting+' waiting · '+row.confirming+
      ' confirming · '+row.needed+' needed';
   }
   availability.textContent='Live server queues refreshed · real signed-in players only. Matches still require everyone to accept.';
  }catch{
   if(requestId!==listingRequest)return;
   genericLabels();availability.textContent='Live queue counts unavailable. Local games remain playable.';
  }finally{clearTimeout(timer);}
 }
 setInterval(()=>{if(!document.hidden&&!home.hidden)loadAvailability();},15000);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')loadAvailability();
 });
 window.addEventListener('online',loadAvailability);
 window.addEventListener('offline',loadAvailability);
 loadAvailability();
 acceptReady.onclick=()=>{
  if(!ready||readyAccepted||Date.now()>=ready.expiresAt)return;
  try{
   serverLink?.send({type:'queueReadyResponse',id:ready.id,accept:true});
   readyAccepted=true;ready.ready=Math.max(1,ready.ready);refresh();
  }catch{done('Could not confirm this match. Start another search.');}
 };
 declineReady.onclick=()=>{
  if(!ready)return;
  try{serverLink?.send({type:'queueReadyResponse',id:ready.id,accept:false});}catch{}
  disconnect();done('You declined the match. Search again when ready.');
 };
 cancel.onclick=()=>{
  if(!searching)return;
  try{serverLink?.send({type:'queueCancel'});}catch{}
  disconnect();done('Search cancelled. Choose another playlist whenever you want.');
 };
 window.startPartyQuickMatch=mode=>{
  if(!['2v2','3v3','4v4'].includes(mode))return false;
  if(searching||serverLink?.room)return false;
  start(mode,true);return searching;
 };
 window.onQuickMatchEvent=d=>{
  if(d.type==='queueReady'){
   if(!searching||!Number.isSafeInteger(d.expiresAt)||typeof d.id!=='string'||
      d.mode!==matchMode||d.players!==needed||d.humanOnly!==true)return;
   ready={id:d.id,mode:d.mode,players:d.players,expiresAt:d.expiresAt,ready:0};
   readyAccepted=false;refresh();
  }else if(d.type==='queueReadyProgress'){
   if(!ready||ready.id!==d.id)return;
   if(Number.isSafeInteger(d.ready)&&d.ready>=0&&d.ready<=ready.players)
    ready.ready=d.ready;
   refresh();
  }else if(d.type==='queueReadyAccepted'){
   if(ready&&ready.id===d.id){readyAccepted=true;refresh();}
  }else if(d.type==='queueReadyAborted'){
   if(!ready||ready.id!==d.id)return;
   ready=null;readyAccepted=false;
   if(d.requeued===true){
    refresh();notice.textContent=(d.reason||'Not everyone accepted.')+' Searching again…';
   }else{
    // Decliners, silent players and expired sessions must explicitly
    // restart searching: never join the next match without a new action.
    try{disconnect();}catch{}
    done(d.reason||'Ready check ended. Start another search.');
   }
  }else if(d.type==='quickMatchFound'){
   done('Matched with '+d.players+' real people. Your casual '+d.mode+' game is starting.');
   notify('Real-player Quick Match '+d.mode+' · no bots, no ranked rating.');
  }else if(d.type==='quickMatchCancelled'){
   done(d.reason||'Your match was cancelled.');
  }else if(d.type==='queueStatus'){
   if(d.status==='partyGathering'&&searching&&d.mode===matchMode&&d.humanOnly===true){
    notice.textContent='Gathering your party · '+d.waiting+' of '+d.needed+' teammates connected.';
   }else if(d.status==='waiting'&&searching&&d.mode===matchMode&&d.humanOnly===true){
    waiting=d.waiting;needed=d.needed;refresh();
   }else if(d.status==='cancelled')done('Search cancelled.');
   else if(d.status==='error'||d.status==='disconnected')
    done(d.reason||'Match search disconnected. You can try again.');
  }
 };
})();
