// HALLAYM EDU — «Mening kitoblarim»: a personal audio-book shelf for each student. The student (or a tutor in their
// scope) uploads text PDF/TXT books; family members can add books without the student's password through a one-time
// «oila havolasi» (random token, stored hashed, 7 days, limited uploads). Listening position is kept per book.
import crypto from 'node:crypto';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import Busboy from 'busboy';
import {fileTypeFromBuffer} from 'file-type';

export const MAX_BOOK_BYTES=60*1024*1024;
export const MAX_BOOKS=200;
const LINK_DAYS=7,LINK_UPLOADS=20;
const hash=t=>crypto.createHash('sha256').update(String(t)).digest('hex');

// PDF by magic bytes, or UTF-8 text without binary zeros. Returns {ext,mimeType}.
export async function checkBookHeader(filename,head){
  const ext=path.extname(String(filename||'')).toLowerCase().slice(1);
  if(ext==='pdf'){const t=await fileTypeFromBuffer(head).catch(()=>null);if(t?.ext!=='pdf')throw new Error('Fayl haqiqiy PDF emas');return {ext,mimeType:'application/pdf'}}
  if(ext==='txt'){if(head.includes(0))throw new Error('Matn faylida ikkilik ma’lumot bor');try{new TextDecoder('utf-8',{fatal:true}).decode(head,{stream:true})}catch{throw new Error('Matn fayli UTF-8 bo‘lishi kerak')}return {ext,mimeType:'text/plain; charset=utf-8'}}
  throw new Error('Faqat PDF yoki TXT kitob yuklash mumkin');
}
export const cleanTitle=(v,fallback='Kitob')=>String(v||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,200)||fallback;

export function readBookUpload(req){
  const err=(message,status=400)=>Object.assign(new Error(message),{status});
  return new Promise((resolve,reject)=>{
    let bus;try{bus=Busboy({headers:req.headers,limits:{files:1,fileSize:MAX_BOOK_BYTES,fields:10,fieldSize:2000}})}catch{return reject(err('Fayl yuborilmadi'))}
    const fields=Object.create(null);let file=null,tooBig=false,extra=false;
    bus.on('field',(k,v)=>{fields[k]=v});
    bus.on('file',(_n,stream,info)=>{const chunks=[];let size=0;stream.on('data',c=>{size+=c.length;chunks.push(c)});stream.on('limit',()=>{tooBig=true});stream.on('end',()=>{file={name:info.filename,buffer:Buffer.concat(chunks),size}})});
    bus.on('error',()=>reject(err('Faylni o‘qib bo‘lmadi')));
    bus.on('filesLimit',()=>{extra=true});bus.on('fieldsLimit',()=>{extra=true});
    req.on('aborted',()=>{bus.destroy();reject(err('Yuklash uzildi'))});
    bus.on('finish',()=>{if(extra)return reject(err('Bitta kitob faylini yuboring'));if(tooBig)return reject(err('Kitob 60 MB dan katta',413));if(!file||!file.size)return reject(err('Kitob faylini tanlang'));resolve({fields,file})});
    req.pipe(bus);
  });
}

export function installMyBooks(app,{mongoose,User,auth,audit=()=>{},resolveScope,GLOBAL_SCOPE_ROLES=new Set(['admin','superadmin']),models={},bucket,now=()=>Date.now()}){
  const O=mongoose.Schema.Types.ObjectId;
  const def=(name,schema)=>models[name]||mongoose.models[name]||mongoose.model(name,schema);
  const Book=def('PersonalBook',new mongoose.Schema({ownerId:{type:O,ref:'User',required:true,index:true},title:{type:String,required:true,maxlength:200},author:{type:String,maxlength:160},
    lang:{type:String,enum:['uz','ru','en'],default:'uz'},fileId:{type:O,required:true},mimeType:String,size:Number,
    addedBy:{type:String,enum:['self','family','staff'],default:'self'},addedByName:{type:String,maxlength:120},uploaderId:{type:O,ref:'User'},
    progress:{page:{type:Number,default:0},idx:{type:Number,default:0},pages:{type:Number,default:0},finished:{type:Boolean,default:false},at:Date}},{timestamps:true}));
  const linkSchema=new mongoose.Schema({ownerId:{type:O,ref:'User',required:true,unique:true},tokenHash:{type:String,required:true,unique:true},expiresAt:{type:Date,required:true},uses:{type:Number,default:0},revoked:{type:Boolean,default:false}},{timestamps:true});
  linkSchema.index({expiresAt:1},{expireAfterSeconds:0});
  const Link=def('FamilyUploadLink',linkSchema);
  const files=bucket||(()=>new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'personal_books'}));
  const err=(m,status=400)=>Object.assign(new Error(m),{status});
  const fail=(res,e)=>res.status(e.status||400).set('Cache-Control','private, no-store').json({message:e.message||'So‘rov bajarilmadi'});
  const sid=v=>String(v?._id||v||'');
  const view=b=>({id:sid(b._id),title:b.title,author:b.author||'',lang:b.lang||'uz',size:b.size||0,mimeType:b.mimeType,addedBy:b.addedBy,addedByName:b.addedByName||'',createdAt:b.createdAt,progress:b.progress||{page:0,idx:0,pages:0}});
  let uploads=0;const uploaders=new Set();
  const uploadGate=(req,res,next)=>{
    const key=sid(req.user?._id)||req.params.token||req.ip;
    if(uploads>=4||uploaders.has(key))return fail(res,err('Yuklash davom etmoqda. Birozdan keyin qayta urinib ko‘ring.',429));
    uploads++;uploaders.add(key);let released=false;
    const release=()=>{if(!released){released=true;uploads--;uploaders.delete(key)}};
    res.once('finish',release);res.once('close',release);next();
  };

  // Whose shelf may the caller use? Own shelf always; staff only for students in their scope.
  async function shelfOwner(req,target=req.query.userId||req.body?.userId){
    if(!mongoose.isValidObjectId(req.user?._id))throw err('Kitoblar uchun ma’lumotlar bazasiga ulangan akkaunt kerak',503);
    if(!target||sid(target)===sid(req.user._id))return {owner:req.user,staff:false};
    if(!mongoose.isValidObjectId(target))throw err('ID noto‘g‘ri');
    const u=await User.findById(target).lean();if(!u||u.role!=='student')throw err('Talaba topilmadi',404);
    if(!GLOBAL_SCOPE_ROLES.has(req.user.role)){
      if(!['dean','department','tutor'].includes(req.user.role))throw err('Bu javonga ruxsat yo‘q',403);
      const scope=await resolveScope(req.user,{}).catch(()=>({groupIds:[]}));if(!(scope.groupIds||[]).some(g=>sid(g)===sid(u.groupId)))throw err('Talaba sizning doirangizda emas',403);
    }
    return {owner:u,staff:true};
  }
  async function ownBook(req){
    if(!mongoose.isValidObjectId(req.params.id))throw err('ID noto‘g‘ri');
    const b=await Book.findById(req.params.id).lean();if(!b)throw err('Kitob topilmadi',404);
    if(sid(b.ownerId)!==sid(req.user._id))await shelfOwner(req,sid(b.ownerId));
    return b;
  }

  // Reads one file field from a multipart request into memory (books are ≤ 60 MB) with the other fields.
  async function storeBook(owner,{fields,file},{addedBy,addedByName,uploaderId}){
    if(await Book.countDocuments({ownerId:owner._id})>=MAX_BOOKS)throw err('Javonda '+MAX_BOOKS+' tadan ortiq kitob bo‘lmaydi');
    const type=await checkBookHeader(file.name,file.buffer.subarray(0,8192));
    const out=files().openUploadStream(cleanTitle(file.name,'kitob.'+type.ext),{metadata:{ownerId:sid(owner._id),addedBy}});
    try{await pipeline(Readable.from([file.buffer]),out)}catch(e){await files().delete(out.id).catch(()=>{});throw e}
    const lang=['uz','ru','en'].includes(fields.lang)?fields.lang:'uz';
    try{return await Book.create({ownerId:owner._id,title:cleanTitle(fields.title,cleanTitle(path.parse(file.name).name)),author:cleanTitle(fields.author,'').slice(0,160),lang,fileId:out.id,mimeType:type.mimeType,size:file.size,addedBy,addedByName:String(addedByName||'').slice(0,120),uploaderId})}
    catch(e){await files().delete(out.id).catch(()=>{});throw e}
  }

  app.get('/api/my-books',auth,async(req,res)=>{
    try{const {owner}=await shelfOwner(req);const rows=await Book.find({ownerId:owner._id}).sort({updatedAt:-1}).lean();res.set('Cache-Control','private, no-store').json({owner:{id:sid(owner._id),fullName:owner.fullName},books:rows.map(view)})}catch(e){fail(res,e)}
  });
  app.post('/api/my-books',auth,uploadGate,async(req,res)=>{
    try{
      const {owner,staff}=await shelfOwner(req);const up=await readBookUpload(req);
      const b=await storeBook(owner,up,{addedBy:staff?'staff':'self',addedByName:req.user.fullName,uploaderId:mongoose.isValidObjectId(req.user._id)?req.user._id:undefined});
      audit(req,'PERSONAL_BOOK_ADD','PersonalBook',sid(b._id),{ownerId:sid(owner._id),size:b.size});res.status(201).json({book:view(b)});
    }catch(e){fail(res,e)}
  });
  app.get('/api/my-books/:id/file',auth,async(req,res)=>{
    try{const b=await ownBook(req);res.set({'Content-Type':b.mimeType||'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'inline; filename="book"'});
      const s=files().openDownloadStream(b.fileId);res.on('close',()=>s.destroy());s.on('error',()=>{if(!res.headersSent)res.status(404).json({message:'Fayl topilmadi'});else res.end()});s.pipe(res)}catch(e){fail(res,e)}
  });
  app.patch('/api/my-books/:id',auth,async(req,res)=>{
    try{
      const b=await ownBook(req);const set={};
      if(req.body?.title!==undefined)set.title=cleanTitle(req.body.title,b.title);
      if(req.body?.author!==undefined)set.author=cleanTitle(req.body.author,'').slice(0,160);
      if(['uz','ru','en'].includes(req.body?.lang))set.lang=req.body.lang;
      if(req.body?.progress){const p=req.body.progress;set.progress={page:Math.max(0,Math.min(100000,Number(p.page)|0)),idx:Math.max(0,Math.min(100000,Number(p.idx)|0)),pages:Math.max(0,Math.min(100000,Number(p.pages)|0)),finished:Boolean(p.finished),at:new Date(now())}}
      await Book.updateOne({_id:b._id},{$set:set});res.json({book:view({...b,...set})});
    }catch(e){fail(res,e)}
  });
  app.delete('/api/my-books/family-link',auth,async(req,res)=>{try{const {owner}=await shelfOwner(req);await Link.updateOne({ownerId:owner._id,revoked:false},{$set:{revoked:true}});res.json({ok:true})}catch(e){fail(res,e)}});
  app.delete('/api/my-books/:id',auth,async(req,res)=>{
    try{const b=await ownBook(req);await Book.deleteOne({_id:b._id});await files().delete(b.fileId).catch(()=>{});audit(req,'PERSONAL_BOOK_DELETE','PersonalBook',sid(b._id),{ownerId:sid(b.ownerId)});res.json({ok:true})}catch(e){fail(res,e)}
  });

  // ---------- family upload link ----------
  app.post('/api/my-books/family-link',auth,async(req,res)=>{
    try{
      const {owner}=await shelfOwner(req);if(owner.role!=='student')throw err('Oila havolasi talabalar uchun',403);
      const token=crypto.randomBytes(24).toString('base64url');
      await Link.findOneAndUpdate({ownerId:owner._id},{$set:{tokenHash:hash(token),expiresAt:new Date(now()+LINK_DAYS*864e5),uses:0,revoked:false}},{upsert:true,new:true});
      audit(req,'FAMILY_LINK_CREATE','User',sid(owner._id));
      res.status(201).json({path:'/family-upload.html#'+token,expiresInDays:LINK_DAYS,maxUploads:LINK_UPLOADS});
    }catch(e){fail(res,e)}
  });
  async function linkFor(token){
    if(!/^[A-Za-z0-9_-]{32}$/.test(token||''))throw err('Havola noto‘g‘ri',410);
    const l=await Link.findOne({tokenHash:hash(token),revoked:false}).lean();
    if(!l||+new Date(l.expiresAt)<=now())throw err('Havola eskirgan yoki bekor qilingan. Talabadan yangi havola so‘rang.',410);
    if(l.uses>=LINK_UPLOADS)throw err('Bu havola orqali yuklash limiti tugadi',429);
    const owner=await User.findById(l.ownerId).lean();if(!owner?.active||owner.role!=='student')throw err('Talaba topilmadi',404);
    return {l,owner};
  }
  // Public (no login): tells the family whose shelf they are filling — first name only.
  app.get('/api/family-upload/:token',async(req,res)=>{
    try{const {l,owner}=await linkFor(req.params.token);res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).json({student:String(owner.fullName||'').split(' ')[0]||'Talaba',expiresAt:l.expiresAt,left:LINK_UPLOADS-l.uses})}catch(e){fail(res,e)}
  });
  app.post('/api/family-upload/:token',uploadGate,async(req,res)=>{
    let reserved=null;
    try{
      // The URL token authorizes upload only. Reject cross-origin form submissions.
      if(req.headers['sec-fetch-site']==='cross-site')throw err('Yuklash sahifasini havola orqali oching',403);
      const {l,owner}=await linkFor(req.params.token);
      reserved=await Link.findOneAndUpdate({_id:l._id,tokenHash:l.tokenHash,revoked:false,uses:{$lt:LINK_UPLOADS},expiresAt:{$gt:new Date(now())}},{$inc:{uses:1}},{new:true}).lean();
      if(!reserved)throw err('Havola eskirgan yoki yuklash limiti tugadi',429);
      const up=await readBookUpload(req);
      const b=await storeBook(owner,up,{addedBy:'family',addedByName:cleanTitle(up.fields.from,'Oila a’zosi').slice(0,120)});
      reserved=null;
      audit({user:null,ip:req.ip},'PERSONAL_BOOK_ADD_FAMILY','PersonalBook',sid(b._id),{ownerId:sid(owner._id)});
      res.status(201).json({ok:true,title:b.title});
    }catch(e){if(reserved)await Link.updateOne({_id:reserved._id,tokenHash:reserved.tokenHash,uses:{$gt:0}},{$inc:{uses:-1}}).catch(()=>{});fail(res,e)}
  });
  return {Book,Link};
}
