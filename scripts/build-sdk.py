from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent.parent
paths=['headless','training/haxlab','training/train.py','training/export_model.py','training/generate.cjs','training/import_replays.cjs','training/benchmark.cjs','training/selfplay.cjs','training/haxlab_selfplay.cjs','dist/vendor','dist/ai','dist/stadiums','README.md','evidence','scripts/test-core.cjs','tests/engine.cjs','tests/physics-regression.cjs','tests/headless.cjs','tests/ai.cjs','tests/academy-worker.cjs','tests/selfplay-worker.cjs','tests/server.cjs']
# Include browser assets too: the server serves dist/ directly.
paths += [str(p.relative_to(root)) for p in (root/'dist').iterdir() if p.is_file() and p.suffix!='.zip']
seen=set()
with zipfile.ZipFile(root/'dist/fuckball-headless-sdk.zip','w',zipfile.ZIP_DEFLATED) as z:
 for item in paths:
  p=root/item
  for f in (p.rglob('*') if p.is_dir() else [p]):
   if not f.is_file() or '__pycache__' in f.parts or f.suffix=='.pyc' or f in seen:continue
   seen.add(f);z.write(f,str(f.relative_to(root)))
print('Built SDK:',len(seen),'files')
