// First-visit tour: the campus robot points out the main parts of the
// platform. Shown once per browser (localStorage), skippable with Esc, and
// restartable from window.hxStartTour().
(function () {
  'use strict';
  var KEY = 'hx-tour-v1';
  var STEPS = [
    { target: '#sidebar nav', title: 'Bo‘limlar menyusi', text: 'Jadval, fanlar, videodarslar va kutubxona — hammasi shu yerda. Rolingizga kerakli bo‘limlargina ko‘rinadi.' },
    { target: '.hx-tabbar', title: 'Tezkor menyu', text: 'Telefonda asosiy bo‘limlar pastki panelda turadi.' },
    { target: '#globalSearchOpen', title: 'Hamma narsani qidiring', text: 'Fan, dars, kitob yoki odamni toping. Klaviaturada Ctrl+K.' },
    { target: '#gxChip', title: 'Daraja va XP', text: 'Darsga kirish, vazifa topshirish, test va video uchun ball olasiz. Darajangiz oshgani sayin robot ham o‘zgaradi!' },
    { target: '#stats', title: 'Asosiy ko‘rsatkichlar', text: 'Davomat, darslar soni va boshqa raqamlar har kuni yangilanadi.' },
    { target: '#todayLessons', title: 'Bugungi darslar', text: 'Dars vaqti kelganda shu yerdan bir bosishda jonli darsga kirasiz.' },
    { target: '#themeBtn', title: 'Kunduzgi va tungi rejim', text: 'Ko‘zingizga qulay rejimni tanlang. Tunda robot boshqa o‘yinlar o‘ynaydi.' },
    { target: '#campusMotionToggle', title: 'Robot o‘yingohi', text: 'Robotni to‘xtatish yoki yoqish tugmasi. Robotning o‘zini bosib ko‘ring — u javob beradi!' }
  ];
  var layer, hole, card, index = 0, lastFocus = null;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
  }
  function steps() { return STEPS.filter(function (s) { return visible(document.querySelector(s.target)); }); }
  function robot(text) { window.dispatchEvent(new CustomEvent('hallaym:robot', { detail: { text: text, kind: 'star' } })); }

  function build() {
    layer = document.createElement('div');
    layer.className = 'hx-tour';
    layer.innerHTML = '<div class="hx-tour-hole"></div><div class="hx-tour-card" role="dialog" aria-modal="true" aria-labelledby="hxTourTitle" aria-describedby="hxTourText">' +
      '<span class="hx-tour-step"></span><h2 id="hxTourTitle"></h2><p id="hxTourText"></p>' +
      '<div class="hx-tour-dots" aria-hidden="true"></div>' +
      '<div class="hx-tour-actions"><button type="button" class="hx-tour-skip">O‘tkazib yuborish</button><button type="button" class="hx-tour-back">Orqaga</button><button type="button" class="hx-tour-next primary">Keyingi</button></div></div>';
    document.body.append(layer);
    hole = layer.querySelector('.hx-tour-hole');
    card = layer.querySelector('.hx-tour-card');
    layer.querySelector('.hx-tour-skip').onclick = finish;
    layer.querySelector('.hx-tour-back').onclick = function () { show(index - 1); };
    layer.querySelector('.hx-tour-next').onclick = function () { show(index + 1); };
    layer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'Tab') { // keep focus inside the card
        var f = card.querySelectorAll('button'), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    addEventListener('resize', place);
  }

  var list = [];
  function show(i) {
    if (i >= list.length) return finish();
    index = Math.max(0, i);
    var step = list[index];
    card.querySelector('.hx-tour-step').textContent = (index + 1) + ' / ' + list.length;
    card.querySelector('h2').textContent = step.title;
    card.querySelector('p').textContent = step.text;
    card.querySelector('.hx-tour-back').hidden = index === 0;
    card.querySelector('.hx-tour-next').textContent = index === list.length - 1 ? 'Boshladik!' : 'Keyingi';
    card.querySelector('.hx-tour-dots').innerHTML = list.map(function (_, k) { return '<i class="' + (k === index ? 'on' : '') + '"></i>'; }).join('');
    var el = document.querySelector(step.target);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    place();
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    card.querySelector('.hx-tour-next').focus();
  }

  function place() {
    if (!layer || !list[index]) return;
    var el = document.querySelector(list[index].target);
    if (!el) return;
    var r = el.getBoundingClientRect(), pad = 8;
    var top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    var w = Math.min(innerWidth - left - 4, r.width + pad * 2), h = Math.min(innerHeight - top - 4, r.height + pad * 2);
    hole.style.cssText = 'top:' + top + 'px;left:' + left + 'px;width:' + w + 'px;height:' + h + 'px';
    var cw = Math.min(360, innerWidth - 24), ch = card.offsetHeight || 220;
    var below = top + h + 14, above = top - ch - 14, right = left + w + 14;
    var y, x;
    if (below + ch < innerHeight) { y = below; x = left; }
    else if (above > 8) { y = above; x = left; }
    else if (right + cw < innerWidth) { y = Math.min(Math.max(8, top), innerHeight - ch - 8); x = right; }
    else { y = innerHeight - ch - 12; x = 12; }
    card.style.left = Math.max(12, Math.min(x, innerWidth - cw - 12)) + 'px';
    card.style.top = Math.max(8, y) + 'px';
    card.style.width = cw + 'px';
  }

  function finish() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    if (layer) { layer.remove(); layer = null; }
    removeEventListener('resize', place);
    robot('Omad! Savol bo‘lsa — men shu yerdaman');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function start() {
    list = steps();
    if (!list.length || layer) return;
    lastFocus = document.activeElement;
    build();
    robot('Keling, saytni birga ko‘rib chiqamiz!');
    show(0);
  }
  window.hxStartTour = start;

  function init() {
    var shell = document.getElementById('shell');
    if (!shell) return;
    var done = false;
    try { done = localStorage.getItem(KEY) === '1'; } catch (e) { done = true; }
    if (done) return;
    var opened = function () {
      if (shell.classList.contains('hidden')) return;
      obs.disconnect();
      // let the dashboard and achievements render first
      setTimeout(function () { if (document.documentElement.dataset.page === 'dashboard') start(); }, 1800);
    };
    var obs = new MutationObserver(opened);
    obs.observe(shell, { attributes: true, attributeFilter: ['class'] });
    opened();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
