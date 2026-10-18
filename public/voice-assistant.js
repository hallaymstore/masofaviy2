// One microphone controller and one command dispatcher for voice, keyboard and widget input.
import {matchCommand,helpLines,PAGES,hasWakeWord,normalize,spokenToLogin} from './voice-commands.js';
import {createRecognition} from './voice-recognition.js';
import {actions,fields,findControl,indexedActions,controlLabel,controlScope,isVisible,writeField,isSensitiveAction} from './voice-controls.js';
import * as speechEngine from './speech.js';
import {reader,openAudioReader} from './audio-reader.js';
import {createVoiceContext,contextActionLabel} from './voice-context.js';
import {isNegated,parseContextCommand} from './voice-context-rules.js';
import {createVoiceKnowledge} from './voice-knowledge.js';
import {speakingChanged} from './native-bridge.js';
import {parseFind} from './voice-knowledge-rules.js';

const $=s=>document.querySelector(s);
const STATES={idle:'Tayyor',starting:'Mikrofon ulanmoqda…',listening:'Tinglayapman — buyruq ayting',waiting:'Javob o‘qilmoqda…',paused:'Mikrofon to‘xtatilgan',blocked:'Mikrofonni tekshiring',unsupported:'Yozma buyruqdan foydalaning',retrying:'Qayta ulanmoqda…'};

export function createVoiceAssistant({go,currentUser=()=>null,logout,a11y,myBooks,api:request,enterLive,openSearchHit,speech=speechEngine,recognitionFactory}={}){
  const prefs=()=>window.HxA11y?.get?.()||{};
  const enabled=()=>prefs().voiceAssistant===true;
  const handsFree=()=>prefs().voiceHandsFree!==false;
  const update=patch=>a11y?.updatePrefs?a11y.updatePrefs(patch,{preset:true}):window.HxA11y?.set?.({...prefs(),...patch});
  let dock,expanded=false,state='idle',error='',busy=false,oneShot=false,stoppedForLogout=false,speaking=0,externalSpeech=false,externalTimer;
  let pending=null,focused=null,actionList=[],fieldList=[],lastInput='',lastAt=0,voiceNavigation=false,restoring=false,trail=[],trailIndex=-1;
  let wasEnabled=false,lastHandsFree=handsFree(),navSerial=0;
  const notifications=[];
  const context=createVoiceContext();
  // Questions (schedule, assignments, live lesson) and «find X anywhere and open it», with spoken multiple choice.
  const knowledge=createVoiceKnowledge({api:request,go:async page=>{voiceNavigation=true;try{await go(page)}finally{voiceNavigation=false}},say:text=>say(text),
    step:text=>{const el=dock?.querySelector('#vaHeard');if(el)el.textContent='➜ '+text},enterLive,openSearchHit:async hit=>{voiceNavigation=true;try{await openSearchHit?.(hit)}finally{voiceNavigation=false}},myBooks,currentUser,
    playReader:()=>{const until=Date.now()+15000;const tick=()=>{const r=reader.current;if(r?.isOpen?.()&&isVisible($('[data-ar="play"]'))){if(!r.isPlaying?.())void r.play();return}if(Date.now()<until)setTimeout(tick,120)};setTimeout(tick,150)}});
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const recognition=createRecognition({factory:recognitionFactory||(SR?()=>new SR():undefined),
    canListen:()=>enabled()&&!stoppedForLogout&&document.visibilityState==='visible',
    onState:value=>{state=value;render()},
    onError:message=>{error=message;render();a11y?.announce?.(message)},
    onResult:alternatives=>{void receive(alternatives)}
  });

  function render(){
    if(!dock)return;
    dock.dataset.state=state;dock.dataset.enabled=String(enabled());
    dock.querySelector('#vaPanel').hidden=!expanded;
    const toggle=dock.querySelector('#vaToggle');toggle.setAttribute('aria-expanded',String(expanded));
    toggle.querySelector('b').textContent=enabled()?'Ovozli yordamchi':'Ovozli boshqaruv';
    dock.querySelector('#vaStatus').textContent=error||(!enabled()?'Yordamchini yoqing yoki buyruqni yozing.':STATES[state]||STATES.idle);
    dock.querySelector('#vaStart').textContent=recognition.isWanted()?'Mikrofonni to‘xtatish':'Mikrofonni boshlash';
    dock.querySelector('#vaStart').setAttribute('aria-pressed',String(recognition.isWanted()));
    dock.querySelector('#vaDisable').hidden=!enabled();
    dock.querySelector('#vaHands').checked=handsFree();
  }
  function syncMic(){
    const wanted=enabled()&&!stoppedForLogout&&(handsFree()||oneShot);
    if(!wanted){if(recognition.isWanted())recognition.stop();render();return}
    recognition.suspend(document.visibilityState!=='visible'||speaking>0||externalSpeech);
    // A permission/network error requires an explicit retry, never a render-driven loop.
  }
  function startMic(){
    stoppedForLogout=false;error='';
    if(!enabled())update({voiceAssistant:true});
    oneShot=!handsFree();syncMic();recognition.start();render();
  }
  function pauseMic(){oneShot=false;recognition.stop();update({voiceHandsFree:false});render()}
  // Short answers by default: hint sentences («… deng») are dropped unless the user turned on detailed answers.
  function brief(text){
    if(prefs().voiceVerbose===true)return text;
    const parts=String(text).match(/[^.!?]+[.!?]*/g)||[text];
    const kept=parts.filter(p=>!/(\bdeng\b|deyishingiz|aytishingiz mumkin|deb so‘rang|tugmasini bosing\.?$)/.test(p));
    return (kept.length?kept:parts.slice(0,1)).join('').trim();
  }
  async function say(text){
    if(!text)return;text=brief(text);
    speaking++;syncMic();speakingChanged(true);
    a11y?.announce?.(text);
    try{await new Promise(resolve=>{
      let done=false;const finish=()=>{if(!done){done=true;clearTimeout(timer);resolve()}};
      const timer=setTimeout(finish,45000);
      try{const result=speech.speak(text,{owner:'assistant',lang:'uz',rate:Number(prefs().ttsRate)||1,onend:finish,oncancel:finish,onerror:e=>{error=e?.message||'Ovoz ijro etilmadi.';render();finish()}});if(result===false)finish()}catch{finish()}
    })}finally{speaking--;if(!speaking)speakingChanged(false);syncMic()}
  }
  function mount(){
    dock=document.createElement('aside');dock.id='vaDock';dock.className='va-widget';dock.setAttribute('aria-label','O‘zbekcha ovozli yordamchi');
    dock.innerHTML='<button id="vaToggle" type="button" class="va-toggle hx-plain" aria-expanded="false" aria-controls="vaPanel"><span aria-hidden="true">🎙</span><b>Ovozli boshqaruv</b><span class="va-light" aria-hidden="true"></span></button>'+
      '<section id="vaPanel" class="va-panel" hidden><div class="va-title"><h2>O‘zbekcha yordamchi</h2><button id="vaMin" type="button" aria-label="Yordamchi panelini yig‘ish">−</button></div>'+
      '<p id="vaStatus" role="status" aria-live="polite" aria-atomic="true"></p><p id="vaHeard" class="va-heard"></p>'+
      '<div class="va-buttons"><button id="vaStart" type="button">Mikrofonni boshlash</button><button id="vaHelp" type="button">Buyruqlar</button><button id="vaDisable" type="button">Yordamchini o‘chirish</button></div>'+
      '<label class="va-hands"><input id="vaHands" type="checkbox"> Doimiy tinglash</label>'+
      '<form id="vaForm"><label for="vaCommand">Buyruqni yozish</label><div class="va-entry"><input id="vaCommand" type="text" autocomplete="off" placeholder="Masalan: kutubxonani ochib ber"><button type="submit">Bajarish</button></div></form>'+
      '<p class="va-hint">«Sahifalar», «Tugmalarni ayt», «Maydonlar», «Orqaga qayt». Kitob tinglayotganda: «Yordamchi, to‘xta». Alt+V — mikrofon. Birinchi marta brauzerda mikrofonga ruxsat bering.</p>'+
      '<ol id="vaChoices" aria-label="Sahifadagi amallar"></ol></section>';
    document.body.append(dock);
    dock.querySelector('#vaToggle').onclick=()=>{expanded=!expanded;render()};
    dock.querySelector('#vaMin').onclick=()=>{expanded=false;render();dock.querySelector('#vaToggle').focus()};
    dock.querySelector('#vaStart').onclick=()=>recognition.isWanted()?pauseMic():startMic();
    dock.querySelector('#vaDisable').onclick=()=>{speech.stop();pending=null;update({voiceAssistant:false});recognition.stop();render()};
    dock.querySelector('#vaHands').onchange=e=>{update({voiceHandsFree:e.target.checked});if(e.target.checked)startMic();else pauseMic()};
    dock.querySelector('#vaHelp').onclick=()=>{void receive(['yordam'],{typed:true})};
    dock.querySelector('#vaForm').onsubmit=e=>{e.preventDefault();const input=dock.querySelector('#vaCommand'),text=input.value.trim();if(text){input.value='';void receive([text],{typed:true})}};
    render();
  }
  function allowedPages(){
    if(!currentUser())return [];
    return PAGES.filter(p=>['accessibility','profile'].includes(p.page)||[...document.querySelectorAll('nav [data-page="'+p.page+'"]')].some(b=>!b.hidden&&!b.classList.contains('hidden')&&!b.closest('[hidden],.hidden')));
  }
  const pageName=()=>$('#main>.page.active h1')?.textContent?.trim()||$('#main>.page.active h2')?.textContent?.trim()||(currentUser()?'Bosh sahifa':'Kirish');
  async function navigate(page){
    if(page==='accessibility'){a11y?.open?.();return say('Qulaylik sozlamalari ochildi. «Maydonlar» yoki «tugmalar» deng.')}
    if(!currentUser())return startLogin();
    if(!allowedPages().some(p=>p.page===page))return say('Bu bo‘lim sizning rolingizda mavjud emas. «Sahifalar» deng.');
    if(reader.current?.isOpen?.())reader.current.close();
    if($('.hxa-panel'))a11y?.close?.();
    if($('dialog[open]'))return say('Avval ochiq oynani «yop» buyrug‘i bilan yoping.');
    voiceNavigation=true;
    try{await go(page);await say(pageName()+' ochildi. «Tugmalarni ayt» yoki «sahifani o‘qi» deng.')}finally{voiceNavigation=false}
  }
  function remember(page){
    focused=null;pending=null;actionList=[];fieldList=[];context.reset();showChoices([]);
    if(restoring)return;
    if(trail[trailIndex]===page)return;
    trail=trail.slice(0,trailIndex+1);trail.push(page);trailIndex=trail.length-1;
  }
  async function travel(step){
    if($('dialog[open],.hxa-panel'))return close();
    const next=trailIndex+step;
    if(next<0||next>=trail.length)return say(step<0?'Oldingi sahifa yo‘q.':'Keyingi sahifa yo‘q.');
    const page=trail[next];
    if(!allowedPages().some(p=>p.page===page)&&!['editor','lesson','videoWatch'].includes(page))return say('Bu sahifa endi mavjud emas.');
    // Editors and lessons have their own back action; reloading them loses their context.
    if(['editor','lesson','videoWatch'].includes(page))return say('Bu oynaga sahifadagi ochish tugmasi orqali kiring.');
    restoring=true;trailIndex=next;
    try{return await navigate(page)}finally{restoring=false}
  }
  async function close(){
    if(reader.current?.isOpen?.()){reader.current.close();return say('Kitob yopildi.')}
    if($('.hxa-panel')){a11y?.close?.();return say('Qulaylik paneli yopildi.')}
    const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);
    if(dialog){const button=actions(dialog).find(b=>/yop|bekor|orqaga/.test(normalize(controlLabel(b))));if(button){button.click();return say('Oyna yopildi.')}return say('Bu tekshiruv oynasini yakunlash uchun uning ko‘rsatmalariga amal qiling.')}
    const button=actions().find(b=>/^(orqaga|bekor qilish|yopish|bekor)$/.test(normalize(controlLabel(b))));
    if(button){button.click();return say('Oldingi oynaga qaytildi.')}
    if(document.documentElement.dataset.page==='editor'){$('#editorCancel')?.click();return}
    return travel(-1);
  }
  function showChoices(list){
    dock.querySelector('#vaChoices').replaceChildren(...list.map((element,i)=>{const item=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=(i+1)+'. '+contextActionLabel(element);b.onclick=()=>{void activate(element)};item.append(b);return item}));
  }
  async function listControls(kind){
    const list=kind==='fields'?fields():actions();
    if(kind==='fields')fieldList=list;else actionList=list;
    showChoices(kind==='fields'?[]:list);
    if(!list.length)return say(kind==='fields'?'Bu oynada to‘ldiriladigan maydon yo‘q.':'Bu oynada faol tugma yo‘q.');
    const labels=list.map((element,i)=>(i+1)+'. '+(kind==='fields'?controlLabel(element):contextActionLabel(element)));
    await say((kind==='fields'?'Maydonlar. ':'Tugmalar. ')+labels.slice(0,18).join('. ')+(list.length>18?'. Qolganlari yordamchi panelidagi ro‘yxatda.':''));
  }
  async function focusField(command){
    const list=fields(),found=command.index?{element:(fieldList.length?fieldList:list)[command.index-1]}:findControl(command.arg||'',list);
    if(!found?.element||!list.includes(found.element))return say('Maydon topilmadi. «Maydonlarni ayt» deng.');
    if(found.ambiguous)return say('Bir nechta o‘xshash maydon bor. «Maydonlar» deb, keyin tartib raqamini ayting.');
    focused=found.element;focused.focus();focused.scrollIntoView({block:'nearest'});
    const options=focused.tagName==='SELECT'?'. Variantlar: '+[...focused.options].filter(o=>!o.disabled).slice(0,15).map((o,i)=>(i+1)+'. '+o.textContent).join('. '):'';
    await say(controlLabel(focused)+' tanlandi'+options+'. «Yoz» deb, keyin matn yoki variantni ayting.');
  }
  async function confirm(question,callback){
    pending={callback,until:Date.now()+25000,scope:controlScope()};
    await say(question+' Tasdiqlash uchun «ha», bekor qilish uchun «yo‘q» deng.');
  }
  async function activate(element,{label=contextActionLabel(element||document.body)}={}){
    if(!element||!actions().includes(element))return say('Bu tugma hozir faol emas. «Tugmalar» deng.');
    if(element.matches('a[href]')){
      const url=new URL(element.href,location.href);
      if(url.origin!==location.origin||element.target==='_blank')return say('Bu havola yangi oynani ochadi. Uni klaviaturada Enter bilan oching.');
    }
    const execute=()=>{if(!actions().includes(element))return say('Tugma o‘zgardi. «Tugmalar» deng.');element.click()};
    if(isSensitiveAction(element))return confirm((label===controlLabel(element)?label:label+' — '+controlLabel(element))+' amalini bajaraymi?',execute);
    element.focus();element.click();
    await say(label+' tanlandi.');
  }
  function contextChoices(result,intent){
    context.rememberChoices(result,intent);
    dock.querySelector('#vaChoices').replaceChildren(...result.candidates.map((record,i)=>{const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=(i+1)+'. '+[record.title,record.path].filter(Boolean).join(' — ');button.onclick=()=>{void receive([String(i+1)],{typed:true})};item.append(button);return item}));
  }
  async function executeContext(result,intent){
    if(result.status==='unanswered')return false;
    if(result.status==='missingReference'){await say('Avval kerakli fan yoki mavzuni tanlang. «Mavzularni sanab ber» deyishingiz mumkin.');return true}
    if(result.status==='missing'){await say('Hozirgi sahifada bu mazmunga mos amal topilmadi. «Mavzularni sanab ber» yoki «tugmalarni ayt» deng.');return true}
    if(result.status==='list'||result.status==='ambiguous'){
      if(!result.candidates.length){await say('Hozirgi oynada bunday material ko‘rsatilmagan.');return true}
      contextChoices(result,intent);
      const prefix=result.status==='ambiguous'?'Bir nechta mos variant bor. Qaysi birini ochay? ':'Mavjud variantlar. ';
      await say(prefix+result.candidates.slice(0,8).map((r,i)=>(i+1)+'. '+[r.title,r.course||r.path].filter(Boolean).join(', ')).join('. ')+'. Raqamini yoki fan va mavzu nomini ayting.');return true;
    }
    const target=result.target,fresh=context.snapshot().records.find(r=>r.id===target.id);
    if(!fresh||!context.reveal(fresh)){context.clearChoices();await say('Sahifa o‘zgardi. Kerakli mavzu yoki amalni qayta ayting.');return true}
    if(fresh.blocked&&['open','edit','delete'].includes(intent.operation)){await say(fresh.title+'. '+fresh.reason);return true}
    if(intent.operation==='describe'){context.select(fresh);await say([fresh.title,fresh.path,fresh.text].filter(Boolean).join('. ').slice(0,1800));return true}
    if(intent.operation==='read'){
      context.select(fresh);openAudioReader({title:fresh.title,text:fresh.text,announce:a11y?.announce});playPreparedReader();return true;
    }
    let element=fresh.element;
    if(intent.operation==='delete'||intent.operation==='edit'){
      const pattern=intent.operation==='delete'?/ochir|arxiv/:/tahrir|ozgartir/;
      element=[...fresh.container.querySelectorAll('button,a[href]')].find(b=>isVisible(b)&&!b.disabled&&pattern.test(normalize(controlLabel(b))));
      if(!element){await say('Bu material uchun so‘ralgan amal hozir mavjud emas.');return true}
    }
    if(element?.tagName==='SUMMARY'){
      const details=element.parentElement;if(details.tagName==='DETAILS'){details.open=true;context.select(fresh);await say(fresh.title+' mavzusi ochildi. Ichidagi material yoki test nomini ayting.');return true}
    }
    if(!element){fresh.container.setAttribute('tabindex','-1');fresh.container.focus();context.select(fresh);await say(fresh.title+' tanlandi. Endi uning mavzu yoki materialini ayting.');return true}
    const previous=reader.current;
    await activate(element,{label:fresh.title});context.select(fresh);
    if(fresh.kind==='book'&&/tingla|oqi|oqib/.test(intent.text)){if(isVisible($('#libraryListen')))$('#libraryListen').click();playNextReader(previous)}
    return true;
  }
  async function runContext(intent){
    if(intent.operation==='overview'){
      const {records}=context.snapshot(),items=records.filter(r=>r.kind!=='action');
      const list=items.length?items:records;
      await say(pageName()+'. '+list.slice(0,12).map((r,i)=>(i+1)+'. '+r.title+(r.blocked?' — hozir yopiq':'')).join('. ')+'. Nomini, mavzu raqamini yoki «tugmalarni ayt» deng.');return true;
    }
    if(intent.relative&&controlScope().id==='videoWatch'&&['topic','video'].includes(intent.kind)){voiceNavigation=true;try{await go('videos')}finally{voiceNavigation=false}}
    return executeContext(context.resolve(intent),intent);
  }
  function playPreparedReader(){
    const opened=reader.current,until=Date.now()+15000;
    const play=()=>{if(reader.current!==opened||!opened?.isOpen?.())return;if(isVisible($('[data-ar="play"]')))void opened.play();else if(Date.now()<until)setTimeout(play,100)};
    play();
  }
  function playNextReader(previous){
    const until=Date.now()+15000;
    const check=()=>{if(reader.current&&reader.current!==previous&&reader.current.isOpen())playPreparedReader();else if(Date.now()<until)setTimeout(check,100)};
    check();
  }
  async function readPage(){
    const root=controlScope(),copy=root.cloneNode(true);
    copy.querySelectorAll('script,style,svg,[hidden],.hidden,[aria-hidden="true"],select,.sr-only,#vaDock,input,textarea').forEach(x=>x.remove());
    const text=(copy.innerText||copy.textContent||'').replace(/\s+/g,' ').trim().slice(0,30000);
    if(!text)return say('Bu oynada o‘qiladigan matn yo‘q.');
    openAudioReader({title:pageName(),text,announce:a11y?.announce});
    playPreparedReader();
  }
  async function run(command){
    const r=reader.current?.isOpen?.()?reader.current:null;
    if(['yes','no'].includes(command.action)){
      const answer=$('dialog[data-va-confirm][open] [data-va-answer="'+command.action+'"]');
      if(answer){pending=null;answer.click();return}
      const confirmation=pending;pending=null;
      if(!confirmation||Date.now()>confirmation.until||confirmation.scope!==controlScope())return say('Tasdiqlash muddati tugagan yoki savol yo‘q. Amalni qayta ayting.');
      if(command.action==='no')return say('Bekor qilindi.');
      return confirmation.callback();
    }
    pending=null;
    switch(command.action){
      case 'stop':speech.stop();r?.pause();for(const v of controlScope().querySelectorAll('video,audio'))v.pause();return;
      case 'resume':{if(r)return r.play();const media=controlScope().querySelector('video,audio');if(media)return media.play().catch(()=>say('Tinglash uchun pleyer tugmasini bosing.'));return say('Davom ettiriladigan o‘qish yoki video yo‘q.')}
      case 'help':return say('O‘zbekcha buyruq ayting. '+helpLines().join('. ')+'. Kitob ovozini bo‘lish uchun «Yordamchi, to‘xta» deng.');
      case 'repeat':return say(speech.lastSpoken()||'Hali xabar yo‘q.');
      case 'go':return navigate(command.page);
      case 'login':return startLogin();
      case 'listPages':return say('Sizga ochiq sahifalar. '+allowedPages().map(p=>p.label).join('. ')+'. Nomini ayting.');
      case 'listActions':return listControls('actions');
      case 'listFields':return listControls('fields');
      case 'where':return say(pageName()+' sahifasidasiz.');
      case 'back':return travel(-1);
      case 'forward':return travel(1);
      case 'close':return close();
      case 'readPage':return readPage();
      case 'next':case 'prev':{if(r)return command.action==='next'?r.next():r.prev();const list=actions(),index=list.indexOf(document.activeElement),next=list[index+(command.action==='next'?1:-1)]||list[0];if(next){next.focus();await say(controlLabel(next))}return}
      case 'faster':case 'slower':{if(r)return command.action==='faster'?r.faster():r.slower();const rate=Math.max(.5,Math.min(2,Math.round(((Number(prefs().ttsRate)||1)+(command.action==='faster'?.1:-.1))*10)/10));update({ttsRate:rate});return say('O‘qish tezligi '+rate);}
      case 'maleVoice':case 'femaleVoice':speech.setGender(command.action==='maleVoice'?'male':'female');return say(command.action==='maleVoice'?'Sardor ovozi tanlandi.':'Madina ovozi tanlandi.');
      case 'focusField':return focusField(command);
      case 'dictate':case 'clear':{
        const field=focused&&fields().includes(focused)?focused:fields().includes(document.activeElement)?document.activeElement:null;
        const value=command.action==='clear'?'':field?.id==='loginInput'?spokenToLogin(command.arg):command.arg;
        return say(writeField(field,value).message);
      }
      case 'activate':{const found=findControl(command.arg,actions());if(found?.element&&!found.ambiguous)return activate(found.element);const intent=parseContextCommand(command.arg+' och');if(intent)return runContext(intent);return say('Bir nechta o‘xshash tugma bor. «Tugmalar» deb, keyin raqamini ayting.')}
      case 'selectIndex':{
        const current=command.kind?indexedActions(command.kind):actions();
        const list=!command.kind&&actionList.length?actionList:current;
        if(!current.includes(list[command.index-1]))return say('Bu raqamdagi amal topilmadi. Avval «tugmalar» deng.');
        const previous=reader.current;await activate(list[command.index-1]);if(command.kind==='kitob'){if(isVisible($('#libraryListen')))$('#libraryListen').click();playNextReader(previous)}return;
      }
      case 'submit':{
        const form=focused?.isConnected?focused.closest('form'):controlScope().querySelector('form');
        if(!form||!isVisible(form)||!controlScope().contains(form))return say('Yuboriladigan forma topilmadi. Avval kerakli maydonni tanlang.');
        const submit=[...form.querySelectorAll('button[type="submit"],input[type="submit"],button:not([type])')].find(b=>!b.disabled&&isVisible(b));
        if(!submit)return say('Yuborish tugmasi hozir faol emas.');
        return confirm('Formadagi ma’lumotlarni yuboraymi?',()=>{if(form.isConnected&&isVisible(form)&&!submit.disabled)form.requestSubmit(submit)});
      }
      case 'search':{
        if(!currentUser())return startLogin();await navigate('search');const field=$('#globalSearchInput');if(!field)return;
        field.value=command.arg;field.dispatchEvent(new Event('input',{bubbles:true}));$('#globalSearchForm')?.requestSubmit();return say(command.arg+' bo‘yicha qidiruv boshlandi.');
      }
      case 'listenBook':{
        if(r)return r.play();if(!currentUser())return startLogin();
        const button=$('#libraryListen');if(isVisible(button)){const previous=reader.current;button.click();playNextReader(previous);return}
        await navigate('myBooks');const first=myBooks?.firstListen?.();if(first){first.click();playPreparedReader();return}
        return say('Javoningizda kitob yo‘q. «Kitob qo‘shish» tugmasi yoki oilaviy yuklash havolasidan foydalaning.');
      }
      case 'joinLesson':{
        if(!currentUser())return startLogin();await navigate('live');
        const button=[...document.querySelectorAll('#live [data-live-join],#live [data-join-lesson]')].find(b=>isVisible(b)&&!b.disabled);
        return button?activate(button):say('Hozir kirish mumkin bo‘lgan jonli dars yo‘q.');
      }
      case 'logout':if(!currentUser())return say('Siz tizimga kirmagansiz.');return confirm('Tizimdan chiqaymi?',async()=>{logout?.();await say('Tizimdan chiqdingiz. Kirish uchun «ovozli kirish» tugmasini bosing.')});
      case 'pauseListening':pauseMic();return say('Mikrofon to‘xtatildi. Qayta boshlash uchun Alt+V yoki mikrofon tugmasini bosing.');
      case 'resumeListening':update({voiceHandsFree:true});startMic();return say('Doimiy tinglash yoqildi.');
      case 'scrollUp':case 'scrollDown':case 'top':case 'bottom':{
        const root=controlScope(),scrollable=[root,...root.querySelectorAll('*')].filter(e=>!e.closest('#vaDock')&&e.scrollHeight>e.clientHeight+20&&/auto|scroll/.test(getComputedStyle(e).overflowY)).at(-1)||document.scrollingElement;
        scrollable.scrollTo({top:command.action==='top'?0:command.action==='bottom'?scrollable.scrollHeight:scrollable.scrollTop+(command.action==='scrollDown'?1:-1)*Math.max(250,innerHeight*.65),behavior:'instant'});return;
      }
      case 'bigger':case 'smaller':{const sizes=[100,115,130,150,175,200],index=sizes.findIndex(x=>x>=(prefs().textScale||100));const value=sizes[Math.max(0,Math.min(sizes.length-1,index+(command.action==='bigger'?1:-1)))];update({textScale:value});return say('Matn '+value+' foiz.');}
      case 'contrast':update({contrast:prefs().contrast==='none'?'yellow':'none'});return say('Kontrast o‘zgartirildi.');
      case 'time':return say('Hozir '+new Date().toLocaleString('uz-UZ',{weekday:'long',hour:'2-digit',minute:'2-digit',day:'numeric',month:'long'}));
      case 'notifications':return say(notifications.length?notifications.slice(0,5).join('. '):'Yangi bildirishnoma yo‘q.');
      case 'focused':return say(controlLabel(focused||document.activeElement)||'Maydon tanlanmagan.');
    }
  }
  async function receive(alternatives,{typed=false}={}){
    if(!typed&&(!enabled()||stoppedForLogout||busy||speaking||externalSpeech))return;
    if(busy)return;
    const text=String(alternatives[0]||'').trim();if(!text)return;
    // While a book is audible, only an explicit wake word (or a bare stop) is a command.
    if(!typed&&reader.current?.isPlaying?.()&&!hasWakeWord(text)&&!['toxta','toxtat','stop'].includes(normalize(text)))return;
    const now=Date.now();if(!typed&&text===lastInput&&now-lastAt<1300)return;lastInput=text;lastAt=now;
    dock.querySelector('#vaHeard').textContent='Eshitildi: '+text.slice(0,200);error='';
    let command=null;for(const alternative of alternatives){command=matchCommand(alternative);if(command)break}
    busy=true;
    try{
      if(knowledge.hasPending()&&await knowledge.answer(text))return;
      if(isNegated(text)){context.clearChoices();pending=null;await say('Amal bajarilmadi.');return}
      if(currentUser()&&!pending&&!context.hasChoices()&&await knowledge.handleQuestion(text))return;
      const intent=parseContextCommand(text);
      const answer=context.hasChoices()&&(!intent?.explicit||intent.kind==='any')?context.answer(text):null;
      if(answer?.status==='stale'){await say('Variantlar ro‘yxati o‘zgardi. Mavzu yoki material nomini qayta ayting.');return}
      if(answer&&['matched','blocked'].includes(answer.status)&&!['yes','no'].includes(command?.action)){await executeContext(answer,answer.intent);return}
      if(answer?.status==='ambiguous'&&!command){await executeContext(answer,answer.intent);return}
      const protectedCommand=command&&['stop','resume','help','repeat','go','logout','yes','no','dictate','focusField','submit','clear','search','login','back','forward','close','pauseListening','resumeListening','readPage'].includes(command.action);
      if(intent&&!protectedCommand){const result=context.resolve(intent);
        // Not on this page: look for it across the platform (books, videos, courses…) and walk there.
        if(result.status==='missing'&&currentUser()&&parseFind(text)){pending=null;await knowledge.handleFind(text);return}
        if(result.status!=='missing'||intent.explicit){pending=null;await runContext(intent);return}}
      context.clearChoices();
      if(!command&&currentUser()&&await knowledge.handleFind(text))return;
      if(!command){pending=null;await say('Buyruqni aniqlay olmadim. «Yordam», «sahifalar» yoki «tugmalar» deng.');return}
      await run(command);
    }catch(e){await say('Amal bajarilmadi. '+(e?.message||'Qayta urinib ko‘ring.'))}
    finally{busy=false;if(oneShot&&!pending&&!context.hasChoices()&&!knowledge.hasPending()&&!$('dialog[data-va-confirm][open]')){oneShot=false;recognition.stop()}render()}
  }
  async function startLogin(){
    expanded=true;stoppedForLogout=false;if(!enabled())update({voiceAssistant:true});render();
    if(currentUser())return say('Siz tizimga kirgansiz. «Sahifalar» deng.');
    const input=$('#loginInput');focused=input;input?.focus();
    startMic();await say('Login maydoni tanlandi. «Yoz» deb loginingizni harflab ayting. Parolni klaviaturada kiriting. So‘ng «yubor» deng.');
  }
  function preferenceChanged(){
    const on=enabled(),hands=handsFree(),newlyEnabled=on&&!wasEnabled,changedHands=hands!==lastHandsFree;
    wasEnabled=on;lastHandsFree=hands;
    if(!on){pending=null;oneShot=false;recognition.stop();speech.stop()}
    if(newlyEnabled){stoppedForLogout=false;expanded=true;render();void say('Ovozli yordamchi yoqildi. «Kutubxona», «jadvalim», «tugmalar» yoki «yordam» deng.').then(()=>{if(enabled()&&handsFree()&&!stoppedForLogout)startMic()})}
    else if(changedHands){if(hands&&on)startMic();else{oneShot=false;recognition.stop()}}
    syncMic();render();
  }
  async function afterLogin(){
    context.reset({forget:true});
    stoppedForLogout=false;trail=[$('#main>.page.active')?.id||'dashboard'];trailIndex=0;
    wasEnabled=enabled();lastHandsFree=handsFree();expanded=enabled();render();
    if(enabled()){await say('Xush kelibsiz, '+(currentUser()?.fullName||'')+'. Ovozli boshqaruv tayyor. «Sahifalar» yoki «yordam» deng.');if(handsFree()&&enabled())startMic()}
  }
  function afterLogout(){context.reset({forget:true});document.dispatchEvent(new Event('hx:voice-logout'));stoppedForLogout=true;oneShot=false;pending=null;focused=null;actionList=[];fieldList=[];notifications.length=0;trail=[];trailIndex=-1;recognition.stop();showChoices([]);dock.querySelector('#vaHeard').textContent='';render()}

  mount();
  // A native modal makes body siblings inert. Keep the widget inside the active modal.
  const portal=()=>{const parent=[...document.querySelectorAll('dialog[open],.hxa-panel')].filter(isVisible).at(-1)||document.body;if(dock.parentNode!==parent)parent.append(dock)};
  new MutationObserver(portal).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('hx:navigate',event=>{
    remember(event.detail.page);const serial=++navSerial;
    if(enabled()&&!voiceNavigation&&!restoring)Promise.resolve(event.detail.ready).then(()=>{if(serial===navSerial&&enabled()&&!busy)void say(pageName()+' ochildi.')},()=>{});
  });
  document.addEventListener('visibilitychange',syncMic);
  document.addEventListener('hx:confirmation',event=>{if(enabled())void say(event.detail.message+' «Ha» yoki «yo‘q» deng.')});
  document.addEventListener('keydown',e=>{if(e.altKey&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyV'){e.preventDefault();expanded=true;startMic()}});
  document.addEventListener('hx-speech-start',event=>{
    if(event.detail?.owner==='assistant'||event.detail?.owner==='reader'){clearTimeout(externalTimer);externalSpeech=false;syncMic();return}
    externalSpeech=true;syncMic();clearTimeout(externalTimer);
    const check=()=>{if(speech.isSpeaking())externalTimer=setTimeout(check,200);else{externalSpeech=false;syncMic()}};externalTimer=setTimeout(check,200);
  });
  const toast=$('#toast');if(toast)new MutationObserver(()=>{
    const text=toast.textContent.trim();if(!text||!toast.classList.contains('show')||notifications[0]===text)return;
    notifications.unshift(text);notifications.length=Math.min(20,notifications.length);
    if(enabled()&&!busy&&!speech.isSpeaking()&&!reader.current?.isPlaying?.())void say(text);
  }).observe(toast,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
  const loginForm=$('#loginForm');if(loginForm&&!$('#voiceLoginBtn')){const button=document.createElement('button');button.id='voiceLoginBtn';button.type='button';button.className='secondary voice-login-btn';button.textContent='Ovozli yordamchi bilan kirish';button.onclick=()=>{void startLogin()};loginForm.querySelector('.login-submit')?.after(button)}
  const loginError=$('#loginError');if(loginError)new MutationObserver(()=>{if(enabled()&&loginError.textContent.trim())void say(loginError.textContent.trim())}).observe(loginError,{childList:true,subtree:true,characterData:true});
  window.HxA11y?.onChange?.(preferenceChanged);
  if(new URLSearchParams(location.search).get('voice')==='1'&&!enabled())update({voiceAssistant:true});
  else{wasEnabled=enabled();if(enabled()){expanded=true;render()}}
  const api={afterLogin,afterLogout,commandOnce:startMic,startLogin,setHandsFree:on=>{update({voiceHandsFree:Boolean(on)});if(on)startMic();else pauseMic()},say,enabled,execute:text=>receive([text],{typed:true})};
  window.HxVoiceAssistant=api;
  return api;
}
