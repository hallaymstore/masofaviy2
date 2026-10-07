import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const src=path.join(root,'node_modules','@mediapipe','face_detection');
const dest=path.join(root,'public','vendor','face-detection');

try{
  await fs.access(path.join(src,'face_detection.js'));
}catch{
  console.error('MediaPipe face_detection paketi topilmadi. Avval npm install bajaring.');
  process.exit(1);
}

await fs.rm(dest,{recursive:true,force:true});
await fs.mkdir(path.dirname(dest),{recursive:true});
await fs.cp(src,dest,{recursive:true,force:true});

const files=await fs.readdir(dest);
const required=['face_detection.js','face_detection_solution_packed_assets_loader.js','face_detection_solution_wasm_bin.js','face_detection_solution_wasm_bin.wasm'];
const missing=required.filter(name=>!files.includes(name));
if(missing.length){
  console.error('Face detection assetlari to‘liq emas:',missing.join(', '));
  process.exit(1);
}
console.log('Face detection assetlari tayyor:',dest);
