import test from 'node:test';
import assert from 'node:assert/strict';
import {installAiMedia} from '../ai-media.js';
const response=()=>({code:200,status(n){this.code=n;return this},set(){return this},json(data){this.data=data;return this}});
const request=(id,body={},jobId='')=>({user:{_id:id,role:'student'},body,params:{id:jobId}});
function setup(source=async()=>({kind:'video',title:'Moliya asoslari',sourceText:'00:00 Dars rejasi: moliya tushunchasi, byudjet daromadlari, mustaqil o‘qish. '.repeat(4),progress:{viewedSeconds:600,durationSeconds:1800,completed:false},related:[]})){
 const routes={};const app={get(p,...h){routes['GET '+p]=h.at(-1)},post(p,...h){routes['POST '+p]=h.at(-1)}};
 installAiMedia(app,{auth:(q,s,next)=>next(),authorizedSource:source});return routes;
}
const wait=()=>new Promise(r=>setTimeout(r,0));
test('media AI needs explicit consent, Groq key and excludes exams',async()=>{
 const old=process.env.GROQ_API_KEY;
 try{
  delete process.env.GROQ_API_KEY;
  const handlers=setup(),noKey=response();
  await handlers['POST /api/ai/media/analyze'](request('student1',{kind:'video',id:'video1',consent:true}),noKey);
  assert.equal(noKey.code,503);
  process.env.GROQ_API_KEY='test-only';
  const noConsent=response();
  await handlers['POST /api/ai/media/analyze'](request('student2',{kind:'video',id:'video1'}),noConsent);
  assert.equal(noConsent.code,400);
  const exam=response();
  await handlers['POST /api/ai/media/analyze'](request('student3',{page:'finalExams',kind:'live',id:'lesson',consent:true}),exam);
  assert.equal(exam.code,403);
 }finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('media AI never bypasses source ACL',async()=>{
 const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='test-only';
 try{
  const routes=setup(async()=>{throw Object.assign(new Error('Ruxsat yo‘q'),{status:403})}),res=response();
  await routes['POST /api/ai/media/analyze'](request('unauthorized',{kind:'video',id:'private',consent:true}),res);
  assert.equal(res.code,403);assert.equal(res.data.message,'Ruxsat yo‘q');
 }finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test('media AI returns personalized result only to job owner',async()=>{
 const key=process.env.GROQ_API_KEY,fetcher=globalThis.fetch;process.env.GROQ_API_KEY='test-only';
 let calls=0,requestText='';
 globalThis.fetch=async(_url,init)=>{
    calls++;requestText=init.body;
    return {ok:true,json:async()=>({
      choices:[{message:{content:calls===1?'Darsda budjet tushunchasi aytilgan.':'Talabaga 3 ta mustaqil topshiriq va 5 ta savol tavsiya qilindi.'}}]
    })};
  };
 try{
  const routes=setup(),started=response();
  await routes['POST /api/ai/media/analyze'](request('unique-student',{kind:'video',id:'video123',consent:true,goal:'Budjetni tushunish'}),started);
  assert.equal(started.code,202);
  const notOwner=response();routes['GET /api/ai/media/:id'](request('other-student',{},started.data.jobId),notOwner);
  assert.equal(notOwner.code,404);
  for(let n=0;n<24;n++){
   await wait();
   const result=response();routes['GET /api/ai/media/:id'](request('unique-student',{},started.data.jobId),result);
   if(result.data?.status==='completed'){
    assert.equal(calls,2);assert.match(result.data.answer,/topshiriq/);assert.match(requestText,/600/);assert.match(requestText,/Budjetni tushunish/);return;
   }
  }
  assert.fail('Media AI job did not complete.');
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
});
