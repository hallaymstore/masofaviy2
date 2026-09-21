import 'dotenv/config';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import * as mediasoup from 'mediasoup';
import { WebSocketServer } from 'ws';

const SIGNAL_PORT=Number(process.env.SIGNAL_PORT||40000);
const LISTEN_IP=process.env.LISTEN_IP||'0.0.0.0';
const ANNOUNCED_IP=process.env.ANNOUNCED_IP||'213.230.97.12';
const RTC_BASE_PORT=Number(process.env.RTC_BASE_PORT||50000);
const WORKERS=Math.max(1,Math.min(Number(process.env.MEDIASOUP_WORKERS||Math.max(1,Math.min(os.cpus().length,8))),32));
const ENABLE_RTC_TCP=process.env.ENABLE_RTC_TCP==='true';
const PLATFORM_VERIFY_URL=process.env.PLATFORM_VERIFY_URL||'https://masofaviy2.onrender.com/api/media/verify';
const MAX_PEERS_PER_ROOM=Math.max(2,Number(process.env.MAX_PEERS_PER_ROOM||120));
const MAX_INCOMING_BITRATE=Math.max(200000,Number(process.env.MAX_INCOMING_BITRATE||2500000));

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
function roomState(room){return {roomId:room.id,participants:[...room.peers.values()].map(p=>({peerId:p.id,user:p.user})),count:room.peers.size}}

async function verifyTicket(ticket){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    const r=await fetch(PLATFORM_VERIFY_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket}),signal:controller.signal});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data?.ok)throw new Error(data?.message||'Media ticket tasdiqlanmadi');
    return data.payload;
  }finally{clearTimeout(timer)}
}
function hashRoom(id){const h=crypto.createHash('sha256').update(id).digest();return h.readUInt32BE(0)%workers.length}
async function getRoom(roomId){
  let room=rooms.get(roomId);if(room)return room;
  const workerSlot=workers[hashRoom(roomId)];
  const router=await workerSlot.worker.createRouter({mediaCodecs});
  const audioObserver=await router.createAudioLevelObserver({maxEntries:8,threshold:-72,interval:800});
  room={id:roomId,router,workerSlot,peers:new Map(),audioObserver,createdAt:new Date()};
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
    initialAvailableOutgoingBitrate:900000,
    appData:{peerId:peer.id,direction}
  });
  try{await t.setMaxIncomingBitrate(MAX_INCOMING_BITRATE)}catch{}
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
      await closePeer(clientId,false);
      const room=await getRoom(payload.roomName);
      if(room.peers.size>=MAX_PEERS_PER_ROOM)throw new Error('Bu xonada ishtirokchilar limiti to‘lgan');
      const peer={id:clientId,bridge:ws,room,user:{id:payload.sub,fullName:payload.fullName,login:payload.login,role:payload.role,avatarUrl:payload.avatarUrl||''},transports:new Map(),producers:new Map(),consumers:new Map(),joinedAt:new Date()};
      peers.set(clientId,peer);room.peers.set(clientId,peer);
      const existing=[];for(const other of room.peers.values())if(other.id!==clientId)for(const producer of other.producers.values())existing.push(serializeProducer(producer,other));
      reply(ws,clientId,id,true,{room:{roomId:room.id,peerId:clientId},routerRtpCapabilities:room.router.rtpCapabilities,producers:existing,participants:roomState(room).participants});
      broadcast(room,'peerJoined',{peerId:clientId,user:peer.user},clientId);broadcast(room,'roomState',roomState(room));
      return;
    }
    const peer=peers.get(clientId);if(!peer)throw new Error('Avval media xonaga ulaning');
    peer.bridge=ws;
    if(method==='createTransport'){reply(ws,clientId,id,true,await createTransport(peer,data.direction==='recv'?'recv':'send'));return}
    if(method==='connectTransport'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      await t.connect({dtlsParameters:data.dtlsParameters});reply(ws,clientId,id,true,{ok:true});return;
    }
    if(method==='produce'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      const appData={...(data.appData||{}),peerId:peer.id,role:peer.user.role};
      const producer=await t.produce({kind:data.kind,rtpParameters:data.rtpParameters,appData});
      peer.producers.set(producer.id,producer);
      if(producer.kind==='audio')try{await peer.room.audioObserver.addProducer({producerId:producer.id})}catch{}
      producer.on('transportclose',()=>peer.producers.delete(producer.id));
      producer.observer.on('close',()=>{peer.producers.delete(producer.id);broadcast(peer.room,'producerClosed',{producerId:producer.id,peerId:peer.id})});
      const meta=serializeProducer(producer,peer);broadcast(peer.room,'newProducer',meta,peer.id);
      reply(ws,clientId,id,true,{id:producer.id});return;
    }
    if(method==='consume'){
      const t=peer.transports.get(data.transportId);if(!t)throw new Error('Transport topilmadi');
      const found=findProducer(peer.room,data.producerId);if(!found)throw new Error('Media oqimi topilmadi');
      if(!peer.room.router.canConsume({producerId:found.producer.id,rtpCapabilities:data.rtpCapabilities}))throw new Error('Brauzer bu media formatini qabul qila olmaydi');
      const consumer=await t.consume({producerId:found.producer.id,rtpCapabilities:data.rtpCapabilities,paused:true,appData:{meta:serializeProducer(found.producer,found.owner)}});
      peer.consumers.set(consumer.id,consumer);
      consumer.on('transportclose',()=>peer.consumers.delete(consumer.id));consumer.on('producerclose',()=>peer.consumers.delete(consumer.id));
      reply(ws,clientId,id,true,{id:consumer.id,producerId:found.producer.id,kind:consumer.kind,rtpParameters:consumer.rtpParameters,type:consumer.type,producerPaused:consumer.producerPaused,appData:consumer.appData});return;
    }
    if(method==='resumeConsumer'){const c=peer.consumers.get(data.consumerId);if(c)await c.resume();reply(ws,clientId,id,true,{ok:true});return}
    if(method==='pauseProducer'||method==='resumeProducer'){
      const p=peer.producers.get(data.producerId);if(!p)throw new Error('Producer topilmadi');
      if(method==='pauseProducer')await p.pause();else await p.resume();reply(ws,clientId,id,true,{ok:true});return;
    }
    if(method==='closeProducer'){
      const p=peer.producers.get(data.producerId);if(p){p.close();peer.producers.delete(p.id);broadcast(peer.room,'producerClosed',{producerId:p.id,peerId:peer.id})}
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
  for(let i=0;i<WORKERS;i++){
    const worker=await mediasoup.createWorker({logLevel:process.env.MEDIASOUP_LOG_LEVEL||'warn',logTags:['ice','dtls','rtp','srtp','rtcp']});
    worker.on('died',err=>{console.error('mediasoup worker died',i,err);setTimeout(()=>process.exit(1),2000)});
    const port=RTC_BASE_PORT+i,listenInfos=[{protocol:'udp',ip:LISTEN_IP,announcedAddress:ANNOUNCED_IP,port,recvBufferSize:4*1024*1024,sendBufferSize:4*1024*1024}];
    if(ENABLE_RTC_TCP)listenInfos.push({protocol:'tcp',ip:LISTEN_IP,announcedAddress:ANNOUNCED_IP,port});
    const webRtcServer=await worker.createWebRtcServer({listenInfos});
    workers.push({worker,webRtcServer,port,rooms:0});
    console.log('worker',i,'RTC',port,ENABLE_RTC_TCP?'UDP/TCP':'UDP');
  }

  const server=http.createServer((req,res)=>{
    if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,workers:workers.length,rooms:rooms.size,peers:peers.size,announcedIp:ANNOUNCED_IP,rtcPorts:workers.map(w=>w.port)}))}
    if(req.url==='/metrics'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({workers:workers.map((w,i)=>({index:i,port:w.port,rooms:w.rooms,pid:w.worker.pid})),rooms:[...rooms.values()].map(r=>({id:r.id,peers:r.peers.size,workerPort:r.workerSlot.port,ageSeconds:Math.round((Date.now()-r.createdAt)/1000)})),peers:peers.size}))}
    res.writeHead(404);res.end('not found');
  });
  const wss=new WebSocketServer({server,maxPayload:2*1024*1024});
  wss.on('connection',(ws,req)=>{
    ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
    ws.on('message',raw=>{try{const msg=JSON.parse(String(raw));handleRequest(ws,msg)}catch(e){send(ws,{ok:false,error:'JSON noto‘g‘ri'})}});
    ws.on('close',()=>{for(const p of [...peers.values()])if(p.bridge===ws)closePeer(p.id,true)});
    ws.on('error',()=>{});
  });
  const ping=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){try{ws.terminate()}catch{};continue}ws.isAlive=false;try{ws.ping()}catch{}}},20000);ping.unref?.();
  server.listen(SIGNAL_PORT,LISTEN_IP,()=>console.log(`Masofaviy2 mediasoup SFU signaling :${SIGNAL_PORT}, announced ${ANNOUNCED_IP}, workers ${WORKERS}`));
}
boot().catch(err=>{console.error(err);process.exit(1)});
process.on('SIGTERM',async()=>{for(const id of [...peers.keys()])await closePeer(id,false);for(const w of workers)try{w.worker.close()}catch{}process.exit(0)});
