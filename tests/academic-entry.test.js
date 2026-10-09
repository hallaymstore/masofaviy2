import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseQuizRows,validateQuizQuestions} from '../public/quiz-composer.js';
const load=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const server=load('server.js'),lms=load('lms.js'),app=load('public/app.js'),entry=load('public/academic-entry-wizard.js'),sw=load('public/sw.js');
test('easy form accepts MCQ with selected correct response',()=>{
 const data=validateQuizQuestions([{prompt:'O‘zbekiston poytaxti?',options:['Toshkent','Buxoro','Samarqand'],correctIndex:0}]);
 assert.equal(data[0].correctIndex,0);assert.equal(data[0].options.length,3);
 assert.throws(()=>validateQuizQuestions([{prompt:'Savol?',options:['A','','C'],correctIndex:1}]));
 assert.throws(()=>validateQuizQuestions([{prompt:'Savol?',options:['A','B'],correctIndex:-1}]));
});
test('user can import questions as table or text without manually writing JSON',()=>{
 const rows=parseQuizRows('Poytaxt qayerda? | Toshkent | Qarshi | 1\n1+1 necha? | 1 | 2 | 2');
 assert.deepEqual(rows.map(r=>r.correctIndex),[0,1]);
 assert.throws(()=>parseQuizRows('Noto‘g‘ri|A|B|5'));
 const text=load('public/quiz-composer.js');
 for(const token of ['quizAddQuestion','quiz-import','quizImportRows','quiz-duplicate','quiz-remove','quiz-option-correct','quizFileInput'])assert.ok(text.includes(token),token);
 assert.ok(app.includes('openQuizComposer({modal,api,courseId:id'));
 assert.ok(!app.includes('questionsJson'));
});
test('new subject catalog is restricted to managers but readable for dropdowns',()=>{
 for(const role of ['superadmin','admin','tech','rectorate','dean','department','tutor'])assert.ok(lms.includes("'"+role+"'"));
 assert.ok(lms.includes("app.get('/api/lms/subjects',auth"));
 assert.ok(lms.includes("app.post('/api/lms/subjects',auth"));
 assert.ok(lms.includes("contentManagers.has(req.user.role)"));
 assert.ok(lms.includes('subjectId'));
 assert.ok(lms.includes('groupOversight(req.user,groupId)'));
 assert.ok(lms.includes("app.get('/api/lms/setup-options',auth"));
});
test('schedule draws subject group teacher and topic from stored course relations',()=>{
 assert.ok(entry.includes("api('/lms/courses')"));
 assert.ok(entry.includes("api('/lms/setup-options')"));
 assert.ok(entry.includes("api('/lms/course-topics/'"));
 assert.ok(entry.includes("name=\"courseId\""));
 assert.ok(entry.includes("name=\"topicId\""));
 assert.ok(server.includes('course?.groupId||req.body.groupId'));
 assert.ok(server.includes('course?.teacherId||req.body.teacherId'));
 assert.ok(server.includes('topic?.topicTitle||topic?.title||course.title'));
 assert.ok(server.includes('courseId:course?._id'));
});
test('management input buttons are available, teacher and student cannot create catalog',()=>{
 assert.ok(app.includes('academicEntryWizard.addSubject()'));
 assert.ok(load('public/index.html').includes('O‘qituvchiga fan biriktirish'));
 assert.ok(entry.includes('setTimeout(()=>addCourse(),60)'));
 assert.ok(app.includes('1. + Yangi fan nomini kiritish'));
 assert.ok(app.includes('academicEntryWizard.addCourse()'));
 assert.ok(app.includes('academicEntryWizard.addSchedule()'));
 assert.ok(app.includes("['superadmin','admin','tech','rectorate','dean','department','tutor'].includes"));
 assert.ok(sw.includes('/academic-entry-wizard.js'));
 assert.ok(sw.includes('/quiz-composer.js'));
});
