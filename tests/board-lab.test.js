import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileExpr,LABS} from '../public/virtual-lab.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const lab=id=>LABS.find(l=>l.id===id);
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps*Math.max(1,Math.abs(b)),a+' ≈ '+b);

test('function lab parser evaluates safely without eval',()=>{
 near(compileExpr('x^2-3x+2')({x:1}),0);
 near(compileExpr('ax^3-bx')({x:2,a:1,b:3}),2);
 near(compileExpr('sin(pi/2)+ln(e)')({x:0}),2);
 near(compileExpr('2(x+1)*|x-3|')({x:1}),8);
 assert.throws(()=>compileExpr('alert(1)'));
 assert.throws(()=>compileExpr('constructor'));
});

test('Ohm lab: series and parallel resistance',()=>{
 const o=lab('ohm');
 near(o.calc({U:12,R1:20,R2:30,mode:'series'}).I,0.24);
 near(o.calc({U:12,R1:20,R2:30,mode:'parallel'}).R,12);
});

test('thin lens lab follows 1/F = 1/d + 1/d′ and Γ = −d′/d',()=>{
 const l=lab('lens');
 const c=l.calc({kind:'conv',F:15,d:35,h:4});near(c.di,26.25);near(c.G,-0.75);
 const two=l.calc({kind:'conv',F:15,d:30,h:4});near(two.di,30);near(two.G,-1);
 const mag=l.calc({kind:'conv',F:15,d:10,h:4});assert.ok(mag.di<0&&mag.G>1,'object inside F gives a virtual, upright, magnified image');
 const dv=l.calc({kind:'div',F:15,d:30,h:4});assert.ok(dv.di<0&&dv.G>0&&dv.G<1,'diverging lens: virtual, upright, reduced');
 assert.equal(l.row({kind:'conv',F:15,d:15,h:4}),null,'object at focus has no finite image');
});

test('resonance lab: steady-state amplitude peaks near ν₀ and the simulation converges to theory',()=>{
 const r=lab('resonance'),s={m:.5,k:50,b:.6,F0:1,nu:1};
 const nu0=Math.sqrt(s.k/s.m)/(2*Math.PI);
 assert.ok(r.theoryA(s,nu0)>r.theoryA(s,nu0*.7)&&r.theoryA(s,nu0)>r.theoryA(s,nu0*1.3));
 r.reset(s);for(let i=0;i<60*12;i++)r.step(s,1/60);
 near(r.measured(s),r.theoryA(s),0.03);
});

test('whiteboard: PDF via lazily loaded pdf.js with blob worker, coordinate background, sized to fit',()=>{
 const wb=read('public/whiteboard.js');
 assert.ok(wb.includes("lib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([src],{type:'text/javascript'}))"));
 assert.ok(wb.includes("['axes','Koordinata']"));
 assert.ok(wb.includes('accept="image/*,application/pdf,.pdf"'));
 assert.ok(wb.includes('function fit(){'));
});

test('board and lab are shared into the live lesson as the screen stream; students see teacher camera PiP',()=>{
 const mc=read('frontend/media-client.js'),app=read('public/app.js'),html=read('public/index.html'),sw=read('public/sw.js');
 assert.ok(mc.includes('async shareCanvas(canvas,{fps=15,label=\'Elektron doska\'}={}){'));
 assert.ok(mc.includes("appData:{mediaTag:'screen',role:this.user.role,quality:'1080p',source,label}"));
 assert.ok(app.includes("let pip=$('#hxStagePip');"));
 assert.ok(app.includes('function syncFloatCam(){'));
 for(const t of ['id="callBoard"','id="callLab"','data-page="lab"','id="labRoot"'])assert.ok(html.includes(t),t);
 for(const f of ["'/whiteboard.js'","'/virtual-lab.js'"])assert.ok(sw.includes(f),f);
});
