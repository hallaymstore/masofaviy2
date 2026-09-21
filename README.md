# Masofaviy2

Oliy ta’lim muassasasi uchun mobil-first, yopiq ro‘yxatdan o‘tishga ega masofaviy ta’lim PWA platformasi.

## Tayyor funksiyalar

- superadmin, admin, texnik xodim, rektorat, dekanat, kafedra, o‘qituvchi, tyutor va talaba rollari;
- rolga standart vakolat berish hamda foydalanuvchiga alohida `add/no` ruxsat qo‘shish;
- fakultet → kafedra → guruh ierarxiyasini yaratish va xavfsiz arxivlash;
- foydalanuvchilarni faqat admin/tech yaratishi, vaqtinchalik parol berilishi;
- dars jadvalini qo‘lda kiritish va o‘qituvchi vaqti to‘qnashuvini bloklash;
- Socket.IO chat, onlayn holat va kirish/chiqishdan avtomatik davomat;
- audit log: muhim boshqaruv amallarining kim, qachon, qayerdan bajargani;
- PWA/offline shell, kunduzgi/tungi rejim, kuchsiz telefonlarga mos ixcham UI;
- Mediasoup, TURN va SFU infratuzilmasi uchun tayyor konfiguratsiya.

## Ishga tushirish

1. `.env.example` faylidan `.env` yarating.
2. MongoDB ulanishini va kuchli `JWT_SECRET` kiriting.
3. `npm install` va `npm start` buyrug‘ini bajaring.
4. Birinchi admin `.env` dagi `ADMIN_LOGIN` va `ADMIN_PASSWORD` bilan avtomatik yaratiladi.

## Keyingi ishlab chiqarish bosqichi

Mediasoup transport/producer/consumer signaling, TURN credential rotatsiyasi, topshiriq-test-baholash, HEMIS import/sinxronlash, fayl ombori, push bildirishnomalar, backup va monitoring alohida modullar sifatida ulanadi. Biometrik ma’lumot foydalanuvchining yozma roziligisiz yig‘ilmaydi.

> Eslatma: dasturiy funksiyalar qonunchilikka muvofiqlik uchun texnik asos yaratadi. Ishga tushirishdan oldin universitetning maxfiylik siyosati, ma’lumotlarni saqlash muddati, rozilik shakllari va axborot xavfsizligi reglamenti vakolatli yurist hamda mas’ul xodim tomonidan tasdiqlanishi kerak.
