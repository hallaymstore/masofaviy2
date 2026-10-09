const SCALES=new Set([2,5,10,100]);
export function normalizeGradeScale(value){
 const n=Number(value);
 if(!SCALES.has(n))throw Object.assign(new Error('Baholash: 2, 5, 10 yoki 100 ball'),{status:400});
 return n;
}
export function journalPeriod(period='week',from='',now=new Date()){
 if(!['week','month'].includes(period))throw Object.assign(new Error('Davr noto‘g‘ri'),{status:400});
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const anchor=from||local;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor))throw Object.assign(new Error('Sana YYYY-MM-DD bo‘lsin'),{status:400});
 const d=new Date(anchor+'T00:00:00+05:00');
 if(!Number.isFinite(d.getTime())||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)!==anchor)throw Object.assign(new Error('Sana noto‘g‘ri'),{status:400});
 const dateParts=anchor.split('-').map(Number);
 let start;
 if(period==='week'){
   const day=(new Date(Date.UTC(dateParts[0],dateParts[1]-1,dateParts[2])).getUTCDay()+6)%7;
   start=new Date(d.getTime()-day*86400000);
 }else start=new Date(Date.UTC(dateParts[0],dateParts[1]-1,1)-5*3600000);
 const end=period==='week'?new Date(start.getTime()+7*86400000):new Date(Date.UTC(dateParts[0],dateParts[1],1)-5*3600000);
 return {from:start,to:end,label:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(start),period};
}
export function safeCsvCell(value){
 let s=String(value??'').replace(/\0/g,'').replace(/\r/g,' ').replace(/\n/g,' ');
 if(/^[\s\uFEFF]*[=+@-]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export function journalCsv(journal){
 const {group,course,columns,rows,period}=journal;
 const head=['Guruh','Fan','Davr','Talaba','Login',...columns.map(c=>c.title+' ('+c.scale+' ball)'), 'Baholangan','Topshirilgan','O‘rtacha %'];
 const table=[head,...rows.map(r=>[group.name,course.title,period.label,r.student.fullName,r.student.login,...r.marks.map(m=>m.status==='graded'?String(m.score)+'/'+m.scale:m.status==='submitted'?'Topshirilgan':m.status==='late'?'Muddati o‘tgan':'—'),r.graded,r.submitted,r.averagePercent??''])];
 return '\uFEFF'+table.map(row=>row.map(safeCsvCell).join(',')).join('\r\n')+'\r\n';
}
export function buildJournal({group,course,students,assignments,submissions,period}){
 const columns=assignments.map(a=>({id:String(a._id),title:a.title,scale:Number(a.gradeScale||a.maxScore||100),at:a.dueAt||a.createdAt}));
 const byKey=new Map(submissions.map(s=>[String(s.assignmentId)+'|'+String(s.studentId),s]));
 const rows=students.map(student=>{
  let total=0,graded=0,submitted=0;
  const marks=columns.map(col=>{
   const submission=byKey.get(col.id+'|'+String(student._id));
   if(submission?.submittedAt)submitted++;
   if(submission?.gradedAt&&Number.isFinite(submission.score)){
    graded++;total+=Number(submission.score)/Math.max(1,col.scale)*100;
    return {status:'graded',score:Number(submission.score),scale:col.scale,gradedAt:submission.gradedAt};
   }
   return {status:submission?.submittedAt?'submitted':col.at&&new Date(col.at)<new Date()?'late':'missing',score:null,scale:col.scale};
  });
  return {student:{id:String(student._id),fullName:student.fullName,login:student.login},marks,submitted,graded,averagePercent:graded?Math.round(total/graded*100)/100:null};
 });
 return {group:{id:String(group._id),name:group.name,code:group.externalId||group.code||''},course:{id:String(course._id),title:course.title},period:{kind:period.period,label:period.label,to:period.to},columns,rows,stats:{total:rows.length,submitted:rows.filter(x=>x.submitted>0).length,graded:rows.filter(x=>x.graded>0).length}};
}
