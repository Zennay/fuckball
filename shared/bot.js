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
    // In team matches only the designated interceptor actively chases.
    // Everyone else occupies a complementary passing/cover lane.
    const teammates=g.players.filter(p=>p.team===bot.team);
    const candidates=teammates.slice().sort((a,b)=>{
      const priority=p=>Math.hypot(p.x-f.x,p.y-f.y)+(p.id==='solo'?16:0);
      return priority(a)-priority(b)||String(a.id).localeCompare(String(b.id));
    });
    const chaser=candidates[0]?.id===bot.id;
    if(!chaser&&teammates.length>1){
      const support=teammates.filter(p=>p.id!==candidates[0].id)
        .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
      const slot=support.findIndex(p=>p.id===bot.id);
      if(slot===0){ // safety / keeper: never leave the near-post corridor
        tx=ownGoalX+forward*115;
        ty=clamp(f.y,P.GOAL_TOP+25,P.GOAL_BOTTOM-25);
      }else if(slot===1){ // central outlet behind the play
        tx=clamp(f.x-forward*155,P.LEFT+115,P.RIGHT-115);
        ty=clamp(P.CY+(f.y-P.CY)*0.3,P.TOP+80,P.BOTTOM-80);
      }else{ // wide passing lane, staggered to avoid colliding with support
        tx=clamp(f.x-forward*75,P.LEFT+85,P.RIGHT-85);
        ty=clamp(P.CY+(f.y<P.CY?1:-1)*185,P.TOP+55,P.BOTTOM-55);
      }
    }
    // Defense: intercept incoming shots before they reach our goal. Never run
    // toward the other end if the ball is already threatening the goal.
    const incoming=(defendingLeft?b.vx<-0.7:b.vx>0.7);
    const danger=(defendingLeft?f.x<P.CX-160:f.x>P.CX+160);
    const behindDefense=(defendingLeft?b.x<bot.x:b.x>bot.x);
    if(chaser&&incoming&&danger&&behindDefense){
      const intercept=forecast(g,Math.min(24,Math.abs((b.x-bot.x)/(b.vx||1))));
      tx=clamp(intercept.x-forward*(P.PLAYER_R+P.BALL_R+2),P.LEFT+P.PLAYER_R+7,P.RIGHT-P.PLAYER_R-7);
      ty=clamp(intercept.y,P.TOP+P.PLAYER_R,P.BOTTOM-P.PLAYER_R);
    }
    // If on the wrong side of the ball, circle around instead of repeatedly
    // pushing it toward our own net. Prefer the open side of the field.
    const side=(bot.x-b.x)*forward;
    const nearY=Math.abs(bot.y-b.y)<P.PLAYER_R+P.BALL_R+20;
    if(chaser&&side>4&&distance<135&&nearY){
      tx=b.x-forward*(P.PLAYER_R+P.BALL_R+45);
      ty=clamp(b.y+(bot.y>=b.y?1:-1)*65,P.TOP+25,P.BOTTOM-25);
    }
    // Emergency defense: cover the shooting lane instead of blindly chasing
    // the ball toward our own net. Use the projected arrival at the goal line.
    const ownHalf=defendingLeft?f.x<P.CX-220:f.x>P.CX+220;
    const towardOwn=forward*b.vx < -0.7;
    const shotLane=b.y>P.GOAL_TOP-65&&b.y<P.GOAL_BOTTOM+65;
    if(chaser&&ownHalf&&towardOwn&&shotLane&&distance>38){
      const arrival=clamp(Math.abs((ownGoalX-b.x)/(b.vx||1)),0,34);
      const future=forecast(g,arrival);
      const safeGoalX=ownGoalX+forward*58;
      const between=defendingLeft?bot.x<=b.x:bot.x>=b.x;
      if(!between){
        tx=clamp(safeGoalX,P.LEFT+P.PLAYER_R+6,P.RIGHT-P.PLAYER_R-6);
        ty=clamp(future.y,P.GOAL_TOP+12,P.GOAL_BOTTOM-12);
      }
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
    // Time a kick at the point of impact. Only pre-arm when the ball is
    // genuinely closing in within ~1 physics tick, avoiding random whiffs.
    const nx=contact>1e-6?dx/contact:forward,ny=contact>1e-6?dy/contact:0;
    const closing=(bot.vx-b.vx*P.BALL_SPEED_MULTIPLIER)*nx+(bot.vy-b.vy*P.BALL_SPEED_MULTIPLIER)*ny;
    const reach=P.PLAYER_R+P.BALL_R+P.KICK_REACH;
    const imminent=closing>0.45&&contact<=reach+Math.min(1.7,closing);
    // Support players only shoot on an immediate legal contact; teammates
    // cannot all hold X while waiting for the same predicted arrival.
    const kick=canKick&&aligned&&(chaser||contact<=reach)&&
      (contact<=reach+1||imminent) && (bot.kickCooldown||0)===0 &&
      (bot.kickHoldTicks||0)<=1;
    return {...movement,kick};
  }
  // Lightweight offline practice companion. Replies are generated locally
  // from game context; no account, API key, network call or tokens are needed.
  function reply(message,g,bot){
    const q=String(message||'').toLowerCase().trim().slice(0,160);
    const score=g?.score||[0,0],ball=g?.ball||{x:P.CX,y:P.CY};
    const distance=bot?Math.hypot(ball.x-bot.x,ball.y-bot.y):0;
    if(!q)return 'Type something and I’ll answer.';
    if(/^(hey|hi|hello|hoi|hallo|yo|sup|hey bot|hi bot)[!?. ]*$/.test(q))
      return 'Yo! Ready for another round? Try to beat me 1v1.';
    if(/(extrap|lag|ping|delay|ms|fps)/.test(q))
      return 'Use /extrapolation 135 in chat, or Esc → Video. Prediction is visual only; physics stays at 60 Hz.';
    if(/(score|stand|winning|win|lose|winn|scorebord)/.test(q))
      return `Score is ${score[0]}–${score[1]}. ${score[0]>score[1]?'I’m ahead!':score[1]>score[0]?'You’re ahead — for now.':'All tied up!'}`;
    if(/(help|how|hoe|controls|key|shoot|schiet|kick|space|bestuur)/.test(q))
      return 'WASD / arrows move, Space or X shoots. Press near contact; a long early hold no longer auto-shoots.';
    if(/(map|stadium|veld|bff)/.test(q))
      return 'We’re playing BFF Big v4 — your custom stadium. I’ll keep defending these goals.';
    if(/(defend|defens|verdedig|goalie|keep|attack|aanval|tactic|strategie)/.test(q))
      return distance<100?'I’m close to the ball. Try changing direction before you shoot.':'I’m watching the shooting lane. Attack the open side.';
    if(/(nice|goed|gg|good|wp|lekker|goal|doelpunt)/.test(q))
      return 'GG! Keep the pressure on — I’m not giving up.';
    if(/(harder|stronger|moeilijk|better|beter|easy|makkelijk|weak|zwak)/.test(q))
      return 'Challenge accepted. I’ll intercept earlier, protect my goal and time my shots.';
    if(/(bye|later|doei|ciao)/.test(q))
      return 'GG, see you next match!';
    return distance<75?'I’m right on the ball. Show me your next move!':'I hear you. Try a quick one-two off the wall — I’ll try to stop it.';
  }
  return {decide,forecast,steer,reply};
});