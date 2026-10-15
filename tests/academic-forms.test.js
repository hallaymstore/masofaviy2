import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import {installAcademicForms} from '../academic-forms.js';
import {fakeModel,matches} from './helpers/fake-models.js';
import {validateBells,cleanSessions,sessionBlocked,checkinCode,slotAt,verifyCheckin,checkinStatus,lessonMode,DEFAULT_BELLS,CHECKIN_SLOT_MS,attendanceRate} from '../education-forms.js';

const oid=()=>new mongoose.Types.ObjectId();
function fakeAttendance(){
  const rows=[];
  function A(doc){Object.assign(this,{_id:oid(),...doc})}
  A.prototype.save=async function(){const i=rows.findIndex(r=>String(r._id)===String(this._id));const plain={...this};if(i>=0)rows[i]=plain;else rows.push(plain);return this};
  A.rows=rows;
  const q=list=>({select(){return this},sort(){return this},lean(){return Promise.resolve(list.map(r=>({...r})))},then(a,b){return Promise.resolve(list.map(r=>({...r}))).then(a,b)}});
  A.find=query=>q(rows.filter(r=>matches(r,query)));
  A.findOne=query=>{const r=rows.find(x=>matches(x,query));const p=Promise.resolve(r?Object.assign(new A({}),r):null);return {sort(){return this},then:(a,b)=>p.then(a,b)}};
  return A;
}
async function setup(){
  const clock={ms:Date.parse('2026-10-15T05:05:00Z'),min:10*60+5};
  const F={_id:oid(),type:'faculty',name:'F',active:true},K={_id:oid(),type:'department',name:'K',parentId:F._id,active:true};
  const G1={_id:oid(),type:'group',name:'DI-01',parentId:K._id,active:true,educationForm:'kunduzgi'};
  const G2={_id:oid(),type:'group',name:'SI-21',parentId:K._id,active:true,educationForm:'sirtqi',sessions:[{name:'Bahorgi',from:'2026-03-01',to:'2026-03-20'}]};
  const G3={_id:oid(),type:'group',name:'SI-22',parentId:K._id,active:true,educationForm:'sirtqi',sessions:[{name:'Kuzgi',from:'2026-10-10',to:'2026-10-25'}]};
  const G4={_id:oid(),type:'group',name:'KE-11',parentId:K._id,active:true,educationForm:'kechki'};
  const Structure=fakeModel();Structure.rows.push(F,K,G1,G2,G3,G4);
  const User=fakeModel({active:true});
  const mk=(login,role,extra={})=>{const u={_id:oid(),login,fullName:login,role,active:true,...extra};User.rows.push(u);return u};
  const u={admin:mk('admin','admin'),dean:mk('dekan','dean'),teacher:mk('teacher','teacher'),other:mk('teacher2','teacher'),s1:mk('s1','student',{groupId:G1._id}),s2:mk('s2','student',{groupId:G1._id}),s3:mk('s3','student',{groupId:G3._id}),sx:mk('sx','student',{groupId:G4._id})};
  const Schedule=fakeModel();
  const L={_id:oid(),title:'Java',groupId:G1._id,teacherId:u.teacher._id,weekday:4,start:'10:00',end:'11:20',mode:'offline',kind:'lecture'};
  const Lonline={_id:oid(),title:'Online',groupId:G1._id,teacherId:u.teacher._id,weekday:4,start:'11:30',end:'12:50',liveEnabled:true,kind:'lecture'};
  const Lsirtqi_off={_id:oid(),title:'Off-session',groupId:G2._id,teacherId:u.teacher._id,weekday:4,start:'08:30',end:'09:50',mode:'offline',kind:'lecture'};
  const Lsirtqi_on={_id:oid(),title:'In-session',groupId:G3._id,teacherId:u.teacher._id,weekday:4,start:'08:30',end:'09:50',mode:'hybrid',kind:'lecture'};
  Schedule.rows.push(L,Lonline,Lsirtqi_off,Lsirtqi_on);
  const Attendance=fakeAttendance();
  const perms={admin:['*'],teacher:['attendance.manage'],dean:[],student:[]};
  const app=express();app.use(express.json());
  const auth=(req,res,next)=>{req.user=User.rows.find(x=>x.login===req.headers['x-u']);next()};
  const api=installAcademicForms(app,{mongoose,User,Structure,Schedule,Attendance,auth,hasPermission:(user,p)=>(perms[user.role]||[]).includes('*')||(perms[user.role]||[]).includes(p),
    resolveScope:async user=>{if(user.role==='dean')return {groupIds:[G1._id]};throw new Error('scope')},GLOBAL_SCOPE_ROLES:new Set(['admin','superadmin']),
    localDateKey:()=> '2026-10-15',localWeekday:()=>4,localMinuteOfDay:()=>clock.min,timeToMinutes:v=>{const [h,m]=String(v).split(':').map(Number);return h*60+m},LATE_AFTER_MINUTES:10,
    models:{EduSetting:fakeModel()},now:()=>clock.ms});
  await api.refreshGate();
  const server=await new Promise(r=>{const s=app.listen(0,()=>r(s))});const base='http://127.0.0.1:'+server.address().port;
  const call=async(who,method,path,body)=>{const r=await fetch(base+path,{method,headers:{'x-u':who,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)}};
  return {u,G1,G2,G3,L,Lonline,Lsirtqi_off,Lsirtqi_on,Attendance,api,call,clock,close:()=>server.close()};
}

test('rules: bells, sessions, rotating code, lateness, legacy lesson mode',()=>{
 assert.deepEqual(validateBells({}).kechki,DEFAULT_BELLS.kechki);
 assert.throws(()=>validateBells({kunduzgi:[['08:30','09:50'],['09:30','10:40']]}),/ustma-ust/);
 assert.throws(()=>cleanSessions([{name:'X',from:'2026-10-20',to:'2026-10-01'}]),/oldin/);
 assert.equal(sessionBlocked({educationForm:'sirtqi',sessions:[{from:'2026-10-10',to:'2026-10-25'}]},'2026-11-01'),true);
 assert.equal(sessionBlocked({educationForm:'sirtqi',sessions:[]},'2026-11-01'),false,'no sessions defined: weekly as before');
 assert.equal(sessionBlocked({educationForm:'kunduzgi'},'2026-11-01'),false);
 const t=1_800_000_000_000,code=checkinCode('s',slotAt(t));assert.match(code,/^\d{6}$/);
 assert.ok(verifyCheckin('s',code,t+CHECKIN_SLOT_MS),'previous slot still accepted');
 assert.ok(!verifyCheckin('s',code,t+3*CHECKIN_SLOT_MS),'old codes expire');
 assert.equal(checkinStatus('10:00',605,10),'present');assert.equal(checkinStatus('10:00',611,10),'late');
 assert.equal(lessonMode({liveEnabled:false}),'offline');assert.equal(lessonMode({}),'online');assert.equal(lessonMode({mode:'hybrid'}),'hybrid');
 assert.equal(attendanceRate(0,0),null);assert.equal(attendanceRate(9,10),90);
});

test('API: overview per form honours sirtqi sessions and counts classroom attendance',async()=>{
 const t=await setup();try{
  assert.equal(t.api.lessonRunsOn(t.Lsirtqi_off,'2026-10-15'),false,'sirtqi group outside its session has no lessons');
  assert.equal(t.api.lessonRunsOn(t.Lsirtqi_on,'2026-10-15'),true);
  t.Attendance.rows.push({_id:oid(),lessonId:String(t.L._id),userId:t.u.s1._id,dateKey:'2026-10-15',status:'present'});
  const r=await t.call('admin','GET','/api/edu/overview');assert.equal(r.status,200);
  const f=Object.fromEntries(r.data.forms.map(x=>[x.key,x]));
  assert.equal(f.kunduzgi.lessonsToday,2);assert.equal(f.kunduzgi.startedLessons,1,'only lessons that already started count');assert.equal(f.kunduzgi.rate,50);
  assert.equal(f.sirtqi.lessonsToday,1,'off-session sirtqi lesson excluded');assert.equal(f.sirtqi.modes.hybrid,1);
  assert.equal(f.kechki.groups,1);assert.equal(r.data.sessions.find(s=>s.group==='SI-22').state,'active');assert.equal(r.data.sessions.find(s=>s.group==='SI-21').state,'none');
  assert.equal((await t.call('s1','GET','/api/edu/overview')).status,403);
  const dean=await t.call('dekan','GET','/api/edu/overview');assert.equal(dean.data.totals.groups,1,'dean sees only own scope');
 }finally{t.close()}
});

test('API: group settings are scoped and sessions validated',async()=>{
 const t=await setup();try{
  assert.equal((await t.call('dekan','PATCH','/api/edu/groups/'+t.G1._id,{educationForm:'kechki',shift:3,courseYear:2})).status,200);
  assert.equal((await t.call('dekan','PATCH','/api/edu/groups/'+t.G3._id,{educationForm:'kunduzgi'})).status,403,'other faculty group');
  assert.equal((await t.call('admin','PATCH','/api/edu/groups/'+t.G3._id,{sessions:[{name:'X',from:'2026-10-20',to:'2026-10-01'}]})).status,400);
  assert.equal((await t.call('admin','PATCH','/api/edu/groups/'+t.G3._id,{sessions:[{name:'Qishki',from:'2027-01-10',to:'2027-01-30'}]})).status,200);
  assert.equal(t.api.lessonRunsOn(t.Lsirtqi_on,'2026-10-15'),false,'gate refreshed after the change');
  const groups=(await t.call('admin','GET','/api/edu/groups')).data;assert.equal(groups.find(g=>g.name==='DI-01').educationForm,'kechki');
 }finally{t.close()}
});

test('API: classroom check-in with rotating code, roster and safeguards',async()=>{
 const t=await setup();try{
  assert.equal((await t.call('teacher','POST','/api/edu/lessons/'+t.Lonline._id+'/checkin/open',{})).status,400,'online lessons use the live room');
  assert.equal((await t.call('teacher2','POST','/api/edu/lessons/'+t.L._id+'/checkin/open',{})).status,403,'other teachers cannot open it');
  const w=(await t.call('teacher','POST','/api/edu/lessons/'+t.L._id+'/checkin/open',{minutes:15})).data;
  assert.equal(w.open,true);assert.match(w.code,/^\d{6}$/);
  const wrong=String((Number(w.code)+1)%1000000).padStart(6,'0');
  assert.equal((await t.call('s1','POST','/api/edu/checkin',{scheduleId:String(t.L._id),code:wrong})).status,400);
  let r=await t.call('s1','POST','/api/edu/checkin',{code:w.code});assert.equal(r.status,200);assert.equal(r.data.status,'present','typed code without lesson id finds the open lesson of the group');
  assert.equal((await t.call('s1','POST','/api/edu/checkin',{code:w.code})).data.already,true);
  assert.equal((await t.call('sx','POST','/api/edu/checkin',{scheduleId:String(t.L._id),code:w.code})).status,400,'a student of another group cannot use the code');
  t.clock.ms+=CHECKIN_SLOT_MS+2000;t.clock.min=10*60+15;
  r=await t.call('s2','POST','/api/edu/checkin',{scheduleId:String(t.L._id),code:w.code});assert.equal(r.data.status,'late','previous code accepted, after 10 min marked late');
  t.clock.ms+=3*CHECKIN_SLOT_MS;
  const stale=await t.call('s2','POST','/api/edu/checkin',{scheduleId:String(t.L._id),code:w.code});assert.equal(stale.status,400,'a code older than two slots is rejected');assert.match(stale.data.message,/eskirgan/);
  const roster=(await t.call('teacher','GET','/api/edu/lessons/'+t.L._id+'/roster')).data;
  assert.deepEqual(roster.students.map(s=>[s.login,s.status,s.method]),[['s1','present','qr'],['s2','late','qr']]);
  const live=(await t.call('teacher','GET','/api/edu/lessons/'+t.L._id+'/checkin')).data;assert.equal(live.count,2);
  await t.call('teacher','POST','/api/edu/lessons/'+t.L._id+'/checkin/close',{});
  assert.equal((await t.call('s1','POST','/api/edu/checkin',{code:'123456'})).status,404,'closed window');
  const mine=(await t.call('teacher','GET','/api/edu/my-lessons')).data;assert.equal(mine.find(l=>l.title==='Java').attended,2);
 }finally{t.close()}
});

test('API: bulk form change respects scope',async()=>{
 const t=await setup();try{
  const r=await t.call('dekan','PATCH','/api/edu/groups-bulk',{ids:[String(t.G1._id),String(t.G3._id)],educationForm:'kechki',shift:3});
  assert.equal(r.status,200);assert.equal(r.data.saved,1,'dean changes only groups in own scope');
  assert.equal((await t.call('dekan','PATCH','/api/edu/groups-bulk',{ids:[String(t.G3._id)],educationForm:'kechki'})).status,403);
  const all=(await t.call('admin','PATCH','/api/edu/groups-bulk',{ids:[String(t.G1._id),String(t.G3._id)],educationForm:'masofaviy'})).data;assert.equal(all.saved,2);
 }finally{t.close()}
});
