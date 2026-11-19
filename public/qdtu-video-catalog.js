import {UZBEK_LESSONS,lessonsForProgram,LESSONS_PER_MAJOR} from './qdtu-uz-lessons.js';
// QDTU 2026/2027 kunduzgi qabul yo'nalishlari asosidagi ochiq videodarslar katalogi.
// Manba: 2026/2027 bakalavriat kunduzgi qabul jadvali, 21-band.
// Tashqi videolar LMS baholashi / majburiy ko'rish progressiga qo'shilmaydi.
const RAW_PROGRAMS = String.raw`
60410100|Iqtisodiyot|iqtisod
60410200|Buxgalteriya hisobi|iqtisod
60410300|Soliqlar va soliqqa tortish|iqtisod
60410500|Moliya va moliyaviy texnologiyalar|iqtisod
60410600|Bank ishi|iqtisod
60410700|Statistika|iqtisod
60410800|Menejment|iqtisod
60520200|Ekologiya va atrof-muhit muhofazasi|ekologiya
60530400|Gidrologiya|suv
60610100|Axborot tizimlari va texnologiyalari|it
60610300|Kompyuter injiniringi|it
60610400|Dasturiy injiniring|it
60610500|Sun'iy intellekt|it
60610600|Telekommunikatsiya texnologiyalari|it
60611000|Simsiz aloqa va teleradioeshittirish injiniringi|it
60710100|Kimyo muhandisligi|kimyo
60710200|Biotexnologiya|kimyo
60710400|Energetika muhandisligi|energetika
60710500|Elektr muhandisligi|energetika
60710600|Gidroenergetika|energetika
60710700|Elektronika va asbobsozlik|energetika
60710800|Metrologiya va standartlashtirish|energetika
60710900|Texnologik jarayonlar va ishlab chiqarishni avtomatlashtirish|energetika
60711000|Mexatronika va robototexnika|it
60711200|Metallurgiya muhandisligi|sanoat
60711400|Transport vositalari muhandisligi|transport
60711800|Atrof-muhit muhandisligi|ekologiya
60712100|Qayta tiklanuvchi energiya manbalari|energetika
60712300|Mexanika muhandisligi|sanoat
60720300|Materialshunoslik|sanoat
60720400|Texnologik mashinalar va jihozlar|sanoat
60720500|Gazni chuqur qayta ishlash texnologiyasi|neftgaz
60720600|Neft va neft-gazni qayta ishlash texnologiyasi|neftgaz
60720700|Yengil sanoat muhandisligi|sanoat
60720800|Konchilik ishi|neftgaz
60720900|Foydali qazilma konlari geologiyasi, qidiruv va razvedkasi|neftgaz
60721100|Neft va gaz ishi|neftgaz
60721300|Geologiya-qidiruv ishlari texnikasi va texnologiyasi|neftgaz
60721500|Geodeziya va geoinformatika|qurilish
60721600|Kartografiya va masofadan zondlash|qurilish
60721700|Kadastr|qurilish
60730100|Arxitektura|qurilish
60730300|Qurilish muhandisligi|qurilish
60730400|Muhandislik kommunikatsiyalari qurilish va ekspluatatsiyasi|qurilish
60730500|Yo'l muhandisligi|transport
60730600|Gidrotexnika va geotexnika muhandisligi|suv
60810100|Qishloq xo'jaligini mexanizatsiyalashtirish|agro
60810400|Agronomiya|agro
60810500|O'simliklar himoyasi va karantini|agro
60810700|Qishloq xo'jalik mahsulotlarini saqlash va qayta ishlash texnologiyasi|agro
60811200|Suv xo'jaligi va melioratsiya|suv
60811300|Gidrotexnika inshootlari va nasos stansiyalaridan foydalanish|suv
60811400|Meliorativ gidrogeologiya|suv
60811500|Suv ta'minoti muhandislik tizimlari|suv
60811600|Yer kadastri va yer tuzish|qurilish
60811700|Agromuhandislik|agro
61010400|Logistika|transport
61020200|Mehnat muhofazasi va texnika xavfsizligi|sanoat
60610200|Axborot xavfsizligi|it
60712200|Sanoat muhandisligi va menejmenti|sanoat
60720100|Oziq-ovqat texnologiyasi|oziqovqat
60811100|Dorivor o'simliklarni yetishtirish va qayta ishlash texnologiyasi|agro
61010100|Turizm va mehmondo'stlik|turizm
`;
const PROGRAMS = RAW_PROGRAMS.trim().split('\n').map(line => {
  const [code, name, group] = line.split('|');
  return {code, name, group};
});
const GROUPS = {
  iqtisod:{label:'Moliya va iqtisodiyot',icon:'📊',query:'iqtisodiyot moliya buxgalteriya video dars'},
  it:{label:'IT va raqamli texnologiyalar',icon:'💻',query:'dasturlash Python kompyuter tarmoqlari o‘zbekcha video dars'},
  energetika:{label:'Energetika va elektrotexnika',icon:'⚡',query:'elektrotexnika energetika maʼruza o‘zbek'},
  neftgaz:{label:'Neft-gaz va geologiya',icon:'🛢️',query:'neft gaz geologiya burg‘ilash video maʼruza'},
  qurilish:{label:'Qurilish, geodeziya va arxitektura',icon:'🏗️',query:'qurilish muhandisligi arxitektura geodeziya video dars'},
  suv:{label:'Irrigatsiya va suv xo‘jaligi',icon:'💧',query:'suv xo‘jaligi gidrotexnika melioratsiya video maʼruza'},
  agro:{label:'Agrotexnologiyalar',icon:'🌱',query:'agronomiya qishloq xo‘jaligi agrotexnologiya videodars'},
  oziqovqat:{label:'Oziq-ovqat texnologiyalari',icon:'🥼',query:'oziq-ovqat texnologiyasi ishlab chiqarish maʼruza'},
  kimyo:{label:'Kimyo va biotexnologiya',icon:'🧪',query:'kimyo muhandisligi biotexnologiya maʼruza'},
  sanoat:{label:'Sanoat va mexanika',icon:'⚙️',query:'mexanika materialshunoslik sanoat muhandisligi dars'},
  transport:{label:'Transport va logistika',icon:'🚗',query:'transport muhandisligi logistika yo‘l harakati dars'},
  ekologiya:{label:'Ekologiya',icon:'🌍',query:'ekologiya atrof-muhit muhofazasi maʼruza'},
  turizm:{label:'Turizm va mehmondo‘stlik',icon:'🧭',query:'turizm mehmondo‘stlik xizmat ko‘rsatish dars'}
};
// Faqat manbasi tekshirilgan aniq YouTube video IDlari.
// Bu akademik tasdiqlangan universitet kurslari degani emas.
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s||'').toLocaleLowerCase('uz').replace(/[‘’ʻʼ´\u0060]/g,"'").replace(/\s+/g,' ').trim();
const youtubeSearch = q => 'https://www.youtube.com/results?search_query='+encodeURIComponent(q);
let initialized = false, selected = '', searchText = '', visible = 0, loadObserver = null, allVideoObserver = null, lastTrigger = null;
const PER_BATCH = 12;
function pickDirection(direction) {
  const candidate = norm(direction);
  if (!candidate) return '';
  const code = candidate.match(/\b\d{8}\b/);
  if (code && PROGRAMS.some(p => p.code===code[0])) return code[0];
  const exact = PROGRAMS.find(p => norm(p.name)===candidate);
  if (exact) return exact.code;
  const partial = PROGRAMS.filter(p => norm(p.name).includes(candidate) || candidate.includes(norm(p.name)));
  return partial.length === 1 ? partial[0].code : '';
}
function cardVideo(video) {
  return '<article class="qv-video"><button class="qv-cover" type="button" data-qv-play="'+esc(video.id)+'" aria-label="'+esc(video.title)+' videoni ko‘rish"><img src="https://i.ytimg.com/vi/'+encodeURIComponent(video.id)+'/hqdefault.jpg" loading="lazy" decoding="async" alt=""><span aria-hidden="true">▶</span></button><div class="qv-body"><small>'+esc(video.language)+' · '+esc(video.source)+'</small><h3>'+esc(video.title)+'</h3><button class="qv-open" type="button" data-qv-play="'+esc(video.id)+'">▶ Videoni ko‘rish</button></div></article>';
}
function cardSearch(p) {
  const group=GROUPS[p.group]||GROUPS.it;
  return '<article class="qv-major"><span class="qv-symbol" aria-hidden="true">'+group.icon+'</span><div class="qv-major-info"><small>'+esc(p.code)+' · '+esc(group.label)+'</small><h3>'+esc(p.name)+'</h3></div><div class="qv-major-actions"><button type="button" data-qv-select="'+esc(p.code)+'">Tavsiyalar</button><a href="'+esc(youtubeSearch(p.name+' videodars maʼruza o‘zbek'))+'" target="_blank" rel="noopener noreferrer" aria-label="'+esc(p.name)+' bo‘yicha YouTubedan qidirish">YouTube qidiruv ↗</a></div></article>';
}
function mount() {
 const page = document.getElementById('videos');
 if (!page || initialized) return;
 initialized = true;
 const panel = document.createElement('div'); panel.id='qdtuVideoCatalog'; panel.className='qv-shell';
 panel.innerHTML = '<div class="qv-hero"><div><span class="qv-eyebrow">QDTU • 2026/2027 bakalavriat katalogi</span><h2>Yo‘nalishingizga mos videodarslar</h2><p>Har bir QDTU yo‘nalishiga 5 tadan o‘zbekcha dars tanlangan. Quyida jami '+UZBEK_LESSONS.length+' ta noyob ochiq videodars mavjud; videolar faqat bosilganda ijro etiladi.</p></div><div class="qv-counter"><b>'+PROGRAMS.length+'</b><span>ta yo‘nalish</span></div></div>'+
  '<div class="qv-filters"><label for="qv-direction">Ta’lim yo‘nalishi <select id="qv-direction"><option value="">Barcha yo‘nalishlar</option>'+PROGRAMS.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name)+'</option>').join('')+'</select></label><label for="qv-search">Yo‘nalish yoki mavzu qidirish<input id="qv-search" type="search" placeholder="Masalan: energetika, 60610400..."></label></div>'+
  '<div class="qv-heading"><div><h3 id="qv-recommend-title">Siz uchun ochiq videodarslar</h3><p id="qv-recommend-note">O‘zbek tilidagi videoma’ruzalar katalogidan</p></div></div><div id="qv-recommendations" class="qv-video-grid"></div>'+
  '<div class="qv-heading qv-heading-all"><div><h3>Ommaviy o‘zbekcha videodarslar</h3><p>Ochiq ma’ruzalar bo‘yicha umumiy kutubxona · scroll orqali yuklanadi</p></div></div><div id="qv-all-videos" class="qv-video-grid"></div>'+
  '<div class="qv-heading qv-heading-all"><div><h3>Barcha QDTU yo‘nalishlari</h3><p>Har biri uchun alohida tavsiyalar va YouTube qidiruvi</p></div><span id="qv-visible-count"></span></div><div id="qv-majors" class="qv-major-grid"></div><div id="qv-sentinel" class="qv-sentinel" aria-hidden="true"></div><button type="button" id="qv-load-more" class="qv-load-more">Yana 12 ta yo‘nalishni ko‘rsatish</button>'+
  '<p class="qv-disclaimer">Manba: QDTU 2026/2027 kunduzgi qabul yo‘nalishlari. O‘zbekcha videodarslar boshqa ta’lim muassasalari va mualliflarga tegishli bo‘lishi mumkin. Tor ixtisosliklarda tayanch fanlar ma’ruzalaridan foydalanilgan; qo‘shimcha mavzular uchun YouTube qidiruv havolasi bor. Ochiq materiallar rasmiy davomat, baho yoki majburiy video-progressga qo‘shilmaydi.</p>';
 page.querySelector('.video-toolbar')?.after(panel);

 // Open lectures on their own full-size in-app lesson page instead of a modal overlay.
 const watch=document.createElement('section');
 watch.id='qdtuVideoWatch';
 watch.className='page qv-watch-page';
 watch.setAttribute('aria-label','O‘zbekcha videodarsni ko‘rish');
 watch.innerHTML='<div class="qv-watch-header"><button type="button" class="secondary qv-watch-back" data-qv-back>← Barcha videodarslar</button><span class="qv-watch-kicker">QDTU · O‘zbekcha video kutubxona</span></div>'+
 '<div class="qv-watch-layout"><div class="qv-watch-main"><h1 id="qv-watch-title">Videodars</h1><p id="qv-watch-meta" class="qv-watch-meta"></p><div id="qv-watch-stage" class="qv-watch-stage"><div id="qv-watch-poster" class="qv-watch-poster"><span class="qv-watch-loading" aria-hidden="true">▶</span><b>Video yuklanmoqda…</b></div><div id="qv-watch-frame" class="qv-watch-frame"></div></div><div class="qv-watch-actions"><a id="qv-watch-youtube" class="qv-watch-youtube" target="_blank" rel="noopener noreferrer">▶ YouTube’da ko‘rish ↗</a><span>Videoni ko‘ra olmasangiz, YouTube havolasidan foydalaning.</span></div><p class="qv-watch-description">Bu video ochiq YouTube manbasidan uzatiladi. Ayrim mualliflar tashqi saytlarda ijro etishga ruxsat bermasligi mumkin; bunday holatda yuqoridagi tugma videoni YouTube’da ochadi.</p></div><aside class="qv-watch-side"><h2>Keyingi tavsiya etilgan darslar</h2><p>Yo‘nalishingiz bo‘yicha boshqa o‘zbekcha videolar</p><div id="qv-watch-related"></div></aside></div>';
 page.after(watch);
 const frameBox=watch.querySelector('#qv-watch-frame');
 const clearVideo=()=>{
   frameBox.replaceChildren();
   const poster=watch.querySelector('#qv-watch-poster');
   if(poster)poster.hidden=false;
 };
 const resumeCatalogObservers=()=>{
   const lazySentinel=document.getElementById('qv-all-videos')?.querySelector('.qv-video-sentinel');
   if(allVideoObserver && lazySentinel)allVideoObserver.observe(lazySentinel);
   if(loadObserver)loadObserver.observe(panel.querySelector('#qv-sentinel'));
 };
 const backToCatalog=(pushHistory=false)=>{
   clearVideo();
   watch.classList.remove('active');
   if(!document.querySelector('.page.active'))page.classList.add('active');
   if(page.classList.contains('active'))document.documentElement.dataset.page='videos';
   if(pushHistory&&location.hash.startsWith('#qdtu-video='))history.pushState({},'',location.pathname+location.search);
   if(page.classList.contains('active')){resumeCatalogObservers();window.scrollTo(0,0);}
 };
 const openVideoPage=(video,saveHistory=true)=>{
   if(!video)return;
   clearVideo();
   lastTrigger=document.activeElement;
   watch.querySelector('#qv-watch-title').textContent=video.title;
   const major=PROGRAMS.find(p=>p.code===selected);
   watch.querySelector('#qv-watch-meta').textContent=[major?.name,video.source,video.language].filter(Boolean).join(' · ');
   watch.querySelector('#qv-watch-youtube').href='https://www.youtube.com/watch?v='+encodeURIComponent(video.id);
   const related=major?lessonsForProgram(major,8):UZBEK_LESSONS.filter(v=>v.groups.some(g=>video.groups.includes(g))).slice(0,9);
   watch.querySelector('#qv-watch-related').innerHTML=related.filter(v=>v.id!==video.id).slice(0,7).map(v=>'<button class="qv-watch-related" data-qv-play="'+esc(v.id)+'" type="button"><img src="https://i.ytimg.com/vi/'+encodeURIComponent(v.id)+'/mqdefault.jpg" loading="lazy" alt=""><span><b>'+esc(v.title)+'</b><small>'+esc(v.source)+'</small></span></button>').join('')||'<p>Hozircha boshqa videodars mavjud emas.</p>';
   allVideoObserver?.disconnect();
   loadObserver?.disconnect();
   document.querySelectorAll('.page.active').forEach(el=>el.classList.remove('active'));
   watch.classList.add('active');
   document.documentElement.dataset.page='qdtuVideoWatch';
   if(saveHistory && location.hash!=='#qdtu-video='+encodeURIComponent(video.id))history.pushState({qdtuVideoId:video.id},'',location.pathname+location.search+'#qdtu-video='+encodeURIComponent(video.id));
   window.scrollTo(0,0);
   const iframe=document.createElement('iframe');
   iframe.title=video.title;
   iframe.src='https://www.youtube.com/embed/'+encodeURIComponent(video.id)+'?autoplay=1&rel=0&playsinline=1';
   iframe.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
   iframe.referrerPolicy='strict-origin-when-cross-origin';
   iframe.allowFullscreen=true;
   iframe.loading='eager';
   iframe.addEventListener('load',()=>{if(frameBox.contains(iframe))watch.querySelector('#qv-watch-poster').hidden=true;});
   iframe.addEventListener('error',()=>{if(frameBox.contains(iframe)){const p=watch.querySelector('#qv-watch-poster');p.hidden=false;p.querySelector('b').textContent='Video ichki pleyerda ochilmadi. YouTube’da ko‘ring.';}});
   frameBox.appendChild(iframe);
 };
 watch.addEventListener('click',event=>{
   const item=event.target.closest('[data-qv-play]');
   if(item){const video=UZBEK_LESSONS.find(v=>v.id===item.dataset.qvPlay);openVideoPage(video);return;}
   if(event.target.closest('[data-qv-back]')){
      if(location.hash.startsWith('#qdtu-video='))history.back();
      else backToCatalog();
   }
 });
 window.addEventListener('popstate',()=>{
   const id=location.hash.startsWith('#qdtu-video=')?decodeURIComponent(location.hash.slice(12)):'';
   const video=UZBEK_LESSONS.find(v=>v.id===id);
   if(video)openVideoPage(video,false);
   else if(watch.classList.contains('active'))backToCatalog();
 });
 document.addEventListener('hx:navigate',event=>{
   if(event.detail?.page!=='qdtuVideoWatch' && frameBox.children.length)clearVideo();
   if(event.detail?.page==='videos')resumeCatalogObservers();
 });
 panel.addEventListener('click',event=>{
   const play=event.target.closest('[data-qv-play]');
   if(play){const video=UZBEK_LESSONS.find(v=>v.id===play.dataset.qvPlay);openVideoPage(video);return;}
   const select=event.target.closest('[data-qv-select]');if(select){selected=select.dataset.qvSelect;panel.querySelector('#qv-direction').value=selected;renderRecommendations();panel.querySelector('#qv-recommend-title').scrollIntoView({behavior:'smooth',block:'start'});}
 });
 panel.querySelector('#qv-direction').addEventListener('change',event=>{selected=event.target.value;renderRecommendations();renderMajors();});
 panel.querySelector('#qv-search').addEventListener('input',event=>{searchText=norm(event.target.value);renderMajors();});
 panel.querySelector('#qv-load-more').addEventListener('click',appendNext);
 renderRecommendations();
 renderAllVideos();
 renderMajors();
 if('IntersectionObserver' in window){
  loadObserver=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting) && page.classList.contains('active'))appendNext();},{rootMargin:'450px 0px'});
  loadObserver.observe(panel.querySelector('#qv-sentinel'));
 }
 fetch('/api/me',{credentials:'same-origin'}).then(response=>response.ok?response.json():null).then(data=>{
  const code=pickDirection(data?.user?.direction);
  if(!code || selected) return;
  selected=code;panel.querySelector('#qv-direction').value=code;renderRecommendations();
 }).catch(()=>{});
}

function renderRecommendations(){
 const container=document.getElementById('qv-recommendations');if(!container)return;
 const program=PROGRAMS.find(p=>p.code===selected);
 const matched=lessonsForProgram(program,LESSONS_PER_MAJOR);
 document.getElementById('qv-recommend-title').textContent=program?program.name+' — '+matched.length+' ta o‘zbekcha videodars':'Siz uchun ochiq o‘zbekcha videodarslar';
 document.getElementById('qv-recommend-note').textContent=program?'Avval bevosita tegishli fanlar, keyin yo‘nalishning tayanch fanlari. Manbalari videokartada ko‘rsatiladi.':'Profilingizdagi yo‘nalish yoki yuqoridagi ro‘yxatdan tanlang';
 container.innerHTML=matched.map(cardVideo).join('')+(program?'<article class="qv-search-card"><div class="qv-search-icon">⌕</div><h3>'+esc(program.name)+'</h3><p>Qo‘shimcha o‘zbekcha video ma’ruzalarni YouTube orqali qidiring.</p><a target="_blank" rel="noopener noreferrer" href="'+esc(youtubeSearch(program.name+' videodars maʼruza o‘zbek'))+'">Ko‘proq darslarni qidirish ↗</a></article>':'');
}
function renderAllVideos(){
 const el=document.getElementById('qv-all-videos');if(!el)return;
 allVideoObserver?.disconnect();
 allVideoObserver=null;
 el.replaceChildren();
 let index=0;
 const sentinel=document.createElement('div');
 sentinel.className='qv-video-sentinel';
 sentinel.setAttribute('aria-hidden','true');
 const loadMore=document.createElement('button');
 loadMore.type='button';
 loadMore.className='qv-load-more';
 loadMore.textContent='Yana 12 ta videodarsni ko‘rsatish';
 const more=()=>{
   allVideoObserver?.unobserve(sentinel);
   sentinel.remove();
   loadMore.remove();
   const next=UZBEK_LESSONS.slice(index,index+12);
   index+=next.length;
   if(next.length)el.insertAdjacentHTML('beforeend',next.map(cardVideo).join(''));
   if(index<UZBEK_LESSONS.length){
      el.appendChild(sentinel);
      if(allVideoObserver)allVideoObserver.observe(sentinel);
      else{el.appendChild(loadMore);loadMore.onclick=more;}
   }
 };
 if('IntersectionObserver' in window){
   allVideoObserver=new IntersectionObserver(entries=>{
     if(entries.some(entry=>entry.isIntersecting)&&document.getElementById('videos')?.classList.contains('active'))more();
   },{rootMargin:'340px 0px'});
 }
 more();
}
function matchingPrograms(){
 return PROGRAMS.filter(p=>(!searchText || norm(p.name+' '+p.code+' '+GROUPS[p.group].label).includes(searchText)));
}
function renderMajors(){
 visible=0;const el=document.getElementById('qv-majors');if(!el)return;el.replaceChildren();
 appendNext();
}
function appendNext(){
 const all=matchingPrograms(),el=document.getElementById('qv-majors');if(!el)return;
 const next=all.slice(visible,visible+PER_BATCH);if(next.length)el.insertAdjacentHTML('beforeend',next.map(cardSearch).join(''));
 visible+=next.length;
 const counter=document.getElementById('qv-visible-count');if(counter)counter.textContent=visible+' / '+all.length;
 const more=document.getElementById('qv-load-more');if(more)more.hidden=visible>=all.length;
 if(!all.length)el.innerHTML='<div class="qv-empty">So‘rovga mos yo‘nalish topilmadi. Qidiruvni o‘zgartiring.</div>';
}
document.addEventListener('hx:navigate',event=>{
 if(event.detail?.page==='videos')mount();
});
if(document.getElementById('videos')?.classList.contains('active'))mount();
