'use strict';
// Read-only on-device view of server-reported applied native substitutions.
// The actual authoritative consent/pause/roster mechanics stay in room-core.
(function(){
 const host=document.getElementById('subPanel');
 if(!host)return;
 const element=(tag,text,klass)=>{const x=document.createElement(tag);
  if(text!==undefined)x.textContent=String(text);if(klass)x.className=klass;return x;};
 const panel=element('details',null,'native-sub-timeline');
 const summary=element('summary','SUBSTITUTION TIMELINE · ACTUAL COMPLETED SWAPS');
 const help=element('p','Recent swaps actually applied by this live Custom Room server. Pending requests and failed or rejected requests are NOT counted. This is a bounded room observation, not a signed league result or complete match history.');
 const bar=element('div',null,'native-sub-timeline-controls');
 const filter=element('select');filter.setAttribute('aria-label','Show native substitutions by team');
 for(const [v,l] of [['all','Both teams'],['1','Red only'],['2','Blue only']])filter.add(new Option(l,v));
 const refresh=element('button','↻ Refresh timeline'),save=element('button','↓ Save snapshot CSV');
 refresh.type=save.type='button';bar.append(filter,refresh,save);
 const status=element('p','No current Custom Room.','native-sub-timeline-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const list=element('ol',null,'native-sub-timeline-list');
 panel.append(summary,help,bar,status,list);host.append(panel);
 let observed=null,signature='',roomKey='';
 const positive=x=>Number.isSafeInteger(x)&&x>0&&x<=2147483647;
 function snapshot(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||link.quickMatchMode||!link.roomState)return null;
  const current=link.roomState;
  const round=Number.isSafeInteger(current.round)&&current.round>=0?current.round:null;
  const events=Array.isArray(current.recentSubs)?current.recentSubs:[];
  if(events.length>8)return null;
  const players=new Map();
  if(Array.isArray(room?.state?.players)&&room.state.players.length<=128)
   for(const p of room.state.players)
    if(positive(p?.id)&&typeof p.name==='string')
     players.set(p.id,p.name.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim().slice(0,25)||'Player');
  const seen=new Set(),parsed=[];
  for(const event of events){
   if(!event||![1,2].includes(event.team)||
    !positive(event.inId)||!positive(event.outId)||!positive(event.requestId)||
    event.inId===event.outId||!Number.isSafeInteger(event.frame)||
    event.frame<0||event.frame>1000000000)continue;
   const key=event.requestId+':'+event.frame;
   if(seen.has(key))continue;
   seen.add(key);
   parsed.push({team:event.team,inId:event.inId,outId:event.outId,frame:event.frame,
    inName:players.get(event.inId)||'Player no longer visible',
    outName:players.get(event.outId)||'Player no longer visible'});
  }
  parsed.sort((a,b)=>b.frame-a.frame||a.team-b.team);
  return{key:link.room,round,events:parsed};
 }
 function display(force=false){
  const live=snapshot();
  if(!live){panel.hidden=true;observed=null;signature='';roomKey='';list.replaceChildren();return;}
  panel.hidden=false;
  const key=JSON.stringify([live.key,live.round,live.events,filter.value]);
  if(!force&&key===signature)return;
  if(roomKey&&roomKey!==live.key){panel.open=false;status.textContent='Room changed; previous observations discarded.';}
  signature=key;roomKey=live.key;observed=live;
  const selected=live.events.filter(e=>filter.value==='all'||e.team===Number(filter.value));
  list.replaceChildren();
  status.textContent=live.events.length?
   selected.length+' shown of '+live.events.length+' recent native completed swaps'+
   (live.round!==null?' · round '+live.round:' · round unavailable'):
   'No completed substitution appears in the current server-reported recent event window.';
  for(const e of selected){
   const row=element('li',null,'native-sub-timeline-row');
   row.append(element('strong',(e.team===1?'RED':'BLUE')+' · '+e.outName+' → '+e.inName),
    element('small','Native room frame '+e.frame+' · completed server-side substitution'));
   list.append(row);
  }
  if(!selected.length&&live.events.length)list.append(element('li','No swaps on this selected side.'));
  save.disabled=!selected.length;
 }
 filter.onchange=()=>{signature='';display(true);};
 refresh.onclick=()=>{display(true);if(observed)status.textContent+=' · refreshed';};
 save.onclick=()=>{
  const current=snapshot();
  if(!current||current.key!==observed?.key||current.round!==observed?.round){
   status.textContent='Room or round changed. Refresh before exporting.';display(true);return;
  }
  const rows=current.events.filter(e=>filter.value==='all'||e.team===Number(filter.value));
  if(!rows.length){status.textContent='Nothing to export.';return;}
  if(!window.confirm('Export the currently visible player names and native substitution events to a private local CSV file?'))return;
  // Spreadsheet programs may execute user-provided cells beginning with an
  // Excel formula prefix even inside CSV quotes. Force a literal string.
  const quote=value=>{let cell=String(value);
   if(/^[\s\uFEFF]*[=+\-@]/u.test(cell))cell="'"+cell;
   return '"'+cell.replace(/"/g,'""')+'"';};
  const lines=[['Side','Outgoing player','Incoming player','Native room frame','Limitations'],
   ...rows.map(e=>[e.team===1?'Red':'Blue',e.outName,e.inName,e.frame,
    'Locally observed server-applied swap; not official competition evidence'])];
  const data='\ufeff'+lines.map(row=>row.map(quote).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
  const a=element('a');a.href=url;a.download='fuckball-native-substitutions.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  status.textContent='Private snapshot exported; no server state changed.';
 };
 panel.addEventListener('toggle',()=>{if(panel.open)display(true);});
 setInterval(()=>{if(!document.hidden)display();},2400);
 display();
})();