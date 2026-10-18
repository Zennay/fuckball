'use strict';
// Native-server account security. No password or bearer token is placed in
// a replay, UI log, clipboard or the local preferences beyond existing token.
(function(){
 const profile=document.getElementById('careerProfileView');
 const actions=profile?.querySelector('.career-profile-actions');
 const identity=profile?.querySelector('.career-identity');
 if(!profile||!actions||!identity)return;
 const entry=document.createElement('button');entry.type='button';
 entry.textContent='🔐 Account security';entry.setAttribute('aria-expanded','false');
 entry.setAttribute('aria-controls','careerAccountSecurity');
 actions.append(entry);
 const panel=document.createElement('section');panel.className='account-security';
 panel.id='careerAccountSecurity';panel.hidden=true;
 panel.setAttribute('aria-label','Account security and signed-in devices');
 const title=document.createElement('h2');title.textContent='SECURE YOUR ACCOUNT.';
 const info=document.createElement('p');
 info.textContent='Change your password or sign out other devices on this server. Your current password is required. Changing your password signs out all old sessions, including live games on other devices. There is no email recovery yet.';
 const form=document.createElement('form');form.autocomplete='off';
 const input=(text,autocomplete,max=100)=>{
  const label=document.createElement('label');label.textContent=text;
  const field=document.createElement('input');field.type='password';field.required=true;
  field.minLength=text==='Current password'?6:10;field.maxLength=max;
  field.autocomplete=autocomplete;field.setAttribute('aria-label',text);
  label.append(field);form.append(label);return field;
 };
 const current=input('Current password','current-password');
 const next=input('New password (10+ characters)','new-password');
 const confirmPassword=input('Confirm new password','new-password');
 const row=document.createElement('div');row.className='account-security-actions';
 const change=document.createElement('button');change.type='submit';change.className='primary';
 change.textContent='Change password';
 const other=document.createElement('button');other.type='button';
 other.textContent='Sign out other devices';
 row.append(change,other);form.append(row);
 const status=document.createElement('p');status.className='account-security-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(title,info,form,status);
 identity.insertAdjacentElement('afterend',panel);
 let busy=false;
 function clearPasswords(){current.value='';next.value='';confirmPassword.value='';}
 function session(){return settings.account?.token&&settings.account?.username?
  {token:settings.account.token,user:settings.account.username}:null;}
 entry.onclick=()=>{
  panel.hidden=!panel.hidden;entry.setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden){status.textContent=session()?'Changes apply to this native game server only.':'Sign in before changing security settings.';current.focus();}
  else clearPasswords();
 };
 async function changeSecurity(action){
  if(busy)return;
  const previous=session();
  if(!previous){status.textContent='Sign in to a native game server first.';return;}
  if(!current.value){status.textContent='Enter your current password.';current.focus();return;}
  if(action==='changePassword'){
   if(next.value.length<10||next.value.length>100){
    status.textContent='The new password must contain 10–100 characters.';next.focus();return;
   }
   if(next.value!==confirmPassword.value){status.textContent='The new passwords do not match.';confirmPassword.focus();return;}
   if(!window.confirm('Change your password and sign out every previous session? Active online games using those sessions will disconnect.'))return;
  }else if(!window.confirm('Sign out other devices? Their active online sessions and games will disconnect. This device stays signed in.'))return;
  const payload={action,currentPassword:current.value,
   ...(action==='changePassword'?{newPassword:next.value}:{})};
  busy=true;change.disabled=other.disabled=true;
  status.textContent='Saving account security changes…';
  try{
   const response=await fetch('/api/account/security',{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+previous.token},
    body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(session()?.token!==previous.token)throw Error('Account changed during request. Sign in again.');
   if(!response.ok)throw Error(result.error||'Account security request failed.');
   if(result.ok!==true||result.username?.toLowerCase()!==previous.user.toLowerCase()||
      result.changed!==(action==='changePassword')||
      !Number.isSafeInteger(result.revoked)||result.revoked<0)
    throw Error('Unexpected account security response.');
   if(action==='changePassword'){
    if(typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token))
     throw Error('New session could not be established. Sign in again.');
    settings.account={username:result.username,token:result.token};
    savePrefs();renderAccount();
    if(serverLink?.room||serverLink?.quickMatchMode)disconnect();
    status.textContent='Password updated. All previous sessions revoked; your new session is active on this device. Rejoin any online game when ready.';
   }else{
    status.textContent='Other device sessions revoked ('+result.revoked+'). This session remains active.';
   }
  }catch(error){
   status.textContent=error.message||'Security update unavailable.';
  }finally{
   clearPasswords();busy=false;change.disabled=other.disabled=false;
  }
 }
 form.onsubmit=event=>{event.preventDefault();changeSecurity('changePassword');};
 other.onclick=()=>changeSecurity('logoutOthers');
})();