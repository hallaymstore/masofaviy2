import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProctorEvents,proctorSubmissionReady} from '../proctoring.js';

test('proctoring readiness requires camera and microphone',()=>{
  assert.equal(proctorSubmissionReady([{type:'camera_ready'}]).ok,false);
  assert.equal(proctorSubmissionReady([{type:'camera_ready'},{type:'microphone_ready'}]).ok,true);
});
test('risk summary raises review priority for repeated integrity signals',()=>{
  const events=[
    {type:'camera_ready'},{type:'microphone_ready'},
    {type:'page_hidden'},{type:'page_hidden'},{type:'multiple_faces'},{type:'camera_track_ended'}
  ];
  const x=summarizeProctorEvents(events);
  assert.equal(x.cameraReady,true);assert.equal(x.microphoneReady,true);
  assert.ok(x.riskScore>=60);assert.equal(x.reviewPriority,'high');
  assert.equal(x.eventCounts.page_hidden,2);
});
test('risk summary stays low for clean ready session',()=>{
  const x=summarizeProctorEvents([{type:'camera_ready'},{type:'microphone_ready'},{type:'fullscreen_enter'}]);
  assert.equal(x.riskScore,0);assert.equal(x.reviewPriority,'low');
});
