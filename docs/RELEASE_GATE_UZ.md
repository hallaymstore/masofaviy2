# Masofaviy ta’limni ishga tushirish dalillari

Asos: VM 559-son qarori (joriy tahrir): https://lex.uz/docs/-6221502. Ushbu jadval kodning o‘zi bilan rasmiy muvofiqlikni e’lon qilishning oldini oladi. Har bandga universitet mas’uli dalil va sanani kiritadi.

| Band | Tasdiqlanishi kerak bo‘lgan dalil | Holat |
|---|---|---|
| 3, 14–16 | Yo‘nalishning kunduzgi shakli, masofaviy shaklga ruxsat, tasdiqlangan qabul/kontrakt parametrlari | OTMdan olinadi |
| 8 | OTMga tegishli yoki kamida 5 yil ijara asosidagi O‘zbekistondagi server hujjati; quvvat va Internet sinovi | Server bosqichida |
| 8–9, 18–19 | Tasdiqlangan o‘quv rejalari va dasturlar, ta’lim tilidagi barcha fanlar kontenti va O‘zDSt 36.2030 ekspertizasi | Metodik komissiya bilan |
| 10–11 | SCORM moslik sinovlari, to‘liq avtoproktoring shaxs/nigoh/tovush dalillari, inson ko‘rigi, apellyatsiya va maxfiylik | SCORM qisman; proktoring qisman |
| 21 | Shaxsan dastlabki ro‘yxat, har semestr yakuniy nazorati, attestatsiya/himoya jarayoni | OTM reglamenti bilan |
| 24 | Barcha dars, amaliyot, mustaqil ish va baholash qaydnomasi LMS orqali | Qisman |
| 26 | Tasdiqlangan o‘qituvchi–talaba yuklamasi, 1:50 nazorati | Dastlabki indikator bor |
| 29 | Vakolatli davlat tizimlari bilan rasmiy API kelishuvi, sinxronizatsiya va qabul sinovi | Rasmiy kirish kerak |

## Texnik qabul sinovi

1. `npm ci`, `npm run check`, `npm test`; production `.env` va MongoDB ulanmaganida xizmat ochilmasligini tasdiqlash.
2. Universitet serverida TLS, ma’lumotlar joylashuvi, zaxira nusxa va **tiklash** sinovi; 2FA, sessiya va audit bo‘yicha xavfsizlik ko‘rigi.
3. Kamida 3–4 parallel xona, 60 ishtirokchili ma’ruza, TURN orqali mobil operator/NAT va Android 8 qurilmasida 80 daqiqalik sinov; kechikish, uzilish va media sifati protokoli.
4. Guruhga cheklangan kirish, noto‘g‘ri rolni bloklash, login, CSRF, media bridge chiptasi, imtihon va baho auditini mustaqil tekshirish.
5. SCORM paketlarini turli mualliflik vositalarida yaratib progress, yakuniy status, ball va qayta kirishni tekshirish. Hozir faqat bitta launch HTML va 1.2 asosiy runtime sinovlari bor.

Rasmiy “mos” maqomi faqat kod, kontent, infrastruktura va tashkiliy dalillar birgalikda tekshirilgach universitet vakolatli shaxslari tomonidan tasdiqlanadi.
