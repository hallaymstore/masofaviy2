// Local-only face observations for live lessons. No video frames or landmarks leave the browser.
// A face detector cannot prove that pupils are looking at the screen.
export function classifyFaceDetections(faces,kind='mediapipe',videoWidth=0,videoHeight=0){
  if(!Array.isArray(faces))return 'unknown';
  if(faces.length===0)return 'missing';
  if(faces.length>1)return 'away';
  const face=faces[0]||{},box=face.boundingBox;
  if(!box)return 'unknown';
  if(kind==='native'){
    if(!videoWidth||!videoHeight)return 'unknown';
    const cx=(Number(box.x)+Number(box.width)/2)/videoWidth;
    const cy=(Number(box.y)+Number(box.height)/2)/videoHeight;
    const visible=Number(box.width)/videoWidth;
    if(!Number.isFinite(cx)||!Number.isFinite(cy)||!Number.isFinite(visible))return 'unknown';
    return Math.abs(cx-0.5)>0.29||Math.abs(cy-0.5)>0.30||visible<0.07?'away':'present';
  }
  const cx=Number(box.xCenter),cy=Number(box.yCenter);
  if(!Number.isFinite(cx)||!Number.isFinite(cy))return 'unknown';
  let away=Math.abs(cx-.5)>.27||Math.abs(cy-.5)>.28;
  const points=face.landmarks||face.keypoints||face.locationData?.relativeKeypoints||[];
  if(Array.isArray(points)&&points.length>=3){
    const pos=p=>Number(p?.x??p?.xCenter);
    const eye1=pos(points[0]),eye2=pos(points[1]),nose=pos(points[2]);
    const eyeGap=Math.abs(eye1-eye2);
    if([eye1,eye2,nose].every(Number.isFinite)&&eyeGap>.025){
      if(Math.abs(nose-(eye1+eye2)/2)/eyeGap>.48)away=true;
    }
  }
  return away?'away':'present';
}
export function createFaceStateFilter(required=2){
  let state='unknown',candidate='',count=0,at=0;
  return {
    observe(raw,now=Date.now()){
      const next=['present','away','missing','unknown'].includes(raw)?raw:'unknown';
      at=now;
      if(next==='unknown'){state='unknown';candidate='';count=0;return state}
      if(next===state){candidate='';count=0;return state}
      if(next!==candidate){candidate=next;count=1}else count++;
      if(count>=required){state=next;candidate='';count=0}
      return state;
    },
    get(now=Date.now(),staleMs=12000){return at&&now-at<=staleMs?state:'unknown'},
    get lastAt(){return at}
  };
}
