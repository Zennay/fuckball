'use strict';
// Server-authoritative pre-kickoff presence. No local ready claims, match starts,
// or ranked/Quick Match participation are created by this panel.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const el=(tag,content,cls)=>{
  const node=document.createElement(tag);
  if(content!==undefined&&content!==null)node.textContent=String(content);
  if(cls)node.className=cls;
  return node;
 };
 const panel=el('section',null,'native-lobby-ready');
 panel.setAttribute('aria-label','Custom Room pre-match readiness');
 panel.hidden=true;
 const heading=el('div',null,'native-lobby-ready-header');
 heading.append(el('strong','KICKOFF READY CHECK.'),el('span','HUMANS · CUSTOM ROOM'));
 const intro=el('p','Confirm your own readiness before kickoff. The server tracks real active players; spectators and AI never count. This is advisory: only the host can start the actual match.');
 const progress=el('p',null,'native-lobby-ready-progress');
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const list=el('ul',null,'native-lobby-ready-roster');
 const controls=el('div',null,'native-lobby-ready-actions');
 const toggle=el('button','I AM READY');toggle.type='button';toggle.className='primary';
 toggle.setAttribute('aria-pressed','false');
 const refresh=el('button','Refresh room state');refresh.type='button';
 controls.append(toggle,refresh);
 const note=el('p',null,'native-lobby-ready-note');
 note.textContent='Each active human must opt in. Moving team, disconnecting or starting a new round clears readiness. Host kickoff still uses the original Start button.';
 panel.append(heading,intro,progress,list,controls,note);
 const anchor=document.getElementById('subPanel');
 if(anchor?.parentElement===pane)anchor.insertAdjacentElement('beforebegin',panel);
 else pane.append(panel);
 let lastSignature='';
 function render(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!state){
   panel.hidden=true;lastSignature='';return;
  }
  panel.hidden=!!state.started;
  if(panel.hidden)return;
  const available=Array.isArray(state.lobbyReadyIds)&&state.lobbyReadyIds.length<=128;
  if(!available){
   toggle.disabled=true;refresh.disabled=true;list.replaceChildren();
   progress.textContent='This room server does not expose player readiness yet.';
   note.textContent='Only server-authoritative ready status is accepted. Existing Start controls remain available.';
   return;
  }
  note.textContent='Every player opts in themselves. An advisory ready check never starts, pauses, ranks or edits a match.';
  const confirmed=new Set(state.lobbyReadyIds.filter(Number.isSafeInteger));
  const absent=new Set(Array.isArray(state.disconnectedIds)?state.disconnectedIds:[]);
  const native=typeof room!=='undefined'?room?.state?.players:[];
  const active=(Array.isArray(native)?native:[]).filter(p=>
   Number.isSafeInteger(p?.id)&&!botIds.has(p.id)&&!absent.has(p.id)&&
   [1,2].includes(p?.team?.id));
  const own=active.find(p=>p.id===networkPlayerId);
  const chosen=!!own&&confirmed.has(own.id);
  const ready=active.filter(p=>confirmed.has(p.id)).length;
  const signature=JSON.stringify([state.round,state.started,networkPlayerId,active.map(p=>[p.id,p.name,p.team?.id]),[...confirmed].sort((a,b)=>a-b)]);
  if(signature!==lastSignature){
   lastSignature=signature;list.replaceChildren();
   const order=[...active].sort((a,b)=>a.team.id-b.team.id||a.id-b.id);
   for(const p of order.slice(0,16)){
    const row=el('li',null,'native-lobby-ready-player');
    const name=el('span',(p.team.id===1?'RED · ':'BLUE · ')+(p.name||'Player '+p.id)+(p.id===networkPlayerId?' · YOU':''));
    const marker=el('span',confirmed.has(p.id)?'✓ READY':'○ WAITING');
    marker.className=confirmed.has(p.id)?'is-ready':'is-waiting';
    row.append(name,marker);list.append(row);
   }
   if(!active.length)list.append(el('li','Waiting for the real native player roster…'));
  }
  progress.textContent=active.length?
   ready+' / '+active.length+' connected active humans ready'+(ready===active.length?' · Team is ready for host kickoff':' · Awaiting players'):
   'No active connected humans to ready up yet.';
  toggle.disabled=!own;
  toggle.textContent=chosen?'CHANGE TO NOT READY':'I AM READY';
  toggle.setAttribute('aria-pressed',String(chosen));
  refresh.disabled=false;
 }
 toggle.onclick=()=>{
  const link=serverLink,state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!Array.isArray(state?.lobbyReadyIds)||state.started)return;
  const myId=networkPlayerId;
  const own=room?.state?.players?.find?.(p=>p.id===myId);
  if(![1,2].includes(own?.team?.id)||botIds.has(myId)||
   state.disconnectedIds?.includes(myId))return;
  const current=state.lobbyReadyIds.includes(myId);
  link.send({type:'lobbyReady',ready:!current});
  progress.textContent='Sending your own readiness to the room server…';
 };
 refresh.onclick=render;
 const shown=()=>typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
 setInterval(()=>{if(shown())render();else panel.hidden=true;},1100);
 render();
})();
