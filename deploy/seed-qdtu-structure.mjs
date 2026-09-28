import 'dotenv/config';
import mongoose from 'mongoose';

if(!process.env.MONGODB_URI) throw new Error('MONGODB_URI topilmadi');
await mongoose.connect(process.env.MONGODB_URI);

const db=mongoose.connection.db, structures=db.collection('structures');
const now=new Date();

const faculties=[
 ['QDTU-F-TQM','TQM','Transport va qurilish muhandisligi fakulteti'],
 ['QDTU-F-EM','EM','Energetika muhandisligi fakulteti'],
 ['QDTU-F-NGG','NGG','Neft-gaz va geologiya fakulteti'],
 ['QDTU-F-RTSI','RTSI','Raqamli texnologiyalar va sun’iy intellekt fakulteti'],
 ['QDTU-F-SOOM','SOOM','Shahrisabz oziq-ovqat muhandisligi fakulteti'],
 ['QDTU-F-IB','IB','Iqtisodiyot va boshqaruv fakulteti'],
 ['QDTU-F-IM','IM','Irrigatsiya muhandisligi fakulteti']
];

const departments={
 'QDTU-F-EM':[
  ['QDTU-D-EM-ET','ET','Elektr ta’minoti va intellektual energetik tizimlar'],
  ['QDTU-D-EM-EM','EM','Energetika muhandisligi'],
  ['QDTU-D-EM-MM','MMTX','Mehnat muhofazasi va texnika xavfsizligi'],
  ['QDTU-D-EM-TJAB','TJAB','Texnologik jarayonlarni avtomatlashtirish va boshqarish'],
  ['QDTU-D-EM-OM','OM','Oliy matematika']
 ],
 'QDTU-F-NGG':[
  ['QDTU-D-NGG-NG','NG','Neft-gaz ishi va ularni qayta ishlash texnologiyasi'],
  ['QDTU-D-NGG-TMJ','TMJ','Texnologik mashinalar va jihozlar'],
  ['QDTU-D-NGG-GKI','GKI','Geologiya va konchilik ishi'],
  ['QDTU-D-NGG-TF','TF','Tabiiy fanlar']
 ],
 'QDTU-F-RTSI':[
  ['QDTU-D-RTSI-KTDT','KTDT','Kompyuter tizimlarining dasturiy va texnik ta’minoti'],
  ['QDTU-D-RTSI-OAT','OAT','Optik aloqa tizimlari va tarmoq'],
  ['QDTU-D-RTSI-ATT','ATT','Axborot tizimlari va texnologiyalari']
 ],
 'QDTU-F-IB':[
  ['QDTU-D-IB-BHA','BHA','Buxgalteriya hisobi va audit'],
  ['QDTU-D-IB-II','II','Innovatsion iqtisodiyot'],
  ['QDTU-D-IB-MT','MT-IB','Masofaviy ta’lim dasturlari koordinatsiyasi']
 ],
 'QDTU-F-IM':[
  ['QDTU-D-IM-GF','GF','Gumanitar fanlar'],
  ['QDTU-D-IM-IAM','IAM','Irrigatsiya va melioratsiya'],
  ['QDTU-D-IM-GINS','GINS','Gidrotexnika inshootlari va nasos stansiyalari'],
  ['QDTU-D-IM-AT','AGRO','Agrotexnologiyalar'],
  ['QDTU-D-IM-EG','EG','Ekologiya va gidrologiya']
 ],
 'QDTU-F-TQM':[
  ['QDTU-D-TQM-MT','MT-TQM','Masofaviy ta’lim dasturlari koordinatsiyasi']
 ],
 'QDTU-F-SOOM':[
  ['QDTU-D-SOOM-MT','MT-SOOM','Masofaviy ta’lim dasturlari koordinatsiyasi']
 ]
};

const groups=[
 ['QDTU-MT-2026-AT-01','MT-AT-1-26','Axborot tizimlari va texnologiyalari — 1-kurs (masofaviy)','QDTU-D-RTSI-ATT'],
 ['QDTU-MT-2026-DI-01','MT-DI-1-26','Dasturiy injiniring — 1-kurs (masofaviy)','QDTU-D-RTSI-KTDT'],
 ['QDTU-MT-2026-KI-01','MT-KI-1-26','Kompyuter injiniringi — 1-kurs (masofaviy)','QDTU-D-RTSI-KTDT'],
 ['QDTU-MT-2026-SI-01','MT-SI-1-26','Sun’iy intellekt — 1-kurs (masofaviy)','QDTU-D-RTSI-KTDT'],
 ['QDTU-MT-2026-BI-01','MT-BI-1-26','Bank ishi — 1-kurs (masofaviy)','QDTU-D-IB-MT'],
 ['QDTU-MT-2026-BH-01','MT-BH-1-26','Buxgalteriya hisobi — 1-kurs (masofaviy)','QDTU-D-IB-BHA'],
 ['QDTU-MT-2026-IQ-01','MT-IQ-1-26','Iqtisodiyot — 1-kurs (masofaviy)','QDTU-D-IB-II'],
 ['QDTU-MT-2026-LOG-01','MT-LOG-1-26','Logistika — 1-kurs (masofaviy)','QDTU-D-IB-MT'],
 ['QDTU-MT-2026-MEN-01','MT-MEN-1-26','Menejment — 1-kurs (masofaviy)','QDTU-D-IB-MT'],
 ['QDTU-MT-2026-MMT-01','MT-MMT-1-26','Moliya va moliyaviy texnologiyalar — 1-kurs (masofaviy)','QDTU-D-IB-MT'],
 ['QDTU-MT-2026-SST-01','MT-SST-1-26','Soliqlar va soliqqa tortish — 1-kurs (masofaviy)','QDTU-D-IB-MT'],
 ['QDTU-MT-2026-STAT-01','MT-STAT-1-26','Statistika — 1-kurs (masofaviy)','QDTU-D-IB-MT']
];

async function upsert(type,externalId,code,name,parentId){
 const set={type,externalId,code,name,active:true,updatedAt:now};
 if(parentId)set.parentId=parentId;
 const r=await structures.findOneAndUpdate(
  {type,externalId},
  {$set:set,$setOnInsert:{createdAt:now}},
  {upsert:true,returnDocument:'after'}
 );
 return r;
}

const facultyById={};
for(const [id,code,name] of faculties){
 let existing=null;
 if(id==='QDTU-F-IB') existing=await structures.findOne({type:'faculty',name:{$in:['Iqtisodiyot','Iqtisodiyot va boshqaruv fakulteti']}});
 if(existing && !existing.externalId){
   await structures.updateOne({_id:existing._id},{$set:{externalId:id,code,name,active:true,updatedAt:now}});
   facultyById[id]=await structures.findOne({_id:existing._id});
 }else facultyById[id]=await upsert('faculty',id,code,name);
}

const deptById={};
for(const [fid,items] of Object.entries(departments)){
 const parent=facultyById[fid];
 for(const [id,code,name] of items) deptById[id]=await upsert('department',id,code,name,parent._id);
}

for(const [id,code,name,did] of groups) await upsert('group',id,code,name,deptById[did]._id);

// Eski sinov guruhlarini o‘chirmaymiz: ularga bog‘langan tarix bo‘lishi mumkin.
// Faqat yangi rasmiylashtirilgan guruhlar mavjud bo‘lsa, eski nomlari aniq demo ko‘rinishida bo‘lganlarini inactive qilamiz.
await structures.updateMany(
 {type:'group',externalId:{$nin:groups.map(x=>x[0])},name:{$in:['Moliya','SOLIQ']}},
 {$set:{active:false,updatedAt:now}}
);

const summary={
 faculties:await structures.countDocuments({type:'faculty',active:true}),
 departments:await structures.countDocuments({type:'department',active:true}),
 groups:await structures.countDocuments({type:'group',active:true}),
 distanceGroups:await structures.countDocuments({type:'group',active:true,externalId:/^QDTU-MT-2026-/})
};
console.log(JSON.stringify(summary,null,2));
await mongoose.disconnect();
