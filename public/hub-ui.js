// Campus hub UI: notification bell, month calendar, at-risk students,
// certificates and a printable analytics report. Uses /api/hub/* only.
(function () {
  'use strict';
  var root = document.documentElement, me = null, seen = loadSeen(), feed = [], pollTimer = null;
  var KIND = {
    live: ['Jonli', '<circle cx="12" cy="12" r="4"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'],
    lesson: ['Dars', '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'],
    due: ['Muddat', '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'],
    grade: ['Baho', '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8Z"/>'],
    task: ['Vazifa', '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'],
    message: ['Xabar', '<path d="M4 5h16v11H8l-4 4Z"/>']
  };
  var MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  var WEEK = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(path, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>'; }
  function get(path) { return fetch('/api' + path, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function robot(text) { window.dispatchEvent(new CustomEvent('hallaym:robot', { detail: { text: text, kind: 'heart' } })); }
  function loadSeen() { try { return new Set(JSON.parse(localStorage.getItem('hx-seen') || '[]')); } catch (e) { return new Set(); } }
  function saveSeen() { try { localStorage.setItem('hx-seen', JSON.stringify([...seen].slice(-300))); } catch (e) {} }
  function go(page) { var b = document.querySelector('#sidebar nav button[data-page="' + page + '"]:not(.hidden)'); if (b) b.click(); }
  function ago(at) {
    var d = (Date.now() - new Date(at)) / 60000;
    if (d < 0) { var h = Math.round(-d / 60); return h < 24 ? h + ' soatdan keyin' : Math.round(h / 24) + ' kundan keyin'; }
    return d < 2 ? 'hozir' : d < 60 ? Math.round(d) + ' daqiqa oldin' : d < 1440 ? Math.round(d / 60) + ' soat oldin' : Math.round(d / 1440) + ' kun oldin';
  }

  // ---- notification bell ---------------------------------------------------
  function bell() {
    var actions = document.querySelector('#shell>header .header-actions');
    if (!actions || document.getElementById('hxBell')) return;
    var wrap = document.createElement('div');
    wrap.className = 'hb-bell-wrap';
    wrap.innerHTML = '<button type="button" id="hxBell" class="icon-btn hb-bell" aria-haspopup="dialog" aria-expanded="false" aria-controls="hxBellPanel" aria-label="Bildirishnomalar">' +
      icon('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20a2 2 0 0 0 4 0"/>') + '<span class="hb-count" hidden></span></button>' +
      '<div id="hxBellPanel" class="hb-panel" role="dialog" aria-label="Bildirishnomalar" hidden><div class="hb-panel-head"><b>Bildirishnomalar</b><button type="button" class="hb-read">Hammasi o‘qildi</button></div><ul class="hb-list"></ul></div>';
    var search = document.getElementById('globalSearchOpen');
    actions.insertBefore(wrap, search ? search.nextSibling : actions.firstChild);
    var btn = wrap.querySelector('#hxBell'), panel = wrap.querySelector('.hb-panel');
    function toggle(open) {
      panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      root.classList.toggle('hb-open', open);
      if (open) { renderFeed(); var f = panel.querySelector('button,a'); if (f) f.focus(); }
    }
    btn.addEventListener('click', function () { toggle(panel.hidden); });
    wrap.querySelector('.hb-read').addEventListener('click', function () { feed.forEach(function (i) { seen.add(i.id); }); saveSeen(); renderFeed(); });
    document.addEventListener('click', function (e) { if (!panel.hidden && !wrap.contains(e.target)) toggle(false); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { toggle(false); btn.focus(); } });
    panel.addEventListener('click', function (e) {
      var li = e.target.closest('[data-id]'); if (!li) return;
      seen.add(li.dataset.id); saveSeen(); toggle(false); go(li.dataset.page);
    });
  }
  function renderFeed() {
    var list = document.querySelector('#hxBellPanel .hb-list'), count = document.querySelector('#hxBell .hb-count');
    if (!list) return;
    var unread = feed.filter(function (i) { return !seen.has(i.id); }).length;
    count.hidden = !unread; count.textContent = unread > 9 ? '9+' : String(unread);
    document.getElementById('hxBell').setAttribute('aria-label', 'Bildirishnomalar' + (unread ? ', ' + unread + ' ta yangi' : ''));
    document.title = (unread ? '(' + unread + ') ' : '') + document.title.replace(/^\(\d+\+?\) /, '');
    list.innerHTML = feed.length ? feed.map(function (i) {
      var k = KIND[i.kind] || KIND.task;
      return '<li><button type="button" data-id="' + esc(i.id) + '" data-page="' + esc(i.page) + '" class="hb-item hb-' + esc(i.kind) + (seen.has(i.id) ? '' : ' is-new') + '">' +
        '<span class="hb-ico">' + icon(k[1]) + '</span><span class="hb-body"><b>' + esc(i.title) + '</b><span>' + esc(i.text) + '</span><small>' + esc(k[0]) + ' · ' + ago(i.at) + '</small></span></button></li>';
    }).join('') : '<li class="hb-empty">Hozircha yangilik yo‘q. Robot ham dam olyapti.</li>';
  }
  function poll() {
    if (document.hidden || document.getElementById('shell')?.classList.contains('hidden')) return;
    get('/hub/notifications').then(function (d) {
      if (!d) return;
      var before = new Set(feed.map(function (i) { return i.id; }));
      var hadFeed = feed.length > 0 || pollTimer !== null;
      feed = d.items || [];
      var fresh = feed.filter(function (i) { return !before.has(i.id) && !seen.has(i.id); });
      if (hadFeed && fresh.length) robot(fresh[0].title + '!');
      renderFeed();
    });
  }

  // ---- calendar ------------------------------------------------------------
  var cal = null, calMonth = null, calSelected = null;
  function openCalendar() {
    if (!cal) {
      cal = document.createElement('div');
      cal.className = 'hb-cal';
      cal.innerHTML = '<div class="hb-cal-card" role="dialog" aria-modal="true" aria-labelledby="hbCalTitle">' +
        '<div class="hb-cal-head"><button type="button" class="hb-prev" aria-label="Oldingi oy">‹</button><h2 id="hbCalTitle"></h2><button type="button" class="hb-next" aria-label="Keyingi oy">›</button><button type="button" class="hb-today">Bugun</button><button type="button" class="hb-close" aria-label="Yopish">×</button></div>' +
        '<div class="hb-cal-body"><div class="hb-grid" role="grid"></div><aside class="hb-day" aria-live="polite"></aside></div>' +
        '<div class="hb-legend"><span><i class="l"></i>Dars</span><span><i class="d"></i>Vazifa muddati</span></div></div>';
      document.body.append(cal);
      cal.querySelector('.hb-prev').onclick = function () { shift(-1); };
      cal.querySelector('.hb-next').onclick = function () { shift(1); };
      cal.querySelector('.hb-today').onclick = function () { calMonth = new Date().toLocaleDateString('sv').slice(0, 7); calSelected = null; loadMonth(); };
      cal.querySelector('.hb-close').onclick = closeCalendar;
      cal.addEventListener('click', function (e) { if (e.target === cal) closeCalendar(); });
      cal.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCalendar(); });
    }
    calMonth = calMonth || new Date().toLocaleDateString('sv').slice(0, 7);
    cal.hidden = false;
    document.body.classList.add('hb-noscroll');
    cal.querySelector('.hb-close').focus();
    loadMonth();
  }
  function closeCalendar() { if (cal) cal.hidden = true; document.body.classList.remove('hb-noscroll'); document.getElementById('hbCalendarBtn')?.focus(); }
  function shift(n) { var p = calMonth.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); calMonth = d.toISOString().slice(0, 7); calSelected = null; loadMonth(); }
  function loadMonth() {
    var p = calMonth.split('-').map(Number);
    cal.querySelector('h2').textContent = MONTHS[p[1] - 1] + ' ' + p[0];
    var grid = cal.querySelector('.hb-grid');
    grid.classList.add('is-loading');
    get('/hub/calendar?month=' + calMonth).then(function (d) {
      grid.classList.remove('is-loading');
      var days = (d && d.days) || {}, keys = Object.keys(days).sort(), today = new Date().toLocaleDateString('sv');
      var first = new Date(calMonth + '-01T00:00:00Z').getUTCDay() || 7;
      var html = WEEK.map(function (w) { return '<span class="hb-wd" role="columnheader">' + w + '</span>'; }).join('');
      for (var i = 1; i < first; i++) html += '<span class="hb-pad"></span>';
      keys.forEach(function (k, idx) {
        var ev = days[k], lessons = ev.filter(function (e) { return e.type === 'lesson'; }).length, due = ev.length - lessons;
        html += '<button type="button" role="gridcell" data-day="' + k + '" class="hb-cell' + (k === today ? ' is-today' : '') + (ev.length ? ' has-ev' : '') + '" style="--i:' + idx + '" aria-label="' + Number(k.slice(8)) + '-' + MONTHS[p[1] - 1] + ': ' + lessons + ' dars, ' + due + ' muddat">' +
          '<b>' + Number(k.slice(8)) + '</b><span class="hb-dots">' + (lessons ? '<i class="l"></i>' : '') + (due ? '<i class="d"></i>' : '') + '</span>' + (lessons ? '<small>' + lessons + ' dars</small>' : '') + '</button>';
      });
      grid.innerHTML = html;
      grid.onclick = function (e) { var c = e.target.closest('[data-day]'); if (c) showDay(c.dataset.day, days[c.dataset.day]); };
      var pick = calSelected && days[calSelected] ? calSelected : (days[today] ? today : keys[0]);
      showDay(pick, days[pick] || []);
    });
  }
  function showDay(key, events) {
    calSelected = key;
    cal.querySelectorAll('.hb-cell').forEach(function (c) { c.classList.toggle('is-sel', c.dataset.day === key); });
    var p = key.split('-');
    cal.querySelector('.hb-day').innerHTML = '<h3>' + Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + '</h3>' + (events && events.length ? '<ul>' + events.map(function (e) {
      return e.type === 'lesson'
        ? '<li class="l"><time>' + esc(e.start || '') + (e.end ? '–' + esc(e.end) : '') + '</time><b>' + esc(e.title) + '</b>' + (e.room ? '<small>' + esc(e.room) + '</small>' : '') + '</li>'
        : '<li class="d"><time>Muddat</time><b>' + esc(e.title) + '</b><small>' + new Date(e.at).toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' }) + ' gacha</small></li>';
    }).join('') + '</ul>' : '<p>Bu kunda dars yoki muddat yo‘q.</p>');
  }
  function calendarButton() {
    var head = document.querySelector('#schedule .page-head');
    if (!head || document.getElementById('hbCalendarBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'hbCalendarBtn'; b.className = 'secondary hb-cal-btn';
    b.innerHTML = icon(KIND.lesson[1]) + 'Oylik kalendar';
    b.onclick = openCalendar;
    head.append(b);
  }

  // ---- at-risk students ----------------------------------------------------
  function riskCard(anchor) {
    if (!anchor || document.getElementById('hbRisk')) return;
    var card = document.createElement('article');
    card.id = 'hbRisk'; card.className = 'hb-risk';
    card.innerHTML = '<div class="hb-risk-head"><div><h2>Xavf ostidagi talabalar</h2><small>Davomat, topshirilmagan vazifalar va baholar bo‘yicha · 30 kun</small></div><div class="hb-risk-counts"></div></div><div class="hb-risk-body"><p class="hb-skel"></p><p class="hb-skel"></p><p class="hb-skel"></p></div>';
    anchor.after(card);
    get('/hub/at-risk?days=30').then(function (d) {
      if (!d) { card.remove(); return; }
      card.querySelector('.hb-risk-counts').innerHTML = '<span class="hb-pill high">' + d.counts.high + ' yuqori</span><span class="hb-pill medium">' + d.counts.medium + ' o‘rta</span><span class="hb-pill low">' + d.counts.low + ' past</span>';
      card.querySelector('.hb-risk-body').innerHTML = d.rows.length ? '<div class="table-wrap"><table><thead><tr><th>Talaba</th><th>Guruh</th><th>Davomat</th><th>Vazifa</th><th>O‘rtacha</th><th>Sabab</th><th>Xavf</th></tr></thead><tbody>' + d.rows.map(function (r) {
        return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.group) + '</td><td><span class="hb-meter"><i style="width:' + r.rate + '%"></i></span>' + r.rate + '%</td><td>' + (r.missing ? r.missing + ' ta' : '—') + '</td><td>' + (r.avgPct == null ? '—' : r.avgPct + '%') + '</td><td>' + r.reasons.map(function (x) { return '<span class="hb-chip">' + esc(x) + '</span>'; }).join('') + '</td><td><span class="hb-pill ' + r.level + '">' + r.score + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="hb-ok">Ajoyib — xavf ostidagi talaba yo‘q.</p>';
    });
  }

  // ---- certificates --------------------------------------------------------
  function certificates() {
    if (document.getElementById('hbCerts')) return;
    get('/hub/certificates').then(function (d) {
      if (!d || !d.items || !d.items.length || document.getElementById('hbCerts')) return;
      var anchor = document.getElementById('gxAchievements') || document.getElementById('stats');
      if (!anchor) return;
      var card = document.createElement('article');
      card.id = 'hbCerts'; card.className = 'hb-certs gx-card';
      card.innerHTML = '<div class="gx-head"><h2>Sertifikatlarim</h2><span>' + d.items.length + ' ta</span></div><ul>' + d.items.map(function (c) {
        return '<li><span class="hb-seal">' + icon('<circle cx="12" cy="9" r="6"/><path d="m8.5 13.5-2 7 5.5-3 5.5 3-2-7"/>') + '</span><div><b>' + esc(c.course) + '</b><small>' + esc(c.year) + ' · ' + esc(c.semester) + '-semestr · ' + esc(c.score) + ' ball</small></div><a class="secondary" href="/certificate.html?c=' + encodeURIComponent(c.cert) + '" target="_blank" rel="noopener">Ochish</a></li>';
      }).join('') + '</ul>';
      anchor.after(card);
    });
  }

  // ---- printable analytics report -----------------------------------------
  function printButton() {
    var actions = document.querySelector('#analytics .head-actions');
    if (!actions || document.getElementById('hbPrint')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'hbPrint'; b.className = 'secondary';
    b.textContent = 'PDF hisobot';
    b.title = 'Hisobotni chop etish yoki PDF sifatida saqlash';
    b.onclick = function () {
      document.querySelector('#analytics .page-head')?.setAttribute('data-print-date', new Date().toLocaleString('uz'));
      window.print();
    };
    actions.append(b);
  }

  // ---- wiring --------------------------------------------------------------
  function onPage() {
    var page = root.dataset.page;
    if (page === 'dashboard') {
      if (me && me.role === 'student') setTimeout(certificates, 400);
      if (me && me.role === 'teacher') riskCard(document.getElementById('stats'));
    }
    if (page === 'analytics') { printButton(); riskCard(document.getElementById('analyticsSummary')); }
    if (page === 'schedule') calendarButton();
  }
  function start() {
    var shell = document.getElementById('shell');
    if (!shell) return;
    var boot = function () {
      if (shell.classList.contains('hidden') || me) return;
      get('/me').then(function (d) {
        me = d && d.user; if (!me) return;
        bell(); poll(); onPage();
        clearInterval(pollTimer); pollTimer = setInterval(poll, 120000);
      });
    };
    new MutationObserver(function () { if (shell.classList.contains('hidden')) { me = null; clearInterval(pollTimer); pollTimer = null; } else boot(); }).observe(shell, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(function () { if (me) onPage(); }).observe(root, { attributes: true, attributeFilter: ['data-page'] });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && me) poll(); });
    window.hxOpenCalendar = openCalendar;
    boot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
