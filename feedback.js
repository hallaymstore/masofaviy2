// VM 559, 11-band: learner feedback on course, instructor and LMS.
// Only aggregated ratings are exposed. Teacher-facing analytics require >=5 learners.
export const FEEDBACK_MIN_RESPONSES=5;

export function feedbackRating(value,field='Baho'){
  const n=Number(value);
  if(value===null||value===undefined||value===''||!Number.isInteger(n)||n<1||n>5)
    throw Object.assign(new Error(field+' 1–5 butun son bo‘lsin'),{status:400});
  return n;
}
export function feedbackPeriod(now=new Date()){
  const local=new Date(now.getTime()+5*3600000);
  const year=local.getUTCFullYear()-(local.getUTCMonth()<8?1:0);
  return year+'/'+(year+1);
}
export function feedbackSummary(rows=[],minimum=FEEDBACK_MIN_RESPONSES){
  const count=rows.length;
  if(count<minimum)return {responses:count,minimum,visible:false,reason:'Maxfiylik uchun kamida '+minimum+' ta talaba javobi kerak'};
  const keys=['courseRating','teacherRating','platformRating'];
  const means=Object.fromEntries(keys.map(key=>{
    const valid=rows.map(r=>r[key]).filter(v=>Number.isInteger(v)&&v>=1&&v<=5);
    return [key,valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length*10)/10:null];
  }));
  return {responses:count,minimum,visible:true,means};
}
export function installFeedback(app,{mongoose,auth,audit,courseAccess,resolveUserGroupId}){
  const id=mongoose.Schema.Types.ObjectId;
  const schema=new mongoose.Schema({
    respondentId:{type:id,ref:'User',required:true,index:true},
    target:{type:String,enum:['course','platform'],required:true,index:true},
    courseId:{type:id,ref:'Course',default:null},
    academicPeriod:{type:String,required:true,index:true},
    courseRating:{type:Number,min:1,max:5},
    teacherRating:{type:Number,min:1,max:5},
    platformRating:{type:Number,min:1,max:5}
  },{timestamps:true});
  schema.index({respondentId:1,target:1,courseId:1,academicPeriod:1},{unique:true});
  const Feedback=mongoose.models.LearnerFeedback||mongoose.model('LearnerFeedback',schema);
  const student=req=>req.user.role==='student';
  const admin=req=>['admin','superadmin'].includes(req.user.role);
  const wrap=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){res.status(e.status||400).json({message:e.message||'Fikr-mulohaza xatosi'})}};
  app.post('/api/lms/courses/:id/feedback',auth,wrap(async(req,res)=>{
    if(!student(req))return res.status(403).json({message:'Faqat talaba fikr qoldiradi'});
    await courseAccess(req,req.params.id);
    const period=feedbackPeriod(), courseRating=feedbackRating(req.body.courseRating,'Fan bahosi'),
      teacherRating=feedbackRating(req.body.teacherRating,'O‘qituvchi bahosi');
    await Feedback.findOneAndUpdate(
      {respondentId:req.user._id,target:'course',courseId:req.params.id,academicPeriod:period},
      {$set:{courseRating,teacherRating}},
      {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true}
    );
    audit(req,'FEEDBACK_SUBMIT','Course',req.params.id,{academicPeriod:period});
    res.json({ok:true,academicPeriod:period,message:'Baholash anonim yig‘ma statistika sifatida ko‘rsatiladi'});
  }));
  app.get('/api/lms/courses/:id/feedback-summary',auth,wrap(async(req,res)=>{
    await courseAccess(req,req.params.id,true);
    const period=feedbackPeriod(),rows=await Feedback.find({target:'course',courseId:req.params.id,academicPeriod:period})
      .select('courseRating teacherRating -_id').lean();
    res.json({academicPeriod:period,...feedbackSummary(rows)});
  }));
  app.post('/api/lms/feedback/platform',auth,wrap(async(req,res)=>{
    if(!student(req))return res.status(403).json({message:'Faqat talaba fikr qoldiradi'});
    const period=feedbackPeriod(),platformRating=feedbackRating(req.body.platformRating,'Platforma bahosi');
    await Feedback.findOneAndUpdate(
      {respondentId:req.user._id,target:'platform',courseId:null,academicPeriod:period},
      {$set:{platformRating}},
      {upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true}
    );
    audit(req,'PLATFORM_FEEDBACK_SUBMIT','LearnerFeedback',period,{});
    res.json({ok:true,academicPeriod:period});
  }));
  app.get('/api/lms/feedback/platform-summary',auth,wrap(async(req,res)=>{
    if(!admin(req))return res.status(403).json({message:'Ruxsat yo‘q'});
    const period=feedbackPeriod(),rows=await Feedback.find({target:'platform',courseId:null,academicPeriod:period})
      .select('platformRating -_id').lean();
    res.json({academicPeriod:period,...feedbackSummary(rows)});
  }));
  return {Feedback};
}
