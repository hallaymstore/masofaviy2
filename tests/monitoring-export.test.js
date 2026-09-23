import test from 'node:test';
import assert from 'node:assert/strict';
import {stableMonitoringHash,validateReceiptReference,validateMonitoringGatewayUrl} from '../monitoring-export.js';

test('monitoring hash is deterministic for identical payload',()=>{
  const payload={schema:'v1',rows:[{id:'1',value:2}]};
  assert.equal(stableMonitoringHash(payload),stableMonitoringHash(payload));
  assert.notEqual(stableMonitoringHash(payload),stableMonitoringHash({...payload,rows:[{id:'1',value:3}]}));
});

test('monitoring gateway must be HTTPS and contain no embedded credential',()=>{
  assert.match(validateMonitoringGatewayUrl('https://gateway.example.uz/api/sync'),/^https:/);
  assert.throws(()=>validateMonitoringGatewayUrl('http://gateway.example.uz/api/sync'),/HTTPS/);
  assert.throws(()=>validateMonitoringGatewayUrl('https://user:pass@gateway.example.uz/api/sync'),/credential/);
});

test('official receipt reference has bounded length',()=>{
  assert.equal(validateReceiptReference('REQ-123'),'REQ-123');
  assert.throws(()=>validateReceiptReference('x'),/3–500/);
});
