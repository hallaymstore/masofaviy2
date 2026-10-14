import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('server.js'),app=read('public/app.js'),html=read('public/index.html');

test('live quiz: only the lesson teacher starts/ends it, one answer per student, correct option hidden until results',()=>{
 assert.ok(server.includes("socket.on('lesson:quiz-start',async"));
 assert.ok(server.includes("return String(socket.user._id)===String(lesson.teacherId)||hasPermission(socket.user,'live.manage');"));
 assert.ok(server.includes("if(q.answers.has(uid)||!Number.isInteger(i)||i<0||i>=q.options.length)return;"));
 assert.ok(server.includes("phase:'open',question:q.question,options:q.options,endsAt:q.endsAt"));
 assert.ok(!/phase:'open'[^\n]*correct:/.test(server),'open event never leaks the correct answer');
});

test('understanding pulse is anonymous, student-only and expires',()=>{
 assert.ok(server.includes("socket.user.role!=='student')return;"));
 assert.ok(server.includes("now-v.at>5*60*1000"));
 assert.ok(server.includes("io.to('lesson:'+lessonId).emit('lesson:pulse',{lessonId,ok,lost,online:online.size})"));
});

test('client wires quiz card, composer and pulse chips',()=>{
 assert.ok(html.includes('id="callQuiz"'));
 for(const t of ["socket.on('lesson:quiz',onLessonQuiz)","socket.on('lesson:pulse',onLessonPulse)","function openLiveQuizComposer()","resetLiveExtras();"])assert.ok(app.includes(t),t);
});
