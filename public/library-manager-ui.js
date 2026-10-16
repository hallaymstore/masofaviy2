import {openAudioReader} from './audio-reader.js';
export function createLibraryManagerUi({api,toast,esc,csrf}){
  let rows=[],editing=null;
  const types=[['book','Kitob'],['textbook','Darslik'],['manual','Qo‘llanma'],['monograph','Monografiya'],['article','Ilmiy maqola'],['research','Tadqiqot'],['thesis','Dissertatsiya'],['standard','Standart'],['other','Boshqa']];
  async function render(){
    const host=document.getElementById('libraryManageBoard');if(!host)return;
    host.innerHTML='<p role="status">Kutubxona yuklanmoqda…</p>';
    try{rows=(await api('/lms/library/manage')).items||[]}catch(e){host.textContent=e.message;return}
    editing=null;
    host.innerHTML='<article class="lm-upload"><h2 id="lmFormTitle">Qurilmadan PDF kitob qo‘shish</h2><form id="lmForm" class="form-grid">'+
      '<label class="wide">PDF fayl (60 MB gacha)<input name="file" type="file" accept="application/pdf,.pdf" required><small>Faylni kompyuter yoki telefoningizdan tanlang.</small></label>'+
      '<label class="wide">Kitob nomi<input name="title" maxlength="200" required></label><label>Mualliflar<input name="authors" maxlength="1000" placeholder="Vergul bilan ajrating"></label><label>Nashr yili<input name="publicationYear" type="number" min="1000" max="3000"></label>'+
      '<label>Kitob turi<select name="type">'+types.map(([id,label])=>'<option value="'+id+'">'+esc(label)+'</option>').join('')+'</select></label><label>Til<select name="language"><option value="uz">O‘zbek</option><option value="ru">Rus</option><option value="en">Ingliz</option></select></label>'+
      '<label>ISBN<input name="isbn" maxlength="40"></label><label>DOI<input name="doi" maxlength="200"></label><label class="wide">Mavzu va teglar<input name="tags" placeholder="Adabiyot, tarix, ta’lim"></label><label class="wide">Tavsif<textarea name="description" rows="4" maxlength="5000"></textarea></label>'+
      '<div class="wide mb-actions"><button type="submit" class="primary" id="lmSubmit">PDFni yuklash va kutubxonaga qo‘shish</button><button type="button" id="lmCancel" hidden>Bekor qilish</button><span id="lmStatus" role="status" aria-live="polite"></span></div></form></article>'+
      '<article><div class="section-title"><h2>Kitoblarni boshqarish</h2><button type="button" id="lmRefresh">Yangilash</button></div><label>Kitob qidirish<input id="lmSearch" type="search" placeholder="Nomi yoki muallifi"></label><div id="lmList" class="list"></div></article>';
    const form=host.querySelector('#lmForm'),status=host.querySelector('#lmStatus');
    host.querySelector('#lmRefresh').onclick=render;host.querySelector('#lmSearch').oninput=renderList;
    host.querySelector('#lmCancel').onclick=()=>reset();
    form.elements.file.onchange=()=>{if(!form.elements.title.value&&form.elements.file.files[0])form.elements.title.value=form.elements.file.files[0].name.replace(/\.pdf$/i,'')};
    form.onsubmit=async event=>{
      event.preventDefault();const button=host.querySelector('#lmSubmit');button.disabled=true;form.setAttribute('aria-busy','true');status.textContent=editing?'Saqlanmoqda…':'PDF yuklanmoqda…';
      try{
        const data=new FormData(form);
        if(editing){data.delete('file');await api('/lms/library/'+encodeURIComponent(editing),{method:'PATCH',body:JSON.stringify(Object.fromEntries(data))})}
        else{
          const file=data.get('file');if(!file?.size)throw new Error('PDF faylni tanlang');if(file.size>60*1024*1024)throw new Error('PDF 60 MB dan katta');
          const response=await fetch('/api/lms/library/upload',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf()},body:data});
          const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||'PDF yuklanmadi');
        }
        toast(editing?'Kitob ma’lumotlari saqlandi':'PDF kutubxonaga qo‘shildi. Endi barcha foydalanuvchilar tinglay oladi.');await render();
      }catch(e){status.textContent=e.message}finally{button.disabled=false;form.removeAttribute('aria-busy')}
    };
    function reset(){editing=null;form.reset();form.elements.file.required=true;form.elements.file.closest('label').hidden=false;host.querySelector('#lmFormTitle').textContent='Qurilmadan PDF kitob qo‘shish';host.querySelector('#lmSubmit').textContent='PDFni yuklash va kutubxonaga qo‘shish';host.querySelector('#lmCancel').hidden=true;status.textContent=''}
    function edit(id){
      const row=rows.find(x=>String(x._id)===id);if(!row)return;reset();editing=id;
      for(const name of ['title','authors','publicationYear','type','language','isbn','doi','tags','description'])form.elements[name].value=Array.isArray(row[name])?row[name].join(', '):row[name]||'';
      form.elements.file.required=false;form.elements.file.closest('label').hidden=true;host.querySelector('#lmFormTitle').textContent='Kitob ma’lumotlarini tahrirlash';host.querySelector('#lmSubmit').textContent='O‘zgarishlarni saqlash';host.querySelector('#lmCancel').hidden=false;form.elements.title.focus();
    }
    function renderList(){
      const query=host.querySelector('#lmSearch').value.trim().toLowerCase();const filtered=rows.filter(row=>!query||[row.title,...row.authors||[]].join(' ').toLowerCase().includes(query));
      const list=host.querySelector('#lmList');
      list.innerHTML=filtered.length?filtered.map(row=>'<article class="mb-book"><div class="mb-info"><h3>'+esc(row.title)+'</h3><p>'+esc((row.authors||[]).join(', ')||'Muallif ko‘rsatilmagan')+' · '+esc(row.publicationYear||'Yil kiritilmagan')+'</p><small>'+esc(row.language||'uz')+' · '+(row.fileId?'PDF':'Havola')+' · '+(row.published?'Nashr qilingan':'Arxivda')+'</small></div><div class="mb-btns"><button type="button" data-edit="'+esc(row._id)+'">Tahrirlash</button>'+(row.fileId?'<button type="button" data-listen="'+esc(row._id)+'">Tinglash</button>':'')+'<button type="button" data-publish="'+esc(row._id)+'">'+(row.published?'Arxivlash':'Qayta nashr qilish')+'</button></div></article>').join(''):'<p>Kitob topilmadi.</p>';
      list.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>edit(button.dataset.edit));
      list.querySelectorAll('[data-publish]').forEach(button=>button.onclick=async()=>{const row=rows.find(x=>String(x._id)===button.dataset.publish);button.disabled=true;try{await api('/lms/library/'+encodeURIComponent(row._id),{method:'PATCH',body:JSON.stringify({published:!row.published})});row.published=!row.published;renderList()}catch(e){toast(e.message);button.disabled=false}});
      list.querySelectorAll('[data-listen]').forEach(button=>button.onclick=()=>{const row=rows.find(x=>String(x._id)===button.dataset.listen);openAudioReader({title:row.title,url:'/api/lms/library/'+encodeURIComponent(row._id)+'/content',start:{lang:row.language},announce:toast})});
    }
    renderList();
  }
  return {render};
}
