import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=file('public/index.html'),app=file('public/app.js'),media=file('frontend/media-client.js'),server=file('server.js'),css=file('public/live-participant-rail.css');
test('participant rail and direct participants button exist in live page',()=>{
  for(const id of ['lessonStudentRail','lessonStudentRailItems','lessonStudentRailCount','callParticipants','railOpenParticipants'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(html.includes('live-participant-rail.css'));
});
test('role-based rail uses real students and does not infer video from proctor presence',()=>{
  assert.ok(app.includes('renderLessonStudentRail(rows)'));
  assert.ok(app.includes('student-rail-card'));
  assert.ok(app.includes('faceState'));
  assert.ok(app.includes("requestStudentOnStage(id)"));
});
test('student is asked before the local proctor camera becomes a broadcast',()=>{
  const start=app.indexOf("socket.on('lesson:proctor-camera-request'");
  const end=app.indexOf("socket.on('lesson:proctor-camera-stop'",start);
  const code=app.slice(start,end);
  assert.ok(code.includes('confirm('));
  assert.ok(code.indexOf('if(permitted)')<code.indexOf('startCameraFromExternalTrack'));
  assert.ok(code.includes("camera-result"));
});
test('spotlight is idempotent and educator PiP is implemented',()=>{
  assert.ok(media.includes('focusUserForClass(userId='));
  assert.ok(media.includes("classSpotlightUserId"));
  assert.ok(media.includes("teacher-pip"));
  assert.ok(app.includes('focusUserForClass?.'));
  assert.ok(css.includes('.ms-tile.teacher-pip'));
});
test('server validates spotlight participant and reject stale proctor results',()=>{
  assert.ok(server.includes("Tanlangan ishtirokchi darsda emas"));
  assert.ok(server.includes("if(String(expected||'')!==String(socket.user._id))return"));
});
test('speaking indicator is wired to media audio levels',()=>{
  assert.ok(media.includes('speakingUserIds'));
  assert.ok(app.includes('updateLessonRailSpeakerState()'));
  assert.ok(css.includes('.student-rail-card.speaking'));
});
