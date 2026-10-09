import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeLiveLessonGroup} from '../lesson-roster.js';
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const media=readFileSync(new URL('../frontend/media-client.js',import.meta.url),'utf8');
test('70 enrolled students remain scoped to one group ID; audit never merges other groups',()=>{
 const g={_id:'group-a',name:'DI-101',code:'DI-101'};
 const rows=Array.from({length:70},(_,i)=>({groupId:'group-a',direction:i<45?'Dasturiy injiniring':'Kompyuter injiniringi',courseYear:i<65?1:2,group:i<65?'DI-101':'OLD-GROUP'}));
 const result=summarizeLiveLessonGroup(g,rows);
 assert.equal(result.total,70);
 assert.equal(result.group.name,'DI-101');
 assert.deepEqual(result.byDirection.map(x=>x.count),[45,25]);
 assert.deepEqual(result.byCourseYear.map(x=>x.count),[65,5]);
 assert.deepEqual(result.declaredGroupLabels.map(x=>x.count),[65,5]);
 const snapshot=server.slice(server.indexOf('async function participantSnapshot('),server.indexOf('const mediaJoinPayload='));
 assert.ok(snapshot.includes("groupId:lesson.groupId"));
 assert.ok(snapshot.includes('summarizeLiveLessonGroup(group,students)'));
 assert.ok(!snapshot.includes('groupId:{$in:'));
});
test('live class membership and SFU ticket verify the lesson groupId rather than direction',()=>{
 const access=server.slice(server.indexOf('const scheduleAccess=async'),server.indexOf('const ensureAutomaticLiveSession=async'));
 assert.ok(access.includes("String(gid||'')===String(lesson.groupId)"));
 const join=server.slice(server.indexOf("app.post('/api/live/rooms/:scheduleId/join'"),server.indexOf("app.post('/api/live/rooms/:scheduleId/end'"));
 assert.ok(join.includes('await scheduleAccess(req.user,lesson)'));
 assert.ok(server.includes('await scheduleAccess(user,lesson)'));
});
test('roster audit is informational only and grouped by direction, year, imported label',()=>{
 const s=summarizeLiveLessonGroup({name:'DI-101'},[]);
 assert.equal(s.total,0);assert.deepEqual(s.byDirection,[]);
 assert.ok(app.includes("renderLessonStudentRail(rows,audit)"));
 assert.ok(app.includes('lesson-roster-audit'));
 assert.ok(app.includes('auditCounts(audit.byDirection)'));
 assert.ok(app.includes('auditCounts(audit.byCourseYear)'));
 assert.ok(app.includes('auditCounts(audit.declaredGroupLabels)'));
});
test('teacher PiP tap forwards teacher user ID to the authorized spotlight handler',()=>{
 assert.ok(media.includes("teacherPiP.addEventListener('click',()=>this.restoreTeacherFromPiP())"));
 assert.ok(media.includes('this.onTeacherPiPClick({userId:id'));
 assert.ok(app.includes('onTeacherPiPClick:({userId})=>'));
 assert.ok(app.includes("socket?.emit('lesson:spotlight',{lessonId:activeLessonId,userId})"));
 assert.ok(app.includes('mediaRoomClient?.focusUserForClass?.(userId)'));
});

test('PiP action chooses the teacher with a live track and forwards only that userId',async()=>{
 const {MediaRoomClient}=await import('../frontend/media-client.js');
 const c=Object.create(MediaRoomClient.prototype);
 let sent=null;
 const mk=({teacher,id,live})=>{
   const set=new Set(teacher?['role-teacher','has-video']:['has-video']);
   const track=live?{readyState:'live',enabled:true}:null;
   return {
     dataset:{userId:id,peerId:id},
     classList:{contains:x=>set.has(x)},
     querySelector:selector=>selector==='video'?{srcObject:track?{getVideoTracks:()=>[track]}:null}:null
   };
 };
 c.tiles=new Map([['x',mk({teacher:false,id:'student1',live:true})],['t',mk({teacher:true,id:'teacher1',live:true})]]);
 c.producers=new Map();c.user={role:'student'};
 c.onTeacherPiPClick=payload=>{sent=payload};
 assert.equal(c.restoreTeacherFromPiP(),true);
 assert.deepEqual(sent,{userId:'teacher1',peerId:'teacher1'});
 c.tiles.get('t').querySelector=()=>({srcObject:null});
 sent=null;
 assert.equal(c.restoreTeacherFromPiP(),false);
 assert.equal(sent,null);
});
