// University branding images are stored locally (MongoDB GridFS), not in external hotlink services.
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import Busboy from 'busboy';
import {checkResourceHeader} from './resource-upload.js';
export function installBrandingUploads(app,{mongoose,auth,InstitutionSettings,audit}){
 const schema=new mongoose.Schema({kind:{type:String,enum:['logo','icon'],unique:true,required:true},fileId:{type:mongoose.Schema.Types.ObjectId},mimeType:String,size:Number},{timestamps:true});
 const Asset=mongoose.models.BrandingAsset||mongoose.model('BrandingAsset',schema);
 const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'edu_branding'});
 const validKind=value=>['logo','icon'].includes(value);
 app.get('/api/branding-media/:kind',async(req,res)=>{
   try{
     if(!validKind(req.params.kind))return res.status(404).end();
     const a=await Asset.findOne({kind:req.params.kind}).lean();
     if(!a?.fileId)return res.status(404).end();
     res.set('Content-Type',a.mimeType);res.set('Cache-Control','no-cache');res.set('X-Content-Type-Options','nosniff');
     bucket().openDownloadStream(a.fileId).on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy()}).pipe(res);
   }catch{res.status(404).end()}
 });
 app.post('/api/admin/branding-media/:kind',auth,async(req,res)=>{
   if(!['admin','superadmin'].includes(req.user.role))return res.status(403).json({message:'Faqat administrator'});
   if(!validKind(req.params.kind))return res.status(404).end();
   if(mongoose.connection.readyState!==1)return res.status(503).json({message:'Bazaga ulanish yo‘q'});
   let file=null,gridId=null;
   try{
     if(!/^multipart\/form-data;/i.test(req.headers['content-type']||''))return res.status(415).end();
     const parsed=await new Promise((resolve,reject)=>{
       let chunks=[],total=0,name='',count=0,error;
       const bus=Busboy({headers:req.headers,limits:{fileSize:6*1024*1024,files:1,parts:1}});
       bus.on('file',(_key,stream,info)=>{
         count++;name=String(info.filename||'').slice(0,120);
         stream.on('data',chunk=>{total+=chunk.length;if(total<=6*1024*1024)chunks.push(chunk)});
         stream.on('limit',()=>{error=Object.assign(new Error('Rasm 6 MB dan oshmasin'),{status:413})});
       });
       bus.on('error',reject);
       bus.on('finish',()=>error?reject(error):count!==1?reject(new Error('Rasm tanlang')):resolve({name,buffer:Buffer.concat(chunks)}));
       req.pipe(bus);
     });
     file=parsed;
     const type=await checkResourceHeader(file.name,file.buffer.subarray(0,8192));
     if(type.kind!=='image'||!['png','jpeg','jpg','webp'].includes(type.extension))throw new Error('PNG, JPG yoki WebP rasm kerak');
     if(req.params.kind==='icon'&&type.extension!=='png')throw new Error('PWA ilova ikonasi PNG bo‘lishi kerak');
     const out=bucket().openUploadStream(file.name,{metadata:{kind:req.params.kind,uploadedBy:String(req.user._id)}});
     gridId=out.id;await pipeline(Readable.from([file.buffer]),out);
     const previous=await Asset.findOneAndUpdate({kind:req.params.kind},{$set:{fileId:gridId,mimeType:type.mimeType,size:file.buffer.length}},{upsert:true,new:false});
     const url='/api/branding-media/'+req.params.kind,field=req.params.kind==='icon'?'appIconUrl':'logoUrl';
     await InstitutionSettings.findOneAndUpdate({key:'primary'},{$set:{[field]:url},$setOnInsert:{key:'primary'}},{upsert:true});
     if(previous?.fileId)await bucket().delete(previous.fileId).catch(()=>{});
     audit(req,'BRANDING_MEDIA_UPLOAD','InstitutionSettings',String(req.user._id),{kind:req.params.kind});
     res.status(201).json({url,kind:req.params.kind});
   }catch(e){if(gridId)await bucket().delete(gridId).catch(()=>{});res.status(e.status||400).json({message:e.message})}
 });
}
