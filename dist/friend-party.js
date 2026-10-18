'use strict';
// Friend parties remain private, server-bound and casual. Members explicitly
// ready up; only the leader chooses the playlist, never an automatic bot fill.
(function(){
 const home=$('homeView'),social=document.querySelector('.social-dialog');
 if(!home||!social)return;
 const statusBar=document.createElement('section');statusBar.className='friend-party-banner';
 statusBar.hidden=true;statusBar.setAttribute('aria-label','Active friends party');
 const bannerText=document.createElement('strong');const bannerOpen=document.createElement('button');
 bannerOpen.type='button';bannerOpen.textContent='Open party →';
 statusBar.append(bannerText,bannerOpen);
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
 const intro=document.createElement('p');intro.textContent='Queue for casual 2v2–4v4 together. All teammates must ready up and accept the match. No bots or ranked ratings.';
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
 let busy=false,generation=0,hasJoined=false,lastModeKey='';
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
  busy=true;notice.textContent='Saving party action…';
  api(payload).then(state=>{
   render(state);
   notice.textContent='Party updated.';
   launchIfReady(state);
  }).catch(e=>{notice.textContent=e.message||'Party action unavailable.';})
   .finally(()=>{busy=false;});
 }
 function launchIfReady(state){
  const p=state?.party,mode=p?.launchMode,user=settings.account?.username?.toLowerCase();
  if(!mode||!p?.members?.some(m=>m.name===user&&m.ready))return;
  const key=p.id+':'+p.launchExpires+':'+mode;
  if(key===lastModeKey||Date.now()>=p.launchExpires)return;
  if(serverLink?.room){notice.textContent='Leave your current room before joining the party queue.';return;}
  lastModeKey=key;
  if(typeof window.startPartyQuickMatch!=='function'||!window.startPartyQuickMatch(mode)){
   notice.textContent='Could not start your party search. Leave any active search and try again.';
   return;
  }
  if(dialog.open)dialog.close();
 }
 function render(state){
  body.replaceChildren();
  const p=state?.party;
  bannerText.textContent=p?'PARTY · '+p.members.length+' / 4 · '+p.members.map(m=>m.name).join(', '):'';
  statusBar.hidden=!p;hasJoined=!!p;
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
     const invite=label('INVITE A FRIEND','Only mutual, accepted friends with an account can join your party.');
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
     if(!ready)queue.append(document.createTextNode('All teammates must press Ready first.'));
    }
   }else{
    const searching=label('CONNECTING YOUR PARTY',
     'Playlist '+p.launchMode+' · every approved teammate must join this same server within 30 seconds.');
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
  if(busy||!settings.account?.token||(!dialog.open&&!hasJoined))return;
  const seq=++generation,token=settings.account.token;
  try{
   const state=await api(null);
   if(seq!==generation||settings.account?.token!==token)return;
   render(state);launchIfReady(state);
   if(dialog.open)notice.textContent=state.party?'Party connected on this server.':'Create a party or accept a friend invitation.';
  }catch(e){if(seq===generation&&dialog.open)notice.textContent=e.message||'Party temporarily unavailable.';}
 }
 function open(){
  if(social.open)social.close();
  dialog.showModal();
  notice.textContent='Loading private party…';refresh();
 }
 bannerOpen.onclick=open;entry.onclick=open;
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
 setInterval(()=>{if(document.visibilityState==='visible')refresh();},2500);
})();
