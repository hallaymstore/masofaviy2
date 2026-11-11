// Pure rules for student XP, levels, streaks and badges. Everything here is
// derived from records the platform already keeps (attendance, submissions,
// quiz attempts, completed videos), so nothing can be farmed by clicking.

export const XP = { present: 10, late: 5, submission: 20, quiz: 15, video: 8 };

export const LEVEL_TITLES = ['Yangi talaba', 'Izlanuvchi', 'Bilimdon', 'Faol talaba', 'Iqtidorli', 'Akademik', 'Olim', 'Professor', 'Afsona'];

// Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, 1500 …
export const levelStart = level => 50 * level * (level - 1);

export function levelFor(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (levelStart(level + 1) <= total) level += 1;
  const from = levelStart(level), to = levelStart(level + 1);
  return {
    level, xp: total, from, to,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    progress: Math.round(((total - from) / (to - from)) * 100)
  };
}

export function xpFor(counts = {}) {
  return Object.keys(XP).reduce((sum, key) => sum + XP[key] * Math.max(0, Number(counts[key]) || 0), 0);
}

const dayMs = 86400000;
const keyToDay = key => Math.floor(Date.parse(key + 'T00:00:00Z') / dayMs);

// Consecutive active days ending today (or yesterday, so the streak survives
// until the student has had a chance to show up today). Keys are YYYY-MM-DD.
export function streakFor(dayKeys = [], todayKey) {
  const days = new Set(dayKeys.filter(Boolean).map(keyToDay).filter(Number.isFinite));
  const today = keyToDay(todayKey);
  let cursor = days.has(today) ? today : today - 1, streak = 0;
  while (days.has(cursor)) { streak += 1; cursor -= 1; }
  let best = 0, run = 0, prev = null;
  for (const day of [...days].sort((a, b) => a - b)) { run = prev !== null && day === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = day; }
  return { current: streak, best, activeToday: days.has(today) };
}

export const BADGES = [
  { id: 'first-lesson', icon: 'spark', title: 'Birinchi qadam', desc: 'Birinchi darsda qatnashing', metric: 'attended', goal: 1 },
  { id: 'regular', icon: 'calendar', title: 'Doimiy ishtirokchi', desc: '25 ta darsda qatnashing', metric: 'attended', goal: 25 },
  { id: 'centurion', icon: 'crown', title: 'Yuz dars', desc: '100 ta darsda qatnashing', metric: 'attended', goal: 100 },
  { id: 'streak-3', icon: 'flame', title: 'Uch kunlik olov', desc: '3 kun ketma-ket faol bo‘ling', metric: 'bestStreak', goal: 3 },
  { id: 'streak-7', icon: 'flame', title: 'Haftalik seriya', desc: '7 kun ketma-ket faol bo‘ling', metric: 'bestStreak', goal: 7 },
  { id: 'first-task', icon: 'check', title: 'Ilk topshiriq', desc: 'Birinchi vazifani topshiring', metric: 'submission', goal: 1 },
  { id: 'task-master', icon: 'stack', title: 'Vazifa ustasi', desc: '10 ta vazifa topshiring', metric: 'submission', goal: 10 },
  { id: 'quiz-hero', icon: 'bolt', title: 'Test qahramoni', desc: '5 ta test yeching', metric: 'quiz', goal: 5 },
  { id: 'cinephile', icon: 'play', title: 'Videodars ishqibozi', desc: '10 ta videodarsni tugating', metric: 'video', goal: 10 },
  { id: 'scholar', icon: 'star', title: 'Ming ball', desc: '1000 XP to‘plang', metric: 'xp', goal: 1000 }
];

export function badgesFor(metrics = {}) {
  return BADGES.map(badge => {
    const value = Math.max(0, Number(metrics[badge.metric]) || 0);
    return { id: badge.id, icon: badge.icon, title: badge.title, desc: badge.desc, goal: badge.goal, value: Math.min(value, badge.goal), unlocked: value >= badge.goal };
  });
}

// Leaderboard rows show a first name and the initial of the surname only.
export function shortName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Talaba';
  return parts.length > 1 ? `${parts[1]} ${parts[0][0]}.` : parts[0];
}

export function rankRows(rows, selfId, limit = 10) {
  const sorted = [...rows].sort((a, b) => b.xp - a.xp || String(a.name).localeCompare(String(b.name)));
  const ranked = sorted.map((row, index) => ({ rank: index + 1, name: shortName(row.name), xp: row.xp, level: levelFor(row.xp).level, self: String(row.id) === String(selfId) }));
  const top = ranked.slice(0, limit);
  const me = ranked.find(row => row.self);
  if (me && !top.includes(me)) top.push(me);
  return { rows: top, total: ranked.length, myRank: me?.rank || null };
}
