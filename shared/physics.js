/* BFF Big v4 60 Hz stadium simulation, using user-supplied .hbs constants.
   Approximation of the proprietary HaxBall collision solver; includes custom kick mechanics. */
(function (root, factory) {
  const stadium=typeof module === 'object' && module.exports ? require('./stadium') : root.PulseStadium;
  const api = factory(stadium);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PulsePhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (STADIUM) {
  'use strict';
  if(!STADIUM || STADIUM.name!=='BFF Big v4')throw new Error('BFF Big v4 stadium must load first');
  const W=1700,H=800,CX=W/2,CY=H/2;
  const mapX=n=>CX+n,mapY=n=>CY+n;
  // Read geometry directly from the user-provided .hbs, no Classic fallback.
  const LEFT=mapX(-STADIUM.bg.width), RIGHT=mapX(STADIUM.bg.width);
  const TOP=mapY(-STADIUM.bg.height), BOTTOM=mapY(STADIUM.bg.height);
  const OUTER_LEFT=mapX(-STADIUM.width),OUTER_RIGHT=mapX(STADIUM.width);
  const OUTER_TOP=mapY(-STADIUM.height),OUTER_BOTTOM=mapY(STADIUM.height);
  const GOAL_TOP=mapY(STADIUM.goals[0].p1[1]), GOAL_BOTTOM=mapY(STADIUM.goals[0].p0[1]);
  const GOAL_LEFT=mapX(STADIUM.goals[0].p0[0]),GOAL_RIGHT=mapX(STADIUM.goals[1].p0[0]);
  // Goal pockets are bounded by the endpoints of colored HBS net segments.
  const NET_LEFT=mapX(-735),NET_RIGHT=mapX(735);
  const PLAYER_R=15,BALL_R=STADIUM.discs[0].radius,POST_R=STADIUM.discs[1].radius;
  // User-tuned pace: +10% acceleration in both movement modes.
  // With damping unchanged, steady-state movement speed also rises by 10%.
  const PLAYER_SPEED_MULTIPLIER=1.10;
  const PLAYER={invMass:0.5,bCoef:STADIUM.playerPhysics.bCoef,damping:0.96,
    acceleration:STADIUM.playerPhysics.acceleration*PLAYER_SPEED_MULTIPLIER,kickingAcceleration:STADIUM.playerPhysics.kickingAcceleration*PLAYER_SPEED_MULTIPLIER,
    kickingDamping:0.96,kickStrength:STADIUM.playerPhysics.kickStrength,kickback:0};
  const BALL={invMass:STADIUM.discs[0].invMass,bCoef:STADIUM.discs[0].bCoef,damping:0.99};
  // Move the ball 20% further per tick, while keeping the BFF mass,
  // collision elasticity, damping and player/kick constants untouched.
  const BALL_SPEED_MULTIPLIER=1.2; // original requested +20% over 1.0× travel
  // HBS unconfigured wall segments use the ball's own bCoef.
  const DEFAULT_REBOUND=BALL.bCoef;
  // A wall bounce should carry the existing shot instead of losing ~59% of
  // its speed every time. This is separate from slow player-ball contact.
  // Respect room rebound settings proportionally; the original 0.412 choice
  // now means about 76% wall-speed retention, while 1 still means 100%.
  const WALL_REBOUND_AT_DEFAULT=0.76;
  const wallRebound=g=>clamp(g.rebound*WALL_REBOUND_AT_DEFAULT/DEFAULT_REBOUND,0.15,1);
  // A real kick is an intentional, recent press. Holding X while approaching
  // never shoots automatically. Baby kicks are rare grazing contacts at the
  // OUTER edge of the kick radius, within the first two ticks of a new press.
  const KICK_REACH=4, FULL_KICK_HOLD_FRAMES=5, BABY_KICK_HOLD_FRAMES=2;
  const BABY_KICK_SCALE=0.22, BABY_GRAZE_WIDTH=0.5, KICK_COOLDOWN_FRAMES=9;
  const WALL_BOOST_WINDOW=16, WALL_BOOST_DISTANCE=24;
  const POSTS=STADIUM.discs.slice(1).map(d=>[mapX(d.pos[0]),mapY(d.pos[1])]);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function player(id,name,team){return {id,name,team,x:team===1?CX-170:CX+170,y:CY,vx:0,vy:0,r:PLAYER_R,input:{x:0,y:0,kick:false},kickCooldown:0,kickHoldTicks:0,lastKick:null,highlight:0,flashType:'whiff'};}
  function createGame(options={}){
    const scoreLimit=clamp(Number(options.scoreLimit)||3,1,99);
    const timeLimit=clamp(Number(options.timeLimit)||3,1,99);
    const rebound=Number.isFinite(Number(options.rebound)) && options.rebound != null ? clamp(Number(options.rebound),0.15,1) : DEFAULT_REBOUND;
    return {rebound,ball:{x:CX,y:CY,vx:0,vy:0,r:BALL_R,lastWall:null,lastWallTick:-1000},players:[],score:[0,0],tick:0,elapsedTicks:0,
      scoreLimit,timeLimit,freeze:65,announcement:'KICK OFF',eventId:0,phase:'playing',
      lastScorer:null,kickoffTeam:1,kickoffActive:true,gameOverReason:null};
  }
  function placePlayer(p,index){
    p.x=CX+(p.team===1?-170:170)-(p.team===1?1:-1)*Math.floor(index/2)*25;
    p.y=CY+(index===0?0:(index%2?1:-1)*Math.ceil(index/2)*40);
    p.vx=0;p.vy=0;p.kickCooldown=0;p.kickHoldTicks=0;p.lastKick=null;p.highlight=0;p.flashType='whiff';
  }
  function resetPositions(g){
    g.ball={x:CX,y:CY,vx:0,vy:0,r:BALL_R,lastWall:null,lastWallTick:-1000};
    const count={1:0,2:0};
    for(const p of g.players)if(p.team===1||p.team===2)placePlayer(p,count[p.team]++);
  }
  function addPlayer(g,p){
    placePlayer(p,g.players.filter(q=>q.team===p.team).length);g.players.push(p);
  }
  function setInput(p,input){
    if(!p)return;
    // Digital keys have their full magnitude; diagonal acceleration is normalized.
    let x=Number(input?.x),y=Number(input?.y);
    x=Number.isFinite(x)?clamp(x,-1,1):0; y=Number.isFinite(y)?clamp(y,-1,1):0;
    const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
    p.input={x,y,kick:input?.kick===true};
  }
  function collide(a,b,bCoef=0.5){
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r=a.r+b.r;
    if(d>=r)return false;
    const nx=d>1e-9?dx/d:1,ny=d>1e-9?dy/d:0;
    const imA=a.invMass??PLAYER.invMass,imB=b.invMass??BALL.invMass,total=imA+imB;
    if(total<=0)return false;
    const push=r-d;
    a.x-=nx*push*imA/total;a.y-=ny*push*imA/total;
    b.x+=nx*push*imB/total;b.y+=ny*push*imB/total;
    const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(rel<0){const impulse=-(1+bCoef)*rel/total;a.vx-=nx*impulse*imA;a.vy-=ny*impulse*imA;b.vx+=nx*impulse*imB;b.vy+=ny*impulse*imB;}
    return true;
  }
  // Gentle contact: a walking player should be able to carry a slow ball
  // on the front edge of the disc instead of immediately launching it.
  // This ONLY modifies low-speed, un-kicked player-to-ball contact.
  // The ball retains all tangential velocity so glancing contacts can roll away.
  function collidePlayerBall(g,p,ball){
    const dx=ball.x-p.x,dy=ball.y-p.y,d=Math.hypot(dx,dy);
    let controlled=false,nx=0,ny=0;
    if(d>1e-8 && d<p.r+ball.r && !p.input?.kick){
      nx=dx/d;ny=dy/d;
      const playerNormal=p.vx*nx+p.vy*ny;
      const ballNormal=ball.vx*nx+ball.vy*ny;
      // Only a player catching a slow ball can cushion it.
      // Hard incoming passes and shots always use the ordinary rebound solver.
      controlled=playerNormal>0.15 &&
        playerNormal-ballNormal*BALL_SPEED_MULTIPLIER>0.12 &&
        ballNormal>=-0.6 && Math.hypot(ball.vx,ball.vy)<=3.5;
    }
    const hit=collide(p,ball,controlled?0:g.rebound);
    if(hit&&controlled){
      // The fast-ball multiplier is positional, not an extra kick.
      // Limit the outgoing NORMAL ball travel to the player's travel;
      // never alter the tangential component (natural roll-off/dribbling).
      const playerNormal=Math.max(0,p.vx*nx+p.vy*ny);
      const ballNormal=ball.vx*nx+ball.vy*ny;
      const maxBallNormal=Math.max(0,playerNormal/BALL_SPEED_MULTIPLIER)*0.82;
      if(ballNormal>maxBallNormal){
        const excess=ballNormal-maxBallNormal;
        ball.vx-=nx*excess;ball.vy-=ny*excess;
      }
    }
    return hit;
  }
  function againstStatic(disc,x,y,r,bCoef){
    const obstacle={x,y,vx:0,vy:0,r,invMass:0};
    return collide(obstacle,disc,bCoef);
  }
  function bounceBound(o,axis,min,max,bCoef){
    if(o[axis]<min){o[axis]=min;const v=axis==='x'?'vx':'vy';if(o[v]<0)o[v]=-o[v]*bCoef;}
    if(o[axis]>max){o[axis]=max;const v=axis==='x'?'vx':'vy';if(o[v]>0)o[v]=-o[v]*bCoef;}
  }
  function kickoffGuard(g,p){
    // In Classic, ONLY the team that did not concede can be outside the circle
    // in the opponent half during kickoff; the opposite team is restrained by
    // the half-line and centre circle until the kicking team first touches ball.
    if(!g.kickoffActive||p.team===g.kickoffTeam)return;
    if(p.team===1&&p.x+p.r>CX){p.x=CX-p.r;if(p.vx>0)p.vx=0;}
    if(p.team===2&&p.x-p.r<CX){p.x=CX+p.r;if(p.vx<0)p.vx=0;}
    let dx=p.x-CX,dy=p.y-CY,dist=Math.hypot(dx,dy),min=STADIUM.bg.kickOffRadius+p.r;
    if(dist<min){
      // Push from kickoff circle into own half, even when positioned at centre.
      if(dist<1e-6){dx=p.team===1?-1:1;dy=0;dist=1;}
      p.x=CX+dx/dist*min;p.y=CY+dy/dist*min;
      if(p.team===1&&p.x+p.r>CX){p.x=CX-p.r;p.y=CY+(dy>=0?1:-1)*Math.sqrt(Math.max(0,min*min-(p.x-CX)**2));}
      if(p.team===2&&p.x-p.r<CX){p.x=CX+p.r;p.y=CY+(dy>=0?1:-1)*Math.sqrt(Math.max(0,min*min-(p.x-CX)**2));}
      const normalX=(p.x-CX)/min,normalY=(p.y-CY)/min,v=p.vx*normalX+p.vy*normalY;
      if(v<0){p.vx-=v*normalX;p.vy-=v*normalY;}
    }
  }
  function finish(g,reason){g.phase='ended';g.gameOverReason=reason;g.freeze=0;g.kickoffActive=false;g.announcement=g.score[0]===g.score[1]?'DRAW!':(g.score[0]>g.score[1]?'RED':'BLUE')+' WINS!';g.eventId++;}
  function scoreGoal(g,scoringTeam){
    g.score[scoringTeam-1]++;g.lastScorer=scoringTeam;g.eventId++;
    if(g.score[scoringTeam-1]>=g.scoreLimit){finish(g,'score');return;}
    g.announcement=(scoringTeam===1?'RED':'BLUE')+' SCORES!';g.freeze=90;
    g.kickoffTeam=scoringTeam===1?2:1;g.kickoffActive=true;
    resetPositions(g);
  }
  function kickStrengthForHold(frames,distance){
    if(frames>FULL_KICK_HOLD_FRAMES)return 0; // stale pre-hold: release before shooting
    const outerEdge=PLAYER_R+BALL_R+KICK_REACH-BABY_GRAZE_WIDTH;
    if(frames<=BABY_KICK_HOLD_FRAMES && distance>outerEdge)
      return PLAYER.kickStrength*BABY_KICK_SCALE;
    return PLAYER.kickStrength;
  }
  function wallBoost(g,p,strength){
    // Tangential impulse models the skill shot of pressing the ball while
    // moving into the wall. Ordinary bounces and wall-parallel taps remain unchanged.
    const ball=g.ball;
    const walls=[
      ['top','y',-1,ball.y-(TOP+BALL_R)],
      ['bottom','y',1,ball.y-(BOTTOM-BALL_R)],
      ['left','x',-1,ball.x-(LEFT+BALL_R)],
      ['right','x',1,ball.x-(RIGHT-BALL_R)]
    ];
    for(const [side,axis,direction,distance] of walls){
      // Behind goal mouths there is no wall to press against.
      if((side==='left'||side==='right')&&ball.y>GOAL_TOP&&ball.y<GOAL_BOTTOM)continue;
      const recent=ball.lastWall===side&&g.tick-ball.lastWallTick<=WALL_BOOST_WINDOW;
      if(Math.abs(distance)> (recent?WALL_BOOST_DISTANCE:5))continue;
      const movement=p.input?.[axis]||0;
      const approach=(axis==='x'?p.vx:p.vy)*direction;
      if(movement*direction<0.5||approach<0.5)continue;
      const tangent=axis==='x'?'vy':'vx';
      // Rockets also work when the ball initially has almost no tangential
      // speed: the player's diagonal wall run provides the missing direction.
      const tangentVelocity=p[tangent];
      if(Math.abs(ball[tangent])<0.2&&Math.abs(tangentVelocity)<0.4)continue;
      const aim=Math.abs(tangentVelocity)>0.35?tangentVelocity:ball[tangent];
      const boost=Math.min(2.8,0.4+0.7*approach+0.45*Math.abs(tangentVelocity));
      const scale=clamp(strength/PLAYER.kickStrength,0,1);
      if(scale<0.8)continue;
      ball[tangent]+=Math.sign(aim)*boost*scale;
      return true;
    }
    return false;
  }
  function sweepFastBall(g,startX,startY){
    // Continuous ball/player impact for an unusually fast shot. At high ball
    // speeds the disc may cross an entire player in one 60 Hz tick; detecting
    // only final overlap would let both simulation and extrapolation tunnel.
    const ball=g.ball,dx=ball.x-startX,dy=ball.y-startY;
    if(Math.hypot(dx,dy)<PLAYER_R+BALL_R)return;
    let hit=null;
    for(const p of g.players){
      if(p.team!==1&&p.team!==2)continue;
      const sx=startX-p.x,sy=startY-p.y,r=PLAYER_R+BALL_R;
      if(sx*sx+sy*sy<=r*r)continue; // regular solver handles existing contact
      const a=dx*dx+dy*dy,b=2*(sx*dx+sy*dy),c=sx*sx+sy*sy-r*r;
      if(b>=0)continue;
      const discr=b*b-4*a*c;
      if(discr<0)continue;
      const t=(-b-Math.sqrt(discr))/(2*a);
      if(t<0||t>1||hit&&t>=hit.t)continue;
      // Keep the ordinary end-overlap collision unless the ball has almost
      // reached the opposite side of the disc in this single simulation tick.
      const ex=ball.x-p.x,ey=ball.y-p.y;
      if(ex*sx+ey*sy>0&&Math.hypot(ex,ey)<r)continue;
      hit={p,t,nx:(sx+dx*t)/r,ny:(sy+dy*t)/r};
    }
    if(!hit)return;
    const {p,t,nx,ny}=hit;
    const relative=(ball.vx-p.vx)*nx+(ball.vy-p.vy)*ny;
    if(relative>=0)return;
    const invA=PLAYER.invMass,invB=BALL.invMass;
    const impulse=-(1+g.rebound)*relative/(invA+invB);
    p.vx-=nx*impulse*invA;p.vy-=ny*impulse*invA;
    ball.vx+=nx*impulse*invB;ball.vy+=ny*impulse*invB;
    ball.x=p.x+nx*(PLAYER_R+BALL_R+0.0001)+ball.vx*(1-t);
    ball.y=p.y+ny*(PLAYER_R+BALL_R+0.0001)+ball.vy*(1-t);
  }
  function tick(g){
    if(g.phase==='ended'||g.phase==='paused'||g.phase==='stopped')return;
    g.tick++;
    if(g.freeze>0){g.freeze--;if(g.freeze===0)g.announcement='';return;}
    g.elapsedTicks++;
    const ball=g.ball;
    for(const p of g.players){
      if(p.team!==1&&p.team!==2)continue;
      if(p.kickCooldown>0)p.kickCooldown--;
      const input=p.input||{x:0,y:0,kick:false};
      // Kick highlight is a steady held state, NOT a blinking cooldown pulse.
      // Shot strength/cooldown are independent from the white player outline.
      p.highlight=input.kick?1:0;
      if(input.kick){
        p.kickHoldTicks=Math.min(120,(p.kickHoldTicks||0)+1);
        if(p.kickHoldTicks===1)p.flashType='whiff';
      }else p.kickHoldTicks=0;
      const acc=input.kick?PLAYER.kickingAcceleration:PLAYER.acceleration;
      const damp=input.kick?PLAYER.kickingDamping:PLAYER.damping;
      p.vx=(p.vx+input.x*acc)*damp;p.vy=(p.vy+input.y*acc)*damp;
      p.x+=p.vx;p.y+=p.vy;
      bounceBound(p,'x',OUTER_LEFT+p.r,OUTER_RIGHT-p.r,0.1);
      bounceBound(p,'y',OUTER_TOP+p.r,OUTER_BOTTOM-p.r,0.1);
      kickoffGuard(g,p);
    }
    // Solver iterations prevent persistent overlap while avoiding huge velocity spikes.
    for(let iteration=0;iteration<2;iteration++){
      for(let i=0;i<g.players.length;i++)for(let j=i+1;j<g.players.length;j++){
        if(g.players[i].team&&g.players[j].team)collide(g.players[i],g.players[j],PLAYER.bCoef);
      }
      for(const p of g.players)if(p.team){for(const [x,y] of POSTS)againstStatic(p,x,y,POST_R,PLAYER.bCoef);kickoffGuard(g,p);}
    }
    ball.vx*=BALL.damping;ball.vy*=BALL.damping;
    const oldBallX=ball.x,oldBallY=ball.y;
    ball.x+=ball.vx*BALL_SPEED_MULTIPLIER;ball.y+=ball.vy*BALL_SPEED_MULTIPLIER;
    sweepFastBall(g,oldBallX,oldBallY);
    // Physical collisions first; shooting is a separate impulse when kick is held.
    for(const p of g.players)if(p.team){
      collidePlayerBall(g,p,ball);
      const dx=ball.x-p.x,dy=ball.y-p.y,d=Math.hypot(dx,dy);
      if(g.kickoffActive&&p.team===g.kickoffTeam&&d<=PLAYER_R+BALL_R+0.5)g.kickoffActive=false;
      if(p.input?.kick && p.kickCooldown===0 && d<=PLAYER_R+BALL_R+KICK_REACH && (!g.kickoffActive||p.team===g.kickoffTeam)){
        const strength=kickStrengthForHold(p.kickHoldTicks,d);
        if(strength>0){
          const nx=d>1e-6?dx/d:p.team===1?1:-1,ny=d>1e-6?dy/d:0;
          ball.vx+=nx*strength;ball.vy+=ny*strength;
          const boosted=wallBoost(g,p,strength);
          p.lastKick=boosted?'wall-boost':strength<PLAYER.kickStrength*0.8?'baby':'full';
          p.kickCooldown=KICK_COOLDOWN_FRAMES;p.flashType=p.lastKick;g.kickoffActive=false;
        }
      }
    }
    for(const [x,y] of POSTS)againstStatic(ball,x,y,POST_R,g.rebound);
    // Main top and bottom field walls use the host-selected rebound coefficient.
    if(ball.y-BALL_R<TOP){ball.y=TOP+BALL_R;ball.vy=Math.abs(ball.vy)*wallRebound(g);ball.lastWall='top';ball.lastWallTick=g.tick;}
    if(ball.y+BALL_R>BOTTOM){ball.y=BOTTOM-BALL_R;ball.vy=-Math.abs(ball.vy)*wallRebound(g);ball.lastWall='bottom';ball.lastWallTick=g.tick;}
    const insideMouth=ball.y>GOAL_TOP&&ball.y<GOAL_BOTTOM;
    if(!insideMouth){
      if(ball.x-BALL_R<LEFT){ball.x=LEFT+BALL_R;ball.vx=Math.abs(ball.vx)*wallRebound(g);ball.lastWall='left';ball.lastWallTick=g.tick;}
      if(ball.x+BALL_R>RIGHT){ball.x=RIGHT-BALL_R;ball.vx=-Math.abs(ball.vx)*wallRebound(g);ball.lastWall='right';ball.lastWallTick=g.tick;}
    }else{
      // Goal posts & net provide a physical pocket outside the goal line.
      if(ball.x-BALL_R<NET_LEFT){ball.x=NET_LEFT+BALL_R;ball.vx=Math.abs(ball.vx)*g.rebound*0.1;}
      if(ball.x+BALL_R>NET_RIGHT){ball.x=NET_RIGHT-BALL_R;ball.vx=-Math.abs(ball.vx)*g.rebound*0.1;}
      if(ball.x<LEFT||ball.x>RIGHT){
        if(ball.y-BALL_R<GOAL_TOP){ball.y=GOAL_TOP+BALL_R;ball.vy=Math.abs(ball.vy)*g.rebound*0.1;}
        if(ball.y+BALL_R>GOAL_BOTTOM){ball.y=GOAL_BOTTOM-BALL_R;ball.vy=-Math.abs(ball.vy)*g.rebound*0.1;}
      }
    }
    // Goal lines: crossing the plane by the ball centre counts. Posts guard edges.
    if(insideMouth&&ball.x<GOAL_LEFT){scoreGoal(g,2);return;}
    if(insideMouth&&ball.x>GOAL_RIGHT){scoreGoal(g,1);return;}
    if(g.elapsedTicks>=g.timeLimit*60*60){finish(g,'time');return;}
  }
  function snapshot(g){return {tick:g.tick,elapsedTicks:g.elapsedTicks,timeLimit:g.timeLimit,scoreLimit:g.scoreLimit,rebound:g.rebound,
    ball:{x:g.ball.x,y:g.ball.y,vx:g.ball.vx,vy:g.ball.vy},
    players:g.players.filter(p=>p.team===1||p.team===2).map(p=>({id:p.id,name:p.name,team:p.team,x:p.x,y:p.y,vx:p.vx,vy:p.vy,kicking:p.input?.kick===true,highlight:p.highlight,lastKick:p.lastKick,flashType:p.flashType})),
    score:g.score.slice(),freeze:g.freeze,announcement:g.announcement,eventId:g.eventId,phase:g.phase,
    kickoffTeam:g.kickoffTeam,kickoffActive:g.kickoffActive,gameOverReason:g.gameOverReason};}
  return {STADIUM,W,H,CX,CY,LEFT,RIGHT,TOP,BOTTOM,OUTER_LEFT,OUTER_RIGHT,OUTER_TOP,OUTER_BOTTOM,GOAL_LEFT,GOAL_RIGHT,
    GOAL_TOP,GOAL_BOTTOM,NET_LEFT,NET_RIGHT,PLAYER_R,BALL_R,POST_R,POSTS,PLAYER,BALL,PLAYER_SPEED_MULTIPLIER,BALL_SPEED_MULTIPLIER,DEFAULT_REBOUND,WALL_REBOUND_AT_DEFAULT,wallRebound,KICK_REACH,FULL_KICK_HOLD_FRAMES,BABY_KICK_HOLD_FRAMES,BABY_KICK_SCALE,
    createGame,player,addPlayer,resetPositions,setInput,tick,snapshot,clamp};
});