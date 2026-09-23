const $=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)]; let user=null, structureType='faculty', cache={structure:[],analyticsStructures:[]}, effectivePermissions=[], socket=null, activeLessonId='', reportAttendanceCache=[], mediaRoomClient=null, activeLiveSession=null, videoLessonsCache=[], activeVideoId='', commentReplyTo=null;
localStorage.removeItem('token');
const lowEndUI=Boolean((navigator.deviceMemory&&navigator.deviceMemory<=2)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=2)||!window.SVGSVGElement);
const roleName={superadmin:'Bosh administrator',admin:'Administrator',tech:'Texnik xodim',rectorate:'Rektorat',dean:'Dekan',department:'Kafedra mudiri',teacher:'O‘qituvchi',student:'Talaba',tutor:'Tyutor'};
const can=p=>effectivePermissions.includes('*')||effectivePermissions.includes(p);
const csrf=()=>document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('m2_csrf='))?.slice('m2_csrf='.length)||'';
const api=async(path,options={})=>{const r=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf(),...options.headers}});const data=await r.json().catch(()=>({}));if(r.status===401){logout();throw Error(data.message)}if(!r.ok)throw Error(data.message||'Xatolik');return data};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}; const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const iconPaths={home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',chart:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',building:'<path d="M4 21V7l8-4 8 4v14"/><path d="M8 10h2M14 10h2M8 14h2M14 14h2M9 21v-4h6v4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>',library:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8M8 12h6"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',camera:'<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9H3V9a2 2 0 0 1 2-2h3l1.5-3z"/><circle cx="12" cy="12" r="3"/>',refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>',plus:'<path d="M12 5v14M5 12h14"/>',back:'<path d="m15 18-6-6 6-6"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',screen:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',phoneOff:'<path d="M3 3l18 18"/><path d="M16 16.7c-4.6 1.2-9.3-3.4-8-8L5.4 6.1 2 8c0 7.7 6.3 14 14 14l1.9-3.4z"/>',send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',play:'<path d="m9 7 8 5-8 5z"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',cap:'<path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12.5V17c3.5 2 8.5 2 12 0v-4.5"/><path d="M22 10v6"/>',book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8M8 12h6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',external:'<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>'};
function icon(name,fallback='•'){if(lowEndUI)return '<span class="fallback-icon" aria-hidden="true">'+esc(fallback)+'</span>';return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[name]||iconPaths.home)+'</svg>'}
function hydrateIcons(root=document){root.querySelectorAll?.('[data-ico]').forEach(function(el){el.innerHTML=icon(el.dataset.ico,el.dataset.fallback||'•')})}
function logout(){fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf()}}).catch(()=>{});user=null;socket?.disconnect();$('#shell').classList.add('hidden');$('#login').classList.remove('hidden')}
function configureRoleUI(){const role=user.role;$('#roleLabel').textContent=roleName[role]||role;$('#headerName').textContent=user.fullName||user.login||'';const show={analytics:can('analytics.view'),structure:can('structure.manage')||['dean','department'].includes(role),users:can('users.manage'),reports:can('reports.view'),live:['teacher','student'].includes(role)||can('lessons.monitor')||can('lessons.support')||can('live.manage'),videos:can('videos.view')||can('videos.manage')||can('videos.upload'),courses:['student','teacher','admin','superadmin'].includes(role)};Object.entries(show).forEach(([page,ok])=>{const b=$(`nav button[data-page="${page}"]`);if(b)b.classList.toggle('hidden',!ok)});$('#addCourse')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#reviewGrades')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#myAcademic')?.classList.toggle('hidden',role!=='student');$('#manageAcademic')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#dashboardAddSchedule')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleAdminActions')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleFilters')?.classList.toggle('hidden',!can('schedule.manage'));$('#usersAdminActions')?.classList.toggle('hidden',!can('users.manage'));$('#addStructure')?.classList.toggle('hidden',!can('structure.manage'));$('#onlinePanel')?.classList.toggle('hidden',!can('lessons.monitor'));$('#addVideoLesson')?.classList.toggle('hidden',!(can('videos.manage')||can('videos.upload')));hydrateIcons();}
function go(id){all('.page').forEach(x=>x.classList.toggle('active',x.id===id));all('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));$('#sidebar').classList.remove('open');({dashboard:loadDashboard,analytics:loadAnalytics,structure:loadStructure,schedule:loadSchedules,users:loadUsers,live:loadLiveRooms,videos:loadVideoLessons,courses:loadCourses,reports:loadReports,profile:loadProfile}[id]||(()=>{}))();hydrateIcons()}
async function start(){try{const x=await api('/me');user=x.user;effectivePermissions=x.effectivePermissions||[];$('#login').classList.add('hidden');$('#shell').classList.remove('hidden');configureRoleUI();hydrateIcons();await loadDashboard();connectSocket();const deep=location.hash.startsWith('#video=')?decodeURIComponent(location.hash.slice(7)):'';if(deep&&!user.mustChangePassword){await loadVideoLessons();await openVideoLesson(deep,false)}if(user.mustChangePassword&&user._id!=='demo')setTimeout(()=>{go('profile');toast('Xavfsizlik uchun vaqtinchalik parolni almashtiring')},250)}catch{logout()}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});start()}catch(err){$('#loginError').textContent=err.message}};
all('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));all('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$('#logoutBtn').onclick=logout;$('#profileBtn').onclick=()=>go('profile');$('#themeBtn').onclick=()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'':'dark';localStorage.theme=dark?'':'dark'};document.documentElement.dataset.theme=localStorage.theme||'';
async function loadDashboard(){
  const x=await api('/dashboard'),role=x.role||user.role;
  const cfg=role==='teacher'?['O‘qituvchi ish stoli','Bugungi darslaringiz, guruhlaringiz va davomat holati','Darsdan oldin kamera, mikrofon va materiallarni tekshirib oling.']:role==='student'?['Talaba bosh sahifasi','Bugungi darslar va shaxsiy davomat ko‘rsatkichlaringiz','Jadvaldagi dars vaqtini tekshiring va mashg‘ulotdan oldin tayyor bo‘ling.']:['Boshqaruv markazi',x.scope?x.scope+' bo‘yicha bugungi ta’lim jarayoni':'Bugungi ta’lim jarayonini bir joydan kuzating','Avval tuzilma va akkauntlarni tayyorlang, so‘ng jadvalni biriktiring.'];
  $('#dashboardTitle').textContent=cfg[0];$('#dashboardSubtitle').textContent=cfg[1];$('#dashboardGuide').textContent=cfg[2];
  $('#stats').innerHTML=(x.stats||[]).map(i=>'<div class="stat"><b>'+esc(i.value)+'</b><span>'+esc(i.label)+'</span></div>').join('');
  $('#todayLessons').innerHTML=(x.today||[]).slice(0,8).map(scheduleRow).join('')||'<p>Bugun uchun dars topilmadi.</p>';bindScheduleActions();
  const q=$('#quickManagement');
  q.innerHTML=role==='teacher'?'<button data-go="schedule"><b>'+icon('calendar','📅')+' Mening jadvalim</b><span>Haftalik darslaringiz</span></button><button data-go="live"><b>'+icon('video','🎥')+' Guruh darslari</b><span>Jonli xonalarni boshlash va boshqarish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Videodarslar</b><span>Kurs va guruhlarga materiallar</span></button>':role==='student'?'<button data-go="schedule"><b>'+icon('calendar','📅')+' Dars jadvalim</b><span>Guruhingiz haftalik rejasi</span></button><button data-go="live"><b>'+icon('video','🎥')+' Jonli darslar</b><span>Faqat o‘z guruhingiz xonasiga kirish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Tavsiya videolar</b><span>Kurs va yo‘nalishingizga mos</span></button>':'<button data-go="analytics"><b>'+icon('chart','📈')+' Statistika markazi</b><span>Davomat, guruh va o‘qituvchi ko‘rsatkichlari</span></button><button data-go="live"><b>'+icon('video','🎥')+' Jonli guruhlar</b><span>Parallel darslarni real vaqtda ko‘rish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Videodarslar</b><span>Kurs va yo‘nalishlarga kontent</span></button>';
  q.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));hydrateIcons(q);
  const health=$('#dashboardHealth');
  if(['superadmin','admin','tech'].includes(role)){
    try{const m=await api('/system/metrics');health.classList.remove('hidden');health.innerHTML='<b>Tizim holati:</b><span>DB: '+esc(m.database)+'</span><span>Onlayn: '+esc(m.onlineUsers)+'</span><span>Jonli guruhlar: '+esc(m.activeLiveRooms||0)+'</span><span>Socket: '+esc(m.socketConnections)+'</span><span>RAM: '+esc(m.memory?.rssMB||0)+' MB</span><span>Uptime: '+esc(Math.floor((m.uptimeSeconds||0)/60))+' daqiqa</span>'}catch{health.classList.add('hidden')}
  }else health.classList.add('hidden');
}
function scheduleRow(i){
  const group=i.groupId?.name||'',gid=i.groupId?.externalId||i.groupId?.code||'',teacher=i.teacherId?.fullName||'',canJoin=['teacher','student'].includes(user?.role)||can('lessons.monitor');
  let actions='';
  if(canJoin&&i.kind!=='final_exam')actions+='<button class="join-btn" data-join-lesson="'+esc(i._id)+'">Kirish</button>';
  if(can('schedule.manage'))actions+='<button class="ghost danger-text" data-del-schedule="'+esc(i._id)+'">O‘chirish</button>';
  return '<div class="lesson-row"><time>'+esc(i.start)+'–'+esc(i.end)+'</time><div><b>'+esc(i.title)+'</b><small>'+esc(i.subject||'')+(group?' · '+esc(group):'')+(gid?' ['+esc(gid)+']':'')+(teacher?' · '+esc(teacher):'')+(i.room?' · '+esc(i.room)+'-xona':'')+(i.kind==='final_exam'?' · OTMda shaxsan':'')+'</small></div><span>'+(['','Du','Se','Ch','Pa','Ju','Sh','Ya'][i.weekday]||esc(i.date))+'</span><div class="row-actions">'+actions+'</div></div>';
}
function bindScheduleActions(){
  all('[data-del-schedule]').forEach(function(b){b.onclick=async function(){if(confirm('Dars o‘chirilsinmi?')){try{await api('/schedules/'+b.dataset.delSchedule,{method:'DELETE'});loadSchedules()}catch(e){toast(e.message)}}}});
  all('[data-join-lesson]').forEach(function(b){b.onclick=function(){joinLesson(b.dataset.joinLesson)}});
}
function joinLesson(id){enterLiveRoom(id)}
all('.tabs button').forEach(b=>b.onclick=()=>{all('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');structureType=b.dataset.type;loadStructure()});
async function loadStructure(){if(!can('structure.manage')&&!['dean','department'].includes(user.role))return;cache.structure=await api('/structure');const rows=cache.structure.filter(x=>x.type===structureType&&x.active);$('#structureList').innerHTML=rows.map(x=>`<div><small>ID: ${esc(x.externalId||x.code||x._id)}</small><h2>${esc(x.name)}</h2>${can('structure.manage')?`<button data-del-structure="${x._id}">O‘chirish</button>`:''}</div>`).join('')||'<div class="empty"><b>Hozircha ma’lumot kiritilmagan</b><p>“+ Yangi” tugmasi orqali birinchi bo‘limni yarating.</p></div>';all('[data-del-structure]').forEach(b=>b.onclick=async()=>{if(confirm('Arxivga o‘tkazilsinmi?')){try{await api('/structure/'+b.dataset.delStructure,{method:'DELETE'});loadStructure()}catch(e){toast(e.message)}}})}
function modal(title,fields,onSave){$('#modalTitle').textContent=title;$('#modalFields').innerHTML=fields;$('#modalSave').classList.remove('hidden');$('#modal').showModal();$('#modalForm').onsubmit=async e=>{e.preventDefault();if(e.submitter?.value==='cancel')return $('#modal').close();try{const fd=new FormData(e.currentTarget),data={};for(const key of new Set(fd.keys())){const values=fd.getAll(key);data[key]=values.length>1?values:values[0]}await onSave(data);$('#modal').close();toast('Saqlandi')}catch(err){toast(err.message)}}}
$('#addStructure').onclick=async()=>{if(!cache.structure.length)cache.structure=await api('/structure');const parents=cache.structure.filter(x=>x.active&&(structureType==='department'?x.type==='faculty':structureType==='group'?x.type==='department':false));modal('Yangi '+({faculty:'fakultet',department:'kafedra',group:'guruh'}[structureType]),`<label>Nomi<input name="name" required></label><label>ID<input name="externalId" ${structureType==='group'?'required':''} placeholder="Masalan: ATT-101"></label>${structureType==='faculty'?'':`<label>Yuqori bo‘lim<select name="parentId" required><option value="">Tanlang</option>${parents.map(x=>`<option value="${x._id}">${esc(x.name)}</option>`)}</select></label>`}`,async d=>{await api('/structure',{method:'POST',body:JSON.stringify({...d,type:structureType})});loadStructure()})};
async function loadSchedules(){
  try{
    const p=new URLSearchParams();
    if(can('schedule.manage')){
      const teacher=$('#scheduleTeacherFilter')?.value?.trim()||'',group=$('#scheduleGroupFilter')?.value?.trim()||'',day=$('#scheduleDayFilter')?.value||'';
      if(teacher)p.set('teacherLogin',teacher);if(group)p.set('groupId',group);if(day)p.set('weekday',day);
    }
    const rows=await api('/schedules'+(p.toString()?'?'+p.toString():''));
    $('#scheduleList').innerHTML=rows.map(scheduleRow).join('')||'<div class="empty"><b>Dars jadvali hali shakllantirilmagan</b><p>Administrator jadvalni qo‘lda yoki Excel/CSV orqali kiritadi.</p></div>';
    bindScheduleActions(); await buildTimetableLinks();
  }catch(e){toast(e.message)}
}
$('#applyScheduleFilter').onclick=loadSchedules;
$('#clearScheduleFilter').onclick=function(){if($('#scheduleTeacherFilter'))$('#scheduleTeacherFilter').value='';if($('#scheduleGroupFilter'))$('#scheduleGroupFilter').value='';if($('#scheduleDayFilter'))$('#scheduleDayFilter').value='';loadSchedules()};
function linkBox(label,url){return `<div class="public-link"><b>${esc(label)}</b><div><input value="${esc(url)}" readonly><button data-copy="${esc(url)}">Nusxa</button><a href="${esc(url)}" target="_blank" rel="noopener">Ochish ↗</a></div></div>`}
async function buildTimetableLinks(){
  const box=$('#timetableLinks'),base=location.origin+'/timetable.html?';
  if(user.role==='teacher'){box.innerHTML=linkBox('Mening to‘liq jadval havolam',base+'teacher='+encodeURIComponent(user.login));return}
  if(user.role==='student'){const gid=user.groupId?.externalId||user.groupId?.code||user.group||'';box.innerHTML=gid?linkBox('Guruh jadvali havolasi',base+'group='+encodeURIComponent(gid)):'<p class="muted">Profilingizga guruh ID biriktirilmagan.</p>';return}
  if(can('schedule.manage')){
    const [groups,teachers]=await Promise.all([api('/structure?type=group'),api('/teachers').catch(()=>[])]);
    box.innerHTML='<div class="link-builder link-builder-grid"><label>Guruh jadvali<select id="publicGroupSelect"><option value="">Guruhni tanlang</option>'+groups.filter(x=>x.active).map(g=>'<option value="'+esc(g.externalId||g.code||g._id)+'">'+esc(g.name)+' — '+esc(g.externalId||g.code||g._id)+'</option>').join('')+'</select></label><button id="makePublicLink">Guruh linki</button><label>O‘qituvchi jadvali<select id="publicTeacherSelect"><option value="">O‘qituvchini tanlang</option>'+teachers.filter(x=>x.active!==false).map(t=>'<option value="'+esc(t.login)+'">'+esc(t.fullName)+' (@'+esc(t.login)+')</option>').join('')+'</select></label><button id="makeTeacherPublicLink">O‘qituvchi linki</button><div id="publicLinkResult" class="wide-result"></div></div>';
    $('#makePublicLink').onclick=()=>{const gid=$('#publicGroupSelect').value;if(!gid)return toast('Guruhni tanlang');$('#publicLinkResult').innerHTML=linkBox('Guruhning to‘liq jadval havolasi',base+'group='+encodeURIComponent(gid))};
    $('#makeTeacherPublicLink').onclick=()=>{const login=$('#publicTeacherSelect').value;if(!login)return toast('O‘qituvchini tanlang');$('#publicLinkResult').innerHTML=linkBox('O‘qituvchining to‘liq jadval havolasi',base+'teacher='+encodeURIComponent(login))};
  }else box.innerHTML='';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(b)navigator.clipboard.writeText(b.dataset.copy).then(()=>toast('Havola nusxalandi'))});
$('#addSchedule').onclick=async()=>{const [groups,users]=await Promise.all([api('/structure?type=group'),api('/teachers').catch(()=>[])]);modal('Dars qo‘shish',`<label>Dars nomi<input name="title" required></label><label>Fan<input name="subject"></label><label>Guruh ID<select name="groupId" required>${groups.filter(x=>x.active).map(x=>`<option value="${esc(x.externalId||x.code||x._id)}">${esc(x.name)} — ${esc(x.externalId||x.code||x._id)}</option>`)}</select></label><label>O‘qituvchi<select name="teacherId" required>${users.map(x=>`<option value="${x._id}">${esc(x.fullName)} (@${esc(x.login)})</option>`)}</select></label><label>Hafta kuni<select name="weekday">${['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'].map((x,i)=>`<option value="${i+1}">${x}</option>`)}</select></label><label>Boshlanish<input name="start" type="time" required></label><label>Tugash<input name="end" type="time" required></label><label>Xona<input name="room" placeholder="Masalan: 201"></label><label>Turi<select name="kind"><option value="lecture">Ma’ruza</option><option value="practice">Amaliyot</option><option value="seminar">Seminar</option><option value="exam">Oraliq imtihon</option><option value="final_exam">Yakuniy nazorat (OTMda)</option></select></label>`,async d=>{d.weekday=Number(d.weekday);await api('/schedules',{method:'POST',body:JSON.stringify(d)});loadSchedules()})};
function buildUserQuery(){
  const p=new URLSearchParams(),q=$('#userSearch')?.value?.trim()||'',role=$('#userRoleFilter')?.value||'',active=$('#userStatusFilter')?.value||'';
  if(q)p.set('q',q);if(role)p.set('role',role);if(active)p.set('active',active);return p.toString();
}
async function loadUsers(){
  if(!can('users.manage'))return;
  try{
    const qs=buildUserQuery(),rows=await api('/users'+(qs?'?'+qs:''));
    $('#usersList').innerHTML='<table><thead><tr><th>F.I.Sh.</th><th>Login</th><th>Rol</th><th>Guruh ID</th><th>Oxirgi kirish</th><th>Holat</th><th>Amallar</th></tr></thead><tbody>'+rows.map(function(x){
      let actions='<button class="ghost" data-user-profile="'+esc(x._id)+'">Profil</button><button class="ghost" data-user-edit="'+esc(x._id)+'">Tahrir</button>';
      if(can('permissions.manage'))actions+='<button class="ghost" data-user-permissions="'+esc(x._id)+'">Huquqlar</button>';
      if(can('users.control'))actions+='<button class="ghost" data-user-toggle="'+esc(x._id)+'" data-active="'+(x.active?'1':'0')+'">'+(x.active?'Bloklash':'Ochish')+'</button><button class="ghost" data-user-reset="'+esc(x._id)+'">Parol</button>';
      return '<tr><td>'+esc(x.fullName)+'</td><td>@'+esc(x.login)+'</td><td>'+esc(roleName[x.role]||x.role)+'</td><td>'+esc(x.groupId?.externalId||x.groupId?.code||x.group||'—')+'</td><td>'+(x.lastLoginAt?new Date(x.lastLoginAt).toLocaleString('uz-UZ'):'—')+'</td><td><span class="status '+(x.active?'ok':'blocked')+'">'+(x.active?'Faol':'Blok')+'</span></td><td><div class="row-actions">'+actions+'</div></td></tr>';
    }).join('')+'</tbody></table>';
    all('[data-user-profile]').forEach(function(b){b.onclick=function(){openUserProfile(b.dataset.userProfile)}});
    all('[data-user-edit]').forEach(function(b){b.onclick=function(){editUser(b.dataset.userEdit)}});
    all('[data-user-permissions]').forEach(function(b){b.onclick=function(){editUserPermissions(b.dataset.userPermissions)}});
    all('[data-user-toggle]').forEach(function(b){b.onclick=function(){toggleUserStatus(b)}});
    all('[data-user-reset]').forEach(function(b){b.onclick=function(){resetUserPassword(b.dataset.userReset)}});
  }catch(e){$('#usersList').innerHTML='<p style="padding:15px">'+esc(e.message)+'</p>'}
}
async function toggleUserStatus(b){
  const active=b.dataset.active==='1';
  if(active&&!confirm('Foydalanuvchi tizimga kira olmaydi. Bloklansinmi?'))return;
  const note=active?(prompt('Bloklash sababi (ixtiyoriy):','')||''):'';
  try{await api('/users/'+b.dataset.userToggle+'/status',{method:'PATCH',body:JSON.stringify({active:!active,statusNote:note})});toast(active?'Foydalanuvchi bloklandi':'Foydalanuvchi faollashtirildi');loadUsers()}catch(e){toast(e.message)}
}
async function resetUserPassword(id){
  if(!confirm('Yangi vaqtinchalik parol yaratiladimi?'))return;
  try{const x=await api('/users/'+id+'/reset-password',{method:'POST',body:'{}'});alert('Yangi vaqtinchalik parol:\n\n'+x.temporaryPassword+'\n\nKeyingi kirishda parolni almashtirish tavsiya etiladi.')}catch(e){toast(e.message)}
}
$('#applyUserFilter').onclick=loadUsers;
$('#userSearch').addEventListener('keydown',function(e){if(e.key==='Enter')loadUsers()});
async function editUser(id){
  try{
    const [x,structures]=await Promise.all([api('/users/'+id),api('/structure')]),u=x.user;
    const faculties=structures.filter(v=>v.type==='faculty'&&v.active),departments=structures.filter(v=>v.type==='department'&&v.active),groups=structures.filter(v=>v.type==='group'&&v.active);
    const ext=v=>v?.externalId||v?.code||v?._id||'';
    const currentFaculty=ext(u.facultyId)||u.faculty||'',currentDepartment=ext(u.departmentId)||u.department||'',currentGroup=ext(u.groupId)||u.group||'';
    const roles=['student','teacher','tutor','department','dean','rectorate','tech','admin'].concat(user.role==='superadmin'?['superadmin']:[]);
    modal('Akkauntni tahrirlash',
      '<label>F.I.Sh.<input name="fullName" value="'+esc(u.fullName||'')+'" required></label>'+
      '<label>Rol<select name="role">'+roles.map(r=>'<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+esc(roleName[r]||r)+'</option>').join('')+'</select></label>'+
      '<label>Email<input name="email" type="email" value="'+esc(u.email||'')+'"></label>'+
      '<label>Telefon<input name="phone" value="'+esc(u.phone||'')+'"></label>'+
      '<label>Fakultet ID<select name="facultyId"><option value="">—</option>'+faculties.map(v=>'<option value="'+esc(ext(v))+'" '+(currentFaculty===ext(v)?'selected':'')+'>'+esc(v.name)+' — '+esc(ext(v))+'</option>').join('')+'</select></label>'+
      '<label>Kafedra ID<select name="departmentId"><option value="">—</option>'+departments.map(v=>'<option value="'+esc(ext(v))+'" '+(currentDepartment===ext(v)?'selected':'')+'>'+esc(v.name)+' — '+esc(ext(v))+'</option>').join('')+'</select></label>'+
      '<label>Guruh ID<select name="groupId"><option value="">—</option>'+groups.map(v=>'<option value="'+esc(ext(v))+'" '+(currentGroup===ext(v)?'selected':'')+'>'+esc(v.name)+' — '+esc(ext(v))+'</option>').join('')+'</select></label>',
      async d=>{await api('/users/'+id,{method:'PATCH',body:JSON.stringify(d)});loadUsers()}
    );
  }catch(e){toast(e.message)}
}
async function editUserPermissions(id){
  try{
    const x=await api('/users/'+id),u=x.user;
    const perms=[
      ['structure.manage','Tuzilmani boshqarish'],['users.manage','Userlarni boshqarish'],['users.control','Blok/parol nazorati'],
      ['schedule.manage','Jadvalni boshqarish'],['reports.view','Hisobotlarni ko‘rish'],['analytics.view','Umumiy statistika'],
      ['lessons.monitor','Jonli darslarni kuzatish'],['lessons.manage','Darsni boshqarish'],['attendance.manage','Davomatni boshqarish'],
      ['chat.use','Chatdan foydalanish']
    ];
    if(user.role==='superadmin')perms.push(['permissions.manage','Boshqalarning huquqlarini boshqarish']);
    const allow=new Set(u.permissions||[]),deny=new Set(u.deniedPermissions||[]);
    const boxes=(name,set)=>perms.map(p=>'<label class="permission-row"><input type="checkbox" name="'+name+'" value="'+p[0]+'" '+(set.has(p[0])?'checked':'')+'><span><b>'+esc(p[1])+'</b><small>'+esc(p[0])+'</small></span></label>').join('');
    modal('Maxsus huquqlar · @'+u.login,'<div class="permission-grid"><div><h3>Qo‘shimcha ruxsat</h3>'+boxes('permissions',allow)+'</div><div><h3>Taqiqlash</h3>'+boxes('deniedPermissions',deny)+'</div></div><p class="muted">Taqiqlash rolning standart huquqidan ustun turadi.</p>',async d=>{
      const arr=v=>v===undefined?[]:Array.isArray(v)?v:[v];
      await api('/users/'+id+'/permissions',{method:'PATCH',body:JSON.stringify({permissions:arr(d.permissions),deniedPermissions:arr(d.deniedPermissions)})});loadUsers()
    });
  }catch(e){toast(e.message)}
}
async function openUserProfile(id){
  try{
    const x=await api('/users/'+id),u=x.user;
    modal('Foydalanuvchi profili',
      '<div class="profile-mini"><div class="avatar">'+esc((u.fullName||'?').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase())+'</div><h2>'+esc(u.fullName)+'</h2><p>@'+esc(u.login)+' · '+esc(roleName[u.role]||u.role)+'</p></div>'+
      '<div class="profile-data"><p><b>Fakultet:</b> '+esc(u.facultyId?.name||u.faculty||'—')+'</p><p><b>Kafedra:</b> '+esc(u.departmentId?.name||u.department||'—')+'</p><p><b>Guruh:</b> '+esc(u.groupId?.name||u.group||'—')+'</p><p><b>Telefon:</b> '+esc(u.phone||'—')+'</p><p><b>Email:</b> '+esc(u.email||'—')+'</p><p><b>Oxirgi kirish:</b> '+(u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString('uz-UZ'):'—')+'</p><p><b>Kirishlar:</b> '+esc(u.loginCount||0)+'</p><p><b>Bio:</b> '+esc(u.bio||'—')+'</p></div>',
      async()=>{}
    );$('#modalSave').classList.add('hidden')
  }catch(e){toast(e.message)}
}
$('#addUser').onclick=async()=>{
  const structures=await api('/structure').catch(()=>[]),faculties=structures.filter(x=>x.type==='faculty'&&x.active),departments=structures.filter(x=>x.type==='department'&&x.active),groups=structures.filter(x=>x.type==='group'&&x.active),ext=x=>x.externalId||x.code||x._id;
  modal('Akkaunt yaratish',
    '<label>F.I.Sh.<input name="fullName" required></label><label>Login<input name="login" required></label><label>Vaqtinchalik parol<input name="password" placeholder="Bo‘sh qoldirilsa avtomatik"></label><label>Telefon<input name="phone" placeholder="+998..."></label><label>Email<input name="email" type="email"></label>'+
    '<label>Rol<select name="role">'+['student','teacher','tutor','department','dean','rectorate','tech','admin'].map(x=>'<option value="'+x+'">'+esc(roleName[x]||x)+'</option>').join('')+'</select></label>'+
    '<label>Fakultet ID<select name="facultyId"><option value="">—</option>'+faculties.map(x=>'<option value="'+esc(ext(x))+'">'+esc(x.name)+' — '+esc(ext(x))+'</option>').join('')+'</select></label>'+
    '<label>Kafedra ID<select name="departmentId"><option value="">—</option>'+departments.map(x=>'<option value="'+esc(ext(x))+'">'+esc(x.name)+' — '+esc(ext(x))+'</option>').join('')+'</select></label>'+
    '<label>Guruh ID<select name="groupId"><option value="">Biriktirilmagan</option>'+groups.map(x=>'<option value="'+esc(ext(x))+'">'+esc(x.name)+' — '+esc(ext(x))+'</option>').join('')+'</select></label><label>Kurs<select name="courseYear"><option value="">—</option>'+[1,2,3,4,5,6].map(x=>'<option value="'+x+'">'+x+'-kurs</option>').join('')+'</select></label><label>Yo‘nalish<input name="direction" placeholder="Masalan: Dasturiy injiniring"></label>',
    async d=>{const x=await api('/users',{method:'POST',body:JSON.stringify(d)});alert('Yangi akkaunt yaratildi.\nVaqtinchalik parol: '+x.temporaryPassword);loadUsers()}
  )
};

function chooseFile(){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.xlsx,.csv';input.onchange=()=>resolve(input.files?.[0]||null);input.click()})}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)})}
function csvEscape(v){const x=String(v??'');return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}
function downloadText(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadCredentials(rows){const csv=['full_name,login,role,password,group_id',...rows.map(r=>[r.fullName,r.login,r.role,r.password,r.group_id].map(csvEscape).join(','))].join('\n');downloadText('masofaviy2-yangi-login-parollar.csv','\ufeff'+csv)}
async function bulkImport(kind){const file=await chooseFile();if(!file)return;if(file.size>8*1024*1024)return toast('Fayl 8 MB dan katta bo‘lmasin');try{toast('Fayl tekshirilmoqda…');const contentBase64=await fileToBase64(file),endpoint=kind==='users'?'/users/bulk-import':'/schedules/bulk-import';const p=await api(endpoint,{method:'POST',body:JSON.stringify({filename:file.name,contentBase64,dryRun:true})});const errs=(p.errors||[]).slice(0,8).map(e=>e.row+'-qator: '+e.message).join('\n');if(!confirm('Tekshiruv tugadi.\nJami: '+p.total+'\nTayyor: '+p.valid+'\nXato: '+p.invalid+'\n\n'+(errs||'Xato topilmadi.')+'\n\nImportni davom ettiraymi?'))return;const r=await api(endpoint,{method:'POST',body:JSON.stringify({filename:file.name,contentBase64,dryRun:false})});if(kind==='users'&&r.credentials?.length)downloadCredentials(r.credentials);toast((r.imported||0)+' ta yozuv import qilindi');kind==='users'?loadUsers():loadSchedules()}catch(e){toast(e.message)}}
$('#importUsers').onclick=()=>bulkImport('users');$('#importSchedules').onclick=()=>bulkImport('schedules');
$('#userTemplate').onclick=()=>downloadText('foydalanuvchilar-template.csv','\ufefffull_name,login,role,password,faculty_id,department_id,group_id,course_year,direction,email,phone\nAli Valiyev,ali.valiyev,student,Temp12345,FAC-01,DEP-01,ATT-101,1,Dasturiy injiniring,,+998901234567\nOlim Karimov,olim.karimov,teacher,Temp12345,FAC-01,DEP-01,,,,,');
$('#scheduleTemplate').onclick=()=>downloadText('dars-jadvali-template.csv','\ufefftitle,subject,group_id,teacher_login,weekday,start,end,room,kind\nMatematika,Matematika,ATT-101,olim.karimov,1,08:30,09:50,201,lecture');
async function loadProfile(){try{const x=await api('/profile'),u=x.user,initials=(u.fullName||u.login||'?').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();$('#profileCard').innerHTML='<div class="avatar big">'+esc(initials)+'</div><div><h2>'+esc(u.fullName)+'</h2><p>@'+esc(u.login)+' · '+esc(roleName[u.role]||u.role)+'</p><span class="role-chip">'+esc(roleName[u.role]||u.role)+'</span></div>';const form=$('#profileForm');form.fullName.value=u.fullName||'';form.email.value=u.email||'';form.phone.value=u.phone||'';form.avatarUrl.value=u.avatarUrl||'';form.direction.value=u.direction||'';form.courseYear.value=u.courseYear||'';form.bio.value=u.bio||'';$('#profileOrg').innerHTML='<p><b>Fakultet:</b> '+esc(u.facultyId?.name||u.faculty||'—')+'</p><p><b>Kafedra:</b> '+esc(u.departmentId?.name||u.department||'—')+'</p><p><b>Guruh:</b> '+esc(u.groupId?.name||u.group||'—')+'</p><p><b>Kurs / yo‘nalish:</b> '+esc(u.courseYear?u.courseYear+'-kurs':'—')+' · '+esc(u.direction||'—')+'</p>';const base=location.origin+'/timetable.html?';let link='';if(u.role==='teacher')link=base+'teacher='+encodeURIComponent(u.login);if(u.role==='student'){const gid=u.groupId?.externalId||u.groupId?.code||u.group;if(gid)link=base+'group='+encodeURIComponent(gid)}$('#profileTimetable').innerHTML=link?linkBox('Shaxsiy jadval havolasi',link):'';await loadDevicePrefs()}catch(e){toast(e.message)}}
$('#profileForm').onsubmit=async e=>{e.preventDefault();try{await api('/profile',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Profil yangilandi');const me=await api('/me');user=me.user;configureRoleUI();loadProfile()}catch(err){toast(err.message)}};
$('#passwordForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.newPassword!==d.confirmPassword)return toast('Yangi parollar bir xil emas');try{await api('/profile/password',{method:'PATCH',body:JSON.stringify({currentPassword:d.currentPassword,newPassword:d.newPassword})});e.target.reset();toast('Parol yangilandi')}catch(err){toast(err.message)}};


let devicePreviewStream=null;
async function loadDevicePrefs(requestPermission=false){
  try{
    if(requestPermission){
      const temp=await navigator.mediaDevices.getUserMedia({audio:true,video:true}).catch(async()=>navigator.mediaDevices.getUserMedia({audio:true,video:false}));
      temp?.getTracks().forEach(t=>t.stop());
    }
    const devices=await navigator.mediaDevices.enumerateDevices(),mics=devices.filter(d=>d.kind==='audioinput'),cams=devices.filter(d=>d.kind==='videoinput');
    const mic=$('#preferredMic'),cam=$('#preferredCamera');if(!mic||!cam)return;
    const currentMic=localStorage.getItem('m2-preferred-mic')||'',currentCam=localStorage.getItem('m2-preferred-camera')||'';
    mic.innerHTML='<option value="">Avtomatik</option>'+mics.map((d,i)=>'<option value="'+esc(d.deviceId)+'">'+esc(d.label||('Mikrofon '+(i+1)))+'</option>').join('');
    cam.innerHTML='<option value="">Avtomatik</option>'+cams.map((d,i)=>'<option value="'+esc(d.deviceId)+'">'+esc(d.label||('Kamera '+(i+1)))+'</option>').join('');
    mic.value=mics.some(d=>d.deviceId===currentMic)?currentMic:'';cam.value=cams.some(d=>d.deviceId===currentCam)?currentCam:'';
    $('#deviceStatus').textContent=(mics.length?mics.length+' ta mikrofon':'Mikrofon topilmadi')+' · '+(cams.length?cams.length+' ta kamera':'Kamera topilmadi');
  }catch(e){$('#deviceStatus').textContent='Qurilmalarni o‘qib bo‘lmadi: '+e.message}
}
$('#saveDevicePrefs').onclick=()=>{localStorage.setItem('m2-preferred-mic',$('#preferredMic').value||'');localStorage.setItem('m2-preferred-camera',$('#preferredCamera').value||'');toast('Video dars qurilmalari saqlandi')};
$('#testDevices').onclick=async()=>{
  try{
    devicePreviewStream?.getTracks().forEach(t=>t.stop());
    const micId=$('#preferredMic').value,camId=$('#preferredCamera').value;
    const stream=await navigator.mediaDevices.getUserMedia({audio:micId?{deviceId:{exact:micId},echoCancellation:true,noiseSuppression:true}:true,video:camId?{deviceId:{exact:camId},width:{ideal:1280},height:{ideal:720}}:{width:{ideal:1280},height:{ideal:720}}});
    devicePreviewStream=stream;const v=$('#devicePreview');v.srcObject=stream;v.classList.remove('hidden');$('#deviceStatus').textContent='Kamera va mikrofon tayyor. Darsga kirishda shu qurilmalar ishlatiladi.';await loadDevicePrefs(false)
  }catch(e){$('#deviceStatus').textContent='Tekshiruv xatosi: '+e.message;toast('Kamera/mikrofon ruxsatini tekshiring')}
};

function liveStatusLabel(room){
  const st=room.session?.status||'scheduled';
  if(st==='active')return '<span class="live-status active">Jonli</span>';
  if(st==='ended')return '<span class="live-status ended">Yakunlangan</span>';
  return '<span class="live-status waiting">Kutilmoqda</span>';
}
async function loadLiveRooms(){
  try{
    const x=await api('/live/rooms'),rooms=x.rooms||[];
    $('#liveTodayCount').textContent=rooms.length;
    $('#liveActiveCount').textContent=rooms.filter(r=>r.session?.status==='active').length;
    $('#livePeopleCount').textContent=rooms.reduce((n,r)=>n+(r.session?.currentParticipants||0),0);
    $('#liveRooms').innerHTML=rooms.map(function(r){
      const s=r.schedule,g=s.groupId,t=s.teacherId,active=r.session?.status==='active',ended=r.session?.status==='ended';
      let actions='';
      if(r.canStart&&!active&&!ended)actions+='<button class="primary" data-live-start="'+esc(s._id)+'">'+icon('video','▶')+' Boshlash</button>';
      if(active&&r.canJoin)actions+='<button class="primary" data-live-join="'+esc(s._id)+'">'+icon('external','↗')+' Kirish</button>';
      if(active&&r.canStart)actions+='<button class="ghost danger-text" data-live-end="'+esc(s._id)+'">'+icon('phoneOff','×')+' Yakunlash</button>';
      if(!actions)actions='<span class="room-note">'+(ended?'Dars yakunlangan':'O‘qituvchi boshlashini kuting')+'</span>';
      return '<article class="live-room-card '+(active?'is-live':'')+'"><div class="live-room-top">'+liveStatusLabel(r)+'<span class="room-time">'+esc(s.start)+'–'+esc(s.end)+'</span></div><h2>'+esc(s.title)+'</h2><p class="room-subject">'+esc(s.subject||'')+'</p><div class="room-meta"><span>'+icon('users','♙')+' '+esc(g?.name||'Guruh')+' <b>'+esc(g?.externalId||g?.code||'')+'</b></span><span>'+icon('user','◎')+' '+esc(t?.fullName||'O‘qituvchi')+'</span><span>'+icon('users','•')+' '+esc(r.session?.currentParticipants||0)+' xonada</span></div><div class="room-actions">'+actions+'</div></article>';
    }).join('')||'<div class="empty"><b>Bugun jonli dars yo‘q</b><p>Jadvaldagi bugungi guruh darslari shu yerda ko‘rinadi.</p></div>';
    all('[data-live-start]').forEach(b=>b.onclick=()=>startLiveRoom(b.dataset.liveStart));
    all('[data-live-join]').forEach(b=>b.onclick=()=>enterLiveRoom(b.dataset.liveJoin));
    all('[data-live-end]').forEach(b=>b.onclick=()=>endLiveRoom(b.dataset.liveEnd,false));
    hydrateIcons($('#liveRooms'));
  }catch(e){$('#liveRooms').innerHTML='<div class="empty"><b>Jonli xonalarni yuklab bo‘lmadi</b><p>'+esc(e.message)+'</p></div>'}
}
async function startLiveRoom(id){
  try{const x=await api('/live/rooms/'+id+'/start',{method:'POST',body:'{}'});await openConference(x)}catch(e){toast(e.message)}
}
async function enterLiveRoom(id){
  try{const x=await api('/live/rooms/'+id+'/join',{method:'POST',body:'{}'});await openConference(x)}catch(e){toast(e.message);go('live')}
}
async function openConference(payload){
  const join=payload.join,s=payload.schedule;if(!join||!s)return toast('Video xona ma’lumoti topilmadi');
  if(join.provider!=='mediasoup')return toast('Media provayder sozlamasi noto‘g‘ri');
  if(!window.MasofaviyMediaClientBundle?.MediaRoomClient)return toast('Mediasoup klient yuklanmagan. Ctrl+F5 qiling.');
  activeLessonId=String(s._id);activeLiveSession={schedule:s,join};
  go('lesson');$('#liveLessonTitle').textContent=s.title||'Jonli dars';$('#liveLessonMeta').textContent=(s.groupId?.name||'Guruh')+' · '+(s.teacherId?.fullName||'O‘qituvchi')+' · '+s.start+'–'+s.end;
  $('#endLiveLesson').classList.toggle('hidden',!(String(s.teacherId?._id||s.teacherId)===String(user._id)||can('live.manage')));
  const mount=$('#videoMount');mount.innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Universitet SFU serveriga ulanmoqda…</b><small>Mediasoup · kamera o‘chiq · mikrofon ochiq</small></div>';
  try{
    if(mediaRoomClient)await mediaRoomClient.close().catch(()=>{});
    mediaRoomClient=new window.MasofaviyMediaClientBundle.MediaRoomClient({
      socket,joinPayload:join,mount,user,lowEnd:lowEndUI,
      onState:state=>{
        if(state.mic!==undefined)$('#callMic').classList.toggle('active-control',state.mic);
        if(state.camera!==undefined)$('#callCamera').classList.toggle('active-control',state.camera);
        if(state.screen!==undefined)$('#callScreen').classList.toggle('active-control',state.screen);
      },
      onError:e=>toast(e.message||String(e))
    });
    await mediaRoomClient.connect();
    if(socket?.connected)socket.emit('lesson:join',{lessonId:activeLessonId});
    toast('Mediasoup jonli darsga ulandingiz');
  }catch(e){
    mount.innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Media serverga ulanib bo‘lmadi</b><small>'+esc(e.message)+'</small><button id="retryMediaRoom" class="primary">Qayta ulanish</button></div>';
    $('#retryMediaRoom')?.addEventListener('click',()=>openConference(payload));
  }
  hydrateIcons($('#lesson'));
}
async function leaveConference(back=true){
  if(activeLessonId&&socket?.connected)socket.emit('lesson:leave',{lessonId:activeLessonId});
  if(mediaRoomClient){try{await mediaRoomClient.close()}catch{}mediaRoomClient=null}
  activeLessonId='';activeLiveSession=null;$('#videoMount').innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Video xona yopildi</b><small>Guruh darslari sahifasidan boshqa xonani tanlang.</small></div>';if(back){go('live');loadLiveRooms()}
}
async function endLiveRoom(id,fromCall=true){
  if(!confirm('Jonli dars yakunlansinmi?'))return;
  try{await api('/live/rooms/'+id+'/end',{method:'POST',body:'{}'});if(fromCall)await leaveConference(true);else loadLiveRooms();toast('Jonli dars yakunlandi')}catch(e){toast(e.message)}
}
$('#refreshLiveRooms').onclick=loadLiveRooms;
$('#backToLive').onclick=()=>leaveConference(true);
$('#endLiveLesson').onclick=()=>activeLessonId&&endLiveRoom(activeLessonId,true);
$('#callMic').onclick=async()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');try{await mediaRoomClient.toggleMic()}catch(e){toast(e.message)}};
$('#callCamera').onclick=async()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');try{await mediaRoomClient.toggleCamera()}catch(e){toast(e.message)}};
$('#callScreen').onclick=async()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');try{await mediaRoomClient.toggleScreen()}catch(e){toast(e.message)}};
$('#callChat').onclick=()=>{$('.conference-shell .chat')?.classList.toggle('chat-collapsed')};
$('#callHangup').onclick=()=>leaveConference(true);

function youtubeId(url){const m=String(url||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);return m?.[1]||''}
function videoThumb(v){const id=youtubeId(v.sourceUrl);return v.thumbnailUrl||(id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'')}
function videoCard(v,recommended=false){
  const thumb=videoThumb(v),course=(v.courseYears||[]).map(x=>x+'-kurs').join(', '),groups=(v.groupIds||[]).map(g=>g.externalId||g.code||g.name).join(', '),mine=String(v.teacherId?._id||'')===String(user?._id||''),canDelete=can('videos.manage')||mine;
  return '<article class="video-card" data-video-id="'+esc(v._id)+'"><button class="video-cover" data-video-play="'+esc(v._id)+'">'+(thumb?'<img src="'+esc(thumb)+'" loading="lazy" alt="">':'<div class="video-no-thumb">'+icon('play','▶')+'</div>')+'<span class="play-badge">'+icon('play','▶')+'</span>'+(recommended?'<span class="recommend-badge">Tavsiya</span>':'')+'</button><div class="video-card-body"><div class="video-card-top"><span>'+esc(v.subject||'Videodars')+'</span><small>'+esc(v.durationMinutes?Math.round(v.durationMinutes)+' daq':'')+'</small></div><h2>'+esc(v.title)+'</h2><p>'+esc(v.description||'Mustaqil o‘rganish uchun videodars.')+'</p><div class="video-tags">'+(course?'<span>'+esc(course)+'</span>':'')+(v.direction?'<span>'+esc(v.direction)+'</span>':'')+(groups?'<span>'+esc(groups)+'</span>':'')+'</div><div class="video-footer"><small>'+icon('user','◎')+' '+esc(v.teacherId?.fullName||'Ta’lim platformasi')+' · '+esc(v.views||0)+' ko‘rish · '+esc(v.commentCount||0)+' izoh</small><div>'+(canDelete?'<button class="ghost danger-text" data-video-delete="'+esc(v._id)+'" title="Arxivlash">'+icon('trash','×')+'</button>':'')+'</div></div></div></article>';
}
function compactRelatedCard(v){
  const thumb=videoThumb(v);
  return '<button class="related-card" data-video-play="'+esc(v._id)+'">'+(thumb?'<img src="'+esc(thumb)+'" loading="lazy" alt="">':'<div class="related-no-thumb">'+icon('play','▶')+'</div>')+'<span><b>'+esc(v.title)+'</b><small>'+esc(v.teacherId?.fullName||'Ta’lim platformasi')+'</small><small>'+esc(v.views||0)+' ko‘rish · '+esc(v.likes||0)+' yoqdi</small></span></button>';
}
async function loadVideoLessons(){
  try{
    videoLessonsCache=await api('/videos');
    const q=String($('#videoSearch')?.value||'').toLowerCase().trim(),course=Number($('#videoCourseFilter')?.value||0),direction=String($('#videoDirectionFilter')?.value||'').toLowerCase().trim();
    const rows=videoLessonsCache.filter(v=>(!q||[v.title,v.subject,v.description,...(v.tags||[])].join(' ').toLowerCase().includes(q))&&(!course||(v.courseYears||[]).includes(course))&&(!direction||String(v.direction||'').toLowerCase().includes(direction)));
    const rec=rows.filter(v=>v.recommendationScore>0).slice(0,10);
    $('#recommendedVideos').innerHTML=(rec.length?rec:rows.slice(0,10)).map(v=>videoCard(v,true)).join('')||'<div class="empty"><b>Tavsiya topilmadi</b><p>Kurs yoki yo‘nalish filtrlari bilan qidiring.</p></div>';
    $('#videoLessons').innerHTML=rows.map(v=>videoCard(v,false)).join('')||'<div class="empty"><b>Videodars topilmadi</b><p>O‘qituvchi yoki administrator videodars qo‘shishi mumkin.</p></div>';
    bindVideoActions();hydrateIcons($('#videos'));
  }catch(e){$('#videoLessons').innerHTML='<div class="empty"><b>Videodarslarni yuklab bo‘lmadi</b><p>'+esc(e.message)+'</p></div>'}
}
function bindVideoActions(root=document){
  root.querySelectorAll?.('[data-video-play]').forEach(b=>b.onclick=()=>openVideoLesson(b.dataset.videoPlay));
  root.querySelectorAll?.('[data-video-delete]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteVideoLesson(b.dataset.videoDelete)});
}
function renderWatchPlayer(v){
  const player=$('#watchPlayer'),yt=youtubeId(v.sourceUrl);
  if(yt){
    const src='https://www.youtube.com/embed/'+encodeURIComponent(yt)+'?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin='+encodeURIComponent(location.origin);
    player.innerHTML='<iframe src="'+src+'" title="'+esc(v.title)+'" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
  }else if(v.sourceType==='mp4'){
    player.innerHTML='<video controls autoplay playsinline preload="metadata" src="'+esc(v.sourceUrl)+'"></video>';
  }else{
    player.innerHTML='<iframe src="'+esc(v.sourceUrl)+'" title="'+esc(v.title)+'" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  }
}
async function openVideoLesson(id,pushHistory=true){
  if(!videoLessonsCache.length)videoLessonsCache=await api('/videos');
  const v=videoLessonsCache.find(x=>String(x._id)===String(id));if(!v)return toast('Videodars topilmadi');
  activeVideoId=String(v._id);commentReplyTo=null;go('videoWatch');
  if(pushHistory&&location.hash!=='#video='+encodeURIComponent(activeVideoId))history.pushState({videoId:activeVideoId},'',location.pathname+location.search+'#video='+encodeURIComponent(activeVideoId));
  $('#watchTitle').textContent=v.title;$('#watchVideoTitle').textContent=v.title;
  $('#watchMeta').textContent=[v.subject,(v.courseYears||[]).map(x=>x+'-kurs').join(', '),v.direction].filter(Boolean).join(' · ');
  $('#watchStats').innerHTML='<b>'+esc(v.views||0)+' ko‘rish</b><span>'+esc(v.commentCount||0)+' izoh</span><span>'+esc(v.durationMinutes?Math.round(v.durationMinutes)+' daqiqa':'')+'</span>';
  $('#watchLikeText').textContent=(v.progress?.liked?'Yoqdi ✓':'Yoqdi')+' · '+(v.likes||0);
  $('#watchLikeBtn').classList.toggle('liked',Boolean(v.progress?.liked));
  $('#watchTeacher').innerHTML='<div class="avatar">'+esc((v.teacherId?.fullName||'T').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())+'</div><div><b>'+esc(v.teacherId?.fullName||'Ta’lim platformasi')+'</b><small>'+esc(v.subject||'Videodars')+'</small></div>';
  const tags=[...(v.tags||[]),...(v.courseYears||[]).map(x=>x+'-kurs'),v.direction].filter(Boolean);
  $('#watchDescription').innerHTML='<div class="watch-description-meta">'+tags.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><p>'+esc(v.description||'Videodars uchun tavsif kiritilmagan.')+'</p>';
  renderWatchPlayer(v);
  const related=videoLessonsCache.filter(x=>String(x._id)!==activeVideoId).sort((a,b)=>(b.recommendationScore||0)-(a.recommendationScore||0)).slice(0,30);
  $('#watchRelated').innerHTML=related.map(compactRelatedCard).join('')||'<p class="muted">Boshqa videodars yo‘q.</p>';
  bindVideoActions($('#watchRelated'));hydrateIcons($('#videoWatch'));
  await Promise.all([loadVideoComments(activeVideoId),api('/videos/'+activeVideoId+'/view',{method:'POST',body:JSON.stringify({watchedSeconds:0})}).catch(()=>{})]);
}
function clearWatchPage(){
  activeVideoId='';commentReplyTo=null;$('#watchPlayer').innerHTML='';$('#commentsList').innerHTML='';$('#commentReplyState').classList.add('hidden');
}
$('#backToVideos').onclick=()=>{clearWatchPage();history.pushState({},'',location.pathname+location.search);go('videos');loadVideoLessons()};
$('#watchLikeBtn').onclick=()=>activeVideoId&&likeVideoLesson(activeVideoId,true);
async function likeVideoLesson(id,stayOnWatch=false){
  try{
    const x=await api('/videos/'+id+'/like',{method:'POST',body:'{}'}),v=videoLessonsCache.find(a=>String(a._id)===String(id));
    if(v){v.progress={...(v.progress||{}),liked:x.liked};v.likes=Math.max(0,(v.likes||0)+(x.liked?1:-1))}
    toast(x.liked?'Yoqtirildi':'Yoqtirish bekor qilindi');
    if(stayOnWatch&&v){$('#watchLikeText').textContent=(x.liked?'Yoqdi ✓':'Yoqdi')+' · '+v.likes;$('#watchLikeBtn').classList.toggle('liked',x.liked)}else loadVideoLessons()
  }catch(e){toast(e.message)}
}
async function loadVideoComments(videoId){
  try{
    const rows=await api('/videos/'+videoId+'/comments'),roots=rows.filter(x=>!x.parentId),byParent={};
    rows.filter(x=>x.parentId).forEach(x=>(byParent[String(x.parentId)]??=[]).push(x));
    $('#commentCount').textContent='('+rows.length+')';
    $('#commentsList').innerHTML=roots.map(c=>commentHtml(c,byParent[String(c._id)]||[])).join('')||'<div class="empty compact-empty"><b>Hali izoh yo‘q</b><p>Birinchi fikrni siz yozishingiz mumkin.</p></div>';
    all('[data-comment-reply]').forEach(b=>b.onclick=()=>setCommentReply(b.dataset.commentReply,b.dataset.author));
    all('[data-comment-delete]').forEach(b=>b.onclick=()=>deleteVideoComment(b.dataset.commentDelete));
    hydrateIcons($('#commentsList'));
    const v=videoLessonsCache.find(x=>String(x._id)===String(videoId));if(v)v.commentCount=rows.length;
  }catch(e){$('#commentsList').innerHTML='<p class="muted">'+esc(e.message)+'</p>'}
}
function commentHtml(c,replies=[]){
  const u=c.userId||{},initials=(u.fullName||u.login||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(),mine=String(u._id||u)===String(user?._id||''),canDelete=mine||can('videos.manage');
  const one=x=>{const xu=x.userId||{},xi=(xu.fullName||xu.login||'?').split(/\s+/).slice(0,2).map(y=>y[0]).join('').toUpperCase();return '<div class="comment-row reply"><div class="avatar small">'+esc(xi)+'</div><div><div class="comment-head"><b>'+esc(xu.fullName||xu.login||'Foydalanuvchi')+'</b><small>'+new Date(x.createdAt).toLocaleString('uz-UZ')+(x.editedAt?' · tahrirlangan':'')+'</small></div><p>'+esc(x.text)+'</p>'+(String(xu._id||xu)===String(user?._id||'')||can('videos.manage')?'<button class="comment-link danger-text" data-comment-delete="'+esc(x._id)+'">O‘chirish</button>':'')+'</div></div>'};
  return '<div class="comment-thread"><div class="comment-row"><div class="avatar small">'+esc(initials)+'</div><div><div class="comment-head"><b>'+esc(u.fullName||u.login||'Foydalanuvchi')+'</b><small>'+new Date(c.createdAt).toLocaleString('uz-UZ')+(c.editedAt?' · tahrirlangan':'')+'</small></div><p>'+esc(c.text)+'</p><div class="comment-actions"><button class="comment-link" data-comment-reply="'+esc(c._id)+'" data-author="'+esc(u.fullName||u.login||'')+'">Javob berish</button>'+(canDelete?'<button class="comment-link danger-text" data-comment-delete="'+esc(c._id)+'">O‘chirish</button>':'')+'</div></div></div><div class="comment-replies">'+replies.slice().reverse().map(one).join('')+'</div></div>';
}
function setCommentReply(id,author){
  commentReplyTo=id;const box=$('#commentReplyState');box.classList.remove('hidden');box.innerHTML='<span><b>'+esc(author)+'</b> ga javob</span><button type="button" id="cancelCommentReply">×</button>';$('#commentForm input').placeholder=author+' ga javob yozing...';$('#commentForm input').focus();$('#cancelCommentReply').onclick=clearCommentReply
}
function clearCommentReply(){commentReplyTo=null;$('#commentReplyState').classList.add('hidden');$('#commentReplyState').innerHTML='';$('#commentForm input').placeholder='Izoh yozing...'}
$('#commentForm').onsubmit=async e=>{
  e.preventDefault();if(!activeVideoId)return;const input=e.currentTarget.elements.text,text=String(input.value||'').trim();if(!text)return;
  try{await api('/videos/'+activeVideoId+'/comments',{method:'POST',body:JSON.stringify({text,parentId:commentReplyTo||undefined})});input.value='';clearCommentReply();await loadVideoComments(activeVideoId);toast('Izoh qo‘shildi')}catch(err){toast(err.message)}
};
async function deleteVideoComment(id){if(!confirm('Izoh o‘chirilsinmi?'))return;try{await api('/video-comments/'+id,{method:'DELETE'});await loadVideoComments(activeVideoId);toast('Izoh o‘chirildi')}catch(e){toast(e.message)}}
async function deleteVideoLesson(id){if(!confirm('Videodars arxivga olinsinmi?'))return;try{await api('/videos/'+id,{method:'DELETE'});toast('Videodars arxivga olindi');if(activeVideoId===String(id)){clearWatchPage();go('videos')}loadVideoLessons()}catch(e){toast(e.message)}}
$('#applyVideoFilter').onclick=loadVideoLessons;$('#videoSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadVideoLessons()});
$('#addVideoLesson').onclick=async()=>{
  await api('/structure?type=group').catch(()=>[]);
  modal('Videodars qo‘shish','<label>Nomi<input name="title" required></label><label>Video havolasi<input name="sourceUrl" type="url" required placeholder="YouTube yoki MP4 URL"></label><label>Fan<input name="subject"></label><label>Guruh ID lar<input name="groupIds" placeholder="ATT-101, ATT-102"></label><label>Kurslar<input name="courseYears" placeholder="1,2"></label><label>Yo‘nalish<input name="direction" placeholder="Dasturiy injiniring"></label><label>Teglar<input name="tags" placeholder="algoritm, amaliyot, nazariya"></label><label>Muqova URL<input name="thumbnailUrl" type="url"></label><label>Davomiyligi (daq)<input name="durationMinutes" type="number" min="0"></label><label>Tavsif<textarea name="description" rows="4"></textarea></label>',async d=>{await api('/videos',{method:'POST',body:JSON.stringify(d)});loadVideoLessons()})
};

let analyticsCache=null;
function metricCards(items){return items.map(function(i){return '<div class="stat"><b>'+esc(i[1]??0)+'</b><span>'+esc(i[0])+'</span></div>'}).join('')}
function barChart(rows,labelFn,valueFn,secondaryFn){rows=rows||[];const max=Math.max(1,...rows.map(function(r){return Number(valueFn(r))||0}));return rows.map(function(r){const v=Number(valueFn(r))||0;return '<div class="bar-row"><div class="bar-label"><span>'+esc(labelFn(r))+'</span><b>'+esc(v)+(secondaryFn?' <small>'+esc(secondaryFn(r))+'</small>':'')+'</b></div><div class="bar-track"><i style="width:'+Math.max(3,Math.round(v/max*100))+'%"></i></div></div>'}).join('')||'<p class="muted">Ma’lumot yo‘q.</p>'}
async function ensureAnalyticsFilters(){
  const globalRoles=['superadmin','admin','tech','rectorate'];
  const box=$('#analyticsScopeFilters');
  if(!globalRoles.includes(user.role)){box?.classList.add('hidden');return}
  box?.classList.remove('hidden');
  if(cache.analyticsStructures.length)return;
  cache.analyticsStructures=await api('/structure');
  renderAnalyticsFilters();
}
function structureKey(x){return x.externalId||x.code||x._id}
function renderAnalyticsFilters(){
  const rows=cache.analyticsStructures||[],fac=$('#analyticsFaculty'),dep=$('#analyticsDepartment'),grp=$('#analyticsGroup');
  if(!fac||!dep||!grp)return;
  const fval=fac.value,dval=dep.value,gval=grp.value;
  const faculties=rows.filter(x=>x.type==='faculty'&&x.active);
  fac.innerHTML='<option value="">Barcha fakultetlar</option>'+faculties.map(x=>'<option value="'+esc(structureKey(x))+'">'+esc(x.name)+'</option>').join('');
  if(faculties.some(x=>structureKey(x)===fval))fac.value=fval;
  const selectedFaculty=faculties.find(x=>structureKey(x)===fac.value);
  const departments=rows.filter(x=>x.type==='department'&&x.active&&(!selectedFaculty||String(x.parentId||'')===String(selectedFaculty._id)));
  dep.innerHTML='<option value="">Barcha kafedralar</option>'+departments.map(x=>'<option value="'+esc(structureKey(x))+'">'+esc(x.name)+'</option>').join('');
  if(departments.some(x=>structureKey(x)===dval))dep.value=dval;
  const selectedDepartment=departments.find(x=>structureKey(x)===dep.value);
  const groups=rows.filter(x=>x.type==='group'&&x.active&&(!selectedDepartment||String(x.parentId||'')===String(selectedDepartment._id)));
  grp.innerHTML='<option value="">Barcha guruhlar</option>'+groups.map(x=>'<option value="'+esc(structureKey(x))+'">'+esc(x.name)+' — '+esc(structureKey(x))+'</option>').join('');
  if(groups.some(x=>structureKey(x)===gval))grp.value=gval;
}
function analyticsQuery(){
  const p=new URLSearchParams({days:$('#analyticsRange')?.value||7});
  if(['superadmin','admin','tech','rectorate'].includes(user.role)){
    const f=$('#analyticsFaculty')?.value||'',d=$('#analyticsDepartment')?.value||'',g=$('#analyticsGroup')?.value||'';
    if(f)p.set('facultyId',f);if(d)p.set('departmentId',d);if(g)p.set('groupId',g);
  }
  return p.toString();
}
async function loadAnalytics(){if(!can('analytics.view'))return;try{await ensureAnalyticsFilters();const query=analyticsQuery(),out=await Promise.all([api('/analytics/overview?'+query),api('/analytics/groups?'+query)]),x=out[0],groupData=out[1];analyticsCache={...x,groupPerformance:groupData.rows||[]};const v=x.summary||{};$('#analyticsScopeLabel').textContent='Statistika doirasi: '+(x.scope?.label||'Universitet');$('#analyticsSummary').innerHTML=metricCards([['Faol user',v.activeUsers],['Talaba',v.students],['O‘qituvchi',v.teachers],['Bugungi dars',v.todaySchedules],['Davomat %',(v.attendanceRate??0)+'%'],['Qatnashdi',v.attendanceStudents??v.attendanceToday],['Kutilgan',v.attendanceExpected??0],['Kechikish',v.lateToday],['Onlayn',v.onlineUsers],['Bloklangan',v.blockedUsers]]);$('#analyticsGenerated').textContent='Yangilandi: '+new Date(x.generatedAt).toLocaleString('uz-UZ');$('#attendanceChart').innerHTML=barChart(x.attendanceTrend,function(r){return r.date},function(r){return r.total},function(r){return (r.late||0)+' kech'});const daysName=['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];$('#weekdayChart').innerHTML=barChart(x.lessonsByWeekday,function(r){return daysName[r._id]||r._id},function(r){return r.value});$('#roleChart').innerHTML=barChart(x.usersByRole,function(r){return roleName[r._id]||r._id},function(r){return r.value});const q=x.dataQuality||{};$('#qualityCards').innerHTML=[['Aloqa ma’lumoti to‘liq emas',q.missingContact],['Guruhsiz talaba',q.studentsMissingGroup],['Jadvalsiz o‘qituvchi',q.teachersWithoutSchedule],['Jadvalsiz guruh',q.groupsWithoutSchedule]].map(function(i){return '<div class="quality-card '+(Number(i[1])>0?'warn':'ok')+'"><b>'+esc(i[1]||0)+'</b><span>'+esc(i[0])+'</span></div>'}).join('');$('#topTeachers').innerHTML=(x.topTeachers||[]).map(function(r,i){return '<div><span><b>'+(i+1)+'.</b> '+esc(r.label)+' <small>@'+esc(r.login||'-')+'</small></span><strong>'+esc(r.value)+' dars</strong></div>'}).join('')||'<p class="muted">Ma’lumot yo‘q.</p>';$('#topGroups').innerHTML=(x.topGroups||[]).map(function(r,i){return '<div><span><b>'+(i+1)+'.</b> '+esc(r.label)+' <small>'+esc(r.externalId||'')+'</small></span><strong>'+esc(r.value)+' dars</strong></div>'}).join('')||'<p class="muted">Ma’lumot yo‘q.</p>';renderGroupPerformance(groupData.rows||[])}catch(e){toast(e.message)}}
function renderGroupPerformance(rows){
  const box=$('#groupPerformance');if(!box)return;
  box.innerHTML='<table><thead><tr><th>Guruh</th><th>Talaba</th><th>Haftalik dars</th><th>Kutilgan</th><th>Qatnashdi</th><th>Kechikish</th><th>Davomat</th><th></th></tr></thead><tbody>'+rows.map(function(r){const cls=r.rate>=85?'ok':r.rate>=70?'warn':'blocked';return '<tr><td><b>'+esc(r.name)+'</b><small class="cell-sub">'+esc(r.groupId)+'</small></td><td>'+esc(r.students)+'</td><td>'+esc(r.weeklyLessons)+'</td><td>'+esc(r.expected)+'</td><td>'+esc(r.present)+'</td><td>'+esc(r.late)+'</td><td><span class="status '+cls+'">'+esc(r.rate)+'%</span></td><td><button class="ghost" data-group-drill="'+esc(r.groupId)+'">Talabalar</button></td></tr>'}).join('')+'</tbody></table>';
  all('[data-group-drill]').forEach(function(b){b.onclick=function(){openGroupDrilldown(b.dataset.groupDrill)}})
}
async function openGroupDrilldown(groupId){
  try{
    const p=new URLSearchParams({days:$('#analyticsRange')?.value||7});
    const x=await api('/analytics/group/'+encodeURIComponent(groupId)+'/students?'+p.toString());
    const rows=x.students||[];
    modal(x.group.name+' · talabalar davomat statistikasi',
      '<div class="drill-summary"><b>'+esc(x.days)+' kun</b><span>Har bir talaba uchun kutilgan qatnashuv: '+esc(x.expectedPerStudent)+'</span></div>'+
      '<div class="table-wrap drill-table"><table><thead><tr><th>Talaba</th><th>Login</th><th>Qatnashdi</th><th>Kechikdi</th><th>Daqiqa</th><th>Davomat</th></tr></thead><tbody>'+rows.map(function(r){const cls=r.rate>=85?'ok':r.rate>=70?'warn':'blocked';return '<tr><td>'+esc(r.fullName)+'</td><td>@'+esc(r.login)+'</td><td>'+esc(r.present)+' / '+esc(r.expected)+'</td><td>'+esc(r.late)+'</td><td>'+esc(r.minutes)+'</td><td><span class="status '+cls+'">'+esc(r.rate)+'%</span></td></tr>'}).join('')+'</tbody></table></div>',
      async()=>{}
    );
    $('#modalSave').classList.add('hidden');
  }catch(e){toast(e.message)}
}
async function editAttendance(id){
  const row=reportAttendanceCache.find(x=>String(x._id)===String(id));if(!row)return toast('Davomat yozuvi topilmadi');
  const labels={present:'Qatnashdi',late:'Kechikdi',absent:'Qatnashmadi',excused:'Sababli'};
  modal('Davomatni tuzatish',
    '<div class="guide"><b>'+esc(row.userId?.fullName||'Foydalanuvchi')+'</b><br>'+esc(row.schedule?.title||row.lessonId||'Dars')+'</div>'+
    '<label>Holat<select name="status">'+Object.entries(labels).map(function(e){return '<option value="'+e[0]+'" '+(row.status===e[0]?'selected':'')+'>'+e[1]+'</option>'}).join('')+'</select></label>'+
    '<label>Daqiqa<input name="minutes" type="number" min="0" max="600" value="'+esc(row.minutes||0)+'"></label>'+
    '<label>Sabab / izoh<input name="reason" maxlength="300" placeholder="Nega tuzatildi?"></label>',
    async d=>{await api('/attendance/'+id,{method:'PATCH',body:JSON.stringify(d)});await loadReports();if(can('analytics.view'))analyticsCache=null}
  )
}
async function loadReports(){if(!can('reports.view'))return;try{const days=$('#reportDays')?.value||14;const q=encodeURIComponent($('#auditSearch')?.value||'');const jobs=[api('/reports/attendance?days='+days),api('/audit?limit=300&q='+q),can('lessons.monitor')?api('/analytics/online').catch(function(){return []}):Promise.resolve([])];const out=await Promise.all(jobs),attendance=out[0],auditRows=out[1],online=out[2];reportAttendanceCache=attendance;$('#attendanceList').innerHTML='<table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Dars</th><th>Holat</th><th>Daqiqa</th><th></th></tr></thead><tbody>'+attendance.map(function(x){const labels={present:'Qatnashdi',late:'Kechikdi',absent:'Qatnashmadi',excused:'Sababli'},cls=x.status==='late'?'warn':x.status==='absent'?'blocked':'ok',action=can('attendance.manage')?'<button class="ghost" data-attendance-edit="'+esc(x._id)+'">Tuzatish</button>':'';return '<tr><td>'+(x.joinedAt?new Date(x.joinedAt).toLocaleString('uz-UZ'):'—')+'</td><td>'+esc(x.userId?.fullName||'—')+'<small class="cell-sub">@'+esc(x.userId?.login||'—')+'</small></td><td>'+esc(x.schedule?.title||x.lessonId||'—')+'<small class="cell-sub">'+esc(x.schedule?.groupId?.name||'')+'</small></td><td><span class="status '+cls+'">'+esc(labels[x.status]||x.status)+'</span></td><td>'+esc(x.minutes||0)+'</td><td>'+action+'</td></tr>'}).join('')+'</tbody></table>';all('[data-attendance-edit]').forEach(function(b){b.onclick=function(){editAttendance(b.dataset.attendanceEdit)}});$('#auditList').innerHTML=auditRows.map(function(x){return '<div><b>'+esc(x.action)+' · '+esc(x.entity)+'</b><span>'+esc(x.actorName||x.actorLogin||'Tizim')+'</span><br><small>'+new Date(x.createdAt).toLocaleString('uz-UZ')+' · '+esc(x.ip||'')+'</small></div>'}).join('')||'<p>Harakatlar tarixi bo‘sh.</p>';if(can('lessons.monitor'))$('#onlineUsers').innerHTML=online.map(function(x){return '<div><span class="online-dot"></span><div><b>'+esc(x.fullName)+'</b><small>@'+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</small></div><strong>'+esc(x.connections||1)+'</strong></div>'}).join('')||'<p class="muted">Hozir faol ulanish yo‘q.</p>'}catch(e){toast(e.message)}}
function csvRows(rows){return rows.map(function(r){return r.map(csvEscape).join(',')}).join('\n')}
$('#refreshAnalytics').onclick=loadAnalytics;$('#analyticsRange').onchange=loadAnalytics;
$('#analyticsFaculty').onchange=function(){const dep=$('#analyticsDepartment'),grp=$('#analyticsGroup');if(dep)dep.value='';if(grp)grp.value='';renderAnalyticsFilters()};
$('#analyticsDepartment').onchange=function(){const grp=$('#analyticsGroup');if(grp)grp.value='';renderAnalyticsFilters()};
$('#applyAnalyticsScope').onclick=loadAnalytics;
$('#clearAnalyticsScope').onclick=function(){if($('#analyticsFaculty'))$('#analyticsFaculty').value='';if($('#analyticsDepartment'))$('#analyticsDepartment').value='';if($('#analyticsGroup'))$('#analyticsGroup').value='';renderAnalyticsFilters();loadAnalytics()};
$('#refreshReports').onclick=loadReports;$('#reportDays').onchange=loadReports;
$('#exportAttendance').onclick=function(){
  if(!reportAttendanceCache.length)return toast('Eksport uchun davomat ma’lumoti yo‘q');
  const rows=[['vaqt','fio','login','dars','guruh','holat','daqiqa']];
  reportAttendanceCache.forEach(function(x){rows.push([x.joinedAt?new Date(x.joinedAt).toLocaleString('uz-UZ'):'',x.userId?.fullName||'',x.userId?.login||'',x.schedule?.title||x.lessonId||'',x.schedule?.groupId?.name||'',x.status||'',x.minutes||0])});
  downloadText('masofaviy2-davomat.csv','\ufeff'+csvRows(rows))
};let auditTimer;$('#auditSearch').oninput=function(){clearTimeout(auditTimer);auditTimer=setTimeout(loadReports,400)};
$('#exportAnalytics').onclick=function(){if(!analyticsCache)return toast('Avval statistikani yuklang');const x=analyticsCache,rows=[['statistika_doirasi',x.scope?.label||'Universitet'],[],['ko‘rsatkich','qiymat']];Object.entries(x.summary||{}).forEach(function(i){rows.push(i)});rows.push([],['sana','qatnashuv','kechikish','daqiqa']);(x.attendanceTrend||[]).forEach(function(r){rows.push([r.date,r.total,r.late,r.minutes])});rows.push([],['guruh','guruh_id','talaba','haftalik_dars','kutilgan','qatnashdi','kechikdi','davomat_foiz']);(x.groupPerformance||[]).forEach(function(r){rows.push([r.name,r.groupId,r.students,r.weeklyLessons,r.expected,r.present,r.late,r.rate])});downloadText('masofaviy2-statistika.csv','\ufeff'+csvRows(rows))};

async function loadAudit(){try{const rows=await api('/audit');$('#auditList').innerHTML=rows.map(x=>`<div><b>${esc(x.action)} · ${esc(x.entity)}</b><br><small>${new Date(x.createdAt).toLocaleString('uz-UZ')} · ${esc(x.ip)}</small></div>`).join('')||'<p>Harakatlar tarixi bo‘sh.</p>'}catch(e){$('#auditList').textContent=e.message}}
function connectSocket(){
  if(socket)socket.disconnect();
  socket=io();
  socket.on('connect',function(){$('#onlineBadge').textContent='● Onlayn'});
  socket.on('disconnect',function(){$('#onlineBadge').textContent='● Ulanish yo‘q'});
  socket.on('presence:count',function(x){$('#onlineBadge').textContent='● '+(x.online||0)+' onlayn'});
  socket.on('lesson:error',function(x){toast(x.message||'Darsga kirib bo‘lmadi')});
  socket.on('lesson:presence',function(x){if(x.userId===user?._id||x.fullName===user?.fullName)toast(x.status==='late'?'Darsga kirdingiz · kechikish qayd etildi':'Darsga kirdingiz · davomat qayd etildi')});
  socket.on('live:changed',function(){if($('#live')?.classList.contains('active'))loadLiveRooms()});
  socket.on('lesson:chat',function(m){$('#messages').insertAdjacentHTML('beforeend','<p><b>'+esc(m.fullName)+'</b><br>'+esc(m.text)+'</p>');$('#messages').scrollTop=$('#messages').scrollHeight});
  $('#chatForm').onsubmit=function(e){e.preventDefault();if(!activeLessonId)return toast('Avval jadvaldan darsga kiring');const input=e.target.querySelector('input');socket.emit('lesson:chat',{lessonId:activeLessonId,text:input.value});input.value=''};
}
window.addEventListener('popstate',async()=>{if(!user)return;const deep=location.hash.startsWith('#video=')?decodeURIComponent(location.hash.slice(7)):'';if(deep){try{await openVideoLesson(deep,false)}catch{go('videos')}}else if(activeVideoId){clearWatchPage();go('videos');loadVideoLessons()}});
hydrateIcons();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');start();

async function loadCourses(){
  try{$('#courseCompliance').classList.toggle('hidden',!['admin','superadmin'].includes(user.role));const rows=await api('/lms/courses');$('#courseDetail').innerHTML='';$('#courseList').innerHTML=rows.map(c=>'<article><h2>'+esc(c.title)+'</h2><p>'+esc(c.code)+' · '+esc(c.language)+' · '+esc(c.groupId?.name||'')+' · '+esc(c.teacherId?.fullName||'')+'</p><button class="primary" data-course="'+esc(c._id)+'">Ochish</button></article>').join('')||'<div class="empty">Hozircha fanlar biriktirilmagan.</div>';all('[data-course]').forEach(b=>b.onclick=()=>openCourse(b.dataset.course))}catch(e){toast(e.message)}
}
async function uploadCourseResource(courseId,data){
  if(!(data.file instanceof File)||!data.file.size)throw Error('Faylni tanlang');
  const body=new FormData();body.append('file',data.file);body.append('title',data.title||'');body.append('description',data.description||'');
  await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/lms/courses/'+encodeURIComponent(courseId)+'/resources/upload');xhr.withCredentials=true;xhr.setRequestHeader('X-CSRF-Token',csrf());xhr.upload.onprogress=e=>{if(e.lengthComputable&&$('#uploadProgress'))$('#uploadProgress').textContent='Yuklanmoqda: '+Math.round(e.loaded/e.total*100)+'%'};xhr.onload=()=>{const response=JSON.parse(xhr.responseText||'{}');if(xhr.status>=200&&xhr.status<300)resolve(response);else reject(Error(response.message||'Yuklashda xatolik'))};xhr.onerror=()=>reject(Error('Tarmoq xatosi'));xhr.send(body)});
}
$('#courseCompliance').onclick=async()=>{try{const x=await api('/lms/compliance');$('#courseDetail').innerHTML='<article><h2>Akademik tayyorlik</h2><p>Hisobot kiritilgan ma’lumotlarga asoslanadi. 1:50 me’yorining rasmiy talqini uchun OTM tasdig‘i kerak.</p><h3>Fansiz guruhlar</h3><p>'+esc(x.groupsWithoutCourses.map(g=>g.name).join(', ')||'Yo‘q')+'</p><h3>Fanlar</h3>'+x.courses.map(c=>'<p>'+esc(c.title)+' · '+esc(c.group)+' · '+esc(c.studentCount)+' talaba · '+Object.entries(c.checks).map(([k,v])=>esc(k)+': '+(v?'✓':'✗')).join(' · ')+'</p>').join('')+'<h3>O‘qituvchi yuklamasi</h3>'+x.teacherLoad.map(t=>'<p>'+esc(t.teacher)+' · '+esc(t.uniqueStudents)+' talaba'+(t.aboveFifty?' · 50 dan ko‘p':'')+'</p>').join('')+'</article>'}catch(e){toast(e.message)}};
async function openCourse(id){
  try{const [x,scorm]=await Promise.all([api('/lms/courses/'+id),api('/lms/courses/'+id+'/scorm')]),editor=user.role==='teacher'||['admin','superadmin'].includes(user.role);let html='<article><h2>'+esc(x.course.title)+'</h2><p>'+esc(x.course.code)+' · '+esc(x.course.language)+'</p>';
    if(x.course.syllabusUrl)html+='<p><a href="'+esc(x.course.syllabusUrl)+'" target="_blank" rel="noopener noreferrer">Fan dasturi ↗</a></p>';
    html+='<h3>Materiallar</h3>'+(x.resources.map(r=>{const source=r.fileId?'/api/lms/resources/'+encodeURIComponent(r._id)+'/content':r.url;const media=r.fileId&&(r.kind==='video'?'<video controls preload="none" style="max-width:100%;max-height:360px" src="'+esc(source)+'"></video>':r.kind==='audio'?'<audio controls preload="none" src="'+esc(source)+'"></audio>':r.kind==='image'?'<img loading="lazy" alt="'+esc(r.title)+'" style="max-width:100%;max-height:320px" src="'+esc(source)+'">':'');return '<div class="lesson-row"><div><b>'+esc(r.title)+'</b><small>'+esc(r.kind)+(r.size?' · '+Math.ceil(r.size/1024)+' KB':'')+'</small>'+(media?'<details><summary>Ko‘rish</summary>'+media+'</details>':'')+'</div><a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Ochish ↗</a>'+(editor?'<button data-delete-resource="'+esc(r._id)+'">O‘chirish</button>':'')+'</div>'}).join('')||'<p>Material yo‘q</p>');
    if(editor)html+='<button id="newResource">+ Havola</button> <button id="uploadResource">+ Fayl yuklash</button> <button id="newAssignment">+ Topshiriq</button> <button id="newQuiz">+ Test</button> <button id="courseResults">Yakuniy natijalar</button>';
    html+='<h3>Topshiriqlar</h3>'+(x.assignments.map(a=>'<div class="lesson-row"><div><b>'+esc(a.title)+'</b><small>'+esc(({assignment:'Topshiriq',independent_work:'Mustaqil ish',practice:'Amaliyot'})[a.category]||'Topshiriq')+'</small><p>'+esc(a.instructions)+'</p><small>Muddat: '+esc(a.dueAt?new Date(a.dueAt).toLocaleString('uz-UZ'):'belgilanmagan')+'</small></div><button data-assignment="'+esc(a._id)+'">'+(user.role==='student'?'Javob berish':'Javoblarni ko‘rish')+'</button></div>').join('')||'<p>Topshiriq yo‘q</p>');
    html+='<h3>SCORM paketlar</h3>'+(scorm.map(p=>'<p>'+esc(p.title)+' · '+esc(p.standard)+' '+(user.role==='student'?'<button data-scorm="'+esc(p._id)+'">Ochish</button>':'')+'</p>').join('')||'<p>Paket yo‘q</p>')+(editor?'<label>SCORM ZIP (8 MB gacha)<input id="scormFile" type="file" accept=".zip"></label><button id="uploadScorm">Yuklash</button>':'')+'<div id="scormPlayer"></div>';
    html+='<h3>Testlar</h3>'+(x.quizzes.map(q=>'<p>'+esc(q.title)+(q.proctorRequired?' · Imtihon oynasi nazorati':'')+' <button '+(user.role==='student'?'data-quiz':'data-quiz-review')+'="'+esc(q._id)+'">'+(user.role==='student'?'Boshlash':'Urinishlar')+'</button></p>').join('')||'<p>Test yo‘q</p>')+'</article>';
    $('#courseDetail').innerHTML=html;
    $('#newResource')?.addEventListener('click',()=>modal('Material qo‘shish','<label>Sarlavha<input name="title" required></label><label>Turi<select name="kind"><option value="document">Hujjat</option><option value="video">Video</option><option value="link">Havola</option></select></label><label>HTTPS havola<input name="url" type="url" required></label><label>Izoh<textarea name="description"></textarea></label>',async d=>{await api('/lms/courses/'+id+'/resources',{method:'POST',body:JSON.stringify(d)});openCourse(id)}));
    $('#uploadResource')?.addEventListener('click',()=>modal('Fayl yuklash','<label>Fayl (PDF, Word, Excel, PowerPoint, rasm, audio, video, matn, ZIP)<input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.epub,.txt,.md,.csv,.srt,.vtt,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.webm,.mov,.mkv,.avi,.zip,.rar,.7z" required></label><label>Nom<input name="title" placeholder="Fayl nomi bo‘lsa bo‘sh qoldiring"></label><label>Izoh<textarea name="description"></textarea></label><p id="uploadProgress" role="status"></p>',async d=>{await uploadCourseResource(id,d);openCourse(id)}));
    all('[data-delete-resource]').forEach(b=>b.onclick=async()=>{if(!confirm('Resurs o‘chirilsinmi?'))return;try{await api('/lms/resources/'+b.dataset.deleteResource,{method:'DELETE'});openCourse(id)}catch(e){toast(e.message)}});
    $('#newAssignment')?.addEventListener('click',()=>modal('Topshiriq qo‘shish','<label>Turi<select name="category"><option value="assignment">Topshiriq</option><option value="independent_work">Mustaqil ish</option><option value="practice">Amaliyot</option></select></label><label>Sarlavha<input name="title" required></label><label>Ko‘rsatma<textarea name="instructions" required></textarea></label><label>Topshirish muddati<input name="dueAt" type="datetime-local"></label><label>Maksimal ball<input name="maxScore" type="number" value="100" min="1"></label>',async d=>{await api('/lms/courses/'+id+'/assignments',{method:'POST',body:JSON.stringify(d)});openCourse(id)}));
    $('#newQuiz')?.addEventListener('click',()=>modal('Test yaratish','<label>Nomi<input name="title" required></label><label>Daqiqa<input name="durationMinutes" type="number" min="1" max="240" value="30" required></label><label>Savollar JSON: [{"prompt":"Savol?","options":["A","B"],"correctIndex":0}]<textarea name="questionsJson" required></textarea></label><label><input name="proctorRequired" type="checkbox" value="true"> Imtihon oynasi va kamera holatini qayd etish</label>',async d=>{const questions=JSON.parse(d.questionsJson);await api('/lms/courses/'+id+'/quizzes',{method:'POST',body:JSON.stringify({...d,questions,published:true,proctorRequired:d.proctorRequired==='true'})});openCourse(id)}));
    all('[data-assignment]').forEach(b=>b.onclick=async()=>{const aid=b.dataset.assignment;if(user.role==='student')modal('Topshiriqni topshirish','<label>Javob<textarea name="text"></textarea></label><label>HTTPS havola<input name="url" type="url"></label>',async d=>{await api('/lms/assignments/'+aid+'/submit',{method:'POST',body:JSON.stringify(d)});openCourse(id)});else{const rows=await api('/lms/assignments/'+aid+'/submissions');$('#courseDetail').innerHTML+='<article><h3>Talabalar javoblari</h3>'+rows.map(s=>'<p>'+esc(s.studentId?.fullName||'')+': '+esc(s.text||s.url||'')+' · '+esc(s.score??'Baholanmagan')+' <button data-grade="'+esc(s._id)+'" data-graded="'+(s.gradedAt?'1':'0')+'">'+(s.gradedAt?'Tuzatish so‘rovi':'Baholash')+'</button></p>').join('')+'</article>';all('[data-grade]').forEach(g=>g.onclick=()=>modal(g.dataset.graded==='1'?'Bahoni tuzatish so‘rovi':'Javobni baholash',g.dataset.graded==='1'?'<label>Yangi ball<input name="newScore" type="number" min="0" required></label><label>Sabab<textarea name="reason" minlength="10" required></textarea></label>':'<label>Ball<input name="score" type="number" min="0" required></label><label>Izoh<textarea name="feedback"></textarea></label>',async d=>{await api('/lms/submissions/'+g.dataset.grade+(g.dataset.graded==='1'?'/grade-change':'/grade'),{method:g.dataset.graded==='1'?'POST':'PATCH',body:JSON.stringify(d)});openCourse(id)}))}});
    $('#courseResults')?.addEventListener('click',()=>manageCourseResults(id));
    all('[data-quiz]').forEach(b=>b.onclick=()=>startCourseQuiz(b.dataset.quiz));
    all('[data-quiz-review]').forEach(b=>b.onclick=()=>reviewCourseQuiz(b.dataset.quiz));
    $('#uploadScorm')?.addEventListener('click',async()=>{const file=$('#scormFile').files[0];if(!file||file.size>8*1024*1024)return toast('8 MB gacha ZIP tanlang');try{const contentBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});await api('/lms/courses/'+id+'/scorm',{method:'POST',body:JSON.stringify({title:file.name,contentBase64})});openCourse(id)}catch(e){toast(e.message)}});
    all('[data-scorm]').forEach(b=>b.onclick=()=>launchScorm(b.dataset.scorm));
  }catch(e){toast(e.message)}
}
async function manageCourseResults(courseId){
  modal('Akademik davr','<label>O‘quv yili<input name="academicYear" value="2026/2027" pattern="\\d{4}/\\d{4}" required></label><label>Semestr<input name="semester" type="number" min="1" max="12" value="1" required></label>',async d=>{await showCourseResults(courseId,d.academicYear,Number(d.semester))});
}
async function showCourseResults(courseId,academicYear,semester){
  const [roster,allResults]=await Promise.all([api('/lms/academic/course/'+courseId+'/students'),api('/lms/academic/results/course/'+courseId)]);
  const results=allResults.filter(r=>r.academicYear===academicYear&&Number(r.semester)===Number(semester)),byStudent=new Map(results.map(r=>[String(r.studentId?._id||r.studentId),r]));
  $('#academicResultPanel')?.remove();
  $('#courseDetail').innerHTML+='<article id="academicResultPanel"><h3>Yakuniy natijalar · '+esc(academicYear)+' · '+esc(semester)+'-semestr</h3><p>Yakuniy nazorat 559-son qaror bo‘yicha OTMda shaxsan o‘tkaziladi; bu yerda uning tasdiqlangan natijasi qayd etiladi.</p>'+roster.students.map(s=>{const r=byStudent.get(String(s._id));return '<div class="lesson-row"><div><b>'+esc(s.fullName)+'</b><small>'+esc(s.login)+' · '+(r?(esc(r.totalScore)+' ball'+(r.gradeLabel?' · '+esc(r.gradeLabel):'')+' · '+esc(r.status)):'Natija kiritilmagan')+'</small></div><button data-academic-student="'+esc(s._id)+'">'+(r?'Tahrirlash':'Natija kiritish')+'</button></div>'}).join('')+'</article>';
  all('[data-academic-student]').forEach(b=>{const s=roster.students.find(x=>String(x._id)===String(b.dataset.academicStudent)),r=byStudent.get(String(s._id)),canFinalize=['admin','superadmin'].includes(user.role);b.onclick=()=>modal('Natija · '+s.fullName,'<label>Joriy ball<input name="continuousScore" type="number" min="0" max="100" step="0.01" value="'+esc(r?.continuousScore??0)+'" required></label><label>Yakuniy ball<input name="finalScore" type="number" min="0" max="100" step="0.01" value="'+esc(r?.finalScore??0)+'" required></label><label>Umumiy ball<input name="totalScore" type="number" min="0" max="100" step="0.01" value="'+esc(r?.totalScore??0)+'" required></label><label>Berilgan kredit<input name="creditsAwarded" type="number" min="0" max="'+esc(roster.course.credits||0)+'" step="0.01" value="'+esc(r?.creditsAwarded??0)+'" required></label><label>Izoh<textarea name="note">'+esc(r?.note||'')+'</textarea></label>'+(r?.status==='final'?'<label>O‘zgartirish sababi<textarea name="revisionReason" minlength="10"></textarea></label>':'')+(canFinalize?'<label><input name="finalize" type="checkbox" value="true" '+(r?.status==='final'?'checked':'')+'> Administrator sifatida yakuniy tasdiqlash</label>':''),async d=>{await api('/lms/academic/results',{method:'POST',body:JSON.stringify({...d,studentId:s._id,courseId,academicYear,semester,finalize:d.finalize==='true'})});await showCourseResults(courseId,academicYear,semester)})});
}
async function renderStudentAcademic(student,adminMode=false){
  const [plan,transcript,movements]=await Promise.all([api('/lms/academic/plan/'+student._id),api('/lms/academic/transcript/'+student._id),api('/lms/academic/movements/'+student._id)]);
  const planHtml=plan.plans.map(p=>'<div class="lesson-row"><div><b>'+esc(p.academicYear)+' · '+esc(p.semester)+'-semestr</b><small>'+esc(p.items.reduce((n,x)=>n+(Number(x.credits)||0),0))+' kredit</small><p>'+p.items.map(x=>esc(x.courseId?.title||'Fan')+' · '+esc(x.credits)+' kr · '+esc(x.status)).join('<br>')+'</p></div></div>').join('')||'<p>Individual reja hali tasdiqlanmagan.</p>';
  const transcriptHtml=transcript.results.map(r=>'<div class="lesson-row"><div><b>'+esc(r.courseId?.title||'Fan')+'</b><small>'+esc(r.academicYear)+' · '+esc(r.semester)+'-semestr · '+esc(r.totalScore)+' ball'+(r.gradeLabel?' · '+esc(r.gradeLabel):'')+' · '+esc(r.creditsAwarded)+' kredit</small></div></div>').join('')||'<p>Yakuniy akademik natija hali yo‘q.</p>';
  const movementHtml=movements.map(m=>'<p><b>'+esc(m.kind)+'</b> · '+new Date(m.effectiveAt).toLocaleDateString('uz-UZ')+(m.documentNo?' · '+esc(m.documentNo):'')+(m.reason?' · '+esc(m.reason):'')+'</p>').join('')||'<p>Talaba harakati qaydi yo‘q.</p>';
  $('#courseDetail').innerHTML='<article><h2>'+esc(student.fullName||plan.student?.fullName||'Talaba')+'</h2><h3>Individual o‘quv reja</h3>'+planHtml+'<h3>Transkript va kreditlar</h3><p><b>Jami tasdiqlangan kredit:</b> '+esc(transcript.creditsAwarded||0)+'</p>'+transcriptHtml+'<h3>Talaba harakati</h3>'+movementHtml+(adminMode?'<div class="head-actions"><button id="approveStudentPlan" class="primary">Rejani tasdiqlash</button><button id="addStudentMovement">Harakat qo‘shish</button></div>':'')+'</article>';
  if(adminMode){
    $('#approveStudentPlan').onclick=async()=>{const courses=(await api('/lms/courses')).filter(c=>String(c.groupId?._id||c.groupId)===String(student.groupId?._id||student.groupId));if(!courses.length)return toast('Talaba guruhiga fan biriktirilmagan');modal('Individual reja','<label>O‘quv yili<input name="academicYear" value="2026/2027" pattern="\\d{4}/\\d{4}" required></label><label>Semestr<input name="semester" type="number" min="1" max="12" value="1" required></label><p>Rejaga kiritiladigan fanlar:</p>'+courses.map(c=>'<label><input type="checkbox" name="courseId" value="'+esc(c._id)+'" checked> '+esc(c.title)+' · '+esc(c.credits||0)+' kredit</label>').join('')+'<label>Izoh<textarea name="notes"></textarea></label>',async d=>{const ids=(Array.isArray(d.courseId)?d.courseId:[d.courseId]).filter(Boolean),items=ids.map(id=>{const course=courses.find(c=>String(c._id)===String(id));return {courseId:id,credits:Number(course?.credits)||0,required:true,status:'planned'}});await api('/lms/academic/plan/'+student._id,{method:'PUT',body:JSON.stringify({academicYear:d.academicYear,semester:Number(d.semester),items,notes:d.notes})});await renderStudentAcademic(student,true)})};
    $('#addStudentMovement').onclick=()=>modal('Talaba harakati','<label>Turi<select name="kind"><option value="admission">Qabul</option><option value="transfer_in">Ko‘chirib kelish</option><option value="transfer_out">Ko‘chirish</option><option value="expulsion">Chetlashtirish</option><option value="reinstatement">Qayta tiklash</option><option value="promotion">Kursdan kursga o‘tkazish</option><option value="group_change">Guruhni almashtirish</option><option value="graduation">Bitirish</option></select></label><label>Kuchga kirish sanasi<input name="effectiveAt" type="date" required></label><label>Buyruq/hujjat raqami<input name="documentNo"></label><label>Asos<textarea name="reason"></textarea></label>',async d=>{await api('/lms/academic/movements',{method:'POST',body:JSON.stringify({...d,studentId:student._id,fromGroupId:student.groupId?._id||student.groupId||undefined})});await renderStudentAcademic(student,true)});
  }
}
$('#myAcademic')?.addEventListener('click',()=>renderStudentAcademic(user,false).catch(e=>toast(e.message)));
$('#manageAcademic')?.addEventListener('click',()=>modal('Talabani topish','<label>Login yoki F.I.Sh.<input name="q" required></label>',async d=>{const rows=await api('/users?role=student&q='+encodeURIComponent(d.q)),student=rows.find(x=>x.login===String(d.q).toLowerCase())||rows[0];if(!student)throw Error('Talaba topilmadi');await renderStudentAcademic(student,true)}));

let scormListener=null;
async function launchScorm(id){try{const launch=await api('/lms/scorm/'+id+'/launch',{method:'POST'});if(scormListener)removeEventListener('message',scormListener);const frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';frame.title='SCORM dars';frame.style.cssText='width:100%;height:65vh;border:1px solid #bbb;border-radius:10px';$('#scormPlayer').replaceChildren(frame);scormListener=event=>{if(event.source!==frame.contentWindow||event.data?.token!==launch.token)return;if(event.data.kind==='scorm-ready')frame.contentWindow.postMessage({kind:'scorm-state',token:launch.token,values:launch.values},'*');if(event.data.kind==='scorm-progress')api('/lms/scorm/'+id+'/progress',{method:'POST',body:JSON.stringify({token:launch.token,values:event.data.values})}).catch(e=>toast(e.message))};addEventListener('message',scormListener);frame.src=launch.url}catch(e){toast(e.message)}}
async function startCourseQuiz(id){try{const consent=confirm('Agar nazorat talab qilinsa, brauzer kamera va mikrofon ruxsatini so‘raydi. Tasvir saqlanmaydi; oynadan chiqish va yuz mavjudligi kabi hodisalar qayd etilishi mumkin. Davom etasizmi?');if(!consent)return;const x=await api('/lms/quizzes/'+id+'/start',{method:'POST',body:JSON.stringify({consent:true})});const stop=x.proctorRequired?await startExamSignals(x.attemptId):()=>{};const fields=x.questions.map((q,i)=>'<fieldset><legend>'+esc(q.prompt)+'</legend>'+q.options.map((option,j)=>'<label><input type="radio" name="q'+i+'" value="'+j+'" required> '+esc(option)+'</label>').join('')+'</fieldset>').join('');modal('Test: '+x.durationMinutes+' daqiqa',fields,async d=>{const answers=x.questions.map((_,i)=>Number(d['q'+i]));const result=await api('/lms/attempts/'+x.attemptId+'/submit',{method:'POST',body:JSON.stringify({answers})});stop();toast('Natija: '+Math.round(result.score)+'%')});$('#modal').addEventListener('close',stop,{once:true})}catch(e){toast(e.message)}}
async function reviewCourseQuiz(id){try{const rows=await api('/lms/quizzes/'+id+'/attempts');$('#courseDetail').innerHTML+='<article><h3>Test urinishlari</h3>'+rows.map(r=>'<div class="lesson-row"><div><b>'+esc(r.studentId?.fullName||'')+'</b><small>'+Math.round(r.score||0)+'% · '+esc(r.reviewDecision)+' · '+esc(r.proctorEvents?.map(e=>e.type).join(', ')||'Signal yo‘q')+'</small></div><button data-review-attempt="'+esc(r._id)+'">Ko‘rib chiqish</button></div>').join('')+'</article>';all('[data-review-attempt]').forEach(b=>b.onclick=()=>modal('Imtihon signalini ko‘rib chiqish','<label>Qaror<select name="decision"><option value="cleared">Ko‘rib chiqildi</option><option value="needs_review">Qo‘shimcha tekshiruv</option></select></label><label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/lms/attempts/'+b.dataset.reviewAttempt+'/review',{method:'PATCH',body:JSON.stringify(d)});reviewCourseQuiz(id)}))}catch(e){toast(e.message)}}
async function startExamSignals(attemptId){let camera=null,microphone=null,timer=null,detector=null,audioContext=null,analyser=null,busy=false,stopped=false,lastSound=0;const send=type=>api('/lms/attempts/'+attemptId+'/proctor-events',{method:'POST',body:JSON.stringify({type})}).catch(()=>{});const visibility=()=>{if(document.hidden)send('page_hidden')},blur=()=>send('window_blur');document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);
  try{camera=await navigator.mediaDevices.getUserMedia({video:{width:320,height:240},audio:false});send('camera_ready')}catch{send('camera_unavailable')}
  try{microphone=await navigator.mediaDevices.getUserMedia({video:false,audio:true});const AudioContext=window.AudioContext||window.webkitAudioContext;if(AudioContext){audioContext=new AudioContext();analyser=audioContext.createAnalyser();analyser.fftSize=2048;audioContext.createMediaStreamSource(microphone).connect(analyser)}}catch{send('microphone_unavailable')}
  if(camera){const video=document.createElement('video');video.srcObject=camera;video.muted=true;video.playsInline=true;await video.play().catch(()=>{});
    try{if('FaceDetector'in window)detector={kind:'native',instance:new FaceDetector({fastMode:true,maxDetectedFaces:2})};else{if(!window.FaceDetection){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/face-detection/face_detection.js';script.onload=resolve;script.onerror=reject;document.head.append(script)})}const instance=new window.FaceDetection({locateFile:file=>'/vendor/face-detection/'+file});instance.setOptions({model:'short',minDetectionConfidence:0.5});instance.onResults(result=>{if(stopped)return;const n=result.detections?.length||0;if(n===0)send('face_missing');if(n>1)send('multiple_faces')});detector={kind:'mediapipe',instance}}}catch{send('face_detector_unavailable')}
    timer=setInterval(async()=>{if(stopped||busy)return;busy=true;try{if(detector&&video.readyState>=2){if(detector.kind==='native'){const n=(await detector.instance.detect(video)).length;if(n===0)send('face_missing');if(n>1)send('multiple_faces')}else await detector.instance.send({image:video})}if(analyser){const samples=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(samples);let power=0;for(const value of samples)power+=(value-128)**2;const rms=Math.sqrt(power/samples.length)/128;if(rms>0.3&&Date.now()-lastSound>30000){lastSound=Date.now();send('ambient_sound')}}}catch{if(detector){detector.instance.close?.();detector=null;send('face_detector_unavailable')}}finally{busy=false}},8000)
  }
  return ()=>{if(stopped)return;stopped=true;clearInterval(timer);detector?.instance.close?.();camera?.getTracks().forEach(t=>t.stop());microphone?.getTracks().forEach(t=>t.stop());audioContext?.close().catch(()=>{});document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur)};
}
$('#addCourse').onclick=async()=>{try{const [groups,teachers]=await Promise.all([api('/structure?type=group'),api('/teachers')]);modal('Fan qo‘shish','<label>Kod<input name="code" required></label><label>Fan nomi<input name="title" required></label><label>Ta’lim tili<input name="language" value="uz" required></label><label>Kredit<input name="credits" type="number" min="0"></label><label>Fan dasturi HTTPS havolasi<input name="syllabusUrl" type="url"></label><label>Guruh<select name="groupId">'+groups.map(g=>'<option value="'+esc(g._id)+'">'+esc(g.name)+'</option>').join('')+'</select></label><label>O‘qituvchi<select name="teacherId">'+teachers.map(t=>'<option value="'+esc(t._id)+'">'+esc(t.fullName)+'</option>').join('')+'</select></label>',async d=>{await api('/lms/courses',{method:'POST',body:JSON.stringify(d)});loadCourses()})}catch(e){toast(e.message)}};
$('#reviewGrades').onclick=async()=>{try{const rows=await api('/lms/grade-changes');$('#courseDetail').innerHTML='<article><h2>Kutilayotgan baho so‘rovlari</h2>'+rows.map(r=>'<div class="lesson-row"><div><b>'+esc(r.requestedBy?.fullName||'')+'</b><p>'+esc(r.oldScore)+' → '+esc(r.newScore)+' · '+esc(r.reason)+'</p></div><button data-review="'+esc(r._id)+'" data-decision="approved">Tasdiqlash</button><button data-review="'+esc(r._id)+'" data-decision="rejected">Rad etish</button></div>').join('')+'</article>';all('[data-review]').forEach(b=>b.onclick=()=>modal('Baho so‘rovini ko‘rib chiqish','<label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/lms/grade-changes/'+b.dataset.review+'/review',{method:'POST',body:JSON.stringify({...d,decision:b.dataset.decision})});$('#reviewGrades').click()}))}catch(e){toast(e.message)}};
