'use strict';
// Download an account-owned snapshot from this exact game server. An export is
// deliberately not an account import, cloud sync or a trusted match receipt.
(function(){
 const actions=document.querySelector('.career-profile-actions');
 const profile=document.getElementById('careerProfileView');
 if(!actions||!profile)return;
 const button=document.createElement('button');button.type='button';
 button.className='career-private-export';button.textContent='↓ All my server data';
 button.setAttribute('aria-label','Download my personal server account data');
 button.title='Personal JSON export: friends, club, party, room presets, server career and recent matches';
 const note=document.createElement('p');note.className='career-private-export-note';
 note.textContent='Personal export includes private friend/Club/party details, saved account room presets and server-recorded results. Keep it private. Device-only presets and local HBR2 recordings require their separate exports.';
 const status=document.createElement('p');status.className='career-private-export-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 actions.append(button);
 actions.insertAdjacentElement('afterend',note);
 note.insertAdjacentElement('afterend',status);
 let busy=false;
 function session(){
  const entry=settings.account;
  return typeof entry?.token==='string'&&entry.token&&
   typeof entry?.username==='string'&&entry.username?{token:entry.token,user:entry.username}:null;
 }
 button.onclick=async()=>{
  if(busy)return;
  const before=session();
  if(!before){status.textContent='Sign in from Online Rooms before exporting personal account data.';return;}
  busy=true;button.disabled=true;
  status.textContent='Preparing your private account export from this server…';
  try{
   const response=await fetch('/api/account/export',{
    method:'GET',headers:{Authorization:'Bearer '+before.token},cache:'no-store'
   });
   const payload=await response.json().catch(()=>({}));
   // Never attach a response to the wrong browser account after sign-out.
   const now=session();
   if(!now||now.token!==before.token||now.user!==before.user)
    throw Error('Account changed during export. Sign in and try again.');
   if(response.status===401)throw Error('Account session expired. Sign in again.');
   if(!response.ok)throw Error(payload.error||'Server export unavailable.');
   if(payload?.format!=='fuckball-account-export'||payload.version!==1||
      payload.account?.username?.toLowerCase()!==before.user.toLowerCase()||
      payload.scope!=='this-native-server'||payload.ranked!==false||
      !payload.social||!payload.club||!payload.party||!payload.career||
      !Array.isArray(payload.recentMatches)||!Array.isArray(payload.roomPresets)||
      payload.roomPresets.length>8)
    throw Error('Unrecognized account export response.');
   const text=JSON.stringify(payload,null,2);
   if(text.length>1024*1024)throw Error('Export exceeds the browser download limit.');
   const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
   try{
    const anchor=document.createElement('a');anchor.href=url;
    anchor.download='fuckball-my-account-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(anchor);anchor.click();anchor.remove();
   }finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}
   status.textContent='Private account snapshot saved locally. Keep the file secure; it is not a verified ranking or replay.';
  }catch(error){status.textContent=error.message||'Account export failed.';}
  finally{busy=false;button.disabled=false;}
 };
})();
