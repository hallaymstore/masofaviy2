import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { installLms } from './lms.js';
import { generateTotpSecret,verifyTotp,encryptSecret,decryptSecret,generateRecoveryCodes,hashRecoveryCode,consumeRecoveryCode,otpauthUri } from './auth-security.js';
import { installCompliance } from './compliance.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const server = http.createServer(app);
const allowedOrigins = String(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const originCheck = (origin,callback) => {
  if(!origin || !allowedOrigins.length || allowedOrigins.includes(origin))return callback(null,true);
  callback(new Error('Origin ruxsat etilmagan'));
};
const corsOptions = { origin: originCheck, credentials: true };
const io = new Server(server, { cors: corsOptions, transports: ['websocket', 'polling'] });
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';
const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY || JWT_SECRET;
const REQUIRE_IN_PERSON_IDENTITY = String(process.env.REQUIRE_IN_PERSON_IDENTITY||'false').toLowerCase()==='true';
const IN_PERSON_IDENTITY_ROLES = new Set(String(process.env.IN_PERSON_IDENTITY_ROLES||'student').split(',').map(x=>x.trim()).filter(Boolean));
const sessionCookie='m2_session',csrfCookie='m2_csrf';
const readCookie=(header,name)=>String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const csrfFor=token=>crypto.createHmac('sha256',JWT_SECRET).update(token).digest('hex');
const cookieOptions=()=>`Path=/; Max-Age=43200; SameSite=Strict${process.env.NODE_ENV==='production'?'; Secure':''}`;
const setSession=(res,user)=>{const token=sign(user),options=cookieOptions();res.set('Set-Cookie',[`${sessionCookie}=${token}; HttpOnly; ${options}`,`${csrfCookie}=${csrfFor(token)}; ${options}`]);};
const clearSession=res=>res.set('Set-Cookie',[`${sessionCookie}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`,`${csrfCookie}=; Path=/; Max-Age=0; SameSite=Strict`]);

app.use(helmet({
  contentSecurityPolicy:{
    useDefaults:false,
    directives:{
      defaultSrc:["'self'"],
      baseUri:["'self'"],
      objectSrc:["'none'"],
      formAction:["'self'"],
      frameAncestors:["'self'"],
      scriptSrc:["'self'","'unsafe-eval'","blob:"],
      styleSrc:["'self'","'unsafe-inline'"],
      imgSrc:["'self'","data:","blob:","https:"],
      mediaSrc:["'self'","blob:","https:"],
      connectSrc:["'self'","https:","ws:","wss:"],
      frameSrc:["'self'","https:"],
      fontSrc:["'self'","data:"],
      workerSrc:["'self'","blob:"],
      manifestSrc:["'self'"]
    }
  },
  crossOriginEmbedderPolicy:false,
  referrerPolicy:{policy:'strict-origin-when-cross-origin'},
  strictTransportSecurity: process.env.NODE_ENV==='production'?{maxAge:31536000,includeSubDomains:true,preload:false}:false,
  permissionsPolicy:{features:{camera:["'self'"],microphone:["'self'"],geolocation:[],payment:[],usb:[],serial:[],bluetooth:[]}}
}));
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '12mb' }));
const API_RATE_WINDOW_MS=Math.max(60000,Number(process.env.API_RATE_WINDOW_MS||5*60*1000));
const API_RATE_MAX=Math.max(100,Number(process.env.API_RATE_MAX||600));
const apiRate=new Map();
app.use('/api',(req,res,next)=>{
  if(req.path==='/health')return next();
  const now=Date.now(),key=String(req.ip||'unknown');
  let row=apiRate.get(key);
  if(!row||now-row.start>API_RATE_WINDOW_MS)row={start:now,count:0};
  row.count++;apiRate.set(key,row);
  res.setHeader('X-RateLimit-Limit',String(API_RATE_MAX));
  res.setHeader('X-RateLimit-Remaining',String(Math.max(0,API_RATE_MAX-row.count)));
  if(row.count>API_RATE_MAX)return res.status(429).json({message:'Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring.'});
  if(apiRate.size>5000)for(const [k,v] of apiRate)if(now-v.start>API_RATE_WINDOW_MS)apiRate.delete(k);
  next();
});
app.use('/vendor/face-detection',express.static('node_modules/@mediapipe/face_detection',{maxAge:'1y',immutable:true,index:false}));
app.use(express.static('public', { maxAge: '1d', etag: true, setHeaders:(res,file)=>{ if(/\.(?:html|js|css|webmanifest)$/i.test(file)) res.setHeader('Cache-Control','no-cache'); } }));

const permissionsByRole = {
  superadmin: ['*'],
  admin: ['structure.manage','users.manage','users.control','schedule.manage','reports.view','lessons.monitor','permissions.manage','analytics.view','attendance.manage','live.manage','videos.manage'],
  tech: ['structure.manage','users.manage','users.control','schedule.manage','reports.view','lessons.support','analytics.view','attendance.manage','live.manage','videos.manage'],
  rectorate: ['reports.view','lessons.monitor','analytics.view','videos.view'],
  dean: ['faculty.view','groups.manage','schedule.manage','reports.view','lessons.monitor','analytics.view','videos.view'],
  department: ['department.view','teachers.manage','schedule.manage','reports.view','analytics.view','lessons.monitor','videos.view'],
  teacher: ['lessons.manage','attendance.manage','assignments.manage','grades.manage','chat.use','analytics.self','live.host','videos.upload','videos.view'],
  student: ['schedule.view','lessons.join','assignments.submit','grades.view','chat.use','analytics.self','videos.view'],
  tutor: ['groups.view','attendance.view','students.support','reports.view','analytics.view','lessons.monitor','videos.view']
};

const userSchema = new mongoose.Schema({
  login: { type: String, unique: true, index: true, required: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true }, externalId:{type:String,trim:true}, role: { type: String, enum: Object.keys(permissionsByRole), required: true },
  permissions: [String], deniedPermissions: [String], faculty: String, department: String, group: String,
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' },
  email: { type: String, trim: true }, phone: { type: String, trim: true }, citizenshipCountry:{type:String,trim:true,uppercase:true,default:'UZ',maxlength:2}, avatarUrl: { type: String, trim: true }, bio: { type: String, trim: true, maxlength: 500 }, direction: { type: String, trim: true }, courseYear: { type: Number, min: 1, max: 6 },
  active: { type: Boolean, default: true }, mustChangePassword: { type: Boolean, default: true },
  sessionVersion:{type:Number,default:0,min:0},
  totpEnabled:{type:Boolean,default:false},totpSecretEncrypted:{type:String,select:false},totpPendingSecretEncrypted:{type:String,select:false},totpRecoveryHashes:{type:[String],select:false,default:[]},
  identityVerifiedAt:Date,identityVerifiedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},identityVerificationMode:{type:String,enum:['in_person']},identityDocumentType:{type:String,trim:true,maxlength:80},identityDocumentLast4:{type:String,trim:true,maxlength:4},identityVerificationNote:{type:String,trim:true,maxlength:300},
  lastLoginAt: Date, lastSeenAt: Date, lastLoginIp: String, loginCount: { type: Number, default: 0 }, statusNote: { type: String, trim: true, maxlength: 300 }
}, { timestamps: true });
userSchema.index({externalId:1},{unique:true,sparse:true});
const structureSchema = new mongoose.Schema({ type: { type: String, enum: ['faculty','department','group'], required: true }, name: { type: String, required: true }, externalId: { type: String, trim: true }, code: String, parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure' }, active: { type: Boolean, default: true } }, { timestamps: true });
structureSchema.index({ type: 1, externalId: 1 }, { unique: true, sparse: true });
const scheduleSchema = new mongoose.Schema({ title: { type: String, required: true }, subject: String, groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Structure', required: true }, teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, weekday: { type: Number, min: 1, max: 7 }, date: String, start: String, end: String, room: String, kind: { type: String, enum: ['lecture','practice','seminar','exam','final_exam'], default: 'lecture' }, recurring: { type: Boolean, default: true }, liveEnabled:{type:Boolean,default:true}, maxParticipants:{type:Number,default:100,min:2,max:500} }, { timestamps: true });
const auditSchema = new mongoose.Schema({ actorId: mongoose.Schema.Types.ObjectId, actorLogin: String, actorName: String, action: String, entity: String, entityId: String, ip: String, meta: mongoose.Schema.Types.Mixed }, { timestamps: true });
const attendanceSchema = new mongoose.Schema({ lessonId: String, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, dateKey: String, joinedAt: Date, leftAt: Date, minutes: Number, reconnectCount:{type:Number,default:0,min:0}, lastJoinedAt:Date, status: { type: String, enum: ['present','late','absent','excused'] }, lastCheckedAt:Date, manualMarkedAt:Date, manualMarkedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, manualNote:{type:String,trim:true,maxlength:300}, checkpoints:[{minute:Number,at:Date,state:{type:String,enum:['present','late','absent']}}] }, { timestamps: true });
const liveSessionSchema = new mongoose.Schema({ scheduleId:{type:mongoose.Schema.Types.ObjectId,ref:'Schedule',required:true,index:true},dateKey:{type:String,required:true,index:true},groupId:{type:mongoose.Schema.Types.ObjectId,ref:'Structure',required:true},teacherId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},roomName:{type:String,required:true,unique:true},providerHost:{type:String,required:true},status:{type:String,enum:['scheduled','active','ended'],default:'scheduled',index:true},startedAt:Date,endedAt:Date,startedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},participantPeak:{type:Number,default:0},currentParticipants:{type:Number,default:0},lastAttendanceCheckpointMinute:{type:Number,default:0},lastAttendanceCheckpointAt:Date}, {timestamps:true});
liveSessionSchema.index({scheduleId:1,dateKey:1},{unique:true});
const videoLessonSchema = new mongoose.Schema({ title:{type:String,required:true,trim:true},description:{type:String,trim:true,maxlength:4000},subject:{type:String,trim:true},courseId:{type:mongoose.Schema.Types.ObjectId,ref:'Course',index:true},moduleTitle:{type:String,trim:true,maxlength:180,default:'Asosiy modul'},topicTitle:{type:String,trim:true,maxlength:220},sequence:{type:Number,min:0,max:10000,default:0,index:true},checkpointQuizId:{type:mongoose.Schema.Types.ObjectId,ref:'Quiz',default:null},teacherId:{type:mongoose.Schema.Types.ObjectId,ref:'User'},groupIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Structure'}],direction:{type:String,trim:true},courseYears:[Number],tags:[String],sourceType:{type:String,enum:['youtube','mp4','url'],default:'youtube'},sourceUrl:{type:String,required:true,trim:true},thumbnailUrl:{type:String,trim:true},durationMinutes:{type:Number,min:0,max:2000},published:{type:Boolean,default:true,index:true},featured:{type:Boolean,default:false},views:{type:Number,default:0},likes:{type:Number,default:0},createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}},{timestamps:true});
const videoProgressSchema = new mongoose.Schema({videoId:{type:mongoose.Schema.Types.ObjectId,ref:'VideoLesson',required:true},userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},watchedSeconds:{type:Number,default:0},completed:{type:Boolean,default:false},liked:{type:Boolean,default:false},lastViewedAt:Date},{timestamps:true});
videoProgressSchema.index({videoId:1,userId:1},{unique:true});
const videoCommentSchema = new mongoose.Schema({videoId:{type:mongoose.Schema.Types.ObjectId,ref:'VideoLesson',required:true,index:true},userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},parentId:{type:mongoose.Schema.Types.ObjectId,ref:'VideoComment',default:null,index:true},text:{type:String,required:true,trim:true,maxlength:1500},editedAt:Date},{timestamps:true});
videoCommentSchema.index({videoId:1,createdAt:-1});
const institutionSettingsSchema = new mongoose.Schema({
  key:{type:String,unique:true,default:'primary',immutable:true},
  institutionName:{type:String,trim:true,maxlength:240,default:'Qarshi davlat texnika universiteti'},
  shortName:{type:String,trim:true,maxlength:60,default:'QarDTU'},
  website:{type:String,trim:true,maxlength:1000,default:'https://kstu.uz/'},
  logoUrl:{type:String,trim:true,maxlength:1000,default:''},
  appIconUrl:{type:String,trim:true,maxlength:1000,default:''},
  primaryColor:{type:String,trim:true,maxlength:7,default:'#0b4fd8'},
  accentColor:{type:String,trim:true,maxlength:7,default:'#19b5fe'},
  landingTitle:{type:String,trim:true,maxlength:240,default:'Darslar, davomat va nazorat — bitta joyda'},
  landingText:{type:String,trim:true,maxlength:1000,default:'O‘qituvchi darsni boshlaydi, talaba o‘z jadvalidan kiradi. Davomat, video, topshiriq va hisobotlar bir tizimda yuradi.'},
  address:{type:String,trim:true,maxlength:500,default:'Qarshi sh., Mustaqillik ko‘chasi, 225-uy'},
  phone:{type:String,trim:true,maxlength:80,default:'+998 75 220-09-24'},
  founded:{type:String,trim:true,maxlength:120,default:'10.12.2024'},
  legalBasis:{type:String,trim:true,maxlength:240,default:'PQ-428'},
  description:{type:String,trim:true,maxlength:2000,default:'Universitetning fakultet, kafedra, guruh, dars jadvali, elektron resurs va jonli mashg‘ulotlarini yagona raqamli muhitda boshqarish.'},
  lmsUrl:{type:String,trim:true,maxlength:1000,default:'https://moodle.kstu.uz/'},
  repositoryUrl:{type:String,trim:true,maxlength:1000,default:'https://dspace.kstu.uz/'},
  portfolioUrl:{type:String,trim:true,maxlength:1000,default:'https://portfel.kstu.uz/'},
  admissionsUrl:{type:String,trim:true,maxlength:1000,default:'https://my.uzbmb.uz/university-about-direction/435'},
  organizationType:{type:String,enum:['university','school','training_center'],default:'university'},
  tenantCode:{type:String,trim:true,maxlength:64,default:'QARDTU'},
  domain:{type:String,trim:true,maxlength:255,default:''},
  defaultLanguage:{type:String,enum:['uz','ru','en'],default:'uz'},
  supportEmail:{type:String,trim:true,maxlength:240,default:''},
  supportPhone:{type:String,trim:true,maxlength:80,default:''},
  contractLabel:{type:String,trim:true,maxlength:160,default:''},
  licensePlan:{type:String,enum:['starter','standard','pro','enterprise'],default:'enterprise'},
  licenseExpiresAt:{type:Date,default:null},
  maxUsers:{type:Number,min:10,max:1000000,default:5000},
  maxConcurrentRooms:{type:Number,min:1,max:500,default:6},
  maxRoomParticipants:{type:Number,min:2,max:500,default:120},
  modules:{type:mongoose.Schema.Types.Mixed,default:()=>({live:true,videos:true,analytics:true,reports:true,library:true,communications:true,curriculum:true,finalExams:true,scorm:true,proctoring:true,publicTimetable:true})}
},{timestamps:true});
const User = mongoose.model('User', userSchema), Structure = mongoose.model('Structure', structureSchema), Schedule = mongoose.model('Schedule', scheduleSchema), Audit = mongoose.model('Audit', auditSchema), Attendance = mongoose.model('Attendance', attendanceSchema), LiveSession=mongoose.model('LiveSession',liveSessionSchema), VideoLesson=mongoose.model('VideoLesson',videoLessonSchema), VideoProgress=mongoose.model('VideoProgress',videoProgressSchema), VideoComment=mongoose.model('VideoComment',videoCommentSchema), InstitutionSettings=mongoose.model('InstitutionSettings',institutionSettingsSchema);

const DEFAULT_BRANDING=Object.freeze({
  productName:'HALLAYM EDU',
  institutionName:'Qarshi davlat texnika universiteti',
  shortName:'QarDTU',
  website:'https://kstu.uz/',
  logoUrl:'',
  appIconUrl:'',
  primaryColor:'#0b4fd8',
  accentColor:'#19b5fe',
  landingTitle:'Darslar, davomat va nazorat — bitta joyda',
  landingText:'O‘qituvchi darsni boshlaydi, talaba o‘z jadvalidan kiradi. Davomat, video, topshiriq va hisobotlar bir tizimda yuradi.',
  address:'Qarshi sh., Mustaqillik ko‘chasi, 225-uy',
  phone:'+998 75 220-09-24',
  founded:'10.12.2024',
  legalBasis:'PQ-428',
  description:'Universitetning fakultet, kafedra, guruh, dars jadvali, elektron resurs va jonli mashg‘ulotlarini yagona raqamli muhitda boshqarish.',
  lmsUrl:'https://moodle.kstu.uz/',
  repositoryUrl:'https://dspace.kstu.uz/',
  portfolioUrl:'https://portfel.kstu.uz/',
  admissionsUrl:'https://my.uzbmb.uz/university-about-direction/435',
  organizationType:'university',
  tenantCode:'QARDTU',
  domain:'',
  defaultLanguage:'uz',
  supportEmail:'',
  supportPhone:'',
  contractLabel:'',
  licensePlan:'enterprise',
  licenseExpiresAt:null,
  maxUsers:5000,
  maxConcurrentRooms:6,
  maxRoomParticipants:120,
  modules:{live:true,videos:true,analytics:true,reports:true,library:true,communications:true,curriculum:true,finalExams:true,scorm:true,proctoring:true,publicTimetable:true}
});
const brandingPublic=row=>Object.fromEntries(Object.keys(DEFAULT_BRANDING).map(k=>[k,k==='productName'?DEFAULT_BRANDING.productName:(row?.[k]??DEFAULT_BRANDING[k])]));
const getBranding=async()=>mongoose.connection.readyState===1?brandingPublic(await InstitutionSettings.findOne({key:'primary'}).lean()):{...DEFAULT_BRANDING};
const brandingText=(value,max,required=false)=>{const s=String(value??'').trim().slice(0,max);if(required&&!s)throw new Error('Universitet nomini kiriting');return s};
const brandingUrl=value=>{const s=String(value??'').trim();if(!s)return '';if(s.length>1000||!/^https:\/\//i.test(s))throw new Error('Havola https:// bilan boshlanishi kerak');return s};
const brandingColor=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback;
const boolValue=(v,fallback=false)=>v===undefined?fallback:(v===true||v==='true'||v===1||v==='1'||v==='on');
const intValue=(v,min,max,fallback)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback};
const MODULE_DEFAULTS=Object.freeze({live:true,videos:true,analytics:true,reports:true,library:true,communications:true,curriculum:true,finalExams:true,scorm:true,proctoring:true,publicTimetable:true});
const normalizedModules=value=>Object.fromEntries(Object.keys(MODULE_DEFAULTS).map(k=>[k,boolValue(value?.[k],MODULE_DEFAULTS[k])]));
const getInstanceSettings=async()=>mongoose.connection.readyState===1?(await InstitutionSettings.findOne({key:'primary'}).lean())||{...DEFAULT_BRANDING}:{...DEFAULT_BRANDING};
const modulePathMap=[
  ['live',/^\/api\/live(?:\/|$)/],['videos',/^\/api\/(?:videos|video-comments)(?:\/|$)/],
  ['analytics',/^\/api\/analytics(?:\/|$)/],['reports',/^\/api\/(?:reports|audit)(?:\/|$)/],
  ['library',/^\/api\/(?:library|lms\/library)(?:\/|$)/],['communications',/^\/api\/(?:communications|lms\/communications)(?:\/|$)/],
  ['curriculum',/^\/api\/(?:curriculum|lms\/curricula)(?:\/|$)/],['finalExams',/^\/api\/(?:final-exams|lms\/final-exams)(?:\/|$)/],
  ['scorm',/^\/api\/(?:scorm|lms\/scorm)(?:\/|$)/],['proctoring',/^\/api\/(?:proctoring|lms\/proctor)(?:\/|$)/]
];
const onlineUsers = new Map();
const disconnectUserSockets=userId=>{for(const socket of io.sockets.sockets.values())if(String(socket.user?._id||'')===String(userId))socket.disconnect(true)};
const APP_UTC_OFFSET_MINUTES = Number(process.env.APP_UTC_OFFSET_MINUTES || 300);
const LATE_AFTER_MINUTES = Math.max(1, Number(process.env.LATE_AFTER_MINUTES || 10));
const ATTENDANCE_RECHECK_MINUTES = Math.max(1, Number(process.env.ATTENDANCE_RECHECK_MINUTES || 10));
const PUBLIC_TIMETABLE_ENABLED = process.env.PUBLIC_TIMETABLE_ENABLED === 'true';
const VIDEO_PROVIDER_HOST = 'mediasoup';
const SFU_BRIDGE_URL = String(process.env.SFU_BRIDGE_URL || '');
const SFU_BRIDGE_URLS = String(process.env.SFU_BRIDGE_URLS || SFU_BRIDGE_URL).split(',').map(x=>x.trim()).filter(Boolean);
const SFU_BRIDGE_SECRET = String(process.env.SFU_BRIDGE_SECRET || '');
const SFU_HEALTH_POLL_MS = Math.max(2000, Number(process.env.SFU_HEALTH_POLL_MS || 5000));
const SFU_NODE_STALE_MS = Math.max(SFU_HEALTH_POLL_MS*2, Number(process.env.SFU_NODE_STALE_MS || 15000));
const TURN_URLS = String(process.env.TURN_URLS || process.env.TURN_URL || '').split(',').map(x=>x.trim()).filter(Boolean);
const TURN_USERNAME = String(process.env.TURN_USERNAME || '');
const TURN_CREDENTIAL = String(process.env.TURN_CREDENTIAL || '');
const TURN_SHARED_SECRET = String(process.env.TURN_SHARED_SECRET || '');

const LOGIN_WINDOW_MS = Math.max(60000, Number(process.env.LOGIN_WINDOW_MS || 15*60*1000));
const LOGIN_MAX_ATTEMPTS = Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS || 7));
const loginAttempts = new Map();
const loginAttemptKey = (req,login) => (req.ip||'unknown')+':'+String(login||'').toLowerCase();
const loginBlocked = key => {const x=loginAttempts.get(key);if(!x)return false;if(Date.now()-x.first>LOGIN_WINDOW_MS){loginAttempts.delete(key);return false}return x.count>=LOGIN_MAX_ATTEMPTS};
const noteLoginFailure = key => {const now=Date.now(),x=loginAttempts.get(key);if(!x||now-x.first>LOGIN_WINDOW_MS)loginAttempts.set(key,{count:1,first:now});else{x.count++;loginAttempts.set(key,x)}if(loginAttempts.size>5000){for(const [k,v] of loginAttempts)if(now-v.first>LOGIN_WINDOW_MS)loginAttempts.delete(k)}};

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

const sanitizeUser = user => { const x = user?.toObject ? user.toObject() : { ...(user || {}) }; delete x.passwordHash;delete x.totpSecretEncrypted;delete x.totpPendingSecretEncrypted;delete x.totpRecoveryHashes;return x; };
const hasPermission = (user, permission) => { const base = permissionsByRole[user?.role] || []; return (base.includes('*') || base.includes(permission) || user?.permissions?.includes(permission)) && !user?.deniedPermissions?.includes(permission); };
const rolePermissions = user => [...new Set([...(permissionsByRole[user?.role]||[]), ...(user?.permissions||[])])].filter(p=>!user?.deniedPermissions?.includes(p));
const canAssignRole = (actorRole,targetRole) => actorRole==='superadmin' ? Boolean(permissionsByRole[targetRole]) : actorRole==='admin' ? Boolean(permissionsByRole[targetRole])&&targetRole!=='superadmin' : actorRole==='tech' ? Boolean(permissionsByRole[targetRole])&&!['superadmin','admin'].includes(targetRole) : false;
const knownPermissions = new Set(Object.values(permissionsByRole).flat().filter(p=>p!=='*'));
const normKey = key => String(key||'').trim().toLowerCase().replace(/[ʻ’'`]/g,'').replace(/[^a-z0-9а-яёқғҳў]+/gi,'_').replace(/^_+|_+$/g,'');
const normalizeRow = row => Object.fromEntries(Object.entries(row).map(([k,v])=>[normKey(k), typeof v === 'string' ? v.trim() : v]));
const pick = (row,names) => { for (const n of names) { const v=row[normKey(n)]; if(v!==undefined && v!==null && String(v).trim()!=='') return v; } return ''; };
const parseFileRows = async body => { const buffer=Buffer.from(body.contentBase64||'','base64'); if(!buffer.length || buffer.length>8*1024*1024) throw new Error('Fayl bo‘sh yoki 8 MB dan katta'); const filename=String(body.filename||'').toLowerCase(); let raw=[]; if(filename.endsWith('.csv')){ raw=parseCsv(buffer.toString('utf8').replace(/^\\uFEFF/,''),{columns:true,skip_empty_lines:true,relax_column_count:true,trim:true}); } else if(filename.endsWith('.xlsx')){ const wb=new ExcelJS.Workbook(); await wb.xlsx.load(buffer); const ws=wb.worksheets[0]; if(!ws)throw new Error('Excel jadvali topilmadi'); const headers=(ws.getRow(1).values||[]).slice(1).map(v=>String(v??'').trim()); for(let r=2;r<=ws.rowCount;r++){const row={};let has=false;headers.forEach((h,i)=>{const cell=ws.getRow(r).getCell(i+1);const value=cell.text??'';row[h]=value;if(String(value).trim())has=true});if(has)raw.push(row);} } else throw new Error('Faqat .xlsx yoki .csv fayl qabul qilinadi'); const rows=raw.map(normalizeRow); if(!rows.length) throw new Error('Faylda ma’lumot qatori topilmadi'); return rows; };
const resolveStructure = async (rawId,type) => { const value=String(rawId||'').trim(); if(!value) return null; const or=[{externalId:value},{code:value}]; if(mongoose.isValidObjectId(value)) or.unshift({_id:value}); return Structure.findOne({type,active:true,$or:or}).lean(); };
const resolveUserGroupId = async user => {
  const raw=user?.groupId;
  if(raw?._id&&mongoose.isValidObjectId(raw._id))return raw._id;
  if(raw&&mongoose.isValidObjectId(raw))return raw;
  if(raw){const g=await resolveStructure(raw?.externalId||raw?.code||raw,'group');if(g)return g._id}
  if(user?.group){const g=await resolveStructure(user.group,'group');if(g)return g._id}
  return null;
};
const normalizeWeekday = value => { if(Number(value)>=1&&Number(value)<=7) return Number(value); const v=normKey(value); return ({dushanba:1,monday:1,mon:1,seshanba:2,tuesday:2,tue:2,chorshanba:3,wednesday:3,wed:3,payshanba:4,thursday:4,thu:4,juma:5,friday:5,fri:5,shanba:6,saturday:6,sat:6,yakshanba:7,sunday:7,sun:7})[v]||0; };
const normalizeKind = value => ({lecture:'lecture',maruza:'lecture',practice:'practice',amaliyot:'practice',seminar:'seminar',exam:'exam',imtihon:'exam',final_exam:'final_exam',yakuniy_nazorat:'final_exam'})[normKey(value)]||'lecture';
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
    if(query.groupId){group=await resolveStructure(query.groupId,'group');if(!group)throw new Error('Tanlangan guruh topilmadi')}
    if(query.departmentId){department=await resolveStructure(query.departmentId,'department');if(!department)throw new Error('Tanlangan kafedra topilmadi')}
    if(query.facultyId){faculty=await resolveStructure(query.facultyId,'faculty');if(!faculty)throw new Error('Tanlangan fakultet topilmadi')}
  }
  if(forced&&!group&&!department&&!faculty)throw new Error('Profilingizga boshqaruv doirasi biriktirilmagan');
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

const weekdayOccurrences = (days,weekday) => {
  let n=0;
  for(let ago=0;ago<days;ago++){const mid=new Date(localDayBounds(ago).start.getTime()+12*60*60*1000);if(localWeekday(mid)===Number(weekday))n++}
  return n;
};
const buildGroupPerformance = async (scope,days=7) => {
  const safeDays=Math.max(7,Math.min(30,Number(days)||7)),hasOrgScope=Boolean(scope.group||scope.department||scope.faculty),groups=hasOrgScope?(scope.groups||[]):(scope.groups?.length?scope.groups:await Structure.find({type:'group',active:true}).lean()),groupIds=groups.map(x=>x._id);
  if(!groupIds.length)return [];
  const bounds=rangeBounds(safeDays);
  const [studentCounts,schedules]=await Promise.all([
    User.aggregate([{$match:{active:true,role:'student',groupId:{$in:groupIds}}},{$group:{_id:'$groupId',value:{$sum:1}}}]),
    Schedule.find({groupId:{$in:groupIds}}).select('_id groupId weekday').lean()
  ]);
  const studentMap=Object.fromEntries(studentCounts.map(x=>[String(x._id),x.value])),scheduleById=Object.fromEntries(schedules.map(x=>[String(x._id),x]));
  const attendance=await Attendance.find({createdAt:{$gte:bounds.start,$lt:bounds.end},lessonId:{$in:schedules.map(x=>String(x._id))}}).select('lessonId userId dateKey status').lean();
  const attended={},late={},seen=new Set();
  for(const row of attendance){
    const schedule=scheduleById[row.lessonId];if(!schedule)continue;
    const key=row.lessonId+':'+String(row.userId)+':'+(row.dateKey||'');if(seen.has(key))continue;seen.add(key);
    const gid=String(schedule.groupId);if(['present','late'].includes(row.status))attended[gid]=(attended[gid]||0)+1;if(row.status==='late')late[gid]=(late[gid]||0)+1;
  }
  const scheduleGroups={};for(const x of schedules)(scheduleGroups[String(x.groupId)]??=[]).push(x);
  return groups.map(g=>{
    const gid=String(g._id),students=studentMap[gid]||0,list=scheduleGroups[gid]||[],occurrences=list.reduce((sum,x)=>sum+weekdayOccurrences(safeDays,x.weekday),0),expected=students*occurrences,present=attended[gid]||0;
    return {groupId:g.externalId||g.code||gid,name:g.name,students,weeklyLessons:list.length,expected,present,late:late[gid]||0,rate:expected?Math.min(100,Math.round(present/expected*100)):0};
  }).sort((a,b)=>a.rate-b.rate||b.students-a.students||a.name.localeCompare(b.name));
};



const sign = user => jwt.sign({ id: user.id||String(user._id), role: user.role, sv:Number(user.sessionVersion)||0 }, JWT_SECRET, { expiresIn: '12h', issuer: 'masofaviy2' });
const demoAdmin={_id:'demo',id:'demo',login:(process.env.ADMIN_LOGIN||'admin').toLowerCase(),fullName:'Bosh administrator',role:'superadmin',permissions:['*'],deniedPermissions:[],active:true,mustChangePassword:true,sessionVersion:0,totpEnabled:false};
const auth = async (req, res, next) => { try {
  const bearer=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
  const cookie=readCookie(req.headers.cookie,sessionCookie),token=bearer||cookie;
  const data=jwt.verify(token, JWT_SECRET);
  if(cookie&&!bearer&&!['GET','HEAD','OPTIONS'].includes(req.method)){
    const expected=csrfFor(cookie),actual=String(req.headers['x-csrf-token']||'');
    if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(403).json({message:'So‘rov himoya tekshiruvidan o‘tmadi'});
  }
  req.user=data.id==='demo'?demoAdmin:await User.findById(data.id).lean();if(!req.user?.active)throw new Error();if(data.id!=='demo'&&Number(data.sv||0)!==Number(req.user.sessionVersion||0))throw new Error();next();
}catch{res.status(401).json({ message: 'Xavfsizlik uchun tizimga qayta kiring.' });} };
const can = permission => (req, res, next) => { const base = permissionsByRole[req.user.role] || []; const allowed = (base.includes('*') || base.includes(permission) || req.user.permissions?.includes(permission)) && !req.user.deniedPermissions?.includes(permission); return allowed ? next() : res.status(403).json({ message: 'Bu amal uchun ruxsat yo‘q' }); };
const audit = (req, action, entity, entityId, meta={}) => Audit.create({ actorId: mongoose.isValidObjectId(req.user?._id) ? req.user._id : undefined, actorLogin:req.user?.login, actorName:req.user?.fullName, action, entity, entityId, ip: req.ip, meta }).catch(()=>{});
app.use('/api',async(req,res,next)=>{
  if(req.path==='/health'||req.path==='/branding'||req.path.startsWith('/auth/')||req.path.startsWith('/admin/institution-settings')||req.path.startsWith('/admin/instance-overview'))return next();
  try{
    const row=await getInstanceSettings(),mods=normalizedModules(row.modules||DEFAULT_BRANDING.modules);
    const found=modulePathMap.find(([,rx])=>rx.test(req.originalUrl||req.url||''));
    if(found&&!mods[found[0]])return res.status(403).json({message:'Bu modul administrator tomonidan o‘chirilgan',module:found[0]});
  }catch{}
  next();
});
installLms(app,{mongoose,User,Structure,Schedule,Attendance,auth,audit,hasPermission,resolveUserGroupId});
installCompliance(app,{mongoose,User,auth,audit});

app.get('/api/health', (_req,res)=>res.json({ ok:true, service:'HALLAYM EDU', time:new Date().toISOString() }));
app.get('/api/branding', async(_req,res)=>{
  try{res.json(await getBranding())}catch{res.json({...DEFAULT_BRANDING})}
});
app.get('/api/manifest.webmanifest',async(_req,res)=>{
  const b=await getBranding().catch(()=>({...DEFAULT_BRANDING}));
  res.type('application/manifest+json').set('Cache-Control','no-cache').send(JSON.stringify({
    name:(b.productName||'HALLAYM EDU')+' · '+(b.shortName||'OTM'),
    short_name:(b.productName||'HALLAYM EDU').slice(0,28),
    start_url:'/',
    display:'standalone',
    background_color:'#071a38',
    theme_color:b.primaryColor||'#0b4fd8',
    lang:'uz',
    icons:[{src:b.appIconUrl||'/api/brand-icon.svg',sizes:'any',type:b.appIconUrl?'image/png':'image/svg+xml',purpose:'any maskable'}]
  }));
});
app.get('/api/brand-icon.svg',async(_req,res)=>{
  const b=await getBranding().catch(()=>({...DEFAULT_BRANDING})),p=brandingColor(b.primaryColor,'#0b4fd8'),a=brandingColor(b.accentColor,'#19b5fe');
  const short=String(b.shortName||'OTM').replace(/[<>&"']/g,'').slice(0,12);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p}"/><stop offset="1" stop-color="#061b45"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${a}"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><path d="M86 176 256 92l170 84-170 83L86 176Z" fill="#fff"/><path d="M137 215v92c70 49 168 49 238 0v-92l-119 58-119-58Z" fill="url(#a)"/><circle cx="256" cy="337" r="42" fill="#fff" opacity=".14"/><path d="m243 316 42 24-42 24v-48Z" fill="#fff"/><text x="256" y="432" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="42" fill="#fff">${short}</text></svg>`;
  res.type('image/svg+xml').set('Cache-Control','no-cache').send(svg);
});
app.patch('/api/admin/institution-settings', auth, async(req,res)=>{
  try{
    if(!['superadmin','admin'].includes(req.user.role))return res.status(403).json({message:'Faqat administrator platforma sozlamalarini o‘zgartiradi'});
    if(mongoose.connection.readyState!==1)return res.status(503).json({message:'Ma’lumotlar bazasi ulanmagan'});
    const current=(await InstitutionSettings.findOne({key:'primary'}).lean())||DEFAULT_BRANDING;
    const patch={
      institutionName:brandingText(req.body.institutionName,240,true),
      shortName:brandingText(req.body.shortName,60),
      website:brandingUrl(req.body.website),
      logoUrl:brandingUrl(req.body.logoUrl),
      appIconUrl:brandingUrl(req.body.appIconUrl),
      primaryColor:brandingColor(req.body.primaryColor,'#0b4fd8'),
      accentColor:brandingColor(req.body.accentColor,'#19b5fe'),
      landingTitle:brandingText(req.body.landingTitle,240),
      landingText:brandingText(req.body.landingText,1000),
      address:brandingText(req.body.address,500),
      phone:brandingText(req.body.phone,80),
      founded:brandingText(req.body.founded,120),
      legalBasis:brandingText(req.body.legalBasis,240),
      description:brandingText(req.body.description,2000),
      lmsUrl:brandingUrl(req.body.lmsUrl),
      repositoryUrl:brandingUrl(req.body.repositoryUrl),
      portfolioUrl:brandingUrl(req.body.portfolioUrl),
      admissionsUrl:brandingUrl(req.body.admissionsUrl),
      organizationType:['university','school','training_center'].includes(String(req.body.organizationType))?String(req.body.organizationType):(current.organizationType||'university'),
      tenantCode:brandingText(req.body.tenantCode??current.tenantCode,64).toUpperCase().replace(/[^A-Z0-9_-]/g,''),
      domain:brandingText(req.body.domain??current.domain,255),
      defaultLanguage:['uz','ru','en'].includes(String(req.body.defaultLanguage))?String(req.body.defaultLanguage):(current.defaultLanguage||'uz'),
      supportEmail:brandingText(req.body.supportEmail??current.supportEmail,240),
      supportPhone:brandingText(req.body.supportPhone??current.supportPhone,80),
      contractLabel:brandingText(req.body.contractLabel??current.contractLabel,160),
      licensePlan:['starter','standard','pro','enterprise'].includes(String(req.body.licensePlan))?String(req.body.licensePlan):(current.licensePlan||'standard'),
      licenseExpiresAt:req.body.licenseExpiresAt===undefined?(current.licenseExpiresAt||null):(req.body.licenseExpiresAt?new Date(req.body.licenseExpiresAt):null),
      maxUsers:intValue(req.body.maxUsers,10,1000000,current.maxUsers||5000),
      maxConcurrentRooms:intValue(req.body.maxConcurrentRooms,1,500,current.maxConcurrentRooms||6),
      maxRoomParticipants:intValue(req.body.maxRoomParticipants,2,500,current.maxRoomParticipants||120),
      modules:req.body.modules?normalizedModules(req.body.modules):normalizedModules(current.modules||MODULE_DEFAULTS)
    };
    const row=await InstitutionSettings.findOneAndUpdate({key:'primary'},{$set:patch,$setOnInsert:{key:'primary'}},{new:true,upsert:true,setDefaultsOnInsert:true});
    audit(req,'INSTITUTION_SETTINGS_UPDATE','InstitutionSettings',row.id,{institutionName:row.institutionName,shortName:row.shortName});
    res.json(brandingPublic(row.toObject()));
  }catch(e){res.status(400).json({message:e.message||'Sozlamalarni saqlab bo‘lmadi'})}
});
app.get('/api/admin/instance-overview',auth,async(req,res)=>{
  if(!['superadmin','admin','tech'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
  const row=await getInstanceSettings(),mods=normalizedModules(row.modules||DEFAULT_BRANDING.modules);
  const [users,faculties,departments,groups,teachers,students]=mongoose.connection.readyState===1?await Promise.all([
    User.countDocuments({active:true}),Structure.countDocuments({type:'faculty',active:true}),Structure.countDocuments({type:'department',active:true}),
    Structure.countDocuments({type:'group',active:true}),User.countDocuments({role:'teacher',active:true}),User.countDocuments({role:'student',active:true})
  ]):[0,0,0,0,0,0];
  const checks=[
    {key:'identity',label:'Tashkilot profili',ready:Boolean(row.institutionName&&row.shortName&&row.organizationType)},
    {key:'domain',label:'Domen',ready:Boolean(row.domain||row.website)},
    {key:'structure',label:'Tuzilma',ready:groups>0},
    {key:'teachers',label:'O‘qituvchilar',ready:teachers>0},
    {key:'students',label:'Talabalar',ready:students>0},
    {key:'media',label:'Media/TURN',ready:Boolean(SFU_BRIDGE_URLS.length&&TURN_URLS.length)},
    {key:'branding',label:'Branding',ready:Boolean(row.primaryColor&&row.accentColor)},
    {key:'license',label:'Shartnoma/litsenziya',ready:Boolean(row.contractLabel||row.licensePlan)}
  ];
  const ready=checks.filter(x=>x.ready).length;
  res.json({
    profile:{organizationType:row.organizationType||'university',tenantCode:row.tenantCode||'',domain:row.domain||'',defaultLanguage:row.defaultLanguage||'uz',licensePlan:row.licensePlan||'standard',licenseExpiresAt:row.licenseExpiresAt||null,contractLabel:row.contractLabel||''},
    limits:{maxUsers:row.maxUsers||5000,maxConcurrentRooms:row.maxConcurrentRooms||6,maxRoomParticipants:row.maxRoomParticipants||120},
    modules:mods,counts:{users,faculties,departments,groups,teachers,students},
    infrastructure:{sfuConfigured:Boolean(SFU_BRIDGE_URLS.length),turnConfigured:Boolean(TURN_URLS.length),database:mongoose.connection.readyState===1?'connected':'disconnected',node:process.version},
    readiness:{percent:Math.round(ready/checks.length*100),checks}
  });
});
app.get('/api/system/metrics', auth, async(req,res)=>{
  if(!['superadmin','admin','tech'].includes(req.user.role))return res.status(403).json({message:'Tizim metrikasi uchun ruxsat yo‘q'});
  const mem=process.memoryUsage();
  const activeLiveRooms=mongoose.connection.readyState===1?await LiveSession.countDocuments({status:'active',dateKey:localDateKey()}):0;res.json({database:mongoose.connection.readyState===1?'connected':'disconnected',uptimeSeconds:Math.round(process.uptime()),memory:{rssMB:Math.round(mem.rss/1024/1024),heapMB:Math.round(mem.heapUsed/1024/1024)},onlineUsers:onlineUsers.size,socketConnections:io.engine.clientsCount,activeLiveRooms,node:process.version,time:new Date().toISOString()});
});
app.get('/api/presentation/readiness', auth, async(req,res)=>{
  if(!['superadmin','admin','tech','rectorate'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
  if(mongoose.connection.readyState!==1)return res.status(503).json({message:'Ma’lumotlar bazasi ulanmagan'});
  const db=mongoose.connection.db;
  const [faculties,departments,distanceGroups,presentationTeachers,presentationStudents,sampleCourses,sampleSchedules,sampleCurricula,libraryItems,videos]=await Promise.all([
    db.collection('structures').countDocuments({type:'faculty',active:true}),
    db.collection('structures').countDocuments({type:'department',active:true}),
    db.collection('structures').countDocuments({type:'group',active:true,externalId:/^QDTU-MT-2026-/}),
    db.collection('users').countDocuments({active:true,externalId:/^PRES-T-/}),
    db.collection('users').countDocuments({active:true,externalId:/^PRES-S-/}),
    db.collection('courses').countDocuments({active:true,code:/^PRES-/}),
    db.collection('schedules').countDocuments({title:/^\[NAMUNA\]/}),
    db.collection('curriculumplans').countDocuments({active:true,programCode:/^PRES-/}),
    db.collection('libraryitems').countDocuments({published:true}),
    db.collection('videolessons').countDocuments({published:true})
  ]);
  const checks=[
    ['Fakultetlar',faculties,7],['Masofaviy guruhlar',distanceGroups,12],['Namunaviy fanlar',sampleCourses,48],
    ['Haftalik darslar',sampleSchedules,48],['O‘quv rejalar',sampleCurricula,12],['Kutubxona',libraryItems,4]
  ];
  const percent=Math.round(checks.reduce((sum,[,value,target])=>sum+Math.min(1,target?value/target:1),0)/checks.length*100);
  res.json({generatedAt:new Date(),percent,official:{faculties,departments,distanceGroups},presentation:{teachers:presentationTeachers,students:presentationStudents,courses:sampleCourses,schedules:sampleSchedules,curricula:sampleCurricula,libraryItems,videos},checks:checks.map(([label,value,target])=>({label,value,target,ready:value>=target}))});
});

app.get('/api/evaluation/readiness',auth,async(req,res)=>{
  if(!['superadmin','admin','tech','rectorate'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
  const Course=mongoose.models.Course,Quiz=mongoose.models.Quiz,Assignment=mongoose.models.Assignment,StudyPlan=mongoose.models.StudyPlan;
  const [courses,proctorQuizzes,allQuizzes,assignments,structuredVideos,checkpointVideos,schedules,studyPlans]=await Promise.all([
    Course?Course.countDocuments({active:true}):0,
    Quiz?Quiz.countDocuments({published:true,proctorRequired:true}):0,
    Quiz?Quiz.countDocuments({published:true}):0,
    Assignment?Assignment.countDocuments({published:true}):0,
    VideoLesson.countDocuments({published:true,courseId:{$ne:null},topicTitle:{$nin:['',null]}}),
    VideoLesson.countDocuments({published:true,checkpointQuizId:{$ne:null}}),
    Schedule.countDocuments({liveEnabled:{$ne:false},kind:{$ne:'final_exam'}}),
    StudyPlan?StudyPlan.countDocuments():0
  ]);
  const settings=await InstitutionSettings.findOne({key:'primary'}).lean();
  const registryNo=String(process.env.DIGITAL_GOV_REGISTRY_NUMBER||'').trim(),cyberNo=String(process.env.CYBERSECURITY_CONCLUSION_NUMBER||'').trim();
  const criteria=[
    {no:2,title:'Avtoproktoring tizimi',ready:proctorQuizzes>0,evidence:proctorQuizzes+' ta proktoringli test · fullscreen/page/face nazorati'},
    {no:3,title:'Raqamli o‘qitish (virtual classroom)',ready:Boolean(SFU_BRIDGE_URLS.length&&TURN_URLS.length),evidence:'WebRTC/SFU + TURN · adaptiv 1080p teacher/screen'},
    {no:4,title:'Umumiy, guruh va individual ta’lim',ready:courses>0&&schedules>0&&studyPlans>0,evidence:courses+' fan · '+schedules+' live jadval · '+studyPlans+' individual reja'},
    {no:7,title:'Tashkiliy-me’yoriy materiallar',ready:Boolean(settings?.website),evidence:settings?.website||'Rasmiy sayt kiritilmagan'},
    {no:8,title:'Kurslarni boshqarish',ready:courses>0&&structuredVideos>0,evidence:courses+' fan · '+structuredVideos+' strukturali videomavzu · '+checkpointVideos+' oraliq test'},
    {no:9,title:'O‘qitishni boshqarish',ready:schedules>0&&assignments>0,evidence:schedules+' jadval · '+assignments+' topshiriq'},
    {no:10,title:'Statistika komponenti',ready:true,evidence:'Davomat, live, user, kurs va audit analitikasi'},
    {no:11,title:'Talabalar bilimini nazorat qilish',ready:allQuizzes>0||assignments>0,evidence:allQuizzes+' test · '+assignments+' topshiriq'},
    {no:12,title:'Raqamli hukumat yagona reyestri',ready:Boolean(registryNo),external:true,evidence:registryNo?('Reyestr: '+registryNo):'Tashqi rasmiy ro‘yxatdan o‘tkazish talab qilinadi'},
    {no:13,title:'Kiberxavfsizlik ekspert xulosasi',ready:Boolean(cyberNo),external:true,evidence:cyberNo?('Xulosa: '+cyberNo):'Vakolatli tashkilotning ijobiy ekspert xulosasi talab qilinadi'}
  ];
  const internal=criteria.filter(x=>!x.external),percent=Math.round(internal.filter(x=>x.ready).length/Math.max(1,internal.length)*100);
  res.json({generatedAt:new Date(),percent,criteria});
});

app.post('/api/auth/login', async (req,res) => {
  const login=String(req.body.login||'').toLowerCase().trim(),password=String(req.body.password||''),key=loginAttemptKey(req,login);
  if(loginBlocked(key))return res.status(429).json({message:'Juda ko‘p noto‘g‘ri urinish. Birozdan keyin qayta urinib ko‘ring.'});
  if(mongoose.connection.readyState!==1){
    if(process.env.NODE_ENV==='production')return res.status(503).json({message:'Ma’lumotlar bazasi hozir ishlamayapti'});
    if(login===demoAdmin.login&&password===(process.env.ADMIN_PASSWORD||'ChangeMe123!')){loginAttempts.delete(key);setSession(res,demoAdmin);return res.json({user:demoAdmin,demo:true})}
    noteLoginFailure(key);return res.status(401).json({message:'Login yoki parol noto‘g‘ri. Ma’lumotlar bazasi ulanmaguncha administrator akkauntidan foydalaning.'});
  }
  const user=await User.findOne({login}).select('+totpSecretEncrypted +totpRecoveryHashes');
  if(!user||!user.active||!(await bcrypt.compare(password,user.passwordHash))){
    noteLoginFailure(key);await Audit.create({actorLogin:login,action:'LOGIN_FAILED',entity:'Auth',ip:req.ip,meta:{attempts:loginAttempts.get(key)?.count||1}}).catch(()=>{});
    return res.status(401).json({message:'Login yoki parol noto‘g‘ri'});
  }
  if(REQUIRE_IN_PERSON_IDENTITY&&user.role!=='student'&&IN_PERSON_IDENTITY_ROLES.has(user.role)&&String(user.citizenshipCountry||'UZ').toUpperCase()==='UZ'&&!user.identityVerifiedAt){await Audit.create({actorId:user._id,actorLogin:user.login,actorName:user.fullName,action:'LOGIN_IDENTITY_NOT_VERIFIED',entity:'Auth',entityId:String(user._id),ip:req.ip}).catch(()=>{});return res.status(403).json({message:'Akkaunt OTMda shaxsan identifikatsiyadan o‘tmagan. Mas’ul xodimga murojaat qiling.'})}
  if(user.totpEnabled){
    const otp=String(req.body.otp||'').trim();
    if(!otp)return res.status(202).json({twoFactorRequired:true,message:'Authenticator kodi yoki recovery kodini kiriting'});
    let secondFactor=false,recoveryUsed=false;
    try{secondFactor=verifyTotp(decryptSecret(user.totpSecretEncrypted,TOTP_ENCRYPTION_KEY),otp)}catch{secondFactor=false}
    if(!secondFactor){const recovery=consumeRecoveryCode(user.totpRecoveryHashes||[],otp);if(recovery.ok){secondFactor=true;recoveryUsed=true;user.totpRecoveryHashes=recovery.hashes}}
    if(!secondFactor){noteLoginFailure(key);await Audit.create({actorId:user._id,actorLogin:user.login,actorName:user.fullName,action:'TWO_FACTOR_FAILED',entity:'Auth',entityId:String(user._id),ip:req.ip}).catch(()=>{});return res.status(401).json({message:'2 bosqichli tasdiqlash kodi noto‘g‘ri'})}
    if(recoveryUsed)await Audit.create({actorId:user._id,actorLogin:user.login,actorName:user.fullName,action:'TWO_FACTOR_RECOVERY_USE',entity:'Auth',entityId:String(user._id),ip:req.ip}).catch(()=>{});
  }
  loginAttempts.delete(key);user.lastLoginAt=new Date();user.lastSeenAt=new Date();user.lastLoginIp=req.ip;user.loginCount=(user.loginCount||0)+1;await user.save();
  await audit({user,ip:req.ip},'LOGIN','User',user.id,{twoFactor:Boolean(user.totpEnabled)});setSession(res,user);res.json({user:sanitizeUser(user),faceDemoRequired:user.role!=='student'&&String(process.env.FACE_ID_MODE||'demo').toLowerCase()==='demo'});
});
app.post('/api/auth/logout',(req,res)=>{clearSession(res);res.json({ok:true})});
app.post('/api/auth/2fa/setup',auth,async(req,res)=>{
  if(req.user._id==='demo')return res.status(400).json({message:'Demo akkauntda 2FA sozlanmaydi'});
  const currentPassword=String(req.body.currentPassword||''),user=await User.findById(req.user._id).select('+totpPendingSecretEncrypted');
  if(!user||!(await bcrypt.compare(currentPassword,user.passwordHash)))return res.status(400).json({message:'Joriy parol noto‘g‘ri'});
  const secret=generateTotpSecret();user.totpPendingSecretEncrypted=encryptSecret(secret,TOTP_ENCRYPTION_KEY);await user.save();
  audit(req,'TWO_FACTOR_SETUP','User',user.id);res.json({secret,otpauthUri:otpauthUri({secret,account:user.login,issuer:'HALLAYM EDU'}),message:'Authenticator ilovasiga secretni kiriting va 6 xonali kod bilan faollashtiring'});
});
app.post('/api/auth/2fa/enable',auth,async(req,res)=>{
  if(req.user._id==='demo')return res.status(400).json({message:'Demo akkauntda 2FA sozlanmaydi'});
  const user=await User.findById(req.user._id).select('+totpPendingSecretEncrypted +totpSecretEncrypted +totpRecoveryHashes');if(!user?.totpPendingSecretEncrypted)return res.status(409).json({message:'Avval 2FA sozlashni boshlang'});
  let secret;try{secret=decryptSecret(user.totpPendingSecretEncrypted,TOTP_ENCRYPTION_KEY)}catch{return res.status(409).json({message:'2FA sozlamasi yaroqsiz, qayta boshlang'})}
  if(!verifyTotp(secret,req.body.code))return res.status(400).json({message:'Authenticator kodi noto‘g‘ri'});
  const recoveryCodes=generateRecoveryCodes(8);user.totpSecretEncrypted=user.totpPendingSecretEncrypted;user.totpPendingSecretEncrypted=undefined;user.totpRecoveryHashes=recoveryCodes.map(hashRecoveryCode);user.totpEnabled=true;user.sessionVersion=(user.sessionVersion||0)+1;await user.save();
  setSession(res,user);audit(req,'TWO_FACTOR_ENABLE','User',user.id,{recoveryCount:recoveryCodes.length});res.json({ok:true,recoveryCodes,message:'Recovery kodlarini xavfsiz joyda saqlang. Ular qayta ko‘rsatilmaydi.'});
});
app.post('/api/auth/2fa/disable',auth,async(req,res)=>{
  if(req.user._id==='demo')return res.status(400).json({message:'Demo akkauntda 2FA sozlanmaydi'});
  const currentPassword=String(req.body.currentPassword||''),code=String(req.body.code||''),user=await User.findById(req.user._id).select('+totpSecretEncrypted +totpRecoveryHashes');
  if(!user||!(await bcrypt.compare(currentPassword,user.passwordHash)))return res.status(400).json({message:'Joriy parol noto‘g‘ri'});if(!user.totpEnabled)return res.status(409).json({message:'2FA yoqilmagan'});
  let ok=false;try{ok=verifyTotp(decryptSecret(user.totpSecretEncrypted,TOTP_ENCRYPTION_KEY),code)}catch{}
  if(!ok){const recovery=consumeRecoveryCode(user.totpRecoveryHashes||[],code);ok=recovery.ok}
  if(!ok)return res.status(400).json({message:'2FA kodi noto‘g‘ri'});
  user.totpEnabled=false;user.totpSecretEncrypted=undefined;user.totpPendingSecretEncrypted=undefined;user.totpRecoveryHashes=[];user.sessionVersion=(user.sessionVersion||0)+1;await user.save();setSession(res,user);audit(req,'TWO_FACTOR_DISABLE','User',user.id);res.json({ok:true});
});
app.post('/api/auth/revoke-sessions',auth,async(req,res)=>{
  if(req.user._id==='demo')return res.status(400).json({message:'Demo akkaunt sessiyasi boshqarilmaydi'});const user=await User.findById(req.user._id);if(!user)return res.status(404).json({message:'Foydalanuvchi topilmadi'});user.sessionVersion=(user.sessionVersion||0)+1;await user.save();setSession(res,user);audit(req,'SESSIONS_REVOKE','User',user.id,{keptCurrent:true});res.json({ok:true,message:'Boshqa qurilmalardagi sessiyalar bekor qilindi'});const timer=setTimeout(()=>disconnectUserSockets(user._id),150);timer.unref?.();
});

app.get('/api/me', auth, async (req,res)=>{ let current=sanitizeUser(req.user); if(req.user._id!=='demo'&&mongoose.connection.readyState===1) current=sanitizeUser(await User.findById(req.user._id).populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').lean()); res.json({user:current,effectivePermissions:rolePermissions(req.user)}); });
app.get('/api/dashboard', auth, async (req,res)=> {
  if(mongoose.connection.readyState!==1)return res.json({role:req.user.role,stats:[{label:'Foydalanuvchi',value:1}],today:[],online:io.engine.clientsCount,demo:true});
  const day=localWeekday(),todayBounds=localDayBounds(0);
  if(req.user.role==='teacher'){
    const rows=await scheduleQuery({teacherId:req.user._id}).lean(),today=rows.filter(x=>x.weekday===day),ids=today.map(x=>String(x._id));
    let present=0,late=0;if(ids.length){const a=await Attendance.find({createdAt:{$gte:todayBounds.start,$lt:todayBounds.end},lessonId:{$in:ids}}).populate('userId','role').lean();const students=a.filter(x=>x.userId?.role==='student');present=students.filter(x=>['present','late'].includes(x.status)).length;late=students.filter(x=>x.status==='late').length}
    return res.json({role:req.user.role,stats:[{label:'Mening darslarim',value:rows.length},{label:'Bugungi dars',value:today.length},{label:'Bugun qatnashdi',value:present},{label:'Kechikdi',value:late},{label:'Guruhlar',value:new Set(rows.map(x=>String(x.groupId?._id||x.groupId))).size}],today});
  }
  if(req.user.role==='student'){
    const gid=await resolveUserGroupId(req.user),rows=gid?await scheduleQuery({groupId:gid}).lean():[],today=rows.filter(x=>x.weekday===day),days=30,bounds=rangeBounds(days),lessonIds=rows.map(x=>String(x._id)),expected=rows.reduce((sum,x)=>sum+weekdayOccurrences(days,x.weekday),0);
    const attendance=lessonIds.length?await Attendance.find({userId:req.user._id,createdAt:{$gte:bounds.start,$lt:bounds.end},lessonId:{$in:lessonIds}}).lean():[],seen=new Set(),unique=attendance.filter(x=>{const k=x.lessonId+':'+(x.dateKey||'');if(seen.has(k))return false;seen.add(k);return true}),present=unique.filter(x=>['present','late'].includes(x.status)).length,rate=expected?Math.min(100,Math.round(present/expected*100)):0,late=unique.filter(x=>x.status==='late').length;
    return res.json({role:req.user.role,stats:[{label:'Haftalik dars',value:rows.length},{label:'Bugungi dars',value:today.length},{label:'30 kun davomat',value:rate+'%'},{label:'Kechikish',value:late},{label:'Fanlar',value:new Set(rows.map(x=>x.subject||x.title)).size}],today});
  }
  const scope=await resolveScope(req.user,{}),userActive=scopedUserFilter(scope,{active:true}),schedules=await scheduleQuery(scope.scheduleScope).lean(),today=schedules.filter(x=>x.weekday===day).slice(0,10),usersByRole=await User.aggregate([{$match:userActive},{$group:{_id:'$role',value:{$sum:1}}}]),roleMap=Object.fromEntries(usersByRole.map(x=>[x._id,x.value])),online=await scopedOnlineCount(scope);
  res.json({role:req.user.role,scope:scope.label,stats:[{label:'Talaba',value:roleMap.student||0},{label:'O‘qituvchi',value:roleMap.teacher||0},{label:'Guruh',value:(scope.group||scope.department||scope.faculty)?scope.groupIds.length:await Structure.countDocuments({type:'group',active:true})},{label:'Dars',value:schedules.length},{label:'Onlayn',value:online}],today,online});
});

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
    Structure.countDocuments((scope.group||scope.department||scope.faculty)?{type:'group',active:true,$and:[{_id:{$in:scope.groupIds}},{_id:{$nin:scheduledGroupIds}}]}:{type:'group',active:true,_id:{$nin:scheduledGroupIds}}).catch(()=>0),
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

app.get('/api/analytics/groups', auth, can('analytics.view'), async(req,res)=>{try{const scope=await resolveScope(req.user,req.query);res.json({scope:{label:scope.label},rows:await buildGroupPerformance(scope,req.query.days)})}catch(err){res.status(400).json({message:err.message})}});
app.get('/api/analytics/group/:groupId/students', auth, can('analytics.view'), async(req,res)=>{try{
  const group=await resolveStructure(req.params.groupId,'group');if(!group)return res.status(404).json({message:'Guruh topilmadi'});
  const scope=await resolveScope(req.user,req.query),allowed=scope.groupIds.some(id=>String(id)===String(group._id));if(!allowed)return res.status(403).json({message:'Bu guruh statistikasi uchun ruxsat yo‘q'});
  const days=Math.max(7,Math.min(30,Number(req.query.days)||7)),bounds=rangeBounds(days),schedules=await Schedule.find({groupId:group._id}).select('_id weekday').lean(),lessonIds=schedules.map(x=>String(x._id)),expectedPerStudent=schedules.reduce((sum,x)=>sum+weekdayOccurrences(days,x.weekday),0);
  const [students,attendance]=await Promise.all([User.find({active:true,role:'student',groupId:group._id}).select('fullName login phone').sort({fullName:1}).lean(),Attendance.find({createdAt:{$gte:bounds.start,$lt:bounds.end},lessonId:{$in:lessonIds}}).select('lessonId userId dateKey status minutes').lean()]);
  const counters={},seen=new Set();for(const row of attendance){const key=row.lessonId+':'+String(row.userId)+':'+(row.dateKey||'');if(seen.has(key))continue;seen.add(key);const id=String(row.userId);const c=counters[id]||(counters[id]={present:0,late:0,minutes:0});if(['present','late'].includes(row.status))c.present++;if(row.status==='late')c.late++;c.minutes+=Number(row.minutes||0)}
  res.json({group:{id:group.externalId||group.code||String(group._id),name:group.name},days,expectedPerStudent,students:students.map(st=>{const c=counters[String(st._id)]||{present:0,late:0,minutes:0};return {_id:st._id,fullName:st.fullName,login:st.login,phone:st.phone,present:c.present,late:c.late,minutes:c.minutes,expected:expectedPerStudent,rate:expectedPerStudent?Math.min(100,Math.round(c.present/expectedPerStudent*100)):0}})});
}catch(err){res.status(400).json({message:err.message})}});

app.get('/api/profile', auth, async(req,res)=>{ if(req.user._id==='demo')return res.json({user:sanitizeUser(req.user)}); const current=await User.findById(req.user._id).select('-passwordHash').populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').lean(); res.json({user:current}); });
app.post('/api/profile/avatar', auth, async(req,res)=>{
  if(req.user._id==='demo')return res.status(400).json({message:'Demo administrator profili o‘zgartirilmaydi'});
  try{
    const dataUrl=String(req.body.dataUrl||'');
    const match=dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if(!match)return res.status(400).json({message:'Faqat JPG, PNG yoki WEBP rasm yuklang'});
    const buf=Buffer.from(match[2],'base64');
    if(!buf.length||buf.length>3*1024*1024)return res.status(400).json({message:'Rasm hajmi 3 MB dan oshmasin'});
    const ext=match[1]==='jpeg'?'jpg':match[1];
    const dir=path.join(process.cwd(),'public','uploads','avatars');
    fs.mkdirSync(dir,{recursive:true});
    const filename=String(req.user._id)+'-'+Date.now()+'.'+ext;
    fs.writeFileSync(path.join(dir,filename),buf,{mode:0o600});
    const avatarUrl='/uploads/avatars/'+filename;
    const u=await User.findByIdAndUpdate(req.user._id,{$set:{avatarUrl}},{new:true}).select('-passwordHash');
    audit(req,'PROFILE_AVATAR_UPLOAD','User',req.user._id,{avatarUrl});
    res.json({ok:true,avatarUrl,user:u});
  }catch(err){res.status(400).json({message:'Rasmni yuklashda xatolik'})}
});

app.patch('/api/profile', auth, async(req,res)=>{ if(req.user._id==='demo')return res.status(400).json({message:'Demo administrator profili o‘zgartirilmaydi'}); const allowed=['fullName','email','phone','avatarUrl','bio','direction']; const patch=Object.fromEntries(allowed.filter(k=>req.body[k]!==undefined).map(k=>[k,String(req.body[k]??'').trim()])); const update={$set:patch}; if(req.body.courseYear!==undefined){const cy=Number(req.body.courseYear);if(cy>=1&&cy<=6)patch.courseYear=cy;else update.$unset={courseYear:1}} const u=await User.findByIdAndUpdate(req.user._id,update,{new:true}).select('-passwordHash'); audit(req,'PROFILE_UPDATE','User',req.user._id,patch); res.json({user:u}); });
app.patch('/api/profile/password', auth, async(req,res)=>{ if(req.user._id==='demo')return res.status(400).json({message:'Demo administrator paroli Render sozlamalaridan boshqariladi'}); const currentPassword=String(req.body.currentPassword||''),newPassword=String(req.body.newPassword||''); if(newPassword.length<8)return res.status(400).json({message:'Yangi parol kamida 8 ta belgidan iborat bo‘lsin'}); const u=await User.findById(req.user._id); if(!u||!(await bcrypt.compare(currentPassword,u.passwordHash)))return res.status(400).json({message:'Joriy parol noto‘g‘ri'}); u.passwordHash=await bcrypt.hash(newPassword,11);u.mustChangePassword=false;u.sessionVersion=(u.sessionVersion||0)+1;await u.save();setSession(res,u);audit(req,'PASSWORD_CHANGE','User',u.id,{sessionsRevoked:true});res.json({ok:true});const timer=setTimeout(()=>disconnectUserSockets(u._id),150);timer.unref?.(); });

app.get('/api/structure', auth, async(req,res)=>{
  if(mongoose.connection.readyState!==1)return res.json([]);
  const type=req.query.type;
  if(GLOBAL_SCOPE_ROLES.has(req.user.role)||['teacher','student'].includes(req.user.role)){
    return res.json(await Structure.find(type?{type}:{ }).sort({type:1,name:1}).lean());
  }
  if(['dean','department','tutor'].includes(req.user.role)){
    const scope=await resolveScope(req.user,{});
    let ids=[...scope.groupIds,...scope.departmentIds];if(scope.department?._id)ids.push(scope.department._id);if(scope.faculty?._id)ids.push(scope.faculty._id);ids=[...new Set(ids.map(String))].filter(mongoose.isValidObjectId).map(x=>new mongoose.Types.ObjectId(x));
    const filter={_id:{$in:ids}};if(type)filter.type=type;
    return res.json(await Structure.find(filter).sort({type:1,name:1}).lean());
  }
  res.json([]);
});
app.post('/api/structure', auth, can('structure.manage'), async(req,res)=>{ const body={...req.body,externalId:String(req.body.externalId||req.body.code||'').trim()||undefined}; if(body.type==='group'&&!body.externalId)return res.status(400).json({message:'Guruh uchun ID kiriting'}); if(body.externalId&&await Structure.exists({type:body.type,externalId:body.externalId}))return res.status(409).json({message:'Bu ID allaqachon mavjud'}); const item=await Structure.create(body); audit(req,'CREATE','Structure',item.id,{type:item.type,externalId:item.externalId}); res.status(201).json(item); });
app.delete('/api/structure/:id', auth, can('structure.manage'), async(req,res)=>{ const children=await Structure.countDocuments({parentId:req.params.id,active:true}); if(children) return res.status(409).json({message:'Avval ichki bo‘lim yoki guruhlarni o‘chiring'}); await Structure.findByIdAndUpdate(req.params.id,{active:false}); audit(req,'ARCHIVE','Structure',req.params.id); res.json({ok:true}); });
app.get('/api/users', auth, can('users.manage'), async(req,res)=>{if(mongoose.connection.readyState!==1)return res.json([demoAdmin]);const filter={};if(req.query.role)filter.role=req.query.role;if(req.query.active==='true')filter.active=true;if(req.query.active==='false')filter.active=false;if(req.query.q){const q=escapeRegex(String(req.query.q).slice(0,80));filter.$or=[{fullName:{$regex:q,$options:'i'}},{login:{$regex:q,$options:'i'}},{phone:{$regex:q,$options:'i'}}]}res.json(await User.find(filter).select('-passwordHash').populate('facultyId','name externalId').populate('departmentId','name externalId').populate('groupId','name externalId code').sort({active:-1,fullName:1}).limit(3000).lean())});
app.post('/api/users', auth, can('users.manage'), async(req,res)=>{
  const login=String(req.body.login||'').toLowerCase().trim(),fullName=String(req.body.fullName||'').trim(),externalId=String(req.body.externalId||'').trim()||undefined,role=String(req.body.role||'').trim();
  const citizenshipCountry=String(req.body.citizenshipCountry||'UZ').trim().toUpperCase();if(!/^[A-Z]{2}$/.test(citizenshipCountry))return res.status(400).json({message:'Fuqarolik davlat kodi ISO-2 ko‘rinishida bo‘lsin, masalan UZ'});
  if(!login||!fullName)return res.status(400).json({message:'F.I.Sh. va login majburiy'});
  if(!canAssignRole(req.user.role,role))return res.status(403).json({message:'Bu rolni yaratish uchun ruxsat yo‘q'});
  if(await User.exists({login}))return res.status(409).json({message:'Bu login allaqachon mavjud'});
  if(externalId&&await User.exists({externalId}))return res.status(409).json({message:'Bu tashqi ID allaqachon mavjud'});
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
  const courseYear=Number(req.body.courseYear)||undefined,direction=String(req.body.direction||'').trim();
  const user=await User.create({login,fullName,externalId,role,email:String(req.body.email||'').trim(),phone:String(req.body.phone||'').trim(),citizenshipCountry,direction,courseYear,facultyId:faculty?._id,faculty:faculty?(faculty.externalId||faculty.code||faculty.name):'',departmentId:department?._id,department:department?(department.externalId||department.code||department.name):'',groupId:group?._id,group:group?(group.externalId||group.code||group.name):'',passwordHash:await bcrypt.hash(password,11),mustChangePassword:true});
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
  if(req.body.externalId!==undefined){const externalId=String(req.body.externalId||'').trim()||undefined;if(externalId&&await User.exists({_id:{$ne:target._id},externalId}))return res.status(409).json({message:'Bu tashqi ID boshqa foydalanuvchiga biriktirilgan'});target.externalId=externalId}
  target.email=String(req.body.email??target.email??'').trim();
  target.phone=String(req.body.phone??target.phone??'').trim();
  if(req.body.citizenshipCountry!==undefined){const cc=String(req.body.citizenshipCountry||'').trim().toUpperCase();if(!/^[A-Z]{2}$/.test(cc))return res.status(400).json({message:'Fuqarolik kodi ISO-2 ko‘rinishida bo‘lsin'});target.citizenshipCountry=cc}
  target.direction=String(req.body.direction??target.direction??'').trim();
  if(req.body.courseYear!==undefined){const cy=Number(req.body.courseYear);target.courseYear=cy>=1&&cy<=6?cy:undefined}
  target.role=nextRole;
  target.facultyId=faculty?._id||undefined;target.faculty=faculty?(faculty.externalId||faculty.code||faculty.name):'';
  target.departmentId=department?._id||undefined;target.department=department?(department.externalId||department.code||department.name):'';
  target.groupId=group?._id||undefined;target.group=group?(group.externalId||group.code||group.name):'';
  await target.save();
  audit(req,'USER_UPDATE','User',target.id,{role:target.role,facultyId:target.faculty,departmentId:target.department,groupId:target.group});
  res.json({user:sanitizeUser(target)});
});

app.post('/api/users/test-students/reset',auth,can('users.manage'),async(req,res)=>{
  if(!['superadmin','admin','tech'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
  const password='student00';
  const groups=await Structure.find({type:'group',active:true,externalId:{$in:['QDTU-MT-2026-DI-01','QDTU-MT-2026-SI-01']}}).lean();
  if(groups.length!==2)return res.status(400).json({message:'DI va SI test guruhlari topilmadi'});
  const by=Object.fromEntries(groups.map(g=>[g.externalId,g]));
  const oldStudents=await User.find({role:'student'}).select('_id').lean();
  const oldIds=oldStudents.map(x=>x._id);
  for(const id of oldIds)disconnectUserSockets(id);
  if(oldIds.length)await Attendance.deleteMany({userId:{$in:oldIds}});
  await User.deleteMany({role:'student'});
  const first=['Azizbek','Diyorbek','Jasurbek','Sherzod','Bekzod','Sardor','Asadbek','Shoxrux','Umid','Akmal','Mohira','Madina','Nilufar','Shahnoza','Dilnoza','Malika','Sevara','Zarina','Gulnoza','Nodira'];
  const hash=await bcrypt.hash(password,11),created=[];
  for(let i=1;i<=40;i++){
    const isA=i<=20,g=isA?by['QDTU-MT-2026-DI-01']:by['QDTU-MT-2026-SI-01'],surname=isA?'Rahmonov':'Usmonov',firstName=first[(i-1)%20],seq=String(i).padStart(3,'0');
    const dep=g.parentId?await Structure.findById(g.parentId).lean():null,fac=dep?.parentId?await Structure.findById(dep.parentId).lean():null;
    const user=await User.create({login:'student'+seq,passwordHash:hash,fullName:firstName+' '+surname,externalId:'TEST-STUDENT-'+seq,role:'student',permissions:[],deniedPermissions:[],active:true,mustChangePassword:false,sessionVersion:0,totpEnabled:false,faculty:fac?.name||'',department:dep?.name||'',group:g.name,facultyId:fac?._id,departmentId:dep?._id,groupId:g._id,direction:String(g.name||'').replace(/\s+—\s+.*$/,''),courseYear:1});
    created.push({login:user.login,fullName:user.fullName,group:g.externalId});
  }
  audit(req,'TEST_STUDENTS_RESET','User','student',{deleted:oldIds.length,created:created.length,groups:['QDTU-MT-2026-DI-01','QDTU-MT-2026-SI-01']});
  res.json({ok:true,deleted:oldIds.length,created:created.length,password,students:created});
});

app.post('/api/users/bulk-import', auth, can('users.manage'), async(req,res)=>{ try{
  const rows=await parseFileRows(req.body),dryRun=req.body.dryRun!==false,prepared=[],errors=[],seen=new Set(),seenExternal=new Set();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],n=i+2;
    const fullName=String(pick(row,['full_name','fullname','fio','fish','f_i_sh','ism_familiya'])||'').trim();
    const login=String(pick(row,['login','username','user_login'])||'').toLowerCase().trim();
    const externalId=String(pick(row,['external_id','tashqi_id','hemis_id','student_id','employee_id'])||'').trim();
    const citizenshipCountry=String(pick(row,['citizenship_country','citizenship','fuqarolik','country_code'])||'UZ').trim().toUpperCase();
    const rv=normKey(pick(row,['role','rol']));
    const role=({talaba:'student',student:'student',oqituvchi:'teacher',teacher:'teacher',tyutor:'tutor',tutor:'tutor',kafedra:'department',department:'department',dekan:'dean',dean:'dean',rektorat:'rectorate',rectorate:'rectorate',texnik:'tech',tech:'tech',admin:'admin',superadmin:'superadmin'})[rv]||rv;
    const password=String(pick(row,['password','parol'])||'').trim()||crypto.randomBytes(5).toString('hex');
    const facultyRaw=String(pick(row,['faculty_id','fakultet_id','facultyid'])||'').trim();
    const departmentRaw=String(pick(row,['department_id','kafedra_id','departmentid'])||'').trim();
    const groupRaw=String(pick(row,['group_id','guruh_id','groupid'])||'').trim();
    if(!fullName){errors.push({row:n,message:'F.I.Sh. bo‘sh'});continue}
    if(!/^[A-Z]{2}$/.test(citizenshipCountry)){errors.push({row:n,message:'citizenship_country ISO-2 noto‘g‘ri: '+citizenshipCountry});continue}
    if(!login){errors.push({row:n,message:'login bo‘sh'});continue}
    if(!permissionsByRole[role]){errors.push({row:n,message:'rol noto‘g‘ri: '+(role||'-')});continue} 
    if(!canAssignRole(req.user.role,role)){errors.push({row:n,message:'Bu rolni yaratish uchun ruxsat yo‘q: '+role});continue}
    if(seen.has(login)||await User.exists({login})){errors.push({row:n,message:'login takrorlangan yoki tizimda mavjud: '+login});continue}
    seen.add(login);
    if(externalId){if(seenExternal.has(externalId)||await User.exists({externalId})){errors.push({row:n,message:'external_id takrorlangan yoki tizimda mavjud: '+externalId});continue}seenExternal.add(externalId)}
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
    prepared.push({row:n,fullName,login,externalId,citizenshipCountry,role,password,email:String(pick(row,['email','e_mail'])||'').trim(),phone:String(pick(row,['phone','telefon','tel'])||'').trim(),direction:String(pick(row,['direction','yonalish','yo_nalish'])||'').trim(),courseYear:Number(pick(row,['course_year','kurs','course'])||0)||undefined,faculty,department,group});
  }
  if(dryRun)return res.json({dryRun:true,total:rows.length,valid:prepared.length,invalid:errors.length,errors:errors.slice(0,100),preview:prepared.slice(0,20).map(x=>({row:x.row,fullName:x.fullName,login:x.login,external_id:x.externalId||'',role:x.role,faculty_id:x.faculty?.externalId||x.faculty?.code||'',department_id:x.department?.externalId||x.department?.code||'',group_id:x.group?.externalId||x.group?.code||''}))});
  const credentials=[],docs=[];
  for(let i=0;i<prepared.length;i+=24){
    const batch=prepared.slice(i,i+24),hashed=await Promise.all(batch.map(p=>bcrypt.hash(p.password,11)));
    batch.forEach((p,j)=>{docs.push({fullName:p.fullName,login:p.login,externalId:p.externalId||undefined,citizenshipCountry:p.citizenshipCountry,role:p.role,passwordHash:hashed[j],email:p.email,phone:p.phone,direction:p.direction,courseYear:p.courseYear,facultyId:p.faculty?._id,faculty:p.faculty?(p.faculty.externalId||p.faculty.code||p.faculty.name):'',departmentId:p.department?._id,department:p.department?(p.department.externalId||p.department.code||p.department.name):'',groupId:p.group?._id,group:p.group?(p.group.externalId||p.group.code||p.group.name):'',mustChangePassword:true});credentials.push({fullName:p.fullName,login:p.login,role:p.role,password:p.password,group_id:p.group?.externalId||p.group?.code||''})});
  }
  if(docs.length)await User.insertMany(docs,{ordered:false});
  audit(req,'BULK_IMPORT','User','bulk',{created:credentials.length,errors:errors.length});
  res.status(201).json({imported:credentials.length,skipped:errors.length,errors:errors.slice(0,100),credentials});
}catch(err){res.status(400).json({message:err.message})} });

app.patch('/api/users/:id/status', auth, can('users.control'), async(req,res)=>{const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(String(target._id)===String(req.user._id)&&req.body.active===false)return res.status(400).json({message:'O‘zingizni bloklay olmaysiz'});if(!canAssignRole(req.user.role,target.role))return res.status(403).json({message:'Bu akkaunt holatini o‘zgartirish uchun ruxsat yo‘q'});target.active=Boolean(req.body.active);target.statusNote=String(req.body.statusNote||'').trim();if(!target.active)target.sessionVersion=(target.sessionVersion||0)+1;await target.save();if(!target.active)disconnectUserSockets(target._id);audit(req,target.active?'UNBLOCK':'BLOCK','User',target.id,{note:target.statusNote,sessionsRevoked:!target.active});res.json({ok:true,active:target.active})});
app.post('/api/users/bulk-student-password',auth,can('users.control'),async(req,res)=>{
  const password=String(req.body.password||'').trim();
  if(password.length<8)return res.status(400).json({message:'Yangi parol kamida 8 ta belgidan iborat bo‘lsin'});
  const filter={role:'student',active:true};
  if(req.body.groupId){const g=await resolveStructure(req.body.groupId,'group');if(!g)return res.status(400).json({message:'Guruh topilmadi'});filter.groupId=g._id}
  const rows=await User.find(filter).select('_id login').lean();
  if(!rows.length)return res.status(404).json({message:'Talaba topilmadi'});
  const hash=await bcrypt.hash(password,11);
  await User.updateMany({_id:{$in:rows.map(x=>x._id)}},{$set:{passwordHash:hash,mustChangePassword:false},$inc:{sessionVersion:1}});
  for(const row of rows)disconnectUserSockets(row._id);
  audit(req,'BULK_STUDENT_PASSWORD','User','student',{count:rows.length,groupId:req.body.groupId||null,sessionsRevoked:true});
  res.json({ok:true,count:rows.length});
});

app.post('/api/users/:id/reset-password', auth, can('users.control'), async(req,res)=>{const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(!canAssignRole(req.user.role,target.role))return res.status(403).json({message:'Bu akkaunt parolini tiklash uchun ruxsat yo‘q'});const password=String(req.body.password||'').trim()||crypto.randomBytes(7).toString('base64url');if(password.length<8)return res.status(400).json({message:'Parol kamida 8 belgi bo‘lsin'});target.passwordHash=await bcrypt.hash(password,11);target.mustChangePassword=true;target.sessionVersion=(target.sessionVersion||0)+1;await target.save();disconnectUserSockets(target._id);audit(req,'PASSWORD_RESET','User',target.id,{sessionsRevoked:true});res.json({temporaryPassword:password})});

app.post('/api/users/:id/revoke-sessions',auth,can('users.control'),async(req,res)=>{const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(!canAssignRole(req.user.role,target.role))return res.status(403).json({message:'Bu akkaunt sessiyalarini bekor qilish uchun ruxsat yo‘q'});target.sessionVersion=(target.sessionVersion||0)+1;await target.save();disconnectUserSockets(target._id);audit(req,'ADMIN_SESSIONS_REVOKE','User',target.id);res.json({ok:true})});

app.post('/api/users/:id/reset-2fa',auth,can('users.control'),async(req,res)=>{const target=await User.findById(req.params.id).select('+totpSecretEncrypted +totpPendingSecretEncrypted +totpRecoveryHashes');if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(!canAssignRole(req.user.role,target.role))return res.status(403).json({message:'Bu akkaunt 2FA sozlamasini tiklash uchun ruxsat yo‘q'});target.totpEnabled=false;target.totpSecretEncrypted=undefined;target.totpPendingSecretEncrypted=undefined;target.totpRecoveryHashes=[];target.sessionVersion=(target.sessionVersion||0)+1;await target.save();disconnectUserSockets(target._id);audit(req,'ADMIN_TWO_FACTOR_RESET','User',target.id,{sessionsRevoked:true});res.json({ok:true})});

app.post('/api/users/:id/identity-verification',auth,can('users.control'),async(req,res)=>{
  const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(!canAssignRole(req.user.role,target.role))return res.status(403).json({message:'Bu akkaunt shaxsini tasdiqlash uchun ruxsat yo‘q'});
  const documentType=String(req.body.documentType||'').trim().slice(0,80),last4=String(req.body.documentLast4||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(-4),note=String(req.body.note||'').trim().slice(0,300);
  if(documentType.length<2||last4.length<2)return res.status(400).json({message:'Hujjat turi va hujjatning oxirgi 2–4 belgisini kiriting'});
  target.identityVerifiedAt=new Date();target.identityVerifiedBy=req.user._id;target.identityVerificationMode='in_person';target.identityDocumentType=documentType;target.identityDocumentLast4=last4;target.identityVerificationNote=note;await target.save();
  audit(req,'IDENTITY_VERIFY_IN_PERSON','User',target.id,{documentType,documentLast4:last4});res.json({ok:true,identityVerifiedAt:target.identityVerifiedAt});
});
app.delete('/api/users/:id/identity-verification',auth,can('users.control'),async(req,res)=>{
  const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'Foydalanuvchi topilmadi'});if(!canAssignRole(req.user.role,target.role))return res.status(403).json({message:'Bu akkaunt shaxs tasdig‘ini bekor qilish uchun ruxsat yo‘q'});
  target.identityVerifiedAt=undefined;target.identityVerifiedBy=undefined;target.identityVerificationMode=undefined;target.identityDocumentType=undefined;target.identityDocumentLast4=undefined;target.identityVerificationNote=undefined;target.sessionVersion=(target.sessionVersion||0)+1;await target.save();disconnectUserSockets(target._id);audit(req,'IDENTITY_VERIFICATION_REVOKE','User',target.id,{sessionsRevoked:true});res.json({ok:true});
});

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
app.get('/api/teachers', auth, async(req,res)=>{
  if(!hasPermission(req.user,'schedule.manage')&&!hasPermission(req.user,'lessons.monitor'))return res.status(403).json({message:'O‘qituvchilar ro‘yxati uchun ruxsat yo‘q'});
  const scope=GLOBAL_SCOPE_ROLES.has(req.user.role)?null:await resolveScope(req.user,{});
  const filter=scope?scopedUserFilter(scope,{active:true,role:'teacher'}):{active:true,role:'teacher'};
  res.json(await User.find(filter).select('fullName login facultyId departmentId').sort({fullName:1}).lean());
});

app.get('/api/schedules', auth, async(req,res)=>{
  if(mongoose.connection.readyState!==1)return res.json([]);
  const filter={};
  if(req.user.role==='teacher')filter.teacherId=req.user._id;
  else if(req.user.role==='student'){const gid=await resolveUserGroupId(req.user);if(!gid)return res.json([]);filter.groupId=gid}
  else{
    let scope=null;if(!GLOBAL_SCOPE_ROLES.has(req.user.role))scope=await resolveScope(req.user,{});
    if(scope)Object.assign(filter,scope.scheduleScope);
    if(req.query.groupId){
      const g=await resolveStructure(req.query.groupId,'group');if(!g)return res.json([]);
      if(scope&&!scope.groupIds.some(id=>String(id)===String(g._id)))return res.status(403).json({message:'Bu guruh jadvali uchun ruxsat yo‘q'});
      filter.groupId=g._id;
    }
    if(req.query.teacherLogin){const t=await User.findOne({login:String(req.query.teacherLogin).toLowerCase(),role:'teacher'}).lean();if(!t)return res.json([]);filter.teacherId=t._id}
    if(req.query.weekday)filter.weekday=Number(req.query.weekday);
  }
  res.json(await scheduleQuery(filter).lean());
});
app.post('/api/schedules', auth, can('schedule.manage'), async(req,res)=>{const group=await resolveStructure(req.body.groupId,'group');const teacher=mongoose.isValidObjectId(req.body.teacherId)?await User.findById(req.body.teacherId).lean():await User.findOne({login:String(req.body.teacherId||'').toLowerCase(),role:'teacher',active:true}).lean();const start=normalizeTime(req.body.start),end=normalizeTime(req.body.end),weekday=normalizeWeekday(req.body.weekday),room=String(req.body.room||'').trim();if(!group)return res.status(400).json({message:'Guruh ID topilmadi'});if(!teacher)return res.status(400).json({message:'O‘qituvchi topilmadi'});if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){const scope=await resolveScope(req.user,{});if(!scope.groupIds.some(id=>String(id)===String(group._id)))return res.status(403).json({message:'Bu guruhga dars biriktirish uchun ruxsat yo‘q'})}if(!weekday||!start||!end||start>=end)return res.status(400).json({message:'Vaqt oralig‘i noto‘g‘ri'});const overlap={weekday,start:{$lt:end},end:{$gt:start}};const isOnline=req.body.liveEnabled!==false;const clashes=await Promise.all([Schedule.findOne(Object.assign({},overlap,{teacherId:teacher._id})),Schedule.findOne(Object.assign({},overlap,{groupId:group._id})),!isOnline&&room?Schedule.findOne(Object.assign({},overlap,{room})):null]);if(clashes[0])return res.status(409).json({message:'O‘qituvchining bu vaqtda boshqa darsi bor'});if(clashes[1])return res.status(409).json({message:'Guruhning bu vaqtda boshqa darsi bor'});if(clashes[2])return res.status(409).json({message:'Bu xona shu vaqtda band'});const item=await Schedule.create(Object.assign({},req.body,{start,end,weekday,room,groupId:group._id,teacherId:teacher._id}));audit(req,'CREATE','Schedule',item.id,{groupId:group.externalId||group.code,teacherLogin:teacher.login});res.status(201).json(item)});
app.delete('/api/schedules/:id', auth, can('schedule.manage'), async(req,res)=>{
  const item=await Schedule.findById(req.params.id).lean();if(!item)return res.status(404).json({message:'Dars topilmadi'});
  if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){const scope=await resolveScope(req.user,{});if(!scope.groupIds.some(id=>String(id)===String(item.groupId)))return res.status(403).json({message:'Bu darsni o‘chirish uchun ruxsat yo‘q'})}
  await Schedule.findByIdAndDelete(req.params.id);audit(req,'DELETE','Schedule',req.params.id);res.json({ok:true});
});

app.post('/api/schedules/bulk-import', auth, can('schedule.manage'), async(req,res)=>{ try{
  const rows=await parseFileRows(req.body),dryRun=req.body.dryRun!==false,prepared=[],errors=[],groupCache=new Map(),teacherCache=new Map();
  const existing=await Schedule.find().select('title teacherId groupId weekday start end room').lean();
  const getGroup=async raw=>{if(groupCache.has(raw))return groupCache.get(raw);const x=await resolveStructure(raw,'group');groupCache.set(raw,x);return x};
  const getTeacher=async login=>{if(teacherCache.has(login))return teacherCache.get(login);const x=await User.findOne({login,role:'teacher',active:true}).lean();teacherCache.set(login,x);return x};
  const overlaps=(a,teacherId,groupId,weekday,start,end,room)=>a.weekday===weekday&&a.start<end&&a.end>start&&(String(a.teacherId)===String(teacherId)||String(a.groupId)===String(groupId));
  for(let i=0;i<rows.length;i++){
    const row=rows[i],n=i+2,title=String(pick(row,['title','dars_nomi','lesson','fan_nomi'])||'').trim(),subject=String(pick(row,['subject','fan'])||title).trim(),groupRaw=String(pick(row,['group_id','guruh_id','groupid'])||'').trim(),teacherLogin=String(pick(row,['teacher_login','oqituvchi_login','teacher','login'])||'').toLowerCase().trim(),weekday=normalizeWeekday(pick(row,['weekday','hafta_kuni','day'])),start=normalizeTime(pick(row,['start','boshlanish','start_time'])),end=normalizeTime(pick(row,['end','tugash','end_time'])),room=String(pick(row,['room','xona','auditoriya'])||'').trim(),kind=normalizeKind(pick(row,['kind','turi','type']));
    if(!title||!groupRaw||!teacherLogin||!weekday||!start||!end){errors.push({row:n,message:'title, group_id, teacher_login, weekday, start, end majburiy'});continue}
    if(start>=end){errors.push({row:n,message:'Vaqt oralig‘i noto‘g‘ri'});continue}
    const [group,teacher]=await Promise.all([getGroup(groupRaw),getTeacher(teacherLogin)]);
    if(!group){errors.push({row:n,message:'group_id topilmadi: '+groupRaw});continue}
    if(!teacher){errors.push({row:n,message:'teacher_login topilmadi: '+teacherLogin});continue}
    if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){const scope=await resolveScope(req.user,{});if(!scope.groupIds.some(id=>String(id)===String(group._id))){errors.push({row:n,message:'Bu guruh uchun jadval boshqaruv ruxsati yo‘q'});continue}}
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

const roomNameFor=(scheduleId,dateKey)=>'M2-'+crypto.createHmac('sha256',JWT_SECRET).update(String(scheduleId)+':'+dateKey).digest('hex').slice(0,28);
const mediaProfileFor=lesson=>(lesson?.kind==='lecture'||Number(lesson?.maxParticipants||0)>=40)?'lecture-lite':'seminar';
const mediaTicketFor=(user,roomName,lesson)=>jwt.sign({typ:'media',sub:String(user._id||user.id),sv:Number(user.sessionVersion)||0,fullName:user.fullName,login:user.login,role:user.role,avatarUrl:user.avatarUrl||'',roomName,scheduleId:String(lesson?._id||lesson),mediaProfile:mediaProfileFor(lesson),maxParticipants:Math.min(120,Math.max(2,Number(lesson?.maxParticipants||60)))},JWT_SECRET,{expiresIn:'10m',issuer:'masofaviy2',audience:'masofaviy2-sfu'});
const mediaIceServers=(user=null)=>{
  if(!TURN_URLS.length)return [];
  if(TURN_SHARED_SECRET){
    const identity=String(user?.login||user?._id||user?.id||'rtc').replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)||'rtc';
    const username=`${Math.floor(Date.now()/1000)+7200}:${identity}`;
    const credential=crypto.createHmac('sha1',TURN_SHARED_SECRET).update(username).digest('base64');
    return [{urls:TURN_URLS,username,credential}];
  }
  return TURN_USERNAME&&TURN_CREDENTIAL?[{urls:TURN_URLS,username:TURN_USERNAME,credential:TURN_CREDENTIAL}]:[];
};
const lessonRoomSockets=scheduleId=>{
  const ids=io.sockets.adapter.rooms.get('lesson:'+String(scheduleId));
  return ids?[...ids].map(id=>io.sockets.sockets.get(id)).filter(Boolean):[];
};
const onlineStudentIds=scheduleId=>new Set(lessonRoomSockets(scheduleId).filter(s=>s.user?.role==='student').map(s=>String(s.user._id)));
async function runAttendanceCheckpoint(session){
  if(!session?.startedAt||session.status!=='active')return null;
  const now=new Date(),elapsed=Math.floor((now-new Date(session.startedAt))/60000);
  if(elapsed<10)return null;
  const checkpoint=Math.floor(elapsed/ATTENDANCE_RECHECK_MINUTES)*ATTENDANCE_RECHECK_MINUTES;
  if(checkpoint<=Number(session.lastAttendanceCheckpointMinute||0))return null;
  const students=await User.find({role:'student',active:true,groupId:session.groupId}).select('_id fullName login').lean();
  const online=onlineStudentIds(session.scheduleId),dateKey=session.dateKey||localDateKey(now);
  let present=0,late=0,absent=0;
  for(const student of students){
    const sid=String(student._id),isOnline=online.has(sid);
    let row=await Attendance.findOne({lessonId:String(session.scheduleId),userId:student._id,dateKey}).sort({createdAt:1});
    let state='absent';
    if(isOnline){
      const joined=row?.joinedAt?new Date(row.joinedAt):now;
      state=joined<=new Date(new Date(session.startedAt).getTime()+10*60000)?'present':'late';
    }
    if(!row)row=new Attendance({lessonId:String(session.scheduleId),userId:student._id,dateKey,joinedAt:isOnline?now:undefined,leftAt:isOnline?null:now,minutes:0,status:state,checkpoints:[]});
    else if(row.status!=='excused'){
      if(state==='present')row.status='present';
      else if(state==='late'&&row.status!=='present')row.status='late';
      else if(state==='absent'&&!row.joinedAt)row.status='absent';
    }
    row.lastCheckedAt=now;row.checkpoints=row.checkpoints||[];
    if(!row.checkpoints.some(x=>Number(x.minute)===checkpoint))row.checkpoints.push({minute:checkpoint,at:now,state});
    await row.save();
    if(row.status==='present')present++; else if(row.status==='late')late++; else if(row.status==='absent')absent++;
  }
  session.lastAttendanceCheckpointMinute=checkpoint;session.lastAttendanceCheckpointAt=now;
  session.currentParticipants=lessonRoomSockets(session.scheduleId).length;
  session.participantPeak=Math.max(session.participantPeak||0,session.currentParticipants);
  await session.save();
  const summary={scheduleId:String(session.scheduleId),checkpointMinute:checkpoint,present,late,absent,total:students.length,at:now.toISOString()};
  io.to('lesson:'+String(session.scheduleId)).emit('attendance:checkpoint',summary);
  return summary;
}
async function attendanceSweep(){
  if(mongoose.connection.readyState!==1)return;
  const sessions=await LiveSession.find({status:'active',startedAt:{$ne:null}}).limit(100);
  for(const s of sessions)try{await runAttendanceCheckpoint(s)}catch(e){console.error('Davomat checkpoint:',e.message)}
}
async function participantSnapshot(scheduleId){
  const lesson=await Schedule.findById(scheduleId).lean();if(!lesson)return null;
  const dateKey=localDateKey(),students=await User.find({role:'student',active:true,groupId:lesson.groupId}).select('_id fullName login').sort({fullName:1}).lean();
  const online=onlineStudentIds(scheduleId),rows=await Attendance.find({lessonId:String(scheduleId),dateKey,userId:{$in:students.map(s=>s._id)}}).lean(),by=new Map(rows.map(r=>[String(r.userId),r]));
  const session=await LiveSession.findOne({scheduleId:lesson._id,dateKey}).lean();
  const scheduleMinutes=Math.max(1,timeToMinutes(lesson.end)-timeToMinutes(lesson.start)),now=new Date();
  return {session:session?{startedAt:session.startedAt,lastAttendanceCheckpointMinute:session.lastAttendanceCheckpointMinute||0,lastAttendanceCheckpointAt:session.lastAttendanceCheckpointAt}:null,students:students.map(s=>{const r=by.get(String(s._id)),isOnline=online.has(String(s._id));let liveMinutes=Number(r?.minutes||0);if(isOnline&&r?.lastJoinedAt)liveMinutes+=Math.max(0,Math.floor((now-new Date(r.lastJoinedAt))/60000));const pct=Math.max(0,Math.min(100,Math.round(liveMinutes/scheduleMinutes*100)));return {_id:s._id,attendanceId:r?._id||null,fullName:s.fullName,login:s.login,online:isOnline,status:r?.status||'pending',joinedAt:r?.joinedAt||null,leftAt:r?.leftAt||null,lastCheckedAt:r?.lastCheckedAt||null,manualMarkedAt:r?.manualMarkedAt||null,minutes:liveMinutes,presencePercent:pct,reconnectCount:r?.reconnectCount||0,checkpointCount:Array.isArray(r?.checkpoints)?r.checkpoints.length:0}})};
}
const mediaJoinPayload=(user,roomName,lesson)=>({provider:'mediasoup',roomName,mediaProfile:mediaProfileFor(lesson),mediaTicket:mediaTicketFor(user,roomName,lesson),iceServers:mediaIceServers(user)});
app.post('/api/media/verify',async(req,res)=>{try{
  const payload=jwt.verify(String(req.body.ticket||''),JWT_SECRET,{issuer:'masofaviy2',audience:'masofaviy2-sfu'});
  if(payload.typ!=='media'||!payload.roomName||!mongoose.isValidObjectId(payload.scheduleId)||!mongoose.isValidObjectId(payload.sub))throw new Error();
  const [user,lesson,session]=await Promise.all([User.findById(payload.sub).lean(),Schedule.findById(payload.scheduleId).lean(),LiveSession.findOne({scheduleId:payload.scheduleId,roomName:payload.roomName,status:'active'}).lean()]);
  if(!user?.active||Number(payload.sv||0)!==Number(user.sessionVersion||0)||!lesson||!session||!(await scheduleAccess(user,lesson)))throw new Error();
  res.json({ok:true,payload});
}catch{res.status(401).json({ok:false,message:'Media ticket yaroqsiz yoki muddati tugagan'})}});

const scheduleAccess=async(user,lesson,mode='join')=>{
  if(!lesson)return false;
  if(GLOBAL_SCOPE_ROLES.has(user.role)||hasPermission(user,'lessons.support')||hasPermission(user,'lessons.monitor'))return true;
  if(user.role==='teacher')return String(lesson.teacherId)===String(user._id);
  if(user.role==='student'){const gid=await resolveUserGroupId(user);return String(gid||'')===String(lesson.groupId)}
  try{const scope=await resolveScope(user,{});return scope.groupIds.some(id=>String(id)===String(lesson.groupId))}catch{return false}
};
const roomPayload=async(lesson,session)=>{
  const populated=await Schedule.findById(lesson._id).populate('groupId','name externalId code').populate('teacherId','fullName login').lean();
  return {schedule:populated,session:session?{id:session._id,status:session.status,startedAt:session.startedAt,endedAt:session.endedAt,currentParticipants:io.sockets.adapter.rooms.get('lesson:'+String(lesson._id))?.size||session.currentParticipants||0,participantPeak:Math.max(session.participantPeak||0,io.sockets.adapter.rooms.get('lesson:'+String(lesson._id))?.size||0)}:null};
};
app.get('/api/live/rooms', auth, async(req,res)=>{
  const day=localWeekday(),filter={weekday:day,kind:{$ne:'final_exam'},liveEnabled:{$ne:false}};
  if(req.user.role==='teacher')filter.teacherId=req.user._id;
  else if(req.user.role==='student'){const gid=await resolveUserGroupId(req.user);if(!gid)return res.json({dateKey:localDateKey(),rooms:[]});filter.groupId=gid}
  else if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){try{const scope=await resolveScope(req.user,{});filter.groupId={$in:scope.groupIds}}catch{return res.json({dateKey:localDateKey(),rooms:[]})}}
  const schedules=await scheduleQuery(filter).lean(),dateKey=localDateKey(),nowMinute=localMinuteOfDay(),sessions=await LiveSession.find({dateKey,scheduleId:{$in:schedules.map(x=>x._id)}}).lean(),bySchedule=Object.fromEntries(sessions.map(x=>[String(x.scheduleId),x]));
  const expiredIds=schedules.filter(x=>bySchedule[String(x._id)]?.status==='active'&&nowMinute>=timeToMinutes(x.end)).map(x=>x._id);
  if(expiredIds.length){
    const endedAt=new Date();
    await LiveSession.updateMany({dateKey,scheduleId:{$in:expiredIds},status:'active'},{$set:{status:'ended',endedAt,currentParticipants:0}});
    for(const sid of expiredIds){const row=bySchedule[String(sid)];if(row){row.status='ended';row.endedAt=endedAt}io.to('lesson:'+String(sid)).emit('lesson:auto-ended',{scheduleId:String(sid),endedAt});io.emit('live:changed',{scheduleId:String(sid),status:'ended',automatic:true})}
  }
  const rooms=schedules.map(x=>{
    const startMinute=timeToMinutes(x.start),endMinute=timeToMinutes(x.end),session=bySchedule[String(x._id)],isTeacher=String(x.teacherId?._id||x.teacherId)===String(req.user._id)||hasPermission(req.user,'live.manage');
    return {schedule:x,session:session?{id:session._id,status:session.status,startedAt:session.startedAt,endedAt:session.endedAt,currentParticipants:io.sockets.adapter.rooms.get('lesson:'+String(x._id))?.size||session.currentParticipants||0,participantPeak:Math.max(session.participantPeak||0,io.sockets.adapter.rooms.get('lesson:'+String(x._id))?.size||0)}:null,canStart:isTeacher&&nowMinute>=Math.max(0,startMinute-10)&&nowMinute<endMinute,canJoin:(req.user.role==='student'||req.user.role==='teacher'||hasPermission(req.user,'lessons.monitor')||hasPermission(req.user,'lessons.support'))&&nowMinute<endMinute,startMinute,endMinute,nowMinute};
  });
  res.json({dateKey,provider:'mediasoup',sfuBridgeNodes:SFU_BRIDGE_URLS.length,turnEnabled:Boolean(mediaIceServers().length),nowMinute,rooms});
});
app.get('/api/live/rooms/:scheduleId/participants',auth,async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.scheduleId))return res.status(400).json({message:'Dars ID noto‘g‘ri'});
  const lesson=await Schedule.findById(req.params.scheduleId).lean();if(!lesson)return res.status(404).json({message:'Dars topilmadi'});
  if(!(await scheduleAccess(req.user,lesson)))return res.status(403).json({message:'Ruxsat yo‘q'});
  res.json(await participantSnapshot(lesson._id));
});
app.post('/api/live/rooms/:scheduleId/attendance',auth,async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.scheduleId))return res.status(400).json({message:'Dars ID noto‘g‘ri'});
  const lesson=await Schedule.findById(req.params.scheduleId).lean();if(!lesson)return res.status(404).json({message:'Dars topilmadi'});
  const isTeacher=String(lesson.teacherId)===String(req.user._id);
  const canManage=hasPermission(req.user,'attendance.manage');
  if(!isTeacher&&!canManage)return res.status(403).json({message:'Davomatni belgilash huquqi yo‘q'});
  if(!isTeacher&&!GLOBAL_SCOPE_ROLES.has(req.user.role)){
    try{const scope=await resolveScope(req.user,{});if(!scope.groupIds.some(id=>String(id)===String(lesson.groupId)))return res.status(403).json({message:'Bu guruh davomatini o‘zgartirish huquqi yo‘q'})}
    catch{return res.status(403).json({message:'Ruxsat yo‘q'})}
  }
  const records=Array.isArray(req.body.records)?req.body.records:[];
  if(!records.length||records.length>300)return res.status(400).json({message:'Davomat ro‘yxati bo‘sh yoki juda katta'});
  const allowedStatuses=new Set(['present','late','absent','excused']);
  const ids=records.map(x=>String(x.studentId||'')).filter(mongoose.isValidObjectId).map(x=>new mongoose.Types.ObjectId(x));
  const students=await User.find({_id:{$in:ids},role:'student',active:true,groupId:lesson.groupId}).select('_id').lean();
  const allowedIds=new Set(students.map(x=>String(x._id)));
  const dateKey=localDateKey(),now=new Date();
  let present=0,late=0,absent=0,excused=0,saved=0;
  for(const item of records){
    const sid=String(item.studentId||''),status=String(item.status||'');
    if(!allowedIds.has(sid)||!allowedStatuses.has(status))continue;
    let row=await Attendance.findOne({lessonId:String(lesson._id),userId:sid,dateKey}).sort({createdAt:1});
    if(!row)row=new Attendance({lessonId:String(lesson._id),userId:sid,dateKey,minutes:0,checkpoints:[]});
    row.status=status;
    if((status==='present'||status==='late')&&!row.joinedAt)row.joinedAt=now;
    if(status==='absent'&&!row.leftAt)row.leftAt=now;
    row.manualMarkedAt=now;
    row.manualMarkedBy=mongoose.isValidObjectId(req.user._id)?req.user._id:undefined;
    row.manualNote=String(req.body.note||'').slice(0,300);
    await row.save();saved++;
    if(status==='present')present++; else if(status==='late')late++; else if(status==='absent')absent++; else if(status==='excused')excused++;
  }
  audit(req,'ATTENDANCE_MANUAL_SAVE','Attendance',String(lesson._id),{dateKey,groupId:String(lesson.groupId),saved,present,late,absent,excused});
  const payload={scheduleId:String(lesson._id),manual:true,saved,present,late,absent,excused,at:now.toISOString()};
  io.to('lesson:'+String(lesson._id)).emit('attendance:manual-saved',payload);
  res.json({ok:true,...payload});
});
app.post('/api/live/rooms/:scheduleId/start', auth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.scheduleId))return res.status(400).json({message:'Dars ID noto‘g‘ri'});
  const lesson=await Schedule.findById(req.params.scheduleId).lean();if(!lesson)return res.status(404).json({message:'Dars topilmadi'});
  if(lesson.kind==='final_exam')return res.status(403).json({message:'Yakuniy nazorat onlayn xona sifatida boshlanmaydi'});
  const allowed=String(lesson.teacherId)===String(req.user._id)||hasPermission(req.user,'live.manage');if(!allowed)return res.status(403).json({message:'Bu darsni boshlash huquqi yo‘q'});
  const dateKey=localDateKey(),roomName=roomNameFor(lesson._id,dateKey);
  const session=await LiveSession.findOneAndUpdate({scheduleId:lesson._id,dateKey},{$set:{groupId:lesson.groupId,teacherId:lesson.teacherId,roomName,providerHost:'mediasoup',status:'active',startedAt:new Date(),endedAt:null,lastAttendanceCheckpointMinute:0,lastAttendanceCheckpointAt:null,startedBy:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined}}, {new:true,upsert:true,setDefaultsOnInsert:true});
  audit(req,'LIVE_START','LiveSession',session.id,{scheduleId:String(lesson._id),roomName});
  io.emit('live:changed',{scheduleId:String(lesson._id),status:'active'});
  const populatedLesson=await Schedule.findById(lesson._id).populate('groupId','name externalId code').populate('teacherId','fullName login').lean();
  for(const studentSocket of io.sockets.sockets.values()){
    if(studentSocket.user?.role!=='student')continue;
    const gid=studentSocket.user?.groupId||await resolveUserGroupId(studentSocket.user);
    if(String(gid||'')!==String(lesson.groupId))continue;
    studentSocket.emit('lesson:started',{scheduleId:String(lesson._id),title:lesson.title,subject:lesson.subject||'',teacherName:populatedLesson?.teacherId?.fullName||req.user.fullName,groupName:populatedLesson?.groupId?.name||'',startedAt:session.startedAt});
  }
  res.json({...(await roomPayload(lesson,session)),join:mediaJoinPayload(req.user,roomName,lesson)});
});
app.post('/api/live/rooms/:scheduleId/join', auth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.scheduleId))return res.status(400).json({message:'Dars ID noto‘g‘ri'});
  const lesson=await Schedule.findById(req.params.scheduleId).lean();if(!lesson)return res.status(404).json({message:'Dars topilmadi'});
  if(lesson.kind==='final_exam')return res.status(403).json({message:'Yakuniy nazoratga jonli xonadan kirib bo‘lmaydi'});
  if(!(await scheduleAccess(req.user,lesson)))return res.status(403).json({message:'Bu guruh darsiga kirish huquqi yo‘q'});
  const dateKey=localDateKey();let session=await LiveSession.findOne({scheduleId:lesson._id,dateKey});
  const isHost=String(lesson.teacherId)===String(req.user._id)||hasPermission(req.user,'live.manage');
  if(!session&&isHost){session=await LiveSession.create({scheduleId:lesson._id,dateKey,groupId:lesson.groupId,teacherId:lesson.teacherId,roomName:roomNameFor(lesson._id,dateKey),providerHost:'mediasoup',status:'active',startedAt:new Date(),startedBy:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined})}
  if(!session||session.status!=='active')return res.status(409).json({message:'O‘qituvchi hali jonli darsni boshlamagan'});
  res.json({...(await roomPayload(lesson,session)),join:mediaJoinPayload(req.user,session.roomName,lesson)});
});
app.post('/api/live/rooms/:scheduleId/end', auth, async(req,res)=>{
  const lesson=mongoose.isValidObjectId(req.params.scheduleId)?await Schedule.findById(req.params.scheduleId).lean():null;if(!lesson)return res.status(404).json({message:'Dars topilmadi'});
  if(String(lesson.teacherId)!==String(req.user._id)&&!hasPermission(req.user,'live.manage'))return res.status(403).json({message:'Bu darsni yakunlash huquqi yo‘q'});
  const session=await LiveSession.findOneAndUpdate({scheduleId:lesson._id,dateKey:localDateKey(),status:'active'},{$set:{status:'ended',endedAt:new Date(),currentParticipants:0}},{new:true});
  if(session){audit(req,'LIVE_END','LiveSession',session.id,{scheduleId:String(lesson._id)});io.emit('live:changed',{scheduleId:String(lesson._id),status:'ended'})}
  res.json({ok:true});
});
const autoEndLiveLessons=async()=>{
  try{
    const dateKey=localDateKey(),nowMinute=localMinuteOfDay(),active=await LiveSession.find({dateKey,status:'active'}).select('_id scheduleId').lean();
    if(!active.length)return;
    const schedules=await Schedule.find({_id:{$in:active.map(x=>x.scheduleId)}}).select('_id end').lean(),endMap=new Map(schedules.map(x=>[String(x._id),timeToMinutes(x.end)]));
    const expired=active.filter(x=>nowMinute>=Number(endMap.get(String(x.scheduleId))??1440));
    if(!expired.length)return;
    const endedAt=new Date(),ids=expired.map(x=>x._id);
    await LiveSession.updateMany({_id:{$in:ids},status:'active'},{$set:{status:'ended',endedAt,currentParticipants:0}});
    for(const row of expired){
      const sid=String(row.scheduleId);
      io.to('lesson:'+sid).emit('lesson:auto-ended',{scheduleId:sid,endedAt});
      io.emit('live:changed',{scheduleId:sid,status:'ended',automatic:true});
    }
  }catch(e){console.error('autoEndLiveLessons',e?.message||e)}
};
setInterval(autoEndLiveLessons,20000).unref?.();
setTimeout(autoEndLiveLessons,3000).unref?.();



app.get('/api/videos', auth, async(req,res)=>{
  const filter={published:true};if((hasPermission(req.user,'videos.manage')||hasPermission(req.user,'videos.upload'))&&req.query.all==='1')delete filter.published;
  if(req.query.subject)filter.subject={$regex:escapeRegex(String(req.query.subject).slice(0,80)),$options:'i'};
  if(req.query.direction)filter.direction={$regex:escapeRegex(String(req.query.direction).slice(0,80)),$options:'i'};
  if(req.query.courseId&&mongoose.isValidObjectId(req.query.courseId))filter.courseId=req.query.courseId;
  const rows=await VideoLesson.find(filter).populate('teacherId','fullName login').populate('groupIds','name externalId code').populate('courseId','code title language credits teacherId groupId').populate('checkpointQuizId','title durationMinutes proctorRequired published').sort({featured:-1,courseId:1,moduleTitle:1,sequence:1,createdAt:-1}).limit(500).lean();
  let gid=null;if(req.user.role==='student')gid=await resolveUserGroupId(req.user);
  const scored=rows.map(v=>{let score=v.featured?15:0;if(gid&&v.groupIds?.some(g=>String(g._id)===String(gid)))score+=100;if(req.user.courseYear&&v.courseYears?.includes(req.user.courseYear))score+=35;if(req.user.direction&&v.direction&&v.direction.toLowerCase()===req.user.direction.toLowerCase())score+=30;if(!v.groupIds?.length&&!v.direction&&!v.courseYears?.length)score+=10;return {...v,recommendationScore:score}});
  scored.sort((a,b)=>b.recommendationScore-a.recommendationScore||new Date(b.createdAt)-new Date(a.createdAt));
  const progress=mongoose.isValidObjectId(req.user._id)?await VideoProgress.find({userId:req.user._id,videoId:{$in:scored.map(x=>x._id)}}).lean():[],pm=Object.fromEntries(progress.map(x=>[String(x.videoId),x]));
  const counts=scored.length?await VideoComment.aggregate([{$match:{videoId:{$in:scored.map(x=>x._id)}}},{$group:{_id:'$videoId',count:{$sum:1}}}]):[],cm=Object.fromEntries(counts.map(x=>[String(x._id),x.count]));
  res.json(scored.map(x=>({...x,progress:pm[String(x._id)]||null,commentCount:cm[String(x._id)]||0})));
});
app.post('/api/videos', auth, async(req,res)=>{
  if(!hasPermission(req.user,'videos.manage')&&!hasPermission(req.user,'videos.upload'))return res.status(403).json({message:'Videodars joylash huquqi yo‘q'});
  const title=String(req.body.title||'').trim(),sourceUrl=String(req.body.sourceUrl||'').trim();let parsedVideoUrl;try{parsedVideoUrl=new URL(sourceUrl)}catch{}const allowedVideoProtocol=parsedVideoUrl&&(parsedVideoUrl.protocol==='https:'||(process.env.NODE_ENV!=='production'&&parsedVideoUrl.protocol==='http:'));if(!title||!allowedVideoProtocol)return res.status(400).json({message:'Nomi va HTTPS video havolasi majburiy'});
  const rawGroups=Array.isArray(req.body.groupIds)?req.body.groupIds:String(req.body.groupIds||'').split(',').map(x=>x.trim()).filter(Boolean),groupIds=[];
  for(const id of rawGroups){const g=await resolveStructure(id,'group');if(g)groupIds.push(g._id)}
  let teacherId=req.user.role==='teacher'?req.user._id:req.body.teacherId;if(teacherId&&!mongoose.isValidObjectId(teacherId)){const t=await User.findOne({login:String(teacherId).toLowerCase(),role:'teacher',active:true}).lean();teacherId=t?._id}
  const courseYears=(Array.isArray(req.body.courseYears)?req.body.courseYears:String(req.body.courseYears||'').split(',')).map(Number).filter(x=>x>=1&&x<=6);
  const tags=(Array.isArray(req.body.tags)?req.body.tags:String(req.body.tags||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,20);
  let courseId=null,checkpointQuizId=null;
  if(req.body.courseId){if(!mongoose.isValidObjectId(req.body.courseId))return res.status(400).json({message:'Fan ID noto‘g‘ri'});const Course=mongoose.models.Course,course=Course?await Course.findById(req.body.courseId).lean():null;if(!course?.active)return res.status(404).json({message:'Fan topilmadi'});if(req.user.role==='teacher'&&String(course.teacherId)!==String(req.user._id))return res.status(403).json({message:'Faqat o‘zingizga biriktirilgan fanga videodars qo‘sha olasiz'});courseId=course._id;if(!teacherId)teacherId=course.teacherId}
  if(req.body.checkpointQuizId){if(!mongoose.isValidObjectId(req.body.checkpointQuizId))return res.status(400).json({message:'Test ID noto‘g‘ri'});const Quiz=mongoose.models.Quiz,quiz=Quiz?await Quiz.findById(req.body.checkpointQuizId).lean():null;if(!quiz)return res.status(404).json({message:'Mavzu testi topilmadi'});if(courseId&&String(quiz.courseId)!==String(courseId))return res.status(400).json({message:'Mavzu testi tanlangan fanga tegishli emas'});checkpointQuizId=quiz._id}
  const sourceType=/youtu(?:be\.com|\.be)/i.test(sourceUrl)?'youtube':/\.mp4(?:\?|$)/i.test(sourceUrl)?'mp4':'url';
  const item=await VideoLesson.create({title,description:String(req.body.description||'').trim(),subject:String(req.body.subject||'').trim(),courseId,moduleTitle:String(req.body.moduleTitle||'Asosiy modul').trim().slice(0,180)||'Asosiy modul',topicTitle:String(req.body.topicTitle||title).trim().slice(0,220),sequence:Math.max(0,Number(req.body.sequence)||0),checkpointQuizId,teacherId,groupIds,direction:String(req.body.direction||'').trim(),courseYears,tags,sourceType,sourceUrl,thumbnailUrl:String(req.body.thumbnailUrl||'').trim(),durationMinutes:Number(req.body.durationMinutes)||0,published:req.body.published!==false,featured:Boolean(req.body.featured)&&hasPermission(req.user,'videos.manage'),createdBy:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined});
  audit(req,'VIDEO_CREATE','VideoLesson',item.id,{title:item.title,groups:groupIds.length});res.status(201).json(item);
});
app.delete('/api/videos/:id', auth, async(req,res)=>{
  const item=mongoose.isValidObjectId(req.params.id)?await VideoLesson.findById(req.params.id):null;if(!item)return res.status(404).json({message:'Videodars topilmadi'});
  const allowed=hasPermission(req.user,'videos.manage')||(req.user.role==='teacher'&&String(item.teacherId)===String(req.user._id));if(!allowed)return res.status(403).json({message:'Bu videodarsni o‘chirish huquqi yo‘q'});
  item.published=false;await item.save();audit(req,'VIDEO_ARCHIVE','VideoLesson',item.id);res.json({ok:true});
});
app.post('/api/videos/:id/view', auth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Video ID noto‘g‘ri'});const item=await VideoLesson.findById(req.params.id);if(!item)return res.status(404).json({message:'Videodars topilmadi'});
  const watchedSeconds=Math.max(0,Math.min(24*3600,Number(req.body.watchedSeconds)||0)),completed=Boolean(req.body.completed);let progress=null;
  if(mongoose.isValidObjectId(req.user._id))progress=await VideoProgress.findOneAndUpdate({videoId:item._id,userId:req.user._id},{$max:{watchedSeconds},$set:{completed,lastViewedAt:new Date()}},{new:true,upsert:true,setDefaultsOnInsert:true});
  await VideoLesson.findByIdAndUpdate(item._id,{$inc:{views:1}});res.json({ok:true,progress});
});
app.post('/api/videos/:id/like', auth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.user._id)||!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Amal bajarilmadi'});
  const prev=await VideoProgress.findOne({videoId:req.params.id,userId:req.user._id}),next=!prev?.liked;
  await VideoProgress.findOneAndUpdate({videoId:req.params.id,userId:req.user._id},{$set:{liked:next,lastViewedAt:new Date()}},{upsert:true,setDefaultsOnInsert:true});
  await VideoLesson.findByIdAndUpdate(req.params.id,{$inc:{likes:next?1:-1}});res.json({liked:next});
});
app.get('/api/videos/:id/comments', auth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Video ID noto‘g‘ri'});
  const exists=await VideoLesson.exists({_id:req.params.id,published:true});if(!exists&&!hasPermission(req.user,'videos.manage')&&!hasPermission(req.user,'videos.upload'))return res.status(404).json({message:'Videodars topilmadi'});
  const rows=await VideoComment.find({videoId:req.params.id}).populate('userId','fullName login avatarUrl role').sort({createdAt:-1}).limit(500).lean();
  res.json(rows);
});
app.post('/api/videos/:id/comments', auth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.user._id)||!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Izoh yuborilmadi'});
  const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({message:'Izoh matnini yozing'});if(text.length>1500)return res.status(400).json({message:'Izoh 1500 belgidan oshmasin'});
  const video=await VideoLesson.findOne({_id:req.params.id,published:true}).lean();if(!video)return res.status(404).json({message:'Videodars topilmadi'});
  let parentId=null;if(req.body.parentId){if(!mongoose.isValidObjectId(req.body.parentId))return res.status(400).json({message:'Javob ID noto‘g‘ri'});const parent=await VideoComment.findOne({_id:req.body.parentId,videoId:video._id}).lean();if(!parent)return res.status(404).json({message:'Asosiy izoh topilmadi'});parentId=parent._id}
  const row=await VideoComment.create({videoId:video._id,userId:req.user._id,parentId,text});const populated=await VideoComment.findById(row._id).populate('userId','fullName login avatarUrl role').lean();
  res.status(201).json(populated);
});
app.patch('/api/video-comments/:id', auth, async(req,res)=>{
  const row=mongoose.isValidObjectId(req.params.id)?await VideoComment.findById(req.params.id):null;if(!row)return res.status(404).json({message:'Izoh topilmadi'});
  if(String(row.userId)!==String(req.user._id))return res.status(403).json({message:'Faqat o‘z izohingizni tahrirlashingiz mumkin'});
  const text=String(req.body.text||'').trim();if(!text||text.length>1500)return res.status(400).json({message:'Izoh 1–1500 belgi oralig‘ida bo‘lsin'});
  row.text=text;row.editedAt=new Date();await row.save();res.json({ok:true});
});
app.delete('/api/video-comments/:id', auth, async(req,res)=>{
  const row=mongoose.isValidObjectId(req.params.id)?await VideoComment.findById(req.params.id):null;if(!row)return res.status(404).json({message:'Izoh topilmadi'});
  if(String(row.userId)!==String(req.user._id)&&!hasPermission(req.user,'videos.manage'))return res.status(403).json({message:'Bu izohni o‘chirish huquqi yo‘q'});
  await VideoComment.deleteMany({$or:[{_id:row._id},{parentId:row._id}]});res.json({ok:true});
});


app.patch('/api/attendance/:id', auth, can('attendance.manage'), async(req,res)=>{
  const row=await Attendance.findById(req.params.id);if(!row)return res.status(404).json({message:'Davomat yozuvi topilmadi'});
  const lesson=mongoose.isValidObjectId(row.lessonId)?await Schedule.findById(row.lessonId).lean():null;if(!lesson)return res.status(404).json({message:'Dars topilmadi'});
  let allowed=GLOBAL_SCOPE_ROLES.has(req.user.role);
  if(req.user.role==='teacher')allowed=String(lesson.teacherId)===String(req.user._id);
  else if(!allowed){try{const scope=await resolveScope(req.user,{});allowed=scope.groupIds.some(id=>String(id)===String(lesson.groupId))}catch{allowed=false}}
  if(!allowed)return res.status(403).json({message:'Bu davomat yozuvini o‘zgartirish uchun ruxsat yo‘q'});
  const status=String(req.body.status||row.status);if(!['present','late','absent','excused'].includes(status))return res.status(400).json({message:'Davomat holati noto‘g‘ri'});
  const minutes=req.body.minutes===undefined?row.minutes:Number(req.body.minutes);if(!Number.isFinite(minutes)||minutes<0||minutes>600)return res.status(400).json({message:'Daqiqa 0–600 oralig‘ida bo‘lsin'});
  const before={status:row.status,minutes:row.minutes};row.status=status;row.minutes=Math.round(minutes);await row.save();
  audit(req,'ATTENDANCE_CORRECTION','Attendance',row.id,{lessonId:row.lessonId,userId:String(row.userId),before,after:{status:row.status,minutes:row.minutes},reason:String(req.body.reason||'').slice(0,300)});
  res.json(row);
});

app.get('/api/reports/attendance', auth, can('reports.view'), async(req,res)=>{const days=Math.max(1,Math.min(90,Number(req.query.days)||14)),bounds=rangeBounds(days),scope=await resolveScope(req.user,req.query);const schedules=await Schedule.find(scope.scheduleScope).select('_id').lean(),scheduleIds=schedules.map(x=>String(x._id));const filter={createdAt:{$gte:bounds.start,$lt:bounds.end}};if(scheduleIds.length||(scope.group||scope.department||scope.faculty))filter.lessonId={$in:scheduleIds};const rows=await Attendance.find(filter).populate('userId','fullName login role groupId').sort({createdAt:-1}).limit(1500).lean();const used=[...new Set(rows.map(x=>x.lessonId).filter(mongoose.isValidObjectId))],fullSchedules=used.length?await scheduleQuery({_id:{$in:used}}).lean():[],byId=Object.fromEntries(fullSchedules.map(x=>[String(x._id),x]));res.json(rows.map(x=>({...x,schedule:byId[x.lessonId]||null})))});

app.get('/api/audit', auth, can('reports.view'), async(req,res)=>{const filter={};if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){filter.actorId=req.user._id}if(req.query.q){const q=escapeRegex(String(req.query.q).slice(0,80)),search=[{actorLogin:{$regex:q,$options:'i'}},{actorName:{$regex:q,$options:'i'}},{action:{$regex:q,$options:'i'}},{entity:{$regex:q,$options:'i'}}];if(filter.actorId)filter.$and=[{actorId:filter.actorId},{$or:search}];else filter.$or=search}res.json(await Audit.find(filter).sort({createdAt:-1}).limit(Math.min(1000,Number(req.query.limit)||300)).lean())});

const sfuNodes=new Map();
const roomNodeMap=new Map();
const clientNodeMap=new Map();
const clientRoomMap=new Map();

function sfuNodeScore(node){
  const h=node.health||{};
  const rooms=Number(h.rooms||0),peers=Number(h.peers||0),workers=Math.max(1,Number(h.workers||1));
  const load=Array.isArray(h.loadavg)?Number(h.loadavg[0]||0):0;
  return rooms*10000+peers*20+(load/workers)*100;
}
function sfuNodeOnline(node){
  return Boolean(node?.ws?.readyState===WebSocket.OPEN && node.lastSeen && Date.now()-node.lastSeen<SFU_NODE_STALE_MS);
}
function pickSfuNode(roomName){
  const sticky=roomNodeMap.get(roomName);
  if(sticky){const node=sfuNodes.get(sticky);if(sfuNodeOnline(node))return node;roomNodeMap.delete(roomName)}
  const candidates=[...sfuNodes.values()].filter(sfuNodeOnline).sort((a,b)=>sfuNodeScore(a)-sfuNodeScore(b)||a.id.localeCompare(b.id));
  const node=candidates[0]||null;
  if(node)roomNodeMap.set(roomName,node.id);
  return node;
}
function sfuSendTo(node,payload){
  if(!sfuNodeOnline(node))return false;
  try{node.ws.send(JSON.stringify(payload));return true}catch{return false}
}
function routeSfuMessage(msg){
  if(!msg?.clientId)return;
  if(msg.event)io.to(msg.clientId).emit('media:event',msg);
  else io.to(msg.clientId).emit('media:response',msg);
}
async function pollSfuHealth(node){
  try{
    const u=new URL(node.url);u.protocol=u.protocol==='wss:'?'https:':'http:';u.pathname='/health';u.search='';u.hash='';
    const r=await fetch(u,{signal:AbortSignal.timeout(3500)});
    const h=await r.json();
    if(!r.ok||!h?.ok)throw new Error('health failed');
    node.health=h;node.lastSeen=Date.now();node.nodeId=String(h.nodeId||node.id);
  }catch{node.lastSeen=0}
}
function scheduleSfuReconnect(node){
  clearTimeout(node.reconnectTimer);
  node.reconnectTimer=setTimeout(()=>connectSfuNode(node),3000);
  node.reconnectTimer.unref?.();
}
function connectSfuNode(node){
  if(!node?.url||!SFU_BRIDGE_SECRET)return;
  if(node.ws?.readyState===WebSocket.OPEN||node.ws?.readyState===WebSocket.CONNECTING)return;
  try{
    node.ws=new WebSocket(node.url,{handshakeTimeout:7000,headers:{'X-SFU-Bridge-Secret':SFU_BRIDGE_SECRET}});
    node.ws.on('open',async()=>{
      node.connectedAt=new Date();node.lastSeen=Date.now();
      await pollSfuHealth(node);
      console.log('SFU node ulandi:',node.id,node.url);
      io.emit('media:bridge',{online:true,nodes:[...sfuNodes.values()].filter(sfuNodeOnline).length});
    });
    node.ws.on('message',raw=>{try{routeSfuMessage(JSON.parse(String(raw)))}catch{}});
    node.ws.on('close',()=>{
      node.connectedAt=null;node.lastSeen=0;
      for(const [room,nodeId] of roomNodeMap)if(nodeId===node.id)roomNodeMap.delete(room);
      for(const [client,nodeId] of [...clientNodeMap])if(nodeId===node.id){
        io.to(client).emit('media:reconnect-required',{reason:'sfu-node-offline',nodeId:node.id});
        clientNodeMap.delete(client);clientRoomMap.delete(client);
      }
      io.emit('media:bridge',{online:[...sfuNodes.values()].some(sfuNodeOnline),nodes:[...sfuNodes.values()].filter(sfuNodeOnline).length});
      scheduleSfuReconnect(node);
    });
    node.ws.on('error',()=>{});
  }catch{scheduleSfuReconnect(node)}
}
function initSfuCluster(){
  SFU_BRIDGE_URLS.forEach((url,index)=>{
    const id='sfu-'+String(index+1).padStart(2,'0');
    const node={id,url,ws:null,health:null,lastSeen:0,connectedAt:null,reconnectTimer:null};
    sfuNodes.set(id,node);connectSfuNode(node);
  });
  const timer=setInterval(()=>{for(const node of sfuNodes.values())if(sfuNodeOnline(node))pollSfuHealth(node);else connectSfuNode(node)},SFU_HEALTH_POLL_MS);
  timer.unref?.();
}
function sfuClusterStatus(){
  const nodes=[...sfuNodes.values()].map(n=>({id:n.id,nodeId:n.nodeId||n.id,url:n.url,online:sfuNodeOnline(n),connectedAt:n.connectedAt,score:sfuNodeScore(n),health:n.health?{workers:n.health.workers,rooms:n.health.rooms,peers:n.health.peers,loadavg:n.health.loadavg,capacity:n.health.capacity,rtcPorts:n.health.rtcPorts}:null}));
  return {online:nodes.some(n=>n.online),healthyNodes:nodes.filter(n=>n.online).length,totalNodes:nodes.length,roomsPinned:roomNodeMap.size,clientsPinned:clientNodeMap.size,nodes};
}
app.get('/api/media/status',auth,async(req,res)=>{
  if(!['superadmin','admin','tech'].includes(req.user.role)&&!hasPermission(req.user,'lessons.monitor'))return res.status(403).json({message:'Ruxsat yo‘q'});
  res.json({provider:'mediasoup',cluster:sfuClusterStatus(),turnEnabled:Boolean(mediaIceServers().length)});
});

io.use(async(socket,next)=>{ try { const token=readCookie(socket.handshake.headers.cookie,sessionCookie)||socket.handshake.auth?.token;const data=jwt.verify(token,JWT_SECRET); socket.user=data.id==='demo'?demoAdmin:await User.findById(data.id).lean(); if(!socket.user?.active||data.id!=='demo'&&Number(data.sv||0)!==Number(socket.user.sessionVersion||0)) throw new Error(); next(); } catch { next(new Error('unauthorized')); } });
io.on('connection', socket => { const uid=String(socket.user._id);onlineUsers.set(uid,(onlineUsers.get(uid)||0)+1);io.emit('presence:count',{online:onlineUsers.size});socket.emit('media:bridge',{online:[...sfuNodes.values()].some(sfuNodeOnline),nodes:[...sfuNodes.values()].filter(sfuNodeOnline).length});socket.on('media:request',msg=>{const id=String(msg?.id||'');if(!id)return;const method=String(msg?.method||''),data=msg?.data||{};let node=null;if(method==='join'){try{const payload=jwt.verify(String(data.ticket||''),JWT_SECRET,{issuer:'masofaviy2',audience:'masofaviy2-sfu'});node=pickSfuNode(String(payload.roomName||''));if(node){clientNodeMap.set(socket.id,node.id);clientRoomMap.set(socket.id,String(payload.roomName||''))}}catch{}}else{const nodeId=clientNodeMap.get(socket.id);if(nodeId)node=sfuNodes.get(nodeId)}if(!node||!sfuSendTo(node,{clientId:socket.id,id,method,data}))socket.emit('media:response',{clientId:socket.id,id,ok:false,error:'Universitet media klasterida sog‘lom SFU node topilmadi'});}); socket.on('lesson:join', async({lessonId})=>{ try{if(!mongoose.isValidObjectId(lessonId))return socket.emit('lesson:error',{message:'Dars ID noto‘g‘ri'});const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return socket.emit('lesson:error',{message:'Dars topilmadi'});if(lesson.kind==='final_exam')return socket.emit('lesson:error',{message:'Yakuniy nazorat jonli xonada o‘tkazilmaydi'});let allowed=String(lesson.teacherId)===String(socket.user._id);if(hasPermission(socket.user,'lessons.support'))allowed=true;else if(hasPermission(socket.user,'lessons.monitor')){if(GLOBAL_SCOPE_ROLES.has(socket.user.role))allowed=true;else{try{const scope=await resolveScope(socket.user,{});allowed=scope.groupIds.some(id=>String(id)===String(lesson.groupId))}catch{allowed=false}}}if(socket.user.role==='student'){const gid=await resolveUserGroupId(socket.user);allowed=String(gid||'')===String(lesson.groupId)}if(!allowed)return socket.emit('lesson:error',{message:'Bu darsga kirish huquqi yo‘q'});socket.join('lesson:'+lessonId);const now=new Date(),dateKey=localDateKey(now),late=localWeekday(now)===lesson.weekday&&localMinuteOfDay(now)>timeToMinutes(lesson.start)+LATE_AFTER_MINUTES;let row=await Attendance.findOne({lessonId:String(lessonId),userId:socket.user._id,dateKey}).sort({createdAt:1});if(!row)row=await Attendance.create({lessonId:String(lessonId),userId:socket.user._id,dateKey,joinedAt:now,lastJoinedAt:now,status:late?'late':'present',minutes:0,reconnectCount:0});else{row.leftAt=null;row.lastJoinedAt=now;row.reconnectCount=(row.reconnectCount||0)+1;if(late&&row.status==='present')row.status='late';await row.save()}socket.data.attendanceId=row.id;socket.data.attendanceSessionStartedAt=now;io.to('lesson:'+lessonId).emit('lesson:presence',{userId:socket.user._id,fullName:socket.user.fullName,state:'joined',status:row.status})}catch{socket.emit('lesson:error',{message:'Darsga ulanishda xatolik'})} }); socket.on('mic:permission-request',async({lessonId})=>{
  try{
    if(socket.user.role!=='student'||!mongoose.isValidObjectId(lessonId)||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    for(const s of lessonRoomSockets(lessonId)){
      if(String(s.user?._id)===String(lesson.teacherId)||hasPermission(s.user,'live.manage'))s.emit('mic:permission-request',{lessonId,userId:String(socket.user._id),fullName:socket.user.fullName,login:socket.user.login});
    }
  }catch{}
});
socket.on('mic:permission-response',async({lessonId,userId,approved})=>{
  try{
    if(!mongoose.isValidObjectId(lessonId)||!mongoose.isValidObjectId(userId)||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    if(String(socket.user._id)!==String(lesson.teacherId)&&!hasPermission(socket.user,'live.manage'))return;
    for(const s of lessonRoomSockets(lessonId))if(String(s.user?._id)===String(userId))s.emit('mic:permission-result',{lessonId,approved:Boolean(approved),teacherName:socket.user.fullName});
  }catch{}
});
socket.on('mic:request-enable',async({lessonId,userId})=>{
  try{
    if(!mongoose.isValidObjectId(lessonId)||!mongoose.isValidObjectId(userId)||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    if(String(socket.user._id)!==String(lesson.teacherId)&&!hasPermission(socket.user,'live.manage'))return;
    for(const s of lessonRoomSockets(lessonId))if(String(s.user?._id)===String(userId))s.emit('mic:enable-request',{lessonId,teacherName:socket.user.fullName});
  }catch{}
});
socket.on('mic:enable-result',async({lessonId,accepted})=>{
  try{
    if(socket.user.role!=='student'||!mongoose.isValidObjectId(lessonId)||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    for(const s of lessonRoomSockets(lessonId))if(String(s.user?._id)===String(lesson.teacherId)||hasPermission(s.user,'live.manage'))s.emit('mic:student-result',{lessonId,userId:String(socket.user._id),fullName:socket.user.fullName,accepted:Boolean(accepted)});
  }catch{}
});
socket.on('camera:request-enable',async({lessonId,userId})=>{
  try{
    if(!mongoose.isValidObjectId(lessonId)||!mongoose.isValidObjectId(userId)||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    if(String(socket.user._id)!==String(lesson.teacherId)&&!hasPermission(socket.user,'live.manage'))return;
    for(const s of lessonRoomSockets(lessonId))if(String(s.user?._id)===String(userId))s.emit('camera:enable-request',{lessonId,teacherName:socket.user.fullName});
  }catch{}
});
socket.on('camera:enable-result',async({lessonId,accepted})=>{
  try{
    if(socket.user.role!=='student'||!mongoose.isValidObjectId(lessonId)||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    for(const s of lessonRoomSockets(lessonId))if(String(s.user?._id)===String(lesson.teacherId)||hasPermission(s.user,'live.manage'))s.emit('camera:student-result',{lessonId,userId:String(socket.user._id),fullName:socket.user.fullName,accepted:Boolean(accepted)});
  }catch{}
});
socket.on('lesson:caption',({lessonId,text,lang,final})=>{
  const clean=String(text||'').trim().replace(/\s+/g,' ').slice(0,260),language=['uz-UZ','ru-RU','en-US'].includes(lang)?lang:'uz-UZ';
  if(clean&&mongoose.isValidObjectId(lessonId)&&socket.rooms.has('lesson:'+lessonId)){
    io.to('lesson:'+lessonId).emit('lesson:caption',{lessonId,userId:String(socket.user._id),fullName:socket.user.fullName,text:clean,lang:language,final:Boolean(final),at:Date.now()});
  }
});
socket.on('lesson:chat', ({lessonId,text})=>{ const clean=String(text||'').trim().slice(0,1000); if(clean&&socket.rooms.has('lesson:'+lessonId)) io.to('lesson:'+lessonId).emit('lesson:chat',{id:crypto.randomUUID(),userId:socket.user._id,fullName:socket.user.fullName,text:clean,at:new Date().toISOString()}); });
socket.on('lesson:raise-hand',({lessonId,raised=true})=>{
  if(!lessonId||!socket.rooms.has('lesson:'+lessonId))return;
  io.to('lesson:'+lessonId).emit('lesson:raise-hand',{lessonId,userId:String(socket.user._id),fullName:socket.user.fullName,login:socket.user.login,raised:Boolean(raised),at:Date.now()});
});
socket.on('lesson:reaction',({lessonId,reaction})=>{
  const allowed=new Set(['👍','👏','✋','❤️','😂']),r=String(reaction||'');
  if(!lessonId||!allowed.has(r)||!socket.rooms.has('lesson:'+lessonId))return;
  io.to('lesson:'+lessonId).emit('lesson:reaction',{lessonId,userId:String(socket.user._id),fullName:socket.user.fullName,reaction:r,at:Date.now()});
});
socket.on('lesson:spotlight',async({lessonId,userId})=>{
  try{
    if(!lessonId||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    if(String(socket.user._id)!==String(lesson.teacherId)&&!hasPermission(socket.user,'live.manage'))return;
    io.to('lesson:'+lessonId).emit('lesson:spotlight',{lessonId,userId:String(userId||''),by:String(socket.user._id),at:Date.now()});
  }catch{}
});
socket.on('lesson:mute-all',async({lessonId})=>{
  try{
    if(!lessonId||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    if(String(socket.user._id)!==String(lesson.teacherId)&&!hasPermission(socket.user,'live.manage'))return;
    for(const s of lessonRoomSockets(lessonId))if(s.user?.role==='student')s.emit('lesson:force-mute',{lessonId,by:socket.user.fullName});
  }catch{}
});
socket.on('lesson:camera-off-all',async({lessonId})=>{
  try{
    if(!lessonId||!socket.rooms.has('lesson:'+lessonId))return;
    const lesson=await Schedule.findById(lessonId).lean();if(!lesson)return;
    if(String(socket.user._id)!==String(lesson.teacherId)&&!hasPermission(socket.user,'live.manage'))return;
    for(const s of lessonRoomSockets(lessonId))if(s.user?.role==='student')s.emit('lesson:force-camera-off',{lessonId,by:socket.user.fullName});
  }catch{}
});
socket.on('lesson:leave', async({lessonId})=>{ try{if(lessonId)socket.leave('lesson:'+lessonId);if(socket.data.attendanceId){const row=await Attendance.findById(socket.data.attendanceId);if(row&&!row.leftAt){row.leftAt=new Date();const sessionStart=socket.data.attendanceSessionStartedAt||row.joinedAt;row.minutes=(row.minutes||0)+Math.max(1,Math.round((row.leftAt-sessionStart)/60000));await row.save()}socket.data.attendanceId=null;socket.data.attendanceSessionStartedAt=null}if(lessonId)io.to('lesson:'+lessonId).emit('lesson:presence',{userId:socket.user._id,fullName:socket.user.fullName,state:'left'})}catch{} });
socket.on('disconnect', async()=>{
  const oldNodeId=clientNodeMap.get(socket.id),oldRoom=clientRoomMap.get(socket.id);
  const oldNode=oldNodeId?sfuNodes.get(oldNodeId):null;
  if(oldNode)sfuSendTo(oldNode,{clientId:socket.id,id:'disconnect-'+Date.now(),method:'leave',data:{}});
  clientNodeMap.delete(socket.id);clientRoomMap.delete(socket.id);
  if(oldRoom)setTimeout(()=>{if(![...clientRoomMap.values()].includes(oldRoom))roomNodeMap.delete(oldRoom)},30000).unref?.();const left=(onlineUsers.get(uid)||1)-1;if(left<=0)onlineUsers.delete(uid);else onlineUsers.set(uid,left);io.emit('presence:count',{online:onlineUsers.size});if(mongoose.isValidObjectId(socket.user._id))User.findByIdAndUpdate(socket.user._id,{lastSeenAt:new Date()}).catch(()=>{});if(socket.data.attendanceId){const row=await Attendance.findById(socket.data.attendanceId);if(row&&!row.leftAt){row.leftAt=new Date();const sessionStart=socket.data.attendanceSessionStartedAt||row.joinedAt;row.minutes=(row.minutes||0)+Math.max(1,Math.round((row.leftAt-sessionStart)/60000));await row.save()}} }); });

async function ensureQdtuTestAccounts(){
  const groups=await Structure.find({type:'group',active:true,externalId:/^QDTU-MT-2026-/}).sort({externalId:1}).lean();
  if(groups.length<12)return;
  const teacherSeeds=[
    ['QDTU-T-001','azizbek.karimov','Azizbek Karimov','Azizbek.Karimov2026!'],
    ['QDTU-T-002','dilshod.raximov','Dilshod Raximov','Dilshod.Raximov2026!'],
    ['QDTU-T-003','mohira.ergasheva','Mohira Ergasheva','Mohira.Ergasheva2026!'],
    ['QDTU-T-004','shahnoza.aliyeva','Shahnoza Aliyeva','Shahnoza.Aliyeva2026!'],
    ['QDTU-T-005','javohir.xasanov','Javohir Xasanov','Javohir.Xasanov2026!'],
    ['QDTU-T-006','madina.jorayeva','Madina Jo‘rayeva','Madina.Jo‘rayeva2026!'],
    ['QDTU-T-007','sardor.qodirov','Sardor Qodirov','Sardor.Qodirov2026!'],
    ['QDTU-T-008','nodira.toxtayeva','Nodira To‘xtayeva','Nodira.To‘xtayeva2026!'],
    ['QDTU-T-009','bekzod.mamatqulov','Bekzod Mamatqulov','Bekzod.Mamatqulov2026!'],
    ['QDTU-T-010','nilufar.ismoilova','Nilufar Ismoilova','Nilufar.Ismoilova2026!']
  ];
  for(const [externalId,login,fullName,password] of teacherSeeds){
    if(!await User.exists({externalId}))await User.create({externalId,login,fullName,role:'teacher',passwordHash:await bcrypt.hash(password,11),active:true,mustChangePassword:false,permissions:[],deniedPermissions:[]});
  }
  const first=['Azizbek','Diyorbek','Jasurbek','Sherzod','Bekzod','Sardor','Asadbek','Shoxrux','Umid','Akmal','Mohira','Madina','Nilufar','Shahnoza','Dilnoza','Malika','Sevara','Zarina','Gulnoza','Nodira'];
  const last=['Aliyev','Karimov','Raximov','Xasanov','Qodirov','Mamatqulov','Ismoilov','Tursunov','Ergashev','Jo‘rayev','Sodiqov','Nazarov'];
  let n=0;
  for(const g of groups){
    const count=/DI-01$/.test(g.externalId)?50:10;
    const dep=g.parentId?await Structure.findById(g.parentId).lean():null,fac=dep?.parentId?await Structure.findById(dep.parentId).lean():null;
    for(let j=0;j<count;j++,n++){
      const fn=first[n%first.length],ln=last[Math.floor(n/first.length)%last.length],seq=String(j+1).padStart(2,'0');
      const key=String(g.code||g.externalId).toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,12);
      const login=(fn+'.'+ln+'.'+key+seq).toLowerCase().replace(/[‘’']/g,'');
      const externalId='QDTU-S-'+String(n+1).padStart(4,'0');
      if(await User.exists({externalId}))continue;
      await User.create({externalId,login,fullName:fn+' '+ln,role:'student',passwordHash:await bcrypt.hash(fn+'.'+ln+'2026!',11),active:true,mustChangePassword:false,permissions:[],deniedPermissions:[],faculty:fac?.name||'',department:dep?.name||'',group:g.name,facultyId:fac?._id,departmentId:dep?._id,groupId:g._id,courseYear:1,direction:String(g.name||'').replace(/\s+—\s+.*$/,'')});
    }
  }
  console.log('QDTU test akkauntlari tayyor:',await User.countDocuments({externalId:/^QDTU-(T|S)-/}));
}

async function bootstrap(){
  if(process.env.NODE_ENV==='production'&&!process.env.JWT_SECRET)throw new Error('Production uchun JWT_SECRET majburiy');
  if(process.env.NODE_ENV==='production'&&SFU_BRIDGE_URL&&SFU_BRIDGE_SECRET.length<32)throw new Error('SFU_BRIDGE_URL uchun 32+ belgili SFU_BRIDGE_SECRET majburiy');
  initSfuCluster();
  if(process.env.NODE_ENV==='production'&&!process.env.ADMIN_PASSWORD)throw new Error('Production uchun ADMIN_PASSWORD majburiy');
  server.listen(PORT,'0.0.0.0',()=>console.log(`Masofaviy2 :${PORT}`));
  if(!process.env.MONGODB_URI){if(process.env.NODE_ENV==='production')throw new Error('Production uchun MONGODB_URI majburiy');console.warn('MONGODB_URI yo‘q: taqdimot rejimi ishga tushdi');return}
  try{
    await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
    const login=(process.env.ADMIN_LOGIN||'admin').toLowerCase();
    const adminPassword=process.env.ADMIN_PASSWORD||'ChangeMe123!';
    if(!await User.exists({login})){
      await User.create({login,fullName:'Bosh administrator',role:'superadmin',passwordHash:await bcrypt.hash(adminPassword,11),mustChangePassword:false,active:true});
    }
    console.log('MongoDB ulandi');
    await ensureQdtuTestAccounts();
    const attendanceTimer=setInterval(()=>attendanceSweep().catch(()=>{}),60000);attendanceTimer.unref?.();
  }catch(err){if(process.env.NODE_ENV==='production')throw err;console.error('MongoDB ulanmagan, taqdimot rejimi:',err.message)}
}
bootstrap().catch(err=>{console.error('Ishga tushirish to‘xtatildi:',err.message);process.exit(1)});
