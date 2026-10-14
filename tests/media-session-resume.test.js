import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const block=src.slice(src.indexOf('// ---- Resumable media sessions ----'),src.indexOf('function initSfuCluster(){'));

function harness({graceMs=40}={}){
  const sent=[],emits=[],node={id:'sfu-01'};
  const env={
    process:{env:{MEDIA_RESUME_GRACE_MS:String(graceMs),MEDIA_NODE_GRACE_MS:'5000'}},
    jwt:{verify:(t,_s,o)=>{const [typ,sub,room,exp]=String(t).split(':');if(typ!=='media')throw new Error('bad');if(exp==='expired'&&!o.ignoreExpiration)throw new Error('expired');return {typ:'media',sub,roomName:room}}},
    JWT_SECRET:'s',clientNodeMap:new Map(),clientRoomMap:new Map(),sfuNodes:new Map([[node.id,node]]),
    pickSfuNode:()=>node,sfuSendTo:(n,payload)=>{sent.push(payload);return true}
  };
  const api=new Function(...Object.keys(env),block.replace(/MEDIA_RESUME_GRACE_MS=Math\.max\(10000,/,'MEDIA_RESUME_GRACE_MS=Math.max(1,')+'\nreturn {handleMediaRequest,detachMediaSessions,mediaSessionTarget,mediaSessions};')(...Object.values(env));
  const sock=id=>({id,emit:(ev,m)=>emits.push([id,ev,m])});
  return {api,sent,emits,sock};
}
const SID='sid0123456789abcdef';

test('media requests are keyed by the session id, not the socket id',()=>{
 const h=harness(),s1=h.sock('sock-1');
 h.api.handleMediaRequest(s1,'u1',{id:'1',method:'join',data:{ticket:'media:u1:room-1'},sid:SID});
 assert.equal(h.sent.at(-1).clientId,SID);
 assert.equal(h.api.mediaSessionTarget(SID),'sock-1');
});

test('a reconnected socket re-binds the same media peer within the grace period (no leave sent)',async()=>{
 const h=harness({graceMs:60}),s1=h.sock('sock-1'),s2=h.sock('sock-2');
 h.api.handleMediaRequest(s1,'u1',{id:'1',method:'join',data:{ticket:'media:u1:room-1'},sid:SID});
 h.api.detachMediaSessions('sock-1');
 h.api.handleMediaRequest(s2,'u1',{id:'2',method:'resume',data:{},sid:SID});
 await new Promise(r=>setTimeout(r,120));
 assert.equal(h.api.mediaSessionTarget(SID),'sock-2','SFU events now go to the new socket');
 assert.ok(!h.sent.some(m=>m.method==='leave'),'peer was not torn down');
 assert.equal(h.sent.at(-1).method,'resume');
});

test('a client that never comes back is removed from the SFU after the grace period',async()=>{
 const h=harness({graceMs:30}),s1=h.sock('sock-1');
 h.api.handleMediaRequest(s1,'u1',{id:'1',method:'join',data:{ticket:'media:u1:room-1'},sid:SID});
 h.api.detachMediaSessions('sock-1');
 await new Promise(r=>setTimeout(r,80));
 assert.ok(h.sent.some(m=>m.method==='leave'&&m.clientId===SID));
 assert.ok(!h.api.mediaSessions.has(SID));
});

test('another user cannot hijack a media session; expired ticket only allowed for resume',()=>{
 const h=harness(),s1=h.sock('sock-1'),s2=h.sock('sock-2');
 h.api.handleMediaRequest(s1,'u1',{id:'1',method:'join',data:{ticket:'media:u1:room-1'},sid:SID});
 h.api.handleMediaRequest(s2,'u2',{id:'2',method:'resume',data:{},sid:SID});
 assert.equal(h.emits.at(-1)[2].ok,false);
 assert.equal(h.api.mediaSessionTarget(SID),'sock-1');
 const h2=harness(),s3=h2.sock('sock-3');
 h2.api.handleMediaRequest(s3,'u1',{id:'3',method:'join',data:{ticket:'media:u1:room-1:expired'},sid:SID});
 assert.equal(h2.emits.at(-1)[2].ok,false,'join needs a fresh ticket');
 h2.api.handleMediaRequest(s3,'u1',{id:'4',method:'resume',data:{ticket:'media:u1:room-1:expired'},sid:SID});
 assert.equal(h2.sent.at(-1).method,'resume','resume after an app restart may present an old ticket; the SFU still requires a live peer');
});

test('legacy clients without sid keep the socket-bound behaviour',()=>{
 const h=harness(),s1=h.sock('sock-1');
 h.api.handleMediaRequest(s1,'u1',{id:'1',method:'join',data:{ticket:'media:u1:room-1'}});
 assert.equal(h.sent.at(-1).clientId,'sock-1');
});

test('client and SFU sides of the resume protocol are wired',()=>{
 const mc=readFileSync(new URL('../frontend/media-client.js',import.meta.url),'utf8'),sfu=readFileSync(new URL('../media-server/server.js',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.ok(mc.includes("this.socket.emit('media:request',{id,method,data,sid:this.sid});"));
 assert.ok(mc.includes("async resume(){"));
 assert.ok(sfu.includes("if(method==='resume'){"));
 assert.ok(sfu.includes("ws.on('close',()=>{for(const p of [...peers.values()])if(p.bridge===ws)orphanPeer(p)});"));
 assert.ok(sfu.includes("const ENABLE_RTC_TCP=process.env.ENABLE_RTC_TCP!=='false';"));
 assert.ok(!sfu.includes("setTimeout(()=>process.exit(1),2000)"),'a dead worker no longer kills every lesson');
 assert.ok(app.includes("socket.on('media:resync'"));
 assert.ok(app.includes("navigator.wakeLock.request('screen')"));
});
