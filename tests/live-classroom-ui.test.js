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
  assert.ok(app.includes('renderLessonStudentRail(rows,audit)'));
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

test('class spotlight must be available to students, private proctor stream remains teacher-only',()=>{
 const src=file('frontend/media-client.js');
 const sfu=file('media-server/server.js');
 assert.ok(src.includes("if(meta.appData?.proctorBroadcast)return this.user.role!=='student'"));
 assert.ok(src.includes("if(meta.appData?.classroomSpotlight)return true"));
 assert.ok(src.includes("proctorBroadcast:!broadcastToClass"));
 assert.ok(src.includes("classroomSpotlight:Boolean(broadcastToClass)"));
 assert.ok(app.includes("startCameraFromExternalTrack?.(liveProctorTrack,x.viewerUserId||'',true)"));
 assert.ok(sfu.includes("if(!producer?.appData?.proctorBroadcast)return true"));
});

test('student video remains local until teacher grants or spotlight consent',()=>{
 assert.ok(app.includes("studentCameraGranted=user.role!=='student'"));
 assert.ok(app.includes("if(user?.role==='student'&&!cameraOn)"));
 assert.ok(app.includes('if(permitted)'));
});

test('only enrolled group students can enter a live room and pass media verification',()=>{
 const join=server.slice(server.indexOf("app.post('/api/live/rooms/:scheduleId/join'"),server.indexOf("app.post('/api/live/rooms/:scheduleId/end'"));
 assert.ok(join.includes('await scheduleAccess(req.user,lesson)'));
 const access=server.slice(server.indexOf('const scheduleAccess=async'),server.indexOf('const ensureAutomaticLiveSession=async'));
 assert.ok(access.includes("user.role==='student'"));
 assert.ok(access.includes("String(gid||'')===String(lesson.groupId)"));
 const verify=server.slice(server.indexOf("app.post('/api/media/verify'"),server.indexOf('const scheduleAccess=async'));
 assert.ok(verify.includes('await scheduleAccess(user,lesson)'));
});
test('media recovery independently handles send/receive and avoids premature full rejoin',()=>{
 assert.ok(media.includes('transportRecoveryTimers=new Map()'));
 assert.ok(media.includes('transportRecoveryBusy=new Set()'));
 assert.ok(media.includes('restartIce'));
 assert.ok(media.includes('getUserMedia({audio:false,video:{width:{ideal:640}'));
 assert.ok(app.includes('if(state.recoveryFailed)autoRejoinLesson(true)'));
 assert.ok(!app.includes("if(bad)autoRejoinLesson();"));
});

test('teacher webcam and microphone start by default but respect manual OFF on reconnect',()=>{
 assert.ok(app.includes("user.role==='teacher'"));
 assert.ok(app.includes("m2-teacher-camera-wanted"));
 assert.ok(app.includes("m2-teacher-mic-wanted"));
 assert.ok(app.includes("if(localStorage.getItem(cameraKey)!=='0')await mediaRoomClient.toggleCamera()"));
 assert.ok(app.includes("if(isTeachingRole&&localStorage.getItem('m2-teacher-mic-wanted')!=='0')await mediaRoomClient.toggleMic()"));
});

test('camera start restores native video element and focuses own live stage when remote video is absent',()=>{
 assert.ok(media.includes('this.restoreInlineCamera(true)'));
 assert.ok(media.includes('video.onloadedmetadata='));
 assert.ok(media.includes('selectedTrack?.readyState'));
 assert.ok(media.includes("this.selectStagePeer(String(this.room?.peerId||'local'),false)"));
 assert.ok(file('public/live-classroom-2026.css').includes('>.ms-tile.local.has-video.focused'));
});
test('automatic background PiP exits on classroom return and does not hijack manual PiP',()=>{
 assert.ok(media.includes('this.automaticPiP=true'));
 assert.ok(media.includes('if(!pause)this.restoreInlineCamera(true)'));
 assert.ok(media.includes('if((this.automaticPiP||focus)&&document.pictureInPictureElement===video)document.exitPictureInPicture()'));
});
test('administrator operating a lesson remains available as an educator PiP on student spotlight',()=>{
 assert.ok(media.includes("this.user?.role!=='student'&&this.tiles.get('local')!==selected"));
 assert.ok(media.includes("if(teacher)teacher.classList.add('teacher-pip')"));
});

test('local camera stage remains visible despite legacy speaker layout CSS',()=>{
 const css=file('public/live-classroom-2026.css');
 assert.ok(media.includes('ensureInlineVideoStage(){'));
 assert.ok(media.includes("this.grid.classList.toggle('local-camera-stage',Boolean(primary===local))"));
 assert.ok(media.includes('const track=this.primaryTileTrack(primary)'));
 assert.ok(css.includes('.ms-grid.local-camera-stage:not(.screen-layout):not(.class-spotlight)>.ms-tile.local.has-video'));
 assert.ok(css.includes('display:block!important;visibility:visible!important;opacity:1!important'));
 assert.ok(media.includes('this.ensureInlineVideoStage();'));
});
test('network indicator prioritizes real WebRTC statistics over estimated browser downlink',()=>{
 assert.ok(media.includes('async getNetworkHealth(){'));
 assert.ok(media.includes("stat.type==='candidate-pair'"));
 assert.ok(media.includes("stat.type==='inbound-rtp'"));
 assert.ok(app.includes('await media.getNetworkHealth()'));
 assert.ok(app.includes("health.lossPercent>12"));
 assert.ok(app.includes('Network Information API values are estimates'));
 assert.ok(!app.includes("(down&&down<0.8)"));
});
