// Academic records are server-side. Every write checks the course membership.
import { installScorm } from './scorm.js';
export function installLms(app,{mongoose,User,Structure,auth,audit,hasPermission,resolveUserGroupId}) {
  const id=mongoose.Schema.Types.ObjectId;
  const courseSchema=new mongoose.Schema({code:{type:String,required:true,trim:true},title:{type:String,required:true,trim:true},language:{type:String,required:true},syllabusUrl:String,credits:{type:Number,min:0},teacherId:{type:id,ref:'User',required:true},groupId:{type:id,ref:'Structure',required:true},active:{type:Boolean,default:true}}, {timestamps:true});
  courseSchema.index({code:1,groupId:1},{unique:true});
  const resourceSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},kind:{type:String,enum:['document','video','link'],required:true},url:{type:String,required:true},description:String,published:{type:Boolean,default:true},createdBy:{type:id,ref:'User'}},{timestamps:true});
  const assignmentSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},instructions:{type:String,required:true},dueAt:Date,maxScore:{type:Number,default:100,min:1,max:1000},published:{type:Boolean,default:true}},{timestamps:true});
  const submissionSchema=new mongoose.Schema({assignmentId:{type:id,ref:'Assignment',required:true},studentId:{type:id,ref:'User',required:true},text:String,url:String,submittedAt:Date,score:{type:Number,min:0},feedback:String,gradedBy:{type:id,ref:'User'},gradedAt:Date},{timestamps:true});
  submissionSchema.index({assignmentId:1,studentId:1},{unique:true});
  const quizSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},durationMinutes:{type:Number,min:1,max:240,default:30},maxAttempts:{type:Number,min:1,max:10,default:1},published:{type:Boolean,default:false},questions:[{prompt:{type:String,required:true},options:[String],correctIndex:{type:Number,required:true,min:0}}]},{timestamps:true});
  const attemptSchema=new mongoose.Schema({quizId:{type:id,ref:'Quiz',required:true},studentId:{type:id,ref:'User',required:true},startedAt:{type:Date,default:Date.now},submittedAt:Date,answers:[Number],score:Number,proctorEvents:[{type:String,at:Date,detail:String}]},{timestamps:true});
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
  const url=value=>{const s=String(value||'').trim();if(!/^https:\/\//i.test(s)||s.length>2000)throw new Error('Faqat HTTPS havola qabul qilinadi');return s};
  app.get('/api/lms/courses',auth,wrap(async(req,res)=>{
    let filter={active:true};if(req.user.role==='student'){const groupId=await resolveUserGroupId(req.user);if(!groupId)return res.json([]);filter.groupId=groupId}
    else if(req.user.role==='teacher')filter.teacherId=req.user._id;
    else if(!['superadmin','admin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    res.json(await Course.find(filter).populate('teacherId','fullName login').populate('groupId','name externalId').sort({title:1}).lean());
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
    await courseAccess(req,req.params.id,true);const row=await Assignment.create({courseId:req.params.id,title:String(req.body.title||'').trim(),instructions:String(req.body.instructions||'').trim(),dueAt:req.body.dueAt||undefined,maxScore:Number(req.body.maxScore)||100});audit(req,'ASSIGNMENT_CREATE','Assignment',row.id);res.status(201).json(row);
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
    const row=await Quiz.create({courseId:req.params.id,title:String(req.body.title||'').trim(),questions,durationMinutes:req.body.durationMinutes||30,maxAttempts:req.body.maxAttempts||1,published:Boolean(req.body.published)});audit(req,'QUIZ_CREATE','Quiz',row.id);res.status(201).json({id:row.id});
  }));
  app.post('/api/lms/quizzes/:id/start',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Faqat talaba topshiradi'});checkId(req.params.id);const quiz=await Quiz.findById(req.params.id);if(!quiz?.published)throw Object.assign(new Error('Test topilmadi'),{status:404});await courseAccess(req,quiz.courseId);
    const count=await Attempt.countDocuments({quizId:quiz._id,studentId:req.user._id});if(count>=quiz.maxAttempts)return res.status(409).json({message:'Urinishlar tugagan'});
    const row=await Attempt.create({quizId:quiz._id,studentId:req.user._id});audit(req,'QUIZ_START','QuizAttempt',row.id);res.status(201).json({attemptId:row.id,startedAt:row.startedAt,durationMinutes:quiz.durationMinutes,questions:quiz.questions.map(q=>({id:q.id,prompt:q.prompt,options:q.options}))});
  }));
  app.post('/api/lms/attempts/:id/submit',auth,wrap(async(req,res)=>{
    checkId(req.params.id);const row=await Attempt.findById(req.params.id);if(!row||String(row.studentId)!==String(req.user._id))return res.status(404).json({message:'Urinish topilmadi'});
    if(row.submittedAt)return res.status(409).json({message:'Test allaqachon yakunlangan'});const quiz=await Quiz.findById(row.quizId);if(!quiz)throw new Error('Test topilmadi');
    if(Date.now()-row.startedAt.getTime()>(quiz.durationMinutes*60+30)*1000)return res.status(409).json({message:'Test vaqti tugagan; urinish baholanmaydi'});
    const answers=req.body.answers;if(!Array.isArray(answers)||answers.length!==quiz.questions.length||answers.some((x,i)=>!Number.isInteger(x)||x<0||x>=quiz.questions[i].options.length))throw new Error('Javoblar noto‘g‘ri');
    row.answers=answers;row.score=quiz.questions.reduce((n,q,i)=>n+Number(q.correctIndex===answers[i]),0)/quiz.questions.length*100;row.submittedAt=new Date();await row.save();audit(req,'QUIZ_SUBMIT','QuizAttempt',row.id,{score:row.score,late:row.submittedAt-row.startedAt>quiz.durationMinutes*60000});res.json({score:row.score,submittedAt:row.submittedAt});
  }));
}
