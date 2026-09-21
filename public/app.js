const $=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)]; let token=localStorage.token||'', user=null, structureType='faculty', cache={structure:[],analyticsStructures:[]}, effectivePermissions=[], socket=null, activeLessonId='', reportAttendanceCache=[];
const roleName={superadmin:'Bosh administrator',admin:'Administrator',tech:'Texnik xodim',rectorate:'Rektorat',dean:'Dekan',department:'Kafedra mudiri',teacher:'O‘qituvchi',student:'Talaba',tutor:'Tyutor'};
const can=p=>effectivePermissions.includes('*')||effectivePermissions.includes(p);
const api=async(path,options={})=>{const r=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...options.headers}});const data=await r.json().catch(()=>({}));if(r.status===401){logout();throw Error(data.message)}if(!r.ok)throw Error(data.message||'Xatolik');return data};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}; const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function logout(){localStorage.removeItem('token');token='';user=null;$('#shell').classList.add('hidden');$('#login').classList.remove('hidden')}
function configureRoleUI(){const role=user.role;$('#roleLabel').textContent=roleName[role]||role;$('#headerName').textContent=user.fullName||user.login||'';const show={analytics:can('analytics.view'),structure:can('structure.manage')||['dean','department'].includes(role),users:can('users.manage'),reports:can('reports.view')};Object.entries(show).forEach(([page,ok])=>{const b=$(`nav button[data-page="${page}"]`);if(b)b.classList.toggle('hidden',!ok)});$('#dashboardAddSchedule')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleAdminActions')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleFilters')?.classList.toggle('hidden',!can('schedule.manage'));$('#usersAdminActions')?.classList.toggle('hidden',!can('users.manage'));$('#addStructure')?.classList.toggle('hidden',!can('structure.manage'));$('#onlinePanel')?.classList.toggle('hidden',!can('lessons.monitor'));}
function go(id){all('.page').forEach(x=>x.classList.toggle('active',x.id===id));all('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));$('#sidebar').classList.remove('open');({dashboard:loadDashboard,analytics:loadAnalytics,structure:loadStructure,schedule:loadSchedules,users:loadUsers,reports:loadReports,profile:loadProfile}[id]||(()=>{}))()}
async function start(){if(!token)return logout();try{const x=await api('/me');user=x.user;effectivePermissions=x.effectivePermissions||[];$('#login').classList.add('hidden');$('#shell').classList.remove('hidden');configureRoleUI();await loadDashboard();connectSocket();if(user.mustChangePassword&&user._id!=='demo')setTimeout(()=>{go('profile');toast('Xavfsizlik uchun vaqtinchalik parolni almashtiring')},250)}catch{logout()}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const x=await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});token=x.token;localStorage.token=token;start()}catch(err){$('#loginError').textContent=err.message}};
all('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));all('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$('#logoutBtn').onclick=logout;$('#profileBtn').onclick=()=>go('profile');$('#themeBtn').onclick=()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'':'dark';localStorage.theme=dark?'':'dark'};document.documentElement.dataset.theme=localStorage.theme||'';
async function loadDashboard(){
  const x=await api('/dashboard'),role=x.role||user.role;
  const cfg=role==='teacher'?['O‘qituvchi ish stoli','Bugungi darslaringiz, guruhlaringiz va davomat holati','Darsdan oldin kamera, mikrofon va materiallarni tekshirib oling.']:role==='student'?['Talaba bosh sahifasi','Bugungi darslar va shaxsiy davomat ko‘rsatkichlaringiz','Jadvaldagi dars vaqtini tekshiring va mashg‘ulotdan oldin tayyor bo‘ling.']:['Boshqaruv markazi',x.scope?x.scope+' bo‘yicha bugungi ta’lim jarayoni':'Bugungi ta’lim jarayonini bir joydan kuzating','Avval tuzilma va akkauntlarni tayyorlang, so‘ng jadvalni biriktiring.'];
  $('#dashboardTitle').textContent=cfg[0];$('#dashboardSubtitle').textContent=cfg[1];$('#dashboardGuide').textContent=cfg[2];
  $('#stats').innerHTML=(x.stats||[]).map(i=>'<div class="stat"><b>'+esc(i.value)+'</b><span>'+esc(i.label)+'</span></div>').join('');
  $('#todayLessons').innerHTML=(x.today||[]).slice(0,8).map(scheduleRow).join('')||'<p>Bugun uchun dars topilmadi.</p>';bindScheduleActions();
  const q=$('#quickManagement');
  q.innerHTML=role==='teacher'?'<button data-go="schedule"><b>📅 Mening jadvalim</b><span>Haftalik darslaringiz</span></button><button data-go="lesson"><b>🎥 Jonli dars</b><span>Mashg‘ulot xonasiga o‘tish</span></button><button data-go="profile"><b>👤 Shaxsiy profil</b><span>Akkaunt ma’lumotlari</span></button>':role==='student'?'<button data-go="schedule"><b>📅 Dars jadvalim</b><span>Guruhingiz haftalik rejasi</span></button><button data-go="lesson"><b>🎥 Jonli dars</b><span>Dars xonasiga kirish</span></button><button data-go="profile"><b>👤 Shaxsiy profil</b><span>Akkaunt ma’lumotlari</span></button>':'<button data-go="analytics"><b>📈 Statistika markazi</b><span>Davomat, guruh va o‘qituvchi ko‘rsatkichlari</span></button><button data-go="users"><b>👥 Akkauntlar</b><span>Import, nazorat va huquqlar</span></button><button data-go="reports"><b>🛡 Nazorat</b><span>Davomat, onlayn va audit tarixi</span></button>';
  q.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
  const health=$('#dashboardHealth');
  if(['superadmin','admin','tech'].includes(role)){
    try{const m=await api('/system/metrics');health.classList.remove('hidden');health.innerHTML='<b>Tizim holati:</b><span>DB: '+esc(m.database)+'</span><span>Onlayn: '+esc(m.onlineUsers)+'</span><span>Socket: '+esc(m.socketConnections)+'</span><span>RAM: '+esc(m.memory?.rssMB||0)+' MB</span><span>Uptime: '+esc(Math.floor((m.uptimeSeconds||0)/60))+' daqiqa</span>'}catch{health.classList.add('hidden')}
  }else health.classList.add('hidden');
}
function scheduleRow(i){
  const group=i.groupId?.name||'',gid=i.groupId?.externalId||i.groupId?.code||'',teacher=i.teacherId?.fullName||'',canJoin=['teacher','student'].includes(user?.role)||can('lessons.monitor');
  let actions='';
  if(canJoin)actions+='<button class="join-btn" data-join-lesson="'+esc(i._id)+'">Kirish</button>';
  if(can('schedule.manage'))actions+='<button class="ghost danger-text" data-del-schedule="'+esc(i._id)+'">O‘chirish</button>';
  return '<div class="lesson-row"><time>'+esc(i.start)+'–'+esc(i.end)+'</time><div><b>'+esc(i.title)+'</b><small>'+esc(i.subject||'')+(group?' · '+esc(group):'')+(gid?' ['+esc(gid)+']':'')+(teacher?' · '+esc(teacher):'')+(i.room?' · '+esc(i.room)+'-xona':'')+'</small></div><span>'+(['','Du','Se','Ch','Pa','Ju','Sh','Ya'][i.weekday]||esc(i.date))+'</span><div class="row-actions">'+actions+'</div></div>';
}
function bindScheduleActions(){
  all('[data-del-schedule]').forEach(function(b){b.onclick=async function(){if(confirm('Dars o‘chirilsinmi?')){try{await api('/schedules/'+b.dataset.delSchedule,{method:'DELETE'});loadSchedules()}catch(e){toast(e.message)}}}});
  all('[data-join-lesson]').forEach(function(b){b.onclick=function(){joinLesson(b.dataset.joinLesson)}});
}
function joinLesson(id){
  if(!socket||!socket.connected)return toast('Server bilan real-time aloqa yo‘q');
  activeLessonId=id; socket.emit('lesson:join',{lessonId:id}); go('lesson'); toast('Darsga ulanish so‘rovi yuborildi');
}
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
$('#addSchedule').onclick=async()=>{const [groups,users]=await Promise.all([api('/structure?type=group'),api('/teachers').catch(()=>[])]);modal('Dars qo‘shish',`<label>Dars nomi<input name="title" required></label><label>Fan<input name="subject"></label><label>Guruh ID<select name="groupId" required>${groups.filter(x=>x.active).map(x=>`<option value="${esc(x.externalId||x.code||x._id)}">${esc(x.name)} — ${esc(x.externalId||x.code||x._id)}</option>`)}</select></label><label>O‘qituvchi<select name="teacherId" required>${users.map(x=>`<option value="${x._id}">${esc(x.fullName)} (@${esc(x.login)})</option>`)}</select></label><label>Hafta kuni<select name="weekday">${['Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'].map((x,i)=>`<option value="${i+1}">${x}</option>`)}</select></label><label>Boshlanish<input name="start" type="time" required></label><label>Tugash<input name="end" type="time" required></label><label>Xona<input name="room" placeholder="Masalan: 201"></label><label>Turi<select name="kind"><option value="lecture">Ma’ruza</option><option value="practice">Amaliyot</option><option value="seminar">Seminar</option><option value="exam">Imtihon</option></select></label>`,async d=>{d.weekday=Number(d.weekday);await api('/schedules',{method:'POST',body:JSON.stringify(d)});loadSchedules()})};
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
    '<label>Guruh ID<select name="groupId"><option value="">Biriktirilmagan</option>'+groups.map(x=>'<option value="'+esc(ext(x))+'">'+esc(x.name)+' — '+esc(ext(x))+'</option>').join('')+'</select></label>',
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
$('#userTemplate').onclick=()=>downloadText('foydalanuvchilar-template.csv','\ufefffull_name,login,role,password,faculty_id,department_id,group_id,email,phone\nAli Valiyev,ali.valiyev,student,Temp12345,FAC-01,DEP-01,ATT-101,,+998901234567\nOlim Karimov,olim.karimov,teacher,Temp12345,FAC-01,DEP-01,,,');
$('#scheduleTemplate').onclick=()=>downloadText('dars-jadvali-template.csv','\ufefftitle,subject,group_id,teacher_login,weekday,start,end,room,kind\nMatematika,Matematika,ATT-101,olim.karimov,1,08:30,09:50,201,lecture');
async function loadProfile(){try{const x=await api('/profile'),u=x.user,initials=(u.fullName||u.login||'?').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();$('#profileCard').innerHTML='<div class="avatar big">'+esc(initials)+'</div><div><h2>'+esc(u.fullName)+'</h2><p>@'+esc(u.login)+' · '+esc(roleName[u.role]||u.role)+'</p><span class="role-chip">'+esc(roleName[u.role]||u.role)+'</span></div>';const form=$('#profileForm');form.fullName.value=u.fullName||'';form.email.value=u.email||'';form.phone.value=u.phone||'';form.avatarUrl.value=u.avatarUrl||'';form.bio.value=u.bio||'';$('#profileOrg').innerHTML='<p><b>Fakultet:</b> '+esc(u.facultyId?.name||u.faculty||'—')+'</p><p><b>Kafedra:</b> '+esc(u.departmentId?.name||u.department||'—')+'</p><p><b>Guruh:</b> '+esc(u.groupId?.name||u.group||'—')+'</p>';const base=location.origin+'/timetable.html?';let link='';if(u.role==='teacher')link=base+'teacher='+encodeURIComponent(u.login);if(u.role==='student'){const gid=u.groupId?.externalId||u.groupId?.code||u.group;if(gid)link=base+'group='+encodeURIComponent(gid)}$('#profileTimetable').innerHTML=link?linkBox('Shaxsiy jadval havolasi',link):''}catch(e){toast(e.message)}}
$('#profileForm').onsubmit=async e=>{e.preventDefault();try{await api('/profile',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Profil yangilandi');const me=await api('/me');user=me.user;configureRoleUI();loadProfile()}catch(err){toast(err.message)}};
$('#passwordForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.newPassword!==d.confirmPassword)return toast('Yangi parollar bir xil emas');try{await api('/profile/password',{method:'PATCH',body:JSON.stringify({currentPassword:d.currentPassword,newPassword:d.newPassword})});e.target.reset();toast('Parol yangilandi')}catch(err){toast(err.message)}};


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
async function loadAnalytics(){if(!can('analytics.view'))return;try{await ensureAnalyticsFilters();const query=analyticsQuery(),out=await Promise.all([api('/analytics/overview?'+query),api('/analytics/groups?'+query)]),x=out[0],groupData=out[1];analyticsCache=x;const v=x.summary||{};$('#analyticsScopeLabel').textContent='Statistika doirasi: '+(x.scope?.label||'Universitet');$('#analyticsSummary').innerHTML=metricCards([['Faol user',v.activeUsers],['Talaba',v.students],['O‘qituvchi',v.teachers],['Bugungi dars',v.todaySchedules],['Davomat %',(v.attendanceRate??0)+'%'],['Qatnashdi',v.attendanceStudents??v.attendanceToday],['Kutilgan',v.attendanceExpected??0],['Kechikish',v.lateToday],['Onlayn',v.onlineUsers],['Bloklangan',v.blockedUsers]]);$('#analyticsGenerated').textContent='Yangilandi: '+new Date(x.generatedAt).toLocaleString('uz-UZ');$('#attendanceChart').innerHTML=barChart(x.attendanceTrend,function(r){return r.date},function(r){return r.total},function(r){return (r.late||0)+' kech'});const daysName=['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'];$('#weekdayChart').innerHTML=barChart(x.lessonsByWeekday,function(r){return daysName[r._id]||r._id},function(r){return r.value});$('#roleChart').innerHTML=barChart(x.usersByRole,function(r){return roleName[r._id]||r._id},function(r){return r.value});const q=x.dataQuality||{};$('#qualityCards').innerHTML=[['Aloqa ma’lumoti to‘liq emas',q.missingContact],['Guruhsiz talaba',q.studentsMissingGroup],['Jadvalsiz o‘qituvchi',q.teachersWithoutSchedule],['Jadvalsiz guruh',q.groupsWithoutSchedule]].map(function(i){return '<div class="quality-card '+(Number(i[1])>0?'warn':'ok')+'"><b>'+esc(i[1]||0)+'</b><span>'+esc(i[0])+'</span></div>'}).join('');$('#topTeachers').innerHTML=(x.topTeachers||[]).map(function(r,i){return '<div><span><b>'+(i+1)+'.</b> '+esc(r.label)+' <small>@'+esc(r.login||'-')+'</small></span><strong>'+esc(r.value)+' dars</strong></div>'}).join('')||'<p class="muted">Ma’lumot yo‘q.</p>';$('#topGroups').innerHTML=(x.topGroups||[]).map(function(r,i){return '<div><span><b>'+(i+1)+'.</b> '+esc(r.label)+' <small>'+esc(r.externalId||'')+'</small></span><strong>'+esc(r.value)+' dars</strong></div>'}).join('')||'<p class="muted">Ma’lumot yo‘q.</p>';renderGroupPerformance(groupData.rows||[])}catch(e){toast(e.message)}}
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
async function loadReports(){if(!can('reports.view'))return;try{const days=$('#reportDays')?.value||14;const q=encodeURIComponent($('#auditSearch')?.value||'');const jobs=[api('/reports/attendance?days='+days),api('/audit?limit=300&q='+q),can('lessons.monitor')?api('/analytics/online').catch(function(){return []}):Promise.resolve([])];const out=await Promise.all(jobs),attendance=out[0],auditRows=out[1],online=out[2];reportAttendanceCache=attendance;$('#attendanceList').innerHTML='<table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Dars</th><th>Holat</th><th>Daqiqa</th></tr></thead><tbody>'+attendance.map(function(x){return '<tr><td>'+(x.joinedAt?new Date(x.joinedAt).toLocaleString('uz-UZ'):'—')+'</td><td>'+esc(x.userId?.fullName||'—')+'<small class="cell-sub">@'+esc(x.userId?.login||'—')+'</small></td><td>'+esc(x.schedule?.title||x.lessonId||'—')+'<small class="cell-sub">'+esc(x.schedule?.groupId?.name||'')+'</small></td><td><span class="status '+(x.status==='late'?'warn':'ok')+'">'+esc(x.status==='late'?'Kechikdi':x.status==='present'?'Qatnashdi':x.status)+'</span></td><td>'+esc(x.minutes||0)+'</td></tr>'}).join('')+'</tbody></table>';$('#auditList').innerHTML=auditRows.map(function(x){return '<div><b>'+esc(x.action)+' · '+esc(x.entity)+'</b><span>'+esc(x.actorName||x.actorLogin||'Tizim')+'</span><br><small>'+new Date(x.createdAt).toLocaleString('uz-UZ')+' · '+esc(x.ip||'')+'</small></div>'}).join('')||'<p>Harakatlar tarixi bo‘sh.</p>';if(can('lessons.monitor'))$('#onlineUsers').innerHTML=online.map(function(x){return '<div><span class="online-dot"></span><div><b>'+esc(x.fullName)+'</b><small>@'+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</small></div><strong>'+esc(x.connections||1)+'</strong></div>'}).join('')||'<p class="muted">Hozir faol ulanish yo‘q.</p>'}catch(e){toast(e.message)}}
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
$('#exportAnalytics').onclick=function(){if(!analyticsCache)return toast('Avval statistikani yuklang');const x=analyticsCache,rows=[['statistika_doirasi',x.scope?.label||'Universitet'],[],['ko‘rsatkich','qiymat']];Object.entries(x.summary||{}).forEach(function(i){rows.push(i)});rows.push([],['sana','qatnashuv','kechikish','daqiqa']);(x.attendanceTrend||[]).forEach(function(r){rows.push([r.date,r.total,r.late,r.minutes])});downloadText('masofaviy2-statistika.csv','\ufeff'+csvRows(rows))};

async function loadAudit(){try{const rows=await api('/audit');$('#auditList').innerHTML=rows.map(x=>`<div><b>${esc(x.action)} · ${esc(x.entity)}</b><br><small>${new Date(x.createdAt).toLocaleString('uz-UZ')} · ${esc(x.ip)}</small></div>`).join('')||'<p>Harakatlar tarixi bo‘sh.</p>'}catch(e){$('#auditList').textContent=e.message}}
function connectSocket(){
  if(socket)socket.disconnect();
  socket=io({auth:{token}});
  socket.on('connect',function(){$('#onlineBadge').textContent='● Onlayn'});
  socket.on('disconnect',function(){$('#onlineBadge').textContent='● Ulanish yo‘q'});
  socket.on('presence:count',function(x){$('#onlineBadge').textContent='● '+(x.online||0)+' onlayn'});
  socket.on('lesson:error',function(x){toast(x.message||'Darsga kirib bo‘lmadi')});
  socket.on('lesson:presence',function(x){if(x.userId===user?._id||x.fullName===user?.fullName)toast(x.status==='late'?'Darsga kirdingiz · kechikish qayd etildi':'Darsga kirdingiz · davomat qayd etildi')});
  socket.on('lesson:chat',function(m){$('#messages').insertAdjacentHTML('beforeend','<p><b>'+esc(m.fullName)+'</b><br>'+esc(m.text)+'</p>');$('#messages').scrollTop=$('#messages').scrollHeight});
  $('#chatForm').onsubmit=function(e){e.preventDefault();if(!activeLessonId)return toast('Avval jadvaldan darsga kiring');const input=e.target.querySelector('input');socket.emit('lesson:chat',{lessonId:activeLessonId,text:input.value});input.value=''};
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');start();
