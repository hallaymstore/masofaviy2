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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, transports: ['websocket', 'polling'] });
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
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
  fullName: { type: String, required: true }, role: { type: String, enum: Object.keys(permissionsByRole), required: true },
  permissions: [String], deniedPermissions: [String], faculty: String, department: String, group: String, active: { type: Boolean, default: true }, mustChangePassword: { type: Boolean, default: true }
}, { timestamps: true });
const structureSchema = new mongoose.Schema({ type: { type: String, enum: ['faculty','department','group'], required: true }, name: { type: String, required: true }, code: String, parentId: mongoose.Schema.Types.ObjectId, active: { type: Boolean, default: true } }, { timestamps: true });
const scheduleSchema = new mongoose.Schema({ title: { type: String, required: true }, subject: String, groupId: mongoose.Schema.Types.ObjectId, teacherId: mongoose.Schema.Types.ObjectId, weekday: { type: Number, min: 1, max: 7 }, date: String, start: String, end: String, room: String, kind: { type: String, enum: ['lecture','practice','seminar','exam'], default: 'lecture' }, recurring: { type: Boolean, default: true } }, { timestamps: true });
const auditSchema = new mongoose.Schema({ actorId: mongoose.Schema.Types.ObjectId, action: String, entity: String, entityId: String, ip: String, meta: mongoose.Schema.Types.Mixed }, { timestamps: true });
const attendanceSchema = new mongoose.Schema({ lessonId: String, userId: mongoose.Schema.Types.ObjectId, joinedAt: Date, leftAt: Date, minutes: Number, status: { type: String, enum: ['present','late','absent','excused'] } }, { timestamps: true });
const User = mongoose.model('User', userSchema), Structure = mongoose.model('Structure', structureSchema), Schedule = mongoose.model('Schedule', scheduleSchema), Audit = mongoose.model('Audit', auditSchema), Attendance = mongoose.model('Attendance', attendanceSchema);

const sign = user => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h', issuer: 'masofaviy2' });
const auth = async (req, res, next) => { try { const token = req.headers.authorization?.replace('Bearer ', ''); const data = jwt.verify(token, JWT_SECRET); req.user = await User.findById(data.id).lean(); if (!req.user?.active) throw new Error(); next(); } catch { res.status(401).json({ message: 'Tizimga qayta kiring' }); } };
const can = permission => (req, res, next) => { const base = permissionsByRole[req.user.role] || []; const allowed = (base.includes('*') || base.includes(permission) || req.user.permissions?.includes(permission)) && !req.user.deniedPermissions?.includes(permission); return allowed ? next() : res.status(403).json({ message: 'Bu amal uchun ruxsat yo‘q' }); };
const audit = (req, action, entity, entityId, meta={}) => Audit.create({ actorId: req.user?._id, action, entity, entityId, ip: req.ip, meta }).catch(()=>{});

app.get('/api/health', (_req,res)=>res.json({ ok:true, service:'Masofaviy2', time:new Date().toISOString() }));
app.post('/api/auth/login', async (req,res) => { const login=String(req.body.login||'').toLowerCase().trim(); const user=await User.findOne({login}); if(!user || !user.active || !(await bcrypt.compare(String(req.body.password||''),user.passwordHash))) return res.status(401).json({message:'Login yoki parol noto‘g‘ri'}); await audit({user,ip:req.ip},'LOGIN','User',user.id); res.json({token:sign(user),user:{id:user.id,fullName:user.fullName,role:user.role,permissions:user.permissions,mustChangePassword:user.mustChangePassword}}); });
app.get('/api/me', auth, (req,res)=>res.json({ user:req.user, effectivePermissions:[...(permissionsByRole[req.user.role]||[]),...(req.user.permissions||[])].filter(p=>!req.user.deniedPermissions?.includes(p)) }));
app.get('/api/dashboard', auth, async (_req,res)=> { const [users,faculties,departments,groups,lessons] = await Promise.all([User.countDocuments({active:true}),Structure.countDocuments({type:'faculty',active:true}),Structure.countDocuments({type:'department',active:true}),Structure.countDocuments({type:'group',active:true}),Schedule.countDocuments()]); res.json({users,faculties,departments,groups,lessons,online:io.engine.clientsCount}); });
app.get('/api/structure', auth, async (req,res)=>res.json(await Structure.find(req.query.type?{type:req.query.type}:{}).sort({type:1,name:1}).lean()));
app.post('/api/structure', auth, can('structure.manage'), async(req,res)=>{ const item=await Structure.create(req.body); audit(req,'CREATE','Structure',item.id,req.body); res.status(201).json(item); });
app.delete('/api/structure/:id', auth, can('structure.manage'), async(req,res)=>{ const children=await Structure.countDocuments({parentId:req.params.id,active:true}); if(children) return res.status(409).json({message:'Avval ichki bo‘lim yoki guruhlarni o‘chiring'}); await Structure.findByIdAndUpdate(req.params.id,{active:false}); audit(req,'ARCHIVE','Structure',req.params.id); res.json({ok:true}); });
app.get('/api/users', auth, can('users.manage'), async(req,res)=>res.json(await User.find(req.query.role?{role:req.query.role}:{}).select('-passwordHash').sort({fullName:1}).limit(500).lean()));
app.post('/api/users', auth, can('users.manage'), async(req,res)=>{ const password=req.body.password || crypto.randomBytes(5).toString('hex'); const user=await User.create({...req.body,passwordHash:await bcrypt.hash(password,11)}); audit(req,'CREATE','User',user.id,{role:user.role}); res.status(201).json({user:{id:user.id,login:user.login,fullName:user.fullName,role:user.role},temporaryPassword:password}); });
app.patch('/api/users/:id/permissions', auth, can('permissions.manage'), async(req,res)=>{ const user=await User.findByIdAndUpdate(req.params.id,{$set:{permissions:req.body.permissions||[],deniedPermissions:req.body.deniedPermissions||[]}},{new:true}).select('-passwordHash'); audit(req,'PERMISSIONS','User',req.params.id,req.body); res.json(user); });
app.get('/api/schedules', auth, async(req,res)=>{ const filter={}; if(req.query.groupId) filter.groupId=req.query.groupId; res.json(await Schedule.find(filter).sort({weekday:1,start:1}).lean()); });
app.post('/api/schedules', auth, can('schedule.manage'), async(req,res)=>{ const clash=await Schedule.findOne({teacherId:req.body.teacherId,weekday:req.body.weekday,start:{$lt:req.body.end},end:{$gt:req.body.start}}); if(clash) return res.status(409).json({message:'O‘qituvchining bu vaqtda boshqa darsi bor'}); const item=await Schedule.create(req.body); audit(req,'CREATE','Schedule',item.id,req.body); res.status(201).json(item); });
app.delete('/api/schedules/:id', auth, can('schedule.manage'), async(req,res)=>{ await Schedule.findByIdAndDelete(req.params.id); audit(req,'DELETE','Schedule',req.params.id); res.json({ok:true}); });
app.get('/api/audit', auth, can('reports.view'), async(_req,res)=>res.json(await Audit.find().sort({createdAt:-1}).limit(200).lean()));

io.use(async(socket,next)=>{ try { const data=jwt.verify(socket.handshake.auth.token,JWT_SECRET); socket.user=await User.findById(data.id).lean(); if(!socket.user?.active) throw new Error(); next(); } catch { next(new Error('unauthorized')); } });
io.on('connection', socket => { socket.on('lesson:join', async({lessonId})=>{ socket.join(`lesson:${lessonId}`); const row=await Attendance.create({lessonId,userId:socket.user._id,joinedAt:new Date(),status:'present'}); socket.data.attendanceId=row.id; io.to(`lesson:${lessonId}`).emit('lesson:presence',{userId:socket.user._id,fullName:socket.user.fullName,state:'joined'}); }); socket.on('lesson:chat', ({lessonId,text})=>{ const clean=String(text||'').trim().slice(0,1000); if(clean) io.to(`lesson:${lessonId}`).emit('lesson:chat',{id:crypto.randomUUID(),userId:socket.user._id,fullName:socket.user.fullName,text:clean,at:new Date().toISOString()}); }); socket.on('disconnect', async()=>{ if(socket.data.attendanceId) { const row=await Attendance.findById(socket.data.attendanceId); if(row){ row.leftAt=new Date(); row.minutes=Math.max(1,Math.round((row.leftAt-row.joinedAt)/60000)); await row.save(); } } }); });

async function bootstrap(){ await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/masofaviy2'); const login=(process.env.ADMIN_LOGIN||'admin').toLowerCase(); if(!await User.exists({login})) await User.create({login,fullName:'Bosh administrator',role:'superadmin',passwordHash:await bcrypt.hash(process.env.ADMIN_PASSWORD||'ChangeMe123!',11),mustChangePassword:true}); server.listen(PORT,()=>console.log(`Masofaviy2 :${PORT}`)); }
bootstrap().catch(err=>{ console.error(err); process.exit(1); });
