// HALLAYM EDU — voice assistant for blind and motor-impaired students. It speaks Uzbek through the platform speech engine
// (server Madina/Sardor voices after login), understands Uzbek (Latin/Cyrillic) and Russian commands, guides the login by
// voice (the password is typed, never dictated by default), reads pages and books and announces every notification.
// Turned on by the «Ovozli yordamchi» switch / «Ko‘rmaydigan» preset in the accessibility panel, or the ?voice=1 app shortcut.
import {matchCommand,helpLines,spokenToLogin,spokenToDigits,spellOut,normalize} from './voice-commands.js';
import {speak as engineSpeak,stop as engineStop,isSpeaking,lastSpoken} from './speech.js';
import {reader} from './audio-reader.js';

const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const DEVICE='hx-voice-device',HANDS='hx-va-handsfree';
const ls=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{}};
const SR=typeof window!=='undefined'?(window.SpeechRecognition||window.webkitSpeechRecognition):null;

export function createVoiceAssistant({go,currentUser,logout,a11y,myBooks}){
  const prefs=()=>window.HxA11y?.get?.()||{};
  const enabled=()=>Boolean(prefs().voiceAssistant)||ls(DEVICE)==='1';
  const rate=()=>Number(prefs().ttsRate)||1;
  const say=text=>new Promise(res=>{if(!engineSpeak(text,{lang:'uz',rate:rate(),onend:res,oncancel:res,onerror:e=>{a11y?.announce?.(e.message);res()}}))res()});
  const history=[];let pendingConfirm=null,loginActive=false,handsFree=false,recognizing=null,pageQueue=null;

  // ---------- earcons ----------
  let actx=null;
  function beep(freq=880,ms=110){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=freq;g.gain.value=0.08;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+ms/1000)}catch{}}

  // ---------- dock ----------
  function setDock(state){const d=$('#vaDock');if(!d)return;d.dataset.state=state;const b=$('#vaBtn');if(b){b.setAttribute('aria-pressed',String(state==='listening'));b.querySelector('b').textContent=state==='listening'?'Tinglayapman…':'Ovozli buyruq'}}
  function mountDock(){
    if(!$('#vaDock')){
      const d=document.createElement('div');d.id='vaDock';d.className='va-dock';d.dataset.state='idle';
      d.innerHTML='<button id="vaBtn" type="button" class="hx-plain" aria-pressed="false" aria-describedby="vaHint"><span aria-hidden="true">🎙</span><b>Ovozli buyruq</b></button><span id="vaHint" class="sr-only">Alt+V — buyruq aytish. «Yordam» deng — buyruqlar ro‘yxati.</span>';
      document.body.append(d);$('#vaBtn').onclick=()=>commandOnce();
    }
    $('#vaDock').hidden=!enabled();
  }

  // ---------- listening ----------
  function listenOnce({timeoutMs=9000}={}){
    return new Promise((resolve,reject)=>{
      if(!SR)return reject(new Error('Bu brauzer ovozli buyruqni qo‘llamaydi. Chrome, Edge yoki Samsung Internet ishlating.'));
      try{recognizing?.abort()}catch{}
      const r=new SR();recognizing=r;r.lang=ls('hx-va-lang')||'uz-UZ';r.interimResults=false;r.maxAlternatives=4;
      let done=false;const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(t);setDock('idle');fn(v)};
      const t=setTimeout(()=>{try{r.stop()}catch{}},timeoutMs);
      r.onresult=e=>finish(resolve,[...(e.results?.[0]||[])].map(a=>a.transcript).filter(Boolean));
      r.onerror=e=>finish(reject,new Error(e.error==='not-allowed'||e.error==='service-not-allowed'?'Mikrofonga ruxsat berilmagan. Brauzer sozlamalarida mikrofonni yoqing.':e.error==='no-speech'?'Ovoz eshitilmadi.':e.error==='network'?'Ovozni aniqlash uchun internet kerak.':'Ovozni aniqlab bo‘lmadi ('+e.error+')'));
      r.onend=()=>finish(resolve,[]);
      try{r.start();setDock('listening');beep(880)}catch(e){finish(reject,e)}
    });
  }
  const ask=async(q,o)=>{await say(q);return listenOnce(o)};

  // ---------- reading the page ----------
  function readPage(){
    const page=$('#main>.page.active')||$('#login:not(.hidden)')||document.body;
    const c=page.cloneNode(true);c.querySelectorAll('script,style,svg,[hidden],.hidden,[aria-hidden="true"],select,.sr-only').forEach(x=>x.remove());
    const text=(c.innerText||c.textContent||'').replace(/\n{2,}/g,'. ').replace(/\s+/g,' ').trim().slice(0,6000);
    if(!text)return say('Bu sahifada o‘qiladigan matn yo‘q.');
    pageQueue={text};return say(text);
  }

  // ---------- commands ----------
  const MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'],DAYS=['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];
  async function run(cmd){
    const r=reader.current?.isOpen?.()?reader.current:null;
    if(pendingConfirm&&(cmd.action==='yes'||cmd.action==='no')){const f=pendingConfirm;pendingConfirm=null;return f(cmd.action==='yes')}
    switch(cmd.action){
      case 'stop':engineStop();r?.pause();return;
      case 'resume':if(r)return r.play();if(pageQueue)return say(pageQueue.text);return say('Davom ettiradigan narsa yo‘q.');
      case 'help':return say('Quyidagilarni aytishingiz mumkin. '+helpLines().join('. ')+'.');
      case 'repeat':return say(lastSpoken()||'Hali hech narsa aytilmadi.');
      case 'readPage':return readPage();
      case 'next':return r?r.next():undefined;
      case 'prev':return r?r.prev():undefined;
      case 'faster':return r?r.faster():say('Tezlikni qulaylik panelidan o‘zgartiring.');
      case 'slower':return r?r.slower():say('Tezlikni qulaylik panelidan o‘zgartiring.');
      case 'bigger':case 'smaller':{const p=prefs(),sizes=[100,115,130,150,175,200],i=Math.max(0,sizes.indexOf(p.textScale));const n=sizes[Math.max(0,Math.min(sizes.length-1,i+(cmd.action==='bigger'?1:-1)))];window.HxA11y?.set({...p,textScale:n});return say('Matn '+n+' foiz')}
      case 'contrast':{const p=prefs();const c=p.contrast==='none'?'yellow':'none';window.HxA11y?.set({...p,contrast:c});return say(c==='none'?'Oddiy ranglar':'Yuqori kontrast yoqildi')}
      case 'time':{const d=new Date();return say('Soat '+d.getHours()+' dan '+d.getMinutes()+' daqiqa o‘tdi. Bugun '+DAYS[d.getDay()]+', '+d.getDate()+'-'+MONTHS[d.getMonth()]+'.')}
      case 'notifications':return say(history.length?'Oxirgi xabarlar. '+history.slice(0,5).join('. '):'Yangi bildirishnoma yo‘q.');
    }
    if(cmd.action==='go'&&cmd.page==='accessibility'){a11y?.open?.();return say('Qulaylik sozlamalari ochildi.')}
    if(!currentUser()){if(cmd.action==='go'||cmd.action==='joinLesson'||cmd.action==='listenBook')return startLogin();return}
    switch(cmd.action){
      case 'go':{const page=cmd.page==='accessibility'?'dashboard':cmd.page;const btn=$('nav button[data-page="'+page+'"]');if(!btn||btn.classList.contains('hidden'))return say('Bu bo‘lim sizda yo‘q.');await go(page);
        return say(($('.page.active h1')?.textContent||'')+' ochildi. '+($('.page.active .page-head p')?.textContent||'')+' Matnni eshitish uchun «o‘qi» deng.')}
      case 'search':{go('search');await new Promise(r=>setTimeout(r,400));const i=$('#globalSearchInput');if(i){i.value=cmd.arg;i.dispatchEvent(new Event('input',{bubbles:true}));$('#globalSearchForm')?.requestSubmit?.()}return say('«'+cmd.arg+'» bo‘yicha qidiryapman.')}
      case 'listenBook':{
        const lib=$('#libraryListen');if(lib&&lib.offsetParent)return lib.click();
        await go('myBooks');const first=myBooks?.firstListen?.();
        if(first){await say('Kitoblarim. Oxirgi kitobni davom ettiraman.');return first.click()}
        return say('Javoningizda kitob yo‘q. Oilangizga yuklash havolasini yuboring yoki kitob qo‘shing.');
      }
      case 'joinLesson':{go('live');await new Promise(r=>setTimeout(r,1200));const b=all('#live [data-live-join],#live [data-join-lesson],#dashboard [data-join-lesson]').find(x=>!x.disabled&&x.offsetParent);if(!b)return say('Hozir kirish mumkin bo‘lgan jonli dars yo‘q.');await say('Darsga kiryapman.');return b.click()}
      case 'logout':pendingConfirm=ok=>{if(ok){say('Tizimdan chiqdingiz.');logout?.()}else say('Bekor qilindi.')};await say('Tizimdan chiqishni tasdiqlaysizmi? Ha yoki yo‘q deng.');return commandOnce();
      case 'yes':case 'no':return say('Tasdiqlanadigan savol yo‘q.');
    }
  }
  async function commandOnce(){
    if(!SR)return say('Bu brauzer ovozli buyruqni qo‘llamaydi. Chrome yoki Edge ishlating. Sahifani o‘qish uchun Alt, Shift va R tugmalarini bosing.');
    try{
      reader.current?.pause();engineStop();const alts=await listenOnce();
      if(!alts.length){if(!handsFree)await say('Ovoz eshitilmadi.');return}
      if(loginActive)return;
      let cmd=null;for(const a of alts){cmd=matchCommand(a);if(cmd)break}
      if(!cmd){if(!currentUser()&&/kir|login|voyti/.test(normalize(alts[0])))return startLogin();return say('Tushunmadim: «'+alts[0]+'». Buyruqlar uchun «yordam» deng.')}
      beep(660,80);await run(cmd);
    }catch(e){await say(e.message)}
  }
  async function loop(){while(handsFree&&document.visibilityState==='visible'){if(isSpeaking()||loginActive||reader.current?.isPlaying?.()){await new Promise(r=>setTimeout(r,600));continue}await commandOnce();await new Promise(r=>setTimeout(r,250))}}
  function setHandsFree(on){handsFree=Boolean(on);ls(HANDS,on?'1':'0');if(on)say('Qo‘llarsiz rejim yoqildi. Men doim tinglayman.').then(loop)}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&handsFree)loop()});

  // ---------- voice-guided login ----------
  async function startLogin(){
    if(loginActive)return;loginActive=true;$('#vaGate')?.remove();
    const loginInput=$('#loginInput'),pass=$('#passwordInput');loginInput?.focus();
    try{
      await say('Ovozli kirish.');
      if(!SR){await say('Bu brauzerda ovozni aniqlash yo‘q. Login maydoni tanlandi: loginingizni yozing, Tab bosib parolni yozing va Enter bosing.');return}
      let login='';
      for(let tries=0;tries<3&&!login;tries++){
        let alts=[];try{alts=await ask(tries?'Qaytadan. Loginingizni harflab ayting.':'Loginingizni harflab ayting. Masalan: K, T, 21, tire, 0412. Yoki klaviaturada yozib, Enter bosing.')}catch(e){await say(e.message);break}
        if(loginInput.value.trim()){login=loginInput.value.trim();break}
        const guess=spokenToLogin(alts[0]||'');if(!guess)continue;
        let ans=[];try{ans=await ask('Login: '+spellOut(guess)+'. To‘g‘rimi? Ha yoki yo‘q deng.')}catch{}
        if(ans.map(matchCommand).find(Boolean)?.action==='yes'){login=guess;loginInput.value=guess}
      }
      if(!login){await say('Loginni klaviaturada yozing. Login maydoni tanlandi.');loginInput?.focus();return}
      pass?.focus();
      let ans=[];try{ans=await ask('Endi parolingizni klaviaturada yozing va Enter bosing. Xavfsizlik uchun parolni ovoz chiqarib aytmang. Yozolmasangiz, «ovoz bilan» deng.',{timeoutMs:12000})}catch{}
      if(ans.some(a=>/ovoz/.test(normalize(a)))&&!pass.value){
        let p=[];try{p=await ask('Parolni aniq ayting. Kirgandan keyin parolingizni profil bo‘limida almashtirib qo‘ying.',{timeoutMs:12000})}catch{}
        const v=String(p[0]||'').replace(/\s+/g,'');if(v){pass.value=v;await say('Kiryapman.');$('#loginForm')?.requestSubmit()}
      }else if(!pass.value)await say('Parol maydoni tanlangan. Yozib bo‘lgach Enter bosing.');
    }finally{loginActive=false}
  }
  function watchLogin(){
    const otp=$('#loginOtpWrap');if(otp)new MutationObserver(async()=>{if(otp.classList.contains('hidden')||!enabled())return;
      if(!SR)return say('Ikki bosqichli kodni yozing va Enter bosing.');
      try{const a=await ask('Ikki bosqichli tasdiqlash. Olti xonali kodni ayting.');const code=spokenToDigits(a[0]||''),inp=otp.querySelector('input');if(code.length>=6&&inp){inp.value=code;await say('Kiryapman.');$('#loginForm')?.requestSubmit()}else{await say('Kodni klaviaturada yozing.');inp?.focus()}}catch(e){await say(e.message)}
    }).observe(otp,{attributes:true,attributeFilter:['class']});
    const err=$('#loginError');if(err)new MutationObserver(()=>{const x=err.textContent.trim();if(x&&enabled())say(x)}).observe(err,{childList:true,characterData:true,subtree:true});
    const card=$('#loginForm');if(card&&!$('#voiceLoginBtn')){const b=document.createElement('button');b.type='button';b.id='voiceLoginBtn';b.className='secondary voice-login-btn';b.innerHTML='<span aria-hidden="true">🔊</span> Ovozli yordamchi bilan kirish';b.onclick=()=>{ls(DEVICE,'1');mountDock();startLogin()};card.querySelector('.login-submit')?.after(b)}
  }
  // Browsers speak only after a tap or key press: a device marked for voice use starts with a full-screen start button.
  function offerGate(){
    const wanted=new URLSearchParams(location.search).get('voice')==='1'||ls(DEVICE)==='1';
    if(!wanted||$('#vaGate'))return;
    const g=document.createElement('button');g.id='vaGate';g.type='button';g.className='va-gate hx-plain';
    g.innerHTML='<span aria-hidden="true">🔊</span><b>Ovozli yordamchini boshlash</b><small>Ekranning istalgan joyiga yoki istalgan tugmaga bosing</small>';
    document.body.append(g);g.focus();
    const start=()=>{g.remove();document.removeEventListener('keydown',key,true);ls(DEVICE,'1');mountDock();
      if($('#login:not(.hidden)'))startLogin();else say('Ovozli yordamchi tayyor. Buyruq uchun Alt va V ni yoki mikrofon tugmasini bosing. «Yordam» deng.').then(()=>{if(ls(HANDS)==='1')setHandsFree(true)})};
    const key=e=>{if(['Tab','Shift'].includes(e.key))return;e.preventDefault();start()};
    g.onclick=start;document.addEventListener('keydown',key,true);
  }

  // ---------- notifications are spoken ----------
  function watchToasts(){
    const t=$('#toast');if(!t||t.dataset.vaWatch)return;t.dataset.vaWatch='1';let last='';
    new MutationObserver(()=>{const x=t.textContent.trim();if(!x||x===last||!t.classList.contains('show'))return;last=x;history.unshift(x);history.length=Math.min(history.length,20);if(enabled()&&!loginActive&&!reader.current?.isPlaying?.())engineSpeak(x,{rate:rate()});setTimeout(()=>{last=''},1500)})
      .observe(t,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
  }

  document.addEventListener('keydown',e=>{if(e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyV'){e.preventDefault();if(!enabled()){ls(DEVICE,'1');mountDock()}commandOnce()}});
  window.HxA11y?.onChange?.(()=>mountDock());
  mountDock();watchLogin();watchToasts();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',offerGate,{once:true});else offerGate();

  async function afterLogin(){
    mountDock();
    if(!enabled())return;
    const u=currentUser();
    await say('Xush kelibsiz, '+(u?.fullName||'')+'. Buyruq uchun Alt va V ni bosing. Kitob tinglash uchun «kitobni o‘qi» deng.');
    if(ls(HANDS)==='1')setHandsFree(true);
  }
  return {afterLogin,commandOnce,startLogin,setHandsFree,say,enabled};
}
