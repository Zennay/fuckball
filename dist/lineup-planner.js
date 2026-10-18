'use strict';
// Client-side Custom Room lineup planner. Server remains sole team authority;
// never auto-substitutes, changes ranked games or modifies a running match.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const section=document.createElement('section');section.className='lineup-planner';section.hidden=true;
 const header=document.createElement('div');header.className='lineup-planner-header';
 const title=document.createElement('h3');title.textContent='MATCHDAY LINEUP.';
 const label=document.createElement('span');label.textContent='CUSTOM ROOM HOST · PREGAME';
 header.append(title,label);
 const intro=document.createElement('p');
 intro.textContent='Prepare Red, Blue and spectator/bench places for the current connected roster. Preview before applying. Changes are available only before a match starts; in-game substitutions use the existing consent and referee rules.';
 const tools=document.createElement('div');tools.className='lineup-planner-actions';
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Read current room';
 const apply=document.createElement('button');apply.type='button';apply.className='primary';
 apply.textContent='Apply lineup to room';apply.disabled=true;
 tools.append(refresh,apply);
 const rowList=document.createElement('div');rowList.className='lineup-planner-roster';
 const summary=document.createElement('p');summary.className='lineup-planner-summary';
 summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
 const status=document.createElement('p');status.className='lineup-planner-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 section.append(header,intro,tools,rowList,summary,status);
 const admin=document.querySelector('.room-admin-panel');
 if(admin?.parentElement===pane)admin.insertAdjacentElement('afterend',section);
 else pane.append(section);
 let base=null,plan=new Map(),dirty=false;
 function permitted(){
  return !!serverLink?.room&&serverLink.isOwner===true&&!serverLink.quickMatchMode&&
   typeof room!=='undefined'&&room&&
   !document.getElementById('matchView').hidden;
 }
 function players(){
  const all=room?.state?.players;
  return Array.isArray(all)?all.filter(p=>
   Number.isSafeInteger(p?.id)&&p.id>0&&[0,1,2].includes(p.team?.id)).slice(0,128):[];
 }
 function human(p){
  return p.aiControlled!==true&&!(typeof botIds!=='undefined'&&botIds?.has?.(p.id));
 }
 function current(){
  const all=players(),humans=all.filter(human);
  humans.sort((a,b)=>a.team.id-b.team.id||a.id-b.id);
  const signature=JSON.stringify(humans.map(p=>[p.id,p.team.id,p.name]));
  return {all,humans,signature,room:serverLink?.room};
 }
 function countTeams(snapshot){
  const counts={red:0,blue:0,bench:0},names=[];
  for(const p of snapshot.all){
   const desired=human(p)?plan.get(p.id)??p.team.id:p.team.id;
   if(desired===1)counts.red++;
   else if(desired===2)counts.blue++;
   else counts.bench++;
  }
  return counts;
 }
 function updatePreview(){
  if(!base)return;
  const latest=current();
  if(latest.room!==base.room||latest.signature!==base.signature){
   apply.disabled=true;summary.textContent='Room roster changed. Refresh the lineup before editing or applying.';
   return;
  }
  const counts=countTeams(latest);
  const changed=base.humans.filter(p=>(plan.get(p.id)??p.team.id)!==p.team.id).length;
  const valid=counts.red<=4&&counts.blue<=4;
  const lobby=typeof started!=='undefined'&&!started;
  const online=serverLink?.ws?.readyState===1;
  apply.disabled=!valid||!lobby||!online||changed===0;
  summary.textContent='Red '+counts.red+'/4 · Blue '+counts.blue+'/4 · Bench / spectators '+
   counts.bench+' · '+changed+' proposed changes. '+(!valid?
    'Too many active players; move someone to bench first.':
    !lobby?'Match is running; lineup changes require the pregame lobby.':
    !online?'Wait for the room server connection.':
    changed?'Ready to request host-authorized changes.':'Choose a different team for a player.');
 }
 function paint(){
  if(!permitted()){section.hidden=true;base=null;plan.clear();return;}
  section.hidden=false;rowList.replaceChildren();
  base=current();plan=new Map(base.humans.map(p=>[p.id,p.team.id]));dirty=false;
  if(!base.humans.length){
   status.textContent='No human players in this room yet.';updatePreview();return;
  }
  for(const p of base.humans){
   const item=document.createElement('label');item.className='lineup-planner-player';
   const name=document.createElement('span');name.textContent=String(p.name||'Player').slice(0,30)+' · #'+p.id;
   const select=document.createElement('select');
   select.setAttribute('aria-label','Planned team for '+String(p.name||'Player').slice(0,30));
   for(const [value,title] of [[1,'Red active'],[2,'Blue active'],[0,'Bench / spectator']]){
    select.add(new Option(title,String(value)));
   }
   select.value=String(p.team.id);
   select.onchange=()=>{
    if(!base||base.room!==serverLink?.room)return;
    plan.set(p.id,Number(select.value));dirty=true;updatePreview();
   };
   item.append(name,select);rowList.append(item);
  }
  status.textContent='Plan is private to this browser tab until you press Apply. No automatic moves.';
  updatePreview();
 }
 refresh.onclick=paint;
 apply.onclick=()=>{
  if(!permitted()||!base||!dirty)return;
  if(typeof started==='undefined'||started){
   status.textContent='This action is unavailable after match start; use normal authorized substitutions.';
   return;
  }
  const latest=current();
  if(latest.room!==base.room||latest.signature!==base.signature){
   status.textContent='The connected roster changed. Refresh your plan; nothing was sent.';
   apply.disabled=true;return;
  }
  const counts=countTeams(latest);
  if(counts.red>4||counts.blue>4){status.textContent='Maximum four active players per side. No changes sent.';return;}
  const moves=base.humans.filter(p=>plan.get(p.id)!==p.team.id);
  if(!moves.length){status.textContent='No lineup changes to apply.';return;}
  if(serverLink?.ws?.readyState!==1){status.textContent='Not connected to the room server. No changes sent.';return;}
  const names=moves.slice(0,6).map(p=>String(p.name||'Player').slice(0,25)).join(', ');
  if(!window.confirm('Request '+moves.length+' pregame team changes for '+names+
     (moves.length>6?' and others':'')+'? The server will authorize each move, and nobody is moved during a running game.'))return;
  if(!permitted()||started||serverLink.room!==base.room||
     current().signature!==base.signature){
   status.textContent='Room state changed before submission. Nothing sent. Refresh the lineup.';apply.disabled=true;return;
  }
  // First clear active places, then fill selected sides. Ordered WebSocket
  // requests avoid temporary full-team rejection when players swap sides.
  try{
   for(const p of moves)if(p.team.id!==0)
    serverLink.send({type:'team',id:p.id,team:0});
   for(const p of moves)if(plan.get(p.id)!==0)
    serverLink.send({type:'team',id:p.id,team:plan.get(p.id)});
   apply.disabled=true;dirty=false;
   status.textContent='Lineup requests sent. Server authorization and fresh room snapshots decide the actual teams. Refresh to confirm.';
  }catch{
   status.textContent='Could not send all lineup requests. The server state is authoritative; refresh the roster.';
   apply.disabled=true;
  }
 };
 // Read-only UI refresh; do not reset an unfinished draft on every redraw.
 window.setInterval(()=>{
  if(!permitted()){
   if(!section.hidden){section.hidden=true;base=null;plan.clear();}
   return;
  }
  if(section.hidden){paint();return;}
  if(base)updatePreview();
 },1000);
})();
