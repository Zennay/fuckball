 'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../shared/physics'),AI=require('../shared/bot');
function setup(){
  const g=P.createGame({scoreLimit:99,timeLimit:99});g.freeze=0;
  P.addPlayer(g,P.player('bot','Rival',1));P.addPlayer(g,P.player('human','Player',2));
  g.kickoffActive=false;
  return {g,bot:g.players[0]};
}
test('AI approaches ball from behind and shoots toward opponent goal',()=>{
  const {g,bot}=setup();
  const control=AI.decide(g,bot);
  assert.ok(control.x>0.7,'red AI should advance toward midfield');
  assert.equal(control.kick,false,'do not shoot from across the field');
  bot.x=g.ball.x-P.PLAYER_R-P.BALL_R-2;bot.y=g.ball.y;
  assert.equal(AI.decide(g,bot).kick,true,'aligned close ball should trigger a well-timed shot');
});
test('AI circles around a ball when on the wrong side instead of own-goaling',()=>{
  const {g,bot}=setup();bot.x=g.ball.x+30;bot.y=g.ball.y;
  const result=AI.decide(g,bot);
  assert.ok(result.y!==0,'must sidestep the ball rather than charging into it from behind');
  assert.equal(result.kick,false);
});
test('AI prediction accounts for the faster ball and wall reflections',()=>{
  const {g}=setup();g.ball.x=P.CX;g.ball.y=P.TOP+P.BALL_R+3;
  g.ball.vx=4;g.ball.vy=-8;
  const f=AI.forecast(g,5);
  assert.ok(f.x>g.ball.x+4*5*0.98*1.1,'forecast must include 20% speed multiplier');
  assert.ok(f.y>=P.TOP+P.BALL_R);
  assert.ok(f.vy>0,'predict top wall rebound');
});
test('AI can score within twenty seconds of play against a stationary opponent',()=>{
  const {g,bot}=setup();let kicks=0;
  for(let i=0;i<1200&&!g.score[0];i++){
    P.setInput(bot,AI.decide(g,bot));
    if(bot.input.kick)kicks++;
    P.tick(g);
  }
  assert.ok(kicks>=4,`practice bot should shoot more than once, got ${kicks}`);
  assert.ok(g.score[0]>=1,'AI should finish an uncontested attack instead of stalling');
});
test('AI uses finite normalized controls in tricky corner and fast-ball positions',()=>{
  const {g,bot}=setup();
  for(const [x,y,vx,vy] of [[P.LEFT+10,P.TOP+10,-10,-6],[P.RIGHT-10,P.BOTTOM-10,10,6],[P.CX,P.CY,0,0], [P.LEFT+40,P.CY,-20,2]]){
    Object.assign(g.ball,{x,y,vx,vy});
    const cmd=AI.decide(g,bot);
    assert.ok(Number.isFinite(cmd.x)&&Number.isFinite(cmd.y));
    assert.ok(Math.hypot(cmd.x,cmd.y)<=1.000001);
    assert.equal(typeof cmd.kick,'boolean');
  }
});
test('practice bot responds to questions using current game context, without network APIs',()=>{
  const {g,bot}=setup();
  assert.match(AI.reply('hi',g,bot),/Ready|round/i);
  assert.match(AI.reply('what is the score?',g,bot),/0–0/);
  assert.match(AI.reply('hoe werkt extrapolation?',g,bot),/\/extrapolation 135/);
  assert.match(AI.reply('how do I shoot?',g,bot),/Space/);
  assert.match(AI.reply('what map?',g,bot),/BFF Big v4/);
  assert.match(AI.reply('hi again, tell me anything',g,bot),/I hear you|ball/);
  g.score=[1,2];
  assert.match(AI.reply('score',g,bot),/1–2/);
});
test('bot covers the goal lane when an incoming ball passes behind it',()=>{
  const {g,bot}=setup();
  bot.x=P.CX-320;bot.y=P.CY+110;
  g.ball.x=P.CX-430;g.ball.y=P.CY-25;g.ball.vx=-5;g.ball.vy=0;
  const cmd=AI.decide(g,bot);
  assert.ok(cmd.y<0,'bot should move up to cover the incoming shot lane');
  assert.ok(Number.isFinite(cmd.x)&&Math.hypot(cmd.x,cmd.y)<=1.00001);
  assert.equal(cmd.kick,false,'bot must not shoot at a distant ball');
});
test('bot can still finish a match and does not randomly hold kick',()=>{
  const {g,bot}=setup();
  let kickHeld=0,turns=0;
  for(let i=0;i<1100&&!g.score[0];i++){
    const control=AI.decide(g,bot);P.setInput(bot,control);
    if(control.kick)kickHeld++;
    turns++;
    P.tick(g);
  }
  assert.ok(g.score[0]>0,'bot should score when unopposed');
  assert.ok(kickHeld<turns/3,'bot should not hold kick continuously while chasing');
});

test('4v4 AI assigns one interceptor while others cover or offer passing lanes',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  for(let i=0;i<4;i++)P.addPlayer(g,P.player('red'+i,'Red '+i,1));
  for(let i=0;i<4;i++)P.addPlayer(g,P.player(i===0?'solo':'blue'+i,'Blue '+i,2));
  g.ball.x=P.CX-170;g.ball.y=P.CY+10;
  const moves=g.players.filter(p=>p.team===1).map(p=>({p,cmd:AI.decide(g,p)}));
  for(const {cmd} of moves){
    assert.ok(Number.isFinite(cmd.x)&&Number.isFinite(cmd.y));
    assert.ok(Math.hypot(cmd.x,cmd.y)<=1.00001);
  }
  const unique=new Set(moves.map(({cmd})=>Math.round(cmd.x*10)+','+Math.round(cmd.y*10)));
  assert.ok(unique.size>=2,'team must not blindly chase the exact same position');
});

test('AI aims a pass into a teammate running ahead instead of always shooting at goal',()=>{
  const {g,bot}=setup();
  bot.x=P.CX-65;bot.y=P.CY;
  g.ball.x=P.CX;g.ball.y=P.CY;
  const alone=AI.decide(g,bot);
  const receiver=P.player('receiver','Receiver',1);P.addPlayer(g,receiver);
  receiver.x=P.CX+180;receiver.y=P.CY+120;receiver.vy=.4;
  const passing=AI.decide(g,bot);
  assert.ok(passing.y<alone.y-.05,
    'chaser should steer behind the ball toward the forward team-mate passing lane');
  assert.equal(passing.kick,false,'do not blindly kick at a distant ball');
});

test('non-chasing AI supports dynamically and keeps moving while the ball is stationary',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const striker=P.player('striker','Striker',1),wing=P.player('wing','Wing',1),cover=P.player('cover','Cover',1);
  P.addPlayer(g,striker);P.addPlayer(g,wing);P.addPlayer(g,cover);
  Object.assign(striker,{x:P.CX-20,y:P.CY});
  Object.assign(wing,{x:P.CX+90,y:P.CY+20});
  Object.assign(cover,{x:P.GOAL_LEFT+100,y:P.CY});
  const a=AI.decide(g,wing);
  g.tick=155;
  const b=AI.decide(g,wing);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>.005,
    'support movement should adjust passing lanes over time instead of staying frozen');
});

test('AI interceptor selection stays stable across small teammate distance changes',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const a=P.player('a','A',1),b=P.player('b','B',1);
  P.addPlayer(g,a);P.addPlayer(g,b);
  a.x=P.CX-50;a.y=P.CY;b.x=P.CX-70;b.y=P.CY;
  AI.decide(g,a);
  assert.equal(g.aiChasers[1],'a');
  b.x=P.CX-40;AI.decide(g,b);
  assert.equal(g.aiChasers[1],'a','a marginally closer teammate must not flip the role');
  a.x=P.CX-240;AI.decide(g,b);
  assert.equal(g.aiChasers[1],'b','a materially closer interceptor should take over');
});
test('AI treats a player obstructing the pass lane as a reason not to pass',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const attacker=P.player('red','Red',1),defender=P.player('blue','Blue',2);
  P.addPlayer(g,attacker);P.addPlayer(g,defender);
  const x=P.CX,y=P.CY;
  Object.assign(defender,{x:x+100,y:y+60});
  assert.equal(AI.laneClear(g,x,y,x+200,y+120,1),false);
  defender.y=y+180;
  assert.equal(AI.laneClear(g,x,y,x+200,y+120,1),true);
});
test('AI teammate roles stay active when human is close to possession',()=>{
  const g=P.createGame();g.freeze=0;g.kickoffActive=false;
  const solo=P.player('solo','You',2),a=P.player('support-a','A',2),b=P.player('support-b','B',2);
  for(const p of [solo,a,b])P.addPlayer(g,p);
  solo.x=P.CX-18;solo.y=P.CY;
  a.x=P.CX-130;a.y=P.CY+60;
  b.x=P.CX-150;b.y=P.CY-60;
  const first=AI.decide(g,a),second=AI.decide(g,b);
  assert.ok(Math.hypot(first.x,first.y)>0.1||Math.hypot(second.x,second.y)>0.1);
  assert.ok([a.id,b.id].includes(g.aiChasers[2]),'AI retains a reserve interceptor');
});
