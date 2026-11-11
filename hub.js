// Campus hub: month calendar, notification feed, at-risk students and
// verifiable course certificates. Everything is derived from records other
// modules own; this module never writes to the database.
import { monthDays, riskFor, certificateCode, readCertificateCode, PASS_SCORE } from './hub-rules.js';

export function installHub(app, deps) {
  const { mongoose, auth, User, Schedule, Attendance, resolveUserGroupId, resolveScope, hasPermission, localDateKey, localNow, lessonRunsOn, rangeBounds, weekdayOccurrences, secret } = deps;
  const model = name => mongoose.models[name];
  const ready = () => mongoose.connection.readyState === 1;
  const oid = value => mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;
  const fail = (res, error, message) => { console.error('hub', error); res.status(500).json({ message }); };

  async function lessonRows(user) {
    if (user.role === 'student') {
      const gid = await resolveUserGroupId(user);
      return gid ? Schedule.find({ groupId: gid }).lean() : [];
    }
    if (user.role === 'teacher') return Schedule.find({ teacherId: user._id }).lean();
    const scope = await resolveScope(user, {});
    return Schedule.find(scope.scheduleScope || {}).limit(600).lean();
  }

  async function courseIdsFor(user) {
    const Course = model('Course');
    if (!Course) return [];
    if (user.role === 'student') {
      const gid = await resolveUserGroupId(user);
      return gid ? (await Course.find({ groupId: gid }).select('_id').lean()).map(c => c._id) : [];
    }
    if (user.role === 'teacher') return (await Course.find({ teacherId: user._id }).select('_id').lean()).map(c => c._id);
    return [];
  }

  const runsOn = (row, day) => row.date ? row.date === day.key : row.weekday === day.weekday && lessonRunsOn(row, day.key);

  // ---- calendar ----------------------------------------------------------
  app.get('/api/hub/calendar', auth, async (req, res) => {
    try {
      const days = monthDays(req.query.month || localDateKey().slice(0, 7));
      if (!days) return res.status(400).json({ message: 'Oy noto‘g‘ri: YYYY-MM' });
      const out = Object.fromEntries(days.map(d => [d.key, []]));
      if (!ready()) return res.json({ month: days[0].key.slice(0, 7), days: out });
      const rows = await lessonRows(req.user);
      for (const day of days) {
        for (const row of rows) if (runsOn(row, day)) out[day.key].push({ type: 'lesson', title: row.subject || row.title, start: row.start, end: row.end, room: row.room || '', kind: row.kind || '' });
        out[day.key].sort((a, b) => String(a.start).localeCompare(String(b.start)));
      }
      const Assignment = model('Assignment'), courseIds = await courseIdsFor(req.user);
      if (Assignment && courseIds.length) {
        const from = new Date(days[0].key + 'T00:00:00Z'), to = new Date(Date.parse(days.at(-1).key + 'T00:00:00Z') + 2 * 86400000);
        const due = await Assignment.find({ courseId: { $in: courseIds }, dueAt: { $gte: from, $lt: to } }).select('title dueAt').lean();
        for (const a of due) { const key = localDateKey(a.dueAt); if (out[key]) out[key].push({ type: 'due', title: a.title, at: a.dueAt }); }
      }
      res.json({ month: days[0].key.slice(0, 7), days: out });
    } catch (error) { fail(res, error, 'Kalendarni yuklab bo‘lmadi'); }
  });

  // ---- notifications -------------------------------------------------------
  app.get('/api/hub/notifications', auth, async (req, res) => {
    try {
      const items = [];
      if (!ready()) return res.json({ items });
      const user = req.user, now = new Date(), today = { key: localDateKey(), weekday: localNow().getUTCDay() || 7 };
      const hhmm = localNow().toISOString().slice(11, 16), soon = localNow(new Date(now.getTime() + 90 * 60000)).toISOString().slice(11, 16);
      if (user.role === 'student' || user.role === 'teacher') {
        for (const row of await lessonRows(user)) {
          if (!runsOn(row, today) || !row.start) continue;
          const live = row.start <= hhmm && (!row.end || row.end > hhmm);
          if (live || (row.start > hhmm && row.start <= soon)) {
            items.push({ id: `lesson:${row._id}:${today.key}`, kind: live ? 'live' : 'lesson', page: 'live',
              title: live ? 'Dars hozir ketmoqda' : `Dars ${row.start} da boshlanadi`, text: `${row.subject || row.title}${row.room ? ' · ' + row.room : ''}`, at: now });
          }
        }
      }
      const Assignment = model('Assignment'), Submission = model('Submission');
      const courseIds = await courseIdsFor(user);
      if (user.role === 'student' && Assignment && Submission && courseIds.length) {
        const dueSoon = await Assignment.find({ courseId: { $in: courseIds }, dueAt: { $gte: now, $lt: new Date(now.getTime() + 3 * 86400000) } }).select('title dueAt').lean();
        const done = new Set((await Submission.find({ studentId: user._id, assignmentId: { $in: dueSoon.map(a => a._id) }, submittedAt: { $ne: null } }).select('assignmentId').lean()).map(s => String(s.assignmentId)));
        for (const a of dueSoon) if (!done.has(String(a._id))) items.push({ id: `due:${a._id}`, kind: 'due', page: 'courses', title: 'Vazifa muddati yaqin', text: a.title, at: a.dueAt });
        const graded = await Submission.find({ studentId: user._id, gradedAt: { $gte: new Date(now.getTime() - 14 * 86400000) } }).populate('assignmentId', 'title maxScore').sort({ gradedAt: -1 }).limit(8).lean();
        for (const s of graded) items.push({ id: `grade:${s._id}:${+new Date(s.gradedAt)}`, kind: 'grade', page: 'grades', title: 'Baho qo‘yildi', text: `${s.assignmentId?.title || 'Vazifa'} — ${s.score ?? '?'}/${s.assignmentId?.maxScore ?? 100}`, at: s.gradedAt });
      }
      if (user.role === 'teacher' && Assignment && Submission && courseIds.length) {
        const ids = (await Assignment.find({ courseId: { $in: courseIds } }).select('_id').lean()).map(a => a._id);
        const waiting = ids.length ? await Submission.countDocuments({ assignmentId: { $in: ids }, submittedAt: { $ne: null }, gradedAt: null }) : 0;
        if (waiting) items.push({ id: `ungraded:${waiting}:${today.key}`, kind: 'task', page: 'courses', title: 'Baholanmagan javoblar', text: `${waiting} ta javob tekshiruvni kutmoqda`, at: now });
      }
      const Message = model('InternalMessage');
      if (Message && mongoose.isValidObjectId(user._id)) {
        const unread = await Message.find({ recipientId: user._id, readAt: null }).sort({ createdAt: -1 }).limit(5).select('subject createdAt').lean();
        for (const m of unread) items.push({ id: `msg:${m._id}`, kind: 'message', page: 'communications', title: 'Yangi xabar', text: m.subject, at: m.createdAt });
      }
      items.sort((a, b) => (a.kind === 'live' ? -1 : 0) - (b.kind === 'live' ? -1 : 0) || new Date(b.at) - new Date(a.at));
      res.json({ items: items.slice(0, 30) });
    } catch (error) { fail(res, error, 'Bildirishnomalarni yuklab bo‘lmadi'); }
  });

  // ---- at-risk students ----------------------------------------------------
  app.get('/api/hub/at-risk', auth, async (req, res) => {
    try {
      const user = req.user;
      if (user.role !== 'teacher' && !hasPermission(user, 'analytics.view')) return res.status(403).json({ message: 'Ruxsat yo‘q' });
      if (!ready()) return res.json({ rows: [], counts: { high: 0, medium: 0, low: 0 }, days: 30 });
      const days = Math.max(7, Math.min(60, Number(req.query.days) || 30)), bounds = rangeBounds(days);
      let schedules;
      if (user.role === 'teacher') schedules = await Schedule.find({ teacherId: user._id }).select('groupId weekday').lean();
      else { const scope = await resolveScope(user, req.query); schedules = await Schedule.find(scope.scheduleScope || {}).select('groupId weekday').limit(3000).lean(); }
      const groupIds = [...new Set(schedules.map(s => String(s.groupId)))].map(oid).filter(Boolean);
      if (!groupIds.length) return res.json({ rows: [], counts: { high: 0, medium: 0, low: 0 }, days });
      const expectedByGroup = new Map();
      for (const s of schedules) expectedByGroup.set(String(s.groupId), (expectedByGroup.get(String(s.groupId)) || 0) + weekdayOccurrences(days, s.weekday));
      const students = await User.find({ role: 'student', groupId: { $in: groupIds }, active: { $ne: false } }).select('fullName groupId').populate('groupId', 'name').limit(3000).lean();
      const ids = students.map(s => s._id);
      const attendance = await Attendance.aggregate([
        { $match: { userId: { $in: ids }, status: { $in: ['present', 'late'] }, createdAt: { $gte: bounds.start, $lt: bounds.end } } },
        { $group: { _id: { u: '$userId', l: '$lessonId', d: '$dateKey' } } },
        { $group: { _id: '$_id.u', n: { $sum: 1 } } }
      ]);
      const attended = new Map(attendance.map(r => [String(r._id), r.n]));
      const Course = model('Course'), Assignment = model('Assignment'), Submission = model('Submission');
      const missing = new Map(), scores = new Map();
      if (Course && Assignment && Submission) {
        const courses = await Course.find({ groupId: { $in: groupIds } }).select('groupId').lean();
        const groupOfCourse = new Map(courses.map(c => [String(c._id), String(c.groupId)]));
        const assignments = await Assignment.find({ courseId: { $in: courses.map(c => c._id) } }).select('courseId dueAt maxScore').lean();
        const now = new Date(), overdue = assignments.filter(a => a.dueAt && a.dueAt < now && a.dueAt >= bounds.start);
        const maxOf = new Map(assignments.map(a => [String(a._id), a.maxScore || 100]));
        const subs = await Submission.find({ studentId: { $in: ids }, assignmentId: { $in: assignments.map(a => a._id) } }).select('studentId assignmentId submittedAt score').lean();
        const submitted = new Set(subs.filter(s => s.submittedAt).map(s => `${s.studentId}:${s.assignmentId}`));
        for (const st of students) {
          const gid = String(st.groupId?._id || st.groupId);
          missing.set(String(st._id), overdue.filter(a => groupOfCourse.get(String(a.courseId)) === gid && !submitted.has(`${st._id}:${a._id}`)).length);
        }
        for (const s of subs) if (typeof s.score === 'number') {
          const list = scores.get(String(s.studentId)) || [];
          list.push(s.score / (maxOf.get(String(s.assignmentId)) || 100) * 100);
          scores.set(String(s.studentId), list);
        }
      }
      const counts = { high: 0, medium: 0, low: 0 };
      const rows = students.map(st => {
        const id = String(st._id), gid = String(st.groupId?._id || st.groupId), expected = expectedByGroup.get(gid) || 0;
        const rate = expected ? Math.min(100, Math.round((attended.get(id) || 0) / expected * 100)) : 100;
        const list = scores.get(id), avgPct = list?.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
        const risk = riskFor({ rate, expected, missing: missing.get(id) || 0, avgPct });
        counts[risk.level] += 1;
        return { id, name: st.fullName, group: st.groupId?.name || '', rate, missing: missing.get(id) || 0, avgPct, ...risk };
      }).filter(r => r.level !== 'low').sort((a, b) => b.score - a.score).slice(0, 60);
      res.json({ rows, counts, days });
    } catch (error) { fail(res, error, 'Xavf tahlilini hisoblab bo‘lmadi'); }
  });

  // ---- certificates --------------------------------------------------------
  app.get('/api/hub/certificates', auth, async (req, res) => {
    try {
      const Result = model('CourseResult');
      if (req.user.role !== 'student' || !ready() || !Result) return res.json({ items: [] });
      const rows = await Result.find({ studentId: req.user._id, status: 'final', totalScore: { $gte: PASS_SCORE } }).populate('courseId', 'title code credits').sort({ updatedAt: -1 }).lean();
      res.json({ items: rows.filter(r => r.courseId).map(r => ({ course: r.courseId.title, code: r.courseId.code, score: r.totalScore, grade: r.gradeLabel || '', credits: r.creditsAwarded || r.courseId.credits || 0, year: r.academicYear, semester: r.semester, cert: certificateCode(secret, String(r.studentId), String(r.courseId._id)) })) });
    } catch (error) { fail(res, error, 'Sertifikatlarni yuklab bo‘lmadi'); }
  });

  // Public: anyone holding the QR code can confirm the certificate is genuine.
  app.get('/api/certificates/verify/:code', async (req, res) => {
    try {
      const ref = readCertificateCode(secret, req.params.code);
      const Result = model('CourseResult');
      if (!ref || !ready() || !Result) return res.status(404).json({ valid: false });
      const row = await Result.findOne({ studentId: ref.studentId, courseId: ref.courseId, status: 'final', totalScore: { $gte: PASS_SCORE } }).populate('courseId', 'title code credits').populate('studentId', 'fullName').lean();
      if (!row || !row.courseId || !row.studentId) return res.status(404).json({ valid: false });
      res.set('Cache-Control', 'no-store').json({ valid: true, name: row.studentId.fullName, course: row.courseId.title, code: row.courseId.code, score: row.totalScore, grade: row.gradeLabel || '', credits: row.creditsAwarded || row.courseId.credits || 0, year: row.academicYear, semester: row.semester, issuedAt: row.updatedAt });
    } catch (error) { fail(res, error, 'Tekshirib bo‘lmadi'); }
  });
}
