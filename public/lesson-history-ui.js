export function createLessonHistoryUi({api,esc,toast}){
 const dateText=value=>value?new Date(value).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
 const hh=value=>value?new Date(value).toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Hozirgacha';
 const labels={present:'Qatnashgan',late:'Kechikkan',absent:'Qatnashmagan',excused:'Sababli',unknown:'Aniqlanmagan',away:'Bosh chetga burilgan (taxminiy)',missing:'Kadrda yuz yo‘q',loading:'Yuklanmoqda',error:'Detektor xatosi',ready:'Detektor ishlagan'};
 const faceLabels={present:'Yuz kamerada ko‘rindi',away:'Yuz markazdan chetlagan (taxminiy)',missing:'Yuz topilmadi',unknown:'Aniqlanmadi'};
 const escapeValue=value=>esc(value==null?'':String(value));
 const isoDate=day=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(day);
 let pending=null;
 async function load(container){
   if(!container)return;
   const old=container.querySelector('#historyGroup')?.value||'';
   let knownGroups=[];
   const now=new Date(),from=isoDate(new Date(now.getTime()-29*86400000)),to=isoDate(now);
   container.innerHTML='<div class="lesson-history-controls"><label>Dan<input id="historyFrom" type="date" value="'+from+'"></label><label>Gacha<input id="historyTo" type="date" value="'+to+'"></label><label>Guruh<select id="historyGroup"><option value="">Barcha biriktirilgan guruhlar</option></select></label><button id="historyApply" class="primary">Ko‘rsatish</button><button id="historyCsv" type="button">Barcha vaqtlar CSV ↓</button><button id="historySummaryCsv" type="button">Xulosa CSV ↓</button></div><p class="lesson-history-explain">Davomat va proktor kuzatuvi kadrlar bo‘yicha qayd etiladi. Yuzning ko‘rinishi ko‘z ekranga qaraganini isbotlamaydi. Detektor ishlamagan vaqt qoidabuzarlik hisoblanmaydi.</p><div id="historyList" role="region" aria-live="polite">Darslar yuklanmoqda…</div><div id="historyDetail" role="region" aria-live="polite"></div>';
   const find=x=>container.querySelector(x);
   const query=()=>{
     const p=new URLSearchParams();
     if(find('#historyFrom').value)p.set('from',find('#historyFrom').value);
     if(find('#historyTo').value)p.set('to',find('#historyTo').value);
     if(find('#historyGroup').value)p.set('groupId',find('#historyGroup').value);
     return p;
   };
   const exportCsv=mode=>{
     const p=query();p.set('mode',mode);
     window.location.href='/api/lesson-history/export?'+p.toString();
   };
   find('#historyCsv').onclick=()=>exportCsv('timeline');
   find('#historySummaryCsv').onclick=()=>exportCsv('summary');
   async function showDetail(id){
     const detail=find('#historyDetail');
     if(pending===id)return;
     pending=id;detail.textContent='Dars tarixi yuklanmoqda…';
     try{
       const doc=await api('/lesson-history/'+encodeURIComponent(id));
       if(pending!==id)return;
       const rosterWarning=doc.rosterSource!=='session_snapshot'?'<p class="lesson-history-warning">Eski dars: o‘sha vaqtdagi guruh tarkibi saqlanmagan. Ro‘yxat joriy guruh va tarixiy ishtirokchilardan yig‘ilgan.</p>':'';
       const rows=[doc.teacher,...(doc.students||[])].filter(Boolean);
       const details=p=>{
         const attendance=(p.presenceIntervals||[]).map((seg,i)=>'<li><b>Kirish #'+(i+1)+': </b>'+escapeValue(dateText(seg.startedAt))+' → '+escapeValue(dateText(seg.endedAt))+' · '+escapeValue(seg.durationMinutes??'—')+' daqiqa'+(seg.legacy?' (oldingi umumiy yozuv)':'')+'</li>').join('');
         const proctor=(p.proctorTimeline||[]).map(seg=>'<li><b>'+escapeValue(faceLabels[seg.state]||seg.state)+'</b> · '+escapeValue(labels[seg.detectorStatus]||seg.detectorStatus)+' · '+(seg.cameraReady?'Kamera ON':'Kamera OFF')+' — '+escapeValue(hh(seg.startedAt))+' → '+escapeValue(hh(seg.endedAt))+' · '+escapeValue(seg.durationSeconds??'—')+' soniya</li>').join('');
         const checkpoints=(p.checkpoints||[]).map(c=>'<li>'+escapeValue(c.minute)+'-daq: '+escapeValue(labels[c.state]||c.state)+' · '+escapeValue(hh(c.at))+'</li>').join('');
         return '<details class="lesson-history-person-time"><summary>Vaqtlar va proktor tafsilotlari</summary><div><b>Kirish / chiqish</b><ol>'+(attendance||'<li>Vaqt segmentlari mavjud emas</li>')+'</ol><b>Proktor holatlari</b><ol>'+(proctor||'<li>Alohida kuzatuv vaqtlari saqlanmagan</li>')+'</ol><b>Davomat tekshiruvlari</b><ol>'+(checkpoints||'<li>Tekshiruv yozuvi yo‘q</li>')+'</ol></div></details>';
       };
       const table='<div class="lesson-history-scroll"><table class="lesson-history-table"><thead><tr><th>Ishtirokchi</th><th>Davomat</th><th>Kirdi / Chiqdi</th><th>Jami vaqt</th><th>Qayta ulanish</th><th>Yuz aniqlangan</th><th>Vaqtlar</th></tr></thead><tbody>'+rows.map(p=>{
         const visible=p.proctor?.faceVisiblePercent;
         return '<tr><td><b>'+escapeValue(p.fullName)+'</b><small>'+escapeValue(p.role==='teacher'?'O‘qituvchi':p.login)+'</small></td><td><span class="lesson-history-state '+escapeValue(p.status)+'">'+escapeValue(labels[p.status]||p.status)+'</span>'+(p.manuallyMarked?'<small>Qo‘lda belgilangan</small>':'')+'</td><td>'+escapeValue(hh(p.joinedAt))+' / '+escapeValue(hh(p.leftAt))+'</td><td>'+escapeValue(p.minutes)+' daq.</td><td>'+escapeValue(p.reconnectCount)+'</td><td>'+(visible==null?'Ma’lumot yo‘q':escapeValue(visible)+'%')+'<small>Qamrov: '+(p.proctor?.coveragePercent==null?'—':escapeValue(p.proctor.coveragePercent)+'%')+'</small></td><td>'+details(p)+'</td></tr>';
       }).join('')+'</tbody></table></div>';
       detail.innerHTML='<div class="lesson-history-detail-heading"><div><h3>'+escapeValue(doc.groupName)+' · '+escapeValue(doc.subject||doc.lessonTitle)+'</h3><p>'+escapeValue(doc.dateKey)+' · '+escapeValue(doc.scheduledStart)+'–'+escapeValue(doc.scheduledEnd)+' · Boshlangan: '+escapeValue(dateText(doc.startedAt))+'</p></div><button id="historyCloseDetail">Yopish</button><a class="button-link" href="/api/lesson-history/'+encodeURIComponent(id)+'?format=csv&mode=timeline">Shu darsning barcha vaqtlari CSV ↓</a></div>'+rosterWarning+'<div class="lesson-history-stats"><span><b>'+escapeValue(doc.summary.expected)+'</b> talaba</span><span><b>'+escapeValue(doc.summary.present+doc.summary.late)+'</b> qatnashgan</span><span><b>'+escapeValue(doc.summary.absent)+'</b> qatnashmagan</span><span><b>'+escapeValue(doc.summary.cameraObserved)+'</b> proktor natijasi mavjud</span></div>'+table;
       find('#historyCloseDetail')?.addEventListener('click',()=>{detail.innerHTML='';pending=null});
       detail.scrollIntoView({block:'start',behavior:'smooth'});
     }catch(e){detail.textContent=e.message;toast(e.message)}finally{if(pending===id)pending=null}
   }
   async function refresh(){
     pending=null;
     find('#historyDetail').innerHTML='';
     find('#historyList').textContent='O‘tilgan darslar yuklanmoqda…';
     try{
       const response=await api('/lesson-history?'+query().toString());
       const sessions=response.sessions||[];
       const groupSelect=find('#historyGroup');
       const chosen=groupSelect.value;
       if(!chosen||!knownGroups.length)knownGroups=[...new Map(sessions.map(s=>[s.groupId,{id:s.groupId,name:s.groupName}])).values()];
       groupSelect.innerHTML='<option value="">Barcha biriktirilgan guruhlar</option>'+knownGroups.map(g=>'<option value="'+escapeValue(g.id)+'">'+escapeValue(g.name)+'</option>').join('');
       if(chosen&&knownGroups.some(g=>g.id===chosen))groupSelect.value=chosen;
       else if(old&&knownGroups.some(g=>g.id===old))groupSelect.value=old;
       find('#historyList').innerHTML=sessions.length?'<p class="muted">'+sessions.length+' ta dars topildi. Tafsilot uchun darsni tanlang.</p><div class="lesson-history-items">'+sessions.map(s=>'<button type="button" class="lesson-history-item" data-history-id="'+escapeValue(s.id)+'"><span><b>'+escapeValue(s.groupName)+' · '+escapeValue(s.subject||s.title)+'</b><small>'+escapeValue(s.dateKey)+' · '+escapeValue(s.start)+'–'+escapeValue(s.end)+'</small></span><span class="lesson-history-item-status">'+escapeValue(s.status==='ended'?'Yakunlangan':s.status==='active'?'Davom etmoqda':'Rejalangan')+' →</span></button>').join('')+'</div>':'<div class="lesson-history-empty">Tanlangan vaqt oralig‘ida dars tarixi topilmadi.</div>';
       container.querySelectorAll('[data-history-id]').forEach(b=>b.addEventListener('click',()=>showDetail(b.dataset.historyId)));
     }catch(e){find('#historyList').textContent=e.message;toast(e.message)}
   }
   find('#historyApply').onclick=refresh;
   await refresh();
 }
 return {load};
}
