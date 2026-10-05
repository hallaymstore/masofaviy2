import { Device } from 'mediasoup-client';

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
  constructor({socket,joinPayload,mount,user,lowEnd=false,onState=()=>{},onError=()=>{}}){
    this.socket=socket;this.joinPayload=joinPayload;this.mount=mount;this.user=user;this.onState=onState;this.onError=onError;
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection,weakNet=Boolean(conn?.saveData)||/2g|3g/.test(String(conn?.effectiveType||''));
    const mem=Number(navigator.deviceMemory||0),cores=Number(navigator.hardwareConcurrency||0),androidMajor=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
    this.ultraLite=Boolean((mem&&mem<=2)||(cores&&cores<=2)||(androidMajor&&androidMajor<=8));
    this.lowEnd=Boolean(lowEnd||this.ultraLite||weakNet||(mem&&mem<=4)||(cores&&cores<=4));
    this.mediaProfile=joinPayload?.mediaProfile||'standard';this.device=null;this.sendTransport=null;this.recvTransport=null;this.producers=new Map();this.consumers=new Map();this.tiles=new Map();this.pending=new Map();this.closed=false;
    this.maxStudentVideos=this.ultraLite?0:(this.lowEnd?1:6);this.studentVideoConsumers=0;this.receiveQuality=this.ultraLite?'240':(localStorage.getItem('m2-video-quality')||'auto');this.echoGuard=localStorage.getItem('m2-echo-guard')!=='0';this.viewMode=this.ultraLite?'speaker':(localStorage.getItem('m2-view-mode')||'speaker');this.lowBandwidthMode=this.ultraLite||localStorage.getItem('m2-low-bandwidth')==='1';this.facingMode=localStorage.getItem('m2-facing-mode')||'user';this.pinnedUserId='';this.boundResponse=m=>this.handleResponse(m);this.boundEvent=m=>this.handleEvent(m);this.visibilityHandler=()=>this.updateVisibility();
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
    if(msg.event==='newProducer')this.maybeConsume(msg.data).catch(this.onError);
    else if(msg.event==='producerClosed')this.closeConsumerByProducer(msg.data?.producerId);
    else if(msg.event==='peerLeft')this.removePeerTile(msg.data?.peerId);
    else if(msg.event==='audioLevels'){const levels=msg.data?.levels||[];this.applyAudioLevels(levels);if(!levels.length)this.grid?.classList.remove('speaker-layout')}
    else if(msg.event==='roomState')this.onState(msg.data||{});
  }
  getPreferredConstraints(kind,{ignoreDevice=false}={}){
    const key=kind==='audio'?'m2-preferred-mic':'m2-preferred-camera',id=ignoreDevice?'':localStorage.getItem(key);
    if(kind==='audio'){
      const a=this.ultraLite?{echoCancellation:{ideal:true},noiseSuppression:{ideal:false},autoGainControl:{ideal:true},channelCount:{ideal:1,max:1},sampleRate:{ideal:24000,max:32000},sampleSize:{ideal:16}}:{echoCancellation:{ideal:true},noiseSuppression:{ideal:true},autoGainControl:{ideal:true},channelCount:{ideal:1,max:1},sampleRate:{ideal:48000},sampleSize:{ideal:16}};
      return id?{deviceId:{ideal:id},...a}:a;
    }
    const lite=this.lowEnd||this.mediaProfile==='lecture-lite';
    const video=this.ultraLite
      ?{width:{ideal:320,max:426},height:{ideal:180,max:240},frameRate:{ideal:10,max:12},facingMode:{ideal:this.facingMode}}
      :(lite?{width:{ideal:640,max:960},height:{ideal:360,max:540},frameRate:{ideal:15,max:20},facingMode:{ideal:this.facingMode}}:{width:{ideal:1280,max:1920},height:{ideal:720,max:1080},frameRate:{ideal:24,max:30},facingMode:{ideal:this.facingMode}});
    return id?{deviceId:{ideal:id},...video}:video;
  }
  async getMediaOnce(kind){
    const key=kind==='audio'?'m2-preferred-mic':'m2-preferred-camera';
    const first=kind==='audio'?{audio:this.getPreferredConstraints('audio'),video:false}:{audio:false,video:this.getPreferredConstraints('video')};
    try{return await navigator.mediaDevices.getUserMedia(first)}
    catch(e){
      if(['OverconstrainedError','NotFoundError','DevicesNotFoundError'].includes(e?.name)){
        localStorage.removeItem(key);
        const fallback=kind==='audio'?{audio:this.getPreferredConstraints('audio',{ignoreDevice:true}),video:false}:{audio:false,video:this.getPreferredConstraints('video',{ignoreDevice:true})};
        return navigator.mediaDevices.getUserMedia(fallback);
      }
      throw e;
    }
  }
  async connect(){
    const joined=await this.request('join',{ticket:this.joinPayload.mediaTicket});
    this.room=joined.room;this.mediaProfile=joined.mediaProfile||this.joinPayload.mediaProfile||'standard';this.device=new Device();await this.device.load({routerRtpCapabilities:joined.routerRtpCapabilities});
    this.renderShell();
    this.mount.classList.toggle('ultra-lite-media',this.ultraLite);this.mount.classList.toggle('low-end-media',this.lowEnd);
    await this.createTransports();
    this.onState({mic:false,camera:false,studentMediaLocked:false,viewMode:this.viewMode,lowBandwidth:this.lowBandwidthMode});
    this.setViewMode(this.viewMode);
    if(this.lowBandwidthMode||this.ultraLite)await this.setReceiveQuality('240');
    this.installAudioUnlock();
    document.addEventListener('visibilitychange',this.visibilityHandler);
    for(const p of joined.producers||[])await this.maybeConsume(p);
    this.onState({connected:true,participants:joined.participants||[]});
    return joined;
  }
  async createTransports(){
    const send=await this.request('createTransport',{direction:'send'});
    this.sendTransport=this.device.createSendTransport({...send,iceServers:this.joinPayload.iceServers||[]});
    this.sendTransport.on('connect',async({dtlsParameters},cb,eb)=>{try{await this.request('connectTransport',{transportId:this.sendTransport.id,dtlsParameters});cb()}catch(e){eb(e)}});
    this.sendTransport.on('produce',async({kind,rtpParameters,appData},cb,eb)=>{try{const x=await this.request('produce',{transportId:this.sendTransport.id,kind,rtpParameters,appData});cb({id:x.id})}catch(e){eb(e)}});
    this.sendTransport.on('connectionstatechange',s=>{this.onState({transport:'send',state:s})});
    const recv=await this.request('createTransport',{direction:'recv'});
    this.recvTransport=this.device.createRecvTransport({...recv,iceServers:this.joinPayload.iceServers||[]});
    this.recvTransport.on('connect',async({dtlsParameters},cb,eb)=>{try{await this.request('connectTransport',{transportId:this.recvTransport.id,dtlsParameters});cb()}catch(e){eb(e)}});
    this.recvTransport.on('connectionstatechange',s=>{this.onState({transport:'recv',state:s})});
  }
  renderShell(){
    this.mount.innerHTML='';
    const grid=el('div',{className:'ms-grid'}),audioBin=el('div',{className:'ms-audio-bin'});
    this.mount.append(grid,audioBin);this.grid=grid;this.audioBin=audioBin;
    const local=this.ensureTile('local',{fullName:this.user.fullName||this.user.login,role:this.user.role},true);local.classList.add('local');
  }
  ensureTile(peerId,user={},local=false){
    if(this.tiles.has(peerId))return this.tiles.get(peerId);
    const tile=el('div',{className:'ms-tile',dataset:{peerId,role:user.role||'',userId:user._id||user.id||''}});tile.classList.toggle('role-teacher',user.role==='teacher');tile.classList.toggle('role-student',user.role==='student');
    const video=el('video',{autoplay:true,playsInline:true,muted:local});video.className='ms-video';
    const avatar=el('div',{className:'ms-avatar'});avatar.textContent=(user.fullName||user.login||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    const label=el('div',{className:'ms-label'});label.innerHTML='<b></b><span></span>';qs('b',label).textContent=user.fullName||user.login||'Ishtirokchi';qs('span',label).textContent=user.role||'';
    const mic=el('span',{className:'ms-mic'});mic.textContent='●';
    tile.title='Bosib kattalashtirish';
    tile.addEventListener('click',()=>{
      if(this.viewMode==='gallery')return;
      const focused=tile.classList.contains('focused');
      for(const x of this.tiles.values())x.classList.remove('focused');
      this.grid.classList.toggle('has-focus',!focused);
      if(!focused)tile.classList.add('focused');
    });
    tile.addEventListener('dblclick',()=>this.pinUser(tile.dataset.userId||'',tile.dataset.peerId));
    this.installPinchZoom(tile,video);
    tile.append(video,avatar,label,mic);this.grid.appendChild(tile);this.tiles.set(peerId,tile);return tile;
  }
  setViewMode(mode){
    this.viewMode=mode==='gallery'?'gallery':'speaker';localStorage.setItem('m2-view-mode',this.viewMode);
    this.grid?.classList.toggle('gallery-view',this.viewMode==='gallery');
    this.grid?.classList.toggle('speaker-view',this.viewMode==='speaker');
    if(this.viewMode==='gallery'){this.grid?.classList.remove('speaker-layout');for(const t of this.tiles.values())t.classList.remove('active-speaker','speaker-side')}
    this.onState({viewMode:this.viewMode});return this.viewMode;
  }
  pinUser(userId='',peerId=''){
    const target=[...this.tiles.values()].find(t=>(userId&&t.dataset.userId===String(userId))||(peerId&&t.dataset.peerId===String(peerId)));
    for(const t of this.tiles.values())t.classList.remove('pinned','focused');
    if(!target){this.pinnedUserId='';this.grid?.classList.remove('has-focus');this.onState({pinnedUserId:''});return false}
    const already=this.pinnedUserId&&(target.dataset.userId===this.pinnedUserId||target.dataset.peerId===this.pinnedUserId);
    if(already){this.pinnedUserId='';this.grid?.classList.remove('has-focus');this.onState({pinnedUserId:''});return false}
    target.classList.add('pinned','focused');this.grid?.classList.add('has-focus');this.pinnedUserId=target.dataset.userId||target.dataset.peerId;this.onState({pinnedUserId:this.pinnedUserId});return true;
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
    if(!video||!video.srcObject||document.pictureInPictureElement)return false;
    if(document.pictureInPictureEnabled&&typeof video.requestPictureInPicture==='function'){try{await video.play().catch(()=>{});await video.requestPictureInPicture();return true}catch{}}
    return false;
  }
  async startMicrophone(){
    if(this.mediaBusy?.mic)return false;
    this.mediaBusy=this.mediaBusy||{};this.mediaBusy.mic=true;this.onState({micBusy:true});
    try{
      const stream=await this.getMediaOnce('audio');
      const track=stream.getAudioTracks()[0];if(!track)throw new Error('Mikrofon trek topilmadi');
      const producer=await this.sendTransport.produce({track,codecOptions:{opusStereo:false,opusDtx:true,opusFec:true,opusMaxPlaybackRate:48000},appData:{mediaTag:'mic',role:this.user.role}});
      this.producers.set('mic',producer);producer.on('transportclose',()=>this.producers.delete('mic'));
      this.refreshRemoteAudioVolume();this.onState({mic:true});return true;
    }catch(e){
      const msg=e?.name==='NotAllowedError'?'Brauzerda mikrofon ruxsatini yoqing':(e?.message||'noma’lum xato');
      this.onError(new Error('Mikrofon ochilmadi: '+msg));this.onState({mic:false});return false;
    }finally{this.mediaBusy.mic=false;this.onState({micBusy:false})}
  }
  async toggleMic(){
    const p=this.producers.get('mic');
    if(!p)return this.startMicrophone();
    if(p.paused){p.resume();p.track.enabled=true;await this.request('resumeProducer',{producerId:p.id}).catch(()=>{});this.refreshRemoteAudioVolume();this.onState({mic:true});return true}
    p.pause();p.track.enabled=false;await this.request('pauseProducer',{producerId:p.id}).catch(()=>{});this.refreshRemoteAudioVolume();this.onState({mic:false});return false;
  }
  async toggleCamera(){
    const p=this.producers.get('camera');
    if(p){
      if(p.paused){p.resume();p.track.enabled=true;await this.request('resumeProducer',{producerId:p.id}).catch(()=>{});this.onState({camera:true});return true}
      p.pause();p.track.enabled=false;await this.request('pauseProducer',{producerId:p.id}).catch(()=>{});this.onState({camera:false});return false;
    }
    if(this.mediaBusy?.camera)return false;
    this.mediaBusy=this.mediaBusy||{};this.mediaBusy.camera=true;this.onState({cameraBusy:true});
    try{
      const stream=await this.getMediaOnce('video'),track=stream.getVideoTracks()[0];
      if(!track)throw new Error('Kamera trek topilmadi');
      const lite=this.lowEnd||this.mediaProfile==='lecture-lite',encodings=this.ultraLite?[{maxBitrate:180000,scaleResolutionDownBy:1,maxFramerate:10}]:(lite?[{maxBitrate:100000,scaleResolutionDownBy:4,maxFramerate:10},{maxBitrate:280000,scaleResolutionDownBy:2,maxFramerate:12},{maxBitrate:550000,scaleResolutionDownBy:1,maxFramerate:15}]:[{maxBitrate:180000,scaleResolutionDownBy:4,maxFramerate:15},{maxBitrate:700000,scaleResolutionDownBy:2,maxFramerate:24},{maxBitrate:2500000,scaleResolutionDownBy:1,maxFramerate:30}]);
      const producer=await this.sendTransport.produce({track,encodings,codecOptions:{videoGoogleStartBitrate:this.ultraLite?120:(lite?240:600)},appData:{mediaTag:'camera',role:this.user.role}});
      this.producers.set('camera',producer);this.attachLocalVideo(track);producer.on('trackended',()=>this.closeProducer('camera'));producer.on('transportclose',()=>this.producers.delete('camera'));this.onState({camera:true});return true;
    }catch(e){
      const msg=e?.name==='NotAllowedError'?'Brauzerda kamera ruxsatini yoqing':(e?.message||'noma’lum xato');
      this.onError(new Error('Kamera ochilmadi: '+msg));this.onState({camera:false});return false;
    }finally{this.mediaBusy.camera=false;this.onState({cameraBusy:false})}
  }
  attachLocalVideo(track){
    const tile=this.ensureTile('local',{fullName:this.user.fullName,role:this.user.role},true),video=qs('video',tile);video.srcObject=new MediaStream([track]);tile.classList.add('has-video');
  }
  async toggleScreen(){
    const p=this.producers.get('screen');
    if(p){await this.closeProducer('screen');this.onState({screen:false});return false}
    try{
      const lite=this.lowEnd||this.mediaProfile==='lecture-lite',stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:this.ultraLite?5:(lite?8:12),max:this.ultraLite?8:(lite?12:20)}},audio:false}),track=stream.getVideoTracks()[0];
      const producer=await this.sendTransport.produce({track,encodings:[{maxBitrate:this.ultraLite?450000:(lite?750000:2200000)}],appData:{mediaTag:'screen',role:this.user.role}});
      this.producers.set('screen',producer);
      const screenTile=this.ensureTile('local:screen',{fullName:(this.user.fullName||this.user.login)+' · Ekran',role:this.user.role},true);
      screenTile.classList.add('screen-share','local-screen','has-video');
      const screenVideo=qs('video',screenTile);screenVideo.srcObject=new MediaStream([track]);screenVideo.muted=true;
      this.grid?.classList.add('screen-layout');
      const cameraTile=this.tiles.get('local');if(cameraTile?.classList.contains('has-video'))cameraTile.classList.add('screen-camera-pip');
      producer.on('trackended',()=>this.closeProducer('screen'));producer.on('transportclose',()=>this.producers.delete('screen'));this.onState({screen:true});return true;
    }catch(e){if(e.name!=='NotAllowedError')this.onError(new Error('Ekran ulashilmadi: '+e.message));return false}
  }
  async closeProducer(tag){
    const p=this.producers.get(tag);if(!p)return;
    try{await this.request('closeProducer',{producerId:p.id})}catch{}
    try{p.close()}catch{};try{p.track?.stop()}catch{};this.producers.delete(tag);
    if(tag==='camera'){const tile=this.tiles.get('local');if(tile){const v=qs('video',tile);if(v)v.srcObject=null;tile.classList.remove('has-video','screen-camera-pip')}}
    if(tag==='screen'){const tile=this.tiles.get('local:screen');if(tile){tile.remove();this.tiles.delete('local:screen')}this.grid?.classList.remove('screen-layout');this.tiles.get('local')?.classList.remove('screen-camera-pip')}
  }
  shouldConsume(meta){
    if(meta.kind==='audio')return true;
    const tag=meta.appData?.mediaTag,role=meta.appData?.role;
    if(tag==='screen'||role==='teacher')return true;
    if(role==='student'){
      if(this.user.role==='student'&&this.ultraLite)return false;
      return this.user.role==='teacher'||this.studentVideoConsumers<this.maxStudentVideos;
    }
    return !this.ultraLite;
  }
  async maybeConsume(meta){
    if(!meta?.producerId||meta.peerId===this.room?.peerId||this.consumers.has(meta.producerId)||!this.shouldConsume(meta))return;
    const data=await this.request('consume',{transportId:this.recvTransport.id,producerId:meta.producerId,rtpCapabilities:this.device.rtpCapabilities,quality:this.receiveQuality==='auto'?(this.lowEnd?'240':'auto'):this.receiveQuality});
    const consumer=await this.recvTransport.consume(data);this.consumers.set(meta.producerId,consumer);
    if(consumer.kind==='video'&&meta.appData?.role!=='teacher'&&meta.appData?.mediaTag!=='screen')this.studentVideoConsumers++;
    await this.attachRemote(consumer,meta);
    await this.request('resumeConsumer',{consumerId:consumer.id}).catch(()=>{});
    consumer.on('transportclose',()=>this.removeConsumer(meta.producerId));consumer.on('producerclose',()=>this.removeConsumer(meta.producerId));
  }
  async attachRemote(consumer,meta){
    const user=meta.user||{fullName:meta.peerName,role:meta.appData?.role},isScreen=meta.appData?.mediaTag==='screen',tileKey=isScreen?String(meta.peerId)+':screen':meta.peerId,tile=this.ensureTile(tileKey,isScreen?{...user,fullName:(user.fullName||user.login||'O‘qituvchi')+' · Ekran'}:user,false);
    if(consumer.kind==='audio'){
      const audio=el('audio',{autoplay:true,playsInline:true});audio.srcObject=new MediaStream([consumer.track]);audio.dataset.producerId=meta.producerId;audio.dataset.role=meta.appData?.role||meta.user?.role||'';audio.volume=audio.dataset.role==='teacher'?1:(this.echoGuard?(this.producers.get('mic')&&!this.producers.get('mic').paused?0.72:0.9):1);this.audioBin.appendChild(audio);audio.play().catch(()=>{this.audioNeedsUnlock=true;this.onState({audioBlocked:true})});return;
    }
    const video=qs('video',tile);video.srcObject=new MediaStream([consumer.track]);video.muted=false;tile.classList.add('has-video');
    if(isScreen){
      tile.classList.add('screen-share');
      this.grid?.classList.add('screen-layout');

      const teacherTile=this.tiles.get(meta.peerId);if(teacherTile?.classList.contains('has-video'))teacherTile.classList.add('screen-camera-pip');
    }else if(user.role==='teacher'&&this.tiles.get(String(meta.peerId)+':screen'))tile.classList.add('screen-camera-pip');
  }
  async updateVisibility(){
    if(this.closed)return;const pause=document.hidden;
    if(pause&&this.producers.get('camera'))this.requestBackgroundPiP().catch(()=>{});
    for(const c of this.consumers.values())if(c.kind==='video'){try{if(pause&&!document.pictureInPictureElement){await this.request('pauseConsumer',{consumerId:c.id});c.pause()}else{await this.request('resumeConsumer',{consumerId:c.id});c.resume()}}catch{}}
    this.onState({background:pause});
  }
  closeConsumerByProducer(producerId){this.removeConsumer(producerId)}
  removeConsumer(producerId){
    const c=this.consumers.get(producerId);if(!c)return;const meta=c.appData?.meta;
    try{c.close()}catch{};this.consumers.delete(producerId);
    this.audioBin?.querySelectorAll('audio').forEach(a=>{if(a.dataset.producerId===producerId)a.remove()});
    if(meta?.appData?.mediaTag==='screen'||meta?.mediaTag==='screen'){
      const key=String(meta.peerId||'')+':screen',tile=this.tiles.get(key);if(tile){tile.remove();this.tiles.delete(key)}
      this.tiles.get(meta.peerId)?.classList.remove('screen-camera-pip');
      if(!this.grid?.querySelector('.screen-share')){
        this.grid?.classList.remove('screen-layout');

      }
    }
  }
  removePeerTile(peerId){for(const [key,t] of [...this.tiles]){if(String(key)===String(peerId)||String(key).startsWith(String(peerId)+':')){t.remove();this.tiles.delete(key)}}if(!this.grid?.querySelector('.screen-share'))this.grid?.classList.remove('screen-layout')}
  speakerTile(peerId){
    if(String(peerId||'')===String(this.room?.peerId||''))return this.tiles.get('local');
    return this.tiles.get(peerId);
  }
  applyAudioLevels(levels){
    this.tiles.forEach(t=>t.classList.remove('speaking','active-speaker','speaker-side'));
    const valid=(levels||[]).filter(x=>Number.isFinite(Number(x.volume))).sort((a,b)=>Number(b.volume)-Number(a.volume));
    for(const x of valid){const t=this.speakerTile(x.peerId);if(t)t.classList.add('speaking')}
    if(this.viewMode==='gallery'||this.grid?.classList.contains('screen-layout')||this.grid?.classList.contains('has-focus'))return;
    const strongest=valid[0],main=strongest?this.speakerTile(strongest.peerId):null;
    if(main){
      main.classList.add('active-speaker');
      this.grid?.classList.add('speaker-layout');
      for(const t of this.tiles.values())if(t!==main&&t.classList.contains('role-teacher')&&t.classList.contains('has-video'))t.classList.add('speaker-side');
    }else this.grid?.classList.remove('speaker-layout');
  }
  installAudioUnlock(){
    if(this.audioUnlockInstalled)return;this.audioUnlockInstalled=true;
    this.audioUnlockHandler=()=>{this.audioBin?.querySelectorAll('audio').forEach(a=>a.play().catch(()=>{}));this.audioNeedsUnlock=false;this.onState({audioBlocked:false})};
    document.addEventListener('pointerdown',this.audioUnlockHandler,{passive:true});
    document.addEventListener('keydown',this.audioUnlockHandler,{passive:true});
  }
  refreshRemoteAudioVolume(){
    const mic=this.producers.get('mic'),active=Boolean(mic&&!mic.paused);
    this.audioBin?.querySelectorAll('audio').forEach(a=>{a.volume=a.dataset.role==='teacher'?1:(this.echoGuard?(active?0.72:0.9):1);a.play().catch(()=>{})});
  }
  setEchoGuard(enabled){
    this.echoGuard=Boolean(enabled);localStorage.setItem('m2-echo-guard',this.echoGuard?'1':'0');this.refreshRemoteAudioVolume();this.onState({echoGuard:this.echoGuard});
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
    const tile=this.tiles.get('local');
    tile?.classList.remove('floating-pip');
    this.grid?.classList.remove('has-floating-pip');
    if(document.pictureInPictureElement)document.exitPictureInPicture().catch(()=>{});
  }
  async close(){
    if(this.closed)return;this.disablePiP();this.closed=true;
    if(this.audioUnlockHandler){document.removeEventListener('pointerdown',this.audioUnlockHandler);document.removeEventListener('keydown',this.audioUnlockHandler);this.audioUnlockHandler=null;this.audioUnlockInstalled=false}
    try{this.socket.emit('media:request',{id:'close-'+Date.now(),method:'leave',data:{}})}catch{}
    this.socket.off('media:response',this.boundResponse);this.socket.off('media:event',this.boundEvent);document.removeEventListener('visibilitychange',this.visibilityHandler);
    for(const p of this.producers.values()){try{p.track?.stop()}catch{}try{p.close()}catch{}}
    for(const c of this.consumers.values())try{c.close()}catch{}
    try{this.sendTransport?.close()}catch{};try{this.recvTransport?.close()}catch{}
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Media xona yopildi'))}this.pending.clear();
    if(this.mount)this.mount.innerHTML='';
  }
}
