// Single authorization decision for video search, playlist, playback and media streams.
import {annotateVideoLocks,videoAllowedForGroup,videoSeriesKey} from './video-learning-rules.js';
const id=value=>String(value?._id||value||'');
export function createVideoAccess({VideoLesson,VideoProgress,Course,resolveUserGroupId,hasPermission}){
 return async function checkVideoAccess(req,video){
   if(!video)return {allowed:false,status:404,message:'Videodars topilmadi'};
   if(req.user.role!=='student'){
     const owner=id(video.teacherId)===id(req.user._id);
     const canManage=hasPermission(req.user,'videos.manage')||hasPermission(req.user,'videos.upload');
     if(!video.published&&!owner&&!canManage)return {allowed:false,status:404,message:'Videodars topilmadi'};
     return {allowed:true};
   }
   if(!video.published)return {allowed:false,status:404,message:'Videodars topilmadi'};
   const gid=await resolveUserGroupId(req.user);
   const course=video.courseId?await Course.findOne({_id:id(video.courseId),active:true}).select('groupId').lean():null;
   if(video.courseId&&!course)return {allowed:false,status:403,message:'Bu fan faol emas'};
   if(!videoAllowedForGroup({groupIds:video.groupIds,courseId:course?{groupId:course.groupId}:null},gid))
     return {allowed:false,status:403,message:'Video sizning guruhingizga biriktirilmagan'};
   // Legacy lessons may have subject but no courseId: they must still be locked.
   const match=video.courseId?{courseId:id(video.courseId),published:true}:{courseId:null,published:true};
   const candidates=await VideoLesson.find(match).select('_id courseId subject groupIds moduleTitle sequence createdAt').lean();
   const series=videoSeriesKey(video);
   const lessons=candidates.filter(v=>videoSeriesKey(v)===series&&videoAllowedForGroup({...v,courseId:course?{groupId:course.groupId}:null},gid));
   if(!lessons.some(v=>id(v._id)===id(video._id)))lessons.push(video);
   const progress=await VideoProgress.find({userId:req.user._id,videoId:{$in:lessons.map(v=>v._id)}})
     .select('videoId completed durationSeconds lastPositionSeconds watchedSeconds').lean();
   const map=Object.fromEntries(progress.map(p=>[id(p.videoId),p]));
   const result=annotateVideoLocks(lessons,map,true).find(v=>id(v._id)===id(video._id));
   if(result?.locked)return {allowed:false,locked:true,status:423,prerequisiteVideoId:result.prerequisiteVideoId,message:'Avvalgi videomavzuni oxirigacha ko‘ring. Boshqa mavzu hozircha yopiq.'};
   return {allowed:true};
 };
}
