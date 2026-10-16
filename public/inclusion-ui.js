// HALLAYM EDU — inclusive education in the browser:
//  • accessibility preferences (font size, contrast, dyslexia spacing, large targets, reduced motion…) applied before login;
//  • speech output (Web Speech API) with Uzbek voice detection and honest fallbacks;
//  • voice assistant: Uzbek/Russian voice commands, hands-free mode, voice-guided login;
//  • self-voicing focus reader for users without TalkBack/VoiceOver/NVDA;
//  • audio books (public/audio-reader.js), spoken + Web Push notifications;
//  • «Qulaylik» page for everyone, «Inklyuziv ta’lim» page for staff and teachers, enrolment fields for the user form.
import {NEEDS,STATUSES,PREF_DEFAULTS,cleanPrefs,suggestedExtraPct} from './inclusion-rules.js';
import {matchCommand,helpLines,spokenToLogin,spokenToDigits,spellOut,normalize} from './voice-commands.js';
import {openAudioReader,splitSentences} from './audio-reader.js';

const LS='m2-a11y-prefs',VOICE_DEVICE='m2-voice-device',HANDS_FREE='m2-va-handsfree';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const escH=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const readLocal=()=>{try{return cleanPrefs(JSON.parse(localStorage.getItem(LS)||'{}'))}catch{return {}}};
const writeLocal=p=>{try{localStorage.setItem(LS,JSON.stringify(cleanPrefs(p)))}catch{}};
let prefs={...PREF_DEFAULTS,...readLocal()};
// The pre-existing «Qulaylik» toggle of the live classroom keeps working and maps to the large-target mode.
if(localStorage.getItem('m2-accessibility')==='1')prefs.largeTargets=true;

// ---------------------------------------------------------------- preferences → document
export function applyPrefs(p=prefs){
  const h=document.documentElement;
  h.style.setProperty('--a11y-scale',String(p.fontScale||1));
  h.classList.toggle('a11y-scaled',(p.fontScale||1)>1.001);
  h.classList.toggle('a11y-contrast',p.contrast==='high');
  h.classList.toggle('a11y-dyslexia',!!p.dyslexia);
  h.classList.toggle('a11y-reduce-motion',!!p.reduceMotion);
  h.classList.toggle('a11y-large',!!p.largeTargets);
  h.classList.toggle('inclusive-mode',!!p.largeTargets);
  h.classList.toggle('a11y-underline',!!p.underlineLinks);
  h.classList.toggle('a11y-simplified',!!p.simplified);
  h.classList.toggle('a11y-focus',p.focusRing!==false);
  h.classList.toggle('a11y-voice',!!p.voiceAssistant);
  $('#vaDock')?.classList.toggle('va-on',!!p.voiceAssistant||Boolean($('#login:not(.hidden)')));
}

// ---------------------------------------------------------------- speech output
const synth=typeof window!=='undefined'?window.speechSynthesis:null;
let voices=[];
const loadVoices=()=>{try{voices=synth?.getVoices()||[]}catch{voices=[]}};
loadVoices();synth?.addEventListener?.('voiceschanged',loadVoices);
const FALLBACK={uz:['uz','tr','kk','ru'],ru:['ru'],en:['en'],tr:['tr'],kk:['kk','ru']};
export function pickVoice(lang=prefs.ttsLang||'uz-UZ'){
  if(!voices.length)loadVoices();
  if(prefs.ttsVoice){const v=voices.find(x=>x.voiceURI===prefs.ttsVoice);if(v)return v}
  const base=String(lang).slice(0,2);
  for(const code of FALLBACK[base]||[base]){
    const list=voices.filter(v=>String(v.lang).toLowerCase().startsWith(code));
    if(list.length)return list.find(v=>/natural|online|neural|google/i.test(v.name))||list[0];
  }
  return voices.find(v=>v.default)||voices[0]||null;
}
export const hasUzbekVoice=()=>{if(!voices.length)loadVoices();return voices.some(v=>String(v.lang).toLowerCase().startsWith('uz'))};
let lastSpoken='',speakToken=0;
export function speak(text,{interrupt=true,rate,lang,onend,onerror,onstart}={}){
  const t=String(text||'').trim();
  if(!synth||!t){onend?.();return false}
  if(interrupt){speakToken++;synth.cancel()}
  lastSpoken=t;
  const chunks=t.length>230?splitSentences(t):[t];const my=speakToken;
  const next=i=>{
    if(my!==speakToken)return;
    if(i>=chunks.length){onend?.();return}
    const u=new SpeechSynthesisUtterance(chunks[i]);const v=pickVoice(lang);
    if(v){u.voice=v;u.lang=v.lang}else u.lang=lang||prefs.ttsLang||'uz-UZ';
    u.rate=Number(rate||prefs.ttsRate||1);
    if(i===0)u.onstart=()=>onstart?.();
    u.onend=()=>next(i+1);
    u.onerror=e=>{if(e?.error==='interrupted'||e?.error==='canceled')return;onerror?.(e)};
    synth.speak(u);
    // Chrome pauses the queue when the tab was hidden; nudge it.
    if(synth.paused)synth.resume();
  };
  next(0);return true;
}
export const stopSpeaking=()=>{speakToken++;try{synth?.cancel()}catch{}};
const speechApi={speak:(t,o)=>speak(t,{...o,interrupt:true}),stop:stopSpeaking,rate:()=>Number(prefs.ttsRate||1),bookLang:()=>prefs.ttsLang};

// ---------------------------------------------------------------- live regions and notification history
const notifHistory=[];
function ensureLiveRegions(){
  if($('#a11yLive'))return;
  const mk=(id,role,live)=>{const d=document.createElement('div');d.id=id;d.className='a11y-sr-only';d.setAttribute('role',role);d.setAttribute('aria-live',live);d.setAttribute('aria-atomic','true');document.body.append(d);return d};
  mk('a11yLive','status','polite');mk('a11yAlert','alert','assertive');
}
// Screen-reader text + optional speech + optional visual flash. Every toast of the app passes through here.
export function announce(text,{assertive=false,speakIt,flash}={}){
  const t=String(text||'').trim();if(!t)return;
  ensureLiveRegions();
  const el=assertive?$('#a11yAlert'):$('#a11yLive');el.textContent='';setTimeout(()=>{el.textContent=t},30);
  notifHistory.unshift({text:t,at:new Date()});notifHistory.length=Math.min(notifHistory.length,30);
  const shouldSpeak=speakIt??(prefs.voiceAssistant||prefs.speakNotifications);
  if(shouldSpeak)speak(t,{interrupt:assertive});
  if(flash??prefs.visualAlerts){document.documentElement.classList.remove('a11y-flash');void document.documentElement.offsetWidth;document.documentElement.classList.add('a11y-flash')}
}
function watchToasts(){
  const t=$('#toast');if(!t||t.dataset.a11yWatch)return;t.dataset.a11yWatch='1';
  let last='';new MutationObserver(()=>{if(!t.classList.contains('show'))return;const txt=t.textContent.trim();if(txt&&txt!==last){last=txt;announce(txt)}setTimeout(()=>{last=''},1500)}).observe(t,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
  const err=$('#loginError');if(err)new MutationObserver(()=>{const x=err.textContent.trim();if(x)announce(x,{assertive:true,speakIt:voiceLoginActive||prefs.voiceAssistant})}).observe(err,{childList:true,characterData:true,subtree:true});
}

// ---------------------------------------------------------------- self-voicing focus reader
const ROLE_UZ={button:'tugma',link:'havola',checkbox:'belgilash katakchasi',radio:'tanlov',textbox:'matn maydoni',combobox:'ro‘yxat',heading:'sarlavha',tab:'varaq',menuitem:'menyu bandi',slider:'surgich',switch:'kalit'};
export function describe(el){
  if(!el||el===document.body)return '';
  const tag=el.tagName,type=String(el.getAttribute('type')||'').toLowerCase();
  let role=el.getAttribute('role')||(tag==='BUTTON'||type==='submit'||type==='button'?'button':tag==='A'?'link':tag==='SELECT'?'combobox':tag==='TEXTAREA'?'textbox':tag==='INPUT'?(type==='checkbox'?'checkbox':type==='radio'?'radio':type==='range'?'slider':'textbox'):/^H[1-6]$/.test(tag)?'heading':tag==='SUMMARY'?'button':'');
  const byId=id=>document.getElementById(id)?.textContent||'';
  let name=el.getAttribute('aria-label')||(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(byId).join(' ');
  if(!name&&el.id){const l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l)name=l.textContent}
  if(!name&&['INPUT','SELECT','TEXTAREA'].includes(tag)){const l=el.closest('label');if(l)name=[...l.childNodes].filter(n=>n.nodeType===3||!['INPUT','SELECT','TEXTAREA'].includes(n.tagName)).map(n=>n.textContent).join(' ')}
  if(!name)name=['INPUT','TEXTAREA'].includes(tag)?(el.placeholder||''):(el.innerText||el.textContent||'');
  if(!name)name=el.title||'';
  name=name.replace(/\s+/g,' ').trim().slice(0,140);
  let state='';
  if(role==='checkbox'||role==='switch')state=el.checked||el.getAttribute('aria-checked')==='true'?'belgilangan':'belgilanmagan';
  else if(role==='combobox'&&tag==='SELECT')state='tanlangan: '+(el.selectedOptions?.[0]?.textContent||'');
  else if(role==='textbox')state=type==='password'?(el.value?'parol yozilgan':'bo‘sh, parol'):(el.value?'qiymati: '+String(el.value).slice(0,60):'bo‘sh');
  else if(role==='slider')state='qiymati '+el.value;
  if(el.getAttribute('aria-pressed')==='true')state+=' yoqilgan';
  if(el.getAttribute('aria-expanded')!==null)state+=el.getAttribute('aria-expanded')==='true'?' ochiq':' yopiq';
  if(el.disabled||el.getAttribute('aria-disabled')==='true')state+=' faol emas';
  if(el.getAttribute('aria-current')==='page')state+=' joriy sahifa';
  return [name,ROLE_UZ[role]||'',state.trim()].filter(Boolean).join(', ');
}
let focusTimer=null;
document.addEventListener('focusin',e=>{if(!prefs.speakFocus)return;clearTimeout(focusTimer);focusTimer=setTimeout(()=>{const d=describe(e.target);if(d)speak(d)},120)});

// ---------------------------------------------------------------- earcons (short tones so a blind user knows the mic state)
let actx=null;
function beep(freq=880,ms=110){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=freq;g.gain.value=0.08;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+ms/1000)}catch{}}

// ---------------------------------------------------------------- speech recognition
const SR=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;
export const canListen=()=>Boolean(SR);
let recognizing=null;
// One utterance → array of alternatives (strings). Rejects with a readable message.
export function listenOnce({lang=prefs.sttLang||'uz-UZ',timeoutMs=9000}={}){
  return new Promise((resolve,reject)=>{
    if(!SR)return reject(new Error('Bu brauzer ovozli buyruqni qo‘llamaydi. Chrome, Edge yoki Samsung Internet ishlating.'));
    try{recognizing?.abort()}catch{}
    const r=new SR();recognizing=r;r.lang=lang;r.interimResults=false;r.maxAlternatives=4;r.continuous=false;
    let done=false;const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);setDock('idle');fn(v)};
    const timer=setTimeout(()=>{try{r.stop()}catch{}},timeoutMs);
    r.onresult=e=>{const alts=[...(e.results?.[0]||[])].map(a=>a.transcript).filter(Boolean);finish(resolve,alts)};
    r.onerror=e=>finish(reject,new Error(e.error==='not-allowed'?'Mikrofonga ruxsat berilmagan. Brauzer sozlamalarida mikrofonni yoqing.':e.error==='no-speech'?'Ovoz eshitilmadi.':e.error==='network'?'Ovozni aniqlash uchun internet kerak.':'Ovozni aniqlab bo‘lmadi ('+e.error+')'));
    r.onend=()=>finish(resolve,[]);
    try{r.start();setDock('listening');beep(880)}catch(e){finish(reject,e)}
  });
}
// Speak, then listen (waits for speech to finish so the microphone does not hear the synthesizer).
const say=(text,o={})=>new Promise(res=>{if(!speak(text,{...o,onend:res,onerror:res}))res()});
async function ask(question,opts){await say(question);return listenOnce(opts).catch(e=>{throw e})}

// ---------------------------------------------------------------- floating voice dock
function setDock(state){const d=$('#vaDock');if(!d)return;d.dataset.state=state;const b=$('#vaBtn');if(b){b.setAttribute('aria-pressed',state==='listening'?'true':'false');b.querySelector('b').textContent=state==='listening'?'Tinglayapman…':'Ovozli buyruq'}}
function ensureDock(){
  if($('#vaDock'))return;
  const d=document.createElement('div');d.id='vaDock';d.className='va-dock hidden';d.dataset.state='idle';
  d.innerHTML='<button id="vaBtn" type="button" class="hx-plain" aria-pressed="false" aria-describedby="vaHint"><span aria-hidden="true">🎙</span><b>Ovozli buyruq</b></button><button id="a11yQuickBtn" type="button" class="hx-plain" aria-label="Qulaylik sozlamalari (Alt+A)"><span aria-hidden="true">♿</span></button><span id="vaHint" class="a11y-sr-only">Alt+V — buyruq aytish, Alt+R — sahifani o‘qish, Escape — ovozni to‘xtatish</span>';
  document.body.append(d);
  $('#vaBtn').onclick=()=>commandOnce();
  $('#a11yQuickBtn').onclick=()=>toggleQuickPanel();
}

// ---------------------------------------------------------------- quick panel (works on the login screen too)
function toggleQuickPanel(force){
  let p=$('#a11yQuick');
  if(p&&force!==true){p.remove();$('#a11yQuickBtn')?.focus();return}
  if(p)return;
  p=document.createElement('div');p.id='a11yQuick';p.className='a11y-quick';p.setAttribute('role','dialog');p.setAttribute('aria-label','Tezkor qulaylik sozlamalari');
  const row=(k,label)=>'<label class="a11y-switch"><input type="checkbox" data-q="'+k+'" '+(prefs[k]?'checked':'')+'><span>'+label+'</span></label>';
  p.innerHTML='<div class="a11y-quick-head"><b>♿ Qulaylik</b><button type="button" class="hx-plain" data-q-close aria-label="Yopish">✕</button></div>'+
    '<div class="a11y-quick-size" role="group" aria-label="Shrift o‘lchami"><button type="button" class="hx-plain" data-size="-1" aria-label="Kichikroq shrift">A−</button><output>'+Math.round((prefs.fontScale||1)*100)+'%</output><button type="button" class="hx-plain" data-size="1" aria-label="Kattaroq shrift">A+</button></div>'+
    '<label class="a11y-switch"><input type="checkbox" data-q="contrast" '+(prefs.contrast==='high'?'checked':'')+'><span>Yuqori kontrast</span></label>'+
    row('voiceAssistant','Ovozli yordamchi')+row('speakFocus','Tanlangan elementni ovozda aytish')+row('largeTargets','Katta tugmalar')+row('dyslexia','O‘qish uchun qulay shrift')+row('reduceMotion','Animatsiyasiz')+
    '<button type="button" class="hx-plain a11y-quick-more" data-q-more>Barcha sozlamalar →</button>';
  document.body.append(p);
  p.querySelector('[data-q-close]').onclick=()=>toggleQuickPanel();
  p.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{setPref('fontScale',Math.round(((prefs.fontScale||1)+Number(b.dataset.size)*0.125)*1000)/1000);p.querySelector('output').textContent=Math.round(prefs.fontScale*100)+'%'});
  p.querySelectorAll('[data-q]').forEach(c=>c.onchange=()=>setPref(c.dataset.q,c.dataset.q==='contrast'?(c.checked?'high':'normal'):c.checked));
  p.querySelector('[data-q-more]').onclick=()=>{toggleQuickPanel();if(ctx?.currentUser?.())ctx.go('accessibility');else announce('Barcha sozlamalar tizimga kirgandan keyin «Qulaylik» bo‘limida',{speakIt:true})};
  p.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();toggleQuickPanel()}});
  p.querySelector('input,button')?.focus();
}

let saveTimer=null;
export function setPref(k,v,{silent=false}={}){
  prefs={...prefs,...cleanPrefs({[k]:v})};writeLocal(prefs);applyPrefs();
  if(k==='voiceAssistant'){try{localStorage.setItem(VOICE_DEVICE,v?'1':'0')}catch{};if(v&&!silent)speak('Ovozli yordamchi yoqildi. Buyruq aytish uchun Alt va V tugmalarini bosing yoki mikrofon tugmasini bosing.')}
  if(k==='largeTargets'){try{localStorage.setItem('m2-accessibility',v?'1':'0')}catch{}}
  if(ctx?.currentUser?.()){clearTimeout(saveTimer);saveTimer=setTimeout(()=>ctx.api('/inclusion/me/prefs',{method:'PUT',body:JSON.stringify({prefs:cleanPrefs(prefs)})}).catch(()=>{}),600)}
}
export const getPrefs=()=>({...prefs});

// ---------------------------------------------------------------- reading the current page
let pageQueue=null;
function readActivePage(){
  const page=$('.page.active')||$('#login:not(.hidden)')||document.body;
  const clone=page.cloneNode(true);clone.querySelectorAll('script,style,svg,[hidden],.hidden,[aria-hidden="true"],select').forEach(x=>x.remove());
  const text=(clone.innerText||clone.textContent||'').replace(/\n{2,}/g,'. ').replace(/\s+/g,' ').trim().slice(0,6000);
  const list=splitSentences(text);if(!list.length)return say('Bu sahifada o‘qiladigan matn yo‘q.');
  pageQueue={list,i:0,playing:true};readNextChunk();
}
function readNextChunk(){if(!pageQueue?.playing)return;const q=pageQueue;if(q.i>=q.list.length){pageQueue=null;return}speak(q.list[q.i],{onend:()=>{if(pageQueue===q&&q.playing){q.i++;readNextChunk()}}})}

// ---------------------------------------------------------------- voice commands
let ctx=null,pendingConfirm=null;
const MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'],DAYS=['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];
const PAGE_NAMES={dashboard:'Bosh sahifa',schedule:'Dars jadvali',live:'Guruh darslari',videos:'Videodarslar',courses:'Fanlar va vazifalar',grades:'Baholar',library:'Elektron kutubxona',lab:'Virtual laboratoriya',communications:'Xabarlar',myRequests:'Murojaatlarim',finalExams:'Yakuniy nazorat',profile:'Shaxsiy profil',accessibility:'Qulaylik sozlamalari',search:'Qidiruv'};
async function runCommand(cmd){
  const reader=openAudioReader.current?.isOpen?.()?openAudioReader.current:null;
  if(pendingConfirm&&(cmd.action==='yes'||cmd.action==='no')){const f=pendingConfirm;pendingConfirm=null;return f(cmd.action==='yes')}
  switch(cmd.action){
    case 'stop':stopSpeaking();if(pageQueue)pageQueue.playing=false;reader?.pause();return;
    case 'resume':if(reader)return reader.play();if(pageQueue){pageQueue.playing=true;return readNextChunk()}return say('Davom ettiradigan narsa yo‘q.');
    case 'help':return say('Quyidagilarni aytishingiz mumkin. '+helpLines().join('. ')+'.');
    case 'repeat':return say(lastSpoken||'Hali hech narsa aytilmadi.');
    case 'readPage':return readActivePage();
    case 'next':if(reader)return reader.next();if(pageQueue){pageQueue.i++;pageQueue.playing=true;return readNextChunk()}return;
    case 'prev':if(reader)return reader.prev();if(pageQueue){pageQueue.i=Math.max(0,pageQueue.i-1);pageQueue.playing=true;return readNextChunk()}return;
    case 'faster':if(reader)return reader.faster();setPref('ttsRate',(prefs.ttsRate||1)+0.2);return say('Tezlik '+prefs.ttsRate);
    case 'slower':if(reader)return reader.slower();setPref('ttsRate',(prefs.ttsRate||1)-0.2);return say('Tezlik '+prefs.ttsRate);
    case 'bigger':setPref('fontScale',(prefs.fontScale||1)+0.25);return say('Shrift '+Math.round(prefs.fontScale*100)+' foiz');
    case 'smaller':setPref('fontScale',(prefs.fontScale||1)-0.25);return say('Shrift '+Math.round(prefs.fontScale*100)+' foiz');
    case 'contrast':setPref('contrast',prefs.contrast==='high'?'normal':'high');return say(prefs.contrast==='high'?'Yuqori kontrast yoqildi':'Oddiy ranglar');
    case 'time':{const d=new Date();return say('Soat '+d.getHours()+' dan '+d.getMinutes()+' daqiqa o‘tdi. Bugun '+DAYS[d.getDay()]+', '+d.getDate()+'-'+MONTHS[d.getMonth()]+'.')}
    case 'notifications':return say(notifHistory.length?'Oxirgi xabarlar. '+notifHistory.slice(0,5).map(h=>h.at.getHours()+':'+String(h.at.getMinutes()).padStart(2,'0')+' — '+h.text).join('. '):'Yangi bildirishnoma yo‘q.');
  }
  if(!ctx?.currentUser?.())return say('Avval tizimga kiring. Ovozli kirish uchun «kirish» deng yoki login maydoniga o‘ting.');
  switch(cmd.action){
    case 'go':{const btn=document.querySelector('nav button[data-page="'+cmd.page+'"]');if(btn&&btn.classList.contains('hidden'))return say('Bu bo‘lim sizning rolingiz uchun yopiq.');ctx.go(cmd.page);await new Promise(r=>setTimeout(r,700));const h=$('.page.active h1')?.textContent||PAGE_NAMES[cmd.page]||'';const sub=$('.page.active .page-head p')?.textContent||'';return say(h+' ochildi. '+sub+' Matnni eshitish uchun «o‘qi» deng.')}
    case 'search':{ctx.go('search');await new Promise(r=>setTimeout(r,400));const i=$('#globalSearchInput');if(i){i.value=cmd.arg;i.dispatchEvent(new Event('input',{bubbles:true}));$('#globalSearchForm')?.requestSubmit?.()}return say('«'+cmd.arg+'» bo‘yicha qidiryapman. Natijalarni eshitish uchun «o‘qi» deng.')}
    case 'listenBook':{const b=$('#libraryListen');if(b)return b.click();ctx.go('library');return say('Kutubxona ochildi. Kitobni tanlang, keyin «Audio tinglash» tugmasini bosing yoki «kitobni o‘qi» deng.')}
    case 'joinLesson':{ctx.go('live');await new Promise(r=>setTimeout(r,1200));const b=all('#live [data-live-join],#live [data-join-lesson],#dashboard [data-join-lesson]').find(x=>!x.disabled&&x.offsetParent);if(!b)return say('Hozir kirish mumkin bo‘lgan jonli dars yo‘q.');await say('Darsga kiryapman.');return b.click()}
    case 'logout':pendingConfirm=ok=>{if(ok){say('Tizimdan chiqdingiz.');ctx.logout?.()}else say('Bekor qilindi.')};await say('Tizimdan chiqishni tasdiqlaysizmi? Ha yoki yo‘q deng.');return commandOnce({silentStart:true});
    case 'yes':case 'no':return say('Tasdiqlanadigan savol yo‘q.');
  }
}
export async function commandOnce({silentStart=false}={}){
  if(!SR){return say('Bu brauzer ovozli buyruqni qo‘llamaydi. Chrome yoki Edge ishlating. Klaviaturadan foydalanish mumkin: Alt va R — sahifani o‘qish.')}
  try{
    stopSpeaking();if(pageQueue)pageQueue.playing=false;
    if(!silentStart)await new Promise(r=>setTimeout(r,60));
    const alts=await listenOnce();
    if(!alts.length){if(!handsFree)announce('Ovoz eshitilmadi',{speakIt:true});return}
    if(voiceLoginActive)return; // the login dialogue consumes its own answers
    let cmd=null;for(const a of alts){cmd=matchCommand(a);if(cmd)break}
    if(!cmd){if(!ctx?.currentUser?.()&&/kir|login|vход|voyti/.test(normalize(alts[0])))return startVoiceLogin();return say('Tushunmadim: «'+alts[0]+'». Buyruqlar ro‘yxati uchun «yordam» deng.')}
    beep(660,80);await runCommand(cmd);
  }catch(e){announce(e.message,{assertive:true,speakIt:true})}
}

// Hands-free: keeps listening while the page is visible (the browser still shows its microphone indicator).
let handsFree=false;
async function handsFreeLoop(){
  while(handsFree&&document.visibilityState==='visible'){
    if(synth?.speaking||voiceLoginActive||openAudioReader.current?.isOpen?.()&&synth?.speaking){await new Promise(r=>setTimeout(r,500));continue}
    await commandOnce({silentStart:true});
    await new Promise(r=>setTimeout(r,250));
  }
}
export function setHandsFree(on){handsFree=Boolean(on);try{localStorage.setItem(HANDS_FREE,on?'1':'0')}catch{};if(handsFree){say('Qo‘llarsiz rejim yoqildi. Men doim tinglayman. O‘chirish uchun qulaylik sozlamalariga o‘ting.').then(handsFreeLoop)}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&handsFree)handsFreeLoop()});

// ---------------------------------------------------------------- voice-guided login
let voiceLoginActive=false;
export async function startVoiceLogin(){
  if(voiceLoginActive)return;voiceLoginActive=true;$('#vaLoginGate')?.remove();
  const loginInput=$('#loginInput'),pass=$('#passwordInput');
  loginInput?.focus(); // keyboard users can type while the assistant talks
  try{
    await say('Ovozli kirish. Platforma: '+(document.querySelector('[data-product-name]')?.textContent||'HALLAYM EDU')+'.');
    if(!SR){await say('Bu brauzerda ovozni aniqlash yo‘q, shuning uchun klaviaturadan foydalanamiz. Login maydoni tanlandi. Loginingizni yozing, keyin Tab tugmasini bosib parolni yozing va Enter bosing.');loginInput?.focus();return}
    let login='';
    for(let tries=0;tries<3&&!login;tries++){
      let alts=[];
      try{alts=await ask(tries?'Qaytadan. Loginingizni harflab ayting.':'Loginingizni harflab ayting. Masalan: K, T, 21, tire, 0412. Yoki klaviaturada yozib, Enter bosing.')}catch(e){await say(e.message);break}
      if(loginInput.value.trim()){login=loginInput.value.trim();break}
      const guess=spokenToLogin(alts[0]||'');if(!guess)continue;
      let ans=[];try{ans=await ask('Login: '+spellOut(guess)+'. To‘g‘rimi? Ha yoki yo‘q deng.')}catch{}
      const yes=ans.map(matchCommand).find(Boolean);
      if(yes?.action==='yes'){login=guess;loginInput.value=guess;loginInput.dispatchEvent(new Event('input',{bubbles:true}))}
    }
    if(!login){await say('Loginni klaviaturada yozing. Login maydoni tanlandi.');loginInput?.focus();return}
    pass?.focus();
    let ans=[];try{ans=await ask('Endi parolingizni klaviaturada yozing va Enter bosing. Xavfsizlik uchun parolni ovoz chiqarib aytmang, atrofingizdagilar eshitishi mumkin. Yozolmasangiz, «ovoz bilan» deng.',{timeoutMs:12000})}catch{}
    if(ans.some(a=>/ovoz/.test(normalize(a)))&&!pass.value){
      let p=[];try{p=await ask('Parolni aniq ayting. Katta harflar farqlanmaydi, shuning uchun bunday parolni keyin profil bo‘limida almashtirib qo‘ying.',{timeoutMs:12000})}catch{}
      const val=String(p[0]||'').replace(/\s+/g,'');if(val){pass.value=val;await say('Parol yozildi. Kiryapman.');$('#loginForm')?.requestSubmit()}
    }else if(!pass.value){await say('Parol maydoni tanlangan. Yozib bo‘lgach Enter bosing.')}
  }finally{voiceLoginActive=false}
}
// After a failed login or when 2FA is requested, continue by voice.
function watchLoginSteps(){
  const otp=$('#loginOtpWrap');if(!otp)return;
  new MutationObserver(async()=>{
    if(otp.classList.contains('hidden')||!(prefs.voiceAssistant||localStorage.getItem(VOICE_DEVICE)==='1'))return;
    if(!SR)return say('Ikki bosqichli kodni yozing va Enter bosing.');
    try{const a=await ask('Ikki bosqichli tasdiqlash. Ilovadagi olti xonali kodni ayting.');const code=spokenToDigits(a[0]||'');const inp=otp.querySelector('input');if(code.length>=6&&inp){inp.value=code;await say('Kod '+code.split('').join(' ')+'. Kiryapman.');$('#loginForm')?.requestSubmit()}else{await say('Kodni klaviaturada yozing.');inp?.focus()}}catch(e){await say(e.message)}
  }).observe(otp,{attributes:true,attributeFilter:['class']});
}
// Devices that a blind user used before (or opened from the «Ovozli yordamchi» app shortcut) get a full-screen start button:
// browsers allow speech only after a tap or key press.
function offerVoiceGate(){
  const params=new URLSearchParams(location.search);
  const wanted=params.get('voice')==='1'||localStorage.getItem(VOICE_DEVICE)==='1';
  if(!wanted||$('#vaLoginGate'))return;
  const g=document.createElement('button');g.id='vaLoginGate';g.type='button';g.className='va-gate hx-plain';
  g.innerHTML='<span aria-hidden="true">🔊</span><b>Ovozli yordamchini boshlash</b><small>Ekranning istalgan joyiga bosing yoki istalgan tugmani bosing</small>';
  document.body.append(g);g.focus();
  const go=()=>{g.remove();document.removeEventListener('keydown',key,true);if(!prefs.voiceAssistant)setPref('voiceAssistant',true,{silent:true});if($('#login:not(.hidden)'))startVoiceLogin();else say('Ovozli yordamchi tayyor. Buyruq aytish uchun Alt va V ni bosing yoki pastdagi mikrofon tugmasini bosing. «Yordam» deb buyruqlarni eshiting.').then(()=>{if(localStorage.getItem(HANDS_FREE)==='1')setHandsFree(true)})};
  const key=e=>{if(['Tab','Shift'].includes(e.key))return;e.preventDefault();go()};
  g.onclick=go;document.addEventListener('keydown',key,true);
}
function addLoginVoiceButton(){
  const card=$('#loginForm');if(!card||$('#voiceLoginBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='voiceLoginBtn';b.className='secondary voice-login-btn';
  b.innerHTML='<span aria-hidden="true">🔊</span> Ovozli yordamchi bilan kirish';
  b.onclick=()=>{setPref('voiceAssistant',true,{silent:true});startVoiceLogin()};
  card.querySelector('.login-submit')?.after(b);
}

// ---------------------------------------------------------------- keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.altKey&&!e.ctrlKey&&!e.metaKey){
    const k=e.key.toLowerCase();
    if(k==='v'||e.code==='KeyV'){e.preventDefault();commandOnce()}
    else if(k==='a'||e.code==='KeyA'){e.preventDefault();toggleQuickPanel()}
    else if(k==='r'||e.code==='KeyR'){e.preventDefault();const sel=String(window.getSelection?.()||'').trim();if(sel)speak(sel);else readActivePage()}
  }else if(e.key==='Escape'&&synth?.speaking&&!document.querySelector('.ar-dialog')){stopSpeaking();if(pageQueue)pageQueue.playing=false}
});

// ---------------------------------------------------------------- early init (runs on import, before login)
export function initInclusionEarly(){
  applyPrefs();ensureLiveRegions();ensureDock();watchToasts();addLoginVoiceButton();watchLoginSteps();
  $('#vaDock')?.classList.remove('hidden');applyPrefs();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',offerVoiceGate,{once:true});else offerVoiceGate();
  navigator.serviceWorker?.addEventListener?.('message',e=>{if(e.data?.type==='push')announce((e.data.title||'')+'. '+(e.data.body||''),{assertive:true})});
}

// ---------------------------------------------------------------- push notifications
const b64ToBytes=s=>{const pad='='.repeat((4-s.length%4)%4);const raw=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0))};
export const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
// serviceWorker.ready never settles when registration failed (private mode, blocked storage): never wait forever.
const swReady=(ms=4000)=>Promise.race([navigator.serviceWorker.ready,new Promise(r=>setTimeout(()=>r(null),ms))]);
async function subscribePush(publicKey,{ask=false}={}){
  if(!pushSupported()||!publicKey)return {ok:false,reason:'unsupported'};
  if(Notification.permission==='default'&&ask)await Notification.requestPermission();
  if(Notification.permission!=='granted')return {ok:false,reason:Notification.permission};
  const reg=await swReady();if(!reg)throw new Error('Ilova xizmati (service worker) ishga tushmadi. Sahifani yangilang yoki brauzer xotirasini tozalang.');
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(publicKey)});
  await ctx.api('/inclusion/push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});
  return {ok:true};
}

// ---------------------------------------------------------------- after login
export function createInclusionUi(c){
  ctx=c;let me=null;
  const {api,toast,esc}=c;
  async function loadMe(){me=await api('/inclusion/me');return me}

  async function afterLogin(){
    try{
      await loadMe();
      // Server profile wins after login (same settings on every device); local-only device choices fill the gaps.
      prefs={...PREF_DEFAULTS,...readLocal(),...me.effective,...cleanPrefs(me.prefs||{})};writeLocal(prefs);applyPrefs();
      if(prefs.voiceAssistant){try{localStorage.setItem(VOICE_DEVICE,'1')}catch{}}
      if(me.push?.publicKey&&pushSupported()&&Notification.permission==='granted')subscribePush(me.push.publicKey).catch(()=>{});
      const u=c.currentUser();
      if(prefs.voiceAssistant&&synth)say('Xush kelibsiz, '+(u?.fullName||'')+'. Buyruq aytish uchun Alt va V ni yoki mikrofon tugmasini bosing. «Yordam» deb buyruqlarni eshiting.').then(()=>{if(localStorage.getItem(HANDS_FREE)==='1')setHandsFree(true)});
      if(u?.role==='student'&&me.profile.status==='none'&&!sessionStorage.getItem('m2-inc-hint')){sessionStorage.setItem('m2-inc-hint','1')}
    }catch{}
    // App shortcuts and push clicks open /?go=<page>
    const params=new URLSearchParams(location.search),page=params.get('go');
    if(page&&document.querySelector('nav button[data-page="'+CSS.escape(page)+'"]:not(.hidden)')){c.go(page);history.replaceState({},'',location.pathname+location.hash)}
  }

  // ---------- «Qulaylik» page ----------
  function renderAccessibilityPage(){
    const host=$('#accessibilityBoard');if(!host)return;
    const sw=(k,label,hint='')=>'<label class="a11y-switch"><input type="checkbox" data-pref="'+k+'" '+(prefs[k]?'checked':'')+'><span>'+label+(hint?'<small>'+hint+'</small>':'')+'</span></label>';
    loadVoices();
    const voiceOptions='<option value="">Avtomatik tanlash</option>'+voices.map(v=>'<option value="'+esc(v.voiceURI)+'" '+(prefs.ttsVoice===v.voiceURI?'selected':'')+'>'+esc(v.name+' · '+v.lang)+'</option>').join('');
    const uz=hasUzbekVoice();
    host.innerHTML=
      '<div class="a11y-grid">'+
      '<article class="a11y-card"><h2>👁 Ko‘rish va o‘qish</h2>'+
        '<label class="a11y-range">Shrift o‘lchami <input type="range" min="1" max="2" step="0.125" data-pref="fontScale" value="'+prefs.fontScale+'"><output>'+Math.round(prefs.fontScale*100)+'%</output></label>'+
        '<label class="a11y-switch"><input type="checkbox" data-pref="contrast" '+(prefs.contrast==='high'?'checked':'')+'><span>Yuqori kontrast<small>Qora fon, sariq va oq matn; zaif ko‘ruvchilar uchun</small></span></label>'+
        sw('dyslexia','O‘qish uchun qulay matn','Harf va qator oralig‘i kengroq, disleksiya uchun')+sw('underlineLinks','Havolalarni tagiga chizish')+sw('largeTargets','Katta tugmalar','Barmoq yoki qo‘l harakati cheklangan bo‘lsa')+sw('focusRing','Klaviatura fokusini aniq ko‘rsatish')+sw('reduceMotion','Animatsiyalarni o‘chirish')+sw('simplified','Soddalashtirilgan ko‘rinish','Ikkinchi darajali bezaklarni yashiradi')+'</article>'+
      '<article class="a11y-card"><h2>🔊 Ovoz</h2>'+
        '<p class="a11y-note '+(uz?'ok':'warn')+'">'+(uz?'✅ Bu qurilmada o‘zbekcha ovoz bor.':(voices.length?'⚠️ Bu qurilmada o‘zbekcha ovoz topilmadi: matn '+esc(pickVoice()?.lang||'boshqa')+' ovozida o‘qiladi. Eng yaxshi o‘zbekcha ovoz Microsoft Edge brauzerida («Microsoft Sardor / Madina Online»).':'⚠️ Brauzer ovozlarni hali yuklamadi yoki ovozli o‘qishni qo‘llamaydi.'))+'</p>'+
        sw('voiceAssistant','Ovozli yordamchi','Ko‘zi ojizlar uchun: sahifalar, xabarlar va natijalar ovozda; ovozli buyruqlar')+
        sw('speakFocus','Tanlangan elementni ovozda aytish','TalkBack, VoiceOver yoki NVDA ishlatsangiz, buni o‘chiring — ikki marta eshitiladi')+
        sw('speakNotifications','Bildirishnomalarni ovozda o‘qish')+sw('audioBooks','Hamma joyda «Audio tinglash» tugmasi')+
        '<label class="a11y-switch"><input type="checkbox" id="a11yHandsFree" '+(localStorage.getItem(HANDS_FREE)==='1'?'checked':'')+'><span>Qo‘llarsiz rejim<small>Ilova ochiq paytda doim buyruq tinglaydi (mikrofon belgisi yonib turadi)</small></span></label>'+
        '<label class="a11y-range">O‘qish tezligi <input type="range" min="0.5" max="2" step="0.1" data-pref="ttsRate" value="'+prefs.ttsRate+'"><output>'+prefs.ttsRate+'×</output></label>'+
        '<label>Ovoz<select data-pref="ttsVoice">'+voiceOptions+'</select></label>'+
        '<label>Matn tili<select data-pref="ttsLang">'+[['uz-UZ','O‘zbek'],['ru-RU','Rus'],['en-US','Ingliz'],['tr-TR','Turk'],['kk-KZ','Qozoq']].map(([v,l])=>'<option value="'+v+'" '+(prefs.ttsLang===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
        '<label>Buyruq tili<select data-pref="sttLang">'+[['uz-UZ','O‘zbek'],['ru-RU','Rus'],['en-US','Ingliz']].map(([v,l])=>'<option value="'+v+'" '+(prefs.sttLang===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>'+
        '<div class="a11y-actions"><button type="button" class="secondary" id="a11yTestVoice">▶ Ovozni sinash</button><button type="button" class="secondary" id="a11yTestMic" '+(SR?'':'disabled')+'>🎙 Buyruqni sinash</button></div>'+
        (SR?'':'<p class="a11y-note warn">Bu brauzerda ovozli buyruq yo‘q (masalan Firefox). Chrome, Edge yoki Samsung Internet’da ishlaydi.</p>')+'</article>'+
      '<article class="a11y-card"><h2>🧏 Eshitish va muloqot</h2>'+sw('captions','Jonli darsda subtitrni doim ko‘rsatish')+sw('visualAlerts','Ovozli signallarni ekran chaqnashi bilan ko‘rsatish')+sw('chatFirst','Jonli darsda chat birinchi','Nutqida nuqson bo‘lsa: mikrofonsiz, yozib qatnashish')+'</article>'+
      '<article class="a11y-card"><h2>🔔 Bildirishnomalar</h2><p id="a11yPushState" class="a11y-note"></p><div class="a11y-actions"><button type="button" class="primary" id="a11yPushOn">Bildirishnomalarni yoqish</button><button type="button" class="secondary" id="a11yPushTest">Sinov xabari</button></div><p class="muted small">Dars boshlanganda va yangi xabar kelganda telefon ilova yopiq bo‘lsa ham xabar beradi. iPhone’da avval «Ulashish → Bosh ekranga qo‘shish» orqali ilovani o‘rnating.</p></article>'+
      '<article class="a11y-card" id="a11yProfileCard"><h2>♿ Mening imkoniyatlarim</h2><div id="a11yProfile">Yuklanmoqda…</div></article>'+
      '<article class="a11y-card"><h2>📱 Ilova va tezkor tugmalar</h2><p>Platformani telefon yoki kompyuterga ilova sifatida o‘rnating. Ilova belgisini bosib turing — «Ovozli yordamchi», «Darslar», «Audio kutubxona» yorliqlari chiqadi.</p><div class="a11y-actions"><button type="button" class="secondary" id="a11yInstall">Ilovani o‘rnatish</button></div>'+
        '<h3>Klaviatura</h3><ul class="a11y-keys"><li><kbd>Alt</kbd>+<kbd>V</kbd> — ovozli buyruq</li><li><kbd>Alt</kbd>+<kbd>R</kbd> — sahifani yoki belgilangan matnni o‘qish</li><li><kbd>Alt</kbd>+<kbd>A</kbd> — tezkor qulaylik paneli</li><li><kbd>Esc</kbd> — ovozni to‘xtatish</li><li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> — elementlar bo‘ylab yurish</li></ul>'+
        '<h3>Ekran o‘quvchi dasturlar</h3><p class="small">Platforma TalkBack (Android), VoiceOver (iPhone, Mac) va NVDA (Windows, bepul) bilan ishlaydi. Ular ko‘zi ojizlar uchun eng ishonchli yo‘l; ovozli yordamchi ularni to‘ldiradi.</p></article>'+
      '</div>';
    host.querySelectorAll('[data-pref]').forEach(el=>{
      const k=el.dataset.pref;
      const handler=()=>{const v=el.type==='checkbox'?(k==='contrast'?(el.checked?'high':'normal'):el.checked):(el.type==='range'?Number(el.value):el.value);setPref(k,v);const out=el.parentElement.querySelector('output');if(out)out.textContent=k==='fontScale'?Math.round(prefs.fontScale*100)+'%':prefs.ttsRate+'×'};
      el.addEventListener(el.type==='range'?'input':'change',handler);
    });
    $('#a11yHandsFree').onchange=e=>setHandsFree(e.target.checked);
    $('#a11yTestVoice').onclick=()=>speak('Assalomu alaykum! Bu ovozli o‘qish sinovi. Kitoblar va xabarlar shu ovozda o‘qiladi.');
    $('#a11yTestMic').onclick=async()=>{try{const a=await ask('Biror buyruq ayting, masalan: kutubxona.');const m=a.map(matchCommand).find(Boolean);say(a.length?'Eshitdim: '+a[0]+'. '+(m?'Bu buyruq tushunarli.':'Bunday buyruq yo‘q.'):'Ovoz eshitilmadi.')}catch(e){say(e.message)}};
    $('#a11yInstall').onclick=()=>$('#installPwaBtn')?.click();
    refreshPushState();renderMyProfile();
  }
  async function refreshPushState(){
    const el=$('#a11yPushState');if(!el)return;
    if(!pushSupported()){el.textContent='Bu brauzer push-bildirishnomani qo‘llamaydi.';el.className='a11y-note warn';return}
    const perm=Notification.permission;let sub=null,reg=null;try{reg=await swReady();sub=await reg?.pushManager.getSubscription()}catch{}
    el.className='a11y-note '+(perm==='granted'&&sub?'ok':'warn');
    el.textContent=!reg?'Ilova xizmati ishga tushmagan: bildirishnoma uchun sahifani yangilang (HTTPS kerak).':perm==='denied'?'Bildirishnomalar brauzerda bloklangan. Sayt sozlamalaridan ruxsat bering.':perm==='granted'&&sub?'✅ Bu qurilmada bildirishnomalar yoqilgan.':'Bildirishnomalar hali yoqilmagan.';
    $('#a11yPushOn').onclick=async()=>{try{const r=await subscribePush(me?.push?.publicKey||(await loadMe()).push.publicKey,{ask:true});toast(r.ok?'Bildirishnomalar yoqildi':'Ruxsat berilmadi');refreshPushState()}catch(e){toast(e.message)}};
    $('#a11yPushTest').onclick=async()=>{try{const r=await api('/inclusion/push/test',{method:'POST'});toast(r.sent?'Sinov xabari yuborildi':'Bu akkauntda faol qurilma yo‘q. Avval bildirishnomalarni yoqing.')}catch(e){toast(e.message)}};
  }
  function renderMyProfile(){
    const box=$('#a11yProfile');if(!box||!me)return;const p=me.profile,u=c.currentUser();
    const chips=p.needs.map(n=>'<span class="inc-chip">'+NEEDS[n].icon+' '+esc(NEEDS[n].short)+'</span>').join('')||'<span class="muted">Belgilanmagan</span>';
    let html='<p>Holat: <b class="inc-status inc-'+p.status+'">'+esc(STATUSES[p.status])+'</b></p><p>'+chips+'</p>'+(p.status==='verified'&&p.extraTimePct?'<p>⏱ Imtihon va testlarda qo‘shimcha vaqt: <b>+'+p.extraTimePct+'%</b></p>':'');
    if(u?.role==='student'){
      html+='<details '+(p.status==='none'?'open':'')+'><summary>'+(p.status==='none'?'Imkoniyatim cheklangan — moslashtirish so‘rash':'Ma’lumotni yangilash')+'</summary><form id="incRequest" class="inc-form"><fieldset><legend>Ehtiyojlarim</legend>'+
        Object.entries(NEEDS).map(([k,v])=>'<label class="a11y-switch"><input type="checkbox" name="needs" value="'+k+'" '+(p.needs.includes(k)?'checked':'')+'><span>'+v.icon+' '+esc(v.label)+'<small>'+esc(v.hint)+'</small></span></label>').join('')+'</fieldset>'+
        '<label>Izoh (ixtiyoriy)<textarea name="note" rows="2" maxlength="500" placeholder="Masalan: imtihonda katta shrift kerak">'+esc(p.selfNote||'')+'</textarea></label>'+
        '<label class="a11y-switch"><input type="checkbox" name="consent" required><span>Ma’lumotlarim faqat ta’limni moslashtirish uchun ishlatilishiga roziman<small>Tashxis yozilmaydi. Hujjatlarni dekanat yoki tyutor shaxsan ko‘radi.</small></span></label>'+
        '<button class="primary" type="submit">Yuborish</button></form></details>';
    }
    box.innerHTML=html;
    const f=$('#incRequest');if(f)f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f);try{const r=await api('/inclusion/me/request',{method:'POST',body:JSON.stringify({needs:fd.getAll('needs'),note:fd.get('note'),consent:fd.get('consent')==='on'})});me.profile=r.profile;prefs={...prefs,...r.effective,...cleanPrefs(me.prefs||{})};writeLocal(prefs);applyPrefs();toast('So‘rov yuborildi. Dekanat yoki tyutor tasdiqlaydi; qulaylik sozlamalari hozirdan yoqildi.');renderAccessibilityPage()}catch(err){toast(err.message)}};
  }

  // ---------- «Inklyuziv ta’lim» page (staff and teachers) ----------
  const TEACHER_TIPS={
    blind:'Materiallarni matnli PDF yoki DOCX ko‘rinishida bering (skaner rasm emas). Doskadagi formula va rasmlarni og‘zaki tushuntiring. Test savollarida rasm bo‘lsa, matnli tavsif qo‘shing.',
    low_vision:'Slaydlarda yirik shrift va yuqori kontrast ishlating. Fayllarni oldindan yuboring.',
    deaf:'Jonli darsda subtitrni yoqing, topshiriqlarni chatda yozma takrorlang. Videodarslarga subtitr qo‘shing.',
    motor:'Topshiriq topshirish muddatini moslashtiring; sichqonchasiz (klaviatura/ovoz) bajariladigan shakllarni tanlang.',
    speech:'Og‘zaki javob o‘rniga chat yoki yozma javobni qabul qiling.',
    cognitive:'Topshiriqlarni qisqa bosqichlarga bo‘ling, aniq muddat va namunalar bering.',
    chronic:'Muddatlarni moslashtiring, darsni yozib olib keyin ko‘rish imkonini bering.'
  };
  async function renderInclusionPage(){
    const host=$('#inclusionBoard');if(!host)return;const u=c.currentUser();host.innerHTML='<p class="muted">Yuklanmoqda…</p>';
    try{
      if(u.role==='teacher'){
        const r=await api('/inclusion/teacher');
        host.innerHTML='<p class="a11y-note">Guruhlaringizdagi tasdiqlangan inklyuziv talabalar. Imtihon va testlarda qo‘shimcha vaqt avtomatik qo‘shiladi.</p>'+(r.people.length?'<div class="inc-list">'+r.people.map(p=>'<article class="inc-row"><div><b>'+esc(p.fullName)+'</b><small>'+esc(p.group)+'</small></div><div>'+p.labels.map(l=>'<span class="inc-chip">'+esc(l)+'</span>').join('')+(p.profile.extraTimePct?'<span class="inc-chip time">⏱ +'+p.profile.extraTimePct+'%</span>':'')+'</div><ul class="inc-tips">'+p.profile.needs.map(n=>'<li>'+esc(TEACHER_TIPS[n]||'')+'</li>').join('')+'</ul></article>').join('')+'</div>':'<div class="empty">Guruhlaringizda tasdiqlangan inklyuziv talaba yo‘q.</div>');
        return;
      }
      const params=new URLSearchParams();const st=host.dataset.status||'',nd=host.dataset.need||'',q=host.dataset.q||'';if(st)params.set('status',st);if(nd)params.set('need',nd);if(q)params.set('q',q);
      const r=await api('/inclusion/people'+(params.toString()?'?'+params:''));
      const tile=(label,val,cls='')=>'<div class="inc-tile '+cls+'"><b>'+val+'</b><span>'+esc(label)+'</span></div>';
      host.innerHTML='<div class="inc-tiles">'+tile('Jami',r.summary.total)+tile('Tasdiq kutmoqda',r.summary.pending,r.summary.pending?'warn':'')+tile('Tasdiqlangan',r.summary.verified,'ok')+Object.entries(NEEDS).map(([k,v])=>tile(v.icon+' '+v.short,r.summary.byNeed[k]||0)).join('')+'</div>'+
        '<div class="toolbar inc-toolbar"><input id="incSearch" type="search" placeholder="F.I.Sh. yoki login" value="'+esc(q)+'" aria-label="Qidirish"><select id="incStatus" aria-label="Holat"><option value="">Barcha holatlar</option>'+Object.entries(STATUSES).filter(([k])=>k!=='none').map(([k,v])=>'<option value="'+k+'" '+(st===k?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select><select id="incNeed" aria-label="Ehtiyoj"><option value="">Barcha ehtiyojlar</option>'+Object.entries(NEEDS).map(([k,v])=>'<option value="'+k+'" '+(nd===k?'selected':'')+'>'+v.icon+' '+esc(v.short)+'</option>').join('')+'</select><button class="primary" id="incAdd" type="button">+ Talabani belgilash</button></div>'+
        (r.people.length?'<div class="inc-list">'+r.people.map(p=>'<article class="inc-row"><div><b>'+esc(p.fullName)+'</b><small>'+esc(p.login)+' · '+esc(p.group||'—')+'</small></div><div><span class="inc-status inc-'+p.profile.status+'">'+esc(STATUSES[p.profile.status])+'</span> '+p.labels.map(l=>'<span class="inc-chip">'+esc(l)+'</span>').join('')+(p.profile.extraTimePct?'<span class="inc-chip time">⏱ +'+p.profile.extraTimePct+'%</span>':'')+(p.profile.selfNote?'<p class="small">Talaba izohi: '+esc(p.profile.selfNote)+'</p>':'')+'</div><button class="secondary" type="button" data-inc-edit="'+esc(p.id)+'">'+(p.profile.status==='pending'?'Ko‘rib chiqish':'Tahrirlash')+'</button></article>').join('')+'</div>':'<div class="empty">Hali inklyuziv talaba belgilanmagan. «+ Talabani belgilash» tugmasini bosing yoki foydalanuvchi yaratishda belgilang.</div>');
      const people=new Map(r.people.map(p=>[p.id,p]));
      let t=null;$('#incSearch').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{host.dataset.q=e.target.value.trim();renderInclusionPage()},350)};
      $('#incStatus').onchange=e=>{host.dataset.status=e.target.value;renderInclusionPage()};
      $('#incNeed').onchange=e=>{host.dataset.need=e.target.value;renderInclusionPage()};
      $('#incAdd').onclick=()=>openCandidatePicker();
      host.querySelectorAll('[data-inc-edit]').forEach(b=>b.onclick=()=>openEditor(people.get(b.dataset.incEdit)));
    }catch(e){host.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
  }
  function dialog(title,inner){
    $('.inc-dialog')?.remove();const prev=document.activeElement;
    const d=document.createElement('div');d.className='inc-dialog';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label',title);
    d.innerHTML='<div class="inc-dialog-card"><div class="ar-head"><h2>'+esc(title)+'</h2><button type="button" class="hx-plain ar-close" aria-label="Yopish">✕</button></div>'+inner+'</div>';
    document.body.append(d);const close=()=>{d.remove();prev?.focus?.()};
    d.querySelector('.ar-close').onclick=close;d.addEventListener('keydown',e=>{if(e.key==='Escape')close()});d.addEventListener('click',e=>{if(e.target===d)close()});
    d.querySelector('input,select,textarea,button:not(.ar-close)')?.focus();return {el:d,close};
  }
  function openCandidatePicker(){
    const {el}=dialog('Talabani belgilash','<label>Talabani qidiring<input type="search" id="incCand" placeholder="F.I.Sh. yoki login (kamida 2 harf)"></label><div id="incCandList" class="inc-cands" aria-live="polite"></div>');
    let t=null;el.querySelector('#incCand').oninput=e=>{clearTimeout(t);t=setTimeout(async()=>{try{const r=await api('/inclusion/candidates?q='+encodeURIComponent(e.target.value.trim()));el.querySelector('#incCandList').innerHTML=r.people.map((p,i)=>'<button type="button" class="hx-plain inc-cand" data-i="'+i+'"><b>'+esc(p.fullName)+'</b><small>'+esc(p.login)+' · '+esc(p.group||'—')+'</small></button>').join('')||'<p class="muted">Topilmadi</p>';el.querySelectorAll('.inc-cand').forEach(b=>b.onclick=()=>openEditor(r.people[Number(b.dataset.i)]))}catch(err){toast(err.message)}},300)};
  }
  function openEditor(p){
    if(!p)return;const pr=p.profile;
    const {el,close}=dialog(p.fullName,'<form class="inc-form"><p class="small">'+esc(p.login)+' · '+esc(p.group||'—')+'</p>'+userFieldsHtml(pr,{withStatus:true})+'<button class="primary" type="submit">Saqlash</button></form>');
    bindUserFields(el);
    el.querySelector('form').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries([...new FormData(e.target).keys()].map(k=>[k,new FormData(e.target).getAll(k)]));const inc=readUserFields(d,{flat:false});try{await api('/inclusion/people/'+encodeURIComponent(p.id),{method:'PUT',body:JSON.stringify(inc)});toast('Saqlandi');close();renderInclusionPage()}catch(err){toast(err.message)}};
  }

  // ---------- enrolment fields for the user create/edit form ----------
  function userFieldsHtml(profile={},{withStatus=false}={}){
    const p={status:'none',notes:'',...(profile||{})};p.needs=Array.isArray(p.needs)?p.needs:[];
    return '<fieldset class="inc-fields"><legend>♿ Inklyuziv ta’lim (imkoniyati cheklangan talaba)</legend>'+
      '<div class="inc-needs">'+Object.entries(NEEDS).map(([k,v])=>'<label class="a11y-switch"><input type="checkbox" name="inc_needs" value="'+k+'" '+(p.needs.includes(k)?'checked':'')+'><span>'+v.icon+' '+escH(v.label)+'</span></label>').join('')+'</div>'+
      (withStatus?'<label>Holat<select name="inc_status">'+Object.entries(STATUSES).map(([k,v])=>'<option value="'+k+'" '+(p.status===k?'selected':'')+'>'+escH(v)+'</option>').join('')+'</select></label>':'')+
      '<label>Imtihonda qo‘shimcha vaqt, %<input name="inc_extra" type="number" min="0" max="100" step="5" value="'+(p.requestedExtraPct??p.extraTimePct??'')+'" placeholder="Avtomatik"></label>'+
      '<label>Xodimlar uchun izoh (tashxis yozmang)<input name="inc_notes" maxlength="500" value="'+escH(p.notes||'')+'" placeholder="Masalan: hujjat №…, 2-guruh nogironligi, IPR asosida"></label>'+
      '<label class="a11y-switch"><input type="checkbox" name="inc_consent" '+(p.consentAt?'checked disabled':'')+'><span>Talabadan (vasiysidan) yozma rozilik olindi</span></label></fieldset>';
  }
  function bindUserFields(root){
    const extra=root.querySelector('[name="inc_extra"]');if(!extra)return;
    root.querySelectorAll('[name="inc_needs"]').forEach(c=>c.addEventListener('change',()=>{if(extra.dataset.touched)return;extra.value=suggestedExtraPct([...root.querySelectorAll('[name="inc_needs"]:checked')].map(x=>x.value))}));
    extra.addEventListener('input',()=>{extra.dataset.touched='1'});
  }
  // Moves inc_* form fields into {inclusion:{…}} for POST/PATCH /api/users (or returns the profile itself).
  function readUserFields(d,{flat=true,had=false}={}){
    const one=v=>Array.isArray(v)?v[0]:v;
    const needs=[].concat(d.inc_needs||[]).filter(Boolean);
    const inc={needs,consent:one(d.inc_consent)==='on'};
    if(one(d.inc_extra)!==undefined&&one(d.inc_extra)!=='')inc.extraTimePct=Number(one(d.inc_extra));
    if(one(d.inc_notes)!==undefined)inc.notes=one(d.inc_notes);
    if(one(d.inc_status))inc.status=one(d.inc_status);
    if(!flat)return inc;
    for(const k of ['inc_needs','inc_extra','inc_notes','inc_consent','inc_status'])delete d[k];
    if(needs.length||inc.notes)d.inclusion=inc;else if(had)d.inclusion={needs:[]};
    return d;
  }

  function listen({title,url,text}){openAudioReader({title,url,text,speech:speechApi,announce:t=>announce(t,{speakIt:prefs.voiceAssistant}),esc})}

  return {afterLogin,renderAccessibilityPage,renderInclusionPage,userFieldsHtml,bindUserFields,readUserFields,listen,announce,speak,prefs:getPrefs};
}
