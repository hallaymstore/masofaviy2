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
export function videoSeriesKey(video){
  const course=idOf(video.courseId);
  if(course)return 'course:'+course;
  // Legacy videos added from the videodars page have no courseId but belong to
  // subject-based learning paths. Their order must be enforced as well.
  const subject=String(video.subject||'Boshqa').trim().toLocaleLowerCase('uz')||'boshqa';
  return 'subject:'+subject;
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
export function isVideoCompleted(progress){
  if(progress?.completed!==true)return false;
  if(progress?.verifiedCompleted===true)return true;
  const duration=Number(progress.durationSeconds),position=Number(progress.lastPositionSeconds),watched=Number(progress.watchedSeconds);
  // Earlier deployments could set completed=true at 90% before the video ended.
  // Existing data must pass the same verified-end condition as fresh progress.
  return duration>0&&position>=Math.max(0,duration-2)&&watched>=Math.max(5,duration*.9);
}
export function annotateVideoLocks(rows,progressById={},isStudent=false){
  const result=rows.map(row=>({...row,locked:false,prerequisiteVideoId:null}));
  if(!isStudent)return result;
  const groups=new Map();
  for(const row of result){
    const series=videoSeriesKey(row);
    if(!groups.has(series))groups.set(series,[]);
    groups.get(series).push(row);
  }
  for(const lessons of groups.values()){
    const sorted=orderedCourseVideos(lessons);
    let firstUnfinished=null;
    for(const current of sorted){
      if(firstUnfinished){
        current.locked=true;
        current.prerequisiteVideoId=idOf(firstUnfinished._id);
      }
      if(!firstUnfinished&&!isVideoCompleted(progressById[idOf(current._id)])){
        firstUnfinished=current;
      }
    }
  }
  return result;
}
export function verifiedVideoCompletion(existing,position,duration,watched){
  if(isVideoCompleted(existing))return true;
  if(!(duration>0))return false;
  // Reaching 90% watched time alone must not unlock the next lesson while playing.
  return watched>=Math.max(5,duration*0.9)&&position>=Math.max(0,duration-2);
}
