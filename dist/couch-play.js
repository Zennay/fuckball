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
 section.setAttribute('aria-label','Local two- or four-player couch football');
 const title=node('h2','COUCH FOOTBALL.');
 const intro=node('p','Play 1v1 with two humans, team up against native AI in 2v2/3v3/4v4, or compete in four-human 2v2/3v3/4v4. For four-player games Red uses WASD/F and arrows/Enter; Blue uses two independent controllers. Offline and unranked.');
 const controls=node('div',null,'couch-play-actions');
 const launch=node('button','▶ PLAY LOCAL TWO-PLAYER');launch.className='primary';launch.type='button';
 const coop2=node('button','▶ TEAM UP 2v2');coop2.type='button';
 const coop3=node('button','▶ TEAM UP 3v3');coop3.type='button';
 const coop4=node('button','▶ TEAM UP 4v4');coop4.type='button';
 const rivals=node('button','▶ FOUR HUMANS · 2v2');rivals.type='button';
 const rivals3=node('button','▶ FOUR HUMANS · 3v3');rivals3.type='button';
 const rivals4=node('button','▶ FOUR HUMANS · 4v4');rivals4.type='button';
 const configure=node('label','Player 2 controller');
 const source=node('select');source.setAttribute('aria-label','Choose a separate gamepad for Player 2');
 configure.append(source);
 const status=node('p','Connect two controllers, or use a keyboard for either player.','couch-play-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const bindP2=node('button','↻ Bind / replace P2 controller');
 bindP2.type='button';
 bindP2.setAttribute('aria-label','Explicitly bind current player two gamepad');
 controls.append(launch,coop2,coop3,coop4,rivals,rivals3,rivals4,configure,bindP2);
 // Apply match rules only on an explicitly approved native offline kickoff.
 // The original native score/time inputs remain the authoritative source.
 const rulePresets=Object.freeze({
  native:null,golden:{goals:1,minutes:0},quick:{goals:3,minutes:5},
  classic:{goals:5,minutes:7},endurance:{goals:10,minutes:20}
 });
 const rulesRow=node('div',null,'couch-play-rules');
 const rulesLabel=node('label','Offline match rules');
 const rulesSelect=node('select');rulesSelect.setAttribute('aria-label','Couch native match rules');
 for(const [key,label] of [
  ['native','Keep current native match settings'],
  ['golden','Golden goal · first goal wins · no time cap'],
  ['quick','Quick match · first to 3 or 5 minutes'],
  ['classic','Classic · first to 5 or 7 minutes'],
  ['endurance','Endurance · first to 10 or 20 minutes']
 ])rulesSelect.add(new Option(label,key));
 rulesLabel.append(rulesSelect);
 const rulesHint=node('p','Applied at the next local kickoff using the existing native rules. Existing games and online rooms are never changed by selecting a preset.');
 rulesRow.append(rulesLabel,rulesHint);
 const RULE_KEY='fuckball.couch.rules.v1';
 try{const saved=localStorage.getItem(RULE_KEY);
  if(Object.prototype.hasOwnProperty.call(rulePresets,saved))rulesSelect.value=saved;
 }catch{}
 rulesSelect.onchange=()=>{
  if(!Object.prototype.hasOwnProperty.call(rulePresets,rulesSelect.value))return;
  try{localStorage.setItem(RULE_KEY,rulesSelect.value);}catch{}
  const r=rulePresets[rulesSelect.value];
  rulesHint.textContent=r?'Next local kickoff: first to '+r.goals+
   (r.minutes?' goals or '+r.minutes+' minutes.':' goal, unlimited time.'):
   'Next local kickoff keeps the current native match settings.';
 };
 rulesSelect.onchange();
 function applyRules(){
  const r=rulePresets[rulesSelect.value];
  if(!r)return ()=>{};
  const goals=document.getElementById('scoreLimit'),time=document.getElementById('timeLimit');
  if(!goals||!time)return ()=>{};
  const previousGoals=goals.value,previousTime=time.value;
  let added=null;
  if(!Array.from(goals.options).some(o=>o.value===String(r.goals))){
   added=new Option(String(r.goals),String(r.goals));goals.add(added);
  }
  goals.value=String(r.goals);time.value=String(r.minutes);
  return ()=>{goals.value=previousGoals;time.value=previousTime;
   if(added)added.remove();};
 }
 const namesPanel=node('details',null,'couch-rivals-names');
 const namesTitle=node('summary','Four-player names and Blue controllers');
 const namesRow=node('div',null,'couch-rivals-name-fields');
 const nameInputs={};
 const initial=window.fuckballCouchRivals?.names?.()||{};
 for(const id of [2,3,4]){
  const label=node('label','Player '+id+' · '+(id===2?'Red':'Blue'));
  const field=node('input');field.type='text';field.maxLength=20;
  field.autocomplete='off';field.setAttribute('aria-label','Player '+id+' local nickname');
  field.value=initial[id]||'Player '+id;
  nameInputs[id]=field;label.append(field);namesRow.append(label);
  field.addEventListener('change',()=>{
   window.fuckballCouchRivals?.setNames?.(Object.fromEntries(
    [2,3,4].map(i=>[i,nameInputs[i].value])));
   status.textContent='Team names saved only on this device. They apply at the next four-player kickoff.';
  });
 }
 const blueRow=node('div',null,'couch-rivals-name-fields');
 const blueSources={};let blueSignature=null;
 for(const id of [3,4]){
  const label=node('label','Blue Player '+id+' · controller port');
  const select=node('select');
  select.setAttribute('aria-label','Blue Player '+id+' controller port');
  select.addEventListener('change',()=>{
   const value=select.value;
   const sources={};sources[id]=value==='auto'?'auto':Number(value);
   window.fuckballCouchRivals?.setSources?.(sources);
   status.textContent='Blue controller choice ready for the next four-player kickoff.';
  });
  label.append(select);blueRow.append(label);blueSources[id]=select;
 }
 function paintBlueSources(){
  const list=window.fuckballCouchRivals?.available?.()||[];
  const sig=list.map(p=>p.index+':'+p.id).join('|');
  if(sig!==blueSignature){
   blueSignature=sig;
   for(const id of [3,4]){
    const select=blueSources[id],value=select.value||'auto';
    select.replaceChildren(new Option('Automatic · unused port','auto'));
    for(const pad of list)
     select.add(new Option('Port '+(pad.index+1)+' · '+pad.id,String(pad.index)));
    if(value!=='auto'&&!list.some(p=>String(p.index)===value))
     select.add(new Option('Port '+(Number(value)+1)+' · disconnected',value));
    select.value=value;
   }
  }
  const locked=isLocal()&&['couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value);
  for(const id of [3,4])blueSources[id].disabled=locked;
 }
 namesPanel.append(namesTitle,namesRow,node('strong','Blue · two separate gamepads'),blueRow);
 // These are deliberately different from the next-kickoff controller options:
 // a disconnected four-human match needs an explicit, visible live-seat bind.
 const blueRecovery=node('section',null,'couch-rivals-recovery');
 blueRecovery.hidden=true;blueRecovery.setAttribute('aria-label','Replace Blue player controllers during a match');
 const recoveryTitle=node('strong','BLUE CONTROLLERS · LIVE MATCH');
 const recoveryHelp=node('p','Lost a controller? Select a connected free port and explicitly bind one Blue player. The other player keeps their original controller.');
 const recoverySeats=node('div',null,'couch-rivals-recovery-seats');
 const recoveryMessage=node('p','Controller changes require your confirmation.','couch-rivals-recovery-message');
 recoveryMessage.setAttribute('role','status');recoveryMessage.setAttribute('aria-live','polite');
 const recoverySelectors={};let recoverySignature='';
 for(const id of [3,4]){
  const group=node('div',null,'couch-rivals-recovery-seat');
  const label=node('label','Blue Player '+id+' · replacement port');
  const select=node('select');select.setAttribute('aria-label','Replacement controller port for Blue Player '+id);
  recoverySelectors[id]=select;label.append(select);
  const button=node('button','↻ Bind / replace Player '+id+' controller');
  button.type='button';button.addEventListener('click',()=>{
   const choice=select.value==='auto'?'auto':Number(select.value);
   const result=window.fuckballCouchRivals?.rebind?.(id,choice);
   recoveryMessage.textContent=result?.message||'No valid replacement controller was found.';
   status.textContent=recoveryMessage.textContent;
   paint();
  });
  group.append(label,button);recoverySeats.append(group);
 }
 blueRecovery.append(recoveryTitle,recoveryHelp,recoverySeats,recoveryMessage);
 function paintBlueRecovery(){
  const list=window.fuckballCouchRivals?.available?.()||[];
  const signature=list.map(p=>p.index+':'+p.id).join('|');
  if(signature!==recoverySignature){
   recoverySignature=signature;
   for(const id of [3,4]){
    const select=recoverySelectors[id],old=select.value||'auto';
    select.replaceChildren(new Option('Automatic · only unassigned controller','auto'));
    for(const pad of list)
     select.add(new Option('Port '+(pad.index+1)+' · '+pad.id,String(pad.index)));
    if(old!=='auto'&&!list.some(p=>String(p.index)===old))
     select.add(new Option('Port '+(Number(old)+1)+' · disconnected',old));
    select.value=old;
   }
  }
  blueRecovery.hidden=!(activeCouchSession()&&
   ['couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value));
 }
 section.append(title,intro,controls,rulesRow,namesPanel,blueRecovery,status);
 const anchor=home.querySelector('.play-hub')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 const hud=node('aside',null,'couch-play-hud');
 hud.hidden=true;hud.setAttribute('aria-label','Local couch player controls');
 const hudTitle=node('strong','COUCH · TWO HUMANS');hud.append(hudTitle);
 const activeHint=node('span','P1 WASD + F · P2 arrows + / or Enter');
 const liveRuleHint=node('span');liveRuleHint.hidden=true;
 hud.append(activeHint,liveRuleHint);pitch.append(hud);
 let pendingKickoffRules=null,kickoffObserved=false;
 // Only the native kickoff event confirms which rules the new room captured.
 // Any other local launcher clears this receipt, so it never mislabels a match.
 window.addEventListener('fuckball:local-match-kickoff',()=>{
  seatTwoSession=true;
  const pad=candidate();
  seatTwoLock=pad?{index:pad.index,id:pad.id}:null;
  if(pendingKickoffRules)kickoffObserved=true;
  liveRuleHint.textContent=pendingKickoffRules||'';
  liveRuleHint.hidden=!pendingKickoffRules;
 });
 let chosen='auto',availableSignature='',lastInput='0:0:false';
 let seatTwoLock=null,seatTwoSession=false;
 const neutral=()=>({x:0,y:0,kick:false});
 const activeCouchSession=()=>typeof started!=='undefined'&&started&&
  typeof replay!=='undefined'&&!replay&&
  typeof serverLink!=='undefined'&&!serverLink&&
  typeof peerConnected!=='undefined'&&!peerConnected&&
  ['local','coop2v2','coop3v3','coop4v4','couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value);
 const isLocal=()=>activeCouchSession()&&
  document.getElementById('joinScreen')?.hidden!==false&&!pitch.hidden;
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
 function candidate(){
  if(['couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value))return null;
  const all=pads(),first=playerOneIndex();
  if(chosen!=='auto'){
   const index=Number(chosen);
   if(!Number.isSafeInteger(index)||index<0||index>15||index===first)return null;
   return all.find(p=>p.index===index)||null;
  }
  return all.find(p=>p.index!==first)||null;
 }
 // Reuse of the same Gamepad API port is not proof that the same human returned.
 function selected(){
  if(!seatTwoSession||!activeCouchSession())return candidate();
  if(!seatTwoLock||seatTwoLock.lost)return null;
  const connected=pads().find(p=>p.index===seatTwoLock.index&&p.id===seatTwoLock.id);
  // Controller IDs identify models, not people or physical devices. Once
  // disconnected, never restore P2's kick automatically on a reused port.
  if(!connected){seatTwoLock.lost=true;return null;}
  return connected.index!==playerOneIndex()?connected:null;
 }
 function bindSeatTwo(){
  const pad=candidate();
  if(!pad){
   status.textContent='No separate standard P2 controller available. Keyboard controls still work.';
   return false;
  }
  seatTwoLock={index:pad.index,id:pad.id};
  seatTwoSession=true;lastInput='';
  if(isLocal()&&typeof refreshInput==='function')refreshInput();
  status.textContent='Player 2 bound to controller port '+(pad.index+1)+
   '. Disconnecting or replacing it makes P2 neutral until you rebind explicitly.';
  return true;
 }
 const reservedPort=()=>seatTwoSession&&activeCouchSession()?seatTwoLock?.index??null:null;
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
  // P2's controller must obey the same visible-pitch gate as P1.
  return isLocal()&&canControlLiveMatch();
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
  paintBlueSources();
  paintBlueRecovery();
  bindP2.disabled=['couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value);
  // Four-human rivals exclusively reserve both gamepads for Blue.
  source.disabled=['couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value);
  configure.title=source.disabled?'Red Player 2 uses arrows/Enter in four-human 2v2/3v3/4v4.':'Select a dedicated Player 2 controller.';
  hud.hidden=!isLocal();
  if(!hud.hidden){
   const p2=selected(),mode=document.getElementById('mode')?.value;
   hudTitle.textContent=['couchRivals','couchRivals3v3','couchRivals4v4'].includes(mode)?'COUCH RIVALS · '+(mode==='couchRivals'?'2v2':mode==='couchRivals3v3'?'3v3':'4v4')+' · FOUR HUMANS':
    mode==='coop2v2'?'COUCH CO-OP · 2v2':
    mode==='coop3v3'?'COUCH CO-OP · 3v3':
    mode==='coop4v4'?'COUCH CO-OP · 4v4':'COUCH 1v1 · TWO HUMANS';
   activeHint.textContent=['couchRivals','couchRivals3v3','couchRivals4v4'].includes(mode)?
    'RED · P1 WASD/F · P2 arrows/Enter | BLUE · '+
     (window.fuckballCouchRivals?.describe?.()||'two gamepads required'):
    'P1 WASD/F or controller'+(first===null?'':' '+(first+1))+
    ' · P2 arrows/Enter'+(p2?' or controller '+(p2.index+1):
     seatTwoLock?' · P2 controller disconnected/replaced · rebind explicitly':' · no separate controller');
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
  if(seatTwoSession&&activeCouchSession())bindSeatTwo();
  paint();
  status.textContent=next==='auto'?
   'Player 2 will use the first connected controller not assigned to Player 1.':
   'Player 2 is assigned to controller port '+(Number(next)+1)+
    '. Disconnecting it will not reassign Player 1’s controller.';
 };
 bindP2.onclick=()=>{if(seatTwoSession&&activeCouchSession())bindSeatTwo();else status.textContent=
  'Choose a controller port and start local football; the game locks it at kickoff.';};
 function startMode(mode){
  if(typeof pendingSessionBlock==='function'){
   const reason=pendingSessionBlock();
   if(reason){status.textContent=reason;return;}
  }
  const name=mode==='coop2v2'?'Couch Co-op 2v2':
   mode==='coop3v3'?'Couch Co-op 3v3':
   mode==='coop4v4'?'Couch Co-op 4v4':
   mode==='couchRivals'?'Couch Rivals 2v2':
   mode==='couchRivals3v3'?'Couch Rivals 3v3':
   mode==='couchRivals4v4'?'Couch Rivals 4v4':'Couch 1v1';
  if((started||replay)&&!window.confirm('Replace your current offline match or replay with '+
   name+'? Unsaved local progress may be lost.')){
   status.textContent='Existing local game preserved.';return;
  }
  if(['couchRivals','couchRivals3v3','couchRivals4v4'].includes(mode)){
   const prepared=window.fuckballCouchRivals?.prepare?.();
   if(!prepared?.ok){status.textContent=prepared?.message||'Four-player controllers unavailable.';return;}
  }
  // Do not mutate a live match until every online/peer/active-session gate
  // and all four-human controller requirements have passed.
  const nativeMode=document.getElementById('mode'),previousMode=nativeMode?.value;
  const revertRules=applyRules();
  const goalsField=document.getElementById('scoreLimit'),
   minutesField=document.getElementById('timeLimit');
  if(goalsField&&minutesField){
   const goals=Number(goalsField.value),minutes=Number(minutesField.value);
   pendingKickoffRules='MATCH RULES · '+(goals>0?'first to '+goals+' goals':'no goal limit')+
    ' · '+(minutes>0?minutes+' min':'no time limit');
  }
  let launched=false;
  kickoffObserved=false;
  const recoverHome=()=>{
   if(!started&&!serverLink&&!peerConnected&&!replay&&typeof showView==='function'){
    try{showView('home');}catch{}
   }
  };
  try{
   // quickPlay snapshots the native score/time controls synchronously into
   // the new offline room. Never leave a one-shot preset in shared room inputs.
   launched=quickPlay(mode,true,false);
  }catch{
   // An exception after native kickoff must not leave a running orphan.
   if(kickoffObserved&&!serverLink&&!peerConnected&&!replay&&started){
    try{startStop();}catch{}
   }
   // A rejected launch before kickoff must preserve the existing match HUD.
   if(kickoffObserved){liveRuleHint.textContent='';liveRuleHint.hidden=true;}
   recoverHome();
   status.textContent='Native couch kickoff failed; your previous match controls were restored.';
   return;
  }finally{
   pendingKickoffRules=null;
   revertRules();
   // quickPlay can set its mode before resetMatch throws. Recover the Home
   // selection only if the failed kickoff left no active native session.
   if((!launched||!kickoffObserved)&&nativeMode&&previousMode!=null&&
    !started&&!serverLink&&!peerConnected&&!replay)nativeMode.value=previousMode;
  }
  if(!launched||!kickoffObserved){
   if(kickoffObserved&&!serverLink&&!peerConnected&&!replay&&started){
    try{startStop();}catch{}
    liveRuleHint.textContent='';liveRuleHint.hidden=true;
   }
   recoverHome();
   status.textContent=kickoffObserved?'Native couch kickoff could not be completed.':
    name+' is unavailable while another session is active.';return;
  }
  status.textContent=name+' started with '+(['couchRivals','couchRivals3v3','couchRivals4v4'].includes(mode)?'four':'two')+
   ' real native local humans. '+
   (mode==='local'?'Play against each other.':['couchRivals','couchRivals3v3','couchRivals4v4'].includes(mode)?
    'Red is shared keyboard; Blue uses two exclusive gamepads. AI fills only remaining team slots.':
    'Play on Red together against actual local AI.')+
   (rulePresets[rulesSelect.value]?' · '+rulesHint.textContent:'');
  paint();
 }
 launch.onclick=()=>startMode('local');
 coop2.onclick=()=>startMode('coop2v2');
 coop3.onclick=()=>startMode('coop3v3');
 coop4.onclick=()=>startMode('coop4v4');
 rivals.onclick=()=>startMode('couchRivals');
 rivals3.onclick=()=>startMode('couchRivals3v3');
 rivals4.onclick=()=>startMode('couchRivals4v4');
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
 window.fuckballCouchPad=Object.freeze({read,reservedPort});
 window.addEventListener('gamepadconnected',()=>{availableSignature='';});
 window.addEventListener('gamepaddisconnected',event=>{
  const index=event?.gamepad?.index;
  if(activeCouchSession()&&seatTwoSession&&seatTwoLock&&
     Number.isSafeInteger(index)&&seatTwoLock.index===index)
   seatTwoLock.lost=true;
  lastInput='0:0:false';availableSignature='';
  if(typeof refreshInput==='function'&&isLocal())refreshInput();
 });
 window.addEventListener('blur',()=>{lastInput='0:0:false';});
 requestAnimationFrame(frame);
})();
