'use strict';
// Four local human participants, never online clients or bot substitutes.
// Red P1/P2 share a keyboard; Blue P3/P4 require independent standard pads.
(function(){
 const neutral=()=>({x:0,y:0,kick:false});
 let assigned=null,last='';
 let preferred={3:'auto',4:'auto'};
 const NAME_KEY='fuckball.couch-rivals.names.v1';
 const defaults={2:'Player 2',3:'Player 3',4:'Player 4'};
 const clean=(value,fallback)=>String(value??'').replace(/[<>\x00-\x1f\x7f-\x9f]/g,'').trim().slice(0,20)||fallback;
 let playerNames={...defaults};
 try{
  const stored=JSON.parse(localStorage.getItem(NAME_KEY)||'null');
  if(stored&&typeof stored==='object'&&!Array.isArray(stored)){
   for(const id of [2,3,4])playerNames[id]=clean(stored[id],defaults[id]);
  }
 }catch{}
 function setNames(input){
  if(!input||typeof input!=='object')return;
  for(const id of [2,3,4])playerNames[id]=clean(input[id],defaults[id]);
  try{localStorage.setItem(NAME_KEY,JSON.stringify(playerNames));}catch{}
 }
 function names(){return {...playerNames};}

 const isMode=()=>['couchRivals','couchRivals3v3','couchRivals4v4'].includes(document.getElementById('mode')?.value);
 function pads(){
  if(typeof navigator.getGamepads!=='function')return [];
  try{return Array.from(navigator.getGamepads()).filter(p=>p?.connected&&
   p.mapping==='standard'&&Number.isSafeInteger(p.index)&&p.index>=0&&p.index<=15)
   .sort((a,b)=>a.index-b.index);}catch{return [];}
 }
 function setSources(sources){
  if(!sources||typeof sources!=='object')return;
  for(const id of [3,4]){
   const value=sources[id];
   if(value==='auto'||Number.isSafeInteger(value)&&value>=0&&value<=15)
    preferred[id]=value;
  }
 }
 function choosePads(){
  const list=pads(),byId={},reserved=new Set();
  // Explicit reservations are always honored BEFORE automatic assignment.
  // Otherwise P3=auto and P4=port 1 could incorrectly fail with two pads.
  for(const id of [3,4]){
   if(preferred[id]==='auto')continue;
   const pad=list.find(p=>p.index===preferred[id]);
   if(!pad||reserved.has(pad.index))return {ok:false,message:
    'Blue Player '+id+' needs its own connected standard gamepad port.'};
   byId[id]=pad;reserved.add(pad.index);
  }
  for(const id of [3,4]){
   if(byId[id])continue;
   const pad=list.find(p=>!reserved.has(p.index));
   if(!pad)return {ok:false,message:'Connect two distinct standard controllers for Blue. '+
    'Press any controller button to activate it in this browser.'};
   byId[id]=pad;reserved.add(pad.index);
  }
  return {ok:true,pads:[byId[3],byId[4]]};
 }
 function preview(){
  const result=choosePads();
  if(!result.ok)return {ok:false,message:result.message,players:[]};
  return {ok:true,players:result.pads.map((p,i)=>({seat:i+3,index:p.index,
   id:String(p.id||'Controller').slice(0,60)})),
   message:'Blue Player 3 and Player 4 have separate ready controllers.'};
 }
 function prepare(){
  const result=choosePads();
  if(!result.ok){assigned=null;return result;}
  // Ports and device IDs lock per match: a disconnect cannot hand a seat to
  // another real human, regardless of browser controller ordering.
  assigned=result.pads.map(p=>({index:p.index,id:p.id}));last='';
  return {ok:true,message:'Blue controllers locked to ports '+
   assigned.map(p=>p.index+1).join(' and ')+'. P1/P2 use the shared keyboard.'};
 }
 // An unplugged pad stays neutral until the human explicitly selects a
 // replacement. Never auto-assign the other Blue player's controller.
 function rebind(id,source='auto'){
  if(![3,4].includes(id)||!assigned||!isMode()||
     typeof started==='undefined'||!started||
     typeof replay!=='undefined'&&replay||
     typeof peerConnected!=='undefined'&&peerConnected||
     typeof serverLink!=='undefined'&&serverLink)
   return {ok:false,message:'Start an offline four-human match before replacing a Blue controller.'};
  const slot=id-3,other=assigned[1-slot];
  const candidates=pads().filter(p=>p.index!==other.index);
  let selected=null;
  if(source==='auto'){
   if(candidates.length!==1)return{ok:false,message:candidates.length?
    'Choose a specific free controller port before replacing Player '+id+'.':
    'Connect another standard controller. The other Blue player keeps their pad.'};
   selected=candidates[0];
  }else if(Number.isSafeInteger(source)&&source>=0&&source<=15)
   selected=candidates.find(p=>p.index===source)||null;
  if(!selected)return{ok:false,message:'That controller is unavailable or already belongs to the other Blue player.'};
  assigned[slot]={index:selected.index,id:selected.id};
  // Reset cached local command immediately. The original game engine still
  // owns input refresh, all match physics and all player permissions.
  last='';
  if(typeof refreshInput==='function')refreshInput();
  return{ok:true,message:'Blue Player '+id+' explicitly bound to port '+
   (selected.index+1)+' · '+String(selected.id||'Gamepad').slice(0,55)+
   '. The other human seat was not changed.'};
 }
 function padFor(id){
  const slot=id-3,choice=assigned?.[slot];
  if(!choice)return null;
  return pads().find(p=>p.index===choice.index&&p.id===choice.id)||null;
 }
 function usable(){return isMode()&&typeof started!=='undefined'&&started&&
  typeof paused!=='undefined'&&!paused&&typeof replay!=='undefined'&&!replay&&
  typeof peerConnected!=='undefined'&&!peerConnected&&
  typeof serverLink!=='undefined'&&!serverLink&&
  // P3/P4 cannot move or kick while chat, a dialog or another view owns focus.
  gameplayInputSurfaceActive();}
 const held=(p,i)=>p.buttons?.[i]?.pressed===true||
  (Number(p.buttons?.[i]?.value)||0)>.6;
 const axis=n=>Number.isFinite(n)&&Math.abs(n)>=.30?Math.sign(n):0;
 function read(id){
  if(!usable()||![3,4].includes(id))return neutral();
  const p=padFor(id);
  if(!p)return neutral();
  let x=axis(p.axes?.[0]),y=axis(p.axes?.[1]);
  if(held(p,14))x=-1;if(held(p,15))x=1;
  if(held(p,12))y=-1;if(held(p,13))y=1;
  return {x,y,kick:held(p,0)||held(p,2)||held(p,7)};
 }
 function describe(){
  if(!assigned)return 'Blue needs two connected controllers.';
  return assigned.map((p,i)=>'P'+(i+3)+' pad '+(p.index+1)+
   (padFor(i+3)?' ready':' disconnected · input neutral')).join(' · ');
 }
 function frame(){
  if(isMode()){
   const a=read(3),b=read(4);
   const sig=[usable(),a.x,a.y,a.kick,b.x,b.y,b.kick].join(':');
   if(sig!==last){last=sig;if(typeof refreshInput==='function'&&
    typeof started!=='undefined'&&started)refreshInput();}
  }else last='';
  requestAnimationFrame(frame);
 }
 window.fuckballCouchRivals=Object.freeze({prepare,preview,read,describe,rebind,names,setNames,setSources,available:()=>pads().map(p=>({index:p.index,id:String(p.id||'Gamepad').slice(0,45)}))});
 requestAnimationFrame(frame);
})();
