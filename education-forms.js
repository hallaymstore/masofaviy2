// HALLAYM EDU — forms of study (kunduzgi / kechki / sirtqi / masofaviy) and classroom attendance rules.
// Pure functions shared by the API and the tests.
import crypto from 'node:crypto';

export const EDU_FORMS={
  kunduzgi:{label:'Kunduzgi',icon:'☀️',hint:'Kunduzgi ta’lim: auditoriyada, 1–2-smena'},
  kechki:{label:'Kechki',icon:'🌙',hint:'Kechki ta’lim: ishlaydigan talabalar uchun kechki paralar'},
  sirtqi:{label:'Sirtqi',icon:'📮',hint:'Sirtqi ta’lim: darslar sessiya davrida'},
  masofaviy:{label:'Masofaviy',icon:'🌐',hint:'Masofaviy ta’lim: jonli onlayn darslar va videodarslar'}
};
export const FORM_KEYS=Object.keys(EDU_FORMS);
export const LESSON_MODES={offline:'Auditoriyada',online:'Onlayn',hybrid:'Gibrid'};
export const SHIFTS={1:'1-smena',2:'2-smena',3:'Kechki smena'};
export const LANGUAGES={uz:'O‘zbek',ru:'Rus',en:'Ingliz',qq:'Qoraqalpoq'};
export const DEGREES={bakalavr:'Bakalavr',magistr:'Magistr'};

const D=[['08:30','09:50'],['10:00','11:20'],['11:30','12:50'],['13:30','14:50'],['15:00','16:20'],['16:30','17:50']];
export const DEFAULT_BELLS={kunduzgi:D,kechki:[['17:00','18:20'],['18:30','19:50'],['20:00','21:20']],sirtqi:D.slice(0,5),masofaviy:D};

export const cleanForm=v=>EDU_FORMS[v]?v:'kunduzgi';
export const formOf=group=>EDU_FORMS[group?.educationForm]?group.educationForm:'kunduzgi';
export const defaultModeFor=form=>form==='masofaviy'?'online':'offline';
// Lessons created before modes existed are online when live rooms are enabled (previous behaviour).
export const lessonMode=lesson=>LESSON_MODES[lesson?.mode]?lesson.mode:(lesson?.liveEnabled===false?'offline':'online');
export const modeIsLive=mode=>mode==='online'||mode==='hybrid';
export const modeIsPhysical=mode=>mode==='offline'||mode==='hybrid';

const HM=/^([01]\d|2[0-3]):[0-5]\d$/;
export function validateBells(input){
  const out={};
  for(const form of FORM_KEYS){
    const list=Array.isArray(input?.[form])?input[form]:DEFAULT_BELLS[form];
    if(list.length<1||list.length>10)throw new Error(EDU_FORMS[form].label+': 1–10 ta para bo‘lishi kerak');
    const pairs=list.map((p,i)=>{const start=String(Array.isArray(p)?p[0]:p?.start||'').trim(),end=String(Array.isArray(p)?p[1]:p?.end||'').trim();if(!HM.test(start)||!HM.test(end)||start>=end)throw new Error(EDU_FORMS[form].label+': '+(i+1)+'-para vaqti noto‘g‘ri');return [start,end]});
    for(let i=1;i<pairs.length;i++)if(pairs[i][0]<pairs[i-1][1])throw new Error(EDU_FORMS[form].label+': '+(i+1)+'-para oldingisi bilan ustma-ust tushadi');
    out[form]=pairs;
  }
  return out;
}
export function paraFor(bells,form,start){const list=bells?.[form]||DEFAULT_BELLS[form]||D;const i=list.findIndex(p=>p[0]===start);return i>=0?i+1:0}

const DAY=/^\d{4}-\d{2}-\d{2}$/;
export function cleanSessions(list){
  if(!Array.isArray(list))return [];
  if(list.length>12)throw new Error('Ko‘pi bilan 12 ta sessiya');
  return list.map((s,i)=>{const name=String(s?.name||'').trim().slice(0,80)||((i+1)+'-sessiya'),from=String(s?.from||''),to=String(s?.to||'');if(!DAY.test(from)||!DAY.test(to)||Number.isNaN(Date.parse(from))||Number.isNaN(Date.parse(to)))throw new Error('«'+name+'» sanalarini kiriting');if(from>to)throw new Error('«'+name+'» tugash sanasi boshlanishidan oldin');return {name,from,to}}).sort((a,b)=>a.from.localeCompare(b.from));
}
export const inSession=(sessions,dateKey)=>!sessions?.length||sessions.some(s=>dateKey>=s.from&&dateKey<=s.to);
// A correspondence (sirtqi) group with sessions defined only has lessons during a session.
export const sessionBlocked=(group,dateKey)=>formOf(group)==='sirtqi'&&Array.isArray(group?.sessions)&&group.sessions.length>0&&!inSession(group.sessions,dateKey);
export function sessionStatus(sessions,dateKey){
  const now=(sessions||[]).find(s=>dateKey>=s.from&&dateKey<=s.to);if(now)return {state:'active',session:now};
  const next=(sessions||[]).find(s=>s.from>dateKey);return next?{state:'upcoming',session:next}:{state:'none',session:null};
}

// Rotating classroom check-in code: 6 digits, changes every CHECKIN_SLOT_MS. Shown on the teacher's screen / projector.
export const CHECKIN_SLOT_MS=20000;
export function checkinCode(secret,slot){const h=crypto.createHmac('sha256',String(secret)).update(String(slot)).digest();return String(h.readUInt32BE(0)%1000000).padStart(6,'0')}
export const slotAt=ms=>Math.floor(ms/CHECKIN_SLOT_MS);
export function verifyCheckin(secret,code,nowMs){
  const c=String(code||'').replace(/\D/g,'');if(c.length!==6)return false;const s=slotAt(nowMs);
  return [s,s-1].some(x=>crypto.timingSafeEqual(Buffer.from(checkinCode(secret,x)),Buffer.from(c))); // current + previous slot (scan/typing delay)
}
export function checkinStatus(lessonStart,nowMinute,lateAfterMinutes){
  const [h,m]=String(lessonStart||'00:00').split(':').map(Number);return nowMinute>h*60+m+Math.max(0,Number(lateAfterMinutes)||0)?'late':'present';
}
export const attendanceRate=(attended,expected)=>expected>0?Math.min(100,Math.round(attended/expected*100)):null;
