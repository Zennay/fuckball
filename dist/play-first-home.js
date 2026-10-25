'use strict';
// P0 play-first navigation: collapse secondary panels without deleting or
// duplicating their handlers. Human queues, room invites and live recovery
// remain visible and authoritative on the original game client.
(function(){
 const home=document.getElementById('homeView');
 const hub=home?.querySelector('.play-hub');
 if(!home||!hub)return;
 const key='fuckball.home.explore.v1';
 const create=(tag,cls,content)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(content!==undefined)el.textContent=content;
  return el;
 };
 const bar=create('section','fb-home-focus');
 bar.setAttribute('aria-label','Choose a game or explore more modes');
 const copy=create('div','fb-home-focus-copy');
 copy.append(create('strong','','PLAY FIRST. EXPLORE WHEN YOU WANT.'),
  create('p','','Quick Match and rooms are above. All practice, replay and competition tools stay available below.'));
 const buttons=create('div','fb-home-focus-actions');
 const toggle=create('button','fb-home-focus-toggle','Explore more modes');
 toggle.type='button';toggle.setAttribute('aria-expanded','false');
 const setup=create('button','fb-home-focus-setup','Connection setup');
 setup.type='button';
 buttons.append(toggle,setup);
 const nav=create('div','fb-home-focus-navigation');
 nav.hidden=true;
 const caption=create('label','','Jump to a mode or tool');
 const select=create('select','fb-home-focus-select');
 select.setAttribute('aria-label','Jump to an additional game feature');
 caption.append(select);
 const count=create('p','fb-home-focus-count');
 nav.append(caption,count);
 bar.append(copy,buttons,nav);
 hub.insertAdjacentElement('afterend',bar);
 const keep=new Set([
  'season-line','hero-grid','play-hub','fb-home-focus',
  'quick-queue-panel','queue-watch','room-browser','direct-invite-join',
  'room-invite-center','friend-party','native-lobby-ready',
  'first-play-card','home-bottom'
 ]);
 const optional=new Set();
 let expanded=false;
 try{expanded=localStorage.getItem(key)==='expanded';}catch{}
 function isEssential(el){
  return [...el.classList].some(cls=>keep.has(cls));
 }
 function featureTitle(el){
  const name=el.querySelector('h2,h3')?.textContent?.trim()||
   el.getAttribute('aria-label')||
   [...el.classList].find(x=>!x.startsWith('fb-'))||'More ways to play';
  return String(name).replace(/\s+/g,' ').trim().slice(0,76);
 }
 function sync(){
  let nextId=0;
  for(const el of home.children){
   if(el===bar||isEssential(el))continue;
   if(!optional.has(el)){
    optional.add(el);
    el.classList.add('fb-home-optional');
    if(!el.id){
     do{nextId++;}while(document.getElementById('fb-home-feature-'+nextId));
     el.id='fb-home-feature-'+nextId;
    }
   }
  }
  // Never override a native hidden attribute (offline/error/replay state).
  for(const el of optional)el.inert=!expanded;
  const focus=select.value;
  select.replaceChildren();
  const start=create('option','','Choose a feature…');start.value='';
  select.append(start);
  for(const el of optional){
   const option=create('option','',featureTitle(el));
   option.value=el.id;select.append(option);
  }
  if(focus&&[...optional].some(el=>el.id===focus))select.value=focus;
  const size=optional.size;
  count.textContent=size+' additional game and training sections available.'+
   ' The original game controls and saved progress are unchanged.';
  toggle.textContent=expanded?'Show only play options':'Explore all '+size+' features';
  toggle.setAttribute('aria-expanded',String(expanded));
  home.classList.toggle('fb-home-extras-open',expanded);
  nav.hidden=!expanded;
 }
 function change(open,store=true){
  if(expanded&&!open){
   const focused=document.activeElement;
   if(focused&&[...optional].some(el=>el.contains(focused)))toggle.focus();
  }
  expanded=open;
  sync();
  if(store)try{localStorage.setItem(key,expanded?'expanded':'focused');}catch{}
 }
 toggle.addEventListener('click',()=>change(!expanded));
 setup.addEventListener('click',()=>{
  change(true);
  const checklist=home.querySelector('.play-readiness');
  if(!checklist){count.textContent='Connection setup is not available on this device.';return;}
  checklist.scrollIntoView({behavior:'auto',block:'center'});
  const action=checklist.querySelector('button:not([disabled])');
  action?.focus?.({preventScroll:true});
 });
 select.addEventListener('change',()=>{
  const target=[...optional].find(el=>el.id===select.value);
  if(!target)return;
  target.scrollIntoView({behavior:'auto',block:'start'});
  const heading=target.querySelector('h2,h3');
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
 });
 // If the original Play Hub opens a deeper practice tool, reveal its
 // existing panel before its own click handler scrolls and focuses it.
 hub.addEventListener('click',event=>{
  const btn=event.target.closest?.('button');
  if(btn&&/Practice Lab/i.test(btn.textContent||''))change(true);
 },true);
 window.addEventListener('hashchange',()=>{
  const target=document.getElementById(location.hash.slice(1));
  if(target&&[...optional].some(el=>el===target||el.contains(target)))change(true);
 });
 const observer=new MutationObserver(()=>queueMicrotask(sync));
 observer.observe(home,{childList:true});
 sync();
 if(location.hash){
  const target=document.getElementById(location.hash.slice(1));
  if(target&&[...optional].some(el=>el===target||el.contains(target)))change(true,false);
 }
})();
