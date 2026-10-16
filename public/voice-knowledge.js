// HALLAYM EDU — the assistant answers questions and carries out multi-step requests from any page:
//  «ertangi jadval qanaqa», «topshiriqlarim qanaqa», «hozirgi darsni och», «Amir Temur kitobini och».
// It looks the thing up (platform search + personal shelf), walks to the right page step by step (spoken and shown),
// highlights the item and, for books and videos with a saved position, asks «davom ettiraymi yoki boshidan?».
import {parseQuestion,parseFind,describeSchedule,describeWeek,describeAssignments,describeLive,resolveDate,hitScore} from './voice-knowledge-rules.js';
import {canonical,spokenNumber} from './voice-commands.js';

const $=s=>document.querySelector(s);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,ms=6000){const until=Date.now()+ms;for(;;){const v=fn();if(v)return v;if(Date.now()>until)return null;await wait(120)}}
function spotlight(el){if(!el)return;el.scrollIntoView?.({block:'center',behavior:'smooth'});el.classList.add('va-target');setTimeout(()=>el.classList.remove('va-target'),4500)}

export function createVoiceKnowledge({api,go,say,step=()=>{},enterLive,openSearchHit,myBooks,currentUser,playReader}){
  let pending=null; // {question, options:[{label,words,run}], until}

  // ---------- spoken multiple choice ----------
  async function choose(question,options){
    pending={question,options,until:Date.now()+45000};
    step(options.map((o,i)=>(i+1)+'. '+o.label).join('  ·  '));
    await say(question);
  }
  const hasPending=()=>Boolean(pending&&Date.now()<pending.until);
  async function answer(raw){
    if(!hasPending()){pending=null;return false}
    const t=canonical(raw);
    if(/\b(bekor|kerak emas|hech biri|otmena|yoq)\b/.test(t)&&!pending.options.some(o=>o.words.some(w=>t.includes(w)))){pending=null;await say('Bekor qilindi.');return true}
    const n=spokenNumber(t)??spokenNumber(t.split(' ')[0])??spokenNumber(t.split(' ').at(-1));
    let picked=n&&pending.options[n-1]?pending.options[n-1]:null;
    if(!picked){const hits=pending.options.filter(o=>o.words.some(w=>t.includes(w)));if(hits.length===1)picked=hits[0]}
    if(!picked){await say('Tushunmadim. '+pending.options.map((o,i)=>(i+1)+' — '+o.label).join(', ')+'. Raqam yoki so‘zni ayting.');return true}
    pending=null;await picked.run();return true;
  }

  // ---------- questions ----------
  async function schedule(day){
    step('Dars jadvali o‘qilmoqda…');
    const rows=await api('/schedules');
    if(day.week)return say(describeWeek(rows));
    return say(describeSchedule(rows,resolveDate(day)));
  }
  async function assignments(when){
    step('Fanlar va topshiriqlar yig‘ilmoqda…');
    const courses=(await api('/lms/courses')).slice(0,25);
    const details=await Promise.all(courses.map(c=>api('/lms/courses/'+encodeURIComponent(c._id)).catch(()=>null)));
    const list=details.filter(Boolean).flatMap(d=>(d.assignments||[]).map(a=>({title:a.title,course:d.course?.title||'',dueAt:a.personalDueAt||a.dueAt,submitted:Boolean(a.submitted||a.mySubmission||a.submission)})));
    return say(describeAssignments(list,when));
  }
  async function live(action){
    step('Bugungi jonli darslar tekshirilmoqda…');
    const data=await api('/live/rooms');const {room,text}=describeLive(data.rooms);
    if(!room)return say(text);
    const id=String(room.schedule?._id||'');
    if(action==='open'&&room.canJoin){await say(text+' Darsga kiryapman.');return enterLive?.(id)}
    if(!room.canJoin)return say(text+' Bu darsga hozir kirish mumkin emas.');
    return choose(text+' Darsga kiraymi? «Ha» yoki «yo‘q» deng.',[{label:'Ha, kirish',words:['ha','xa','kir','albatta','mayli'],run:async()=>{await say('Darsga kiryapman.');await enterLive?.(id)}},{label:'Yo‘q',words:['yoq','kerak emas','keyin'],run:()=>say('Mayli.')}]);
  }

  // ---------- find anything and open it ----------
  async function search(query,kind){
    const ask=q=>api('/search?q='+encodeURIComponent(q)+'&type='+(kind==='all'?'all':kind)).then(x=>x.results||[]).catch(()=>[]);
    let hits=await ask(query);
    if(!hits.length){const words=query.split(' ').filter(w=>w.length>=4).sort((a,b)=>b.length-a.length);for(const w of words.slice(0,2)){hits=await ask(w);if(hits.length)break}}
    return hits.filter(h=>h.type!=='page'&&h.type!=='user');
  }
  async function find({kind,query,listen}){
    if(!currentUser())return say('Avval tizimga kiring.');
    step('Qidirilmoqda: «'+query+'»');await say('«'+query+'» ni qidiryapman.');
    const tasks=[search(query,kind)];
    if(kind==='library'||kind==='all')tasks.push(api('/my-books').then(x=>(x.books||[]).map(b=>({type:'personal',id:b.id,title:b.title,subtitle:'Mening kitoblarim · '+(b.author||''),book:b}))).catch(()=>[]));
    const all=(await Promise.all(tasks)).flat().map(h=>({...h,score:hitScore(query,h)+(h.type==='personal'?.15:0)})).filter(h=>h.score>.45).sort((a,b)=>b.score-a.score);
    if(!all.length)return say('«'+query+'» topilmadi. Nomini boshqacha aytib ko‘ring yoki «qidir '+query+'» deng.');
    const top=all.filter(h=>h.score>=all[0].score-.12).slice(0,5);
    if(top.length>1&&new Set(top.map(h=>h.type+':'+h.id)).size>1){
      const where={personal:'Mening kitoblarimda',library:'kutubxonada',video:'videodars',course:'fan',assignment:'topshiriq',quiz:'test',resource:'material',schedule:'dars jadvalida'};
      return choose(top.length+' ta mos natija bor. '+top.map((h,i)=>(i+1)+'. '+h.title+' — '+(where[h.type]||h.type)).join('. ')+'. Qaysi birini ochay? Raqamini ayting.',
        top.map(h=>({label:h.title,words:[canonical(h.title)],run:()=>open(h,listen)})));
    }
    return open(all[0],listen);
  }
  async function open(hit,listen){
    if(hit.type==='personal')return openPersonal(hit.book);
    if(hit.type==='library')return openLibrary(hit);
    if(hit.type==='video')return openVideo(hit);
    const where={course:'Fanlar va vazifalar',assignment:'Fanlar va vazifalar',quiz:'Fanlar va vazifalar',resource:'Fanlar va vazifalar',schedule:'Dars jadvali',history:'O‘tilgan darslar',group:'Tuzilma'}[hit.type]||'kerakli';
    step(where+' → '+hit.title);await say(where+' sahifasiga o‘tyapman.');
    await openSearchHit(hit);await say('«'+hit.title+'» ochildi. Ichidagi narsalar uchun «sahifani tahlil qil» yoki «mavzularni sanab ber» deng.');
  }
  function resumeOrRestart(text,{resume,restart}){
    return choose(text+' Qolgan joyidan davom ettiraymi yoki boshidan boshlaymi?',[
      {label:'Davom ettirish',words:['davom','qolgan','toxtagan','kelgan joy','davomidan','prodolj'],run:resume},
      {label:'Boshidan boshlash',words:['boshidan','boshdan','yangidan','qaytadan','birinchi sahifa','snachala','zanovo'],run:restart}]);
  }
  async function openPersonal(book){
    step('Mening kitoblarim → '+book.title);await say('Mening kitoblarim sahifasiga o‘tyapman.');
    await go('myBooks');
    const btn=await waitFor(()=>$('[data-listen="'+CSS.escape(book.id)+'"]'));
    if(!btn)return say('Kitob ro‘yxatda ko‘rinmadi. Sahifani yangilab qayta urinib ko‘ring.');
    spotlight(btn.closest('li')||btn);
    const p=book.progress||{};const start=async fromStart=>{myBooks.listen(book.id,{fromStart});playReader()};
    if((p.page||p.idx)&&!p.finished)return resumeOrRestart('«'+book.title+'» topildi. Oldin '+((p.page||0)+1)+'-sahifada to‘xtagansiz.',{resume:()=>start(false),restart:()=>start(true)});
    await say('«'+book.title+'» topildi. O‘qishni boshlayman.');return start(!!p.finished);
  }
  async function openLibrary(hit){
    step('Elektron kutubxona → '+hit.title);await say('Kutubxonaga o‘tyapman.');
    await openSearchHit(hit);
    const btn=await waitFor(()=>$('#libraryListen'));
    spotlight($('#libraryList .library-detail')||btn);
    if(!btn)return say('«'+hit.title+'» ochildi, lekin uni ovozda o‘qib bo‘lmaydi.');
    const key='m2-ar:'+String(currentUser()?._id||'')+':library:'+hit.id;let saved=null;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}
    const go2=async fromStart=>{if(fromStart)try{localStorage.removeItem(key)}catch{};btn.click();playReader()};
    if(saved&&(saved.page||saved.idx)&&!saved.finished)return resumeOrRestart('«'+hit.title+'» topildi. Oldin '+((saved.page|0)+1)+'-sahifada to‘xtagansiz.',{resume:()=>go2(false),restart:()=>go2(true)});
    await say('«'+hit.title+'» topildi. O‘qishni boshlayman.');return go2(false);
  }
  async function openVideo(hit){
    step('Videodarslar → '+hit.title);await say('Videodarslarga o‘tyapman.');
    await openSearchHit(hit);
    const video=await waitFor(()=>$('#videoWatch video'),8000);
    spotlight($('#watchVideoTitle')||$('#watchTitle'));
    if(!video)return say('«'+hit.title+'» ochildi.');
    await waitFor(()=>video.readyState>=1,4000);
    const at=Math.floor(video.currentTime||0);
    const play=async fromStart=>{if(fromStart)video.currentTime=0;try{await video.play()}catch{await say('Videoni boshlash uchun «Ijro» tugmasini bosing.')}};
    if(at>20)return resumeOrRestart('«'+hit.title+'» videosi topildi. Oldin '+Math.floor(at/60)+' daqiqa '+(at%60)+' soniyada to‘xtagansiz.',{resume:()=>play(false),restart:()=>play(true)});
    await say('«'+hit.title+'» videosi ochildi.');return play(false);
  }

  // Returns true when the utterance was a question or a find request this module handled.
  async function handleQuestion(raw){
    const q=parseQuestion(raw);if(!q)return false;
    if(!currentUser()){await say('Avval tizimga kiring.');return true}
    try{
      if(q.topic==='schedule')await schedule(q.day);
      else if(q.topic==='assignments')await assignments(q.when);
      else if(q.topic==='live')await live(q.action);
    }catch(e){console.warn('voice knowledge',e);await say(e?.status===403?'Bu ma’lumotni ko‘rishga ruxsatingiz yo‘q.':'Ma’lumotni hozir olib bo‘lmadi. Internet aloqasini tekshirib, birozdan keyin qayta so‘rang.')}
    return true;
  }
  async function handleFind(raw){const f=parseFind(raw);if(!f)return false;try{await find(f)}catch(e){console.warn('voice find',e);await say('Qidiruvni bajarib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.')}return true}
  return {handleQuestion,handleFind,hasPending,answer,cancel:()=>{pending=null}};
}
