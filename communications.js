// Persistent communication: course forum, internal messages and an optional outbound e-mail webhook.
const clean=value=>String(value||'').trim();
const httpsUrl=value=>{const s=clean(value);if(!s)return '';try{const u=new URL(s);if(u.protocol!=='https:')return ''}catch{return ''}return s};

export function installCommunications(app,{mongoose,User,Course,auth,audit,courseAccess,resolveUserGroupId}){
  const id=mongoose.Schema.Types.ObjectId;
  const threadSchema=new mongoose.Schema({courseId:{type:id,ref:'Course',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:240},createdBy:{type:id,ref:'User',required:true},locked:{type:Boolean,default:false,index:true}},{timestamps:true});
  threadSchema.index({courseId:1,updatedAt:-1});
  const postSchema=new mongoose.Schema({threadId:{type:id,ref:'ForumThread',required:true,index:true},courseId:{type:id,ref:'Course',required:true,index:true},userId:{type:id,ref:'User',required:true,index:true},text:{type:String,required:true,trim:true,maxlength:5000},parentId:{type:id,ref:'ForumPost',default:null}},{timestamps:true});
  postSchema.index({threadId:1,createdAt:1});
  const messageSchema=new mongoose.Schema({senderId:{type:id,ref:'User',required:true,index:true},recipientId:{type:id,ref:'User',required:true,index:true},subject:{type:String,required:true,trim:true,maxlength:240},body:{type:String,required:true,trim:true,maxlength:10000},readAt:Date,emailStatus:{type:String,enum:['not_configured','queued','sent','failed'],default:'not_configured'}},{timestamps:true});
  messageSchema.index({recipientId:1,createdAt:-1});messageSchema.index({senderId:1,createdAt:-1});
  const Thread=mongoose.models.ForumThread||mongoose.model('ForumThread',threadSchema),Post=mongoose.models.ForumPost||mongoose.model('ForumPost',postSchema),Message=mongoose.models.InternalMessage||mongoose.model('InternalMessage',messageSchema);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const checkId=value=>{if(!mongoose.isValidObjectId(value))throw Object.assign(new Error('ID noto‘g‘ri'),{status:400})};
  const admin=user=>['admin','superadmin'].includes(user.role);
  const courseIdsFor=async user=>{
    if(admin(user))return null;
    if(user.role==='teacher')return (await Course.find({teacherId:user._id,active:true}).select('_id').lean()).map(x=>x._id);
    if(user.role==='student'){const groupId=await resolveUserGroupId(user);if(!groupId)return [];return (await Course.find({groupId,active:true}).select('_id').lean()).map(x=>x._id)}
    return [];
  };
  const recipientsFor=async user=>{
    if(admin(user))return User.find({_id:{$ne:user._id},active:true}).select('_id fullName login role email').sort({fullName:1}).limit(1000).lean();
    if(user.role==='teacher'){
      const courses=await Course.find({teacherId:user._id,active:true}).select('groupId').lean(),groupIds=[...new Set(courses.map(x=>String(x.groupId)))];
      return User.find({_id:{$ne:user._id},active:true,role:'student',groupId:{$in:groupIds}}).select('_id fullName login role email').sort({fullName:1}).limit(1000).lean();
    }
    if(user.role==='student'){
      const groupId=await resolveUserGroupId(user);if(!groupId)return [];
      const courses=await Course.find({groupId,active:true}).select('teacherId').lean(),teacherIds=[...new Set(courses.map(x=>String(x.teacherId)))];
      return User.find({_id:{$in:teacherIds},active:true,role:'teacher'}).select('_id fullName login role email').sort({fullName:1}).lean();
    }
    return [];
  };
  const canMessage=async(sender,recipientId)=>{if(admin(sender))return true;return (await recipientsFor(sender)).some(x=>String(x._id)===String(recipientId))};
  const sendEmailBridge=async(message,recipient)=>{
    const endpoint=httpsUrl(process.env.EMAIL_WEBHOOK_URL),secret=clean(process.env.EMAIL_WEBHOOK_SECRET);if(!endpoint||!recipient.email)return 'not_configured';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(secret?{'authorization':'Bearer '+secret}:{})},body:JSON.stringify({to:recipient.email,subject:message.subject,text:message.body,metadata:{messageId:String(message._id)}}),signal:controller.signal});return response.ok?'sent':'failed'}catch{return 'failed'}finally{clearTimeout(timer)}
  };

  app.get('/api/lms/messages/recipients',auth,async(req,res)=>{try{res.json(await recipientsFor(req.user))}catch(e){fail(res,e)}});
  app.get('/api/lms/messages',auth,async(req,res)=>{
    try{const box=req.query.box==='sent'?'sent':'inbox',filter=box==='sent'?{senderId:req.user._id}:{recipientId:req.user._id},rows=await Message.find(filter).populate('senderId','fullName login role').populate('recipientId','fullName login role').sort({createdAt:-1}).limit(300).lean();res.json(rows)}catch(e){fail(res,e)}
  });
  app.post('/api/lms/messages',auth,async(req,res)=>{
    try{let recipient=null;if(req.body.recipientId){checkId(req.body.recipientId);recipient=await User.findOne({_id:req.body.recipientId,active:true})}else if(req.body.recipientLogin)recipient=await User.findOne({login:clean(req.body.recipientLogin).toLowerCase(),active:true});if(!recipient)throw new Error('Qabul qiluvchi topilmadi');if(String(recipient._id)===String(req.user._id))throw new Error('O‘zingizga xabar yubormang');if(!await canMessage(req.user,recipient._id))return res.status(403).json({message:'Bu foydalanuvchiga xabar yuborish huquqi yo‘q'});
      const subject=clean(req.body.subject).slice(0,240),body=clean(req.body.body).slice(0,10000);if(subject.length<2||body.length<1)throw new Error('Mavzu va xabarni kiriting');
      const row=await Message.create({senderId:req.user._id,recipientId:recipient._id,subject,body,emailStatus:process.env.EMAIL_WEBHOOK_URL?'queued':'not_configured'});row.emailStatus=await sendEmailBridge(row,recipient);await row.save();audit(req,'MESSAGE_SEND','InternalMessage',row.id,{recipientId:String(recipient._id),emailStatus:row.emailStatus});res.status(201).json(row);
    }catch(e){fail(res,e)}
  });
  app.patch('/api/lms/messages/:id/read',auth,async(req,res)=>{
    try{checkId(req.params.id);const row=await Message.findOneAndUpdate({_id:req.params.id,recipientId:req.user._id},{$set:{readAt:new Date()}},{new:true});if(!row)return res.status(404).json({message:'Xabar topilmadi'});res.json({ok:true,readAt:row.readAt})}catch(e){fail(res,e)}
  });

  app.get('/api/lms/courses/:id/forum',auth,async(req,res)=>{
    try{await courseAccess(req,req.params.id);const threads=await Thread.find({courseId:req.params.id}).populate('createdBy','fullName login role').sort({updatedAt:-1}).limit(200).lean(),counts=threads.length?await Post.aggregate([{$match:{threadId:{$in:threads.map(x=>x._id)}}},{$group:{_id:'$threadId',count:{$sum:1},lastAt:{$max:'$createdAt'}}}]):[],byId=new Map(counts.map(x=>[String(x._id),x]));res.json(threads.map(x=>({...x,postCount:byId.get(String(x._id))?.count||0,lastPostAt:byId.get(String(x._id))?.lastAt||null})))}catch(e){fail(res,e)}
  });
  app.post('/api/lms/courses/:id/forum',auth,async(req,res)=>{
    try{await courseAccess(req,req.params.id);const title=clean(req.body.title).slice(0,240),body=clean(req.body.body).slice(0,5000);if(title.length<2||body.length<1)throw new Error('Mavzu va birinchi xabarni kiriting');const thread=await Thread.create({courseId:req.params.id,title,createdBy:req.user._id}),post=await Post.create({threadId:thread._id,courseId:req.params.id,userId:req.user._id,text:body});audit(req,'FORUM_THREAD_CREATE','ForumThread',thread.id);res.status(201).json({thread,post})}catch(e){fail(res,e)}
  });
  app.get('/api/lms/forum/:id/posts',auth,async(req,res)=>{
    try{checkId(req.params.id);const thread=await Thread.findById(req.params.id).lean();if(!thread)return res.status(404).json({message:'Forum mavzusi topilmadi'});await courseAccess(req,thread.courseId);res.json({thread,posts:await Post.find({threadId:thread._id}).populate('userId','fullName login role').sort({createdAt:1}).limit(1000).lean()})}catch(e){fail(res,e)}
  });
  app.post('/api/lms/forum/:id/posts',auth,async(req,res)=>{
    try{checkId(req.params.id);const thread=await Thread.findById(req.params.id);if(!thread)return res.status(404).json({message:'Forum mavzusi topilmadi'});await courseAccess(req,thread.courseId);if(thread.locked&&!admin(req.user)&&req.user.role!=='teacher')return res.status(409).json({message:'Mavzu yopilgan'});const body=clean(req.body.body).slice(0,5000);if(!body)throw new Error('Xabarni kiriting');const row=await Post.create({threadId:thread._id,courseId:thread.courseId,userId:req.user._id,text:body,parentId:req.body.parentId||undefined});thread.updatedAt=new Date();await thread.save();audit(req,'FORUM_POST_CREATE','ForumPost',row.id,{threadId:String(thread._id)});res.status(201).json(row)}catch(e){fail(res,e)}
  });
  app.patch('/api/lms/forum/:id/lock',auth,async(req,res)=>{
    try{checkId(req.params.id);const thread=await Thread.findById(req.params.id);if(!thread)return res.status(404).json({message:'Mavzu topilmadi'});await courseAccess(req,thread.courseId,true);thread.locked=Boolean(req.body.locked);await thread.save();audit(req,thread.locked?'FORUM_LOCK':'FORUM_UNLOCK','ForumThread',thread.id);res.json({ok:true,locked:thread.locked})}catch(e){fail(res,e)}
  });
  return {Thread,Post,Message};
}
