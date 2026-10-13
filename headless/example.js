// HBInit-compatible local script. Run: node headless/run.cjs headless/example.js 3600
const fs=require('node:fs');
const room=HBInit({roomName:'BFF Academy',noPlayer:true});
room.setCustomStadium(fs.readFileSync(__dirname+'/../dist/stadiums/bff-big-v4.hbs','utf8'));
room.setScoreLimit(0);room.setTimeLimit(0);
const AI=require('../dist/ai/policy.js');
for(let i=1;i<=8;i++)room.addPlayer(i,'AI '+i,i%2?1:2);
let tick=0;
room.onGameTick=()=>{tick++;for(const p of room.getPlayerList())room.setPlayerInput(p.id,AI.tactical(room._room.state,p.id,tick));};
room.onTeamGoal=team=>console.log('Goal for team',team);
room.startGame();
