import fs from 'node:fs';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
await mongoose.connect(env.MONGODB_URI);
const db=mongoose.connection.db;
const structures=db.collection('structures'), users=db.collection('users'), schedules=db.collection('schedules');

const groups=await structures.find({type:'group',active:{$ne:false},externalId:/^QDTU-MT-2026-/}).sort({externalId:1}).toArray();
if(groups.length<12) throw new Error('12 ta yo‘nalish guruhi topilmadi');
const byId=Object.fromEntries((await structures.find({_id:{$in:groups.flatMap(g=>[g._id,g.parentId].filter(Boolean))}}).toArray()).map(x=>[String(x._id),x]));
const allStructures=await structures.find({active:{$ne:false}}).toArray();
const structMap=Object.fromEntries(allStructures.map(x=>[String(x._id),x]));

const mainGroup=groups.find(g=>/DI-01$/.test(g.externalId))||groups[0];
const teacherSeeds=[
 ['Azizbek','Karimov','Dasturlash asoslari'],['Dilshod','Raximov','Oliy matematika'],
 ['Mohira','Ergasheva','Iqtisodiyot nazariyasi'],['Shahnoza','Aliyeva','Moliya asoslari'],
 ['Javohir','Xasanov','Ma’lumotlar bazasi'],['Madina','Jo‘rayeva','Buxgalteriya hisobi'],
 ['Sardor','Qodirov','Kompyuter tarmoqlari'],['Nodira','To‘xtayeva','Statistika'],
 ['Bekzod','Mamatqulov','Menejment'],['Nilufar','Ismoilova','Soliq va soliqqa tortish']
];
const teacherDocs=[];
const credentialRows=[['Turi','F.I.Sh.','Login','Parol','Guruh/yo‘nalish']];
for(let i=0;i<teacherSeeds.length;i++){
  const [first,last,subject]=teacherSeeds[i];
  const login=(first+'.'+last).toLowerCase().replace(/[‘’']/g,'').replace(/o‘/g,'o').replace(/g‘/g,'g');
  const password=first+'.'+last+'2026!';
  const externalId='QDTU-T-'+String(i+1).padStart(3,'0');
  const passwordHash=await bcrypt.hash(password,10);
  await users.updateOne({externalId},{$set:{
    login,passwordHash,fullName:first+' '+last,role:'teacher',permissions:[],deniedPermissions:[],
    active:true,mustChangePassword:false,sessionVersion:0,totpEnabled:false,
    direction:subject,courseYear:1,updatedAt:new Date()
  },$setOnInsert:{externalId,createdAt:new Date()}},{upsert:true});
  const row=await users.findOne({externalId});
  teacherDocs.push({...row,subject});
  credentialRows.push(['O‘qituvchi',first+' '+last,login,password,subject]);
}

const firstNames=['Azizbek','Diyorbek','Jasurbek','Sherzod','Bekzod','Sardor','Asadbek','Shoxrux','Umid','Akmal','Mohira','Madina','Nilufar','Shahnoza','Dilnoza','Malika','Sevara','Zarina','Gulnoza','Nodira'];
const lastNames=['Aliyev','Karimov','Raximov','Xasanov','Qodirov','Mamatqulov','Ismoilov','Tursunov','Ergashev','Jo‘rayev','Sodiqov','Nazarov'];
const cleanDirection=name=>String(name||'').replace(/\s+—\s+.*$/,'').trim();
let globalStudent=0;
const createdByGroup=[];
for(const g of groups){
  const count=String(g._id)===String(mainGroup._id)?50:10;
  const dep=structMap[String(g.parentId||'')];
  const fac=dep?structMap[String(dep.parentId||'')]:null;
  for(let j=0;j<count;j++){
    const idx=globalStudent++;
    const first=firstNames[idx%firstNames.length];
    const last=lastNames[Math.floor(idx/firstNames.length)%lastNames.length];
    const seq=String(j+1).padStart(2,'0');
    const groupKey=(g.code||g.externalId||'group').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,12);
    const login=(first+'.'+last+'.'+groupKey+seq).toLowerCase().replace(/[‘’']/g,'');
    const password=first+'.'+last+'2026!';
    const externalId='QDTU-S-'+String(idx+1).padStart(4,'0');
    const passwordHash=await bcrypt.hash(password,10);
    await users.updateOne({externalId},{$set:{
      login,passwordHash,fullName:first+' '+last,role:'student',permissions:[],deniedPermissions:[],
      faculty:fac?.name||'',department:dep?.name||'',group:g.name,
      facultyId:fac?._id,departmentId:dep?._id,groupId:g._id,
      direction:cleanDirection(g.name),courseYear:1,active:true,mustChangePassword:false,
      sessionVersion:0,totpEnabled:false,updatedAt:new Date()
    },$setOnInsert:{externalId,createdAt:new Date()}},{upsert:true});
    credentialRows.push(['Talaba',first+' '+last,login,password,(g.code||g.externalId)+' · '+cleanDirection(g.name)]);
  }
  createdByGroup.push({group:g.name,code:g.code||g.externalId,count});
}

// Eski taqdimot yozuvlarini tozalash va oddiy ko‘rinishdagi jadval tuzish.
await users.deleteMany({externalId:/^PRES-(T|S)-/});
await schedules.deleteMany({$or:[{presentationSeed:'QDTU-2026-DEMO'},{seedBatch:'QDTU-2026-TEST'}]});

const subjects=['Dasturlash asoslari','Oliy matematika','Ma’lumotlar bazasi','Kompyuter tarmoqlari','Iqtisodiyot nazariyasi','Moliya asoslari','Buxgalteriya hisobi','Statistika','Menejment','Soliq va soliqqa tortish','Raqamli iqtisodiyot','Akademik yozuv'];
const slots=[['08:30','09:50'],['10:00','11:20'],['11:30','12:50'],['13:30','14:50'],['15:00','16:20'],['16:30','17:50']];
const kinds=['lecture','practice','seminar'];
let scheduleCount=0;
for(let gi=0;gi<groups.length;gi++){
  const g=groups[gi];
  for(let day=1;day<=6;day++){
    const slotIndex=gi%6;
    const teacherIndex=(gi+day*2)%teacherDocs.length;
    const subject=subjects[(gi+day-1)%subjects.length];
    await schedules.insertOne({
      title:subject,subject,groupId:g._id,teacherId:teacherDocs[teacherIndex]._id,
      weekday:day,start:slots[slotIndex][0],end:slots[slotIndex][1],
      room:'ONL-'+String((gi%4)+1).padStart(2,'0'),kind:kinds[(gi+day)%kinds.length],
      recurring:true,liveEnabled:true,maxParticipants:60,seedBatch:'QDTU-2026-TEST',
      createdAt:new Date(),updatedAt:new Date()
    }); scheduleCount++;
  }
}
// Asosiy 50 talabalik guruhga qo‘shimcha darslar: 10 o‘qituvchining barchasi ko‘rinadi.
for(let day=1;day<=6;day++){
  const teacherIndex=(day+5)%teacherDocs.length,slotIndex=(day+2)%6,subject=teacherDocs[teacherIndex].subject;
  await schedules.insertOne({
    title:subject,subject,groupId:mainGroup._id,teacherId:teacherDocs[teacherIndex]._id,
    weekday:day,start:slots[slotIndex][0],end:slots[slotIndex][1],room:'ONL-MAIN',
    kind:day%2?'lecture':'practice',recurring:true,liveEnabled:true,maxParticipants:60,
    seedBatch:'QDTU-2026-TEST',createdAt:new Date(),updatedAt:new Date()
  }); scheduleCount++;
}

const csv=credentialRows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
fs.writeFileSync('qdtU-test-loginlar.csv','\ufeff'+csv,{mode:0o600});
console.log(JSON.stringify({
  ok:true,
  groups:createdByGroup,
  mainGroup:{name:mainGroup.name,code:mainGroup.code||mainGroup.externalId,students:50},
  teachers:teacherDocs.length,
  students:globalStudent,
  schedules:scheduleCount,
  credentialsFile:'qdtU-test-loginlar.csv'
},null,2));
await mongoose.disconnect();
