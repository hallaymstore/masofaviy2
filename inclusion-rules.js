// HALLAYM EDU — inclusive education: needs catalogue, accommodations and per-user accessibility preferences.
// Pure functions shared by the API, the browser (public/inclusion-ui.js imports the copy served at /inclusion-rules.js)
// and the tests. Disability data is sensitive: only the needs keys and the accommodation numbers live here, never diagnoses.

export const NEEDS={
  blind:{label:'Ko‘zi ojiz (ko‘rmaydi)',short:'Ko‘zi ojiz',icon:'🦯',hint:'Ovozli yordamchi, ekran o‘quvchi rejimi, audio kitoblar',
    prefs:{voiceAssistant:true,speakFocus:true,speakNotifications:true,audioBooks:true,reduceMotion:true},extraTimePct:50},
  low_vision:{label:'Zaif ko‘ruvchi',short:'Zaif ko‘ruvchi',icon:'👓',hint:'Katta shrift, yuqori kontrast, audio kitoblar',
    prefs:{fontScale:1.5,contrast:'high',largeTargets:true,audioBooks:true,speakNotifications:true},extraTimePct:25},
  deaf:{label:'Eshitishda nuqson (kar yoki zaif eshituvchi)',short:'Eshitishda nuqson',icon:'🧏',hint:'Doimiy subtitr, ko‘rinadigan ogohlantirishlar, chat orqali muloqot',
    prefs:{captions:true,visualAlerts:true},extraTimePct:25},
  motor:{label:'Harakatlanishda nuqson (qo‘l yoki tana harakati cheklangan)',short:'Harakatda nuqson',icon:'♿',hint:'Katta tugmalar, ovoz bilan boshqarish, klaviatura bilan to‘liq ishlash',
    prefs:{largeTargets:true,voiceAssistant:true},extraTimePct:50},
  speech:{label:'Nutqida nuqson',short:'Nutqida nuqson',icon:'💬',hint:'Darsda chat va yozma javob, mikrofonsiz qatnashish',
    prefs:{chatFirst:true},extraTimePct:0},
  cognitive:{label:'O‘qish yoki diqqat qiyinchiligi (disleksiya, DEHB)',short:'O‘qish/diqqat',icon:'🧠',hint:'Soddalashtirilgan ko‘rinish, o‘qish uchun qulay shrift, matnni ovozda tinglash',
    prefs:{dyslexia:true,simplified:true,reduceMotion:true,audioBooks:true},extraTimePct:25},
  chronic:{label:'Surunkali kasallik yoki boshqa sabab',short:'Surunkali kasallik',icon:'🩺',hint:'Imtihonda qo‘shimcha vaqt, moslashuvchan muddatlar',
    prefs:{},extraTimePct:25}
};
export const NEED_KEYS=Object.keys(NEEDS);
export const STATUSES={none:'Belgilanmagan',pending:'Tasdiq kutilmoqda',verified:'Tasdiqlangan',rejected:'Rad etilgan'};

// Every preference the client understands, with its default. Unknown keys are dropped.
export const PREF_DEFAULTS={
  fontScale:1,          // 1 … 2 (rem multiplier)
  contrast:'normal',    // normal | high
  dyslexia:false,       // wider letter/word spacing, no justified text
  reduceMotion:false,
  largeTargets:false,   // ≥48px touch targets
  underlineLinks:false,
  simplified:false,     // hides decorative panels and secondary widgets
  focusRing:true,       // thick visible keyboard focus
  captions:false,       // live-lesson captions on by default
  visualAlerts:false,   // flash the screen for sounds/notifications
  chatFirst:false,      // live lesson opens with chat focused
  voiceAssistant:false, // spoken prompts + voice commands
  speakFocus:false,     // self-voicing: read the focused control aloud
  speakNotifications:false,
  audioBooks:false,     // show «Audio tinglash» everywhere text can be read aloud
  ttsRate:1,            // 0.5 … 2
  ttsVoice:'',          // SpeechSynthesisVoice.voiceURI chosen by the user
  ttsLang:'uz-UZ',      // preferred reading language
  sttLang:'uz-UZ'       // preferred voice-command language
};
const LANGS=new Set(['uz-UZ','ru-RU','en-US','tr-TR','kk-KZ']);
const clamp=(n,a,b,d)=>{const x=Number(n);return Number.isFinite(x)?Math.min(b,Math.max(a,x)):d};

export function cleanNeeds(list){
  const arr=Array.isArray(list)?list:String(list||'').split(/[;,|\s]+/);
  return [...new Set(arr.map(x=>String(x||'').trim().toLowerCase()).filter(x=>NEEDS[x]))];
}

export function cleanPrefs(input={}){
  const out={};
  for(const [k,def] of Object.entries(PREF_DEFAULTS)){
    if(!(k in (input||{})))continue;
    const v=input[k];
    if(typeof def==='boolean')out[k]=Boolean(v);
    else if(k==='fontScale')out[k]=Math.round(clamp(v,1,2,1)*100)/100;
    else if(k==='ttsRate')out[k]=Math.round(clamp(v,0.5,2,1)*100)/100;
    else if(k==='contrast')out[k]=v==='high'?'high':'normal';
    else if(k==='ttsLang'||k==='sttLang')out[k]=LANGS.has(String(v))?String(v):def;
    else if(k==='ttsVoice')out[k]=String(v||'').slice(0,200);
  }
  return out;
}

// What the needs imply when the user has not chosen otherwise.
export function defaultsFor(needs){
  const out={};
  for(const n of cleanNeeds(needs)){
    for(const [k,v] of Object.entries(NEEDS[n].prefs)){
      if(typeof v==='boolean')out[k]=Boolean(out[k])||v;
      else if(typeof v==='number')out[k]=Math.max(Number(out[k]||0),v);
      else out[k]=v;
    }
  }
  return out;
}
// Effective prefs = platform defaults ← needs-based defaults ← the user's own explicit choices.
export function effectivePrefs(inclusion){
  const verified=inclusion?.status==='verified'||inclusion?.status==='pending';
  return {...PREF_DEFAULTS,...(verified?defaultsFor(inclusion?.needs):{}),...cleanPrefs(inclusion?.prefs||{})};
}

export const suggestedExtraPct=needs=>cleanNeeds(needs).reduce((m,n)=>Math.max(m,NEEDS[n].extraTimePct),0);
export const cleanExtraPct=v=>Math.round(clamp(v,0,100,0));
// Only staff-verified accommodations change exam timing.
export const extraPctOf=inclusion=>inclusion?.status==='verified'?cleanExtraPct(inclusion.extraTimePct):0;
export const examMinutes=(base,inclusion)=>{const b=Number(base)||0;return Math.round(b*(1+extraPctOf(inclusion)/100))};
export const examMs=(base,inclusion)=>Math.round((Number(base)||0)*60000*(1+extraPctOf(inclusion)/100));

// Shape returned to the student themself (no staff notes) or to staff (with notes).
export function profileView(inclusion,{staff=false}={}){
  const x=inclusion||{};
  const out={needs:cleanNeeds(x.needs),status:STATUSES[x.status]?x.status:'none',extraTimePct:extraPctOf(x),requestedExtraPct:cleanExtraPct(x.extraTimePct),
    selfNote:String(x.selfNote||''),requestedAt:x.requestedAt||null,verifiedAt:x.verifiedAt||null,consentAt:x.consentAt||null};
  if(staff)out.notes=String(x.notes||'');
  return out;
}
export const needLabels=needs=>cleanNeeds(needs).map(n=>NEEDS[n].icon+' '+NEEDS[n].short);
