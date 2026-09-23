// Academic records are server-side. Every write checks the course membership.
import { installScorm } from './scorm.js';
import { installResourceUploads } from './resource-upload.js';
import { installAcademicRecords } from './academic-records.js';
import { installLibrary } from './library.js';
export function installLms(app,{mongoose,User,Structure,auth,audit,hasPermission,resolveUserGroupId}) {
  const id=mongoose.Schema.Types.ObjectId;
  const courseSchema=new mongoose.Schema({code:{type:String,required:true,trim:true},title:{type:String,required:true,trim:true},language:{type:String,required:true},syllabusUrl:String,credits:{type:Number,min:0},teacherId:{type:id,ref:'User',required:true},groupId:{type:id,ref:'Structure',required:true},active:{type:Boolean,default:true}}, {timestamps:true});
  courseSchema.index({code:1,groupId:1},{unique:true});
  const resourceSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},kind:{type:String,enum:['document','presentation','image','audio','video','archive','link'],required:true},url:String,fileId:{type:id},originalName:String,mimeType:String,size:Number,description:String,published:{type:Boolean,default:true},accessCount:{type:Number,default:0,min:0},lastAccessedAt:Date,createdBy:{type:id,ref:'User'}},{timestamps:true});
  const assignmentSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},category:{type:String,enum:['assignment','independent_work','practice'],default:'assignment',index:true},instructions:{type:String,required:true},dueAt:Date,maxScore:{type:Number,default:100,min:1,max:1000},published:{type:Boolean,default:true}},{timestamps:true});
  const submissionSchema=new mongoose.Schema({assignmentId:{type:id,ref:'Assignment',required:true},studentId:{type:id,ref:'User',required:true},text:String,url:String,submittedAt:Date,score:{type:Number,min:0},feedback:String,gradedBy:{type:id,ref:'User'},gradedAt:Date},{timestamps:true});
  submissionSchema.index({assignmentId:1,studentId:1},{unique:true});
  const quizSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},durationMinutes:{type:Number,min:1,max:240,default:30},maxAttempts:{type:Number,min:1,max:10,default:1},published:{type:Boolean,default:false},proctorRequired:{type:Boolean,default:false},questions:[{prompt:{type:String,required:true},options:[String],correctIndex:{type:Number,required:true,min:0}}]},{timestamps:true});
  const attemptSchema=new mongoose.Schema({quizId:{type:id,ref:'Quiz',required:true},studentId:{type:id,ref:'User',required:true},startedAt:{type:Date,default:Date.now},submittedAt:Date,answers:[Number],score:Number,proctorConsentAt:Date,proctorEvents:[{type:{type:String,enum:['page_hidden','window_blur','camera_unavailable','camera_ready','face_missing','multiple_faces','face_detector_unavailable','microphone_unavailable','ambient_sound']},at:Date}],reviewDecision:{type:String,enum:['pending','cleared','needs_review'],default:'pending'},reviewedBy:{type:id,ref:'User'},reviewedAt:Date,reviewNote:String},{timestamps:true});
  const gradeChangeSchema=new mongoose.Schema({submissionId:{type:id,ref:'Submission',required:true},requestedBy:{type:id,ref:'User',required:true},oldScore:{type:Number,required:true},newScore:{type:Number,required:true},reason:{type:String,required:true},status:{type:String,enum:['pending','approved','rejected'],default:'pending'},reviewedBy:{type:id,ref:'User'},reviewedAt:Date,reviewNote:String},{timestamps:true});
  const Course=mongoose.model('Course',courseSchema),Resource=mongoose.model('Resource',resourceSchema),Assignment=mongoose.model('Assignment',assignmentSchema),Submission=mongoose.model('Submission',submissionSchema),Quiz=mongoose.model('Quiz',quizSchema),Attempt=mongoose.model('QuizAttempt',attemptSchema),GradeChange=mongoose.model('GradeChange',gradeChangeSchema);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const checkId=value=>{if(!mongoose.isValidObjectId(value))throw Object.assign(new Error('ID noto‘g‘ri'),{status:400})};
  const courseAccess=async(req,courseId,write=false)=>{
    checkId(courseId);const course=await Course.findById(courseId).lean();if(!course||!course.active)throw Object.assign(new Error('Fan topilmadi'),{status:404});
    const teacher=String(course.teacherId)===String(req.user._id);
    const admin=['superadmin','admin'].includes(req.user.role);
    const student=req.user.role==='student'&&String(await resolveUserGroupId(req.user))===String(course.groupId);
    if(!(teacher||admin||(!write&&student)))throw Object.assign(new Error('Bu fanga ruxsat yo‘q'),{status:403});
    return course;
  };
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){fail(res,e)}};
  installScorm(app,{mongoose,auth,audit,courseAccess});
  installResourceUploads(app,{mongoose,auth,audit,Resource,courseAccess});
  const academic=installAcademicRecords(app,{mongoose,User,Course,auth,audit,courseAccess,resolveUserGroupId});
  const library=installLibrary(app,{mongoose,User,Course,Resource,auth,audit,courseAccess,resolveUserGroupId});
  const url=value=>{const s=String(value||'').trim();if(!/^https:\/\//i.test(s)||s.length>2000)throw new Error('Faqat HTTPS havola qabul qilinadi');return s};
  app.get('/api/lms/courses',auth,wrap(async(req,res)=>{
    let filter={active:true};if(req.user.role==='student'){const groupId=await resolveUserGroupId(req.user);if(!groupId)return res.json([]);filter.groupId=groupId}
    else if(req.user.role==='teacher')filter.teacherId=req.user._id;
    else if(!['superadmin','admin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    res.json(await Course.find(filter).populate('teacherId','fullName login').populate('groupId','name externalId').sort({title:1}).lean());
  }));
  app.get('/api/lms/compliance',auth,wrap(async(req,res)=>{
    if(!['admin','superadmin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    const [courses,groups,students,resources,assignments,quizzes,studyPlans,finalResults,movements,libraryItems]=await Promise.all([
      Course.find({active:true}).populate('teacherId','fullName login').populate('groupId','name externalId').lean(),
      Structure.find({type:'group',active:true}).select('name externalId').lean(),
      User.find({role:'student',active:true,groupId:{$exists:true}}).select('_id groupId').lean(),
      Resource.aggregate([{$match:{published:true}},{$group:{_id:'$courseId',count:{$sum:1}}}]),
      Assignment.aggregate([{$match:{published:true}},{$group:{_id:'$courseId',count:{$sum:1}}}]),
      Quiz.aggregate([{$match:{published:true}},{$group:{_id:'$courseId',count:{$sum:1}}}]),
      academic.StudyPlan.countDocuments(),
      academic.CourseResult.countDocuments({status:'final'}),
      academic.StudentMovement.countDocuments(),
      library.LibraryItem.countDocuments({published:true})
    ]);
    const counts=rows=>new Map(rows.map(r=>[String(r._id),r.count]));const rc=counts(resources),ac=counts(assignments),qc=counts(quizzes);
    const enrolled=new Map();for(const student of students){const key=String(student.groupId);if(!enrolled.has(key))enrolled.set(key,new Set());enrolled.get(key).add(String(student._id))}
    const teaching=new Map();for(const course of courses){const teacher=String(course.teacherId?._id||course.teacherId);if(!teaching.has(teacher))teaching.set(teacher,{teacher:course.teacherId,students:new Set(),courseCount:0});const item=teaching.get(teacher);item.courseCount++;for(const student of enrolled.get(String(course.groupId?._id||course.groupId))||[])item.students.add(student)}
    res.json({generatedAt:new Date(),groupsWithoutCourses:groups.filter(g=>!courses.some(c=>String(c.groupId?._id||c.groupId)===String(g._id))).map(g=>({id:g._id,name:g.name,code:g.externalId})),courses:courses.map(c=>({id:c._id,title:c.title,code:c.code,group:c.groupId?.name,teacher:c.teacherId?.fullName,studentCount:enrolled.get(String(c.groupId?._id||c.groupId))?.size||0,checks:{syllabus:Boolean(c.syllabusUrl),resources:(rc.get(String(c._id))||0)>0,assignments:(ac.get(String(c._id))||0)>0,quizzes:(qc.get(String(c._id))||0)>0}})),teacherLoad:[...teaching.values()].map(t=>({teacher:t.teacher?.fullName||'',login:t.teacher?.login||'',uniqueStudents:t.students.size,courseCount:t.courseCount,aboveFifty:t.students.size>50})),academicRecords:{studyPlans,finalResults,movements},libraryItems});
  }));
  app.post('/api/lms/courses',auth,wrap(async(req,res)=>{
    if(!['superadmin','admin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    const {code,title,language,teacherId,groupId,credits,syllabusUrl}=req.body;
    checkId(teacherId);checkId(groupId);
    const [teacher,group]=await Promise.all([User.findOne({_id:teacherId,role:'teacher',active:true}),Structure.findOne({_id:groupId,type:'group',active:true})]);
    if(!teacher||!group)throw new Error('O‘qituvchi yoki guruh topilmadi');
    const row=await Course.create({code:String(code||'').trim(),title:String(title||'').trim(),language:String(language||'').trim(),teacherId,groupId,credits:Number(credits)||0,syllabusUrl:syllabusUrl?url(syllabusUrl):''});
    audit(req,'COURSE_CREATE','Course',row.id);res.status(201).json(row);
  }));
  app.get('/api/lms/courses/:id',auth,wrap(async(req,res)=>{
    const course=await courseAccess(req,req.params.id);
    const [resources,assignments,quizzes]=await Promise.all([Resource.find({courseId:course._id,published:true}).lean(),Assignment.find({courseId:course._id,published:true}).lean(),Quiz.find({courseId:course._id,published:true}).select('-questions.correctIndex').lean()]);
    res.json({course,resources,assignments,quizzes});
  }));
  app.post('/api/lms/courses/:id/resources',auth,wrap(async(req,res)=>{
    await courseAccess(req,req.params.id,true);const row=await Resource.create({courseId:req.params.id,title:String(req.body.title||'').trim(),kind:req.body.kind,url:url(req.body.url),description:String(req.body.description||'').slice(0,4000),createdBy:req.user._id});audit(req,'RESOURCE_CREATE','Resource',row.id);res.status(201).json(row);
  }));
  app.post('/api/lms/courses/:id/assignments',auth,wrap(async(req,res)=>{
    await courseAccess(req,req.params.id,true);const category=['assignment','independent_work','practice'].includes(req.body.category)?req.body.category:'assignment';const row=await Assignment.create({courseId:req.params.id,title:String(req.body.title||'').trim(),category,instructions:String(req.body.instructions||'').trim(),dueAt:req.body.dueAt||undefined,maxScore:Number(req.body.maxScore)||100});audit(req,'ASSIGNMENT_CREATE','Assignment',row.id);res.status(201).json(row);
  }));
  app.post('/api/lms/assignments/:id/submit',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Faqat talaba topshiradi'});checkId(req.params.id);const assignment=await Assignment.findById(req.params.id);if(!assignment||!assignment.published)throw Object.assign(new Error('Topshiriq topilmadi'),{status:404});await courseAccess(req,assignment.courseId);
    if(assignment.dueAt&&new Date()>assignment.dueAt)return res.status(409).json({message:'Topshirish muddati tugagan'});
    const text=String(req.body.text||'').trim().slice(0,15000),link=req.body.url?url(req.body.url):'';if(!text&&!link)throw new Error('Javob yoki havola kiriting');
    const existing=await Submission.findOne({assignmentId:assignment._id,studentId:req.user._id});if(existing?.gradedAt)return res.status(409).json({message:'Baholangan javob o‘zgartirilmaydi'});
    const row=await Submission.findOneAndUpdate({assignmentId:assignment._id,studentId:req.user._id},{$set:{text,url:link,submittedAt:new Date()}},{upsert:true,new:true,runValidators:true});audit(req,'ASSIGNMENT_SUBMIT','Submission',row.id);res.json(row);
  }));
  app.get('/api/lms/assignments/:id/submissions',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const assignment=await Assignment.findById(req.params.id);if(!assignment)throw Object.assign(new Error('Topshiriq topilmadi'),{status:404});await courseAccess(req,assignment.courseId,req.user.role!=='student');
    const filter={assignmentId:assignment._id};if(req.user.role==='student')filter.studentId=req.user._id;
    res.json(await Submission.find(filter).populate('studentId','fullName login').lean());
  }));
  app.patch('/api/lms/submissions/:id/grade',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const submission=await Submission.findById(req.params.id);if(!submission)throw Object.assign(new Error('Javob topilmadi'),{status:404});const assignment=await Assignment.findById(submission.assignmentId);await courseAccess(req,assignment.courseId,true);
    const score=Number(req.body.score);if(!Number.isFinite(score)||score<0||score>assignment.maxScore)throw new Error('Baho chegaradan tashqarida');
    if(submission.gradedAt)return res.status(409).json({message:'Baho tuzatish uchun alohida tasdiqlash jarayoni talab qilinadi'});
    submission.score=score;submission.feedback=String(req.body.feedback||'').slice(0,3000);submission.gradedBy=req.user._id;submission.gradedAt=new Date();await submission.save();audit(req,'GRADE_CREATE','Submission',submission.id,{score});res.json(submission);
  }));
  app.post('/api/lms/submissions/:id/grade-change',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const submission=await Submission.findById(req.params.id);if(!submission?.gradedAt)return res.status(409).json({message:'Avval dastlabki bahoni qo‘ying'});
    const assignment=await Assignment.findById(submission.assignmentId);await courseAccess(req,assignment.courseId,true);
    const newScore=Number(req.body.newScore),reason=String(req.body.reason||'').trim();if(!Number.isFinite(newScore)||newScore<0||newScore>assignment.maxScore||reason.length<10)throw new Error('Yangi ball va kamida 10 belgili sabab kiriting');
    if(await GradeChange.exists({submissionId:submission._id,status:'pending'}))return res.status(409).json({message:'Oldingi so‘rov ko‘rib chiqilmoqda'});
    const change=await GradeChange.create({submissionId:submission._id,requestedBy:req.user._id,oldScore:submission.score,newScore,reason});audit(req,'GRADE_CHANGE_REQUEST','GradeChange',change.id,{submissionId:submission.id,oldScore:submission.score,newScore});res.status(201).json(change);
  }));
  app.get('/api/lms/grade-changes',auth,wrap(async(req,res)=>{
    if(!['admin','superadmin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    res.json(await GradeChange.find({status:'pending'}).populate('requestedBy','fullName login').sort({createdAt:1}).limit(200).lean());
  }));
  app.post('/api/lms/grade-changes/:id/review',auth,wrap(async(req,res)=>{
    if(!['admin','superadmin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});checkId(req.params.id);
    const change=await GradeChange.findById(req.params.id);if(!change||change.status!=='pending')return res.status(409).json({message:'Faol so‘rov topilmadi'});
    if(String(change.requestedBy)===String(req.user._id))return res.status(403).json({message:'O‘z so‘rovingizni tasdiqlay olmaysiz'});
    const decision=String(req.body.decision||'');if(!['approved','rejected'].includes(decision))throw new Error('Qaror noto‘g‘ri');
    const submission=await Submission.findById(change.submissionId);if(!submission||submission.score!==change.oldScore)return res.status(409).json({message:'Baho o‘zgargan, so‘rovni qayta kiriting'});
    // MongoDB transaction should be enabled for production replica sets; the conditional write prevents stale approvals.
    if(decision==='approved'){const updated=await Submission.updateOne({_id:submission._id,score:change.oldScore},{$set:{score:change.newScore,gradedBy:req.user._id,gradedAt:new Date()}});if(!updated.modifiedCount)return res.status(409).json({message:'Baho boshqa joyda o‘zgargan'})}
    change.status=decision;change.reviewedBy=req.user._id;change.reviewedAt=new Date();change.reviewNote=String(req.body.note||'').slice(0,1000);await change.save();audit(req,'GRADE_CHANGE_'+decision.toUpperCase(),'GradeChange',change.id,{oldScore:change.oldScore,newScore:change.newScore});res.json(change);
  }));
  app.post('/api/lms/courses/:id/quizzes',auth,wrap(async(req,res)=>{
    await courseAccess(req,req.params.id,true);const questions=req.body.questions;if(!Array.isArray(questions)||!questions.length||questions.length>100)throw new Error('1–100 savol kiriting');
    for(const q of questions)if(!Array.isArray(q.options)||q.options.length<2||q.options.length>8||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=q.options.length)throw new Error('Savol variantlari noto‘g‘ri');
    const row=await Quiz.create({courseId:req.params.id,title:String(req.body.title||'').trim(),questions,durationMinutes:req.body.durationMinutes||30,maxAttempts:req.body.maxAttempts||1,published:Boolean(req.body.published),proctorRequired:Boolean(req.body.proctorRequired)});audit(req,'QUIZ_CREATE','Quiz',row.id);res.status(201).json({id:row.id});
  }));
  app.post('/api/lms/quizzes/:id/start',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Faqat talaba topshiradi'});checkId(req.params.id);const quiz=await Quiz.findById(req.params.id);if(!quiz?.published)throw Object.assign(new Error('Test topilmadi'),{status:404});await courseAccess(req,quiz.courseId);
    const count=await Attempt.countDocuments({quizId:quiz._id,studentId:req.user._id});if(count>=quiz.maxAttempts)return res.status(409).json({message:'Urinishlar tugagan'});
    if(quiz.proctorRequired&&req.body.consent!==true)return res.status(400).json({message:'Kamera va imtihon oynasini kuzatish haqida xabardor bo‘lib rozilik bering'});
    const row=await Attempt.create({quizId:quiz._id,studentId:req.user._id,proctorConsentAt:quiz.proctorRequired?new Date():undefined});audit(req,'QUIZ_START','QuizAttempt',row.id);res.status(201).json({attemptId:row.id,startedAt:row.startedAt,durationMinutes:quiz.durationMinutes,proctorRequired:quiz.proctorRequired,questions:quiz.questions.map(q=>({id:q.id,prompt:q.prompt,options:q.options}))});
  }));
  app.post('/api/lms/attempts/:id/proctor-events',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const type=String(req.body.type||'');const allowed=['page_hidden','window_blur','camera_unavailable','camera_ready','face_missing','multiple_faces','face_detector_unavailable','microphone_unavailable','ambient_sound'];
    if(!allowed.includes(type))throw new Error('Hodisa turi noto‘g‘ri');const row=await Attempt.findOne({_id:req.params.id,studentId:req.user._id,submittedAt:null,proctorConsentAt:{$exists:true}});if(!row)return res.status(403).json({message:'Faol nazorat sessiyasi yo‘q'});
    const quiz=await Quiz.findById(row.quizId).select('durationMinutes');if(!quiz||Date.now()-row.startedAt.getTime()>(quiz.durationMinutes*60+30)*1000)return res.status(409).json({message:'Imtihon tugagan'});
    if(row.proctorEvents.length>=200)return res.status(429).json({message:'Hodisa chegarasi tugadi'});
    const last=row.proctorEvents.at(-1);if(last?.type===type&&Date.now()-last.at.getTime()<10000)return res.json({ok:true});
    row.proctorEvents.push({type,at:new Date()});await row.save();res.json({ok:true});
  }));
  app.get('/api/lms/quizzes/:id/attempts',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const quiz=await Quiz.findById(req.params.id).select('-questions');if(!quiz)return res.status(404).json({message:'Test topilmadi'});await courseAccess(req,quiz.courseId,true);
    res.json(await Attempt.find({quizId:quiz._id,submittedAt:{$ne:null}}).select('-answers').populate('studentId','fullName login').sort({startedAt:-1}).limit(500).lean());
  }));
  app.patch('/api/lms/attempts/:id/review',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const row=await Attempt.findById(req.params.id);if(!row?.submittedAt)return res.status(404).json({message:'Yakunlangan urinish topilmadi'});const quiz=await Quiz.findById(row.quizId);await courseAccess(req,quiz.courseId,true);
    if(!['cleared','needs_review'].includes(req.body.decision))throw new Error('Qaror noto‘g‘ri');
    row.reviewDecision=req.body.decision;row.reviewedBy=req.user._id;row.reviewedAt=new Date();row.reviewNote=String(req.body.note||'').slice(0,1000);await row.save();audit(req,'PROCTOR_REVIEW','QuizAttempt',row.id,{decision:row.reviewDecision});res.json({ok:true});
  }));
  app.post('/api/lms/attempts/:id/submit',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const row=await Attempt.findById(req.params.id);if(!row||String(row.studentId)!==String(req.user._id))return res.status(404).json({message:'Urinish topilmadi'});
    if(row.submittedAt)return res.status(409).json({message:'Test allaqachon yakunlangan'});const quiz=await Quiz.findById(row.quizId);if(!quiz)throw new Error('Test topilmadi');
    if(Date.now()-row.startedAt.getTime()>(quiz.durationMinutes*60+30)*1000)return res.status(409).json({message:'Test vaqti tugagan; urinish baholanmaydi'});
    const answers=req.body.answers;if(!Array.isArray(answers)||answers.length!==quiz.questions.length||answers.some((x,i)=>!Number.isInteger(x)||x<0||x>=quiz.questions[i].options.length))throw new Error('Javoblar noto‘g‘ri');
    row.answers=answers;row.score=quiz.questions.reduce((n,q,i)=>n+Number(q.correctIndex===answers[i]),0)/quiz.questions.length*100;row.submittedAt=new Date();await row.save();audit(req,'QUIZ_SUBMIT','QuizAttempt',row.id,{score:row.score,late:row.submittedAt-row.startedAt>quiz.durationMinutes*60000});res.json({score:row.score,submittedAt:row.submittedAt});
  }));
}
