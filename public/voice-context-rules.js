import {canonical,normalize,spokenNumber,labelScore} from './voice-commands.js';

const kinds={mavzu:'topic',modul:'module',fan:'course',kurs:'course',video:'video',videodars:'video',kitob:'book',material:'resource',resurs:'resource',fayl:'resource',hujjat:'resource',test:'quiz',quiz:'quiz',topshiriq:'assignment',topshirig:'assignment',vazifa:'assignment',kategoriya:'category',rukn:'category',tugma:'action'};
const stop=new Set('shu shuni shunga bu buni bunga osha oshani uning undagi ichidagi haqida haqidagi boyicha doir oid nomli degan mavzusidagi ichidan ichiga ichida fanidagi fanining mavzusining mavzusidagi bolgan iltimos menga meni mening bir ta dona ham bilan va keyin avval hozir endi qani ber bering bergin berasan bera olasan olasiz mi chi uchun kir kiring kirib ot oting och oching ochib ochgin korsat korsating korsatib boshla boshlash boshlat qoy qoying tanla tanlang bos bosing ayt aytib sanab sana royxat royxatini royxati sanagin nima nimalar nimalarni qanday bormi bor ekanligini mengachi olib bor yubor berolasan berolasiz kerak qil qilib qilish qilgin qiling tingla eshit kor korish tomosha tomoshaqil boshlaylik mumkin boladimi qaysi nechta malumot tushuntir tarif tavsif haqida oqi oqib oqibber takrorla keyingi oldingi navbatdagi undan sung song yana'.split(' '));
for(const word of ['yer','yerda','nomi','nomidagi','sarlavhasi','sarlavhali','beringlar','ochibber','kiribber','kiribergin','topib','tanlab','berib','otilgan','otilganini','beraolasizmi','beraolasanmi','berolasizmi','berolasanmi'])stop.add(word);
const endings=/(?:laridagi|larining|laridan|larimga|larimni|dagisini|dagisiga|dagisi|dagi|ning|sining|sini|siga|sida|sidan|ni|ga|da|dan)$/;
export function wordStem(word){
  let value=normalize(word);if(value.length<4)return value;
  if(stop.has(value.replace(/(?:mi|chi)$/,'')))return value.replace(/(?:mi|chi)$/,'');
  value=value.replace(endings,'');
  if(value.endsWith('lar')&&value.length>5)value=value.slice(0,-3);
  return value;
}
function kindOf(word){const plain=normalize(word),stem=wordStem(plain);return kinds[stem]||kinds[plain.replace(/(?:lari|lar|ingiz|im|si|i)$/,'')]||kinds[stem.replace(/(?:lari|lar|ingiz|im|si|i)$/,'')]||null}
export function contentTokens(text){
  return canonical(text).replace(/(\d+)\s*-\s*/g,'$1 ').split(/\s+/).filter(word=>!stop.has(word)&&!kindOf(word)&&spokenNumber(word)===null).map(word=>wordStem(word)).filter(word=>word&&!stop.has(word)&&!kindOf(word)&&!/^\d+$/.test(word));
}
export function isNegated(text){return /\b(?:ochma(?:ng)?|kirma(?:ng)?|bosma(?:ng)?|yuborma(?:ng)?|chiqma(?:ng)?|ochirma(?:ng)?|saqlama(?:ng)?|boshlama(?:ng)?|qilma(?:ng)?|kerak emas|shart emas)\b/.test(canonical(text))}
export function parseContextCommand(raw){
  const text=canonical(raw).replace(/(\d+)\s*-\s*/g,'$1 ').replace(/\b(\d+)\s*(?:chi|inchi)\b/g,'$1').replace(/(\d+)(?=mavzu|modul|video|fan|kitob|test)/g,'$1 ');
  if(!text||isNegated(text))return null;
  if(/(?:sahifani|ekranni|bu yerni).*(?:tahlil|tushuntir)|(?:bu yerda|bu sahifada).*(?:nima qila|nima bor|nimalar bor)/.test(text))return {kind:'any',operation:'overview',query:'',ordinal:null,relative:0,explicit:true,text};
  const words=text.split(/\s+/),mentions=[];
  for(let i=0;i<words.length;i++){const kind=kindOf(words[i]);if(kind)mentions.push({kind,index:i,word:words[i]})}
  const listing=/\b(?:sanab|sanagin|royxat|royxatini|nimalar|qaysilar|nechta|mavzularni ayt|modullarni ayt|fanlarni ayt|materiallarni ayt)\b/.test(text)||/^(?:mavzular|modullar|materiallar|topshiriqlar royxati)$/.test(text)||mentions.length>0&&/\b(?:qaysi|qanday)\b.*\bbor\b/.test(text);
  const describing=/\b(?:haqida|malumot|tavsif|tushuntir|tarif|nima yozilgan|nima bor)\b/.test(text)&&!/\b(?:och|kir|bos|tanla|boshla|tingla|korsat)\b/.test(text);
  const reading=/\b(?:oqi|oqib|oqibber)\b/.test(text)&&!listing;
  const editing=/\b(?:tahrirla|tahrirlash|ozgartir|ozgartirish)\b/.test(text);
  const removing=/\b(?:ochir|ochirish|arxivla|arxivlash)\b/.test(text);
  let operation=listing?'list':describing?'describe':reading?'read':editing?'edit':removing?'delete':'open';
  const relative=/\b(?:keyingi|navbatdagi)\b/.test(text)?1:/\b(?:oldingi|avvalgi)\b/.test(text)?-1:0;
  let ordinal=null,ordinalKind=null,numberMode='position';const selectors=[];
  for(const mention of mentions){
    for(const start of [mention.index-1,mention.index-2])if(start>=0){
      const before=words.slice(start,mention.index).join(' ').replace(/(?:ni|ga)$/,'');
      const number=spokenNumber(before);if(number!==null&&number>0){selectors.push({kind:mention.kind,ordinal:number,numberMode:/^\d/.test(before)?'label':'position'});break}
    }
  }
  const targetKind=mentions.at(-1)?.kind||'any',targetSelector=selectors.filter(s=>s.kind===targetKind).at(-1),parentSelectors=selectors.filter(s=>s!==targetSelector);
  const selected=targetSelector||selectors[0];if(selected){ordinal=selected.ordinal;ordinalKind=selected.kind;numberMode=selected.numberMode}
  if(ordinal===null){const first=words[0]?.replace(/(?:ni|ga)$/,'');const n=spokenNumber(first);if(n!==null&&n>0&&words.length<4&&/och|kir|korsat|bos/.test(text))ordinal=n}
  // The last mentioned object is the target: "Web fanining 1-mavzusidagi test".
  const kind=mentions.at(-1)?.kind||'any';
  const query=contentTokens(text).filter(w=>!['tahrirla','tahrirlash','ozgartir','ozgartirish','ochir','ochirish','arxivla','arxivlash'].includes(w)).join(' ');
  const explicit=/\b(?:och|ochib|ochibber|kir|kirib|kiribber|bos|tanla|korsat|boshla|boshlash|boshlat|tingla|kor|tomosha|tahrirla|ochir|arxivla)\b/.test(text)||listing||describing||reading||ordinal!==null||Boolean(relative);
  if(!explicit&&mentions.length&&query==='')return null; // Bare page names stay in the existing navigator.
  if(!explicit&&!query)return null;
  const parent=mentions.length>1?mentions.slice(0,-1).at(-1):null;
  const ownReference=/\b(?:shu|osha|uning|shuni|buni)\b/.test(text);
  return {kind,operation,query,ordinal:ordinalKind&&ordinalKind!==kind?null:ordinal,parentOrdinal:ordinalKind&&ordinalKind!==kind?ordinal:null,parentSelectors,ordinalKind,numberMode,relative,explicit,ownReference,parentKind:parent?.kind||null,text};
}
function wordSimilarity(a,b){if(a===b)return 1;if(Math.min(a.length,b.length)>=5)return labelScore(a,b);return 0}
export function tokenScore(query,text){
  const wanted=contentTokens(query),available=contentTokens(text);if(!wanted.length||!available.length)return 0;
  const values=wanted.map(a=>Math.max(...available.map(b=>wordSimilarity(a,b))));
  if(values.some(v=>v<.74))return 0;
  return values.reduce((a,b)=>a+b,0)/values.length;
}
export function compatibleKind(record,kind){return kind==='any'||kind==='action'||record.kind===kind||(kind==='topic'&&record.kind==='video')}
export function resolveContextTargets(intent,records,{anchor=null,last=null}={}){
  let candidates=records.filter(record=>compatibleKind(record,intent.kind));
  for(const selector of intent.parentSelectors||[]){let parents=records.filter(r=>compatibleKind(r,selector.kind));const numbered=parents.filter(r=>r.number===selector.ordinal);parents=selector.numberMode==='label'&&parents.some(r=>r.number!==null)?numbered:parents[selector.ordinal-1]?[parents[selector.ordinal-1]]:[];candidates=candidates.filter(r=>parents.some(p=>r.ancestorIds?.includes(p.id)))}
  // Prefer actual course-topic summaries to videos embedded inside those topics.
  if(intent.kind==='topic'&&candidates.some(r=>r.kind==='topic'))candidates=candidates.filter(r=>r.kind==='topic');
  if(intent.operation==='list'){
    if(intent.query)candidates=candidates.filter(r=>tokenScore(intent.query,r.path+' '+r.title+' '+r.text)>.8);
    if(anchor&&!intent.query){const scoped=candidates.filter(r=>r.id===anchor.id||r.ancestorIds?.includes(anchor.id));if(scoped.length)candidates=scoped}
    return {status:'list',candidates};
  }
  if(anchor&&!intent.query){
    const scoped=candidates.filter(r=>r.id===anchor.id||r.ancestorIds?.includes(anchor.id)||r.course&&r.course===anchor.course&&anchor.kind==='course');
    if(scoped.length)candidates=scoped;
  }
  if(intent.relative){
    const reference=records.find(r=>r.id===last?.id)||last||anchor;
    if(!reference)return {status:'missingReference',candidates:[]};
    const sameGroup=candidates.filter(r=>(!reference.course||r.course===reference.course)&&(!reference.module||!r.module||r.module===reference.module));
    const index=sameGroup.findIndex(r=>r.id===reference.id),next=index>=0?sameGroup[index+intent.relative]:sameGroup.find(r=>r.number===Number(reference.number)+intent.relative);
    return next?{status:next.blocked?'blocked':'matched',target:next,candidates:[next]}:{status:'missing',candidates:[]};
  }
  if(intent.ordinal!==null){
    const numbered=candidates.filter(r=>r.number===intent.ordinal);
    if(intent.numberMode==='label'&&candidates.some(r=>r.number!==null))candidates=numbered;
    else if(intent.query){/* Select an ordinal after narrowing the named course below. */}
    else candidates=candidates[intent.ordinal-1]?[candidates[intent.ordinal-1]]:[];
  }
  let ranked=candidates.map(record=>{
    if(!intent.query)return {...record,score:1};
    const title=tokenScore(intent.query,record.title),path=tokenScore(intent.query,record.title+' '+record.path),description=tokenScore(intent.query,record.title+' '+record.path+' '+record.text);
    return {...record,score:Math.max(title,path*.94,description*.83)};
  }).filter(r=>r.score>=(intent.explicit?.77:.95)).sort((a,b)=>b.score-a.score);
  if(intent.ordinal!==null&&intent.query&&intent.numberMode!=='label')ranked=ranked[intent.ordinal-1]?[ranked[intent.ordinal-1]]:[];
  if(!ranked.length)return {status:'missing',candidates:[]};
  if(ranked[1]&&ranked[0].score-ranked[1].score<.045)return {status:'ambiguous',candidates:ranked.slice(0,8)};
  const target=ranked[0];return {status:target.blocked?'blocked':'matched',target,candidates:[target]};
}
