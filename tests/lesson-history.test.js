import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordPresenceJoin,recordPresenceLeave,recordProctorObservation,closeProctorTimeline} from '../lesson-history-timeline.js';
import {historyDateRange,lessonHistoryDocument,historyCsv,csvCell} from '../lesson-history-rules.js';
const code=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const t=s=>new Date('2026-10-09T'+s+'+05:00');
test('student reconnect makes two real intervals and precise sum',()=>{
 const r={presenceIntervals:[],proctorTimeline:[],minutes:0};
 recordPresenceJoin(r,t('09:00:00'));recordPresenceLeave(r,t('09:00:00'),t('09:18:00'));
 recordPresenceJoin(r,t('09:21:00'));recordPresenceLeave(r,t('09:21:00'),t('09:50:00'));
 assert.equal(r.presenceIntervals.length,2);assert.equal(r.minutes,47);assert.equal(r.reconnectCount,1);
});
test('old disconnect cannot close a newer socket',()=>{
 const r={presenceIntervals:[],proctorTimeline:[],minutes:0};
 recordPresenceJoin(r,t('09:00:00'));recordPresenceJoin(r,t('09:21:00'));
 assert.equal(recordPresenceLeave(r,t('09:00:00'),t('09:22:00')),false);
 assert.equal(recordPresenceLeave(r,t('09:21:00'),t('09:23:00')),true);
 assert.equal(r.minutes,2);
});
test('proctor state changes and detector errors are independently timestamped',()=>{
 const r={proctorTimeline:[]};
 const run=(stamp,state,detectorStatus='ready')=>recordProctorObservation(r,{faceState:state,detectorStatus,cameraReady:true},t(stamp),r.proctorLastAt);
 run('09:05:00','present');run('09:05:04','present');run('09:05:08','away');run('09:05:12','unknown','error');
 closeProctorTimeline(r,t('09:05:14'));
 assert.deepEqual(r.proctorTimeline.map(x=>x.state),['present','away','unknown']);
 assert.equal(r.proctorObservedSeconds,12);assert.equal(r.proctorFacePresentSeconds,8);assert.equal(r.proctorFaceAwaySeconds,4);
 assert.equal(r.proctorTimeline[2].endedAt.getTime(),t('09:05:14').getTime());
});
test('long camera telemetry gap is recorded as unknown, not face-visible',()=>{
 const r={proctorTimeline:[]};
 recordProctorObservation(r,{faceState:'present',detectorStatus:'ready',cameraReady:true},t('09:00:00'),null);
 recordProctorObservation(r,{faceState:'present',detectorStatus:'ready',cameraReady:true},t('09:00:35'),r.proctorLastAt);
 assert.deepEqual(r.proctorTimeline.map(x=>x.state),['present','unknown','present']);
 assert.equal(r.proctorFacePresentSeconds,10);
});
test('history and CSV contain teacher, absentees, individual intervals and proctor samples',()=>{
 const attendance={userId:'student1',joinedAt:t('09:00:00'),lastJoinedAt:t('09:21:00'),leftAt:t('09:50:00'),minutes:47,status:'present',reconnectCount:1,
 presenceIntervals:[{joinedAt:t('09:00:00'),leftAt:t('09:18:00')},{joinedAt:t('09:21:00'),leftAt:t('09:50:00')}],
 proctorObservedSeconds:60,proctorFacePresentSeconds:40,proctorFaceAwaySeconds:10,proctorFaceMissingSeconds:10,
 proctorTimeline:[{startedAt:t('09:05:00'),endedAt:t('09:05:40'),state:'present',detectorStatus:'ready',cameraReady:true}],
 checkpoints:[{minute:10,at:t('09:10:00'),state:'present'}]};
 const session={_id:'s1',scheduleId:'l1',groupId:'g1',dateKey:'2026-10-09',status:'ended',startedAt:t('09:00:00'),endedAt:t('10:20:00'),rosterSnapshot:[]};
 const doc=lessonHistoryDocument({session,schedule:{title:'Dars',subject:'Web',start:'09:00',end:'10:20'},group:{name:'DI-101'},teacher:{_id:'t1',fullName:'Ustoz',login:'teacher01'},students:[{_id:'student1',fullName:'Ali',login:'a1'},{_id:'student2',fullName:'Vali',login:'a2'}],attendances:[attendance]});
 assert.deepEqual([doc.summary.expected,doc.summary.present,doc.summary.absent],[2,1,1]);
 assert.equal(doc.teacher.status,'absent');assert.equal(doc.students[0].presenceIntervals.length,2);
 assert.equal(doc.students[0].proctor.faceVisiblePercent,67);
 const csv=historyCsv([doc]);
 for(const item of ['O‘qituvchi','Vali','Ishtirok vaqti','Proktor kuzatuvi','Davomat tekshiruvi','09:21:00'])assert.ok(csv.includes(item),item);
 assert.ok(csv.startsWith('\uFEFF'));
});
test('scope and date bounds, CSV formula injection',()=>{
 assert.deepEqual(historyDateRange('2026-10-01','2026-10-09'),{from:'2026-10-01',to:'2026-10-09'});
 for(const [from,to] of [['2026-10-09','2026-10-01'],['2026-02-30','2026-10-09'],['2024-01-01','2026-10-09']])assert.throws(()=>historyDateRange(from,to));
 assert.equal(csvCell('=1+2'),'"\'=1+2"');assert.ok(csvCell(t('09:05:00')).includes('09:05:00'));
});
test('history endpoints are role-scoped and sessions are captured historically',()=>{
 const api=code('lesson-history.js'),server=code('server.js'),app=code('public/app.js'),html=code('public/index.html');
 for(const str of ["user.role==='teacher'","scope.teacherId","scope.groupIds","sessions.length>250","historyCsv(documents,{mode})","app.get('/api/lesson-history/export',auth","app.get('/api/lesson-history/:id',auth"])assert.ok(api.includes(str),str);
 for(const str of ['recordPresenceJoin(row,now)','recordPresenceLeave(row,socket.data.attendanceSessionStartedAt','recordProctorObservation(row,{faceState:state','captureHistoryRoster','finalizeLessonHistoryAttendance'])assert.ok(server.includes(str),str);
 assert.ok(app.includes('history:loadLessonHistory'));assert.ok(html.includes('data-page="history" class="hidden"'));
});

test('lost camera heartbeat cannot be extended to the reconnect time',()=>{
 const r={proctorTimeline:[],presenceIntervals:[],minutes:0};
 recordPresenceJoin(r,t('09:00:00'));
 recordProctorObservation(r,{faceState:'present',detectorStatus:'ready',cameraReady:true},t('09:00:00'),null);
 recordPresenceLeave(r,t('09:00:00'),t('09:02:00'));
 assert.equal(r.proctorTimeline[0].endedAt.getTime(),t('09:00:06').getTime()+500);
 assert.equal(r.proctorTimeline[1].state,'unknown');
 assert.equal(r.proctorTimeline[1].endedAt.getTime(),t('09:02:00').getTime());
});
