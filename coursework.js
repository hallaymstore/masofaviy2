import path from 'node:path';
import Busboy from 'busboy';
import {pipeline} from 'node:stream/promises';
import {checkResourceHeader,validateOfficePackage} from './resource-upload.js';
import {journalPeriod,buildJournal,journalCsv} from './coursework-rules.js';
import {personalGradePeriod,buildPersonalGradebook} from './personal-grades.js';
export function installCoursework(app,{mongoose,User,Structure,Schedule,Course,Assignment,Submission,auth,audit,resolveUserGroupId}){
 const oid=mongoose.Schema.Types.ObjectId;
 const fileSchema=new mongoose.Schema({assignmentId:{type:oid,required:true,index:true},courseId:{type:oid,required:true},submissionId:{type:oid,default:null},uploadedBy:{type:oid,required:true},fileId:{type:oid,unique:true,required:true},name:{type:String,required:true},mimeType:String,size:Number,kind:String},{timestamps:true});
 fileSchema.index({assignmentId:1,uploadedBy:1});
 const File=mongoose.models.CourseworkFile||mongoose.model('CourseworkFile',fileSchema);
 const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'edu_coursework'});
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const valid=x=>{if(!mongoose.isValidObjectId(x))throw fail('ID noto‘g‘ri')};
 const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'Bajarilmadi'});else res.destroy()}};
 async function access(req,c,write=false){
  const role=req.user.role;
  if(role==='student'){
   if(write||String(await resolveUserGroupId(req.user))!==String(c.groupId))throw fail('Guruhga ruxsat yo‘q',403);
  }else if(role==='teacher'){
   if(String(c.teacherId)!==String(req.user._id))throw fail('Bu fan sizga biriktirilmagan',403);
  }else if(['admin','superadmin','rectorate'].includes(role)){
   if(write&&role==='rectorate')throw fail('Faqat ko‘rish',403);
  }else if(['dean','department','tutor'].includes(role)){
   if(write)throw fail('Faqat ko‘rish',403);
   const group=await Structure.findById(c.groupId?._id||c.groupId).lean();
   const dept=group?.parentId?await Structure.findById(group.parentId).lean():null;
   const same=(a,b)=>Boolean(a&&b&&String(a)===String(b));
   if(!(same(req.user.groupId,group?._id)||same(req.user.departmentId,dept?._id)||same(req.user.facultyId,dept?.parentId)))throw fail('Guruh vakolat doirasida emas',403);
  }else throw fail('Ruxsat yo‘q',403);
 }
 async function course(req,cid,write=false){
  valid(cid);const c=await Course.findOne({_id:cid,active:true}).lean();
  if(!c)throw fail('Fan topilmadi',404);
  await access(req,c,write);return c;
 }
 async function assignment(req,aid,write=false){
  valid(aid);const a=await Assignment.findOne({_id:aid,published:true}).lean();
  if(!a)throw fail('Topshiriq topilmadi',404);
  const c=await course(req,a.courseId,write);return {a,c};
 }
 app.get('/api/coursework/teacher-groups',auth,wrap(async(req,res)=>{
  if(req.user.role!=='teacher')throw fail('Faqat o‘qituvchi',403);
  const schedule=await Schedule.find({teacherId:req.user._id}).select('groupId subject title').limit(300).lean();
  const ids=[...new Set(schedule.map(s=>String(s.groupId)))].filter(mongoose.isValidObjectId);
  const groups=await Structure.find({_id:{$in:ids},type:'group',active:true}).select('name externalId code').lean();
  const groupMap=new Map(groups.map(g=>[String(g._id),g]));
  res.json(schedule.filter(s=>groupMap.has(String(s.groupId))).map(s=>({groupId:String(s.groupId),groupName:groupMap.get(String(s.groupId)).name,subject:String(s.subject||s.title||'Fan').slice(0,100)}))
    .filter((s,i,arr)=>arr.findIndex(x=>x.groupId===s.groupId&&x.subject===s.subject)===i));
 }));
 app.post('/api/coursework/teacher-courses',auth,wrap(async(req,res)=>{
  if(req.user.role!=='teacher')throw fail('Faqat o‘qituvchi',403);
  valid(req.body?.groupId);
  const group=await Structure.findOne({_id:req.body.groupId,type:'group',active:true}).lean();
  if(!group||!await Schedule.exists({groupId:group._id,teacherId:req.user._id}))throw fail('Sizga guruh darsi biriktirilmagan',403);
  const title=String(req.body?.title||'').trim().slice(0,120);
  if(title.length<3)throw fail('Fan nomi kamida 3 belgi');
  const same=await Course.findOne({teacherId:req.user._id,groupId:group._id,title,active:true}).lean();
  if(same)return res.json(same);
  const code='TC-'+String(req.user._id).slice(-6)+'-'+String(group._id).slice(-6)+'-'+Date.now().toString(36);
  const row=await Course.create({code,title,language:'uz',credits:0,teacherId:req.user._id,groupId:group._id,active:true});
  audit(req,'TEACHER_COURSE_CREATE','Course',row.id,{groupId:String(group._id)});
  res.status(201).json(row);
 }));
 app.get('/api/coursework/assignments/:id/files',auth,wrap(async(req,res)=>{
  const {a}=await assignment(req,req.params.id);
  const filter={assignmentId:a._id};
  if(req.user.role==='student')filter.$or=[{submissionId:null},{uploadedBy:req.user._id}];
  res.json(await File.find(filter).sort({createdAt:1}).lean());
 }));
 app.post('/api/coursework/assignments/:id/files',auth,wrap(async(req,res)=>{
  if(mongoose.connection.readyState!==1)throw fail('Fayl bazasi ulanmagan',503);
  const student=req.user.role==='student';
  if(!student&&!['teacher','admin','superadmin'].includes(req.user.role))throw fail('Yuklash huquqi yo‘q',403);
  const {a,c}=await assignment(req,req.params.id,!student);
  if(student&&a.dueAt&&new Date()>new Date(a.dueAt))throw fail('Muddat tugagan',409);
  if(!/^multipart\/form-data\s*;/i.test(req.headers['content-type']||''))throw fail('multipart/form-data kerak',415);
  const old=student?await Submission.findOne({assignmentId:a._id,studentId:req.user._id}):null;
  if(old?.gradedAt)throw fail('Baholangan javobni o‘zgartirib bo‘lmaydi',409);
  if(await File.countDocuments({assignmentId:a._id,uploadedBy:req.user._id})>=8)throw fail('8 tagacha fayl',409);
  let gridId=null,writing=null,received=0,head=Buffer.alloc(0),problem=null,name='';
  const maxBytes=Math.min(150,Math.max(1,Number(process.env.MAX_COURSEWORK_FILE_MB)||100))*1024*1024;
  try{
   const parser=Busboy({headers:req.headers,limits:{files:1,fields:0,parts:1,fileSize:maxBytes}});
   parser.on('file',(_,stream,info)=>{
    if(writing){stream.resume();problem=fail('Bitta fayl yuboring');return}
    name=path.basename(String(info.filename||'')).slice(0,180);
    if(!name){stream.resume();problem=fail('Fayl nomi kerak');return}
    const dest=bucket().openUploadStream(name,{metadata:{assignmentId:String(a._id),uploadedBy:String(req.user._id)}});
    gridId=dest.id;
    stream.on('data',chunk=>{received+=chunk.length;if(head.length<8192)head=Buffer.concat([head,chunk.subarray(0,8192-head.length)])});
    stream.on('limit',()=>{problem=fail('Fayl juda katta',413)});
    writing=pipeline(stream,dest).catch(e=>{problem=problem||e});
   });
   await new Promise((resolve,reject)=>{parser.once('finish',resolve);parser.once('error',reject);req.pipe(parser)});
   if(!writing)throw fail('Fayl tanlanmagan');
   await writing;if(problem)throw problem;if(!received)throw fail('Bo‘sh fayl');
   const type=await checkResourceHeader(name,head);
   await validateOfficePackage(bucket().openDownloadStream(gridId),type.extension,received);
   const sub=student?await Submission.findOneAndUpdate({assignmentId:a._id,studentId:req.user._id},{$setOnInsert:{submittedAt:new Date()}},{upsert:true,new:true,runValidators:true}):null;
   if(sub?.gradedAt)throw fail('Baholangan javob',409);
   const row=await File.create({assignmentId:a._id,courseId:c._id,submissionId:sub?._id||null,uploadedBy:req.user._id,fileId:gridId,name,mimeType:type.mimeType,size:received,kind:type.kind});
   audit(req,student?'STUDENT_WORK_UPLOAD':'TEACHER_TASK_FILE','CourseworkFile',row.id,{size:received});
   res.status(201).json({_id:row.id,name:row.name,size:row.size,kind:row.kind});
  }catch(e){if(gridId)await bucket().delete(gridId).catch(()=>{});throw e}
 }));
 app.get('/api/coursework/files/:id',auth,wrap(async(req,res)=>{
  valid(req.params.id);const row=await File.findById(req.params.id).lean();if(!row)throw fail('Fayl topilmadi',404);
  await assignment(req,row.assignmentId);
  if(req.user.role==='student'&&row.submissionId&&String(row.uploadedBy)!==String(req.user._id))throw fail('Ruxsat yo‘q',403);
  res.set('Cache-Control','private,no-store');res.set('X-Content-Type-Options','nosniff');res.set('Content-Type',row.mimeType);
  res.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(row.name));
  res.set('Content-Length',String(row.size));
  const stream=bucket().openDownloadStream(row.fileId);
  stream.on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy()});stream.pipe(res);
 }));
 app.get('/api/coursework/my-grades',auth,wrap(async(req,res)=>{
  if(req.user.role!=='student')throw fail('Faqat talabaning shaxsiy baholari',403);
  // No student ID is accepted from query/body: always use the authenticated session.
  const groupId=await resolveUserGroupId(req.user);
  if(!groupId)return res.json(buildPersonalGradebook({period:personalGradePeriod(req.query.period||'all',req.query.from||'')}));
  const period=personalGradePeriod(req.query.period||'all',req.query.from||'');
  const courses=await Course.find({active:true,groupId}).select('_id title active teacherId').populate('teacherId','fullName').limit(400).lean();
  const courseIds=courses.map(c=>c._id);
  const assignments=courseIds.length?
    await Assignment.find({courseId:{$in:courseIds},published:true}).select('_id courseId title gradeScale maxScore category published').limit(3000).lean():[];
  const ids=assignments.map(a=>a._id);
  const submissions=ids.length?
    await Submission.find({studentId:req.user._id,assignmentId:{$in:ids}})
      .select('assignmentId studentId submittedAt gradedAt score feedback')
      .sort({gradedAt:-1,submittedAt:-1}).limit(801).lean():[];
  res.set('Cache-Control','private,no-store');
  const result=buildPersonalGradebook({courses,assignments,submissions:submissions.slice(0,800),period});
  res.json({...result,truncated:submissions.length>800});
 }));
 app.get('/api/coursework/journals',auth,wrap(async(req,res)=>{
  if(req.user.role==='student')throw fail('Faqat o‘qituvchi va boshqaruv',403);
  const filter={active:true};if(req.user.role==='teacher')filter.teacherId=req.user._id;
  if(req.query.courseId){valid(req.query.courseId);filter._id=req.query.courseId}
  if(req.query.groupId){valid(req.query.groupId);filter.groupId=req.query.groupId}
  const courses=await Course.find(filter).populate('groupId','name externalId code').select('title code teacherId groupId').limit(400).lean();
  const allowed=[];
  for(const c of courses)try{await access(req,c);allowed.push(c)}catch{}
  res.json(allowed.map(c=>({id:String(c._id),title:c.title,code:c.code,group:{id:String(c.groupId?._id||c.groupId),name:c.groupId?.name||'',code:c.groupId?.externalId||c.groupId?.code||''}})));
 }));
 app.get('/api/coursework/journal/:courseId',auth,wrap(async(req,res)=>{
  if(req.user.role==='student')throw fail('Faqat o‘qituvchi va boshqaruv',403);
  const c=await course(req,req.params.courseId);
  const period=journalPeriod(req.query.period||'week',req.query.from||'');
  const group=await Structure.findById(c.groupId?._id||c.groupId).lean();if(!group)throw fail('Guruh topilmadi',404);
  const assignments=await Assignment.find({courseId:c._id,published:true,createdAt:{$gte:period.from,$lt:period.to}}).sort({createdAt:1}).limit(150).lean();
  const students=await User.find({role:'student',active:true,groupId:c.groupId}).select('fullName login').sort({fullName:1}).limit(500).lean();
  const submissions=assignments.length?await Submission.find({assignmentId:{$in:assignments.map(a=>a._id)},studentId:{$in:students.map(s=>s._id)}}).lean():[];
  const result=buildJournal({group,course:c,assignments,students,submissions,period});
  if(req.query.format==='csv'){
   res.set('Cache-Control','private,no-store');res.set('Content-Type','text/csv; charset=utf-8');
   res.set('Content-Disposition','attachment; filename="journal-'+period.label+'-'+String(c._id).slice(-6)+'.csv"');
   return res.send(journalCsv(result));
  }
  res.json(result);
 }));
}