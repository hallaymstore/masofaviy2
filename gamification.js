// Student achievements: XP, level, streak, badges and a group leaderboard.
// Read-only: it aggregates attendance, submissions, quiz attempts and verified
// video completions that other modules already record.
import { xpFor, levelFor, streakFor, badgesFor, rankRows } from './gamification-rules.js';

const LEADERBOARD_LIMIT = 300;

export function installGamification(app, { mongoose, auth, User, Attendance, resolveUserGroupId, localDateKey }) {
  const model = name => mongoose.models[name];
  const ready = () => mongoose.connection.readyState === 1;

  async function countsFor(ids) {
    const Submission = model('Submission'), Attempt = model('QuizAttempt'), Video = model('VideoProgress');
    const [attendance, submissions, quizzes, videos] = await Promise.all([
      Attendance.aggregate([
        { $match: { userId: { $in: ids }, status: { $in: ['present', 'late'] } } },
        { $group: { _id: { u: '$userId', l: '$lessonId', d: '$dateKey' }, status: { $first: '$status' } } },
        { $group: { _id: { u: '$_id.u', s: '$status' }, n: { $sum: 1 } } }
      ]),
      Submission ? Submission.aggregate([{ $match: { studentId: { $in: ids }, submittedAt: { $ne: null } } }, { $group: { _id: '$studentId', n: { $sum: 1 } } }]) : [],
      Attempt ? Attempt.aggregate([{ $match: { studentId: { $in: ids }, submittedAt: { $ne: null } } }, { $group: { _id: '$studentId', n: { $sum: 1 } } }]) : [],
      Video ? Video.aggregate([{ $match: { userId: { $in: ids }, $or: [{ verifiedCompleted: true }, { completed: true }] } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]) : []
    ]);
    const map = new Map(ids.map(id => [String(id), { present: 0, late: 0, submission: 0, quiz: 0, video: 0 }]));
    for (const row of attendance) { const c = map.get(String(row._id.u)); if (c) c[row._id.s] = row.n; }
    for (const [list, key] of [[submissions, 'submission'], [quizzes, 'quiz'], [videos, 'video']]) {
      for (const row of list) { const c = map.get(String(row._id)); if (c) c[key] = row.n; }
    }
    return map;
  }

  async function activeDays(userId) {
    const since = new Date(Date.now() - 400 * 86400000);
    const Submission = model('Submission'), Video = model('VideoProgress');
    const [attendance, submissions, videos] = await Promise.all([
      Attendance.find({ userId, status: { $in: ['present', 'late'] }, createdAt: { $gte: since } }).select('dateKey createdAt').lean(),
      Submission ? Submission.find({ studentId: userId, submittedAt: { $gte: since } }).select('submittedAt').lean() : [],
      Video ? Video.find({ userId, completedAt: { $gte: since } }).select('completedAt').lean() : []
    ]);
    return [
      ...attendance.map(x => x.dateKey || localDateKey(x.createdAt)),
      ...submissions.map(x => localDateKey(x.submittedAt)),
      ...videos.map(x => localDateKey(x.completedAt))
    ];
  }

  app.get('/api/gamification/me', auth, async (req, res) => {
    try {
      if (req.user.role !== 'student') return res.json({ enabled: false });
      if (!ready() || !mongoose.isValidObjectId(req.user._id)) return res.json({ enabled: true, demo: true, ...summary({ present: 0 }, [], [], localDateKey()) });
      const self = new mongoose.Types.ObjectId(String(req.user._id));
      const groupId = await resolveUserGroupId(req.user);
      const members = groupId ? await User.find({ groupId, role: 'student', active: { $ne: false } }).select('_id fullName').limit(LEADERBOARD_LIMIT).lean() : [];
      const ids = members.some(m => String(m._id) === String(self)) ? members.map(m => m._id) : [self, ...members.map(m => m._id)];
      const [counts, days] = await Promise.all([countsFor(ids), activeDays(self)]);
      const board = members.map(m => ({ id: m._id, name: m.fullName, xp: xpFor(counts.get(String(m._id))) }));
      res.json({ enabled: true, ...summary(counts.get(String(self)), days, board, localDateKey(), self) });
    } catch (error) {
      console.error('gamification', error);
      res.status(500).json({ error: 'Yutuqlarni hisoblab bo‘lmadi' });
    }
  });

  function summary(counts = {}, days, board, today, self) {
    const xp = xpFor(counts), streak = streakFor(days, today);
    const attended = (counts.present || 0) + (counts.late || 0);
    return {
      xp, level: levelFor(xp), streak, counts: { ...counts, attended },
      badges: badgesFor({ ...counts, attended, xp, bestStreak: streak.best }),
      leaderboard: rankRows(board, self)
    };
  }
}
