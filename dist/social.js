'use strict';
// Player-owned social panel. All privacy checks, session identity, invitation
// authorization and persistent mutations are enforced by the Node server.
(function(){
 const nav=document.querySelector('.main-nav');
 if(!nav)return;
 const open=document.createElement('button');open.type='button';open.textContent='Friends';
 open.setAttribute('aria-label','Friends, requests and room invitations');
 nav.append(open);
 // Also available in the full-screen in-match menu, where the top navbar
 // is intentionally hidden.
 const matchActions=document.querySelector('.rm-head-actions');
 if(matchActions){const inGame=open.cloneNode(true);inGame.textContent='Friends';inGame.onclick=()=>open.click();matchActions.append(inGame);}

 const dialog=document.createElement('dialog');dialog.className='social-dialog';
 dialog.setAttribute('aria-label','Friends and room invitations');
 const shell=document.createElement('div');shell.className='social-shell';
 const top=document.createElement('header');top.className='social-head';
 const title=document.createElement('h2');title.textContent='FRIENDS.';
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close friends');
 close.onclick=()=>dialog.close();top.append(title,close);
 const intro=document.createElement('p');intro.className='social-intro';
 intro.textContent='Connect with players you trust. Only mutual friends can see when you are playing or receive your room invites.';
 const status=document.createElement('p');status.className='social-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const addForm=document.createElement('form');addForm.className='social-add';
 const input=document.createElement('input');input.type='text';input.maxLength=20;
 input.autocomplete='off';input.placeholder='Exact account name';input.setAttribute('aria-label','Account name');
 const add=document.createElement('button');add.type='submit';add.textContent='+ Add friend';add.className='primary';
 addForm.append(input,add);
 const grids=document.createElement('div');grids.className='social-grids';
 shell.append(top,intro,status,addForm,grids);dialog.append(shell);document.body.append(dialog);
 let timer=null,generation=0,busy=false,accountToken=null;
 const api=async(body,invite=false)=>{
  const token=settings.account?.token;
  if(!token)throw Error('Log in to use friends.');
  const response=await fetch(invite?'/api/social/invite':'/api/social',{
   method:body?'POST':'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Friends are temporarily unavailable.');
  return result;
 };
 function cell(text){const s=document.createElement('span');s.textContent=text;return s;}
 function button(text,onClick,secondary=false){
  const b=document.createElement('button');b.type='button';b.textContent=text;
  if(secondary)b.className='social-danger';
  b.onclick=onClick;return b;
 }
 async function act(payload,invite=false){
  if(busy)return;
  busy=true;status.textContent='Saving…';
  try{const data=await api(payload,invite);render(data);status.textContent=invite?'Room invite sent. Expires after 5 minutes.':'Changes saved.';}
  catch(e){status.textContent=e.message||'Could not save changes.';}
  finally{busy=false;}
 }
 function section(heading,description){
  const wrap=document.createElement('section');wrap.className='social-group';
  const h=document.createElement('h3');h.textContent=heading;
  const p=document.createElement('p');p.textContent=description;
  const list=document.createElement('div');list.className='social-rows';
  wrap.append(h,p,list);grids.append(wrap);return list;
 }
 function row(list,label,actions=[]){
  const item=document.createElement('div');item.className='social-row';
  const name=document.createElement('strong');name.textContent=label;
  const buttons=document.createElement('div');buttons.className='social-row-actions';
  for(const b of actions)buttons.append(b);
  item.append(name,buttons);list.append(item);
 }
 function render(data){
  grids.replaceChildren();if(!data||!Array.isArray(data.friends))throw Error('Invalid friends response.');
  const friends=section('YOUR FRIENDS','Presence is shown only to accepted friends, and only while they are in a game.');
  for(const f of data.friends){
   const actions=[
    button('Remove',()=>act({action:'remove',user:f.name}),true),
    button('Block',()=>{if(confirm('Block '+f.name+'? This also removes the friendship.'))act({action:'block',user:f.name});},true)
   ];
   if(serverLink?.room&&f.online)actions.unshift(button('Invite to room',()=>act({to:f.name,room:serverLink.room},true)));
   row(friends,f.name+(f.online?' · PLAYING':' · offline'),actions);
  }
  if(!data.friends.length)row(friends,'No friends yet. Search for an exact account name above.');
  const incoming=section('FRIEND REQUESTS','Only requests addressed to your account are visible here.');
  for(const name of data.incoming||[])row(incoming,name,[
   button('Accept',()=>act({action:'accept',user:name})),
   button('Decline',()=>act({action:'decline',user:name},false),true),
   button('Block',()=>act({action:'block',user:name}),true)
  ]);
  if(!data.incoming?.length)row(incoming,'No incoming requests');
  const outgoing=section('SENT','Pending invitations to become friends.');
  for(const name of data.outgoing||[])row(outgoing,name,[button('Cancel',()=>act({action:'cancel',user:name}),true)]);
  if(!data.outgoing?.length)row(outgoing,'No pending requests');
  const invites=section('ROOM INVITES','A friend has invited you to an active match. Links expire after five minutes.');
  for(const invite of data.invites||[]){
   if(!/^[A-HJ-NP-Z2-9]{8}$/.test(invite.room))continue;
   row(invites,invite.from+' · room '+invite.room,[
    button('Join room',()=>{
     if(serverLink?.room){status.textContent='Leave your current room first, then open this invitation.';return;}
     dialog.close();showView('play');showJoinScreen(invite.room);
    })
   ]);
  }
  if(!data.invites?.length)row(invites,'No invitations');
  const blocked=section('BLOCKED','Blocked players cannot send you friend requests or room invites.');
  for(const name of data.blocked||[])row(blocked,name,[button('Unblock',()=>act({action:'unblock',user:name}))]);
  if(!data.blocked?.length)row(blocked,'Nobody blocked');
 }
 async function refresh(){
  if(!dialog.open)return;
  const load=++generation,token=settings.account?.token;
  accountToken=token;
  if(!token){
   grids.replaceChildren();addForm.hidden=true;
   status.textContent='Sign in from the online-room account menu to use friends.';
   return;
  }
  addForm.hidden=false;
  try{
   const data=await api(null);
   if(load!==generation||!dialog.open||settings.account?.token!==token)return;
   render(data);status.textContent='Signed in as '+settings.account.username+'.';
  }catch(e){if(load===generation)status.textContent=e.message||'Friends unavailable.';}
 }
 addForm.onsubmit=event=>{
  event.preventDefault();const name=input.value.trim();
  if(!/^[a-z0-9_-]{3,20}$/i.test(name)){status.textContent='Enter a valid 3–20 character account name.';return;}
  input.value='';act({action:'request',user:name});
 };
 open.onclick=()=>{dialog.showModal();refresh();};
 dialog.addEventListener('close',()=>{generation++;if(timer){clearInterval(timer);timer=null;}});
 dialog.addEventListener('cancel',()=>{generation++;});
 const oldOpen=open.onclick;
 open.onclick=()=>{oldOpen();timer=setInterval(()=>{if(dialog.open&&!busy)refresh();},15000);};
 document.addEventListener('visibilitychange',()=>{if(dialog.open&&document.visibilityState==='visible')refresh();});
})();
