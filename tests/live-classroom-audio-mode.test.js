import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const mc=read('frontend/media-client.js'),app=read('public/app.js'),html=read('public/index.html');

test('in-room devices play no lesson audio and keep audio consumers paused on the SFU',()=>{
 assert.ok(mc.includes("isAudioSilenced(a){\n    if(this.inRoom)return true;"));
 assert.ok(mc.includes("if(!(consumer.kind==='audio'&&this.inRoom))await this.request('resumeConsumer'"));
 assert.ok(mc.includes("if(next){c.pause();await this.request('pauseConsumer',{consumerId:c.id})}"));
 assert.ok(mc.includes("if(hardStop||this.isAudioSilenced(a)){"));
 assert.ok(mc.includes("if(this.isAudioSilenced(audio)||(active&&"));
});

test('teacher never plays microphones of students sitting in the room (breaks the cross-device loop)',()=>{
 assert.ok(mc.includes("inRoom:Boolean(this.inRoom),aec:true"));
 assert.ok(mc.includes("audio.dataset.inRoom=meta.appData?.inRoom?'1':'0'"));
 assert.ok(mc.includes("return a?.dataset?.inRoom==='1'&&this.user?.role==='teacher';"));
});

test('students choose classroom/remote before audio starts; feedback alerts re-offer classroom mode',()=>{
 assert.ok(app.includes("if(user.role==='student'){const saved=roomModeSaved();client.inRoom=saved?saved==='room':true}\n    await client.connect();"));
 assert.ok(app.includes("if(user.role==='student'&&!mediaRoomClient.inRoom)showRoomModeSheet('feedback');"));
 assert.ok(app.includes("localStorage.setItem('m2-room-mode:'+activeLessonId,mode)"));
 assert.ok(html.includes('id="callRoomMode"'));
});
