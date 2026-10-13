// Sequential learning access is decided on the server, never by a video button alone.
const idOf=value=>String(value?._id||value||'');
const firstNumber=value=>Number.isFinite(Number(value))?Number(value):0;
const collator=new Intl.Collator('uz',{numeric:true,sensitivity:'base'});
export function videoAllowedForGroup(video,groupId){
  const gid=idOf(groupId);
  if(!gid)return !(video.groupIds||[]).length&&!idOf(video.courseId?.groupId);
  const assigned=(video.groupIds||[]).map(idOf);
  if(assigned.length)return assigned.includes(gid);
  const courseGroup=idOf(video.courseId?.groupId);
  return !courseGroup||courseGroup===gid;
}
export function orderedCourseVideos(rows){
  return [...rows].sort((a,b)=>{
    const moduleOrder=collator.compare(String(a.moduleTitle||'Asosiy modul'),String(b.moduleTitle||'Asosiy modul'));
    if(moduleOrder)return moduleOrder;
    const sequence=firstNumber(a.sequence)-firstNumber(b.sequence);
    if(sequence)return sequence;
    const date=new Date(a.createdAt||0)-new Date(b.createdAt||0);
    return date||collator.compare(idOf(a._id),idOf(b._id));
  });
}
export function annotateVideoLocks(rows,progressById={},isStudent=false){
  const result=rows.map(row=>({...row,locked:false,prerequisiteVideoId:null}));
  if(!isStudent)return result;
  const groups=new Map();
  for(const row of result){
    const courseId=idOf(row.courseId);
    // Standalone video resources have no curricular prerequisite.
    if(!courseId)continue;
    if(!groups.has(courseId))groups.set(courseId,[]);
    groups.get(courseId).push(row);
  }
  for(const lessons of groups.values()){
    const sorted=orderedCourseVideos(lessons);
    let firstUnfinished=null;
    for(const current of sorted){
      if(firstUnfinished){
        current.locked=true;
        current.prerequisiteVideoId=idOf(firstUnfinished._id);
      }
      if(!firstUnfinished&&progressById[idOf(current._id)]?.completed!==true){
        firstUnfinished=current;
      }
    }
  }
  return result;
}
export function verifiedVideoCompletion(existing,position,duration,watched){
  if(existing?.completed)return true;
  if(!(duration>0))return false;
  // Reaching 90% watched time alone must not unlock the next lesson while playing.
  return watched>=Math.max(5,duration*0.9)&&position>=Math.max(0,duration-2);
}
