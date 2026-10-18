'use strict';
// Server-only moderated inbox: no public report feed or automatic punishments.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const NAME=/^[a-z0-9_-]{3,20}$/,ROOM=/^[A-HJ-NP-Z2-9]{8}$/;
const REASONS=new Set(['abusive-chat','griefing','suspected-cheating','other']);
const BAD=/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/;
const MAX_BYTES=512*1024,MAX_REPORTS=1200,TTL=30*86400000;
function createPlayerReports(dir){
 const file=dir?path.join(dir,'player-reports.json'):null;
 function valid(r){
  return r&&typeof r==='object'&&!Array.isArray(r)&&
   /^[0-9a-f]{24}$/.test(r.id)&&ROOM.test(r.room)&&
   NAME.test(r.from)&&Number.isSafeInteger(r.at)&&r.at>=0&&
   (r.to===null||NAME.test(r.to))&&typeof r.nick==='string'&&
   r.nick.length<=25&&!BAD.test(r.nick)&&REASONS.has(r.reason)&&
   typeof r.note==='string'&&r.note.length<=200&&!BAD.test(r.note);
 }
 function load(){
  if(!file)return{version:1,items:[]};
  let meta;try{meta=fs.lstatSync(file);}catch(e){
   if(e?.code==='ENOENT')return{version:1,items:[]};
   throw Error('Report inbox unavailable.');
  }
  if(!meta.isFile()||meta.size>MAX_BYTES||
     typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')
   throw Error('Report inbox unavailable.');
  let fd;
  try{
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   const stat=fs.fstatSync(fd);if(stat.ino!==meta.ino||stat.dev!==meta.dev||
      stat.size!==meta.size||stat.mtimeMs!==meta.mtimeMs)throw Error('Report inbox changed.');
   const raw=fs.readFileSync(fd),after=fs.lstatSync(file);
   if(raw.length>MAX_BYTES||after.ino!==stat.ino||after.dev!==stat.dev||
      after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw Error('Report inbox changed.');
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(!data||data.version!==1||!Array.isArray(data.items)||
      data.items.length>MAX_REPORTS||data.items.some(r=>!valid(r)))
    throw Error('Report inbox malformed.');
   return data;
  }catch{throw Error('Report inbox integrity invalid.');}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
 let data=load();const rates=new Map();
 function submit({room,from,to=null,nick,reason,note='' }){
  const now=Date.now(),normalized=String(note).trim();
  const row={id:crypto.randomBytes(12).toString('hex'),room,from,to,nick,reason,
   note:normalized,at:now};
  if(!valid(row))throw Error('Choose a player and reason; message must be 200 printable characters or less.');
  if(!file)throw Error('Player reports require server storage.');
  const history=(rates.get(from)||[]).filter(t=>now-t<600000);
  if(history.length>=5)throw Error('Report limit reached. Try again later.');
  if(rates.size>2048)for(const [name,times]of rates)
   if(times.every(t=>now-t>=600000))rates.delete(name);
  const recent=data.items.filter(r=>r.at>now-5*60000);
  if(recent.some(r=>r.room===room&&r.from===from&&r.to===to&&r.nick===nick))
   throw Error('You already reported this player recently.');
  const next={version:1,items:[...data.items.filter(r=>r.at>now-TTL),row].slice(-MAX_REPORTS)};
  const payload=JSON.stringify(next);
  if(Buffer.byteLength(payload)>MAX_BYTES)throw Error('Report inbox has reached capacity.');
  fs.mkdirSync(dir,{recursive:true});
  const tmp=file+'.'+crypto.randomBytes(10).toString('hex')+'.tmp';
  let fd;
  try{
   fd=fs.openSync(tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL,0o600);
   fs.writeFileSync(fd,payload);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
   fs.renameSync(tmp,file);data=next;history.push(now);rates.set(from,history);
  }catch{
   if(fd!==undefined)try{fs.closeSync(fd);}catch{}
   try{fs.rmSync(tmp,{force:true});}catch{}
   throw Error('Report could not be saved on this server.');
  }
  return true;
 }
 return{submit};
}
module.exports={createPlayerReports};
