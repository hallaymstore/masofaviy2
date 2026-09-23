# 559-son qaror bo‘yicha dalil va bo‘shliqlar

Holat: kod ko‘rigi, 2026-09-23. Bu hujjat rasmiy huquqiy xulosa emas. Manba: https://lex.uz/docs/-6221502 (joriy tahrir).

| Band | Talab | Koddagi dalil | Holat va keyingi ish |
|---|---|---|---|
| 8 | LMS, bir yillik kontent, barcha fanlar majmualari, infratuzilma, O‘zbekistondagi OTMga tegishli yoki kamida 5 yillik ijara server | `server.js`, `lms.js`, `render.yaml` | LMS qisman. Kontent to‘liqligi va server shartnomasi OTM dalillari bilan tasdiqlanadi. Render Singapur konfiguratsiyasi rasmiy server talabini bajarmaydi. |
| 9 | O‘zDSt 36.2030 bo‘yicha metodik resurslar | Fan va material metadata | Kontent ekspertizasi va standartga moslik protokoli kerak. |
| 10 | SCORM va avtoproktoring | `scorm.js`: ZIP manifesti, sandbox iframe, SCORM 1.2 asosiy runtime va progress. `lms.js`: imtihon oynasi/kamera signallari, inson ko‘rigi | Qisman: ko‘p SCO/sequencing, SCORM 2004 moslik sinovlari qolgan. Signallar brauzerdan keladi va mustaqil tasdiqlanmagan. Biometrik shaxs tasdig‘i, nigoh, tovush tahlili va to‘liq avtoproktoring mavjud emas. |
| 11 | Axborot resurslari, boshqaruv, davomat va o‘zlashtirish, aloqa, kontingent, kurs, kredit, statistika, bilim nazorati | `server.js` va `lms.js`da qisman | Kurs, topshiriq va test dastlabki bosqich. Individual reja, elektron kutubxona, kreditlar, qabul/ko‘chirish/arxiv, imtihon va to‘liq baholash qaydnomasi yetishmaydi. |
| 18–19 | Til, yo‘nalish, tasdiqlangan reja va dasturga mos kontent | Fan tili va dastur havolasi | Tasdiqlangan o‘quv rejalari va kontent tekshiruvi kerak. |
| 21 | Shaxsan dastlabki ro‘yxat, semestr yakuniy nazorati, attestatsiya va himoya | Onlayn login va test | OTM tashkiliy jarayoni hamda offlayn yakuniy nazorat qaydlari zarur; onlayn test buni almashtirmaydi. |
| 24 | Barcha mashg‘ulot, amaliyot, mustaqil ish va baholash LMSda | Jadval, jonli dars, topshiriq, test | Amaliyot, mustaqil ish, to‘liq baholash va nazorat jarayonlari yetishmaydi. |
| 26 | Bir o‘qituvchiga 1:50 | `maxParticipants` xona cheklovi | Akademik yuklama bo‘yicha avtomatik yoki tashkiliy nazorat kerak; xona sig‘imi boshqa ko‘rsatkich. |
| 29 | Davlatning ikki monitoring tizimiga integratsiya | Mavjud emas | Rasmiy API kelishuvi, maydonlar xaritasi, sinxronizatsiya va qabul protokoli zarur. |

## Ishga tushirishdan avvalgi texnik chegaralar

- `render.yaml` xizmatining regioni Singapore. O‘zbekistondagi server va ma’lumotlar joylashuvi alohida tasdiqlanmaguncha production migratsiyasi tugallangan hisoblanmaydi.
- Demo administrator faqat development muhitida ishlaydi; productionda MongoDB ulanishi majburiy. Ochiq jadval standart holatda o‘chiq.
- JWT brauzer `localStorage`ida; sessiya va XSS tahdidlari bo‘yicha qayta ishlash, 2FA, zaxira nusxa/tiklash testi va xavfsizlik testi qolgan.
- Mediasoup kodi va signaling mavjud, ammo real TURN/NAT, 3–4 parallel guruh, 60 talaba yuklama va eski Android qurilmalari bilan o‘lchangan sinov yo‘q.
- Yakuniy muvofiqlik uchun OTMning qabul, kadrlar, metodik kontent, auditoriya, server mulki/ijarasi va rasmiy veb-sahifa hujjatlari zarur.
- Imtihon monitoringi tasvir yoki tovushni saqlamaydi. FaceDetector qo‘llanmaydigan qurilmada yuz signali olinmaydi; undagi signal ham talabaning shaxsini isbotlamaydi. Universitet rozilik, alternativ tekshiruv, saqlash muddati, inson ko‘rigi va apellyatsiya tartibini tasdiqlashi kerak.
- Bahoni tuzatish so‘rovi va boshqa administrator tasdig‘i `lms.js`da bor; bu imtihon qaydnomasi, yakuniy nazorat va akademik apellyatsiya tartibining o‘rnini bosmaydi.
- SCORM paketining iframe’i `sandbox="allow-scripts"` bilan opaque origin oladi; token qisqa muddatli, runtime o‘zgarishlari parent orqali autentifikatsiyalanadi. Import ZIP yo‘li, hajm, manifest va asosiy HTML tekshiriladi. Antivirus, murakkab paket mosligi va tashqi test to‘plami bilan audit zarur.
