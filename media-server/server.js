import 'dotenv/config';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import * as mediasoup from 'mediasoup';
import { WebSocketServer } from 'ws';

const SIGNAL_PORT=Number(process.env.SIGNAL_PORT||40000);
const SIGNAL_IP=process.env.SIGNAL_IP||'127.0.0.1';
const RTC_LISTEN_IP=process.env.RTC_LISTEN_IP||process.env.LISTEN_IP||'0.0.0.0';
const ANNOUNCED_IP=process.env.ANNOUNCED_IP||'127.0.0.1';
const RTC_BASE_PORT=Number(process.env.RTC_BASE_PORT||50000);
const WORKERS=Math.max(1,Math.min(Number(process.env.MEDIASOUP_WORKERS||Math.max(1,Math.min(os.cpus().length,16))),32));
const ENABLE_RTC_TCP=process.env.ENABLE_RTC_TCP==='true';
const PLATFORM_VERIFY_URL=process.env.PLATFORM_VERIFY_URL||'http://127.0.0.1:3000/api/media/verify';
const SFU_BRIDGE_SECRET=String(process.env.SFU_BRIDGE_SECRET||'');
const MAX_PEERS_PER_ROOM=Math.max(2,Number(process.env.MAX_PEERS_PER_ROOM||120));
const MAX_TOTAL_PEERS=Math.max(MAX_PEERS_PER_ROOM,Number(process.env.MAX_TOTAL_PEERS||1500));
const MAX_ACTIVE_ROOMS=Math.max(1,Number(process.env.MAX_ACTIVE_ROOMS||60));
const TARGET_PARALLEL_ROOMS=Math.max(1,Number(process.env.TARGET_PARALLEL_ROOMS||50));
const SFU_NODE_ID=String(process.env.SFU_NODE_ID||os.hostname());
const MAX_ROOMS_PER_WORKER=Math.max(2,Number(process.env.MAX_ROOMS_PER_WORKER||8));
const TARGET_MIN_WORKERS=Math.max(1,Math.min(16,Number(process.env.TARGET_MIN_WORKERS||Math.ceil(TARGET_PARALLEL_ROOMS/7))));
const MAX_INCOMING_BITRATE=Math.max(200000,Number(process.env.MAX_INCOMING_BITRATE||1800000));
const TEACHER_MAX_INCOMING_BITRATE=Math.max(2500000,Number(process.env.TEACHER_MAX_INCOMING_BITRATE||4500000));
const STUDENT_MAX_INCOMING_BITRATE=Math.max(900000,Number(process.env.STUDENT_MAX_INCOMING_BITRATE||1800000));
const MIN_LECTURE_OUTGOING_BITRATE=Math.max(1200000,Number(process.env.MIN_LECTURE_OUTGOING_BITRATE||2200000));
const LECTURE_LITE_ENABLED=process.env.LECTURE_LITE_ENABLED!=='false';
const LECTURE_MAX_STUDENT_AUDIO=Math.max(1,Math.min(Number(process.env.LECTURE_MAX_STUDENT_AUDIO||6),12));
const STRICT_AUDIO_FLOOR=process.env.STRICT_AUDIO_FLOOR!=='false';
const LECTURE_INITIAL_OUTGOING_BITRATE=Math.max(400000,Number(process.env.LECTURE_INITIAL_OUTGOING_BITRATE||900000));

const mediaCodecs=[
  {kind:'audio',mimeType:'audio/opus',clockRate:48000,channels:2,parameters:{useinbandfec:1,minptime:10}},
  {kind:'video',mimeType:'video/VP8',clockRate:90000,parameters:{}},
  {kind:'video',mimeType:'video/H264',clockRate:90000,parameters:{'packetization-mode':1,'profile-level-id':'42e01f','level-asymmetry-allowed':1}}
];

const workers=[];
const rooms=new Map();
const peers=new Map();

function send(ws,msg){if(ws?.readyState===1)ws.send(JSON.stringify(msg))}
function reply(ws,clientId,id,ok,data,error){send(ws,{clientId,id,ok,data,error})}
function event(peer,name,data){send(peer.bridge,{clientId:peer.id,event:name,data})}
function broadcast(room,name,data,exceptPeerId=null){for(const p of room.peers.values())if(p.id!==exceptPeerId)event(p,name,data)}
function normalizeProfile(value){const p=String(value||'standard');return LECTURE_LITE_ENABLED&&p==='lecture-lite'?'lecture-lite':p==='seminar'?'seminar':'standard'}
function studentAudioCount(room){let n=0;for(const p of room.peers.values())if(p.user?.role==='student')for(const producer of p.producers.values())if(producer.kind==='audio'&&!producer.closed&&!producer.paused)n++;return n}
function clearAudioFloor(room,peerId='',producerId=''){
  if(!STRICT_AUDIO_FLOOR||!room?.audioFloor)return;
  if((peerId&&room.audioFloor.peerId!==peerId)||(producerId&&room.audioFloor.producerId!==producerId))return;
  room.audioFloor=null;broadcast(room,'audioFloor',{active:false});
}
function claimAudioFloor(room,peer,producerId){
  if(!STRICT_AUDIO_FLOOR)return;
  if(room.audioFloor&&room.audioFloor.peerId!==peer.id)throw new Error('Boshqa ishtirokchi gapiryapti. Mikrofon navbati bo‘shashishini kuting.');
  room.audioFloor={peerId:peer.id,producerId,user:peer.user,at:Date.now()};
  broadcast(room,'audioFloor',{active:true,peerId:peer.id,user:peer.user,at:room.audioFloor.at});
}
function roomState(room){return {roomId:room.id,profile:room.profile,participants:[...room.peers.values()].map(p=>({peerId:p.id,user:p.user})),count:room.peers.size,audioFloor:STRICT_AUDIO_FLOOR?(room.audioFloor||null):null,limits:{maxParticipants:room.maxParticipants,studentAudioSlots:STRICT_AUDIO_FLOOR?1:(room.profile==='lecture-lite'?LECTURE_MAX_STUDENT_AUDIO:null),studentAudioActive:studentAudioCount(room)}}}

async function verifyTicket(ticket){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    const r=await fetch(PLATFORM_VERIFY_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket}),signal:controller.signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data?.ok)throw new Error(data?.message||'Media ticket tasdiqlanmadi');
    return data.payload;
  }finally{clearTimeout(timer)}
}
function workerPeerCount(slot){let n=0;for(const r of rooms.values())if(r.workerSlot===slot)n+=r.peers.size;return n}
function chooseWorker(roomId){
  if(!workers.length)throw new Error('SFU worker mavjud emas');
  const available=workers.filter(w=>w.rooms<MAX_ROOMS_PER_WORKER);
  if(!available.length)throw new Error('SFU workerlar xona sig‘imiga yetdi');
  const seed=crypto.createHash('sha256').update(roomId).digest().readUInt32BE(0);
  return available.slice().sort((a,b)=>{
    const ar=a.rooms*10000+workerPeerCount(a)*10,br=b.rooms*10000+workerPeerCount(b)*10;
    if(ar!==br)return ar-br;
    return ((a.index-seed+workers.length)%workers.length)-((b.index-seed+workers.length)%workers.length);
  })[0];
}
async function getRoom(roomId,profile='standard',maxParticipants=MAX_PEERS_PER_ROOM){
  let room=rooms.get(roomId);if(room)return room;
  if(rooms.size>=MAX_ACTIVE_ROOMS)throw new Error('Parallel jonli xonalar limiti to‘lgan');
  const workerSlot=chooseWorker(roomId);
  const router=await workerSlot.worker.createRouter({mediaCodecs});
  const audioObserver=await router.createAudioLevelObserver({maxEntries:6,threshold:-55,interval:900});
  room={id:roomId,profile:normalizeProfile(profile),maxParticipants:Math.min(MAX_PEERS_PER_ROOM,Math.max(2,Number(maxParticipants)||MAX_PEERS_PER_ROOM)),router,workerSlot,peers:new Map(),audioObserver,audioFloor:null,createdAt:new Date()};
  rooms.set(roomId,room);workerSlot.rooms++;
  audioObserver.on('volumes',volumes=>{
    const levels=volumes.map(({producer,volume})=>({peerId:producer.appData?.peerId,producerId:producer.id,volume})).filter(x=>x.peerId);
    if(levels.length)broadcast(room,'audioLevels',{levels});
  });
  audioObserver.on('silence',()=>broadcast(room,'audioLevels',{levels:[]}));
  router.observer.on('close',()=>{rooms.delete(roomId);workerSlot.rooms=Math.max(0,workerSlot.rooms-1)});
  return room;
}
function serializeProducer(producer,owner){
  return {producerId:producer.id,peerId:owner.id,kind:producer.kind,appData:producer.appData,user:owner.user,peerName:owner.user?.fullName||owner.user?.login||'Ishtirokchi'};
}
function serializeTransport(t){
  return {id:t.id,iceParameters:t.iceParameters,iceCandidates:t.iceCandidates,dtlsParameters:t.dtlsParameters,sctpParameters:t.sctpParameters};
}
async function closePeer(clientId,notify=true){
  const peer=peers.get(clientId);if(!peer)return;
  peers.delete(clientId);const room=peer.room;
  if(room?.audioFloor?.peerId===peer.id)clearAudioFloor(room,peer.id);
  for(const producer of peer.producers.values())try{producer.close()}catch{}
  for(const consumer of peer.consumers.values())try{consumer.close()}catch{}
  for(const transport of peer.transports.values())try{transport.close()}catch{}
  room?.peers.delete(clientId);
  if(room&&notify){broadcast(room,'peerLeft',{peerId:clientId});broadcast(room,'roomState',roomState(room))}
  if(room&&room.peers.size===0){
    setTimeout(()=>{const current=rooms.get(room.id);if(current&&current.peers.size===0){try{current.router.close()}catch{}rooms.delete(room.id);current.workerSlot.rooms=Math.max(0,current.workerSlot.rooms-1)}},30000).unref?.();
  }
}
async function createTransport(peer,direction){
  const t=await peer.room.router.createWebRtcTransport({
    webRtcServer:peer.room.workerSlot.webRtcServer,
    enableUdp:true,
    enableTcp:ENABLE_RTC_TCP,
    preferUdp:true,
    enableSctp:true,
    numSctpStreams:{OS:1024,MIS:1024},
    initialAvailableOutgoingBitrate:peer.room.profile==='lecture-lite'?Math.max(LECTURE_INITIAL_OUTGOING_BITRATE,MIN_LECTURE_OUTGOING_BITRATE):Math.max(2200000,LECTURE_INITIAL_OUTGOING_BITRATE),
    appData:{peerId:peer.id,direction}
  });
  if(direction==='send'){
    const incoming=peer.user?.role==='teacher'?Math.max(MAX_INCOMING_BITRATE,TEACHER_MAX_INCOMING_BITRATE):Math.max(MAX_INCOMING_BITRATE,STUDENT_MAX_INCOMING_BITRATE);
    try{await t.setMaxIncomingBitrate(incoming)}catch{}
  }
  peer.transports.set(t.id,t);
  t.on('dtlsstatechange',state=>{if(state==='closed')try{t.close()}catch{}});
  t.on('routerclose',()=>peer.transports.delete(t.id));
  t.observer.on('close',()=>peer.transports.delete(t.id));
  return serializeTransport(t);
}
function findProducer(room,producerId){
  for(const p of room.peers.values()){const pr=p.producers.get(producerId);if(pr)return {producer:pr,owner:p}}
  return null;
}
async function handleRequest(ws,msg){
  const clientId=String(msg?.clientId||''),id=msg?.id,method=String(msg?.method||''),data=msg?.data||{};
  if(!clientId||!id||!method)return;
  try{
    if(method==='join'){
      const payload=await verifyTicket(String(data.ticket||''));
      if(!payload?.roomName||!payload?.sub)throw new Error('Media ticket noto‘g‘ri');
      const previous=peers.get(clientId);if(previous&&previous.bridge!==ws)throw new Error('Peer boshqa signaling ulanishiga tegishli');
      await closePeer(clientId,false);
      if(peers.size>=MAX_TOTAL_PEERS)throw new Error('SFU umumiy ishtirokchilar limiti to‘lgan');
      const room=await getRoom(payload.roomName,payload.mediaProfile,payload.maxParticipants);
      if(room.peers.size>=room.maxParticipants)throw new Error('Bu xonada ishtirokchilar limiti to‘lgan');
      const peer={id:clientId,bridge:ws,room,user:{id:payload.sub,fullName:payload.fullName,login:payload.login,role:payload.role,avatarUrl:payload.avatarUrl||''},transports:new Map(),producers:new Map(),consumers:new Map(),joinedAt:new Date()};
      peers.set(clientId,peer);room.peers.set(clientId,peer);
      const existing=[];for(const other of room.peers.values())if(other.id!==clientId)for(const producer of other.producers.values())existing.push(serializeProducer(producer,other));
      reply(ws,clientId,id,true,{room:{roomId:room.id,peerId:clientId},mediaProfile:room.profile,limits:roomState(room).limits,routerRtpCapabilities:room.router.rtpCapabilities,producers:existing,participants:roomState(room).participants});
      broadcast(room,'peerJoined',{peerId:clientId,user:peer.user},clientId);broadcast(room,'roomState',roomState(room));
      return;
    }
    const peer=peers.get(clientId);if(!peer)throw new Error('Avval media xonaga ulaning');
    if(peer.bridge!==ws)throw new Error('Peer boshqa signaling ulanishiga tegishli');
    if(method==='createTransport'){reply(ws,clientId,id,true,await createTransport(peer,data.direction==='recv'?'recv':'send'));return}
    if(method==='connectTransport'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      await t.connect({dtlsParameters:data.dtlsParameters});reply(ws,clientId,id,true,{ok:true});return;
    }
    if(method==='produce'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      const appData={...(data.appData||{}),peerId:peer.id,role:peer.user.role};
      if(STRICT_AUDIO_FLOOR&&data.kind==='audio'&&peer.room.audioFloor&&peer.room.audioFloor.peerId!==peer.id)throw new Error('Boshqa ishtirokchi gapiryapti. Mikrofon navbati bo‘shashishini kuting.');
      const producer=await t.produce({kind:data.kind,rtpParameters:data.rtpParameters,appData});
      peer.producers.set(producer.id,producer);
      if(producer.kind==='audio'){claimAudioFloor(peer.room,peer,producer.id);try{await peer.room.audioObserver.addProducer({producerId:producer.id})}catch{}}
      producer.on('transportclose',()=>{if(producer.kind==='audio')clearAudioFloor(peer.room,peer.id,producer.id);peer.producers.delete(producer.id)});
      producer.observer.on('close',()=>{if(producer.kind==='audio')clearAudioFloor(peer.room,peer.id,producer.id);peer.producers.delete(producer.id);broadcast(peer.room,'producerClosed',{producerId:producer.id,peerId:peer.id})});
      const meta=serializeProducer(producer,peer);broadcast(peer.room,'newProducer',meta,peer.id);
      reply(ws,clientId,id,true,{id:producer.id});return;
    }
    if(method==='consume'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      const found=findProducer(peer.room,data.producerId);if(!found)throw new Error('Media oqimi topilmadi');
      if(!peer.room.router.canConsume({producerId:found.producer.id,rtpCapabilities:data.rtpCapabilities}))throw new Error('Brauzer bu media formatini qabul qila olmaydi');
      const consumer=await t.consume({producerId:found.producer.id,rtpCapabilities:data.rtpCapabilities,paused:true,appData:{meta:serializeProducer(found.producer,found.owner)}});
      peer.consumers.set(consumer.id,consumer);
      if(consumer.kind==='video'&&consumer.type==='simulcast')try{
        const q=String(data.quality||'auto'),map={240:[0,0],360:[0,2],480:[1,0],720:[1,2],1080:[2,2]};
        const pair=map[q]||(peer.room.profile==='lecture-lite'&&found.owner.user?.role==='teacher'&&found.producer.appData?.mediaTag==='camera'?[1,1]:[2,2]);
        await consumer.setPreferredLayers({spatialLayer:pair[0],temporalLayer:pair[1]});
      }catch{}
      consumer.on('transportclose',()=>peer.consumers.delete(consumer.id));consumer.on('producerclose',()=>peer.consumers.delete(consumer.id));
      reply(ws,clientId,id,true,{id:consumer.id,producerId:found.producer.id,kind:consumer.kind,rtpParameters:consumer.rtpParameters,type:consumer.type,producerPaused:consumer.producerPaused,appData:consumer.appData});return;
    }
    if(method==='setConsumerQuality'){
      const c=peer.consumers.get(data.consumerId);if(c&&c.kind==='video'&&c.type==='simulcast')try{
        const q=String(data.quality||'auto'),map={240:[0,0],360:[0,2],480:[1,0],720:[1,2],1080:[2,2]},pair=map[q]||[2,2];
        await c.setPreferredLayers({spatialLayer:pair[0],temporalLayer:pair[1]});
      }catch{}
      reply(ws,clientId,id,true,{ok:true});return;
    }
    if(method==='resumeConsumer'){const c=peer.consumers.get(data.consumerId);if(c)await c.resume();reply(ws,clientId,id,true,{ok:true});return}
    if(method==='pauseConsumer'){const c=peer.consumers.get(data.consumerId);if(c)await c.pause();reply(ws,clientId,id,true,{ok:true});return}
    if(method==='pauseProducer'||method==='resumeProducer'){
      const p=peer.producers.get(data.producerId);if(!p)throw new Error('Producer topilmadi');
      if(method==='pauseProducer'){
        await p.pause();
        if(p.kind==='audio')clearAudioFloor(peer.room,peer.id,p.id);
      }else{
        if(p.kind==='audio')claimAudioFloor(peer.room,peer,p.id);
        await p.resume();
      }
      reply(ws,clientId,id,true,{ok:true,audioFloor:peer.room.audioFloor||null});return;
    }
    if(method==='closeProducer'){
      const p=peer.producers.get(data.producerId);if(p){if(p.kind==='audio')clearAudioFloor(peer.room,peer.id,p.id);p.close();peer.producers.delete(p.id);broadcast(peer.room,'producerClosed',{producerId:p.id,peerId:peer.id})}
      reply(ws,clientId,id,true,{ok:true});return;
    }
    if(method==='restartIce'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      const iceParameters=await t.restartIce();reply(ws,clientId,id,true,{iceParameters});return;
    }
    if(method==='leave'){await closePeer(clientId,true);reply(ws,clientId,id,true,{ok:true});return}
    if(method==='stats'){
      const transports=[];for(const t of peer.transports.values())transports.push({id:t.id,direction:t.appData?.direction,stats:await t.getStats()});
      reply(ws,clientId,id,true,{transports});return;
    }
    throw new Error('Noma’lum media amali: '+method);
  }catch(e){reply(ws,clientId,id,false,null,e?.message||'SFU xatosi')}
}

async function boot(){
  if(process.env.NODE_ENV==='production'&&(!SFU_BRIDGE_SECRET||SFU_BRIDGE_SECRET.length<32||!process.env.ANNOUNCED_IP||!process.env.PLATFORM_VERIFY_URL))throw new Error('SFU_BRIDGE_SECRET (32+), ANNOUNCED_IP va PLATFORM_VERIFY_URL majburiy');
  for(let i=0;i<WORKERS;i++){
    const worker=await mediasoup.createWorker({logLevel:process.env.MEDIASOUP_LOG_LEVEL||'warn',logTags:['ice','dtls','rtp','srtp','rtcp']});
    worker.on('died',err=>{console.error('mediasoup worker died',i,err);setTimeout(()=>process.exit(1),2000)});
    const port=RTC_BASE_PORT+i,listenInfos=[{protocol:'udp',ip:RTC_LISTEN_IP,announcedAddress:ANNOUNCED_IP,port,recvBufferSize:4*1024*1024,sendBufferSize:4*1024*1024}];
    if(ENABLE_RTC_TCP)listenInfos.push({protocol:'tcp',ip:RTC_LISTEN_IP,announcedAddress:ANNOUNCED_IP,port});
    const webRtcServer=await worker.createWebRtcServer({listenInfos});
    workers.push({index:i,worker,webRtcServer,port,rooms:0});
    console.log('worker',i,'RTC',port,ENABLE_RTC_TCP?'UDP/TCP':'UDP');
  }

  const server=http.createServer((req,res)=>{
    if(req.url==='/health'){
      const workerStats=workers.map((w,i)=>({index:i,port:w.port,rooms:w.rooms,peers:workerPeerCount(w),pid:w.worker.pid}));
      const warnings=[];if(workers.length<TARGET_MIN_WORKERS)warnings.push(`${TARGET_PARALLEL_ROOMS} parallel xona uchun ${TARGET_MIN_WORKERS}+ worker tavsiya qilinadi`);if(!ENABLE_RTC_TCP)warnings.push('RTC TCP fallback o‘chiq');if(rooms.size>=MAX_ACTIVE_ROOMS-5)warnings.push('Parallel xona limiti yaqin');
      res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,nodeId:SFU_NODE_ID,workers:workers.length,rooms:rooms.size,peers:peers.size,lectureLite:LECTURE_LITE_ENABLED,studentAudioSlots:LECTURE_MAX_STUDENT_AUDIO,capacity:{targetParallelRooms:TARGET_PARALLEL_ROOMS,maxActiveRooms:MAX_ACTIVE_ROOMS,maxPeersPerRoom:MAX_PEERS_PER_ROOM,maxTotalPeers:MAX_TOTAL_PEERS,maxRoomsPerWorker:MAX_ROOMS_PER_WORKER,minRecommendedWorkers:TARGET_MIN_WORKERS,readyForTarget:workers.length>=TARGET_MIN_WORKERS&&MAX_ACTIVE_ROOMS>=TARGET_PARALLEL_ROOMS},workerStats,loadavg:os.loadavg().map(x=>Number(x.toFixed(2))),memory:{rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed},announcedIp:ANNOUNCED_IP,rtcPorts:workers.map(w=>w.port),rtcTcp:ENABLE_RTC_TCP,warnings}))}
    if(req.url==='/metrics'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({nodeId:SFU_NODE_ID,workers:workers.map((w,i)=>({index:i,port:w.port,rooms:w.rooms,peers:workerPeerCount(w),pid:w.worker.pid})),rooms:[...rooms.values()].map(r=>({id:r.id,profile:r.profile,peers:r.peers.size,studentAudioActive:studentAudioCount(r),workerPort:r.workerSlot.port,ageSeconds:Math.round((Date.now()-r.createdAt)/1000)})),peers:peers.size,capacity:{targetParallelRooms:TARGET_PARALLEL_ROOMS,maxActiveRooms:MAX_ACTIVE_ROOMS,maxPeersPerRoom:MAX_PEERS_PER_ROOM,maxTotalPeers:MAX_TOTAL_PEERS,maxRoomsPerWorker:MAX_ROOMS_PER_WORKER,minRecommendedWorkers:TARGET_MIN_WORKERS},loadavg:os.loadavg(),memory:process.memoryUsage()}))}
    res.writeHead(404);res.end('not found');
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024});
  server.on('upgrade',(req,socket,head)=>{
    const supplied=String(req.headers['x-sfu-bridge-secret']||'');
    const a=Buffer.from(supplied),b=Buffer.from(SFU_BRIDGE_SECRET);
    if(!SFU_BRIDGE_SECRET||a.length!==b.length||!crypto.timingSafeEqual(a,b)){socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');socket.destroy();return}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',(ws,req)=>{
    ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
    ws.on('message',raw=>{try{const msg=JSON.parse(String(raw));handleRequest(ws,msg)}catch(e){send(ws,{ok:false,error:'JSON noto‘g‘ri'})}});
    ws.on('close',()=>{for(const p of [...peers.values()])if(p.bridge===ws)closePeer(p.id,true)});
    ws.on('error',()=>{});
  });
  const ping=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){try{ws.terminate()}catch{};continue}ws.isAlive=false;try{ws.ping()}catch{}}},20000);ping.unref?.();
  server.listen(SIGNAL_PORT,SIGNAL_IP,()=>console.log(`Masofaviy2 mediasoup SFU signaling ${SIGNAL_IP}:${SIGNAL_PORT}, RTC ${RTC_LISTEN_IP} -> ${ANNOUNCED_IP}, workers ${WORKERS}`));
}
boot().catch(err=>{console.error(err);process.exit(1)});
process.on('SIGTERM',async()=>{for(const id of [...peers.keys()])await closePeer(id,false);for(const w of workers)try{w.worker.close()}catch{}process.exit(0)});
