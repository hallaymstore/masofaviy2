# 559-son qaror bo‘yicha dalil va bo‘shliqlar

Holat: kod ko‘rigi, 2026-09-23. Bu hujjat rasmiy huquqiy xulosa emas. Manba: https://lex.uz/docs/-6221502 (joriy tahrir).

| Band | Talab | Koddagi dalil | Holat va keyingi ish |
|---|---|---|---|
| 8 | LMS, bir yillik kontent, barcha fanlar majmualari, infratuzilma, O‘zbekistondagi OTMga tegishli yoki kamida 5 yillik ijara server | `server.js`, `lms.js`, `render.yaml` | LMS qisman. Kontent to‘liqligi va server shartnomasi OTM dalillari bilan tasdiqlanadi. Render Singapur konfiguratsiyasi rasmiy server talabini bajarmaydi. |
| 9 | O‘zDSt 36.2030 bo‘yicha metodik resurslar | Fan va material metadata | Kontent ekspertizasi va standartga moslik protokoli kerak. |
| 10 | SCORM va avtoproktoring | `scorm.js`: ZIP manifesti, sandbox iframe, SCORM 1.2 runtime va progress. `lms.js`: imtihon oynasi, yuz soni va tovush amplitudasi signallari, inson ko‘rigi | Qisman: ko‘p SCO/sequencing va SCORM 2004 yo‘q. Signallar brauzerdan keladi va mustaqil tasdiqlanmagan. Biometrik shaxs tasdig‘i, nigoh, ovoz egasini tekshirish va to‘liq avtoproktoring mavjud emas. |
| 11 | Axborot resurslari, boshqaruv, davomat va o‘zlashtirish, aloqa, kontingent, kurs, kredit, statistika, bilim nazorati | `server.js`, `lms.js`, `resource-upload.js`: kurs resurslari oqimli yuklanadi va kirish nazorat qilinadi | Kurs, topshiriq va test dastlabki bosqich. Individual reja, elektron kutubxona katalogi, kreditlar, qabul/ko‘chirish/arxiv, imtihon va to‘liq baholash qaydnomasi yetishmaydi. |
| 18–19 | Til, yo‘nalish, tasdiqlangan reja va dasturga mos kontent | Fan tili va dastur havolasi | Tasdiqlangan o‘quv rejalari va kontent tekshiruvi kerak. |
| 21 | Shaxsan dastlabki ro‘yxat, semestr yakuniy nazorati, attestatsiya va himoya | `final_exam` jadval turi jonli xonada bloklanadi va OTMda shaxsan deb ko‘rsatiladi | OTM tashkiliy jarayoni hamda shaxsan nazorat qaydlari zarur; kursdagi onlayn test buni almashtirmaydi. |
| 24 | Barcha mashg‘ulot, amaliyot, mustaqil ish va baholash LMSda | Jadval, jonli dars, topshiriq, test | Amaliyot, mustaqil ish, to‘liq baholash va nazorat jarayonlari yetishmaydi. |
| 26 | Bir o‘qituvchiga 1:50 | `/api/lms/compliance` faol fanlar bo‘yicha o‘qituvchiga biriktirilgan noyob talabalarni sanab 50 dan oshganini belgilaydi | Bu dastlabki signal, avtomatik huquqiy xulosa emas: semestr, fan va OTMning tasdiqlangan yuklama ro‘yxati bilan solishtirish kerak. Xona sig‘imi boshqa ko‘rsatkich. |
| 29 | Davlatning ikki monitoring tizimiga integratsiya | Mavjud emas | Rasmiy API kelishuvi, maydonlar xaritasi, sinxronizatsiya va qabul protokoli zarur. |

## Ishga tushirishdan avvalgi texnik chegaralar

- `render.yaml` xizmatining regioni Singapore. O‘zbekistondagi server va ma’lumotlar joylashuvi alohida tasdiqlanmaguncha production migratsiyasi tugallangan hisoblanmaydi.
- Demo administrator faqat development muhitida ishlaydi; productionda MongoDB ulanishi majburiy. Ochiq jadval standart holatda o‘chiq.
- Brauzer sessiyasi `HttpOnly; SameSite=Strict` cookie, productionda `Secure` va mutatsiyalar uchun CSRF bilan ishlaydi. 2FA, sessiyalarni markaziy bekor qilish, CSP/XSS auditi, zaxira nusxa/tiklash testi va penetratsion xavfsizlik testi qolgan.
- Mediasoup kodi va signaling mavjud, ammo real TURN/NAT, 3–4 parallel guruh, 60 talaba yuklama va eski Android qurilmalari bilan o‘lchangan sinov yo‘q.
- SFU signaling maxfiy bridge kaliti bilan cheklangan, har bir peer ulanishi tekshiriladi va media ticket faol darsga qayta bog‘lanadi. Universitet serverida tarmoq/firewall, TLS va TURN sozlash hamda haqiqiy video yuklama sinovi qolgan.
- Yakuniy muvofiqlik uchun OTMning qabul, kadrlar, metodik kontent, auditoriya, server mulki/ijarasi va rasmiy veb-sahifa hujjatlari zarur.
- Imtihon monitoringi tasvir yoki tovushni saqlamaydi. Native FaceDetector bo‘lmasa lokal MediaPipe ishlatiladi; qo‘llab-quvvatlanmaydigan qurilmada signal olinmaydi. Web Audio faqat amplitudani tekshiradi, nutqni aniqlamaydi. Signal talabaning shaxsini isbotlamaydi. Universitet rozilik, alternativ tekshiruv, saqlash muddati, inson ko‘rigi va apellyatsiya tartibini tasdiqlashi kerak.
- Bahoni tuzatish so‘rovi va boshqa administrator tasdig‘i `lms.js`da bor; bu imtihon qaydnomasi, yakuniy nazorat va akademik apellyatsiya tartibining o‘rnini bosmaydi.
- SCORM paketining iframe’i `sandbox="allow-scripts"` bilan opaque origin oladi; token qisqa muddatli, runtime o‘zgarishlari parent orqali autentifikatsiyalanadi. SCORM 2004 rad etiladi. Import ZIP yo‘li, hajm, manifest va asosiy HTML tekshiriladi. `parent.API` ga tayanadigan paketlar ishlamasligi mumkin; antivirus, murakkab paket mosligi va tashqi test to‘plami bilan audit zarur.
- Fayllar MongoDB GridFS da saqlanadi; bajariladigan fayl va HTML material sifatida qabul qilinmaydi. ZIP/RAR/7z arxivlar ichki kontenti antivirusda tekshirilmaydi. Virus skaneri, media transkodlash, real MongoDB va katta faylli reverse proxy sinovlari ishlab chiqarishdan oldin zarur.
