// HALLAYM EDU — forms of study across the university: group form/shift/sessions, bell schedule per form,
// classroom (offline/hybrid) attendance by roster or rotating QR code, and an overview per form.
import crypto from 'node:crypto';
import {EDU_FORMS,FORM_KEYS,LESSON_MODES,SHIFTS,LANGUAGES,DEGREES,DEFAULT_BELLS,cleanForm,formOf,lessonMode,modeIsLive,modeIsPhysical,validateBells,cleanSessions,sessionBlocked,sessionStatus,CHECKIN_SLOT_MS,checkinCode,slotAt,verifyCheckin,checkinStatus,attendanceRate} from './education-forms.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});

export function installAcademicForms(app,{mongoose,User,Structure,Schedule,Attendance,auth,audit=()=>{},hasPermission,resolveScope,GLOBAL_SCOPE_ROLES,localDateKey,localWeekday,localMinuteOfDay,timeToMinutes,LATE_AFTER_MINUTES,models=null,now=()=>Date.now()}){
  const EduSetting=models?.EduSetting||mongoose.models.EduSetting||mongoose.model('EduSetting',new mongoose.Schema({key:{type:String,unique:true,required:true},value:{type:mongoose.Schema.Types.Mixed}},{timestamps:true}));
  const sid=v=>String(v?._id||v||'');
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'})}};
  const isGlobal=user=>GLOBAL_SCOPE_ROLES.has(user.role);

  // ---------- bell schedule ----------
  let bellsCache=null;
  async function bells(){if(bellsCache)return bellsCache;const row=await EduSetting.findOne({key:'bells'}).lean().catch(()=>null);try{bellsCache=validateBells(row?.value||DEFAULT_BELLS)}catch{bellsCache=validateBells(DEFAULT_BELLS)}return bellsCache}

  // ---------- correspondence (sirtqi) session gate ----------
  // Cached map of sirtqi groups so the hot paths (today's lessons, live rooms, auto start) stay synchronous.
  const gate={groups:new Map(),at:0};
  async function refreshGate(){try{const rows=await Structure.find({type:'group',educationForm:'sirtqi',active:true}).select('_id educationForm sessions').lean();gate.groups=new Map(rows.map(g=>[sid(g._id),g]));gate.at=now()}catch{}}
  const timer=setInterval(refreshGate,60000);timer.unref?.();setTimeout(refreshGate,500).unref?.();
  const lessonRunsOn=(lesson,dateKey=localDateKey())=>{const g=gate.groups.get(sid(lesson?.groupId));return !g||!sessionBlocked(g,dateKey)};

  // ---------- scope helpers ----------
  async function scopedGroups(user){
    if(isGlobal(user))return Structure.find({type:'group',active:true}).lean();
    const scope=await resolveScope(user,{});const ids=scope.groupIds.map(sid);
    return ids.length?Structure.find({_id:{$in:ids},type:'group',active:true}).lean():[];
  }
  async function canManageGroup(user,group){
    if(hasPermission(user,'structure.manage'))return true;
    if(!['dean','department'].includes(user.role))return false;
    try{const scope=await resolveScope(user,{});return scope.groupIds.some(id=>sid(id)===sid(group._id))}catch{return false}
  }
  async function lessonFor(req,id,{manage=true}={}){
    if(!mongoose.isValidObjectId(id))throw fail('Dars ID noto‘g‘ri');
    const lesson=await Schedule.findById(id).lean();if(!lesson)throw fail('Dars topilmadi',404);
    if(!manage)return lesson;
    if(sid(lesson.teacherId)===sid(req.user._id))return lesson;
    if(!hasPermission(req.user,'attendance.manage'))throw fail('Bu dars davomati uchun ruxsat yo‘q',403);
    if(!isGlobal(req.user)){let ok=false;try{const scope=await resolveScope(req.user,{});ok=scope.groupIds.some(g=>sid(g)===sid(lesson.groupId))}catch{}if(!ok)throw fail('Bu guruh davomati uchun ruxsat yo‘q',403)}
    return lesson;
  }
  const isToday=lesson=>lesson.date?lesson.date===localDateKey():lesson.weekday===localWeekday();

  // ---------- meta + bells ----------
  app.get('/api/edu/meta',auth,wrap(async(req,res)=>res.json({forms:EDU_FORMS,modes:LESSON_MODES,shifts:SHIFTS,languages:LANGUAGES,degrees:DEGREES,bells:await bells(),lateAfterMinutes:LATE_AFTER_MINUTES,checkinSlotMs:CHECKIN_SLOT_MS})));
  app.put('/api/edu/bells',auth,wrap(async(req,res)=>{
    if(!['admin','superadmin'].includes(req.user.role)&&!hasPermission(req.user,'structure.manage'))throw fail('Para vaqtlarini faqat administrator o‘zgartiradi',403);
    const value=validateBells(req.body?.bells||{});await EduSetting.findOneAndUpdate({key:'bells'},{$set:{value}},{upsert:true,new:true});bellsCache=value;
    audit(req,'EDU_BELLS_UPDATE','EduSetting','bells');res.json({bells:value});
  }));

  // ---------- group education settings ----------
  app.patch('/api/edu/groups/:id',auth,wrap(async(req,res)=>{
    if(!mongoose.isValidObjectId(req.params.id))throw fail('Guruh ID noto‘g‘ri');
    const g=await Structure.findOne({_id:req.params.id,type:'group'}).lean();if(!g)throw fail('Guruh topilmadi',404);
    if(!await canManageGroup(req.user,g))throw fail('Bu guruhni tahrirlash huquqi yo‘q',403);
    const b=req.body||{},set={};
    if(b.educationForm!==undefined)set.educationForm=cleanForm(b.educationForm);
    if(b.shift!==undefined)set.shift=SHIFTS[b.shift]?Number(b.shift):undefined;
    if(b.language!==undefined)set.language=LANGUAGES[b.language]?b.language:undefined;
    if(b.degree!==undefined)set.degree=DEGREES[b.degree]?b.degree:undefined;
    if(b.courseYear!==undefined){const n=Number(b.courseYear);set.courseYear=n>=1&&n<=6?n:undefined}
    if(b.sessions!==undefined)set.sessions=cleanSessions(b.sessions);
    await Structure.updateOne({_id:g._id},{$set:set});await refreshGate();
    audit(req,'EDU_GROUP_UPDATE','Structure',sid(g._id),{fields:Object.keys(set)});res.json({ok:true});
  }));

  app.patch('/api/edu/groups-bulk',auth,wrap(async(req,res)=>{
    const ids=(Array.isArray(req.body?.ids)?req.body.ids:[]).map(String).filter(mongoose.isValidObjectId).slice(0,500);
    if(!ids.length)throw fail('Guruhlarni tanlang');
    const set={};if(req.body.educationForm!==undefined)set.educationForm=cleanForm(req.body.educationForm);if(req.body.shift!==undefined)set.shift=SHIFTS[req.body.shift]?Number(req.body.shift):undefined;
    if(!Object.keys(set).length)throw fail('O‘zgartirish tanlanmagan');
    const groups=await Structure.find({_id:{$in:ids},type:'group'}).lean();let saved=0;
    for(const g of groups){if(!await canManageGroup(req.user,g))continue;await Structure.updateOne({_id:g._id},{$set:set});saved++}
    if(!saved)throw fail('Tanlangan guruhlarni tahrirlash huquqi yo‘q',403);
    await refreshGate();audit(req,'EDU_GROUP_BULK','Structure','bulk',{saved,...set});res.json({saved});
  }));

  // ---------- overview per form ----------
  app.get('/api/edu/overview',auth,wrap(async(req,res)=>{
    if(['student','teacher','staff'].includes(req.user.role))throw fail('Bu panel rahbariyat va dekanat uchun',403);
    const groups=await scopedGroups(req.user),gids=groups.map(g=>sid(g._id)),dateKey=localDateKey(),nowMin=localMinuteOfDay(),day=localWeekday();
    const byGroup=new Map(groups.map(g=>[sid(g._id),g]));
    const students=gids.length?await User.find({role:'student',active:true,groupId:{$in:gids}}).select('_id groupId').lean():[];
    const studentsPerGroup=new Map();for(const s of students)studentsPerGroup.set(sid(s.groupId),(studentsPerGroup.get(sid(s.groupId))||0)+1);
    const todays=gids.length?(await Schedule.find({groupId:{$in:gids},kind:{$ne:'final_exam'},$or:[{weekday:day,date:{$in:[null,'']}},{date:dateKey}]}).populate('teacherId','fullName').lean()).filter(l=>!sessionBlocked(byGroup.get(sid(l.groupId)),dateKey)):[];
    const started=todays.filter(l=>timeToMinutes(l.start)<=nowMin);
    const att=started.length?await Attendance.find({dateKey,lessonId:{$in:started.map(l=>sid(l._id))}}).select('lessonId status').lean():[];
    const attended=new Map();for(const a of att)if(['present','late'].includes(a.status))attended.set(a.lessonId,(attended.get(a.lessonId)||0)+1);
    const forms=FORM_KEYS.map(key=>{
      const fg=groups.filter(g=>formOf(g)===key),fgIds=new Set(fg.map(g=>sid(g._id)));
      const lessons=todays.filter(l=>fgIds.has(sid(l.groupId))),st=started.filter(l=>fgIds.has(sid(l.groupId)));
      const expected=st.reduce((n,l)=>n+(studentsPerGroup.get(sid(l.groupId))||0),0),came=st.reduce((n,l)=>n+(attended.get(sid(l._id))||0),0);
      const modes={offline:0,online:0,hybrid:0};for(const l of lessons)modes[lessonMode(l)]++;
      return {key,...EDU_FORMS[key],groups:fg.length,students:fg.reduce((n,g)=>n+(studentsPerGroup.get(sid(g._id))||0),0),lessonsToday:lessons.length,modes,startedLessons:st.length,expected,attended:came,rate:attendanceRate(came,expected)};
    });
    const sessions=groups.filter(g=>formOf(g)==='sirtqi').map(g=>{const s=sessionStatus(g.sessions||[],dateKey);return {groupId:sid(g._id),group:g.name,code:g.externalId||g.code||'',state:s.state,session:s.session,count:(g.sessions||[]).length}});
    const lessons=todays.sort((a,b)=>a.start.localeCompare(b.start)).map(l=>{const g=byGroup.get(sid(l.groupId));return {_id:sid(l._id),title:l.title,start:l.start,end:l.end,room:l.room||'',mode:lessonMode(l),form:formOf(g),group:g?.name||'',teacher:l.teacherId?.fullName||'',students:studentsPerGroup.get(sid(l.groupId))||0,attended:attended.get(sid(l._id))||0,state:timeToMinutes(l.end)<=nowMin?'done':(timeToMinutes(l.start)<=nowMin?'now':'later')}});
    res.json({date:dateKey,forms,sessions,lessons,totals:{groups:groups.length,students:students.length,lessonsToday:todays.length}});
  }));
  app.get('/api/edu/groups',auth,wrap(async(req,res)=>{
    if(['student','staff'].includes(req.user.role))throw fail('Ruxsat yo‘q',403);
    const groups=await scopedGroups(req.user),gids=groups.map(g=>sid(g._id));
    const students=gids.length?await User.find({role:'student',active:true,groupId:{$in:gids}}).select('groupId').lean():[];
    const count=new Map();for(const s of students)count.set(sid(s.groupId),(count.get(sid(s.groupId))||0)+1);
    const parents=new Map((await Structure.find({_id:{$in:[...new Set(groups.map(g=>sid(g.parentId)).filter(mongoose.isValidObjectId))]}}).select('_id name').lean()).map(p=>[sid(p._id),p.name]));
    res.json(groups.map(g=>({_id:sid(g._id),name:g.name,code:g.externalId||g.code||'',kafedra:parents.get(sid(g.parentId))||'',educationForm:formOf(g),shift:g.shift||null,language:g.language||'',degree:g.degree||'',courseYear:g.courseYear||null,sessions:g.sessions||[],students:count.get(sid(g._id))||0,canEdit:hasPermission(req.user,'structure.manage')||['dean','department'].includes(req.user.role)})).sort((a,b)=>a.name.localeCompare(b.name)));
  }));

  // ---------- teacher: today's classroom lessons + roster ----------
  app.get('/api/edu/my-lessons',auth,wrap(async(req,res)=>{
    if(req.user.role!=='teacher'&&!hasPermission(req.user,'attendance.manage'))throw fail('Ruxsat yo‘q',403);
    const dateKey=localDateKey(),day=localWeekday();
    const rows=(await Schedule.find({teacherId:req.user._id,kind:{$ne:'final_exam'},$or:[{weekday:day,date:{$in:[null,'']}},{date:dateKey}]}).populate('groupId','name externalId code educationForm sessions').sort({start:1}).lean()).filter(l=>!sessionBlocked(l.groupId,dateKey));
    const att=rows.length?await Attendance.find({dateKey,lessonId:{$in:rows.map(l=>sid(l._id))}}).select('lessonId status').lean():[];
    res.json(rows.map(l=>({_id:sid(l._id),title:l.title,start:l.start,end:l.end,room:l.room||'',mode:lessonMode(l),form:formOf(l.groupId),group:l.groupId?.name||'',attended:att.filter(a=>a.lessonId===sid(l._id)&&['present','late'].includes(a.status)).length,checkinOpen:Boolean(openWindow(sid(l._id),dateKey))})));
  }));
  app.get('/api/edu/lessons/:id/roster',auth,wrap(async(req,res)=>{
    const lesson=await lessonFor(req,req.params.id),dateKey=localDateKey();
    const [students,att,group]=await Promise.all([User.find({role:'student',active:true,groupId:lesson.groupId}).select('_id fullName login').sort({fullName:1}).lean(),Attendance.find({lessonId:sid(lesson._id),dateKey}).lean(),Structure.findById(lesson.groupId).select('name educationForm').lean()]);
    const byUser=new Map(att.map(a=>[sid(a.userId),a]));
    res.json({lesson:{_id:sid(lesson._id),title:lesson.title,start:lesson.start,end:lesson.end,room:lesson.room||'',mode:lessonMode(lesson),group:group?.name||'',form:formOf(group)},dateKey,today:isToday(lesson),students:students.map(s=>{const a=byUser.get(sid(s._id));return {_id:sid(s._id),fullName:s.fullName,login:s.login,status:a?.status||null,method:a?.checkinMethod||(a?.manualMarkedAt?'manual':(a?.joinedAt?'online':null)),at:a?.checkinAt||a?.manualMarkedAt||a?.joinedAt||null}})});
  }));

  // ---------- rotating QR / code check-in ----------
  const windows=new Map(); // `${scheduleId}:${dateKey}` -> {secret, closesAt, names:[], attempts:Map}
  const winKey=(id,dateKey)=>id+':'+dateKey;
  function openWindow(id,dateKey){const w=windows.get(winKey(id,dateKey));if(w&&w.closesAt>now())return w;if(w)windows.delete(winKey(id,dateKey));return null}
  const winView=(id,w)=>{const t=now();return {open:true,code:checkinCode(w.secret,slotAt(t)),slotMs:CHECKIN_SLOT_MS,nextAt:(slotAt(t)+1)*CHECKIN_SLOT_MS,closesAt:w.closesAt,count:w.names.length,recent:w.names.slice(-8).reverse(),payload:'checkin='+id+':'}};
  app.post('/api/edu/lessons/:id/checkin/open',auth,wrap(async(req,res)=>{
    const lesson=await lessonFor(req,req.params.id);if(!isToday(lesson))throw fail('Davomat kodi faqat bugungi dars uchun ochiladi');
    if(!modeIsPhysical(lessonMode(lesson)))throw fail('Onlayn darsda davomat jonli xona orqali olinadi');
    const dateKey=localDateKey(),minutes=Math.max(3,Math.min(90,Number(req.body?.minutes)||15));
    const endMs=now()+Math.max(0,timeToMinutes(lesson.end)-localMinuteOfDay())*60000;
    const w=openWindow(sid(lesson._id),dateKey)||{secret:crypto.randomBytes(16).toString('hex'),names:[],attempts:new Map()};
    w.closesAt=Math.max(now()+minutes*60000,Math.min(endMs,now()+90*60000));windows.set(winKey(sid(lesson._id),dateKey),w);
    audit(req,'CHECKIN_OPEN','Schedule',sid(lesson._id),{dateKey});res.json(winView(sid(lesson._id),w));
  }));
  app.get('/api/edu/lessons/:id/checkin',auth,wrap(async(req,res)=>{const lesson=await lessonFor(req,req.params.id);const w=openWindow(sid(lesson._id),localDateKey());res.json(w?winView(sid(lesson._id),w):{open:false})}));
  app.post('/api/edu/lessons/:id/checkin/close',auth,wrap(async(req,res)=>{const lesson=await lessonFor(req,req.params.id);windows.delete(winKey(sid(lesson._id),localDateKey()));res.json({open:false})}));
  app.post('/api/edu/checkin',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')throw fail('Davomat kodi talabalar uchun');
    const id=String(req.body?.scheduleId||''),code=String(req.body?.code||'').replace(/\D/g,'');
    if(code.length!==6)throw fail('6 xonali kodni kiriting');
    const dateKey=localDateKey(),nowMs=now();
    // Without a lesson id the code is matched against the open windows of this student's group (typed code).
    const student=await User.findById(req.user._id).select('_id fullName groupId').lean();
    let candidates=[];
    if(id){if(!mongoose.isValidObjectId(id))throw fail('Dars ID noto‘g‘ri');candidates=[id]}
    else for(const k of windows.keys()){const [sId,dk]=k.split(':');if(dk===dateKey)candidates.push(sId)}
    let lesson=null,w=null;
    for(const c of candidates){const win=openWindow(c,dateKey);if(!win)continue;const l=await Schedule.findById(c).select('_id groupId start end weekday date mode liveEnabled title').lean();if(!l||sid(l.groupId)!==sid(student?.groupId))continue;
      const tries=win.attempts.get(sid(req.user._id))||0;if(tries>=8)throw fail('Juda ko‘p noto‘g‘ri urinish. O‘qituvchiga murojaat qiling.',429);
      if(verifyCheckin(win.secret,code,nowMs)){lesson=l;w=win;break}
      if(id){win.attempts.set(sid(req.user._id),tries+1)}}
    if(!lesson)throw fail(candidates.length?'Kod noto‘g‘ri yoki eskirgan. Ekrandagi yangi kodni kiriting.':'Hozir davomat ochiq dars yo‘q',candidates.length?400:404);
    const status=checkinStatus(lesson.start,localMinuteOfDay(),LATE_AFTER_MINUTES),at=new Date(nowMs);
    let row=await Attendance.findOne({lessonId:sid(lesson._id),userId:req.user._id,dateKey});
    if(row&&['present','late'].includes(row.status))return res.json({ok:true,already:true,status:row.status,lesson:lesson.title});
    if(!row)row=new Attendance({lessonId:sid(lesson._id),userId:req.user._id,dateKey,minutes:0,checkpoints:[]});
    row.status=status;row.checkinAt=at;row.checkinMethod='qr';await row.save();
    w.names.push({name:student.fullName,at:at.toISOString(),status});
    audit(req,'CHECKIN','Attendance',sid(lesson._id),{status});
    res.json({ok:true,status,lesson:lesson.title});
  }));

  return {lessonRunsOn,refreshGate,bells};
}
