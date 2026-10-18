'use strict';
// Private, authenticated social graph. No public usernames directory, room
// enumeration, opponent tracking, or client-supplied online-status claims.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const NAME=/^[a-z0-9_-]{3,20}$/;
const MAX_BYTES=1024*1024,MAX_EDGES=8000,MAX_PER_PLAYER=100;
const normalize=value=>{
 if(typeof value!=='string'||!NAME.test(value.toLowerCase()))throw Error('Invalid account name.');
 return value.toLowerCase();
};
const pair=(a,b)=>a<b?[a,b]:[b,a];
const key=(a,b)=>a+'\x00'+b;
function validate(data){
 if(!data||data.version!==1||!Array.isArray(data.friends)||
  !Array.isArray(data.requests)||!Array.isArray(data.blocks)||
  data.friends.length+data.requests.length+data.blocks.length>MAX_EDGES)
  throw Error('Social state invalid.');
 const seen=[new Set(),new Set(),new Set()],count=new Map();
 for(const [i,collection]of [data.friends,data.requests,data.blocks].entries()){
  for(const edge of collection){
   if(!Array.isArray(edge)||edge.length!==2||edge.some(n=>typeof n!=='string'||!NAME.test(n))||
    edge[0]===edge[1]||i===0&&edge[0]>=edge[1])throw Error('Social state invalid.');
   const k=key(...edge);
   if(seen[i].has(k))throw Error('Social state invalid.');
   seen[i].add(k);
   for(const name of edge){count.set(name,(count.get(name)||0)+1);if(count.get(name)>3*MAX_PER_PLAYER)throw Error('Social state too large.');}
  }
 }
 for(const [a,b]of data.friends){
  if(seen[2].has(key(a,b))||seen[2].has(key(b,a))||
    seen[1].has(key(a,b))||seen[1].has(key(b,a)))throw Error('Social state invalid.');
 }
 for(const [a,b]of data.requests)
  if(seen[2].has(key(a,b))||seen[2].has(key(b,a)))throw Error('Social state invalid.');
 return data;
}
function load(file){
 let before;
 try{before=fs.lstatSync(file);}catch(e){if(e?.code==='ENOENT')return{version:1,friends:[],requests:[],blocks:[]};throw Error('Social store unavailable.');}
 if(!before.isFile()||before.size>MAX_BYTES||
  typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')
  throw Error('Social store unavailable.');
 let fd;
 try{
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
  const opened=fs.fstatSync(fd);
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
   opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)throw Error('Social state replaced.');
  const raw=fs.readFileSync(fd),after=fs.fstatSync(fd),current=fs.lstatSync(file);
  if(raw.length>MAX_BYTES||after.size!==opened.size||current.dev!==opened.dev||
   current.ino!==opened.ino||after.mtimeMs!==opened.mtimeMs||current.mtimeMs!==opened.mtimeMs)
   throw Error('Social state changed.');
  return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 }catch{throw Error('Social store integrity invalid.');}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
function createSocial(dir){
 if(typeof dir!=='string'||!dir.trim())throw Error('Social storage requires a data directory.');
 const file=path.join(dir,'friends.json');
 let data=load(file);
 const edges=(name,col)=>data[col].filter(e=>e.includes(name)).map(e=>e[0]===name?e[1]:e[0]);
 const friends=(a,b,source=data)=>source.friends.some(e=>e[0]===pair(a,b)[0]&&e[1]===pair(a,b)[1]);
 const blocked=(a,b,source=data)=>source.blocks.some(e=>e[0]===a&&e[1]===b||e[0]===b&&e[1]===a);
 function save(next){
  validate(next);
  const payload=JSON.stringify(next);
  if(Buffer.byteLength(payload)>MAX_BYTES)throw Error('Social storage full.');
  fs.mkdirSync(dir,{recursive:true});
  const temp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
  let fd;
  try{
   fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,payload);
   fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(temp,file);
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(temp,{force:true});}catch{}
   throw Error('Could not save social changes.');
  }
  data=next;
 }
 function transact(fn){
  const next={version:1,friends:data.friends.map(e=>[...e]),
   requests:data.requests.map(e=>[...e]),blocks:data.blocks.map(e=>[...e])};
  fn(next);save(next);
 }
 function view(username,online){
  const user=normalize(username);
  return{
   friends:edges(user,'friends').sort().map(name=>({name,online:online.has(name)})),
   incoming:data.requests.filter(e=>e[1]===user).map(e=>e[0]).sort(),
   outgoing:data.requests.filter(e=>e[0]===user).map(e=>e[1]).sort(),
   blocked:data.blocks.filter(e=>e[0]===user).map(e=>e[1]).sort()
  };
 }
 function action(username,op,other,exists){
  const user=normalize(username),target=normalize(other);
  if(user===target)throw Error('Choose another player.');
  if(!['request','accept','decline','cancel','remove','block','unblock'].includes(op))
   throw Error('Unknown friend action.');
  if(['request','block'].includes(op)&&!exists(target))throw Error('Player not found.');
  const old=data;
  const isFriend=friends(user,target),pending=data.requests.some(e=>e[0]===user&&e[1]===target),
   received=data.requests.some(e=>e[0]===target&&e[1]===user);
  if(op==='request'){
   if(blocked(user,target))throw Error('This friendship is unavailable.');
   if(isFriend)throw Error('You are already friends.');
   if(pending)throw Error('Request already sent.');
   if(received)throw Error('This player already invited you. Accept their request instead.');
   if(view(user,new Set()).outgoing.length>=MAX_PER_PLAYER)throw Error('Too many outgoing requests.');
   if(view(target,new Set()).incoming.length>=MAX_PER_PLAYER)throw Error('Recipient inbox is full.');
   transact(next=>next.requests.push([user,target]));
  }else if(op==='accept'){
   if(!received||blocked(user,target))throw Error('No incoming request from that player.');
   if(edges(user,'friends').length>=MAX_PER_PLAYER||edges(target,'friends').length>=MAX_PER_PLAYER)
    throw Error('Friends list is full.');
   transact(next=>{
    next.requests=next.requests.filter(e=>!(e[0]===target&&e[1]===user));
    next.friends.push(pair(user,target));
   });
  }else if(op==='decline'||op==='cancel'){
   if(op==='decline'&&!received||op==='cancel'&&!pending)throw Error('No matching request.');
   transact(next=>{next.requests=next.requests.filter(e=>!(e[0]===(op==='decline'?target:user)&&e[1]===(op==='decline'?user:target)));});
  }else if(op==='remove'){
   if(!isFriend)throw Error('This player is not on your friends list.');
   transact(next=>{next.friends=next.friends.filter(e=>!(e[0]===pair(user,target)[0]&&e[1]===pair(user,target)[1]));});
  }else if(op==='block'){
   if(data.blocks.some(e=>e[0]===user&&e[1]===target))throw Error('Player already blocked.');
   if(data.blocks.filter(e=>e[0]===user).length>=MAX_PER_PLAYER)throw Error('Block list is full.');
   transact(next=>{
    next.blocks.push([user,target]);
    next.friends=next.friends.filter(e=>!(e[0]===pair(user,target)[0]&&e[1]===pair(user,target)[1]));
    next.requests=next.requests.filter(e=>!e.includes(user)||!e.includes(target));
   });
  }else if(op==='unblock'){
   if(!data.blocks.some(e=>e[0]===user&&e[1]===target))throw Error('Player is not blocked.');
   transact(next=>{next.blocks=next.blocks.filter(e=>!(e[0]===user&&e[1]===target));});
  }
  return{ok:true};
 }
 return{view,action,areFriends:(a,b)=>{
  const user=normalize(a),target=normalize(b);
  return user!==target&&friends(user,target)&&!blocked(user,target);
 }};
}
module.exports={createSocial};