'use strict';
// Foreground-only, opt-in human queue watch. Server occupancy is not an ETA.
(function(){
 const home=document.getElementById('homeView');
 const anchor=document.querySelector('.quick-queue-availability-actions');
 if(!home||!anchor)return;
 const modes=['1v1','2v2','3v3','4v4'],panel=document.createElement('section');
 panel.className='human-queue-watch';panel.setAttribute('aria-label','Human queue watch');
 const heading=document.createElement('h3');heading.textContent='WATCH A HUMAN PLAYLIST';
 const explain=document.createElement('p');
 explain.textContent='Watch real people waiting in a format while this Play tab stays visible. Never automatically enters a queue or promises a match.';
 const controls=document.createElement('div');controls.className='human-queue-watch-controls';
 const modeLabel=document.createElement('label');modeLabel.textContent='Format';
 const mode=document.createElement('select');mode.setAttribute('aria-label','Playlist to watch');
 modes.forEach(value=>mode.add(new Option(value,value)));modeLabel.append(mode);
 const countLabel=document.createElement('label');countLabel.textContent='Notify in Play when at least';
 const count=document.createElement('select');count.setAttribute('aria-label','Number of waiting humans');
 countLabel.append(count);
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Start watching';
 controls.append(modeLabel,countLabel,toggle);
 const status=document.createElement('p');status.className='human-queue-watch-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const join=document.createElement('button');join.type='button';join.className='primary';join.hidden=true;
 const warning=document.createElement('small');
 warning.textContent='Only your selected website server. Counts are snapshots, not a ready check or ETA. You must personally sign in, join and confirm. Nothing is tracked while this tab is hidden.';
 panel.append(heading,explain,controls,status,join,warning);
 anchor.insertAdjacentElement('afterend',panel);
 let watching=false,last=null,lastObservedAt=0,eligible=false;
 function serverValid(){
  const address=document.getElementById('serverAddress')?.value?.trim();
  try{
   const url=new URL(address);
   return url.protocol===(location.protocol==='https:'?'wss:':'ws:')&&
    url.host===location.host&&url.pathname==='/ws'&&!url.username&&!url.password;
  }catch{return false;}
 }
 const foreground=()=>!document.hidden&&!home.hidden&&navigator.onLine!==false;
 function options(){
  const maximum=Number(mode.value[0])*2-1,selected=Number(count.value)||1;
  count.replaceChildren();
  for(let n=1;n<=maximum;n++)count.add(new Option(String(n),String(n)));
  count.value=String(Math.min(selected,maximum));
 }
 function render(){
  options();
  toggle.textContent=watching?'Stop watching':'Start watching';
  toggle.setAttribute('aria-pressed',String(watching));
  mode.disabled=count.disabled=watching;
  const fresh=last&&Date.now()-lastObservedAt<=25000;
  eligible=!!(watching&&foreground()&&serverValid()&&fresh&&
   last.mode===mode.value&&last.waiting>=Number(count.value));
  join.hidden=!eligible;join.textContent=eligible?'▶ Search '+mode.value+' with real humans':'';
  if(!watching)status.textContent='Not watching. Choose a threshold and start.';
  else if(!foreground())status.textContent='Paused: return to the visible Play tab for new human queue counts.';
  else if(!serverValid())status.textContent='Paused: selected game server is not this website’s server.';
  else if(!fresh||last.mode!==mode.value)status.textContent='Watching '+mode.value+' · awaiting a verified server snapshot.';
  else status.textContent='Watching '+mode.value+' · '+last.waiting+' humans waiting at '+
   new Date(lastObservedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})+
   '. '+(eligible?'Threshold reached! You can choose to start a human search.':
   'Waiting for '+count.value+' humans. No match is guaranteed.');
 }
 function clear(){last=null;lastObservedAt=0;render();}
 toggle.onclick=()=>{
  if(watching){watching=false;clear();return;}
  watching=true;clear();
  if(foreground()&&serverValid())anchor.querySelector('button')?.click();
 };
 mode.onchange=render;count.onchange=render;
 join.onclick=()=>{
  render();if(!eligible)return;
  const button=home.querySelector('.quick-queue-mode[data-playlist="'+mode.value+'"]');
  if(!button||button.disabled){status.textContent='Queue currently unavailable; use the original mode control.';return;}
  watching=false;clear();
  button.click(); // Original human-only matchmaking/auth/ready-check path.
 };
 window.addEventListener('fuckball:queue-availability',event=>{
  if(!watching||!foreground()||!serverValid())return;
  const snapshot=event.detail;
  if(!snapshot||snapshot.humanOnly!==true||snapshot.ranked!==false||
    snapshot.server!==location.host||!Number.isSafeInteger(snapshot.at)||
    Math.abs(Date.now()-snapshot.at)>5000)return;
  const row=snapshot.modes?.[mode.value];
  if(!row||row.needed!==Number(mode.value[0])*2||
    !Number.isSafeInteger(row.waiting)||row.waiting<0||row.waiting>128)return;
  last={mode:mode.value,waiting:row.waiting};lastObservedAt=snapshot.at;render();
 });
 window.addEventListener('fuckball:queue-unavailable',clear);
 document.addEventListener('visibilitychange',clear);
 window.addEventListener('offline',clear);
 document.getElementById('serverAddress')?.addEventListener('input',clear);
 options();render();
})();
