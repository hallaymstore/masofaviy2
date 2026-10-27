// Daily attendance board: every lesson of a day, grouped by student group, with per-student status.
// Teachers see and mark their own lessons; supervisors (rectorate, dean, department, tutor, admin)
// see every group in their scope directly. Marking is limited to the lesson teacher and attendance.manage.
import {dailyAttendanceCounts,attendanceDateKey,weekdayOfDateKey,canMarkAttendanceOn} from './daily-attendance-rules.js';

const SUPERVISOR_ROLES=new Set(['superadmin','admin','tech','rectorate','dean','department','tutor']);
const STATUSES=new Set(['present','late','absent','excused']);

export function installDailyAttendance(app,{mongoose,auth,User,Schedule,Attendance,LiveSession,resolveScope,hasPermission,audit,lessonRunsOn=()=>true,localDateKey,io}){
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const wrap=handler=>async(req,res)=>{try{await handler(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'Davomatni olishda xatolik'})}};
 const oid=v=>mongoose.isValidObjectId(v);

 // Returns a Mongo filter for the schedules the user may see, or throws 403.
 const lessonFilter=async(user,query={})=>{
  if(user.role==='teacher'){const f={teacherId:user._id};if(oid(query.groupId))f.groupId=query.groupId;return f}
  if(!SUPERVISOR_ROLES.has(user.role))throw fail('Kunlik davomatni ko‘rish huquqi yo‘q',403);
  const scope=await resolveScope(user,query);
  return scope.scheduleScope&&Object.keys(scope.scheduleScope).length?{...scope.scheduleScope}:{};
 };
 const canEdit=(user,lesson)=>String(lesson.teacherId?._id||lesson.teacherId)===String(user._id)||hasPermission(user,'attendance.manage');
 const studentsOf=async groupIds=>{
  const rows=await User.find({role:'student',active:true,groupId:{$in:groupIds}}).select('fullName login groupId').sort({fullName:1}).lean();
  const by=new Map();for(const s of rows){const k=String(s.groupId);if(!by.has(k))by.set(k,[]);by.get(k).push(s)}
  return by;
 };
 // First record per student for the lesson/day (reconnects may create more than one).
 const attendanceMap=async(lessonIds,dateKey)=>{
  const rows=lessonIds.length?await Attendance.find({lessonId:{$in:lessonIds},dateKey}).sort({createdAt:1}).populate('manualMarkedBy','fullName').lean():[];
  const by=new Map();for(const r of rows){const k=r.lessonId+':'+String(r.userId);if(!by.has(k))by.set(k,r)}
  return by;
 };

 app.get('/api/attendance/daily',auth,wrap(async(req,res)=>{
  const dateKey=attendanceDateKey(req.query.date,localDateKey());
  const filter={...await lessonFilter(req.user,req.query),weekday:weekdayOfDateKey(dateKey),kind:{$ne:'final_exam'}};
  const lessons=(await Schedule.find(filter).populate('groupId','name code externalId').populate('teacherId','fullName login').sort({start:1}).lean()).filter(x=>lessonRunsOn(x,dateKey));
  const groupIds=[...new Set(lessons.map(x=>String(x.groupId?._id||x.groupId)))];
  const [students,marks,sessions]=await Promise.all([
   studentsOf(groupIds),
   attendanceMap(lessons.map(x=>String(x._id)),dateKey),
   LiveSession.find({dateKey,scheduleId:{$in:lessons.map(x=>x._id)}}).select('scheduleId status startedAt endedAt').lean()
  ]);
  const sessionBy=new Map(sessions.map(s=>[String(s.scheduleId),s]));
  const groups=new Map(),totals={lessons:lessons.length,expected:0,present:0,late:0,absent:0,excused:0,unmarked:0,manual:0};
  for(const l of lessons){
   const gid=String(l.groupId?._id||l.groupId),roster=students.get(gid)||[];
   const counts=dailyAttendanceCounts(roster.map(s=>marks.get(String(l._id)+':'+String(s._id))));
   for(const k of Object.keys(counts))if(k in totals)totals[k]+=counts[k];
   const s=sessionBy.get(String(l._id));
   if(!groups.has(gid))groups.set(gid,{group:{_id:gid,name:l.groupId?.name||'Guruh',code:l.groupId?.code||''},students:roster.length,lessons:[]});
   groups.get(gid).lessons.push({scheduleId:String(l._id),title:l.title,subject:l.subject||'',kind:l.kind,start:l.start,end:l.end,room:l.room||'',teacher:{_id:String(l.teacherId?._id||''),fullName:l.teacherId?.fullName||''},session:s?{status:s.status,startedAt:s.startedAt,endedAt:s.endedAt}:null,counts,canEdit:canEdit(req.user,l)&&canMarkAttendanceOn(dateKey,localDateKey(),req.user.role)});
  }
  totals.rate=totals.expected?Math.round((totals.present+totals.late)/totals.expected*100):0;
  res.json({dateKey,today:localDateKey(),totals,groups:[...groups.values()].sort((a,b)=>a.group.name.localeCompare(b.group.name))});
 }));

 const loadLesson=async(req)=>{
  if(!oid(req.params.scheduleId))throw fail('Dars ID noto‘g‘ri');
  const lesson=await Schedule.findById(req.params.scheduleId).populate('groupId','name').populate('teacherId','fullName').lean();
  if(!lesson)throw fail('Dars topilmadi',404);
  const filter=await lessonFilter(req.user,{});
  if(filter.teacherId&&String(filter.teacherId)!==String(lesson.teacherId?._id))throw fail('Bu dars sizga biriktirilmagan',403);
  if(filter.groupId?.$in&&!filter.groupId.$in.some(g=>String(g)===String(lesson.groupId?._id)))throw fail('Guruh vakolat doirangizda emas',403);
  return lesson;
 };

 app.get('/api/attendance/daily/:scheduleId',auth,wrap(async(req,res)=>{
  const lesson=await loadLesson(req),dateKey=attendanceDateKey(req.query.date,localDateKey()),gid=lesson.groupId?._id;
  const [roster,marks]=await Promise.all([studentsOf([gid]),attendanceMap([String(lesson._id)],dateKey)]);
  const students=(roster.get(String(gid))||[]).map(s=>{const r=marks.get(String(lesson._id)+':'+String(s._id));return {_id:s._id,fullName:s.fullName,login:s.login,status:r?.status||'unmarked',minutes:r?.minutes||0,joinedAt:r?.joinedAt||null,leftAt:r?.leftAt||null,manual:Boolean(r?.manualMarkedAt),manualMarkedAt:r?.manualMarkedAt||null,manualMarkedBy:r?.manualMarkedBy?.fullName||'',note:r?.manualNote||''}});
  res.json({dateKey,lesson:{_id:lesson._id,title:lesson.title,start:lesson.start,end:lesson.end,group:lesson.groupId?.name||'',teacher:lesson.teacherId?.fullName||''},canEdit:canEdit(req.user,lesson)&&canMarkAttendanceOn(dateKey,localDateKey(),req.user.role),students});
 }));

 app.post('/api/attendance/daily/:scheduleId',auth,wrap(async(req,res)=>{
  const lesson=await loadLesson(req),dateKey=attendanceDateKey(req.body.date,localDateKey());
  if(!canEdit(req.user,lesson))throw fail('Davomatni belgilash huquqi yo‘q',403);
  if(!canMarkAttendanceOn(dateKey,localDateKey(),req.user.role))throw fail('Bu sana uchun davomatni o‘zgartirib bo‘lmaydi (kelajak yoki 7 kundan eski)',409);
  const records=Array.isArray(req.body.records)?req.body.records:[];
  if(!records.length||records.length>300)throw fail('Davomat ro‘yxati bo‘sh yoki juda katta');
  const gid=lesson.groupId?._id,allowed=new Set((await User.find({role:'student',active:true,groupId:gid}).select('_id').lean()).map(x=>String(x._id)));
  const note=String(req.body.note||'').slice(0,300),now=new Date(),actor=oid(req.user._id)?req.user._id:undefined,counts={present:0,late:0,absent:0,excused:0};let saved=0;
  for(const item of records){
   const sid=String(item?.studentId||''),status=String(item?.status||'');
   if(!allowed.has(sid)||!STATUSES.has(status))continue;
   let row=await Attendance.findOne({lessonId:String(lesson._id),userId:sid,dateKey}).sort({createdAt:1});
   if(!row)row=new Attendance({lessonId:String(lesson._id),userId:sid,dateKey,minutes:0,checkpoints:[]});
   if(row.status===status&&row.manualMarkedAt)continue;
   row.status=status;if(status==='absent'&&row.joinedAt&&!row.leftAt)row.leftAt=now;
   row.manualMarkedAt=now;row.manualMarkedBy=actor;row.manualNote=note;
   await row.save();saved++;counts[status]++;
  }
  audit(req,'ATTENDANCE_DAILY_SAVE','Attendance',String(lesson._id),{dateKey,groupId:String(gid),saved,...counts});
  io?.to('lesson:'+String(lesson._id)).emit('attendance:manual-saved',{scheduleId:String(lesson._id),manual:true,saved,...counts,at:now.toISOString()});
  res.json({ok:true,dateKey,saved,...counts});
 }));
}
