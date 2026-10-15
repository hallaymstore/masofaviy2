// HALLAYM EDU — university units (bo'limlar): pure rules shared by the API and the tests.
// No database access here: kinds, unit roles and what each role may do, request status flow, service-form validation.

export const UNIT_KINDS={
  leadership:'Rahbariyat',
  faculty:'Fakultet',
  kafedra:'Kafedra',
  division:'Bo‘lim va boshqarma',
  center:'Markaz',
  service:'Xizmat'
};
export const UNIT_KIND_ORDER=['leadership','faculty','kafedra','division','center','service'];

// Building blocks every unit can switch on for itself — no external tools needed for day-to-day work.
export const UNIT_MODULES=[
  {key:'announcements',label:'E’lonlar',icon:'📣',hint:'Yangiliklar va buyruqlar, «o‘qidim» tasdig‘i bilan'},
  {key:'services',label:'Xizmatlar va arizalar',icon:'📝',hint:'Onlayn ariza shakllari, holat va muddat nazorati'},
  {key:'documents',label:'Hujjatlar',icon:'📁',hint:'Nizom, buyruq, namuna va hisobotlar'},
  {key:'tasks',label:'Vazifalar',icon:'✅',hint:'Bo‘lim ichki vazifalar taxtasi'},
  {key:'events',label:'Tadbirlar',icon:'📅',hint:'Tadbirlar kalendari va ro‘yxatdan o‘tish'},
  {key:'apps',label:'Ilovalar',icon:'🧩',hint:'Bo‘lim ishlatadigan tashqi tizimlar bir joyda'},
  {key:'staff',label:'Xodimlar',icon:'👥',hint:'Lavozimlar va aloqa'},
  {key:'learning',label:'Masofaviy ta’lim',icon:'🎓',hint:'Guruhlar, darslar va o‘qituvchilar'}
];
export const MODULE_KEYS=UNIT_MODULES.map(m=>m.key);
export function defaultModules(kind){
  if(kind==='faculty'||kind==='kafedra')return ['announcements','services','documents','tasks','events','staff','learning'];
  if(kind==='leadership')return ['announcements','documents','tasks','events','staff'];
  return ['announcements','services','documents','tasks','events','apps','staff'];
}
export function cleanModules(list,kind){
  const set=new Set((Array.isArray(list)?list:[]).map(String).filter(k=>MODULE_KEYS.includes(k)));
  return set.size?MODULE_KEYS.filter(k=>set.has(k)):defaultModules(kind);
}

export const UNIT_ROLES={head:'Rahbar',deputy:'O‘rinbosar',staff:'Xodim',viewer:'Kuzatuvchi'};
const RANK={viewer:1,staff:2,deputy:3,head:4,admin:5};
const NEEDS={
  view_internal:'viewer',      // internal requests, tasks, member-only posts and documents
  process_requests:'staff',    // take, answer, close requests
  manage_content:'staff',      // posts, documents, events, tasks
  manage_unit:'deputy',        // name, contacts, modules, apps, services
  manage_members:'deputy',     // add/remove staff and viewers (heads are set by administrators)
  admin:'admin'                // create/delete units, appoint heads
};
export function unitCan(role,action){const need=NEEDS[action];if(!need)return false;return (RANK[role]||0)>=RANK[need]}
export const higherRole=(a,b)=>((RANK[a]||0)>=(RANK[b]||0)?a:b);

// Effective role of a user inside a unit: administrators everywhere, explicit membership, and the academic
// hierarchy that already exists (dean → own faculty, kafedra head → own kafedra, teacher → staff of own kafedra).
export function effectiveUnitRole({user,unit,membership=null,permissions=[]}){
  if(!user||!unit)return null;
  if(user.role==='superadmin'||user.role==='admin'||permissions.includes('*')||permissions.includes('units.manage'))return 'admin';
  let role=membership&&membership.active!==false&&UNIT_ROLES[membership.role]?membership.role:null;
  const sid=String(unit.structureId||''),same=v=>Boolean(sid)&&String(v?._id||v||'')===sid;
  let implicit=null;
  if(unit.kind==='faculty'&&user.role==='dean'&&same(user.facultyId))implicit='head';
  else if(unit.kind==='kafedra'&&user.role==='department'&&same(user.departmentId))implicit='head';
  else if(unit.kind==='kafedra'&&user.role==='teacher'&&same(user.departmentId))implicit='staff';
  else if(unit.kind==='faculty'&&user.role==='tutor'&&same(user.facultyId))implicit='staff';
  else if(user.role==='rectorate')implicit='viewer';
  if(implicit)role=role?higherRole(role,implicit):implicit;
  return role;
}

// Audience check for content that a unit publishes to the whole university.
export function audienceAllows(audience,{user,unitRole}){
  if(unitRole&&unitCan(unitRole,'view_internal'))return true;
  if(!audience||audience==='public')return true;
  if(audience==='students')return user?.role==='student';
  if(audience==='staff')return user?.role!=='student';
  return false; // 'members'
}

export const REQUEST_STATUSES={new:'Yangi',in_progress:'Ko‘rib chiqilmoqda',waiting:'Ma’lumot kutilmoqda',done:'Bajarildi',rejected:'Rad etildi',cancelled:'Bekor qilindi'};
const STAFF_FLOW={new:['in_progress','waiting','done','rejected'],in_progress:['waiting','done','rejected'],waiting:['in_progress','done','rejected'],done:['in_progress'],rejected:['in_progress'],cancelled:[]};
const REQUESTER_FLOW={new:['cancelled'],waiting:['cancelled','in_progress']};
export function canTransition(from,to,actor){
  if(from===to)return false;
  const flow=actor==='staff'?STAFF_FLOW:REQUESTER_FLOW;
  return Boolean(flow[from]?.includes(to));
}
export const OPEN_STATUSES=['new','in_progress','waiting'];

export const FIELD_TYPES={text:'Qisqa matn',textarea:'Uzun matn',number:'Son',date:'Sana',select:'Tanlov',phone:'Telefon'};
export function slugKey(label,i){
  const map={'o‘':'o','o\'':'o','oʻ':'o','g‘':'g','g\'':'g','gʻ':'g','sh':'sh','ch':'ch'};
  let s=String(label||'').toLowerCase();for(const [k,v] of Object.entries(map))s=s.split(k).join(v);
  s=s.normalize('NFKD').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,28);
  return s||('f'+(i+1));
}
export function validateServiceFields(fields){
  if(!Array.isArray(fields))throw new Error('Ariza maydonlari ro‘yxat bo‘lishi kerak');
  if(fields.length>20)throw new Error('Arizada ko‘pi bilan 20 ta maydon bo‘ladi');
  const used=new Set();
  return fields.map((f,i)=>{
    const label=String(f?.label||'').trim().slice(0,120);if(label.length<2)throw new Error((i+1)+'-maydon nomini kiriting');
    const type=FIELD_TYPES[f?.type]?f.type:'text';
    let key=String(f?.key||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,32)||slugKey(label,i);
    while(used.has(key))key=key.slice(0,28)+'_'+(i+1);used.add(key);
    const options=type==='select'?(Array.isArray(f.options)?f.options:String(f.options||'').split(/[\n,;]/)).map(x=>String(x).trim().slice(0,80)).filter(Boolean).slice(0,20):[];
    if(type==='select'&&options.length<2)throw new Error('«'+label+'» tanlovida kamida 2 ta variant bo‘lsin');
    return {key,label,type,required:Boolean(f?.required),options};
  });
}
export function validateAnswers(fields,answers){
  const src=answers&&typeof answers==='object'?answers:{},out={};
  for(const f of fields||[]){
    let v=src[f.key];v=v===undefined||v===null?'':String(v).trim();
    if(!v){if(f.required)throw new Error('«'+f.label+'» maydonini to‘ldiring');continue}
    if(f.type==='number'){const n=Number(v.replace(',','.'));if(!Number.isFinite(n))throw new Error('«'+f.label+'» son bo‘lishi kerak');v=String(n)}
    else if(f.type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v)))throw new Error('«'+f.label+'» sanasi noto‘g‘ri')}
    else if(f.type==='select'){if(!f.options.includes(v))throw new Error('«'+f.label+'» uchun ro‘yxatdagi variantni tanlang')}
    else if(f.type==='phone'){if(!/^[+0-9 ()-]{7,20}$/.test(v))throw new Error('«'+f.label+'» telefon raqami noto‘g‘ri')}
    out[f.key]=v.slice(0,f.type==='textarea'?4000:500);
  }
  return out;
}
export function requestNumber(code,year,seq){return String(code||'B').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)+'-'+year+'-'+String(seq).padStart(4,'0')}
export function dueDate(from,slaDays){
  const days=Math.max(0,Math.min(90,Number(slaDays)||0));if(!days)return null;
  const d=new Date(from);let left=days;while(left>0){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)left--} // working days
  return d;
}
export function safeAppUrl(value){
  const s=String(value||'').trim();if(!s)return '';
  try{const u=new URL(s);if(u.protocol!=='https:'&&u.protocol!=='http:')return '';return u.toString()}catch{return ''}
}
