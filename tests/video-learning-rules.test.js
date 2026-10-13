import test from 'node:test';
import assert from 'node:assert/strict';
import {annotateVideoLocks,videoAllowedForGroup,verifiedVideoCompletion,orderedCourseVideos} from '../video-learning-rules.js';
const completed={completed:true,durationSeconds:100,lastPositionSeconds:99,watchedSeconds:95};
const lesson=(id,sequence,courseId='courseA',moduleTitle='1-modul')=>({_id:id,sequence,courseId,moduleTitle,createdAt:'2026-10-13T00:00:00Z'});
test('first topic unlocked, subsequent topics wait for completed previous video',()=>{
 const rows=[lesson('v3',3),lesson('v1',1),lesson('v2',2)];
 const first=annotateVideoLocks(rows,{},true);
 assert.equal(first.find(v=>v._id==='v1').locked,false);
 assert.equal(first.find(v=>v._id==='v2').locked,true);
 assert.equal(first.find(v=>v._id==='v3').locked,true);
 const second=annotateVideoLocks(rows,{v1:completed},true);
 assert.equal(second.find(v=>v._id==='v2').locked,false);
 assert.equal(second.find(v=>v._id==='v3').locked,true);
 const inconsistent=annotateVideoLocks(rows,{v2:completed},true);
 assert.equal(inconsistent.find(v=>v._id==='v3').locked,true);
 const done=annotateVideoLocks(rows,{v1:completed,v2:completed},true);
 assert.equal(done.find(v=>v._id==='v3').locked,false);
});
test('course sequences independent and unrestricted standalone videos',()=>{
 const rows=[lesson('a1',1),lesson('a2',2),lesson('b1',1,'courseB'),lesson('b2',2,'courseB'),{_id:'free',courseId:null}];
 const result=annotateVideoLocks(rows,{a1:completed},true);
 assert.equal(result.find(v=>v._id==='a2').locked,false);
 assert.equal(result.find(v=>v._id==='b2').locked,true);
 assert.equal(result.find(v=>v._id==='free').locked,false);
 assert.equal(annotateVideoLocks(rows,{},false).some(v=>v.locked),false);
});
test('module and lesson order are deterministic',()=>{
 const rows=[lesson('v2',2),lesson('m2',1,'courseA','2-modul'),lesson('v1',1)];
 assert.deepEqual(orderedCourseVideos(rows).map(x=>x._id),['v1','v2','m2']);
});
test('video group visibility respects explicit group assignment',()=>{
 assert.equal(videoAllowedForGroup({groupIds:['g2'],courseId:{groupId:'g1'}},'g1'),false);
 assert.equal(videoAllowedForGroup({groupIds:['g2'],courseId:{groupId:'g1'}},'g2'),true);
 assert.equal(videoAllowedForGroup({groupIds:[],courseId:{groupId:'g1'}},'g1'),true);
 assert.equal(videoAllowedForGroup({groupIds:[],courseId:{groupId:'g1'}},'g2'),false);
});
test('watching 90% before the last seconds cannot finish or open another topic',()=>{
 assert.equal(verifiedVideoCompletion(null,91,100,91),false);
 assert.equal(verifiedVideoCompletion(null,99,100,40),false);
 assert.equal(verifiedVideoCompletion(null,99,100,91),true);
 assert.equal(verifiedVideoCompletion(completed,20,100,30),true);
});
