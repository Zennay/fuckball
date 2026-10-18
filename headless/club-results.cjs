'use strict';
// Private, finite history of real completed server-authoritative Club-vs-Club
// casual 4v4 games. Club IDs are opaque, not a public club directory or ranking.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const CLUB=/^[0-9a-f]{16}$/,EVENT=/^[0-9a-f]{24}$/;
const MAX_RECORDS=1000,MAX_BYTES=384*1024;
function createClubResults(dir){
 const file=dir?path.join(dir,'club-results.json'):null;
 function validRecord(r){
  return r&&typeof r==='object'&&!Array.isArray(r)&&EVENT.test(r.id)&&
   CLUB.test(r.red)&&CLUB.test(r.blue)&&r.red!==r.blue&&
   [r.redGoals,r.blueGoals].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=999)&&
   Number.isSafeInteger(r.at)&&r.at>=0;
 }
 function load(){
  if(!file)return{version:1,matches:[]};
  let meta;
  try{meta=fs.lstatSync(file);}catch(e){
   if(e?.code==='ENOENT')return{version:1,matches:[]};
   throw Error('Club result storage unavailable.');
  }
  if(!meta.isFile()||meta.size>MAX_BYTES||
     typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')
   throw Error('Club result storage invalid.');
  let fd;
  try{
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   const opened=fs.fstatSync(fd);
   if(!opened.isFile()||meta.dev!==opened.dev||meta.ino!==opened.ino||
      meta.mtimeMs!==opened.mtimeMs||meta.size!==opened.size)
    throw Error('Club results replaced during load.');
   const raw=fs.readFileSync(fd),closed=fs.fstatSync(fd),fresh=fs.lstatSync(file);
   if(raw.length>MAX_BYTES||closed.size!==opened.size||
      closed.mtimeMs!==opened.mtimeMs||fresh.ino!==opened.ino||fresh.dev!==opened.dev||
      fresh.mtimeMs!==opened.mtimeMs)throw Error('Club results changed during load.');
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(!data||data.version!==1||!Array.isArray(data.matches)||
      data.matches.length>MAX_RECORDS||data.matches.some(r=>!validRecord(r))||
      new Set(data.matches.map(r=>r.id)).size!==data.matches.length)
    throw Error('Club results invalid.');
   return data;
  }catch{throw Error('Club results integrity invalid.');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 let data=load();
 function append({red,blue,redGoals,blueGoals,at=Date.now()}){
  const event={id:crypto.randomBytes(12).toString('hex'),red,blue,redGoals,blueGoals,at};
  if(!validRecord(event))throw Error('Invalid completed Club match.');
  if(!file)return false;
  const previous=data;
  const matches=[...data.matches,event].slice(-MAX_RECORDS);
  const next={version:1,matches};
  const payload=JSON.stringify(next);
  if(Buffer.byteLength(payload)>MAX_BYTES)throw Error('Club result storage full.');
  fs.mkdirSync(dir,{recursive:true});
  const temp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
  let fd;
  try{
   fd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,payload);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(temp,file);data=next;
   return true;
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(temp,{force:true});}catch{}
   data=previous;
   throw Error('Club results could not be saved.');
  }
 }
 function view(clubId){
  if(!CLUB.test(clubId||''))return{durable:!!file,record:null};
  const matches=data.matches.filter(m=>m.red===clubId||m.blue===clubId);
  let wins=0,draws=0,losses=0,scored=0,conceded=0;
  const history=matches.map(m=>{
   const home=m.red===clubId,goals=home?m.redGoals:m.blueGoals,
    against=home?m.blueGoals:m.redGoals;
   const outcome=goals>against?'W':goals<against?'L':'D';
   if(outcome==='W')wins++;else if(outcome==='L')losses++;else draws++;
   scored+=goals;conceded+=against;
   return{at:m.at,goals,against,outcome};
  }).slice(-30).reverse();
  return{durable:!!file,ranked:false,record:{
   matches:matches.length,wins,draws,losses,scored,conceded,
   recent:history
  }};
 }
 return{append,view};
}
module.exports={createClubResults};
