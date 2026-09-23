import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { normalizeAcademicYear } from './academic-records.js';

const normKey=key=>String(key||'').trim().toLowerCase().replace(/[ʻ’'\`]/g,'').replace(/[^a-z0-9а-яёқғҳў]+/gi,'_').replace(/^_+|_+$/g,'');
const normalizeRow=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[normKey(k),typeof v==='string'?v.trim():v]));
const pick=(row,names)=>{for(const name of names){const value=row[normKey(name)];if(value!==undefined&&value!==null&&String(value).trim()!=='')return value}return ''};
const https=value=>{const s=String(value||'').trim();if(!s)return '';if(!/^https:\/\//i.test(s)||s.length>2000)throw new Error('Fan dasturi uchun faqat HTTPS havola qabul qilinadi');return s};
const bool=value=>['1','true','yes','ha','required','majburiy'].includes(normKey(value));
const semester=value=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>12)throw new Error('Semestr 1–12 oralig‘ida bo‘lsin');return n};
const credits=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0||n>60)throw new Error('Kredit 0–60 oralig‘ida bo‘lsin');return n};

export async function parseCurriculumRows({filename,contentBase64}){
  const buffer=Buffer.from(String(contentBase64||''),'base64');if(!buffer.length||buffer.length>8*1024*1024)throw new Error('O‘quv reja fayli bo‘sh yoki 8 MB dan katta');
  const name=String(filename||'').toLowerCase();let raw=[];
  if(name.endsWith('.csv'))raw=parseCsv(buffer.toString('utf8').replace(/^\uFEFF/,''),{columns:true,skip_empty_lines:true,relax_column_count:true,trim:true});
  else if(name.endsWith('.xlsx')){
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);const ws=wb.worksheets[0];if(!ws)throw new Error('Excel varag‘i topilmadi');
    const headers=(ws.getRow(1).values||[]).slice(1).map(v=>String(v??'').trim());
    for(let r=2;r<=ws.rowCount;r++){const row={};let has=false;headers.forEach((h,i)=>{const value=ws.getRow(r).getCell(i+1).text??'';row[h]=value;if(String(value).trim())has=true});if(has)raw.push(row)}
  }else throw new Error('Faqat .xlsx yoki .csv qabul qilinadi');
  if(!raw.length)throw new Error('O‘quv rejada fanlar topilmadi');
  const seen=new Set(),subjects=[];
  raw.map(normalizeRow).forEach((row,index)=>{
    const sem=semester(pick(row,['semester','semestr'])),code=String(pick(row,['code','fan_kodi','subject_code'])).trim(),title=String(pick(row,['title','fan_nomi','subject'])).trim(),credit=credits(pick(row,['credits','kredit','credit']));
    if(!code||!title)throw new Error((index+2)+'-qator: fan kodi va nomi majburiy');
    const key=sem+'::'+code.toLowerCase();if(seen.has(key))throw new Error((index+2)+'-qator: semestr ichida fan kodi takrorlangan');seen.add(key);
    subjects.push({semester:sem,code,title,credits:credit,language:String(pick(row,['language','til'])).trim(),syllabusUrl:https(pick(row,['syllabus_url','syllabus','fan_dasturi'])),practiceRequired:bool(pick(row,['practice_required','amaliyot','practice']))});
  });
  return subjects;
}

export function installCurriculum(app,{mongoose,User,Structure,Course,Resource,Assignment,Quiz,auth,audit,resolveUserGroupId}){
  const id=mongoose.Schema.Types.ObjectId;
  const subjectSchema=new mongoose.Schema({semester:{type:Number,min:1,max:12,required:true},code:{type:String,required:true,trim:true},title:{type:String,required:true,trim:true},credits:{type:Number,min:0,max:60,required:true},language:{type:String,trim:true},syllabusUrl:String,practiceRequired:{type:Boolean,default:false}},{_id:false});
  const planSchema=new mongoose.Schema({name:{type:String,required:true,trim:true,maxlength:300},programCode:{type:String,required:true,trim:true,index:true},direction:{type:String,required:true,trim:true,maxlength:300},academicYear:{type:String,required:true,index:true},language:{type:String,required:true,trim:true,index:true},approvedDocumentNo:{type:String,trim:true,maxlength:160},approvedAt:Date,groupIds:[{type:id,ref:'Structure',index:true}],subjects:{type:[subjectSchema],default:[]},active:{type:Boolean,default:true,index:true},createdBy:{type:id,ref:'User',required:true}},{timestamps:true});
  planSchema.index({programCode:1,academicYear:1,language:1},{unique:true});
  const Plan=mongoose.models.CurriculumPlan||mongoose.model('CurriculumPlan',planSchema);
  const fail=(res,e)=>res.status(e.status||400).json({message:e.message||'So‘rov bajarilmadi'});
  const checkId=value=>{if(!mongoose.isValidObjectId(value))throw Object.assign(new Error('ID noto‘g‘ri'),{status:400})};
  const admin=user=>['admin','superadmin'].includes(user.role);
  const planAccess=async(req,plan)=>{
    if(admin(req.user))return true;
    const gid=await resolveUserGroupId(req.user);if(gid&&(plan.groupIds||[]).some(x=>String(x)===String(gid)))return true;
    if(req.user.role==='teacher'&&await Course.exists({teacherId:req.user._id,groupId:{$in:plan.groupIds},active:true}))return true;
    throw Object.assign(new Error('Bu o‘quv rejaga ruxsat yo‘q'),{status:403});
  };

  app.get('/api/lms/curricula',auth,async(req,res)=>{
    try{let filter={active:true};if(!admin(req.user)){const gid=await resolveUserGroupId(req.user);if(req.user.role==='student')filter.groupIds=gid||new mongoose.Types.ObjectId();else if(req.user.role==='teacher'){const groups=(await Course.find({teacherId:req.user._id,active:true}).distinct('groupId'));filter.groupIds={$in:groups}}else return res.status(403).json({message:'Ruxsat yo‘q'})}
      res.json(await Plan.find(filter).populate('groupIds','name externalId code').sort({academicYear:-1,direction:1}).lean())}catch(e){fail(res,e)}
  });
  app.post('/api/lms/curricula/import',auth,async(req,res)=>{
    try{if(!admin(req.user))return res.status(403).json({message:'Faqat administrator o‘quv reja yuklaydi'});
      const academicYear=normalizeAcademicYear(req.body.academicYear),groupIds=[...new Set((Array.isArray(req.body.groupIds)?req.body.groupIds:[req.body.groupIds]).filter(Boolean).map(String))];if(!groupIds.length)throw new Error('Kamida bitta guruh tanlang');for(const value of groupIds)checkId(value);
      const groups=await Structure.find({_id:{$in:groupIds},type:'group',active:true}).select('_id').lean();if(groups.length!==groupIds.length)throw new Error('Tanlangan guruhlardan biri topilmadi');
      const subjects=await parseCurriculumRows(req.body),programCode=String(req.body.programCode||'').trim(),direction=String(req.body.direction||'').trim(),language=String(req.body.language||'').trim();if(!programCode||!direction||!language)throw new Error('Yo‘nalish kodi, nomi va ta’lim tili majburiy');
      const row=await Plan.create({name:String(req.body.name||direction+' '+academicYear).trim(),programCode,direction,academicYear,language,approvedDocumentNo:String(req.body.approvedDocumentNo||'').trim(),approvedAt:req.body.approvedAt?new Date(req.body.approvedAt):undefined,groupIds,subjects,createdBy:req.user._id});
      audit(req,'CURRICULUM_IMPORT','CurriculumPlan',row.id,{programCode,academicYear,language,groupCount:groupIds.length,subjectCount:subjects.length});res.status(201).json({id:row.id,subjectCount:subjects.length});
    }catch(e){if(e?.code===11000)return res.status(409).json({message:'Bu yo‘nalish/o‘quv yili/til uchun o‘quv reja allaqachon mavjud'});fail(res,e)}
  });
  app.get('/api/lms/curricula/:id/readiness',auth,async(req,res)=>{
    try{checkId(req.params.id);const plan=await Plan.findById(req.params.id).populate('groupIds','name externalId code').lean();if(!plan?.active)return res.status(404).json({message:'O‘quv reja topilmadi'});await planAccess(req,plan);
      const groupIds=plan.groupIds.map(g=>g._id),courses=await Course.find({groupId:{$in:groupIds},active:true}).lean(),courseIds=courses.map(x=>x._id);
      const [resourceRows,assignmentRows,quizRows,practiceRows]=await Promise.all([
        Resource.aggregate([{$match:{courseId:{$in:courseIds},published:true}},{$group:{_id:'$courseId',count:{$sum:1}}}]),
        Assignment.aggregate([{$match:{courseId:{$in:courseIds},published:true}},{$group:{_id:'$courseId',count:{$sum:1}}}]),
        Quiz.aggregate([{$match:{courseId:{$in:courseIds},published:true}},{$group:{_id:'$courseId',count:{$sum:1}}}]),
        Assignment.aggregate([{$match:{courseId:{$in:courseIds},published:true,category:'practice'}},{$group:{_id:'$courseId',count:{$sum:1}}}])
      ]);
      const map=rows=>new Map(rows.map(x=>[String(x._id),x.count])),rc=map(resourceRows),ac=map(assignmentRows),qc=map(quizRows),pc=map(practiceRows),rows=[];
      for(const group of plan.groupIds)for(const subject of plan.subjects){const course=courses.find(x=>String(x.groupId)===String(group._id)&&String(x.code).toLowerCase()===String(subject.code).toLowerCase()),checks={course:Boolean(course),language:Boolean(course)&&(!subject.language||String(course.language).toLowerCase()===String(subject.language).toLowerCase()),credits:Boolean(course)&&Number(course.credits||0)===Number(subject.credits),syllabus:Boolean(course?.syllabusUrl||subject.syllabusUrl),resources:Boolean(course)&&(rc.get(String(course._id))||0)>0,assignments:Boolean(course)&&(ac.get(String(course._id))||0)>0,quizzes:Boolean(course)&&(qc.get(String(course._id))||0)>0,practice:!subject.practiceRequired||Boolean(course)&&(pc.get(String(course._id))||0)>0};rows.push({group:{id:group._id,name:group.name,code:group.externalId||group.code},subject,courseId:course?._id||null,checks,complete:Object.values(checks).every(Boolean)})}
      const complete=rows.filter(x=>x.complete).length;res.json({plan:{id:plan._id,name:plan.name,programCode:plan.programCode,direction:plan.direction,academicYear:plan.academicYear,language:plan.language,subjectCount:plan.subjects.length,groupCount:plan.groupIds.length},summary:{expected:rows.length,complete,missing:rows.length-complete,percent:rows.length?Math.round(complete/rows.length*100):0},rows});
    }catch(e){fail(res,e)}
  });
  app.delete('/api/lms/curricula/:id',auth,async(req,res)=>{
    try{if(!admin(req.user))return res.status(403).json({message:'Ruxsat yo‘q'});checkId(req.params.id);const row=await Plan.findByIdAndUpdate(req.params.id,{$set:{active:false}},{new:true});if(!row)return res.status(404).json({message:'O‘quv reja topilmadi'});audit(req,'CURRICULUM_ARCHIVE','CurriculumPlan',row.id);res.json({ok:true})}catch(e){fail(res,e)}
  });
  return {CurriculumPlan:Plan};
}
