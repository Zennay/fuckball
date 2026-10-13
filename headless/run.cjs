#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const{HBInit}=require('./runtime.cjs');
const file=process.argv[2],steps=Number(process.argv[3]||3600);if(!file){console.error('Usage: node headless/run.cjs script.js [ticks=3600]');process.exit(2);}
const rooms=[];const context=vm.createContext({console,HBInit:options=>{const r=HBInit(options);rooms.push(r);return r;},require:require('node:module').createRequire(path.resolve(file)),__dirname:path.dirname(path.resolve(file)),setTimeout,clearTimeout,Buffer});vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file,timeout:5000});if(!rooms.length)throw Error('Script did not create an HBInit room');for(const r of rooms){r.step(Math.min(216000,Math.max(1,steps)));console.log(JSON.stringify({room:r.name,players:r.getPlayerList().length,scores:r.getScores()}));r.destroy();}
