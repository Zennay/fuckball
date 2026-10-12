'use strict';
// Embed the exact online physics/client logic into a browser-openable solo file.
// Do not maintain an independently forked copy of the game logic.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const page=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
let source=page;
for(const name of ['stadium','physics','prediction','bot']){
  const tag=`<script src="/shared/${name}.js"></script>`;
  if(!source.includes(tag))throw new Error(`Missing script tag: ${tag}`);
  const moduleSource=fs.readFileSync(path.join(root,`shared/${name}.js`),'utf8');
  source=source.replace(tag,`<script>\n${moduleSource}\n</script>`);
}
const output=path.join(root,'dist','Pulseball-BFF-Big-v4-Play-Solo.html');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,source);
console.log(`Built standalone game: ${output} (${Buffer.byteLength(source)} bytes)`);