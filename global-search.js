import {SEARCH_TYPES,normalizeSearchQuery,safeSearchRegex,buildSearchHit} from './global-search-rules.js';

// Search uses the same role/group boundaries as the target pages.
// Results contain only minimal public labels, never passwords, answers, or proctor telemetry.
export function installGlobalSearch(app,{mongoose,auth,User,Structure,Schedule,VideoLesson,LiveSession,resolveScope,resolveUserGroupId,hasPermission}){
 const isWide=role=>['admin','superadmin','tech','rectorate'].includes(role);
 const managers=new Set(['dean','department','tutor']);
 const str=x=>String(x?._id||x||'');
 const findRegex=(fields,re)=>({$or:fields.map(f=>({[f]:{$regex:re,$options:'i'}}))});
 app.get('/api/search/target/video/:id',auth,async(req,res)=>{
   try{
     if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Video ID noto‘g‘ri'});
     const video=await VideoLesson.findOne({_id:req.params.id,published:true})
       .populate('teacherId','fullName login').populate('groupIds','name externalId code')
       .populate('courseId','code title language').populate('checkpointQuizId','title durationMinutes proctorRequired published').lean();
     if(!video)return res.status(404).json({message:'Videodars topilmadi'});
     const progress=mongoose.isValidObjectId(req.user._id)?
       await mongoose.models.VideoProgress.findOne({userId:req.user._id,videoId:video._id}).lean():null;
     const commentCount=await mongoose.models.VideoComment.countDocuments({videoId:video._id});
     res.set('Cache-Control','private,no-store');
     res.json({...video,progress,commentCount});
   }catch(e){res.status(500).json({message:'Videodarsni yuklashda xatolik'})}
 });
 app.get('/api/search',auth,async(req,res)=>{
  try{
   const q=normalizeSearchQuery(req.query.q),type=String(req.query.type||'all');
   if(type!=='all'&&!SEARCH_TYPES.includes(type))return res.status(400).json({message:'Qidiruv turi noto‘g‘ri'});
   const regex=safeSearchRegex(q),re=regex,context=values=>{const item=values.flat().find(v=>String(v||'').toLocaleLowerCase('uz').includes(q.toLocaleLowerCase('uz')));if(!item)return '';const s=String(item),i=s.toLocaleLowerCase('uz').indexOf(q.toLocaleLowerCase('uz'));return s.slice(Math.max(0,i-35),Math.min(s.length,i+155))},role=req.user.role,wide=isWide(role),manager=managers.has(role),student=role==='student',teacher=role==='teacher';
   const Course=mongoose.models.Course,Assignment=mongoose.models.Assignment,Resource=mongoose.models.Resource,Quiz=mongoose.models.Quiz,Library=mongoose.models.LibraryItem;
   const scope=manager?await resolveScope(req.user,{}):null;
   let groupIds=null;
   if(student){const gid=await resolveUserGroupId(req.user);groupIds=gid?[gid]:[]}
   else if(manager)groupIds=scope.groupIds||[];
   else if(teacher){
     const [courses,lessons]=await Promise.all([
       Course.find({teacherId:req.user._id,active:true}).select('groupId').lean(),
       Schedule.find({teacherId:req.user._id}).select('groupId').lean()
     ]);
     const ids=[...courses,...lessons].map(r=>str(r.groupId)).filter(mongoose.isValidObjectId);
     groupIds=[...new Set(ids)].map(id=>new mongoose.Types.ObjectId(id));
   }else if(!wide)groupIds=[];
   const courseFilter={active:true};
   if(student||manager)courseFilter.groupId={$in:groupIds||[]};
   if(teacher)courseFilter.teacherId=req.user._id;
   if(!student&&!manager&&!teacher&&!wide)courseFilter._id={$in:[]};
   const courses=Course?await Course.find(courseFilter).select('_id title code groupId teacherId').limit(2000).lean():[];
   const courseIds=courses.map(c=>c._id);
   const courseMap=new Map(courses.map(c=>[str(c._id),c]));
   const allow=kind=>type==='all'||type===kind;
   const found=[];
   const query=(model,filter,fields,limit=15)=>model.find({...filter,...findRegex(fields,re)}).select(fields.join(' ')+' _id courseId groupId teacherId type audience').limit(limit).lean();
   const add=(kind,rows,mapper)=>{
     if(!allow(kind))return;
     for(const row of rows){
       const x=mapper(row);if(x&&x.title)found.push(buildSearchHit({...x,type:kind,query:q}));
     }
   };
   if(allow('course'))add('course',courses.filter(c=>[c.title,c.code].some(s=>new RegExp(re,'i').test(String(s||'')))).slice(0,20),c=>({id:c._id,title:c.title,subtitle:'Fan · '+(c.code||''),page:'courses',courseId:c._id,groupId:c.groupId}));
   const requests=[];
   const enqueue=(kind,model,filter,fields,mapper,limit=16)=>{
     if(!allow(kind)||!model||!courseIds&&['resource','assignment','quiz'].includes(kind))return;
     requests.push(query(model,filter,fields,limit).then(rows=>add(kind,rows,mapper)));
   };
   const byCourse={courseId:{$in:courseIds}};
   enqueue('resource',Resource,{...byCourse,published:true},['title','description','originalName'],r=>({id:r._id,title:r.title,subtitle:'Material · '+(courseMap.get(str(r.courseId))?.title||'Fan')+' · '+context([r.description,r.originalName]),page:'courses',courseId:r.courseId}));
   enqueue('assignment',Assignment,{...byCourse,published:true},['title','instructions'],r=>({id:r._id,title:r.title,subtitle:'Topshiriq · '+(courseMap.get(str(r.courseId))?.title||'Fan')+' · '+context([r.instructions]),page:'courses',courseId:r.courseId}));
   enqueue('quiz',Quiz,{...byCourse,published:true},['title'],r=>({id:r._id,title:r.title,subtitle:'Test · '+(courseMap.get(str(r.courseId))?.title||'Fan'),page:'courses',courseId:r.courseId}));
   if(allow('schedule')){
     const scopeFilter={};
     if(student||manager||teacher||!wide)scopeFilter.groupId={$in:groupIds||[]};
     if(teacher)scopeFilter.teacherId=req.user._id;
     requests.push(query(Schedule,scopeFilter,['title','subject','room'],20).then(rows=>add('schedule',rows,r=>({id:r._id,title:r.title||r.subject,subtitle:'Dars jadvali · '+(r.subject||''),page:'schedule',groupId:r.groupId}))));
   }
   if(allow('video')){
     requests.push(query(VideoLesson,{published:true},['title','description','subject','moduleTitle','topicTitle','tags'],20)
      .then(rows=>add('video',rows,r=>({id:r._id,title:r.title,subtitle:'Videodars · '+(r.subject||'')+' · '+context([r.description,r.moduleTitle,r.topicTitle,r.tags]),page:'videoWatch'}))));
   }
   if(allow('library')&&Library){
     const catalogFilter={published:true};
     if(!['admin','superadmin'].includes(role))catalogFilter.$and=[{$or:[{audience:'university'},{audience:'courses',courseIds:{$in:courseIds}}]}];
     requests.push(query(Library,catalogFilter,['title','authors','description','tags','isbn'],20)
      .then(rows=>add('library',rows,r=>({id:r._id,title:r.title,subtitle:'Kutubxona · '+(r.type||'Resurs')+' · '+context([r.description,r.authors,r.tags,r.isbn]),page:'library'}))));
   }
   if(allow('group')&&(hasPermission(req.user,'structure.manage')||['dean','department'].includes(role))){
     const filt={type:'group',active:true};
     if(!wide)filt._id={$in:groupIds||[]};
     requests.push(query(Structure,filt,['name','code','externalId'],20).then(rows=>add('group',rows,r=>({id:r._id,title:r.name,subtitle:'Guruh · '+(r.externalId||r.code||''),page:'structure',groupId:r._id}))));
   }
   if(allow('user')&&hasPermission(req.user,'users.manage')){
     const filt={active:true};
     if(!wide)filt.groupId={$in:groupIds||[]};
     requests.push(query(User,filt,['fullName','login','externalId'],20).then(rows=>add('user',rows,r=>({id:r._id,title:r.fullName,subtitle:'Foydalanuvchi · @'+r.login,page:'users'}))));
   }
   if(allow('history')&&(teacher||manager||wide)){
     const matching=await Schedule.find({
       ...(teacher?{teacherId:req.user._id}:{}),
       ...(!wide?{groupId:{$in:groupIds||[]}}:{}),
       ...findRegex(['title','subject'],re)
     }).select('_id').limit(150).lean();
     if(matching.length){
       const filt={scheduleId:{$in:matching.map(x=>x._id)},startedAt:{$ne:null}};
       if(teacher)filt.teacherId=req.user._id;
       else if(!wide)filt.groupId={$in:groupIds||[]};
       requests.push(LiveSession.find(filt).select('_id dateKey groupId scheduleId').sort({dateKey:-1}).limit(15).lean().then(async rows=>{
         const ss=await Schedule.find({_id:{$in:rows.map(x=>x.scheduleId)}}).select('_id title subject').lean();
         const sm=new Map(ss.map(x=>[str(x._id),x]));
         add('history',rows,r=>({id:r._id,title:sm.get(str(r.scheduleId))?.title||'O‘tilgan dars',subtitle:'Dars tarixi · '+r.dateKey,page:'history',groupId:r.groupId}));
       }));
     }
   }
   await Promise.all(requests);
   found.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'uz'));
   const results=found.filter(r=>r.score>0).slice(0,80);
   res.set('Cache-Control','private,no-store');
   res.json({query:q,results,total:results.length,types:SEARCH_TYPES});
  }catch(e){console.error('Global search:',e.message);res.status(e.status||400).json({message:e.status?e.message:'Qidiruvda xatolik yuz berdi'})}
 });
}
