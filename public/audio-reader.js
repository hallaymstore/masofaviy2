// HALLAYM EDU — audio reader: turns a text PDF (or plain text / HTML) into speech with the browser's own voices.
// Sentence-by-sentence playback (long utterances stall in Chrome), position remembered per book, full keyboard control.
// Scanned PDFs have no text layer: the reader says so instead of reading silence.
const PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';
let pdfjsPromise=null;
function loadPdfJs(){
  if(!pdfjsPromise)pdfjsPromise=(async()=>{const lib=await import(PDFJS+'pdf.min.mjs');const src=await (await fetch(PDFJS+'pdf.worker.min.mjs')).text();lib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));return lib})().catch(e=>{pdfjsPromise=null;throw e});
  return pdfjsPromise;
}

// Splits text into speakable chunks: sentences, and long sentences cut at commas/spaces (≤ 220 chars).
export function splitSentences(text){
  const clean=String(text||'').replace(/­/g,'').replace(/-\n(?=\p{Ll})/gu,'').replace(/\s+/g,' ').trim();
  if(!clean)return [];
  const parts=clean.match(/[^.!?…]+(?:[.!?…]+["»”)]*|$)/g)||[clean];
  const out=[];
  for(let p of parts.map(x=>x.trim()).filter(Boolean)){
    while(p.length>220){let cut=p.lastIndexOf(', ',220);if(cut<80)cut=p.lastIndexOf(' ',220);if(cut<40)cut=220;out.push(p.slice(0,cut+1).trim());p=p.slice(cut+1).trim()}
    if(p)out.push(p);
  }
  return out;
}
// pdf.js text items → page text, keeping line breaks so hyphenated words can be rejoined.
export function pageTextFromItems(items){
  let s='';for(const it of items||[]){s+=it.str||'';if(it.hasEOL)s+='\n';else if(it.str&&!/\s$/.test(it.str))s+=' '}
  return s.replace(/[ \t]+\n/g,'\n').trim();
}
export const looksScanned=(pages)=>pages.length>0&&pages.join('').replace(/\s/g,'').length<pages.length*40;

async function extractPages(url,onProgress){
  const r=await fetch(url,{credentials:'same-origin'});
  if(!r.ok)throw new Error('Faylni ochib bo‘lmadi (HTTP '+r.status+')');
  const type=(r.headers.get('content-type')||'').toLowerCase();
  const buf=await r.arrayBuffer();
  const head=new Uint8Array(buf.slice(0,5));const isPdf=type.includes('pdf')||String.fromCharCode(...head)==='%PDF-';
  if(isPdf){
    const lib=await loadPdfJs();const doc=await lib.getDocument({data:buf}).promise;const pages=[];
    for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const tc=await page.getTextContent();pages.push(pageTextFromItems(tc.items));onProgress?.(i,doc.numPages)}
    return pages;
  }
  const text=new TextDecoder('utf-8').decode(buf);
  if(type.includes('html')||/^\s*</.test(text)){const d=new DOMParser().parseFromString(text,'text/html');d.querySelectorAll('script,style,nav,header,footer').forEach(x=>x.remove());return [d.body?.innerText||d.body?.textContent||'']}
  if(type.startsWith('text/')||type.includes('json')||!type)return [text];
  throw new Error('Bu fayl turini ovozda o‘qib bo‘lmaydi ('+(type||'noma’lum')+'). PDF, TXT yoki HTML kerak.');
}

// speech: {speak(text,{onend,onstart}), stop(), pickVoice(), rate()} from inclusion-ui.js
export function openAudioReader({title,url,text,speech,announce,esc=s=>String(s)}){
  document.querySelector('.ar-dialog')?.remove();
  const key='m2-ar:'+(url||title||'text');
  const saved=(()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return {}}})();
  const dlg=document.createElement('div');
  dlg.className='ar-dialog';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-labelledby','arTitle');
  dlg.innerHTML='<div class="ar-card"><div class="ar-head"><div><small>🔊 Audio tinglash</small><h2 id="arTitle">'+esc(title||'Matn')+'</h2></div><button class="ar-close hx-plain" aria-label="Yopish (Escape)">✕</button></div>'+
    '<p class="ar-status" role="status" aria-live="polite">Matn tayyorlanmoqda…</p>'+
    '<div class="ar-controls" hidden>'+
      '<button data-ar="prevPage" class="hx-plain" aria-label="Oldingi sahifa (Page Up)">⏮ Sahifa</button>'+
      '<button data-ar="prev" class="hx-plain" aria-label="Oldingi gap (chap strelka)">◀ Gap</button>'+
      '<button data-ar="play" class="hx-plain ar-play" aria-label="Boshlash (Probel)">▶ Tinglash</button>'+
      '<button data-ar="next" class="hx-plain" aria-label="Keyingi gap (o‘ng strelka)">Gap ▶</button>'+
      '<button data-ar="nextPage" class="hx-plain" aria-label="Keyingi sahifa (Page Down)">Sahifa ⏭</button>'+
    '</div>'+
    '<div class="ar-row" hidden><label>Sahifa <select data-ar="page"></select></label><label>Tezlik <input data-ar="rate" type="range" min="0.5" max="2" step="0.1"><output></output></label><label class="ar-show"><input type="checkbox" data-ar="showText" checked> Matnni ko‘rsatish</label></div>'+
    '<div class="ar-text" tabindex="0" aria-label="Kitob matni" hidden></div>'+
    '<p class="ar-keys">Klaviatura: Probel — to‘xtatish/davom, ←/→ — gap, PageUp/PageDown — sahifa, +/− — tezlik, Esc — yopish.</p></div>';
  document.body.append(dlg);
  const $=s=>dlg.querySelector(s),status=$('.ar-status'),textBox=$('.ar-text');
  const prevFocus=document.activeElement;
  let pages=[],sentences=[],page=Math.max(0,saved.page|0),idx=Math.max(0,saved.idx|0),playing=false,token=0,rate=Number(saved.rate)||speech.rate();
  const save=()=>{try{localStorage.setItem(key,JSON.stringify({page,idx,rate}))}catch{}};
  const setStatus=t=>{status.textContent=t};
  function renderPage(){
    sentences=splitSentences(pages[page]||'');if(idx>=sentences.length)idx=0;
    textBox.innerHTML=sentences.map((s,i)=>'<span data-i="'+i+'">'+esc(s)+' </span>').join('')||'<em>Bu sahifada matn yo‘q.</em>';
    $('[data-ar="page"]').value=String(page);highlight();
  }
  function highlight(){textBox.querySelectorAll('.ar-now').forEach(x=>x.classList.remove('ar-now'));const el=textBox.querySelector('[data-i="'+idx+'"]');if(el){el.classList.add('ar-now');if(!$('[data-ar="showText"]').checked)return;el.scrollIntoView({block:'nearest'})}}
  function setPlaying(on){playing=on;const b=$('[data-ar="play"]');b.textContent=on?'⏸ To‘xtatish':'▶ Tinglash';b.setAttribute('aria-label',on?'To‘xtatish (Probel)':'Davom ettirish (Probel)')}
  function speakCurrent(){
    const my=++token;
    if(idx>=sentences.length){
      if(page<pages.length-1){page++;idx=0;renderPage();save();speech.speak((page+1)+'-sahifa',{rate,onend:()=>{if(my===token&&playing)speakCurrent()}});return}
      setPlaying(false);setStatus('Kitob oxiriga yetdi.');announce?.('Kitob tugadi');return;
    }
    highlight();save();
    speech.speak(sentences[idx],{rate,lang:speech.bookLang?.(),onend:()=>{if(my!==token||!playing)return;idx++;speakCurrent()},onerror:()=>{if(my===token){setPlaying(false);setStatus('Ovozda o‘qishda xato. Boshqa ovozni tanlab ko‘ring (Qulaylik sozlamalari).')}}});
  }
  const play=()=>{if(!sentences.length&&!pages.some(Boolean))return;setPlaying(true);setStatus((page+1)+'-sahifa o‘qilmoqda');speakCurrent()};
  const pause=()=>{token++;speech.stop();setPlaying(false);setStatus('To‘xtatildi · '+(page+1)+'-sahifa, '+(idx+1)+'-gap');save()};
  const jump=(fn)=>{const was=playing;token++;speech.stop();fn();renderPage();save();if(was)speakCurrent();else setStatus((page+1)+'-sahifa, '+(idx+1)+'-gap: '+(sentences[idx]||'').slice(0,80))};
  const actions={
    play:()=>playing?pause():play(),
    prev:()=>jump(()=>{if(idx>0)idx--;else if(page>0){page--;idx=1e9}}),
    next:()=>jump(()=>{idx++;if(idx>=sentences.length&&page<pages.length-1){page++;idx=0}}),
    prevPage:()=>jump(()=>{if(page>0)page--;idx=0}),
    nextPage:()=>jump(()=>{if(page<pages.length-1)page++;idx=0})
  };
  const close=()=>{token++;speech.stop();save();dlg.remove();document.removeEventListener('keydown',onKey,true);prevFocus?.focus?.()};
  function onKey(e){
    if(!document.body.contains(dlg))return;
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(['INPUT','SELECT'].includes(e.target.tagName)&&e.key!==' ')return;
    const map={' ':'play',ArrowLeft:'prev',ArrowRight:'next',PageUp:'prevPage',PageDown:'nextPage'};
    if(map[e.key]&&pages.length){e.preventDefault();actions[map[e.key]]()}
    else if((e.key==='+'||e.key==='=')&&pages.length){e.preventDefault();setRate(rate+0.1)}
    else if(e.key==='-'&&pages.length){e.preventDefault();setRate(rate-0.1)}
  }
  function setRate(r){rate=Math.round(Math.min(2,Math.max(0.5,r))*10)/10;$('[data-ar="rate"]').value=String(rate);$('[data-ar="rate"]+output').textContent=rate+'×';save();if(playing){token++;speech.stop();speakCurrent()}}
  document.addEventListener('keydown',onKey,true);
  $('.ar-close').onclick=close;
  dlg.addEventListener('click',e=>{if(e.target===dlg)close()});
  dlg.querySelectorAll('button[data-ar]').forEach(b=>b.onclick=()=>actions[b.dataset.ar]());
  $('[data-ar="page"]').onchange=e=>jump(()=>{page=Number(e.target.value)||0;idx=0});
  $('[data-ar="rate"]').oninput=e=>setRate(Number(e.target.value));
  $('[data-ar="showText"]').onchange=e=>{textBox.hidden=!e.target.checked};
  $('.ar-close').focus();
  (async()=>{
    try{
      pages=text!=null?[String(text)]:await extractPages(url,(i,n)=>setStatus('Matn ajratilmoqda: '+i+' / '+n+' sahifa'));
      if(!pages.some(p=>p.trim())||looksScanned(pages)){setStatus('Bu kitob skanerlangan rasm ko‘rinishida: ichida matn qatlami yo‘q. Ovozda o‘qish uchun kutubxona uni matnli PDF (OCR) holatiga keltirishi kerak.');announce?.('Bu kitobda o‘qiladigan matn yo‘q, u skanerlangan rasm');return}
      if(page>=pages.length)page=0;
      $('[data-ar="page"]').innerHTML=pages.map((_,i)=>'<option value="'+i+'">'+(i+1)+' / '+pages.length+'</option>').join('');
      $('.ar-controls').hidden=false;$('.ar-row').hidden=false;textBox.hidden=false;setRate(rate);renderPage();
      const resume=saved.page||saved.idx?' Oldin '+(page+1)+'-sahifada to‘xtagan edingiz.':'';
      setStatus(pages.length+' sahifa tayyor.'+resume+' Tinglash uchun Probel yoki «Tinglash» tugmasini bosing.');
      announce?.('Kitob tayyor, '+pages.length+' sahifa.'+resume+' Boshlash uchun probel tugmasini bosing yoki «davom et» deng.');
      $('[data-ar="play"]').focus();
      openAudioReader.current={play,pause,next:actions.next,prev:actions.prev,faster:()=>setRate(rate+0.2),slower:()=>setRate(rate-0.2),close,isOpen:()=>document.body.contains(dlg)};
    }catch(e){setStatus(e.message||'Matnni olishda xato');announce?.(e.message)}
  })();
}
openAudioReader.current=null;
