const CACHE='forward-shell-v2';
const CORE=['/','/index.html','/styles.css','/whiteboard.css','/app.js','/daily-report.js','/daily-report.css','/supervision.js','/supervision.css','/whiteboard.js','/kimi.js','/teaching-visuals.js','/voice-class.js','/pwa.js','/manifest.webmanifest','/app-icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith(fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response}).catch(async()=>await caches.match(request)||await caches.match('/index.html')));
});
