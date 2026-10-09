const TYPE_LABELS={all:'Barchasi',page:'Sahifalar',course:'Fanlar',assignment:'Topshiriqlar',resource:'Materiallar',quiz:'Testlar',video:'Videodarslar',schedule:'Dars jadvali',library:'Kutubxona',group:'Guruhlar',user:'Foydalanuvchilar',history:'O‘tilgan darslar'};
const TYPE_ICONS={page:'↗',course:'📘',assignment:'📝',resource:'📎',quiz:'✅',video:'▶',schedule:'📅',library:'📚',group:'👥',user:'👤',history:'🕘'};
export function highlightedSearchText(value,query,esc){
 const text=String(value||''),q=String(query||'').trim();
 const i=text.toLocaleLowerCase('uz').indexOf(q.toLocaleLowerCase('uz'));
 if(i<0||!q)return esc(text);
 return esc(text.slice(0,i))+'<mark>'+esc(text.slice(i,i+q.length))+'</mark>'+esc(text.slice(i+q.length));
}
export function createGlobalSearchUi({api,esc,onPick,canView=()=>true,toast=()=>{}}){
 let initialized=false,serial=0,timer=null,latest=[],kind='all';
 const root=()=>document.querySelector('#globalSearchBoard');
 const $=s=>root()?.querySelector(s);
 const visibleTypes=()=>['all',...Object.keys(TYPE_LABELS).filter(key=>key!=='all'&&canView(key))];
 const renderTypes=()=>{
   const types=$('#globalSearchTypes');if(!types)return;
   types.innerHTML=visibleTypes().map(name=>'<button type="button" class="global-search-type '+(name===kind?'active':'')+'" data-global-type="'+esc(name)+'" aria-pressed="'+String(name===kind)+'">'+TYPE_LABELS[name]+'</button>').join('');
   types.querySelectorAll('[data-global-type]').forEach(button=>button.onclick=()=>{
     kind=button.dataset.globalType;renderTypes();perform();
   });
 };
 const pages=q=>[...document.querySelectorAll('nav button[data-page]')]
   .filter(b=>!b.classList.contains('hidden')&&!['lesson','search'].includes(b.dataset.page))
   .map(b=>({type:'page',id:b.dataset.page,page:b.dataset.page,title:(b.textContent||'').trim().replace(/\s+/g,' '),subtitle:'Sahifani ochish',score:50}))
   .filter(x=>x.title.toLocaleLowerCase('uz').includes(q.toLocaleLowerCase('uz'))).slice(0,12);
 const render=(results,q)=>{
   latest=results||[];
   const box=$('#globalSearchResults');
   if(!latest.length){box.innerHTML='<div class="global-search-empty"><b>Natija topilmadi</b><p>Boshqa so‘z yoki qidiruv turini sinab ko‘ring.</p></div>';return}
   box.innerHTML='<div class="global-search-list">'+latest.map((hit,index)=>{
     const type=hit.type||'';
     return '<button type="button" class="global-search-result" data-search-index="'+index+'"><span class="global-search-item-icon">'+(TYPE_ICONS[type]||'🔍')+'</span><span class="global-search-result-main"><small>'+esc(TYPE_LABELS[type]||type)+'</small><strong>'+highlightedSearchText(hit.title,q,esc)+'</strong><span>'+highlightedSearchText(hit.subtitle||'',q,esc)+'</span></span><span class="global-search-result-arrow">↗</span></button>'
   }).join('')+'</div>';
   box.querySelectorAll('[data-search-index]').forEach(button=>button.onclick=async()=>{
     const hit=latest[Number(button.dataset.searchIndex)];
     if(!hit)return;
     try{button.disabled=true;await onPick(hit,q)}catch(e){toast(e.message||'Natijani ochib bo‘lmadi')}finally{button.disabled=false}
   });
 };
 async function perform(){
   const input=$('#globalSearchInput'),q=String(input?.value||'').trim(),current=++serial;
   if(timer){clearTimeout(timer);timer=null}
   const status=$('#globalSearchStatus'),box=$('#globalSearchResults');
   if(q.length<2){
     status.textContent=q?'Kamida 2 ta belgi kiriting':'Matn kiriting yoki Ctrl+K tugmalarini bosing.';
     box.innerHTML='<div class="global-search-empty"><b>Kerakli ma’lumotni tez toping</b><p>Fan nomi, talaba login’i (ruxsat bo‘lsa), topshiriq, guruh kodi yoki videodars mavzusini yozing.</p></div>';
     return;
   }
   status.textContent='Qidirilmoqda…';box.setAttribute('aria-busy','true');
   try{
     const local=(kind==='all'||kind==='page')?pages(q):[];
     const data=kind==='page'?{results:[]}:await api('/search?q='+encodeURIComponent(q)+(kind==='all'?'':'&type='+encodeURIComponent(kind)));
     if(current!==serial)return;
     const rows=[...local,...(data.results||[]).filter(row=>canView(row.type))];
     status.textContent=rows.length+' ta natija · “'+q+'”';
     render(rows,q);
   }catch(e){
     if(current!==serial)return;
     status.textContent='Qidiruvda xato: '+(e.message||'so‘rov bajarilmadi');
     box.innerHTML='';
   }finally{if(current===serial)box.removeAttribute('aria-busy')}
 }
 function schedule(){
   if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{perform().catch(()=>{})},280);
 }
 function init(){
   if(initialized)return;
   initialized=true;
   $('#globalSearchForm')?.addEventListener('submit',event=>{event.preventDefault();perform()});
   $('#globalSearchInput')?.addEventListener('input',schedule);
   renderTypes();
   perform();
 }
 function open(query=''){
   init();
   const input=$('#globalSearchInput');
   if(query){input.value=query;kind='all';renderTypes();perform()}
   requestAnimationFrame(()=>input?.focus());
 }
 function clear(){serial++;if(timer)clearTimeout(timer)}
 return {open,search:perform,clear};
}
