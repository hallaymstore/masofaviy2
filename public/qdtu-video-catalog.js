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
const VIDEOS = [
 {id:'NLrfm2p2RtA',title:'Qurilish konstruksiyalarini hisoblash va loyihalash — 1-ma’ruza',source:'TUACE',language:'O‘zbekcha',groups:['qurilish'],tags:['60730300','60730100']},
 {id:'TSeigxPwkiA',title:'Gidrotexnika inshootlari osti konstruksiyasi',source:'Buxoro tabiiy resurslarni boshqarish instituti',language:'O‘zbekcha',groups:['suv'],tags:['60811300','60730600']},
 {id:'RZ4STGNrmVw',title:'Materialshunoslik faniga kirish — 1-ma’ruza',source:'Fidoyiy ustozlar',language:'O‘zbekcha',groups:['sanoat'],tags:['60720300','60711200']},
 {id:'4bbAD_f4wmY',title:'Oziq-ovqat mahsulotlarini sertifikatlashtirish asoslari',source:'Academy Infinite',language:'O‘zbekcha',groups:['oziqovqat'],tags:['60720100','60810700']},
 {id:'g019K8iBm38',title:'Logistika — 1-dars: Logistika nima?',source:'Milliy ta’lim resurslari',language:'O‘zbekcha',groups:['transport'],tags:['61010400','60711400']},
 {id:'beJX6aoOwsg',title:'Logistika — 2-dars: Dispatching',source:'Milliy ta’lim resurslari',language:'O‘zbekcha',groups:['transport'],tags:['61010400']},
 {id:'gwyTV-gUDyg',title:'Circuits and Electronics — Lecture 1',source:'MIT (lecture recording)',language:'Inglizcha',groups:['energetika'],tags:['60710500','60710700']},
 {id:'W3LcNXWuOdM',title:'Fluid Mechanics — Fundamentals, Lecture 1',source:'Dr. Bagus Muljadi, University of Nottingham',language:'Inglizcha',groups:['suv','sanoat','kimyo','energetika'],tags:['60710600','60730600','60712300']},
 {id:'Gb5BKmGtz2E',title:'Introduction to Tourism and Hospitality Management — Lecture 1',source:'Tourism Management',language:'Inglizcha',groups:['turizm'],tags:['61010100']},
 {id:'i9WxfUBqljg',title:'Engineering Thermodynamics — Lecture 1',source:'University course reading list',language:'Inglizcha',groups:['sanoat','energetika'],tags:['60712300','60710400']},
 {id:'67i5vzIEhMk',title:'Buxgalteriya hisobini tashkil etish va hisob siyosati',source:'B. Y. Menglikulov',language:'O‘zbekcha',groups:['iqtisod'],tags:['60410200','60410500']},
 {id:'-JYgcfkeRRY',title:'Buxgalteriya hisobi fanining predmeti va metodi',source:'B. Y. Menglikulov',language:'O‘zbekcha',groups:['iqtisod'],tags:['60410200','60410100']},
 {id:'heBErnN3ZPk',title:'Introduction to Macroeconomics — Lecture 1',source:'MIT OpenCourseWare',language:'Inglizcha',groups:['iqtisod'],tags:['60410100','60410500','60410700']},
 {id:'HUogSIxtrRk',title:'Kompyuter tarmoqlari: Packet Tracer — 1-dars',source:'Computer Networks',language:'O‘zbekcha',groups:['it'],tags:['60610100','60610300','60610600','60611000']},
 {id:'2WtPyqwTLKM',title:'CS50: Computer Science — Lecture 0',source:'Harvard CS50',language:'Inglizcha',groups:['it'],tags:['60610400','60610500','60610300']}
];
const COURSES = [
 {name:'Python dasturlash: 78 ta o‘zbekcha videodars',url:'https://www.youtube.com/playlist?list=PLTWoFaxHL_JuxZilhnY7uEQyNNEFqjdk9',source:'Sirojiddin Yokubov | IT',group:'it',language:'O‘zbekcha'},
 {name:'MIT — Principles of Macroeconomics',url:'https://ocw.mit.edu/courses/14-02-principles-of-macroeconomics-spring-2023/resources/lecture-videos/',source:'MIT OpenCourseWare',group:'iqtisod',language:'Inglizcha'},
 {name:'MIT — Electrical Engineering and Computer Science',url:'https://ocw.mit.edu/courses/6-01sc-introduction-to-electrical-engineering-and-computer-science-i-spring-2011/resources/lecture-videos/',source:'MIT OpenCourseWare',group:'energetika',language:'Inglizcha'}
];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s||'').toLocaleLowerCase('uz').replace(/[‘’ʻʼ´\u0060]/g,"'").replace(/\s+/g,' ').trim();
const youtubeSearch = q => 'https://www.youtube.com/results?search_query='+encodeURIComponent(q);
let initialized = false, selected = '', searchText = '', visible = 0, loadObserver = null, lastTrigger = null;
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
function cardCourse(course) {
  return '<article class="qv-video qv-course"><div class="qv-course-art">📚<small>Video kurs / pleylist</small></div><div class="qv-body"><small>'+esc(course.language)+' · '+esc(course.source)+'</small><h3>'+esc(course.name)+'</h3><a class="qv-open" target="_blank" rel="noopener noreferrer" href="'+esc(course.url)+'">Kursni ochish ↗</a></div></article>';
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
 panel.innerHTML = '<div class="qv-hero"><div><span class="qv-eyebrow">QDTU • 2026/2027 bakalavriat katalogi</span><h2>Yo‘nalishingizga mos videodarslar</h2><p>Avval o‘z yo‘nalishingiz bo‘yicha tavsiyalar, pastda esa barcha yo‘nalishlar va ochiq video manbalar. Videolar faqat ochilganda yuklanadi.</p></div><div class="qv-counter"><b>'+PROGRAMS.length+'</b><span>ta yo‘nalish</span></div></div>'+
  '<div class="qv-filters"><label for="qv-direction">Ta’lim yo‘nalishi <select id="qv-direction"><option value="">Barcha yo‘nalishlar</option>'+PROGRAMS.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.name)+'</option>').join('')+'</select></label><label for="qv-search">Yo‘nalish yoki mavzu qidirish<input id="qv-search" type="search" placeholder="Masalan: energetika, 60610400..."></label></div>'+
  '<div class="qv-heading"><div><h3 id="qv-recommend-title">Siz uchun ochiq videodarslar</h3><p id="qv-recommend-note">YouTube va ochiq kurslar katalogidan</p></div></div><div id="qv-recommendations" class="qv-video-grid"></div>'+
  '<div class="qv-heading qv-heading-all"><div><h3>Ommaviy videodarslar va ochiq kurslar</h3><p>Tekshirilgan video havolalari va pleylistlar</p></div></div><div id="qv-all-videos" class="qv-video-grid"></div>'+
  '<div class="qv-heading qv-heading-all"><div><h3>Barcha QDTU yo‘nalishlari</h3><p>Har biri uchun alohida tavsiyalar va YouTube qidiruvi</p></div><span id="qv-visible-count"></span></div><div id="qv-majors" class="qv-major-grid"></div><div id="qv-sentinel" class="qv-sentinel" aria-hidden="true"></div><button type="button" id="qv-load-more" class="qv-load-more">Yana 12 ta yo‘nalishni ko‘rsatish</button>'+
  '<p class="qv-disclaimer">Manba: QDTU 2026/2027 kunduzgi qabul yo‘nalishlari. Ochiq videolar tashqi mualliflarga tegishli; har bir yo‘nalishda tayyor videodars topilmasa, aniq YouTube qidiruv havolasi beriladi. Ushbu ochiq materiallar platformadagi rasmiy baholash va davomatga qo‘shilmaydi.</p>';
 page.querySelector('.video-toolbar')?.after(panel);
 const modal=document.createElement('dialog'); modal.id='qv-player-modal'; modal.className='qv-player-dialog'; modal.innerHTML='<div class="qv-player-head"><h2 id="qv-player-title">Videodars</h2><button type="button" data-qv-close aria-label="Videoni yopish">✕</button></div><div id="qv-player-frame"></div><div class="qv-player-foot"><span>YouTube rasmiy pleyeri</span><a id="qv-player-link" target="_blank" rel="noopener noreferrer">YouTube’da ochish ↗</a></div>';
 document.body.appendChild(modal);
 const stop=()=>{document.getElementById('qv-player-frame').replaceChildren();lastTrigger?.focus();};
 modal.addEventListener('close',stop);
 modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});
 modal.querySelector('[data-qv-close]').addEventListener('click',()=>modal.close());
 panel.addEventListener('click',event=>{
   const play=event.target.closest('[data-qv-play]');
   if(play){const video=VIDEOS.find(v=>v.id===play.dataset.qvPlay);if(!video)return;lastTrigger=play;modal.querySelector('#qv-player-title').textContent=video.title;modal.querySelector('#qv-player-link').href='https://www.youtube.com/watch?v='+encodeURIComponent(video.id);const iframe=document.createElement('iframe');iframe.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(video.id)+'?autoplay=1&rel=0';iframe.title=video.title;iframe.allow='accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.allowFullscreen=true;modal.querySelector('#qv-player-frame').replaceChildren(iframe);modal.showModal();return;}
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
 document.getElementById('qv-recommend-title').textContent=program?program.name+' — tavsiyalar':'Siz uchun ochiq videodarslar';
 document.getElementById('qv-recommend-note').textContent=program?'Yo‘nalish fanlariga yaqin ochiq manbalar; xususiy o‘quv dasturi o‘rnini bosmaydi':'Yo‘nalishingizni tanlang yoki profilingizda belgilang';
 const matched=program?VIDEOS.filter(v=>v.tags.includes(program.code)).concat(VIDEOS.filter(v=>v.groups.includes(program.group)&&!v.tags.includes(program.code))).slice(0,4):VIDEOS.slice(0,4);
 const courses=program?COURSES.filter(c=>c.group===program.group).slice(0,1):COURSES.slice(0,1);
 container.innerHTML=matched.map(cardVideo).join('')+courses.map(cardCourse).join('')+(program?'<article class="qv-search-card"><div class="qv-search-icon">⌕</div><h3>'+esc(program.name)+'</h3><p>Yo‘nalishga xos qo‘shimcha video ma’ruzalarni YouTube’dan izlang.</p><a target="_blank" rel="noopener noreferrer" href="'+esc(youtubeSearch(program.name+' videodars maʼruza o‘zbek'))+'">Yo‘nalish videolarini qidirish ↗</a></article>':'');
 if(!matched.length && !courses.length && !program)container.innerHTML='<p>Ochiq videodarslar topilmadi.</p>';
}
function renderAllVideos(){
 const el=document.getElementById('qv-all-videos');
 if(el)el.innerHTML=VIDEOS.map(cardVideo).join('')+COURSES.map(cardCourse).join('');
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
