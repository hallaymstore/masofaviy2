// HALLAYM EDU — inclusive education API: individual accommodation profiles (student request → coordinator decision),
// privacy-scoped views for teachers/deans/tutors, support staff (sign-language interpreters, assistants), caption
// transcripts of live lessons, subtitle files for video lessons and personal accessibility preferences.
// Need categories and internal notes are visible only to the student and coordinators (`inclusion.manage`).
import {NEEDS,ACCOMMODATIONS,ACC_KEYS,SUPPORT_KINDS,PROFILE_STATUSES,cleanNeeds,cleanAccommodations,hasAny,accommodationChips,activeAccommodation,
  teacherView,ownView,cleanPrefs,cleanSegment,transcriptToVtt,transcriptToText,normalizeSubtitles,subtitlesToText} from './inclusion-rules.js';

const MAX_LINES=6000,FLUSH_MS=4000,CACHE_MS=60000;
const DAY=/^\d{4}-\d{2}-\d{2}$/;

export function installInclusion(app,{mongoose,User,Structure,Schedule,auth,audit=()=>{},hasPermission,resolveScope,resolveUserGroupId,GLOBAL_SCOPE_ROLES=new Set(['admin','superadmin']),
  localDateKey,localWeekday,scheduleAccess,models={},now=()=>Date.now()}){
  const O=mongoose.Schema.Types.ObjectId,Mixed=mongoose.Schema.Types.Mixed;
  const def=(name,schema)=>models[name]||mongoose.models[name]||mongoose.model(name,schema);
  const Profile=def('InclusionProfile',new mongoose.Schema({userId:{type:O,ref:'User',required:true,unique:true},status:{type:String,enum:Object.keys(PROFILE_STATUSES),default:'none',index:true},
    needs:[String],accommodations:{type:Mixed,default:{}},request:{type:Mixed,default:null},consentTeachers:{type:Boolean,default:true},coordinatorNote:String,teacherNote:String,decisionNote:String,
    validUntil:String,documentChecked:Boolean,reviewedBy:{type:O,ref:'User'},reviewedAt:Date,history:{type:[Mixed],default:[]}},{timestamps:true,minimize:false}));
  const Support=def('InclusionSupport',new mongoose.Schema({userId:{type:O,ref:'User',required:true,index:true},kind:{type:String,enum:Object.keys(SUPPORT_KINDS),required:true},
    groupIds:[{type:O,ref:'Structure'}],note:String,active:{type:Boolean,default:true},createdBy:{type:O,ref:'User'}},{timestamps:true}));
  const transcriptSchema=new mongoose.Schema({scheduleId:{type:O,ref:'Schedule',required:true},dateKey:{type:String,required:true},groupId:{type:O,index:true},teacherId:{type:O,index:true},
    title:String,lang:String,startedAt:Date,lines:{type:[Mixed],default:[]},lineCount:{type:Number,default:0}},{timestamps:true});
  transcriptSchema.index?.({scheduleId:1,dateKey:1},{unique:true});
  const Transcript=def('LessonTranscript',transcriptSchema);
  const Prefs=def('A11yPrefs',new mongoose.Schema({userId:{type:O,ref:'User',required:true,unique:true},prefs:{type:Mixed,default:{}}},{timestamps:true,minimize:false}));
  const Caption=def('VideoCaption',new mongoose.Schema({videoId:{type:O,ref:'VideoLesson',required:true,unique:true},vtt:String,transcript:String,cues:Number,lang:String,updatedBy:{type:O,ref:'User'}},{timestamps:true}));
  const Video=()=>models.VideoLesson||mongoose.models.VideoLesson;

  const fail=(message,status=400)=>Object.assign(new Error(message),{status});
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'Bajarilmadi'})}};
  const valid=id=>{if(!mongoose.isValidObjectId(id))throw fail('ID noto‘g‘ri')};
  const today=()=>localDateKey(new Date(now()));
  const isCoord=u=>Boolean(u)&&hasPermission(u,'inclusion.manage');
  const SCOPED=['dean','department','tutor'];
  const sameId=(a,b)=>String(a?._id||a||'')===String(b?._id||b||'');
  async function scopeGroupIds(user){try{const s=await resolveScope(user,{});return (s.groupIds||[]).map(String)}catch{return []}}
  async function groupNames(ids){const list=[...new Set(ids.filter(Boolean).map(String))].filter(mongoose.isValidObjectId);if(!list.length)return new Map();const rows=await Structure.find({_id:{$in:list}}).select('name').lean();return new Map(rows.map(g=>[String(g._id),g.name]))}
  const userGroup=async u=>u?.groupId||(resolveUserGroupId?await resolveUserGroupId(u):null);

  // ---- caches used by the rest of the platform (tests, deadlines, live rooms) ----
  const accCache=new Map();
  async function accommodationFor(userId){
    const key=String(userId||'');if(!mongoose.isValidObjectId(key))return null;
    const hit=accCache.get(key);if(hit&&now()-hit.at<CACHE_MS)return hit.acc;
    let acc=null;try{acc=activeAccommodation(await Profile.findOne({userId:key}).lean(),today())}catch{}
    accCache.set(key,{acc,at:now()});if(accCache.size>20000)accCache.clear();return acc;
  }
  let supportRows=[],supportAt=0;
  async function refreshSupport(force=false){if(!force&&now()-supportAt<CACHE_MS)return supportRows;try{supportRows=await Support.find({active:true}).lean();supportAt=now()}catch{}return supportRows}
  async function supportKindFor(userId,groupId){
    if(!userId||!groupId)return '';const rows=await refreshSupport();
    const mine=rows.filter(r=>sameId(r.userId,userId)&&(r.groupIds||[]).some(g=>sameId(g,groupId)));
    return mine.find(r=>r.kind==='sign')?.kind||mine[0]?.kind||'';
  }

  // ---- caption transcripts: buffered, flushed in batches ----
  const pending=new Map();
  async function flush(key){
    const b=pending.get(key);if(!b||!b.lines.length)return;const lines=b.lines.splice(0);
    try{
      const room=Math.max(0,MAX_LINES-(b.count||0)),take=lines.slice(0,room);if(!take.length)return;b.count=(b.count||0)+take.length;
      await Transcript.findOneAndUpdate({scheduleId:b.scheduleId,dateKey:b.dateKey},{$setOnInsert:{groupId:b.groupId,teacherId:b.teacherId,title:b.title,startedAt:take[0].at},$set:{lang:b.lang},$push:{lines:{$each:take}},$inc:{lineCount:take.length}},{upsert:true,new:true});
    }catch(e){console.error('transcript flush',e.message)}
  }
  async function flushAll(){for(const key of [...pending.keys()]){await flush(key);const b=pending.get(key);if(b&&!b.lines.length&&now()-b.touched>10*60000)pending.delete(key)}}
  const flushTimer=setInterval(()=>flushAll().catch(()=>{}),FLUSH_MS);flushTimer.unref?.();
  async function recordCaption({scheduleId,user,text,lang}){
    const clean=cleanSegment(text);if(!clean||!mongoose.isValidObjectId(scheduleId))return false;
    const dateKey=today(),key=String(scheduleId)+':'+dateKey;let b=pending.get(key);
    if(!b){
      const lesson=await Schedule.findById(scheduleId).lean();if(!lesson)return false;
      const existing=await Transcript.findOne({scheduleId:lesson._id,dateKey}).select('lineCount').lean();
      b={scheduleId:lesson._id,dateKey,groupId:lesson.groupId,teacherId:lesson.teacherId,title:lesson.title||lesson.subject||'Dars',lang:'uz-UZ',lines:[],count:Number(existing?.lineCount||0),touched:now()};pending.set(key,b);
    }
    if((b.count||0)+b.lines.length>=MAX_LINES)return false;
    b.lang=['uz-UZ','ru-RU','en-US'].includes(lang)?lang:b.lang;b.touched=now();
    b.lines.push({at:new Date(now()),userId:String(user?._id||''),name:String(user?.fullName||user?.login||'').slice(0,80),text:clean});
    if(b.lines.length>=40)await flush(key);return true;
  }

  // ---- meta ----
  const accMeta=ACC_KEYS.map(k=>{const d=ACCOMMODATIONS[k];return {key:k,type:d.type,options:d.options||null,max:d.max||null,icon:d.icon,label:d.label,teacher:d.teacher}});
  app.get('/api/inclusion/meta',auth,(req,res)=>res.json({needs:NEEDS,accommodations:accMeta,supportKinds:SUPPORT_KINDS,statuses:PROFILE_STATUSES,
    me:{role:req.user.role,coordinator:isCoord(req.user),scoped:SCOPED.includes(req.user.role)||req.user.role==='rectorate'}}));

  // ---- personal accessibility preferences ----
  app.get('/api/a11y/prefs',auth,wrap(async(req,res)=>{res.set('Cache-Control','private,no-store');const row=mongoose.isValidObjectId(req.user._id)?await Prefs.findOne({userId:req.user._id}).lean():null;res.json({prefs:cleanPrefs(row?.prefs),saved:Boolean(row),updatedAt:row?.updatedAt||null})}));
  app.put('/api/a11y/prefs',auth,wrap(async(req,res)=>{
    const prefs=cleanPrefs(req.body?.prefs||req.body);if(!mongoose.isValidObjectId(req.user._id))return res.json({prefs,saved:false});
    await Prefs.findOneAndUpdate({userId:req.user._id},{$set:{prefs}},{upsert:true,new:true});res.json({prefs,saved:true});
  }));

  // ---- student: own profile and accommodation request ----
  app.get('/api/inclusion/me',auth,wrap(async(req,res)=>{
    res.set('Cache-Control','private,no-store');
    const p=mongoose.isValidObjectId(req.user._id)?await Profile.findOne({userId:req.user._id}).lean():null,view=ownView(p,today());
    let support=[];
    if(req.user.role==='student'){const gid=await userGroup(req.user);if(gid){const rows=(await refreshSupport()).filter(r=>(r.groupIds||[]).some(g=>sameId(g,gid)));const users=rows.length?await User.find({_id:{$in:rows.map(r=>r.userId)}}).select('fullName').lean():[];support=rows.map(r=>({kind:r.kind,label:SUPPORT_KINDS[r.kind],name:users.find(u=>sameId(u._id,r.userId))?.fullName||''}))}}
    res.json({...view,chips:accommodationChips(view.active),support});
  }));
  app.post('/api/inclusion/me/request',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')throw fail('Moslashtirish so‘rovini talaba yuboradi',403);
    const needs=cleanNeeds(req.body?.needs);if(!needs.length)throw fail('Kamida bitta ehtiyojni belgilang');
    const accommodations=cleanAccommodations(req.body?.accommodations),message=String(req.body?.message||'').trim().slice(0,2000);
    if(!hasAny(accommodations)&&message.length<5)throw fail('Kerakli moslashtirishni belgilang yoki qisqacha yozing');
    const old=await Profile.findOne({userId:req.user._id}).lean();
    const status=old?.status==='approved'?'approved':'requested',history=[...(old?.history||[]),{at:new Date(now()),by:String(req.user._id),action:'request',note:message.slice(0,200)}].slice(-30);
    await Profile.findOneAndUpdate({userId:req.user._id},{$set:{status,request:{needs,accommodations,message,at:new Date(now()),pending:true},consentTeachers:req.body?.consentTeachers!==false,history}},{upsert:true,new:true});
    accCache.delete(String(req.user._id));audit(req,'INCLUSION_REQUEST','InclusionProfile',String(req.user._id),{needs});
    res.status(201).json({ok:true,status});
  }));
  app.delete('/api/inclusion/me/request',auth,wrap(async(req,res)=>{
    const old=await Profile.findOne({userId:req.user._id}).lean();if(!old?.request?.pending)throw fail('Faol so‘rov yo‘q',404);
    await Profile.findOneAndUpdate({userId:req.user._id},{$set:{request:{...old.request,pending:false,cancelledAt:new Date(now())},status:old.status==='requested'?'none':old.status}});res.json({ok:true});
  }));
  app.patch('/api/inclusion/me/consent',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')throw fail('Faqat talaba',403);
    await Profile.findOneAndUpdate({userId:req.user._id},{$set:{consentTeachers:req.body?.consentTeachers!==false}},{upsert:true,new:true});res.json({ok:true,consentTeachers:req.body?.consentTeachers!==false});
  }));

  // ---- shared: students with active accommodations inside a set of groups (teacher / dean / tutor view) ----
  async function practicalRows(groupIds){
    const ids=[...new Set(groupIds.map(String))].filter(mongoose.isValidObjectId);if(!ids.length)return {rows:[],hidden:0};
    const students=await User.find({role:'student',active:true,groupId:{$in:ids}}).select('_id fullName login groupId').lean();if(!students.length)return {rows:[],hidden:0};
    const profiles=await Profile.find({userId:{$in:students.map(s=>s._id)},status:'approved'}).lean(),names=await groupNames(students.map(s=>s.groupId)),t=today();
    let hidden=0;const rows=[];
    for(const p of profiles){const v=teacherView(p,t);if(!v)continue;if(p.consentTeachers===false){hidden++;continue}const s=students.find(x=>sameId(x._id,p.userId));if(!s)continue;
      rows.push({userId:String(s._id),fullName:s.fullName,login:s.login,groupId:String(s.groupId||''),group:names.get(String(s.groupId))||'',...v})}
    rows.sort((a,b)=>a.group.localeCompare(b.group)||a.fullName.localeCompare(b.fullName));return {rows,hidden};
  }
  app.get('/api/inclusion/my-students',auth,wrap(async(req,res)=>{
    res.set('Cache-Control','private,no-store');let groupIds=[];
    if(req.user.role==='teacher')groupIds=(await Schedule.find({teacherId:req.user._id}).select('groupId').lean()).map(s=>s.groupId);
    else if(SCOPED.includes(req.user.role))groupIds=await scopeGroupIds(req.user);
    else if(isCoord(req.user)||GLOBAL_SCOPE_ROLES.has(req.user.role))groupIds=(await Structure.find({type:'group',active:true}).select('_id').lean()).map(g=>g._id);
    else throw fail('Ruxsat yo‘q',403);
    const sup=(await refreshSupport()).filter(r=>sameId(r.userId,req.user._id));groupIds.push(...sup.flatMap(r=>r.groupIds||[]));
    res.json(await practicalRows(groupIds));
  }));
  app.get('/api/inclusion/lessons/:scheduleId/needs',auth,wrap(async(req,res)=>{
    valid(req.params.scheduleId);res.set('Cache-Control','private,no-store');
    const lesson=await Schedule.findById(req.params.scheduleId).lean();if(!lesson)throw fail('Dars topilmadi',404);
    const sup=(await refreshSupport()).filter(r=>r.kind==='sign'&&(r.groupIds||[]).some(g=>sameId(g,lesson.groupId)));
    const interpreters=sup.length?(await User.find({_id:{$in:sup.map(r=>r.userId)}}).select('fullName').lean()).map(u=>u.fullName):[];
    if(req.user.role==='student'){
      const gid=await userGroup(req.user);if(!sameId(gid,lesson.groupId))throw fail('Boshqa guruh darsi',403);
      const acc=await accommodationFor(req.user._id);return res.json({self:{chips:accommodationChips(acc),captions:Boolean(acc?.captions||acc?.signInterpreter||acc?.noteTaker),signInterpreter:Boolean(acc?.signInterpreter)},interpreters});
    }
    const support=await supportKindFor(req.user._id,lesson.groupId);
    if(!support&&!(await scheduleAccess(req.user,lesson)))throw fail('Ruxsat yo‘q',403);
    const students=await User.find({role:'student',active:true,groupId:lesson.groupId}).select('_id').lean();
    const profiles=students.length?await Profile.find({userId:{$in:students.map(s=>s._id)},status:'approved'}).lean():[],t=today();
    const active=profiles.map(p=>activeAccommodation(p,t)).filter(Boolean);
    const {rows,hidden}=await practicalRows([lesson.groupId]);
    res.json({captions:active.some(a=>a.captions||a.signInterpreter||a.noteTaker),signInterpreter:active.some(a=>a.signInterpreter),screenReader:active.some(a=>a.screenReader),
      count:active.length,students:rows.map(r=>({fullName:r.fullName,chips:r.chips,teacherNote:r.teacherNote})),hidden,interpreters,support});
  }));

  // ---- coordinator: overview, students, decisions ----
  app.get('/api/inclusion/overview',auth,wrap(async(req,res)=>{
    const coord=isCoord(req.user),scoped=SCOPED.includes(req.user.role)||req.user.role==='rectorate'||GLOBAL_SCOPE_ROLES.has(req.user.role);
    if(!coord&&!scoped)throw fail('Ruxsat yo‘q',403);
    let filter={};
    if(!coord&&SCOPED.includes(req.user.role)){const gids=await scopeGroupIds(req.user);const ids=(await User.find({role:'student',groupId:{$in:gids}}).select('_id').lean()).map(u=>u._id);filter={userId:{$in:ids}}}
    const profiles=await Profile.find(filter).limit(20000).lean(),t=today(),soon=localDateKey(new Date(now()+30*86400000));
    const byStatus=Object.fromEntries(Object.keys(PROFILE_STATUSES).map(k=>[k,0])),byNeed=Object.fromEntries(Object.keys(NEEDS).map(k=>[k,0])),byAcc=Object.fromEntries(ACC_KEYS.map(k=>[k,0]));
    let active=0,expiring=0,pendingRequests=0;const captionUsers=[];
    for(const p of profiles){byStatus[p.status||'none']=(byStatus[p.status||'none']||0)+1;if(p.request?.pending)pendingRequests++;const acc=activeAccommodation(p,t);if(!acc)continue;active++;
      for(const n of cleanNeeds(p.needs))byNeed[n]++;for(const k of ACC_KEYS)if(acc[k])byAcc[k]++;if(p.validUntil&&p.validUntil<=soon)expiring++;if(acc.captions||acc.signInterpreter||acc.noteTaker)captionUsers.push(p.userId)}
    const out={total:profiles.length,active,expiring,pendingRequests,byStatus,byNeed,byAcc,support:(await refreshSupport()).length};
    if(coord&&captionUsers.length){
      const users=await User.find({_id:{$in:captionUsers}}).select('groupId').lean(),gids=[...new Set(users.map(u=>String(u.groupId||'')).filter(Boolean))],names=await groupNames(gids);
      const since=localDateKey(new Date(now()-14*86400000)),tr=gids.length?await Transcript.find({groupId:{$in:gids},dateKey:{$gte:since}}).select('groupId dateKey lineCount').lean():[];
      out.captionGroups=gids.map(g=>({groupId:g,group:names.get(g)||'',students:users.filter(u=>String(u.groupId)===g).length,transcripts:tr.filter(x=>String(x.groupId)===g&&(x.lineCount||0)>0).length})).sort((a,b)=>a.transcripts-b.transcripts);
    }
    res.json(out);
  }));
  async function studentRows(filter,q){
    const profiles=await Profile.find(filter).sort({updatedAt:-1}).limit(2000).lean();if(!profiles.length)return [];
    const users=await User.find({_id:{$in:profiles.map(p=>p.userId)}}).select('_id fullName login groupId').lean(),names=await groupNames(users.map(u=>u.groupId)),t=today(),needle=String(q||'').trim().toLowerCase();
    return profiles.map(p=>{const u=users.find(x=>sameId(x._id,p.userId));if(!u)return null;const acc=activeAccommodation(p,t);
      return {userId:String(u._id),fullName:u.fullName,login:u.login,group:names.get(String(u.groupId))||'',status:p.status||'none',needs:cleanNeeds(p.needs),chips:accommodationChips(acc||cleanAccommodations(p.accommodations)),
        active:Boolean(acc),validUntil:p.validUntil||'',requestPending:Boolean(p.request?.pending),documentChecked:Boolean(p.documentChecked),updatedAt:p.updatedAt}})
      .filter(r=>r&&(!needle||(r.fullName+' '+r.login+' '+r.group).toLowerCase().includes(needle)));
  }
  app.get('/api/inclusion/students',auth,wrap(async(req,res)=>{
    res.set('Cache-Control','private,no-store');
    if(!isCoord(req.user)){
      if(!SCOPED.includes(req.user.role))throw fail('Ruxsat yo‘q',403);
      const {rows,hidden}=await practicalRows(await scopeGroupIds(req.user));return res.json({rows,hidden,limited:true});
    }
    const filter={};if(PROFILE_STATUSES[req.query.status])filter.status=req.query.status;if(req.query.status==='pending')filter['request.pending']=true;if(NEEDS[req.query.need])filter.needs=req.query.need;
    res.json({rows:await studentRows(filter,req.query.q),limited:false});
  }));
  app.get('/api/inclusion/student-search',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);const q=String(req.query.q||'').trim();if(q.length<2)return res.json([]);
    const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),role=req.query.staff==='1'?{$ne:'student'}:'student';
    const rows=await User.find({role,active:true,$or:[{fullName:re},{login:re}]}).select('_id fullName login role groupId').limit(20).lean(),names=await groupNames(rows.map(r=>r.groupId));
    res.json(rows.map(r=>({id:String(r._id),fullName:r.fullName,login:r.login,role:r.role,group:names.get(String(r.groupId))||''})));
  }));
  app.get('/api/inclusion/groups',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);const q=String(req.query.q||'').trim();
    const filter={type:'group',active:true};if(q)filter.name=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    res.json((await Structure.find(filter).select('_id name').sort({name:1}).limit(30).lean()).map(g=>({id:String(g._id),name:g.name})));
  }));
  app.get('/api/inclusion/students/:userId',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);valid(req.params.userId);res.set('Cache-Control','private,no-store');
    const u=await User.findById(req.params.userId).select('_id fullName login role groupId').lean();if(!u||u.role!=='student')throw fail('Talaba topilmadi',404);
    const p=await Profile.findOne({userId:u._id}).lean(),names=await groupNames([u.groupId]);
    res.json({student:{id:String(u._id),fullName:u.fullName,login:u.login,group:names.get(String(u.groupId))||''},profile:{...ownView(p,today()),coordinatorNote:p?.coordinatorNote||'',documentChecked:Boolean(p?.documentChecked),history:(p?.history||[]).slice(-30)}});
  }));
  app.put('/api/inclusion/students/:userId',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);valid(req.params.userId);
    const u=await User.findById(req.params.userId).select('_id role').lean();if(!u||u.role!=='student')throw fail('Talaba topilmadi',404);
    const b=req.body||{},status=PROFILE_STATUSES[b.status]?b.status:'approved',validUntil=String(b.validUntil||'').trim();
    if(validUntil&&(!DAY.test(validUntil)||Number.isNaN(Date.parse(validUntil))))throw fail('Amal qilish muddati noto‘g‘ri');
    const accommodations=cleanAccommodations(b.accommodations),needs=cleanNeeds(b.needs);
    if(status==='approved'&&!hasAny(accommodations))throw fail('Tasdiqlash uchun kamida bitta moslashtirishni belgilang');
    const old=await Profile.findOne({userId:u._id}).lean();
    const set={status,needs,accommodations,validUntil,documentChecked:b.documentChecked===true,coordinatorNote:String(b.coordinatorNote||'').slice(0,3000),teacherNote:String(b.teacherNote||'').slice(0,600),
      decisionNote:String(b.decisionNote||'').slice(0,600),reviewedBy:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined,reviewedAt:new Date(now()),
      history:[...(old?.history||[]),{at:new Date(now()),by:String(req.user._id),action:status,note:String(b.decisionNote||'').slice(0,200)}].slice(-30)};
    if(old?.request?.pending&&['approved','rejected'].includes(status))set.request={...old.request,pending:false,decidedAt:new Date(now())};
    await Profile.findOneAndUpdate({userId:u._id},{$set:set},{upsert:true,new:true});accCache.delete(String(u._id));
    audit(req,'INCLUSION_DECISION','InclusionProfile',String(u._id),{status,accommodations:ACC_KEYS.filter(k=>accommodations[k])});
    res.json({ok:true,status});
  }));

  // ---- support staff (sign-language interpreters, assistants) ----
  app.get('/api/inclusion/support',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);
    const rows=await Support.find({active:true}).sort({createdAt:-1}).lean(),users=rows.length?await User.find({_id:{$in:rows.map(r=>r.userId)}}).select('fullName login role').lean():[],names=await groupNames(rows.flatMap(r=>r.groupIds||[]));
    res.json(rows.map(r=>{const u=users.find(x=>sameId(x._id,r.userId));return {id:String(r._id),userId:String(r.userId),fullName:u?.fullName||'',login:u?.login||'',kind:r.kind,kindLabel:SUPPORT_KINDS[r.kind],note:r.note||'',groups:(r.groupIds||[]).map(g=>({id:String(g),name:names.get(String(g))||''}))}}));
  }));
  app.post('/api/inclusion/support',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);const b=req.body||{};valid(b.userId);
    if(!SUPPORT_KINDS[b.kind])throw fail('Yordam turini tanlang');
    const u=await User.findById(b.userId).select('_id role active').lean();if(!u||u.active===false)throw fail('Xodim topilmadi',404);if(u.role==='student')throw fail('Yordamchi sifatida xodim akkauntini tanlang');
    const gids=[...new Set((Array.isArray(b.groupIds)?b.groupIds:[]).map(String))].filter(mongoose.isValidObjectId);if(!gids.length)throw fail('Kamida bitta guruh tanlang');
    const groups=await Structure.find({_id:{$in:gids},type:'group'}).select('_id').lean();if(!groups.length)throw fail('Guruh topilmadi');
    const row=await Support.create({userId:u._id,kind:b.kind,groupIds:groups.map(g=>g._id),note:String(b.note||'').slice(0,300),active:true,createdBy:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined});
    await refreshSupport(true);audit(req,'INCLUSION_SUPPORT_ADD','InclusionSupport',String(row._id||row.id),{kind:b.kind,groups:groups.length});res.status(201).json({id:String(row._id||row.id)});
  }));
  app.delete('/api/inclusion/support/:id',auth,wrap(async(req,res)=>{
    if(!isCoord(req.user))throw fail('Ruxsat yo‘q',403);valid(req.params.id);await Support.updateOne({_id:req.params.id},{$set:{active:false}});await refreshSupport(true);
    audit(req,'INCLUSION_SUPPORT_REMOVE','InclusionSupport',req.params.id);res.json({ok:true});
  }));
  app.get('/api/inclusion/support/mine',auth,wrap(async(req,res)=>{
    const mine=(await refreshSupport(true)).filter(r=>sameId(r.userId,req.user._id));const gids=[...new Set(mine.flatMap(r=>(r.groupIds||[]).map(String)))];
    if(!gids.length)return res.json({assignments:[],lessons:[]});
    const names=await groupNames(gids),wd=localWeekday(new Date(now()));
    const lessons=await Schedule.find({groupId:{$in:gids},weekday:wd}).sort({start:1}).lean(),teachers=lessons.length?await User.find({_id:{$in:lessons.map(l=>l.teacherId)}}).select('fullName').lean():[];
    res.json({assignments:mine.map(r=>({kind:r.kind,kindLabel:SUPPORT_KINDS[r.kind],groups:(r.groupIds||[]).map(g=>names.get(String(g))||'')})),
      lessons:lessons.filter(l=>l.kind!=='final_exam').map(l=>({id:String(l._id),title:l.title||l.subject,start:l.start,end:l.end,group:names.get(String(l.groupId))||'',teacher:teachers.find(t=>sameId(t._id,l.teacherId))?.fullName||'',mode:l.mode||'online'}))});
  }));

  // ---- caption transcripts ----
  async function transcriptFilter(user){
    if(isCoord(user)||GLOBAL_SCOPE_ROLES.has(user.role)||user.role==='rectorate')return {};
    if(user.role==='student'){const gid=await userGroup(user);return gid?{groupId:gid}:null}
    const or=[];if(user.role==='teacher')or.push({teacherId:user._id});
    const gids=[...(SCOPED.includes(user.role)?await scopeGroupIds(user):[]),...(await refreshSupport()).filter(r=>sameId(r.userId,user._id)).flatMap(r=>(r.groupIds||[]).map(String))];
    if(gids.length)or.push({groupId:{$in:gids}});return or.length?{$or:or}:null;
  }
  const canSeeTranscript=async(user,t)=>{const f=await transcriptFilter(user);if(!f)return false;if(!Object.keys(f).length)return true;
    if(f.groupId)return sameId(f.groupId,t.groupId);return f.$or.some(c=>c.teacherId?sameId(c.teacherId,t.teacherId):c.groupId.$in.some(g=>sameId(g,t.groupId)))};
  app.get('/api/inclusion/transcripts',auth,wrap(async(req,res)=>{
    res.set('Cache-Control','private,no-store');const f=await transcriptFilter(req.user);if(!f)return res.json([]);
    const q={...f,lineCount:{$gt:0}};if(mongoose.isValidObjectId(req.query.scheduleId))q.scheduleId=req.query.scheduleId;
    await flushAll();const rows=await Transcript.find(q).select('-lines').sort({dateKey:-1,startedAt:-1}).limit(Math.min(200,Number(req.query.limit)||60)).lean(),names=await groupNames(rows.map(r=>r.groupId));
    res.json(rows.map(r=>({id:String(r._id),scheduleId:String(r.scheduleId),title:r.title,dateKey:r.dateKey,group:names.get(String(r.groupId))||'',lines:r.lineCount||0,lang:r.lang,startedAt:r.startedAt})));
  }));
  app.get('/api/inclusion/transcripts/live/:scheduleId',auth,wrap(async(req,res)=>{
    valid(req.params.scheduleId);const lesson=await Schedule.findById(req.params.scheduleId).lean();if(!lesson)throw fail('Dars topilmadi',404);
    const ok=req.user.role==='student'?sameId(await userGroup(req.user),lesson.groupId):(await scheduleAccess(req.user,lesson))||Boolean(await supportKindFor(req.user._id,lesson.groupId));
    if(!ok)throw fail('Ruxsat yo‘q',403);const key=String(lesson._id)+':'+today();await flush(key);
    const row=await Transcript.findOne({scheduleId:lesson._id,dateKey:today()}).lean();res.set('Cache-Control','private,no-store');
    res.json({lines:(row?.lines||[]).slice(-300).map(l=>({at:l.at,name:l.name,text:l.text}))});
  }));
  app.get('/api/inclusion/transcripts/:id',auth,wrap(async(req,res)=>{
    valid(req.params.id);await flushAll();const t=await Transcript.findById(req.params.id).lean();if(!t)throw fail('Transkript topilmadi',404);
    if(!(await canSeeTranscript(req.user,t)))throw fail('Ruxsat yo‘q',403);
    res.set('Cache-Control','private,no-store');const lines=(t.lines||[]).map(l=>({at:l.at,name:l.name,text:l.text})),base=String(t.title||'dars').replace(/[^\p{L}\p{N}]+/gu,'-').slice(0,60)+'-'+t.dateKey;
    if(req.query.format==='vtt'){res.set('Content-Type','text/vtt; charset=utf-8');res.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(base+'.vtt'));return res.send(transcriptToVtt(lines,t.startedAt))}
    if(req.query.format==='txt'){res.set('Content-Type','text/plain; charset=utf-8');res.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(base+'.txt'));return res.send(transcriptToText(lines,{title:t.title,date:t.dateKey}))}
    res.json({id:String(t._id),title:t.title,dateKey:t.dateKey,lines});
  }));

  // ---- subtitles for video lessons ----
  async function videoFor(req,write=false){
    valid(req.params.id);const V=Video();if(!V)throw fail('Videodarslar moduli yo‘q',404);const v=await V.findById(req.params.id).lean();if(!v)throw fail('Video topilmadi',404);
    if(write){if(!(hasPermission(req.user,'videos.manage')||sameId(v.teacherId,req.user._id)||sameId(v.createdBy,req.user._id)||isCoord(req.user)))throw fail('Faqat video muallifi yoki administrator',403)}
    else if(req.user.role==='student'){if(v.published===false)throw fail('Video topilmadi',404);const gid=await userGroup(req.user);if((v.groupIds||[]).length&&!(v.groupIds||[]).some(g=>sameId(g,gid)))throw fail('Ruxsat yo‘q',403)}
    return v;
  }
  app.get('/api/inclusion/videos/:id/captions',auth,wrap(async(req,res)=>{
    const v=await videoFor(req);const c=await Caption.findOne({videoId:v._id}).lean();res.set('Cache-Control','private,no-store');
    res.json(c?{has:true,cues:c.cues||0,lang:c.lang||'uz',transcript:c.transcript||'',updatedAt:c.updatedAt}:{has:false});
  }));
  app.get('/api/inclusion/videos/:id/captions.vtt',auth,wrap(async(req,res)=>{
    const v=await videoFor(req);const c=await Caption.findOne({videoId:v._id}).lean();if(!c?.vtt)throw fail('Subtitr yo‘q',404);
    res.set('Content-Type','text/vtt; charset=utf-8');res.set('Cache-Control','private,max-age=60');res.send(c.vtt);
  }));
  app.put('/api/inclusion/videos/:id/captions',auth,wrap(async(req,res)=>{
    const v=await videoFor(req,true),{vtt,cues}=normalizeSubtitles(req.body?.text),lang=['uz','ru','en','qq'].includes(req.body?.lang)?req.body.lang:'uz';
    await Caption.findOneAndUpdate({videoId:v._id},{$set:{vtt,cues,lang,transcript:subtitlesToText(vtt),updatedBy:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined}},{upsert:true,new:true});
    audit(req,'VIDEO_CAPTIONS_SAVE','VideoLesson',String(v._id),{cues});res.json({ok:true,cues});
  }));
  app.delete('/api/inclusion/videos/:id/captions',auth,wrap(async(req,res)=>{const v=await videoFor(req,true);await Caption.deleteOne({videoId:v._id});audit(req,'VIDEO_CAPTIONS_DELETE','VideoLesson',String(v._id));res.json({ok:true})}));
  app.get('/api/inclusion/audit',auth,wrap(async(req,res)=>{
    const V=Video();if(!V)return res.json({videos:[],summary:{total:0,withCaptions:0}});
    let q={};if(!isCoord(req.user)&&!hasPermission(req.user,'videos.manage')){if(req.user.role!=='teacher')throw fail('Ruxsat yo‘q',403);q={$or:[{teacherId:req.user._id},{createdBy:req.user._id}]}}
    const vids=await V.find(q).select('_id title sourceType published').sort({createdAt:-1}).limit(500).lean(),caps=vids.length?await Caption.find({videoId:{$in:vids.map(v=>v._id)}}).select('videoId cues').lean():[];
    const videos=vids.map(v=>{const c=caps.find(x=>sameId(x.videoId,v._id));return {id:String(v._id),title:v.title,sourceType:v.sourceType||'url',captions:Boolean(c),cues:c?.cues||0}});
    res.json({videos,summary:{total:videos.length,withCaptions:videos.filter(v=>v.captions).length}});
  }));

  return {accommodationFor,supportKindFor,recordCaption,flushAll,refreshSupport,invalidate:id=>id?accCache.delete(String(id)):accCache.clear(),models:{Profile,Support,Transcript,Prefs,Caption},stop:()=>clearInterval(flushTimer)};
}
