import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import {installInclusion} from '../inclusion.js';
import {fakeModel} from './helpers/fake-models.js';
import {cleanAccommodations,activeAccommodation,extendedMinutes,extraMs,personalDue,pauseGraceMs,cleanPrefs,normalizeSubtitles,subtitlesToText,transcriptToVtt,transcriptToText,teacherView,accommodationChips} from '../inclusion-rules.js';

const oid=()=>new mongoose.Types.ObjectId();

test('rules: accommodations, expiry, extra time, deadlines, prefs, subtitles',()=>{
  const acc=cleanAccommodations({extraTimePct:40,deadlineExtraDays:30,captions:'true',bogus:true});
  assert.equal(acc.extraTimePct,50,'snaps to an allowed step');
  assert.equal(acc.deadlineExtraDays,14,'capped');
  assert.equal(acc.captions,true);assert.equal(acc.bogus,undefined);
  assert.equal(activeAccommodation({status:'requested',accommodations:acc},'2026-10-16'),null,'only approved profiles act');
  assert.ok(activeAccommodation({status:'approved',accommodations:acc,validUntil:'2026-12-31'},'2026-10-16'));
  assert.equal(activeAccommodation({status:'approved',accommodations:acc,validUntil:'2026-10-01'},'2026-10-16'),null,'expired');
  assert.equal(extendedMinutes(30,50),45);assert.equal(extendedMinutes(25,25),32);assert.equal(extraMs(30,100),30*60000);
  assert.equal(personalDue('2026-10-10T18:00:00Z',3).toISOString(),'2026-10-13T18:00:00.000Z');assert.equal(personalDue(null,3),null);
  assert.equal(pauseGraceMs({restBreaks:true}),120000);assert.equal(pauseGraceMs(null),15000);
  const v=teacherView({status:'approved',needs:['hearing'],accommodations:acc,coordinatorNote:'secret',teacherNote:'Old qatorda'},'2026-10-16');
  assert.deepEqual(Object.keys(v).sort(),['chips','teacherNote','validUntil']);assert.ok(!JSON.stringify(v).includes('hearing')&&!JSON.stringify(v).includes('secret'));
  assert.ok(accommodationChips(acc).some(c=>c.label==='+50% vaqt'));
  const p=cleanPrefs({textScale:173,font:'dyslexic',contrast:'evil',reduceMotion:true,ttsRate:9,captionSize:5});
  assert.equal(p.textScale,175);assert.equal(p.font,'dyslexic');assert.equal(p.contrast,'none');assert.equal(p.ttsRate,2);assert.equal(p.captionSize,0);assert.equal(p.reduceMotion,true);
  const srt='1\r\n00:00:01,000 --> 00:00:03,500\r\nSalom, talabalar!\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\n<i>Bugun</i> integral\r\n';
  const n=normalizeSubtitles(srt);assert.match(n.vtt,/^WEBVTT/);assert.match(n.vtt,/00:00:01\.000 --> 00:00:03\.500/);assert.equal(n.cues,2);
  assert.equal(subtitlesToText(n.vtt),'Salom, talabalar!\nBugun integral');
  assert.throws(()=>normalizeSubtitles('just text'),/WebVTT|SRT/);
  const t0=Date.parse('2026-10-16T05:00:00Z'),lines=[{at:new Date(t0+1000),name:'Ustoz',text:'a --> b'},{at:new Date(t0+5000),name:'Ustoz',text:'x<y'}];
  const vtt=transcriptToVtt(lines,t0);assert.match(vtt,/00:00:01\.000 --> 00:00:05\.000\n<v Ustoz>a → b/);assert.ok(!vtt.includes('x<y'));
  assert.match(transcriptToText(lines,{title:'Fizika'}),/^Fizika\n\n\[\d\d:\d\d:\d\d\] Ustoz: a --> b/);
});

async function setup(){
  const F={_id:oid(),type:'faculty',name:'F',active:true},G1={_id:oid(),type:'group',name:'DI-01',parentId:F._id,active:true},G2={_id:oid(),type:'group',name:'DI-02',parentId:F._id,active:true};
  const Structure=fakeModel();Structure.rows.push(F,G1,G2);
  const User=fakeModel({active:true});
  const mk=(login,role,extra={})=>{const u={_id:oid(),login,fullName:login.toUpperCase(),role,active:true,...extra};User.rows.push(u);return u};
  const u={coord:mk('coord','staff',{permissions:['inclusion.manage']}),teacher:mk('teacher','teacher'),teacher2:mk('teacher2','teacher'),dean:mk('dean','dean'),
    terp:mk('terp','staff'),s1:mk('s1','student',{groupId:G1._id}),s2:mk('s2','student',{groupId:G1._id}),s3:mk('s3','student',{groupId:G2._id})};
  const Schedule=fakeModel();const L={_id:oid(),title:'Fizika',groupId:G1._id,teacherId:u.teacher._id,weekday:4,start:'10:00',end:'11:20'},L2={_id:oid(),title:'Kimyo',groupId:G2._id,teacherId:u.teacher2._id,weekday:4,start:'10:00',end:'11:20'};Schedule.rows.push(L,L2);
  const VideoLesson=fakeModel();const V={_id:oid(),title:'Integral',teacherId:u.teacher._id,groupIds:[G1._id],published:true,sourceType:'mp4'};VideoLesson.rows.push(V);
  const app=express();app.use(express.json());
  const auth=(req,res,next)=>{req.user=User.rows.find(x=>x.login===req.headers['x-u']);next()};
  const hasPermission=(user,p)=>(user.permissions||[]).includes(p)||(user.role==='admin'&&p!=='nothing');
  const api=installInclusion(app,{mongoose,User,Structure,Schedule,auth,hasPermission,
    resolveScope:async user=>{if(user.role==='dean')return {groupIds:[G1._id]};throw new Error('scope')},resolveUserGroupId:async x=>x.groupId,
    localDateKey:d=>new Date(d||Date.now()).toISOString().slice(0,10),localWeekday:()=>4,
    scheduleAccess:async(user,lesson)=>String(lesson.teacherId)===String(user._id),
    models:{InclusionProfile:fakeModel(),InclusionSupport:fakeModel(),LessonTranscript:fakeModel(),A11yPrefs:fakeModel(),VideoCaption:fakeModel(),VideoLesson},now:()=>Date.parse('2026-10-16T05:30:00Z')});
  const server=await new Promise(r=>{const s=app.listen(0,()=>r(s))});const base='http://127.0.0.1:'+server.address().port;
  const call=async(who,method,path,body)=>{const r=await fetch(base+path,{method,headers:{'x-u':who,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await r.text();let data=null;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data,type:r.headers.get('content-type')}};
  return {u,G1,G2,L,L2,V,api,call,close:()=>{api.stop();server.close()}};
}

test('accommodation request → decision; teachers see practical needs only, with consent',async()=>{
  const {u,L,api,call,close}=await setup();
  try{
    assert.equal((await call('teacher','POST','/api/inclusion/me/request',{needs:['hearing']})).status,403,'only students request');
    assert.equal((await call('s1','POST','/api/inclusion/me/request',{needs:[]})).status,400);
    const r=await call('s1','POST','/api/inclusion/me/request',{needs:['hearing','bogus'],accommodations:{captions:true,extraTimePct:50},message:'Eshitish apparati bilan'});
    assert.equal(r.status,201);assert.equal(r.data.status,'requested');
    assert.equal(await api.accommodationFor(u.s1._id),null,'nothing applies before approval');
    assert.equal((await call('teacher','GET','/api/inclusion/students')).status,403);
    assert.equal((await call('s2','GET','/api/inclusion/students/'+u.s1._id)).status,403,'students cannot read others');
    const pend=await call('coord','GET','/api/inclusion/students?status=pending');assert.equal(pend.data.rows.length,1);assert.equal(pend.data.rows[0].requestPending,true);
    const detail=await call('coord','GET','/api/inclusion/students/'+u.s1._id);assert.deepEqual(detail.data.profile.request.needs,['hearing']);
    assert.equal((await call('coord','PUT','/api/inclusion/students/'+u.s1._id,{status:'approved',accommodations:{}})).status,400,'approval needs an accommodation');
    const ok=await call('coord','PUT','/api/inclusion/students/'+u.s1._id,{status:'approved',needs:['hearing'],accommodations:{captions:true,extraTimePct:50,deadlineExtraDays:3},teacherNote:'Yuzingizni kameraga qarating',coordinatorNote:'VTEK 2-guruh',validUntil:'2027-06-30',documentChecked:true});
    assert.equal(ok.status,200);
    const acc=await api.accommodationFor(u.s1._id);assert.equal(acc.extraTimePct,50);assert.equal(acc.deadlineExtraDays,3);
    const me=await call('s1','GET','/api/inclusion/me');assert.equal(me.data.status,'approved');assert.equal(me.data.request.pending,false);assert.ok(!('coordinatorNote' in me.data),'internal note hidden from student');
    const t=await call('teacher','GET','/api/inclusion/my-students');assert.equal(t.data.rows.length,1);
    const row=JSON.stringify(t.data.rows[0]);assert.ok(row.includes('Subtitr')&&row.includes('kameraga'));assert.ok(!row.includes('hearing')&&!row.includes('VTEK'),'no diagnosis or internal notes');
    assert.equal((await call('teacher2','GET','/api/inclusion/my-students')).data.rows.length,0,'other groups');
    assert.equal((await call('dean','GET','/api/inclusion/students')).data.rows.length,1,'dean scoped list');
    const needs=await call('teacher','GET','/api/inclusion/lessons/'+L._id+'/needs');assert.equal(needs.data.captions,true);assert.equal(needs.data.students.length,1);
    assert.equal((await call('teacher2','GET','/api/inclusion/lessons/'+L._id+'/needs')).status,403);
    assert.equal((await call('s1','GET','/api/inclusion/lessons/'+L._id+'/needs')).data.self.captions,true);
    assert.equal((await call('s3','GET','/api/inclusion/lessons/'+L._id+'/needs')).status,403);
    await call('s1','PATCH','/api/inclusion/me/consent',{consentTeachers:false});
    const hidden=await call('teacher','GET','/api/inclusion/my-students');assert.equal(hidden.data.rows.length,0);assert.equal(hidden.data.hidden,1,'consent withdrawn: only a count');
    assert.equal((await call('teacher','GET','/api/inclusion/lessons/'+L._id+'/needs')).data.captions,true,'automation still works without disclosure');
    const ov=await call('coord','GET','/api/inclusion/overview');assert.equal(ov.data.active,1);assert.equal(ov.data.byNeed.hearing,1);assert.equal(ov.data.byAcc.captions,1);assert.equal(ov.data.captionGroups[0].students,1);
    assert.equal((await call('teacher','GET','/api/inclusion/overview')).status,403);
  }finally{close()}
});

test('support staff, transcripts, video subtitles and personal preferences',async()=>{
  const {u,G1,L,L2,V,api,call,close}=await setup();
  try{
    assert.equal((await call('teacher','POST','/api/inclusion/support',{userId:u.terp._id,kind:'sign',groupIds:[G1._id]})).status,403);
    assert.equal((await call('coord','POST','/api/inclusion/support',{userId:u.s2._id,kind:'sign',groupIds:[G1._id]})).status,400,'students cannot be support staff');
    assert.equal((await call('coord','POST','/api/inclusion/support',{userId:u.terp._id,kind:'sign',groupIds:[G1._id]})).status,201);
    assert.equal(await api.supportKindFor(u.terp._id,G1._id),'sign');assert.equal(await api.supportKindFor(u.terp._id,L2.groupId),'');
    const mine=await call('terp','GET','/api/inclusion/support/mine');assert.equal(mine.data.lessons.length,1);assert.equal(mine.data.lessons[0].title,'Fizika');
    assert.deepEqual((await call('s1','GET','/api/inclusion/me')).data.support.map(s=>s.kind),['sign']);
    assert.equal((await call('terp','GET','/api/inclusion/lessons/'+L._id+'/needs')).status,200,'interpreter sees the lesson needs');

    await api.recordCaption({scheduleId:L._id,user:u.teacher,text:'Bugun   integral\u0007 mavzusi',lang:'uz-UZ'});
    await api.recordCaption({scheduleId:L._id,user:u.teacher,text:'Birinchi misol',lang:'uz-UZ'});
    await api.recordCaption({scheduleId:L2._id,user:u.teacher2,text:'Boshqa guruh',lang:'uz-UZ'});
    const list=await call('s1','GET','/api/inclusion/transcripts');assert.equal(list.data.length,1);assert.equal(list.data[0].lines,2);
    assert.equal((await call('s3','GET','/api/inclusion/transcripts')).data.length,1,'own group only');
    assert.equal((await call('s3','GET','/api/inclusion/transcripts/'+list.data[0].id)).status,403);
    const live=await call('s1','GET','/api/inclusion/transcripts/live/'+L._id);assert.equal(live.data.lines[0].text,'Bugun integral mavzusi');
    const txt=await call('terp','GET','/api/inclusion/transcripts/'+list.data[0].id+'?format=txt');assert.equal(txt.status,200);assert.match(txt.data,/TEACHER: Birinchi misol/);
    const vtt=await call('teacher','GET','/api/inclusion/transcripts/'+list.data[0].id+'?format=vtt');assert.match(vtt.data,/^WEBVTT/);assert.match(vtt.type,/text\/vtt/);

    assert.equal((await call('teacher2','PUT','/api/inclusion/videos/'+V._id+'/captions',{text:'00:00:01,000 --> 00:00:02,000\nA'})).status,403);
    assert.equal((await call('teacher','PUT','/api/inclusion/videos/'+V._id+'/captions',{text:'1\n00:00:01,000 --> 00:00:02,000\nSalom\n'})).status,200);
    const cap=await call('s1','GET','/api/inclusion/videos/'+V._id+'/captions.vtt');assert.match(cap.data,/^WEBVTT[\s\S]*00:00:01\.000/);
    assert.equal((await call('s3','GET','/api/inclusion/videos/'+V._id+'/captions.vtt')).status,403,'video of another group');
    assert.equal((await call('s1','GET','/api/inclusion/videos/'+V._id+'/captions')).data.transcript,'Salom');
    const audit=await call('teacher','GET','/api/inclusion/audit');assert.equal(audit.data.summary.withCaptions,1);

    const saved=await call('s1','PUT','/api/a11y/prefs',{prefs:{textScale:150,font:'dyslexic',contrast:'yellow',colorFilter:'x'}});assert.equal(saved.data.saved,true);
    const got=await call('s1','GET','/api/a11y/prefs');assert.equal(got.data.prefs.textScale,150);assert.equal(got.data.prefs.contrast,'yellow');assert.equal(got.data.prefs.colorFilter,'none');
    const meta=await call('s1','GET','/api/inclusion/meta');assert.equal(meta.data.me.coordinator,false);assert.ok(meta.data.accommodations.length>10);
    assert.equal((await call('coord','GET','/api/inclusion/meta')).data.me.coordinator,true);
  }finally{close()}
});

test('accommodations are wired into tests, deadlines, live rooms and every page',async()=>{
  const fs=await import('node:fs');const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
  const lms=read('lms.js'),exams=read('remote-exams.js'),cw=read('coursework.js'),server=read('server.js'),html=read('public/index.html'),sw=read('public/sw.js'),sfu=read('media-server/server.js');
  assert.equal((lms.match(/extendedMinutes\(quiz\.durationMinutes,row\.extraTimePct\)/g)||[]).length,4,'quiz timer checks use the personal duration');
  assert.match(lms,/termination\.terminate&&row\.proctorRelaxed/);assert.match(lms,/personalDue\(assignment\.dueAt,acc\?\.deadlineExtraDays\)/);
  assert.match(exams,/deadlineOf\(e,a\)/);assert.match(exams,/!a\.proctorRelaxed&&/);assert.match(exams,/a\.pauseGraceMs/);
  assert.match(cw,/personalDue\(a\.dueAt,\(await accommodationFor\(req\.user\._id\)\)\?\.deadlineExtraDays\)/);
  assert.match(server,/inclusionApi\.supportKindFor\(user\._id,lesson\.groupId\)/,'interpreters may join their groups');
  assert.match(server,/inclusionApi\.recordCaption\(/,'captions become a transcript');
  assert.match(server,/role:'interpreter'/);assert.match(sfu,/role==='interpreter'\?210/);
  assert.ok(html.indexOf('/a11y-boot.js')<html.indexOf('rel="stylesheet"'),'settings applied before first paint');
  assert.match(html,/data-page="inclusion"/);assert.match(html,/id="toast" role="status" aria-live="polite"/);
  for(const f of ['/a11y.js','/inclusion-ui.js','/a11y-boot.js','/a11y.css'])assert.ok(sw.includes(f),f+' cached offline');
});
