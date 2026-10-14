import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {annotateVideoLocks} from '../video-learning-rules.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('public/app.js'),server=read('server.js'),css=read('public/premium-ui.css'),html=read('public/index.html'),sw=read('public/sw.js');
const progress={completed:true,verifiedCompleted:true,durationSeconds:100,lastPositionSeconds:10,watchedSeconds:95};

test('list endpoint returns locked learning path to staff as well as students',()=>{
 assert.ok(server.includes('annotateVideoLocks(scored,pm,true)'));
 assert.ok(!server.includes("annotateVideoLocks(scored,pm,req.user.role==='student')"));
 const rows=[
   {_id:'1',subject:'Ma’lumotlar bazasi',moduleTitle:'1-modul',sequence:1},
   {_id:'2',subject:'Ma’lumotlar bazasi',moduleTitle:'1-modul',sequence:2},
   {_id:'3',subject:'Ma’lumotlar bazasi',moduleTitle:'2-modul',sequence:1}
 ];
 const before=annotateVideoLocks(rows,{},true);
 assert.deepEqual(before.map(v=>v.locked),[false,true,true]);
 const after=annotateVideoLocks(rows,{'1':progress},true);
 assert.deepEqual(after.map(v=>v.locked),[false,false,true]);
});
test('the locked topic replaces blue Ko‘rish action and precedes the disabled test button',()=>{
 assert.ok(app.includes("locked=Boolean(v.locked)"));
 assert.ok(app.includes("locked?'video-topic-lock':'primary'"));
 assert.ok(app.includes("locked?'🔒 Oldingi video tugagach ochiladi'"));
 const render=app.slice(app.indexOf('function renderVideoLearningPaths('),app.indexOf('async function loadVideoLessons('));
 assert.ok(render.indexOf('data-video-play')<render.indexOf('data-video-checkpoint'));
 assert.ok(css.includes('.learning-topic-actions{'));
 assert.ok(css.includes('flex-direction:column;'));
 assert.ok(css.includes('.learning-topic-actions button.video-topic-lock:disabled'));
});
test('recommended and related video buttons are disabled too',()=>{
 const card=app.slice(app.indexOf('function videoCard('),app.indexOf('function renderVideoLearningPaths('));
 assert.ok(card.includes("v.locked?'disabled"));
 assert.ok(card.includes("v.locked?'🔒'"));
 assert.ok(card.includes('🔒 Oldingi video tugagach ochiladi'));
 const actions=app.slice(app.indexOf('function bindVideoActions('),app.indexOf('function loadYouTubePlayerApi('));
 assert.ok(actions.includes('if(!v||v.locked)'));
 assert.ok(actions.includes("b.onclick=null"));
});
test('no role may bypass learning-page lock, staff must use separate preview action',()=>{
 const player=app.slice(app.indexOf('async function openVideoLesson('),app.indexOf('function clearWatchPage()'));
 assert.ok(player.includes("if(v.locked&&!staffPreview)return toast("));
 assert.ok(player.includes("preview&&user?.role!=='student'"));
 assert.ok(player.includes("await api('/videos/'+encodeURIComponent(id)+'/playback')"));
 assert.ok(player.indexOf("await api('/videos/'+encodeURIComponent(id)+'/playback')")<player.indexOf('await renderWatchPlayer(v)'));
 assert.ok(app.includes('data-video-preview'));
 assert.ok(app.includes('openVideoLesson(b.dataset.videoPreview,true,true)'));
});
test('old cached layout invalidated in PWA and HTML',()=>{
 assert.ok(sw.includes("const CACHE='m2-v110-hx-chat'"));
 assert.ok(sw.includes('/app.js?v=20261014-hx3'));
 assert.ok(html.includes('app.js?v=20261014-hx3'));
 assert.ok(html.includes('premium-ui.css?v=20261013-lock7'));
});
