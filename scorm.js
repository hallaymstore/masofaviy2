import crypto from 'node:crypto';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const MAX_ZIP=8*1024*1024, MAX_EXPANDED=40*1024*1024;
const validPath=p=>typeof p==='string'&&p.length<400&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\x00-\x1f]/.test(p);
const asArray=x=>x===undefined?[]:Array.isArray(x)?x:[x];
const encodedKey=k=>Buffer.from(k).toString('base64url');
const scormWritable=/^cmi\.(?:core\.(?:lesson_status|score\.(?:raw|min|max)|lesson_location|session_time|exit)|suspend_data|comments|objectives\.\d+\.(?:id|status|score\.(?:raw|min|max))|interactions\.\d+\.(?:id|type|time|correct_responses\.\d+\.pattern|weighting|student_response|result|latency|objectives\.\d+\.id))$/;
const mime=p=>({html:'text/html',htm:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',mp4:'video/mp4',mp3:'audio/mpeg',woff:'font/woff',woff2:'font/woff2'})[p.split('.').pop().toLowerCase()]||'application/octet-stream';

export async function inspectScormZip(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<100||buffer.length>MAX_ZIP)throw new Error('SCORM ZIP 8 MB dan oshmasin');
  const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});const files=Object.entries(zip.files).filter(([,f])=>!f.dir);
  if(files.length>500)throw new Error('Paketda juda ko‘p fayl');
  let total=0;
  for(const [path,file] of files){if(!validPath(path)||file.unsafeOriginalName&&file.unsafeOriginalName!==path||file.unixPermissions&&((file.unixPermissions&0o170000)===0o120000))throw new Error('Paketda xavfli fayl yo‘li');total+=file._data?.uncompressedSize||0;if(total>MAX_EXPANDED)throw new Error('Paket hajmi chegaradan oshgan')}
  if(!zip.file('imsmanifest.xml'))throw new Error('imsmanifest.xml paket ildizida bo‘lishi kerak');
  const xml=await zip.file('imsmanifest.xml').async('string');if(xml.length>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Manifest xavfsiz emas');
  const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,processEntities:false}).parse(xml);
  const manifest=parsed.manifest,organizations=manifest?.organizations,resources=asArray(manifest?.resources?.resource);
  const version=String(manifest?.metadata?.schemaversion||'1.2');if(!/^(?:1\.2|1\.1)$/i.test(version))throw new Error('SCORM 2004 paketi hozir qo‘llanmaydi; SCORM 1.2 ZIP yuklang');
  const organization=asArray(organizations?.organization).find(o=>o['@_identifier']===organizations?.['@_default'])||asArray(organizations?.organization)[0];
  const firstItem=asArray(organization?.item)[0],resource=resources.find(r=>r['@_identifier']===firstItem?.['@_identifierref'])||resources.find(r=>r['@_href']);
  let launch=String(resource?.['@_href']||'').split(/[?#]/)[0];try{launch=decodeURIComponent(launch)}catch{throw new Error('Launch manzili noto‘g‘ri')}
  if(!validPath(launch)||!zip.file(launch)||!/^text\/html$/.test(mime(launch)))throw new Error('SCORM launch HTML topilmadi');
  return {zip,launch,fileCount:files.length,standard:'SCORM 1.2'};
}

export function installScorm(app,{mongoose,auth,audit,courseAccess}){
  const id=mongoose.Schema.Types.ObjectId;
  const packageSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},zip:{type:Buffer,required:true},launch:{type:String,required:true},standard:String,fileCount:Number,published:{type:Boolean,default:true},createdBy:{type:id,ref:'User'}},{timestamps:true});
  const progressSchema=new mongoose.Schema({packageId:{type:id,ref:'ScormPackage',required:true},studentId:{type:id,ref:'User',required:true},values:{type:Map,of:String,default:{}},updatedAt:Date},{timestamps:true});
  progressSchema.index({packageId:1,studentId:1},{unique:true});
  const sessionSchema=new mongoose.Schema({tokenHash:{type:String,unique:true,required:true},packageId:{type:id,ref:'ScormPackage',required:true},studentId:{type:id,ref:'User',required:true},studentLogin:String,studentName:String,expiresAt:{type:Date,required:true}},{timestamps:true});
  sessionSchema.index({expiresAt:1},{expireAfterSeconds:0});
  const Package=mongoose.model('ScormPackage',packageSchema),Progress=mongoose.model('ScormProgress',progressSchema),Session=mongoose.model('ScormSession',sessionSchema);
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||400).json({message:e.message||'SCORM xatosi'})}};
  const validId=v=>{if(!mongoose.isValidObjectId(v))throw new Error('ID noto‘g‘ri')};
  const sessionFor=async token=>Session.findOne({tokenHash:crypto.createHash('sha256').update(String(token)).digest('hex'),expiresAt:{$gt:new Date()}}).lean();
  app.get('/api/lms/courses/:id/scorm',auth,wrap(async(req,res)=>{await courseAccess(req,req.params.id);res.json(await Package.find({courseId:req.params.id,published:true}).select('-zip').sort({createdAt:-1}).lean())}));
  app.post('/api/lms/courses/:id/scorm',auth,wrap(async(req,res)=>{
    await courseAccess(req,req.params.id,true);const content=String(req.body.contentBase64||'');if(content.length>MAX_ZIP*1.4)throw new Error('Paket hajmi 8 MB dan oshmasin');
    const buffer=Buffer.from(content,'base64');const inspected=await inspectScormZip(buffer);
    const row=await Package.create({courseId:req.params.id,title:String(req.body.title||'').trim(),zip:buffer,launch:inspected.launch,standard:inspected.standard,fileCount:inspected.fileCount,createdBy:req.user._id});
    audit(req,'SCORM_IMPORT','ScormPackage',row.id,{standard:row.standard,fileCount:row.fileCount});res.status(201).json({id:row.id,launch:row.launch,standard:row.standard,fileCount:row.fileCount});
  }));
  app.post('/api/lms/scorm/:id/launch',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Faqat talaba ishga tushiradi'});validId(req.params.id);const pkg=await Package.findById(req.params.id).select('-zip').lean();if(!pkg?.published)return res.status(404).json({message:'Paket topilmadi'});await courseAccess(req,pkg.courseId);
    const token=crypto.randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+2*60*60*1000);
    await Session.create({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),packageId:pkg._id,studentId:req.user._id,studentLogin:req.user.login,studentName:req.user.fullName,expiresAt});
    const progress=await Progress.findOne({packageId:pkg._id,studentId:req.user._id}).lean();audit(req,'SCORM_LAUNCH','ScormPackage',pkg.id);
    res.json({url:'/api/scorm-content/'+token+'/'+pkg.launch,token,values:Object.fromEntries([...(progress?.values||new Map())].map(([k,v])=>[Buffer.from(k,'base64url').toString(),v]))});
  }));
  app.post('/api/lms/scorm/:id/progress',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Ruxsat yo‘q'});validId(req.params.id);const session=await sessionFor(req.body.token);
    if(!session||String(session.packageId)!==req.params.id||String(session.studentId)!==String(req.user._id))return res.status(403).json({message:'Sessiya yaroqsiz'});
    const entries=Object.entries(req.body.values||{});if(entries.length>500||JSON.stringify(req.body.values||{}).length>60000||entries.some(([k,v])=>!scormWritable.test(k)||typeof v!=='string'||v.length>4096))throw new Error('SCORM ma’lumoti noto‘g‘ri');
    const changes=Object.fromEntries(entries.map(([k,v])=>['values.'+encodedKey(k),v]));
    await Progress.findOneAndUpdate({packageId:session.packageId,studentId:session.studentId},{$set:{...changes,updatedAt:new Date()}},{upsert:true,runValidators:true});
    if(entries.some(([key])=>key==='cmi.core.lesson_status'))audit(req,'SCORM_STATUS','ScormPackage',req.params.id,{status:req.body.values['cmi.core.lesson_status']});res.json({ok:true});
  }));
  app.get(/^\/api\/scorm-content\/([a-f0-9]{64})\/(.+)$/,wrap(async(req,res)=>{
    res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.set('X-Content-Type-Options','nosniff');
    const session=await sessionFor(req.params[0]);if(!session)return res.status(404).end();
    let path;try{path=decodeURIComponent(req.params[1])}catch{return res.status(400).end()};if(!validPath(path))return res.status(400).end();
    const pkg=await Package.findById(session.packageId);if(!pkg?.published)return res.status(404).end();
    const zip=await JSZip.loadAsync(pkg.zip);const file=zip.file(path);if(!file||file.dir)return res.status(404).end();
    const data=await file.async('nodebuffer');if(data.length>MAX_EXPANDED)return res.status(413).end();
    // An iframe without allow-same-origin has an opaque origin: 'self' alone would block its package assets.
    const host=String(req.get('host')||'');if(!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host))return res.status(400).end();
    const packageOrigin=`${req.protocol}://${host}`;
    res.set('Content-Type',mime(path));res.set('Content-Security-Policy',`default-src ${packageOrigin} data: blob:; script-src ${packageOrigin} 'unsafe-inline' 'unsafe-eval' blob:; style-src ${packageOrigin} 'unsafe-inline'; connect-src 'none'; frame-ancestors ${packageOrigin}; form-action 'none'; base-uri 'none'`);
    if(path===pkg.launch){
      const html=data.toString('utf8');const shim=`<script>${runtimeShim(req.params[0],{id:session.studentLogin,name:session.studentName})}</script>`;
      return res.send(/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+shim):shim+html);
    }
    res.end(data);
  }));
}

export function runtimeShim(token,identity={}){return `(${scormRuntime.toString()})(${JSON.stringify(token)},${JSON.stringify(identity)});`}

function scormRuntime(token,identity){
  const values={},defaults={'cmi.core.lesson_status':'not attempted','cmi.core.score.raw':'','cmi.core.lesson_location':'','cmi.suspend_data':'','cmi.core.total_time':'0000:00:00.00','cmi.core.lesson_mode':'normal','cmi.core.credit':'credit','cmi.core.student_id':identity.id||'','cmi.core.student_name':identity.name||''};
  const writable=/^cmi\.(?:core\.(?:lesson_status|score\.(?:raw|min|max)|lesson_location|session_time|exit)|suspend_data|comments|objectives\.\d+\.(?:id|status|score\.(?:raw|min|max))|interactions\.\d+\.(?:id|type|time|correct_responses\.\d+\.pattern|weighting|student_response|result|latency|objectives\.\d+\.id))$/;
  let error='0',phase='new';const fail=code=>{error=code;return 'false'};
  const report=()=>parent.postMessage({kind:'scorm-progress',token,values},'*');
  window.API={
    LMSInitialize:()=>{if(phase!=='new')return fail('101');phase='active';error='0';parent.postMessage({kind:'scorm-ready',token},'*');return 'true'},
    LMSFinish:()=>{if(phase!=='active')return fail('301');report();phase='finished';error='0';return 'true'},
    LMSGetValue:k=>{if(phase!=='active'){error='301';return ''}error='0';if(k==='cmi.core.entry')return values['cmi.core.lesson_status']?'resume':'ab-initio';if(k==='cmi.objectives._count'||k==='cmi.interactions._count'){const prefix=k.split('._count')[0]+'.';return String(new Set(Object.keys(values).filter(x=>x.startsWith(prefix)).map(x=>x.split('.')[2])).size)}if(k in values)return values[k];if(k in defaults)return defaults[k];error='401';return ''},
    LMSSetValue:(k,v)=>{if(phase!=='active')return fail('132');if(typeof k!=='string'||!writable.test(k))return fail('401');if(String(v).length>4096)return fail('405');values[k]=String(v);error='0';return 'true'},
    LMSCommit:()=>{if(phase!=='active')return fail('301');report();error='0';return 'true'},
    LMSGetLastError:()=>error,
    LMSGetErrorString:code=>({'0':'No error','101':'General exception','132':'Store Data Before Initialization','301':'Not initialized','401':'Undefined data model element','405':'Incorrect data type'})[code]||'General error',
    LMSGetDiagnostic:code=>String(code||error)
  };
  window.addEventListener('message',e=>{if(e.source!==parent||e.data?.kind!=='scorm-state'||e.data?.token!==token)return;Object.assign(values,e.data.values||{})});
}
