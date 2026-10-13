'use strict';
// Main deployment entry: one authoritative engine shared by browser and headless.
const{createServer}=require('./headless/server.cjs');
const app=createServer();app.listen(Number(process.env.PORT)||3417,process.env.HOST||'0.0.0.0').then(a=>console.log('Fuckball listening on '+a.address+':'+a.port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
