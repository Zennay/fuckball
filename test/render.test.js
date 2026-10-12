'use strict';
// Pure-Node browser harness: exercises the real bundled HTML without a GPU,
// which is useful when sandboxed Chromium cannot start.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function runPage(){
  const html=fs.readFileSync(path.join(__dirname,'../dist/Pulseball-BFF-Big-v4-Play-Solo.html'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const elements={};let offscreenStrokes=0,framesDrawn=0;
  const strokes=[];
  function makeCtx(offscreen){
    return {
      beginPath(){this.arcData=null;},moveTo(){},lineTo(){},
      arc(x,y,r){this.arcData={x,y,r};},roundRect(){},fill(){},
      stroke(){if(offscreen)offscreenStrokes++;else if(this.arcData)strokes.push({...this.arcData,color:this.strokeStyle,width:this.lineWidth});},
      fillRect(){},clearRect(){},fillText(){},strokeText(){},setTransform(){},
      drawImage(){if(!offscreen)framesDrawn++;}
    };
  }
  const mainCtx=makeCtx(false),offCtx=makeCtx(true);
  class Element{
    constructor(id=''){
      this.id=id;this.value='';this.textContent='';this.disabled=false;
      this.children=[];this.listeners={};this.dataset={};this.classList={add(){},remove(){},toggle(){}};
      this.style={};this.width=1700;this.height=800;
    }
    getContext(){return this.id==='pitch'?mainCtx:offCtx;}
    getBoundingClientRect(){return {width:850,height:400};}
    addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
    fire(type){for(const fn of this.listeners[type]??[])fn({preventDefault(){}});}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);}
    remove(){}
    get firstElementChild(){return this.children[0];}
    setPointerCapture(){}
  }
  for(const id of ids)elements[id]=new Element(id);
  for(const [id,value] of [['scoreLimit','3'],['timeLimit','3'],['ballRebound','0.412'],['extrapolation','0'],['nickname','Test']])elements[id].value=value;
  const callbacks=[],winListeners={};
  const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),
    querySelectorAll:()=>[],activeElement:new Element()};
  const window={addEventListener:(name,fn)=>(winListeners[name]??=[]).push(fn)};
  const ctx=vm.createContext({document,window,performance:{now:()=>0},location:{search:'',protocol:'file:'},
    URLSearchParams,devicePixelRatio:2,requestAnimationFrame:fn=>callbacks.push(fn),
    setInterval:()=>1,localStorage:{getItem:()=>null,setItem(){}},
    console,WebSocket:undefined});
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  for(const source of scripts)vm.runInContext(source,ctx,{timeout:1000});
  const draw=(time)=>{strokes.length=0;const fn=callbacks.shift();assert.equal(typeof fn,'function','render must reschedule itself');fn(time);return strokes.slice();};
  return {draw,fields:elements,events:winListeners,counts:()=>({offscreenStrokes,framesDrawn,callbacks:callbacks.length})};
}

test('standalone initializes, caches BFF stadium, renders at 240 Hz and changes extrapolation without errors',()=>{
  const app=runPage();
  assert.ok(app.counts().offscreenStrokes>15,'BFF stadium segments should be painted to cache');
  const firstStrokes=app.counts().offscreenStrokes;
  app.fields.extrapolation.value='120';app.fields.extrapolation.fire('input');
  assert.equal(app.fields.extrapValue.textContent,'120 ms');
  for(let i=1;i<=720;i++)app.draw(i*1000/240);
  assert.equal(app.counts().framesDrawn,720);
  assert.equal(app.counts().offscreenStrokes,firstStrokes,'field geometry must not be re-drawn per frame');
  assert.match(app.fields.fpsMeter.textContent,/\b240 FPS\b/);
  assert.match(app.fields.status.textContent,/BFF Big v4/);
  assert.equal(app.counts().callbacks,1,'one animation loop and no duplicates');
});

test('keyboard input and 0ms extrapolation continue to render at high refresh rates',()=>{
  const app=runPage();
  app.events.keydown[0]({code:'KeyD',preventDefault(){}});
  for(let i=1;i<=288;i++)app.draw(i*1000/144);
  app.events.keyup[0]({code:'KeyD'});
  assert.equal(app.counts().framesDrawn,288);
  assert.match(app.fields.fpsMeter.textContent,/\b144 FPS\b/);
  assert.equal(app.fields.extrapValue.textContent,'0 ms');
});

// Verify the exact paint operations, not just that 'something bright' was drawn.
// HaxBall's kick indicator replaces the colored player's black outline in situ.
function localOutline(strokes){
  const selection=strokes.find(s=>s.r===25&&s.color==='rgba(255,255,255,0.33)');
  assert.ok(selection,'selected player must have a translucent circle scaled from the reference screenshot');
  assert.equal(selection.width,2.4,'outer circle thickness follows the screenshot');
  const border=strokes.find(s=>s.r===15&&s.x===selection.x&&s.y===selection.y);
  assert.ok(border,'selected player must have a visible border');
  assert.equal(border.width,1.8,'inner white/black border thickness follows screenshot');
  assert.equal(strokes.some(s=>s.r===23),false,'extra outer flash ring is forbidden');
  assert.ok(!strokes.some(s=>s.color==='#fff8d8'),'old bright flash ring must be gone');
  return border;
}

test('holding shoot makes player black outline solid white in EVERY frame, even before ball contact',()=>{
  const app=runPage();
  let image=app.draw(1000/144);
  assert.equal(localOutline(image).color,'#1b1b1b');
  app.events.keydown[0]({code:'Space',preventDefault(){}});
  // Check immediate response before the physics simulation has even run.
  image=app.draw(2000/144);
  assert.equal(localOutline(image).color,'#ffffff');
  for(let i=3;i<=230;i++){
    image=app.draw(i*1000/144);
    assert.equal(localOutline(image).color,'#ffffff',`held shoot flickered at frame ${i}`);
  }
  app.events.keyup[0]({code:'Space'});
  image=app.draw(231*1000/144);
  assert.equal(localOutline(image).color,'#1b1b1b','releasing shoot must immediately restore black');
});

test('continuous kick outline is also preserved at 240 Hz with extrapolation enabled',()=>{
  const app=runPage();
  app.fields.extrapolation.value='180';app.fields.extrapolation.fire('input');
  app.events.keydown[0]({code:'Space',preventDefault(){}});
  for(let i=1;i<=260;i++){
    const strokes=app.draw(i*1000/240);
    assert.equal(localOutline(strokes).color,'#ffffff');
  }
  app.events.keyup[0]({code:'Space'});
  assert.equal(localOutline(app.draw(261*1000/240)).color,'#1b1b1b');
});

test('selection circle matches screenshot spacing and appears around local player only',()=>{
  const app=runPage();const strokes=app.draw(1000/144);
  const markers=strokes.filter(s=>s.r===25&&s.color==='rgba(255,255,255,0.33)');
  assert.equal(markers.length,1,'only selected player has outer ring');
  const marker=markers[0];
  const rim=strokes.find(s=>s.r===15&&s.x===marker.x&&s.y===marker.y);
  assert.ok(rim);
  assert.ok((marker.r/15)>1.65&&(marker.r/15)<1.68,'selection radius matches ~74px / ~45px');
  assert.ok(marker.r-marker.width/2 > rim.r+rim.width/2+6,'visible gap stays clear for small ball');
});