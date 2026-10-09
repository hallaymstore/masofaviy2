import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/coursework-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/live-classroom-2026.css',import.meta.url),'utf8');
test('coursework tasks are the default view, journal/grades are separate hidden tab panels',()=>{
 assert.ok(html.includes('data-coursework-tab="tasks" class="active"'));
 assert.ok(html.includes('id="courseworkTasksPane"'));
 assert.ok(html.includes('id="courseworkGradesPane" class="coursework-pane" role="tabpanel" hidden'));
 assert.ok(html.includes('id="courseworkJournalPane" class="coursework-pane" role="tabpanel" hidden'));
 assert.ok(css.includes('.coursework-pane[hidden]'));
 assert.ok(app.includes("selectCourseworkTab('tasks')"));
 assert.ok(!app.includes("courseworkUi.journals($('#courseworkJournalBoard'),user.role)"));
});
test('tabs show only selected panel, role scopes grade and journal visibility and use accessible controls',()=>{
 assert.ok(app.includes("button.setAttribute('aria-selected',String(active))"));
 assert.ok(app.includes("if(pane)pane.hidden=key!==tab"));
 assert.ok(app.includes("if(tab==='grades')courseworkUi.grading("));
 assert.ok(app.includes("if(tab==='journal')courseworkUi.journals("));
 assert.ok(app.includes('data-coursework-tab="grades"'));
 assert.ok(app.includes('data-coursework-tab="journal"'));
 assert.ok(app.includes("'ArrowRight'"));
});
test('teacher grade tab fetches course-specific submissions and supports pending, graded and grade revision',()=>{
 assert.ok(ui.includes('async function grading(container,role)'));
 assert.ok(ui.includes("api('/coursework/journals')"));
 assert.ok(ui.includes("api('/lms/courses/'+courseId)"));
 assert.ok(ui.includes("api('/lms/assignments/'+a._id+'/submissions')"));
 assert.ok(ui.includes("api('/coursework/assignments/'+a._id+'/files')"));
 assert.ok(ui.includes("data-grading-status="));
 assert.ok(ui.includes("data-grading-submission"));
 assert.ok(ui.includes("'/grade-change':'/grade'"));
 assert.ok(ui.includes("return {refreshCourse,grading,journals,allowJournal}"));
});
test('teacher resources, upload, new assignment and quiz actions appear above resources upon selecting course',()=>{
 assert.ok(app.includes("bar.className='coursework-quick-actions'"));
 assert.ok(app.includes("'newResource','uploadResource','newAssignment','newQuiz'"));
 assert.ok(app.includes("$('#courseList').hidden=true"));
 assert.ok(app.includes("$('#backToCourseList')"));
 assert.ok(css.includes('.coursework-quick-actions'));
});
