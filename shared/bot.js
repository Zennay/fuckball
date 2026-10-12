/* Solo practice opponent: defensive positioning, predictive interceptions,
   approach from the correct side, and timed goal-directed kicks.
   Shares the authoritative BFF physics constants; never teleports or cheats. */
(function(root,factory){
  const physics=typeof module==='object'&&module.exports?require('./physics'):root.PulsePhysics;
  const api=factory(physics);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PulseBot=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const clamp=P.clamp;
  function forecast(g,steps){
    let {x,y,vx,vy}=g.ball;
    const n=clamp(Math.round(steps),0,42);
    for(let i=0;i<n;i++){
      vx*=P.BALL.damping;vy*=P.BALL.damping;
      x+=vx*P.BALL_SPEED_MULTIPLIER;y+=vy*P.BALL_SPEED_MULTIPLIER;
      if(y<P.TOP+P.BALL_R){y=P.TOP+P.BALL_R;vy=Math.abs(vy)*g.rebound;}
      if(y>P.BOTTOM-P.BALL_R){y=P.BOTTOM-P.BALL_R;vy=-Math.abs(vy)*g.rebound;}
      if(y<P.GOAL_TOP||y>P.GOAL_BOTTOM){
        if(x<P.LEFT+P.BALL_R){x=P.LEFT+P.BALL_R;vx=Math.abs(vx)*g.rebound;}
        if(x>P.RIGHT-P.BALL_R){x=P.RIGHT-P.BALL_R;vx=-Math.abs(vx)*g.rebound;}
      }
      x=clamp(x,P.OUTER_LEFT+P.BALL_R,P.OUTER_RIGHT-P.BALL_R);
    }
    return {x,y,vx,vy};
  }
  function steer(p,targetX,targetY){
    // PD steering rather than constantly chasing the moving ball. Slow down
    // BEFORE reaching the target, avoiding the old AI's chaotic orbiting.
    const dx=targetX-p.x,dy=targetY-p.y;
    let x=clamp(dx*0.065-p.vx*0.75,-1,1);
    let y=clamp(dy*0.065-p.vy*0.75,-1,1);
    const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}
    return {x,y};
  }
  function decide(g,bot){
    if(!g||!bot||bot.team!==1&&bot.team!==2)return {x:0,y:0,kick:false};
    if(g.phase!=='playing'||g.freeze>0)return {x:0,y:0,kick:false};
    const defendingLeft=bot.team===1;
    const forward=defendingLeft?1:-1;
    const ownGoalX=defendingLeft?P.GOAL_LEFT:P.GOAL_RIGHT;
    const enemyGoalX=defendingLeft?P.GOAL_RIGHT:P.GOAL_LEFT;
    const b=g.ball;
    const distance=Math.hypot(b.x-bot.x,b.y-bot.y);
    const ahead=clamp((distance-20)/2.7,3,27);
    const f=forecast(g,ahead);
    // Aim for the far side of the goal without needless sideways oscillation.
    const targetGoalY=clamp(P.CY+(f.y-P.CY)*0.27,P.GOAL_TOP+21,P.GOAL_BOTTOM-21);
    const dirLength=Math.hypot(enemyGoalX-f.x,targetGoalY-f.y)||1;
    const ux=(enemyGoalX-f.x)/dirLength,uy=(targetGoalY-f.y)/dirLength;
    const approachDist=P.PLAYER_R+P.BALL_R-1;
    let tx=f.x-ux*approachDist,ty=f.y-uy*approachDist;
    // Defense: intercept incoming shots before they reach our goal. Never run
    // toward the other end if the ball is already threatening the goal.
    const incoming=(defendingLeft?b.vx<-0.7:b.vx>0.7);
    const danger=(defendingLeft?f.x<P.CX-160:f.x>P.CX+160);
    const behindDefense=(defendingLeft?b.x<bot.x:b.x>bot.x);
    if(incoming&&danger&&behindDefense){
      const intercept=forecast(g,Math.min(24,Math.abs((b.x-bot.x)/(b.vx||1))));
      tx=clamp(intercept.x-forward*(P.PLAYER_R+P.BALL_R+2),P.LEFT+P.PLAYER_R+7,P.RIGHT-P.PLAYER_R-7);
      ty=clamp(intercept.y,P.TOP+P.PLAYER_R,P.BOTTOM-P.PLAYER_R);
    }
    // If on the wrong side of the ball, circle around instead of repeatedly
    // pushing it toward our own net. Prefer the open side of the field.
    const side=(bot.x-b.x)*forward;
    const nearY=Math.abs(bot.y-b.y)<P.PLAYER_R+P.BALL_R+20;
    if(side>4&&distance<135&&nearY){
      tx=b.x-forward*(P.PLAYER_R+P.BALL_R+45);
      ty=clamp(b.y+(bot.y>=b.y?1:-1)*65,P.TOP+25,P.BOTTOM-25);
    }
    // At kickoff only the kicking team may enter the center circle.
    if(g.kickoffActive&&g.kickoffTeam!==bot.team){
      tx=P.CX-forward*(P.STADIUM.bg.kickOffRadius+P.PLAYER_R+25);
      ty=P.CY;
    }
    tx=clamp(tx,P.OUTER_LEFT+P.PLAYER_R,P.OUTER_RIGHT-P.PLAYER_R);
    ty=clamp(ty,P.OUTER_TOP+P.PLAYER_R,P.OUTER_BOTTOM-P.PLAYER_R);
    const movement=steer(bot,tx,ty);
    const dx=b.x-bot.x,dy=b.y-bot.y;
    const contact=Math.hypot(dx,dy);
    const aligned=((dx*ux+dy*uy)/Math.max(1,contact))>0.38;
    // Re-tap for full strength only when we can actually contact the ball.
    const canKick=!g.kickoffActive||g.kickoffTeam===bot.team;
    const kick=canKick&&aligned&&contact<=P.PLAYER_R+P.BALL_R+P.KICK_REACH+1 && (bot.kickCooldown||0)===0;
    return {...movement,kick};
  }
  return {decide,forecast,steer};
});