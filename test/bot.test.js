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
test('AI can score within a reasonable practice period against a stationary opponent',()=>{
  const {g,bot}=setup();let kicks=0;
  for(let i=0;i<860&&!g.score[0];i++){
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