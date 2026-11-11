// Pure helpers for the campus hub: calendar days, student risk and
// tamper-evident certificate codes.
import crypto from 'node:crypto';

export const PASS_SCORE = 55;

export function monthDays(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return null;
  const year = Number(m[1]), mon = Number(m[2]);
  if (mon < 1 || mon > 12 || year < 2000 || year > 2100) return null;
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const key = `${m[1]}-${m[2]}-${String(i + 1).padStart(2, '0')}`;
    return { key, weekday: new Date(key + 'T00:00:00Z').getUTCDay() || 7 };
  });
}

// 0–100. Attendance carries most weight, then missed deadlines, then grades.
export function riskFor({ rate = 100, expected = 0, missing = 0, avgPct = null } = {}) {
  const reasons = [];
  let score = 0;
  if (expected >= 3) {
    score += Math.max(0, 80 - rate) * 0.75;
    if (rate < 60) reasons.push(`Davomat ${rate}%`);
  }
  if (missing > 0) { score += Math.min(30, missing * 10); reasons.push(`${missing} ta vazifa topshirilmagan`); }
  if (avgPct !== null && avgPct < 60) { score += Math.min(25, (60 - avgPct) * 0.6); reasons.push(`O‘rtacha baho ${avgPct}%`); }
  score = Math.round(Math.min(100, score));
  return { score, level: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low', reasons };
}

const b64 = buf => Buffer.from(buf).toString('base64url');

export function certificateCode(secret, studentId, courseId) {
  const body = `${studentId}.${courseId}`;
  const sig = crypto.createHmac('sha256', secret).update('cert:' + body).digest().subarray(0, 12);
  return `${b64(body)}.${b64(sig)}`;
}

export function readCertificateCode(secret, code) {
  const [body64, sig64] = String(code || '').split('.');
  if (!body64 || !sig64 || code.length > 200) return null;
  let body;
  try { body = Buffer.from(body64, 'base64url').toString('utf8'); } catch { return null; }
  const [studentId, courseId] = body.split('.');
  if (!/^[a-f0-9]{24}$/i.test(studentId || '') || !/^[a-f0-9]{24}$/i.test(courseId || '')) return null;
  const expected = certificateCode(secret, studentId, courseId).split('.')[1];
  const a = Buffer.from(expected), b = Buffer.from(sig64);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { studentId, courseId };
}
