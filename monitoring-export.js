import crypto from 'node:crypto';

export function stableMonitoringHash(payload){
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function validateReceiptReference(value){
  const text=String(value||'').trim();
  if(text.length<3||text.length>500)throw new Error('Qabul/reference raqami 3–500 belgi bo‘lsin');
  return text;
}

export function installMonitoringExport(app,{mongoose,User,Structure,Course,Schedule,Attendance,CourseResult,StudyPlan,StudentMovement,auth,audit}){
  const id=mongoose.Schema.Types.ObjectId;
  const exportSchema=new mongoose.Schema({
    provider:{type:String,enum:['ministry','quality'],required:true,index:true},
    payloadHash:{type:String,required:true,index:true},
    generatedAt:{type:Date,required:true},
    status:{type:String,enum:['generated','delivered','accepted','rejected'],default:'generated',index:true},
    deliveredAt:Date,receiptReference:{type:String,maxlength:500},receiptNote:{type:String,maxlength:2000},
    recordedBy:{type:id,ref:'User',required:true}
  },{timestamps:true});
  exportSchema.index({provider:1,payloadHash:1},{unique:true});
  const Export=mongoose.models.MonitoringExport||mongoose.model('MonitoringExport',exportSchema);
  const admin=req=>['admin','superadmin'].includes(req.user.role);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'Monitoring eksport xatosi'});

  const buildSnapshot=async()=>{
    const now=new Date(),since=new Date(now.getTime()-30*86400000);
    const [users,structures,courses,schedules,attendance,results,plans,movements]=await Promise.all([
      User.find({active:true}).select('_id login fullName role facultyId departmentId groupId direction courseYear').lean(),
      Structure.find({active:true}).select('_id type name externalId code parentId').lean(),
      Course.find({active:true}).select('_id code title language credits teacherId groupId').lean(),
      Schedule.find({}).select('_id title subject groupId teacherId weekday date start end kind recurring').lean(),
      Attendance.aggregate([{$match:{createdAt:{$gte:since}}},{$group:{_id:{lessonId:'$lessonId',status:'$status'},count:{$sum:1},minutes:{$sum:{$ifNull:['$minutes',0]}}}}]),
      CourseResult.find({status:'final'}).select('studentId courseId academicYear semester totalScore gradeLabel creditsAwarded finalizedAt').lean(),
      StudyPlan.find({}).select('studentId academicYear semester items approvedAt').lean(),
      StudentMovement.find({effectiveAt:{$gte:new Date(now.getTime()-365*86400000)}}).select('studentId kind effectiveAt fromGroupId toGroupId documentNo').lean()
    ]);
    return {
      schema:'masofaviy2-monitoring-v1',generatedAt:now.toISOString(),
      period:{attendanceFrom:since.toISOString(),attendanceTo:now.toISOString()},
      counts:{students:users.filter(x=>x.role==='student').length,teachers:users.filter(x=>x.role==='teacher').length,courses:courses.length,schedules:schedules.length,finalResults:results.length},
      structures:structures.map(x=>({id:String(x._id),type:x.type,name:x.name,externalId:x.externalId||x.code||'',parentId:x.parentId?String(x.parentId):null})),
      users:users.map(x=>({id:String(x._id),login:x.login,fullName:x.fullName,role:x.role,facultyId:x.facultyId?String(x.facultyId):null,departmentId:x.departmentId?String(x.departmentId):null,groupId:x.groupId?String(x.groupId):null,direction:x.direction||'',courseYear:x.courseYear||null})),
      courses:courses.map(x=>({id:String(x._id),code:x.code,title:x.title,language:x.language,credits:x.credits||0,teacherId:String(x.teacherId),groupId:String(x.groupId)})),
      schedules:schedules.map(x=>({id:String(x._id),title:x.title,subject:x.subject||'',groupId:String(x.groupId),teacherId:String(x.teacherId),weekday:x.weekday||null,date:x.date||'',start:x.start||'',end:x.end||'',kind:x.kind,recurring:Boolean(x.recurring)})),
      attendance30d:attendance.map(x=>({lessonId:String(x._id.lessonId),status:x._id.status,count:x.count,minutes:x.minutes})),
      finalResults:results.map(x=>({studentId:String(x.studentId),courseId:String(x.courseId),academicYear:x.academicYear,semester:x.semester,totalScore:x.totalScore,gradeLabel:x.gradeLabel||'',creditsAwarded:x.creditsAwarded||0,finalizedAt:x.finalizedAt||null})),
      studyPlans:plans.map(x=>({studentId:String(x.studentId),academicYear:x.academicYear,semester:x.semester,approvedAt:x.approvedAt||null,items:(x.items||[]).map(i=>({courseId:String(i.courseId),credits:i.credits,status:i.status,required:i.required!==false}))})),
      movements:movements.map(x=>({studentId:String(x.studentId),kind:x.kind,effectiveAt:x.effectiveAt,fromGroupId:x.fromGroupId?String(x.fromGroupId):null,toGroupId:x.toGroupId?String(x.toGroupId):null,documentNo:x.documentNo||''}))
    };
  };

  app.get('/api/lms/monitoring/readiness',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});
      const latest=await Export.find({}).sort({createdAt:-1}).limit(20).lean();
      res.json({transport:'official-api-spec-required',providers:[
        {provider:'ministry',endpointConfigured:Boolean(process.env.MONITORING_MINISTRY_URL),schemaConfigured:Boolean(process.env.MONITORING_MINISTRY_SCHEMA_VERSION)},
        {provider:'quality',endpointConfigured:Boolean(process.env.MONITORING_QUALITY_URL),schemaConfigured:Boolean(process.env.MONITORING_QUALITY_SCHEMA_VERSION)}
      ],latest});
    }catch(e){fail(res,e)}
  });

  app.post('/api/lms/monitoring/:provider/export',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});
      const provider=String(req.params.provider||'');if(!['ministry','quality'].includes(provider))throw new Error('Monitoring tizimi noto‘g‘ri');
      const payload=await buildSnapshot(),payloadHash=stableMonitoringHash(payload);
      const row=await Export.findOneAndUpdate({provider,payloadHash},{$setOnInsert:{provider,payloadHash,generatedAt:new Date(payload.generatedAt),recordedBy:req.user._id}},{upsert:true,new:true});
      audit(req,'MONITORING_EXPORT_GENERATE','MonitoringExport',row.id,{provider,payloadHash});
      res.json({provider,payloadHash,payload,record:{id:row.id,status:row.status,generatedAt:row.generatedAt},transportReady:false,transportReason:'Rasmiy API endpoint, autentifikatsiya va maydonlar sxemasi OTM/vakolatli organdan olinishi kerak'});
    }catch(e){fail(res,e)}
  });

  app.patch('/api/lms/monitoring/exports/:id/receipt',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});if(!mongoose.isValidObjectId(req.params.id))throw new Error('ID noto‘g‘ri');
      const status=String(req.body.status||'');if(!['delivered','accepted','rejected'].includes(status))throw new Error('Qabul holati noto‘g‘ri');
      const receiptReference=validateReceiptReference(req.body.receiptReference),row=await Export.findById(req.params.id);if(!row)return res.status(404).json({message:'Eksport qaydi topilmadi'});
      row.status=status;row.deliveredAt=new Date();row.receiptReference=receiptReference;row.receiptNote=String(req.body.receiptNote||'').trim().slice(0,2000);await row.save();
      audit(req,'MONITORING_EXPORT_RECEIPT','MonitoringExport',row.id,{provider:row.provider,status,receiptReference});res.json(row);
    }catch(e){fail(res,e)}
  });

  return {MonitoringExport:Export,buildMonitoringSnapshot:buildSnapshot};
}
