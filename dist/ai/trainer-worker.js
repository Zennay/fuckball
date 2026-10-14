'use strict';
self.window=self;
importScripts('../vendor/json5.min.js','../vendor/pako-jszip.min.js','../vendor/haxball.js','policy.js','learning.js');
const API=abcHaxballAPI(self),{Replay,Utils}=API;
async function decode(file,collect){
 const bytes=new Uint8Array(file.bytes),data=Replay.readAll(bytes);if(data.totalFrames>1080000)throw Error('Replay exceeds 5 hours.');
 const summary={name:file.name,map:data.roomData.stadium.name,frames:data.totalFrames,duration_seconds:data.totalFrames/60,players:0,goals:0,kicks:0,samples:0,redGoals:0,blueGoals:0};
 const rows=[],players=new Set(),inputs=new Map();let reader,seen=0,seed=1337;
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{reader?.destroy();reject(Error('Replay analysis timed out.'));},120000);function finish(error){clearTimeout(timeout);reader?.destroy();error?reject(error):resolve();}
  try{reader=Replay.read(bytes,{onPlayerInputChange:(id,input)=>inputs.set(id,input),onTeamGoal:t=>{summary.goals++;summary[t===1?'redGoals':'blueGoals']++;},onPlayerBallKick:()=>summary.kicks++,onGameTick:()=>{
   if(reader.getCurrentFrameNo()%6)return;const state=reader.state;
   for(const p of state.players){if(!p.disc||![1,2].includes(p.team.id))continue;players.add(p.id);const f=FuckballAI.features(state,p.id);if(!f)continue;summary.samples++;if(!collect)continue;const action=Utils.reverseKeyState(inputs.get(p.id)??p.input??0),sign=p.team.id===1?1:-1;
    const row={x:FuckballAI.columns.map(c=>f[c]),dir:(action.dirY+1)*3+sign*action.dirX+1,kick:+!!action.kick};seen++;if(rows.length<16000)rows.push(row);else{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const k=Math.floor(seed/4294967296*seen);if(k<16000)rows[k]=row;}
   }
  }},{requestAnimationFrame:cb=>setTimeout(()=>cb(performance.now()),0),cancelAnimationFrame:clearTimeout});reader.onEnd=()=>finish();reader.setSpeed(100000);}catch(e){finish(e);}
 });summary.players=players.size;return{summary,rows};
}
self.onmessage=async({data})=>{try{const{files,train}=data;if(!files?.length||files.length>20)throw Error('Select 1–20 replays.');if(train&&files.length<3)throw Error('Training requires 3 different replays.');const fingerprints=new Set();const reports=[],splits={train:[],validation:[],test:[]};
 for(let i=0;i<files.length;i++){if(files[i].bytes.byteLength>32*1024*1024)throw Error('Replay exceeds 32 MB.');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',files[i].bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(fingerprints.has(digest))throw Error('Duplicate replay. Select different matches.');fingerprints.add(digest);
  postMessage({type:'progress',percent:i/files.length*(train?30:100),text:'Reading replay: '+files[i].name});const result=await decode(files[i],train);result.summary.sha256=digest;result.summary.split=train?(i===files.length-1?'test':i===files.length-2?'validation':'train'):'analysis';reports.push(result.summary);if(train)splits[result.summary.split].push(...result.rows);
 }
 let model=null;if(train){model=await FuckballLearning.train(splits,FuckballAI.columns,p=>postMessage({type:'progress',percent:30+p.percent*.7,text:'Training · epoch '+p.epoch+'/'+p.epochs}));model.training.replays=reports.map(r=>({sha256:r.sha256,split:r.split,map:r.map}));FuckballAI.validateModel(model);}
 postMessage({type:'done',report:{schema:'fuckball-replay-report-v1',replays:reports,model_metrics:model?.source_metrics||null,limitations:'Prediction accuracy is not win rate. Candidate model.'},model});
 }catch(e){postMessage({type:'error',message:e.message||String(e)});}};
