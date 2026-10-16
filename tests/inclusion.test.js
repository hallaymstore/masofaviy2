import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import {installInclusion} from '../inclusion.js';
import {fakeModel,matches} from './helpers/fake-models.js';
import {NEEDS,cleanNeeds,cleanPrefs,defaultsFor,effectivePrefs,examMinutes,examMs,extraPctOf,suggestedExtraPct,profileView} from '../inclusion-rules.js';
import {matchCommand,normalize,spokenToLogin,spokenToDigits,spellOut,helpLines} from '../public/voice-commands.js';
import {splitSentences,pageTextFromItems,looksScanned} from '../public/audio-reader.js';

const oid=()=>new mongoose.Types.ObjectId();
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('needs, preferences and exam time rules', ()=>{
  assert.deepEqual(cleanNeeds('blind; deaf,unknown blind'),['blind','deaf']);
  assert.deepEqual(cleanPrefs({fontScale:9,ttsRate:0.1,contrast:'neon',voiceAssistant:1,ttsLang:'xx',evil:'<script>'}),{fontScale:2,ttsRate:0.5,contrast:'normal',voiceAssistant:true,ttsLang:'uz-UZ'});
  const d=defaultsFor(['blind','low_vision']);
  assert.equal(d.voiceAssistant,true);assert.equal(d.fontScale,1.5);assert.equal(d.contrast,'high');assert.equal(d.audioBooks,true);
  assert.equal(suggestedExtraPct(['deaf','motor']),50);
  // Explicit user choice beats the needs-based default.
  const eff=effectivePrefs({status:'verified',needs:['blind'],prefs:{voiceAssistant:false}});
  assert.equal(eff.voiceAssistant,false);assert.equal(eff.speakFocus,true);
  assert.equal(effectivePrefs({status:'none',needs:['blind']}).voiceAssistant,false);
  // Only verified profiles change exam timing.
  assert.equal(examMinutes(30,{status:'pending',extraTimePct:50}),30);
  assert.equal(examMinutes(30,{status:'verified',extraTimePct:50}),45);
  assert.equal(examMinutes(40,{status:'verified',extraTimePct:250}),80);
  assert.equal(examMs(10,{status:'verified',extraTimePct:25}),12.5*60000);
  assert.equal(extraPctOf(null),0);
  const view=profileView({needs:['deaf'],status:'verified',extraTimePct:25,notes:'secret'});
  assert.equal(view.notes,undefined);assert.equal(profileView({notes:'n'},{staff:true}).notes,'n');
  for(const n of Object.values(NEEDS))assert.ok(n.label&&n.icon&&n.hint);
});

test('voice commands understand Uzbek (Latin and Cyrillic) and Russian', ()=>{
  assert.equal(normalize('O‘qi!'),'oqi');assert.equal(normalize('Ўқи'),'oqi');
  const c=t=>matchCommand(t);
  assert.deepEqual([c('Kutubxona')?.action,c('Kutubxona')?.page],['go','library']);
  assert.equal(c('jadvalni och').page,'schedule');
  assert.equal(c('kitobni o‘qi').action,'listenBook');
  assert.equal(c('sahifani o‘qib ber').action,'readPage');
  assert.equal(c('to‘xta').action,'stop');
  assert.equal(c('darsga kir').action,'joinLesson');
  assert.deepEqual(c('qidir oliy matematika'),{action:'search',arg:'oliy matematika',text:'qidir oliy matematika'});
  assert.equal(c('Ҳа').action,'yes');assert.equal(c('yo‘q').action,'no');assert.equal(c('нет').action,'no');
  assert.equal(c('библиотека').page,'library');
  // "ha" inside a sentence is not a confirmation.
  assert.notEqual(c('shahar haqida')?.action,'yes');
  assert.equal(c('bla bla'),null);
  assert.equal(spokenToLogin('KT 21 tire nol to‘rt bir ikki'),'kt21-0412');
  assert.equal(spokenToDigits('bir ikki uch 4 5 olti'),'123456');
  assert.equal(spellOut('kt-1'),'K, T, tire, 1');
  assert.ok(helpLines().length>=10);
});

test('audio reader splits text into speakable sentences and detects scanned PDFs', ()=>{
  const s=splitSentences('Birinchi gap. Ikkinchi gap! '+'uzun '.repeat(80)+'oxiri.');
  assert.equal(s[0],'Birinchi gap.');assert.equal(s[1],'Ikkinchi gap!');
  assert.ok(s.slice(2).every(x=>x.length<=221));
  assert.equal(pageTextFromItems([{str:'Mate-',hasEOL:true},{str:'matika',hasEOL:false},{str:'fani'}]),'Mate-\nmatika fani');
  assert.deepEqual(splitSentences('Mate-\nmatika fani.'),['Matematika fani.']);
  assert.equal(looksScanned(['','  ','']),true);
  assert.equal(looksScanned(['Bu sahifada yetarlicha uzun matn bor, u skaner emas, haqiqiy matn qatlami.']),false);
});

function userModel(){
  const base=fakeModel({active:true});
  const setPath=(o,k,v)=>{const ks=k.split('.');let t=o;for(const p of ks.slice(0,-1))t=(t[p]||={});t[ks.at(-1)]=v};
  const byId=id=>base.rows.find(r=>String(r._id)===String(id))||null;
  return {...base,rows:base.rows,
    async updateOne(q,u){const d=base.rows.find(r=>matches(r,q));if(d)for(const [k,v] of Object.entries(u.$set||{}))setPath(d,k,v);return {}},
    findById(id){
      const doc=()=>{const r=byId(id);if(!r)return null;const d={...r,inclusion:r.inclusion?{...r.inclusion}:undefined};
        Object.defineProperty(d,'save',{value:async function(){Object.assign(r,JSON.parse(JSON.stringify({inclusion:this.inclusion})));r.inclusion.needs=this.inclusion.needs}});
        Object.defineProperty(d,'toObject',{value:function(){return {...this}}});return d};
      return {select(){return this},lean:()=>Promise.resolve(byId(id)&&{...byId(id)}),then:(a,b)=>Promise.resolve(doc()).then(a,b)};
    }};
}
async function setup(){
  const F={_id:oid(),type:'faculty',name:'F'},K={_id:oid(),type:'department',name:'K',parentId:F._id};
  const G1={_id:oid(),type:'group',name:'DI-01',parentId:K._id},G2={_id:oid(),type:'group',name:'XX-02',parentId:K._id};
  const Structure=fakeModel();Structure.rows.push(F,K,G1,G2);
  const User=userModel();
  const mk=(login,role,extra={})=>{const u={_id:oid(),login,fullName:login.toUpperCase(),role,active:true,...extra};User.rows.push(u);return u};
  const u={admin:mk('admin','admin'),dean:mk('dekan','dean'),teacher:mk('teacher','teacher'),other:mk('teacher2','teacher'),s1:mk('s1','student',{groupId:G1._id}),s2:mk('s2','student',{groupId:G2._id}),s3:mk('s3','student',{groupId:G1._id})};
  const Schedule=fakeModel();Schedule.rows.push({_id:oid(),teacherId:u.teacher._id,groupId:G1._id});
  const sent=[];
  const webpush={generateVAPIDKeys:()=>({publicKey:'PUBKEY',privateKey:'PRIVKEY'}),setVapidDetails(){},async sendNotification(sub,body){if(sub.endpoint.includes('gone'))throw Object.assign(new Error('gone'),{statusCode:410});sent.push({endpoint:sub.endpoint,body:JSON.parse(body)})}};
  const audits=[];
  const app=express();app.use(express.json());
  const auth=(req,_res,next)=>{const r=User.rows.find(x=>x.login===req.headers['x-u']);req.user=r?JSON.parse(JSON.stringify(r)):null;if(req.user){req.user._id=r._id}next()};
  const api=installInclusion(app,{mongoose,User,Structure,Schedule,auth,audit:(req,a,e,id,meta)=>audits.push({a,id,meta}),
    resolveScope:async user=>{if(user.role==='dean')return {groupIds:[G1._id]};throw new Error('scope')},GLOBAL_SCOPE_ROLES:new Set(['admin','superadmin']),
    models:{PushSubscription:fakeModel(),InclusionSetting:fakeModel()},webpush,env:{}});
  const server=await new Promise(r=>{const s=app.listen(0,()=>r(s))});const base='http://127.0.0.1:'+server.address().port;
  const call=async(who,method,path,body)=>{const r=await fetch(base+path,{method,headers:{'x-u':who,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json().catch(()=>null)}};
  return {u,G1,G2,User,api,call,sent,audits,app,close:()=>server.close()};
}

test('student requests accommodations, staff verifies inside their scope, teacher sees only what they need', async()=>{
  const t=await setup();
  try{
    let r=await t.call('s1','POST','/api/inclusion/me/request',{needs:['blind'],note:'Brayl bilmayman'});
    assert.equal(r.status,400,'consent is mandatory');
    r=await t.call('s1','POST','/api/inclusion/me/request',{needs:['blind','nonsense'],note:'Brayl bilmayman',consent:true});
    assert.equal(r.status,200);assert.equal(r.data.profile.status,'pending');assert.deepEqual(r.data.profile.needs,['blind']);
    assert.equal(r.data.profile.extraTimePct,0,'pending gives no extra exam time');assert.equal(r.data.effective.voiceAssistant,true,'UI help starts at once');
    assert.equal((await t.call('admin','POST','/api/inclusion/me/request',{needs:['blind'],consent:true})).status,403);

    r=await t.call('dekan','GET','/api/inclusion/people');
    assert.equal(r.status,200);assert.equal(r.data.summary.pending,1);assert.equal(r.data.people[0].profile.selfNote,'Brayl bilmayman');
    assert.equal((await t.call('teacher','GET','/api/inclusion/people')).status,403,'teachers do not manage profiles');

    r=await t.call('dekan','PUT','/api/inclusion/people/'+t.u.s1._id,{status:'verified',extraTimePct:50,notes:'IPR №12'});
    assert.equal(r.status,200);assert.equal(r.data.person.profile.status,'verified');assert.equal(r.data.person.profile.extraTimePct,50);
    const stored=t.User.rows.find(x=>x.login==='s1').inclusion;
    assert.equal(examMinutes(30,stored),45);assert.ok(stored.verifiedAt);
    assert.ok(t.audits.some(a=>a.a==='INCLUSION_PROFILE_SET'));

    // Out of scope (other group) and consent for a fresh staff marking.
    assert.equal((await t.call('dekan','PUT','/api/inclusion/people/'+t.u.s2._id,{needs:['deaf'],consent:true})).status,403);
    assert.equal((await t.call('admin','PUT','/api/inclusion/people/'+t.u.s2._id,{needs:['deaf']})).status,400);
    r=await t.call('admin','PUT','/api/inclusion/people/'+t.u.s2._id,{needs:['deaf'],consent:true});
    assert.equal(r.status,200);assert.equal(r.data.person.profile.status,'verified');assert.equal(r.data.person.profile.extraTimePct,25,'suggested from needs');

    r=await t.call('teacher','GET','/api/inclusion/teacher');
    assert.equal(r.status,200);assert.deepEqual(r.data.people.map(p=>p.login),['s1'],'only verified students of taught groups');
    assert.equal(r.data.people[0].profile.notes,undefined);assert.equal(r.data.people[0].profile.selfNote,undefined);
    assert.deepEqual((await t.call('teacher2','GET','/api/inclusion/teacher')).data.people,[]);
    assert.equal((await t.call('s1','GET','/api/inclusion/teacher')).status,403);

    r=await t.call('dekan','GET','/api/inclusion/candidates?q=s3');
    assert.deepEqual(r.data.people.map(p=>p.login),['s3']);
    assert.deepEqual((await t.call('dekan','GET','/api/inclusion/candidates?q=s2')).data.people,[],'search stays in scope');

    // Clearing needs returns the profile to «none».
    r=await t.call('admin','PUT','/api/inclusion/people/'+t.u.s2._id,{needs:[]});
    assert.equal(r.data.person.profile.status,'none');

    r=await t.call('s1','GET','/api/inclusion/me');
    assert.equal(r.data.profile.notes,undefined,'students never see staff notes');assert.equal(r.data.push.publicKey,'PUBKEY');
  }finally{t.close()}
});

test('preferences sync and Web Push delivery', async()=>{
  const t=await setup();
  try{
    let r=await t.call('s3','PUT','/api/inclusion/me/prefs',{prefs:{fontScale:1.75,contrast:'high',junk:1}});
    assert.equal(r.status,200);assert.deepEqual(r.data.prefs,{fontScale:1.75,contrast:'high'});
    assert.deepEqual(t.User.rows.find(x=>x.login==='s3').inclusion.prefs,{fontScale:1.75,contrast:'high'});
    assert.equal((await t.call('s3','POST','/api/inclusion/push/subscribe',{subscription:{endpoint:'http://insecure',keys:{p256dh:'a',auth:'b'}}})).status,400);
    assert.equal((await t.call('s3','POST','/api/inclusion/push/subscribe',{subscription:{endpoint:'https://push.example/ok',keys:{p256dh:'a',auth:'b'}}})).status,201);
    assert.equal((await t.call('s1','POST','/api/inclusion/push/subscribe',{subscription:{endpoint:'https://push.example/gone',keys:{p256dh:'a',auth:'b'}}})).status,201);
    r=await t.call('s3','POST','/api/inclusion/push/test');
    assert.equal(r.data.sent,1);assert.equal(t.sent[0].body.title,'Sinov bildirishnomasi');
    const res=await t.api.notifyGroup(t.G1._id,{title:'Dars boshlandi',body:'Fizika',url:'/?go=live'});
    assert.equal(res.sent,1,'expired subscription is skipped');
    assert.equal(await t.api.PushSubscription.countDocuments({endpoint:'https://push.example/gone'}),0,'410 Gone removes the subscription');
    assert.equal(typeof t.app.locals.notifyUsers,'function');
  }finally{t.close()}
});

test('platform wiring: enrolment, exams, lesson push, PWA shortcuts, UI and service worker', ()=>{
  const server=read('server.js'),lms=read('lms.js'),remote=read('remote-exams.js'),comm=read('communications.js'),app=read('public/app.js'),html=read('public/index.html'),sw=read('public/sw.js'),ui=read('public/inclusion-ui.js'),pkg=JSON.parse(read('package.json'));
  assert.ok(server.includes("const inclusionApi=installInclusion(app,"));
  assert.ok(server.includes("inclusion:{needs:[String],status:{type:String,enum:['none','pending','verified','rejected']"));
  assert.ok(server.includes("inclusionApi.applyStaffProfile(user,req.body.inclusion,req.user)"),'marking at enrolment');
  assert.ok(server.includes("inclusionApi.applyStaffProfile(target,req.body.inclusion,req.user)"),'marking on edit');
  assert.ok(server.includes("inclusionApi.notifyGroup(lesson.groupId,{title:'Dars boshlandi'"));
  assert.ok(server.includes("url:'/?voice=1'"),'voice assistant app shortcut');
  assert.ok(comm.includes("req.app.locals.notifyUsers?.([recipient._id]"));
  assert.ok(server.includes('delete x.inclusion.notes')&&server.includes("if(u.inclusion&&!hasPermission(req.user,'users.manage'))delete u.inclusion.notes;"),'students never get staff notes via /api/me or /api/users/:id');
  assert.equal((lms.match(/examMinutes\(quiz\.durationMinutes,req\.user\.inclusion\)/g)||[]).length,4);
  assert.ok(remote.includes('deadlineOf(e,a,req.user.inclusion)')&&remote.includes('deadlineOf(e,a,student?.inclusion)'));
  assert.ok(!/Math\.min\(\+e\.endsAt,\+a\.startedAt\+e\.durationMinutes\*60000\)/.test(remote),'no un-accommodated deadline left');
  assert.ok(app.includes("import {createInclusionUi,initInclusionEarly} from './inclusion-ui.js';")&&app.includes('initInclusionEarly();'));
  assert.ok(app.includes("inclusionUi().afterLogin();")&&app.includes('id="libraryListen"'));
  assert.ok(app.includes("inclusionUi().readUserFields(d)")&&app.includes("inclusionUi().userFieldsHtml(u.inclusion||{})"));
  assert.ok(html.includes('<section id="accessibility" class="page">')&&html.includes('<section id="inclusion" class="page">'));
  assert.ok(html.includes('data-page="accessibility"')&&html.includes('data-page="inclusion"'));
  assert.ok(html.includes('<div id="toast" role="status" aria-live="polite"></div>'));
  assert.ok(html.includes('/inclusion.css?v=20261016-inc1')&&html.includes('/app.js?v=20261016-inc1'));
  assert.ok(sw.includes("self.addEventListener('push'")&&sw.includes("self.addEventListener('notificationclick'"));
  assert.ok(sw.includes("'/inclusion-ui.js'")&&sw.includes("'/voice-commands.js'")&&sw.includes("'/audio-reader.js'"));
  assert.ok(ui.includes("from './inclusion-rules.js'"),'browser shares the server rules');
  assert.ok(ui.includes('Xavfsizlik uchun parolni ovoz chiqarib aytmang'),'voice login never asks to say the password by default');
  assert.ok(pkg.dependencies['web-push']);
  assert.ok(pkg.scripts.test.includes('tests/inclusion.test.js')&&pkg.scripts.check.includes('node --check inclusion.js'));
});
