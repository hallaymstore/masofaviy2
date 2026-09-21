# Masofaviy2

Oliy ta’lim muassasasi uchun mobil-first, yopiq ro‘yxatdan o‘tishga ega masofaviy ta’lim PWA platformasi. Ushbu versiyada **rolga mos interfeys, statistik boshqaruv va nazorat** markaziy o‘ringa qo‘yilgan.

## Asosiy imkoniyatlar

- superadmin, admin, tech, rectorate, dean, department, teacher, tutor va student rollari va permission override tizimi;
- admin/rahbariyat uchun alohida **Statistika** markazi: faol/bloklangan userlar, o‘qituvchi/talaba soni, bugungi darslar, onlaynlar, davomat, kechikish, 7/14/30 kunlik trend, top o‘qituvchilar va guruhlar;
- **ma’lumot sifati nazorati**: aloqa ma’lumoti yetishmaydigan userlar, guruhsiz talabalar, jadvalsiz o‘qituvchilar va guruhlar;
- har bir user uchun shaxsiy profil, aloqa ma’lumotlari, tashkilot bog‘lanishi, parol almashtirish va o‘z dars jadvali;
- admin uchun user qidiruvi, rol/holat filtri, bloklash/ochish, vaqtinchalik parolni tiklash va audit izi;
- fakultet → kafedra → guruh ierarxiyasi, tashqi **ID** orqali ishonchli bog‘lash;
- dars jadvalini qo‘lda yoki Excel/CSV orqali import qilish; teacher_login orqali o‘qituvchi va group_id orqali guruh avtomatik topiladi;
- dars qo‘shishda o‘qituvchi, guruh va xona vaqt to‘qnashuvlarini bloklash;
- o‘qituvchi va guruh uchun login talab qilmaydigan, alohida ulashiladigan/print qilinadigan jadval havolalari;
- Socket.IO asosida onlayn holat, darsga kirish huquqini tekshirish, chat va avtomatik davomat; kechikish chegarasi sozlanadi;
- nazorat sahifasida davomat jurnali, hozir onlayn userlar va qidiriladigan audit tarixi;
- PWA/offline shell, kunduzgi/tungi rejim va kuchsiz telefonlar uchun ixcham responsive UI;
- Mediasoup/TURN/SFU integratsiyasini keyingi media bosqichiga ulash uchun konfiguratsiya maydonlari.

## Import formatlari

Foydalanuvchi importi (.xlsx yoki .csv) uchun asosiy ustunlar:

    full_name, login, role, password, faculty_id, department_id, group_id, email, phone

Dars jadvali importi uchun:

    title, subject, group_id, teacher_login, weekday, start, end, room, kind

Import avval **dry-run tekshiruv**dan o‘tadi: noto‘g‘ri login, mavjud bo‘lmagan guruh ID, takroriy yozuv yoki vaqt to‘qnashuvi xato qatori bilan ko‘rsatiladi.

## Ishga tushirish

1. .env.example faylidan .env yarating.
2. MongoDB ulanishi, kuchli JWT_SECRET, admin login/parolini kiriting.
3. O‘zbekiston uchun APP_UTC_OFFSET_MINUTES=300; kechikish chegarasi uchun LATE_AFTER_MINUTES=5. Ochiq jadval linklarini o‘chirish kerak bo‘lsa PUBLIC_TIMETABLE_ENABLED=false qiling.
4. npm install va npm start buyrug‘ini bajaring.
5. npm run check bilan server, frontend va service worker sintaksisini tekshiring.

## Ishlab chiqarishdagi keyingi media bosqichi

Statistika, boshqaruv, jadval, import, profil, audit va davomat qatlami ishlaydigan backend/frontend sifatida tayyorlangan. Real ko‘p ishtirokchili video uchun Mediasoup transport/producer/consumer signaling, TURN credential rotatsiyasi va media server monitoringi alohida production bosqichida ulanadi. Keyinchalik HEMIS sinxronlash, topshiriq/test/baholash, push bildirishnomalar, fayl ombori va avtomatik backup ham modul sifatida qo‘shilishi mumkin.

> Eslatma: texnik funksiyalar muvofiqlik uchun asos yaratadi. Ishga tushirishdan oldin universitetning maxfiylik siyosati, ma’lumotlarni saqlash muddati va axborot xavfsizligi reglamenti mas’ul shaxslar tomonidan tasdiqlanishi kerak.
