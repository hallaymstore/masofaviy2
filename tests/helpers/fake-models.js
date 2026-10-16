// Minimal in-memory stand-in for the mongoose model API used by units.js (find/sort/limit/select/lean, findOne,
// findById, findOneAndUpdate, create, updateOne, deleteOne, countDocuments, exists) with the query and update
// operators that module needs. Lets the real Express routes run in tests without a MongoDB server.
import mongoose from 'mongoose';
const S=v=>v===null||v===undefined?v:(v instanceof Date?v.getTime():(typeof v==='object'&&v._bsontype||v instanceof mongoose.Types.ObjectId?String(v):v));
const eq=(a,b)=>{if(Array.isArray(a))return a.some(x=>eq(x,b));if(b instanceof RegExp)return typeof a==='string'&&b.test(a);if(b===null)return a===null||a===undefined;return String(S(a))===String(S(b))};
const cmp=(a,b)=>{const x=S(a),y=S(b);return x<y?-1:x>y?1:0};
function matchValue(val,cond){
  if(cond&&typeof cond==='object'&&!(cond instanceof RegExp)&&!(cond instanceof Date)&&!(cond instanceof mongoose.Types.ObjectId)&&Object.keys(cond).some(k=>k.startsWith('$'))){
    return Object.entries(cond).every(([op,arg])=>{
      if(op==='$in')return arg.some(x=>eq(val,x));
      if(op==='$nin')return !arg.some(x=>eq(val,x));
      if(op==='$ne')return !eq(val,arg);
      if(op==='$lt')return val!==undefined&&val!==null&&cmp(val,arg)<0;
      if(op==='$lte')return val!==undefined&&val!==null&&cmp(val,arg)<=0;
      if(op==='$gt')return val!==undefined&&val!==null&&cmp(val,arg)>0;
      if(op==='$gte')return val!==undefined&&val!==null&&cmp(val,arg)>=0;
      if(op==='$exists')return (val!==undefined)===Boolean(arg);
      if(op==='$type')return arg==='string'?typeof val==='string':true;
      throw new Error('fake: unsupported operator '+op);
    });
  }
  return eq(val,cond);
}
export function matches(doc,q={}){
  return Object.entries(q).every(([k,cond])=>{
    if(k==='$or')return cond.some(c=>matches(doc,c));
    if(k==='$and')return cond.every(c=>matches(doc,c));
    const val=k.split('.').reduce((o,p)=>o?.[p],doc);
    return matchValue(val,cond);
  });
}
const clone=v=>{if(v instanceof mongoose.Types.ObjectId||v instanceof RegExp||v===null||typeof v!=='object')return v;if(v instanceof Date)return new Date(v);if(Buffer.isBuffer(v))return Buffer.from(v);if(Array.isArray(v))return v.map(clone);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]))};
function applyUpdate(doc,u,insert=false){
  const ops=Object.keys(u).some(k=>k.startsWith('$'))?u:{$set:u};
  for(const [op,obj] of Object.entries(ops)){
    for(const [k,v] of Object.entries(obj||{})){
      if(op==='$set')doc[k]=v;
      else if(op==='$setOnInsert'){if(insert)doc[k]=v}
      else if(op==='$inc')doc[k]=(doc[k]||0)+v;
      else if(op==='$push'){if(v&&typeof v==='object'&&Array.isArray(v.$each))(doc[k]||=[]).push(...clone(v.$each));else (doc[k]||=[]).push(v)}
      else if(op==='$addToSet'){doc[k]||=[];if(!doc[k].some(x=>eq(x,v)))doc[k].push(v)}
      else if(op==='$pull')doc[k]=(doc[k]||[]).filter(x=>!eq(x,v));
      else throw new Error('fake: unsupported update '+op);
    }
  }
  doc.updatedAt=new Date();return doc;
}
class Query{
  constructor(run){this.run=run;this._sort=null;this._limit=0}
  sort(s){this._sort=s;return this}limit(n){this._limit=n;return this}select(){return this}populate(){return this}lean(){return this}
  exec(){let rows=this.run();if(Array.isArray(rows)){if(this._sort){const keys=Object.entries(this._sort);rows=rows.slice().sort((a,b)=>{for(const [k,d] of keys){const x=a[k],y=b[k];if(x===y||(x==null&&y==null))continue;if(x==null)return 1;if(y==null)return -1;const c=cmp(x,y);if(c)return c*d}return 0})}if(this._limit)rows=rows.slice(0,this._limit)}return Promise.resolve(rows===null?null:clone(rows))}
  then(a,b){return this.exec().then(a,b)}catch(b){return this.exec().catch(b)}
}
export function fakeModel(defaults={}){
  const rows=[];
  const M={
    rows,
    find:q=>new Query(()=>rows.filter(r=>matches(r,q))),
    findOne:q=>new Query(()=>rows.find(r=>matches(r,q))||null),
    findById:id=>new Query(()=>rows.find(r=>eq(r._id,id))||null),
    async create(doc){const now=new Date();const d={...clone(defaults),...doc,_id:doc._id||new mongoose.Types.ObjectId(),createdAt:now,updatedAt:now};rows.push(d);return {...clone(d),id:String(d._id)}},
    findOneAndUpdate(q,u,opt={}){return new Query(()=>{let d=rows.find(r=>matches(r,q));if(!d){if(!opt.upsert)return null;d={...clone(defaults),...Object.fromEntries(Object.entries(q).filter(([,v])=>typeof v!=='object'||v instanceof mongoose.Types.ObjectId)),_id:new mongoose.Types.ObjectId(),createdAt:new Date()};rows.push(d);applyUpdate(d,u,true)}else applyUpdate(d,u);return d})},
    async updateOne(q,u){const d=rows.find(r=>matches(r,q));if(d)applyUpdate(d,u);return {matchedCount:d?1:0}},
    async deleteOne(q){const i=rows.findIndex(r=>matches(r,q));if(i>=0)rows.splice(i,1);return {deletedCount:i>=0?1:0}},
    async countDocuments(q={}){return rows.filter(r=>matches(r,q)).length},
    async exists(q){const d=rows.find(r=>matches(r,q));return d?{_id:d._id}:null}
  };
  return M;
}
