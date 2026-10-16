// PDF parsing/OCR runs locally in the student's browser. Pages are loaded on demand.
import {pageTextFromItems} from './reader-rules.js';
let pdfjsPromise=null,tesseractPromise=null;
const abort=signal=>{if(signal?.aborted)throw new DOMException('Bekor qilindi','AbortError')};
export function loadPdfJs(){
  pdfjsPromise||=import('/vendor/pdfjs/pdf.mjs').then(lib=>{
    lib.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs';return lib;
  }).catch(e=>{pdfjsPromise=null;throw e});
  return pdfjsPromise;
}
function loadOcr(){
  tesseractPromise||=new Promise((resolve,reject)=>{
    if(window.Tesseract)return resolve(window.Tesseract);
    const script=document.createElement('script');script.src='/vendor/tesseract/tesseract.min.js';
    script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{script.remove();tesseractPromise=null;reject(new Error('Matnni tanish vositasi yuklanmadi. Internetni tekshiring.'))};
    document.head.append(script);
  });
  return tesseractPromise;
}
export async function openTextDocument(url,{signal,onProgress=()=>{}}={}){
  const response=await fetch(url,{credentials:'same-origin',signal});
  if(!response.ok)throw new Error('Kitob ochilmadi (HTTP '+response.status+'). Qayta urinib ko‘ring.');
  if(Number(response.headers.get('content-length'))>60*1024*1024)throw new Error('Kitob 60 MB dan katta.');
  const buffer=await response.arrayBuffer();abort(signal);
  if(buffer.byteLength>60*1024*1024)throw new Error('Kitob 60 MB dan katta.');
  const type=response.headers.get('content-type')||'';
  if(String.fromCharCode(...new Uint8Array(buffer.slice(0,5)))!=='%PDF-'){
    if(!type.startsWith('text/')&&!type.includes('octet-stream'))throw new Error('PDF yoki TXT faylni tanlang.');
    let text=new TextDecoder().decode(buffer);
    if(type.includes('html')){
      const dom=new DOMParser().parseFromString(text,'text/html');
      dom.querySelectorAll('script,style,nav,header,footer').forEach(el=>el.remove());text=dom.body.textContent||'';
    }
    const pages=text.split(/\f/);
    return {numPages:pages.length,getPageText:async i=>pages[i]||'',close:()=>{}};
  }
  const lib=await loadPdfJs();abort(signal);
  const task=lib.getDocument({data:buffer,isEvalSupported:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,
    standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});
  const abortTask=()=>{void task.destroy()};signal?.addEventListener('abort',abortTask,{once:true});
  let doc;
  try{doc=await task.promise}catch(e){signal?.removeEventListener('abort',abortTask);if(e.name==='PasswordException')throw new Error('PDF parol bilan himoyalangan. Parolsiz nusxasini yuklang.');throw e}
  let worker=null,workerLang='',closed=false;
  const cache=new Map();
  async function getPageText(index,lang='uz'){
    abort(signal);if(closed)throw new DOMException('Bekor qilindi','AbortError');
    const cacheKey=index+':'+lang;if(cache.has(cacheKey))return cache.get(cacheKey);
    const page=await doc.getPage(index+1);abort(signal);
    const content=await page.getTextContent();let text=pageTextFromItems(content.items);
    if(!/\p{L}{2}/u.test(text)){
      onProgress((index+1)+'-sahifadagi rasm matni tanilmoqda… Birinchi safar til fayllari yuklanadi.');
      const Tesseract=await loadOcr();abort(signal);
      if(!worker||workerLang!==lang){
        if(worker)await worker.terminate();
        const created=await Tesseract.createWorker(lang==='ru'?'rus':lang==='en'?'eng':'uzb+uzb_cyrl',1,{
          workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract-core/',
          logger:m=>{if(m.status==='recognizing text')onProgress((index+1)+'-sahifa: matn tanilmoqda '+Math.round(m.progress*100)+'%')}
        });
        if(closed||signal?.aborted){await created.terminate();throw new DOMException('Bekor qilindi','AbortError')}
        worker=created;workerLang=lang;
      }
      abort(signal);
      const initial=page.getViewport({scale:1});
      const scale=Math.min(2,2400/Math.max(initial.width,initial.height));
      const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      try{
        await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;abort(signal);
        const result=await worker.recognize(canvas);text=result.data.text||'';
      }finally{canvas.width=0;canvas.height=0}
    }
    page.cleanup();abort(signal);cache.set(cacheKey,text);return text;
  }
  return {numPages:doc.numPages,getPageText,close:()=>{
    closed=true;signal?.removeEventListener('abort',abortTask);void worker?.terminate();void task.destroy();cache.clear();
  }};
}
