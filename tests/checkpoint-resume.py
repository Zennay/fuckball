import sys,tempfile
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
from haxlab.baseline import resume_params,_init_params
rng=np.random.default_rng(19);params=_init_params(44,96,rng);old_mean=rng.normal(size=44);old_std=rng.uniform(.5,2,size=44);mean=rng.normal(size=44);std=rng.uniform(.5,2,size=44);x=rng.normal(size=(16,44))
with tempfile.TemporaryDirectory() as t:
 p=Path(t)/'model.npz';np.savez(p,**params,mean=old_mean,std=old_std);resumed=resume_params(p,params,mean,std)
 np.testing.assert_allclose(((x-old_mean)/old_std)@params['w1']+params['b1'],((x-mean)/std)@resumed['w1']+resumed['b1'],rtol=1e-5,atol=1e-5)
print('PASS checkpoint preserves network predictions across normalization changes')
