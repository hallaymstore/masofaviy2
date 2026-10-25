export const PROCTOR_EVENT_TYPES=[
  'page_hidden','window_blur','fullscreen_enter','fullscreen_exit',
  'camera_unavailable','camera_ready','camera_track_ended',
  'microphone_unavailable','microphone_ready','microphone_track_ended',
  'face_missing','multiple_faces','face_off_center','face_turned','face_detector_unavailable',
  'screenshot_attempt','clipboard_attempt','ambient_sound','network_offline','network_online',
  'screen_share_ready','screen_share_unavailable','screen_share_ended','multiple_displays'
];

const weights={
  page_hidden:12,window_blur:7,fullscreen_exit:10,
  camera_unavailable:35,camera_track_ended:30,
  microphone_unavailable:20,microphone_track_ended:18,
  face_missing:12,multiple_faces:25,face_off_center:5,face_turned:18,face_detector_unavailable:10,
  screenshot_attempt:40,clipboard_attempt:18,ambient_sound:5,network_offline:3,
  screen_share_unavailable:30,screen_share_ended:35,multiple_displays:30
};
const caps={
  page_hidden:36,window_blur:28,fullscreen_exit:30,face_missing:32,multiple_faces:54,
  face_off_center:20,face_turned:54,screenshot_attempt:80,clipboard_attempt:36,ambient_sound:20,network_offline:9,multiple_displays:30
};

export function summarizeProctorEvents(events=[],{requireScreen=false}={}){
  const counts={};for(const row of events){const type=String(row?.type||'');if(!PROCTOR_EVENT_TYPES.includes(type))continue;counts[type]=(counts[type]||0)+1}
  let score=0;for(const [type,count] of Object.entries(counts)){const raw=(weights[type]||0)*count;score+=caps[type]?Math.min(raw,caps[type]):raw}
  const cameraReady=Boolean(counts.camera_ready),microphoneReady=Boolean(counts.microphone_ready);
  const screenReady=Boolean(counts.screen_share_ready);
  if(!cameraReady)score+=35;if(!microphoneReady)score+=20;if(requireScreen&&!screenReady)score+=25;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const reviewPriority=score>=60?'high':score>=25?'medium':'low';
  const warnings=[];
  if(!cameraReady)warnings.push('Kamera tayyorligi tasdiqlanmagan');
  if(!microphoneReady)warnings.push('Mikrofon tayyorligi tasdiqlanmagan');
  if(requireScreen&&!screenReady)warnings.push('Ekran nazorati (butun ekranni ulashish) tasdiqlanmagan');
  if(counts.screen_share_ended)warnings.push('Ekran ulashish imtihon davomida to‘xtatilgan');
  if(counts.multiple_displays)warnings.push('Qo‘shimcha monitor ulanganligi aniqlangan');
  if(counts.multiple_faces)warnings.push('Bir nechta yuz aniqlangan');
  if(counts.face_missing)warnings.push('Yuz kadrdan yo‘qolgan');
  if(counts.face_turned)warnings.push('Yuzni kameradan chetga burish aniqlangan');
  if(counts.screenshot_attempt)warnings.push('Ekran tasvirini olishga urinish aniqlangan');
  if(counts.clipboard_attempt)warnings.push('Copy/paste urinishlari aniqlangan');
  if(counts.page_hidden||counts.window_blur||counts.fullscreen_exit)warnings.push('Imtihon oynasidan chiqish signallari bor');
  if(counts.camera_track_ended||counts.microphone_track_ended)warnings.push('Nazorat qurilmasi sessiya davomida uzilgan');
  if(counts.ambient_sound)warnings.push('Muhit tovushi signallari bor');
  return {riskScore:score,reviewPriority,eventCounts:counts,cameraReady,microphoneReady,screenReady,screenRequired:Boolean(requireScreen),warnings};
}

export function proctorSubmissionReady(events=[],options={}){
  const summary=summarizeProctorEvents(events,options);
  return {ok:summary.cameraReady&&summary.microphoneReady&&(!summary.screenRequired||summary.screenReady),summary};
}


export function evaluateProctorTermination(events=[],{requireScreen=false}={}){
  const counts={};for(const row of events){const type=String(row?.type||'');if(!PROCTOR_EVENT_TYPES.includes(type))continue;counts[type]=(counts[type]||0)+1}
  const rules=[
    ['camera_unavailable',1,'Kamera ishga tushmadi yoki ruxsat berilmadi'],
    ['microphone_unavailable',1,'Mikrofon ishga tushmadi yoki ruxsat berilmadi'],
    ['camera_track_ended',1,'Kamera sessiya davomida o‘chirildi'],
    ['microphone_track_ended',1,'Mikrofon sessiya davomida o‘chirildi'],
    ...(requireScreen?[['screen_share_unavailable',1,'Ekran nazorati (butun ekranni ulashish) ishga tushmadi'],['screen_share_ended',1,'Ekran ulashish imtihon davomida to‘xtatildi']]:[]),
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

// Events after which the client attaches camera/screen frames as review evidence.
export const PROCTOR_EVIDENCE_TRIGGERS=['face_missing','multiple_faces','face_turned','face_off_center','page_hidden','window_blur','fullscreen_exit','screenshot_attempt','clipboard_attempt','ambient_sound','screen_share_ended','multiple_displays','camera_track_ended'];
export const PROCTOR_EVIDENCE_KINDS=['camera','screen'];
export const PROCTOR_EVIDENCE_MAX_BYTES=450*1024;
export const PROCTOR_EVIDENCE_MAX_PER_ATTEMPT=160;

// Accepts "data:image/jpeg;base64,..." (or webp/png) and returns a validated Buffer.
export function decodeEvidenceImage(dataUrl){
  const m=/^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl||''));
  if(!m)throw new Error('Dalil rasmi formati noto‘g‘ri');
  const data=Buffer.from(m[2],'base64');
  if(!data.length||data.length>PROCTOR_EVIDENCE_MAX_BYTES)throw new Error('Dalil rasmi hajmi ruxsat etilganidan katta');
  const jpeg=data[0]===0xff&&data[1]===0xd8,png=data[0]===0x89&&data[1]===0x50,webp=data.subarray(8,12).toString('latin1')==='WEBP';
  if(!(jpeg||png||webp))throw new Error('Dalil rasmi mazmuni rasm emas');
  return {mime:jpeg?'image/jpeg':png?'image/png':'image/webp',data};
}
