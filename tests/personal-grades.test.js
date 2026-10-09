import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {personalGradePeriod,buildPersonalGradebook,uzDay} from '../personal-grades.js';
const coursework=readFileSync(new URL('../coursework.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/personal-grades-ui.js',import.meta.url),'utf8');
const course={_id:'c1',title:'Statistika',active:true};
const assignment={_id:'a1',courseId:'c1',title:'O‘zaro bog‘lanishlar',maxScore:5,gradeScale:5,published:true};
const period=personalGradePeriod('week','2026-10-09');
test('week and month date ranges use Uzbekistan local calendar (UTC+05:00)',()=>{
 assert.equal(period.label,'2026-10-05');
 assert.equal(period.from.toISOString(),'2026-10-04T19:00:00.000Z');
 assert.equal(period.to.toISOString(),'2026-10-11T19:00:00.000Z');
 assert.equal(personalGradePeriod('month','2026-10-09').label,'2026-10-01');
 assert.equal(uzDay('2026-10-08T21:15:00Z'),'2026-10-09');
 assert.throws(()=>personalGradePeriod('year','2026-10-09'));
 assert.throws(()=>personalGradePeriod('week','2026-02-31'));
});
test('student sees graded result only if scored, pending remains ungraded and feedback private',()=>{
 const rows=[
  {assignmentId:'a1',studentId:'u1',submittedAt:'2026-10-07T09:00:00Z',score:4,gradedAt:'2026-10-08T21:15:00Z',feedback:'Yaxshi bajarilgan'},
  {assignmentId:'a2',studentId:'u1',submittedAt:'2026-10-09T09:00:00Z',score:null,gradedAt:null}
 ];
 const result=buildPersonalGradebook({courses:[course],assignments:[assignment,{_id:'a2',courseId:'c1',title:'Amaliy',maxScore:100,published:true}],submissions:rows,period});
 assert.equal(result.stats.graded,1);
 assert.equal(result.stats.pending,1);
 assert.equal(result.stats.averagePercent,80);
 assert.equal(result.rows[0].status,'pending');
 assert.equal(result.rows[0].score,null);
 assert.equal(result.rows[1].status,'graded');
 assert.equal(result.rows[1].date,'2026-10-09');
 assert.equal(result.rows[1].feedback,'Yaxshi bajarilgan');
});
test('personal grades are bounded by period, active group courses, and exclude invalid assignment references',()=>{
 const result=buildPersonalGradebook({courses:[course],assignments:[assignment],submissions:[
  {assignmentId:'a1',score:5,gradedAt:'2026-09-01T11:00:00Z',submittedAt:'2026-09-01T09:00:00Z'},
  {assignmentId:'not-in-group',score:5,gradedAt:'2026-10-08T13:00:00Z'}
 ],period});
 assert.equal(result.rows.length,0);
 assert.equal(result.stats.averagePercent,null);
});
test('backend allows ONLY logged in student to read own group grades; no arbitrary studentId accepted',()=>{
 const beginning=coursework.indexOf("app.get('/api/coursework/my-grades'");
 const ending=coursework.indexOf("app.get('/api/coursework/journals'",beginning);
 const route=coursework.slice(beginning,ending);
 assert.ok(beginning>0&&ending>beginning);
 assert.ok(route.includes("req.user.role!=='student'"));
 assert.ok(route.includes('resolveUserGroupId(req.user)'));
 assert.ok(route.includes('groupId:req.user')===false);
 assert.ok(route.includes('studentId:req.user._id'));
 assert.ok(route.includes('Course.find({active:true,groupId})'));
 assert.ok(route.includes('Cache-Control'));
 assert.ok(!route.includes('req.params.studentId'));
 assert.ok(!route.includes('req.query.studentId'));
});
test('distinct role-aware nav pages and timetable daily marks are present',()=>{
 assert.ok(html.includes('data-page="grades"'));
 assert.ok(html.includes('id="studentGradesPage"'));
 assert.ok(html.includes('id="teacherGradesPage"'));
 assert.ok(html.includes('id="studentScheduleGrades"'));
 assert.ok(app.includes("grades:loadGradePage"));
 assert.ok(app.includes("role==='student'?'Mening baholarim':'Elektron jurnal'"));
 assert.ok(app.includes("if(user?.role==='student')await personalGradesUi.schedule("));
 assert.ok(app.includes("courseworkUi.journals($('#teacherGradesPage'),user.role)"));
 assert.ok(ui.includes('o‘qituvchi baholagan sana'));
 assert.ok(ui.includes("filter(r=>r.status==='graded')"));
 assert.ok(ui.includes('Tekshirilmoqda'));
});
