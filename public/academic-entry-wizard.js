export function createAcademicEntryWizard({api,esc,modal,toast,reloadCourses,reloadSchedules}){
 const opt=(id,label)=>'<option value="'+esc(id)+'">'+esc(label)+'</option>';
 async function addSubject(){
  modal('Fanlar katalogi · yangi fan','<p>Fanni bir marta kiriting. Keyin guruh va o‘qituvchilarga ro‘yxatdan biriktirasiz.</p><label>Fan nomi<input name="title" required minlength="3" placeholder="Masalan: Statistika nazariyasi"></label><label>Fan kodi<input name="code" required minlength="2" maxlength="40" placeholder="STAT-101"></label><label>Tavsif<textarea name="description"></textarea></label>',async d=>{await api('/lms/subjects',{method:'POST',body:JSON.stringify(d)});toast('Fan katalogga qo‘shildi. Endi guruh va o‘qituvchiga biriktiring.');setTimeout(()=>addCourse(),60)});
 }
 async function addCourse(){
  try{
   const setup=await api('/lms/setup-options');const {subjects,groups,teachers}=setup;
   if(!subjects.length){toast('Avval fanlar katalogiga fan kiriting');return addSubject()}
   if(!groups.length||!teachers.length)return toast('Avval guruh va o‘qituvchini kiriting');
   modal('2-qadam: Fan → guruh → o‘qituvchi',
    '<p>Fan nomini qo‘lda yozmang — katalogdan tanlang.</p><label>Fan<select name="subjectId" required>'+subjects.map(x=>opt(x._id,x.title+' · '+x.code)).join('')+'</select></label>'+
    '<label>Guruh<select name="groupId" required>'+groups.filter(x=>x.active).map(x=>opt(x._id,x.name+' · '+(x.externalId||x.code||''))).join('')+'</select></label>'+
    '<label>O‘qituvchi<select name="teacherId" required>'+teachers.filter(x=>x.active!==false).map(x=>opt(x._id,x.fullName+' (@'+x.login+')')).join('')+'</select></label>'+
    '<label>Ta’lim tili<select name="language"><option value="uz">O‘zbekcha</option><option value="ru">Ruscha</option><option value="en">Inglizcha</option></select></label>'+
    '<label>Kredit<input name="credits" type="number" min="0" max="100" value="0"></label>'+
    '<label>Fan dasturi havolasi<input name="syllabusUrl" type="url" placeholder="https://..."></label>',
    async d=>{await api('/lms/courses',{method:'POST',body:JSON.stringify(d)});toast('Fan biriktirildi');await reloadCourses()});
  }catch(e){toast(e.message)}
 }
 async function addSchedule(){
  try{
   const [courses,meta]=await Promise.all([api('/lms/courses'),api('/edu/meta').catch(()=>null)]);
   if(!courses.length)return toast('Avval Fanlar va vazifalar → Fan katalogi → Fanni biriktirish orqali fan yarating');
   // Retrieve only topics belonging to the selected course, not the first 500 site-wide videos.
   const variants=courses.map(c=>({id:String(c._id),title:c.title,group:c.groupId?.name||'',teacher:c.teacherId?.fullName||'',form:c.groupId?.educationForm||'kunduzgi'}));
   const formLabel=f=>meta?.forms?.[f]?.label||f;
   const options=variants.map(c=>opt(c.id,c.title+' · '+c.group+' · '+c.teacher)).join('');
   const days=['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];
   modal('Dars jadvaliga qo‘shish','<p>Fan biriktirilgan guruh va o‘qituvchi avtomatik olinadi. Dars mavzusini shu fan resurslaridan tanlang.</p>'+
    '<label>Biriktirilgan fan<select name="courseId" required id="entryCourse">'+options+'</select></label>'+
    '<label>Mavzu / resurs<select name="topicId" id="entryTopic"><option value="">Fan nomi bilan dars ochish</option></select></label>'+
    '<label>Dars shakli<select name="mode" id="entryMode"><option value="offline">🏫 Auditoriyada (QR yoki ro‘yxat bo‘yicha davomat)</option><option value="online">🎥 Onlayn (jonli dars xonasi)</option><option value="hybrid">🔀 Gibrid (auditoriya + jonli efir)</option></select></label>'+
    '<label>Hafta kuni<select name="weekday">'+days.map((x,i)=>opt(i+1,x)).join('')+'</select></label>'+
    '<label>Para <small id="entryForm"></small><select id="entryPara"><option value="">Vaqtni qo‘lda kiritish</option></select></label>'+
    '<label>Boshlanish<input name="start" type="time" value="09:00" required></label><label>Tugash<input name="end" type="time" value="10:20" required></label>'+
    '<label>Xona<input name="room" placeholder="Ixtiyoriy"></label>'+
    '<label>Turi<select name="kind"><option value="lecture">Ma’ruza</option><option value="practice">Amaliyot</option><option value="seminar">Seminar</option><option value="exam">Nazorat</option></select></label>',
    async d=>{d.weekday=Number(d.weekday);await api('/schedules',{method:'POST',body:JSON.stringify(d)});toast('Dars jadvalga qo‘shildi');await reloadSchedules()});
   const courseSelect=document.querySelector('#entryCourse'),topicSelect=document.querySelector('#entryTopic');
   const populate=async()=>{
    const id=courseSelect.value;topicSelect.innerHTML='<option value="">Fan nomi bilan dars ochish</option>';
    const rows=await api('/lms/course-topics/'+encodeURIComponent(id)).catch(()=>[]);
    const topics=rows.map(x=>({id:x._id,title:x.title,kind:x.source==='video'?'Video':'Resurs'}));
    topicSelect.innerHTML+=[...new Map(topics.map(t=>[String(t.id),t])).values()].map(t=>opt(t.id,t.kind+' · '+t.title)).join('');
   };
   const modeSelect=document.querySelector('#entryMode'),paraSelect=document.querySelector('#entryPara'),formNote=document.querySelector('#entryForm');
   const startInput=document.querySelector('[name=start]'),endInput=document.querySelector('[name=end]');
   // Bell schedule of the group's form of study: kunduzgi / kechki / sirtqi / masofaviy.
   const syncForm=()=>{const v=variants.find(x=>x.id===courseSelect.value),form=v?.form||'kunduzgi',list=meta?.bells?.[form]||[];
     if(formNote)formNote.textContent='· '+formLabel(form)+' ta’lim';if(modeSelect)modeSelect.value=form==='masofaviy'?'online':'offline';
     if(paraSelect){paraSelect.innerHTML='<option value="">Vaqtni qo‘lda kiritish</option>'+list.map((p,i)=>opt(i,(i+1)+'-para · '+p[0]+'–'+p[1])).join('');if(list.length){paraSelect.value='0';startInput.value=list[0][0];endInput.value=list[0][1]}}};
   paraSelect?.addEventListener('change',()=>{const v=variants.find(x=>x.id===courseSelect.value),p=(meta?.bells?.[v?.form||'kunduzgi']||[])[Number(paraSelect.value)];if(p&&paraSelect.value!==''){startInput.value=p[0];endInput.value=p[1]}});
   syncForm();
   courseSelect?.addEventListener('change',()=>{syncForm();populate().catch(e=>toast(e.message))});
   await populate();
  }catch(e){toast(e.message)}
 }
 return {addSubject,addCourse,addSchedule};
}
