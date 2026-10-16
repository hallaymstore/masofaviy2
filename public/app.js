import {askConfirmation} from './accessible-confirm.js';
import {classifyFaceDetections,createFaceStateFilter} from './live-proctor-logic.js';
import {createCourseworkUi} from './coursework-ui.js';
import {createPersonalGradesUi} from './personal-grades-ui.js';
import {createLessonHistoryUi} from './lesson-history-ui.js';
import {createGlobalSearchUi} from './global-search-ui.js';
import {coursePlanHtml} from './course-plan-ui.js';
import {openResourceCenter} from './resource-center-ui.js';
import {openQuizComposer} from './quiz-composer.js';
import {createWhiteboard} from './whiteboard.js';
import {mountVirtualLab} from './virtual-lab.js';
import {createUnitsUi} from './units-ui.js';
import {createFormsUi,formBadge,modeBadge,lessonModeOf} from './forms-ui.js';
import {createAcademicEntryWizard} from './academic-entry-wizard.js';
import {createA11y} from './a11y.js';
import {createInclusionUi} from './inclusion-ui.js';
import {createMyBooksUi} from './my-books-ui.js';
import {createLibraryManagerUi} from './library-manager-ui.js';
import {createVoiceAssistant} from './voice-assistant.js';
import {openAudioReader,reader} from './audio-reader.js';
import {refreshServer as refreshSpeech,signedOut as speechSignedOut} from './speech.js';
import {rememberPlayback,readPlayback,playbackResumeSeconds} from './video-playback-state.js';
const $=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)]; let user=null, structureType='faculty', cache={structure:[],analyticsStructures:[]}, effectivePermissions=[], socket=null, activeLessonId='', reportAttendanceCache=[], mediaRoomClient=null, activeLiveSession=null, cameraOn=false, micOn=false, studentCameraGranted=false, studentMicGranted=false, lessonTimer=null,networkTimer=null,chatUnread=0,handRaised=false,raisedHands=new Set(),raisedHandUsers=new Map(),lastLessonPayload=null,autoRejoinTimer=null,autoRejoinAttempt=0,autoRejoinInFlight=false,lastAutoQuality='', captionRecognition=null, captionsEnabled=false, captionMathEnabled=true, captionFinalWords=[], captionClearTimer=null, captionSizeLevel=Number(localStorage.getItem('m2-caption-size')||0), accessibilityEnabled=localStorage.getItem('m2-accessibility')==='1', videoLessonsCache=[], activeVideoId='', commentReplyTo=null, activeWatchPlayer=null, activeWatchKind='', watchProgressTimer=null, watchLastSavedAt=0, watchLastSamplePosition=0, watchLastSampleAt=0, youtubeApiPromise=null, watchSessionSerial=0, videoProgressWrites=new Map(), liveProctorStop=()=>{}, liveProctorStream=null, liveProctorTrack=null, liveProctorStates=new Map(), lastRoomFeedbackAlertAt=0, branding={productName:'HALLAYM EDU',institutionName:'Qarshi davlat texnika universiteti',shortName:'QarDTU',website:'',logoUrl:'',address:'',phone:'',founded:'',legalBasis:'',description:'',lmsUrl:'',repositoryUrl:'',portfolioUrl:'',admissionsUrl:''};
const courseTopicFocus=new Map();
localStorage.removeItem('token');
const deviceMem=Number(navigator.deviceMemory||0),deviceCores=Number(navigator.hardwareConcurrency||0),androidMajor=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
const ultraLiteUI=Boolean((deviceMem&&deviceMem<=2)||(deviceCores&&deviceCores<=2)||(androidMajor&&androidMajor<=8));
const lowEndUI=Boolean(ultraLiteUI||(deviceMem&&deviceMem<=4)||(deviceCores&&deviceCores<=4)||!window.SVGSVGElement);
document.documentElement.classList.toggle('low-end-device',lowEndUI);
document.documentElement.classList.toggle('ultra-lite-device',ultraLiteUI);
const roleName={superadmin:'Bosh administrator',admin:'Administrator',tech:'Texnik xodim',rectorate:'Rektorat',dean:'Dekan',department:'Kafedra mudiri',teacher:'O‘qituvchi',student:'Talaba',tutor:'Tyutor',staff:'Xodim',librarian:'Kutubxonachi'};
const can=p=>effectivePermissions.includes('*')||effectivePermissions.includes(p);
const moduleOn=name=>branding?.modules?.[name]!==false;
const csrf=()=>document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('m2_csrf='))?.slice('m2_csrf='.length)||'';
const api=async(path,options={})=>{const {timeoutMs,...fetchOptions}=options;const ctl=timeoutMs&&typeof AbortController!=='undefined'?new AbortController():null,abortTimer=ctl?setTimeout(()=>ctl.abort(),timeoutMs):null;let r;try{r=await fetch('/api'+path,{...fetchOptions,...(ctl?{signal:ctl.signal}:{}),credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf(),...fetchOptions.headers}})}catch(e){if(e?.name==='AbortError')throw Object.assign(Error('Server javob bermadi. Internet aloqasini tekshiring.'),{status:0,timeout:true});throw e}finally{clearTimeout(abortTimer)}const data=await r.json().catch(()=>({}));if(r.status===401){logout();throw Error(data.message)}if(!r.ok){const message=data.message||data.error||('Server xatosi: HTTP '+r.status+' · '+path);console.error('API request failed',path,r.status,data);throw Object.assign(Error(message),{status:r.status})}return data};
const toast=t=>{const e=$('#toast');if(!e)return;e.textContent=String(t||'Xatolik tafsiloti aniqlanmadi');e.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>e.classList.remove('show'),6500)}; const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const a11y=createA11y({api,toast}); // accessibility panel: available on the login screen and every page
const myBooksUi=createMyBooksUi({api,toast,esc,csrf,currentUser:()=>user,announce:text=>{toast(text);a11y.announce(text)}});
const libraryManagerUi=createLibraryManagerUi({api,toast,esc,csrf});
const voiceAssistant=createVoiceAssistant({go,currentUser:()=>user,logout,a11y,myBooks:myBooksUi});
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

const iconPaths={access:'<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v5M12 15l-3.5 6M12 15l3.5 6"/>',hand:'<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7"/><path d="M8 13V9.5a1.5 1.5 0 0 0-3 0V14a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-2"/>',more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',star:'<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9Z"/>',clipboard:'<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',layers:'<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',exam:'<path d="M12 3 4 6.5v5.2c0 4.4 3.3 8.3 8 9.3 4.7-1 8-4.9 8-9.3V6.5Z"/><path d="m9 12 2 2 4-4"/>',home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',chart:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/>',building:'<path d="M4 21V7l8-4 8 4v14"/><path d="M8 10h2M14 10h2M8 14h2M14 14h2M9 21v-4h6v4"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',video:'<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>',flask:'<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3"/><path d="M7 15h10"/>',board:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20l4-4 4 4M7 11l3-3 3 3 4-4"/>',library:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8M8 12h6"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',camera:'<path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9H3V9a2 2 0 0 1 2-2h3l1.5-3z"/><circle cx="12" cy="12" r="3"/>',refresh:'<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>',plus:'<path d="M12 5v14M5 12h14"/>',back:'<path d="m15 18-6-6 6-6"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',screen:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',phoneOff:'<path d="M3 3l18 18"/><path d="M16 16.7c-4.6 1.2-9.3-3.4-8-8L5.4 6.1 2 8c0 7.7 6.3 14 14 14l1.9-3.4z"/>',send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',play:'<path d="m9 7 8 5-8 5z"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',cap:'<path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12.5V17c3.5 2 8.5 2 12 0v-4.5"/><path d="M22 10v6"/>',book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8M8 12h6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',external:'<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>'};
function icon(name,fallback='•'){if(!window.SVGSVGElement)return '<span class="fallback-icon" aria-hidden="true">'+esc(fallback)+'</span>';return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[name]||iconPaths.home)+'</svg>'}
function hydrateIcons(root=document){root.querySelectorAll?.('[data-ico]').forEach(function(el){el.innerHTML=icon(el.dataset.ico,el.dataset.fallback||'•')})}
function resetPasswordVisibility(){const inp=$('#passwordInput'),b=$('#passwordToggle');if(inp)inp.type='password';if(b){b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Parolni ko‘rsatish')}}
function logout(){if(activeVideoId)clearWatchPage();reader.current?.close();voiceAssistant.afterLogout();speechSignedOut();a11y.signedOut();if(activeLessonId||mediaRoomClient)leaveConference(false).catch(()=>{});resetPasswordVisibility();fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf()}}).catch(()=>{});user=null;socket?.disconnect();$('#shell').classList.add('hidden');$('#login').classList.remove('hidden')}
function configureRoleUI(){const role=user.role;document.documentElement.dataset.userRole=role;$('#roleLabel').textContent=roleName[role]||role;$('#headerName').textContent=user.fullName||user.login||'';const show={analytics:moduleOn('analytics')&&can('analytics.view'),structure:can('structure.manage')||['dean','department'].includes(role),users:can('users.manage'),reports:moduleOn('reports')&&can('reports.view'),live:moduleOn('live')&&(['teacher','student'].includes(role)||can('lessons.monitor')||can('lessons.support')||can('live.manage')),history:['teacher','admin','superadmin','rectorate','dean','department','tutor'].includes(role),videos:moduleOn('videos')&&(can('videos.view')||can('videos.manage')||can('videos.upload')),courses:['student','teacher','admin','superadmin','tech','rectorate','dean','department','tutor'].includes(role),grades:['student','teacher','admin','superadmin','rectorate','dean','department','tutor'].includes(role),finalExams:moduleOn('finalExams')&&['student','teacher','admin','superadmin'].includes(role),curriculum:moduleOn('curriculum')&&['student','teacher','admin','superadmin'].includes(role),library:moduleOn('library'),myBooks:true,libraryManage:moduleOn('library')&&can('library.manage'),communications:moduleOn('communications')&&['student','teacher','admin','superadmin'].includes(role),settings:['admin','superadmin'].includes(role),schedule:!['staff','librarian'].includes(role),search:role!=='staff',dashboard:true,eduForms:['admin','superadmin','tech','rectorate','dean','department','tutor'].includes(role),units:true,workspace:role!=='student',myRequests:true,inclusion:true};$('#openLibraryManager')?.classList.toggle('hidden',!show.libraryManage);Object.entries(show).forEach(([page,ok])=>{all(`nav button[data-page="${page}"]`).forEach(b=>b.classList.toggle('hidden',!ok))});if($('#openLessonHistoryFromLive'))$('#openLessonHistoryFromLive').classList.toggle('hidden',!show.history);if($('#gradeNavLabel'))$('#gradeNavLabel').textContent=role==='student'?'Mening baholarim':'Elektron jurnal';$('#teacherCourseCreate')?.classList.toggle('hidden',role!=='teacher');$('#addCourse')?.classList.toggle('hidden',!['superadmin','admin','tech','rectorate','dean','department','tutor'].includes(role));$('#subjectCatalogAdd')?.classList.toggle('hidden',!['superadmin','admin','tech','rectorate','dean','department','tutor'].includes(role));$('#reviewGrades')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#myAcademic')?.classList.toggle('hidden',role!=='student');$('#manageAcademic')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#addLibraryItem')?.classList.toggle('hidden',!['teacher','admin','superadmin'].includes(role));$('#addFinalExam')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#importCurriculum')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#dashboardAddSchedule')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleAdminActions')?.classList.toggle('hidden',!can('schedule.manage'));$('#scheduleFilters')?.classList.toggle('hidden',!can('schedule.manage'));$('#usersAdminActions')?.classList.toggle('hidden',!can('users.manage'));$('#addStructure')?.classList.toggle('hidden',!can('structure.manage'));$('#onlinePanel')?.classList.toggle('hidden',!can('lessons.monitor'));$('#monitoringPanel')?.classList.toggle('hidden',!['admin','superadmin'].includes(role));$('#addVideoLesson')?.classList.toggle('hidden',!(can('videos.manage')||can('videos.upload')));hydrateIcons();}
let unitsUiInstance=null,formsUiInstance=null;
const formsUi=()=>formsUiInstance||(formsUiInstance=createFormsUi({api,toast,esc,go:(page,skip)=>go(page,skip),currentUser:()=>user}));
let inclusionUiInstance=null;
const inclusionUi=()=>inclusionUiInstance||(inclusionUiInstance=createInclusionUi({api,toast,esc,currentUser:()=>user,enterLive:id=>enterLiveRoom(id),openA11y:()=>a11y.open()}));
const unitsUi=()=>unitsUiInstance||(unitsUiInstance=createUnitsUi({api,toast,esc,csrf,go:(page,skip)=>go(page,skip),currentUser:()=>user}));
function go(id,skipLoad=false){if(id!=='videoWatch'&&activeVideoId){clearWatchPage();if(location.hash.startsWith('#video='))history.replaceState({},'',location.pathname+location.search)}reader.current?.close();if(id!=='units'&&location.hash.startsWith('#unit='))history.replaceState({},'',location.pathname+location.search);if(id!=='courses'&&id!=='editor'&&location.hash.startsWith('#course='))history.replaceState({},'',location.pathname+location.search);all('.page').forEach(x=>x.classList.toggle('active',x.id===id));all('nav button').forEach(x=>{const on=x.dataset.page===id;x.classList.toggle('active',on);if(on)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});document.documentElement.dataset.page=id;const activeBtn=document.querySelector('nav button[data-page="'+id+'"]');activeBtn?.closest('details')?.setAttribute('open','');$('#sidebar').classList.remove('open');$('#sidebarBackdrop')?.classList.remove('show');$('#menuBtn')?.setAttribute('aria-expanded','false');const load=skipLoad?null:({dashboard:loadDashboard,search:loadGlobalSearch,university:loadUniversity,analytics:loadAnalytics,structure:loadStructure,schedule:loadSchedules,users:loadUsers,live:loadLiveRooms,history:loadLessonHistory,videos:loadVideoLessons,courses:loadCourses,grades:loadGradePage,finalExams:loadFinalExams,curriculum:loadCurricula,library:loadLibrary,libraryManage:()=>libraryManagerUi.render(),myBooks:()=>myBooksUi.render(),lab:loadLab,units:()=>unitsUi().renderUnits(),eduForms:()=>formsUi().renderOverview(),inclusion:()=>inclusionUi().render(),workspace:()=>unitsUi().renderWorkspace(),myRequests:()=>unitsUi().renderMyRequests(),communications:loadCommunications,reports:loadReports,settings:loadInstitutionSettings,profile:loadProfile}[id]||(()=>{}))();hydrateIcons();syncFloatCam();document.dispatchEvent(new CustomEvent('hx:navigate',{detail:{page:id,ready:load}}));return load}
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installPwaBtn')?.classList.remove('hidden')});
$('#installPwaBtn')?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return toast('Ilovani brauzer menyusidan o‘rnatish mumkin');deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice.catch(()=>{});deferredInstallPrompt=null;$('#installPwaBtn')?.classList.add('hidden')});
window.addEventListener('appinstalled',()=>{$('#installPwaBtn')?.classList.add('hidden');toast('HALLAYM EDU ilovasi o‘rnatildi')});
async function start(){try{await loadBranding();const x=await api('/me');user=x.user;effectivePermissions=x.effectivePermissions||[];$('#login').classList.add('hidden');$('#shell').classList.remove('hidden');configureRoleUI();hydrateIcons();await a11y.syncFromServer();await refreshSpeech();void voiceAssistant.afterLogin();await loadDashboard();if(user.role==='librarian')go('libraryManage');connectSocket();const deep=location.hash.startsWith('#video=')?decodeURIComponent(location.hash.slice(7)):'';if(deep&&!user.mustChangePassword){await loadVideoLessons();await openVideoLesson(deep,false)}
  const courseDeep=location.hash.startsWith('#course=')?decodeURIComponent(location.hash.slice(8)):'';
  if(courseDeep&&!user.mustChangePassword){go('courses',true);await loadCourses();await openCourse(courseDeep,false)}
  if(location.hash.startsWith('#unit=')&&!user.mustChangePassword)go('units');
  if(location.hash.startsWith('#checkin=')&&!user.mustChangePassword)await formsUi().handleCheckinHash();if(user.role==='student'&&!activeLessonId&&!deep){setTimeout(async()=>{try{const lr=await api('/live/rooms'),room=(lr.rooms||[]).find(r=>r.session?.status==='active'&&r.canJoin);if(room)await enterLiveRoom(String(room.schedule._id))}catch{}},500)}if(user.mustChangePassword&&user._id!=='demo')setTimeout(()=>{go('profile');toast('Xavfsizlik uchun vaqtinchalik parolni almashtiring')},250)}catch{logout()}}
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
$('#loginForm').onsubmit=async e=>{e.preventDefault();resetPasswordVisibility();const f=new FormData(e.target),sb=e.target.querySelector('.login-submit');if(sb?.disabled)return;if(sb){sb.disabled=true;sb.setAttribute('aria-busy','true')}try{const result=await api('/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(f))});if(result.twoFactorRequired){$('#loginOtpWrap').classList.remove('hidden');$('#loginError').textContent=result.message||'2 bosqichli kodni kiriting';e.target.elements.otp.focus();return}$('#loginOtpWrap').classList.add('hidden');$('#loginError').textContent='';if(sb){sb.disabled=false;sb.removeAttribute('aria-busy')}if(result.faceDemoRequired)await runDemoFaceGate();start()}catch(err){$('#loginError').textContent=err.message}finally{if(sb){sb.disabled=false;sb.removeAttribute('aria-busy')}}};
all('nav button[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));all('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));$('#menuBtn').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#sidebarBackdrop')?.classList.toggle('show',open);$('#menuBtn').setAttribute('aria-expanded',String(open))};$('#hxMenuTab')?.addEventListener('click',()=>$('#menuBtn').click());$('#passwordToggle')?.addEventListener('click',e=>{const b=e.currentTarget,inp=$('#passwordInput');if(!inp)return;const show=inp.type==='password';inp.type=show?'text':'password';b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',show?'Parolni yashirish':'Parolni ko‘rsatish');inp.focus()});$('#sidebarBackdrop')?.addEventListener('click',()=>{$('#sidebar').classList.remove('open');$('#sidebarBackdrop').classList.remove('show');$('#menuBtn')?.setAttribute('aria-expanded','false')});$('#logoutBtn').onclick=logout;$('#profileBtn').onclick=()=>go('profile');const applyTheme=t=>{document.documentElement.dataset.theme=t==='dark'?'dark':'';localStorage.theme=t==='dark'?'dark':'';const b=$('#themeBtn');if(b){b.textContent=t==='dark'?'☀':'◐';b.title=t==='dark'?'Kunduzgi rejim':'Tungi rejim'}};$('#themeBtn').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');applyTheme(localStorage.theme==='dark'?'dark':'light');
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
for(const [inputId,kind,field] of [['brandingLogoFile','logo','logoUrl'],['brandingIconFile','icon','appIconUrl']]){
  document.getElementById(inputId)?.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>6*1024*1024)return toast('Rasm hajmi 6 MB dan oshmasin');
    const body=new FormData();body.append('file',file);
    try{
      const result=await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('POST','/api/admin/branding-media/'+kind);
        xhr.withCredentials=true;xhr.setRequestHeader('X-CSRF-Token',csrf());
        xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText)}catch{};xhr.status>=200&&xhr.status<300?resolve(data):reject(Error(data.message||'Rasm yuklanmadi'))};
        xhr.onerror=()=>reject(Error('Serverga ulanishda xato'));xhr.send(body);
      });
      $('#institutionSettingsForm').elements[field].value=result.url;
      branding[field]=result.url;applyBranding();
      toast(kind==='logo'?'Universitet logotipi saqlandi':'PWA ikonasi saqlandi');
    }catch(error){toast(error.message)}
  });
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
  const cfg=role==='staff'?['Xodim ish stoli','Bo‘limingizdagi murojaatlar, vazifalar va e’lonlar','Yangi murojaatlarni «Ish joyim» sahifasida qabul qiling va muddatida yoping.']:role==='teacher'?['O‘qituvchi ish stoli','Bugungi darslaringiz, guruhlaringiz va davomat holati','Darsga kirishdan oldin kamera va mikrofonni bir ko‘rib oling.']:role==='student'?['Talaba bosh sahifasi','Bugungi darslar va shaxsiy davomat ko‘rsatkichlaringiz','Bugungi dars vaqtlarini shu yerda tekshirib olasiz.']:['Boshqaruv markazi',x.scope?x.scope+' bo‘yicha bugungi ta’lim jarayoni':'Bugungi ta’lim jarayonini bir joydan kuzating','Avval tuzilma va akkauntlarni tayyorlang, so‘ng jadvalni biriktiring.'];
  $('#dashboardTitle').textContent=cfg[0];$('#dashboardSubtitle').textContent=cfg[1];$('#dashboardGuide').textContent=cfg[2];
  if(role==='student')formsUi().mountStudentCheckin($('#eduCheckin'));else if($('#eduCheckin'))$('#eduCheckin').hidden=true;
  $('#stats').innerHTML=(x.stats||[]).map(i=>'<div class="stat"><b>'+esc(i.value)+'</b><span>'+esc(i.label)+'</span></div>').join('');
  $('#todayLessons').innerHTML=(x.today||[]).slice(0,8).map(scheduleRow).join('')||'<p>Bugun uchun dars topilmadi.</p>';bindScheduleActions();
  const q=$('#quickManagement');
  q.innerHTML=role==='staff'?'<button data-go="workspace"><b>'+icon('clipboard','📋')+' Ish joyim</b><span>Murojaatlar, vazifalar va e’lonlar</span></button><button data-go="units"><b>'+icon('grid','▦')+' Universitet bo‘limlari</b><span>Barcha bo‘lim va xizmatlar</span></button><button data-go="myRequests"><b>'+icon('layers','▤')+' Murojaatlarim</b><span>Yuborgan arizalaringiz holati</span></button>':role==='teacher'?'<button data-go="schedule"><b>'+icon('calendar','📅')+' Mening jadvalim</b><span>Haftalik darslaringiz</span></button><button data-go="live"><b>'+icon('video','🎥')+' Guruh darslari</b><span>Jonli xonalarni boshlash va boshqarish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Videodarslar</b><span>Kurs va guruhlarga materiallar</span></button>':role==='student'?'<button data-go="schedule"><b>'+icon('calendar','📅')+' Dars jadvalim</b><span>Guruhingiz haftalik rejasi</span></button><button data-go="live"><b>'+icon('video','🎥')+' Jonli darslar</b><span>Faqat o‘z guruhingiz xonasiga kirish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Tavsiya videolar</b><span>Kurs va yo‘nalishingizga mos</span></button>':'<button data-go="analytics"><b>'+icon('chart','📈')+' Statistika markazi</b><span>Davomat, guruh va o‘qituvchi ko‘rsatkichlari</span></button><button data-go="live"><b>'+icon('video','🎥')+' Jonli guruhlar</b><span>Parallel darslarni real vaqtda ko‘rish</span></button><button data-go="videos"><b>'+icon('library','▶')+' Videodarslar</b><span>Kurs va yo‘nalishlarga kontent</span></button>';
  q.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));hydrateIcons(q);
  const health=$('#dashboardHealth'),readiness=$('#presentationReadiness');
  if(['superadmin','admin','tech'].includes(role)){
    try{
      const [m,media]=await Promise.all([api('/system/metrics'),api('/media/status').catch(()=>null)]);
      const node=media?.cluster?.nodes?.find(x=>x.online)||media?.cluster?.nodes?.[0],mh=node?.health||{},cap=mh.capacity||{};
      health.classList.remove('hidden');
      health.innerHTML='<b>Tizim holati</b>'+
        '<span class="health-ok">DB '+esc(m.database==='connected'?'● ON':'○ OFF')+'</span>'+
        '<span>Onlayn <b>'+esc(m.onlineUsers)+'</b></span>'+
        '<span>Live <b>'+esc(m.activeLiveRooms||0)+'</b></span>'+
        '<span>Socket <b>'+esc(m.socketConnections)+'</b></span>'+
        '<span class="'+(media?.cluster?.online?'health-ok':'health-bad')+'">SFU '+(media?.cluster?.online?'● ON':'○ OFF')+'</span>'+
        '<span>Worker <b>'+esc(mh.workers??'—')+'</b></span>'+
        '<span>Target <b>'+esc(cap.targetParallelRooms??'—')+' xona</b></span>'+
        '<span>RTC <b>'+esc((mh.rtcPorts||[]).join(', ')||'—')+'</b></span>'+
        '<span class="'+(media?.turnEnabled?'health-ok':'health-bad')+'">TURN '+(media?.turnEnabled?'● ON':'○ OFF')+'</span>'+
        '<span>APP RAM <b>'+esc(m.memory?.rssMB||0)+' MB</b></span>'+
        '<span>Uptime <b>'+esc(Math.floor((m.uptimeSeconds||0)/60))+' min</b></span>';
    }catch{health.classList.add('hidden')}
  }else health.classList.add('hidden');
  if(['superadmin','admin','tech','rectorate'].includes(role)){
    try{const [p,e]=await Promise.all([api('/presentation/readiness'),api('/evaluation/readiness')]);readiness.classList.remove('hidden');readiness.innerHTML='<div class="section-title"><div><h2>Tekshiruv tayyorligi</h2><small>Amaldagi LMS mezonlari bo‘yicha tizimdagi dalillar</small></div><b class="readiness-score">'+esc(e.percent)+'%</b></div><div class="evaluation-readiness">'+(e.criteria||[]).map(x=>'<div class="evaluation-row '+(x.ready?'ready':x.external?'external':'pending')+'"><span class="evaluation-no">'+esc(x.no)+'</span><div><b>'+esc(x.title)+'</b><small>'+esc(x.evidence)+'</small></div><strong>'+(x.ready?'Mavjud':x.external?'Tashqi hujjat':'Tayyorlanmoqda')+'</strong></div>').join('')+'</div><details class="presentation-readiness-details"><summary>Demo ma’lumotlar qamrovi · '+esc(p.percent)+'%</summary><div class="readiness-grid">'+(p.checks||[]).map(x=>'<div class="'+(x.ready?'ready':'pending')+'"><span>'+esc(x.label)+'</span><b>'+esc(x.value)+' / '+esc(x.target)+'</b></div>').join('')+'</div></details>'}catch{readiness.classList.add('hidden')}
  }else readiness.classList.add('hidden')
}
function scheduleRow(i){
  const group=i.groupId?.name||'',gid=i.groupId?.externalId||i.groupId?.code||'',teacher=i.teacherId?.fullName||'',canJoin=['teacher','student'].includes(user?.role)||can('lessons.monitor');
  let actions='';
  const mode=lessonModeOf(i),form=i.groupId?.educationForm||'';
  if(canJoin&&i.kind!=='final_exam'&&mode!=='offline')actions+='<button class="join-btn" data-join-lesson="'+esc(i._id)+'">'+(mode==='hybrid'?'Jonli efir':'Kirish')+'</button>';
  if(i.kind!=='final_exam'&&mode!=='online'&&(user?.role==='teacher'&&String(i.teacherId?._id||i.teacherId)===String(user._id||user.id)||can('attendance.manage')&&user?.role!=='teacher'))actions+='<button class="join-btn edu-att-btn" data-edu-att="'+esc(i._id)+'">Davomat</button>';
  if(can('schedule.manage'))actions+='<button class="ghost danger-text" data-del-schedule="'+esc(i._id)+'">O‘chirish</button>';
  const kindLabel={lecture:'Ma’ruza',practice:'Amaliyot',seminar:'Seminar',exam:'Nazorat',final_exam:'Yakuniy'}[i.kind]||'Dars';
  return '<div data-search-item="'+esc(i._id)+'" class="lesson-row lesson-kind-'+esc(i.kind||'lecture')+'"><div class="lesson-time"><b>'+esc(i.start)+'</b><span>'+esc(i.end)+'</span></div><div class="lesson-info"><div class="lesson-title-line"><b>'+esc(i.title)+'</b><span class="lesson-kind">'+esc(kindLabel)+'</span></div><small>'+esc(i.subject||'Fan')+(group?' · '+esc(group):'')+(teacher?' · '+esc(teacher):'')+'</small><div class="lesson-meta">'+(gid?'<span>ID: '+esc(gid)+'</span>':'')+(i.room?'<span>'+esc(i.room)+'-xona</span>':'')+modeBadge(mode)+(form?formBadge(form):'')+'</div></div><div class="row-actions">'+actions+'</div></div>';
}
function bindScheduleActions(){
  all('[data-del-schedule]').forEach(function(b){b.onclick=async function(){if(await askConfirmation('Dars o‘chirilsinmi?')){try{await api('/schedules/'+b.dataset.delSchedule,{method:'DELETE'});loadSchedules()}catch(e){toast(e.message)}}}});
  all('[data-join-lesson]').forEach(function(b){b.onclick=function(){joinLesson(b.dataset.joinLesson)}});
  all('[data-edu-att]').forEach(function(b){b.onclick=function(){formsUi().openAttendance(b.dataset.eduAtt)}});
}
function joinLesson(id){enterLiveRoom(id)}
all('.tabs button').forEach(b=>b.onclick=()=>{all('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');structureType=b.dataset.type;loadStructure()});
async function loadStructure(){if(!can('structure.manage')&&!['dean','department'].includes(user.role))return;cache.structure=await api('/structure');const rows=cache.structure.filter(x=>x.type===structureType&&x.active),byId=Object.fromEntries(cache.structure.map(x=>[String(x._id),x]));$('#structureList').innerHTML=rows.map(x=>{const p=byId[String(x.parentId||'')],pp=p?byId[String(p.parentId||'')]:null,parentLine=structureType==='department'?(p?.name||'Fakultet biriktirilmagan'):structureType==='group'?([pp?.name,p?.name].filter(Boolean).join(' → ')||'Kafedra biriktirilmagan'):'';return `<div data-search-item="${esc(x._id)}"><small>ID: ${esc(x.externalId||x.code||x._id)}</small><h2>${esc(x.name)}</h2>${parentLine?`<p class="structure-parent">${esc(parentLine)}</p>`:''}${structureType==='group'?`<p class="structure-edu">${formBadge(x.educationForm||'kunduzgi')}${x.shift?`<span class="ef-badge">${x.shift===3?'Kechki smena':x.shift+'-smena'}</span>`:''}${x.courseYear?`<span class="ef-badge">${x.courseYear}-kurs</span>`:''}</p><button data-edu-group="${x._id}">Ta’lim shakli</button>`:''}${can('structure.manage')?`<button data-del-structure="${x._id}">Arxivlash</button>`:''}</div>`}).join('')||'<div class="empty"><b>Hozircha ma’lumot kiritilmagan</b><p>“+ Yangi” tugmasi orqali birinchi bo‘limni yarating.</p></div>';all('[data-edu-group]').forEach(b=>b.onclick=()=>{const g=cache.structure.find(x=>String(x._id)===b.dataset.eduGroup);if(g)formsUi().groupEditor({...g,_id:String(g._id),educationForm:g.educationForm||'kunduzgi',sessions:g.sessions||[]},loadStructure)});all('[data-del-structure]').forEach(b=>b.onclick=async()=>{if(await askConfirmation('Arxivga o‘tkazilsinmi?')){try{await api('/structure/'+b.dataset.delStructure,{method:'DELETE'});loadStructure()}catch(e){toast(e.message)}}})}
let editorReturnPage='dashboard',editorReturnCourseId='';
function closeEditor(){
  if(document.body.classList.contains('proctored-exam-active')){toast('Nazoratli testni yakunlamasdan chiqib bo‘lmaydi');return}
  const editor=$('#editor');
  editor?.dispatchEvent(new Event('close'));
  const courseId=editorReturnCourseId;editorReturnCourseId='';
  if(editorReturnPage==='courses'&&courseId){go('courses',true);openCourse(courseId,false)}
  else go(editorReturnPage||'dashboard');
}
function modal(title,fields,onSave){
  const active=document.querySelector('.page.active');
  if(active?.id&&active.id!=='editor'){
    editorReturnPage=active.id;
    editorReturnCourseId=active.id==='courses'&&$('#courseList')?.hidden
      ?String($('#courseDetail article[data-search-item]')?.dataset.searchItem||''):'';
  }
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
$('#addStructure').onclick=async()=>{if(!cache.structure.length)cache.structure=await api('/structure');const parents=cache.structure.filter(x=>x.active&&(structureType==='department'?x.type==='faculty':structureType==='group'?x.type==='department':false));modal('Yangi '+({faculty:'fakultet',department:'kafedra',group:'guruh'}[structureType]),`<label>Nomi<input name="name" required></label><label>ID<input name="externalId" ${structureType==='group'?'required':''} placeholder="Masalan: ATT-101"></label>${structureType==='group'?`<label>Ta’lim shakli<select name="educationForm"><option value="kunduzgi">☀️ Kunduzgi</option><option value="kechki">🌙 Kechki</option><option value="sirtqi">📮 Sirtqi</option><option value="masofaviy">🌐 Masofaviy</option></select></label><label>Smena<select name="shift"><option value="">—</option><option value="1">1-smena</option><option value="2">2-smena</option><option value="3">Kechki smena</option></select></label><label>Kurs<select name="courseYear"><option value="">—</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label>`:''}${structureType==='faculty'?'':`<label>Yuqori bo‘lim<select name="parentId" required><option value="">Tanlang</option>${parents.map(x=>`<option value="${x._id}">${esc(x.name)}</option>`)}</select></label>`}`,async d=>{await api('/structure',{method:'POST',body:JSON.stringify({...d,type:structureType})});loadStructure()})};
let scheduleRowsCache=[],scheduleViewMode='week',scheduleScopeMode='group',scheduleScopeKey='';
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
function scheduleEntityKey(x){
  if(!x)return '';
  if(typeof x==='string')return String(x);
  return String(x._id||x.externalId||x.code||x.login||x.name||'');
}
function scheduleEntityLabel(x,fallback='—'){
  if(!x)return fallback;
  if(typeof x==='string')return x;
  return x.name||x.fullName||x.externalId||x.code||x.login||fallback;
}
function scheduleDayNames(){return ['','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba','Yakshanba']}
function scheduleKindLabel(kind){return {lecture:'Ma’ruza',practice:'Amaliyot',seminar:'Seminar',exam:'Nazorat',final_exam:'Yakuniy'}[kind]||'Dars'}
function scheduleCellLesson(i){
  const group=scheduleEntityLabel(i.groupId,''),teacher=scheduleEntityLabel(i.teacherId,''),canJoin=['teacher','student'].includes(user?.role)||can('lessons.monitor');
  let actions='';
  if(canJoin&&i.kind!=='final_exam')actions+='<button class="sheet-action primary" data-join-lesson="'+esc(i._id)+'">Kirish</button>';
  if(can('schedule.manage'))actions+='<button class="sheet-action ghost danger-text" data-del-schedule="'+esc(i._id)+'">×</button>';
  const secondary=user?.role==='student'?teacher:user?.role==='teacher'?group:[group,teacher].filter(Boolean).join(' · ');
  return '<article data-search-item="'+esc(i._id)+'" class="sheet-lesson lesson-kind-'+esc(i.kind||'lecture')+'">'+
    '<div class="sheet-lesson-top"><span class="sheet-kind">'+esc(scheduleKindLabel(i.kind))+'</span><span class="sheet-room">'+esc(i.room?i.room+'-xona':'')+'</span></div>'+
    '<b>'+esc(i.title||i.subject||'Dars')+'</b>'+
    '<small>'+esc(secondary||i.subject||'')+'</small>'+
    (i.subject&&i.subject!==i.title?'<em>'+esc(i.subject)+'</em>':'')+
    (actions?'<div class="sheet-actions">'+actions+'</div>':'')+
  '</article>';
}
function scopedScheduleRows(rows){
  let out=[...(rows||[])];
  const today=(new Date().getDay()||7);
  if(scheduleViewMode==='today')out=out.filter(x=>Number(x.weekday)===today);
  if(can('schedule.manage')&&scheduleScopeKey){
    if(scheduleScopeMode==='group')out=out.filter(x=>scheduleEntityKey(x.groupId)===scheduleScopeKey);
    if(scheduleScopeMode==='teacher')out=out.filter(x=>scheduleEntityKey(x.teacherId)===scheduleScopeKey);
  }
  return out;
}
function renderScheduleScope(rows){
  const box=$('#scheduleScopeTabs');if(!box)return;
  if(!can('schedule.manage')){
    const label=user?.role==='teacher'?'O‘qituvchi jadvali':'Guruh jadvali';
    box.innerHTML='<span class="schedule-scope-label">'+esc(label)+'</span>';
    return;
  }
  const source=[...(rows||[])];
  const map=new Map();
  for(const r of source){
    const entity=scheduleScopeMode==='teacher'?r.teacherId:r.groupId,key=scheduleEntityKey(entity);
    if(key&&!map.has(key))map.set(key,{key,label:scheduleEntityLabel(entity),count:0});
    if(key)map.get(key).count++;
  }
  const items=[...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'uz'));
  if(scheduleScopeMode!=='all'&&!scheduleScopeKey&&items.length)scheduleScopeKey=items[0].key;
  box.innerHTML='<div class="schedule-scope-modes">'+
    '<button type="button" data-scope-mode="group" class="'+(scheduleScopeMode==='group'?'active':'')+'">Guruhlar</button>'+
    '<button type="button" data-scope-mode="teacher" class="'+(scheduleScopeMode==='teacher'?'active':'')+'">O‘qituvchilar</button>'+
    '<button type="button" data-scope-mode="all" class="'+(scheduleScopeMode==='all'?'active':'')+'">Umumiy</button>'+
    '</div>'+
    (scheduleScopeMode==='all'?'':('<div class="schedule-scope-tabs">'+items.map(x=>'<button type="button" data-scope-key="'+esc(x.key)+'" class="'+(scheduleScopeKey===x.key?'active':'')+'"><b>'+esc(x.label)+'</b><span>'+x.count+'</span></button>').join('')+'</div>'));
  box.querySelectorAll('[data-scope-mode]').forEach(b=>b.onclick=()=>{
    scheduleScopeMode=b.dataset.scopeMode;scheduleScopeKey='';renderScheduleWorkspace();
  });
  box.querySelectorAll('[data-scope-key]').forEach(b=>b.onclick=()=>{
    scheduleScopeKey=b.dataset.scopeKey;renderScheduleWorkspace();
  });
}
function renderScheduleSummary(rows){
  const box=$('#scheduleSummary');if(!box)return;
  const scoped=scopedScheduleRows(rows),days=new Set(scoped.map(x=>Number(x.weekday)).filter(x=>x>=1&&x<=6));
  const groups=new Set(scoped.map(x=>scheduleEntityKey(x.groupId)).filter(Boolean));
  const teachers=new Set(scoped.map(x=>scheduleEntityKey(x.teacherId)).filter(Boolean));
  box.innerHTML='<span><b>'+scoped.length+'</b><small>dars</small></span><span><b>'+days.size+'</b><small>kun</small></span>'+
    (user?.role==='student'?'':('<span><b>'+groups.size+'</b><small>guruh</small></span>'))+
    (user?.role==='teacher'?'':('<span><b>'+teachers.size+'</b><small>o‘qituvchi</small></span>'));
}
function renderScheduleSheet(rows){
  const scoped=scopedScheduleRows(rows);
  if(!scoped.length)return '<div class="empty schedule-empty"><b>Tanlangan ko‘rinishda dars topilmadi</b><p>Guruh/o‘qituvchi tabini yoki filtrni almashtiring.</p></div>';
  const days=scheduleViewMode==='today'?[(new Date().getDay()||7)]:[1,2,3,4,5,6];
  const dayNames=scheduleDayNames(),today=(new Date().getDay()||7);
  const starts=[...new Set(scoped.map(x=>String(x.start||'')).filter(Boolean))].sort();
  const rowsBySlot=new Map();
  for(const r of scoped){
    const key=String(r.start||'');if(!rowsBySlot.has(key))rowsBySlot.set(key,new Map());
    const dm=rowsBySlot.get(key),day=Number(r.weekday);if(!dm.has(day))dm.set(day,[]);dm.get(day).push(r);
  }
  const header='<div class="sheet-row sheet-head"><div class="sheet-time-head">Vaqt</div>'+days.map(d=>'<div class="sheet-day-head '+(d===today?'is-today':'')+'"><b>'+esc(dayNames[d])+'</b><span>'+scoped.filter(x=>Number(x.weekday)===d).length+' dars</span></div>').join('')+'</div>';
  const body=starts.map(start=>{
    const dm=rowsBySlot.get(start)||new Map();
    const end=[...dm.values()].flat()[0]?.end||'';
    return '<div class="sheet-row"><div class="sheet-time"><b>'+esc(start)+'</b><span>'+esc(end)+'</span></div>'+
      days.map(d=>'<div class="sheet-cell '+(d===today?'is-today':'')+'">'+(dm.get(d)||[]).sort((a,b)=>String(a.title).localeCompare(String(b.title),'uz')).map(scheduleCellLesson).join('')+'</div>').join('')+
    '</div>';
  }).join('');
  return '<div class="schedule-sheet" style="--schedule-days:'+days.length+'">'+header+body+'</div>';
}
function renderScheduleWorkspace(){
  renderScheduleScope(scheduleRowsCache);
  renderScheduleSummary(scheduleRowsCache);
  const host=$('#scheduleList');if(host)host.innerHTML=renderScheduleSheet(scheduleRowsCache);
  document.querySelectorAll('[data-schedule-view]').forEach(b=>b.classList.toggle('active',b.dataset.scheduleView===scheduleViewMode));
  bindScheduleActions();
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
    scheduleRowsCache=rows||[];
    if(user?.role==='teacher'){scheduleScopeMode='teacher';scheduleScopeKey=''}
    if(user?.role==='student'){scheduleScopeMode='group';scheduleScopeKey=''}
    renderScheduleWorkspace();
    if(user?.role==='student')await personalGradesUi.schedule($('#studentScheduleGrades'));
    else if($('#studentScheduleGrades'))$('#studentScheduleGrades').hidden=true;
    await buildTimetableLinks();
  }catch(e){toast(e.message)}
}
document.querySelectorAll('[data-schedule-view]').forEach(b=>b.addEventListener('click',()=>{scheduleViewMode=b.dataset.scheduleView||'week';renderScheduleWorkspace()}));
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
$('#addSchedule').onclick=()=>academicEntryWizard.addSchedule();
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
      return '<details data-search-item="'+esc(x._id)+'" class="user-card '+(x.role==='student'?'user-student-free':(x.identityVerifiedAt?'user-verified':'user-unverified'))+'"><summary><div class="user-avatar">'+esc((x.fullName||x.login||'?').trim().charAt(0).toUpperCase())+'</div><div class="user-card-main"><b>'+esc(x.fullName)+'</b><span>@'+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</span><div class="user-quick-meta"><span class="user-meta-chip">'+esc(courseLabel)+'</span><span class="user-meta-chip">'+esc(groupLabel)+'</span><span class="user-meta-direction">'+esc(directionLabel)+'</span></div></div><span class="status '+(x.active?'ok':'blocked')+'">'+(x.active?'Faol':'Blok')+'</span><i>⌄</i></summary><div class="user-card-details"><div class="user-facts"><span><small>Guruh</small><b>'+esc(groupName)+'</b><small>'+esc(groupLabel)+'</small></span><span><small>Kurs</small><b>'+esc(courseLabel)+'</b></span><span><small>Yo‘nalish</small><b>'+esc(directionLabel)+'</b></span><span><small>Oxirgi kirish</small><b>'+(x.lastLoginAt?new Date(x.lastLoginAt).toLocaleString('uz-UZ'):'—')+'</b></span><span><small>2FA</small><b>'+(x.totpEnabled?'Yoqilgan':'—')+'</b></span><span class="identity-status-box '+(x.role==='student'?'free':(x.identityVerifiedAt?'verified':'unverified'))+'"><small>Shaxs tasdig‘i</small><b>'+(x.role==='student'?'Talab qilinmaydi':(x.identityVerifiedAt?'Tasdiqlangan':'Tasdiqlanmagan'))+'</b></span></div><div class="row-actions">'+actions+'</div></div></details>';
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
  if(active&&!await askConfirmation('Foydalanuvchi tizimga kira olmaydi. Bloklansinmi?'))return;
  const note=active?(prompt('Bloklash sababi (ixtiyoriy):','')||''):'';
  try{await api('/users/'+b.dataset.userToggle+'/status',{method:'PATCH',body:JSON.stringify({active:!active,statusNote:note})});toast(active?'Foydalanuvchi bloklandi':'Foydalanuvchi faollashtirildi');loadUsers()}catch(e){toast(e.message)}
}
async function verifyUserIdentity(id){
  modal('OTMda shaxsni tasdiqlash','<p>Bu amal foydalanuvchi OTMga shaxsan kelib, hujjati xodim tomonidan tekshirilganidan keyin bajariladi.</p><label>Hujjat turi<input name="documentType" placeholder="ID karta / pasport" required></label><label>Hujjat oxirgi 2–4 belgisi<input name="documentLast4" maxlength="4" required></label><label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/users/'+id+'/identity-verification',{method:'POST',body:JSON.stringify(d)});toast('Shaxs OTMda tasdiqlandi');loadUsers()});
}
async function unverifyUserIdentity(id){
  if(!await askConfirmation('Shaxs tasdig‘i bekor qilinsa foydalanuvchining faol sessiyalari ham chiqariladi. Davom etilsinmi?'))return;
  try{await api('/users/'+id+'/identity-verification',{method:'DELETE'});toast('Shaxs tasdig‘i bekor qilindi');loadUsers()}catch(e){toast(e.message)}
}
async function resetUserTwoFactor(id){
  if(!await askConfirmation('2FA reset qilinsa authenticator va recovery kodlar bekor bo‘ladi, barcha sessiyalar ham chiqariladi. Davom etilsinmi?'))return;
  try{await api('/users/'+id+'/reset-2fa',{method:'POST'});toast('2FA reset qilindi');loadUsers()}catch(e){toast(e.message)}
}
async function revokeUserSessions(id){
  if(!await askConfirmation('Bu foydalanuvchining barcha qurilmalardagi faol sessiyalari bekor qilinsinmi?'))return;
  try{await api('/users/'+id+'/revoke-sessions',{method:'POST'});toast('Sessiyalar bekor qilindi')}catch(e){toast(e.message)}
}
async function resetUserPassword(id){
  if(!await askConfirmation('Yangi vaqtinchalik parol yaratiladimi?'))return;
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
  if(!await askConfirmation('Barcha mavjud TALABA akkauntlari o‘chiriladi va student001–student040 qayta yaratiladi. Davom etilsinmi?'))return;
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
    const roles=['student','teacher','tutor','staff','librarian','department','dean','rectorate','tech','admin'].concat(user.role==='superadmin'?['superadmin']:[]);
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
    perms.push(['inclusion.manage','Inklyuziv ta’lim koordinatori'],['library.manage','Kutubxonani boshqarish']);
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
    '<label>Rol<select name="role">'+['student','teacher','tutor','staff','librarian','department','dean','rectorate','tech','admin'].map(x=>'<option value="'+x+'">'+esc(roleName[x]||x)+'</option>').join('')+'</select></label>'+
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
async function bulkImport(kind){const file=await chooseFile();if(!file)return;if(file.size>8*1024*1024)return toast('Fayl 8 MB dan katta bo‘lmasin');try{toast('Fayl tekshirilmoqda…');const contentBase64=await fileToBase64(file),endpoint=kind==='users'?'/users/bulk-import':'/schedules/bulk-import';const p=await api(endpoint,{method:'POST',body:JSON.stringify({filename:file.name,contentBase64,dryRun:true})});const errs=(p.errors||[]).slice(0,8).map(e=>e.row+'-qator: '+e.message).join('\n');if(!await askConfirmation('Tekshiruv tugadi.\nJami: '+p.total+'\nTayyor: '+p.valid+'\nXato: '+p.invalid+'\n\n'+(errs||'Xato topilmadi.')+'\n\nImportni davom ettiraymi?'))return;const r=await api(endpoint,{method:'POST',body:JSON.stringify({filename:file.name,contentBase64,dryRun:false})});if(kind==='users'&&r.credentials?.length)downloadCredentials(r.credentials);toast((r.imported||0)+' ta yozuv import qilindi');kind==='users'?loadUsers():loadSchedules()}catch(e){toast(e.message)}}
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
$('#revokeSessions')?.addEventListener('click',async()=>{if(!await askConfirmation('Boshqa qurilmalardagi barcha faol sessiyalar chiqarilsinmi?'))return;try{await api('/auth/revoke-sessions',{method:'POST'});toast('Boshqa sessiyalar bekor qilindi')}catch(e){toast(e.message)}});



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
  if(st==='active'||room.canJoin)return '<span class="live-status active">Jonli</span>';
  if(st==='ended')return '<span class="live-status ended">Yakunlangan</span>';
  return '<span class="live-status waiting">Rejalashtirilgan</span>';
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
      if(r.canJoin)actions+='<button class="primary" data-live-join="'+esc(s._id)+'">'+icon('external','↗')+' Kirish</button>';
      else if(now<startMinute)actions+='<span class="room-note">Avtomatik ochiladi · '+esc(s.start)+'</span>';
      else actions+='<span class="room-note">'+(ended||now>=endMinute?'Vaqti tugagan':'Xona ochilmoqda…')+'</span>';
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

    all('[data-live-join]').forEach(b=>b.onclick=()=>enterLiveRoom(b.dataset.liveJoin));
    hydrateIcons($('#liveRooms'));
  }catch(e){$('#liveRooms').innerHTML='<div class="empty"><b>Jonli xonalarni yuklab bo‘lmadi</b><p>'+esc(e.message)+'</p></div>'}
}
// Student stage: render the teacher / screen-share track in a dedicated top-layer video,
// so legacy tile layouts and the proctor preview can never offset or cover it.
let hxStageTimer=null;
function syncStudentStage(){
  const host=$('#lesson .video-stage');if(!host)return;
  let v=$('#hxStageVideo');
  if(user?.role!=='student'||!activeLessonId||!mediaRoomClient||mediaRoomClient.closed){if(v){v.srcObject=null;v.remove()}host.classList.remove('hx-stage-live');return}
  const tiles=[...(mediaRoomClient.tiles?.values?.()||[])].filter(t=>t?.dataset?.role!=='student'&&!t.classList?.contains('local'));
  const pick=tiles.find(t=>t.classList.contains('screen-share')&&mediaRoomClient.primaryTileTrack?.(t))||tiles.find(t=>t.classList.contains('role-teacher')&&mediaRoomClient.primaryTileTrack?.(t))||null;
  const track=pick?mediaRoomClient.primaryTileTrack(pick):null;
  syncInterpreterOverlay(host);
  if(!track||track.readyState!=='live'){if(v&&v.srcObject){v.srcObject=null}$('#hxStagePip')?.remove();host.classList.remove('hx-stage-live');return}
  if(!v){v=document.createElement('video');v.id='hxStageVideo';v.muted=true;v.autoplay=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('aria-label','O‘qituvchi videosi');v.addEventListener('dblclick',()=>mediaRoomClient?.enterPrimaryFullscreen?.().catch(()=>{}));host.appendChild(v)}
  if(v.srcObject?.getVideoTracks?.()[0]!==track)v.srcObject=new MediaStream([track]);
  if(v.paused)v.play().catch(()=>{});
  host.classList.add('hx-stage-live');host.dataset.stageKind=pick.classList.contains('screen-share')?'screen':'camera';
  // Board / lab / screen on stage: the teacher camera stays visible as a small picture-in-picture (tap to swap size).
  let pip=$('#hxStagePip');
  const cam=pick.classList.contains('screen-share')?tiles.find(t=>t.classList.contains('role-teacher')&&!t.classList.contains('screen-share')&&mediaRoomClient.primaryTileTrack?.(t)):null,camTrack=cam?mediaRoomClient.primaryTileTrack(cam):null;
  if(camTrack&&camTrack.readyState==='live'){
    if(!pip){pip=document.createElement('video');pip.id='hxStagePip';pip.muted=true;pip.autoplay=true;pip.playsInline=true;pip.setAttribute('playsinline','');pip.setAttribute('aria-label','O‘qituvchi kamerasi');pip.addEventListener('click',()=>pip.classList.toggle('big'));host.appendChild(pip)}
    if(pip.srcObject?.getVideoTracks?.()[0]!==camTrack)pip.srcObject=new MediaStream([camTrack]);
    if(pip.paused)pip.play().catch(()=>{});
  }else if(pip){pip.srcObject=null;pip.remove()}
}
// ---- Inclusive education in the live lesson: needs banner, auto captions, transcript panel, interpreter video ----
let lessonNeeds=null,transcriptLines=[];
const hhmm=at=>{const d=new Date(at||Date.now());return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
function transcriptLineHtml(l){return '<p><time>'+hhmm(l.at)+'</time><b>'+esc(l.name||'')+'</b>'+esc(l.text)+'</p>'}
function pushTranscriptLine(name,text,at){
  const clean=String(text||'').trim();if(!clean)return;
  const line={name,text:clean,at:at||Date.now()};transcriptLines.push(line);if(transcriptLines.length>500)transcriptLines.splice(0,transcriptLines.length-500);
  const box=$('#lessonTranscriptLines');if(!box||$('#lessonTranscript')?.classList.contains('hidden'))return;
  const near=box.scrollHeight-box.scrollTop-box.clientHeight<60;box.querySelector('.hxa-empty')?.remove();box.insertAdjacentHTML('beforeend',transcriptLineHtml(line));
  while(box.children.length>500)box.firstElementChild.remove();if(near)box.scrollTop=box.scrollHeight;
}
function renderTranscript(){const box=$('#lessonTranscriptLines');if(!box)return;box.innerHTML=transcriptLines.length?transcriptLines.map(transcriptLineHtml).join(''):'<p class="hxa-empty">Subtitr yoqilganda aytilgan gaplar shu yerda yoziladi.</p>';box.scrollTop=box.scrollHeight}
async function showTranscriptPanel(on,openDrawer=false){
  const panel=$('#lessonTranscript');if(!panel)return;panel.classList.toggle('hidden',!on);$('#callTranscript')?.classList.toggle('active-control',on);
  if(!on)return;if(user?.role!=='student')showLessonSide('chat',openDrawer);
  if(!transcriptLines.length&&activeLessonId){try{const x=await api('/inclusion/transcripts/live/'+activeLessonId);if(!transcriptLines.length)transcriptLines=(x.lines||[]).map(l=>({name:l.name,text:l.text,at:l.at}))}catch{}}
  renderTranscript();
}
async function setupLessonInclusion(id,join){
  const x=await api('/inclusion/lessons/'+id+'/needs').catch(()=>null);
  if(String(activeLessonId)!==String(id))return;lessonNeeds=x;
  const prefs=window.HxA11y?.get()||{};
  if(prefs.captionsAlways||(user.role==='student'&&x?.self?.captions))showTranscriptPanel(true);
  if(user.role==='student'){if(x?.interpreters?.length)toast('🤟 Bu darsda surdotarjimon: '+x.interpreters.join(', '));return}
  const banner=$('#lessonInclusionBanner');if(!banner||!x||(!x.count&&!x.interpreters?.length))return;
  const s=activeLiveSession?.schedule||{},isLessonTeacher=String(s.teacherId?._id||s.teacherId||'')===String(user?._id||'');
  let capNote='';
  if(x.captions){
    if(isLessonTeacher&&SpeechRecognition&&!captionsEnabled){startCaptions();capNote='Subtitr avtomatik yoqildi'}
    else if(isLessonTeacher&&!SpeechRecognition)capNote='Subtitr uchun darsni Chrome yoki Edge’da o‘ting';
    else capNote=captionsEnabled?'Subtitr yoqilgan':'Subtitr kerak';
  }
  const seen=new Map();(x.students||[]).forEach(st=>(st.chips||[]).forEach(c=>seen.set(c.key,c)));
  banner.innerHTML='<span aria-hidden="true">♿</span><b>Guruhda alohida ehtiyojli '+esc(x.count)+' talaba</b>'+[...seen.values()].map(c=>'<span class="hxa-chip" title="'+esc(c.hint||'')+'">'+esc(c.icon)+' '+esc(c.label)+'</span>').join('')+(capNote?'<span class="hxa-chip">CC '+esc(capNote)+'</span>':'')+(x.interpreters?.length?'<span class="hxa-chip">🤟 '+esc(x.interpreters.join(', '))+'</span>':'')+
    '<button type="button" class="ghost" id="lessonNeedsMore">Tavsiyalar</button><button type="button" class="ghost" id="lessonNeedsClose" aria-label="Yopish">×</button>';
  banner.classList.remove('hidden');
  $('#lessonNeedsClose').onclick=()=>banner.classList.add('hidden');
  $('#lessonNeedsMore').onclick=()=>inclusionUi().sheet('Alohida ehtiyojli talabalar','<div class="in-cards">'+((x.students||[]).map(st=>'<article class="in-card"><header><h3>'+esc(st.fullName)+'</h3></header><ul class="in-todo">'+st.chips.map(c=>'<li><i aria-hidden="true">'+esc(c.icon)+'</i>'+esc(c.hint)+'</li>').join('')+'</ul>'+(st.teacherNote?'<p class="in-note">'+esc(st.teacherNote)+'</p>':'')+'</article>').join('')||'<p>Talabalar ismini ko‘rsatishga rozilik bermagan, moslashtirishlar avtomatik ishlaydi.</p>')+'</div>'+(x.hidden?'<p class="muted">Yana '+esc(x.hidden)+' talaba uchun moslashtirish avtomatik qo‘llanadi.</p>':''),{wide:true});
}
function resetLessonInclusion(){lessonNeeds=null;transcriptLines=[];$('#hxInterpreter')?.remove();$('#lessonTranscript')?.classList.add('hidden');$('#callTranscript')?.classList.remove('active-control');const b=$('#lessonInclusionBanner');if(b){b.classList.add('hidden');b.innerHTML=''}}
function syncInterpreterOverlay(host){
  const tile=[...(mediaRoomClient?.tiles?.values?.()||[])].find(t=>t?.dataset?.role==='interpreter'&&mediaRoomClient.primaryTileTrack?.(t));
  const track=tile?mediaRoomClient.primaryTileTrack(tile):null;let box=$('#hxInterpreter');
  if(!track||track.readyState!=='live'){box?.remove();return}
  if(!box){box=document.createElement('button');box.type='button';box.id='hxInterpreter';box.className='hx-plain';box.setAttribute('aria-label','Surdotarjimon videosi — kattalashtirish');box.innerHTML='<video muted autoplay playsinline></video><span>🤟 Surdotarjimon</span>';box.addEventListener('click',()=>box.classList.toggle('big'));host.appendChild(box)}
  const v=box.querySelector('video');if(v.srcObject?.getVideoTracks?.()[0]!==track)v.srcObject=new MediaStream([track]);if(v.paused)v.play().catch(()=>{});
}
$('#callTranscript')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');showTranscriptPanel($('#lessonTranscript')?.classList.contains('hidden'),true)});
$('#lessonTranscriptClose')?.addEventListener('click',()=>showTranscriptPanel(false));
$('#lessonTranscriptDownload')?.addEventListener('click',async()=>{try{const rows=await api('/inclusion/transcripts?scheduleId='+encodeURIComponent(activeLessonId)+'&limit=1');if(!rows[0])return toast('Hali saqlangan matn yo‘q');location.href='/api/inclusion/transcripts/'+encodeURIComponent(rows[0].id)+'?format=txt'}catch(e){toast(e.message)}});
// ---- Video lessons: subtitles (WebVTT) for MP4 via <track>, overlay for YouTube, readable transcript ----
function parseVtt(text){
  const t=s=>{const p=s.trim().split(':').map(Number);return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1]};
  return String(text||'').replace(/\r/g,'').split(/\n\n+/).map(b=>{const lines=b.split('\n'),i=lines.findIndex(l=>l.includes('-->'));if(i<0)return null;const [a,z]=lines[i].split('-->');return {start:t(a),end:t(z.trim().split(/\s+/)[0]),text:lines.slice(i+1).join(' ').replace(/<[^>]*>/g,'').trim()}}).filter(c=>c&&c.text&&Number.isFinite(c.start)&&Number.isFinite(c.end));
}
async function mountVideoCaptions(v){
  const id=String(v._id),desc=$('#watchDescription');if(!desc)return;desc.querySelector('.vc-bar')?.remove();
  const info=await api('/inclusion/videos/'+encodeURIComponent(id)+'/captions').catch(()=>({has:false}));if(activeVideoId!==id)return;
  const canEdit=can('videos.manage')||String(v.teacherId?._id||v.teacherId||'')===String(user?._id||'');
  if(!info.has&&!canEdit)return;
  const bar=document.createElement('div');bar.className='vc-bar';
  bar.innerHTML=info.has?'<span class="vc-badge">CC Subtitr</span>'+(canEdit?'<button type="button" class="ghost" data-vc-up>Subtitrni almashtirish</button>':'')+'<details class="vc-transcript"><summary>📝 Video matnini o‘qish</summary><div>'+esc(info.transcript||'').replace(/\n/g,'<br>')+'</div></details>'
    :'<span class="vc-badge warn">Subtitr yo‘q</span><button type="button" class="secondary" data-vc-up>CC Subtitr qo‘shish (.vtt / .srt)</button><small>Eshitmaydigan talabalar uchun</small>';
  desc.prepend(bar);bar.querySelector('[data-vc-up]')?.addEventListener('click',()=>inclusionUi().uploadCaptions(id,()=>mountVideoCaptions(v)));
  if(!info.has)return;
  const player=$('#watchPlayer'),video=player?.querySelector('video');
  if(video){if(!video.querySelector('track')){const tr=document.createElement('track');tr.kind='captions';tr.srclang=info.lang||'uz';tr.label='Subtitr';tr.src='/api/inclusion/videos/'+encodeURIComponent(id)+'/captions.vtt';tr.default=true;video.appendChild(tr);tr.addEventListener('load',()=>{try{tr.track.mode='showing'}catch{}})}return}
  if(activeWatchKind!=='youtube')return;
  const cues=parseVtt(await fetch('/api/inclusion/videos/'+encodeURIComponent(id)+'/captions.vtt',{credentials:'same-origin'}).then(r=>r.ok?r.text():'').catch(()=>''));if(!cues.length||activeVideoId!==id)return;
  let ov=player.querySelector('.vc-overlay');if(!ov){ov=document.createElement('div');ov.className='vc-overlay';ov.setAttribute('aria-hidden','true');player.appendChild(ov)}
  const timer=setInterval(()=>{if(activeVideoId!==id||!player.isConnected){clearInterval(timer);return}const now=Number(activeWatchPlayer?.getCurrentTime?.()||0),c=cues.find(x=>now>=x.start&&now<=x.end);ov.textContent=c?c.text:'';ov.classList.toggle('show',Boolean(c))},250);
}
// Live lesson flow guards: every join/leave bumps conferenceSeq so stale async work bails out.
let conferenceSeq=0,leavingConference=null,chatLessonId='',participantsTimer=null,participantsSeq=0,attendanceDirty=false,proctorSeq=0,proctorRestartTimer=null,proctorRestarts=0,lastAudioBlockedToast=0,lessonWarnedId='';
const liveJoinInFlight=new Set();
function setHandRaised(v){handRaised=Boolean(v);const b=$('#callRaiseHand');b?.classList.toggle('active-control',handRaised);b?.setAttribute('aria-pressed',String(handRaised));b?.setAttribute('title',handRaised?'Qo‘lni tushirish':'Qo‘l ko‘tarish')}
function scheduleLessonParticipants(ms=600){clearTimeout(participantsTimer);participantsTimer=setTimeout(()=>loadLessonParticipants().catch(()=>{}),ms)}
function cameraHint(e){return e?.name==='NotAllowedError'||e?.name==='SecurityError'?'kamera ruxsati berilmagan. Manzil satridagi qulf belgisi → Kamera → Ruxsat berish':e?.name==='NotReadableError'||e?.name==='AbortError'?'kamera boshqa ilovada band (Zoom, Telegram yoki kamera ilovasini yoping)':e?.name==='NotFoundError'||e?.name==='OverconstrainedError'?'kamera topilmadi':(e?.message||'ruxsat yo‘q')}
function lessonChatVisible(){const p=$('#lessonChatPanel');if(!p||p.classList.contains('hidden')||document.hidden)return false;const r=p.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight}
function scheduleProctorRestart(ms=1500){
  clearTimeout(proctorRestartTimer);if(proctorRestarts>=3)return;
  proctorRestartTimer=setTimeout(async()=>{
    if(!activeLessonId||user?.role!=='student'||document.hidden||liveProctorTrack?.readyState==='live')return;
    proctorRestarts++;if(await startLiveLessonProctoring()){proctorRestarts=0;toast('Proktor kamera qayta ulandi')}
  },ms);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&activeLessonId&&user?.role==='student'&&liveProctorTrack?.readyState!=='live')scheduleProctorRestart(400)});
async function startLiveRoom(id){
  try{const x=await api('/live/rooms/'+id+'/start',{method:'POST',body:'{}'});await openConference(x)}catch(e){toast(e.message)}
}
async function enterLiveRoom(id){
  id=String(id||'');if(!id||liveJoinInFlight.has(id))return;liveJoinInFlight.add(id);
  try{const x=await api('/live/rooms/'+id+'/join',{method:'POST',body:'{}',timeoutMs:20000});await openConference(x)}catch(e){toast(e.message);if(!activeLessonId)go('live')}
  finally{liveJoinInFlight.delete(id)}
}

function formatRemain(sec){sec=Math.max(0,Math.floor(sec));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function startLessonClock(){
  clearInterval(lessonTimer);let warned=lessonWarnedId===activeLessonId;
  const tick=()=>{
    if(!activeLiveSession?.schedule)return;
    const end=String(activeLiveSession.schedule.end||'00:00').split(':').map(Number),now=new Date(),endDate=new Date(now);endDate.setHours(end[0]||0,end[1]||0,0,0);
    let sec=Math.floor((endDate-now)/1000);if(sec<0)sec=0;
    const el=$('#lessonTimeLeft');if(el){el.textContent=formatRemain(sec)+' qoldi';el.classList.toggle('warning',sec>0&&sec<=300)}
    if(sec<=300&&sec>0&&!warned){warned=true;lessonWarnedId=activeLessonId;toast('Dars tugashiga 5 daqiqa qoldi')}
  };tick();lessonTimer=setInterval(tick,1000)
}
function startNetworkMonitor(){
  clearInterval(networkTimer);
  let sampling=false;
  const update=async()=>{
    if(sampling)return;
    sampling=true;
    try{
      const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      const media=mediaRoomClient&&!mediaRoomClient.closed?mediaRoomClient:null;
      const health=media?await media.getNetworkHealth():null;
      let quality='good',label='Yaxshi';
      if(!navigator.onLine||socket?.connected===false){quality='bad';label='Ulanish yo‘q'}
      else if(health?.state==='failed'){quality='bad';label='Ulanish uzilgan'}
      else if(health?.state==='disconnected'||health?.state==='connecting'){quality='mid';label='Tiklanmoqda'}
      else if(health?.lossPercent!=null&&health.lossPercent>12){quality='bad';label='Yomon'}
      else if((health?.lossPercent!=null&&health.lossPercent>3)||(health?.rttMs||0)>280){quality='mid';label='O‘rtacha'}
      else if(conn){
        // Network Information API values are estimates, not actual classroom/WebRTC packet loss.
        const rtt=Number(conn.rtt||0),down=Number(conn.downlink||0),type=String(conn.effectiveType||'');
        if(/2g|3g/.test(type)||rtt>400||(down&&down<1)){quality='mid';label='O‘rtacha'}
      }
      if(!activeLessonId)return;
      const b=$('#networkQualityBadge');if(b){b.className='network-quality '+quality;b.textContent='● '+label;b.title=health?'WebRTC: '+health.state+(health.rttMs?' · RTT '+Math.round(health.rttMs)+' ms':'')+(health.lossPercent!=null?' · paket yo‘qotish '+health.lossPercent.toFixed(1)+'%':''):'Brauzer tarmoq bahosi (taxminiy)';}
      // Never throttle a 1080p teacher/screen stream based solely on the browser's
      // estimated connection speed. WebRTC congestion control handles transient changes.
      if(media&&!media.lowBandwidthMode&&media.fsPrevQuality===undefined&&(localStorage.getItem('m2-video-quality')||'auto')==='auto'){
        const loss=health?.lossPercent;
        const veryPoor=health?.state==='failed'||health?.state==='disconnected'||(loss!=null&&loss>12)||(health?.rttMs||0)>850;
        const degraded=health?.state==='connecting'||(loss!=null&&loss>5)||(health?.rttMs||0)>500;
        const q=veryPoor?'240':degraded?'360':'auto';
        if(lastAutoQuality!==q){lastAutoQuality=q;media.setReceiveQuality(q).catch(()=>{})}
      }
      $('#connectionBanner')?.classList.toggle('hidden',navigator.onLine&&socket?.connected!==false&&health?.state!=='failed'&&health?.state!=='disconnected');
    }catch(e){console.warn('Network quality sampling failed',e?.message||e)}
    finally{sampling=false}
  };update();networkTimer=setInterval(update,ultraLiteUI?7000:(lowEndUI?5000:3500))
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
  if(!activeLessonId||autoRejoinInFlight)return false;
  const id=String(activeLessonId);autoRejoinInFlight=true;
  try{
    const x=await api('/live/rooms/'+id+'/join',{method:'POST',body:'{}',timeoutMs:15000});
    if(String(activeLessonId)!==id)return true; // user left or switched lesson meanwhile
    const ok=await openConference(x);
    if(ok===false)return false;
    autoRejoinAttempt=0;
    $('#connectionBanner')?.classList.add('hidden');$('#callRejoin')?.classList.add('hidden');return true;
  }catch(e){
    console.warn('live rejoin failed',e?.message||e);
    if([403,404,409].includes(e?.status)&&String(activeLessonId)===id){toast(e.message||'Dars yakunlangan');await leaveConference(true);return true}
    return false;
  }finally{autoRejoinInFlight=false}
}
let resumeInFlight=null;
function resumeMediaSession(){
  if(resumeInFlight)return resumeInFlight;
  const client=mediaRoomClient,lessonId=activeLessonId;
  resumeInFlight=(async()=>{
    const ok=await client.resume();
    if(client!==mediaRoomClient||lessonId!==activeLessonId)return;
    if(ok){$('#connectionBanner')?.classList.add('hidden');$('#callRejoin')?.classList.add('hidden');socket?.emit('lesson:qa-sync',{lessonId:activeLessonId})}
    else autoRejoinLesson(true);
  })().finally(()=>{resumeInFlight=null});
  return resumeInFlight;
}
/* Long lessons on phones: keep the screen awake while a lesson is open (the page would otherwise be backgrounded,
   the browser throttles timers and media, and the signaling socket eventually drops). */
let lessonWakeLock=null;
async function keepLessonAwake(){
  if(!activeLessonId||document.visibilityState!=='visible'||!navigator.wakeLock?.request)return;
  if(lessonWakeLock&&!lessonWakeLock.released)return;
  try{lessonWakeLock=await navigator.wakeLock.request('screen');lessonWakeLock.addEventListener?.('release',()=>{lessonWakeLock=null})}catch{lessonWakeLock=null}
}
function releaseLessonWakeLock(){try{lessonWakeLock?.release?.()}catch{}lessonWakeLock=null}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeLessonId)keepLessonAwake()});
function autoRejoinLesson(immediate=false){
  if(!activeLessonId||autoRejoinTimer||autoRejoinInFlight)return;
  $('#callRejoin')?.classList.remove('hidden');$('#connectionBanner')?.classList.remove('hidden');
  const delay=immediate?500:Math.min(15000,1000*Math.pow(1.7,Math.min(autoRejoinAttempt,6)));
  autoRejoinTimer=setTimeout(async()=>{
    autoRejoinTimer=null;
    const ok=await rejoinActiveLesson();
    if(!ok&&activeLessonId){autoRejoinAttempt++;autoRejoinLesson(false)}
  },delay)
}
function formatFocusTime(sec){
  sec=Math.max(0,Math.round(Number(sec)||0));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
const FACE_DETECTION_LOCAL='/vendor/face-detection/';
const FACE_DETECTION_CDN='https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/';
let faceDetectionLoader=null,faceDetectionBase=FACE_DETECTION_LOCAL;
async function loadMediaPipeFaceDetection(){
  if(window.FaceDetection)return {FaceDetection:window.FaceDetection,base:faceDetectionBase};
  if(faceDetectionLoader)return faceDetectionLoader;
  const loadFrom=base=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=base+'face_detection.js';s.async=true;s.dataset.m2FaceDetection='1';
    if(base.startsWith('http'))s.crossOrigin='anonymous';
    s.onload=()=>window.FaceDetection?resolve({FaceDetection:window.FaceDetection,base}):reject(new Error('Yuz detektori ishga tushmadi'));
    s.onerror=()=>{s.remove();reject(new Error('Yuz detektori yuklanmadi'))};
    document.head.appendChild(s);
  });
  faceDetectionLoader=(async()=>{
    try{const x=await loadFrom(FACE_DETECTION_LOCAL);faceDetectionBase=x.base;return x}
    catch{
      const x=await loadFrom(FACE_DETECTION_CDN);faceDetectionBase=x.base;return x;
    }
  })().catch(e=>{faceDetectionLoader=null;throw e});
  return faceDetectionLoader;
}
function proctorStateLabel(state,status='ready'){
  if(status==='error')return 'Detektor ishlamayapti';
  return state==='present'?'Yuz ko‘rinmoqda':state==='away'?'Yuz chetga burilgan':state==='missing'?'Yuz ko‘rinmayapti':status==='loading'?'Tekshiruv yuklanmoqda':'Tahlil mavjud emas';
}
function updateParticipantProctorIndicator(x){
  if(!x?.userId)return;liveProctorStates.set(String(x.userId),x);
  const row=document.querySelector('[data-attendance-student="'+CSS.escape(String(x.userId))+'"]');if(!row)return;
  const badge=row.querySelector('[data-proctor-badge]'),meta=row.querySelector('[data-proctor-meta]');
  if(badge){badge.className='proctor-chip '+(x.cameraReady?'camera-on ':'camera-off ')+(x.faceState||'unknown');badge.textContent=x.cameraReady?('● '+proctorStateLabel(x.faceState,x.detectorStatus)):'○ Kamera yo‘q'}
  if(meta)meta.textContent='Yuz '+formatFocusTime(x.presentSeconds)+' / '+formatFocusTime(x.observedSeconds)+' · '+Math.round(Number(x.attentionPercent)||0)+'%';
  refreshLiveProctorSummary();
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
function renderLocalProctorStatus(faceState='unknown',detectorStatus='loading',cameraReady=false){
  const node=$('#liveStudentProctorStatus');
  if(!node)return;
  node.classList.toggle('hidden',user?.role!=='student'||!activeLessonId);
  const state=!cameraReady?'missing':faceState;
  node.dataset.state=state;
  node.dataset.detector=detectorStatus;
  const statusText=$('#liveProctorStatusText');if(!statusText)return;
  statusText.textContent=!cameraReady?'● Proktor kamerasi ishlamayapti':
    detectorStatus==='error'?'● Yuz detektori ishga tushmadi':
    detectorStatus==='loading'?'◌ Yuz nazorati yuklanmoqda…':
    state==='present'?'● Yuz ko‘rinmoqda · lokal nazorat':
    state==='away'?'● Yuz chetga burilgan (taxminiy)':
    state==='missing'?'● Kadrda yuz topilmadi':
    '◌ Yuz holatini aniqlab bo‘lmadi';
  node.title='Lokal yuzni aniqlash; ko‘zning aniq ekranga qarayotganini tasdiqlamaydi. Video faqat alohida rozilik bilan darsga uzatiladi.';
}
async function startLiveLessonProctoring(){
  await liveProctorStop?.();const proctorToken=++proctorSeq;liveProctorStop=()=>{proctorSeq++};liveProctorStream=null;liveProctorTrack=null;
  if(user?.role!=='student'||!activeLessonId)return false;
  let stream=null,detector=null,timer=null,heartbeat=null,video=null,stopped=false,faceState='unknown',detectorStatus='loading',pageActive=!document.hidden,inFlight=false,modelErrors=0;
  const stable=createFaceStateFilter(2);
  const observe=(raw)=>{faceState=stable.observe(raw);detectorStatus='ready';modelErrors=0;renderLocalProctorStatus(faceState,detectorStatus,liveProctorTrack?.readyState==='live')};
  const effectiveState=()=>document.hidden?'away':stable.get();
  const emit=()=>{if(!stopped){
    const cameraReady=Boolean(liveProctorTrack?.readyState==='live');
    if(detectorStatus==='loading'&&Date.now()-startedAt>18000){detectorStatus='error';faceState='unknown'}
    renderLocalProctorStatus(effectiveState(),detectorStatus,cameraReady);
    if(activeLessonId&&socket?.connected)socket.emit('lesson:proctor-state',{lessonId:activeLessonId,cameraReady,faceState:effectiveState(),detectorStatus,pageActive});
  }};
  const startedAt=Date.now();
  const onVisibility=()=>{pageActive=!document.hidden;emit()};
  const onBlur=()=>{pageActive=!document.hidden;emit()};
  const onFocus=()=>{pageActive=!document.hidden;emit()};
  document.addEventListener('visibilitychange',onVisibility);window.addEventListener('blur',onBlur);window.addEventListener('focus',onFocus);
  try{
    const camId=localStorage.getItem('m2-preferred-camera')||'',constraints={width:{ideal:960,max:1280},height:{ideal:540,max:720},frameRate:{ideal:12,max:15},facingMode:'user'};
    if(camId)constraints.deviceId={ideal:camId};
    // Some Android/Samsung camera HALs reject the ideal 720p constraints while
     // accepting a lower resolution, or need a short camera-busy retry.
     const attempts=[
       {video:constraints,audio:false},
       {video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:10,max:15},facingMode:'user'},audio:false},
       {video:true,audio:false}
     ];
     let cameraError;
     for(const options of attempts){
       try{stream=await navigator.mediaDevices.getUserMedia(options);break}
       catch(e){
         cameraError=e;
         if(['NotAllowedError','SecurityError','PermissionDeniedError'].includes(e?.name))break;
         if(['NotReadableError','AbortError'].includes(e?.name))await new Promise(resolve=>setTimeout(resolve,500));
       }
     }
     if(!stream)throw cameraError||new Error('Kamera ochilmadi');
     if(proctorToken!==proctorSeq||!activeLessonId){stream.getTracks().forEach(t=>t.stop());document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);return false}
    liveProctorStream=stream;liveProctorTrack=stream.getVideoTracks()[0]||null;if(!liveProctorTrack)throw new Error('Kamera trek topilmadi');
    mediaRoomClient?.setExternalCameraTrack?.(liveProctorTrack);
    liveProctorTrack.addEventListener('ended',()=>{faceState='missing';detectorStatus='error';emit();toast('Dars proktoring kamerasi o‘chdi · qayta ulanmoqda');scheduleProctorRestart()},{once:true});
    video=$('#liveProctorLocalPreview')||document.createElement('video');video.srcObject=stream;video.muted=true;video.autoplay=true;video.playsInline=true;await video.play().catch(e=>console.warn('Local proctor playback retry:',e?.message||e));
    try{
      if('FaceDetector' in window){
        detector={kind:'native',instance:new FaceDetector({fastMode:true,maxDetectedFaces:2})};
      }else{
        const loaded=await loadMediaPipeFaceDetection(),FaceDetection=loaded.FaceDetection;
        const instance=new FaceDetection({locateFile:file=>loaded.base+file});instance.setOptions({model:'short',minDetectionConfidence:.62});
        instance.onResults(result=>{
          if(stopped)return;
          observe(classifyFaceDetections(result?.detections||[],'mediapipe',video?.videoWidth,video?.videoHeight));
        });detector={kind:'mediapipe',instance};
      }
    }catch(e){detector=null;detectorStatus='error';console.warn('Live face detector unavailable:',e?.message||e)}
    if(!detector){faceState='unknown';detectorStatus='error';toast('Yuz detektori ishga tushmadi. Kamera ochiq, lekin yuz holati tekshirilmayapti.')}
    timer=detector?setInterval(async()=>{
      if(stopped||inFlight||!video||liveProctorTrack?.readyState!=='live')return;
      if(video.readyState<2){if(Date.now()-startedAt>18000){detectorStatus='error';faceState='unknown';renderLocalProctorStatus(faceState,detectorStatus,true)}return}
      inFlight=true;
      try{
        if(detector.kind==='mediapipe')await detector.instance.send({image:video});
        else if(detector.kind==='native')observe(classifyFaceDetections(await detector.instance.detect(video),'native',video.videoWidth,video.videoHeight));
      }catch(e){
        modelErrors++;
        if(modelErrors>=3){
           detectorStatus='error';faceState='unknown';
           console.warn('Face detection failed:',e?.message||e);
           // Samsung/Chromium may expose the native detector but fail at runtime.
           // Switch to bundled MediaPipe without stopping the camera or broadcasting frames.
           if(detector?.kind==='native'){
             try{
               const loaded=await loadMediaPipeFaceDetection();
               const instance=new loaded.FaceDetection({locateFile:file=>loaded.base+file});
               instance.setOptions({model:'short',minDetectionConfidence:.60});
               instance.onResults(result=>{
                 if(!stopped)observe(classifyFaceDetections(result?.detections||[],'mediapipe',video?.videoWidth,video?.videoHeight));
               });
               detector={kind:'mediapipe',instance};detectorStatus='loading';modelErrors=0;
             }catch(fallbackError){console.warn('MediaPipe fallback failed:',fallbackError?.message||fallbackError)}
           }
         }
      }finally{inFlight=false}
    },lowEndUI?2400:1200):null; // weak phones: half the detection rate keeps the lesson smooth over long sessions
    heartbeat=setInterval(emit,4000);emit();toast(detector?'Yuz nazorati ishga tushirilmoqda · kamera lokal ishlaydi':'Kamera ochildi · yuz detektori ishlamayapti');
    liveProctorStop=async()=>{
      if(stopped)return;stopped=true;clearInterval(timer);clearInterval(heartbeat);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);try{detector?.instance?.close?.()}catch{};try{mediaRoomClient?.setExternalCameraTrack?.(null)}catch{};stream?.getTracks().forEach(t=>t.stop());if(video)video.srcObject=null;liveProctorStream=null;liveProctorTrack=null;$('#liveStudentProctorStatus')?.classList.add('hidden');
    };
    return true;
  }catch(e){
    faceState='missing';emit();heartbeat=setInterval(emit,5000);toast('Dars proktoring kamerasi ishlamadi: '+cameraHint(e));
    liveProctorStop=async()=>{clearInterval(heartbeat);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);stream?.getTracks().forEach(t=>t.stop());liveProctorStream=null;liveProctorTrack=null};
    return false;
  }
}
/* Classroom audio mode (students). A phone in the same room as the teacher plays no lesson audio at all,
   which removes the speaker→teacher-mic loop (echo, squeal). Remembered per lesson. */
let lastRoomModeHintAt=0;
function roomModeSaved(){try{return activeLessonId?localStorage.getItem('m2-room-mode:'+activeLessonId)||'':''}catch{return ''}}
async function applyRoomMode(mode){
  if(user?.role!=='student'||!mediaRoomClient)return;
  try{localStorage.setItem('m2-room-mode:'+activeLessonId,mode);localStorage.setItem('m2-room-mode-last',mode)}catch{}
  hideRoomModeSheet();
  await mediaRoomClient.setInRoom(mode==='room');
  updateRoomModeUI();
  toast(mode==='room'?'Auditoriya rejimi: telefon ovozi o‘chdi. O‘qituvchini xonada eshitasiz, subtitr ishlaydi':'Masofaviy rejim: ovoz yoqildi. Quloqchin ishlatsangiz aks-sado bo‘lmaydi');
}
function updateRoomModeUI(){
  const student=user?.role==='student'&&Boolean(mediaRoomClient),inRoom=Boolean(mediaRoomClient?.inRoom);
  let pill=$('#roomModePill');
  if(!pill&&student){const stage=$('#lesson .video-stage');if(stage){pill=document.createElement('button');pill.id='roomModePill';pill.type='button';pill.className='room-mode-pill';pill.addEventListener('click',()=>showRoomModeSheet());stage.appendChild(pill)}}
  if(pill){pill.classList.toggle('hidden',!student);pill.classList.toggle('in-room',inRoom);pill.innerHTML=inRoom?'<span aria-hidden="true">🏫</span> Auditoriyada · ovoz o‘chiq':'<span aria-hidden="true">🎧</span> Masofadan';pill.title='Qatnashish joyini o‘zgartirish'}
  const b=$('#callRoomMode');if(b){b.classList.toggle('hidden',!student);b.classList.toggle('active-control',inRoom);b.setAttribute('aria-pressed',inRoom?'true':'false')}
}
function hideRoomModeSheet(){$('#roomModeSheet')?.classList.add('hidden')}
function showRoomModeSheet(reason=''){
  if(user?.role!=='student'||!mediaRoomClient)return;
  let sh=$('#roomModeSheet');
  if(!sh){
    sh=document.createElement('div');sh.id='roomModeSheet';sh.className='room-mode-sheet hidden';sh.setAttribute('role','dialog');sh.setAttribute('aria-modal','true');sh.setAttribute('aria-labelledby','roomModeTitle');
    sh.innerHTML='<div class="room-mode-card"><p class="room-mode-alert" id="roomModeAlert" hidden>⚠️ Xonada chiyillash aniqlandi. O‘qituvchi bilan bir xonada bo‘lsangiz «Auditoriyadaman»ni tanlang.</p><h2 id="roomModeTitle">Darsga qayerdan qatnashyapsiz?</h2><p class="room-mode-sub">Bir xonadagi telefonlar ovozi o‘qituvchi mikrofoniga qaytib, aks-sado va chiyillash beradi.</p><button type="button" class="room-mode-opt" data-room-mode="room"><span class="room-mode-ico" aria-hidden="true">🏫</span><span><b>Auditoriyadaman</b><small>O‘qituvchi bilan bir xonada. Telefon ovozi o‘chadi, video va subtitr ishlaydi.</small></span></button><button type="button" class="room-mode-opt" data-room-mode="remote"><span class="room-mode-ico" aria-hidden="true">🏠</span><span><b>Masofadan</b><small>Uyda yoki boshqa joyda. Ovoz eshitiladi, quloqchin tavsiya etiladi.</small></span></button></div>';
    sh.addEventListener('keydown',e=>{if(e.key==='Escape'&&roomModeSaved())hideRoomModeSheet()});
    sh.addEventListener('click',e=>{if(e.target===sh&&roomModeSaved())return hideRoomModeSheet();const b=e.target.closest('[data-room-mode]');if(b)applyRoomMode(b.dataset.roomMode).catch(err=>toast(err.message||String(err)))});
    document.body.appendChild(sh);
  }
  const last=(()=>{try{return localStorage.getItem('m2-room-mode-last')||''}catch{return ''}})();
  sh.querySelectorAll('[data-room-mode]').forEach(b=>b.classList.toggle('is-last',b.dataset.roomMode===last));
  const al=$('#roomModeAlert');if(al)al.hidden=reason!=='feedback';
  sh.classList.remove('hidden');sh.querySelector(reason==='feedback'?'[data-room-mode="room"]':'.room-mode-opt.is-last, .room-mode-opt')?.focus?.({preventScroll:true});
}
$('#callRoomMode')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');showRoomModeSheet()});
/* ---- Live quiz + understanding pulse ---- */
let liveQuiz=null,liveQuizTick=null,liveQuizHideTimer=null,pulseMine='',pulseClearTimer=null;
const QUIZ_L='ABCDEF';
const isLessonHost=()=>user?.role==='teacher'||can('live.manage');
function liveQuizComposer(){
  let sh=$('#quizComposer');if(sh)return sh;
  sh=document.createElement('div');sh.id='quizComposer';sh.className='room-mode-sheet hidden';sh.setAttribute('role','dialog');sh.setAttribute('aria-modal','true');
  sh.innerHTML='<form class="room-mode-card quiz-form"><h2>📊 Jonli kviz</h2><textarea name="q" rows="2" maxlength="300" placeholder="Savol matni (bo‘sh qoldirsangiz, savolni og‘zaki berasiz)"></textarea><div class="quiz-presets"><button type="button" data-preset="abcd">A · B · C · D</button><button type="button" data-preset="yesno">Ha / Yo‘q</button><button type="button" data-preset="tf">To‘g‘ri / Noto‘g‘ri</button></div><div class="quiz-opts">'+[0,1,2,3].map(i=>'<label class="quiz-opt-row"><input type="radio" name="correct" value="'+i+'" aria-label="To‘g‘ri javob '+QUIZ_L[i]+'"><b>'+QUIZ_L[i]+'</b><input name="o'+i+'" maxlength="120" placeholder="Variant '+QUIZ_L[i]+(i>1?' (ixtiyoriy)':'')+'"></label>').join('')+'</div><p class="quiz-hint">Doirachani belgilasangiz, to‘g‘ri javob va eng tez 3 talaba e’lon qilinadi.</p><div class="quiz-actions"><select name="sec" aria-label="Vaqt"><option value="20">20 soniya</option><option value="30" selected>30 soniya</option><option value="45">45 soniya</option><option value="60">1 daqiqa</option><option value="90">1.5 daqiqa</option></select><button type="button" class="quiz-cancel">Bekor</button><button type="submit" class="quiz-go">Boshlash</button></div></form>';
  const f=sh.querySelector('form');
  sh.addEventListener('click',e=>{if(e.target===sh||e.target.closest('.quiz-cancel'))sh.classList.add('hidden');const pr=e.target.closest('[data-preset]');if(pr){const v={abcd:['A','B','C','D'],yesno:['Ha','Yo‘q','',''],tf:['To‘g‘ri','Noto‘g‘ri','','']}[pr.dataset.preset];v.forEach((x,i)=>f['o'+i].value=x);f.querySelectorAll('[name=correct]').forEach(r=>r.checked=false)}});
  f.addEventListener('submit',e=>{e.preventDefault();if(!activeLessonId||!socket?.connected)return toast('Aloqa yo‘q');
    const opts=[0,1,2,3].map(i=>f['o'+i].value.trim()),used=opts.map((x,i)=>({x,i})).filter(o=>o.x);
    if(used.length<2)return toast('Kamida 2 ta variant kiriting');
    const cr=f.querySelector('[name=correct]:checked'),ci=cr?used.findIndex(o=>o.i===Number(cr.value)):-1;
    socket.emit('lesson:quiz-start',{lessonId:activeLessonId,question:f.q.value,options:used.map(o=>o.x),correct:ci,seconds:Number(f.sec.value)});sh.classList.add('hidden')});
  document.body.appendChild(sh);return sh;
}
function openLiveQuizComposer(){if(!activeLessonId)return toast('Avval darsga kiring');const sh=liveQuizComposer(),f=sh.querySelector('form');if(![0,1].some(i=>f['o'+i].value)){['A','B','C','D'].forEach((x,i)=>f['o'+i].value=x)}sh.classList.remove('hidden');f.q.focus({preventScroll:true})}
function quizCard(){let c=$('#liveQuizCard');if(!c){c=document.createElement('section');c.id='liveQuizCard';c.className='live-quiz hidden';c.setAttribute('aria-live','polite');c.addEventListener('click',quizCardClick);document.body.appendChild(c)}return c}
function quizCardClick(e){
  const q=liveQuiz;if(!q)return;
  if(e.target.closest('.lq-close')){quizCard().classList.add('hidden');return}
  if(e.target.closest('.lq-end')){socket?.emit('lesson:quiz-end',{lessonId:activeLessonId});return}
  const b=e.target.closest('[data-choice]');if(!b||q.phase!=='open'||q.mine!==undefined||isLessonHost())return;
  q.mine=Number(b.dataset.choice);socket?.emit('lesson:quiz-answer',{lessonId:activeLessonId,id:q.id,choice:q.mine});renderQuiz();
}
function renderQuiz(){
  const q=liveQuiz,c=quizCard();if(!q){c.classList.add('hidden');return}
  const host=isLessonHost(),left=Math.max(0,Math.ceil((q.endsAt-(Date.now()+q.skew))/1000));
  const head='<div class="lq-head"><span class="lq-tag">📊 Kviz</span>'+(q.phase==='open'?'<span class="lq-time">'+left+' s</span>':'<span class="lq-tag lq-done">Natija</span>')+'<button type="button" class="lq-close" aria-label="Yopish">×</button></div>'+(q.question?'<h3 class="lq-q">'+esc(q.question)+'</h3>':'<h3 class="lq-q lq-oral">Savolni o‘qituvchi og‘zaki beradi</h3>');
  let body='';
  if(q.phase==='open'){
    const pct=Math.max(0,Math.min(100,100*left/(q.seconds||30)));
    body='<div class="lq-bar"><i style="width:'+pct+'%"></i></div><div class="lq-opts">'+q.options.map((o,i)=>'<button type="button" data-choice="'+i+'" class="lq-opt'+(q.mine===i?' is-mine':'')+'"'+(host||q.mine!==undefined?' disabled':'')+'><b>'+QUIZ_L[i]+'</b><span>'+esc(o)+'</span></button>').join('')+'</div>'+
      (host?'<div class="lq-foot"><span>'+(q.answered||0)+(q.online?' / '+q.online:'')+' javob berdi</span><button type="button" class="lq-end">Yakunlash</button></div>':(q.mine!==undefined?'<div class="lq-foot"><span>✓ Javobingiz qabul qilindi · natijani kuting</span></div>':''));
  }else{
    const total=q.total||0,max=Math.max(1,...q.counts);
    body='<div class="lq-res">'+q.options.map((o,i)=>{const n=q.counts[i]||0,p=total?Math.round(100*n/total):0;return '<div class="lq-row'+(i===q.correct?' is-correct':'')+(q.mine===i?' is-mine':'')+'"><b>'+QUIZ_L[i]+'</b><span class="lq-lbl">'+esc(o)+(i===q.correct?' ✓':'')+'</span><span class="lq-track"><i style="width:'+(100*n/max)+'%"></i></span><span class="lq-n">'+p+'%</span></div>'}).join('')+'</div>';
    let verdict='';
    if(!host&&q.correct>=0)verdict=q.mine===undefined?'<p class="lq-verdict">Javob berilmadi · to‘g‘ri javob: <b>'+QUIZ_L[q.correct]+'</b></p>':(q.mine===q.correct?'<p class="lq-verdict ok">🎉 To‘g‘ri! Barakalla</p>':'<p class="lq-verdict no">To‘g‘ri javob: <b>'+QUIZ_L[q.correct]+'</b> · keyingisida albatta!</p>');
    const medals=['🥇','🥈','🥉'],top=(q.top||[]).map((t,i)=>'<li>'+medals[i]+' <b>'+esc(t.name)+'</b> <small>'+(t.ms/1000).toFixed(1)+' s</small></li>').join('');
    body+=verdict+(top?'<ol class="lq-top">'+top+'</ol>':'')+'<div class="lq-foot"><span>'+total+' ta javob</span>'+(host?'<button type="button" class="lq-end lq-new">Yangi kviz</button>':'')+'</div>';
  }
  c.innerHTML=head+body;c.classList.remove('hidden');
  const nb=c.querySelector('.lq-new');if(nb)nb.onclick=e=>{e.stopPropagation();openLiveQuizComposer()};
}
function onLessonQuiz(x){
  if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
  clearInterval(liveQuizTick);clearTimeout(liveQuizHideTimer);
  if(x.phase==='open'){
    liveQuiz={...x,skew:(x.serverNow||Date.now())-Date.now(),answered:0,mine:undefined};
    liveQuizTick=setInterval(()=>{if(!liveQuiz||liveQuiz.phase!=='open')return clearInterval(liveQuizTick);renderQuiz()},1000);
    if(!isLessonHost())try{navigator.vibrate?.(60)}catch{}
  }else{
    const mine=liveQuiz?.id===x.id?liveQuiz.mine:undefined;
    liveQuiz={...x,mine,skew:0};
    if(!isLessonHost()&&x.correct>=0&&mine===x.correct)setTimeout(hxConfetti,150);
    liveQuizHideTimer=setTimeout(()=>{if(liveQuiz?.id===x.id&&liveQuiz.phase==='result'){quizCard().classList.add('hidden')}},isLessonHost()?60000:20000);
  }
  renderQuiz();
}
function resetLiveExtras(){clearInterval(liveQuizTick);clearTimeout(liveQuizHideTimer);clearTimeout(pulseClearTimer);liveQuiz=null;pulseMine='';$('#liveQuizCard')?.classList.add('hidden');$('#quizComposer')?.classList.add('hidden');$('#pulsePill')?.classList.add('hidden');renderPulseChips()}
function renderPulseChips(){
  const panel=$('#lessonChatPanel'),h=panel?.querySelector('h2');if(!h)return;
  let box=$('#pulseChips');
  if(user?.role!=='student'||!activeLessonId){box?.remove();return}
  if(!box){box=document.createElement('span');box.id='pulseChips';box.className='pulse-chips';box.innerHTML='<button type="button" data-pulse="ok" title="Mavzu tushunarli">👍 Tushundim</button><button type="button" data-pulse="lost" title="O‘qituvchiga anonim belgi boradi">🤔 Tushunmadim</button>';box.addEventListener('click',e=>{const b=e.target.closest('[data-pulse]');if(b)setPulse(pulseMine===b.dataset.pulse?'':b.dataset.pulse)});h.appendChild(box)}
  box.querySelectorAll('[data-pulse]').forEach(b=>{const on=b.dataset.pulse===pulseMine;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
}
function setPulse(state){
  if(!activeLessonId||!socket?.connected)return;
  pulseMine=state;socket.emit('lesson:pulse',{lessonId:activeLessonId,state:state||null});renderPulseChips();
  clearTimeout(pulseClearTimer);if(state)pulseClearTimer=setTimeout(()=>setPulse(''),4*60*1000);
  if(state==='lost')toast('O‘qituvchiga anonim belgi yuborildi: «tushunmadim»');
}
function onLessonPulse(x){
  if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
  if(x.reset&&user?.role==='student'){pulseMine='';clearTimeout(pulseClearTimer);renderPulseChips()}
  if(!isLessonHost())return;
  let pill=$('#pulsePill');
  if(!pill){const stage=$('#lesson .video-stage');if(!stage)return;pill=document.createElement('button');pill.id='pulsePill';pill.type='button';pill.className='pulse-pill hidden';pill.title='Bosib nolga qaytarish';pill.addEventListener('click',()=>socket?.emit('lesson:pulse-reset',{lessonId:activeLessonId}));stage.appendChild(pill)}
  const ok=Number(x.ok)||0,lost=Number(x.lost)||0,base=Math.max(ok+lost,Number(x.online)||0,1);
  pill.classList.toggle('hidden',!ok&&!lost);pill.classList.toggle('alert',lost>0&&lost/base>=.2);
  pill.innerHTML='<span>🤔 <b>'+lost+'</b> tushunmadi</span><span>👍 <b>'+ok+'</b></span>';
}
$('#callQuiz')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');openLiveQuizComposer()});
/* ---- Q&A queue, word cloud, random pick, confetti ---- */
let qaItems=[],qaSeen=0,qaVoted=new Set(),liveCloud=null,pickTimer=null;
function hxConfetti(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches||window.HxA11y?.reduceMotion())return;
  const box=document.createElement('div');box.className='hx-confetti';box.setAttribute('aria-hidden','true');
  const colors=['#ffb627','#e5483b','#0b4fd8','#1f9d55','#ff7a45','#8b5cf6'];
  for(let i=0;i<46;i++){const c=document.createElement('i');c.style.left=Math.random()*100+'%';c.style.background=colors[i%colors.length];c.style.animationDelay=(Math.random()*.35)+'s';c.style.animationDuration=(1.6+Math.random()*1.2)+'s';c.style.setProperty('--dx',(Math.random()*160-80)+'px');c.style.setProperty('--r',(Math.random()*720-360)+'deg');box.appendChild(c)}
  document.body.appendChild(box);setTimeout(()=>box.remove(),3400);
}
function qaSheet(){
  let sh=$('#qaSheet');if(sh)return sh;
  sh=document.createElement('div');sh.id='qaSheet';sh.className='room-mode-sheet hidden';sh.setAttribute('role','dialog');sh.setAttribute('aria-modal','true');
  sh.innerHTML='<div class="room-mode-card qa-card"><div class="qa-head"><h2>❓ Savollar</h2><button type="button" class="lq-close qa-x" aria-label="Yopish">×</button></div><p class="room-mode-sub qa-sub"></p><div class="qa-list" id="qaList"></div><form class="qa-form" id="qaForm"><textarea name="t" rows="2" maxlength="280" placeholder="Savolingizni yozing…"></textarea><div class="qa-row"><label class="qa-anon"><input type="checkbox" name="anon" checked> Anonim</label><button type="submit" class="quiz-go">Yuborish</button></div></form></div>';
  sh.addEventListener('click',e=>{
    if(e.target===sh||e.target.closest('.qa-x'))return sh.classList.add('hidden');
    const v=e.target.closest('[data-qa-vote]');if(v){const id=v.dataset.qaVote;qaVoted.has(id)?qaVoted.delete(id):qaVoted.add(id);socket?.emit('lesson:qa-vote',{lessonId:activeLessonId,id});renderQa();return}
    const a=e.target.closest('[data-qa-done]');if(a){socket?.emit('lesson:qa-answer',{lessonId:activeLessonId,id:a.dataset.qaDone});return}
    const r=e.target.closest('[data-qa-del]');if(r){socket?.emit('lesson:qa-answer',{lessonId:activeLessonId,id:r.dataset.qaDel,remove:true});return}
  });
  sh.querySelector('#qaForm').addEventListener('submit',e=>{e.preventDefault();const f=e.target,t=f.t.value.trim();if(t.length<3)return toast('Savol juda qisqa');if(!socket?.connected)return toast('Aloqa yo‘q');socket.emit('lesson:qa-ask',{lessonId:activeLessonId,text:t,anon:f.anon.checked});f.t.value='';toast('Savolingiz navbatga qo‘shildi')});
  document.body.appendChild(sh);return sh;
}
function openQa(){if(!activeLessonId)return toast('Avval darsga kiring');const sh=qaSheet();sh.querySelector('.qa-form').classList.toggle('hidden',isLessonHost());sh.querySelector('.qa-sub').textContent=isLessonHost()?'Talabalar savollari ovozlar soni bo‘yicha tartiblangan. Javob berganingizni belgilang.':'Savol bering yoki boshqalarnikiga 👍 bosing — eng ko‘p ovoz olgan savolga o‘qituvchi birinchi javob beradi.';socket?.emit('lesson:qa-sync',{lessonId:activeLessonId});qaSeen=qaItems.length;updateQaBadge();renderQa();sh.classList.remove('hidden')}
function renderQa(){
  const list=$('#qaList');if(!list)return;const host=isLessonHost();
  list.innerHTML=qaItems.length?qaItems.map(q=>'<div class="qa-item'+(q.answered?' is-done':'')+'"><button type="button" class="qa-vote'+(qaVoted.has(q.id)?' on':'')+'" data-qa-vote="'+esc(q.id)+'"'+(q.answered?' disabled':'')+' aria-label="Ovoz berish"><span>▲</span><b>'+q.votes+'</b></button><div class="qa-body"><p>'+esc(q.text)+'</p><small>'+(q.name?esc(q.name):'Anonim')+(q.answered?' · ✓ javob berildi':'')+'</small></div>'+(host?'<div class="qa-acts"><button type="button" data-qa-done="'+esc(q.id)+'" title="Javob berildi">✓</button><button type="button" data-qa-del="'+esc(q.id)+'" title="O‘chirish">×</button></div>':'')+'</div>').join(''):'<p class="qa-empty">Hozircha savol yo‘q. Birinchi bo‘ling!</p>';
}
function updateQaBadge(){const open=qaItems.filter(q=>!q.answered).length,b=$('#callQa');if(!b)return;let i=b.querySelector('i.control-badge');if(!i){i=document.createElement('i');i.className='control-badge';b.appendChild(i)}i.textContent=String(open);i.classList.toggle('hidden',!open)}
function onLessonQa(x){
  if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
  const before=qaItems.length;qaItems=Array.isArray(x.items)?x.items:[];
  if(isLessonHost()&&qaItems.length>before&&$('#qaSheet')?.classList.contains('hidden')!==false)toast('❓ Yangi savol: '+(qaItems.filter(q=>!q.answered).length)+' ta javobsiz savol');
  updateQaBadge();renderQa();
}
function cloudCard(){let c=$('#liveCloudCard');if(!c){c=document.createElement('section');c.id='liveCloudCard';c.className='live-quiz live-cloud hidden';c.addEventListener('click',e=>{if(e.target.closest('.lq-close'))return c.classList.add('hidden');if(e.target.closest('.lc-end'))return socket?.emit('lesson:cloud-end',{lessonId:activeLessonId})});c.addEventListener('submit',e=>{e.preventDefault();const inp=e.target.querySelector('input');const w=inp.value.trim();if(w.length<2||!liveCloud)return;socket?.emit('lesson:cloud-word',{lessonId:activeLessonId,id:liveCloud.id,word:w});liveCloud.sent=(liveCloud.sent||0)+1;inp.value='';renderCloud()});document.body.appendChild(c)}return c}
function renderCloud(){
  const c=cloudCard(),k=liveCloud;if(!k)return c.classList.add('hidden');
  const host=isLessonHost(),max=Math.max(1,...k.words.map(w=>w.n)),pal=['#ffb627','#7fb2ff','#6fe3a2','#ff8f7a','#c9a6ff','#fff'];
  const words=k.words.map((w,i)=>'<span style="font-size:'+(13+Math.round(22*w.n/max))+'px;color:'+pal[i%pal.length]+'">'+esc(w.w)+(w.n>1?'<sup>'+w.n+'</sup>':'')+'</span>').join(' ');
  const canSend=!host&&k.open&&(k.sent||0)<3;
  c.innerHTML='<div class="lq-head"><span class="lq-tag">☁️ So‘z buluti</span>'+(k.open?'<span class="lq-time">'+(k.people||0)+' kishi</span>':'<span class="lq-tag lq-done">Yakunlandi</span>')+'<button type="button" class="lq-close" aria-label="Yopish">×</button></div><h3 class="lq-q">'+esc(k.prompt||'Bir so‘z bilan ayting')+'</h3><div class="lc-words">'+(words||'<small class="lc-empty">So‘zlar shu yerda paydo bo‘ladi…</small>')+'</div>'+(canSend?'<form class="lc-form"><input maxlength="28" placeholder="Bir-ikki so‘z ('+(3-(k.sent||0))+' ta qoldi)" aria-label="So‘z"><button type="submit" class="lq-end">Yuborish</button></form>':(!host&&k.open?'<div class="lq-foot"><span>✓ So‘zlaringiz qo‘shildi</span></div>':''))+(host&&k.open?'<div class="lq-foot"><span>Talabalar 3 tagacha so‘z yuboradi</span><button type="button" class="lq-end lc-end">Yakunlash</button></div>':'');
  c.classList.remove('hidden');
}
function onLessonCloud(x){if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;const sent=liveCloud?.id===x.id?liveCloud.sent:0,isNew=liveCloud?.id!==x.id;liveCloud={...x,words:x.words||[],sent};if(isNew&&!isLessonHost())try{navigator.vibrate?.(60)}catch{};renderCloud()}
function startCloud(){if(!activeLessonId)return toast('Avval darsga kiring');const p=prompt('So‘z buluti savoli (masalan: «Bugungi mavzu bir so‘zda»):','Bugungi mavzu bir so‘zda');if(p===null)return;socket?.emit('lesson:cloud-start',{lessonId:activeLessonId,prompt:p})}
function onLessonPick(x){
  if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
  const me=String(user?._id||user?.id||'')===String(x.userId);
  if(me){try{navigator.vibrate?.([80,60,80])}catch{};hxConfetti();toast('🎲 O‘qituvchi sizni tanladi! Javob berishga tayyorlaning')}
  if(!isLessonHost())return;
  let c=$('#livePickCard');if(!c){c=document.createElement('section');c.id='livePickCard';c.className='live-quiz live-pick hidden';c.addEventListener('click',e=>{if(e.target.closest('.lq-close'))return c.classList.add('hidden');if(e.target.closest('.lp-again'))return socket?.emit('lesson:pick',{lessonId:activeLessonId});const sp=e.target.closest('.lp-spot');if(sp){socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId:sp.dataset.uid});c.classList.add('hidden')}});document.body.appendChild(c)}
  const names=(x.names&&x.names.length?x.names:[x.name]);let n=0;clearInterval(pickTimer);
  const frame=(name,final)=>{c.innerHTML='<div class="lq-head"><span class="lq-tag">🎲 Tasodifiy talaba</span><button type="button" class="lq-close" aria-label="Yopish">×</button></div><div class="lp-name'+(final?' final':'')+'">'+esc(name)+'</div>'+(final?'<div class="lq-foot"><button type="button" class="lq-end lp-spot" data-uid="'+esc(x.userId)+'">Ekranga chiqarish</button><button type="button" class="lq-end lp-again">Yana bir marta</button></div>':'');c.classList.remove('hidden')};
  pickTimer=setInterval(()=>{n++;if(n>=14||names.length<2){clearInterval(pickTimer);frame(x.name,true);return}frame(names[Math.floor(Math.random()*names.length)],false)},90);
}
function resetLiveFun(){qaItems=[];qaSeen=0;qaVoted=new Set();liveCloud=null;clearInterval(pickTimer);for(const id of ['#qaSheet','#liveCloudCard','#livePickCard'])$(id)?.classList.add('hidden');updateQaBadge()}
$('#callQa')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');openQa()});
$('#callCloud')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');startCloud()});
$('#callPick')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');if(!activeLessonId)return toast('Avval darsga kiring');socket?.emit('lesson:pick',{lessonId:activeLessonId})});
/* ---- Electronic board, virtual lab, floating lesson camera ---- */
let board=null,labApi=null;
const canvasSharing=label=>Boolean(mediaRoomClient&&!mediaRoomClient.closed&&mediaRoomClient.producers?.get?.('screen')&&mediaRoomClient.canvasShareLabel===label);
const canPresent=()=>Boolean(activeLessonId&&mediaRoomClient&&!mediaRoomClient.closed&&isLessonHost());
function getBoard(){
  if(!board)board=createWhiteboard({toast,getCameraTrack:()=>mediaRoomClient?.localCameraTrack?.()||null,showCam:()=>Boolean(activeLessonId&&mediaRoomClient&&!mediaRoomClient.closed&&isLessonHost()),canShare:canPresent,
    onShare:(c,l)=>mediaRoomClient?mediaRoomClient.shareCanvas(c,{label:l,fps:15}):Promise.resolve(false),onStopShare:()=>mediaRoomClient?.stopScreenShare?.(),
    isSharing:()=>canvasSharing('Elektron doska'),storageKey:()=>'m2-board:'+(activeLessonId||'free')});
  return board;
}
function openBoard(){if(canvasSharing('Virtual laboratoriya'))mediaRoomClient.stopScreenShare();getBoard().open({share:true}).catch(e=>toast(e.message||String(e)))}
function loadLab(){
  const root=$('#labRoot');if(!root)return;
  if(!labApi)labApi=mountVirtualLab(root,{toast,canShare:canPresent,share:async(c,l)=>{if(board?.isOpen)await board.close();return mediaRoomClient?.shareCanvas(c,{label:l,fps:24})},stopShare:()=>mediaRoomClient?.stopScreenShare?.(),isSharing:()=>canvasSharing('Virtual laboratoriya'),userName:()=>user?.fullName||user?.login||''});
  else labApi.refresh();
}
function stageTrackForFloat(){
  if(isLessonHost())return mediaRoomClient?.localCameraTrack?.()||null;
  const t=$('#hxStageVideo')?.srcObject?.getVideoTracks?.()[0];return t&&t.readyState==='live'?t:null;
}
function syncFloatCam(){
  const page=document.documentElement.dataset.page,active=Boolean(activeLessonId&&mediaRoomClient&&!mediaRoomClient.closed);
  let box=$('#hxFloatCam');
  if(!active||page==='lesson'||board?.isOpen){if(box){box.classList.add('hidden');const v=box.querySelector('video');if(v.srcObject)v.srcObject=null}return}
  if(!box){
    box=document.createElement('div');box.id='hxFloatCam';box.className='hx-float-cam hidden';box.setAttribute('role','region');box.setAttribute('aria-label','Jonli dars kamerasi');
    box.innerHTML='<video muted playsinline autoplay></video><span class="hfc-off">Kamera o‘chiq</span><div class="hfc-bar"><span class="hfc-live">● Jonli</span><button type="button" data-f="mic" title="Mikrofon">🎙</button><button type="button" data-f="back">Darsga qaytish</button></div><button type="button" class="hfc-min" data-f="min" aria-label="Kamerani kichraytirish yoki kattalashtirish">–</button>';
    box.addEventListener('click',e=>{const f=e.target.closest('[data-f]')?.dataset.f;if(f==='back')go('lesson');if(f==='min'){const m=box.classList.toggle('min');e.target.closest('[data-f]').textContent=m?'+':'–'}if(f==='mic')mediaRoomClient?.toggleMic?.().catch(()=>{})});
    let sx=0,sy=0,ox=0,oy=0,drag=false;
    box.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag=true;box.setPointerCapture?.(e.pointerId);const r=box.getBoundingClientRect();sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top});
    box.addEventListener('pointermove',e=>{if(!drag)return;const r=box.getBoundingClientRect(),x=Math.max(6,Math.min(innerWidth-r.width-6,ox+e.clientX-sx)),y=Math.max(6,Math.min(innerHeight-r.height-6,oy+e.clientY-sy));Object.assign(box.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'})});
    box.addEventListener('pointerup',()=>{drag=false});
    document.body.appendChild(box);
  }
  const v=box.querySelector('video'),t=stageTrackForFloat();
  box.classList.remove('hidden');box.classList.toggle('off',!t);
  if(t&&v.srcObject?.getVideoTracks?.()[0]!==t){v.srcObject=new MediaStream([t]);v.play().catch(()=>{})}
  if(!t&&v.srcObject)v.srcObject=null;
  const mb=box.querySelector('[data-f=mic]');mb.classList.toggle('on',Boolean(micOn));mb.hidden=!isLessonHost()&&!micOn;mb.title=micOn?'Mikrofon yoqiq — o‘chirish':'Mikrofonni yoqish';
}
setInterval(syncFloatCam,1500);
$('#callBoard')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');openBoard()});
$('#callLab')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');$('#callMore')?.classList.remove('active-control');go('lab')});
$('#labOpenBoard')?.addEventListener('click',openBoard);
async function openConference(payload){
  const join=payload.join,s=payload.schedule;if(!join||!s)return toast('Video xona ma’lumoti topilmadi');
  if(join.provider!=='mediasoup')return toast('Media provayder sozlamasi noto‘g‘ri');
  if(!window.MasofaviyMediaClientBundle?.MediaRoomClient)return toast('Mediasoup klient yuklanmagan. Ctrl+F5 qiling.');
  if(activeLessonId&&activeLessonId!==String(s._id))await leaveConference(false); // leave A's socket room before joining B
  const seq=++conferenceSeq;let ok=false;
  if(chatLessonId!==String(s._id)){$('#messages')?.replaceChildren();chatLessonId=String(s._id)}
  activeLessonId=String(s._id);activeLiveSession={schedule:s,join};lastLessonPayload=payload;chatUnread=0;setHandRaised(false);raisedHands.clear();raisedHandUsers.clear();updateRaisedHandAlert();
  go('lesson');$('#liveLessonTitle').textContent=s.title||'Jonli dars';$('#liveLessonMeta').textContent=(s.groupId?.name||'Guruh')+' · '+(s.teacherId?.fullName||'O‘qituvchi')+' · '+s.start+'–'+s.end+(user.role==='student'?' · Proktor kamera lokal nazoratda':' · Yuz-faollik nazorati');
  $('#endLiveLesson').classList.add('hidden');$('#lesson')?.classList.toggle('student-focus-live',user.role==='student');$('#teacherQuickControls')?.classList.toggle('hidden',user.role!=='teacher'&&!can('live.manage'));$('#callQuiz')?.classList.toggle('hidden',user.role!=='teacher'&&!can('live.manage'));$('#callCloud')?.classList.toggle('hidden',user.role!=='teacher'&&!can('live.manage'));$('#callPick')?.classList.toggle('hidden',user.role!=='teacher'&&!can('live.manage'));$('#callBoard')?.classList.toggle('hidden',user.role!=='teacher'&&!can('live.manage'));resetLiveExtras();resetLiveFun();setTimeout(()=>{if(activeLessonId)socket?.emit('lesson:qa-sync',{lessonId:activeLessonId})},2500);$('#chatUnreadBadge')?.classList.add('hidden');startLessonClock();startNetworkMonitor();clearInterval(hxStageTimer);if(user.role==='student')hxStageTimer=setInterval(syncStudentStage,1000);
  const mount=$('#videoMount');mount.innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Universitet SFU serveriga ulanmoqda…</b><small>'+(user.role==='student'?'Talaba · broadcast kamera OFF · proktor kamera majburiy':(ultraLiteUI?'Lite qurilma · adaptiv HD':'O‘qituvchi media tayyorlanmoqda'))+'</small></div>';
  try{
    if(mediaRoomClient)await mediaRoomClient.close().catch(()=>{});
    if(seq!==conferenceSeq)return false;
    const client=mediaRoomClient=new window.MasofaviyMediaClientBundle.MediaRoomClient({
      socket,joinPayload:join,mount,user,lowEnd:lowEndUI,
      onTeacherPiPClick:({userId})=>{
        if(!activeLessonId||!userId)return;
        if(user.role==='teacher'||can('live.manage'))socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId});
        else mediaRoomClient?.focusUserForClass?.(userId);
      },
      onState:state=>{
        if(user?.role==='student')queueMicrotask(syncStudentStage);
        if(state.inRoom!==undefined)updateRoomModeUI();
        if(state.mic!==undefined){micOn=Boolean(state.mic);const b=$('#callMic');b?.classList.toggle('active-control',micOn);b?.classList.toggle('is-off',!micOn);b?.setAttribute('aria-pressed',micOn?'true':'false');b?.setAttribute('title',micOn?'Mikrofon ON — aks-sadoni kamaytirish uchun quloqchin tavsiya etiladi':'Mikrofon OFF — yoqish')}
        if(state.micBusy!==undefined){const b=$('#callMic');if(b){b.disabled=Boolean(state.micBusy);b.classList.toggle('is-busy',Boolean(state.micBusy));b.setAttribute('aria-busy',state.micBusy?'true':'false')}}
        if(state.camera!==undefined){cameraOn=Boolean(state.camera);const b=$('#callCamera');b?.classList.toggle('active-control',cameraOn);b?.classList.toggle('is-off',!cameraOn);b?.setAttribute('aria-pressed',cameraOn?'true':'false');b?.setAttribute('title',user.role==='student'?(cameraOn?'Kamera ON — o‘qituvchiga ko‘rinadi. Proktor lokal ishlaydi':'Kamera OFF — o‘qituvchiga uzatilmaydi. Proktor lokal ishlaydi'):(cameraOn?'Kamera ON — o‘chirish':'Kamera OFF — yoqish'))}
        if(state.cameraBusy!==undefined){const b=$('#callCamera');if(b){b.disabled=Boolean(state.cameraBusy);b.classList.toggle('is-busy',Boolean(state.cameraBusy));b.setAttribute('aria-busy',state.cameraBusy?'true':'false')}}
        if(state.screen!==undefined){const b=$('#callScreen');b?.classList.toggle('active-control',Boolean(state.screen));b?.setAttribute('aria-pressed',state.screen?'true':'false')}
        if(state.proximityGuard!==undefined){const b=$('#echoGuard');b?.classList.toggle('active-control',state.proximityGuard);b?.setAttribute('aria-pressed',state.proximityGuard?'true':'false')}
        if(state.studentVideoChanged!==undefined)syncTeacherRailCamera(state.studentVideoChanged);
        if(state.railMediaChanged)syncTeacherRailCamera();
        if(state.autoHalfDuplex&&Date.now()-(window._lastAudioSafetyNotice||0)>20000){window._lastAudioSafetyNotice=Date.now();toast('Chiyillash aniqlandi: karnay xavfsizlik uchun vaqtincha o‘chirildi. Eshitish uchun mikrofonni OFF qiling yoki quloqchin ulang.')}
        if(state.audioBlocked&&Date.now()-lastAudioBlockedToast>15000){lastAudioBlockedToast=Date.now();toast('Ovoz bloklangan bo‘lsa, sahifaga bir marta bosing')}
        if(state.micInterrupted)toast('Mikrofon uzildi (quloqchin yoki qo‘ng‘iroq). Qayta yoqish uchun mikrofon tugmasini bosing.');
        if(state.aecUnavailable)toast('Qurilmangizda echo cancellation faol emas. Quloqchin ishlating va karnay ovozini pasaytiring.');
        if(state.videoQuality&&$('#videoQuality'))$('#videoQuality').value=state.videoQuality;
        if(state.participants){const n=Array.isArray(state.participants)?state.participants.length:Number(state.participants||0);if($('#participantCountBadge'))$('#participantCountBadge').textContent=String(n)}
        if(state.viewMode)$('#callViewMode')?.classList.toggle('active-control',state.viewMode==='gallery');
        if(Array.isArray(state.speakingUserIds)){lessonActiveSpeakerUserIds=new Set(state.speakingUserIds.map(String));updateLessonRailSpeakerState()}
        if(state.lowBandwidth!==undefined)$('#callLowBandwidth')?.classList.toggle('active-control',Boolean(state.lowBandwidth));
        if(state.severeFeedback&&state.feedbackGuard&&!state.coordinatedFeedback&&activeLessonId&&socket?.connected){
          const now=Date.now();
          if(now-lastRoomFeedbackAlertAt>900){
            lastRoomFeedbackAlertAt=now;
            socket.emit('lesson:feedback-alert',{lessonId:activeLessonId,frequency:Number(state.feedbackFrequency)||0,duration:120000});
          }
        }
        if(state.transport){const bad=['failed','disconnected','recovering'].includes(state.state);$('#connectionBanner')?.classList.toggle('hidden',!bad);if(state.recoveryFailed)autoRejoinLesson(true);if(state.state==='connected'){$('#callRejoin')?.classList.add('hidden');clearTimeout(autoRejoinTimer);autoRejoinTimer=null;}}
        if(state.cameraInterrupted)toast('Kamera uzildi. Avtomatik tiklash tekshirilmoqda.');
        if(state.micIdleMuted)toast('Mikrofon 2 daqiqa jim turgani uchun o‘chirildi (shovqin bo‘lmasligi uchun). Gapirish uchun qayta yoqing.');
      },
      onError:e=>toast(e.message||String(e))
    });
    if(user.role==='student'){
      const proctorOk=await startLiveLessonProctoring();
      if(seq!==conferenceSeq)return false;
      if(!proctorOk)throw Object.assign(new Error('Jonli darsga kirish uchun kamera ruxsati va proktor kamera majburiy'),{noRetry:true});
    }
    if(user.role==='student'){const saved=roomModeSaved();client.inRoom=saved?saved==='room':true}
    await client.connect();
    if(seq!==conferenceSeq||client.closed)return false;
    const isTeachingRole=user.role==='teacher';
    const isAdminPresenter=user.role==='superadmin'||(user.role==='admin'&&can('live.manage'));
    if(isTeachingRole||isAdminPresenter){
      // Administrators conducting test lessons need the same camera-on entry experience.
      // Store manual OFF per role; only teachers auto-enable microphone.
      const cameraKey=isTeachingRole?'m2-teacher-camera-wanted':'m2-admin-camera-wanted';
      if(localStorage.getItem(cameraKey)!=='0')await mediaRoomClient.toggleCamera();
      if(isTeachingRole&&localStorage.getItem('m2-teacher-mic-wanted')!=='0')await mediaRoomClient.toggleMic();
    }
    if(join.mediaRole==='interpreter'&&localStorage.getItem('m2-interpreter-camera-wanted')!=='0'&&!cameraOn)await mediaRoomClient.toggleCamera().catch(()=>{}); // sign-language interpreter: video is the whole job
    if($('#videoQuality'))$('#videoQuality').value=localStorage.getItem('m2-video-quality')||'auto';
    $('#echoGuard')?.classList.toggle('active-control',mediaRoomClient.proximityGuard);$('#echoGuard')?.setAttribute('aria-pressed',mediaRoomClient.proximityGuard?'true':'false');
    if(socket?.connected)socket.emit('lesson:join',{lessonId:activeLessonId});
    keepLessonAwake();
    studentCameraGranted=user.role!=='student';studentMicGranted=true; // Student broadcast is opt-in on every camera ON action.
    showLessonSide(user.role==='student'?'chat':'participants',false);setLessonDrawer(false);
    if(user.role!=='student')await loadLessonParticipants();
    if(user.role==='student'){updateRoomModeUI();if(!roomModeSaved())showRoomModeSheet();else toast(mediaRoomClient.inRoom?'Auditoriya rejimi: telefon ovozi o‘chiq, subtitr va video ishlaydi':'Jonli darsga ulandingiz · quloqchin tavsiya etiladi')}
    else toast('Jonli darsga ulandingiz');
    ok=true;
    setupLessonInclusion(String(s._id),join).catch(()=>{});
  }catch(e){
    if(seq!==conferenceSeq)return false;
    if(user.role==='student'){await liveProctorStop?.().catch?.(()=>{});liveProctorStop=()=>{}}
    try{await mediaRoomClient?.close()}catch{};mediaRoomClient=null; // lets socket 'connect' trigger a fresh rejoin
    ok=e?.noRetry?null:false;
    mount.innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Darsga ulanib bo‘lmadi</b><small>'+esc(e.message)+'</small><button id="retryMediaRoom" class="primary">Qayta ulanish</button></div>';
    $('#retryMediaRoom')?.addEventListener('click',()=>rejoinActiveLesson()); // fresh join = fresh media ticket
  }
  hydrateIcons($('#lesson'));
  return ok;
}
function leaveConference(back=true){
  conferenceSeq++;
  return leavingConference||(leavingConference=leaveConferenceNow(back).finally(()=>{leavingConference=null}));
}
async function leaveConferenceNow(back=true){
  if(handRaised&&activeLessonId&&socket?.connected)socket.emit('lesson:raise-hand',{lessonId:activeLessonId,raised:false});setHandRaised(false);
  clearTimeout(participantsTimer);clearTimeout(proctorRestartTimer);proctorRestarts=0;attendanceDirty=false;autoRejoinAttempt=0;lastAutoQuality='';chatUnread=0;$('#chatUnreadBadge')?.classList.add('hidden');$('#lesson')?.classList.remove('student-focus-live');$('#connectionBanner')?.classList.add('hidden');$('#callRejoin')?.classList.add('hidden');
  await liveProctorStop?.();liveProctorStop=()=>{};liveProctorStates.clear();lessonRailRows=[];lessonActiveSpeakerUserIds.clear();$('#lessonStudentRailItems')?.replaceChildren();
  stopCaptions(true);resetLessonInclusion();clearInterval(lessonTimer);clearInterval(networkTimer);clearInterval(hxStageTimer);hxStageTimer=null;$('#hxStageVideo')?.remove();$('#hxStagePip')?.remove();$('#lesson .video-stage')?.classList.remove('hx-stage-live');hideRoomModeSheet();$('#roomModePill')?.classList.add('hidden');resetLiveExtras();resetLiveFun();if(board?.isOpen)board.close().catch(()=>{});lessonTimer=null;networkTimer=null;if(autoRejoinTimer){clearTimeout(autoRejoinTimer);autoRejoinTimer=null}
  if(activeLessonId&&socket?.connected)socket.emit('lesson:leave',{lessonId:activeLessonId});
  if(mediaRoomClient){try{await mediaRoomClient.close()}catch{}mediaRoomClient=null}
  releaseLessonWakeLock();activeLessonId='';activeLiveSession=null;raisedHands.clear();raisedHandUsers.clear();updateRaisedHandAlert();cameraOn=false;micOn=false;studentCameraGranted=false;studentMicGranted=false;setLessonDrawer(false);$('#videoMount').innerHTML='<div class="video-placeholder"><span>'+icon('video','◉')+'</span><b>Video xona yopildi</b><small>Guruh darslari sahifasidan boshqa xonani tanlang.</small></div>';if(back){go('live');loadLiveRooms()}
}
async function endLiveRoom(id,fromCall=true){
  if(!await askConfirmation('Jonli dars yakunlansinmi?'))return;
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
    attendanceDirty=false;
    await loadLessonParticipants();
  }catch(e){toast(e.message)}
}
let lessonRailRows=[],lessonActiveSpeakerUserIds=new Set();
const studentCameraRequests=new Map();
function syncTeacherRailCamera(userId=''){
  if(user?.role==='student'||!mediaRoomClient)return;
  const rows=userId?[...document.querySelectorAll('#lessonStudentRailItems [data-student-id]')].filter(r=>r.dataset.studentId===String(userId)):
    [...document.querySelectorAll('#lessonStudentRailItems [data-student-id]')];
  for(const row of rows){
    const status=mediaRoomClient.studentCameraState?.(row.dataset.studentId)||'off';
    row.classList.toggle('live-video',status==='live');
    row.classList.toggle('video-connecting',status==='connecting');
    const source=[...(mediaRoomClient.tiles?.values()||[])].find(t=>t.dataset?.userId===String(row.dataset.studentId)&&t.dataset?.role==='student');
    const track=source?.querySelector('video')?.srcObject?.getVideoTracks?.()[0];
    const preview=row.querySelector('video.rail-live-video');
    if(!preview)continue;
    if(status==='live'&&track?.readyState==='live'){
      const old=preview.srcObject?.getVideoTracks?.()[0];
      if(old!==track)preview.srcObject=new MediaStream([track]);
      preview.play().catch(()=>{});
    }else if(preview.srcObject)preview.srcObject=null;
    const tag=row.querySelector('.rail-video-state');
    if(tag)tag.textContent=status==='live'?'':status==='connecting'?'Video ulanmoqda':'';
    row.classList.toggle('mic-on',Boolean(mediaRoomClient.studentMicOn?.(row.dataset.studentId)));
  }
  updateLessonRailOrder();
}
// Rail order: live camera first, then speaking, then microphone on, then online, then offline.
// CSS order (not DOM moves) keeps playing <video> elements from restarting.
function updateLessonRailOrder(){
  const host=$('#lessonStudentRailItems');if(!host)return;
  const cards=[...host.querySelectorAll('[data-student-id]')];let live=0;
  cards.forEach((el,i)=>{
    const video=el.classList.contains('live-video'),connecting=el.classList.contains('video-connecting'),speak=el.classList.contains('speaking'),mic=el.classList.contains('mic-on'),online=el.dataset.online==='1';
    if(video)live++;
    const rank=video?(speak?0:1):connecting?2:speak?3:mic?4:online?5:6;
    el.style.order=String(rank*1000+i);
  });
  host.classList.toggle('has-live-video',live>0);
  const label=$('#lessonStudentRailCount');if(label)label.dataset.live=String(live);
}

function updateLessonRailSpeakerState(){
  document.querySelectorAll('#lessonStudentRailItems [data-student-id]').forEach(el=>el.classList.toggle('speaking',lessonActiveSpeakerUserIds.has(el.dataset.studentId)));
  updateLessonRailOrder();
}
function updateLessonRailStatus(userId,proctor){
  const el=[...document.querySelectorAll('#lessonStudentRailItems [data-student-id]')].find(x=>x.dataset.studentId===String(userId));
  if(!el)return;
  el.classList.toggle('face-ready',Boolean(proctor?.cameraReady&&proctor?.faceState==='present'));
  const tag=el.querySelector('.rail-proctor-status');if(tag)tag.textContent=proctor?.cameraReady?(proctor.faceState==='present'?'✓ Yuz faol':proctor.faceState==='away'?'⚠ Bosh burilgan':proctor.faceState==='missing'?'⚠ Yuz yo‘q':'◌ Tahlil yo‘q'):'○ Kamera yo‘q';
}
function renderLessonStudentRail(rows,groupAudit=null){
  lessonRailRows=rows||[];
  const groupLabel=$('#lessonRailGroup');
  if(groupLabel){const g=groupAudit?.group;groupLabel.textContent=g?.name?' · '+g.name:'';groupLabel.title=g?.code?'Guruh kodi: '+g.code+' · Ushbu darsga biriktirilgan guruh':'Dars guruhining ro‘yxati';}
  const host=$('#lessonStudentRailItems'),label=$('#lessonStudentRailCount');if(!host)return;
  if(label)label.textContent=String(lessonRailRows.filter(r=>r.online).length)+' / '+String(lessonRailRows.length);
  host.innerHTML=lessonRailRows.map(r=>{
    const name=String(r.fullName||r.login||'Talaba');
    const initials=name.trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase();
    const proctor=liveProctorStates.get(String(r._id))||r.proctor||{};
    const status=proctor.cameraReady?(proctor.faceState==='present'?'✓ Yuz faol':proctor.faceState==='away'?'⚠ Bosh burilgan':proctor.faceState==='missing'?'⚠ Yuz yo‘q':'◌ Tahlil yo‘q'):'○ Kamera yo‘q';
    return '<button class="student-rail-card '+(r.online?'online':'offline')+(proctor.cameraReady&&proctor.faceState==='present'?' face-ready':'')+'" data-student-id="'+esc(r._id)+'" data-online="'+(r.online?'1':'0')+'" type="button" role="listitem" title="'+esc(name)+' · '+(r.online?'Onlayn':'Oflayn')+'"><video class="rail-live-video" muted playsinline autoplay aria-hidden="true"></video><span class="rail-avatar">'+esc(initials)+'</span><b>'+esc(name)+'</b><small class="rail-proctor-status">'+esc(status)+'</small><small class="rail-video-state"></small><i class="rail-mic" aria-hidden="true"></i><i class="rail-presence-dot"></i></button>'
  }).join('')||'<span class="rail-loading">Guruhda talaba topilmadi</span>';
  host.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.studentId;
    if(button.dataset.online!=='1')return toast('Talaba hozir darsga ulanmagan');
    if(user.role==='teacher'||can('live.manage')||can('lessons.monitor')){
      requestStudentOnStage(id);
    }else{
      const ok=mediaRoomClient?.focusUserForClass?.(id);
      if(!ok)toast('Talabaning jonli videosi hozir uzatilmayapti');
    }
  }));
  updateLessonRailSpeakerState();
  syncTeacherRailCamera();
}
function requestStudentOnStage(id){
  if(!activeLessonId||!id||!mediaRoomClient)return;
  if(mediaRoomClient.focusAvailableStudentVideo?.(id)){toast('Talabaning jonli videosi asosiy ekranga chiqarildi');return}
  if(mediaRoomClient.studentCameraState?.(id)==='connecting'){toast('Talaba kamerasi uzatilmoqda, video oqimi ulanishini kuting');return}
  const key=String(activeLessonId)+':'+String(id),now=Date.now();
  if(now-(studentCameraRequests.get(key)||0)<15000){toast('So‘rov avval yuborilgan. Talabaning javobini kuting');return}
  studentCameraRequests.set(key,now);
  socket?.emit('lesson:proctor-camera-request',{lessonId:activeLessonId,userId:id});
  toast('Talabaga kamerani o‘qituvchiga uzatish so‘rovi yuborildi');
}
async function loadLessonParticipants(){
  if(!activeLessonId||user?.role==='student')return;
  const lessonId=activeLessonId,seq=++participantsSeq;
  try{
    const x=await api('/live/rooms/'+activeLessonId+'/participants'),rows=x.students||[],audit=x.groupAudit||null;
    if(seq!==participantsSeq||lessonId!==activeLessonId)return; // a newer refresh or another lesson won
    renderLessonStudentRail(rows,audit);
    if(attendanceDirty){$('#attendanceSave')?.classList.add('needs-save');return} // keep the teacher's unsaved marksconst label={present:'Vaqtida',late:'Kechikkan',absent:'Yo‘q',excused:'Sababli',pending:'Kutilmoqda'};
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
    const auditCounts=items=>(Array.isArray(items)?items:[]).map(x=>esc(x.name)+' ('+Number(x.count||0)+')').join(', ')||'Kiritilmagan';
    const auditInfo=audit?'<details class="lesson-roster-audit"><summary>Guruh tarkibini tekshirish · '+esc(audit.group?.name||'Guruh')+' · '+rows.length+' ta akkaunt</summary><p><b>Guruh kodi:</b> '+esc(audit.group?.code||'Kiritilmagan')+'</p><p><b>Yo‘nalishlar:</b> '+auditCounts(audit.byDirection)+'</p><p><b>Kurslar:</b> '+auditCounts(audit.byCourseYear)+'</p><p><b>Importdagi guruh belgilari:</b> '+auditCounts(audit.declaredGroupLabels)+'</p><small>Ro‘yxat dars jadvalidagi groupId bilan biriktirilgan faol talaba akkauntlaridir. Guruh kodlari noto‘g‘ri biriktirilgan bo‘lsa, administrator foydalanuvchi profilini tuzatishi kerak.</small></details>':'';
    $('#lessonParticipants').innerHTML=summary+auditInfo+toolbar+rows.map(r=>{
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
    $('#attendanceMarkAll')?.addEventListener('click',()=>{all('#lessonParticipants [data-attendance-check]').forEach(x=>x.checked=true);attendanceDirty=true;$('#attendanceSave')?.classList.add('needs-save')});
    $('#attendanceSave')?.addEventListener('click',saveManualAttendance);
    const spotlightUser=id=>requestStudentOnStage(id);
    const inspectUser=id=>{if(!id)return;if(user.role==='teacher'||can('live.manage')||can('lessons.monitor'))requestStudentOnStage(id);else mediaRoomClient?.focusUserForClass?.(String(id))};
    all('[data-spotlight-user]').forEach(b=>b.onclick=e=>{e.stopPropagation();spotlightUser(b.dataset.spotlightUser)});
    all('[data-proctor-camera-user]').forEach(b=>b.onclick=e=>{e.stopPropagation();inspectUser(b.dataset.proctorCameraUser)});
    all('#lessonParticipants [data-focus-user]').forEach(row=>{
      row.onclick=e=>{if(e.target.closest('input,select,button,label'))return;inspectUser(row.dataset.focusUser)};
      row.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('input,select,button,label')){e.preventDefault();inspectUser(row.dataset.focusUser)}};
    });
  }catch(e){if(seq===participantsSeq&&lessonId===activeLessonId)$('#lessonParticipants').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
$('#lessonParticipants')?.addEventListener('change',e=>{if(e.target.matches?.('[data-attendance-check],[data-attendance-status]')){attendanceDirty=true;$('#attendanceSave')?.classList.add('needs-save')}});
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
  requestStudentOnStage(first.userId);
  toast(first.fullName+' bilan asosiy sahnaga chiqish so‘rovi yuborildi');
}
$('#raisedHandOpen')?.addEventListener('click',()=>showLessonSide('participants'));
$('#raisedHandSpotlight')?.addEventListener('click',approveRaisedHand);
function showLessonSide(which,openDrawer=true){
  if(user?.role==='student')which='chat'; // students only see their own controls + course chat
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
  const fsCap=document.querySelector('#videoMount .ms-fs-caption');if(fsCap){fsCap.innerHTML=(fullName?'<b>'+esc(fullName)+'</b>':'')+esc(clean);fsCap.classList.add('show')}
  clearTimeout(captionClearTimer);captionClearTimer=setTimeout(()=>{box.classList.add('hidden');$('#captionText').textContent='';$('#captionSpeaker').textContent='';document.querySelector('#videoMount .ms-fs-caption')?.classList.remove('show')},5000);
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
      socket?.emit('lesson:caption',{lessonId:activeLessonId,text:normalized,lang:rec.lang,final:Boolean(newFinal),segment:newFinal?normalizeMathCaption(newFinal.trim(),rec.lang):''});
      if(newFinal)pushTranscriptLine(user.fullName,normalizeMathCaption(newFinal.trim(),rec.lang),Date.now());
    }
  };
  rec.onerror=e=>{if(!['no-speech','aborted'].includes(e.error||''))toast('Subtitr: '+(e.error||'ovozni aniqlab bo‘lmadi'))};
  rec.onend=()=>{if(captionsEnabled&&activeLessonId)setTimeout(()=>{try{rec.start()}catch{}},250)};
  try{rec.start();$('#callCaptions')?.classList.add('active-control');showCaption('', 'Subtitr tinglamoqda…');toast('Jonli subtitr yoqildi')}catch{toast('Subtitrni ishga tushirib bo‘lmadi')}
}
$('#showParticipants')?.addEventListener('click',()=>showLessonSide('participants'));
$('#showLessonChat')?.addEventListener('click',()=>showLessonSide('chat'));
$('#callAttendance')?.addEventListener('click',()=>{if(user?.role!=='student')showLessonSide('participants')});
$('#callParticipants')?.addEventListener('click',()=>{if(user?.role==='student')return;showLessonSide('participants');loadLessonParticipants().catch(()=>{})});
$('#railOpenParticipants')?.addEventListener('click',()=>{showLessonSide('participants');loadLessonParticipants().catch(()=>{})});
$('#closeLessonDrawer')?.addEventListener('click',()=>setLessonDrawer(false));
$('#lessonDrawerBackdrop')?.addEventListener('click',()=>setLessonDrawer(false));
$('#callMic').onclick=async()=>{
  if(!mediaRoomClient)return toast('Avval video xonaga kiring');
  try{const wanted=!micOn;const result=await mediaRoomClient.toggleMic();if(user?.role==='teacher'&&result===wanted)localStorage.setItem('m2-teacher-mic-wanted',wanted?'1':'0')}catch(e){toast(e.message)}
};
$('#callCamera').onclick=async()=>{
  if(!mediaRoomClient)return toast('Avval video xonaga kiring');
  if(user?.role==='student'&&!cameraOn){
    // Proctor face processing remains local; broadcasting is a separate, explicit choice.
    // Pressing the camera control is an explicit user gesture. Do not block every
    // ON/OFF with a browser confirm; the local proctor track remains separate.
    studentCameraGranted=true;
  }
  try{
    const wanted=!cameraOn;
    const result=await mediaRoomClient.toggleCamera();
    if(result===wanted){
      const key=user?.role==='teacher'?'m2-teacher-camera-wanted':(user?.role==='superadmin'||(user?.role==='admin'&&can('live.manage'))?'m2-admin-camera-wanted':'');
      if(key)localStorage.setItem(key,wanted?'1':'0');
    }
  }catch(e){toast(e.message)}
};
$('#callScreen').onclick=async()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');try{await mediaRoomClient.toggleScreen()}catch(e){toast(e.message)}};
$('#videoQuality')?.addEventListener('change',async()=>{if(!mediaRoomClient)return;await mediaRoomClient.setReceiveQuality($('#videoQuality').value);toast('Video sifati: '+($('#videoQuality').value==='auto'?'Auto':$('#videoQuality').value+'p'))});
$('#echoGuard')?.addEventListener('click',()=>{if(!mediaRoomClient)return toast('Avval video xonaga kiring');const on=mediaRoomClient.setProximityGuard(!mediaRoomClient.proximityGuard);toast(on?'Yaqin qurilmalar rejimi ON: mikrofon yoniq paytda karnay ovozi bloklanadi. Eshitish uchun mikrofonni OFF qiling.':'Yaqin qurilmalar rejimi OFF. Echo cancellation va chiyillash kuzatuvi faol qoladi.');});
$('#callChat').onclick=()=>{if(user?.role==='student'){showLessonSide('chat',false);const i=$('#chatForm input');i?.focus();i?.scrollIntoView?.({block:'nearest'});return}showLessonSide('chat')};
function applyInclusivePrefs(){
  document.documentElement.classList.toggle('inclusive-mode',accessibilityEnabled);
  document.documentElement.dataset.captionSize=String(captionSizeLevel);
  $('#accessibilityMode')?.classList.toggle('active-control',accessibilityEnabled);
  $('#captionMath')?.classList.toggle('active-control',captionMathEnabled);
  const btn=$('#captionSize');if(btn)btn.querySelector('span').textContent=['A','A+','A++'][captionSizeLevel]||'A';
}
$('#captionMath')?.addEventListener('click',()=>{captionMathEnabled=!captionMathEnabled;applyInclusivePrefs();toast(captionMathEnabled?'Matematik subtitr yoqildi':'Matematik subtitr o‘chirildi')});
$('#captionSize')?.addEventListener('click',()=>{captionSizeLevel=(captionSizeLevel+1)%3;localStorage.setItem('m2-caption-size',String(captionSizeLevel));const h=window.HxA11y;if(h)h.set({...h.get(),captionSize:captionSizeLevel},{silent:true});applyInclusivePrefs()});
$('#accessibilityMode')?.addEventListener('click',()=>{$('#liveMorePanel')?.classList.add('hidden');a11y.open()});
function syncA11yLive(p){p=p||window.HxA11y?.get()||{};accessibilityEnabled=Boolean(p.strongFocus||p.reduceMotion||p.preset||localStorage.getItem('m2-accessibility')==='1');captionSizeLevel=Number(p.captionSize)||0;applyInclusivePrefs();if(p.captionsAlways&&activeLessonId)showTranscriptPanel(true)}
window.HxA11y?.onChange(p=>syncA11yLive(p));
syncA11yLive();
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
  return '<article class="video-card" data-video-id="'+esc(v._id)+'"><button class="video-cover" data-video-play="'+esc(v._id)+'" '+(v.locked?'disabled aria-label="Oldingi video tugagach ochiladi" title="Oldingi video tugagach ochiladi"':'')+'>'+(thumb?'<img src="'+esc(thumb)+'" loading="lazy" alt="">':'<div class="video-no-thumb">'+icon('play','▶')+'</div>')+'<span class="play-badge">'+(v.locked?'🔒':icon('play','▶'))+'</span>'+(recommended?'<span class="recommend-badge">Tavsiya</span>':'')+'</button><div class="video-card-body"><div class="video-card-top"><span>'+esc(v.subject||'Videodars')+'</span><small>'+esc(v.durationMinutes?Math.round(v.durationMinutes)+' daq':'')+'</small></div><h2>'+esc(v.title)+'</h2><p>'+esc(v.description||'Mustaqil o‘rganish uchun videodars.')+'</p><div class="video-tags">'+(v.courseId?.title?'<span>'+esc(v.courseId.title)+'</span>':'')+(v.moduleTitle?'<span>'+esc(v.moduleTitle)+'</span>':'')+(course?'<span>'+esc(course)+'</span>':'')+(v.direction?'<span>'+esc(v.direction)+'</span>':'')+(groups?'<span>'+esc(groups)+'</span>':'')+'</div><div class="video-footer"><small>'+icon('user','◎')+' '+esc(v.teacherId?.fullName||'Ta’lim platformasi')+' · '+esc(v.views||0)+' ko‘rish · '+esc(v.commentCount||0)+' izoh</small><div>'+(canDelete?'<button class="ghost" data-video-preview="'+esc(v._id)+'" title="O‘qituvchi uchun materialni tekshirish">▶ Tekshirish</button><button class="ghost" data-video-structure="'+esc(v._id)+'" title="Fan/modul/mavzu bo‘yicha tartiblash">Tartiblash</button><button class="ghost danger-text" data-video-delete="'+esc(v._id)+'" title="Arxivlash">'+icon('trash','×')+'</button>':'')+'</div></div></div></article>';
}
function compactRelatedCard(v){
  const thumb=videoThumb(v);
  return '<button class="related-card" data-video-play="'+esc(v._id)+'" '+(v.locked?'disabled title="Oldingi video tugagach ochiladi"':'')+'>'+(thumb?'<img src="'+esc(thumb)+'" loading="lazy" alt="">':'<div class="related-no-thumb">'+icon('play','▶')+'</div>')+'<span><b>'+esc(v.title)+'</b><small>'+esc(v.teacherId?.fullName||'Ta’lim platformasi')+'</small><small>'+esc(v.views||0)+' ko‘rish · '+esc(v.likes||0)+' yoqdi</small>'+(v.locked?'<small>🔒 Oldingi video tugagach ochiladi</small>':'')+'</span></button>';
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
        const quiz=v.checkpointQuizId,progress=v.progress||{},unlocked=Boolean(progress.completed),locked=Boolean(v.locked),pct=progress.completed?100:(progress.durationSeconds?Math.min(99,Math.round((Number(progress.watchedSeconds||0)/Math.max(1,Number(progress.durationSeconds)))*100)):0);
        return '<article class="learning-topic'+(locked?' is-locked':'')+'"><div class="learning-topic-order">'+esc(v.sequence||i+1)+'</div><div class="learning-topic-main"><small>'+esc(v.topicTitle||v.title)+'</small><h3>'+esc(v.title)+'</h3><p>'+esc(v.description||'')+'</p><div class="video-tags">'+(v.durationMinutes?'<span>'+esc(Math.round(v.durationMinutes))+' daq</span>':'')+(quiz?'<span class="topic-quiz-badge">Test: '+esc(quiz.title)+'</span>':'')+'<span>'+esc(pct)+'% ko‘rildi</span></div><div class="topic-progress"><i style="width:'+esc(pct)+'%"></i></div></div><div class="learning-topic-actions"><button class="'+(locked?'video-topic-lock':'primary')+'" data-video-play="'+esc(v._id)+'" '+(locked?'disabled aria-disabled="true" title="Oldingi video tugagach ochiladi"':'')+'>'+(locked?'🔒 Oldingi video tugagach ochiladi':'▶ '+(progress.lastPositionSeconds>5&&!progress.completed?'Davom ettirish':'Ko‘rish'))+'</button>'+(quiz?'<button data-video-checkpoint="'+esc(quiz._id)+'" data-video-id="'+esc(v._id)+'" data-proctor="'+(quiz.proctorRequired?'1':'0')+'" '+(unlocked?'':'disabled title="Video to‘liq tugagach ochiladi"')+'>'+(unlocked?'Test':'🔒 Video tugagach')+'</button>':'')+'</div></article>'
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
  root.querySelectorAll?.('[data-video-play]').forEach(b=>{
    const v=videoLessonsCache.find(x=>String(x._id)===String(b.dataset.videoPlay));
    if(!v||v.locked){
      b.disabled=true;
      b.title='🔒 Oldingi video tugagach ochiladi';
      b.setAttribute('aria-disabled','true');
      b.onclick=null;
    }else b.onclick=()=>openVideoLesson(b.dataset.videoPlay);
  });
  root.querySelectorAll?.('[data-video-preview]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    openVideoLesson(b.dataset.videoPreview,true,true);
  });
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
  // Snapshot synchronously before destroying the playback engine.
  if(save)saveCurrentVideoProgress(false,true).catch(e=>console.warn('Video joyini saqlab bo‘lmadi:',e));
  watchSessionSerial++;
  if(watchProgressTimer){clearInterval(watchProgressTimer);watchProgressTimer=null}
  const player=$('#watchPlayer');
  try{
    if(activeWatchKind==='youtube'){activeWatchPlayer?.pauseVideo?.();activeWatchPlayer?.stopVideo?.();activeWatchPlayer?.destroy?.()}
    else if(activeWatchKind==='mp4')activeWatchPlayer?.pause?.();
  }catch{}
  // Hidden iframes can still play audio: stop all of them, including fallback/external embeds.
  player?.querySelectorAll('video').forEach(v=>{try{v.pause();v.removeAttribute('src');v.srcObject=null;v.load()}catch{}});
  player?.querySelectorAll('iframe').forEach(frame=>{try{frame.src='about:blank';frame.remove()}catch{}});
  if(player)player.replaceChildren();
  activeWatchPlayer=null;activeWatchKind='';watchLastSamplePosition=0;watchLastSampleAt=0;watchLastSavedAt=0;
}
function updateVideoProgressUi(v,progress){
  if(!v)return;v.progress={...(v.progress||{}),...(progress||{})};
  const p=v.progress||{},pct=p.completed?100:(p.durationSeconds?Math.min(99,Math.round((Number(p.watchedSeconds||0)/Math.max(1,Number(p.durationSeconds)))*100)):0);
  const label=$('#watchProgressLabel'),bar=$('#watchProgressBar');if(label)label.textContent=(p.completed?'Video tugallandi · test ochildi':pct+'% ko‘rildi');if(bar)bar.style.width=pct+'%';
  const btn=$('#watchCheckpointQuiz');if(btn){btn.disabled=!p.completed;btn.textContent=p.completed?'Testni boshlash':'🔒 Video tugagach ochiladi'}
}
async function persistVideoProgress(videoId,position,duration,completed=false,watchDeltaSeconds=0){
  if(!videoId)return null;
  const payload={positionSeconds:Math.max(0,Number(position)||0),durationSeconds:Math.max(0,Number(duration)||0),watchDeltaSeconds:Math.max(0,Number(watchDeltaSeconds)||0),completed:Boolean(completed)};
  // Keep writes ordered per video: a slow 5-second update must never overwrite the final exit position.
  const previous=videoProgressWrites.get(String(videoId))||Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>api('/videos/'+videoId+'/view',{method:'POST',body:JSON.stringify(payload)}));
  videoProgressWrites.set(String(videoId),task);
  try{
    const x=await task;
    const v=videoLessonsCache.find(a=>String(a._id)===String(videoId)),wasComplete=Boolean(v?.progress?.completed);
    if(v&&x.progress){v.progress={...(v.progress||{}),...x.progress};if(activeVideoId===String(videoId))updateVideoProgressUi(v,x.progress)}
    if(activeVideoId===String(videoId))watchLastSavedAt=Date.now();
    if(x.progress?.completed&&!wasComplete){
      videoLessonsCache=await api('/videos');
      if(activeVideoId===String(videoId)){
        const related=videoLessonsCache.filter(a=>String(a._id)!==activeVideoId).slice(0,30);
        $('#watchRelated').innerHTML=related.map(compactRelatedCard).join('')||'<p class="muted">Boshqa videodars yo‘q.</p>';
        bindVideoActions($('#watchRelated'));
      }
    }
    return x.progress;
  }finally{if(videoProgressWrites.get(String(videoId))===task)videoProgressWrites.delete(String(videoId))}
}
async function saveCurrentVideoProgress(forceCompleted=false,forceSave=false){
  if(!activeVideoId||!activeWatchPlayer)return;
  let position=0,duration=0,playing=false;
  const id=activeVideoId;
  try{
    if(activeWatchKind==='youtube'){
      position=Number(activeWatchPlayer.getCurrentTime?.()||0);duration=Number(activeWatchPlayer.getDuration?.()||0);
      playing=Boolean(window.YT&&activeWatchPlayer.getPlayerState?.()===window.YT.PlayerState.PLAYING);
    }else if(activeWatchKind==='mp4'){
      position=Number(activeWatchPlayer.currentTime||0);duration=Number(activeWatchPlayer.duration||0);playing=!activeWatchPlayer.paused&&!activeWatchPlayer.ended;
    }else return;
  }catch{return}
  if(!Number.isFinite(position)||position<0)return;
  const now=Date.now(),wallDelta=watchLastSampleAt?Math.max(0,Math.min(15,(now-watchLastSampleAt)/1000)):0,posDelta=watchLastSampleAt?position-watchLastSamplePosition:0;
  let watchDelta=0;
  if(playing&&posDelta>=0&&posDelta<=wallDelta+2.5)watchDelta=Math.min(posDelta,wallDelta,15);
  else if(forceCompleted&&posDelta>0&&posDelta<=wallDelta+2.5)watchDelta=Math.min(posDelta,wallDelta,15);
  watchLastSamplePosition=position;watchLastSampleAt=now;
  rememberPlayback(localStorage,user?._id||user?.id||user?.login,id,position,duration,now);
  if(!forceCompleted&&!forceSave&&now-watchLastSavedAt<3500)return;
  if(duration>0){watchLastSavedAt=now;await persistVideoProgress(id,position,duration,forceCompleted,watchDelta)}
}
async function renderWatchPlayer(v){
  stopWatchTracking(false);
  const player=$('#watchPlayer'),yt=youtubeId(v.sourceUrl),id=String(v._id);
  const resume=playbackResumeSeconds(v.progress,readPlayback(localStorage,user?._id||user?.id||user?.login,id));
  const session=watchSessionSerial;
  const current=()=>session===watchSessionSerial&&activeVideoId===id&&Boolean($('#videoWatch')?.classList.contains('active'));
  const fallback=(reason='')=>{
    if(!current())return;
    const url='https://www.youtube.com/embed/'+encodeURIComponent(yt)+'?autoplay=1&rel=0&playsinline=1&enablejsapi=1&start='+Math.floor(resume);
    if(watchProgressTimer){clearInterval(watchProgressTimer);watchProgressTimer=null}
    activeWatchKind='external';activeWatchPlayer=null;
    player.innerHTML='<iframe src="'+esc(url)+'" title="'+esc(v.title)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe><div class="video-progress-note">⚠ '+esc(reason||'YouTube pleer zaxira rejimga o‘tdi.')+' Bu rejim ko‘rish soniyasini avtomatik qayd etmaydi.</div>';
  };
  player.innerHTML='<div class="watch-loading">Video yuklanmoqda…</div>';
  if(yt){
    try{
      const YT=await loadYouTubePlayerApi();
      if(!current())return; // Leaving the page while the YouTube API loads must not start playback.
      player.innerHTML='<div id="watchYoutubePlayer"></div>';
      activeWatchKind='youtube';
      activeWatchPlayer=new YT.Player('watchYoutubePlayer',{videoId:yt,playerVars:{autoplay:1,rel:0,playsinline:1,modestbranding:1,start:Math.floor(resume)},events:{
        onReady:e=>{
          if(!current()){try{e.target.destroy()}catch{};return}
          try{if(resume>2)e.target.seekTo(resume,true);e.target.playVideo()}catch{}
          watchLastSamplePosition=Number(e.target.getCurrentTime?.()||0);watchLastSampleAt=Date.now();watchLastSavedAt=0;
          watchProgressTimer=setInterval(()=>{if(current())saveCurrentVideoProgress(false).catch(()=>{})},5000);
          // Do not overwrite the resume checkpoint before YouTube finishes its initial seek.
        },
        onStateChange:e=>{if(!current())return;if(e.data===YT.PlayerState.ENDED)saveCurrentVideoProgress(true,true).catch(()=>{});else if(e.data===YT.PlayerState.PAUSED)saveCurrentVideoProgress(false,true).catch(()=>{})},
        onError:()=>fallback('YouTube API xatosi.')
      }});
    }catch(e){fallback('YouTube API yuklanmadi.')}
  }else if(v.sourceType==='mp4'||v.sourceType==='asset'){
    if(!current())return;
    player.innerHTML='<video controls autoplay playsinline preload="metadata" src="'+esc(v.sourceUrl)+'"></video>';
    const video=player.querySelector('video');activeWatchKind='mp4';activeWatchPlayer=video;
    video.addEventListener('loadedmetadata',()=>{
      if(!current())return;
      if(resume>2&&resume<video.duration-2)video.currentTime=resume;
      watchLastSamplePosition=video.currentTime;watchLastSampleAt=Date.now();
      video.play().catch(()=>{});
    },{once:true});
    video.addEventListener('timeupdate',()=>{if(current()&&Date.now()-watchLastSavedAt>4500)saveCurrentVideoProgress(false).catch(()=>{})});
    video.addEventListener('pause',()=>{if(current())saveCurrentVideoProgress(false,true).catch(()=>{})});
    video.addEventListener('ended',()=>{if(current())saveCurrentVideoProgress(true,true).catch(()=>{})});
  }else if(current()){
    activeWatchKind='external';
    player.innerHTML='<iframe src="'+esc(v.sourceUrl)+'" title="'+esc(v.title)+'" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="no-referrer" allow="fullscreen; picture-in-picture" allowfullscreen></iframe><div class="video-progress-note">Bu tashqi player ko‘rilgan soniyani avtomatik bera olmaydi; sahifadan chiqishda esa to‘xtatiladi.</div>';
  }
}
let videoOpenRequestSerial=0;
async function openVideoLesson(id,pushHistory=true,preview=false){
  const requestSerial=++videoOpenRequestSerial;
  if(!videoLessonsCache.length)videoLessonsCache=await api('/videos');
  const v=videoLessonsCache.find(x=>String(x._id)===String(id));if(!v)return toast('Videodars topilmadi');
  // Learning paths are sequential for every role. Staff may preview only
  // through the separate management control; students cannot enable preview.
  const staffPreview=Boolean(preview&&user?.role!=='student'&&(
    can('videos.manage')||can('videos.upload')||
    String(v.teacherId?._id||v.teacherId||'')===String(user?._id||'')));
  if(v.locked&&!staffPreview)return toast('🔒 Oldingi video tugagach ochiladi');
  // Always fetch fresh server permission before starting any player or iframe.
  // Cached playlists, related videos and search links cannot bypass this.
  try{
    const permission=await api('/videos/'+encodeURIComponent(id)+'/playback');
    if(requestSerial!==videoOpenRequestSerial)return;
    if(!permission.allowed||!permission.sourceUrl)return toast('Videodars hozircha yopiq');
    v.sourceUrl=permission.sourceUrl;
    v.sourceType=permission.sourceType||v.sourceType;
    v.progress=permission.progress||v.progress||null;
  }catch(e){if(requestSerial===videoOpenRequestSerial)toast(e.message||'Videodarsni ochish taqiqlangan');return}
  if(requestSerial!==videoOpenRequestSerial)return;
  if(activeVideoId)clearWatchPage(); // Switch between related videos: stop and save the previous player first.
  activeVideoId=String(v._id);commentReplyTo=null;go('videoWatch');
  if(pushHistory&&location.hash!=='#video='+encodeURIComponent(activeVideoId))history.pushState({videoId:activeVideoId},'',location.pathname+location.search+'#video='+encodeURIComponent(activeVideoId));
  $('#watchTitle').textContent=v.title;$('#watchVideoTitle').textContent=v.title;
  $('#watchMeta').textContent=[v.subject,(v.courseYears||[]).map(x=>x+'-kurs').join(', '),v.direction].filter(Boolean).join(' · ');
  $('#watchStats').innerHTML='<b>'+esc(v.views||0)+' ko‘rish</b><span>'+esc(v.commentCount||0)+' izoh</span><span>'+esc(v.durationMinutes?Math.round(v.durationMinutes)+' daqiqa':'')+'</span>';
  $('#watchLikeText').textContent=(v.progress?.liked?'Yoqdi ✓':'Yoqdi')+' · '+(v.likes||0);
  $('#watchLikeBtn').classList.toggle('liked',Boolean(v.progress?.liked));
  $('#watchTeacher').innerHTML='<div class="avatar">'+esc((v.teacherId?.fullName||'T').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())+'</div><div><b>'+esc(v.teacherId?.fullName||'Ta’lim platformasi')+'</b><small>'+esc(v.subject||'Videodars')+'</small></div>';
  const tags=[...(v.tags||[]),...(v.courseYears||[]).map(x=>x+'-kurs'),v.direction].filter(Boolean);
  const p=v.progress||{},pp=p.completed?100:(p.durationSeconds?Math.min(99,Math.round((Number(p.watchedSeconds||0)/Math.max(1,Number(p.durationSeconds)))*100)):0);
  $('#watchDescription').innerHTML='<div class="watch-description-meta">'+[v.courseId?.title,v.moduleTitle,v.topicTitle,...tags].filter(Boolean).map(x=>'<span>'+esc(x)+'</span>').join('')+'</div><p>'+esc(v.description||'Videodars uchun tavsif kiritilmagan.')+'</p><div class="watch-progress-card"><div><b id="watchProgressLabel">'+(p.completed?'Video tugallandi · test ochildi':esc(pp)+'% ko‘rildi')+'</b><small>Chiqib qaytsangiz ayni joyidan davom etadi</small></div><div class="watch-progress-track"><i id="watchProgressBar" style="width:'+esc(pp)+'%"></i></div></div>'+(v.checkpointQuizId?'<div class="video-checkpoint-box"><div><b>Mavzu nazorati</b><small>'+esc(v.checkpointQuizId.title)+' · '+esc(v.checkpointQuizId.durationMinutes||30)+' daqiqa'+(v.checkpointQuizId.proctorRequired?' · kamera nazorati':'')+'</small></div><button class="primary" id="watchCheckpointQuiz" '+(p.completed?'':'disabled')+'>'+(p.completed?'Testni boshlash':'🔒 Video tugagach ochiladi')+'</button></div>':'');
  await renderWatchPlayer(v);
  mountVideoCaptions(v).catch(()=>{});
  $('#watchCheckpointQuiz')?.addEventListener('click',()=>{if($('#watchCheckpointQuiz').disabled)return;startCourseQuiz(v.checkpointQuizId._id,v.checkpointQuizId.proctorRequired,activeVideoId)});
  const related=videoLessonsCache.filter(x=>String(x._id)!==activeVideoId).sort((a,b)=>(b.recommendationScore||0)-(a.recommendationScore||0)).slice(0,30);
  $('#watchRelated').innerHTML=related.map(compactRelatedCard).join('')||'<p class="muted">Boshqa videodars yo‘q.</p>';
  bindVideoActions($('#watchRelated'));hydrateIcons($('#videoWatch'));
  await loadVideoComments(activeVideoId);
}
function clearWatchPage(){
  videoOpenRequestSerial++;
  stopWatchTracking(true);activeVideoId='';commentReplyTo=null;$('#watchPlayer').innerHTML='';$('#commentsList').innerHTML='';$('#commentReplyState').classList.add('hidden');
}
$('#backToVideos').onclick=()=>{clearWatchPage();history.pushState({},'',location.pathname+location.search);go('videos');loadVideoLessons()};
function pauseWatchOnBackground(){
  if(!activeVideoId)return;
  saveCurrentVideoProgress(false,true).catch(()=>{});
  try{
    if(activeWatchKind==='youtube')activeWatchPlayer?.pauseVideo?.();
    else if(activeWatchKind==='mp4')activeWatchPlayer?.pause?.();
    else $('#watchPlayer')?.querySelectorAll('iframe').forEach(f=>{
      // Fallback iframe APIs cannot reliably expose time; stop sound when backgrounded.
      try{f.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}), '*')}catch{}
    });
  }catch{}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseWatchOnBackground()});
window.addEventListener('pagehide',pauseWatchOnBackground);
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
async function deleteVideoComment(id){if(!await askConfirmation('Izoh o‘chirilsinmi?'))return;try{await api('/video-comments/'+id,{method:'DELETE'});await loadVideoComments(activeVideoId);toast('Izoh o‘chirildi')}catch(e){toast(e.message)}}
async function editVideoLessonStructure(id){
  try{
    const v=videoLessonsCache.find(x=>String(x._id)===String(id));if(!v)throw Error('Videodars topilmadi');
    const courses=await api('/lms/courses'),details=await Promise.all(courses.slice(0,80).map(x=>api('/lms/courses/'+x._id).catch(()=>null)));
    const quizOptions=details.flatMap((d,i)=>(d?.quizzes||[]).map(q=>({id:q._id,courseId:courses[i]?._id,label:(courses[i]?.title||'Fan')+' · '+q.title})));
    modal('Videodarsni kurs bo‘yicha tartiblash','<label>Fan<select name="courseId"><option value="">Umumiy videodars</option>'+courses.map(x=>'<option value="'+esc(x._id)+'" '+(String(v.courseId?._id||v.courseId||'')===String(x._id)?'selected':'')+'>'+esc(x.code)+' · '+esc(x.title)+'</option>').join('')+'</select></label><label>Modul<input name="moduleTitle" value="'+esc(v.moduleTitle||'Asosiy modul')+'" required></label><label>Mavzu<input name="topicTitle" value="'+esc(v.topicTitle||v.title)+'" required></label><label>Ketma-ketlik<input name="sequence" type="number" min="0" value="'+esc(v.sequence||1)+'"></label><label>Mavzu testi<select name="checkpointQuizId"><option value="">Test biriktirilmagan</option>'+quizOptions.map(q=>'<option value="'+esc(q.id)+'" '+(String(v.checkpointQuizId?._id||v.checkpointQuizId||'')===String(q.id)?'selected':'')+'>'+esc(q.label)+'</option>').join('')+'</select></label><label>Fan nomi/teg<input name="subject" value="'+esc(v.subject||'')+'"></label>',async d=>{await api('/videos/'+id,{method:'PATCH',body:JSON.stringify(d)});await loadVideoLessons()})
  }catch(e){toast(e.message)}
}
async function deleteVideoLesson(id){if(!await askConfirmation('Videodars arxivga olinsinmi?'))return;try{await api('/videos/'+id,{method:'DELETE'});toast('Videodars arxivga olindi');if(activeVideoId===String(id)){clearWatchPage();go('videos')}loadVideoLessons()}catch(e){toast(e.message)}}
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
async function loadReports(){if(!can('reports.view'))return;try{
  if(courseworkUi.allowJournal(user.role))courseworkUi.journals($('#courseworkReportJournal'),user.role).catch(e=>console.warn('Jurnal: ',e.message));const days=$('#reportDays')?.value||14;const q=encodeURIComponent($('#auditSearch')?.value||'');const jobs=[api('/reports/attendance?days='+days),api('/audit?limit=300&q='+q),can('lessons.monitor')?api('/analytics/online').catch(function(){return []}):Promise.resolve([])];const out=await Promise.all(jobs),attendance=out[0],auditRows=out[1],online=out[2];if(['admin','superadmin'].includes(user.role))loadMonitoringReadiness().catch(e=>toast(e.message));reportAttendanceCache=attendance;$('#attendanceList').innerHTML='<table><thead><tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Dars</th><th>Holat</th><th>Daqiqa</th><th></th></tr></thead><tbody>'+attendance.map(function(x){const labels={present:'Qatnashdi',late:'Kechikdi',absent:'Qatnashmadi',excused:'Sababli'},cls=x.status==='late'?'warn':x.status==='absent'?'blocked':'ok',action=can('attendance.manage')?'<button class="ghost" data-attendance-edit="'+esc(x._id)+'">Tuzatish</button>':'';return '<tr><td>'+(x.joinedAt?new Date(x.joinedAt).toLocaleString('uz-UZ'):'—')+'</td><td>'+esc(x.userId?.fullName||'—')+'<small class="cell-sub">@'+esc(x.userId?.login||'—')+'</small></td><td>'+esc(x.schedule?.title||x.lessonId||'—')+'<small class="cell-sub">'+esc(x.schedule?.groupId?.name||'')+'</small></td><td><span class="status '+cls+'">'+esc(labels[x.status]||x.status)+'</span></td><td>'+esc(x.minutes||0)+'</td><td>'+action+'</td></tr>'}).join('')+'</tbody></table>';all('[data-attendance-edit]').forEach(function(b){b.onclick=function(){editAttendance(b.dataset.attendanceEdit)}});$('#auditList').innerHTML=auditRows.map(function(x){return '<div><b>'+esc(x.action)+' · '+esc(x.entity)+'</b><span>'+esc(x.actorName||x.actorLogin||'Tizim')+'</span><br><small>'+new Date(x.createdAt).toLocaleString('uz-UZ')+' · '+esc(x.ip||'')+'</small></div>'}).join('')||'<p>Harakatlar tarixi bo‘sh.</p>';if(can('lessons.monitor'))$('#onlineUsers').innerHTML=online.map(function(x){return '<div><span class="online-dot"></span><div><b>'+esc(x.fullName)+'</b><small>@'+esc(x.login)+' · '+esc(roleName[x.role]||x.role)+'</small></div><strong>'+esc(x.connections||1)+'</strong></div>'}).join('')||'<p class="muted">Hozir faol ulanish yo‘q.</p>'}catch(e){toast(e.message)}}
async function loadMonitoringReadiness(){
  const x=await api('/lms/monitoring/readiness'),labels={ministry:'Vazirlik monitoring tizimi',quality:'Ta’lim sifati yagona bazasi'};
  $('#monitoringReadiness').innerHTML='<p><b>OTM kodi:</b> '+esc(x.institutionCode||'kiritilmagan')+'</p>'+x.providers.map(p=>{const failed=Object.entries(p.checks||{}).filter(([,v])=>!v).map(([k])=>k);return '<div class="lesson-row"><div><b>'+esc(labels[p.provider]||p.label||p.provider)+'</b><small>'+(p.ready?'Rasmiy yuborishga tayyor':'Readiness to‘liq emas')+' · external ID kam: '+esc(p.mapping?.missingUserExternalIds||0)+' user / '+esc(p.mapping?.missingStructureExternalIds||0)+' tuzilma</small>'+(failed.length?'<p>Yetishmaydi: '+failed.map(esc).join(', ')+'</p>':'')+(p.urlError?'<p>'+esc(p.urlError)+'</p>':'')+'</div><div><button data-monitoring-export="'+esc(p.provider)+'">JSON eksport</button>'+(p.ready?'<button class="primary" data-monitoring-sync="'+esc(p.provider)+'">Rasmiy sync</button>':'')+'</div></div>'}).join('')+'<h3>So‘nggi qaydlar</h3>'+((x.latest||[]).slice(0,8).map(r=>'<p><b>'+esc(r.provider)+' · '+esc(r.status)+'</b> · '+new Date(r.createdAt).toLocaleString('uz-UZ')+(r.receiptReference?' · '+esc(r.receiptReference):'')+'</p>').join('')||'<p>Monitoring eksport qaydi yo‘q.</p>');
  all('[data-monitoring-export]').forEach(b=>b.onclick=async()=>{try{const out=await api('/lms/monitoring/'+b.dataset.monitoringExport+'/export',{method:'POST'});downloadText('monitoring-'+b.dataset.monitoringExport+'-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(out.payload,null,2));toast('Monitoring JSON tayyorlandi')}catch(e){toast(e.message)}});
  all('[data-monitoring-sync]').forEach(b=>b.onclick=async()=>{if(!await askConfirmation('Bu amal shaxsiy/akademik ma’lumotlarni universitet tasdiqlagan rasmiy API yoki gatewayga yuboradi. Rasmiy shartnoma va endpoint tasdiqlanganmi?'))return;try{const out=await api('/lms/monitoring/'+b.dataset.monitoringSync+'/sync',{method:'POST',body:JSON.stringify({confirmOfficialTransfer:true})});toast(out.status==='accepted'?'Gateway qabul qildi':'Gatewayga yetkazildi; rasmiy receipt kutiladi');await loadMonitoringReadiness()}catch(e){toast(e.message)}});
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

$('#callViewMode')?.addEventListener('click',()=>{if(!mediaRoomClient||user?.role==='student')return;const next=mediaRoomClient.viewMode==='gallery'?'speaker':'gallery';mediaRoomClient.setViewMode(next);toast(next==='gallery'?'Gallery view':'Speaker view')});
$('#callRaiseHand')?.addEventListener('click',()=>{if(!activeLessonId)return;setHandRaised(!handRaised);socket?.emit('lesson:raise-hand',{lessonId:activeLessonId,raised:handRaised});toast(handRaised?'Qo‘lingiz ko‘tarildi · o‘qituvchi ko‘radi':'Qo‘lingiz tushirildi')});
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
  socket=io({reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:500,reconnectionDelayMax:5000,timeout:10000,transports:['websocket','polling']});
  socket.on('connect',function(){$('#onlineBadge').textContent='● Onlayn';if(!activeLessonId)$('#connectionBanner')?.classList.add('hidden');if(!activeLessonId)return;
    // Signaling came back. The media peer survives a short outage on the server, so re-bind it instead of tearing the
    // lesson down; only when that fails (long outage, server restart) do a full rejoin.
    socket.emit('lesson:join',{lessonId:activeLessonId});
    if(mediaRoomClient&&!mediaRoomClient.closed&&autoRejoinAttempt===0&&!autoRejoinInFlight){resumeMediaSession();return}
    if(lastLessonPayload)autoRejoinLesson(true)});
  socket.on('media:resync',function(){if(activeLessonId&&mediaRoomClient&&!mediaRoomClient.closed)resumeMediaSession()});
  socket.on('disconnect',function(){$('#onlineBadge').textContent='● Ulanish yo‘q';$('#connectionBanner')?.classList.remove('hidden');if(activeLessonId){autoRejoinAttempt=Math.max(1,autoRejoinAttempt);autoRejoinLesson(false)}});
  socket.on('presence:count',function(x){$('#onlineBadge').textContent='● '+(x.online||0)+' onlayn'});
  socket.on('lesson:error',function(x){toast(x.message||'Darsga kirib bo‘lmadi')});
  socket.on('lesson:presence',function(x){if(!activeLessonId)return;scheduleLessonParticipants();if(x?.state==='left'){const id=String(x.userId||'');raisedHands.delete(id);raisedHandUsers.delete(id);updateRaisedHandAlert();return}if(String(x?.userId||'')===String(user?._id||''))toast(x.status==='late'?'Darsga kirdingiz · kechikish qayd etildi':'Darsga kirdingiz · davomat qayd etildi')});
  socket.on('media:reconnect-required',function(){if(activeLessonId)autoRejoinLesson(true)});
  socket.on('attendance:checkpoint',function(x){if(activeLessonId&&String(x.scheduleId)===String(activeLessonId)){scheduleLessonParticipants(200);toast('Avtomatik davomat: '+x.checkpointMinute+'-daqiqa')}});
  socket.on('attendance:manual-saved',function(x){if(activeLessonId&&String(x.scheduleId)===String(activeLessonId)){loadLessonParticipants();if(user.role!=='teacher')toast('Davomat o‘qituvchi tomonidan yangilandi')}});
  socket.on('mic:permission-request',async function(x){
    if(!activeLessonId||user.role!=='teacher')return;
    const approved=await askConfirmation((x.fullName||'Talaba')+' gapirishga ruxsat so‘radi. Ruxsat berasizmi?');
    socket.emit('mic:permission-response',{lessonId:activeLessonId,userId:x.userId,approved});
  });
  socket.on('mic:permission-result',async function(x){
    if(!activeLessonId||user.role!=='student')return;
    studentMicGranted=Boolean(x.approved);
    if(!x.approved)return toast('O‘qituvchi gapirish ruxsatini bermadi');
    if(await askConfirmation((x.teacherName||'O‘qituvchi')+' gapirishga ruxsat berdi. Mikrofonni yoqasizmi?')){
      try{await mediaRoomClient?.toggleMic()}catch(e){toast(e.message)}
    }
  });
  socket.on('mic:enable-request',async function(x){
    if(!activeLessonId||user.role!=='student')return;
    const accepted=await askConfirmation((x.teacherName||'O‘qituvchi')+' sizga gapirishni taklif qildi. Mikrofonni yoqasizmi?');
    if(accepted){
      studentMicGranted=true;
      try{await mediaRoomClient?.toggleMic()}catch(e){toast(e.message)}
    }
    socket.emit('mic:enable-result',{lessonId:activeLessonId,accepted});
  });
  socket.on('mic:student-result',function(x){if(activeLessonId&&user.role==='teacher')toast((x.fullName||'Talaba')+(x.accepted?' mikrofonni yoqdi':' gapirish so‘rovini rad etdi'))});
  socket.on('camera:enable-request',async function(x){
    if(!activeLessonId||user.role!=='student')return;
    const accepted=await askConfirmation((x.teacherName||'O‘qituvchi')+' kamerani yoqishni so‘radi. Kamerani yoqasizmi?');
    if(accepted){
      studentCameraGranted=true;
      try{if(!cameraOn)await mediaRoomClient?.toggleCamera()}catch(e){toast(e.message)}
    }
    socket.emit('camera:enable-result',{lessonId:activeLessonId,accepted});
  });
  socket.on('camera:student-result',function(x){if(activeLessonId&&user.role==='teacher')toast((x.fullName||'Talaba')+(x.accepted?' kamerani yoqdi':' kamera so‘rovini rad etdi'))});
  socket.on('lesson:quiz',onLessonQuiz);
  socket.on('lesson:quiz-ack',x=>{if(liveQuiz&&liveQuiz.id===x.id&&liveQuiz.phase==='open'){liveQuiz.mine=Number(x.choice);renderQuiz()}});
  socket.on('lesson:quiz-progress',x=>{if(liveQuiz&&liveQuiz.id===x.id&&liveQuiz.phase==='open'){liveQuiz.answered=x.answered;liveQuiz.online=x.online;if(isLessonHost())renderQuiz()}});
  socket.on('lesson:pulse',onLessonPulse);
  socket.on('lesson:qa',onLessonQa);
  socket.on('lesson:cloud',onLessonCloud);
  socket.on('lesson:pick',onLessonPick);
  socket.on('lesson:feedback-protect',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId)||!mediaRoomClient)return;
    if(user.role==='student'&&!mediaRoomClient.inRoom)showRoomModeSheet('feedback');
    if(user.role==='teacher'&&Date.now()-lastRoomModeHintAt>20000){lastRoomModeHintAt=Date.now();toast('Chiyillash aniqlandi: auditoriyadagi talabalarga telefon ovozini o‘chirish taklif qilindi')}
    const applied=mediaRoomClient.engageCoordinatedFeedbackGuard?.(x.duration||120000,x.frequency||0);
    if(applied)toast('Chiyillashga qarshi vaqtincha xavfsiz rejim yoqildi. Eshitish uchun mikrofonni o‘chiring yoki quloqchin ulang.');
  });
  socket.on('lesson:proctor-state',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
    if(user.role==='teacher'||can('live.manage')||can('lessons.monitor')){updateParticipantProctorIndicator(x);updateLessonRailStatus(x.userId,x);refreshLiveProctorSummary()}
  });
  socket.on('lesson:proctor-camera-request',async function(x){
    if(!activeLessonId||user.role!=='student'||String(x.lessonId)!==String(activeLessonId))return;
    const alreadyLive=Boolean(cameraOn&&mediaRoomClient?.producers?.get('camera')&&!mediaRoomClient.producers.get('camera').paused);
    const permitted=alreadyLive||await askConfirmation((x.by||'O‘qituvchi')+' kamerangizni o‘qituvchiga uzatishni so‘radi. Boshqa talabalar ko‘rmaydi. Rozimisiz?');
    let active=alreadyLive;
    try{
      if(permitted&&!alreadyLive){
        if(liveProctorTrack?.readyState!=='live')await startLiveLessonProctoring();
        if(liveProctorTrack?.readyState==='live'){
          active=Boolean(await mediaRoomClient?.startCameraFromExternalTrack?.(liveProctorTrack,x.viewerUserId||'',true));
        }
      }
    }catch(e){toast('Kamera uzatilmadi: '+e.message)}
    if(!active)toast('Kamera uzatish so‘rovi rad etildi yoki kamera mavjud emas');
    else toast('Kamerangiz darsga uzatilyapti. O‘qituvchi sizni asosiy ekranga chiqaradi.');
    socket.emit('lesson:proctor-camera-result',{lessonId:activeLessonId,active});
  });
  socket.on('lesson:proctor-camera-stop',async function(x){
    if(!activeLessonId||user.role!=='student'||String(x.lessonId)!==String(activeLessonId))return;
    await mediaRoomClient?.stopProctorCameraBroadcast?.().catch(()=>{});
    toast('Vaqtinchalik kamera tekshiruvi tugadi');
  });
  socket.on('lesson:proctor-camera-result',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId)||(user.role!=='teacher'&&!can('live.manage')&&!can('lessons.monitor')))return;
    studentCameraRequests.delete(String(activeLessonId)+':'+String(x.userId));
    if(x.active){socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId:x.userId});toast((x.fullName||'Talaba')+' kamerasi ochildi')}
    else toast((x.fullName||'Talaba')+' kamerasi ochilmadi');
  });
  socket.on('lesson:raise-hand',function(x){
    if(!activeLessonId||String(x.lessonId)!==String(activeLessonId))return;
    const id=String(x.userId||'');
    if(x.raised){raisedHands.add(id);raisedHandUsers.set(id,{userId:id,fullName:x.fullName||x.login||'Talaba',login:x.login||''})}
    else{raisedHands.delete(id);raisedHandUsers.delete(id)}
    if(id===String(user?._id||''))setHandRaised(x.raised);
    updateRaisedHandAlert();
    if((user.role==='teacher'||can('live.manage'))&&id!==String(user?._id||''))toast((x.fullName||'Talaba')+(x.raised?' qo‘l ko‘tardi':' qo‘lini tushirdi'));
    scheduleLessonParticipants();
  });
  socket.on('lesson:reaction',function(x){if(activeLessonId&&String(x.lessonId)===String(activeLessonId))showReaction(x)});
  socket.on('lesson:spotlight',function(x){if(activeLessonId&&String(x.lessonId)===String(activeLessonId))mediaRoomClient?.focusUserForClass?.(String(x.userId||''))});
  socket.on('lesson:force-mute',async function(x){if(activeLessonId){await mediaRoomClient?.muteSelfIfNeeded();toast((x.by||'O‘qituvchi')+' mikrofonni o‘chirdi')}});
  socket.on('lesson:force-camera-off',async function(x){if(activeLessonId){await mediaRoomClient?.cameraOffIfNeeded();toast((x.by||'O‘qituvchi')+' kamerani o‘chirdi')}});
  socket.on('live:changed',async function(x){if(x?.status==='ended'&&activeLessonId&&String(x.scheduleId)===String(activeLessonId)){if(leavingConference)return;toast('Dars yakunlandi · xona yopildi');await leaveConference(true);return}if($('#live')?.classList.contains('active'))loadLiveRooms()});
  socket.on('lesson:auto-ended',async function(x){if(activeLessonId&&String(x?.scheduleId)===String(activeLessonId)){if(leavingConference)return;toast('Dars vaqti tugadi · xona yopildi');await leaveConference(true)}});
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
  socket.on('lesson:chat',function(m){if(!activeLessonId||(m?.lessonId&&String(m.lessonId)!==String(activeLessonId)))return;const box=$('#messages');if(!box)return;const mine=String(m.userId||'')===String(user?._id||'');const when=m.at?new Date(m.at):new Date();const time=String(when.getHours()).padStart(2,'0')+':'+String(when.getMinutes()).padStart(2,'0');const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;box.insertAdjacentHTML('beforeend','<p class="chat-msg'+(mine?' mine':'')+'"><b>'+esc(mine?'Siz':m.fullName)+'</b><br>'+esc(m.text)+'<time>'+time+'</time></p>');if(nearBottom||mine)box.scrollTop=box.scrollHeight;if(!mine){if(a11y.prefs().announceChat)a11y.speak((m.fullName||'')+': '+m.text,{interrupt:false});else a11y.announce('Chat: '+(m.fullName||'')+': '+m.text)}if(mine||lessonChatVisible())return;chatUnread++;const b=$('#chatUnreadBadge');if(b){b.textContent=String(chatUnread);b.classList.remove('hidden')}});
  socket.on('lesson:caption',function(m){if(activeLessonId&&String(m.lessonId)===String(activeLessonId)&&String(m.userId)!==String(user?._id)){const current=$('#captionLang')?.value;const sel=$('#captionLang');if(sel&&m.lang)sel.dataset.remoteLang=m.lang;showCaption(m.fullName,normalizeMathCaption(m.text,m.lang||current||'uz-UZ'))}if(activeLessonId&&String(m.lessonId)===String(activeLessonId)&&m.segment&&String(m.userId)!==String(user?._id))pushTranscriptLine(m.fullName,m.segment,m.at)});
  $('#chatForm').onsubmit=function(e){e.preventDefault();if(!activeLessonId)return toast('Avval jadvaldan darsga kiring');const input=e.target.querySelector('input');const text=String(input.value||'').trim();if(!text)return;if(!socket?.connected)return toast('Aloqa tiklanmoqda · xabar yuborilmadi');socket.emit('lesson:chat',{lessonId:activeLessonId,text});input.value=''};
}
window.addEventListener('popstate',async()=>{if(!user)return;
  const deep=location.hash.startsWith('#video=')?decodeURIComponent(location.hash.slice(7)):'';
  const courseDeep=location.hash.startsWith('#course=')?decodeURIComponent(location.hash.slice(8)):'';
  if(deep){try{await openVideoLesson(deep,false)}catch{go('videos')}}
  else if(courseDeep){go('courses',true);await loadCourses();await openCourse(courseDeep,false)}
  else if(activeVideoId){clearWatchPage();go('videos');loadVideoLessons()}
  else if($('#courses')?.classList.contains('active'))await loadCourses();
});
hydrateIcons();if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js');start();

async function loadCurricula(){
  try{
    const rows=await api('/lms/curricula');$('#curriculumDetail').innerHTML='';
    $('#curriculumList').innerHTML=rows.map(x=>'<article><div class="lesson-row"><div><small>'+esc(x.programCode)+' · '+esc(x.academicYear)+' · '+esc(x.language)+'</small><h2>'+esc(x.name)+'</h2><p>'+esc(x.direction)+'</p><small>'+esc(x.subjects?.length||0)+' fan · '+esc(x.groupIds?.map(g=>g.name).join(', ')||'Guruh yo‘q')+'</small></div><div><button class="primary" data-curriculum-ready="'+esc(x._id)+'">Qamrov</button>'+(['admin','superadmin'].includes(user.role)?'<button data-curriculum-archive="'+esc(x._id)+'">Arxiv</button>':'')+'</div></div></article>').join('')||'<div class="empty"><b>Tasdiqlangan o‘quv reja kiritilmagan</b><p>Administrator Excel yoki CSV faylini import qiladi.</p></div>';
    all('[data-curriculum-ready]').forEach(b=>b.onclick=()=>openCurriculumReadiness(b.dataset.curriculumReady));
    all('[data-curriculum-archive]').forEach(b=>b.onclick=async()=>{if(!await askConfirmation('O‘quv reja arxivlansinmi?'))return;try{await api('/lms/curricula/'+b.dataset.curriculumArchive,{method:'DELETE'});loadCurricula()}catch(e){toast(e.message)}});
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
let examViewMode='cards',examStatusFilter='all',examCachedRows=[];
function renderFinalExams(){
 const host=$('#finalExamList');if(!host)return;
 const labels={planned:'Rejalashtirilgan',in_progress:'Jarayonda',completed:'Yakunlangan',cancelled:'Bekor qilingan'};
 const filtered=examCachedRows.filter(x=>examStatusFilter==='all'||x.status===examStatusFilter);
 const counts={all:examCachedRows.length,planned:examCachedRows.filter(x=>x.status==='planned').length,in_progress:examCachedRows.filter(x=>x.status==='in_progress').length,completed:examCachedRows.filter(x=>x.status==='completed').length};
 const tabs='<div class="exam-toolbar">'+Object.entries({all:'Barchasi',planned:'Rejada',in_progress:'Jarayonda',completed:'Yakunlangan'}).map(([key,label])=>'<button data-exam-filter="'+key+'" class="'+(examStatusFilter===key?'active':'')+'">'+label+' <b>'+counts[key]+'</b></button>').join('')+'<button data-exam-view="cards" class="'+(examViewMode==='cards'?'active':'')+'">▦ Kartalar</button><button data-exam-view="table" class="'+(examViewMode==='table'?'active':'')+'">☷ Jadval</button></div>';
 const cards=filtered.map(x=>{const date=new Date(x.startsAt);return '<article class="exam-card"><div class="exam-card-top"><span class="exam-chip">🏛 OTMda shaxsan</span><span class="exam-state exam-state-'+esc(x.status)+'">'+esc(labels[x.status]||x.status)+'</span></div><small>'+esc(finalExamTypeLabel[x.type]||x.type)+' · '+esc(x.academicYear)+' · '+esc(x.semester)+'-semestr</small><h3>'+esc(x.title)+'</h3><p>'+esc(x.groupId?.name||'Guruh ko‘rsatilmagan')+(x.courseId?' · '+esc(x.courseId.title):'')+'</p><div class="exam-meta"><span>📅 '+esc(date.toLocaleString('uz-UZ'))+'</span><span>📍 '+esc(x.location||'')+' '+esc(x.room||'')+'</span></div><button class="primary" data-final-exam="'+esc(x._id)+'">'+(user.role==='student'?'Mening qaydim':'Jurnal va tafsilotlar')+' →</button></article>'}).join('');
 const table='<div class="table-wrap"><table class="exam-table"><thead><tr><th>Nazorat</th><th>Guruh</th><th>Vaqt</th><th>Holat</th><th>Amal</th></tr></thead><tbody>'+filtered.map(x=>'<tr><td><b>'+esc(x.title)+'</b><small> · '+esc(finalExamTypeLabel[x.type]||x.type)+'</small></td><td>'+esc(x.groupId?.name||'—')+'</td><td>'+esc(new Date(x.startsAt).toLocaleString('uz-UZ'))+'</td><td>'+esc(labels[x.status]||x.status)+'</td><td><button data-final-exam="'+esc(x._id)+'">Ochish →</button></td></tr>').join('')+'</tbody></table></div>';
 const note=user.role==='student'?'Shaxsan o‘tkaziladigan nazoratlar va shaxsiy qaydlaringiz.':user.role==='teacher'?'Siz nazoratchi yoki fan o‘qituvchisi bo‘lgan nazoratlar.':'Akademik yakuniy nazoratlar reyestri va hujjatlashtirilgan jurnal.';
 host.innerHTML='<div class="exam-summary"><div><b>'+counts.all+'</b><span>Jami nazorat</span></div><div><b>'+counts.planned+'</b><span>Rejada</span></div><div><b>'+counts.in_progress+'</b><span>Jarayonda</span></div><div><b>'+counts.completed+'</b><span>Yakunlangan</span></div></div><p class="exam-intro">'+esc(note)+'</p>'+tabs+(filtered.length?(examViewMode==='table'?table:'<div class="exam-grid">'+cards+'</div>'):'<div class="empty"><b>Nazorat topilmadi</b><p>Filtrni o‘zgartiring.</p></div>')+'<article class="exam-online-info"><div><b>💻 Onlayn mashq testlari va proktoring</b><p>Masofaviy bilimni tekshirish fan testlari orqali amalga oshiriladi. Ushbu testlar OTMda shaxsan o‘tkaziladigan yakuniy nazorat o‘rnini bosmaydi.</p></div><button class="secondary" id="examOnlineOpen">Fan testlariga o‘tish →</button></article>';
 host.querySelectorAll('[data-final-exam]').forEach(button=>button.onclick=()=>openFinalExam(button.dataset.finalExam));
 host.querySelectorAll('[data-exam-filter]').forEach(button=>button.onclick=()=>{examStatusFilter=button.dataset.examFilter;renderFinalExams()});
 host.querySelectorAll('[data-exam-view]').forEach(button=>button.onclick=()=>{examViewMode=button.dataset.examView;renderFinalExams()});
 $('#examOnlineOpen')?.addEventListener('click',()=>go('courses'));
}
async function loadFinalExams(){window.dispatchEvent(new Event('hallaym-remote-exams-open'));try{examCachedRows=await api('/lms/final-exams');$('#finalExamDetail').innerHTML='';renderFinalExams()}catch(e){toast(e.message)}}
async function openFinalExam(id){
  try{
    const x=await api('/lms/final-exams/'+id+'/records'),s=x.session,editor=['teacher','admin','superadmin'].includes(user.role),admin=['admin','superadmin'].includes(user.role),byStudent=new Map((x.records||[]).map(r=>[String(r.studentId?._id||r.studentId),r]));
    let html='<article><div class="section-title"><div><button id="finalExamBack">← Orqaga</button><h2>'+esc(s.title)+'</h2></div><div>'+(editor&&s.status==='planned'?'<button id="startFinalExam" class="secondary">Boshlash</button>':'')+(admin&&!['completed','cancelled'].includes(s.status)?'<button id="completeFinalExam" class="primary">Yakunlash</button>':'')+'</div></div><p><b>'+esc(finalExamTypeLabel[s.type]||s.type)+'</b> · '+esc(s.academicYear)+' · '+esc(s.semester)+'-semestr</p><p>'+new Date(s.startsAt).toLocaleString('uz-UZ')+' — '+new Date(s.endsAt).toLocaleString('uz-UZ')+' · '+esc(s.location)+(s.room?' · '+esc(s.room):'')+'</p><p><b>Holat:</b> '+esc(s.status)+' · <b>Shakl:</b> shaxsan</p>';
    if(user.role==='student'){const r=x.records?.[0];html+='<h3>Mening qaydim</h3>'+(r?'<p>Qatnashuv: '+esc(r.attendance)+' · shaxs hujjati: '+(r.identityDocumentChecked?'tekshirilgan':'tekshirilmagan')+(r.score!==undefined?' · '+esc(r.score)+' ball':'')+(r.resultLabel?' · '+esc(r.resultLabel):'')+'</p>':'<p>Hali qayd kiritilmagan.</p>')}
    else html+='<h3>Talabalar</h3>'+(x.students||[]).map(st=>{const r=byStudent.get(String(st._id)),foreign=String(st.citizenshipCountry||'UZ').toUpperCase()!=='UZ';return '<div class="lesson-row"><div><b>'+esc(st.fullName)+'</b><small>@'+esc(st.login)+' · '+esc(st.citizenshipCountry||'UZ')+(foreign?' · xorijiy istisno mavjud':'')+(r?' · '+esc(r.attendance)+' · '+(r.identityDocumentChecked?'ID ✓':'ID —')+(r.score!==undefined?' · '+esc(r.score)+' ball':''):' · qayd kiritilmagan')+'</small></div><button data-final-record="'+esc(st._id)+'">'+(r?'Tahrirlash':'Qayd')+'</button></div>'}).join('');
    html+='</article>';$('#finalExamDetail').innerHTML=html;$('#finalExamList').innerHTML='';
    $('#finalExamBack').onclick=loadFinalExams;
    $('#startFinalExam')?.addEventListener('click',async()=>{try{await api('/lms/final-exams/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:'in_progress'})});openFinalExam(id)}catch(e){toast(e.message)}});
    $('#completeFinalExam')?.addEventListener('click',async()=>{if(!await askConfirmation('Barcha talabalar qaydi va yakuniy natijalar tekshirildimi?'))return;try{await api('/lms/final-exams/'+id+'/complete',{method:'POST'});toast('Yakuniy nazorat yopildi');openFinalExam(id)}catch(e){toast(e.message)}});
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

let libraryCategory='',librarySubcategory='',libraryRecords=[];
const libraryLabels={book:'Kitob',textbook:'Darslik',manual:'Qo‘llanma',monograph:'Monografiya',article:'Ilmiy maqola',research:'Tadqiqot',thesis:'Dissertatsiya',standard:'Standart',other:'Boshqa'};
const libraryTopics=[['Dasturlash','Dasturlash'],['Moliya','Moliya'],['Iqtisodiyot','Iqtisodiyot'],['Muhandislik','Muhandislik'],['Pedagogika','Pedagogika'],['Boshqa yo‘nalishlar','Boshqa']];
function libraryTopic(r){const t=[r.title,r.description,...(r.tags||[])].join(' ').toLowerCase();return /dastur|python|javascript|web|algoritm|code|program/.test(t)?'Dasturlash':/moliya|bank|finance|buxgalter/.test(t)?'Moliya':/iqtisod|economic|makro|biznes/.test(t)?'Iqtisodiyot':/muhandis|texnik|mexanik|energi/.test(t)?'Muhandislik':/pedagog|ta.lim|metodik/.test(t)?'Pedagogika':'Boshqa'}
function libraryCover(r){const initials=String(r.title||'KITOB').split(/\s+/).slice(0,3).map(x=>x[0]||'').join('').toUpperCase();return '<div class="library-cover" aria-hidden="true"><span>'+esc(libraryLabels[r.type]||'Resurs')+'</span><strong>'+esc(initials)+'</strong><small>HALLAYM EDU · QarDTU</small></div>'}
function renderLibrary(){const host=$('#libraryList');if(!host)return;const search=String($('#librarySearch')?.value||'').toLowerCase().trim();let rows=libraryRecords.filter(r=>!search||[r.title,(r.authors||[]).join(' '),r.description,(r.tags||[]).join(' ')].join(' ').toLowerCase().includes(search));const heading='<div class="library-crumb"><button data-lib-reset>📚 Katalog</button>'+(libraryCategory?' <span>›</span> <button data-lib-back>'+esc(libraryLabels[libraryCategory])+'</button>':'')+(librarySubcategory?' <span>›</span> <strong>'+esc(librarySubcategory)+'</strong>':'')+'</div>';
if(!libraryCategory&&!search){const types=[...new Set(rows.map(r=>r.type))];host.innerHTML=heading+'<div class="library-category-grid">'+types.map(type=>'<button class="library-category-tile" data-lib-category="'+esc(type)+'"><span class="library-category-icon">▤</span><b>'+esc(libraryLabels[type]||type)+'</b><small>'+rows.filter(r=>r.type===type).length+' resurs</small><span>Ko‘rish →</span></button>').join('')+'</div>';host.querySelectorAll('[data-lib-category]').forEach(b=>b.onclick=()=>{libraryCategory=b.dataset.libCategory;renderLibrary()})}
else if(libraryCategory&&!librarySubcategory&&!search){rows=rows.filter(r=>r.type===libraryCategory);const groups=[...new Set(rows.map(libraryTopic))];host.innerHTML=heading+'<div class="library-category-grid">'+groups.map(topic=>'<button class="library-category-tile" data-lib-topic="'+esc(topic)+'"><span class="library-category-icon">📖</span><b>'+esc(topic)+'</b><small>'+rows.filter(r=>libraryTopic(r)===topic).length+' resurs</small><span>Kitoblarni ko‘rish →</span></button>').join('')+'</div>';host.querySelectorAll('[data-lib-topic]').forEach(b=>b.onclick=()=>{librarySubcategory=b.dataset.libTopic;renderLibrary()})}
else{if(libraryCategory)rows=rows.filter(r=>r.type===libraryCategory);if(librarySubcategory)rows=rows.filter(r=>libraryTopic(r)===librarySubcategory);host.innerHTML=heading+'<div class="library-book-grid">'+rows.map(r=>'<article class="library-book-card">'+libraryCover(r)+'<div class="library-book-content"><small>'+esc(libraryLabels[r.type]||r.type)+' · '+esc(r.language||'uz')+'</small><h3>'+esc(r.title)+'</h3><p>'+esc((r.authors||[]).join(', ')||'Muallif ko‘rsatilmagan')+'</p><p class="library-desc">'+esc(r.description||'Akademik elektron resurs')+'</p><button class="primary" data-library-detail="'+esc(r._id)+'">Batafsil →</button></div></article>').join('')+'</div>'+(rows.length?'':'<div class="empty">Bu bo‘limda resurs topilmadi.</div>');host.querySelectorAll('[data-library-detail]').forEach(b=>b.onclick=()=>showLibraryDetail(b.dataset.libraryDetail))}
host.querySelector('[data-lib-reset]')?.addEventListener('click',()=>{libraryCategory='';librarySubcategory='';$('#librarySearch').value='';renderLibrary()});host.querySelector('[data-lib-back]')?.addEventListener('click',()=>{librarySubcategory='';renderLibrary()})}
function showLibraryDetail(id){const r=libraryRecords.find(x=>String(x._id)===String(id));if(!r)return;const host=$('#libraryList');host.innerHTML='<div class="library-crumb"><button id="libraryReturn">← Katalogga qaytish</button></div><div class="library-detail">'+libraryCover(r)+'<div><small>'+esc(libraryLabels[r.type]||r.type)+' · '+esc(r.publicationYear||'')+'</small><h2>'+esc(r.title)+'</h2><p><b>Muallif:</b> '+esc((r.authors||[]).join(', ')||'—')+'</p><p><b>Til:</b> '+esc(r.language||'—')+' · <b>ISBN:</b> '+esc(r.isbn||'—')+'</p><p>'+esc(r.description||'Tavsif kiritilmagan')+'</p><p>'+esc((r.tags||[]).join(' · '))+'</p><button class="primary" id="libraryListen">🔊 Ovozda tinglash</button> <button class="secondary" id="libraryRead">PDF / manbani ochish ↗</button> <button class="secondary" id="libraryDownload">Yuklab olish ↗</button>'+(['admin','superadmin'].includes(user.role)?' <button class="secondary" id="libraryArchive">Arxivlash</button>':'')+'<p class="muted">PDF ko‘rish manbaning formatiga bog‘liq. Yuklash huquqi manba tomonidan belgilanadi.</p></div></div>';$('#libraryReturn').onclick=renderLibrary;const open=async(download=false)=>{try{const x=await api('/lms/library/'+encodeURIComponent(r._id)+'/open');if(!x.url)throw Error('Manba havolasi yo‘q');const a=document.createElement('a');a.href=x.url;a.target='_blank';a.rel='noopener noreferrer';if(download&&new URL(x.url,location.origin).origin===location.origin)a.download=String(r.title||'kitob').slice(0,100);document.body.append(a);a.click();a.remove()}catch(e){toast(e.message)}};$('#libraryListen').onclick=async()=>{try{const x=await api('/lms/library/'+encodeURIComponent(r._id)+'/open');openAudioReader({title:r.title,url:x.url,start:{lang:/^ru/i.test(r.language)?'ru':/^en/i.test(r.language)?'en':'uz'},storageKey:String(user._id)+':library:'+r._id,announce:a11y.announce})}catch(e){toast(e.message)}};$('#libraryRead').onclick=()=>open(false);$('#libraryDownload').onclick=()=>open(true);if($('#libraryArchive'))$('#libraryArchive').onclick=async()=>{if(!await askConfirmation('Resurs arxivlansinmi?'))return;try{await api('/lms/library/'+encodeURIComponent(id),{method:'DELETE'});await loadLibrary()}catch(e){toast(e.message)}}}
async function loadLibrary(){try{const q=$('#librarySearch')?.value?.trim()||'',type=$('#libraryType')?.value||'',params=new URLSearchParams();if(q)params.set('q',q);if(type)params.set('type',type);libraryRecords=await api('/lms/library'+(params.toString()?'?'+params.toString():''));if(type&&type!==libraryCategory){libraryCategory=type;librarySubcategory=''}renderLibrary()}catch(e){toast(e.message)}}
$('#toggleCarlibEmbed')?.addEventListener('click',()=>{
  const button=$('#toggleCarlibEmbed'),wrapper=$('#carlibEmbedWrap'),frame=$('#carlibEmbed');
  const opened=wrapper.hidden;wrapper.hidden=!opened;button.setAttribute('aria-expanded',String(opened));
  button.textContent=opened?'Kutubxonani yopish':'Shu sahifada ochish';
  if(opened&&!frame.src)frame.src='https://carlib.kstu.uz/oz';
});
$('#libraryApply')?.addEventListener('click',loadLibrary);$('#openLibraryManager')?.addEventListener('click',()=>go('libraryManage'));
$('#librarySearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadLibrary()});
$('#addLibraryItem')?.addEventListener('click',async()=>{
  try{
    const courses=await api('/lms/courses'),admin=['admin','superadmin'].includes(user.role);
    modal('Kutubxona resursi','<label>Turi<select name="type"><option value="textbook">Darslik</option><option value="book">Kitob</option><option value="manual">Qo‘llanma</option><option value="monograph">Monografiya</option><option value="article">Ilmiy maqola</option><option value="research">Tadqiqot</option><option value="thesis">Dissertatsiya</option><option value="standard">Standart</option><option value="other">Boshqa</option></select></label><label>Sarlavha<input name="title" required></label><label>Mualliflar (vergul bilan)<input name="authors"></label><label>Nashr yili<input name="publicationYear" type="number" min="1000" max="3000"></label><label>Til<input name="language" value="uz"></label><label>ISBN<input name="isbn"></label><label>DOI<input name="doi"></label><label>HTTPS manba<input name="sourceUrl" type="url" required></label><label>Teglar (vergul bilan)<input name="tags"></label><label>Izoh<textarea name="description"></textarea></label>'+(admin?'<label>Ko‘rinish<select name="audience"><option value="university">Butun universitet</option><option value="courses">Tanlangan fanlar</option></select></label>':'')+'<p>Fanlarga bog‘lash:</p>'+courses.map(x=>'<label><input type="checkbox" name="courseIds" value="'+esc(x._id)+'"> '+esc(x.title)+' · '+esc(x.groupId?.name||'')+'</label>').join(''),async d=>{const ids=(Array.isArray(d.courseIds)?d.courseIds:[d.courseIds]).filter(Boolean);await api('/lms/library',{method:'POST',body:JSON.stringify({...d,courseIds:ids,audience:admin?(d.audience||'university'):'courses'})});loadLibrary()});
  }catch(e){toast(e.message)}
});

const courseworkUi=createCourseworkUi({api,esc,csrf,toast,modal});
const lessonHistoryUi=createLessonHistoryUi({api,esc,toast});
function highlightSearchTarget(node){
 if(!node)return false;
 document.querySelectorAll('.global-search-found').forEach(e=>e.classList.remove('global-search-found'));
 if(node.tagName==='DETAILS')node.open=true;for(let p=node.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
 node.classList.add('global-search-found');
 node.scrollIntoView({block:'center',behavior:'smooth'});
 setTimeout(()=>node.classList.remove('global-search-found'),6500);
 return true;
}
function searchTargetById(id,scope=document){
 return [...scope.querySelectorAll('[data-search-item]')].find(el=>el.dataset.searchItem===String(id))||null;
}
async function openGlobalSearchResult(hit){
 if(!hit?.id||!hit.page)return;
 globalSearchUi.clear();
 const type=hit.type;
 if(type==='page'){
   const nav=[...document.querySelectorAll('nav button[data-page]:not(.hidden)')].find(b=>b.dataset.page===hit.page);
   if(!nav)throw new Error('Bu sahifaga kirish huquqi yo‘q');
   go(hit.page);highlightSearchTarget($('#'+hit.page+' h1'));return;
 }
 if(type==='video'){
   go('videos',true);await loadVideoLessons();
   if(!videoLessonsCache.some(v=>String(v._id)===String(hit.id)))videoLessonsCache.unshift(await api('/search/target/video/'+encodeURIComponent(hit.id)));
   await openVideoLesson(hit.id);
   highlightSearchTarget($('#watchVideoTitle')||$('#watchTitle'));return;
 }
 if(['course','assignment','resource','quiz'].includes(type)){
   if(!hit.courseId)throw new Error('Fan ID topilmadi');
   go('courses',true);await loadCourses();await openCourse(hit.courseId);
   selectCourseworkTab('tasks');
   const item=searchTargetById(hit.id,$('#courseDetail'))||$('#courseDetail article');
   highlightSearchTarget(item);return;
 }
 if(type==='library'){
   go('library',true);libraryCategory='';librarySubcategory='';
   if($('#librarySearch'))$('#librarySearch').value=hit.title;
   if($('#libraryType'))$('#libraryType').value='';
   await loadLibrary();
   if(!libraryRecords.some(item=>String(item._id)===String(hit.id)))throw new Error('Kutubxonadagi yozuvni ochib bo‘lmadi');
   showLibraryDetail(hit.id);
   highlightSearchTarget($('#libraryList .library-detail'));return;
 }
 if(type==='schedule'){
   go('schedule',true);scheduleScopeMode='all';scheduleScopeKey='';scheduleViewMode='week';
   for(const id of ['scheduleTeacherFilter','scheduleGroupFilter','scheduleDayFilter'])if($('#'+id))$('#'+id).value='';
   await loadSchedules();
   const item=searchTargetById(hit.id,$('#scheduleList'));
   if(!highlightSearchTarget(item))toast('Dars topildi, lekin joriy jadval filtrida ko‘rinmadi');
   return;
 }
 if(type==='group'){
   go('structure',true);structureType='group';
   all('.tabs button').forEach(button=>button.classList.toggle('active',button.dataset.type==='group'));
   await loadStructure();highlightSearchTarget(searchTargetById(hit.id,$('#structureList')));return;
 }
 if(type==='user'){
   if(!can('users.manage'))throw new Error('Foydalanuvchi profilini ko‘rishga ruxsat yo‘q');
   go('users',true);
   if($('#userSearch'))$('#userSearch').value=hit.title;
   if($('#userRoleFilter'))$('#userRoleFilter').value='';
   if($('#userStatusFilter'))$('#userStatusFilter').value='';
   await loadUsers();
   highlightSearchTarget(searchTargetById(hit.id,$('#usersList')));
   await openUserProfile(hit.id);
   return;
 }
 if(type==='history'){
   go('history',true);await loadLessonHistory(hit.id);
   highlightSearchTarget($('#historyDetail'));return;
 }
 go(hit.page);
}
const globalSearchUi=createGlobalSearchUi({api,esc,onPick:openGlobalSearchResult,toast,
 canView:type=>{
   if(type==='user')return can('users.manage');
   if(type==='group')return can('structure.manage')||['dean','department'].includes(user?.role);
   if(type==='history')return ['teacher','admin','superadmin','rectorate','dean','department','tutor'].includes(user?.role);
   return true;
 }
});
function loadGlobalSearch(){globalSearchUi.open()}
$('#globalSearchOpen')?.addEventListener('click',()=>go('search'));
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
   e.preventDefault();if(user)go('search');
 }
});
$('#openLessonHistoryFromLive')?.addEventListener('click',()=>go('history'));
async function loadLessonHistory(selectedId=''){await lessonHistoryUi.load($('#lessonHistoryBoard'),typeof selectedId==='string'?selectedId:'')}
$('#historyRefresh')?.addEventListener('click',()=>loadLessonHistory().catch(e=>toast(e.message)));
const personalGradesUi=createPersonalGradesUi({api,esc,onOpenCourses:()=>go('courses'),onOpenGrades:()=>go('grades')});
async function loadGradePage(){
  const student=user?.role==='student',eligible=['teacher','admin','superadmin','rectorate','dean','department','tutor'].includes(user?.role);
  if(!student&&!eligible)return;
  $('#gradePageTitle').textContent=student?'Mening baholarim':'Elektron jurnal';
  $('#gradePageSubtitle').textContent=student?
    'O‘qituvchilar qo‘ygan baholar, tekshirilayotgan javoblar va izohlar':
    'Guruh va fanlar kesimida haftalik yoki oylik jurnal, CSV eksport';
  $('#studentGradesPage').hidden=!student;
  $('#teacherGradesPage').hidden=student;
  if(student)await personalGradesUi.page($('#studentGradesPage'));
  else await courseworkUi.journals($('#teacherGradesPage'),user.role);
}
$('#gradePageRefresh')?.addEventListener('click',()=>loadGradePage().catch(e=>toast(e.message)));
let courseworkTab='tasks';
function selectCourseworkTab(tab='tasks'){
  const eligible=courseworkUi.allowJournal(user?.role);
  const canGrade=['teacher','admin','superadmin'].includes(user?.role);
  if(tab==='grades'&&!canGrade)tab='tasks';
  if(tab==='journal'&&!eligible)tab='tasks';
  courseworkTab=tab;
  all('[data-coursework-tab]').forEach(button=>{
    const active=button.dataset.courseworkTab===tab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
  });
  for(const key of ['tasks','grades','journal']){
    const pane=$('#coursework'+key[0].toUpperCase()+key.slice(1)+'Pane');
    if(pane)pane.hidden=key!==tab;
  }
  const button=$('#teacherCourseCreate');
  if(button)button.classList.toggle('hidden',tab!=='tasks'||user?.role!=='teacher');
  const add=$('#addCourse');
  if(add)add.classList.toggle('hidden',tab!=='tasks'||!['superadmin','admin','tech','rectorate','dean','department','tutor'].includes(user?.role));$('#subjectCatalogAdd')?.classList.toggle('hidden',tab!=='tasks'||!['superadmin','admin','tech','rectorate','dean','department','tutor'].includes(user?.role));
  if(tab==='grades')courseworkUi.grading($('#courseworkGradesBoard'),user?.role).catch(e=>toast(e.message));
  if(tab==='journal')courseworkUi.journals($('#courseworkJournalBoard'),user?.role).catch(e=>toast(e.message));
}
all('[data-coursework-tab]').forEach(button=>{
  button.addEventListener('click',()=>selectCourseworkTab(button.dataset.courseworkTab));
  button.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();
    const options=all('[data-coursework-tab]:not(.hidden)');
    const i=options.indexOf(button),direction=e.key==='ArrowRight'?1:-1;
    const target=options[(i+direction+options.length)%options.length];
    target?.focus();if(target)selectCourseworkTab(target.dataset.courseworkTab);
  });
});
$('#teacherCourseCreate')?.addEventListener('click',async()=>{
 try{
  const groups=await api('/coursework/teacher-groups');
  if(!groups.length)return toast('Sizning jadvalingizda biriktirilgan guruhlar yo‘q.');
  const options=groups.map(g=>'<option value="'+esc(g.groupId)+'" data-subject="'+esc(g.subject)+'">'+esc(g.groupName)+' · '+esc(g.subject)+'</option>').join('');
  modal('O‘z guruhimga fan ochish','<label>Biriktirilgan guruh<select name="groupId" required>'+options+'</select></label><label>Fan nomi<input name="title" placeholder="Masalan: Statistika" minlength="3" maxlength="120" required></label>',async d=>{
    await api('/coursework/teacher-courses',{method:'POST',body:JSON.stringify(d)});await loadCourses();
  });
  const first=groups[0]?.subject;if(first){const inp=$('#modalForm input[name="title"]');if(inp)inp.value=first}
 }catch(e){toast(e.message)}
});
async function loadCourses(){
  try{$('#courseCompliance').classList.toggle('hidden',!['admin','superadmin'].includes(user.role));const rows=await api('/lms/courses');$('#courseDetail').innerHTML='';$('#courseList').hidden=false;$('#courseList').classList.add('tg-course-list');$('#courseList').innerHTML=rows.map(c=>'<article class="tg-course-row" data-search-item="'+esc(c._id)+'"><span class="tg-course-avatar" aria-hidden="true">▤</span><div class="tg-course-info"><h2>'+esc(c.title)+'</h2><p><span>'+esc(c.code)+'</span><span>'+esc(c.language)+'</span><span>'+esc(c.groupId?.name||'')+'</span><span>'+esc(c.teacherId?.fullName||'')+'</span></p></div><button class="primary tg-course-open" data-course="'+esc(c._id)+'">Ochish <span aria-hidden="true">→</span></button></article>').join('')||'<div class="empty">Hozircha fanlar biriktirilmagan.</div>';all('[data-course]').forEach(b=>b.onclick=()=>openCourse(b.dataset.course));
    all('[data-coursework-tab="grades"]').forEach(b=>b.classList.toggle('hidden',!['teacher','admin','superadmin'].includes(user.role)));
    all('[data-coursework-tab="journal"]').forEach(b=>b.classList.toggle('hidden',!courseworkUi.allowJournal(user.role)));
    selectCourseworkTab('tasks');
  }catch(e){toast(e.message)}
}
async function uploadCourseResource(courseId,data){
  if(!(data.file instanceof File)||!data.file.size)throw Error('Faylni tanlang');
  const body=new FormData();body.append('file',data.file);body.append('title',data.title||'');body.append('description',data.description||'');
  return await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/lms/courses/'+encodeURIComponent(courseId)+'/resources/upload');xhr.withCredentials=true;xhr.setRequestHeader('X-CSRF-Token',csrf());xhr.upload.onprogress=e=>{if(e.lengthComputable&&$('#uploadProgress'))$('#uploadProgress').textContent='Yuklanmoqda: '+Math.round(e.loaded/e.total*100)+'%'};xhr.onload=()=>{const response=JSON.parse(xhr.responseText||'{}');if(xhr.status>=200&&xhr.status<300)resolve(response);else reject(Error(response.message||'Yuklashda xatolik'))};xhr.onerror=()=>reject(Error('Tarmoq xatosi'));xhr.send(body)});
}
$('#courseCompliance').onclick=async()=>{try{const x=await api('/lms/compliance');$('#courseDetail').innerHTML='<article><h2>Akademik tayyorlik</h2><p>Hisobot kiritilgan ma’lumotlarga asoslanadi. 1:50 me’yorining rasmiy talqini uchun OTM tasdig‘i kerak.</p><h3>Fansiz guruhlar</h3><p>'+esc(x.groupsWithoutCourses.map(g=>g.name).join(', ')||'Yo‘q')+'</p><h3>Fanlar</h3>'+x.courses.map(c=>'<p>'+esc(c.title)+' · '+esc(c.group)+' · '+esc(c.studentCount)+' talaba · '+Object.entries(c.checks).map(([k,v])=>esc(k)+': '+(v?'✓':'✗')).join(' · ')+'</p>').join('')+'<h3>O‘qituvchi yuklamasi</h3>'+x.teacherLoad.map(t=>'<p>'+esc(t.teacher)+' · '+esc(t.uniqueStudents)+' talaba'+(t.aboveFifty?' · 50 dan ko‘p':'')+'</p>').join('')+'</article>'}catch(e){toast(e.message)}};
async function openCourse(id,pushHistory=true){
  try{const [x,scorm,topicTree]=await Promise.all([api('/lms/courses/'+id),api('/lms/courses/'+id+'/scorm'),api('/lms/courses/'+id+'/topics')]),editor=user.role==='teacher'||['admin','superadmin','tech','rectorate','dean','department','tutor'].includes(user.role);let html='<article data-search-item="'+esc(id)+'"><button type="button" id="backToCourseList">← Fanlar ro‘yxatiga qaytish</button><h2>'+esc(x.course.title)+'</h2><p>'+esc(x.course.code)+' · '+esc(x.course.language)+'</p>';
    if(x.course.syllabusUrl)html+='<p><a href="'+esc(x.course.syllabusUrl)+'" target="_blank" rel="noopener noreferrer">Fan dasturi ↗</a></p>';
    html+=coursePlanHtml(x,topicTree,{editor,student:user.role==='student',esc});
    if(editor)html+='<div class="course-legacy-create" hidden><button id="newResource"></button><button id="uploadResource"></button><button id="newAssignment"></button><button id="newQuiz"></button></div><div class="course-topic-reports"><button id="resourceUsage">Resurs faolligi</button><button id="courseResults">Yakuniy natijalar</button></div>';
    html+='<details class="course-extra-section"><summary>SCORM paketlar (qo‘shimcha)</summary>'+(scorm.map(p=>'<div class="lesson-row"><div><b>'+esc(p.title)+'</b><small>'+esc(p.standard)+' · '+esc(p.scoes?.length||1)+' SCO</small></div>'+(user.role==='student'?(p.scoes?.length?p.scoes.map(s=>'<button data-scorm="'+esc(p._id)+'" data-sco="'+esc(s.identifier)+'">'+esc(s.title||'Ochish')+'</button>').join(' '):'<button data-scorm="'+esc(p._id)+'">Ochish</button>'):'')+'</div>').join('')||'<p>Paket yo‘q</p>')+(editor?'<label>SCORM ZIP (8 MB gacha)<input id="scormFile" type="file" accept=".zip"></label><button id="uploadScorm">Yuklash</button>':'')+'<div id="scormPlayer"></div></details>';
    html+='</article>';
    const courseHash='#course='+encodeURIComponent(id);
    if(pushHistory&&location.hash!==courseHash)history.pushState({page:'courses',courseId:id},'',location.pathname+location.search+courseHash);
    $('#courseDetail').innerHTML=html+'<article id="courseworkDetailPanel" class="coursework-module"></article>';
    const focus=courseTopicFocus.get(String(id));
    if(focus){const section=all('#courseDetail details[data-topic]').find(el=>el.dataset.topic===focus);if(section)section.open=true}
    all('#courseDetail details[data-topic]').forEach(el=>el.addEventListener('toggle',()=>{if(el.open)courseTopicFocus.set(String(id),el.dataset.topic)}));
    $('#courseList').hidden=true;
    $('#backToCourseList')?.addEventListener('click',()=>{
      if(location.hash.startsWith('#course='))history.pushState({page:'courses'},'',location.pathname+location.search);
      $('#courseList').hidden=false;
      $('#courseDetail').innerHTML='';
      $('#courseList').scrollIntoView({block:'start'});
    });
    let chosenTopicId='';
    const activeTopic=()=>chosenTopicId||($('#courseTopicTarget')?$('#courseTopicTarget').value:'');
    const returnToCourse=()=>{const focus=activeTopic();if(focus)courseTopicFocus.set(String(id),focus);setTimeout(()=>openCourse(id,false),40)};
    const attachTopic=async(type,itemId,topicId)=>{
      if(!topicId)return;
      await api('/lms/courses/'+id+'/topics/'+topicId+'/items',{method:'POST',body:JSON.stringify({itemType:type,itemId})});
    };
    const newTopic=()=>modal('Yangi dars mavzusi',
      '<label>Mavzu nomi<input name="title" required minlength="2" maxlength="180" placeholder="1-mavzu: Fanga kirish"></label><label>Tavsif<textarea name="description" maxlength="3000"></textarea></label>',
      async d=>{const topic=await api('/lms/courses/'+id+'/topics',{method:'POST',body:JSON.stringify(d)});if(topic?._id)courseTopicFocus.set(String(id),String(topic._id));returnToCourse()});
    $('#courseAddButton')?.addEventListener('click',()=>{const menu=$('#courseAddMenu');menu.hidden=!menu.hidden});
    const actions={resource:'#newResource',upload:'#uploadResource',assignment:'#newAssignment',quiz:'#newQuiz'};
    all('[data-course-create]').forEach(b=>b.onclick=()=>{
      chosenTopicId=$('#courseTopicTarget')?.value||'';$('#courseAddMenu').hidden=true;
      if(b.dataset.courseCreate==='topic')newTopic();
      else if(['upload','resource','assignment','video','mine'].includes(b.dataset.courseCreate)){
        const mode={upload:'file',resource:'link',assignment:'assignment',video:'video',mine:'mine'}[b.dataset.courseCreate];
        if(chosenTopicId)courseTopicFocus.set(String(id),chosenTopicId);
        openResourceCenter({api,modal,esc,csrf,toast,courseId:id,topicId:chosenTopicId,defaultMode:mode,uploadCourseResource,attachTopic}).catch(e=>toast(e.message));
      }
      else if(actions[b.dataset.courseCreate])$(actions[b.dataset.courseCreate])?.click();
    });
    all('[data-topic-add]').forEach(b=>b.onclick=()=>{
      chosenTopicId=b.dataset.topicAdd;$('#courseTopicTarget').value=chosenTopicId;
      $('#courseAddMenu').hidden=false;$('#courseAddMenu').scrollIntoView({block:'center',behavior:'smooth'});
    });
    all('[data-topic-edit]').forEach(b=>b.onclick=()=>{
      const t=(topicTree.topics||[]).find(t=>String(t._id)===b.dataset.topicEdit);if(!t)return;
      modal('Mavzuni tahrirlash','<label>Nomi<input name="title" value="'+esc(t.title)+'" required minlength="2"></label><label>Tavsif<textarea name="description">'+esc(t.description||'')+'</textarea></label>',
        async d=>{await api('/lms/courses/'+id+'/topics/'+t._id,{method:'PATCH',body:JSON.stringify(d)});returnToCourse()});
    });
    all('[data-topic-move]').forEach(b=>b.onclick=async()=>{try{b.disabled=true;await api('/lms/courses/'+id+'/topics/'+b.dataset.topicMove+'/move',{method:'POST',body:JSON.stringify({direction:Number(b.dataset.direction)})});await openCourse(id)}catch(e){toast(e.message);b.disabled=false}});
    all('[data-topic-delete]').forEach(b=>b.onclick=async()=>{if(!await askConfirmation('Mavzu o‘chirilsinmi? Ichidagi resurslar saqlanadi.'))return;try{await api('/lms/courses/'+id+'/topics/'+b.dataset.topicDelete,{method:'DELETE'});await openCourse(id)}catch(e){toast(e.message)}});
    all('[data-topic-assign]').forEach(el=>el.onchange=async()=>{try{el.disabled=true;if(el.value)await attachTopic(el.dataset.itemType,el.dataset.topicAssign,el.value);else await api('/lms/courses/'+id+'/items/'+el.dataset.itemType+'/'+el.dataset.topicAssign+'/topic',{method:'DELETE'});await openCourse(id)}catch(e){toast(e.message);el.disabled=false}});
    all('[data-topic-video]').forEach(b=>b.onclick=async()=>{try{go('videos',true);await loadVideoLessons();if(!videoLessonsCache.some(v=>String(v._id)===b.dataset.topicVideo))videoLessonsCache.unshift(await api('/search/target/video/'+b.dataset.topicVideo));await openVideoLesson(b.dataset.topicVideo)}catch(e){toast(e.message)}});
    $('#courseDetail').scrollIntoView({block:'start'});
    courseworkUi.refreshCourse(id,user.role,$('#courseworkDetailPanel')).catch(e=>toast(e.message));
    $('#newResource')?.addEventListener('click',()=>modal('Material qo‘shish','<label>Sarlavha<input name="title" required></label><label>Turi<select name="kind"><option value="document">Hujjat</option><option value="video">Video</option><option value="link">Havola</option></select></label><label>HTTPS havola<input name="url" type="url" required></label><label>Izoh<textarea name="description"></textarea></label>',async d=>{const row=await api('/lms/courses/'+id+'/resources',{method:'POST',body:JSON.stringify(d)});await attachTopic('resource',row._id||row.id,activeTopic());returnToCourse()}));
    $('#uploadResource')?.addEventListener('click',()=>modal('Fayl yuklash','<label>Fayl (PDF, Word, Excel, PowerPoint, rasm, audio, video, matn, ZIP)<input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.epub,.txt,.md,.csv,.srt,.vtt,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp3,.m4a,.wav,.ogg,.flac,.mp4,.webm,.mov,.mkv,.avi,.zip,.rar,.7z" required></label><label>Nom<input name="title" placeholder="Fayl nomi bo‘lsa bo‘sh qoldiring"></label><label>Izoh<textarea name="description"></textarea></label><p id="uploadProgress" role="status"></p>',async d=>{const row=await uploadCourseResource(id,d);await attachTopic('resource',row._id||row.id,activeTopic());returnToCourse()}));
    all('[data-library-resource]').forEach(b=>b.onclick=()=>modal('Kutubxona katalogiga qo‘shish','<label>Turi<select name="type"><option value="textbook">Darslik</option><option value="book">Kitob</option><option value="manual">Qo‘llanma</option><option value="monograph">Monografiya</option><option value="article">Ilmiy maqola</option><option value="research">Tadqiqot</option><option value="other">Boshqa</option></select></label><label>Sarlavha<input name="title" value="'+esc(b.dataset.libraryTitle||'')+'" required></label><label>Mualliflar<input name="authors"></label><label>Til<input name="language" value="uz"></label><label>Teglar<input name="tags"></label><label>Izoh<textarea name="description"></textarea></label>',async d=>{await api('/lms/library',{method:'POST',body:JSON.stringify({...d,resourceId:b.dataset.libraryResource,courseIds:[id],audience:'courses'})});toast('Kutubxona katalogiga qo‘shildi')}));
    all('[data-delete-resource]').forEach(b=>b.onclick=async()=>{if(!await askConfirmation('Resurs o‘chirilsinmi?'))return;try{await api('/lms/resources/'+b.dataset.deleteResource,{method:'DELETE'});openCourse(id)}catch(e){toast(e.message)}});
    $('#newAssignment')?.addEventListener('click',()=>modal('Topshiriq qo‘shish','<label>Turi<select name="category"><option value="assignment">Topshiriq</option><option value="independent_work">Mustaqil ish</option><option value="practice">Amaliyot</option></select></label><label>Sarlavha<input name="title" required></label><label>Ko‘rsatma<textarea name="instructions" required></textarea></label><label>Topshirish muddati<input name="dueAt" type="datetime-local"></label><label>Baholash shkalasi<select name="maxScore"><option value="2">2 ballik</option><option value="5">5 ballik</option><option value="10">10 ballik</option><option value="100" selected>100 ballik</option></select></label>',async d=>{const row=await api('/lms/courses/'+id+'/assignments',{method:'POST',body:JSON.stringify(d)});await attachTopic('assignment',row._id||row.id,activeTopic());returnToCourse()}));
    $('#newQuiz')?.addEventListener('click',()=>openQuizComposer({modal,api,courseId:id,openCourse,toast,esc,onQuizCreated:row=>attachTopic('quiz',row.id||row._id,activeTopic())}));
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
  if(!/^[0-9a-f]{24}$/i.test(String(id||''))){toast('Test ID topilmadi. Sahifani yangilang.');return}
  let stop=()=>{},terminated=false,preflight=null,countdown=null;
  try{
    if(proctorExpected){
      const consent=await askConfirmation('Kamera nazoratli test: kamera, mikrofon, fullscreen, sahifadan chiqish va yuz holati nazorat qilinadi. Kritik qoidabuzarlik testni avtomatik yakunlaydi. Davom etasizmi?');
      if(!consent)return;
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Bu brauzer kamerani qo‘llamaydi. HTTPS va Chrome orqali oching.');
      try{
        preflight=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:24},facingMode:'user'},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      }catch(err){throw Error('Kamera/mikrofonni ochib bo‘lmadi: '+(err?.name==='NotAllowedError'?'brauzer sozlamasidan ruxsat bering':err?.message||'qurilmalarni tekshiring'))}
      if(document.documentElement.requestFullscreen&&!document.fullscreenElement){
        try{await document.documentElement.requestFullscreen()}catch(err){preflight.getTracks().forEach(t=>t.stop());preflight=null;throw Error('To‘liq ekran ochilmadi. Testni Chrome brauzerida qayta boshlang: '+(err?.message||''))}
      }
    }
    const x=await api('/lms/quizzes/'+id+'/start',{method:'POST',body:JSON.stringify({consent:proctorExpected?true:undefined,videoId:videoId||undefined})});
    const cameraBox=x.proctorRequired?'<div class="proctor-camera-box"><video id="proctorPreviewVideo" autoplay muted playsinline></video><div><b>📷 Kamera nazorati faol</b><small id="proctorCameraStatus">Yuzni kamera markazida tuting · oynadan chiqmang</small></div></div>':'';
    const accNote=x.accommodation?.extraTimePct?'<p class="hxa-needs" role="note">⏱ <b>Sizga +'+esc(x.accommodation.extraTimePct)+'% qo‘shimcha vaqt berilgan</b> ('+esc(x.baseDurationMinutes)+' o‘rniga '+esc(x.durationMinutes)+' daqiqa)'+(x.accommodation.proctorRelaxed?' · proktoring testni to‘xtatmaydi, faqat o‘qituvchi ko‘rib chiqadi':'')+'</p>':'';
    const fields=accNote+'<div class="proctor-exam-banner '+(x.proctorRequired?'strict':'')+'"><b>'+(x.proctorRequired?'🔒 Avtoproktoring faol':'Qisqa mavzu testi')+'</b><span>'+(x.proctorRequired?'Kamera, yuz holati, fullscreen va sahifadan chiqish real vaqtda nazorat qilinadi.':'Videodars bo‘yicha savollarni belgilang.')+'</span><strong id="examCountdown"></strong></div>'+cameraBox+x.questions.map((q,i)=>'<fieldset class="quiz-question"><legend><span>'+(i+1)+'</span>'+esc(q.prompt)+'</legend>'+q.options.map((option,j)=>'<label class="quiz-option"><input type="radio" name="q'+i+'" value="'+j+'" required><span>'+esc(option)+'</span></label>').join('')+'</fieldset>').join('');
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
    if(countdown)clearInterval(countdown);stop();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});console.error('Quiz start failure',e);toast('Test ochilmadi: '+(e?.message||'Noma’lum xatolik'))
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
      if('FaceDetector' in window){
        detector={kind:'native',instance:new FaceDetector({fastMode:true,maxDetectedFaces:2})};
      }else{
        const loaded=await loadMediaPipeFaceDetection(),FaceDetection=loaded.FaceDetection;
        const instance=new FaceDetection({locateFile:file=>loaded.base+file});instance.setOptions({model:'short',minDetectionConfidence:0.62});
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
      }
    }catch{send('face_detector_unavailable')}
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
const academicEntryWizard=createAcademicEntryWizard({api,esc,modal,toast,reloadCourses:loadCourses,reloadSchedules:loadSchedules});
$('#addCourse').onclick=()=>academicEntryWizard.addCourse();
const catalogBtn=document.createElement('button');catalogBtn.type='button';catalogBtn.id='subjectCatalogAdd';catalogBtn.textContent='1. + Yangi fan nomini kiritish';catalogBtn.className='secondary'+(['superadmin','admin','tech','rectorate','dean','department','tutor'].includes(user?.role)?'':' hidden');catalogBtn.onclick=()=>academicEntryWizard.addSubject();$('#addCourse')?.after(catalogBtn);
$('#reviewGrades').onclick=async()=>{try{const rows=await api('/lms/grade-changes');$('#courseDetail').innerHTML='<article><h2>Kutilayotgan baho so‘rovlari</h2>'+rows.map(r=>'<div class="lesson-row"><div><b>'+esc(r.requestedBy?.fullName||'')+'</b><p>'+esc(r.oldScore)+' → '+esc(r.newScore)+' · '+esc(r.reason)+'</p></div><button data-review="'+esc(r._id)+'" data-decision="approved">Tasdiqlash</button><button data-review="'+esc(r._id)+'" data-decision="rejected">Rad etish</button></div>').join('')+'</article>';all('[data-review]').forEach(b=>b.onclick=()=>modal('Baho so‘rovini ko‘rib chiqish','<label>Izoh<textarea name="note"></textarea></label>',async d=>{await api('/lms/grade-changes/'+b.dataset.review+'/review',{method:'POST',body:JSON.stringify({...d,decision:b.dataset.decision})});$('#reviewGrades').click()}))}catch(e){toast(e.message)}};
