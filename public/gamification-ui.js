// Student achievements panel on the dashboard + level chip in the header.
// Data: GET /api/gamification/me (students only). Talks to the campus robot
// through the `hallaym:robot` event so the robot congratulates level-ups.
(function () {
  'use strict';
  var ICONS = {
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M8.5 14.5l2 2 4-4"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5Z"/><path d="M6 21h12"/>',
    flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.4 3.8-9.3 2.4 1.4 3.6 3.6 3.4 6 1.1-.6 1.8-1.7 2-3 2 1.6 3.8 3.8 3.8 6.6C18.5 18.6 16 21 12 21Z"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 3 3 5.5-6"/>',
    stack: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z"/>',
    play: '<rect x="3" y="4.5" width="18" height="15" rx="3.5"/><path d="m10 9 5 3-5 3Z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8Z"/>'
  };
  var root = document.documentElement, lastFetch = 0, busy = false, data = null;

  function svg(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.star) + '</svg>';
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function robot(text, kind) {
    window.dispatchEvent(new CustomEvent('hallaym:robot', { detail: { text: text, kind: kind || 'star' } }));
  }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

  function render(d) {
    var host = document.getElementById('gxAchievements');
    if (!host) {
      host = document.createElement('section');
      host.id = 'gxAchievements';
      host.className = 'gx';
      host.setAttribute('aria-label', 'Mening yutuqlarim');
      var anchor = document.getElementById('stats');
      if (!anchor) return;
      anchor.after(host);
    }
    var lv = d.level, ring = 2 * Math.PI * 52, unlocked = d.badges.filter(function (b) { return b.unlocked; }).length;
    var board = d.leaderboard || { rows: [] };
    host.innerHTML =
      '<article class="gx-card gx-level">' +
        '<div class="gx-ring" style="--gx-p:' + lv.progress + '">' +
          '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="gx-ring-track" cx="60" cy="60" r="52"/><circle class="gx-ring-fill" cx="60" cy="60" r="52" stroke-dasharray="' + ring.toFixed(1) + '" stroke-dashoffset="' + (ring * (1 - lv.progress / 100)).toFixed(1) + '"/></svg>' +
          '<div><small>Daraja</small><b>' + lv.level + '</b></div>' +
        '</div>' +
        '<div class="gx-level-text"><span class="gx-kicker">Mening darajam</span><h2>' + esc(lv.title) + '</h2>' +
          '<div class="gx-xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv.progress + '" aria-label="Keyingi darajagacha"><i style="width:' + lv.progress + '%"></i></div>' +
          '<p><b>' + d.xp + ' XP</b> · keyingi darajagacha ' + Math.max(0, lv.to - d.xp) + ' XP</p>' +
          '<ul class="gx-rules"><li>Dars <b>+10</b></li><li>Vazifa <b>+20</b></li><li>Test <b>+15</b></li><li>Video <b>+8</b></li></ul>' +
        '</div>' +
      '</article>' +
      '<article class="gx-card gx-streak' + (d.streak.current ? ' is-hot' : '') + '">' +
        '<div class="gx-flame">' + svg('flame') + '</div>' +
        '<div><span class="gx-kicker">Kunlik seriya</span><h2><b>' + d.streak.current + '</b> kun</h2>' +
        '<p>' + (d.streak.activeToday ? 'Bugun faol bo‘ldingiz — zo‘r!' : d.streak.current ? 'Bugun darsga kirib seriyani saqlang' : 'Bugun darsga kirib seriyani boshlang') + '</p>' +
        '<small>Eng uzun seriya: ' + d.streak.best + ' kun</small></div>' +
      '</article>' +
      '<article class="gx-card gx-badges"><div class="gx-head"><h2>Nishonlar</h2><span>' + unlocked + ' / ' + d.badges.length + '</span></div><ul>' +
        d.badges.map(function (b) {
          return '<li class="gx-badge' + (b.unlocked ? ' is-on' : '') + '" title="' + esc(b.title + ' — ' + b.desc) + '">' + svg(b.icon) +
            '<b>' + esc(b.title) + '</b><small>' + (b.unlocked ? 'Olindi' : b.value + ' / ' + b.goal) + '</small>' +
            (b.unlocked ? '' : '<i style="width:' + Math.round(b.value / b.goal * 100) + '%"></i>') + '</li>';
        }).join('') +
      '</ul></article>' +
      '<article class="gx-card gx-board"><div class="gx-head"><h2>Guruh reytingi</h2><span>' + (board.myRank ? board.myRank + '-o‘rin · ' + board.total + ' talaba' : 'Guruh topilmadi') + '</span></div>' +
        (board.rows.length ? '<ol>' + board.rows.map(function (r) {
          return '<li class="' + (r.self ? 'is-me ' : '') + (r.rank <= 3 ? 'gx-top gx-top-' + r.rank : '') + '"><span class="gx-rank">' + r.rank + '</span><b>' + esc(r.name) + (r.self ? ' <em>(siz)</em>' : '') + '</b><small>' + r.level + '-daraja</small><strong>' + r.xp + ' XP</strong></li>';
        }).join('') + '</ol>' : '<p class="gx-empty">Reyting guruhingizdagi talabalar faol bo‘lgach paydo bo‘ladi.</p>') +
      '</article>';
  }

  function chip(d) {
    var actions = document.querySelector('#shell>header .header-actions');
    if (!actions) return;
    var el = document.getElementById('gxChip');
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'gxChip';
      el.className = 'gx-chip';
      el.addEventListener('click', function () {
        var btn = document.querySelector('nav button[data-page="dashboard"]');
        if (btn) btn.click();
        setTimeout(function () { var h = document.getElementById('gxAchievements'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120);
      });
      actions.insertBefore(el, actions.firstChild);
    }
    el.innerHTML = svg('bolt') + '<b>' + d.level.level + '</b><span>' + d.xp + ' XP</span>' + (d.streak.current ? '<em>' + svg('flame') + d.streak.current + '</em>' : '');
    el.setAttribute('aria-label', d.level.level + '-daraja, ' + d.xp + ' XP, seriya ' + d.streak.current + ' kun. Yutuqlarni ochish');
  }

  function celebrate(d) {
    var prevLevel = Number(store('gx-level') || 0), prevBadges = (store('gx-badges') || '').split(',').filter(Boolean);
    var nowBadges = d.badges.filter(function (b) { return b.unlocked; }).map(function (b) { return b.id; });
    var fresh = d.badges.filter(function (b) { return b.unlocked && prevBadges.indexOf(b.id) < 0; });
    if (prevLevel && d.level.level > prevLevel) {
      robot('Tabriklayman! ' + d.level.level + '-daraja: ' + d.level.title, 'star');
      document.getElementById('gxAchievements')?.classList.add('gx-levelup');
    } else if (prevBadges.length && fresh.length) {
      robot('Yangi nishon: ' + fresh[0].title + '!', 'star');
    }
    store('gx-level', String(d.level.level));
    store('gx-badges', nowBadges.join(','));
    root.dataset.robotTier = String(d.level.level >= 7 ? 3 : d.level.level >= 4 ? 2 : d.level.level >= 2 ? 1 : 0);
  }

  function load(force) {
    if (busy || (!force && Date.now() - lastFetch < 60000 && data)) { if (data) render(data); return; }
    busy = true;
    fetch('/api/gamification/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        lastFetch = Date.now();
        if (!d || !d.enabled || !d.level) { document.getElementById('gxAchievements')?.remove(); document.getElementById('gxChip')?.remove(); return; }
        data = d; render(d); chip(d); celebrate(d);
      })
      .catch(function () {})
      .finally(function () { busy = false; });
  }

  function watch() {
    var shell = document.getElementById('shell'), dash = document.getElementById('dashboard');
    if (!shell || !dash) return;
    var check = function () { if (!shell.classList.contains('hidden') && dash.classList.contains('active')) load(false); };
    new MutationObserver(check).observe(shell, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(check).observe(dash, { attributes: true, attributeFilter: ['class'] });
    // the dashboard re-renders #stats; keep the panel right after it
    var stats = document.getElementById('stats');
    if (stats) new MutationObserver(function () { var h = document.getElementById('gxAchievements'); if (h && stats.nextElementSibling !== h) stats.after(h); }).observe(dash, { childList: true });
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
