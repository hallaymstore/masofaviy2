const CACHE='m2-v98-direct-subject-assign';
const CORE=['/','/styles.css?v=20261008-21','/premium-ui.css?v=20261008-21','/app.js?v=20261009-entry19','/media-client.bundle.js?v=20261009-audio14','/live-proctor-logic.js','/coursework-ui.js','/personal-grades-ui.js','/video-playback-state.js','/lesson-history-ui.js','/global-search-ui.js','/academic-entry-wizard.js','/quiz-composer.js','/terms.html','/privacy.html','/timetable.html','/timetable.js','/manifest.webmanifest','/favicon.svg'];
const STATIC_PATHS=new Set(['/styles.css','/premium-ui.css','/app.js','/media-client.bundle.js','/live-proctor-logic.js','/coursework-ui.js','/personal-grades-ui.js','/video-playback-state.js','/lesson-history-ui.js','/global-search-ui.js','/academic-entry-wizard.js','/quiz-composer.js','/timetable.html','/timetable.js','/manifest.webmanifest','/favicon.svg','/terms.html','/privacy.html']);
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/')));
    return;
  }
  if(!STATIC_PATHS.has(u.pathname))return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
    if(r.ok&&Number(r.headers.get('content-length')||0)<2*1024*1024){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
    return r;
  }).catch(()=>caches.match(e.request)));
});
