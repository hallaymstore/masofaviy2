// Protected local video streaming and cover images, sharing private vault files without duplication.
export function installVideoMedia(app,{mongoose,auth,VideoLesson,VideoProgress,Course,resolveUserGroupId,hasPermission,checkVideoAccess}){
 const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'edu_resources'});
 const canView=async(req,video)=>(await checkVideoAccess(req,video)).allowed;
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
