import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canAccessClassroomProducer,visibleClassroomParticipants} from '../media-server/classroom-privacy.js';
const code=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const t={id:'teacher-peer',user:{id:'teacher-id',role:'teacher'}};
const s1={id:'student-peer-1',user:{id:'student-1',role:'student'}};
const s2={id:'student-peer-2',user:{id:'student-2',role:'student'}};
const a={id:'admin-peer',user:{id:'admin-1',role:'admin'}};
const studentVideo={kind:'video',appData:{role:'student',mediaTag:'camera',classroomSpotlight:true}};
const studentScreen={kind:'video',appData:{role:'student',mediaTag:'screen'}};
test('SFU denies other student camera, spotlight and screen media, including when explicitly requested',()=>{
 assert.equal(canAccessClassroomProducer(s2,studentVideo,s1),false);
 assert.equal(canAccessClassroomProducer(s2,studentScreen,s1),false);
 assert.equal(canAccessClassroomProducer(t,studentVideo,s1),true);
 assert.equal(canAccessClassroomProducer(a,studentVideo,s1),true);
 assert.equal(canAccessClassroomProducer(s1,studentVideo,s1),true);
});
test('Student can receive instructor video, screen and approved group audio',()=>{
 assert.equal(canAccessClassroomProducer(s1,{kind:'video',appData:{mediaTag:'camera'}},t),true);
 assert.equal(canAccessClassroomProducer(s1,{kind:'video',appData:{mediaTag:'screen'}},t),true);
 assert.equal(canAccessClassroomProducer(s1,{kind:'audio',appData:{mediaTag:'mic'}},s2),true);
});
test('proctor-only camera remains restricted to intended viewer',()=>{
 const p={kind:'video',appData:{proctorBroadcast:true,proctorViewerUserId:'teacher-id'}};
 assert.equal(canAccessClassroomProducer(t,p,s1),true);
 assert.equal(canAccessClassroomProducer(a,p,s1),false);
 assert.equal(canAccessClassroomProducer(s2,p,s1),false);
});
test('Student room state exposes only teacher, other staff and self; count remains aggregate',()=>{
 const list=[{peerId:t.id,user:t.user},{peerId:s1.id,user:s1.user},{peerId:s2.id,user:s2.user},{peerId:a.id,user:a.user}];
 assert.deepEqual(visibleClassroomParticipants(s1,list).map(x=>x.peerId),[t.id,s1.id,a.id]);
 assert.equal(visibleClassroomParticipants(t,list).length,4);
});
test('server prevents student roster access, filters broadcasts and enforces consume permission',()=>{
 const media=code('media-server/server.js'),server=code('server.js');
 for(const key of ['canAccessClassroomProducer','visibleClassroomParticipants','if(!canAccessProducer(peer,found.producer,found.owner))','if(p.user?.role===\'student\'&&(name===\'peerJoined\'||name===\'peerLeft\'))','participants:roomState(room,peer).participants'])
 assert.ok(media.includes(key),key);
 assert.ok(server.includes("if(req.user.role==='student')return res.status(403)"));
});
test('student UI is simpler and only consumes instructor video; teacher moderation stays available',()=>{
 const js=code('frontend/media-client.js'),ui=code('public/app.js'),css=code('public/live-classroom-2026.css');
 assert.ok(js.includes("this.user?.role==='student'&&meta.kind==='video'"));
 assert.ok(js.includes("if(this.user?.role==='student')mode='speaker'"));
 assert.ok(js.includes("if(this.user?.role==='student')return false;"));
 assert.ok(ui.includes("if(user?.role==='student')which='chat'"));
 assert.ok(ui.includes("if(user.role!=='student')await loadLessonParticipants()"));
 assert.ok(ui.includes("Kamerangizni o‘qituvchiga uzatmoqchimisiz?"));
 for(const id of ['lessonStudentRail','callParticipants','callAttendance','callViewMode','callScreen','ms-participant-strip'])assert.ok(css.includes('#'+id)||css.includes('.'+id));
 assert.ok(css.includes('border-radius:3px'));
});

test('runtime media client rejects student video even when spotlight; teacher and audio still work',async()=>{
 const {MediaRoomClient}=await import('../frontend/media-client.js');
 const client=Object.create(MediaRoomClient.prototype);client.user={role:'student',_id:'student-2'};client.ultraLite=false;client.maxStudentVideos=6;client.studentVideoConsumers=0;
 const meta=(kind,role,extras={})=>({kind,user:{role,id:role==='teacher'?'teacher-id':'student-1'},appData:{role,mediaTag:'camera',...extras}});
 assert.equal(client.shouldConsume(meta('video','student',{classroomSpotlight:true})),false);
 assert.equal(client.shouldConsume(meta('video','student',{mediaTag:'screen'})),false);
 assert.equal(client.shouldConsume(meta('audio','student')),true);
 assert.equal(client.shouldConsume(meta('video','teacher')),true);
 client.user={role:'teacher'};
 assert.equal(client.shouldConsume(meta('video','student',{classroomSpotlight:true})),true);
});
