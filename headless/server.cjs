#!/usr/bin/env node
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{HBInit}=require('./runtime.cjs'),{WebSocketServer}=require('./websocket.cjs'),{createQuickMatch,SIZES}=require('./quick-match.cjs'),{createAccounts}=require('./accounts.cjs'),{createMatchHistory}=require('./match-history.cjs'),{createSocial}=require('./social.cjs'),{createClubs}=require('./clubs.cjs'),{createClubResults}=require('./club-results.cjs'),{createPlayerReports}=require('./player-reports.cjs'),{createPresetLocker}=require('./room-preset-locker.cjs'),{createParties}=require('./parties.cjs'),AI=require('../dist/ai/policy.js'),Netcode=require('../dist/netcode.js');
// Netcode v3 (frame-stamped inputs + input buffer, docs/netcode-plan.md). FUCKBALL_NETCODE=classic turns it off.
const NETCODE_V3=(process.env.FUCKBALL_NETCODE||'v3')!=='classic';
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_RECONNECT_MS=30000;
function createServer(options={}){
 const v3Enabled=options.netcode?options.netcode!=='classic':NETCODE_V3;
 const reconnectMs=Math.max(5000,Math.min(120000,Number(options.reconnectWindowMs)||DEFAULT_RECONNECT_MS));
 let shuttingDown=false;
 const root=path.resolve(__dirname,'../dist'),bff=fs.readFileSync(path.join(root,'stadiums/bff-big-v4.hbs'),'utf8'),rooms=new Map(),clients=new Set();
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.hbs':'application/json','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
 const dataDir=options.dataDir!==undefined?options.dataDir:process.env.FUCKBALL_DATA_DIR||process.env.STATE_DIRECTORY||path.resolve(__dirname,'../data');
 const accounts=createAccounts(dataDir),history=dataDir?createMatchHistory(dataDir):null,
  social=dataDir?createSocial(dataDir):null,clubs=dataDir?createClubs(dataDir):null,
  clubResults=dataDir?createClubResults(dataDir):null,
  playerReports=dataDir?createPlayerReports(dataDir):null,
  presetLocker=dataDir?createPresetLocker(dataDir):null,
  presetHits=new Map(),
  parties=dataDir?createParties({social,exists:name=>accounts.reserved(name),
   clubForUser:user=>clubs?.membership(user)?.id||null}):null,
  authHits=new Map(),securityHits=new Map(),clubHits=new Map(),partyHits=new Map(),partyPending=new Map();
 // Room invitations are ephemeral: only a live room participant may share
 // an existing room with a mutually accepted friend. Never persist room links.
 const friendInvites=new Map(),socialHits=new Map(),INVITE_TTL=5*60000;
 function purgeInvites(){
  const now=Date.now();
  for(const [user,list]of friendInvites){
   const keep=list.filter(i=>i.expiresAt>now&&rooms.has(i.room)&&!rooms.get(i.room).locked&&
    (!rooms.get(i.room).clubId||clubs?.membership(user)?.id===rooms.get(i.room).clubId)&&
    social?.areFriends(i.from,user)&&[...rooms.get(i.room).sockets.values()].some(ws=>ws.account?.toLowerCase()===i.from&&accounts.user(ws.accountToken)?.toLowerCase()===i.from));
   if(keep.length)friendInvites.set(user,keep);else friendInvites.delete(user);
  }
 }
 function socialApi(req,res,route){
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(!social)return json(503,{error:'Social features require persistent server storage.'});
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const account=accounts.user(token),user=account?.toLowerCase();
  if(!user)return json(401,{error:'Sign in to use friends and room invitations.'});
  const status=()=>{
   purgeInvites();
   const playing=new Set([...clients].filter(ws=>ws.readyState===1&&ws.room&&ws.account&&accounts.user(ws.accountToken)?.toLowerCase()===ws.account.toLowerCase()).map(ws=>ws.account.toLowerCase()));
   return{...social.view(user,playing),invites:(friendInvites.get(user)||[]).map(i=>({from:i.from,room:i.room,expiresAt:i.expiresAt}))};
  };
  if(req.method==='GET'&&route==='/api/social')return json(200,status());
  if(req.method!=='POST')return json(405,{error:'Only GET /api/social or POST is supported.'});
  const now=Date.now(),ip=req.socket.remoteAddress||'',rateKey=user+':'+ip;
  const hits=(socialHits.get(rateKey)||[]).filter(t=>now-t<5*60000);
  if(hits.length>=30)return json(429,{error:'Too many changes. Try again shortly.'});
  hits.push(now);socialHits.set(rateKey,hits);
  if(socialHits.size>3000)for(const [key,list]of socialHits)if(list.every(t=>now-t>5*60000))socialHits.delete(key);
  let body='',exceeded=false;req.setEncoding('utf8');
  req.on('data',chunk=>{body+=chunk;if(body.length>2048){exceeded=true;req.destroy();}});
  req.on('end',()=>{
   if(exceeded)return;
   try{
    const data=JSON.parse(body||'{}');
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid request.');
    if(route==='/api/social/invite'){
     if(typeof data.to!=='string'||!/^[a-z0-9_-]{3,20}$/i.test(data.to)||
      typeof data.room!=='string'||!/^[A-HJ-NP-Z2-9]{8}$/.test(data.room))
      throw Error('Invalid player or room.');
     const to=data.to.toLowerCase(),room=rooms.get(data.room);
     if(!social.areFriends(user,to))throw Error('You can only invite mutual friends.');
     if(room?.clubId&&clubs?.membership(to)?.id!==room.clubId)
      throw Error('Club-only room invitations require Club membership.');
     if(room?.locked)throw Error('This room is locked. Unlock it before inviting friends.');
     if(!room||![...room.sockets.values()].some(ws=>ws.readyState===1&&ws.account?.toLowerCase()===user&&accounts.user(ws.accountToken)?.toLowerCase()===user))
      throw Error('Join a live room before sending invitations.');
     purgeInvites();
     if(friendInvites.size>1024&&!friendInvites.has(to))throw Error('Room invitation capacity reached.');
     const list=(friendInvites.get(to)||[]).filter(i=>i.from!==user||i.room!==data.room);
     if(list.length>=12)throw Error('Friend has too many pending invites.');
     list.push({from:user,room:data.room,expiresAt:now+INVITE_TTL});friendInvites.set(to,list);
    }else if(route==='/api/social'){
     if(typeof data.action!=='string'||typeof data.user!=='string')throw Error('Invalid friend action.');
     social.action(user,data.action,data.user,target=>accounts.reserved(target));
     if(data.action==='block'||data.action==='unblock')quickMatch.drainAll();
    }else throw Error('Unknown route.');
    return json(200,status());
   }catch(e){return json(400,{error:typeof e?.message==='string'?e.message:'Invalid social request.'});}
  });
 }
 // Authenticated social Clubs. Never reveal membership to non-members.
 function clubApi(req,res){
  const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(!clubs)return json(503,{error:'Clubs require persistent server storage.'});
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const account=accounts.user(token),user=account?.toLowerCase();
  if(!user)return json(401,{error:'Sign in to manage a Club.'});
  const clubPayload=()=>{
   const view=clubs.view(user),member=clubs.membership(user);
   return{...view,results:member?clubResults?.view(member.id)||null:null,rooms:member?[...rooms.values()]
    .filter(r=>r.clubId===member.id&&!r.locked&&!r.quickMatch)
    .slice(0,8).map(r=>({room:r.id,players:r.sockets.size,started:r.started===true})):[]};
  };
  if(req.method==='GET')return json(200,clubPayload());
  if(req.method!=='POST')return json(405,{error:'GET or POST required.'});
  const now=Date.now(),key=user+':'+(req.socket.remoteAddress||'');
  const hits=(clubHits.get(key)||[]).filter(t=>now-t<300000);
  if(hits.length>=20)return json(429,{error:'Too many Club changes. Try again shortly.'});
  hits.push(now);clubHits.set(key,hits);
  if(clubHits.size>2000)for(const [k,times]of clubHits)
   if(times.every(t=>now-t>300000))clubHits.delete(k);
  let body='',exceeded=false;req.setEncoding('utf8');
  req.on('data',part=>{body+=part;if(body.length>2048){exceeded=true;req.destroy();}});
  req.on('end',()=>{
   if(exceeded)return;
   try{
    const data=JSON.parse(body||'{}');
    if(!data||typeof data!=='object'||Array.isArray(data)||
      typeof data.action!=='string')throw Error('Invalid Club request.');
    clubs.action(user,data.action,data,target=>accounts.reserved(target));
    // Club removal, leaving or disbanding immediately revokes active access
    // to Club-only rooms as well as future join / reconnect attempts.
    for(const room of [...rooms.values()])if(room.clubId)
     for(const peer of [...room.sockets.values()]){
      const member=peer.account&&accounts.user(peer.accountToken)?.toLowerCase()===peer.account.toLowerCase()?
       clubs.membership(peer.account):null;
      if(member?.id!==room.clubId)
       removePlayer(peer,room,'Club membership changed. Club-only access has ended.');
     }
    return json(200,clubPayload());
   }catch(e){return json(400,{error:e?.message||'Club change unavailable.'});}
  });
 }
 // Private account-scoped, ephemeral party invitations and queue consent.
 function partyApi(req,res){
  const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  if(!parties)return json(503,{error:'Parties require the signed-in multiplayer server.'});
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const user=accounts.user(token)?.toLowerCase();
  if(!user)return json(401,{error:'Sign in to create or join a friend party.'});
  if(req.method==='GET')return json(200,parties.snapshot(user));
  if(req.method!=='POST')return json(405,{error:'GET or POST required.'});
  const now=Date.now(),key=user+':'+(req.socket.remoteAddress||'');
  const hits=(partyHits.get(key)||[]).filter(x=>now-x<300000);
  if(hits.length>=30)return json(429,{error:'Too many party actions.'});
  hits.push(now);partyHits.set(key,hits);
  if(partyHits.size>2000)for(const [name,times]of partyHits)
   if(times.every(t=>now-t>300000))partyHits.delete(name);
  let raw='',tooLarge=false;req.setEncoding('utf8');
  req.on('data',chunk=>{raw+=chunk;if(raw.length>2048){tooLarge=true;req.destroy();}});
  req.on('end',()=>{
   if(tooLarge)return;
   try{
    const data=JSON.parse(raw||'{}');
    if(!data||typeof data!=='object'||Array.isArray(data)||
     typeof data.action!=='string')throw Error('Invalid party action.');
    const prior=parties.snapshot(user).party;
    if(data.action==='launch'&&data.mode==='club4v4'){
     if(!prior||prior.members.length!==4)
      throw Error('Club 4v4 needs a party of four members.');
     const clubId=clubs?.membership(user)?.id;
     if(!clubId||prior.members.some(member=>clubs.membership(member.name)?.id!==clubId))
      throw Error('All four party members must belong to your current Club.');
    }
    const result=parties.action(user,data);
    if(prior?.launchMode&&['cancel'].includes(data.action))cancelPendingParty(prior.id,'Party search cancelled by leader.');
    return json(200,result);
   }catch(e){return json(400,{error:e?.message||'Party action failed.'});}
  });
 }
 // Authenticated, self-scoped download. Never send password hashes, salts,
 // sessions, socket IDs or another account's private data. No global directory.
 function accountExportApi(req,res){
  const json=(code,payload)=>{res.writeHead(code,{
   'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
   'Pragma':'no-cache','X-Content-Type-Options':'nosniff'
  });res.end(JSON.stringify(payload));};
  if(req.method!=='GET')return json(405,{error:'GET required.'});
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const username=accounts.user(token);
  if(!username)return json(401,{error:'Sign in to download your account data.'});
  if(!history||!social||!clubs||!parties)
   return json(503,{error:'Persistent account data is unavailable on this server.'});
  try{
   const user=username.toLowerCase(),friends=social.view(user,new Set());
   const payload={format:'fuckball-account-export',version:1,
    scope:'this-native-server',ranked:false,exportedAt:new Date().toISOString(),
    account:{username},
    career:history.stats(user),
    recentMatches:history.list(user),
    social:{
     friends:friends.friends.map(friend=>friend.name),
     incomingRequests:friends.incoming,outgoingRequests:friends.outgoing,
     blocked:friends.blocked
    },
    club:clubs.view(user),
    party:parties.snapshot(user)};
   // The export is deliberately a bounded snapshot, not a streaming backup
   // of other players, server databases, authentication material or all rooms.
   if(Buffer.byteLength(JSON.stringify(payload))>512*1024)
    throw Error('Snapshot exceeds limit.');
   return json(200,payload);
  }catch{
   return json(503,{error:'Account data export could not be prepared safely.'});
  }
 }
 // Account-owned security controls: current password required, bearer identity
 // derived solely from the validated token. Other sessions become invalid at
 // the durable password/session update and connected sockets then close.
 function accountSecurityApi(req,res){
  const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'});
   res.end(JSON.stringify(value));};
  if(req.method!=='POST')return json(405,{error:'POST required.'});
  const authorization=req.headers.authorization||'';
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))
   return json(401,{error:'Sign in to manage account security.'});
  const token=authorization.slice(7),username=accounts.user(token);
  if(!username)return json(401,{error:'Session expired. Sign in again.'});
  const key=username.toLowerCase()+':'+(req.socket.remoteAddress||'');
  const now=Date.now(),hits=(securityHits.get(key)||[]).filter(at=>now-at<600000);
  if(hits.length>=12)return json(429,{error:'Too many security requests. Try again later.'});
  hits.push(now);securityHits.set(key,hits);
  if(securityHits.size>2000)for(const [id,values]of securityHits)
   if(values.every(at=>now-at>600000))securityHits.delete(id);
  let body='',exceeded=false;req.setEncoding('utf8');
  req.on('data',chunk=>{if(!exceeded){body+=chunk;if(body.length>512){body='';exceeded=true;}}});
  req.on('end',()=>{
   if(exceeded)return json(413,{error:'Security request too large.'});
   try{
    const data=JSON.parse(body||'{}');
    if(!data||typeof data!=='object'||Array.isArray(data)||
       !['changePassword','logoutOthers'].includes(data.action)||
       typeof data.currentPassword!=='string')throw Error('Invalid security request.');
    const result=accounts.security(token,data.currentPassword,
      data.action==='changePassword'?data.newPassword: null);
    json(200,{ok:true,username:result.username,changed:result.changed,
     revoked:result.revoked,...(result.token?{token:result.token}:{})});
    // Keep online identity and match authority consistent with revoked bearer
    // tokens. Every obsolete live socket is disconnected; the fresh browser
    // session receives its rotated token from the HTTP response.
    const timer=setTimeout(()=>{
     for(const ws of clients){
      if(ws.readyState!==1||ws.account?.toLowerCase()!==username.toLowerCase()||
         accounts.user(ws.accountToken))continue;
      send(ws,{type:'sessionRevoked',reason:'Your account session was revoked. Sign in again.'});
      ws.close(4004,'Account session revoked');
     }
    },200);
    timer.unref?.();
   }catch(error){
    json(400,{error:typeof error?.message==='string'?error.message:'Security update failed.'});
   }
  });
 }
 // Fully private per-account cross-device preset locker. A snapshot must be
 // uploaded intentionally; local device presets are never silently replaced.
 function presetLockerApi(req,res){
  const json=(status,value)=>{res.writeHead(status,{
   'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'
  });res.end(JSON.stringify(value));};
  if(!presetLocker)return json(503,{error:'Account preset sync requires server storage.'});
  if(!['GET','POST'].includes(req.method))return json(405,{error:'GET or POST required.'});
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  const account=accounts.user(token)?.toLowerCase();
  if(!account)return json(401,{error:'Sign in to sync room presets.'});
  if(req.method==='GET'){
   try{return json(200,{source:'this-native-server',presets:presetLocker.get(account)});}
   catch{return json(503,{error:'Account preset locker unavailable.'});}
  }
  const now=Date.now(),key=account+':'+(req.socket.remoteAddress||'');
  const times=(presetHits.get(key)||[]).filter(t=>now-t<600000);
  if(times.length>=6)return json(429,{error:'Preset uploads are temporarily rate limited.'});
  times.push(now);presetHits.set(key,times);
  if(presetHits.size>1000)for(const [k,hits]of presetHits)
   if(hits.every(t=>now-t>600000))presetHits.delete(k);
  let body='',oversized=false;
  req.setEncoding('utf8');req.on('data',part=>{
   if(oversized)return;
   body+=part;
   if(Buffer.byteLength(body,'utf8')>600000){body='';oversized=true;}
  });
  req.on('end',()=>{
   if(oversized)return json(413,{error:'Preset upload exceeds server size limit.'});
   try{
    const d=JSON.parse(body||'{}');
    if(!d||typeof d!=='object'||Array.isArray(d)||d.action!=='replaceAll')
     return json(400,{error:'Invalid preset upload action.'});
    const count=presetLocker.replace(account,d.presets);
    return json(200,{ok:true,count});
   }catch(e){return json(400,{error:String(e?.message||'Preset upload failed.').slice(0,160)});}
  });
 }
 // Account API: same-origin JSON, small bodies, 20 attempts per IP per 10 minutes.
 function accountApi(req,res,route){const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(route==='/api/me'){const token=(req.headers.authorization||'').replace(/^Bearer /,'');const name=accounts.user(token);json(name?200:401,name?{username:name}:{error:'Not logged in.'});return;}
  if(route==='/api/match-history'){
   if(!['GET','DELETE'].includes(req.method)){json(405,{error:'GET or DELETE required.'});return;}
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');
   const username=accounts.user(token);
   if(!username){json(401,{error:'Log in to manage your server match results.'});return;}
   if(req.method==='DELETE'){
    try{json(200,{ok:true,removed:history?.erase(username)||0});}
    catch{json(503,{error:'Match history could not be erased. Try again later.'});}
    return;
   }
   json(200,{items:history?.list(username)||[],source:'native-server',ranked:false,durable:!!history});return;
  }
  if(route==='/api/player-stats'){
   if(req.method!=='GET'){json(405,{error:'GET required.'});return;}
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');
   const username=accounts.user(token);
   if(!username){json(401,{error:'Sign in to view your career statistics.'});return;}
   json(200,{stats:history?.stats(username)||null,durable:!!history});return;
  }
  if(req.method!=='POST'){json(405,{error:'POST required.'});return;}
  const ip=req.socket.remoteAddress||'',now=Date.now(),hits=(authHits.get(ip)||[]).filter(t=>now-t<600000);if(hits.length>=20){json(429,{error:'Too many attempts. Try again later.'});return;}hits.push(now);authHits.set(ip,hits);
  let body='';req.setEncoding('utf8');req.on('data',c=>{body+=c;if(body.length>4096)req.destroy();});req.on('end',()=>{try{const d=JSON.parse(body||'{}');if(route==='/api/logout'){accounts.logout(d.token);json(200,{ok:true});return;}const out=route==='/api/register'?accounts.register(d.username,d.password):accounts.login(d.username,d.password);json(200,out);}catch(e){json(400,{error:e.message});}});}
 const server=http.createServer((req,res)=>{const route=req.url?.split('?')[0];if(['/api/social','/api/social/invite'].includes(route)){socialApi(req,res,route);return;}if(route==='/api/clubs'){clubApi(req,res);return;}if(route==='/api/party'){partyApi(req,res);return;}if(route==='/api/account/export'){accountExportApi(req,res);return;}if(route==='/api/account/room-presets'){presetLockerApi(req,res);return;}if(route==='/api/account/security'){accountSecurityApi(req,res);return;}if(route==='/api/quick-match/availability'){
   if(req.method!=='GET'){res.writeHead(405,{'Cache-Control':'no-store'});res.end();return;}
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(quickMatch.availability()));return;
  }if(['/api/register','/api/login','/api/logout','/api/me','/api/match-history','/api/player-stats'].includes(route)){accountApi(req,res,route);return;}if(req.url?.split('?')[0]==='/api/training'){let status={status:'unavailable'};try{const raw=JSON.parse(fs.readFileSync(process.env.FUCKBALL_TRAINING_STATUS||'/opt/fuckball-training/status.json','utf8'));status=Object.fromEntries(['status','cycles','matches','activeCycle','episodesPerCycle','directionAccuracy','kickF1','arenaWins','arenaGames','livePromoted','updatedAt','deadline','reason'].filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));}catch{}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(status));return;}if(req.url?.split('?')[0]==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,engine:'node-haxball-2.3.1',release:process.env.FUCKBALL_RELEASE_SHA||'local',physicsHz:60,snapshotHz:30,rooms:rooms.size,netcode:v3Enabled?3:2,peerHosting}));return;}
  if(route==='/api/public-rooms'){
    if(req.method!=='GET'){res.writeHead(405,{'Cache-Control':'no-store'});res.end();return;}
    const listings=[...rooms.values()].filter(r=>r.listed===true&&!r.locked&&!r.quickMatch)
     .slice(0,16).map(r=>({room:r.id,players:r.sockets.size,
      requiresAccount:r.accountsOnly===true,capacity:r.maxHumans,
      occupied:r.clients.size+r.pendingJoins.length,
      mode:['bot','1v1','2v2','3v3','4v4'].includes(r.mode)?r.mode:'custom',
      started:r.started===true,map:String(r.hb._room.state.stadium.name||'Stadium').slice(0,60)}));
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',
     'X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({rooms:listings}));
    return;
   }
   if(req.url?.split('?')[0]==='/api/rooms'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify([...rooms.values()].map(r=>({players:r.sockets.size,reserved:r.parked.size,map:r.hb._room.state.stadium.name,started:r.started}))));return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);});
 });
 // Track the underlying TCP sockets as well as admitted WebSockets: HTTP
 // upgrades and early handshake rejections can outlive the room client set.
 const openSockets=new Set();
 server.on('connection',socket=>{
  openSockets.add(socket);
  socket.once('close',()=>openSockets.delete(socket));
 });
 const wss=new WebSocketServer({server,maxPayload:2*1024*1024});
 const send=(ws,data)=>{if(ws.readyState===1&&ws.socket.writableLength<262144)ws.send(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
 function cancelPendingParty(id,reason){
  const pending=partyPending.get(id);
  if(!pending)return;
  partyPending.delete(id);parties?.consume(id);
  for(const ws of pending.sockets.values()){
   quickMatch.remove(ws,true);
   send(ws,{type:'queueStatus',status:'error',reason});
  }
 }
 const RoomCore=require('../dist/room-core.js'),quickMatch=createQuickMatch({send,start:createMatchedRoom,
  validAccount:ws=>!!ws.account&&accounts.user(ws.accountToken)?.toLowerCase()===ws.account.toLowerCase(),
  canShareMatch:(a,b)=>!social||social.canShareMatch(a,b),
  clubForUser:user=>clubs?.membership(user)?.id||null}),XE=.06,RELAY=0x46425231,HOST_OUT=new Set(['status','room','chat','goal','subApplied','playingTime','matchResult','matchRestart','error','recordingStatus','recording']);
 /* Peer hosting (docs/netcode-plan.md): the room can run in a player's browser when that gives everyone a
    better connection. This server stays the coordinator: it measures, elects, hands the room over at an
    exact frame, keeps a standby copy plus every input, and takes the room back instantly when the host
    leaves, hides its tab or stops reporting. OFF by default: direct WebRTC channels show players each
    other's IP addresses. FUCKBALL_PEER_HOSTING=on enables it. */
 const peerHosting=options.peerHosting??(process.env.FUCKBALL_PEER_HOSTING==='on'&&v3Enabled);
 const electionOptions={minGain:25,ratio:.85,hold:8000,...options.election},cooldown=options.migrationCooldown??10000,standbyTimeout=options.standbyTimeout??1500;
 const toWire=data=>data instanceof Uint8Array?Buffer.from(data.buffer,data.byteOffset,data.byteLength):data;
 function createRoom(){if(rooms.size>=16)throw Error('Server is full.');let id;do{id=Array.from(crypto.randomBytes(8),b=>ROOM_ALPHABET[b%ROOM_ALPHABET.length]).join('');}while(rooms.has(id));const hb=HBInit({noPlayer:true,roomName:'Fuckball '+id});hb.setCustomStadium(bff);hb.setScoreLimit(3);hb.setTimeLimit(7);
  // While a browser hosts, this copy is only a standby: it must not talk to the clients.
  const sockets=new Map(),r=RoomCore.createRoomCore({hb,id,AI,Netcode,v3:v3Enabled,
   onCompleted:(result,room)=>{
    // Browser-peer simulated matches are deliberately not server-verifiable.
    if(!history||room.authority!=='server')return;
    // Short or abandoned human queues still show a result locally, but never
    // enter cumulative career statistics as an official native-server round.
    if(room.quickMatch){
     const active=result.finalPlayers||[];
     if([1,2].some(side=>!active.some(p=>p.sideFrames?.[side-1]>=120*60)))return;
    }
    const records=[];
    for(const p of result.finalPlayers||[]){
     const ws=sockets.get(p.id);
     if(!ws?.account||!Array.isArray(p.sideFrames)||p.sideFrames.length!==2)continue;
     const [red,blue]=p.sideFrames;
     if(![red,blue].every(v=>Number.isSafeInteger(v)&&v>=0)||red+blue!==p.playedFrames||p.playedFrames<=0)continue;
     const side=red>=blue?1:2;
     records.push({id:crypto.randomBytes(12).toString('hex'),user:ws.account.toLowerCase(),
      room:room.id,round:result.round,at:Date.now(),red:result.red,blue:result.blue,
      winner:result.winner,team:side,playedFrames:p.playedFrames,mode:room.mode});
    }
    try{history.append(records);}catch{console.warn('Match history write unavailable; completed round remains unrecorded.');}
    // Only eight fully participating, signed-in humans in the dedicated
    // trusted Club vs Club queue can produce a persisted Club result.
    // This is a *casual local-server record*, not a verified ranked fixture.
    if(room.quickMatch?.clubMatch&&clubResults){
     const participants=(result.finalPlayers||[]).flatMap(p=>{
      const ws=sockets.get(p.id),team=p.sideFrames;
      if(!ws?.account||accounts.user(ws.accountToken)?.toLowerCase()!==ws.account.toLowerCase()||
         !Array.isArray(team)||team.length!==2)return[];
      const side=team[0]>=120*60?1:team[1]>=120*60?2:0;
      return side?[{account:ws.account.toLowerCase(),side}]:[];
     });
     const left=participants.filter(p=>p.side===1),right=participants.filter(p=>p.side===2);
     if(participants.length===8&&left.length===4&&right.length===4&&
        new Set(participants.map(p=>p.account)).size===8){
      const valid=left.every(p=>clubs?.membership(p.account)?.id===room.quickMatch.clubMatch.red)&&
       right.every(p=>clubs?.membership(p.account)?.id===room.quickMatch.clubMatch.blue);
      if(valid)try{
       clubResults.append({red:room.quickMatch.clubMatch.red,blue:room.quickMatch.clubMatch.blue,
        redGoals:result.red,blueGoals:result.blue});
      }catch{console.warn('Club match result storage unavailable; no Club result recorded.');}
     }
    }
   },
   send:(cid,data)=>{if(r.authority!=='server'||data?.type==='chat'&&
    !Number.isSafeInteger(data.from))return;const ws=sockets.get(cid);if(ws)send(ws,toWire(data));},canSend:cid=>{const ws=sockets.get(cid);return !!ws&&ws.socket.writableLength<65536;}});
  Object.assign(r,{sockets,locked:false,listed:false,clubId:null,roomBans:new Map(),chatMutes:new Map(),accountsOnly:false,maxHumans:64,authority:'server',epoch:0,migration:null,clock:0,reports:new Map(),standby:null,standbyAt:0,lastMigration:-Infinity,pendingJoins:[],sessionTokens:new Map(),parked:new Map(),penalty:new Map(),election:Netcode.createElection(electionOptions)});rooms.set(id,r);return r;}
 const roomTime=r=>r.clock+fraction();
 const hostSocket=r=>r.authority==='server'?null:r.sockets.get(r.authority);
 function meshUpdate(r){if(!peerHosting)return;const ids=[...r.sockets].filter(([,ws])=>ws.mesh).map(([id])=>id);for(const id of ids)send(r.sockets.get(id),{type:'mesh',peers:ids});}
 function announce(r,host){const name=host==='server'?'server':r.hb.getPlayer(host)?.name||'Player '+host;for(const ws of r.sockets.values())send(ws,{type:'authority',host,frame:r.migration?.frame??r.frame,epoch:r.epoch,name});}
 /* Plan a handover at frame M, far enough ahead that every client hears about it before M. */
 function migrate(r,to,reason){if(r.migration||to===r.authority)return;const rtts=[...r.reports.values()].map(x=>x.server).filter(Number.isFinite),worst=rtts.length?Math.max(...rtts):150;
  r.epoch++;r.migration={to,from:r.authority,frame:Math.ceil(r.clock+(worst+60)*XE)+2,epoch:r.epoch,started:Date.now(),reason};announce(r,to);
  if(r.authority!=='server')send(hostSocket(r),{type:'release',frame:r.migration.frame,epoch:r.epoch});}
 function takeover(r,to,state){const ws=r.sockets.get(to);if(!ws){r.migration=null;r.authority='server';r.epoch++;announce(r,'server');return;}send(ws,{type:'takeover',state:RoomCore.encodeState(state),frame:roomTime(r),epoch:r.epoch});
  r.authority=to;r.standby=state;r.standbyAt=Date.now();r.migration=null;r.lastMigration=Date.now();if(r.pendingJoins.length)migrate(r,'server','join');}
 /* Continue on this server from a host's export. Inputs that only reached this server are merged in. */
 function resume(r,state,{failover=false}={}){const mine=new Map([...r.clients].map(([id,c])=>[id,c.timeline?.export()]));r.authority='server';r.restore(state);if(failover)r.seq+=1000;
  for(const [id,c]of r.clients){const own=mine.get(id);if(own&&c.timeline)c.timeline.receive(own.changes.filter(x=>x[0]>c.timeline.lastSeq),r.frame,r.frame);}
  for(const id of [...r.clients.keys()])if(!r.sockets.has(id)&&!r.parked.has(id))r.leave(id);
  for(const id of r.parked.keys())if(r.clients.has(id))r.disconnected.add(id);
  for(const [id,ws]of r.sockets)if(!r.clients.has(id))try{r.join(id,{name:ws.name,netcode:ws.netcode,account:ws.account});}catch{}
  r.migration=null;r.standby=null;r.lastMigration=Date.now();r.status();
  for(const ws of r.pendingJoins.splice(0))if(ws.readyState===1)try{join(ws,r);}catch(e){ws.room=null;ws.pendingResumeToken=null;send(ws,{type:'error',message:e?.message||'Unable to rejoin.'});}}
 function failover(r,reason){if(r.authority==='server'||!r.standby)return;const old=hostSocket(r);r.penalty.set(r.authority,Date.now()+60000);r.epoch++;resume(r,r.standby,{failover:true});r.migration={frame:r.frame};announce(r,'server');r.migration=null;if(old)send(old,{type:'stopHost'});}
 function election(r){if(r.quickMatch||!peerHosting||r.migration||r.hb._room.isRecording()||r.authority!=='server'&&r.standby?.recording||Date.now()-r.lastMigration<cooldown||!r.sockets.size)return;
  const now=Date.now(),players=[...r.sockets.keys()],rtt={server:{}};
  for(const id of players){const rep=r.reports.get(id);rtt[id]={};if(!rep||now-rep.at>6000)continue;if(Number.isFinite(rep.server)){rtt.server[id]=rep.server;rtt[id].server=rep.server;}
   for(const [peer,ms]of Object.entries(rep.peers||{})){const other=r.reports.get(Number(peer))?.peers?.[id];rtt[id][peer]=Number.isFinite(other)?(ms+other)/2:ms;}}
  const candidates=['server',...players.filter(id=>{const rep=r.reports.get(id);return rep&&now-rep.at<6000&&rep.eligible&&r.sockets.get(id)?.mesh&&!(r.penalty.get(id)>now);})];
  const forced=options.forceHost?.(r,candidates);if(forced!==undefined){if(forced!==r.authority&&(forced==='server'||candidates.includes(forced)))migrate(r,forced,'forced');return;}
  const d=r.election.decide({rtt,players,candidates,current:r.authority,now});if(d.switch)migrate(r,d.host,d.reason);}
 // A per-connection bearer ticket is never placed in the room URL, status, or host snapshots.
 function issueTicket(ws,r,id){const ticket=crypto.randomBytes(32).toString('hex');r.sessionTokens.set(id,ticket);send(ws,{type:'resumeTicket',ticket,windowMs:reconnectMs});}
 function roomControl(r){
  const now=Date.now();
  for(const [id,until]of r.chatMutes)if(until<=now||!r.clients.has(id))r.chatMutes.delete(id);
  for(const client of r.sockets.values()){
   const ownerAccount=client.playerId===r.owner&&client.account&&
    accounts.user(client.accountToken)?.toLowerCase()===client.account.toLowerCase()?
    clubs?.membership(client.account):null;
   send(client,{type:'roomControl',locked:r.locked,listed:r.listed===true,
    clubOnly:!!r.clubId,canClubLock:!!ownerAccount,
    owner:r.owner,banMinutes:10,accountsOnly:r.accountsOnly===true,maxHumans:r.maxHumans,connectedHumans:r.clients.size,
    chatMuteUntil:r.chatMutes.get(client.playerId)||null,
    chatMutes:client.playerId===r.owner?[...r.chatMutes]:[]});
  }
 }
 // Temporary account-scoped ban; never block a shared public IP, and never
 // trust a self-reported account label. Only account identities authenticated
 // by the server may be temporarily barred from this one room.
 function admitted(r,account){
  const now=Date.now();
  for(const [name,expires]of r.roomBans)if(expires<=now)r.roomBans.delete(name);
  return !account||!(r.roomBans.get(account.toLowerCase())>now);
 }
 function removePlayer(ws,r,reason){
  if(!ws||ws.room!==r)return;
  ws.intentionalLeave=true;
  send(ws,{type:'roomRemoved',reason});
  leave(ws);
  ws.close(4003,'Removed from room');
 }
 function roomAdmin(ws,r,d){
  if(r.quickMatch)throw Error('Quick Match rooms cannot be moderated or reconfigured by players.');
  if(ws.playerId!==r.owner||!r.sockets.has(ws.playerId))
   throw Error('Only the current room host can moderate this room.');
  if(d.action==='lock'||d.action==='unlock'){
   r.locked=d.action==='lock';if(r.locked)r.listed=false;roomControl(r);return;
  }
  if(d.action==='publish'||d.action==='unpublish'){
   if(d.action==='publish'&&(r.locked||r.clubId))throw Error('Unlock joins and disable Club-only access before publishing.');
   r.listed=d.action==='publish';roomControl(r);return;
  }
  if(d.action==='accountsOnly'||d.action==='allowGuests'){
   r.accountsOnly=d.action==='accountsOnly';
   roomControl(r);return;
  }
  if(d.action==='capacity'){
   if(![8,12,16,24,64].includes(d.limit))throw Error('Choose a supported room capacity.');
   if(d.limit<r.clients.size+r.pendingJoins.length)
    throw Error('Room capacity is below the number of current and reconnecting participants.');
   r.maxHumans=d.limit;roomControl(r);return;
  }
  if(d.action==='clubOnly'||d.action==='clubOpen'){
   if(d.action==='clubOnly'){
    const account=ws.account&&accounts.user(ws.accountToken);
    const member=account?clubs?.membership(account):null;
    if(!member)throw Error('Sign in as a Club member to restrict this room.');
    for(const peer of r.sockets.values()){
     if(!peer.account||accounts.user(peer.accountToken)?.toLowerCase()!==peer.account.toLowerCase()||
       clubs.membership(peer.account)?.id!==member.id)
      throw Error('All connected players must belong to your Club before enabling Club-only access.');
    }
    r.clubId=member.id;r.listed=false;
   }else r.clubId=null;
   roomControl(r);return;
  }
  if(!['kick','ban','muteChat','unmuteChat'].includes(d.action)||!Number.isSafeInteger(d.id)||d.id<1)
   throw Error('Invalid room moderation action.');
  const target=r.sockets.get(d.id);
  if(!target||d.id===r.owner)throw Error('Choose a connected player other than yourself.');
  if(d.action==='muteChat'||d.action==='unmuteChat'){
   // Scoped to a room slot, not an IP address or a globally named account.
   // Reserved-slot reconnects keep the mute; unrelated rooms stay unaffected.
   const recent=(ws.chatModTimes||[]).filter(t=>Date.now()-t<10000);
   if(recent.length>=6)throw Error('Too many moderation changes. Try again shortly.');
   recent.push(Date.now());ws.chatModTimes=recent;
   if(d.action==='muteChat'){
    if(r.chatMutes.size>=128&&!r.chatMutes.has(d.id))throw Error('Room chat mute list is full.');
    r.chatMutes.set(d.id,Date.now()+10*60000);
   }else r.chatMutes.delete(d.id);
   send(target,{type:'chatModeration',muted:d.action==='muteChat',until:r.chatMutes.get(d.id)||null});
   roomControl(r);return;
  }
  if(d.action==='ban'){
   if(!target.account||accounts.user(target.accountToken)?.toLowerCase()!==target.account.toLowerCase())
    throw Error('Temporary room bans require a signed-in player.');
   const name=target.account.toLowerCase();
   if(r.roomBans.size>=128&&!r.roomBans.has(name))throw Error('Temporary room ban list is full.');
   r.roomBans.set(name,Date.now()+10*60000);
   const peers=[...r.sockets.values()].filter(p=>p.account?.toLowerCase()===name);
   for(const p of peers)removePlayer(p,r,'Temporarily removed from this room by the host (10 minutes).');
  }else removePlayer(target,r,'Removed from this room by the host.');
  roomControl(r);
 }
 function rejoin(ws,r,ticket){
  if(typeof ticket!=='string'||!/^[0-9a-f]{64}$/.test(ticket))throw Error('Session expired. Join the room again.');
  let id=null,claim=null;
  for(const [pid,p]of r.parked){if(p.ticket.length===ticket.length&&crypto.timingSafeEqual(Buffer.from(p.ticket),Buffer.from(ticket))){id=pid;claim=p;break;}}
  if(id===null||Date.now()>claim.expiresAt||!r.clients.has(id)||r.sockets.has(id))throw Error('Session expired. Join the room again.');
  if(claim.account&&claim.account!==ws.account)throw Error('Session belongs to a different account.');
  if(r.clubId&&(!ws.account||clubs?.membership(ws.account)?.id!==r.clubId))
   throw Error('Only members of this Club can rejoin the room.');
  clearTimeout(claim.timer);r.parked.delete(id);ws.room=r;ws.playerId=id;r.sockets.set(id,ws);
  const c=r.clients.get(id);c.timeline=r.v3&&ws.netcode===3?Netcode.createInputTimeline():null;c.lastInputSeq=0;
  send(ws,{type:'welcome',id,room:r.id,owner:r.owner,name:c.name,account:claim.account,netcode:c.timeline?3:2,resumed:true});
  issueTicket(ws,r,id);r.setConnected(id,true);
  roomControl(r);
  if(ws.mesh)send(ws,{type:'peering',enabled:true});meshUpdate(r);
 }
 // Disconnection is not a voluntary leave: retain the role and match clock, not inputs or offline playing time.
 function park(ws){const r=ws.room,id=ws.playerId;if(!r||id==null||!r.clients.has(id))return false;
  if(r.authority!=='server'&&r.standby)failover(r,'participant disconnected');
  if(r.authority!=='server')return false;
  const ticket=r.sessionTokens.get(id);if(!ticket)return false;
  ws.room=null;r.sockets.delete(id);r.reports.delete(id);
  const claim={ticket,account:ws.account||null,expiresAt:Date.now()+reconnectMs,timer:null};
  claim.timer=setTimeout(()=>{if(r.parked.get(id)!==claim)return;r.parked.delete(id);r.sessionTokens.delete(id);if(r.leave(id)){r.destroy();rooms.delete(r.id);}meshUpdate(r);},reconnectMs);
  claim.timer.unref?.();r.parked.set(id,claim);r.setConnected(id,false);meshUpdate(r);return true;
 }
 function join(ws,r){
  // A browser host cannot add players; take the room back first (a seamless handover), then join.
  if(r.authority!=='server'){if(!r.pendingJoins.includes(ws))r.pendingJoins.push(ws);ws.room=r;if(!r.migration)migrate(r,'server','join');return;}
  if(ws.pendingResumeToken){const ticket=ws.pendingResumeToken;ws.pendingResumeToken=null;rejoin(ws,r,ticket);return;}
  while(r.botIds.has(r.nextId)||r.clients.has(r.nextId))r.nextId++;const id=r.nextId;ws.room=r;ws.playerId=id;r.sockets.set(id,ws);try{r.join(id,{name:ws.name,netcode:ws.netcode,account:ws.account});}catch(e){r.sockets.delete(id);ws.room=null;if(!r.clients.size){r.destroy();rooms.delete(r.id);}throw e;}
  if(ws.resumeEnabled)issueTicket(ws,r,id);if(ws.mesh)send(ws,{type:'peering',enabled:true});meshUpdate(r);roomControl(r);}
 // RoomCore also powers public custom rooms, whose bots fill empty sides.
 // Competitive-looking Quick Match rooms must never run or display those bots.
 // Strip any temporary setup bots after matchmaking admission and after
 // player departures. Preserve the approved engine and contact physics.
 function stripQuickBots(r){
  for(const id of [...r.botIds]){
   r.hb._room.playerLeave(id);r.botIds.delete(id);
  }
 }
 function createMatchedRoom({mode,red,blue}){
  let clubMatch=null;
  if(mode==='club4v4'){
   if(!clubs||red.length!==4||blue.length!==4)
    throw Error('Club match requires two complete authenticated squads.');
   const clubRed=clubs.membership(red[0].user)?.id,
    clubBlue=clubs.membership(blue[0].user)?.id;
   if(!clubRed||!clubBlue||clubRed===clubBlue||
      red.some(p=>clubs.membership(p.user)?.id!==clubRed)||
      blue.some(p=>clubs.membership(p.user)?.id!==clubBlue))
    throw Error('Club membership changed before the game began.');
   clubMatch={red:clubRed,blue:clubBlue};
  }
  const r=createRoom();
  r.quickMatch={mode,clubMatch,startedAt:Date.now()};
  r.mode=mode==='2v2'?'2v2':mode==='1v1'?'bot':'4v4';
  try{
   for(let i=0;i<red.length;i++)for(const entry of [red[i],blue[i]]){
    const ws=entry.ws;
    if(ws.readyState!==1||ws.room||accounts.user(ws.accountToken)?.toLowerCase()!==entry.user)
     throw Error('Queued player disconnected.');
    join(ws,r);
   }
   stripQuickBots(r);
   r.mode=mode==='club4v4'?'4v4':mode;
   r.locked=true; // Only existing exact-session reconnects can enter.
   r.reset(true);
   for(const ws of r.sockets.values()){
    send(ws,{type:'quickMatchFound',mode,players:red.length+blue.length,
     humanOnly:true,ranked:false,serverAuthority:true});
   }
   roomControl(r);
  }catch(e){
   for(const ws of r.sockets.values()){
    send(ws,{type:'queueStatus',status:'error',reason:'Match could not start.'});
    ws.room=null;ws.playerId=null;ws.intentionalLeave=true;ws.close(1011,'Match creation failed');
   }
   r.destroy();rooms.delete(r.id);
   throw e;
  }
 }
 function leave(ws){const r=ws.room;if(!r)return;ws.room=null;const queued=r.pendingJoins.indexOf(ws);if(queued>=0){r.pendingJoins.splice(queued,1);return;}
  const id=ws.playerId;if(id===r.owner)r.listed=false; // A new host must consent before re-publishing.
  r.sockets.delete(id);r.reports.delete(id);r.chatMutes.delete(id);r.sessionTokens.delete(id);const claim=r.parked.get(id);if(claim){clearTimeout(claim.timer);r.parked.delete(id);}
  if(r.authority===id){if(!r.sockets.size){r.destroy();rooms.delete(r.id);return;}failover(r,'host left');}
  else if(r.authority!=='server'){send(hostSocket(r),{type:'hostLeave',id});if(!r.sockets.size){r.destroy();rooms.delete(r.id);}meshUpdate(r);return;}
  if(r.leave(id)){r.destroy();rooms.delete(r.id);return;}
  if(r.quickMatch){
   stripQuickBots(r);
   const left=r.hb.getPlayerList().filter(p=>r.clients.has(p.id)&&[1,2].includes(p.team));
   if(r.started&&[1,2].some(side=>!left.some(p=>p.team===side))){
    r.started=false;r.paused=false;r.lastResult=null;r.hb.stopGame();r.status();r.snapshot();
    for(const peer of r.sockets.values())send(peer,{type:'quickMatchCancelled',
     reason:'A team has left. The casual match ended without a ranked result.'});
   }else{r.status();r.snapshot();}
  }
  meshUpdate(r);roomControl(r);}
 function fromHost(r,ws,d){if(r.authority!==ws.playerId)return;
  if(d.type==='hostOut'){const to=r.sockets.get(Number(d.to));if(to&&d.d&&HOST_OUT.has(d.d.type))send(to,d.d);return;}
  if(d.type==='standby'){try{r.standby=RoomCore.decodeState(d.state);r.standbyAt=Date.now();for(const [id,c]of r.standby.clients)if(c.timeline)r.clients.get(id)?.timeline?.prune(c.timeline.appliedSeq,c.timeline.current);}catch{}return;}
  if(d.type==='released'){let state;try{state=RoomCore.decodeState(d.state);}catch{failover(r,'bad release');return;}const m=r.migration;
   if(m&&m.to!=='server'&&m.to!==ws.playerId&&r.sockets.has(m.to)){resume(r,state);r.epoch=m.epoch;takeover(r,m.to,r.exportState());return;}
   // Unplanned (tab hidden), or the next host left meanwhile: the server keeps the room, so say so.
   const announceServer=!m||m.to!=='server';resume(r,state);if(announceServer){r.epoch++;r.migration={frame:state.frame};announce(r,'server');r.migration=null;}return;}
  // Not a candidate again until a fresh report says it can host (e.g. its tab is visible again).
  if(d.type==='hostRelease'){const rep=r.reports.get(ws.playerId);if(rep)rep.eligible=false;if(!r.migration)migrate(r,'server',d.reason||'host released');}}
 wss.on('connection',ws=>{clients.add(ws);ws.lastSeen=Date.now();ws.rateStart=Date.now();ws.messages=0;ws.on('close',()=>{
  for(const [id,pending]of partyPending)if([...pending.sockets.values()].includes(ws))
   cancelPendingParty(id,'A party member disconnected.');
  quickMatch.remove(ws);if(shuttingDown||ws.intentionalLeave||ws.peerClosed||!park(ws))leave(ws);clients.delete(ws);});ws.on('message',(raw,binary)=>{try{const now=Date.now();ws.lastSeen=now;const r0=ws.room;if(now-ws.rateStart>1000){ws.rateStart=now;ws.messages=0;}if(++ws.messages>(r0&&r0.authority===ws.playerId?2000:180))throw Error('Too many messages.');
   // Snapshot bytes from a browser host for a client without a direct channel to it.
   if(binary){if(r0&&r0.authority===ws.playerId&&raw.length>8&&raw.readUInt32BE(0)===RELAY){const to=r0.sockets.get(raw.readUInt32BE(4));if(to&&to.socket.writableLength<65536)send(to,raw.subarray(8));}return;}
   const d=JSON.parse(raw.toString());
   if(d.type==='ping'){send(ws,ws.room?{type:'pong',t:d.t,frame:roomTime(ws.room)}:{type:'pong',t:d.t,frame:frame+fraction()});return;}
   if(d.type==='sping'){send(ws,{type:'spong',t:d.t,frame:ws.room?roomTime(ws.room):null});return;}
   if(d.type==='queueJoin'){
    if(ws.room)throw Error('Leave the current room before searching.');
    const account=accounts.user(d.token);
    if(!account)throw Error('Log in to search for real human players.');
    if([...clients].some(peer=>peer!==ws&&peer.readyState===1&&peer.room&&peer.account?.toLowerCase()===account.toLowerCase()))
     throw Error('This account is already playing in an online room.');
    ws.account=account;ws.accountToken=d.token;ws.name=account;
    ws.netcode=d.netcode===2?2:3;ws.mesh=false;ws.resumeEnabled=true;
    if(d.mode==='club4v4'&&d.party!==true)
     throw Error('Club 4v4 needs a full signed-in Club party.');
    if(d.party===true){
     const party=parties?.queueFor(account,d.mode);
     if(!party)throw Error('Your party launch is not active. Ready up and ask the leader to start.');
     if(d.mode==='club4v4'){
      const clubId=clubs?.membership(account)?.id;
      if(party.users.length!==4||!clubId||
       party.users.some(user=>clubs.membership(user)?.id!==clubId))
       throw Error('Club 4v4 needs four members of one Club.');
     }
     let pending=partyPending.get(party.id);
     if(!pending){
      pending={id:party.id,mode:d.mode,users:party.users,sockets:new Map(),expiresAt:Date.now()+30000};
      partyPending.set(party.id,pending);
     }
     if(pending.mode!==d.mode||pending.sockets.has(account.toLowerCase())||
        pending.users.length!==party.users.length||
        pending.users.some(user=>!party.users.includes(user)))
      throw Error('This party search has changed. Start again.');
     pending.sockets.set(account.toLowerCase(),ws);
     send(ws,{type:'queueStatus',status:'partyGathering',mode:d.mode,
      waiting:pending.sockets.size,needed:pending.users.length,humanOnly:true});
     for(const member of pending.sockets.values())if(member!==ws)
      send(member,{type:'queueStatus',status:'partyGathering',mode:d.mode,
       waiting:pending.sockets.size,needed:pending.users.length,humanOnly:true});
     if(pending.sockets.size===party.users.length){
      try{
       const entries=party.users.map(user=>{
        const socket=pending.sockets.get(user);
        if(!socket||accounts.user(socket.accountToken)?.toLowerCase()!==user)
         throw Error('Party member session expired.');
        return{ws:socket,user,stats:history?.stats(user)};
       });
       quickMatch.joinGroup(entries,d.mode,party.id);
       parties.consume(party.id);partyPending.delete(party.id);
      }catch(e){cancelPendingParty(party.id,e.message||'Party search could not start.');}
     }
    }else quickMatch.join(ws,account.toLowerCase(),d.mode,history?.stats(account));
    return;
   }
   if(d.type==='queueCancel'){
    for(const [id,pending]of partyPending)if([...pending.sockets.values()].includes(ws))
     cancelPendingParty(id,'Party search cancelled.');
    quickMatch.remove(ws);return;
   }
   if(d.type==='queueReadyResponse'){quickMatch.respond(ws,d.id,d.accept===true?true:d.accept===false?false:null);return;}
   if(d.type==='join'){quickMatch.remove(ws,true);if(ws.room)throw Error('Already in a room.');const account=accounts.user(d.token),name=account||String(d.name||'Player').trim().slice(0,25)||'Player';if(!account&&accounts.reserved(name))throw Error('Name reserved: that nickname belongs to an account. Log in or pick another name.');const r=d.create?createRoom():rooms.get(String(d.room||'').toUpperCase());if(!r)throw Error('Room not found.');if(r.quickMatch&&!d.resume)throw Error('Quick Match rooms are reserved for the matched players.');if(r.locked&&!d.resume)throw Error('This room is locked to new players.');if(r.accountsOnly&&!account&&!d.resume)throw Error('This room requires a signed-in account.');if(!d.resume&&r.clients.size+r.pendingJoins.length>=r.maxHumans)throw Error('This room is full. Try again after a player leaves.');if(r.clubId&&(!account||clubs?.membership(account)?.id!==r.clubId))
    throw Error('Only members of this Club can join this room.');
   if(!admitted(r,account))throw Error('You are temporarily blocked from this room.');ws.name=name;ws.account=account||null;ws.accountToken=account?d.token:null;ws.resumeEnabled=!!account||d.resumeOptIn===true;ws.netcode=d.netcode;ws.mesh=peerHosting&&d.mesh===true&&d.netcode===3&&v3Enabled;if(d.resume!==undefined)ws.pendingResumeToken=d.resume;join(ws,r);return;}
   const r=ws.room;if(!r||ws.playerId==null)throw Error('Join a room first.');
   if(d.type==='roomAdmin'){roomAdmin(ws,r,d);return;}
   if(r.quickMatch&&!['in','input','chat','reportPlayer'].includes(d.type))throw Error('Quick Match settings are controlled by the server.');
   if(d.type==='reportPlayer'){
    const reporter=ws.account&&accounts.user(ws.accountToken)?.toLowerCase();
    if(!reporter)throw Error('Sign in to report another player.');
    if(!playerReports)throw Error('Player reporting requires server storage.');
    if(!Number.isSafeInteger(d.id)||d.id<1||d.id===ws.playerId||
       typeof d.reason!=='string'||typeof d.note!=='string')
     throw Error('Choose a connected player and reason.');
    const accused=r.sockets.get(d.id);
    if(!accused||r.botIds.has(d.id)||accused===ws)
     throw Error('Choose a connected human player to report.');
    const authenticated=accused.account&&accounts.user(accused.accountToken)?.toLowerCase();
    const name=String(r.hb.getPlayer(d.id)?.name||accused.name||'Player')
     .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/g,'').trim().slice(0,25);
    try{
     playerReports.submit({room:r.id,from:reporter,to:authenticated||null,
      nick:name,reason:d.reason,note:d.note});
     send(ws,{type:'playerReportStatus',ok:true});
    }catch(error){
     send(ws,{type:'playerReportStatus',ok:false,
      message:String(error?.message||'Report unavailable.').slice(0,160)});
    }
    return;
   }
   if(d.type==='chat'){
    const mutedUntil=r.chatMutes.get(ws.playerId)||0;
    if(mutedUntil>now){
     if(!ws.lastChatMuteNotice||now-ws.lastChatMuteNotice>3000){
      ws.lastChatMuteNotice=now;
      send(ws,{type:'chatModeration',muted:true,until:mutedUntil});
     }
     return;
    }
    if(mutedUntil){r.chatMutes.delete(ws.playerId);roomControl(r);}
    // Room-authoritative chat works with server and peer-hosted simulations;
    // a client cannot impersonate the sender, name, room or player ID.
    if(r.sockets.get(ws.playerId)!==ws||typeof d.text!=='string'||
       d.text.length<1||d.text.length>140||!d.text.trim()||
       /[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/.test(d.text))
     throw Error('Chat message must be 1–140 printable characters.');
    const recent=(ws.chatTimes||[]).filter(t=>now-t<10000);
    if(recent.length>=4)throw Error('Chat is too fast. Try again shortly.');
    recent.push(now);ws.chatTimes=recent;
    // Preserve the established native room dispatch/error envelope. Its
    // legacy text-only chat emission is suppressed by the outbound adapter,
    // and replaced below with the validated room- and sender-scoped packet.
    r.message(ws.playerId,d,r.hostTime(fraction()));
    const name=String(r.hb.getPlayer(ws.playerId)?.name||ws.name||'Player')
     .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/g,'').trim().slice(0,25)||'Player';
    const message={type:'chat',room:r.id,from:ws.playerId,name,text:d.text.trim(),at:now};
    for(const peer of r.sockets.values())send(peer,message);
    return;
   }
   if(d.type==='leave'){ws.intentionalLeave=true;ws.close(1000,'Left room');return;}
   if(d.type==='latencyReply'){
    // A reply counts only for a server-issued single-use nonce on this socket.
    // Client-submitted RTT figures never enter the roster measurements.
    const pending=ws.pendingLatency;
    if(pending&&typeof d.nonce==='string'&&d.nonce===pending.nonce){
     const elapsed=Date.now()-pending.at;
     ws.pendingLatency=null;
     if(elapsed>=0&&elapsed<=10000){ws.measuredLatency=elapsed;ws.measuredLatencyAt=Date.now();}
    }
    return;
   }
   if(d.type==='signal'){const to=r.sockets.get(Number(d.to));if(to&&to.mesh&&ws.mesh)send(to,{type:'signal',from:ws.playerId,data:d.data});return;}
   if(d.type==='rtt'){const peers={};for(const [k,v]of Object.entries(d.peers||{}))if(r.sockets.has(Number(k))&&Number.isFinite(v)&&v>=0&&v<5000)peers[k]=v;r.reports.set(ws.playerId,{server:Number.isFinite(d.server)?d.server:null,peers,eligible:d.eligible===true,at:now});return;}
   if(['hostOut','standby','released','hostRelease'].includes(d.type)){fromHost(r,ws,d);return;}
   if(r.authority!=='server'){
    // A browser hosts: keep every input for the standby copy and pass everything on to the host.
    if(d.type==='in'){try{r.message(ws.playerId,d,r.frame);}catch{}if(ws.playerId!==r.authority)send(hostSocket(r),{type:'hostIn',from:ws.playerId,d});return;}
    send(hostSocket(r),{type:'hostIn',from:ws.playerId,d});return;}
   r.message(ws.playerId,d,r.hostTime(fraction()));
  }catch(e){const message=typeof e?.message==='string'&&e.message.trim()?e.message:'Invalid room request.';send(ws,{type:'error',message});}});});
 const fraction=()=>accumulator/(1000/60);
 function tickRoom(r){r.clock++;
  if(r.authority==='server'){let n=0;while(r.frame<r.clock&&n++<240)r.step();
   const m=r.migration;if(m&&m.from==='server'&&m.to!=='server'&&r.frame>=m.frame){if(r.sockets.has(m.to))takeover(r,m.to,r.exportState());else{r.migration=null;announce(r,'server');}}}
  else{const m=r.migration,late=m?Date.now()-m.started>3000+standbyTimeout:Date.now()-r.standbyAt>standbyTimeout;if(late)failover(r,m?'release timeout':'standby timeout');}
  if(r.clock%60===0)election(r);}
 let previous=performance.now(),accumulator=0,frame=0;const timer=setInterval(()=>{const now=performance.now();accumulator+=Math.min(250,now-previous);previous=now;let advanced=false;while(accumulator>=1000/60){for(const r of rooms.values())tickRoom(r);accumulator-=1000/60;frame++;advanced=true;}if(advanced&&frame%120===0){
   quickMatch.drainAll();
   parties?.purge();
   for(const [id,pending]of partyPending)
    if(Date.now()>pending.expiresAt||
      ![...pending.sockets.entries()].every(([user,socket])=>
        socket.readyState===1&&accounts.user(socket.accountToken)?.toLowerCase()===user))
     cancelPendingParty(id,'The party could not gather on the server in time.');
  }if(advanced&&frame%600===0)for(const ws of clients)if(Date.now()-ws.lastSeen>45000)ws.close(1001,'Timeout');},4);timer.unref();
 // Give every admitted human an independently measured WebSocket round-trip
 // without trusting claimed ping values or revealing cross-room identities.
 const latencyTimer=setInterval(()=>{
  const now=Date.now();
  for(const r of rooms.values()){
   const samples=[];
   for(const [id,ws] of r.sockets){
    if(ws.readyState!==1)continue;
    if(!ws.pendingLatency||now-ws.pendingLatency.at>10000){
     const nonce=crypto.randomBytes(12).toString('hex');
     ws.pendingLatency={nonce,at:now};
     send(ws,{type:'latencyProbe',nonce});
    }
    if(samples.length<256){
     const age=now-(ws.measuredLatencyAt||0);
     samples.push([id,Number.isSafeInteger(ws.measuredLatency)&&age>=0&&age<15000?ws.measuredLatency:null]);
    }
   }
   if(!samples.length)continue;
   const packet={type:'latencyRoster',samples,measuredTo:'server',truncated:r.sockets.size>256};
   for(const ws of r.sockets.values())send(ws,packet);
  }
 },5000);latencyTimer.unref();
 const close=()=>new Promise(resolve=>{
  shuttingDown=true;clearInterval(timer);clearInterval(latencyTimer);quickMatch.close();
  // Graceful WebSocket close first; do not strand shutdown forever if a raw
  // upgrade or HTTP keep-alive client ignores the closing handshake.
  for(const ws of clients)ws.close();
  for(const r of rooms.values()){for(const p of r.parked.values())clearTimeout(p.timer);r.parked.clear();r.destroy();}rooms.clear();
  const watchdog=setTimeout(()=>{
   for(const ws of clients)ws.socket.destroy();
   for(const socket of openSockets)socket.destroy();
   server.closeAllConnections?.();
  },500);
  server.close(()=>{clearTimeout(watchdog);resolve();});
 });return{server,rooms,close,listen:(port=options.port||3417,host=options.host||'127.0.0.1')=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address())))};
}
module.exports={createServer};if(require.main===module){const app=createServer();app.listen(Number(process.env.PORT)||3417,process.env.HOST||'0.0.0.0').then(a=>console.log('Fuckball headless server: http://'+a.address+':'+a.port));for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>app.close().then(()=>process.exit(0)));}
