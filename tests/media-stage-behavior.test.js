import test from 'node:test';
import assert from 'node:assert/strict';
import {MediaRoomClient} from '../frontend/media-client.js';

function classes(...initial) {
  const values=new Set(initial);
  return {
    contains:k=>values.has(k),
    add:(...keys)=>keys.forEach(k=>values.add(k)),
    remove:(...keys)=>keys.forEach(k=>values.delete(k)),
    toggle:(key,forced)=>{
      const on=forced===undefined?!values.has(key):Boolean(forced);
      if(on)values.add(key);else values.delete(key);
      return on;
    }
  };
}
function fakeTile(isLocal=false,hasVideo=false) {
  let videoTrack=hasVideo?{readyState:'live',enabled:true}:null;
  const video={srcObject:hasVideo?{getVideoTracks:()=>[videoTrack]}:null};
  return {
    classList:classes(...(hasVideo?['has-video']:[])),
    dataset:{peerId:isLocal?'local':'remote-peer',userId:isLocal?'educator':'student'},
    querySelector:selector=>selector==='video'?video:null,
    setVideo(active){
      videoTrack=active?{readyState:'live',enabled:true}:null;
      video.srcObject=active?{getVideoTracks:()=>[videoTrack]}:null;
      this.classList.toggle('has-video',active);
    }
  };
}
test('live educator camera becomes visible if currently selected participant has no video',()=>{
  const client=Object.create(MediaRoomClient.prototype);
  client.room={peerId:'local-peer'};
  client.classSpotlightUserId='';
  client.viewMode='speaker';
  client.closed=false;
  client.onState=()=>{};
  client.resetZoom=()=>{};
  client.refreshParticipantCardSelection=()=>{};
  client.grid={classList:classes('teacher-stage-layout','has-focus')};
  const local=fakeTile(true,true),remote=fakeTile(false,false);
  client.tiles=new Map([['local',local],['remote-peer',remote]]);
  client.producers=new Map([['camera',{paused:false}]]);
  client.selectedStagePeerId='remote-peer';
  assert.equal(client.ensureInlineVideoStage(),true);
  assert.equal(client.selectedStagePeerId,'remote-peer');
  // Main stage mirrors local camera without overriding a user's rail selection.
  assert.equal(local.classList.contains('focused'),false);
  assert.equal(client.grid.classList.contains('local-camera-stage'),true);
  remote.setVideo(true);
  client.selectStagePeer('remote-peer');
  assert.equal(client.ensureInlineVideoStage(),true);
  assert.equal(client.grid.classList.contains('local-camera-stage'),false);
  client.classSpotlightUserId='student';
  assert.equal(client.ensureInlineVideoStage(),true);
  remote.setVideo(false);
  assert.equal(client.ensureInlineVideoStage(),false);
});
test('WebRTC connection quality reports actual RTT and interval video packet loss',async()=>{
  const client=Object.create(MediaRoomClient.prototype);
  client.sendTransport={connectionState:'connected'};
  let packetsReceived=1000,packetsLost=10;
  client.recvTransport={
    connectionState:'connected',
    async getStats(){return new Map([
      ['pair',{type:'candidate-pair',state:'succeeded',nominated:true,currentRoundTripTime:.125}],
      ['inbound',{type:'inbound-rtp',kind:'video',packetsReceived,packetsLost}]
    ])}
  };
  client.networkStats={received:0,lost:0,at:0};
  const first=await client.getNetworkHealth();
  assert.equal(first.state,'connected');
  assert.equal(Math.round(first.rttMs),125);
  assert.equal(first.lossPercent,null);
  packetsReceived=1100;packetsLost=32;
  const second=await client.getNetworkHealth();
  assert.ok(second.lossPercent>15);
  client.recvTransport.connectionState='failed';
  assert.equal((await client.getNetworkHealth()).state,'failed');
});

test('dedicated inline camera player reuses the same MediaStreamTrack and can be hidden',()=>{
  const client=Object.create(MediaRoomClient.prototype);
  const stage={classList:classes(),attrs:{},setAttribute(k,v){this.attrs[k]=v}};
  const track={kind:'video',readyState:'live',enabled:true};
  const oldMediaStream=globalThis.MediaStream;
  globalThis.MediaStream=class{constructor(tracks){this.tracks=tracks}getVideoTracks(){return this.tracks}};
  const video={srcObject:null,muted:false,autoplay:false,playsInline:false,played:0,play(){this.played++;return Promise.resolve()}};
  try{
    client.closed=false;client.onState=()=>{};client.selfStage=stage;client.selfStageVideo=video;
    client.syncStandaloneCameraStage(true,track);
    assert.equal(stage.classList.contains('is-visible'),true);
    assert.equal(video.srcObject.getVideoTracks()[0],track);
    assert.equal(video.played,1);
    assert.equal(stage.attrs['aria-hidden'],'false');
    client.syncStandaloneCameraStage(false);
    assert.equal(stage.classList.contains('is-visible'),false);
    assert.equal(stage.attrs['aria-hidden'],'true');
    assert.equal(video.srcObject,null);
  }finally{globalThis.MediaStream=oldMediaStream}
});
test('independent local camera stage does not rely on legacy ms-tile or picture-in-picture markup',async()=>{
  const {readFileSync}=await import('node:fs');
  const media=readFileSync(new URL('../frontend/media-client.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/live-classroom-2026.css',import.meta.url),'utf8');
  assert.ok(media.includes("className:'ms-inline-self-stage'"));
  assert.ok(media.includes("className='ms-inline-self-video'"));
  assert.ok(media.includes('this.mount.append(grid,emptyStage,selfStage,teacherPiP,stageBadge,fullscreen,strip,audioBin)'));
  assert.ok(css.includes('.ms-inline-self-stage.is-visible'));
  assert.ok(css.includes('z-index:19!important'));
  assert.ok(media.includes('this.syncStandaloneCameraStage(Boolean(track),track,label)'));
  assert.ok(media.includes('this.ensureInlineVideoStage();this.onState({camera:false})'));
});

test('administrator sees camera start action instead of an unexplained empty classroom',()=>{
 const client=Object.create(MediaRoomClient.prototype);
 client.user={role:'superadmin'};
 client.producers=new Map();
 client.tiles=new Map([['local',fakeTile(true,false)]]);
 client.grid={classList:classes()};
 client.selectedStagePeerId='';
 client.selfStage={classList:classes()};
 client.emptyStage={classList:classes()};
 client.emptyTitle={textContent:''};
 client.emptyHint={textContent:''};
 client.emptyCameraAction={hidden:true,disabled:false};
 client.mediaBusy={};
 client.refreshEmptyStage();
 assert.equal(client.emptyStage.classList.contains('is-visible'),true);
 assert.equal(client.emptyCameraAction.hidden,false);
 assert.match(client.emptyTitle.textContent,/Kamera/);
 client.cameraLastError='Kamera ruxsati bloklangan';
 client.refreshEmptyStage();
 assert.equal(client.emptyTitle.textContent,'Kamera ochilmadi');
 assert.match(client.emptyHint.textContent,/ruxsati bloklangan/);
 client.cameraLastError='';
 const local=client.tiles.get('local');
 local.setVideo(true);
 client.producers.set('camera',{paused:false,track:{readyState:'live'}});
 client.selfStage.classList.add('is-visible');
 client.refreshEmptyStage();
 assert.equal(client.emptyStage.classList.contains('is-visible'),false);
 client.user={role:'student'};
 client.selfStage.classList.remove('is-visible');
 local.setVideo(false);
 client.refreshEmptyStage();
 assert.equal(client.emptyCameraAction.hidden,true);
});
test('superadmin enters a lesson with camera enabled by default but keeps an explicit OFF choice',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(app.includes("const isAdminPresenter=user.role==='superadmin'"));
 assert.ok(app.includes("const cameraKey=isTeachingRole?'m2-teacher-camera-wanted':'m2-admin-camera-wanted'"));
 assert.ok(app.includes("if(localStorage.getItem(cameraKey)!=='0')await mediaRoomClient.toggleCamera()"));
 assert.ok(app.includes("if(isTeachingRole&&localStorage.getItem('m2-teacher-mic-wanted')!=='0')"));
 const css=readFileSync(new URL('../public/live-classroom-2026.css',import.meta.url),'utf8');
 assert.ok(css.includes('.ms-empty-stage.is-visible'));
 assert.ok(css.includes('.ms-empty-camera-action[hidden]'));
});

test('teacher camera is default main stage without pressing spotlight, even if student joined first',()=>{
 const client=Object.create(MediaRoomClient.prototype);
 client.closed=false;client.user={role:'student'};client.onState=()=>{};
 client.grid={classList:classes('speaker-view')};
 const student=fakeTile(false,true),teacher=fakeTile(false,true);
 student.dataset.peerId='student-peer';student.dataset.userId='student-001';
 teacher.dataset.peerId='teacher-peer';teacher.dataset.userId='teacher-001';teacher.classList.add('role-teacher');
 client.tiles=new Map([['student-peer',student],['teacher-peer',teacher]]);
 client.selectedStagePeerId='student-peer';client.producers=new Map();client.classSpotlightUserId='';
 let selectedTrack=null;let teacherPiPPrimary=null;
 client.syncStandaloneCameraStage=(on,track)=>{selectedTrack=on?track:null};
 client.syncTeacherPiP=primary=>{teacherPiPPrimary=primary};
 client.refreshEmptyStage=()=>{};
 assert.equal(client.ensureInlineVideoStage(),true);
 assert.equal(selectedTrack,teacher.querySelector('video').srcObject.getVideoTracks()[0]);
 assert.equal(teacherPiPPrimary,teacher);
 client.explicitStagePeerId='student-peer';
 assert.equal(client.ensureInlineVideoStage(),true);
 assert.equal(selectedTrack,student.querySelector('video').srcObject.getVideoTracks()[0]);
 client.classSpotlightUserId='student-001';
 assert.equal(client.ensureInlineVideoStage(),true);
 assert.equal(selectedTrack,student.querySelector('video').srcObject.getVideoTracks()[0]);
});
test('spotlight student keeps educator video visible in independent PiP without another camera capture',()=>{
 const client=Object.create(MediaRoomClient.prototype);
 const teacher=fakeTile(false,true),student=fakeTile(false,true);
 teacher.classList.add('role-teacher');teacher.dataset.userId='teacher-1';
 student.dataset.userId='student-1';
 client.tiles=new Map([['teacher',teacher],['student',student]]);
 client.user={role:'student'};client.closed=false;client.onState=()=>{};
 const old=globalThis.MediaStream;
 globalThis.MediaStream=class{constructor(tracks){this.tracks=tracks}getVideoTracks(){return this.tracks}};
 const pip={classList:classes(),setAttribute(k,v){this[k]=v}};
 const video={srcObject:null,paused:true,play(){this.paused=false;return Promise.resolve()}};
 try{
  client.teacherPiP=pip;client.teacherPiPVideo=video;client.teacherPiPLabel={textContent:''};
  client.syncTeacherPiP(student);
  assert.equal(pip.classList.contains('is-visible'),true);
  assert.equal(video.srcObject.getVideoTracks()[0],teacher.querySelector('video').srcObject.getVideoTracks()[0]);
  assert.equal(video.muted,true);
  client.syncTeacherPiP(teacher);
  assert.equal(pip.classList.contains('is-visible'),false);
  assert.equal(video.srcObject,null);
 }finally{globalThis.MediaStream=old}
});
test('screen share takes main stage, requests Full HD and keeps teacher camera as PiP',async()=>{
 const client=Object.create(MediaRoomClient.prototype);
 client.closed=false;client.user={role:'teacher'};client.onState=()=>{};
 client.grid={classList:classes('screen-layout')};
 const teacher=fakeTile(true,true),screen=fakeTile(false,true);
 teacher.classList.add('role-teacher');
 screen.classList.add('screen-share');screen.dataset.peerId='teacher:screen';
 client.tiles=new Map([['local',teacher],['teacher:screen',screen]]);
 client.producers=new Map([['camera',{paused:false}]]);
 client.selectedStagePeerId='local';
 let stageTrack=null,pipPrimary=null;
 client.syncStandaloneCameraStage=(show,track)=>{stageTrack=show?track:null};
 client.syncTeacherPiP=primary=>{pipPrimary=primary};
 client.refreshEmptyStage=()=>{};
 assert.equal(client.ensureInlineVideoStage(),true);
 assert.equal(stageTrack,screen.querySelector('video').srcObject.getVideoTracks()[0]);
 assert.equal(pipPrimary,screen);
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../frontend/media-client.js',import.meta.url),'utf8');
 assert.match(source,/getDisplayMedia\(\{video:\{width:\{ideal:1920,max:1920\},height:\{ideal:1080,max:1080\}/);
 assert.ok(source.includes("if(tag==='screen'||role==='teacher')return true"));
 assert.ok(source.includes("priorityVideo?'1080'"));
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(app.includes("Never throttle a 1080p teacher/screen stream"));
 assert.ok(app.includes("localStorage.getItem('m2-video-quality')||'auto'"));
});
