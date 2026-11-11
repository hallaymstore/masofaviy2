import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthDays, riskFor, certificateCode, readCertificateCode } from '../hub-rules.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ID_A = '64b7f0c2a1b2c3d4e5f60718', ID_B = '64b7f0c2a1b2c3d4e5f60719';

test('month grid has the right days and Monday-first weekdays', () => {
  const nov = monthDays('2026-11');
  assert.equal(nov.length, 30);
  assert.deepEqual(nov[0], { key: '2026-11-01', weekday: 7 });
  assert.equal(nov[1].weekday, 1);
  assert.equal(monthDays('2028-02').length, 29);
  for (const bad of ['2026-13', '26-11', '', '2026-1', 'x']) assert.equal(monthDays(bad), null, bad);
});

test('risk grows with absences, missed work and low grades', () => {
  assert.equal(riskFor({ rate: 95, expected: 20, missing: 0, avgPct: 90 }).level, 'low');
  const mid = riskFor({ rate: 55, expected: 20, missing: 1, avgPct: 70 });
  assert.equal(mid.level, 'medium');
  assert.ok(mid.reasons.includes('Davomat 55%'));
  const high = riskFor({ rate: 20, expected: 20, missing: 4, avgPct: 30 });
  assert.equal(high.level, 'high');
  assert.ok(high.score <= 100);
  assert.equal(riskFor({ rate: 0, expected: 1 }).score, 0, 'too few lessons to judge attendance');
});

test('certificate codes verify and reject tampering', () => {
  const code = certificateCode('s3cret', ID_A, ID_B);
  assert.deepEqual(readCertificateCode('s3cret', code), { studentId: ID_A, courseId: ID_B });
  assert.equal(readCertificateCode('other', code), null);
  const forged = Buffer.from(`${ID_B}.${ID_B}`).toString('base64url') + '.' + code.split('.')[1];
  assert.equal(readCertificateCode('s3cret', forged), null);
  for (const bad of ['', 'x.y', 'a'.repeat(300), code + 'x']) assert.equal(readCertificateCode('s3cret', bad), null, bad);
});

test('hub API is read-only, scoped and wired', () => {
  const api = read('hub.js'), server = read('server.js');
  assert.ok(!/\.(create|save|updateOne|updateMany|insertMany|findOneAndUpdate|deleteOne|deleteMany)\(/.test(api), 'no writes');
  assert.ok(api.includes("user.role !== 'teacher' && !hasPermission(user, 'analytics.view')"));
  assert.ok(api.includes("req.user.role !== 'student'"));
  for (const route of ["'/api/hub/calendar', auth", "'/api/hub/notifications', auth", "'/api/hub/at-risk', auth", "'/api/hub/certificates', auth", "'/api/certificates/verify/:code'"]) assert.ok(api.includes(route), route);
  assert.ok(server.includes('installHub(app,') && server.includes('secret:JWT_SECRET'));
});

test('hub UI escapes server text, is keyboard reachable and loads on the page', () => {
  const ui = read('public/hub-ui.js'), html = read('public/index.html'), cert = read('public/certificate.html');
  assert.ok(ui.includes('function esc('));
  assert.ok(ui.includes("aria-haspopup=\"dialog\"") && ui.includes("e.key === 'Escape'"));
  assert.ok(ui.includes('aria-modal="true"'));
  assert.ok(html.includes('/hub-ui.js') && html.includes('/hub.css'));
  assert.ok(cert.includes('/certificate.js') && cert.includes('/vendor/qrcode.js') && !/<script>(?!<\/script>)/.test(cert), 'no inline script (CSP)');
  assert.ok(read('public/hub.css').includes('@media print'));
});
