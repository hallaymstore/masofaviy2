import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import {Readable,Writable} from 'node:stream';
import {installLibrary} from '../library.js';
import {fakeModel} from './helpers/fake-models.js';

test('librarian PDF catalogue: permissions, metadata, listening, editing, archive and republish',async t=>{
  const Item=fakeModel(),Access=fakeModel(),Course=fakeModel(),Resource=fakeModel();
  const users=Object.fromEntries(['librarian','student','teacher','admin','blocked'].map(role=>[role,{_id:new mongoose.Types.ObjectId(),role:role==='blocked'?'librarian':role,deniedPermissions:role==='blocked'?['library.manage']:[]}]));
  const files=new Map();const bucket=()=>({openUploadStream:()=>{const id=new mongoose.Types.ObjectId(),parts=[];const out=new Writable({write(c,_e,done){parts.push(c);done()},final(done){files.set(String(id),Buffer.concat(parts));done()}});out.id=id;return out},openDownloadStream:id=>Readable.from([files.get(String(id))]),delete:async id=>files.delete(String(id))});
  const app=express();app.use(express.json());
  installLibrary(app,{mongoose,Course,Resource,bucket,models:{LibraryItem:Item,LibraryAccess:Access},auth:(req,res,next)=>{req.user=users[req.headers['x-user']];if(!req.user)return res.sendStatus(401);next()},courseAccess:async()=>{},resolveUserGroupId:async()=>null});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});t.after(()=>{server.closeAllConnections();server.close()});
  const base='http://127.0.0.1:'+server.address().port;
  const upload=(name='book.pdf',content='%PDF-1.7\n'+(' '.repeat(100)))=>{const data=new FormData();for(const [key,value] of Object.entries({title:'O‘tkan kunlar',authors:'Abdulla Qodiriy',publicationYear:'1926',description:'O‘zbek romani',language:'uz',type:'book',tags:'adabiyot,roman',isbn:'123'}))data.set(key,value);data.set('file',new Blob([content]),name);return data};
  async function call(user,method,url,body){const headers={'x-user':user};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';const r=await fetch(base+url,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:r.status,data}}
  for(const role of ['student','teacher','blocked']){
    assert.equal((await call(role,'POST','/api/lms/library/upload',upload())).status,403);
    assert.equal((await call(role,'GET','/api/lms/library/manage')).status,403);
  }
  assert.equal((await call('librarian','POST','/api/lms/library/upload',upload('bad.pdf','not pdf'))).status,400);
  assert.equal((await call('librarian','POST','/api/lms/library/upload',upload('bad.txt','text'))).status,400);
  const invalid=upload();invalid.set('publicationYear','yesterday');assert.equal((await call('librarian','POST','/api/lms/library/upload',invalid)).status,400);assert.equal(files.size,0);
  const added=await call('librarian','POST','/api/lms/library/upload',upload());assert.equal(added.status,201);
  const item=added.data.item,id=item._id;assert.deepEqual(item.authors,['Abdulla Qodiriy']);assert.equal(item.publicationYear,1926);assert.equal(files.size,1);
  assert.equal((await call('student','GET','/api/lms/library')).data.length,1);
  const open=await call('student','GET','/api/lms/library/'+id+'/open');assert.equal(open.data.url,'/api/lms/library/'+id+'/content');
  assert.match((await call('student','GET',open.data.url)).data,/^%PDF-/);
  assert.equal((await call('student','PATCH','/api/lms/library/'+id,{title:'hacked'})).status,403);
  assert.equal((await call('librarian','PATCH','/api/lms/library/'+id,{description:'Yangilangan tavsif'})).status,200);
  assert.equal((await call('admin','GET','/api/lms/library/manage')).data.items[0].description,'Yangilangan tavsif');
  assert.equal((await call('librarian','PATCH','/api/lms/library/'+id,{published:false})).status,200);
  assert.equal((await call('student','GET','/api/lms/library')).data.length,0);
  assert.equal((await call('student','GET',open.data.url)).status,404);
  assert.equal((await call('librarian','GET',open.data.url)).status,200);
  assert.equal((await call('librarian','PATCH','/api/lms/library/'+id,{published:true})).status,200);
  assert.equal((await call('student','GET','/api/lms/library')).data.length,1);
});
