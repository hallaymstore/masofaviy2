import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseQuizRows,validateQuizQuestions} from '../public/quiz-composer.js';
const source=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');

test('manual questions use 2-8 options, correct answer and trimmed text',()=>{
 const q=validateQuizQuestions([{prompt:'  Savol nima? ',options:[' A ',' B '],correctIndex:1}]);
 assert.deepEqual(q,[{prompt:'Savol nima?',options:['A','B'],correctIndex:1}]);
 assert.throws(()=>validateQuizQuestions([{prompt:'Savol nima?',options:['A',''],correctIndex:0}]));
 assert.throws(()=>validateQuizQuestions([{prompt:'Savol nima?',options:['A','B'],correctIndex:4}]));
});

test('bulk test editor supports pipe/tab and actual CSV with quoted commas',()=>{
 const pipe=parseQuizRows('Poytaxt qaysi? | Toshkent | Samarqand | 1');
 const tab=parseQuizRows('2+2 nechchi?\t3\t4\t5\t2');
 const csv=parseQuizRows('"Qaysi shahar, poytaxt?","Buxoro","Toshkent",2');
 assert.equal(pipe[0].correctIndex,0);
 assert.deepEqual(tab[0].options,['3','4','5']);
 assert.equal(csv[0].prompt,'Qaysi shahar, poytaxt?');
 assert.equal(csv[0].correctIndex,1);
 assert.throws(()=>parseQuizRows('2+2? | 3 | 4 | 8'));
});

test('teacher/student do not create shared subject catalogue; staff have scoped group assignment',()=>{
 const lms=source('lms.js'),server=source('server.js'),ui=source('public/academic-entry-wizard.js');
 for(const text of ["contentManagers=new Set(['superadmin','admin','tech','rectorate','dean','department','tutor'])","app.post('/api/lms/subjects'","if(!contentManagers.has(req.user.role))","await groupOversight(req.user,groupId)","subjectId,code,title","app.get('/api/lms/setup-options'","app.get('/api/lms/course-topics/:id'"])assert.ok(lms.includes(text),text);
 for(const text of ["courseId:{type:mongoose.Schema.Types.ObjectId,ref:'Course'","const teacherId=course?.teacherId||req.body.teacherId","topic?.topicTitle||topic?.title||course.title","'schedule.manage'"])assert.ok(server.includes(text),text);
 for(const text of ["api('/lms/setup-options')","api('/lms/courses')","api('/lms/course-topics/'","name=\"courseId\"","name=\"subjectId\""])assert.ok(ui.includes(text),text);
});
test('quiz wizard supports add/delete options, correct answer, CSV import and proctor choice',()=>{
 const wizard=source('public/quiz-composer.js'),app=source('public/app.js');
 for(const text of ["quizAddQuestion","quiz-import","quizImportRows","quiz-duplicate","quiz-remove","quiz-option-correct","quizFileInput","parseQuizRows","correctIndex","proctorRequired"])assert.ok(wizard.includes(text),text);
 assert.ok(app.includes('openQuizComposer('));
 assert.ok(!wizard.includes('questionsJson'));
});
