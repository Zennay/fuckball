'use strict';
// Pure-Node browser harness: exercises the real bundled HTML without a GPU,
// which is useful when sandboxed Chromium cannot start.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function runPage({savedExtrapolation=null,extrapVersion=null,online=false}={}){
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
      this.children=[];this.listeners={};this.dataset={};
      const classes=new Set();
      this.classList={add:(name)=>classes.add(name),remove:(name)=>classes.delete(name),
        toggle:(name,force)=>{const next=force===undefined?!classes.has(name):!!force;
          if(next)classes.add(name);else classes.delete(name);return next;},
        contains:(name)=>classes.has(name)};
      this.style={};this.attrs={};this.width=1700;this.height=800;
    }
    setAttribute(key,value){this.attrs[key]=String(value);}
    getAttribute(key){return this.attrs[key]??null;}
    focus(){this.focused=true;}
    blur(){this.focused=false;}
    click(){this.fire('click');}
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
  const callbacks=[],winListeners={},intervals=[],sent=[];let now=0,ws;
  class MockSocket{
    static OPEN=1;
    constructor(){this.readyState=1;ws=this;}
    send(data){sent.push(JSON.parse(data));}
    close(){this.readyState=3;}
  }
  const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),
    createTextNode:text=>({textContent:text}),
    querySelectorAll:()=>[],activeElement:new Element()};
  const window={addEventListener:(name,fn)=>(winListeners[name]??=[]).push(fn)};
  const ctx=vm.createContext({document,window,performance:{now:()=>now},location:{search:'',protocol:online?'http:':'file:',host:'localhost'},
    URLSearchParams,devicePixelRatio:2,requestAnimationFrame:fn=>callbacks.push(fn),
    setInterval:fn=>{intervals.push(fn);return intervals.length;},localStorage:{getItem:key=>key==='pulseball.extrapolation'?savedExtrapolation:key==='pulseball.extrapolation.v3'?extrapVersion:null,setItem(){}},
    console,WebSocket:online?MockSocket:undefined});
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  for(const source of scripts)vm.runInContext(source,ctx,{timeout:1000});
  const draw=(time)=>{strokes.length=0;const fn=callbacks.shift();assert.equal(typeof fn,'function','render must reschedule itself');fn(time);return strokes.slice();};
  return {draw,fields:elements,events:winListeners,sent,connect:()=>{elements.create.fire('click');ws.onopen();ws.onmessage({data:JSON.stringify({type:'joined',id:'local',code:'ABC123'})});},advance:ms=>{now+=ms;for(const fn of intervals)fn();},counts:()=>({offscreenStrokes,framesDrawn,callbacks:callbacks.length})};
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

test('multiplayer sends input edges instantly instead of waiting for a 60 Hz poll',()=>{
  const app=runPage({online:true});
  app.connect();
  const firstCount=app.sent.length;
  app.events.keydown[0]({code:'KeyD',preventDefault(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(app.sent.at(-1))),{type:'input',x:1,y:0,kick:false});
  assert.equal(app.sent.length,firstCount+1,'keydown sends immediately');
  app.events.keydown[0]({code:'KeyD',repeat:true,preventDefault(){}});
  assert.equal(app.sent.length,firstCount+1,'repeated keydown cannot flood the server');
  app.advance(50);app.advance(50);
  assert.equal(app.sent.length,firstCount+1,'held state remains on the server without redundant 60 Hz packets');
  app.events.keyup[0]({code:'KeyD'});
  assert.deepEqual(JSON.parse(JSON.stringify(app.sent.at(-1))),{type:'input',x:0,y:0,kick:false});
  assert.equal(app.sent.length,firstCount+2,'release is immediate');
  app.advance(250);
  assert.equal(app.sent.length,firstCount+3,'heartbeat periodically refreshes controls');
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

test('fullscreen game defaults to viewport-filling arena with controls available in a drawer',()=>{
  const app=runPage();
  const canvas=app.fields.pitch;
  canvas.parentElement={getBoundingClientRect:()=>({width:1600,height:650})};
  app.draw(1000/144);
  assert.equal(canvas.style.height,'650.00px');
  assert.equal(canvas.style.width,'1600.00px');
  assert.equal(canvas.width,1600);
  assert.equal(canvas.height,650);
  assert.equal(app.fields.lobbyToggle.attrs['aria-expanded'],undefined);
  app.fields.lobbyToggle.fire('click');
  assert.equal(app.fields.lobbyToggle.attrs['aria-expanded'],'true','room and multiplayer controls must stay reachable');
  app.fields.lobbyToggle.fire('click');
  assert.equal(app.fields.lobbyToggle.attrs['aria-expanded'],'false');
  app.fields.fullscreenBtn.fire('click');
  assert.equal(app.fields.fullscreenBtn.attrs['aria-pressed'],'true','fullscreen fallback works in restricted embedded browsers');
  app.fields.fullscreenBtn.fire('click');
  assert.equal(app.fields.fullscreenBtn.attrs['aria-pressed'],'false');
});

test('render resolution defaults to fast 1x and can be raised without changing simulation timing',()=>{
  const app=runPage();const canvas=app.fields.pitch;
  canvas.parentElement={getBoundingClientRect:()=>({width:1700,height:800})};
  app.draw(1000/240);
  assert.equal(canvas.width,1700,'default canvas uses 1x for high-refresh performance');
  assert.equal(canvas.height,800);
  app.fields.renderQuality.value='2';
  app.fields.renderQuality.fire('change');
  app.draw(2000/240);
  assert.equal(canvas.width,3400,'sharp setting uses 2x device resolution');
  assert.equal(canvas.height,1600);
  for(let i=3;i<=480;i++)app.draw(i*1000/240);
  assert.match(app.fields.fpsMeter.textContent,/240 FPS/);
});

test('0 ms is the responsive default and explicit extrapolation preference is respected',()=>{
  const fresh=runPage();
  assert.equal(fresh.fields.extrapValue.textContent,'0 ms');
  assert.equal(fresh.fields.extrapolation.value,'0');
  assert.equal(fresh.fields.extrapNumber.value,'0');
  const saved=runPage({savedExtrapolation:'45'});
  assert.equal(saved.fields.extrapValue.textContent,'45 ms');
  saved.fields.extrapNumber.value='185';saved.fields.extrapNumber.fire('input');
  assert.equal(saved.fields.extrapValue.textContent,'185 ms');
  assert.equal(saved.fields.extrapolation.value,'185');
  assert.equal(runPage({savedExtrapolation:'135'}).fields.extrapValue.textContent,'0 ms','old 135 ms default is migrated');
  assert.equal(runPage({savedExtrapolation:'135',extrapVersion:'1'}).fields.extrapValue.textContent,'135 ms','explicit post-migration 135 ms remains available');
});
test('Escape opens and closes options and movement input does not leak through the overlay',()=>{
  const app=runPage();
  for(const fn of app.events.keydown)fn({code:'Escape',preventDefault(){}});
  assert.equal(app.fields.optionsScreen.attrs['aria-hidden'],'false');
  assert.equal(app.fields.optionsToggle.attrs['aria-expanded'],'true');
  app.fields.closeOptions.fire('click');
  assert.equal(app.fields.optionsScreen.attrs['aria-hidden'],'true');
  app.fields.optionsToggle.fire('click');
  assert.equal(app.fields.optionsScreen.attrs['aria-hidden'],'false');
  app.fields.resumeGame.fire('click');
  assert.equal(app.fields.optionsScreen.attrs['aria-hidden'],'true');
});
test('solo bot chat answers questions and /extrapolation commands work without multiplayer',()=>{
  const app=runPage();
  assert.equal(app.fields.chatText.disabled,false,'chat must work in solo practice');
  app.fields.chatText.value='/extrapolation 175';app.fields.chatForm.fire('submit');
  assert.equal(app.fields.extrapValue.textContent,'175 ms');
  assert.equal(app.fields.extrapNumber.value,'175');
  const messages=app.fields.chatlog.children.length;
  app.fields.chatText.value='how do I shoot?';app.fields.chatForm.fire('submit');
  assert.equal(app.fields.chatlog.children.length,messages+2,'human and bot both appear in chat');
  const reply=app.fields.chatlog.children.at(-1);
  assert.match(reply.children.at(-1).textContent,/Space/);
  app.fields.chatText.value='/e 999';app.fields.chatForm.fire('submit');
  assert.equal(app.fields.extrapValue.textContent,'175 ms','invalid values must not change prediction');
  app.fields.chatText.value='/extrapolation 0';app.fields.chatForm.fire('submit');
  assert.equal(app.fields.extrapValue.textContent,'0 ms');
});
test('the full-viewport game retains custom BFF map and fullscreen affordance',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(html,/\.playfield\{display:block;background:/);
  assert.match(html,/\.options-screen\{display:none/);
  assert.match(html,/id="fullscreenHint"/);
  assert.match(html,/id="optionsScreen"/);
  assert.match(html,/id="chatDock"/);
  assert.match(html,/function cameraTransform\(state,dt\)/);
  assert.match(html,/const scale=Math.max\(canvas.width\/P.W,canvas.height\/P.H\)/);
});

test('free training has no AI and 4v4 fills seven AI slots around the player',()=>{
  const app=runPage();
  const playersAt=time=>app.draw(time).filter(s=>s.r===15).length;
  assert.equal(playersAt(1000/60),2,'default is 1v1');
  app.fields.soloTeams.value='0';app.fields.soloTeams.fire('change');
  assert.equal(playersAt(2000/60),1,'no hidden opponent in free training');
  app.fields.soloTeams.value='2';app.fields.soloTeams.fire('change');
  assert.equal(playersAt(3000/60),4,'2v2 includes the user and three bots');
  app.fields.soloTeams.value='4';app.fields.soloTeams.fire('change');
  assert.equal(playersAt(4000/60),8,'4v4 includes the user and seven bots');
  assert.match(app.fields.modeTag.textContent,/4v4/);
});
