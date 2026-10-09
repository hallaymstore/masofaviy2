// Coursework UI for HALLAYM EDU, loaded only on the existing courses page.
export function createCourseworkUi({api,esc,csrf,toast,modal}){
 const $=q=>document.querySelector(q);
 const btn=(label,attrs='')=>'<button type="button" '+attrs+'>'+esc(label)+'</button>';
 const isManager=role=>['teacher','admin','superadmin'].includes(role);
 const allowJournal=role=>['teacher','admin','superadmin','rectorate','dean','department','tutor'].includes(role);
 const date=d=>d?new Date(d).toLocaleString('uz-UZ'):'—';
 const fileLink=f=>'<a href="/api/coursework/files/'+encodeURIComponent(f._id)+'" download rel="noopener">'+esc(f.name)+' · '+Math.ceil(f.size/1024)+' KB ↧</a>';
 const upload=(assignmentId,selectedFile)=>new Promise((resolve,reject)=>{
  if(!(selectedFile instanceof File)||!selectedFile.size)return reject(Error('Fayl tanlang'));
  if(selectedFile.size>100*1024*1024)return reject(Error('Fayl 100 MB dan oshmasin'));
  const fd=new FormData();fd.append('file',selectedFile);
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/coursework/assignments/'+encodeURIComponent(assignmentId)+'/files');
  xhr.withCredentials=true;xhr.setRequestHeader('X-CSRF-Token',csrf());
  xhr.upload.onprogress=e=>{const status=$('#courseworkStatus');if(e.lengthComputable&&status)status.textContent='Yuklanmoqda: '+Math.round(e.loaded/e.total*100)+'%'};
  xhr.onload=()=>{let obj={};try{obj=JSON.parse(xhr.responseText||'{}')}catch{};xhr.status>=200&&xhr.status<300?resolve(obj):reject(Error(obj.message||'Yuklashda xato'))};
  xhr.onerror=()=>reject(Error('Fayl yuklanmadi'));xhr.send(fd);
 });
 async function refreshCourse(id,role,container){
  if(!container)return;
  const x=await api('/lms/courses/'+id);
  const assignments=x.assignments||[];
  const editor=isManager(role),teacherView=editor||['rectorate','dean','department','tutor'].includes(role);
  container.innerHTML='<h3>📚 Vazifalar · fayllar · baholar</h3><p class="muted">Fayllar faqat o‘z faningiz/guruhingiz doirasida. Har bir topshiriqqa 8 tagacha fayl (100 MB gacha).</p><p id="courseworkStatus" role="status"></p>'+
    (assignments.length?assignments.map(a=>'<details class="coursework-task"><summary><b>'+esc(a.title)+'</b><span>'+esc(a.maxScore||100)+' ball · '+esc(date(a.dueAt))+'</span></summary><p>'+esc(a.instructions)+'</p><div id="coursework-'+esc(a._id)+'">Fayllar va javoblar yuklanmoqda…</div></details>').join(''):'<p>Hali vazifa kiritilmagan.</p>');
  for(const a of assignments){
   const panel=$('#coursework-'+CSS.escape(String(a._id)));
   if(!panel)continue;
   const files=await api('/coursework/assignments/'+a._id+'/files');
   let content='<div class="coursework-files">'+(files.filter(f=>!f.submissionId).map(fileLink).join('')||'<small>Topshiriq fayllari yo‘q</small>')+'</div>';
   if(editor||role==='student')content+='<label class="coursework-upload">📎 '+(editor?'Vazifaga fayl qo‘shish':'Javob faylini yuborish')+' <input data-coursework-file="'+esc(a._id)+'" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.webm,.mov,.mkv,.avi,.zip,.rar,.7z,.odt,.ods,.odp,.epub,.srt,.vtt"></label>';
   if(role==='student')content+='<button data-coursework-answer="'+esc(a._id)+'">✍️ Javob yozish / havola</button>';
   const submissions=await api('/lms/assignments/'+a._id+'/submissions');
   if(teacherView||role==='student')content+='<div class="coursework-submissions">'+(submissions.length?submissions.map(s=>{
    const user=s.studentId||{},sid=String(s._id);
    const attachments=files.filter(f=>String(f.submissionId||'')===sid);
    return '<div class="coursework-sub"><div><b>'+esc(user.fullName||'Javob')+'</b><small>'+esc(date(s.submittedAt))+' · '+(s.gradedAt?esc(s.score)+'/'+esc(a.maxScore||100)+' ball':'Baholanmagan')+'</small><p>'+esc(s.text||'')+'</p>'+(s.feedback?'<small>O‘qituvchi izohi: '+esc(s.feedback)+'</small>':'')+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Havola ↗</a>':'')+'</div><div>'+attachments.map(fileLink).join('')+'</div>'+(editor&&!s.gradedAt?btn('Baholash','data-coursework-grade="'+esc(sid)+'" data-scale="'+esc(a.maxScore||100)+'"'):'')+'</div>';
   }).join(''):'<small>Javoblar yo‘q</small>')+'</div>';
   panel.innerHTML=content;
   panel.querySelector('[data-coursework-file]')?.addEventListener('change',async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{await upload(a._id,f);toast('Fayl saqlandi');await refreshCourse(id,role,container)}catch(err){toast(err.message)}
   });
   panel.querySelector('[data-coursework-answer]')?.addEventListener('click',()=>modal('Topshiriqqa javob','<label>Matn<textarea name="text" rows="5"></textarea></label><label>HTTPS havola<input name="url" type="url"></label>',async d=>{
    await api('/lms/assignments/'+a._id+'/submit',{method:'POST',body:JSON.stringify(d)});await refreshCourse(id,role,container);
   }));
   panel.querySelectorAll('[data-coursework-grade]').forEach(b=>b.onclick=()=>modal('Javobni baholash · '+b.dataset.scale+' ball','<label>Ball (0–'+esc(b.dataset.scale)+')<input name="score" type="number" min="0" max="'+esc(b.dataset.scale)+'" step="0.01" required></label><label>Izoh<textarea name="feedback"></textarea></label>',async d=>{
    await api('/lms/submissions/'+b.dataset.courseworkGrade+'/grade',{method:'PATCH',body:JSON.stringify(d)});
    await refreshCourse(id,role,container);
   }));
  }
 }
 async function journals(container,role,courseId=''){
  if(!container||!allowJournal(role))return;
  const query=selector=>container.querySelector(selector);
  const choices=await api('/coursework/journals'+(courseId?'?courseId='+encodeURIComponent(courseId):''));
  if(!choices.length){container.innerHTML='<p>Vakolatingiz doirasida jurnal fanlari topilmadi.</p>';return}
  container.innerHTML='<div class="coursework-journal-head"><h3>📊 Elektron jurnal</h3><label>Guruh / fan<select id="journalCourse">'+choices.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.group.name)+' · '+esc(c.title)+'</option>').join('')+'</select></label><label>Davr<select id="journalPeriod"><option value="week">Haftalik</option><option value="month">Oylik</option></select></label><label>Sana<input id="journalDate" type="date"></label><button id="journalApply" class="primary">Ko‘rsatish</button><button id="journalCsv">CSV ↓</button></div><div id="journalResult"></div>';
  if(courseId)query('#journalCourse').value=courseId;
  const getUrl=(csv=false)=>'/coursework/journal/'+encodeURIComponent(query('#journalCourse').value)+'?period='+encodeURIComponent(query('#journalPeriod').value)+(query('#journalDate').value?'&from='+encodeURIComponent(query('#journalDate').value):'')+(csv?'&format=csv':'');
  const load=async()=>{
   try{
    const data=await api(getUrl()),el=query('#journalResult');
    const hdr='<th>Talaba</th>'+data.columns.map(c=>'<th>'+esc(c.title)+'<small>'+esc(c.scale)+' ball</small></th>').join('')+'<th>Topshirdi</th><th>Baholandi</th><th>O‘rtacha</th>';
    el.innerHTML='<p><b>'+esc(data.group.name)+'</b> · '+esc(data.course.title)+' · '+esc(data.period.label)+' · '+data.stats.total+' talaba</p><div class="coursework-table-scroll"><table class="coursework-table"><thead><tr>'+hdr+'</tr></thead><tbody>'+data.rows.map(row=>'<tr><td><b>'+esc(row.student.fullName)+'</b><small>'+esc(row.student.login)+'</small></td>'+row.marks.map(m=>'<td>'+esc(m.status==='graded'?m.score+'/'+m.scale:m.status==='submitted'?'Topshirgan':m.status==='late'?'Kechikkan':'—')+'</td>').join('')+'<td>'+row.submitted+'</td><td>'+row.graded+'</td><td>'+esc(row.averagePercent==null?'—':row.averagePercent+'%')+'</td></tr>').join('')+'</tbody></table></div>';
   }catch(e){query('#journalResult').textContent=e.message;toast(e.message)}
  };
  query('#journalApply').onclick=load;
  query('#journalCsv').onclick=()=>{window.location.href='/api'+getUrl(true)};
  await load();
 }
 return {refreshCourse,journals,allowJournal};
}
