import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import JSZip from 'jszip';
import { inspectScormZip, runtimeShim } from '../scorm.js';

const manifest='<manifest><organizations default="o"><organization identifier="o"><item identifierref="r"/></organization></organizations><resources><resource identifier="r" href="index.html"/></resources></manifest>';
async function packageBuffer(extra={}){const zip=new JSZip();zip.file('imsmanifest.xml',manifest);zip.file('index.html','<html><head></head><body>Lesson</body></html>');for(const [name,body] of Object.entries(extra))zip.file(name,body);return zip.generateAsync({type:'nodebuffer'})}

test('SCORM importer finds launch file and counts resources',async()=>{
  const result=await inspectScormZip(await packageBuffer({'assets/page.js':'console.log(1)'}));
  assert.equal(result.launch,'index.html');assert.equal(result.fileCount,3);
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
test('SCORM runtime exposes 1.2 methods and reports commits',()=>{
  const messages=[],context={window:{addEventListener(){}},parent:{postMessage:x=>messages.push(x)}};
  vm.runInNewContext(runtimeShim('token'),context);
  assert.equal(context.window.API.LMSInitialize(''),'true');
  assert.equal(context.window.API.LMSSetValue('cmi.core.lesson_status','completed'),'true');
  assert.equal(context.window.API.LMSSetValue('secret.admin','yes'),'false');
  assert.equal(context.window.API.LMSCommit(''),'true');
  assert.equal(messages.at(-1).values['cmi.core.lesson_status'],'completed');
});
