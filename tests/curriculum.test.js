import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCurriculumRows} from '../curriculum.js';

const b64=text=>Buffer.from(text,'utf8').toString('base64');

test('curriculum CSV accepts Uzbek headers and normalizes subjects',async()=>{
  const rows=await parseCurriculumRows({filename:'reja.csv',contentBase64:b64('semestr,fan_kodi,fan_nomi,kredit,til,fan_dasturi,amaliyot\n1,MAT101,Oliy matematika,6,uz,https://example.uz/math,true\n1,FIZ101,Fizika,5,uz,,ha\n')});
  assert.equal(rows.length,2);assert.equal(rows[0].semester,1);assert.equal(rows[0].credits,6);assert.equal(rows[0].practiceRequired,true);assert.equal(rows[1].code,'FIZ101');
});
test('curriculum rejects duplicate subject code inside one semester',async()=>{
  await assert.rejects(parseCurriculumRows({filename:'reja.csv',contentBase64:b64('semester,code,title,credits\n1,A,Fan A,5\n1,A,Fan A2,4\n')}),/takrorlangan/);
});
test('curriculum rejects non-HTTPS syllabus links',async()=>{
  await assert.rejects(parseCurriculumRows({filename:'reja.csv',contentBase64:b64('semester,code,title,credits,syllabus_url\n1,A,Fan A,5,http://example.uz/a\n')}),/HTTPS/);
});
