export const PROCTOR_EVENT_TYPES=[
  'page_hidden','window_blur','fullscreen_enter','fullscreen_exit',
  'camera_unavailable','camera_ready','camera_track_ended',
  'microphone_unavailable','microphone_ready','microphone_track_ended',
  'face_missing','multiple_faces','face_off_center','face_turned','face_detector_unavailable',
  'screenshot_attempt','clipboard_attempt','ambient_sound','network_offline','network_online'
];

const weights={
  page_hidden:12,window_blur:7,fullscreen_exit:10,
  camera_unavailable:35,camera_track_ended:30,
  microphone_unavailable:20,microphone_track_ended:18,
  face_missing:12,multiple_faces:25,face_off_center:5,face_turned:18,face_detector_unavailable:10,
  screenshot_attempt:40,clipboard_attempt:18,ambient_sound:5,network_offline:3
};
const caps={
  page_hidden:36,window_blur:28,fullscreen_exit:30,face_missing:32,multiple_faces:54,
  face_off_center:20,face_turned:54,screenshot_attempt:80,clipboard_attempt:36,ambient_sound:20,network_offline:9
};

export function summarizeProctorEvents(events=[]){
  const counts={};for(const row of events){const type=String(row?.type||'');if(!PROCTOR_EVENT_TYPES.includes(type))continue;counts[type]=(counts[type]||0)+1}
  let score=0;for(const [type,count] of Object.entries(counts)){const raw=(weights[type]||0)*count;score+=caps[type]?Math.min(raw,caps[type]):raw}
  const cameraReady=Boolean(counts.camera_ready),microphoneReady=Boolean(counts.microphone_ready);
  if(!cameraReady)score+=35;if(!microphoneReady)score+=20;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const reviewPriority=score>=60?'high':score>=25?'medium':'low';
  const warnings=[];
  if(!cameraReady)warnings.push('Kamera tayyorligi tasdiqlanmagan');
  if(!microphoneReady)warnings.push('Mikrofon tayyorligi tasdiqlanmagan');
  if(counts.multiple_faces)warnings.push('Bir nechta yuz aniqlangan');
  if(counts.face_missing)warnings.push('Yuz kadrdan yo‘qolgan');
  if(counts.face_turned)warnings.push('Yuzni kameradan chetga burish aniqlangan');
  if(counts.screenshot_attempt)warnings.push('Ekran tasvirini olishga urinish aniqlangan');
  if(counts.clipboard_attempt)warnings.push('Copy/paste urinishlari aniqlangan');
  if(counts.page_hidden||counts.window_blur||counts.fullscreen_exit)warnings.push('Imtihon oynasidan chiqish signallari bor');
  if(counts.camera_track_ended||counts.microphone_track_ended)warnings.push('Nazorat qurilmasi sessiya davomida uzilgan');
  if(counts.ambient_sound)warnings.push('Muhit tovushi signallari bor');
  return {riskScore:score,reviewPriority,eventCounts:counts,cameraReady,microphoneReady,warnings};
}

export function proctorSubmissionReady(events=[]){
  const summary=summarizeProctorEvents(events);
  return {ok:summary.cameraReady&&summary.microphoneReady,summary};
}


export function evaluateProctorTermination(events=[]){
  const counts={};for(const row of events){const type=String(row?.type||'');if(!PROCTOR_EVENT_TYPES.includes(type))continue;counts[type]=(counts[type]||0)+1}
  const rules=[
    ['camera_unavailable',1,'Kamera ishga tushmadi yoki ruxsat berilmadi'],
    ['microphone_unavailable',1,'Mikrofon ishga tushmadi yoki ruxsat berilmadi'],
    ['camera_track_ended',1,'Kamera sessiya davomida o‘chirildi'],
    ['microphone_track_ended',1,'Mikrofon sessiya davomida o‘chirildi'],
    ['face_detector_unavailable',1,'Yuzni aniqlash moduli ishga tushmadi'],
    ['page_hidden',1,'Imtihon sahifasidan chiqildi yoki boshqa ilovaga o‘tildi'],
    ['fullscreen_exit',1,'Majburiy to‘liq ekran rejimidan chiqildi'],
    ['screenshot_attempt',1,'Ekran tasvirini olishga urinish qayd etildi'],
    ['multiple_faces',1,'Kadrda bir nechta yuz aniqlandi'],
    ['face_missing',2,'Yuz kameradan takroran yo‘qoldi'],
    ['face_turned',2,'Yuz kameradan takroran chetga burildi'],
    ['window_blur',2,'Imtihon oynasi fokusini takroran yo‘qotdi'],
    ['clipboard_attempt',2,'Copy/paste takroran ishlatildi']
  ];
  for(const [type,limit,reason] of rules)if((counts[type]||0)>=limit)return {terminate:true,type,reason,counts};
  return {terminate:false,counts};
}
