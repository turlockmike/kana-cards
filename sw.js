/* Offline-first service worker. Cache-first for the app shell so it works with no network. */
const CACHE='kana-v8';
// App shell + the words image/word manifests. Individual images, audio, and cards are
// cached on first view by the runtime fetch handler below — offline-first once seen.
const ASSETS=['./','./index.html','./kana.js','./fsrs.js','./sync.js','./app.js',
              './manifest.json','./icon.svg','./media/img/images.json','./data/words.json',
              './data/sentences.json'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(
    ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  // Never cache cross-origin requests (the cloud-sync Worker) — always hit the network,
  // else a stale pulled deck would be served from cache. App shell is same-origin only.
  if(new URL(e.request.url).origin!==self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit=> hit || fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return res;
    }).catch(()=>hit))
  );
});
