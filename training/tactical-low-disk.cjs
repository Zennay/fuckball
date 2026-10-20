'use strict';
// When the neural-data trainer reaches its conservative 10 GiB reserve,
// tactical profiles can still evolve without writing 192 match shards.
// This is TRAINING-ONLY: no game bundle, production release, or live pointer writes.
const fs=require('node:fs');
const path=require('node:path');
const AI=require('../dist/ai/policy.js');
const SP=require('../dist/ai/selfplay.js');
const {makeRoom}=require('./selfplay.cjs');
const {checkedProfile,readCheckpoint}=require('./tactical-champion.cjs');

const PARAMETER_KEYS=Object.keys(AI.defaultProfile);
const MIN_DISK_BYTES=5*1024**3;
function atomicWrite(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  fs.renameSync(temp,file);
}
async function evolve({root,seed,save,run,shouldStop}){
  if(typeof save!=='function'||typeof run!=='function'||typeof shouldStop!=='function')
    throw Error('Bounded parent training callbacks required');
  const disk=fs.statfsSync(root);
  if(disk.bavail*disk.bsize<MIN_DISK_BYTES){
    save({status:'paused',activeStage:'idle',reason:'low disk space: neural reserve; tactical minimum 5 GiB',tacticalParameterKeys:PARAMETER_KEYS});
    return;
  }
  const champion=path.join(root,'latest-team-profile.json');
  const previous=fs.existsSync(champion)?readCheckpoint(champion):null;
  const current=previous?checkedProfile(previous.profile):checkedProfile(AI.defaultProfile);
  const cycleDir=path.join(root,'tactical-evolution');
  fs.mkdirSync(cycleDir,{recursive:true});
  // Single named scratch slot. The sole full trainer process owns the global lock,
  // so no concurrent worker may overwrite it. Preserve reports after each cycle.
  const teamFile=path.join(cycleDir,'candidate-team.json');
  const reportFile=path.join(cycleDir,'latest-ladder.json');
  save({status:'tactical-training',activeStage:'frozen-live '+PARAMETER_KEYS.length+'-parameter tactical evolution',
    reason:'neural training waiting for 10 GiB disk reserve',
    tacticalParameterKeys:PARAMETER_KEYS,
    tacticalEvolutionUpdatedAt:new Date().toISOString()});
  const team=await SP.train(makeRoom,{
    generations:2,frames:600,validationSeeds:2,seed,initial:current
  },()=>{});
  if(shouldStop())return;
  const profile=checkedProfile(team.profile);
  atomicWrite(teamFile,{...team,profile});
  // Re-use the independent, side-swapped ladder; never trust a self-play
  // optimisation score alone as evidence of a better tactical champion.
  const result=await run(process.execPath,[
    'training/tactical-champion.cjs',teamFile,champion,reportFile,
    String((seed+13579)>>>0),'600'
  ],process.env);
  if(shouldStop())return;
  if(result.code!==0)throw Error('Low-disk tactical champion tournament failed: '+result.code+'/'+result.signal);
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  if(report.schema!=='fuckball-tactical-ladder-v1'||
     typeof report.gate?.selectedForTraining!=='boolean')throw Error('Malformed tactical research gate');
  save({status:'paused',activeStage:'tactical cycle checkpointed',
    reason:'neural training waiting for 10 GiB disk reserve; tactical evolution operating',
    tacticalParameterKeys:PARAMETER_KEYS,
    lastTacticalCandidateAccepted:report.gate.selectedForTraining,
    tacticalGateReasons:report.gate.reasons,
    tacticalScoreRate:report.againstIncumbent?.scoreRate??null,
    tacticalGoalDifference:report.againstIncumbent?.goalDifference??null,
    tacticalChampionSourceCycle:report.gate.selectedForTraining
      ?path.basename(path.dirname(teamFile)):previous?.sourceCycle??null,
    livePromoted:false});
  return report;
}
module.exports={evolve,PARAMETER_KEYS,MIN_DISK_BYTES};
