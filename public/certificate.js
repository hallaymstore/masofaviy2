(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var code = new URLSearchParams(location.search).get('c') || '';
  var status = $('status'), cert = $('cert'), printBtn = $('printBtn');

  fetch('/api/branding', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (b) {
    if (b && b.institutionName) $('inst').textContent = b.institutionName;
  }).catch(function () {});

  function fail(text) {
    cert.classList.remove('is-loading');
    cert.classList.add('is-invalid');
    status.textContent = text;
    status.className = 'status bad';
    $('name').textContent = 'Sertifikat topilmadi';
    $('course').textContent = 'Havola noto‘g‘ri yoki natija bekor qilingan';
  }

  if (!code) { fail('Havolada sertifikat kodi yo‘q'); return; }
  fetch('/api/certificates/verify/' + encodeURIComponent(code), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.valid) return fail('Sertifikat tasdiqlanmadi');
      $('name').textContent = d.name;
      $('course').textContent = d.course + (d.code ? ' (' + d.code + ')' : '');
      $('score').textContent = d.score + ' / 100';
      $('grade').textContent = d.grade || '—';
      $('credits').textContent = d.credits || '—';
      $('year').textContent = d.year + ', ' + d.semester + '-semestr';
      $('issued').textContent = 'ID ' + code.slice(-12) + ' · ' + new Date(d.issuedAt).toLocaleDateString('uz');
      try {
        var qr = qrcode(0, 'M');
        qr.addData(location.href);
        qr.make();
        $('qr').innerHTML = qr.createSvgTag(3, 0);
      } catch (e) { /* the certificate stays valid without the QR picture */ }
      document.title = d.name + ' — ' + d.course + ' · Sertifikat';
      status.textContent = '✓ Haqiqiy sertifikat';
      status.className = 'status ok';
      cert.classList.remove('is-loading');
      cert.classList.add('is-ready');
      printBtn.disabled = false;
    })
    .catch(function () { fail('Tarmoq xatosi — keyinroq urinib ko‘ring'); });
  printBtn.addEventListener('click', function () { window.print(); });
})();
