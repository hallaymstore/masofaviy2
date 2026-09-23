# Masofaviy2

> Muvofiqlik holati: tizim hali VM 559-son qarordagi to‘liq LMS talablarini bajarmaydi. SCORM 1.2 qisman, imtihon signalini qayd etish qisman; to‘liq avtoproktoring va davlat tizimlari integratsiyasi yo‘q. Server va metodik hujjatlar tekshirilmaguncha rasmiy masofaviy ta’lim uchun tayyor deb ko‘rsatmang. Tafsilotlar: `docs/COMPLIANCE_GAP_UZ.md`, `docs/RELEASE_GATE_UZ.md`.

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
    ADMIN_LOGIN=admin
    ADMIN_PASSWORD=...
    APP_UTC_OFFSET_MINUTES=300
    LATE_AFTER_MINUTES=5
    PUBLIC_TIMETABLE_ENABLED=true
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

## Media qatlami

Platformaning boshqaruv, import, jadval, profil, audit, statistika va davomat qatlami ishlab chiqilgan. Mediasoup transport/producer/consumer signaling kodi bor; TURN credential rotatsiyasi, real server monitoringi va ko‘p ishtirokchili yuklama sinovi keyingi media bosqichida yakunlanadi.

SFU ishga tushirilganda platforma va `media-server` muhitiga bir xil, tasodifiy kamida 32 belgili `SFU_BRIDGE_SECRET` kiriting. Platformada `SFU_BRIDGE_URL`, media serverda `ANNOUNCED_IP` va `PLATFORM_VERIFY_URL` belgilanadi. Productionda signaling ulanishi maxfiy kalitsiz qabul qilinmaydi; media ticket faol dars va foydalanuvchi bilan qayta tekshiriladi. Haqiqiy server ulanishi va TURN sinovi hali qolgan.

Brauzer login sessiyasi `HttpOnly; SameSite=Strict` cookie orqali yuritiladi (`Secure` productionda yoqiladi). O‘zgartirish so‘rovlarida CSRF token tekshiriladi; oldingi brauzer `localStorage` tokeni avtomatik o‘chiriladi. Mobil ilova yoki boshqa API mijozi uchun Bearer auth vaqtincha qoldirilgan.

> Texnik funksiyalar muvofiqlik uchun asos yaratadi. Ishga tushirishdan oldin universitetning maxfiylik siyosati, ma’lumotlarni saqlash muddati va axborot xavfsizligi reglamenti mas’ul shaxslar tomonidan tasdiqlanishi kerak.
