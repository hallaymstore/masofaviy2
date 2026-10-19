import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseQuestion,parseDay,resolveDate,describeSchedule,describeWeek,describeAssignments,describeLive,parseFind,hitScore,lessonsForDate} from '../public/voice-knowledge-rules.js';

const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const NOW=new Date(2026,9,16,10,0); // Friday 16 October 2026, 10:00

test('questions about schedule, assignments and the live lesson are understood', ()=>{
  assert.deepEqual(parseQuestion('ertangi kun jadvali qanaqa'),{topic:'schedule',day:{offset:1}});
  assert.deepEqual(parseQuestion('dars jadvalida ertaga nechta dars bor'),{topic:'schedule',day:{offset:1}});
  assert.deepEqual(parseQuestion('dushanba kuni qanday darslar bor'),{topic:'schedule',day:{weekday:1}});
  assert.deepEqual(parseQuestion('bugun qanaqa darslar bor'),{topic:'schedule',day:{offset:0}});
  assert.deepEqual(parseQuestion('haftalik jadvalni ayt'),{topic:'schedule',day:{week:true}});
  assert.equal(parseQuestion('jadval'),null,'bare page name stays navigation');
  assert.equal(parseQuestion('jadvalni och'),null);
  assert.deepEqual(parseQuestion('topshiriqlar qanaqa'),{topic:'assignments',when:'open'});
  assert.deepEqual(parseQuestion('ertaga qaysi topshiriqlarni topshirishim kerak'),{topic:'assignments',when:'tomorrow'});
  assert.deepEqual(parseQuestion('muddati o‘tgan vazifalarim bormi'),{topic:'assignments',when:'overdue'});
  assert.deepEqual(parseQuestion('hozirgi darsni och'),{topic:'live',action:'open'});
  assert.deepEqual(parseQuestion('jonli guruh darsiga kir'),{topic:'live',action:'open'});
  assert.deepEqual(parseQuestion('joriy dars qaysi'),{topic:'live',action:'ask'});
  assert.deepEqual(parseQuestion('hozir dars bormi'),{topic:'live',action:'ask'});
  assert.equal(parseQuestion('kutubxonani och'),null);
  assert.deepEqual(parseDay('indinga'),{offset:2});
  assert.equal(resolveDate({offset:1},NOW).getDate(),17);
  assert.equal(resolveDate({weekday:1},NOW).getDate(),19,'next Monday');
});

test('find requests name the thing and its kind', ()=>{
  assert.deepEqual(parseFind('Amir Temur kitobini och'),{kind:'library',query:'amir temur',listen:false});
  assert.deepEqual(parseFind('amir temur haqidagi kitobni topib o‘qib ber'),{kind:'library',query:'amir temur',listen:true});
  assert.equal(parseFind('javascript videosini qo‘y').kind,'video');
  assert.equal(parseFind('oliy matematika fanini och').kind,'course');
  assert.equal(parseFind('och'),null);
  assert.equal(parseFind('salom qalaysan'),null);
  assert.ok(hitScore('amir temur',{title:'Amir Temur tuzuklari'})>hitScore('amir temur',{title:'Temur Malik',subtitle:'Kutubxona'}));
  assert.equal(hitScore('amir temur',{title:'Fizika'}),0);
});

test('spoken answers are short, ordered and honest', ()=>{
  const rows=[{title:'Fizika',weekday:6,start:'10:00',end:'11:20',room:'204',mode:'offline',teacherId:{fullName:'A. Karimov'}},{title:'Matematika',weekday:6,start:'08:30',end:'09:50',mode:'online'},{title:'Tarix',weekday:5,start:'08:30',end:'09:50'},{title:'Yakuniy',weekday:6,start:'12:00',end:'13:00',kind:'final_exam'}];
  const tomorrow=resolveDate({offset:1},NOW);
  assert.deepEqual(lessonsForDate(rows,tomorrow).map(r=>r.title),['Matematika','Fizika']);
  const text=describeSchedule(rows,tomorrow,NOW);
  assert.match(text,/^Ertaga, shanba, 17-oktabr 2 ta dars\. 1\. soat 08:30 dan 09:50 gacha — Matematika, onlayn\. 2\. soat 10:00/);
  assert.match(text,/o‘qituvchi A\. Karimov, 204-xona, auditoriyada/);
  assert.match(describeSchedule(rows,resolveDate({weekday:7},NOW),NOW),/dars yo‘q\.$/);
  assert.match(describeWeek(rows,NOW),/juma 1 ta, shanba 2 ta/);
  const tasks=[{title:'Laboratoriya 3',course:'Fizika',dueAt:new Date(2026,9,17,23,59)},{title:'Referat',course:'Tarix',dueAt:new Date(2026,9,10)},{title:'Esse',course:'Adabiyot'},{title:'Topshirilgan',dueAt:new Date(2026,9,17),submitted:true}];
  assert.match(describeAssignments(tasks,'tomorrow',NOW),/^Ertaga topshiriladigan topshiriqlar: 1 ta\. 1\. Laboratoriya 3, Fizika fanidan, muddati ertaga, shanba, 17-oktabr soat 23:59\.$/);
  assert.match(describeAssignments(tasks,'overdue',NOW),/Referat/);
  assert.match(describeAssignments(tasks,'open',NOW),/2 ta\..*Laboratoriya 3.*Esse, Adabiyot fanidan, muddatsiz/);
  assert.equal(describeAssignments([],'today',NOW),'Bugun topshiriladigan topshiriq yo‘q.');
  assert.equal(describeLive([{session:{status:'active'},canJoin:true,schedule:{_id:'L1',title:'Fizika',end:'11:20'}}]).text,'Hozir Fizika ketyapti, soat 11:20 gacha.');
  assert.match(describeLive([{session:{status:'scheduled'},schedule:{title:'Kimyo',start:'13:30'}}]).text,/Hozir jonli dars yo‘q\. Keyingi dars soat 13:30 da: Kimyo\./);
});

function fakeDom(found){
  globalThis.CSS={escape:s=>s};
  const el={classList:{add(){},remove(){}},scrollIntoView(){},closest(){return null},click(){found.clicked=true}};
  globalThis.document={querySelector:sel=>found.selectors.some(s=>sel.includes(s))?el:null};
  globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
}
test('«Amir Temur kitobini och» walks to the book and asks resume or restart', async()=>{
  const found={selectors:['data-listen'],clicked:false};fakeDom(found);
  const {createVoiceKnowledge}=await import('../public/voice-knowledge.js');
  const said=[],calls=[],pages=[];
  const api=async path=>{calls.push(path);if(path==='/my-books')return {books:[{id:'b1',title:'Amir Temur tuzuklari',progress:{page:41,idx:3}}]};if(path.startsWith('/search'))return {results:[{type:'library',id:'L9',title:'Temur va temuriylar',subtitle:'Kutubxona'}]};return {}};
  const listened=[];let played=0;
  const k=createVoiceKnowledge({api,go:async p=>pages.push(p),say:async t=>said.push(t),currentUser:()=>({_id:'u1'}),myBooks:{listen:(id,o)=>listened.push([id,o])},playReader:()=>played++,openSearchHit:async()=>{},enterLive:async()=>{}});
  assert.equal(await k.handleFind('Amir Temur kitobini och'),true);
  assert.deepEqual(pages,['myBooks']);
  assert.ok(said.some(t=>/42-sahifada to‘xtagansiz\. Qolgan joyidan davom ettiraymi yoki boshidan boshlaymi\?/.test(t)),said.join(' | '));
  assert.equal(k.hasPending(),true);
  assert.equal(await k.answer('boshidan boshla'),true);
  assert.deepEqual(listened,[['b1',{fromStart:true}]]);assert.equal(played,1);assert.equal(k.hasPending(),false);
});
test('several matches become a spoken numbered choice; live lesson asks before joining', async()=>{
  const found={selectors:['data-listen'],clicked:false};fakeDom(found);
  const {createVoiceKnowledge}=await import('../public/voice-knowledge.js');
  const said=[],opened=[],joined=[];
  const api=async path=>{if(path==='/my-books')return {books:[]};if(path.startsWith('/search'))return {results:[{type:'video',id:'v1',title:'Javascript asoslari'},{type:'course',id:'c1',courseId:'c1',title:'Javascript dasturlash'}]};
    if(path==='/live/rooms')return {rooms:[{session:{status:'active'},canJoin:true,schedule:{_id:'S1',title:'Fizika',end:'11:20'}}]};return {}};
  const k=createVoiceKnowledge({api,go:async()=>{},say:async t=>said.push(t),currentUser:()=>({_id:'u1'}),myBooks:{listen(){}},playReader(){},openSearchHit:async h=>opened.push(h.id),enterLive:async id=>joined.push(id)});
  await k.handleFind('javascript ni top va och');
  assert.match(said.at(-1),/2 ta mos natija bor\. 1\. Javascript asoslari — videodars\. 2\. Javascript dasturlash — fan\. Qaysi birini ochay\?/);
  await k.answer('ikkinchisi');assert.deepEqual(opened,['c1']);
  await k.handleQuestion('joriy dars qaysi');
  assert.match(said.at(-1),/Hozir Fizika ketyapti.*Darsga kiraymi\?/);
  await k.answer('ha');assert.deepEqual(joined,['S1']);
  said.length=0;await k.handleQuestion('hozirgi darsni och');assert.deepEqual(joined,['S1','S1']);
});

test('assistant routes questions and cross-page finds before saying «not found»', ()=>{
  const va=read('public/voice-assistant.js'),app=read('public/app.js'),sw=read('public/sw.js'),pkg=JSON.parse(read('package.json'));
  assert.ok(va.includes("if(knowledge.hasPending()&&await knowledge.answer(text))return;"));
  assert.ok(va.includes("await knowledge.handleQuestion(text))return;"));
  assert.ok(va.includes("if(result.status==='missing'&&currentUser()&&parseFind(text)){pending=null;await knowledge.handleFind(text);return}"));
  assert.ok(app.includes("enterLive:id=>enterLiveRoom(id),openSearchHit:hit=>openGlobalSearchResult(hit)"));
  assert.ok(sw.includes("'/voice-knowledge.js'")&&sw.includes("'/voice-knowledge-rules.js'"));
  assert.ok(pkg.scripts.check.includes('public/voice-knowledge.js'));
});

test('more questions: next lesson, grades by subject, unread messages, who am I', async()=>{
  const {parseQuestion,describeNext,describeGrades,describeMessages}=await import('../public/voice-knowledge-rules.js');
  assert.deepEqual(parseQuestion('keyingi dars qachon'),{topic:'nextLesson'});
  assert.deepEqual(parseQuestion('matematikadan bahom qanday'),{topic:'grades',subject:'matematika'});
  assert.deepEqual(parseQuestion('yangi xabar bormi'),{topic:'messages'});
  assert.deepEqual(parseQuestion('qaysi guruhdaman'),{topic:'whoami'});
  assert.equal(parseQuestion('baholarni och'),null,'opening the page stays navigation');
  const now=new Date(2026,9,16,10,0);
  const rows=[{title:'Fizika',weekday:5,start:'08:30',end:'09:50'},{title:'Kimyo',weekday:5,start:'13:30',end:'14:50',room:'210'},{title:'Tarix',weekday:6,start:'08:30',end:'09:50'}];
  assert.equal(describeNext(rows,now),'Bugun, juma, 16-oktabr soat 13:30 da Kimyo, 210-xona.');
  assert.match(describeNext([{title:'Fizika',weekday:5,start:'09:30',end:'11:00'}],now),/^Hozir Fizika ketyapti, soat 11:00 gacha\.$/);
  const book={rows:[{status:'graded',courseTitle:'Oliy matematika',assignmentTitle:'1-nazorat',score:8,scale:10,percent:80},{status:'graded',courseTitle:'Fizika',assignmentTitle:'Lab',score:4,scale:5,percent:80},{status:'pending',courseTitle:'Fizika'}],stats:{pending:1}};
  assert.match(describeGrades(book,'matematika'),/^O‘rtacha natijangiz 80 foiz, 1 ta baho\. Oxirgilari: Oliy matematika, 1-nazorat — 8 dan 10\. Yana 1 ta ish tekshirilmoqda\.$/);
  assert.match(describeGrades({rows:[],stats:{pending:0}}),/baholangan ishingiz yo‘q/);
  assert.equal(describeMessages([{readAt:new Date()},{senderId:{fullName:'Dekanat'},subject:'Imtihon jadvali'}]),'1 ta o‘qilmagan xabar. Dekanatdan: Imtihon jadvali. O‘qish uchun «xabarlar» deng.');
});

test('app and page never talk at once; a silent page cannot keep the microphone off', ()=>{
  const bridge=read('public/native-bridge.js'),svc=read('android/app/src/main/java/uz/hallaym/edu/VoiceService.kt'),bus=read('android/app/src/main/java/uz/hallaym/edu/VoiceBus.kt');
  assert.ok(bridge.includes("if(state==='wake'){try{window.HxSpeech?.stop?.()}"),'wake word stops the page voice');
  assert.ok(svc.includes('VoiceBus.state("wake")')&&svc.includes('VoiceBus.reallySpeaking()'));
  assert.ok(bus.includes('System.currentTimeMillis() - speakingAt < 25_000'));
  assert.ok(svc.includes('googleFailures = 0 // try the accurate engine again'),'falls back to offline only for a minute');
  assert.ok(!svc.includes('say(R.raw.va_labbay) { captureCommand() }'),'no long phrase before listening — fast speakers are not cut off');
});
