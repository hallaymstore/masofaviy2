import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const catalog=readFileSync(new URL('../public/qdtu-video-catalog.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

test('QDTU katalogi amaldagi kunduzgi qabulning 63 ta yonalishini saqlaydi',()=>{
 const block=catalog.match(/const RAW_PROGRAMS = String\.raw`([\s\S]*?)`;/);
 assert.ok(block,'Yo‘nalishlar bazasi topilishi kerak');
 const lines=block[1].trim().split('\n');
 assert.equal(lines.length,63);
 const majors=lines.map(line=>line.split('|'));
 assert.equal(new Set(majors.map(([code])=>code)).size,63);
 majors.forEach(([code,name,group])=>{
  assert.match(code,/^\d{8}$/);
  assert.ok(name&&group);
 });
});

test('YouTube havolalari takrorlanmaydi va barcha sohaga tavsiya bera oladi',()=>{
 const ids=[...catalog.matchAll(/\{id:'([A-Za-z0-9_-]{11})'/g)].map(match=>match[1]);
 assert.ok(ids.length>=15);
 assert.equal(new Set(ids).size,ids.length);
 assert.match(catalog,/new IntersectionObserver/);
 assert.match(catalog,/PER_BATCH = 12/);
 assert.match(catalog,/loading="lazy"/);
 assert.match(catalog,/youtube-nocookie\.com\/embed/);
});

test('Yangi katalog eski LMS videodarslariga tegmay alohida ulanadi',()=>{
 assert.match(index,/qdtu-video-catalog\.js\?v=/);
 assert.match(index,/qdtu-video-catalog\.css\?v=/);
 assert.match(index,/id="recommendedVideos"/);
 assert.match(index,/id="videoLessons"/);
 assert.match(app,/rows\.slice\(displayed,displayed\+24\)/);
 assert.match(app,/videoListObserver=new IntersectionObserver/);
});
