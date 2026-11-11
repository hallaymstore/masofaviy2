import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { XP, levelFor, levelStart, xpFor, streakFor, badgesFor, rankRows, shortName } from '../gamification-rules.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('XP comes only from recorded learning activity', () => {
  assert.equal(xpFor({ present: 3, late: 1, submission: 2, quiz: 1, video: 5 }), 3 * XP.present + XP.late + 2 * XP.submission + XP.quiz + 5 * XP.video);
  assert.equal(xpFor({ present: -4, unknown: 99 }), 0);
});

test('levels grow 100, 300, 600 … and report progress to the next one', () => {
  assert.deepEqual([1, 2, 3, 4].map(levelStart), [0, 100, 300, 600]);
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(99).level, 1);
  assert.equal(levelFor(100).level, 2);
  const mid = levelFor(450);
  assert.equal(mid.level, 3);
  assert.equal(mid.progress, 50);
  assert.equal(levelFor(1e7).title, 'Afsona');
});

test('streak counts consecutive days and survives until the student shows up today', () => {
  const days = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];
  assert.deepEqual(streakFor(days, '2026-11-10'), { current: 4, best: 4, activeToday: true });
  assert.equal(streakFor(days, '2026-11-11').current, 4);
  assert.equal(streakFor(days, '2026-11-12').current, 0);
  assert.equal(streakFor(['2026-11-01', '2026-11-02', '2026-11-05'], '2026-11-05').best, 2);
});

test('badges unlock at their goals and show progress before that', () => {
  const badges = badgesFor({ attended: 30, bestStreak: 3, submission: 0, xp: 400 });
  const by = id => badges.find(b => b.id === id);
  assert.ok(by('first-lesson').unlocked && by('regular').unlocked && by('streak-3').unlocked);
  assert.equal(by('centurion').unlocked, false);
  assert.equal(by('centurion').value, 30);
  assert.equal(by('first-task').value, 0);
});

test('leaderboard shows short names, keeps the student visible outside the top', () => {
  assert.equal(shortName('Karimov Aziz Bahodir o‘g‘li'), 'Aziz K.');
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: 'u' + i, name: 'Familiya' + i + ' Ism' + i, xp: 1000 - i * 10 }));
  const board = rankRows(rows, 'u14', 10);
  assert.equal(board.rows.length, 11);
  assert.equal(board.myRank, 15);
  assert.ok(board.rows.at(-1).self);
  assert.equal(board.rows[0].rank, 1);
});

test('API is student-only, read-only and wired into the server and the page', () => {
  const api = read('gamification.js'), server = read('server.js'), html = read('public/index.html'), ui = read('public/gamification-ui.js');
  assert.ok(api.includes("app.get('/api/gamification/me', auth"));
  assert.ok(api.includes("req.user.role !== 'student'"));
  assert.ok(!/\.(create|save|updateOne|insertMany|findOneAndUpdate)\(/.test(api), 'no writes');
  assert.ok(server.includes('installGamification(app,'));
  for (const f of ['/gamification.css', '/gamification-ui.js', '/robot-tour.js']) assert.ok(html.includes(f), f);
  assert.ok(ui.includes("new CustomEvent('hallaym:robot'"));
  assert.ok(read('public/campus-game.js').includes("window.addEventListener('hallaym:robot'"));
  assert.ok(ui.includes('function esc('), 'names are escaped');
});

test('tour is shown once, keyboard friendly and skippable', () => {
  const tour = read('public/robot-tour.js');
  assert.ok(tour.includes("var KEY = 'hx-tour-v1'"));
  assert.ok(tour.includes("aria-modal=\"true\""));
  assert.ok(tour.includes("e.key === 'Escape'"));
  assert.ok(tour.includes('window.hxStartTour = start'));
});
