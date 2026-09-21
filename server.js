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
import * as XLSX from 'xlsx';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] });
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '12mb' }));
app.use(express.static('public', { maxAge: '1h', etag: true }));

const permissionsByRole = {
  superadmin: ['*'], admin: ['structure.manage','users.manage','schedule.manage','reports.view','lessons.monitor','permissions.manage'],
  tech: ['structure.manage','users.manage','schedule.manage','reports.view','lessons.support'],
  rectorate: ['reports.view','lessons.monitor','analytics.view'], dean: ['faculty.view','groups.manage','schedule.manage','reports.view','lessons.monitor'],
  department: ['department.view','teachers.manage','schedule.manage','reports.view'], teacher: ['lessons.manage','attendance.manage','assignments.manage','grades.manage','chat.use'],
  student: ['schedule.view','lessons.join','assignments.submit','grades.view','chat.use'], tutor: ['groups.view','attendance.view','students.support']
};

const userSchema = new mongoose.Schema({
  login: { type: String, unique: true, index: true, required: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true }, role: { type: String, enum: Object.keys(permissionsByRole), required: true },
  permissions: [String], deniedPermissions: [String], faculty: String, department: String, group: String,
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' },
  email: { type: String, trim: true }, phone: { type: String, trim: true }, avatarUrl: { type: String, trim: true }, bio: { type: String, trim: true, maxlength: 500 },
  active: { type: Boolean, default: true }, mustChangePassword: { type: Boolean, default: true }
}, { timestamps: true });
const structureSchema = new mongoose.Schema({ type: { type: String, enum: ['faculty','department','group'], required: true }, name: { type: String, required: true }, externalId: { type: String, trim: true, index: true, sparse: true }, code: String, parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, active: { type: Boolean, default: true } }, { timestamps: true });
structureSchema.index({ type: 1, externalId: 1 }, { unique: true, sparse: true });
const scheduleSchema = new mongoose.Schema({ title: { type: String, required: true }, subject: String, groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure', required: true }, teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, weekday: { type: Number, min: 1, max: 7 }, date: String, start: String, end: String, room: String, kind: { type: String, enum: ['lecture','practice','seminar','exam'], default: 'lecture' }, recurring: { type: Boolean, default: true } }, { timestamps: true });
const auditSchema = new mongoose.Schema({ actorId: mongoose.Schema.Types.ObjectId, action: String, entity: String, entityId: String, ip: String, meta: mongoose.Schema.Types.Mixed }, { timestamps: true });
const attendanceSchema = new mongoose.Schema({ lessonId: String, userId: mongoose.Schema.Types.ObjectId, joinedAt: Date, leftAt: Date, minutes: Number, status: { type: String, enum: ['present','late','absent','excused'] } }, { timestamps: true });
const User = mongoose.model('User', userSchema), Structure = mongoose.model('Structure', structureSchema), Schedule = mongoose.model('Schedule', scheduleSchema), Audit = mongoose.model('Audit', auditSchema), Attendance = mongoose.model('Attendance', attendanceSchema);

const sanitizeUser = user => { const x = user?.toObject ? user.toObject() : { ...(user || {}) }; delete x.passwordHash; return x; };
const hasPermission = (user, permission) => { const base = permissionsByRole[user?.role] || []; return (base.includes('*') || base.includes(permission) || user?.permissions?.includes(permission)) && !user?.deniedPermissions?.includes(permission); };
const rolePermissions = user => [...new Set([...(permissionsByRole[user?.role]||[]), ...(user?.permissions||[])])].filter(p=>!user?.deniedPermissions?.includes(p));
const normKey = key => String(key||'').trim().toLowerCase().replace(/[ʻ’'`]/g,'').replace(/[^a-z0-9а-яёқғҳў]+/gi,'_').replace(/^_+|_+$/g,'');
const normalizeRow = row => Object.fromEntries(Object.entries(row).map(([k,v])=>[normKey(k), typeof v === 'string' ? v.trim() : v]));
const pick = (row,names) => { for (const n of names) { const v=row[normKey(n)]; if(v!==undefined && v!==null && String(v).trim()!=='') return v; } return ''; };
const parseFileRows = body => { const buffer=Buffer.from(body.contentBase64||'','base64'); if(!buffer.length || buffer.length>8*1024*1024) throw new Error('Fayl bo‘sh yoki 8 MB dan katta'); const wb=XLSX.read(buffer,{type:'buffer'}); const sh=wb.Sheets[wb.SheetNames[0]]; if(!sh) throw new Error('Jadval topilmadi'); const rows=XLSX.utils.sheet_to_json(sh,{defval:'',raw:false}).map(normalizeRow); if(!rows.length) throw new Error('Faylda ma’lumot qatori topilmadi'); return rows; };
const resolveStructure = async (rawId,type) => { const value=String(rawId||'').trim(); if(!value) return null; const or=[{externalId:value},{code:value}]; if(mongoose.isValidObjectId(value)) or.unshift({_id:value}); return Structure.findOne({type,active:true,$or:or}).lean(); };
const resolveUserGroupId = async user => user?.groupId || (user?.group ? (await resolveStructure(user.group,'group'))?._id : null);
const normalizeWeekday = value => { if(Number(value)>=1&&Number(value)<=7) return Number(value); const v=normKey(value); return ({dushanba:1,monday:1,mon:1,seshanba:2,tuesday:2,tue:2,chorshanba:3,wednesday:3,wed:3,payshanba:4,thursday:4,thu:4,juma:5,friday:5,fri:5,shanba:6,saturday:6,sat:6,yakshanba:7,sunday:7,sun:7})[v]||0; };
const normalizeKind = value => ({lecture:'lecture',maruza:'lecture',practice:'practice',amaliyot:'practice',seminar:'seminar',exam:'exam',imtihon:'exam'})[normKey(value)]||'lecture';
const normalizeTime = value => { const s=String(value||'').trim(); const m=s.match(/(\d{1,2})[:.]?(\d{2})/); return m ? String(m[1]).padStart(2,'0')+':'+m[2] : s; };
const scheduleQuery = filter => Schedule.find(filter).populate('groupId','name externalId code').populate('teacherId','fullName login').sort({weekday:1,start:1});


const sign = user => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h', issuer: 'masofaviy2' });
const demoAdmin={_id:'demo',id:'demo',login:(process.env.ADMIN_LOGIN||'admin').toLowerCase(),fullName:'Bosh administrator',role:'superadmin',permissions:['*'],deniedPermissions:[],active:true,mustChangePassword:true};
const auth = async (req, res, next) => { try { const token = req.headers.authorization?.replace('Bearer ', ''); const data = jwt.verify(token, JWT_SECRET); req.user = data.id==='demo' ? demoAdmin : await User.findById(data.id).lean(); if (!req.user?.active) throw new Error(); next(); } catch { res.status(401).json({ message: 'Xavfsizlik uchun tizimga qayta kiring.' }); } };
const can = permission => (req, res, next) => { const base = permissionsByRole[req.user.role] || []; const allowed = (base.includes('*') || base.includes(permission) || req.user.permissions?.includes(permission)) && !req.user.deniedPermissions?.includes(permission); return allowed ? next() : res.status(403).json({ message: 'Bu amal uchun ruxsat yo‘q' }); };
const audit = (req, action, entity, entityId, meta={}) => Audit.create({ actorId: req.user?._id, action, entity, entityId, ip: req.ip, meta }).catch(()=>{});

app.get('/api/health', (_req,res)=>res.json({ ok:true, service:'Masofaviy2', time:new Date().toISOString() }));
app.post('/api/auth/login', async (req,res) => { const login=String(req.body.login||'').toLowerCase().trim(); const password=String(req.body.password||''); if(mongoose.connection.readyState!==1){ if(login===demoAdmin.login && password===(process.env.ADMIN_PASSWORD||'ChangeMe123!')) return res.json({token:sign(demoAdmin),user:demoAdmin,demo:true}); return res.status(401).json({message:'Login yoki parol noto‘g‘ri. Ma’lumotlar bazasi ulanmaguncha administrator akkauntidan foydalaning.'}); } const user=await User.findOne({login}); if(!user || !user.active || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({message:'Login yoki parol noto‘g‘ri'}); await audit({user,ip:req.ip},'LOGIN','User',user.id); res.json({token:sign(user),user:sanitizeUser(user)}); });
app.get('/api/me', auth, async (req,res)=>{ let current=sanitizeUser(req.user); if(req.user._id!=='demo'&&mongoose.connection.readyState===1) current=sanitizeUser(await User.findById(req.user._id).populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').lean()); res.json({user:current,effectivePermissions:rolePermissions(req.user)}); });
app.get('/api/dashboard', auth, async (req,res)=> { if(mongoose.connection.readyState!==1)return res.json({role:req.user.role,stats:[{label:'Foydalanuvchi',value:1}],today:[],online:io.engine.clientsCount,demo:true}); const day=new Date().getDay()||7; if(req.user.role==='teacher'){ const rows=await scheduleQuery({teacherId:req.user._id}).lean(); const today=rows.filter(x=>x.weekday===day); return res.json({role:req.user.role,stats:[{label:'Mening darslarim',value:rows.length},{label:'Bugungi dars',value:today.length},{label:'Guruhlar',value:new Set(rows.map(x=>String(x.groupId?._id||x.groupId))).size},{label:'Onlayn',value:io.engine.clientsCount}],today}); } if(req.user.role==='student'){ const gid=await resolveUserGroupId(req.user); const rows=gid?await scheduleQuery({groupId:gid}).lean():[]; const today=rows.filter(x=>x.weekday===day); return res.json({role:req.user.role,stats:[{label:'Haftalik dars',value:rows.length},{label:'Bugungi dars',value:today.length},{label:'Fanlar',value:new Set(rows.map(x=>x.subject||x.title)).size},{label:'Onlayn',value:io.engine.clientsCount}],today}); } const [users,faculties,departments,groups,lessons,today]=await Promise.all([User.countDocuments({active:true}),Structure.countDocuments({type:'faculty',active:true}),Structure.countDocuments({type:'department',active:true}),Structure.countDocuments({type:'group',active:true}),Schedule.countDocuments(),scheduleQuery({weekday:day}).limit(10).lean()]); res.json({role:req.user.role,stats:[{label:'Foydalanuvchi',value:users},{label:'Fakultet',value:faculties},{label:'Kafedra',value:departments},{label:'Guruh',value:groups},{label:'Dars',value:lessons}],today,online:io.engine.clientsCount}); });
app.get('/api/structure', auth, async (req,res)=>res.json(mongoose.connection.readyState===1?await Structure.find(req.query.type?{type:req.query.type}:{}).sort({type:1,name:1}).lean():[]));
app.post('/api/structure', auth, can('structure.manage'), async(req,res)=>{ const body={...req.body,externalId:String(req.body.externalId||req.body.code||'').trim()||undefined}; if(body.type==='group'&&!body.externalId)return res.status(400).json({message:'Guruh uchun ID kiriting'}); if(body.externalId&&await Structure.exists({type:body.type,externalId:body.externalId}))return res.status(409).json({message:'Bu ID allaqachon mavjud'}); const item=await Structure.create(body); audit(req,'CREATE','Structure',item.id,{type:item.type,externalId:item.externalId}); res.status(201).json(item); });
app.delete('/api/structure/:id', auth, can('structure.manage'), async(req,res)=>{ const children=await Structure.countDocuments({parentId:req.params.id,active:true}); if(children) return res.status(409).json({message:'Avval ichki bo‘lim yoki guruhlarni o‘chiring'}); await Structure.findByIdAndUpdate(req.params.id,{active:false}); audit(req,'ARCHIVE','Structure',req.params.id); res.json({ok:true}); });
app.get('/api/users', auth, can('users.manage'), async(req,res)=>res.json(mongoose.connection.readyState===1?await User.find(req.query.role?{role:req.query.role}:{}).select('-passwordHash').sort({fullName:1}).limit(500).lean():[demoAdmin]));
app.post('/api/users', auth, can('users.manage'), async(req,res)=>{ const password=req.body.password || crypto.randomBytes(5).toString('hex'); const body={...req.body,login:String(req.body.login||'').toLowerCase().trim()}; if(body.groupId&&!mongoose.isValidObjectId(body.groupId)){const g=await resolveStructure(body.groupId,'group');if(!g)return res.status(400).json({message:'Guruh ID topilmadi'});body.groupId=g._id;body.group=g.externalId||g.code||g.name;} const user=await User.create({...body,passwordHash:await bcrypt.hash(password,11)}); audit(req,'CREATE','User',user.id,{role:user.role}); res.status(201).json({user:{id:user.id,login:user.login,fullName:user.fullName,role:user.role},temporaryPassword:password}); });
app.patch('/api/users/:id/permissions', auth, can('permissions.manage'), async(req,res)=>{ const user=await User.findByIdAndUpdate(req.params.id,{$set:{permissions:req.body.permissions||[],deniedPermissions:req.body.deniedPermissions||[]}},{new:true}).select('-passwordHash'); audit(req,'PERMISSIONS','User',req.params.id,req.body); res.json(user); });
app.get('/api/schedules', auth, async(req,res)=>{ if(mongoose.connection.readyState!==1)return res.json([]); const filter={}; if(req.query.groupId) filter.groupId=req.query.groupId; res.json(await Schedule.find(filter).sort({weekday:1,start:1}).lean()); });
app.post('/api/schedules', auth, can('schedule.manage'), async(req,res)=>{ const clash=await Schedule.findOne({teacherId:req.body.teacherId,weekday:req.body.weekday,start:{$lt:req.body.end},end:{$gt:req.body.start}}); if(clash) return res.status(409).json({message:'O‘qituvchining bu vaqtda boshqa darsi bor'}); const item=await Schedule.create(req.body); audit(req,'CREATE','Schedule',item.id,req.body); res.status(201).json(item); });
app.delete('/api/schedules/:id', auth, can('schedule.manage'), async(req,res)=>{ await Schedule.findByIdAndDelete(req.params.id); audit(req,'DELETE','Schedule',req.params.id); res.json({ok:true}); });
app.get('/api/audit', auth, can('reports.view'), async(_req,res)=>res.json(await Audit.find().sort({createdAt:-1}).limit(200).lean()));

io.use(async(socket,next)=>{ try { const data=jwt.verify(socket.handshake.auth.token,JWT_SECRET); socket.user=data.id==='demo'?demoAdmin:await User.findById(data.id).lean(); if(!socket.user?.active) throw new Error(); next(); } catch { next(new Error('unauthorized')); } });
io.on('connection', socket => { socket.on('lesson:join', async({lessonId})=>{ socket.join(`lesson:${lessonId}`); const row=await Attendance.create({lessonId,userId:socket.user._id,joinedAt:new Date(),status:'present'}); socket.data.attendanceId=row.id; io.to(`lesson:${lessonId}`).emit('lesson:presence',{userId:socket.user._id,fullName:socket.user.fullName,state:'joined'}); }); socket.on('lesson:chat', ({lessonId,text})=>{ const clean=String(text||'').trim().slice(0,1000); if(clean) io.to(`lesson:${lessonId}`).emit('lesson:chat',{id:crypto.randomUUID(),userId:socket.user._id,fullName:socket.user.fullName,text:clean,at:new Date().toISOString()}); }); socket.on('disconnect', async()=>{ if(socket.data.attendanceId) { const row=await Attendance.findById(socket.data.attendanceId); if(row){ row.leftAt=new Date(); row.minutes=Math.max(1,Math.round((row.leftAt-row.joinedAt)/60000)); await row.save(); } } }); });

async function bootstrap(){ server.listen(PORT,'0.0.0.0',()=>console.log(`Masofaviy2 :${PORT}`)); if(!process.env.MONGODB_URI){console.warn('MONGODB_URI yo‘q: taqdimot rejimi ishga tushdi');return} try{await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});const login=(process.env.ADMIN_LOGIN||'admin').toLowerCase();if(!await User.exists({login}))await User.create({login,fullName:'Bosh administrator',role:'superadmin',passwordHash:await bcrypt.hash(process.env.ADMIN_PASSWORD||'ChangeMe123!',11),mustChangePassword:true});console.log('MongoDB ulandi')}catch(err){console.error('MongoDB ulanmagan, taqdimot rejimi:',err.message)} }
bootstrap();
