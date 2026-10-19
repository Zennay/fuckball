'use strict';
// Capture visible native Custom Room disc positions for an independent private
// tactics plan; never mutates a match, player input, stadium or network state.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const node=(tag,text,cls)=>{const e=document.createElement(tag);
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;return e;};
 const panel=node('section',null,'live-formation-capture');
 panel.hidden=true;panel.setAttribute('aria-label','Save current room shape to private tactics studio');
 panel.append(node('strong','LIVE FORMATION CAPTURE'));
 panel.append(node('p','Save the actual currently received positions of eight native on-pitch players as a new private tactical diagram. No players, chat, names, results, accounts or positions are uploaded; snapshots are personal and do not control a real team.'));
 const button=node('button','Capture native 4v4 positions');
 button.type='button';button.className='primary';
 const status=node('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=node('small','Requires exactly four Red and four Blue active discs. Visible native pitch lines are copied when available; otherwise the generic board is used. Ball marker stays at centre. No player names or match data are copied.');
 panel.append(button,status,note);pane.append(panel);
 const valid=n=>Number.isFinite(n)&&Math.abs(n)<=1e6;
 function observe(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||link.quickMatchMode||typeof replay!=='undefined'&&replay||
   !room?.state?.players||!Array.isArray(room.state.players)||room.state.players.length>128)return null;
  const state=room.state,stadium=state.stadium;
  if(!stadium||!valid(stadium.width)||!valid(stadium.height)||
   stadium.width<100||stadium.height<100||stadium.width>10000||stadium.height>10000)return null;
  const offline=new Set(Array.isArray(link.roomState?.disconnectedIds)?
   link.roomState.disconnectedIds:[]);
  const participants=[[],[]],seen=new Set();
  for(const p of state.players){
   const team=typeof p?.team==='number'?p.team:p?.team?.id;
   if(![1,2].includes(team))continue;
   if(!Number.isSafeInteger(p.id)||p.id<=0||seen.has(p.id))return null;
   seen.add(p.id);
   if(offline.has(p.id)||!p.disc||!valid(p.disc.pos?.x)||!valid(p.disc.pos?.y))return null;
   participants[team-1].push(p);
  }
  if(participants.some(list=>list.length!==4))return null;
  const coordinate=(point,bound)=>Math.max(30,Math.min(970,
   Math.round(500+450*point/bound)));
  // Stable disc-slot ordering only: no names or user identifiers are retained.
  const spots=participants.flatMap(list=>list.sort((a,b)=>a.id-b.id).map(p=>
   [coordinate(p.disc.pos.x,stadium.width),coordinate(p.disc.pos.y,stadium.height)]));
  spots.push([500,500]); // Native ball source not guaranteed in all host transports.
  // Copy only visible pitch geometry, never a room URL or user-supplied name
  // embedded in live settings. The existing Studio also re-validates its shape.
  let geometry=null;
  try{
   if(typeof Utils!=='undefined'&&typeof Utils.exportStadium==='function'&&
    typeof JSON5!=='undefined'&&typeof JSON5.parse==='function'){
    const raw=JSON5.parse(Utils.exportStadium(stadium)),vertices=raw.vertexes;
    if(Array.isArray(vertices)&&Array.isArray(raw.segments)){
     const lines=[];
     for(const segment of raw.segments){
      if(lines.length>=160)break;
      if(segment?.vis===false||!Number.isSafeInteger(segment?.v0)||
       !Number.isSafeInteger(segment?.v1))continue;
      const p=vertices[segment.v0],q=vertices[segment.v1];
      if(!p||!q||![p.x,p.y,q.x,q.y].every(valid))continue;
      lines.push([[coordinate(p.x,stadium.width),coordinate(p.y,stadium.height)],
       [coordinate(q.x,stadium.width),coordinate(q.y,stadium.height)]]);
     }
     if(lines.length)geometry={name:String(stadium.name||'Native pitch').slice(0,45),
      width:Math.round(stadium.width),height:Math.round(stadium.height),lines};
    }
   }
  }catch{/* A custom stadium may not expose parseable visible lines; keep the default private board. */}
  return{spots,at:Date.now(),stadium:String(stadium.name||'Native room').slice(0,45),
   geometry,teamSizes:[4,4]};
 }
 function show(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  panel.hidden=!(link?.room&&!link.quickMatchMode);
  if(panel.hidden){status.textContent='';return;}
  const ready=observe();
  button.disabled=!ready;
  if(!ready)status.textContent='Waiting for an eligible native 4v4 snapshot (four connected discs per side).';
  else status.textContent='Ready · '+ready.stadium+' · eight actual native disc positions observed.';
 }
 button.onclick=()=>{
  const snapshot=observe();
  if(!snapshot){status.textContent='The native roster changed; nothing was saved.';show();return;}
  if(!window.confirm('Save these eight observed disc positions to a new private Formation Studio plan? No player names or account data will be included.'))return;
  const detail={version:1,source:'custom-room-local-snapshot',spots:snapshot.spots,at:snapshot.at,
   stadium:snapshot.stadium,geometry:snapshot.geometry,saved:false,message:''};
  window.dispatchEvent(new CustomEvent('fuckball:private-live-formation',{detail}));
  status.textContent=detail.saved?'Private formation saved. Open Formation Studio on Home to edit or export it.':
   (detail.message||'Formation Studio did not accept this snapshot.');
 };
 const refresh=()=>{
  if(!document.hidden&&typeof menuOpen!=='undefined'&&menuOpen)show();
  else if(!panel.hidden&&!(typeof serverLink!=='undefined'&&serverLink?.room))show();
 };
 setInterval(refresh,1800);
 show();
})();