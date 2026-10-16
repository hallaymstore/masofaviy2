// HALLAYM EDU — inclusive education (inklyuziv ta'lim): pure rules shared by the API, the UI meta and the tests.
// Functional needs (not diagnoses), individual accommodations and how they change deadlines, test time and proctoring,
// personal accessibility preferences, caption transcripts and subtitle files.

export const NEEDS={
  vision:{label:'Ko‘rish',icon:'👁',hint:'Ko‘rmaydigan yoki zaif ko‘radigan talaba'},
  hearing:{label:'Eshitish',icon:'👂',hint:'Eshitmaydigan yoki zaif eshitadigan talaba'},
  mobility:{label:'Harakatlanish',icon:'♿',hint:'Tayanch-harakat a’zolari, qo‘l motorikasi'},
  speech:{label:'Nutq',icon:'💬',hint:'Gapirishda qiyinchilik'},
  learning:{label:'O‘qish va yozish',icon:'📖',hint:'Disleksiya, disgrafiya, diskalkuliya'},
  attention:{label:'Diqqat va idrok',icon:'🧠',hint:'Diqqat yetishmasligi, autizm spektri'},
  health:{label:'Surunkali kasallik',icon:'🩺',hint:'Tez charchash, davolanish jadvali'},
  psych:{label:'Ruhiy salomatlik',icon:'🌿',hint:'Xavotir, stress'},
  other:{label:'Boshqa',icon:'➕',hint:'Boshqa alohida ehtiyoj'}
};
export const NEED_KEYS=Object.keys(NEEDS);

// Individual accommodations. type: pct (extra time), days (deadline), bool. `teacher` = what the teacher must do.
export const ACCOMMODATIONS={
  extraTimePct:{type:'pct',options:[0,25,50,100],icon:'⏱',label:'Test va imtihonlarda qo‘shimcha vaqt',short:v=>'+'+v+'% vaqt',teacher:'Test vaqti tizimda avtomatik uzaytiriladi'},
  deadlineExtraDays:{type:'days',max:14,icon:'📅',label:'Topshiriq muddatini uzaytirish',short:v=>'+'+v+' kun muddat',teacher:'Topshiriq muddati talaba uchun avtomatik uzaytiriladi'},
  captions:{type:'bool',icon:'CC',label:'Jonli darslarda subtitr',short:()=>'Subtitr',teacher:'Darsda subtitr avtomatik yoqiladi — aniq va sekinroq gapiring, yuzingiz kamerada ko‘rinsin'},
  signInterpreter:{type:'bool',icon:'🤟',label:'Surdotarjimon',short:()=>'Surdotarjimon',teacher:'Surdotarjimon darsga qo‘shiladi — uning videosi talabalarga doim ko‘rinadi'},
  screenReader:{type:'bool',icon:'🔊',label:'Ekran o‘qish dasturi (materiallar matn ko‘rinishida)',short:()=>'Ekran o‘qish',teacher:'Slayd va rasmlarni ovoz chiqarib izohlang; materiallarni matnli PDF/DOCX ko‘rinishida bering'},
  largePrint:{type:'bool',icon:'🔠',label:'Yirik shrift va kattalashtirilgan materiallar',short:()=>'Yirik shrift',teacher:'Materiallarni kamida 16–18 pt shriftda bering'},
  audioMaterials:{type:'bool',icon:'🎧',label:'Audio formatdagi materiallar',short:()=>'Audio material',teacher:'Asosiy materiallarning audio yoki video izohini qo‘shing'},
  proctorRelaxed:{type:'bool',icon:'🛡',label:'Yumshatilgan proktoring (avtomatik to‘xtatilmaydi, faqat ko‘rib chiqiladi)',short:()=>'Yumshoq proktoring',teacher:'Proktoring hodisalari testni to‘xtatmaydi — natijani qo‘lda ko‘rib chiqing'},
  restBreaks:{type:'bool',icon:'☕',label:'Imtihon paytida qisqa tanaffus (2 daqiqagacha)',short:()=>'Tanaffus',teacher:'Imtihonda 2 daqiqagacha pauza ruxsat etiladi'},
  oralAnswers:{type:'bool',icon:'🎙',label:'Yozma o‘rniga og‘zaki javob',short:()=>'Og‘zaki javob',teacher:'Yozma topshiriqlarni og‘zaki (audio/video) qabul qiling'},
  assistant:{type:'bool',icon:'🤝',label:'Assistent / tyutor-yordamchi hamrohligi',short:()=>'Assistent',teacher:'Assistent darsga qo‘shilishi mumkin'},
  noteTaker:{type:'bool',icon:'📝',label:'Dars matni va konspekt',short:()=>'Konspekt',teacher:'Dars subtitrlari matn sifatida saqlanadi; slaydlarni darsdan keyin yuklang'},
  accessibleRoom:{type:'bool',icon:'🚪',label:'Qulay auditoriya (1-qavat yoki lift, keng joy)',short:()=>'Qulay xona',teacher:'Auditoriya darsini 1-qavat yoki liftli xonaga qo‘ying, oldingi qatordan joy qoldiring'},
  frontSeat:{type:'bool',icon:'🪑',label:'Oldingi qatorda o‘tirish',short:()=>'Oldingi qator',teacher:'Talabaga oldingi qatordan joy bering'}
};
export const ACC_KEYS=Object.keys(ACCOMMODATIONS);
export const SUPPORT_KINDS={sign:'Surdotarjimon',assistant:'Assistent / tyutor-yordamchi',notetaker:'Konspekt yordamchisi'};
export const PROFILE_STATUSES={none:'Ariza yo‘q',requested:'Ko‘rib chiqilmoqda',approved:'Tasdiqlangan',rejected:'Rad etilgan'};

export function cleanNeeds(list){const set=new Set((Array.isArray(list)?list:[]).map(String));return NEED_KEYS.filter(k=>set.has(k))}
export function cleanAccommodations(input){
  const src=input&&typeof input==='object'?input:{},out={};
  for(const [k,def] of Object.entries(ACCOMMODATIONS)){
    const v=src[k];
    if(def.type==='pct'){const n=Number(v)||0;out[k]=def.options.includes(n)?n:def.options.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a,0)}
    else if(def.type==='days')out[k]=Math.max(0,Math.min(def.max,Math.round(Number(v)||0)));
    else out[k]=v===true||v==='true'||v===1||v==='1'||v==='on';
  }
  return out;
}
export const hasAny=acc=>Boolean(acc)&&ACC_KEYS.some(k=>Boolean(acc[k]));
export function accommodationChips(acc){
  if(!acc)return [];
  return ACC_KEYS.filter(k=>acc[k]).map(k=>({key:k,icon:ACCOMMODATIONS[k].icon,label:ACCOMMODATIONS[k].short(acc[k]),hint:ACCOMMODATIONS[k].teacher}));
}
// Only approved, non-expired profiles change anything in the system.
export function activeAccommodation(profile,todayKey){
  if(!profile||profile.status!=='approved')return null;
  if(profile.validUntil&&todayKey&&String(profile.validUntil)<String(todayKey))return null;
  const acc=cleanAccommodations(profile.accommodations);return hasAny(acc)?acc:null;
}
export const extendedMinutes=(minutes,pct)=>Math.ceil((Number(minutes)||0)*(1+Math.max(0,Number(pct)||0)/100));
export const extraMs=(minutes,pct)=>(extendedMinutes(minutes,pct)-(Number(minutes)||0))*60000;
export function personalDue(dueAt,days){
  if(!dueAt)return null;const d=new Date(dueAt);if(Number.isNaN(+d))return null;
  const n=Math.max(0,Number(days)||0);if(n)d.setDate(d.getDate()+n);return d;
}
export const pauseGraceMs=acc=>acc?.restBreaks?120000:15000;
// What a teacher / dean / tutor sees: the practical accommodations, never the need categories or internal notes.
export function teacherView(profile,todayKey){
  const acc=activeAccommodation(profile,todayKey);if(!acc)return null;
  return {chips:accommodationChips(acc),teacherNote:String(profile.teacherNote||''),validUntil:profile.validUntil||''};
}
export function ownView(profile,todayKey){
  if(!profile)return {status:'none',needs:[],accommodations:cleanAccommodations({}),active:null,request:null,consentTeachers:true};
  return {status:profile.status||'none',needs:cleanNeeds(profile.needs),accommodations:cleanAccommodations(profile.accommodations),active:activeAccommodation(profile,todayKey),
    request:profile.request||null,consentTeachers:profile.consentTeachers!==false,teacherNote:profile.teacherNote||'',validUntil:profile.validUntil||'',reviewedAt:profile.reviewedAt||null,decisionNote:profile.decisionNote||''};
}

// ---- personal accessibility preferences (stored per user, applied on every device) ----
export const PREF_DEFAULTS={textScale:100,lineHeight:'normal',letterSpacing:'normal',font:'default',contrast:'none',colorFilter:'none',
  reduceMotion:false,highlightLinks:false,bigCursor:false,readingRuler:false,strongFocus:false,clickToRead:false,ttsRate:1,
  captionsAlways:false,captionSize:0,announceChat:false,simpleLayout:false,voiceAssistant:false,voiceHandsFree:true,preset:''};
const PICK={lineHeight:['normal','wide','wider'],letterSpacing:['normal','wide','wider'],font:['default','readable','dyslexic'],
  contrast:['none','high','dark','yellow'],colorFilter:['none','grayscale','lowsat','protanopia','deuteranopia','tritanopia'],
  preset:['','lowvision','blind','deaf','dyslexia','motor','focus','epilepsy']};
export function cleanPrefs(input){
  const src=input&&typeof input==='object'?input:{},out={...PREF_DEFAULTS};
  out.textScale=Math.max(100,Math.min(200,Math.round((Number(src.textScale)||100)/5)*5));
  for(const [k,list] of Object.entries(PICK))if(list.includes(src[k]))out[k]=src[k];
  for(const k of ['reduceMotion','highlightLinks','bigCursor','readingRuler','strongFocus','clickToRead','captionsAlways','announceChat','simpleLayout','voiceAssistant'])out[k]=src[k]===true;
  out.voiceHandsFree=src.voiceHandsFree!==false;
  out.ttsRate=Math.max(0.5,Math.min(2,Math.round((Number(src.ttsRate)||1)*10)/10));
  out.captionSize=[0,1,2].includes(Number(src.captionSize))?Number(src.captionSize):0;
  return out;
}

// ---- caption transcripts ----
export function cleanSegment(text){return String(text||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,400)}
const pad=(n,w=2)=>String(Math.floor(n)).padStart(w,'0');
export function vttTime(ms){ms=Math.max(0,Math.round(ms));return pad(ms/3600000)+':'+pad(ms/60000%60)+':'+pad(ms/1000%60)+'.'+pad(ms%1000,3)}
export function transcriptToVtt(lines,startMs){
  const rows=(lines||[]).filter(l=>l?.text);if(!rows.length)return 'WEBVTT\n';
  const base=Number.isFinite(+startMs)?+startMs:+new Date(rows[0].at);
  return 'WEBVTT\n\n'+rows.map((l,i)=>{const a=+new Date(l.at)-base,next=rows[i+1]?+new Date(rows[i+1].at)-base:a+4000;const b=Math.max(a+800,Math.min(next,a+7000));
    return (i+1)+'\n'+vttTime(a)+' --> '+vttTime(b)+'\n'+(l.name?'<v '+String(l.name).replace(/[<>]/g,'')+'>':'')+String(l.text).replace(/-->/g,'→').replace(/</g,'‹')}).join('\n\n')+'\n';
}
export function transcriptToText(lines,{title='',date=''}={}){
  const head=[title,date].filter(Boolean).join(' · ');
  return (head?head+'\n\n':'')+(lines||[]).filter(l=>l?.text).map(l=>{const d=new Date(l.at);return '['+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())+'] '+(l.name?l.name+': ':'')+l.text}).join('\n')+'\n';
}

// ---- subtitle files for video lessons (WebVTT or SRT) ----
export const MAX_SUBTITLE_BYTES=400*1024;
export function normalizeSubtitles(raw){
  let s=String(raw||'').replace(/^﻿/,'').replace(/\r\n?/g,'\n').trim();
  if(!s)throw new Error('Subtitr fayli bo‘sh');
  if(Buffer.byteLength(s)>MAX_SUBTITLE_BYTES)throw new Error('Subtitr fayli 400 KB dan katta');
  if(!/^WEBVTT/.test(s)){
    if(!/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(s))throw new Error('Fayl WebVTT (.vtt) yoki SRT (.srt) formatida bo‘lishi kerak');
    s='WEBVTT\n\n'+s.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g,'$1.$2');
  }
  const cues=(s.match(/-->/g)||[]).length;if(!cues)throw new Error('Subtitrda birorta ham vaqt belgisi topilmadi');
  return {vtt:s+'\n',cues};
}
export function subtitlesToText(vtt){
  return String(vtt||'').split('\n').filter(l=>l&&!/^WEBVTT/.test(l)&&!/-->/.test(l)&&!/^\d+$/.test(l.trim())&&!/^(NOTE|STYLE|REGION)\b/.test(l)).map(l=>l.replace(/<[^>]*>/g,'').trim()).filter(Boolean)
    .filter((l,i,a)=>l!==a[i-1]).join('\n').slice(0,200000);
}
