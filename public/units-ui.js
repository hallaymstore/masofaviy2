// HALLAYM EDU — university units UI: directory, unit page (services, requests, announcements, documents, tasks,
// events, apps, staff, distance learning, settings), staff workspace and «my requests».
const KIND_ICON={leadership:'🏛',faculty:'🎓',kafedra:'📚',division:'🗂',center:'🧭',service:'🛎'};
const KIND_ORDER=['leadership','faculty','kafedra','division','center','service'];
const KIND_PLURAL={leadership:'Rahbariyat',faculty:'Fakultetlar',kafedra:'Kafedralar',division:'Bo‘lim va boshqarmalar',center:'Markazlar',service:'Xizmatlar'};
const MODULES=[['services','📝','Xizmatlar'],['queue','📥','Murojaatlar'],['announcements','📣','E’lonlar'],['documents','📁','Hujjatlar'],['tasks','✅','Vazifalar'],['events','📅','Tadbirlar'],['apps','🧩','Ilovalar'],['staff','👥','Xodimlar'],['learning','🎓','Masofaviy ta’lim'],['settings','⚙','Sozlamalar']];
const MODULE_LABELS={announcements:'E’lonlar',services:'Xizmatlar va arizalar',documents:'Hujjatlar',tasks:'Vazifalar',events:'Tadbirlar',apps:'Ilovalar',staff:'Xodimlar',learning:'Masofaviy ta’lim'};
const STATUS={new:['Yangi','st-new'],in_progress:['Ko‘rib chiqilmoqda','st-progress'],waiting:['Ma’lumot kutilmoqda','st-wait'],done:['Bajarildi','st-done'],rejected:['Rad etildi','st-rej'],cancelled:['Bekor qilindi','st-cancel']};
const STAFF_NEXT={new:['in_progress','waiting','done','rejected'],in_progress:['waiting','done','rejected'],waiting:['in_progress','done','rejected'],done:['in_progress'],rejected:['in_progress'],cancelled:[]};
const RANK={viewer:1,staff:2,deputy:3,head:4,admin:5};
const can=(role,need)=>(RANK[role]||0)>=(RANK[need]||99);
const AUD={public:'Hamma uchun',members:'Faqat bo‘lim xodimlari',students:'Talabalar uchun',staff:'Xodim va o‘qituvchilar'};
const SAUD={all:'Hamma',students:'Talabalar',staff:'Xodimlar'};
const FIELD_TYPES={text:'Qisqa matn',textarea:'Uzun matn',number:'Son',date:'Sana',select:'Tanlov',phone:'Telefon'};

export function createUnitsUi({api,toast,esc,go,currentUser,csrf=()=>''}){
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const fmtDate=v=>v?new Date(v).toLocaleDateString('uz-UZ',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
  const fmtDT=v=>v?new Date(v).toLocaleString('uz-UZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  const ago=v=>{const s=(Date.now()-new Date(v))/1000;if(s<90)return 'hozirgina';if(s<3600)return Math.round(s/60)+' daq oldin';if(s<86400)return Math.round(s/3600)+' soat oldin';return fmtDate(v)};
  const chip=(st)=>{const x=STATUS[st]||[st,''];return '<span class="ux-st '+x[1]+'">'+esc(x[0])+'</span>'};
  const empty=(t,s='')=>'<div class="ux-empty"><b>'+esc(t)+'</b>'+(s?'<span>'+esc(s)+'</span>':'')+'</div>';
  const roleLabel=r=>({admin:'Administrator',head:'Rahbar',deputy:'O‘rinbosar',staff:'Xodim',viewer:'Kuzatuvchi'})[r]||'';
  let dir=null,cur=null,curTab='',queueFilter='open';

  // ---------- sheet (dialog) ----------
  function sheet(title,html,{wide=false,onClose=null}={}){
    const el=document.createElement('div');el.className='ux-sheet';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');
    el.innerHTML='<div class="ux-card'+(wide?' wide':'')+'"><header><h2>'+esc(title)+'</h2><button type="button" class="hx-plain ux-x" aria-label="Yopish">×</button></header><div class="ux-body">'+html+'</div></div>';
    const close=()=>{el.remove();document.removeEventListener('keydown',key);onClose?.()};const key=e=>{if(e.key==='Escape')close()};
    el.addEventListener('click',e=>{if(e.target===el||e.target.closest('.ux-x'))close()});document.addEventListener('keydown',key);
    document.body.appendChild(el);setTimeout(()=>el.querySelector('input,textarea,select,button:not(.ux-x)')?.focus({preventScroll:true}),30);
    return {el,close,body:el.querySelector('.ux-body')};
  }
  const formData=f=>{const o={};for(const [k,v] of new FormData(f).entries())o[k]=v;$$('input[type=checkbox]',f).forEach(c=>{if(c.name)o[c.name]=c.checked});return o};
  async function submit(form,fn){const b=form.querySelector('[type=submit]');if(b)b.disabled=true;try{return await fn()}catch(e){toast(e.message||String(e));return null}finally{if(b)b.disabled=false}}

  // ---------- directory ----------
  async function renderUnits(){
    const root=$('#unitsRoot');if(!root)return;
    const deep=(location.hash.match(/^#unit=([a-f0-9]{24})/)||[])[1];
    if(deep&&cur?.unit?._id!==deep)return openUnit(deep); // deep link (#unit=…); a menu click shows the directory
    root.innerHTML='<div class="ux-loading">Bo‘limlar yuklanmoqda…</div>';
    try{dir=await api('/units')}catch(e){root.innerHTML=empty('Bo‘limlar yuklanmadi',e.message);return}
    drawDirectory();
  }
  function drawDirectory(filter=''){
    const root=$('#unitsRoot');cur=null;if(location.hash.startsWith('#unit='))history.replaceState({},'',location.pathname+location.search);
    const q=filter.trim().toLowerCase(),units=dir.units.filter(u=>!q||(u.name+' '+(u.code||'')+' '+(u.description||'')).toLowerCase().includes(q));
    const byId=new Map(dir.units.map(u=>[u._id,u]));
    const admin=dir.canManage?'<div class="ux-admin"><button type="button" class="hx-plain ux-btn" data-a="new">＋ Bo‘lim qo‘shish</button><button type="button" class="hx-plain ux-btn ghost" data-a="seed">Namunaviy tuzilma</button><button type="button" class="hx-plain ux-btn ghost" data-a="sync">Fakultet va kafedralarni sinxronlash</button></div>':'';
    let html='<div class="ux-dir-head"><div class="ux-search"><input type="search" placeholder="Bo‘lim, xizmat yoki kod bo‘yicha qidirish…" value="'+esc(filter)+'" aria-label="Bo‘limlarni qidirish"></div>'+admin+'</div>';
    if(!dir.units.length){
      html+=dir.canManage?'<div class="ux-hero-empty"><div class="ux-hero-ico">🏛</div><h2>Universitet tuzilmasini yarating</h2><p>Bir tugma bilan rektorat, prorektorlar, registrator ofisi, buxgalteriya, kadrlar, TTJ, AT markazi va boshqa '+'bo‘limlar tayyor onlayn xizmatlari bilan yaratiladi. Fakultet va kafedralar mavjud akademik tuzilmadan olinadi.</p><button type="button" class="hx-plain ux-btn big" data-a="seed">Namunaviy universitet tuzilmasini yaratish</button></div>':empty('Hali bo‘limlar qo‘shilmagan','Administrator universitet tuzilmasini yaratganidan so‘ng bu yerda barcha bo‘limlar va ularning xizmatlari chiqadi.');
    }else{
      const mine=units.filter(u=>u.myRole&&u.myRole!=='admin'&&u.myRole!=='viewer');
      if(mine.length&&!q)html+='<section class="ux-group"><h3>Mening bo‘limlarim</h3><div class="ux-grid">'+mine.map(card).join('')+'</div></section>';
      for(const k of KIND_ORDER){
        const list=units.filter(u=>u.kind===k);if(!list.length)continue;
        if(k==='kafedra'&&!q){
          const groups=new Map();for(const u of list){const p=u.parentId&&byId.get(u.parentId);const key=p?p.name:'Boshqa';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(u)}
          html+='<section class="ux-group"><h3>'+KIND_PLURAL[k]+' <small>'+list.length+'</small></h3>'+[...groups].map(([g,l])=>'<div class="ux-sub">'+esc(g)+'</div><div class="ux-grid">'+l.map(card).join('')+'</div>').join('')+'</section>';
        }else html+='<section class="ux-group"><h3>'+KIND_PLURAL[k]+' <small>'+list.length+'</small></h3><div class="ux-grid">'+list.map(card).join('')+'</div></section>';
      }
      if(!units.length)html+=empty('Hech narsa topilmadi','Qidiruv so‘zini o‘zgartirib ko‘ring.');
    }
    root.innerHTML='<div class="ux-dir">'+html+'</div>';
    const inp=root.querySelector('.ux-search input');let t=0;inp?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{const pos=inp.selectionStart;drawDirectory(inp.value);const ni=$('#unitsRoot .ux-search input');ni.focus();ni.setSelectionRange(pos,pos)},180)});
    root.querySelectorAll('[data-unit]').forEach(b=>b.addEventListener('click',()=>openUnit(b.dataset.unit)));
    root.querySelectorAll('[data-a]').forEach(b=>b.addEventListener('click',()=>adminAction(b.dataset.a)));
  }
  function card(u){
    return '<button type="button" class="hx-plain ux-ucard k-'+u.kind+'" data-unit="'+u._id+'"><span class="ux-ico">'+(KIND_ICON[u.kind]||'▦')+'</span><span class="ux-ub"><b>'+esc(u.name)+'</b><small>'+esc(u.head?u.head.fullName:(u.description||'').slice(0,80))+'</small></span><span class="ux-meta">'+(u.services?'<i>'+u.services+' xizmat</i>':'')+(u.myRole&&u.myRole!=='admin'?'<i class="me">'+esc(roleLabel(u.myRole))+'</i>':'')+'</span></button>';
  }
  async function adminAction(a){
    if(a==='seed'){
      if(!confirm('Namunaviy universitet tuzilmasi yaratilsinmi? Mavjud bo‘limlar o‘zgarmaydi, faqat yetishmaganlari qo‘shiladi.'))return;
      try{const r=await api('/units/seed',{method:'POST',body:'{}'});toast(r.created+' ta bo‘lim, '+r.services+' ta xizmat va '+r.academic+' ta fakultet/kafedra yaratildi');dir=await api('/units');drawDirectory()}catch(e){toast(e.message)}
    }
    if(a==='sync'){try{const r=await api('/units/sync-academic',{method:'POST',body:'{}'});toast(r.created?r.created+' ta yangi fakultet/kafedra qo‘shildi':'Akademik tuzilma bilan mos');dir=await api('/units');drawDirectory()}catch(e){toast(e.message)}}
    if(a==='new')unitForm(null);
  }
  function unitForm(u){
    const parents=(dir?.units||[]).filter(x=>!u||x._id!==u._id);
    const s=sheet(u?'Bo‘limni tahrirlash':'Yangi bo‘lim','<form class="ux-form"><label>Nomi<input name="name" required maxlength="200" value="'+esc(u?.name||'')+'"></label><div class="ux-row"><label>Turi<select name="kind">'+KIND_ORDER.map(k=>'<option value="'+k+'"'+((u?.kind||'division')===k?' selected':'')+'>'+esc(dir.kinds[k])+'</option>').join('')+'</select></label><label>Kod (raqamlash uchun)<input name="code" maxlength="12" value="'+esc(u?.code||'')+'" placeholder="REG"></label></div><label>Yuqori bo‘lim<select name="parentId"><option value="">— yo‘q —</option>'+parents.map(p=>'<option value="'+p._id+'"'+(u?.parentId===p._id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label><label>Tavsif<textarea name="description" rows="3" maxlength="2000">'+esc(u?.description||'')+'</textarea></label><button class="hx-plain ux-btn" type="submit">Saqlash</button></form>');
    s.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const d=formData(e.target);if(u)await api('/units/'+u._id,{method:'PATCH',body:JSON.stringify(d)});else{const r=await api('/units',{method:'POST',body:JSON.stringify(d)});s.close();dir=await api('/units');return openUnit(r._id)}s.close();dir=await api('/units');if(cur)openUnit(u._id,curTab);else drawDirectory()})});
  }

  // ---------- unit page ----------
  async function openUnit(id,tab=''){
    const root=$('#unitsRoot');if(!root)return;
    if(document.documentElement.dataset.page!=='units'){go('units',true)}
    root.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    try{cur=await api('/units/'+id)}catch(e){root.innerHTML=empty('Bo‘lim ochilmadi',e.message);cur=null;return}
    if(!dir)dir=await api('/units').catch(()=>({units:[],kinds:{},canManage:false}));
    history.replaceState({},'','#unit='+id);
    const u=cur.unit,role=cur.myRole,mods=new Set(u.modules||[]);
    const tabs=MODULES.filter(([k])=>{
      if(k==='queue')return can(role,'viewer')&&mods.has('services');
      if(k==='settings')return can(role,'deputy');
      if(k==='tasks')return mods.has('tasks')&&can(role,'viewer');
      return mods.has(k);
    });
    curTab=tab&&tabs.some(t=>t[0]===tab)?tab:(can(role,'staff')&&tabs.some(t=>t[0]==='queue')?'queue':(tabs[0]?.[0]||''));
    const c=u.contacts||{},contacts=[c.building&&('🏢 '+c.building),c.room&&('🚪 '+c.room),c.hours&&('🕘 '+c.hours),c.phone&&('📞 '+c.phone),c.email&&('✉ '+c.email)].filter(Boolean);
    const st=cur.stats;
    root.innerHTML='<article class="ux-unit k-'+u.kind+'">'+
      '<div class="ux-crumbs"><button type="button" class="hx-plain ux-back">← Barcha bo‘limlar</button>'+(cur.parent?'<span>›</span><button class="hx-plain" type="button" data-unit="'+cur.parent._id+'">'+esc(cur.parent.name)+'</button>':'')+'</div>'+
      '<header class="ux-hero"><span class="ux-hero-kind">'+(KIND_ICON[u.kind]||'')+' '+esc(cur.kindLabel||'')+(u.code?' · '+esc(u.code):'')+'</span><h1>'+esc(u.name)+'</h1>'+(u.description?'<p>'+esc(u.description)+'</p>':'')+
      '<div class="ux-hero-meta">'+(cur.head?'<span class="ux-head">👤 Rahbar: <b>'+esc(cur.head.fullName)+'</b></span>':'')+contacts.map(x=>'<span>'+esc(x)+'</span>').join('')+(role?'<span class="ux-myrole">Sizning rolingiz: '+esc(roleLabel(role))+'</span>':'')+'</div>'+
      (cur.children?.length?'<div class="ux-children">'+cur.children.map(k=>'<button class="hx-plain" type="button" data-unit="'+k._id+'">'+(KIND_ICON[k.kind]||'')+' '+esc(k.name)+'</button>').join('')+'</div>':'')+
      (st?'<div class="ux-stats"><div><b>'+st.newRequests+'</b><span>Yangi murojaat</span></div><div><b>'+st.openRequests+'</b><span>Ochiq murojaat</span></div><div class="'+(st.overdueRequests?'warn':'')+'"><b>'+st.overdueRequests+'</b><span>Muddati o‘tgan</span></div><div><b>'+st.openTasks+'</b><span>Ochiq vazifa</span></div></div>':'')+
      '</header><div class="ux-tabs" role="tablist">'+tabs.map(([k,i,l])=>'<button type="button" role="tab" data-tab="'+k+'" class="hx-plain '+(k===curTab?'on':'')+'" aria-selected="'+(k===curTab)+'"><span>'+i+'</span>'+esc(l)+'</button>').join('')+'</div><section class="ux-pane" id="uxPane"></section></article>';
    root.querySelector('.ux-back').onclick=()=>{cur=null;drawDirectory()};
    root.querySelectorAll('[data-unit]').forEach(b=>b.addEventListener('click',()=>openUnit(b.dataset.unit)));
    root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{curTab=b.dataset.tab;root.querySelectorAll('[data-tab]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-selected',String(x===b))});drawTab()}));
    root.scrollIntoView?.({block:'start'});
    drawTab();
  }
  const reload=()=>openUnit(cur.unit._id,curTab);
  async function drawTab(){
    const pane=$('#uxPane');if(!pane||!cur)return;pane.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    try{await ({services:tabServices,queue:tabQueue,announcements:tabPosts,documents:tabDocs,tasks:tabTasks,events:tabEvents,apps:tabApps,staff:tabStaff,learning:tabLearning,settings:tabSettings}[curTab]||(async p=>{p.innerHTML=empty('Bo‘lim sahifasi','Bu bo‘limda hali funksiyalar yoqilmagan.')}))(pane)}
    catch(e){pane.innerHTML=empty('Yuklanmadi',e.message)}
  }
  const uid=()=>cur.unit._id,role=()=>cur.myRole;

  // services
  async function tabServices(p){
    const list=cur.services.filter(s=>s.active||can(role(),'deputy'));
    p.innerHTML=(can(role(),'deputy')?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-new>＋ Yangi xizmat (ariza shakli)</button></div>':'')+
      (list.length?'<div class="ux-svc">'+list.map(s=>'<div class="ux-svc-card'+(s.active?'':' off')+'"><div><b>'+esc(s.title)+'</b>'+(s.description?'<p>'+esc(s.description)+'</p>':'')+'<small>'+(s.slaDays?'⏱ '+s.slaDays+' ish kuni ichida · ':'')+'👥 '+esc(SAUD[s.audience]||'')+(s.active?'':' · o‘chirilgan')+'</small></div><div class="ux-svc-acts">'+(s.active?'<button type="button" class="hx-plain ux-btn" data-apply="'+s._id+'">Ariza berish</button>':'')+(can(role(),'deputy')?'<button type="button" class="hx-plain ux-btn ghost sm" data-edit="'+s._id+'">Tahrirlash</button>':'')+'</div></div>').join('')+'</div>':empty('Hali onlayn xizmat yo‘q',can(role(),'deputy')?'«Yangi xizmat» orqali ariza shaklini yarating: masalan, ma’lumotnoma yoki ta’mir so‘rovi.':'Bu bo‘lim hali onlayn ariza qabul qilmaydi.'));
    p.querySelector('[data-new]')?.addEventListener('click',()=>serviceForm(null));
    p.querySelectorAll('[data-apply]').forEach(b=>b.addEventListener('click',()=>applyForm(cur.services.find(s=>s._id===b.dataset.apply))));
    p.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>serviceForm(cur.services.find(s=>s._id===b.dataset.edit))));
  }
  function fieldInput(f){
    const req=f.required?' required':'',name='a_'+f.key;
    if(f.type==='textarea')return '<textarea name="'+name+'" rows="3"'+req+'></textarea>';
    if(f.type==='select')return '<select name="'+name+'"'+req+'><option value="">— tanlang —</option>'+f.options.map(o=>'<option>'+esc(o)+'</option>').join('')+'</select>';
    return '<input name="'+name+'" type="'+({number:'number',date:'date',phone:'tel'}[f.type]||'text')+'"'+(f.type==='number'?' step="any"':'')+req+'>';
  }
  function applyForm(s){
    const sh=sheet(s.title,'<form class="ux-form">'+(s.description?'<p class="ux-note">'+esc(s.description)+'</p>':'')+(s.fields||[]).map(f=>'<label><span>'+esc(f.label)+(f.required?' <em>*</em>':'')+'</span>'+fieldInput(f)+'</label>').join('')+'<p class="ux-note">'+(s.slaDays?'Odatda '+s.slaDays+' ish kuni ichida ko‘rib chiqiladi. ':'')+'Holatini «Murojaatlarim» sahifasida kuzatasiz.</p><button class="hx-plain ux-btn" type="submit">Yuborish</button></form>');
    sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const d=formData(e.target),answers={};for(const [k,v] of Object.entries(d))if(k.startsWith('a_'))answers[k.slice(2)]=v;const r=await api('/units/'+uid()+'/services/'+s._id+'/requests',{method:'POST',body:JSON.stringify({answers})});sh.close();toast('Murojaat qabul qilindi: '+r.number+(r.dueAt?' · muddat '+fmtDate(r.dueAt):''))})});
  }
  function serviceForm(s){
    const fields=(s?.fields||[]).map(f=>({...f}));
    const row=(f,i)=>'<div class="ux-frow" data-i="'+i+'"><input data-k="label" placeholder="Maydon nomi" value="'+esc(f.label||'')+'"><select data-k="type">'+Object.entries(FIELD_TYPES).map(([k,l])=>'<option value="'+k+'"'+((f.type||'text')===k?' selected':'')+'>'+l+'</option>').join('')+'</select><input data-k="options" placeholder="Variantlar: A, B, C" value="'+esc((f.options||[]).join(', '))+'"'+(f.type==='select'?'':' hidden')+'><label class="ux-chk"><input type="checkbox" data-k="required"'+(f.required?' checked':'')+'> majburiy</label><button type="button" class="hx-plain ux-del" data-rm="'+i+'" aria-label="O‘chirish">×</button></div>';
    const sh=sheet(s?'Xizmatni tahrirlash':'Yangi xizmat','<form class="ux-form"><label>Xizmat nomi<input name="title" required value="'+esc(s?.title||'')+'" placeholder="Masalan: O‘qish joyidan ma’lumotnoma"></label><label>Qisqa tavsif<textarea name="description" rows="2">'+esc(s?.description||'')+'</textarea></label><div class="ux-row"><label>Kim uchun<select name="audience">'+Object.entries(SAUD).map(([k,l])=>'<option value="'+k+'"'+((s?.audience||'all')===k?' selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Muddat (ish kuni)<input name="slaDays" type="number" min="0" max="90" value="'+(s?.slaDays??5)+'"></label></div><fieldset><legend>Ariza maydonlari</legend><div class="ux-fields"></div><button type="button" class="hx-plain ux-btn ghost sm" data-add>＋ Maydon qo‘shish</button></fieldset>'+(s?'<label class="ux-chk"><input type="checkbox" name="active"'+(s.active?' checked':'')+'> Xizmat faol (ariza qabul qiladi)</label>':'')+'<button class="hx-plain ux-btn" type="submit">Saqlash</button></form>',{wide:true});
    const box=sh.body.querySelector('.ux-fields');
    const read=()=>$$('.ux-frow',box).forEach(r=>{const f=fields[Number(r.dataset.i)];f.label=$('[data-k=label]',r).value;f.type=$('[data-k=type]',r).value;f.options=$('[data-k=options]',r).value;f.required=$('[data-k=required]',r).checked});
    const draw=()=>{box.innerHTML=fields.length?fields.map(row).join(''):'<p class="ux-note">Maydonsiz xizmat ham bo‘ladi (masalan, «Qabulga yozilish»).</p>';box.querySelectorAll('[data-k=type]').forEach(sel=>sel.addEventListener('change',()=>{read();draw()}));box.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>{read();fields.splice(Number(b.dataset.rm),1);draw()}))};draw();
    sh.body.querySelector('[data-add]').addEventListener('click',()=>{read();fields.push({label:'',type:'text',required:true,options:[]});draw();box.querySelector('.ux-frow:last-child input')?.focus()});
    sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();read();submit(e.target,async()=>{const d=formData(e.target);const body={...d,fields:fields.filter(f=>String(f.label).trim())};if(!s)delete body.active;await api('/units/'+uid()+'/services'+(s?'/'+s._id:''),{method:s?'PATCH':'POST',body:JSON.stringify(body)});sh.close();toast('Xizmat saqlandi');reload()})});
  }

  // request queue + detail
  async function tabQueue(p){
    const filters=[['open','Ochiq'],['new','Yangi'],['mine','Menga'],['done','Bajarilgan'],['rejected','Rad etilgan']];
    const qs=queueFilter==='mine'?'?status=open&mine=1':'?status='+queueFilter;
    const rows=await api('/units/'+uid()+'/requests'+qs);
    p.innerHTML='<div class="ux-bar"><div class="ux-chips">'+filters.map(([k,l])=>'<button type="button" data-f="'+k+'" class="hx-plain '+(k===queueFilter?'on':'')+'">'+l+'</button>').join('')+'</div></div>'+
      (rows.length?'<div class="ux-list">'+rows.map(r=>reqRow(r,true)).join('')+'</div>':empty('Murojaat yo‘q',queueFilter==='open'?'Hozircha ochiq murojaat yo‘q. Yangi arizalar shu yerda paydo bo‘ladi.':''));
    p.querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{queueFilter=b.dataset.f;tabQueue(p)}));
    p.querySelectorAll('[data-req]').forEach(b=>b.addEventListener('click',()=>openRequest(b.dataset.req,()=>tabQueue(p))));
  }
  function reqRow(r,staff=false){
    return '<button type="button" class="hx-plain ux-req'+(r.overdue?' overdue':'')+'" data-req="'+r._id+'"><span class="ux-req-n">'+esc(r.number||'')+'</span><span class="ux-req-b"><b>'+esc(r.serviceTitle||'Murojaat')+'</b><small>'+(staff?esc(r.requester?.fullName||'')+' · ':esc(r.unit?.name||'')+' · ')+ago(r.createdAt)+(r.assignee&&staff?' · 👤 '+esc(r.assignee.fullName):'')+'</small></span><span class="ux-req-s">'+chip(r.status)+(r.dueAt&&['new','in_progress','waiting'].includes(r.status)?'<small class="'+(r.overdue?'late':'')+'">'+(r.overdue?'Muddati o‘tgan · ':'Muddat: ')+fmtDate(r.dueAt)+'</small>':'')+'</span></button>';
  }
  async function openRequest(id,after=null){
    let r;try{r=await api('/unit-requests/'+id)}catch(e){return toast(e.message)}
    const me=String(currentUser()?._id||currentUser()?.id||''),requester=r.requester?._id===me,staff=can(r.myUnitRole,'staff');
    const labels=new Map((r.fields||[]).map(f=>[f.key,f.label]));
    const answers=Object.entries(r.answers||{}).map(([k,v])=>'<div><dt>'+esc(labels.get(k)||k)+'</dt><dd>'+esc(v)+'</dd></div>').join('');
    const next=STAFF_NEXT[r.status]||[];
    const history=(r.history||[]).map(h=>'<li><span class="ux-dot '+(STATUS[h.status]?.[1]||'')+'"></span><div><b>'+esc(h.by||'')+'</b> · <small>'+fmtDT(h.at)+'</small>'+(h.action==='status'||h.action==='created'?'<div>'+chip(h.status)+'</div>':'')+(h.note?'<p>'+esc(h.note)+'</p>':'')+'</div></li>').join('');
    const sh=sheet((r.number||'Murojaat')+' · '+(r.serviceTitle||''),'<div class="ux-req-detail"><div class="ux-req-top">'+chip(r.status)+'<span>'+esc(r.unit?.name||'')+'</span>'+(r.dueAt?'<span class="'+(r.overdue?'late':'')+'">Muddat: '+fmtDate(r.dueAt)+'</span>':'')+'</div>'+
      '<dl class="ux-dl"><div><dt>Murojaatchi</dt><dd>'+esc(r.requester?.fullName||'')+'</dd></div>'+(r.assignee?'<div><dt>Ijrochi</dt><dd>'+esc(r.assignee.fullName)+'</dd></div>':'')+answers+(r.resolution?'<div class="res"><dt>Natija</dt><dd>'+esc(r.resolution)+'</dd></div>':'')+'</dl>'+
      (staff&&next.length?'<form class="ux-form ux-act" data-staff><div class="ux-row"><label>Holat<select name="status"><option value="">— o‘zgarmaydi —</option>'+next.map(s=>'<option value="'+s+'">'+esc(STATUS[s][0])+'</option>').join('')+'</select></label>'+(!r.assignee||r.assignee._id!==me?'<label class="ux-chk"><input type="checkbox" name="take"> Menga biriktirish</label>':'')+'</div><label>Izoh yoki natija<textarea name="note" rows="2" placeholder="Murojaatchiga ko‘rinadi"></textarea></label><button class="hx-plain ux-btn" type="submit">Saqlash</button></form>':'')+
      (requester&&!['cancelled','done','rejected'].includes(r.status)?'<form class="ux-form ux-act" data-reply><label>Javob yoki qo‘shimcha ma’lumot<textarea name="note" rows="2" required></textarea></label><div class="ux-row"><button class="hx-plain ux-btn" type="submit">Yuborish</button>'+(['new','waiting'].includes(r.status)?'<button type="button" class="hx-plain ux-btn ghost" data-cancel>Murojaatni bekor qilish</button>':'')+'</div></form>':'')+
      '<h3>Tarix</h3><ol class="ux-tl">'+history+'</ol></div>',{wide:true,onClose:after});
    sh.body.querySelector('[data-staff]')?.addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const d=formData(e.target),body={note:d.note};if(d.status){body.status=d.status;if(['done','rejected'].includes(d.status))body.resolution=d.note}if(d.take)body.assigneeId='me';await api('/unit-requests/'+r._id,{method:'PATCH',body:JSON.stringify(body)});toast('Saqlandi');sh.close()})});
    sh.body.querySelector('[data-reply]')?.addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{await api('/unit-requests/'+r._id+'/comment',{method:'POST',body:JSON.stringify({note:formData(e.target).note})});toast('Yuborildi');sh.close()})});
    sh.body.querySelector('[data-cancel]')?.addEventListener('click',async()=>{if(!confirm('Murojaat bekor qilinsinmi?'))return;try{await api('/unit-requests/'+r._id+'/cancel',{method:'POST',body:'{}'});toast('Bekor qilindi');sh.close()}catch(e){toast(e.message)}});
  }

  // announcements
  async function tabPosts(p){
    const rows=await api('/units/'+uid()+'/posts'),edit=can(role(),'staff');
    p.innerHTML=(edit?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-new>＋ E’lon</button></div>':'')+(rows.length?'<div class="ux-posts">'+rows.map(x=>'<article class="ux-post'+(x.pinned?' pin':'')+'"><header><b>'+(x.pinned?'📌 ':'')+esc(x.title)+'</b><small>'+esc(x.author)+' · '+fmtDate(x.createdAt)+' · '+esc(AUD[x.audience]||'')+'</small></header>'+(x.body?'<div class="ux-post-body">'+esc(x.body).replace(/\n/g,'<br>')+'</div>':'')+'<footer>'+(x.requireAck?(x.acked?'<span class="ux-ok">✓ Tanishib chiqdingiz</span>':'<button type="button" class="hx-plain ux-btn sm" data-ack="'+x._id+'">Tanishib chiqdim</button>'):'')+(x.ackCount!==undefined&&x.requireAck?'<small>'+x.ackCount+' kishi tasdiqladi</small>':'')+(edit?'<button type="button" class="hx-plain ux-btn ghost sm" data-del="'+x._id+'">O‘chirish</button>':'')+'</footer></article>').join('')+'</div>':empty('E’lonlar yo‘q'));
    p.querySelector('[data-new]')?.addEventListener('click',()=>{const sh=sheet('Yangi e’lon','<form class="ux-form"><label>Sarlavha<input name="title" required maxlength="240"></label><label>Matn<textarea name="body" rows="6"></textarea></label><label>Kimga<select name="audience">'+Object.entries(AUD).map(([k,l])=>'<option value="'+k+'">'+l+'</option>').join('')+'</select></label><label class="ux-chk"><input type="checkbox" name="pinned"> Yuqorida mahkamlash</label><label class="ux-chk"><input type="checkbox" name="requireAck"> «Tanishib chiqdim» tasdig‘ini so‘rash</label><button class="hx-plain ux-btn" type="submit">E’lon qilish</button></form>');sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{await api('/units/'+uid()+'/posts',{method:'POST',body:JSON.stringify(formData(e.target))});sh.close();tabPosts(p)})})});
    p.querySelectorAll('[data-ack]').forEach(b=>b.addEventListener('click',async()=>{try{await api('/units/'+uid()+'/posts/'+b.dataset.ack+'/ack',{method:'POST',body:'{}'});tabPosts(p)}catch(e){toast(e.message)}}));
    p.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('E’lon o‘chirilsinmi?'))return;try{await api('/units/'+uid()+'/posts/'+b.dataset.del,{method:'DELETE'});tabPosts(p)}catch(e){toast(e.message)}}));
  }

  // documents
  async function tabDocs(p){
    const rows=await api('/units/'+uid()+'/docs'),edit=can(role(),'staff'),cats=cur.docCategories||{};
    const groups=new Map();for(const d of rows){if(!groups.has(d.category))groups.set(d.category,[]);groups.get(d.category).push(d)}
    const size=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
    p.innerHTML=(edit?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-new>＋ Hujjat yuklash</button></div>':'')+(rows.length?[...groups].map(([c,l])=>'<section class="ux-docs"><h4>'+esc(cats[c]||c)+'</h4>'+l.map(d=>'<div class="ux-doc"><span class="ux-doc-ico">'+(/pdf/.test(d.mimeType)?'📕':/sheet|excel|csv/.test(d.mimeType)?'📗':/word|document/.test(d.mimeType)?'📘':/image/.test(d.mimeType)?'🖼':'📄')+'</span><span class="ux-doc-b"><b>'+esc(d.title)+'</b><small>'+esc(d.filename)+' · '+size(d.size||0)+' · '+fmtDate(d.createdAt)+(d.visibility==='members'?' · 🔒 ichki':'')+'</small></span><a class="ux-btn ghost sm" href="/api/units/'+uid()+'/docs/'+d._id+'/file'+(/pdf|image/.test(d.mimeType)?'?inline=1" target="_blank" rel="noopener':'')+'">'+(/pdf|image/.test(d.mimeType)?'Ochish':'Yuklab olish')+'</a>'+(edit?'<button type="button" class="hx-plain ux-del" data-del="'+d._id+'" aria-label="O‘chirish">×</button>':'')+'</div>').join('')+'</section>').join(''):empty('Hujjatlar yo‘q',edit?'Nizom, buyruq, namuna shakllar va hisobotlarni shu yerga yuklang.':''));
    p.querySelector('[data-new]')?.addEventListener('click',()=>{const sh=sheet('Hujjat yuklash','<form class="ux-form"><label>Fayl (PDF, Word, Excel, rasm…)<input type="file" name="file" required></label><label>Nomi<input name="title" maxlength="240" placeholder="Fayl nomidan olinadi"></label><div class="ux-row"><label>Toifa<select name="category">'+Object.entries(cats).map(([k,l])=>'<option value="'+k+'">'+esc(l)+'</option>').join('')+'</select></label><label>Kimga ko‘rinadi<select name="visibility"><option value="public">Hamma</option><option value="members">Faqat bo‘lim xodimlari</option></select></label></div><button class="hx-plain ux-btn" type="submit">Yuklash</button></form>');
      sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const f=e.target,file=f.file.files[0];if(!file)throw new Error('Fayl tanlang');const fd=new FormData();fd.append('file',file,file.name);const q=new URLSearchParams({title:f.title.value||file.name,category:f.category.value,visibility:f.visibility.value});
        const r=await fetch('/api/units/'+uid()+'/docs?'+q,{method:'POST',body:fd,credentials:'same-origin',headers:{'X-CSRF-Token':csrf()}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.message||'Yuklanmadi');sh.close();toast('Hujjat yuklandi');tabDocs(p)})})});
    p.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Hujjat o‘chirilsinmi?'))return;try{await api('/units/'+uid()+'/docs/'+b.dataset.del,{method:'DELETE'});tabDocs(p)}catch(e){toast(e.message)}}));
  }

  // tasks (kanban)
  async function tabTasks(p){
    const rows=await api('/units/'+uid()+'/tasks'),edit=can(role(),'staff'),cols=[['todo','Bajarilishi kerak'],['doing','Jarayonda'],['done','Bajarildi']];
    const members=(cur.members||[]).filter(m=>can(m.role,'staff'));
    p.innerHTML=(edit?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-new>＋ Vazifa</button></div>':'')+'<div class="ux-kanban">'+cols.map(([k,l])=>'<div class="ux-col"><h4>'+l+' <small>'+rows.filter(t=>t.status===k).length+'</small></h4>'+rows.filter(t=>t.status===k).map(t=>'<div class="ux-task pr-'+t.priority+(t.overdue?' overdue':'')+'"><b>'+esc(t.title)+'</b>'+(t.notes?'<p>'+esc(t.notes)+'</p>':'')+'<small>'+(t.assignee?'👤 '+esc(t.assignee.fullName)+' ':'')+(t.dueAt?'· ⏱ '+fmtDate(t.dueAt):'')+'</small>'+(edit?'<div class="ux-task-acts">'+cols.filter(c=>c[0]!==k).map(c=>'<button class="hx-plain" type="button" data-mv="'+t._id+'" data-to="'+c[0]+'">→ '+c[1]+'</button>').join('')+'<button class="hx-plain" type="button" data-del="'+t._id+'" aria-label="O‘chirish">×</button></div>':'')+'</div>').join('')+'</div>').join('')+'</div>';
    p.querySelector('[data-new]')?.addEventListener('click',()=>{const sh=sheet('Yangi vazifa','<form class="ux-form"><label>Vazifa<input name="title" required maxlength="240"></label><label>Izoh<textarea name="notes" rows="3"></textarea></label><div class="ux-row"><label>Ijrochi<select name="assigneeId"><option value="">— tanlanmagan —</option>'+members.map(m=>'<option value="'+m.user._id+'">'+esc(m.user.fullName)+'</option>').join('')+'</select></label><label>Muddat<input type="date" name="dueAt"></label><label>Muhimlik<select name="priority"><option value="normal">Oddiy</option><option value="high">Yuqori</option><option value="low">Past</option></select></label></div><button class="hx-plain ux-btn" type="submit">Qo‘shish</button></form>');sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const d=formData(e.target);if(d.dueAt)d.dueAt=d.dueAt+'T18:00:00';await api('/units/'+uid()+'/tasks',{method:'POST',body:JSON.stringify(d)});sh.close();tabTasks(p)})})});
    p.querySelectorAll('[data-mv]').forEach(b=>b.addEventListener('click',async()=>{try{await api('/units/'+uid()+'/tasks/'+b.dataset.mv,{method:'PATCH',body:JSON.stringify({status:b.dataset.to})});tabTasks(p)}catch(e){toast(e.message)}}));
    p.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Vazifa o‘chirilsinmi?'))return;try{await api('/units/'+uid()+'/tasks/'+b.dataset.del,{method:'DELETE'});tabTasks(p)}catch(e){toast(e.message)}}));
  }

  // events
  async function tabEvents(p){
    const rows=await api('/units/'+uid()+'/events'),edit=can(role(),'staff');
    p.innerHTML=(edit?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-new>＋ Tadbir</button></div>':'')+(rows.length?'<div class="ux-events">'+rows.map(e=>{const d=new Date(e.startsAt);return '<div class="ux-event"><div class="ux-date"><b>'+d.getDate()+'</b><span>'+d.toLocaleDateString('uz-UZ',{month:'short'})+'</span></div><div class="ux-ev-b"><b>'+esc(e.title)+'</b><small>🕘 '+d.toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})+(e.place?' · 📍 '+esc(e.place):'')+' · '+esc(AUD[e.audience]||'')+'</small>'+(e.description?'<p>'+esc(e.description)+'</p>':'')+'</div><div class="ux-ev-a">'+(e.registration?'<button type="button" class="hx-plain ux-btn sm'+(e.mine?' ghost':'')+'" data-reg="'+e._id+'">'+(e.mine?'✓ Ro‘yxatdasiz':'Ro‘yxatdan o‘tish')+'</button><small>'+e.registered+(e.capacity?' / '+e.capacity:'')+' kishi</small>':'')+(edit?'<button type="button" class="hx-plain ux-del" data-del="'+e._id+'" aria-label="O‘chirish">×</button>':'')+'</div></div>'}).join('')+'</div>':empty('Yaqin tadbirlar yo‘q'));
    p.querySelector('[data-new]')?.addEventListener('click',()=>{const sh=sheet('Yangi tadbir','<form class="ux-form"><label>Nomi<input name="title" required maxlength="240"></label><div class="ux-row"><label>Boshlanishi<input type="datetime-local" name="startsAt" required></label><label>Tugashi<input type="datetime-local" name="endsAt"></label></div><label>Joyi<input name="place" maxlength="200" placeholder="Masalan: 2-bino, faollar zali yoki onlayn"></label><label>Tavsif<textarea name="description" rows="3"></textarea></label><div class="ux-row"><label>Kim uchun<select name="audience">'+Object.entries(AUD).map(([k,l])=>'<option value="'+k+'">'+l+'</option>').join('')+'</select></label><label>Joylar soni (0 — cheklanmagan)<input type="number" name="capacity" min="0" value="0"></label></div><label class="ux-chk"><input type="checkbox" name="registration"> Ro‘yxatdan o‘tish talab qilinadi</label><button class="hx-plain ux-btn" type="submit">Saqlash</button></form>');sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const d=formData(e.target);d.startsAt=new Date(d.startsAt).toISOString();d.endsAt=d.endsAt?new Date(d.endsAt).toISOString():'';await api('/units/'+uid()+'/events',{method:'POST',body:JSON.stringify(d)});sh.close();tabEvents(p)})})});
    p.querySelectorAll('[data-reg]').forEach(b=>b.addEventListener('click',async()=>{try{const r=await api('/units/'+uid()+'/events/'+b.dataset.reg+'/register',{method:'POST',body:'{}'});toast(r.registered?'Ro‘yxatdan o‘tdingiz':'Ro‘yxatdan chiqdingiz');tabEvents(p)}catch(e){toast(e.message)}}));
    p.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Tadbir o‘chirilsinmi?'))return;try{await api('/units/'+uid()+'/events/'+b.dataset.del,{method:'DELETE'});tabEvents(p)}catch(e){toast(e.message)}}));
  }

  // external apps
  async function tabApps(p){
    const apps=cur.unit.apps||[],edit=can(role(),'deputy');
    p.innerHTML=(edit?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-edit>Ilovalarni sozlash</button></div>':'')+(apps.length?'<div class="ux-apps">'+apps.map((a,i)=>'<button type="button" class="hx-plain ux-app" data-app="'+i+'"><span>'+esc(a.icon||'🧩')+'</span><b>'+esc(a.title)+'</b><small>'+esc(new URL(a.url).hostname)+'</small></button>').join('')+'</div><p class="ux-note">Login va parollaringizni brauzeringiz saqlaydi. Platforma tashqi tizimlar parollarini saqlamaydi: bu xavfsizroq.</p>':empty('Ilovalar qo‘shilmagan',edit?'Bo‘lim ishlatadigan tashqi tizimlarni (masalan, HEMIS, my.gov.uz, e-hujjat, bank-klient) bir joyga yig‘ing.':''));
    p.querySelectorAll('[data-app]').forEach(b=>b.addEventListener('click',()=>openApp(apps[Number(b.dataset.app)])));
    p.querySelector('[data-edit]')?.addEventListener('click',()=>{
      const list=apps.map(a=>({...a}));
      const row=(a,i)=>'<div class="ux-frow" data-i="'+i+'"><input data-k="icon" value="'+esc(a.icon||'🧩')+'" class="ux-ico-in" aria-label="Belgi"><input data-k="title" placeholder="Nomi" value="'+esc(a.title||'')+'"><input data-k="url" placeholder="https://…" value="'+esc(a.url||'')+'"><label class="ux-chk"><input type="checkbox" data-k="embed"'+(a.embed?' checked':'')+'> ichida ochish</label><button type="button" class="hx-plain ux-del" data-rm="'+i+'">×</button></div>';
      const sh=sheet('Ilovalar','<form class="ux-form"><div class="ux-fields"></div><button type="button" class="hx-plain ux-btn ghost sm" data-add>＋ Ilova</button><p class="ux-note">«Ichida ochish» — sayt platforma oynasida ochiladi. Ko‘p saytlar (bank, davlat xizmatlari) buni xavfsizlik uchun taqiqlaydi; ular avtomatik yangi oynada ochiladi.</p><button class="hx-plain ux-btn" type="submit">Saqlash</button></form>',{wide:true});
      const box=sh.body.querySelector('.ux-fields');const read=()=>$$('.ux-frow',box).forEach(r=>{const a=list[Number(r.dataset.i)];a.icon=$('[data-k=icon]',r).value;a.title=$('[data-k=title]',r).value;a.url=$('[data-k=url]',r).value;a.embed=$('[data-k=embed]',r).checked});
      const draw=()=>{box.innerHTML=list.map(row).join('');box.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',()=>{read();list.splice(Number(b.dataset.rm),1);draw()}))};draw();
      sh.body.querySelector('[data-add]').addEventListener('click',()=>{read();list.push({icon:'🧩',title:'',url:'',embed:false});draw()});
      sh.body.querySelector('form').addEventListener('submit',e=>{e.preventDefault();read();submit(e.target,async()=>{await api('/units/'+uid(),{method:'PATCH',body:JSON.stringify({apps:list.filter(a=>a.title&&a.url)})});sh.close();toast('Saqlandi');reload()})});
    });
  }
  function openApp(a){
    if(!a.embed){window.open(a.url,'_blank','noopener');return}
    const el=document.createElement('div');el.className='ux-appframe';
    el.innerHTML='<header><b>'+esc(a.icon||'')+' '+esc(a.title)+'</b><a class="ux-btn ghost sm" href="'+esc(a.url)+'" target="_blank" rel="noopener">Yangi oynada ochish ↗</a><button type="button" class="hx-plain ux-btn sm" data-x>Yopish</button></header><iframe src="'+esc(a.url)+'" referrerpolicy="no-referrer" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads" title="'+esc(a.title)+'"></iframe><p class="ux-frame-hint">Sahifa ochilmasa, bu sayt boshqa sayt ichida ochilishni taqiqlagan — «Yangi oynada ochish»ni bosing.</p>';
    el.querySelector('[data-x]').onclick=()=>el.remove();document.body.appendChild(el);
  }

  // staff
  async function tabStaff(p){
    const ms=cur.members||[],manage=can(role(),'deputy');
    p.innerHTML=(manage?'<div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-add>＋ Xodim qo‘shish</button></div>':'')+(ms.length?'<div class="ux-staff">'+ms.map(m=>'<div class="ux-person"><span class="ux-av">'+esc((m.user.fullName||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())+'</span><span class="ux-pb"><b>'+esc(m.user.fullName)+'</b><small>'+esc(m.title||roleLabel(m.role))+'</small>'+(m.user.email||m.user.phone?'<small>'+esc([m.user.email,m.user.phone].filter(Boolean).join(' · '))+'</small>':'')+'</span><span class="ux-role r-'+m.role+'">'+esc(roleLabel(m.role))+'</span>'+(manage&&(m.role!=='head'||role()==='admin')?'<button type="button" class="hx-plain ux-del" data-rm="'+m._id+'" aria-label="Olib tashlash">×</button>':'')+'</div>').join('')+'</div>':empty('Xodimlar biriktirilmagan',manage?'Bo‘lim xodimlarini qo‘shing: ular murojaatlarni ko‘radi va vazifalarni bajaradi.':''));
    p.querySelector('[data-add]')?.addEventListener('click',()=>{
      const roles=role()==='admin'?['staff','deputy','head','viewer']:role()==='head'?['staff','deputy','viewer']:['staff','viewer'];
      const sh=sheet('Xodim qo‘shish','<form class="ux-form"><label>Xodimni qidiring (F.I.Sh. yoki login)<input name="q" autocomplete="off" placeholder="Kamida 2 harf"></label><div class="ux-pick"></div><input type="hidden" name="userId"><div class="ux-row"><label>Bo‘limdagi roli<select name="role">'+roles.map(r=>'<option value="'+r+'">'+esc(roleLabel(r))+'</option>').join('')+'</select></label><label>Lavozimi<input name="title" maxlength="160" placeholder="Masalan: Bosh mutaxassis"></label></div><button class="hx-plain ux-btn" type="submit">Qo‘shish</button></form>');
      const f=sh.body.querySelector('form'),pick=sh.body.querySelector('.ux-pick');let t=0;
      f.q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(async()=>{if(f.q.value.trim().length<2){pick.innerHTML='';return}try{const rows=await api('/units/'+uid()+'/user-search?q='+encodeURIComponent(f.q.value.trim()));pick.innerHTML=rows.map(u=>'<button class="hx-plain" type="button" data-u="'+u._id+'">'+esc(u.fullName)+' <small>@'+esc(u.login)+'</small></button>').join('')||'<small>Topilmadi</small>';pick.querySelectorAll('[data-u]').forEach(b=>b.addEventListener('click',()=>{f.userId.value=b.dataset.u;f.q.value=b.textContent;pick.innerHTML=''}))}catch(e){pick.innerHTML='<small>'+esc(e.message)+'</small>'}},250)});
      f.addEventListener('submit',e=>{e.preventDefault();submit(f,async()=>{if(!f.userId.value)throw new Error('Ro‘yxatdan xodimni tanlang');await api('/units/'+uid()+'/members',{method:'POST',body:JSON.stringify({userId:f.userId.value,role:f.role.value,title:f.title.value})});sh.close();toast('Xodim qo‘shildi');reload()})});
    });
    p.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Xodim bo‘limdan olib tashlansinmi?'))return;try{await api('/units/'+uid()+'/members/'+b.dataset.rm,{method:'DELETE'});reload()}catch(e){toast(e.message)}}));
  }

  // distance learning bridge
  async function tabLearning(p){
    const l=cur.learning;
    p.innerHTML='<div class="ux-learn">'+(l?'<div class="ux-stats">'+(cur.unit.kind==='faculty'?'<div><b>'+l.kafedras+'</b><span>Kafedra</span></div>':'')+'<div><b>'+l.groups+'</b><span>Guruh</span></div><div><b>'+l.teachers+'</b><span>O‘qituvchi</span></div></div>':'')+'<div class="ux-learn-links"><button class="hx-plain" type="button" data-go="schedule">📅 Dars jadvali</button><button class="hx-plain" type="button" data-go="live">🎥 Jonli darslar</button><button class="hx-plain" type="button" data-go="courses">📘 Fanlar va vazifalar</button><button class="hx-plain" type="button" data-go="videos">▶ Videodarslar</button><button class="hx-plain" type="button" data-go="lab">⚗ Virtual laboratoriya</button><button class="hx-plain" type="button" data-go="library">📚 Elektron kutubxona</button></div><p class="ux-note">Masofaviy ta’lim — universitetning bir bo‘limi: jadval, jonli darslar, kurslar va baholar shu bo‘limlar bilan bog‘langan.</p></div>';
    p.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
  }

  // settings
  async function tabSettings(p){
    const u=cur.unit,c=u.contacts||{},admin=role()==='admin';
    p.innerHTML='<form class="ux-form ux-settings"><h4>Ma’lumotlar</h4>'+(admin?'<div class="ux-row"><label>Nomi<input name="name" value="'+esc(u.name)+'" required></label><label>Qisqa nomi<input name="shortName" value="'+esc(u.shortName||'')+'"></label></div>':'')+'<label>Tavsif<textarea name="description" rows="3">'+esc(u.description||'')+'</textarea></label><div class="ux-row"><label>Bino<input name="c_building" value="'+esc(c.building||'')+'"></label><label>Xona<input name="c_room" value="'+esc(c.room||'')+'"></label><label>Qabul vaqti<input name="c_hours" value="'+esc(c.hours||'')+'" placeholder="Du–Ju, 9:00–17:00"></label></div><div class="ux-row"><label>Telefon<input name="c_phone" value="'+esc(c.phone||'')+'"></label><label>E-pochta<input name="c_email" type="email" value="'+esc(c.email||'')+'"></label></div>'+
      '<h4>Bo‘lim funksiyalari</h4><div class="ux-mods">'+Object.entries(MODULE_LABELS).map(([k,l])=>'<label class="ux-chk"><input type="checkbox" name="m_'+k+'"'+((u.modules||[]).includes(k)?' checked':'')+'> '+esc(l)+'</label>').join('')+'</div><button class="hx-plain ux-btn" type="submit">Saqlash</button></form>'+
      (admin?'<div class="ux-danger"><h4>Administrator</h4><div class="ux-row"><button type="button" class="hx-plain ux-btn ghost" data-edit>Turi, kodi va yuqori bo‘limni o‘zgartirish</button><button type="button" class="hx-plain ux-btn danger" data-archive>Bo‘limni arxivlash</button></div></div>':'');
    p.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submit(e.target,async()=>{const d=formData(e.target),body={description:d.description,contacts:{building:d.c_building,room:d.c_room,hours:d.c_hours,phone:d.c_phone,email:d.c_email},modules:Object.keys(MODULE_LABELS).filter(k=>d['m_'+k])};if(admin){body.name=d.name;body.shortName=d.shortName}await api('/units/'+uid(),{method:'PATCH',body:JSON.stringify(body)});toast('Saqlandi');dir=null;reload()})});
    p.querySelector('[data-edit]')?.addEventListener('click',()=>unitForm(dir.units.find(x=>x._id===u._id)||{...u,parentId:u.parentId?String(u.parentId):''}));
    p.querySelector('[data-archive]')?.addEventListener('click',async()=>{if(!confirm('«'+u.name+'» arxivlansinmi? Sahifasi yopiladi, ma’lumotlari saqlanadi.'))return;try{await api('/units/'+u._id,{method:'DELETE'});toast('Arxivlandi');cur=null;dir=await api('/units');drawDirectory()}catch(e){toast(e.message)}});
  }

  // ---------- workspace ----------
  async function renderWorkspace(){
    const root=$('#workspaceRoot');if(!root)return;root.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    let w;try{w=await api('/units-workspace')}catch(e){root.innerHTML=empty('Ish joyi yuklanmadi',e.message);return}
    const sec=(title,body,count='')=>'<section class="ux-ws-sec"><h3>'+title+(count!==''?' <small>'+count+'</small>':'')+'</h3>'+body+'</section>';
    root.innerHTML='<div class="ux-ws">'+
      (w.pendingAck.length?sec('📣 Tanishib chiqish kerak','<div class="ux-list">'+w.pendingAck.map(p=>'<button type="button" class="hx-plain ux-req" data-post-unit="'+p.unitId+'"><span class="ux-req-b"><b>'+esc(p.title)+'</b><small>'+esc(p.unitName)+' · '+fmtDate(p.createdAt)+'</small></span><span class="ux-req-s"><span class="ux-st st-wait">Kutilmoqda</span></span></button>').join('')+'</div>',w.pendingAck.length):'')+
      sec('🏢 Mening bo‘limlarim',w.units.length?'<div class="ux-grid">'+w.units.map(u=>'<button type="button" class="hx-plain ux-ucard k-'+u.kind+'" data-unit="'+u._id+'"><span class="ux-ico">'+(KIND_ICON[u.kind]||'▦')+'</span><span class="ux-ub"><b>'+esc(u.name)+'</b><small>'+esc(u.title||roleLabel(u.role))+'</small></span><span class="ux-meta">'+(u.open?'<i>'+u.open+' ochiq</i>':'')+(u.overdue?'<i class="late">'+u.overdue+' kechikkan</i>':'')+'</span></button>').join('')+'</div>':empty('Siz hali biror bo‘limga biriktirilmagansiz','Bo‘lim rahbari yoki administrator sizni bo‘limga qo‘shganidan so‘ng murojaatlar va vazifalar shu yerda chiqadi.'),w.units.length)+
      (w.units.length?sec('📥 Menga biriktirilgan murojaatlar',w.assigned.length?'<div class="ux-list">'+w.assigned.map(r=>reqRow(r,true)).join('')+'</div>':empty('Biriktirilgan murojaat yo‘q'),w.assigned.length)+
      sec('🆕 Yangi murojaatlar (ijrochisiz)',w.unassigned.length?'<div class="ux-list">'+w.unassigned.map(r=>reqRow(r,true)).join('')+'</div>':empty('Yangi murojaat yo‘q'),w.unassigned.length)+
      sec('✅ Vazifalarim',w.tasks.length?'<div class="ux-list">'+w.tasks.map(t=>'<button type="button" class="hx-plain ux-req'+(t.overdue?' overdue':'')+'" data-task-unit="'+t.unitId+'"><span class="ux-req-b"><b>'+esc(t.title)+'</b><small>'+esc(t.unitName)+(t.dueAt?' · ⏱ '+fmtDate(t.dueAt):'')+'</small></span><span class="ux-req-s"><span class="ux-st '+(t.status==='doing'?'st-progress':'st-new')+'">'+(t.status==='doing'?'Jarayonda':'Bajarilishi kerak')+'</span></span></button>').join('')+'</div>':empty('Ochiq vazifa yo‘q'),w.tasks.length):'')+
      sec('📅 Yaqin tadbirlar',w.events.length?'<div class="ux-list">'+w.events.map(e=>'<button type="button" class="hx-plain ux-req" data-ev-unit="'+e.unitId+'"><span class="ux-req-b"><b>'+esc(e.title)+'</b><small>'+esc(e.unitName)+' · '+fmtDT(e.startsAt)+(e.place?' · '+esc(e.place):'')+'</small></span></button>').join('')+'</div>':empty('Yaqin 30 kunda tadbir yo‘q'))+
      '<p class="ux-note">Siz yuborgan arizalar: <button type="button" class="hx-plain ux-link" data-go="myRequests">Murojaatlarim'+(w.myOpenRequests?' ('+w.myOpenRequests+' ochiq)':'')+'</button></p></div>';
    root.querySelectorAll('[data-unit]').forEach(b=>b.addEventListener('click',()=>{go('units',true);openUnit(b.dataset.unit)}));
    root.querySelectorAll('[data-req]').forEach(b=>b.addEventListener('click',()=>openRequest(b.dataset.req,renderWorkspace)));
    root.querySelectorAll('[data-post-unit]').forEach(b=>b.addEventListener('click',()=>{go('units',true);openUnit(b.dataset.postUnit,'announcements')}));
    root.querySelectorAll('[data-task-unit]').forEach(b=>b.addEventListener('click',()=>{go('units',true);openUnit(b.dataset.taskUnit,'tasks')}));
    root.querySelectorAll('[data-ev-unit]').forEach(b=>b.addEventListener('click',()=>{go('units',true);openUnit(b.dataset.evUnit,'events')}));
    root.querySelector('[data-go]')?.addEventListener('click',()=>go('myRequests'));
  }

  // ---------- my requests ----------
  async function renderMyRequests(){
    const root=$('#myRequestsRoot');if(!root)return;root.innerHTML='<div class="ux-loading">Yuklanmoqda…</div>';
    let rows;try{rows=await api('/unit-requests/mine')}catch(e){root.innerHTML=empty('Yuklanmadi',e.message);return}
    const open=rows.filter(r=>['new','in_progress','waiting'].includes(r.status)),closed=rows.filter(r=>!['new','in_progress','waiting'].includes(r.status));
    root.innerHTML='<div class="ux-ws"><div class="ux-bar"><button type="button" class="hx-plain ux-btn" data-new>＋ Yangi murojaat</button></div>'+(rows.length?(open.length?'<section class="ux-ws-sec"><h3>Ko‘rib chiqilmoqda <small>'+open.length+'</small></h3><div class="ux-list">'+open.map(r=>reqRow(r)).join('')+'</div></section>':'')+(closed.length?'<section class="ux-ws-sec"><h3>Yopilgan <small>'+closed.length+'</small></h3><div class="ux-list">'+closed.map(r=>reqRow(r)).join('')+'</div></section>':''):'<div class="ux-hero-empty"><div class="ux-hero-ico">📝</div><h2>Hali murojaat yubormagansiz</h2><p>Ma’lumotnoma, yotoqxona, ta’mir, texnik yordam va boshqa xizmatlar uchun kerakli bo‘limni tanlang va onlayn ariza bering. Navbatda turish shart emas.</p><button type="button" class="hx-plain ux-btn big" data-new>Bo‘limlar va xizmatlar</button></div>')+'</div>';
    root.querySelectorAll('[data-new]').forEach(b=>b.addEventListener('click',()=>{cur=null;go('units')}));
    root.querySelectorAll('[data-req]').forEach(b=>b.addEventListener('click',()=>openRequest(b.dataset.req,renderMyRequests)));
  }

  return {renderUnits,renderWorkspace,renderMyRequests,openUnit};
}
