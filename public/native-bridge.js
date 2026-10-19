// HALLAYM EDU — bridge to the Android app (android/ in this repo). Inside the app the microphone is owned by the native
// voice service: it listens continuously without the browser's on/off beeps, wakes on «Madina» in the background and
// hands every recognised phrase to the same web assistant. This file makes that native stream look like the browser's
// SpeechRecognition, so voice-assistant.js works unchanged in both places.
const native=typeof window!=='undefined'?window.HallaymNative:null;
export const inApp=()=>Boolean(native&&typeof native.setWebListening==='function');

let current=null;
// Called by the app: window.HxNative.result(["matn 1","matn 2"]) and window.HxNative.state("listening"|"idle"|"error", message)
if(typeof window!=='undefined')window.HxNative={
  result(alternatives){
    const list=(Array.isArray(alternatives)?alternatives:[alternatives]).map(String).filter(Boolean);
    if(!list.length||!current)return false;
    const row=list.map(transcript=>({transcript}));row.isFinal=true;
    current.onresult?.({resultIndex:0,results:[row]});return true;
  },
  state(state,message){
    // «Madina» was heard: the page stops talking immediately so the two assistants never speak at once.
    if(state==='wake'){try{window.HxSpeech?.stop?.()}catch{};try{window.speechSynthesis?.cancel()}catch{};document.querySelectorAll('audio').forEach(a=>{if(!a.paused&&!a.closest('.ar-dialog'))a.pause()});return}
    if(!current)return;
    if(state==='error')current.onerror?.({error:message||'network'});
    else if(state==='listening')current.onstart?.();
  },
  // A command said to the app while the page was hidden (wake word in the background) is delivered here.
  command(text){return window.HxVoiceAssistant?.execute?.(String(text||''))}
};

class NativeRecognition{
  constructor(){this.lang='uz-UZ';this.continuous=true;this.interimResults=false;this.maxAlternatives=5}
  start(){current=this;try{native.setWebListening(true)}catch{};setTimeout(()=>{if(current===this)this.onstart?.()},0)}
  stop(){this.abort()}
  abort(){if(current!==this)return;current=null;try{native.setWebListening(false)}catch{};setTimeout(()=>this.onend?.(),0)}
}
export const nativeRecognitionFactory=()=>new NativeRecognition();

// While the page speaks, the app must not listen (otherwise «Madina» in our own answer would wake it).
export function speakingChanged(on){if(inApp())try{native.setSpeaking(Boolean(on))}catch{}}
export function appInfo(){if(!inApp())return null;try{return JSON.parse(native.info())}catch{return {}}}

// In the app: a live lesson needs the microphone for WebRTC, so the voice service steps aside while the lesson page is
// open; the assistant panel gets an «Ilova sozlamalari» button (wake word, engine, background listening).
if(inApp()&&typeof document!=='undefined'){
  let last=null;
  const sync=()=>{const busy=document.documentElement.dataset.page==='lesson';if(busy!==last){last=busy;try{native.setMicBusy(busy)}catch{}}};
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-page']});sync();
  const addButton=()=>{const dock=document.getElementById('vaDock');if(!dock||dock.querySelector('#vaAppSettings'))return;
    const b=document.createElement('button');b.type='button';b.id='vaAppSettings';b.className='hx-plain';b.textContent='⚙ Ilova sozlamalari';b.onclick=()=>{try{native.openSettings()}catch{}};
    (dock.querySelector('.va-actions')||dock).append(b)};
  new MutationObserver(addButton).observe(document.documentElement,{childList:true,subtree:true});
}
