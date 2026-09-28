# QarDTU platforma ma’lumotlari — manbalar va status

Yangilangan: 2026-09-28.

## Rasmiy/ochiq manbalardan olingan ma’lumotlar

### Universitet
- Nomi: Qarshi davlat texnika universiteti (QarDTU).
- Tashkil etish hujjati: O‘zbekiston Respublikasi Prezidentining 2024-yil 10-dekabrdagi PQ-428-son qarori.
- Rasmiy sayt: https://kstu.uz
- Masofaviy ta’lim Moodle: https://moodle.kstu.uz
- BMBA yo‘nalishlar sahifasi: https://my.uzbmb.uz/university-about-direction/435
- Manzil: Qarshi shahri, Mustaqillik ko‘chasi, 225-uy.
- KSTU Call-markaz: +998 75 220-09-24.

### Fakultetlar
KSTU masofaviy ta’lim tizimidagi ochiq kurs kategoriyalari asosida:
1. Transport va qurilish muhandisligi fakulteti
2. Energetika muhandisligi fakulteti
3. Neft-gaz va geologiya fakulteti
4. Raqamli texnologiyalar va sun’iy intellekt fakulteti
5. Shahrisabz oziq-ovqat muhandisligi fakulteti
6. Iqtisodiyot va boshqaruv fakulteti
7. Irrigatsiya muhandisligi fakulteti

### Masofaviy bakalavriat yo‘nalishlari
BMBA QarDTU sahifasida “Masofaviy” ta’lim shakli bilan ko‘rsatilgan yo‘nalishlar:
- Axborot tizimlari va texnologiyalari
- Bank ishi
- Buxgalteriya hisobi
- Dasturiy injiniring
- Iqtisodiyot
- Kompyuter injiniringi
- Logistika
- Menejment
- Moliya va moliyaviy texnologiyalar
- Soliqlar va soliqqa tortish
- Statistika
- Sun’iy intellekt

### Kafedralar
KSTU rasmiy fakultet sahifalarida aniq ko‘rsatilgan kafedralar bazaga kiritilgan:
- Raqamli texnologiyalar va sun’iy intellekt: 3 ta
- Energetika muhandisligi: 5 ta
- Neft-gaz va geologiya: 4 ta
- Irrigatsiya muhandisligi: 5 ta
- Iqtisodiyot va boshqaruv bo‘yicha ochiq ilmiy materiallarda tasdiqlangan “Buxgalteriya hisobi va audit” va “Innovatsion iqtisodiyot”.

## Platforma ichki identifikatorlari

`MT-*-1-26` ko‘rinishidagi guruh kodlari **universitetning rasmiy HEMIS guruh kodlari deb da’vo qilinmaydi**. Ular:
- 2026/2027 taqdimot va platforma ichki rejalashtirish uchun;
- jadval, video xona va import oqimini ko‘rsatish uchun;
- keyinchalik universitetdan HEMIS/Excel/CSV eksport olinganda real group ID bilan almashtiriladi.

Shu sababli platformada real tuzilma bilan ichki texnik identifikatorlar ajratib yuritiladi.

## Seed
Idempotent seed:
```bash
node deploy/seed-qdtu-structure.mjs
```

Seed foydalanuvchilar, darslar, davomat yoki audit tarixini o‘chirmaydi.
