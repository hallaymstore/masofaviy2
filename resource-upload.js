import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import { fileTypeFromBuffer } from 'file-type';
import JSZip from 'jszip';

const formats={
  pdf:['document','application/pdf'],docx:['document','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],xlsx:['document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],pptx:['presentation','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  doc:['document','application/msword'],xls:['document','application/vnd.ms-excel'],ppt:['presentation','application/vnd.ms-powerpoint'],
  odt:['document','application/vnd.oasis.opendocument.text'],ods:['document','application/vnd.oasis.opendocument.spreadsheet'],odp:['presentation','application/vnd.oasis.opendocument.presentation'],epub:['document','application/epub+zip'],
  txt:['document','text/plain'],md:['document','text/markdown'],csv:['document','text/csv'],srt:['document','text/plain'],vtt:['document','text/vtt'],
  jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],png:['image','image/png'],webp:['image','image/webp'],gif:['image','image/gif'],heic:['image','image/heic'],
  mp3:['audio','audio/mpeg'],m4a:['audio','audio/mp4'],wav:['audio','audio/wav'],ogg:['audio','audio/ogg'],flac:['audio','audio/flac'],
  mp4:['video','video/mp4'],webm:['video','video/webm'],mov:['video','video/quicktime'],mkv:['video','video/x-matroska'],avi:['video','video/x-msvideo'],
  zip:['archive','application/zip'],rar:['archive','application/vnd.rar'],'7z':['archive','application/x-7z-compressed']
};
const textExt=new Set(['txt','md','csv','srt','vtt']);
const officeParts={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'};
const compatible=(extension,detected)=>{
  if(textExt.has(extension))return !detected||detected.ext===extension;
  if(officeParts[extension])return detected?.ext==='zip'||detected?.ext===extension;
  if(['odt','ods','odp','epub'].includes(extension))return detected?.ext==='zip'||detected?.ext===extension;
  if(['doc','xls','ppt'].includes(extension))return detected?.ext==='cfb'||detected?.ext===extension;
  const aliases={jpeg:'jpg',m4a:'mp4',wav:'wav',ogg:'ogg'};
  return Boolean(detected&&((aliases[extension]||extension)===(aliases[detected.ext]||detected.ext)));
};
export const resourceFormats=Object.keys(formats);
export async function checkResourceHeader(filename,head){
  const extension=path.extname(filename).toLowerCase().slice(1),format=formats[extension];if(!format)throw new Error('Fayl turi ruxsat etilmagan');
  const detected=await fileTypeFromBuffer(head).catch(()=>null);
  if(!compatible(extension,detected))throw new Error('Fayl kengaytmasi va haqiqiy turi mos emas');
  if(textExt.has(extension)){if(head.includes(0))throw new Error('Matn faylida ikkilik ma’lumot bor');new TextDecoder('utf-8',{fatal:true}).decode(head,{stream:true})}
  return {extension,kind:format[0],mimeType:format[1]};
}
export async function validateOfficePackage(stream,extension,size){
  if(!officeParts[extension]&&!['odt','ods','odp','epub'].includes(extension))return;
  if(size>40*1024*1024)throw new Error('Office hujjati 40 MB dan oshmasin');
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const zip=await JSZip.loadAsync(Buffer.concat(chunks)).catch(()=>{throw new Error('Office fayli buzilgan')});
  if(officeParts[extension]){if(!zip.file('[Content_Types].xml')||!zip.file(officeParts[extension]))throw new Error('Office fayli turi mos emas')}
  else{const mt=zip.file('mimetype');const expected={odt:'application/vnd.oasis.opendocument.text',ods:'application/vnd.oasis.opendocument.spreadsheet',odp:'application/vnd.oasis.opendocument.presentation',epub:'application/epub+zip'}[extension];if(!mt||String(await mt.async('string')).trim()!==expected)throw new Error('Hujjat turi mos emas')}
}

export function installResourceUploads(app,{mongoose,auth,audit,Resource,courseAccess}){
  const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'edu_resources'});
  const maxBytes=Math.max(1,Math.min(Number(process.env.MAX_RESOURCE_MB)||1024,1024))*1024*1024;
  const upload=async(req,res)=>{
    let gridId;
    try{
      if(mongoose.connection.readyState!==1)return res.status(503).json({message:'Fayl saqlash xizmati ulanmagan'});
      await courseAccess(req,req.params.id,true);
      if(!/^multipart\/form-data;/.test(req.headers['content-type']||''))return res.status(415).json({message:'multipart/form-data yuboring'});
      let fields={},received=0,filePromise=null,error=null;
      const parser=Busboy({headers:req.headers,limits:{fileSize:maxBytes,files:1,fields:3,fieldSize:4000,parts:4}});
      parser.on('field',(name,value)=>{if(['title','description'].includes(name))fields[name]=value});
      parser.on('file',(_name,file,info)=>{
        const name=path.basename(String(info.filename||'')).slice(0,160);
        if(!name||filePromise){file.resume();error=new Error('Faqat bitta nomli fayl qabul qilinadi');return}
        const stream=bucket().openUploadStream(name,{metadata:{courseId:String(req.params.id),uploadedBy:String(req.user._id)}});gridId=stream.id;
        let first=Buffer.alloc(0);file.on('data',chunk=>{received+=chunk.length;if(first.length<8192)first=Buffer.concat([first,chunk.subarray(0,8192-first.length)])});
        file.on('limit',()=>{error=Object.assign(new Error('Fayl hajmi chegaradan oshdi'),{status:413})});
        filePromise=pipeline(file,stream).then(()=>({name,head:first})).catch(e=>{error=e;return null});
      });
      await new Promise((resolve,reject)=>{parser.on('finish',resolve);parser.on('error',reject);req.pipe(parser)});
      if(!filePromise)throw new Error('Fayl topilmadi');
      const file=await filePromise;if(error)throw error;
      const type=await checkResourceHeader(file.name,file.head),title=String(fields.title||file.name).trim().slice(0,200);if(!title)throw new Error('Sarlavha kiriting');
      await validateOfficePackage(bucket().openDownloadStream(gridId),type.extension,received);
      const row=await Resource.create({courseId:req.params.id,title,kind:type.kind,originalName:file.name,mimeType:type.mimeType,size:received,fileId:gridId,description:String(fields.description||'').slice(0,4000),createdBy:req.user._id});
      audit(req,'RESOURCE_UPLOAD','Resource',row.id,{kind:type.kind,size:received});res.status(201).json({id:row.id,title:row.title,kind:row.kind,size:row.size});
    }catch(e){if(gridId)await bucket().delete(gridId).catch(()=>{});res.status(e.status||400).json({message:e.message||'Yuklash bajarilmadi'})}
  };
  app.post('/api/lms/courses/:id/resources/upload',auth,upload);
  app.get('/api/lms/resources/:id/content',auth,async(req,res)=>{
    try{
      if(!mongoose.isValidObjectId(req.params.id))return res.status(400).end();const row=await Resource.findById(req.params.id).lean();if(!row?.fileId)return res.status(404).end();await courseAccess(req,row.courseId);
      const bucketInstance=bucket(),name=encodeURIComponent(row.originalName||'resource');
      res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','private, no-store');res.set('Accept-Ranges','bytes');res.set('Content-Type',row.mimeType);
      const inline=/^(image|audio|video)\//.test(row.mimeType)||row.mimeType==='application/pdf';
      res.set('Content-Disposition',`${inline?'inline':'attachment'}; filename*=UTF-8''${name}`);
      const range=String(req.headers.range||'').match(/^bytes=(\d*)-(\d*)$/);
      let start=0,end=row.size;
      if(range){if(!range[1]&&!range[2])return res.status(416).end();if(!range[1]){const last=Number(range[2]);start=Math.max(0,row.size-last)}else start=Number(range[1]);if(range[1]&&range[2])end=Math.min(row.size,Number(range[2])+1);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=end||start>=row.size)return res.status(416).end();res.status(206);res.set('Content-Range',`bytes ${start}-${end-1}/${row.size}`)}
      res.set('Content-Length',String(end-start));const stream=bucketInstance.openDownloadStream(row.fileId,{start,end});stream.on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy()});stream.pipe(res);
    }catch(e){res.status(e.status||403).json({message:e.message})}
  });
  app.delete('/api/lms/resources/:id',auth,async(req,res)=>{
    try{if(!mongoose.isValidObjectId(req.params.id))return res.status(400).end();const row=await Resource.findById(req.params.id);if(!row)return res.status(404).end();await courseAccess(req,row.courseId,true);await row.deleteOne();if(row.fileId)await bucket().delete(row.fileId).catch(()=>{});audit(req,'RESOURCE_DELETE','Resource',row.id);res.json({ok:true})}catch(e){res.status(e.status||400).json({message:e.message})}
  });
}
