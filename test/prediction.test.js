 'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../shared/physics');
const {predictView}=require('../shared/prediction');
function state(){const g=P.createGame();g.freeze=0;g.ball.vx=5;const p=P.player('red','R',1);P.addPlayer(g,p);p.vx=1;return P.snapshot(g);}
test('zero extrapolation leaves rendered state untouched',()=>{
  const s=state();assert.equal(predictView(s,0),s);
});
test('extrapolation projects player and ball ahead without mutating server state',()=>{
  const s=state(),before=JSON.stringify(s),view=predictView(s,100);
  assert.ok(view.ball.x>s.ball.x);assert.ok(view.players[0].x>s.players[0].x);
  assert.equal(JSON.stringify(s),before);assert.equal(view.score[0],0);
});
test('extrapolated ball obeys pitch walls with softened bounce',()=>{
  const s=state();s.ball.y=P.TOP+11;s.ball.vy=-7;
  const v=predictView(s,120);assert.ok(v.ball.y>=P.TOP+P.BALL_R);
  assert.ok(v.ball.vy>0,'ball must bounce downward');
});
test('extrapolation pauses cleanly and clamps extreme values',()=>{
  const s=state();s.phase='paused';assert.equal(predictView(s,150),s);
  s.phase='playing';assert.equal(predictView(s,-100),s);
  assert.equal(predictView(s,Infinity),s);
  const a=predictView(s,250),b=predictView(s,100000);
  assert.equal(a.ball.x,b.ball.x);
});

test('forward extrapolation bounces off players instead of passing through them',()=>{
  for(const aheadMs of [20,40,60,100,150,200]){
    const g=P.createGame();g.freeze=0;g.kickoffActive=false;
    const p=P.player('blocker','Blocker',2);P.addPlayer(g,p);
    p.x=P.CX;p.y=P.CY;p.vx=0;p.vy=0;
    g.ball.x=p.x-47;g.ball.y=p.y;g.ball.vx=8;g.ball.vy=0;
    const view=predictView(P.snapshot(g),aheadMs);
    const v=view.players[0];
    assert.ok(Math.hypot(view.ball.x-v.x,view.ball.y-v.y)>=P.PLAYER_R+P.BALL_R-0.002,`overlap at ${aheadMs} ms`);
    assert.ok(view.ball.x<v.x,`ball tunneled through the defender at ${aheadMs} ms`);
  }
});

test('high-speed extrapolation cannot skip an entire player in a tick',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const p=P.player('blocker','Blocker',2);P.addPlayer(g,p);p.x=P.CX;p.y=P.CY;
  g.ball.x=P.CX-45;g.ball.y=P.CY;g.ball.vx=90;
  const before=JSON.stringify(P.snapshot(g));
  const view=predictView(P.snapshot(g),1000/60);
  assert.ok(view.ball.x<view.players[0].x,'fast ball should contact defender rather than emerge behind');
  assert.ok(Math.hypot(view.ball.x-view.players[0].x,view.ball.y-view.players[0].y)>=P.PLAYER_R+P.BALL_R-0.002);
  assert.equal(JSON.stringify(P.snapshot(g)),before,'projection cannot alter authoritative simulation');
});

test('fractional high-refresh predictions change position and keep ball outside player',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const p=P.player('blocker','Blocker',2);P.addPlayer(g,p);p.x=P.CX;p.y=P.CY;
  g.ball.x=p.x-P.PLAYER_R-P.BALL_R-0.8;g.ball.y=p.y;g.ball.vx=5;
  const base=P.snapshot(g);
  const results=[1000/240,1000/144,1000/120,1000/60].map(dt=>predictView(base,dt));
  for(const view of results){
    assert.notEqual(view.ball.x,base.ball.x,'sub-tick position should change on high-Hz displays');
    assert.ok(Math.hypot(view.ball.x-view.players[0].x,view.ball.y-view.players[0].y)>=P.PLAYER_R+P.BALL_R-0.002,'fractional rendering cannot overlap');
  }
});

test('snapshot interpolation avoids rendering a ball inside a player',()=>{
  const Prediction=require('../shared/prediction');
  const g=P.createGame();g.freeze=0;
  const p=P.player('b','Blocker',2);P.addPlayer(g,p);p.x=P.CX;p.y=P.CY;
  g.ball.x=p.x-26;
  const a=P.snapshot(g),b=JSON.parse(JSON.stringify(a));b.ball.x=p.x-19;
  const aBefore=JSON.stringify(a),bBefore=JSON.stringify(b);
  const mid=Prediction.interpolateView(a,b,0.9);
  assert.ok(Math.hypot(mid.ball.x-mid.players[0].x,mid.ball.y-mid.players[0].y)>=P.PLAYER_R+P.BALL_R-0.002);
  assert.equal(JSON.stringify(a),aBefore);assert.equal(JSON.stringify(b),bBefore);
});

test('unlocked 60/120/144/240/360 Hz drawing advances identical 60 Hz gameplay ticks',()=>{
  const {advanceFixed,TICK_MS}=require('../shared/prediction');
  const samples=[];
  for(const hz of [60,120,144,240,360]){
    let accumulator=0,ticks=0,visualFrames=0;
    const simTicks=[];
    for(let i=0;i<hz*10;i++){
      const result=advanceFixed(accumulator,1000/hz,()=>ticks++);
      accumulator=result.accumulator;
      visualFrames++;
      if(i===Math.floor(hz*5)-1)simTicks.push(ticks);
    }
    assert.equal(ticks,600,`physics must advance 600 ticks over ten seconds at ${hz} FPS`);
    assert.equal(simTicks[0],300,`physics must advance 300 ticks over five seconds at ${hz} FPS`);
    assert.ok(accumulator<TICK_MS);
    samples.push(visualFrames);
  }
  assert.deepEqual(samples,[600,1200,1440,2400,3600]);
});

test('visual extrapolation preserves remote held-kick indicator without inventing phantom input',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const p=P.player('remote','Remote',1);P.addPlayer(g,p);
  P.setInput(p,{kick:true});P.tick(g);
  const base=P.snapshot(g);
  assert.equal(base.players[0].kicking,true);
  for(const extrapMs of [20,50,120,200]){
    const view=predictView(base,extrapMs);
    assert.equal(view.players[0].kicking,true,`remote held shot disappeared at ${extrapMs} ms`);
  }
  P.setInput(p,{kick:false});P.tick(g);
  assert.equal(predictView(P.snapshot(g),100).players[0].kicking,false);
});
test('visual extrapolation rolls back a wrong forecast without changing match physics',()=>{
  const Prediction=require('../shared/prediction');
  const s=state(),authoritative=JSON.stringify(s);
  const previouslyPredicted=JSON.parse(JSON.stringify(s));
  previouslyPredicted.ball.x+=30;
  const recovered=Prediction.reconcileVisual(previouslyPredicted,s,1000/144,135);
  assert.ok(recovered.ball.x<s.ball.x+30&&recovered.ball.x>s.ball.x,
    'prediction correction should visually move toward authoritative ball');
  assert.equal(JSON.stringify(s),authoritative);
  const zero=Prediction.reconcileVisual(previouslyPredicted,s,1000/144,0);
  assert.equal(zero,s,'zero extrapolation needs no artificial delay');
  const large=JSON.parse(JSON.stringify(previouslyPredicted));large.ball.x+=100;
  assert.equal(Prediction.reconcileVisual(large,s,16,135),s,
    'large disagreement should snap safely rather than drawing a ghost');
});
