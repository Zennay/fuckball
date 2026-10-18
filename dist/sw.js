'use strict';
// Offline support is EXCLUSIVELY for local, casual browser practice and user-owned
// replay playback. Do not cache credentials, account APIs, matchmaking, rooms
// or any live match state. Every online action still requires the actual server.
const CACHE='fuckball-offline-practice-v1';
const CORE=[
 "./",
 "./style.css",
 "./club.css",
 "./match.css",
 "./room.css",
 "./my-games.css",
 "./social.css",
 "./clubs.css",
 "./room-admin.css",
 "./room-presets.css",
 "./quick-match.css",
 "./friend-party.css",
 "./room-browser.css",
 "./career-profile.css",
 "./server-results.css",
 "./gamepad.css",
 "./vendor/json5.min.js",
 "./vendor/pako-jszip.min.js",
 "./vendor/haxball.js",
 "./vendor/language.js",
 "./vendor/renderer.js",
 "./ai/policy.js",
 "./prediction-controls.js",
 "./netcode.js",
 "./room-core.js",
 "./peer-net.js",
 "./render-timing.js",
 "./stadiums/bff-big-v4.js",
 "./app.js",
 "./views.js",
 "./match-ui.js",
 "./server-client.js",
 "./replay-library.js",
 "./replay-archive.js",
 "./replay-bookmarks.js",
 "./social.js",
 "./clubs.js",
 "./room-admin.js",
 "./room-presets.js",
 "./quick-match.js",
 "./friend-party.js",
 "./room-browser.js",
 "./career-profile.js",
 "./server-results.js",
 "./gamepad.js",
 "./pwa.js",
 "./pwa.css",
 "./manifest.json",
 "./icons/fuckball-192.png",
 "./icons/fuckball-512.png"
];
const scope=new URL(self.registration.scope);
const root=scope.pathname;
const allow=new Set(CORE.map(p=>new URL(p,scope).pathname));
const shell=new URL('./',scope).href;

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // An incomplete offline copy must not be activated or shown as ready.
  // Precaching a bounded allowlist avoids ever touching private endpoints.
  await cache.addAll(CORE.map(p=>new Request(new URL(p,scope),{
   cache:'reload',credentials:'omit'
  })));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())
   if(key.startsWith('fuckball-offline-practice-')&&key!==CACHE)
    await caches.delete(key);
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==scope.origin||!url.pathname.startsWith(root))return;
 if(request.mode==='navigate'){
  // A private match invitation MUST NOT turn into a fake offline online room.
  // Queries are always resolved by the live origin, never an offline shell.
  event.respondWith((async()=>{
   try{
    const response=await fetch(request);
    if(response.ok&&url.pathname===root&&!url.search){
     const cache=await caches.open(CACHE);
     await cache.put(shell,response.clone());
    }
    return response;
   }catch{
    if(url.pathname===root&&!url.search){
     const cached=await (await caches.open(CACHE)).match(shell);
     if(cached)return cached;
    }
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fuckball is offline</title><body style="font:16px system-ui;background:#15272e;color:#f0f8ed;padding:24px"><h1>Connection needed</h1><p>Joining online rooms needs the game server. Reconnect and reopen the invitation. Offline practice is available from the installed app home screen.</p><a href="./" style="color:#d3f4aa">Open local practice</a></body></html>',{
     status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
    });
   }
  })());
  return;
 }
 // Only explicitly packaged, public assets are eligible. /api, /health, /ws,
 // account endpoints, arbitrary paths and all query-bearing responses bypass SW.
 if(!allow.has(url.pathname)||url.search)return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(request);
   if(response.ok&&response.type==='basic'){
    const cache=await caches.open(CACHE);
    await cache.put(request,response.clone());
   }
   return response;
  }catch{
   const cached=await (await caches.open(CACHE)).match(request);
   return cached||Response.error();
  }
 })());
});
