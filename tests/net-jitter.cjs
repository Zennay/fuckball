'use strict';
// Network quality harness: a real headless server and a scripted client behind a
// simulated link (one-way delay + jitter + occasional TCP-style stalls, always in
// order). For the own player and the ball it measures
//  - error: predicted position vs what the server really simulated at that frame;
//  - jerk:  per rendered frame, how much the shown motion differs from the true
//           motion between those frames (visible snapping / teleporting).
const{createServer}=require('../headless/server.cjs'),T=require('../dist/render-timing.js'),{HBInit}=require('../headless/runtime.cjs');
const API=HBInit({noPlayer:true})._runtime.API;
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
const stats=a=>{a=[...a].sort((x,y)=>x-y);const q=p=>a[Math.floor(p*(a.length-1))]||0;return{mean:a.reduce((s,v)=>s+v,0)/(a.length||1),p90:q(.9),p99:q(.99),max:a.at(-1)||0};};
async function run({oneWay=25,jitter=10,stall=0,seconds=12,seed=1,stamp=true,smooth=true,lead,snapshotEvery=2,snap60=false,mode}={}){
 const otherId=mode==='bot'?100:104;
 const truth=new Map();let roomId=null,me=0;
 const app=createServer({snapshotEvery:snap60?1:snapshotEvery,onStep:(frame,rooms)=>{const r=roomId&&rooms.get(roomId);if(!r)return;const s=r.hb._room.state,p=s.players.find(p=>p.id===me),o=s.players.find(p=>p.id===otherId),b=s.gameState?.physicsState.discs[0];if(p?.disc&&o?.disc&&b)truth.set(frame,{me:[p.disc.pos.x,p.disc.pos.y],ball:[b.pos.x,b.pos.y],other:[o.disc.pos.x,o.disc.pos.y]});}});
 const addr=await app.listen(0),rand=rng(seed),predictor=T.createPredictor({lead:lead??(stamp?.75:.5)}),smoother=T.createSmoother();
 const delay=()=>oneWay+jitter*(-Math.log(1-rand()))/2+(rand()<stall?200+rand()*100:0);
 const ws=new WebSocket('ws://127.0.0.1:'+addr.port+'/ws');ws.binaryType='arraybuffer';
 let outAt=0,inAt=0;const queue=[];const now=()=>performance.now();
 const send=d=>{outAt=Math.max(outAt,now()+delay());const msg=JSON.stringify(d);queue.push({at:outAt,fn:()=>ws.readyState===1&&ws.send(msg)});};
 let state=null,seq=0,input=0;
 ws.onmessage=e=>{inAt=Math.max(inAt,now()+delay());queue.push({at:inAt,fn:()=>receive(e.data)});};
 const predict=t=>predictor.predict(state,t);
 function receive(data){const t=now();if(data instanceof ArrayBuffer){const v=new DataView(data),next=API.Replay.readAll(new Uint8Array(data).slice(16)).roomData;const before=state&&smooth?T.positions(predict(t)):null;state=next;predictor.snapshot(v.getUint32(12),t,v.getUint32(8));if(before)smoother.correct(before,predict(t),t);return;}
  const d=JSON.parse(data);if(d.type==='welcome'){me=d.id;roomId=d.room;send({type:'configure',mode:mode||'4v4',started:true,scoreLimit:0,timeLimit:0});}if(d.type==='pong')predictor.pong(d.frame,d.t);}
 await new Promise(r=>ws.onopen=r);send({type:'join',create:true,name:'probe'});
 const pump=setInterval(()=>{const t=now();queue.sort((a,b)=>a.at-b.at);while(queue.length&&queue[0].at<=t)queue.shift().fn();},1);
 const ping=setInterval(()=>send({type:'ping',t:now()}),250);
 const err={me:[],ball:[],other:[]},jerk={me:[],ball:[],other:[]};let nextChange=0;const frames=[];const start=now();
 await new Promise(done=>{const tick=setInterval(()=>{const t=now();if(t-start>seconds*1000){clearInterval(tick);done();return;}
  if(!state||!predictor.pingClock.size)return;
  if(t>nextChange){nextChange=t+60+rand()*300;input=[0,1,2,4,8,5,6,9,10][Math.floor(rand()*9)]|(rand()<.15?16:0);seq++;const frame=predictor.input(seq,me,input,t);send(stamp?{type:'input',value:input,seq,frame}:{type:'input',value:input,seq});}
  if(t-start<3000)return;
  const target=Math.floor(predictor.targetFrame(t)),s=T.extrapolate(state,target-predictor.snapshotFrame,predictor.pending,predictor.snapshotFrame);if(smooth)smoother.apply(s,t);
  const p=s.players.find(p=>p.id===me),o=s.players.find(p=>p.id===otherId),b=s.gameState?.physicsState.discs[0];if(!p?.disc||!o?.disc||!b)return;
  frames.push({target,shown:{me:[p.disc.pos.x,p.disc.pos.y],ball:[b.pos.x,b.pos.y],other:[o.disc.pos.x,o.disc.pos.y]}});},8);});
 clearInterval(pump);clearInterval(ping);ws.close();await app.close();let last=null;for(const f of frames){const tr=truth.get(f.target),trPrev=last&&truth.get(last.target),shown=f.shown;
  if(tr)for(const k of ['me','ball','other'])err[k].push(Math.hypot(shown[k][0]-tr[k][0],shown[k][1]-tr[k][1]));
  if(tr&&trPrev&&f.target>last.target&&f.target-last.target<4)for(const k of ['me','ball','other'])if(Math.hypot(tr[k][0]-trPrev[k][0],tr[k][1]-trPrev[k][1])<30)jerk[k].push(Math.hypot(shown[k][0]-last.shown[k][0]-(tr[k][0]-trPrev[k][0]),shown[k][1]-last.shown[k][1]-(tr[k][1]-trPrev[k][1])));
  last=f;}
 if(process.env.DEBUG)console.log("truth",truth.size,"err",err.me.length,"state",!!state,"pings",predictor.pingClock.size,"me",me);
 const r=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,+v.toFixed(2)]));
 return{link:{oneWay,jitter,stall},errMe:r(stats(err.me)),errBall:r(stats(err.ball)),errOther:r(stats(err.other)),jerkMe:r(stats(jerk.me)),jerkBall:r(stats(jerk.ball)),jerkOther:r(stats(jerk.other))};
}
module.exports={run};
if(require.main===module)(async()=>{const opts=JSON.parse(process.argv[2]||'{}');
 if(opts.child){console.log(JSON.stringify(await run(opts)));return;}
 const{execFile}=require('node:child_process'),links=[{oneWay:20,jitter:4},{oneWay:25,jitter:15,stall:.01},{oneWay:45,jitter:30,stall:.02}],seeds=opts.seeds||4;
 const runs=await Promise.all(links.flatMap(l=>Array.from({length:seeds},(_,i)=>new Promise((ok,no)=>execFile(process.execPath,[__filename,JSON.stringify({seconds:25,...opts,...l,seed:i+1,child:true})],{timeout:120000},(e,out)=>e?no(e):ok(JSON.parse(out)))))));
 for(const l of links){const rs=runs.filter(r=>r.link.oneWay===l.oneWay);const avg=(k,q)=>+(rs.reduce((s,r)=>s+r[k][q],0)/rs.length).toFixed(2);
  console.log(l.oneWay+'ms±'+l.jitter,['errMe','errOther','errBall','jerkMe','jerkOther','jerkBall'].map(k=>k+' '+avg(k,'p90')+'/'+avg(k,'p99')+'/'+avg(k,'max')).join('  '));}})();
