import crypto from 'node:crypto';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const MAX_ZIP=8*1024*1024,MAX_EXPANDED=40*1024*1024;
const validPath=p=>typeof p==='string'&&p.length<400&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[\x00-\x1f]/.test(p);
const asArray=x=>x===undefined?[]:Array.isArray(x)?x:[x];
const encodedKey=k=>Buffer.from(k).toString('base64url');
const decodedValues=map=>Object.fromEntries([...(map||new Map())].map(([k,v])=>[Buffer.from(k,'base64url').toString(),v]));
const scormWritable=/^cmi\.(?:core\.(?:lesson_status|score\.(?:raw|min|max)|lesson_location|session_time|exit)|suspend_data|comments|objectives\.\d+\.(?:id|status|score\.(?:raw|min|max))|interactions\.\d+\.(?:id|type|time|correct_responses\.\d+\.pattern|weighting|student_response|result|latency|objectives\.\d+\.id))$/;
const mime=p=>({html:'text/html',htm:'text/html',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf'})[p.split('.').pop().toLowerCase()]||'application/octet-stream';
const text=x=>typeof x==='string'||typeof x==='number'?String(x):'';
const collectItems=(input,out=[])=>{for(const item of asArray(input)){const ref=text(item?.['@_identifierref']),identifier=text(item?.['@_identifier'])||ref||'sco-'+(out.length+1),title=text(item?.title)||identifier;if(ref)out.push({identifier,ref,title});if(item?.item)collectItems(item.item,out)}return out};

export async function inspectScormZip(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<100||buffer.length>MAX_ZIP)throw new Error('SCORM ZIP 8 MB dan oshmasin');
  const zip=await JSZip.loadAsync(buffer,{checkCRC32:true});const files=Object.entries(zip.files).filter(([,file])=>!file.dir);
  if(files.length>500)throw new Error('Paketda juda ko‘p fayl');
  let total=0;
  for(const [filePath,file] of files){if(!validPath(filePath)||file.unsafeOriginalName&&file.unsafeOriginalName!==filePath||file.unixPermissions&&((file.unixPermissions&0o170000)===0o120000))throw new Error('Paketda xavfli fayl yo‘li');total+=file._data?.uncompressedSize||0;if(total>MAX_EXPANDED)throw new Error('Paket hajmi chegaradan oshgan')}
  if(!zip.file('imsmanifest.xml'))throw new Error('imsmanifest.xml paket ildizida bo‘lishi kerak');
  const xml=await zip.file('imsmanifest.xml').async('string');if(xml.length>1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Manifest xavfsiz emas');
  const parsed=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,processEntities:false}).parse(xml);
  const manifest=parsed.manifest,organizations=manifest?.organizations,resources=asArray(manifest?.resources?.resource);
  const version=text(manifest?.metadata?.schemaversion)||'1.2';if(!/^(?:1\.2|1\.1)$/i.test(version))throw new Error('SCORM 2004 paketi hozir qo‘llanmaydi; SCORM 1.2 ZIP yuklang');
  const organization=asArray(organizations?.organization).find(o=>text(o?.['@_identifier'])===text(organizations?.['@_default']))||asArray(organizations?.organization)[0];
  const resourceById=new Map(resources.map(r=>[text(r?.['@_identifier']),r]));
  const rawItems=collectItems(organization?.item),candidates=rawItems.length?rawItems:resources.map((r,i)=>({identifier:text(r?.['@_identifier'])||'resource-'+(i+1),ref:text(r?.['@_identifier']),title:text(r?.['@_identifier'])||'SCO '+(i+1)}));
  const scoes=[];const seen=new Set();
  for(const item of candidates){const resource=resourceById.get(item.ref);let launch=text(resource?.['@_href']).split(/[?#]/)[0];if(!launch)continue;try{launch=decodeURIComponent(launch)}catch{throw new Error('Launch manzili noto‘g‘ri')}if(!validPath(launch)||!zip.file(launch)||!/^text\/html$/.test(mime(launch)))continue;const key=item.identifier+'\0'+launch;if(seen.has(key))continue;seen.add(key);scoes.push({identifier:item.identifier.slice(0,160),title:item.title.slice(0,300),launch})}
  if(!scoes.length)throw new Error('SCORM launch HTML topilmadi');if(scoes.length>100)throw new Error('Paketda SCO soni juda ko‘p');
  return {zip,launch:scoes[0].launch,scoes,fileCount:files.length,standard:'SCORM 1.2'};
}

export function installScorm(app,{mongoose,auth,audit,courseAccess}){
  const id=mongoose.Schema.Types.ObjectId;
  const scoSchema=new mongoose.Schema({identifier:{type:String,required:true},title:String,launch:{type:String,required:true}},{_id:false});
  const packageSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true},zip:{type:Buffer,required:true},launch:{type:String,required:true},scoes:{type:[scoSchema],default:[]},standard:String,fileCount:Number,published:{type:Boolean,default:true},createdBy:{type:id,ref:'User'}},{timestamps:true});
  const progressSchema=new mongoose.Schema({packageId:{type:id,ref:'ScormPackage',required:true},studentId:{type:id,ref:'User',required:true},values:{type:Map,of:String,default:{}},updatedAt:Date},{timestamps:true});
  progressSchema.index({packageId:1,studentId:1},{unique:true});
  const multiProgressSchema=new mongoose.Schema({packageId:{type:id,ref:'ScormPackage',required:true},studentId:{type:id,ref:'User',required:true},scoIdentifier:{type:String,required:true},values:{type:Map,of:String,default:{}},updatedAt:Date},{timestamps:true});
  multiProgressSchema.index({packageId:1,studentId:1,scoIdentifier:1},{unique:true});
  const sessionSchema=new mongoose.Schema({tokenHash:{type:String,unique:true,required:true},packageId:{type:id,ref:'ScormPackage',required:true},studentId:{type:id,ref:'User',required:true},studentLogin:String,studentName:String,scoIdentifier:String,launchPath:String,expiresAt:{type:Date,required:true}},{timestamps:true});
  sessionSchema.index({expiresAt:1},{expireAfterSeconds:0});
  const Package=mongoose.models.ScormPackage||mongoose.model('ScormPackage',packageSchema),Progress=mongoose.models.ScormProgress||mongoose.model('ScormProgress',progressSchema),MultiProgress=mongoose.models.ScormScoProgress||mongoose.model('ScormScoProgress',multiProgressSchema),Session=mongoose.models.ScormSession||mongoose.model('ScormSession',sessionSchema);
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||400).json({message:e.message||'SCORM xatosi'})}};
  const validId=v=>{if(!mongoose.isValidObjectId(v))throw new Error('ID noto‘g‘ri')};
  const sessionFor=async token=>Session.findOne({tokenHash:crypto.createHash('sha256').update(String(token)).digest('hex'),expiresAt:{$gt:new Date()}}).lean();
  const packageScoes=pkg=>pkg.scoes?.length?pkg.scoes.map(x=>({identifier:String(x.identifier),title:String(x.title||x.identifier),launch:String(x.launch)})):[{identifier:'default',title:pkg.title||'Dars',launch:pkg.launch}];
  const progressFor=async(pkg,studentId,scoIdentifier)=>{
    if(packageScoes(pkg).length>1)return MultiProgress.findOne({packageId:pkg._id,studentId,scoIdentifier}).lean();
    return Progress.findOne({packageId:pkg._id,studentId}).lean();
  };
  const writeProgress=async(session,values,multi)=>{
    const changes=Object.fromEntries(Object.entries(values).map(([k,v])=>['values.'+encodedKey(k),v])),base={$set:{...changes,updatedAt:new Date()}};
    return multi?MultiProgress.findOneAndUpdate({packageId:session.packageId,studentId:session.studentId,scoIdentifier:session.scoIdentifier},base,{upsert:true,runValidators:true}):Progress.findOneAndUpdate({packageId:session.packageId,studentId:session.studentId},base,{upsert:true,runValidators:true});
  };

  app.get('/api/lms/courses/:id/scorm',auth,wrap(async(req,res)=>{await courseAccess(req,req.params.id);res.json(await Package.find({courseId:req.params.id,published:true}).select('-zip').sort({createdAt:-1}).lean())}));
  app.post('/api/lms/courses/:id/scorm',auth,wrap(async(req,res)=>{
    await courseAccess(req,req.params.id,true);const encoded=String(req.body.contentBase64||'');if(encoded.length>MAX_ZIP*1.4)throw new Error('Paket hajmi 8 MB dan oshmasin');
    const buffer=Buffer.from(encoded,'base64');const inspected=await inspectScormZip(buffer);
    const row=await Package.create({courseId:req.params.id,title:String(req.body.title||'').trim()||'SCORM dars',zip:buffer,launch:inspected.launch,scoes:inspected.scoes,standard:inspected.standard,fileCount:inspected.fileCount,createdBy:req.user._id});
    audit(req,'SCORM_IMPORT','ScormPackage',row.id,{standard:row.standard,fileCount:row.fileCount,scoCount:row.scoes.length});res.status(201).json({id:row.id,launch:row.launch,scoes:row.scoes,standard:row.standard,fileCount:row.fileCount});
  }));
  app.post('/api/lms/scorm/:id/launch',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Faqat talaba ishga tushiradi'});validId(req.params.id);const pkg=await Package.findById(req.params.id).select('-zip').lean();if(!pkg?.published)return res.status(404).json({message:'Paket topilmadi'});await courseAccess(req,pkg.courseId);
    const scoes=packageScoes(pkg),requested=String(req.body?.scoId||''),sco=requested?scoes.find(x=>x.identifier===requested):scoes[0];if(!sco)return res.status(404).json({message:'SCO topilmadi'});
    const token=crypto.randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+2*60*60*1000),progress=await progressFor(pkg,req.user._id,sco.identifier);
    await Session.create({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),packageId:pkg._id,studentId:req.user._id,studentLogin:req.user.login,studentName:req.user.fullName,scoIdentifier:sco.identifier,launchPath:sco.launch,expiresAt});
    audit(req,'SCORM_LAUNCH','ScormPackage',pkg.id,{scoIdentifier:sco.identifier});
    res.json({url:'/api/scorm-content/'+token+'/'+sco.launch,token,sco:{identifier:sco.identifier,title:sco.title},values:decodedValues(progress?.values)});
  }));
  app.post('/api/lms/scorm/:id/progress',auth,wrap(async(req,res)=>{
    if(req.user.role!=='student')return res.status(403).json({message:'Ruxsat yo‘q'});validId(req.params.id);const session=await sessionFor(req.body.token);
    if(!session||String(session.packageId)!==req.params.id||String(session.studentId)!==String(req.user._id))return res.status(403).json({message:'Sessiya yaroqsiz'});
    const entries=Object.entries(req.body.values||{});if(entries.length>500||JSON.stringify(req.body.values||{}).length>60000||entries.some(([k,v])=>!scormWritable.test(k)||typeof v!=='string'||v.length>4096))throw new Error('SCORM ma’lumoti noto‘g‘ri');
    const pkg=await Package.findById(session.packageId).select('scoes launch title').lean();if(!pkg)return res.status(404).json({message:'Paket topilmadi'});await writeProgress(session,Object.fromEntries(entries),packageScoes(pkg).length>1);
    if(entries.some(([key])=>key==='cmi.core.lesson_status'))audit(req,'SCORM_STATUS','ScormPackage',req.params.id,{scoIdentifier:session.scoIdentifier,status:req.body.values['cmi.core.lesson_status']});res.json({ok:true});
  }));
  app.get(/^\/api\/scorm-content\/([a-f0-9]{64})\/(.+)$/,wrap(async(req,res)=>{
    res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.set('X-Content-Type-Options','nosniff');
    const token=req.params[0],session=await sessionFor(token);if(!session)return res.status(404).end();
    let filePath;try{filePath=decodeURIComponent(req.params[1])}catch{return res.status(400).end()};if(!validPath(filePath))return res.status(400).end();
    const pkg=await Package.findById(session.packageId);if(!pkg?.published)return res.status(404).end();
    const zip=await JSZip.loadAsync(pkg.zip),file=zip.file(filePath);if(!file||file.dir)return res.status(404).end();
    const data=await file.async('nodebuffer');if(data.length>MAX_EXPANDED)return res.status(413).end();
    const host=String(req.get('host')||'');if(!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host))return res.status(400).end();const packageOrigin=`${req.protocol}://${host}`;
    res.set('Content-Type',mime(filePath));res.set('Content-Security-Policy',`default-src ${packageOrigin} data: blob:; script-src ${packageOrigin} 'unsafe-inline' 'unsafe-eval' blob:; style-src ${packageOrigin} 'unsafe-inline'; connect-src 'none'; frame-ancestors ${packageOrigin}; form-action 'none'; base-uri 'none'`);
    if(filePath===session.launchPath){
      const progress=await progressFor(pkg,session.studentId,session.scoIdentifier),html=data.toString('utf8'),shim=`<script>${runtimeShim(token,{id:session.studentLogin,name:session.studentName},decodedValues(progress?.values))}</script>`;
      return res.send(/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,match=>match+shim):shim+html);
    }
    res.end(data);
  }));
}

const safeJson=value=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>({'<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'}[char]||char));
export function runtimeShim(token,identity={},initialValues={}){return `(${scormRuntime.toString()})(${safeJson(token)},${safeJson(identity)},${safeJson(initialValues)});`}

function scormRuntime(token,identity,initialValues){
  const values={...(initialValues||{})},defaults={
    'cmi.core._children':'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
    'cmi.core.score._children':'raw,min,max','cmi.objectives._children':'id,score,status','cmi.interactions._children':'id,objectives,time,type,correct_responses,weighting,student_response,result,latency',
    'cmi.core.lesson_status':'not attempted','cmi.core.score.raw':'','cmi.core.score.min':'','cmi.core.score.max':'','cmi.core.lesson_location':'','cmi.suspend_data':'','cmi.comments':'',
    'cmi.core.total_time':'0000:00:00.00','cmi.core.lesson_mode':'normal','cmi.core.credit':'credit','cmi.core.student_id':identity.id||'','cmi.core.student_name':identity.name||'',
    'cmi.launch_data':'','cmi.student_data.mastery_score':'','cmi.student_data.max_time_allowed':'','cmi.student_data.time_limit_action':''
  };
  const writable=/^cmi\.(?:core\.(?:lesson_status|score\.(?:raw|min|max)|lesson_location|session_time|exit)|suspend_data|comments|objectives\.\d+\.(?:id|status|score\.(?:raw|min|max))|interactions\.\d+\.(?:id|type|time|correct_responses\.\d+\.pattern|weighting|student_response|result|latency|objectives\.\d+\.id))$/;
  let error='0',phase='new';const fail=code=>{error=code;return 'false'};const report=()=>parent.postMessage({kind:'scorm-progress',token,values},'*');
  window.API={
    LMSInitialize:()=>{if(phase!=='new')return fail('101');phase='active';error='0';parent.postMessage({kind:'scorm-ready',token},'*');return 'true'},
    LMSFinish:()=>{if(phase!=='active')return fail('301');report();phase='finished';error='0';return 'true'},
    LMSGetValue:key=>{if(phase!=='active'){error='301';return ''}error='0';if(key==='cmi.core.entry')return Object.keys(initialValues||{}).length?'resume':'ab-initio';if(key==='cmi.objectives._count'||key==='cmi.interactions._count'){const prefix=key.split('._count')[0]+'.';return String(new Set(Object.keys(values).filter(x=>x.startsWith(prefix)).map(x=>x.split('.')[2])).size)}if(key in values)return values[key];if(key in defaults)return defaults[key];error='401';return ''},
    LMSSetValue:(key,value)=>{if(phase!=='active')return fail('132');if(typeof key!=='string'||!writable.test(key))return fail('401');if(String(value).length>4096)return fail('405');values[key]=String(value);error='0';return 'true'},
    LMSCommit:()=>{if(phase!=='active')return fail('301');report();error='0';return 'true'},
    LMSGetLastError:()=>error,
    LMSGetErrorString:code=>({'0':'No error','101':'General exception','132':'Store Data Before Initialization','301':'Not initialized','401':'Undefined data model element','405':'Incorrect data type'})[code]||'General error',
    LMSGetDiagnostic:code=>String(code||error)
  };
  window.addEventListener('pagehide',()=>{if(phase==='active')report()});
}
