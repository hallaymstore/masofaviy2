import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {Readable} from 'node:stream';
// Explicitly opted-in, isolated presentation records. Never updates existing real data.
if(process.env.COURSEWORK_DEMO_SEED!=='I_UNDERSTAND')throw Error('Demo seed uchun COURSEWORK_DEMO_SEED=I_UNDERSTAND talab qilinadi');
const uri=process.env.MONGODB_URI;if(!uri)throw Error('MONGODB_URI mavjud emas');
const passTeacher=String(process.env.COURSEWORK_DEMO_TEACHER_PASSWORD||'');
const passStudent=String(process.env.COURSEWORK_DEMO_STUDENT_PASSWORD||'');
if(passTeacher.length<10||passStudent.length<10)throw Error('Demo parollar env da kamida 10 belgili bo‘lsin');
const O=()=>new mongoose.Types.ObjectId(),prefix='DEMO-JURNAL-2026';
const today=new Date(),at=(n,h=11)=>new Date(today.getTime()-n*86400000+h*3600000);
const hashedT=await bcrypt.hash(passTeacher,10),hashedS=await bcrypt.hash(passStudent,10);
await mongoose.connect(uri,{serverSelectionTimeoutMS:12000});
const db=mongoose.connection.db,c=n=>db.collection(n);
const upsert=async(name,filter,data)=>{
 const col=c(name),existing=await col.findOne(filter);
 if(existing)return existing;
 try{await col.insertOne({_id:O(),...data,createdAt:data.createdAt||new Date(),updatedAt:new Date()})}
 catch(e){if(e.code!==11000)throw e}
 const result=await col.findOne(filter);if(!result)throw Error('Demo ma’lumoti qo‘shilmadi: '+name);
 return result;
};
const user=async(role,code,fullName,refs,hash)=>{
 const login=('demo.jurnal.'+code).toLowerCase();
 const existing=await c('users').findOne({login});
 if(existing&&existing.externalId!==prefix+'-'+code)throw Error('Login to‘qnashuvi: '+login);
 return upsert('users',{login},{
  externalId:prefix+'-'+code,login,fullName,role,active:true,passwordHash:hash,
  mustChangePassword:false,sessionVersion:0,totpEnabled:false,
  permissions:[],deniedPermissions:[],direction:refs.direction||'',courseYear:refs.courseYear||0,
  ...refs
 });
};
async function demoFile({assignment,submission=null,owner,filename,contents}){
 const tag=prefix+'-'+String(assignment._id)+'-'+String(owner._id)+'-'+filename;
 const existing=await c('courseworkfiles').findOne({demoKey:tag});
 if(existing)return;
 const bucket=new mongoose.mongo.GridFSBucket(db,{bucketName:'edu_coursework'});
 const upload=bucket.openUploadStream(filename,{metadata:{demoKey:tag,demo:true}});
 await new Promise((resolve,reject)=>{
  upload.on('finish',resolve);upload.on('error',reject);
  Readable.from([Buffer.from(contents,'utf8')]).pipe(upload);
 });
 await c('courseworkfiles').insertOne({
  _id:O(),demoKey:tag,assignmentId:assignment._id,courseId:assignment.courseId,
  submissionId:submission?._id||null,uploadedBy:owner._id,fileId:upload.id,
  name:filename,mimeType:filename.endsWith('.csv')?'text/csv':'text/plain',
  kind:'document',size:Buffer.byteLength(contents),createdAt:new Date(),updatedAt:new Date()
 });
}
try{
 const faculty=await upsert('structures',{externalId:prefix+'-FAC'},{type:'faculty',externalId:prefix+'-FAC',name:'[DEMO] Ta’lim namoyishi fakulteti',active:true});
 const dept=await upsert('structures',{externalId:prefix+'-DEP'},{type:'department',externalId:prefix+'-DEP',name:'[DEMO] Jurnal va topshiriqlar kafedrasi',parentId:faculty._id,active:true});
 const specs=[
  {key:'DI',group:'DI-DEMO-101',label:'[DEMO] Dasturiy injiniring DI-101',direction:'Dasturiy injiniring',year:1,teacher:'Dasturiy injiniring o‘qituvchisi',subjects:[['PROG','Dasturlash asoslari'],['WEB','Web dasturlash']]},
  {key:'MOL',group:'MOL-DEMO-201',label:'[DEMO] Moliya MOL-201',direction:'Moliya',year:2,teacher:'Biznes moliyasi o‘qituvchisi',subjects:[['FIN','Biznes moliyasi'],['STAT','Statistika asoslari']]}
 ];
 let courses=0,assignments=0,submissions=0,grades=0,files=0;
 for(const spec of specs){
  const group=await upsert('structures',{externalId:prefix+'-'+spec.group},{
   type:'group',externalId:prefix+'-'+spec.group,name:spec.label,parentId:dept._id,active:true,code:spec.group
  });
  const teacher=await user('teacher','t'+spec.key,spec.teacher,{facultyId:faculty._id,departmentId:dept._id,direction:spec.direction},hashedT);
  const students=[];
  for(let i=1;i<=12;i++){
   const key=spec.key.toLowerCase()+String(i).padStart(3,'0');
   students.push(await user('student',key,('Demo talaba '+String(i).padStart(2,'0')+' '+spec.key),{
    facultyId:faculty._id,departmentId:dept._id,groupId:group._id,group:spec.group,direction:spec.direction,courseYear:spec.year
   },hashedS));
  }
  for(const [suffix,subject] of spec.subjects){
   const course=await upsert('courses',{code:prefix+'-'+spec.key+'-'+suffix,groupId:group._id},{
    code:prefix+'-'+spec.key+'-'+suffix,title:'[DEMO] '+subject,
    language:'uz',credits:5,teacherId:teacher._id,groupId:group._id,active:true
   });courses++;
   const topics=spec.key==='DI'?['Nazariya bo‘yicha qisqa javob','Amaliy mashq va kod fayli','Diagramma va prezentatsiya','Loyiha hisoboti']:
    ['Asosiy tushunchalar','Jadval va hisoblash','Tahliliy izoh','Yakuniy hisoboti'];
   for(let j=0;j<4;j++){
    const scale=[2,5,10,100][j],offset=[20,13,6,1][j],key=prefix+'-'+String(course._id)+'-'+j;
    const assignment=await upsert('assignments',{demoKey:key},{
     demoKey:key,courseId:course._id,title:'[DEMO] '+topics[j],
     instructions:'Mavzu bo‘yicha matn, PDF, Word, prezentatsiya, audio, video yoki CSV fayl bilan javob topshiring. Javobni asoslab bering.',
     category:j%2?'practice':'assignment',maxScore:scale,gradeScale:scale,published:true,
     dueAt:at(offset-4),createdAt:at(offset)
    });assignments++;
    await demoFile({assignment,owner:teacher,filename:'demo-topshiriq-'+scale+'.txt',contents:subject+'\nNamuna shart: mavzuni izohlang, misol keltiring, fayl qo‘shing.\nBaholash shkalasi: '+scale});
    files++;
    for(let i=0;i<students.length;i++){
     if((i+j)%5===0)continue; // not submitted
     const student=students[i],graded=(i+j)%4!==0;
     const score=Math.max(0,scale-(i%4)*(scale===2?.5:scale===5?1:scale===10?2:20));
     const sub=await upsert('submissions',{assignmentId:assignment._id,studentId:student._id},{
      assignmentId:assignment._id,studentId:student._id,
      text:'[DEMO] '+subject+': '+topics[j]+' bo‘yicha qisqa nazariy izoh va bajarilgan amaliy topshiriq.',
      submittedAt:at(Math.max(0,offset-2)),
      ...(graded?{score,feedback:score===scale?'A’lo bajarilgan.':'Yaxshi, izohni kengaytiring.',gradedBy:teacher._id,gradedAt:at(Math.max(0,offset-1))}:{})
     });submissions++;if(graded)grades++;
     if(i<3){await demoFile({assignment,submission:sub,owner:student,filename:'demo-javob-'+(i+1)+'.txt',contents:'Demo talaba javobi\nFan: '+subject+'\nMavzu: '+topics[j]});files++}
    }
   }
  }
 }
 console.log(JSON.stringify({ok:true,demo:true,groups:2,students:24,teachers:2,courses,assignments,submissions,grades,files,teacherLogins:['demo.jurnal.tdi','demo.jurnal.tmol'],studentLoginSample:'demo.jurnal.di001',passwords:'from environment variables only'},null,2));
}finally{await mongoose.disconnect()}
