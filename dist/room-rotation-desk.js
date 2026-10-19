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
 const notice=mk('p',null,'room-rotation-notice');
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 section.append(heading,help,settings,context,rows,suggestions,notice);
 host.append(section);
 let latest=null,signature='',roomToken=null;
 const validId=n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647;
 const validFrames=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
 const nativeTeam=p=>typeof p?.team==='number'?p.team:p?.team?.id;
 function clear(){
  latest=null;signature='';roomToken=null;
  rows.replaceChildren();suggestions.replaceChildren();notice.textContent='';
 }
 function snapshot(){
  const link=typeof serverLink==='undefined'?null:serverLink;
  const state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!state||
   !Array.isArray(room?.state?.players)||room.state.players.length>128)return null;
  const disconnected=new Set(Array.isArray(state.disconnectedIds)?state.disconnectedIds:[]);
  const benches=new Map(Array.isArray(state.benches)?state.benches:[]);
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
    bench:team===0&&[1,2].includes(preferred)?preferred:null});
  }
  const desired=Number(side.value)===2?2:1;
  const active=people.filter(p=>p.team===desired);
  const waiting=people.filter(p=>p.team===0&&p.bench===desired);
  const idle=people.filter(p=>p.team===0&&p.bench===null);
  const captain=captains.get(desired);
  const mayPropose=!!link.isOwner||captain===networkPlayerId;
  const pendingTeam=pending.some(p=>p?.team===desired);
  const total=validFrames(state.round)?state.round:null;
  return{token:link.room,desired,people,active,waiting,idle,mayPropose,
   captain:validId(captain)?captain:null,pendingTeam,owner:!!link.isOwner,round:total};
 }
 const elapsed=s=>s===null?'not measured':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';
 function rankedCandidate(items,descending){
  const available=items.filter(p=>p.available&&p.seconds!==null);
  available.sort((a,b)=>(descending?b.seconds-a.seconds:a.seconds-b.seconds)||a.id-b.id);
  return available[0]||null;
 }
 function display(list,title){
  const box=mk('section',null,'room-rotation-list');
  box.append(mk('h4',title+' · '+list.length));
  if(!list.length){box.append(mk('p','Nobody currently listed.'));return box;}
  const ol=mk('ol');
  for(const p of [...list].sort((a,b)=>(b.available-a.available)||((b.seconds??-1)-(a.seconds??-1))||a.id-b.id)){
   const row=mk('li');
   row.append(mk('span',p.name+(p.id===networkPlayerId?' · YOU':'')+(p.available?'':' · RECONNECTING')),
    mk('small',elapsed(p.seconds)));
   ol.append(row);
  }
  box.append(ol);return box;
 }
 function nativePrepare(outgoing,incoming){
  const data=snapshot();
  if(!data||data.token!==latest?.token||data.desired!==latest?.desired||
   !data.mayPropose||data.pendingTeam||
   !data.active.some(p=>p.id===outgoing.id&&p.available)||
   !data.waiting.some(p=>p.id===incoming.id&&p.available)){
   notice.textContent='Room or permissions changed. Refresh the desk; no swap was proposed.';render(true);return;
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
 function render(force=false){
  const data=snapshot();
  if(!data){section.hidden=true;clear();return;}
  section.hidden=false;
  const key=JSON.stringify([data.token,data.desired,data.round,data.owner,data.captain,
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
    '). This is an optional playing-time suggestion, not an automatic coaching or skill judgment.');
   const fill=mk('button','Prepare '+outgoing.name+' → '+incoming.name);
   fill.type='button';fill.disabled=!data.mayPropose||data.pendingTeam;
   fill.onclick=()=>nativePrepare(outgoing,incoming);
   suggestions.append(title,reason,fill);
   if(!data.mayPropose)suggestions.append(mk('small','Only the actual native room host or this team’s appointed captain can propose.'));
   if(data.pendingTeam)suggestions.append(mk('small','A prior substitution must finish or expire first.'));
  }
  download.disabled=!data.people.length;
 }
 side.onchange=()=>{signature='';render(true);};
 refresh.onclick=()=>{render(true);notice.textContent='Refreshed from the current native room snapshot.';};
 download.onclick=()=>{
  const data=snapshot();if(!data||data.token!==latest?.token||!data.people.length){
   notice.textContent='The room has changed; refresh before exporting.';return;
  }
  if(!window.confirm('Export displayed player names and their currently observed playing time to a private CSV file?'))return;
  const quote=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const lines=[['Team','Player','Status','Active seconds observed','Available']];
  for(const p of data.people){
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
 section.addEventListener('toggle',()=>{if(section.open)render(true);});
 setInterval(()=>{if(section.open&&!document.hidden)render();else if(!section.hidden)render();},2400);
 render();
})();