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
    this.lowEnd=Boolean(lowEnd||weakNet||(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4));
    this.mediaProfile=joinPayload?.mediaProfile||'standard';this.device=null;this.sendTransport=null;this.recvTransport=null;this.producers=new Map();this.consumers=new Map();this.tiles=new Map();this.pending=new Map();this.closed=false;
    this.maxStudentVideos=this.lowEnd?2:6;this.studentVideoConsumers=0;this.boundResponse=m=>this.handleResponse(m);this.boundEvent=m=>this.handleEvent(m);this.visibilityHandler=()=>this.updateVisibility();
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
    else if(msg.event==='audioLevels')this.applyAudioLevels(msg.data?.levels||[]);
    else if(msg.event==='roomState')this.onState(msg.data||{});
  }
  getPreferredConstraints(kind){
    const key=kind==='audio'?'m2-preferred-mic':'m2-preferred-camera',id=localStorage.getItem(key);
    if(kind==='audio')return id?{deviceId:{exact:id},echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:{ideal:1}}:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:{ideal:1}};
    const lite=this.lowEnd||this.mediaProfile==='lecture-lite',video=lite?{width:{ideal:640,max:640},height:{ideal:360,max:360},frameRate:{ideal:15,max:18}}:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:24,max:30}};
    return id?{deviceId:{exact:id},...video}:video;
  }
  async connect(){
    const joined=await this.request('join',{ticket:this.joinPayload.mediaTicket});
    this.room=joined.room;this.mediaProfile=joined.mediaProfile||this.joinPayload.mediaProfile||'standard';this.device=new Device();await this.device.load({routerRtpCapabilities:joined.routerRtpCapabilities});
    this.renderShell();
    await this.createTransports();
    if(!(this.mediaProfile==='lecture-lite'&&this.user.role==='student'))await this.startMicrophone();else this.onState({mic:false,lectureLite:true,audioSlots:joined.limits?.studentAudioSlots||4});
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
    this.sendTransport.on('connectionstatechange',s=>{if(['failed','disconnected'].includes(s))this.onState({transport:'send',state:s})});
    const recv=await this.request('createTransport',{direction:'recv'});
    this.recvTransport=this.device.createRecvTransport({...recv,iceServers:this.joinPayload.iceServers||[]});
    this.recvTransport.on('connect',async({dtlsParameters},cb,eb)=>{try{await this.request('connectTransport',{transportId:this.recvTransport.id,dtlsParameters});cb()}catch(e){eb(e)}});
    this.recvTransport.on('connectionstatechange',s=>{if(['failed','disconnected'].includes(s))this.onState({transport:'recv',state:s})});
  }
  renderShell(){
    this.mount.innerHTML='';
    const grid=el('div',{className:'ms-grid'}),audioBin=el('div',{className:'ms-audio-bin'});
    this.mount.append(grid,audioBin);this.grid=grid;this.audioBin=audioBin;
    const local=this.ensureTile('local',{fullName:this.user.fullName||this.user.login,role:this.user.role},true);local.classList.add('local');
  }
  ensureTile(peerId,user={},local=false){
    if(this.tiles.has(peerId))return this.tiles.get(peerId);
    const tile=el('div',{className:'ms-tile',dataset:{peerId}});
    const video=el('video',{autoplay:true,playsInline:true,muted:local});video.className='ms-video';
    const avatar=el('div',{className:'ms-avatar'});avatar.textContent=(user.fullName||user.login||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    const label=el('div',{className:'ms-label'});label.innerHTML='<b></b><span></span>';qs('b',label).textContent=user.fullName||user.login||'Ishtirokchi';qs('span',label).textContent=user.role||'';
    const mic=el('span',{className:'ms-mic'});mic.textContent='●';
    tile.append(video,avatar,label,mic);this.grid.appendChild(tile);this.tiles.set(peerId,tile);return tile;
  }
  async startMicrophone(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:this.getPreferredConstraints('audio'),video:false});
      const track=stream.getAudioTracks()[0];if(!track)return;
      const producer=await this.sendTransport.produce({track,codecOptions:{opusStereo:false,opusDtx:true,opusFec:true,opusMaxPlaybackRate:16000},appData:{mediaTag:'mic',role:this.user.role}});
      this.producers.set('mic',producer);producer.on('transportclose',()=>this.producers.delete('mic'));
      this.onState({mic:true});
    }catch(e){this.onError(new Error('Mikrofon ochilmadi: '+e.message));this.onState({mic:false})}
  }
  async toggleMic(){
    const p=this.producers.get('mic');
    if(!p)return this.startMicrophone();
    if(p.paused){p.resume();p.track.enabled=true;await this.request('resumeProducer',{producerId:p.id}).catch(()=>{});this.onState({mic:true});return true}
    p.pause();p.track.enabled=false;await this.request('pauseProducer',{producerId:p.id}).catch(()=>{});this.onState({mic:false});return false;
  }
  async toggleCamera(){
    if(this.mediaProfile==='lecture-lite'&&this.user.role==='student'){this.onError(new Error('Yengil ma’ruza rejimida talabalar kamerasi o‘chiq'));return false}
    const p=this.producers.get('camera');
    if(p){
      if(p.paused){p.resume();p.track.enabled=true;await this.request('resumeProducer',{producerId:p.id}).catch(()=>{});this.onState({camera:true});return true}
      p.pause();p.track.enabled=false;await this.request('pauseProducer',{producerId:p.id}).catch(()=>{});this.onState({camera:false});return false;
    }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:this.getPreferredConstraints('video'),audio:false}),track=stream.getVideoTracks()[0];
      const lite=this.lowEnd||this.mediaProfile==='lecture-lite',encodings=lite?[{maxBitrate:120000,scaleResolutionDownBy:4},{maxBitrate:350000,scaleResolutionDownBy:2},{maxBitrate:700000,scaleResolutionDownBy:1}]:[{maxBitrate:150000,scaleResolutionDownBy:4},{maxBitrate:500000,scaleResolutionDownBy:2},{maxBitrate:1200000,scaleResolutionDownBy:1}];
      const producer=await this.sendTransport.produce({track,encodings,codecOptions:{videoGoogleStartBitrate:lite?300:600},appData:{mediaTag:'camera',role:this.user.role}});
      this.producers.set('camera',producer);this.attachLocalVideo(track);producer.on('trackended',()=>this.closeProducer('camera'));producer.on('transportclose',()=>this.producers.delete('camera'));this.onState({camera:true});return true;
    }catch(e){this.onError(new Error('Kamera ochilmadi: '+e.message));return false}
  }
  attachLocalVideo(track){
    const tile=this.ensureTile('local',{fullName:this.user.fullName,role:this.user.role},true),video=qs('video',tile);video.srcObject=new MediaStream([track]);tile.classList.add('has-video');
  }
  async toggleScreen(){
    const p=this.producers.get('screen');
    if(p){await this.closeProducer('screen');if(this.cameraPausedForScreen){const cam=this.producers.get('camera');if(cam){cam.resume();cam.track.enabled=true;await this.request('resumeProducer',{producerId:cam.id}).catch(()=>{})}this.cameraPausedForScreen=false}this.onState({screen:false});return false}
    try{
      const lite=this.lowEnd||this.mediaProfile==='lecture-lite',stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:lite?8:12,max:lite?12:20}},audio:false}),track=stream.getVideoTracks()[0];
      if(this.mediaProfile==='lecture-lite'){const cam=this.producers.get('camera');if(cam&&!cam.paused){cam.pause();cam.track.enabled=false;await this.request('pauseProducer',{producerId:cam.id}).catch(()=>{});this.cameraPausedForScreen=true}}
      const producer=await this.sendTransport.produce({track,encodings:[{maxBitrate:lite?700000:1800000}],appData:{mediaTag:'screen',role:this.user.role}});
      this.producers.set('screen',producer);producer.on('trackended',()=>this.closeProducer('screen'));producer.on('transportclose',()=>this.producers.delete('screen'));this.onState({screen:true});return true;
    }catch(e){if(e.name!=='NotAllowedError')this.onError(new Error('Ekran ulashilmadi: '+e.message));return false}
  }
  async closeProducer(tag){
    const p=this.producers.get(tag);if(!p)return;
    try{await this.request('closeProducer',{producerId:p.id})}catch{}
    try{p.close()}catch{};try{p.track?.stop()}catch{};this.producers.delete(tag);
    if(tag==='camera'){const tile=this.tiles.get('local');if(tile){const v=qs('video',tile);if(v)v.srcObject=null;tile.classList.remove('has-video')}}
  }
  shouldConsume(meta){
    if(meta.kind==='audio')return true;
    const tag=meta.appData?.mediaTag,role=meta.appData?.role;
    if(this.mediaProfile==='lecture-lite')return tag==='screen'||role==='teacher';
    if(tag==='screen'||role==='teacher')return true;
    if(this.user.role==='teacher')return this.studentVideoConsumers<(this.lowEnd?6:12);
    return this.studentVideoConsumers<this.maxStudentVideos;
  }
  async maybeConsume(meta){
    if(!meta?.producerId||meta.peerId===this.room?.peerId||this.consumers.has(meta.producerId)||!this.shouldConsume(meta))return;
    const data=await this.request('consume',{transportId:this.recvTransport.id,producerId:meta.producerId,rtpCapabilities:this.device.rtpCapabilities,quality:this.lowEnd?'low':'auto'});
    const consumer=await this.recvTransport.consume(data);this.consumers.set(meta.producerId,consumer);
    if(consumer.kind==='video'&&meta.appData?.role!=='teacher'&&meta.appData?.mediaTag!=='screen')this.studentVideoConsumers++;
    this.attachRemote(consumer,meta);
    await this.request('resumeConsumer',{consumerId:consumer.id}).catch(()=>{});
    consumer.on('transportclose',()=>this.removeConsumer(meta.producerId));consumer.on('producerclose',()=>this.removeConsumer(meta.producerId));
  }
  attachRemote(consumer,meta){
    const user=meta.user||{fullName:meta.peerName,role:meta.appData?.role},tile=this.ensureTile(meta.peerId,user,false);
    if(consumer.kind==='audio'){
      const audio=el('audio',{autoplay:true,playsInline:true});audio.srcObject=new MediaStream([consumer.track]);audio.dataset.producerId=meta.producerId;this.audioBin.appendChild(audio);return;
    }
    const video=qs('video',tile);video.srcObject=new MediaStream([consumer.track]);video.muted=false;tile.classList.add('has-video');
    if(meta.appData?.mediaTag==='screen')tile.classList.add('screen-share');
  }
  async updateVisibility(){
    if(this.closed)return;const pause=document.hidden;
    for(const c of this.consumers.values())if(c.kind==='video'){try{if(pause){await this.request('pauseConsumer',{consumerId:c.id});c.pause()}else{await this.request('resumeConsumer',{consumerId:c.id});c.resume()}}catch{}}
    this.onState({background:pause});
  }
  closeConsumerByProducer(producerId){this.removeConsumer(producerId)}
  removeConsumer(producerId){
    const c=this.consumers.get(producerId);if(!c)return;const meta=c.appData?.meta;
    try{c.close()}catch{};this.consumers.delete(producerId);
    this.audioBin?.querySelectorAll('audio').forEach(a=>{if(a.dataset.producerId===producerId)a.remove()});
  }
  removePeerTile(peerId){const t=this.tiles.get(peerId);if(t){t.remove();this.tiles.delete(peerId)}}
  applyAudioLevels(levels){
    this.tiles.forEach(t=>t.classList.remove('speaking'));
    for(const x of levels){const t=this.tiles.get(x.peerId);if(t)t.classList.add('speaking')}
  }
  async close(){
    if(this.closed)return;this.closed=true;
    try{this.socket.emit('media:request',{id:'close-'+Date.now(),method:'leave',data:{}})}catch{}
    this.socket.off('media:response',this.boundResponse);this.socket.off('media:event',this.boundEvent);document.removeEventListener('visibilitychange',this.visibilityHandler);
    for(const p of this.producers.values()){try{p.track?.stop()}catch{}try{p.close()}catch{}}
    for(const c of this.consumers.values())try{c.close()}catch{}
    try{this.sendTransport?.close()}catch{};try{this.recvTransport?.close()}catch{}
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Media xona yopildi'))}this.pending.clear();
    if(this.mount)this.mount.innerHTML='';
  }
}
