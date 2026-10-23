'use strict';
// Downloadable private PNG scorecard for an actually completed native local
// Sudden Death series. Canvas is device-only: no browser upload, server score,
// club identity, player name or ranked result.
(function(){
 function valid(r){
  if(!r||![3,5,7].includes(r.bestOf)||![60,90,120].includes(r.duration)||
   !Number.isSafeInteger(r.at)||r.at<=0||r.at>Date.now()+86400000||
   !Array.isArray(r.rounds)||r.rounds.length<1||r.rounds.length>r.bestOf||
   !Number.isSafeInteger(r.draws)||r.draws<0||r.draws>7)return false;
  const couch=r.opponent==='human',first=couch?'player1':'human',
   second=couch?'player2':'ai';
  if(!couch&&r.opponent!==undefined&&r.opponent!=='ai')return false;
  const a=couch?r.player1:r.human,b=couch?r.player2:r.ai;
  return Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a<=7&&b<=7&&
   a+b+r.draws===r.rounds.length&&
   r.rounds.every(x=>x&&[first,second,'draw'].includes(x.winner)&&
    Number.isSafeInteger(x.frames)&&x.frames>=0&&x.frames<=r.duration*60+120)&&
   a===r.rounds.filter(x=>x.winner===first).length&&
   b===r.rounds.filter(x=>x.winner===second).length&&
   r.draws===r.rounds.filter(x=>x.winner==='draw').length&&
   r.winner===(a>b?first:b>a?second:'draw')&&
   (r.rounds.length===r.bestOf||a>=Math.floor(r.bestOf/2)+1||
    b>=Math.floor(r.bestOf/2)+1);
 }
 async function download(record){
  if(!valid(record))throw Error('Only a completed private native series can be exported.');
  if(typeof document.createElement!=='function'||typeof URL.createObjectURL!=='function')
   throw Error('PNG export is not available in this browser.');
  const couch=record.opponent==='human',first=couch?'player1':'human',
   second=couch?'player2':'ai',a=couch?record.player1:record.human,
   b=couch?record.player2:record.ai;
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
  const ctx=canvas.getContext('2d');if(!ctx||typeof canvas.toBlob!=='function')
   throw Error('Canvas PNG export is unavailable.');
  const c=ctx;
  c.fillStyle='#0f292c';c.fillRect(0,0,1200,675);
  c.fillStyle='#d7f1a6';c.fillRect(0,0,1200,12);
  c.fillStyle='#e6f4e2';c.font='800 46px system-ui,sans-serif';
  c.fillText('FUCKBALL / SUDDEN DEATH',66,100);
  c.fillStyle='#b7d8ca';c.font='600 21px system-ui,sans-serif';
  c.fillText(couch?'PRIVATE TWO-PLAYER FOOTBALL · NOT RANKED':
   'PRIVATE LOCAL AI PRACTICE · NOT RANKED',68,140);
  c.fillStyle='#2e514a';c.fillRect(66,180,1068,205);
  c.fillStyle='#eff9e7';c.font='900 28px system-ui,sans-serif';
  c.fillText(couch?'PLAYER 1':'YOU',110,230);
  c.fillText(couch?'PLAYER 2':'NATIVE AI',862,230);
  c.font='900 132px system-ui,sans-serif';
  c.fillText(String(a),115,360);
  c.fillText(String(b),884,360);
  c.font='800 44px system-ui,sans-serif';c.fillStyle='#cfebbd';
  c.fillText('–',577,335);
  const label=record.winner===first?(couch?'PLAYER 1 WINS':'SERIES WON'):
   record.winner===second?(couch?'PLAYER 2 WINS':'LOCAL AI WON'):'SERIES DRAW';
  c.font='800 30px system-ui,sans-serif';
  c.fillText(label,395,433);
  c.fillStyle='#b9d5c5';c.font='650 21px system-ui,sans-serif';
  c.fillText('Best of '+record.bestOf+' · '+record.duration+'s active clock · '+
   record.draws+' drawn round'+(record.draws===1?'':'s'),69,474);
  const rounds=record.rounds.slice(0,7);
  for(let i=0;i<rounds.length;i++){
   const x=68+i*153;
   c.fillStyle=rounds[i].winner===first?'#406c58':
    rounds[i].winner===second?'#733e42':'#516569';
   c.fillRect(x,506,141,78);
   c.fillStyle='#f2f8ed';c.font='700 17px system-ui,sans-serif';
   c.fillText('ROUND '+(i+1),x+10,532);
   const outcome=rounds[i].winner===first?(couch?'P1 GOAL':'YOUR GOAL'):
    rounds[i].winner===second?(couch?'P2 GOAL':'AI GOAL'):'DRAW';
   c.font='700 16px system-ui,sans-serif';c.fillText(outcome,x+10,561);
  }
  c.fillStyle='#c2d8d0';c.font='500 17px system-ui,sans-serif';
  const at=new Date(record.at).toLocaleDateString();
  c.fillText(at+' · Saved only on your device · No server verification',68,633);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob||!blob.size)throw Error('Could not encode local PNG.');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  try{
   link.href=url;link.download='fuckball-native-sudden-death-'+
    new Date(record.at).toISOString().slice(0,10)+'.png';
   document.body.append(link);link.click();
  }finally{
   link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
 }
 window.SuddenDeathCard=Object.freeze({download});
})();
