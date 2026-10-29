/* Visual-only lookahead guard for the native 60 Hz HaxBall engine.
   No authoritative state, positions, inputs or collision rules are modified. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FuckballPrediction=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TICK_MS=1000/60;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(v)?v:lo));
  function impactTicks(ball,other){
    const rx=ball.pos.x-other.pos.x,ry=ball.pos.y-other.pos.y;
    const vx=ball.speed.x-other.speed.x,vy=ball.speed.y-other.speed.y;
    const radius=(ball.radius||0)+(other.radius||0)+2;
    const a=vx*vx+vy*vy,c=rx*rx+ry*ry-radius*radius;
    if(c<=0)return 0;
    if(a<1e-8)return Infinity;
    const b=2*(rx*vx+ry*vy),disc=b*b-4*a*c;
    if(b>=0||disc<0)return Infinity;
    const t=(-b-Math.sqrt(disc))/(2*a);
    return t>=0?t:Infinity;
  }
  function effectiveMs(requested,state){
    const ms=clamp(Number(requested),0,250);
    const game=state?.gameState,physics=game?.physicsState,ball=physics?.discs?.[0];
    if(!ball||ms===0||!ball.pos||!ball.speed)return ms;
    const s=game.stadium||{},w=Number(s.width)||0,h=Number(s.height)||0;
    let soonest=Infinity;
    // Conservative wall estimate: goals, curved walls and custom stadiums
    // are left to the real engine. Only avoid forecasting *through* contacts.
    if(w>0&&Math.abs(ball.pos.x)<w){
      if(ball.speed.x>0)soonest=Math.min(soonest,(w-ball.radius-ball.pos.x)/ball.speed.x);
      else if(ball.speed.x<0)soonest=Math.min(soonest,(-w+ball.radius-ball.pos.x)/ball.speed.x);
    }
    if(h>0&&Math.abs(ball.pos.y)<h){
      if(ball.speed.y>0)soonest=Math.min(soonest,(h-ball.radius-ball.pos.y)/ball.speed.y);
      else if(ball.speed.y<0)soonest=Math.min(soonest,(-h+ball.radius-ball.pos.y)/ball.speed.y);
    }
    for(const player of state.players||[]){
      if(!player.disc||player.team?.id===0)continue;
      soonest=Math.min(soonest,impactTicks(ball,player.disc));
    }
    // Close collisions and kicks are sensitive to unknown future inputs.
    // Avoid displaying a speculative future bounce several ticks too soon.
    // Keep up to one tick of render-ahead for smooth high-refresh output.
    if(soonest<ms/TICK_MS+0.5)return Math.min(ms,Math.max(0.8,soonest-0.5)*TICK_MS);
    return ms;
  }
  return {TICK_MS,effectiveMs,impactTicks};
});
