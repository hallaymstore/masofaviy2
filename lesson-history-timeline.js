// Append-only bounded attendance and proctor timelines. No camera frames are stored.
export function recordPresenceJoin(row,now=new Date()){
  row.presenceIntervals||=[];
  closeProctorTimeline(row,now);
  const last=row.presenceIntervals.at(-1);
  if(last&&!last.leftAt)last.leftAt=now;
  if(row.joinedAt)row.reconnectCount=(Number(row.reconnectCount)||0)+1;
  else row.joinedAt=now;
  row.lastJoinedAt=now;row.leftAt=null;
  row.presenceIntervals.push({joinedAt:now,leftAt:null});
  return row;
}
export function recordPresenceLeave(row,joinTime,now=new Date()){
  if(!row||row.leftAt)return false;
  if(joinTime&&row.lastJoinedAt&&new Date(joinTime).getTime()!==new Date(row.lastJoinedAt).getTime())return false;
  const start=new Date(joinTime||row.lastJoinedAt||row.joinedAt||now);
  row.leftAt=now;
  const intervals=row.presenceIntervals||[];
  const last=intervals.at(-1);
  if(last&&!last.leftAt)last.leftAt=now;
  const delta=Math.max(0,(now-start)/60000);
  row.minutes=Math.round((Number(row.minutes||0)+delta)*100)/100;
  closeProctorTimeline(row,now);
  return true;
}
export function closeProctorTimeline(row,at=new Date()){
  const entries=row.proctorTimeline||[];
  const last=entries.at(-1);
  if(!last||last.endedAt)return;
  const observed=row.proctorLastAt?new Date(row.proctorLastAt).getTime():null;
  const cutoff=observed?new Date(Math.min(new Date(at).getTime(),observed+6500)):at;
  last.endedAt=cutoff;
  if(new Date(at)-cutoff>12000){
    if(entries.length<800)entries.push({startedAt:cutoff,endedAt:at,state:'unknown',detectorStatus:'unknown',cameraReady:false});
    else row.proctorTimelineOverflow=true;
  }
}
export function recordProctorObservation(row,observation,now=new Date(),lastObservedAt=null){
  const state=['present','away','missing'].includes(observation.faceState)?observation.faceState:'unknown';
  const detectorStatus=['ready','loading','error'].includes(observation.detectorStatus)?observation.detectorStatus:'unknown';
  const cameraReady=Boolean(observation.cameraReady);
  row.proctorTimeline||=[];
  const list=row.proctorTimeline;
  const previous=list.at(-1);
  const previousAt=lastObservedAt?new Date(lastObservedAt):null;
  const gapMs=previousAt?now-previousAt:0;
  const elapsed=Number.isFinite(gapMs)&&gapMs>0?Math.min(10,gapMs/1000):0;
  if(elapsed&&previous?.state!=='unknown'&&previous?.detectorStatus==='ready'&&previous?.cameraReady){
    row.proctorObservedSeconds=(Number(row.proctorObservedSeconds)||0)+elapsed;
    const key=previous.state==='present'?'proctorFacePresentSeconds':previous.state==='away'?'proctorFaceAwaySeconds':'proctorFaceMissingSeconds';
    row[key]=(Number(row[key])||0)+elapsed;
  }
  if(previous&&(!previous.endedAt)){
    const changed=previous.state!==state||previous.detectorStatus!==detectorStatus||Boolean(previous.cameraReady)!==cameraReady;
    if(changed||gapMs>12000){
      const end=gapMs>12000&&previousAt?new Date(previousAt.getTime()+10000):now;
      previous.endedAt=end;
      if(gapMs>12000&&list.length<799)list.push({startedAt:end,endedAt:now,state:'unknown',detectorStatus:'unknown',cameraReady:false});
    }else{
      row.proctorFaceState=state;row.proctorCameraReady=cameraReady;row.proctorLastAt=now;
      return {state,detectorStatus};
    }
  }
  if(list.length<800){
    list.push({startedAt:now,endedAt:null,state,detectorStatus,cameraReady});
  }else row.proctorTimelineOverflow=true;
  if(previous&&previous.state!==state&&state!=='unknown'&&previous.state!=='unknown')
    row.proctorViolations=(Number(row.proctorViolations)||0)+1; // Legacy counter: state changes, NOT confirmed misconduct.
  row.proctorFaceState=state;row.proctorCameraReady=cameraReady;row.proctorLastAt=now;
  return {state,detectorStatus};
}
