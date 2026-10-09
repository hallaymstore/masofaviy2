// Descriptive audit only. Classroom enrollment remains determined by User.groupId.
export function summarizeLiveLessonGroup(group,students=[]){
  const rows=Array.isArray(students)?students:[];
  const counted=(toLabel)=>Object.entries(rows.reduce((m,row)=>{
    const label=String(toLabel(row)||'Kiritilmagan').trim().slice(0,100)||'Kiritilmagan';
    m[label]=(m[label]||0)+1;return m;
  },{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,count])=>({name,count}));
  return {
    group:{id:String(group?._id||''),name:String(group?.name||'Guruh').slice(0,120),code:String(group?.externalId||group?.code||'').slice(0,80)},
    total:rows.length,
    byDirection:counted(s=>s.direction),
    byCourseYear:counted(s=>s.courseYear?String(s.courseYear)+'-kurs':''),
    declaredGroupLabels:counted(s=>s.group)
  };
}
