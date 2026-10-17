'use strict';
// Minimal player accounts: a username reserves your nickname across rooms.
// Passwords are scrypt-hashed with a per-user salt; sessions are random
// tokens of which only a SHA-256 hash is stored. Data is one JSON file,
// written atomically. No e-mail, no recovery: this is a nickname lock.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const NAME=/^[A-Za-z0-9_-]{3,20}$/,TOKEN_DAYS=90;
function createAccounts(dir){
 const file=dir?path.join(dir,'accounts.json'):null;let data={users:Object.create(null),sessions:Object.create(null)};
 // One bounded, non-following, nonblocking descriptor for an existing store.
 // A FIFO/symlink must never hang startup or read outside the chosen root.
 // ENOENT alone denotes a genuinely absent first-install registry.
 const MAX_REGISTRY_BYTES=8*1024*1024;
 function sameFile(a,b){
  return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&
   a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
 }
 function readExisting(filePath){
  let before;
  try{before=fs.lstatSync(filePath);}
  catch(e){
   if(e?.code==='ENOENT')return undefined;
   throw Error('Account state unavailable; refusing to start.');
  }
  if(!before.isFile()||before.size>MAX_REGISTRY_BYTES||
     typeof fs.constants.O_NOFOLLOW!=='number'||
     typeof fs.constants.O_NONBLOCK!=='number')
   throw Error('Account state unavailable; refusing to start.');
  let fd;
  try{
   fd=fs.openSync(filePath,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|
                  fs.constants.O_NOFOLLOW);
   const opened=fs.fstatSync(fd);
   if(!opened.isFile()||!sameFile(before,opened))
    throw Error('Account source identity changed.');
   const chunks=[];let count=0;
   while(count<=MAX_REGISTRY_BYTES){
    const chunk=Buffer.alloc(Math.min(65536,MAX_REGISTRY_BYTES+1-count));
    const n=fs.readSync(fd,chunk,0,chunk.length,null);
    if(n===0)break;
    count+=n;chunks.push(chunk.subarray(0,n));
   }
   if(count>MAX_REGISTRY_BYTES)throw Error('Account file too large.');
   const finished=fs.fstatSync(fd),after=fs.lstatSync(filePath);
   if(!after.isFile()||!sameFile(opened,finished)||!sameFile(opened,after))
    throw Error('Account source changed during read.');
   return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,count));
  }catch{
   // No filesystem pathname or account bytes in operator/client messages.
   throw Error('Account state unavailable; refusing to start.');
  }finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 if(file){
  const raw=readExisting(file);
  if(raw!==undefined){
   let loaded;
   try{loaded=JSON.parse(raw);}
   catch{throw Error('Account state invalid; refusing to start.');}
   const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
   if(!record(loaded)||!record(loaded.users)||!record(loaded.sessions))
    throw Error('Account state invalid; refusing to start.');
   // Prototype-free dictionaries allow legitimate names such as `constructor`
   // and `__proto__` without inheritance or prototype mutation.
   data={users:Object.assign(Object.create(null),loaded.users),
    sessions:Object.assign(Object.create(null),loaded.sessions)};
  }
 }
 let dirty=false;
 // Never acknowledge registration, login or logout until its durable write
 // succeeds. On error keep the old atomic file and discard the staging file.
 function save(){
  if(!file){dirty=false;return;}
  const tmp=file+'.'+process.pid+'.tmp';
  try{
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});
   fs.renameSync(tmp,file);
   dirty=false;
  }catch{
   try{fs.rmSync(tmp,{force:true});}catch{}
   dirty=true;
   throw Error('Account persistence unavailable.');
  }
 }
 const key=name=>String(name).toLowerCase(),sha=t=>crypto.createHash('sha256').update(t).digest('hex');
 function hash(password,salt){return crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1}).toString('hex');}
 function issue(username){
  const token=crypto.randomBytes(32).toString('hex'),session=sha(token);
  data.sessions[session]={u:key(username),exp:Date.now()+TOKEN_DAYS*864e5};
  try{save();}catch(e){delete data.sessions[session];throw e;}
  return token;
 }
 function validate(username,password){if(typeof username!=='string'||!NAME.test(username))throw Error('Username: 3-20 letters, digits, _ or -.');if(typeof password!=='string'||password.length<6||password.length>100)throw Error('Password: at least 6 characters.');}
 return{
  register(username,password){
   validate(username,password);const id=key(username);
   if(Object.hasOwn(data.users,id))throw Error('That username is taken.');
   const salt=crypto.randomBytes(16).toString('hex');
   data.users[id]={name:username,salt,hash:hash(password,salt),created:Date.now()};
   try{return{username,token:issue(username)};}
   catch(e){delete data.users[id];throw e;}
  },
  login(username,password){validate(username,password);const id=key(username),u=Object.hasOwn(data.users,id)?data.users[id]:null;const ok=u&&crypto.timingSafeEqual(Buffer.from(hash(password,u.salt),'hex'),Buffer.from(u.hash,'hex'));if(!ok)throw Error('Wrong username or password.');return{username:u.name,token:issue(u.name)};},
  user(token){if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))return null;const s=data.sessions[sha(token)];if(!s)return null;if(s.exp<Date.now()){delete data.sessions[sha(token)];dirty=true;return null;}return Object.hasOwn(data.users,s.u)?data.users[s.u]?.name||null:null;},
  logout(token){
   if(typeof token==='string'){
    const id=sha(token),session=data.sessions[id];
    if(session){
     delete data.sessions[id];
     try{save();}catch(e){data.sessions[id]=session;throw e;}
    }
   }
  },
  reserved(name){return Object.hasOwn(data.users,key(String(name).trim()));},
  flush(){if(dirty)save();}
 };
}
module.exports={createAccounts};
