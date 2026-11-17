const CACHE='m2-v144-fast-assets';
const CORE=['/','/styles.css?v=20261008-21'];
const STATIC_PATHS=new Set(['/hallaym-pro.css','/hub.css','/hub-ui.js','/certificate.css','/certificate.js','/gamification.css','/gamification-ui.js','/robot-tour.js','/hallaym-motion.css','/hallaym-motion.js','/campus-icons.js','/campus-game.css','/campus-game.js','/accessible-confirm.js','/voice-recognition.js','/voice-controls.js','/voice-assistant.css','/speech.js','/tts-rules.js','/reader-rules.js','/pdf-text.js','/audio-reader.js','/my-books-ui.js','/library-manager-ui.js','/voice-assistant.js','/voice-commands.js','/audio-books.css','/styles.css','/premium-ui.css','/app.js','/media-client.bundle.js','/live-proctor-logic.js','/coursework-ui.js','/personal-grades-ui.js','/video-playback-state.js','/lesson-history-ui.js','/daily-attendance-ui.js','/global-search-ui.js','/academic-entry-wizard.js','/quiz-composer.js','/whiteboard.js','/virtual-lab.js','/units-ui.js','/forms-ui.js','/vendor/qrcode.js','/a11y-boot.js','/a11y.css','/a11y.js','/inclusion-ui.js','/course-plan-ui.js','/resource-center-ui.js','/mobile-ui-compact.css','/telegram-design.css','/hallaym-ui.css','/assets/campus/learning-commons-day.webp','/assets/campus/learning-commons-night.webp','/assets/campus/moon-crisp.webp','/assets/campus/night-star.webp','/timetable.html','/timetable.js','/manifest.webmanifest','/favicon.svg','/terms.html','/privacy.html']);
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(CORE.map(url=>c.add(url)))))});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))]))});
// API requests are always live and never cached. Static photos/fonts and versioned
// assets are served from local cache after first visit, without network blocking.
const assetPath=/^\\/(?:assets\\/campus\\/.*\\.webp|fonts\\/.*\\.woff2)$/i;
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>caches.match('/')));
    return;
  }
  const staticAsset=STATIC_PATHS.has(u.pathname)||assetPath.test(u.pathname);
  if(!staticAsset)return;
  const cacheFirst=assetPath.test(u.pathname)||u.searchParams.has('v');
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const stored=await cache.match(e.request);
    if(cacheFirst&&stored)return stored;
    try{
      const response=await fetch(e.request);
      if(response.ok&&response.type==='basic'){
        const len=Number(response.headers.get('content-length')||0);
        if(!len||len<8*1024*1024)e.waitUntil(cache.put(e.request,response.clone()).catch(()=>{}));
      }
      return response;
    }catch(error){
      if(stored)return stored;
      throw error;
    }
  })());
});