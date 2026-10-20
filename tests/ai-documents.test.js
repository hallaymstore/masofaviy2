import test from 'node:test';
import assert from 'node:assert/strict';
import {installAiDocumentAnalysis} from '../ai-documents.js';

function setup(){
  const routes={};
  const app={post(p,...f){routes['POST '+p]=f.at(-1)},get(p,...f){routes['GET '+p]=f.at(-1)}};
  installAiDocumentAnalysis(app,{auth:(_req,_res,next)=>next()});
  return routes;
}
function res(){
  return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this},status(c){this.statusCode=c;return this},
    json(x){this.data=x;return this}};
}
const req=(owner,body={},id='')=>({user:{_id:owner},body,params:{id}});
const pages=[{page:1,text:'Universitet kutubxonasi va ta’lim tizimi mavzusidagi matn. '.repeat(8)}];
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
test('document AI requires Groq key and rejects missing/partial PDF pages',()=>{
  const original=process.env.GROQ_API_KEY;
  try{
    delete process.env.GROQ_API_KEY;
    const routes=setup(),r=res();
    routes['POST /api/ai/document/summary'](req('no-key',{title:'Test',pageCount:1,pages}),r);
    assert.equal(r.statusCode,503);
    process.env.GROQ_API_KEY='fake-key';
    const partial=res();
    routes['POST /api/ai/document/summary'](req('partial-pages',{title:'Test',pageCount:2,pages}),partial);
    assert.equal(partial.statusCode,400);
  }finally{if(original===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=original;}
});
test('document analysis returns only to owner, reads all text and polls completion',async()=>{
  const key=process.env.GROQ_API_KEY,fetcher=globalThis.fetch;
  process.env.GROQ_API_KEY='local-test-placeholder';
  let calls=0,requestBody='';
  globalThis.fetch=async(_url,init)=>{
    requestBody=init.body;calls++;
    return {ok:true,json:async()=>({choices:[{message:{content:calls===1?'Sahifa 1: kutubxona va ta’lim.':'Kitobning xulosasi sahifa 1 asosida yozildi.'}}]})};
  };
  try{
    const routes=setup(),start=res();
    routes['POST /api/ai/document/summary'](req('owner-pdf',{title:'Nazariy kitob',pageCount:1,pages}),start);
    assert.equal(start.statusCode,202);
    assert.equal(start.data.total,1);
    const no=res();
    routes['GET /api/ai/document/:id'](req('different-person',{},start.data.jobId),no);
    assert.equal(no.statusCode,404);
    for(let i=0;i<20;i++){await pause();const result=res();
      routes['GET /api/ai/document/:id'](req('owner-pdf',{},start.data.jobId),result);
      if(result.data?.status==='completed'){
        assert.equal(result.data.done,1);assert.equal(result.data.pageCount,1);
        assert.match(result.data.answer,/xulosasi/);
        assert.equal(calls,2);assert.match(requestBody,/Sahifalar 1/);return;
      }
    }
    assert.fail('Background summary was not completed.');
  }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
});
test('rejects unauthorized exam context and oversized document',()=>{
  const key=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='local-test-placeholder';
  try{
    const routes=setup(),r=res();
    routes['POST /api/ai/document/summary'](req('exam-person',{title:'Test',page:'finalExams',pageCount:1,pages}),r);
    assert.equal(r.statusCode,403);
    const oversized=res();
    routes['POST /api/ai/document/summary'](req('long-book',{title:'Long',pageCount:1,
      pages:[{page:1,text:'ABC '.repeat(165000)}]}),oversized);
    assert.equal(oversized.statusCode,413);
  }finally{if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
});
