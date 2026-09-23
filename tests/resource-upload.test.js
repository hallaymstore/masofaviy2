import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { checkResourceHeader, validateOfficePackage } from '../resource-upload.js';

test('allows actual PDF and UTF-8 text',async()=>{
  assert.equal((await checkResourceHeader('dars.pdf',Buffer.from('%PDF-1.7\n'))).mimeType,'application/pdf');
  assert.equal((await checkResourceHeader('subtitles.vtt',Buffer.from('WEBVTT\n'))).kind,'document');
});
test('rejects a renamed executable and unsupported HTML',async()=>{
  await assert.rejects(checkResourceHeader('dars.pdf',Buffer.from('MZ\0\0'+'x'.repeat(100))),/mos emas/);
  await assert.rejects(checkResourceHeader('lesson.html',Buffer.from('<script>alert(1)</script>')),/ruxsat etilmagan/);
});
test('checks Office ZIP internal type, not just filename',async()=>{
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types/>');zip.file('word/document.xml','<w:document/>');const data=await zip.generateAsync({type:'nodebuffer'});
  const type=await checkResourceHeader('dars.docx',data.subarray(0,8192));assert.equal(type.kind,'document');
  await validateOfficePackage(Readable.from([data]),'docx',data.length);
  await assert.rejects(validateOfficePackage(Readable.from([data]),'xlsx',data.length),/mos emas/);
});
