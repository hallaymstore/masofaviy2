import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rememberPlayback,readPlayback,playbackResumeSeconds,checkpointKey} from '../public/video-playback-state.js';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function storage(){const data=new Map();return {setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,data}}
test('resumes the last actual position, not cumulative watched time',()=>{
 assert.equal(playbackResumeSeconds({lastPositionSeconds:58,watchedSeconds:280,durationSeconds:600}),58);
 assert.equal(playbackResumeSeconds({lastPositionSeconds:0,watchedSeconds:280,durationSeconds:600}),0);
});
test('keeps distinct per-account and per-video checkpoints',()=>{
 const s=storage(),now=Date.now();
 rememberPlayback(s,'student1','lesson1',73,600,now);
 rememberPlayback(s,'student1','lesson2',19,60,now);
 rememberPlayback(s,'student2','lesson1',15,600,now);
 assert.equal(readPlayback(s,'student1','lesson1').position,73);
 assert.equal(readPlayback(s,'student1','lesson2').position,19);
 assert.equal(readPlayback(s,'student2','lesson1').position,15);
 assert.notEqual(checkpointKey('student1','lesson1'),checkpointKey('student2','lesson1'));
});
test('recent same-device checkpoint wins while pending upload, but newer server progress wins',()=>{
 const s=storage(),now=Date.now();
 rememberPlayback(s,'student1','v1',42.8,120,now);
 const local=readPlayback(s,'student1','v1');
 assert.equal(playbackResumeSeconds({lastPositionSeconds:37,lastViewedAt:new Date(now-10000).toISOString(),durationSeconds:120},local),42.8);
 assert.equal(playbackResumeSeconds({lastPositionSeconds:59,lastViewedAt:new Date(now+10000).toISOString(),durationSeconds:120},local),59);
});
test('end-of-video position resets to replay and invalid/stale cache entries are ignored',()=>{
 const s=storage(),now=Date.now();
 rememberPlayback(s,'x','v',119,120,now);
 assert.equal(playbackResumeSeconds({lastPositionSeconds:119,durationSeconds:120},readPlayback(s,'x','v')),0);
 assert.equal(readPlayback(s,'x','missing'),null);
 s.setItem(checkpointKey('x','old'),JSON.stringify({position:8,duration:10,at:now-91*86400000}));
 assert.equal(readPlayback(s,'x','old'),null);
 assert.equal(rememberPlayback(s,'x','neg',-5,100,now).position,0);
});
test('navigation, logout, and related-video switching all stop the active player',()=>{
 assert.ok(app.includes("function go(id){if(id!=='videoWatch'&&activeVideoId){clearWatchPage()"));
 assert.ok(app.includes("function logout(){if(activeVideoId)clearWatchPage()"));
 assert.ok(app.includes("if(activeVideoId)clearWatchPage(); // Switch between related videos"));
 assert.ok(app.includes("if(save)saveCurrentVideoProgress(false,true)"));
 assert.ok(app.includes("player?.querySelectorAll('iframe')"));
 assert.ok(app.includes("frame.src='about:blank';frame.remove()"));
 assert.ok(app.includes("player?.querySelectorAll('video')"));
 assert.ok(app.includes('watchSessionSerial++'));
});
test('late YouTube callback cannot restart stopped playback and progress writes are ordered',()=>{
 assert.ok(app.includes("if(!current())return; // Leaving the page"));
 assert.ok(app.includes('if(!current()){try{e.target.destroy()}'));
 assert.ok(app.includes("if(!current())return;if(e.data===YT.PlayerState.ENDED)"));
 assert.ok(app.includes("const previous=videoProgressWrites.get(String(videoId))"));
 assert.ok(app.includes("rememberPlayback(localStorage,user?._id"));
 assert.ok(app.includes("watchLastSavedAt=now;await persistVideoProgress"));
 assert.ok(sw.includes('video-playback-state.js'));
});
