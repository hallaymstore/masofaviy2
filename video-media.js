// Protected local video streaming and cover images, sharing private vault files without duplication.
import {annotateVideoLocks,videoAllowedForGroup} from './video-learning-rules.js';
export function installVideoMedia(app,{mongoose,auth,VideoLesson,VideoProgress,Course,resolveUserGroupId,hasPermission}){
 const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'edu_resources'});
 const canView=async(req,video)=>{
   if(!video?.published&&!(hasPermission(req.user,'videos.manage')||String(video?.teacherId)===String(req.user._id)))return false;
   if(req.user.role!=='student')return true;
   const gid=await resolveUserGroupId(req.user);
   const course=video.courseId?await Course.findOne({_id:video.courseId,active:true}).select('groupId').lean():null;
   if(video.courseId&&!course)return false;
   if(!videoAllowedForGroup({groupIds:video.groupIds,courseId:course?{groupId:course.groupId}:null},gid))return false;
   if(!video.courseId)return true;
   const lessons=await VideoLesson.find({courseId:video.courseId,published:true}).select('_id courseId moduleTitle sequence createdAt').lean();
   const progress=await VideoProgress.find({userId:req.user._id,videoId:{$in:lessons.map(x=>x._id)}}).select('videoId completed').lean();
   const pm=Object.fromEntries(progress.map(p=>[String(p.videoId),p]));
   return !annotateVideoLocks(lessons,pm,true).find(x=>String(x._id)===String(video._id))?.locked;
 };
 for(const type of ['media','cover']){
   app.get('/api/videos/:id/'+type,auth,async(req,res)=>{
     try{
       const video=mongoose.isValidObjectId(req.params.id)?await VideoLesson.findById(req.params.id).lean():null;
       const assetId=type==='media'?video?.sourceAssetId:video?.coverAssetId;
       if(!assetId)return res.status(404).end();
       if(!await canView(req,video))return res.status(403).json({message:'Avvalgi mavzuni tugating yoki guruh ruxsatini tekshiring'});
       const Asset=mongoose.models.TeacherAsset,asset=await Asset?.findById(assetId).lean();
       if(!asset?.fileId||!asset.size)return res.status(404).end();
       if(type==='media'&&asset.kind!=='video'||type==='cover'&&asset.kind!=='image')return res.status(415).end();
       res.set('Content-Type',asset.mimeType||'application/octet-stream');
       res.set('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(asset.originalName||'file'));
       res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
       res.set('Accept-Ranges','bytes');
       const range=String(req.headers.range||'').match(/^bytes=(\d*)-(\d*)$/);
       let start=0,end=asset.size;
       if(range){
         if(!range[1]&&!range[2])return res.status(416).end();
         if(range[1]&&range[2])end=Math.min(asset.size,Number(range[2])+1);
         start=range[1]?Number(range[1]):Math.max(0,asset.size-Number(range[2]));
         if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end||start>=asset.size)return res.status(416).end();
         res.status(206);res.set('Content-Range',`bytes ${start}-${end-1}/${asset.size}`);
       }
       res.set('Content-Length',String(end-start));
       bucket().openDownloadStream(asset.fileId,{start,end}).on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy()}).pipe(res);
     }catch(e){if(!res.headersSent)res.status(400).json({message:e.message})}
   });
 }
}
