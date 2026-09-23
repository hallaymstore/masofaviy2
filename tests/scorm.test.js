import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import JSZip from 'jszip';
import { inspectScormZip, runtimeShim } from '../scorm.js';

const manifest='<manifest><organizations default="o"><organization identifier="o"><item identifierref="r"/></organization></organizations><resources><resource identifier="r" href="index.html"/></resources></manifest>';
async function packageBuffer(extra={}){const zip=new JSZip();zip.file('imsmanifest.xml',manifest);zip.file('index.html','<html><head></head><body>Lesson</body></html>');for(const [name,body] of Object.entries(extra))zip.file(name,body);return zip.generateAsync({type:'nodebuffer'})}

test('SCORM importer finds launch file and counts resources',async()=>{
  const result=await inspectScormZip(await packageBuffer({'assets/page.js':'console.log(1)'}));
  assert.equal(result.launch,'index.html');assert.equal(result.fileCount,3);assert.equal(result.scoes.length,1);
});
test('SCORM importer discovers nested multi-SCO organization items',async()=>{
  const zip=new JSZip();
  zip.file('imsmanifest.xml','<manifest><organizations default="org"><organization identifier="org"><item identifier="folder"><title>Module</title><item identifier="a" identifierref="ra"><title>Lesson A</title></item><item identifier="b" identifierref="rb"><title>Lesson B</title></item></item></organization></organizations><resources><resource identifier="ra" href="a/index.html"/><resource identifier="rb" href="b/index.html"/></resources></manifest>');
  zip.file('a/index.html','<html></html>');zip.file('b/index.html','<html></html>');
  const result=await inspectScormZip(await zip.generateAsync({type:'nodebuffer'}));
  assert.deepEqual(result.scoes.map(x=>[x.identifier,x.title,x.launch]),[['a','Lesson A','a/index.html'],['b','Lesson B','b/index.html']]);
});
test('SCORM importer rejects missing manifest',async()=>{
  const zip=new JSZip();zip.file('index.html','Hello');await assert.rejects(inspectScormZip(await zip.generateAsync({type:'nodebuffer'})),/imsmanifest/);
});
test('SCORM 2004 is never mislabeled as 1.2',async()=>{
  const zip=new JSZip();zip.file('imsmanifest.xml',manifest.replace('<manifest>','<manifest><metadata><schemaversion>2004 4th Edition</schemaversion></metadata>'));zip.file('index.html','<html></html>');
  await assert.rejects(inspectScormZip(await zip.generateAsync({type:'nodebuffer'})),/SCORM 2004/);
});
test('SCORM importer rejects path traversal in an archive',async()=>{
  const zip=new JSZip();zip.file('imsmanifest.xml',manifest);zip.file('index.html','<html></html>');zip.file('../outside.js','bad');
  await assert.rejects(inspectScormZip(await zip.generateAsync({type:'nodebuffer'})),/xavfli/);
});
test('SCORM runtime exposes 1.2 methods, resumes before async messaging and reports commits',()=>{
  const messages=[],context={window:{addEventListener(){}},parent:{postMessage:x=>messages.push(x)}};
  vm.runInNewContext(runtimeShim('token',{}, {'cmi.core.lesson_status':'incomplete','cmi.core.lesson_location':'p4'}),context);
  assert.equal(context.window.API.LMSInitialize(''),'true');
  assert.equal(context.window.API.LMSGetValue('cmi.core.entry'),'resume');
  assert.equal(context.window.API.LMSGetValue('cmi.core.lesson_location'),'p4');
  assert.equal(context.window.API.LMSSetValue('cmi.core.lesson_status','completed'),'true');
  assert.equal(context.window.API.LMSSetValue('secret.admin','yes'),'false');
  assert.equal(context.window.API.LMSCommit(''),'true');
  assert.equal(messages.at(-1).values['cmi.core.lesson_status'],'completed');
});

test('runtime shim escapes script-closing user data',()=>{
  const shim=runtimeShim('token',{name:'</script><script>alert(1)</script>'},{'cmi.suspend_data':'</script>'});
  assert.equal(shim.includes('</script>'),false);
  assert.match(shim,/\\u003c/);
});
