import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupCourseItems,coursePlanHtml} from '../public/course-plan-ui.js';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const e=s=>String(s??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const course={resources:[{_id:'r1',title:'PDF ma’ruza',kind:'document',fileId:'fid'},{_id:'r2',title:'Eski taqdimot',kind:'presentation',fileId:'file2'}],
 assignments:[{_id:'a1',title:'Mustaqil ish',instructions:'Ishni bajaring',category:'assignment'}],
 quizzes:[{_id:'q1',title:'Mavzu testi',proctorRequired:false}],
 videos:[{_id:'v1',title:'Video tushuntirish'}]};
const tree={topics:[{_id:'t2',title:'2-mavzu',position:1},{_id:'t1',title:'1-mavzu',position:0,description:'Kirish'}],
 links:[{topicId:'t1',itemType:'resource',itemId:'r1'},{topicId:'t1',itemType:'assignment',itemId:'a1'},
 {topicId:'t2',itemType:'quiz',itemId:'q1'},{topicId:'t2',itemType:'video',itemId:'v1'}]};
test('topics sort numerically; attached files, tasks, tests and videos remain inside their topic',()=>{
 const r=groupCourseItems(course,tree);
 assert.deepEqual(r.groups.map(t=>t.title),['1-mavzu','2-mavzu']);
 assert.deepEqual(r.groups[0].items.map(i=>i._id),['r1','a1']);
 assert.deepEqual(r.groups[1].items.map(i=>i._id),['q1','v1']);
 assert.deepEqual(r.unassigned.map(i=>i._id),['r2']);
});
test('legacy uploads are safely shown in an unassigned section',()=>{
 const r=groupCourseItems(course,{topics:[],links:[]});
 assert.equal(r.unassigned.length,5);
 const html=coursePlanHtml(course,{topics:[],links:[]},{editor:true,student:false,esc:e});
 assert.ok(html.includes('Mavzuga biriktirilmaganlar'));
 assert.ok(html.includes('Hozircha dars mavzulari yo‘q'));
 assert.ok(html.includes('Yangi mavzu'));
});
test('topic editor has single add menu, order controls, safe movement, target selectors',()=>{
 const html=coursePlanHtml(course,tree,{editor:true,student:false,esc:e});
 for(const token of ['id="courseAddButton"','data-course-create="topic"','data-course-create="upload"','data-course-create="resource"',
 'data-course-create="assignment"','data-course-create="quiz"','data-topic-move="t1"','data-topic-add="t1"','data-topic-edit="t1"','data-topic-delete="t1"','data-topic-assign="r1"'])
 assert.ok(html.includes(token),token);
 assert.ok(html.indexOf('1-mavzu')<html.indexOf('2-mavzu'));
 assert.ok(html.includes('selected'));
});
test('student sees same sequence but no destructive or management controls',()=>{
 const html=coursePlanHtml(course,tree,{editor:false,student:true,esc:e});
 assert.ok(html.includes('1-mavzu'));
 assert.ok(html.includes('data-assignment="a1"'));
 assert.ok(html.includes('Javob berish'));
 assert.ok(html.includes('Testni boshlash'));
 for(const token of ['courseAddButton','data-topic-edit','data-topic-assign','data-delete-resource'])
 assert.ok(!html.includes(token),token);
});
test('topic HTML escapes user-supplied content and does not execute it',()=>{
 const payload='<img src=x onerror=alert(1)>';
 const html=coursePlanHtml({resources:[{_id:'r1',title:payload,kind:'link'}]},tree,{editor:true,esc:e});
 assert.ok(!html.includes(payload));
 assert.ok(html.includes('&lt;img'));
});
test('backend validates course ownership and same-course attachments',()=>{
 const code=file('course-topics.js'),lms=file('lms.js');
 for(const token of ['courseAccess(req,req.params.courseId,write)','Topic.findOne({_id:req.params.topicId,courseId:req.params.courseId})',
 'models[type].exists({_id:req.body.itemId,courseId:req.params.courseId})',
 "itemType:type,itemId:req.body.itemId","Link.deleteMany({courseId:req.params.courseId,topicId:row._id})",
 "if(count>=300)","app.post('/api/lms/courses/:courseId/topics'","app.delete('/api/lms/courses/:courseId/topics/:topicId'"])
 assert.ok(code.includes(token),token);
 assert.ok(lms.includes('installCourseTopics(app,'));
 assert.ok(lms.includes('res.json({course,resources,assignments,quizzes,videos})'));
});
test('frontend single add menu keeps old handlers for upload, responses, quiz proctor, analytics',()=>{
 const app=file('public/app.js');
 for(const token of ['coursePlanHtml(x,topicTree','id+\'/topics\'','data-course-create','attachTopic(', 'return await new Promise((resolve,reject)',
 'openQuizComposer({modal,api,courseId:id,openCourse,toast,esc,onQuizCreated',
 "all('[data-assignment]')","all('[data-quiz]')","$('#resourceUsage')"])
 assert.ok(app.includes(token),token);
 assert.ok(!app.includes('html+=\'<h3>Materiallar</h3>\''));
});
