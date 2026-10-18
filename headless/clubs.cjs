'use strict';
// A player's persistent club is social identity, never an Elo rank. Club data
// and invitation authority stay on the native server, never in browser state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const USER=/^[a-z0-9_-]{3,20}$/,ID=/^[a-f0-9]{16}$/,TAG=/^[A-Z0-9]{2,5}$/;
const MAX_BYTES=1024*1024,MAX_CLUBS=500,MAX_MEMBERS=24,MAX_INVITES=2000;
const DAY=864e5;
const normalized=x=>{if(typeof x!=='string'||!USER.test(x.toLowerCase()))throw Error('Invalid account.');return x.toLowerCase();};
function validName(x){return typeof x==='string'&&x.trim().length>=3&&x.trim().length<=32&&!/[\x00-\x1f\x7f<>]/.test(x);}
function validDescription(x){return typeof x==='string'&&x.length<=180&&!/[\x00-\x1f\x7f<>]/.test(x);}
function validate(data){
 if(!data||data.version!==1||!Array.isArray(data.clubs)||!Array.isArray(data.invites)||
  data.clubs.length>MAX_CLUBS||data.invites.length>MAX_INVITES)throw Error('Invalid club storage.');
 const ids=new Set(),tags=new Set(),members=new Set(),inviteKeys=new Set();
 for(const club of data.clubs){
  if(!club||typeof club!=='object'||!ID.test(club.id)||ids.has(club.id)||
   !TAG.test(club.tag)||tags.has(club.tag)||!validName(club.name)||
   !validDescription(club.description)||!USER.test(club.owner)||
   !Number.isSafeInteger(club.createdAt)||club.createdAt<=0||
   !Array.isArray(club.members)||club.members.length<1||club.members.length>MAX_MEMBERS||
   new Set(club.members).size!==club.members.length||!club.members.includes(club.owner)||
   club.members.some(x=>!USER.test(x)||members.has(x)))throw Error('Invalid club storage.');
  ids.add(club.id);tags.add(club.tag);for(const name of club.members)members.add(name);
 }
 for(const invite of data.invites){
  if(!invite||!ID.test(invite.clubId)||!ids.has(invite.clubId)||!USER.test(invite.user)||
   !USER.test(invite.by)||!Number.isSafeInteger(invite.expiresAt)||invite.expiresAt<=0||
   members.has(invite.user)||inviteKeys.has(invite.clubId+'\0'+invite.user))
   throw Error('Invalid club invitation storage.');
  const club=data.clubs.find(c=>c.id===invite.clubId);
  if(!club.members.includes(invite.by))throw Error('Invalid club invitation issuer.');
  inviteKeys.add(invite.clubId+'\0'+invite.user);
 }
 return data;
}
function load(file){
 let pre;
 try{pre=fs.lstatSync(file);}catch(e){if(e?.code==='ENOENT')return{version:1,clubs:[],invites:[]};throw Error('Club storage unavailable.');}
 if(!pre.isFile()||pre.size>MAX_BYTES||typeof fs.constants.O_NOFOLLOW!=='number'||
  typeof fs.constants.O_NONBLOCK!=='number')throw Error('Club storage unavailable.');
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
  const first=fs.fstatSync(fd);
  if(!first.isFile()||first.ino!==pre.ino||first.dev!==pre.dev||
   first.size!==pre.size||first.mtimeMs!==pre.mtimeMs)throw Error('Club source replaced.');
  const raw=fs.readFileSync(fd),last=fs.fstatSync(fd),pathNow=fs.lstatSync(file);
  if(raw.length>MAX_BYTES||last.size!==first.size||last.mtimeMs!==first.mtimeMs||
   pathNow.ino!==first.ino||pathNow.dev!==first.dev||pathNow.mtimeMs!==first.mtimeMs)
   throw Error('Club source changed.');
  return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 }catch{throw Error('Club storage integrity invalid.');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function createClubs(dir,{areFriends,exists=()=>true,clock=()=>Date.now()}={}){
 if(typeof dir!=='string'||!dir.trim())throw Error('Club data requires a server directory.');
 if(typeof areFriends!=='function')throw Error('Club invitations need verified friendship.');
 const file=path.join(dir,'clubs.json');let data=load(file);
 const clone=()=>({version:1,clubs:data.clubs.map(c=>({...c,members:[...c.members]})),
  invites:data.invites.map(i=>({...i}))});
 function write(next){
  validate(next);
  const payload=JSON.stringify(next);
  if(Buffer.byteLength(payload)>MAX_BYTES)throw Error('Club storage full.');
  fs.mkdirSync(dir,{recursive:true});
  const tmp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';let fd;
  try{
   fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,payload);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(tmp,file);data=next;
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(tmp,{force:true});}catch{}
   throw Error('Club update could not be saved.');
  }
 }
 const findMember=(user,source=data)=>source.clubs.find(c=>c.members.includes(user));
 const findClub=(id,source=data)=>source.clubs.find(c=>c.id===id);
 const activeInvites=(source)=>source.invites.filter(x=>x.expiresAt>clock()&&!!findClub(x.clubId,source));
 function view(username){
  const user=normalized(username),club=findMember(user);
  return{
   club:club?{...club,members:[...club.members]}:null,
   invites:activeInvites(data).filter(i=>i.user===user).map(i=>{
    const c=findClub(i.clubId);
    return{clubId:i.clubId,name:c.name,tag:c.tag,by:i.by,expiresAt:i.expiresAt};
   })
  };
 }
 function action(username,d){
  const user=normalized(username),op=d?.action;
  if(typeof op!=='string')throw Error('Choose a club action.');
  const next=clone();
  next.invites=activeInvites(next);
  let club=findMember(user,next);
  if(op==='create'){
   if(club)throw Error('Leave your existing club first.');
   if(next.clubs.length>=MAX_CLUBS)throw Error('This server has reached its club limit.');
   if(!validName(d.name)||typeof d.tag!=='string'||!TAG.test(d.tag.toUpperCase()))
    throw Error('Club name (3–32) and tag (2–5 letters/digits) required.');
   const tag=d.tag.toUpperCase(),name=d.name.trim();
   if(next.clubs.some(c=>c.tag===tag))throw Error('Club tag is already taken.');
   const id=crypto.randomBytes(8).toString('hex');
   next.clubs.push({id,tag,name,description:'',owner:user,members:[user],createdAt:clock()});
  }else if(op==='invite'){
   if(!club||club.owner!==user)throw Error('Only the club captain can invite players.');
   const target=normalized(d.user);
   if(target===user||!exists(target)||!areFriends(user,target))throw Error('Invite an accepted friend with an account.');
   if(findMember(target,next))throw Error('Player already belongs to a club.');
   if(club.members.length>=MAX_MEMBERS)throw Error('Club roster is full.');
   if(next.invites.some(i=>i.clubId===club.id&&i.user===target))throw Error('Invite already sent.');
   if(next.invites.filter(i=>i.clubId===club.id).length>=50||next.invites.filter(i=>i.user===target).length>=20)
    throw Error('Too many pending club invitations.');
   next.invites.push({clubId:club.id,user:target,by:user,expiresAt:clock()+7*DAY});
  }else if(op==='accept'||op==='decline'){
   if(typeof d.clubId!=='string'||!ID.test(d.clubId))throw Error('Invalid club invite.');
   const invite=next.invites.find(i=>i.user===user&&i.clubId===d.clubId);
   if(!invite)throw Error('Club invitation expired or unavailable.');
   if(op==='accept'){
    if(club)throw Error('You already belong to a club.');
    const destination=findClub(invite.clubId,next);
    if(!destination||destination.members.length>=MAX_MEMBERS)throw Error('This club is full.');
    destination.members.push(user);
   }
   next.invites=next.invites.filter(i=>i!==invite&&(op!=='accept'||i.user!==user));
  }else if(op==='leave'){
   if(!club)throw Error('You are not in a club.');
   if(club.owner===user)throw Error('Transfer captaincy or disband the club before leaving.');
   club.members=club.members.filter(n=>n!==user);
  }else if(op==='kick'){
   if(!club||club.owner!==user)throw Error('Only the club captain may remove members.');
   const target=normalized(d.user);
   if(target===user||!club.members.includes(target))throw Error('Choose another club member.');
   club.members=club.members.filter(n=>n!==target);
  }else if(op==='promote'){
   if(!club||club.owner!==user)throw Error('Only the current captain may transfer ownership.');
   const target=normalized(d.user);
   if(target===user||!club.members.includes(target))throw Error('Choose another club member.');
   club.owner=target;
  }else if(op==='rename'){
   if(!club||club.owner!==user)throw Error('Only the club captain can edit its identity.');
   if(!validName(d.name)||typeof d.tag!=='string'||!TAG.test(d.tag.toUpperCase()))
    throw Error('Club name or tag is invalid.');
   const tag=d.tag.toUpperCase();
   if(next.clubs.some(c=>c.id!==club.id&&c.tag===tag))throw Error('Club tag is already taken.');
   club.name=d.name.trim();club.tag=tag;
  }else if(op==='describe'){
   if(!club||club.owner!==user)throw Error('Only the captain can edit this club.');
   if(!validDescription(d.description))throw Error('Description must be 180 characters or fewer.');
   club.description=d.description.trim();
  }else if(op==='disband'){
   if(!club||club.owner!==user)throw Error('Only the captain can disband this club.');
   next.clubs=next.clubs.filter(c=>c.id!==club.id);
   next.invites=next.invites.filter(i=>i.clubId!==club.id);
  }else throw Error('Unknown club action.');
  // Invitations for now-unavailable targets cannot become backdoors to
  // multiple memberships; a successful accept drops all other invitations.
  write(next);
  return view(user);
 }
 return{view,action};
}
module.exports={createClubs};
