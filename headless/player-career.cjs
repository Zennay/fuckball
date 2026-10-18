'use strict';
// Server-authoritative cumulative statistics for a signed-in player.
// Count only native room completion receipts, never client score submissions.
// Profiles survive pruning of the recent receipt list, but cannot survive
// deletion or loss of the server's persistent data directory.
const USER=/^[a-z0-9_-]{3,20}$/;
const MODES=['bot','1v1','2v2','3v3','4v4'];
const num=x=>Number.isSafeInteger(x)&&x>=0;
function blank(){
 return {matches:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,
  playedFrames:0,firstAt:null,lastAt:null,winStreak:0,bestWinStreak:0,
  modes:{bot:0,'1v1':0,'2v2':0,'3v3':0,'4v4':0}};
}
function valid(profile){
 if(!profile||typeof profile!=='object'||Array.isArray(profile))return false;
 const counters=['matches','wins','draws','losses','goalsFor','goalsAgainst',
  'playedFrames','winStreak','bestWinStreak'];
 if(counters.some(k=>!num(profile[k])))return false;
 if(profile.matches!==profile.wins+profile.draws+profile.losses||
    profile.winStreak>profile.bestWinStreak||profile.bestWinStreak>profile.wins)return false;
 if(!profile.modes||typeof profile.modes!=='object'||Array.isArray(profile.modes)||
    Object.keys(profile.modes).sort().join(',')!==MODES.slice().sort().join(',')||
    MODES.some(mode=>!num(profile.modes[mode]))||
    MODES.reduce((n,m)=>n+profile.modes[m],0)!==profile.matches)return false;
 if(profile.matches===0)return profile.firstAt===null&&profile.lastAt===null;
 return Number.isSafeInteger(profile.firstAt)&&profile.firstAt>0&&
  Number.isSafeInteger(profile.lastAt)&&profile.lastAt>=profile.firstAt;
}
function cloneProfiles(old){
 if(!old||typeof old!=='object'||Array.isArray(old))throw Error('Invalid stored career statistics.');
 const next=Object.create(null);
 for(const [user,profile] of Object.entries(old)){
  // Up-convert existing persisted v2 careers without fabricating games:
  // before human Quick Match, only bot/2v2/4v4 modes existed.
  const modes={bot:profile?.modes?.bot,'1v1':profile?.modes?.['1v1']??0,
   '2v2':profile?.modes?.['2v2'],'3v3':profile?.modes?.['3v3']??0,
   '4v4':profile?.modes?.['4v4']};
  const upgraded={...profile,modes};
  if(!USER.test(user)||!valid(upgraded))throw Error('Invalid stored career statistics.');
  next[user]=upgraded;
 }
 return next;
}
function apply(profiles,records){
 const next=cloneProfiles(profiles);
 for(const receipt of records){
  const user=receipt.user,profile=next[user]||(next[user]=blank());
  const ownGoals=receipt.team===1?receipt.red:receipt.blue;
  const opponentGoals=receipt.team===1?receipt.blue:receipt.red;
  profile.matches++;profile.goalsFor+=ownGoals;profile.goalsAgainst+=opponentGoals;
  profile.playedFrames+=receipt.playedFrames;profile.modes[receipt.mode]++;
  profile.firstAt=profile.firstAt===null?receipt.at:Math.min(profile.firstAt,receipt.at);
  profile.lastAt=profile.lastAt===null?receipt.at:Math.max(profile.lastAt,receipt.at);
  if(receipt.winner===0){profile.draws++;profile.winStreak=0;}
  else if(receipt.winner===receipt.team){
   profile.wins++;profile.winStreak++;
   profile.bestWinStreak=Math.max(profile.bestWinStreak,profile.winStreak);
  }else{profile.losses++;profile.winStreak=0;}
  if(!valid(profile))throw Error('Career statistic limits exceeded.');
 }
 return next;
}
function forUser(profiles,username){
 if(typeof username!=='string'||!USER.test(username.toLowerCase()))return null;
 const profile=profiles[username.toLowerCase()]||blank();
 return {...profile,modes:{...profile.modes},source:'native-server',ranked:false,
  coverage:'recorded-on-this-server'};
}
module.exports={blank,valid,cloneProfiles,apply,forUser};
