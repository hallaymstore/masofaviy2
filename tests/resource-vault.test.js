import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {parseResourceFilename,acceptableZipEntries,normalizeAssetCourseIds} from '../resource-vault-rules.js';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
test('ZIP filenames produce a topic hint and a human-readable title',()=>{
 const item=parseResourceFilename('01__1-mavzu__Ma’ruza.pdf');
 assert.equal(item.position,1);
 assert.equal(item.topicHint,'1-mavzu');
 assert.equal(item.title,'Ma’ruza');
 assert.equal(item.extension,'.pdf');
});
test('ZIP parser rejects empty archives and suspicious inflation',async()=>{
 const empty=await JSZip.loadAsync(await new JSZip().generateAsync({type:'nodebuffer'}));
 assert.throws(()=>acceptableZipEntries(empty),/fayllar yo‘q/);
 const zip=new JSZip();
 zip.file('01__Intro__Lecture.txt','hello');
 const a=await JSZip.loadAsync(await zip.generateAsync({type:'nodebuffer'}));
 assert.equal(acceptableZipEntries(a).length,1);
});
test('assignments accept 1-30 canonical unique ids only',()=>{
 const a='64cffffff111111111111111';
 assert.deepEqual(normalizeAssetCourseIds([a,a]),[a]);
 assert.throws(()=>normalizeAssetCourseIds([]));
 assert.throws(()=>normalizeAssetCourseIds(['abc']));
});
test('source files are private; shared resource references are not physically deleted when unlinked',()=>{
 const vault=read('resource-vault.js'),lms=read('lms.js'),upload=read('resource-upload.js');
 assert.ok(vault.includes('ownerId:req.user._id'));
 assert.ok(vault.includes("requireStaff(req)"));
 assert.ok(vault.includes("await Promise.all(courseIds.map(id=>courseAccess(req,id,true)))"));
 assert.ok(vault.includes('Asset.find({_id:{$in:assetIds},ownerId:req.user._id,archived:false})'));
 assert.ok(vault.includes("topicHint"));
 assert.ok(upload.includes('if(row.fileId&&!row.vaultAssetId)'));
 assert.ok(lms.includes('installResourceVault('));
});
test('video streaming checks student group and prerequisite, and supports byte ranges',()=>{
 const code=read('video-media.js'),server=read('server.js');
 assert.ok(code.includes('videoAllowedForGroup('));
 assert.ok(code.includes('annotateVideoLocks('));
 assert.ok(code.includes('Content-Range'));
 assert.ok(server.includes('sourceAssetId:sourceAsset?._id'));
 assert.ok(server.includes('coverAssetId:coverAsset?._id'));
 assert.ok(read('resource-vault.js').includes("'/api/lms/my-assets/video-upload'"));
});
test('teacher composer groups courses, private library, ZIP, assignments and videos',()=>{
 const ui=read('public/resource-center-ui.js'),app=read('public/app.js'),plan=read('public/course-plan-ui.js');
 for(const word of ['data-rc-tab','sourceFile','assetIds','courseIds','assignmentTitle','videoAssetId','coverAssetId','/lms/my-assets/assign'])assert.ok(ui.includes(word),word);
 assert.ok(app.includes("openResourceCenter({api,modal,esc,csrf,toast"));
 assert.ok(plan.includes('data-course-create="mine"'));
});
