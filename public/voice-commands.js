// Deterministic Uzbek commands. Fuzzy matching is limited to navigation/labels;
// confirmation, submission and account changes always require explicit commands.
const CYR={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:'o',қ:'q',ғ:'g',ҳ:'h'};
export const normalize=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[а-яёўқғҳ]/g,c=>CYR[c]??c).replace(/[‘’'`ʻʼ“”"]/g,'').replace(/[^a-z0-9\s-]/g,' ').replace(/\s+/g,' ').trim();
export const hasWakeWord=text=>/^(?:hey\s+)?(?:yordamchi|madina|sardor|hallaym|kompyuter)(?:\s|,|$)/i.test(normalize(text));
const wake=/^(?:hey\s+)?(?:yordamchi|madina|sardor|hallaym|kompyuter)(?:\s+|$)/i;
const fillers=/\b(iltimos|marhamat|menga|meni|mani|manim|endi|qani|birorta|berchi|beringchi)\b/g;
const colloquial={ochvor:'och',ochvoring:'och',ochgin:'och',oching:'och',ochibergin:'och',ochibering:'och',korsatvor:'korsat',korsating:'korsat',korsatgin:'korsat',oqivor:'oqi',oqibergin:'oqi',oqibering:'oqi',otqaz:'otkaz',utkaz:'otkaz',qaytvor:'qayt',qayting:'qayt',oldiniga:'oldingi',keyingisi:'keyingi',keyingisini:'keyingi',boshqattan:'takrorla',qaytadan:'takrorla',xop:'ha',hop:'ha',xa:'ha',man:'men',maning:'mening'};
// Regional speech and typical recognition slips → one standard word. Toshkent, Farg‘ona, Xorazm (o→a, q→k),
// Qipchoq (y→j) and Russian-influenced pronunciations all reach the same command.
const MISHEARD={kamra:'kamera',kamira:'kamera',kamyera:'kamera',mikrafon:'mikrofon',mikropon:'mikrofon',mekrofon:'mikrofon',
  kutupxona:'kutubxona',kitobxona:'kutubxona',kutibxona:'kutubxona',kutubhona:'kutubxona',jadvol:'jadval',jadbal:'jadval',
  tapshiriq:'topshiriq',topshiruq:'topshiriq',tapshiruq:'topshiriq',topshirik:'topshiriq',vazipa:'vazifa',vidio:'video',videa:'video',vediyo:'video',kitop:'kitob',
  baxo:'baho',boho:'baho',darislar:'darslar',darsa:'darsga',daris:'dars',ilava:'ilova',jo:'yo',joq:'yoq',yok:'yoq',yuq:'yoq',xa:'ha',haa:'ha',xo:'ha',hop:'ha',xop:'ha',
  mabzu:'mavzu',mavzi:'mavzu',profel:'profil',bildirishnomala:'bildirishnomalar',toxtang:'toxta',toxtatgin:'toxtat',tuxta:'toxta',tuxtat:'toxtat',stop:'toxta',
  avoz:'ovoz',uchir:'ochir',uchur:'ochir',yaq:'yoq'};
const VERBS=new Set(['och','kir','yop','chiq','ot','qayt','korsat','oqi','boshla','toxtat','tingla','bos','top','qidir','izla','qoy','yubor','saqla','tanla','ayt','yoz','ochir','yoq','ber']);
// «ochvor», «ochchi», «ochaqol», «ochiver», «ochvoringchi», «kirib qo‘y» → «och» / «kir».
const VERB_TAILS=['voringchi','vorgin','voring','vorchi','vorin','ivor','vor','iver','ver','aqol','ibber','ib','ginchi','gin','ingchi','ingiz','ing','chi','sang','gina'];
function verbStem(w){
  if(VERBS.has(w))return w;
  for(const tail of VERB_TAILS)if(w.endsWith(tail)&&w.length>tail.length+1){const stem=w.slice(0,-tail.length);if(VERBS.has(stem))return stem;if(VERBS.has(stem+'i'))return stem+'i';if(VERBS.has(stem.replace(/i$/,'')))return stem.replace(/i$/,'');if(VERBS.has(stem.replace(/(.)\1$/,'$1')))return stem.replace(/(.)\1$/,'$1')}
  return w;
}
const CASES=['larining','larini','lariga','larida','laridan','ning','dagi','dan','sini','siga','ni','ga','da','im','ingiz','si'];
function dialectWord(w){
  if(MISHEARD[w])return MISHEARD[w];
  if(colloquial[w])return colloquial[w];
  if(['joq','jaxshi','jaqin','jol','jordam','jordamchi','jop'].includes(w))return 'y'+w.slice(1); // Qipchoq j→y
  // «kutupxonani», «mikrafonni»: fix the stem, keep the grammatical ending.
  for(const c of CASES)if(w.endsWith(c)&&w.length>c.length+2){const stem=w.slice(0,-c.length);if(MISHEARD[stem]&&MISHEARD[stem]!==stem)return MISHEARD[stem]+c}
  return verbStem(w);
}
// «och ber», «oqi bergin», «kir qoy»: the helper verb after a main verb adds nothing to the command.
const HELPERS=new Set(['ber','bering','bergin','berchi','bervor','beringchi','qoy','qoying','yubor','yuboring','ol','oling','qol'])
export function canonical(text){const words=normalize(text).replace(wake,'').replace(fillers,' ').split(' ').filter(Boolean).map(dialectWord);return words.filter((w,i)=>!(i>0&&HELPERS.has(w)&&VERBS.has(words[i-1]))).join(' ')}
// Loose sound key for the last-resort fuzzy match: q/k, x/h, o/a, double letters and j/y no longer matter.
export const soundKey=text=>canonical(text).replace(/q/g,'k').replace(/x/g,'h').replace(/o/g,'a').replace(/\bj/g,'y').replace(/(.)\1+/g,'$1');
export const PAGES=[
  ['dashboard','Bosh sahifa',['bosh sahifa','asosiy sahifa','bosh menyu','glavnaya']],
  ['schedule','Dars jadvali',['dars jadvali','jadval','jadvalim','mening jadvalim','raspisanie']],
  ['live','Jonli darslar',['jonli dars','guruh darslari','onlayn dars','darslar']],
  ['videos','Videodarslar',['videodars','video dars','videolar','video saboq']],
  ['courses','Fanlar va vazifalar',['fanlar va vazifalar','fanlar','fanlarim','vazifalar','vazifalarim','topshiriqlar','kurslar','predmetlar']],
  ['grades','Mening baholarim',['mening baholarim','baholar','baholarim','bahom','baho','elektron jurnal','otsenki']],
  ['myBooks','Mening kitoblarim',['mening kitoblarim','kitoblarim','shaxsiy kitoblar','audio kitoblar','audio kitob','javonim','moi knigi']],
  ['library','Elektron kutubxona',['elektron kutubxona','kutubxona','kitoblar','biblioteka']],
  ['libraryManage','Kutubxonachi paneli',['kutubxonachi paneli','kitoblarni boshqarish']],
  ['lab','Virtual laboratoriya',['virtual laboratoriya','laboratoriya','tajriba xonasi']],
  ['inclusion','Inklyuziv ta’lim',['inklyuziv talim','inklyuziv','alohida ehtiyojlar','moslashtirishlar']],
  ['communications','Xabarlar va forum',['xabarlar va forum','xabarlar','pochta','forum','soobsheniya']],
  ['myRequests','Murojaatlarim',['murojaatlarim','murojaat','arizalarim','arizalar','ariza']],
  ['units','Bo‘limlar va xizmatlar',['bolimlar va xizmatlar','bolimlar','xizmatlar']],
  ['workspace','Ish joyim',['ish joyim','ish stoli']],
  ['profile','Shaxsiy profil',['shaxsiy profil','profilim','profil','shaxsiy kabinet','kabinetim']],
  ['finalExams','Yakuniy nazorat',['yakuniy nazorat','imtihonlar','imtihon','ekzamen']],
  ['curriculum','O‘quv reja qamrovi',['oquv reja qamrovi','oquv reja']],
  ['search','Umumiy qidiruv',['umumiy qidiruv','qidiruv sahifasi']],
  ['history','O‘tilgan darslar',['otilgan darslar','darslar tarixi']],
  ['analytics','Statistika',['statistika','analitika']],['reports','Nazorat va hisobot',['nazorat va hisobot','hisobotlar']],
  ['university','Universitet',['universitet']],['structure','Tuzilma',['tuzilma']],['users','Foydalanuvchilar',['foydalanuvchilar']],
  ['settings','Platforma sozlamalari',['platforma sozlamalari']],['accessibility','Qulaylik sozlamalari',['qulaylik sozlamalari','qulaylik','sozlamalar','nastroyki']]
].map(([page,label,aliases])=>({page,label,aliases}));
const digits={nol:0,bir:1,ikki:2,uch:3,tort:4,besh:5,olti:6,yetti:7,sakkiz:8,toqqiz:9,on:10,yigirma:20,ottiz:30,qirq:40,ellik:50,oltmish:60,yetmish:70,sakson:80,toqson:90};
const ordinals=['birinchi','ikkinchi','uchinchi','tortinchi','beshinchi','oltinchi','yettinchi','sakkizinchi','toqqizinchi','oninchi'];
export function spokenNumber(raw){
  const text=normalize(raw).replace(/-/g,' ');if(/^\d+$/.test(text))return Number(text);
  const ordinal=ordinals.findIndex(w=>text===w||text===w+'si'||text===w+'sini');if(ordinal>=0)return ordinal+1;
  const words=text.split(' ');if(words.every(w=>w in digits))return words.reduce((sum,w)=>sum+digits[w],0);return null;
}
function distance(a,b){let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row}return prev[b.length]}
export function labelScore(query,label){
  const a=canonical(query),b=canonical(label);if(!a||!b)return 0;if(a===b)return 1;
  if((' '+b+' ').includes(' '+a+' '))return .93;
  if(Math.min(a.length,b.length)<5)return 0;
  return Math.max(0,1-distance(a,b)/Math.max(a.length,b.length));
}
const navigationText=text=>text.replace(/\b(och|ochib|ber|bering|bergin|kir|kiring|kirib|ot|oting|otib|otkaz|otkazib|olib|bor|korsat|korsatib|yubor|yuboring|sahifasi|sahifasiga|sahifasini|bolimi|bolimiga|mening)\b/g,' ').split(' ').filter(Boolean).map(w=>w.replace(/(?:siga|sini|ga|ni)$/,'').replace(/lar$/,'')).join(' ');
const commands=[
  ['stop',['toxta','toxtat','oqishni toxtat','jim','bas','pauza','stop']],['resume',['davom et','davom','oqishni davom ettir','prodolji']],
  ['back',['orqaga','orqaga qayt','orqaga ot','ortga','ortga qayt','avvalgi sahifa','oldingi sahifa','nazad']],
  ['forward',['oldinga','keyingi sahifa']],['close',['yop','yoping','oynani yop','kitobni yop','bekit','chiq']],
  ['help',['yordam','buyruqlar','nima qila olasan','qanday buyruqlar','yordam ber','help']],['repeat',['takrorla','takror ayt','yana ayt','qayta ayt']],
  ['listPages',['sahifalar','sahifalarni ayt','bolimlarni ayt','menyuni oqi','qayerga ota olaman']],
  ['listActions',['tugmalar','tugmalarni ayt','nimalar bor','nima qilsam boladi','amallarni ayt','variantlarni ayt']],
  ['listFields',['maydonlar','maydonlarni ayt','formani oqi']],['where',['qayerdaman','qaysi sahifadaman','qayottaman','qayirdaman']],
  ['readPage',['sahifani oqi','oqib ber','ekranni oqi','oqi','prochitay']],
  ['next',['keyingi','keyingi parcha','keyingi tugma']],['prev',['oldingi','oldingi parcha','oldingi tugma']],
  ['faster',['tezroq','tezlat','tezlashtir']],['slower',['sekinroq','sekinlat','sekinlashtir']],
  ['scrollDown',['pastga','pastga tush','pastga yur']],['scrollUp',['yuqoriga','tepaga','tepaga chiq']],
  ['top',['eng yuqoriga','sahifa boshiga']],['bottom',['eng pastga','sahifa oxiriga']],
  ['bigger',['kattaroq','kattalashtir','shriftni kattalashtir']],['smaller',['kichikroq','kichraytir']],
  ['contrast',['kontrast','yuqori kontrast']],['time',['soat necha','vaqt','qaysi kun','bugun nima kun']],
  ['notifications',['bildirishnomalar','bildirishnoma','xabarnoma']],['joinLesson',['darsga kir','darsga ulan','darsga qoshil','jonli darsga kir']],
  ['login',['tizimga kir','kirish','login','ovozli kirish']],
  ['logout',['tizimdan chiq','akkauntdan chiq','hisobdan chiq','chiqish','logout']],
  ['pauseListening',['tinglashni toxtat','mikrofonni ochir','yordamchini toxtat','meni tinglama']],
  ['resumeListening',['meni tingla','mikrofonni yoq','tinglashni boshla']],
  ['submit',['yubor','yuborish','saqla','saqlash','javobni yubor','javoblarni yubor','formani yubor']],
  ['clear',['tozala','maydonni tozala','yozuvni tozala']],['focused',['tanlanganini oqi','fokusni oqi']],
  ['maleVoice',['sardor ovozi','sardor ovozida gapir','erkak ovozi']],['femaleVoice',['madina ovozi','madina ovozida gapir','ayol ovozi']],
  ['yes',['ha','albatta','tasdiqlayman','tasdiqla','mayli','togri','da','yes']],['no',['yoq','bekor','bekor qil','kerak emas','net','no']]
];
export const COMMANDS=commands.map(([action,words])=>({action,words}));
export function matchCommand(raw){
  const original=String(raw||'').trim().replace(/^(?:(?:hey\s+)?(?:yordamchi|madina|sardor|hallaym|kompyuter)[,\s]+|iltimos\s+)+/i,'');
  const text=canonical(original);if(!text)return null;
  if(/\b(ochma|ochmang|kirma|kirmang|bosma|bosmang|yuborma|yubormang|chiqma|chiqmang)\b/.test(text))return null;
  for(const [rx,action] of [[/^(?:yoz|yozing|yozib ber|yozib qoy)\s+(.+)$/i,'dictate'],[/^(?:qidir|qidirib ber|izla|izlab ber|top)\s+(.+)$/i,'search'],[/^(?:bos|bosing|tanla|tanlang)\s+(.+)$/i,'activate'],[/^(?:maydon|maydonga ot)\s+(.+)$/i,'focusField']]){
    const match=original.match(rx);if(match)return {action,arg:match[1].trim(),text};
  }
  for(const c of COMMANDS)if(c.words.some(word=>canonical(word)===text))return {action:c.action,text};
  const indexed=text.match(/^(\d+|[a-z]+)(?:ni|sini)?\s+(kitob(?:ni)?|video(?:ni)?|fan(?:ni)?|tugma(?:ni)?|maydon(?:ni)?)\s*(?:och|bos|tanla|tingla|oqi|ber|ga ot)*$/);
  if(indexed){const index=spokenNumber(indexed[1]);if(index!==null)return {action:indexed[2].startsWith('maydon')?'focusField':'selectIndex',index,kind:indexed[2].replace(/ni$/,''),text}}
  const book=text.match(/^(?:kitob(?:ni|imni)?\s+(?:oqi|oqib ber|tingla|oqib bergin)|(?:oqi|tingla)\s+kitob(?:ni|imni)?)$/);
  if(book)return {action:'listenBook',text};
  const numbered=text.match(/^(\d+|[a-z]+)(?:ni|sini)?\s*(?:bos|tanla|och|tingla)$/);
  if(numbered){const index=spokenNumber(numbered[1]);if(index!==null)return {action:'selectIndex',index,text}}
  const field=text.match(/^(.+?)\s+maydon(?:i|iga|ini|ga)?(?:\s+(?:ot|tanla|och))?$/);if(field)return {action:'focusField',arg:field[1],text};
  const query=navigationText(text);
  const ranked=PAGES.map(p=>({...p,score:Math.max(...p.aliases.map(alias=>labelScore(query,navigationText(alias))))})).filter(p=>p.score>=.82).sort((a,b)=>b.score-a.score);
  if(ranked[0]&&(!ranked[1]||ranked[0].score-ranked[1].score>=.06))return {action:'go',page:ranked[0].page,text};
  const activate=text.match(/^(.+?)\s+(?:tugmasini\s+)?(?:bos|tanla|och)(?:\s+(?:ber|bering))?$/);if(activate)return {action:'activate',arg:activate[1],text};
  // Last resort: the same command said with a different accent («tuxtat», «kitobni oqiver», «kamrani yoq»).
  const key=soundKey(text);let best=null;
  for(const c of COMMANDS)for(const word of c.words){const k=soundKey(word);if(k.length<4)continue;const d=distance(key,k);const limit=k.length>=9?2:1;if(d<=limit&&(!best||d<best.d))best={d,action:c.action}}
  if(best&&!['yes','no','logout','submit'].includes(best.action))return {action:best.action,text,fuzzy:true};
  return null;
}
export const helpLines=()=>['«Kutubxonani ochib ber», «Jadvalimga o‘t», «Baholarim» — sahifaga o‘tish','«1-mavzuga kir», «HTML haqidagi videoni och», «Shu mavzuning topshirig‘ini och» — ichki materiallar','«Sahifani tushuntir», «Mavzularni sanab ber» — sahifa mazmuni','«Orqaga qayt», «Bosh sahifa», «Yop» — qaytish','«Tugmalarni ayt», «Birinchi tugmani bos» — sahifani boshqarish','«Maydonlarni ayt», «Ikkinchi maydon», «Yoz …», «Yubor» — formani to‘ldirish','«Kitobni o‘qi», «To‘xta», «Davom et», «Keyingi» — tinglash','«Tizimdan chiq» — tasdiq bilan chiqish'];
export function spokenToLogin(raw){const symbols={tire:'-',defis:'-',chiziqcha:'-',nuqta:'.',tochka:'.',kuchukcha:'@',sobaka:'@'};return normalize(raw).split(' ').map(w=>symbols[w]??digits[w]??w).join('').replace(/[^a-z0-9._@-]/g,'')}
export const spokenToDigits=raw=>spokenToLogin(raw).replace(/\D/g,'');
export const spellOut=value=>[...String(value||'')].map(ch=>({'-':'tire','.':'nuqta','_':'pastki chiziq','@':'kuchukcha'}[ch]||ch.toUpperCase())).join(', ');
