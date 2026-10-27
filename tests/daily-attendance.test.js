import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attendanceDateKey,weekdayOfDateKey,canMarkAttendanceOn,dailyAttendanceCounts} from '../daily-attendance-rules.js';

test('date key defaults to today and rejects malformed input',()=>{
  assert.equal(attendanceDateKey('', '2026-10-27'),'2026-10-27');
  assert.equal(attendanceDateKey('2026-10-20','2026-10-27'),'2026-10-20');
  assert.throws(()=>attendanceDateKey('27.10.2026','2026-10-27'));
  assert.throws(()=>attendanceDateKey('2026-13-45','2026-10-27'));
});
test('weekday matches Schedule.weekday (Monday=1, Sunday=7)',()=>{
  assert.equal(weekdayOfDateKey('2026-10-26'),1);
  assert.equal(weekdayOfDateKey('2026-11-01'),7);
});
test('manual marking window: never future, teacher 7 days, admin 60 days',()=>{
  assert.equal(canMarkAttendanceOn('2026-10-28','2026-10-27','admin'),false);
  assert.equal(canMarkAttendanceOn('2026-10-27','2026-10-27','teacher'),true);
  assert.equal(canMarkAttendanceOn('2026-10-20','2026-10-27','teacher'),true);
  assert.equal(canMarkAttendanceOn('2026-10-19','2026-10-27','teacher'),false);
  assert.equal(canMarkAttendanceOn('2026-09-01','2026-10-27','admin'),true);
});
test('counts treat missing records as unmarked and include late in the rate',()=>{
  const c=dailyAttendanceCounts([{status:'present'},{status:'late',manualMarkedAt:new Date()},{status:'absent'},undefined]);
  assert.deepEqual({e:c.expected,p:c.present,l:c.late,a:c.absent,u:c.unmarked,m:c.manual,r:c.rate},{e:4,p:1,l:1,a:1,u:1,m:1,r:50});
});
test('daily board is installed, scoped and audited',()=>{
  const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8'),mod=fs.readFileSync(new URL('../daily-attendance.js',import.meta.url),'utf8');
  assert.match(server,/installDailyAttendance\(app,/);
  assert.match(mod,/resolveScope\(user,query\)/);
  assert.match(mod,/ATTENDANCE_DAILY_SAVE/);
  assert.match(mod,/hasPermission\(user,'attendance\.manage'\)/);
});
