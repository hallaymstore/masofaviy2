import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('public/telegram-design.css'),html=read('public/index.html'),app=read('public/app.js'),sw=read('public/sw.js');
test('Telegram-inspired visual layer loads last, after responsive geometry and core CSS',()=>{
 const tg=html.indexOf('/telegram-design.css?v=20261013-rc5');
 for(const x of ['/mobile-ui-compact.css','/premium-ui.css','/live-classroom-2026.css','/styles.css'])assert.ok(tg>html.indexOf(x),x);
 assert.ok(tg>0);
 assert.ok(css.includes('--tg-blue:#3390ec'));
 assert.ok(css.includes('--tg-radius:5px'));
});
test('sidebar and section hierarchy use compact, readable controls and consistent active indicator',()=>{
 for(const selector of ['#shell>header','#sidebar nav button.active','#sidebar .nav-group summary','#shell>main .page-head h1',
 '#shell>main :is(article','.tg-course-avatar','#lesson .zoom-control.danger',
 '#courseList.tg-course-list','#live .live-scroll-list .live-room-card'])assert.ok(css.includes(selector),selector);
 assert.ok(css.includes('border-left-color:var(--tg-blue)'));
 assert.ok(css.includes('border-radius:4px'));
});
test('course list rows keep accessible subject metadata and original event hook',()=>{
 assert.ok(app.includes("classList.add('tg-course-list')"));
 assert.ok(app.includes('class="tg-course-row"'));
 assert.ok(app.includes('class="tg-course-info"'));
 assert.ok(app.includes('data-course="'+ "'+esc(c._id)+'"));
 assert.ok(app.includes("all('[data-course]').forEach(b=>b.onclick=()=>openCourse(b.dataset.course))"));
 assert.ok(css.includes('#shell>main #courseList.tg-course-list>.tg-course-row'));
});
test('live rooms retain join buttons while changing to concise schedule rows',()=>{
 assert.ok(app.includes('data-live-join='));
 assert.ok(app.includes("all('[data-live-join]').forEach(b=>b.onclick=()=>enterLiveRoom(b.dataset.liveJoin))"));
 assert.ok(css.includes('grid-template-columns:minmax(105px,auto) minmax(0,1fr) auto'));
 assert.ok(css.includes('#live .live-room-card .room-actions'));
});
test('syllabus, materials and tests keep same functionality in thinner-row appearance',()=>{
 const plan=read('public/course-plan-ui.js');
 for(const token of ['data-topic-add','data-topic-edit','data-topic-delete','data-topic-assign','data-quiz-review','data-assignment'])
 assert.ok(plan.includes(token),token);
 assert.ok(css.includes('#shell>main .course-topic-card .course-topic-item'));
 assert.ok(css.includes('border-bottom:1px solid var(--tg-line-light)'));
});
test('light/dark themes, small phones and PWA cache are supported',()=>{
 assert.ok(css.includes('html[data-theme="dark"]'));
 assert.ok(css.includes('@media(max-width:900px)'));
 assert.ok(css.includes('@media(max-width:430px)'));
 assert.ok(sw.includes('m2-v108-hx-design'));
 assert.ok(sw.includes("'/telegram-design.css?v=20261013-rc5'"));
 assert.ok(sw.includes("'/telegram-design.css'"));
 assert.ok(sw.includes('/app.js?v=20261014-hx1'));
});
