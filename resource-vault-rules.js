// Deterministic file naming convention: NN__Topic title__Resource title.ext
// Titles and topic hints are metadata only; never used as filesystem paths.
import path from 'node:path';
export function parseResourceFilename(filename){
 const original=path.posix.basename(String(filename||'').replaceAll('\\','/')).slice(0,160);
 const extension=path.extname(original).toLowerCase();
 const stem=original.slice(0,-extension.length).replace(/[_-]+/g,' ').trim();
 const parts=original.slice(0,-extension.length).split('__').map(x=>x.trim()).filter(Boolean);
 const numbered=parts.length>=2&&/^\d{1,3}$/.test(parts[0]);
 const position=numbered?Number(parts[0]):null;
 const topicHint=numbered?(parts.length>=3?parts[1]:parts[1]):'';
 const title=numbered?(parts.length>=3?parts.slice(2).join(' '):parts[1]):stem;
 return {original,extension,position,topicHint:topicHint.slice(0,180),title:(title||stem||original).slice(0,180)};
}
export function acceptableZipEntries(zip,{maxEntries=35,maxExpandedBytes=90*1024*1024,maxFileBytes=35*1024*1024}={}){
 const files=Object.values(zip.files).filter(x=>!x.dir&&!/(^|\/)__(MACOSX|DS_Store)/i.test(x.name)&&!/(^|\/)\./.test(x.name));
 if(!files.length)throw new Error('ZIP ichida fayllar yo‘q');
 if(files.length>maxEntries)throw new Error('ZIP ichida 35 tadan ko‘p fayl bo‘lmasin');
 let total=0;
 for(const item of files){
   const bytes=Number(item._data?.uncompressedSize)||0,compressed=Number(item._data?.compressedSize)||0;
   if(!bytes||bytes>maxFileBytes)throw new Error('ZIP ichida hajmi oshgan yoki bo‘sh fayl mavjud');
   if(bytes>Math.max(500000,compressed*120))throw new Error('ZIP siqilish nisbati xavfli');
   total+=bytes;
   if(total>maxExpandedBytes)throw new Error('ZIP ochilganda hajm 90 MB dan oshmasin');
 }
 return files;
}
export function normalizeAssetCourseIds(value){
 if(!Array.isArray(value)||value.length<1||value.length>30)throw new Error('1–30 ta fan tanlang');
 const ids=[...new Set(value.map(x=>String(x||'')))];
 if(ids.some(x=>!/^[a-f\d]{24}$/i.test(x)))throw new Error('Fan ID noto‘g‘ri');
 return ids;
}
