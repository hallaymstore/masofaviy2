// Pure helpers shared by server search and regression tests.
export const SEARCH_TYPES=Object.freeze(['course','assignment','resource','quiz','video','schedule','library','group','user','history']);
export function normalizeSearchQuery(input){
 const q=String(input||'').trim().replace(/\s+/g,' ').slice(0,80);
 if(q.length<2)throw Object.assign(new Error('Qidiruvga kamida 2 ta belgi kiriting'),{status:400});
 return q;
}
export function safeSearchRegex(query){return String(query).replace(/[.*+?^$\x7b\x7d()|[\]\\]/g,'\\$&')}
export function searchRank(title,body,query){
 const q=String(query).toLocaleLowerCase('uz').trim(),name=String(title||'').toLocaleLowerCase('uz'),detail=String(body||'').toLocaleLowerCase('uz');
 if(name===q)return 120;
 if(name.startsWith(q))return 95;
 if(name.includes(q))return 70;
 if(detail.startsWith(q))return 55;
 if(detail.includes(q))return 35;
 return 0;
}
export function buildSearchHit({type,id,title,subtitle='',page,courseId,groupId,query}){
 const label=String(title||'').slice(0,240),description=String(subtitle||'').slice(0,320);
 return {type,id:String(id),title:label,subtitle:description,page,courseId:courseId?String(courseId):null,groupId:groupId?String(groupId):null,score:Math.max(10,searchRank(label,description,query))};
}
