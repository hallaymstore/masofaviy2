import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyFaceDetections,createFaceStateFilter} from '../public/live-proctor-logic.js';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
test('face detector distinguishes camera-empty, centered, turned and unknown frames',()=>{
 assert.equal(classifyFaceDetections([]),'missing');
 assert.equal(classifyFaceDetections([{},{}]),'away');
 assert.equal(classifyFaceDetections([{}]),'unknown');
 assert.equal(classifyFaceDetections([{boundingBox:{xCenter:.5,yCenter:.5}}]),'present');
 assert.equal(classifyFaceDetections([{boundingBox:{xCenter:.81,yCenter:.5}}]),'away');
 assert.equal(classifyFaceDetections([{boundingBox:{xCenter:.5,yCenter:.5},landmarks:[{x:.42},{x:.58},{x:.51}]}]),'present');
 assert.equal(classifyFaceDetections([{boundingBox:{xCenter:.5,yCenter:.5},landmarks:[{x:.42},{x:.58},{x:.68}]}]),'away');
 assert.equal(classifyFaceDetections([{boundingBox:{x:100,y:90,width:280,height:240}}],'native',640,480),'present');
 assert.equal(classifyFaceDetections([{boundingBox:{x:580,y:90,width:35,height:40}}],'native',640,480),'away');
});
test('face state requires confirmed frames and stale inference returns unknown, not a violation',()=>{
 const f=createFaceStateFilter(2);
 assert.equal(f.get(1000),'unknown');
 assert.equal(f.observe('present',1000),'unknown');
 assert.equal(f.observe('present',2000),'present');
 assert.equal(f.observe('missing',3000),'present');
 assert.equal(f.observe('missing',4000),'missing');
 assert.equal(f.get(20000),'unknown');
 assert.equal(f.observe('invalid',21000),'unknown');
});
test('student controls broadcast independently of local proctor and confirms classroom visibility',()=>{
 assert.ok(app.includes("if(user?.role==='student'&&!cameraOn)"));
 assert.ok(app.includes('studentCameraGranted=true;'));
 assert.ok(app.includes("if(!cameraOn)await mediaRoomClient?.toggleCamera()"));
 assert.ok(app.includes('Kamerangizni dars ishtirokchilariga ko‘rsatmoqchimisiz?'));
 assert.ok(app.includes("setExternalCameraTrack?.(liveProctorTrack)"));
 assert.ok(app.includes('classifyFaceDetections('));
});
test('proctor errors are distinguished from absent faces and propagated to instructor UI',()=>{
 assert.ok(app.includes("detectorStatus='error'"));
 assert.ok(app.includes("faceState='unknown'"));
 assert.ok(app.includes("renderLocalProctorStatus("));
 assert.ok(app.includes('detectorStatus,pageActive'));
 assert.ok(server.includes("socket.on('lesson:proctor-state',async({lessonId,cameraReady,faceState,detectorStatus})"));
 assert.ok(server.includes('detectorStatus:detector'));
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(html.includes('id="liveStudentProctorStatus"'));
});
