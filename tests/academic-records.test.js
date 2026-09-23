import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAcademicYear, normalizeScore, scoreToGrade } from '../academic-records.js';

test('academic year must be consecutive and normalized',()=>{
  assert.equal(normalizeAcademicYear('2026/2027'),'2026/2027');
  assert.throws(()=>normalizeAcademicYear('2026-2027'),/2026\/2027/);
  assert.throws(()=>normalizeAcademicYear('2026/2028'),/2026\/2027/);
});
test('academic scores stay in 0-100',()=>{
  assert.equal(normalizeScore('87.555'),87.56);
  assert.throws(()=>normalizeScore(101),/0–100/);
  assert.throws(()=>normalizeScore(-1),/0–100/);
});
test('letter grades are deterministic',()=>{
  assert.equal(scoreToGrade(95),'A');
  assert.equal(scoreToGrade(85),'B');
  assert.equal(scoreToGrade(75),'C');
  assert.equal(scoreToGrade(65),'D');
  assert.equal(scoreToGrade(59.99),'F');
});
