// Ordered course topics. Content associations are independent of existing resource/quiz records:
// legacy content remains intact and can be assigned to a topic without reuploading.
export function installCourseTopics(app,{mongoose,Course,Resource,Assignment,Quiz,auth,audit,courseAccess}){
 const oid=mongoose.Schema.Types.ObjectId;
 const topicSchema=new mongoose.Schema({
   courseId:{type:oid,ref:'Course',required:true,index:true},title:{type:String,required:true,trim:true,maxlength:180},
   description:{type:String,default:'',maxlength:3000},position:{type:Number,required:true,min:0},createdBy:{type:oid,ref:'User'}
 },{timestamps:true});
 topicSchema.index({courseId:1,position:1});
 const linkSchema=new mongoose.Schema({
   courseId:{type:oid,ref:'Course',required:true,index:true},topicId:{type:oid,ref:'CourseTopic',required:true,index:true},
   itemType:{type:String,enum:['resource','assignment','quiz','video'],required:true},
   itemId:{type:oid,required:true},position:{type:Number,min:0,default:0}
 },{timestamps:true});
 linkSchema.index({courseId:1,itemType:1,itemId:1},{unique:true});
 const Topic=mongoose.models.CourseTopic||mongoose.model('CourseTopic',topicSchema);
 const Link=mongoose.models.CourseTopicLink||mongoose.model('CourseTopicLink',linkSchema);
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const check=x=>{if(!mongoose.isValidObjectId(x))throw fail('ID noto‘g‘ri')};
 const wrap=handler=>async(req,res)=>{try{await handler(req,res)}catch(e){res.status(e.status||400).json({message:e.message||'Xatolik'})}};
 const scoped=async(req,write=false)=>{check(req.params.courseId);return courseAccess(req,req.params.courseId,write)};
 const normalize=(body)=>{const title=String(body.title||'').trim(),description=String(body.description||'').trim();if(title.length<2||title.length>180||description.length>3000)throw fail('Mavzu nomi 2–180 belgi, izoh 3000 belgigacha bo‘lsin');return {title,description}};
 async function getTopic(req,write=true){
   await scoped(req,write);check(req.params.topicId);
   const topic=await Topic.findOne({_id:req.params.topicId,courseId:req.params.courseId});
   if(!topic)throw fail('Mavzu topilmadi',404);
   return topic;
 }
 app.get('/api/lms/courses/:courseId/topics',auth,wrap(async(req,res)=>{
   await scoped(req);
   const [topics,links]=await Promise.all([
     Topic.find({courseId:req.params.courseId}).sort({position:1,createdAt:1}).limit(300).lean(),
     Link.find({courseId:req.params.courseId}).sort({position:1,createdAt:1}).limit(4000).lean()
   ]);
   res.set('Cache-Control','private,no-store');res.json({topics,links});
 }));
 app.post('/api/lms/courses/:courseId/topics',auth,wrap(async(req,res)=>{
   await scoped(req,true);const data=normalize(req.body);
   const count=await Topic.countDocuments({courseId:req.params.courseId});
   if(count>=300)throw fail('Bir fan uchun 300 ta mavzu chegarasi',422);
   const last=await Topic.findOne({courseId:req.params.courseId}).sort({position:-1}).select('position').lean();
   const row=await Topic.create({...data,courseId:req.params.courseId,position:(last?.position??-1)+1,createdBy:req.user._id});
   audit(req,'COURSE_TOPIC_CREATE','CourseTopic',row.id);
   res.status(201).json(row);
 }));
 app.patch('/api/lms/courses/:courseId/topics/:topicId',auth,wrap(async(req,res)=>{
   const row=await getTopic(req);
   Object.assign(row,normalize(req.body));await row.save();
   audit(req,'COURSE_TOPIC_UPDATE','CourseTopic',row.id);res.json(row);
 }));
 app.post('/api/lms/courses/:courseId/topics/:topicId/move',auth,wrap(async(req,res)=>{
   const row=await getTopic(req),direction=Number(req.body.direction);
   if(![-1,1].includes(direction))throw fail('Yo‘nalish noto‘g‘ri');
   const siblings=await Topic.find({courseId:req.params.courseId}).sort({position:1,createdAt:1});
   const index=siblings.findIndex(x=>String(x._id)===String(row._id)),neighbor=siblings[index+direction];
   if(!neighbor)return res.json({ok:true});
   // Use unique fresh ordering values to avoid swaps colliding with duplicate legacy positions.
   siblings.splice(index,1);siblings.splice(index+direction,0,row);
   await Promise.all(siblings.map((topic,i)=>Topic.updateOne({_id:topic._id},{$set:{position:i}})));
   audit(req,'COURSE_TOPIC_REORDER','CourseTopic',row.id);
   res.json({ok:true});
 }));
 app.delete('/api/lms/courses/:courseId/topics/:topicId',auth,wrap(async(req,res)=>{
   const row=await getTopic(req);
   await Link.deleteMany({courseId:req.params.courseId,topicId:row._id});await row.deleteOne();
   audit(req,'COURSE_TOPIC_DELETE','CourseTopic',row.id);res.json({ok:true});
 }));
 app.post('/api/lms/courses/:courseId/topics/:topicId/items',auth,wrap(async(req,res)=>{
   await getTopic(req);
   const type=String(req.body.itemType||''),models={resource:Resource,assignment:Assignment,quiz:Quiz,video:mongoose.models.VideoLesson};
   if(!models[type])throw fail('Resurs turi noto‘g‘ri');check(req.body.itemId);
   const exists=await models[type].exists({_id:req.body.itemId,courseId:req.params.courseId});
   if(!exists)throw fail('Bu material ushbu fanga tegishli emas',403);
   const row=await Link.findOneAndUpdate({courseId:req.params.courseId,itemType:type,itemId:req.body.itemId},
     {$set:{topicId:req.params.topicId},$setOnInsert:{position:0}},{upsert:true,new:true,runValidators:true});
   audit(req,'COURSE_TOPIC_ATTACH','CourseTopic',req.params.topicId,{type,itemId:String(req.body.itemId)});
   res.json(row);
 }));
 app.delete('/api/lms/courses/:courseId/items/:type/:itemId/topic',auth,wrap(async(req,res)=>{
   await scoped(req,true);if(!['resource','assignment','quiz','video'].includes(req.params.type))throw fail('Resurs turi noto‘g‘ri');
   check(req.params.itemId);
   await Link.deleteOne({courseId:req.params.courseId,itemType:req.params.type,itemId:req.params.itemId});
   audit(req,'COURSE_TOPIC_DETACH','CourseTopic',req.params.courseId,{type:req.params.type,itemId:req.params.itemId});
   res.json({ok:true});
 }));
}
