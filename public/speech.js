// One cancellable speech engine for books, the accessibility panel and assistant.
import {chunkForSpeech,speakable,detectLang} from './tts-rules.js';
import {splitSentences} from './reader-rules.js';

const synth=typeof window!=='undefined'?window.speechSynthesis:null;
const ls=(key,fallback='')=>{try{return localStorage.getItem(key)??fallback}catch{return fallback}};
let voices=[],server=false,serverChecked=false,session=0,token=0,audio=null,busy=false,lastText='',cancelCurrent=null;
const cache=new Map();
const loadVoices=()=>{try{voices=synth?.getVoices()||[]}catch{voices=[]}};
loadVoices();synth?.addEventListener?.('voiceschanged',loadVoices);
const csrf=()=>document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('m2_csrf='))?.slice(8)||'';
function clearCache(){for(const promise of cache.values())promise.then(url=>URL.revokeObjectURL(url)).catch(()=>{});cache.clear()}
export const gender=()=>ls('hx-voice-gender','female')==='male'?'male':'female';
export function setGender(value){try{localStorage.setItem('hx-voice-gender',value==='male'?'male':'female')}catch{}clearCache()}
export const bookLang=()=>['uz','ru','en'].includes(ls('hx-voice-lang','uz'))?ls('hx-voice-lang','uz'):'uz';
export async function refreshServer(){
  const version=session;
  try{
    const r=await fetch('/api/tts/status',{credentials:'same-origin',cache:'no-store'});
    const result=r.ok?await r.json():null;
    if(version!==session)return server;
    server=Boolean(result?.server);serverChecked=true;
  }catch{if(version===session){server=false;serverChecked=true}}
  return server;
}
export function signedOut(){session++;stop();server=false;serverChecked=false;clearCache()}
export function browserVoice(lang){
  loadVoices();
  // An unrelated voice must never silently turn Uzbek into English/Russian speech.
  const list=voices.filter(v=>new RegExp('^'+lang+'(?:-|$)','i').test(v.lang));
  const selected=ls('hx-a11y-voice');
  if(selected){const voice=list.find(v=>v.voiceURI===selected);if(voice)return voice}
  const pattern=gender()==='male'?/sardor|dmitr|\bguy\b|\bmale\b|erkak/i:/madina|svetlana|jenny|\bfemale\b|ayol/i;
  return list.find(v=>pattern.test(v.name))||list.find(v=>/natural|online|neural/i.test(v.name))||list[0]||null;
}
export const hasUzbekVoice=()=>server||Boolean(browserVoice('uz'));
export function engineLabel(){
  if(server)return (gender()==='male'?'Sardor':'Madina')+' · o‘zbekcha';
  return browserVoice('uz')?.name||'O‘zbekcha ovozga ulanish kerak';
}
function fetchAudio(chunk,rate){
  const selected=gender(),key=[chunk.lang,selected,rate,chunk.text].join('|');
  if(!cache.has(key)){
    const promise=fetch('/api/tts/speak',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
      body:JSON.stringify({text:chunk.text,lang:chunk.lang,gender:selected,rate})})
      .then(async r=>{
        if(!r.ok){const e=await r.json().catch(()=>({}));throw Object.assign(new Error(e.message||'Ovoz olinmadi'),{status:r.status})}
        return URL.createObjectURL(await r.blob());
      });
    promise.catch(()=>{if(cache.get(key)===promise)cache.delete(key)});cache.set(key,promise);
    if(cache.size>60){const first=cache.keys().next().value;cache.get(first).then(url=>URL.revokeObjectURL(url)).catch(()=>{});cache.delete(first)}
  }
  return cache.get(key);
}
export function prefetch(chunks,rate=1){if(server)for(const chunk of (chunks||[]).slice(0,2))if(chunk?.text)fetchAudio(chunk,Math.round(rate*10)/10).catch(()=>{})}
export function stop(){
  token++;busy=false;
  if(audio){audio.onended=null;audio.onerror=null;audio.pause()}
  try{synth?.cancel()}catch{}
  const cancel=cancelCurrent;cancelCurrent=null;cancel?.();
}
export const isSpeaking=()=>busy||Boolean(synth?.speaking);
export async function speakChunk(chunk,{rate=1,onend,onerror,oncancel,title,next=[],owner='speech'}={}){
  stop();const current=token;busy=true;cancelCurrent=oncancel||null;
  const finish=(fn,arg)=>{if(current!==token)return;busy=false;cancelCurrent=null;fn?.(arg)};
  if(typeof document!=='undefined')document.dispatchEvent(new CustomEvent('hx-speech-start',{detail:{owner}}));
  if(!serverChecked)await refreshServer();
  if(current!==token)return;
  const speed=Math.round(Math.min(2,Math.max(0.5,Number(rate)||1))*10)/10;
  let serverError=null;
  if(server){
    try{
      const url=await fetchAudio(chunk,speed);if(current!==token)return;
      prefetch(next,speed);
      audio||=new Audio();audio.preload='auto';audio.src=url;
      audio.onended=()=>finish(onend);
      audio.onerror=()=>finish(onerror,new Error('Audio ijro etilmadi. Tinglash tugmasini qayta bosing.'));
      if('mediaSession' in navigator&&title)try{navigator.mediaSession.metadata=new MediaMetadata({title,artist:'HALLAYM EDU · '+engineLabel()})}catch{}
      await audio.play();return;
    }catch(e){if(current!==token)return;serverError=e}
  }
  if(current!==token)return;
  const voice=browserVoice(chunk.lang);
  if(!synth||!voice)return finish(onerror,serverError||new Error('O‘zbekcha ovoz mavjud emas. Internetni va server ovoz sozlamalarini tekshiring.'));
  const utterance=new SpeechSynthesisUtterance(speakable(chunk.text,chunk.lang));
  utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=speed;
  utterance.onend=()=>finish(onend);
  utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))finish(onerror,new Error('Brauzer ovozi ishlamadi: '+e.error))};
  synth.speak(utterance);if(synth.paused)synth.resume();
}
export function speak(text,{rate=1,onend,onerror,oncancel,onstart,lang,owner='assistant'}={}){
  const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean){onend?.();return false}
  lastText=clean;
  const chunks=chunkForSpeech(splitSentences(clean),lang||bookLang());let idx=0;
  const run=()=>{
    if(idx>=chunks.length){onend?.();return}
    void speakChunk(chunks[idx],{rate,owner,next:chunks.slice(idx+1,idx+3),oncancel,
      onend:()=>{idx++;run()},onerror:e=>onerror?.(e)});
  };
  run();onstart?.();return true;
}
export const lastSpoken=()=>lastText;
export {detectLang,chunkForSpeech};
if(typeof window!=='undefined')window.HxSpeech={speak,speakChunk,stop,prefetch,refreshServer,signedOut,engineLabel,hasUzbekVoice,setGender,gender,isSpeaking,browserVoice};
