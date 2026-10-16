import test from 'node:test';
import assert from 'node:assert/strict';
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));

test('speech cancellation, language fallback and long assistant messages',async t=>{
  const saved=new Map();
  for(const key of ['window','document','localStorage','Audio','SpeechSynthesisUtterance','fetch'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  t.after(()=>{for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]});
  let browserCalls=[],audioCalls=0,available=[];
  const synth={getVoices:()=>available,addEventListener(){},cancel(){},speak(utterance){browserCalls.push(utterance);queueMicrotask(()=>utterance.onend?.())}};
  globalThis.window={speechSynthesis:synth};globalThis.document=Object.assign(new EventTarget(),{cookie:'m2_csrf=test'});
  const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  globalThis.Audio=class {pause(){}async play(){audioCalls++;queueMicrotask(()=>this.onended?.())}};
  globalThis.SpeechSynthesisUtterance=class {constructor(text){this.text=text}};
  let moduleNumber=0;const load=()=>import('../public/speech.js?test='+(++moduleNumber));
  await t.test('stop during status lookup cannot start stale audio',async()=>{
    let resolveStatus;globalThis.fetch=()=>new Promise(resolve=>{resolveStatus=resolve});
    const S=await load();let canceled=0;
    S.speak('Salom!',{oncancel:()=>canceled++});S.stop();resolveStatus(Response.json({server:true}));await tick();
    assert.equal(audioCalls,0);assert.equal(browserCalls.length,0);assert.equal(canceled,1);
  });
  await t.test('Uzbek is never silently spoken by an English voice',async()=>{
    available=[{lang:'en-US',name:'English',voiceURI:'en'}];globalThis.fetch=async()=>Response.json({server:false});
    const S=await load();let failure=null;await S.speakChunk({text:'Bu kitob.',lang:'uz'},{onerror:e=>{failure=e}});
    assert.match(failure.message,/O‘zbekcha/);assert.equal(browserCalls.length,0);
  });
  await t.test('female/male selection cannot confuse female with male',async()=>{
    available=[{lang:'uz-UZ',name:'Madina Female',voiceURI:'female'},{lang:'uz-UZ',name:'Sardor Male',voiceURI:'male'}];
    const S=await load();S.setGender('male');assert.match(S.browserVoice('uz').name,/Sardor/);S.setGender('female');assert.match(S.browserVoice('uz').name,/Madina/);
  });
  await t.test('a long assistant paragraph is chunked and finishes',async()=>{
    const requests=[];globalThis.fetch=async(url,options)=>{if(url.endsWith('/status'))return Response.json({server:true});requests.push(JSON.parse(options.body));return new Response(new Blob([new Uint8Array(300)]),{headers:{'Content-Type':'audio/mpeg'}})};
    const S=await load();await S.refreshServer();
    await new Promise((resolve,reject)=>S.speak(Array.from({length:180},(_,i)=>'Kitoblarimiz '+i).join(' '),{onend:resolve,onerror:reject}));
    assert.ok(requests.length>3);assert.ok(requests.every(row=>row.text.length<=420));assert.equal(S.isSpeaking(),false);
  });
  await t.test('logout during audio fetch cancels playback and clears session state',async()=>{
    let resolveAudio;globalThis.fetch=async url=>url.endsWith('/status')?Response.json({server:true}):new Promise(resolve=>{resolveAudio=resolve});
    const S=await load();await S.refreshServer();const count=audioCalls;
    const pending=S.speakChunk({text:'Salom!',lang:'uz'});S.signedOut();resolveAudio(new Response(new Blob([new Uint8Array(300)])));await pending;
    assert.equal(audioCalls,count);assert.equal(S.isSpeaking(),false);
  });
});
