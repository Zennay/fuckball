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
 function prepare(){
  const list=pads(),chosen=[],reserved=new Set();
  for(const id of [3,4]){
   const preference=preferred[id];
   const pad=preference==='auto'?list.find(p=>!reserved.has(p.index)):
    list.find(p=>p.index===preference);
   if(!pad||reserved.has(pad.index)){
    assigned=null;
    return {ok:false,message:'Player '+id+' needs a connected, exclusive standard controller. '+
     'Choose two different ports for Blue before kickoff.'};
   }
   chosen.push({index:pad.index,id:pad.id});reserved.add(pad.index);
  }
  // Ports and device IDs are locked: disconnects never transfer input to a
  // different human, even if the browser renumbers controllers.
  assigned=chosen;last='';
  return {ok:true,message:'Blue controllers locked to ports '+
   assigned.map(p=>p.index+1).join(' and ')+'. P1/P2 use the shared keyboard.'};
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
  !document.hidden&&!document.getElementById('matchView')?.hidden&&
  document.getElementById('joinScreen')?.hidden!==false&&
  (typeof menuOpen==='undefined'||!menuOpen)&&
  !document.querySelector('dialog[open]');}
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
 window.fuckballCouchRivals=Object.freeze({prepare,read,describe,names,setNames,setSources,available:()=>pads().map(p=>({index:p.index,id:String(p.id||'Gamepad').slice(0,45)}))});
 requestAnimationFrame(frame);
})();
