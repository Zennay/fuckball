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
 description.textContent='Search for people on the same server. Play 1v1–4v4 with real players only. No filler bots, no fake opponents and no ranked rating yet.';
 const modes=document.createElement('div');modes.className='quick-queue-modes';
 const modeButtons=[];
 const notice=document.createElement('p');notice.className='quick-queue-status';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 notice.textContent='Sign in with a Fuckball account to search for a match.';
 const actions=document.createElement('div');actions.className='quick-queue-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='× Cancel search';cancel.hidden=true;
 actions.append(cancel);
 panel.append(heading,description,modes,notice,actions);
 const cards=home.querySelector('.mode-cards')||home;
 cards.insertAdjacentElement('afterend',panel);
 let searching=false,matchMode=null,queuedAt=0,clock=null,waiting=0,needed=0;
 function refresh(){
  modeButtons.forEach(b=>b.disabled=searching);
  cancel.hidden=!searching;
  if(searching&&queuedAt){
   const duration=Math.max(0,Math.floor((Date.now()-queuedAt)/1000));
   notice.textContent='Searching for '+matchMode+' · '+waiting+' of '+needed+
    ' human players available · '+duration+'s elapsed. No bots will be added.';
  }
 }
 function stopClock(){if(clock){clearInterval(clock);clock=null;}}
 function done(message){
  searching=false;matchMode=null;stopClock();refresh();notice.textContent=message;
 }
 function start(mode){
  if(searching)return;
  if(serverLink?.room){notice.textContent='Leave your current room before starting another match.';return;}
  if(!settings.account?.token){
   notice.textContent='Log in or create a free account, then select a playlist.';
   showJoinScreen('');return;
  }
  if(!$('serverAddress').value.trim()){
   notice.textContent='Connect to a Fuckball multiplayer server to find human opponents.';return;
  }
  searching=true;matchMode=mode;queuedAt=Date.now();waiting=1;needed=Number(mode[0])*2;
  refresh();stopClock();clock=setInterval(refresh,1000);
  connectServer(false,'','',null,mode);
 }
 for(const mode of ['1v1','2v2','3v3','4v4']){
  const b=document.createElement('button');b.type='button';b.className='quick-queue-mode';
  const name=document.createElement('strong');name.textContent=mode;
  const sub=document.createElement('small');
  sub.textContent=(Number(mode[0])*2)+' real players · one server';
  b.append(name,sub);b.onclick=()=>start(mode);
  modes.append(b);modeButtons.push(b);
 }
 cancel.onclick=()=>{
  if(!searching)return;
  try{serverLink?.send({type:'queueCancel'});}catch{}
  disconnect();done('Search cancelled. Choose another playlist whenever you want.');
 };
 window.onQuickMatchEvent=d=>{
  if(d.type==='quickMatchFound'){
   done('Matched with '+d.players+' real people. Your casual '+d.mode+' game is starting.');
   notify('Real-player Quick Match '+d.mode+' · no bots, no ranked rating.');
  }else if(d.type==='quickMatchCancelled'){
   done(d.reason||'Your match was cancelled.');
  }else if(d.type==='queueStatus'){
   if(d.status==='waiting'&&searching&&d.mode===matchMode&&d.humanOnly===true){
    waiting=d.waiting;needed=d.needed;refresh();
   }else if(d.status==='cancelled')done('Search cancelled.');
   else if(d.status==='error'||d.status==='disconnected')
    done(d.reason||'Match search disconnected. You can try again.');
  }
 };
})();
