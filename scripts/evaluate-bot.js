'use strict';

/*
 * Deterministic headless AI evaluation against the exact physics and bot
 * modules used by the live BFF Big v4 game. This does not load unvalidated
 * HaxLab .npz weights or make any claims of HaxBall engine equivalence.
 *
 * Usage: node scripts/evaluate-bot.js --mode 4 --ticks 3600 --seeds 3
 */
const {createHash}=require('node:crypto');
const P=require('../shared/physics');
const baseline=require('../shared/bot');

const MODES=[1,2,4];
const MAX_TICKS=36000;
function assertInteger(name,value,min,max){
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw new RangeError(name+' must be an integer from '+min+' to '+max);
}
function randomGenerator(seed){
  let state=seed===0?0x9e3779b9:seed>>>0;
  return ()=>{
    state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/0x100000000;
  };
}
function makeGame(mode,seed){
  if(!MODES.includes(mode))throw new RangeError('mode must be 1, 2 or 4');
  assertInteger('seed',seed,0,0xffffffff);
  const game=P.createGame({scoreLimit:99,timeLimit:99});
  for(const team of [1,2])
    for(let i=0;i<mode;i++)P.addPlayer(game,P.player((team===1?'red':'blue')+i,'Bot '+team+'-'+i,team));
  game.freeze=0;
  game.announcement='';
  game.kickoffActive=false; // independent non-kickoff AI control samples
  const random=randomGenerator(seed);
  game.ball.x=P.CX+(random()-0.5)*160;
  game.ball.y=P.CY+(random()-0.5)*120;
  game.ball.vx=(random()-0.5)*2;
  game.ball.vy=(random()-0.5)*2;
  return game;
}
function requireLegalControl(input){
  if(!input||typeof input!=='object'||!Number.isFinite(input.x)||
      !Number.isFinite(input.y)||typeof input.kick!=='boolean'||
      Math.abs(input.x)>1||Math.abs(input.y)>1||
      Math.hypot(input.x,input.y)>1.000001){
    throw new TypeError('AI policy must return normalized finite {x,y,kick} controls');
  }
}
/**
 * A policy receives (game, player) and returns legal BFF movement / kick
 * controls. Neither the baseline nor candidate receives extra physics powers.
 * Episode fingerprints make future model comparisons reproducible.
 */
function evaluateEpisode({mode=4,seed=0,ticks=3600,policy=baseline.decide}={}){
  assertInteger('ticks',ticks,1,MAX_TICKS);
  if(typeof policy!=='function')throw new TypeError('policy must be a function');
  const game=makeGame(mode,seed);
  const fingerprint=createHash('sha256');
  const kicks=[0,0];
  let simulated=0,ballTravel=0;
  for(let i=0;i<ticks&&game.phase==='playing';i++){
    const prevScore=game.score.slice(),prevBall={x:game.ball.x,y:game.ball.y};
    const cooldowns=new Map(game.players.map(p=>[p.id,p.kickCooldown]));
    for(const player of game.players){
      const control=policy(game,player);
      requireLegalControl(control);
      P.setInput(player,control);
    }
    P.tick(game);
    simulated++;
    if(prevScore[0]===game.score[0]&&prevScore[1]===game.score[1])
      ballTravel+=Math.hypot(game.ball.x-prevBall.x,game.ball.y-prevBall.y);
    for(const player of game.players)
      if(player.lastKick==='full'&&player.kickCooldown>(cooldowns.get(player.id)||0))
        kicks[player.team-1]++;
    // Include the complete dynamic state, not wall-clock timing or browser FPS.
    fingerprint.update(JSON.stringify([
      game.tick,game.score,game.phase,game.ball.x,game.ball.y,game.ball.vx,game.ball.vy,
      ...game.players.map(p=>[p.id,p.x,p.y,p.vx,p.vy,p.kickCooldown,p.input.x,p.input.y,p.input.kick])
    ]));
    fingerprint.update('\n');
  }
  return {
    mode,seed,ticks:simulated,score:game.score.slice(),kicks,
    ballTravel:Number(ballTravel.toFixed(3)),
    phase:game.phase,
    fingerprint:fingerprint.digest('hex')
  };
}
function evaluateSuite({modes=MODES,seeds=[0,1,2],ticks=3600,policy=baseline.decide}={}){
  if(!Array.isArray(modes)||!modes.length||modes.some(mode=>!MODES.includes(mode)))
    throw new RangeError('modes must be a nonempty subset of 1, 2 and 4');
  if(!Array.isArray(seeds)||!seeds.length||seeds.length*modes.length>24)
    throw new RangeError('suite must contain 1 to 24 episodes');
  const episodes=[];
  for(const mode of modes)
    for(const seed of seeds)episodes.push(evaluateEpisode({mode,seed,ticks,policy}));
  return {
    engine:'fuckball-bff-big-v4',
    policy:'deterministic-rule-bot',
    episodes,
    totals:{
      episodes:episodes.length,
      ticks:episodes.reduce((a,b)=>a+b.ticks,0),
      redGoals:episodes.reduce((a,b)=>a+b.score[0],0),
      blueGoals:episodes.reduce((a,b)=>a+b.score[1],0),
      fullKicks:episodes.reduce((a,b)=>a+b.kicks[0]+b.kicks[1],0)
    }
  };
}
function cli(argv){
  let mode, ticks=3600, seeds=3;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--mode'){mode=Number(argv[++i]);}
    else if(arg==='--ticks'){ticks=Number(argv[++i]);}
    else if(arg==='--seeds'){seeds=Number(argv[++i]);}
    else if(arg==='--help'){
      process.stdout.write('Usage: node scripts/evaluate-bot.js [--mode 1|2|4] [--ticks 3600] [--seeds 3]\n');
      return;
    }else throw new Error('Unknown argument '+arg);
  }
  assertInteger('seeds',seeds,1,8);
  const result=evaluateSuite({modes:mode===undefined?MODES:[mode],
    seeds:Array.from({length:seeds},(_,i)=>i),ticks});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(require.main===module){
  try{cli(process.argv.slice(2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={makeGame,evaluateEpisode,evaluateSuite,requireLegalControl};
