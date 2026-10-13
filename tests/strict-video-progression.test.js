import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVideoAccess} from '../video-access.js';
import {annotateVideoLocks,videoSeriesKey} from '../video-learning-rules.js';

const at=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const v=(id,sequence,subject='Statistika',extra={})=>({
  _id:id,courseId:null,groupIds:['group1'],subject,moduleTitle:'Asosiy modul',
  sequence,createdAt:new Date('2026-10-12'),published:true,teacherId:'teacher1',sourceUrl:'https://example.org/'+id+'.mp4',...extra
});
const student={user:{_id:'student1',role:'student'}};
function fixture(videos,progress=[]){
  const fakeQuery=rows=>({select(){return this},lean:async()=>rows});
  const checker=createVideoAccess({
    VideoLesson:{find:()=>fakeQuery(videos)},
    VideoProgress:{find:()=>fakeQuery(progress)},
    Course:{findOne:()=>fakeQuery(null)},
    resolveUserGroupId:async()=> 'group1',
    hasPermission:()=>false
  });
  return checker;
}
test('old standalone videos with same subject are now a sequential course',()=>{
 const rows=[v('v3',3),v('v1',1),v('v2',2)];
 const state=annotateVideoLocks(rows,{v1:{completed:false}},true);
 assert.equal(state.find(x=>x._id==='v1').locked,false);
 assert.equal(state.find(x=>x._id==='v2').locked,true);
 assert.equal(state.find(x=>x._id==='v3').locked,true);
 assert.equal(videoSeriesKey(v('a',1)),videoSeriesKey(v('b',2)));
});
test('student cannot open topic 2 via direct playback when topic 1 is unfinished',async()=>{
 const check=fixture([v('one',1),v('two',2)]);
 const result=await check(student,v('two',2));
 assert.equal(result.allowed,false);
 assert.equal(result.status,423);
 assert.equal(result.prerequisiteVideoId,'one');
});
test('students may proceed only after prerequisite is completed',async()=>{
 const check=fixture([v('one',1),v('two',2)],[{videoId:'one',completed:true,durationSeconds:100,lastPositionSeconds:99,watchedSeconds:95}]);
 assert.equal((await check(student,v('two',2))).allowed,true);
});
test('different subject is an independent path, but unrelated groups denied',async()=>{
 const lessons=[v('a',1),v('b',2),v('c',1,'Buxgalteriya')];
 const check=fixture(lessons);
 assert.equal((await check(student,lessons[2])).allowed,true);
 assert.equal((await check(student,v('stranger',1,'Statistika',{groupIds:['group2']}))).status,403);
});
test('teachers may preview unpublished own video; students cannot',async()=>{
 const row=v('hidden',1,'Statistika',{published:false});
 const check=fixture([row]);
 assert.equal((await check(student,row)).status,404);
 assert.equal((await check({user:{_id:'teacher1',role:'teacher'}},row)).allowed,true);
});
test('all video entry points use server permission before any player renders',()=>{
 const server=at('server.js'),search=at('global-search.js'),media=at('video-media.js'),client=at('public/app.js');
 assert.ok(server.includes("app.get('/api/videos/:id/playback'"));
 assert.ok(server.includes("const grant=await checkVideoAccess(req,item)"));
 assert.ok(search.includes("const permission=await checkVideoAccess(req,video)"));
 assert.ok(media.includes('await checkVideoAccess(req,video)'));
 const fn=client.slice(client.indexOf('async function openVideoLesson('),client.indexOf('function clearWatchPage()'));
 assert.ok(fn.indexOf("await api('/videos/'+encodeURIComponent(id)+'/playback')")>=0);
 assert.ok(fn.indexOf("await api('/videos/'+encodeURIComponent(id)+'/playback')") < fn.indexOf('await renderWatchPlayer(v)'));
});

test('legacy completed flag at 90 percent does NOT unlock next topic',async()=>{
 const previous={videoId:'one',completed:true,durationSeconds:100,lastPositionSeconds:92,watchedSeconds:92};
 const check=fixture([v('one',1),v('two',2)],[previous]);
 const answer=await check(student,v('two',2));
 assert.equal(answer.status,423);
});
