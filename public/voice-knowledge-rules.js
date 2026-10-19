// HALLAYM EDU — what the voice assistant can be ASKED (not only told): schedule for any day, current live lesson,
// assignments and deadlines, and "find X anywhere and open it". Pure functions: parsing Uzbek/Russian questions and
// turning platform data into short spoken Uzbek answers. Used by voice-knowledge.js and the tests.
import {canonical} from './voice-commands.js';
import {contentTokens} from './voice-context-rules.js';

const DAYS=['yakshanba','dushanba','seshanba','chorshanba','payshanba','juma','shanba'];
const MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
const DAY_WORDS=[[/\bdushanba/,1],[/\bseshanba/,2],[/\bchorshanba/,3],[/\bpayshanba/,4],[/\bjuma/,5],[/\bshanba/,6],[/\byakshanba/,7],
  [/\bponedelnik/,1],[/\bvtornik/,2],[/\bsreda/,3],[/\bchetverg/,4],[/\bpyatnits/,5],[/\bsubbot/,6],[/\bvoskresen/,7]];
// Day offset relative to today, or {weekday} for a named day, or 'week'.
export function parseDay(text){
  const t=canonical(text);
  if(/\b(indin|indinga|ertadan keyin|poslezavtra)\b/.test(t))return {offset:2};
  if(/\b(ertaga|ertangi|ertanga|zavtra)\b/.test(t))return {offset:1};
  if(/\b(kecha|kechagi|vchera)\b/.test(t))return {offset:-1};
  if(/\b(hafta|haftalik|nedel)/.test(t))return {week:true};
  for(const [rx,n] of DAY_WORDS)if(rx.test(t))return {weekday:n};
  return {offset:0};
}
// 1 = Monday … 7 = Sunday (same as the server's localWeekday).
export const isoWeekday=date=>date.getDay()||7;
export function resolveDate(day,now=new Date()){
  const d=new Date(now);
  if(day.weekday){const diff=(day.weekday-isoWeekday(d)+7)%7;d.setDate(d.getDate()+diff)}else d.setDate(d.getDate()+(day.offset||0));
  return d;
}
export const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export function dayName(date,now=new Date()){
  const diff=Math.round((new Date(dateKey(date))-new Date(dateKey(now)))/864e5);
  const base=DAYS[date.getDay()]+', '+date.getDate()+'-'+MONTHS[date.getMonth()];
  return diff===0?'Bugun, '+base:diff===1?'Ertaga, '+base:diff===2?'Indinga, '+base:diff===-1?'Kecha, '+base:base;
}

// What kind of question is this? null when it is not a question the knowledge module answers.
export function parseQuestion(raw){
  const t=canonical(raw);if(!t)return null;
  // Short questions people actually ask (any word order, dialect forms come normalised by canonical()).
  if(/\b(keyingi|navbatdagi|keyin qaysi|sledu)\b.*\b(dars|para|urok)|\b(dars|para)\b.*\b(qachon|soat nechada)\b/.test(t))return {topic:'nextLesson'};
  if(/\b(baho|bahol|bahom|bahoyim|ball|ballar|ballarim|otsenk|reyting|natija|natijalar|natijam)/.test(t)&&!/\b(och|korsat|sahifa)\b/.test(t))return {topic:'grades',subject:(t.match(/([a-z]{4,})dan(?:\s|$)/)||[])[1]||''};
  if(/\b(xabar|xabarlar|xat|pochta|soobshen)\b.*\b(bormi|keldimi|nechta|yangi|oqilmagan)\b|\b(yangi|oqilmagan)\b.*\b(xabar|xat)/.test(t))return {topic:'messages'};
  if(/\b(men kimman|kim bilan gaplashyapman|mening guruhim|qaysi guruhdaman|profilim haqida)\b/.test(t))return {topic:'whoami'};
  const openVerb=/\b(och|ochib|ochgin|oching|kir|kirgin|kiring|ulan|ulanib|qoshil|qoshilib|olib bor|otkaz|voyti|otkroy)\b/.test(t);
  if(/\b(hozirgi|joriy|jonli|boshlangan|ketayotgan|ketyapgan|davom etayotgan|aktiv|faol|tekushch|seychas)\b/.test(t)&&/\b(dars|darsni|darsga|urok)/.test(t))
    return {topic:'live',action:openVerb?'open':'ask'};
  if(/\b(hozir|hozirda)\b.*\bdars\b.*\b(bormi|bor mi|qaysi|ketyapti)\b|\bqaysi dars ketyapti\b/.test(t))return {topic:'live',action:'ask'};
  if(/\b(topshiriq|topshiriql|vazifa|uy ishi|uyga vazifa|deadline|dedlayn|muddati|zadani)/.test(t)&&!/\b(yukla|topshir(?:ish)?ni boshla)\b/.test(t)){
    const when=/\b(muddati otgan|kechikkan|otib ketgan|prosroch)/.test(t)?'overdue':/\b(bugun|bugungi)\b/.test(t)?'today':/\b(ertaga|ertangi)\b/.test(t)?'tomorrow':/\b(hafta|haftalik)/.test(t)?'week':'open';
    return {topic:'assignments',when};
  }
  if(/\b(jadval|jadvali|jadvalda|jadvalim|raspisan)/.test(t)||/\b(nechta|qanday|qaysi|qanaqa)\b.*\b(dars|para)/.test(t)||/\b(dars|darslar|para|paralar)\b.*\b(bormi|bor mi|qanaqa|qanday|qachon|nechta)\b/.test(t)||/\b(ertaga|ertangi|indin|dushanba|seshanba|chorshanba|payshanba|juma|shanba)\b.*\bdars/.test(t)){
    if(/^(?:dars jadvali|jadval|jadvalim|jadvalni och|jadval och|dars jadvalini och)$/.test(t))return null; // bare page name → normal navigation
    return {topic:'schedule',day:parseDay(t)};
  }
  return null;
}

const KIND_WORDS=[[/\b(kitob|kitobi|kitobni|kitobini|kitobga|asar|asarini|kniga|knigu)/,'library'],[/\b(video|videosi|videosini|videodars|rolik)/,'video'],
  [/\b(fan|fani|fanini|faniga|kurs|kursi|kursini|predmet)/,'course'],[/\b(topshiriq|vazifa)/,'assignment'],[/\b(test|testi|testini|quiz)/,'quiz'],
  [/\b(material|resurs|fayl|hujjat|taqdimot|maruza|maruzasi)/,'resource']];
// «Amir Temur kitobini och», «Javascript videosini qo‘y», «oliy matematika fanini och» → {kind, query}.
export function parseFind(raw){
  const t=canonical(raw);if(!t)return null;
  if(!/\b(och|ochib|ochgin|oching|top|topib|topgin|izla|qidir|kir|tingla|oqi|oqib|qoy|qoyib|korsat|kor|boshla|otkroy|nayd|vklyuch)/.test(t))return null;
  let kind='all';for(const [rx,k] of KIND_WORDS)if(rx.test(t)){kind=k;break}
  const query=contentTokens(t).filter(w=>!/^(ni|ga|da|dan|va|ham|top|izla|qidir|qoy|qoyib|topib|topgin|izlab|qidirib|kitob|kitobi|kitobini|video|videosi|videosini|fan|fanini|kurs|test|material|resurs|fayl|asar|asarini)$/.test(w)).join(' ').trim();
  if(query.length<3)return null;
  return {kind,query,listen:/\b(tingla|oqi|oqib|eshit)/.test(t)};
}

// Platform data → spoken answers.
const clock=v=>String(v||'').slice(0,5);
const MODE={offline:'auditoriyada',online:'onlayn',hybrid:'gibrid'};
export function lessonsForDate(rows,date){
  const wd=isoWeekday(date),key=dateKey(date);
  return (rows||[]).filter(r=>r&&r.kind!=='final_exam'&&(r.date?r.date===key:Number(r.weekday)===wd)).sort((a,b)=>clock(a.start).localeCompare(clock(b.start)));
}
export function describeSchedule(rows,date,now=new Date()){
  const list=lessonsForDate(rows,date),head=dayName(date,now);
  if(!list.length)return head+' dars yo‘q.';
  return head+' '+list.length+' ta dars. '+list.map((r,i)=>(i+1)+'. soat '+clock(r.start)+' dan '+clock(r.end)+' gacha — '+(r.title||r.subject||'Dars')+
    (r.teacherId?.fullName?', o‘qituvchi '+r.teacherId.fullName:'')+(r.room?', '+r.room+'-xona':'')+(MODE[r.mode]?', '+MODE[r.mode]:'')).join('. ')+'.';
}
export function describeWeek(rows,now=new Date()){
  const parts=[];for(let i=0;i<7;i++){const d=new Date(now);d.setDate(d.getDate()+i);const n=lessonsForDate(rows,d).length;if(n)parts.push(DAYS[d.getDay()]+' '+n+' ta')}
  return parts.length?'Shu haftada darslar: '+parts.join(', ')+'. Bir kunni batafsil eshitish uchun, masalan, «ertangi jadval» deng.':'Yaqin 7 kunda dars yo‘q.';
}
// assignments: [{title, course, dueAt, submitted}]
export function describeAssignments(list,when='open',now=new Date()){
  const startOf=d=>new Date(dateKey(d)).getTime(),today=startOf(now);
  let rows=(list||[]).filter(a=>!a.submitted);
  const due=a=>a.dueAt?new Date(a.dueAt).getTime():null;
  if(when==='overdue')rows=rows.filter(a=>due(a)!==null&&due(a)<now.getTime());
  else if(when==='today')rows=rows.filter(a=>due(a)!==null&&startOf(new Date(due(a)))===today);
  else if(when==='tomorrow')rows=rows.filter(a=>due(a)!==null&&startOf(new Date(due(a)))===today+864e5);
  else if(when==='week')rows=rows.filter(a=>due(a)!==null&&due(a)>=now.getTime()&&due(a)<today+8*864e5);
  else rows=rows.filter(a=>due(a)===null||due(a)>=now.getTime());
  rows.sort((a,b)=>(due(a)??9e15)-(due(b)??9e15));
  const label={overdue:'Muddati o‘tgan',today:'Bugun topshiriladigan',tomorrow:'Ertaga topshiriladigan',week:'Shu hafta topshiriladigan',open:'Bajarilmagan'}[when];
  if(!rows.length)return label+' topshiriq yo‘q.';
  return label+' topshiriqlar: '+rows.length+' ta. '+rows.slice(0,8).map((a,i)=>{const d=due(a);return (i+1)+'. '+a.title+(a.course?', '+a.course+' fanidan':'')+(d?', muddati '+dayName(new Date(d),now).toLowerCase()+' soat '+String(new Date(d).getHours()).padStart(2,'0')+':'+String(new Date(d).getMinutes()).padStart(2,'0'):', muddatsiz')}).join('. ')+(rows.length>8?'. Qolganlari «Fanlar va vazifalar» sahifasida.':'.');
}
export function describeLive(rooms){
  const active=(rooms||[]).filter(r=>r.session?.status==='active');
  if(!active.length){
    const next=(rooms||[]).filter(r=>r.session?.status!=='ended').map(r=>r.schedule).filter(Boolean).sort((a,b)=>clock(a.start).localeCompare(clock(b.start)))[0];
    return {room:null,text:'Hozir jonli dars yo‘q.'+(next?' Keyingi dars soat '+clock(next.start)+' da: '+(next.title||next.subject||'dars')+'.':' Bugun boshqa jonli dars yo‘q.')};
  }
  const r=active.find(x=>x.canJoin)||active[0];
  return {room:r,text:'Hozir '+(r.schedule?.title||r.schedule?.subject||'dars')+' ketyapti, soat '+clock(r.schedule?.end)+' gacha.'};
}

// Next lesson from now (today later, or the coming days).
export function describeNext(rows,now=new Date()){
  for(let i=0;i<8;i++){const d=new Date(now);d.setDate(d.getDate()+i);const nowHm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    const list=lessonsForDate(rows,d).filter(r=>i>0||String(r.end).slice(0,5)>nowHm);
    if(list.length){const r=list[0];const live=i===0&&String(r.start).slice(0,5)<=nowHm;
      return (live?'Hozir ':dayName(d,now)+' soat '+String(r.start).slice(0,5)+' da ')+(r.title||r.subject||'dars')+(live?' ketyapti, soat '+String(r.end).slice(0,5)+' gacha':'')+(r.teacherId?.fullName?', o‘qituvchi '+r.teacherId.fullName:'')+(r.room?', '+r.room+'-xona':'')+'.'}}
  return 'Yaqin bir hafta ichida dars yo‘q.';
}
// Grades: average and the latest marks (optionally of one subject).
export function describeGrades(book,subject=''){
  let rows=(book?.rows||[]).filter(r=>r.status==='graded');
  const want=canonical(subject||'').slice(0,6);if(want.length>=4){const f=rows.filter(r=>canonical(r.courseTitle).includes(want));if(f.length)rows=f}
  if(!rows.length)return 'Hozircha baholangan ishingiz yo‘q.'+(book?.stats?.pending?' Tekshirilishi kutilayotgan ishlar: '+book.stats.pending+' ta.':'');
  const avg=Math.round(rows.reduce((t,r)=>t+(Number(r.percent)||0),0)/rows.length);
  return 'O‘rtacha natijangiz '+avg+' foiz, '+rows.length+' ta baho. Oxirgilari: '+rows.slice(0,4).map(r=>r.courseTitle+', '+r.assignmentTitle+' — '+r.score+' dan '+r.scale).join('. ')+'.'+(book?.stats?.pending?' Yana '+book.stats.pending+' ta ish tekshirilmoqda.':'');
}
export function describeMessages(rows){
  const unread=(rows||[]).filter(m=>!m.readAt);
  if(!unread.length)return 'Yangi xabar yo‘q.';
  return unread.length+' ta o‘qilmagan xabar. '+unread.slice(0,3).map(m=>(m.senderId?.fullName||'Kimdir')+'dan: '+(m.subject||'mavzusiz')).join('. ')+'. O‘qish uchun «xabarlar» deng.';
}

// Ranking search hits by how many spoken words they contain.
export function hitScore(query,hit){
  const words=String(query).split(/\s+/).filter(Boolean),hay=canonical((hit.title||'')+' '+(hit.subtitle||''));
  if(!words.length)return 0;
  const found=words.filter(w=>hay.includes(w.slice(0,Math.max(4,w.length-2)))).length;
  const inTitle=words.filter(w=>canonical(hit.title||'').includes(w.slice(0,Math.max(4,w.length-2)))).length;
  return found/words.length+inTitle/words.length*.5;
}
