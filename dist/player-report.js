'use strict';
// Legitimate player reports for connected human room participants. The server
// owns identity, room scope, target attribution, rate limit and persistence.
(function(){
 const pane=$('menuMatchPane');if(!pane)return;
 const panel=document.createElement('section');panel.className='player-report-panel';
 panel.hidden=true;panel.setAttribute('aria-label','Report disruptive player');
 const heading=document.createElement('h3');heading.textContent='REPORT A PLAYER.';
 const intro=document.createElement('p');intro.textContent=
  'Report serious abuse, disruption or suspected cheating to this server’s moderation inbox. Reports do not automatically remove players, award wins or alter ratings.';
 const form=document.createElement('form');
 const selectLabel=document.createElement('label');selectLabel.textContent='Connected player';
 const target=document.createElement('select');target.required=true;target.setAttribute('aria-label','Player to report');
 selectLabel.append(target);
 const whyLabel=document.createElement('label');whyLabel.textContent='Reason';
 const reason=document.createElement('select');reason.setAttribute('aria-label','Report reason');
 for(const [value,name] of [
  ['abusive-chat','Abusive chat / harassment'],
  ['griefing','Deliberately disrupting play'],
  ['suspected-cheating','Suspected cheating'],
  ['other','Other serious concern']
 ])reason.add(new Option(name,value));
 whyLabel.append(reason);
 const noteLabel=document.createElement('label');noteLabel.textContent='Details (optional, 200 characters)';
 const note=document.createElement('textarea');note.maxLength=200;note.rows=2;
 note.setAttribute('aria-label','Additional details for server moderator');note.placeholder='Briefly explain what happened, without private information.';
 noteLabel.append(note);
 const button=document.createElement('button');button.type='submit';button.textContent='Send private report';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 status.className='player-report-status';
 form.append(selectLabel,whyLabel,noteLabel,button);
 panel.append(heading,intro,form,status);pane.append(panel);
 let submitting=false,attempt=0;
 function render(){
  const current=serverLink?.room;
  panel.hidden=!current;
  if(!current)return;
  const signedIn=!!settings.account?.token;
  form.hidden=!signedIn;
  if(!signedIn){status.textContent='A signed-in account is required to submit reports.';return;}
  const candidates=Array.isArray(room?.state?.players)?room.state.players.filter(p=>
   Number.isSafeInteger(p?.id)&&p.id>0&&p.id!==networkPlayerId&&
   !botIds.has(p.id)&&p.aiControlled!==true).slice(0,64):[];
  const signature=JSON.stringify(candidates.map(p=>[p.id,p.name,p.team?.id]));
  if(target.dataset.roster!==signature){
   const chosen=target.value;target.dataset.roster=signature;target.replaceChildren();
   for(const player of candidates){
    const option=document.createElement('option');option.value=String(player.id);
    option.textContent=(player.team?.id===1?'Red':player.team?.id===2?'Blue':'Bench / Spectator')+
     ' · '+String(player.name||'Player').slice(0,25);
    target.append(option);
   }
   if(candidates.some(p=>String(p.id)===chosen))target.value=chosen;
  }
  button.disabled=submitting||!candidates.length;
  if(!candidates.length)status.textContent='No other connected human players are available to report.';
 }
 form.onsubmit=e=>{
  e.preventDefault();
  const id=Number(target.value);
  if(submitting||!serverLink?.room||!settings.account?.token)return;
  if(!Number.isSafeInteger(id)||id<1||id===networkPlayerId){
   status.textContent='Choose another connected player.';return;
  }
  const text=note.value.trim();
  if(text.length>200||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(text)){
   status.textContent='Details must be 200 printable characters or less.';return;
  }
  if(!confirm('Submit this report privately to the server operator for review? No automatic punishment will be applied.'))return;
  submitting=true;attempt++;const currentAttempt=attempt;
  button.disabled=true;status.textContent='Sending report securely…';
  try{serverLink.send({type:'reportPlayer',id,reason:reason.value,note:text});}
  catch{submitting=false;status.textContent='Could not send the report. Please reconnect and try again.';render();}
  setTimeout(()=>{if(submitting&&attempt===currentAttempt){submitting=false;status.textContent='No confirmation received. Check your connection before retrying.';render();}},7000);
 };
 window.onPlayerReportStatus=d=>{
  if(!submitting)return;
  submitting=false;
  if(d?.ok===true){note.value='';status.textContent='Report saved privately on this server for moderation review. Thank you.';}
  else status.textContent=typeof d?.message==='string'?d.message.slice(0,160):'Report was not saved. Try again later.';
  render();
 };
 window.renderPlayerReportPanel=render;render();
})();