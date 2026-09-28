import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';

if(!process.env.MONGODB_URI) throw new Error('MONGODB_URI topilmadi');
await mongoose.connect(process.env.MONGODB_URI);
const db=mongoose.connection.db, now=new Date();
const C={
 users:db.collection('users'), structures:db.collection('structures'), courses:db.collection('courses'),
 resources:db.collection('resources'), assignments:db.collection('assignments'), quizzes:db.collection('quizzes'),
 curricula:db.collection('curriculumplans'), schedules:db.collection('schedules'), library:db.collection('libraryitems'),
 videos:db.collection('videolessons')
};
const admin=await C.users.findOne({role:'superadmin',active:true})||await C.users.findOne({role:'admin',active:true});
if(!admin) throw new Error('Seed uchun faol administrator topilmadi');

const programs=[
 {key:'AT',group:'QDTU-MT-2026-AT-01',direction:'Axborot tizimlari va texnologiyalari',courses:[['AT101','Axborot tizimlariga kirish',4],['AT102','Dasturlash asoslari',5],['AT103','Oliy matematika',5],['AT104','Kompyuter tarmoqlari',4]]},
 {key:'DI',group:'QDTU-MT-2026-DI-01',direction:'Dasturiy injiniring',courses:[['DI101','Dasturlash asoslari',5],['DI102','Algoritmlar va ma’lumotlar tuzilmasi',5],['DI103','Web dasturlash asoslari',4],['DI104','Oliy matematika',5]]},
 {key:'KI',group:'QDTU-MT-2026-KI-01',direction:'Kompyuter injiniringi',courses:[['KI101','Kompyuter arxitekturasi',5],['KI102','Dasturlash asoslari',5],['KI103','Kompyuter tarmoqlari',4],['KI104','Oliy matematika',5]]},
 {key:'SI',group:'QDTU-MT-2026-SI-01',direction:'Sun’iy intellekt',courses:[['SI101','Sun’iy intellektga kirish',4],['SI102','Python dasturlash',5],['SI103','Ma’lumotlar tahlili',4],['SI104','Oliy matematika',5]]},
 {key:'BI',group:'QDTU-MT-2026-BI-01',direction:'Bank ishi',courses:[['BI101','Bank ishiga kirish',4],['BI102','Pul va banklar',4],['BI103','Moliya asoslari',5],['BI104','Statistika asoslari',4]]},
 {key:'BH',group:'QDTU-MT-2026-BH-01',direction:'Buxgalteriya hisobi',courses:[['BH101','Buxgalteriya hisobi asoslari',5],['BH102','Moliyaviy hisob',5],['BH103','Iqtisodiyot nazariyasi',4],['BH104','Statistika asoslari',4]]},
 {key:'IQ',group:'QDTU-MT-2026-IQ-01',direction:'Iqtisodiyot',courses:[['IQ101','Iqtisodiyot nazariyasi',5],['IQ102','Mikroiqtisodiyot',5],['IQ103','Makroiqtisodiyot',5],['IQ104','Statistika asoslari',4]]},
 {key:'LOG',group:'QDTU-MT-2026-LOG-01',direction:'Logistika',courses:[['LG101','Logistika asoslari',5],['LG102','Ta’minot zanjirini boshqarish',5],['LG103','Iqtisodiyot nazariyasi',4],['LG104','Statistika asoslari',4]]},
 {key:'MEN',group:'QDTU-MT-2026-MEN-01',direction:'Menejment',courses:[['MN101','Menejment asoslari',5],['MN102','Marketing asoslari',4],['MN103','Biznes moliyasiga kirish',5],['MN104','Statistika asoslari',4]]},
 {key:'MMT',group:'QDTU-MT-2026-MMT-01',direction:'Moliya va moliyaviy texnologiyalar',courses:[['MF101','Moliya asoslari',5],['MF102','Biznes moliyasi',5],['MF103','Moliyaviy texnologiyalar',4],['MF104','Statistika nazariyasiga kirish',4]]},
 {key:'SST',group:'QDTU-MT-2026-SST-01',direction:'Soliqlar va soliqqa tortish',courses:[['ST101','Soliqlar va soliqqa tortish asoslari',5],['ST102','Buxgalteriya hisobi',4],['ST103','Moliya asoslari',5],['ST104','Statistika asoslari',4]]},
 {key:'STAT',group:'QDTU-MT-2026-STAT-01',direction:'Statistika',courses:[['SA101','Statistika nazariyasiga kirish',5],['SA102','Iqtisodiy statistika',5],['SA103','Ehtimollar nazariyasi',5],['SA104','Ma’lumotlar tahlili',4]]}
];

let saved={};
const credPath='/home/hallaym/masofaviy2/.presentation-accounts.json';
try{saved=JSON.parse(fs.readFileSync(credPath,'utf8'))}catch{}
const credentials={...saved};
const randomPassword=()=>crypto.randomBytes(15).toString('base64url')+'!';

async function ensureUser({externalId,login,fullName,role,group,direction}){
  let u=await C.users.findOne({externalId});
  if(u)return u;
  const password=randomPassword(),hash=await bcrypt.hash(password,11);
  let facultyId,departmentId;
  if(group?.parentId){
    const dep=await C.structures.findOne({_id:group.parentId});
    departmentId=dep?._id;
    if(dep?.parentId)facultyId=(await C.structures.findOne({_id:dep.parentId}))?._id;
  }
  const doc={externalId,login,fullName,role,passwordHash:hash,active:true,mustChangePassword:false,sessionVersion:0,
    citizenshipCountry:'UZ',direction,courseYear:role==='student'?1:undefined,groupId:group?._id,group:group?.externalId||'',
    departmentId,facultyId,statusNote:'PRESENTATION DATA — rasmiy kadr/talaba yozuvi emas',createdAt:now,updatedAt:now};
  const r=await C.users.insertOne(doc);u={...doc,_id:r.insertedId};credentials[login]=password;return u;
}

let teacherCount=0,studentCount=0,courseCount=0,scheduleCount=0,curriculumCount=0;
for(let i=0;i<programs.length;i++){
  const p=programs[i],group=await C.structures.findOne({type:'group',externalId:p.group,active:true});
  if(!group)throw new Error('Guruh topilmadi: '+p.group);
  const n=String(i+1).padStart(2,'0');
  const teacher=await ensureUser({externalId:'PRES-T-'+p.key,login:'pres.teacher'+n,fullName:'Taqdimot o‘qituvchisi '+n,role:'teacher',direction:p.direction});
  teacherCount++;
  for(let s=1;s<=2;s++){await ensureUser({externalId:'PRES-S-'+p.key+'-'+s,login:'pres.student'+n+s,fullName:'Taqdimot talabasi '+n+'-'+s,role:'student',group,direction:p.direction});studentCount++}

  const subjects=[];
  for(let ci=0;ci<p.courses.length;ci++){
    const [short,title,credits]=p.courses[ci],code='PRES-'+short;
    let course=await C.courses.findOne({code,groupId:group._id});
    const set={code,title:'[NAMUNA] '+title,language:'O‘zbekcha',credits,teacherId:teacher._id,groupId:group._id,active:true,updatedAt:now};
    if(course){await C.courses.updateOne({_id:course._id},{$set:set});course={...course,...set}}
    else{const x=await C.courses.insertOne({...set,createdAt:now});course={...set,_id:x.insertedId};courseCount++}

    await C.resources.updateOne({courseId:course._id,title:'[NAMUNA] Fan materiallari katalogi'},{$set:{courseId:course._id,title:'[NAMUNA] Fan materiallari katalogi',kind:'link',url:'https://moodle.kstu.uz/',description:'Taqdimot uchun namunaviy o‘quv resurs havolasi. Rasmiy fan materiali yuklanganda almashtiriladi.',published:true,createdBy:admin._id,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});
    await C.assignments.updateOne({courseId:course._id,title:'[NAMUNA] 1-mustaqil topshiriq'},{$set:{courseId:course._id,title:'[NAMUNA] 1-mustaqil topshiriq',category:'independent_work',instructions:'Fan bo‘yicha 1-mavzu asosida qisqa tahliliy javob tayyorlang. Bu taqdimot namunasi; real fan topshirig‘i o‘qituvchi tomonidan almashtiriladi.',maxScore:100,published:true,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});
    await C.quizzes.updateOne({courseId:course._id,title:'[NAMUNA] Kirish nazorati'},{$set:{courseId:course._id,title:'[NAMUNA] Kirish nazorati',durationMinutes:10,maxAttempts:2,published:true,proctorRequired:false,questions:[
      {prompt:'Masofaviy darsga kirishda qaysi qurilmalarni oldindan tekshirish tavsiya etiladi?',options:['Kamera va mikrofon','Faqat printer','Faqat fleshka'],correctIndex:0},
      {prompt:'Dars jadvali va guruh xonasi qayerdan ochiladi?',options:['Platformadagi shaxsiy jadvaldan','Tasodifiy havoladan','Faqat emaildan'],correctIndex:0}
    ],updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});
    subjects.push({semester:1,code,title:'[NAMUNA] '+title,credits,language:'O‘zbekcha',syllabusUrl:'',practiceRequired:ci===1});
  }

  const programCode='PRES-'+p.key+'-2026';
  const cur=await C.curricula.updateOne({programCode,academicYear:'2026-2027',language:'O‘zbekcha'},{$set:{name:'[NAMUNA] '+p.direction+' — 2026/2027',programCode,direction:p.direction,academicYear:'2026-2027',language:'O‘zbekcha',approvedDocumentNo:'TAQDIMOT-NAMUNA',groupIds:[group._id],subjects,active:true,createdBy:admin._id,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});
  if(cur.upsertedCount)curriculumCount++;

  const slots=[
    [1,'18:00','19:20','lecture',p.courses[0][1]],
    [2,'18:00','19:20','lecture',p.courses[1][1]],
    [3,'18:00','19:20','practice',p.courses[2][1]],
    [4,'18:00','19:20','seminar',p.courses[3][1]]
  ];
  for(const [weekday,start,end,kind,subject] of slots){
    const title='[NAMUNA] '+subject;
    const r=await C.schedules.updateOne({groupId:group._id,teacherId:teacher._id,weekday,start,title},{$set:{title,subject,groupId:group._id,teacherId:teacher._id,weekday,start,end,room:'ONLINE-'+p.key,kind,recurring:true,liveEnabled:true,maxParticipants:51,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});
    if(r.upsertedCount)scheduleCount++;
  }
}

const libraryRows=[
 {type:'other',title:'Qarshi davlat texnika universiteti — rasmiy veb-sayt',authors:['Qarshi davlat texnika universiteti'],language:'O‘zbekcha',description:'Universitetning rasmiy yangiliklari, tuzilmasi va ochiq ma’lumotlari.',tags:['QarDTU','rasmiy','universitet'],sourceUrl:'https://kstu.uz/',audience:'university'},
 {type:'other',title:'QarDTU masofaviy ta’lim tizimi',authors:['Qarshi davlat texnika universiteti'],language:'O‘zbekcha',description:'Universitetning amaldagi masofaviy ta’lim kurs kategoriyalari va elektron ta’lim muhiti.',tags:['QarDTU','masofaviy ta’lim','Moodle'],sourceUrl:'https://moodle.kstu.uz/',audience:'university'},
 {type:'other',title:'QarDTU ta’lim yo‘nalishlari — BMBA ochiq ma’lumotlari',authors:['Bilim va malakalarni baholash agentligi'],language:'O‘zbekcha',description:'QarDTU bo‘yicha ochiq ta’lim yo‘nalishlari va ta’lim shakllari katalogi.',tags:['QarDTU','BMBA','yo‘nalishlar'],sourceUrl:'https://my.uzbmb.uz/university-about-direction/435',audience:'university'},
 {type:'other',title:'Masofaviy ta’lim bo‘yicha normativ manba — LexUZ',authors:['O‘zbekiston Respublikasi qonunchilik ma’lumotlari milliy bazasi'],language:'O‘zbekcha',description:'Masofaviy ta’limni tashkil etishga doir normativ-huquqiy manba.',tags:['LexUZ','masofaviy ta’lim','normativ'],sourceUrl:'https://lex.uz/uz/docs/-6221502',audience:'university'}
];
for(const item of libraryRows)await C.library.updateOne({title:item.title},{$set:{...item,published:true,accessCount:0,createdBy:admin._id,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});

await C.videos.updateOne({title:'Qarshi davlat texnika universiteti tashkil etilishi haqida'},{$set:{title:'Qarshi davlat texnika universiteti tashkil etilishi haqida',description:'Qarshi davlat texnika universitetining tashkil etilishi haqida ochiq axborot videosi. Taqdimot kutubxonasidagi tanishtiruv materiali.',subject:'Universitet bilan tanishuv',direction:'Barcha yo‘nalishlar',courseYears:[1,2,3,4],tags:['QarDTU','tanishtiruv'],sourceType:'youtube',sourceUrl:'https://www.youtube.com/watch?v=Ok8Nwsjs59E',durationMinutes:2,published:true,featured:true,views:0,likes:0,createdBy:admin._id,updatedAt:now},$setOnInsert:{createdAt:now}},{upsert:true});

fs.writeFileSync(credPath,JSON.stringify(credentials,null,2),{mode:0o600});
const summary={
 presentationTeachers:await C.users.countDocuments({externalId:/^PRES-T-/}),
 presentationStudents:await C.users.countDocuments({externalId:/^PRES-S-/}),
 distanceGroups:await C.structures.countDocuments({type:'group',externalId:/^QDTU-MT-2026-/,active:true}),
 sampleCourses:await C.courses.countDocuments({code:/^PRES-/,active:true}),
 sampleSchedules:await C.schedules.countDocuments({title:/^\[NAMUNA\]/}),
 sampleCurricula:await C.curricula.countDocuments({programCode:/^PRES-/,active:true}),
 libraryItems:await C.library.countDocuments({published:true}),
 videos:await C.videos.countDocuments({published:true}),
 credentialsFile:credPath
};
console.log(JSON.stringify(summary,null,2));
await mongoose.disconnect();
