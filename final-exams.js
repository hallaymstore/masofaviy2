import { normalizeAcademicYear } from './academic-records.js';

export function installFinalExams(app,{mongoose,User,Structure,Course,CourseResult,auth,audit,courseAccess,resolveUserGroupId}){
  const id=mongoose.Schema.Types.ObjectId;
  const sessionSchema=new mongoose.Schema({
    type:{type:String,enum:['semester_final','state_attestation','thesis_defense'],required:true,index:true},
    title:{type:String,required:true,trim:true,maxlength:300},
    courseId:{type:id,ref:'Course'},
    groupId:{type:id,ref:'Structure',required:true,index:true},
    academicYear:{type:String,required:true,index:true},
    semester:{type:Number,min:1,max:12,required:true},
    startsAt:{type:Date,required:true,index:true},endsAt:{type:Date,required:true},
    location:{type:String,required:true,trim:true,maxlength:300},room:{type:String,trim:true,maxlength:120},
    inPerson:{type:Boolean,default:true,immutable:true},
    invigilatorIds:[{type:id,ref:'User'}],
    status:{type:String,enum:['planned','in_progress','completed','cancelled'],default:'planned',index:true},
    createdBy:{type:id,ref:'User',required:true},completedBy:{type:id,ref:'User'},completedAt:Date
  },{timestamps:true});
  sessionSchema.index({groupId:1,academicYear:1,semester:1,type:1,courseId:1,startsAt:1});
  const recordSchema=new mongoose.Schema({
    sessionId:{type:id,ref:'FinalExamSession',required:true,index:true},
    studentId:{type:id,ref:'User',required:true,index:true},
    attendance:{type:String,enum:['present','absent','excused'],required:true},
    identityDocumentChecked:{type:Boolean,default:false},
    identityCheckedBy:{type:id,ref:'User'},
    score:{type:Number,min:0,max:100},
    resultLabel:{type:String,trim:true,maxlength:60},
    note:{type:String,trim:true,maxlength:2000},
    recordedBy:{type:id,ref:'User',required:true}
  },{timestamps:true});
  recordSchema.index({sessionId:1,studentId:1},{unique:true});
  const Session=mongoose.models.FinalExamSession||mongoose.model('FinalExamSession',sessionSchema);
  const Record=mongoose.models.FinalExamRecord||mongoose.model('FinalExamRecord',recordSchema);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const checkId=value=>{if(!mongoose.isValidObjectId(value))throw Object.assign(new Error('ID noto‘g‘ri'),{status:400})};
  const isAdmin=user=>['admin','superadmin'].includes(user.role);
  const semester=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>12)throw new Error('Semestr 1–12 oralig‘ida bo‘lsin');return n};
  const access=async(req,session,write=false)=>{
    if(isAdmin(req.user))return true;
    if(req.user.role==='teacher'){
      const invigilator=(session.invigilatorIds||[]).some(x=>String(x)===String(req.user._id));
      if(invigilator)return true;
      if(session.courseId){const course=await Course.findById(session.courseId).lean();if(course&&String(course.teacherId)===String(req.user._id))return true}
    }
    if(!write&&req.user.role==='student'){const gid=await resolveUserGroupId(req.user);if(String(gid||'')===String(session.groupId))return true}
    throw Object.assign(new Error('Bu yakuniy nazoratga ruxsat yo‘q'),{status:403});
  };
  const sessionView=async row=>Session.findById(row._id||row).populate('courseId','code title credits language').populate('groupId','name externalId code').populate('invigilatorIds','fullName login').lean();

  app.get('/api/lms/final-exams',auth,async(req,res)=>{
    try{
      let filter={};
      if(req.user.role==='student'){const gid=await resolveUserGroupId(req.user);if(!gid)return res.json([]);filter.groupId=gid}
      else if(req.user.role==='teacher'){const courseIds=(await Course.find({teacherId:req.user._id,active:true}).select('_id').lean()).map(x=>x._id);filter={$or:[{invigilatorIds:req.user._id},{courseId:{$in:courseIds}}]}}
      else if(!isAdmin(req.user))return res.status(403).json({message:'Ruxsat yo‘q'});
      if(req.query.status)filter.status=String(req.query.status);
      const rows=await Session.find(filter).populate('courseId','code title credits language').populate('groupId','name externalId code').populate('invigilatorIds','fullName login').sort({startsAt:-1}).limit(500).lean();
      res.json(rows);
    }catch(e){fail(res,e)}
  });

  app.post('/api/lms/final-exams',auth,async(req,res)=>{
    try{
      if(!isAdmin(req.user))return res.status(403).json({message:'Yakuniy nazoratni administrator rejalashtiradi'});
      const type=String(req.body.type||'');if(!['semester_final','state_attestation','thesis_defense'].includes(type))throw new Error('Nazorat turi noto‘g‘ri');
      checkId(req.body.groupId);const group=await Structure.findOne({_id:req.body.groupId,type:'group',active:true});if(!group)throw new Error('Guruh topilmadi');
      let course=null;if(type==='semester_final'){checkId(req.body.courseId);course=await Course.findOne({_id:req.body.courseId,groupId:group._id,active:true});if(!course)throw new Error('Fan shu guruhga tegishli emas')}
      const academicYear=normalizeAcademicYear(req.body.academicYear),sem=semester(req.body.semester),startsAt=new Date(req.body.startsAt),endsAt=new Date(req.body.endsAt);if(Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt)throw new Error('Boshlanish/tugash vaqti noto‘g‘ri');
      const location=String(req.body.location||'').trim();if(location.length<3)throw new Error('OTMdagi joylashuvni kiriting');
      const invigilatorIds=[...new Set((Array.isArray(req.body.invigilatorIds)?req.body.invigilatorIds:[req.body.invigilatorIds]).filter(Boolean).map(String))];for(const value of invigilatorIds)checkId(value);
      if(invigilatorIds.length){const count=await User.countDocuments({_id:{$in:invigilatorIds},role:'teacher',active:true});if(count!==invigilatorIds.length)throw new Error('Nazoratchi o‘qituvchi topilmadi')}
      const row=await Session.create({type,title:String(req.body.title||course?.title||'Yakuniy nazorat').trim(),courseId:course?._id:undefined,groupId:group._id,academicYear,semester:sem,startsAt,endsAt,location,room:String(req.body.room||'').trim(),inPerson:true,invigilatorIds,createdBy:req.user._id});
      audit(req,'FINAL_EXAM_CREATE','FinalExamSession',row.id,{type,groupId:String(group._id),courseId:course?String(course._id):null,academicYear,semester:sem,inPerson:true});res.status(201).json(await sessionView(row));
    }catch(e){fail(res,e)}
  });

  app.patch('/api/lms/final-exams/:id/status',auth,async(req,res)=>{
    try{checkId(req.params.id);const row=await Session.findById(req.params.id);if(!row)return res.status(404).json({message:'Nazorat topilmadi'});await access(req,row,true);
      const status=String(req.body.status||'');if(!['in_progress','cancelled'].includes(status))throw new Error('Holat noto‘g‘ri');if(!isAdmin(req.user)&&status==='cancelled')return res.status(403).json({message:'Bekor qilishni administrator bajaradi'});row.status=status;await row.save();audit(req,'FINAL_EXAM_'+status.toUpperCase(),'FinalExamSession',row.id);res.json({ok:true,status});
    }catch(e){fail(res,e)}
  });

  app.get('/api/lms/final-exams/:id/records',auth,async(req,res)=>{
    try{checkId(req.params.id);const session=await Session.findById(req.params.id).lean();if(!session)return res.status(404).json({message:'Nazorat topilmadi'});await access(req,session,false);
      let filter={sessionId:session._id};if(req.user.role==='student')filter.studentId=req.user._id;
      const [records,students]=await Promise.all([Record.find(filter).populate('studentId','fullName login').populate('identityCheckedBy recordedBy','fullName login').sort({createdAt:1}).lean(),req.user.role==='student'?Promise.resolve([]):User.find({role:'student',active:true,groupId:session.groupId}).select('_id fullName login').sort({fullName:1}).lean()]);
      res.json({session:await sessionView(session),students,records});
    }catch(e){fail(res,e)}
  });

  app.put('/api/lms/final-exams/:id/records/:studentId',auth,async(req,res)=>{
    try{checkId(req.params.id);checkId(req.params.studentId);const session=await Session.findById(req.params.id);if(!session)return res.status(404).json({message:'Nazorat topilmadi'});await access(req,session,true);if(!['planned','in_progress'].includes(session.status))return res.status(409).json({message:'Nazorat yozuvlari yopilgan'});
      const student=await User.findOne({_id:req.params.studentId,role:'student',active:true,groupId:session.groupId});if(!student)throw new Error('Talaba shu guruhda topilmadi');
      const attendance=String(req.body.attendance||'');if(!['present','absent','excused'].includes(attendance))throw new Error('Davomat holatini tanlang');const identityDocumentChecked=req.body.identityDocumentChecked===true;
      if(attendance==='present'&&!identityDocumentChecked)return res.status(400).json({message:'Shaxsan qatnashgan talabaning shaxsini hujjat bilan tekshirishni tasdiqlang'});
      const score=req.body.score===''||req.body.score===undefined?undefined:Number(req.body.score);if(score!==undefined&&(!Number.isFinite(score)||score<0||score>100))throw new Error('Ball 0–100 oralig‘ida bo‘lsin');
      const row=await Record.findOneAndUpdate({sessionId:session._id,studentId:student._id},{$set:{attendance,identityDocumentChecked,identityCheckedBy:identityDocumentChecked?req.user._id:undefined,score,resultLabel:String(req.body.resultLabel||'').trim().slice(0,60),note:String(req.body.note||'').trim().slice(0,2000),recordedBy:req.user._id}},{upsert:true,new:true,runValidators:true});
      audit(req,'FINAL_EXAM_RECORD','FinalExamRecord',row.id,{sessionId:String(session._id),studentId:String(student._id),attendance,identityDocumentChecked});res.json(row);
    }catch(e){fail(res,e)}
  });

  app.post('/api/lms/final-exams/:id/complete',auth,async(req,res)=>{
    try{if(!isAdmin(req.user))return res.status(403).json({message:'Faqat administrator yakunlaydi'});checkId(req.params.id);const session=await Session.findById(req.params.id);if(!session)return res.status(404).json({message:'Nazorat topilmadi'});if(session.status==='completed')return res.status(409).json({message:'Nazorat allaqachon yakunlangan'});
      const students=await User.find({role:'student',active:true,groupId:session.groupId}).select('_id').lean(),records=await Record.find({sessionId:session._id}).lean(),byStudent=new Map(records.map(x=>[String(x.studentId),x]));const missing=students.filter(s=>!byStudent.has(String(s._id)));if(missing.length)return res.status(409).json({message:'Barcha talabalar uchun qatnashuv qaydi kiritilmagan',missingCount:missing.length});
      if(session.type==='semester_final'&&session.courseId){const present=records.filter(x=>x.attendance==='present').map(x=>x.studentId),finalCount=present.length?await CourseResult.countDocuments({studentId:{$in:present},courseId:session.courseId,academicYear:session.academicYear,semester:session.semester,status:'final'}):0;if(finalCount!==present.length)return res.status(409).json({message:'Shaxsan qatnashgan barcha talabalar uchun fan yakuniy natijasi administrator tomonidan tasdiqlanmagan',missingResults:present.length-finalCount})}
      session.status='completed';session.completedBy=req.user._id;session.completedAt=new Date();await session.save();audit(req,'FINAL_EXAM_COMPLETE','FinalExamSession',session.id,{studentCount:students.length,recordCount:records.length});res.json({ok:true,completedAt:session.completedAt});
    }catch(e){fail(res,e)}
  });
  return {FinalExamSession:Session,FinalExamRecord:Record};
}
