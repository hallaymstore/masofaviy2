import test from 'node:test';
import assert from 'node:assert/strict';
import {parseContextCommand as parse,resolveContextTargets as resolve,contentTokens,isNegated} from '../public/voice-context-rules.js';

const videos=[
  {id:'web1',kind:'video',title:'1-mavzu · HTML va semantik tuzilma',course:'Web dasturlash',module:'1-modul. Asosiy tushunchalar',path:'Web dasturlash / 1-modul. Asosiy tushunchalar',number:1,text:'HTML tuzilma va semantika bo‘yicha nazariya va amaliy misollar',ancestorIds:['web','webmod']},
  {id:'sql1',kind:'video',title:'1-mavzu · Relatsion model va SQL',course:'Ma’lumotlar bazasi',module:'1-modul. Asosiy tushunchalar',path:'Ma’lumotlar bazasi / 1-modul. Asosiy tushunchalar',number:1,text:'Jadval va ma’lumotlar haqida',ancestorIds:['sql']},
  {id:'web2',kind:'video',title:'2-mavzu · CSS selektorlari',course:'Web dasturlash',module:'1-modul. Asosiy tushunchalar',path:'Web dasturlash / 1-modul. Asosiy tushunchalar',number:2,text:'CSS selektorlari haqida',blocked:true,reason:'Oldingi video tugagach ochiladi',ancestorIds:['web','webmod']},
  {id:'web3',kind:'video',title:'3-mavzu · JavaScript asoslari',course:'Web dasturlash',module:'1-modul. Asosiy tushunchalar',path:'Web dasturlash / 1-modul. Asosiy tushunchalar',number:3,text:'Dasturlash tili',ancestorIds:['web','webmod']}
];
test('numbered, spoken, hyphenated and Cyrillic topics parse to context selectors',()=>{
  for(const raw of ['1-mavzuga kir','1mavzuni och','1chi mavzuga kir','1 mavzuni och','1-chi mavzuga o‘t','биринчи мавзуни очиб бер','birinchi mavzuga kir','Yordamchi, iltimos 1-mavzuni ochvor']){
    const intent=parse(raw);assert.equal(intent?.kind,'topic',raw);assert.equal(intent.ordinal,1,raw);assert.equal(intent.operation,'open',raw);assert.equal(intent.query,'',raw);
  }
});
test('names, descriptive queries and module/course parents survive Uzbek suffixes',()=>{
  assert.equal(parse('HTML haqidagi videoni och')?.query,'html');
  assert.equal(parse('Web dasturlash fanining 1-mavzusini och')?.kind,'topic');
  assert.equal(parse('Web dasturlash fanining 1-mavzusini och')?.query,'web dasturlash');
  assert.equal(parse('Mavzularni sanab ber')?.operation,'list');
  assert.equal(parse('HTML mavzusi haqida ma’lumot ber')?.operation,'describe');
  assert.equal(parse('HTML mavzusini o‘qib ber')?.operation,'read');
  assert.equal(parse('shu fanning keyingi mavzusini och')?.relative,1);
  assert.equal(parse('testni boshlash')?.kind,'quiz');
  assert.equal(parse('bu yerda qaysi mavzular bor')?.operation,'list');
  assert.equal(parse('shu mavzuning topshirig‘ini och')?.kind,'assignment');
  assert.deepEqual(contentTokens('SQL haqidagi videoni iltimos ochib ber'),['sql']);
});
test('a title number repeated across courses prompts for clarification',()=>{
  const result=resolve(parse('1-mavzuga kir'),videos);
  assert.equal(result.status,'ambiguous');assert.deepEqual(result.candidates.map(r=>r.id),['web1','sql1']);
  assert.equal(resolve(parse('birinchi mavzuni och'),videos).target.id,'web1');
});
test('course qualifier and content title resolve the intended action',()=>{
  assert.equal(resolve(parse('Web dasturlash fanining 1-mavzusini och'),videos).target?.id,'web1');
  assert.equal(resolve(parse('SQL haqidagi videoni och'),videos).target?.id,'sql1');
  assert.equal(resolve(parse('HTML va semantik tuzilma'),videos).target?.id,'web1');
  assert.equal(resolve(parse('semantika haqidagi mavzuni och'),videos).target?.id,'web1');
});
test('missing ordinals do not silently open another item and locks are preserved',()=>{
  assert.equal(resolve(parse('9-mavzuga kir'),videos).status,'missing');
  const locked=resolve(parse('2-mavzuga kir'),videos);assert.equal(locked.status,'blocked');assert.equal(locked.target.id,'web2');
  assert.equal(resolve(parse('keyingi mavzuga kir'),videos,{last:videos[0]}).status,'blocked');
  assert.equal(resolve(parse('keyingi mavzu'),videos).status,'missingReference');
});
test('current course scope and topic lists are grounded in rendered records',()=>{
  const anchor={id:'sql',kind:'course',course:'Ma’lumotlar bazasi'};
  assert.equal(resolve(parse('1-mavzuga kir'),videos,{anchor}).target.id,'sql1');
  const list=resolve(parse('Web dasturlash mavzularini sanab ber'),videos);assert.equal(list.status,'list');assert.equal(list.candidates.length,3);
});
test('nested tests are selected inside the referenced topic',()=>{
  const records=[{id:'topic1',kind:'topic',title:'Birinchi mavzu',number:1,path:'Web',ancestorIds:[]},{id:'topic2',kind:'topic',title:'Ikkinchi mavzu',number:2,path:'Web',ancestorIds:[]},{id:'q1',kind:'quiz',title:'Testni boshlash',number:null,path:'Web Birinchi mavzu',ancestorIds:['topic1']},{id:'q2',kind:'quiz',title:'Testni boshlash',number:null,path:'Web Ikkinchi mavzu',ancestorIds:['topic2']}];
  const intent=parse('2-mavzuning testini och');assert.equal(intent.kind,'quiz');assert.equal(intent.parentOrdinal,2);
  assert.equal(resolve(intent,records).target.id,'q2');
  assert.equal(resolve(parse('shu mavzuning testini och'),records,{anchor:records[0]}).target.id,'q1');
  const multi=parse('2-mavzuning birinchi testini och');assert.equal(multi.ordinal,1);assert.equal(resolve(multi,records).target.id,'q2');
});
test('negated speech and ordinary narration cannot become destructive commands',()=>{
  for(const raw of ['1-mavzuga kirma','HTML videoni ochmang','shu testni boshlama','kitobni o‘chirmang','buni qilish kerak emas']){assert.equal(isNegated(raw),true,raw);assert.equal(parse(raw),null,raw)}
  const request=parse('men bugun kitob o‘qidim');assert.equal(request.explicit,false);
  assert.equal(resolve(request,videos).status,'missing');
});
