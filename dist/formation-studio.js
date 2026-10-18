'use strict';
// Private tactics sandbox. Discs and arrows are plans, never match inputs or official facts.
(function(){
 const home=document.getElementById('homeView');if(!home)return;
 const KEY='fuckball.private-formation-studio.v1',MAX=12,MAX_BYTES=64*1024;
 const NAMES=['RED 1','RED 2','RED 3','RED 4','BLUE 1','BLUE 2','BLUE 3','BLUE 4','BALL'];
 const START=[[180,500],[340,270],[480,610],[690,500],[820,500],[650,280],[520,760],[300,760],[500,500]];
 const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x;};
 const btn=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 const newid=()=>crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const cleanName=s=>typeof s==='string'&&s===s.trim()&&s.length>=1&&s.length<=45&&!/[\u0000-\u001f\u007f-\u009f]/.test(s);
 const checkedPoint=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isSafeInteger(v)&&v>=30&&v<=970);
 function verify(a){
  if(!a||a.version!==1||typeof a.id!=='string'||!/^[a-f0-9-]{16,50}$/i.test(a.id)||
   !cleanName(a.name)||!Array.isArray(a.spots)||a.spots.length!==9||
   !a.spots.every(checkedPoint)||!Array.isArray(a.arrows)||a.arrows.length>16||
   !Number.isSafeInteger(a.updatedAt)||a.updatedAt<1600000000000||a.updatedAt>Date.now()+86400000)
   throw Error('Invalid formation data.');
  const links=new Set();
  for(const link of a.arrows){
   if(!Array.isArray(link)||link.length!==2||link.some(i=>!Number.isInteger(i)||i<0||i>=8)||
    link[0]===link[1]||links.has(link.join(':')))throw Error('Invalid tactics arrow.');
   links.add(link.join(':'));
  }
  return {version:1,id:a.id,name:a.name,spots:a.spots.map(p=>p.slice()),
   arrows:a.arrows.map(p=>p.slice()),updatedAt:a.updatedAt};
 }
 function fresh(name){return {version:1,id:newid(),name,spots:START.map(p=>p.slice()),arrows:[],updatedAt:Date.now()};}
 let plans=[],active='',selected=0,mode='move',arrowFrom=-1,dragging=false,msg='';
 try{
  const stored=localStorage.getItem(KEY);
  if(stored&&stored.length>MAX_BYTES)throw Error();
  if(stored){
   const parsed=JSON.parse(stored),seen=new Set();
   if(!Array.isArray(parsed)||parsed.length>MAX)throw Error();
   plans=parsed.map(verify);
   for(const plan of plans){if(seen.has(plan.id))throw Error();seen.add(plan.id);}
  }
 }catch{msg='Saved tactical plans could not be verified. Restore a JSON backup if available.';}
 const commit=(items)=>{
  if(items.length>MAX)throw Error('Maximum 12 tactics plans on this device.');
  const value=JSON.stringify(items);
  if(value.length>MAX_BYTES)throw Error('Private tactics storage is full.');
  localStorage.setItem(KEY,value);plans=items;
 };
 const current=()=>plans.find(p=>p.id===active)||null;
 const panel=el('section',undefined,'formation-studio');
 panel.setAttribute('aria-label','Private football formation studio');
 const disclosure=el('details',undefined,'formation-disclosure');
 const summary=el('summary','⚽ FORMATION STUDIO · OPEN');
 const content=el('div',undefined,'formation-body');
 const intro=el('p','Sketch 4v4 shapes and passing runs on a private board. Plans never move players in a real room, alter the AI or claim an official match event.');
 const actionbar=el('div',undefined,'formation-toolbar');
 const planSelect=el('select');planSelect.setAttribute('aria-label','Private formation plan');
 const add=btn('＋ New plan',()=>{
  if(plans.length>=MAX)return info('Maximum 12 saved plans. Export one before deleting.');
  const title=window.prompt('Name the new plan (1–45 characters):','4v4 build-up');
  if(title===null)return;
  if(!cleanName(title.trim()))return info('Enter a plan name of 1–45 printable characters.');
  try{const plan=verify(fresh(title.trim()));commit([...plans,plan]);active=plan.id;mode='move';selected=0;msg='New formation created.';render();}
  catch(err){info(err.message||'Could not save new plan.');}
 });
 const duplicate=btn('Duplicate',()=>{
  const t=current();if(!t)return;
  if(plans.length>=MAX)return info('Maximum 12 plans.');
  const copy=verify({...t,id:newid(),name:(t.name.slice(0,39)+' copy'),updatedAt:Date.now()});
  try{commit([...plans,copy]);active=copy.id;msg='Private copy made.';render();}catch(err){info(err.message);}
 });
 const reset=btn('Reset discs',()=>{
  const t=current();if(!t||!window.confirm('Reset all disc positions in this plan? Arrows will be kept.'))return;
  change(t,{spots:START.map(p=>p.slice())},'Disc positions reset.');
 });
 const json=btn('↓ Save JSON',exportJSON);
 const png=btn('↓ Save PNG',exportPNG);
 const upload=el('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;
 const importBtn=btn('↑ Restore JSON',()=>upload.click());
 const remove=btn('Delete plan',()=>{
  const t=current();if(!t||!window.confirm('Delete private plan "'+t.name+'"? Save JSON first if needed.'))return;
  try{commit(plans.filter(p=>p.id!==t.id));active='';msg='Local plan deleted.';render();}catch(err){info(err.message);}
 });
 actionbar.append(planSelect,add,duplicate,reset,json,png,importBtn,remove,upload);
 const workspace=el('div',undefined,'formation-workspace');
 const canvas=el('canvas');canvas.width=960;canvas.height=540;
 canvas.setAttribute('aria-label','Tactical pitch; select discs with buttons or click/drag. Keyboard arrow keys move the selected disc.');
 canvas.tabIndex=0;
 const controls=el('div',undefined,'formation-controls');
 const heading=el('h3','POSITION TOOLS');
 const move=btn('Move discs',()=>{mode='move';arrowFrom=-1;render();});
 const link=btn('Draw passing arrow',()=>{mode='arrow';arrowFrom=-1;render();});
 const clear=btn('Clear arrows',()=>{
  const t=current();if(!t)return;
  change(t,{arrows:[]},'Passing arrows cleared.');
 });
 const chooser=el('div',undefined,'formation-disc-chooser');
 const readout=el('p',undefined,'formation-readout');
 const instructions=el('p','Select a disc, then drag it or use arrow keys (Shift for a larger step). In arrow mode, choose the first and second player. All information stays on this device.');
 controls.append(heading,move,link,clear,chooser,readout,instructions);
 workspace.append(canvas,controls);
 const status=el('p',undefined,'formation-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 content.append(intro,actionbar,workspace,status);disclosure.append(summary,content);panel.append(disclosure);
 const practice=home.querySelector('.practice-lab');
 const tournament=home.querySelector('.tournament-desk');
 if(tournament)tournament.insertAdjacentElement('afterend',panel);
 else if(practice)practice.insertAdjacentElement('beforebegin',panel);
 else(home.querySelector('.mode-cards')||home).insertAdjacentElement('afterend',panel);
 function info(text){msg=text;status.textContent=text;}
 function change(original,fields,message){
  try{
   const next=verify({...original,...fields,updatedAt:Math.max(Date.now(),original.updatedAt)});
   commit(plans.map(p=>p.id===original.id?next:p));
   msg=message;render();
  }catch(err){info(err.message||'Could not save your formation.');}
 }
 function pick(index){
  const t=current();if(!t)return;
  selected=index;
  if(mode==='arrow'){
   if(index>=8)return info('Arrows connect players, not the ball.');
   if(arrowFrom<0){arrowFrom=index;msg='Choose the second player for the passing arrow.';}
   else if(arrowFrom!==index){
    const key=arrowFrom+':'+index;
    const present=t.arrows.some(a=>a.join(':')===key);
    if(present)msg='That passing arrow already exists.';
    else if(t.arrows.length>=16)msg='A plan can hold at most 16 arrows.';
    else{change(t,{arrows:[...t.arrows,[arrowFrom,index]]},'Passing arrow added.');}
    arrowFrom=-1;
   }
   render();return;
  }
  msg=NAMES[index]+' selected. Drag or use keyboard arrows to move it.';render();
 }
 function render(){
  if(!current()&&plans.length)active=plans[0].id;
  const t=current();
  planSelect.replaceChildren(new Option('Choose a plan…',''));
  for(const p of plans)planSelect.add(new Option(p.name,p.id));
  planSelect.value=t?.id||'';
  for(const b of [duplicate,reset,json,png,remove,move,link,clear])b.disabled=!t;
  move.classList.toggle('active',mode==='move');
  link.classList.toggle('active',mode==='arrow');
  chooser.replaceChildren();
  for(let i=0;i<NAMES.length;i++){
   const b=btn(NAMES[i],()=>pick(i));
   b.className=(i===selected?'selected ':'')+(i<4?'red':i<8?'blue':'ball');
   b.disabled=!t;b.setAttribute('aria-pressed',i===selected?'true':'false');
   chooser.append(b);
  }
  if(t){
   const point=t.spots[selected];
   readout.textContent='Selected '+NAMES[selected]+' · X '+(point[0]/10).toFixed(1)+'% · Y '+(point[1]/10).toFixed(1)+'%. '+t.arrows.length+' passing arrows.';
  }else readout.textContent='Create a private tactics plan to begin.';
  status.textContent=msg||(t?'Private, saved locally · not connected to real games.':'Create a plan to draw your first 4v4 formation.');
  draw();
 }
 function rounded(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
 }
 function draw(){
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  ctx.fillStyle='#0e382f';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#0f4638';ctx.fillRect(25,25,w-50,h-50);
  ctx.fillStyle='#164f40';
  for(let i=0;i<10;i++)if(i%2===0)ctx.fillRect(25+i*91,25,91,h-50);
  ctx.strokeStyle='#c5e7da';ctx.lineWidth=2;
  ctx.strokeRect(25,25,w-50,h-50);
  ctx.beginPath();ctx.moveTo(w/2,25);ctx.lineTo(w/2,h-25);ctx.stroke();
  ctx.beginPath();ctx.arc(w/2,h/2,68,0,Math.PI*2);ctx.stroke();
  ctx.strokeRect(25,h/2-108,150,216);ctx.strokeRect(w-175,h/2-108,150,216);
  ctx.strokeRect(25,h/2-55,55,110);ctx.strokeRect(w-80,h/2-55,55,110);
  const t=current();if(!t)return;
  const xy=i=>[t.spots[i][0]*w/1000,t.spots[i][1]*h/1000];
  for(const [from,to]of t.arrows){
   const [x1,y1]=xy(from),[x2,y2]=xy(to),a=Math.atan2(y2-y1,x2-x1);
   ctx.lineWidth=4;ctx.strokeStyle='#ffe382';ctx.fillStyle='#ffe382';
   ctx.beginPath();ctx.moveTo(x1+Math.cos(a)*20,y1+Math.sin(a)*20);
   ctx.lineTo(x2-Math.cos(a)*25,y2-Math.sin(a)*25);ctx.stroke();
   ctx.beginPath();ctx.moveTo(x2-Math.cos(a)*23,y2-Math.sin(a)*23);
   ctx.lineTo(x2-Math.cos(a-.48)*38,y2-Math.sin(a-.48)*38);
   ctx.lineTo(x2-Math.cos(a+.48)*38,y2-Math.sin(a+.48)*38);ctx.closePath();ctx.fill();
  }
  t.spots.forEach((p,i)=>{
   const [x,y]=xy(i),isBall=i===8;
   ctx.beginPath();ctx.arc(x,y,isBall?16:22,0,Math.PI*2);
   ctx.fillStyle=isBall?'#f4f5eb':i<4?'#e85856':'#67a9ee';ctx.fill();
   ctx.lineWidth=i===selected?5:2;ctx.strokeStyle=i===selected?'#ffe78b':'#092b2c';ctx.stroke();
   ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=isBall?'#162f2f':'#fff';
   ctx.fillText(isBall?'⚽':String(i%4+1),x,y+1);
  });
  ctx.fillStyle='#d9eadb';ctx.font='12px system-ui';ctx.textAlign='left';
  ctx.fillText('TACTICAL PLAN · NOT GAMEPLAY',35,h-8);
 }
 const point=(event)=>{
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  return [
   Math.round((event.clientX-rect.left)*1000/rect.width),
   Math.round((event.clientY-rect.top)*1000/rect.height)
  ];
 };
 const clamp=v=>Math.max(30,Math.min(970,v));
 const near=([x,y],t)=>{
  let idx=-1,distance=65*65;
  t.spots.forEach(([px,py],i)=>{
   const dx=px-x,dy=py-y,v=dx*dx+dy*dy;
   if(v<distance){distance=v;idx=i;}
  });
  return idx;
 };
 function moveSelected(pt,end=false){
  const t=current();if(!t||mode!=='move')return;
  const p=[clamp(pt[0]),clamp(pt[1])];
  const spots=t.spots.map(x=>x.slice());spots[selected]=p;
  // Preview the live drag without writing storage on every pointer event.
  if(!end){const old=plans;plans=plans.map(x=>x.id===t.id?{...t,spots}:x);draw();plans=old;}
  else change(t,{spots},'Disc moved and saved locally.');
 }
 canvas.addEventListener('pointerdown',e=>{
  const t=current(),p=point(e);if(!t||!p)return;
  const index=near(p,t);if(index<0)return;
  pick(index);if(mode==='move'){dragging=true;canvas.setPointerCapture(e.pointerId);moveSelected(p,false);}
 });
 canvas.addEventListener('pointermove',e=>{if(dragging){const p=point(e);if(p)moveSelected(p,false);}});
 const stopDrag=e=>{
  if(!dragging)return;dragging=false;const p=point(e);
  if(p)moveSelected(p,true);
 };
 canvas.addEventListener('pointerup',stopDrag);
 canvas.addEventListener('pointercancel',()=>{dragging=false;draw();});
 canvas.addEventListener('keydown',event=>{
  const map={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(!map[event.key]||mode!=='move'||!current())return;
  event.preventDefault();
  const [dx,dy]=map[event.key],step=event.shiftKey?50:10;
  const t=current(),[x,y]=t.spots[selected];
  moveSelected([x+dx*step,y+dy*step],true);
 });
 planSelect.onchange=()=>{active=planSelect.value;selected=0;mode='move';arrowFrom=-1;msg='';render();};
 function fileDownload(name,text,type){
  const url=URL.createObjectURL(new Blob([text],{type})),a=el('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 const filename=t=>'fuckball-plan-'+t.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,35);
 function exportJSON(){
  const t=current();if(!t)return;
  fileDownload(filename(t)+'.json',JSON.stringify({...t,notice:'Private plan, not game state'},null,2),'application/json');
  info('Private tactics plan saved as JSON.');
 }
 function exportPNG(){
  const t=current();if(!t)return;
  canvas.toBlob(blob=>{
   if(!blob||blob.size>8*1024*1024)return info('Cannot export the local diagram.');
   const url=URL.createObjectURL(blob),a=el('a');
   a.href=url;a.download=filename(t)+'.png';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   info('Private formation diagram saved as PNG.');
  },'image/png');
 }
 upload.onchange=async()=>{
  const file=upload.files?.[0];upload.value='';
  if(!file)return;
  if(file.size===0||file.size>32*1024)return info('Restore requires a JSON file under 32 KiB.');
  if(plans.length>=MAX)return info('Maximum 12 plans. Export and delete one before restoring.');
  try{
   const parsed=verify(JSON.parse(await file.text()));
   if(!window.confirm('Restore "'+parsed.name+'" as a separate private plan?'))return;
   const copy=verify({...parsed,id:newid(),updatedAt:Date.now()});
   commit([...plans,copy]);active=copy.id;selected=0;mode='move';arrowFrom=-1;
   msg='Private tactics plan restored without overwriting existing plans.';render();
  }catch(error){info('Import refused: '+(error.message||'Invalid formation.'));}
 };
 window.addEventListener('storage',e=>{
  if(e.key!==KEY)return;
  try{
   const parsed=e.newValue?JSON.parse(e.newValue):[];
   if(!Array.isArray(parsed)||parsed.length>MAX)throw Error();
   plans=parsed.map(verify);msg='Tactics plans refreshed from another tab.';render();
  }catch{info('Plan data changed in another tab; reload to inspect it.');}
 });
 render();
})();