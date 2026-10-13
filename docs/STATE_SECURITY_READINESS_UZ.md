# HALLAYM EDU — davlat kiberxavfsizlik ekspertizasiga tayyorgarlik (2026-10-13)

**Holat:** ichki kod/konfiguratsiya auditi, **RASM IY IJOBIY EKSPERT XULOSASI EMAS**. Auditning ushbu bosqichi GitHub reposi va npm advisories asosida bajarilgan. Universitet serveri, MongoDB, tarmoq, xodimlarning shaxsiy loginlari, mobil qurilmalar va 3-tomon integratsiyalar yuzasidan mustaqil tekshiruv tugallanmagan.

## Normativ asoslar
- 14.11.2024-y. 3573-sonli nizom (2025 y. o‘zgartirishlar bilan): https://lex.uz/en/acts/-7222910 — davlat organlarining ATlari va muhim axborot infratuzilmasi obyektlari uchun majburiy ekspertiza. Majburiyatning ayni HALLAYM EDUga tatbiq etilishi universitetning rasmiy maqomi va tizimning tasnifi bo‘yicha huquqshunos/mas’ul tashkilot tomonidan tasdiqlanadi.
- O‘RQ-547, shaxsga doir ma’lumotlar: https://lex.uz/uz/acts/-4396419 — maxfiylik, himoya, rozilik, biometrik ma’lumotlar hamda 2026-yilgi hududiy saqlash qoidalari.
- VM 570-son, 05.10.2022: https://lex.uz/acts/-6225462 — shaxsga doir ma’lumotlarga ishlov berish xavfi va tegishli himoya darajasi.

## Auditda bartaraf etilgan xavflar (kod bo‘yicha)
1. **Kritik:** server ishga tushganda oldindan ma’lum parolli QDTU-T/QDTU-S akkauntlar avtomatik qo‘shilishi — kod olib tashlandi. **Bazadagi avval yaratilgan akkauntlar avtomatik o‘chirilmagan.**
2. **Yuqori:** production demo sessiya va Socket.IO demo avtorizatsiyasi qabul qilinishi — endi rad etiladi.
3. **Yuqori:** Socket.IO WebSocket upgrade vaqtida noto‘g‘ri boshqa origin orqali urinish — HTTPS same-origin yoki aniq `ALLOWED_ORIGINS` ro‘yxati bilan tekshiriladi. HTTP CORS uchun productionda avtomatik `allow-all` olib tashlandi.
4. **Yuqori:** productionda kuchsiz `JWT_SECRET` yoki admin paroli — security preflight 32+ belgili JWT va 14+ belgili admin parolini talab qiladi; secretlarni chiqarmaydi.
5. **Yuqori:** production rejimida demo ma’lumotlarni qayta yaratish endpointi va seed skriptlarini ishga tushirish — bloklandi.
6. **Dependency audit:** asosiy LMSda `csv-parse` yangilandi; ExcelJS `uuid` qaramligi tekshiruvdan o'tgan versiya orqali pin qilindi. Ikkala `npm audit --omit=dev` da 0 ta ma’lum advisory qaytdi. Bu ekspluatatsiya imkonsizligi haqida kafolat emas.
7. **Takrorlanadigan build:** `media-server/package-lock.json` yaratilgan; CI/deploy `npm ci` bilan takrorlanadigan holat.

## Ekspertizadan oldin hal qilinishi shart bo‘lgan tashkiliy va texnik ishlar
| Ustuvorlik | Xavf / dalil | Holat va mas’ul |
|---|---|---|
| P0 | Bazadagi faol demo/test akkauntlarni aniqlash; xizmatda kerak emaslarini deaktivatsiya qilish, barcha default parollarni reset qilish | **Ochiq** — `npm run security:accounts` orqali faqat ro‘yxatga olish, amaliy qaror universitet admini |
| P0 | Real production `.env` da alohida kuchli JWT / admin / SFU / TOTP kalitlarini tasdiqlash | **Ochiq** — `npm run security:preflight`; kalitlarni hujjatga yoki chatga yubormang |
| P0 | MongoDB, barcha GridFS fayllari, yuzni aniqlash ma’lumotlari saqlanadigan hudud va shaxsiy ma’lumotlarning O‘zbekiston qonunlariga muvofiqligini tekshirish | **Ochiq** — joylashuv bo‘yicha ma’lumotnoma |
| P0 | Administrator/dekanat/texnik hisoblar uchun MFA majburiyligi, xodimlar rollarini davriy qayta ko‘rib chiqish | **Ochiq** — konfiguratsiya va tashkilot siyosati bilan tasdiqlash |
| P0 | Vakolatli xodimlar bilan kelishilgan, ajratilgan staging bazasi, sinov akkauntlari, yozma ruxsatli pentest | **Ochiq** |
| P1 | Nginx orqali TLS va tashqi portlar (3000/40000/Mongo) yopilganligi; SSH kalitlar, UFW/Fail2ban; TURN server himoyasi | **Ochiq** — infra audit |
| P1 | CSP dagi `unsafe-eval`, tashqi CDNlar va keng `imgSrc/mediaSrc/connectSrc` ruxsatlarini MediaPipe/YouTube talablarini buzmay toraytirish | **Ochiq** — browser smoke test |
| P1 | ZIP/Office/media fayl kontenti uchun zararli dasturlar skaneri, media hajmi, GridFS ACL va yuklangan fayllarni sanitizatsiya qilish | **Ochiq** |
| P1 | Zaxira nusxasini shifrlash (GPG), restore sinovi, log-retention, xavfsizlik hodisalariga javob berish, kalitlar rotatsiyasi | **Ochiq** |
| P1 | SAST/DAST, OWASP ASVS asosidagi ruxsatlar matritsasi, RBAC/IDOR, CSRF, SSRF, XSS, clickjacking, rate-limit va SFU tokenlari pentesti | **Ochiq** |
| P1 | Proktoring/Face ID uchun rozilik, ma’lumotni minimallashtirish, saqlash/o‘chirish muddatlari, biometrik ma’lumotlar bazasi joylashuvi | **Ochiq** |
| P2 | SBOM, CI yordamida vulnerability scanning, periodik dependency update, arxivlangan release va signed source hash | **Boshlang‘ich** |

## 3573-sonli nizom bo‘yicha ekspertizaga arizaga ilova qilinadigan dalillar
- Manba kod hajmi (MB), modullar soni, rollar soni (repo va real deploy asosida).
- Ma’lumotlar bazasi hajmi/kolleksiyalar soni, serverlar/IP segmentlari va himoya zonalari. Bu ma’lumotlar faqat **ishonchli tartibda** mutasaddiga taqdim etiladi.
- Integratsiyalar (HEMIS, Moodle, carlib.kstu.uz, TURN, SFU, boshqa domenlar) ro‘yxati va axborot oqimlari.
- Texnik topshiriq, arxitektura sxemasi, administrator/fan o‘qituvchisi/talaba qo‘llanmalari, xavf modeli, ma’lumotlar klassifikatsiyasi va recovery/incident runbook.
- Staging manzili, test ma’lumotlari, ekspert uchun vaqtinchalik rol/huquqlar va masofaviy kirish rejasi — **hech qachon credentiallarni GitHub yoki chatga joylamang**.
- SAST/dependency hisobotlari, qo‘lda security acceptance checklist, ruxsatli pen-test dalolatnomasi va qayta tekshirish natijalari.

## Kirish oldi tekshiruvlari
```bash
cd ~/masofaviy2
npm ci --no-audit --no-fund
npm --prefix media-server ci --no-audit --no-fund
npm run security:preflight
npm run security:accounts
npm run check
npm test
npm audit --omit=dev
npm --prefix media-server audit --omit=dev
```

**Muhim:** bazadagi faol demo akkaunt aniqlansa ularni avtomatik o‘chirib yubormang — ular universitet tomonidan biror sinov uchun ishlatilayotgan bo‘lishi mumkin. Mas’ul xodim foydalanuvchilarni aniqlashi, qabul qilingan qarorni audit jurnalida aks ettirishi va faqat shundan keyin xavfsiz deaktivatsiya/reset qilishi lozim.

**Qabul qilish chegarasi:** kod testlari va 0 ta dependency advisory **davlat ekspertizasidan o‘tganlikni tasdiqlamaydi**. Vakolatli tashkilotning rasmiy ijobiy xulosasi va tegishli reyestr/sinf tasdiqlari kerak.
