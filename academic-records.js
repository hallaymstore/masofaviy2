// Academic plan, credit/result and student-movement records required by the LMS governance layer.
export function normalizeAcademicYear(value){
  const text=String(value||'').trim(),match=text.match(/^(\d{4})\/(\d{4})$/);
  if(!match||Number(match[2])!==Number(match[1])+1)throw new Error('O‘quv yili 2026/2027 ko‘rinishida bo‘lsin');
  return text;
}
export function normalizeScore(value,name='Ball'){
  const n=Number(value);if(!Number.isFinite(n)||n<0||n>100)throw new Error(name+' 0–100 oralig‘ida bo‘lsin');return Math.round(n*100)/100;
}
export function normalizeOutcome(value){
  const text=String(value||'').trim();if(!['completed','failed'].includes(text))throw new Error('Natija holatini tanlang');return text;
}
export function installAcademicRecords(app,{mongoose,User,Course,auth,audit,courseAccess,resolveUserGroupId}){
  const id=mongoose.Schema.Types.ObjectId;
  const planItemSchema=new mongoose.Schema({
    courseId:{type:id,ref:'Course',required:true},
    credits:{type:Number,min:0,max:60,required:true},
    required:{type:Boolean,default:true},
    status:{type:String,enum:['planned','in_progress','completed','failed','withdrawn'],default:'planned'}
  },{_id:false});
  const studyPlanSchema=new mongoose.Schema({
    studentId:{type:id,ref:'User',required:true,index:true},
    academicYear:{type:String,required:true,index:true},
    semester:{type:Number,required:true,min:1,max:12},
    items:{type:[planItemSchema],default:[]},
    notes:{type:String,maxlength:3000},
    approvedBy:{type:id,ref:'User'},approvedAt:Date
  },{timestamps:true});
  studyPlanSchema.index({studentId:1,academicYear:1,semester:1},{unique:true});

  const courseResultSchema=new mongoose.Schema({
    studentId:{type:id,ref:'User',required:true,index:true},
    courseId:{type:id,ref:'Course',required:true,index:true},
    academicYear:{type:String,required:true,index:true},
    semester:{type:Number,required:true,min:1,max:12},
    continuousScore:{type:Number,min:0,max:100,required:true},
    finalScore:{type:Number,min:0,max:100,required:true},
    totalScore:{type:Number,min:0,max:100,required:true},
    gradeLabel:{type:String,trim:true,maxlength:30},
    creditsAwarded:{type:Number,min:0,max:60,default:0},
    status:{type:String,enum:['submitted','final'],default:'submitted',index:true},
    note:{type:String,maxlength:2000},
    enteredBy:{type:id,ref:'User',required:true},
    finalizedBy:{type:id,ref:'User'},finalizedAt:Date,
    revisionReason:{type:String,maxlength:2000}
  },{timestamps:true});
  courseResultSchema.index({studentId:1,courseId:1,academicYear:1,semester:1},{unique:true});

  const movementSchema=new mongoose.Schema({
    studentId:{type:id,ref:'User',required:true,index:true},
    kind:{type:String,enum:['admission','transfer_in','transfer_out','expulsion','reinstatement','promotion','group_change','graduation'],required:true,index:true},
    effectiveAt:{type:Date,required:true,index:true},
    fromGroupId:{type:id,ref:'Structure'},toGroupId:{type:id,ref:'Structure'},
    documentNo:{type:String,trim:true,maxlength:120},
    reason:{type:String,trim:true,maxlength:2000},
    createdBy:{type:id,ref:'User',required:true}
  },{timestamps:true});
  movementSchema.index({studentId:1,effectiveAt:-1});

  const retakeSchema=new mongoose.Schema({
    studentId:{type:id,ref:'User',required:true,index:true},courseId:{type:id,ref:'Course',required:true,index:true},
    academicYear:{type:String,required:true,index:true},semester:{type:Number,required:true,min:1,max:12},
    kind:{type:String,enum:['retake_exam','repeat_course'],required:true,index:true},
    attemptNo:{type:Number,required:true,min:1,max:10},reason:{type:String,required:true,trim:true,maxlength:2000},
    assignedAt:{type:Date,default:Date.now},dueAt:Date,
    status:{type:String,enum:['planned','in_progress','completed','failed','cancelled'],default:'planned',index:true},
    assignedBy:{type:id,ref:'User',required:true},completedBy:{type:id,ref:'User'},completedAt:Date,outcomeNote:{type:String,trim:true,maxlength:2000}
  },{timestamps:true});
  retakeSchema.index({studentId:1,courseId:1,academicYear:1,semester:1,attemptNo:1},{unique:true});

  const StudyPlan=mongoose.models.StudyPlan||mongoose.model('StudyPlan',studyPlanSchema);
  const CourseResult=mongoose.models.CourseResult||mongoose.model('CourseResult',courseResultSchema);
  const StudentMovement=mongoose.models.StudentMovement||mongoose.model('StudentMovement',movementSchema);
  const AcademicRetake=mongoose.models.AcademicRetake||mongoose.model('AcademicRetake',retakeSchema);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const checkId=value=>{if(!mongoose.isValidObjectId(value))throw Object.assign(new Error('ID noto‘g‘ri'),{status:400})};
  const admin=req=>['admin','superadmin'].includes(req.user.role);
  const semester=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>12)throw new Error('Semestr 1–12 oralig‘ida bo‘lsin');return n};
  const studentById=async value=>{checkId(value);const row=await User.findOne({_id:value,role:'student'});if(!row)throw Object.assign(new Error('Talaba topilmadi'),{status:404});return row};
  const canReadStudent=async(req,student)=>{
    if(admin(req)||String(req.user._id)===String(student._id))return true;
    if(req.user.role==='teacher'){const groupId=await resolveUserGroupId(student);if(!groupId)return false;return Boolean(await Course.exists({teacherId:req.user._id,groupId,active:true}))}
    return false;
  };
  const verifyPlanItems=async(student,items)=>{
    if(!Array.isArray(items)||!items.length||items.length>80)throw new Error('Rejada 1–80 ta fan bo‘lishi kerak');
    const groupId=await resolveUserGroupId(student);if(!groupId)throw new Error('Talabaga guruh biriktirilmagan');
    const seen=new Set(),normalized=[];
    for(const raw of items){
      checkId(raw.courseId);const key=String(raw.courseId);if(seen.has(key))throw new Error('Bir fan reja ichida takrorlanmasin');seen.add(key);
      const course=await Course.findOne({_id:raw.courseId,groupId,active:true}).lean();if(!course)throw new Error('Rejadagi fan talaba guruhiga tegishli emas');
      const credits=Number(raw.credits??course.credits??0);if(!Number.isFinite(credits)||credits<0||credits>60)throw new Error('Kredit noto‘g‘ri');
      normalized.push({courseId:course._id,credits,required:raw.required!==false,status:['planned','in_progress','completed','failed','withdrawn'].includes(raw.status)?raw.status:'planned'});
    }
    return normalized;
  };

  app.get('/api/lms/academic/plan/:studentId',auth,async(req,res)=>{
    try{const student=await studentById(req.params.studentId);if(!await canReadStudent(req,student))return res.status(403).json({message:'Ruxsat yo‘q'});
      const year=req.query.academicYear?normalizeAcademicYear(req.query.academicYear):null,sem=req.query.semester?semester(req.query.semester):null,filter={studentId:student._id};if(year)filter.academicYear=year;if(sem)filter.semester=sem;
      const rows=await StudyPlan.find(filter).populate('items.courseId','code title credits language').populate('approvedBy','fullName login').sort({academicYear:-1,semester:1}).lean();
      res.json({student:{id:student._id,fullName:student.fullName,login:student.login},plans:rows});
    }catch(e){fail(res,e)}
  });
  app.put('/api/lms/academic/plan/:studentId',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Faqat administrator tasdiqlaydi'});const student=await studentById(req.params.studentId),academicYear=normalizeAcademicYear(req.body.academicYear),sem=semester(req.body.semester),items=await verifyPlanItems(student,req.body.items);
      const row=await StudyPlan.findOneAndUpdate({studentId:student._id,academicYear,semester:sem},{$set:{items,notes:String(req.body.notes||'').slice(0,3000),approvedBy:req.user._id,approvedAt:new Date()}},{upsert:true,new:true,runValidators:true});
      audit(req,'STUDY_PLAN_APPROVE','StudyPlan',row.id,{studentId:String(student._id),academicYear,semester:sem,totalCredits:items.reduce((n,x)=>n+x.credits,0)});res.json(row);
    }catch(e){fail(res,e)}
  });

  app.get('/api/lms/academic/course/:courseId/students',auth,async(req,res)=>{
    try{const course=await courseAccess(req,req.params.courseId,true);const students=await User.find({role:'student',active:true,groupId:course.groupId}).select('_id fullName login groupId').sort({fullName:1}).lean();res.json({course:{id:course._id,code:course.code,title:course.title,credits:course.credits},students})}catch(e){fail(res,e)}
  });

  app.get('/api/lms/academic/transcript/:studentId',auth,async(req,res)=>{
    try{const student=await studentById(req.params.studentId);if(!await canReadStudent(req,student))return res.status(403).json({message:'Ruxsat yo‘q'});
      const rows=await CourseResult.find({studentId:student._id,status:'final'}).populate('courseId','code title credits language').populate('finalizedBy','fullName login').sort({academicYear:1,semester:1,createdAt:1}).lean();
      const credits=rows.reduce((n,x)=>n+(Number(x.creditsAwarded)||0),0);res.json({student:{id:student._id,fullName:student.fullName,login:student.login},creditsAwarded:credits,results:rows});
    }catch(e){fail(res,e)}
  });
  app.post('/api/lms/academic/results',auth,async(req,res)=>{
    try{if(!['teacher','admin','superadmin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});checkId(req.body.courseId);const course=await courseAccess(req,req.body.courseId,true),student=await studentById(req.body.studentId),groupId=await resolveUserGroupId(student);if(String(groupId)!==String(course.groupId))throw new Error('Talaba bu fan guruhiga tegishli emas');
      const academicYear=normalizeAcademicYear(req.body.academicYear),sem=semester(req.body.semester),continuousScore=normalizeScore(req.body.continuousScore,'Joriy ball'),finalScore=normalizeScore(req.body.finalScore,'Yakuniy ball'),totalScore=normalizeScore(req.body.totalScore,'Umumiy ball');
      const current=await CourseResult.findOne({studentId:student._id,courseId:course._id,academicYear,semester:sem}),isAdmin=admin(req),finalize=req.body.finalize===true;
      if(current?.status==='final'&&(!isAdmin||String(req.body.revisionReason||'').trim().length<10))return res.status(409).json({message:'Yakuniy natijani o‘zgartirish uchun administrator va kamida 10 belgili sabab kerak'});
      if(finalize&&!isAdmin)return res.status(403).json({message:'Yakuniy natijani faqat administrator tasdiqlaydi'});
      const creditsAwarded=Number(req.body.creditsAwarded);if(!Number.isFinite(creditsAwarded)||creditsAwarded<0||creditsAwarded>Number(course.credits||0))throw new Error('Beriladigan kreditni 0 dan fan kreditigacha kiriting');
      const gradeLabel=String(req.body.gradeLabel||'').trim().slice(0,30),outcome=finalize?normalizeOutcome(req.body.outcome):null;
      const update={continuousScore,finalScore,totalScore,gradeLabel,creditsAwarded,status:finalize?'final':'submitted',note:String(req.body.note||'').slice(0,2000),enteredBy:req.user._id,revisionReason:String(req.body.revisionReason||'').slice(0,2000)};
      if(finalize){update.finalizedBy=req.user._id;update.finalizedAt=new Date()}
      const row=await CourseResult.findOneAndUpdate({studentId:student._id,courseId:course._id,academicYear,semester:sem},{$set:update},{upsert:true,new:true,runValidators:true});
      if(finalize)await StudyPlan.updateOne({studentId:student._id,academicYear,semester:sem,'items.courseId':course._id},{$set:{'items.$.status':outcome}});
      audit(req,finalize?'COURSE_RESULT_FINALIZE':'COURSE_RESULT_SUBMIT','CourseResult',row.id,{studentId:String(student._id),courseId:String(course._id),totalScore,gradeLabel,creditsAwarded,outcome,revision:Boolean(current?.status==='final')});res.json(row);
    }catch(e){fail(res,e)}
  });
  app.get('/api/lms/academic/results/course/:courseId',auth,async(req,res)=>{
    try{const course=await courseAccess(req,req.params.courseId,true);res.json(await CourseResult.find({courseId:course._id}).populate('studentId','fullName login groupId').sort({academicYear:-1,semester:-1,createdAt:-1}).limit(1000).lean())}catch(e){fail(res,e)}
  });

  app.get('/api/lms/academic/retakes/:studentId',auth,async(req,res)=>{
    try{const student=await studentById(req.params.studentId);if(!await canReadStudent(req,student))return res.status(403).json({message:'Ruxsat yo‘q'});res.json(await AcademicRetake.find({studentId:student._id}).populate('courseId','code title credits').populate('assignedBy completedBy','fullName login').sort({createdAt:-1}).lean())}catch(e){fail(res,e)}
  });
  app.post('/api/lms/academic/retakes',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Qayta o‘qish/topshirishni administrator belgilaydi'});const student=await studentById(req.body.studentId);checkId(req.body.courseId);const groupId=await resolveUserGroupId(student),course=await Course.findOne({_id:req.body.courseId,groupId,active:true});if(!course)throw new Error('Fan talaba guruhiga tegishli emas');
      const academicYear=normalizeAcademicYear(req.body.academicYear),sem=semester(req.body.semester),kind=String(req.body.kind||'');if(!['retake_exam','repeat_course'].includes(kind))throw new Error('Qayta o‘qish turi noto‘g‘ri');const reason=String(req.body.reason||'').trim();if(reason.length<5)throw new Error('Qayta o‘qish/topshirish sababini kiriting');
      const last=await AcademicRetake.findOne({studentId:student._id,courseId:course._id,academicYear,semester:sem}).sort({attemptNo:-1}).lean(),attemptNo=(last?.attemptNo||0)+1;if(attemptNo>10)throw new Error('Qayta urinishlar chegarasi oshdi');
      const dueAt=req.body.dueAt?new Date(req.body.dueAt):undefined;if(dueAt&&Number.isNaN(dueAt.getTime()))throw new Error('Muddat sanasi noto‘g‘ri');
      const row=await AcademicRetake.create({studentId:student._id,courseId:course._id,academicYear,semester:sem,kind,attemptNo,reason,dueAt,assignedBy:req.user._id});await StudyPlan.updateOne({studentId:student._id,academicYear,semester:sem,'items.courseId':course._id},{$set:{'items.$.status':'in_progress'}});
      audit(req,'ACADEMIC_RETAKE_ASSIGN','AcademicRetake',row.id,{studentId:String(student._id),courseId:String(course._id),kind,attemptNo});res.status(201).json(row);
    }catch(e){fail(res,e)}
  });
  app.patch('/api/lms/academic/retakes/:id/status',auth,async(req,res)=>{
    try{checkId(req.params.id);const row=await AcademicRetake.findById(req.params.id);if(!row)return res.status(404).json({message:'Qayta o‘qish/topshirish yozuvi topilmadi'});const course=await courseAccess(req,row.courseId,true),isAdmin=admin(req),status=String(req.body.status||'');if(!['in_progress','completed','failed','cancelled'].includes(status))throw new Error('Holat noto‘g‘ri');if(['completed','failed','cancelled'].includes(status)&&!isAdmin)return res.status(403).json({message:'Yakuniy holatni administrator tasdiqlaydi'});
      row.status=status;row.outcomeNote=String(req.body.outcomeNote||'').trim().slice(0,2000);if(['completed','failed','cancelled'].includes(status)){row.completedBy=req.user._id;row.completedAt=new Date()}await row.save();
      if(status==='completed')await StudyPlan.updateOne({studentId:row.studentId,academicYear:row.academicYear,semester:row.semester,'items.courseId':row.courseId},{$set:{'items.$.status':'completed'}});
      if(status==='failed')await StudyPlan.updateOne({studentId:row.studentId,academicYear:row.academicYear,semester:row.semester,'items.courseId':row.courseId},{$set:{'items.$.status':'failed'}});
      audit(req,'ACADEMIC_RETAKE_'+status.toUpperCase(),'AcademicRetake',row.id,{courseId:String(course._id)});res.json(row);
    }catch(e){fail(res,e)}
  });

  app.post('/api/lms/academic/movements',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Faqat administrator yuritadi'});const student=await studentById(req.body.studentId),kind=String(req.body.kind||'');if(!['admission','transfer_in','transfer_out','expulsion','reinstatement','promotion','group_change','graduation'].includes(kind))throw new Error('Harakat turi noto‘g‘ri');
      for(const key of ['fromGroupId','toGroupId'])if(req.body[key])checkId(req.body[key]);const effectiveAt=new Date(req.body.effectiveAt);if(Number.isNaN(effectiveAt.getTime()))throw new Error('Sana noto‘g‘ri');
      const row=await StudentMovement.create({studentId:student._id,kind,effectiveAt,fromGroupId:req.body.fromGroupId||undefined,toGroupId:req.body.toGroupId||undefined,documentNo:String(req.body.documentNo||'').slice(0,120),reason:String(req.body.reason||'').slice(0,2000),createdBy:req.user._id});
      audit(req,'STUDENT_MOVEMENT_CREATE','StudentMovement',row.id,{studentId:String(student._id),kind,effectiveAt});res.status(201).json(row);
    }catch(e){fail(res,e)}
  });
  app.get('/api/lms/academic/movements/:studentId',auth,async(req,res)=>{
    try{const student=await studentById(req.params.studentId);if(!await canReadStudent(req,student))return res.status(403).json({message:'Ruxsat yo‘q'});res.json(await StudentMovement.find({studentId:student._id}).populate('fromGroupId toGroupId','name externalId code').populate('createdBy','fullName login').sort({effectiveAt:-1,createdAt:-1}).lean())}catch(e){fail(res,e)}
  });

  return {StudyPlan,CourseResult,StudentMovement,AcademicRetake};
}
