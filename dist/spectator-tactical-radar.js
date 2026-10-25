'use strict';
// Local tactical radar for spectators. Reads actual native room coordinates;
// never sends match input, changes game state, infers a winner, or uploads data.
(function(){
 const match=document.getElementById('matchView');
 const toolbar=typeof spectatorToolbar!=='undefined'?spectatorToolbar:null;
 if(!match||!toolbar||typeof isSpectatorCamera!=='function')return;
 const KEY='fuckball.spectator-radar.v1';
 const defaults={trails:true,side:'both'},options={...defaults};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
   if(typeof saved.trails==='boolean')options.trails=saved.trails;
   if(['both','red','blue'].includes(saved.side))options.side=saved.side;
  }
 }catch{}
 const toggle=document.createElement('button');
 toggle.type='button';toggle.className='spectator-radar-toggle';
 toggle.textContent='◉ RADAR';toggle.setAttribute('aria-label','Open tactical spectator radar');
 toggle.setAttribute('aria-expanded','false');
 toolbar.append(toggle);
 const panel=document.createElement('section');panel.className='spectator-radar';
 panel.hidden=true;panel.setAttribute('aria-label','Live tactical spectator radar');
 const heading=document.createElement('div');heading.className='spectator-radar-header';
 const title=document.createElement('strong');title.textContent='TACTICAL RADAR';
 const close=document.createElement('button');close.type='button';close.textContent='✕';
 close.setAttribute('aria-label','Close tactical radar');
 heading.append(title,close);
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=380;
 canvas.setAttribute('aria-label','Birds-eye tactical field showing only current real player and ball positions');
 canvas.setAttribute('role','img');canvas.tabIndex=0;
 const legend=document.createElement('div');legend.className='spectator-radar-legend';
 const red=document.createElement('span');red.textContent='● Red';
 const blue=document.createElement('span');blue.textContent='● Blue';
 const ball=document.createElement('span');ball.textContent='● Ball';
 legend.append(red,blue,ball);
 const controls=document.createElement('div');controls.className='spectator-radar-controls';
 const sideLabel=document.createElement('label');sideLabel.textContent='Show team';
 const side=document.createElement('select');side.setAttribute('aria-label','Radar displayed teams');
 for(const [value,label] of [['both','Both teams'],['red','Red only'],['blue','Blue only']])side.add(new Option(label,value));
 side.value=options.side;sideLabel.append(side);
 const trailLabel=document.createElement('label');trailLabel.className='spectator-radar-trail';
 const trails=document.createElement('input');trails.type='checkbox';trails.checked=options.trails;
 trailLabel.append(trails,document.createTextNode(' 15s player trails'));
 const download=document.createElement('button');download.type='button';download.textContent='↓ Save radar PNG';
 controls.append(sideLabel,trailLabel,download);
 const message=document.createElement('p');message.className='spectator-radar-message';
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 message.textContent='Spectator only · tap a player dot to follow the actual player.';
 const hint=document.createElement('p');hint.className='spectator-radar-hint';
 hint.textContent='Recorded or live positions are only a local view. Movement paths are not saved; downloaded PNG is a single unverified field snapshot.';
 panel.append(heading,canvas,legend,controls,message,hint);match.append(panel);
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx){toggle.disabled=true;return;}
 const W=canvas.width,H=canvas.height,PAD=25,INNER_W=W-PAD*2,INNER_H=H-PAD*2;
 const tracks=new Map();
 let open=false,roomRef=null,roomId='',lastSample=0,lastPaint=0,lastNotice=0,hits=[];
 let previousClock=null,previousScore=null,previousField=null;
 function saveSettings(){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,trails:options.trails,side:options.side}));}
  catch{message.textContent='Preferences apply for this visit; local storage unavailable.';}
 }
 function eligible(){
  if(document.hidden||match.hidden||typeof replay!=='undefined'&&replay||
    !isSpectatorCamera()||document.getElementById('pauseMenu')?.hidden===false)return false;
  return typeof room!=='undefined'&&!!room;
 }
 // Only current authoritative WebSocket snapshots can drive a live native
 // radar. Do not export, follow or trail unobserved server positions.
 function freshNativeFrame(){
  if(!serverLink?.room)return true; // Local Watch Bots uses local physics.
  if(serverLink.roomState?.started!==true||serverLink.roomState?.paused===true)return false;
  const at=typeof net!=='undefined'?net?.lastSnapshot:0;
  const age=performance.now()-at;
  return Number.isFinite(at)&&at>0&&age>=0&&age<=3500;
 }
 function reset(){
  tracks.clear();hits=[];lastSample=0;lastPaint=0;
  previousClock=null;previousScore=null;previousField=null;
 }
 function hide(){
  open=false;panel.hidden=true;toggle.setAttribute('aria-expanded','false');
 }
 function point(x,y,width,height){
  return {x:PAD+(x/width+1)*INNER_W/2,y:PAD+(y/height+1)*INNER_H/2};
 }
 function sample(){
  if(!freshNativeFrame())return null;
  const current=room;
  const state=current?.state;
  const game=current?.gameState;
  const st=state?.stadium||typeof stadium!=='undefined'&&stadium;
  const width=Number(st?.width),height=Number(st?.height);
  if(!game?.physicsState?.discs?.[0]?.pos||!Number.isFinite(width)||
     !Number.isFinite(height)||width<10||height<10||width>10000||height>10000)return null;
  const ball=game.physicsState.discs[0].pos;
  if(!Number.isFinite(ball?.x)||!Number.isFinite(ball?.y))return null;
  const raw=state?.players;
  if(!Array.isArray(raw))return null;
  const players=raw.filter(p=>Number.isSafeInteger(p?.id)&&p.id>=0&&
   [1,2].includes(p.team?.id)&&Number.isFinite(p.disc?.pos?.x)&&
   Number.isFinite(p.disc?.pos?.y)).slice(0,128)
   .map(p=>({id:p.id,side:p.team.id,
    name:String(p.name||'Player').slice(0,25),x:p.disc.pos.x,y:p.disc.pos.y}));
  return {width,height,ball:{x:ball.x,y:ball.y},players};
 }
 function teamVisible(sideId){
  return options.side==='both'||options.side==='red'&&sideId===1||
   options.side==='blue'&&sideId===2;
 }
 function field(){
  ctx.fillStyle='#102c28';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#285a46';ctx.fillRect(PAD,PAD,INNER_W,INNER_H);
  ctx.strokeStyle='#b9d6c0';ctx.lineWidth=3;
  ctx.strokeRect(PAD,PAD,INNER_W,INNER_H);
  ctx.beginPath();ctx.moveTo(W/2,PAD);ctx.lineTo(W/2,H-PAD);ctx.stroke();
  ctx.beginPath();ctx.arc(W/2,H/2,49,0,Math.PI*2);ctx.stroke();
  ctx.strokeRect(PAD,H/2-90,86,180);
  ctx.strokeRect(W-PAD-86,H/2-90,86,180);
  ctx.strokeRect(PAD-10,H/2-48,10,96);
  ctx.strokeRect(W-PAD,H/2-48,10,96);
 }
 function render(now){
  const data=sample();
  ctx.clearRect(0,0,W,H);field();hits=[];
  if(!data){
   // A disconnected/paused/ended source must not leave old trails or
   // selectable hit targets behind a visually updated, frozen radar.
   reset();
   const waiting=!!serverLink?.room&&!freshNativeFrame();
   const detail=waiting?'Waiting for fresh server frames':'Waiting for real match positions';
   ctx.fillStyle='#f5fbf4';ctx.textAlign='center';ctx.font='bold 22px sans-serif';
   ctx.fillText(detail,W/2,H/2-10);
   if(message.textContent!==detail+' · no live positions to follow or export.')
    message.textContent=detail+' · no live positions to follow or export.';
   download.disabled=true;return;
  }
  download.disabled=false;
  const roomKey=serverLink?.room||'local-spectator';
  if(roomRef!==room||roomId!==roomKey){roomRef=room;roomId=roomKey;reset();}
  // Do not connect a previous round's or an unobserved interval's positions
  // to the new live positions. These trails are explicitly local
  // observations, not a replay or server-attested player route.
  const g=room?.gameState;
  const seconds=Number(g?.timeElapsed);
  const red=Number(g?.redScore),blue=Number(g?.blueScore);
  const clock=Number.isFinite(seconds)&&seconds>=0?seconds:null;
  const score=[red,blue].every(Number.isSafeInteger)&&red>=0&&blue>=0?
   {red,blue}:null;
  const field=data.width+':'+data.height;
  const newRound=clock!==null&&previousClock!==null&&clock+0.5<previousClock||
   score!==null&&previousScore!==null&&
    (score.red<previousScore.red||score.blue<previousScore.blue);
  const newField=previousField!==null&&field!==previousField;
  const missingTime=lastSample>0&&now-lastSample>3500;
  if(newRound||newField||missingTime){
   reset();
   message.textContent=newRound?'New round or scoreboard reset: older player trails cleared.':
    newField?'Stadium dimensions changed: old trails cleared.':
    'Live position updates were missed: older trails cleared rather than inventing paths.';
  }
  previousClock=clock;previousScore=score;previousField=field;
  if(now-lastSample>=350){
   lastSample=now;
   const activeIds=new Set(data.players.map(p=>p.id));
   for(const id of tracks.keys())if(!activeIds.has(id))tracks.delete(id);
   for(const player of data.players){
    // A player switching sides must not draw a false same-team path
    // linking an old red or blue role to a new formation.
    if(tracks.has(player.id)&&tracks.get(player.id).at(-1)?.side!==player.side)
     tracks.delete(player.id);
    if(!tracks.has(player.id))tracks.set(player.id,[]);
    const path=tracks.get(player.id);
    path.push({x:player.x,y:player.y,at:now,side:player.side});
    while(path.length>42||path.length&&now-path[0].at>15000)path.shift();
   }
  }
  if(options.trails){
   for(const [id,path] of tracks){
    if(path.length<2||!teamVisible(path[0].side))continue;
    for(let k=1;k<path.length;k++){
     const a=path[k-1],b=path[k],opacity=Math.max(.05,1-(now-b.at)/15000);
     const A=point(a.x,a.y,data.width,data.height);
     const B=point(b.x,b.y,data.width,data.height);
     ctx.strokeStyle=a.side===1?'rgba(255,147,150,'+(opacity*.58)+')':
      'rgba(145,187,255,'+(opacity*.58)+')';
     ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
    }
   }
  }
  const chosen=typeof spectatorTargetId!=='undefined'?spectatorTargetId:null;
  for(const player of data.players){
   if(!teamVisible(player.side))continue;
   const at=point(player.x,player.y,data.width,data.height);
   const cx=Math.max(PAD,Math.min(W-PAD,at.x));
   const cy=Math.max(PAD,Math.min(H-PAD,at.y));
   if(player.id===chosen){
    ctx.beginPath();ctx.strokeStyle='#f3f5a4';ctx.lineWidth=4;
    ctx.arc(cx,cy,15,0,Math.PI*2);ctx.stroke();
   }
   ctx.beginPath();ctx.fillStyle=player.side===1?'#ff8f94':'#8aaff5';
   ctx.arc(cx,cy,10,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#f4f8ef';ctx.lineWidth=2;ctx.stroke();
   ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px sans-serif';
   ctx.fillStyle='#0b1b1f';ctx.fillText(String(player.id%100),cx,cy);
   hits.push({id:player.id,name:player.name,x:cx,y:cy,side:player.side});
  }
  const ballAt=point(data.ball.x,data.ball.y,data.width,data.height);
  ctx.beginPath();ctx.fillStyle='#faf9da';ctx.strokeStyle='#172c32';ctx.lineWidth=3;
  ctx.arc(ballAt.x,ballAt.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
  const stale=!!serverLink?.room&&net?.lastSnapshot>0&&
   performance.now()-net.lastSnapshot>3500;
  if(now-lastNotice>4500){
   lastNotice=now;
   message.textContent=stale?'Server snapshots are delayed; displayed positions may be stale.':
    data.players.length+' actual players shown · tap a dot to follow · '+(options.trails?'15s trails':'trails off');
  }
 }
 function followAt(event){
  if(!eligible()||!open||!freshNativeFrame()||!hits.length)return;
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const x=(event.clientX-rect.left)*W/rect.width,y=(event.clientY-rect.top)*H/rect.height;
  const nearest=hits.map(h=>({...h,d:Math.hypot(h.x-x,h.y-y)}))
   .sort((a,b)=>a.d-b.d)[0];
  if(!nearest||nearest.d>25)return;
  // Dispatch through existing spectator camera select so an enabled automatic
  // director observes the manual selection and yields control.
  if(typeof spectatorSelect!=='undefined'){
   const existing=Array.from(spectatorSelect.options).find(o=>o.value===String(nearest.id));
   if(existing){
    spectatorSelect.value=String(nearest.id);
    spectatorSelect.dispatchEvent(new Event('change',{bubbles:true}));
   }else if(typeof chooseSpectatorTarget==='function')chooseSpectatorTarget(nearest.id);
  }
  message.textContent='Following '+(nearest.side===1?'Red':'Blue')+' · '+nearest.name+' (local camera only).';
  lastNotice=performance.now();
 }
 canvas.addEventListener('click',followAt);
 toggle.addEventListener('click',()=>{
  if(!eligible()){hide();return;}
  open=!open;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
  if(open){lastNotice=0;render(performance.now());}
 });
 close.addEventListener('click',()=>{hide();toggle.focus();});
 trails.addEventListener('change',()=>{options.trails=trails.checked;saveSettings();if(open)render(performance.now());});
 side.addEventListener('change',()=>{options.side=side.value;saveSettings();if(open)render(performance.now());});
 download.addEventListener('click',()=>{
  if(!open||!eligible()||!freshNativeFrame()||!sample()||typeof canvas.toBlob!=='function')return;
  download.disabled=true;
  canvas.toBlob(blob=>{
   download.disabled=!freshNativeFrame();
   if(!freshNativeFrame())return;
   if(!blob||!blob.size||blob.size>6*1024*1024){
    message.textContent='Could not save this radar picture.';return;
   }
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='fuckball-private-tactical-radar-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
   message.textContent='Radar PNG saved locally · not a verified match result.';
  },'image/png');
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hide();reset();}});
 window.setInterval(()=>{
  if(!eligible()){
   if(open)hide();if(roomRef!==null){roomRef=null;roomId='';reset();}
   toggle.hidden=true;return;
  }
  toggle.hidden=false;
  if(open)render(performance.now());
 },220);
 toggle.hidden=true;
})();