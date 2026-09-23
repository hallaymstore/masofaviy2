import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAcademicYear, normalizeScore, normalizeOutcome } from '../academic-records.js';

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
test('completion outcome is explicit, not inferred from a score',()=>{
  assert.equal(normalizeOutcome('completed'),'completed');
  assert.equal(normalizeOutcome('failed'),'failed');
  assert.throws(()=>normalizeOutcome('passed'),/holatini/);
});
