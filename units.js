// HALLAYM EDU — university units (bo'limlar): leadership, faculties, kafedras, divisions, centres and services.
// Each unit switches on the building blocks it needs (announcements, online services with request tracking,
// documents, tasks, events, external apps, staff, distance learning) and manages them with its own unit roles.
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import Busboy from 'busboy';
import {checkResourceHeader,validateOfficePackage} from './resource-upload.js';
import {UNIT_KINDS,UNIT_ROLES,MODULE_KEYS,cleanModules,defaultModules,unitCan,effectiveUnitRole,audienceAllows,REQUEST_STATUSES,OPEN_STATUSES,canTransition,validateServiceFields,validateAnswers,requestNumber,dueDate,safeAppUrl} from './units-rules.js';
import {UNIT_PRESETS,ACADEMIC_SERVICES} from './units-presets.js';

const clean=(v,max=200)=>String(v??'').trim().slice(0,max);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const AUDIENCES=['public','members','students','staff'];
const SERVICE_AUDIENCES=['all','students','staff'];
const DOC_CATEGORIES={nizom:'Nizom va qoidalar',buyruq:'Buyruq va qarorlar',namuna:'Namuna va shakllar',hisobot:'Hisobotlar',reja:'Rejalar',boshqa:'Boshqa'};

export function createUnitModels(mongoose){
  const id=mongoose.Schema.Types.ObjectId;
  const def=(name,schema)=>mongoose.models[name]||mongoose.model(name,schema);
  const unit=new mongoose.Schema({
    kind:{type:String,enum:Object.keys(UNIT_KINDS),required:true,index:true},name:{type:String,required:true,trim:true,maxlength:200},shortName:{type:String,trim:true,maxlength:60},
    code:{type:String,trim:true,uppercase:true,maxlength:12},parentId:{type:id,ref:'OrgUnit',index:true},structureId:{type:id,ref:'Structure',index:true},
    description:{type:String,trim:true,maxlength:2000},contacts:{room:String,phone:String,email:String,hours:String,building:String},
    headUserId:{type:id,ref:'User'},modules:[String],apps:[{title:String,url:String,icon:String,embed:Boolean}],
    order:{type:Number,default:100},active:{type:Boolean,default:true,index:true},requestSeq:{type:Number,default:0}
  },{timestamps:true});
  unit.index({code:1},{unique:true,partialFilterExpression:{code:{$type:'string'}}});
  const member=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},userId:{type:id,ref:'User',required:true,index:true},role:{type:String,enum:Object.keys(UNIT_ROLES),default:'staff'},title:{type:String,trim:true,maxlength:160},active:{type:Boolean,default:true}},{timestamps:true});
  member.index({unitId:1,userId:1},{unique:true});
  const post=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:240},body:{type:String,trim:true,maxlength:10000},audience:{type:String,enum:AUDIENCES,default:'public'},pinned:{type:Boolean,default:false},requireAck:{type:Boolean,default:false},acks:[{userId:{type:id,ref:'User'},at:Date}],createdBy:{type:id,ref:'User'}},{timestamps:true});
  const doc=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:240},category:{type:String,enum:Object.keys(DOC_CATEGORIES),default:'boshqa'},visibility:{type:String,enum:['public','members'],default:'public'},fileId:{type:id,required:true},filename:String,mimeType:String,size:Number,createdBy:{type:id,ref:'User'}},{timestamps:true});
  const service=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:200},description:{type:String,trim:true,maxlength:1500},fields:[{key:String,label:String,type:{type:String},required:Boolean,options:[String]}],slaDays:{type:Number,default:5,min:0,max:90},audience:{type:String,enum:SERVICE_AUDIENCES,default:'all'},active:{type:Boolean,default:true}},{timestamps:true});
  const request=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},serviceId:{type:id,ref:'UnitService'},serviceTitle:String,number:{type:String,index:true},requesterId:{type:id,ref:'User',required:true,index:true},answers:{type:Object,default:{}},status:{type:String,enum:Object.keys(REQUEST_STATUSES),default:'new',index:true},assigneeId:{type:id,ref:'User',index:true},dueAt:Date,closedAt:Date,resolution:{type:String,trim:true,maxlength:2000},history:[{at:Date,by:{type:id,ref:'User'},action:String,status:String,note:String}]},{timestamps:true});
  const task=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:240},notes:{type:String,trim:true,maxlength:4000},assigneeId:{type:id,ref:'User',index:true},dueAt:Date,status:{type:String,enum:['todo','doing','done'],default:'todo',index:true},priority:{type:String,enum:['low','normal','high'],default:'normal'},createdBy:{type:id,ref:'User'}},{timestamps:true});
  const event=new mongoose.Schema({unitId:{type:id,ref:'OrgUnit',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:240},description:{type:String,trim:true,maxlength:4000},startsAt:{type:Date,required:true,index:true},endsAt:Date,place:{type:String,trim:true,maxlength:200},audience:{type:String,enum:AUDIENCES,default:'public'},registration:{type:Boolean,default:false},capacity:{type:Number,default:0},registrants:[{type:id,ref:'User'}],createdBy:{type:id,ref:'User'}},{timestamps:true});
  return {OrgUnit:def('OrgUnit',unit),UnitMember:def('UnitMember',member),UnitPost:def('UnitPost',post),UnitDoc:def('UnitDoc',doc),UnitService:def('UnitService',service),UnitRequest:def('UnitRequest',request),UnitTask:def('UnitTask',task),UnitEvent:def('UnitEvent',event)};
}

function gridStorage(mongoose){
  const bucket=()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'unit_files'});
  return {ready:()=>mongoose.connection.readyState===1,upload:(name,meta)=>{const s=bucket().openUploadStream(name,{metadata:meta});return {id:s.id,stream:s}},download:id=>bucket().openDownloadStream(id),remove:id=>bucket().delete(id)};
}

export function installUnits(app,{mongoose,User,Structure,auth,audit=()=>{},hasPermission=()=>false,models=null,storage=null}){
  const M=models||createUnitModels(mongoose);
  const {OrgUnit,UnitMember,UnitPost,UnitDoc,UnitService,UnitRequest,UnitTask,UnitEvent}=M;
  const files=storage||gridStorage(mongoose);
  app.use(['/api/units','/api/unit-requests','/api/units-workspace'],(req,_res,next)=>{if(!req.body||typeof req.body!=='object')req.body={};next()});
  const isId=v=>mongoose.isValidObjectId(v);
  const sid=v=>String(v?._id||v||'');
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){if(!res.headersSent)res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'})}};
  const perms=user=>['units.manage'].filter(p=>hasPermission(user,p));
  const isAdmin=user=>user?.role==='superadmin'||user?.role==='admin'||hasPermission(user,'units.manage');

  async function loadUnit(id){if(!isId(id))throw fail('Bo‘lim ID noto‘g‘ri');const u=await OrgUnit.findById(id).lean();if(!u||u.active===false)throw fail('Bo‘lim topilmadi',404);return u}
  async function roleIn(req,unit){
    req.unitRoles||=new Map();const key=sid(unit._id);if(req.unitRoles.has(key))return req.unitRoles.get(key);
    const membership=await UnitMember.findOne({unitId:unit._id,userId:req.user._id,active:true}).lean();
    const role=effectiveUnitRole({user:req.user,unit,membership,permissions:perms(req.user)});req.unitRoles.set(key,role);return role;
  }
  async function need(req,unit,action){const role=await roleIn(req,unit);if(!unitCan(role,action))throw fail('Bu amal uchun bo‘limda huquqingiz yetarli emas',403);return role}
  const userMap=async ids=>{const list=[...new Set(ids.filter(Boolean).map(sid))].filter(isId);if(!list.length)return new Map();const rows=await User.find({_id:{$in:list}}).select('_id fullName login role email phone avatarUrl').lean();return new Map(rows.map(u=>[sid(u._id),u]))};
  const brief=u=>u?{_id:sid(u._id),fullName:u.fullName||u.login,login:u.login,role:u.role}:null;
  const serviceVisible=(s,user,role)=>unitCan(role,'view_internal')||s.audience==='all'||(s.audience==='students'?user.role==='student':user.role!=='student');

  // Units in which the user has an explicit or implicit (academic) role — the user's «workplaces».
  async function myUnits(user){
    const memberships=await UnitMember.find({userId:user._id,active:true}).lean();
    const ids=new Set(memberships.map(m=>sid(m.unitId)));
    const structIds=[user.facultyId,user.departmentId].filter(Boolean).map(sid).filter(isId);
    const implicit=structIds.length&&['dean','department','teacher','tutor'].includes(user.role)?await OrgUnit.find({active:true,structureId:{$in:structIds}}).lean():[];
    const explicit=ids.size?await OrgUnit.find({_id:{$in:[...ids]},active:true}).lean():[];
    const byId=new Map([...explicit,...implicit].map(u=>[sid(u._id),u]));
    const out=[];for(const u of byId.values()){const membership=memberships.find(m=>sid(m.unitId)===sid(u._id))||null;const role=effectiveUnitRole({user,unit:u,membership,permissions:perms(user)});if(role&&role!=='viewer'||membership)out.push({unit:u,role,title:membership?.title||''})}
    return out.sort((a,b)=>(a.unit.order||100)-(b.unit.order||100)||a.unit.name.localeCompare(b.unit.name));
  }

  // ---------------- units ----------------
  app.get('/api/units',auth,wrap(async(req,res)=>{
    const units=await OrgUnit.find({active:true}).sort({order:1,name:1}).lean();
    const [services,heads,mine]=await Promise.all([UnitService.find({active:true}).select('unitId audience').lean(),userMap(units.map(u=>u.headUserId)),myUnits(req.user)]);
    const svc=new Map(),all=isAdmin(req.user);for(const s of services)if(all||serviceVisible(s,req.user,null))svc.set(sid(s.unitId),(svc.get(sid(s.unitId))||0)+1);
    const roles=Object.fromEntries(mine.map(x=>[sid(x.unit._id),x.role]));
    res.json({kinds:UNIT_KINDS,canManage:isAdmin(req.user),units:units.map(u=>({_id:sid(u._id),kind:u.kind,name:u.name,shortName:u.shortName||'',code:u.code||'',parentId:u.parentId?sid(u.parentId):null,structureId:u.structureId?sid(u.structureId):null,description:u.description||'',contacts:u.contacts||{},head:brief(heads.get(sid(u.headUserId))),modules:cleanModules(u.modules,u.kind),services:svc.get(sid(u._id))||0,myRole:isAdmin(req.user)?'admin':(roles[sid(u._id)]||null),order:u.order||100}))});
  }));
  const unitBody=(b,{adminEdit})=>{
    const out={};
    if(b.name!==undefined){out.name=clean(b.name,200);if(out.name.length<2)throw fail('Bo‘lim nomini kiriting')}
    if(b.shortName!==undefined)out.shortName=clean(b.shortName,60);
    if(b.description!==undefined)out.description=clean(b.description,2000);
    if(b.contacts!==undefined){const c=b.contacts||{};out.contacts={room:clean(c.room,80),phone:clean(c.phone,60),email:clean(c.email,120),hours:clean(c.hours,120),building:clean(c.building,120)}}
    if(b.modules!==undefined)out.modules=cleanModules(b.modules,b.kind);
    if(b.apps!==undefined){if(!Array.isArray(b.apps)||b.apps.length>24)throw fail('Ilovalar 24 tadan oshmasin');out.apps=b.apps.map(a=>({title:clean(a?.title,80),url:safeAppUrl(a?.url),icon:clean(a?.icon,8)||'🧩',embed:Boolean(a?.embed)})).filter(a=>a.title&&a.url)}
    if(adminEdit){
      if(b.kind!==undefined){if(!UNIT_KINDS[b.kind])throw fail('Bo‘lim turi noto‘g‘ri');out.kind=b.kind}
      if(b.code!==undefined)out.code=clean(b.code,12).toUpperCase().replace(/[^A-Z0-9]/g,'')||undefined;
      if(b.order!==undefined)out.order=Math.max(0,Math.min(9999,Number(b.order)||100));
      if(b.parentId!==undefined)out.parentId=b.parentId&&isId(b.parentId)?b.parentId:null;
    }
    return out;
  };
  app.post('/api/units',auth,wrap(async(req,res)=>{
    if(!isAdmin(req.user))throw fail('Faqat administrator bo‘lim yaratadi',403);
    const body=unitBody({...req.body,kind:req.body.kind},{adminEdit:true});if(!body.kind)throw fail('Bo‘lim turini tanlang');if(!body.name)throw fail('Bo‘lim nomini kiriting');
    if(body.parentId)await loadUnit(body.parentId);
    if(!body.modules)body.modules=defaultModules(body.kind);
    if(body.code&&await OrgUnit.exists({code:body.code}))throw fail('Bu kod band');
    const u=await OrgUnit.create(body);audit(req,'UNIT_CREATE','OrgUnit',sid(u._id),{name:u.name});res.status(201).json({_id:sid(u._id)});
  }));
  app.get('/api/units/:id',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u),internal=unitCan(role,'view_internal');
    const [members,services,parent,children]=await Promise.all([UnitMember.find({unitId:u._id,active:true}).lean(),UnitService.find({unitId:u._id,...(internal?{}:{active:true})}).sort({title:1}).lean(),u.parentId?OrgUnit.findById(u.parentId).select('_id name kind').lean():null,OrgUnit.find({parentId:u._id,active:true}).select('_id name kind').sort({order:1,name:1}).lean()]);
    const users=await userMap([u.headUserId,...members.map(m=>m.userId)]);
    let stats=null;
    if(internal){const [open,fresh,overdue,tasks]=await Promise.all([UnitRequest.countDocuments({unitId:u._id,status:{$in:OPEN_STATUSES}}),UnitRequest.countDocuments({unitId:u._id,status:'new'}),UnitRequest.countDocuments({unitId:u._id,status:{$in:OPEN_STATUSES},dueAt:{$lt:new Date()}}),UnitTask.countDocuments({unitId:u._id,status:{$ne:'done'}})]);stats={openRequests:open,newRequests:fresh,overdueRequests:overdue,openTasks:tasks}}
    let learning=null;
    if(u.structureId&&cleanModules(u.modules,u.kind).includes('learning')&&Structure){
      const kids=await Structure.find({parentId:u.structureId,active:true}).select('_id type name').lean();
      const groups=u.kind==='faculty'?await Structure.countDocuments({type:'group',active:true,parentId:{$in:kids.map(k=>k._id)}}):kids.filter(k=>k.type==='group').length;
      const teachers=await User.countDocuments({active:true,role:'teacher',...(u.kind==='faculty'?{facultyId:u.structureId}:{departmentId:u.structureId})});
      learning={kafedras:u.kind==='faculty'?kids.filter(k=>k.type==='department').length:0,groups,teachers};
    }
    res.json({unit:{...u,_id:sid(u._id),modules:cleanModules(u.modules,u.kind),apps:u.apps||[],requestSeq:undefined},kindLabel:UNIT_KINDS[u.kind],myRole:role,head:brief(users.get(sid(u.headUserId))),parent,children,
      members:members.map(m=>({_id:sid(m._id),role:m.role,title:m.title||'',user:(()=>{const x=users.get(sid(m.userId));return x?{...brief(x),email:x.email||'',phone:internal?(x.phone||''):''}:null})()})).filter(m=>m.user).sort((a,b)=>Object.keys(UNIT_ROLES).indexOf(a.role)-Object.keys(UNIT_ROLES).indexOf(b.role)||a.user.fullName.localeCompare(b.user.fullName)),
      services:services.filter(s=>serviceVisible(s,req.user,role)).map(s=>({_id:sid(s._id),title:s.title,description:s.description||'',fields:s.fields||[],slaDays:s.slaDays,audience:s.audience,active:s.active!==false})),stats,learning,roles:UNIT_ROLES,docCategories:DOC_CATEGORIES});
  }));
  app.patch('/api/units/:id',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await need(req,u,'manage_unit'),adminEdit=role==='admin';
    const body=unitBody({...req.body,kind:req.body.kind||u.kind},{adminEdit});
    if(body.parentId&&sid(body.parentId)===sid(u._id))throw fail('Bo‘lim o‘ziga bo‘ysunmaydi');
    if(body.code&&await OrgUnit.exists({code:body.code,_id:{$ne:u._id}}))throw fail('Bu kod band');
    if(adminEdit&&req.body.headUserId!==undefined){
      const head=req.body.headUserId&&isId(req.body.headUserId)?req.body.headUserId:null;body.headUserId=head;
      if(head)await UnitMember.findOneAndUpdate({unitId:u._id,userId:head},{$set:{role:'head',active:true}},{upsert:true,new:true});
    }
    await OrgUnit.updateOne({_id:u._id},{$set:body});audit(req,'UNIT_UPDATE','OrgUnit',sid(u._id),{fields:Object.keys(body)});res.json({ok:true});
  }));
  app.delete('/api/units/:id',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id);if(!isAdmin(req.user))throw fail('Faqat administrator',403);
    if(await OrgUnit.exists({parentId:u._id,active:true}))throw fail('Avval ichki bo‘limlarni boshqa joyga o‘tkazing yoki o‘chiring');
    await OrgUnit.updateOne({_id:u._id},{$set:{active:false}});audit(req,'UNIT_ARCHIVE','OrgUnit',sid(u._id));res.json({ok:true});
  }));

  // Faculties and kafedras mirror the academic structure (deans and kafedra heads get their unit automatically).
  async function syncAcademic(){
    if(!Structure)return {created:0};
    const rows=await Structure.find({type:{$in:['faculty','department']},active:true}).lean();let created=0;
    const byStruct=new Map((await OrgUnit.find({structureId:{$in:rows.map(r=>r._id)}}).lean()).map(u=>[sid(u.structureId),u]));
    for(const r of rows.filter(r=>r.type==='faculty').concat(rows.filter(r=>r.type==='department'))){
      const kind=r.type==='faculty'?'faculty':'kafedra';let u=byStruct.get(sid(r._id));
      const parentUnit=kind==='kafedra'&&r.parentId?byStruct.get(sid(r.parentId)):null;
      if(!u){
        u=await OrgUnit.create({kind,name:r.name,structureId:r._id,parentId:parentUnit?._id||null,modules:defaultModules(kind),order:kind==='faculty'?20:30,description:kind==='faculty'?'Fakultet (dekanat) sahifasi: e’lonlar, arizalar va masofaviy ta’lim ko‘rsatkichlari.':'Kafedra sahifasi: o‘qituvchilar, fanlar va talabalar bilan ishlash.'});
        byStruct.set(sid(r._id),u);created++;
        for(const s of ACADEMIC_SERVICES[kind]||[])await UnitService.create({unitId:u._id,...s,fields:validateServiceFields(s.fields)});
      }else if(u.name!==r.name||(parentUnit&&sid(u.parentId)!==sid(parentUnit._id))){await OrgUnit.updateOne({_id:u._id},{$set:{name:r.name,...(parentUnit?{parentId:parentUnit._id}:{}),active:true}})}
    }
    return {created};
  }
  app.post('/api/units/sync-academic',auth,wrap(async(req,res)=>{if(!isAdmin(req.user))throw fail('Faqat administrator',403);const r=await syncAcademic();audit(req,'UNIT_SYNC','OrgUnit','academic',r);res.json(r)}));
  app.post('/api/units/seed',auth,wrap(async(req,res)=>{
    if(!isAdmin(req.user))throw fail('Faqat administrator',403);
    const byCode=new Map((await OrgUnit.find({code:{$in:UNIT_PRESETS.map(p=>p.code)}}).lean()).map(u=>[u.code,u]));let created=0,services=0;
    for(const [i,p] of UNIT_PRESETS.entries()){
      if(byCode.has(p.code))continue;
      const parent=p.parent?byCode.get(p.parent):null;
      const u=await OrgUnit.create({kind:p.kind,code:p.code,name:p.name,description:p.description||'',parentId:parent?._id||null,modules:cleanModules(p.modules,p.kind),order:(p.kind==='leadership'?0:p.kind==='division'?40:p.kind==='center'?50:60)+i});
      byCode.set(p.code,u);created++;
      for(const s of p.services||[]){await UnitService.create({unitId:u._id,title:s.title,description:s.description||'',audience:s.audience||'all',slaDays:s.slaDays??5,fields:validateServiceFields(s.fields||[])});services++}
    }
    const academic=await syncAcademic();
    audit(req,'UNIT_SEED','OrgUnit','preset',{created,services,academic:academic.created});
    res.json({created,services,academic:academic.created});
  }));

  // ---------------- members ----------------
  app.get('/api/units/:id/user-search',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id);await need(req,u,'manage_members');
    const q=clean(req.query.q,60).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(q.length<2)return res.json([]);
    const rx=new RegExp(q,'i');const rows=await User.find({active:true,role:{$ne:'student'},$or:[{fullName:rx},{login:rx}]}).select('_id fullName login role').limit(15).lean();
    res.json(rows.map(brief));
  }));
  app.post('/api/units/:id/members',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),my=await need(req,u,'manage_members');
    const role=UNIT_ROLES[req.body.role]?req.body.role:'staff';
    if(role==='head'&&my!=='admin')throw fail('Rahbarni faqat administrator tayinlaydi',403);
    if(role==='deputy'&&!['admin','head'].includes(my))throw fail('O‘rinbosarni rahbar yoki administrator tayinlaydi',403);
    let target=null;
    if(req.body.userId&&isId(req.body.userId))target=await User.findById(req.body.userId).select('_id active role').lean();
    else if(req.body.login)target=await User.findOne({login:clean(req.body.login,80).toLowerCase()}).select('_id active role').lean();
    if(!target?.active)throw fail('Foydalanuvchi topilmadi');
    if(target.role==='student'&&role!=='viewer')throw fail('Talaba bo‘limga faqat kuzatuvchi sifatida qo‘shiladi');
    await UnitMember.findOneAndUpdate({unitId:u._id,userId:target._id},{$set:{role,title:clean(req.body.title,160),active:true}},{upsert:true,new:true});
    if(role==='head')await OrgUnit.updateOne({_id:u._id},{$set:{headUserId:target._id}});
    audit(req,'UNIT_MEMBER_SET','OrgUnit',sid(u._id),{userId:sid(target._id),role});res.status(201).json({ok:true});
  }));
  app.patch('/api/units/:id/members/:mid',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),my=await need(req,u,'manage_members');if(!isId(req.params.mid))throw fail('ID noto‘g‘ri');
    const m=await UnitMember.findOne({_id:req.params.mid,unitId:u._id}).lean();if(!m)throw fail('A’zo topilmadi',404);
    const set={};if(req.body.title!==undefined)set.title=clean(req.body.title,160);
    if(req.body.role!==undefined){const r=UNIT_ROLES[req.body.role]?req.body.role:m.role;if((r==='head'||m.role==='head')&&my!=='admin')throw fail('Rahbarni faqat administrator o‘zgartiradi',403);if((r==='deputy'||m.role==='deputy')&&!['admin','head'].includes(my))throw fail('Ruxsat yo‘q',403);set.role=r}
    await UnitMember.updateOne({_id:m._id},{$set:set});if(set.role==='head')await OrgUnit.updateOne({_id:u._id},{$set:{headUserId:m.userId}});res.json({ok:true});
  }));
  app.delete('/api/units/:id/members/:mid',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),my=await need(req,u,'manage_members');if(!isId(req.params.mid))throw fail('ID noto‘g‘ri');
    const m=await UnitMember.findOne({_id:req.params.mid,unitId:u._id}).lean();if(!m)throw fail('A’zo topilmadi',404);
    if(m.role==='head'&&my!=='admin')throw fail('Rahbarni faqat administrator olib tashlaydi',403);
    await UnitMember.deleteOne({_id:m._id});if(m.role==='head'&&sid(u.headUserId)===sid(m.userId))await OrgUnit.updateOne({_id:u._id},{$set:{headUserId:null}});
    audit(req,'UNIT_MEMBER_REMOVE','OrgUnit',sid(u._id),{userId:sid(m.userId)});res.json({ok:true});
  }));

  // ---------------- announcements ----------------
  app.get('/api/units/:id/posts',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u);
    const rows=(await UnitPost.find({unitId:u._id}).sort({pinned:-1,createdAt:-1}).limit(100).lean()).filter(p=>audienceAllows(p.audience,{user:req.user,unitRole:role}));
    const authors=await userMap(rows.map(p=>p.createdBy)),me=sid(req.user._id),internal=unitCan(role,'view_internal');
    res.json(rows.map(p=>({_id:sid(p._id),title:p.title,body:p.body||'',audience:p.audience,pinned:p.pinned,requireAck:p.requireAck,acked:(p.acks||[]).some(a=>sid(a.userId)===me),ackCount:internal?(p.acks||[]).length:undefined,author:authors.get(sid(p.createdBy))?.fullName||'',createdAt:p.createdAt})));
  }));
  const postBody=b=>{const t=clean(b.title,240);if(t.length<3)throw fail('Sarlavhani kiriting');return {title:t,body:clean(b.body,10000),audience:AUDIENCES.includes(b.audience)?b.audience:'public',pinned:Boolean(b.pinned),requireAck:Boolean(b.requireAck)}};
  app.post('/api/units/:id/posts',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');const p=await UnitPost.create({unitId:u._id,...postBody(req.body),createdBy:req.user._id});audit(req,'UNIT_POST','UnitPost',sid(p._id));res.status(201).json({_id:sid(p._id)})}));
  app.patch('/api/units/:id/posts/:pid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.pid))throw fail('ID noto‘g‘ri');await UnitPost.updateOne({_id:req.params.pid,unitId:u._id},{$set:postBody(req.body)});res.json({ok:true})}));
  app.delete('/api/units/:id/posts/:pid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.pid))throw fail('ID noto‘g‘ri');await UnitPost.deleteOne({_id:req.params.pid,unitId:u._id});res.json({ok:true})}));
  app.post('/api/units/:id/posts/:pid/ack',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u);if(!isId(req.params.pid))throw fail('ID noto‘g‘ri');
    const p=await UnitPost.findOne({_id:req.params.pid,unitId:u._id}).lean();if(!p||!audienceAllows(p.audience,{user:req.user,unitRole:role}))throw fail('E’lon topilmadi',404);
    if(!(p.acks||[]).some(a=>sid(a.userId)===sid(req.user._id)))await UnitPost.updateOne({_id:p._id},{$push:{acks:{userId:req.user._id,at:new Date()}}});
    res.json({ok:true});
  }));

  // ---------------- documents ----------------
  app.get('/api/units/:id/docs',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u),internal=unitCan(role,'view_internal');
    const rows=await UnitDoc.find({unitId:u._id,...(internal?{}:{visibility:'public'})}).sort({createdAt:-1}).limit(300).lean();
    res.json(rows.map(d=>({_id:sid(d._id),title:d.title,category:d.category,visibility:d.visibility,filename:d.filename,size:d.size,mimeType:d.mimeType,createdAt:d.createdAt})));
  }));
  app.post('/api/units/:id/docs',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id);await need(req,u,'manage_content');
    if(!files.ready())throw fail('Fayl bazasi ulanmagan',503);
    if(!/^multipart\/form-data\s*;/i.test(req.headers['content-type']||''))throw fail('multipart/form-data kerak',415);
    const title=clean(req.query.title,240),category=DOC_CATEGORIES[req.query.category]?req.query.category:'boshqa',visibility=req.query.visibility==='members'?'members':'public';
    const maxBytes=Math.min(100,Math.max(1,Number(process.env.MAX_UNIT_FILE_MB)||40))*1024*1024;
    let gridId=null,writing=null,received=0,head=Buffer.alloc(0),problem=null,name='';
    try{
      const parser=Busboy({headers:req.headers,limits:{files:1,fields:0,parts:1,fileSize:maxBytes}});
      parser.on('file',(_,stream,info)=>{
        if(writing){stream.resume();problem=fail('Bitta fayl yuboring');return}
        name=path.basename(String(info.filename||'')).slice(0,180);if(!name){stream.resume();problem=fail('Fayl nomi kerak');return}
        const dest=files.upload(name,{unitId:sid(u._id),uploadedBy:sid(req.user._id)});gridId=dest.id;
        stream.on('data',c=>{received+=c.length;if(head.length<8192)head=Buffer.concat([head,c.subarray(0,8192-head.length)])});
        stream.on('limit',()=>{problem=fail('Fayl juda katta (ko‘pi bilan '+Math.round(maxBytes/1048576)+' MB)',413)});
        writing=pipeline(stream,dest.stream).catch(e=>{problem=problem||e});
      });
      await new Promise((resolve,reject)=>{parser.once('finish',resolve);parser.once('error',reject);req.pipe(parser)});
      if(!writing)throw fail('Fayl tanlanmagan');await writing;if(problem)throw problem;if(!received)throw fail('Bo‘sh fayl');
      const type=await checkResourceHeader(name,head);
      await validateOfficePackage(files.download(gridId),type.extension,received);
      const d=await UnitDoc.create({unitId:u._id,title:title||name,category,visibility,fileId:gridId,filename:name,mimeType:type.mimeType,size:received,createdBy:req.user._id});
      audit(req,'UNIT_DOC_UPLOAD','UnitDoc',sid(d._id),{size:received});res.status(201).json({_id:sid(d._id)});
    }catch(e){if(gridId)await Promise.resolve(files.remove(gridId)).catch(()=>{});throw e}
  }));
  app.get('/api/units/:id/docs/:did/file',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u);if(!isId(req.params.did))throw fail('ID noto‘g‘ri');
    const d=await UnitDoc.findOne({_id:req.params.did,unitId:u._id}).lean();if(!d)throw fail('Hujjat topilmadi',404);
    if(d.visibility==='members'&&!unitCan(role,'view_internal'))throw fail('Bu hujjat faqat bo‘lim xodimlari uchun',403);
    res.set('Cache-Control','private,no-store');res.set('X-Content-Type-Options','nosniff');res.set('Content-Type',d.mimeType||'application/octet-stream');
    res.set('Content-Disposition',(req.query.inline==='1'&&/^(application\/pdf|image\/)/.test(d.mimeType||'')?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(d.filename||'hujjat'));
    if(d.size)res.set('Content-Length',String(d.size));
    const s=files.download(d.fileId);s.on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy()});s.pipe(res);
  }));
  app.delete('/api/units/:id/docs/:did',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.did))throw fail('ID noto‘g‘ri');
    const d=await UnitDoc.findOne({_id:req.params.did,unitId:u._id}).lean();if(!d)throw fail('Hujjat topilmadi',404);
    await UnitDoc.deleteOne({_id:d._id});await Promise.resolve(files.remove(d.fileId)).catch(()=>{});audit(req,'UNIT_DOC_DELETE','UnitDoc',sid(d._id));res.json({ok:true});
  }));

  // ---------------- services and requests ----------------
  const serviceBody=b=>{const t=clean(b.title,200);if(t.length<3)throw fail('Xizmat nomini kiriting');return {title:t,description:clean(b.description,1500),fields:validateServiceFields(b.fields||[]),slaDays:Math.max(0,Math.min(90,Number(b.slaDays)||0)),audience:SERVICE_AUDIENCES.includes(b.audience)?b.audience:'all',active:b.active===undefined?true:Boolean(b.active)}};
  app.post('/api/units/:id/services',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_unit');const s=await UnitService.create({unitId:u._id,...serviceBody(req.body)});audit(req,'UNIT_SERVICE_CREATE','UnitService',sid(s._id));res.status(201).json({_id:sid(s._id)})}));
  app.patch('/api/units/:id/services/:sid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_unit');if(!isId(req.params.sid))throw fail('ID noto‘g‘ri');await UnitService.updateOne({_id:req.params.sid,unitId:u._id},{$set:serviceBody(req.body)});res.json({ok:true})}));
  app.delete('/api/units/:id/services/:sid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_unit');if(!isId(req.params.sid))throw fail('ID noto‘g‘ri');await UnitService.updateOne({_id:req.params.sid,unitId:u._id},{$set:{active:false}});res.json({ok:true})}));
  app.post('/api/units/:id/services/:sid/requests',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u);if(!isId(req.params.sid))throw fail('ID noto‘g‘ri');
    const s=await UnitService.findOne({_id:req.params.sid,unitId:u._id,active:true}).lean();if(!s||!serviceVisible(s,req.user,role))throw fail('Xizmat topilmadi',404);
    if(await UnitRequest.countDocuments({requesterId:req.user._id,status:{$in:OPEN_STATUSES}})>=30)throw fail('Ochiq murojaatlaringiz juda ko‘p. Avvalgilari yopilishini kuting.',429);
    const answers=validateAnswers(s.fields||[],req.body.answers);
    const seq=await OrgUnit.findOneAndUpdate({_id:u._id},{$inc:{requestSeq:1}},{new:true}).lean();const now=new Date();
    const r=await UnitRequest.create({unitId:u._id,serviceId:s._id,serviceTitle:s.title,number:requestNumber(u.code||u.kind.slice(0,3),now.getFullYear(),seq?.requestSeq||1),requesterId:req.user._id,answers,status:'new',dueAt:dueDate(now,s.slaDays),history:[{at:now,by:req.user._id,action:'created',status:'new',note:''}]});
    audit(req,'UNIT_REQUEST_CREATE','UnitRequest',sid(r._id),{unit:sid(u._id)});res.status(201).json({_id:sid(r._id),number:r.number,dueAt:r.dueAt});
  }));
  const requestView=async(r,{withHistory=false,unitRole=null}={})=>{
    const ids=[r.requesterId,r.assigneeId,...(withHistory?(r.history||[]).map(h=>h.by):[])];const users=await userMap(ids);
    const unit=await OrgUnit.findById(r.unitId).select('_id name code kind').lean();
    const svc=withHistory&&r.serviceId?await UnitService.findById(r.serviceId).select('fields').lean():null;
    return {_id:sid(r._id),number:r.number,unit:unit?{_id:sid(unit._id),name:unit.name}:null,serviceTitle:r.serviceTitle,status:r.status,statusLabel:REQUEST_STATUSES[r.status],answers:r.answers||{},requester:brief(users.get(sid(r.requesterId))),assignee:brief(users.get(sid(r.assigneeId))),dueAt:r.dueAt,closedAt:r.closedAt,resolution:r.resolution||'',createdAt:r.createdAt,updatedAt:r.updatedAt,overdue:Boolean(r.dueAt&&OPEN_STATUSES.includes(r.status)&&new Date(r.dueAt)<new Date()),myUnitRole:unitRole,
      fields:svc?(svc.fields||[]).map(f=>({key:f.key,label:f.label})):undefined,
      history:withHistory?(r.history||[]).map(h=>({at:h.at,by:users.get(sid(h.by))?.fullName||'',action:h.action,status:h.status,statusLabel:REQUEST_STATUSES[h.status]||'',note:h.note||''})):undefined};
  };
  app.get('/api/units/:id/requests',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id);await need(req,u,'view_internal');
    const q={unitId:u._id};const st=String(req.query.status||'open');
    if(st==='open')q.status={$in:OPEN_STATUSES};else if(REQUEST_STATUSES[st])q.status=st;
    if(req.query.mine==='1')q.assigneeId=req.user._id;
    const rows=await UnitRequest.find(q).sort({createdAt:-1}).limit(200).lean();
    res.json(await Promise.all(rows.map(r=>requestView(r))));
  }));
  app.get('/api/unit-requests/mine',auth,wrap(async(req,res)=>{const rows=await UnitRequest.find({requesterId:req.user._id}).sort({createdAt:-1}).limit(100).lean();res.json(await Promise.all(rows.map(r=>requestView(r))))}));
  async function loadRequest(req){
    if(!isId(req.params.rid))throw fail('ID noto‘g‘ri');const r=await UnitRequest.findById(req.params.rid).lean();if(!r)throw fail('Murojaat topilmadi',404);
    const unit=await OrgUnit.findById(r.unitId).lean();const role=unit?await roleIn(req,unit):null;
    const requester=sid(r.requesterId)===sid(req.user._id);if(!requester&&!unitCan(role,'view_internal'))throw fail('Bu murojaatni ko‘rish huquqi yo‘q',403);
    return {r,unit,role,requester};
  }
  app.get('/api/unit-requests/:rid',auth,wrap(async(req,res)=>{const {r,role}=await loadRequest(req);res.json(await requestView(r,{withHistory:true,unitRole:role}))}));
  app.patch('/api/unit-requests/:rid',auth,wrap(async(req,res)=>{
    const {r,unit,role}=await loadRequest(req);if(!unitCan(role,'process_requests'))throw fail('Murojaatni ko‘rib chiqish huquqi yo‘q',403);
    const set={},now=new Date(),entry={at:now,by:req.user._id,action:'update',status:r.status,note:clean(req.body.note,2000)};
    if(req.body.status!==undefined&&req.body.status!==r.status){
      if(!canTransition(r.status,req.body.status,'staff'))throw fail('Bu holatga o‘tkazib bo‘lmaydi: '+(REQUEST_STATUSES[r.status]||r.status)+' → '+(REQUEST_STATUSES[req.body.status]||req.body.status));
      set.status=req.body.status;entry.status=set.status;entry.action='status';
      if(['done','rejected'].includes(set.status)){set.closedAt=now;if(req.body.resolution!==undefined)set.resolution=clean(req.body.resolution,2000)}else set.closedAt=null;
      if(['done','rejected'].includes(set.status)&&!clean(req.body.resolution||req.body.note))throw fail('Yopishda natija yoki izoh yozing');
      if(!r.assigneeId&&req.body.assigneeId===undefined)set.assigneeId=req.user._id;
    }
    if(req.body.assigneeId!==undefined){
      const a=req.body.assigneeId==='me'?sid(req.user._id):req.body.assigneeId;
      if(a){if(!isId(a))throw fail('Ijrochi noto‘g‘ri');const target=await User.findById(a).select('_id fullName role facultyId departmentId').lean();const m=await UnitMember.findOne({unitId:unit._id,userId:a,active:true}).lean();if(!target||!unitCan(effectiveUnitRole({user:target,unit,membership:m,permissions:[]}),'process_requests'))throw fail('Ijrochi bo‘lim xodimi bo‘lishi kerak');set.assigneeId=a;entry.action=entry.action==='status'?'status':'assign';entry.note=entry.note||('Ijrochi: '+target.fullName)}
      else set.assigneeId=null;
    }
    if(!Object.keys(set).length&&!entry.note)throw fail('O‘zgarish yo‘q');
    if(!Object.keys(set).length)entry.action='comment';
    await UnitRequest.updateOne({_id:r._id},{$set:set,$push:{history:entry}});audit(req,'UNIT_REQUEST_UPDATE','UnitRequest',sid(r._id),{status:set.status});
    res.json(await requestView(await UnitRequest.findById(r._id).lean(),{withHistory:true,unitRole:role}));
  }));
  app.post('/api/unit-requests/:rid/comment',auth,wrap(async(req,res)=>{
    const {r,role,requester}=await loadRequest(req),note=clean(req.body.note,2000);if(note.length<2)throw fail('Izoh yozing');
    if(!requester&&!unitCan(role,'process_requests'))throw fail('Ruxsat yo‘q',403);
    if(['cancelled'].includes(r.status))throw fail('Bekor qilingan murojaat');
    const set={},entry={at:new Date(),by:req.user._id,action:'comment',status:r.status,note};
    if(requester&&r.status==='waiting'&&!unitCan(role,'process_requests')){set.status='in_progress';entry.status='in_progress';entry.action='reply'}
    await UnitRequest.updateOne({_id:r._id},{...(Object.keys(set).length?{$set:set}:{}),$push:{history:entry}});
    res.json(await requestView(await UnitRequest.findById(r._id).lean(),{withHistory:true,unitRole:role}));
  }));
  app.post('/api/unit-requests/:rid/cancel',auth,wrap(async(req,res)=>{
    const {r,requester}=await loadRequest(req);if(!requester)throw fail('Faqat murojaat egasi bekor qiladi',403);
    if(!canTransition(r.status,'cancelled','requester'))throw fail('Ko‘rib chiqilayotgan murojaatni bekor qilib bo‘lmaydi');
    await UnitRequest.updateOne({_id:r._id},{$set:{status:'cancelled',closedAt:new Date()},$push:{history:{at:new Date(),by:req.user._id,action:'status',status:'cancelled',note:clean(req.body.note,500)}}});res.json({ok:true});
  }));

  // ---------------- tasks ----------------
  const taskBody=b=>{const out={};if(b.title!==undefined){out.title=clean(b.title,240);if(out.title.length<2)throw fail('Vazifa nomini kiriting')}if(b.notes!==undefined)out.notes=clean(b.notes,4000);if(b.status!==undefined)out.status=['todo','doing','done'].includes(b.status)?b.status:'todo';if(b.priority!==undefined)out.priority=['low','normal','high'].includes(b.priority)?b.priority:'normal';if(b.dueAt!==undefined)out.dueAt=b.dueAt&&!Number.isNaN(Date.parse(b.dueAt))?new Date(b.dueAt):null;if(b.assigneeId!==undefined)out.assigneeId=b.assigneeId&&isId(b.assigneeId)?b.assigneeId:null;return out};
  app.get('/api/units/:id/tasks',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id);await need(req,u,'view_internal');
    const rows=await UnitTask.find({unitId:u._id}).sort({status:1,dueAt:1,createdAt:-1}).limit(300).lean(),users=await userMap(rows.map(t=>t.assigneeId));
    res.json(rows.map(t=>({_id:sid(t._id),title:t.title,notes:t.notes||'',status:t.status,priority:t.priority,dueAt:t.dueAt,assignee:brief(users.get(sid(t.assigneeId))),overdue:Boolean(t.dueAt&&t.status!=='done'&&new Date(t.dueAt)<new Date())})));
  }));
  app.post('/api/units/:id/tasks',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');const b=taskBody(req.body);if(!b.title)throw fail('Vazifa nomini kiriting');const t=await UnitTask.create({unitId:u._id,...b,createdBy:req.user._id});res.status(201).json({_id:sid(t._id)})}));
  app.patch('/api/units/:id/tasks/:tid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.tid))throw fail('ID noto‘g‘ri');await UnitTask.updateOne({_id:req.params.tid,unitId:u._id},{$set:taskBody(req.body)});res.json({ok:true})}));
  app.delete('/api/units/:id/tasks/:tid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.tid))throw fail('ID noto‘g‘ri');await UnitTask.deleteOne({_id:req.params.tid,unitId:u._id});res.json({ok:true})}));

  // ---------------- events ----------------
  const eventBody=b=>{const t=clean(b.title,240);if(t.length<3)throw fail('Tadbir nomini kiriting');if(!b.startsAt||Number.isNaN(Date.parse(b.startsAt)))throw fail('Boshlanish vaqtini kiriting');const ends=b.endsAt&&!Number.isNaN(Date.parse(b.endsAt))?new Date(b.endsAt):null;if(ends&&ends<new Date(b.startsAt))throw fail('Tugash vaqti boshlanishdan oldin bo‘lmaydi');return {title:t,description:clean(b.description,4000),startsAt:new Date(b.startsAt),endsAt:ends,place:clean(b.place,200),audience:AUDIENCES.includes(b.audience)?b.audience:'public',registration:Boolean(b.registration),capacity:Math.max(0,Math.min(100000,Number(b.capacity)||0))}};
  const eventView=(e,me)=>({_id:sid(e._id),title:e.title,description:e.description||'',startsAt:e.startsAt,endsAt:e.endsAt,place:e.place||'',audience:e.audience,registration:e.registration,capacity:e.capacity||0,registered:(e.registrants||[]).length,mine:(e.registrants||[]).some(x=>sid(x)===me)});
  app.get('/api/units/:id/events',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u),since=new Date(Date.now()-(req.query.past==='1'?180:1)*86400000);
    const rows=(await UnitEvent.find({unitId:u._id,startsAt:{$gte:since}}).sort({startsAt:1}).limit(200).lean()).filter(e=>audienceAllows(e.audience,{user:req.user,unitRole:role}));
    res.json(rows.map(e=>eventView(e,sid(req.user._id))));
  }));
  app.post('/api/units/:id/events',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');const e=await UnitEvent.create({unitId:u._id,...eventBody(req.body),createdBy:req.user._id});res.status(201).json({_id:sid(e._id)})}));
  app.patch('/api/units/:id/events/:eid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.eid))throw fail('ID noto‘g‘ri');await UnitEvent.updateOne({_id:req.params.eid,unitId:u._id},{$set:eventBody(req.body)});res.json({ok:true})}));
  app.delete('/api/units/:id/events/:eid',auth,wrap(async(req,res)=>{const u=await loadUnit(req.params.id);await need(req,u,'manage_content');if(!isId(req.params.eid))throw fail('ID noto‘g‘ri');await UnitEvent.deleteOne({_id:req.params.eid,unitId:u._id});res.json({ok:true})}));
  app.post('/api/units/:id/events/:eid/register',auth,wrap(async(req,res)=>{
    const u=await loadUnit(req.params.id),role=await roleIn(req,u);if(!isId(req.params.eid))throw fail('ID noto‘g‘ri');
    const e=await UnitEvent.findOne({_id:req.params.eid,unitId:u._id}).lean();if(!e||!audienceAllows(e.audience,{user:req.user,unitRole:role}))throw fail('Tadbir topilmadi',404);
    if(!e.registration)throw fail('Bu tadbirga ro‘yxatdan o‘tish talab qilinmaydi');
    const me=sid(req.user._id),already=(e.registrants||[]).some(x=>sid(x)===me);
    if(already)await UnitEvent.updateOne({_id:e._id},{$pull:{registrants:req.user._id}});
    else{if(new Date(e.startsAt)<new Date())throw fail('Tadbir boshlangan');if(e.capacity&&(e.registrants||[]).length>=e.capacity)throw fail('Joylar to‘lgan');await UnitEvent.updateOne({_id:e._id},{$addToSet:{registrants:req.user._id}})}
    res.json({registered:!already});
  }));

  // ---------------- workspace ----------------
  async function workspace(user){
    const mine=await myUnits(user),unitIds=mine.map(x=>x.unit._id),processIds=mine.filter(x=>unitCan(x.role,'process_requests')).map(x=>x.unit._id);
    const now=new Date(),soon=new Date(Date.now()+30*86400000);
    const [assigned,unassigned,tasks,events,myOpen,counts]=await Promise.all([
      UnitRequest.find({assigneeId:user._id,status:{$in:OPEN_STATUSES}}).sort({dueAt:1,createdAt:1}).limit(30).lean(),
      processIds.length?UnitRequest.find({unitId:{$in:processIds},status:'new',assigneeId:null}).sort({createdAt:1}).limit(30).lean():[],
      UnitTask.find({assigneeId:user._id,status:{$ne:'done'}}).sort({dueAt:1}).limit(30).lean(),
      UnitEvent.find({startsAt:{$gte:now,$lte:soon},audience:{$in:['public',user.role==='student'?'students':'staff']}}).sort({startsAt:1}).limit(12).lean(),
      UnitRequest.countDocuments({requesterId:user._id,status:{$in:OPEN_STATUSES}}),
      Promise.all(unitIds.map(async id=>[sid(id),await UnitRequest.countDocuments({unitId:id,status:{$in:OPEN_STATUSES}}),await UnitRequest.countDocuments({unitId:id,status:{$in:OPEN_STATUSES},dueAt:{$lt:now}})]))
    ]);
    const cmap=new Map(counts.map(([k,o,d])=>[k,{open:o,overdue:d}]));
    const posts=await UnitPost.find({requireAck:true,createdAt:{$gte:new Date(Date.now()-60*86400000)}}).sort({createdAt:-1}).limit(60).lean();
    const roleByUnit=new Map(mine.map(x=>[sid(x.unit._id),x.role])),me=sid(user._id);
    const pendingAck=posts.filter(p=>!(p.acks||[]).some(a=>sid(a.userId)===me)&&audienceAllows(p.audience,{user,unitRole:roleByUnit.get(sid(p.unitId))||null})).slice(0,10);
    const unitNames=new Map((await OrgUnit.find({_id:{$in:[...new Set([...events.map(e=>e.unitId),...pendingAck.map(p=>p.unitId),...tasks.map(t=>t.unitId)].map(sid))]}}).select('_id name').lean()).map(u=>[sid(u._id),u.name]));
    return {
      units:mine.map(x=>({_id:sid(x.unit._id),name:x.unit.name,kind:x.unit.kind,role:x.role,title:x.title,...(cmap.get(sid(x.unit._id))||{open:0,overdue:0})})),
      assigned:await Promise.all(assigned.map(r=>requestView(r))),unassigned:await Promise.all(unassigned.map(r=>requestView(r))),
      tasks:tasks.map(t=>({_id:sid(t._id),unitId:sid(t.unitId),unitName:unitNames.get(sid(t.unitId))||'',title:t.title,status:t.status,priority:t.priority,dueAt:t.dueAt,overdue:Boolean(t.dueAt&&new Date(t.dueAt)<now)})),
      events:events.map(e=>({...eventView(e,me),unitId:sid(e.unitId),unitName:unitNames.get(sid(e.unitId))||''})),
      pendingAck:pendingAck.map(p=>({_id:sid(p._id),unitId:sid(p.unitId),unitName:unitNames.get(sid(p.unitId))||'',title:p.title,createdAt:p.createdAt})),
      myOpenRequests:myOpen
    };
  }
  app.get('/api/units-workspace',auth,wrap(async(req,res)=>res.json(await workspace(req.user))));
  async function workspaceSummary(user){
    const w=await workspace(user);
    return {stats:[{label:'Mening bo‘limlarim',value:w.units.length},{label:'Menga biriktirilgan murojaat',value:w.assigned.length},{label:'Yangi murojaat',value:w.unassigned.length},{label:'Vazifalarim',value:w.tasks.length},{label:'Muddati o‘tgan',value:w.assigned.filter(r=>r.overdue).length+w.tasks.filter(t=>t.overdue).length}]};
  }
  return {models:M,workspace,workspaceSummary,syncAcademic};
}
