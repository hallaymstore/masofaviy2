import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import {Readable,Writable} from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installMyBooks,checkBookHeader} from '../my-books.js';
import {installTts} from '../tts.js';
import {MAX_CHUNK,chunkForSpeech,detectLang,uzCyrToLatin,buildSsml} from '../tts-rules.js';
import {splitSentences,looksScanned} from '../public/reader-rules.js';
import {matchCommand} from '../public/voice-commands.js';
import {fakeModel} from './helpers/fake-models.js';

async function serve(t,app){const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});t.after(()=>{server.closeAllConnections();server.close()});return 'http://127.0.0.1:'+server.address().port}
const oid=()=>new mongoose.Types.ObjectId();
test('Uzbek Latin/Cyrillic, mixed language, SSML escaping and lossless long chunks',()=>{
  assert.equal(detectLang('Бу китоб менинг дўстим.'),'uz');
  assert.equal(detectLang('Бу китоб менинг.'),'uz');
  assert.equal(detectLang('Это книга для студентов.'),'ru');
  assert.equal(detectLang('This is the book for the students.'),'en');
  assert.equal(uzCyrToLatin('Ўзбекистон, Қарши, Ғафур!'),'Oʻzbekiston, Qarshi, Gʻafur!');
  const long='kitob '.repeat(450)+'juda'.repeat(400);
  const chunks=chunkForSpeech([long]);assert.ok(chunks.every(c=>c.text.length<=MAX_CHUNK));
  assert.equal(chunks.map(c=>c.text).join('').replace(/\s/g,''),long.replace(/\s/g,''));
  assert.deepEqual(chunkForSpeech(['Bu kitob.','Это книга.','This is the book.']).map(c=>c.lang),['uz','ru','en']);
  assert.match(buildSsml('<script>& "salom"',{gender:'male'}),/SardorNeural/);
  assert.ok(!buildSsml('<voice>bad</voice>').includes('<voice>bad'));
  assert.equal(looksScanned(['Salom!']),false,'short text is readable');
  assert.equal(splitSentences('ta-\nlabalar. Salom!').join(' '),'talabalar. Salom!');
  assert.equal(matchCommand('kitobni o‘qib bergin').action,'listenBook');
  assert.equal(matchCommand('менинг китобларим').page,'myBooks');
  assert.equal(matchCommand('qidir O‘zbekiston kitoblari').action,'search');
  assert.equal(matchCommand('qidir O‘zbekiston kitoblari').arg,'O‘zbekiston kitoblari');
});

test('file validation rejects disguised/binary uploads',async()=>{
  assert.equal((await checkBookHeader('book.pdf',Buffer.from('%PDF-1.7\n'+' '.repeat(40)))).ext,'pdf');
  assert.equal((await checkBookHeader('book.txt',Buffer.from('O‘zbekcha kitob'))).ext,'txt');
  await assert.rejects(checkBookHeader('fake.pdf',Buffer.from('not a pdf')),/PDF/);
  await assert.rejects(checkBookHeader('bad.txt',Buffer.from([65,0,66])),/ikkilik/);
  await assert.rejects(checkBookHeader('bad.txt',Buffer.from([0xff,0xfe])),/UTF-8/);
  await assert.rejects(checkBookHeader('bad.html',Buffer.from('<script>')),/PDF yoki TXT/);
});

async function booksSetup(t){
  const User=fakeModel(),Book=fakeModel(),Link=fakeModel();const group1=oid(),group2=oid();
  const users={student:{_id:oid(),role:'student',fullName:'Ali Valiyev',active:true,groupId:group1},other:{_id:oid(),role:'student',fullName:'Vali',active:true,groupId:group2},tutor:{_id:oid(),role:'tutor',active:true},outsider:{_id:oid(),role:'tutor',active:true},teacher:{_id:oid(),role:'teacher',active:true},admin:{_id:oid(),role:'admin',active:true}};
  User.rows.push(...Object.values(users));
  const files=new Map();
  const bucket=()=>({openUploadStream:()=>{const id=oid(),parts=[];const out=new Writable({write(chunk,_encoding,done){parts.push(Buffer.from(chunk));done()},final(done){files.set(String(id),Buffer.concat(parts));done()}});out.id=id;return out},openDownloadStream:id=>Readable.from([files.get(String(id))]),delete:async id=>files.delete(String(id))});
  const app=express();app.use(express.json());
  const auth=(req,res,next)=>{req.user=users[req.headers['x-user']];if(!req.user)return res.status(401).json({message:'Login kerak'});next()};
  let now=Date.parse('2026-10-16T07:00:00Z');
  installMyBooks(app,{mongoose,User,auth,bucket,models:{PersonalBook:Book,FamilyUploadLink:Link},resolveScope:async user=>({groupIds:user===users.tutor?[group1]:[]}),now:()=>now});
  const base=await serve(t,app);
  async function call(user,method,url,body){const headers=user?{'x-user':user}:{};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(base+url,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:r.status,data,headers:r.headers}}
  const upload=(title='Kitob',content='Bu kitob talabalar uchun.\n')=>{const fd=new FormData();fd.set('title',title);fd.set('file',new Blob([content]),'book.txt');return fd};
  return {call,users,Book,Link,files,upload,setNow:value=>{now=value}};
}

test('private shelf, scoped staff access, GridFS download, progress and deletion',async t=>{
  const {call,users,files,upload}=await booksSetup(t);
  assert.equal((await call(null,'GET','/api/my-books')).status,401);
  const added=await call('student','POST','/api/my-books',upload());assert.equal(added.status,201);const id=added.data.book.id;
  assert.equal(files.size,1);
  assert.equal((await call('student','GET','/api/my-books')).data.books.length,1);
  assert.equal((await call('other','GET','/api/my-books')).data.books.length,0);
  for(const method of ['GET','PATCH','DELETE']){
    const url='/api/my-books/'+id+(method==='GET'?'/file':'');
    assert.equal((await call('other',method,url,method==='PATCH'?{title:'stolen'}:undefined)).status,403,method+' cross-student blocked');
    assert.equal((await call('outsider',method,url,method==='PATCH'?{title:'stolen'}:undefined)).status,403,method+' out-of-scope staff blocked');
  }
  assert.equal((await call('teacher','GET','/api/my-books/'+id+'/file')).status,403);
  const file=await call('tutor','GET','/api/my-books/'+id+'/file');assert.equal(file.status,200);assert.match(file.data,/talabalar/);assert.match(file.headers.get('cache-control'),/no-store/);
  assert.equal((await call('admin','GET','/api/my-books?userId='+users.student._id)).data.books.length,1);
  assert.equal((await call('other','POST','/api/my-books?userId='+users.student._id,upload())).status,403);
  const saved=await call('student','PATCH','/api/my-books/'+id,{progress:{page:2,idx:3,pages:4,finished:false}});
  assert.deepEqual([saved.data.book.progress.page,saved.data.book.progress.idx],[2,3]);
  assert.equal((await call('student','GET','/api/my-books')).data.books[0].progress.pages,4);
  assert.equal((await call('student','DELETE','/api/my-books/'+id)).status,200);assert.equal(files.size,0);
  assert.equal((await call('student','GET','/api/my-books/'+id+'/file')).status,404);
});

test('family link: upload only, rotation, expiry, revocation, failed uploads refund allowance',async t=>{
  const {call,Link,upload,setNow}=await booksSetup(t);
  const created=await call('student','POST','/api/my-books/family-link');assert.equal(created.status,201);
  const token=created.data.path.split('#')[1],url='/api/family-upload/'+token;
  assert.ok(!JSON.stringify(Link.rows).includes('"'+token+'"'),'raw token never stored');
  const info=await call(null,'GET',url);assert.equal(info.data.student,'Ali');assert.equal(info.data.left,20);
  const bad=upload('Bad');bad.set('file',new Blob(['bad']),'bad.pdf');assert.equal((await call(null,'POST',url,bad)).status,400);
  assert.equal((await call(null,'GET',url)).data.left,20);
  assert.equal((await call(null,'POST',url,upload('Oiladan kitob'))).status,201);
  assert.equal((await call('student','GET','/api/my-books')).data.books[0].addedBy,'family');
  assert.equal((await call(null,'GET',url)).data.left,19);
  assert.equal((await call(null,'DELETE',url)).status,404,'family has no delete API');
  await call('student','POST','/api/my-books/family-link');assert.equal((await call(null,'GET',url)).status,410);
  const fresh=await call('student','POST','/api/my-books/family-link');const freshUrl='/api/family-upload/'+fresh.data.path.split('#')[1];
  Link.rows[0].uses=19;
  const last=await Promise.all([call(null,'POST',freshUrl,upload('A')),call(null,'POST',freshUrl,upload('B'))]);
  assert.equal(last.filter(x=>x.status===201).length,1);assert.equal(Link.rows[0].uses,20);
  const revoke=await call('student','POST','/api/my-books/family-link');const revoked='/api/family-upload/'+revoke.data.path.split('#')[1];
  await call('student','DELETE','/api/my-books/family-link');assert.equal((await call(null,'GET',revoked)).status,410);
  const expiry=await call('student','POST','/api/my-books/family-link');setNow(Date.parse('2026-10-24T07:00:00Z'));
  assert.equal((await call(null,'GET','/api/family-upload/'+expiry.data.path.split('#')[1])).status,410);
});

test('TTS API deduplicates requests, caches privately, enforces quota before concurrency',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hallaym-tts-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const app=express();app.use(express.json());let calls=0;
  installTts(app,{auth:(req,res,next)=>{if(!req.headers['x-user'])return res.sendStatus(401);req.user={_id:req.headers['x-user']};next()},env:{TTS_PROVIDER:'edge',TTS_CACHE_DIR:dir,TTS_DAILY_CHARS:'100'},edgeImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,30));return Buffer.alloc(300,65)}});
  const base=await serve(t,app);
  const speak=(user,text)=>fetch(base+'/api/tts/speak',{method:'POST',headers:{'x-user':user,'Content-Type':'application/json'},body:JSON.stringify({text,lang:'uz',gender:'male'})});
  const same=await Promise.all(Array.from({length:5},()=>speak('a','Bu kitob.')));assert.ok(same.every(r=>r.status===200));assert.equal(calls,1);
  const cached=await speak('a','Bu kitob.');assert.equal(cached.status,200);assert.equal(calls,1);assert.match(cached.headers.get('cache-control'),/private, no-store/);
  await speak('b','Bu kitob.');assert.equal(calls,2,'different user has separate synthesis/cache');
  const quota=await Promise.all([speak('c','a'.repeat(60)),speak('c','b'.repeat(60))]);assert.deepEqual(quota.map(r=>r.status).sort(),[200,429]);
  assert.equal((await speak('d','x'.repeat(MAX_CHUNK+1))).status,413);
  assert.equal((await fetch(base+'/api/tts/status')).status,401);
});

test('TTS rejects wrong config and returns actionable errors without exposing provider secrets',async t=>{
  assert.throws(()=>installTts(express(),{env:{AZURE_SPEECH_REGION:'bad.example/path'}}),/REGION/);
  const app=express();app.use(express.json());
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hallaym-tts-fail-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  installTts(app,{auth:(req,res,next)=>{req.user={_id:'x'};next()},env:{TTS_PROVIDER:'edge',TTS_CACHE_DIR:dir,TTS_DAILY_CHARS:'10'},edgeImpl:async()=>{throw new Error('secret-provider-details')}});
  const base=await serve(t,app);
  for(let i=0;i<2;i++){const r=await fetch(base+'/api/tts/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Salom!'})});assert.equal(r.status,502,'failed requests refund quota');assert.ok(!(await r.text()).includes('secret-provider-details'))}
});
