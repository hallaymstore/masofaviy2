// Kunlik davomat: bir kunning barcha darslari guruhlar kesimida. Nazoratchi rollar o‘z doirasini ko‘radi,
// dars o‘qituvchisi (va attendance.manage) har bir talabani qo‘lda belgilab saqlaydi.
export function createDailyAttendanceUi({api,esc,toast}){
 const STATUS={present:'Keldi',late:'Kechikdi',absent:'Kelmadi',excused:'Sababli',unmarked:'Belgilanmagan'};
 const SESSION={active:'● Jonli',ended:'Tugagan',scheduled:'Rejada'};
 const isoToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const hhmm=v=>v?new Date(v).toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'}):'';
 let container=null,timer=null,openLesson='',dirty=false,state={date:'',group:'',q:''};

 const tile=(label,value,cls='')=>'<div class="da-tile '+cls+'"><b>'+esc(value)+'</b><small>'+esc(label)+'</small></div>';
 const bar=c=>{const t=Math.max(1,c.expected);return '<div class="da-bar" aria-hidden="true">'+['present','late','excused','absent','unmarked'].map(k=>'<i class="'+k+'" style="width:'+(c[k]/t*100).toFixed(1)+'%"></i>').join('')+'</div>'};

 async function render(target){
  container=target||container;if(!container)return;
  clearInterval(timer);
  if(!state.date)state.date=isoToday();
  if(!container.querySelector('.da-controls')){
   container.innerHTML='<div class="da-controls"><label>Sana<input type="date" id="daDate"></label><label>Guruh<select id="daGroup"><option value="">Barcha guruhlar</option></select></label><label class="da-search">Qidirish<input type="search" id="daSearch" placeholder="Guruh, fan yoki o‘qituvchi"></label><button type="button" class="secondary" id="daRefresh">Yangilash</button></div><div id="daSummary" class="da-summary" role="status" aria-live="polite"></div><div id="daGroups" class="da-groups"></div>';
   const f=s=>container.querySelector(s);
   f('#daDate').value=state.date;f('#daDate').max=isoToday();
   f('#daDate').onchange=e=>{state.date=e.target.value||isoToday();openLesson='';load()};
   f('#daGroup').onchange=e=>{state.group=e.target.value;draw()};
   f('#daSearch').oninput=e=>{state.q=e.target.value.trim().toLowerCase();draw()};
   f('#daRefresh').onclick=()=>load();
  }
  await load();
  // Supervisors watch the day live; skip refreshes while a teacher has unsaved marks open.
  timer=setInterval(()=>{if(document.hidden||!container?.isConnected||!container.closest('.page.active'))return;if(!dirty)load(true)},30000);
 }

 let data=null;
 async function load(silent=false){
  const summary=container.querySelector('#daSummary');
  if(!silent)summary.textContent='Yuklanmoqda…';
  try{data=await api('/attendance/daily?date='+encodeURIComponent(state.date));draw()}
  catch(e){summary.textContent=e.message;container.querySelector('#daGroups').innerHTML=''}
 }

 function draw(){
  if(!data)return;
  const sel=container.querySelector('#daGroup'),cur=state.group;
  sel.innerHTML='<option value="">Barcha guruhlar ('+data.groups.length+')</option>'+data.groups.map(g=>'<option value="'+esc(g.group._id)+'">'+esc(g.group.name)+'</option>').join('');sel.value=cur;
  const t=data.totals;
  container.querySelector('#daSummary').innerHTML=tile('Darslar',t.lessons)+tile('Kutilgan',t.expected)+tile('Keldi',t.present,'present')+tile('Kechikdi',t.late,'late')+tile('Kelmadi',t.absent,'absent')+tile('Sababli',t.excused,'excused')+tile('Belgilanmagan',t.unmarked,'unmarked')+tile('Davomat',t.rate+'%','rate');
  const q=state.q,groups=data.groups.filter(g=>!state.group||g.group._id===state.group).map(g=>({...g,lessons:g.lessons.filter(l=>!q||[g.group.name,l.title,l.subject,l.teacher.fullName].join(' ').toLowerCase().includes(q))})).filter(g=>g.lessons.length);
  const box=container.querySelector('#daGroups');
  if(!groups.length){box.innerHTML='<p class="da-empty">'+(data.groups.length?'Filtr bo‘yicha dars topilmadi.':'Bu sana uchun jadvalda dars yo‘q.')+'</p>';return}
  box.innerHTML=groups.map(g=>'<article class="da-group"><header><h3>'+esc(g.group.name)+'</h3><small>'+esc(g.students)+' talaba · '+esc(g.lessons.length)+' dars</small></header>'+g.lessons.map(l=>{const c=l.counts;return '<div class="da-lesson'+(openLesson===l.scheduleId?' open':'')+'" data-lesson="'+esc(l.scheduleId)+'"><button type="button" class="da-lesson-head" data-open-lesson="'+esc(l.scheduleId)+'" aria-expanded="'+(openLesson===l.scheduleId)+'"><span class="da-time">'+esc(l.start)+'–'+esc(l.end)+'</span><span class="da-title"><b>'+esc(l.title)+'</b><small>'+esc(l.teacher.fullName)+(l.room?' · '+esc(l.room):'')+'</small></span><span class="da-session '+esc(l.session?.status||'none')+'">'+esc(SESSION[l.session?.status]||'Boshlanmagan')+'</span><span class="da-counts"><b>'+esc(c.present+c.late)+'/'+esc(c.expected)+'</b><small>'+esc(c.rate)+'%'+(c.unmarked?' · '+esc(c.unmarked)+' belgilanmagan':'')+(c.manual?' · ✍ '+esc(c.manual):'')+'</small></span>'+bar(c)+'</button><div class="da-detail" id="da-detail-'+esc(l.scheduleId)+'"></div></div>'}).join('')+'</article>').join('');
  box.querySelectorAll('[data-open-lesson]').forEach(b=>b.onclick=()=>toggle(b.dataset.openLesson));
  if(openLesson)showLesson(openLesson);
 }

 async function toggle(id){
  if(dirty&&openLesson&&openLesson!==id&&!confirm('Saqlanmagan belgilar bor. Baribir boshqa darsni ochasizmi?'))return;
  dirty=false;openLesson=openLesson===id?'':id;draw();
 }

 async function showLesson(id){
  const box=container.querySelector('#da-detail-'+CSS.escape(id));if(!box)return;
  if(dirty&&box.querySelector('.da-students'))return; // keep unsaved marks on silent refresh
  box.innerHTML='<p class="da-empty">Talabalar yuklanmoqda…</p>';
  try{
   const x=await api('/attendance/daily/'+encodeURIComponent(id)+'?date='+encodeURIComponent(state.date));
   const opts=s=>['present','late','absent','excused'].map(k=>'<option value="'+k+'"'+(s===k?' selected':'')+'>'+STATUS[k]+'</option>').join('');
   box.innerHTML=(x.canEdit?'<div class="da-actions"><button type="button" class="secondary" data-da-all="present">Hammasi keldi</button><button type="button" class="secondary" data-da-unmarked="absent">Belgilanmaganlar → kelmadi</button><input type="text" maxlength="300" class="da-note" placeholder="Izoh (ixtiyoriy)"><button type="button" class="primary" data-da-save>Saqlash</button></div>':'<p class="da-readonly">Faqat ko‘rish: belgilashni dars o‘qituvchisi yoki davomat mas’uli bajaradi.</p>')+
    '<table class="da-students"><thead><tr><th>#</th><th>Talaba</th><th>Holat</th><th>Darsda</th><th>Belgi</th></tr></thead><tbody>'+x.students.map((s,i)=>'<tr data-student="'+esc(s._id)+'" class="'+esc(s.status)+'"><td>'+(i+1)+'</td><td><b>'+esc(s.fullName)+'</b><small>'+esc(s.login)+'</small></td><td>'+(x.canEdit?'<select data-da-status aria-label="'+esc(s.fullName)+' holati">'+(s.status==='unmarked'?'<option value="" selected>— Belgilanmagan —</option>':'')+opts(s.status)+'</select>':'<span class="da-chip '+esc(s.status)+'">'+esc(STATUS[s.status]||s.status)+'</span>')+'</td><td>'+(s.joinedAt?esc(hhmm(s.joinedAt))+(s.leftAt?'–'+esc(hhmm(s.leftAt)):'')+' · ':'')+esc(s.minutes)+' daq</td><td>'+(s.manual?'✍ '+esc(s.manualMarkedBy||'qo‘lda')+' '+esc(hhmm(s.manualMarkedAt)):'Avto')+'</td></tr>').join('')+'</tbody></table>';
   if(!x.canEdit)return;
   const rows=()=>[...box.querySelectorAll('tr[data-student]')];
   box.querySelector('tbody').onchange=e=>{if(e.target.matches('[data-da-status]')){dirty=true;e.target.closest('tr').className=e.target.value||'unmarked';box.querySelector('[data-da-save]').classList.add('needs-save')}};
   box.querySelector('[data-da-all]').onclick=()=>{rows().forEach(r=>{const s=r.querySelector('select');s.value='present';r.className='present'});dirty=true};
   box.querySelector('[data-da-unmarked]').onclick=()=>{rows().forEach(r=>{const s=r.querySelector('select');if(!s.value){s.value='absent';r.className='absent'}});dirty=true};
   box.querySelector('[data-da-save]').onclick=async e=>{
    const records=rows().map(r=>({studentId:r.dataset.student,status:r.querySelector('select').value})).filter(r=>r.status);
    if(!records.length)return toast('Hech kim belgilanmagan');
    e.target.disabled=true;
    try{const r=await api('/attendance/daily/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify({date:state.date,records,note:box.querySelector('.da-note')?.value||''})});dirty=false;toast('Davomat saqlandi: '+r.saved+' ta o‘zgarish');await load(true)}
    catch(err){toast(err.message)}finally{e.target.disabled=false}
   };
  }catch(e){box.innerHTML='<p class="da-empty">'+esc(e.message)+'</p>'}
 }
 return {render,stop:()=>clearInterval(timer)};
}
