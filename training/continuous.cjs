'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(process.argv[2]||'training/output/continuous'),hours=Math.max(1,Math.min(72,Number(process.argv[3]||12))),episodes=192;
fs.mkdirSync(root,{recursive:true});const stateFile=path.join(root,'status.json'),lock=path.join(root,'trainer.lock');
try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);}catch{let pid;try{pid=Number(fs.readFileSync(lock));process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){fs.unlinkSync(lock);console.error('Recovered stale training lock; restart to continue.');process.exit(2);}}throw Error('Another trainer owns this output directory');}
let state={cycles:0,matches:0},stop=false;try{state={...state,...JSON.parse(fs.readFileSync(stateFile))};}catch{}
const start=Date.now(),deadline=start+hours*3600000;function save(extra){state={...state,...extra,updatedAt:new Date().toISOString()};fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2));fs.renameSync(stateFile+'.tmp',stateFile);}
function read(p){return JSON.parse(fs.readFileSync(p));}const wait=ms=>new Promise(r=>setTimeout(r,ms));
process.on('SIGTERM',()=>{stop=true;});process.on('SIGINT',()=>{stop=true;});
(async()=>{try{save({status:'starting',deadline:new Date(deadline).toISOString()});while(!stop&&Date.now()<deadline&&!fs.existsSync(path.join(root,'STOP'))){const disk=fs.statfsSync(root);if(disk.bavail*disk.bsize<10*1024**3){save({status:'paused',reason:'low disk space'});await wait(60000);continue;}
 const cycle=(state.cycles||0)+1,dir=path.join(root,'cycle-'+String(cycle).padStart(5,'0')),seed=(Date.now()+cycle*100003)>>>0,source=path.join(root,'latest-model.json'),weights=path.join(root,'latest-weights.npz');save({status:'training',activeCycle:cycle,seed,episodesPerCycle:episodes});
 const env={...process.env,OPENBLAS_NUM_THREADS:'2',OMP_NUM_THREADS:'2'};if(fs.existsSync(source)&&fs.existsSync(weights)){env.HAXLAB_SOURCE_MODEL=source;env.HAXLAB_INITIAL_WEIGHTS=weights;}
 const result=spawnSync(process.execPath,['training/haxlab_selfplay.cjs',dir,String(episodes),'10',String(seed)],{stdio:'inherit',env});if(result.status!==0){save({status:'failed',reason:'training process exited '+result.status});throw Error('Training cycle failed');}
 const metrics=read(path.join(dir,'weights/metrics.json')).untouched_test,arena=read(path.join(dir,'arena.json')),team=read(path.join(dir,'team-policy.json'));const wins=arena.matches.filter(m=>m.model_goals>m.tactical_goals).length;
 for(const [from,to]of [['candidate.json','latest-model.json'],['weights/model.npz','latest-weights.npz']]){fs.copyFileSync(path.join(dir,from),path.join(root,to+'.tmp'));fs.renameSync(path.join(root,to+'.tmp'),path.join(root,to));}
 fs.writeFileSync(path.join(root,'cycle-'+cycle+'-report.json'),JSON.stringify({cycle,seed,metrics,arena,teamPromoted:team.promoted},null,2));
 save({status:'checkpointed',cycles:cycle,matches:(state.matches||0)+episodes,directionAccuracy:metrics.direction_accuracy,kickF1:metrics.kick_f1,arenaWins:wins,arenaGames:arena.matches.length,livePromoted:false});
 // Preserve checkpoints/reports; keep only the two latest generated datasets.
 for(const name of fs.readdirSync(root))if(/^cycle-\d{5}$/.test(name)&&Number(name.slice(6))<cycle-1)fs.rmSync(path.join(root,name),{recursive:true,force:true});await wait(1000);}
 save({status:'stopped',reason:stop?'signal':Date.now()>=deadline?'training window complete':'stop file'});
 }finally{fs.rmSync(lock,{force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
