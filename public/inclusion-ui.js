import {askConfirmation} from './accessible-confirm.js';
// HALLAYM EDU — «Inklyuziv ta'lim» page. One page, different views by role:
// student → own accommodations, request, consent, lesson transcripts; teacher → students who need adjustments in own
// groups, transcripts, subtitles for own video lessons, teaching guide; coordinator (inclusion.manage) → overview,
// requests, all profiles, interpreters/assistants, transcripts, video subtitle audit; dean/tutor → scoped list;
// interpreter/assistant → today's lessons of assigned groups.
const escHtml=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

export function createInclusionUi({api,toast,esc=escHtml,currentUser,enterLive,openA11y}){
  const $=(s,r=document)=>r.querySelector(s);
  let meta=null,tab='',mine=null;
  const getMeta=async()=>meta||(meta=await api('/inclusion/meta'));
  function sheet(title,html,{wide=false}={}){
    const el=document.createElement('div');el.className='ux-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',title);
    el.innerHTML='<div class="ux-card'+(wide?' wide':'')+'"><header><h2>'+esc(title)+'</h2><button type="button" class="hx-plain ux-x" aria-label="Yopish">×</button></header><div class="ux-body">'+html+'</div></div>';
    const prev=document.activeElement,close=()=>{el.remove();document.removeEventListener('keydown',key);try{prev?.focus?.()}catch{}},key=e=>{if(e.key==='Escape')close()};
    el.addEventListener('click',e=>{if(e.target===el||e.target.closest('.ux-x'))close()});document.addEventListener('keydown',key);document.body.appendChild(el);
    setTimeout(()=>el.querySelector('.ux-x')?.focus(),20);return {el,close,body:el.querySelector('.ux-body')};
  }
  const empty=(t,s='')=>'<div class="ux-empty"><b>'+esc(t)+'</b>'+(s?'<span>'+esc(s)+'</span>':'')+'</div>';
  const chips=list=>(list||[]).length?'<div class="in-chips">'+list.map(c=>'<span class="in-chip" title="'+esc(c.hint||'')+'"><i aria-hidden="true">'+esc(c.icon)+'</i>'+esc(c.label)+'</span>').join('')+'</div>':'<span class="in-muted">—</span>';
  const statusBadge=(s,label)=>'<span class="in-status in-st-'+esc(s)+'">'+esc(label||s)+'</span>';
  const MONTHS=['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
  const fmtDay=d=>{if(!d)return '';const x=new Date(String(d).length===10?d+'T00:00:00':d);return Number.isNaN(+x)?'':x.getDate()+'-'+MONTHS[x.getMonth()]+' '+x.getFullYear()};
  const role=()=>currentUser()?.role;

  function accFields(m,acc={},prefix='acc'){
    return '<div class="in-accs">'+m.accommodations.map(a=>{
      const id=prefix+'-'+a.key,v=acc?.[a.key];
      if(a.type==='pct')return '<label class="in-acc"><span><i aria-hidden="true">'+esc(a.icon)+'</i>'+esc(a.label)+'</span><select name="'+a.key+'" id="'+id+'">'+a.options.map(o=>'<option value="'+o+'"'+(Number(v)===o?' selected':'')+'>'+(o?'+'+o+'%':'Yo‘q')+'</option>').join('')+'</select></label>';
      if(a.type==='days')return '<label class="in-acc"><span><i aria-hidden="true">'+esc(a.icon)+'</i>'+esc(a.label)+'</span><select name="'+a.key+'" id="'+id+'">'+[0,1,2,3,5,7,10,14].map(o=>'<option value="'+o+'"'+(Number(v)===o?' selected':'')+'>'+(o?'+'+o+' kun':'Yo‘q')+'</option>').join('')+'</select></label>';
      return '<label class="in-acc in-check"><input type="checkbox" name="'+a.key+'"'+(v?' checked':'')+'><span><i aria-hidden="true">'+esc(a.icon)+'</i>'+esc(a.label)+'</span></label>';
    }).join('')+'</div>';
  }
  const readAcc=(m,form)=>Object.fromEntries(m.accommodations.map(a=>{const el=form.querySelector('[name="'+a.key+'"]');return [a.key,a.type==='bool'?Boolean(el?.checked):Number(el?.value||0)]}));
  const needFields=(m,needs=[])=>'<div class="in-needs">'+Object.entries(m.needs).map(([k,n])=>'<label class="in-need"><input type="checkbox" name="need" value="'+k+'"'+(needs.includes(k)?' checked':'')+'><span><i aria-hidden="true">'+esc(n.icon)+'</i><b>'+esc(n.label)+'</b><small>'+esc(n.hint||'')+'</small></span></label>').join('')+'</div>';
  const readNeeds=form=>[...form.querySelectorAll('[name="need"]:checked')].map(x=>x.value);

  // ---------- page ----------
  async function render(){
    const root=$('#inclusionRoot');if(!root)return;root.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    let m;try{m=await getMeta()}catch(e){root.innerHTML=empty('Bo‘lim yuklanmadi',e.message);return}
    const r=role(),coord=m.me.coordinator,scoped=['dean','department','tutor'].includes(r);
    if(r!=='student'){try{mine=await api('/inclusion/support/mine')}catch{mine=null}}
    const tabs=[];
    if(mine?.assignments?.length)tabs.push(['support-mine','🤟 Yordamchi darslarim']);
    if(r==='student')tabs.push(['me','♿ Mening qulayliklarim'],['transcripts','📝 Dars matnlari']);
    if(coord)tabs.push(['overview','📊 Umumiy holat'],['requests','📥 Arizalar'],['students','👥 Talabalar'],['support','🤟 Surdotarjimon va assistentlar']);
    else if(scoped)tabs.push(['students','👥 Talabalar'],['overview','📊 Umumiy holat']);
    else if(r==='teacher')tabs.push(['students','👥 Guruhlarimdagi talabalar']);
    else if(r==='rectorate')tabs.push(['overview','📊 Umumiy holat']);
    if(r!=='student')tabs.push(['transcripts','📝 Dars matnlari']);
    if(coord||r==='teacher'||['admin','superadmin'].includes(r))tabs.push(['videos','CC Videodars subtitrlari']);
    if(r!=='student')tabs.push(['guide','📘 Inklyuziv dars qo‘llanmasi']);
    if(!tabs.some(t=>t[0]===tab))tab=tabs[0]?.[0]||'guide';
    root.innerHTML='<div class="in-hero"><div><b>Har bir talaba uchun teng imkoniyat</b><span>Moslashtirishlar tasdiqlangach tizim o‘zi qo‘llaydi: test vaqti, topshiriq muddati, darsdagi subtitr va surdotarjimon. Tashxis maxfiy — o‘qituvchi faqat nima qilish kerakligini ko‘radi.</span></div><button type="button" class="primary" data-a11y>♿ Qulaylik sozlamalari</button></div>'+
      '<div class="ux-tabs in-tabs" role="tablist">'+tabs.map(([k,l])=>'<button type="button" role="tab" class="hx-plain'+(k===tab?' on':'')+'" aria-selected="'+(k===tab)+'" data-tab="'+k+'">'+esc(l)+'</button>').join('')+'</div><section id="inPane" class="in-pane" role="tabpanel"></section>';
    root.querySelector('[data-a11y]').onclick=()=>openA11y?.();
    const draw=()=>{const p=$('#inPane');p.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';const fn={me:paneMe,transcripts:paneTranscripts,overview:paneOverview,requests:(p,m)=>paneStudents(p,m,{pending:true}),students:paneStudents,support:paneSupport,'support-mine':paneSupportMine,videos:paneVideos,guide:paneGuide}[tab];fn?.(p,m).catch?.(e=>{p.innerHTML=empty('Yuklanmadi',e.message)})};
    root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;root.querySelectorAll('[data-tab]').forEach(y=>{y.classList.toggle('on',y===b);y.setAttribute('aria-selected',String(y===b))});draw()}));
    draw();
  }

  // ---------- student ----------
  async function paneMe(p,m){
    const x=await api('/inclusion/me'),st=m.statuses[x.status]||x.status,pending=x.request?.pending;
    p.innerHTML='<div class="in-grid">'+
      '<article class="in-card"><header><h3>Holat</h3>'+statusBadge(x.status,st)+'</header>'+
        (x.active?'<p class="in-lead">Quyidagi moslashtirishlar faol va tizimda avtomatik qo‘llanadi:</p>'+chips(x.chips)+(x.validUntil?'<p class="in-muted">Amal qiladi: '+esc(fmtDay(x.validUntil))+' gacha</p>':''):'<p class="in-lead">'+(x.status==='requested'?'Arizangiz inklyuziv ta’lim koordinatoriga yuborilgan. Natija shu yerda ko‘rinadi.':x.status==='rejected'?'Ariza rad etilgan. Izohni o‘qing va kerak bo‘lsa yangi ariza yuboring.':'Hozircha moslashtirish yo‘q. Kerak bo‘lsa pastdagi ariza orqali so‘rang.')+'</p>')+
        (x.decisionNote?'<p class="in-note"><b>Koordinator izohi:</b> '+esc(x.decisionNote)+'</p>':'')+
        (x.support?.length?'<p class="in-lead">Guruhingizga biriktirilgan: '+x.support.map(s=>'<b>'+esc(s.label)+'</b> '+esc(s.name)).join(', ')+'</p>':'')+
      '</article>'+
      '<article class="in-card"><header><h3>Maxfiylik</h3></header><label class="in-consent"><input type="checkbox" id="inConsent"'+(x.consentTeachers?' checked':'')+'><span><b>O‘qituvchilarim moslashtirishlarimni ko‘rsin</b><small>Faqat amaliy talablar ko‘rinadi (masalan, «Subtitr», «+50% vaqt»). Tashxis va hujjatlaringizni faqat koordinator ko‘radi. O‘chirsangiz ham test vaqti, muddat va subtitr avtomatik ishlayveradi.</small></span></label>'+
      '<div class="in-actions"><button type="button" class="secondary" data-a11y2>♿ Ekran, shrift va ovoz sozlamalari</button></div></article>'+
    '</div>'+
    '<article class="in-card"><header><h3>'+(x.status==='approved'?'Moslashtirishni o‘zgartirish so‘rovi':'Moslashtirish so‘rovi')+'</h3>'+(pending?statusBadge('requested','Yuborilgan · '+fmtDay(x.request.at)):'')+'</header>'+
      (pending?'<p class="in-lead">So‘rovingiz ko‘rib chiqilmoqda.</p>'+chips(m.accommodations.filter(a=>x.request.accommodations?.[a.key]).map(a=>({icon:a.icon,label:a.label})))+'<div class="in-actions"><button type="button" class="ghost" id="inCancel">So‘rovni bekor qilish</button></div>':
      '<form id="inRequest" class="in-form"><p class="in-lead">Qaysi sohada qiyinchilik borligini belgilang. Bu ma’lumot faqat koordinatorga ko‘rinadi.</p>'+needFields(m,x.needs)+
        '<h4>Sizga nima yordam beradi?</h4>'+accFields(m,x.status==='approved'?x.accommodations:{} ,'req')+
        '<label class="in-field">Qisqacha izoh (ixtiyoriy)<textarea name="message" rows="3" maxlength="2000" placeholder="Masalan: eshitish apparati bilan ishlayman, tez gapirilganda tushunmay qolaman"></textarea></label>'+
        '<p class="in-muted">Nogironlik guvohnomasi yoki tibbiy ma’lumotnoma bo‘lsa, koordinatorga shaxsan ko‘rsating — platformaga hujjat yuklanmaydi.</p>'+
        '<div class="in-actions"><button class="primary" type="submit">So‘rov yuborish</button></div></form>')+
    '</article>';
    p.querySelector('[data-a11y2]').onclick=()=>openA11y?.();
    p.querySelector('#inConsent').onchange=async e=>{try{await api('/inclusion/me/consent',{method:'PATCH',body:JSON.stringify({consentTeachers:e.target.checked})});toast(e.target.checked?'O‘qituvchilar amaliy talablarni ko‘radi':'O‘qituvchilarga ko‘rsatilmaydi, avtomatik yordam davom etadi')}catch(err){toast(err.message);e.target.checked=!e.target.checked}};
    p.querySelector('#inCancel')?.addEventListener('click',async()=>{try{await api('/inclusion/me/request',{method:'DELETE'});toast('So‘rov bekor qilindi');paneMe(p,m)}catch(e){toast(e.message)}});
    p.querySelector('#inRequest')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;
      try{await api('/inclusion/me/request',{method:'POST',body:JSON.stringify({needs:readNeeds(f),accommodations:readAcc(m,f),message:f.message.value,consentTeachers:p.querySelector('#inConsent')?.checked!==false})});toast('So‘rov yuborildi');paneMe(p,m)}catch(err){toast(err.message)}});
  }

  // ---------- transcripts ----------
  async function paneTranscripts(p){
    const rows=await api('/inclusion/transcripts');
    p.innerHTML='<p class="in-lead">Jonli darsda subtitr yoqilganda aytilgan gaplar shu yerda matn sifatida saqlanadi. Eshitishda qiyinchilik bor talabalar va konspekt uchun qulay.</p>'+
      (rows.length?'<div class="in-table" role="table"><div class="in-tr in-th" role="row"><span role="columnheader">Dars</span><span role="columnheader">Sana</span><span role="columnheader">Guruh</span><span role="columnheader">Qatorlar</span><span role="columnheader">Yuklab olish</span></div>'+
        rows.map(r=>'<div class="in-tr" role="row"><span role="cell"><button type="button" class="hx-plain in-link" data-open="'+esc(r.id)+'">'+esc(r.title)+'</button></span><span role="cell">'+esc(fmtDay(r.dateKey))+'</span><span role="cell">'+esc(r.group)+'</span><span role="cell">'+esc(r.lines)+'</span><span role="cell" class="in-dl"><a href="/api/inclusion/transcripts/'+esc(r.id)+'?format=txt" download>TXT</a><a href="/api/inclusion/transcripts/'+esc(r.id)+'?format=vtt" download>VTT</a></span></div>').join('')+'</div>'
      :empty('Hali dars matni yo‘q','Jonli darsda «Subtitr» yoqilganda matn avtomatik yoziladi'));
    p.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{try{const t=await api('/inclusion/transcripts/'+b.dataset.open);const s=sheet(t.title+' · '+fmtDay(t.dateKey),'<div class="hxa-cap-history in-transcript">'+(t.lines.map(l=>{const d=new Date(l.at);return '<p><time>'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+'</time><b>'+esc(l.name)+'</b>'+esc(l.text)+'</p>'}).join('')||'<p>Bo‘sh</p>')+'</div>',{wide:true})}catch(e){toast(e.message)}});
  }

  // ---------- teacher / dean / tutor / coordinator list ----------
  async function paneStudents(p,m,opts={}){
    const coord=m.me.coordinator,pendingOnly=opts.pending===true;
    if(!coord){
      const x=await api(role()==='teacher'?'/inclusion/my-students':'/inclusion/students');
      p.innerHTML='<p class="in-lead">Bu talabalarga darsda alohida e’tibor kerak. Test vaqti, topshiriq muddati va subtitr tizimda avtomatik moslashadi — quyidagi tavsiyalar siz uchun.</p>'+
        (x.rows.length?'<div class="in-cards">'+x.rows.map(r=>'<article class="in-card in-student"><header><h3>'+esc(r.fullName)+'</h3><span class="in-muted">'+esc(r.group)+'</span></header>'+chips(r.chips)+
          '<ul class="in-todo">'+r.chips.map(c=>'<li><i aria-hidden="true">'+esc(c.icon)+'</i>'+esc(c.hint)+'</li>').join('')+'</ul>'+(r.teacherNote?'<p class="in-note"><b>Koordinator tavsiyasi:</b> '+esc(r.teacherNote)+'</p>':'')+'</article>').join('')+'</div>':empty('Alohida ehtiyojli talaba yo‘q','Guruhlaringizda tasdiqlangan moslashtirish topilmadi'))+
        (x.hidden?'<p class="in-muted">Yana '+x.hidden+' nafar talabaga moslashtirish avtomatik qo‘llanadi (talaba ism-familiyasini ko‘rsatishga rozilik bermagan).</p>':'');
      return;
    }
    const st=pendingOnly?'pending':(p.dataset.status||''),need=p.dataset.need||'',q=p.dataset.q||'';
    const x=await api('/inclusion/students?status='+encodeURIComponent(st)+'&need='+encodeURIComponent(need)+'&q='+encodeURIComponent(q));
    p.innerHTML=(pendingOnly?'<p class="in-lead">Talabalar yuborgan moslashtirish so‘rovlari. Ko‘rib chiqib tasdiqlang yoki izoh bilan rad eting.</p>':
      '<div class="in-filters"><label>Holat<select id="inFSt"><option value="">Barchasi</option>'+Object.entries(m.statuses).filter(([k])=>k!=='none').map(([k,l])=>'<option value="'+k+'"'+(k===st?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>'+
      '<label>Ehtiyoj<select id="inFNeed"><option value="">Barchasi</option>'+Object.entries(m.needs).map(([k,n])=>'<option value="'+k+'"'+(k===need?' selected':'')+'>'+esc(n.icon+' '+n.label)+'</option>').join('')+'</select></label>'+
      '<label>Qidiruv<input id="inFQ" type="search" value="'+esc(q)+'" placeholder="Ism, login, guruh"></label><button type="button" class="primary" id="inAddStudent">+ Talabaga moslashtirish</button></div>')+
      (x.rows.length?'<div class="in-table" role="table"><div class="in-tr in-th in-tr5" role="row"><span role="columnheader">Talaba</span><span role="columnheader">Ehtiyoj</span><span role="columnheader">Moslashtirish</span><span role="columnheader">Holat</span><span role="columnheader"></span></div>'+
        x.rows.map(r=>'<div class="in-tr in-tr5" role="row"><span role="cell"><b>'+esc(r.fullName)+'</b><small>'+esc(r.group)+' · '+esc(r.login)+'</small></span><span role="cell">'+r.needs.map(n=>'<span title="'+esc(m.needs[n]?.label)+'">'+esc(m.needs[n]?.icon||'')+' '+esc(m.needs[n]?.label||n)+'</span>').join('<br>')+'</span><span role="cell">'+chips(r.chips)+'</span><span role="cell">'+statusBadge(r.status,m.statuses[r.status])+(r.requestPending?'<br>'+statusBadge('requested','Yangi so‘rov'):'')+(r.validUntil?'<small>'+esc(fmtDay(r.validUntil))+' gacha</small>':'')+'</span><span role="cell"><button type="button" class="secondary" data-edit="'+esc(r.userId)+'">'+(r.requestPending?'Ko‘rib chiqish':'Ochish')+'</button></span></div>').join('')+'</div>'
      :empty(pendingOnly?'Yangi so‘rov yo‘q':'Talaba topilmadi',pendingOnly?'Talabalar «Inklyuziv ta’lim» bo‘limidan so‘rov yuboradi':'Filtrni o‘zgartiring yoki talaba qo‘shing'));
    const reload=()=>paneStudents(p,m,opts);
    p.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(b.dataset.edit,m,reload));
    if(!pendingOnly){
      p.querySelector('#inFSt').onchange=e=>{p.dataset.status=e.target.value;reload()};p.querySelector('#inFNeed').onchange=e=>{p.dataset.need=e.target.value;reload()};
      let t;p.querySelector('#inFQ').oninput=e=>{clearTimeout(t);t=setTimeout(()=>{p.dataset.q=e.target.value;reload().then(()=>{const i=p.querySelector('#inFQ');i?.focus();i?.setSelectionRange(i.value.length,i.value.length)})},350)};
      p.querySelector('#inAddStudent').onclick=()=>pickPerson('Talabani tanlang',false,id=>openEditor(id,m,reload));
    }
  }
  function pickPerson(title,staff,onPick){
    const s=sheet(title,'<label class="in-field">Ism yoki login<input type="search" id="inPick" autocomplete="off" placeholder="Kamida 2 harf"></label><div id="inPickList" class="in-picklist" role="listbox"></div>');
    let t;s.body.querySelector('#inPick').focus();
    s.body.querySelector('#inPick').oninput=e=>{clearTimeout(t);t=setTimeout(async()=>{const rows=await api('/inclusion/student-search?q='+encodeURIComponent(e.target.value)+(staff?'&staff=1':'')).catch(()=>[]);
      s.body.querySelector('#inPickList').innerHTML=rows.map(r=>'<button type="button" class="hx-plain in-pick" role="option" data-id="'+esc(r.id)+'"><b>'+esc(r.fullName)+'</b><small>'+esc(r.login)+(r.group?' · '+esc(r.group):'')+(staff?' · '+esc(r.role):'')+'</small></button>').join('')||'<p class="in-muted">Topilmadi</p>';
      s.body.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{s.close();onPick(b.dataset.id,b.querySelector('b').textContent)})},300)};
  }
  async function openEditor(userId,m,done){
    let x;try{x=await api('/inclusion/students/'+userId)}catch(e){return toast(e.message)}
    const pr=x.profile,req=pr.request?.pending?pr.request:null,acc=req?req.accommodations:pr.accommodations,needs=req?[...new Set([...(pr.needs||[]),...(req.needs||[])])]:pr.needs;
    const s=sheet(x.student.fullName+' · '+(x.student.group||''),
      (req?'<div class="in-request"><b>📥 Talaba so‘rovi · '+esc(fmtDay(req.at))+'</b>'+(req.message?'<p>«'+esc(req.message)+'»</p>':'')+chips(m.accommodations.filter(a=>req.accommodations?.[a.key]).map(a=>({icon:a.icon,label:a.label})))+'<small>Quyidagi shakl so‘rov asosida to‘ldirildi — kerak bo‘lsa o‘zgartiring.</small></div>':'')+
      '<form class="in-form" id="inEdit"><h4>Ehtiyoj (maxfiy)</h4>'+needFields(m,needs||[])+'<h4>Moslashtirishlar</h4>'+accFields(m,acc,'ed')+
      '<div class="in-row2"><label class="in-field">Amal qilish muddati<input type="date" name="validUntil" value="'+esc(pr.validUntil||'')+'"></label><label class="in-check in-doc"><input type="checkbox" name="documentChecked"'+(pr.documentChecked?' checked':'')+'><span>Hujjat (guvohnoma / ma’lumotnoma) tekshirildi</span></label></div>'+
      '<label class="in-field">O‘qituvchilar uchun tavsiya<small>O‘qituvchi va dekanatga ko‘rinadi (talaba rozi bo‘lsa)</small><textarea name="teacherNote" rows="2" maxlength="600">'+esc(pr.teacherNote||'')+'</textarea></label>'+
      '<label class="in-field">Ichki izoh<small>Faqat koordinatorlar ko‘radi</small><textarea name="coordinatorNote" rows="2" maxlength="3000">'+esc(pr.coordinatorNote||'')+'</textarea></label>'+
      '<label class="in-field">Talabaga izoh<textarea name="decisionNote" rows="2" maxlength="600">'+esc(pr.decisionNote||'')+'</textarea></label>'+
      '<div class="in-actions"><button type="button" class="primary" data-st="approved">✓ Tasdiqlash va qo‘llash</button><button type="button" class="ghost" data-st="rejected">Rad etish</button>'+(pr.status==='approved'?'<button type="button" class="ghost" data-st="none">Moslashtirishni to‘xtatish</button>':'')+'</div></form>'+
      (pr.history?.length?'<details class="in-history"><summary>Tarix ('+pr.history.length+')</summary><ul>'+pr.history.slice().reverse().map(h=>'<li>'+esc(fmtDay(h.at))+' · '+esc(m.statuses[h.action]||(h.action==='request'?'So‘rov':h.action))+(h.note?' — '+esc(h.note):'')+'</li>').join('')+'</ul></details>':''),{wide:true});
    s.body.querySelectorAll('[data-st]').forEach(b=>b.onclick=async()=>{const f=s.body.querySelector('#inEdit');
      try{await api('/inclusion/students/'+userId,{method:'PUT',body:JSON.stringify({status:b.dataset.st,needs:readNeeds(f),accommodations:readAcc(m,f),validUntil:f.validUntil.value,documentChecked:f.documentChecked.checked,teacherNote:f.teacherNote.value,coordinatorNote:f.coordinatorNote.value,decisionNote:f.decisionNote.value})});
        toast(b.dataset.st==='approved'?'Tasdiqlandi — moslashtirishlar endi avtomatik ishlaydi':'Saqlandi');s.close();done?.()}catch(e){toast(e.message)}});
  }

  // ---------- coordinator overview ----------
  async function paneOverview(p,m){
    const x=await api('/inclusion/overview'),max=o=>Math.max(1,...Object.values(o));
    const bars=(obj,labels)=>'<ul class="in-bars">'+Object.entries(obj).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k,v])=>'<li><span>'+esc(labels(k))+'</span><i style="--w:'+Math.round(v/max(obj)*100)+'%" aria-hidden="true"></i><b>'+v+'</b></li>').join('')+'</ul>';
    const accLabel=k=>{const a=m.accommodations.find(y=>y.key===k);return a?a.icon+' '+a.label:k};
    p.innerHTML='<div class="in-kpis"><div><b>'+x.active+'</b><span>Faol moslashtirish</span></div><div class="'+(x.pendingRequests?'warn':'')+'"><b>'+x.pendingRequests+'</b><span>Yangi so‘rov</span></div><div><b>'+x.expiring+'</b><span>30 kunda muddati tugaydi</span></div><div><b>'+x.support+'</b><span>Surdotarjimon / assistent</span></div></div>'+
      '<div class="in-grid"><article class="in-card"><header><h3>Ehtiyojlar bo‘yicha</h3></header>'+(x.active?bars(x.byNeed,k=>(m.needs[k]?.icon||'')+' '+(m.needs[k]?.label||k)):empty('Ma’lumot yo‘q'))+'</article>'+
      '<article class="in-card"><header><h3>Moslashtirishlar</h3></header>'+(x.active?bars(x.byAcc,accLabel):empty('Ma’lumot yo‘q'))+'</article></div>'+
      (x.captionGroups?'<article class="in-card"><header><h3>Subtitr kerak bo‘lgan guruhlar</h3><span class="in-muted">so‘nggi 14 kun</span></header>'+(x.captionGroups.length?'<div class="in-table"><div class="in-tr in-th in-tr3"><span>Guruh</span><span>Talabalar</span><span>Matnli darslar</span></div>'+x.captionGroups.map(g=>'<div class="in-tr in-tr3'+(g.transcripts?'':' in-warn')+'"><span>'+esc(g.group)+'</span><span>'+g.students+'</span><span>'+(g.transcripts?g.transcripts+' ta':'⚠ Subtitr ishlatilmagan')+'</span></div>').join('')+'</div>':empty('Bunday guruh yo‘q'))+'</article>':'');
  }

  // ---------- support staff ----------
  async function paneSupport(p,m){
    const rows=await api('/inclusion/support');
    p.innerHTML='<p class="in-lead">Surdotarjimon guruh darslariga o‘z akkaunti bilan kiradi; uning videosi talabalarga doim ekranning chap pastida ko‘rinadi. Assistent va konspekt yordamchisi ham darsga kira oladi.</p><div class="in-actions"><button type="button" class="primary" id="inAddSupport">+ Yordamchi biriktirish</button></div>'+
      (rows.length?'<div class="in-table"><div class="in-tr in-th in-tr4"><span>Xodim</span><span>Turi</span><span>Guruhlar</span><span></span></div>'+rows.map(r=>'<div class="in-tr in-tr4"><span><b>'+esc(r.fullName)+'</b><small>'+esc(r.login)+'</small></span><span>'+esc(r.kindLabel)+'</span><span>'+r.groups.map(g=>esc(g.name)).join(', ')+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</span><span><button type="button" class="ghost" data-del="'+esc(r.id)+'">Olib tashlash</button></span></div>').join('')+'</div>':empty('Hali yordamchi biriktirilmagan'));
    p.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(!await askConfirmation('Biriktirish olib tashlansinmi?'))return;try{await api('/inclusion/support/'+b.dataset.del,{method:'DELETE'});paneSupport(p,m)}catch(e){toast(e.message)}});
    p.querySelector('#inAddSupport').onclick=()=>pickPerson('Xodimni tanlang (surdotarjimon yoki assistent)',true,(userId,name)=>{
      const chosen=new Map();
      const s=sheet('Biriktirish · '+name,'<form class="in-form" id="inSup"><label class="in-field">Yordam turi<select name="kind">'+Object.entries(m.supportKinds).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></label><label class="in-field">Guruh qo‘shish<input type="search" id="inGroupQ" placeholder="Guruh nomi"></label><div id="inGroupHits" class="in-picklist"></div><div id="inGroupSel" class="in-chips"></div><label class="in-field">Izoh<input name="note" maxlength="300"></label><div class="in-actions"><button class="primary" type="submit">Saqlash</button></div></form>');
      const drawSel=()=>{s.body.querySelector('#inGroupSel').innerHTML=[...chosen].map(([id,n])=>'<button type="button" class="hx-plain in-chip" data-un="'+esc(id)+'">'+esc(n)+' ×</button>').join('');s.body.querySelectorAll('[data-un]').forEach(b=>b.onclick=()=>{chosen.delete(b.dataset.un);drawSel()})};
      let t;s.body.querySelector('#inGroupQ').oninput=e=>{clearTimeout(t);t=setTimeout(async()=>{const g=await api('/inclusion/groups?q='+encodeURIComponent(e.target.value)).catch(()=>[]);s.body.querySelector('#inGroupHits').innerHTML=g.map(x=>'<button type="button" class="hx-plain in-pick" data-g="'+esc(x.id)+'">'+esc(x.name)+'</button>').join('');s.body.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{chosen.set(b.dataset.g,b.textContent);drawSel()})},250)};
      s.body.querySelector('#inSup').onsubmit=async e=>{e.preventDefault();try{await api('/inclusion/support',{method:'POST',body:JSON.stringify({userId,kind:e.target.kind.value,groupIds:[...chosen.keys()],note:e.target.note.value})});toast('Biriktirildi');s.close();paneSupport(p,m)}catch(err){toast(err.message)}};
    });
  }
  async function paneSupportMine(p){
    const x=mine||await api('/inclusion/support/mine');
    p.innerHTML='<p class="in-lead">Siz '+x.assignments.map(a=>'<b>'+esc(a.kindLabel)+'</b> ('+a.groups.map(esc).join(', ')+')').join('; ')+' sifatida biriktirilgansiz.</p>'+
      (x.lessons.length?'<div class="in-cards">'+x.lessons.map(l=>'<article class="in-card"><header><h3>'+esc(l.title)+'</h3><span class="in-muted">'+esc(l.start+'–'+l.end)+'</span></header><p>'+esc(l.group)+' · '+esc(l.teacher)+'</p><div class="in-actions">'+(l.mode==='offline'?'<span class="in-muted">Auditoriya darsi</span>':'<button type="button" class="primary" data-join="'+esc(l.id)+'">Darsga kirish</button>')+'</div></article>').join('')+'</div>':empty('Bugun dars yo‘q','Biriktirilgan guruhlarda bugun jadval bo‘yicha dars topilmadi'));
    p.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>enterLive?.(b.dataset.join));
  }

  // ---------- video subtitles ----------
  async function paneVideos(p){
    const x=await api('/inclusion/audit');
    p.innerHTML='<p class="in-lead">Subtitrli videodarsni eshitmaydigan talaba ham to‘liq o‘zlashtiradi, matn varianti esa ko‘rmaydigan talabaga ekran o‘qish dasturi orqali yetib boradi. WebVTT (.vtt) yoki SRT (.srt) fayl yuklang — YouTube, CapCut yoki boshqa dasturda tayyorlash mumkin.</p>'+
      '<div class="in-kpis"><div><b>'+x.summary.total+'</b><span>Videodars</span></div><div class="'+(x.summary.total-x.summary.withCaptions?'warn':'')+'"><b>'+x.summary.withCaptions+'</b><span>Subtitrli</span></div></div>'+
      (x.videos.length?'<div class="in-table"><div class="in-tr in-th in-tr4"><span>Video</span><span>Manba</span><span>Subtitr</span><span></span></div>'+x.videos.map(v=>'<div class="in-tr in-tr4'+(v.captions?'':' in-warn')+'"><span>'+esc(v.title)+'</span><span>'+esc(v.sourceType)+'</span><span>'+(v.captions?'✓ '+v.cues+' ta qator':'Yo‘q')+'</span><span class="in-dl"><button type="button" class="secondary" data-up="'+esc(v.id)+'">'+(v.captions?'Almashtirish':'Yuklash')+'</button>'+(v.captions?'<button type="button" class="ghost" data-rm="'+esc(v.id)+'">O‘chirish</button>':'')+'</span></div>').join('')+'</div>':empty('Videodars yo‘q'));
    p.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>uploadCaptions(b.dataset.up,()=>paneVideos(p)));
    p.querySelectorAll('[data-rm]').forEach(b=>b.onclick=async()=>{if(!await askConfirmation('Subtitr o‘chirilsinmi?'))return;try{await api('/inclusion/videos/'+b.dataset.rm+'/captions',{method:'DELETE'});paneVideos(p)}catch(e){toast(e.message)}});
  }
  function uploadCaptions(videoId,done){
    const input=document.createElement('input');input.type='file';input.accept='.vtt,.srt,text/vtt,application/x-subrip';
    input.onchange=async()=>{const f=input.files?.[0];if(!f)return;if(f.size>400*1024)return toast('Fayl 400 KB dan katta');
      try{const text=await f.text(),r=await api('/inclusion/videos/'+videoId+'/captions',{method:'PUT',body:JSON.stringify({text,lang:'uz'})});toast('Subtitr saqlandi: '+r.cues+' ta qator');done?.()}catch(e){toast(e.message)}};
    input.click();
  }

  // ---------- guide ----------
  async function paneGuide(p){
    p.innerHTML='<div class="in-guide">'+[
      ['👂','Eshitishda qiyinchilik bor talaba','Subtitr guruhda shunday talaba bo‘lsa avtomatik yoqiladi (Chrome/Edge). Mikrofonga yaqin, aniq va sekinroq gapiring; muhim atama va formulalarni chatga yozing; yuzingiz kamerada ko‘rinsin (lab o‘qish uchun). Dars matni o‘zi saqlanadi — talaba keyin «Dars matnlari»dan o‘qiydi.'],
      ['🤟','Surdotarjimon bilan dars','Tarjimon darsga o‘z akkaunti bilan kiradi va videosi talabalarga doim ko‘rinadi. Tarjimonga 3–5 soniya kechikish uchun pauza qiling, savollarni takrorlang.'],
      ['👁','Ko‘rishda qiyinchilik bor talaba','Slayd va doskadagi narsani ovoz chiqarib izohlang («chap tomondagi grafikda…» emas, nima tasvirlanganini ayting). Materiallarni matnli PDF/DOCX qilib bering — skan rasm emas. Rasmlarga qisqa izoh yozing.'],
      ['📖','Disleksiya va o‘qishda qiyinchilik','Topshiriqni qisqa, bandlarga bo‘lingan holda yozing; og‘zaki javobni qabul qiling. Platformadagi «Disleksiya» profili maxsus shrift va ovozli o‘qishni yoqadi.'],
      ['♿','Harakatlanishda qiyinchilik','Auditoriya darsini 1-qavat yoki liftli xonaga qo‘ying. Onlayn testda qo‘shimcha vaqt tizimda avtomatik beriladi; yozish qiyin bo‘lsa audio/video javobni qabul qiling.'],
      ['🧠','Diqqat va idrok','Darsni qisqa bo‘laklarga bo‘ling, har 15–20 daqiqada qisqa xulosa qiling. Topshiriq muddati kerak bo‘lsa avtomatik uzaytiriladi.'],
      ['🔒','Maxfiylik','Tashxis faqat koordinatorga ko‘rinadi. Talabaning ehtiyojini guruh oldida muhokama qilmang; savollarni shaxsiy chatda bering.']
    ].map(([i,t,d])=>'<article class="in-card"><header><h3><span aria-hidden="true">'+i+'</span> '+esc(t)+'</h3></header><p>'+esc(d)+'</p></article>').join('')+'</div>';
  }

  return {render,uploadCaptions,sheet};
}
