import { Device } from 'mediasoup-client';
import {inspectFeedbackFrame,createFeedbackToneTracker} from './audio-feedback-detector.js';

const qs=(s,r=document)=>r.querySelector(s);
const el=(tag,attrs={})=>{
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs||{})){
    if(key==='dataset'&&value&&typeof value==='object'){
      for(const [dataKey,dataValue] of Object.entries(value))node.dataset[dataKey]=String(dataValue);
      continue;
    }
    try{node[key]=value}catch{if(value!==undefined&&value!==null)node.setAttribute(key,String(value))}
  }
  return node;
};
const safe=s=>String(s??'');

export class MediaRoomClient{
  constructor({socket,joinPayload,mount,user,lowEnd=false,onState=()=>{},onError=()=>{},onTeacherPiPClick=()=>{}}){
    this.socket=socket;this.joinPayload=joinPayload;this.mount=mount;this.user=user;this.onState=onState;this.onError=onError;this.onTeacherPiPClick=onTeacherPiPClick;
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection,weakNet=Boolean(conn?.saveData)||/2g|3g/.test(String(conn?.effectiveType||''));
    const mem=Number(navigator.deviceMemory||0),cores=Number(navigator.hardwareConcurrency||0),androidMajor=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
    this.ultraLite=Boolean((mem&&mem<=2)||(cores&&cores<=2)||(androidMajor&&androidMajor<=8));
    this.lowEnd=Boolean(lowEnd||this.ultraLite||weakNet||(mem&&mem<=4)||(cores&&cores<=4));
    this.mediaProfile=joinPayload?.mediaProfile||'standard';this.device=null;this.sendTransport=null;this.recvTransport=null;this.producers=new Map();this.consumers=new Map();this.consuming=new Map();this.audioPeerPending=new Map();this.canceledProducers=new Set();this.tiles=new Map();this.pending=new Map();this.closed=false;
    this.maxStudentVideos=this.ultraLite?0:(this.lowEnd?1:6);this.studentVideoConsumers=0;this.activeSpeakerCandidate='';this.activeSpeakerCandidateAt=0;this.activeSpeakerPeer='';this.activeSpeakerChangedAt=0;this.receiveQuality=localStorage.getItem('m2-video-quality')||'auto';this.echoGuard=true;localStorage.setItem('m2-echo-guard','1');this.proximityGuard=localStorage.getItem('m2-proximity-guard')==='1';this.feedbackRiskUntil=0;this.feedbackSafeUntil=0;this.micWarmupUntil=0;this.feedbackAudioResumeTimer=null;this.audioFloor=null;this.audioCtx=null;this.micAudioChain=null;this.feedbackMonitorTimer=null;this.micSafetyMonitor=null;this.localMicRawTrack=null;this.autoHalfDuplexUntil=0;this.autoFeedbackResumeTimer=null;this.feedbackToneTracker=null;this.feedbackMonitorStatus='off';this.feedbackToneSince=0;this.feedbackLastFreq=0;this.feedbackStableHits=0;this.multiMicCount=0;this.viewMode=this.ultraLite?'speaker':(localStorage.getItem('m2-view-mode')||'speaker');this.lowBandwidthMode=localStorage.getItem('m2-low-bandwidth')==='1';this.facingMode=localStorage.getItem('m2-facing-mode')||'user';this.externalCameraTrack=null;this.proctorCameraBroadcast=false;this.pinnedUserId='';this.boundResponse=m=>this.handleResponse(m);this.boundEvent=m=>this.handleEvent(m);this.visibilityHandler=()=>this.updateVisibility();
    this.participantStrip=null;this.participantCards=new Map();this.participantMediaState=new Map();this.selectedStagePeerId='';this.explicitStagePeerId='';this.stageRefreshTimer=null;this.classSpotlightUserId='';this.lastRailSpeakingKey='';this.transportRecoveryTimers=new Map();this.transportRecoveryBusy=new Set();this.cameraRecoveryTimer=null;this.cameraRecoveryAttempts=0;this.automaticPiP=false;this.networkStats={received:0,lost:0,at:0};
    this.socket.on('media:response',this.boundResponse);this.socket.on('media:event',this.boundEvent);
  }
  request(method,data={}){
    if(this.closed)return Promise.reject(new Error('Media xona yopilgan'));
    const id=crypto.randomUUID?.()||String(Date.now())+Math.random();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('SFU javobi kutilgan vaqtda kelmadi'))},12000);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.emit('media:request',{id,method,data});
    });
  }
  handleResponse(msg){
    if(!msg?.id)return;const p=this.pending.get(msg.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(msg.id);
    if(msg.ok)p.resolve(msg.data);else p.reject(new Error(msg.error||'SFU xatosi'));
  }
  handleEvent(msg){
    if(!msg?.event)return;
    if(msg.event==='newProducer'){this.applyProducerPresence(msg.data||{},true);this.maybeConsume(msg.data).then(()=>{if(this.classSpotlightUserId)this.focusUserForClass(this.classSpotlightUserId)}).catch(this.onError)}
    else if(msg.event==='producerClosed'){this.applyProducerPresence(msg.data||{},false);this.closeConsumerByProducer(msg.data?.producerId)}
    else if(msg.event==='producerState')this.applyProducerState(msg.data||{});
    else if(msg.event==='peerLeft')this.removePeerTile(msg.data?.peerId);
    else if(msg.event==='audioLevels'){const levels=msg.data?.levels||[];this.applyAudioLevels(levels);if(!levels.length)this.grid?.classList.remove('speaker-layout')}
    else if(msg.event==='audioFloor'){this.audioFloor=msg.data?.active?msg.data:null;this.onState({audioFloor:this.audioFloor})}
    else if(msg.event==='roomState'){this.audioFloor=msg.data?.audioFloor||null;this.syncParticipantTiles(msg.data?.participants||[]);this.onState(msg.data||{});}
  }
  getPreferredConstraints(kind,{ignoreDevice=false}={}){
    const key=kind==='audio'?'m2-preferred-mic':'m2-preferred-camera',id=ignoreDevice?'':localStorage.getItem(key);
    if(kind==='audio'){
      // Let the browser WebRTC pipeline perform AEC/NS/AGC; do not force a sample rate or vendor-specific filters.
      const a={echoCancellation:{ideal:true},noiseSuppression:{ideal:true},autoGainControl:{ideal:true},channelCount:{ideal:1}};
      return id?{deviceId:{ideal:id},...a}:a;
    }
    const teacher=this.user?.role==='teacher',lite=this.lowEnd||this.mediaProfile==='lecture-lite';
    const video=teacher&&!this.ultraLite
      ?{width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:30,max:30},facingMode:{ideal:this.facingMode}}
      :this.ultraLite
        ?{width:{ideal:640,max:960},height:{ideal:360,max:540},frameRate:{ideal:15,max:20},facingMode:{ideal:this.facingMode}}
        :(lite?{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:24,max:30},facingMode:{ideal:this.facingMode}}:{width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:30,max:30},facingMode:{ideal:this.facingMode}});
    return id?{deviceId:{ideal:id},...video}:video;
  }
  async getMediaOnce(kind){
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Kamera/mikrofon uchun HTTPS va brauzer ruxsati kerak');
    const key=kind==='audio'?'m2-preferred-mic':'m2-preferred-camera';
    const first=kind==='audio'?{audio:this.getPreferredConstraints('audio'),video:false}:{audio:false,video:this.getPreferredConstraints('video')};
    try{return await navigator.mediaDevices.getUserMedia(first)}
    catch(e){
      if(kind==='video'&&['OverconstrainedError','NotFoundError','DevicesNotFoundError','NotReadableError','AbortError'].includes(e?.name)){
        localStorage.removeItem(key);
        if(['NotReadableError','AbortError'].includes(e.name))await new Promise(resolve=>setTimeout(resolve,450));
        return navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:15,max:24}}});
      }
      if(kind==='audio'&&['OverconstrainedError','NotFoundError','DevicesNotFoundError'].includes(e?.name)){
        localStorage.removeItem(key);
        return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      }
      throw e;
    }
  }
  async connect(){
    const joined=await this.request('join',{ticket:this.joinPayload.mediaTicket});
    this.room=joined.room;this.mediaProfile=joined.mediaProfile||this.joinPayload.mediaProfile||'standard';this.device=new Device();await this.device.load({routerRtpCapabilities:joined.routerRtpCapabilities});
    this.renderShell();
    this.syncParticipantTiles(joined.participants||[]);
    this.mount.classList.toggle('ultra-lite-media',this.ultraLite);this.mount.classList.toggle('low-end-media',this.lowEnd);
    await this.createTransports();
    this.onState({mic:false,camera:false,studentMediaLocked:false,viewMode:this.viewMode,lowBandwidth:this.lowBandwidthMode});
    this.setViewMode(this.viewMode);
    if(this.lowBandwidthMode)await this.setReceiveQuality('240');else await this.setReceiveQuality(this.receiveQuality==='240'?'auto':this.receiveQuality);
    this.installAudioUnlock();
    document.addEventListener('visibilitychange',this.visibilityHandler);
    for(const p of joined.producers||[])await this.maybeConsume(p);
    clearInterval(this.stageRefreshTimer);
    this.stageRefreshTimer=setInterval(()=>{if(!this.closed&&!document.hidden)this.ensureInlineVideoStage()},1800);
    this.ensureInlineVideoStage();
    this.onState({connected:true,participants:joined.participants||[]});
    return joined;
  }
  async recoverTransport(transport,label='media'){
    if(this.closed||!transport||transport.closed||this.transportRecoveryBusy.has(label))return false;
    this.transportRecoveryBusy.add(label);
    try{
      for(let attempt=0;attempt<2;attempt++){
        if(this.closed||transport.closed)return false;
        try{
          const x=await this.request('restartIce',{transportId:transport.id});
          if(!x?.iceParameters)throw new Error('ICE parametrlari olinmadi');
          await transport.restartIce({iceParameters:x.iceParameters});
          this.onState({transport:label,state:'recovering'});
          return true;
        }catch(e){if(attempt===0)await new Promise(resolve=>setTimeout(resolve,700));}
      }
      this.onState({transport:label,state:'failed',recoveryFailed:true});
      return false;
    }finally{this.transportRecoveryBusy.delete(label)}
  }
  scheduleTransportRecovery(transport,label,state){
    this.onState({transport:label,state});
    clearTimeout(this.transportRecoveryTimers.get(label));
    this.transportRecoveryTimers.delete(label);
    if(this.closed||!['disconnected','failed'].includes(state))return;
    const timer=setTimeout(()=>{
      this.transportRecoveryTimers.delete(label);
      this.recoverTransport(transport,label).catch(this.onError);
    },state==='failed'?1400:3000);
    this.transportRecoveryTimers.set(label,timer);
  }
  async createTransports(){
    const send=await this.request('createTransport',{direction:'send'});
    this.sendTransport=this.device.createSendTransport({...send,iceServers:this.joinPayload.iceServers||[]});
    this.sendTransport.on('connect',async({dtlsParameters},cb,eb)=>{try{await this.request('connectTransport',{transportId:this.sendTransport.id,dtlsParameters});cb()}catch(e){eb(e)}});
    this.sendTransport.on('produce',async({kind,rtpParameters,appData},cb,eb)=>{try{const x=await this.request('produce',{transportId:this.sendTransport.id,kind,rtpParameters,appData});cb({id:x.id})}catch(e){eb(e)}});
    this.sendTransport.on('connectionstatechange',s=>this.scheduleTransportRecovery(this.sendTransport,'send',s));
    const recv=await this.request('createTransport',{direction:'recv'});
    this.recvTransport=this.device.createRecvTransport({...recv,iceServers:this.joinPayload.iceServers||[]});
    this.recvTransport.on('connect',async({dtlsParameters},cb,eb)=>{try{await this.request('connectTransport',{transportId:this.recvTransport.id,dtlsParameters});cb()}catch(e){eb(e)}});
    this.recvTransport.on('connectionstatechange',s=>this.scheduleTransportRecovery(this.recvTransport,'recv',s));
  }
  renderShell(){
    this.mount.innerHTML='';
    const grid=el('div',{className:'ms-grid'}),strip=el('div',{className:'ms-participant-strip',role:'list','aria-label':'Dars ishtirokchilari'}),audioBin=el('div',{className:'ms-audio-bin'});
    const stageBadge=el('div',{className:'ms-stage-badge'});stageBadge.innerHTML='<span class="ms-stage-signal">▮▮▮</span><b>Asosiy video</b>';
    const fullscreen=el('button',{className:'ms-stage-fullscreen',type:'button',title:'To‘liq ekran','aria-label':'Asosiy videoni to‘liq ekranga chiqarish'});fullscreen.textContent='⛶';
    fullscreen.addEventListener('click',()=>this.enterPrimaryFullscreen().catch(this.onError));
    // Independent inline preview: old speaker-layout styles may hide all .ms-tile elements.
    // Reuse the already granted camera track; never request a second camera.
    const selfStage=el('div',{className:'ms-inline-self-stage',role:'region'});
    const selfVideo=el('video',{autoplay:true,playsInline:true,muted:true});
    selfVideo.className='ms-inline-self-video';
    const selfLabel=el('div',{className:'ms-inline-self-label'});
    selfLabel.textContent=this.user.fullName||this.user.login||'Siz';
    selfStage.append(selfVideo,selfLabel);
    const teacherPiP=el('button',{className:'ms-teacher-pip-stage',type:'button',title:'O‘qituvchini asosiy ekranga qaytarish','aria-label':'O‘qituvchini asosiy ekranga qaytarish'});
    const teacherPiPVideo=el('video',{autoplay:true,playsInline:true,muted:true});
    teacherPiPVideo.className='ms-teacher-pip-video';
    const teacherPiPLabel=el('div',{className:'ms-teacher-pip-label'});teacherPiPLabel.textContent='O‘qituvchi';
    teacherPiP.append(teacherPiPVideo,teacherPiPLabel);
    teacherPiP.addEventListener('click',()=>this.restoreTeacherFromPiP());
    const emptyStage=el('div',{className:'ms-empty-stage is-visible',role:'status'});
    const emptyTitle=el('strong');emptyTitle.textContent='Hozir video ko‘rsatilmayapti';
    const emptyHint=el('span');emptyHint.textContent='Kamera o‘chiq yoki hali uzatilmagan';
    const enableCamera=el('button',{type:'button',className:'ms-empty-camera-action'});
    enableCamera.textContent='Kamerani yoqish';
    enableCamera.addEventListener('click',()=>document.querySelector('#callCamera')?.click());
    emptyStage.append(emptyTitle,emptyHint,enableCamera);
    this.mount.append(grid,emptyStage,selfStage,teacherPiP,stageBadge,fullscreen,strip,audioBin);
    this.grid=grid;this.participantStrip=strip;this.audioBin=audioBin;this.selfStage=selfStage;this.selfStageVideo=selfVideo;this.selfStageLabel=selfLabel;
    this.teacherPiP=teacherPiP;this.teacherPiPVideo=teacherPiPVideo;this.teacherPiPLabel=teacherPiPLabel;
    this.emptyStage=emptyStage;this.emptyTitle=emptyTitle;this.emptyHint=emptyHint;this.emptyCameraAction=enableCamera;
    const local=this.ensureTile('local',{_id:this.user._id||this.user.id,fullName:this.user.fullName||this.user.login,login:this.user.login,role:this.user.role,avatarUrl:this.user.avatarUrl||''},true);local.classList.add('local');
  }
  ensureTile(peerId,user={},local=false){
    if(this.tiles.has(peerId))return this.tiles.get(peerId);
    const tile=el('div',{className:'ms-tile',dataset:{peerId,role:user.role||'',userId:user._id||user.id||''}});tile.classList.toggle('role-teacher',user.role==='teacher');tile.classList.toggle('role-student',user.role==='student');
    const video=el('video',{autoplay:true,playsInline:true,muted:local});video.className='ms-video';
    const avatar=el('div',{className:'ms-avatar'});avatar.textContent=(user.fullName||user.login||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    const label=el('div',{className:'ms-label'});label.innerHTML='<b></b><span></span>';qs('b',label).textContent=user.fullName||user.login||'Ishtirokchi';qs('span',label).textContent=this.participantRoleLabel(user.role);
    const mic=el('span',{className:'ms-mic'});mic.textContent='●';
    const pin=el('button',{className:'ms-pin-btn',type:'button',title:'Pin / unpin'});pin.textContent='📌';
    pin.addEventListener('click',e=>{e.stopPropagation();this.pinUser(tile.dataset.userId||'',tile.dataset.peerId)});
    tile.title='Bosib asosiy ekranga chiqarish';
    tile.addEventListener('click',e=>{
      if(e.target.closest('button,select,input,label'))return;
      this.selectStagePeer(local?(this.room?.peerId||'local'):peerId);
    });
    tile.addEventListener('dblclick',()=>this.pinUser(tile.dataset.userId||'',tile.dataset.peerId));
    this.installPinchZoom(tile,video);
    tile.append(video,avatar,label,mic,pin);this.grid.appendChild(tile);this.tiles.set(peerId,tile);
    if(this.classSpotlightUserId&&String(tile.dataset.userId||'')===this.classSpotlightUserId)this.focusUserForClass(this.classSpotlightUserId);
    if(!String(peerId).includes(':screen'))this.upsertParticipantCard(local?(this.room?.peerId||'local'):peerId,user,local);
    return tile;
  }
  participantTile(peerId){
    const id=String(peerId||'');
    if(id&&id===String(this.room?.peerId||''))return this.tiles.get('local')||null;
    return this.tiles.get(id)||null;
  }
  participantRoleLabel(role=''){
    return role==='teacher'?'O‘qituvchi':role==='student'?'Talaba':role||'Ishtirokchi';
  }
  participantInitials(user={}){
    return String(user.fullName||user.login||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'?';
  }
  upsertParticipantCard(peerId,user={},local=false,media={}){
    const id=String(peerId||'');if(!id||id.includes(':screen')||!this.participantStrip)return null;
    let card=this.participantCards.get(id);
    if(!card){
      card=el('button',{className:'ms-participant-mini camera-off mic-off',type:'button'});card.dataset.peerId=id;card.setAttribute('role','listitem');
      const avatar=el('span',{className:'ms-mini-avatar'}),preview=el('video',{autoplay:true,playsInline:true,muted:true}),img=el('img',{className:'ms-mini-photo',alt:''}),initials=el('span',{className:'ms-mini-initials'}),camera=el('span',{className:'ms-mini-camera','aria-label':'Kamera o‘chiq'}),mic=el('span',{className:'ms-mini-mic','aria-label':'Mikrofon o‘chiq'}),text=el('span',{className:'ms-mini-text'}),name=el('b'),role=el('small');
      preview.className='ms-mini-video';camera.textContent='📷';mic.textContent='🔇';text.append(name,role);avatar.append(preview,img,initials,camera,mic);card.append(avatar,text);
      card.addEventListener('click',()=>this.selectStagePeer(card.dataset.peerId));
      this.participantStrip.appendChild(card);this.participantCards.set(id,card);
    }
    const name=qs('.ms-mini-text b',card),role=qs('.ms-mini-text small',card),initials=qs('.ms-mini-initials',card),img=qs('.ms-mini-photo',card);
    if(name)name.textContent=user.fullName||user.login||(local?'Siz':'Ishtirokchi');if(role)role.textContent=this.participantRoleLabel(user.role);
    if(initials)initials.textContent=this.participantInitials(user);
    if(img){const src=String(user.avatarUrl||'');img.src=src;img.classList.toggle('has-photo',Boolean(src));}
    card.classList.toggle('role-teacher',user.role==='teacher');card.classList.toggle('role-student',user.role==='student');card.classList.toggle('is-local',Boolean(local));
    const remembered=this.participantMediaState.get(id)||{},cameraOn=typeof media?.cameraOn==='boolean'?media.cameraOn:(typeof remembered.cameraOn==='boolean'?remembered.cameraOn:Boolean(this.participantTile(id)?.classList.contains('has-video'))),micOn=typeof media?.micOn==='boolean'?media.micOn:Boolean(remembered.micOn);
    this.participantMediaState.set(id,{cameraOn:Boolean(cameraOn),micOn:Boolean(micOn)});
    this.updateParticipantCardCamera(id,Boolean(cameraOn));this.updateParticipantCardMic(id,Boolean(micOn));
    this.refreshParticipantCardSelection();return card;
  }
  syncParticipantTiles(participants=[]){
    const rows=Array.isArray(participants)?participants:[],alive=new Set();
    this.multiMicCount=rows.filter(x=>Boolean(x?.media?.micOn)).length;
    for(const row of rows){
      const peerId=String(row?.peerId||'');if(!peerId)continue;alive.add(peerId);
      const u=row?.user||{},local=peerId===String(this.room?.peerId||''),media=row?.media||{};
      if(local){const tile=this.tiles.get('local');if(tile){tile.dataset.userId=String(u.id||this.user?.id||'');tile.dataset.role=u.role||this.user?.role||'';}this.upsertParticipantCard(peerId,{...this.user,...u},true,media);}
      else{this.ensureTile(peerId,u,false);this.upsertParticipantCard(peerId,u,false,media);}
    }
    for(const [id,card] of [...this.participantCards])if(!alive.has(id)){card.remove();this.participantCards.delete(id);this.participantMediaState.delete(id)}
    if(this.viewMode==='speaker'&&!this.selectedStagePeerId){
      const preferred=rows.find(x=>x?.user?.role==='teacher')||rows[0];if(preferred?.peerId)this.selectStagePeer(String(preferred.peerId),false);
    }else this.refreshParticipantCardSelection();
    if(this.classSpotlightUserId)this.focusUserForClass(this.classSpotlightUserId);
    else this.ensureInlineVideoStage();
  }
  syncParticipantCardVideo(peerId){
    const id=String(peerId||''),card=this.participantCards.get(id);if(!card)return;
    const preview=qs('.ms-mini-video',card),tile=this.participantTile(id),source=tile?qs('video',tile):null,on=card.classList.contains('camera-on');
    if(preview&&on&&source?.srcObject){
      if(preview.srcObject!==source.srcObject)preview.srcObject=source.srcObject;
      card.classList.add('has-live-preview');preview.play().catch(()=>{});
    }else if(preview){
      preview.srcObject=null;card.classList.remove('has-live-preview');
    }
  }
  updateParticipantCardCamera(peerId,on){
    const id=String(peerId||''),card=this.participantCards.get(id);if(!card)return;
    const prev=this.participantMediaState.get(id)||{};this.participantMediaState.set(id,{...prev,cameraOn:Boolean(on)});
    card.classList.toggle('camera-on',Boolean(on));card.classList.toggle('camera-off',!on);
    const icon=qs('.ms-mini-camera',card);if(icon){icon.textContent='📹';icon.setAttribute('aria-label',on?'Kamera yoqilgan':'Kamera o‘chiq');}
    this.syncParticipantCardVideo(id);
  }
  updateParticipantCardMic(peerId,on){
    const id=String(peerId||''),card=this.participantCards.get(id);if(!card)return;
    const prev=this.participantMediaState.get(id)||{};this.participantMediaState.set(id,{...prev,micOn:Boolean(on)});
    card.classList.toggle('mic-on',Boolean(on));card.classList.toggle('mic-off',!on);
    const icon=qs('.ms-mini-mic',card);if(icon){icon.textContent=on?'🎙':'🔇';icon.setAttribute('aria-label',on?'Mikrofon yoqilgan':'Mikrofon o‘chiq');}
  }
  applyProducerPresence(meta={},present=true){
    const peerId=String(meta.peerId||'');if(!peerId||meta.appData?.mediaTag==='screen'||meta.mediaTag==='screen')return;
    const paused=Boolean(meta.paused),on=Boolean(present&&!paused);
    if(meta.kind==='video')this.updateParticipantCardCamera(peerId,on);
    if(meta.kind==='audio')this.updateParticipantCardMic(peerId,on);
  }
  refreshParticipantCardSelection(){
    for(const [id,card] of this.participantCards)card.classList.toggle('selected',String(id)===String(this.selectedStagePeerId||''));
  }
  selectStagePeer(peerId,emitState=true){
    const id=String(peerId||''),target=this.participantTile(id);if(!target)return false;
    for(const t of this.tiles.values())t.classList.remove('focused');target.classList.add('focused');this.grid?.classList.add('has-focus');this.selectedStagePeerId=id;this.resetZoom(target);this.refreshParticipantCardSelection();
    this.grid?.classList.remove('local-camera-stage');
    if(emitState)this.explicitStagePeerId=id;
    this.ensureInlineVideoStage();
    if(emitState)this.onState({focusedUserId:target.dataset.userId||id});return true;
  }
  setViewMode(mode){
    this.viewMode=mode==='gallery'?'gallery':'speaker';localStorage.setItem('m2-view-mode',this.viewMode);
    this.grid?.classList.toggle('gallery-view',this.viewMode==='gallery');
    this.grid?.classList.toggle('speaker-view',this.viewMode==='speaker');this.grid?.classList.toggle('teacher-stage-layout',this.viewMode==='speaker');
    if(this.viewMode==='gallery'){this.grid?.classList.remove('speaker-layout','has-focus');for(const t of this.tiles.values())t.classList.remove('active-speaker','speaker-side','focused')}
    else if(this.selectedStagePeerId)this.selectStagePeer(this.selectedStagePeerId,false);
    this.ensureInlineVideoStage();
    this.onState({viewMode:this.viewMode});return this.viewMode;
  }
  focusUserForClass(userId=''){
    this.classSpotlightUserId=String(userId||'');
    // Spotlight is authoritative and idempotent; local double-click Pin retains separate toggle semantics.
    const selected=[...this.tiles.values()].find(t=>this.classSpotlightUserId&&String(t.dataset.userId||'')===this.classSpotlightUserId);
    if(!selected){
      if(this.classSpotlightUserId)return false; // Keep pending spotlight until remote peer joins.
      for(const t of this.tiles.values())t.classList.remove('pinned','teacher-pip');
      this.pinnedUserId='';this.grid?.classList.remove('class-spotlight');
      const teacher=[...this.tiles.values()].find(t=>t.classList.contains('role-teacher')&&t.classList.contains('has-video'))
        ||(this.user?.role!=='student'&&this.tiles.get('local')?.classList.contains('has-video')?this.tiles.get('local'):null);
      if(teacher)this.selectStagePeer(teacher.dataset.peerId==='local'?String(this.room?.peerId||'local'):teacher.dataset.peerId,false);
      else {this.grid?.classList.remove('has-focus');this.selectedStagePeerId='';for(const t of this.tiles.values())t.classList.remove('focused');}
      this.ensureInlineVideoStage();
      return true;
    }
    this.setViewMode('speaker');
    for(const t of this.tiles.values())t.classList.remove('pinned','teacher-pip','focused');
    selected.classList.add('focused','pinned');
    this.pinnedUserId=this.classSpotlightUserId;
    this.grid?.classList.add('class-spotlight','has-focus');
    this.selectedStagePeerId=String(selected.dataset.peerId||'');
    // The course instructor may join as a privileged staff user, not only "teacher".
    const teacher=[...this.tiles.values()].find(t=>t!==selected&&t.classList.contains('role-teacher')&&t.classList.contains('has-video')&&!t.classList.contains('screen-share'))
      ||(this.user?.role!=='student'&&this.tiles.get('local')!==selected&&this.tiles.get('local')?.classList.contains('has-video')?this.tiles.get('local'):null);
    this.grid?.classList.remove('local-camera-stage');
    this.syncStandaloneCameraStage(false);
    if(teacher)teacher.classList.add('teacher-pip');
    this.ensureInlineVideoStage();
    this.refreshParticipantCardSelection();
    this.onState({focusedUserId:this.classSpotlightUserId});
    return true;
  }
  pinUser(userId='',peerId=''){
    const target=[...this.tiles.values()].find(t=>(userId&&t.dataset.userId===String(userId))||(peerId&&t.dataset.peerId===String(peerId)));
    for(const t of this.tiles.values())t.classList.remove('pinned','focused');
    if(!target){this.pinnedUserId='';this.grid?.classList.remove('has-focus');this.ensureInlineVideoStage();this.onState({pinnedUserId:''});return false}
    const already=this.pinnedUserId&&(target.dataset.userId===this.pinnedUserId||target.dataset.peerId===this.pinnedUserId);
    if(already){this.pinnedUserId='';this.grid?.classList.remove('has-focus');this.ensureInlineVideoStage();this.onState({pinnedUserId:''});return false}
    target.classList.add('pinned','focused');this.grid?.classList.add('has-focus');this.pinnedUserId=target.dataset.userId||target.dataset.peerId;this.ensureInlineVideoStage();this.onState({pinnedUserId:this.pinnedUserId});return true;
  }
  getPrimaryVideoTile(){
    const tiles=[...this.tiles.values()];
    return tiles.find(t=>t.classList.contains('pinned')&&t.classList.contains('has-video'))
      ||tiles.find(t=>t.classList.contains('screen-share')&&t.classList.contains('has-video'))
      ||tiles.find(t=>t.classList.contains('focused')&&t.classList.contains('has-video'))
      ||tiles.find(t=>t.classList.contains('role-teacher')&&t.classList.contains('has-video'))
      ||tiles.find(t=>t.classList.contains('active-speaker')&&t.classList.contains('has-video'))
      ||tiles.find(t=>t.classList.contains('has-video'))
      ||null;
  }
  focusTeacherOrScreen(){
    const tiles=[...this.tiles.values()],target=this.getPrimaryVideoTile();
    if(!target)return false;
    for(const t of tiles)t.classList.remove('focused');
    target.classList.add('focused');this.grid?.classList.add('has-focus');this.resetZoom(target);return target;
  }
  prepareFullscreenLayout(){
    const tiles=[...this.tiles.values()],target=this.getPrimaryVideoTile();
    if(!target)return null;
    for(const t of tiles)t.classList.remove('cinema-primary','fullscreen-teacher-pip');
    target.classList.add('cinema-primary');
    const teacher=tiles.find(t=>t!==target&&t.classList.contains('role-teacher')&&t.classList.contains('has-video')&&!t.classList.contains('screen-share'));
    if(teacher)teacher.classList.add('fullscreen-teacher-pip');
    this.grid?.classList.add('fullscreen-video-grid');
    return {target,teacher};
  }
  clearFullscreenLayout(){
    this.grid?.classList.remove('fullscreen-video-grid');
    for(const t of this.tiles.values())t.classList.remove('cinema-primary','fullscreen-teacher-pip');
  }
  async enterPrimaryFullscreen(){
    const layout=this.prepareFullscreenLayout();
    if(!layout)throw new Error('Asosiy video topilmadi');
    const {target}=layout,video=qs('video',target),host=this.grid||this.mount;
    try{
      if(host?.requestFullscreen){
        await host.requestFullscreen({navigationUI:'hide'}).catch(()=>host.requestFullscreen());
        try{await screen.orientation?.lock?.('landscape')}catch{}
        return {active:true,mode:'grid'};
      }
      if(video?.webkitEnterFullscreen&&!layout.teacher){
        video.webkitEnterFullscreen();
        return {active:true,mode:'video'};
      }
    }catch{}
    document.documentElement.classList.add('video-cinema-fallback');
    try{await screen.orientation?.lock?.('landscape')}catch{}
    return {active:true,mode:'fallback'};
  }
  async exitPrimaryFullscreen(){
    if(document.fullscreenElement)try{await document.exitFullscreen()}catch{}
    document.documentElement.classList.remove('video-cinema-fallback');
    this.clearFullscreenLayout();
    try{screen.orientation?.unlock?.()}catch{}
    return {active:false};
  }
  resetZoom(tile=null){
    const targets=tile?[tile]:[...this.tiles.values()];
    for(const t of targets){
      const v=qs('video',t);if(!v)continue;
      v.dataset.zoom='1';v.dataset.panX='0';v.dataset.panY='0';v.style.transform='translate3d(0,0,0) scale(1)';
    }
  }
  installPinchZoom(tile,video){
    let startDist=0,startZoom=1,startX=0,startY=0,startPanX=0,startPanY=0;
    const point=(a,b)=>({x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)});
    const apply=(z,x,y)=>{z=Math.max(1,Math.min(5,z));const lim=(z-1)*220;x=Math.max(-lim,Math.min(lim,x));y=Math.max(-lim,Math.min(lim,y));video.dataset.zoom=String(z);video.dataset.panX=String(x);video.dataset.panY=String(y);video.style.transform='translate3d('+x+'px,'+y+'px,0) scale('+z+')'};
    tile.addEventListener('touchstart',e=>{
      if(e.touches.length===2){const p=point(e.touches[0],e.touches[1]);startDist=p.d;startZoom=Number(video.dataset.zoom||1);startX=p.x;startY=p.y;startPanX=Number(video.dataset.panX||0);startPanY=Number(video.dataset.panY||0);tile.classList.add('pinch-active')}
    },{passive:true});
    tile.addEventListener('touchmove',e=>{
      if(e.touches.length!==2||!startDist)return;
      e.preventDefault();const p=point(e.touches[0],e.touches[1]);const z=startZoom*(p.d/startDist);apply(z,startPanX+(p.x-startX),startPanY+(p.y-startY));
    },{passive:false});
    tile.addEventListener('touchend',()=>{startDist=0;tile.classList.remove('pinch-active')},{passive:true});
    video.addEventListener('dblclick',e=>{e.stopPropagation();this.resetZoom(tile)});
  }
  async listDevices(){
    try{const rows=await navigator.mediaDevices.enumerateDevices();return {audio:rows.filter(x=>x.kind==='audioinput'),video:rows.filter(x=>x.kind==='videoinput')}}catch{return {audio:[],video:[]}}
  }
  async selectDevice(kind,id){
    const key=kind==='audio'?'m2-preferred-mic':'m2-preferred-camera';if(id)localStorage.setItem(key,id);else localStorage.removeItem(key);
    if(kind==='audio'&&this.producers.get('mic')){await this.closeProducer('mic');await this.startMicrophone()}
    if(kind==='video'&&this.producers.get('camera')){await this.closeProducer('camera');await this.toggleCamera()}
    return true;
  }
  async switchCamera(){
    this.facingMode=this.facingMode==='user'?'environment':'user';localStorage.setItem('m2-facing-mode',this.facingMode);
    localStorage.removeItem('m2-preferred-camera');
    if(this.producers.get('camera')){await this.closeProducer('camera');await this.toggleCamera()}
    this.onState({facingMode:this.facingMode});return this.facingMode;
  }
  async setLowBandwidth(enabled){
    this.lowBandwidthMode=Boolean(enabled);localStorage.setItem('m2-low-bandwidth',this.lowBandwidthMode?'1':'0');
    await this.setReceiveQuality(this.lowBandwidthMode?'240':'auto');
    this.mount?.classList.toggle('low-bandwidth-mode',this.lowBandwidthMode);
    this.onState({lowBandwidth:this.lowBandwidthMode});return this.lowBandwidthMode;
  }
  async muteSelfIfNeeded(){
    const p=this.producers.get('mic');if(p&&!p.paused)await this.toggleMic();
  }
  async cameraOffIfNeeded(){
    const p=this.producers.get('camera');if(p&&!p.paused)await this.toggleCamera();
  }
  async requestBackgroundPiP(){
    const tile=this.tiles.get('local'),video=tile?qs('video',tile):null;
    if(this.closed||!document.hidden||!video?.srcObject||document.pictureInPictureElement)return false;
    if(document.pictureInPictureEnabled&&typeof video.requestPictureInPicture==='function'){
      try{
        await video.play().catch(()=>{});
        if(!document.hidden)return false;
        await video.requestPictureInPicture();
        this.automaticPiP=true;
        return true;
      }catch{}
    }
    return false;
  }
  restoreInlineCamera(focus=false){
    const tile=this.tiles.get('local'),video=tile?qs('video',tile):null;
    tile?.classList.remove('floating-pip');
    this.grid?.classList.remove('has-floating-pip');
    if((this.automaticPiP||focus)&&document.pictureInPictureElement===video)document.exitPictureInPicture().catch(()=>{});
    this.automaticPiP=false;
    if(focus&&tile?.classList.contains('has-video')&&!this.classSpotlightUserId&&!this.grid?.classList.contains('screen-layout')){
      const selected=this.participantTile(this.selectedStagePeerId);
      const selectedVideo=selected?qs('video',selected):null;
      const selectedTrack=selectedVideo?.srcObject?.getVideoTracks?.()[0];
      const hasLiveStage=Boolean(selected?.classList.contains('has-video')&&selectedTrack?.readyState==='live');
      if(!hasLiveStage)this.selectStagePeer(String(this.room?.peerId||'local'),false);
    }
    this.ensureInlineVideoStage();
    if(video?.srcObject&&video.paused)video.play().catch(()=>this.onState({cameraPreviewBlocked:true}));
  }
  syncStandaloneCameraStage(show,track,label=''){
    const root=this.selfStage,video=this.selfStageVideo;
    if(!root||!video)return;
    const ready=Boolean(show&&track?.readyState==='live'&&track.enabled&&!this.closed);
    root.classList.toggle('is-visible',ready);
    root.setAttribute('aria-hidden',ready?'false':'true');
    if(!ready){
      if(video.srcObject)video.srcObject=null;
      return;
    }
    const current=video.srcObject?.getVideoTracks?.()[0];
    const changed=current!==track;
    if(changed)video.srcObject=new MediaStream([track]);
    video.muted=true;video.autoplay=true;video.playsInline=true;
    if(this.selfStageLabel)this.selfStageLabel.textContent=label||this.user?.fullName||'Asosiy video';
    if(changed||video.paused){
      const playing=video.play();
      if(playing?.catch)playing.catch(()=>this.onState({cameraPreviewBlocked:true}));
    }
  }
  restoreTeacherFromPiP(){
    const tiles=[...(this.tiles?.values()||[])];
    const teacher=tiles.find(t=>t.classList.contains('role-teacher')&&this.primaryTileTrack(t))
      ||(this.user?.role==='teacher'&&this.primaryTileTrack(this.tiles.get('local'))?this.tiles.get('local'):null);
    const id=String(teacher?.dataset?.userId||'');
    if(!id)return false;
    this.onTeacherPiPClick({userId:id,peerId:String(teacher.dataset.peerId||'')});
    return true;
  }
  syncTeacherPiP(primary){
    const root=this.teacherPiP,video=this.teacherPiPVideo;
    if(!root||!video)return;
    const tiles=[...(this.tiles?.values()||[])];
    const teacher=tiles.find(t=>t.classList.contains('role-teacher')&&this.primaryTileTrack(t))
      ||(this.user?.role==='teacher'?this.tiles.get('local'):null);
    const track=teacher&&teacher!==primary?this.primaryTileTrack(teacher):null;
    const show=Boolean(track&&!this.closed);
    root.classList.toggle('is-visible',show);
    root.setAttribute('aria-hidden',show?'false':'true');
    if(!show){if(video.srcObject)video.srcObject=null;return;}
    const current=video.srcObject?.getVideoTracks?.()[0];
    if(current!==track)video.srcObject=new MediaStream([track]);
    video.muted=true;video.playsInline=true;video.autoplay=true;
    this.teacherPiPLabel.textContent=qs('.ms-label b',teacher)?.textContent||this.user?.fullName||'O‘qituvchi';
    if(current!==track||video.paused)video.play().catch(()=>this.onState({cameraPreviewBlocked:true}));
  }
  primaryTileTrack(tile){
    if(!tile?.classList?.contains('has-video'))return null;
    const track=qs('video',tile)?.srcObject?.getVideoTracks?.()[0];
    if(!track||track.readyState!=='live'||!track.enabled)return null;
    if(tile===this.tiles.get('local')){
      const producer=this.producers.get('camera');
      if(!producer||producer.paused)return null;
    }
    return track;
  }
  refreshEmptyStage(){
    if(!this.emptyStage)return;
    // Hidden speaker/gallery tiles are NOT proof that a video is visible.
    const hasMainVideo=Boolean(this.selfStage?.classList.contains('is-visible'));
    this.emptyStage.classList.toggle('is-visible',!hasMainVideo);
    const isStudent=this.user?.role==='student';
    const isPresenter=['teacher','admin','superadmin'].includes(this.user?.role);
    const producer=this.producers?.get('camera');
    const cameraWorking=Boolean(producer&&!producer.paused&&producer.track?.readyState==='live');
    this.emptyTitle.textContent=this.cameraLastError?'Kamera ochilmadi':this.classSpotlightUserId?'Tanlangan ishtirokchining videosi yo‘q':cameraWorking?'Video ulanmoqda…':'Kamera hozir o‘chiq';
    this.emptyHint.textContent=this.cameraLastError?this.cameraLastError:isStudent?'O‘qituvchi yoki guruh videosi paydo bo‘lganda shu yerda ko‘rsatiladi':
      cameraWorking?'Kamera faol. Asosiy videoni tiklash kutilmoqda.':'Dars videosini chiqarish uchun kamerani yoqing';
    this.emptyCameraAction.hidden=!isPresenter||cameraWorking;
    this.emptyCameraAction.disabled=Boolean(this.mediaBusy?.camera);
  }
  ensureInlineVideoStage(){
    if(!this.grid||this.closed)return false;
    const tiles=[...this.tiles.values()],local=this.tiles.get('local');
    const usable=tile=>Boolean(this.primaryTileTrack(tile));
    const byUserId=id=>tiles.find(tile=>String(tile.dataset?.userId||'')===String(id));
    const pinned=tiles.find(tile=>tile.classList.contains('pinned'));
    const screen=tiles.find(tile=>tile.classList.contains('screen-share')&&usable(tile));
    const selected=this.participantTile(this.selectedStagePeerId);
    const teacher=tiles.find(tile=>tile.classList.contains('role-teacher')&&usable(tile));
    let primary=null;
    if(this.classSpotlightUserId){
      // Do not silently replace a selected student's missing stream with the teacher.
      const spotlight=byUserId(this.classSpotlightUserId);
      primary=usable(spotlight)?spotlight:null;
    }else if(this.grid.classList.contains('screen-layout')&&screen){
      primary=screen;
    }else if(this.pinnedUserId&&pinned){
      primary=usable(pinned)?pinned:null;
    }else if(this.explicitStagePeerId&&selected&&String(selected.dataset.peerId||'')===String(this.explicitStagePeerId)){
      primary=usable(selected)?selected:null;
    }else{
      primary=[teacher,selected,local,screen,...tiles].find(usable)||null;
    }
    const track=this.primaryTileTrack(primary);
    const label=primary?(qs('.ms-label b',primary)?.textContent||this.user?.fullName||'Video'):'';
    this.grid.classList.toggle('local-camera-stage',Boolean(primary===local));
    this.syncStandaloneCameraStage(Boolean(track),track,label);
    this.syncTeacherPiP(primary);
    this.refreshEmptyStage();
    return Boolean(track);
  }
  async getNetworkHealth(){
    const states=[this.sendTransport?.connectionState,this.recvTransport?.connectionState].filter(Boolean);
    const state=states.includes('failed')?'failed':states.includes('disconnected')?'disconnected':states.includes('connecting')?'connecting':states.every(x=>x==='connected')&&states.length===2?'connected':'unknown';
    let rttMs=0,received=0,lost=0;
    try{
      const report=await this.recvTransport?.getStats?.();
      if(report)for(const stat of report.values()){
        if(stat.type==='candidate-pair'&&stat.state==='succeeded'&&(stat.nominated||stat.selected)&&Number.isFinite(stat.currentRoundTripTime))rttMs=Math.max(rttMs,stat.currentRoundTripTime*1000);
        if(stat.type==='inbound-rtp'&&!stat.isRemote&&(stat.kind==='video'||stat.mediaType==='video')){
          received+=Number(stat.packetsReceived||0);lost+=Number(stat.packetsLost||0);
        }
      }
    }catch{}
    const previous=this.networkStats||{received:0,lost:0,at:0};
    const dReceived=received-previous.received,dLost=lost-previous.lost;
    const validSample=received>0&&previous.at>0&&dReceived>=0&&dLost>=0&&(dReceived+dLost)>=30;
    if(received>0&&(!previous.at||validSample||dReceived<0||dLost<0))this.networkStats={received,lost,at:Date.now()};
    return {state,rttMs,lossPercent:validSample?100*dLost/(dReceived+dLost):null};
  }
  async prepareSpeechTrack(rawTrack){
    try{await rawTrack.applyConstraints({echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}).catch(()=>{})}catch{}
    try{rawTrack.contentHint='speech'}catch{}
    // Experimental filters can damage acoustic echo cancellation and misclassify voices as feedback.
    // Keep the native microphone track by default; advanced DSP is opt-in only for diagnostics.
    if(localStorage.getItem('m2-experimental-audio-dsp')!=='1')return {track:rawTrack,rawTrack,processed:false};
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return {track:rawTrack,rawTrack,processed:false};
    try{
      if(this.audioCtx?.state==='closed')this.audioCtx=null;
      const ctx=this.audioCtx||(this.audioCtx=new AC({latencyHint:'interactive',sampleRate:this.ultraLite?32000:48000}));
      if(ctx.state==='suspended')await ctx.resume().catch(()=>{});
      const srcStream=new MediaStream([rawTrack]),source=ctx.createMediaStreamSource(srcStream);
      const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=120;high.Q.value=.72;
      const notch1=ctx.createBiquadFilter();notch1.type='notch';notch1.frequency.value=1200;notch1.Q.value=34;
      const notch2=ctx.createBiquadFilter();notch2.type='notch';notch2.frequency.value=2400;notch2.Q.value=30;
      const notch3=ctx.createBiquadFilter();notch3.type='notch';notch3.frequency.value=600;notch3.Q.value=26;
      const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=this.ultraLite?7600:9000;low.Q.value=.62;
      const comp=ctx.createDynamicsCompressor();comp.threshold.value=-38;comp.knee.value=10;comp.ratio.value=12;comp.attack.value=.001;comp.release.value=.08;
      const gain=ctx.createGain();gain.gain.value=.54;
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.0008;limiter.release.value=.07;
      const analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.40;
      const dest=ctx.createMediaStreamDestination();
      source.connect(high);high.connect(notch1);notch1.connect(notch2);notch2.connect(notch3);notch3.connect(low);low.connect(comp);comp.connect(gain);gain.connect(limiter);limiter.connect(analyser);analyser.connect(dest);
      const track=dest.stream.getAudioTracks()[0];if(!track)return {track:rawTrack,rawTrack,processed:false};
      try{track.contentHint='speech'}catch{}
      this.micAudioChain={ctx,source,high,notch1,notch2,notch3,low,comp,gain,limiter,analyser,dest,rawTrack,track,feedbackFreq:0};
      return {track,rawTrack,processed:true};
    }catch(e){return {track:rawTrack,rawTrack,processed:false}}
  }
  async startFeedbackMonitor(rawTrack=this.localMicRawTrack){
    if(this.closed||!rawTrack||rawTrack.readyState==='ended')return false;
    this.stopFeedbackMonitor();
    let analyser=this.micAudioChain?.analyser||null;
    if(!analyser){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC)return false;
      try{
        const ctx=new AC({latencyHint:'interactive'});
        const source=ctx.createMediaStreamSource(new MediaStream([rawTrack]));
        analyser=ctx.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.20;
        // Branch only to AnalyserNode, never to a MediaStreamDestination or speakers:
        // browser hardware/native WebRTC acoustic echo cancellation remains intact.
        source.connect(analyser);
        this.micSafetyMonitor={ctx,source,analyser};
        if(ctx.state==='suspended')await ctx.resume().catch(()=>{});
      }catch(e){this.stopFeedbackMonitor();return false}
    }
    if(this.closed||!this.hasActiveMicrophone()){this.stopFeedbackMonitor();return false}
    const bins=new Uint8Array(analyser.frequencyBinCount),time=new Uint8Array(analyser.fftSize);
    this.feedbackToneTracker=createFeedbackToneTracker();
    this.feedbackMonitorStatus='active';
    this.feedbackMonitorTimer=setInterval(()=>{
      if(this.closed||!this.hasActiveMicrophone())return;
      try{
        analyser.getByteFrequencyData(bins);analyser.getByteTimeDomainData(time);
        const frame=inspectFeedbackFrame(bins,time,{sampleRate:analyser.context.sampleRate,fftSize:analyser.fftSize});
        if(this.feedbackToneTracker.observe(frame,Date.now())){
          this.feedbackLastFreq=frame.frequency;
          this.triggerFeedbackGuard(15000,true,frame.frequency);
        }
      }catch(e){this.stopFeedbackMonitor()}
    },85);
    return true;
  }
  stopFeedbackMonitor(){
    if(this.feedbackMonitorTimer){clearInterval(this.feedbackMonitorTimer);this.feedbackMonitorTimer=null}
    this.feedbackToneTracker?.reset();this.feedbackToneTracker=null;
    const monitor=this.micSafetyMonitor;this.micSafetyMonitor=null;
    if(monitor){
      try{monitor.source?.disconnect()}catch{}
      try{monitor.analyser?.disconnect()}catch{}
      try{monitor.ctx?.close?.().catch(()=>{})}catch{}
    }
    this.feedbackMonitorStatus='off';this.feedbackToneSince=0;this.feedbackStableHits=0;this.feedbackLastFreq=0;
  }
  setMicGuardGain(value,seconds=.08){
    const g=this.micAudioChain?.gain;if(!g)return;
    const now=g.context.currentTime;
    try{g.gain.cancelScheduledValues(now);g.gain.setTargetAtTime(value,now,seconds)}catch{g.gain.value=value}
  }
  tuneFeedbackNotches(freq){
    const chain=this.micAudioChain;if(!chain?.notch1||!Number.isFinite(Number(freq)))return;
    const f=Math.max(360,Math.min(9000,Number(freq))),now=chain.ctx.currentTime;
    const harmonic=Math.min(9800,f*2),sub=Math.max(180,f/2),safeLow=f>4200?Math.max(5400,Math.min(7600,f*1.18)):(this.ultraLite?7600:9000);
    try{
      chain.notch1.frequency.setTargetAtTime(f,now,.008);chain.notch1.Q.setTargetAtTime(38,now,.012);
      chain.notch2.frequency.setTargetAtTime(harmonic,now,.010);chain.notch2.Q.setTargetAtTime(32,now,.014);
      chain.notch3.frequency.setTargetAtTime(sub,now,.010);chain.notch3.Q.setTargetAtTime(28,now,.014);
      chain.low?.frequency?.setTargetAtTime(safeLow,now,.025);
      chain.feedbackFreq=f;
    }catch{
      chain.notch1.frequency.value=f;chain.notch2.frequency.value=harmonic;if(chain.notch3)chain.notch3.frequency.value=sub;if(chain.low)chain.low.frequency.value=safeLow;chain.feedbackFreq=f;
    }
  }
  applyFastFeedbackGate(severe=false){
    const g=this.micAudioChain?.gain;if(!g)return;
    const now=g.context.currentTime;
    try{
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(.002,Math.min(.62,g.gain.value||.54)),now);
      g.gain.linearRampToValueAtTime(severe?.0005:.05,now+.003);
      g.gain.setTargetAtTime(severe?.08:.24,now+.16,.10);
      g.gain.setTargetAtTime(.50,now+2.8,.55);
    }catch{g.gain.value=severe?.004:.18}
  }
    enterZeroFeedbackMode(){
    this.audioBin?.querySelectorAll('audio').forEach(a=>{try{a.muted=true;a.volume=0;a.pause();a.dataset.hardMuted='1'}catch{}});
    this.onState({halfDuplex:true,zeroFeedback:true});
  }
  exitZeroFeedbackMode(){
    const mic=this.producers.get('mic');
    if(mic&&!mic.paused)return;
    setTimeout(()=>this.refreshRemoteAudioVolume(),80);
    this.onState({halfDuplex:false,zeroFeedback:true});
  }
  floorBusyForMe(){
    if(!this.proximityGuard)return false;
    const mine=String(this.room?.peerId||'');
    return Boolean(this.audioFloor?.active&&String(this.audioFloor?.peerId||'')!==mine);
  }
  async startMicrophone(){
    if(this.mediaBusy?.mic)return false;
    if(this.floorBusyForMe()){this.onError(new Error('Hozir boshqa ishtirokchi gapiryapti. Mikrofon navbati bo‘shagach qayta bosing.'));return false}
    if(this.proximityGuard)this.enterZeroFeedbackMode();
    this.micWarmupUntil=Date.now()+2600;
    this.mediaBusy=this.mediaBusy||{};this.mediaBusy.mic=true;this.onState({micBusy:true});
    let rawTrack=null,sendTrack=null;
    try{
      const stream=await this.getMediaOnce('audio');
      rawTrack=stream.getAudioTracks()[0];if(!rawTrack)throw new Error('Mikrofon trek topilmadi');
      const settings=rawTrack.getSettings?.()||{};
      if(settings.echoCancellation===false)this.onState({aecUnavailable:true});
      const prepared=await this.prepareSpeechTrack(rawTrack),track=prepared.track;sendTrack=track;this.localMicRawTrack=rawTrack;
      const producer=await this.sendTransport.produce({track,codecOptions:{opusStereo:false,opusDtx:true,opusFec:true,opusMaxPlaybackRate:this.ultraLite?32000:48000,opusPtime:20},appData:{mediaTag:'mic',role:this.user.role,aec:true,ns:true,agc:true,processed:prepared.processed}});
      this.producers.set('mic',producer);producer.on('transportclose',()=>this.producers.delete('mic'));this.startFeedbackMonitor(rawTrack).catch(()=>{});
      this.updateParticipantCardMic(this.room?.peerId,true);this.refreshRemoteAudioVolume();this.onState({mic:true,halfDuplex:this.proximityGuard,zeroFeedback:this.proximityGuard});return true;
    }catch(e){
      try{rawTrack?.stop()}catch{};if(sendTrack&&sendTrack!==rawTrack)try{sendTrack.stop()}catch{}
      this.stopFeedbackMonitor();this.micAudioChain=null;this.localMicRawTrack=null;
      const msg=e?.name==='NotAllowedError'?'Brauzerda mikrofon ruxsatini yoqing':(e?.message||'noma’lum xato');
      this.onError(new Error('Mikrofon ochilmadi: '+msg));this.onState({mic:false});this.exitZeroFeedbackMode();return false;
    }finally{this.mediaBusy.mic=false;this.onState({micBusy:false})}
  }
  async toggleMic(){
    const p=this.producers.get('mic');
    if(!p)return this.startMicrophone();
    if(p.paused){
      if(this.floorBusyForMe()){this.onError(new Error('Hozir boshqa ishtirokchi gapiryapti.'));return false}
      if(this.proximityGuard)this.enterZeroFeedbackMode();
      this.micWarmupUntil=Date.now()+2200;
      try{
        await this.request('resumeProducer',{producerId:p.id});
        p.track.enabled=true;p.resume();this.startFeedbackMonitor(this.localMicRawTrack||p.track).catch(()=>{});
        this.updateParticipantCardMic(this.room?.peerId,true);this.refreshRemoteAudioVolume();this.onState({mic:true,halfDuplex:this.proximityGuard,zeroFeedback:this.proximityGuard});return true
      }catch(e){
        p.track.enabled=false;this.exitZeroFeedbackMode();this.onError(e);return false
      }
    }
    p.pause();p.track.enabled=false;this.stopFeedbackMonitor();await this.request('pauseProducer',{producerId:p.id}).catch(()=>{});this.updateParticipantCardMic(this.room?.peerId,false);this.clearFeedbackProtection();this.exitZeroFeedbackMode();this.refreshRemoteAudioVolume();this.onState({mic:false,halfDuplex:false,zeroFeedback:false});return false;
  }
  setExternalCameraTrack(track){
    this.externalCameraTrack=track?.readyState==='live'?track:null;
    return Boolean(this.externalCameraTrack);
  }
  async startCameraFromExternalTrack(sourceTrack=this.externalCameraTrack,viewerUserId='',broadcastToClass=false){
    if(!sourceTrack||sourceTrack.readyState!=='live')throw new Error('Proktor kamera treki tayyor emas');
    const existing=this.producers.get('camera');
    if(existing){
      if(existing.paused){existing.track.enabled=true;existing.resume();await this.request('resumeProducer',{producerId:existing.id}).catch(()=>{});this.onState({camera:true,proctorBroadcast:this.proctorCameraBroadcast});}
      return true;
    }
    if(this.mediaBusy?.camera)return false;
    this.mediaBusy=this.mediaBusy||{};this.mediaBusy.camera=true;this.onState({cameraBusy:true});
    try{
      const track=sourceTrack.clone();try{track.contentHint='motion'}catch{}
      const lite=this.lowEnd||this.mediaProfile==='lecture-lite';
      const encodings=this.ultraLite?[{maxBitrate:420000,scaleResolutionDownBy:1,maxFramerate:15}]
        :(lite?[{maxBitrate:180000,scaleResolutionDownBy:4,maxFramerate:12},{maxBitrate:650000,scaleResolutionDownBy:2,maxFramerate:20},{maxBitrate:1600000,scaleResolutionDownBy:1,maxFramerate:30}]
        :[{maxBitrate:280000,scaleResolutionDownBy:4,maxFramerate:15},{maxBitrate:1100000,scaleResolutionDownBy:2,maxFramerate:24},{maxBitrate:2600000,scaleResolutionDownBy:1,maxFramerate:30}]);
      const producer=await this.sendTransport.produce({track,encodings,codecOptions:{videoGoogleStartBitrate:this.ultraLite?300:(lite?650:900)},appData:{mediaTag:'camera',role:this.user.role,quality:broadcastToClass?'classroom-spotlight':'proctor-on-demand',proctorBroadcast:!broadcastToClass,classroomSpotlight:Boolean(broadcastToClass),proctorViewerUserId:broadcastToClass?'':String(viewerUserId||'')}});
      this.producers.set('camera',producer);this.proctorCameraBroadcast=true;this.attachLocalVideo(track);
      producer.on('trackended',()=>this.closeProducer('camera'));producer.on('transportclose',()=>{this.producers.delete('camera');this.proctorCameraBroadcast=false});
      this.onState({camera:true,proctorBroadcast:true});return true;
    }finally{this.mediaBusy.camera=false;this.onState({cameraBusy:false})}
  }
  async stopProctorCameraBroadcast(){
    if(!this.proctorCameraBroadcast)return false;
    const p=this.producers.get('camera');if(p){try{await this.closeProducer('camera')}catch{}}
    this.proctorCameraBroadcast=false;this.onState({camera:false,proctorBroadcast:false});return true;
  }
  async toggleCamera(){
    let p=this.producers.get('camera');
    if(p&&p.track?.readyState!=='live'){await this.closeProducer('camera');p=null;}
    if(p){
      if(p.paused){p.resume();p.track.enabled=true;await this.request('resumeProducer',{producerId:p.id}).catch(()=>{});this.updateParticipantCardCamera(this.room?.peerId,true);this.ensureInlineVideoStage();this.onState({camera:true});return true}
      p.pause();p.track.enabled=false;await this.request('pauseProducer',{producerId:p.id}).catch(()=>{});this.updateParticipantCardCamera(this.room?.peerId,false);this.ensureInlineVideoStage();this.onState({camera:false});return false;
    }
    if(this.mediaBusy?.camera)return false;
    this.mediaBusy=this.mediaBusy||{};this.mediaBusy.camera=true;this.onState({cameraBusy:true});
    try{
      const stream=this.user?.role==='student'&&this.externalCameraTrack?.readyState==='live'?new MediaStream([this.externalCameraTrack.clone()]):await this.getMediaOnce('video'),track=stream.getVideoTracks()[0];
      if(!track)throw new Error('Kamera trek topilmadi');
      const teacher=this.user?.role==='teacher',lite=this.lowEnd||this.mediaProfile==='lecture-lite';
      const encodings=teacher&&!this.ultraLite
        ?[{maxBitrate:280000,scaleResolutionDownBy:4,maxFramerate:15},{maxBitrate:1100000,scaleResolutionDownBy:2,maxFramerate:24},{maxBitrate:3800000,scaleResolutionDownBy:1,maxFramerate:30}]
        :this.ultraLite?[{maxBitrate:420000,scaleResolutionDownBy:1,maxFramerate:15}]
        :(lite?[{maxBitrate:180000,scaleResolutionDownBy:4,maxFramerate:12},{maxBitrate:650000,scaleResolutionDownBy:2,maxFramerate:20},{maxBitrate:1600000,scaleResolutionDownBy:1,maxFramerate:30}]:[{maxBitrate:280000,scaleResolutionDownBy:4,maxFramerate:15},{maxBitrate:1100000,scaleResolutionDownBy:2,maxFramerate:24},{maxBitrate:3800000,scaleResolutionDownBy:1,maxFramerate:30}]);
      try{track.contentHint='motion'}catch{}
      const producer=await this.sendTransport.produce({track,encodings,codecOptions:{videoGoogleStartBitrate:teacher?1200:(this.ultraLite?300:(lite?650:1000))},appData:{mediaTag:'camera',role:this.user.role,quality:teacher?'1080p':'adaptive'}});
      this.producers.set('camera',producer);this.cameraLastError='';this.proctorCameraBroadcast=false;this.attachLocalVideo(track);clearTimeout(this.cameraRecoveryTimer);this.cameraRecoveryAttempts=0;producer.on('trackended',()=>this.handleUnexpectedCameraEnd(producer));producer.on('transportclose',()=>this.producers.delete('camera'));this.onState({camera:true});return true;
    }catch(e){
      const msg=e?.name==='NotAllowedError'?'Brauzerda kamera ruxsatini yoqing':(e?.message||'noma’lum xato');
      this.cameraLastError=msg;this.onError(new Error('Kamera ochilmadi: '+msg));this.onState({camera:false});this.ensureInlineVideoStage();return false;
    }finally{this.mediaBusy.camera=false;this.onState({cameraBusy:false})}
  }
  async handleUnexpectedCameraEnd(producer){
    if(this.closed||this.producers.get('camera')!==producer)return;
    await this.closeProducer('camera');
    this.onState({camera:false,cameraInterrupted:true});
    if(this.user?.role!=='teacher')return;
    const retry=async()=>{
      if(this.closed||this.producers.has('camera')||this.cameraRecoveryAttempts>=3)return;
      this.cameraRecoveryAttempts++;
      const ok=await this.toggleCamera();
      if(!ok&&!this.closed&&this.cameraRecoveryAttempts<3)this.cameraRecoveryTimer=setTimeout(retry,1800*this.cameraRecoveryAttempts);
    };
    this.cameraRecoveryTimer=setTimeout(retry,1200);
  }
  attachLocalVideo(track){
    const tile=this.ensureTile('local',{fullName:this.user.fullName,login:this.user.login,role:this.user.role,avatarUrl:this.user.avatarUrl||''},true),video=qs('video',tile);
    video.muted=true;video.autoplay=true;video.playsInline=true;
    video.srcObject=new MediaStream([track]);
    tile.classList.add('has-video');
    this.restoreInlineCamera(true);
    video.onloadedmetadata=()=>{if(!this.closed&&!document.hidden&&video.srcObject){this.ensureInlineVideoStage();video.play().catch(()=>this.onState({cameraPreviewBlocked:true}));}};
    this.updateParticipantCardCamera(this.room?.peerId,true);this.syncParticipantCardVideo(this.room?.peerId);
  }
  async toggleScreen(){
    const p=this.producers.get('screen');
    if(p){await this.closeProducer('screen');this.onState({screen:false});return false}
    try{
      const lite=this.lowEnd||this.mediaProfile==='lecture-lite',stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:this.ultraLite?15:30,max:this.ultraLite?20:30}},audio:false}),track=stream.getVideoTracks()[0];
      try{track.contentHint='detail'}catch{}
      const producer=await this.sendTransport.produce({track,encodings:[{maxBitrate:this.ultraLite?900000:(lite?2800000:4500000),maxFramerate:this.ultraLite?20:30}],appData:{mediaTag:'screen',role:this.user.role,quality:'1080p'}});
      this.producers.set('screen',producer);
      const screenTile=this.ensureTile('local:screen',{fullName:(this.user.fullName||this.user.login)+' · Ekran',role:this.user.role},true);
      screenTile.classList.add('screen-share','local-screen','has-video');
      const screenVideo=qs('video',screenTile);screenVideo.srcObject=new MediaStream([track]);screenVideo.muted=true;
      this.grid?.classList.add('screen-layout');
      this.ensureInlineVideoStage();
      const cameraTile=this.tiles.get('local');if(cameraTile?.classList.contains('has-video'))cameraTile.classList.add('screen-camera-pip');
      producer.on('trackended',()=>this.closeProducer('screen'));producer.on('transportclose',()=>this.producers.delete('screen'));this.onState({screen:true});return true;
    }catch(e){if(e.name!=='NotAllowedError')this.onError(new Error('Ekran ulashilmadi: '+e.message));return false}
  }
  async closeProducer(tag){
    const p=this.producers.get(tag);if(!p)return;
    try{await this.request('closeProducer',{producerId:p.id})}catch{}
    try{p.close()}catch{};try{p.track?.stop()}catch{};this.producers.delete(tag);
    if(tag==='mic'){this.updateParticipantCardMic(this.room?.peerId,false);this.stopFeedbackMonitor();this.clearFeedbackProtection();try{this.localMicRawTrack?.stop()}catch{};this.localMicRawTrack=null;try{this.micAudioChain?.rawTrack?.stop()}catch{};for(const node of ['source','high','notch1','notch2','notch3','low','comp','gain','limiter','analyser','dest'])try{this.micAudioChain?.[node]?.disconnect?.()}catch{};this.micAudioChain=null;this.refreshRemoteAudioVolume()}
    if(tag==='camera'){const tile=this.tiles.get('local');if(tile){const v=qs('video',tile);if(v)v.srcObject=null;tile.classList.remove('has-video','screen-camera-pip')}this.updateParticipantCardCamera(this.room?.peerId,false);this.ensureInlineVideoStage()}
    if(tag==='screen'){const tile=this.tiles.get('local:screen');if(tile){tile.remove();this.tiles.delete('local:screen')}this.grid?.classList.remove('screen-layout');this.tiles.get('local')?.classList.remove('screen-camera-pip');this.ensureInlineVideoStage()}
  }
  shouldConsume(meta){
    if(meta.kind==='audio')return true;
    const tag=meta.appData?.mediaTag,role=meta.appData?.role;
    if(meta.appData?.proctorBroadcast)return this.user.role!=='student';
    if(meta.appData?.classroomSpotlight)return true; // Class-wide spotlight after student consent; one controlled stream even on lite devices
    if(tag==='screen'||role==='teacher')return true;
    if(role==='student'){
      if(this.user.role==='student'&&this.ultraLite)return false;
      return this.user.role==='teacher'||this.studentVideoConsumers<this.maxStudentVideos;
    }
    return !this.ultraLite;
  }
  async maybeConsume(meta){
    this.applyProducerPresence(meta,true);
    const producerId=String(meta?.producerId||'');
    if(!producerId||this.closed||meta.peerId===this.room?.peerId||this.consumers.has(producerId)||!this.shouldConsume(meta))return;
    this.consuming||=new Map();this.audioPeerPending||=new Map();this.canceledProducers||=new Set();
    // Both join snapshots and newProducer events can report the same stream simultaneously.
    if(this.consuming.has(producerId))return this.consuming.get(producerId);
    this.canceledProducers.delete(producerId);
    const peerKey=meta.kind==='audio'?String(meta.peerId||''):'';
    const previous=peerKey?this.audioPeerPending.get(peerKey):null;
    const task=(previous?previous.catch(()=>{}):Promise.resolve()).then(()=>this.consumeProducerOnce(meta));
    this.consuming.set(producerId,task);
    if(peerKey)this.audioPeerPending.set(peerKey,task);
    try{return await task}
    finally{
      if(this.consuming.get(producerId)===task)this.consuming.delete(producerId);
      if(peerKey&&this.audioPeerPending.get(peerKey)===task)this.audioPeerPending.delete(peerKey);
    }
  }
  async consumeProducerOnce(meta){
    const producerId=String(meta.producerId);
    if(this.closed||this.canceledProducers?.has(producerId)||this.consumers.has(producerId))return;
    const proctorVideo=Boolean(meta.appData?.proctorBroadcast),priorityVideo=meta.appData?.role==='teacher'||meta.appData?.mediaTag==='screen'||proctorVideo;
    const requestedQuality=this.receiveQuality==='auto'?(proctorVideo?'720':(priorityVideo?'1080':(this.lowEnd?'480':'auto'))):this.receiveQuality;
    const data=await this.request('consume',{transportId:this.recvTransport.id,producerId,rtpCapabilities:this.device.rtpCapabilities,quality:requestedQuality});
    // A producer might have been closed while its consume request was still pending.
    if(this.closed||this.canceledProducers?.has(producerId)){
      await this.request('closeConsumer',{consumerId:data.id}).catch(()=>{});
      return;
    }
    const consumer=await this.recvTransport.consume(data);
    if(this.closed||this.canceledProducers?.has(producerId)){
      try{consumer.close()}catch{}
      await this.request('closeConsumer',{consumerId:data.id}).catch(()=>{});
      return;
    }
    if(meta.kind==='audio'){
      for(const [oldId,existing] of [...this.consumers]){
        const oldMeta=existing.appData?.meta;
        if(existing.kind==='audio'&&String(oldMeta?.peerId||'')===String(meta.peerId||'')&&oldId!==producerId)this.removeConsumer(oldId);
      }
      this.audioBin?.querySelectorAll('audio').forEach(a=>{
        if(a.dataset.peerId===String(meta.peerId||'')&&a.dataset.producerId!==producerId)this.disposeRemoteAudio(a);
      });
    }
    this.consumers.set(producerId,consumer);
    if(consumer.kind==='video'&&meta.appData?.role!=='teacher'&&meta.appData?.mediaTag!=='screen')this.studentVideoConsumers++;
    try{
      await this.attachRemote(consumer,meta);
      if(this.closed||this.canceledProducers?.has(producerId)){this.removeConsumer(producerId);return}
      await this.request('resumeConsumer',{consumerId:consumer.id}).catch(()=>{});
      consumer.on('transportclose',()=>this.removeConsumer(producerId));
      consumer.on('producerclose',()=>this.removeConsumer(producerId));
    }catch(e){this.removeConsumer(producerId);throw e}
  }
  disposeRemoteAudio(audio){
    if(!audio)return;
    try{audio.muted=true;audio.pause();audio.srcObject=null;audio.remove()}catch{}
  }
  async attachRemote(consumer,meta){
    const user=meta.user||{fullName:meta.peerName,role:meta.appData?.role},isScreen=meta.appData?.mediaTag==='screen',tileKey=isScreen?String(meta.peerId)+':screen':meta.peerId,tile=this.ensureTile(tileKey,isScreen?{...user,fullName:(user.fullName||user.login||'O‘qituvchi')+' · Ekran'}:user,false);
    if(consumer.kind==='audio'){
      const audio=el('audio',{autoplay:true,playsInline:true});audio.srcObject=new MediaStream([consumer.track]);audio.dataset.producerId=meta.producerId;audio.dataset.peerId=String(meta.peerId||'');audio.dataset.role=meta.appData?.role||meta.user?.role||'';audio.volume=this.computeRemoteAudioVolume(audio.dataset.role);this.audioBin.appendChild(audio);
      const mic=this.producers.get('mic'),active=Boolean(mic&&!mic.paused);
      if(active&&(this.proximityGuard||Date.now()<this.autoHalfDuplexUntil)){audio.muted=true;audio.volume=0;audio.dataset.hardMuted='1';audio.pause()}
      else audio.play().catch(()=>{this.audioNeedsUnlock=true;this.onState({audioBlocked:true})});
      this.updateParticipantCardMic(meta.peerId,true);return;
    }
    const video=qs('video',tile);video.srcObject=new MediaStream([consumer.track]);video.muted=true;tile.classList.add('has-video');this.updateParticipantCardCamera(meta.peerId,true);this.syncParticipantCardVideo(meta.peerId);
    if(isScreen){
      tile.classList.add('screen-share');
      this.grid?.classList.add('screen-layout');

      const teacherTile=this.tiles.get(meta.peerId);if(teacherTile?.classList.contains('has-video'))teacherTile.classList.add('screen-camera-pip');
    }else if(user.role==='teacher'&&this.tiles.get(String(meta.peerId)+':screen'))tile.classList.add('screen-camera-pip');
    this.ensureInlineVideoStage();
    video.onloadedmetadata=()=>this.ensureInlineVideoStage();
  }
  async updateVisibility(){
    if(this.closed)return;const pause=document.hidden;
    if(pause&&this.producers.get('camera'))this.requestBackgroundPiP().catch(()=>{});
    if(!pause)this.restoreInlineCamera(true);
    for(const c of this.consumers.values())if(c.kind==='video'){try{if(pause&&!document.pictureInPictureElement){await this.request('pauseConsumer',{consumerId:c.id});c.pause()}else{await this.request('resumeConsumer',{consumerId:c.id});c.resume()}}catch{}}
    this.onState({background:pause});
  }
  closeConsumerByProducer(producerId){if(!producerId)return;this.canceledProducers||=new Set();this.canceledProducers.add(String(producerId));this.removeConsumer(String(producerId))}
  applyProducerState(data={}){
    if(data.mediaTag==='screen')return;
    const peerId=String(data.peerId||'');if(!peerId)return;
    if(data.kind==='audio'){this.updateParticipantCardMic(peerId,!data.paused);return}
    if(data.kind!=='video')return;
    const tile=this.participantTile(peerId);if(tile)tile.classList.toggle('has-video',!data.paused&&Boolean(qs('video',tile)?.srcObject));
    this.updateParticipantCardCamera(peerId,!data.paused);
    this.ensureInlineVideoStage();
  }
  removeConsumer(producerId){
    const c=this.consumers.get(producerId);if(!c)return;const meta=c.appData?.meta;
    try{c.close()}catch{};this.consumers.delete(producerId);
    if(!this.closed&&this.socket&&c.id)this.request('closeConsumer',{consumerId:c.id}).catch(()=>{});
    this.audioBin?.querySelectorAll('audio').forEach(a=>{if(a.dataset.producerId===producerId)this.disposeRemoteAudio(a)});
    if(c.kind==='audio')this.updateParticipantCardMic(meta?.peerId,false);
    if(c.kind==='video'&&meta?.appData?.mediaTag!=='screen'&&meta?.mediaTag!=='screen')this.updateParticipantCardCamera(meta?.peerId,false);
    if(meta?.appData?.mediaTag==='screen'||meta?.mediaTag==='screen'){
      const key=String(meta.peerId||'')+':screen',tile=this.tiles.get(key);if(tile){tile.remove();this.tiles.delete(key)}
      this.tiles.get(meta.peerId)?.classList.remove('screen-camera-pip');
      if(!this.grid?.querySelector('.screen-share')){
        this.grid?.classList.remove('screen-layout');
      }
    }
    this.ensureInlineVideoStage();
  }
  removePeerTile(peerId){for(const [producerId,consumer] of [...this.consumers]){if(String(consumer.appData?.meta?.peerId||'')===String(peerId))this.removeConsumer(producerId)}this.audioBin?.querySelectorAll('audio').forEach(a=>{if(a.dataset.peerId===String(peerId))this.disposeRemoteAudio(a)});for(const [key,t] of [...this.tiles]){if(String(key)===String(peerId)||String(key).startsWith(String(peerId)+':')){t.remove();this.tiles.delete(key)}}const card=this.participantCards.get(String(peerId));if(card){card.remove();this.participantCards.delete(String(peerId))}this.participantMediaState.delete(String(peerId));if(String(this.selectedStagePeerId)===String(peerId)){this.selectedStagePeerId='';const next=[...this.participantCards.keys()][0];if(next)this.selectStagePeer(next,false)}if(!this.grid?.querySelector('.screen-share'))this.grid?.classList.remove('screen-layout')}
  speakerTile(peerId){
    if(String(peerId||'')===String(this.room?.peerId||''))return this.tiles.get('local');
    return this.tiles.get(peerId);
  }
  applyAudioLevels(levels){
    this.tiles.forEach(t=>t.classList.remove('speaking'));this.participantCards.forEach(c=>c.classList.remove('speaking'));
    const valid=(levels||[]).filter(x=>Number.isFinite(Number(x.volume))).sort((a,b)=>Number(b.volume)-Number(a.volume));
    for(const x of valid.slice(0,3)){const t=this.speakerTile(x.peerId);if(t)t.classList.add('speaking');this.participantCards.get(String(x.peerId||''))?.classList.add('speaking')}
    const speakingUserIds=[...new Set(valid.slice(0,3).map(x=>{
      const t=this.speakerTile(x.peerId);return String(t?.dataset.userId||'');
    }).filter(Boolean))];
    const speakingKey=speakingUserIds.sort().join(',');
    if(speakingKey!==this.lastRailSpeakingKey){this.lastRailSpeakingKey=speakingKey;this.onState({speakingUserIds})}
    if(this.viewMode==='gallery'||this.grid?.classList.contains('screen-layout')||this.grid?.classList.contains('has-focus'))return;
    const strongest=valid[0],peer=String(strongest?.peerId||''),now=Date.now();
    if(!peer){this.activeSpeakerCandidate='';return}
    if(peer!==this.activeSpeakerCandidate){this.activeSpeakerCandidate=peer;this.activeSpeakerCandidateAt=now;return}
    if(now-this.activeSpeakerCandidateAt<2200)return;
    if(peer===this.activeSpeakerPeer)return;
    if(now-this.activeSpeakerChangedAt<5000)return;
    this.activeSpeakerPeer=peer;this.activeSpeakerChangedAt=now;
    for(const t of this.tiles.values())t.classList.remove('active-speaker');
    const active=this.speakerTile(peer);if(active)active.classList.add('active-speaker');
    this.onState({activeSpeakerPeerId:peer});
  }
  installAudioUnlock(){
    if(this.audioUnlockInstalled)return;this.audioUnlockInstalled=true;
    this.audioUnlockHandler=()=>{const mic=this.producers.get('mic'),active=Boolean(mic&&!mic.paused);this.audioBin?.querySelectorAll('audio').forEach(a=>{if(!(active&&(this.proximityGuard||Date.now()<this.autoHalfDuplexUntil))&&a.paused&&a.dataset.hardMuted!=='1')a.play().catch(()=>{})});this.audioNeedsUnlock=false;this.onState({audioBlocked:false})};
    document.addEventListener('pointerdown',this.audioUnlockHandler,{passive:true});
    document.addEventListener('keydown',this.audioUnlockHandler,{passive:true});
  }
  computeRemoteAudioVolume(role=''){
    const mic=this.producers.get('mic'),active=Boolean(mic&&!mic.paused),now=Date.now(),risk=now<this.feedbackRiskUntil,safe=now<this.feedbackSafeUntil,warm=now<this.micWarmupUntil;
    if(risk)return 0;
    if(!this.echoGuard)return 1;
    if(active&&warm)return role==='teacher' ? .36 : .28;
    if(active&&safe&&this.multiMicCount>=2)return role==='teacher' ? .52 : .42;
    if(active&&safe)return role==='teacher' ? .58 : .48;
    if(active&&this.multiMicCount>=2)return role==='teacher' ? .62 : .52;
    if(active)return role==='teacher' ? .56 : .48;
    return role==='teacher' ? .95 : .90;
  }
  refreshRemoteAudioVolume(){
    const mic=this.producers.get('mic'),active=Boolean(mic&&!mic.paused),now=Date.now(),hardStop=now<this.feedbackRiskUntil||(active&&(this.proximityGuard||now<this.autoHalfDuplexUntil));
    this.audioBin?.querySelectorAll('audio').forEach(a=>{
      if(hardStop){try{a.muted=true;a.volume=0;a.pause()}catch{};a.dataset.hardMuted='1';return}
      try{a.muted=false;a.volume=this.computeRemoteAudioVolume(a.dataset.role||'');a.dataset.hardMuted='0';if(a.paused)a.play().catch(()=>{this.audioNeedsUnlock=true;this.onState({audioBlocked:true})})}catch{}
    });
  }
  triggerFeedbackGuard(ms=3000,severe=false,freq=0){
    const now=Date.now(),hardCutMs=severe?720:420;
    if(now<(this.lastFeedbackGuardAt||0)+220)return;
    this.lastFeedbackGuardAt=now;this.feedbackRiskUntil=Math.max(this.feedbackRiskUntil,now+hardCutMs);
    if(severe){this.feedbackSafeUntil=Math.max(this.feedbackSafeUntil,now+60000);this.enterAutomaticHalfDuplex(60000)}
    if(freq)this.tuneFeedbackNotches(freq);
    this.applyFastFeedbackGate(severe);
    this.audioBin?.querySelectorAll('audio').forEach(a=>{try{a.muted=true;a.volume=0;a.pause();a.dataset.hardMuted='1'}catch{}});
    clearTimeout(this.feedbackAudioResumeTimer);
    this.feedbackAudioResumeTimer=setTimeout(()=>this.refreshRemoteAudioVolume(),hardCutMs+90);
    clearTimeout(this.feedbackGuardTimer);
    this.feedbackGuardTimer=setTimeout(()=>{this.setMicGuardGain(.50,.26);this.refreshRemoteAudioVolume();this.onState({feedbackGuard:false,halfDuplex:false})},Math.min(4200,Math.max(1800,Number(ms)||3000)));
    this.onState({feedbackGuard:true,severeFeedback:Boolean(severe),feedbackFrequency:Math.round(Number(freq)||0),halfDuplex:true});
  }
  hasActiveMicrophone(){
    const mic=this.producers.get('mic');return Boolean(mic&&!mic.paused&&mic.track?.enabled!==false);
  }
  engageCoordinatedFeedbackGuard(ms=120000,freq=0){
    if(!this.echoGuard||!this.hasActiveMicrophone())return false;
    const now=Date.now(),duration=Math.max(15000,Math.min(600000,Number(ms)||120000)),hardCutMs=820;
    this.feedbackRiskUntil=Math.max(this.feedbackRiskUntil,now+hardCutMs);
    this.feedbackSafeUntil=Math.max(this.feedbackSafeUntil,now+duration);
    if(freq)this.tuneFeedbackNotches(freq);
    this.enterAutomaticHalfDuplex(duration);
    this.applyFastFeedbackGate(true);
    this.audioBin?.querySelectorAll('audio').forEach(a=>{try{a.muted=true;a.volume=0;a.pause();a.dataset.hardMuted='1'}catch{}});
    clearTimeout(this.feedbackAudioResumeTimer);
    this.feedbackAudioResumeTimer=setTimeout(()=>{this.refreshRemoteAudioVolume();this.onState({feedbackGuard:false,halfDuplex:false,feedbackSafe:true})},hardCutMs+100);
    clearTimeout(this.coordinatedFeedbackTimer);
    this.coordinatedFeedbackTimer=setTimeout(()=>{
      this.setMicGuardGain(.50,.38);this.refreshRemoteAudioVolume();
      this.onState({feedbackGuard:false,coordinatedFeedback:false,feedbackSafe:false,halfDuplex:false});
    },duration+180);
    this.onState({feedbackGuard:true,severeFeedback:true,coordinatedFeedback:true,feedbackSafe:true,feedbackFrequency:Math.round(Number(freq)||0),halfDuplex:true});
    return true;
  }
  clearFeedbackProtection(){
    this.feedbackRiskUntil=0;this.feedbackToneSince=0;
    clearTimeout(this.feedbackGuardTimer);clearTimeout(this.coordinatedFeedbackTimer);clearTimeout(this.feedbackAudioResumeTimer);
    this.setMicGuardGain(.50,.18);this.refreshRemoteAudioVolume();
    this.onState({feedbackGuard:false,coordinatedFeedback:false,severeFeedback:false,halfDuplex:false,feedbackSafe:Date.now()<this.feedbackSafeUntil});
  }
  enterAutomaticHalfDuplex(duration=60000){
    const now=Date.now(),ms=Math.max(12000,Math.min(120000,Number(duration)||60000));
    this.autoHalfDuplexUntil=Math.max(this.autoHalfDuplexUntil,now+ms);
    this.refreshRemoteAudioVolume();
    clearTimeout(this.autoFeedbackResumeTimer);
    const until=this.autoHalfDuplexUntil;
    this.autoFeedbackResumeTimer=setTimeout(()=>{
      if(this.closed||Date.now()<until-100)return;
      this.autoHalfDuplexUntil=0;this.refreshRemoteAudioVolume();
      this.onState({autoHalfDuplex:false,feedbackSafe:false});
    },Math.max(1000,until-now)+150);
    this.onState({autoHalfDuplex:true,feedbackSafe:true});
  }
  setProximityGuard(value){
    this.proximityGuard=Boolean(value);
    localStorage.setItem('m2-proximity-guard',this.proximityGuard?'1':'0');
    this.refreshRemoteAudioVolume();
    this.onState({proximityGuard:this.proximityGuard,halfDuplex:this.proximityGuard});
    return this.proximityGuard;
  }
   setEchoGuard(){
    this.echoGuard=true;localStorage.setItem('m2-echo-guard','1');this.refreshRemoteAudioVolume();this.onState({echoGuard:true});
    return true;
  }
  async setReceiveQuality(value){
    const allowed=['auto','240','360','480','720','1080'];this.receiveQuality=allowed.includes(String(value))?String(value):'auto';localStorage.setItem('m2-video-quality',this.receiveQuality);
    for(const c of this.consumers.values())if(c.kind==='video'){try{await this.request('setConsumerQuality',{consumerId:c.id,quality:this.receiveQuality})}catch{}}
    this.onState({videoQuality:this.receiveQuality});
  }
  async togglePiP(){
    const tile=this.tiles.get('local');
    const video=tile?qs('video',tile):null;
    if(!video||!video.srcObject)return {active:false,reason:'camera-off'};
    if(document.pictureInPictureElement){
      try{await document.exitPictureInPicture();return {active:false,native:true}}catch{}
    }
    if(document.pictureInPictureEnabled&&typeof video.requestPictureInPicture==='function'){
      try{
        await video.play().catch(()=>{});
        await video.requestPictureInPicture();
        return {active:true,native:true};
      }catch{}
    }
    const next=!tile.classList.contains('floating-pip');
    tile.classList.toggle('floating-pip',next);
    this.grid?.classList.toggle('has-floating-pip',next);
    return {active:next,native:false};
  }
  disablePiP(){
    const tile=this.tiles.get('local'),video=tile?qs('video',tile):null;
    tile?.classList.remove('floating-pip');
    this.grid?.classList.remove('has-floating-pip');
    this.automaticPiP=false;
    if(video&&document.pictureInPictureElement===video)document.exitPictureInPicture().catch(()=>{});
  }
  async close(){
    if(this.closed)return;this.disablePiP();this.closed=true;
    if(this.audioUnlockHandler){document.removeEventListener('pointerdown',this.audioUnlockHandler);document.removeEventListener('keydown',this.audioUnlockHandler);this.audioUnlockHandler=null;this.audioUnlockInstalled=false}
    try{this.socket.emit('media:request',{id:'close-'+Date.now(),method:'leave',data:{}})}catch{}
    this.socket.off('media:response',this.boundResponse);this.socket.off('media:event',this.boundEvent);document.removeEventListener('visibilitychange',this.visibilityHandler);
    clearInterval(this.stageRefreshTimer);this.stageRefreshTimer=null;
    this.stopFeedbackMonitor();clearTimeout(this.autoFeedbackResumeTimer);try{this.localMicRawTrack?.stop()}catch{};this.localMicRawTrack=null;clearTimeout(this.feedbackGuardTimer);clearTimeout(this.coordinatedFeedbackTimer);clearTimeout(this.feedbackAudioResumeTimer);clearTimeout(this.cameraRecoveryTimer);for(const timer of this.transportRecoveryTimers.values())clearTimeout(timer);this.transportRecoveryTimers.clear();try{this.micAudioChain?.rawTrack?.stop()}catch{};this.micAudioChain=null;
    for(const p of this.producers.values()){try{p.track?.stop()}catch{}try{p.close()}catch{}}
    for(const c of this.consumers.values())try{c.close()}catch{}
    this.audioBin?.querySelectorAll('audio').forEach(a=>this.disposeRemoteAudio(a));this.consuming?.clear();this.audioPeerPending?.clear();this.canceledProducers?.clear();
    try{await this.audioCtx?.close()}catch{};this.audioCtx=null;
    try{this.sendTransport?.close()}catch{};try{this.recvTransport?.close()}catch{}
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Media xona yopildi'))}this.pending.clear();
    this.syncStandaloneCameraStage(false);
    if(this.mount)this.mount.innerHTML='';
  }
}
