import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProctorEvents,proctorSubmissionReady,evaluateProctorTermination} from '../proctoring.js';

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

test('strict proctoring terminates on page leave and screenshot attempt',()=>{
  assert.equal(evaluateProctorTermination([{type:'page_hidden'}]).terminate,true);
  assert.equal(evaluateProctorTermination([{type:'screenshot_attempt'}]).terminate,true);
});
test('strict proctoring requires repeated face-turn signal before termination',()=>{
  assert.equal(evaluateProctorTermination([{type:'face_turned'}]).terminate,false);
  const x=evaluateProctorTermination([{type:'face_turned'},{type:'face_turned'}]);
  assert.equal(x.terminate,true);assert.equal(x.type,'face_turned');
});

test('screen monitoring is part of readiness only when required',()=>{
  const base=[{type:'camera_ready'},{type:'microphone_ready'}];
  assert.equal(proctorSubmissionReady(base).ok,true);
  assert.equal(proctorSubmissionReady(base,{requireScreen:true}).ok,false);
  const x=proctorSubmissionReady([...base,{type:'screen_share_ready'}],{requireScreen:true});
  assert.equal(x.ok,true);assert.equal(x.summary.screenReady,true);assert.equal(x.summary.riskScore,0);
});
test('stopping screen share terminates a screen-proctored attempt',()=>{
  assert.equal(evaluateProctorTermination([{type:'screen_share_ended'}]).terminate,false);
  const x=evaluateProctorTermination([{type:'screen_share_ended'}],{requireScreen:true});
  assert.equal(x.terminate,true);assert.equal(x.type,'screen_share_ended');
});
test('second monitor is flagged for human review',()=>{
  const x=summarizeProctorEvents([{type:'camera_ready'},{type:'microphone_ready'},{type:'screen_share_ready'},{type:'multiple_displays'}],{requireScreen:true});
  assert.ok(x.riskScore>=25);assert.ok(x.warnings.some(w=>w.includes('monitor')));
});
test('evidence images are validated by content and size',async()=>{
  const {decodeEvidenceImage,PROCTOR_EVIDENCE_MAX_BYTES}=await import('../proctoring.js');
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(64)]);
  assert.equal(decodeEvidenceImage('data:image/jpeg;base64,'+jpeg.toString('base64')).mime,'image/jpeg');
  assert.throws(()=>decodeEvidenceImage('data:image/jpeg;base64,'+Buffer.from('<html>').toString('base64')));
  assert.throws(()=>decodeEvidenceImage('data:text/html;base64,AAAA'));
  const big=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(PROCTOR_EVIDENCE_MAX_BYTES)]);
  assert.throws(()=>decodeEvidenceImage('data:image/jpeg;base64,'+big.toString('base64')));
});
