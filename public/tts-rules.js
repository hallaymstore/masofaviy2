// HALLAYM EDU — speech rules shared by server and browser:
// per-chunk language detection (Uzbek Latin/Cyrillic, Russian, English), Uzbek Cyrillic → Latin, chunking for natural
// intonation (whole sentences, never across a language change) and SSML for Microsoft neural voices (Madina, Sardor…).

export const VOICES={
  uz:{lang:'uz-UZ',female:'uz-UZ-MadinaNeural',male:'uz-UZ-SardorNeural',label:'O‘zbek'},
  ru:{lang:'ru-RU',female:'ru-RU-SvetlanaNeural',male:'ru-RU-DmitryNeural',label:'Rus'},
  en:{lang:'en-US',female:'en-US-JennyNeural',male:'en-US-GuyNeural',label:'Ingliz'}
};
export const VOICE_NAMES={'uz-UZ-MadinaNeural':'Madina','uz-UZ-SardorNeural':'Sardor','ru-RU-SvetlanaNeural':'Svetlana','ru-RU-DmitryNeural':'Dmitriy','en-US-JennyNeural':'Jenny','en-US-GuyNeural':'Guy'};
export const LANGS=Object.keys(VOICES);
export const MAX_CHUNK=420;

const CYR=/[Ѐ-ӿ]/g,LAT=/[a-z]/gi,UZ_CYR=/[ўқғҳЎҚҒҲ]/;
const UZ_WORDS=/\b(va|bu|uchun|bilan|ham|deb|emas|bo['‘’ʻ]?lib|qilib|bo['‘’ʻ]?ladi|edi|esa|yoki|lekin|hamda|kerak|o['‘’ʻ]?z|shu|ular|biz|sizning|qanday|nima|bir|ikki|uch|yil|kun)\b/gi;
const EN_WORDS=/\b(the|and|of|is|are|to|in|that|with|for|this|be|by|on|as|was|were|which|from|it)\b/gi;
const count=(s,rx)=>(String(s).match(rx)||[]).length;

// 'uz' | 'ru' | 'en' for a piece of text; `fallback` is the book's main language.
export function detectLang(text,fallback='uz'){
  const s=String(text||'');const c=count(s,CYR),l=count(s,LAT);
  if(c===0&&l===0)return fallback;
  if(c>l)return UZ_CYR.test(s)||/(?:^|[^\p{L}])(ва|учун|билан|ҳам|бу|китоб|талаба|менинг)(?=$|[^\p{L}])/iu.test(s)?'uz':'ru';
  if(/[‘ʻ]|o'|g'/i.test(s))return 'uz';
  const uz=count(s,UZ_WORDS),en=count(s,EN_WORDS);
  if(en>uz&&en>=2)return 'en';
  if(uz>0)return 'uz';
  return fallback==='ru'?'uz':fallback; // Latin text in a Russian book is far more likely Uzbek/transliterated than Russian
}

const MAP={а:'a',б:'b',в:'v',г:'g',д:'d',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'ʼ',ь:'',ы:'i',э:'e',ю:'yu',я:'ya',ё:'yo',ў:'oʻ',қ:'q',ғ:'gʻ',ҳ:'h'};
// Uzbek Cyrillic → Latin (the neural uz-UZ voices read the Latin alphabet). «е» is «ye» at word start or after a vowel.
export function uzCyrToLatin(text){
  return String(text||'').replace(/[Ѐ-ӿ]/g,(ch,i,str)=>{
    const lower=ch.toLowerCase(),up=ch!==lower;let out;
    if(lower==='е'){const prev=str[i-1]||' ';out=/[\s\p{P}аоуэиеёюяўАОУЭИЕЁЮЯЎ]/u.test(prev)?'ye':'e'}
    else out=MAP[lower]??ch;
    if(!up||!out)return out;
    const next=str[i+1]||'';return /[Ѐ-ӿ]/.test(next)&&next===next.toUpperCase()&&next!==next.toLowerCase()?out.toUpperCase():out[0].toUpperCase()+out.slice(1);
  });
}
// Text exactly as it should be sent to a voice of `lang`.
export const speakable=(text,lang)=>lang==='uz'&&/[Ѐ-ӿ]/.test(text)?uzCyrToLatin(text):String(text||'');

// Sentences → chunks of whole sentences (≤ MAX_CHUNK chars) with one language each.
export function chunkForSpeech(sentences,bookLang='uz'){
  const out=[];let cur=null;
  for(const raw of sentences||[]){
    const s=String(raw||'').trim();if(!s)continue;
    const lang=detectLang(s,bookLang);
    let rest=s;
    while(rest){
      let cut=rest.length<=MAX_CHUNK?rest.length:rest.lastIndexOf(' ',MAX_CHUNK);
      if(cut<1)cut=MAX_CHUNK;
      // Keep surrogate pairs intact even in unbroken strings.
      if(cut<rest.length&&/[\uD800-\uDBFF]/.test(rest[cut-1]))cut--;
      const part=rest.slice(0,cut).trim();rest=rest.slice(cut).trimStart();
      if(cur&&cur.lang===lang&&cur.text.length+1+part.length<=MAX_CHUNK){cur.text+=' '+part;cur.count++}
      else{cur={text:part,lang,count:1};out.push(cur)}
    }
  }
  return out;
}

const xml=s=>String(s).replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
export function voiceFor(lang,gender='female'){const v=VOICES[lang]||VOICES.uz;return gender==='male'?v.male:v.female}
export const ratePct=rate=>{const r=Math.min(2,Math.max(0.5,Number(rate)||1));const p=Math.round((r-1)*100);return (p>=0?'+':'')+p+'%'};
// Headings and list items get a short pause so the voice "breathes" like a human reader.
export function buildSsml(text,{lang='uz',gender='female',rate=1}={}){
  const v=VOICES[lang]||VOICES.uz;const body=xml(speakable(text,lang).replace(/\s+/g,' ').trim()).replace(/([:;])\s/g,'$1 <break time="250ms"/> ');
  return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="'+v.lang+'"><voice name="'+voiceFor(lang,gender)+'"><prosody rate="'+ratePct(rate)+'">'+body+'</prosody></voice></speak>';
}
