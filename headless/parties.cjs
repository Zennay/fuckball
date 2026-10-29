'use strict';
// Ephemeral, private friend parties. A party never awards rank or overrides
// player consent; every member must ready up before the leader can queue.
const crypto=require('node:crypto');
const MAX=4,MAX_PARTIES=256,INVITE_MS=5*60000,LAUNCH_MS=30000;
const NAME=/^[a-z0-9_-]{3,20}$/;
const MODES={'1v1':1,'2v2':2,'3v3':3,'4v4':4,'club4v4':4};
const norm=name=>{
 if(typeof name!=='string'||!NAME.test(name.toLowerCase()))throw Error('Invalid player account.');
 return name.toLowerCase();
};
function createParties({social,exists,clubForUser=()=>null,clock=()=>Date.now()}){
 // Invites may travel through an accepted friendship OR a shared current Club.
 // A social block always denies both routes, even for existing Club members.
 const eligibleTeammates=(a,b)=>{
  if(!social.canShareMatch(a,b))return false;
  const clubA=clubForUser(a);
  return social.areFriends(a,b)||!!clubA&&clubA===clubForUser(b);
 };
 const parties=new Map(),members=new Map(),invites=new Map();
 const partyOf=user=>parties.get(members.get(norm(user)))||null;
 function purge(){
  const now=clock();
  for(const [name,list]of invites){
   const valid=list.filter(i=>i.expiresAt>now&&parties.has(i.id)&&
    parties.get(i.id).leader===i.leader&&eligibleTeammates(i.leader,name));
   if(valid.length)invites.set(name,valid);else invites.delete(name);
  }
  for(const p of parties.values())if(p.launchMode&&p.launchExpires<=now){
   p.launchMode=null;p.launchExpires=0;p.ready.clear();
  }
 }
 function snapshot(username){
  const user=norm(username);purge();
  const p=partyOf(user);
  return{party:p?{
   id:p.id,leader:p.leader,members:p.users.map(name=>({name,ready:p.ready.has(name)})),
   launchMode:p.launchMode,launchExpires:p.launchExpires,
   maxSize:MAX
  }:null,invitations:(invites.get(user)||[]).map(i=>({id:i.id,from:i.leader,expiresAt:i.expiresAt}))};
 }
 function action(username,data){
  const user=norm(username),op=data?.action;
  purge();
  if(op==='create'){
   if(partyOf(user))throw Error('You already belong to a party.');
   if(parties.size>=MAX_PARTIES)throw Error('Party service is full.');
   const id=crypto.randomBytes(10).toString('hex');
   parties.set(id,{id,leader:user,users:[user],ready:new Set(),launchMode:null,launchExpires:0});
   members.set(user,id);
  }else if(op==='invite'){
   const p=partyOf(user),target=norm(data.user);
   if(!p||p.leader!==user)throw Error('Only the party leader can invite friends.');
   if(p.launchMode)throw Error('Cancel the party search before inviting.');
   if(p.users.length>=MAX)throw Error('Party is full.');
   if(target===user||!exists(target)||!eligibleTeammates(user,target))
    throw Error('Invite a mutual friend or another member of your Club. Blocked accounts cannot be invited.');
   if(partyOf(target))throw Error('Friend already belongs to a party.');
   const current=(invites.get(target)||[]).filter(i=>i.id!==p.id);
   if(current.length>=12)throw Error('Friend has too many invitations.');
   current.push({id:p.id,leader:user,expiresAt:clock()+INVITE_MS});
   invites.set(target,current);
  }else if(op==='accept'||op==='decline'){
   if(typeof data.id!=='string')throw Error('Invalid party invitation.');
   const available=(invites.get(user)||[]).find(i=>i.id===data.id);
   if(!available)throw Error('Party invitation expired.');
   invites.set(user,(invites.get(user)||[]).filter(i=>i.id!==data.id));
   if(op==='accept'){
    if(partyOf(user))throw Error('Leave your current party first.');
    const p=parties.get(data.id);
    if(!p||p.leader!==available.leader||p.users.length>=MAX||p.launchMode||
      !eligibleTeammates(p.leader,user))throw Error('This party is no longer accepting players.');
    p.users.push(user);p.ready.clear();members.set(user,p.id);
   }
  }else{
   const p=partyOf(user);
   if(!p)throw Error('Join or create a party first.');
   if(op==='ready'){
    if(p.launchMode)throw Error('The party is already searching.');
    if(data.ready===true)p.ready.add(user);
    else if(data.ready===false)p.ready.delete(user);
    else throw Error('Ready must be true or false.');
   }else if(op==='launch'){
    if(user!==p.leader)throw Error('Only the party leader can start matchmaking.');
    if(p.launchMode)throw Error('The party is already searching.');
    if(!Object.hasOwn(MODES,data.mode)||p.users.length>MODES[data.mode]||
      p.users.length<2)throw Error('Choose a playlist that fits your party.');
    if(p.ready.size!==p.users.length)throw Error('Every member must ready up first.');
    p.launchMode=data.mode;p.launchExpires=clock()+LAUNCH_MS;
   }else if(op==='cancel'){
    if(user!==p.leader)throw Error('Only the party leader can cancel matchmaking.');
    p.launchMode=null;p.launchExpires=0;p.ready.clear();
   }else if(op==='kick'){
    if(p.leader!==user||p.launchMode)throw Error('Only a non-searching party leader can remove a member.');
    const target=norm(data.user);
    if(target===user||!p.users.includes(target))throw Error('Choose another party member.');
    p.users=p.users.filter(n=>n!==target);p.ready.clear();members.delete(target);
   }else if(op==='leave'){
    if(p.launchMode)throw Error('Cancel the search before leaving.');
    p.users=p.users.filter(n=>n!==user);p.ready.clear();members.delete(user);
    if(!p.users.length)parties.delete(p.id);
    else if(p.leader===user)p.leader=p.users[0];
   }else throw Error('Unknown party action.');
  }
  return snapshot(user);
 }
 function queueFor(user,mode){
  purge();const p=partyOf(user);
  if(!p||p.launchMode!==mode||p.launchExpires<=clock()||
    !p.ready.has(norm(user)))return null;
  return{id:p.id,users:[...p.users],leader:p.leader,mode};
 }
 function consume(id){
  const p=parties.get(id);
  if(!p)return;
  p.launchMode=null;p.launchExpires=0;p.ready.clear();
 }
 return{snapshot,action,queueFor,consume,purge};
}
module.exports={createParties};
