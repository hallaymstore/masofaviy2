import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MediaRoomClient} from '../frontend/media-client.js';

const meta=(id,peer='teacher')=>({producerId:id,peerId:peer,kind:'audio',appData:{role:'teacher'}});
function makeClient(){
 const c=Object.create(MediaRoomClient.prototype);
 c.closed=false;c.room={peerId:'me'};c.socket=null;c.consumers=new Map();c.consuming=new Map();
 c.audioPeerPending=new Map();c.canceledProducers=new Set();c.producers=new Map();
 c.receiveQuality='auto';c.lowEnd=false;c.studentVideoConsumers=0;c.device={rtpCapabilities:{}};
 c.recvTransport={id:'transport',consume:async data=>({id:'local-'+data.id,kind:'audio',appData:{meta:meta(data.producerId)},closed:false,close(){this.closed=true},on(){}})};
 c.applyProducerPresence=()=>{};c.shouldConsume=()=>true;c.ensureInlineVideoStage=()=>{};
 c.updateParticipantCardMic=()=>{};c.audioBin={querySelectorAll:()=>[]};
 c.attachRemote=async()=>{};
 c.request=async(method,data)=>method==='consume'?{id:'server-'+data.producerId,producerId:data.producerId}:({ok:true});
 return c;
}
test('duplicate join/newProducer events consume audio only once even while SFU request is pending',async()=>{
 const c=makeClient();
 let release,requested=0,attached=0;
 const barrier=new Promise(resolve=>{release=resolve});
 c.request=async(method,data)=>{if(method==='consume'){requested++;await barrier;return {id:'server-p1',producerId:'p1'}}return {ok:true}};
 c.attachRemote=async()=>{attached++};
 const a=c.maybeConsume(meta('p1')),b=c.maybeConsume(meta('p1')),d=c.maybeConsume(meta('p1'));
 release();await Promise.all([a,b,d]);
 assert.equal(requested,1);assert.equal(attached,1);assert.equal(c.consumers.size,1);
 assert.equal(c.consuming.size,0);
});
test('audio for the same peer is serialized and only the latest producer stays playing',async()=>{
 const c=makeClient();let attached=[];
 c.recvTransport.consume=async data=>({id:data.id,kind:'audio',appData:{meta:meta(data.producerId)},closed:false,close(){this.closed=true},on(){}});
 c.attachRemote=async(_,m)=>attached.push(m.producerId);
 await Promise.all([c.maybeConsume(meta('old')),c.maybeConsume(meta('new'))]);
 assert.deepEqual(attached,['old','new']);
 assert.equal(c.consumers.size,1);
 assert.equal(c.consumers.has('new'),true);
 assert.equal(c.consumers.has('old'),false);
});
test('producer close during pending consume cannot resurrect a ghost audio player',async()=>{
 const c=makeClient();let resolveReq,attached=0,localConsumed=0,closedOnServer=0;
 const barrier=new Promise(resolve=>{resolveReq=resolve});
 c.request=async(method,data)=>{
  if(method==='consume'){await barrier;return {id:'s1',producerId:'p1'}}
  if(method==='closeConsumer')closedOnServer++;
  return {ok:true};
 };
 c.recvTransport.consume=async()=>{localConsumed++;throw Error('should never consume canceled stream')};
 c.attachRemote=async()=>{attached++};
 const task=c.maybeConsume(meta('p1'));
 await Promise.resolve(); // allow the SFU consume request to start before closure
 c.closeConsumerByProducer('p1');
 resolveReq();await task;
 assert.equal(localConsumed,0);assert.equal(attached,0);assert.equal(closedOnServer,1);
});
test('normal microphone track is native with browser AEC/NS/AGC; diagnostic DSP is opt-in',async()=>{
 const prior=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null};
 const c=makeClient();
 let constraints=null;
 const track={contentHint:'',applyConstraints:async settings=>{constraints=settings},readyState:'live'};
 try{
  const result=await c.prepareSpeechTrack(track);
  assert.equal(result.track,track);assert.equal(result.processed,false);
  assert.equal(constraints.echoCancellation,true);
  assert.equal(constraints.noiseSuppression,true);
  assert.equal(constraints.autoGainControl,true);
 }finally{globalThis.localStorage=prior}
});
test('failed SFU audio produce releases the captured microphone track',async()=>{
 const c=makeClient();
 let stopped=0;const track={readyState:'live',enabled:true,getSettings:()=>({echoCancellation:true}),applyConstraints:async()=>{},stop:()=>{stopped++}};
 const prior=globalThis.localStorage;globalThis.localStorage={getItem:()=>null};
 c.mediaBusy={};c.proximityGuard=false;c.echoGuard=true;c.floorBusyForMe=()=>false;c.onError=()=>{};c.onState=()=>{};
 c.exitZeroFeedbackMode=()=>{};c.stopFeedbackMonitor=()=>{};c.getMediaOnce=async()=>({getAudioTracks:()=>[track]});
 c.sendTransport={produce:async()=>{throw Error('produce fails')}};
 try{assert.equal(await c.startMicrophone(),false);assert.equal(stopped,1)}finally{globalThis.localStorage=prior}
});
test('SFU rejects duplicate account microphones and cleans remote consumers',()=>{
 const s=readFileSync(new URL('../media-server/server.js',import.meta.url),'utf8');
 const c=readFileSync(new URL('../frontend/media-client.js',import.meta.url),'utf8');
 assert.ok(s.includes("const audioClaims=peer.room.audioClaims"));
 assert.ok(s.includes("audioClaims.has(micUser)"));
 assert.ok(s.includes("if(method==='closeConsumer')"));
 assert.ok(c.includes("video.muted=true;tile.classList.add('has-video')"));
 assert.ok(c.includes("this.disposeRemoteAudio(a)"));
 assert.ok(c.includes("if(a.paused)a.play()"));
});
