/* Portable supervised training. Replay-level splits, validation calibration, untouched test. */
(function(root){'use strict';
async function train(splits,columns,progress=()=>{},options={}){
 let seed=options.seed||1337;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 const n=columns.length,h=options.hidden||48,epochs=options.epochs||12,rows=splits.train;
 if(!rows.length||!splits.validation.length||!splits.test.length)throw Error('Elke datasplit moet speelbare voorbeelden bevatten.');
 const mean=Array(n).fill(0),std=Array(n).fill(0);for(const r of rows)for(let i=0;i<n;i++)mean[i]+=r.x[i]/rows.length;for(const r of rows)for(let i=0;i<n;i++)std[i]+=(r.x[i]-mean[i])**2/rows.length;for(let i=0;i<n;i++)std[i]=Math.sqrt(std[i])||1;
 const m={schema:'fuckball-policy-v1',name:'Replay Academy '+new Date().toISOString().slice(0,10),input_columns:columns,window:1,role_order:[],mean,std,w1:Array.from({length:n},()=>Array.from({length:h},()=>(random()-.5)*Math.sqrt(8/n))),b1:Array(h).fill(0),wd:Array.from({length:h},()=>Array.from({length:9},()=>(random()-.5)*Math.sqrt(8/h))),bd:Array(9).fill(0),wk:Array.from({length:h},()=>[(random()-.5)*Math.sqrt(8/h)]),bk:[-2],kick_threshold:.5,kick_max_distance:31,source_kind:'human-replay-browser',training:{train_samples:rows.length,validation_samples:splits.validation.length,test_samples:splits.test.length,epochs,seed:options.seed||1337,split:'whole replays',normalization:'train only'}};
 const normalize=r=>({...r,x:r.x.map((v,i)=>(v-mean[i])/std[i])});
 const normalized=Object.fromEntries(Object.entries(splits).map(([k,rs])=>[k,rs.map(normalize)]));
 function forward(x){const z=m.b1.map((b,j)=>Math.max(0,b+x.reduce((s,v,i)=>s+v*m.w1[i][j],0))),l=m.bd.map((b,k)=>b+z.reduce((s,v,j)=>s+v*m.wd[j][k],0)),max=Math.max(...l),ex=l.map(v=>Math.exp(v-max)),sum=ex.reduce((a,b)=>a+b,0),p=ex.map(v=>v/sum),q=1/(1+Math.exp(-Math.max(-25,Math.min(25,m.bk[0]+z.reduce((s,v,j)=>s+v*m.wk[j][0],0)))));return{z,p,q};}
 const positives=rows.reduce((s,r)=>s+r.kick,0),posWeight=Math.max(1,Math.min(20,(rows.length-positives)/Math.max(1,positives))),order=rows.map((_,i)=>i);
 for(let epoch=0;epoch<epochs;epoch++){
  for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const lr=.008/(1+epoch*.12);
  for(let start=0;start<order.length;start+=64){
   const gw1=Array.from({length:n},()=>new Float64Array(h)),gb1=new Float64Array(h),gwd=Array.from({length:h},()=>new Float64Array(9)),gbd=new Float64Array(9),gwk=new Float64Array(h);let gbk=0;
   const end=Math.min(start+64,order.length),scale=lr/(end-start);
   for(let j=start;j<end;j++){const r=normalized.train[order[j]],{z,p,q}=forward(r.x);p[r.dir]-=1;const dk=(q-r.kick)*(r.kick?posWeight:1)*.5;gbk+=dk;
    for(let k=0;k<9;k++)gbd[k]+=p[k];
    for(let a=0;a<h;a++){gwk[a]+=z[a]*dk;let dz=m.wk[a][0]*dk;for(let k=0;k<9;k++){gwd[a][k]+=z[a]*p[k];dz+=m.wd[a][k]*p[k];}if(z[a]<=0)continue;gb1[a]+=dz;for(let i=0;i<n;i++)gw1[i][a]+=r.x[i]*dz;}
   }
   const clip=v=>Math.max(-10,Math.min(10,v));for(let a=0;a<h;a++){m.b1[a]-=scale*clip(gb1[a]);m.wk[a][0]-=scale*clip(gwk[a]);for(let k=0;k<9;k++)m.wd[a][k]-=scale*clip(gwd[a][k]);for(let i=0;i<n;i++)m.w1[i][a]-=scale*clip(gw1[i][a]);}for(let k=0;k<9;k++)m.bd[k]-=scale*clip(gbd[k]);m.bk[0]-=scale*clip(gbk);
   if(start%512===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  progress({epoch:epoch+1,epochs,percent:Math.round((epoch+1)/epochs*100)});
 }
 function evaluate(rs,threshold){let correct=0,tp=0,fp=0,fn=0,joint=0;const counts=Array(9).fill(0);for(const r of rs){const{p,q}=forward(r.x),dir=p.indexOf(Math.max(...p)),kick=+(q>=threshold);counts[r.dir]++;correct+=+(dir===r.dir);joint+=+(dir===r.dir&&kick===r.kick);tp+=+(kick&&r.kick);fp+=+(kick&&!r.kick);fn+=+(!kick&&r.kick);}const precision=tp/Math.max(1,tp+fp),recall=tp/Math.max(1,tp+fn);return{samples:rs.length,dir_accuracy:correct/rs.length,joint_accuracy:joint/rs.length,kick_precision:precision,kick_recall:recall,kick_f1:2*precision*recall/Math.max(1e-12,precision+recall),kick_threshold:threshold,kick_positives:tp+fn,majority_dir_accuracy:Math.max(...counts)/rs.length};}
 let best=null;for(let t=.1;t<.96;t+=.05){const e=evaluate(normalized.validation,t);if(!best||e.kick_f1>best.kick_f1)best=e;}m.kick_threshold=best.kick_threshold;m.validation_metrics=best;m.source_metrics=evaluate(normalized.test,m.kick_threshold);return m;
}
root.FuckballLearning={train};if(typeof module!=='undefined')module.exports=root.FuckballLearning;
})(globalThis);
