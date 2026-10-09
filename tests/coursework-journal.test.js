import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeGradeScale,journalPeriod,journalCsv,buildJournal,safeCsvCell} from '../coursework-rules.js';
const backend=readFileSync(new URL('../coursework.js',import.meta.url),'utf8');
const lms=readFileSync(new URL('../lms.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const seed=readFileSync(new URL('../scripts/seed-coursework-demo.mjs',import.meta.url),'utf8');
const ID='507f1f77bcf86cd799439011';
const group={_id:ID,name:'DI-101',code:'DI101'};
const course={_id:ID,title:'Web dasturlash'};
const student={_id:ID,fullName:'=SUM(1+1) O‘quvchi',login:'student-001'};
test('four grading scales only and no cross-scale scores',()=>{
 for(const n of [2,5,10,100])assert.equal(normalizeGradeScale(n),n);
 for(const n of [0,3,4,7,50,101,'no'])assert.throws(()=>normalizeGradeScale(n));
 assert.ok(lms.includes('normalizeGradeScale(req.body.maxScore||100)'));
 assert.ok(lms.includes("score>assignment.maxScore"));
});
test('Uzbekistan weekly and monthly boundaries with invalid input rejection',()=>{
 const w=journalPeriod('week','2026-10-09');
 assert.equal(w.label,'2026-10-05');
 assert.equal(w.to.toISOString(),'2026-10-11T19:00:00.000Z');
 const m=journalPeriod('month','2026-10-09');
 assert.equal(m.label,'2026-10-01');
 assert.equal(m.to.toISOString(),'2026-10-31T19:00:00.000Z');
 assert.throws(()=>journalPeriod('year','2026-10-09'));
 assert.throws(()=>journalPeriod('week','2026-02-30'));
});
test('journal tracks absent, submitted, scored students and honest ungraded averages',()=>{
 const period=journalPeriod('week','2026-10-09');
 const a1={_id:'aa',title:'Nazariya',maxScore:5,createdAt:new Date('2026-10-07')};
 const a2={_id:'bb',title:'Amaliy',maxScore:100,createdAt:new Date('2026-10-08')};
 const other={_id:'507f1f77bcf86cd799439022',fullName:'Talaba 2',login:'student-002'};
 const result=buildJournal({group,course,students:[student,other],assignments:[a1,a2],submissions:[
  {assignmentId:'aa',studentId:ID,submittedAt:new Date('2026-10-08'),score:4,gradedAt:new Date('2026-10-08')},
  {assignmentId:'bb',studentId:ID,submittedAt:new Date('2026-10-08')}
 ],period});
 assert.equal(result.rows.length,2);assert.equal(result.columns.length,2);
 assert.equal(result.rows[0].marks[0].status,'graded');
 assert.equal(result.rows[0].marks[1].status,'submitted');
 assert.equal(result.rows[0].averagePercent,80);
 assert.equal(result.rows[1].averagePercent,null);
 assert.equal(result.stats.graded,1);
});
test('CSV exports are BOM protected, escape quotes and do not execute spreadsheet formulas',()=>{
 const result=buildJournal({group,course,students:[student],assignments:[],submissions:[],period:journalPeriod('week','2026-10-09')});
 const csv=journalCsv(result);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes("'=SUM(1+1)"));
 assert.equal(safeCsvCell('=2+3'),'"\'=2+3"');
 assert.equal(safeCsvCell('a"b'),'"a""b"');
});
test('group-scoped journal access and private file sharing are server-side, not only UI',()=>{
 assert.ok(backend.includes("String(await resolveUserGroupId(req.user))!==String(c.groupId)"));
 assert.ok(backend.includes("String(c.teacherId)!==String(req.user._id)"));
 assert.ok(backend.includes("same(req.user.facultyId,dept?.parentId)"));
 assert.ok(backend.includes("role==='rectorate'"));
 assert.ok(backend.includes("row.submissionId&&String(row.uploadedBy)!==String(req.user._id)"));
 assert.ok(backend.includes("req.query.format==='csv'"));
 assert.ok(backend.includes("User.find({role:'student',active:true,groupId:c.groupId})"));
});
test('assignment attachment uses existing authenticated GridFS controls and MIME validation',()=>{
 assert.ok(backend.includes('GridFSBucket'));
 assert.ok(backend.includes('checkResourceHeader(name,head)'));
 assert.ok(backend.includes('validateOfficePackage('));
 assert.ok(backend.includes("Content-Disposition"));
 assert.ok(backend.includes("MAX_COURSEWORK_FILE_MB"));
 assert.ok(backend.includes("pipeline(stream,dest)"));
});
test('teacher and oversight roles can open journal and weekly/monthly CSV UI',()=>{
 assert.ok(html.includes('id="courseworkJournalBoard"'));
 assert.ok(app.includes('createCourseworkUi('));
 assert.ok(app.includes("courses:['student','teacher','admin','superadmin','tech','rectorate','dean','department','tutor']"));
 assert.ok(readFileSync(new URL('../public/coursework-ui.js',import.meta.url),'utf8').includes("option value=\"month\""));
});
test('demo seed opt-in, isolated records and realistic assignments plus files',()=>{
 assert.ok(seed.includes("COURSEWORK_DEMO_SEED!=='I_UNDERSTAND'"));
 assert.ok(seed.includes("DEMO-JURNAL-2026"));
 assert.ok(seed.includes("$setOnInsert")===false);
 assert.ok(seed.includes("if(existing)return existing"));
 assert.ok(seed.includes("demo.jurnal."));
 assert.ok(seed.includes("gradedAt"));
 assert.ok(seed.includes("CourseworkFile")===false||seed.includes("courseworkfiles"));
});

test('teacher creates course only for a scheduled group; oversight scope enforced in LMS listing',()=>{
 const lm=readFileSync(new URL('../lms.js',import.meta.url),'utf8');
 const cw=readFileSync(new URL('../coursework.js',import.meta.url),'utf8');
 assert.ok(cw.includes("Schedule.exists({groupId:group._id,teacherId:req.user._id})"));
 assert.ok(cw.includes("req.user.role!=='teacher'"));
 assert.ok(lm.includes("const groupOversight=async(user,groupId)=>"));
 assert.ok(lm.includes("if(user.role==='tutor')return same(user.groupId,group._id)"));
 assert.ok(lm.includes("for(const row of rows)if(await groupOversight"));
});
