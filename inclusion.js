// HALLAYM EDU — inclusive education API: accessibility profile of each user, staff verification of needs
// (dekanat / tyutor / registrator marks the student at enrolment), teacher view of accommodations,
// cross-device accessibility preferences and Web Push notifications (lesson started, new message, test).
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import webpushLib from 'web-push';
import {NEEDS,STATUSES,cleanNeeds,cleanPrefs,effectivePrefs,suggestedExtraPct,cleanExtraPct,profileView,needLabels} from './inclusion-rules.js';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const STAFF_ROLES=new Set(['superadmin','admin','tech','rectorate','dean','department','tutor']);

export function installInclusion(app,{mongoose,User,Structure,Schedule,auth,audit,resolveScope,GLOBAL_SCOPE_ROLES,models={},webpush=webpushLib,env=process.env}){
  const id=mongoose.Schema.Types.ObjectId;
  const PushSubscription=models.PushSubscription||mongoose.models.PushSubscription||mongoose.model('PushSubscription',new mongoose.Schema({
    userId:{type:id,ref:'User',required:true,index:true},
    endpoint:{type:String,required:true,unique:true,maxlength:2000},
    keys:{p256dh:{type:String,required:true,maxlength:300},auth:{type:String,required:true,maxlength:100}},
    userAgent:{type:String,maxlength:300},
    lastOkAt:Date,failures:{type:Number,default:0}
  },{timestamps:true}));
  const InclusionSetting=models.InclusionSetting||mongoose.models.InclusionSetting||mongoose.model('InclusionSetting',new mongoose.Schema({
    key:{type:String,required:true,unique:true},publicKey:String,privateKey:String
  },{timestamps:true}));

  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const err=(m,status=400)=>Object.assign(new Error(m),{status});
  const sid=v=>String(v?._id||v||'');
  const isGlobal=u=>GLOBAL_SCOPE_ROLES.has(u.role);

  // ---------- Web Push (VAPID keys come from .env or are generated once and stored in the database) ----------
  let vapid=null,vapidPromise=null;
  async function ensureVapid(){
    if(vapid)return vapid;
    if(!vapidPromise)vapidPromise=(async()=>{
      let pub=env.VAPID_PUBLIC_KEY,priv=env.VAPID_PRIVATE_KEY;
      if(!pub||!priv){
        let row=await InclusionSetting.findOne({key:'vapid'}).lean();
        if(!row?.publicKey){const k=webpush.generateVAPIDKeys();row=await InclusionSetting.create({key:'vapid',publicKey:k.publicKey,privateKey:k.privateKey})}
        pub=row.publicKey;priv=row.privateKey;
      }
      const origin=String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).find(s=>/^https:\/\//.test(s));
      const subject=env.VAPID_SUBJECT||(origin||'mailto:edu-admin@hallaym.uz');
      webpush.setVapidDetails(subject,pub,priv);
      vapid={publicKey:pub};return vapid;
    })().catch(e=>{vapidPromise=null;throw e});
    return vapidPromise;
  }
  // Send to every device of the given users. Never throws: notifications must not break the action that caused them.
  async function notifyUsers(userIds,payload){
    try{
      const ids=[...new Set((userIds||[]).map(sid).filter(x=>mongoose.isValidObjectId(x)))];
      if(!ids.length)return {sent:0};
      await ensureVapid();
      const subs=await PushSubscription.find({userId:{$in:ids}}).lean();
      const body=JSON.stringify({title:String(payload.title||'HALLAYM EDU').slice(0,120),body:String(payload.body||'').slice(0,400),url:String(payload.url||'/').slice(0,300),tag:String(payload.tag||'').slice(0,80),speak:payload.speak!==false});
      let sent=0;
      await Promise.all(subs.map(async s=>{
        try{await webpush.sendNotification({endpoint:s.endpoint,keys:s.keys},body,{TTL:Number(payload.ttl)||3600,urgency:payload.urgency||'high'});sent++;await PushSubscription.updateOne({_id:s._id},{$set:{lastOkAt:new Date(),failures:0}})}
        catch(e){if(e?.statusCode===404||e?.statusCode===410)await PushSubscription.deleteOne({_id:s._id});else await PushSubscription.updateOne({_id:s._id},{$inc:{failures:1}})}
      }));
      return {sent};
    }catch(e){console.warn('push notify failed',e?.message);return {sent:0}}
  }
  async function notifyGroup(groupId,payload){
    const rows=await User.find({groupId,role:'student',active:true}).select('_id').lean();
    return notifyUsers(rows.map(r=>r._id),payload);
  }
  app.locals.notifyUsers=notifyUsers;
  app.locals.notifyGroup=notifyGroup;

  // Shared rules file for the browser (same code the server uses).
  app.get('/inclusion-rules.js',(_req,res)=>res.type('text/javascript').set('Cache-Control','no-cache').sendFile(path.join(HERE,'inclusion-rules.js')));

  // ---------- The user's own profile and preferences ----------
  app.get('/api/inclusion/me',auth,async(req,res)=>{
    try{
      const inc=req.user.inclusion||{};
      let publicKey='';try{publicKey=(await ensureVapid()).publicKey}catch{}
      const devices=mongoose.isValidObjectId(req.user._id)?await PushSubscription.countDocuments({userId:req.user._id}):0;
      res.json({profile:profileView(inc),prefs:cleanPrefs(inc.prefs||{}),effective:effectivePrefs(inc),needs:NEEDS,statuses:STATUSES,push:{publicKey,devices}});
    }catch(e){fail(res,e)}
  });
  app.put('/api/inclusion/me/prefs',auth,async(req,res)=>{
    try{
      if(!mongoose.isValidObjectId(req.user._id))throw err('Demo akkaunt sozlamalari saqlanmaydi');
      const prefs=cleanPrefs(req.body?.prefs||req.body||{});
      await User.updateOne({_id:req.user._id},{$set:{'inclusion.prefs':prefs}});
      res.json({prefs,effective:effectivePrefs({...(req.user.inclusion||{}),prefs})});
    }catch(e){fail(res,e)}
  });
  // The student asks for accommodations themself; staff then verifies (documents are checked in person).
  app.post('/api/inclusion/me/request',auth,async(req,res)=>{
    try{
      if(req.user.role!=='student')throw err('Bu ariza talabalar uchun',403);
      const needs=cleanNeeds(req.body?.needs);if(!needs.length)throw err('Kamida bitta ehtiyojni tanlang');
      if(req.body?.consent!==true)throw err('Ma’lumotlaringizni ishlashga rozilik belgisini qo‘ying');
      const cur=req.user.inclusion||{};
      const set={'inclusion.needs':needs,'inclusion.selfNote':String(req.body?.note||'').trim().slice(0,500),'inclusion.requestedAt':new Date(),'inclusion.consentAt':new Date()};
      // A verified profile stays verified only if nothing new is asked for.
      const same=cur.status==='verified'&&needs.every(n=>(cur.needs||[]).includes(n));
      set['inclusion.status']=same?'verified':'pending';
      if(!same)set['inclusion.extraTimePct']=suggestedExtraPct(needs);
      await User.updateOne({_id:req.user._id},{$set:set});
      audit(req,'INCLUSION_REQUEST','User',sid(req.user._id),{needs});
      const fresh=await User.findById(req.user._id).lean();
      res.json({profile:profileView(fresh?.inclusion),effective:effectivePrefs(fresh?.inclusion)});
    }catch(e){fail(res,e)}
  });

  // ---------- Staff: who may see and change whose profile ----------
  async function scopeGroupIds(user){
    if(isGlobal(user))return null; // null = every group
    if(!STAFF_ROLES.has(user.role))throw err('Bu bo‘lim uchun ruxsat yo‘q',403);
    const scope=await resolveScope(user,{});return new Set((scope.groupIds||[]).map(sid));
  }
  async function loadTarget(user,targetId){
    if(!mongoose.isValidObjectId(targetId))throw err('ID noto‘g‘ri');
    const target=await User.findById(targetId);if(!target)throw err('Foydalanuvchi topilmadi',404);
    const groups=await scopeGroupIds(user);
    if(groups&&!groups.has(sid(target.groupId)))throw err('Bu talaba sizning doirangizda emas',403);
    return target;
  }
  // Applies a staff decision to a user document (also used by user create/edit and CSV import in server.js).
  function applyStaffProfile(target,input,actor){
    const cur=target.inclusion?.toObject?target.inclusion.toObject():{...(target.inclusion||{})};
    const needs=input.needs!==undefined?cleanNeeds(input.needs):cleanNeeds(cur.needs);
    if(needs.length&&!cur.consentAt&&input.consent!==true)throw err('Talabadan (yoki vasiysidan) ma’lumotni ishlashga yozma rozilik olinganini belgilang');
    let status=input.status!==undefined?String(input.status):(needs.length?'verified':'none');
    if(!STATUSES[status])throw err('Holat noto‘g‘ri');
    if(!needs.length&&status!=='rejected')status='none';
    const extra=input.extraTimePct!==undefined&&input.extraTimePct!==''?cleanExtraPct(input.extraTimePct):(input.needs!==undefined?suggestedExtraPct(needs):cleanExtraPct(cur.extraTimePct));
    const next={...cur,needs,status,extraTimePct:extra,notes:input.notes!==undefined?String(input.notes||'').trim().slice(0,500):String(cur.notes||'')};
    if(input.consent===true&&!cur.consentAt)next.consentAt=new Date();
    if(status==='verified'&&cur.status!=='verified'){next.verifiedAt=new Date();next.verifiedBy=mongoose.isValidObjectId(actor?._id)?actor._id:undefined}
    if(status!=='verified'){next.verifiedAt=undefined;next.verifiedBy=undefined}
    target.inclusion=next;
    return next;
  }
  const personRow=(u,groupNames)=>({id:sid(u._id),fullName:u.fullName,login:u.login,role:u.role,group:groupNames.get(sid(u.groupId))||u.group||'',profile:profileView(u.inclusion,{staff:true}),labels:needLabels(u.inclusion?.needs)});
  async function groupNameMap(rows){
    const ids=[...new Set(rows.map(r=>sid(r.groupId)).filter(x=>mongoose.isValidObjectId(x)))];
    const groups=ids.length?await Structure.find({_id:{$in:ids}}).select('name code externalId').lean():[];
    return new Map(groups.map(g=>[sid(g._id),g.name||g.code||g.externalId||'']));
  }

  app.get('/api/inclusion/people',auth,async(req,res)=>{
    try{
      const groups=await scopeGroupIds(req.user);
      const q={'inclusion.status':{$in:['pending','verified','rejected']}};
      if(STATUSES[req.query.status]&&req.query.status!=='none')q['inclusion.status']=req.query.status;
      if(NEEDS[req.query.need])q['inclusion.needs']=req.query.need;
      if(groups)q.groupId={$in:[...groups]};
      let rows=await User.find(q).select('fullName login role group groupId inclusion').sort({fullName:1}).limit(2000).lean();
      const term=String(req.query.q||'').trim().toLowerCase();
      if(term)rows=rows.filter(r=>[r.fullName,r.login,r.group].join(' ').toLowerCase().includes(term));
      const names=await groupNameMap(rows);
      const list=rows.map(r=>personRow(r,names));
      const summary={total:list.length,pending:list.filter(r=>r.profile.status==='pending').length,verified:list.filter(r=>r.profile.status==='verified').length,byNeed:Object.fromEntries(Object.keys(NEEDS).map(n=>[n,list.filter(r=>r.profile.needs.includes(n)).length]))};
      res.json({people:list,summary,needs:NEEDS,statuses:STATUSES});
    }catch(e){fail(res,e)}
  });
  // Find a student to mark (search inside the staff member's scope).
  app.get('/api/inclusion/candidates',auth,async(req,res)=>{
    try{
      const groups=await scopeGroupIds(req.user);const term=String(req.query.q||'').trim();
      if(term.length<2)return res.json({people:[]});
      const rx=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
      const q={role:'student',active:true,$or:[{fullName:rx},{login:rx}]};if(groups)q.groupId={$in:[...groups]};
      const rows=await User.find(q).select('fullName login role group groupId inclusion').limit(20).lean();
      const names=await groupNameMap(rows);res.json({people:rows.map(r=>personRow(r,names))});
    }catch(e){fail(res,e)}
  });
  app.put('/api/inclusion/people/:id',auth,async(req,res)=>{
    try{
      const target=await loadTarget(req.user,req.params.id);
      if(target.role!=='student'&&!isGlobal(req.user))throw err('Xodim profilini faqat administrator o‘zgartiradi',403);
      const before=target.inclusion?.status||'none';
      const next=applyStaffProfile(target,req.body||{},req.user);
      await target.save();
      audit(req,'INCLUSION_PROFILE_SET','User',sid(target._id),{needs:next.needs,status:next.status,from:before,extraTimePct:next.extraTimePct});
      if(next.status==='verified'&&before!=='verified')notifyUsers([target._id],{title:'Inklyuziv ta’lim',body:'Imkoniyatlaringiz tasdiqlandi. Qulaylik sozlamalari avtomatik yoqildi.',url:'/?go=accessibility',tag:'inclusion'});
      const names=await groupNameMap([target]);
      res.json({person:personRow(target.toObject?target.toObject():target,names)});
    }catch(e){fail(res,e)}
  });

  // ---------- Teacher: accommodations of students in the groups they teach (no staff notes) ----------
  app.get('/api/inclusion/teacher',auth,async(req,res)=>{
    try{
      if(req.user.role!=='teacher'&&!isGlobal(req.user))throw err('Bu ro‘yxat o‘qituvchilar uchun',403);
      const groupIds=isGlobal(req.user)&&req.query.groupId?[req.query.groupId]:(await Schedule.find({teacherId:req.user._id}).select('groupId').lean()).map(s=>sid(s.groupId));
      const unique=[...new Set(groupIds)].filter(x=>mongoose.isValidObjectId(x));
      if(!unique.length)return res.json({people:[]});
      const rows=await User.find({role:'student',active:true,groupId:{$in:unique},'inclusion.status':'verified'}).select('fullName login group groupId inclusion').sort({fullName:1}).lean();
      const names=await groupNameMap(rows);
      res.json({people:rows.map(r=>{const p=personRow(r,names);delete p.profile.notes;delete p.profile.selfNote;return p})});
    }catch(e){fail(res,e)}
  });

  // ---------- Push subscriptions ----------
  app.post('/api/inclusion/push/subscribe',auth,async(req,res)=>{
    try{
      if(!mongoose.isValidObjectId(req.user._id))throw err('Demo akkaunt uchun bildirishnoma yo‘q');
      const s=req.body?.subscription||{};const endpoint=String(s.endpoint||'');
      if(!/^https:\/\//.test(endpoint)||endpoint.length>2000||!s.keys?.p256dh||!s.keys?.auth)throw err('Obuna ma’lumoti noto‘g‘ri');
      await PushSubscription.findOneAndUpdate({endpoint},{$set:{userId:req.user._id,keys:{p256dh:String(s.keys.p256dh).slice(0,300),auth:String(s.keys.auth).slice(0,100)},userAgent:String(req.headers['user-agent']||'').slice(0,300),failures:0}},{upsert:true,new:true,setDefaultsOnInsert:true});
      res.status(201).json({ok:true});
    }catch(e){fail(res,e)}
  });
  app.post('/api/inclusion/push/unsubscribe',auth,async(req,res)=>{
    try{await PushSubscription.deleteOne({endpoint:String(req.body?.endpoint||''),userId:req.user._id});res.json({ok:true})}catch(e){fail(res,e)}
  });
  app.post('/api/inclusion/push/test',auth,async(req,res)=>{
    try{const r=await notifyUsers([req.user._id],{title:'Sinov bildirishnomasi',body:'Bildirishnomalar ishlayapti. Darslar va xabarlar haqida shu yerda xabar olasiz.',url:'/',tag:'test'});res.json(r)}catch(e){fail(res,e)}
  });

  return {applyStaffProfile,notifyUsers,notifyGroup,ensureVapid,PushSubscription};
}
