/* HALLAYM EDU — premium motion layer (pairs with hallaym-motion.css).
   Loaded synchronously in <head> right after a11y-boot.js so the motion gate
   is decided before first paint; DOM work waits for DOMContentLoaded.
   Never touches the live classroom (#lesson) or the video page. */
(function(){
 'use strict';
 var root=document.documentElement;
 root.classList.add('hx-pro'); // Pro skin (hallaym-pro.css); motion is gated separately below
 var mem=Number(navigator.deviceMemory||0),cores=Number(navigator.hardwareConcurrency||0);
 var android=Number((navigator.userAgent.match(/Android\s+(\d+)/i)||[])[1]||0);
 // ultraLite matches app.js; lite is narrower than app.js lowEndUI because
 // browsers cap deviceMemory low (4 GB is reported by many fast laptops)
 var ultraLite=Boolean((mem&&mem<=2)||(cores&&cores<=2)||(android&&android<=8));
 var lite=Boolean(ultraLite||(mem&&mem<4)||(cores&&cores<=4));
 var mqReduce=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
 var mqFine=window.matchMedia?matchMedia('(hover: hover) and (pointer: fine)'):null;
 var SKIP={lesson:1,videoWatch:1};

 function allowed(){
  return !(mqReduce&&mqReduce.matches)&&!root.classList.contains('a11y-reduce-motion')&&!ultraLite&&!root.classList.contains('ultra-lite-device');
 }
 function on(){return root.classList.contains('hxm')}
 function gate(){
  var ok=allowed();
  root.classList.toggle('hxm',ok);
  root.classList.toggle('hxm-lite',ok&&lite);
  root.classList.toggle('hxm-spot',ok&&!lite&&Boolean(mqFine&&mqFine.matches));
  if(!ok)all('.hxm-r').forEach(clearReveal);
 }
 function all(sel,ctx){return Array.prototype.slice.call((ctx||document).querySelectorAll(sel))}
 gate();
 if(mqReduce&&mqReduce.addEventListener)mqReduce.addEventListener('change',gate);
 // a11y panel toggles .a11y-reduce-motion on <html> at runtime
 new MutationObserver(function(){var was=on();if(was!==allowed())gate()}).observe(root,{attributes:true,attributeFilter:['class']});

 /* ---------- staged reveal ---------- */
 var io=('IntersectionObserver' in window)?new IntersectionObserver(function(entries){
  var k=0;
  entries.filter(function(e){return e.isIntersecting}).sort(function(a,b){return a.target.compareDocumentPosition(b.target)&2?1:-1}).forEach(function(e){
   io.unobserve(e.target);play(e.target,k++);
  });
 },{rootMargin:'0px 0px -6% 0px',threshold:.04}):null;

 function play(el,i){
  el.style.setProperty('--hxm-i',String(Math.min(i,10)));
  el.classList.add('hxm-in');
  setTimeout(function(){clearReveal(el)},1400+Math.min(i,10)*55);
 }
 function clearReveal(el){el.classList.remove('hxm-r','hxm-in');el.style.removeProperty('--hxm-i');if(io)io.unobserve(el)}

 var GRIDS='.grid,.analytics-grid,.stats,.university-grid,.uni-facts';
 function revealTargets(page){
  var out=[];
  Array.prototype.forEach.call(page.children,function(c){
   if(c.matches('.page-head,script,style,template,[hidden],.hidden'))return;
   if(c.matches(GRIDS))Array.prototype.forEach.call(c.children,function(x){if(!x.matches('[hidden],.hidden'))out.push(x)});
   else out.push(c);
  });
  return out;
 }
 var activatedAt=0;
 function enterPage(page){
  if(!on()||!page||SKIP[page.id])return;
  activatedAt=Date.now();
  var t=revealTargets(page);
  t.forEach(function(el){el.classList.remove('hxm-in');el.classList.add('hxm-r')});
  if(!io){t.forEach(function(el,i){play(el,i)});return}
  // let the hidden state paint, then play what is on screen at once and
  // leave the rest to the observer as the user scrolls
  requestAnimationFrame(function(){requestAnimationFrame(function(){
   var k=0,h=window.innerHeight||800;
   t.forEach(function(el){if(el.getBoundingClientRect().top<h)play(el,k++);else io.observe(el)});
  })});
  // safety: never leave anything invisible
  setTimeout(function(){t.forEach(function(el){if(el.classList.contains('hxm-r')&&!el.classList.contains('hxm-in'))play(el,0)})},2600);
 }

 /* ---------- rows + numbers when content first arrives ---------- */
 var ROWS='.list,.quick,.program-grid,.faculty-showcase';
 function fresh(){return Date.now()-activatedAt<2600}
 function animateRows(box){
  var kids=Array.prototype.slice.call(box.children,0,14);
  kids.forEach(function(el,i){
   el.classList.add('hxm-row');el.style.setProperty('--hxm-i',String(i));
   el.addEventListener('animationend',function done(){el.classList.remove('hxm-row');el.style.removeProperty('--hxm-i');el.removeEventListener('animationend',done)});
  });
 }
 var counting=new WeakSet();
 function countUp(b){
  var txt=(b.textContent||'').trim(),m=txt.match(/^(\d{1,3}(?:[   ]?\d{3})*|\d+)(\D.*)?$/);
  if(!m)return;
  var sep=(m[1].match(/[   ]/)||[''])[0],target=Number(m[1].replace(/\D/g,'')),suffix=m[2]||'';
  if(!(target>1)||target>1e8)return;
  var fmt=function(n){var s=String(n);return sep?s.replace(/\B(?=(\d{3})+(?!\d))/g,sep):s};
  var t0=performance.now(),dur=Math.min(1400,700+target*2);
  counting.add(b);var last=null;
  (function tick(now){
   var p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,4);
   // the app may re-render mid-count; stop writing into a stale node
   if(!b.isConnected||(last!==null&&b.textContent!==last)){counting.delete(b);return}
   b.textContent=last=fmt(Math.round(target*e))+suffix;
   if(p<1)requestAnimationFrame(tick);
   else setTimeout(function(){counting.delete(b)},0); // after our own mutation records are delivered
  })(t0);
 }
 function charts(box){all('.bar-track>i',box).forEach(function(el,i){el.style.setProperty('--hxm-i',String(Math.min(i,12)))})}

 function watchMain(main){
  new MutationObserver(function(muts){
   if(!on())return;
   muts.forEach(function(m){
    if(m.type==='attributes'){
     var el=m.target;
     if(el.classList&&el.classList.contains('page')&&el.classList.contains('active')&&!(m.oldValue||'').split(/\s+/).includes('active'))enterPage(el);
     return;
    }
    var box=m.target;
    if(!m.addedNodes.length||!box.closest)return;
    var page=box.closest('.page');
    if(!page||!page.classList.contains('active')||SKIP[page.id])return;
    if(box.closest('.stats,.live-summary,.uni-facts')){
     if(fresh())(box.matches('b')?[box]:all('b',box)).forEach(function(b){if(!counting.has(b))countUp(b)});
     return;
    }
    if(box.matches('.bar-chart'))charts(box);
    if(box.matches(ROWS)&&fresh())animateRows(box);
   });
  }).observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});
 }

 /* ---------- pointer: tilt, light + ripple ---------- */
 var CARD='.stats>*,.gx-card,.gx-badge',tilted=null;
 function untilt(card){if(!card)return;['--tx','--ty','--mx','--my','--mxp'].forEach(function(k){card.style.removeProperty(k)})}
 function spotlight(main){
  var pending=null,raf=0;
  main.addEventListener('pointermove',function(e){
   if(!root.classList.contains('hxm-spot'))return;
   pending=e;if(raf)return;
   raf=requestAnimationFrame(function(){
    raf=0;var ev=pending,card=ev.target.closest&&ev.target.closest(CARD);
    if(card!==tilted){untilt(tilted);tilted=card}
    if(!card||card.closest('#lesson,#videoWatch'))return;
    var r=card.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width,py=(ev.clientY-r.top)/r.height,max=card.matches('.gx-badge')?12:6;
    card.style.setProperty('--tx',((px-.5)*max).toFixed(2)+'deg');card.style.setProperty('--ty',((.5-py)*max).toFixed(2)+'deg');
    card.style.setProperty('--mx',(ev.clientX-r.left)+'px');card.style.setProperty('--my',(ev.clientY-r.top)+'px');card.style.setProperty('--mxp',Math.round(px*100)+'%');
   });
  },{passive:true});
  main.addEventListener('pointerleave',function(){untilt(tilted);tilted=null},{passive:true});
 }
 document.addEventListener('pointerdown',function(e){
  if(!on()||root.classList.contains('hxm-lite'))return;
  var b=e.target.closest&&e.target.closest('button.primary,.join-btn');
  if(!b||b.disabled||!b.closest('#shell>main .page:not(#lesson):not(#videoWatch),dialog'))return;
  var r=b.getBoundingClientRect(),d=Math.max(r.width,r.height)*2.2,s=document.createElement('span');
  s.className='hxm-ripple';s.setAttribute('aria-hidden','true');
  s.style.width=s.style.height=d+'px';s.style.left=(e.clientX-r.left-d/2)+'px';s.style.top=(e.clientY-r.top-d/2)+'px';
  b.appendChild(s);setTimeout(function(){s.remove()},650);
 },{passive:true});

 /* ---------- theme: circular reveal from the button ---------- */
 var vtBusy=false;
 document.addEventListener('click',function(e){
  var b=e.target.closest&&e.target.closest('#themeBtn');
  if(!b||vtBusy||!on()||!document.startViewTransition||typeof b.onclick!=='function')return;
  e.preventDefault();e.stopImmediatePropagation();
  var r=b.getBoundingClientRect();
  root.style.setProperty('--hxm-x',(r.left+r.width/2)+'px');root.style.setProperty('--hxm-y',(r.top+r.height/2)+'px');
  root.classList.add('hxm-vt');vtBusy=true;
  var t=document.startViewTransition(function(){b.onclick.call(b,e)});
  t.finished.finally(function(){root.classList.remove('hxm-vt');vtBusy=false});
 },true);

 /* ---------- header shadow on scroll ---------- */
 var ticking=false;
 function onScroll(){
  if(ticking)return;ticking=true;
  requestAnimationFrame(function(){
   ticking=false;var m=document.getElementById('main');
   root.classList.toggle('hxm-scrolled',(window.scrollY||0)>4||(m&&m.scrollTop>4));
  });
 }

 /* ---------- boot ---------- */
 function boot(){
  all('#login .login-card>*').forEach(function(el,i){el.style.setProperty('--hxm-i',String(i))});
  all('#sidebar nav>*').forEach(function(el,i){el.style.setProperty('--hxm-i',String(Math.min(i,12)))});
  var err=document.getElementById('loginError');
  if(err)new MutationObserver(function(){
   if(!on()||!err.textContent.trim())return;
   err.classList.remove('hxm-shake');void err.offsetWidth;err.classList.add('hxm-shake');
  }).observe(err,{childList:true,characterData:true,subtree:true});
  var main=document.getElementById('main');
  if(main){watchMain(main);spotlight(main);main.addEventListener('scroll',onScroll,{passive:true})}
  window.addEventListener('scroll',onScroll,{passive:true});
  // first page shown when the shell opens
  var shell=document.getElementById('shell');
  if(shell)new MutationObserver(function(){
   if(!shell.classList.contains('hidden'))enterPage(document.querySelector('#main>.page.active'));
  }).observe(shell,{attributes:true,attributeFilter:['class']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
