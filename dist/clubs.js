'use strict';
// Club UX is a social layer for signed-in players. All permissions and
// membership changes are rechecked by the persistent native server.
(function(){
 const friends=document.querySelector('.social-dialog');
 const friendsHeader=friends?.querySelector('.social-head');
 if(!friends||!friendsHeader)return;
 const entry=document.createElement('button');entry.type='button';entry.className='club-social-entry';
 entry.textContent='Clubs';entry.setAttribute('aria-label','Open my club and invitations');
 const friendClose=friendsHeader.querySelector('button[aria-label="Close friends"]');
 friendsHeader.insertBefore(entry,friendClose||null);
 const dialog=document.createElement('dialog');dialog.className='club-social-dialog';
 dialog.setAttribute('aria-label','My Club');
 const shell=document.createElement('div');shell.className='club-social-shell';
 const top=document.createElement('header');top.className='club-social-head';
 const title=document.createElement('h2');title.textContent='MY CLUB.';
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh';
 const close=document.createElement('button');close.type='button';close.textContent='×';
 close.setAttribute('aria-label','Close Club');close.onclick=()=>dialog.close();
 top.append(title,refresh,close);
 const intro=document.createElement('p');intro.className='club-social-intro';
 intro.textContent='Build your own roster, invite teammates and appoint captains. Clubs are social teams, not verified ranked leagues.';
 const status=document.createElement('p');status.className='club-social-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const content=document.createElement('div');content.className='club-social-content';
 shell.append(top,intro,status,content);dialog.append(shell);document.body.append(dialog);
 let generation=0,busy=false,lastToken=null;
 const cell=(tag,value,cls)=>{
  const el=document.createElement(tag);el.textContent=value;
  if(cls)el.className=cls;return el;
 };
 const button=(caption,handler,danger=false)=>{
  const el=document.createElement('button');el.type='button';el.textContent=caption;
  if(danger)el.className='club-danger';el.onclick=handler;return el;
 };
 const panel=(heading,text)=>{
  const box=document.createElement('section');box.className='club-social-group';
  box.append(cell('h3',heading),cell('p',text));
  content.append(box);return box;
 };
 async function api(payload){
  const token=settings.account?.token;
  if(!token)throw Error('Log in to use Clubs.');
  const response=await fetch('/api/clubs',{
   method:payload?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Club service unavailable.');
  return data;
 }
 async function partyApi(payload){
  const token=settings.account?.token;
  if(!token)throw Error('Sign in to organize a Club squad.');
  const response=await fetch('/api/party',{
   method:payload?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Could not organize this Club squad.');
  return data;
 }
 async function organizeSquad(){
  if(busy)return;busy=true;status.textContent='Preparing your Club party…';
  try{
   let party=(await partyApi(null)).party;
   if(!party)party=(await partyApi({action:'create'})).party;
   if(party.leader!==settings.account.username.toLowerCase())
    throw Error('Only your party leader can invite teammates. Leave the current party before forming a new one.');
   status.textContent='Club party ready. Invite teammates from the Club roster, or open Friends → Party.';
   if(typeof window.openFriendParty==='function'){
    dialog.close();window.openFriendParty();
   }
  }catch(e){status.textContent=e.message||'Could not create Club party.';}
  finally{busy=false;}
 }
 async function inviteToSquad(name){
  if(busy)return;busy=true;status.textContent='Sending private Club party invitation…';
  try{
   await partyApi({action:'invite',user:name});
   status.textContent='Club party invite sent to '+name+'. They can accept from Friends → Party.';
  }catch(e){status.textContent=e.message||'Could not invite this teammate.';}
  finally{busy=false;}
 }
 async function act(payload){
  if(busy)return;busy=true;status.textContent='Saving club changes…';
  try{const result=await api(payload);render(result);status.textContent='Club changes saved.';}
  catch(e){status.textContent=e.message||'Club changes failed.';}
  finally{busy=false;}
 }
 function row(parent,label,actions=[]){
  const line=document.createElement('div');line.className='club-social-row';
  const name=cell('strong',label),buttons=document.createElement('div');
  buttons.className='club-social-row-actions';
  for(const action of actions)buttons.append(action);
  line.append(name,buttons);parent.append(line);
 }
 function form(label,placeholder,maxLength,onSubmit){
  const container=document.createElement('form');container.className='club-social-form';
  const input=document.createElement('input');input.type='text';input.autocomplete='off';
  input.required=true;input.placeholder=placeholder;input.maxLength=maxLength;
  input.setAttribute('aria-label',label);
  const submit=document.createElement('button');submit.type='submit';submit.className='primary';
  submit.textContent=label;container.append(input,submit);
  container.onsubmit=e=>{e.preventDefault();onSubmit(input.value.trim());input.value='';};
  return container;
 }
 function render(data){
  if(!data||!Array.isArray(data.invites))throw Error('Invalid Club response.');
  content.replaceChildren();
  const club=data.club;
  if(club){
   const role=club.myRole,leader=role==='owner'||role==='captain';
   const summary=panel(club.name.toUpperCase()+' · ['+club.tag+']',
    club.members.length+' / 24 teammates · Your role: '+role+' · No ranked club Elo yet.');
   summary.classList.add('club-social-identity');
   const buttons=document.createElement('div');buttons.className='club-social-controls';
   if(role!=='owner')buttons.append(button('Leave Club',()=>{
    if(confirm('Leave '+club.name+'?'))act({action:'leave'});
   },true));
   if(role==='owner')buttons.append(button('Disband Club',()=>{
    if(confirm('Permanently disband '+club.name+' and remove every membership?'))act({action:'disband'});
   },true));
   buttons.append(button('⚽ Form Club squad',organizeSquad));
   summary.append(buttons);
   const rooms=panel('CLUB MATCH ROOMS',
    'Club members can join these live, unlisted rooms. Hosts enable Club-only access from Room Control.');
   const live=Array.isArray(data.rooms)?data.rooms:[];
   for(const game of live){
    if(typeof game.room!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(game.room))continue;
    const join=button('Join Club room',()=>{
     if(serverLink?.room){status.textContent='Leave your current room before joining another.';return;}
     dialog.close();showJoinScreen(game.room);
    });
    join.className='primary';
    const invite=button('Copy link',async()=>{
     const url=location.origin+location.pathname+'?room='+encodeURIComponent(game.room);
     try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);status.textContent='Club room link copied.';
     }catch{status.textContent='Copy this Club room link: '+url;}
    });
    row(rooms,'Room '+game.room+' · '+game.players+' online · '+(game.started?'Playing':'Lobby'),
     [join,invite]);
   }
   if(!live.length)rooms.append(cell('p','No Club-only rooms are accepting new members. Create an online Custom Room, then choose Restrict to my Club in Room Control.'));
   const roster=panel('TEAM ROSTER','Form a Club squad to invite teammates directly, even if you are not already friends. Four Club members can ready up together for casual Club vs Club 4v4. Blocking still prevents invitations.');
   for(const member of club.members){
    const actions=[];
    if(member.user!==settings.account?.username?.toLowerCase()){
     actions.push(button('Invite to squad',()=>inviteToSquad(member.user)));
     if(role==='owner'){
      if(member.role==='member')actions.push(button('Make captain',()=>act({action:'promote',user:member.user})));
      if(member.role==='captain')actions.push(button('Remove captain',()=>act({action:'demote',user:member.user})));
      actions.push(button('Transfer ownership',()=>{
       if(confirm('Make '+member.user+' the new owner? You will become a regular member.'))
        act({action:'transfer',user:member.user});
      }));
     }
     if(role==='owner'||role==='captain'&&member.role==='member')
      actions.push(button('Remove member',()=>{
       if(confirm('Remove '+member.user+' from your Club?'))
        act({action:'kick',user:member.user});
      },true));
    }
    row(roster,member.user+' · '+member.role.toUpperCase(),actions);
   }
   if(leader){
    const invites=panel('INVITE TEAMMATES','Enter the exact existing account name. Invited players choose whether to join.');
    invites.append(form('Send invite','Player username',20,user=>act({action:'invite',user})));
    for(const user of club.invites||[])
     row(invites,user+' · pending',[button('Revoke',()=>act({action:'revoke',user}),true)]);
    if(!club.invites?.length)invites.append(cell('p','No pending club invitations.'));
   }
  }else{
   const create=panel('START YOUR TEAM','Create a unique club tag and invite up to 23 teammates. One Club per player.');
   const make=document.createElement('form');make.className='club-social-form club-social-create';
   const name=document.createElement('input');name.type='text';name.maxLength=32;name.required=true;
   name.autocomplete='off';name.placeholder='Club name';name.setAttribute('aria-label','Club name');
   const tag=document.createElement('input');tag.type='text';tag.maxLength=6;tag.minLength=2;tag.required=true;
   tag.autocomplete='off';tag.placeholder='Tag (2–6)';tag.setAttribute('aria-label','Club tag');
   const submit=cell('button','Create Club','primary');submit.type='submit';
   make.append(name,tag,submit);
   make.onsubmit=e=>{e.preventDefault();act({action:'create',name:name.value.trim(),tag:tag.value.trim()});};
   create.append(make);
  }
  const invites=panel('CLUB INVITATIONS','Invitations are visible only to the invited account.');
  if(club)invites.append(cell('p','You must leave your current Club before accepting another invitation.'));
  for(const invite of data.invites)row(invites,'['+invite.tag+'] '+invite.name,[
   button('Accept',()=>act({action:'accept',id:invite.id})),
   button('Decline',()=>act({action:'decline',id:invite.id}),true)
  ]);
  if(!data.invites.length)invites.append(cell('p','No incoming Club invitations.'));
 }
 async function load(){
  if(!dialog.open)return;
  const token=settings.account?.token,id=++generation;
  lastToken=token;content.replaceChildren();
  if(!token){
   status.textContent='Sign in or create a Fuckball account to build your Club.';
   const login=button('Sign in / Create account',()=>{dialog.close();showJoinScreen('');});
   login.className='primary';content.append(login);return;
  }
  status.textContent='Loading your Club…';
  try{
   const data=await api();
   if(id!==generation||!dialog.open||settings.account?.token!==token)return;
   render(data);status.textContent='Club information is private to signed-in members.';
  }catch(e){if(id===generation)status.textContent=e.message||'Club service unavailable.';}
 }
 entry.onclick=()=>{friends.close();dialog.showModal();load();};
 refresh.onclick=load;
 dialog.addEventListener('close',()=>{generation++;});
 document.addEventListener('visibilitychange',()=>{if(dialog.open&&document.visibilityState==='visible')load();});
})();
