// Historical lesson reports: anonymized telemetry proportions, never proof of gaze.
// All dates are interpreted in Asia/Tashkent (UTC+05:00).
const num=x=>Math.max(0,Number(x)||0);
export function historyDateRange(from,to,now=new Date()){
  const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end=to||local;
  const start=from||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now.getTime()-29*86400000));
  for(const value of [start,end]){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00+05:00').toISOString().slice(0,10)>value)throw Object.assign(new Error('Sana YYYY-MM-DD shaklida bo‘lishi kerak'),{status:400});
    const d=new Date(value+'T00:00:00+05:00');
    if(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)!==value)throw Object.assign(new Error('Noto‘g‘ri sana'),{status:400});
  }
  const days=Math.round((new Date(end+'T00:00:00+05:00')-new Date(start+'T00:00:00+05:00'))/86400000);
  if(days<0||days>365)throw Object.assign(new Error('Sana oralig‘i maksimal 366 kun'),{status:400});
  return {from:start,to:end};
}
export function participantHistory({person,attendance=null,role='student',session=null}){
  const joined=attendance?.joinedAt||null,left=attendance?.leftAt||null;
  const rawStatus=attendance?.status||'absent';
  const status=rawStatus==='excused'?'excused':attendance?.manualMarkedAt?rawStatus:joined?(rawStatus==='late'?'late':'present'):'absent';
  const started=attendance?.lastJoinedAt||joined;
  const effectiveEnd=left||session?.endedAt||null;
  const unfinished=started&&effectiveEnd&&new Date(effectiveEnd)>new Date(started)?
    Math.min(180,Math.max(0,(new Date(effectiveEnd)-new Date(started))/60000)):0;
  const intervals=normalizePresenceIntervals(attendance,session);
  const recorded=intervals.length&&intervals.every(x=>x.durationMinutes!=null)?intervals.reduce((s,x)=>s+x.durationMinutes,0):null;
  const minutes=Math.max(0,Math.round((recorded??(num(attendance?.minutes)+(left?0:unfinished)))*10)/10);
  const proctorPresent=num(attendance?.proctorFacePresentSeconds),proctorAway=num(attendance?.proctorFaceAwaySeconds),proctorMissing=num(attendance?.proctorFaceMissingSeconds);
  const classified=proctorPresent+proctorAway+proctorMissing;
  const total=num(attendance?.proctorObservedSeconds);
  const unknown=Math.max(0,total-classified);
  return {
    userId:String(person._id||person.userId||''),
    fullName:String(person.fullName||''),
    login:String(person.login||''),role,status,joinedAt:joined,leftAt:left,
    minutes,reconnectCount:num(attendance?.reconnectCount),
    presenceIntervals:intervals,
    proctorTimeline:normalizeProctorTimeline(attendance,session),
    manuallyMarked:Boolean(attendance?.manualMarkedAt),manualMarkedAt:attendance?.manualMarkedAt||null,manualMarkedBy:attendance?.manualMarkedBy?String(attendance.manualMarkedBy):null,
    manualNote:String(attendance?.manualNote||''),
    checkpoints:Array.isArray(attendance?.checkpoints)?attendance.checkpoints.map(x=>({minute:x.minute,state:x.state,at:x.at})):[],
    proctor:{
      cameraReady:Boolean(attendance?.proctorCameraReady),
      lastFaceState:attendance?.proctorFaceState||'unknown',
      lastAt:attendance?.proctorLastAt||null,
      observedSeconds:total,classifiedSeconds:classified,unknownSeconds:unknown,
      facePresentSeconds:proctorPresent,faceAwaySeconds:proctorAway,faceMissingSeconds:proctorMissing,
      faceVisiblePercent:classified?Math.round(proctorPresent/classified*100):null,
      coveragePercent:minutes?Math.min(100,Math.round(classified/(minutes*60)*100)):null,
      stateChanges:num(attendance?.proctorViolations),timelineTruncated:Boolean(attendance?.proctorTimelineOverflow)
    }
  };
}
export function lessonHistoryDocument({session,schedule,group,teacher,students=[],attendances=[]}){
  const map=new Map(attendances.map(row=>[String(row.userId),row]));
  const teacherRow=teacher?participantHistory({person:teacher,attendance:map.get(String(teacher._id||teacher.userId)),role:'teacher',session}):null;
  const members=students.map(p=>participantHistory({person:p,attendance:map.get(String(p._id||p.userId)),session}));
  const summary={
    expected:members.length,present:members.filter(x=>x.status==='present').length,
    late:members.filter(x=>x.status==='late').length,
    absent:members.filter(x=>x.status==='absent').length,
    excused:members.filter(x=>x.status==='excused').length,
    cameraObserved:members.filter(x=>x.proctor.classifiedSeconds>0).length,
    teacherMinutes:teacherRow?.minutes||0,
    studentMinutes:Math.round(members.reduce((sum,x)=>sum+x.minutes,0)*10)/10
  };
  return {
    id:String(session._id),dateKey:session.dateKey,sessionStatus:session.status,
    scheduleId:String(session.scheduleId),groupId:String(session.groupId),
    groupName:group?.name||'',lessonTitle:schedule?.title||'',subject:schedule?.subject||'',
    scheduledStart:schedule?.start||'',scheduledEnd:schedule?.end||'',
    startedAt:session.startedAt||null,endedAt:session.endedAt||null,
    participantPeak:num(session.participantPeak),rosterSource:Array.isArray(session.rosterSnapshot)?'session_snapshot':'current_group_fallback',
    summary,teacher:teacherRow,students:members
  };
}
export function normalizePresenceIntervals(attendance,session){
  if(Array.isArray(attendance?.presenceIntervals)&&attendance.presenceIntervals.length)
    return attendance.presenceIntervals.map(item=>{
      const stop=item.leftAt&&session?.endedAt?(new Date(item.leftAt)<new Date(session.endedAt)?item.leftAt:session.endedAt):(item.leftAt||session?.endedAt||null);
      const duration=stop&&new Date(stop)>new Date(item.joinedAt)?
        Math.round((new Date(stop)-new Date(item.joinedAt))/6000)/10:null;
      return {startedAt:item.joinedAt||null,endedAt:stop,durationMinutes:duration};
    }).filter(x=>x.startedAt);
  if(!attendance?.joinedAt)return [];
  return [{startedAt:attendance.joinedAt,endedAt:attendance.leftAt||session?.endedAt||null,
    durationMinutes:attendance.minutes??null,legacy:true}];
}
export function normalizeProctorTimeline(attendance,session){
  const entries=Array.isArray(attendance?.proctorTimeline)?attendance.proctorTimeline:[];
  return entries.map(item=>{
    const last=attendance?.proctorLastAt?new Date(new Date(attendance.proctorLastAt).getTime()+6000):null;
    const end=item.endedAt||[session?.endedAt,last].filter(Boolean).sort((a,b)=>new Date(a)-new Date(b))[0]||null;
    return {state:item.state||'unknown',detectorStatus:item.detectorStatus||'unknown',
      cameraReady:Boolean(item.cameraReady),startedAt:item.startedAt,endedAt:end,
      durationSeconds:end&&new Date(end)>new Date(item.startedAt)?Math.round((new Date(end)-new Date(item.startedAt))/1000):null};
  }).filter(x=>x.startedAt);
}
export function csvCell(value){
  const formatted=value instanceof Date?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(value)+' +05:00':value;
  let str=String(formatted??'').replace(/[\r\n\0]/g,' ');
  if(/^[\s\uFEFF]*[=+@-]/.test(str))str="'"+str;
  return '"'+str.replace(/"/g,'""')+'"';
}
export function historyCsvSummary(documents){
  const header=['Sana','Guruh','Fan','Dars nomi','Reja boshlanish','Reja tugash','Dars boshlandi','Dars tugadi','Rol','Ism familiya','Login','Davomat','Kirdi','Chiqdi','Davomiylik (min)','Qayta ulanish','Qo‘lda belgilangan','Qo‘lda belgilangan vaqti','Belgilagan xodim ID','Izoh','Proktor kuzatuv (sek)','Yuz ko‘rindi (sek)','Bosh burilgan (sek)','Yuz yo‘q (sek)','Aniqlanmagan (sek)','Yuz ko‘rinish %','Kuzatuv qamrovi %','Holat o‘zgarishlari','Ro‘yxat manbasi'];
  const rows=[header];
  for(const doc of documents)for(const person of [doc.teacher,...doc.students].filter(Boolean)){
    const p=person.proctor;
    rows.push([doc.dateKey,doc.groupName,doc.subject,doc.lessonTitle,doc.scheduledStart,doc.scheduledEnd,doc.startedAt,doc.endedAt,person.role==='teacher'?'O‘qituvchi':'Talaba',person.fullName,person.login,person.status,person.joinedAt,person.leftAt,person.minutes,person.reconnectCount,person.manuallyMarked?'Ha':'Yo‘q',person.manualMarkedAt,person.manualMarkedBy||'',person.manualNote,p.observedSeconds,p.facePresentSeconds,p.faceAwaySeconds,p.faceMissingSeconds,p.unknownSeconds,p.faceVisiblePercent??'',p.coveragePercent??'',p.stateChanges,doc.rosterSource]);
  }
  return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

export function historyCsv(documents,{mode='timeline'}={}){
  if(mode==='summary')return historyCsvSummary(documents);
  const header=['Sana','Guruh','Fan','Dars','Rol','Ism familiya','Login','Davomat','Yozuv turi','Holat','Boshlangan vaqt','Tugagan vaqt','Davomiylik (min)','Davomiylik (sek)','Jami qatnashuv (min)','Qayta ulanish','Yuz ko‘rinish %','Kuzatuv qamrovi %','Qo‘lda belgilangan vaqti','Izoh','Ro‘yxat manbasi'];
  const rows=[header];
  for(const doc of documents)for(const person of [doc.teacher,...doc.students].filter(Boolean)){
    const shared=[doc.dateKey,doc.groupName,doc.subject,doc.lessonTitle,person.role==='teacher'?'O‘qituvchi':'Talaba',person.fullName,person.login,person.status];
    const other=[person.minutes,person.reconnectCount,person.proctor.faceVisiblePercent??'',person.proctor.coveragePercent??'',person.manualMarkedAt||'',person.manualNote,doc.rosterSource];
    rows.push([...shared,'Xulosa',person.status,person.joinedAt||'',person.leftAt||'',person.minutes,'',...other]);
    for(const seg of person.presenceIntervals)
      rows.push([...shared,'Ishtirok vaqti','xonada',seg.startedAt,seg.endedAt||'',seg.durationMinutes??'','',...other]);
    for(const seg of person.proctorTimeline)
      rows.push([...shared,'Proktor kuzatuvi',seg.state+' / '+seg.detectorStatus+(seg.cameraReady?' / kamera yoqilgan':' / kamera o‘chiq'),seg.startedAt,seg.endedAt||'','',seg.durationSeconds??'',...other]);
    for(const cp of person.checkpoints)
      rows.push([...shared,'Davomat tekshiruvi',cp.state,cp.at,cp.at,'','',...other]);
  }
  return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
