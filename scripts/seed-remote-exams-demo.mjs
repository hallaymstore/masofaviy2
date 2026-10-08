import 'dotenv/config';
import mongoose from 'mongoose';
if(!process.env.MONGODB_URI)throw Error('MONGODB_URI kerak');
await mongoose.connect(process.env.MONGODB_URI);
try{
 const db=mongoose.connection.db;
 const courses=await db.collection('courses').find({code:{$in:['DI-PROG','DI-WEB','AI-INTRO','AI-ML']},active:true}).limit(2).toArray();
 if(courses.length<1)throw Error('Demo kurs topilmadi; foydalanuvchilar yoki haqiqiy fanlarga tegilmaydi');
 const staff=await db.collection('users').findOne({role:{$in:['admin','superadmin']},active:true},{projection:{_id:1}});
 if(!staff)throw Error('Administrator topilmadi');
 const now=new Date(),end=new Date(now.getTime()+3*86400000);
 const templates=[
 [{text:'Algoritm qanday tushuncha?',options:['Qadam-baqadam amallar ketma-ketligi','Kompyuter markasi','Faqat internet tarmog‘i','Tasvir formati'],answer:0},{text:'Dasturdagi xatoni topish jarayoni nima?',options:['Renderlash','Debugging','Hosting','Indekslash'],answer:1}],
 [{text:'HTTP protokoli nimaga xizmat qiladi?',options:['Veb ma’lumot almashish','Protsessor sovutish','Elektr uzatish','Tasvir chizish'],answer:0},{text:'JavaScript odatda qayerda ishlashi mumkin?',options:['Faqat BIOSda','Brauzer va serverda','Faqat printerda','Faqat PDFda'],answer:1}]
 ];
 let created=0,existing=0;
 for(let i=0;i<courses.length;i++){const c=courses[i],title='DEMO · Kamera nazoratli test · '+c.code,filter={title,courseId:c._id};const result=await db.collection('remoteexams').updateOne(filter,{$setOnInsert:{...filter,groupId:c.groupId,createdBy:staff._id,startsAt:new Date(now.getTime()-60000),endsAt:end,durationMinutes:15,questions:templates[i%2],published:true,passScore:70,practiceOnly:true,createdAt:now,updatedAt:now}},{upsert:true});if(result.upsertedCount)created++;else existing++}
 console.log(JSON.stringify({ok:true,created,existing,courses:courses.map(x=>x.code),note:'Faqat demo testlar; real akademik natija va akkauntlar o‘zgarmadi'},null,2));
}finally{await mongoose.disconnect()}
