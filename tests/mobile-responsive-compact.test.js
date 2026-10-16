import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=src('public/mobile-ui-compact.css'),html=src('public/index.html'),sw=src('public/sw.js');
test('compact CSS loads after every legacy classroom layer',()=>{
 const idx=html.indexOf('/mobile-ui-compact.css?v=20261012-compact1');
 assert.ok(idx>0);
 assert.ok(idx>html.indexOf('/live-classroom-2026.css'));
 assert.ok(idx>html.indexOf('/live-participant-rail.css'));
});
test('mobile classroom bounds use a single viewport height instead of competing hard-coded stages',()=>{
 for(const token of ['@media(max-width:900px)','height:calc(100dvh - 52px - 43px - 12px - env(safe-area-inset-bottom))',
 '#lesson .conference-main{','#lesson .video-stage{','flex:1 1 0!important','min-height:0!important',
 '#lesson #videoMount.video-mount','overflow:hidden!important',
 '#lesson .conference-controls.zoom-dock','position:relative!important',
 '#lesson .lesson-student-rail{','height:73px!important'])assert.ok(css.includes(token),token);
});
test('compact control row remains usable, does not overlap the stage, and opened menu is constrained',()=>{
 for(const token of ['height:43px!important','min-height:43px!important','min-width:0!important',
 '#lesson #liveMorePanel{','max-height:min(60dvh,430px)','grid-template-columns:repeat(3,minmax(0,1fr))',
 '#lesson .lesson-side.open{transform:translateX(0)!important','overscroll-behavior-x:contain'])assert.ok(css.includes(token),token);
 assert.ok(!css.includes('pointer-events:none!important;\n #lesson .zoom-control'));
});
test('viewport layout applies to teacher and student without covering media or adjacent pages',()=>{
 assert.ok(css.includes('html[data-user-role="student"] #shell'));
 assert.ok(css.includes('html[data-user-role="teacher"] #shell'));
 assert.ok(css.includes('@media(max-width:900px) and (orientation:landscape)'));
 assert.ok(css.includes('max-width:100%'));
 assert.ok(css.includes('#shell>main .table-wrap'));
 assert.ok(css.includes('#shell>main .schedule-sheet-host'));
 assert.ok(css.includes('#shell>main .course-topic-item'));
 assert.ok(css.includes('border-radius:4px'));
});
test('PWA caches correct query-free pathname, while app loads versioned stylesheet',()=>{
 assert.ok(sw.includes("m2-v126-voice-control"));
 assert.ok(sw.includes("'/mobile-ui-compact.css?v=20261012-compact1'"));
 assert.ok(sw.includes("'/mobile-ui-compact.css'"));
 assert.ok(!sw.includes("'/mobile-ui-compact.css?v=20261012-compact1','/timetable.html'"));
 assert.ok(!html.includes('public/__compact_mobile_probe.html'));
});
