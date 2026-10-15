// HALLAYM EDU — forms of study UI: overview per form (kunduzgi/kechki/sirtqi/masofaviy), group settings with
// correspondence sessions, bell schedule editor, classroom attendance (roster + rotating QR) and student check-in.
export const FORM_UI={kunduzgi:['☀️','Kunduzgi'],kechki:['🌙','Kechki'],sirtqi:['📮','Sirtqi'],masofaviy:['🌐','Masofaviy']};
export const MODE_UI={offline:['🏫','Auditoriya'],online:['🎥','Onlayn'],hybrid:['🔀','Gibrid']};
export const lessonModeOf=l=>MODE_UI[l?.mode]?l.mode:(l?.liveEnabled===false?'offline':'online');
const escHtml=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export const formBadge=f=>FORM_UI[f]?'<span class="ef-badge ef-'+f+'">'+FORM_UI[f][0]+' '+FORM_UI[f][1]+'</span>':'';
export const modeBadge=m=>MODE_UI[m]?'<span class="em-badge em-'+m+'">'+MODE_UI[m][0]+' '+MODE_UI[m][1]+'</span>':'';
const STATUS=[['present','Keldi'],['late','Kechikdi'],['absent','Kelmadi'],['excused','Sababli']];
let qrLib=null;
function loadQr(){ // self-hosted QR generator (qrcode-generator 1.4.4, MIT), loaded only when a teacher opens a check-in code
  if(window.qrcode)return Promise.resolve(window.qrcode);
  if(!qrLib)qrLib=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/qrcode.js';s.async=true;s.onload=()=>window.qrcode?resolve(window.qrcode):reject(new Error('QR'));s.onerror=()=>{qrLib=null;reject(new Error('QR kutubxonasi yuklanmadi'))};document.head.appendChild(s)});
  return qrLib;
}

export function createFormsUi({api,toast,esc=escHtml,go,currentUser}){
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  let meta=null;const getMeta=async()=>meta||(meta=await api('/edu/meta'));
  function sheet(title,html,{wide=false,onClose=null}={}){
    const el=document.createElement('div');el.className='ux-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    el.innerHTML='<div class="ux-card'+(wide?' wide':'')+'"><header><h2>'+esc(title)+'</h2><button type="button" class="hx-plain ux-x" aria-label="Yopish">×</button></header><div class="ux-body">'+html+'</div></div>';
    const close=()=>{el.remove();document.removeEventListener('keydown',key);onClose?.()};const key=e=>{if(e.key==='Escape')close()};
    el.addEventListener('click',e=>{if(e.target===el||e.target.closest('.ux-x'))close()});document.addEventListener('keydown',key);document.body.appendChild(el);
    return {el,close,body:el.querySelector('.ux-body')};
  }
  const empty=(t,s='')=>'<div class="ux-empty"><b>'+esc(t)+'</b>'+(s?'<span>'+esc(s)+'</span>':'')+'</div>';
  const fmtDay=d=>d?new Date(d+'T00:00:00').toLocaleDateString('uz-UZ',{day:'2-digit',month:'short'}):'';

  // ---------- overview page ----------
  let tab='lessons',groupFilter='';
  async function renderOverview(){
    const root=$('#eduFormsRoot');if(!root)return;root.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    let x;try{[x]=await Promise.all([api('/edu/overview'),getMeta()])}catch(e){root.innerHTML=empty('Panel yuklanmadi',e.message);return}
    const admin=['admin','superadmin'].includes(currentUser()?.role);
    root.innerHTML='<div class="ef-cards">'+x.forms.map(f=>'<button type="button" class="hx-plain ef-card ef-'+f.key+'" data-filter="'+f.key+'"><span class="ef-ico">'+f.icon+'</span><b>'+esc(f.label)+'</b><div class="ef-nums"><span><i>'+f.groups+'</i> guruh</span><span><i>'+f.students+'</i> talaba</span><span><i>'+f.lessonsToday+'</i> bugungi dars</span></div><div class="ef-rate"><div class="ef-bar"><i style="width:'+(f.rate??0)+'%"></i></div><small>'+(f.rate===null?'Bugun hali dars boshlanmagan':'Davomat: '+f.rate+'% ('+f.attended+' / '+f.expected+')')+'</small></div>'+(f.lessonsToday?'<div class="ef-modes">'+Object.entries(f.modes).filter(([,n])=>n).map(([m,n])=>modeBadge(m).replace('</span>',' · '+n+'</span>')).join('')+'</div>':'')+'</button>').join('')+'</div>'+
      '<div class="ux-tabs ef-tabs" role="tablist">'+[['lessons','📅 Bugungi darslar'],['groups','👥 Guruhlar'],['sessions','📮 Sirtqi sessiyalar'],['bells','🔔 Para vaqtlari']].map(([k,l])=>'<button type="button" class="hx-plain'+(k===tab?' on':'')+'" data-tab="'+k+'">'+l+'</button>').join('')+'</div><section id="efPane"></section>';
    const draw=()=>{const p=$('#efPane');({lessons:()=>paneLessons(p,x),groups:()=>paneGroups(p),sessions:()=>paneSessions(p,x),bells:()=>paneBells(p,admin)}[tab])()};
    root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;root.querySelectorAll('[data-tab]').forEach(y=>y.classList.toggle('on',y===b));draw()}));
    root.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{groupFilter=groupFilter===b.dataset.filter?'':b.dataset.filter;root.querySelectorAll('[data-filter]').forEach(y=>y.classList.toggle('sel',y.dataset.filter===groupFilter));draw()}));
    root.querySelectorAll('[data-filter]').forEach(y=>y.classList.toggle('sel',y.dataset.filter===groupFilter));
    draw();
  }
  function paneLessons(p,x){
    const rows=x.lessons.filter(l=>!groupFilter||l.form===groupFilter);
    p.innerHTML=rows.length?'<div class="ef-table"><table><thead><tr><th>Vaqt</th><th>Dars</th><th>Guruh</th><th>Shakl</th><th>O‘qituvchi</th><th>Xona</th><th>Davomat</th></tr></thead><tbody>'+rows.map(l=>'<tr class="ls-'+l.state+'"><td><b>'+esc(l.start)+'</b>–'+esc(l.end)+(l.state==='now'?' <span class="ef-now">hozir</span>':'')+'</td><td>'+esc(l.title)+'</td><td>'+esc(l.group)+'<br>'+formBadge(l.form)+'</td><td>'+modeBadge(l.mode)+'</td><td>'+esc(l.teacher)+'</td><td>'+esc(l.room||'—')+'</td><td>'+(l.state==='later'?'—':'<b>'+l.attended+'</b> / '+l.students)+'</td></tr>').join('')+'</tbody></table></div>':empty('Bugun dars yo‘q',groupFilter?'Bu ta’lim shaklida bugun dars rejalashtirilmagan.':'');
  }
  async function paneGroups(p){
    p.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    let rows;try{rows=await api('/edu/groups')}catch(e){p.innerHTML=empty('Yuklanmadi',e.message);return}
    rows=rows.filter(g=>!groupFilter||g.educationForm===groupFilter);
    const editable=rows.some(g=>g.canEdit),picked=new Set();
    p.innerHTML=(editable&&rows.length?'<div class="ef-bulk" hidden><b class="ef-bulk-n"></b><select data-bf><option value="">Ta’lim shakli…</option>'+Object.entries(FORM_UI).map(([k,v])=>'<option value="'+k+'">'+v[0]+' '+v[1]+'</option>').join('')+'</select><select data-bs><option value="">Smena…</option>'+Object.entries(meta.shifts).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select><button type="button" class="hx-plain ux-btn sm" data-bapply>Qo‘llash</button></div>':'')+(rows.length?'<div class="ef-table"><table><thead><tr>'+(editable?'<th><input type="checkbox" data-pickall aria-label="Hammasini tanlash"></th>':'')+'<th>Guruh</th><th>Kafedra</th><th>Shakl</th><th>Smena</th><th>Kurs</th><th>Til</th><th>Talaba</th><th></th></tr></thead><tbody>'+rows.map(g=>'<tr>'+(editable?'<td>'+(g.canEdit?'<input type="checkbox" data-pick="'+g._id+'" aria-label="Tanlash">':'')+'</td>':'')+'<td><b>'+esc(g.name)+'</b><br><small>'+esc(g.code)+'</small></td><td>'+esc(g.kafedra)+'</td><td>'+formBadge(g.educationForm)+(g.educationForm==='sirtqi'?'<br><small>'+g.sessions.length+' sessiya</small>':'')+'</td><td>'+esc(meta.shifts[g.shift]||'—')+'</td><td>'+(g.courseYear||'—')+'</td><td>'+esc(meta.languages[g.language]||'—')+'</td><td>'+g.students+'</td><td>'+(g.canEdit?'<button type="button" class="hx-plain ux-btn ghost sm" data-edit="'+g._id+'">Sozlash</button>':'')+'</td></tr>').join('')+'</tbody></table></div>':empty('Guruh topilmadi'));
    const bar=p.querySelector('.ef-bulk'),sync=()=>{if(!bar)return;bar.hidden=!picked.size;bar.querySelector('.ef-bulk-n').textContent=picked.size+' ta guruh tanlandi'};
    p.querySelectorAll('[data-pick]').forEach(c=>c.addEventListener('change',()=>{c.checked?picked.add(c.dataset.pick):picked.delete(c.dataset.pick);sync()}));
    p.querySelector('[data-pickall]')?.addEventListener('change',e=>{p.querySelectorAll('[data-pick]').forEach(c=>{c.checked=e.target.checked;c.checked?picked.add(c.dataset.pick):picked.delete(c.dataset.pick)});sync()});
    bar?.querySelector('[data-bapply]').addEventListener('click',async()=>{const body={ids:[...picked]},f=bar.querySelector('[data-bf]').value,sh=bar.querySelector('[data-bs]').value;if(f)body.educationForm=f;if(sh)body.shift=sh;if(!f&&!sh)return toast('Ta’lim shakli yoki smenani tanlang');try{const r=await api('/edu/groups-bulk',{method:'PATCH',body:JSON.stringify(body)});toast(r.saved+' ta guruh yangilandi');paneGroups(p)}catch(e){toast(e.message)}});
    p.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>groupEditor(rows.find(g=>g._id===b.dataset.edit),()=>paneGroups(p))));
  }
  function paneSessions(p,x){
    const rows=x.sessions;const label={active:'Sessiya davom etmoqda',upcoming:'Keyingi sessiya',none:'Sessiya belgilanmagan'};
    p.innerHTML=rows.length?'<div class="ux-list">'+rows.map(s=>'<div class="ef-sess ef-s-'+s.state+'"><b>'+esc(s.group)+'</b><span>'+esc(label[s.state])+(s.session?': '+esc(s.session.name)+' · '+fmtDay(s.session.from)+' – '+fmtDay(s.session.to):'')+'</span><small>'+(s.state==='none'?'Sessiya kiritilmaguncha darslar har hafta ko‘rinadi':(s.count+' ta sessiya'))+'</small></div>').join('')+'</div><p class="ux-note">Sirtqi guruh darslari faqat sessiya kunlarida «Bugungi darslar», jonli xonalar va bosh sahifada ko‘rinadi. Sessiyalarni «Guruhlar» bo‘limida «Sozlash» orqali kiriting.</p>':empty('Sirtqi guruhlar yo‘q','Guruhni «Sirtqi» shakliga o‘tkazsangiz, u shu yerda ko‘rinadi.');
  }
  function paneBells(p,admin){
    const b=meta.bells;let form='kunduzgi';
    const draw=()=>{p.innerHTML='<div class="ux-chips ef-forms">'+Object.keys(FORM_UI).map(f=>'<button type="button" class="hx-plain'+(f===form?' on':'')+'" data-f="'+f+'">'+FORM_UI[f][0]+' '+FORM_UI[f][1]+'</button>').join('')+'</div><form class="ux-form ef-bells">'+b[form].map((pr,i)=>'<div class="ef-bell"><b>'+(i+1)+'-para</b><input type="time" data-i="'+i+'" data-k="0" value="'+pr[0]+'"'+(admin?'':' disabled')+'><span>–</span><input type="time" data-i="'+i+'" data-k="1" value="'+pr[1]+'"'+(admin?'':' disabled')+'>'+(admin?'<button type="button" class="hx-plain ux-del" data-rm="'+i+'" aria-label="O‘chirish">×</button>':'')+'</div>').join('')+(admin?'<div class="ux-row"><button type="button" class="hx-plain ux-btn ghost" data-add>＋ Para</button><button type="submit" class="hx-plain ux-btn">Saqlash</button></div>':'<p class="ux-note">Para vaqtlarini administrator o‘zgartiradi.</p>')+'</form><p class="ux-note">Dars jadvaliga dars qo‘shishda guruhning ta’lim shakliga mos paralar taklif qilinadi.</p>';
      p.querySelectorAll('[data-f]').forEach(x=>x.addEventListener('click',()=>{read();form=x.dataset.f;draw()}));
      p.querySelector('[data-add]')?.addEventListener('click',()=>{read();const last=b[form][b[form].length-1]||['08:30','09:50'];b[form].push([last[1],last[1]]);draw()});
      p.querySelectorAll('[data-rm]').forEach(x=>x.addEventListener('click',()=>{read();b[form].splice(Number(x.dataset.rm),1);draw()}));
      p.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();read();try{const r=await api('/edu/bells',{method:'PUT',body:JSON.stringify({bells:b})});meta.bells=r.bells;toast('Para vaqtlari saqlandi');draw()}catch(err){toast(err.message)}});
    };
    const read=()=>$$('input[type=time]',p).forEach(i=>{b[form][Number(i.dataset.i)][Number(i.dataset.k)]=i.value});
    draw();
  }
  async function groupEditor(g,after){
    await getMeta();const sessions=(g.sessions||[]).map(s=>({...s}));
    const opts=(o,v)=>Object.entries(o).map(([k,l])=>'<option value="'+k+'"'+(String(v)===String(k)?' selected':'')+'>'+esc(l)+'</option>').join('');
    const sh=sheet(g.name+' · ta’lim sozlamalari','<form class="ux-form"><div class="ux-row"><label>Ta’lim shakli<select name="educationForm">'+Object.entries(FORM_UI).map(([k,v])=>'<option value="'+k+'"'+(g.educationForm===k?' selected':'')+'>'+v[0]+' '+v[1]+'</option>').join('')+'</select></label><label>Smena<select name="shift"><option value="">—</option>'+opts(meta.shifts,g.shift)+'</select></label></div><div class="ux-row"><label>Kurs<select name="courseYear"><option value="">—</option>'+[1,2,3,4,5,6].map(n=>'<option'+(g.courseYear===n?' selected':'')+'>'+n+'</option>').join('')+'</select></label><label>Ta’lim tili<select name="language"><option value="">—</option>'+opts(meta.languages,g.language)+'</select></label><label>Daraja<select name="degree"><option value="">—</option>'+opts(meta.degrees,g.degree)+'</select></label></div><fieldset class="ef-sessions"><legend>Sirtqi sessiyalar</legend><div class="ux-fields"></div><button type="button" class="hx-plain ux-btn ghost sm" data-add>＋ Sessiya</button><p class="ux-note">Sirtqi guruhda sessiya kiritilsa, darslar faqat sessiya kunlarida o‘tadi.</p></fieldset><button type="submit" class="hx-plain ux-btn">Saqlash</button></form>');
    const f=sh.body.querySelector('form'),box=sh.body.querySelector('.ux-fields'),fs=sh.body.querySelector('.ef-sessions');
    const read=()=>$$('.ux-frow',box).forEach(r=>{const s=sessions[Number(r.dataset.i)];s.name=$('[data-k=name]',r).value;s.from=$('[data-k=from]',r).value;s.to=$('[data-k=to]',r).value});
    const draw=()=>{box.innerHTML=sessions.map((s,i)=>'<div class="ux-frow ef-srow" data-i="'+i+'"><input data-k="name" placeholder="Masalan: Kuzgi sessiya" value="'+esc(s.name||'')+'"><input type="date" data-k="from" value="'+esc(s.from||'')+'"><input type="date" data-k="to" value="'+esc(s.to||'')+'"><button type="button" class="hx-plain ux-del" data-rm="'+i+'">×</button></div>').join('')||'<p class="ux-note">Sessiya kiritilmagan.</p>';box.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>{read();sessions.splice(Number(b.dataset.rm),1);draw()}))};
    const toggle=()=>{fs.hidden=f.educationForm.value!=='sirtqi'};
    f.educationForm.addEventListener('change',toggle);toggle();draw();
    sh.body.querySelector('[data-add]').addEventListener('click',()=>{read();sessions.push({name:'',from:'',to:''});draw()});
    f.addEventListener('submit',async e=>{e.preventDefault();read();const d=Object.fromEntries(new FormData(f).entries());try{await api('/edu/groups/'+g._id,{method:'PATCH',body:JSON.stringify({...d,sessions:d.educationForm==='sirtqi'?sessions.filter(s=>s.from||s.to||s.name):[]})});toast('Guruh sozlamalari saqlandi');sh.close();after?.()}catch(err){toast(err.message)}});
  }

  // ---------- classroom attendance (teacher) ----------
  async function openAttendance(scheduleId){
    let r;try{r=await api('/edu/lessons/'+scheduleId+'/roster')}catch(e){return toast(e.message)}
    const L=r.lesson,state=new Map(r.students.map(s=>[s._id,s.status])),changed=new Set();let poll=0;
    const sh=sheet(L.title,'<div class="ef-att"><div class="ef-att-head">'+formBadge(L.form)+modeBadge(L.mode)+'<span>'+esc(L.group)+' · '+esc(L.start)+'–'+esc(L.end)+(L.room?' · '+esc(L.room)+'-xona':'')+'</span></div>'+(!r.today?'<p class="ux-note">Bu dars bugun emas: davomat bugungi sana bilan saqlanadi.</p>':'')+'<div class="ux-chips ef-att-tabs"><button type="button" class="hx-plain on" data-t="list">📋 Ro‘yxat</button><button type="button" class="hx-plain" data-t="qr">📱 QR / kod</button></div><div class="ef-att-pane"></div></div>',{wide:true,onClose:()=>clearInterval(poll)});
    const pane=sh.body.querySelector('.ef-att-pane');
    const counts=()=>{const c={present:0,late:0,absent:0,excused:0,none:0};for(const v of state.values())c[v||'none']++;return c};
    function drawList(){
      clearInterval(poll);const c=counts();
      pane.innerHTML='<div class="ef-att-sum"><span class="ok">Keldi: <b>'+c.present+'</b></span><span class="late">Kechikdi: <b>'+c.late+'</b></span><span class="abs">Kelmadi: <b>'+c.absent+'</b></span><span>Sababli: <b>'+c.excused+'</b></span><span class="muted">Belgilanmagan: <b>'+c.none+'</b></span></div><div class="ux-row"><button type="button" class="hx-plain ux-btn ghost sm" data-all>✓ Belgilanmaganlar — keldi</button><button type="button" class="hx-plain ux-btn ghost sm" data-rest>✗ Belgilanmaganlar — kelmadi</button></div>'+
        (r.students.length?'<div class="ef-roster">'+r.students.map((s,i)=>'<div class="ef-row"><span class="ef-n">'+(i+1)+'</span><span class="ef-name">'+esc(s.fullName)+(s.method==='qr'?' <small class="ef-qr">QR</small>':s.method==='online'?' <small class="ef-on">onlayn</small>':'')+'</span><span class="ef-seg">'+STATUS.map(([k,l])=>'<button type="button" class="hx-plain s-'+k+(state.get(s._id)===k?' on':'')+'" data-s="'+s._id+'" data-v="'+k+'">'+l+'</button>').join('')+'</span></div>').join('')+'</div>':empty('Guruhda talaba yo‘q'))+
        '<div class="ef-save"><button type="button" class="hx-plain ux-btn" data-save'+(changed.size?'':' disabled')+'>Davomatni saqlash'+(changed.size?' ('+changed.size+')':'')+'</button></div>';
      pane.querySelectorAll('[data-s]').forEach(b=>b.addEventListener('click',()=>{state.set(b.dataset.s,b.dataset.v);changed.add(b.dataset.s);drawList()}));
      pane.querySelector('[data-all]')?.addEventListener('click',()=>{for(const [k,v] of state)if(!v){state.set(k,'present');changed.add(k)}drawList()});
      pane.querySelector('[data-rest]')?.addEventListener('click',()=>{for(const [k,v] of state)if(!v){state.set(k,'absent');changed.add(k)}drawList()});
      pane.querySelector('[data-save]')?.addEventListener('click',async e=>{e.target.disabled=true;try{const records=[...changed].map(id=>({studentId:id,status:state.get(id)})).filter(x=>x.status);const x=await api('/live/rooms/'+scheduleId+'/attendance',{method:'POST',body:JSON.stringify({records,note:'Auditoriya davomati'})});changed.clear();toast('Saqlandi: '+x.saved+' ta talaba');drawList()}catch(err){toast(err.message);e.target.disabled=false}});
    }
    async function drawQr(){
      clearInterval(poll);
      let w=await api('/edu/lessons/'+scheduleId+'/checkin').catch(()=>({open:false}));
      const render=async()=>{
        if(!w.open){pane.innerHTML='<div class="ef-qr-start"><p>Talabalar telefoni bilan QR kodni skanerlaydi yoki ekrandagi 6 xonali kodni kiritadi. Kod har 20 soniyada yangilanadi — uni boshqa joyga yuborib bo‘lmaydi.</p><div class="ux-row"><label>Ochiq turadi<select data-min><option value="10">10 daqiqa</option><option value="15" selected>15 daqiqa</option><option value="30">30 daqiqa</option><option value="45">45 daqiqa</option></select></label><button type="button" class="hx-plain ux-btn big" data-open>QR kodni ochish</button></div></div>';
          pane.querySelector('[data-open]').addEventListener('click',async()=>{try{w=await api('/edu/lessons/'+scheduleId+'/checkin/open',{method:'POST',body:JSON.stringify({minutes:Number(pane.querySelector('[data-min]').value)})});render();start()}catch(e){toast(e.message)}});return}
        const url=location.origin+'/#'+w.payload+w.code,left=Math.max(0,Math.round((w.nextAt-Date.now())/1000));
        pane.innerHTML='<div class="ef-qr"><div class="ef-qr-img" aria-label="Davomat QR kodi"></div><div class="ef-qr-side"><small>Davomat kodi</small><div class="ef-code">'+esc(w.code.slice(0,3))+' '+esc(w.code.slice(3))+'</div><div class="ef-bar"><i style="width:'+Math.round(left/(w.slotMs/1000)*100)+'%"></i></div><small>'+left+' soniyadan keyin yangilanadi · '+new Date(w.closesAt).toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})+' gacha ochiq</small><div class="ef-count"><b>'+w.count+'</b> talaba belgilandi</div><ul class="ef-recent">'+(w.recent||[]).map(n=>'<li>'+esc(n.name)+(n.status==='late'?' <small>kechikdi</small>':'')+'</li>').join('')+'</ul><div class="ux-row"><button type="button" class="hx-plain ux-btn ghost" data-full>⛶ Proyektorga</button><button type="button" class="hx-plain ux-btn danger" data-close>Yopish</button></div></div></div>';
        const box=pane.querySelector('.ef-qr-img');
        loadQr().then(q=>{const qr=q(0,'M');qr.addData(url);qr.make();box.innerHTML=qr.createSvgTag({cellSize:6,margin:2,scalable:true})}).catch(()=>{box.innerHTML='<div class="ef-qr-fallback">QR yuklanmadi — talabalar kodni qo‘lda kiritadi</div>'});
        pane.querySelector('[data-close]').addEventListener('click',async()=>{await api('/edu/lessons/'+scheduleId+'/checkin/close',{method:'POST',body:'{}'}).catch(()=>{});w={open:false};clearInterval(poll);render();refreshRoster()});
        pane.querySelector('[data-full]').addEventListener('click',()=>{const el=pane.querySelector('.ef-qr');(el.requestFullscreen?el.requestFullscreen():Promise.reject()).catch(()=>el.classList.toggle('ef-big'))});
      };
      const start=()=>{clearInterval(poll);poll=setInterval(async()=>{try{w=await api('/edu/lessons/'+scheduleId+'/checkin');if(!w.open)clearInterval(poll);await render()}catch{}},3000)};
      await render();if(w.open)start();
    }
    async function refreshRoster(){try{r=await api('/edu/lessons/'+scheduleId+'/roster');for(const s of r.students)if(!changed.has(s._id))state.set(s._id,s.status)}catch{}}
    sh.body.querySelectorAll('[data-t]').forEach(b=>b.addEventListener('click',async()=>{sh.body.querySelectorAll('[data-t]').forEach(x=>x.classList.toggle('on',x===b));if(b.dataset.t==='qr')drawQr();else{await refreshRoster();drawList()}}));
    drawList();
  }

  // ---------- student check-in ----------
  async function submitCheckin({scheduleId='',code}){
    try{const r=await api('/edu/checkin',{method:'POST',body:JSON.stringify({scheduleId,code})});toast(r.already?'Siz bu darsda allaqachon belgilangansiz':(r.status==='late'?'⚠ Davomat qayd etildi (kechikish bilan): ':'✅ Davomat qayd etildi: ')+(r.lesson||''));return r}
    catch(e){toast(e.message);return null}
  }
  function mountStudentCheckin(box){
    if(!box)return;box.hidden=false;
    box.innerHTML='<form class="ef-checkin"><span class="ef-ci-ico" aria-hidden="true">📍</span><div><b>Auditoriyadagi darsda davomat</b><small>O‘qituvchi ekranidagi QR kodni telefon kamerasi bilan skanerlang yoki 6 xonali kodni kiriting</small></div><input inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="000 000" aria-label="Davomat kodi"><button type="submit" class="hx-plain ux-btn">Belgilash</button></form>';
    const f=box.querySelector('form'),inp=f.querySelector('input');
    inp.addEventListener('input',()=>{const d=inp.value.replace(/\D/g,'').slice(0,6);inp.value=d.length>3?d.slice(0,3)+' '+d.slice(3):d});
    f.addEventListener('submit',async e=>{e.preventDefault();const code=inp.value.replace(/\D/g,'');if(code.length!==6)return toast('6 xonali kodni kiriting');const b=f.querySelector('button');b.disabled=true;const r=await submitCheckin({code});b.disabled=false;if(r)inp.value=''});
  }
  async function handleCheckinHash(){
    const m=location.hash.match(/^#checkin=([a-f0-9]{24}):(\d{6})$/);if(!m)return false;
    history.replaceState({},'',location.pathname+location.search);
    if(currentUser()?.role!=='student'){toast('Davomat kodi talaba akkaunti bilan belgilanadi');return true}
    await submitCheckin({scheduleId:m[1],code:m[2]});return true;
  }
  return {renderOverview,groupEditor,openAttendance,mountStudentCheckin,handleCheckinHash,getMeta};
}
