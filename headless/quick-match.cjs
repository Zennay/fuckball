'use strict';
// Human-only unranked matchmaking. A full roster is only a proposal until
// every authenticated live socket explicitly accepts the same ready check.
const SIZES=Object.freeze({'1v1':1,'2v2':2,'3v3':3,'4v4':4});
const READY_MS=15000;
function estimate(stats){
 if(!stats||!Number.isSafeInteger(stats.matches)||stats.matches<0)return 1200;
 const wins=Math.max(0,Number(stats.wins)||0),losses=Math.max(0,Number(stats.losses)||0);
 return Math.max(1000,Math.min(1400,1200+
  Math.round(300*(wins-losses)/Math.max(12,stats.matches))));
}
function distribute(group,size){
 const players=[...group].sort((a,b)=>b.skill-a.skill||a.at-b.at);
 const red=[],blue=[];let sr=0,sb=0;
 for(const player of players){
  const chooseRed=red.length<size&&(blue.length>=size||
   red.length<blue.length&&sr<=sb+300||red.length===blue.length&&sr<=sb);
  if(chooseRed){red.push(player);sr+=player.skill;}
  else{blue.push(player);sb+=player.skill;}
 }
 return{red,blue};
}
function createQuickMatch({send,start,clock=()=>Date.now(),validAccount=()=>true}){
 const pools=Object.fromEntries(Object.keys(SIZES).map(mode=>[mode,[]]));
 const active=new Map(),readyBySocket=new Map(),readyChecks=new Map();
 let nextId=0;
 const available=ws=>ws?.readyState===1&&!ws.room&&validAccount(ws);
 function broadcast(mode){
  const count=pools[mode].length;
  for(const entry of pools[mode])if(available(entry.ws))
   send(entry.ws,{type:'queueStatus',status:'waiting',mode,waiting:count,
    needed:SIZES[mode]*2,at:entry.at,ranked:false,humanOnly:true});
 }
 function abortReady(check,offender,reason='Ready check expired.'){
  if(!readyChecks.delete(check.id))return;
  const pool=pools[check.mode];
  for(const entry of check.entries){
   readyBySocket.delete(entry.ws);
   // Players who confirmed keep their place; silent, expired or declining
   // sockets cannot drag others into another match without accepting again.
   const requeued=entry!==offender&&check.accepted.has(entry.ws)&&available(entry.ws)&&pool.length<128;
   if(requeued)pool.push(entry);else active.delete(entry.ws);
   if(entry.ws?.readyState===1)send(entry.ws,{type:'queueReadyAborted',
    mode:check.mode,id:check.id,requeued,
    reason:entry===offender?'You declined the match.':reason});
  }
  pool.sort((a,b)=>a.at-b.at);
  broadcast(check.mode);
 }
 function remove(ws,quiet=false){
  const entry=active.get(ws);if(!entry)return false;
  const check=readyBySocket.get(ws);
  if(check){
   // A socket disconnecting, cancelling or joining a custom room invalidates
   // the whole proposed roster. Only already-ready peers remain queued.
   abortReady(check,ws,'A player left the ready check.');
   return true;
  }
  active.delete(ws);
  const pool=pools[entry.mode],index=pool.indexOf(entry);
  if(index>=0)pool.splice(index,1);
  if(!quiet)send(ws,{type:'queueStatus',status:'cancelled',mode:entry.mode});
  broadcast(entry.mode);return true;
 }
 function join(ws,user,mode,stats){
  if(!Object.hasOwn(SIZES,mode))throw Error('Choose 1v1, 2v2, 3v3 or 4v4.');
  if(!available(ws))throw Error('Leave the current room before searching.');
  if(active.has(ws))throw Error('Already searching or in a ready check.');
  for(const other of active.values())if(other.user===user)
   throw Error('This account already has an active Quick Match search.');
  const list=pools[mode];
  if(list.length>=128)throw Error('This playlist is currently full.');
  const entry={ws,user,mode,at:clock(),skill:estimate(stats)};
  list.push(entry);active.set(ws,entry);
  broadcast(mode);drain(mode);
 }
 function expireReady(){
  for(const check of [...readyChecks.values()]){
   const gone=check.entries.find(e=>!available(e.ws));
   if(gone)abortReady(check,gone,'A player disconnected before the match.');
   else if(clock()>=check.expiresAt)abortReady(check,null,'Not everyone confirmed in time.');
  }
 }
 function respond(ws,id,accepted){
  expireReady();
  const check=readyBySocket.get(ws);
  if(!check||id!==check.id||typeof accepted!=='boolean')
   throw Error('This ready check is no longer active.');
  if(!available(ws)){abortReady(check,ws,'A player disconnected.');return;}
  if(!accepted){abortReady(check,ws,'A player declined the match.');return;}
  check.accepted.add(ws);
  send(ws,{type:'queueReadyAccepted',id,ready:check.accepted.size,
   needed:check.entries.length,expiresAt:check.expiresAt});
  for(const entry of check.entries)if(available(entry.ws))
   send(entry.ws,{type:'queueReadyProgress',id,ready:check.accepted.size,
    needed:check.entries.length,expiresAt:check.expiresAt});
  if(check.accepted.size!==check.entries.length)return;
  readyChecks.delete(check.id);
  for(const entry of check.entries){readyBySocket.delete(entry.ws);active.delete(entry.ws);}
  if(check.entries.some(e=>!available(e.ws))){
   for(const entry of check.entries)if(entry.ws?.readyState===1)
    send(entry.ws,{type:'queueReadyAborted',id,mode:check.mode,requeued:false,
     reason:'A player disconnected. Start another search.'});
   return;
  }
  const {red,blue}=distribute(check.entries,SIZES[check.mode]);
  try{start({mode:check.mode,red,blue});}
  catch{
   for(const entry of check.entries)if(entry.ws?.readyState===1)
    send(entry.ws,{type:'queueReadyAborted',id,mode:check.mode,requeued:false,
     reason:'The match server is full or unavailable. Search again.'});
  }
  broadcast(check.mode);
 }
 function drain(mode){
  const list=pools[mode],needed=SIZES[mode]*2;
  for(let i=list.length-1;i>=0;i--)if(!available(list[i].ws)){
   if(list[i].ws?.readyState===1&&!validAccount(list[i].ws))
    send(list[i].ws,{type:'queueStatus',status:'error',
     reason:'Your account session expired. Log in before searching again.'});
   active.delete(list[i].ws);list.splice(i,1);
  }
  let proposed=false;
  while(list.length>=needed&&readyChecks.size<16){
   let candidates=null;
   for(const anchor of list){
    const wait=Math.max(0,clock()-anchor.at);
    const span=Math.min(500,160+Math.floor(wait/10000)*25);
    const chosen=[anchor,...list.filter(e=>e!==anchor&&Math.abs(e.skill-anchor.skill)<=span)
     .sort((a,b)=>Math.abs(a.skill-anchor.skill)-Math.abs(b.skill-anchor.skill)||a.at-b.at)
     .slice(0,needed-1)];
    if(chosen.length===needed){candidates=chosen;break;}
   }
   if(!candidates)break;
   for(const e of candidates)list.splice(list.indexOf(e),1);
   const id=String(++nextId),check={id,mode,entries:candidates,accepted:new Set(),
    expiresAt:clock()+READY_MS};
   readyChecks.set(id,check);
   for(const e of candidates){
    readyBySocket.set(e.ws,check);
    send(e.ws,{type:'queueReady',id,mode,players:needed,
     expiresAt:check.expiresAt,humanOnly:true,ranked:false});
   }
   proposed=true;
  }
  if(proposed)broadcast(mode);
 }
 function drainAll(){expireReady();for(const mode of Object.keys(SIZES))drain(mode);}
 function close(){
  for(const entry of active.values())if(entry.ws?.readyState===1)
   send(entry.ws,{type:'queueStatus',status:'cancelled',mode:entry.mode});
  active.clear();readyChecks.clear();readyBySocket.clear();
  for(const pool of Object.values(pools))pool.length=0;
 }
 return{join,remove,respond,drainAll,close,estimate,distribute};
}
module.exports={createQuickMatch,SIZES,estimate,distribute};
