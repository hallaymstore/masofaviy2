// Persist exact playback checkpoints for instant resume while server progress sync is pending.
// Stored per signed-in account and video; never use cumulative watchedSeconds as a playback position.
const finite=n=>Number.isFinite(Number(n))?Number(n):0;
export function checkpointKey(userId,videoId){
  if(!userId||!videoId)return '';
  return 'm2-video-position-v2:'+String(userId)+':'+String(videoId);
}
export function rememberPlayback(storage,userId,videoId,position,duration,at=Date.now()){
  const key=checkpointKey(userId,videoId);
  if(!key)return null;
  const safeDuration=Math.max(0,Math.min(86400,finite(duration)));
  const safePosition=Math.max(0,Math.min(safeDuration||86400,finite(position)));
  const row={position:safePosition,duration:safeDuration,at:finite(at)};
  try{storage?.setItem(key,JSON.stringify(row))}catch{}
  return row;
}
export function readPlayback(storage,userId,videoId){
  const key=checkpointKey(userId,videoId);
  if(!key)return null;
  try{
    const row=JSON.parse(storage?.getItem(key)||'null');
    if(!row||!Number.isFinite(row.position)||!Number.isFinite(row.at))return null;
    if(row.at>Date.now()+60000||row.at<Date.now()-90*86400000)return null;
    return {position:Math.max(0,Math.min(86400,row.position)),duration:Math.max(0,finite(row.duration)),at:row.at};
  }catch{return null}
}
export function playbackResumeSeconds(progress={},local=null){
  const serverPosition=Math.max(0,finite(progress?.lastPositionSeconds));
  const serverTime=progress?.lastViewedAt?new Date(progress.lastViewedAt).getTime():0;
  const localTime=Number(local?.at)||0;
  // Server wins when it carries a newer timestamp (e.g. another device).
  const preferred=local&&(!serverTime||localTime>serverTime)?Number(local.position):serverPosition;
  const duration=Math.max(0,finite(local?.duration)||finite(progress?.durationSeconds));
  if(duration>0&&preferred>=duration-2)return 0;
  return Math.max(0,Math.min(86400,Number.isFinite(preferred)?preferred:0));
}
