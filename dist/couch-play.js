'use strict';
// Two genuine human players in the approved native local sandbox.
// Player 2's gamepad never sends online input and can never take player 1's pad.
(function(){
 const home=document.getElementById('homeView');
 const pitch=document.getElementById('matchView');
 if(!home||!pitch||typeof quickPlay!=='function')return;
 const node=(tag,value,klass)=>{
  const e=document.createElement(tag);
  if(value!==undefined&&value!==null)e.textContent=String(value);
  if(klass)e.className=klass;
  return e;
 };
 const section=node('section',null,'couch-play');
 section.setAttribute('aria-label','Local two-player couch football');
 const title=node('h2','COUCH FOOTBALL.');
 const intro=node('p','Two real players, one native pitch. Play against each other in 1v1, or team up against native AI in 2v2 or 4v4. P1 uses WASD/F or their controller, P2 uses arrows/Enter or a separate controller. No account or leaderboard.');
 const controls=node('div',null,'couch-play-actions');
 const launch=node('button','▶ PLAY LOCAL TWO-PLAYER');launch.className='primary';launch.type='button';
 const coop2=node('button','▶ TEAM UP 2v2');coop2.type='button';
 const coop4=node('button','▶ TEAM UP 4v4');coop4.type='button';
 const configure=node('label','Player 2 controller');
 const source=node('select');source.setAttribute('aria-label','Choose a separate gamepad for Player 2');
 configure.append(source);
 const status=node('p','Connect two controllers, or use a keyboard for either player.','couch-play-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 controls.append(launch,coop2,coop4,configure);
 section.append(title,intro,controls,status);
 const anchor=home.querySelector('.play-hub')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 const hud=node('aside',null,'couch-play-hud');
 hud.hidden=true;hud.setAttribute('aria-label','Local couch player controls');
 const hudTitle=node('strong','COUCH · TWO HUMANS');hud.append(hudTitle);
 const activeHint=node('span','P1 WASD + F · P2 arrows + / or Enter');
 hud.append(activeHint);pitch.append(hud);
 let chosen='auto',availableSignature='',lastInput='0:0:false';
 const neutral=()=>({x:0,y:0,kick:false});
 const isLocal=()=>typeof started!=='undefined'&&started&&
  typeof replay!=='undefined'&&!replay&&
  typeof serverLink!=='undefined'&&!serverLink&&
  typeof peerConnected!=='undefined'&&!peerConnected&&
  ['local','coop2v2','coop4v4'].includes(document.getElementById('mode')?.value)&&
  document.getElementById('joinScreen')?.hidden!==false&&
  !pitch.hidden;
 function pads(){
  if(typeof navigator.getGamepads!=='function')return [];
  try{return Array.from(navigator.getGamepads()).filter(p=>p?.connected&&
   Number.isSafeInteger(p.index)&&p.index>=0&&p.index<=15&&
   p.mapping==='standard');}catch{return [];}
 }
 function playerOneIndex(){
  const index=window.fuckballGamepad?.sourceIndex?.();
  return Number.isSafeInteger(index)?index:null;
 }
 function selected(){
  const all=pads(),first=playerOneIndex();
  if(chosen!=='auto'){
   const index=Number(chosen);
   if(!Number.isSafeInteger(index)||index<0||index>15||index===first)return null;
   return all.find(p=>p.index===index)||null;
  }
  return all.find(p=>p.index!==first)||null;
 }
 const held=(pad,index)=>pad.buttons?.[index]?.pressed===true||
  (Number(pad.buttons?.[index]?.value)||0)>.6;
 const axis=n=>Number.isFinite(n)&&Math.abs(n)>=.30?Math.sign(n):0;
 function sample(pad){
  if(!pad)return neutral();
  let x=axis(pad.axes?.[0]),y=axis(pad.axes?.[1]);
  if(held(pad,14))x=-1;
  if(held(pad,15))x=1;
  if(held(pad,12))y=-1;
  if(held(pad,13))y=1;
  return {x,y,kick:held(pad,0)||held(pad,2)||held(pad,7)};
 }
 function canInput(){
  return isLocal()&&!document.hidden&&
   typeof paused!=='undefined'&&!paused&&
   (typeof menuOpen==='undefined'||!menuOpen)&&
   !document.querySelector('dialog[open]');
 }
 function read(){
  return canInput()?sample(selected()):neutral();
 }
 function paint(){
  const all=pads(),first=playerOneIndex();
  const signature=all.map(p=>p.index+':'+String(p.id).slice(0,40)).join('|')+';'+chosen+';'+first;
  if(signature!==availableSignature){
   availableSignature=signature;
   source.replaceChildren(new Option('Automatic · any unused controller','auto'));
   for(const p of all){
    const option=new Option('Port '+(p.index+1)+' · '+String(p.id||'Gamepad').slice(0,48),
     String(p.index));
    option.disabled=p.index===first;
    source.add(option);
   }
   if(chosen!=='auto'&&!all.some(p=>String(p.index)===chosen)){
    const missing=new Option('Port '+(Number(chosen)+1)+' · disconnected',chosen);
    source.add(missing);
   }
   source.value=chosen;
  }
  hud.hidden=!isLocal();
  if(!hud.hidden){
   const p2=selected(),mode=document.getElementById('mode')?.value;
   hudTitle.textContent=mode==='coop2v2'?'COUCH CO-OP · 2v2':
    mode==='coop4v4'?'COUCH CO-OP · 4v4':'COUCH 1v1 · TWO HUMANS';
   activeHint.textContent='P1 WASD/F or controller'+(first===null?'':' '+(first+1))+
    ' · P2 arrows/Enter'+(p2?' or controller '+(p2.index+1):' · no separate controller');
  }
 }
 source.onchange=()=>{
  const next=source.value;
  if(next!=='auto'&&(!/^(?:[0-9]|1[0-5])$/.test(next)||
   Number(next)===playerOneIndex())){
   status.textContent='Player 2 must use a separate controller. Shared controller input is refused.';
   availableSignature='';paint();return;
  }
  chosen=next;lastInput='0:0:false';availableSignature='';
  paint();
  status.textContent=next==='auto'?
   'Player 2 will use the first connected controller not assigned to Player 1.':
   'Player 2 is assigned to controller port '+(Number(next)+1)+
    '. Disconnecting it will not reassign Player 1’s controller.';
 };
 function startMode(mode){
  if(typeof pendingSessionBlock==='function'){
   const reason=pendingSessionBlock();
   if(reason){status.textContent=reason;return;}
  }
  const name=mode==='coop2v2'?'Couch Co-op 2v2':
   mode==='coop4v4'?'Couch Co-op 4v4':'Couch 1v1';
  if((started||replay)&&!window.confirm('Replace your current offline match or replay with '+
   name+'? Unsaved local progress may be lost.')){
   status.textContent='Existing local game preserved.';return;
  }
  if(!quickPlay(mode,true,false)){
   status.textContent=name+' is unavailable while another session is active.';return;
  }
  status.textContent=name+' started with two real native local humans. '+
   (mode==='local'?'Play against each other.':'Play on Red together against actual local AI.');
  paint();
 }
 launch.onclick=()=>startMode('local');
 coop2.onclick=()=>startMode('coop2v2');
 coop4.onclick=()=>startMode('coop4v4');
 let lastLive=false;
 function frame(){
  const live=canInput();
  const s=read(),signature=[s.x,s.y,s.kick].join(':');
  if((signature!==lastInput||live!==lastLive)&&
   typeof refreshInput==='function'&&isLocal()){
   refreshInput();
  }
  lastInput=signature;lastLive=live;
  paint();
  requestAnimationFrame(frame);
 }
 window.fuckballCouchPad=Object.freeze({read});
 window.addEventListener('gamepadconnected',()=>{availableSignature='';});
 window.addEventListener('gamepaddisconnected',()=>{
  lastInput='0:0:false';availableSignature='';
  if(typeof refreshInput==='function'&&isLocal())refreshInput();
 });
 window.addEventListener('blur',()=>{lastInput='0:0:false';});
 requestAnimationFrame(frame);
})();
