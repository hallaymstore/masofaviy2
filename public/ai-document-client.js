// HALLAYM AI — read every authorized PDF/TXT page before remote summarization.
// Reuses the browser-side PDF.js/OCR reader; Groq credentials remain on the server.
import {openTextDocument} from './pdf-text.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const safeUrl=value=>{
  const url=new URL(value,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))throw new Error('Tashqi saytdagi PDF avtomatik o‘qilmaydi. Kutubxonaga PDF faylini yuklang yoki mahalliy resursni tanlang.');
  return url.pathname+url.search;
};
export async function analyzeBookDocument({url,title,lang='uz',api,onProgress=()=>{},signal}={}){
  const local=safeUrl(url);
  const doc=await openTextDocument(local,{signal,onProgress:message=>onProgress(message)});
  try{
    if(doc.numPages>800)throw new Error('PDF 800 sahifadan katta; kichikroq bo‘limni tahlil qiling.');
    const pages=[];
    let chars=0;
    for(let i=0;i<doc.numPages;i++){
      if(signal?.aborted)throw new DOMException('Bekor qilindi','AbortError');
      onProgress('PDF matni ajratilmoqda: '+(i+1)+' / '+doc.numPages+' sahifa');
      const text=String(await doc.getPageText(i,lang)||'').replace(/\s+/g,' ').trim();
      chars+=text.length;
      if(chars>600000)throw new Error('Bu PDF 600 000 belgidan katta. Hozir to‘liq tahlil uchun kitobni bo‘limlarga ajrating.');
      pages.push({page:i+1,text});
      if(i%6===5)await wait(0);
    }
    const unread=pages.filter(p=>p.text.length<5);
    if(unread.length)throw new Error(unread.length+' sahifadan matn olinmadi. OCR ishlashini tekshiring yoki matnli PDF yuklang.');
    onProgress('PDFning barcha '+doc.numPages+' sahifasi olindi. AI tahlil boshlanmoqda…');
    const result=await api('/ai/document/summary',{method:'POST',
      body:JSON.stringify({page:document.documentElement.dataset.page,title,pageCount:doc.numPages,pages})});
    const job=result.jobId;
    if(!job)throw new Error('AI tahlil ishini boshlay olmadi.');
    const start=Date.now();
    while(Date.now()-start<20*60*1000){
      if(signal?.aborted)throw new DOMException('Bekor qilindi','AbortError');
      await wait(1800);
      const state=await api('/ai/document/'+encodeURIComponent(job));
      if(state.status==='failed')throw new Error(state.error||'AI tahlil amalga oshmadi.');
      if(state.status==='completed')return {answer:state.answer,pageCount:state.pageCount};
      onProgress('Kitob tahlili: '+(state.done||0)+' / '+(state.total||'?')+' qism. '+(state.stage||''));
    }
    throw new Error('Kitob tahlili hali davom etyapti. Jarayon serverda saqlanadi; birozdan keyin qayta urinib ko‘ring.');
  }finally{doc.close()}
}
