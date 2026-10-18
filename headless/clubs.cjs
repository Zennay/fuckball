'use strict';
// Account-authenticated, server-local club rosters and invitations.
// Membership is social only: never awards Elo or a verified competitive result.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const USER=/^[a-z0-9_-]{3,20}$/,TAG=/^[A-Z0-9]{2,6}$/,CLUB_NAME=/^[A-Za-z0-9][A-Za-z0-9 ._'-]{2,31}$/;
const ID=/^[0-9a-f]{16}$/,MAX_CLUBS=1000,MAX_MEMBERS=24,MAX_INVITES=16,MAX_BYTES=1024*1024;
const normalize=x=>{
 if(typeof x!=='string'||!USER.test(x.toLowerCase()))throw Error('Invalid account name.');
 return x.toLowerCase();
};
const fresh=()=>({version:1,clubs:[]});
function validate(data){
 if(!data||data.version!==1||!Array.isArray(data.clubs)||data.clubs.length>MAX_CLUBS)
  throw Error('Club records invalid.');
 const ids=new Set(),tags=new Set(),members=new Set();
 for(const club of data.clubs){
  if(!club||typeof club!=='object'||Array.isArray(club)||!ID.test(club.id)||
   typeof club.name!=='string'||!CLUB_NAME.test(club.name)||
   typeof club.tag!=='string'||!TAG.test(club.tag)||
   !Number.isSafeInteger(club.createdAt)||club.createdAt<=0||
   !Array.isArray(club.members)||club.members.length<1||club.members.length>MAX_MEMBERS||
   !Array.isArray(club.invites)||club.invites.length>MAX_INVITES||
   ids.has(club.id)||tags.has(club.tag))throw Error('Club records invalid.');
  ids.add(club.id);tags.add(club.tag);
  const seen=new Set(),invited=new Set();let owners=0;
  for(const member of club.members){
   if(!member||!USER.test(member.user)||!['owner','captain','member'].includes(member.role)||
    seen.has(member.user)||members.has(member.user))throw Error('Club members invalid.');
   seen.add(member.user);members.add(member.user);
   if(member.role==='owner')owners++;
  }
  if(owners!==1)throw Error('Club ownership invalid.');
  for(const user of club.invites){
   if(typeof user!=='string'||!USER.test(user)||seen.has(user)||invited.has(user))
    throw Error('Club invitations invalid.');
   invited.add(user);
  }
 }
 // User can hold invitations to several clubs but be a member of one.
 return data;
}
function load(file){
 let info;try{info=fs.lstatSync(file);}catch(e){if(e?.code==='ENOENT')return fresh();throw Error('Club storage unavailable.');}
 if(!info.isFile()||info.size>MAX_BYTES||
  typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')
  throw Error('Club storage invalid.');
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.dev!==info.dev||opened.ino!==info.ino||
   opened.size!==info.size||opened.mtimeMs!==info.mtimeMs||opened.ctimeMs!==info.ctimeMs)
   throw Error('Club storage changed.');
  const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),now=fs.lstatSync(file);
  if(bytes.length>MAX_BYTES||after.size!==opened.size||now.ino!==opened.ino||
    now.dev!==opened.dev||after.mtimeMs!==opened.mtimeMs||now.mtimeMs!==opened.mtimeMs||
    after.ctimeMs!==opened.ctimeMs||now.ctimeMs!==opened.ctimeMs)
   throw Error('Club storage changed.');
  return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 }catch{throw Error('Club storage integrity invalid.');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function createClubs(dir){
 if(typeof dir!=='string'||!dir.trim())throw Error('Club storage requires a persistent data directory.');
 const file=path.join(dir,'clubs.json');let data=load(file);
 const belonging=(user,source=data)=>source.clubs.find(c=>c.members.some(m=>m.user===user));
 const assigned=(club,user)=>club.members.find(m=>m.user===user);
 function commit(next){
  validate(next);
  const raw=JSON.stringify(next);
  if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('Club storage capacity reached.');
  fs.mkdirSync(dir,{recursive:true});
  const temp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
  let fd;
  try{
   fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,raw);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(temp,file);
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(temp,{force:true});}catch{}
   throw Error('Could not save club changes.');
  }
  data=next;
 }
 function edit(callback){
  const next=JSON.parse(JSON.stringify(data));const result=callback(next);
  commit(next);return result;
 }
 function view(user){
  const who=normalize(user),club=belonging(who);
  const pending=data.clubs.filter(c=>c.invites.includes(who))
   .map(c=>({id:c.id,name:c.name,tag:c.tag})).slice(0,25);
  if(!club)return{club:null,invites:pending};
  return{club:{id:club.id,name:club.name,tag:club.tag,createdAt:club.createdAt,
   myRole:assigned(club,who)?.role,members:club.members.map(m=>({...m})),
   invites:assigned(club,who)?.role==='member'?[]:club.invites.slice()},invites:pending};
 }
 function action(user,op,payload,exists){
  const who=normalize(user);
  if(op==='create'){
   const name=typeof payload.name==='string'?payload.name.trim():'';
   const tag=typeof payload.tag==='string'?payload.tag.toUpperCase().trim():'';
   if(!CLUB_NAME.test(name)||!TAG.test(tag))throw Error('Club name must be 3–32 characters and tag 2–6 letters/digits.');
   if(belonging(who))throw Error('Leave your current club first.');
   if(data.clubs.length>=MAX_CLUBS)throw Error('Club capacity reached.');
   if(data.clubs.some(c=>c.tag===tag))throw Error('Club tag is already taken.');
   const id=crypto.randomBytes(8).toString('hex');
   edit(next=>next.clubs.push({id,name,tag,createdAt:Date.now(),
    members:[{user:who,role:'owner'}],invites:[]}));
  }else if(op==='accept'||op==='decline'){
   if(typeof payload.id!=='string'||!ID.test(payload.id))throw Error('Invalid club invitation.');
   const club=data.clubs.find(c=>c.id===payload.id);
   if(!club||!club.invites.includes(who))throw Error('No active club invitation.');
   if(op==='accept'){
    if(belonging(who))throw Error('Leave your existing club before joining.');
    if(club.members.length>=MAX_MEMBERS)throw Error('Club roster is full.');
   }
   edit(next=>{
    const chosen=next.clubs.find(c=>c.id===payload.id);
    chosen.invites=chosen.invites.filter(n=>n!==who);
    if(op==='accept')chosen.members.push({user:who,role:'member'});
   });
  }else{
   const club=belonging(who);
   if(!club)throw Error('You are not a member of a club.');
   const role=assigned(club,who)?.role,target=payload.user===undefined?null:normalize(payload.user);
   if(op==='invite'){
    if(!['owner','captain'].includes(role))throw Error('Only club leaders can invite players.');
    if(!target||target===who||!exists(target))throw Error('Choose an existing player to invite.');
    if(belonging(target))throw Error('That player already belongs to a club.');
    if(club.members.length+club.invites.length>=MAX_MEMBERS||
       club.invites.length>=MAX_INVITES)throw Error('Club invitation capacity reached.');
    if(club.invites.includes(target))throw Error('Invitation is already pending.');
    edit(next=>next.clubs.find(c=>c.id===club.id).invites.push(target));
   }else if(op==='revoke'){
    if(!['owner','captain'].includes(role)||!target||!club.invites.includes(target))
     throw Error('No invitation available to revoke.');
    edit(next=>{const c=next.clubs.find(c=>c.id===club.id);
     c.invites=c.invites.filter(n=>n!==target);});
   }else if(op==='promote'||op==='demote'){
    if(role!=='owner'||!target||target===who||!assigned(club,target))
     throw Error('Only owners can change another member’s role.');
    if(op==='promote'&&assigned(club,target).role!=='member'||
       op==='demote'&&assigned(club,target).role!=='captain')
     throw Error('That member already has a different role.');
    edit(next=>{assigned(next.clubs.find(c=>c.id===club.id),target).role=
     op==='promote'?'captain':'member';});
   }else if(op==='transfer'){
    if(role!=='owner'||!target||target===who||!assigned(club,target))
     throw Error('Select a current member to receive club ownership.');
    edit(next=>{const c=next.clubs.find(c=>c.id===club.id);
     assigned(c,who).role='member';assigned(c,target).role='owner';});
   }else if(op==='kick'){
    const theirs=target&&assigned(club,target);
    if(!theirs||target===who||role!=='owner'&&!(role==='captain'&&theirs.role==='member'))
     throw Error('You cannot remove that club member.');
    edit(next=>{const c=next.clubs.find(c=>c.id===club.id);
     c.members=c.members.filter(m=>m.user!==target);});
   }else if(op==='leave'){
    if(role==='owner')throw Error('Transfer ownership or disband the club before leaving.');
    edit(next=>{const c=next.clubs.find(c=>c.id===club.id);
     c.members=c.members.filter(m=>m.user!==who);});
   }else if(op==='disband'){
    if(role!=='owner')throw Error('Only the club owner can disband the club.');
    edit(next=>{next.clubs=next.clubs.filter(c=>c.id!==club.id);});
   }else throw Error('Unknown club action.');
  }
  return view(who);
 }
 return{view,action,
  membership(username){
   const who=normalize(username),club=belonging(who);
   const member=club&&assigned(club,who);
   return member?{id:club.id,tag:club.tag,role:member.role}:null;
  }
 };
}
module.exports={createClubs};
