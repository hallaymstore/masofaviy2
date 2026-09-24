import crypto from 'node:crypto';
import net from 'node:net';

// Generated timestamps are transport metadata: they must not change the identity of unchanged academic records.
export function stableMonitoringHash(payload){
  const {generatedAt: _ignored, ...academicData}=payload;
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(academicData))).digest('hex');
}

// An accepted or delivered payload is not silently transmitted twice.
// Failed attempts can be retried; explicitly rejected receipts require a new reviewed export.
export function monitoringSyncDecision(status,startedAt,now=Date.now()){
  if(status==='accepted'||status==='delivered')return 'already_delivered';
  if(status==='rejected')return 'rejected';
  if(status==='sending' && (!startedAt || now-new Date(startedAt).getTime()<120000))return 'in_progress';
  return 'send';
}

export function validateReceiptReference(value){
  const text=String(value||'').trim();
  if(text.length<3||text.length>500)throw new Error('Qabul/reference raqami 3–500 belgi bo‘lsin');
  return text;
}

export function validateMonitoringGatewayUrl(value,approvedHost=''){
  const text=String(value||'').trim();if(!text)return '';
  let parsed;try{parsed=new URL(text)}catch{throw new Error('Monitoring gateway URL noto‘g‘ri')}
  if(parsed.protocol!=='https:')throw new Error('Monitoring gateway faqat HTTPS bo‘lishi kerak');
  if(parsed.username||parsed.password||parsed.hash)throw new Error('Monitoring gateway URL ichida credential/hash bo‘lmasin');
  const host=parsed.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(net.isIP(host)||!host.includes('.')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host))
    throw new Error('Monitoring gateway uchun ommaviy rasmiy domen talab etiladi');
  const approved=String(approvedHost||'').trim().toLowerCase();
  if(approved&&parsed.host.toLowerCase()!==approved)throw new Error('Monitoring gateway domeni tasdiqlangan rasmiy host bilan mos emas');
  return parsed.toString();
}

const providerConfig=provider=>{
  const prefix=provider==='ministry'?'MONITORING_MINISTRY':'MONITORING_QUALITY';
  return {
    provider,
    label:provider==='ministry'?'Oliy ta’lim jarayonlarini boshqarish axborot tizimi':'Ta’lim muassasalari, pedagoglar va ta’lim oluvchilar yagona ma’lumotlar bazasi',
    url:String(process.env[prefix+'_URL']||'').trim(),
    approvedHost:String(process.env[prefix+'_ALLOWED_HOST']||'').trim().toLowerCase(),
    token:String(process.env[prefix+'_TOKEN']||'').trim(),
    schemaVersion:String(process.env[prefix+'_SCHEMA_VERSION']||'').trim(),
    contractConfirmed:String(process.env[prefix+'_OFFICIAL_CONTRACT_CONFIRMED']||'false').toLowerCase()==='true'
  };
};

export function installMonitoringExport(app,{mongoose,User,Structure,Course,Schedule,Attendance,CourseResult,StudyPlan,StudentMovement,auth,audit}){
  const id=mongoose.Schema.Types.ObjectId;
  const exportSchema=new mongoose.Schema({
    provider:{type:String,enum:['ministry','quality'],required:true,index:true},
    payloadHash:{type:String,required:true,index:true},
    generatedAt:{type:Date,required:true},
    status:{type:String,enum:['generated','sending','delivered','accepted','rejected','failed'],default:'generated',index:true},
    syncStartedAt:Date,
    deliveredAt:Date,receiptReference:{type:String,maxlength:500},receiptNote:{type:String,maxlength:2000},
    lastHttpStatus:Number,deliveryError:{type:String,maxlength:2000},gatewayRequestId:{type:String,maxlength:500},
    recordedBy:{type:id,ref:'User',required:true}
  },{timestamps:true});
  exportSchema.index({provider:1,payloadHash:1},{unique:true});
  const Export=mongoose.models.MonitoringExport||mongoose.model('MonitoringExport',exportSchema);
  const admin=req=>['admin','superadmin'].includes(req.user.role);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'Monitoring eksport xatosi'});
  const institutionCode=()=>String(process.env.INSTITUTION_CODE||'').trim();

  const mappingReadiness=async()=>{
    const missingUserFilter={active:true,role:{$in:['student','teacher']},$or:[{externalId:{$exists:false}},{externalId:null},{externalId:''}]},
      missingStructureFilter={active:true,$or:[{externalId:{$exists:false}},{externalId:null},{externalId:''}]};
    const [missingUsers,missingStructures,missingUserCount,missingStructureCount,activeUsers,activeStructures]=await Promise.all([
      User.find(missingUserFilter).select('_id login fullName role').limit(200).lean(),
      Structure.find(missingStructureFilter).select('_id type name code').limit(200).lean(),
      User.countDocuments(missingUserFilter),
      Structure.countDocuments(missingStructureFilter),
      User.countDocuments({active:true,role:{$in:['student','teacher']}}),
      Structure.countDocuments({active:true})
    ]);
    return {activeUsers,activeStructures,missingUserExternalIds:missingUserCount,missingStructureExternalIds:missingStructureCount,missingUsers,missingStructures};
  };

  const buildSnapshot=async()=>{
    const generatedAt=new Date(),now=new Date(Math.floor(generatedAt.getTime()/3600000)*3600000),since=new Date(now.getTime()-30*86400000);
    const [users,structures,courses,schedules,attendance,results,plans,movements]=await Promise.all([
      User.find({active:true}).select('_id externalId login fullName role facultyId departmentId groupId direction courseYear identityVerifiedAt').lean(),
      Structure.find({active:true}).select('_id type name externalId code parentId').lean(),
      Course.find({active:true}).select('_id code title language credits teacherId groupId').lean(),
      Schedule.find({}).select('_id title subject groupId teacherId weekday date start end kind recurring').lean(),
      Attendance.aggregate([{$match:{createdAt:{$gte:since,$lt:now}}},{$group:{_id:{lessonId:'$lessonId',status:'$status'},count:{$sum:1},minutes:{$sum:{$ifNull:['$minutes',0]}}}}]),
      CourseResult.find({status:'final'}).select('studentId courseId academicYear semester totalScore gradeLabel creditsAwarded finalizedAt').lean(),
      StudyPlan.find({}).select('studentId academicYear semester items approvedAt').lean(),
      StudentMovement.find({effectiveAt:{$gte:new Date(now.getTime()-365*86400000)}}).select('studentId kind effectiveAt fromGroupId toGroupId documentNo').lean()
    ]);
    const byId=(a,b)=>String(a._id||'').localeCompare(String(b._id||''));
    users.sort(byId);structures.sort(byId);courses.sort(byId);schedules.sort(byId);results.sort(byId);plans.sort(byId);movements.sort(byId);
    attendance.sort((a,b)=>(String(a._id.lessonId)+'/'+a._id.status).localeCompare(String(b._id.lessonId)+'/'+b._id.status));
    const usersById=new Map(users.map(x=>[String(x._id),x])),structuresById=new Map(structures.map(x=>[String(x._id),x])),coursesById=new Map(courses.map(x=>[String(x._id),x]));
    const userExternal=x=>{const row=usersById.get(String(x||''));return row?.externalId||''};
    const structureExternal=x=>{const row=structuresById.get(String(x||''));return row?.externalId||row?.code||''};
    const courseCode=x=>coursesById.get(String(x||''))?.code||'';
    return {
      schema:'masofaviy2-monitoring-v2',institutionCode:institutionCode(),generatedAt:generatedAt.toISOString(),
      period:{attendanceFrom:since.toISOString(),attendanceTo:now.toISOString()},
      counts:{students:users.filter(x=>x.role==='student').length,teachers:users.filter(x=>x.role==='teacher').length,courses:courses.length,schedules:schedules.length,finalResults:results.length},
      structures:structures.map(x=>({localId:String(x._id),externalId:x.externalId||x.code||'',type:x.type,name:x.name,parentExternalId:structureExternal(x.parentId)})),
      users:users.map(x=>({localId:String(x._id),externalId:x.externalId||'',login:x.login,fullName:x.fullName,role:x.role,facultyExternalId:structureExternal(x.facultyId),departmentExternalId:structureExternal(x.departmentId),groupExternalId:structureExternal(x.groupId),direction:x.direction||'',courseYear:x.courseYear||null,identityVerified:Boolean(x.identityVerifiedAt)})),
      courses:courses.map(x=>({localId:String(x._id),code:x.code,title:x.title,language:x.language,credits:x.credits||0,teacherExternalId:userExternal(x.teacherId),groupExternalId:structureExternal(x.groupId)})),
      schedules:schedules.map(x=>({localId:String(x._id),title:x.title,subject:x.subject||'',groupExternalId:structureExternal(x.groupId),teacherExternalId:userExternal(x.teacherId),weekday:x.weekday||null,date:x.date||'',start:x.start||'',end:x.end||'',kind:x.kind,recurring:Boolean(x.recurring)})),
      attendance30d:attendance.map(x=>({lessonId:String(x._id.lessonId),status:x._id.status,count:x.count,minutes:x.minutes})),
      finalResults:results.map(x=>({studentExternalId:userExternal(x.studentId),courseCode:courseCode(x.courseId),academicYear:x.academicYear,semester:x.semester,totalScore:x.totalScore,gradeLabel:x.gradeLabel||'',creditsAwarded:x.creditsAwarded||0,finalizedAt:x.finalizedAt||null})),
      studyPlans:plans.map(x=>({studentExternalId:userExternal(x.studentId),academicYear:x.academicYear,semester:x.semester,approvedAt:x.approvedAt||null,items:(x.items||[]).map(i=>({courseCode:courseCode(i.courseId),credits:i.credits,status:i.status,required:i.required!==false}))})),
      movements:movements.map(x=>({studentExternalId:userExternal(x.studentId),kind:x.kind,effectiveAt:x.effectiveAt,fromGroupExternalId:structureExternal(x.fromGroupId),toGroupExternalId:structureExternal(x.toGroupId),documentNo:x.documentNo||''}))
    };
  };

  const readinessFor=async provider=>{
    const config=providerConfig(provider),mapping=await mappingReadiness();let gatewayUrl='',urlError='';
    if(config.url&&config.approvedHost){try{gatewayUrl=validateMonitoringGatewayUrl(config.url,config.approvedHost)}catch(e){urlError=e.message}}
    const checks={
      institutionCode:Boolean(institutionCode()),
      gatewayHttps:Boolean(gatewayUrl),
      gatewayHostApproved:Boolean(config.approvedHost&&gatewayUrl),
      gatewayToken:config.token.length>=16,
      schemaVersion:Boolean(config.schemaVersion),
      officialContractConfirmed:config.contractConfirmed,
      userExternalIds:mapping.missingUserExternalIds===0,
      structureExternalIds:mapping.missingStructureExternalIds===0
    };
    return {provider,label:config.label,ready:Object.values(checks).every(Boolean),checks,urlError,mapping:{activeUsers:mapping.activeUsers,activeStructures:mapping.activeStructures,missingUserExternalIds:mapping.missingUserExternalIds,missingStructureExternalIds:mapping.missingStructureExternalIds},config:{endpointConfigured:Boolean(config.url),allowedHostConfigured:Boolean(config.approvedHost),schemaVersion:config.schemaVersion||null,officialContractConfirmed:config.contractConfirmed}};
  };

  app.get('/api/lms/monitoring/readiness',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});
      const [ministry,quality,latest]=await Promise.all([readinessFor('ministry'),readinessFor('quality'),Export.find({}).sort({createdAt:-1}).limit(20).lean()]);
      res.json({transport:'official-api-or-approved-gateway-required',institutionCode:institutionCode()||null,providers:[ministry,quality],latest});
    }catch(e){fail(res,e)}
  });

  app.post('/api/lms/monitoring/:provider/export',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});
      const provider=String(req.params.provider||'');if(!['ministry','quality'].includes(provider))throw new Error('Monitoring tizimi noto‘g‘ri');
      const payload=await buildSnapshot(),payloadHash=stableMonitoringHash(payload),readiness=await readinessFor(provider);
      const row=await Export.findOneAndUpdate({provider,payloadHash},{$setOnInsert:{provider,payloadHash,generatedAt:new Date(payload.generatedAt),recordedBy:req.user._id}},{upsert:true,new:true});
      audit(req,'MONITORING_EXPORT_GENERATE','MonitoringExport',row.id,{provider,payloadHash,ready:readiness.ready});
      res.json({provider,payloadHash,payload,readiness,record:{id:row.id,status:row.status,generatedAt:row.generatedAt},transportReady:readiness.ready,transportReason:readiness.ready?'Rasmiy tasdiqlangan gateway orqali yuborishga tayyor':'Readiness tekshiruvidagi talablar to‘liq emas'});
    }catch(e){fail(res,e)}
  });

  app.post('/api/lms/monitoring/:provider/sync',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});if(req.body.confirmOfficialTransfer!==true)return res.status(400).json({message:'Rasmiy tizim/gatewayga ma’lumot uzatishni aniq tasdiqlang'});
      const provider=String(req.params.provider||'');if(!['ministry','quality'].includes(provider))throw new Error('Monitoring tizimi noto‘g‘ri');
      const readiness=await readinessFor(provider);if(!readiness.ready)return res.status(409).json({message:'Rasmiy integratsiya readiness to‘liq emas',readiness});
      const config=providerConfig(provider),gatewayUrl=validateMonitoringGatewayUrl(config.url),payload=await buildSnapshot(),payloadHash=stableMonitoringHash(payload),serialized=JSON.stringify({contract:'masofaviy2-monitoring-gateway-v1',provider,institutionCode:institutionCode(),schemaVersion:config.schemaVersion,payloadHash,payload});
      const maxBytes=Math.max(1,Math.min(Number(process.env.MONITORING_MAX_PAYLOAD_MB)||8,32))*1024*1024;if(Buffer.byteLength(serialized)>maxBytes)return res.status(413).json({message:'Monitoring payload gateway chegarasidan katta'});
      const row=await Export.findOneAndUpdate({provider,payloadHash},{$setOnInsert:{provider,payloadHash,generatedAt:new Date(payload.generatedAt),recordedBy:req.user._id},$set:{status:'generated',deliveryError:''}},{upsert:true,new:true}),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(3000,Math.min(Number(process.env.MONITORING_TIMEOUT_MS)||20000,60000)));
      let response,responseText='',parsed=null;
      try{response=await fetch(gatewayUrl,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+config.token,'idempotency-key':payloadHash,'x-masofaviy2-payload-hash':payloadHash},body:serialized,signal:controller.signal});responseText=(await response.text()).slice(0,4000);try{parsed=JSON.parse(responseText)}catch{}}
      catch(e){row.status='failed';row.deliveryError=String(e.message||e).slice(0,2000);await row.save();audit(req,'MONITORING_SYNC_FAILED','MonitoringExport',row.id,{provider,payloadHash,error:row.deliveryError});return res.status(502).json({message:'Monitoring gatewayga yuborilmadi',error:row.deliveryError})}
      finally{clearTimeout(timer)}
      row.lastHttpStatus=response.status;row.deliveredAt=new Date();row.status=response.ok?'delivered':'failed';row.deliveryError=response.ok?'':('HTTP '+response.status+' '+responseText).slice(0,2000);
      if(response.ok&&parsed?.accepted===true){row.status='accepted';row.receiptReference=validateReceiptReference(parsed.reference||parsed.requestId||payloadHash.slice(0,16));row.gatewayRequestId=String(parsed.requestId||parsed.reference||'').slice(0,500)}
      await row.save();audit(req,response.ok?'MONITORING_SYNC_DELIVERED':'MONITORING_SYNC_FAILED','MonitoringExport',row.id,{provider,payloadHash,httpStatus:response.status,status:row.status,receiptReference:row.receiptReference||''});
      res.status(response.ok?200:502).json({ok:response.ok,provider,status:row.status,payloadHash,httpStatus:response.status,receiptReference:row.receiptReference||null,gatewayRequestId:row.gatewayRequestId||null});
    }catch(e){fail(res,e)}
  });

  app.patch('/api/lms/monitoring/exports/:id/receipt',auth,async(req,res)=>{
    try{if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});if(!mongoose.isValidObjectId(req.params.id))throw new Error('ID noto‘g‘ri');
      const status=String(req.body.status||'');if(!['delivered','accepted','rejected'].includes(status))throw new Error('Qabul holati noto‘g‘ri');if(req.body.confirmOfficialReceipt!==true)return res.status(400).json({message:'Rasmiy receipt ma’lumotini qayd etayotganingizni tasdiqlang'});
      const receiptReference=validateReceiptReference(req.body.receiptReference),row=await Export.findById(req.params.id);if(!row)return res.status(404).json({message:'Eksport qaydi topilmadi'});
      row.status=status;row.deliveredAt=row.deliveredAt||new Date();row.receiptReference=receiptReference;row.receiptNote=String(req.body.receiptNote||'').trim().slice(0,2000);await row.save();
      audit(req,'MONITORING_EXPORT_RECEIPT','MonitoringExport',row.id,{provider:row.provider,status,receiptReference,manual:true});res.json(row);
    }catch(e){fail(res,e)}
  });

  return {MonitoringExport:Export,buildMonitoringSnapshot:buildSnapshot,monitoringReadiness:readinessFor};
}
