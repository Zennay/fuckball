'use strict';
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('./shared/websocket');
const P=require('./shared/physics');
const PORT=Number(process.env.PORT)||3000;
const rooms=new Map();
const peers=new Map();
const files={ '/shared/stadium.js':'shared/stadium.js', '/':'public/index.html','/index.html':'public/index.html', '/shared/physics.js':'shared/physics.js', '/shared/prediction.js':'shared/prediction.js', '/shared/bot.js':'shared/bot.js' };
const server=http.createServer((req,res)=>{
  const url=(req.url||'/').split('?')[0];
  if(url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size,peers:peers.size}));return;}
  const filename=files[url];
  if(!filename){res.writeHead(404);res.end('Not found');return;}
  fs.readFile(path.join(__dirname,filename),(err,data)=>{
    if(err){res.writeHead(500);res.end('Server error');return;}
    res.writeHead(200,{'Content-Type':url.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(data);
  });
});
const wss=new WebSocketServer({server,maxPayload:2048});
const send=(ws,obj)=>{if(ws.readyState===WebSocket.OPEN)try{ws.send(JSON.stringify(obj));}catch{}};
const compactName=(v)=>String(v||'Player').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18)||'Player';
const code=()=>crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();
function broadcast(room,obj){for(const c of room.clients)send(c,obj);}
function roster(room){return Array.from(room.clients).map(c=>({id:peers.get(c).id,name:peers.get(c).name,team:peers.get(c).team}));}
function announceLobby(room){broadcast(room,{type:'lobby',code:room.code,hostId:room.hostId,players:roster(room),scoreLimit:room.scoreLimit,timeLimit:room.timeLimit,rebound:room.rebound,phase:room.game.phase});}
function sendState(room){broadcast(room,{type:'state',game:P.snapshot(room.game)});}
function leave(ws){
  const peer=peers.get(ws);if(!peer||!peer.room)return;
  const room=rooms.get(peer.room);peer.room=null;peer.team=0;
  if(!room)return;
  room.clients.delete(ws);
  room.game.players=room.game.players.filter(p=>p.id!==peer.id);
  if(room.hostId===peer.id)room.hostId=room.clients.size?peers.get(room.clients.values().next().value).id:null;
  if(room.clients.size===0){rooms.delete(room.code);return;}
  announceLobby(room);
}
function join(ws,room,name){
  if(room.clients.size>=12){send(ws,{type:'error',message:'Room full (12 players max).'});return;}
  leave(ws);
  const peer=peers.get(ws);peer.name=compactName(name);peer.room=room.code;
  // Like HaxBall: newcomers enter the spectator section and select a team.
  peer.team=0;
  room.clients.add(ws);
  if(!room.hostId)room.hostId=peer.id;
  if(peer.team)P.addPlayer(room.game,P.player(peer.id,peer.name,peer.team));
  send(ws,{type:'joined',id:peer.id,code:room.code});
  announceLobby(room);send(ws,{type:'state',game:P.snapshot(room.game)});
}
function handle(ws,msg){
  const peer=peers.get(ws);
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='create'){
    if(rooms.size>=50){send(ws,{type:'error',message:'Server room limit reached.'});return;}
    let c;do{c=code();}while(rooms.has(c));
    const game=P.createGame();game.phase='stopped';game.freeze=0;game.announcement='WAITING FOR HOST';
    const room={code:c,game,clients:new Set(),hostId:null,scoreLimit:3,timeLimit:3,rebound:P.DEFAULT_REBOUND};rooms.set(c,room);
    join(ws,room,msg.name);return;
  }
  if(msg.type==='join'){
    const c=String(msg.code||'').trim().toUpperCase().slice(0,6);
    const room=rooms.get(c);
    if(!room){send(ws,{type:'error',message:'Room not found. Check the six-character code.'});return;}
    join(ws,room,msg.name);return;
  }
  if(msg.type==='leave'){leave(ws);send(ws,{type:'left'});return;}
  const room=rooms.get(peer.room);if(!room)return;
  if(msg.type==='input'){
    const p=room.game.players.find(p=>p.id===peer.id);
    P.setInput(p,msg);return;
  }
  if(msg.type==='team'){
    const t=Number(msg.team);
    if(![0,1,2].includes(t))return;
    if(t && room.game.players.filter(p=>p.team===t&&p.id!==peer.id).length>=6){send(ws,{type:'error',message:'That team is full.'});return;}
    peer.team=t;
    room.game.players=room.game.players.filter(p=>p.id!==peer.id);
    if(t)P.addPlayer(room.game,P.player(peer.id,peer.name,t));
    announceLobby(room);sendState(room);return;
  }
  if(msg.type==='settings'&&room.hostId===peer.id){
    if(room.game.phase==='playing'){send(ws,{type:'error',message:'Stop the match before changing settings.'});return;}
    const scoreLimit=Number(msg.scoreLimit),timeLimit=Number(msg.timeLimit),rebound=msg.rebound===undefined?room.rebound:Number(msg.rebound);
    if(!Number.isInteger(scoreLimit)||!Number.isInteger(timeLimit)||scoreLimit<1||scoreLimit>99||timeLimit<1||timeLimit>99||!Number.isFinite(rebound)||rebound<0.15||rebound>1)return;
    room.scoreLimit=scoreLimit;room.timeLimit=timeLimit;room.rebound=rebound;
    room.game.scoreLimit=scoreLimit;room.game.timeLimit=timeLimit;room.game.rebound=rebound;announceLobby(room);sendState(room);return;
  }
  if((msg.type==='start'||msg.type==='reset')&&room.hostId===peer.id){
    if(!room.game.players.some(p=>p.team===1)||!room.game.players.some(p=>p.team===2)){
      send(ws,{type:'error',message:'Put at least one player on each team to start.'});return;
    }
    room.game=P.createGame({scoreLimit:room.scoreLimit,timeLimit:room.timeLimit,rebound:room.rebound});
    for(const c of room.clients){const p=peers.get(c);if(p.team)P.addPlayer(room.game,P.player(p.id,p.name,p.team));}
    announceLobby(room);sendState(room);broadcast(room,{type:'notice',message:'Match started'});return;
  }
  if(msg.type==='stop'&&room.hostId===peer.id){room.game.phase='stopped';room.game.announcement='MATCH STOPPED';announceLobby(room);sendState(room);return;}
  if(msg.type==='pause'&&room.hostId===peer.id){
    if(room.game.phase==='playing'){room.game.phase='paused';room.game.announcement='PAUSED';}
    else if(room.game.phase==='paused'){room.game.phase='playing';room.game.announcement='';}
    announceLobby(room);sendState(room);return;
  }
  if(msg.type==='chat'){
    const now=Date.now();if(now-(peer.lastChat||0)<750)return;
    const message=String(msg.message||'').replace(/[\u0000-\u001f]/g,'').trim().slice(0,160);
    if(!message)return;
    peer.lastChat=now;broadcast(room,{type:'chat',from:peer.name,message});
  }
}
wss.on('connection',(ws)=>{
  peers.set(ws,{id:crypto.randomUUID().slice(0,8),room:null,name:'Player',team:0,lastChat:0,count:0,window:Date.now()});
  ws.on('message',(data)=>{
    const peer=peers.get(ws);if(!peer)return;
    const now=Date.now();if(now-peer.window>=1000){peer.window=now;peer.count=0;}
    if(++peer.count>75){ws.close(1008,'Message rate limit');return;}
    try{handle(ws,JSON.parse(data.toString()));}catch{send(ws,{type:'error',message:'Malformed message'});}
  });
  ws.on('close',()=>{leave(ws);peers.delete(ws);});
});
let ticks=0;
setInterval(()=>{
  ticks++;
  for(const room of rooms.values()){
    const oldPhase=room.game.phase;P.tick(room.game);
    if(oldPhase!==room.game.phase)announceLobby(room);
    if(ticks%3===0)sendState(room);
  }
},1000/60);
server.listen(PORT,'0.0.0.0',()=>console.log(`Pulseball running on http://localhost:${PORT}`));