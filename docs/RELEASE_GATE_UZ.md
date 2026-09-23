# Masofaviy ta’limni ishga tushirish dalillari

Asos: VM 559-son qarori (joriy tahrir): https://lex.uz/docs/-6221502. Ushbu jadval kodning o‘zi bilan rasmiy muvofiqlikni e’lon qilishning oldini oladi. Har bandga universitet mas’uli dalil va sanani kiritadi.

| Band | Tasdiqlanishi kerak bo‘lgan dalil | Holat |
|---|---|---|
| 3, 14–16 | Yo‘nalishning kunduzgi shakli, masofaviy shaklga ruxsat, tasdiqlangan qabul/kontrakt parametrlari | OTMdan olinadi |
| 8 | OTMga tegishli yoki kamida 5 yil ijara asosidagi O‘zbekistondagi server hujjati; quvvat va Internet sinovi | Server bosqichida |
| 8–9, 18–19 | Tasdiqlangan o‘quv rejalari va dasturlar, ta’lim tilidagi barcha fanlar kontenti va O‘zDSt 36.2030 ekspertizasi | Metodik komissiya bilan |
| 10–11 | SCORM moslik sinovlari, avtoproktoring shaxs/nigoh/tovush dalillari, inson ko‘rigi, apellyatsiya va maxfiylik | SCORM 1.2 multi-SCO/resume mavjud; proktoring kamera/mikrofon preflight, ekran/tab/qurilma/yuz/tovush/tarmoq signallari, risk hisobot va inson ko‘rigiga ega. Biometrik shaxsni avtomatik tanish, maxsus gaze tracking, ovoz egasi/mazmuni tahlili va mustaqil conformance hali talab etiladi. |
| 21 | Shaxsan dastlabki ro‘yxat, har semestr yakuniy nazorati, attestatsiya/himoya jarayoni | `final-exams.js` texnik reyestr va audit beradi; production qabulida OTM buyrug‘i, joy/xona, nazoratchilar, shaxs hujjati tekshiruvi va real sessiya dalillari bilan verifikatsiya qilinadi |
| 24 | Barcha dars, amaliyot, mustaqil ish va baholash qaydnomasi LMS orqali | Texnik oqim bor; real fanlar bo‘yicha kontent va to‘liq foydalanish dalili OTM tomonidan tekshiriladi |
| 26 | Tasdiqlangan o‘qituvchi–talaba yuklamasi, 1:50 nazorati | Dastlabki indikator bor |
| 29 | Vakolatli davlat tizimlari bilan rasmiy API kelishuvi, sinxronizatsiya va qabul sinovi | Rasmiy kirish kerak |

## Texnik qabul sinovi

1. GitHub Actions `npm install`, `npm run check`, `npm test` va HttpOnly-cookie login smoke testini o‘tkazadi. Server qabulida qo‘shimcha `npm ci`, production `.env` va MongoDB ulanmaganida xizmat ochilmasligini tasdiqlash.
2. Universitet serverida TLS, ma’lumotlar joylashuvi, zaxira nusxa va **tiklash** sinovi; TOTP 2FA enrollment/login/recovery/admin-reset, password/resetdan keyingi HTTP + Socket.IO + media session revoke va audit bo‘yicha xavfsizlik ko‘rigi.
3. Kamida 3–4 parallel xona, 60 ishtirokchili ma’ruza, TURN orqali mobil operator/NAT va Android 8 qurilmasida 80 daqiqalik sinov; kechikish, uzilish va media sifati protokoli.
4. Guruhga cheklangan kirish, noto‘g‘ri rolni bloklash, login, CSRF, 2FA/recovery, sessionVersion, media bridge chiptasi, forum/xabar recipient cheklovi, imtihon va baho auditini mustaqil tekshirish.
5. Articulate/Storyline, iSpring, Captivate va boshqa manbalardan SCORM 1.2 paketlarini sinab: nested/multi-SCO ochilishi, progress, status, ball, `suspend_data`, qayta kirish va assetlarni tekshirish. Sequencing va SCORM 2004 alohida qoladi.

Rasmiy “mos” maqomi faqat kod, kontent, infrastruktura va tashkiliy dalillar birgalikda tekshirilgach universitet vakolatli shaxslari tomonidan tasdiqlanadi.

6. Elektron kutubxona qidiruvi, kursga cheklangan resurs ruxsati, fayl/havola ochilish statistikasi, individual reja, transkript/kredit, talaba harakati va yakuniy natija tasdiqlash oqimini real test ma’lumotlari bilan qabul qilish.

7. `EMAIL_WEBHOOK_URL` ishlatilsa real universitet e-pochta provayderi bilan yuborish/qaytish xatolari, timeout va yetkazib berish jurnalini qabul sinovidan o‘tkazish; webhook sozlanmasa ichki inbox/forum mustaqil ishlashi kerak.

7. `final-exams.js` bo‘yicha semestr yakuniy nazorati, davlat attestatsiyasi va himoya sessiyasini test guruhda yaratish; qatnashuv/shaxs hujjati tekshiruvi, natija qaydi va barcha talabalar yozuvi to‘liq bo‘lmaganda sessiya yopilmasligini tekshirish.

8. Nazoratli testda kamera/mikrofon ruxsati rad etilganda urinish boshlanmasligi; sessiya davomida tab/fullscreen/qurilma/yuz/tovush/tarmoq signallari qayd etilishi; yakunda risk hisobot hosil bo‘lishi va high risk avtomatik ravishda inson ko‘rigiga yuborilishini tekshirish.

9. Productionda `REQUIRE_IN_PERSON_IDENTITY=true` bilan yangi student/o‘qituvchi shaxsan tasdiqlanmasdan login qila olmasligini, admin tasdiq/revoke amallari auditga yozilishini va revoke sessiyalarni bekor qilishini tekshirish.
10. Qayta o‘qish/topshirish workflow’ida fan, semestr, sabab, urinish raqami, muddat, administrator yakuniy tasdig‘i va study-plan holati yangilanishini test qilish.
11. Tasdiqlangan o‘quv reja XLSX/CSV importi va readiness sahifasida har guruh/fan bo‘yicha til, kredit, syllabus, resurs, topshiriq, test va amaliyot coverage tekshiruvini real reja bilan solishtirish.
12. `deploy/backup-mongodb.sh` bilan backup olib, alohida qabul muhitida `deploy/restore-mongodb.sh` orqali restore qilish va `verify-production.sh` health-checkini muvaffaqiyatli yakunlash; backup faylining saqlash/shifrlash siyosatini protokollash.
