import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UZBEK_LESSONS,lessonsForProgram,LESSONS_PER_MAJOR} from '../public/qdtu-uz-lessons.js';

const catalog=readFileSync(new URL('../public/qdtu-video-catalog.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

const majors=(()=>{
 const block=catalog.match(/const RAW_PROGRAMS = String\.raw`([\s\S]*?)`;/);
 assert.ok(block,'QDTU yo‘nalishlar ro‘yxati mavjud bo‘lishi kerak');
 return block[1].trim().split('\n').map(line=>{
  const [code,name,group]=line.split('|');
  return {code,name,group};
 });
})();

test('QDTU katalogida 63 ta alohida yo‘nalish mavjud',()=>{
 assert.equal(majors.length,63);
 assert.equal(new Set(majors.map(m=>m.code)).size,63);
 majors.forEach(m=>{assert.match(m.code,/^\d{8}$/);assert.ok(m.name&&m.group);});
});

test('Har bir yo‘nalishga kamida 5 ta haqiqiy YouTube IDli o‘zbekcha dars moslangan',()=>{
 assert.equal(LESSONS_PER_MAJOR,5);
 for(const program of majors){
   const list=lessonsForProgram(program,LESSONS_PER_MAJOR);
   assert.equal(list.length,5,program.name+' uchun 5 ta dars bo‘lishi kerak');
   assert.equal(new Set(list.map(video=>video.id)).size,5,program.name+' darslari takrorlanmasligi kerak');
   list.forEach(video=>{
     assert.match(video.id,/^[A-Za-z0-9_-]{11}$/,program.name);
     assert.equal(video.language,'O‘zbekcha');
     assert.ok(video.groups.includes(program.group)||video.tags.includes(program.code));
   });
 }
});

test('Ommaviy kutubxonadagi videolar takrorlanmaydi va soha bo‘yicha qidiriladi',()=>{
 assert.ok(UZBEK_LESSONS.length>=65);
 assert.equal(new Set(UZBEK_LESSONS.map(v=>v.id)).size,UZBEK_LESSONS.length);
 for(const group of new Set(majors.map(p=>p.group))){
   assert.ok(UZBEK_LESSONS.filter(v=>v.groups.includes(group)).length>=5,group);
 }
 assert.match(catalog,/UZBEK_LESSONS\.slice\(index,index\+12\)/);
 assert.match(catalog,/new IntersectionObserver/);
 assert.match(catalog,/loading="lazy"/);
 assert.match(catalog,/www\.youtube\.com\/embed/);
});

test('Videodars modal emas, mustaqil page bo‘lib ochiladi va chiqish tugmasi mavjud',()=>{
 assert.match(catalog,/watch\.id='qdtuVideoWatch'/);
 assert.match(catalog,/watch\.className='page qv-watch-page'/);
 assert.match(catalog,/watch\.classList\.add\('active'\)/);
 assert.match(catalog,/youtube\.com\/embed/);
 assert.match(catalog,/data-qv-back/);
 assert.match(catalog,/YouTube.da ko‘rish/);
 assert.doesNotMatch(catalog,/showModal\(/);
});
test('Mavjud LMS videodarslari va tavsiyalar moduli saqlanadi',()=>{
 assert.match(index,/qdtu-video-catalog\.js\?v=/);
 assert.match(index,/qdtu-video-catalog\.css\?v=/);
 assert.match(index,/id="recommendedVideos"/);
 assert.match(index,/id="videoLessons"/);
 assert.match(app,/rows\.slice\(displayed,displayed\+24\)/);
 assert.match(app,/videoListObserver=new IntersectionObserver/);
});
