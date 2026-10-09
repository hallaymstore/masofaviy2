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
  assert.equal(client.selectedStagePeerId,'local-peer');
  assert.equal(local.classList.contains('focused'),true);
  assert.equal(client.grid.classList.contains('local-camera-stage'),true);
  remote.setVideo(true);
  client.selectStagePeer('remote-peer');
  assert.equal(client.ensureInlineVideoStage(),false);
  assert.equal(client.grid.classList.contains('local-camera-stage'),false);
  client.classSpotlightUserId='student';
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
