#!/usr/bin/env node
'use strict';
// Private *read-only* moderation inbox for the server operator. Never expose
// this file or its output through static hosting or public game endpoints.
const fs=require('node:fs'),path=require('node:path');
const dir=process.env.FUCKBALL_DATA_DIR||process.env.STATE_DIRECTORY||path.resolve(__dirname,'../data');
const file=path.join(dir,'player-reports.json'),MAX_BYTES=512*1024;
const args=process.argv.slice(2);
if(args.some(arg=>!['--json','--help'].includes(arg)&&!/^--last=\d{1,3}$/.test(arg)&&
 !/^--reason=(abusive-chat|griefing|suspected-cheating|other)$/.test(arg))){
 console.error('Usage: node scripts/report-inbox.cjs [--last=20] [--reason=abusive-chat|griefing|suspected-cheating|other] [--json]');
 process.exitCode=2;
}else if(args.includes('--help')){
 console.log('Reads server-local reports; does not delete, moderate or expose a public endpoint. Requires access to the configured server data directory.');
}else{
 const last=Number(args.find(s=>s.startsWith('--last='))?.slice(7)||20);
 const reason=args.find(s=>s.startsWith('--reason='))?.slice(9)||null;
 if(last<1||last>100){console.error('Choose --last=1 through --last=100.');process.exitCode=2;}
 else{
  let fd;
  try{
   const before=fs.lstatSync(file);
   if(!before.isFile()||before.size>MAX_BYTES)throw Error('Inbox is not a bounded regular file.');
   if(typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')
    throw Error('Required secure file flags unavailable.');
   fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   const opened=fs.fstatSync(fd);
   if(!opened.isFile()||opened.ino!==before.ino||opened.dev!==before.dev||
      opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)
    throw Error('Inbox changed while opening.');
   const raw=fs.readFileSync(fd),after=fs.fstatSync(fd);
   if(raw.length>MAX_BYTES||after.mtimeMs!==opened.mtimeMs||after.size!==opened.size)
    throw Error('Inbox changed while reading.');
   const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(data?.version!==1||!Array.isArray(data.items)||data.items.length>1200)
    throw Error('Unrecognized report format.');
   const cutoff=Date.now()-30*86400000;
   const items=data.items.filter(x=>x&&typeof x==='object'&&
    Number.isSafeInteger(x.at)&&x.at>=cutoff&&
    (!reason||x.reason===reason)).slice(-last).reverse();
   const printable=value=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/g,' ').slice(0,220);
   if(args.includes('--json')){
    console.log(JSON.stringify(items,null,2));
   }else{
    console.log('PRIVATE SERVER MODERATION INBOX — '+items.length+' recent reports (not a public feed)');
    for(const row of items){
     const when=new Date(row.at).toISOString();
     console.log(when+' | '+printable(row.reason)+' | '+printable(row.room));
     console.log('  From '+printable(row.from)+' → '+printable(row.to||'guest')+' ['+printable(row.nick)+']');
     if(row.note)console.log('  Note: '+printable(row.note));
     console.log('  Report '+printable(row.id));
    }
   }
  }catch(error){console.error('Could not safely read the private server inbox: '+String(error.message||error));process.exitCode=1;}
  finally{if(fd!==undefined)fs.closeSync(fd);}
 }
}
