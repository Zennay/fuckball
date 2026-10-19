'use strict';
// Host-owned Custom Room access key controls. A key is NEVER read back from
// the server, written to storage, included in links, or exported.
(function(){
 const menu=document.getElementById('menuMatchPane');
 if(!menu)return;
 const panel=document.createElement('section');panel.className='room-access-key';
 panel.hidden=true;panel.setAttribute('aria-label','Private Custom Room access key');
 const title=document.createElement('h3');title.textContent='🔐 PRIVATE ROOM ACCESS';
 const description=document.createElement('p');
 description.textContent='Protect future joins with a separate access phrase. Send the room link and phrase separately. Connected players and valid reconnect tickets keep their access. Removing a key reopens joins under the other room controls.';
 const summary=document.createElement('p');summary.className='room-access-key-summary';
 summary.setAttribute('role','status');
 const fields=document.createElement('div');fields.className='room-access-key-fields';
 const label=document.createElement('label');label.textContent='New room access key';
 const key=document.createElement('input');key.type='password';key.minLength=10;key.maxLength=64;
 key.autocomplete='off';key.placeholder='10–64 printable characters';
 key.setAttribute('aria-label','New private room access key');label.append(key);
 const confirmLabel=document.createElement('label');confirmLabel.textContent='Confirm new access key';
 const confirm=document.createElement('input');confirm.type='password';confirm.minLength=10;confirm.maxLength=64;
 confirm.autocomplete='off';confirm.setAttribute('aria-label','Confirm private room access key');
 confirmLabel.append(confirm);
 const buttons=document.createElement('div');buttons.className='room-access-key-actions';
 const save=document.createElement('button');save.type='button';save.className='primary';
 save.textContent='Set private key';
 const remove=document.createElement('button');remove.type='button';remove.textContent='Remove key';
 buttons.append(save,remove);
 const notice=document.createElement('p');notice.className='room-access-key-notice';
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 fields.append(label,confirmLabel,buttons,notice);
 panel.append(title,description,summary,fields);menu.append(panel);
 let roomId=null,lastProtected=null,lastRevision=null;
 function current(){return typeof serverLink!=='undefined'?serverLink:null;}
 function secure(link){
  try{const url=new URL(link.ws.url);
   return url.protocol==='wss:'||url.protocol==='ws:'&&
    ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  }catch{return false;}
 }
 function render(){
  const link=current();
  if(link?.room!==roomId){
   roomId=link?.room||null;lastProtected=null;lastRevision=null;key.value='';confirm.value='';notice.textContent='';
  }
  const owner=!!link?.room&&!link.quickMatchMode&&link.isOwner===true;
  const supported=link?.roomControl?.accessKeySupported===true;
  panel.hidden=!owner||!supported;
  if(panel.hidden)return;
  const protectedNow=link.roomControl?.accessKeyRequired===true;
  summary.textContent=protectedNow?'🔒 Private key required for new joins · hidden from guests.':
   '🔓 No private key · current room admission rules still apply.';
  const revision=Number.isSafeInteger(link.roomControl?.accessKeyRevision)?
   link.roomControl.accessKeyRevision:0;
  if(lastRevision!==null&&lastRevision!==revision)
   notice.textContent=protectedNow?'Room server confirmed the private key was set or replaced.':
    'Room server confirmed that the private key was removed.';
  else if(lastProtected!==null&&lastProtected!==protectedNow)
   notice.textContent=protectedNow?'Room server confirmed the key.':'Room server removed the key.';
  lastRevision=revision;lastProtected=protectedNow;
  save.textContent=protectedNow?'Replace room access key':'Enable private key';
  remove.disabled=!protectedNow;
  const safe=secure(link);
  save.disabled=!safe;remove.disabled=!safe||!protectedNow;
  if(!safe)notice.textContent='A WSS / HTTPS connection is required to manage room secrets.';
 }
 function send(action,accessKey){
  const link=current();
  if(!link?.room||!link.isOwner||!link.roomControl?.accessKeySupported||
     !secure(link))return false;
  link.send({type:'roomAdmin',action,...(accessKey?{accessKey}:{})});
  return true;
 }
 save.onclick=()=>{
  const value=key.value,second=confirm.value;
  if(value!==second){notice.textContent='Both copies of the new key must match.';return;}
  if(value.length<10||value.length>64||value!==value.trim()||
     !/^[\x20-\x7e]+$/.test(value)){
   notice.textContent='Use 10–64 printable characters without leading or trailing spaces.';return;
  }
  if(!send('setAccessKey',value)){notice.textContent='Room server or secure connection unavailable.';return;}
  key.value='';confirm.value='';
  notice.textContent='Submitted to server. Awaiting the updated room lock status.';
 };
 remove.onclick=()=>{
  if(!current()?.roomControl?.accessKeyRequired)return;
  if(!window.confirm('Remove this private room key? New people with the room link may then join under other room settings.'))return;
  if(!send('clearAccessKey')){notice.textContent='Room server unavailable.';return;}
  key.value='';confirm.value='';notice.textContent='Removing key on room server…';
 };
 window.renderRoomAccessKey=render;
 render();
})();
