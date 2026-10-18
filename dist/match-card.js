'use strict';
// Share card renderer for authenticated native-server receipts. Nothing is uploaded.
// Deliberately excludes usernames, account IDs, room codes and match receipt IDs.
(function(){
 const W=1200,H=630;
 function create(item){
  if(!item||item.source!=='native-server'||item.ranked!==false||
    ![1,2].includes(item.team)||![0,1,2].includes(item.winner)||
    !['bot','1v1','2v2','3v3','4v4'].includes(item.mode)||
    !Number.isSafeInteger(item.red)||item.red<0||item.red>999||
    !Number.isSafeInteger(item.blue)||item.blue<0||item.blue>999||
    !Number.isSafeInteger(item.at)||item.at<=0)throw Error('Invalid server match receipt.');
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image rendering is unavailable.');
  const outcome=item.winner===0?'DRAW':item.winner===item.team?'WIN':'LOSS';
  const accent=outcome==='WIN'?'#c7f17f':outcome==='LOSS'?'#f1a0ab':'#bfd6df';
  const own=item.team===1?item.red:item.blue;
  const other=item.team===1?item.blue:item.red;
  const rectangle=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const label=(value,x,y,font,color,align='left')=>{
   ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);
  };
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0d222b');bg.addColorStop(1,'#24434b');
  rectangle(0,0,W,H,bg);rectangle(0,0,16,H,accent);
  ctx.globalAlpha=.09;
  for(let x=100;x<W;x+=84)rectangle(x,0,1,H,'#ffffff');
  for(let y=70;y<H;y+=84)rectangle(0,y,W,1,'#ffffff');
  ctx.globalAlpha=1;
  label('F U C K B A L L',82,92,'800 36px system-ui','#f3f6ed');
  label('NATIVE MATCH RESULT',82,139,'600 21px system-ui','#a9c8cc');
  rectangle(82,174,215,7,accent);
  label(outcome,80,331,'900 138px system-ui',accent);
  label(own+'  :  '+other,1120,347,'900 136px system-ui','#f5f8f2','right');
  label('YOUR SCORE',1120,393,'700 21px system-ui','#b4cbd1','right');
  const date=new Date(item.at);
  const dateLabel=Number.isFinite(date.getTime())?
   date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';
  label((item.mode==='bot'?'VS AI':item.mode.toUpperCase())+'  •  '+(item.team===1?'RED':'BLUE')+' SIDE',82,483,'700 30px system-ui','#e8f3eb');
  label(dateLabel,1120,483,'500 27px system-ui','#d5e1df','right');
  rectangle(82,528,1038,1,'#728e93');
  label('CASUAL  •  UNRANKED',82,574,'700 22px system-ui','#b4cbd1');
  label('Verified on the originating game server',1120,574,'500 21px system-ui','#b4cbd1','right');
  return canvas;
 }
 async function download(item){
  const canvas=create(item);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob||blob.type!=='image/png')throw Error('Could not create a PNG image.');
  const date=new Date(item.at).toISOString().slice(0,10);
  const fileName='fuckball-'+item.mode+'-'+date+'.png';
  if(typeof File==='function'&&typeof navigator.share==='function'&&
    typeof navigator.canShare==='function'){
   const file=new File([blob],fileName,{type:'image/png'});
   let supported=false;
   try{supported=navigator.canShare({files:[file]});}catch(_){}
   if(supported){
    try{await navigator.share({files:[file],title:'Fuckball casual match result'});return 'Shared score card.';}
    catch(error){if(error?.name==='AbortError')return 'Sharing cancelled.';}
   }
  }
  const url=URL.createObjectURL(blob);
  try{
   const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;
   document.body.append(anchor);anchor.click();anchor.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
  return 'PNG score card saved. No account information included.';
 }
 Object.defineProperty(window,'FuckballMatchCards',{value:Object.freeze({download}),configurable:false});
})();
