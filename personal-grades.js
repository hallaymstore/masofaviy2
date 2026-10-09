// Personal grades are built from graded Submissions and restricted to the signed-in student.
const uzDateFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'});
export const uzDay=(value)=>value?uzDateFormatter.format(new Date(value)):'';
export function personalGradePeriod(period='all',from=''){
 if(period==='all')return {period:'all',from:null,to:null,label:'Barcha natijalar'};
 if(!['week','month'].includes(period))throw Object.assign(new Error('Davr noto‘g‘ri'),{status:400});
 const base=from||uzDay(new Date());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(base))throw Object.assign(new Error('Sana noto‘g‘ri'),{status:400});
 const [year,month,day]=base.split('-').map(Number);
 const local=new Date(Date.UTC(year,month-1,day)-5*3600000);
 if(uzDay(local)!==base)throw Object.assign(new Error('Sana noto‘g‘ri'),{status:400});
 const start=period==='week'?
   new Date(local.getTime()-((new Date(Date.UTC(year,month-1,day)).getUTCDay()+6)%7)*86400000):
   new Date(Date.UTC(year,month-1,1)-5*3600000);
 const end=period==='week'?new Date(start.getTime()+7*86400000):
   new Date(Date.UTC(year,month,1)-5*3600000);
 return {period,from:start,to:end,label:uzDay(start)};
}
export function buildPersonalGradebook({courses=[],assignments=[],submissions=[],period={period:'all',from:null,to:null,label:'Barcha natijalar'}}){
 const byCourse=new Map(courses.map(c=>[String(c._id),c]));
 const byAssignment=new Map(assignments.map(a=>[String(a._id),a]));
 const rows=[];
 for(const s of submissions){
   const assignment=byAssignment.get(String(s.assignmentId));
   const course=assignment&&byCourse.get(String(assignment.courseId));
   if(!assignment||!course||!assignment.published||!course.active)continue;
   const graded=Boolean(s.gradedAt&&s.score!==null&&s.score!==undefined&&Number.isFinite(Number(s.score)));
   const at=graded?s.gradedAt:s.submittedAt;
   if(!at||!Number.isFinite(new Date(at).getTime()))continue;
   if(period.from&&(new Date(at)<period.from||new Date(at)>=period.to))continue;
   const scale=Number(assignment.gradeScale||assignment.maxScore||100);
   if(!Number.isFinite(scale)||scale<=0)continue;
   const score=graded?Number(s.score):null;
   rows.push({
     courseId:String(course._id),courseTitle:String(course.title||'Fan'),teacherName:String(course.teacherId?.fullName||''),
     assignmentId:String(assignment._id),assignmentTitle:String(assignment.title||'Topshiriq'),
     category:String(assignment.category||'assignment'),status:graded?'graded':'pending',
     scale,score,percent:graded?Math.round(score/scale*10000)/100:null,
     feedback:graded?String(s.feedback||''):'',
     submittedAt:s.submittedAt||null,gradedAt:graded?s.gradedAt:null,
     date:uzDay(at),sortAt:new Date(at).getTime()
   });
 }
 rows.sort((a,b)=>b.sortAt-a.sortAt||a.courseTitle.localeCompare(b.courseTitle));
 const graded=rows.filter(r=>r.status==='graded'),pending=rows.length-graded.length;
 const avg=graded.length?Math.round(graded.reduce((sum,r)=>sum+r.percent,0)/graded.length*100)/100:null;
 return {period:{kind:period.period,label:period.label},rows:rows.map(({sortAt,...row})=>row),
   stats:{graded:graded.length,pending,averagePercent:avg,total:rows.length}};
}
