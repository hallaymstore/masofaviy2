import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSearchQuery,safeSearchRegex,searchRank,buildSearchHit,SEARCH_TYPES} from '../global-search-rules.js';
import {installGlobalSearch} from '../global-search.js';

const appCode=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const view=readFileSync(new URL('../public/global-search-ui.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('text sanitization and escaping prevent unbounded or regex wildcard searches',()=>{
 assert.equal(normalizeSearchQuery('  Statistika  nazariya '),'Statistika nazariya');
 assert.throws(()=>normalizeSearchQuery('x'));
 assert.equal(safeSearchRegex('a.*[+]'),'a\\.\\*\\[\\+\\]');
 assert.equal(searchRank('Statistika','mavzu','Statistika'),120);
 assert.ok(SEARCH_TYPES.includes('assignment'));
 const result=buildSearchHit({type:'course',id:'c',title:'Statistika',subtitle:'Fan',page:'courses',query:'stat'});
 assert.equal(result.page,'courses');assert.equal(result.score,95);
});

const g1='507f1f77bcf86cd799439011',g2='507f1f77bcf86cd799439012',c1='507f1f77bcf86cd799439021',c2='507f1f77bcf86cd799439022';
const rows={
 Course:[{_id:c1,title:'Statistika',code:'STAT',teacherId:'teacher1',groupId:g1,active:true},{_id:c2,title:'Statistika maxfiy',code:'SECRET',teacherId:'teacher2',groupId:g2,active:true}],
 Resource:[{_id:'r1',title:'Statistika fayli',description:'',courseId:c1,published:true},{_id:'r2',title:'Statistika maxfiy resurs',courseId:c2,published:true}],
 Assignment:[{_id:'a1',title:'Statistika vazifa',instructions:'Javob',courseId:c1,published:true},{_id:'a2',title:'Statistika maxfiy topshiriq',courseId:c2,published:true}],
 Quiz:[],
 Schedule:[{_id:'s1',title:'Statistika darsi',subject:'Fan',groupId:g1,teacherId:'teacher1'},{_id:'s2',title:'Statistika maxfiy darsi',subject:'Fan',groupId:g2,teacherId:'teacher2'}],
 VideoLesson:[{_id:'v1',title:'Statistika video',description:'Kirish',published:true},{_id:'v2',title:'Statistika qoralama',published:false}],
 LibraryItem:[{_id:'lib1',title:'Statistika kitobi',audience:'university',published:true},{_id:'lib2',title:'Statistika kurs kitobi',audience:'courses',courseIds:[c1],published:true},{_id:'lib3',title:'Statistika maxfiy kitobi',audience:'courses',courseIds:[c2],published:true}],
 Structure:[{_id:g1,name:'Statistika guruh',externalId:'DI-101',type:'group',active:true},{_id:g2,name:'Statistika maxfiy guruh',externalId:'DI-102',type:'group',active:true}],
 User:[{_id:'u1',fullName:'Statistika talaba',login:'student1',groupId:g1,active:true},{_id:'u2',fullName:'Statistika maxfiy talaba',login:'student2',groupId:g2,active:true}],
 LiveSession:[]
};
function matches(row,query){
 return Object.entries(query).every(([key,value])=>{
   if(key==='$and')return value.every(q=>matches(row,q));
   if(key==='$or')return value.some(q=>matches(row,q));
   const field=row[key];
   if(value&&typeof value==='object'&&!Array.isArray(value)){
     if('$in' in value)return value.$in.map(String).includes(String(field))||Array.isArray(field)&&field.some(x=>value.$in.map(String).includes(String(x)));
     if('$ne' in value)return field!==value.$ne;
     if('$regex' in value)return new RegExp(value.$regex,value.$options||'').test(String(Array.isArray(field)?field.join(' '):field||''));
   }
   return String(field)===String(value);
 });
}
function model(type){
 return {find(filter){
   let items=rows[type].filter(item=>matches(item,filter));
   const query={select(){return query},limit(n){items=items.slice(0,n);return query},sort(){return query},lean:async()=>items};
   return query;
 }};
}
const fakeMongoose={models:Object.fromEntries(Object.keys(rows).map(key=>[key,model(key)])),isValidObjectId:x=>typeof x==='string'&&x.length===24,Types:{ObjectId:class {constructor(id){return id}}}};
function makeSearch(){
 let handler=null;
 installGlobalSearch({get:(path,_auth,fn)=>{if(path==='/api/search')handler=fn}},{
   mongoose:fakeMongoose,auth:()=>{},User:model('User'),Structure:model('Structure'),Schedule:model('Schedule'),
   VideoLesson:model('VideoLesson'),LiveSession:model('LiveSession'),
   resolveScope:async()=>({groupIds:[g1]}),
   resolveUserGroupId:async()=>g1,
   hasPermission:(user,action)=>user.role==='admin'&&action==='users.manage'
 });
 return async (role,q='Statistika')=>{
   const req={user:{_id:role==='teacher'?'teacher1':'student1',role},query:{q}};
   const out={headers:{}};
   const res={set:(k,v)=>{out.headers[k]=v},json:data=>{out.data=data;return res},status:s=>{out.status=s;return res}};
   await handler(req,res);
   return out;
 };
}
test('student global search never exposes another group courses, assignments, resources or private library',async()=>{
 const run=makeSearch();
 const out=await run('student');
 assert.ok(out.data.results.some(r=>r.id===c1));
 assert.ok(out.data.results.some(r=>r.id==='a1'));
 assert.ok(out.data.results.some(r=>r.id==='lib1'));
 assert.ok(out.data.results.some(r=>r.id==='lib2'));
 for(const id of [c2,'a2','r2','s2','lib3','v2','u2'])assert.ok(!out.data.results.some(r=>r.id===id),id);
 assert.equal(out.headers['Cache-Control'],'private,no-store');
});
test('teacher search scope follows assigned lessons and subjects; no user records',async()=>{
 const run=makeSearch(),out=await run('teacher');
 assert.ok(out.data.results.some(r=>r.id===c1));
 assert.ok(!out.data.results.some(r=>r.id===c2));
 assert.ok(!out.data.results.some(r=>r.type==='user'));
});
test('global search nav and exact highlighted targets are wired to protected pages',()=>{
 for(const token of ['id="globalSearchOpen"','data-page="search"','id="globalSearchBoard"'])assert.ok(index.includes(token));
 for(const token of ["search:loadGlobalSearch","async function openGlobalSearchResult","highlightSearchTarget","searchTargetById","type==='video'","type==='library'","type==='schedule'","type==='group'","type==='user'"])assert.ok(appCode.includes(token),token);
 for(const token of ["data-search-item=","Ctrl","globalSearchUi.open"])assert.ok(appCode.includes(token),token);
 assert.ok(view.includes("aria-pressed"));
 assert.ok(view.includes('data-search-index'));
 assert.ok(server.includes('installGlobalSearch(app,'));
});
