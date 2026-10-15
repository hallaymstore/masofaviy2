import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Readable} from 'node:stream';
import express from 'express';
import mongoose from 'mongoose';
import {installUnits} from '../units.js';
import {fakeModel} from './helpers/fake-models.js';
import {UNIT_PRESETS} from '../units-presets.js';
import {effectiveUnitRole,unitCan,canTransition,validateServiceFields,validateAnswers,requestNumber,dueDate,cleanModules,safeAppUrl} from '../units-rules.js';

const oid=()=>new mongoose.Types.ObjectId();
async function setup(){
  const F={_id:oid(),type:'faculty',name:'Axborot texnologiyalari fakulteti',active:true},D={_id:oid(),type:'department',name:'Dasturiy injiniring kafedrasi',parentId:F._id,active:true},G={_id:oid(),type:'group',name:'DI-01',parentId:D._id,active:true};
  const Structure=fakeModel();Structure.rows.push(F,D,G);
  const User=fakeModel({active:true});
  const mk=(login,role,extra={})=>{const u={_id:oid(),login,fullName:login.replace(/\./g,' '),role,active:true,...extra};User.rows.push(u);return u};
  const users={admin:mk('admin','admin'),dean:mk('dekan.f','dean',{facultyId:F._id}),teacher:mk('oqituvchi.t','teacher',{departmentId:D._id,facultyId:F._id}),registrar:mk('registrator.x','staff'),head:mk('rahbar.r','staff'),student:mk('talaba.a','student',{groupId:G._id}),student2:mk('talaba.b','student',{groupId:G._id})};
  const models={OrgUnit:fakeModel({active:true,requestSeq:0,order:100,apps:[]}),UnitMember:fakeModel({active:true,role:'staff'}),UnitPost:fakeModel({audience:'public',pinned:false,requireAck:false,acks:[]}),UnitDoc:fakeModel({visibility:'public',category:'boshqa'}),UnitService:fakeModel({active:true,audience:'all',slaDays:5}),UnitRequest:fakeModel({status:'new',history:[]}),UnitTask:fakeModel({status:'todo',priority:'normal'}),UnitEvent:fakeModel({audience:'public',registration:false,capacity:0,registrants:[]})};
  const blobs=new Map();
  const storage={ready:()=>true,upload:(name)=>{const id=oid(),stream=new PassThrough(),chunks=[];stream.on('data',c=>chunks.push(c));stream.on('end',()=>blobs.set(String(id),Buffer.concat(chunks)));return {id,stream}},download:id=>Readable.from([blobs.get(String(id))||Buffer.alloc(0)]),remove:id=>blobs.delete(String(id))};
  const app=express();app.use(express.json());
  const auth=(req,res,next)=>{const u=Object.values(users).find(x=>x.login===req.headers['x-test-user']);if(!u)return res.status(401).json({message:'auth'});req.user=u;next()};
  installUnits(app,{mongoose,User,Structure,auth,audit:()=>{},hasPermission:(u,p)=>u.role==='admin'&&p==='units.manage',models,storage});
  const server=await new Promise(r=>{const s=app.listen(0,()=>r(s))});
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(who,method,path,body,headers={})=>{const r=await fetch(base+path,{method,headers:{'x-test-user':users[who].login,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{}),...headers},body:body instanceof FormData?body:(body?JSON.stringify(body):undefined)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,data}};
  return {users,models,call,close:()=>server.close(),F,D};
}

test('rules: unit roles, academic hierarchy and permissions',()=>{
 const unit={kind:'kafedra',structureId:'s1'};
 assert.equal(effectiveUnitRole({user:{role:'department',departmentId:'s1'},unit}),'head');
 assert.equal(effectiveUnitRole({user:{role:'teacher',departmentId:'s1'},unit}),'staff');
 assert.equal(effectiveUnitRole({user:{role:'teacher',departmentId:'s2'},unit}),null);
 assert.equal(effectiveUnitRole({user:{role:'rectorate'},unit}),'viewer');
 assert.equal(effectiveUnitRole({user:{role:'teacher',departmentId:'s1'},unit,membership:{role:'deputy'}}),'deputy','explicit membership can raise the implicit role');
 assert.equal(effectiveUnitRole({user:{role:'admin'},unit}),'admin');
 assert.ok(unitCan('staff','process_requests')&&!unitCan('staff','manage_unit')&&unitCan('deputy','manage_unit')&&!unitCan('viewer','manage_content'));
 assert.ok(canTransition('new','in_progress','staff')&&!canTransition('done','cancelled','requester')&&canTransition('waiting','cancelled','requester'));
 assert.equal(requestNumber('reg',2026,7),'REG-2026-0007');
 const due=dueDate(new Date('2026-10-16T09:00:00'),2);assert.equal(due.getDay(),2,'2 working days after Friday is Tuesday');
 assert.deepEqual(cleanModules(['tasks','evil'],'division'),['tasks']);
 assert.equal(safeAppUrl('javascript:alert(1)'),'');
});

test('rules: service forms and answers are validated',()=>{
 const f=validateServiceFields([{label:'Qayerga',type:'select',options:'Bank, Harbiy komissariat',required:true},{label:'Nusxa soni',type:'number'},{label:'Sana',type:'date'}]);
 assert.equal(f[0].key,'qayerga');assert.deepEqual(f[0].options,['Bank','Harbiy komissariat']);
 assert.throws(()=>validateAnswers(f,{}),/Qayerga/);
 assert.throws(()=>validateAnswers(f,{qayerga:'Boshqa'}),/ro‘yxatdagi/);
 assert.deepEqual(validateAnswers(f,{qayerga:'Bank',nusxa_soni:'2',sana:'2026-10-20'}),{qayerga:'Bank',nusxa_soni:'2',sana:'2026-10-20'});
 for(const p of UNIT_PRESETS)for(const s of p.services||[])validateServiceFields(s.fields||[]);
});

test('API: seeding builds the university, academic units sync and roles follow the hierarchy',async()=>{
 const t=await setup();try{
  const seed=await t.call('admin','POST','/api/units/seed',{});
  assert.equal(seed.status,200);assert.equal(seed.data.created,UNIT_PRESETS.length);assert.equal(seed.data.academic,2);
  assert.equal((await t.call('admin','POST','/api/units/seed',{})).data.created,0,'seeding twice does not duplicate');
  const list=(await t.call('dean','GET','/api/units')).data;
  const fac=list.units.find(u=>u.kind==='faculty'),kaf=list.units.find(u=>u.kind==='kafedra'),reg=list.units.find(u=>u.code==='REG');
  assert.ok(fac&&kaf&&reg);assert.equal(kaf.parentId,fac._id,'kafedra sits under its faculty');
  assert.equal(fac.myRole,'head','dean heads own faculty');
  assert.equal((await t.call('teacher','GET','/api/units/'+kaf._id)).data.myRole,'staff');
  assert.equal((await t.call('student','GET','/api/units/'+kaf._id)).data.myRole,null);
  assert.equal((await t.call('student','POST','/api/units',{kind:'division',name:'X'})).status,403);
 }finally{t.close()}
});

test('API: request lifecycle from student to registrar with status rules and history',async()=>{
 const t=await setup();try{
  await t.call('admin','POST','/api/units/seed',{});
  const reg=(await t.call('admin','GET','/api/units')).data.units.find(u=>u.code==='REG');
  assert.equal((await t.call('admin','POST','/api/units/'+reg._id+'/members',{login:'registrator.x',role:'staff',title:'Registrator'})).status,201);
  const detail=(await t.call('student','GET','/api/units/'+reg._id)).data;
  const svc=detail.services.find(s=>s.title==='O‘qish joyidan ma’lumotnoma');assert.ok(svc,'student sees student services');
  assert.ok(!detail.stats,'student has no internal stats');
  const bad=await t.call('student','POST','/api/units/'+reg._id+'/services/'+svc._id+'/requests',{answers:{}});assert.equal(bad.status,400);
  const ok=await t.call('student','POST','/api/units/'+reg._id+'/services/'+svc._id+'/requests',{answers:{[svc.fields[0].key]:'Bank',[svc.fields[1].key]:'1'}});
  assert.equal(ok.status,201);assert.match(ok.data.number,/^REG-\d{4}-0001$/);assert.ok(ok.data.dueAt);
  const rid=ok.data._id;
  assert.equal((await t.call('student','GET','/api/units/'+reg._id+'/requests')).status,403,'students cannot read the unit queue');
  assert.equal((await t.call('student2','GET','/api/unit-requests/'+rid)).status,403,'other students cannot read it');
  const ws=(await t.call('registrar','GET','/api/units-workspace')).data;
  assert.equal(ws.unassigned.length,1);assert.equal(ws.units[0].name,reg.name);
  let r=await t.call('registrar','PATCH','/api/unit-requests/'+rid,{status:'in_progress'});assert.equal(r.status,200);assert.equal(r.data.assignee.login,'registrator.x','taking a request assigns it');
  r=await t.call('registrar','PATCH','/api/unit-requests/'+rid,{status:'waiting',note:'Pasport nusxasini yuboring'});assert.equal(r.data.status,'waiting');
  r=await t.call('student','POST','/api/unit-requests/'+rid+'/comment',{note:'Yubordim'});assert.equal(r.data.status,'in_progress','requester reply resumes the request');
  assert.equal((await t.call('registrar','PATCH','/api/unit-requests/'+rid,{status:'done'})).status,400,'closing needs a result');
  r=await t.call('registrar','PATCH','/api/unit-requests/'+rid,{status:'done',resolution:'Ma’lumotnoma tayyor, 204-xonadan oling'});assert.equal(r.data.status,'done');
  assert.equal((await t.call('student','POST','/api/unit-requests/'+rid+'/cancel',{})).status,400);
  const mine=(await t.call('student','GET','/api/unit-requests/mine')).data;assert.equal(mine[0].statusLabel,'Bajarildi');
  const full=(await t.call('student','GET','/api/unit-requests/'+rid)).data;assert.deepEqual(full.history.map(h=>h.status),['new','in_progress','waiting','in_progress','done']);
  const kad=(await t.call('admin','GET','/api/units')).data.units.find(u=>u.code==='KAD');
  const kadSvc=(await t.call('admin','GET','/api/units/'+kad._id)).data.services[0];
  assert.equal((await t.call('student','POST','/api/units/'+kad._id+'/services/'+kadSvc._id+'/requests',{answers:{}})).status,404,'staff-only service is hidden from students');
 }finally{t.close()}
});

test('API: unit roles gate settings and membership',async()=>{
 const t=await setup();try{
  await t.call('admin','POST','/api/units/seed',{});
  const ttj=(await t.call('admin','GET','/api/units')).data.units.find(u=>u.code==='TTJ');
  await t.call('admin','POST','/api/units/'+ttj._id+'/members',{login:'registrator.x',role:'staff'});
  assert.equal((await t.call('registrar','PATCH','/api/units/'+ttj._id,{description:'x'})).status,403,'staff cannot edit the unit');
  assert.equal((await t.call('registrar','POST','/api/units/'+ttj._id+'/members',{login:'rahbar.r'})).status,403);
  assert.equal((await t.call('admin','POST','/api/units/'+ttj._id+'/members',{login:'rahbar.r',role:'head',title:'TTJ mudiri'})).status,201);
  assert.equal((await t.call('head','PATCH','/api/units/'+ttj._id,{description:'Yangi tavsif',apps:[{title:'Davlat xizmatlari',url:'https://my.gov.uz',embed:false},{title:'bad',url:'javascript:1'}]})).status,200);
  const d=(await t.call('head','GET','/api/units/'+ttj._id)).data;assert.equal(d.unit.description,'Yangi tavsif');assert.equal(d.unit.apps.length,1);assert.equal(d.head.login,'rahbar.r');
  assert.equal((await t.call('head','POST','/api/units/'+ttj._id+'/members',{login:'oqituvchi.t',role:'head'})).status,403,'only admins appoint heads');
  assert.equal((await t.call('head','POST','/api/units/'+ttj._id+'/members',{login:'talaba.a',role:'staff'})).status,400,'students only as viewers');
 }finally{t.close()}
});

test('API: announcements, documents and events respect audience',async()=>{
 const t=await setup();try{
  await t.call('admin','POST','/api/units/seed',{});
  const yosh=(await t.call('admin','GET','/api/units')).data.units.find(u=>u.code==='YOSH');
  await t.call('admin','POST','/api/units/'+yosh._id+'/members',{login:'registrator.x',role:'staff'});
  await t.call('registrar','POST','/api/units/'+yosh._id+'/posts',{title:'Ichki yig‘ilish',audience:'members'});
  const pub=await t.call('registrar','POST','/api/units/'+yosh._id+'/posts',{title:'Talabalar forumi',audience:'students',requireAck:true});
  let posts=(await t.call('student','GET','/api/units/'+yosh._id+'/posts')).data;assert.deepEqual(posts.map(p=>p.title),['Talabalar forumi']);
  assert.equal((await t.call('student','GET','/api/units-workspace')).data.pendingAck.length,1);
  await t.call('student','POST','/api/units/'+yosh._id+'/posts/'+pub.data._id+'/ack',{});
  posts=(await t.call('student','GET','/api/units/'+yosh._id+'/posts')).data;assert.equal(posts[0].acked,true);
  assert.equal((await t.call('registrar','GET','/api/units/'+yosh._id+'/posts')).data.find(p=>p.title==='Talabalar forumi').ackCount,1);
  const fd=new FormData();fd.append('file',new Blob([Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')],{type:'application/pdf'}),'nizom.pdf');
  const up=await t.call('registrar','POST','/api/units/'+yosh._id+'/docs?title=Ichki%20nizom&category=nizom&visibility=members',fd);assert.equal(up.status,201,JSON.stringify(up.data));
  assert.equal((await t.call('student','GET','/api/units/'+yosh._id+'/docs')).data.length,0);
  assert.equal((await t.call('student','GET','/api/units/'+yosh._id+'/docs/'+up.data._id+'/file')).status,403);
  const file=await t.call('registrar','GET','/api/units/'+yosh._id+'/docs/'+up.data._id+'/file');assert.match(String(file.data),/^%PDF-1.4/);
  const fake=new FormData();fake.append('file',new Blob([Buffer.from('MZ\x90\x00 not a pdf')]),'virus.pdf');
  assert.equal((await t.call('registrar','POST','/api/units/'+yosh._id+'/docs',fake)).status,400,'extension must match content');
  const ev=await t.call('registrar','POST','/api/units/'+yosh._id+'/events',{title:'Zakovat',startsAt:new Date(Date.now()+86400000).toISOString(),registration:true,capacity:1});
  assert.equal((await t.call('student','POST','/api/units/'+yosh._id+'/events/'+ev.data._id+'/register',{})).data.registered,true);
  assert.equal((await t.call('student2','POST','/api/units/'+yosh._id+'/events/'+ev.data._id+'/register',{})).status,400,'capacity is enforced');
  const task=await t.call('registrar','POST','/api/units/'+yosh._id+'/tasks',{title:'Plakat tayyorlash',assigneeId:String(t.users.registrar._id),dueAt:new Date(Date.now()-3600000).toISOString()});
  assert.equal(task.status,201);
  const ws=(await t.call('registrar','GET','/api/units-workspace')).data;assert.equal(ws.tasks[0].overdue,true);
  assert.equal((await t.call('student','GET','/api/units/'+yosh._id+'/tasks')).status,403);
 }finally{t.close()}
});

test('units are wired into the platform: menu, pages, staff role, dashboard, offline cache',async()=>{
 const {readFileSync}=await import('node:fs');const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const html=read('public/index.html'),app=read('public/app.js'),sw=read('public/sw.js'),server=read('server.js');
 for(const t of ['data-page="units"','data-page="workspace"','data-page="myRequests"','id="unitsRoot"','id="workspaceRoot"','id="myRequestsRoot"','<span>Masofaviy ta’lim</span>'])assert.ok(html.includes(t),t);
 assert.ok(app.includes("import {createUnitsUi} from './units-ui.js';"));
 assert.ok(app.includes("units:()=>unitsUi().renderUnits()"));
 assert.ok(app.includes("staff:'Xodim'"));
 assert.ok(sw.includes("'/units-ui.js'"));
 assert.ok(server.includes("staff: ['units.workspace']"));
 assert.ok(server.includes("if(req.user.role==='staff'){const w=await unitsApi.workspaceSummary(req.user)"));
 assert.ok(server.includes("const unitsApi=installUnits(app,{mongoose,User,Structure,auth,audit,hasPermission});"));
});
