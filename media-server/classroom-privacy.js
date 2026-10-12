// Classroom viewer permissions are enforced on SFU, not only in UI.
// A student can watch the instructor/staff and their own preview, but never receive another student's video.
export function canAccessClassroomProducer(viewer,producer,owner){
 if(!producer||!viewer||!owner)return false;
 const viewerId=String(viewer.user?.id||''),ownerId=String(owner.user?.id||'');
 if(producer.kind==='video'&&viewer.user?.role==='student'&&owner.user?.role==='student'&&viewerId!==ownerId)return false;
 if(!producer.appData?.proctorBroadcast)return true;
 const allowed=String(producer.appData?.proctorViewerUserId||'');
 return Boolean(viewerId&&allowed&&viewerId===allowed)||viewer.id===owner.id;
}
export function visibleClassroomParticipants(viewer,participants=[]){
 if(viewer?.user?.role!=='student')return participants;
 return participants.filter(p=>p?.user?.role!=='student'||String(p.user?.id||'')===String(viewer.user?.id||''));
}
