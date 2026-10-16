import {askConfirmation} from './accessible-confirm.js';
// HALLAYM EDU — Virtual laboratoriya.
// Interactive experiments for a technical university: each lab has parameters, a live simulation canvas (1280×720,
// shareable into a live lesson), instrument readings, a measurement journal with chart, CSV export and a printable report.
const CW=1280,CH=720;
const fmt=(v,d=2)=>Number.isFinite(v)?(Math.abs(v)>=1e4||(Math.abs(v)<1e-3&&v!==0)?v.toExponential(2):v.toFixed(d)).replace(/\.?0+$/,m=>m.includes('.')?'':m):'—';
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const G_OPTS=[['9.81','Yer (9.81)'],['1.62','Oy (1.62)'],['3.71','Mars (3.71)'],['24.79','Yupiter (24.79)']];

// ---------- safe expression parser (no eval) for the function lab ----------
function compileExpr(src){
  const s=String(src||'').replace(/\s+/g,'').replace(/\*\*/g,'^').toLowerCase();let i=0;
  const FN={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,sqrt:Math.sqrt,abs:Math.abs,exp:Math.exp,ln:Math.log,log:Math.log10,floor:Math.floor,ceil:Math.ceil,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,sign:Math.sign};
  const peek=()=>s[i];
  function num(){let j=i;while(/[0-9.]/.test(s[i]||''))i++;if(s[i]==='e'&&/[0-9+-]/.test(s[i+1]||'')&&/[0-9]/.test(s[i-1]||'')){i++;if(s[i]==='+'||s[i]==='-')i++;while(/[0-9]/.test(s[i]||''))i++}const v=Number(s.slice(j,i));if(!Number.isFinite(v))throw new Error('Son noto‘g‘ri');return ()=>v}
  function primary(){
    const c=peek();
    if(c==='('){i++;const e=expr();if(s[i]!==')')throw new Error('Qavs yopilmagan');i++;return e}
    if(c==='|'){i++;const e=expr();if(s[i]!=='|')throw new Error('| yopilmagan');i++;return v=>Math.abs(e(v))}
    if(/[0-9.]/.test(c||''))return num();
    if(/[a-z]/.test(c||'')){let j=i;while(/[a-z]/.test(s[i]||''))i++;let name=s.slice(j,i);
      // split things like "ax" or "pix" into known names greedily from the left
      const known=['sqrt','asin','acos','atan','sinh','cosh','tanh','sign','floor','ceil','sin','cos','tan','exp','abs','log','ln','pi','x','a','b','c','e'];
      const parts=[];while(name){const k=known.find(k=>name.startsWith(k));if(!k)throw new Error('Noma’lum nom: '+name);parts.push(k);name=name.slice(k.length)}
      const mk=p=>{if(FN[p]){if(s[i]!=='(')throw new Error(p+'( kerak');i++;const a=expr();if(s[i]!==')')throw new Error('Qavs yopilmagan');i++;return v=>FN[p](a(v))}
        if(p==='pi')return ()=>Math.PI;if(p==='e')return ()=>Math.E;return v=>v[p]};
      let f=null;for(let k=0;k<parts.length;k++){const last=k===parts.length-1;const p=parts[k];if(FN[p]&&!last)throw new Error('Funksiya qavssiz: '+p);const g=FN[p]?mk(p):mk(p);f=f?((a,b)=>v=>a(v)*b(v))(f,g):g}
      return f}
    throw new Error('Kutilmagan belgi: '+(c||'oxiri'));
  }
  function power(){let b=primary();if(s[i]==='^'){i++;const e=unary();const bb=b;return v=>Math.pow(bb(v),e(v))}return b}
  function unary(){if(s[i]==='-'){i++;const u=unary();return v=>-u(v)}if(s[i]==='+'){i++;return unary()}return power()}
  function term(){let l=unary();for(;;){const c=s[i];if(c==='*'||c==='/'){i++;const r=unary(),a=l;l=c==='*'?v=>a(v)*r(v):v=>a(v)/r(v)}else if(c&&/[0-9a-z(|.]/.test(c)&&c!=='|'){const r=unary(),a=l;l=v=>a(v)*r(v)}else return l}}
  function expr(){let l=term();for(;;){const c=s[i];if(c==='+'||c==='-'){i++;const r=term(),a=l;l=c==='+'?v=>a(v)+r(v):v=>a(v)-r(v)}else return l}}
  if(!s)throw new Error('Ifoda bo‘sh');
  const f=expr();if(i<s.length)throw new Error('Ortiqcha belgi: '+s[i]);return f;
}

// ---------- drawing helpers ----------
function bgGrid(g,dark=true){g.fillStyle=dark?'#0d1330':'#f6f8fd';g.fillRect(0,0,CW,CH);g.strokeStyle=dark?'rgba(255,255,255,.05)':'rgba(15,21,55,.06)';g.lineWidth=1;g.beginPath();for(let x=0;x<CW;x+=40){g.moveTo(x+.5,0);g.lineTo(x+.5,CH)}for(let y=0;y<CH;y+=40){g.moveTo(0,y+.5);g.lineTo(CW,y+.5)}g.stroke()}
function hud(g,title,rows,x=24,y=24){
  g.save();g.font='600 20px "Onest Hx",system-ui,sans-serif';const w=Math.max(260,...rows.map(r=>g.measureText(r[0]+'  '+r[1]+' '+(r[2]||'')).width+40));const h=46+rows.length*30;
  g.fillStyle='rgba(5,8,26,.78)';roundRect(g,x,y,w,h,16);g.fill();g.fillStyle='#ffb627';g.font='800 18px "Onest Hx",system-ui,sans-serif';g.fillText(title,x+18,y+30);
  rows.forEach((r,i)=>{g.fillStyle='#aab3d6';g.font='600 18px "Onest Hx",system-ui,sans-serif';g.fillText(r[0],x+18,y+62+i*30);g.fillStyle='#fff';g.font='800 19px "Onest Hx",system-ui,sans-serif';const t=r[1]+(r[2]?' '+r[2]:'');g.fillText(t,x+w-18-g.measureText(t).width,y+62+i*30)});g.restore();
}
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function meter(g,x,y,letter,value,color){g.save();g.fillStyle='#141b3d';g.strokeStyle=color;g.lineWidth=4;g.beginPath();g.arc(x,y,40,0,Math.PI*2);g.fill();g.stroke();g.fillStyle=color;g.font='800 26px "Onest Hx",system-ui,sans-serif';g.textAlign='center';g.fillText(letter,x,y+9);g.fillStyle='#fff';g.font='800 18px "Onest Hx",system-ui,sans-serif';g.fillText(value,x,y+70);g.restore()}
function resistor(g,x1,y,x2,label){g.save();g.strokeStyle='#ffb627';g.lineWidth=5;g.beginPath();g.moveTo(x1,y);const n=8,w=(x2-x1)/n;for(let k=0;k<n;k++){g.lineTo(x1+w*(k+.5),y+(k%2?14:-14))}g.lineTo(x2,y);g.stroke();g.fillStyle='#fff';g.font='700 20px "Onest Hx",system-ui,sans-serif';g.textAlign='center';g.fillText(label,(x1+x2)/2,y-26);g.restore()}
function polyLen(p){let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return L}
function pointAt(p,d){for(let i=1;i<p.length;i++){const l=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);if(d<=l){const k=d/l;return [p[i-1][0]+(p[i][0]-p[i-1][0])*k,p[i-1][1]+(p[i][1]-p[i-1][1])*k]}d-=l}return p[p.length-1]}
function electrons(g,path,phase,count=26,color='#7fe0ff'){const L=polyLen(path);g.fillStyle=color;for(let k=0;k<count;k++){const d=((phase+k/count)%1+1)%1*L,[x,y]=pointAt(path,d);g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fill()}}
function wire(g,path){g.save();g.strokeStyle='#8f9bd0';g.lineWidth=5;g.lineJoin='round';g.beginPath();g.moveTo(path[0][0],path[0][1]);for(const p of path.slice(1))g.lineTo(p[0],p[1]);g.stroke();g.restore()}
function battery(g,x,y1,y2,U){const m=(y1+y2)/2;g.save();g.strokeStyle='#8f9bd0';g.lineWidth=5;g.beginPath();g.moveTo(x,y1);g.lineTo(x,m-22);g.moveTo(x,m+22);g.lineTo(x,y2);g.stroke();g.strokeStyle='#ff8f7a';g.lineWidth=6;g.beginPath();g.moveTo(x-34,m-14);g.lineTo(x+34,m-14);g.stroke();g.lineWidth=10;g.beginPath();g.moveTo(x-18,m+14);g.lineTo(x+18,m+14);g.stroke();g.fillStyle='#fff';g.font='700 20px "Onest Hx",system-ui,sans-serif';g.fillText('+',x+44,m-8);g.fillText(fmt(U,1)+' V',x+48,m+24);g.restore()}

// ---------- labs ----------
const LABS=[
{
  id:'ohm',icon:'⚡',title:'Om qonuni: elektr zanjiri',subject:'Fizika · Elektrotexnika',
  desc:'Ketma-ket va parallel ulangan rezistorlarda tok, kuchlanish va quvvatni o‘lchang.',
  params:[{key:'U',label:'Manba kuchlanishi U',min:0,max:24,step:.5,value:12,unit:'V'},{key:'R1',label:'Rezistor R₁',min:1,max:100,step:1,value:20,unit:'Ω'},{key:'R2',label:'Rezistor R₂',min:1,max:100,step:1,value:30,unit:'Ω'},{key:'mode',label:'Ulanish',type:'select',options:[['series','Ketma-ket'],['parallel','Parallel']],value:'series'}],
  calc(s){const series=s.mode==='series',R=series?s.R1+s.R2:s.R1*s.R2/(s.R1+s.R2),I=s.U/R;return {R,I,P:s.U*I,I1:series?I:s.U/s.R1,I2:series?I:s.U/s.R2,U1:series?I*s.R1:s.U,U2:series?I*s.R2:s.U}},
  step(s,dt){const c=this.calc(s);s.ph1=(s.ph1||0)+dt*c.I1*.18;s.ph2=(s.ph2||0)+dt*c.I2*.18},
  draw(g,s){bgGrid(g);const c=this.calc(s);
    const L=200,R=1080,T=170,B=560;
    if(s.mode==='series'){const path=[[L,B],[L,T],[R,T],[R,B],[L,B]];wire(g,path);electrons(g,path,-(s.ph1||0));resistor(g,420,T,580,'R₁ = '+s.R1+' Ω');resistor(g,700,T,860,'R₂ = '+s.R2+' Ω')}
    else{const p1=[[L,B],[L,T],[R,T],[R,B],[L,B]],p2=[[L,B],[L,T],[360,T],[360,350],[920,350],[920,T],[R,T],[R,B],[L,B]];wire(g,p1);wire(g,[[360,T],[360,350],[920,350],[920,T]]);electrons(g,p1,-(s.ph1||0),22);electrons(g,[[360,350],[920,350]],-(s.ph2||0)*3,8,'#9dffc2');resistor(g,560,T,720,'R₁ = '+s.R1+' Ω');resistor(g,560,350,720,'R₂ = '+s.R2+' Ω');g.fillStyle='#8f9bd0';for(const [x,y] of [[360,T],[920,T]]){g.beginPath();g.arc(x,y,8,0,Math.PI*2);g.fill()}}
    g.fillStyle='#0d1330';g.fillRect(L-40,320,80,120);battery(g,L,320,440,s.U);
    meter(g,640,B,'A',fmt(c.I,3)+' A','#7fe0ff');meter(g,R,365,'V',fmt(s.U,1)+' V','#ffb627');
    hud(g,'O‘lchovlar',[['Umumiy qarshilik',fmt(c.R,2),'Ω'],['Tok kuchi I',fmt(c.I,3),'A'],['Quvvat P',fmt(c.P,2),'W'],['U₁ / U₂',fmt(c.U1,2)+' / '+fmt(c.U2,2),'V']],CW-400,24);
  },
  readings(s){const c=this.calc(s);return [['R umumiy',fmt(c.R,2),'Ω'],['I',fmt(c.I,3),'A'],['P',fmt(c.P,2),'W'],['I₁ / I₂',fmt(c.I1,3)+' / '+fmt(c.I2,3),'A']]},
  columns:['Ulanish','U, V','R₁, Ω','R₂, Ω','R, Ω','I, A','P, W'],
  row(s){const c=this.calc(s);return [s.mode==='series'?'ketma-ket':'parallel',s.U,s.R1,s.R2,+c.R.toFixed(3),+c.I.toFixed(4),+c.P.toFixed(3)]},
  chart:{x:1,y:5,xl:'U, V',yl:'I, A'},
  theory:'<p><b>Om qonuni:</b> I = U / R. Ketma-ket ulanishda R = R₁ + R₂ (tok bir xil), parallelda 1/R = 1/R₁ + 1/R₂ (kuchlanish bir xil). Quvvat P = U·I.</p>',
  task:'<ol><li>R₁=20 Ω, R₂=30 Ω, ketma-ket. U ni 2 V dan 24 V gacha o‘zgartirib, kamida 6 ta o‘lchov yozing.</li><li>I(U) grafigi to‘g‘ri chiziq ekanini tekshiring, qiyalikdan R ni toping.</li><li>Parallel ulanishda takrorlang va natijalarni solishtiring.</li></ol>'
},
{
  id:'pendulum',icon:'🕰',title:'Matematik mayatnik: g ni aniqlash',subject:'Fizika · Mexanika',
  desc:'Ip uzunligi va tebranish davri orasidagi bog‘lanish orqali erkin tushish tezlanishini toping.',
  params:[{key:'L',label:'Ip uzunligi L',min:.2,max:3,step:.05,value:1,unit:'m'},{key:'g',label:'Sayyora',type:'select',options:G_OPTS,value:'9.81'},{key:'A',label:'Boshlang‘ich og‘ish',min:2,max:60,step:1,value:10,unit:'°'},{key:'b',label:'So‘nish koeffitsiyenti',min:0,max:.4,step:.01,value:0,unit:'1/s'}],
  reset(s){s.th=s.A*Math.PI/180;s.w=0;s.t=0;s.cross=[];s.trail=[]},
  step(s,dt){const g=Number(s.g),h=dt/8;for(let k=0;k<8;k++){const f=(th,w)=>[w,-(g/s.L)*Math.sin(th)-s.b*w];const [a1,b1]=f(s.th,s.w),[a2,b2]=f(s.th+a1*h/2,s.w+b1*h/2),[a3,b3]=f(s.th+a2*h/2,s.w+b2*h/2),[a4,b4]=f(s.th+a3*h,s.w+b3*h);const pth=s.th;s.th+=h/6*(a1+2*a2+2*a3+a4);s.w+=h/6*(b1+2*b2+2*b3+b4);s.t+=h;if(pth<0&&s.th>=0){const tc=s.t-h*s.th/(s.th-pth);s.cross.push(tc);if(s.cross.length>6)s.cross.shift()}}},
  period(s){const c=s.cross;if(c.length<2)return NaN;let sum=0;for(let i=1;i<c.length;i++)sum+=c[i]-c[i-1];return sum/(c.length-1)},
  draw(g,s){bgGrid(g);const px=640,py=70,k=Math.min(200,560/s.L),x=px+Math.sin(s.th)*s.L*k,y=py+Math.cos(s.th)*s.L*k;
    s.trail.push([x,y]);if(s.trail.length>90)s.trail.shift();
    g.fillStyle='#2a3366';g.fillRect(px-160,py-14,320,14);
    g.save();g.setLineDash([6,8]);g.strokeStyle='rgba(255,255,255,.25)';g.beginPath();g.moveTo(px,py);g.lineTo(px,py+s.L*k);g.stroke();g.restore();
    g.strokeStyle='rgba(127,224,255,.35)';g.lineWidth=3;g.beginPath();s.trail.forEach(([a,b],i)=>i?g.lineTo(a,b):g.moveTo(a,b));g.stroke();
    g.strokeStyle='#cfd6f5';g.lineWidth=3;g.beginPath();g.moveTo(px,py);g.lineTo(x,y);g.stroke();
    const grd=g.createRadialGradient(x-8,y-8,4,x,y,26);grd.addColorStop(0,'#ffe29a');grd.addColorStop(1,'#f08c00');g.fillStyle=grd;g.beginPath();g.arc(x,y,24,0,Math.PI*2);g.fill();
    const T=this.period(s),T0=2*Math.PI*Math.sqrt(s.L/Number(s.g));
    hud(g,'Mayatnik',[['Vaqt t',fmt(s.t,1),'s'],['Burchak θ',fmt(s.th*180/Math.PI,1),'°'],['O‘lchangan T',fmt(T,3),'s'],['Nazariy T₀=2π√(L/g)',fmt(T0,3),'s']],CW-430,24);
  },
  readings(s){const T=this.period(s);return [['T (o‘lchangan)',fmt(T,3),'s'],['T₀ (nazariy)',fmt(2*Math.PI*Math.sqrt(s.L/Number(s.g)),3),'s'],['g = 4π²L/T²',fmt(4*Math.PI**2*s.L/T**2,3),'m/s²']]},
  columns:['L, m','A, °','T, s','T², s²','g hisob, m/s²'],
  row(s){const T=this.period(s);if(!Number.isFinite(T))return null;return [s.L,s.A,+T.toFixed(4),+(T*T).toFixed(4),+(4*Math.PI**2*s.L/T**2).toFixed(3)]},
  chart:{x:0,y:3,xl:'L, m',yl:'T², s²'},
  theory:'<p>Kichik og‘ishlarda T = 2π√(L/g), demak T² = (4π²/g)·L — chiziqli bog‘lanish. Grafik qiyaligi k bo‘lsa, g = 4π²/k. Katta burchaklarda davr biroz uzayadi.</p>',
  task:'<ol><li>A = 10° da L ni 0.4 m dan 2.4 m gacha o‘zgartirib, har birida 3–4 tebranishdan keyin o‘lchovni yozing.</li><li>T²(L) grafigidan g ni toping va 9.81 bilan solishtiring, nisbiy xatoni hisoblang.</li><li>A = 50° da tajribani takrorlang: davr qanday o‘zgardi?</li></ol>',
  needsWarmup:'Kamida 2 to‘liq tebranishni kuting'
},
{
  id:'projectile',icon:'🎯',title:'Gorizontga burchak ostida otilgan jism',subject:'Fizika · Kinematika',
  desc:'Boshlang‘ich tezlik, burchak va havo qarshiligining uchish uzoqligiga ta’sirini tadqiq qiling.',
  params:[{key:'v0',label:'Boshlang‘ich tezlik v₀',min:5,max:60,step:1,value:25,unit:'m/s'},{key:'ang',label:'Otish burchagi α',min:5,max:85,step:1,value:45,unit:'°'},{key:'h0',label:'Boshlang‘ich balandlik h₀',min:0,max:30,step:1,value:0,unit:'m'},{key:'g',label:'Sayyora',type:'select',options:G_OPTS,value:'9.81'},{key:'k',label:'Havo qarshiligi k',min:0,max:.05,step:.005,value:0,unit:'1/m'}],
  actions:[['launch','▶ Otish']],
  reset(s){s.fly=null;s.paths=s.paths||[];s.last=null},
  action(s,a){if(a!=='launch')return;const r=s.ang*Math.PI/180;s.fly={x:0,y:s.h0,vx:s.v0*Math.cos(r),vy:s.v0*Math.sin(r),t:0,maxY:s.h0,pts:[[0,s.h0]]}},
  ideal(s){const r=s.ang*Math.PI/180,g=Number(s.g),vy=s.v0*Math.sin(r),t=(vy+Math.sqrt(vy*vy+2*g*s.h0))/g;return {t,L:s.v0*Math.cos(r)*t,H:s.h0+vy*vy/(2*g)}},
  step(s,dt){const f=s.fly;if(!f)return;const g=Number(s.g),h=Math.min(dt,.05)/6;for(let k=0;k<6&&s.fly;k++){const v=Math.hypot(f.vx,f.vy);f.vx+=-s.k*v*f.vx*h;f.vy+=(-g-s.k*v*f.vy)*h;f.x+=f.vx*h;f.y+=f.vy*h;f.t+=h;f.maxY=Math.max(f.maxY,f.y);if(k===5)f.pts.push([f.x,f.y]);if(f.y<0){s.last={L:f.x,H:f.maxY,t:f.t,v0:s.v0,ang:s.ang,h0:s.h0};s.paths.unshift(f.pts);s.paths=s.paths.slice(0,5);s.fly=null}}},
  draw(g,s){bgGrid(g);const id=this.ideal(s),Lmax=Math.max(10,id.L*1.12,...(s.paths||[]).flatMap(p=>p.map(q=>q[0]))),Hmax=Math.max(5,(id.H)*1.25);const sc=Math.min((CW-140)/Lmax,(CH-170)/Hmax),ox=70,oy=CH-70,X=x=>ox+x*sc,Y=y=>oy-y*sc;
    g.fillStyle='#163a2a';g.fillRect(0,oy,CW,CH-oy);g.strokeStyle='#2f6b4c';g.lineWidth=3;g.beginPath();g.moveTo(0,oy);g.lineTo(CW,oy);g.stroke();
    g.fillStyle='#aab3d6';g.font='600 15px "Onest Hx",system-ui,sans-serif';const stepM=Math.pow(10,Math.floor(Math.log10(Lmax/5)));for(let m=0;m<=Lmax;m+=stepM*(Lmax/stepM>12?2:1)){g.fillText(fmt(m,0)+' m',X(m)-10,oy+24)}
    if(s.h0>0){g.fillStyle='#3a4580';g.fillRect(ox-30,Y(s.h0),30,s.h0*sc)}
    const r=s.ang*Math.PI/180;g.save();g.translate(X(0),Y(s.h0));g.rotate(-r);g.fillStyle='#cfd6f5';g.fillRect(0,-9,54,18);g.restore();g.fillStyle='#8f9bd0';g.beginPath();g.arc(X(0),Y(s.h0),16,0,Math.PI*2);g.fill();
    (s.paths||[]).forEach((p,i)=>{g.strokeStyle=i?'rgba(127,178,255,'+(.5-i*.08)+')':'#7fb2ff';g.lineWidth=i?2:4;g.beginPath();p.forEach(([x,y],j)=>j?g.lineTo(X(x),Y(Math.max(0,y))):g.moveTo(X(x),Y(y)));g.stroke()});
    const f=s.fly;if(f){g.strokeStyle='#ffb627';g.lineWidth=4;g.beginPath();f.pts.forEach(([x,y],j)=>j?g.lineTo(X(x),Y(y)):g.moveTo(X(x),Y(y)));g.stroke();g.fillStyle='#ff8f7a';g.beginPath();g.arc(X(f.x),Y(f.y),11,0,Math.PI*2);g.fill()}
    const l=s.last;hud(g,'Natija',[['Uchish vaqti t',l?fmt(l.t,2):'—','s'],['Uzoqlik L',l?fmt(l.L,2):'—','m'],['Maks. balandlik H',l?fmt(l.H,2):'—','m'],['Nazariy L (k=0)',fmt(id.L,2),'m']],CW-420,24);
  },
  readings(s){const l=s.last,id=this.ideal(s);return [['L (o‘lchangan)',l?fmt(l.L,2):'—','m'],['H maks',l?fmt(l.H,2):'—','m'],['t',l?fmt(l.t,2):'—','s'],['L nazariy (k=0)',fmt(id.L,2),'m']]},
  columns:['v₀, m/s','α, °','h₀, m','k','L, m','H, m','t, s'],
  row(s){const l=s.last;if(!l)return null;return [l.v0,l.ang,l.h0,s.k,+l.L.toFixed(3),+l.H.toFixed(3),+l.t.toFixed(3)]},
  chart:{x:1,y:4,xl:'α, °',yl:'L, m'},
  theory:'<p>Havo qarshiligisiz: L = v₀²·sin2α / g (h₀=0), H = v₀²·sin²α / 2g. Eng uzoq otish α = 45° da. Havo qarshiligi (F ~ k·v²) uzoqlikni kamaytiradi va optimal burchakni kichraytiradi.</p>',
  task:'<ol><li>v₀ = 25 m/s, k = 0: α ni 15° dan 75° gacha 10° qadam bilan o‘zgartirib, har birida otib, natijani yozing.</li><li>L(α) grafigidan eng yaxshi burchakni toping.</li><li>k = 0.02 da takrorlang — optimal burchak qanday o‘zgardi?</li></ol>',
  needsWarmup:'Avval «Otish» tugmasini bosing'
},
{
  id:'rc',icon:'🔋',title:'RC zanjir: kondensator zaryadlanishi',subject:'Elektrotexnika · Elektronika',
  desc:'Kondensator kuchlanishining vaqt bo‘yicha o‘zgarishini kuzating va vaqt doimiysi τ = RC ni toping.',
  params:[{key:'U0',label:'Manba U₀',min:1,max:24,step:.5,value:12,unit:'V'},{key:'R',label:'Qarshilik R',min:1,max:100,step:1,value:10,unit:'kΩ'},{key:'C',label:'Sig‘im C',min:10,max:1000,step:10,value:470,unit:'µF'},{key:'mode',label:'Jarayon',type:'select',options:[['charge','Zaryadlanish'],['discharge','Razryadlanish']],value:'charge'}],
  actions:[['switch','▶ Kalitni ulash'],['pause','⏸ To‘xtatish']],
  reset(s){s.t=0;s.run=false;s.curve=[]},
  action(s,a){if(a==='switch'){s.t=0;s.curve=[];s.run=true}if(a==='pause')s.run=!s.run},
  tau(s){return s.R*1e3*s.C*1e-6},
  uc(s,t){const tau=this.tau(s);return s.mode==='charge'?s.U0*(1-Math.exp(-t/tau)):s.U0*Math.exp(-t/tau)},
  step(s,dt){if(!s.run)return;s.t+=dt;const tau=this.tau(s);s.curve.push([s.t,this.uc(s,s.t)]);if(s.t>6*tau)s.run=false},
  draw(g,s){bgGrid(g);const tau=this.tau(s),uc=this.uc(s,s.t),I=(s.mode==='charge'?(s.U0-uc):uc)/(s.R*1e3);
    // circuit (left)
    wire(g,[[90,560],[90,180],[460,180],[460,560],[90,560]]);g.fillStyle='#0d1330';g.fillRect(50,320,80,110);battery(g,90,320,430,s.mode==='charge'?s.U0:0);resistor(g,190,180,350,'R = '+s.R+' kΩ');
    g.fillStyle='#0d1330';g.fillRect(420,330,80,80);g.strokeStyle='#cfd6f5';g.lineWidth=6;g.beginPath();g.moveTo(425,355);g.lineTo(495,355);g.moveTo(425,385);g.lineTo(495,385);g.stroke();
    const lvl=Math.max(0,Math.min(1,uc/s.U0));g.fillStyle='rgba(255,182,39,'+(.25+.6*lvl)+')';g.fillRect(430,358,60,24);g.fillStyle='#fff';g.font='700 18px "Onest Hx",system-ui,sans-serif';g.fillText('C = '+s.C+' µF',505,375);
    g.fillStyle=s.run?'#1f9d55':'#8f9bd0';g.beginPath();g.arc(275,560,12,0,Math.PI*2);g.fill();g.font='700 16px "Onest Hx",system-ui,sans-serif';g.fillText(s.run?'kalit yopiq':'kalit ochiq',240,600);
    // graph (right)
    const gx=620,gy=120,gw=620,gh=440,tm=6*tau;g.strokeStyle='#5a6599';g.lineWidth=2;g.strokeRect(gx,gy,gw,gh);
    const X=t=>gx+t/tm*gw,Y=u=>gy+gh-u/s.U0*gh;
    g.setLineDash([6,6]);g.strokeStyle='rgba(255,182,39,.5)';for(let n=1;n<=5;n++){g.beginPath();g.moveTo(X(n*tau),gy);g.lineTo(X(n*tau),gy+gh);g.stroke();g.fillStyle='#ffb627';g.fillText(n+'τ',X(n*tau)-10,gy+gh+24)}
    const mark=s.mode==='charge'?.632:.368;g.strokeStyle='rgba(127,224,255,.5)';g.beginPath();g.moveTo(gx,Y(mark*s.U0));g.lineTo(gx+gw,Y(mark*s.U0));g.stroke();g.setLineDash([]);g.fillStyle='#7fe0ff';g.fillText((mark*100).toFixed(1)+'% U₀',gx+8,Y(mark*s.U0)-8);
    g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=2;g.beginPath();for(let k=0;k<=120;k++){const t=k/120*tm;k?g.lineTo(X(t),Y(this.uc(s,t))):g.moveTo(X(t),Y(this.uc(s,t)))}g.stroke();
    g.strokeStyle='#ffb627';g.lineWidth=4;g.beginPath();s.curve.forEach(([t,u],i)=>i?g.lineTo(X(t),Y(u)):g.moveTo(X(t),Y(u)));g.stroke();
    g.fillStyle='#aab3d6';g.fillText('Uc, V',gx,gy-12);g.fillText('t, s',gx+gw-30,gy+gh+48);
    hud(g,'RC zanjir',[['τ = RC',fmt(tau,2),'s'],['Vaqt t',fmt(s.t,2),'s'],['Uc',fmt(uc,2),'V'],['Tok I',fmt(I*1e3,3),'mA']],gx+gw-300,gy+12);
  },
  readings(s){const uc=this.uc(s,s.t);return [['τ = RC',fmt(this.tau(s),2),'s'],['t',fmt(s.t,2),'s'],['Uc',fmt(uc,2),'V'],['Uc / U₀',fmt(uc/s.U0*100,1),'%']]},
  columns:['Jarayon','R, kΩ','C, µF','τ, s','t, s','Uc, V'],
  row(s){if(!s.t)return null;return [s.mode==='charge'?'zaryad':'razryad',s.R,s.C,+this.tau(s).toFixed(3),+s.t.toFixed(2),+this.uc(s,s.t).toFixed(3)]},
  chart:{x:4,y:5,xl:'t, s',yl:'Uc, V'},
  theory:'<p>Zaryadlanish: Uc(t) = U₀(1 − e^(−t/τ)), razryadlanish: Uc(t) = U₀·e^(−t/τ), bu yerda τ = R·C. t = τ da kondensator 63.2% gacha zaryadlanadi, 5τ dan keyin jarayon amalda tugaydi.</p>',
  task:'<ol><li>R = 10 kΩ, C = 470 µF. Kalitni ulang va har 1–2 soniyada «O‘lchashni yozish» tugmasini bosing (kamida 8 nuqta).</li><li>Grafikdan Uc = 0.632·U₀ bo‘lgan vaqtni toping va τ = RC bilan solishtiring.</li><li>Razryadlanish rejimida takrorlang.</li></ol>',
  needsWarmup:'Avval kalitni ulang'
},
{
  id:'func',icon:'📈',title:'Funksiya grafigi va hosila',subject:'Oliy matematika',
  desc:'Istalgan funksiyani chizing, parametrlarni o‘zgartiring, urinma va hosilani kuzating.',
  params:[{key:'expr',label:'f(x) =',type:'text',value:'a*sin(b*x)+c'},{key:'preset',label:'Tayyor funksiyalar',type:'select',options:[['','— tanlang —'],['a*sin(b*x)+c','a·sin(bx)+c'],['a*x^2+b*x+c','ax²+bx+c'],['a*x^3-b*x','ax³−bx'],['a*exp(-b*x^2)','a·e^(−bx²)'],['a/(1+exp(-b*x))','sigmoid'],['ln(abs(x))*a','a·ln|x|'],['sqrt(abs(x))*a','a·√|x|']],value:''},
    {key:'a',label:'a',min:-5,max:5,step:.1,value:2},{key:'b',label:'b',min:-5,max:5,step:.1,value:1},{key:'c',label:'c',min:-5,max:5,step:.1,value:0},{key:'x0',label:'Nuqta x₀',min:-10,max:10,step:.05,value:1},{key:'zoom',label:'Ko‘lam (x oralig‘i ±)',min:2,max:20,step:1,value:8},{key:'deriv',label:'Hosila f′(x) ni ko‘rsatish',type:'check',value:true}],
  prepare(s){if(s._src!==s.expr){s._src=s.expr;try{s.f=compileExpr(s.expr);s.err=''}catch(e){s.f=null;s.err=e.message}}},
  val(s,x){if(!s.f)return NaN;try{return s.f({x,a:s.a,b:s.b,c:s.c})}catch{return NaN}},
  der(s,x){const h=1e-4;return (this.val(s,x+h)-this.val(s,x-h))/(2*h)},
  draw(g,s){this.prepare(s);bgGrid(g,false);const R=s.zoom,ys=[];for(let k=0;k<=400;k++){const v=this.val(s,-R+2*R*k/400);if(Number.isFinite(v))ys.push(v)}ys.sort((a,b)=>a-b);const lo=ys.length?ys[Math.floor(ys.length*.02)]:-5,hi=ys.length?ys[Math.ceil(ys.length*.98)-1]:5,pad=Math.max(1,(hi-lo)*.15);const ymin=Math.min(-1,lo-pad),ymax=Math.max(1,hi+pad);
    const X=x=>(x+R)/(2*R)*CW,Y=y=>CH-(y-ymin)/(ymax-ymin)*CH;
    g.strokeStyle='#b7c2de';g.lineWidth=2;g.beginPath();g.moveTo(0,Y(0));g.lineTo(CW,Y(0));g.moveTo(X(0),0);g.lineTo(X(0),CH);g.stroke();
    g.fillStyle='#6b7392';g.font='600 14px "Onest Hx",system-ui,sans-serif';const st=Math.pow(10,Math.floor(Math.log10(R/2)));for(let x=Math.ceil(-R/st)*st;x<=R;x+=st*(R/st>10?2:1))if(Math.abs(x)>1e-9)g.fillText(fmt(x,2),X(x)-8,Y(0)+18);
    const curve=(fn,color,w)=>{g.strokeStyle=color;g.lineWidth=w;g.beginPath();let pen=false,prev=NaN;for(let px=0;px<=CW;px+=2){const x=-R+2*R*px/CW,v=fn(x);if(!Number.isFinite(v)||Math.abs(v-prev)>(ymax-ymin)*2){pen=false;prev=v;continue}const yy=Y(v);if(!pen){g.moveTo(px,yy);pen=true}else g.lineTo(px,yy);prev=v}g.stroke()};
    if(s.deriv)curve(x=>this.der(s,x),'rgba(229,72,59,.75)',3);
    curve(x=>this.val(s,x),'#0b4fd8',4);
    const fx=this.val(s,s.x0),d=this.der(s,s.x0);
    if(Number.isFinite(fx)){g.save();g.setLineDash([8,8]);g.strokeStyle='#1f9d55';g.lineWidth=2.5;g.beginPath();g.moveTo(X(-R),Y(fx+d*(-R-s.x0)));g.lineTo(X(R),Y(fx+d*(R-s.x0)));g.stroke();g.restore();g.fillStyle='#f08c00';g.beginPath();g.arc(X(s.x0),Y(fx),9,0,Math.PI*2);g.fill()}
    hud(g,s.err?'Xato: '+s.err:'f(x) = '+s.expr,[['a, b, c',fmt(s.a,1)+', '+fmt(s.b,1)+', '+fmt(s.c,1)],['x₀',fmt(s.x0,2)],['f(x₀)',fmt(fx,4)],['f′(x₀) (urinma qiyaligi)',fmt(d,4)]],24,24);
    g.font='700 16px "Onest Hx",system-ui,sans-serif';g.fillStyle='#0b4fd8';g.fillText('— f(x)',CW-220,CH-24);if(s.deriv){g.fillStyle='#e5483b';g.fillText('— f′(x)',CW-140,CH-24)}
  },
  readings(s){this.prepare(s);return [['f(x₀)',fmt(this.val(s,s.x0),4)],['f′(x₀)',fmt(this.der(s,s.x0),4)],['Holat',s.err||'to‘g‘ri']]},
  columns:['f(x)','a','b','c','x₀','f(x₀)','f′(x₀)'],
  row(s){this.prepare(s);const v=this.val(s,s.x0);if(!Number.isFinite(v))return null;return [s.expr,s.a,s.b,s.c,s.x0,+v.toFixed(5),+this.der(s,s.x0).toFixed(5)]},
  chart:{x:4,y:5,xl:'x₀',yl:'f(x₀)'},
  theory:'<p>Hosila f′(x₀) — grafikka x₀ nuqtada o‘tkazilgan urinmaning qiyaligi. f′ = 0 nuqtalarda funksiya ekstremumga ega bo‘lishi mumkin, f′ &gt; 0 oraliqda o‘sadi. Ifodalarda: + − * / ^, sin, cos, tan, exp, ln, log, sqrt, abs, pi, e va a, b, c parametrlari.</p>',
  task:'<ol><li>f(x) = a·x³ − b·x uchun a = 1, b = 3: x₀ ni siljitib, f′(x₀) = 0 bo‘lgan nuqtalarni toping va jurnalga yozing.</li><li>Ularni analitik yechim x = ±1 bilan solishtiring.</li><li>a·sin(bx) da b ni o‘zgartirib, davr qanday o‘zgarishini tushuntiring.</li></ol>'
},
{
  id:'lens',icon:'🔍',title:'Yupqa linza: tasvir yasash',subject:'Fizika · Optika',
  desc:'Yig‘uvchi va sochuvchi linzada buyum masofasini o‘zgartirib, tasvir turi, masofasi va kattalashtirishni o‘rganing.',
  params:[{key:'kind',label:'Linza turi',type:'select',options:[['conv','Yig‘uvchi (+)'],['div','Sochuvchi (−)']],value:'conv'},{key:'F',label:'Fokus masofasi |F|',min:5,max:40,step:1,value:15,unit:'sm'},{key:'d',label:'Buyum masofasi d',min:4,max:90,step:.5,value:35,unit:'sm'},{key:'h',label:'Buyum balandligi h',min:1,max:8,step:.5,value:4,unit:'sm'}],
  calc(s){const f=s.kind==='div'?-s.F:s.F,inv=1/f-1/s.d,di=Math.abs(inv)<1e-9?Infinity:1/inv,G=Number.isFinite(di)?-di/s.d:Infinity;return {f,di,G,H:G*s.h,D:100/f}},
  kindText(c){if(!Number.isFinite(c.di))return 'tasvir yo‘q (buyum fokusda)';return (c.di>0?'haqiqiy':'mavhum')+', '+(c.G<0?'teskari':'to‘g‘ri')+', '+(Math.abs(c.G)>1.001?'kattalashgan':(Math.abs(c.G)<.999?'kichiklashgan':'teng'))},
  draw(g,s){bgGrid(g);const c=this.calc(s),cx=640,cy=380,kx=6.2,ky=14;
    const X=cm=>cx+cm*kx,Y=cm=>cy-cm*ky;
    g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=2;g.beginPath();g.moveTo(0,cy);g.lineTo(CW,cy);g.stroke();
    // lens
    g.save();g.strokeStyle='#7fb2ff';g.fillStyle='rgba(127,178,255,.18)';g.lineWidth=3;g.beginPath();
    if(s.kind==='conv'){g.ellipse(cx,cy,16,250,0,0,Math.PI*2)}else{g.moveTo(cx-18,cy-250);g.lineTo(cx+18,cy-250);g.quadraticCurveTo(cx+4,cy,cx+18,cy+250);g.lineTo(cx-18,cy+250);g.quadraticCurveTo(cx-4,cy,cx-18,cy-250)}
    g.fill();g.stroke();g.restore();
    // focal marks
    g.fillStyle='#ffb627';g.font='700 18px "Onest Hx",system-ui,sans-serif';
    for(const m of [-2,-1,1,2]){const x=X(m*s.F);if(x<0||x>CW)continue;g.beginPath();g.arc(x,cy,6,0,Math.PI*2);g.fill();g.fillText((Math.abs(m)===2?'2F':'F')+(m>0?'′':''),x-12,cy+30)}
    const arrow=(x,top,col,dashed)=>{g.save();g.strokeStyle=col;g.fillStyle=col;g.lineWidth=5;if(dashed)g.setLineDash([10,8]);g.beginPath();g.moveTo(x,cy);g.lineTo(x,top);g.stroke();g.setLineDash([]);const dir=top<cy?1:-1;g.beginPath();g.moveTo(x,top);g.lineTo(x-11,top+dir*20);g.lineTo(x+11,top+dir*20);g.closePath();g.fill();g.restore()};
    const xo=X(-s.d),yo=Y(s.h);
    g.save();g.beginPath();g.rect(0,0,CW,CH);g.clip();
    const ray=(pts,col,dashed)=>{g.save();g.strokeStyle=col;g.lineWidth=2.5;if(dashed){g.setLineDash([8,8]);g.globalAlpha=.75}g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(const q of pts.slice(1))g.lineTo(q[0],q[1]);g.stroke();g.restore()};
    const fpx=c.f*kx,ext=(x0,y0,dx,dy,toX)=>[toX,y0+dy/dx*(toX-x0)];
    // 1) parallel ray → through F′ (real or virtual)
    {const d=[Math.sign(c.f)*fpx,Math.sign(c.f)*(cy-yo)];ray([[xo,yo],[cx,yo],ext(cx,yo,d[0],d[1],CW)],'#ff8f7a');if(c.di<0)ray([[cx,yo],ext(cx,yo,d[0],d[1],X(c.di))],'#ff8f7a',true)}
    // 2) through the optical centre
    {const dx=cx-xo,dy=cy-yo;ray([[xo,yo],ext(xo,yo,dx,dy,CW)],'#6fe3a2');if(c.di<0)ray([[cx,cy],ext(xo,yo,dx,dy,X(c.di))],'#6fe3a2',true)}
    // 3) towards front focus → parallel after the lens
    {const fx=cx-fpx;if(Math.abs(fx-xo)>1){const y3=yo+(cy-yo)/(fx-xo)*(cx-xo);ray([[xo,yo],[cx,y3],[CW,y3]],'#d0b3ff');if(c.di<0)ray([[cx,y3],[X(c.di),y3]],'#d0b3ff',true)}}
    g.restore();
    arrow(xo,yo,'#ffd166',false);g.fillStyle='#ffd166';g.fillText('Buyum',xo-30,cy+56);
    if(Number.isFinite(c.di)&&Math.abs(c.di)<400){const xi=X(c.di),yi=Y(c.H);if(xi>-50&&xi<CW+50){arrow(xi,Math.max(-40,Math.min(CH+40,yi)),c.di>0?'#7fe0ff':'#7fe0ff',c.di<0);g.fillStyle='#7fe0ff';g.fillText(c.di>0?'Tasvir':'Mavhum tasvir',xi-40,cy+(c.H>0?56:-14))}}
    hud(g,'Linza',[['d',fmt(s.d,1),'sm'],['F',fmt(c.f,1),'sm'],['d′',Number.isFinite(c.di)?fmt(c.di,1):'∞','sm'],['Γ = −d′/d',Number.isFinite(c.G)?fmt(c.G,2):'∞',''],['Optik kuch D',fmt(c.D,2),'dptr']],24,24);
    g.fillStyle='#c7cdea';g.font='600 17px "Onest Hx",system-ui,sans-serif';g.fillText('Tasvir: '+this.kindText(c),24,CH-24);
  },
  readings(s){const c=this.calc(s);return [['d′ (tasvir)',Number.isFinite(c.di)?fmt(c.di,2):'∞','sm'],['Kattalashtirish Γ',Number.isFinite(c.G)?fmt(c.G,3):'∞',''],['Tasvir turi',this.kindText(c),''],['Optik kuch',fmt(c.D,2),'dptr']]},
  columns:['Linza','F, sm','d, sm','d′, sm','1/d, 1/sm','1/d′, 1/sm','Γ'],
  row(s){const c=this.calc(s);if(!Number.isFinite(c.di))return null;return [s.kind==='div'?'sochuvchi':'yig‘uvchi',+c.f.toFixed(2),s.d,+c.di.toFixed(3),+(1/s.d).toFixed(5),+(1/c.di).toFixed(5),+c.G.toFixed(4)]},
  chart:{x:4,y:5,xl:'1/d, 1/sm',yl:'1/d′, 1/sm'},
  theory:'<p><b>Yupqa linza formulasi:</b> 1/F = 1/d + 1/d′, kattalashtirish Γ = −d′/d, optik kuch D = 1/F (F metrda, dioptriya). Yig‘uvchi linzada F &gt; 0, sochuvchida F &lt; 0. d′ &gt; 0 — haqiqiy (ekranda ko‘rinadi), d′ &lt; 0 — mavhum tasvir. Tasvir uchta asosiy nur bilan yasaladi: optik o‘qqa parallel nur, optik markazdan o‘tuvchi nur va fokusdan o‘tuvchi nur.</p>',
  task:'<ol><li>Yig‘uvchi linza, F = 15 sm: d = 60, 45, 30, 22, 18 sm uchun o‘lchov yozing. d = 2F da Γ = −1 ekanini tekshiring.</li><li>1/d′ (1/d) grafigi qiyaligi −1 bo‘lgan to‘g‘ri chiziq ekanini ko‘rsating; Y o‘qi bilan kesishishidan F ni toping.</li><li>d &lt; F bo‘lganda tasvir qanday bo‘ladi? Lupa qanday ishlashini tushuntiring.</li><li>Sochuvchi linzada tajribani takrorlang: tasvir doim qanday?</li></ol>',
  needsWarmup:'Buyum fokusda — tasvir cheksizlikda, d ni o‘zgartiring'
},
{
  id:'resonance',icon:'〰',title:'Majburiy tebranish va rezonans',subject:'Fizika · Tebranishlar',
  desc:'Prujinali mayatnikka davriy kuch ta’sir etganda amplitudaning chastotaga bog‘liqligini — rezonans egri chizig‘ini oling.',
  params:[{key:'m',label:'Yuk massasi m',min:.1,max:2,step:.05,value:.5,unit:'kg'},{key:'k',label:'Prujina bikrligi k',min:5,max:200,step:1,value:50,unit:'N/m'},{key:'b',label:'Qarshilik koeffitsiyenti b',min:.1,max:5,step:.05,value:.6,unit:'kg/s'},{key:'F0',label:'Majburlovchi kuch F₀',min:.2,max:5,step:.1,value:1,unit:'N'},{key:'nu',label:'Kuch chastotasi ν',min:.1,max:3,step:.01,value:1,unit:'Hz'}],
  theoryA(s,nu=s.nu){const w0=Math.sqrt(s.k/s.m),W=2*Math.PI*nu;return (s.F0/s.m)/Math.sqrt((w0*w0-W*W)**2+(s.b*W/s.m)**2)},
  steady(s){const w0=Math.sqrt(s.k/s.m),W=2*Math.PI*s.nu,A=this.theoryA(s),ph=Math.atan2(s.b*W/s.m,w0*w0-W*W);s.x=A*Math.cos(W*s.t-ph);s.v=-A*W*Math.sin(W*s.t-ph);s.changedAt=s.t;s.peak=0;s.peakWin=[]},
  reset(s){s.t=0;s.x=0;s.v=0;s.changedAt=0;s.hist=[];s.peak=0;s.peakWin=[];s.fromRest=true},
  onParam(s){s.fromRest=false;this.steady(s)},
  step(s,dt){const W=2*Math.PI*s.nu,h=dt/10;for(let i=0;i<10;i++){const f=(t,x,v)=>[v,(s.F0*Math.cos(W*t)-s.b*v-s.k*x)/s.m];const [a1,b1]=f(s.t,s.x,s.v),[a2,b2]=f(s.t+h/2,s.x+a1*h/2,s.v+b1*h/2),[a3,b3]=f(s.t+h/2,s.x+a2*h/2,s.v+b2*h/2),[a4,b4]=f(s.t+h,s.x+a3*h,s.v+b3*h);s.x+=h/6*(a1+2*a2+2*a3+a4);s.v+=h/6*(b1+2*b2+2*b3+b4);s.t+=h}
    s.hist.push([s.t,s.x]);while(s.hist.length&&s.t-s.hist[0][0]>6)s.hist.shift();
    const T=1/s.nu;s.peakWin.push([s.t,Math.abs(s.x)]);while(s.peakWin.length&&s.t-s.peakWin[0][0]>T*1.05)s.peakWin.shift();s.peak=Math.max(...s.peakWin.map(p=>p[1]));},
  // After a release from rest the transient decays as e^(−bt/2m); measure only once it is below ~2 % (4 time constants).
  measured(s){const settle=s.fromRest?Math.max(1.2/s.nu,8*s.m/s.b):1.2/s.nu;return s.t-s.changedAt>settle?s.peak:NaN},
  draw(g,s){bgGrid(g);const nu0=Math.sqrt(s.k/s.m)/(2*Math.PI),Ares=this.theoryA(s,nu0*Math.sqrt(Math.max(.05,1-(s.b*s.b)/(2*s.k*s.m)))),scale=190/Math.max(Ares,1e-3);
    // spring + mass
    const ax=250,ay=60,y0=380,y=y0+Math.max(-220,Math.min(220,s.x*scale));
    g.fillStyle='#2a3366';g.fillRect(ax-90,ay-16,180,16);
    g.strokeStyle='#cfd6f5';g.lineWidth=3;g.beginPath();g.moveTo(ax,ay);const n=14,top=ay+20,bot=y-40;g.lineTo(ax,top);for(let i=0;i<n;i++){g.lineTo(ax+(i%2?-26:26),top+(bot-top)*(i+.5)/n)}g.lineTo(ax,bot);g.lineTo(ax,y-30);g.stroke();
    const grd=g.createLinearGradient(ax-50,y-30,ax+50,y+30);grd.addColorStop(0,'#ffd166');grd.addColorStop(1,'#f08c00');g.fillStyle=grd;roundRect(g,ax-50,y-30,100,60,10);g.fill();
    g.fillStyle='#0f1537';g.font='800 18px "Onest Hx",system-ui,sans-serif';g.fillText(fmt(s.m,2)+' kg',ax-32,y+6);
    const fpx=Math.cos(2*Math.PI*s.nu*s.t)*60;g.strokeStyle='#ff8f7a';g.lineWidth=4;g.beginPath();g.moveTo(ax+90,y);g.lineTo(ax+90,y+fpx);g.stroke();g.fillStyle='#ff8f7a';g.beginPath();g.moveTo(ax+90,y+fpx+(fpx>0?14:-14));g.lineTo(ax+82,y+fpx);g.lineTo(ax+98,y+fpx);g.closePath();g.fill();g.font='700 16px "Onest Hx",system-ui,sans-serif';g.fillText('F(t)',ax+104,y+6);
    g.setLineDash([6,8]);g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=1.5;g.beginPath();g.moveTo(ax-120,y0);g.lineTo(ax+120,y0);g.stroke();g.setLineDash([]);
    // x(t) plot
    const px=520,pw=730,py=40,ph=270;g.fillStyle='rgba(255,255,255,.04)';g.fillRect(px,py,pw,ph);g.strokeStyle='rgba(255,255,255,.25)';g.beginPath();g.moveTo(px,py+ph/2);g.lineTo(px+pw,py+ph/2);g.stroke();
    g.fillStyle='#aab3d6';g.font='600 15px "Onest Hx",system-ui,sans-serif';g.fillText('x(t) — oxirgi 6 s',px+10,py+20);
    g.strokeStyle='#7fe0ff';g.lineWidth=2.5;g.beginPath();s.hist.forEach(([t,x],i)=>{const X=px+pw-(s.t-t)/6*pw,Y=py+ph/2-Math.max(-1.1,Math.min(1.1,x*scale/190))*ph/2.3;i?g.lineTo(X,Y):g.moveTo(X,Y)});g.stroke();
    // resonance curve
    const rx=520,rw=730,ry=340,rh=330,numax=3;g.fillStyle='rgba(255,255,255,.04)';g.fillRect(rx,ry,rw,rh);
    const amax=Ares*1.15,RX=nu=>rx+nu/numax*rw,RY=a=>ry+rh-12-a/amax*(rh-40);
    g.strokeStyle='#ffb627';g.lineWidth=3;g.beginPath();for(let i=0;i<=240;i++){const nu=numax*i/240,a=this.theoryA(s,Math.max(.001,nu));i?g.lineTo(RX(nu),RY(Math.min(a,amax))):g.moveTo(RX(nu),RY(Math.min(a,amax)))}g.stroke();
    g.setLineDash([5,6]);g.strokeStyle='rgba(255,182,39,.6)';g.beginPath();g.moveTo(RX(nu0),ry+10);g.lineTo(RX(nu0),ry+rh-12);g.stroke();g.setLineDash([]);
    g.fillStyle='#ffb627';g.fillText('ν₀ = '+fmt(nu0,3)+' Hz',Math.min(RX(nu0)+8,rx+rw-140),ry+28);
    g.fillStyle='#aab3d6';g.fillText('Rezonans egri chizig‘i A(ν)',rx+10,ry+20);g.fillText('ν, Hz →',rx+rw-70,ry+rh-18);
    const am=this.measured(s);g.fillStyle='#ff8f7a';g.beginPath();g.arc(RX(s.nu),RY(Math.min(Number.isFinite(am)?am:this.theoryA(s),amax)),9,0,Math.PI*2);g.fill();
    hud(g,'Tebranish',[['ν₀ = √(k/m)/2π',fmt(nu0,3),'Hz'],['ν / ν₀',fmt(s.nu/nu0,3),''],['A o‘lchangan',Number.isFinite(am)?fmt(am*100,2):'…','sm'],['A nazariy',fmt(this.theoryA(s)*100,2),'sm']],24,CH-200);
  },
  readings(s){const nu0=Math.sqrt(s.k/s.m)/(2*Math.PI),am=this.measured(s);return [['Xususiy chastota ν₀',fmt(nu0,3),'Hz'],['ν / ν₀',fmt(s.nu/nu0,3),''],['A (o‘lchangan)',Number.isFinite(am)?fmt(am*100,2):'kuting…','sm'],['A (nazariy)',fmt(this.theoryA(s)*100,2),'sm'],['Asillik Q ≈ √(km)/b',fmt(Math.sqrt(s.k*s.m)/s.b,1),'']]},
  columns:['ν, Hz','ν/ν₀','A o‘lch., sm','A naz., sm','b, kg/s'],
  row(s){const am=this.measured(s);if(!Number.isFinite(am))return null;const nu0=Math.sqrt(s.k/s.m)/(2*Math.PI);return [s.nu,+(s.nu/nu0).toFixed(3),+(am*100).toFixed(3),+(this.theoryA(s)*100).toFixed(3),s.b]},
  chart:{x:0,y:2,xl:'ν, Hz',yl:'A, sm'},
  theory:'<p>Tenglama: m·ẍ + b·ẋ + k·x = F₀·cos(Ωt). Barqaror rejimda amplituda A(Ω) = (F₀/m) / √((ω₀² − Ω²)² + (bΩ/m)²), bu yerda ω₀ = √(k/m). Kuch chastotasi xususiy chastotaga yaqinlashganda amplituda keskin ortadi — <b>rezonans</b>. Qarshilik qancha kichik bo‘lsa (asillik Q katta), rezonans cho‘qqisi shuncha baland va tor. «Qayta boshlash» yukni tinch holatdan qo‘yib yuboradi — o‘tish jarayonini ham ko‘rasiz.</p>',
  task:'<ol><li>m = 0.5 kg, k = 50 N/m, b = 0.6 kg/s: ν₀ ni hisoblang. ν ni 0.4 Hz dan 2.4 Hz gacha 0.1 Hz qadam bilan o‘zgartirib, amplitudani jurnalga yozing (rezonans atrofida qadamni 0.02 Hz ga kamaytiring).</li><li>A(ν) grafigidan rezonans chastotasini toping va ν₀ bilan solishtiring.</li><li>b = 1.5 kg/s da takrorlang: cho‘qqi balandligi va kengligi qanday o‘zgardi? Muhandislikda (ko‘prik, dvigatel, bino) rezonansning xavfini tushuntiring.</li></ol>',
  needsWarmup:'Barqaror tebranishni kuting (1–2 davr)'
}];

// ---------- chart ----------
function drawChart(cv,rows,ch){
  const g=cv.getContext('2d'),w=cv.width,h=cv.height,dark=document.documentElement.dataset.theme==='dark';
  g.clearRect(0,0,w,h);g.fillStyle=dark?'#141b3d':'#fff';g.fillRect(0,0,w,h);
  const pts=rows.map(r=>[Number(r[ch.x]),Number(r[ch.y])]).filter(p=>p.every(Number.isFinite)).sort((a,b)=>a[0]-b[0]);
  const L=64,B=46,T=18,Rm=18;g.strokeStyle=dark?'#3a4580':'#d6dcef';g.lineWidth=1.5;g.strokeRect(L,T,w-L-Rm,h-T-B);
  g.fillStyle=dark?'#c7cdea':'#58607e';g.font='600 14px "Onest Hx",system-ui,sans-serif';g.fillText(ch.yl,8,T+12);g.fillText(ch.xl,w-Rm-60,h-10);
  if(!pts.length){g.fillText('Jurnalga o‘lchov yozing — grafik shu yerda chiziladi',L+20,h/2);return}
  let x0=Math.min(...pts.map(p=>p[0])),x1=Math.max(...pts.map(p=>p[0])),y0=Math.min(0,...pts.map(p=>p[1])),y1=Math.max(...pts.map(p=>p[1]));if(x0===x1){x0-=1;x1+=1}if(y0===y1){y1+=1}
  const X=x=>L+(x-x0)/(x1-x0)*(w-L-Rm-20)+10,Y=y=>h-B-(y-y0)/(y1-y0)*(h-T-B-14);
  for(let k=0;k<=4;k++){const yv=y0+(y1-y0)*k/4,xv=x0+(x1-x0)*k/4;g.fillText(fmt(yv,2),6,Y(yv)+5);g.fillText(fmt(xv,2),X(xv)-12,h-B+20)}
  if(pts.length>=2){const n=pts.length,sx=pts.reduce((a,p)=>a+p[0],0),sy=pts.reduce((a,p)=>a+p[1],0),sxx=pts.reduce((a,p)=>a+p[0]*p[0],0),sxy=pts.reduce((a,p)=>a+p[0]*p[1],0),den=n*sxx-sx*sx;
    if(Math.abs(den)>1e-12){const k=(n*sxy-sx*sy)/den,b=(sy-k*sx)/n;g.save();g.setLineDash([6,6]);g.strokeStyle='#e5483b';g.lineWidth=2;g.beginPath();g.moveTo(X(x0),Y(k*x0+b));g.lineTo(X(x1),Y(k*x1+b));g.stroke();g.restore();g.fillStyle='#e5483b';g.fillText('Chiziqli moslik: y = '+fmt(k,4)+'·x '+(b<0?'− ':'+ ')+fmt(Math.abs(b),4),L+12,T+20)}}
  g.strokeStyle='#0b4fd8';g.lineWidth=2.5;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1])));g.stroke();
  g.fillStyle='#0b4fd8';for(const p of pts){g.beginPath();g.arc(X(p[0]),Y(p[1]),5,0,Math.PI*2);g.fill()}
}

// ---------- mount ----------
export function mountVirtualLab(root,{toast=()=>{},canShare=()=>false,share=null,stopShare=null,isSharing=()=>false,userName=()=>''}={}){
  let lab=null,state=null,raf=0,last=0,journal=[],canvas=null,chart=null;
  const jKey=id=>'m2-lab-journal:'+id;
  function catalog(){
    stop();lab=null;
    root.innerHTML='<div class="vl-cat">'+LABS.map(l=>'<button type="button" class="vl-card" data-lab="'+l.id+'"><span class="vl-ico" aria-hidden="true">'+l.icon+'</span><span class="vl-sub">'+esc(l.subject)+'</span><b>'+esc(l.title)+'</b><small>'+esc(l.desc)+'</small><span class="vl-go">Tajribani boshlash →</span></button>').join('')+'</div><p class="vl-note">Har bir tajribada parametrlarni o‘zgartiring, o‘lchovlarni jurnalga yozing, grafik va chiziqli moslik avtomatik quriladi. Natijani CSV yoki PDF hisobot sifatida saqlang. O‘qituvchi jonli darsda tajribani bir tugma bilan talabalarga ko‘rsatadi.</p>';
    root.querySelectorAll('[data-lab]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.lab)));
  }
  function control(p){
    const v=state[p.key];
    if(p.type==='select')return '<label class="vl-field"><span>'+esc(p.label)+'</span><select data-k="'+p.key+'">'+p.options.map(([o,l])=>'<option value="'+esc(o)+'"'+(String(o)===String(v)?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>';
    if(p.type==='text')return '<label class="vl-field"><span>'+esc(p.label)+'</span><input type="text" data-k="'+p.key+'" value="'+esc(v)+'" spellcheck="false" autocomplete="off"></label>';
    if(p.type==='check')return '<label class="vl-check"><input type="checkbox" data-k="'+p.key+'"'+(v?' checked':'')+'> <span>'+esc(p.label)+'</span></label>';
    return '<label class="vl-field"><span>'+esc(p.label)+' <output data-o="'+p.key+'">'+fmt(v,3)+(p.unit?' '+p.unit:'')+'</output></span><input type="range" data-k="'+p.key+'" min="'+p.min+'" max="'+p.max+'" step="'+p.step+'" value="'+v+'"></label>';
  }
  function open(id){
    lab=LABS.find(l=>l.id===id);if(!lab)return catalog();
    state={};for(const p of lab.params)state[p.key]=p.value;lab.reset?.(state);
    try{journal=JSON.parse(localStorage.getItem(jKey(id))||'[]')}catch{journal=[]}
    root.innerHTML='<div class="vl"><div class="vl-head"><button type="button" class="vl-back">← Laboratoriyalar</button><div class="vl-title"><span class="vl-sub">'+esc(lab.subject)+'</span><h2>'+lab.icon+' '+esc(lab.title)+'</h2></div><div class="vl-head-acts"><button type="button" class="vl-share hidden"></button><button type="button" class="vl-full" title="To‘liq ekran">⛶</button></div></div>'+
      '<div class="vl-main"><div class="vl-sim"><canvas width="'+CW+'" height="'+CH+'" aria-label="Simulyatsiya"></canvas>'+(lab.actions?'<div class="vl-actions">'+lab.actions.map(([a,l])=>'<button type="button" data-act="'+a+'">'+l+'</button>').join('')+'</div>':'')+'</div>'+
      '<aside class="vl-panel"><h3>Parametrlar</h3>'+lab.params.map(control).join('')+'<button type="button" class="vl-reset">↺ Qayta boshlash</button><h3>O‘lchovlar</h3><div class="vl-readings"></div><button type="button" class="vl-record">＋ O‘lchashni jurnalga yozish</button></aside></div>'+
      '<div class="vl-lower"><section class="vl-journal"><header><h3>Laboratoriya jurnali <small class="vl-count"></small></h3><div><button type="button" data-j="csv">CSV</button><button type="button" data-j="pdf">PDF hisobot</button><button type="button" data-j="undo">Oxirgisini o‘chirish</button><button type="button" data-j="clear">Tozalash</button></div></header><div class="vl-table"></div><canvas class="vl-chart" width="900" height="340"></canvas></section>'+
      '<section class="vl-theory"><h3>Nazariya</h3>'+lab.theory+'<h3>Topshiriq</h3>'+lab.task+'</section></div></div>';
    canvas=root.querySelector('.vl-sim canvas');chart=root.querySelector('.vl-chart');
    root.querySelector('.vl-back').onclick=()=>{if(isSharing())stopShare?.();catalog()};
    root.querySelector('.vl-full').onclick=()=>{const el=root.querySelector('.vl-sim');(el.requestFullscreen?el.requestFullscreen():Promise.reject()).catch(()=>{})};
    root.querySelector('.vl-reset').onclick=()=>{lab.reset?.(state);toast('Tajriba qayta boshlandi')};
    root.querySelector('.vl-record').onclick=record;
    root.querySelector('.vl-share').onclick=async()=>{if(isSharing())await stopShare?.();else await share?.(canvas,'Virtual laboratoriya');syncShare()};
    root.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>lab.action?.(state,b.dataset.act)));
    root.querySelectorAll('[data-k]').forEach(inp=>inp.addEventListener(inp.type==='text'?'input':'input',()=>{
      const p=lab.params.find(x=>x.key===inp.dataset.k);let v=inp.type==='checkbox'?inp.checked:(inp.type==='range'?Number(inp.value):inp.value);
      if(p.key==='preset'){if(v){state.expr=v;const t=root.querySelector('[data-k=expr]');if(t)t.value=v}state.preset='';inp.value='';return}
      state[p.key]=v;const o=root.querySelector('[data-o="'+p.key+'"]');if(o)o.textContent=fmt(v,3)+(p.unit?' '+p.unit:'');
      if(lab.onParam)lab.onParam(state,p.key);else if(lab.id==='pendulum'||(lab.id==='rc'&&(p.key==='mode')))lab.reset(state);
    }));
    root.querySelectorAll('[data-j]').forEach(b=>b.addEventListener('click',()=>journalAction(b.dataset.j)));
    renderJournal();syncShare();start();
  }
  function record(){
    const row=lab.row(state);if(!row){toast(lab.needsWarmup||'Hali o‘lchov yo‘q');return}
    journal.push(row);try{localStorage.setItem(jKey(lab.id),JSON.stringify(journal.slice(-200)))}catch{}
    renderJournal();toast('Jurnalga yozildi: '+journal.length+'-o‘lchov');
  }
  function renderJournal(){
    const t=root.querySelector('.vl-table');if(!t)return;
    root.querySelector('.vl-count').textContent=journal.length?'· '+journal.length+' ta':'';
    t.innerHTML=journal.length?'<table><thead><tr><th>№</th>'+lab.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+journal.map((r,i)=>'<tr><td>'+(i+1)+'</td>'+r.map(v=>'<td>'+esc(typeof v==='number'?fmt(v,4):v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p class="vl-empty">Hali o‘lchov yozilmagan. Parametrlarni sozlab, «O‘lchashni jurnalga yozish» tugmasini bosing.</p>';
    drawChart(chart,journal,lab.chart);
  }
  async function journalAction(a){
    if(a==='clear'){if(journal.length&&await askConfirmation('Jurnal tozalansinmi?')){journal=[];try{localStorage.removeItem(jKey(lab.id))}catch{}renderJournal()}}
    if(a==='undo'){journal.pop();try{localStorage.setItem(jKey(lab.id),JSON.stringify(journal))}catch{}renderJournal()}
    if(a==='csv'){if(!journal.length)return toast('Jurnal bo‘sh');const csv='﻿'+['№',...lab.columns].join(';')+'\n'+journal.map((r,i)=>[i+1,...r].join(';')).join('\n');const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));l.download='lab-'+lab.id+'.csv';l.click();setTimeout(()=>URL.revokeObjectURL(l.href),2000)}
    if(a==='pdf')report();
  }
  function report(){
    if(!journal.length)return toast('Avval jurnalga o‘lchov yozing');
    const div=document.createElement('div');div.className='vl-print';
    const d=new Date();div.innerHTML='<h1>Laboratoriya ishi: '+esc(lab.title)+'</h1><p>'+esc(lab.subject)+' · '+esc(userName())+' · '+d.toLocaleDateString('uz-UZ')+' '+d.toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})+'</p><h2>Nazariya</h2>'+lab.theory+'<h2>Topshiriq</h2>'+lab.task+'<h2>O‘lchov natijalari</h2>'+root.querySelector('.vl-table').innerHTML+'<h2>Grafik</h2><img alt="Grafik" src="'+chart.toDataURL('image/png')+'"><h2>Simulyatsiya holati</h2><img alt="Simulyatsiya" src="'+canvas.toDataURL('image/png')+'"><h2>Xulosa</h2><div class="vl-print-lines"></div>';
    document.body.appendChild(div);document.documentElement.classList.add('vl-printing');
    const done=()=>{document.documentElement.classList.remove('vl-printing');div.remove();window.removeEventListener('afterprint',done)};
    window.addEventListener('afterprint',done);setTimeout(()=>{window.print();setTimeout(done,1500)},150);
  }
  function syncShare(){const b=root.querySelector('.vl-share');if(!b)return;const ok=canShare()&&Boolean(share);b.classList.toggle('hidden',!ok);const on=isSharing();b.classList.toggle('on',on);b.textContent=on?'● Talabalarga ko‘rsatilmoqda · to‘xtatish':'▶ Darsga ulashish'}
  function readings(){const r=root.querySelector('.vl-readings');if(!r)return;const rows=lab.readings(state);const html=rows.map(([l,v,u])=>'<div><span>'+esc(l)+'</span><b>'+esc(v)+(u?' <small>'+esc(u)+'</small>':'')+'</b></div>').join('');if(r.innerHTML!==html)r.innerHTML=html}
  let tick=0;
  function loop(ts){
    raf=0;if(!lab||!canvas?.isConnected)return;
    const visible=document.documentElement.dataset.page==='lab'||isSharing();
    const dt=last?Math.min(.05,(ts-last)/1000):0;last=ts;
    if(visible){lab.step?.(state,dt);const g=canvas.getContext('2d');lab.draw(g,state);if(++tick%10===0){readings();syncShare()}}
    raf=requestAnimationFrame(loop);
  }
  function start(){stop();last=0;raf=requestAnimationFrame(loop);readings()}
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0}
  catalog();
  return {catalog,open,refresh:()=>{if(lab){syncShare();if(raf===0)start()}}};
}
export {compileExpr,LABS};
