// HALLAYM EDU — voice command matcher (Uzbek Latin/Cyrillic and Russian). Pure: no DOM, used by inclusion-ui.js and the tests.
const CYR={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:'o',қ:'q',ғ:'g',ҳ:'h'};
// Lowercase, Cyrillic → Latin, drop apostrophes/punctuation so "o‘qi", "o'qi", "ўқи" and "oqi" all match.
export function normalize(text){
  return String(text||'').toLowerCase().replace(/[а-яёўқғҳ]/g,c=>CYR[c]??c)
    .replace(/[‘’'`ʻʼ"]/g,'').replace(/[^a-z0-9\s-]/g,' ').replace(/\s+/g,' ').trim();
}

// Order matters: specific phrases before generic ones. Each pattern is matched against the normalized text.
export const COMMANDS=[
  {action:'stop',words:['toxta','toxtat','jim','stop','bas','stoy','xvatit','pauza'],help:'«To‘xta» — o‘qishni to‘xtatadi'},
  {action:'resume',words:['davom','davom et','prodolji'],help:'«Davom et» — o‘qishni davom ettiradi'},
  {action:'help',words:['yordam','nima qila olasan','buyruqlar','pomosh','help'],help:'«Yordam» — buyruqlar ro‘yxati'},
  {action:'repeat',words:['takrorla','qayta ayt','yana ayt','povtori'],help:'«Takrorla» — oxirgi gapni qayta aytadi'},
  {action:'listenBook',words:['kitobni oqi','kitob oqi','kitobni oqib ber','kitobimni oqi','kitobimni oqib ber','kitobni oqivor','kitobni oqib bergin','tingla','kitob tingla'],help:'«Kitobni o‘qi» — ochiq kitobni audio tinglash'},
  {action:'go',page:'myBooks',words:['kitoblarim','mening kitoblarim','audio kitob','javonim','moi knigi']},
  {action:'readPage',words:['sahifani oqi','oqib ber','ekranni oqi','oqi','prochitay','chitay'],help:'«O‘qi» — sahifa matnini o‘qiydi'},
  {action:'next',words:['keyingi','oldinga','dalshe','sleduyushiy'],help:'«Keyingi» / «Oldingi» — gap yoki band bo‘yicha yurish'},
  {action:'prev',words:['oldingi','orqaga','nazad','predydushiy']},
  {action:'faster',words:['tezroq','tezlat','bystree']},
  {action:'slower',words:['sekinroq','sekinlat','medlennee'],help:'«Tezroq» / «Sekinroq» — o‘qish tezligi'},
  {action:'bigger',words:['kattaroq','kattalashtir','shriftni kattalashtir','krupnee']},
  {action:'smaller',words:['kichikroq','kichraytir','melche'],help:'«Kattaroq» / «Kichikroq» — shrift o‘lchami'},
  {action:'contrast',words:['kontrast','yuqori kontrast']},
  {action:'time',words:['soat necha','vaqt','qaysi kun','bugun nima kun','kotoryy chas'],help:'«Soat necha» — vaqt va sana'},
  {action:'notifications',words:['bildirishnoma','xabarnoma','yangiliklar','uvedomleniya'],help:'«Bildirishnomalar» — oxirgi xabarlarni o‘qiydi'},
  {action:'joinLesson',words:['darsga kir','darsga ulan','darsga qoshil','voyti v urok'],help:'«Darsga kir» — boshlangan jonli darsga kirish'},
  {action:'logout',words:['tizimdan chiq','chiqish','vyyti'],help:'«Tizimdan chiq» — akkauntdan chiqish (tasdiq so‘raladi)'},
  {action:'search',prefix:['qidir','izla','top','nayti','poisk'],help:'«Qidir matematika» — butun platformadan qidirish'},
  {action:'go',page:'dashboard',words:['bosh sahifa','asosiy sahifa','glavnaya','bosh']},
  {action:'go',page:'schedule',words:['dars jadvali','jadval','raspisanie']},
  {action:'go',page:'live',words:['jonli dars','guruh darslari','darslar','onlayn dars']},
  {action:'go',page:'videos',words:['videodars','video dars','videolar']},
  {action:'go',page:'courses',words:['fanlar','vazifa','topshiriq','kurslar']},
  {action:'go',page:'grades',words:['baholar','bahom','jurnal','otsenki']},
  {action:'go',page:'library',words:['kutubxona','kitoblar','biblioteka']},
  {action:'go',page:'lab',words:['laboratoriya']},
  {action:'go',page:'communications',words:['xabarlar','pochta','forum','soobsheniya']},
  {action:'go',page:'myRequests',words:['murojaat','arizalarim','ariza']},
  {action:'go',page:'finalExams',words:['imtihon','yakuniy nazorat','ekzamen']},
  {action:'go',page:'profile',words:['profil','shaxsiy']},
  {action:'go',page:'accessibility',words:['qulaylik','sozlama','imkoniyat','nastroyki'],help:'«Jadval», «Kutubxona», «Baholar», «Xabarlar», «Qulaylik»… — bo‘limga o‘tish'},
  {action:'yes',words:['ha','xa','albatta','tasdiqlayman','da','yes','mayli']},
  {action:'no',words:['yoq','kerak emas','bekor','net','no','otmena']}
];

const hasPhrase=(text,phrase)=>(' '+text+' ').includes(' '+phrase+' ')||(phrase.length>4&&text.includes(phrase));
export function matchCommand(raw){
  const text=normalize(raw);if(!text)return null;
  for(const c of COMMANDS.filter(c=>c.prefix))for(const p of c.prefix)if(text.startsWith(p+' ')){const arg=String(raw).trim().split(/\s+/).slice(1).join(' ');if(arg)return {action:c.action,arg,text}}
  for(const c of COMMANDS){
    if(c.prefix){for(const p of c.prefix){if(text.startsWith(p+' ')){const arg=text.slice(p.length+1).trim();if(arg)return {action:c.action,arg,text}}}continue}
    // Short yes/no words must be the whole utterance, otherwise "ha" would match inside other sentences.
    if(c.action==='yes'||c.action==='no'){if(c.words.includes(text)||c.words.some(w=>w.includes(' ')&&text.includes(w)))return {action:c.action,text};continue}
    if(c.words.some(w=>hasPhrase(text,w)))return {action:c.action,page:c.page,text};
  }
  return null;
}
export const helpLines=()=>COMMANDS.filter(c=>c.help).map(c=>c.help);

// Spoken login → typed login: "ka te yigirma bir tire nol" is not realistic, but users do say letters with spaces and
// words for symbols. Keeps letters/digits and the common separators.
const SYMBOLS=[[/\b(tire|defis|chiziqcha|minus)\b/g,'-'],[/\b(nuqta|tochka)\b/g,'.'],[/\b(pastki chiziq|podcherkivanie)\b/g,'_'],[/\b(kuchukcha|sobaka)\b/g,'@']];
const DIGITS={nol:0,bir:1,ikki:2,uch:3,tort:4,besh:5,olti:6,yetti:7,sakkiz:8,toqqiz:9,nul:0,odin:1,dva:2,tri:3,chetyre:4,pyat:5,shest:6,sem:7,vosem:8,devyat:9};
export function spokenToLogin(raw){
  let t=normalize(raw);
  for(const [rx,s] of SYMBOLS)t=t.replace(rx,' '+s+' ');
  t=t.split(' ').map(w=>w in DIGITS?String(DIGITS[w]):w).join(' ');
  return t.replace(/\s+/g,'').replace(/[^a-z0-9._@-]/g,'');
}
export const spokenToDigits=raw=>spokenToLogin(raw).replace(/\D/g,'');
// Reads a login back character by character so the user can confirm it.
export function spellOut(value){
  const names={'-':'tire','.':'nuqta','_':'pastki chiziq','@':'kuchukcha'};
  return [...String(value||'')].map(ch=>names[ch]||(/\d/.test(ch)?ch:ch.toUpperCase())).join(', ');
}
