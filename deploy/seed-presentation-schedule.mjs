import fs from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
if(!env.MONGODB_URI) throw new Error('MONGODB_URI topilmadi');
await mongoose.connect(env.MONGODB_URI);
const db=mongoose.connection.db;
const structures=db.collection('structures'), users=db.collection('users'), schedules=db.collection('schedules');

const groups=await structures.find({type:'group',active:{$ne:false},externalId:/^QDTU-MT-2026-/}).sort({externalId:1}).toArray();
if(groups.length<10) throw new Error('Kamida 10 ta QDTU-MT demo guruh kerak. Hozir: '+groups.length);

const teachers=[
 ['PRES-T-01','demo.teacher01','Azizbek Karimov','Dasturlash asoslari'],
 ['PRES-T-02','demo.teacher02','Dilshod Raximov','Oliy matematika'],
 ['PRES-T-03','demo.teacher03','Mohira Ergasheva','Iqtisodiyot nazariyasi'],
 ['PRES-T-04','demo.teacher04','Shahnoza Aliyeva','Moliya asoslari'],
 ['PRES-T-05','demo.teacher05','Javohir Xasanov','Ma’lumotlar bazasi'],
 ['PRES-T-06','demo.teacher06','Madina Jo‘rayeva','Buxgalteriya hisobi'],
 ['PRES-T-07','demo.teacher07','Sardor Qodirov','Kompyuter tarmoqlari'],
 ['PRES-T-08','demo.teacher08','Nodira To‘xtayeva','Statistika'],
 ['PRES-T-09','demo.teacher09','Bekzod Mamatqulov','Menejment'],
 ['PRES-T-10','demo.teacher10','Nilufar Ismoilova','Soliq va soliqqa tortish']
];

const now=new Date();
const teacherDocs=[];
for(let i=0;i<teachers.length;i++){
  const [externalId,login,fullName,subject]=teachers[i];
  const password='QDTU-Demo-'+String(i+1).padStart(2,'0')+'!';
  const passwordHash=await bcrypt.hash(password,10);
  await users.updateOne({externalId},{$setOnInsert:{
    externalId,login,fullName,passwordHash,role:'teacher',permissions:[],deniedPermissions:[],
    active:true,mustChangePassword:false,sessionVersion:0,totpEnabled:false,
    direction:'Masofaviy ta’lim — namuna',courseYear:1,createdAt:now
  },$set:{updatedAt:now}}, {upsert:true});
  const row=await users.findOne({externalId});
  teacherDocs.push({...row,demoPassword:password,subject});
}

const subjects=[
 'Dasturlash asoslari','Oliy matematika','Ma’lumotlar bazasi','Kompyuter tarmoqlari',
 'Iqtisodiyot nazariyasi','Moliya asoslari','Buxgalteriya hisobi','Statistika',
 'Menejment','Soliq va soliqqa tortish','Raqamli iqtisodiyot','Akademik yozuv'
];
const slots=[
 ['08:30','09:50'],['10:00','11:20'],['11:30','12:50'],['13:30','14:50'],['15:00','16:20'],['16:30','17:50']
];
const kinds=['lecture','practice','seminar'];
let scheduleCount=0;

// Idempotent: only replace our presentation schedules.
await schedules.deleteMany({presentationSeed:'QDTU-2026-DEMO'});

for(let gi=0;gi<groups.length;gi++){
  const g=groups[gi];
  // 6 dars / hafta: Mon-Sat, one lesson each day.
  for(let day=1;day<=6;day++){
    const teacher=teacherDocs[(gi+day-1)%teacherDocs.length];
    const subject=subjects[(gi*2+day-1)%subjects.length];
    const slot=slots[(gi+day-1)%slots.length];
    const kind=kinds[(gi+day)%kinds.length];
    const room='ONL-'+String((gi%4)+1).padStart(2,'0');
    await schedules.insertOne({
      title:'[NAMUNA] '+subject,
      subject,
      groupId:g._id,
      teacherId:teacher._id,
      weekday:day,
      start:slot[0],
      end:slot[1],
      room,
      kind,
      recurring:true,
      liveEnabled:true,
      maxParticipants:60,
      presentationSeed:'QDTU-2026-DEMO',
      createdAt:now,
      updatedAt:now
    });
    scheduleCount++;
  }
}

// demo credentials file only on server, mode 600
const lines=['HALLAYM EDU — taqdimot uchun demo o‘qituvchilar',''];
for(const t of teacherDocs) lines.push(t.login+' | '+t.fullName+' | '+t.demoPassword);
fs.writeFileSync('demo-teacher-credentials.txt',lines.join('\n'),{mode:0o600});

console.log(JSON.stringify({
  ok:true,
  groups:groups.length,
  demoTeachers:teacherDocs.length,
  demoSchedules:scheduleCount,
  credentialsFile:'demo-teacher-credentials.txt'
},null,2));
await mongoose.disconnect();
