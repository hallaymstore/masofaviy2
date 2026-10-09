import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectFeedbackFrame,createFeedbackToneTracker} from '../frontend/audio-feedback-detector.js';
import {MediaRoomClient} from '../frontend/media-client.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function frame(frequency=5500,{peak=212,base=12,amplitude=36}={}){
 const freq=new Uint8Array(1024).fill(base),fftSize=2048,sampleRate=48000;
 const i=Math.round(frequency*fftSize/sampleRate);
 freq[i]=peak;
 const wave=Uint8Array.from({length:2048},(_,n)=>Math.max(0,Math.min(255,128+Math.round(amplitude*Math.sin(n*.30)))));
 return {bins:freq,wave};
}
test('stable 5.5 kHz feedback tone is detected, even without speech',()=>{
 const {bins,wave}=frame();
 const result=inspectFeedbackFrame(bins,wave);
 assert.equal(result.tonal,true);
 assert.ok(result.frequency>5400&&result.frequency<5600);
 const tracker=createFeedbackToneTracker();
 assert.equal(tracker.observe(result,0),false);
 assert.equal(tracker.observe(result,90),false);
 assert.equal(tracker.observe(result,180),false);
 assert.equal(tracker.observe(result,270),true);
 assert.equal(tracker.observe(result,350),false); // cooldown
});
test('quiet noise, broadband sounds, moving harmonics and short whistle do not trigger long guard',()=>{
 const quiet=frame(5500,{amplitude:1}),broad=frame(5500,{peak:122,base:88});
 assert.equal(inspectFeedbackFrame(quiet.bins,quiet.wave).tonal,false);
 assert.equal(inspectFeedbackFrame(broad.bins,broad.wave).tonal,false);
 const tracker=createFeedbackToneTracker();
 for(let t=0;t<200;t+=90){
  const data=frame(t%180?1100:6500);const result=inspectFeedbackFrame(data.bins,data.wave);
  assert.equal(tracker.observe(result,t),false);
 }
});
test('manual same-room protection blocks remote speakers only while microphone is active',()=>{
 const prior=globalThis.localStorage,stored=new Map();
 globalThis.localStorage={setItem:(k,v)=>stored.set(k,v)};
 const c=Object.create(MediaRoomClient.prototype);
 const audio={muted:false,volume:1,paused:false,dataset:{role:'teacher'},pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}};
 c.audioBin={querySelectorAll:()=>[audio]};
 c.producers=new Map([['mic',{paused:false,track:{enabled:true}}]]);
 c.echoGuard=true;c.feedbackRiskUntil=0;c.feedbackSafeUntil=0;c.micWarmupUntil=0;c.autoHalfDuplexUntil=0;c.proximityGuard=false;c.onState=()=>{};
 try{
  assert.equal(c.setProximityGuard(true),true);
  assert.equal(audio.muted,true);assert.equal(audio.paused,true);assert.equal(audio.volume,0);
  assert.equal(stored.get('m2-proximity-guard'),'1');
  c.producers.get('mic').paused=true;c.refreshRemoteAudioVolume();
  assert.equal(audio.muted,false);
  assert.equal(c.setProximityGuard(false),false);
 }finally{globalThis.localStorage=prior}
});
test('safety monitor uses separate analyser path, does not route microphone to speaker or replace AEC-enabled audio track',async()=>{
 const prevWindow=globalThis.window,prevStream=globalThis.MediaStream;
 const connected=[],disconnected=[],closed=[];
 class Ctx {
  state='running';sampleRate=48000;
  createMediaStreamSource(){return {connect:target=>connected.push(target),disconnect:()=>disconnected.push('source')}}
  createAnalyser(){return {context:this,fftSize:2048,frequencyBinCount:1024,getByteFrequencyData:b=>b.fill(0),getByteTimeDomainData:b=>b.fill(128),disconnect:()=>disconnected.push('analyser')}}
  close(){closed.push(true);this.state='closed';return Promise.resolve()}
 }
 globalThis.window={AudioContext:Ctx};globalThis.MediaStream=class {constructor(tracks){this.tracks=tracks}};
 const c=Object.create(MediaRoomClient.prototype);c.closed=false;c.producers=new Map([['mic',{paused:false,track:{enabled:true}}]]);
 c.micAudioChain=null;c.micSafetyMonitor=null;c.feedbackMonitorTimer=null;c.onState=()=>{};
 try{
  assert.equal(await c.startFeedbackMonitor({readyState:'live'}),true);
  assert.equal(connected.length,1);
  assert.equal(c.feedbackMonitorStatus,'active');
  assert.equal(c.micSafetyMonitor.analyser,connected[0]);
  c.stopFeedbackMonitor();
  assert.equal(c.feedbackMonitorStatus,'off');
  assert.equal(closed.length,1);
  assert.deepEqual(disconnected,['source','analyser']);
 }finally{c.stopFeedbackMonitor();globalThis.window=prevWindow;globalThis.MediaStream=prevStream}
});
test('native AEC track stays default while feedback monitor and protected room UI are enabled',()=>{
 const media=read('frontend/media-client.js'),ui=read('public/app.js'),html=read('public/index.html'),server=read('server.js');
 assert.ok(media.includes("if(localStorage.getItem('m2-experimental-audio-dsp')!=='1')return {track:rawTrack"));
 assert.ok(media.includes('this.startFeedbackMonitor(rawTrack).catch(()=>{})'));
 assert.ok(media.includes('this.startFeedbackMonitor(this.localMicRawTrack||p.track)'));
 assert.ok(media.includes('source.connect(analyser)'));
 assert.ok(media.includes('now<this.autoHalfDuplexUntil'));
 assert.ok(media.includes('enterAutomaticHalfDuplex(duration)'));
 assert.ok(ui.includes('setProximityGuard(!mediaRoomClient.proximityGuard)'));
 assert.ok(html.includes('Yaqin qurilmalar'));
 assert.ok(server.includes('if(freq<450||freq>8500)return'));
 assert.ok(server.includes('if(prev&&now-prev.at<2500)return'));
});
