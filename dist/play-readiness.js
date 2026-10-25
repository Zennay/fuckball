'use strict';
// Browser-only readiness clues for the *existing* authenticated human queue.
// This checklist cannot prove a remote server is reachable and never joins
// rooms, grants permissions, saves credentials or approves ready checks.
(function(){
 const home=document.getElementById('homeView');
 const hub=home?.querySelector('.play-hub');
 if(!home||!hub)return;
 const node=(tag,klass,value)=>{
  const e=document.createElement(tag);
  if(klass)e.className=klass;
  if(value!==undefined)e.textContent=String(value);
  return e;
 };
 const panel=node('section','play-readiness');
 panel.setAttribute('aria-label','Human Quick Match preparation checklist');
 const heading=node('div','play-readiness-heading');
 const headingText=node('div');
 headingText.append(node('span','play-readiness-eyebrow','BEFORE HUMAN QUICK MATCH'),
  node('h2','','MATCH READINESS.'),
  node('p','','See what is configured before you search. Only the live server can verify your session, find people and admit a match.'));
 const headingStatus=node('span','play-readiness-overall');
 heading.append(headingText,headingStatus);
 const checks=node('div','play-readiness-checks');
 const definitions=[
  {key:'account',label:'ACCOUNT',hint:'A locally saved sign-in session is required.'},
  {key:'server',label:'GAME SERVER',hint:'Set a compatible ws:// or wss:// address.'},
  {key:'session',label:'CURRENT SESSION',hint:'Finish or cancel an active room or human queue.'},
  {key:'input',label:'CONTROLS',hint:'Keyboard ready; gamepad optional.'}
 ];
 const refs=new Map();
 for(const item of definitions){
  const tile=node('article','play-readiness-tile');
  const name=node('strong','play-readiness-label',item.label);
  const state=node('span','play-readiness-state');
  const note=node('p','play-readiness-note',item.hint);
  tile.append(name,state,note);checks.append(tile);refs.set(item.key,{tile,state,note});
 }
 const actions=node('div','play-readiness-actions');
 const account=node('button','','Sign in / create account');
 const server=node('button','','Configure game server');
 const find=node('button','primary','Open human Quick Match →');
 const invite=node('button','','Join by invite');
 const returnToSession=node('button','play-readiness-resume','↗ Return to current session');
 returnToSession.hidden=true;
 for(const b of [account,server,find,invite,returnToSession]){b.type='button';actions.append(b);}
 const message=node('p','play-readiness-message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const foot=node('p','play-readiness-footnote',
  'Account status is only local session presence. Server address has not been contacted or tested here. Online games always require real humans and every participant’s explicit ready-check acceptance.');
 panel.append(heading,checks,actions,message,foot);
 hub.insertAdjacentElement('afterend',panel);
 function hasAccount(){
  return typeof settings!=='undefined'&&
   typeof settings.account?.token==='string'&&settings.account.token.length>0&&
   typeof settings.account?.username==='string'&&settings.account.username.length>0;
 }
 function serverConfig(){
  const address=document.getElementById('serverAddress')?.value.trim();
  if(!address)return {ok:false,label:'NOT CONFIGURED',detail:'Select a game server in Online Room settings.'};
  try{
   const url=new URL(address);
   const safe=['ws:','wss:'].includes(url.protocol)&&
    !(location.protocol==='https:'&&url.protocol!=='wss:')&&
    !!url.host&&!url.username&&!url.password;
   return safe?{ok:true,label:'ADDRESS SET',detail:'Saved selection only · '+url.host+' · availability not verified.'}:
    {ok:false,label:'INVALID ADDRESS',detail:'Use a valid WebSocket address (wss:// required on HTTPS).'};
  }catch{
   return {ok:false,label:'INVALID ADDRESS',detail:'Enter a complete ws:// or wss:// address.'};
  }
 }
 function session(){
  const link=typeof serverLink==='undefined'?null:serverLink;
  const direct=typeof peerConnected!=='undefined'&&peerConnected;
  const pendingPeer=typeof peer!=='undefined'&&!!peer;
  const recovering=typeof roomRecovery!=='undefined'&&!!roomRecovery.context;
  const ready=!!home.querySelector('.quick-ready:not([hidden])');
  const queue=!!home.querySelector('.quick-queue-actions button:not([hidden])');
  const playing=typeof started!=='undefined'&&!!started;
  const replaying=typeof replay!=='undefined'&&!!replay;
  if(recovering)return{ok:false,label:'RESTORING ORIGINAL ROOM',
   detail:'Your previous room is reconnecting. View the recovery controls and explicitly leave before starting new games.'};
  if(link?.room||direct)return{ok:false,label:'ROOM IN PROGRESS',
   detail:'Leave the existing online or direct-peer room explicitly before searching again.'};
  if(pendingPeer)return{ok:false,label:'DIRECT CONNECTION PENDING',
   detail:'Finish or cancel the direct-peer connection before starting another game.'};
  if(ready||link?.quickMatchMode||queue)
   return {ok:false,label:'HUMAN SEARCH ACTIVE',detail:'Finish or cancel your existing search or ready check.'};
  if(link)return{ok:false,label:'CONNECTING',detail:'An online room handshake is still underway. Cancel before switching.'};
  if(playing||replaying)return{ok:false,label:'LOCAL GAME OPEN',detail:'Finish or leave your local game or replay before searching for people.'};
  if(document.getElementById('joinScreen')?.hidden===false)
   return{ok:false,label:'INVITATION OPEN',detail:'Close the invite or sign-in form before starting another flow.'};
  return {ok:true,label:'AVAILABLE',detail:'No current game, queue, pending connection or invitation detected.'};
 }
 function gamepad(){
  let count=0;
  try{
   if(typeof navigator.getGamepads==='function'){
    const pads=navigator.getGamepads();
    count=Array.from(pads||[]).filter(x=>x?.connected&&x.mapping==='standard').length;
   }
  }catch{}
  return {ok:true,label:count?'KEYBOARD + '+count+' GAMEPAD'+(count===1?'':'S'):'KEYBOARD READY',
   detail:count?'Standard connected controllers reported by this browser.':'Keyboard is available. Connect a compatible controller if preferred.'};
 }
 let lastSignature='';
 let prepared=false;
 function snapshot(){
  return {
   account:hasAccount()?
    {ok:true,label:'SESSION STORED',detail:'Sign-in data is present locally; the server still validates it when searching.'}:
    {ok:false,label:'SIGN-IN REQUIRED',detail:'Create or sign in to a Fuckball account before human matchmaking.'},
   server:serverConfig(),session:session(),input:gamepad()
  };
 }
 function update(){
  const state=snapshot(),ready=state.account.ok&&state.server.ok&&state.session.ok;
  const signature=JSON.stringify(state);
  if(signature!==lastSignature){
   for(const [key,ref]of refs){
    const data=state[key];
    ref.tile.dataset.ready=data.ok?'yes':'no';
    ref.state.textContent=(data.ok?'✓ ':'• ')+data.label;
    ref.note.textContent=data.detail;
   }
   lastSignature=signature;
  }
  prepared=ready;
  headingStatus.textContent=ready?'LOCALLY PREPARED':'SETUP NEEDED';
  headingStatus.dataset.ready=ready?'yes':'no';
  find.textContent=ready?'Find real humans →':
   state.session.ok?'Configure Quick Match →':'Current session · new match blocked';
  returnToSession.hidden=state.session.ok;
  returnToSession.textContent=state.session.label==='RESTORING ORIGINAL ROOM'?
   '↗ View original room recovery':'↗ Return to current session';
  // Account and network details can be viewed even if current socket is busy.
  account.textContent=state.account.ok?'Account session present':'Sign in / create account';
  return state;
 }
 function showAccount(){
  const state=update();
  if(state.session.label!=='AVAILABLE'){
   message.textContent='Finish or cancel your current session before opening another sign-in flow.';
   return;
  }
  if(state.account.ok){
   message.textContent='You already have a local account session. The server will verify it when you queue.';
   return;
  }
  if(typeof showJoinScreen!=='function'){
   message.textContent='The original sign-in form is currently unavailable.';
   return;
  }
  showJoinScreen('');
  message.textContent='Original account form opened. No credentials were stored or sent by this checklist.';
 }
 function showServer(){
  if(typeof openDialog==='function'){
   openDialog('networkDialog');
   const advanced=document.querySelector('#networkDialog .advanced-network');
   if(advanced)advanced.open=true;
   document.getElementById('serverAddress')?.focus();
   message.textContent='Choose your game server. This checklist does not probe or connect to it.';
  }else message.textContent='Open Online Rooms to choose a native multiplayer server.';
 }
 function openQueue(){
  const state=update();
  if(!state.session.ok){message.textContent=state.session.detail;return;}
  const button=hub.querySelector('.play-hub-queue-now');
  const configure=hub.querySelector('.play-hub-primary');
  if(!button&&!configure){message.textContent='The existing human queue controls are unavailable.';return;}
  if(!state.account.ok||!state.server.ok){
   configure?.click();message.textContent='Configure your account and server in the native Quick Match panel before searching.';
   return;
  }
  button?.click();
  message.textContent='Passed control to native human matchmaking. You must still accept any ready check.';
 }
 function resumeCurrentSession(){
  const state=update();
  if(state.session.ok){
   message.textContent='There is no active session to return to.';
   return;
  }
  // Never schedule reconnection, start a queue, or replace a live match here.
  // Return only to existing native controls for the original human session.
  const recovery=document.querySelector('.native-room-recovery:not([hidden])');
  if(state.session.label==='RESTORING ORIGINAL ROOM'&&recovery){
   recovery.focus?.({preventScroll:true});
   message.textContent='The existing room recovery controls are ready. Rejoin or leave explicitly.';
   return;
  }
  const pendingJoin=document.querySelector('#joinScreen:not([hidden])');
  if(pendingJoin){
   (pendingJoin.querySelector('input:not([disabled])')||pendingJoin).focus?.({preventScroll:true});
   message.textContent='Your original room invitation is still open.';
   return;
  }
  const ready=home.querySelector('.quick-ready:not([hidden])');
  if(ready){
   (ready.querySelector('button:not([disabled]):not([hidden])')||ready)
    .focus?.({preventScroll:true});
   message.textContent='The real human ready-check is here; accept or decline yourself.';
   return;
  }
  const search=home.querySelector('.quick-queue-panel:not([hidden])');
  if(state.session.label==='HUMAN SEARCH ACTIVE'&&search){
   search.scrollIntoView?.({block:'nearest',behavior:'auto'});
   message.textContent='Existing human matchmaking controls are shown. No second search was started.';
   return;
  }
  const connecting=home.querySelector('.play-hub-connecting:not([hidden])');
  if(connecting){
   (connecting.querySelector('button:not([disabled])')||connecting).focus?.({preventScroll:true});
   message.textContent='You can view or cancel the existing pending room from here.';
   return;
  }
  document.getElementById('tabPlay')?.click();
  message.textContent='Returned to the original match or connection. No new game was started.';
 }
 function openInvite(){
  const state=update();
  if(!state.session.ok){message.textContent=state.session.detail;return;}
  const target=home.querySelector('.direct-invite-join');
  if(!target){message.textContent='The existing invitation form is unavailable.';return;}
  target.scrollIntoView({block:'center',behavior:
   window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  target.querySelector('input[type="text"]')?.focus({preventScroll:true});
  message.textContent='Paste your room link or code and confirm yourself. Admission remains server-controlled.';
 }
 account.onclick=showAccount;server.onclick=showServer;find.onclick=openQueue;
 invite.onclick=openInvite;returnToSession.onclick=resumeCurrentSession;
 const watch=()=>{if(!home.hidden&&document.visibilityState==='visible')update();};
 document.getElementById('serverAddress')?.addEventListener('input',update);
 document.addEventListener('visibilitychange',watch);
 window.addEventListener('gamepadconnected',watch);
 window.addEventListener('gamepaddisconnected',watch);
 window.addEventListener('focus',watch);
 window.addEventListener('online',watch);
 window.addEventListener('offline',watch);
 document.getElementById('tabHome')?.addEventListener('click',update);
 setInterval(watch,2000);
 update();
})();