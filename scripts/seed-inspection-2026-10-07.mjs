import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const need=name=>{const v=String(process.env[name]||'');if(v.length<8)throw new Error(name+' kamida 8 belgili bo‘lishi kerak');return v};
const MONGODB_URI=process.env.MONGODB_URI;if(!MONGODB_URI)throw new Error('MONGODB_URI topilmadi');
const STUDENT_PASSWORD=need('DEMO_STUDENT_PASSWORD'),TEACHER_PASSWORD=need('DEMO_TEACHER_PASSWORD'),STAFF_PASSWORD=need('DEMO_STAFF_PASSWORD');
const SEED_DATE=process.env.SEED_DATE||'2026-10-07',ACADEMIC_YEAR='2026/2027',TZ='+05:00',now=new Date();
const d=new Date(SEED_DATE+'T12:00:00Z'),WEEKDAY=d.getUTCDay()===0?7:d.getUTCDay(),oid=()=>new mongoose.Types.ObjectId(),at=t=>new Date(SEED_DATE+'T'+t+':00'+TZ);
const future=(days,h)=>{const x=at(String(h).padStart(2,'0')+':00');x.setDate(x.getDate()+days);return x};
const upsert=async(c,f,s,i={})=>{await c.updateOne(f,{$set:{...s,updatedAt:now},$setOnInsert:{...i,createdAt:now}},{upsert:true});return c.findOne(f)};
const ensureStructure=(c,type,name,externalId,code,parentId)=>upsert(c,{type,externalId},{type,name,externalId,code,parentId:parentId||null,active:true});
const ensureUser=async(c,hash,data)=>{let x=await c.findOne({$or:[{login:data.login},{externalId:data.externalId}]});const set={...data,passwordHash:hash,active:true,mustChangePassword:false,permissions:[],deniedPermissions:[],sessionVersion:0,totpEnabled:false};if(x){await c.updateOne({_id:x._id},{$set:{...set,updatedAt:now}});return c.findOne({_id:x._id})}x={_id:oid(),...set,createdAt:now,updatedAt:now};await c.insertOne(x);return x};

const teachersSpec=[
 ['QDTU-T-001','azizbek.karimov','Azizbek Karimov'],['QDTU-T-002','dilshod.raximov','Dilshod Raximov'],
 ['QDTU-T-003','mohira.ergasheva','Mohira Ergasheva'],['QDTU-T-004','shahnoza.aliyeva','Shahnoza Aliyeva'],
 ['QDTU-T-007','sardor.qodirov','Sardor Qodirov'],['QDTU-T-008','nodira.toxtayeva','Nodira To‘xtayeva'],
 ['QDTU-T-009','bekzod.mamatqulov','Bekzod Mamatqulov'],['QDTU-T-010','nilufar.ismoilova','Nilufar Ismoilova']
];
const specs={
 DI:[
  ['DI-PROG','Dasturlash asoslari',6,0,['Algoritm va dastur tuzilishi','Funksiyalar va modullar','Xatolarni boshqarish va testlash'],'https://www.youtube.com/watch?v=rfscVS0vtbw',[['Python 3 rasmiy qo‘llanmasi','https://docs.python.org/3/tutorial/'],['MDN JavaScript Guide','https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide']]],
  ['DI-WEB','Web dasturlash',6,1,['HTML va semantik tuzilma','CSS responsive dizayn','JavaScript DOM va API'],'https://www.youtube.com/watch?v=PkZNo7MFNFg',[['MDN Web Docs','https://developer.mozilla.org/en-US/docs/Learn_web_development'],['Node.js hujjatlari','https://nodejs.org/docs/latest/api/']]],
  ['DI-DB','Ma’lumotlar bazasi',5,2,['Relatsion model va SQL','JOIN va agregatsiyalar','Indeks va tranzaksiyalar'],'https://www.youtube.com/watch?v=HXV3zeQKqGY',[['PostgreSQL Documentation','https://www.postgresql.org/docs/current/'],['MongoDB Manual','https://www.mongodb.com/docs/manual/']]],
  ['DI-SE','Dasturiy ta’minot muhandisligi',5,3,['Talablarni tahlil qilish','Git va jamoaviy ishlab chiqish','Test, CI/CD va release'],'https://www.youtube.com/watch?v=RGOj5yH7evk',[['Git Documentation','https://git-scm.com/doc'],['GitHub Actions Documentation','https://docs.github.com/en/actions']]]
 ],
 AI:[
  ['AI-INTRO','Sun’iy intellekt asoslari',6,4,['AI tushunchalari va qo‘llanishi','Qidiruv va bilimlarni ifodalash','Mas’uliyatli AI va etik tamoyillar'],'https://www.youtube.com/watch?v=aircAruvnKk',[['Google ML Crash Course','https://developers.google.com/machine-learning/crash-course'],['TensorFlow Guide','https://www.tensorflow.org/guide']]],
  ['AI-PY','Python va ma’lumotlar tahlili',6,5,['NumPy massivlari','Pandas bilan tahlil','Vizualizatsiya va preprocessing'],'https://www.youtube.com/watch?v=rfscVS0vtbw',[['NumPy User Guide','https://numpy.org/doc/stable/user/'],['Pandas User Guide','https://pandas.pydata.org/docs/user_guide/']]],
  ['AI-ML','Machine Learning',6,6,['Supervised learning','Model baholash va cross-validation','Feature engineering va pipeline'],'https://www.youtube.com/watch?v=7eh4d6sabA0',[['Scikit-learn User Guide','https://scikit-learn.org/stable/user_guide.html'],['Rules of ML','https://developers.google.com/machine-learning/guides/rules-of-ml']]],
  ['AI-NN','Neyron tarmoqlar',6,7,['Perceptron va aktivatsiya','Gradient descent','Backpropagation va deep learning'],'https://www.youtube.com/watch?v=IHZwWFHWa-w',[['Keras Guides','https://keras.io/guides/'],['TensorFlow Tutorials','https://www.tensorflow.org/tutorials']]]
 ]
};
const questionBank={
 'DI-PROG':['Algoritm','Funksiya','Boolean','Loop','Exception'],
 'DI-WEB':['HTML','CSS','DOM','HTTP GET','Responsive dizayn'],
 'DI-DB':['Primary key','JOIN','Index','Transaction','SELECT'],
 'DI-SE':['Git branch','Unit test','CI','Requirement','Code review'],
 'AI-INTRO':['Sun’iy intellekt','Model','Training data','Responsible AI','Inference'],
 'AI-PY':['NumPy','DataFrame','Missing value','Normalization','CSV'],
 'AI-ML':['Supervised learning','Overfitting','Cross-validation','Feature','Classification'],
 'AI-NN':['Neuron','Gradient descent','Backpropagation','Activation function','Epoch']
};
const qs=code=>(questionBank[code]||questionBank['DI-PROG']).map((x,i)=>({prompt:x+' bo‘yicha to‘g‘ri ta’rifni tanlang',options:['To‘g‘ri asosiy ta’rif','Noto‘g‘ri variant B','Noto‘g‘ri variant C','Noto‘g‘ri variant D'],correctIndex:0}));

await mongoose.connect(MONGODB_URI,{serverSelectionTimeoutMS:15000});const db=mongoose.connection.db;
const C=name=>db.collection(name),users=C('users'),structures=C('structures'),courses=C('courses'),resources=C('resources'),assignments=C('assignments'),submissions=C('submissions'),quizzes=C('quizzes'),attempts=C('quizattempts'),schedules=C('schedules'),attendances=C('attendances'),videos=C('videolessons'),comments=C('videocomments'),curricula=C('curriculumplans'),studyplans=C('studyplans'),results=C('courseresults'),movements=C('studentmovements'),library=C('libraryitems'),threads=C('forumthreads'),posts=C('forumposts'),messages=C('internalmessages'),finalExams=C('finalexamsessions'),settings=C('institutionsettings'),audits=C('audits');
const libIndexes=await library.indexes().catch(()=>[]);
const oldTextIndex=libIndexes.find(x=>Object.values(x.key||{}).some(v=>v==='text'));
if(oldTextIndex&&oldTextIndex.language_override!=='searchLanguage'){
  console.log('Kutubxona text index migratsiyasi:',oldTextIndex.name);
  await library.dropIndex(oldTextIndex.name);
  await library.createIndex({title:'text',authors:'text',description:'text',tags:'text'},{name:'library_search_text',default_language:'none',language_override:'searchLanguage'});
}else if(!oldTextIndex){
  await library.createIndex({title:'text',authors:'text',description:'text',tags:'text'},{name:'library_search_text',default_language:'none',language_override:'searchLanguage'});
}

const [sh,th,fh]=await Promise.all([bcrypt.hash(STUDENT_PASSWORD,11),bcrypt.hash(TEACHER_PASSWORD,11),bcrypt.hash(STAFF_PASSWORD,11)]);

const fac=await ensureStructure(structures,'faculty','Raqamli texnologiyalar fakulteti','QDTU-RTF-2026','RTF');
const dep=await ensureStructure(structures,'department','Dasturiy injiniring va sun’iy intellekt kafedrasi','QDTU-DSAI-2026','DSAI',fac._id);
const gDI=await ensureStructure(structures,'group','Dasturiy injiniring — DI-01','QDTU-MT-2026-DI-01','DI-01',dep._id);
const gAI=await ensureStructure(structures,'group','Sun’iy intellekt — SI-01','QDTU-MT-2026-SI-01','SI-01',dep._id);

const staff=[];
for(const [externalId,login,fullName,role] of [['DEMO-DEAN-01','demo.dean','Demo Dekan','dean'],['DEMO-DEP-01','demo.department','Demo Kafedra mudiri','department'],['DEMO-TUTOR-01','demo.tutor','Demo Tyutor','tutor'],['DEMO-RECT-01','demo.rectorate','Demo Rektorat','rectorate'],['DEMO-TECH-01','demo.tech','Demo Texnik xodim','tech']])staff.push(await ensureUser(users,fh,{externalId,login,fullName,role,facultyId:fac._id,departmentId:dep._id,faculty:fac.name,department:dep.name,citizenshipCountry:'UZ'}));
const teachers=[];for(const [externalId,login,fullName] of teachersSpec)teachers.push(await ensureUser(users,th,{externalId,login,fullName,role:'teacher',facultyId:fac._id,departmentId:dep._id,faculty:fac.name,department:dep.name,citizenshipCountry:'UZ',identityVerifiedAt:at('00:00'),identityVerificationMode:'in_person',identityDocumentType:'demo-test'}));
const first=['Azizbek','Diyorbek','Jasurbek','Sherzod','Bekzod','Sardor','Asadbek','Shoxrux','Umid','Akmal','Mohira','Madina','Nilufar','Shahnoza','Dilnoza','Malika','Sevara','Zarina','Gulnoza','Nodira'],sDI=[],sAI=[];
for(let i=1;i<=40;i++){const left=i<=20,group=left?gDI:gAI,local=left?i:i-20,seq=String(i).padStart(3,'0');const row=await ensureUser(users,sh,{login:'student'+seq,externalId:'TEST-STUDENT-'+seq,fullName:first[local-1]+' '+(left?'Rahmonov':'Usmonov'),role:'student',facultyId:fac._id,departmentId:dep._id,groupId:group._id,faculty:fac.name,department:dep.name,group:group.name,direction:left?'Dasturiy injiniring':'Sun’iy intellekt',courseYear:2,citizenshipCountry:'UZ',identityVerifiedAt:at('00:00'),identityVerificationMode:'in_person',identityDocumentType:'demo-test'});(left?sDI:sAI).push(row)}

const rows={DI:[],AI:[]};for(const key of ['DI','AI']){const group=key==='DI'?gDI:gAI;for(const raw of specs[key]){const [code,title,credits,ti,topics,video,links]=raw,teacher=teachers[ti];const row=await upsert(courses,{code,groupId:group._id},{code,title,language:'uz',syllabusUrl:'https://kstu.uz/',credits,teacherId:teacher._id,groupId:group._id,active:true});rows[key].push({...row,code,title,credits,topics,video,links,teacher})}}
for(const key of ['DI','AI']){const group=key==='DI'?gDI:gAI,direction=key==='DI'?'Dasturiy injiniring':'Sun’iy intellekt',programCode=key==='DI'?'60610400-DI-DEMO':'60610500-AI-DEMO';await upsert(curricula,{programCode,academicYear:ACADEMIC_YEAR,language:'uz'},{name:direction+' '+ACADEMIC_YEAR+' demo o‘quv reja',programCode,direction,academicYear:ACADEMIC_YEAR,language:'uz',approvedDocumentNo:'DEMO-2026-10-07',approvedAt:at('08:00'),groupIds:[group._id],subjects:rows[key].map(x=>({semester:1,code:x.code,title:x.title,credits:x.credits,language:'uz',syllabusUrl:'https://kstu.uz/',practiceRequired:true})),active:true,createdBy:rows[key][0].teacher._id})}

let videoCount=0,quizCount=0,proctorCount=0,assignmentCount=0;
for(const key of ['DI','AI']){const group=key==='DI'?gDI:gAI,students=key==='DI'?sDI:sAI,direction=key==='DI'?'Dasturiy injiniring':'Sun’iy intellekt';for(const course of rows[key]){
 for(const [title,url] of course.links)await upsert(resources,{courseId:course._id,title},{courseId:course._id,title,kind:'link',url,description:course.title+' uchun o‘quv manbasi',published:true,accessCount:12,lastAccessedAt:now,createdBy:course.teacher._id});
 await quizzes.updateMany({courseId:course._id,title:{$in:['Mavzu testi · '+course.title,'PROKTORING TEST · '+course.title]}},{$set:{published:false,updatedAt:now}});
 const a1=await upsert(assignments,{courseId:course._id,title:'Amaliy topshiriq · '+course.title},{courseId:course._id,title:'Amaliy topshiriq · '+course.title,category:'practice',instructions:'Mavzu bo‘yicha kichik amaliy loyiha tayyorlang.',dueAt:future(7,18),maxScore:100,published:true});
 const a2=await upsert(assignments,{courseId:course._id,title:'Mustaqil ish · '+course.title},{courseId:course._id,title:'Mustaqil ish · '+course.title,category:'independent_work',instructions:'Nazariy xulosa va amaliy misol tayyorlang.',dueAt:future(14,18),maxScore:100,published:true});assignmentCount+=2;
 const topicQuizzes=[],made=[];for(let i=0;i<course.topics.length;i++){
   const topic=course.topics[i],isProctor=i===course.topics.length-1,quizTitle=(isProctor?'PROKTORING QISQA TEST · ':'Qisqa test · ')+course.code+' · '+(i+1)+'-mavzu';
   const topicQuestions=[
     {prompt:'"'+topic+'" mavzusining asosiy maqsadi qaysi?',options:['Asosiy tushuncha va amaliy qo‘llashni tushunish','Faqat interfeys rangini tanlash','Faqat fayl nomini o‘zgartirish','Faqat qurilmani qayta yuklash'],correctIndex:0},
     {prompt:'Videodarsdagi "'+topic+'" mavzusidan keyin nima qilish kerak?',options:['Asosiy g‘oyani misol bilan qo‘llash','Mavzuni tekshirmasdan o‘tkazib yuborish','Faqat sahifani yangilash','Faqat video nomini yodlash'],correctIndex:0},
     {prompt:'"'+course.title+'" fanida bu mavzu qanday o‘zlashtiriladi?',options:['Nazariya + amaliy mashq + qisqa nazorat orqali','Faqat reklama ko‘rish orqali','Faqat chat orqali','Faqat fayl yuklash orqali'],correctIndex:0}
   ];
   const quiz=await upsert(quizzes,{courseId:course._id,title:quizTitle},{courseId:course._id,title:quizTitle,durationMinutes:isProctor?12:7,maxAttempts:10,published:true,proctorRequired:isProctor,questions:topicQuestions});quizCount++;if(isProctor)proctorCount++;topicQuizzes.push(quiz);
   const title=(i+1)+'-mavzu · '+topic;made.push(await upsert(videos,{courseId:course._id,title},{title,description:topic+' bo‘yicha nazariya va amaliy misollar.',subject:course.title,courseId:course._id,moduleTitle:i<2?'1-modul. Asosiy tushunchalar':'2-modul. Amaliy qo‘llash',topicTitle:topic,sequence:i+1,checkpointQuizId:quiz._id,teacherId:course.teacher._id,groupIds:[group._id],direction,courseYears:[2],tags:[course.code.toLowerCase(),'demo','2026'],sourceType:'youtube',sourceUrl:course.video,thumbnailUrl:'',durationMinutes:40+i*10,published:true,featured:i===0,views:25+i*14,likes:7+i*3,createdBy:course.teacher._id}));videoCount++
 }
 const normal=topicQuizzes[0],proctor=topicQuizzes[topicQuizzes.length-1];
 await upsert(library,{title:course.title+' · asosiy o‘quv manbasi',audience:'courses'},{type:'manual',title:course.title+' · asosiy o‘quv manbasi',authors:['QarDTU demo seed'],publicationYear:2026,language:'uz',searchLanguage:'none',description:course.title+' faniga biriktirilgan resurs.',tags:[course.code,'demo'],sourceUrl:course.links[0][1],courseIds:[course._id],audience:'courses',published:true,accessCount:12,createdBy:course.teacher._id});
 const thread=await upsert(threads,{courseId:course._id,title:'Savol-javob · '+course.title},{courseId:course._id,title:'Savol-javob · '+course.title,createdBy:course.teacher._id,locked:false});
 await upsert(posts,{threadId:thread._id,userId:course.teacher._id,text:'Ushbu mavzuda dars, topshiriq va test bo‘yicha savollarni yozing.'},{threadId:thread._id,courseId:course._id,userId:course.teacher._id,text:'Ushbu mavzuda dars, topshiriq va test bo‘yicha savollarni yozing.',parentId:null});
 await upsert(posts,{threadId:thread._id,userId:students[0]._id,text:'Proktoring testini qaysi brauzerda topshirish tavsiya etiladi?'},{threadId:thread._id,courseId:course._id,userId:students[0]._id,text:'Proktoring testini qaysi brauzerda topshirish tavsiya etiladi?',parentId:null});
 for(let i=0;i<8;i++)await upsert(submissions,{assignmentId:a1._id,studentId:students[i]._id},{assignmentId:a1._id,studentId:students[i]._id,text:'Demo amaliy topshiriq javobi · '+students[i].login,submittedAt:at('07:30'),score:74+i*3,feedback:'Qabul qilindi.',gradedBy:course.teacher._id,gradedAt:at('08:00')});
 for(let i=2;i<8;i++)await upsert(attempts,{quizId:normal._id,studentId:students[i]._id,startedAt:at('06:00')},{quizId:normal._id,studentId:students[i]._id,startedAt:at('06:00'),submittedAt:at('06:14'),answers:qs(course.code).map(x=>x.correctIndex),score:80+i,reviewDecision:'pending',proctorEvents:[]});
 if(students[10])await upsert(attempts,{quizId:proctor._id,studentId:students[10]._id,startedAt:at('06:30')},{quizId:proctor._id,studentId:students[10]._id,startedAt:at('06:30'),submittedAt:at('06:48'),answers:qs(course.code).map(x=>x.correctIndex),score:92,proctorConsentAt:at('06:29'),proctorEvents:[{type:'camera_ready',at:at('06:30')},{type:'microphone_ready',at:at('06:30')},{type:'fullscreen_enter',at:at('06:30')}],proctorSummary:{riskScore:0,reviewPriority:'low',eventCounts:{camera_ready:1,microphone_ready:1,fullscreen_enter:1},cameraReady:true,microphoneReady:true,warnings:[],generatedAt:at('06:48')},reviewDecision:'cleared'});
 if(students[11])await upsert(attempts,{quizId:proctor._id,studentId:students[11]._id,startedAt:at('07:00')},{quizId:proctor._id,studentId:students[11]._id,startedAt:at('07:00'),submittedAt:at('07:04'),terminatedAt:at('07:04'),terminationReason:'Imtihon sahifasidan chiqildi yoki boshqa ilovaga o‘tildi',terminationEvent:'page_hidden',autoTerminated:true,answers:[],score:0,proctorConsentAt:at('06:59'),proctorEvents:[{type:'camera_ready',at:at('07:00')},{type:'microphone_ready',at:at('07:00')},{type:'fullscreen_enter',at:at('07:00')},{type:'page_hidden',at:at('07:04')}],proctorSummary:{riskScore:72,reviewPriority:'high',eventCounts:{camera_ready:1,microphone_ready:1,fullscreen_enter:1,page_hidden:1},cameraReady:true,microphoneReady:true,warnings:['Imtihon oynasidan chiqish signallari bor'],generatedAt:at('07:04')},reviewDecision:'needs_review'});
 const v=made[0],root=await upsert(comments,{videoId:v._id,userId:students[0]._id,text:'Mavzu tushunarli. Testni ham shu videodan keyin topshiramizmi?'},{videoId:v._id,userId:students[0]._id,parentId:null,text:'Mavzu tushunarli. Testni ham shu videodan keyin topshiramizmi?'});
 await upsert(comments,{videoId:v._id,userId:course.teacher._id,text:'Ha, videodan keyingi Test tugmasi orqali topshirasiz.'},{videoId:v._id,userId:course.teacher._id,parentId:root._id,text:'Ha, videodan keyingi Test tugmasi orqali topshirasiz.'});
}}

const slots=[['08:00','09:20'],['09:20','10:40'],['10:40','12:00'],['12:00','13:20'],['13:20','14:40'],['14:40','16:00'],['16:00','17:20'],['17:20','18:40'],['18:40','20:00'],['20:00','21:20']],lessonRows={DI:[],AI:[]};
for(const key of ['DI','AI']){const group=key==='DI'?gDI:gAI;for(let i=0;i<slots.length;i++){const course=rows[key][i%4],[start,end]=slots[i],kind=i%3===0?'lecture':i%3===1?'practice':'seminar';lessonRows[key].push(await upsert(schedules,{groupId:group._id,date:SEED_DATE,start},{title:'DEMO 7-OKTABR · '+course.title+' · '+(i+1)+'-dars',subject:course.title,groupId:group._id,teacherId:course.teacher._id,weekday:WEEKDAY,date:SEED_DATE,start,end,room:'ONLINE',kind,recurring:false,liveEnabled:true,maxParticipants:60}))}}

for(const key of ['DI','AI']){const students=key==='DI'?sDI:sAI,group=key==='DI'?gDI:gAI;for(const s of students){await upsert(studyplans,{studentId:s._id,academicYear:ACADEMIC_YEAR,semester:1},{studentId:s._id,academicYear:ACADEMIC_YEAR,semester:1,items:rows[key].map(c=>({courseId:c._id,credits:c.credits,required:true,status:'in_progress'})),notes:'Demo o‘quv reja',approvedBy:rows[key][0].teacher._id,approvedAt:at('08:00')});await upsert(movements,{studentId:s._id,kind:'admission',documentNo:'DEMO-ADM-'+s.login},{studentId:s._id,kind:'admission',effectiveAt:new Date('2026-09-02T09:00:00'+TZ),fromGroupId:null,toGroupId:group._id,documentNo:'DEMO-ADM-'+s.login,reason:'Demo/test talaba qabul yozuvi',createdBy:rows[key][0].teacher._id})}
 for(let i=0;i<3;i++)for(const c of rows[key].slice(0,2)){const total=84+i*3;await upsert(results,{studentId:students[i]._id,courseId:c._id,academicYear:ACADEMIC_YEAR,semester:1},{studentId:students[i]._id,courseId:c._id,academicYear:ACADEMIC_YEAR,semester:1,continuousScore:82+i*2,finalScore:86+i*2,totalScore:total,gradeLabel:total>=90?'A':'B',creditsAwarded:c.credits,status:'final',note:'Demo yakuniy natija',enteredBy:c.teacher._id,finalizedBy:c.teacher._id,finalizedAt:at('07:00'),revisionReason:''})}
 for(const lesson of lessonRows[key].slice(0,3))for(let i=0;i<students.length;i++){const status=i%11===0?'absent':i%7===0?'late':'present',join=status==='absent'?null:new Date(at(lesson.start).getTime()+(status==='late'?12:2)*60000),minutes=status==='absent'?0:status==='late'?62:78,left=join?new Date(join.getTime()+minutes*60000):null;await upsert(attendances,{lessonId:String(lesson._id),userId:students[i]._id,dateKey:SEED_DATE},{lessonId:String(lesson._id),userId:students[i]._id,dateKey:SEED_DATE,joinedAt:join,leftAt:left,minutes,reconnectCount:i%5===0?1:0,lastJoinedAt:join,status,lastCheckedAt:left,manualNote:'',checkpoints:join?[{minute:10,at:new Date(join.getTime()+8*60000),state:status},{minute:20,at:new Date(join.getTime()+18*60000),state:status}]:[]})}}

await upsert(messages,{senderId:teachers[0]._id,recipientId:sDI[0]._id,subject:'Bugungi 7-oktabr darslari'},{senderId:teachers[0]._id,recipientId:sDI[0]._id,subject:'Bugungi 7-oktabr darslari',body:'Bugun jonli darslar, videomavzular va proktoring testini sinab ko‘ramiz.',emailStatus:'not_configured'});
await upsert(messages,{senderId:teachers[4]._id,recipientId:sAI[0]._id,subject:'AI proktoring testi'},{senderId:teachers[4]._id,recipientId:sAI[0]._id,subject:'AI proktoring testi',body:'Kamera va fullscreen ruxsatlarini yoqib PROKTORING TEST orqali nazoratni tekshiring.',emailStatus:'not_configured'});
await upsert(finalExams,{groupId:gDI._id,academicYear:ACADEMIC_YEAR,semester:1,type:'semester_final',courseId:rows.DI[0]._id,startsAt:future(13,9)},{type:'semester_final',title:'Dasturlash asoslari · semestr nazorati',courseId:rows.DI[0]._id,groupId:gDI._id,academicYear:ACADEMIC_YEAR,semester:1,startsAt:future(13,9),endsAt:future(13,11),location:'QarDTU',room:'DEMO-101',inPerson:true,invigilatorIds:[teachers[0]._id],status:'planned',createdBy:teachers[0]._id});
await upsert(finalExams,{groupId:gAI._id,academicYear:ACADEMIC_YEAR,semester:1,type:'semester_final',courseId:rows.AI[0]._id,startsAt:future(13,12)},{type:'semester_final',title:'Sun’iy intellekt asoslari · semestr nazorati',courseId:rows.AI[0]._id,groupId:gAI._id,academicYear:ACADEMIC_YEAR,semester:1,startsAt:future(13,12),endsAt:future(13,14),location:'QarDTU',room:'DEMO-102',inPerson:true,invigilatorIds:[teachers[4]._id],status:'planned',createdBy:teachers[4]._id});
await settings.updateOne({key:'primary'},{$set:{'modules.live':true,'modules.videos':true,'modules.analytics':true,'modules.reports':true,'modules.library':true,'modules.communications':true,'modules.curriculum':true,'modules.finalExams':true,'modules.scorm':true,'modules.proctoring':true,'modules.publicTimetable':true,updatedAt:now},$setOnInsert:{key:'primary',createdAt:now}},{upsert:true});
await audits.insertOne({_id:oid(),actorLogin:'seed-inspection',actorName:'Inspection Seed',action:'INSPECTION_SEED',entity:'System',entityId:SEED_DATE,ip:'127.0.0.1',meta:{groups:[gDI.externalId,gAI.externalId],students:40,teachers:teachers.length,courses:8,schedules:20,proctoredQuizzes:proctorCount},createdAt:now,updatedAt:now});

const creds=[['role','login','password','scope'],...sDI.map(x=>['student',x.login,STUDENT_PASSWORD,gDI.externalId]),...sAI.map(x=>['student',x.login,STUDENT_PASSWORD,gAI.externalId]),...teachers.map((x,i)=>['teacher',x.login,TEACHER_PASSWORD,i<4?gDI.externalId:gAI.externalId]),...staff.map(x=>[x.role,x.login,STAFF_PASSWORD,'demo'])];
const csv=creds.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n'),credentialsFile=path.resolve(process.cwd(),'inspection-seed-credentials.csv');fs.writeFileSync(credentialsFile,csv,{mode:0o600});
console.log(JSON.stringify({seedDate:SEED_DATE,weekday:WEEKDAY,groups:[gDI.externalId,gAI.externalId],students:40,teachers:teachers.length,staff:staff.length,courses:8,schedules:20,videoLessons:videoCount,quizzes:quizCount,proctoredQuizzes:proctorCount,assignments:assignmentCount,credentialsFile},null,2));
await mongoose.disconnect();
