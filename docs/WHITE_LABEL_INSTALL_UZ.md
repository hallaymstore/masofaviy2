# HALLAYM EDU — White-label o‘rnatish

HALLAYM EDU bitta kod bazasidan turli universitetlarda ishlashi uchun tayyorlangan.

## Admin orqali OTM nomini almashtirish

1. Administrator yoki Bosh administrator akkaunti bilan tizimga kiring.
2. Yon menyudan **Platforma sozlamalari** bo‘limini oching.
3. Universitetning to‘liq nomini kiriting.
4. Zarur bo‘lsa qisqa nom, telefon, manzil, logo URL, rasmiy sayt va boshqa tashqi tizim havolalarini kiriting.
5. **Saqlash va barcha sahifalarda qo‘llash** tugmasini bosing.

Sozlama MongoDB dagi `InstitutionSettings` kolleksiyasida bitta `primary` yozuv sifatida saqlanadi.

## Avtomatik o‘zgaradigan joylar

- Login sahifasi
- Header
- Browser title
- Universitet sahifasi
- Universitet tavsifi va aloqa ma’lumotlari
- Fakultet/kafedra/guruh statistikasi
- Fakultet va guruh kartalari
- Raqamli ekotizim havolalari
- Public timetable sahifasi

Mahsulot nomi barcha OTMlarda: **HALLAYM EDU**.

## Yangi OTMga o‘rnatish

1. Repo va Node.js 22 muhitini tayyorlang.
2. MongoDB URI va boshqa production secretlarni `.env` orqali kiriting.
3. HALLAYM EDU ni ishga tushiring.
4. Admin orqali OTM profilini kiriting.
5. Fakultet → kafedra → guruh tuzilmasini yarating/import qiling.
6. Foydalanuvchilarni Excel/CSV orqali import qiling.
7. Dars jadvalini `teacher_login` va `group_id` orqali import qiling.
8. Domain/Nginx/TLS ni ulang.
9. Mediasoup va TURN public IP/portlarini moslang.

## OTMga xos ma’lumotlar

OTM nomi kodga hardcode qilinmaydi. Tuzilma ham ma’lumotlar bazasidan olinadi.

Joriy QarDTU o‘rnatishida default profil:
- Qarshi davlat texnika universiteti
- QarDTU
- kstu.uz va QarDTU tizimlari

Boshqa OTMda admin bu qiymatlarni o‘zgartiradi.

## Xavfsizlik

Logo va tashqi havolalar faqat HTTPS formatida qabul qilinadi.
Platforma sozlamalarini faqat `admin` va `superadmin` rollari o‘zgartira oladi.
Har bir o‘zgarish audit jurnaliga `INSTITUTION_SETTINGS_UPDATE` sifatida yoziladi.
