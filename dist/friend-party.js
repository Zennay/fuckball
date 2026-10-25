'use strict';
// Friend parties remain private, server-bound and casual. Members explicitly
// ready up; only the leader chooses the playlist, never an automatic bot fill.
(function(){
 const home=$('homeView'),social=document.querySelector('.social-dialog');
 if(!home||!social)return;
 const statusBar=document.createElement('section');statusBar.className='friend-party-banner';
 statusBar.hidden=true;statusBar.setAttribute('aria-label','Active friends party');
 const bannerText=document.createElement('strong');
 bannerText.setAttribute('role','status');bannerText.setAttribute('aria-live','polite');
 const bannerOpen=document.createElement('button');
 bannerOpen.type='button';bannerOpen.textContent='Open party →';
 const bannerRetry=document.createElement('button');
 bannerRetry.type='button';bannerRetry.textContent='↻ Retry party search';
 bannerRetry.className='friend-party-retry';bannerRetry.hidden=true;
 bannerRetry.setAttribute('aria-label','Retry the current authorized friends party search');
 statusBar.append(bannerText,bannerOpen,bannerRetry);
 // Party state and 30-second launch retry must not disappear on My Games or
 // the pitch when Home is hidden. This card is a view of the original private
 // party API and forwards only explicit actions to the existing handlers.
 const globalParty=document.createElement('aside');
 globalParty.className='friend-party-global';globalParty.hidden=true;
 globalParty.setAttribute('role','region');
 globalParty.setAttribute('aria-label','Current private friends party');
 const globalCopy=document.createElement('div');
 globalCopy.className='friend-party-global-copy';
 const globalTitle=document.createElement('strong');
 const globalDetail=document.createElement('p');
 globalDetail.setAttribute('role','status');
 globalDetail.setAttribute('aria-live','polite');
 globalCopy.append(globalTitle,globalDetail);
 const globalActions=document.createElement('div');
 globalActions.className='friend-party-global-actions';
 const globalOpen=document.createElement('button');
 globalOpen.type='button';globalOpen.textContent='↗ Open party';
 const globalRetry=document.createElement('button');
 globalRetry.type='button';globalRetry.textContent='↻ Retry search';
 globalActions.append(globalOpen,globalRetry);
 globalParty.append(globalCopy,globalActions);
 document.body.append(globalParty);
 (home.querySelector('.quick-queue-panel')||home.querySelector('.mode-cards'))?.insertAdjacentElement('beforebegin',statusBar);
 const entry=document.createElement('button');entry.type='button';
 entry.textContent='Party';entry.className='friend-party-entry';
 entry.setAttribute('aria-label','Party invitations and matchmaking');
 social.querySelector('.social-head')?.append(entry);
 const dialog=document.createElement('dialog');dialog.className='friend-party-dialog';
 dialog.setAttribute('aria-label','Friends party');
 const wrap=document.createElement('div');wrap.className='friend-party-shell';
 const head=document.createElement('header');head.className='friend-party-head';
 const title=document.createElement('h2');title.textContent='YOUR PARTY.';
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close party');
 close.onclick=()=>dialog.close();
 head.append(title,close);
 const intro=document.createElement('p');intro.textContent='Queue with human friends or your Club teammates. A complete four-member Club squad can challenge another Club in casual 4v4. Every player must ready up and confirm; no bots or ranked Elo.';
 intro.className='friend-party-intro';
 const notice=document.createElement('p');notice.className='friend-party-notice';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const body=document.createElement('div');body.className='friend-party-content';
 wrap.append(head,intro,notice,body);dialog.append(wrap);document.body.append(dialog);
 const btn=(label,action,danger=false)=>{
  const b=document.createElement('button');b.type='button';b.textContent=label;
  if(danger)b.className='friend-party-danger';b.onclick=action;return b;
 };
 const label=(name,description)=>{
  const box=document.createElement('section');box.className='friend-party-group';
  const h=document.createElement('h3');h.textContent=name;
  const p=document.createElement('p');p.textContent=description;
  box.append(h,p);body.append(box);return box;
 };
 const row=(box,name,actions=[])=>{
  const line=document.createElement('div');line.className='friend-party-row';
  const t=document.createElement('strong');t.textContent=name;
  const buttons=document.createElement('div');buttons.className='friend-party-row-buttons';
  for(const action of actions)buttons.append(action);
  line.append(t,buttons);box.append(line);
 };
 let busy=false,generation=0,hasJoined=false,lastModeKey='',failedModeKey='',lastQuietPoll=0;
 let lastPartyState=null,lastPartyToken=null;
 function updateGlobalParty(){
  const currentToken=settings.account?.token;
  const state=lastPartyToken===currentToken?lastPartyState:null;
  const party=state?.party;
  const invites=Array.isArray(state?.invitations)?state.invitations:[];
  // Give the real active match and server-owned 15s ready-check priority.
  // The floating party card must never cover an active pitch or an in-flight
  // native/direct-peer join. A paused local match and visible replay are still
  // gameplay: existing user input and real native ready checks take priority.
  const activeMatch=!!serverLink||
   (typeof peerConnected!=='undefined'&&peerConnected===true)||
   (typeof peer!=='undefined'&&!!peer)||
   (typeof started!=='undefined'&&started===true)||
   (typeof replay!=='undefined'&&!!replay);
  const readyCheck=document.querySelector('.quick-ready-dock:not([hidden])');
  globalParty.hidden=(!party&&!invites.length)||!home.hidden||activeMatch||!!readyCheck;
  if(globalParty.hidden)return;
  if(!party){
   globalTitle.textContent=invites.length===1?'PRIVATE FRIEND INVITATION':
    invites.length+' PRIVATE FRIEND INVITATIONS';
   const copy=invites.length+' server-issued invitation'+(invites.length===1?'':'s')+
    ' · Review the sender and accept or decline in your original Party panel.';
   if(globalDetail.textContent!==copy)globalDetail.textContent=copy;
   globalOpen.textContent='↗ Review invitation';
   globalRetry.hidden=true;return;
  }
  globalOpen.textContent='↗ Open party';
  const now=Date.now(),expires=Number(party.launchExpires);
  const remaining=Number.isFinite(expires)?Math.max(0,Math.ceil((expires-now)/1000)):null;
  const canRetry=mayRetryParty(state);
  globalTitle.textContent=canRetry?'PARTY SEARCH · YOUR ACTION NEEDED':
   party.launchMode?'PARTY SEARCH IN PROGRESS':'FRIENDS PARTY CONNECTED';
  const detail=party.launchMode?
   'Playlist '+party.launchMode+' · '+(remaining===null?'server-issued launch':remaining+'s left')+
   (canRetry?' · Launch did not start; retry explicitly.':
    remaining===0?' · Deadline passed; request a new search.':
    ' · Keep the original server queue or open your party.'):
   party.members.length+' / 4 signed-in teammates · ready up before searching.';
  if(globalDetail.textContent!==detail)globalDetail.textContent=detail;
  globalRetry.hidden=!canRetry;
  globalRetry.disabled=!canRetry||busy;
 }
 const knownInvitations=new Set();
 async function api(data){
  const token=settings.account?.token;
  if(!token)throw Error('Sign in to use friend parties.');
  const response=await fetch('/api/party',{method:data?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Party service is unavailable.');
  return result;
 }
 function act(payload){
  if(busy)return;
  const token=settings.account?.token;
  const requestGeneration=++generation;
  busy=true;notice.textContent='Saving party action…';
  api(payload).then(state=>{
   // Sign-out, account switch or a newer action invalidates the response.
   // Never render another account's party or launch its human-only queue.
   if(settings.account?.token!==token||generation!==requestGeneration)return;
   render(state);
   entry.textContent='Party'+(state.invitations?.length?' ('+state.invitations.length+')':'');
   notice.textContent='Party updated.';
   launchIfReady(state);
  }).catch(e=>{
   if(settings.account?.token===token&&generation===requestGeneration)
    notice.textContent=e.message||'Party action unavailable.';
  }).finally(()=>{busy=false;updateGlobalParty();});
 }
 // Each party launch is server-issued and expires. Keep automatic launch
 // single-shot: a failed local attempt becomes an explicit, revalidated retry,
 // never a silent polling loop or a fictitious successful team queue.
 function partyLaunchKey(p){
  return p?.launchMode&&Number.isFinite(p.launchExpires)?
   p.id+':'+p.launchExpires+':'+p.launchMode+':'+
   (settings.account?.username||'').toLowerCase():'';
 }
 function mayRetryParty(state){
  const p=state?.party,key=partyLaunchKey(p);
  const user=settings.account?.username?.toLowerCase();
  return !!key&&key===failedModeKey&&key!==lastModeKey&&
   Date.now()<p.launchExpires&&
   p.members?.some(m=>m.name===user&&m.ready)===true;
 }
 function syncRetryButton(state){
  const actionable=mayRetryParty(state),p=state?.party;
  bannerRetry.hidden=!actionable;
  if(actionable&&p)bannerText.textContent='PARTY SEARCH NEEDS ACTION · '+
   p.members.length+' / 4 members · Retry before the server deadline';
  else if(p)bannerText.textContent='PARTY · '+p.members.length+' / 4 · '+
   p.members.map(m=>m.name).join(', ');
 }
 function launchIfReady(state,explicit=false){
  const p=state?.party,mode=p?.launchMode,user=settings.account?.username?.toLowerCase();
  const key=partyLaunchKey(p);
  if(!key||!p.members?.some(m=>m.name===user&&m.ready))return false;
  if(key===lastModeKey)return true;
  if(Date.now()>=p.launchExpires){
   notice.textContent='This server-issued party launch expired. Ask your leader to start a new search.';
   syncRetryButton(state);return false;
  }
  if(!explicit&&key===failedModeKey)return false;
  const fail=message=>{
   failedModeKey=key;notice.textContent=message;
   syncRetryButton(state);return false;
  };
  if(serverLink?.room)return fail('Leave your current room, then retry this party search explicitly.');
  if(typeof window.startPartyQuickMatch!=='function'||!window.startPartyQuickMatch(mode))
   return fail('Party search did not start. Check your current online queue or server, then press Retry party search.');
  lastModeKey=key;failedModeKey='';
  syncRetryButton(state);
  notice.textContent='The party search started on your configured game server.';
  if(dialog.open)dialog.close();
  return true;
 }
 async function retryPartySearch(){
  if(busy)return;
  busy=true;notice.textContent='Checking the current server-issued party launch…';
  try{
   // Do not trust stale polling state after a room switch, account change,
   // revoked invite, expiry or a leader relaunch.
   const accountToken=settings.account?.token;
   const state=await api(null);
   if(settings.account?.token!==accountToken){
    bannerRetry.hidden=true;
    notice.textContent='Your signed-in account changed. Reopen Party to check invitations.';
    return;
   }
   render(state);
   if(!mayRetryParty(state)){
    notice.textContent=partyLaunchKey(state?.party)===lastModeKey?
     'You already joined this party search.':
     'That party launch is no longer available to you. Ask the leader to retry.';
    return;
   }
   launchIfReady(state,true);
  }catch(e){notice.textContent=e.message||'Could not refresh the party. Retry from the original party panel.';}
  finally{busy=false;}
 }
 bannerRetry.onclick=retryPartySearch;
 globalRetry.onclick=retryPartySearch;
 function render(state){
  lastPartyState=state;lastPartyToken=settings.account?.token;
  body.replaceChildren();
  const p=state?.party;
  updateGlobalParty();
  bannerText.textContent=p?'PARTY · '+p.members.length+' / 4 · '+p.members.map(m=>m.name).join(', '):'';
  statusBar.hidden=!p;hasJoined=!!p;
  syncRetryButton(state);
  if(!p){
   const create=label('MAKE A PARTY','Invite up to three accepted friends and search together. The room stays private.');
   create.append(btn('Create party',()=>act({action:'create'})));
  }else{
   const user=settings.account?.username?.toLowerCase(),leader=p.leader===user;
   const roster=label('YOUR TEAM','Leader: '+p.leader+' · All members ready before a party search begins.');
   for(const member of p.members){
    const actions=[];
    if(member.name===user&& !p.launchMode)actions.push(
     btn(member.ready?'Cancel ready':'✓ Ready up',()=>act({action:'ready',ready:!member.ready})));
    if(leader&&member.name!==user&&!p.launchMode)
     actions.push(btn('Remove',()=>{if(confirm('Remove '+member.name+' from this party?'))
      act({action:'kick',user:member.name});},true));
    row(roster,member.name+(member.name===p.leader?' · LEADER':'')+
     (member.ready?' · READY':' · WAITING'),actions);
   }
   if(!p.launchMode){
    if(leader&&p.members.length<4){
     const invite=label('INVITE A TEAMMATE','Invite accepted friends or existing Club members. All invitees must have a registered account, and blocked accounts cannot join.');
     const form=document.createElement('form');form.className='friend-party-form';
     const input=document.createElement('input');input.type='text';input.maxLength=20;
     input.autocomplete='off';input.placeholder='Exact friend username';
     input.setAttribute('aria-label','Friend username');input.required=true;
     const send=btn('Invite friend',()=>{});send.type='submit';send.className='primary';
     form.append(input,send);
     form.onsubmit=e=>{e.preventDefault();const name=input.value.trim();
      if(!/^[a-z0-9_-]{3,20}$/i.test(name)){notice.textContent='Invalid account name.';return;}
      act({action:'invite',user:name});input.value='';
     };
     invite.append(form);
    }
    if(leader&&p.members.length>1){
     const queue=label('PLAY AS A PARTY',
      'Pick the match size. Your teammates stay on the same team; the server waits for real opponents.');
     const ready=p.members.every(m=>m.ready);
     for(const mode of ['2v2','3v3','4v4']){
      if(p.members.length>Number(mode[0]))continue;
      const launch=btn('Search '+mode,()=>act({action:'launch',mode}));
      launch.disabled=!ready||!!serverLink?.room;launch.className='primary';
      queue.append(launch);
     }
     if(p.members.length===4){
      const club=document.createElement('div');club.className='friend-party-club';
      const explanation=document.createElement('p');
      explanation.textContent='Club vs Club · four signed-in members of the same Club compete against a different full Club. Casual only: no Club rating or season ladder.';
      const launch=btn('⚽ Find Club 4v4',()=>act({action:'launch',mode:'club4v4'}));
      launch.disabled=!ready||!!serverLink?.room;launch.className='primary';
      club.append(explanation,launch);queue.append(club);
     }
     if(!ready)queue.append(document.createTextNode('All teammates must press Ready first.'));
    }
   }else{
    const searching=label('CONNECTING YOUR PARTY',
     'Playlist '+(p.launchMode==='club4v4'?'Club vs Club 4v4':p.launchMode)+' · every approved teammate must join this same server within 30 seconds.');
    if(mayRetryParty(state)){
     const retry=btn('↻ Retry joining party search',retryPartySearch);
     retry.className='primary';
     searching.append(retry);
     searching.append(document.createTextNode(
      'Your first attempt did not start. This retries only after you press the button and the server confirms this launch is still yours.'));
    }
    if(leader)searching.append(btn('Cancel party search',()=>act({action:'cancel'}),true));
   }
   if(!p.launchMode)body.append(btn(leader?'Disband / leave party':'Leave party',()=>{
    if(confirm('Leave this friends party?'))act({action:'leave'});
   },true));
  }
  const invites=label('INCOMING INVITATIONS','Only the invited account can see and accept these offers. They expire after five minutes.');
  for(const invitation of state?.invitations||[]){
   row(invites,invitation.from+' invited you to join their party',[
    btn('Accept',()=>act({action:'accept',id:invitation.id})),
    btn('Decline',()=>act({action:'decline',id:invitation.id}),true)
   ]);
  }
  if(!state?.invitations?.length)invites.append(document.createTextNode('No pending invites.'));
 }
 async function refresh(){
  if(busy)return;
  const quiet=!dialog.open&&!hasJoined;
  if(quiet&&Date.now()-lastQuietPoll<30000)return;
  if(quiet)lastQuietPoll=Date.now();
  if(!settings.account?.token){
   body.replaceChildren();statusBar.hidden=true;bannerRetry.hidden=true;hasJoined=false;
   lastPartyState=null;lastPartyToken=null;globalParty.hidden=true;
   notice.textContent='Sign in with a Fuckball account to use parties.';
   const login=btn('Sign in / create account',()=>{dialog.close();showJoinScreen('');});
   login.className='primary';body.append(login);return;
  }
  const seq=++generation,token=settings.account.token;
  try{
   const state=await api(null);
   if(seq!==generation||settings.account?.token!==token)return;
   // Polling must not erase a teammate's half-typed invitation.
   const typing=dialog.open&&dialog.contains(document.activeElement)&&
    document.activeElement?.tagName==='INPUT';
   const invitations=Array.isArray(state.invitations)?state.invitations:[];
   // Also render the first empty receipt after all invitations disappear;
   // otherwise a cross-view badge would continue advertising revoked invites.
   if(!typing&&(dialog.open||hasJoined||state.party||invitations.length||
      lastPartyState?.invitations?.length))render(state);
   entry.textContent='Party'+(invitations.length?' ('+invitations.length+')':'');
   entry.setAttribute('aria-label',invitations.length?
    invitations.length+' party invitation'+(invitations.length===1?'':'s')+' awaiting your response':
    'Party invitations and matchmaking');
   for(const invitation of invitations){
    if(typeof invitation.id!=='string'||knownInvitations.has(invitation.id))continue;
    knownInvitations.add(invitation.id);
    // Only surface a toast for newly arrived invitations after the first
    // quiet poll; opening the dialog already displays the invitation details.
    if(lastQuietPoll&&quiet)notify('You have a new friend party invitation. Open Friends → Party.');
   }
   launchIfReady(state);
   if(dialog.open&&!typing)notice.textContent=state.party?'Party connected on this server.':'Create a party or accept a friend invitation.';
  }catch(e){if(seq===generation&&dialog.open)notice.textContent=e.message||'Party temporarily unavailable.';}
 }
 function open(){
  if(social.open)social.close();
  dialog.showModal();
  notice.textContent='Loading private party…';refresh();
 }
 bannerOpen.onclick=open;entry.onclick=open;
 globalOpen.onclick=open;
 window.openFriendParty=open;
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
 setInterval(()=>{if(document.visibilityState==='visible')refresh();},2500);
 // Lightweight presentational clock: no extra API calls, queues or sockets.
 const globalPartyTicker=setInterval(updateGlobalParty,1000);
 globalPartyTicker?.unref?.();
 for(const id of ['tabHome','tabPlay']){
  document.getElementById(id)?.addEventListener('click',()=>queueMicrotask(updateGlobalParty));
 }
 window.addEventListener('focus',updateGlobalParty);
 // Discover invitations without keeping the Friends dialog open.
 if(settings.account?.token)refresh();
})();
