import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MediaRoomClient} from '../frontend/media-client.js';
const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fakeTile(withVideo=true,mediaState=true){
 const track={kind:'video',readyState:withVideo?'live':'ended',enabled:true};
 const el={srcObject:withVideo?{getVideoTracks(){return [track]}}:null};
 return {dataset:{role:'student',peerId:'peer-a',userId:'student-a'},classList:{contains(v){return v==='has-video'&&withVideo}},querySelector(){return el},track};
}
test('teacher detects already live student video and focuses without permission request',()=>{
 const c=Object.create(MediaRoomClient.prototype),tile=fakeTile();
 c.user={role:'teacher'};c.tiles=new Map([['peer-a',tile]]);c.participantMediaState=new Map();
 let focused='';c.focusUserForClass=id=>{focused=id;return true};
 assert.equal(c.studentCameraState('student-a'),'live');
 assert.equal(c.focusAvailableStudentVideo('student-a'),true);
 assert.equal(focused,'student-a');
 assert.equal(c.focusAvailableStudentVideo('student-b'),false);
});
test('proctor-only camera is not reported as a live video stream',()=>{
 const c=Object.create(MediaRoomClient.prototype),tile=fakeTile(false);
 c.user={role:'teacher'};c.tiles=new Map([['peer-a',tile]]);c.participantMediaState=new Map([['peer-a',{cameraOn:false}]]);
 assert.equal(c.studentCameraState('student-a'),'off');
 c.participantMediaState.set('peer-a',{cameraOn:true});
 assert.equal(c.studentCameraState('student-a'),'connecting');
});
test('camera handling prevents repeated requests and reuses already enabled student broadcast',()=>{
 const app=text('public/app.js'),client=text('frontend/media-client.js'),css=text('public/live-participant-rail.css');
 for(const token of ['studentCameraRequests=new Map()','focusAvailableStudentVideo?.(id)','studentCameraState?.(id)','studentCameraRequests.get(key)','studentCameraRequests.delete','const alreadyLive=Boolean(cameraOn','const permitted=alreadyLive||confirm','syncTeacherRailCamera','rail-live-video'])
   assert.ok(app.includes(token),token);
 assert.ok(client.includes("this.maxStudentVideos=this.user?.role==='student'?0:(this.ultraLite?1:(this.lowEnd?3:8))"));
 assert.ok(css.includes('.student-rail-card.live-video .rail-live-video'));
});
test('student near-device half duplex defaults to ON unless explicitly opted out',()=>{
 const src=text('frontend/media-client.js');
 assert.ok(src.includes("this.user?.role==='student'&&localStorage.getItem('m2-proximity-guard')!=='0'"));
 assert.ok(src.includes("active&&(this.proximityGuard||now<this.autoHalfDuplexUntil)"));
 assert.ok(src.includes("this.proximityGuard?'1':'0'"));
 assert.ok(text('public/app.js').includes('Echo himoyasi faol: mikrofon ON'));
});
