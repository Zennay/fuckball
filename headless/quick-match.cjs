'use strict';
// Human-only, unranked matchmaking. Room creation and game authority live in
// the host server. This coordinator never invents bots or awards Elo/ranks.
const SIZES=Object.freeze({'1v1':1,'2v2':2,'3v3':3,'4v4':4});
function estimate(stats){
 if(!stats||!Number.isSafeInteger(stats.matches)||stats.matches<0)return 1200;
 const wins=Math.max(0,Number(stats.wins)||0),losses=Math.max(0,Number(stats.losses)||0);
 // Rough, explicitly unranked prior used only for team balance and search.
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
 const active=new Map();
 const available=(ws)=>ws?.readyState===1&&!ws.room&&validAccount(ws);
 function broadcast(mode){
  const count=pools[mode].length;
  for(const e of pools[mode])if(available(e.ws))
   send(e.ws,{type:'queueStatus',status:'waiting',mode,waiting:count,needed:SIZES[mode]*2,at:e.at,ranked:false,humanOnly:true});
 }
 function remove(ws,quiet=false){
  const entry=active.get(ws);if(!entry)return false;
  active.delete(ws);
  const list=pools[entry.mode],index=list.indexOf(entry);
  if(index>=0)list.splice(index,1);
  if(!quiet){send(ws,{type:'queueStatus',status:'cancelled',mode:entry.mode});broadcast(entry.mode);}
  return true;
 }
 function join(ws,user,mode,stats){
  if(!Object.hasOwn(SIZES,mode))throw Error('Choose 1v1, 2v2, 3v3 or 4v4.');
  if(!available(ws))throw Error('Leave the current room before searching.');
  if(active.has(ws))throw Error('Already searching.');
  for(const other of active.values())if(other.user===user)throw Error('This account already has an active Quick Match search.');
  const list=pools[mode];
  if(list.length>=128)throw Error('This playlist is currently full.');
  const entry={ws,user,mode,at:clock(),skill:estimate(stats)};
  list.push(entry);active.set(ws,entry);
  broadcast(mode);drain(mode);
 }
 function drain(mode){
  const list=pools[mode],needed=SIZES[mode]*2;
  for(let i=list.length-1;i>=0;i--)if(!available(list[i].ws)){
   if(list[i].ws?.readyState===1&&!validAccount(list[i].ws))
    send(list[i].ws,{type:'queueStatus',status:'error',
     reason:'Your account session expired. Log in before searching again.'});
   active.delete(list[i].ws);list.splice(i,1);
  }
  let matched=false;
  while(list.length>=needed){
   // Scan anchors in arrival order instead of letting one unmatched veteran
   // block a complete, fairly close group elsewhere in the same playlist.
   let candidates=null;
   for(const anchor of list){
    const wait=Math.max(0,clock()-anchor.at);
    // Search widens every ten seconds, capped at a bounded experience gap.
    const span=Math.min(500,160+Math.floor(wait/10000)*25);
    const chosen=[anchor,...list.filter(e=>e!==anchor&&Math.abs(e.skill-anchor.skill)<=span)
     .sort((a,b)=>Math.abs(a.skill-anchor.skill)-Math.abs(b.skill-anchor.skill)||a.at-b.at)
     .slice(0,needed-1)];
    if(chosen.length===needed){candidates=chosen;break;}
   }
   if(!candidates)break;
   for(const e of candidates){active.delete(e.ws);list.splice(list.indexOf(e),1);}
   const {red,blue}=distribute(candidates,SIZES[mode]);
   try{start({mode,red,blue});}catch{
    for(const e of candidates)if(available(e.ws))
     send(e.ws,{type:'queueStatus',status:'error',mode,reason:'Could not create this match. Search again.'});
   }
   matched=true;
  }
  if(matched)broadcast(mode);
 }
 function drainAll(){for(const mode of Object.keys(SIZES))drain(mode);}
 function close(){for(const e of active.values())send(e.ws,{type:'queueStatus',status:'cancelled',mode:e.mode});active.clear();for(const pool of Object.values(pools))pool.length=0;}
 return{join,remove,drainAll,close,estimate,distribute};
}
module.exports={createQuickMatch,SIZES,estimate,distribute};