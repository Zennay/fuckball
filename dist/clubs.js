'use strict';
// Private club identity, memberships and friendship-based invitations.
// No fake ratings, leaderboard claims, client-owned captaincy or match results.
(function(){
 const nav=document.querySelector('.main-nav');if(!nav)return;
 const open=document.createElement('button');open.type='button';open.textContent='Clubs';
 open.setAttribute('aria-label','My club and club invitations');nav.append(open);
 const profile=document.querySelector('.profile');
 const clubBadge=document.createElement('span');clubBadge.className='profile-club-tag';
 clubBadge.hidden=true;
 if(profile)profile.insertBefore(clubBadge,profile.firstChild);
 const menu=document.querySelector('.rm-head-actions');
 if(menu){const ingame=open.cloneNode(true);ingame.onclick=()=>open.click();menu.append(ingame);}
 const dialog=document.createElement('dialog');dialog.className='club-social-dialog';
 dialog.setAttribute('aria-label','Club management');
 const shell=document.createElement('div');shell.className='club-social-shell';
 const head=document.createElement('header');head.className='club-social-head';
 const title=document.createElement('h2');title.textContent='MY CLUB.';
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close clubs');close.onclick=()=>dialog.close();
 head.append(title,close);
 const intro=document.createElement('p');intro.textContent='Build your club identity with trusted friends. Rosters and captaincy are persistent on this server. Ratings, official leagues and ranked club matchmaking are not yet available.';
 const notice=document.createElement('p');notice.className='club-social-status';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const area=document.createElement('div');area.className='club-social-area';
 shell.append(head,intro,notice,area);dialog.append(shell);document.body.append(dialog);
 let busy=false,generation=0,timer=null;
 async function api(body){
  const token=settings.account?.token;
  if(!token)throw Error('Sign in to use clubs.');
  const result=await fetch('/api/clubs',{
   method:body?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const data=await result.json().catch(()=>({}));
  if(!result.ok)throw Error(data.error||'Club service is unavailable.');
  return data;
 }
 const text=(tag,value,className)=>{
  const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;
 };
 const button=(caption,fn,destructive=false)=>{
  const b=document.createElement('button');b.type='button';b.textContent=caption;
  if(destructive)b.className='club-destructive';b.onclick=fn;return b;
 };
 function field(label,value,max,description=''){
  const wrapper=document.createElement('label');wrapper.textContent=label;
  const input=document.createElement('input');input.type='text';input.value=value||'';
  input.maxLength=max;input.setAttribute('aria-label',label);
  wrapper.append(input);
  if(description)wrapper.append(text('small',description));
  return{wrapper,input};
 }
 async function mutate(d,message){
  if(busy)return;
  busy=true;notice.textContent='Saving club changes…';
  try{const data=await api(d);render(data);notice.textContent=message||'Club changes saved.';}
  catch(e){notice.textContent=e.message||'Could not save the club change.';}
  finally{busy=false;}
 }
 function card(titleText,desc){
  const card=document.createElement('section');card.className='club-social-card';
  card.append(text('h3',titleText),text('p',desc));
  area.append(card);return card;
 }
 function render(data){
  area.replaceChildren();if(!data||!Array.isArray(data.invites))throw Error('Invalid club response.');
  const club=data.club;
  clubBadge.hidden=!club;clubBadge.textContent=club?'['+club.tag+']':'';
  if(!club){
   const create=card('CREATE YOUR CLUB','Pick a unique club tag and name. You will become its captain.');
   const form=document.createElement('form');form.className='club-social-form';
   const name=field('Club name','',32,'3–32 characters'),tag=field('Club tag','',5,'2–5 letters or digits');
   const submit=document.createElement('button');submit.type='submit';submit.className='primary';submit.textContent='Create club';
   form.append(name.wrapper,tag.wrapper,submit);
   form.onsubmit=e=>{e.preventDefault();mutate({action:'create',name:name.input.value,tag:tag.input.value},'Your club is ready. Invite your friends!');};
   create.append(form);
  }else{
   const own=settings.account?.username?.toLowerCase()===club.owner;
   const overview=card('['+club.tag+'] '+club.name,
    (club.description||'No club description yet.')+' · '+club.members.length+' / 24 members. Club captain: '+club.owner+'.');
   overview.append(text('small','Persistent club identity on this server · no ranked points awarded.','club-social-meta'));
   const roster=document.createElement('div');roster.className='club-social-roster';
   for(const member of club.members){
    const row=document.createElement('div');row.className='club-social-member';
    row.append(text('strong',(member===club.owner?'♛ ':'')+member));
    const controls=document.createElement('div');controls.className='club-social-member-actions';
    if(own&&member!==club.owner){
     controls.append(button('Make captain',()=>{
      if(confirm('Transfer club captaincy to '+member+'?'))mutate({action:'promote',user:member},'Captaincy transferred.');
     }),button('Remove',()=>{
      if(confirm('Remove '+member+' from the club?'))mutate({action:'kick',user:member},'Player removed.');
     },true));
    }
    row.append(controls);roster.append(row);
   }
   overview.append(roster);
   if(own){
    const invites=card('INVITE A FRIEND','Only mutual accepted friends with a Fuckball account can join.');
    const inviteForm=document.createElement('form');inviteForm.className='club-social-form';
    const person=field('Friend account','',20);
    const send=document.createElement('button');send.className='primary';send.type='submit';send.textContent='Send club invite';
    inviteForm.append(person.wrapper,send);invites.append(inviteForm);
    inviteForm.onsubmit=e=>{e.preventDefault();mutate({action:'invite',user:person.input.value.trim()},'Invitation sent. Valid for seven days.');};
    const edit=card('CLUB IDENTITY','The captain can change the club name, tag and introduction.');
    const editForm=document.createElement('form');editForm.className='club-social-form';
    const name=field('Name',club.name,32),tag=field('Tag',club.tag,5);
    const save=document.createElement('button');save.type='submit';save.textContent='Save name and tag';save.className='primary';
    editForm.append(name.wrapper,tag.wrapper,save);edit.append(editForm);
    editForm.onsubmit=e=>{e.preventDefault();mutate({action:'rename',name:name.input.value,tag:tag.input.value},'Club identity updated.');};
    const bioForm=document.createElement('form');bioForm.className='club-social-form';
    const bio=document.createElement('textarea');bio.maxLength=180;bio.value=club.description||'';
    bio.setAttribute('aria-label','Club description');bio.placeholder='Your club values, play style or training goals';
    const saveBio=document.createElement('button');saveBio.type='submit';saveBio.textContent='Save description';
    bioForm.append(bio,saveBio);edit.append(bioForm);
    bioForm.onsubmit=e=>{e.preventDefault();mutate({action:'describe',description:bio.value},'Club description updated.');};
    edit.append(button('Disband club',()=>{
     if(confirm('Disband ['+club.tag+'] '+club.name+' and remove every member? This cannot be undone.'))
      mutate({action:'disband'},'Club disbanded.');
    },true));
   }else{
    overview.append(button('Leave club',()=>{
     if(confirm('Leave this club?'))mutate({action:'leave'},'You have left the club.');
    },true));
   }
  }
  const invited=card('CLUB INVITATIONS','Accepted invitations place you on the club roster. One club per account.');
  for(const item of data.invites){
   const row=document.createElement('div');row.className='club-social-member';
   row.append(text('strong','['+item.tag+'] '+item.name+' · from '+item.by));
   const actions=document.createElement('div');actions.className='club-social-member-actions';
   actions.append(button('Join club',()=>mutate({action:'accept',clubId:item.clubId},'Welcome to the club!')),
    button('Decline',()=>mutate({action:'decline',clubId:item.clubId},'Club invitation declined.'),true));
   row.append(actions);invited.append(row);
  }
  if(!data.invites.length)invited.append(text('small','No pending club invitations.','club-social-meta'));
 }
 async function refresh(){
  if(!dialog.open||busy)return;
  const request=++generation,token=settings.account?.token;
  if(!token){
   area.replaceChildren();notice.textContent='Sign in or create an account to use clubs.';
   area.append(button('Sign in',()=>{dialog.close();showJoinScreen('');}));
   return;
  }
  try{
   const data=await api();
   if(request!==generation||!dialog.open||settings.account?.token!==token)return;
   render(data);notice.textContent='Signed in as '+settings.account.username+'.';
  }catch(e){if(request===generation)notice.textContent=e.message||'Clubs unavailable.';}
 }
 // Keep the small profile badge current without exposing the club roster
 // or sending any cross-account lookup request.
 if(settings.account?.token)api().then(data=>{
  if(settings.account?.token){clubBadge.hidden=!data.club;clubBadge.textContent=data.club?'['+data.club.tag+']':'';}
 }).catch(()=>{});
 open.onclick=()=>{dialog.showModal();refresh();timer=setInterval(refresh,30000);};
 dialog.addEventListener('close',()=>{generation++;if(timer){clearInterval(timer);timer=null;}});
 document.addEventListener('visibilitychange',()=>{if(dialog.open&&document.visibilityState==='visible')refresh();});
})();
