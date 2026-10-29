'use strict';
// Custom-room rotation recommendations from the genuine native roster and
// server-issued playing-time ledger. No authority: the existing server-side
// captain/host admission and incoming-player consent remain mandatory.
(function(){
 const host=document.getElementById('subPanel');
 if(!host)return;
 const mk=(tag,text,cls)=>{const e=document.createElement(tag);
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;return e;};
 const section=mk('details',null,'room-rotation-desk');
 const heading=mk('summary','ROTATION DESK · LIVE BENCH');
 const help=mk('p','Compare actual active playtime and available team benches. A recommendation only fills the existing substitution form; only the server-authorized host or captain can propose a swap, and the incoming person must explicitly accept.');
 const settings=mk('div',null,'room-rotation-controls');
 const label=mk('label','Team'),side=mk('select');
 side.setAttribute('aria-label','Rotation desk team');
 side.add(new Option('Red','1'));side.add(new Option('Blue','2'));
 const refresh=mk('button','↻ Refresh rotation'),download=mk('button','↓ Save current roster');
 refresh.type=download.type='button';label.append(side);
 settings.append(label,refresh,download);
 const context=mk('p',null,'room-rotation-context');context.setAttribute('role','status');
 const rows=mk('div',null,'room-rotation-columns');
 const suggestions=mk('div',null,'room-rotation-suggestions');
 const manual=mk('section',null,'room-rotation-manual');
 const manualTitle=mk('strong','MANUAL ROTATION · PREPARE ONLY');
 const manualDescription=mk('p','Choose any current connected on-pitch human and an available human assigned to this team’s bench. This never overrides server roster rules or sends the swap.');
 const manualFields=mk('div',null,'room-rotation-manual-fields');
 const outLabel=mk('label','Player to rotate off'),outChoice=mk('select');
 const inLabel=mk('label','Incoming bench player'),inChoice=mk('select');
 outChoice.setAttribute('aria-label','Select outgoing active player for manual rotation');
 inChoice.setAttribute('aria-label','Select incoming bench player for manual rotation');
 outLabel.append(outChoice);inLabel.append(inChoice);
 const manualButton=mk('button','Prepare selected pair');manualButton.type='button';
 manualFields.append(outLabel,inLabel,manualButton);manual.append(manualTitle,manualDescription,manualFields);
 const notice=mk('p',null,'room-rotation-notice');
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const exportConfirm=mk('div',null,'room-rotation-export-confirm');
 exportConfirm.hidden=true;exportConfirm.setAttribute('role','group');
 exportConfirm.setAttribute('aria-label','Confirm private roster CSV export');
 const exportHelp=mk('p',
  'Export currently verified player names and active times as a private CSV? '+
  'Only a separate, explicit confirm click starts the download.');
 const exportActions=mk('div',null,'room-rotation-export-actions');
 const exportApprove=mk('button','Confirm CSV export');exportApprove.type='button';
 const exportCancel=mk('button','Cancel');exportCancel.type='button';
 exportActions.append(exportApprove,exportCancel);
 exportConfirm.append(exportHelp,exportActions);
 section.append(heading,help,settings,context,rows,suggestions,manual,notice,exportConfirm);
 host.append(section);
 let latest=null,signature='',roomToken=null,pendingExport=null;
 function hideExport(){pendingExport=null;exportConfirm.hidden=true;}
 // A reused room code is not a persistent identity: the native socket is.
 // Invalidate selections when a reconnect creates a new admitted session.
 let observedLink=null,sessionGeneration=0,admissionObservedAt=0;
 // Reconnects may reuse a room code and even the same player ID. The very
 // first *new* physics frame after admission proves the displayed roster was
 // not left over from the previous socket.
 function currentFrameEvidence(){
  if(typeof net==='undefined'||!Number.isSafeInteger(net.receivedSequence)||
     net.receivedSequence<1||net.lastSnapshot<=admissionObservedAt||
     !Number.isFinite(net.lastSnapshot)||net.lastSnapshot<=0)return false;
  const age=performance.now()-net.lastSnapshot;
  return Number.isFinite(age)&&age>=0&&age<=1600;
 }
 const validId=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
 const validFrames=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
 const nativeTeam=p=>typeof p?.team==='number'?p.team:p?.team?.id;
 function clear(){
  hideExport();
  latest=null;signature='';roomToken=null;
  rows.replaceChildren();suggestions.replaceChildren();notice.textContent='';
 }
 function snapshot(){
  const link=typeof serverLink==='undefined'?null:serverLink;
  if(link!==observedLink){
   observedLink=link;sessionGeneration++;
   admissionObservedAt=performance.now();
  }
  const state=link?.roomState;
  // The local room engine can still contain an older room's human names and
  // teams between native welcome and the first NEW server physics snapshot.
  // Never recommend or export those players based on a room code alone.
  if(!link?.room||link.quickMatchMode||!state||
   link.ws?.readyState!==1||state.room!==link.room||
   !currentFrameEvidence()||
   !Array.isArray(room?.state?.players)||room.state.players.length>128)return null;
  const disconnected=new Set(Array.isArray(state.disconnectedIds)?state.disconnectedIds:[]);
  const benches=new Map(Array.isArray(state.benches)?state.benches:[]);
  const willing=new Set(Array.isArray(state.benchReadyIds)?state.benchReadyIds:[]);
  const frames=new Map(Array.isArray(state.activeFrames)?state.activeFrames:[]);
  const captains=new Map(Array.isArray(state.captains)?state.captains:[]);
  const pending=Array.isArray(state.pendingSubs)?state.pendingSubs:[];
  const botSet=typeof botIds!=='undefined'&&botIds instanceof Set?botIds:new Set();
  const seen=new Set(),people=[];
  for(const p of room.state.players){
   const id=p?.id,team=nativeTeam(p);
   if(!validId(id)||seen.has(id)||![0,1,2].includes(team))continue;
   seen.add(id);
   if(botSet.has(id)||p.aiControlled===true)continue;
   const f=frames.get(id),seconds=validFrames(f)?Math.floor(f/60):null;
   const preferred=benches.get(id);
   const name=typeof p.name==='string'?
    p.name.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim().slice(0,25)||'Player':'Player';
   people.push({id,team,name,seconds,available:!disconnected.has(id),
    bench:team===0&&[1,2].includes(preferred)?preferred:null,
    willing:team===0&&[1,2].includes(preferred)&&willing.has(id)&&!disconnected.has(id)});
  }
  const desired=Number(side.value)===2?2:1;
  const active=people.filter(p=>p.team===desired);
  const waiting=people.filter(p=>p.team===0&&p.bench===desired);
  const idle=people.filter(p=>p.team===0&&p.bench===null);
  const captain=captains.get(desired);
  const mayPropose=!!link.isOwner||captain===networkPlayerId;
  const pendingTeam=pending.some(p=>p?.team===desired);
  const total=validFrames(state.round)?state.round:null;
  return{sessionGeneration,token:link.room,desired,people,active,waiting,idle,mayPropose,
   captain:validId(captain)?captain:null,pendingTeam,owner:!!link.isOwner,round:total};
 }
 const elapsed=s=>s===null?'not measured':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';
 function rankedCandidate(items,descending){
  const available=items.filter(p=>p.available&&p.seconds!==null);
  available.sort((a,b)=>(descending?0:Number(b.willing)-Number(a.willing))||
   (descending?b.seconds-a.seconds:a.seconds-b.seconds)||a.id-b.id);
  return available[0]||null;
 }
 function display(list,title){
  const box=mk('section',null,'room-rotation-list');
  box.append(mk('h4',title+' · '+list.length));
  if(!list.length){box.append(mk('p','Nobody currently listed.'));return box;}
  const ol=mk('ol');
  for(const p of [...list].sort((a,b)=>(b.available-a.available)||((b.seconds??-1)-(a.seconds??-1))||a.id-b.id)){
   const row=mk('li');
   row.append(mk('span',p.name+(p.id===networkPlayerId?' · YOU':'')+(p.willing?' · READY TO BE ASKED':'')+
    (p.available?'':' · RECONNECTING')),
    mk('small',elapsed(p.seconds)));
   ol.append(row);
  }
  box.append(ol);return box;
 }
 function nativePrepare(outgoing,incoming){
  const data=snapshot();
  if(!data||data.sessionGeneration!==latest?.sessionGeneration||
   data.token!==latest?.token||data.desired!==latest?.desired||
   !data.mayPropose||data.pendingTeam||
   !data.active.some(p=>p.id===outgoing.id&&p.available)||
   !data.waiting.some(p=>p.id===incoming.id&&p.available)){
   render(true);notice.textContent='Room or permissions changed. Refresh the desk; no swap was proposed.';return;
  }
  const sideField=document.getElementById('subTeam'),
   outgoingField=document.getElementById('subOutPlayer'),
   incomingField=document.getElementById('subInPlayer'),
   confirm=document.getElementById('subPropose');
  if(!sideField||!outgoingField||!incomingField||!confirm){notice.textContent='Native substitution controls unavailable.';return;}
  sideField.value=String(data.desired);sideField.dispatchEvent(new Event('change',{bubbles:true}));
  if(![...outgoingField.options].some(x=>x.value===String(outgoing.id))||
   ![...incomingField.options].some(x=>x.value===String(incoming.id))||confirm.disabled){
   notice.textContent='Native substitution permissions or roster changed. No action sent.';return;
  }
  outgoingField.value=String(outgoing.id);
  incomingField.value=String(incoming.id);
  confirm.focus({preventScroll:true});
  notice.textContent='Prepared: '+outgoing.name+' → '+incoming.name+
   '. Review the real Out/In fields, then explicitly press Propose swap. Incoming player consent is still required.';
 }

 function populate(list,select,placeholder){
  const old=select.value;select.replaceChildren();
  if(!list.length){
   const empty=new Option(placeholder,'');select.add(empty);select.disabled=true;return;
  }
  for(const person of list){
   const label=person.name+' · '+elapsed(person.seconds);
   select.add(new Option(label,String(person.id)));
  }
  select.disabled=false;
  if(list.some(p=>String(p.id)===old))select.value=old;
 }
 manualButton.onclick=()=>{
  const data=snapshot();
  if(!data||!latest||data.sessionGeneration!==latest.sessionGeneration||
   data.token!==latest.token||data.desired!==latest.desired){
   render(true);notice.textContent='Room changed; refresh before preparing a swap.';return;
  }
  const outgoing=data.active.find(p=>p.id===Number(outChoice.value)&&p.available);
  const incoming=data.waiting.find(p=>p.id===Number(inChoice.value)&&p.available);
  if(!outgoing||!incoming){render(true);notice.textContent='Choose a connected active and assigned bench player.';return;}
  nativePrepare(outgoing,incoming);
 };
 function render(force=false){
  const data=snapshot();
  if(!data){
   const link=typeof serverLink==='undefined'?null:serverLink;
   const pending=!!link?.room&&!link.quickMatchMode&&link.ws?.readyState===1;
   section.hidden=!pending;clear();
   manual.hidden=true;manualButton.disabled=true;download.disabled=true;
   if(pending)context.textContent=
    'Waiting for a new, recent server physics frame in this room. '+
    'Playing-time suggestions, old selections and player-name exports are unavailable until the live roster is verified.';
   else context.textContent='';
   return;
  }
  section.hidden=false;manual.hidden=false;
  const key=JSON.stringify([data.sessionGeneration,data.token,data.desired,data.round,data.owner,data.captain,
   data.mayPropose,data.pendingTeam,data.people]);
  if(!force&&signature===key)return;
  if(roomToken!==null&&roomToken!==data.token){section.open=false;notice.textContent='Room changed; old rotation not retained.';}
  roomToken=data.token;signature=key;latest=data;
  const team=data.desired===1?'Red':'Blue';
  context.textContent=team+' · '+data.active.length+' active humans · '+
   data.waiting.length+' team bench · '+data.idle.length+' unassigned spectators'+
   (data.pendingTeam?' · substitution already pending':'')+
   (data.mayPropose?' · can propose with native permissions':' · view only');
  rows.replaceChildren(display(data.active,'ACTIVE'),display(data.waiting,'BENCH'));
  suggestions.replaceChildren();
  const outgoing=rankedCandidate(data.active,true),
   incoming=rankedCandidate(data.waiting,false);
  if(!outgoing||!incoming){
   suggestions.append(mk('p',!data.waiting.length?
    'No assigned team bench players are available. The host can first assign spectators using the existing bench controls.':
    'A connected on-pitch player and available bench member with native active-time records are required for a time-based suggestion.'));
  }else{
   const title=mk('strong','SUGGESTED FAIR ROTATION');
   const reason=mk('p','Longest measured active time: '+outgoing.name+' ('+elapsed(outgoing.seconds)+
    '). Shortest recorded bench-player active time: '+incoming.name+' ('+elapsed(incoming.seconds)+
    ') · '+(incoming.willing?'bench player indicated AVAILABLE':'availability not confirmed')+
    '. This is an optional playing-time suggestion, not an automatic coaching or skill judgment.');
   const fill=mk('button','Prepare '+outgoing.name+' → '+incoming.name);
   fill.type='button';fill.disabled=!data.mayPropose||data.pendingTeam;
   fill.onclick=()=>nativePrepare(outgoing,incoming);
   suggestions.append(title,reason,fill);
   if(!data.mayPropose)suggestions.append(mk('small','Only the actual native room host or this team’s appointed captain can propose.'));
   if(data.pendingTeam)suggestions.append(mk('small','A prior substitution must finish or expire first.'));
  }
  const activeChoices=data.active.filter(p=>p.available);
  const benchChoices=data.waiting.filter(p=>p.available);
  populate(activeChoices,outChoice,'No active human');
  populate(benchChoices,inChoice,'No assigned bench player');
  manualButton.disabled=!data.mayPropose||data.pendingTeam||!activeChoices.length||!benchChoices.length;
  manual.hidden=!(activeChoices.length||benchChoices.length);
  download.disabled=!data.people.length;
 }
 side.onchange=()=>{signature='';render(true);};
 refresh.onclick=()=>{
  const actual=snapshot();render(true);
  notice.textContent=actual?'Refreshed from a recently received server frame.':
   'No recent admitted-room frame. Refresh after the connection resumes; no recommendation or export was made.';
 };
 download.onclick=()=>{
  const data=snapshot();
  if(!data||data.sessionGeneration!==latest?.sessionGeneration||
     data.token!==latest?.token||!data.people.length){
   render(true);notice.textContent='The room changed or its server frame is stale. Refresh before exporting.';return;
  }
  // A blocking window.confirm would pause the event loop, making every live
  // frame "stale" while the user reads the prompt. The inline confirmation
  // keeps native game/network updates flowing until the explicit second click.
  pendingExport={sessionGeneration:data.sessionGeneration,token:data.token,
   desired:data.desired,people:JSON.stringify(data.people)};
  exportConfirm.hidden=false;
  exportApprove.focus({preventScroll:true});
  notice.textContent='No data exported yet. Review the prompt and explicitly confirm or cancel.';
 };
 exportCancel.onclick=()=>{
  hideExport();notice.textContent='Private CSV export cancelled; no file generated.';
 };
 exportApprove.onclick=()=>{
  const request=pendingExport;hideExport();if(!request)return;
  const confirmed=snapshot();
  if(!confirmed||confirmed.sessionGeneration!==request.sessionGeneration||
     confirmed.token!==request.token||confirmed.desired!==request.desired||
     JSON.stringify(confirmed.people)!==request.people){
   render(true);
   notice.textContent='Session, roster or recent native frame changed. No data exported; review current players first.';
   return;
  }
  // Spreadsheet programs may execute user-provided cells beginning with an
  // Excel formula prefix even inside CSV quotes. Force a literal string.
  const quote=value=>{let cell=String(value);
   if(/^[\s\uFEFF]*[=+\-@]/u.test(cell))cell="'"+cell;
   return '"'+cell.replace(/"/g,'""')+'"';};
  const lines=[['Team','Player','Status','Active seconds observed','Available']];
  for(const p of confirmed.people){
   lines.push([p.team===1?'Red':p.team===2?'Blue':p.bench===1?'Red bench':
    p.bench===2?'Blue bench':'Spectator',p.name,
    p.team===0?'Inactive':'Playing',p.seconds??'Unavailable',p.available?'yes':'reconnecting']);
  }
  const csv='\ufeff'+lines.map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=mk('a');a.href=url;a.download='fuckball-room-rotation-snapshot.csv';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
  notice.textContent='Local roster CSV exported. No server data changed.';
 };
 section.addEventListener('toggle',()=>{if(section.open)render(true);else hideExport();});
 // The panel starts hidden before a room exists. Poll for the first genuine
 // server state as well as later changes; never make hidden DOM block discovery.
 window.addEventListener('fuckball:native-session-state',()=>render(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(true);});
 setInterval(()=>{if(!document.hidden)render();},2400);
 render();
})();