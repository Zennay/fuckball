"""Train using the user's HaxLab trainer; keep a third, untouched evaluation split."""
import argparse,json,sys
from pathlib import Path
import numpy as np
from haxlab.baseline import train_baseline,evaluate
from export_model import export
p=argparse.ArgumentParser();p.add_argument('--initial',type=Path);p.add_argument('--name',default='Academy BC 01');p.add_argument('--source-kind',default='tactical-teacher-bootstrap');p.add_argument('--data',type=Path,default=Path('training/data'));p.add_argument('--output',type=Path,default=Path('training/output'));p.add_argument('--epochs',type=int,default=15);p.add_argument('--export',type=Path,default=Path('dist/ai/trained-model.json'));a=p.parse_args()
indices={k:json.loads((a.data/(k+'.json')).read_text()) for k in ['train','validation','test']}
sets={k:{str(Path(e['shard_path']).resolve()) for e in v['entries']} for k,v in indices.items()}
if not all(sets.values()) or any(sets[x]&sets[y] for x,y in [('train','validation'),('train','test'),('validation','test')]):raise ValueError('Require nonempty, disjoint replay/episode splits')
meta=train_baseline(train_index_path=a.data/'train.json',holdout_index_path=a.data/'validation.json',output_dir=a.output,hidden_dim=96,epochs=a.epochs,batch_size=512,learning_rate=.0003 if a.initial else .001,seed=1337,initial_path=a.initial)
with np.load(a.output/'model.npz',allow_pickle=False) as z:weights={k:z[k] for k in z.files}
metrics=evaluate(indices['test'],params={k:v for k,v in weights.items() if k not in ['mean','std']},mean=weights['mean'],std=weights['std'],batch_size=2048,kick_threshold=meta['training']['calibrated_kick_threshold'])
meta.update({'name':a.name,'source_kind':a.source_kind,'untouched_test':metrics,'validation_note':'Threshold selected on validation only; untouched_test is an independent episode/replay split.'})
(a.output/'metrics.json').write_text(json.dumps(meta,indent=2));export(a.output/'model.npz',a.output/'metrics.json',a.export)
print(json.dumps({'trained_model':str(a.export),'test':metrics,'source_kind':meta['source_kind']}))
