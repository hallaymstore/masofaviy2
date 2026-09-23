// Searchable academic information-resource catalogue for books, textbooks, monographs, articles and research outputs.
export function installLibrary(app,{mongoose,User,Course,Resource,auth,audit,courseAccess,resolveUserGroupId}){
  const id=mongoose.Schema.Types.ObjectId;
  const librarySchema=new mongoose.Schema({
    type:{type:String,enum:['book','textbook','manual','monograph','article','research','thesis','standard','other'],required:true,index:true},
    title:{type:String,required:true,trim:true,maxlength:300,index:true},
    authors:[{type:String,trim:true,maxlength:160}],
    publicationYear:{type:Number,min:1000,max:3000},
    language:{type:String,trim:true,maxlength:40,index:true},
    isbn:{type:String,trim:true,maxlength:40},
    doi:{type:String,trim:true,maxlength:200},
    description:{type:String,trim:true,maxlength:5000},
    tags:[{type:String,trim:true,maxlength:80}],
    sourceUrl:{type:String,trim:true,maxlength:2000},
    resourceId:{type:id,ref:'Resource'},
    courseIds:[{type:id,ref:'Course',index:true}],
    audience:{type:String,enum:['university','courses'],default:'courses',index:true},
    published:{type:Boolean,default:true,index:true},
    accessCount:{type:Number,default:0,min:0},
    createdBy:{type:id,ref:'User'}
  },{timestamps:true});
  librarySchema.index({title:'text',authors:'text',description:'text',tags:'text'});
  const LibraryItem=mongoose.models.LibraryItem||mongoose.model('LibraryItem',librarySchema);
  const accessSchema=new mongoose.Schema({
    itemId:{type:id,ref:'LibraryItem',required:true,index:true},
    userId:{type:id,ref:'User',required:true,index:true},
    at:{type:Date,default:Date.now,index:true}
  },{versionKey:false});
  accessSchema.index({itemId:1,at:-1});
  const LibraryAccess=mongoose.models.LibraryAccess||mongoose.model('LibraryAccess',accessSchema);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const checkId=value=>{if(!mongoose.isValidObjectId(value))throw Object.assign(new Error('ID noto‘g‘ri'),{status:400})};
  const isAdmin=user=>['admin','superadmin'].includes(user.role);
  const https=value=>{const s=String(value||'').trim();if(!s)return '';if(!/^https:\/\//i.test(s)||s.length>2000)throw new Error('Faqat HTTPS havola qabul qilinadi');return s};
  const accessibleCourseIds=async user=>{
    if(isAdmin(user))return null;
    if(user.role==='teacher')return (await Course.find({teacherId:user._id,active:true}).select('_id').lean()).map(x=>x._id);
    if(user.role==='student'){const groupId=await resolveUserGroupId(user);if(!groupId)return [];return (await Course.find({groupId,active:true}).select('_id').lean()).map(x=>x._id)}
    return [];
  };
  const canRead=async(req,item)=>{
    if(isAdmin(req.user)||item.audience==='university')return true;
    const ids=await accessibleCourseIds(req.user);return ids?.some(x=>item.courseIds?.some(c=>String(c)===String(x)));
  };

  app.get('/api/lms/library',auth,async(req,res)=>{
    try{
      const q=String(req.query.q||'').trim().slice(0,120),type=String(req.query.type||'').trim(),language=String(req.query.language||'').trim(),filter={published:true};
      if(type)filter.type=type;if(language)filter.language=language;
      if(q)filter.$text={$search:q};
      const ids=await accessibleCourseIds(req.user);
      if(ids!==null)filter.$or=[{audience:'university'},{audience:'courses',courseIds:{$in:ids}}];
      let query=LibraryItem.find(filter).populate('courseIds','code title').populate('resourceId','title kind mimeType size courseId').sort(q?{score:{$meta:'textScore'}}:{updatedAt:-1});
      if(q)query=query.select({score:{$meta:'textScore'}});
      const rows=await query.limit(300).lean();res.json(rows);
    }catch(e){fail(res,e)}
  });
  app.post('/api/lms/library',auth,async(req,res)=>{
    try{
      if(!['teacher','admin','superadmin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
      const type=String(req.body.type||''),title=String(req.body.title||'').trim(),audience=req.body.audience==='university'?'university':'courses';
      if(!['book','textbook','manual','monograph','article','research','thesis','standard','other'].includes(type)||title.length<2)throw new Error('Tur va sarlavhani kiriting');
      let courseIds=[...new Set((Array.isArray(req.body.courseIds)?req.body.courseIds:[]).map(String).filter(Boolean))];for(const value of courseIds)checkId(value);
      if(req.user.role==='teacher'){
        const allowed=new Set((await Course.find({_id:{$in:courseIds},teacherId:req.user._id,active:true}).select('_id').lean()).map(x=>String(x._id)));
        if(courseIds.some(x=>!allowed.has(x)))return res.status(403).json({message:'Faqat o‘zingizning fanlaringizni tanlang'});
        if(audience==='university')return res.status(403).json({message:'Universitet miqyosidagi resursni administrator tasdiqlaydi'});
      }
      let resourceId=req.body.resourceId||undefined,sourceUrl=https(req.body.sourceUrl);
      if(resourceId){checkId(resourceId);const resource=await Resource.findById(resourceId).lean();if(!resource)throw new Error('Biriktirilgan fayl topilmadi');await courseAccess(req,resource.courseId,true);if(!courseIds.length)courseIds=[String(resource.courseId)]}
      if(!resourceId&&!sourceUrl)throw new Error('Fayl resursi yoki HTTPS manba kerak');
      if(audience==='courses'&&!courseIds.length)throw new Error('Kamida bitta fan tanlang');
      const authors=(Array.isArray(req.body.authors)?req.body.authors:String(req.body.authors||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,20);
      const tags=(Array.isArray(req.body.tags)?req.body.tags:String(req.body.tags||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,30);
      const row=await LibraryItem.create({type,title,authors,publicationYear:req.body.publicationYear?Number(req.body.publicationYear):undefined,language:String(req.body.language||'').trim(),isbn:String(req.body.isbn||'').trim(),doi:String(req.body.doi||'').trim(),description:String(req.body.description||'').slice(0,5000),tags,sourceUrl,resourceId,courseIds,audience,createdBy:req.user._id});
      audit(req,'LIBRARY_ITEM_CREATE','LibraryItem',row.id,{type,audience,courseCount:courseIds.length});res.status(201).json(row);
    }catch(e){fail(res,e)}
  });
  app.get('/api/lms/library/:id/open',auth,async(req,res)=>{
    try{checkId(req.params.id);const item=await LibraryItem.findOne({_id:req.params.id,published:true}).lean();if(!item)return res.status(404).json({message:'Resurs topilmadi'});if(!await canRead(req,item))return res.status(403).json({message:'Bu resursga ruxsat yo‘q'});
      let url=item.sourceUrl;if(item.resourceId){const resource=await Resource.findById(item.resourceId).lean();if(!resource)return res.status(404).json({message:'Fayl topilmadi'});await courseAccess(req,resource.courseId);url='/api/lms/resources/'+resource._id+'/content'}
      await Promise.all([LibraryItem.updateOne({_id:item._id},{$inc:{accessCount:1}}),LibraryAccess.create({itemId:item._id,userId:req.user._id})]);res.json({url});
    }catch(e){fail(res,e)}
  });
  app.delete('/api/lms/library/:id',auth,async(req,res)=>{
    try{if(!isAdmin(req.user))return res.status(403).json({message:'Faqat administrator arxivlaydi'});checkId(req.params.id);const row=await LibraryItem.findByIdAndUpdate(req.params.id,{$set:{published:false}},{new:true});if(!row)return res.status(404).json({message:'Resurs topilmadi'});audit(req,'LIBRARY_ITEM_ARCHIVE','LibraryItem',row.id);res.json({ok:true})}catch(e){fail(res,e)}
  });
  app.get('/api/lms/library-stats',auth,async(req,res)=>{
    try{if(!isAdmin(req.user))return res.status(403).json({message:'Ruxsat yo‘q'});const [total,byType,top]=await Promise.all([LibraryItem.countDocuments({published:true}),LibraryItem.aggregate([{$match:{published:true}},{$group:{_id:'$type',count:{$sum:1}}},{$sort:{count:-1}}]),LibraryItem.find({published:true}).select('title type accessCount').sort({accessCount:-1}).limit(20).lean()]);res.json({total,byType,top})}catch(e){fail(res,e)}
  });
  return {LibraryItem,LibraryAccess};
}
