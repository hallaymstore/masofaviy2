import test from "node:test";
import assert from "node:assert/strict";
import {installAiAssistant} from "../ai-assistant.js";
function createApp(){
  const handlers={};
  const app={get(path,...args){handlers["GET "+path]=args.at(-1)},post(path,...args){handlers["POST "+path]=args.at(-1)}};
  installAiAssistant(app,{auth:(_req,_res,next)=>next()});
  return handlers;
}
function reply(){
  return {code:200,headers:{},
    status(code){this.code=code;return this;},
    set(key,value){this.headers[key]=value;return this;},
    json(data){this.data=data;return this;}
  };
}
function request({user,body}={}){return {user:user||{_id:"test-user",role:"student"},body:body||{}};}
test("AI requires Groq key and never exposes a provider credential in status",async()=>{
  const saved=process.env.GROQ_API_KEY;
  try{
    delete process.env.GROQ_API_KEY;
    const routes=createApp(),res=reply();
    await routes["GET /api/ai/status"](request(),res);
    assert.equal(res.code,200);
    assert.equal(res.data.enabled,false);
    assert.equal("key" in res.data,false);
    const rejected=reply();
    await routes["POST /api/ai/chat"](request({body:{prompt:"Salom",mode:"chat"}}),rejected);
    assert.equal(rejected.code,503);
  }finally{if(saved===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=saved;}
});
test("student cannot generate teacher-only plans",async()=>{
  const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY="dummy-local-test-token";
  try{
    const route=createApp()["POST /api/ai/chat"],res=reply();
    await route(request({body:{prompt:"Test kerak",mode:"quiz"}}),res);
    assert.equal(res.code,403);
  }finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test("AI is disabled on examination pages",async()=>{
  const old=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY="dummy-local-test-token";
  try{
    const route=createApp()["POST /api/ai/chat"],res=reply();
    await route(request({body:{prompt:"Javob yoz",mode:"chat",page:"finalExams"}}),res);
    assert.equal(res.code,403);
  }finally{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;}
});
test("Groq request uses server key, returns answer, decrements quota",async()=>{
  const old=process.env.GROQ_API_KEY,oldFetch=globalThis.fetch;
  process.env.GROQ_API_KEY="dummy-local-test-token";
  let requestUrl="",requestHeaders=null,requestBody=null;
  globalThis.fetch=async(url,options)=>{
    requestUrl=url;requestHeaders=options.headers;requestBody=JSON.parse(options.body);
    return {ok:true,json:async()=>({choices:[{message:{content:"Statistika — ma’lumotlarni tahlil qilish fani."}}]})};
  };
  try{
    const routes=createApp(),user={_id:"ai-user-check-12345",role:"student"},res=reply();
    await routes["POST /api/ai/chat"](request({user,body:{prompt:"Statistika nima?",mode:"explain",page:"courses"}}),res);
    assert.equal(res.code,200);
    assert.match(res.data.answer,/Statistika/);
    assert.equal(requestUrl,"https://api.groq.com/openai/v1/chat/completions");
    assert.equal(requestHeaders.Authorization,"Bearer dummy-local-test-token");
    assert.equal(requestBody.model,"openai/gpt-oss-20b");
    assert.ok(requestBody.messages.some(x=>x.content.includes("Statistika nima?")));
    const status=reply();
    await routes["GET /api/ai/status"](request({user}),status);
    assert.equal(status.data.remaining,24);
    assert.equal("key" in res.data,false);
  }finally{
    globalThis.fetch=oldFetch;
    if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old;
  }
});
