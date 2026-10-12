'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('standalone builder embeds current authoritative physics and prediction',()=>{
  const page=fs.readFileSync(path.join(root,'dist/Pulseball-BFF-Big-v4-Play-Solo.html'),'utf8');
  for(const name of ['stadium','physics','prediction','bot']){
    const original=fs.readFileSync(path.join(root,`shared/${name}.js`),'utf8');
    assert.ok(page.includes(original),`the solo page must embed shared/${name}.js exactly`);
  }
  assert.doesNotMatch(page,/<script src="\/shared\//);
  assert.match(page,/press Space \/ X near the ball to shoot/);
  assert.match(page,/natural ball collisions \/ full kicks/);
});