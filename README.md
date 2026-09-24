# Masofaviy2

> Muvofiqlik holati: LMSning asosiy 559-son oqimlari sezilarli darajada yopilgan: SCORM 1.2 multi-SCO/resume, akademik reja/kredit/transkript, qayta o‘qish, elektron kutubxona, kommunikatsiya, shaxsan identifikatsiya qaydi, yakuniy nazorat reyestri, monitoring eksport/sync adapteri, 2FA va backup/restore mavjud. Shunga qaramay **rasmiy “to‘liq mos” deb e’lon qilinmaydi**: avtoproktoringning 2-banddagi to‘liq biometrik/gaze/tovush imkoniyatlari, real SCORM conformance, davlatning ikki tizimi bilan vakolatli API qabul sinovi, O‘zDSt 36.2030 metodik ekspertizasi va universitet serveridagi yuklama/xavfsizlik qabul protokoli hali tashqi dalillar bilan yopilishi kerak. Tafsilotlar: `docs/COMPLIANCE_GAP_UZ.md`, `docs/RELEASE_GATE_UZ.md`.

Oliy ta’lim muassasasi uchun mobil-first, yopiq ro‘yxatdan o‘tishga ega masofaviy ta’lim PWA platformasi. Ushbu versiyada **qulaylik + erkin boshqaruv + kuchli nazorat + batafsil statistika** markaziy o‘ringa qo‘yilgan.

## Asosiy imkoniyatlar

- superadmin, admin, tech, rectorate, dean, department, teacher, tutor va student rollari;
- rollar uchun standart permissionlar, foydalanuvchi kesimida qo‘shimcha ruxsat va taqiqlar;
- fakultet → kafedra → guruh ierarxiyasi va tashqi ID orqali ishonchli bog‘lash;
- Excel/CSV orqali user va dars jadvali importi, avval dry-run tekshiruv;
- dars jadvalida o‘qituvchi, guruh va xona vaqt to‘qnashuvini avtomatik bloklash;
- o‘qituvchi va guruh uchun alohida ulashiladigan/print qilinadigan jadval havolalari;
- user qidiruvi, rol/holat filtri, bloklash/ochish, parol reset, profil tahriri va permission editor;
- vaqtinchalik parol bilan kirgan userni parol almashtirish sahifasiga yo‘naltirish;
- login brute-force himoyasi va LOGIN_FAILED audit yozuvlari;
- Socket.IO onlayn holat, jonli dars chat va darsga rol/guruh bo‘yicha kirish nazorati;
- avtomatik davomat, kechikish aniqlash, darsdagi vaqtni hisoblash;
- admin/tech uchun audit bilan davomatni tuzatish;
- boshqaruv doirasiga mos ma’lumot ajratish: dekan faqat o‘z fakulteti, kafedra mudiri faqat o‘z kafedrasi, tyutor faqat biriktirilgan doira;
- tizim holati: MongoDB ulanishi, RAM, uptime, socket va onlayn foydalanuvchilar.

## Statistika markazi

Statistika platformaning asosiy boshqaruv qismi sifatida kengaytirildi:

- faol va bloklangan userlar;
- talaba/o‘qituvchi soni;
- bugungi va umumiy darslar;
- real-time onlaynlar;
- bugungi kutilgan qatnashuv, haqiqiy qatnashuv, kechikish va davomat foizi;
- 7 / 14 / 30 kunlik davomat dinamikasi;
- hafta kunlari bo‘yicha dars yuklamasi;
- rollar bo‘yicha userlar taqsimoti;
- top o‘qituvchilar va guruhlar;
- aloqa ma’lumoti yetishmaydigan userlar;
- guruhsiz talabalar;
- jadvalsiz o‘qituvchilar va guruhlar;
- fakultet → kafedra → guruh bo‘yicha filtrlash;
- guruhlar kesimida: talabalar soni, haftalik darslar, kutilgan qatnashuv, qatnashganlar, kechikish, davomat foizi;
- guruh ichiga kirib har bir talabaning qatnashuvi, kechikishi, darsdagi daqiqasi va foizini ko‘rish;
- statistika va davomatni CSV eksport qilish.

## Fanlar va vazifalar

Fanlar guruh va o‘qituvchiga biriktiriladi. O‘qituvchi HTTPS material havolasi bilan birga PDF, Office/ODF, matn, subtitr, rasm, audio, video, elektron kitob va arxivlarni joylay oladi. Fayllar MongoDB GridFS ga oqim bilan yoziladi; tur haqiqiy mazmuniga qarab tekshiriladi, kirish kurs ruxsatiga bog‘langan. `MAX_RESOURCE_MB` standart 1024 MB; katta yuklashda reverse proxy chegarasini ham sozlash kerak. HTML va bajariladigan dasturlar rad etiladi. Talaba javob yuboradi, o‘qituvchi ball va izoh beradi. Baho tuzatish boshqa administrator tasdig‘i va audit bilan yuritiladi. Test API savollarni javob kalitisiz yuboradi va serverda baholaydi.

SCORM 1.2 uchun paket importi va runtime qo‘shildi: ZIP manifesti va xavfli yo‘llar tekshiriladi, nested organization ichidagi bir nechta SCO aniqlanadi, har bir SCO alohida ishga tushiriladi va resume holati runtime boshlanishidan oldin yuklanadi. Status, ball, joylashuv, `suspend_data`, objective va interaction ma’lumotlari saqlanadi. Paket chegarasi 8 MB. SCORM 2004 va sequencing/adaptive navigation hali qo‘llanmaydi; real mualliflik vositalari bilan conformance sinovi talab etiladi.

Testda talaba xabardor bo‘lib rozilik bersa, sahifadan chiqish, kamera va mikrofon ruxsatlari, yuz mavjudligi/ko‘pligi va baland fon ovozi signallari vaqt belgisi bilan qayd etiladi. Yuz tahlili brauzerning `FaceDetector` vositasida yoki lokal MediaPipe kutubxonasida, ovoz amplitudasi brauzerning Web Audio vositasida hisoblanadi. Tasvir va tovush serverga yuborilmaydi va saqlanmaydi. O‘qituvchi signalni ko‘rib chiqadi; signal avtomatik intizomiy qaror emas. Shaxsni biometrik tasdiqlash, nigoh, ovoz egasini aniqlash, aldovni ishonchli aniqlash va mustaqil sinovdan o‘tgan to‘liq avtoproktoring hali mavjud emas.

Admin uchun **Tayyorlik** hisobotida fansiz guruhlar, fanda dastur/material/topshiriq/test borligi va o‘qituvchiga biriktirilgan noyob talabalar soni ko‘rinadi. 50 dan yuqori son tekshiruv signalidir; tasdiqlangan akademik yuklama bilan alohida solishtiriladi.

Jadvaldagi `final_exam` (yakuniy nazorat) jonli xonada boshlanmaydi; interfeys uni OTMda shaxsan deb ko‘rsatadi. Kurs ichidagi onlayn testlar joriy/oraliq o‘zlashtirish uchun mo‘ljallangan; semestr yakuniy nazorati, davlat attestatsiyasi va himoya tartibini almashtirmaydi.


## Elektron kutubxona va akademik yozuvlar

- alohida qidiriladigan elektron kutubxona: kitob, darslik, qo‘llanma, monografiya, ilmiy maqola, tadqiqot, dissertatsiya va standartlar;
- resurslarni butun universitet yoki muayyan fanlarga cheklash;
- kursga yuklangan faylni kutubxona katalogiga biriktirish;
- resurs ochilishini foydalanuvchi kesimida qayd etish va o‘qituvchiga noyob foydalanuvchi/sessiya statistikasini ko‘rsatish;
- talaba uchun individual o‘quv reja, semestr va kreditlar;
- fan bo‘yicha joriy/yakuniy/umumiy natija, OTM mezoniga mos baho belgisi va administrator yakuniy tasdig‘i;
- transkript va jami tasdiqlangan kreditlar;
- qabul, ko‘chirish, chetlashtirish, qayta tiklash, kursdan kursga o‘tkazish, guruh almashtirish va bitirish tarixini audit bilan yuritish;
- topshiriqlarni oddiy topshiriq, mustaqil ish yoki amaliyot sifatida ajratish.

## Aloqa va akkaunt xavfsizligi

- kursga bog‘langan doimiy forum, ichki inbox/sent xabarlar va o‘qilganlik qaydi;
- talaba faqat o‘z guruhidagi fan o‘qituvchilariga, o‘qituvchi esa o‘z guruhlaridagi talabalarga yozadi;
- ixtiyoriy `EMAIL_WEBHOOK_URL` orqali xabarni tashqi e-pochtaga yetkazish bridge’i;
- TOTP authenticator 2FA, AES-256-GCM bilan shifrlangan secret va 8 ta bir martalik recovery kod;
- foydalanuvchi boshqa qurilmalardagi sessiyalarni bekor qila oladi; admin akkaunt sessiyalari va yo‘qolgan 2FA’ni audit bilan reset qiladi;
- parol almashtirish/reset yoki bloklash eski HTTP, Socket.IO va yangi media ticket sessiyalarini yaroqsiz qiladi.

## Import formatlari

Foydalanuvchi importi (.xlsx yoki .csv):

    full_name, login, role, password, faculty_id, department_id, group_id, email, phone

Dars jadvali importi:

    title, subject, group_id, teacher_login, weekday, start, end, room, kind

Import avval tekshiriladi. Mavjud bo‘lmagan ID/login, takroriy login, noto‘g‘ri rol, o‘qituvchi/guruh/xona vaqt to‘qnashuvi aniq qator raqami bilan qaytariladi.

## Muhim environment sozlamalari

    PORT=3000
    MONGODB_URI=...
    JWT_SECRET=...
    TOTP_ENCRYPTION_KEY=...
    ADMIN_LOGIN=admin
    ADMIN_PASSWORD=...
    APP_UTC_OFFSET_MINUTES=300
    LATE_AFTER_MINUTES=5
    PUBLIC_TIMETABLE_ENABLED=true
    TURN_URLS=turn:turn.example.uz:3478
    EMAIL_WEBHOOK_URL=
    LOGIN_MAX_ATTEMPTS=7
    LOGIN_WINDOW_MS=900000

O‘zbekiston vaqti uchun APP_UTC_OFFSET_MINUTES=300. Ochiq jadval linklari kerak bo‘lmasa PUBLIC_TIMETABLE_ENABLED=false qiling.

## Ishga tushirish

1. .env.example faylidan .env yarating.
2. MongoDB va kuchli JWT_SECRET kiriting.
3. npm install
4. npm start
5. npm run check

GitHub Actions har push/PR da Node 22 muhitida syntax check, unit test va HttpOnly-cookie login bilan smoke boot bajaradi.

## Davlat monitoring integratsiyasi

29-band uchun `monitoring-export.js` ikki alohida provider bilan ishlashga tayyorlangan. U student/o‘qituvchi va tuzilma external-ID mapping’ini tekshiradi, snapshot hash yaratadi, faqat HTTPS gateway’ga yuboradi, token/schema/ruxsat flagi to‘liq bo‘lmasa syncni bloklaydi, idempotency kaliti ishlatadi va receipt/reference hamda audit tarixini saqlaydi.

Bu **rasmiy API topilgan deb taxmin qilmaydi**. `MONITORING_MINISTRY_*` va `MONITORING_QUALITY_*` qiymatlari faqat vakolatli tashkilotlar bergan integratsiya hujjati asosida productionga kiritiladi. Shundan keyin test eksport → sync → receipt → qayta yuborish/idempotency qabul sinovi o‘tkaziladi.

## Media qatlami

Platformaning boshqaruv, import, jadval, profil, audit, statistika va davomat qatlami ishlab chiqilgan. Mediasoup transport/producer/consumer signaling kodi bor; TURN credential rotatsiyasi, real server monitoringi va ko‘p ishtirokchili yuklama sinovi keyingi media bosqichida yakunlanadi.

SFU ishga tushirilganda platforma va `media-server` muhitiga bir xil, tasodifiy kamida 32 belgili `SFU_BRIDGE_SECRET` kiriting. Platformada `SFU_BRIDGE_URL`, media serverda `ANNOUNCED_IP` va `PLATFORM_VERIFY_URL` belgilanadi. Productionda signaling ulanishi maxfiy kalitsiz qabul qilinmaydi; media ticket faol dars va foydalanuvchi bilan qayta tekshiriladi. Haqiqiy server ulanishi va TURN sinovi hali qolgan.

Brauzer login sessiyasi `HttpOnly; SameSite=Strict` cookie orqali yuritiladi (`Secure` productionda yoqiladi). O‘zgartirish so‘rovlarida CSRF token tekshiriladi; oldingi brauzer `localStorage` tokeni avtomatik o‘chiriladi. Mobil ilova yoki boshqa API mijozi uchun Bearer auth vaqtincha qoldirilgan.

> Texnik funksiyalar muvofiqlik uchun asos yaratadi. Ishga tushirishdan oldin universitetning maxfiylik siyosati, ma’lumotlarni saqlash muddati va axborot xavfsizligi reglamenti mas’ul shaxslar tomonidan tasdiqlanishi kerak.
