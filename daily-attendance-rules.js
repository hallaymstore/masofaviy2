// Pure helpers for the daily attendance board (kept separate so they are unit-tested without MongoDB).
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const DAY_MS=86400000;

export function attendanceDateKey(value,today){
  const v=String(value||'').trim();
  if(!v)return today;
  if(!DATE_RE.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Object.assign(new Error('Sana YYYY-MM-DD formatida bo‘lsin'),{status:400});
  return v;
}
// 1 = Monday … 7 = Sunday, matching Schedule.weekday.
export function weekdayOfDateKey(dateKey){return new Date(dateKey+'T00:00:00Z').getUTCDay()||7}
// Teachers may correct the last 7 days; attendance.manage roles (admin/tech) the last 60. Never the future.
export function canMarkAttendanceOn(dateKey,today,role=''){
  const diff=Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(dateKey+'T00:00:00Z'))/DAY_MS);
  if(diff<0)return false;
  return diff<=(['superadmin','admin','tech'].includes(role)?60:7);
}
// rows: the attendance record of each rostered student for one lesson (undefined = not marked yet).
export function dailyAttendanceCounts(rows=[]){
  const c={expected:rows.length,present:0,late:0,absent:0,excused:0,unmarked:0,manual:0};
  for(const r of rows){
    const s=r?.status;
    if(s==='present'||s==='late'||s==='absent'||s==='excused')c[s]++;else c.unmarked++;
    if(r?.manualMarkedAt)c.manual++;
  }
  c.rate=c.expected?Math.round((c.present+c.late)/c.expected*100):0;
  return c;
}
