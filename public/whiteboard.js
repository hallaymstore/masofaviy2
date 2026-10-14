// HALLAYM EDU — Elektron doska (electronic whiteboard).
// A 1920×1080 canvas the teacher writes on; in a live lesson it is published as the lesson's screen stream
// (MediaRoomClient.shareCanvas), so students see it on the main stage with the teacher camera as PiP.
// Pages, pen/highlighter/eraser/shapes/text/laser, backgrounds (white, grid, lines, chalkboard, image slide),
// undo/redo, PNG export. Content is kept per lesson in localStorage so an accidental close loses nothing.
const W=1920,H=1080;
const COLORS_LIGHT=['#111827','#0b4fd8','#e5483b','#1f9d55','#f08c00','#8b5cf6'];
const COLORS_DARK=['#ffffff','#7fb2ff','#ff8f7a','#6fe3a2','#ffd166','#d0b3ff'];
const SIZES=[3,6,12];
const TOOLS=[
  ['pen','✎','Ruchka (P)'],['marker','▮','Marker (H)'],['eraser','⌫','O‘chirg‘ich (E)'],['line','╱','Chiziq (L)'],
  ['arrow','➝','Strelka (A)'],['rect','▭','To‘rtburchak (R)'],['ellipse','◯','Ellips (O)'],['text','T','Matn (T)'],['laser','✦','Lazer ko‘rsatkich (K)']
];
const BGS=[['white','Oq'],['grid','Katak'],['lines','Chiziqli'],['axes','Koordinata'],['chalk','Yashil doska']];
const PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';
let pdfjsPromise=null;
// pdf.js is loaded only when a teacher imports a PDF. The worker is fetched and started from a blob: URL (CSP worker-src allows blob:).
function loadPdfJs(){
  if(!pdfjsPromise)pdfjsPromise=(async()=>{const lib=await import(PDFJS+'pdf.min.mjs');const src=await (await fetch(PDFJS+'pdf.worker.min.mjs')).text();lib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));return lib})().catch(e=>{pdfjsPromise=null;throw e});
  return pdfjsPromise;
}

export function createWhiteboard({toast=()=>{},getCameraTrack=()=>null,showCam=()=>true,onShare=null,onStopShare=null,isSharing=()=>false,canShare=()=>Boolean(onShare),storageKey='m2-board:free'}={}){
  let root=null,canvas=null,g=null,base=null,bg=null,camVideo=null,raf=0,keepAlive=0,camTimer=0,ro=null;
  let pages=[],page=0,tool='pen',color=0,size=1,drawing=null,laser=[],undo=[],redo=[];
  const key=()=>typeof storageKey==='function'?storageKey():storageKey;
  const cur=()=>pages[page];
  const dark=()=>cur()?.bg==='chalk';
  const palette=()=>dark()?COLORS_DARK:COLORS_LIGHT;
  const newPage=(bgName)=>({bg:bgName||cur()?.bg||'white',strokes:[],image:null});

  function load(){
    try{const raw=localStorage.getItem(key());if(raw){const d=JSON.parse(raw);if(Array.isArray(d.pages)&&d.pages.length){pages=d.pages;page=Math.min(d.page||0,pages.length-1);return}}}catch{}
    pages=[newPage('white')];page=0;
  }
  let saveTimer=0;
  function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(key(),JSON.stringify({pages,page}))}catch{try{localStorage.setItem(key(),JSON.stringify({pages:pages.map(p=>({...p,image:null})),page}))}catch{}}},400)}
  function snapshot(){undo.push(JSON.stringify(cur().strokes));if(undo.length>60)undo.shift();redo=[]}

  // ---------- rendering ----------
  const imgCache=new Map();
  function pageImage(p){
    if(!p.image)return null;let im=imgCache.get(p.image);
    if(!im){im=new Image();im.onload=()=>{renderBase();frame()};im.src=p.image;imgCache.set(p.image,im)}
    return im.complete&&im.naturalWidth?im:null;
  }
  function drawBackground(c,p){
    c.save();
    c.fillStyle=p.bg==='chalk'?'#1f3b2d':'#ffffff';c.fillRect(0,0,W,H);
    if(p.bg==='grid'||p.bg==='lines'){
      c.strokeStyle=p.bg==='grid'?'#dfe6f2':'#cfdcf0';c.lineWidth=1.5;c.beginPath();
      const step=p.bg==='grid'?48:60;
      for(let y=step;y<H;y+=step){c.moveTo(0,y+.5);c.lineTo(W,y+.5)}
      if(p.bg==='grid')for(let x=step;x<W;x+=step){c.moveTo(x+.5,0);c.lineTo(x+.5,H)}
      c.stroke();
      if(p.bg==='lines'){c.strokeStyle='#f3b4b4';c.lineWidth=2;c.beginPath();c.moveTo(150,0);c.lineTo(150,H);c.stroke()}
    }
    if(p.bg==='axes'){
      const step=60,ox=Math.round(W/2/step)*step,oy=Math.round(H/2/step)*step;
      c.strokeStyle='#e6ebf5';c.lineWidth=1;c.beginPath();for(let x=ox%step;x<W;x+=step){c.moveTo(x+.5,0);c.lineTo(x+.5,H)}for(let y=oy%step;y<H;y+=step){c.moveTo(0,y+.5);c.lineTo(W,y+.5)}c.stroke();
      c.strokeStyle='#5b6588';c.lineWidth=2.5;c.beginPath();c.moveTo(0,oy);c.lineTo(W,oy);c.moveTo(ox,0);c.lineTo(ox,H);c.stroke();
      c.fillStyle='#5b6588';c.beginPath();c.moveTo(W-4,oy);c.lineTo(W-22,oy-8);c.lineTo(W-22,oy+8);c.fill();c.beginPath();c.moveTo(ox,4);c.lineTo(ox-8,22);c.lineTo(ox+8,22);c.fill();
      c.font='600 18px "Onest Hx",system-ui,sans-serif';c.fillText('x',W-26,oy+30);c.fillText('y',ox+14,24);c.fillText('0',ox-18,oy+22);
      c.font='500 14px "Onest Hx",system-ui,sans-serif';c.fillStyle='#8a93b0';for(let x=ox+step,n=1;x<W-30;x+=step,n++){c.fillText(String(n),x-4,oy+20);c.fillText(String(-n),ox-(x-ox)-8,oy+20)}for(let y=oy-step,n=1;y>30;y-=step,n++){c.fillText(String(n),ox+8,y+5);c.fillText(String(-n),ox+8,oy+(oy-y)+5)}
    }
    if(p.bg==='chalk'){c.globalAlpha=.06;c.fillStyle='#fff';for(let i=0;i<260;i++)c.fillRect((i*733)%W,(i*397)%H,2,2);c.globalAlpha=1}
    const im=pageImage(p);
    if(im){const k=Math.min(W/im.naturalWidth,H/im.naturalHeight),w=im.naturalWidth*k,h=im.naturalHeight*k;c.drawImage(im,(W-w)/2,(H-h)/2,w,h)}
    c.restore();
  }
  function drawStroke(c,s){
    c.save();c.lineCap='round';c.lineJoin='round';c.strokeStyle=s.color;c.fillStyle=s.color;c.lineWidth=s.w;
    if(s.t==='marker'){c.globalAlpha=.32;c.lineCap='butt'}
    const pts=s.p;
    if(s.t==='pen'||s.t==='marker'){
      if(pts.length<4){c.beginPath();c.arc(pts[0],pts[1],s.w/2,0,Math.PI*2);c.fill()}
      else{c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length-2;i+=2){const mx=(pts[i]+pts[i+2])/2,my=(pts[i+1]+pts[i+3])/2;c.quadraticCurveTo(pts[i],pts[i+1],mx,my)}c.lineTo(pts[pts.length-2],pts[pts.length-1]);c.stroke()}
    }else if(s.t==='line'||s.t==='arrow'){
      const [x1,y1,x2,y2]=pts;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
      if(s.t==='arrow'){const a=Math.atan2(y2-y1,x2-x1),L=Math.max(18,s.w*4);c.beginPath();c.moveTo(x2,y2);c.lineTo(x2-L*Math.cos(a-.42),y2-L*Math.sin(a-.42));c.lineTo(x2-L*Math.cos(a+.42),y2-L*Math.sin(a+.42));c.closePath();c.fill()}
    }else if(s.t==='rect'){const [x1,y1,x2,y2]=pts;c.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1))}
    else if(s.t==='ellipse'){const [x1,y1,x2,y2]=pts;c.beginPath();c.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2||1,Math.abs(y2-y1)/2||1,0,0,Math.PI*2);c.stroke()}
    else if(s.t==='text'){c.font='600 '+s.fs+'px "Onest Hx",system-ui,sans-serif';c.textBaseline='top';String(s.text).split('\n').forEach((ln,i)=>c.fillText(ln,pts[0],pts[1]+i*s.fs*1.25))}
    c.restore();
  }
  function renderBase(){const p=cur();if(!p)return;drawBackground(bg.getContext('2d'),p);const b=base.getContext('2d');b.clearRect(0,0,W,H);b.drawImage(bg,0,0);for(const s of p.strokes)drawStroke(b,s)}
  function frame(){
    if(!g)return;g.drawImage(base,0,0);
    if(drawing&&drawing.t!=='eraser')drawStroke(g,drawing);
    const now=performance.now();laser=laser.filter(l=>now-l.at<700);
    if(laser.length){g.save();g.lineCap='round';g.lineJoin='round';for(let i=1;i<laser.length;i++){const a=laser[i-1],b=laser[i],age=(now-b.at)/700;g.strokeStyle='rgba(255,40,40,'+(1-age)+')';g.lineWidth=10*(1-age)+2;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke()}const l=laser[laser.length-1];g.fillStyle='#ff2828';g.shadowColor='#ff2828';g.shadowBlur=24;g.beginPath();g.arc(l.x,l.y,9,0,Math.PI*2);g.fill();g.restore()}
    if(laser.length){cancelAnimationFrame(raf);raf=requestAnimationFrame(frame)}
  }
  const rerender=()=>{renderBase();frame();save();syncUi()};

  // ---------- input ----------
  function pos(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height]}
  function eraseAt(x,y){
    const p=cur(),R=22;let hit=false;
    p.strokes=p.strokes.filter(s=>{const pts=s.t==='text'?[s.p[0],s.p[1]]:s.p;for(let i=0;i<pts.length;i+=2){if(Math.hypot(pts[i]-x,pts[i+1]-y)<R+s.w){hit=true;return false}}
      if((s.t==='rect'||s.t==='ellipse'||s.t==='line'||s.t==='arrow')){const [x1,y1,x2,y2]=s.p;if(x>=Math.min(x1,x2)-R&&x<=Math.max(x1,x2)+R&&y>=Math.min(y1,y2)-R&&y<=Math.max(y1,y2)+R&&s.t!=='line'&&s.t!=='arrow'){const inner=x>Math.min(x1,x2)+R&&x<Math.max(x1,x2)-R&&y>Math.min(y1,y2)+R&&y<Math.max(y1,y2)-R;if(!inner){hit=true;return false}}}
      return true});
    if(hit){renderBase();frame()}
  }
  function down(e){
    if(e.button>0)return;e.preventDefault();canvas.setPointerCapture?.(e.pointerId);
    const [x,y]=pos(e);
    if(tool==='laser'){laser.push({x,y,at:performance.now()});frame();drawing={t:'laser'};return}
    if(tool==='text'){openText(x,y);return}
    snapshot();
    const col=palette()[color],w=tool==='marker'?SIZES[size]*4:(tool==='eraser'?0:SIZES[size]*(e.pointerType==='pen'&&e.pressure?(.6+e.pressure):1));
    if(tool==='eraser'){drawing={t:'eraser'};eraseAt(x,y);return}
    drawing={t:tool,color:col,w,p:tool==='pen'||tool==='marker'?[x,y]:[x,y,x,y]};frame();
  }
  function move(e){
    if(!drawing)return;const [x,y]=pos(e);
    if(drawing.t==='laser'){laser.push({x,y,at:performance.now()});frame();return}
    if(drawing.t==='eraser'){eraseAt(x,y);return}
    if(drawing.t==='pen'||drawing.t==='marker'){const p=drawing.p,lx=p[p.length-2],ly=p[p.length-1];if(Math.hypot(x-lx,y-ly)<1.5)return;p.push(x,y)}
    else{drawing.p[2]=x;drawing.p[3]=y;if(e.shiftKey&&(drawing.t==='line'||drawing.t==='arrow')){const dx=x-drawing.p[0],dy=y-drawing.p[1];if(Math.abs(dx)>Math.abs(dy))drawing.p[3]=drawing.p[1];else drawing.p[2]=drawing.p[0]}}
    frame();
  }
  function up(){
    if(!drawing)return;const d=drawing;drawing=null;
    if(d.t==='laser'){frame();return}
    if(d.t==='eraser'){save();syncUi();return}
    if((d.t==='line'||d.t==='arrow'||d.t==='rect'||d.t==='ellipse')&&Math.hypot(d.p[2]-d.p[0],d.p[3]-d.p[1])<4){undo.pop();frame();return}
    cur().strokes.push(d);rerender();
  }
  function openText(x,y){
    const r=canvas.getBoundingClientRect(),k=r.width/W,ta=document.createElement('textarea');
    ta.className='wb-text';ta.rows=1;const fs=[28,40,60][size];
    Object.assign(ta.style,{left:(r.left+x*k)+'px',top:(r.top+y*k)+'px',fontSize:Math.max(12,fs*k)+'px',color:palette()[color]});
    document.body.appendChild(ta);setTimeout(()=>ta.focus(),0);
    let done=false;const commit=()=>{if(done)return;done=true;const t=ta.value.trim();ta.remove();if(!t)return;snapshot();cur().strokes.push({t:'text',color:palette()[color],w:2,fs,text:t,p:[x,y]});rerender()};
    ta.addEventListener('keydown',ev=>{ev.stopPropagation();if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();commit()}if(ev.key==='Escape'){done=true;ta.remove()}});
    ta.addEventListener('blur',commit);
  }

  // ---------- UI ----------
  function build(){
    root=document.createElement('div');root.className='wb hidden';root.setAttribute('role','dialog');root.setAttribute('aria-label','Elektron doska');
    root.innerHTML='<div class="wb-top"><div class="wb-tools" role="toolbar" aria-label="Asboblar">'+TOOLS.map(([id,ic,t])=>'<button type="button" data-tool="'+id+'" title="'+t+'" aria-label="'+t+'">'+ic+'</button>').join('')+'</div>'+
      '<div class="wb-colors" role="group" aria-label="Rang"></div><div class="wb-sizes" role="group" aria-label="Qalinlik">'+SIZES.map((s,i)=>'<button type="button" data-size="'+i+'" aria-label="Qalinlik '+(i+1)+'"><i style="width:'+(4+i*4)+'px;height:'+(4+i*4)+'px"></i></button>').join('')+'</div>'+
      '<div class="wb-acts"><button type="button" data-act="undo" title="Bekor qilish (Ctrl+Z)">↶</button><button type="button" data-act="redo" title="Qaytarish (Ctrl+Y)">↷</button><select data-act="bg" aria-label="Fon">'+BGS.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('')+'</select><button type="button" data-act="image" title="Slayd qo‘yish: PDF yoki rasm">🖼</button><button type="button" data-act="clear" title="Sahifani tozalash">🗑</button><button type="button" data-act="png" title="PNG yuklab olish">⤓</button></div>'+
      '<button type="button" class="wb-close" data-act="close" title="Doskani yopish">Yopish ✕</button></div>'+
      '<div class="wb-stage"><canvas width="'+W+'" height="'+H+'"></canvas><div class="wb-cam" title="Kamerani suring"><video muted playsinline autoplay></video><span class="wb-cam-off">Kamera o‘chiq</span><button type="button" class="wb-cam-min" aria-label="Kamerani kichraytirish">–</button></div></div>'+
      '<div class="wb-bottom"><div class="wb-pages"><button type="button" data-act="prev" aria-label="Oldingi sahifa">‹</button><span class="wb-pageno"></span><button type="button" data-act="next" aria-label="Keyingi sahifa">›</button><button type="button" data-act="add" title="Yangi sahifa">＋ Sahifa</button><button type="button" data-act="delpage" title="Sahifani o‘chirish">Sahifani o‘chirish</button></div><button type="button" class="wb-share" data-act="share"></button><input type="file" accept="image/*,application/pdf,.pdf" hidden></div>';
    document.body.appendChild(root);
    canvas=root.querySelector('canvas');g=canvas.getContext('2d');
    base=document.createElement('canvas');base.width=W;base.height=H;bg=document.createElement('canvas');bg.width=W;bg.height=H;
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('pointerleave',e=>{if(drawing&&e.pointerType==='mouse')up()});
    canvas.style.touchAction='none';
    root.addEventListener('click',onClick);root.querySelector('[data-act=bg]').addEventListener('change',e=>{snapshotPageBg(e.target.value)});
    root.querySelector('input[type=file]').addEventListener('change',onImage);
    const cam=root.querySelector('.wb-cam');camVideo=cam.querySelector('video');dragify(cam,root.querySelector('.wb-stage'));
    cam.querySelector('.wb-cam-min').addEventListener('click',e=>{e.stopPropagation();cam.classList.toggle('min')});
    document.addEventListener('keydown',onKey);
    if(window.ResizeObserver){ro=new ResizeObserver(()=>fit());ro.observe(root.querySelector('.wb-stage'))}else window.addEventListener('resize',fit);
  }
  function snapshotPageBg(v){const p=cur();p.bg=v;if(color>=0&&dark()!==(v==='chalk'))color=0;rerender()}
  function onImage(e){
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){importPdf(f);return}
    const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);
      const url=c.toDataURL('image/jpeg',.86);const p=cur().strokes.length||cur().image?(pages.splice(page+1,0,newPage('white')),page++,cur()):cur();p.image=url;p.bg='white';undo=[];redo=[];rerender();toast('Rasm yangi sahifaga qo‘yildi — ustidan yozishingiz mumkin')};im.src=fr.result};fr.readAsDataURL(f);
  }
  async function importPdf(file){
    const btn=root.querySelector('[data-act=image]');btn.disabled=true;toast('PDF yuklanmoqda…');
    try{
      const lib=await loadPdfJs(),doc=await lib.getDocument({data:await file.arrayBuffer()}).promise,n=Math.min(doc.numPages,40),start=page+(cur().strokes.length||cur().image?1:0),fresh=[];
      for(let i=1;i<=n;i++){
        const pg=await doc.getPage(i),v0=pg.getViewport({scale:1}),k=Math.min(1600/v0.width,1000/v0.height),vp=pg.getViewport({scale:k}),c=document.createElement('canvas');
        c.width=Math.round(vp.width);c.height=Math.round(vp.height);const cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,c.width,c.height);
        await pg.render({canvasContext:cx,viewport:vp}).promise;fresh.push({bg:'white',strokes:[],image:c.toDataURL('image/jpeg',.82)});
        if(i%5===0)toast('PDF: '+i+' / '+n+' sahifa');
      }
      if(!cur().strokes.length&&!cur().image)pages.splice(page,1,...fresh);else pages.splice(start,0,...fresh);
      page=Math.min(start,pages.length-1);undo=[];redo=[];rerender();
      toast(n+' ta slayd qo‘shildi'+(doc.numPages>n?' (birinchi 40 tasi)':'')+' — ustidan yozing, ‹ › bilan varaqlang');
    }catch(err){toast('PDF ochilmadi: '+(err?.message||err)+'. Internet aloqasini tekshiring yoki slaydni rasm (PNG/JPG) qilib yuklang.')}
    finally{btn.disabled=false}
  }
  function fit(){
    if(!root||root.classList.contains('hidden'))return;const st=root.querySelector('.wb-stage'),r=st.getBoundingClientRect(),pad=16;
    const k=Math.max(.05,Math.min((r.width-pad)/W,(r.height-pad)/H));canvas.style.width=Math.floor(W*k)+'px';canvas.style.height=Math.floor(H*k)+'px';
  }
  function onClick(e){
    const t=e.target.closest('[data-tool]');if(t){tool=t.dataset.tool;syncUi();return}
    const c=e.target.closest('[data-color]');if(c){color=Number(c.dataset.color);if(tool==='eraser'||tool==='laser')tool='pen';syncUi();return}
    const z=e.target.closest('[data-size]');if(z){size=Number(z.dataset.size);syncUi();return}
    const a=e.target.closest('[data-act]')?.dataset.act;if(!a||a==='bg')return;
    if(a==='undo'){if(undo.length){redo.push(JSON.stringify(cur().strokes));cur().strokes=JSON.parse(undo.pop());rerender()}}
    else if(a==='redo'){if(redo.length){undo.push(JSON.stringify(cur().strokes));cur().strokes=JSON.parse(redo.pop());rerender()}}
    else if(a==='clear'){if(cur().strokes.length||cur().image){snapshot();cur().strokes=[];cur().image=null;rerender()}}
    else if(a==='png'){const l=document.createElement('a');l.download='doska-'+(page+1)+'.png';l.href=canvas.toDataURL('image/png');l.click()}
    else if(a==='image')root.querySelector('input[type=file]').click();
    else if(a==='prev'){if(page>0){page--;undo=[];redo=[];rerender()}}
    else if(a==='next'){if(page<pages.length-1){page++;undo=[];redo=[];rerender()}}
    else if(a==='add'){pages.splice(page+1,0,newPage());page++;undo=[];redo=[];rerender()}
    else if(a==='delpage'){if(pages.length>1){pages.splice(page,1);page=Math.min(page,pages.length-1)}else{pages=[newPage('white')];page=0}undo=[];redo=[];rerender()}
    else if(a==='share')toggleShare();
    else if(a==='close')close();
  }
  function onKey(e){
    if(!root||root.classList.contains('hidden')||/input|textarea|select/i.test(e.target.tagName))return;
    const k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();root.querySelector('[data-act=undo]').click();return}
    if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();root.querySelector('[data-act=redo]').click();return}
    const map={p:'pen',h:'marker',e:'eraser',l:'line',a:'arrow',r:'rect',o:'ellipse',t:'text',k:'laser'};
    if(map[k]&&!e.ctrlKey&&!e.metaKey){tool=map[k];syncUi()}
    if(e.key==='ArrowRight'||e.key==='PageDown')root.querySelector('[data-act=next]').click();
    if(e.key==='ArrowLeft'||e.key==='PageUp')root.querySelector('[data-act=prev]').click();
    if(e.key==='Escape')close();
  }
  function dragify(el,box){
    let sx=0,sy=0,ox=0,oy=0,on=false;
    el.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;on=true;el.setPointerCapture?.(e.pointerId);sx=e.clientX;sy=e.clientY;const r=el.getBoundingClientRect(),b=box.getBoundingClientRect();ox=r.left-b.left;oy=r.top-b.top});
    el.addEventListener('pointermove',e=>{if(!on)return;const b=box.getBoundingClientRect(),r=el.getBoundingClientRect();const x=Math.max(0,Math.min(b.width-r.width,ox+e.clientX-sx)),y=Math.max(0,Math.min(b.height-r.height,oy+e.clientY-sy));Object.assign(el.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'})});
    el.addEventListener('pointerup',()=>{on=false});
  }
  function syncCam(){
    if(!root)return;const cam=root.querySelector('.wb-cam'),t=getCameraTrack();
    cam.hidden=!showCam();cam.classList.toggle('off',!t);
    if(t&&camVideo.srcObject?.getVideoTracks?.()[0]!==t){camVideo.srcObject=new MediaStream([t]);camVideo.play().catch(()=>{})}
    if(!t&&camVideo.srcObject)camVideo.srcObject=null;
  }
  function syncUi(){
    if(!root)return;
    root.classList.toggle('dark',dark());
    root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===tool));
    root.querySelector('.wb-colors').innerHTML=palette().map((c,i)=>'<button type="button" data-color="'+i+'" class="'+(i===color?'on':'')+'" style="--c:'+c+'" aria-label="Rang '+(i+1)+'"></button>').join('');
    root.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('on',Number(b.dataset.size)===size));
    root.querySelector('[data-act=bg]').value=cur().bg;
    root.querySelector('.wb-pageno').textContent=(page+1)+' / '+pages.length;
    root.querySelector('[data-act=undo]').disabled=!undo.length;root.querySelector('[data-act=redo]').disabled=!redo.length;
    const sh=root.querySelector('.wb-share');sh.hidden=!(onShare&&canShare());const on=isSharing();sh.classList.toggle('on',on);sh.textContent=on?'● Talabalarga ko‘rsatilmoqda · to‘xtatish':'▶ Talabalarga ko‘rsatish';
    canvas.dataset.tool=tool;
  }
  async function toggleShare(){
    if(!onShare||!canShare())return;
    if(isSharing()){await onStopShare?.();}else{await onShare(canvas,'Elektron doska')}
    syncUi();
  }
  async function open({share=true}={}){
    if(!root)build();
    load();undo=[];redo=[];renderBase();frame();syncUi();syncCam();
    root.classList.remove('hidden');document.documentElement.classList.add('wb-open');fit();requestAnimationFrame(fit);
    clearInterval(keepAlive);keepAlive=setInterval(()=>{if(isSharing())frame()},1000); // late joiners get a fresh keyframe
    clearInterval(camTimer);camTimer=setInterval(()=>{syncCam();syncUi()},1500);
    if(share&&onShare&&canShare()&&!isSharing()){await onShare(canvas,'Elektron doska');syncUi()}
  }
  async function close(){
    if(!root||root.classList.contains('hidden'))return;
    save();root.classList.add('hidden');document.documentElement.classList.remove('wb-open');
    clearInterval(keepAlive);clearInterval(camTimer);cancelAnimationFrame(raf);
    if(camVideo)camVideo.srcObject=null;
    if(isSharing()&&onStopShare)await onStopShare();
  }
  return {open,close,get isOpen(){return Boolean(root&&!root.classList.contains('hidden'))},get canvas(){return canvas}};
}
