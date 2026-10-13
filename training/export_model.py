"""Export HaxLab baseline/temporal champion to portable browser inference weights."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np

def export(model_path,metadata_path,output):
    meta=json.loads(Path(metadata_path).read_text())
    with np.load(model_path,allow_pickle=False) as z: params={k:z[k] for k in z.files}
    cols=meta.get('base_input_columns') or meta.get('input_columns')
    if not cols or len(cols)!=len(params['mean']):raise ValueError('Missing/mismatched named input columns')
    temporal='w2' in params
    window=(params['w1'].shape[0]-4)//len(cols) if temporal else 1
    if temporal and params['w1'].shape[0]!=window*len(cols)+4:raise ValueError('Unsupported temporal shape')
    final=meta.get('final_validation') or meta.get('final_holdout') or {}
    threshold=final.get('kick_threshold') or meta.get('training',{}).get('calibrated_kick_threshold') or .5
    result={'schema':'fuckball-policy-v1','name':meta.get('name') or Path(model_path).parent.name,'input_columns':cols,'window':window,'sample_every_ticks':6,'role_order':['gk','dm','am','st'] if temporal else [],'kick_threshold':threshold,'kick_max_distance':meta.get('runtime',{}).get('kick_max_distance',31),'source_sha256':hashlib.sha256(Path(model_path).read_bytes()).hexdigest(),'source_metrics':meta.get('untouched_test') or final,'training':meta.get('training',{}),'source_kind':meta.get('source_kind','haxlab-model')}
    for k in ['mean','std','w1','b1','w2','b2','wd','bd','wk','bk']:
        if k in params:
            arr=params[k]
            if not np.isfinite(arr).all():raise ValueError('Non-finite weights')
            if k=='std':arr=np.where(arr<1e-4,1,arr)
            result[k]=arr.tolist()
    Path(output).parent.mkdir(parents=True,exist_ok=True);Path(output).write_text(json.dumps(result,separators=(',',':')))
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('model');p.add_argument('metadata');p.add_argument('output');a=p.parse_args();r=export(a.model,a.metadata,a.output);print(json.dumps({'model':a.output,'features':len(r['input_columns']),'window':r['window'],'source':r['source_kind']}))
