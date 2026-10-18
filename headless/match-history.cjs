'use strict';
// Bounded, server-authoritative match receipts for signed-in players.
// Not ranked results: a peer-hosted (browser-authoritative) round is not admitted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Career=require('./player-career.cjs');
const MAX_ITEMS=4000,MAX_BYTES=2*1024*1024;
const USER=/^[a-z0-9_-]{3,20}$/,ROOM=/^[A-HJ-NP-Z2-9]{8}$/,ID=/^[0-9a-f]{24}$/;
function valid(x){
 return x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  typeof x.user==='string'&&USER.test(x.user)&&typeof x.id==='string'&&ID.test(x.id)&&
  typeof x.room==='string'&&ROOM.test(x.room)&&
  Number.isSafeInteger(x.round)&&x.round>0&&
  Number.isSafeInteger(x.at)&&x.at>0&&
  Number.isSafeInteger(x.red)&&x.red>=0&&x.red<=999&&
  Number.isSafeInteger(x.blue)&&x.blue>=0&&x.blue<=999&&
  [0,1,2].includes(x.winner)&&[1,2].includes(x.team)&&
  Number.isSafeInteger(x.playedFrames)&&x.playedFrames>0&&
  typeof x.mode==='string'&&['bot','2v2','4v4'].includes(x.mode);
}
function sameFile(a,b){
 return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&
        a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
}
function createMatchHistory(dir){
 if(typeof dir!=='string'||!dir.trim())throw Error('Match history requires a server data directory.');
 const file=path.join(dir,'match-history.json');
 let items=[],profiles=Object.create(null);
 let meta;
 try{meta=fs.lstatSync(file);}catch(e){if(e?.code!=='ENOENT')throw Error('Match history unavailable.');}
 if(meta){
  if(!meta.isFile()||meta.size>MAX_BYTES||
     typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')
   throw Error('Match history integrity invalid.');
  let fd;
  try{
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NONBLOCK|fs.constants.O_NOFOLLOW);
   const opened=fs.fstatSync(fd);
   if(!opened.isFile()||!sameFile(meta,opened))throw Error('History file changed.');
   const raw=fs.readFileSync(fd);
   const after=fs.lstatSync(file),end=fs.fstatSync(fd);
   if(raw.length>MAX_BYTES||!after.isFile()||!sameFile(opened,after)||!sameFile(opened,end))
    throw Error('History file changed.');
   const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(![1,2].includes(decoded?.version)||!Array.isArray(decoded.items)||decoded.items.length>MAX_ITEMS||
      !decoded.items.every(valid)||new Set(decoded.items.map(x=>x.id)).size!==decoded.items.length)
    throw Error('Invalid match receipts.');
   items=decoded.items;
   // v1 is migrated in memory and committed atomically on the next receipt or erasure.
   profiles=decoded.version===1?Career.apply(Object.create(null),items):Career.cloneProfiles(decoded.profiles);
  }catch{throw Error('Match history integrity invalid.');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 function write(next,nextProfiles){
  const payload=JSON.stringify({version:2,items:next,profiles:nextProfiles});
  if(Buffer.byteLength(payload)>MAX_BYTES)throw Error('Match history full.');
  fs.mkdirSync(dir,{recursive:true});
  const tmp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  let fd;
  try{
   fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,payload);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(tmp,file);
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(tmp,{force:true});}catch{}
   throw Error('Could not persist match receipt.');
  }
 }
 return{
  append(records){
   if(!Array.isArray(records)||records.length>32||records.some(x=>!valid(x)))throw Error('Invalid match receipt.');
   if(!records.length)return 0;
   const dedupe=new Set(items.map(x=>x.id));
   const additions=records.filter(x=>{if(dedupe.has(x.id))return false;dedupe.add(x.id);return true;});
   if(!additions.length)return 0;
   // Aggregate before receipt trimming so career totals outlive the last 4,000 receipts.
   // Persist both snapshots together; never acknowledge a match whose statistics could not be saved.
   const nextProfiles=Career.apply(profiles,additions);
   const next=items.concat(additions).slice(-MAX_ITEMS);
   while(next.length&&Buffer.byteLength(JSON.stringify({version:2,items:next,profiles:nextProfiles}))>MAX_BYTES)next.shift();
   if(Buffer.byteLength(JSON.stringify({version:2,items:next,profiles:nextProfiles}))>MAX_BYTES)
    throw Error('Match history and career statistics storage full.');
   write(next,nextProfiles);items=next;profiles=nextProfiles;return additions.length;
  },
  list(username){
   if(typeof username!=='string'||!USER.test(username.toLowerCase()))return [];
   const user=username.toLowerCase();
   return items.filter(x=>x.user===user).slice(-50).reverse().map(({user,...rest})=>({...rest,source:'native-server',ranked:false}));
  },
  stats(username){return Career.forUser(profiles,username);},
  erase(username){
   if(typeof username!=='string'||!USER.test(username.toLowerCase()))throw Error('Invalid account.');
   const user=username.toLowerCase(),next=items.filter(x=>x.user!==user);
   const removed=items.length-next.length;
   if(removed||Object.hasOwn(profiles,user)){
    const nextProfiles=Career.cloneProfiles(profiles);
    delete nextProfiles[user];
    write(next,nextProfiles);items=next;profiles=nextProfiles;
   }
   return removed;
  }
 };
}
module.exports={createMatchHistory};
