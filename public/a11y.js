// HALLAYM EDU — accessibility panel ("Qulaylik"): presets for different needs, text size and spacing, readable and
// dyslexia fonts, contrast themes, colour-vision correction, text-to-speech, reading ruler, cursor/focus/motion options
// and live-lesson options. Settings follow the user to every device (/api/a11y/prefs); on the login screen they are local.
const H=()=>window.HxA11y;
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export const PRESETS=[
  {key:'lowvision',icon:'👓',title:'Zaif ko‘rish',hint:'Katta matn, yuqori kontrast, katta kursor',set:{textScale:150,font:'readable',contrast:'yellow',lineHeight:'wide',strongFocus:true,highlightLinks:true,bigCursor:true}},
  {key:'blind',icon:'🦯',title:'Ko‘rmaydigan',hint:'Ekran o‘qish dasturi, ovozli xabarlar, klaviatura',set:{strongFocus:true,reduceMotion:true,announceChat:true,clickToRead:true,voiceAssistant:true,voiceHandsFree:true}},
  {key:'deaf',icon:'🧏',title:'Eshitish qiyin',hint:'Subtitr doim, katta subtitr, dars matni',set:{captionsAlways:true,captionSize:2,strongFocus:true}},
  {key:'dyslexia',icon:'📖',title:'Disleksiya',hint:'Maxsus shrift, keng oraliq, o‘qish chizg‘ichi',set:{font:'dyslexic',lineHeight:'wide',letterSpacing:'wide',readingRuler:true,clickToRead:true}},
  {key:'motor',icon:'🖐',title:'Harakat cheklangan',hint:'Katta tugmalar va kursor, klaviatura fokus',set:{textScale:125,bigCursor:true,strongFocus:true,reduceMotion:true}},
  {key:'focus',icon:'🎯',title:'Diqqatni jamlash',hint:'Harakatsiz, chizg‘ich, tinch ranglar',set:{reduceMotion:true,readingRuler:true,colorFilter:'lowsat'}},
  {key:'epilepsy',icon:'⚡',title:'Epilepsiyaga xavfsiz',hint:'Animatsiya va miltillash yo‘q, yumshoq ranglar',set:{reduceMotion:true,colorFilter:'lowsat'}},
  {key:'color',icon:'🎨',title:'Rang ko‘rligi',hint:'Qizil-yashil ranglarni ajratish',set:{colorFilter:'deuteranopia',highlightLinks:true}}
];
const SIZES=[100,115,130,150,175,200];
const CONTRASTS=[['none','Odatiy','#fff','#121835'],['high','Oq-qora','#fff','#000'],['dark','Qora-oq','#000','#fff'],['yellow','Qora-sariq','#000','#ffef00']];
const FILTERS=[['none','Yo‘q'],['deuteranopia','Deyteranopiya (yashil)'],['protanopia','Protanopiya (qizil)'],['tritanopia','Tritanopiya (ko‘k)'],['grayscale','Oq-qora'],['lowsat','Yumshoq ranglar']];

export function createA11y({api,toast=()=>{}}={}){
  const $=(s,r=document)=>r.querySelector(s);
  let panel=null,backdrop=null,lastFocus=null,loggedIn=false,saveTimer=null,serverNote='';
  const prefs=()=>H()?.get()||{};

  // ---------- live region announcer ----------
  function region(kind){let el=document.getElementById('hxaLive-'+kind);if(!el){el=document.createElement('div');el.id='hxaLive-'+kind;el.className='sr-only';el.setAttribute('aria-live',kind);el.setAttribute('aria-atomic','true');document.body.appendChild(el)}return el}
  function announce(text,kind='polite'){const el=region(kind);el.textContent='';setTimeout(()=>{el.textContent=String(text||'')},40)}

  // ---------- text to speech ----------
  const synth=window.speechSynthesis;let voiceList=[],readingEl=null;
  const loadVoices=()=>{try{voiceList=synth?.getVoices?.()||[]}catch{voiceList=[]}};
  if(synth){loadVoices();synth.addEventListener?.('voiceschanged',()=>{loadVoices();if(panel)renderPanel()})}
  const savedVoice=()=>{try{return localStorage.getItem('hx-a11y-voice')||''}catch{return ''}};
  function pickVoice(text){
    if(!voiceList.length)loadVoices();const chosen=savedVoice();
    const cyr=/[Ѐ-ӿ]/.test(text);
    if(chosen&&!cyr){const v=voiceList.find(x=>x.voiceURI===chosen);if(v)return v}
    const order=cyr?['ru','uz','kk','uk']:['uz','tr','kk','az','en'];
    for(const l of order){const v=voiceList.find(x=>String(x.lang||'').toLowerCase().startsWith(l));if(v)return v}
    return null;
  }
  function chunks(text){const out=[];let buf='';for(const part of String(text).replace(/\s+/g,' ').split(/(?<=[.!?;:])\s+/)){if((buf+' '+part).length>220&&buf){out.push(buf);buf=part}else buf=buf?buf+' '+part:part}if(buf)out.push(buf);return out.flatMap(c=>c.length>260?c.match(/.{1,240}(\s|$)/g)||[c]:[c])}
  function stopSpeech(){try{window.HxSpeech?.stop()}catch{}try{synth?.cancel()}catch{}readingEl?.classList.remove('hxa-reading');readingEl=null}
  function speak(text,{el=null,interrupt=true}={}){
    const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean)return false;
    // The platform speech engine (public/speech.js) speaks Uzbek with the server Madina/Sardor voices when configured.
    const S=window.HxSpeech;
    if(S){if(!interrupt&&S.isSpeaking())return false;if(interrupt)stopSpeech();if(el){readingEl=el;el.classList.add('hxa-reading')}const done=()=>{if(readingEl===el){el?.classList.remove('hxa-reading');readingEl=null}};S.speak(clean,{owner:'a11y',lang:'uz',rate:Number(prefs().ttsRate)||1,onend:done,oncancel:done,onerror:e=>{done();announce(e.message)}});return true}
    if(!synth){toast('Bu brauzer matnni ovoz chiqarib o‘qimaydi. Chrome yoki Edge ishlating');return false}
    if(interrupt)stopSpeech();if(el){readingEl=el;el.classList.add('hxa-reading')}
    const parts=chunks(clean),rate=Number(prefs().ttsRate)||1;
    parts.forEach((p,i)=>{const u=new SpeechSynthesisUtterance(p),v=pickVoice(p);if(v){u.voice=v;u.lang=v.lang}else u.lang=/[Ѐ-ӿ]/.test(p)?'ru-RU':'uz-UZ';u.rate=rate;
      if(i===parts.length-1)u.onend=u.onerror=()=>{if(readingEl===el){el?.classList.remove('hxa-reading');readingEl=null}};synth.speak(u)});
    return true;
  }
  const visibleText=el=>{if(!el)return '';const c=el.cloneNode(true);c.querySelectorAll('script,style,svg,[aria-hidden="true"],.hidden,[hidden],button,select,.sr-only').forEach(x=>x.remove());return c.textContent||''};
  function readPage(){
    const sel=String(window.getSelection?.()||'').trim();if(sel)return speak(sel);
    const page=document.querySelector('#main>.page.active')||document.querySelector('#login:not(.hidden) .login-card')||document.body;
    return speak(visibleText(page),{el:page});
  }
  const READABLE='p,h1,h2,h3,h4,h5,li,td,th,dt,dd,label,small,blockquote,figcaption,.ux-empty,.ux-body>div';
  document.addEventListener('click',e=>{
    if(!prefs().clickToRead||e.target.closest('.ar-dialog,.hxa-panel,a,button,input,select,textarea,summary,[role="button"],video,canvas'))return;
    const el=e.target.closest(READABLE);if(el&&el.closest('#main,#login,.ux-sheet'))speak(visibleText(el),{el});
  },true);
  document.addEventListener('focusin',e=>{
    if(!prefs().clickToRead||e.target.closest('.ar-dialog,.hxa-panel,#vaDock,#vaGate'))return;const t=e.target;if(!t.matches?.('button,a[href],input,select,textarea,summary,[role="button"],[tabindex]'))return;
    const label=t.getAttribute('aria-label')||t.labels?.[0]?.textContent||t.getAttribute('title')||t.textContent||t.placeholder||'';if(label.trim())speak(label.trim().slice(0,200));
  });

  // ---------- reading ruler ----------
  let ruler=null;
  function syncRuler(){
    const on=prefs().readingRuler&&matchMedia('(pointer:fine)').matches;
    if(!on){ruler?.forEach(x=>x.remove());ruler=null;return}
    if(ruler)return;
    ruler=['top','bottom'].map(k=>{const d=document.createElement('div');d.className='hxa-ruler-mask hxa-ruler-'+k;d.setAttribute('aria-hidden','true');document.body.appendChild(d);return d});
    const line=document.createElement('div');line.className='hxa-ruler-line';line.setAttribute('aria-hidden','true');document.body.appendChild(line);ruler.push(line);
    const place=y=>{if(!ruler)return;ruler[0].style.height=Math.max(0,y-34)+'px';ruler[1].style.height=Math.max(0,innerHeight-y-34)+'px';ruler[2].style.top=(y+33)+'px'};place(innerHeight/2);
    ruler.move=e=>place(e.clientY);
  }
  document.addEventListener('pointermove',e=>{if(ruler)ruler.move?.(e)},{passive:true});

  // ---------- persistence ----------
  function change(patch,{preset=false}={}){
    const cur=prefs(),next={...cur,...patch};if(!preset)next.preset='';
    H()?.set(next);syncRuler();queueSave();if(panel)renderPanel();
  }
  function queueSave(){if(!loggedIn||!api)return;clearTimeout(saveTimer);serverNote='Saqlanmoqda…';saveTimer=setTimeout(async()=>{try{await api('/a11y/prefs',{method:'PUT',body:JSON.stringify({prefs:prefs()})});serverNote='Barcha qurilmalaringizda saqlandi'}catch{serverNote='Faqat shu qurilmada saqlandi'}const n=document.getElementById('hxaSaved');if(n)n.textContent=serverNote},700)}
  async function syncFromServer(){
    if(!api)return;loggedIn=true;
    try{
      const x=await api('/a11y/prefs');
      // The most recent change wins: settings made on this device (e.g. on the login screen) after the last sync are kept.
      const localAt=H()?.changedAt?.()||0,serverAt=x?.updatedAt?Date.parse(x.updatedAt):0;
      if(x?.saved&&serverAt>=localAt){H()?.set(x.prefs,{silent:true,fromServer:true});serverNote='Barcha qurilmalaringizda saqlandi'}
      else if(x?.saved)queueSave();
      else{const local=prefs(),def=H()?.defaults||{};if(Object.keys(def).some(k=>JSON.stringify(local[k])!==JSON.stringify(def[k])))queueSave()}
      syncRuler();if(panel)renderPanel();
    }catch{}
  }

  // ---------- panel ----------
  const sw=(key,label,hint='')=>{const on=Boolean(prefs()[key]);return '<div class="hxa-row"><span id="hxa-l-'+key+'">'+esc(label)+(hint?'<small>'+esc(hint)+'</small>':'')+'</span><button type="button" class="hxa-switch hx-plain" role="switch" aria-checked="'+on+'" aria-labelledby="hxa-l-'+key+'" data-toggle="'+key+'"></button></div>'};
  const seg=(key,opts,label)=>'<div class="hxa-row"><span>'+esc(label)+'</span><div class="hxa-seg" role="group" aria-label="'+esc(label)+'">'+opts.map(([v,t])=>'<button type="button" class="hx-plain" data-set="'+key+'" data-val="'+esc(v)+'" aria-pressed="'+(String(prefs()[key])===String(v))+'">'+esc(t)+'</button>').join('')+'</div></div>';
  function renderPanel(){
    if(!panel)return;const p=prefs(),body=panel.querySelector('.hxa-body'),scroll=body?.scrollTop||0;
    const ttsOk=Boolean(window.HxSpeech||synth),voices=voiceList.filter(v=>/^(uz|ru|en)/i.test(v.lang||'')),cur=savedVoice();
    const uzVoice=window.HxSpeech?.hasUzbekVoice()||voiceList.some(v=>/^uz/i.test(v.lang||''));
    panel.querySelector('.hxa-body').innerHTML=
      '<section class="hxa-sec"><h3>Tayyor profillar</h3><div class="hxa-presets">'+PRESETS.map(x=>'<button type="button" class="hxa-preset hx-plain" data-preset="'+x.key+'" aria-pressed="'+(p.preset===x.key)+'"><i aria-hidden="true">'+x.icon+'</i><span><b>'+esc(x.title)+'</b><small>'+esc(x.hint)+'</small></span></button>').join('')+'</div></section>'+
      '<section class="hxa-sec"><h3>Matn</h3>'+
        '<div class="hxa-row"><span>Matn o‘lchami<small>'+p.textScale+'% · sahifa mazmuni kattalashadi</small></span><div class="hxa-seg" role="group" aria-label="Matn o‘lchami"><button type="button" class="hx-plain" data-size="-1" aria-label="Kichraytirish">A−</button><button type="button" class="hx-plain" data-size="0" aria-label="Odatiy o‘lcham">'+p.textScale+'%</button><button type="button" class="hx-plain" data-size="1" aria-label="Kattalashtirish">A+</button></div></div>'+
        seg('font',[['default','Odatiy'],['readable','O‘qishli'],['dyslexic','Disleksiya']],'Shrift')+
        seg('lineHeight',[['normal','1×'],['wide','1.5×'],['wider','2×']],'Qatorlar oralig‘i')+
        seg('letterSpacing',[['normal','Odatiy'],['wide','Keng'],['wider','Juda keng']],'Harflar oralig‘i')+
      '</section>'+
      '<section class="hxa-sec"><h3>Rang va kontrast</h3><div class="hxa-swatches" role="group" aria-label="Kontrast">'+CONTRASTS.map(([v,t,bg,fg])=>'<button type="button" class="hxa-swatch hx-plain" data-set="contrast" data-val="'+v+'" aria-pressed="'+(p.contrast===v)+'" style="background:'+bg+';color:'+fg+'">'+esc(t)+'</button>').join('')+'</div>'+
        '<div class="hxa-row"><span>Rangni ajrata olmaslik<small>Rangni tuzatuvchi filtr</small></span><select class="hxa-select" data-select="colorFilter" aria-label="Rang filtri">'+FILTERS.map(([v,t])=>'<option value="'+v+'"'+(p.colorFilter===v?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></div></section>'+
      '<section class="hxa-sec"><h3>O‘qish yordami</h3>'+
        '<div class="hxa-actions"><button type="button" class="hxa-btn primary hx-plain" data-act="read"'+(ttsOk?'':' disabled')+'>🔊 Sahifani o‘qish</button><button type="button" class="hxa-btn hx-plain" data-act="stop"'+(ttsOk?'':' disabled')+'>⏹ To‘xtatish</button></div>'+
        '<div class="hxa-row"><span>O‘zbekcha ovoz<small>'+esc(window.HxSpeech?.engineLabel?.()||'Brauzer ovozi')+'</small></span><div class="hxa-seg" role="group" aria-label="Ovoz"><button type="button" class="hx-plain" data-gender="female" aria-pressed="'+(window.HxSpeech?.gender?.()!=='male')+'">Madina</button><button type="button" class="hx-plain" data-gender="male" aria-pressed="'+(window.HxSpeech?.gender?.()==='male')+'">Sardor</button></div></div>'+
        sw('voiceAssistant','Ovozli yordamchi','O‘zbekcha sahifa, tugma, maydon va kitob boshqaruvi (Alt+V)')+
        sw('voiceHandsFree','Doimiy tinglash','Yordamchi yoqilganda buyruqdan keyin ham tinglash davom etadi')+
        sw('clickToRead','Bosilgan matnni ovoz chiqarib o‘qish','Matn ustiga bosing; tugmalar fokusda o‘qiladi')+
        '<div class="hxa-row"><span>O‘qish tezligi<small>'+p.ttsRate+'×</small></span><input class="hxa-range" type="range" min="0.5" max="2" step="0.1" value="'+p.ttsRate+'" data-range="ttsRate" aria-label="O‘qish tezligi"></div>'+
        (voices.length?'<div class="hxa-row"><span>Ovoz</span><select class="hxa-select" data-voice aria-label="Ovoz"><option value="">Avtomatik</option>'+voices.map(v=>'<option value="'+esc(v.voiceURI)+'"'+(cur===v.voiceURI?' selected':'')+'>'+esc(v.name+' ('+v.lang+')')+'</option>').join('')+'</select></div>':'')+
        (ttsOk&&!uzVoice?'<p class="hxa-note">O‘zbekcha ovoz uchun tizimga kiring va internetni tekshiring. Madina/Sardor server orqali ishlaydi.</p>':'')+
        sw('readingRuler','O‘qish chizg‘ichi','Sichqoncha turgan qatordan boshqa joy xiralashadi')+
      '</section>'+
      '<section class="hxa-sec"><h3>Boshqaruv va harakat</h3>'+sw('strongFocus','Kuchli fokus ramkasi','Klaviatura bilan ishlash uchun')+sw('bigCursor','Katta kursor')+sw('highlightLinks','Havola va tugmalarni ajratish')+sw('reduceMotion','Animatsiyalarni o‘chirish','Miltillash, konfetti va harakatlar yo‘q')+'</section>'+
      '<section class="hxa-sec"><h3>Jonli darsda</h3>'+sw('captionsAlways','Subtitr va dars matnini doim ko‘rsatish')+seg('captionSize',[[0,'A'],[1,'A+'],[2,'A++']],'Subtitr o‘lchami')+sw('announceChat','Chat xabarlarini ovoz chiqarib o‘qish','Ekran o‘qish dasturi bo‘lmasa ham')+'</section>'+
      '<section class="hxa-sec"><h3>Klaviatura</h3><ul class="hxa-keys"><li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> — shu panel</li><li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> — tanlangan matn yoki sahifani o‘qish</li><li><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> — o‘qishni to‘xtatish</li><li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> — elementlar bo‘ylab, <kbd>Enter</kbd> — tanlash</li><li><kbd>Ctrl</kbd>+<kbd>K</kbd> — sayt bo‘ylab qidirish</li></ul></section>';
    body.scrollTop=scroll;
    const saved=document.getElementById('hxaSaved');if(saved)saved.textContent=loggedIn?(serverNote||'Barcha qurilmalaringizda saqlanadi'):'Shu qurilmada saqlanadi (kirgandan keyin akkauntga ham)';
  }
  function onPanelClick(e){
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.preset){const x=PRESETS.find(y=>y.key===b.dataset.preset);if(!x)return;const p=prefs();
      if(p.preset===x.key){H()?.set({...H().defaults});syncRuler();queueSave();renderPanel();announce('Profil o‘chirildi');return}
      change({...H().defaults,...x.set,preset:x.key},{preset:true});announce(x.title+' profili yoqildi');return}
    if(b.dataset.toggle){const k=b.dataset.toggle;change({[k]:!prefs()[k]});announce((b.getAttribute('aria-checked')==='true'?'O‘chirildi':'Yoqildi'));return}
    if(b.dataset.set){const raw=b.dataset.val,v=/^\d+$/.test(raw)?Number(raw):raw;change({[b.dataset.set]:v});return}
    if(b.dataset.size!==undefined){const d=Number(b.dataset.size),cur=prefs().textScale,i=SIZES.indexOf(cur);const next=d===0?100:SIZES[Math.max(0,Math.min(SIZES.length-1,(i<0?0:i)+d))];change({textScale:next});announce('Matn o‘lchami '+next+' foiz');return}
    if(b.dataset.gender){window.HxSpeech?.setGender(b.dataset.gender);renderPanel();speak(b.dataset.gender==='male'?'Assalomu alaykum, men Sardorman.':'Assalomu alaykum, men Madinaman.');return}
    if(b.dataset.act==='read')readPage();
    if(b.dataset.act==='stop')stopSpeech();
    if(b.dataset.act==='reset'){H()?.set({...H().defaults});syncRuler();queueSave();renderPanel();announce('Sozlamalar asl holatiga qaytdi')}
    if(b.dataset.act==='close')close();
  }
  function onPanelInput(e){
    const t=e.target;
    if(t.dataset.range){change({[t.dataset.range]:Number(t.value)});return}
    if(t.dataset.select){change({[t.dataset.select]:t.value});return}
    if(t.hasAttribute('data-voice')){try{localStorage.setItem('hx-a11y-voice',t.value)}catch{}speak('Salom! Ovoz tanlandi.')}
  }
  function trap(e){
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(e.key!=='Tab'||!panel)return;const f=[...panel.querySelectorAll('button:not([disabled]),select,input')].filter(x=>x.offsetParent!==null);if(!f.length)return;
    if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus()}
  }
  function open(){
    if(panel)return close();lastFocus=document.activeElement;
    backdrop=document.createElement('div');backdrop.className='hxa-backdrop';backdrop.addEventListener('click',close);
    panel=document.createElement('aside');panel.className='hxa-panel hxa-keep-zoom';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','hxaTitle');
    panel.innerHTML='<div class="hxa-head"><h2 id="hxaTitle">♿ Qulaylik sozlamalari<small>Imkoniyati cheklangan foydalanuvchilar uchun</small></h2><button type="button" class="hxa-x hx-plain" data-act="close" aria-label="Yopish">×</button></div><div class="hxa-body"></div><div class="hxa-foot"><small id="hxaSaved" role="status"></small><button type="button" class="hxa-btn hx-plain" data-act="reset">↺ Asl holatiga</button></div>';
    panel.addEventListener('click',onPanelClick);panel.addEventListener('change',onPanelInput);panel.addEventListener('keydown',trap);
    document.body.append(backdrop,panel);renderPanel();document.querySelectorAll('.hxa-trigger').forEach(b=>b.setAttribute('aria-expanded','true'));
    setTimeout(()=>panel?.querySelector('.hxa-x')?.focus(),30);
  }
  function close(){panel?.remove();backdrop?.remove();panel=backdrop=null;document.querySelectorAll('.hxa-trigger').forEach(b=>b.setAttribute('aria-expanded','false'));try{lastFocus?.focus?.()}catch{}}

  // ---------- triggers + shortcuts ----------
  const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v5M12 15l-3.5 6M12 15l3.5 6"/></svg>';
  function mountTriggers(){
    const head=document.querySelector('#shell .header-actions');
    if(head&&!head.querySelector('.hxa-trigger')){const b=document.createElement('button');b.type='button';b.className='hxa-trigger hx-plain';b.id='a11yBtn';b.title='Qulaylik sozlamalari (Alt+Shift+A)';b.setAttribute('aria-label','Qulaylik sozlamalari: matn o‘lchami, kontrast, ovozli o‘qish');b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');b.innerHTML=ICON;b.addEventListener('click',open);head.insertBefore(b,head.firstChild)}
    const login=document.getElementById('login');
    if(login&&!login.querySelector('.hxa-trigger')){const b=document.createElement('button');b.type='button';b.className='hxa-trigger hxa-login hx-plain';b.setAttribute('aria-label','Qulaylik sozlamalari');b.setAttribute('aria-haspopup','dialog');b.innerHTML=ICON+'<span>Qulaylik</span>';b.addEventListener('click',open);login.appendChild(b)}
  }
  document.addEventListener('keydown',e=>{
    if(!e.altKey||!e.shiftKey)return;const k=e.code;
    if(k==='KeyA'){e.preventDefault();open()}else if(k==='KeyR'){e.preventDefault();readPage()}else if(k==='KeyS'){e.preventDefault();stopSpeech()}
  });
  const toastEl=document.getElementById('toast');if(toastEl){toastEl.setAttribute('role','status');toastEl.setAttribute('aria-live','polite')}
  mountTriggers();syncRuler();
  H()?.onChange(()=>syncRuler());
  return {open,close,speak,stopSpeech,announce,readPage,syncFromServer,mountTriggers,prefs,updatePrefs:change,signedOut:()=>{loggedIn=false;clearTimeout(saveTimer)}};
}
