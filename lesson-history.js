import {historyDateRange,lessonHistoryDocument,historyCsv} from './lesson-history-rules.js';

// Past lesson histories are restricted by the authenticated teacher/management scope.
// Do not expose individual proctor results to other students or other groups.
export function installLessonHistory(app,{mongoose,auth,User,Schedule,Structure,Attendance,LiveSession,resolveScope}){
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const wrap=handler=>async(req,res)=>{try{await handler(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'Tarixni olishda xatolik'});else res.destroy()}};
 const globalRoles=new Set(['superadmin','admin','rectorate']);
 const scopedRoles=new Set(['dean','department','tutor']);
 const authorize=async user=>{
   if(user.role==='teacher')return {teacherId:user._id,groupIds:null};
   if(globalRoles.has(user.role))return {teacherId:null,groupIds:null};
   if(scopedRoles.has(user.role)){
     const scope=await resolveScope(user,{});
     return {teacherId:null,groupIds:scope.groupIds||[]};
   }
   throw fail('Darslarning individual nazorat tarixi uchun ruxsat yo‘q',403);
 };
 const authorizedSession=async(user,session)=>{
   const scope=await authorize(user);
   if(scope.teacherId&&String(scope.teacherId)!==String(session.teacherId))throw fail('Bu dars sizga biriktirilmagan',403);
   if(scope.groupIds&&!scope.groupIds.some(g=>String(g)===String(session.groupId)))throw fail('Guruh vakolat doirasida emas',403);
 };
 const selectSessions=async(req)=>{
   const range=historyDateRange(req.query.from,req.query.to);
   const scope=await authorize(req.user);
   const filter={dateKey:{$gte:range.from,$lte:range.to},startedAt:{$ne:null}};
   if(scope.teacherId)filter.teacherId=scope.teacherId;
   if(scope.groupIds)filter.groupId={$in:scope.groupIds};
   if(req.query.groupId){
     if(!mongoose.isValidObjectId(req.query.groupId))throw fail('Guruh ID noto‘g‘ri');
     if(scope.groupIds&&!scope.groupIds.some(x=>String(x)===String(req.query.groupId)))throw fail('Guruh vakolat doirasida emas',403);
     filter.groupId=req.query.groupId;
   }
   const sessions=await LiveSession.find(filter).sort({dateKey:-1,startedAt:-1}).limit(251).lean();
   if(sessions.length>250)throw fail('250 dan ortiq dars topildi. Sana yoki guruh oralig‘ini toraytiring',422);
   return {sessions,range};
 };
 const expand=async(session)=>{
   const [schedule,group,attendances]=await Promise.all([
     Schedule.findById(session.scheduleId).select('title subject weekday start end teacherId groupId').lean(),
     Structure.findById(session.groupId).select('name externalId code').lean(),
     Attendance.find({lessonId:String(session.scheduleId),dateKey:session.dateKey}).select('-__v').lean()
   ]);
   const ids=new Set(attendances.map(a=>String(a.userId)));
   const roster=Array.isArray(session.rosterSnapshot)?session.rosterSnapshot:null;
   let students;
   if(roster){
     students=roster.map(s=>({_id:s.userId,fullName:s.fullName,login:s.login}));
   }else{
     const current=await User.find({role:'student',groupId:session.groupId}).select('_id fullName login').lean();
     current.forEach(s=>ids.add(String(s._id)));
     const ever=await User.find({_id:{$in:[...ids].filter(mongoose.isValidObjectId)},role:'student'}).select('_id fullName login').lean();
     students=[...new Map(ever.map(s=>[String(s._id),s])).values()];
   }
   const teacher=session.teacherSnapshot||await User.findById(session.teacherId).select('_id fullName login').lean()||{_id:session.teacherId,fullName:'O‘qituvchi profili mavjud emas',login:''};
   return lessonHistoryDocument({session,schedule,group,teacher,students,attendances});
 };
 app.get('/api/lesson-history',auth,wrap(async(req,res)=>{
   const {sessions,range}=await selectSessions(req);
   const [schedules,groups]=await Promise.all([
     Schedule.find({_id:{$in:sessions.map(s=>s.scheduleId)}}).select('_id subject title start end').lean(),
     Structure.find({_id:{$in:sessions.map(s=>s.groupId)}}).select('_id name externalId').lean()
   ]);
   const scheduleById=new Map(schedules.map(s=>[String(s._id),s]));
   const groupById=new Map(groups.map(g=>[String(g._id),g]));
   res.set('Cache-Control','private,no-store');
   res.json({range,sessions:sessions.map(s=>({
     id:String(s._id),dateKey:s.dateKey,groupId:String(s.groupId),
     groupName:groupById.get(String(s.groupId))?.name||'Guruh',
     subject:scheduleById.get(String(s.scheduleId))?.subject||'',
     title:scheduleById.get(String(s.scheduleId))?.title||'Dars',
     start:scheduleById.get(String(s.scheduleId))?.start||'',
     end:scheduleById.get(String(s.scheduleId))?.end||'',
     startedAt:s.startedAt,endedAt:s.endedAt,status:s.status,
     participantPeak:s.participantPeak||0
   }))});
 }));
 app.get('/api/lesson-history/export',auth,wrap(async(req,res)=>{
   const {sessions}=await selectSessions(req);
   const mode=req.query.mode==='summary'?'summary':'timeline';
   const documents=[];
   for(const session of sessions)documents.push(await expand(session));
   const estimated=documents.reduce((sum,doc)=>sum+[doc.teacher,...doc.students].filter(Boolean).reduce((s,p)=>s+1+p.presenceIntervals.length+p.proctorTimeline.length+p.checkpoints.length,0),0);
   if(mode==='timeline'&&estimated>50000)throw fail('Eksport juda katta (50 000 dan ortiq vaqt satri). Sana va guruhni toraytiring',422);
   res.set('Cache-Control','private,no-store');
   res.set('Content-Type','text/csv; charset=utf-8');
   res.set('Content-Disposition','attachment; filename="dars-tarixi-'+mode+'.csv"');
   res.send(historyCsv(documents,{mode}));
 }));
 app.get('/api/lesson-history/:id',auth,wrap(async(req,res)=>{
   if(!mongoose.isValidObjectId(req.params.id))throw fail('Dars sessiyasi ID noto‘g‘ri');
   const session=await LiveSession.findById(req.params.id).lean();
   if(!session)throw fail('Dars tarixi topilmadi',404);
   await authorizedSession(req.user,session);
   res.set('Cache-Control','private,no-store');
   if(req.query.format==='csv'){
     res.set('Content-Type','text/csv; charset=utf-8');
     res.set('Content-Disposition','attachment; filename="dars-'+session.dateKey+'.csv"');
     return res.send(historyCsv([await expand(session)],{mode:req.query.mode==='summary'?'summary':'timeline'}));
   }
   res.json(await expand(session));
 }));
}
