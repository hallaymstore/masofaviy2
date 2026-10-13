// Teacher-owned private media vault. GridFS bytes are stored once, course links are separate ACL-scoped records.
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import Busboy from 'busboy';
import JSZip from 'jszip';
import {checkResourceHeader,validateOfficePackage} from './resource-upload.js';
import {parseResourceFilename,acceptableZipEntries,normalizeAssetCourseIds} from './resource-vault-rules.js';
const MAX_UPLOAD=42*1024*1024, MAX_ZIP=30*1024*1024;
export function installResourceVault(app,{mongoose,auth,audit,Resource,Course,courseAccess}){
 const oid=mongoose.Schema.Types.ObjectId;
 const schema=new mongoose.Schema({
   ownerId:{type:oid,ref:'User',required:true,index:true},
   title:{type:String,required:true,maxlength:200},originalName:String,
   kind:{type:String,required:true},mimeType:String,size:Number,fileId:oid,
   url:String,topicHint:String,position:Number,archived:{type:Boolean,default:false,index:true}
 },{timestamps:true});
 const Asset=mongoose.models.TeacherAsset||mongoose.model('TeacherAsset',schema);
 const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'edu_resources'});
 const fail=(msg,status=400)=>Object.assign(new Error(msg),{status});
 const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'})}};
 const requireStaff=req=>{if(!['teacher','admin','superadmin','tech','rectorate','dean','department'].includes(req.user.role))throw fail('Bu bo‘lim faqat xodimlar uchun',403)};
 const owned=async(req,id)=>{if(!mongoose.isValidObjectId(id))throw fail('Resurs ID noto‘g‘ri');const item=await Asset.findOne({_id:id,ownerId:req.user._id,archived:false});if(!item)throw fail('Shaxsiy resurs topilmadi',404);return item};
 const uploadBody=async req=>{
   if(!/^multipart\/form-data;/i.test(req.headers['content-type']||''))throw fail('multipart/form-data yuboring',415);
   return await new Promise((resolve,reject)=>{
     let chunks=[],total=0,filename='',error=null,files=0;const fields={};
     const parser=Busboy({headers:req.headers,limits:{fileSize:MAX_UPLOAD,files:1,fields:4,parts:5}});
     parser.on('field',(name,value)=>{if(['title','topicHint'].includes(name))fields[name]=String(value).slice(0,180)});
     parser.on('file',(_field,stream,info)=>{
       files++;filename=path.posix.basename(String(info.filename||'').replaceAll('\\','/')).slice(0,160);
       stream.on('limit',()=>{error=fail('Fayl 42 MB chegaradan oshdi',413)});
       stream.on('data',chunk=>{total+=chunk.length;if(total<=MAX_UPLOAD)chunks.push(chunk)});
       stream.on('error',e=>{error=e});
     });
     parser.on('error',reject);
     parser.on('finish',()=>error?reject(error):files!==1||!filename?reject(fail('Bitta fayl tanlang')):resolve({filename,buffer:Buffer.concat(chunks),fields}));
     req.pipe(parser);
   });
 };
 const save=async(ownerId,filename,buffer,title='',topicHint='')=>{
   const meta=parseResourceFilename(filename);
   const type=await checkResourceHeader(filename,buffer.subarray(0,8192));
   if(type.extension==='zip')throw fail('Ichma-ich ZIP yuklash mumkin emas');
   await validateOfficePackage(Readable.from([buffer]),type.extension,buffer.length);
   const grid=bucket().openUploadStream(filename,{metadata:{ownerId:String(ownerId),kind:'private-library'}});
   try{
     await pipeline(Readable.from([buffer]),grid);
     return await Asset.create({ownerId,title:(title||meta.title).slice(0,180),
       originalName:filename,kind:type.kind,mimeType:type.mimeType,size:buffer.length,fileId:grid.id,
       topicHint:(topicHint||meta.topicHint).slice(0,180),position:meta.position});
   }catch(e){await bucket().delete(grid.id).catch(()=>{});throw e}
 };
 app.get('/api/lms/my-assets',auth,wrap(async(req,res)=>{
   requireStaff(req);
   const rows=await Asset.find({ownerId:req.user._id,archived:false}).sort({createdAt:-1}).limit(250).lean();
   res.set('Cache-Control','private,no-store');
   res.json(rows.map(({fileId,...a})=>a));
 }));
 // Stream long lecture recordings without buffering 1 GB in application memory.
 app.post('/api/lms/my-assets/video-upload',auth,wrap(async(req,res)=>{
   requireStaff(req);
   if(mongoose.connection.readyState!==1)throw fail('Fayl serveri tayyor emas',503);
   if(!/^multipart\/form-data;/i.test(req.headers['content-type']||''))throw fail('multipart/form-data yuboring',415);
   const maxBytes=Math.min(1024,Math.max(50,Number(process.env.MAX_RESOURCE_MB)||1024))*1024*1024;
   let gridId,uploaded=null,problem=null,parts=0,bytes=0,metadata={},filePromise=null;
   try{
     const parser=Busboy({headers:req.headers,limits:{fileSize:maxBytes,files:1,fields:2,parts:3}});
     parser.on('field',(key,value)=>{if(key==='title')metadata.title=value.slice(0,180)});
     parser.on('file',(_key,stream,info)=>{
       parts++;
       const filename=path.posix.basename(String(info.filename||'').replaceAll('\\','/')).slice(0,160);
       if(!filename||parts!==1){problem=fail('Bitta videofayl tanlang');stream.resume();return}
       let head=Buffer.alloc(0);
       const writer=bucket().openUploadStream(filename,{metadata:{ownerId:String(req.user._id),kind:'private-lecture'}});
       gridId=writer.id;
       stream.on('data',chunk=>{bytes+=chunk.length;if(head.length<8192)head=Buffer.concat([head,chunk.subarray(0,8192-head.length)])});
       stream.on('limit',()=>{problem=fail('Video hajmi server chegarasidan oshdi',413)});
       filePromise=pipeline(stream,writer).then(()=>({filename,head})).catch(e=>{problem=e;return null});
     });
     await new Promise((resolve,reject)=>{parser.on('finish',resolve);parser.on('error',reject);req.pipe(parser)});
     if(!filePromise)throw fail('Videofayl tanlang');
     uploaded=await filePromise;if(problem)throw problem;
     if(!uploaded||!bytes)throw fail('Bo‘sh video fayli');
     const type=await checkResourceHeader(uploaded.filename,uploaded.head);
     if(type.kind!=='video')throw fail('Bu yerga faqat videofayl yuklang');
     const meta=parseResourceFilename(uploaded.filename);
     const asset=await Asset.create({ownerId:req.user._id,title:metadata.title||meta.title,originalName:uploaded.filename,
       kind:type.kind,mimeType:type.mimeType,size:bytes,fileId:gridId,topicHint:meta.topicHint,position:meta.position});
     audit(req,'TEACHER_VIDEO_UPLOAD','TeacherAsset',asset.id,{size:bytes});
     res.status(201).json({assets:[{_id:asset.id,title:asset.title,kind:asset.kind,originalName:asset.originalName}]});
   }catch(e){if(gridId)await bucket().delete(gridId).catch(()=>{});throw e}
 }));
 app.post('/api/lms/my-assets/upload',auth,wrap(async(req,res)=>{
   requireStaff(req);
   if(mongoose.connection.readyState!==1)throw fail('Fayl serveri tayyor emas',503);
   const {filename,buffer,fields}=await uploadBody(req);
   if(!buffer.length)throw fail('Bo‘sh fayl qabul qilinmaydi');
   const extension=path.extname(filename).toLowerCase();
   const created=[];
   try{
     if(extension==='.zip'){
       if(buffer.length>MAX_ZIP)throw fail('ZIP 30 MB dan oshmasin',413);
       const zip=await JSZip.loadAsync(buffer).catch(()=>{throw fail('ZIP arxiv buzilgan')});
       const entries=acceptableZipEntries(zip);
       for(const entry of entries){
         const name=path.posix.basename(entry.name);
         if(!name||name.startsWith('.'))continue;
         const bytes=await entry.async('nodebuffer');
         const row=await save(req.user._id,name,bytes);
         created.push(row);
       }
     }else{
       created.push(await save(req.user._id,filename,buffer,fields.title,fields.topicHint));
     }
     audit(req,'TEACHER_ASSET_UPLOAD','TeacherAsset',String(req.user._id),{count:created.length});
     res.status(201).json({assets:created.map(({_id,title,kind,originalName,topicHint,position})=>({_id,title,kind,originalName,topicHint,position}))});
   }catch(e){
     for(const item of created){await Asset.deleteOne({_id:item._id}).catch(()=>{});if(item.fileId)await bucket().delete(item.fileId).catch(()=>{})}
     throw e;
   }
 }));
 app.post('/api/lms/my-assets/link',auth,wrap(async(req,res)=>{
   requireStaff(req);
   const title=String(req.body.title||'').trim(),url=String(req.body.url||'').trim();
   let parsed;try{parsed=new URL(url)}catch{}
   if(!title||title.length>180||parsed?.protocol!=='https:')throw fail('Nom va HTTPS havola kerak');
   const item=await Asset.create({ownerId:req.user._id,title,kind:'link',url,originalName:title});
   audit(req,'TEACHER_ASSET_LINK','TeacherAsset',item.id);
   res.status(201).json({assets:[{_id:item.id,title:item.title,kind:'link'}]});
 }));
 app.post('/api/lms/my-assets/assign',auth,wrap(async(req,res)=>{
   requireStaff(req);
   const courseIds=normalizeAssetCourseIds(req.body.courseIds);
   const assetIds=Array.isArray(req.body.assetIds)?[...new Set(req.body.assetIds.map(String))]:[];
   if(!assetIds.length||assetIds.length>35||assetIds.some(x=>!mongoose.isValidObjectId(x)))throw fail('1–35 ta shaxsiy resurs tanlang');
   // Validate ALL group/course permissions before starting writes.
   const courses=await Promise.all(courseIds.map(id=>courseAccess(req,id,true)));
   const assets=await Asset.find({_id:{$in:assetIds},ownerId:req.user._id,archived:false}).lean();
   if(assets.length!==assetIds.length)throw fail('Barcha resurslar o‘zingizga tegishli bo‘lishi kerak',403);
   const Topic=mongoose.models.CourseTopic,Link=mongoose.models.CourseTopicLink;
   const linked=[];
   for(const course of courses){
     const given=String(req.body.topicsByCourse?.[String(course._id)]||'');
     let topic=null;
     if(given){
       if(!mongoose.isValidObjectId(given))throw fail('Mavzu ID noto‘g‘ri');
       topic=await Topic?.findOne({_id:given,courseId:course._id}).lean();
       if(!topic)throw fail('Mavzu tanlangan fanga tegishli emas');
     }
     for(const asset of assets){
       const criteria={courseId:course._id,vaultAssetId:asset._id};
       let item=await Resource.findOne(criteria);
       if(!item){
         item=await Resource.create({...criteria,title:asset.title,kind:asset.kind,url:asset.url,
           fileId:asset.fileId,originalName:asset.originalName,mimeType:asset.mimeType,
           size:asset.size,createdBy:req.user._id});
       }
       const matching=topic||((asset.topicHint&&Topic)?await Topic.findOne({courseId:course._id,title:asset.topicHint}).collation({locale:'en',strength:2}).lean():null);
       if(matching&&Link){
         await Link.findOneAndUpdate({courseId:course._id,itemType:'resource',itemId:item._id},
           {$set:{topicId:matching._id},$setOnInsert:{position:0}},{upsert:true,new:true});
       }
       linked.push({courseId:String(course._id),resourceId:String(item._id)});
     }
   }
   audit(req,'TEACHER_ASSET_ASSIGN','TeacherAsset',String(req.user._id),{assetCount:assets.length,courseCount:courses.length});
   res.status(201).json({linked,count:linked.length});
 }));
 app.get('/api/lms/my-assets/:id/content',auth,wrap(async(req,res)=>{
   requireStaff(req);
   const asset=await owned(req,req.params.id);
   if(!asset.fileId)throw fail('Fayl topilmadi',404);
   res.set('Content-Type',asset.mimeType||'application/octet-stream');
   res.set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(asset.originalName||'file'));
   res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','private,no-store');
   bucket().openDownloadStream(asset.fileId).on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy()}).pipe(res);
 }));
 app.delete('/api/lms/my-assets/:id',auth,wrap(async(req,res)=>{
   requireStaff(req);const asset=await owned(req,req.params.id);
   const Video=mongoose.models.VideoLesson;
   if(await Resource.exists({vaultAssetId:asset._id})||await Video?.exists({$or:[{sourceAssetId:asset._id},{coverAssetId:asset._id}]}))throw fail('Resurs fan yoki videoda ishlatilmoqda: avval ajrating',409);
   await asset.deleteOne();if(asset.fileId)await bucket().delete(asset.fileId).catch(()=>{});
   audit(req,'TEACHER_ASSET_DELETE','TeacherAsset',asset.id);res.json({ok:true});
 }));
 return {Asset};
}
