import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { Server } from 'socket.io';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] });
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '12mb' }));
app.use(express.static('public', { maxAge: '1d', etag: true, setHeaders:(res,file)=>{ if(/\.(?:html|js|css|webmanifest)$/i.test(file)) res.setHeader('Cache-Control','no-cache'); } }));

const permissionsByRole = {
  superadmin: ['*'],
  admin: ['structure.manage','users.manage','users.control','schedule.manage','reports.view','lessons.monitor','permissions.manage','analytics.view'],
  tech: ['structure.manage','users.manage','users.control','schedule.manage','reports.view','lessons.support','analytics.view'],
  rectorate: ['reports.view','lessons.monitor','analytics.view'],
  dean: ['faculty.view','groups.manage','schedule.manage','reports.view','lessons.monitor','analytics.view'],
  department: ['department.view','teachers.manage','schedule.manage','reports.view','analytics.view'],
  teacher: ['lessons.manage','attendance.manage','assignments.manage','grades.manage','chat.use','analytics.self'],
  student: ['schedule.view','lessons.join','assignments.submit','grades.view','chat.use','analytics.self'],
  tutor: ['groups.view','attendance.view','students.support','reports.view','analytics.view']
};

const userSchema = new mongoose.Schema({
  login: { type: String, unique: true, index: true, required: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true }, role: { type: String, enum: Object.keys(permissionsByRole), required: true },
  permissions: [String], deniedPermissions: [String], faculty: String, department: String, group: String,
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' },
  email: { type: String, trim: true }, phone: { type: String, trim: true }, avatarUrl: { type: String, trim: true }, bio: { type: String, trim: true, maxlength: 500 },
  active: { type: Boolean, default: true }, mustChangePassword: { type: Boolean, default: true },
  lastLoginAt: Date, lastSeenAt: Date, lastLoginIp: String, loginCount: { type: Number, default: 0 }, statusNote: { type: String, trim: true, maxlength: 300 }
}, { timestamps: true });
const structureSchema = new mongoose.Schema({ type: { type: String, enum: ['faculty','department','group'], required: true }, name: { type: String, required: true }, externalId: { type: String, trim: true, index: true, sparse: true }, code: String, parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, active: { type: Boolean, default: true } }, { timestamps: true });
structureSchema.index({ type: 1, externalId: 1 }, { unique: true, sparse: true });
const scheduleSchema = new mongoose.Schema({ title: { type: String, required: true }, subject: String, groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure', required: true }, teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, weekday: { type: Number, min: 1, max: 7 }, date: String, start: String, end: String, room: String, kind: { type: String, enum: ['lecture','practice','seminar','exam'], default: 'lecture' }, recurring: { type: Boolean, default: true } }, { timestamps: true });
const auditSchema = new mongoose.Schema({ actorId: mongoose.Schema.Types.ObjectId, actorLogin: String, actorName: String, action: String, entity: String, entityId: String, ip: String, meta: mongoose.Schema.Types.Mixed }, { timestamps: true });
const attendanceSchema = new mongoose.Schema({ lessonId: String, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, dateKey: String, joinedAt: Date, leftAt: Date, minutes: Number, status: { type: String, enum: ['present','late','absent','excused'] } }, { timestamps: true });
const User = mongoose.model('User', userSchema), Structure = mongoose.model('Structure', structureSchema), Schedule = mongoose.model('Schedule', scheduleSchema), Audit = mongoose.model('Audit', auditSchema), Attendance = mongoose.model('Attendance', attendanceSchema);
const onlineUsers = new Map();
const APP_UTC_OFFSET_MINUTES = Number(process.env.APP_UTC_OFFSET_MINUTES || 300);
const LATE_AFTER_MINUTES = Math.max(1, Number(process.env.LATE_AFTER_MINUTES || 5));
const PUBLIC_TIMETABLE_ENABLED = process.env.PUBLIC_TIMETABLE_ENABLED !== 'false';
const offsetMs = APP_UTC_OFFSET_MINUTES * 60000;
const mongoTimezone = (APP_UTC_OFFSET_MINUTES >= 0 ? '+' : '-') + String(Math.floor(Math.abs(APP_UTC_OFFSET_MINUTES) / 60)).padStart(2,'0') + ':' + String(Math.abs(APP_UTC_OFFSET_MINUTES) % 60).padStart(2,'0');
const localNow = (date=new Date()) => new Date(date.getTime()+offsetMs);
const localDateKey = (date=new Date()) => localNow(date).toISOString().slice(0,10);
const localWeekday = (date=new Date()) => localNow(date).getUTCDay() || 7;
const localMinuteOfDay = (date=new Date()) => localNow(date).getUTCHours()*60 + localNow(date).getUTCMinutes();
const localDayBounds = (daysAgo=0) => { const d=localNow(); const startShifted=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-daysAgo); const start=new Date(startShifted-offsetMs); return {start,end:new Date(start.getTime()+86400000)}; };
const rangeBounds = days => ({start:localDayBounds(Math.max(1,days)-1).start,end:localDayBounds(0).end});
const timeToMinutes = value => { const m=String(value||'').match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1])*60+Number(m[2]) : 0; };
const escapeRegex = value => String(value||'').replace(/[.*+?^$()|[\]\\]/g, match => '\\' + match);

const sanitizeUser = user => { const x = user?.toObject ? user.toObject() : { ...(user || {}) }; delete x.passwordHash; return x; };
const hasPermission = (user, permission) => { const base = permissionsByRole[user?.role] || []; return (base.includes('*') || base.includes(permission) || user?.permissions?.includes(permission)) && !user?.deniedPermissions?.includes(permission); };
const rolePermissions = user => [...new Set([...(permissionsByRole[user?.role]||[]), ...(user?.permissions||[])])].filter(p=>!user?.deniedPermissions?.includes(p));
const canAssignRole = (actorRole,targetRole) => actorRole==='superadmin' ? Boolean(permissionsByRole[targetRole]) : actorRole==='admin' ? Boolean(permissionsByRole[targetRole])&&targetRole!=='superadmin' : actorRole==='tech' ? Boolean(permissionsByRole[targetRole])&&!['superadmin','admin'].includes(targetRole) : false;
const knownPermissions = new Set(Object.values(permissionsByRole).flat().filter(p=>p!=='*'));
const normKey = key => String(key||'').trim().toLowerCase().replace(/[ʻ’'`]/g,'').replace(/[^a-z0-9а-яёқғҳў]+/gi,'_').replace(/^_+|_+$/g,'');
const normalizeRow = row => Object.fromEntries(Object.entries(row).map(([k,v])=>[normKey(k), typeof v === 'string' ? v.trim() : v]));
const pick = (row,names) => { for (const n of names) { const v=row[normKey(n)]; if(v!==undefined && v!==null && String(v).trim()!=='') return v; } return ''; };
const parseFileRows = async body => { const buffer=Buffer.from(body.contentBase64||'','base64'); if(!buffer.length || buffer.length>8*1024*1024) throw new Error('Fayl bo‘sh yoki 8 MB dan katta'); const filename=String(body.filename||'').toLowerCase(); let raw=[]; if(filename.endsWith('.csv')){ raw=parseCsv(buffer.toString('utf8').replace(/^\\uFEFF/,''),{columns:true,skip_empty_lines:true,relax_column_count:true,trim:true}); } else if(filename.endsWith('.xlsx')){ const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buffer); const ws=wb.worksheets[0]; if(!ws)throw new Error('Excel jadvali topilmadi'); const headers=(ws.getRow(1).values||[]).slice(1).map(v=>String(v??'').trim()); for(let r=2;r<=ws.rowCount;r++){const row={};let has=false;headers.forEach((h,i)=>{const cell=ws.getRow(r).getCell(i+1);const value=cell.text??'';row[h]=value;if(String(value).trim())has=true});if(has)raw.push(row);} } else throw new Error('Faqat .xlsx yoki .csv fayl qabul qilinadi'); const rows=raw.map(normalizeRow); if(!rows.length) throw new Error('Faylda ma’lumot qatori topilmadi'); return rows; };
const resolveStructure = async (rawId,type) => { const value=String(rawId||'').trim(); if(!value) return null; const or=[{externalId:value},{code:value}]; if(mongoose.isValidObjectId(value)) or.unshift({_id:value}); return Structure.findOne({type,active:true,$or:or}).lean(); };
const resolveUserGroupId = async user => user?.groupId || (user?.group ? (await resolveStructure(user.group,'group'))?._id : null);
const normalizeWeekday = value => { if(Number(value)>=1&&Number(value)<=7) return Number(value); const v=normKey(value); return ({dushanba:1,monday:1,mon:1,seshanba:2,tuesday:2,tue:2,chorshanba:3,wednesday:3,wed:3,payshanba:4,thursday:4,thu:4,juma:5,friday:5,fri:5,shanba:6,saturday:6,sat:6,yakshanba:7,sunday:7,sun:7})[v]||0; };
const normalizeKind = value => ({lecture:'lecture',maruza:'lecture',practice:'practice',amaliyot:'practice',seminar:'seminar',exam:'exam',imtihon:'exam'})[normKey(value)]||'lecture';
const normalizeTime = value => { const s=String(value||'').trim(); const m=s.match(/(\d{1,2})[:.]?(\d{2})/); return m ? String(m[1]).padStart(2,'0')+':'+m[2] : s; };
const scheduleQuery = filter => Schedule.find(filter).populate('groupId','name externalId code').populate('teacherId','fullName login').sort({weekday:1,start:1});

const GLOBAL_SCOPE_ROLES = new Set(['superadmin','admin','tech','rectorate']);
const resolveScope = async (user, query={}) => {
  let faculty=null,department=null,group=null;
  const forced = !GLOBAL_SCOPE_ROLES.has(user.role);
  if(user.role==='dean'){
    faculty=user.facultyId ? await Structure.findById(user.facultyId).lean() : (user.faculty ? await resolveStructure(user.faculty,'faculty') : null);
  } else if(user.role==='department'){
    department=user.departmentId ? await Structure.findById(user.departmentId).lean() : (user.department ? await resolveStructure(user.department,'department') : null);
  } else if(user.role==='tutor'){
    group=user.groupId ? await Structure.findById(user.groupId).lean() : (user.group ? await resolveStructure(user.group,'group') : null);
    if(!group) department=user.departmentId ? await Structure.findById(user.departmentId).lean() : null;
    if(!group&&!department) faculty=user.facultyId ? await Structure.findById(user.facultyId).lean() : null;
  } else if(!forced){
    if(query.groupId)group=await resolveStructure(query.groupId,'group');
    if(query.departmentId)department=await resolveStructure(query.departmentId,'department');
    if(query.facultyId)faculty=await resolveStructure(query.facultyId,'faculty');
  }
  if(group){
    if(!department&&group.parentId)department=await Structure.findById(group.parentId).lean();
    if(!faculty&&department?.parentId)faculty=await Structure.findById(department.parentId).lean();
  } else if(department){
    if(!faculty&&department.parentId)faculty=await Structure.findById(department.parentId).lean();
  }
  if(!forced){
    if(group&&query.departmentId&&String(group.parentId)!==String(department?._id||''))throw new Error('Tanlangan guruh kafedraga tegishli emas');
    if(department&&query.facultyId&&String(department.parentId)!==String(faculty?._id||''))throw new Error('Tanlangan kafedra fakultetga tegishli emas');
  }
  let departments=[],groups=[];
  if(group) groups=[group];
  else if(department) groups=await Structure.find({type:'group',active:true,parentId:department._id}).lean();
  else if(faculty){
    departments=await Structure.find({type:'department',active:true,parentId:faculty._id}).lean();
    const depIds=departments.map(x=>x._id);
    groups=depIds.length?await Structure.find({type:'group',active:true,parentId:{$in:depIds}}).lean():[];
  } else groups=await Structure.find({type:'group',active:true}).lean();
  if(!departments.length&&faculty)departments=await Structure.find({type:'department',active:true,parentId:faculty._id}).lean();
  const groupIds=groups.map(x=>x._id),departmentIds=departments.map(x=>x._id);
  const userScope={};
  if(group)userScope.groupId=group._id;
  else if(department)userScope.$or=[{departmentId:department._id},{groupId:{$in:groupIds}}];
  else if(faculty)userScope.$or=[{facultyId:faculty._id},{departmentId:{$in:departmentIds}},{groupId:{$in:groupIds}}];
  const scheduleScope=(group||department||faculty)?{groupId:{$in:groupIds}}:{};
  return {forced,faculty,department,group,groups,groupIds,departmentIds,userScope,scheduleScope,label:group?.name||department?.name||faculty?.name||'Universitet'};
};
const scopedUserFilter = (scope,extra={}) => scope.userScope.$or ? {$and:[scope.userScope,extra]} : {...scope.userScope,...extra};
const scopedOnlineCount = async scope => {
  const ids=[...onlineUsers.keys()].filter(mongoose.isValidObjectId);
  if(!ids.length)return 0;
  return User.countDocuments(scopedUserFilter(scope,{_id:{$in:ids},active:true}));
};



const sign = user => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h', issuer: 'masofaviy2' });
const demoAdmin={_id:'demo',id:'demo',login:(process.env.ADMIN_LOGIN||'admin').toLowerCase(),fullName:'Bosh administrator',role:'superadmin',permissions:['*'],deniedPermissions:[],active:true,mustChangePassword:true};
const auth = async (req, res, next) => { try { const token = req.headers.authorization?.replace('Bearer ', ''); const data = jwt.verify(token, JWT_SECRET); req.user = data.id==='demo' ? demoAdmin : await User.findById(data.id).lean(); if (!req.user?.active) throw new Error(); next(); } catch { res.status(401).json({ message: 'Xavfsizlik uchun tizimga qayta kiring.' }); } };
const can = permission => (req, res, next) => { const base = permissionsByRole[req.user.role] || []; const allowed = (base.includes('*') || base.includes(permission) || req.user.permissions?.includes(permission)) && !req.user.deniedPermissions?.includes(permission); return allowed ? next() : res.status(403).json({ message: 'Bu amal uchun ruxsat yo‘q' }); };
const audit = (req, action, entity, entityId, meta={}) => Audit.create({ actorId: mongoose.isValidObjectId(req.user?._id) ? req.user._id : undefined, actorLogin:req.user?.login, actorName:req.user?.fullName, action, entity, entityId, ip: req.ip, meta }).catch(()=>{});

app.get('/api/health', (_req,res)=>res.json({ ok:true, service:'Masofaviy2', time:new Date().toISOString() }));
app.post('/api/auth/login', async (req,res) => { const login=String(req.body.login||'').toLowerCase().trim(); const password=String(req.body.password||''); if(mongoose.connection.readyState!==1){ if(login===demoAdmin.login && password===(process.env.ADMIN_PASSWORD||'ChangeMe123!')) return res.json({token:sign(demoAdmin),user:demoAdmin,demo:true}); return res.status(401).json({message:'Login yoki parol noto‘g‘ri. Ma’lumotlar bazasi ulanmaguncha administrator akkauntidan foydalaning.'}); } const user=await User.findOne({login}); if(!user || !user.active || !(await bcrypt.compare(password,user.passwordHash))){ await Audit.create({actorLogin:login,action:'LOGIN_FAILED',entity:'Auth',ip:req.ip}).catch(()=>{}); return res.status(401).json({message:'Login yoki parol noto‘g‘ri'}); } user.lastLoginAt=new Date();user.lastSeenAt=new Date();user.lastLoginIp=req.ip;user.loginCount=(user.loginCount||0)+1;await user.save(); await audit({user,ip:req.ip},'LOGIN','User',user.id); res.json({token:sign(user),user:sanitizeUser(user)}); });
app.get('/api/me', auth, async (req,res)=>{ let current=sanitizeUser(req.user); if(req.user._id!=='demo'&&mongoose.connection.readyState===1) current=sanitizeUser(await User.findById(req.user._id).populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').lean()); res.json({user:current,effectivePermissions:rolePermissions(req.user)}); });
app.get('/api/dashboard', auth, async (req,res)=> { if(mongoose.connection.readyState!==1)return res.json({role:req.user.role,stats:[{label:'Foydalanuvchi',value:1}],today:[],online:io.engine.clientsCount,demo:true}); const day=localWeekday(); if(req.user.role==='teacher'){ const rows=await scheduleQuery({teacherId:req.user._id}).lean(); const today=rows.filter(x=>x.weekday===day); return res.json({role:req.user.role,stats:[{label:'Mening darslarim',value:rows.length},{label:'Bugungi dars',value:today.length},{label:'Guruhlar',value:new Set(rows.map(x=>String(x.groupId?._id||x.groupId))).size},{label:'Onlayn',value:io.engine.clientsCount}],today}); } if(req.user.role==='student'){ const gid=await resolveUserGroupId(req.user); const rows=gid?await scheduleQuery({groupId:gid}).lean():[]; const today=rows.filter(x=>x.weekday===day); return res.json({role:req.user.role,stats:[{label:'Haftalik dars',value:rows.length},{label:'Bugungi dars',value:today.length},{label:'Fanlar',value:new Set(rows.map(x=>x.subject||x.title)).size},{label:'Onlayn',value:io.engine.clientsCount}],today}); } const [users,faculties,departments,groups,lessons,today]=await Promise.all([User.countDocuments({active:true}),Structure.countDocuments({type:'faculty',active:true}),Structure.countDocuments({type:'department',active:true}),Structure.countDocuments({type:'group',active:true}),Schedule.countDocuments(),scheduleQuery({weekday:day}).limit(10).lean()]); res.json({role:req.user.role,stats:[{label:'Foydalanuvchi',value:users},{label:'Fakultet',value:faculties},{label:'Kafedra',value:departments},{label:'Guruh',value:groups},{label:'Dars',value:lessons}],today,online:io.engine.clientsCount}); });


async function analyticsOverview(user,days=7,query={}){
  const safeDays=Math.max(7,Math.min(30,Number(days)||7)),scope=await resolveScope(user,query),bounds=rangeBounds(safeDays),todayBounds=localDayBounds(0),todayWeekday=localWeekday();
  const userAll=scopedUserFilter(scope,{}),userActive=scopedUserFilter(scope,{active:true}),scheduleFilter={...scope.scheduleScope};
  const schedules=await Schedule.find(scheduleFilter).select('_id teacherId groupId weekday start end').lean(),scheduleIds=schedules.map(x=>String(x._id)),todaySchedules=schedules.filter(x=>x.weekday===todayWeekday),todayScheduleIds=todaySchedules.map(x=>String(x._id));
  const attendanceRange={createdAt:{$gte:bounds.start,$lt:bounds.end}},attendanceToday={createdAt:{$gte:todayBounds.start,$lt:todayBounds.end}};
  if(scheduleIds.length||(scope.group||scope.department||scope.faculty))attendanceRange.lessonId={$in:scheduleIds};
  if(todayScheduleIds.length||(scope.group||scope.department||scope.faculty))attendanceToday.lessonId={$in:todayScheduleIds};
  const teacherIds=[...new Set(schedules.map(x=>String(x.teacherId)).filter(Boolean))].filter(mongoose.isValidObjectId);
  const scheduledGroupIds=[...new Set(schedules.map(x=>String(x.groupId)).filter(Boolean))].filter(mongoose.isValidObjectId);
  const results=await Promise.all([
    User.aggregate([{$match:userActive},{$group:{_id:'$role',value:{$sum:1}}},{$sort:{value:-1}}]),
    User.countDocuments(userActive),User.countDocuments(scopedUserFilter(scope,{active:false})),
    Attendance.countDocuments(attendanceToday),Attendance.countDocuments({...attendanceToday,status:'late'}),
    Schedule.aggregate([{$match:scheduleFilter},{$group:{_id:'$weekday',value:{$sum:1}}},{$sort:{_id:1}}]),
    Attendance.aggregate([{$match:attendanceRange},{$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt',timezone:mongoTimezone}},total:{$sum:1},late:{$sum:{$cond:[{$eq:['$status','late']},1,0]}},minutes:{$sum:{$ifNull:['$minutes',0]}}}},{$sort:{_id:1}}]),
    User.countDocuments(scopedUserFilter(scope,{active:true,$or:[{phone:{$exists:false}},{phone:''},{email:{$exists:false}},{email:''}]})),
    User.countDocuments(scopedUserFilter(scope,{active:true,role:'student',$or:[{groupId:{$exists:false}},{groupId:null}]})),
    User.countDocuments(scopedUserFilter(scope,{active:true,role:'teacher',_id:{$nin:teacherIds}})),
    Structure.countDocuments({type:'group',active:true,...((scope.group||scope.department||scope.faculty)?{_id:{$in:scope.groupIds}}:{}),_id:{$nin:scheduledGroupIds}}).catch(()=>0),
    Schedule.aggregate([{$match:scheduleFilter},{$group:{_id:'$teacherId',value:{$sum:1}}},{$sort:{value:-1}},{$limit:8},{$lookup:{from:'users',localField:'_id',foreignField:'_id',as:'u'}},{$unwind:{path:'$u',preserveNullAndEmptyArrays:true}},{$project:{_id:0,label:{$ifNull:['$u.fullName','Noma’lum']},login:'$u.login',value:1}}]),
    Schedule.aggregate([{$match:scheduleFilter},{$group:{_id:'$groupId',value:{$sum:1}}},{$sort:{value:-1}},{$limit:8},{$lookup:{from:'structures',localField:'_id',foreignField:'_id',as:'g'}},{$unwind:{path:'$g',preserveNullAndEmptyArrays:true}},{$project:{_id:0,label:{$ifNull:['$g.name','Noma’lum']},externalId:'$g.externalId',value:1}}]),
    scopedOnlineCount(scope)
  ]);
  const usersByRole=results[0],roleMap=Object.fromEntries(usersByRole.map(x=>[x._id,x.value]));
  const todayGroups=[...new Set(todaySchedules.map(x=>String(x.groupId)).filter(Boolean))].filter(mongoose.isValidObjectId);
  const studentsByGroup=todayGroups.length?await User.aggregate([{$match:{active:true,role:'student',groupId:{$in:todayGroups.map(x=>new mongoose.Types.ObjectId(x))}}},{$group:{_id:'$groupId',value:{$sum:1}}}]):[];
  const groupCount=Object.fromEntries(studentsByGroup.map(x=>[String(x._id),x.value]));
  const attendanceExpected=todaySchedules.reduce((sum,x)=>sum+(groupCount[String(x.groupId)]||0),0);
  let attendanceStudents=0;
  if(todayScheduleIds.length){
    const distinct=await Attendance.aggregate([{$match:attendanceToday},{$lookup:{from:'users',localField:'userId',foreignField:'_id',as:'u'}},{$unwind:'$u'},{$match:{'u.role':'student'}},{$group:{_id:{lessonId:'$lessonId',userId:'$userId'}}},{$count:'value'}]);
    attendanceStudents=distinct[0]?.value||0;
  }
  const attendanceRate=attendanceExpected?Math.min(100,Math.round(attendanceStudents/attendanceExpected*100)):0;
  const scopedGroupCount=(scope.group||scope.department||scope.faculty)?scope.groupIds.length:await Structure.countDocuments({type:'group',active:true});
  return {generatedAt:new Date().toISOString(),days:safeDays,scope:{label:scope.label,forced:scope.forced,facultyId:scope.faculty?.externalId||scope.faculty?.code||'',departmentId:scope.department?.externalId||scope.department?.code||'',groupId:scope.group?.externalId||scope.group?.code||''},summary:{activeUsers:results[1],blockedUsers:results[2],teachers:roleMap.teacher||0,students:roleMap.student||0,groups:scopedGroupCount,totalSchedules:schedules.length,todaySchedules:todaySchedules.length,onlineUsers:results[13],attendanceToday:results[3],lateToday:results[4],attendanceExpected,attendanceStudents,attendanceRate},usersByRole,lessonsByWeekday:results[5],attendanceTrend:results[6].map(x=>({date:x._id,total:x.total,late:x.late,minutes:x.minutes})),topTeachers:results[11],topGroups:results[12],dataQuality:{missingContact:results[7],studentsMissingGroup:results[8],teachersWithoutSchedule:results[9],groupsWithoutSchedule:results[10]}};
}
app.get('/api/analytics/overview', auth, can('analytics.view'), async(req,res)=>{try{res.json(await analyticsOverview(req.user,req.query.days,req.query))}catch(err){res.status(400).json({message:'Statistikani hisoblab bo‘lmadi: '+err.message})}});

app.get('/api/analytics/online', auth, can('lessons.monitor'), async(req,res)=>{const scope=await resolveScope(req.user,req.query);const ids=[...onlineUsers.keys()].filter(mongoose.isValidObjectId);if(!ids.length)return res.json([]);const users=await User.find(scopedUserFilter(scope,{_id:{$in:ids},active:true})).select('fullName login role lastSeenAt').lean();res.json(users.map(x=>({...x,connections:onlineUsers.get(String(x._id))||1})))});

app.get('/api/profile', auth, async(req,res)=>{ if(req.user._id==='demo')return res.json({user:sanitizeUser(req.user)}); const current=await User.findById(req.user._id).select('-passwordHash').populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').lean(); res.json({user:current}); });
app.patch('/api/profile', auth, async(req,res)=>{ if(req.user._id==='demo')return res.status(400).json({message:'Demo administrator profili o‘zgartirilmaydi'}); const allowed=['fullName','email','phone','avatarUrl','bio']; const patch=Object.fromEntries(allowed.filter(k=>req.body[k]!==undefined).map(k=>[k,String(req.body[k]??'').trim()])); const u=await User.findByIdAndUpdate(req.user._id,{$set:patch},{new:true}).select('-passwordHash'); audit(req,'PROFILE_UPDATE','User',req.user._id,patch); res.json({user:u}); });
app.patch('/api/profile/password', auth, async(req,res)=>{ if(req.user._id==='demo')return res.status(400).json({message:'Demo administrator paroli Render sozlamalaridan boshqariladi'}); const currentPassword=String(req.body.currentPassword||''),newPassword=String(req.body.newPassword||''); if(newPassword.length<8)return res.status(400).json({message:'Yangi parol kamida 8 ta belgidan iborat bo‘lsin'}); const u=await User.findById(req.user._id); if(!u||!(await bcrypt.compare(currentPassword,u.passwordHash)))return res.status(400).json({message:'Joriy parol noto‘g‘ri'}); u.passwordHash=await bcrypt.hash(newPassword,11);u.mustChangePassword=false;await u.save();audit(req,'PASSWORD_CHANGE','User',u.id);res.json({ok:true}); });

app.get('/api/structure', auth, async (req,res)=>res.json(mongoose.connection.readyState===1?await Structure.find(req.query.type?{type:req.query.type}:{}).sort({type:1,name:1}).lean():[]));
app.post('/api/structure', auth, can('structure.manage'), async(req,res)=>{ const body={...req.body,externalId:String(req.body.externalId||req.body.code||'').trim()||undefined}; if(body.type==='group'&&!body.externalId)return res.status(400).json({message:'Guruh uchun ID kiriting'}); if(body.externalId&&await Structure.exists({type:body.type,externalId:body.externalId}))return res.status(409).json({message:'Bu ID allaqachon mavjud'}); const item=await Structure.create(body); audit(req,'CREATE','Structure',item.id,{type:item.type,externalId:item.externalId}); res.status(201).json(item); });
app.delete('/api/structure/:id', auth, can('structure.manage'), async(req,res)=>{ const children=await Structure.countDocuments({parentId:req.params.id,active:true}); if(children) return res.status(409).json({message:'Avval ichki bo‘lim yoki guruhlarni o‘chiring'}); await Structure.findByIdAndUpdate(req.params.id,{active:false}); audit(req,'ARCHIVE','Structure',req.params.id); res.json({ok:true}); });
app.get('/api/users', auth, can('users.manage'), async(req,res)=>{if(mongoose.connection.readyState!==1)return res.json([demoAdmin]);const filter={};if(req.query.role)filter.role=req.query.role;if(req.query.active==='true')filter.active=true;if(req.query.active==='false')filter.active=false;if(req.query.q){const q=escapeRegex(String(req.query.q).slice(0,80));filter.$or=[{fullName:{$regex:q,$options:'i'}},{login:{$regex:q,$options:'i'}},{phone:{$regex:q,$options:'i'}}]}res.json(await User.find(filter).select('-passwordHash').populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').sort({active:-1,fullName:1}).limit(3000).lean())});
app.post('/api/users', auth, can('users.manage'), async(req,res)=>{
  const login=String(req.body.login||'').toLowerCase().trim(),fullName=String(req.body.fullName||'').trim(),role=String(req.body.role||'').trim();
  if(!login||!fullName)return res.status(400).json({message:'F.I.Sh. va login majburiy'});
  if(!canAssignRole(req.user.role,role))return res.status(403).json({message:'Bu rolni yaratish uchun ruxsat yo‘q'});
  if(await User.exists({login}))return res.status(409).json({message:'Bu login allaqachon mavjud'});
  const password=String(req.body.password||'').trim()||crypto.randomBytes(7).toString('base64url');
  if(password.length<8)return res.status(400).json({message:'Parol kamida 8 ta belgidan iborat bo‘lsin'});
  const facultyRaw=String(req.body.facultyId||'').trim(),departmentRaw=String(req.body.departmentId||'').trim(),groupRaw=String(req.body.groupId||'').trim();
  let [faculty,department,group]=await Promise.all([facultyRaw?resolveStructure(facultyRaw,'faculty'):null,departmentRaw?resolveStructure(departmentRaw,'department'):null,groupRaw?resolveStructure(groupRaw,'group'):null]);
  if(facultyRaw&&!faculty)return res.status(400).json({message:'Fakultet ID topilmadi'});
  if(departmentRaw&&!department)return res.status(400).json({message:'Kafedra ID topilmadi'});
  if(groupRaw&&!group)return res.status(400).json({message:'Guruh ID topilmadi'});
  if(group&&!department&&group.parentId)department=await Structure.findById(group.parentId).lean();
  if(department&&!faculty&&department.parentId)faculty=await Structure.findById(department.parentId).lean();
  if(group&&department&&String(group.parentId||'')!==String(department._id))return res.status(400).json({message:'Guruh tanlangan kafedraga tegishli emas'});
  if(department&&faculty&&String(department.parentId||'')!==String(faculty._id))return res.status(400).json({message:'Kafedra tanlangan fakultetga tegishli emas'});
  if(role==='student'&&!group)return res.status(400).json({message:'Talaba uchun guruh majburiy'});
  const user=await User.create({login,fullName,role,email:String(req.body.email||'').trim(),phone:String(req.body.phone||'').trim(),facultyId:faculty?._id,faculty:faculty?(faculty.externalId||faculty.code||faculty.name):'',departmentId:department?._id,department:department?(department.externalId||department.code||department.name):'',groupId:group?._id,group:group?(group.externalId||group.code||group.name):'',passwordHash:await bcrypt.hash(password,11),mustChangePassword:true});
  audit(req,'CREATE','User',user.id,{role:user.role});
  res.status(201).json({user:{id:user.id,login:user.login,fullName:user.fullName,role:user.role},temporaryPassword:password});
});

app.get('/api/users/:id', auth, async(req,res)=>{ if(String(req.user._id)!==String(req.params.id)&&!hasPermission(req.user,'users.manage'))return res.status(403).json({message:'Bu profilni ko‘rish uchun ruxsat yo‘q'}); const u=await User.findById(req.params.id).select('-passwordHash').populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').lean(); if(!u)return res.status(404).json({message:'Foydalanuvchi topilmadi'});res.json({user:u}); });
app.patch('/api/users/:id', auth, can('users.manage'), async(req,res)=>{
  const target=await User.findById(req.params.id);
  if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});
  if(target.role==='superadmin'&&req.user.role!=='superadmin')return res.status(403).json({message:'Superadmin ma’lumotini faqat superadmin o‘zgartiradi'});
  const nextRole=req.body.role?String(req.body.role):target.role;
  if(!permissionsByRole[nextRole])return res.status(400).json({message:'Rol noto‘g‘ri'});
  if(!canAssignRole(req.user.role,nextRole))return res.status(403).json({message:'Bu rolni tayinlash uchun ruxsat yo‘q'});
  const facultyRaw=String(req.body.facultyId||'').trim(),departmentRaw=String(req.body.departmentId||'').trim(),groupRaw=String(req.body.groupId||'').trim();
  let [faculty,department,group]=await Promise.all([facultyRaw?resolveStructure(facultyRaw,'faculty'):null,departmentRaw?resolveStructure(departmentRaw,'department'):null,groupRaw?resolveStructure(groupRaw,'group'):null]);
  if(facultyRaw&&!faculty)return res.status(400).json({message:'faculty_id topilmadi'});
  if(departmentRaw&&!department)return res.status(400).json({message:'department_id topilmadi'});
  if(groupRaw&&!group)return res.status(400).json({message:'group_id topilmadi'});
  if(group&&!department&&group.parentId)department=await Structure.findById(group.parentId).lean();
  if(department&&!faculty&&department.parentId)faculty=await Structure.findById(department.parentId).lean();
  if(group&&department&&String(group.parentId||'')!==String(department._id))return res.status(400).json({message:'Guruh tanlangan kafedraga tegishli emas'});
  if(department&&faculty&&String(department.parentId||'')!==String(faculty._id))return res.status(400).json({message:'Kafedra tanlangan fakultetga tegishli emas'});
  if(nextRole==='student'&&!group)return res.status(400).json({message:'Talabaga group_id majburiy'});
  target.fullName=String(req.body.fullName??target.fullName).trim();
  target.email=String(req.body.email??target.email??'').trim();
  target.phone=String(req.body.phone??target.phone??'').trim();
  target.role=nextRole;
  target.facultyId=faculty?._id||undefined;target.faculty=faculty?(faculty.externalId||faculty.code||faculty.name):'';
  target.departmentId=department?._id||undefined;target.department=department?(department.externalId||department.code||department.name):'';
  target.groupId=group?._id||undefined;target.group=group?(group.externalId||group.code||group.name):'';
  await target.save();
  audit(req,'USER_UPDATE','User',target.id,{role:target.role,facultyId:target.faculty,departmentId:target.department,groupId:target.group});
  res.json({user:sanitizeUser(target)});
});

app.post('/api/users/bulk-import', auth, can('users.manage'), async(req,res)=>{ try{
  const rows=await parseFileRows(req.body),dryRun=req.body.dryRun!==false,prepared=[],errors=[],seen=new Set();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],n=i+2;
    const fullName=String(pick(row,['full_name','fullname','fio','fish','f_i_sh','ism_familiya'])||'').trim();
    const login=String(pick(row,['login','username','user_login'])||'').toLowerCase().trim();
    const rv=normKey(pick(row,['role','rol']));
    const role=({talaba:'student',student:'student',oqituvchi:'teacher',teacher:'teacher',tyutor:'tutor',tutor:'tutor',kafedra:'department',department:'department',dekan:'dean',dean:'dean',rektorat:'rectorate',rectorate:'rectorate',texnik:'tech',tech:'tech',admin:'admin',superadmin:'superadmin'})[rv]||rv;
    const password=String(pick(row,['password','parol'])||'').trim()||crypto.randomBytes(5).toString('hex');
    const facultyRaw=String(pick(row,['faculty_id','fakultet_id','facultyid'])||'').trim();
    const departmentRaw=String(pick(row,['department_id','kafedra_id','departmentid'])||'').trim();
    const groupRaw=String(pick(row,['group_id','guruh_id','groupid'])||'').trim();
    if(!fullName){errors.push({row:n,message:'F.I.Sh. bo‘sh'});continue}
    if(!login){errors.push({row:n,message:'login bo‘sh'});continue}
    if(!permissionsByRole[role]){errors.push({row:n,message:'rol noto‘g‘ri: '+(role||'-')});continue} 
    if(!canAssignRole(req.user.role,role)){errors.push({row:n,message:'Bu rolni yaratish uchun ruxsat yo‘q: '+role});continue}
    if(seen.has(login)||await User.exists({login})){errors.push({row:n,message:'login takrorlangan yoki tizimda mavjud: '+login});continue}
    seen.add(login);
    let [faculty,department,group]=await Promise.all([
      facultyRaw?resolveStructure(facultyRaw,'faculty'):null,
      departmentRaw?resolveStructure(departmentRaw,'department'):null,
      groupRaw?resolveStructure(groupRaw,'group'):null
    ]);
    if(facultyRaw&&!faculty){errors.push({row:n,message:'faculty_id topilmadi: '+facultyRaw});continue}
    if(departmentRaw&&!department){errors.push({row:n,message:'department_id topilmadi: '+departmentRaw});continue}
    if(groupRaw&&!group){errors.push({row:n,message:'group_id topilmadi: '+groupRaw});continue}
    if(group&&!department&&group.parentId)department=await Structure.findById(group.parentId).lean();
    if(department&&!faculty&&department.parentId)faculty=await Structure.findById(department.parentId).lean();
    if(group&&department&&String(group.parentId||'')!==String(department._id)){errors.push({row:n,message:'group_id tanlangan department_id tarkibiga kirmaydi'});continue}
    if(department&&faculty&&String(department.parentId||'')!==String(faculty._id)){errors.push({row:n,message:'department_id tanlangan faculty_id tarkibiga kirmaydi'});continue}
    if(role==='student'&&!group){errors.push({row:n,message:'Talaba uchun group_id majburiy'});continue}
    prepared.push({row:n,fullName,login,role,password,email:String(pick(row,['email','e_mail'])||'').trim(),phone:String(pick(row,['phone','telefon','tel'])||'').trim(),faculty,department,group});
  }
  if(dryRun)return res.json({dryRun:true,total:rows.length,valid:prepared.length,invalid:errors.length,errors:errors.slice(0,100),preview:prepared.slice(0,20).map(x=>({row:x.row,fullName:x.fullName,login:x.login,role:x.role,faculty_id:x.faculty?.externalId||x.faculty?.code||'',department_id:x.department?.externalId||x.department?.code||'',group_id:x.group?.externalId||x.group?.code||''}))});
  const credentials=[],docs=[];
  for(let i=0;i<prepared.length;i+=24){
    const batch=prepared.slice(i,i+24),hashed=await Promise.all(batch.map(p=>bcrypt.hash(p.password,11)));
    batch.forEach((p,j)=>{docs.push({fullName:p.fullName,login:p.login,role:p.role,passwordHash:hashed[j],email:p.email,phone:p.phone,facultyId:p.faculty?._id,faculty:p.faculty?(p.faculty.externalId||p.faculty.code||p.faculty.name):'',departmentId:p.department?._id,department:p.department?(p.department.externalId||p.department.code||p.department.name):'',groupId:p.group?._id,group:p.group?(p.group.externalId||p.group.code||p.group.name):'',mustChangePassword:true});credentials.push({fullName:p.fullName,login:p.login,role:p.role,password:p.password,group_id:p.group?.externalId||p.group?.code||''})});
  }
  if(docs.length)await User.insertMany(docs,{ordered:false});
  audit(req,'BULK_IMPORT','User','bulk',{created:credentials.length,errors:errors.length});
  res.status(201).json({imported:credentials.length,skipped:errors.length,errors:errors.slice(0,100),credentials});
}catch(err){res.status(400).json({message:err.message})} });

app.patch('/api/users/:id/status', auth, can('users.control'), async(req,res)=>{const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(String(target._id)===String(req.user._id)&&req.body.active===false)return res.status(400).json({message:'O‘zingizni bloklay olmaysiz'});if(target.role==='superadmin'&&req.user.role!=='superadmin')return res.status(403).json({message:'Superadmin holatini faqat superadmin o‘zgartiradi'});target.active=Boolean(req.body.active);target.statusNote=String(req.body.statusNote||'').trim();await target.save();audit(req,target.active?'UNBLOCK':'BLOCK','User',target.id,{note:target.statusNote});res.json({ok:true,active:target.active})});
app.post('/api/users/:id/reset-password', auth, can('users.control'), async(req,res)=>{const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(target.role==='superadmin'&&req.user.role!=='superadmin')return res.status(403).json({message:'Superadmin parolini faqat superadmin tiklaydi'});const password=String(req.body.password||'').trim()||crypto.randomBytes(7).toString('base64url');if(password.length<8)return res.status(400).json({message:'Parol kamida 8 belgi bo‘lsin'});target.passwordHash=await bcrypt.hash(password,11);target.mustChangePassword=true;await target.save();audit(req,'PASSWORD_RESET','User',target.id);res.json({temporaryPassword:password})});

app.patch('/api/users/:id/permissions', auth, can('permissions.manage'), async(req,res)=>{
  const target=await User.findById(req.params.id);
  if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});
  if(target.role==='superadmin'&&req.user.role!=='superadmin')return res.status(403).json({message:'Superadmin huquqlarini faqat superadmin o‘zgartiradi'});
  const normalize=list=>[...new Set((Array.isArray(list)?list:[]).filter(p=>knownPermissions.has(p)))];
  const permissions=normalize(req.body.permissions),deniedPermissions=normalize(req.body.deniedPermissions);
  if(req.user.role!=='superadmin'&&permissions.includes('permissions.manage'))return res.status(403).json({message:'Huquqlarni boshqarish vakolatini faqat superadmin bera oladi'});
  target.permissions=permissions;target.deniedPermissions=deniedPermissions;await target.save();
  audit(req,'PERMISSIONS','User',target.id,{permissions,deniedPermissions});
  res.json(sanitizeUser(target));
});
app.get('/api/schedules', auth, async(req,res)=>{if(mongoose.connection.readyState!==1)return res.json([]);const filter={};if(req.user.role==='teacher')filter.teacherId=req.user._id;else if(req.user.role==='student'){const gid=await resolveUserGroupId(req.user);if(!gid)return res.json([]);filter.groupId=gid}else{if(req.query.groupId){const g=await resolveStructure(req.query.groupId,'group');if(!g)return res.json([]);filter.groupId=g._id}if(req.query.teacherLogin){const t=await User.findOne({login:String(req.query.teacherLogin).toLowerCase(),role:'teacher'}).lean();if(!t)return res.json([]);filter.teacherId=t._id}if(req.query.weekday)filter.weekday=Number(req.query.weekday)}res.json(await scheduleQuery(filter).lean())});
app.post('/api/schedules', auth, can('schedule.manage'), async(req,res)=>{const group=await resolveStructure(req.body.groupId,'group');const teacher=mongoose.isValidObjectId(req.body.teacherId)?await User.findById(req.body.teacherId).lean():await User.findOne({login:String(req.body.teacherId||'').toLowerCase(),role:'teacher',active:true}).lean();const start=normalizeTime(req.body.start),end=normalizeTime(req.body.end),weekday=normalizeWeekday(req.body.weekday),room=String(req.body.room||'').trim();if(!group)return res.status(400).json({message:'Guruh ID topilmadi'});if(!teacher)return res.status(400).json({message:'O‘qituvchi topilmadi'});if(!weekday||!start||!end||start>=end)return res.status(400).json({message:'Vaqt oralig‘i noto‘g‘ri'});const overlap={weekday,start:{$lt:end},end:{$gt:start}};const clashes=await Promise.all([Schedule.findOne(Object.assign({},overlap,{teacherId:teacher._id})),Schedule.findOne(Object.assign({},overlap,{groupId:group._id})),room?Schedule.findOne(Object.assign({},overlap,{room})):null]);if(clashes[0])return res.status(409).json({message:'O‘qituvchining bu vaqtda boshqa darsi bor'});if(clashes[1])return res.status(409).json({message:'Guruhning bu vaqtda boshqa darsi bor'});if(clashes[2])return res.status(409).json({message:'Bu xona shu vaqtda band'});const item=await Schedule.create(Object.assign({},req.body,{start,end,weekday,room,groupId:group._id,teacherId:teacher._id}));audit(req,'CREATE','Schedule',item.id,{groupId:group.externalId||group.code,teacherLogin:teacher.login});res.status(201).json(item)});
app.delete('/api/schedules/:id', auth, can('schedule.manage'), async(req,res)=>{ await Schedule.findByIdAndDelete(req.params.id); audit(req,'DELETE','Schedule',req.params.id); res.json({ok:true}); });

app.post('/api/schedules/bulk-import', auth, can('schedule.manage'), async(req,res)=>{ try{
  const rows=await parseFileRows(req.body),dryRun=req.body.dryRun!==false,prepared=[],errors=[],groupCache=new Map(),teacherCache=new Map();
  const existing=await Schedule.find().select('title teacherId groupId weekday start end room').lean();
  const getGroup=async raw=>{if(groupCache.has(raw))return groupCache.get(raw);const x=await resolveStructure(raw,'group');groupCache.set(raw,x);return x};
  const getTeacher=async login=>{if(teacherCache.has(login))return teacherCache.get(login);const x=await User.findOne({login,role:'teacher',active:true}).lean();teacherCache.set(login,x);return x};
  const overlaps=(a,teacherId,groupId,weekday,start,end,room)=>a.weekday===weekday&&a.start<end&&a.end>start&&(String(a.teacherId)===String(teacherId)||String(a.groupId)===String(groupId)||(room&&a.room===room));
  for(let i=0;i<rows.length;i++){
    const row=rows[i],n=i+2,title=String(pick(row,['title','dars_nomi','lesson','fan_nomi'])||'').trim(),subject=String(pick(row,['subject','fan'])||title).trim(),groupRaw=String(pick(row,['group_id','guruh_id','groupid'])||'').trim(),teacherLogin=String(pick(row,['teacher_login','oqituvchi_login','teacher','login'])||'').toLowerCase().trim(),weekday=normalizeWeekday(pick(row,['weekday','hafta_kuni','day'])),start=normalizeTime(pick(row,['start','boshlanish','start_time'])),end=normalizeTime(pick(row,['end','tugash','end_time'])),room=String(pick(row,['room','xona','auditoriya'])||'').trim(),kind=normalizeKind(pick(row,['kind','turi','type']));
    if(!title||!groupRaw||!teacherLogin||!weekday||!start||!end){errors.push({row:n,message:'title, group_id, teacher_login, weekday, start, end majburiy'});continue}
    if(start>=end){errors.push({row:n,message:'Vaqt oralig‘i noto‘g‘ri'});continue}
    const [group,teacher]=await Promise.all([getGroup(groupRaw),getTeacher(teacherLogin)]);
    if(!group){errors.push({row:n,message:'group_id topilmadi: '+groupRaw});continue}
    if(!teacher){errors.push({row:n,message:'teacher_login topilmadi: '+teacherLogin});continue}
    const all=[...existing,...prepared],clash=all.find(x=>overlaps(x,teacher._id,group._id,weekday,start,end,room));
    if(clash){
      const reason=String(clash.teacherId)===String(teacher._id)?'o‘qituvchi':String(clash.groupId)===String(group._id)?'guruh':'xona';
      errors.push({row:n,message:reason+' uchun vaqt to‘qnashuvi '+start+'-'+end});continue
    }
    if(all.some(x=>String(x.groupId)===String(group._id)&&String(x.teacherId)===String(teacher._id)&&x.weekday===weekday&&x.start===start&&x.end===end&&x.title===title)){errors.push({row:n,message:'Bu dars allaqachon mavjud'});continue}
    prepared.push({title,subject,groupId:group._id,teacherId:teacher._id,weekday,start,end,room,kind,recurring:true,_meta:{row:n,group_id:group.externalId||group.code||String(group._id),teacher_login:teacherLogin}});
  }
  if(dryRun)return res.json({dryRun:true,total:rows.length,valid:prepared.length,invalid:errors.length,errors:errors.slice(0,100),preview:prepared.slice(0,30).map(x=>({row:x._meta.row,title:x.title,group_id:x._meta.group_id,teacher_login:x._meta.teacher_login,weekday:x.weekday,start:x.start,end:x.end,room:x.room}))});
  const docs=prepared.map(x=>{const y={...x};delete y._meta;return y}),created=docs.length?await Schedule.insertMany(docs):[];
  audit(req,'BULK_IMPORT','Schedule','bulk',{created:created.length,errors:errors.length});
  res.status(201).json({imported:created.length,skipped:errors.length,errors:errors.slice(0,100)});
}catch(err){res.status(400).json({message:err.message})} });
app.get('/api/public/timetable/group/:groupId', async(req,res)=>{ if(!PUBLIC_TIMETABLE_ENABLED)return res.status(403).json({message:'Ochiq jadval havolalari o‘chirilgan'}); if(mongoose.connection.readyState!==1)return res.json({group:null,schedule:[]});const g=await resolveStructure(req.params.groupId,'group');if(!g)return res.status(404).json({message:'Guruh ID topilmadi'});res.json({group:{name:g.name,id:g.externalId||g.code||String(g._id)},schedule:await scheduleQuery({groupId:g._id}).lean()}); });
app.get('/api/public/timetable/teacher/:login', async(req,res)=>{ if(!PUBLIC_TIMETABLE_ENABLED)return res.status(403).json({message:'Ochiq jadval havolalari o‘chirilgan'}); if(mongoose.connection.readyState!==1)return res.json({teacher:null,schedule:[]});const t=await User.findOne({login:String(req.params.login).toLowerCase(),role:'teacher',active:true}).select('fullName login').lean();if(!t)return res.status(404).json({message:'O‘qituvchi topilmadi'});res.json({teacher:{fullName:t.fullName,login:t.login},schedule:await scheduleQuery({teacherId:t._id}).lean()}); });


app.get('/api/reports/attendance', auth, can('reports.view'), async(req,res)=>{const days=Math.max(1,Math.min(90,Number(req.query.days)||14)),bounds=rangeBounds(days),scope=await resolveScope(req.user,req.query);const schedules=await Schedule.find(scope.scheduleScope).select('_id').lean(),scheduleIds=schedules.map(x=>String(x._id));const filter={createdAt:{$gte:bounds.start,$lt:bounds.end}};if(scheduleIds.length||(scope.group||scope.department||scope.faculty))filter.lessonId={$in:scheduleIds};const rows=await Attendance.find(filter).populate('userId','fullName login role groupId').sort({createdAt:-1}).limit(1500).lean();const used=[...new Set(rows.map(x=>x.lessonId).filter(mongoose.isValidObjectId))],fullSchedules=used.length?await scheduleQuery({_id:{$in:used}}).lean():[],byId=Object.fromEntries(fullSchedules.map(x=>[String(x._id),x]));res.json(rows.map(x=>({...x,schedule:byId[x.lessonId]||null})))});

app.get('/api/audit', auth, can('reports.view'), async(req,res)=>{const filter={};if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){filter.actorId=req.user._id}if(req.query.q){const q=escapeRegex(String(req.query.q).slice(0,80)),search=[{actorLogin:{$regex:q,$options:'i'}},{actorName:{$regex:q,$options:'i'}},{action:{$regex:q,$options:'i'}},{entity:{$regex:q,$options:'i'}}];if(filter.actorId)filter.$and=[{actorId:filter.actorId},{$or:search}];else filter.$or=search}res.json(await Audit.find(filter).sort({createdAt:-1}).limit(Math.min(1000,Number(req.query.limit)||300)).lean())});

io.use(async(socket,next)=>{ try { const data=jwt.verify(socket.handshake.auth.token,JWT_SECRET); socket.user=data.id==='demo'?demoAdmin:await User.findById(data.id).lean(); if(!socket.user?.active) throw new Error(); next(); } catch { next(new Error('unauthorized')); } });
io.on('connection', socket => { const uid=String(socket.user._id);onlineUsers.set(uid,(onlineUsers.get(uid)||0)+1);io.emit('presence:count',{online:onlineUsers.size}); socket.on('lesson:join', async({lessonId})=>{ try{if(!mongoose.isValidObjectId(lessonId))return socket.emit('lesson:error',{message:'Dars ID noto‘g‘ri'});const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return socket.emit('lesson:error',{message:'Dars topilmadi'});let allowed=hasPermission(socket.user,'lessons.monitor')||String(lesson.teacherId)===String(socket.user._id);if(socket.user.role==='student'){const gid=await resolveUserGroupId(socket.user);allowed=String(gid||'')===String(lesson.groupId)}if(!allowed)return socket.emit('lesson:error',{message:'Bu darsga kirish huquqi yo‘q'});socket.join('lesson:'+lessonId);const now=new Date(),dateKey=localDateKey(now),late=localWeekday(now)===lesson.weekday&&localMinuteOfDay(now)>timeToMinutes(lesson.start)+LATE_AFTER_MINUTES;let row=await Attendance.findOne({lessonId:String(lessonId),userId:socket.user._id,dateKey}).sort({createdAt:1});if(!row)row=await Attendance.create({lessonId:String(lessonId),userId:socket.user._id,dateKey,joinedAt:now,status:late?'late':'present',minutes:0});else{row.leftAt=null;if(late&&row.status==='present')row.status='late';await row.save()}socket.data.attendanceId=row.id;socket.data.attendanceSessionStartedAt=now;io.to('lesson:'+lessonId).emit('lesson:presence',{userId:socket.user._id,fullName:socket.user.fullName,state:'joined',status:row.status})}catch{socket.emit('lesson:error',{message:'Darsga ulanishda xatolik'})} }); socket.on('lesson:chat', ({lessonId,text})=>{ const clean=String(text||'').trim().slice(0,1000); if(clean&&socket.rooms.has('lesson:'+lessonId)) io.to('lesson:'+lessonId).emit('lesson:chat',{id:crypto.randomUUID(),userId:socket.user._id,fullName:socket.user.fullName,text:clean,at:new Date().toISOString()}); }); socket.on('disconnect', async()=>{const left=(onlineUsers.get(uid)||1)-1;if(left<=0)onlineUsers.delete(uid);else onlineUsers.set(uid,left);io.emit('presence:count',{online:onlineUsers.size});if(mongoose.isValidObjectId(socket.user._id))User.findByIdAndUpdate(socket.user._id,{lastSeenAt:new Date()}).catch(()=>{});if(socket.data.attendanceId){const row=await Attendance.findById(socket.data.attendanceId);if(row&&!row.leftAt){row.leftAt=new Date();const sessionStart=socket.data.attendanceSessionStartedAt||row.joinedAt;row.minutes=(row.minutes||0)+Math.max(1,Math.round((row.leftAt-sessionStart)/60000));await row.save()}} }); });

async function bootstrap(){ server.listen(PORT,'0.0.0.0',()=>console.log(`Masofaviy2 :${PORT}`)); if(!process.env.MONGODB_URI){console.warn('MONGODB_URI yo‘q: taqdimot rejimi ishga tushdi');return} try{await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});const login=(process.env.ADMIN_LOGIN||'admin').toLowerCase();if(!await User.exists({login}))await User.create({login,fullName:'Bosh administrator',role:'superadmin',passwordHash:await bcrypt.hash(process.env.ADMIN_PASSWORD||'ChangeMe123!',11),mustChangePassword:true});console.log('MongoDB ulandi')}catch(err){console.error('MongoDB ulanmagan, taqdimot rejimi:',err.message)} }
bootstrap();
