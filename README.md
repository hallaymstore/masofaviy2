# Masofaviy2

> Muvofiqlik holati: tizim hali VM 559-son qarordagi to‘liq LMS talablarini bajarmaydi. SCORM, avtoproktoring va davlat tizimlari integratsiyasi yo‘q. Server va metodik hujjatlar tekshirilmaguncha rasmiy masofaviy ta’lim uchun tayyor deb ko‘rsatmang. Tafsilotlar: `docs/COMPLIANCE_GAP_UZ.md`.

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

Fanlar guruh va o‘qituvchiga biriktiriladi. O‘qituvchi HTTPS material havolasi va topshiriq kiritadi, talaba javob yuboradi, o‘qituvchi ball va izoh beradi. Baho tuzatish boshqa administrator tasdig‘i va audit bilan yuritiladi. Test API savollarni javob kalitisiz yuboradi va serverda baholaydi. Bu modul SCORM va avtoproktoring vazifasini bajarmaydi.

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

GitHub Actions har push/PR da syntax check va smoke boot bajaradi.

## Media qatlami

Platformaning boshqaruv, import, jadval, profil, audit, statistika va davomat qatlami productionga yaqinlashtirildi. Real ko‘p ishtirokchili video uchun Mediasoup transport/producer/consumer signaling, TURN credential rotatsiyasi va media server monitoringini keyingi media bosqichida ulash kerak.

> Texnik funksiyalar muvofiqlik uchun asos yaratadi. Ishga tushirishdan oldin universitetning maxfiylik siyosati, ma’lumotlarni saqlash muddati va axborot xavfsizligi reglamenti mas’ul shaxslar tomonidan tasdiqlanishi kerak.
