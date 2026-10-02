import crypto from 'node:crypto';

export function installCompliance(app,{mongoose,User,auth,audit}){
  const id=mongoose.Schema.Types.ObjectId;
  const consentSchema=new mongoose.Schema({
    userId:{type:id,ref:'User',required:true,index:true},
    type:{type:String,enum:['privacy','demo_face','proctoring'],required:true,index:true},
    version:{type:String,required:true,default:'2026-10-02'},
    granted:{type:Boolean,required:true},
    grantedAt:Date,revokedAt:Date,ip:String,userAgent:{type:String,maxlength:500}
  },{timestamps:true});
  consentSchema.index({userId:1,type:1,createdAt:-1});

  const privacyRequestSchema=new mongoose.Schema({
    userId:{type:id,ref:'User',required:true,index:true},
    type:{type:String,enum:['access','correction','restriction','deletion'],required:true},
    note:{type:String,trim:true,maxlength:1000},
    status:{type:String,enum:['submitted','reviewing','completed','rejected'],default:'submitted',index:true},
    reviewedBy:{type:id,ref:'User'},reviewedAt:Date,responseNote:{type:String,trim:true,maxlength:2000}
  },{timestamps:true});

  const identityEventSchema=new mongoose.Schema({
    userId:{type:id,ref:'User',required:true,index:true},
    mode:{type:String,enum:['demo_face','oneid','in_person'],required:true,index:true},
    status:{type:String,enum:['passed','failed','pending'],required:true},
    providerRef:{type:String,trim:true,maxlength:300},
    demo:{type:Boolean,default:false},
    ip:String,userAgent:{type:String,maxlength:500}
  },{timestamps:true});

  const Consent=mongoose.models.ConsentRecord||mongoose.model('ConsentRecord',consentSchema);
  const PrivacyRequest=mongoose.models.PrivacyRequest||mongoose.model('PrivacyRequest',privacyRequestSchema);
  const IdentityEvent=mongoose.models.IdentityEvent||mongoose.model('IdentityEvent',identityEventSchema);

  const VERSION='2026-10-02';
  const FACE_MODE=String(process.env.FACE_ID_MODE||'demo').toLowerCase();
  const ONEID_CLIENT_ID=String(process.env.ONEID_CLIENT_ID||'');
  const ONEID_CLIENT_SECRET=String(process.env.ONEID_CLIENT_SECRET||'');
  const ONEID_REDIRECT_URI=String(process.env.ONEID_REDIRECT_URI||'');
  const oneIdReady=()=>Boolean(ONEID_CLIENT_ID&&ONEID_CLIENT_SECRET&&/^https:\/\//.test(ONEID_REDIRECT_URI));

  const publicPolicy=()=>({
    version:VERSION,
    operator:'Qarshi davlat texnika universiteti',
    purposes:[
      'ta’lim jarayoni va foydalanuvchi akkauntini boshqarish',
      'jonli dars, davomat va nazorat jarayonlarini yuritish',
      'axborot xavfsizligi, audit va hodisalarni tekshirish'
    ],
    biometric:{
      demoMode:FACE_MODE==='demo',
      storesFaceImage:false,
      storesFaceTemplate:false,
      note:FACE_MODE==='demo'
        ?'Demo Face ID faqat kamera mavjudligini namoyish qiladi. U shaxsni huquqiy identifikatsiya qilmaydi va yuz rasmi/shablonini saqlamaydi.'
        :'Biometrik identifikatsiya faqat tasdiqlangan provayder va alohida rozilik asosida ishlatiladi.'
    },
    retention:{
      auditDays:Number(process.env.AUDIT_RETENTION_DAYS||365),
      attendanceDays:Number(process.env.ATTENDANCE_RETENTION_DAYS||730),
      proctoringDays:Number(process.env.PROCTOR_RETENTION_DAYS||180),
      backupsDays:Number(process.env.BACKUP_RETENTION_DAYS||14)
    },
    rights:['ma’lumotlar bilan tanishish','noto‘g‘ri ma’lumotlarni tuzatishni so‘rash','ishlovni cheklashni so‘rash','qonun ruxsat bergan doirada o‘chirishni so‘rash']
  });

  app.get('/api/compliance/public',(_req,res)=>res.json({
    ...publicPolicy(),
    identity:{
      mode:FACE_MODE,
      oneIdConfigured:oneIdReady(),
      oneIdContractRequired:true,
      oneIdTestCredentialsRequired:true
    }
  }));

  app.get('/api/compliance/me',auth,async(req,res)=>{
    const [consents,requests,lastIdentity]=await Promise.all([
      Consent.find({userId:req.user._id}).sort({createdAt:-1}).limit(30).lean(),
      PrivacyRequest.find({userId:req.user._id}).sort({createdAt:-1}).limit(20).lean(),
      IdentityEvent.findOne({userId:req.user._id}).sort({createdAt:-1}).lean()
    ]);
    res.json({policy:publicPolicy(),identity:{mode:FACE_MODE,oneIdConfigured:oneIdReady(),last:lastIdentity},consents,requests});
  });

  app.post('/api/compliance/consent',auth,async(req,res)=>{
    const type=String(req.body.type||'');
    if(!['privacy','demo_face','proctoring'].includes(type))return res.status(400).json({message:'Rozilik turi noto‘g‘ri'});
    const granted=req.body.granted===true;
    const row=await Consent.create({userId:req.user._id,type,version:VERSION,granted,grantedAt:granted?new Date():undefined,revokedAt:granted?undefined:new Date(),ip:req.ip,userAgent:String(req.headers['user-agent']||'').slice(0,500)});
    await audit(req,granted?'CONSENT_GRANTED':'CONSENT_REVOKED','ConsentRecord',row.id,{type,version:VERSION});
    res.json({ok:true,row});
  });

  app.post('/api/compliance/privacy-request',auth,async(req,res)=>{
    const type=String(req.body.type||'');
    if(!['access','correction','restriction','deletion'].includes(type))return res.status(400).json({message:'So‘rov turi noto‘g‘ri'});
    const row=await PrivacyRequest.create({userId:req.user._id,type,note:String(req.body.note||'').slice(0,1000)});
    await audit(req,'PRIVACY_REQUEST_CREATE','PrivacyRequest',row.id,{type});
    res.status(201).json(row);
  });

  app.get('/api/admin/compliance-readiness',auth,async(req,res)=>{
    if(!['superadmin','admin','tech'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    const [users,privacyConsents,demoConsents,proctorConsents,pendingRequests,identityEvents]=await Promise.all([
      User.countDocuments({active:true}),
      Consent.countDocuments({type:'privacy',granted:true}),
      Consent.countDocuments({type:'demo_face',granted:true}),
      Consent.countDocuments({type:'proctoring',granted:true}),
      PrivacyRequest.countDocuments({status:{$in:['submitted','reviewing']}}),
      IdentityEvent.countDocuments()
    ]);
    res.json({generatedAt:new Date(),identityMode:FACE_MODE,oneIdConfigured:oneIdReady(),users,privacyConsents,demoConsents,proctorConsents,pendingPrivacyRequests:pendingRequests,identityEvents,checks:[
      {key:'local_biometric_storage',ok:true,note:'Demo rejimda yuz rasmi yoki biometrik shablon saqlanmaydi'},
      {key:'consent_log',ok:true,note:'Roziliklar alohida jurnalga yoziladi'},
      {key:'privacy_requests',ok:true,note:'Kirish/tuzatish/cheklash/o‘chirish so‘rovlari qayd etiladi'},
      {key:'oneid_production',ok:oneIdReady(),note:oneIdReady()?'OneID production konfiguratsiyasi mavjud':'Shartnoma va test/production client kalitlari kutilmoqda'}
    ]});
  });

  app.get('/api/identity/status',auth,async(req,res)=>{
    const last=await IdentityEvent.findOne({userId:req.user._id}).sort({createdAt:-1}).lean();
    res.json({mode:FACE_MODE,demo:FACE_MODE==='demo',oneIdConfigured:oneIdReady(),last});
  });

  app.post('/api/identity/demo-face',auth,async(req,res)=>{
    if(FACE_MODE!=='demo')return res.status(409).json({message:'Demo Face ID o‘chirilgan'});
    const consent=await Consent.findOne({userId:req.user._id,type:'demo_face',granted:true}).sort({createdAt:-1}).lean();
    if(!consent)return res.status(409).json({message:'Demo kamera tekshiruviga rozilik talab qilinadi'});
    if(req.body.cameraReady!==true)return res.status(400).json({message:'Kamera tayyor emas'});
    const row=await IdentityEvent.create({userId:req.user._id,mode:'demo_face',status:'passed',demo:true,providerRef:'DEMO-'+crypto.randomBytes(6).toString('hex'),ip:req.ip,userAgent:String(req.headers['user-agent']||'').slice(0,500)});
    await audit(req,'IDENTITY_DEMO_FACE_PASS','IdentityEvent',row.id,{demo:true,noBiometricStored:true});
    res.json({ok:true,demo:true,message:'Demo tasdiqlandi. Bu OneID yoki huquqiy biometrik identifikatsiya emas.'});
  });

  app.get('/api/auth/oneid/readiness',(_req,res)=>res.json({
    configured:oneIdReady(),
    contractRequired:true,
    clientIdConfigured:Boolean(ONEID_CLIENT_ID),
    clientSecretConfigured:Boolean(ONEID_CLIENT_SECRET),
    redirectUriConfigured:/^https:\/\//.test(ONEID_REDIRECT_URI),
    authorizationEndpoint:'https://sso.egov.uz/sso/oauth/Authorization.do'
  }));

  app.get('/api/auth/oneid/start',(_req,res)=>{
    if(!oneIdReady())return res.status(503).json({message:'OneID production hali faollashtirilmagan: shartnoma va client kalitlari kerak'});
    const state=crypto.randomBytes(24).toString('base64url');
    const u=new URL('https://sso.egov.uz/sso/oauth/Authorization.do');
    u.searchParams.set('response_type','one_code');
    u.searchParams.set('client_id',ONEID_CLIENT_ID);
    u.searchParams.set('redirect_uri',ONEID_REDIRECT_URI);
    u.searchParams.set('scope','1');
    u.searchParams.set('state',state);
    res.json({url:u.toString(),state});
  });

  app.get('/api/admin/privacy-requests',auth,async(req,res)=>{
    if(!['superadmin','admin','tech'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    const status=String(req.query.status||'');
    const filter=status?{status}:{};
    res.json(await PrivacyRequest.find(filter).populate('userId','fullName login role').sort({createdAt:-1}).limit(500).lean());
  });

  app.patch('/api/admin/privacy-requests/:id',auth,async(req,res)=>{
    if(!['superadmin','admin'].includes(req.user.role))return res.status(403).json({message:'Ruxsat yo‘q'});
    const status=String(req.body.status||'');
    if(!['reviewing','completed','rejected'].includes(status))return res.status(400).json({message:'Status noto‘g‘ri'});
    const row=await PrivacyRequest.findById(req.params.id);
    if(!row)return res.status(404).json({message:'So‘rov topilmadi'});
    row.status=status;row.responseNote=String(req.body.responseNote||'').slice(0,2000);row.reviewedBy=req.user._id;row.reviewedAt=new Date();await row.save();
    await audit(req,'PRIVACY_REQUEST_REVIEW','PrivacyRequest',row.id,{status});
    res.json(row);
  });

  return {Consent,PrivacyRequest,IdentityEvent};
}
