'use strict';
// Private, per-account room configuration vault on this one native server.
// No session tokens, replay data, match outcomes or player identities exposed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const NAME=/^[a-z0-9_-]{3,20}$/,ID=/^[0-9a-f]{16}$/;
const MODES=new Set(['bot','2v2','4v4']),LIMIT=8,MAX_MAP=65536;
const MAX_FILE=600000;
function createPresetLocker(root){
 if(!root)throw Error('Private preset storage requires a data directory.');
 const folder=path.join(root,'room-preset-lockers');
 const fileFor=user=>{
  const normalized=String(user||'').toLowerCase();
  if(!NAME.test(normalized))throw Error('Invalid account.');
  return path.join(folder,crypto.createHash('sha256').update(normalized).digest('hex')+'.json');
 };
 function directory(create=false){
  if(create)fs.mkdirSync(folder,{recursive:true,mode:0o700});
  let stat;
  try{stat=fs.lstatSync(folder);}catch(e){
   if(e?.code==='ENOENT'&&!create)return false;
   throw Error('Room preset locker storage unavailable.');
  }
  if(!stat.isDirectory()||stat.isSymbolicLink())
   throw Error('Room preset locker storage unavailable.');
  return true;
 }
 const clean=items=>{
  if(!Array.isArray(items)||items.length>LIMIT)throw Error('Choose up to eight room presets.');
  const names=new Set(),ids=new Set();
  return items.map(value=>{
   if(!value||typeof value!=='object'||Array.isArray(value)||
      typeof value.id!=='string'||!ID.test(value.id)||
      typeof value.name!=='string'||!value.name.trim()||value.name.length>36||
      /[\u0000-\u001f\u007f-\u009f]/.test(value.name)||
      !MODES.has(value.mode)||
      !Number.isSafeInteger(value.scoreLimit)||value.scoreLimit<0||value.scoreLimit>99||
      !Number.isSafeInteger(value.timeLimit)||value.timeLimit<0||value.timeLimit>99||
      typeof value.stadium!=='string'||value.stadium.length<1||
      Buffer.byteLength(value.stadium,'utf8')>MAX_MAP)
    throw Error('One or more room presets are invalid.');
   const name=value.name.trim().replace(/\s+/g,' ');
   let stadium;
   try{stadium=JSON.parse(value.stadium);}catch{
    throw Error('Preset stadium is not valid stadium JSON.');
   }
   if(!stadium||typeof stadium!=='object'||Array.isArray(stadium))
    throw Error('Preset stadium is not an object.');
   const key=name.toLowerCase();
   if(names.has(key)||ids.has(value.id))
    throw Error('Each preset must have a unique name and ID.');
   names.add(key);ids.add(value.id);
   return{id:value.id,name,mode:value.mode,scoreLimit:value.scoreLimit,
    timeLimit:value.timeLimit,stadium:value.stadium};
  });
 };
 function get(user){
  const file=fileFor(user);
  if(!directory())return[];
  let before;
  try{before=fs.lstatSync(file);}catch(e){
   if(e?.code==='ENOENT')return[];
   throw Error('Account preset locker unavailable.');
  }
  if(!before.isFile()||before.size>MAX_FILE||
     typeof fs.constants.O_NOFOLLOW!=='number'||
     typeof fs.constants.O_NONBLOCK!=='number')
   throw Error('Account preset locker unavailable.');
  let fd;
  try{
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   const stat=fs.fstatSync(fd);
   if(!stat.isFile()||stat.ino!==before.ino||stat.dev!==before.dev||
      stat.size!==before.size||stat.mtimeMs!==before.mtimeMs)
    throw Error('Locker changed during read.');
   const raw=fs.readFileSync(fd);
   const after=fs.fstatSync(fd),name=fs.lstatSync(file);
   if(raw.length>MAX_FILE||after.ino!==stat.ino||after.size!==stat.size||
      after.mtimeMs!==stat.mtimeMs||name.ino!==stat.ino||
      name.dev!==stat.dev||name.size!==stat.size||name.mtimeMs!==stat.mtimeMs)
    throw Error('Locker changed during read.');
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(data?.version!==1)throw Error('Invalid locker schema.');
   return clean(data.presets);
  }catch{throw Error('Account preset locker could not be read safely.');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 function replace(user,presets){
  const file=fileFor(user),items=clean(presets);
  const raw=JSON.stringify({version:1,presets:items});
  if(Buffer.byteLength(raw,'utf8')>MAX_FILE)throw Error('Preset locker storage limit exceeded.');
  directory(true);
  const tmp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
  let fd;
  try{
   fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,raw);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(tmp,file);
   return items.length;
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(tmp,{force:true});}catch{}
   throw Error('Account presets could not be saved.');
  }
 }
 return{get,replace};
}
module.exports={createPresetLocker};
