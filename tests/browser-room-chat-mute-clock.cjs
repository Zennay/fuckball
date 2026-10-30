'use strict';
// Genuine native room, independent host/guest sockets; synthetic clock offsets only.
const assert=require('node:assert/strict'),{chromium}=require('playwright'),{createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let n=0;n<150;n++){if(await fn())return;await sleep(70);}throw Error('Timeout: '+label)}
(async()=>{const app=createServer({peerHosting:false,dataDir:null}),{port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{const errors=[],page=async()=>{const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));return p;};
 const A=await page(),B=await page(),base='http://127.0.0.1:'+port+'/';
 await A.goto(base);await A.evaluate(()=>connectServer(true));
 await until(()=>A.evaluate(()=>!!serverLink?.room),'host admitted');
 const code=await A.evaluate(()=>serverLink.room);
 await B.goto(base+'?room='+code);await B.click('#joinGuest');
 await until(()=>B.evaluate(()=>!!serverLink?.room),'guest admitted');
 const guestId=await B.evaluate(()=>networkPlayerId);
 assert(Number.isSafeInteger(guestId)&&guestId>0);
 await until(()=>B.evaluate(()=>!!serverLink?.roomServerClock),'server clock received');
 await A.evaluate(id=>serverLink.send({type:'roomAdmin',action:'muteChat',id}),guestId);
 await until(()=>B.evaluate(()=>!!serverLink?.chatMutedUntil),'guest mute receipt');
 await until(()=>A.evaluate(id=>serverLink.roomControl?.chatMutes?.some(m=>m[0]===id),guestId),'host list receipt');
 const clockCheck=await B.evaluate(()=>{
  window.__originalWall=Date.now;
  const expiry=serverLink.chatMutedUntil;
  return [-360000,360000].map(skew=>{
   Date.now=()=>__originalWall()+skew;
   const serverTime=FuckballRoomServerTime.now(serverLink);
   const e=new Event('submit',{bubbles:true,cancelable:true});
   document.getElementById('chatInput').value='synthetic mute acceptance check';
   document.getElementById('chatForm').dispatchEvent(e);
   return{skew,serverTime,expiry,blocked:e.defaultPrevented};
  });
 });
 for(const item of clockCheck){assert(item.expiry>item.serverTime,'real 10-minute server mute stays active');assert(item.blocked,'visible native chat submission blocked on skew '+item.skew);}
 await A.evaluate(id=>serverLink.send({type:'roomAdmin',action:'unmuteChat',id}),guestId);
 await until(()=>B.evaluate(()=>serverLink.chatMutedUntil===null&&serverLink.roomControl?.chatMuteUntil===null),'server unmutes guest');
 await B.evaluate(()=>{Date.now=window.__originalWall;document.getElementById('chatInput').value='';});
 assert.deepEqual(errors,[],'no script errors in real browser');
 console.log('PASS 2 native Chromium humans: host 10m mute, guest +/-6m clock cannot submit, server unmute receipt restores chat');
 await B.close();await A.close();
 }finally{await browser.close();await app.close()}
})().catch(e=>{console.error(e);process.exit(1)});
