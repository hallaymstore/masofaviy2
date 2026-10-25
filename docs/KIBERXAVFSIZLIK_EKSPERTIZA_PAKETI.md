# 13-band: “Kiberxavfsizlik markazi” DUK ekspertizasi uchun paket

**Talab:** axborot tizimining amaldagi ishlashi axborot xavfsizligi talablariga mosligi bo‘yicha Kiberxavfsizlik markazi DUK ning ijobiy xulosasi.

> Bu band ham **kod bilan yopilmaydi** — xulosani faqat Markaz beradi. Ushbu paket ekspertizaga ariza topshirish va undan birinchi urinishda o‘tish uchun tayyorlangan. Hujjatlarning aniq ro‘yxati va shartnoma shartlarini Markazdan oldindan oling.

## 1. Ish tartibi

1. Universitet nomidan Markazga ekspertiza o‘tkazish haqida xat/ariza (shartnoma va to‘lov odatda talab qilinadi).
2. 3-bo‘limdagi hujjatlarni topshirish.
3. Ekspertlarga sinov muhiti yoki production’ga cheklangan kirish (alohida test akkauntlari — har rol uchun bittadan; ishlab turgan foydalanuvchi parollari berilmaydi).
4. Markaz topgan zaifliklarni tuzatish va qayta tekshiruv.
5. Ijobiy xulosani olish; raqami va sanasini `docs/RELEASE_GATE_UZ.md` va LMS “Muvofiqlik” bo‘limiga yozish.

## 2. Tizimdagi mavjud himoya choralari (ekspertlar uchun tavsif)

| Soha | Amalga oshirilgan chora | Kod/konfiguratsiya |
|---|---|---|
| Autentifikatsiya | bcrypt (cost 11) parol xeshi; login brute-force cheklovi (`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MS`) va `LOGIN_FAILED` audit; vaqtinchalik parolni majburiy almashtirish | `server.js` |
| Ikki faktorli autentifikatsiya | TOTP 2FA, secret AES-256-GCM bilan shifrlangan (`TOTP_ENCRYPTION_KEY`), 8 ta bir martalik tiklash kodi | `auth-security.js` |
| Sessiyalar | `HttpOnly; Secure; SameSite=Strict` cookie, CSRF token, `sessionVersion` orqali parol almashganda/bloklanganda HTTP, Socket.IO va media sessiyalarini bekor qilish | `server.js` |
| Ruxsatlar | Rol + foydalanuvchi kesimidagi ruxsat/taqiqlar; dekan/kafedra/tyutor faqat o‘z doirasini ko‘radi; kursga a’zolik har yozuvda tekshiriladi | `server.js`, `lms.js` |
| HTTP xavfsizlik sarlavhalari | Helmet: Content-Security-Policy, HSTS, X-Content-Type-Options, frame himoyasi; CORS faqat `ALLOWED_ORIGINS` | `server.js` |
| Transport | TLS (Let’s Encrypt) Nginx’da, HTTP→HTTPS; WebRTC DTLS-SRTP | `deploy/nginx-masofaviy2.conf` |
| Fayl yuklash | Tur fayl mazmuni (magic bytes) bo‘yicha tekshiriladi; HTML va bajariladigan fayllar rad etiladi; ZIP (SCORM) yo‘llari path traversal’ga tekshiriladi; SCORM iframe `sandbox` bilan | `resource-upload.js`, `scorm.js` |
| Media serveri | SFU signaling faqat `127.0.0.1`, umumiy maxfiy kalit (`SFU_BRIDGE_SECRET` ≥ 32 belgi), har bir media chipta faol dars va foydalanuvchiga qayta tekshiriladi | `media-server/` |
| Ma’lumotlar bazasi | MongoDB faqat localhost’da tinglaydi; tashqi port ochilmaydi | `deploy/security-readiness-audit.sh` |
| Audit | Barcha muhim amallar (login, baho o‘zgartirish, proktoring ko‘rigi, dalil ko‘rish, ruxsat o‘zgarishi) aktor, IP va vaqt bilan `Audit` kolleksiyasiga yoziladi | `server.js` `audit()` |
| Zaxira nusxa | Kunlik MongoDB backup (systemd timer) va tiklash skripti | `deploy/backup-mongodb.sh`, `deploy/restore-mongodb.sh` |
| Shaxsiy ma’lumotlarni minimallashtirish | Shaxs hujjatining faqat turi va oxirgi belgilari saqlanadi; proktoring rasm-dalillari TTL bilan avtomatik o‘chadi (`PROCTOR_EVIDENCE_RETENTION_DAYS`, standart 90 kun) va faqat kurs mas’ullariga ko‘rinadi | `server.js`, `lms.js` |
| Ma’lumotlar joylashuvi | Barcha ma’lumotlar O‘zbekistondagi universitet serverida | — |

## 3. Topshiriladigan hujjatlar (odatdagi ro‘yxat)

1. Ekspertiza haqida ariza/xat (universitet blankida).
2. Axborot tizimi pasporti — `docs/REESTR_UZ_ARIZA_PAKETI.md` 2-bo‘lim.
3. **Axborot xavfsizligi siyosati** (universitet tasdiqlaydi) — 4-bo‘limdagi qolip asosida.
4. **Tahdidlar modeli** — 5-bo‘lim.
5. Tarmoq sxemasi: ochiq portlar faqat TCP 80/443, UDP 50000–50031 (WebRTC), SSH (nostandart port, faqat kalit bilan); MongoDB va SFU bridge faqat localhost.
6. Administrator va foydalanuvchi qo‘llanmalari.
7. Zaxira nusxa va tiklash protokoli (sinov sanasi bilan).
8. Ichki xavfsizlik tekshiruvi natijalari: `deploy/security-readiness-audit.sh` va `deploy/verify-production.sh` chiqishi, `npm audit` hisobotlari.

## 4. Axborot xavfsizligi siyosati — asosiy bandlar (qolip)

- Mas’ul shaxs: axborot xavfsizligi bo‘yicha mas’ul (buyruq bilan).
- Kirish huquqlari: eng kam ruxsat tamoyili; administrator akkauntlari uchun 2FA majburiy; ishdan bo‘shaganda akkaunt shu kuni bloklanadi.
- Parollar: kamida 10 belgi; birinchi kirishda almashtirish; parol hech qachon ochiq kanal (chat, messenjer) orqali yuborilmaydi.
- Server kirishi: SSH faqat kalit bilan, parol orqali kirish o‘chirilgan, root login taqiqlangan, fail2ban.
- Yangilanishlar: OS xavfsizlik yangilanishlari (unattended-upgrades); bog‘liqliklar oyiga bir marta `npm audit` bilan tekshiriladi.
- Zaxira nusxa: kunlik, kamida 14 kun saqlanadi, chorakda bir marta tiklash sinovi.
- Jurnallar: audit va server jurnallari kamida 1 yil saqlanadi.
- Hodisalarga javob: aniqlangan incident 24 soat ichida mas’ulga, zarurat bo‘lsa Kiberxavfsizlik markaziga xabar qilinadi.
- Shaxsiy ma’lumotlar: faqat ta’lim maqsadida; proktoring rasm-dalillari belgilangan muddatdan keyin avtomatik o‘chiriladi; talaba imtihondan oldin xabardor qilinadi va rozilik beradi.

## 5. Tahdidlar modeli (qisqa)

| Tahdid | Ehtimoliy oqibat | Qarshi chora |
|---|---|---|
| Parol tanlash (brute-force) | Akkauntni egallash | Login cheklovi, audit, 2FA |
| Sessiyani o‘g‘irlash (XSS/CSRF) | Foydalanuvchi nomidan amal | CSP, HttpOnly cookie, SameSite=Strict, CSRF token |
| Ruxsatsiz ma’lumot ko‘rish (IDOR) | Boshqa guruh/kurs ma’lumotiga kirish | Har so‘rovda kursga a’zolik va rol doirasi tekshiruvi |
| Zararli fayl yuklash | Kod bajarish / foydalanuvchilarga zarar | Mazmun bo‘yicha tur tekshiruvi, HTML/exe rad etish, sandbox iframe |
| Media serverga ruxsatsiz ulanish | Darsni kuzatish | Localhost bridge, maxfiy kalit, qisqa muddatli media chipta |
| Bazaga tashqaridan kirish | Ma’lumotlar sizishi | MongoDB faqat localhost, firewall |
| Server kompromentatsiyasi (SSH) | To‘liq nazoratni yo‘qotish | Faqat kalit bilan SSH, fail2ban, parol orqali kirish o‘chirilgan |
| Ma’lumot yo‘qolishi | Akademik qaydlar yo‘qolishi | Kunlik backup, tiklash sinovi |
| DoS / ortiqcha yuklama | Xizmat to‘xtashi | Nginx cheklovlari, systemd avtomatik qayta ishga tushirish |

## 6. Ekspertizadan oldin bajariladigan texnik ishlar (serverda)

- [ ] SSH: parol orqali kirishni o‘chirish (`PasswordAuthentication no`), faqat kalit; root login taqiqlash; fail2ban.
- [ ] UFW: faqat 80, 443, 50000–50031/udp va SSH porti ochiq.
- [ ] `.env` fayli huquqi 600; barcha maxfiy kalitlar ≥ 32 belgi, bir-biridan farqli.
- [ ] `sudo bash deploy/security-readiness-audit.sh` — barcha qatorlar `[OK]`.
- [ ] `npm audit --omit=dev` — critical/high yo‘q.
- [ ] Backup → restore sinovi protokoli.
- [ ] Mustaqil penetratsion test (yoki Markazning o‘z testi) natijalari bo‘yicha tuzatishlar.

## 7. Holat jurnali

| Sana | Hodisa | Raqam / izoh |
|---|---|---|
| | Ariza/xat yuborildi | |
| | Shartnoma imzolandi | |
| | Ekspertiza natijasi | |
| | Ijobiy xulosa olindi | |
