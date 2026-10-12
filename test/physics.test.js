'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../shared/physics');
const fresh=(opts={})=>{const g=P.createGame(opts);g.freeze=0;return g;};
const add=(g,team=1)=>{const p=P.player('p','Player',team);P.addPlayer(g,p);return p;};
const kickSetup=(d=24)=>{const g=fresh(),p=add(g);p.x=P.CX-d;p.y=P.CY;g.kickoffActive=false;P.setInput(p,{kick:true});return {g,p};};

test('BFF Big v4 geometry and official map data are preserved',()=>{
  assert.equal(P.STADIUM.name,'BFF Big v4');
  assert.deepEqual([P.STADIUM.width,P.STADIUM.height,P.STADIUM.bg.width,P.STADIUM.bg.height],[800,350,700,320]);
  assert.deepEqual([P.LEFT,P.RIGHT,P.TOP,P.BOTTOM],[150,1550,80,720]);
  assert.deepEqual([P.OUTER_LEFT,P.OUTER_RIGHT,P.OUTER_TOP,P.OUTER_BOTTOM],[50,1650,50,750]);
  assert.ok(Math.abs(P.GOAL_LEFT-141.7)<1e-8);assert.ok(Math.abs(P.GOAL_RIGHT-1558.3)<1e-8);
  assert.deepEqual([P.GOAL_TOP,P.GOAL_BOTTOM],[315,485]);
  assert.equal(P.STADIUM.segments.length,36);
  assert.equal(P.STADIUM.vertexes.length,110);
});
test('BFF Big v4 body settings match HBS (tiny yellow ball, posts, low rebound)',()=>{
  assert.equal(P.PLAYER_R,15);assert.equal(P.BALL_R,5.8);assert.equal(P.POST_R,5.4);
  assert.equal(P.BALL.invMass,1.5);assert.equal(P.BALL.bCoef,0.412);
  assert.equal(P.PLAYER.bCoef,0);assert.ok(Math.abs(P.PLAYER.acceleration-0.121)<1e-12);
  assert.ok(Math.abs(P.PLAYER.kickingAcceleration-0.0913)<1e-12);assert.equal(P.PLAYER.kickStrength,4.545);
  assert.equal(P.DEFAULT_REBOUND,0.412);
  assert.deepEqual(P.POSTS,[[150,315],[150,485],[1550,315],[1550,485]]);
});
test('spawn and kickoff use BFF dimensions',()=>{
  const g=fresh();assert.deepEqual([g.ball.x,g.ball.y],[850,400]);
  assert.deepEqual(g.score,[0,0]);assert.equal(g.kickoffTeam,1);
  assert.equal(P.STADIUM.bg.kickOffRadius,80);
});
test('players are constrained by the planes outside the painted BFF field',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  P.setInput(p,{x:-1,y:-1});for(let i=0;i<900;i++)P.tick(g);
  assert.ok(p.x>=P.OUTER_LEFT+P.PLAYER_R-0.001);
  assert.ok(p.y>=P.OUTER_TOP+P.PLAYER_R-0.001);
  assert.ok(p.x<P.LEFT,'outer region must remain accessible');
});
test('BFF goal planes are behind x ±700 walls, and goals count in each direction',()=>{
  for(const team of [1,2]){
    const g=fresh();g.ball.x=team===1?P.GOAL_RIGHT-2:P.GOAL_LEFT+2;
    g.ball.y=P.CY;g.ball.vx=team===1?3:-3;P.tick(g);
    assert.equal(g.score[team-1],1);
    assert.equal(g.kickoffTeam,team===1?2:1);
  }
});
test('outside goal mouth the side walls bounce instead of scoring',()=>{
  const g=fresh();g.ball.x=P.RIGHT-3;g.ball.y=P.GOAL_TOP-30;
  g.ball.vx=5;P.tick(g);assert.equal(g.score[0],0);
  assert.ok(g.ball.x<=P.RIGHT-P.BALL_R+0.0001);assert.ok(g.ball.vx<0);
});
test('tiny fixed post deflects shots at goal edges',()=>{
  const g=fresh();g.ball.x=P.RIGHT-12;g.ball.y=P.GOAL_TOP;
  g.ball.vx=6;P.tick(g);
  assert.equal(g.score[0],0);assert.ok(g.ball.vx<6);
});
test('default BFF rebound is 0.412, and host rebound adjustment remains available',()=>{
  for(const factor of [0.412,0.7,1]){
    const g=fresh({rebound:factor});g.ball.y=P.TOP+P.BALL_R+1;g.ball.vy=-5;P.tick(g);
    assert.ok(Math.abs(g.ball.vy-4.95*P.wallRebound(g))<1e-8);
  }
});
test('acceleration and kick strength apply accurately, with reduced speed while kicking',()=>{
  const g=fresh(),a=add(g);g.kickoffActive=false;a.x=P.CX-450;
  P.setInput(a,{x:1});for(let i=0;i<30;i++)P.tick(g);
  const normal=a.vx;
  const h=fresh(),b=add(h);h.kickoffActive=false;b.x=P.CX-450;
  P.setInput(b,{x:1,kick:true});for(let i=0;i<30;i++)P.tick(h);
  assert.ok(normal>1&&normal<3);assert.ok(b.vx<normal);
  const {g:shot,p}=kickSetup();P.tick(shot);assert.equal(p.lastKick,'full');
  assert.ok(shot.ball.vx>4.5&&shot.ball.vx<4.7);assert.ok(p.kickCooldown>0);
});
test('early kick catches the smaller BFF ball before contact',()=>{
  const {g,p}=kickSetup(P.PLAYER_R+P.BALL_R+P.KICK_REACH-1);
  P.tick(g);assert.equal(p.lastKick,'full');assert.ok(g.ball.vx>4.5);
});
test('holding X early cannot auto-shoot when the ball arrives',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-100;P.setInput(p,{kick:true});for(let i=0;i<12;i++)P.tick(g);
  p.x=P.CX-24;P.tick(g);
  assert.equal(p.lastKick,null);
  assert.equal(p.kickCooldown,0);
  assert.equal(g.ball.vx,0,'pre-hold must not create even a baby kick');
  P.setInput(p,{kick:false});P.tick(g);
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full','re-press within shooting range still gives a full shot');
});
test('re-pressing kick after a long hold produces one full-power shot',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-100;P.setInput(p,{kick:true});for(let i=0;i<12;i++)P.tick(g);
  P.setInput(p,{kick:false});P.tick(g);p.x=P.CX-24;P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');assert.ok(g.ball.vx>4.5);
});
test('a wall-side kick has no artificial extra sideways impulse',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  g.ball.x=P.CX+40;g.ball.y=P.TOP+P.BALL_R+2;g.ball.vx=0;g.ball.vy=0;
  p.x=g.ball.x-24;p.y=g.ball.y;
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');
  assert.ok(g.ball.vx>4.5,'normal fresh press still shoots');
  assert.ok(Math.abs(g.ball.vy)<.001,'wall proximity alone must not generate a tangent rocket');
});
test('ordinary shots remain full strength near a wall',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  g.ball.x=P.CX+40;g.ball.y=P.TOP+P.BALL_R+2;
  p.x=g.ball.x-10;p.y=g.ball.y+14;
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');
});
test('kickoff barrier enforces BFF 80 radius until the kicking team touches',()=>{
  const g=fresh(),red=add(g,1),blue=add(g,2);red.x=100;blue.x=P.CX+P.PLAYER_R+1;
  P.setInput(blue,{x:-1});P.tick(g);
  assert.ok(Math.hypot(blue.x-P.CX,blue.y-P.CY)>=80+P.PLAYER_R-0.01);
  red.x=P.CX-P.PLAYER_R-P.BALL_R;red.y=P.CY;P.tick(g);
  assert.equal(g.kickoffActive,false);
});
test('network snapshots reflect exact map-specific settings',()=>{
  const g=fresh();const s=P.snapshot(g);
  assert.equal(s.rebound,0.412);assert.equal(s.ball.x,P.CX);
  assert.equal(P.createGame({rebound:0.3}).rebound,0.3);
  assert.equal(P.createGame({rebound:9}).rebound,1);
});
test('input sanitizer and freeze protect simulation stability',()=>{
  const p=P.player('x','X',1);P.setInput(p,{x:999,y:Infinity,kick:true});
  assert.deepEqual(p.input,{x:1,y:0,kick:true});
  const g=P.createGame();P.addPlayer(g,p);const x=p.x;P.tick(g);assert.equal(p.x,x);
});
test('time and score limits end matches without further ticks',()=>{
  let g=fresh({scoreLimit:1});g.ball.x=P.GOAL_RIGHT-1;g.ball.vx=3;
  P.tick(g);assert.equal(g.phase,'ended');assert.equal(g.score[0],1);
  const t=g.elapsedTicks;P.tick(g);assert.equal(g.elapsedTicks,t);
  g=fresh({timeLimit:1});g.elapsedTicks=3599;P.tick(g);
  assert.equal(g.phase,'ended');assert.equal(g.gameOverReason,'time');
});

test('fast ball crosses a full player diameter only after a resolved impact',()=>{
  const g=fresh({rebound:0.412});g.kickoffActive=false;
  const p=add(g,2);p.x=P.CX;p.y=P.CY;p.vx=0;p.vy=0;
  g.ball.x=P.CX-45;g.ball.y=P.CY;g.ball.vx=90;
  P.tick(g);
  assert.ok(g.ball.x<p.x,'continuous contact must prevent tunneling at very high speed');
  assert.ok(Math.hypot(g.ball.x-p.x,g.ball.y-p.y)>=P.PLAYER_R+P.BALL_R-0.002);
});


test('ball travels 20% faster than original physics while velocity damping stays unchanged',()=>{
  assert.equal(P.BALL_SPEED_MULTIPLIER,1.2);
  const g=fresh();g.kickoffActive=false;
  const startingX=g.ball.x,startingY=g.ball.y;
  g.ball.vx=6;g.ball.vy=2;
  P.tick(g);
  assert.ok(Math.abs(g.ball.x-startingX-6*0.99*1.2)<1e-9);
  assert.ok(Math.abs(g.ball.y-startingY-2*0.99*1.2)<1e-9);
  assert.equal(g.ball.vx,6*0.99);
  assert.equal(g.ball.vy,2*0.99);
});

test('holding shoot maintains a continuous kick indicator without ball contact and clears on release',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-220;
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,null);
  assert.equal(p.flashType,'whiff');
  assert.equal(p.highlight,1,'kick outline activates even far from the ball');
  assert.equal(p.kickCooldown,0,'visual whiffs cannot consume real ball kick cooldown');
  for(let i=0;i<9;i++)P.tick(g);
  assert.equal(p.highlight,1,'kick outline remains active without pulsing');
  const state=P.snapshot(g);
  assert.equal(state.players[0].flashType,'whiff');
  assert.equal(state.players[0].highlight,1);
  assert.equal(state.players[0].kicking,true,'network viewers see sustained shooting');
  P.setInput(p,{kick:false});P.tick(g);
  assert.equal(p.highlight,0,'outline deactivates on release');
  assert.equal(P.snapshot(g).players[0].kicking,false);
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.highlight,1,'outline activates on a new press');
});

test('every valid fresh press shoots at full strength, including grazing contacts',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-(P.PLAYER_R+P.BALL_R+P.KICK_REACH-0.2);
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');assert.equal(p.flashType,'full');
  assert.ok(g.ball.vx>P.PLAYER.kickStrength*0.99);
  P.setInput(p,{kick:false});P.tick(g);
  p.kickCooldown=0;g.ball.vx=0;p.x=g.ball.x-P.PLAYER_R-P.BALL_R-2;
  P.setInput(p,{kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');
});

// User's screenshot is a presentation change only. The pace upgrade must work
// identically for human and AI/networked players and not affect the ball.
test('player movement is precisely 10% faster in regular and held-kick modes',()=>{
  assert.equal(P.PLAYER_SPEED_MULTIPLIER,1.1);
  const stadium=P.STADIUM.playerPhysics;
  assert.ok(Math.abs(P.PLAYER.acceleration/stadium.acceleration-1.1)<1e-12);
  assert.ok(Math.abs(P.PLAYER.kickingAcceleration/stadium.kickingAcceleration-1.1)<1e-12);
  for(const kick of [false,true]){
    const g=fresh(),p=add(g);g.kickoffActive=false;p.x=P.CX-400;
    P.setInput(p,{x:1,kick});
    for(let i=0;i<60;i++)P.tick(g);
    const originalAcc=kick?stadium.kickingAcceleration:stadium.acceleration;
    const expected=originalAcc*1.1*.96*(1-.96**60)/(1-.96);
    assert.ok(Math.abs(p.vx-expected)<1e-9,`kick=${kick}: velocity should be 10% faster`);
  }
  assert.equal(P.BALL_SPEED_MULTIPLIER,1.2,'ball retains intended 20% boost');
  assert.equal(P.PLAYER.kickStrength,4.545,'kicks must not gain an accidental 10% boost');
});

test('walking ball contact transfers physical momentum but never triggers a shot',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-P.PLAYER_R-P.BALL_R-1;p.y=P.CY;p.vx=2;
  P.setInput(p,{x:0,y:0,kick:false});P.tick(g);
  assert.equal(p.lastKick,null);
  assert.ok(g.ball.vx>0,'collision transfers momentum');
  assert.ok(g.ball.vx<P.PLAYER.kickStrength,'incidental touch is not a real kick');
  assert.ok(p.vx<2*P.PLAYER.damping,'momentum is conserved between dynamic bodies');
});

test('an un-kicked ball rolls free and is never magnetically attached to a player',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-28;p.y=P.CY;
  P.setInput(p,{x:1,kick:false});
  for(let i=0;i<90;i++)P.tick(g);
  const gap=Math.hypot(g.ball.x-p.x,g.ball.y-p.y);
  assert.ok(g.ball.x>P.CX+35,'ball advances on physical contacts');
  assert.ok(gap>=P.PLAYER_R+P.BALL_R-0.02,'no permanent overlapping or sticking');
  assert.equal(p.lastKick,null,'walking never synthesizes a kick');
});

test('glancing dribbles preserve sideways rolling velocity',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-20;p.y=P.CY+7;p.vx=2;
  g.ball.vy=-0.45;
  P.setInput(p,{x:0,kick:false});
  P.tick(g);
  assert.ok(g.ball.vx>0,'player still transfers momentum into the ball');
  assert.ok(g.ball.vy< -0.45,'sideways motion must not be pinned or erased');
});

test('fast incoming balls and real kicks keep their original physical character',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX;p.y=P.CY;
  g.ball.x=p.x+P.PLAYER_R+P.BALL_R+2;
  g.ball.vx=-9;
  P.setInput(p,{kick:false});
  P.tick(g);
  assert.ok(g.ball.vx>0,'fast incoming ball should rebound, not be glued to player');
  const shot=kickSetup();P.tick(shot.g);
  assert.equal(shot.p.lastKick,'full');
  assert.ok(shot.g.ball.vx>4.5,'full-power kicks remain untouched');
});

test('approaching a ball without contact creates no magnetic pull',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-50;p.y=P.CY;p.vx=2;
  P.setInput(p,{x:1,kick:false});
  P.tick(g);
  assert.equal(g.ball.vx,0);
  assert.equal(g.ball.x,P.CX,'ball should not be attached to player until collision');
});

test('ball speed remains 1.2x while walls restore original BFF restitution',()=>{
  assert.equal(P.BALL_SPEED_MULTIPLIER,1.2);
  const g=fresh();g.kickoffActive=false;
  assert.ok(Math.abs(P.wallRebound(g)-P.WALL_REBOUND_AT_DEFAULT)<1e-12);
  assert.equal(P.wallRebound(g),P.DEFAULT_REBOUND,'native BFF rebound must never be remapped from 0.412 to 0.76');
  assert.equal(P.wallRebound(fresh({rebound:1})),1,'hard wall setting must remain capped');
});
test('diagonal wall contact does not fabricate a special rocket kick',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  g.ball.x=P.CX+40;g.ball.y=P.TOP+P.BALL_R+2;g.ball.vx=0;g.ball.vy=-0.4;
  p.x=g.ball.x-10;p.y=g.ball.y+14;p.vx=1.5;p.vy=-1.5;
  P.setInput(p,{x:1,y:-1,kick:true});P.tick(g);
  assert.equal(p.lastKick,'full');
  assert.ok(Number.isFinite(g.ball.vx)&&Number.isFinite(g.ball.vy));
});

test('visible wall collision occurs when the disc edge reaches the BFF field line',()=>{
  for(const side of ['top','bottom','left','right']){
    const g=fresh();g.kickoffActive=false;
    const axis=side==='top'||side==='bottom'?'y':'x';
    const vel=axis==='y'?'vy':'vx',boundary=side==='top'?P.TOP:side==='bottom'?P.BOTTOM:side==='left'?P.LEFT:P.RIGHT;
    const dir=side==='top'||side==='left'?-1:1;
    g.ball[axis]=boundary-dir*(P.BALL_R+0.4);g.ball[vel]=dir*5;
    if(axis==='x')g.ball.y=P.GOAL_TOP-38;else g.ball.x=P.CX+60;
    P.tick(g);
    assert.ok(Math.abs(g.ball[axis]-(boundary-dir*P.BALL_R))<1e-8,side+' ball rim should align exactly with the wall');
    assert.ok(g.ball[vel]*dir<0,side+' must bounce back');
    assert.ok(Math.abs(Math.abs(g.ball[vel])-5*P.BALL.damping*P.DEFAULT_REBOUND)<1e-8,side+' must use the native 0.412 rebound, not synthetic 76%');
  }
});

test('physical walking contact and hard incoming shot share the natural solver',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-22;p.y=P.CY;p.vx=1.5;
  P.setInput(p,{kick:false});P.tick(g);
  assert.ok(g.ball.vx>0 && g.ball.vx<4,'walking transfers bounded physical momentum');
  const incoming=fresh(),def=add(incoming);incoming.kickoffActive=false;
  def.x=P.CX;def.y=P.CY;
  incoming.ball.x=P.CX+P.PLAYER_R+P.BALL_R+2;incoming.ball.vx=-9;
  P.tick(incoming);
  assert.ok(incoming.ball.vx>0,'incoming shot must bounce and not stick');
});

// A ball already separating from a player may never be attracted back.
test('separating ball never sticks or slows to track a player',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-22;p.y=P.CY;p.vx=1;
  g.ball.vx=4;
  P.setInput(p,{x:1,kick:false});
  const before=g.ball.vx;P.tick(g);
  assert.ok(g.ball.vx<=before,'free-flight damping only');
  assert.ok(g.ball.vx>3.9,'player does not magnetically brake ball');
  assert.equal(p.lastKick,null);
});
test('holding kick for two ticks then approaching ball cannot create a half-shot',()=>{
  const g=fresh(),p=add(g);g.kickoffActive=false;
  p.x=P.CX-100;P.setInput(p,{kick:true});P.tick(g);P.tick(g);
  p.x=P.CX-24;P.tick(g);
  assert.equal(p.lastKick,null);
  assert.equal(g.ball.vx,0);
  assert.equal(p.kickCooldown,0);
});


test('swept impact completes remaining travel using the same 1.2x pace as free flight',()=>{
  const g=fresh();g.kickoffActive=false;
  const p=add(g,2);p.x=P.CX;p.y=P.CY;
  const start=P.CX-45;
  g.ball.x=start;g.ball.y=P.CY;g.ball.vx=90;
  const move=90*P.BALL.damping*P.BALL_SPEED_MULTIPLIER;
  const firstContact=(45-(P.PLAYER_R+P.BALL_R))/move;
  P.tick(g);
  const expected=p.x-(P.PLAYER_R+P.BALL_R+0.0001)+
    g.ball.vx*P.BALL_SPEED_MULTIPLIER*(1-firstContact);
  assert.ok(Math.abs(g.ball.x-expected)<0.002,
    `sweep must preserve remaining scaled displacement: ${g.ball.x} vs ${expected}`);
  assert.ok(g.ball.x<p.x,'the rebound remains on the incoming side');
});
