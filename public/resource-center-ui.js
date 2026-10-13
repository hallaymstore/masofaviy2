// One compact resource/assignment/video composer for all courses taught by this account.
const groupIds=values=>Array.isArray(values)?values.filter(Boolean):[values].filter(Boolean);
export async function openResourceCenter({api,modal,esc,csrf,toast,courseId,topicId,defaultMode='file',uploadCourseResource,attachTopic}){
 const [courses,assets]=await Promise.all([api('/lms/courses'),api('/lms/my-assets')]);
 const usable=courses.filter(x=>x._id);
 if(!usable.length)return toast('Resurs joylash uchun avval fan/guruh biriktiring');
 const choice=(id,name,checked)=>'<label class="rc-check"><input type="checkbox" name="'+name+'" value="'+esc(id)+'" '+(checked?'checked':'')+'><span>'+esc(usable.find(c=>String(c._id)===String(id))?.title||'')+'</span><small>'+esc(usable.find(c=>String(c._id)===String(id))?.groupId?.name||'')+'</small></label>';
 const modes=[['file','📎 Fayl / ZIP'],['mine','📚 Shaxsiy fayllar'],['link','🔗 Havola'],['assignment','📝 Topshiriq'],['video','▶ Videodars']];
 const block=(mode,body)=>'<section class="rc-mode" data-rc-mode="'+mode+'" hidden>'+body+'</section>';
 const assetRows=assets.map(a=>'<label class="rc-check"><input type="checkbox" name="assetIds" value="'+esc(a._id)+'"><span>'+esc(a.title)+'</span><small>'+esc(a.kind||'')+'</small></label>').join('')||'<p>Hozircha shaxsiy fayllar yo‘q. «Fayl / ZIP» orqali yuklang.</p>';
 const selectAssets=kind=>'<option value="">Tanlang</option>'+assets.filter(x=>x.kind===kind).map(x=>'<option value="'+esc(x._id)+'">'+esc(x.title)+'</option>').join('');
 const html='<div class="rc-center">'+
  '<p class="rc-intro">Bitta faylni bir marta yuklab, o‘zingiz o‘qitadigan bir nechta guruhga ulashing. Fayllar sizning kutubxonangizda qoladi.</p>'+
  '<div class="rc-tabs" role="tablist">'+modes.map(([k,title])=>'<button type="button" role="tab" data-rc-tab="'+k+'">'+title+'</button>').join('')+'</div>'+
  block('file','<label>Kompyuterdan fayl tanlang<input name="sourceFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.epub,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.webm,.mov,.mkv,.avi,.zip"></label><label>Ixtiyoriy nom<input name="assetTitle" maxlength="180" placeholder="Bo‘sh bo‘lsa fayl nomi olinadi"></label><label class="rc-private-option"><input name="privateOnly" type="checkbox"><span>Faqat shaxsiy kutubxonada saqlash (guruhlarga hozir tarqatmaslik)</span></label><small>ZIP: 30 MB gacha, 35 fayl, jami 90 MB. Fayllarni 01__Mavzu nomi__Resurs nomi.pdf tarzida nomlang: mos mavzuga avtomatik biriktiriladi. Hujjat/rasm 42 MB gacha; MP4 va boshqa videolar 1 GB gacha.</small>')+
  block('mine','<div class="rc-assets">'+assetRows+'</div>')+
  block('link','<label>Material nomi<input name="linkTitle" maxlength="180" placeholder="Masalan: Qo‘shimcha ma’ruza"></label><label>HTTPS manzil<input name="linkUrl" type="url" placeholder="https://..."></label>')+
  block('assignment','<label>Topshiriq turi<select name="category"><option value="assignment">Topshiriq</option><option value="independent_work">Mustaqil ish</option><option value="practice">Amaliy mashg‘ulot</option></select></label><label>Sarlavha<input name="assignmentTitle" maxlength="180"></label><label>Yo‘riqnoma<textarea name="instructions" rows="3"></textarea></label><div class="rc-fields"><label>Muddat<input type="datetime-local" name="dueAt"></label><label>Baholash<select name="maxScore"><option value="100">100 ball</option><option value="10">10 ball</option><option value="5">5 ball</option><option value="2">2 ball</option></select></label></div>')+
  block('video','<label>Videodars nomi<input name="videoTitle" maxlength="180"></label><label>Shaxsiy kutubxonadan video<select name="videoAssetId">'+selectAssets('video')+'</select></label><label>Yoki HTTPS video manzil<input name="videoUrl" type="url" placeholder="https://youtube.com/..."></label><label>Qurilmadan yuklangan muqova<select name="coverAssetId">'+selectAssets('image')+'</select></label><div class="rc-fields"><label>Modul<input name="moduleTitle" placeholder="Asosiy modul" value="Asosiy modul"></label><label>Tartib raqami<input type="number" name="sequence" min="0" max="10000" value="1"></label></div><label>Mavzu nomi<input name="topicTitle" placeholder="1-mavzu"></label><small>Video va muqovani avval «Fayl / ZIP» orqali shaxsiy kutubxonaga yuklang. Bir martalik fayl barcha tanlangan guruhda ishlatiladi.</small>')+
  '<div class="rc-target"><strong>Qaysi guruhlar va fanlarga joylansin?</strong><div class="rc-courses">'+usable.map(c=>choice(c._id,'courseIds',String(c._id)===String(courseId))).join('')+'</div></div>'+
  '<div class="rc-upload-status" id="rcUploadStatus" aria-live="polite"></div></div>';
 const progress=text=>{const el=document.getElementById('rcUploadStatus');if(el)el.textContent=text};
 async function upload(file,title){
   const body=new FormData();body.append('file',file);if(title)body.append('title',title);
   return await new Promise((resolve,reject)=>{
     const xhr=new XMLHttpRequest();const lecture=/\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);xhr.open('POST',lecture?'/api/lms/my-assets/video-upload':'/api/lms/my-assets/upload');xhr.withCredentials=true;xhr.setRequestHeader('X-CSRF-Token',csrf());
     xhr.upload.onprogress=e=>{if(e.lengthComputable)progress('Yuklanmoqda: '+Math.round(e.loaded/e.total*100)+'%')};
     xhr.onload=()=>{let x={};try{x=JSON.parse(xhr.responseText)}catch{};xhr.status>=200&&xhr.status<300?resolve(x):reject(Error(x.message||'Faylni yuklashda xatolik'))};
     xhr.onerror=()=>reject(Error('Tarmoq xatosi: faylni yuklab bo‘lmadi'));xhr.send(body);
   });
 }
 let mode=defaultMode;let busy=false;
 modal('Yagona resurslar markazi',html,async d=>{
   if(busy)throw Error('Yuklash yakunlanishini kuting');
   busy=true;
   try{
     const selected=groupIds(d.courseIds);
     if(!selected.length&&!(mode==='file'&&d.privateOnly))throw Error('Kamida bitta guruhni tanlang');
     const byCourse=topicId&&selected.includes(String(courseId))?{[courseId]:topicId}:{};
     let added=[];
     if(mode==='file'){
       const file=d.sourceFile;
       if(!(file instanceof File)||!file.size)throw Error('Faylni tanlang');
       if(file.size>(/\.(mp4|webm|mov|mkv|avi)$/i.test(file.name)?1024:42)*1024*1024)throw Error('Fayl hajmi belgilangan chegaradan oshdi');
       const x=await upload(file,String(d.assetTitle||''));added=(x.assets||[]).map(a=>a._id);
       if(d.privateOnly)return added.length+' ta fayl shaxsiy kutubxonaga saqlandi';
     }else if(mode==='mine'){
       added=groupIds(d.assetIds);
       if(!added.length)throw Error('Shaxsiy resurslardan kamida bittasini tanlang');
     }else if(mode==='link'){
       if(!String(d.linkTitle||'').trim()||!String(d.linkUrl||'').startsWith('https://'))throw Error('Nom va HTTPS havolani kiriting');
       const x=await api('/lms/my-assets/link',{method:'POST',body:JSON.stringify({title:d.linkTitle,url:d.linkUrl})});added=(x.assets||[]).map(a=>a._id);
     }else if(mode==='assignment'){
       if(!String(d.assignmentTitle||'').trim()||!String(d.instructions||'').trim())throw Error('Topshiriq nomi va yo‘riqnoma majburiy');
       for(const id of selected){
         const item=await api('/lms/courses/'+encodeURIComponent(id)+'/assignments',{method:'POST',body:JSON.stringify({title:d.assignmentTitle,category:d.category,instructions:d.instructions,dueAt:d.dueAt||undefined,maxScore:Number(d.maxScore)||100})});
         if(id===String(courseId)&&topicId)await attachTopic('assignment',item._id||item.id,topicId);
       }
       return selected.length+' ta fan uchun topshiriq yaratildi';
     }else if(mode==='video'){
       if(!String(d.videoTitle||'').trim()||(!d.videoAssetId&&!String(d.videoUrl||'').trim()))throw Error('Video nomi va fayl yoki HTTPS havolani kiriting');
       for(const id of selected){
         const c=usable.find(x=>String(x._id)===String(id));
         const row=await api('/videos',{method:'POST',body:JSON.stringify({title:d.videoTitle,courseId:id,groupIds:[c?.groupId?._id||c?.groupId].filter(Boolean),assetId:d.videoAssetId||undefined,sourceUrl:d.videoUrl||'',coverAssetId:d.coverAssetId||undefined,subject:c?.title||'',topicTitle:d.topicTitle||d.videoTitle,moduleTitle:d.moduleTitle||'Asosiy modul',sequence:Number(d.sequence)||1})});
         if(id===String(courseId)&&topicId)await attachTopic('video',row._id||row.id,topicId);
       }
       return selected.length+' ta fanga videodars biriktirildi';
     }
     progress('Fayllar guruhlarga bog‘lanmoqda…');
     const result=await api('/lms/my-assets/assign',{method:'POST',body:JSON.stringify({assetIds:added,courseIds:selected,topicsByCourse:byCourse})});
     return result.count+' ta resurs biriktirildi';
   }finally{busy=false}
 });
 const show=name=>{
   mode=name;
   document.querySelectorAll('[data-rc-mode]').forEach(section=>{
     const active=section.dataset.rcMode===name;section.hidden=!active;
     section.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=!active);
   });
   document.querySelectorAll('[data-rc-tab]').forEach(button=>{
     const selected=button.dataset.rcTab===name;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));
   });
 };
 document.querySelectorAll('[data-rc-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.rcTab)));
 show(modes.some(m=>m[0]===defaultMode)?defaultMode:'file');
}
