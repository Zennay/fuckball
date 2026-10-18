'use strict';
// Casual human-only team matchmaking. Queue units represent indivisible
// friend parties or solo players; each individual still accepts ready-check.
const SIZES=Object.freeze({'1v1':1,'2v2':2,'3v3':3,'4v4':4});
const READY_MS=15000;
function estimate(stats){
 if(!stats||!Number.isSafeInteger(stats.matches)||stats.matches<0)return 1200;
 const wins=Math.max(0,Number(stats.wins)||0),losses=Math.max(0,Number(stats.losses)||0);
 return Math.max(1000,Math.min(1400,1200+
  Math.round(300*(wins-losses)/Math.max(12,stats.matches))));
}
// Retain the legacy balanced-solo utility for compatibility.
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
function distributeUnits(units,size){
 const total=units.reduce((sum,u)=>sum+u.players.reduce((n,p)=>n+p.skill,0),0);
 let best=null,bestScore=Infinity;
 for(let mask=1;mask<(1<<units.length)-1;mask++){
  let redSize=0,redSkill=0,redPremade=0,bluePremade=0,redPartyPlayers=0,bluePartyPlayers=0;
  for(let i=0;i<units.length;i++){
   const u=units[i],partySize=u.players.length,party=partySize>1;
   if(mask&(1<<i)){
    redSize+=partySize;redSkill+=u.players.reduce((n,p)=>n+p.skill,0);
    if(party){redPremade=Math.max(redPremade,partySize);redPartyPlayers+=partySize;}
   }else if(party){
    bluePremade=Math.max(bluePremade,partySize);bluePartyPlayers+=partySize;
   }
  }
  if(redSize!==size)continue;
  // Teams remain skill-balanced, but a premade should face a comparably
  // coordinated opponent when one is already queued. This is a preference,
  // never a party-only gate or a reason to fabricate human opponents.
  const score=Math.abs(total-2*redSkill)+
   Math.abs(redPremade-bluePremade)*90+
   Math.abs(redPartyPlayers-bluePartyPlayers)*18;
  if(score<bestScore){bestScore=score;best=mask;}
 }
 if(best===null)return null;
 const red=[],blue=[];
 units.forEach((u,i)=>(best&(1<<i)?red:blue).push(...u.players));
 return{red,blue};
}
function createQuickMatch({send,start,clock=()=>Date.now(),validAccount=()=>true}){
 const pools=Object.fromEntries(Object.keys(SIZES).map(mode=>[mode,[]]));
 const active=new Map(),readyBySocket=new Map(),readyChecks=new Map();
 let nextId=0;
 const available=ws=>ws?.readyState===1&&!ws.room&&validAccount(ws);
 const live=u=>u.players.every(p=>available(p.ws));
 const all=units=>units.flatMap(u=>u.players);
 function broadcast(mode){
  const count=pools[mode].reduce((n,u)=>n+u.players.length,0);
  for(const unit of pools[mode])for(const p of unit.players)if(available(p.ws))
   send(p.ws,{type:'queueStatus',status:'waiting',mode,waiting:count,
    needed:SIZES[mode]*2,at:unit.at,ranked:false,humanOnly:true,partySize:unit.players.length});
 }
 function abortReady(check,offender,reason='Ready check expired.'){
  if(!readyChecks.delete(check.id))return;
  const pool=pools[check.mode];
  for(const unit of check.units){
   const offended=unit.players.some(p=>p.ws===offender);
   const accepted=!offended&&live(unit)&&unit.players.every(p=>check.accepted.has(p.ws));
   const requeued=accepted&&pool.reduce((n,u)=>n+u.players.length,0)+unit.players.length<=128;
   if(requeued)pool.push(unit);
   for(const entry of unit.players){
    readyBySocket.delete(entry.ws);
    if(!requeued)active.delete(entry.ws);
    if(entry.ws?.readyState===1)send(entry.ws,{type:'queueReadyAborted',
     mode:check.mode,id:check.id,requeued,
     reason:offended?'Your group left the ready check.':reason});
   }
  }
  pool.sort((a,b)=>a.at-b.at);
  broadcast(check.mode);
 }
 function remove(ws,quiet=false){
  const unit=active.get(ws);if(!unit)return false;
  const check=readyBySocket.get(ws);
  if(check){abortReady(check,ws,'A player declined or disconnected.');return true;}
  const list=pools[unit.mode],index=list.indexOf(unit);
  if(index>=0)list.splice(index,1);
  for(const p of unit.players){
   active.delete(p.ws);
   if(!quiet&&p.ws?.readyState===1)
    send(p.ws,{type:'queueStatus',status:'cancelled',mode:unit.mode,
     reason:unit.players.length>1?'Your party stopped searching.':'Search cancelled.'});
  }
  broadcast(unit.mode);return true;
 }
 function joinGroup(players,mode,partyId=null){
  if(!Object.hasOwn(SIZES,mode))throw Error('Choose 1v1, 2v2, 3v3 or 4v4.');
  if(!Array.isArray(players)||players.length<1||players.length>SIZES[mode])
   throw Error('Your party does not fit this playlist.');
  const users=new Set(),sockets=new Set();
  for(const p of players){
   if(!p||typeof p.user!=='string'||!p.ws||users.has(p.user)||sockets.has(p.ws)||
    !available(p.ws)||active.has(p.ws))
    throw Error('All party members must be online, signed in and not already searching.');
   users.add(p.user);sockets.add(p.ws);
  }
  for(const unit of new Set(active.values()))
   if(unit.players.some(p=>users.has(p.user)))
    throw Error('A party member is already searching.');
  const list=pools[mode];
  if(list.reduce((n,u)=>n+u.players.length,0)+players.length>128)
   throw Error('This playlist is currently full.');
  const at=clock(),entries=players.map(p=>({ws:p.ws,user:p.user,mode,at,skill:estimate(p.stats)}));
  const unit={mode,partyId,players:entries,at,skill:Math.round(entries.reduce((s,p)=>s+p.skill,0)/entries.length)};
  list.push(unit);for(const p of entries)active.set(p.ws,unit);
  broadcast(mode);drain(mode);
 }
 function join(ws,user,mode,stats){joinGroup([{ws,user,stats}],mode);}
 function expireReady(){
  for(const check of [...readyChecks.values()]){
   const gone=all(check.units).find(p=>!available(p.ws));
   if(gone)abortReady(check,gone.ws,'A player disconnected before the match.');
   else if(clock()>=check.expiresAt)abortReady(check,null,'Not everyone confirmed in time.');
  }
 }
 function respond(ws,id,accepted){
  expireReady();
  const check=readyBySocket.get(ws);
  if(!check||id!==check.id||typeof accepted!=='boolean')
   throw Error('This ready check is no longer active.');
  if(!available(ws)){abortReady(check,ws,'A player disconnected.');return;}
  if(!accepted){abortReady(check,ws,'A player declined.');return;}
  check.accepted.add(ws);
  const players=all(check.units);
  send(ws,{type:'queueReadyAccepted',id,ready:check.accepted.size,needed:players.length,
   expiresAt:check.expiresAt});
  for(const p of players)if(available(p.ws))
   send(p.ws,{type:'queueReadyProgress',id,ready:check.accepted.size,
    needed:players.length,expiresAt:check.expiresAt});
  if(check.accepted.size!==players.length)return;
  readyChecks.delete(check.id);
  for(const p of players){readyBySocket.delete(p.ws);active.delete(p.ws);}
  if(players.some(p=>!available(p.ws))){
   for(const p of players)if(p.ws?.readyState===1)
    send(p.ws,{type:'queueReadyAborted',id,mode:check.mode,requeued:false,
     reason:'A player disconnected. Start another search.'});
   return;
  }
  const teams=distributeUnits(check.units,SIZES[check.mode]);
  if(!teams)throw Error('Unable to place a full party on one team.');
  try{start({mode:check.mode,red:teams.red,blue:teams.blue});}
  catch{
   for(const p of players)if(p.ws?.readyState===1)
    send(p.ws,{type:'queueReadyAborted',id,mode:check.mode,requeued:false,
     reason:'Match server full or unavailable. Search again.'});
  }
  broadcast(check.mode);
 }
 function choose(list,anchor,needed,span,size){
  const alternatives=list.filter(u=>u!==anchor&&Math.abs(u.skill-anchor.skill)<=span)
   .sort((a,b)=>Math.abs(a.skill-anchor.skill)-Math.abs(b.skill-anchor.skill)||a.at-b.at)
   .slice(0,21);
  const remaining=needed-anchor.players.length;
  let budget=3500,solutions=0,best=null,bestScore=Infinity,bestAge=Infinity;
  function visit(index,slots,selected){
   if(--budget<=0||solutions>=96)return;
   if(slots===0){
    const units=[anchor,...selected],teams=distributeUnits(units,size);
    if(!teams)return;
    solutions++;
    const redSkill=teams.red.reduce((sum,p)=>sum+p.skill,0);
    const blueSkill=teams.blue.reduce((sum,p)=>sum+p.skill,0);
    const largestParty=side=>Math.max(0,...units
     .filter(u=>u.players.length>1&&side.includes(u.players[0]))
     .map(u=>u.players.length));
    const partyPlayers=side=>units.filter(u=>u.players.length>1&&side.includes(u.players[0]))
     .reduce((sum,u)=>sum+u.players.length,0);
    const score=Math.abs(redSkill-blueSkill)+
     90*Math.abs(largestParty(teams.red)-largestParty(teams.blue))+
     18*Math.abs(partyPlayers(teams.red)-partyPlayers(teams.blue));
    const age=units.reduce((sum,u)=>sum+u.at,0);
    if(score<bestScore||(score===bestScore&&age<bestAge)){
     best=units;bestScore=score;bestAge=age;
    }
    return;
   }
   if(slots<0||index>=alternatives.length)return;
   for(let i=index;i<alternatives.length&&budget>0&&solutions<96;i++){
    const u=alternatives[i];
    if(u.players.length>slots)continue;
    visit(i+1,slots-u.players.length,[...selected,u]);
   }
  }
  visit(0,remaining,[]);
  return best;
 }
 function drain(mode){
  const list=pools[mode],needed=SIZES[mode]*2;
  for(let i=list.length-1;i>=0;i--)if(!live(list[i])){
   for(const p of list[i].players){
    if(p.ws?.readyState===1&&!validAccount(p.ws))
     send(p.ws,{type:'queueStatus',status:'error',
      reason:'Your account session expired. Log in before searching again.'});
    active.delete(p.ws);
   }
   list.splice(i,1);
  }
  let proposed=false;
  while(list.reduce((n,u)=>n+u.players.length,0)>=needed&&readyChecks.size<16){
   let chosen=null;
   for(const anchor of list){
    const wait=Math.max(0,clock()-anchor.at);
    const span=Math.min(500,160+Math.floor(wait/10000)*25);
    chosen=choose(list,anchor,needed,span,SIZES[mode]);
    if(chosen)break;
   }
   if(!chosen)break;
   for(const unit of chosen)list.splice(list.indexOf(unit),1);
   const id=String(++nextId),check={id,mode,units:chosen,accepted:new Set(),
    expiresAt:clock()+READY_MS};
   readyChecks.set(id,check);
   for(const p of all(chosen)){
    readyBySocket.set(p.ws,check);
    send(p.ws,{type:'queueReady',id,mode,players:needed,partySize:active.get(p.ws)?.players.length||1,
     expiresAt:check.expiresAt,humanOnly:true,ranked:false});
   }
   proposed=true;
  }
  if(proposed)broadcast(mode);
 }
 function drainAll(){expireReady();for(const mode of Object.keys(SIZES))drain(mode);}
 // Public, read-only aggregate from genuine authenticated live connections.
 // No player names, IDs, IP addresses, accounts, parties or invented ETAs.
 function availability(){
  const now=clock(),modes=Object.create(null);
  for(const mode of Object.keys(SIZES)){
   const waiting=pools[mode].filter(live)
    .reduce((count,u)=>count+u.players.length,0);
   const confirming=[...readyChecks.values()].filter(check=>check.mode===mode&&
     check.expiresAt>now&&all(check.units).every(p=>available(p.ws)))
    .reduce((count,check)=>count+all(check.units).length,0);
   modes[mode]={waiting,confirming,needed:2*SIZES[mode]};
  }
  return{modes,ranked:false,humanOnly:true,at:now};
 }
 function close(){
  for(const u of new Set(active.values()))for(const p of u.players)if(p.ws?.readyState===1)
   send(p.ws,{type:'queueStatus',status:'cancelled',mode:u.mode});
  active.clear();readyChecks.clear();readyBySocket.clear();
  for(const pool of Object.values(pools))pool.length=0;
 }
 return{join,joinGroup,remove,respond,drainAll,availability,close,estimate,distribute};
}
module.exports={createQuickMatch,SIZES,estimate,distribute};
