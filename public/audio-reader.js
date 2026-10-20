import {speakChunk,stop as stopSpeech,engineLabel,refreshServer,gender,setGender,bookLang} from './speech.js';
import {chunkForSpeech} from './tts-rules.js';
import {splitSentences,pageTextFromItems,looksScanned} from './reader-rules.js';
import {openTextDocument} from './pdf-text.js';
export {splitSentences,pageTextFromItems,looksScanned};
export const reader={current:null};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

export function openAudioReader({title,url,text,start,onProgress,announce=()=>{},storageKey}={}){
  reader.current?.close();
  const previousFocus=document.activeElement,controller=new AbortController();
  const key='m2-ar:'+(storageKey||url||title||'text');
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
  const localAt=Number(saved.at)||0,serverAt=Date.parse(start?.at||'')||0;
  saved=localAt>serverAt?{...start,...saved}:{...saved,...start};
  let page=Math.max(0,saved.page|0),idx=Math.max(0,saved.idx|0),rate=Math.min(2,Math.max(0.5,Number(saved.rate)||Number(window.HxA11y?.get()?.ttsRate)||1));
  let lang=['uz','ru','en'].includes(saved.lang)?saved.lang:bookLang();
  let doc=null,chunks=[],playing=false,finished=Boolean(saved.finished),closed=false,loading=true,revision=0,ownStop=false;
  const stopOwnSpeech=()=>{ownStop=true;stopSpeech();ownStop=false};
  const dialog=document.createElement('dialog');dialog.className='ar-dialog';dialog.setAttribute('aria-labelledby','arTitle');
  dialog.innerHTML='<div class="ar-card"><div class="ar-head"><div><small>Audio kitob · <span class="ar-engine"></span></small><h2 id="arTitle">'+esc(title||'Kitob')+'</h2></div><button type="button" class="ar-ai secondary" aria-label="Kitobni AI bilan to‘liq tahlil qilish">✦ AI tahlil</button><button type="button" class="ar-close secondary" aria-label="Kitobni yopish">✕</button></div>'+
    '<p class="ar-status" role="status" aria-live="polite">Kitob ochilmoqda…</p>'+
    '<div class="ar-progress" hidden><progress max="100" value="0" aria-label="O‘qilgan qismi"></progress><small></small></div>'+
    '<div class="ar-controls" hidden><button type="button" data-ar="prevPage" aria-label="Oldingi sahifa">⏮ Sahifa</button><button type="button" data-ar="prev" aria-label="Oldingi parcha">◀ Orqaga</button><button type="button" data-ar="play" class="primary ar-play" aria-label="Kitobni tinglash">▶ Tinglash</button><button type="button" data-ar="next" aria-label="Keyingi parcha">Oldinga ▶</button><button type="button" data-ar="nextPage" aria-label="Keyingi sahifa">Sahifa ⏭</button></div>'+
    '<div class="ar-row" hidden><label>Sahifa<select data-ar="page"></select></label><label>Tezlik<input data-ar="rate" type="range" min="0.5" max="2" step="0.1"><output></output></label><label>Ovoz<select data-ar="gender"><option value="female">Madina (ayol)</option><option value="male">Sardor (erkak)</option></select></label><label>Kitob tili<select data-ar="lang"><option value="uz">O‘zbek</option><option value="ru">Rus</option><option value="en">Ingliz</option></select></label></div>'+
    '<div class="ar-text" tabindex="0" aria-label="Kitob matni"></div><p class="ar-keys">Matn maydonida: Probel — tinglash/to‘xtatish; ←/→ — parcha; PageUp/PageDown — sahifa; +/− — tezlik; Esc — yopish.</p></div>';
  document.body.append(dialog);dialog.showModal();
  const $=selector=>dialog.querySelector(selector),status=$('.ar-status'),textBox=$('.ar-text');
  const setStatus=value=>{if(!closed)status.textContent=value};
  const engine=()=>{$('.ar-engine').textContent=engineLabel()};
  const persist=()=>{
    if(!doc||loading||closed)return;
    try{localStorage.setItem(key,JSON.stringify({page,idx,rate,lang,finished,at:Date.now()}))}catch{}
    Promise.resolve(onProgress?.(page,idx,doc.numPages,finished,{lang,rate})).catch(()=>{});
  };
  function updateProgress(){
    const value=finished?100:Math.min(99,Math.floor((page+idx/Math.max(1,chunks.length))/doc.numPages*100));
    $('.ar-progress progress').value=value;
    $('.ar-progress small').textContent=(page+1)+' / '+doc.numPages+' sahifa · '+value+'%';
    textBox.querySelectorAll('.ar-now').forEach(el=>el.classList.remove('ar-now'));
    const active=textBox.querySelector('[data-i="'+idx+'"]');active?.classList.add('ar-now');active?.scrollIntoView({block:'nearest'});
  }
  function setPlaying(value){
    playing=value;const button=$('[data-ar="play"]');
    button.textContent=value?'⏸ To‘xtatish':'▶ '+(finished?'Qayta tinglash':'Tinglash');
    button.setAttribute('aria-label',value?'O‘qishni to‘xtatish':'Kitobni tinglash');
    if('mediaSession' in navigator)try{navigator.mediaSession.playbackState=value?'playing':'paused'}catch{}
  }
  async function preparePage(wantedIdx=0){
    const version=++revision;loading=true;
    dialog.setAttribute('aria-busy','true');setStatus((page+1)+'-sahifa tayyorlanmoqda…');
    try{
      const pageText=await doc.getPageText(page,lang);
      if(closed||version!==revision)return false;
      chunks=chunkForSpeech(splitSentences(pageText),lang);
      idx=wantedIdx<0?Math.max(0,chunks.length-1):Math.max(0,Math.min(wantedIdx,Math.max(0,chunks.length-1)));
      textBox.innerHTML=chunks.map((chunk,i)=>'<span data-i="'+i+'" lang="'+chunk.lang+'">'+esc(chunk.text)+' </span>').join('')||'<p>Bu sahifada o‘qiladigan matn topilmadi.</p>';
      $('[data-ar="page"]').value=String(page);loading=false;dialog.removeAttribute('aria-busy');updateProgress();persist();
      setStatus((page+1)+'-sahifa tayyor. '+(chunks.length?'Tinglash tugmasini bosing.':'Keyingi sahifaga o‘ting.'));
      return true;
    }catch(e){if(!closed&&version===revision){loading=false;dialog.removeAttribute('aria-busy');setPlaying(false);setStatus('Sahifa ochilmadi: '+e.message)}return false}
  }
  async function speakCurrent(){
    if(!playing||closed||loading)return;
    // Empty/cover pages are skipped without recursive stack growth.
    while(idx>=chunks.length){
      if(page>=doc.numPages-1){
        finished=true;setPlaying(false);updateProgress();persist();setStatus('Kitob oxiriga yetdi.');announce('Kitob tugadi.');return;
      }
      page++;idx=0;finished=false;
      if(!await preparePage())return;
      if(!playing||closed)return;
    }
    updateProgress();persist();setStatus((page+1)+'-sahifa o‘qilmoqda');
    void speakChunk(chunks[idx],{rate,owner:'reader',title:(title||'Kitob')+' · '+(page+1)+'-sahifa',next:chunks.slice(idx+1,idx+3),
      onend:()=>{if(playing&&!closed){idx++;void speakCurrent()}},
      oncancel:()=>{if(!ownStop&&!closed){setPlaying(false);persist();setStatus('To‘xtatildi. Davom ettirish uchun Tinglash tugmasini bosing.')}},
      onerror:e=>{if(!closed){setPlaying(false);setStatus(e.message+' Tinglash tugmasini qayta bosing.')}}
    });engine();
  }
  async function play(){
    if(!doc||loading||closed||playing)return;
    if(finished){finished=false;page=0;idx=0;if(!await preparePage())return}
    setPlaying(true);void speakCurrent();
  }
  function pause(){stopOwnSpeech();setPlaying(false);setStatus('To‘xtatildi · '+(page+1)+'-sahifa');persist()}
  async function jump(nextPage,nextIdx=0){
    if(!doc||loading||closed)return;
    const resume=playing;stopOwnSpeech();finished=false;page=Math.max(0,Math.min(doc.numPages-1,nextPage));
    if(await preparePage(nextIdx)&&resume)void speakCurrent();
  }
  const actions={play:()=>playing?pause():void play(),prevPage:()=>jump(page-1),nextPage:()=>jump(page+1),
    prev:()=>idx>0?jump(page,idx-1):page>0?jump(page-1,-1):undefined,
    next:()=>idx+1<chunks.length?jump(page,idx+1):page<doc.numPages-1?jump(page+1):undefined};
  function setRate(value){
    rate=Math.round(Math.min(2,Math.max(0.5,value))*10)/10;$('[data-ar="rate"]').value=rate;$('output').textContent=rate+'×';persist();
    if(playing){stopOwnSpeech();void speakCurrent()}
  }
  function onOtherSpeech(event){if(event.detail.owner!=='reader'&&playing){setPlaying(false);persist();setStatus('To‘xtatildi. Davom ettirish uchun Tinglash tugmasini bosing.')}}
  function close(){
    if(closed)return;stopOwnSpeech();persist();closed=true;revision++;controller.abort();doc?.close();
    document.removeEventListener('hx-speech-start',onOtherSpeech);document.removeEventListener('visibilitychange',onVisibility);
    if('mediaSession' in navigator)for(const action of ['play','pause','nexttrack','previoustrack'])try{navigator.mediaSession.setActionHandler(action,null)}catch{}
    dialog.close();dialog.remove();reader.current=null;previousFocus?.focus?.();
  }
  function onVisibility(){if(document.visibilityState==='hidden')persist()}
  document.addEventListener('visibilitychange',onVisibility);document.addEventListener('hx-speech-start',onOtherSpeech);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close()});$('.ar-close').onclick=close;
  const aiButton=$('.ar-ai');aiButton.hidden=!url;aiButton.onclick=()=>{
    if(!url)return;
    const source={kind:'reader',title:title||'Kitob',url,lang};
    close();
    document.dispatchEvent(new CustomEvent('hx:ai-analyze-document',{detail:source}));
  };
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();return}
    if(event.target.closest('button,input,select,textarea,a'))return;
    const map={' ':'play',ArrowLeft:'prev',ArrowRight:'next',PageUp:'prevPage',PageDown:'nextPage'};
    if(map[event.key]){event.preventDefault();actions[map[event.key]]()}
    else if(['+','=','-'].includes(event.key)){event.preventDefault();setRate(rate+(event.key==='-'?-0.1:0.1))}
  });
  dialog.querySelectorAll('button[data-ar]').forEach(button=>button.onclick=()=>actions[button.dataset.ar]());
  $('[data-ar="page"]').onchange=event=>void jump(Number(event.target.value));
  $('[data-ar="rate"]').oninput=event=>setRate(Number(event.target.value));
  $('[data-ar="gender"]').value=gender();$('[data-ar="gender"]').onchange=event=>{setGender(event.target.value);engine();if(playing){stopOwnSpeech();void speakCurrent()}};
  $('[data-ar="lang"]').value=lang;$('[data-ar="lang"]').onchange=event=>{lang=event.target.value;try{localStorage.setItem('hx-voice-lang',lang)}catch{}void jump(page,0)};
  textBox.onclick=event=>{const target=event.target.closest('[data-i]');if(target)void jump(page,Number(target.dataset.i))};
  reader.current={play,pause,next:actions.next,prev:actions.prev,faster:()=>setRate(rate+0.1),slower:()=>setRate(rate-0.1),close,isOpen:()=>!closed,isPlaying:()=>playing};
  if('mediaSession' in navigator)for(const [action,fn] of Object.entries({play,pause,nexttrack:actions.next,previoustrack:actions.prev}))try{navigator.mediaSession.setActionHandler(action,fn)}catch{}
  void (async()=>{
    try{
      void refreshServer().then(()=>{if(!closed)engine()});engine();
      doc=text!=null?{numPages:1,getPageText:async()=>String(text),close:()=>{}}:await openTextDocument(url,{signal:controller.signal,onProgress:setStatus});
      if(closed){doc.close();return}
      page=Math.min(page,doc.numPages-1);
      $('[data-ar="page"]').innerHTML=Array.from({length:doc.numPages},(_,i)=>'<option value="'+i+'">'+(i+1)+' / '+doc.numPages+'</option>').join('');
      if(!await preparePage(idx))return;
      $('.ar-controls').hidden=false;$('.ar-row').hidden=false;$('.ar-progress').hidden=false;
      setRate(rate);setPlaying(false);$('[data-ar="play"]').focus();
      announce('Kitob tayyor. '+doc.numPages+' sahifa. Tinglash tugmasini bosing.');
    }catch(e){if(!closed){loading=false;setStatus('Kitob ochilmadi: '+e.message)}}
  })();
  return dialog;
}
