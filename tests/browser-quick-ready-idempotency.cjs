'use strict';
// Synthetic queue receipts only; no real users, matchmaking or production server.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('../headless/server.cjs');
(async()=>{
 const app=createServer({peerHosting:false,dataDir:null});
 const {port}=await app.listen(0);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port+'/');
  const prepared=await page.evaluate(port=>{
   document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
   settings.account={token:'synthetic-test-token'};
   connectServer=()=>true;
   window.__sent=[];
   const began=window.startPartyQuickMatch('2v2');
   serverLink={ws:{readyState:1},send:msg=>window.__sent.push(msg),room:null};
   const now=Date.now();
   window.__proposal={type:'queueReady',id:'test-proposal-A',mode:'2v2',players:4,humanOnly:true,expiresAt:now+15000,serverNow:now};
   window.onQuickMatchEvent(window.__proposal);
   return began;
  },port);
  assert.equal(prepared,true,'human search fixture starts only by explicit click');
  const ready=page.locator('.quick-ready');
  await ready.locator('button.primary').click();
  let result=await page.evaluate(()=>({votes:__sent.length,disabled:document.querySelector('.quick-ready .primary').disabled}));
  assert.equal(result.votes,1,'one explicit acceptance sent');
  assert.equal(result.disabled,true,'pending receipt blocks duplicate consent');
  await page.evaluate(()=>window.onQuickMatchEvent({...window.__proposal,expiresAt:Date.now()+60000}));
  result=await page.evaluate(()=>({disabled:document.querySelector('.quick-ready .primary').disabled,text:document.querySelector('.quick-ready-progress').textContent}));
  assert.equal(result.disabled,true,'duplicate proposal must not unlock pending vote');
  assert.match(result.text,/Sending|Waiting/i,'duplicate preserves pending receipt status');
  await page.evaluate(()=>window.onQuickMatchEvent({type:'queueReadyAccepted',id:'test-proposal-A',ready:1}));
  await page.evaluate(()=>window.onQuickMatchEvent({...window.__proposal,expiresAt:Date.now()+60000}));
  result=await page.evaluate(()=>({disabled:document.querySelector('.quick-ready .primary').disabled,text:document.querySelector('.quick-ready-progress').textContent}));
  assert.equal(result.disabled,true,'duplicate cannot reset server-confirmed human consent');
  assert.match(result.text,/Server received your acceptance/i,'confirm remains server-authoritative');
  await page.evaluate(()=>{
   window.onQuickMatchEvent({type:'queueReadyProgress',id:'test-proposal-A',ready:3});
   window.onQuickMatchEvent({type:'queueReadyProgress',id:'test-proposal-A',ready:1});
   window.onQuickMatchEvent({type:'queueReadyAccepted',id:'test-proposal-A',ready:2});
  });
  assert.match(await ready.locator('.quick-ready-progress').textContent(),/3 \/ 4 confirmed/,
   'delayed out-of-order progress/ack cannot erase real accepted votes');
  await page.evaluate(()=>window.onQuickMatchEvent({type:'queueReady',...window.__proposal,id:'test-proposal-B'}));
  result=await page.evaluate(()=>({disabled:document.querySelector('.quick-ready .primary').disabled,text:document.querySelector('.quick-ready-progress').textContent}));
  assert.equal(result.disabled,false,'a genuinely different proposal gets independent explicit consent');
  // The server can cancel a newly formed match before a client has the room
  // receipt. The resulting unadmitted quick-queue WebSocket must be released
  // so a deliberate new search is not blocked by orphan session guards.
  await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:null,ws:{readyState:1,onclose:null,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   window.onQuickMatchEvent({type:'quickMatchCancelled',reason:'A team left before room receipt.'});
  });
  assert.equal(await page.evaluate(()=>serverLink),null,
   'server cancellation before room receipt tears down orphan queue transport');
  assert.equal(await page.evaluate(()=>window.startPartyQuickMatch('2v2')),true,
   'human can explicitly start a fresh search after terminal cancellation');
  // Server cancellation *after* a room receipt is not a leave request.
  // Keep the joined room for a player to inspect and explicitly exit.
  assert.equal(await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:'SYNTHETICROOM',ws:{readyState:1,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   const before=serverLink;
   window.onQuickMatchEvent({type:'quickMatchCancelled',reason:'A player left the room.'});
   return serverLink===before;
  }),true,'cancelled in-room game is not silently disconnected');
  // The server may already have announced a match before its room receipt.
  // A subsequent cancellation must still offer an explicit Retry, even
  // though quickMatchFound already cleared the local 'searching' flag.
  await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:null,ws:{readyState:1,onclose:null,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   window.onQuickMatchEvent({type:'quickMatchFound',mode:'2v2',players:4});
   window.onQuickMatchEvent({type:'quickMatchCancelled',reason:'Room closed before receipt.'});
  });
  assert.equal(await page.evaluate(()=>serverLink),null,
   'pre-room cancel after match-found releases orphan transport');
  assert.equal(await page.locator('.quick-queue-recovery').evaluate(e=>e.hidden),false,
   'server cancellation after match found still offers explicit human retry');
  // A player in My Games cannot see the Home-only recovery card. The
  // existing global human dock should explicitly link to the recovery,
  // without initiating a new search or accepting another ready check.
  await page.evaluate(()=>document.getElementById('tabReplay').click());
  await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),false,
   'cancelled pre-room match is visible from My Games immediately');
  assert.match(await page.locator('.quick-ready-dock-progress').innerText(),
   /room closed before receipt/i,'recovery shows actual server cancellation reason');
  assert.equal(await page.locator('.quick-ready-dock-actions button.primary').isVisible(),false,
   'recovery does not offer an unapproved automatic ready confirmation');
  await page.locator('.quick-ready-dock-actions .quick-dock-review').click();
  assert.equal(await page.evaluate(()=>document.getElementById('homeView').hidden),false,
   'recovery dock returns to Play instead of creating a new human search');
  assert.equal(await page.locator('.quick-queue-recovery').evaluate(e=>e.hidden),false,
   'native explicit Retry remains available after navigation');
  // A server may publish a terminal queueStatus rather than a separate
  // quickMatchCancelled. Match-found already cleared searching but a room
  // receipt has not arrived; this still needs explicit human recovery.
  await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:null,ws:{readyState:1,onclose:null,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   window.onQuickMatchEvent({type:'quickMatchFound',mode:'2v2',players:4});
   window.onQuickMatchEvent({type:'queueStatus',status:'cancelled',
    reason:'Server ended before room admission.'});
  });
  assert.equal(await page.evaluate(()=>serverLink),null,
   'terminal queueStatus after match-found releases unadmitted transport');
  assert.equal(await page.locator('.quick-queue-recovery').evaluate(e=>e.hidden),false,
   'terminal queueStatus after match-found offers explicit human Retry');
  // When cancellation arrives while My Games is open, the player should
  // recover from the visible dock with one *explicit* click. Synthetic
  // localhost messages are not a user session or a real match.
  await page.evaluate(()=>{
   document.getElementById('tabReplay').click();
   window.__recoveryQueueCalls=0;
   window.__partyOpenCalls=0;
   window.openFriendParty=()=>{window.__partyOpenCalls++;};
   connectServer=()=>{window.__recoveryQueueCalls++;return true;};
  });
  await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  const partyRecover=page.locator('.quick-ready-dock-actions .quick-dock-retry');
  assert.match(await partyRecover.innerText(),/open friends party/i,
   'expired party consent never becomes an automatic queue retry');
  await partyRecover.click();
  assert.equal(await page.evaluate(()=>window.__partyOpenCalls),1,
   'party recovery navigates to friends party only after explicit action');
  assert.equal(await page.evaluate(()=>window.__recoveryQueueCalls),0,
   'party recovery never launches a search without teammate consent');
  await page.evaluate(()=>document.getElementById('tabHome').click());
  await page.locator('.quick-queue-shortcut button.primary').click();
  assert.equal(await page.evaluate(()=>window.__recoveryQueueCalls),1,
   'fresh regular 2v2 search requires a deliberate native action');
  await page.evaluate(()=>window.onQuickMatchEvent({type:'queueStatus',status:'cancelled',
   reason:'Regular human queue interrupted.'}));
  await page.evaluate(()=>document.getElementById('tabReplay').click());
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),false);
  const globalRetry=page.locator('.quick-ready-dock-actions .quick-dock-retry');
  assert.equal(await globalRetry.isVisible(),true,
   'My Games recovery offers a real, explicit Retry action without navigating home');
  assert.match(await globalRetry.innerText(),/retry.*human/i);
  assert.equal(await page.evaluate(()=>window.__recoveryQueueCalls),1,
   'navigation never launches a new human queue automatically');
  const bounds=await globalRetry.boundingBox();
  assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844,
   'mobile dock Retry fits inside a 390px viewport and remains touchable');
  await globalRetry.click();
  assert.equal(await page.evaluate(()=>window.__recoveryQueueCalls),2,
   'one deliberate dock click forwards to the original human queue action once');
  assert.equal(await page.locator('.quick-queue-recovery').evaluate(e=>e.hidden),true,
   'new human search clears stale terminal recovery');
  assert.equal(await page.evaluate(()=>document.getElementById('homeView').hidden),true,
   'recovery can be acted on directly from My Games');
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),true,
   'dock closes after a new explicit search instead of suggesting autoacceptance');
  assert.equal(await page.evaluate(()=>window.__sent.length),1,
   'retry never fabricates a second ready consent');
  await page.evaluate(()=>window.onQuickMatchEvent({type:'queueStatus',status:'cancelled',
   reason:'Server cancelled next search.'}));
  const dismiss=page.locator('.quick-ready-dock-actions .quick-dock-dismiss');
  assert.equal(await dismiss.isVisible(),true,'terminal recovery can be dismissed on My Games');
  await dismiss.click();
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),true);
  assert.equal(await page.evaluate(()=>window.__recoveryQueueCalls),2,
   'dismissing a recovery never queues another match');
  // A synchronous transport exception must never trap a human in
  // "Searching" with no socket or usable Retry. Event data is synthetic.
  await page.evaluate(()=>{
   document.getElementById('tabHome').click();
   connectServer=()=>{throw Error('synthetic transport constructor failure');};
  });
  await page.locator('.quick-queue-shortcut button.primary').click();
  assert.equal(await page.locator('.quick-queue-recovery').evaluate(e=>e.hidden),false,
   'transport constructor exception exposes manual recovery rather than hanging');
  assert.equal(await page.locator('.quick-queue-actions button').evaluate(e=>e.hidden),true,
   'no phantom searching state after a synchronous connect exception');
  // A second explicitly requested retry can connect, but never autoaccept.
  await page.evaluate(()=>{
   window.__transportRetry=0;
   connectServer=()=>{window.__transportRetry++;return true;};
   document.getElementById('tabReplay').click();
  });
  await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
  await page.locator('.quick-ready-dock-actions .quick-dock-retry').click();
  assert.equal(await page.evaluate(()=>window.__transportRetry),1,
   'an explicit cross-view Retry can recover the transport exception');
  // Browser offline while not admitted must release the old transport,
  // show an honest recovery, and never queue without another click.
  await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:null,ws:{readyState:1,onclose:null,
    send:()=>{},close(){this.readyState=3}},send:()=>{}};
   window.dispatchEvent(new Event('offline'));
  });
  assert.equal(await page.evaluate(()=>serverLink),null,
   'offline during search releases the unadmitted WebSocket');
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),false,
   'offline human-search recovery remains visible in My Games');
  assert.match(await page.locator('.quick-ready-dock-progress').innerText(),
   /offline|network/i);
  assert.equal(await page.evaluate(()=>window.__transportRetry),1,
   'offline never automatically queues another match');
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',
   {configurable:true,value:false}));
  await page.locator('.quick-ready-dock-actions .quick-dock-retry').click();
  assert.equal(await page.evaluate(()=>window.__transportRetry),1,
   'manual Retry while offline does not create a false new human search');
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),false,
   'offline retry keeps recovery instructions accessible');
  await page.evaluate(()=>Object.defineProperty(navigator,'onLine',
   {configurable:true,value:true}));
  await page.locator('.quick-ready-dock-actions .quick-dock-retry').click();
  assert.equal(await page.evaluate(()=>window.__transportRetry),2,
   'restored connectivity supports a new deliberate human search');
  // A server match-found event ends Searching *before* the room receipt.
  // If this device then goes offline, the unadmitted socket must still be
  // released and the real player must receive an explicit recovery choice.
  await page.evaluate(()=>{
   window.__postFoundCloseCount=0;
   serverLink={quickMatchMode:'2v2',room:null,reconnect:false,ws:{readyState:1,
    send:()=>{},close(){window.__postFoundCloseCount++;this.readyState=3}},send:()=>{}};
   window.onQuickMatchEvent({type:'quickMatchFound',mode:'2v2',players:4});
   window.dispatchEvent(new Event('offline'));
  });
  assert.equal(await page.evaluate(()=>serverLink),null,
   'offline after match-found but before room receipt releases orphan queue');
  assert.equal(await page.evaluate(()=>window.__postFoundCloseCount),1,
   'offline releases unadmitted post-match-found socket exactly once');
  assert.equal(await page.locator('.quick-ready-dock').evaluate(e=>e.hidden),false,
   'offline after match-found offers My Games human recovery');
  assert.match(await page.locator('.quick-ready-dock-progress').innerText(),/offline|network/i);
  assert.equal(await page.evaluate(()=>window.__transportRetry),2,
   'offline never silently retries or reaccepts a matched human');
  // A joined room is still authoritative and must never be kicked by
  // an unrelated offline event on another browser window.
  const preserved=await page.evaluate(()=>{
   serverLink={quickMatchMode:'2v2',room:'SYNTHETIC_JOINED',ws:{readyState:1,
    close(){throw Error('joined socket must remain')}},send:()=>{}};
   const before=serverLink;
   window.dispatchEvent(new Event('offline'));
   return before===serverLink;
  });
  assert.equal(preserved,true,'offline event cannot disconnect an already joined room');
  // The real headless WebSocket server rejects an invalid account token on
  // queueJoin. That error must become honest human-search recovery rather
  // than opening an unrelated generic network-dialog modal. Synthetic
  // invalid token: never treated as real human matchmaking.
  const rejectPage=await browser.newPage();
  try{
   const rejectErrors=[];
   rejectPage.on('pageerror',e=>rejectErrors.push(e.message));
   await rejectPage.goto('http://127.0.0.1:'+port+'/');
   await rejectPage.evaluate(port=>{
    settings.account={token:'synthetic-invalid-quick-token'};
    document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
   },port);
   await rejectPage.locator('.quick-queue-shortcut button.primary').click();
   await rejectPage.locator('.quick-queue-recovery').waitFor({state:'visible',timeout:7000});
   assert.match(await rejectPage.locator('.quick-queue-recovery p').innerText(),
    /log in to search for real human players/i,
    'native queue rejection explains the actual server-authenticated reason');
   assert.equal(await rejectPage.locator('#networkDialog').evaluate(e=>e.open),false,
    'human queue rejection does not leave a generic network dialog blocking Retry');
   const rejectedRetry=rejectPage.locator('.quick-queue-recovery button.primary');
   assert.match(await rejectedRetry.innerText(),/sign in/i,
    'server-auth rejection routes to account sign-in, not futile same-token retry');
   await rejectPage.evaluate(()=>{
    window.__unexpectedQueueReconnect=0;
    window.__originalAuthRecoveryConnect=connectServer;
    connectServer=()=>{window.__unexpectedQueueReconnect++;return true;};
   });
   await rejectedRetry.click();
   assert.equal(await rejectPage.locator('#joinScreen').evaluate(e=>e.hidden),false,
    'explicit sign-in action opens native account flow');
   assert.equal(await rejectPage.locator('#joinAuth').evaluate(e=>e.hidden),false,
    'account form is actionable even with an expired local token');
   assert.equal(await rejectPage.evaluate(()=>window.__unexpectedQueueReconnect),0,
    'account sign-in action cannot resend the rejected token to human queue');
   assert.equal(await rejectPage.evaluate(()=>serverLink),null,
    'rejected real WebSocket queue transport is released');
   // The native login handler emits the account-changed event after issuing
   // a new credential. Simulate that event without storing real credentials.
   await rejectPage.evaluate(()=>{
    settings.account={token:'synthetic-rotated-session'};
    window.dispatchEvent(new Event('fuckball:account-changed'));
    // Native authRequest hides the form only after a successful response.
    document.getElementById('joinScreen').hidden=true;
   });
   assert.match(await rejectedRetry.innerText(),/retry.*human/i,
    'a new account credential restores manual Retry, not a sign-in loop');
   assert.equal(await rejectPage.evaluate(()=>window.__unexpectedQueueReconnect),0,
    'account change event does not start matchmaking');
   assert.equal(await rejectPage.evaluate(()=>serverLink),null,
    'account change event does not create a WebSocket');
   await rejectPage.evaluate(()=>{
    window.__explicitAuthRetryCalls=0;
    const original=window.__originalAuthRecoveryConnect;
    connectServer=(...args)=>{
     window.__explicitAuthRetryCalls++;
     return original(...args);
    };
   });
   await rejectedRetry.click();
   assert.equal(await rejectPage.evaluate(()=>window.__explicitAuthRetryCalls),1,
    'one deliberate Retry reaches the native connect path exactly once');
   // This synthetic replacement token is still invalid server-side.
   // Confirm that denial returns to sign-in, not a fictional queued match.
   await rejectPage.waitForFunction(()=>!document.querySelector(
    '.quick-queue-recovery').hidden);
   assert.match(await rejectedRetry.innerText(),/sign in/i,
    'a second server auth rejection never claims a human queue succeeded');
   assert.equal(await rejectPage.evaluate(()=>window.__explicitAuthRetryCalls),1,
    'native denial does not retry without consent');
   assert.equal(await rejectPage.locator('.quick-queue-actions button').evaluate(e=>e.hidden),true,
    'rejected queue never appears to be actively searching');
   assert.deepEqual(rejectErrors,[],'no runtime exception on real rejected WebSocket');
  }finally{await rejectPage.close();}
  // Signing out in the browser must also terminate an unadmitted human queue.
  // This uses a synthetic in-memory WebSocket, never real human accounts.
  const logoutPage=await browser.newPage();
  try{
   const logoutErrors=[];
   logoutPage.on('pageerror',e=>logoutErrors.push(e.message));
   await logoutPage.goto('http://127.0.0.1:'+port+'/');
   await logoutPage.evaluate(port=>{
    settings.account={username:'Synthetic',token:'synthetic-logout-session'};
    renderAccount();
    document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
    window.__logoutSockets=0;window.__logoutCloses=0;
    window.WebSocket=class{
     constructor(){window.__logoutSockets++;this.readyState=1;queueMicrotask(()=>this.onopen?.());}
     send(){}
     close(){window.__logoutCloses++;this.readyState=3;}
    };
   },port);
   await logoutPage.locator('.quick-queue-shortcut button.primary').click();
   assert.equal(await logoutPage.evaluate(()=>window.__logoutSockets),1);
   assert.equal(await logoutPage.locator('.quick-queue-actions button').evaluate(e=>e.hidden),false);
   await logoutPage.locator('#accountButton').evaluate(e=>e.click());
   assert.equal(await logoutPage.evaluate(()=>settings.account),null,'local sign-out clears identity');
   assert.equal(await logoutPage.evaluate(()=>serverLink),null,
    'sign-out must release unadmitted queue socket');
   assert.equal(await logoutPage.evaluate(()=>window.__logoutCloses),1,
    'sign-out closes the old authenticated socket once');
   assert.equal(await logoutPage.locator('.quick-queue-actions button').evaluate(e=>e.hidden),true,
    'sign-out ends ghost searching');
   assert.match(await logoutPage.locator('.quick-queue-recovery button.primary').innerText(),/sign in/i,
    'old account cannot silently requeue after sign-out');
   await logoutPage.locator('.quick-queue-recovery button.primary').click();
   assert.equal(await logoutPage.locator('#joinAuth').evaluate(e=>e.hidden),false,
    'sign-in action is explicitly reachable');
   assert.equal(await logoutPage.evaluate(()=>window.__logoutSockets),1,
    'sign-in navigation does not start another queue');
   // New server-issued credentials restore manual Retry; a second account
   // switch during that queue cancels the old socket without auto-requeue.
   await logoutPage.evaluate(()=>{
    settings.account={username:'Synthetic2',token:'synthetic-rotated-logout-session'};
    window.dispatchEvent(new Event('fuckball:account-changed'));
    document.getElementById('joinScreen').hidden=true;
   });
   assert.match(await logoutPage.locator('.quick-queue-recovery button.primary').innerText(),/retry/i);
   assert.equal(await logoutPage.evaluate(()=>window.__logoutSockets),1);
   await logoutPage.locator('.quick-queue-recovery button.primary').click();
   assert.equal(await logoutPage.evaluate(()=>window.__logoutSockets),2);
   await logoutPage.evaluate(()=>{
    settings.account={username:'Synthetic3',token:'synthetic-third-session'};
    window.dispatchEvent(new Event('fuckball:account-changed'));
   });
   assert.equal(await logoutPage.evaluate(()=>serverLink),null,
    'switching accounts releases stale human admission');
   assert.equal(await logoutPage.evaluate(()=>window.__logoutSockets),2,
    'account change never silently starts new human queue');
   assert.match(await logoutPage.locator('.quick-queue-recovery button.primary').innerText(),/retry/i,
    'new signed-in account requires explicit Retry');
   assert.deepEqual(logoutErrors,[]);
  }finally{await logoutPage.close();}
  // Simulate a delayed /api/me rejection for a previous saved token after
  // the player has already signed in with a new account in this tab.
  const stalePage=await browser.newPage();
  try{
   await stalePage.addInitScript(()=>{
    localStorage.setItem('fuckball.settings',JSON.stringify({
     account:{username:'SyntheticOld',token:'synthetic-old-lookup'}}));
    const realFetch=window.fetch.bind(window);
    window.fetch=(url,...args)=>url==='/api/me'?new Promise(resolve=>{
     window.__oldAccountReject=()=>resolve({status:401});
    }):realFetch(url,...args);
   });
   await stalePage.goto('http://127.0.0.1:'+port+'/');
   const result=await stalePage.evaluate(async()=>{
    settings.account={username:'SyntheticFresh',token:'synthetic-new-lookup'};
    window.dispatchEvent(new Event('fuckball:account-changed'));
    window.__oldAccountReject();
    await new Promise(resolve=>setTimeout(resolve,0));
    return settings.account?.username;
   });
   assert.equal(result,'SyntheticFresh',
    'late 401 for old startup token must not discard newer signed-in identity');
  }finally{await stalePage.close();}
  // Editing the target server during a human search must not leave the
  // old server silently matchmaking while the interface shows a new server.
  const switchPage=await browser.newPage();
  try{
   await switchPage.goto('http://127.0.0.1:'+port+'/');
   await switchPage.evaluate(port=>{
    settings.account={username:'Synthetic',token:'synthetic-server-selection-token'};
    renderAccount();
    document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
    window.__serverSwitchSockets=[];window.__serverSwitchCloses=0;
    window.WebSocket=class{
     constructor(url){this.url=url;window.__serverSwitchSockets.push(url);
      this.readyState=1;queueMicrotask(()=>this.onopen?.());}
     send(){}
     close(){this.readyState=3;window.__serverSwitchCloses++;}
    };
   },port);
   await switchPage.locator('.quick-queue-shortcut button.primary').click();
   assert.equal(await switchPage.evaluate(()=>window.__serverSwitchSockets.length),1);
   await switchPage.evaluate(port=>{
    const el=document.getElementById('serverAddress');
    el.value='ws://127.0.0.1:'+(port+1)+'/ws';el.dispatchEvent(new Event('change'));
   },port);
   assert.equal(await switchPage.evaluate(()=>serverLink),null,
    'changing selected server stops the old unadmitted human queue');
   assert.equal(await switchPage.evaluate(()=>window.__serverSwitchCloses),1,
    'old server matchmaking socket closed exactly once');
   assert.equal(await switchPage.locator('.quick-queue-actions button').evaluate(e=>e.hidden),true,
    'server change does not display ghost Searching');
   assert.match(await switchPage.locator('.quick-queue-recovery button.primary').innerText(),/retry/i);
   assert.equal(await switchPage.evaluate(()=>window.__serverSwitchSockets.length),1,
    'choosing another server never automatically starts another queue');
   await switchPage.locator('.quick-queue-recovery button.primary').click();
   assert.equal(await switchPage.evaluate(()=>window.__serverSwitchSockets.length),2,
    'human explicit Retry starts one queue on selected new server');
   assert.match((await switchPage.evaluate(()=>String(window.__serverSwitchSockets[1]))),
    new RegExp(':'+String(port+1)+'/ws'),'new search uses new selected server');
   // An already admitted room is not automatically disconnected by a
   // subsequent address edit; only the user can choose to leave that game.
   assert.equal(await switchPage.evaluate(()=>{
    serverLink.room='SYNTHETIC_JOINED';const joined=serverLink;
    const address=document.getElementById('serverAddress');
    address.value='ws://127.0.0.1:1/ws';address.dispatchEvent(new Event('change'));
    return serverLink===joined;
   }),true,'address editing preserves already joined room');
  }finally{await switchPage.close();}
  // Native sessionRevoked receipts and WebSocket close code 4004 are
  // separate genuine client paths; synthetic server transport only.
  // Both must remove a ghost human queue and require new authentication.
  for(const revokeVia of ['message','close']){
   const revokedPage=await browser.newPage();
   try{
    const revokedErrors=[];
    revokedPage.on('pageerror',e=>revokedErrors.push(e.message));
    await revokedPage.goto('http://127.0.0.1:'+port+'/');
    await revokedPage.evaluate(port=>{
     settings.account={token:'synthetic-revoked-local-token'};
     document.getElementById('serverAddress').value='ws://127.0.0.1:'+port+'/ws';
     window.__fakeAuthSockets=0;
     window.WebSocket=class{
      constructor(){
       window.__fakeAuthSockets++;
       this.readyState=1;
       queueMicrotask(()=>this.onopen?.());
      }
      send(){}
      close(){this.readyState=3;}
     };
    },port);
    await revokedPage.locator('.quick-queue-shortcut button.primary').click();
    assert.equal(await revokedPage.evaluate(()=>window.__fakeAuthSockets),1);
    await revokedPage.evaluate(kind=>{
     const ws=serverLink.ws;
     if(kind==='message')ws.onmessage({data:JSON.stringify({
      type:'sessionRevoked',reason:'Account session revoked.'})});
     else ws.onclose({code:4004});
    },revokeVia);
    assert.equal(await revokedPage.locator('.quick-queue-recovery').evaluate(e=>e.hidden),false,
     'revocation via '+revokeVia+' restores visible human recovery');
    assert.match(await revokedPage.locator('.quick-queue-recovery button.primary').innerText(),
     /sign in/i,'revoked token cannot be offered futile immediate Retry');
    assert.equal(await revokedPage.evaluate(()=>serverLink),null,
     'revoked queue socket released instead of claiming a live room');
    assert.equal(await revokedPage.locator('.quick-queue-actions button').evaluate(e=>e.hidden),true,
     'revocation ends phantom searching state');
    assert.equal(await revokedPage.evaluate(()=>window.__fakeAuthSockets),1,
     'revocation must never reconnect the rejected queue');
    await revokedPage.locator('.quick-queue-recovery button.primary').click();
    assert.equal(await revokedPage.locator('#joinAuth').evaluate(e=>e.hidden),false,
     'manual sign-in opens native login form');
    assert.deepEqual(revokedErrors,[]);
   }finally{await revokedPage.close();}
  }
  assert.deepEqual(errors,[],'no Chromium runtime errors');
  console.log('PASS Chromium duplicate ready receipts preserve pending and server-confirmed consent; new proposal remains actionable');
 }finally{await browser.close();await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
