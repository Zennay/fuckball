/* Collision-aware client rendering for Pulseball BFF Big v4.
   Always uses the same 60 Hz solver as the game. Extrapolation never writes to authoritative state.
   Fractional-tick visual interpolation lets requestAnimationFrame draw at the display's native refresh rate. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PulsePrediction=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const P=typeof globalThis!=='undefined'&&globalThis.PulsePhysics||(typeof require==='function'?require('./physics'):null);
  const TICK_MS=1000/60;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const mix=(a,b,t)=>a+(b-a)*t;

  function copyState(state){
    return {...state,ball:{...state.ball},players:state.players.map(p=>({...p}))};
  }

  // The source of the clipping bug: old prediction projected the ball and players
  // separately, skipping ball/player/post impacts. This now uses P.tick on a clone.
  function simulationFromSnapshot(state,options={}){
    const game=P.createGame({rebound:state.rebound,scoreLimit:state.scoreLimit,timeLimit:state.timeLimit});
    game.tick=Number(state.tick)||0;
    game.elapsedTicks=Number(state.elapsedTicks)||0;
    game.freeze=state.freeze||0;
    game.phase=state.phase;
    game.score=(state.score||[0,0]).slice();
    game.announcement=state.announcement||'';
    game.eventId=Number(state.eventId)||0;
    game.kickoffActive=!!state.kickoffActive;
    game.kickoffTeam=state.kickoffTeam||1;
    game.ball={...state.ball,r:P.BALL_R,lastWall:null,lastWallTick:-1000};
    const controls=Array.isArray(options.controls)?new Map(options.controls.map(p=>[p.id,p])):new Map();
    game.players=state.players.map(p=>{
      const own=controls.get(p.id);
      // Don't invent remotely held kicks: prediction must not create phantom shots.
      // In solo mode the real active input/cooldown is available, so keep it.
      const local=p.id===options.localId?options.localInput:null;
      const next={...p,r:P.PLAYER_R,input:{x:0,y:0,kick:false},
        kickCooldown:own?.kickCooldown??100,kickHoldTicks:own?.kickHoldTicks??0,
        lastKick:p.lastKick||null,highlight:p.highlight||0};
      if(own?.input)P.setInput(next,own.input);
      else if(local)P.setInput(next,{x:local.x,y:local.y,kick:false});
      return next;
    });
    return game;
  }

  // Only a graphical safety correction. Never changes the simulation, kicks or score.
  // This also protects fractional interpolation between network snapshots.
  function separateContacts(view){
    const out=copyState(view),ball=out.ball;
    const radius=P.PLAYER_R+P.BALL_R+0.0001;
    for(let pass=0;pass<5;pass++){
      let collided=false;
      for(const p of out.players){
        if(p.team!==1&&p.team!==2)continue;
        let dx=ball.x-p.x,dy=ball.y-p.y,d=Math.hypot(dx,dy);
        if(d>=radius)continue;
        const actualDistance=d;
        if(d<1e-8){dx=ball.vx-p.vx||1;dy=ball.vy-p.vy||0;d=Math.hypot(dx,dy);}
        const nx=dx/d,ny=dy/d,penetration=radius-actualDistance;
        // Split correction by inverse masses, matching the actual engine solver.
        const ballShare=P.BALL.invMass/(P.BALL.invMass+P.PLAYER.invMass);
        ball.x+=nx*penetration*ballShare;ball.y+=ny*penetration*ballShare;
        p.x-=nx*penetration*(1-ballShare);p.y-=ny*penetration*(1-ballShare);
        collided=true;
      }
      if(!collided)break;
    }
    // Don't let the display-only separation draw the ball through pitch walls.
    if(ball.y<P.TOP+P.BALL_R)ball.y=P.TOP+P.BALL_R;
    if(ball.y>P.BOTTOM-P.BALL_R)ball.y=P.BOTTOM-P.BALL_R;
    const inGoal=ball.y>P.GOAL_TOP&&ball.y<P.GOAL_BOTTOM;
    const left=inGoal?P.NET_LEFT:P.LEFT,right=inGoal?P.NET_RIGHT:P.RIGHT;
    ball.x=clamp(ball.x,left+P.BALL_R,right-P.BALL_R);
    // In a crowded corner, wall clamping can undo the ball correction. Move
    // the displayed players outward as a last resort; the real state is untouched.
    for(const p of out.players){
      let dx=ball.x-p.x,dy=ball.y-p.y,d=Math.hypot(dx,dy);
      if(d>=radius)continue;
      if(d<1e-8){dx=1;dy=0;d=1;}
      p.x=ball.x-dx/d*radius;
      p.y=ball.y-dy/d*radius;
    }
    return out;
  }

  function mixStates(before,after,fraction){
    if(!before||!after)return after||before;
    if(before.eventId!==after.eventId||before.phase!==after.phase||
       before.players.length!==after.players.length)return after;
    const t=clamp(fraction,0,1);
    const byId=new Map(before.players.map(p=>[p.id,p]));
    const players=after.players.map(p=>{
      const prev=byId.get(p.id);
      if(!prev)return {...p};
      return {...p,x:mix(prev.x,p.x,t),y:mix(prev.y,p.y,t),
        vx:mix(prev.vx||0,p.vx||0,t),vy:mix(prev.vy||0,p.vy||0,t)};
    });
    const ball={...after.ball,x:mix(before.ball.x,after.ball.x,t),
      y:mix(before.ball.y,after.ball.y,t),
      vx:mix(before.ball.vx,after.ball.vx,t),vy:mix(before.ball.vy,after.ball.vy,t)};
    return separateContacts({...after,players,ball});
  }

  function interpolateView(before,after,alpha){
    return mixStates(before,after,alpha);
  }

  function predictView(state,ms,options={}){
    if(!state)return null;
    const amount=Number(ms);
    if(!Number.isFinite(amount)||amount<=0||state.phase!=='playing'||state.freeze>0)return state;
    const frames=clamp(amount,0,250)/TICK_MS;
    const game=simulationFromSnapshot(state,options);
    const full=Math.floor(frames+1e-9);
    for(let i=0;i<full;i++){
      const beforeEvent=game.eventId;
      P.tick(game);
      // Goal scoring must remain authoritative; stop visual forecasting at a goal.
      if(game.eventId!==beforeEvent)return separateContacts(state);
    }
    const whole=P.snapshot(game);
    let predicted=whole;
    const remainder=frames-full;
    if(remainder>1e-8){
      const beforeEvent=game.eventId;
      P.tick(game);
      if(game.eventId===beforeEvent)predicted=mixStates(whole,P.snapshot(game),remainder);
    }
    // All game state metadata stays authoritative. Only visual positions change.
    // Physics prediction uses simulated controls. Visual kick outlines must
    // instead reflect the authoritative held state (including remote players).
    const kicks=new Map(state.players.map(p=>[p.id,!!p.kicking]));
    const players=predicted.players.map(p=>({...p,kicking:kicks.get(p.id)||false}));
    return separateContacts({...state,players,ball:predicted.ball});
  }
  // Display-only rollback easing: high extrapolation can guess a trajectory
  // that the next authoritative snapshot disproves. The predicted ball then
  // visibly returns over a few frames, like a small lag correction, without
  // ever rewinding simulation, collisions, goals, or inputs.
  function reconcileVisual(previous,target,dt,extrapMs){
    if(!target||!previous||!target.ball||!previous.ball||extrapMs<=0 ||
       target.eventId!==previous.eventId||target.phase!==previous.phase)return target;
    const distance=Math.hypot(target.ball.x-previous.ball.x,target.ball.y-previous.ball.y);
    if(!Number.isFinite(distance)||distance>70)return target;
    const smoothing=clamp((Number(dt)||16)/(36+0.25*clamp(extrapMs,0,250)),0.14,0.9);
    return separateContacts({...target,ball:{...target.ball,
      x:mix(previous.ball.x,target.ball.x,smoothing),
      y:mix(previous.ball.y,target.ball.y,smoothing)}});
  }
  function advanceFixed(accumulator,elapsedMs,onTick){
    let remaining=Math.max(0,Number(accumulator)||0)+clamp(Number(elapsedMs)||0,0,125);
    let steps=0;
    while(remaining+1e-8>=TICK_MS&&steps<8){
      onTick();remaining=Math.max(0,remaining-TICK_MS);steps++;
    }
    if(steps===8&&remaining+1e-8>=TICK_MS)remaining=0;
    return {accumulator:remaining,steps};
  }
  return {predictView,interpolateView,reconcileVisual,TICK_MS,separateContacts,advanceFixed};
});