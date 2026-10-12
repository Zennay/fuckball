'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../shared/physics');
const eps=1e-9;
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<eps,
  (message||'physics value')+': '+actual+' !== '+expected);

test('native BFF original: default wall bounce is exactly stadium bCoef',()=>{
  const native=P.STADIUM.discs[0].bCoef;
  near(native,0.412);
  near(P.DEFAULT_REBOUND,native);
  near(P.WALL_REBOUND_AT_DEFAULT,native);
  for(const rebound of [native,0.3,0.7,1]){
    const g=P.createGame({rebound});g.freeze=0;g.kickoffActive=false;
    near(P.wallRebound(g),rebound,'host choice is a physical coefficient');
    g.ball.x=P.CX+100;
    g.ball.y=P.TOP+P.BALL_R+0.1;
    g.ball.vy=-5;
    P.tick(g);
    near(g.ball.y,P.TOP+P.BALL_R,'rim meets visible top border');
    near(g.ball.vy,5*P.BALL.damping*rebound,'one real rebound, no remap');
  }
});

test('un-kicked slow player contact matches the original disc impulse without phantom shots',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const p=P.player('red','Red',1);P.addPlayer(g,p);
  p.x=P.CX-22;p.y=P.CY;p.vx=1.5;p.vy=0;
  P.setInput(p,{x:0,y:0,kick:false});
  const prevVX=p.vx;
  P.tick(g);
  assert.equal(p.lastKick,null);
  assert.ok(g.ball.vx>0 && g.ball.vx<P.PLAYER.kickStrength,
    'collision transfers physical impulse only, never fires a hidden shot');
  assert.ok(p.vx<prevVX,'the player loses momentum to the ball');
  assert.equal(p.kickCooldown,0);
});

test('original rebound restoration does not turn held Space into a delayed half-shot',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const p=P.player('red','Red',1);P.addPlayer(g,p);
  p.x=P.CX-120;
  P.setInput(p,{kick:true});for(let i=0;i<12;i++)P.tick(g);
  p.x=P.CX-24;P.tick(g);
  assert.equal(p.lastKick,null);
  assert.equal(p.kickCooldown,0);
  assert.equal(g.ball.vx,0);
  P.setInput(p,{kick:false});P.tick(g);
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');
});
