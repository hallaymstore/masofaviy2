import {askConfirmation} from './accessible-confirm.js';
// HALLAYM EDU — «Mening kitoblarim» page: personal audio-book shelf (upload PDF/TXT, listen at once with the Uzbek voice,
// continue where you stopped) and the one-time family upload link. Built for screen readers and the voice assistant:
// every book is one big «Tinglash» button, results are announced.
import {openAudioReader} from './audio-reader.js';

export function createMyBooksUi({api,toast,esc,csrf,currentUser,announce=t=>toast(t)}){
  let books=[];const writes=new Map();
  const pct=p=>p?.finished?100:p?.pages?Math.min(99,Math.round((p.page||0)/p.pages*100)):0;
  const size=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
  const fromLabel={self:'O‘zim yukladim',family:'Oilam yuklagan',staff:'Tyutor yuklagan'};
  function updateProgress(book){
    const button=document.querySelector('#myBooksBoard [data-listen="'+book.id+'"]'),card=button?.closest('.mb-book');if(!card)return;
    const value=pct(book.progress),bar=card.querySelector('.mb-prog');bar.setAttribute('aria-valuenow',String(value));bar.querySelector('i').style.width=value+'%';
    card.querySelector('.mb-info>small:last-child').textContent=book.progress.finished?'✅ Tinglab bo‘lingan':value?value+'% · '+(book.progress.page+1)+'-sahifada to‘xtagansiz':'Hali boshlanmagan';
    button.textContent='▶ '+(!book.progress.finished&&(value||book.progress.idx)?'Davom ettirish':'Tinglash');
  }

  async function render(){
    const host=document.getElementById('myBooksBoard');if(!host)return;
    try{const r=await api('/my-books');books=r.books||[]}catch(e){host.innerHTML='<div class="empty">'+esc(e.message)+'</div>';return}
    const u=currentUser();const isStudent=u?.role==='student';
    host.innerHTML=
      '<div class="mb-actions">'+
        '<button type="button" id="mbAdd" class="primary">➕ Kitob qo‘shish (PDF yoki TXT)</button><input type="file" id="mbFile" accept="application/pdf,.pdf,text/plain,.txt" hidden>'+
        '<label>Yuklanadigan kitob tili<select id="mbLang"><option value="uz">O‘zbek</option><option value="ru">Rus</option><option value="en">Ingliz</option></select></label>'+
        (isStudent?'<button type="button" class="secondary" id="mbFamily"><span aria-hidden="true">👨‍👩‍👧</span> Oila uchun yuklash havolasi</button>':'')+
      '</div>'+
      '<div id="mbFamilyBox" class="mb-family" hidden></div>'+
      '<p class="mb-hint">Kitob qo‘shilgach «Tinglash» tugmasini bosing. Madina yoki Sardor ovozini tanlang. To‘xtagan joyingiz eslab qolinadi. Skanerlangan PDF matni qurilmangizda taniladi; birinchi ochilish uzoqroq vaqt olishi mumkin.</p>'+
      (books.length?'<ul class="mb-list" aria-label="Kitoblarim">'+books.map(b=>{const p=pct(b.progress);return '<li class="mb-book"><div class="mb-cover" aria-hidden="true">'+(b.mimeType?.includes('pdf')?'📕':'📄')+'</div><div class="mb-info"><h3>'+esc(b.title)+'</h3><small>'+esc([b.author,fromLabel[b.addedBy]+(b.addedByName&&b.addedBy!=='self'?' ('+b.addedByName+')':''),size(b.size)].filter(Boolean).join(' · '))+'</small>'+
        '<div class="mb-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p+'" aria-label="O‘qilgan qismi"><i style="width:'+p+'%"></i></div><small>'+(b.progress?.finished?'✅ Tinglab bo‘lingan':p?p+'% · '+((b.progress.page||0)+1)+'-sahifada to‘xtagansiz':'Hali boshlanmagan')+'</small></div>'+
        '<div class="mb-btns"><button type="button" class="primary mb-listen" data-listen="'+esc(b.id)+'" aria-label="'+esc(b.title)+' kitobini tinglash">▶ '+(p&&!b.progress?.finished?'Davom ettirish':'Tinglash')+'</button><button type="button" class="secondary" data-del="'+esc(b.id)+'" aria-label="'+esc(b.title)+' kitobini o‘chirish">O‘chirish</button></div></li>'}).join('')+'</ul>'
      :'<div class="empty mb-empty"><b>Javoningiz hozircha bo‘sh</b><p>«Kitob qo‘shish» tugmasi bilan PDF kitob yuklang'+(isStudent?' yoki oilangizga yuklash havolasini yuboring':'')+'.</p></div>');
    document.getElementById('mbFile').onchange=e=>upload(e.target.files?.[0],e.target);
    document.getElementById('mbAdd').onclick=()=>document.getElementById('mbFile').click();
    document.getElementById('mbFamily')?.addEventListener('click',familyLink);
    host.querySelectorAll('[data-listen]').forEach(b=>b.onclick=()=>listen(b.dataset.listen));
    host.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>remove(b.dataset.del));
  }

  async function upload(file,input){
    if(!file)return;
    if(file.size>60*1024*1024){toast('Kitob 60 MB dan katta');input.value='';return}
    const fd=new FormData();fd.append('title',file.name.replace(/\.[^.]+$/,''));fd.append('lang',document.getElementById('mbLang').value);fd.append('file',file);
    const add=document.getElementById('mbAdd');add.disabled=true;add.setAttribute('aria-busy','true');
    announce('Kitob yuklanmoqda: '+file.name);
    try{
      const r=await fetch('/api/my-books',{method:'POST',body:fd,credentials:'same-origin',headers:{'X-CSRF-Token':csrf()}});
      const x=await r.json().catch(()=>({}));if(!r.ok)throw new Error(x.message||'Yuklab bo‘lmadi');
      announce('«'+x.book.title+'» javonga qo‘shildi. Tinglash uchun uning «Tinglash» tugmasini bosing.');
      await render();document.querySelector('[data-listen="'+x.book.id+'"]')?.focus();
    }catch(e){toast(e.message)}finally{input.value='';add.disabled=false;add.removeAttribute('aria-busy')}
  }
  // fromStart: the voice assistant asked «davom ettiraymi yoki boshidan?» and the student chose the beginning.
  function listen(id,{fromStart=false}={}){
    const b=books.find(x=>x.id===id);if(!b)return;
    if(fromStart)try{localStorage.removeItem('m2-ar:'+String(currentUser()._id)+':personal:'+id)}catch{}
    openAudioReader({title:b.title,url:'/api/my-books/'+encodeURIComponent(id)+'/file',storageKey:String(currentUser()._id)+':personal:'+id,start:fromStart?{page:0,idx:0,lang:b.lang,finished:false,at:new Date().toISOString()}:{page:b.progress?.page||0,idx:b.progress?.idx||0,lang:b.lang,finished:Boolean(b.progress?.finished),at:b.progress?.at},announce,
      onProgress:(page,idx,pages,finished,meta)=>{
        b.progress={page,idx,pages,finished:Boolean(finished),at:new Date().toISOString()};b.lang=meta.lang;
        updateProgress(b);
        const body=JSON.stringify({progress:b.progress,lang:b.lang});
        // Keep delayed network responses from moving the saved position backwards.
        const next=(writes.get(id)||Promise.resolve()).catch(()=>{}).then(()=>api('/my-books/'+encodeURIComponent(id),{method:'PATCH',body}));
        writes.set(id,next);next.finally(()=>{if(writes.get(id)===next)writes.delete(id)}).catch(()=>{});return next;
      }});
  }
  async function remove(id){
    const b=books.find(x=>x.id===id);if(!b||!await askConfirmation('«'+b.title+'» javondan o‘chirilsinmi?'))return;
    try{await api('/my-books/'+encodeURIComponent(id),{method:'DELETE'});announce('Kitob o‘chirildi');render()}catch(e){toast(e.message)}
  }
  async function familyLink(){
    const box=document.getElementById('mbFamilyBox');
    try{
      const r=await api('/my-books/family-link',{method:'POST'});const url=location.origin+r.path;
      box.hidden=false;
      box.innerHTML='<p><b>Oila a’zolaringiz uchun havola.</b> Uni Telegram yoki SMS orqali yuboring: ular parolsiz kitob yuklay oladi. Havola '+r.expiresInDays+' kun va '+r.maxUploads+' ta yuklash uchun amal qiladi; yangi havola eskisini bekor qiladi.</p>'+
        '<div class="mb-link"><input readonly value="'+esc(url)+'" aria-label="Oila uchun havola"><button type="button" class="primary" id="mbCopy">Nusxalash</button>'+(navigator.share?'<button type="button" class="secondary" id="mbShare">Yuborish</button>':'')+'<button type="button" class="secondary" id="mbRevoke">Bekor qilish</button></div>';
      document.getElementById('mbCopy').onclick=async()=>{try{await navigator.clipboard.writeText(url);announce('Havola nusxalandi')}catch{box.querySelector('input').select()}};
      document.getElementById('mbShare')?.addEventListener('click',()=>navigator.share({title:'Kitob yuklash havolasi',text:'Menga audio kitob yuklab bering:',url}).catch(()=>{}));
      document.getElementById('mbRevoke').onclick=async()=>{try{await api('/my-books/family-link',{method:'DELETE'});box.hidden=true;announce('Havola bekor qilindi')}catch(e){toast(e.message)}};
      announce('Oila uchun havola tayyor. Nusxalash tugmasini bosing va oilangizga yuboring.');
      document.getElementById('mbCopy').focus();
    }catch(e){toast(e.message)}
  }
  const firstListen=()=>document.querySelector('[data-listen]');
  return {render,listen,firstListen,books:()=>books};
}
