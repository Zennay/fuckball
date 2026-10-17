'use strict';
// Minimal player accounts: a username reserves your nickname across rooms.
// Passwords are scrypt-hashed with a per-user salt; sessions are random
// tokens of which only a SHA-256 hash is stored. Data is one JSON file,
// written atomically. No e-mail, no recovery: this is a nickname lock.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const NAME=/^[A-Za-z0-9_-]{3,20}$/,TOKEN_DAYS=90;
function createAccounts(dir){
 const file=dir?path.join(dir,'accounts.json'):null;let data={users:{},sessions:{}};
 // Only ENOENT means a true first run. A damaged or unreadable existing
 // account file must never be mistaken for an empty registry: the next
 // registration would otherwise overwrite it and destroy nickname ownership.
 if(file){
  let raw;
  try{raw=fs.readFileSync(file,'utf8');}
  catch(e){
   if(e.code!=='ENOENT')throw Error('Account state unavailable; refusing to start.');
  }
  if(raw!==undefined){
   let loaded;
   try{loaded=JSON.parse(raw);}
   catch{throw Error('Account state invalid; refusing to start.');}
   const record=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
   if(!record(loaded)||!record(loaded.users)||!record(loaded.sessions))
    throw Error('Account state invalid; refusing to start.');
   data=loaded;
  }
 }
 let dirty=false;
 function save(){if(!file){return;}dirty=false;try{fs.mkdirSync(dir,{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.renameSync(tmp,file);}catch(e){console.error('accounts: save failed',e.message);}}
 const key=name=>String(name).toLowerCase(),sha=t=>crypto.createHash('sha256').update(t).digest('hex');
 function hash(password,salt){return crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1}).toString('hex');}
 function issue(username){const token=crypto.randomBytes(32).toString('hex');data.sessions[sha(token)]={u:key(username),exp:Date.now()+TOKEN_DAYS*864e5};save();return token;}
 function validate(username,password){if(typeof username!=='string'||!NAME.test(username))throw Error('Username: 3-20 letters, digits, _ or -.');if(typeof password!=='string'||password.length<6||password.length>100)throw Error('Password: at least 6 characters.');}
 return{
  register(username,password){validate(username,password);if(data.users[key(username)])throw Error('That username is taken.');const salt=crypto.randomBytes(16).toString('hex');data.users[key(username)]={name:username,salt,hash:hash(password,salt),created:Date.now()};return{username,token:issue(username)};},
  login(username,password){validate(username,password);const u=data.users[key(username)];const ok=u&&crypto.timingSafeEqual(Buffer.from(hash(password,u.salt),'hex'),Buffer.from(u.hash,'hex'));if(!ok)throw Error('Wrong username or password.');return{username:u.name,token:issue(u.name)};},
  user(token){if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))return null;const s=data.sessions[sha(token)];if(!s)return null;if(s.exp<Date.now()){delete data.sessions[sha(token)];dirty=true;return null;}return data.users[s.u]?.name||null;},
  logout(token){if(typeof token==='string'&&data.sessions[sha(token)]){delete data.sessions[sha(token)];save();}},
  reserved(name){return !!data.users[key(String(name).trim())];},
  flush(){if(dirty)save();}
 };
}
module.exports={createAccounts};
