// Read-only personal grade views. Server ignores arbitrary student IDs and scopes data to the session.
export const localGradeDate=(date)=>date?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date)):'';
export function createPersonalGradesUi({api,esc,onOpenCourses=()=>{},onOpenGrades=()=>{}}){
 const dateText=date=>date?new Date(date).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
 const cards=(rows)=>rows.map(r=>{
   const done=r.status==='graded';
   const color=done?'graded':'pending';
   return '<article class="personal-grade-item '+color+'"><div class="personal-grade-item-head"><div><b>'+esc(r.courseTitle)+'</b><small>'+esc(r.assignmentTitle)+(r.teacherName?' · Fan o‘qituvchisi: '+esc(r.teacherName):'')+'</small></div><span class="personal-grade-score">'+(done?esc(r.score)+' / '+esc(r.scale):'Tekshirilmoqda')+'</span></div>'+
     '<div class="personal-grade-meta"><span>📅 '+esc(dateText(done?r.gradedAt:r.submittedAt))+'</span><span>'+(done?esc(r.percent)+'% · Baholangan':'Javob topshirilgan')+'</span></div>'+
     (done&&r.feedback?'<p class="personal-grade-feedback"><b>O‘qituvchi izohi:</b> '+esc(r.feedback)+'</p>':'')+'</article>';
 }).join('');
 async function page(container){
   if(!container)return;
   container.innerHTML='<div class="personal-grade-toolbar"><label>Davr<select id="myGradesPeriod"><option value="all">Barcha baholar</option><option value="week">Haftalik</option><option value="month">Oylik</option></select></label><label>Sana<input type="date" id="myGradesDate" disabled></label><label>Fan<select id="myGradesCourse"><option value="">Barcha fanlar</option></select></label><label>Holat<select id="myGradesStatus"><option value="all">Hammasi</option><option value="graded">Baholangan</option><option value="pending">Tekshirilmoqda</option></select></label><button type="button" id="myGradesApply">Ko‘rsatish</button></div><div id="myGradesBody" role="region" aria-live="polite">Baholar yuklanmoqda…</div>';
   const find=q=>container.querySelector(q);
   let data=null;
   const filter=()=>{
     if(!data)return;
     const byCourse=find('#myGradesCourse').value,byStatus=find('#myGradesStatus').value;
     const rows=data.rows.filter(r=>(!byCourse||r.courseId===byCourse)&&(byStatus==='all'||r.status===byStatus));
     const graded=rows.filter(r=>r.status==='graded');
     const avg=graded.length?Math.round(graded.reduce((s,r)=>s+Number(r.percent||0),0)/graded.length*100)/100:null;
     find('#myGradesBody').innerHTML='<div class="personal-grade-stats"><div><b>'+graded.length+'</b><span>Baholangan</span></div><div><b>'+rows.filter(r=>r.status==='pending').length+'</b><span>Tekshirilmoqda</span></div><div><b>'+(avg===null?'—':esc(avg)+'%')+'</b><span>O‘rtacha natija</span></div></div>'+
       '<p class="personal-grades-note">Baho qo‘yilgan sana bo‘yicha ko‘rsatiladi. O‘rtacha foiz faqat baholangan topshiriqlar asosida hisoblanadi.</p>'+
       (data.truncated?'<p class="personal-grades-note">Natijalar ko‘p: faqat oxirgi 800 ta javob chiqarildi.</p>':'')+
       (rows.length?'<div class="personal-grade-list">'+cards(rows)+'</div>':'<div class="personal-grade-empty"><b>Hozircha baholar yo‘q</b><p>O‘qituvchi baho qo‘yganda shu yerda ko‘rinadi. Topshirilgan javoblar baholanguncha «Tekshirilmoqda» bo‘ladi.</p><button type="button" id="goCourseworkFromGrades">Vazifalarimni ochish →</button></div>');
     find('#goCourseworkFromGrades')?.addEventListener('click',onOpenCourses);
   };
   const reload=async()=>{
     const period=find('#myGradesPeriod').value,date=find('#myGradesDate').value;
     find('#myGradesBody').textContent='Baholar yuklanmoqda…';
     try{
       data=await api('/coursework/my-grades?period='+encodeURIComponent(period)+(period!=='all'&&date?'&from='+encodeURIComponent(date):''));
       const selected=find('#myGradesCourse').value;
       const unique=[...new Map(data.rows.map(r=>[r.courseId,{id:r.courseId,name:r.courseTitle}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
       find('#myGradesCourse').innerHTML='<option value="">Barcha fanlar</option>'+unique.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
       if(unique.some(c=>c.id===selected))find('#myGradesCourse').value=selected;
       filter();
     }catch(e){find('#myGradesBody').textContent=e.message}
   };
   find('#myGradesPeriod').addEventListener('change',()=>{find('#myGradesDate').disabled=find('#myGradesPeriod').value==='all';reload()});
   find('#myGradesCourse').addEventListener('change',filter);
   find('#myGradesStatus').addEventListener('change',filter);
   find('#myGradesApply').addEventListener('click',reload);
   await reload();
 }
 async function schedule(container){
   if(!container)return;
   container.hidden=false;
   container.innerHTML='<div class="personal-grades-schedule-head"><b>★ Shu hafta qo‘yilgan baholarim</b><button type="button" data-open-my-grades>Barcha baholar →</button></div><p class="personal-grades-note">Baholar dars kuni emas, o‘qituvchi baholagan sana bo‘yicha chiqadi.</p><div class="personal-weekly-grades">Yuklanmoqda…</div>';
   container.querySelector('[data-open-my-grades]')?.addEventListener('click',onOpenGrades);
   try{
     const result=await api('/coursework/my-grades?period=week');
     const graded=(result.rows||[]).filter(r=>r.status==='graded');
     const box=container.querySelector('.personal-weekly-grades');
     if(!graded.length){box.innerHTML='<div class="personal-grade-empty">Bu hafta hali baho qo‘yilmagan.</div>';return}
     const dates=new Map();
     for(const r of graded){const day=localGradeDate(r.gradedAt);if(!dates.has(day))dates.set(day,[]);dates.get(day).push(r)}
     const today=localGradeDate(new Date());
     const weekdays=['Yak','Dush','Sesh','Chor','Pay','Jum','Shan'];
     box.innerHTML=[...dates.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,rows])=>{
       const d=new Date(day+'T12:00:00+05:00');
       return '<div class="personal-weekly-day '+(day===today?'today':'')+'"><div class="personal-weekly-date"><b>'+esc(weekdays[d.getUTCDay()])+'</b><small>'+esc(day.slice(5))+'</small></div><div class="personal-weekly-marks">'+rows.map(r=>'<div><b>'+esc(r.courseTitle)+'</b><span>'+esc(r.score)+'/'+esc(r.scale)+'</span><small>'+esc(r.assignmentTitle)+'</small></div>').join('')+'</div></div>';
     }).join('');
   }catch(e){container.querySelector('.personal-weekly-grades').textContent='Baholarni yuklab bo‘lmadi: '+e.message}
 }
 return {page,schedule};
}
