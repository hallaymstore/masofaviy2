const $=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)]; let user=null, structureType='faculty', cache={structure:[],analyticsStructures:[]}, effectivePermissions=[], socket=null, activeLessonId='', reportAttendanceCache=[], mediaRoomClient=null, activeLiveSession=null, cameraOn=false, micOn=false, studentCameraGranted=false, studentMicGranted=false, lessonTimer=null,networkTimer=null,chatUnread=0,handRaised=false,raisedHands=new Set(),raisedHandUsers=new Map(),lastLessonPayload=null,autoRejoinTimer=null,lastAutoQuality='', captionRecognition=null, captionsEnabled=false, captionMathEnabled=true, captionFinalWords=[], captionClearTimer=null, captionSizeLevel=Number(localStorage.getItem('m2-caption-size')||0), accessibilityEnabled=localStorage.getItem('m2-accessibility')==='1', videoLessonsCache=[], activeVideoId='', commentReplyTo=null, activeWatchPlayer=null, activeWatchKind='', watchProgressTimer=null, watchLastSavedAt=0, youtubeApiPromise=null, liveProctorStop=()=>{}, liveProctorStream=null, liveProctorTrack=null, liveProctorStates=new Map(), branding={productName:'HALLAYM EDU',institutionName:'Qarshi davlat texnika universiteti',shortName:'QarDTU',website:'',logoUrl:'',address:'',phone:'',founded:'',legalBasis:'',description:'',lmsUrl:'',repositoryUrl:'',portfolioUrl:'',admissionsUrl:''};
localStorage.removeItem('token');
const deviceMem=Number(navigator.deviceMemory||0),deviceCores=Number(navigator.hardwareConcurrency||0),androidMajor=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
const ultraLiteUI=Boolean((deviceMem&&deviceMem<=2)||(deviceCores&&deviceCores<=2)||(androidMajor&&androidMajor<=8));
const lowEndUI=Boolean(ultraLiteUI||(deviceMem&&deviceMem<=4)||(deviceCores&&deviceCores<=4)||!window.SVGSVGElement);
document.documentElement.classList.toggle('low-end-device',lowEndUI);
document.documentElement.classList.toggle('ultra-lite-device',ultraLiteUI);
const roleName={superadmin:'Bosh administrator',admin:'Administrator',tech:'Texnik xodim',rectorate:'Rektorat',dean:'Dekan',department:'Kafedra mudiri',teacher:'O‘qituvchi',student:'Talaba',tutor:'Tyutor'};
const can=p=>effectivePermissions.includes('*')||effectivePermissions.includes(p);
const moduleOn=name=>branding?.modules?.[name]!==false;
const csrf=()=>document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('m2_csrf='))?.slice('m2_csrf='.length)||'';
const api=async(path,options={})=>{const r=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf(),...options.headers}});const data=await r.json().catch(()=>({}));if(r.status===401){logout();throw Error(data.message)}if(!r.ok)throw Error(data.message||'Xatolik');return data};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}; const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const applyBranding=()=>{
  const product=branding.productName||'HALLAYM EDU',institution=branding.institutionName||'Universitet',short=branding.shortName||institution;
  document.title=product+(institution?' · '+institution:'');
  all('[data-product-name]').forEach(x=>x.textContent=product);
  all('[data-institution-name]').forEach(x=>x.textContent=institution);
  all('[data-institution-short]').forEach(x=>x.textContent=short);
  all('[data-landing-title]').forEach(x=>x.textContent=branding.landingTitle||'Darslar, davomat va nazorat — bitta joyda');
  all('[data-landing-text]').forEach(x=>x.textContent=branding.landingText||'O‘qituvchi darsni boshlaydi, talaba o‘z jadvalidan kiradi. Davomat, video, topshiriq va hisobotlar bir tizimda yuradi.');
  document.documentElement.style.setProperty('--brand',branding.primaryColor||'#0b4fd8');
  document.documentElement.style.setProperty('--brand-accent',branding.accentColor||'#19b5fe');
  all('.brand-mark').forEach(x=>{const has=Boolean(branding.logoUrl);x.classList.toggle('has-logo',has);x.style.backgroundImage=has?'url("'+String(branding.logoUrl).replace(/"/g,'%22')+'")':'';x.textContent=has?'':'HE'});
  if($('#brandingPreviewInstitution'))$('#brandingPreviewInstitution').textContent=institution;
};
async function loadBranding(){
  try{const r=await fetch('/api/branding',{credentials:'same-origin',cache:'no-store'}),data=await r.json();if(r.ok)branding={...branding,...data}}catch{}
  applyBranding();return branding;
}
const urlHost=value=>{try{return new URL(value).host}catch{return String(value||'').replace(/^https?:\/\//,'').replace(/\/$/,'')}};

const iconPaths={home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',chart:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',building:'<path d="M4 21V7l8-4 8 4v14"/><path d="M8 10h2M14 10h2M8 14h2M14 14h2M9 21v-4h6v4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>',library:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8M8 12h6"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',camera:'<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9H3V9a2 2 0 0 1 2-2h3l1.5-3z"/><circle cx="12" cy="12" r="3"/>',refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>',plus:'<path d="M12 5v14M5 12h14"/>',back:'<path d="m15 18-6-6 6-6"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',screen:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',phoneOff:'<path d="M3 3l18 18"/><path d="M16 16.7c-4.6 1.2-9.3-3.4-8-8L5.4 6.1 2 8c0 7.7 6.3 14 14 14l1.9-3.4z"/>',send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',play:'<path d="m9 7 8 5-8 5z"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',cap:'<path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12.5V17c3.5 2 8.5 2 12 0v-4.5"/><path d="M22 10v6"/>',book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8M8 12h6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',external:'<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>'};
function icon(name,fallback='•'){if(lowEndUI)return '<span class="fallback-icon" aria-hidden="true">'+esc(fallback)+'</span>';return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[name]||iconPaths.home)+'</svg>'}
function hydrateIcons(root=document){root.querySelectorAll?.('[data-ico]').forEach(function(el){el.innerHTML=icon(el.dataset.ico,el.dataset.fallback||'•')})}
function logout(){fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf()}}).catch(()=>{});user=null;socket?.disconnect();$('#shell').classList.add('hidden');$('#login').classList.remove('hidden')}
function configureRoleUI(){const role=user.role;$('#roleLabel').textContent=roleName[role]||role;$('#headerName').textContent=user.fullName||user.login||'';const show={analytics:moduleOn('analytics')&&can('analytics.view'),structure:can('structure.manage')||['dean','department'].includes(role),users:can('users.manage'),reports:moduleOn('reports')&&can('reports.view'),live:moduleOn('live')&&(['teacher','student'].includes(role)||can('lessons.monitor')||can('lessons.support')||can('live.manage')),videos:moduleOn('videos')&&(can('videos.view')||can('videos.manage')||can('videos.upload')),courses:['student','teacher','admin','superadmin'].includes(role),finalExams:moduleOn('finalExams')&&['student','teacher','admin','superadmin'].includes(role),curriculum:moduleOn('curriculum')&&['student','teacher','admin','superadmin'].includes(role),library:moduleOn('library'),communications:moduleOn('communications')&&['student','teacher','admin','superadmin'].includes(role),settings:['admin','superadmin'].includes(role)};Object.entries(show).forEach(([page,ok])=>{const b=$(`nav button[data-page="${page}"]`);if(b)b.classList.toggle('hidden',!ok)});$('#addCourse')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#reviewGrades')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#myAcademic')?.classList.toggle('hidden',role!=='student');$('#manageAcademic')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#addLibraryItem')?.classList.toggle('hidden',!['teacher','admin','superadmin'].includes(role));$('#addFinalExam')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#importCurriculum')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#dashboardAddSchedule')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleAdminActions')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleFilters')?.classList.toggle('hidden',!can('schedule.manage'));$('#usersAdminActions')?.classList.toggle('hidden',!can('users.manage'));$('#addStructure')?.classList.toggle('hidden',!can('structure.manage'));$('#onlinePanel')?.classList.toggle('hidden',!can('lessons.monitor'));$('#monitoringPanel')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#addVideoLesson')?.classList.toggle('hidden',!(can('videos.manage')||can('videos.upload')));hydrateIcons();}
function go(id){all('.page').forEach(x=>x.classList.toggle('active',x.id===id));all('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===id));const activeBtn=document.querySelector('nav button[data-page="'+id+'"]');activeBtn?.closest('details')?.setAttribute('open','');$('#sidebar').classList.remove('open');$('#sidebarBackdrop')?.classList.remove('show');({dashboard:loadDashboard,university:loadUniversity,analytics:loadAnalytics,structure:loadStructure,schedule:loadSchedules,users:loadUsers,live:loadLiveRooms,videos:loadVideoLessons,courses:loadCourses,finalExams:loadFinalExams,curriculum:loadCurricula,library:loadLibrary,communications:loadCommunications,reports:loadReports,settings:loadInstitutionSettings,profile:loadProfile}[id]||(()=>{}))();hydrateIcons()}
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installPwaBtn')?.classList.remove('hidden')});
$('#installPwaBtn')?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return toast('Ilovani brauzer menyusidan o‘rnatish mumkin');deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice.catch(()=>{});deferredInstallPrompt=null;$('#installPwaBtn')?.classList.add('hidden')});
window.addEventListener('appinstalled',()=>{$('#installPwaBtn')?.classList.add('hidden');toast('HALLAYM EDU ilovasi o‘rnatildi')});
async function start(){try{await loadBranding();const x=await api('/me');user=x.user;effectivePermissions=x.effectivePermissions||[];$('#login').classList.add('hidden');$('#shell').classList.remove('hidden');configureRoleUI();hydrateIcons();await loadDashboard();connectSocket();const deep=location.hash.startsWith('#video=')?decodeURIComponent(location.hash.slice(7)):'';if(deep&&!user.mustChangePassword){await loadVideoLessons();await openVideoLesson(deep,false)}if(user.role==='student'&&!activeLessonId&&!deep){setTimeout(async()=>{try{const lr=await api('/live/rooms'),room=(lr.rooms||[]).find(r=>r.session?.status==='active'&&r.canJoin);if(room)await enterLiveRoom(String(room.schedule._id))}catch{}},500)}if(user.mustChangePassword&&user._id!=='demo')setTimeout(()=>{go('profile');toast('Xavfsizlik uchun vaqtinchalik parolni almashtiring')},250)}catch{logout()}}
async function runDemoFaceGate(){
  const dlg=$('#faceDemoDialog'),video=$('#faceDemoVideo'),status=$('#faceDemoStatus'),count=$('#faceCountdown'),retry=$('#faceDemoRetry');
  if(!dlg||!video)return true;
  let stream=null,timer=null,resolved=false;
  const stop=()=>{if(timer)clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());video.srcObject=null};
  const finish=async(resolve)=>{
    if(resolved)return;resolved=true;
    try{
      await api('/compliance/consent',{method:'POST',body:JSON.stringify({type:'demo_face',granted:true})});
      await api('/identity/demo-face',{method:'POST',body:JSON.stringify({cameraReady:true})});
      status.textContent='Tekshiruv yakunlandi. Tizim ochilmoqda…';
      setTimeout(()=>{stop();dlg.close();resolve(true)},350);
    }catch(e){resolved=false;status.textContent=e.message;retry?.classList.remove('hidden')}
  };
  const openCamera=async(resolve)=>{
    retry?.classList.add('hidden');resolved=false;if(count)count.textContent='5';status.textContent='Kamera ochilmoqda…';
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:480,max:720},height:{ideal:360,max:540},facingMode:'user'},audio:false});
      video.srcObject=stream;await video.play().catch(()=>{});
      status.textContent='Yuzingizni kameraga qarating';
      let left=5;if(count)count.textContent=String(left);
      timer=setInterval(()=>{left-=1;if(count)count.textContent=String(Math.max(0,left));status.textContent=left>0?('Tekshiruv: '+left+' soniya'):'Tekshiruv yakunlanmoqda…';if(left<=0){clearInterval(timer);timer=null;finish(resolve)}},1000);
    }catch(e){
      status.textContent='Kamera ochilmadi. Brauzerda kamera ruxsatini bering.';
      retry?.classList.remove('hidden');
    }
  };
  if(!dlg.open)dlg.showModal();
  return await new Promise(resolve=>{
    retry.onclick=()=>{stop();openCamera(resolve)};
    openCamera(resolve);
  });
}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const result=await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});if(result.twoFactorRequired){$('#loginOtpWrap').classList.remove('hidden');$('#loginError').textContent=result.message||'2 bosqichli kodni kiriting';e.target.elements.otp.focus();return}$('#loginOtpWrap').classList.add('hidden');$('#loginError').textContent='';if(result.faceDemoRequired)await runDemoFaceGate();start()}catch(err){$('#loginError').textContent=err.message}};
all('nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));all('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#menuBtn').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('show',open)};$('#sidebarBackdrop')?.addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#sidebarBackdrop').classList.remove('show')});$('#logoutBtn').onclick=logout;$('#profileBtn').onclick=()=>go('profile');const applyTheme=t=>{document.documentElement.dataset.theme=t==='dark'?'dark':'';localStorage.theme=t==='dark'?'dark':'';const b=$('#themeBtn');if(b){b.textContent=t==='dark'?'☀':'◐';b.title=t==='dark'?'Kunduzgi rejim':'Tungi rejim'}};$('#themeBtn').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');applyTheme(localStorage.theme==='dark'?'dark':'light');
async function loadUniversity(){
  try{
    await loadBranding();
    const rows=await api('/structure');cache.structure=rows;
    const active=rows.filter(x=>x.active!==false),faculties=active.filter(x=>x.type==='faculty'),departments=active.filter(x=>x.type==='department'),groups=active.filter(x=>x.type==='group'),byId=Object.fromEntries(active.map(x=>[String(x._id),x]));
    const name=branding.institutionName||'Universitet',short=branding.shortName||name;
    $('#institutionPageName').textContent=name;
    $('#institutionKicker').textContent=short+' · HALLAYM EDU';
    $('#institutionHeroTitle').textContent='HALLAYM EDU — '+name+' masofaviy ta’lim muhiti';
    $('#institutionDescription').textContent=branding.description||'Universitetning raqamli ta’lim jarayonlari yagona platformada boshqariladi.';
    $('#institutionFacultyCount').textContent=faculties.length;$('#institutionDepartmentCount').textContent=departments.length;$('#institutionGroupCount').textContent=groups.length;
    $('#facultyCountBadge').textContent=faculties.length+' ta';$('#groupCountBadge').textContent=groups.length+' ta';
    $('#institutionShortName').textContent=short||'—';$('#institutionFounded').textContent=branding.founded||'—';$('#institutionLegalBasis').textContent=branding.legalBasis||'—';$('#institutionAddress').textContent=branding.address||'—';$('#institutionPhone').textContent=branding.phone||'—';$('#institutionPortalHost').textContent=location.host;
    const web=$('#institutionWebsiteButton');if(branding.website){web.href=branding.website;web.classList.remove('hidden')}else web.classList.add('hidden');
    $('#universityFaculties').innerHTML=faculties.length?faculties.map(f=>{const count=departments.filter(d=>String(d.parentId)===String(f._id)).length;return '<div><b>'+esc(f.name)+'</b><span>'+(f.externalId||f.code?'ID: '+esc(f.externalId||f.code)+' · ':'')+count+' ta kafedra</span></div>'}).join(''):'<div class="empty"><b>Fakultet kiritilmagan</b><p>Admin → Tuzilma bo‘limidan fakultetlarni yarating yoki import qiling.</p></div>';
    $('#universityGroups').innerHTML=groups.length?groups.map(g=>{const dep=byId[String(g.parentId||'')],fac=dep?byId[String(dep.parentId||'')]:null;return '<div><b>'+esc(g.name)+'</b><span>'+esc(g.externalId||g.code||'ID biriktirilmagan')+(dep?' · '+esc(dep.name):'')+(fac?' · '+esc(fac.name):'')+'</span></div>'}).join(''):'<div class="empty"><b>Guruh kiritilmagan</b><p>Guruhlar import qilinganda shu yerda avtomatik ko‘rinadi.</p></div>';
    const links=[
      ['Rasmiy sayt','Universitetning asosiy veb-sayti',branding.website],
      ['Masofaviy ta’lim / LMS','Moodle yoki boshqa LMS tizimi',branding.lmsUrl],
      ['Ilmiy repozitoriy','Maqola va ilmiy materiallar bazasi',branding.repositoryUrl],
      ['Portfolio','Professor-o‘qituvchilar portfolio tizimi',branding.portfolioUrl],
      ['Qabul / yo‘nalishlar','Abituriyent va ta’lim yo‘nalishlari',branding.admissionsUrl]
    ].filter(x=>x[2]);
    $('#universityEcosystem').innerHTML=links.length?links.map(([title,desc,url])=>'<a href="'+esc(url)+'" target="_blank" rel="noopener"><b>'+esc(title)+'</b><span>'+esc(desc)+'</span><small>'+esc(urlHost(url))+' ↗</small></a>').join(''):'<div class="empty"><b>Tashqi tizimlar kiritilmagan</b><p>Admin → Platforma sozlamalaridan havolalarni kiriting.</p></div>';
  }catch(e){toast(e.message)}
}
async function loadInstitutionSettings(){
  if(!['admin','superadmin'].includes(user?.role))return;
  await loadBranding();
  const form=$('#institutionSettingsForm');if(!form)return;
  ['institutionName','shortName','phone','address','founded','legalBasis','description','website','logoUrl','appIconUrl','primaryColor','accentColor','landingTitle','landingText','lmsUrl','repositoryUrl','portfolioUrl','admissionsUrl'].forEach(k=>{if(form.elements[k])form.elements[k].value=branding[k]||''});
  if($('#brandingPreviewInstitution'))$('#brandingPreviewInstitution').textContent=branding.institutionName||'Universitet nomi';
  const instance=$('#instanceSettingsForm');
  if(instance){
    ['organizationType','tenantCode','domain','defaultLanguage','supportEmail','supportPhone','contractLabel','licensePlan','maxUsers','maxConcurrentRooms','maxRoomParticipants'].forEach(k=>{if(instance.elements[k])instance.elements[k].value=branding[k]??''});
    if(instance.elements.licenseExpiresAt)instance.elements.licenseExpiresAt.value=branding.licenseExpiresAt?String(branding.licenseExpiresAt).slice(0,10):'';
    instance.querySelectorAll('[data-module]').forEach(x=>x.checked=branding.modules?.[x.dataset.module]!==false);
  }
  await loadInstanceOverview().catch(()=>{});
}
$('#institutionSettingsForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const body=Object.fromEntries(new FormData(e.target));
    const updated=await api('/admin/institution-settings',{method:'PATCH',body:JSON.stringify(body)});
    branding={...branding,...updated};applyBranding();toast('Tashkilot brendi saqlandi');await loadInstitutionSettings();
  }catch(err){toast(err.message)}
});
async function loadInstanceOverview(){
  if(!['admin','superadmin','tech'].includes(user?.role))return;
  const x=await api('/admin/instance-overview'),box=$('#instanceReadiness');if(!box)return;
  const evalHtml=(x.evaluation||[]).map(i=>{const ready=i.status==='ready',external=i.status==='external_required'||i.status==='external_evidence';return '<div class="evaluation-row '+(ready?'ready':external?'external':'pending')+'"><span class="evaluation-num">'+esc(i.criterion)+'</span><div><b>'+esc(i.label)+'</b><small>'+esc(i.note||'')+'</small><em>'+esc(Object.entries(i.evidence||{}).map(([k,v])=>k+': '+v).join(' · '))+'</em></div><strong>'+(ready?'✓ Tayyor':external?'Hujjat/tekshiruv':'○ To‘ldirish kerak')+'</strong></div>'}).join('');
  box.innerHTML='<div class="instance-score"><b>'+esc(x.readiness?.percent||0)+'%</b><span>o‘rnatish tayyorligi</span></div>'+
    '<div class="instance-counts"><span>Foydalanuvchi <b>'+esc(x.counts?.users||0)+'</b></span><span>O‘qituvchi <b>'+esc(x.counts?.teachers||0)+'</b></span><span>Talaba <b>'+esc(x.counts?.students||0)+'</b></span><span>Guruh <b>'+esc(x.counts?.groups||0)+'</b></span><span>Fan <b>'+esc(x.counts?.courses||0)+'</b></span><span>Test <b>'+esc(x.counts?.quizzes||0)+'</b></span></div>'+
    '<div class="instance-checks">'+(x.readiness?.checks||[]).map(i=>'<span class="'+(i.ready?'ready':'pending')+'">'+(i.ready?'✓':'○')+' '+esc(i.label)+'</span>').join('')+'</div>'+
    '<div class="instance-infra"><span>DB: '+esc(x.infrastructure?.database||'—')+'</span><span>SFU: '+(x.infrastructure?.sfuConfigured?'tayyor':'yo‘q')+'</span><span>TURN: '+(x.infrastructure?.turnConfigured?'tayyor':'yo‘q')+'</span><span>Limit: '+esc(x.limits?.maxConcurrentRooms||0)+' xona / '+esc(x.limits?.maxUsers||0)+' user</span></div>'+
    '<div class="evaluation-readiness"><div class="section-title"><div><h3>Baholash mezonlari bo‘yicha dalillar</h3><small>2, 3, 4, 7, 8, 9, 10, 11, 12 va 13-bandlar</small></div></div>'+evalHtml+'</div>';
}
$('#refreshInstanceOverview')?.addEventListener('click',()=>loadInstanceOverview().catch(e=>toast(e.message)));
$('#instanceSettingsForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const body=Object.fromEntries(new FormData(e.target));
    body.modules={};e.target.querySelectorAll('[data-module]').forEach(x=>body.modules[x.dataset.module]=x.checked);
    const updated=await api('/admin/institution-settings',{method:'PATCH',body:JSON.stringify(body)});
    branding={...branding,...updated};configureRoleUI();toast('Instance profili saqlandi');await loadInstitutionSettings();
  }catch(err){toast(err.message)}
});
loadBranding();

async function loadDashboard(){
  const x=await api('/dashboard'),role=x.role||user.role;
  const cfg=role==='teacher'?['O‘qituvchi ish stoli','Bugungi darslaringiz, guruhlaringiz va davomat holati','Darsga kirishdan oldin kamera va mikrofonni bir ko‘rib oling.']:role==='student'?['Talaba bosh sahifasi','Bugungi darslar va shaxsiy davomat ko‘rsatkichlaringiz','Bugungi dars vaqtlarini shu yerda tekshirib olasiz.']:['Boshqaruv markazi',x.scope?x.scope+' bo‘yicha bugungi ta’lim jarayoni':'Bugungi ta’lim jarayonini bir joydan kuzating','Avval tuzilma va akkauntlarni tayyorlang, so‘ng jadvalni biriktiring.'];
  $('#dashboardTitle').textContent=cfg[0];$('#dashboardSubtitle').textContent=cfg[1];$('#dashboardGuide').textContent=cfg[2];
  $('#stats').innerHTML=(x.stats||[]).map(i=>'<div class="stat"><b>'+esc(i.value)+'</b><span>'+esc(i.label)+'</span></div>').join('');
  $('#todayLessons').innerHTML=(x.today||[]).slice(0,8).map(scheduleRow).join('')||'<p>Bugun uchun dars topilmadi.</p>';bindScheduleActions();
  const q=$('#quickManagement');
  q.innerHTML=role==='teacher'?'<button data-go="schedule"><b>'+icon('calendar','📅')+' Mening jadvalim</b><span>Haftalik darslaringiz</span></button><button data-go="live"><b>'+icon('video','🎥')+' Guruh darslari</b><span>Jonli xonalarni boshlash va boshqarish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Videodarslar</b><span>Kurs va guruhlarga materiallar</span></button>':role==='student'?'<button data-go="schedule"><b>'+icon('calendar','📅')+' Dars jadvalim</b><span>Guruhingiz haftalik rejasi</span></button><button data-go="live"><b>'+icon('video','🎥')+' Jonli darslar</b><span>Faqat o‘z guruhingiz xonasiga kirish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Tavsiya videolar</b><span>Kurs va yo‘nalishingizga mos</span></button>':'<button data-go="analytics"><b>'+icon('chart','📈')+' Statistika markazi</b><span>Davomat, guruh va o‘qituvchi ko‘rsatkichlari</span></button><button data-go="live"><b>'+icon('video','🎥')+' Jonli guruhlar</b><span>Parallel darslarni real vaqtda ko‘rish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Videodarslar</b><span>Kurs va yo‘nalishlarga kontent</span></button>';
  q.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));hydrateIcons(q);
  const health=$('#dashboardHealth'),readiness=$('#presentationReadiness');
  if(['superadmin','admin','tech'].includes(role)){
    try{const m=await api('/system/metrics');health.classList.remove('hidden');health.innerHTML='<b>Tizim holati:</b><span>DB: '+esc(m.database)+'</span><span>Onlayn: '+esc(m.onlineUsers)+'</span><span>Jonli guruhlar: '+esc(m.activeLiveRooms||0)+'</span><span>Socket: '+esc(m.socketConnections)+'</span><span>RAM: '+esc(m.memory?.rssMB||0)+' MB</span><span>Uptime: '+esc(Math.floor((m.uptimeSeconds||0)/60))+' daqiqa</span>'}catch{health.classList.add('hidden')}
    try{const [p,e]=await Promise.all([api('/presentation/readiness'),api('/evaluation/readiness')]);readiness.classList.remove('hidden');readiness.innerHTML='<div class="section-title"><div><h2>Tekshiruv tayyorligi</h2><small>LMS baholash mezonlari bo‘yicha ichki dalillar</small></div><b class="readiness-score">'+esc(e.percent)+'%</b></div><div class="evaluation-readiness">'+(e.criteria||[]).map(x=>'<div class="evaluation-row '+(x.ready?'ready':x.external?'external':'pending')+'"><span class="evaluation-no">'+esc(x.no)+'</span><div><b>'+esc(x.title)+'</b><small>'+esc(x.evidence)+'</small></div><strong>'+(x.ready?'Mavjud':x.external?'Tashqi hujjat':'Tayyorlanmoqda')+'</strong></div>').join('')+'</div><details class="presentation-readiness-details"><summary>Demo/taqdimot kontenti · '+esc(p.percent)+'%</summary><div class="readiness-grid">'+(p.checks||[]).map(x=>'<div class="'+(x.ready?'ready':'pending')+'"><span>'+esc(x.label)+'</span><b>'+esc(x.value)+' / '+esc(x.target)+'</b></div>').join('')+'</div></details>'}catch{readiness.classList.add('hidden')}
  }else{health.classList.add('hidden');readiness.classList.add('hidden')}
}
function scheduleRow(i){
  const group=i.groupId?.name||'',gid=i.groupId?.externalId||i.groupId?.code||'',teacher=i.teacherId?.fullName||'',canJoin=['teacher','student'].includes(user?.role)||can('lessons.monitor');
  let actions='';
  if(canJoin&&i.kind!=='final_exam')actions+='<button class="join-btn" data-join-lesson="'+esc(i._id)+'">Kirish</button>';
  if(can('schedule.manage'))actions+='<button class="ghost danger-text" data-del-schedule="'+esc(i._id)+'">O‘chirish</button>';
  const kindLabel={lecture:'Ma’ruza',practice:'Amaliyot',seminar:'Seminar',exam:'Nazorat',final_exam:'Yakuniy'}[i.kind]||'Dars';
  return '<div class="lesson-row lesson-kind-'+esc(i.kind||'lecture')+'"><div class="lesson-time"><b>'+esc(i.start)+'</b><span>'+esc(i.end)+'</span></div><div class="lesson-info"><div class="lesson-title-line"><b>'+esc(i.title)+'</b><span class="lesson-kind">'+esc(kindLabel)+'</span></div><small>'+esc(i.subject||'Fan')+(group?' · '+esc(group):'')+(teacher?' · '+esc(teacher):'')+'</small><div class="lesson-meta">'+(gid?'<span>ID: '+esc(gid)+'</span>':'')+(i.room?'<span>'+esc(i.room)+'-xona</span>':'')+'</div></div><div class="row-actions">'+actions+'</div></div>';
}
function bindScheduleActions(){
  all('[data-del-schedule]').forEach(function(b){b.onclick=async function(){if(confirm('Dars o‘chirilsinmi?')){try{await api('/schedules/'+b.dataset.delSchedule,{method:'DELETE'});loadSchedules()}catch(e){toast(e.message)}}}});
  all('[data-join-lesson]').forEach(function(b){b.onclick=function(){joinLesson(b.dataset.joinLesson)}});
}
function joinLesson(id){enterLiveRoom(id)}
all('.tabs button').forEach(b=>b.onclick=()=>{all('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');structureType=b.dataset.type;loadStructure()});
async function loadStructure(){if(!can('structure.manage')&&!['dean','department'].includes(user.role))return;cache.structure=await api('/structure');const rows=cache.structure.filter(x=>x.type===structureType&&x.active),byId=Object.fromEntries(cache.structure.map(x=>[String(x._id),x]));$('#structureList').innerHTML=rows.map(x=>{const p=byId[String(x.parentId||'')],pp=p?byId[String(p.parentId||'')]:null,parentLine=structureType==='department'?(p?.name||'Fakultet biriktirilmagan'):structureType==='group'?([pp?.name,p?.name].filter(Boolean).join(' → ')||'Kafedra biriktirilmagan'):'';return `<div><small>ID: ${esc(x.externalId||x.code||x._id)}</small><h2>${esc(x.name)}</h2>${parentLine?`<p class="structure-parent">${esc(parentLine)}</p>`:''}${can('structure.manage')?`<button data-del-structure="${x._id}">Arxivlash</button>`:''}</div>`}).join('')||'<div class="empty"><b>Hozircha ma’lumot kiritilmagan</b><p>“+ Yangi” tugmasi orqali birinchi bo‘limni yarating.</p></div>';all('[data-del-structure]').forEach(b=>b.onclick=async()=>{if(confirm('Arxivga o‘tkazilsinmi?')){try{await api('/structure/'+b.dataset.delStructure,{method:'DELETE'});loadStructure()}catch(e){toast(e.message)}}})}
let editorReturnPage='dashboard';
function closeEditor(){
  if(document.body.classList.contains('proctored-exam-active')){toast('Nazoratli testni yakunlamasdan chiqib bo‘lmaydi');return}
  const editor=$('#editor');
  editor?.dispatchEvent(new Event('close'));
  go(editorReturnPage||'dashboard');
}
function modal(title,fields,onSave){
  const active=document.querySelector('.page.active');
  if(active?.id&&active.id!=='editor')editorReturnPage=active.id;
  $('#modalTitle').textContent=title;
  $('#modalFields').innerHTML=fields;
  $('#modalSave').classList.remove('hidden');
  go('editor');
  const form=$('#modalForm');
  form.onsubmit=async e=>{
    e.preventDefault();
    if(!form.reportValidity())return;
    try{
      const fd=new FormData(form),data={};
      for(const key of new Set(fd.keys())){const values=fd.getAll(key);data[key]=values.length>1?values:values[0]}
      const outcome=await onSave(data);
      closeEditor();
      if(outcome!==false)toast(typeof outcome==='string'?outcome:'Saqlandi');
    }catch(err){toast(err.message)}
  };
}
$('#editorBack')?.addEventListener('click',closeEditor);
$('#editorCancel')?.addEventListener('click',closeEditor);
$('#addStructure').onclick=async()=>{if(!cache.structure.length)cache.structure=await api('/structure');const parents=cache.structure.filter(x=>x.active&&(structureType==='department'?x.type==='faculty':structureType==='group'?x.type==='department':false));modal('Yangi '+({faculty:'fakultet',department:'kafedra',group:'guruh'}[structureType]),`<label>Nomi<input name="name" required></label><label>ID<input name="externalId" ${structureType==='group'?'required':''} placeholder="Masalan: ATT-101"></label>${structureType==='faculty'?'':`<label>Yuqori bo‘lim<select name="parentId" required><option value="">Tanlang</option>${parents.map(x=>`<option value="${x._id}">${esc(x.name)}</option>`)}</select></label>`}`,async d=>{await api('/structure',{method:'POST',body:JSON.stringify({...d,type:structureType})});loadStructure()})};
function scheduleGroupMatchesUser(schedule){
  if(user?.role!=='student')return true;
  const ug=user?.groupId||user?.group||null,sg=schedule?.groupId||schedule?.group||null;
  const values=x=>{
    if(!x)return [];
    if(typeof x==='string')return [String(x)];
    return [x._id,x.externalId,x.code,x.name].filter(Boolean).map(String);
  };
  const a=new Set(values(ug));
  return values(sg).some(v=>a.has(v));
}
function renderScheduleBoard(rows){
  if(!rows.length)return '<div class="empty"><b>Dars jadvali hali kiritilmagan</b><p>Jadval qo‘lda yoki Excel/CSV orqali qo‘shiladi.</p></div>';
  const days=['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],today=(new Date().getDay()||7);
  const grouped=new Map();
  for(const row of rows){const key=Number(row.weekday)||0;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row)}
  const distance=d=>((d-today)+7)%7;
  return [...grouped.entries()].sort((a,b)=>distance(a[0])-distance(b[0])).map(([day,list])=>'<section class="schedule-day '+(day===today?'is-today':'')+'"><div class="schedule-day-head"><div><b>'+(day===today?'<span class="today-dot"></span>Bugun · ':'')+esc(days[day]||list[0]?.date||'Sana')+'</b><span>'+list.length+' ta dars</span></div></div><div class="schedule-day-list">'+list.sort((a,b)=>String(a.start).localeCompare(String(b.start))).map(scheduleRow).join('')+'</div></section>').join('');
}
async function loadSchedules(){
  try{
    const p=new URLSearchParams();
    if(can('schedule.manage')){
      const teacher=$('#scheduleTeacherFilter')?.value?.trim()||'',group=$('#scheduleGroupFilter')?.value?.trim()||'',day=$('#scheduleDayFilter')?.value||'';
      if(teacher)p.set('teacherLogin',teacher);if(group)p.set('groupId',group);if(day)p.set('weekday',day);
    }
    let rows=await api('/schedules'+(p.toString()?'?'+p.toString():''));
    if(user?.role==='student')rows=(rows||[]).filter(scheduleGroupMatchesUser);
    $('#scheduleList').innerHTML=renderScheduleBoard(rows);
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
    $('#usersList').innerHTML='<div class="user-card-list">'+rows.map(function(x){
      let actions='<button class="ghost" data-user-profile="'+esc(x._id)+'">Profil</button><button class="ghost" data-user-edit="'+esc(x._id)+'">Tahrir</button>';
      if(can('permissions.manage'))actions+='<button class="ghost" data-user-permissions="'+esc(x._id)+'">Huquqlar</button>';
      if(can('users.control'))actions+='<button class="ghost" data-user-toggle="'+esc(x._id)+'" data-active="'+(x.active?'1':'0')+'">'+(x.active?'Bloklash':'Ochish')+'</button><button class="ghost" data-user-reset="'+esc(x._id)+'">Parol</button><button class="ghost" data-user-revoke="'+esc(x._id)+'">Sessiyalar</button>'+(x.totpEnabled?'<button class="ghost" data-user-reset-2fa="'+esc(x._id)+'">2FA reset</button>':'')+(x.role==='student'?'':(x.identityVerifiedAt?'<button class="ghost" data-user-unverify="'+esc(x._id)+'">Shaxs tasdig‘ini bekor</button>':'<button class="ghost" data-user-verify="'+esc(x._id)+'">Shaxsni tasdiqlash</button>'));
      const groupLabel=x.groupId?.externalId||x.groupId?.code||x.group||'—';
      const groupName=x.groupId?.name||x.group||'—';
      const courseLabel=x.courseYear?x.courseYear+'-kurs':'Kurs —';
      const directionLabel=x.direction||'Yo‘nalish —';
      return '<details class="user-card '+(x.role==='student'?'user-student-free':(x.identityVerifiedAt?'user-verified':'user-unverified'))+'"><summary><div class="user-avatar">'+esc((x.fullName||x.login||'?').trim().charAt(0).toUpperCase())+'</div><div class="user-card-main"><b>'+esc(x.fullName)+'</b><span>@'+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</span><div class="user-quick-meta"><span class="user-meta-chip">'+esc(courseLabel)+'</span><span class="user-meta-chip">'+esc(groupLabel)+'</span><span class="user-meta-direction">'+esc(directionLabel)+'</span></div></div><span class="status '+(x.active?'ok':'blocked')+'">'+(x.active?'Faol':'Blok')+'</span><i>⌄</i></summary><div class="user-card-details"><div class="user-facts"><span><small>Guruh</small><b>'+esc(groupName)+'</b><small>'+esc(groupLabel)+'</small></span><span><small>Kurs</small><b>'+esc(courseLabel)+'</b></span><span><small>Yo‘nalish</small><b>'+esc(directionLabel)+'</b></span><span><small>Oxirgi kirish</small><b>'+(x.lastLoginAt?new Date(x.lastLoginAt).toLocaleString('uz-UZ'):'—')+'</b></span><span><small>2FA</small><b>'+(x.totpEnabled?'Yoqilgan':'—')+'</b></span><span class="identity-status-box '+(x.role==='student'?'free':(x.identityVerifiedAt?'verified':'unverified'))+'"><small>Shaxs tasdig‘i</small><b>'+(x.role==='student'?'Talab qilinmaydi':(x.identityVerifiedAt?'Tasdiqlangan':'Tasdiqlanmagan'))+'</b></span></div><div class="row-actions">'+actions+'</div></div></details>';
    }).join('')+'</div>';
    all('[data-user-profile]').forEach(function(b){b.onclick=function(){openUserProfile(b.dataset.userProfile)}});
    all('[data-user-edit]').forEach(function(b){b.onclick=function(){editUser(b.dataset.userEdit)}});
    all('[data-user-permissions]').forEach(function(b){b.onclick=function(){editUserPermissions(b.dataset.userPermissions)}});
    all('[data-user-toggle]').forEach(function(b){b.onclick=function(){toggleUserStatus(b)}});
    all('[data-user-reset]').forEach(function(b){b.onclick=function(){resetUserPassword(b.dataset.userReset)}});
    all('[data-user-revoke]').forEach(function(b){b.onclick=function(){revokeUserSessions(b.dataset.userRevoke)}});
    all('[data-user-reset-2fa]').forEach(function(b){b.onclick=function(){resetUserTwoFactor(b.dataset.userReset2fa)}});
    all('[data-user-verify]').forEach(function(b){b.onclick=function(){verifyUserIdentity(b.dataset.userVerify)}});
    all('[data-user-unverify]').forEach(function(b){b.onclick=function(){unverifyUserIdentity(b.dataset.userUnverify)}});
  }catch(e){$('#usersList').innerHTML='<p style="padding:15px">'+esc(e.message)+'</p>'}
}
async function toggleUserStatus(b){
  const active=b.dataset.active==='1';
  if(active&&!confirm('Foydalanuvchi tizimga kira olmaydi. Bloklansinmi?'))return;
  const note=active?(prompt('Bloklash sababi (ixtiyoriy):','')||''):'';
  try{await api('/users/'+b.dataset.userToggle+'/status',{method:'PATCH',body:JSON.stringify({active:!active,statusNote:note})});toast(active?'Foydalanuvchi bloklandi':'Foydalanuvchi faollashtirildi');loadUsers()}catch(e){toast(e.message)}
}
async function verifyUserIdentity(id){
  modal('OTMda shaxsni tasdiqlash','<p>Bu amal foydalanuvchi OTMga shaxsan kelib, hujjati xodim tomonidan tekshirilganidan keyin bajariladi.</p><label>Hujjat turi<input name="documentType" placeholder="ID karta / pasport" required></label><label>Hujjat oxirgi 2–4 belgisi<input name="documentLast4" maxlength="4" required></label><label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/users/'+id+'/identity-verification',{method:'POST',body:JSON.stringify(d)});toast('Shaxs OTMda tasdiqlandi');loadUsers()});
}
async function unverifyUserIdentity(id){
  if(!confirm('Shaxs tasdig‘i bekor qilinsa foydalanuvchining faol sessiyalari ham chiqariladi. Davom etilsinmi?'))return;
  try{await api('/users/'+id+'/identity-verification',{method:'DELETE'});toast('Shaxs tasdig‘i bekor qilindi');loadUsers()}catch(e){toast(e.message)}
}
async function resetUserTwoFactor(id){
  if(!confirm('2FA reset qilinsa authenticator va recovery kodlar bekor bo‘ladi, barcha sessiyalar ham chiqariladi. Davom etilsinmi?'))return;
  try{await api('/users/'+id+'/reset-2fa',{method:'POST'});toast('2FA reset qilindi');loadUsers()}catch(e){toast(e.message)}
}
async function revokeUserSessions(id){
  if(!confirm('Bu foydalanuvchining barcha qurilmalardagi faol sessiyalari bekor qilinsinmi?'))return;
  try{await api('/users/'+id+'/revoke-sessions',{method:'POST'});toast('Sessiyalar bekor qilindi')}catch(e){toast(e.message)}
}
async function resetUserPassword(id){
  if(!confirm('Yangi vaqtinchalik parol yaratiladimi?'))return;
  try{const x=await api('/users/'+id+'/reset-password',{method:'POST',body:'{}'});alert('Yangi vaqtinchalik parol:\n\n'+x.temporaryPassword+'\n\nKeyingi kirishda foydalanuvchi parolni almashtirishi shart.')}catch(e){toast(e.message)}
}
$('#applyUserFilter').onclick=loadUsers;
$('#bulkStudentPassword')?.addEventListener('click',()=>{
  modal('Talabalar parolini bir xil qilish','<div class="info-note warning"><b>Barcha faol talabalar</b><span>Yangi parol saqlanganda barcha faol talabalarning eski sessiyalari yopiladi va yangi parol darhol ishlaydi.</span></div><label>Yangi umumiy parol<input name="password" type="text" minlength="8" value="student00" required autocomplete="off"></label>',async d=>{
    const password=String(d.password||'').trim();
    if(password.length<8)throw new Error('Parol kamida 8 ta belgidan iborat bo‘lsin');
    const out=await api('/users/bulk-student-password',{method:'POST',body:JSON.stringify({password})});
    toast(out.count+' ta talaba paroli yangilandi');
    loadUsers();
  });
});

$('#resetTestStudents')?.addEventListener('click',async()=>{
  if(!confirm('Barcha mavjud TALABA akkauntlari o‘chiriladi va student001–student040 qayta yaratiladi. Davom etilsinmi?'))return;
  try{
    const out=await api('/users/test-students/reset',{method:'POST'});
    toast(out.created+' ta test talaba yaratildi · parol: '+out.password);
    $('#userSearch').value='';$('#userRoleFilter').value='student';await loadUsers();
  }catch(e){toast(e.message)}
});
$('#userSearch').addEventListener('keydown',function(e){if(e.key==='Enter')loadUsers()});
async function editUser(id){
  try{
    const [x,structures]=await Promise.all([api('/users/'+id),api('/structure')]),u=x.user;
    const faculties=structures.filter(v=>v.type==='faculty'&&v.active),ext=v=>v?.externalId||v?.code||v?._id||'';
    const currentFaculty=ext(u.facultyId)||u.faculty||'',currentDepartment=ext(u.departmentId)||u.department||'',currentGroup=ext(u.groupId)||u.group||'';
    const roles=['student','teacher','tutor','department','dean','rectorate','tech','admin'].concat(user.role==='superadmin'?['superadmin']:[]);
    modal('Akkauntni tahrirlash',
      '<label>F.I.Sh.<input name="fullName" value="'+esc(u.fullName||'')+'" required></label>'+
      '<label>Rol<select name="role">'+roles.map(r=>'<option value="'+r+'" '+(u.role===r?'selected':'')+'>'+esc(roleName[r]||r)+'</option>').join('')+'</select></label>'+
      '<label>Email<input name="email" type="email" value="'+esc(u.email||'')+'"></label>'+
      '<label>Telefon<input name="phone" value="'+esc(u.phone||'')+'"></label>'+
      '<label>Fakultet<select name="facultyId"><option value="">Fakultetni tanlang</option>'+faculties.map(v=>'<option value="'+esc(ext(v))+'" '+(currentFaculty===ext(v)?'selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select></label>'+
      '<label>Kafedra<select name="departmentId"><option value="">—</option></select></label>'+
      '<label>Guruh<select name="groupId"><option value="">—</option></select></label>',
      async d=>{await api('/users/'+id,{method:'PATCH',body:JSON.stringify(d)});loadUsers()}
    );
    setupOrgCascade(structures,{facultyValue:currentFaculty,departmentValue:currentDepartment,groupValue:currentGroup});
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
      '<div class="profile-data"><p><b>2FA:</b> '+(u.totpEnabled?'Yoqilgan':'O‘chiq')+'</p><p><b>OTMda shaxs tasdig‘i:</b> '+(u.identityVerifiedAt?'Tasdiqlangan · '+new Date(u.identityVerifiedAt).toLocaleString('uz-UZ'):'Tasdiqlanmagan')+'</p><p><b>Fakultet:</b> '+esc(u.facultyId?.name||u.faculty||'—')+'</p><p><b>Kafedra:</b> '+esc(u.departmentId?.name||u.department||'—')+'</p><p><b>Guruh:</b> '+esc(u.groupId?.name||u.group||'—')+'</p><p><b>Telefon:</b> '+esc(u.phone||'—')+'</p><p><b>Email:</b> '+esc(u.email||'—')+'</p><p><b>Oxirgi kirish:</b> '+(u.lastLoginAt?new Date(u.lastLoginAt).toLocaleString('uz-UZ'):'—')+'</p><p><b>Kirishlar:</b> '+esc(u.loginCount||0)+'</p><p><b>Bio:</b> '+esc(u.bio||'—')+'</p></div>',
      async()=>{}
    );$('#modalSave').classList.add('hidden')
  }catch(e){toast(e.message)}
}
function setupOrgCascade(structures,{facultyValue='',departmentValue='',groupValue=''}={}){
  const ext=x=>x?.externalId||x?.code||x?._id||'', faculties=structures.filter(x=>x.type==='faculty'&&x.active),departments=structures.filter(x=>x.type==='department'&&x.active),groups=structures.filter(x=>x.type==='group'&&x.active);
  const byId=new Map(structures.map(x=>[String(x._id),x])),facultySelect=$('#modalForm [name="facultyId"]'),departmentSelect=$('#modalForm [name="departmentId"]'),groupSelect=$('#modalForm [name="groupId"]');
  if(!facultySelect||!departmentSelect||!groupSelect)return;
  const facultyOfDepartment=d=>d?.parentId?byId.get(String(d.parentId)):null;
  const departmentOfGroup=g=>g?.parentId?byId.get(String(g.parentId)):null;
  const facultyOfGroup=g=>facultyOfDepartment(departmentOfGroup(g));
  const renderDepartments=(selected='')=>{
    const fv=facultySelect.value;
    const rows=departments.filter(d=>!fv||ext(facultyOfDepartment(d))===fv);
    departmentSelect.innerHTML='<option value="">—</option>'+rows.map(d=>'<option value="'+esc(ext(d))+'" '+(ext(d)===selected?'selected':'')+'>'+esc(d.name)+'</option>').join('');
  };
  const renderGroups=(selected='')=>{
    const fv=facultySelect.value,dv=departmentSelect.value;
    const rows=groups.filter(g=>{
      const dep=departmentOfGroup(g),fac=facultyOfGroup(g);
      if(dv)return ext(dep)===dv;
      if(fv)return ext(fac)===fv;
      return false;
    });
    groupSelect.innerHTML='<option value="">Biriktirilmagan</option>'+rows.map(g=>'<option value="'+esc(ext(g))+'" '+(ext(g)===selected?'selected':'')+'>'+esc(g.name)+' — '+esc(ext(g))+'</option>').join('');
  };
  facultySelect.onchange=()=>{renderDepartments('');renderGroups('')};
  departmentSelect.onchange=()=>renderGroups('');
  groupSelect.onchange=()=>{
    const g=groups.find(x=>ext(x)===groupSelect.value);if(!g)return;
    const dep=departmentOfGroup(g),fac=facultyOfGroup(g);
    if(fac){facultySelect.value=ext(fac);renderDepartments(ext(dep))}
    if(dep)departmentSelect.value=ext(dep);
  };
  facultySelect.value=facultyValue||'';
  renderDepartments(departmentValue||'');
  departmentSelect.value=departmentValue||'';
  renderGroups(groupValue||'');
  groupSelect.value=groupValue||'';
}
$('#addUser').onclick=async()=>{
  const structures=await api('/structure').catch(()=>[]),faculties=structures.filter(x=>x.type==='faculty'&&x.active),ext=x=>x.externalId||x.code||x._id;
  modal('Akkaunt yaratish',
    '<label>F.I.Sh.<input name="fullName" required></label><label>Login<input name="login" required></label><label>Vaqtinchalik parol<input name="password" placeholder="Bo‘sh qoldirilsa avtomatik"></label><label>Telefon<input name="phone" placeholder="+998..."></label><label>Email<input name="email" type="email"></label>'+
    '<label>Rol<select name="role">'+['student','teacher','tutor','department','dean','rectorate','tech','admin'].map(x=>'<option value="'+x+'">'+esc(roleName[x]||x)+'</option>').join('')+'</select></label>'+
    '<label>Fakultet<select name="facultyId"><option value="">Fakultetni tanlang</option>'+faculties.map(x=>'<option value="'+esc(ext(x))+'">'+esc(x.name)+'</option>').join('')+'</select></label>'+
    '<label>Kafedra<select name="departmentId"><option value="">Avval fakultetni tanlang</option></select></label>'+
    '<label>Guruh<select name="groupId"><option value="">Avval fakultetni tanlang</option></select></label><label>Kurs<select name="courseYear"><option value="">—</option>'+[1,2,3,4,5,6].map(x=>'<option value="'+x+'">'+x+'-kurs</option>').join('')+'</select></label><label>Yo‘nalish<input name="direction" placeholder="Masalan: Dasturiy injiniring"></label>',
    async d=>{const x=await api('/users',{method:'POST',body:JSON.stringify(d)});alert('Yangi akkaunt yaratildi.\nVaqtinchalik parol: '+x.temporaryPassword);loadUsers()}
  );
  setupOrgCascade(structures);
};

function chooseFile(){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.xlsx,.csv';input.onchange=()=>resolve(input.files?.[0]||null);input.click()})}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)})}
function csvEscape(v){const x=String(v??'');return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}
function downloadText(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadCredentials(rows){const csv=['full_name,login,role,password,group_id',...rows.map(r=>[r.fullName,r.login,r.role,r.password,r.group_id].map(csvEscape).join(','))].join('\n');downloadText('masofaviy2-yangi-login-parollar.csv','\ufeff'+csv)}
async function bulkImport(kind){const file=await chooseFile();if(!file)return;if(file.size>8*1024*1024)return toast('Fayl 8 MB dan katta bo‘lmasin');try{toast('Fayl tekshirilmoqda…');const contentBase64=await fileToBase64(file),endpoint=kind==='users'?'/users/bulk-import':'/schedules/bulk-import';const p=await api(endpoint,{method:'POST',body:JSON.stringify({filename:file.name,contentBase64,dryRun:true})});const errs=(p.errors||[]).slice(0,8).map(e=>e.row+'-qator: '+e.message).join('\n');if(!confirm('Tekshiruv tugadi.\nJami: '+p.total+'\nTayyor: '+p.valid+'\nXato: '+p.invalid+'\n\n'+(errs||'Xato topilmadi.')+'\n\nImportni davom ettiraymi?'))return;const r=await api(endpoint,{method:'POST',body:JSON.stringify({filename:file.name,contentBase64,dryRun:false})});if(kind==='users'&&r.credentials?.length)downloadCredentials(r.credentials);toast((r.imported||0)+' ta yozuv import qilindi');kind==='users'?loadUsers():loadSchedules()}catch(e){toast(e.message)}}
$('#importUsers').onclick=()=>bulkImport('users');$('#importSchedules').onclick=()=>bulkImport('schedules');
$('#userTemplate').onclick=()=>downloadText('qardtu-foydalanuvchilar-template.csv','\ufefffull_name,login,role,password,faculty_id,department_id,group_id,course_year,direction,email,phone\nTalaba F.I.Sh.,talaba.login,student,KuchliParol123!,QDTU-F-RTSI,QDTU-D-RTSI-ATT,QDTU-MT-2026-AT-01,1,Axborot tizimlari va texnologiyalari,,+998901234567\nOqituvchi F.I.Sh.,oqituvchi.login,teacher,KuchliParol123!,QDTU-F-RTSI,QDTU-D-RTSI-ATT,,,,,');
$('#scheduleTemplate').onclick=()=>downloadText('qardtu-dars-jadvali-template.csv','\ufefftitle,subject,group_id,teacher_login,weekday,start,end,room,kind\nDasturlash asoslari,Dasturlash asoslari,QDTU-MT-2026-DI-01,oqituvchi.login,1,18:00,19:20,ONLINE-DI,lecture\nAmaliy mashgulot,Dasturlash asoslari,QDTU-MT-2026-DI-01,oqituvchi.login,3,18:00,19:20,ONLINE-DI,practice');
async function loadPrivacyStatus(){
  const box=$('#privacyStatus');if(!box)return;
  try{
    const x=await api('/compliance/me');
    const privacyGranted=(x.consents||[]).some(c=>c.type==='privacy'&&c.granted&&!c.revokedAt);
    const face=x.identity?.last;
    box.innerHTML='<b>Identifikatsiya: '+esc(x.identity?.mode||'—')+'</b><span>'+(x.identity?.mode==='demo'?'Demo Face ID — huquqiy identifikatsiya emas. Yuz rasmi/shabloni saqlanmaydi.':(x.identity?.oneIdConfigured?'OneID konfiguratsiyasi tayyor':'OneID hali ulanmagan'))+'</span><span>Maxfiylik roziligi: '+(privacyGranted?'berilgan':'berilmagan')+'</span>'+(face?'<span>Oxirgi identity hodisasi: '+esc(face.status)+' · '+new Date(face.createdAt).toLocaleString()+'</span>':'')+'<span><a href="/privacy.html" target="_blank" rel="noopener">Maxfiylik siyosatini ochish</a></span>';
    $('#acceptPrivacy')?.classList.toggle('active-control',privacyGranted);
  }catch(e){box.textContent=e.message}
}
$('#acceptPrivacy')?.addEventListener('click',async()=>{try{await api('/compliance/consent',{method:'POST',body:JSON.stringify({type:'privacy',granted:true})});toast('Maxfiylik roziligi saqlandi');loadPrivacyStatus()}catch(e){toast(e.message)}});
$('#privacyRequestBtn')?.addEventListener('click',()=>modal('Shaxsga doir ma’lumot bo‘yicha so‘rov','<label>So‘rov turi<select name="type"><option value="access">Ma’lumotlarim bilan tanishish</option><option value="correction">Tuzatish</option><option value="restriction">Ishlovni cheklash</option><option value="deletion">O‘chirish so‘rovi</option></select></label><label>Izoh<textarea name="note" rows="4" maxlength="1000"></textarea></label>',async d=>{await api('/compliance/privacy-request',{method:'POST',body:JSON.stringify(d)});toast('So‘rov yuborildi');loadPrivacyStatus()}));
$('#oneIdStatusBtn')?.addEventListener('click',async()=>{try{const x=await fetch('/api/auth/oneid/readiness',{cache:'no-store'}).then(r=>r.json());modal('OneID integratsiya holati','<div class="info-note"><b>'+(x.configured?'OneID texnik konfiguratsiyasi tayyor':'OneID hali productionga ulanmagan')+'</b><span>Shartnoma: talab qilinadi</span><span>Client ID: '+(x.clientIdConfigured?'bor':'yo‘q')+'</span><span>Client secret: '+(x.clientSecretConfigured?'bor':'yo‘q')+'</span><span>Redirect URI: '+(x.redirectUriConfigured?'bor':'yo‘q')+'</span></div>',async()=>{})}catch(e){toast(e.message)}});
async function loadProfile(){try{const x=await api('/profile'),u=x.user,initials=(u.fullName||u.login||'?').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase();$('#profileCard').innerHTML='<div class="avatar big '+(u.avatarUrl?'has-photo':'')+'" '+(u.avatarUrl?'style="background-image:url(\''+esc(u.avatarUrl)+'\')"':'')+'>'+(!u.avatarUrl?esc(initials):'')+'</div><div><h2>'+esc(u.fullName)+'</h2><p>@'+esc(u.login)+' · '+esc(roleName[u.role]||u.role)+'</p><span class="role-chip">'+esc(roleName[u.role]||u.role)+'</span></div>';const form=$('#profileForm');form.fullName.value=u.fullName||'';form.email.value=u.email||'';form.phone.value=u.phone||'';form.avatarUrl.value=u.avatarUrl||'';form.direction.value=u.direction||'';form.courseYear.value=u.courseYear||'';form.bio.value=u.bio||'';$('#profileOrg').innerHTML='<p><b>Fakultet:</b> '+esc(u.facultyId?.name||u.faculty||'—')+'</p><p><b>Kafedra:</b> '+esc(u.departmentId?.name||u.department||'—')+'</p><p><b>Guruh:</b> '+esc(u.groupId?.name||u.group||'—')+'</p><p><b>Kurs / yo‘nalish:</b> '+esc(u.courseYear?u.courseYear+'-kurs':'—')+' · '+esc(u.direction||'—')+'</p>';const base=location.origin+'/timetable.html?';let link='';if(u.role==='teacher')link=base+'teacher='+encodeURIComponent(u.login);if(u.role==='student'){const gid=u.groupId?.externalId||u.groupId?.code||u.group;if(gid)link=base+'group='+encodeURIComponent(gid)}$('#profileTimetable').innerHTML=link?linkBox('Shaxsiy jadval havolasi',link):'';renderSecurityStatus(u);await Promise.all([loadDevicePrefs(),loadPrivacyStatus()])}catch(e){toast(e.message)}}
$('#profileForm').onsubmit=async e=>{e.preventDefault();try{await api('/profile',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});toast('Profil yangilandi');const me=await api('/me');user=me.user;configureRoleUI();loadProfile()}catch(err){toast(err.message)}};
$('#uploadProfileAvatar')?.addEventListener('click',async()=>{
  const file=$('#profileAvatarFile')?.files?.[0];
  if(!file)return toast('Avval rasm tanlang');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('JPG, PNG yoki WEBP rasm tanlang');
  if(file.size>3*1024*1024)return toast('Rasm hajmi 3 MB dan oshmasin');
  try{
    const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Rasm o‘qilmadi'));r.readAsDataURL(file)});
    const out=await api('/profile/avatar',{method:'POST',body:JSON.stringify({dataUrl})});
    const form=$('#profileForm');if(form?.elements?.avatarUrl)form.elements.avatarUrl.value=out.avatarUrl||'';
    toast('Profil rasmi yuklandi');await loadProfile();
  }catch(e){toast(e.message)}
});
$('#passwordForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(d.newPassword!==d.confirmPassword)return toast('Yangi parollar bir xil emas');try{await api('/profile/password',{method:'PATCH',body:JSON.stringify({currentPassword:d.currentPassword,newPassword:d.newPassword})});e.target.reset();toast('Parol yangilandi')}catch(err){toast(err.message)}};
function renderSecurityStatus(u=user){
  if(!u)return;const enabled=Boolean(u.totpEnabled);const status=$('#twoFactorStatus');if(status)status.innerHTML='<b>2 bosqichli himoya: '+(enabled?'yoqilgan':'o‘chiq')+'</b><span>'+(enabled?'Authenticator kodi login paytida talab qilinadi.':'Authenticator ilovasi bilan akkauntni qo‘shimcha himoyalash mumkin.')+'</span>';
  $('#enableTwoFactor')?.classList.toggle('hidden',enabled);$('#disableTwoFactor')?.classList.toggle('hidden',!enabled);
}
$('#enableTwoFactor')?.addEventListener('click',()=>modal('2FA sozlash','<p>Avval joriy parolingiz bilan amalni tasdiqlang.</p><label>Joriy parol<input name="currentPassword" type="password" required></label>',async d=>{
  const setup=await api('/auth/2fa/setup',{method:'POST',body:JSON.stringify({currentPassword:d.currentPassword})});
  setTimeout(()=>modal('Authenticatorni ulang','<p>Authenticator ilovasida yangi akkaunt qo‘shing. Secretni qo‘lda kiriting yoki quyidagi otpauth manzilidan foydalaning.</p><label>Secret<input value="'+esc(setup.secret)+'" readonly></label><label>otpauth URI<textarea readonly>'+esc(setup.otpauthUri)+'</textarea></label><label>6 xonali kod<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" required></label>',async x=>{
    const enabled=await api('/auth/2fa/enable',{method:'POST',body:JSON.stringify({code:x.code})});user.totpEnabled=true;renderSecurityStatus(user);
    setTimeout(()=>modal('Recovery kodlari','<p><b>Bu kodlar faqat bir marta ko‘rsatiladi.</b> Authenticator qurilmangiz yo‘qolsa, login paytida bittasini ishlating.</p><textarea rows="10" readonly>'+esc((enabled.recoveryCodes||[]).join('\n'))+'</textarea>',async()=>{}),80);
  }),80);
}));
$('#disableTwoFactor')?.addEventListener('click',()=>modal('2FA o‘chirish','<p>2FA ni o‘chirish uchun parol va authenticator yoki recovery kodini kiriting.</p><label>Joriy parol<input name="currentPassword" type="password" required></label><label>Kod<input name="code" autocomplete="one-time-code" required></label>',async d=>{await api('/auth/2fa/disable',{method:'POST',body:JSON.stringify(d)});user.totpEnabled=false;renderSecurityStatus(user);toast('2FA o‘chirildi')}));
$('#revokeSessions')?.addEventListener('click',async()=>{if(!confirm('Boshqa qurilmalardagi barcha faol sessiyalar chiqarilsinmi?'))return;try{await api('/auth/revoke-sessions',{method:'POST'});toast('Boshqa sessiyalar bekor qilindi')}catch(e){toast(e.message)}});



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
    const [x,scheduleRows]=await Promise.all([api('/live/rooms'),api('/schedules')]);
    const rooms=x.rooms||[],now=Number(x.nowMinute??((new Date().getHours()*60)+new Date().getMinutes())),today=(new Date().getDay()||7);
    $('#liveTodayCount').textContent=rooms.length;
    $('#liveActiveCount').textContent=rooms.filter(r=>r.session?.status==='active').length;
    $('#livePeopleCount').textContent=rooms.reduce((n,r)=>n+(r.session?.currentParticipants||0),0);

    const card=r=>{
      const s=r.schedule,g=s.groupId,t=s.teacherId,active=r.session?.status==='active',ended=r.session?.status==='ended',startMinute=Number(r.startMinute??0),endMinute=Number(r.endMinute??1440),isNow=now>=startMinute&&now<endMinute;
      let actions='';
      if(active&&r.canJoin)actions+='<button class="primary" data-live-join="'+esc(s._id)+'">'+icon('external','↗')+' Kirish</button>';
      else if(r.canStart&&isNow)actions+='<button class="primary" data-live-start="'+esc(s._id)+'">'+icon('video','▶')+' '+(ended?'Qayta boshlash':'Boshlash')+'</button>';
      else if(now<startMinute)actions+='<span class="room-note">Boshlanishi '+esc(s.start)+'</span>';
      else actions+='<span class="room-note">'+(ended||now>=endMinute?'Vaqti tugagan':'O‘qituvchi boshlashini kuting')+'</span>';
      const state=active?'is-live':(isNow?'is-current':(now<startMinute?'is-upcoming':'is-finished'));
      return '<article class="live-room-card '+state+'"><div class="live-room-top">'+liveStatusLabel(r)+'<span class="room-time">'+esc(s.start)+'–'+esc(s.end)+'</span></div><h2>'+esc(s.title)+'</h2><p class="room-subject">'+esc(s.subject||'')+'</p><div class="room-meta"><span>'+icon('users','♙')+' '+esc(g?.name||'Guruh')+' <b>'+esc(g?.externalId||g?.code||'')+'</b></span><span>'+icon('user','◎')+' '+esc(t?.fullName||'O‘qituvchi')+'</span><span>'+icon('users','•')+' '+esc(r.session?.currentParticipants||0)+' xonada</span></div><div class="room-actions">'+actions+'</div></article>';
    };

    const current=rooms.filter(r=>r.session?.status==='active'||(now>=Number(r.startMinute||0)&&now<Number(r.endMinute||1440)));
    const later=rooms.filter(r=>!current.includes(r)&&now<Number(r.startMinute||0));
    const finished=rooms.filter(r=>!current.includes(r)&&!later.includes(r));

    const days=['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba'],distance=d=>((Number(d)-today)+7)%7;
    const upcoming=(scheduleRows||[]).filter(s=>{
      if(Number(s.weekday)===today||s.kind==='final_exam'||s.liveEnabled===false)return false;
      if(user?.role==='student')return scheduleGroupMatchesUser(s);
      return true;
    }).sort((a,b)=>distance(a.weekday)-distance(b.weekday)||String(a.start).localeCompare(String(b.start))).slice(0,16);

    const upcomingCard=s=>'<article class="live-upcoming-row"><div><b>'+esc(days[Number(s.weekday)]||'Kun')+' · '+esc(s.start)+'–'+esc(s.end)+'</b><span>'+esc(s.title)+' · '+esc(s.subject||'')+'</span><small>'+esc(s.groupId?.name||s.group||'Guruh')+' · '+esc(s.teacherId?.fullName||s.teacher||'O‘qituvchi')+'</small></div></article>';

    $('#liveRooms').innerHTML=
      '<section class="live-section live-section-current"><div class="live-section-head"><div><b>Hozirgi darslar</b><small>Hozir davom etayotgan yoki ayni vaqt oralig‘idagi darslar</small></div><span>'+current.length+'</span></div><div class="live-scroll-list">'+(current.map(card).join('')||'<div class="empty compact"><b>Hozir faol dars yo‘q</b></div>')+'</div></section>'+
      '<section class="live-section"><div class="live-section-head"><div><b>Bugun keyin</b><small>Bugunning navbatdagi darslari</small></div><span>'+later.length+'</span></div><div class="live-scroll-list">'+(later.map(card).join('')||'<div class="empty compact">Bugun boshqa dars yo‘q</div>')+'</div></section>'+
      '<section class="live-section"><div class="live-section-head"><div><b>Keyingi kunlar</b><small>Haftalik jadval bo‘yicha keladigan darslar</small></div><span>'+upcoming.length+'</span></div><div class="live-upcoming-scroll">'+(upcoming.map(upcomingCard).join('')||'<div class="empty compact">Keladigan dars topilmadi</div>')+'</div></section>'+
      (finished.length?'<details class="live-finished"><summary>Bugun tugagan darslar · '+finished.length+'</summary><div class="live-scroll-list">'+finished.map(card).join('')+'</div></details>':'');

    all('[data-live-start]').forEach(b=>b.onclick=()=>startLiveRoom(b.dataset.liveStart));
    all('[data-live-join]').forEach(b=>b.onclick=()=>enterLiveRoom(b.dataset.liveJoin));
    hydrateIcons($('#liveRooms'));
  }catch(e){$('#liveRooms').innerHTML='<div class="empty"><b>Jonli xonalarni yuklab bo‘lmadi</b><p>'+esc(e.message)+'</p></div>'}
}
async function startLiveRoom(id){
  try{const x=await api('/live/rooms/'+id+'/start',{method:'POST',body:'{}'});await openConference(x)}catch(e){toast(e.message)}
}
async function enterLiveRoom(id){
  try{const x=await api('/live/rooms/'+id+'/join',{method:'POST',body:'{}'});await openConference(x)}catch(e){toast(e.message);go('live')}
}

function formatRemain(sec){sec=Math.max(0,Math.floor(sec));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function startLessonClock(){
  clearInterval(lessonTimer);let warned=false;
  const tick=()=>{
    if(!activeLiveSession?.schedule)return;
    const end=String(activeLiveSession.schedule.end||'00:00').split(':').map(Number),now=new Date(),endDate=new Date(now);endDate.setHours(end[0]||0,end[1]||0,0,0);
    let sec=Math.floor((endDate-now)/1000);if(sec<0)sec=0;
    const el=$('#lessonTimeLeft');if(el){el.textContent=formatRemain(sec)+' qoldi';el.classList.toggle('warning',sec>0&&sec<=300)}
    if(sec<=300&&sec>0&&!warned){warned=true;toast('Dars tugashiga 5 daqiqa qoldi')}
  };tick();lessonTimer=setInterval(tick,1000)
}
function startNetworkMonitor(){
  clearInterval(networkTimer);
  const update=()=>{
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    let quality='good',label='Yaxshi';
    if(!navigator.onLine){quality='bad';label='Ulanish yo‘q'}
    else if(conn){const rtt=Number(conn.rtt||0),down=Number(conn.downlink||0),type=String(conn.effectiveType||'');if(/2g/.test(type)||rtt>500||(down&&down<0.8)){quality='bad';label='Yomon'}else if(/3g/.test(type)||rtt>250||(down&&down<2)){quality='mid';label='O‘rtacha'}}
    const b=$('#networkQualityBadge');if(b){b.className='network-quality '+quality;b.textContent='● '+label}
    if(mediaRoomClient&&!mediaRoomClient.lowBandwidthMode){
      const q=quality==='bad'?'240':quality==='mid'?'360':'auto';
      if(lastAutoQuality!==q){lastAutoQuality=q;mediaRoomClient.setReceiveQuality(q).catch(()=>{})}
    }
    $('#connectionBanner')?.classList.toggle('hidden',navigator.onLine&&socket?.connected!==false);
  };update();networkTimer=setInterval(update,ultraLiteUI?7000:(lowEndUI?5000:3000))
}
function showReaction(m){
  if(ultraLiteUI)return;
  const box=$('#reactionStage');if(!box)return;const n=document.createElement('div');n.className='reaction-bubble';n.textContent=(m.reaction||'👏')+' '+(m.fullName||'');box.appendChild(n);setTimeout(()=>n.remove(),2400)
}
async function loadDeviceChoices(){
  if(!mediaRoomClient)return;
  const d=await mediaRoomClient.listDevices(),mic=$('#micDeviceSelect'),cam=$('#cameraDeviceSelect');
  if(mic)mic.innerHTML='<option value="">Default mikrofon</option>'+d.audio.map((x,i)=>'<option value="'+esc(x.deviceId)+'">'+esc(x.label||('Mikrofon '+(i+1)))+'</option>').join('');
  if(cam)cam.innerHTML='<option value="">Default kamera</option>'+d.video.map((x,i)=>'<option value="'+esc(x.deviceId)+'">'+esc(x.label||('Kamera '+(i+1)))+'</option>').join('');
}
async function rejoinActiveLesson(){
  if(!activeLessonId)return false;
  const id=String(activeLessonId);
  try{
    const x=await api('/live/rooms/'+id+'/join',{method:'POST',body:'{}'});
    await openConference(x);
    $('#connectionBanner')?.classList.add('hidden');$('#callRejoin')?.classList.add('hidden');return true;
  }catch(e){toast('Qayta ulanish: '+e.message);return false}
}
async function autoRejoinLesson(){
  if(!activeLessonId||autoRejoinTimer)return;
  $('#callRejoin')?.classList.remove('hidden');$('#connectionBanner')?.classList.remove('hidden');
  autoRejoinTimer=setTimeout(async()=>{autoRejoinTimer=null;await rejoinActiveLesson()},3000)
}
function formatFocusTime(sec){
  sec=Math.max(0,Math.round(Number(sec)||0));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function proctorStateLabel(state){
  return state==='present'?'Yuz bor':state==='away'?'E’tibor yo‘q':state==='missing'?'Yuz yo‘q':'Aniqlanmoqda';
}
function updateParticipantProctorIndicator(x){
  if(!x?.userId)return;liveProctorStates.set(String(x.userId),x);
  const row=document.querySelector('[data-attendance-student="'+CSS.escape(String(x.userId))+'"]');if(!row)return;
  const badge=row.querySelector('[data-proctor-badge]'),meta=row.querySelector('[data-proctor-meta]');
  if(badge){badge.className='proctor-chip '+(x.cameraReady?'camera-on ':'camera-off ')+(x.faceState||'unknown');badge.textContent=x.cameraReady?('● '+proctorStateLabel(x.faceState)):'○ Kamera yo‘q'}
  if(meta)meta.textContent='Yuz '+formatFocusTime(x.presentSeconds)+' / '+formatFocusTime(x.observedSeconds)+' · '+Math.round(Number(x.attentionPercent)||0)+'%';
}
function refreshLiveProctorSummary(){
  let face=0,low=0;
  for(const x of liveProctorStates.values()){
    if(x?.cameraReady&&x.faceState==='present')face++;
    if(Number(x?.observedSeconds||0)>=30&&Number(x?.attentionPercent||0)<60)low++;
  }
  const a=document.querySelector('[data-live-face-count]'),b=document.querySelector('[data-live-attention-low]');
  if(a)a.textContent=String(face);if(b)b.textContent=String(low);
}
async function startLiveLessonProctoring(){
  await liveProctorStop?.();liveProctorStop=()=>{};liveProctorStream=null;liveProctorTrack=null;
  if(user?.role!=='student'||!activeLessonId)return false;
  let stream=null,detector=null,timer=null,heartbeat=null,video=null,stopped=false,faceState='unknown',pageActive=!document.hidden&&document.hasFocus();
  const effectiveState=()=>pageActive?faceState:'away';
  const emit=()=>{if(!stopped&&activeLessonId&&socket?.connected)socket.emit('lesson:proctor-state',{lessonId:activeLessonId,cameraReady:Boolean(liveProctorTrack?.readyState==='live'),faceState:effectiveState(),pageActive})};
  const onVisibility=()=>{pageActive=!document.hidden&&document.hasFocus();emit()};
  const onBlur=()=>{pageActive=false;emit()};
  const onFocus=()=>{pageActive=!document.hidden;emit()};
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('blur',onBlur);window.addEventListener('focus',onFocus);
  try{
    const camId=localStorage.getItem('m2-preferred-camera')||'',constraints={width:{ideal:960,max:1280},height:{ideal:540,max:720},frameRate:{ideal:12,max:15},facingMode:'user'};
    if(camId)constraints.deviceId={ideal:camId};
    stream=await navigator.mediaDevices.getUserMedia({video:constraints,audio:false});
    liveProctorStream=stream;liveProctorTrack=stream.getVideoTracks()[0]||null;if(!liveProctorTrack)throw new Error('Kamera trek topilmadi');
    mediaRoomClient?.setExternalCameraTrack?.(liveProctorTrack);
    liveProctorTrack.addEventListener('ended',()=>{faceState='missing';emit();toast('Dars proktoring kamerasi o‘chdi')},{once:true});
    video=document.createElement('video');video.srcObject=stream;video.muted=true;video.playsInline=true;video.width=320;video.height=180;await video.play();
    try{
      if(!window.FaceDetection){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/face-detection/face_detection.js';s.onload=resolve;s.onerror=reject;document.head.append(s)})}
      const instance=new window.FaceDetection({locateFile:file=>'/vendor/face-detection/'+file});instance.setOptions({model:'short',minDetectionConfidence:.62});
      instance.onResults(result=>{
        if(stopped)return;const faces=result.detections||[];
        if(!faces.length){faceState='missing';return}
        if(faces.length>1){faceState='away';return}
        const d=faces[0],b=d.boundingBox;let away=false;
        if(b&&Number.isFinite(b.xCenter)&&Number.isFinite(b.yCenter))away=Math.abs(b.xCenter-.5)>.24||Math.abs(b.yCenter-.5)>.24;
        const pts=d.landmarks||d.keypoints||d.locationData?.relativeKeypoints||[];
        if(Array.isArray(pts)&&pts.length>=3){
          const px=v=>({x:Number(v?.x??v?.xCenter),y:Number(v?.y??v?.yCenter)}),a=px(pts[0]),bb=px(pts[1]),n=px(pts[2]);
          if([a.x,bb.x,n.x].every(Number.isFinite)){const eye=Math.abs(a.x-bb.x),mid=(a.x+bb.x)/2;if(eye>.02&&Math.abs(n.x-mid)/eye>.46)away=true}
        }
        state=away?'away':'present';
      });detector={kind:'mediapipe',instance};
    }catch{
      try{if('FaceDetector'in window)detector={kind:'native',instance:new FaceDetector({fastMode:true,maxDetectedFaces:2})}}catch{}
    }
    timer=setInterval(async()=>{
      if(stopped||!video||video.readyState<2)return;
      try{
        if(detector?.kind==='mediapipe')await detector.instance.send({image:video});
        else if(detector?.kind==='native'){
          const faces=await detector.instance.detect(video);
          if(!faces.length)faceState='missing';else if(faces.length>1)faceState='away';else{const b=faces[0].boundingBox,cx=(b.x+b.width/2)/video.videoWidth,cy=(b.y+b.height/2)/video.videoHeight;state=(Math.abs(cx-.5)>.24||Math.abs(cy-.5)>.24)?'away':'present'}
        }else faceState='unknown';
      }catch{faceState='unknown'}
    },1200);
    heartbeat=setInterval(emit,5000);emit();toast('Dars proktoringi faol · video lokal tahlil qilinadi');
    liveProctorStop=async()=>{
      if(stopped)return;stopped=true;clearInterval(timer);clearInterval(heartbeat);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);try{detector?.instance?.close?.()}catch{};try{mediaRoomClient?.setExternalCameraTrack?.(null)}catch{};stream?.getTracks().forEach(t=>t.stop());liveProctorStream=null;liveProctorTrack=null;
    };
    return true;
  }catch(e){
    faceState='missing';emit();toast('Dars proktoring kamerasi ishlamadi: '+(e.message||'ruxsat yo‘q'));
    liveProctorStop=async()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);stream?.getTracks().forEach(t=>t.stop());liveProctorStream=null;liveProctorTrack=null};
    return false;
  }
}
async function openConference(payload){
  const join=payload.join,s=payload.schedule;if(!join||!s)return toast('Video xona ma’lumoti topilmadi');
  if(join.provider!=='mediasoup')return toast('Media provayder sozlamasi noto‘g‘ri');
  if(!window.MasofaviyMediaClientBundle?.MediaRoomClient)return toast('Mediasoup klient yuklanmagan. Ctrl+F5 qiling.');
  activeLessonId=String(s._id);activeLiveSession={schedule:s,join};lastLessonPayload=payload;chatUnread=0;handRaised=false;raisedHands.clear();raisedHandUsers.clear();updateRaisedHandAlert();
  go('lesson');$('#liveLessonTitle').textContent=s.title||'Jonli dars';$('#liveLessonMeta').textContent=(s.groupId?.name||'Guruh')+' · '+(s.teacherId?.fullName||'O‘qituvchi')+' · '+s.start+'–'+s.end+(user.role==='student'?' · Proktor kamera lokal nazoratda':' · Yuz-faollik nazorati');
  $('#endLiveLesson').classList.add('hidden');$('#teacherQuickControls')?.classList.toggle('hidden',user.role!=='teacher'&&!can('live.manage'));$('#chatUnreadBadge')?.classList.add('hidden');startLessonClock();startNetworkMonitor();
  const mount=$('#videoMount');mount.innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Universitet SFU serveriga ulanmoqda…</b><small>'+(user.role==='student'?'Talaba · kamera OFF · mikrofon OFF':(ultraLiteUI?'Lite rejim · 240p':'O‘qituvchi media tayyorlanmoqda'))+'</small></div>';
  try{
    if(mediaRoomClient)await mediaRoomClient.close().catch(()=>{});
    mediaRoomClient=new window.MasofaviyMediaClientBundle.MediaRoomClient({
      socket,joinPayload:join,mount,user,lowEnd:lowEndUI,
      onState:state=>{
        if(state.mic!==undefined){micOn=Boolean(state.mic);const b=$('#callMic');b?.classList.toggle('active-control',micOn);b?.classList.toggle('is-off',!micOn);b?.setAttribute('aria-pressed',micOn?'true':'false');b?.setAttribute('title',micOn?'Mikrofon ON — o‘chirish':'Mikrofon OFF — yoqish')}
        if(state.micBusy!==undefined){const b=$('#callMic');if(b){b.disabled=Boolean(state.micBusy);b.classList.toggle('is-busy',Boolean(state.micBusy));b.setAttribute('aria-busy',state.micBusy?'true':'false')}}
        if(state.camera!==undefined){cameraOn=Boolean(state.camera);const b=$('#callCamera');b?.classList.toggle('active-control',cameraOn);b?.classList.toggle('is-off',!cameraOn);b?.setAttribute('aria-pressed',cameraOn?'true':'false');b?.setAttribute('title',user.role==='student'?(cameraOn?'Broadcast kamera ON — boshqalarga ko‘rinadi. Proktor kamera lokal alohida ishlaydi':'Broadcast kamera OFF — boshqalarga ko‘rinmaydi. Proktor kamera lokal ishlashda davom etadi'):(cameraOn?'Kamera ON — o‘chirish':'Kamera OFF — yoqish'))}
        if(state.cameraBusy!==undefined){const b=$('#callCamera');if(b){b.disabled=Boolean(state.cameraBusy);b.classList.toggle('is-busy',Boolean(state.cameraBusy));b.setAttribute('aria-busy',state.cameraBusy?'true':'false')}}
        if(state.screen!==undefined){const b=$('#callScreen');b?.classList.toggle('active-control',Boolean(state.screen));b?.setAttribute('aria-pressed',state.screen?'true':'false')}
        if(state.echoGuard!==undefined)$('#echoGuard')?.classList.toggle('active-control',state.echoGuard);
        if(state.audioBlocked)toast('Ovoz bloklangan bo‘lsa, sahifaga bir marta bosing');
        if(state.videoQuality&&$('#videoQuality'))$('#videoQuality').value=state.videoQuality;
        if(state.participants){const n=Array.isArray(state.participants)?state.participants.length:Number(state.participants||0);if($('#participantCountBadge'))$('#participantCountBadge').textContent=String(n)}
        if(state.viewMode)$('#callViewMode')?.classList.toggle('active-control',state.viewMode==='gallery');
        if(state.lowBandwidth!==undefined)$('#callLowBandwidth')?.classList.toggle('active-control',Boolean(state.lowBandwidth));
        if(state.transport){const bad=['failed','disconnected'].includes(state.state);$('#connectionBanner')?.classList.toggle('hidden',!bad);if(bad)autoRejoinLesson();}
      },
      onError:e=>toast(e.message||String(e))
    });
    await mediaRoomClient.connect();
    if($('#videoQuality'))$('#videoQuality').value=ultraLiteUI?'240':(localStorage.getItem('m2-video-quality')||(lowEndUI?'240':'auto'));
    $('#echoGuard')?.classList.toggle('active-control',localStorage.getItem('m2-echo-guard')!=='0');
    if(socket?.connected)socket.emit('lesson:join',{lessonId:activeLessonId});
    studentCameraGranted=true;studentMicGranted=true;
    if(user.role==='student'){
      const proctorOk=await startLiveLessonProctoring();
      if(!proctorOk)toast('Kamera nazorati faol emas — davomatda yuz-faollik vaqti hisoblanmaydi');
    }
    showLessonSide('participants',false);setLessonDrawer(false);await loadLessonParticipants();
    toast('Mediasoup jonli darsga ulandingiz');
  }catch(e){
    mount.innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Media serverga ulanib bo‘lmadi</b><small>'+esc(e.message)+'</small><button id="retryMediaRoom" class="primary">Qayta ulanish</button></div>';
    $('#retryMediaRoom')?.addEventListener('click',()=>openConference(payload));
  }
  hydrateIcons($('#lesson'));
}
async function leaveConference(back=true){
  await liveProctorStop?.();liveProctorStop=()=>{};liveProctorStates.clear();
  stopCaptions(true);clearInterval(lessonTimer);clearInterval(networkTimer);lessonTimer=null;networkTimer=null;if(autoRejoinTimer){clearTimeout(autoRejoinTimer);autoRejoinTimer=null}
  if(activeLessonId&&socket?.connected)socket.emit('lesson:leave',{lessonId:activeLessonId});
  if(mediaRoomClient){try{await mediaRoomClient.close()}catch{}mediaRoomClient=null}
  activeLessonId='';activeLiveSession=null;raisedHands.clear();raisedHandUsers.clear();updateRaisedHandAlert();cameraOn=false;micOn=false;studentCameraGranted=false;studentMicGranted=false;setLessonDrawer(false);$('#videoMount').innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Video xona yopildi</b><small>Guruh darslari sahifasidan boshqa xonani tanlang.</small></div>';if(back){go('live');loadLiveRooms()}
}
async function endLiveRoom(id,fromCall=true){
  if(!confirm('Jonli dars yakunlansinmi?'))return;
  try{await api('/live/rooms/'+id+'/end',{method:'POST',body:'{}'});if(fromCall)await leaveConference(true);else loadLiveRooms();toast('Jonli dars yakunlandi')}catch(e){toast(e.message)}
}
$('#refreshLiveRooms').onclick=loadLiveRooms;
$('#backToLive').onclick=()=>leaveConference(true);
$('#endLiveLesson').onclick=()=>activeLessonId&&endLiveRoom(activeLessonId,true);
async function saveManualAttendance(){
  if(!activeLessonId)return;
  const rows=all('#lessonParticipants [data-attendance-student]');
  const records=rows.map(row=>{
    const checked=row.querySelector('[data-attendance-check]')?.checked;
    const special=row.querySelector('[data-attendance-status]')?.value||'';
    return {studentId:row.dataset.attendanceStudent,status:special|| (checked?'present':'absent')};
  });
  if(!records.length)return toast('Guruhda talaba topilmadi');
  try{
    const out=await api('/live/rooms/'+activeLessonId+'/attendance',{method:'POST',body:JSON.stringify({records})});
    toast('Davomat saqlandi · '+out.saved+' talaba');
    await loadLessonParticipants();
  }catch(e){toast(e.message)}
}
async function loadLessonParticipants(){
  if(!activeLessonId)return;
  try{
    const x=await api('/live/rooms/'+activeLessonId+'/participants'),rows=x.students||[],label={present:'Vaqtida',late:'Kechikkan',absent:'Yo‘q',excused:'Sababli',pending:'Kutilmoqda'};
    const editable=user.role==='teacher'||can('attendance.manage');
    const counts={total:rows.length,online:rows.filter(r=>r.online).length,present:rows.filter(r=>r.status==='present').length,late:rows.filter(r=>r.status==='late').length,absent:rows.filter(r=>r.status==='absent').length,face:rows.filter(r=>{const p=liveProctorStates.get(String(r._id))||r.proctor||{};return p.cameraReady&&p.faceState==='present'}).length,attentionLow:rows.filter(r=>{const p=liveProctorStates.get(String(r._id))||r.proctor||{};return Number(p.observedSeconds||0)>=30&&Number(p.attentionPercent||0)<60}).length};
    const summary='<div class="attendance-summary">'+
      '<span><b>'+counts.total+'</b><small>Jami</small></span>'+
      '<span><b>'+counts.online+'</b><small>Onlayn</small></span>'+
      '<span><b data-live-face-count>'+counts.face+'</b><small>Yuz faol</small></span>'+
      '<span><b data-live-attention-low>'+counts.attentionLow+'</b><small>E’tibor past</small></span>'+
      '<span><b>'+counts.late+'</b><small>Kechikkan</small></span>'+
      '<span><b>'+counts.absent+'</b><small>Yo‘q</small></span>'+
    '</div>';
    const toolbar=editable?'<div class="attendance-manual-toolbar"><div><b>Qo‘lda davomat</b><small>Avtomatik nazorat + o‘qituvchi tuzatishi</small></div><div><button class="ghost" id="attendanceMarkAll" type="button">Barchasini belgilash</button><button class="primary" id="attendanceSave" type="button">Davomatni saqlash</button></div></div>':'';
    $('#lessonParticipants').innerHTML=summary+toolbar+rows.map(r=>{
      const checked=['present','late'].includes(r.status)||r.online;
      const manual=Boolean(r.manualMarkedAt),liveP=liveProctorStates.get(String(r._id))||{},p={...(r.proctor||{}),...liveP},canInspect=(user.role==='teacher'||can('live.manage')||can('lessons.monitor'))&&r.online;
      const pState=p.faceState||'unknown',pReady=Boolean(p.cameraReady),pObserved=Number(p.observedSeconds||0),pPresent=Number(p.presentSeconds||0),pAttention=Number(p.attentionPercent||0);
      return '<div class="participant-row '+(r.online?'is-online':'')+'" data-attendance-student="'+esc(r._id)+'" data-focus-user="'+esc(r._id)+'" role="button" tabindex="0" title="Asosiy ekranga chiqarish">'+
        '<span class="participant-dot"></span>'+
        '<div class="participant-main">'+
          '<div class="participant-name"><b title="'+esc(r.fullName)+'">'+(raisedHands.has(String(r._id))?'✋ ':'')+esc(r.fullName)+'</b><small title="@'+esc(r.login)+'">@'+esc(r.login)+'</small></div>'+
          '<div class="participant-statusline"><span class="attendance-chip '+esc(r.status)+'">'+esc(label[r.status]||r.status)+'</span>'+(r.online?'<span class="online-chip">Onlayn</span>':'<span class="offline-chip">Oflayn</span>')+(manual?'<span class="manual-chip">Qo‘lda</span>':'')+'<span data-proctor-badge class="proctor-chip '+(pReady?'camera-on ':'camera-off ')+esc(pState)+'">'+(pReady?'● ':'○ ')+esc(proctorStateLabel(pState))+'</span></div>'+
          '<div class="participant-presence-meta"><span>⏱ '+esc(r.minutes||0)+' daq</span><span>◔ '+esc(r.presencePercent||0)+'%</span><span data-proctor-meta>Yuz '+esc(formatFocusTime(pPresent))+' / '+esc(formatFocusTime(pObserved))+' · '+esc(pAttention)+'%</span><span>⚠ '+esc(p.violations||0)+'</span></div>'+
        '</div>'+
        (canInspect?'<div class="participant-proctor-actions"><button class="mini-camera-watch" data-proctor-camera-user="'+esc(r._id)+'" title="Talaba kamerasini vaqtincha ko‘rish">👁 Kamera</button><button class="mini-spotlight" data-spotlight-user="'+esc(r._id)+'" title="Asosiy ekranga chiqarish">⭐</button></div>':'')+
        (editable?'<div class="participant-actions"><label class="attendance-check"><input type="checkbox" data-attendance-check '+(checked?'checked':'')+'><span>Qatnashdi</span></label><select data-attendance-status class="attendance-status" aria-label="Davomat holati"><option value="">Holat: oddiy</option><option value="late" '+(r.status==='late'?'selected':'')+'>Kechikdi</option><option value="excused" '+(r.status==='excused'?'selected':'')+'>Sababli</option></select></div>':'')+
        '</div>';
    }).join('')||'<div class="empty">Guruhda talaba topilmadi</div>';
    const m=x.session?.lastAttendanceCheckpointMinute||0;$('#attendanceCheckpointInfo').textContent=m?('Oxirgi avtomatik nazorat: '+m+'-daqiqa'):'Birinchi avtomatik davomat: 10-daqiqada';
    $('#attendanceMarkAll')?.addEventListener('click',()=>{all('#lessonParticipants [data-attendance-check]').forEach(x=>x.checked=true)});
    $('#attendanceSave')?.addEventListener('click',saveManualAttendance);
    const spotlightUser=id=>{if(!id)return;socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId:id});mediaRoomClient?.pinUser?.(String(id));toast('Asosiy ekranga chiqarildi')};
    const inspectUser=id=>{if(!id)return;if(user.role==='teacher'||can('live.manage')||can('lessons.monitor')){socket?.emit('lesson:proctor-camera-request',{lessonId:activeLessonId,userId:id});toast('Talaba kamerasi vaqtincha tekshiruv uchun ochilmoqda')}else spotlightUser(id)};
    all('[data-spotlight-user]').forEach(b=>b.onclick=e=>{e.stopPropagation();spotlightUser(b.dataset.spotlightUser)});
    all('[data-proctor-camera-user]').forEach(b=>b.onclick=e=>{e.stopPropagation();inspectUser(b.dataset.proctorCameraUser)});
    all('#lessonParticipants [data-focus-user]').forEach(row=>{
      row.onclick=e=>{if(e.target.closest('input,select,button,label'))return;inspectUser(row.dataset.focusUser)};
      row.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('input,select,button,label')){e.preventDefault();inspectUser(row.dataset.focusUser)}};
    });
  }catch(e){$('#lessonParticipants').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function setLessonDrawer(open){
  $('#lessonDrawer')?.classList.toggle('open',Boolean(open));
  $('#lessonDrawerBackdrop')?.classList.toggle('show',Boolean(open));
  document.documentElement.classList.toggle('lesson-drawer-open',Boolean(open));
}
function updateRaisedHandAlert(){
  const wrap=$('#raisedHandAlert'),text=$('#raisedHandAlertText');
  if(!wrap||!text)return;
  const items=[...raisedHandUsers.values()];
  const visible=(user?.role==='teacher'||can('live.manage'))&&items.length>0;
  wrap.classList.toggle('hidden',!visible);
  if(!visible)return;
  const first=items[0];
  text.textContent=items.length===1?first.fullName:(first.fullName+' + '+(items.length-1)+' ta');
}
function approveRaisedHand(){
  const first=[...raisedHandUsers.values()][0];
  if(!first||!activeLessonId)return;
  socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId:first.userId});
  toast(first.fullName+' asosiy ekranga chiqarildi');
}
$('#raisedHandOpen')?.addEventListener('click',()=>showLessonSide('participants'));
$('#raisedHandSpotlight')?.addEventListener('click',approveRaisedHand);
function showLessonSide(which,openDrawer=true){
  const p=which!=='chat';if(!p){chatUnread=0;$('#chatUnreadBadge')?.classList.add('hidden')}
  $('#participantsPanel')?.classList.toggle('hidden',!p);
  $('#lessonChatPanel')?.classList.toggle('hidden',p);
  $('#showParticipants')?.classList.toggle('active',p);
  $('#showLessonChat')?.classList.toggle('active',!p);
  if(openDrawer)setLessonDrawer(true);
}
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
const NUMBER_WORDS={
  'uz-UZ':{'nol':0,'bir':1,'ikki':2,'uch':3,"to'rt":4,'tort':4,'besh':5,'olti':6,'yetti':7,'sakkiz':8,"to'qqiz":9,'toqqiz':9,"o'n":10,'on':10,'yigirma':20,"o'ttiz":30,'ottiz':30,'qirq':40,'ellik':50,'oltmish':60,'yetmish':70,'sakson':80,"to'qson":90,'toqson':90,'yuz':100,'ming':1000},
  'ru-RU':{ноль:0,один:1,одна:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,одиннадцать:11,двенадцать:12,тринадцать:13,четырнадцать:14,пятнадцать:15,шестнадцать:16,семнадцать:17,восемнадцать:18,девятнадцать:19,двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90,сто:100,тысяча:1000,тысячи:1000,тысяч:1000},
  'en-US':{zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000}
};
function parseSpokenNumber(words,map){
  let total=0,current=0,used=0;
  for(const raw of words){
    const w=raw.toLowerCase().replace(/[.,!?;:]/g,'');
    if(!(w in map))break;
    const n=map[w];used++;
    if(n===100){current=Math.max(1,current)*100}
    else if(n===1000){total+=Math.max(1,current)*1000;current=0}
    else current+=n;
  }
  return used?{value:total+current,used}:null;
}
function replaceNumberWords(text,lang){
  const map=NUMBER_WORDS[lang]||NUMBER_WORDS['uz-UZ'],parts=String(text||'').split(/\s+/),out=[];
  for(let i=0;i<parts.length;){
    const parsed=parseSpokenNumber(parts.slice(i),map);
    if(parsed&&parsed.used){out.push(String(parsed.value));i+=parsed.used}else{out.push(parts[i]);i++}
  }
  return out.join(' ');
}
function normalizeMathCaption(text,lang){
  if(!captionMathEnabled)return text;
  let s=' '+String(text||'').toLowerCase().replace(/\s+/g,' ').trim()+' ';
  const rules=lang==='ru-RU'?[
    [/\bплюс\b/g,' + '],[/\bминус\b/g,' − '],[/\bумножить на\b|\bумножить\b|\bпомножить на\b/g,' × '],[/\bразделить на\b|\bделить на\b/g,' ÷ '],
    [/\bравно\b|\bравняется\b/g,' = '],[/\bпроцент(?:а|ов)?\b/g,' % '],[/\bкорень из\b/g,' √'],[/\bикс\b/g,' x'],[/\bигрек\b/g,' y'],
    [/\bв квадрате\b/g,'²'],[/\bв кубе\b/g,'³'],[/\bбольше либо равно\b/g,' ≥ '],[/\bменьше либо равно\b/g,' ≤ ']
  ]:lang==='en-US'?[
    [/\bplus\b/g,' + '],[/\bminus\b/g,' − '],[/\btimes\b|\bmultiplied by\b|\bmultiply by\b/g,' × '],[/\bdivided by\b|\bdivide by\b/g,' ÷ '],
    [/\bequals?\b|\bis equal to\b/g,' = '],[/\bpercent\b/g,' % '],[/\bsquare root of\b/g,' √'],[/\bx\b/g,' x'],[/\by\b/g,' y'],
    [/\bsquared\b/g,'²'],[/\bcubed\b/g,'³'],[/\bgreater than or equal to\b/g,' ≥ '],[/\bless than or equal to\b/g,' ≤ ']
  ]:[
    [/\bplus\b|\bqo'shuv\b|\bqoshish\b|\bqo'shilgan\b/g,' + '],[/\bminus\b|\bayiruv\b|\bayirilgan\b/g,' − '],
    [/\bko'paytir(?:uv|ish)?\b|\bkopaytir(?:uv|ish)?\b|\bkarra\b/g,' × '],[/\bbo'linadi\b|\bbo'lish\b|\bbolish\b|\btaqsim\b/g,' ÷ '],
    [/\bteng\b|\btengdir\b/g,' = '],[/\bfoiz\b/g,' % '],[/\bkvadrat ildiz\b|\bildiz ostida\b/g,' √'],[/\biks\b/g,' x'],[/\bigrek\b/g,' y'],
    [/\bkvadrat\b/g,'²'],[/\bkub\b/g,'³'],[/\bkatta yoki teng\b/g,' ≥ '],[/\bkichik yoki teng\b/g,' ≤ ']
  ];
  for(const [re,to] of rules)s=s.replace(re,to);
  s=replaceNumberWords(s,lang);
  s=s.replace(/\s+([%²³])/g,'$1').replace(/√\s+/g,'√').replace(/\s*([+−×÷=≥≤])\s*/g,' $1 ').replace(/\s+/g,' ').trim();
  return s;
}
function trimCaptionWords(text){return String(text||'').trim().split(/\s+/).filter(Boolean).slice(-10).join(' ')}
function showCaption(fullName,text){
  const box=$('#liveCaptions');if(!box)return;
  const clean=trimCaptionWords(normalizeMathCaption(text,$('#captionLang')?.value||'uz-UZ'));if(!clean)return;
  $('#captionSpeaker').textContent=(fullName||'')+(fullName?' · ':'');
  $('#captionText').textContent=clean;box.classList.remove('hidden');
  clearTimeout(captionClearTimer);captionClearTimer=setTimeout(()=>{box.classList.add('hidden');$('#captionText').textContent='';$('#captionSpeaker').textContent=''},5000);
}
function stopCaptions(silent=false){
  captionsEnabled=false;captionFinalWords=[];
  if(captionRecognition){try{captionRecognition.onend=null;captionRecognition.stop()}catch{}captionRecognition=null}
  $('#callCaptions')?.classList.remove('active-control');
  if(!silent)toast('Subtitr o‘chirildi');
}
function startCaptions(){
  if(!SpeechRecognition)return toast('Bu brauzer jonli subtitrni qo‘llamaydi. Android Chrome yoki Edge ishlating.');
  if(!activeLessonId)return toast('Avval darsga kiring');
  stopCaptions(true);captionsEnabled=true;captionFinalWords=[];
  const rec=new SpeechRecognition();captionRecognition=rec;rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;rec.lang=$('#captionLang')?.value||'uz-UZ';
  rec.onresult=e=>{
    let interim='',newFinal='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const t=(e.results[i][0]?.transcript||'').trim();
      if(!t)continue;
      if(e.results[i].isFinal)newFinal+=' '+t;else interim+=' '+t;
    }
    if(newFinal){
      captionFinalWords=[...captionFinalWords,...newFinal.trim().split(/\s+/).filter(Boolean)].slice(-10);
    }
    const liveWords=interim.trim().split(/\s+/).filter(Boolean);
    const rolling=trimCaptionWords([...captionFinalWords,...liveWords].join(' '));
    if(rolling){
      const normalized=normalizeMathCaption(rolling,rec.lang);
      showCaption(user.fullName,normalized);
      socket?.emit('lesson:caption',{lessonId:activeLessonId,text:normalized,lang:rec.lang,final:Boolean(newFinal)});
    }
  };
  rec.onerror=e=>{if(!['no-speech','aborted'].includes(e.error||''))toast('Subtitr: '+(e.error||'ovozni aniqlab bo‘lmadi'))};
  rec.onend=()=>{if(captionsEnabled&&activeLessonId)setTimeout(()=>{try{rec.start()}catch{}},250)};
  try{rec.start();$('#callCaptions')?.classList.add('active-control');showCaption('', 'Subtitr tinglamoqda…');toast('Jonli subtitr yoqildi')}catch{toast('Subtitrni ishga tushirib bo‘lmadi')}
}
$('#showParticipants')?.addEventListener('click',()=>showLessonSide('participants'));
$('#showLessonChat')?.addEventListener('click',()=>showLessonSide('chat'));
$('#callAttendance')?.addEventListener('click',()=>showLessonSide('participants'));
$('#closeLessonDrawer')?.addEventListener('click',()=>setLessonDrawer(false));
$('#lessonDrawerBackdrop')?.addEventListener('click',()=>setLessonDrawer(false));
$('#callMic').onclick=async()=>{
  if(!mediaRoomClient)return toast('Avval video xonaga kiring');
  try{await mediaRoomClient.toggleMic()}catch(e){toast(e.message)}
};
$('#callCamera').onclick=async()=>{
  if(!mediaRoomClient)return toast('Avval video xonaga kiring');
  try{await mediaRoomClient.toggleCamera()}catch(e){toast(e.message)}
};
$('#callScreen').onclick=async()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');try{await mediaRoomClient.toggleScreen()}catch(e){toast(e.message)}};
$('#videoQuality')?.addEventListener('change',async()=>{if(!mediaRoomClient)return;await mediaRoomClient.setReceiveQuality($('#videoQuality').value);toast('Video sifati: '+($('#videoQuality').value==='auto'?'Auto':$('#videoQuality').value+'p'))});
$('#echoGuard')?.addEventListener('click',()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');const enabled=!$('#echoGuard').classList.contains('active-control');mediaRoomClient.setEchoGuard(enabled);toast(enabled?'Echo himoya yoqildi':'Diqqat: echo himoya o‘chirildi. Yaqin qurilmalarda chiyillash xavfi oshadi.')});
$('#callChat').onclick=()=>showLessonSide('chat');
function applyInclusivePrefs(){
  document.documentElement.classList.toggle('inclusive-mode',accessibilityEnabled);
  document.documentElement.dataset.captionSize=String(captionSizeLevel);
  $('#accessibilityMode')?.classList.toggle('active-control',accessibilityEnabled);
  $('#captionMath')?.classList.toggle('active-control',captionMathEnabled);
  const btn=$('#captionSize');if(btn)btn.querySelector('span').textContent=['A','A+','A++'][captionSizeLevel]||'A';
}
$('#captionMath')?.addEventListener('click',()=>{captionMathEnabled=!captionMathEnabled;applyInclusivePrefs();toast(captionMathEnabled?'Matematik subtitr yoqildi':'Matematik subtitr o‘chirildi')});
$('#captionSize')?.addEventListener('click',()=>{captionSizeLevel=(captionSizeLevel+1)%3;localStorage.setItem('m2-caption-size',String(captionSizeLevel));applyInclusivePrefs()});
$('#accessibilityMode')?.addEventListener('click',()=>{accessibilityEnabled=!accessibilityEnabled;localStorage.setItem('m2-accessibility',accessibilityEnabled?'1':'0');applyInclusivePrefs();toast(accessibilityEnabled?'Inklyuziv qulaylik rejimi yoqildi':'Qulaylik rejimi o‘chirildi')});
applyInclusivePrefs();
$('#callCaptions')?.addEventListener('click',()=>captionsEnabled?stopCaptions():startCaptions());
$('#captionLang')?.addEventListener('change',()=>{if(captionsEnabled)startCaptions()});
$('#callPiP')?.addEventListener('click',async()=>{
  if(!mediaRoomClient)return toast('Avval darsga kiring');
  const r=await mediaRoomClient.togglePiP();
  if(r.reason==='camera-off')return toast('PiP uchun kamerani yoqing');
  $('#callPiP')?.classList.toggle('active-control',Boolean(r.active));
  toast(r.active?'PiP kamera yoqildi':'PiP kamera o‘chirildi');
});
$('#callFullscreen')?.addEventListener('click',async()=>{
  try{
    if(!mediaRoomClient)return toast('Avval darsga kiring');
    if(document.fullscreenElement||document.documentElement.classList.contains('video-cinema-fallback'))await mediaRoomClient.exitPrimaryFullscreen?.();
    else await mediaRoomClient.enterPrimaryFullscreen?.();
  }catch(e){toast(e.message||'To‘liq ekran ochilmadi')}
});
document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement){
    document.documentElement.classList.remove('video-cinema-fallback');
    mediaRoomClient?.clearFullscreenLayout?.();
    mediaRoomClient?.resetZoom?.();
    try{screen.orientation?.unlock?.()}catch{}
  }
});
$('#callZoomReset')?.addEventListener('click',()=>mediaRoomClient?.resetZoom?.());
$('#callHangup').onclick=()=>leaveConference(true);

function youtubeId(url){const m=String(url||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/);return m?.[1]||''}
function videoThumb(v){const id=youtubeId(v.sourceUrl);return v.thumbnailUrl||(id?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':'')}
function videoCard(v,recommended=false){
  const thumb=videoThumb(v),course=(v.courseYears||[]).map(x=>x+'-kurs').join(', '),groups=(v.groupIds||[]).map(g=>g.externalId||g.code||g.name).join(', '),mine=String(v.teacherId?._id||'')===String(user?._id||''),canDelete=can('videos.manage')||mine;
  return '<article class="video-card" data-video-id="'+esc(v._id)+'"><button class="video-cover" data-video-play="'+esc(v._id)+'">'+(thumb?'<img src="'+esc(thumb)+'" loading="lazy" alt="">':'<div class="video-no-thumb">'+icon('play','▶')+'</div>')+'<span class="play-badge">'+icon('play','▶')+'</span>'+(recommended?'<span class="recommend-badge">Tavsiya</span>':'')+'</button><div class="video-card-body"><div class="video-card-top"><span>'+esc(v.subject||'Videodars')+'</span><small>'+esc(v.durationMinutes?Math.round(v.durationMinutes)+' daq':'')+'</small></div><h2>'+esc(v.title)+'</h2><p>'+esc(v.description||'Mustaqil o‘rganish uchun videodars.')+'</p><div class="video-tags">'+(v.courseId?.title?'<span>'+esc(v.courseId.title)+'</span>':'')+(v.moduleTitle?'<span>'+esc(v.moduleTitle)+'</span>':'')+(course?'<span>'+esc(course)+'</span>':'')+(v.direction?'<span>'+esc(v.direction)+'</span>':'')+(groups?'<span>'+esc(groups)+'</span>':'')+'</div><div class="video-footer"><small>'+icon('user','◎')+' '+esc(v.teacherId?.fullName||'Ta’lim platformasi')+' · '+esc(v.views||0)+' ko‘rish · '+esc(v.commentCount||0)+' izoh</small><div>'+(canDelete?'<button class="ghost" data-video-structure="'+esc(v._id)+'" title="Fan/modul/mavzu bo‘yicha tartiblash">Tartiblash</button><button class="ghost danger-text" data-video-delete="'+esc(v._id)+'" title="Arxivlash">'+icon('trash','×')+'</button>':'')+'</div></div></div></article>';
}
function compactRelatedCard(v){
  const thumb=videoThumb(v);
  return '<button class="related-card" data-video-play="'+esc(v._id)+'">'+(thumb?'<img src="'+esc(thumb)+'" loading="lazy" alt="">':'<div class="related-no-thumb">'+icon('play','▶')+'</div>')+'<span><b>'+esc(v.title)+'</b><small>'+esc(v.teacherId?.fullName||'Ta’lim platformasi')+'</small><small>'+esc(v.views||0)+' ko‘rish · '+esc(v.likes||0)+' yoqdi</small></span></button>';
}
function renderVideoLearningPaths(rows){
  const groups=new Map();
  for(const v of rows){
    const courseKey=String(v.courseId?._id||v.courseId||('subject:'+String(v.subject||'Boshqa'))),courseTitle=v.courseId?.title||v.subject||'Mustaqil videodarslar';
    if(!groups.has(courseKey))groups.set(courseKey,{title:courseTitle,code:v.courseId?.code||'',modules:new Map()});
    const course=groups.get(courseKey),module=String(v.moduleTitle||'Asosiy modul');
    if(!course.modules.has(module))course.modules.set(module,[]);
    course.modules.get(module).push(v);
  }
  if(!groups.size)return '<div class="empty"><b>Videodars topilmadi</b><p>O‘qituvchi yoki administrator videodars qo‘shishi mumkin.</p></div>';
  return [...groups.values()].map(course=>{
    const modules=[...course.modules.entries()].map(([name,items])=>{
      items.sort((a,b)=>(Number(a.sequence)||0)-(Number(b.sequence)||0)||new Date(a.createdAt)-new Date(b.createdAt));
      return '<div class="learning-module"><div class="learning-module-head"><b>'+esc(name)+'</b><small>'+esc(items.length)+' mavzu</small></div><div class="learning-topic-list">'+items.map((v,i)=>{
        const quiz=v.checkpointQuizId,progress=v.progress||{},unlocked=Boolean(progress.completed),pct=progress.completed?100:(progress.durationSeconds?Math.min(99,Math.round((Number(progress.lastPositionSeconds||0)/Math.max(1,Number(progress.durationSeconds)))*100)):0);
        return '<article class="learning-topic"><div class="learning-topic-order">'+esc(v.sequence||i+1)+'</div><div class="learning-topic-main"><small>'+esc(v.topicTitle||v.title)+'</small><h3>'+esc(v.title)+'</h3><p>'+esc(v.description||'')+'</p><div class="video-tags">'+(v.durationMinutes?'<span>'+esc(Math.round(v.durationMinutes))+' daq</span>':'')+(quiz?'<span class="topic-quiz-badge">Test: '+esc(quiz.title)+'</span>':'')+'<span>'+esc(pct)+'% ko‘rildi</span></div><div class="topic-progress"><i style="width:'+esc(pct)+'%"></i></div></div><div class="learning-topic-actions"><button class="primary" data-video-play="'+esc(v._id)+'">▶ '+(progress.lastPositionSeconds>5&&!progress.completed?'Davom ettirish':'Ko‘rish')+'</button>'+(quiz?'<button data-video-checkpoint="'+esc(quiz._id)+'" data-video-id="'+esc(v._id)+'" data-proctor="'+(quiz.proctorRequired?'1':'0')+'" '+(unlocked?'':'disabled title="Video 90% tugagach ochiladi"')+'>'+(unlocked?'Test':'🔒 Video tugagach')+'</button>':'')+'</div></article>'
      }).join('')+'</div></div>';
    }).join('');
    return '<section class="video-course-path"><div class="video-course-path-head"><div><small>'+esc(course.code||'Kurs')+'</small><h2>'+esc(course.title)+'</h2></div><span>'+esc([...course.modules.values()].reduce((n,x)=>n+x.length,0))+' videomavzu</span></div>'+modules+'</section>';
  }).join('');
}
async function loadVideoLessons(){
  try{
    videoLessonsCache=await api('/videos');
    const q=String($('#videoSearch')?.value||'').toLowerCase().trim(),course=Number($('#videoCourseFilter')?.value||0),direction=String($('#videoDirectionFilter')?.value||'').toLowerCase().trim();
    const rows=videoLessonsCache.filter(v=>(!q||[v.title,v.subject,v.description,...(v.tags||[])].join(' ').toLowerCase().includes(q))&&(!course||(v.courseYears||[]).includes(course))&&(!direction||String(v.direction||'').toLowerCase().includes(direction)));
    const rec=rows.filter(v=>v.recommendationScore>0).slice(0,10);
    $('#recommendedVideos').innerHTML=(rec.length?rec:rows.slice(0,10)).map(v=>videoCard(v,true)).join('')||'<div class="empty"><b>Tavsiya topilmadi</b><p>Kurs yoki yo‘nalish filtrlari bilan qidiring.</p></div>';
    $('#videoLessons').innerHTML=renderVideoLearningPaths(rows);
    bindVideoActions();all('[data-video-checkpoint]').forEach(b=>b.onclick=()=>{if(b.disabled)return;startCourseQuiz(b.dataset.videoCheckpoint,b.dataset.proctor==='1',b.dataset.videoId||'')});hydrateIcons($('#videos'));
  }catch(e){$('#videoLessons').innerHTML='<div class="empty"><b>Videodarslarni yuklab bo‘lmadi</b><p>'+esc(e.message)+'</p></div>'}
}
function bindVideoActions(root=document){
  root.querySelectorAll?.('[data-video-play]').forEach(b=>b.onclick=()=>openVideoLesson(b.dataset.videoPlay));
  root.querySelectorAll?.('[data-video-structure]').forEach(b=>b.onclick=e=>{e.stopPropagation();editVideoLessonStructure(b.dataset.videoStructure)});
  root.querySelectorAll?.('[data-video-delete]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteVideoLesson(b.dataset.videoDelete)});
}
function loadYouTubePlayerApi(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(youtubeApiPromise)return youtubeApiPromise;
  youtubeApiPromise=new Promise((resolve,reject)=>{
    const prev=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{try{prev?.()}catch{};resolve(window.YT)};
    if(!document.querySelector('script[data-m2-yt-api]')){
      const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.dataset.m2YtApi='1';s.onerror=()=>reject(new Error('YouTube player API yuklanmadi'));document.head.appendChild(s);
    }
    setTimeout(()=>{if(!window.YT?.Player)reject(new Error('YouTube player javob bermadi'))},12000);
  });
  return youtubeApiPromise;
}
function stopWatchTracking(save=true){
  if(watchProgressTimer){clearInterval(watchProgressTimer);watchProgressTimer=null}
  if(save)saveCurrentVideoProgress(false).catch(()=>{});
  try{if(activeWatchKind==='youtube')activeWatchPlayer?.destroy?.();else if(activeWatchKind==='mp4')activeWatchPlayer?.pause?.()}catch{}
  activeWatchPlayer=null;activeWatchKind='';
}
function updateVideoProgressUi(v,progress){
  if(!v)return;v.progress={...(v.progress||{}),...(progress||{})};
  const p=v.progress||{},pct=p.completed?100:(p.durationSeconds?Math.min(99,Math.round((Number(p.lastPositionSeconds||0)/Math.max(1,Number(p.durationSeconds)))*100)):0);
  const label=$('#watchProgressLabel'),bar=$('#watchProgressBar');if(label)label.textContent=(p.completed?'Video tugallandi · test ochildi':pct+'% ko‘rildi');if(bar)bar.style.width=pct+'%';
  const btn=$('#watchCheckpointQuiz');if(btn){btn.disabled=!p.completed;btn.textContent=p.completed?'Testni boshlash':'🔒 Video tugagach ochiladi'}
}
async function persistVideoProgress(videoId,position,duration,completed=false){
  if(!videoId)return null;
  const x=await api('/videos/'+videoId+'/view',{method:'POST',body:JSON.stringify({positionSeconds:Math.max(0,Number(position)||0),watchedSeconds:Math.max(0,Number(position)||0),durationSeconds:Math.max(0,Number(duration)||0),completed:Boolean(completed)})});
  const v=videoLessonsCache.find(a=>String(a._id)===String(videoId));if(v&&x.progress)updateVideoProgressUi(v,x.progress);
  watchLastSavedAt=Date.now();return x.progress;
}
async function saveCurrentVideoProgress(forceCompleted=false){
  if(!activeVideoId||!activeWatchPlayer)return;
  let position=0,duration=0;
  try{
    if(activeWatchKind==='youtube'){position=Number(activeWatchPlayer.getCurrentTime?.()||0);duration=Number(activeWatchPlayer.getDuration?.()||0)}
    else if(activeWatchKind==='mp4'){position=Number(activeWatchPlayer.currentTime||0);duration=Number(activeWatchPlayer.duration||0)}
  }catch{return}
  const completed=forceCompleted||(duration>0&&position>=duration*.9);
  if(!completed&&Date.now()-watchLastSavedAt<3500)return;
  await persistVideoProgress(activeVideoId,position,duration,completed);
}
async function renderWatchPlayer(v){
  stopWatchTracking(false);
  const player=$('#watchPlayer'),yt=youtubeId(v.sourceUrl),resume=Math.max(0,Number(v.progress?.lastPositionSeconds||v.progress?.watchedSeconds||0));
  player.innerHTML='<div class="watch-loading">Video yuklanmoqda…</div>';
  if(yt){
    try{
      const YT=await loadYouTubePlayerApi();player.innerHTML='<div id="watchYoutubePlayer"></div>';
      activeWatchKind='youtube';
      activeWatchPlayer=new YT.Player('watchYoutubePlayer',{videoId:yt,playerVars:{autoplay:1,rel:0,playsinline:1,modestbranding:1,start:Math.floor(resume)},events:{
        onReady:e=>{try{if(resume>3)e.target.seekTo(resume,true);e.target.playVideo()}catch{};watchProgressTimer=setInterval(()=>saveCurrentVideoProgress(false).catch(()=>{}),5000)},
        onStateChange:e=>{if(e.data===YT.PlayerState.ENDED)saveCurrentVideoProgress(true).catch(()=>{});else if(e.data===YT.PlayerState.PAUSED)saveCurrentVideoProgress(false).catch(()=>{})},
        onError:()=>{const fallback='https://www.youtube.com/embed/'+encodeURIComponent(yt)+'?autoplay=1&rel=0&playsinline=1&start='+Math.max(0,Math.floor(resume));player.innerHTML='<iframe src="'+esc(fallback)+'" title="'+esc(v.title)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="video-progress-note">YouTube API xatosi · fallback player</div>'}
      }});
    }catch(e){
      const fallback='https://www.youtube.com/embed/'+encodeURIComponent(yt)+'?autoplay=1&rel=0&playsinline=1&start='+Math.max(0,Math.floor(resume));
      player.innerHTML='<iframe src="'+esc(fallback)+'" title="'+esc(v.title)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="video-progress-note">Progress kuzatuvi vaqtincha cheklangan · fallback player</div>';
    }
  }else if(v.sourceType==='mp4'){
    player.innerHTML='<video controls autoplay playsinline preload="metadata" src="'+esc(v.sourceUrl)+'"></video>';
    const video=player.querySelector('video');activeWatchKind='mp4';activeWatchPlayer=video;
    video.addEventListener('loadedmetadata',()=>{if(resume>3&&resume<video.duration-2)video.currentTime=resume;video.play().catch(()=>{})},{once:true});
    video.addEventListener('timeupdate',()=>{if(Date.now()-watchLastSavedAt>4500)saveCurrentVideoProgress(false).catch(()=>{})});
    video.addEventListener('pause',()=>saveCurrentVideoProgress(false).catch(()=>{}));
    video.addEventListener('ended',()=>saveCurrentVideoProgress(true).catch(()=>{}));
  }else{
    player.innerHTML='<iframe src="'+esc(v.sourceUrl)+'" title="'+esc(v.title)+'" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="no-referrer" allow="fullscreen; picture-in-picture" allowfullscreen></iframe><div class="video-progress-note">Bu tashqi player progressni avtomatik bera olmaydi.</div>';
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
  const p=v.progress||{},pp=p.completed?100:(p.durationSeconds?Math.min(99,Math.round((Number(p.lastPositionSeconds||0)/Math.max(1,Number(p.durationSeconds)))*100)):0);
  $('#watchDescription').innerHTML='<div class="watch-description-meta">'+[v.courseId?.title,v.moduleTitle,v.topicTitle,...tags].filter(Boolean).map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><p>'+esc(v.description||'Videodars uchun tavsif kiritilmagan.')+'</p><div class="watch-progress-card"><div><b id="watchProgressLabel">'+(p.completed?'Video tugallandi · test ochildi':esc(pp)+'% ko‘rildi')+'</b><small>Chiqib qaytsangiz ayni joyidan davom etadi</small></div><div class="watch-progress-track"><i id="watchProgressBar" style="width:'+esc(pp)+'%"></i></div></div>'+(v.checkpointQuizId?'<div class="video-checkpoint-box"><div><b>Mavzu nazorati</b><small>'+esc(v.checkpointQuizId.title)+' · '+esc(v.checkpointQuizId.durationMinutes||30)+' daqiqa'+(v.checkpointQuizId.proctorRequired?' · kamera nazorati':'')+'</small></div><button class="primary" id="watchCheckpointQuiz" '+(p.completed?'':'disabled')+'>'+(p.completed?'Testni boshlash':'🔒 Video tugagach ochiladi')+'</button></div>':'');
  await renderWatchPlayer(v);
  $('#watchCheckpointQuiz')?.addEventListener('click',()=>{if($('#watchCheckpointQuiz').disabled)return;startCourseQuiz(v.checkpointQuizId._id,v.checkpointQuizId.proctorRequired,activeVideoId)});
  const related=videoLessonsCache.filter(x=>String(x._id)!==activeVideoId).sort((a,b)=>(b.recommendationScore||0)-(a.recommendationScore||0)).slice(0,30);
  $('#watchRelated').innerHTML=related.map(compactRelatedCard).join('')||'<p class="muted">Boshqa videodars yo‘q.</p>';
  bindVideoActions($('#watchRelated'));hydrateIcons($('#videoWatch'));
  await loadVideoComments(activeVideoId);
}
function clearWatchPage(){
  stopWatchTracking(true);activeVideoId='';commentReplyTo=null;$('#watchPlayer').innerHTML='';$('#commentsList').innerHTML='';$('#commentReplyState').classList.add('hidden');
}
$('#backToVideos').onclick=()=>{clearWatchPage();history.pushState({},'',location.pathname+location.search);go('videos');loadVideoLessons()};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&activeVideoId)saveCurrentVideoProgress(false).catch(()=>{})});window.addEventListener('pagehide',()=>{if(activeVideoId)saveCurrentVideoProgress(false).catch(()=>{})});
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
async function editVideoLessonStructure(id){
  try{
    const v=videoLessonsCache.find(x=>String(x._id)===String(id));if(!v)throw Error('Videodars topilmadi');
    const courses=await api('/lms/courses'),details=await Promise.all(courses.slice(0,80).map(x=>api('/lms/courses/'+x._id).catch(()=>null)));
    const quizOptions=details.flatMap((d,i)=>(d?.quizzes||[]).map(q=>({id:q._id,courseId:courses[i]?._id,label:(courses[i]?.title||'Fan')+' · '+q.title})));
    modal('Videodarsni kurs bo‘yicha tartiblash','<label>Fan<select name="courseId"><option value="">Umumiy videodars</option>'+courses.map(x=>'<option value="'+esc(x._id)+'" '+(String(v.courseId?._id||v.courseId||'')===String(x._id)?'selected':'')+'>'+esc(x.code)+' · '+esc(x.title)+'</option>').join('')+'</select></label><label>Modul<input name="moduleTitle" value="'+esc(v.moduleTitle||'Asosiy modul')+'" required></label><label>Mavzu<input name="topicTitle" value="'+esc(v.topicTitle||v.title)+'" required></label><label>Ketma-ketlik<input name="sequence" type="number" min="0" value="'+esc(v.sequence||1)+'"></label><label>Mavzu testi<select name="checkpointQuizId"><option value="">Test biriktirilmagan</option>'+quizOptions.map(q=>'<option value="'+esc(q.id)+'" '+(String(v.checkpointQuizId?._id||v.checkpointQuizId||'')===String(q.id)?'selected':'')+'>'+esc(q.label)+'</option>').join('')+'</select></label><label>Fan nomi/teg<input name="subject" value="'+esc(v.subject||'')+'"></label>',async d=>{await api('/videos/'+id,{method:'PATCH',body:JSON.stringify(d)});await loadVideoLessons()})
  }catch(e){toast(e.message)}
}
async function deleteVideoLesson(id){if(!confirm('Videodars arxivga olinsinmi?'))return;try{await api('/videos/'+id,{method:'DELETE'});toast('Videodars arxivga olindi');if(activeVideoId===String(id)){clearWatchPage();go('videos')}loadVideoLessons()}catch(e){toast(e.message)}}
$('#applyVideoFilter').onclick=loadVideoLessons;$('#videoSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadVideoLessons()});
$('#addVideoLesson').onclick=async()=>{
  try{
    const courses=await api('/lms/courses').catch(()=>[]),details=await Promise.all(courses.slice(0,80).map(x=>api('/lms/courses/'+x._id).catch(()=>null)));
    const quizOptions=details.flatMap((d,i)=>(d?.quizzes||[]).map(q=>({id:q._id,label:(courses[i]?.title||'Fan')+' · '+q.title})));
    modal('Videodars qo‘shish','<label>Nomi<input name="title" required></label><label>Video havolasi<input name="sourceUrl" type="url" required placeholder="YouTube yoki MP4 URL"></label><label>LMS fan<select name="courseId"><option value="">Umumiy videodars</option>'+courses.map(x=>'<option value="'+esc(x._id)+'">'+esc(x.code)+' · '+esc(x.title)+'</option>').join('')+'</select></label><label>Modul<input name="moduleTitle" value="Asosiy modul" placeholder="1-modul. Kirish"></label><label>Mavzu<input name="topicTitle" required placeholder="1-mavzu. ..."></label><label>Ketma-ketlik<input name="sequence" type="number" min="0" value="1"></label><label>Mavzudan keyingi test<select name="checkpointQuizId"><option value="">Test biriktirilmagan</option>'+quizOptions.map(q=>'<option value="'+esc(q.id)+'">'+esc(q.label)+'</option>').join('')+'</select></label><label>Fan nomi / teg<input name="subject"></label><label>Guruh ID lar<input name="groupIds" placeholder="ATT-101, ATT-102"></label><label>Kurslar<input name="courseYears" placeholder="1,2"></label><label>Yo‘nalish<input name="direction" placeholder="Dasturiy injiniring"></label><label>Teglar<input name="tags" placeholder="algoritm, amaliyot, nazariya"></label><label>Muqova URL<input name="thumbnailUrl" type="url"></label><label>Davomiyligi (daq)<input name="durationMinutes" type="number" min="0"></label><label>Tavsif<textarea name="description" rows="4"></textarea></label>',async d=>{await api('/videos',{method:'POST',body:JSON.stringify(d)});loadVideoLessons()})
  }catch(e){toast(e.message)}
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
async function loadReports(){if(!can('reports.view'))return;try{const days=$('#reportDays')?.value||14;const q=encodeURIComponent($('#auditSearch')?.value||'');const jobs=[api('/reports/attendance?days='+days),api('/audit?limit=300&q='+q),can('lessons.monitor')?api('/analytics/online').catch(function(){return []}):Promise.resolve([])];const out=await Promise.all(jobs),attendance=out[0],auditRows=out[1],online=out[2];if(['admin','superadmin'].includes(user.role))loadMonitoringReadiness().catch(e=>toast(e.message));reportAttendanceCache=attendance;$('#attendanceList').innerHTML='<table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Dars</th><th>Holat</th><th>Daqiqa</th><th></th></tr></thead><tbody>'+attendance.map(function(x){const labels={present:'Qatnashdi',late:'Kechikdi',absent:'Qatnashmadi',excused:'Sababli'},cls=x.status==='late'?'warn':x.status==='absent'?'blocked':'ok',action=can('attendance.manage')?'<button class="ghost" data-attendance-edit="'+esc(x._id)+'">Tuzatish</button>':'';return '<tr><td>'+(x.joinedAt?new Date(x.joinedAt).toLocaleString('uz-UZ'):'—')+'</td><td>'+esc(x.userId?.fullName||'—')+'<small class="cell-sub">@'+esc(x.userId?.login||'—')+'</small></td><td>'+esc(x.schedule?.title||x.lessonId||'—')+'<small class="cell-sub">'+esc(x.schedule?.groupId?.name||'')+'</small></td><td><span class="status '+cls+'">'+esc(labels[x.status]||x.status)+'</span></td><td>'+esc(x.minutes||0)+'</td><td>'+action+'</td></tr>'}).join('')+'</tbody></table>';all('[data-attendance-edit]').forEach(function(b){b.onclick=function(){editAttendance(b.dataset.attendanceEdit)}});$('#auditList').innerHTML=auditRows.map(function(x){return '<div><b>'+esc(x.action)+' · '+esc(x.entity)+'</b><span>'+esc(x.actorName||x.actorLogin||'Tizim')+'</span><br><small>'+new Date(x.createdAt).toLocaleString('uz-UZ')+' · '+esc(x.ip||'')+'</small></div>'}).join('')||'<p>Harakatlar tarixi bo‘sh.</p>';if(can('lessons.monitor'))$('#onlineUsers').innerHTML=online.map(function(x){return '<div><span class="online-dot"></span><div><b>'+esc(x.fullName)+'</b><small>@'+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</small></div><strong>'+esc(x.connections||1)+'</strong></div>'}).join('')||'<p class="muted">Hozir faol ulanish yo‘q.</p>'}catch(e){toast(e.message)}}
async function loadMonitoringReadiness(){
  const x=await api('/lms/monitoring/readiness'),labels={ministry:'Vazirlik monitoring tizimi',quality:'Ta’lim sifati yagona bazasi'};
  $('#monitoringReadiness').innerHTML='<p><b>OTM kodi:</b> '+esc(x.institutionCode||'kiritilmagan')+'</p>'+x.providers.map(p=>{const failed=Object.entries(p.checks||{}).filter(([,v])=>!v).map(([k])=>k);return '<div class="lesson-row"><div><b>'+esc(labels[p.provider]||p.label||p.provider)+'</b><small>'+(p.ready?'Rasmiy yuborishga tayyor':'Readiness to‘liq emas')+' · external ID kam: '+esc(p.mapping?.missingUserExternalIds||0)+' user / '+esc(p.mapping?.missingStructureExternalIds||0)+' tuzilma</small>'+(failed.length?'<p>Yetishmaydi: '+failed.map(esc).join(', ')+'</p>':'')+(p.urlError?'<p>'+esc(p.urlError)+'</p>':'')+'</div><div><button data-monitoring-export="'+esc(p.provider)+'">JSON eksport</button>'+(p.ready?'<button class="primary" data-monitoring-sync="'+esc(p.provider)+'">Rasmiy sync</button>':'')+'</div></div>'}).join('')+'<h3>So‘nggi qaydlar</h3>'+((x.latest||[]).slice(0,8).map(r=>'<p><b>'+esc(r.provider)+' · '+esc(r.status)+'</b> · '+new Date(r.createdAt).toLocaleString('uz-UZ')+(r.receiptReference?' · '+esc(r.receiptReference):'')+'</p>').join('')||'<p>Monitoring eksport qaydi yo‘q.</p>');
  all('[data-monitoring-export]').forEach(b=>b.onclick=async()=>{try{const out=await api('/lms/monitoring/'+b.dataset.monitoringExport+'/export',{method:'POST'});downloadText('monitoring-'+b.dataset.monitoringExport+'-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(out.payload,null,2));toast('Monitoring JSON tayyorlandi')}catch(e){toast(e.message)}});
  all('[data-monitoring-sync]').forEach(b=>b.onclick=async()=>{if(!confirm('Bu amal shaxsiy/akademik ma’lumotlarni universitet tasdiqlagan rasmiy API yoki gatewayga yuboradi. Rasmiy shartnoma va endpoint tasdiqlanganmi?'))return;try{const out=await api('/lms/monitoring/'+b.dataset.monitoringSync+'/sync',{method:'POST',body:JSON.stringify({confirmOfficialTransfer:true})});toast(out.status==='accepted'?'Gateway qabul qildi':'Gatewayga yetkazildi; rasmiy receipt kutiladi');await loadMonitoringReadiness()}catch(e){toast(e.message)}});
}
$('#refreshMonitoring')?.addEventListener('click',()=>loadMonitoringReadiness().catch(e=>toast(e.message)));

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

$('#callViewMode')?.addEventListener('click',()=>{if(!mediaRoomClient)return;const next=mediaRoomClient.viewMode==='gallery'?'speaker':'gallery';mediaRoomClient.setViewMode(next);toast(next==='gallery'?'Gallery view':'Speaker view')});
$('#callRaiseHand')?.addEventListener('click',()=>{if(!activeLessonId)return;handRaised=!handRaised;socket?.emit('lesson:raise-hand',{lessonId:activeLessonId,raised:handRaised});$('#callRaiseHand')?.classList.toggle('active-control',handRaised)});
$('#callReaction')?.addEventListener('click',()=>$('#reactionPopover')?.classList.toggle('hidden'));
$('#callMore')?.addEventListener('click',()=>{
  $('#liveMorePanel')?.classList.toggle('hidden');
  $('#callMore')?.classList.toggle('active-control',!$('#liveMorePanel')?.classList.contains('hidden'));
  $('#reactionPopover')?.classList.add('hidden');
  $('#devicePopover')?.classList.add('hidden');
});
document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('#liveMorePanel')&&!e.target.closest('#callMore')){$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control')}
});
all('[data-reaction]').forEach(b=>b.addEventListener('click',()=>{if(activeLessonId)socket?.emit('lesson:reaction',{lessonId:activeLessonId,reaction:b.dataset.reaction});$('#reactionPopover')?.classList.add('hidden')}));
$('#callDevices')?.addEventListener('click',async()=>{await loadDeviceChoices();$('#devicePopover')?.classList.toggle('hidden')});
$('#micDeviceSelect')?.addEventListener('change',e=>mediaRoomClient?.selectDevice('audio',e.target.value));
$('#cameraDeviceSelect')?.addEventListener('change',e=>mediaRoomClient?.selectDevice('video',e.target.value));
$('#callFlipCamera')?.addEventListener('click',async()=>{if(!mediaRoomClient)return;await mediaRoomClient.switchCamera();toast('Kamera almashtirildi')});
$('#callLowBandwidth')?.addEventListener('click',async()=>{if(!mediaRoomClient)return;await mediaRoomClient.setLowBandwidth(!mediaRoomClient.lowBandwidthMode)});
$('#callRejoin')?.addEventListener('click',()=>rejoinActiveLesson());
$('#muteAllStudents')?.addEventListener('click',()=>activeLessonId&&socket?.emit('lesson:mute-all',{lessonId:activeLessonId}));
$('#cameraOffAllStudents')?.addEventListener('click',()=>activeLessonId&&socket?.emit('lesson:camera-off-all',{lessonId:activeLessonId}));
$('#teacherSpotlightSelf')?.addEventListener('click',()=>activeLessonId&&socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId:String(user?._id||'')}));
function connectSocket(){
  if(socket)socket.disconnect();
  socket=io();
  socket.on('connect',function(){$('#onlineBadge').textContent='● Onlayn';$('#connectionBanner')?.classList.add('hidden');if(activeLessonId&&!mediaRoomClient&&lastLessonPayload)autoRejoinLesson()});
  socket.on('disconnect',function(){$('#onlineBadge').textContent='● Ulanish yo‘q';$('#connectionBanner')?.classList.remove('hidden');if(activeLessonId)autoRejoinLesson()});
  socket.on('presence:count',function(x){$('#onlineBadge').textContent='● '+(x.online||0)+' onlayn'});
  socket.on('lesson:error',function(x){toast(x.message||'Darsga kirib bo‘lmadi')});
  socket.on('lesson:presence',function(x){if(activeLessonId)loadLessonParticipants();if(x.userId===user?._id||x.fullName===user?.fullName)toast(x.status==='late'?'Darsga kirdingiz · kechikish qayd etildi':'Darsga kirdingiz · davomat qayd etildi')});
  socket.on('attendance:checkpoint',function(x){if(activeLessonId&&String(x.scheduleId)===String(activeLessonId)){loadLessonParticipants();toast('Avtomatik davomat: '+x.checkpointMinute+'-daqiqa')}});
  socket.on('attendance:manual-saved',function(x){if(activeLessonId&&String(x.scheduleId)===String(activeLessonId)){loadLessonParticipants();if(user.role!=='teacher')toast('Davomat o‘qituvchi tomonidan yangilandi')}});
  socket.on('mic:permission-request',function(x){
    if(!activeLessonId||user.role!=='teacher')return;
    const approved=confirm((x.fullName||'Talaba')+' gapirishga ruxsat so‘radi. Ruxsat berasizmi?');
    socket.emit('mic:permission-response',{lessonId:activeLessonId,userId:x.userId,approved});
  });
  socket.on('mic:permission-result',async function(x){
    if(!activeLessonId||user.role!=='student')return;
    studentMicGranted=Boolean(x.approved);
    if(!x.approved)return toast('O‘qituvchi gapirish ruxsatini bermadi');
    if(confirm((x.teacherName||'O‘qituvchi')+' gapirishga ruxsat berdi. Mikrofonni yoqasizmi?')){
      try{await mediaRoomClient?.toggleMic()}catch(e){toast(e.message)}
    }
  });
  socket.on('mic:enable-request',async function(x){
    if(!activeLessonId||user.role!=='student')return;
    const accepted=confirm((x.teacherName||'O‘qituvchi')+' sizga gapirishni taklif qildi. Mikrofonni yoqasizmi?');
    if(accepted){
      studentMicGranted=true;
      try{await mediaRoomClient?.toggleMic()}catch(e){toast(e.message)}
    }
    socket.emit('mic:enable-result',{lessonId:activeLessonId,accepted});
  });
  socket.on('mic:student-result',function(x){if(activeLessonId&&user.role==='teacher')toast((x.fullName||'Talaba')+(x.accepted?' mikrofonni yoqdi':' gapirish so‘rovini rad etdi'))});
  socket.on('camera:enable-request',async function(x){
    if(!activeLessonId||user.role!=='student')return;
    const accepted=confirm((x.teacherName||'O‘qituvchi')+' kamerani yoqishni so‘radi. Kamerani yoqasizmi?');
    if(accepted){
      studentCameraGranted=true;
      try{await mediaRoomClient?.toggleCamera()}catch(e){toast(e.message)}
    }
    socket.emit('camera:enable-result',{lessonId:activeLessonId,accepted});
  });
  socket.on('camera:student-result',function(x){if(activeLessonId&&user.role==='teacher')toast((x.fullName||'Talaba')+(x.accepted?' kamerani yoqdi':' kamera so‘rovini rad etdi'))});
  socket.on('lesson:proctor-state',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
    if(user.role==='teacher'||can('live.manage')||can('lessons.monitor')){updateParticipantProctorIndicator(x);refreshLiveProctorSummary()}
  });
  socket.on('lesson:proctor-camera-request',async function(x){
    if(!activeLessonId||user.role!=='student'||String(x.lessonId)!==String(activeLessonId))return;
    toast((x.by||'O‘qituvchi')+' kamerangizni vaqtincha tekshirmoqda');
    let active=false;
    try{
      if(!liveProctorTrack?.readyState||liveProctorTrack.readyState!=='live')await startLiveLessonProctoring();
      if(liveProctorTrack?.readyState==='live'){await mediaRoomClient?.startCameraFromExternalTrack?.(liveProctorTrack);active=true}
    }catch(e){toast('Tekshiruv kamerasini uzatib bo‘lmadi: '+e.message)}
    socket.emit('lesson:proctor-camera-result',{lessonId:activeLessonId,active});
  });
  socket.on('lesson:proctor-camera-stop',async function(x){
    if(!activeLessonId||user.role!=='student'||String(x.lessonId)!==String(activeLessonId))return;
    await mediaRoomClient?.stopProctorCameraBroadcast?.().catch(()=>{});
    toast('Vaqtinchalik kamera tekshiruvi tugadi');
  });
  socket.on('lesson:proctor-camera-result',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId)||(user.role!=='teacher'&&!can('live.manage')&&!can('lessons.monitor')))return;
    if(x.active){socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId:x.userId});mediaRoomClient?.pinUser?.(String(x.userId));toast((x.fullName||'Talaba')+' kamerasi ochildi')}
    else toast((x.fullName||'Talaba')+' kamerasi ochilmadi');
  });
  socket.on('lesson:raise-hand',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
    const id=String(x.userId||'');
    if(x.raised){raisedHands.add(id);raisedHandUsers.set(id,{userId:id,fullName:x.fullName||x.login||'Talaba',login:x.login||''})}
    else{raisedHands.delete(id);raisedHandUsers.delete(id)}
    updateRaisedHandAlert();
    if(user.role==='teacher'||can('live.manage'))toast((x.fullName||'Talaba')+(x.raised?' qo‘l ko‘tardi ✋':' qo‘lini tushirdi'));
    loadLessonParticipants();
  });
  socket.on('lesson:reaction',function(x){if(activeLessonId&&String(x.lessonId)===String(activeLessonId))showReaction(x)});
  socket.on('lesson:spotlight',function(x){if(activeLessonId&&String(x.lessonId)===String(activeLessonId))mediaRoomClient?.pinUser(String(x.userId||''))});
  socket.on('lesson:force-mute',async function(x){if(activeLessonId){await mediaRoomClient?.muteSelfIfNeeded();toast((x.by||'O‘qituvchi')+' mikrofonni o‘chirdi')}});
  socket.on('lesson:force-camera-off',async function(x){if(activeLessonId){await mediaRoomClient?.cameraOffIfNeeded();toast((x.by||'O‘qituvchi')+' kamerani o‘chirdi')}});
  socket.on('live:changed',async function(x){if(x?.status==='ended'&&activeLessonId&&String(x.scheduleId)===String(activeLessonId)){toast('Dars vaqti tugadi · xona avtomatik yopildi');await leaveConference(true);return}if($('#live')?.classList.contains('active'))loadLiveRooms()});
  socket.on('lesson:auto-ended',async function(x){if(activeLessonId&&String(x?.scheduleId)===String(activeLessonId)){toast('Dars vaqti tugadi');await leaveConference(true)}});
  socket.on('lesson:started',async function(x){
    if(user?.role!=='student'||!x?.scheduleId)return;
    toast('Dars boshlandi: '+(x.title||'Jonli dars')+' · avtomatik ulanmoqda');
    try{
      if('Notification' in window&&Notification.permission==='granted'){
        new Notification('Dars boshlandi',{body:(x.title||'Jonli dars')+' · '+(x.teacherName||'O‘qituvchi')});
      }
    }catch{}
    if(activeLessonId===String(x.scheduleId))return;
    try{await enterLiveRoom(String(x.scheduleId))}catch{}
  });
  socket.on('lesson:chat',function(m){$('#messages').insertAdjacentHTML('beforeend','<p><b>'+esc(m.fullName)+'</b><br>'+esc(m.text)+'</p>');$('#messages').scrollTop=$('#messages').scrollHeight;if(!$('#lessonChatPanel')?.classList.contains('hidden'))return;chatUnread++;const b=$('#chatUnreadBadge');if(b){b.textContent=String(chatUnread);b.classList.remove('hidden')}});
  socket.on('lesson:caption',function(m){if(activeLessonId&&String(m.lessonId)===String(activeLessonId)&&String(m.userId)!==String(user?._id)){const current=$('#captionLang')?.value;const sel=$('#captionLang');if(sel&&m.lang)sel.dataset.remoteLang=m.lang;showCaption(m.fullName,normalizeMathCaption(m.text,m.lang||current||'uz-UZ'))}});
  $('#chatForm').onsubmit=function(e){e.preventDefault();if(!activeLessonId)return toast('Avval jadvaldan darsga kiring');const input=e.target.querySelector('input');socket.emit('lesson:chat',{lessonId:activeLessonId,text:input.value});input.value=''};
}
window.addEventListener('popstate',async()=>{if(!user)return;const deep=location.hash.startsWith('#video=')?decodeURIComponent(location.hash.slice(7)):'';if(deep){try{await openVideoLesson(deep,false)}catch{go('videos')}}else if(activeVideoId){clearWatchPage();go('videos');loadVideoLessons()}});
hydrateIcons();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');start();

async function loadCurricula(){
  try{
    const rows=await api('/lms/curricula');$('#curriculumDetail').innerHTML='';
    $('#curriculumList').innerHTML=rows.map(x=>'<article><div class="lesson-row"><div><small>'+esc(x.programCode)+' · '+esc(x.academicYear)+' · '+esc(x.language)+'</small><h2>'+esc(x.name)+'</h2><p>'+esc(x.direction)+'</p><small>'+esc(x.subjects?.length||0)+' fan · '+esc(x.groupIds?.map(g=>g.name).join(', ')||'Guruh yo‘q')+'</small></div><div><button class="primary" data-curriculum-ready="'+esc(x._id)+'">Qamrov</button>'+(['admin','superadmin'].includes(user.role)?'<button data-curriculum-archive="'+esc(x._id)+'">Arxiv</button>':'')+'</div></div></article>').join('')||'<div class="empty"><b>Tasdiqlangan o‘quv reja kiritilmagan</b><p>Administrator Excel yoki CSV faylini import qiladi.</p></div>';
    all('[data-curriculum-ready]').forEach(b=>b.onclick=()=>openCurriculumReadiness(b.dataset.curriculumReady));
    all('[data-curriculum-archive]').forEach(b=>b.onclick=async()=>{if(!confirm('O‘quv reja arxivlansinmi?'))return;try{await api('/lms/curricula/'+b.dataset.curriculumArchive,{method:'DELETE'});loadCurricula()}catch(e){toast(e.message)}});
  }catch(e){toast(e.message)}
}
async function openCurriculumReadiness(id){
  try{
    const x=await api('/lms/curricula/'+id+'/readiness'),keys={course:'Fan',language:'Til',credits:'Kredit',syllabus:'Dastur',resources:'Resurs',assignments:'Topshiriq',quizzes:'Test',practice:'Amaliyot'},rows=x.rows||[],missing=rows.filter(r=>!r.complete);
    $('#curriculumList').innerHTML='';$('#curriculumDetail').innerHTML='<article><div class="section-title"><div><button id="curriculumBack">← Rejalar</button><h2>'+esc(x.plan.name)+'</h2></div><b>'+esc(x.summary.percent)+'%</b></div><p>'+esc(x.plan.programCode)+' · '+esc(x.plan.direction)+' · '+esc(x.plan.academicYear)+' · '+esc(x.plan.language)+'</p><p><b>Kutilgan:</b> '+esc(x.summary.expected)+' · <b>To‘liq:</b> '+esc(x.summary.complete)+' · <b>Kam:</b> '+esc(x.summary.missing)+'</p><h3>Kamchiliklar</h3>'+(missing.map(r=>'<div class="lesson-row"><div><b>'+esc(r.group.name)+' · '+esc(r.subject.code)+' · '+esc(r.subject.title)+'</b><small>'+Object.entries(r.checks).map(([k,v])=>esc(keys[k]||k)+': '+(v?'✓':'✗')).join(' · ')+'</small></div></div>').join('')||'<p>Barcha fanlar bo‘yicha texnik qamrov to‘liq.</p>')+'<details><summary>Barcha fanlarni ko‘rish</summary>'+rows.map(r=>'<p>'+esc(r.group.name)+' · '+esc(r.subject.code)+' · '+esc(r.subject.title)+' · '+(r.complete?'✓':'✗')+'</p>').join('')+'</details></article>';$('#curriculumBack').onclick=loadCurricula;
  }catch(e){toast(e.message)}
}
$('#curriculumTemplate')?.addEventListener('click',()=>{
  const csv='semestr,fan_kodi,fan_nomi,kredit,til,fan_dasturi,amaliyot\n1,DI101,Dasturlash asoslari,5,O‘zbekcha,,ha\n1,DI102,Algoritmlar va ma’lumotlar tuzilmasi,5,O‘zbekcha,,ha\n1,DI103,Web dasturlash asoslari,4,O‘zbekcha,,ha\n1,DI104,Oliy matematika,5,O‘zbekcha,,yoq\n';
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='oquv_reja_namuna.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
$('#importCurriculum')?.addEventListener('click',async()=>{
  try{
    const groups=await api('/structure?type=group');
    modal('Tasdiqlangan o‘quv reja importi','<label>Nomi<input name="name" required placeholder="2026/2027 ATT o‘quv reja"></label><label>Yo‘nalish kodi<input name="programCode" required></label><label>Yo‘nalish nomi<input name="direction" required></label><label>O‘quv yili<input name="academicYear" value="2026/2027" pattern="\\d{4}/\\d{4}" required></label><label>Ta’lim tili<input name="language" value="uz" required></label><label>Tasdiqlovchi hujjat raqami<input name="approvedDocumentNo"></label><label>Tasdiqlangan sana<input name="approvedAt" type="date"></label><label>Excel/CSV<input name="file" type="file" accept=".xlsx,.csv" required></label><p>Biriktiriladigan guruhlar:</p>'+groups.map(g=>'<label><input type="checkbox" name="groupIds" value="'+esc(g._id)+'"> '+esc(g.name)+' · '+esc(g.externalId||g.code||'')+'</label>').join(''),async d=>{const file=d.file;if(!(file instanceof File)||!file.size)throw Error('Excel/CSV faylni tanlang');const groupIds=(Array.isArray(d.groupIds)?d.groupIds:[d.groupIds]).filter(Boolean);if(!groupIds.length)throw Error('Kamida bitta guruh tanlang');const contentBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});await api('/lms/curricula/import',{method:'POST',body:JSON.stringify({...d,file:undefined,filename:file.name,contentBase64,groupIds})});loadCurricula()});
  }catch(e){toast(e.message)}
});

const finalExamTypeLabel={semester_final:'Semestr yakuniy nazorati',state_attestation:'Davlat attestatsiyasi',thesis_defense:'Himoya'};
async function loadFinalExams(){
  try{
    const rows=await api('/lms/final-exams');$('#finalExamDetail').innerHTML='';
    $('#finalExamList').innerHTML=rows.map(x=>'<article><div class="lesson-row"><div><small>'+esc(finalExamTypeLabel[x.type]||x.type)+' · '+esc(x.academicYear)+' · '+esc(x.semester)+'-semestr</small><h2>'+esc(x.title)+'</h2><p>'+esc(x.groupId?.name||'')+(x.courseId?' · '+esc(x.courseId.title):'')+'</p><small>'+new Date(x.startsAt).toLocaleString('uz-UZ')+' · '+esc(x.location)+(x.room?' · '+esc(x.room):'')+' · '+esc(x.status)+'</small></div><button class="primary" data-final-exam="'+esc(x._id)+'">Jurnal</button></div></article>').join('')||'<div class="empty"><b>Yakuniy nazorat qaydi yo‘q</b><p>Administrator shaxsan o‘tkaziladigan nazoratni rejalashtiradi.</p></div>';
    all('[data-final-exam]').forEach(b=>b.onclick=()=>openFinalExam(b.dataset.finalExam));
  }catch(e){toast(e.message)}
}
async function openFinalExam(id){
  try{
    const x=await api('/lms/final-exams/'+id+'/records'),s=x.session,editor=['teacher','admin','superadmin'].includes(user.role),admin=['admin','superadmin'].includes(user.role),byStudent=new Map((x.records||[]).map(r=>[String(r.studentId?._id||r.studentId),r]));
    let html='<article><div class="section-title"><div><button id="finalExamBack">← Orqaga</button><h2>'+esc(s.title)+'</h2></div><div>'+(editor&&s.status==='planned'?'<button id="startFinalExam" class="secondary">Boshlash</button>':'')+(admin&&!['completed','cancelled'].includes(s.status)?'<button id="completeFinalExam" class="primary">Yakunlash</button>':'')+'</div></div><p><b>'+esc(finalExamTypeLabel[s.type]||s.type)+'</b> · '+esc(s.academicYear)+' · '+esc(s.semester)+'-semestr</p><p>'+new Date(s.startsAt).toLocaleString('uz-UZ')+' — '+new Date(s.endsAt).toLocaleString('uz-UZ')+' · '+esc(s.location)+(s.room?' · '+esc(s.room):'')+'</p><p><b>Holat:</b> '+esc(s.status)+' · <b>Shakl:</b> shaxsan</p>';
    if(user.role==='student'){const r=x.records?.[0];html+='<h3>Mening qaydim</h3>'+(r?'<p>Qatnashuv: '+esc(r.attendance)+' · shaxs hujjati: '+(r.identityDocumentChecked?'tekshirilgan':'tekshirilmagan')+(r.score!==undefined?' · '+esc(r.score)+' ball':'')+(r.resultLabel?' · '+esc(r.resultLabel):'')+'</p>':'<p>Hali qayd kiritilmagan.</p>')}
    else html+='<h3>Talabalar</h3>'+(x.students||[]).map(st=>{const r=byStudent.get(String(st._id)),foreign=String(st.citizenshipCountry||'UZ').toUpperCase()!=='UZ';return '<div class="lesson-row"><div><b>'+esc(st.fullName)+'</b><small>@'+esc(st.login)+' · '+esc(st.citizenshipCountry||'UZ')+(foreign?' · xorijiy istisno mavjud':'')+(r?' · '+esc(r.attendance)+' · '+(r.identityDocumentChecked?'ID ✓':'ID —')+(r.score!==undefined?' · '+esc(r.score)+' ball':''):' · qayd kiritilmagan')+'</small></div><button data-final-record="'+esc(st._id)+'">'+(r?'Tahrirlash':'Qayd')+'</button></div>'}).join('');
    html+='</article>';$('#finalExamDetail').innerHTML=html;$('#finalExamList').innerHTML='';
    $('#finalExamBack').onclick=loadFinalExams;
    $('#startFinalExam')?.addEventListener('click',async()=>{try{await api('/lms/final-exams/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:'in_progress'})});openFinalExam(id)}catch(e){toast(e.message)}});
    $('#completeFinalExam')?.addEventListener('click',async()=>{if(!confirm('Barcha talabalar qaydi va yakuniy natijalar tekshirildimi?'))return;try{await api('/lms/final-exams/'+id+'/complete',{method:'POST'});toast('Yakuniy nazorat yopildi');openFinalExam(id)}catch(e){toast(e.message)}});
    all('[data-final-record]').forEach(b=>{const st=(x.students||[]).find(v=>String(v._id)===String(b.dataset.finalRecord)),r=byStudent.get(String(st._id)),foreign=String(st.citizenshipCountry||'UZ').toUpperCase()!=='UZ';b.onclick=()=>modal('Nazorat qaydi · '+st.fullName,'<label>Qatnashuv<select name="attendance"><option value="present" '+(r?.attendance==='present'?'selected':'')+'>Qatnashdi</option><option value="absent" '+(r?.attendance==='absent'?'selected':'')+'>Qatnashmadi</option><option value="excused" '+(r?.attendance==='excused'?'selected':'')+'>Sababli</option>'+(foreign?'<option value="foreign_exempt" '+(r?.attendance==='foreign_exempt'?'selected':'')+'>Xorijiy fuqaro — 21-band istisnosi</option>':'')+'</select></label><label><input name="identityDocumentChecked" type="checkbox" value="true" '+(r?.identityDocumentChecked?'checked':'')+'> Shaxsi hujjat bilan tekshirildi</label><label>Ball (ixtiyoriy)<input name="score" type="number" min="0" max="100" step="0.01" value="'+esc(r?.score??'')+'"></label><label>Natija belgisi<input name="resultLabel" value="'+esc(r?.resultLabel||'')+'"></label><label>Izoh<textarea name="note">'+esc(r?.note||'')+'</textarea></label>',async d=>{await api('/lms/final-exams/'+id+'/records/'+st._id,{method:'PUT',body:JSON.stringify({...d,identityDocumentChecked:d.identityDocumentChecked==='true',score:d.score===''?undefined:Number(d.score)})});openFinalExam(id)})});
  }catch(e){toast(e.message)}
}
$('#addFinalExam')?.addEventListener('click',async()=>{
  try{
    const [groups,courses,teachers]=await Promise.all([api('/structure?type=group'),api('/lms/courses'),api('/teachers')]);
    modal('Shaxsan yakuniy nazorat','<label>Turi<select name="type"><option value="semester_final">Semestr yakuniy nazorati</option><option value="state_attestation">Davlat attestatsiyasi</option><option value="thesis_defense">Himoya</option></select></label><label>Sarlavha<input name="title" required></label><label>O‘quv yili<input name="academicYear" value="2026/2027" pattern="\\d{4}/\\d{4}" required></label><label>Semestr<input name="semester" type="number" min="1" max="12" value="1" required></label><label>Guruh<select name="groupId">'+groups.map(g=>'<option value="'+esc(g._id)+'">'+esc(g.name)+' · '+esc(g.externalId||g.code||'')+'</option>').join('')+'</select></label><label>Fan (semestr yakuniy nazorati uchun)<select name="courseId"><option value="">—</option>'+courses.map(x=>'<option value="'+esc(x._id)+'">'+esc(x.title)+' · '+esc(x.groupId?.name||'')+'</option>').join('')+'</select></label><label>Boshlanish<input name="startsAt" type="datetime-local" required></label><label>Tugash<input name="endsAt" type="datetime-local" required></label><label>OTMdagi joy<input name="location" placeholder="Asosiy bino, Qarshi..." required></label><label>Xona<input name="room"></label><label>Nazoratchi<select name="invigilatorIds"><option value="">—</option>'+teachers.map(t=>'<option value="'+esc(t._id)+'">'+esc(t.fullName)+' · '+esc(t.login)+'</option>').join('')+'</select></label>',async d=>{await api('/lms/final-exams',{method:'POST',body:JSON.stringify({...d,semester:Number(d.semester),invigilatorIds:d.invigilatorIds?[d.invigilatorIds]:[]})});loadFinalExams()});
  }catch(e){toast(e.message)}
});

async function loadCommunications(){
  try{
    const [inbox,sent,courses]=await Promise.all([api('/lms/messages'),api('/lms/messages?box=sent'),api('/lms/courses')]);
    const card=(m,incoming)=>'<div class="lesson-row"><div><b>'+esc(m.subject)+'</b><small>'+(incoming?'Kimdan: '+esc(m.senderId?.fullName||m.senderId?.login||''):'Kimga: '+esc(m.recipientId?.fullName||m.recipientId?.login||''))+' · '+new Date(m.createdAt).toLocaleString('uz-UZ')+(incoming&&!m.readAt?' · Yangi':'')+'</small><p>'+esc(m.body)+'</p>'+(m.emailStatus&&m.emailStatus!=='not_configured'?'<small>E-pochta: '+esc(m.emailStatus)+'</small>':'')+'</div>'+(incoming&&!m.readAt?'<button data-message-read="'+esc(m._id)+'">O‘qildi</button>':'')+'</div>';
    $('#inboxList').innerHTML=inbox.map(m=>card(m,true)).join('')||'<p>Kiruvchi xabar yo‘q.</p>';
    $('#sentList').innerHTML=sent.map(m=>card(m,false)).join('')||'<p>Yuborilgan xabar yo‘q.</p>';
    all('[data-message-read]').forEach(b=>b.onclick=async()=>{try{await api('/lms/messages/'+b.dataset.messageRead+'/read',{method:'PATCH'});loadCommunications()}catch(e){toast(e.message)}});
    $('#forumCourseList').innerHTML=courses.map(x=>'<button data-forum-course="'+esc(x._id)+'"><b>'+esc(x.title)+'</b><span>'+esc(x.code)+' · '+esc(x.groupId?.name||'')+'</span></button>').join('')||'<p>Forum uchun fan topilmadi.</p>';
    all('[data-forum-course]').forEach(b=>b.onclick=()=>openCourseForum(b.dataset.forumCourse));
  }catch(e){toast(e.message)}
}
$('#refreshMessages')?.addEventListener('click',loadCommunications);
$('#newInternalMessage')?.addEventListener('click',async()=>{try{const rows=await api('/lms/messages/recipients');if(!rows.length)return toast('Xabar yuborish mumkin bo‘lgan foydalanuvchi topilmadi');modal('Yangi xabar','<label>Qabul qiluvchi<select name="recipientId">'+rows.map(x=>'<option value="'+esc(x._id)+'">'+esc(x.fullName)+' · '+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</option>').join('')+'</select></label><label>Mavzu<input name="subject" required maxlength="240"></label><label>Xabar<textarea name="body" required maxlength="10000"></textarea></label>',async d=>{await api('/lms/messages',{method:'POST',body:JSON.stringify(d)});loadCommunications()})}catch(e){toast(e.message)}});
async function openCourseForum(courseId){
  try{const rows=await api('/lms/courses/'+courseId+'/forum');$('#forumPanel').innerHTML='<div class="section-title"><h3>Kurs forumi</h3><button id="newForumThread" class="primary">+ Mavzu</button></div>'+(rows.map(t=>'<div class="lesson-row"><div><b>'+esc(t.title)+'</b><small>'+esc(t.createdBy?.fullName||'')+' · '+esc(t.postCount)+' xabar'+(t.locked?' · yopilgan':'')+'</small></div><button data-forum-thread="'+esc(t._id)+'">Ochish</button></div>').join('')||'<p>Forumda mavzu yo‘q.</p>');all('[data-forum-thread]').forEach(b=>b.onclick=()=>openForumThread(b.dataset.forumThread,courseId));$('#newForumThread').onclick=()=>modal('Forum mavzusi','<label>Sarlavha<input name="title" required maxlength="240"></label><label>Birinchi xabar<textarea name="body" required maxlength="5000"></textarea></label>',async d=>{await api('/lms/courses/'+courseId+'/forum',{method:'POST',body:JSON.stringify(d)});openCourseForum(courseId)})}catch(e){toast(e.message)}
}
async function openForumThread(threadId,courseId){
  try{const x=await api('/lms/forum/'+threadId+'/posts');const canLock=['teacher','admin','superadmin'].includes(user.role);$('#forumPanel').innerHTML='<div class="section-title"><div><button id="forumBack">← Forum</button><h3>'+esc(x.thread.title)+'</h3></div><div><button id="forumReply" class="primary">Javob yozish</button>'+(canLock?'<button id="forumLock">'+(x.thread.locked?'Ochish':'Yopish')+'</button>':'')+'</div></div>'+x.posts.map(p=>'<div class="lesson-row"><div><b>'+esc(p.userId?.fullName||'')+'</b><small>'+esc(roleName[p.userId?.role]||p.userId?.role||'')+' · '+new Date(p.createdAt).toLocaleString('uz-UZ')+'</small><p>'+esc(p.text)+'</p></div></div>').join('');$('#forumBack').onclick=()=>openCourseForum(courseId);$('#forumReply').onclick=()=>modal('Forumga javob','<label>Xabar<textarea name="body" required maxlength="5000"></textarea></label>',async d=>{await api('/lms/forum/'+threadId+'/posts',{method:'POST',body:JSON.stringify(d)});openForumThread(threadId,courseId)});if(canLock)$('#forumLock').onclick=async()=>{try{await api('/lms/forum/'+threadId+'/lock',{method:'PATCH',body:JSON.stringify({locked:!x.thread.locked})});openForumThread(threadId,courseId)}catch(e){toast(e.message)}}}catch(e){toast(e.message)}
}

async function loadLibrary(){
  try{
    const q=$('#librarySearch')?.value?.trim()||'',type=$('#libraryType')?.value||'',params=new URLSearchParams();if(q)params.set('q',q);if(type)params.set('type',type);
    const rows=await api('/lms/library'+(params.toString()?'?'+params.toString():''));
    const labels={book:'Kitob',textbook:'Darslik',manual:'Qo‘llanma',monograph:'Monografiya',article:'Ilmiy maqola',research:'Tadqiqot',thesis:'Dissertatsiya',standard:'Standart',other:'Boshqa'};
    $('#libraryList').innerHTML=rows.map(r=>'<article><div class="lesson-row"><div><small>'+esc(labels[r.type]||r.type)+' · '+esc(r.language||'Til ko‘rsatilmagan')+(r.publicationYear?' · '+esc(r.publicationYear):'')+'</small><h2>'+esc(r.title)+'</h2><p>'+esc((r.authors||[]).join(', '))+'</p><small>'+esc(r.description||'')+'</small><p>'+esc((r.tags||[]).join(' · '))+'</p></div><div><button class="primary" data-library-open="'+esc(r._id)+'">Ochish</button>'+(['admin','superadmin'].includes(user.role)?' <button data-library-delete="'+esc(r._id)+'">Arxiv</button>':'')+'</div></div></article>').join('')||'<div class="empty"><b>Resurs topilmadi</b><p>Qidiruvni o‘zgartiring yoki katalogga yangi manba qo‘shing.</p></div>';
    all('[data-library-open]').forEach(b=>b.onclick=async()=>{try{const x=await api('/lms/library/'+b.dataset.libraryOpen+'/open');if(x.url)window.open(x.url,'_blank','noopener,noreferrer')}catch(e){toast(e.message)}});
    all('[data-library-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Kutubxona yozuvi arxivlansinmi?'))return;try{await api('/lms/library/'+b.dataset.libraryDelete,{method:'DELETE'});loadLibrary()}catch(e){toast(e.message)}});
  }catch(e){toast(e.message)}
}
$('#libraryApply')?.addEventListener('click',loadLibrary);
$('#librarySearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadLibrary()});
$('#addLibraryItem')?.addEventListener('click',async()=>{
  try{
    const courses=await api('/lms/courses'),admin=['admin','superadmin'].includes(user.role);
    modal('Kutubxona resursi','<label>Turi<select name="type"><option value="textbook">Darslik</option><option value="book">Kitob</option><option value="manual">Qo‘llanma</option><option value="monograph">Monografiya</option><option value="article">Ilmiy maqola</option><option value="research">Tadqiqot</option><option value="thesis">Dissertatsiya</option><option value="standard">Standart</option><option value="other">Boshqa</option></select></label><label>Sarlavha<input name="title" required></label><label>Mualliflar (vergul bilan)<input name="authors"></label><label>Nashr yili<input name="publicationYear" type="number" min="1000" max="3000"></label><label>Til<input name="language" value="uz"></label><label>ISBN<input name="isbn"></label><label>DOI<input name="doi"></label><label>HTTPS manba<input name="sourceUrl" type="url" required></label><label>Teglar (vergul bilan)<input name="tags"></label><label>Izoh<textarea name="description"></textarea></label>'+(admin?'<label>Ko‘rinish<select name="audience"><option value="university">Butun universitet</option><option value="courses">Tanlangan fanlar</option></select></label>':'')+'<p>Fanlarga bog‘lash:</p>'+courses.map(x=>'<label><input type="checkbox" name="courseIds" value="'+esc(x._id)+'"> '+esc(x.title)+' · '+esc(x.groupId?.name||'')+'</label>').join(''),async d=>{const ids=(Array.isArray(d.courseIds)?d.courseIds:[d.courseIds]).filter(Boolean);await api('/lms/library',{method:'POST',body:JSON.stringify({...d,courseIds:ids,audience:admin?(d.audience||'university'):'courses'})});loadLibrary()});
  }catch(e){toast(e.message)}
});

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
    html+='<h3>Materiallar</h3>'+(x.resources.map(r=>{const source=r.fileId?'/api/lms/resources/'+encodeURIComponent(r._id)+'/content':'/api/lms/resources/'+encodeURIComponent(r._id)+'/open';const media=r.fileId&&(r.kind==='video'?'<video controls preload="none" style="max-width:100%;max-height:360px" src="'+esc(source)+'"></video>':r.kind==='audio'?'<audio controls preload="none" src="'+esc(source)+'"></audio>':r.kind==='image'?'<img loading="lazy" alt="'+esc(r.title)+'" style="max-width:100%;max-height:320px" src="'+esc(source)+'">':'');return '<div class="lesson-row"><div><b>'+esc(r.title)+'</b><small>'+esc(r.kind)+(r.size?' · '+Math.ceil(r.size/1024)+' KB':'')+'</small>'+(media?'<details><summary>Ko‘rish</summary>'+media+'</details>':'')+'</div><a href="'+esc(source)+'" target="_blank" rel="noopener noreferrer">Ochish ↗</a>'+(editor?'<button data-library-resource="'+esc(r._id)+'" data-library-title="'+esc(r.title)+'">Kutubxonaga</button><button data-delete-resource="'+esc(r._id)+'">O‘chirish</button>':'')+'</div>'}).join('')||'<p>Material yo‘q</p>');
    if(editor)html+='<button id="newResource">+ Havola</button> <button id="uploadResource">+ Fayl yuklash</button> <button id="newAssignment">+ Topshiriq</button> <button id="newQuiz">+ Test</button> <button id="resourceUsage">Resurs faolligi</button> <button id="courseResults">Yakuniy natijalar</button>';
    html+='<h3>Topshiriqlar</h3>'+(x.assignments.map(a=>'<div class="lesson-row"><div><b>'+esc(a.title)+'</b><small>'+esc(({assignment:'Topshiriq',independent_work:'Mustaqil ish',practice:'Amaliyot'})[a.category]||'Topshiriq')+'</small><p>'+esc(a.instructions)+'</p><small>Muddat: '+esc(a.dueAt?new Date(a.dueAt).toLocaleString('uz-UZ'):'belgilanmagan')+'</small></div><button data-assignment="'+esc(a._id)+'">'+(user.role==='student'?'Javob berish':'Javoblarni ko‘rish')+'</button></div>').join('')||'<p>Topshiriq yo‘q</p>');
    html+='<h3>SCORM paketlar</h3>'+(scorm.map(p=>'<div class="lesson-row"><div><b>'+esc(p.title)+'</b><small>'+esc(p.standard)+' · '+esc(p.scoes?.length||1)+' SCO</small></div>'+(user.role==='student'?(p.scoes?.length?p.scoes.map(s=>'<button data-scorm="'+esc(p._id)+'" data-sco="'+esc(s.identifier)+'">'+esc(s.title||'Ochish')+'</button>').join(' '):'<button data-scorm="'+esc(p._id)+'">Ochish</button>'):'')+'</div>').join('')||'<p>Paket yo‘q</p>')+(editor?'<label>SCORM ZIP (8 MB gacha)<input id="scormFile" type="file" accept=".zip"></label><button id="uploadScorm">Yuklash</button>':'')+'<div id="scormPlayer"></div>';
    html+='<h3>Testlar</h3>'+(x.quizzes.map(q=>'<p>'+esc(q.title)+(q.proctorRequired?' · Imtihon oynasi nazorati':'')+' <button '+(user.role==='student'?'data-quiz data-quiz-proctor="'+(q.proctorRequired?'1':'0')+'"':'data-quiz-review')+'="'+esc(q._id)+'">'+(user.role==='student'?'Boshlash':'Urinishlar')+'</button></p>').join('')||'<p>Test yo‘q</p>')+'</article>';
    $('#courseDetail').innerHTML=html;
    $('#newResource')?.addEventListener('click',()=>modal('Material qo‘shish','<label>Sarlavha<input name="title" required></label><label>Turi<select name="kind"><option value="document">Hujjat</option><option value="video">Video</option><option value="link">Havola</option></select></label><label>HTTPS havola<input name="url" type="url" required></label><label>Izoh<textarea name="description"></textarea></label>',async d=>{await api('/lms/courses/'+id+'/resources',{method:'POST',body:JSON.stringify(d)});openCourse(id)}));
    $('#uploadResource')?.addEventListener('click',()=>modal('Fayl yuklash','<label>Fayl (PDF, Word, Excel, PowerPoint, rasm, audio, video, matn, ZIP)<input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.epub,.txt,.md,.csv,.srt,.vtt,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.webm,.mov,.mkv,.avi,.zip,.rar,.7z" required></label><label>Nom<input name="title" placeholder="Fayl nomi bo‘lsa bo‘sh qoldiring"></label><label>Izoh<textarea name="description"></textarea></label><p id="uploadProgress" role="status"></p>',async d=>{await uploadCourseResource(id,d);openCourse(id)}));
    all('[data-library-resource]').forEach(b=>b.onclick=()=>modal('Kutubxona katalogiga qo‘shish','<label>Turi<select name="type"><option value="textbook">Darslik</option><option value="book">Kitob</option><option value="manual">Qo‘llanma</option><option value="monograph">Monografiya</option><option value="article">Ilmiy maqola</option><option value="research">Tadqiqot</option><option value="other">Boshqa</option></select></label><label>Sarlavha<input name="title" value="'+esc(b.dataset.libraryTitle||'')+'" required></label><label>Mualliflar<input name="authors"></label><label>Til<input name="language" value="uz"></label><label>Teglar<input name="tags"></label><label>Izoh<textarea name="description"></textarea></label>',async d=>{await api('/lms/library',{method:'POST',body:JSON.stringify({...d,resourceId:b.dataset.libraryResource,courseIds:[id],audience:'courses'})});toast('Kutubxona katalogiga qo‘shildi')}));
    all('[data-delete-resource]').forEach(b=>b.onclick=async()=>{if(!confirm('Resurs o‘chirilsinmi?'))return;try{await api('/lms/resources/'+b.dataset.deleteResource,{method:'DELETE'});openCourse(id)}catch(e){toast(e.message)}});
    $('#newAssignment')?.addEventListener('click',()=>modal('Topshiriq qo‘shish','<label>Turi<select name="category"><option value="assignment">Topshiriq</option><option value="independent_work">Mustaqil ish</option><option value="practice">Amaliyot</option></select></label><label>Sarlavha<input name="title" required></label><label>Ko‘rsatma<textarea name="instructions" required></textarea></label><label>Topshirish muddati<input name="dueAt" type="datetime-local"></label><label>Maksimal ball<input name="maxScore" type="number" value="100" min="1"></label>',async d=>{await api('/lms/courses/'+id+'/assignments',{method:'POST',body:JSON.stringify(d)});openCourse(id)}));
    $('#newQuiz')?.addEventListener('click',()=>modal('Test yaratish','<label>Nomi<input name="title" required></label><label>Daqiqa<input name="durationMinutes" type="number" min="1" max="240" value="30" required></label><label>Maksimal urinish<input name="maxAttempts" type="number" min="1" max="10" value="1" required></label><label>Savollar JSON: [{"prompt":"Savol?","options":["A","B"],"correctIndex":0}]<textarea name="questionsJson" required></textarea></label><label><input name="proctorRequired" type="checkbox" value="true"> <b>Qat’iy avtoproktoring</b> — fullscreen, kamera, yuz holati, sahifadan chiqish, copy/paste va ekran olish urinishlari nazorat qilinadi; kritik buzilish testni avtomatik yakunlaydi</label>',async d=>{const questions=JSON.parse(d.questionsJson);await api('/lms/courses/'+id+'/quizzes',{method:'POST',body:JSON.stringify({...d,maxAttempts:Number(d.maxAttempts)||1,questions,published:true,proctorRequired:d.proctorRequired==='true'})});openCourse(id)}));
    all('[data-assignment]').forEach(b=>b.onclick=async()=>{const aid=b.dataset.assignment;if(user.role==='student')modal('Topshiriqni topshirish','<label>Javob<textarea name="text"></textarea></label><label>HTTPS havola<input name="url" type="url"></label>',async d=>{await api('/lms/assignments/'+aid+'/submit',{method:'POST',body:JSON.stringify(d)});openCourse(id)});else{const rows=await api('/lms/assignments/'+aid+'/submissions');$('#courseDetail').innerHTML+='<article><h3>Talabalar javoblari</h3>'+rows.map(s=>'<p>'+esc(s.studentId?.fullName||'')+': '+esc(s.text||s.url||'')+' · '+esc(s.score??'Baholanmagan')+' <button data-grade="'+esc(s._id)+'" data-graded="'+(s.gradedAt?'1':'0')+'">'+(s.gradedAt?'Tuzatish so‘rovi':'Baholash')+'</button></p>').join('')+'</article>';all('[data-grade]').forEach(g=>g.onclick=()=>modal(g.dataset.graded==='1'?'Bahoni tuzatish so‘rovi':'Javobni baholash',g.dataset.graded==='1'?'<label>Yangi ball<input name="newScore" type="number" min="0" required></label><label>Sabab<textarea name="reason" minlength="10" required></textarea></label>':'<label>Ball<input name="score" type="number" min="0" required></label><label>Izoh<textarea name="feedback"></textarea></label>',async d=>{await api('/lms/submissions/'+g.dataset.grade+(g.dataset.graded==='1'?'/grade-change':'/grade'),{method:g.dataset.graded==='1'?'POST':'PATCH',body:JSON.stringify(d)});openCourse(id)}))}});
    $('#resourceUsage')?.addEventListener('click',async()=>{try{const rows=await api('/lms/courses/'+id+'/resource-usage');$('#courseDetail').innerHTML+='<article id="resourceUsagePanel"><h3>Resurslardan foydalanish</h3>'+rows.map(r=>'<div class="lesson-row"><div><b>'+esc(r.title)+'</b><small>'+esc(r.kind)+' · '+esc(r.uniqueUsers)+' foydalanuvchi · '+esc(r.recordedSessions)+' sessiya'+(r.lastAccessedAt?' · oxirgi: '+new Date(r.lastAccessedAt).toLocaleString('uz-UZ'):'')+'</small></div></div>').join('')+'</article>'}catch(e){toast(e.message)}});
    $('#courseResults')?.addEventListener('click',()=>manageCourseResults(id));
    all('[data-quiz]').forEach(b=>b.onclick=()=>startCourseQuiz(b.dataset.quiz,b.dataset.quizProctor==='1'));
    all('[data-quiz-review]').forEach(b=>b.onclick=()=>reviewCourseQuiz(b.dataset.quiz));
    $('#uploadScorm')?.addEventListener('click',async()=>{const file=$('#scormFile').files[0];if(!file||file.size>8*1024*1024)return toast('8 MB gacha ZIP tanlang');try{const contentBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});await api('/lms/courses/'+id+'/scorm',{method:'POST',body:JSON.stringify({title:file.name,contentBase64})});openCourse(id)}catch(e){toast(e.message)}});
    all('[data-scorm]').forEach(b=>b.onclick=()=>launchScorm(b.dataset.scorm,b.dataset.sco||''));
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
  const [plan,transcript,movements,retakes]=await Promise.all([api('/lms/academic/plan/'+student._id),api('/lms/academic/transcript/'+student._id),api('/lms/academic/movements/'+student._id),api('/lms/academic/retakes/'+student._id)]);
  const planHtml=plan.plans.map(p=>'<div class="lesson-row"><div><b>'+esc(p.academicYear)+' · '+esc(p.semester)+'-semestr</b><small>'+esc(p.items.reduce((n,x)=>n+(Number(x.credits)||0),0))+' kredit</small><p>'+p.items.map(x=>esc(x.courseId?.title||'Fan')+' · '+esc(x.credits)+' kr · '+esc(x.status)).join('<br>')+'</p></div></div>').join('')||'<p>Individual reja hali tasdiqlanmagan.</p>';
  const transcriptHtml=transcript.results.map(r=>'<div class="lesson-row"><div><b>'+esc(r.courseId?.title||'Fan')+'</b><small>'+esc(r.academicYear)+' · '+esc(r.semester)+'-semestr · '+esc(r.totalScore)+' ball'+(r.gradeLabel?' · '+esc(r.gradeLabel):'')+' · '+esc(r.creditsAwarded)+' kredit</small></div></div>').join('')||'<p>Yakuniy akademik natija hali yo‘q.</p>';
  const movementHtml=movements.map(m=>'<p><b>'+esc(m.kind)+'</b> · '+new Date(m.effectiveAt).toLocaleDateString('uz-UZ')+(m.documentNo?' · '+esc(m.documentNo):'')+(m.reason?' · '+esc(m.reason):'')+'</p>').join('')||'<p>Talaba harakati qaydi yo‘q.</p>';
  const retakeHtml=retakes.map(r=>'<div class="lesson-row"><div><b>'+esc(r.courseId?.title||'Fan')+' · '+esc(r.kind==='retake_exam'?'Qayta topshirish':'Qayta o‘qish')+'</b><small>'+esc(r.academicYear)+' · '+esc(r.semester)+'-semestr · urinish '+esc(r.attemptNo)+' · '+esc(r.status)+(r.dueAt?' · muddat '+new Date(r.dueAt).toLocaleDateString('uz-UZ'):'')+'</small><p>'+esc(r.reason||'')+(r.outcomeNote?' · '+esc(r.outcomeNote):'')+'</p></div></div>').join('')||'<p>Qayta o‘qish/topshirish qaydi yo‘q.</p>';
  $('#courseDetail').innerHTML='<article><h2>'+esc(student.fullName||plan.student?.fullName||'Talaba')+'</h2><h3>Individual o‘quv reja</h3>'+planHtml+'<h3>Transkript va kreditlar</h3><p><b>Jami tasdiqlangan kredit:</b> '+esc(transcript.creditsAwarded||0)+'</p>'+transcriptHtml+'<h3>Qayta o‘qish / qayta topshirish</h3>'+retakeHtml+'<h3>Talaba harakati</h3>'+movementHtml+(adminMode?'<div class="head-actions"><button id="approveStudentPlan" class="primary">Rejani tasdiqlash</button><button id="assignRetake">Qayta o‘qish/topshirish</button><button id="addStudentMovement">Harakat qo‘shish</button></div>':'')+'</article>';
  if(adminMode){
    $('#approveStudentPlan').onclick=async()=>{const courses=(await api('/lms/courses')).filter(c=>String(c.groupId?._id||c.groupId)===String(student.groupId?._id||student.groupId));if(!courses.length)return toast('Talaba guruhiga fan biriktirilmagan');modal('Individual reja','<label>O‘quv yili<input name="academicYear" value="2026/2027" pattern="\\d{4}/\\d{4}" required></label><label>Semestr<input name="semester" type="number" min="1" max="12" value="1" required></label><p>Rejaga kiritiladigan fanlar:</p>'+courses.map(c=>'<label><input type="checkbox" name="courseId" value="'+esc(c._id)+'" checked> '+esc(c.title)+' · '+esc(c.credits||0)+' kredit</label>').join('')+'<label>Izoh<textarea name="notes"></textarea></label>',async d=>{const ids=(Array.isArray(d.courseId)?d.courseId:[d.courseId]).filter(Boolean),items=ids.map(id=>{const course=courses.find(c=>String(c._id)===String(id));return {courseId:id,credits:Number(course?.credits)||0,required:true,status:'planned'}});await api('/lms/academic/plan/'+student._id,{method:'PUT',body:JSON.stringify({academicYear:d.academicYear,semester:Number(d.semester),items,notes:d.notes})});await renderStudentAcademic(student,true)})};
    $('#assignRetake').onclick=async()=>{const courses=(await api('/lms/courses')).filter(c=>String(c.groupId?._id||c.groupId)===String(student.groupId?._id||student.groupId));if(!courses.length)return toast('Talaba guruhiga fan biriktirilmagan');modal('Qayta o‘qish/topshirish','<label>Fan<select name="courseId">'+courses.map(x=>'<option value="'+esc(x._id)+'">'+esc(x.title)+'</option>').join('')+'</select></label><label>Turi<select name="kind"><option value="retake_exam">Qayta topshirish</option><option value="repeat_course">Qayta o‘qish</option></select></label><label>O‘quv yili<input name="academicYear" value="2026/2027" required></label><label>Semestr<input name="semester" type="number" min="1" max="12" value="1" required></label><label>Muddat<input name="dueAt" type="date"></label><label>Sabab<textarea name="reason" minlength="5" required></textarea></label>',async d=>{await api('/lms/academic/retakes',{method:'POST',body:JSON.stringify({...d,studentId:student._id,semester:Number(d.semester)})});await renderStudentAcademic(student,true)})};
    $('#addStudentMovement').onclick=()=>modal('Talaba harakati','<label>Turi<select name="kind"><option value="admission">Qabul</option><option value="transfer_in">Ko‘chirib kelish</option><option value="transfer_out">Ko‘chirish</option><option value="expulsion">Chetlashtirish</option><option value="reinstatement">Qayta tiklash</option><option value="promotion">Kursdan kursga o‘tkazish</option><option value="group_change">Guruhni almashtirish</option><option value="graduation">Bitirish</option></select></label><label>Kuchga kirish sanasi<input name="effectiveAt" type="date" required></label><label>Buyruq/hujjat raqami<input name="documentNo"></label><label>Asos<textarea name="reason"></textarea></label>',async d=>{await api('/lms/academic/movements',{method:'POST',body:JSON.stringify({...d,studentId:student._id,fromGroupId:student.groupId?._id||student.groupId||undefined})});await renderStudentAcademic(student,true)});
  }
}
$('#myAcademic')?.addEventListener('click',()=>renderStudentAcademic(user,false).catch(e=>toast(e.message)));
$('#manageAcademic')?.addEventListener('click',()=>modal('Talabani topish','<label>Login yoki F.I.Sh.<input name="q" required></label>',async d=>{const rows=await api('/users?role=student&q='+encodeURIComponent(d.q)),student=rows.find(x=>x.login===String(d.q).toLowerCase())||rows[0];if(!student)throw Error('Talaba topilmadi');await renderStudentAcademic(student,true)}));

let scormListener=null;
async function launchScorm(id,scoId=''){try{const launch=await api('/lms/scorm/'+id+'/launch',{method:'POST',body:JSON.stringify({scoId})});if(scormListener)removeEventListener('message',scormListener);const frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';frame.title='SCORM dars · '+(launch.sco?.title||'');frame.style.cssText='width:100%;height:65vh;border:1px solid #bbb;border-radius:10px';$('#scormPlayer').replaceChildren(frame);scormListener=event=>{if(event.source!==frame.contentWindow||event.data?.token!==launch.token)return;if(event.data.kind==='scorm-progress')api('/lms/scorm/'+id+'/progress',{method:'POST',body:JSON.stringify({token:launch.token,values:event.data.values})}).catch(e=>toast(e.message))};addEventListener('message',scormListener);frame.src=launch.url}catch(e){toast(e.message)}}
async function startCourseQuiz(id,proctorExpected=false,videoId=''){
  let stop=()=>{},terminated=false,preflight=null,countdown=null;
  try{
    if(proctorExpected){
      const consent=confirm('Kamera nazoratli test: kamera, mikrofon, fullscreen, sahifadan chiqish va yuz holati nazorat qilinadi. Kritik qoidabuzarlik testni avtomatik yakunlaydi. Davom etasizmi?');
      if(!consent)return;
      if(document.documentElement.requestFullscreen&&!document.fullscreenElement){
        try{await document.documentElement.requestFullscreen({navigationUI:'hide'})}catch{return toast('Nazoratli test uchun fullscreen ruxsatini bering')}
      }
      try{
        preflight=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24},facingMode:'user'},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      }catch{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});return toast('Kamera nazoratli test uchun kamera va mikrofon ruxsatini yoqing')}
    }
    const x=await api('/lms/quizzes/'+id+'/start',{method:'POST',body:JSON.stringify({consent:proctorExpected?true:undefined,videoId:videoId||undefined})});
    const cameraBox=x.proctorRequired?'<div class="proctor-camera-box"><video id="proctorPreviewVideo" autoplay muted playsinline></video><div><b>📷 Kamera nazorati faol</b><small id="proctorCameraStatus">Yuzni kamera markazida tuting · oynadan chiqmang</small></div></div>':'';
    const fields='<div class="proctor-exam-banner '+(x.proctorRequired?'strict':'')+'"><b>'+(x.proctorRequired?'🔒 Avtoproktoring faol':'Qisqa mavzu testi')+'</b><span>'+(x.proctorRequired?'Kamera, yuz holati, fullscreen va sahifadan chiqish real vaqtda nazorat qilinadi.':'Videodars bo‘yicha savollarni belgilang.')+'</span><strong id="examCountdown"></strong></div>'+cameraBox+x.questions.map((q,i)=>'<fieldset class="quiz-question"><legend><span>'+(i+1)+'</span>'+esc(q.prompt)+'</legend>'+q.options.map((option,j)=>'<label class="quiz-option"><input type="radio" name="q'+i+'" value="'+j+'" required><span>'+esc(option)+'</span></label>').join('')+'</fieldset>').join('');
    modal((x.proctorRequired?'Kamera nazoratli test':'Mavzu testi')+' · '+x.durationMinutes+' daqiqa',fields,async d=>{
      if(terminated)throw Error('Test avtoproktoring tomonidan yakunlangan');
      const answers=x.questions.map((_,i)=>Number(d['q'+i]));
      const result=await api('/lms/attempts/'+x.attemptId+'/submit',{method:'POST',body:JSON.stringify({answers})});
      if(countdown)clearInterval(countdown);stop();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
      if(videoId){const v=videoLessonsCache.find(v=>String(v._id)===String(videoId));if(v)v.lastQuizScore=result.score}
      toast('Test natijasi: '+Math.round(result.score)+'%');
      if(videoId)loadVideoLessons().catch(()=>{});
      return result;
    });
    let left=Math.max(1,Number(x.durationMinutes)||30)*60;
    countdown=setInterval(()=>{const el=$('#examCountdown');if(!el)return;const m=Math.floor(left/60),sec=left%60;el.textContent=String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');if(left<=0){clearInterval(countdown);toast('Test vaqti tugadi');return}left--},1000);
    const onTerminate=reason=>{
      if(terminated)return;terminated=true;if(countdown)clearInterval(countdown);stop();
      $('#modalSave')?.classList.add('hidden');
      const fields=$('#modalFields');if(fields)fields.innerHTML='<div class="proctor-terminated"><b>Test avtomatik yakunlandi</b><p>'+esc(reason||'Avtoproktoring qoidasi buzildi')+'</p><button type="button" class="primary" id="leaveTerminatedExam">Fanlarga qaytish</button></div>';
      $('#leaveTerminatedExam')?.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});closeEditor()});
      toast('Avtoproktoring: test yakunlandi');
    };
    stop=x.proctorRequired?await startExamSignals(x.attemptId,x.proctorPolicy||{},onTerminate,preflight):()=>{};
    preflight=null;
    $('#editor').addEventListener('close',()=>{if(countdown)clearInterval(countdown);stop();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})},{once:true});
  }catch(e){
    try{preflight?.getTracks().forEach(t=>t.stop())}catch{}
    if(countdown)clearInterval(countdown);stop();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});toast(e.message)
  }
}
async function reviewCourseQuiz(id){try{const rows=await api('/lms/quizzes/'+id+'/attempts');$('#courseDetail').innerHTML+='<article><h3>Test urinishlari</h3>'+rows.map(r=>{const s=r.proctorSummary||{};return '<div class="lesson-row"><div><b>'+esc(r.studentId?.fullName||'')+'</b><small>'+Math.round(r.score||0)+'% · '+esc(r.reviewDecision)+' · risk '+esc(s.riskScore??0)+'/100 ('+esc(s.reviewPriority||'low')+')</small><p>'+esc((s.warnings||[]).join(' · ')||'Muhim proktoring ogohlantirishi yo‘q')+'</p><small>'+esc(Object.entries(s.eventCounts||{}).map(([k,v])=>k+': '+v).join(', ')||'Signal yo‘q')+'</small></div><button data-review-attempt="'+esc(r._id)+'">Ko‘rib chiqish</button></div>'}).join('')+'</article>';all('[data-review-attempt]').forEach(b=>b.onclick=()=>modal('Imtihon signalini ko‘rib chiqish','<label>Qaror<select name="decision"><option value="cleared">Tekshirildi, muammo aniqlanmadi</option><option value="needs_review">Qo‘shimcha tekshiruv kerak</option></select></label><label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/lms/attempts/'+b.dataset.reviewAttempt+'/review',{method:'PATCH',body:JSON.stringify(d)});reviewCourseQuiz(id)}))}catch(e){toast(e.message)}}
async function startExamSignals(attemptId,policy={},onTerminate=()=>{},preflightStream=null){
  let camera=null,microphone=null,timer=null,detector=null,audioContext=null,analyser=null,busy=false,stopped=false,lastSound=0,turnStreak=0,missingStreak=0;
  document.body.classList.add('proctored-exam-active');
  const send=async type=>{
    if(stopped)return null;
    try{const x=await api('/lms/attempts/'+attemptId+'/proctor-events',{method:'POST',body:JSON.stringify({type})});if(x?.terminated){stopped=true;onTerminate(x.reason||'Nazorat qoidasi buzildi')}return x}catch{return null}
  };
  const visibility=()=>{if(document.hidden)send('page_hidden')};
  const blur=()=>send('window_blur');
  const networkOffline=()=>send('network_offline'),networkOnline=()=>send('network_online');
  const fullscreen=()=>{if(document.fullscreenElement)send('fullscreen_enter');else if(policy.requireFullscreen)send('fullscreen_exit')};
  const keydown=e=>{
    const key=String(e.key||'').toLowerCase(),clipboard=(e.ctrlKey||e.metaKey)&&['c','v','x'].includes(key);
    if(key==='printscreen'){e.preventDefault();send('screenshot_attempt')}
    if(clipboard){e.preventDefault();send('clipboard_attempt')}
  };
  const copyPaste=e=>{e.preventDefault();send('clipboard_attempt')};
  const contextmenu=e=>e.preventDefault();
  document.addEventListener('visibilitychange',visibility);document.addEventListener('fullscreenchange',fullscreen);window.addEventListener('blur',blur);window.addEventListener('offline',networkOffline);window.addEventListener('online',networkOnline);window.addEventListener('keydown',keydown,true);document.addEventListener('copy',copyPaste,true);document.addEventListener('cut',copyPaste,true);document.addEventListener('paste',copyPaste,true);document.addEventListener('contextmenu',contextmenu,true);
  const nativeOffCenter=(face,video)=>{const b=face?.boundingBox;if(!b||!video.videoWidth||!video.videoHeight)return false;const cx=(b.x+b.width/2)/video.videoWidth,cy=(b.y+b.height/2)/video.videoHeight;return Math.abs(cx-.5)>.24||Math.abs(cy-.5)>.24};
  const mediaPipeOffCenter=d=>{const b=d?.boundingBox;if(!b||!Number.isFinite(b.xCenter)||!Number.isFinite(b.yCenter))return false;return Math.abs(b.xCenter-.5)>.24||Math.abs(b.yCenter-.5)>.24};
  const mediaPipeTurned=d=>{
    const pts=d?.landmarks||d?.keypoints||d?.locationData?.relativeKeypoints||[];
    if(!Array.isArray(pts)||pts.length<3)return false;
    const p=x=>({x:Number(x?.x??x?.xCenter),y:Number(x?.y??x?.yCenter)}),a=p(pts[0]),b=p(pts[1]),nose=p(pts[2]);
    if(![a.x,b.x,nose.x].every(Number.isFinite))return false;
    const eye=Math.abs(a.x-b.x);if(eye<.02)return false;
    const mid=(a.x+b.x)/2,ratio=Math.abs(nose.x-mid)/eye;
    return ratio>.46;
  };
  try{
    if(preflightStream?.getVideoTracks?.().length)camera=new MediaStream(preflightStream.getVideoTracks());
    else camera=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24},facingMode:'user'},audio:false});
    await send('camera_ready');camera.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(!stopped)send('camera_track_ended')},{once:true}));
  }catch{await send('camera_unavailable')}
  if(stopped)return ()=>{try{preflightStream?.getTracks?.().forEach(t=>t.stop())}catch{};document.body.classList.remove('proctored-exam-active')};
  try{
    if(preflightStream?.getAudioTracks?.().length)microphone=new MediaStream(preflightStream.getAudioTracks());
    else microphone=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
    await send('microphone_ready');microphone.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(!stopped)send('microphone_track_ended')},{once:true}));
    const AC=window.AudioContext||window.webkitAudioContext;if(AC){audioContext=new AC();analyser=audioContext.createAnalyser();analyser.fftSize=1024;audioContext.createMediaStreamSource(microphone).connect(analyser)}
  }catch{await send('microphone_unavailable')}
  if(stopped)return ()=>{camera?.getTracks().forEach(t=>t.stop());try{preflightStream?.getTracks?.().forEach(t=>t.stop())}catch{};document.body.classList.remove('proctored-exam-active')};
  if(camera){
    const video=$('#proctorPreviewVideo')||document.createElement('video');video.srcObject=camera;video.muted=true;video.playsInline=true;await video.play().catch(()=>{});
    const status=$('#proctorCameraStatus');if(status)status.textContent='Kamera faol · yuzingiz markazda bo‘lsin';
    try{
      if(!window.FaceDetection){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/face-detection/face_detection.js';script.onload=resolve;script.onerror=reject;document.head.append(script)})}
      const instance=new window.FaceDetection({locateFile:file=>'/vendor/face-detection/'+file});instance.setOptions({model:'short',minDetectionConfidence:0.62});
      instance.onResults(result=>{
        if(stopped)return;const faces=result.detections||[],n=faces.length,status=$('#proctorCameraStatus'),box=$('.proctor-camera-box');
        if(n===0){if(status)status.textContent='⚠ Yuz ko‘rinmayapti';box?.classList.add('warning');missingStreak++;turnStreak=0;if(missingStreak>=2){send('face_missing');missingStreak=0}}
        else{missingStreak=0}
        if(n>1){if(status)status.textContent='⚠ Kadrda bir nechta yuz';box?.classList.add('warning');send('multiple_faces')}
        if(n===1){
          const away=mediaPipeOffCenter(faces[0])||mediaPipeTurned(faces[0]);
          if(status)status.textContent=away?'⚠ Kameraga qarang':'✓ Yuz aniq · nazorat faol';box?.classList.toggle('warning',away);box?.classList.toggle('ok',!away);
          if(mediaPipeOffCenter(faces[0]))send('face_off_center');
          if(mediaPipeTurned(faces[0])){turnStreak++;if(turnStreak>=2){send('face_turned');turnStreak=0}}else turnStreak=0;
        }
      });detector={kind:'mediapipe',instance};
    }catch{
      try{if('FaceDetector'in window)detector={kind:'native',instance:new FaceDetector({fastMode:true,maxDetectedFaces:2})};else throw Error()}catch{send('face_detector_unavailable')}
    }
    timer=setInterval(async()=>{
      if(stopped||busy)return;busy=true;
      try{
        if(detector&&video.readyState>=2){
          if(detector.kind==='native'){
            const faces=await detector.instance.detect(video),n=faces.length;
            const status=$('#proctorCameraStatus'),box=$('.proctor-camera-box');
            if(n===0){if(status)status.textContent='⚠ Yuz ko‘rinmayapti';box?.classList.add('warning');missingStreak++;if(missingStreak>=2){await send('face_missing');missingStreak=0}}else missingStreak=0;
            if(n>1){if(status)status.textContent='⚠ Kadrda bir nechta yuz';box?.classList.add('warning');await send('multiple_faces')}
            if(n===1){const away=nativeOffCenter(faces[0],video);if(status)status.textContent=away?'⚠ Kameraga qarang':'✓ Yuz aniq · nazorat faol';box?.classList.toggle('warning',away);box?.classList.toggle('ok',!away);if(away)await send('face_off_center')}
          }else await detector.instance.send({image:video});
        }
        if(analyser){const samples=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(samples);let power=0;for(const value of samples)power+=(value-128)**2;const rms=Math.sqrt(power/samples.length)/128;if(rms>.34&&Date.now()-lastSound>20000){lastSound=Date.now();await send('ambient_sound')}}
      }catch{if(detector){detector.instance.close?.();detector=null;await send('face_detector_unavailable')}}finally{busy=false}
    },1500);
  }
  return ()=>{
    if(stopped&&document.body.classList.contains('proctored-exam-active')===false)return;
    stopped=true;clearInterval(timer);detector?.instance.close?.();camera?.getTracks().forEach(t=>t.stop());microphone?.getTracks().forEach(t=>t.stop());audioContext?.close().catch(()=>{});const pv=$('#proctorPreviewVideo');if(pv)pv.srcObject=null;document.body.classList.remove('proctored-exam-active');
    document.removeEventListener('visibilitychange',visibility);document.removeEventListener('fullscreenchange',fullscreen);window.removeEventListener('blur',blur);window.removeEventListener('offline',networkOffline);window.removeEventListener('online',networkOnline);window.removeEventListener('keydown',keydown,true);document.removeEventListener('copy',copyPaste,true);document.removeEventListener('cut',copyPaste,true);document.removeEventListener('paste',copyPaste,true);document.removeEventListener('contextmenu',contextmenu,true);
  };
}
$('#addCourse').onclick=async()=>{try{const [groups,teachers]=await Promise.all([api('/structure?type=group'),api('/teachers')]);modal('Yangi fan qo‘shish','<label>Kod<input name="code" required></label><label>Fan nomi<input name="title" required></label><label>Ta’lim tili<input name="language" value="uz" required></label><label>Kredit<input name="credits" type="number" min="0"></label><label>Fan dasturi HTTPS havolasi<input name="syllabusUrl" type="url"></label><label>Guruh<select name="groupId">'+groups.map(g=>'<option value="'+esc(g._id)+'">'+esc(g.name)+'</option>').join('')+'</select></label><label>O‘qituvchi<select name="teacherId">'+teachers.map(t=>'<option value="'+esc(t._id)+'">'+esc(t.fullName)+'</option>').join('')+'</select></label>',async d=>{await api('/lms/courses',{method:'POST',body:JSON.stringify(d)});loadCourses()})}catch(e){toast(e.message)}};
$('#reviewGrades').onclick=async()=>{try{const rows=await api('/lms/grade-changes');$('#courseDetail').innerHTML='<article><h2>Kutilayotgan baho so‘rovlari</h2>'+rows.map(r=>'<div class="lesson-row"><div><b>'+esc(r.requestedBy?.fullName||'')+'</b><p>'+esc(r.oldScore)+' → '+esc(r.newScore)+' · '+esc(r.reason)+'</p></div><button data-review="'+esc(r._id)+'" data-decision="approved">Tasdiqlash</button><button data-review="'+esc(r._id)+'" data-decision="rejected">Rad etish</button></div>').join('')+'</article>';all('[data-review]').forEach(b=>b.onclick=()=>modal('Baho so‘rovini ko‘rib chiqish','<label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/lms/grade-changes/'+b.dataset.review+'/review',{method:'POST',body:JSON.stringify({...d,decision:b.dataset.decision})});$('#reviewGrades').click()}))}catch(e){toast(e.message)}};
