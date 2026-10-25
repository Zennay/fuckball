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
 let submitting=false,attempt=0,pending=null,previousScope=null;
 // A moderation receipt belongs only to the socket, admitted room and
 // signed-in browser account that originally submitted it. Never transfer a
 // pending acknowledgement, report draft or target between human sessions.
 function scope(){
  const link=serverLink,account=settings.account?.token;
  return link?.room&&account?{link,room:link.room,account}:null;
 }
 function sameScope(a,b){
  return a===b||!!a&&!!b&&a.link===b.link&&a.room===b.room&&a.account===b.account;
 }
 function stopPending(){
  if(pending?.timer!==null&&pending?.timer!==undefined)clearTimeout(pending.timer);
  pending=null;submitting=false;attempt++;
 }
 function connectedCandidates(){
  const link=serverLink;
  if(!link?.room||!link.roomState)return[];
  const disconnected=new Set(Array.isArray(link.roomState.disconnectedIds)?
   link.roomState.disconnectedIds:[]);
  return Array.isArray(room?.state?.players)?room.state.players.filter(p=>
   Number.isSafeInteger(p?.id)&&p.id>0&&p.id!==networkPlayerId&&
   !botIds.has(p.id)&&p.aiControlled!==true&&!disconnected.has(p.id)
  ).slice(0,64):[];
 }
 function render(){
  const current=scope();
  if(!sameScope(previousScope,current)){
   // An old pending server result can never turn into a success message
   // after switching rooms, reconnecting into a new socket or signing out.
   const changed=previousScope!==null;
   stopPending();previousScope=current;
   target.dataset.roster='';
   if(changed){
    note.value='';
    status.textContent=current?
     'Room or account changed. Choose a player from this room before reporting.':
     'Previous report draft cleared when the room or account changed.';
   }
  }
  const link=serverLink,admitted=!!link?.room;
  panel.hidden=!admitted;
  if(!admitted)return;
  const signedIn=!!settings.account?.token;
  form.hidden=!signedIn;
  if(!signedIn){status.textContent='A signed-in account is required to submit reports.';return;}
  const candidates=connectedCandidates();
  const signature=JSON.stringify([link.room,candidates.map(p=>[p.id,p.name,p.team?.id])]);
  if(target.dataset.roster!==signature){
   const chosen=target.value;
   target.dataset.roster=signature;target.replaceChildren();
   for(const player of candidates){
    const option=document.createElement('option');
    option.value=String(player.id);
    option.textContent=(player.team?.id===1?'Red':player.team?.id===2?'Blue':'Bench / Spectator')+
     ' · '+String(player.name||'Player').slice(0,25);
    target.append(option);
   }
   if(candidates.some(p=>String(p.id)===chosen))target.value=chosen;
  }
  const socketOpen=link.ws?.readyState===1;
  button.disabled=submitting||!socketOpen||!candidates.length;
  if(!socketOpen)status.textContent='Connection unavailable. Reconnect before submitting a private report.';
  else if(!candidates.length)status.textContent='No other connected human players are available to report.';
 }
 form.onsubmit=e=>{
  e.preventDefault();
  render(); // Refresh authoritative room/account/roster before user consent.
  const current=scope(),link=current?.link,id=Number(target.value);
  if(submitting||!current)return;
  if(link.ws?.readyState!==1){
   status.textContent='The connection is not open. Reconnect before sending a report.';
   return;
  }
  if(!Number.isSafeInteger(id)||id<1||
     !connectedCandidates().some(player=>player.id===id)){
   status.textContent='Choose an available connected player from this room.';return;
  }
  const text=note.value.trim();
  if(text.length>200||/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(text)){
   status.textContent='Details must be 200 printable characters or less.';return;
  }
  if(!confirm('Submit this report privately to the server operator for review? No automatic punishment will be applied.'))return;
  if(!sameScope(current,scope())||link.ws?.readyState!==1){
   status.textContent='Your room or connection changed. Review the report before retrying.';render();return;
  }
  submitting=true;const currentAttempt=++attempt;
  button.disabled=true;status.textContent='Sending private report to this room’s server…';
  try{
   link.send({type:'reportPlayer',id,reason:reason.value,note:text});
   pending={scope:current,attempt:currentAttempt,timer:setTimeout(()=>{
    if(!pending||pending.attempt!==currentAttempt)return;
    const stillCurrent=sameScope(current,scope());
    stopPending();
    if(stillCurrent)status.textContent='No server confirmation received. Check your connection before retrying.';
    render();
   },7000)};
  }catch{
   stopPending();status.textContent='Could not send the report. Reconnect and retry.';
   render();
  }
 };
 window.onPlayerReportStatus=d=>{
  const receipt=pending;
  if(!receipt)return;
  // The same account on a different room is still a different session.
  const stillCurrent=sameScope(receipt.scope,scope());
  stopPending();
  if(!stillCurrent){render();return;}
  if(d?.ok===true){
   note.value='';
   status.textContent='Server confirmed your report was saved privately for moderation review.';
  }else status.textContent=typeof d?.message==='string'?
   d.message.slice(0,160):'The server did not save the report. Try again later.';
  render();
 };
 window.addEventListener('fuckball:native-session-state',render);
 window.renderPlayerReportPanel=render;render();
})();