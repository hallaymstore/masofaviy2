# Universitet bo‘limlari (2026-10)

Platforma endi butun universitetni qamraydi. Masofaviy ta’lim uning bir bo‘limi bo‘lib qoladi: jadval, jonli darslar, kurslar va baholar avvalgidek ishlaydi.

## Tuzilma

| Tur | Misollar | Qayerdan olinadi |
| --- | --- | --- |
| Rahbariyat | Rektorat, prorektorlar | Namunaviy tuzilma |
| Fakultet | Dekanatlar | Akademik tuzilmadan avtomatik |
| Kafedra | Kafedralar | Akademik tuzilmadan avtomatik |
| Bo‘lim va boshqarma | Registrator ofisi, buxgalteriya, kadrlar, ilmiy bo‘lim, xalqaro aloqalar… | Namunaviy tuzilma |
| Markaz | Masofaviy ta’lim, AT markazi, ARM, qabul komissiyasi | Namunaviy tuzilma |
| Xizmat | TTJ, psixolog, tibbiyot punkti, sport klubi | Namunaviy tuzilma |

**Birinchi qadam:** administrator «Bo‘limlar va xizmatlar» sahifasida «Namunaviy universitet tuzilmasini yaratish» tugmasini bosadi. Natijada 29 ta bo‘lim va 45 ta tayyor onlayn xizmat yaratiladi, fakultet va kafedralar akademik tuzilmadan olinadi. Tugmani qayta bosish xavfsiz: faqat yetishmagan bo‘limlar qo‘shiladi.

## Rollar

- **Global rol «Xodim» (`staff`):** o‘qituvchi bo‘lmagan xodim (registrator, buxgalter, kadrlar xodimi, AT mutaxassisi va h.k.).
- **Bo‘lim ichidagi rollar** (har bir bo‘limda alohida):
  - **Rahbar.** Uni administrator tayinlaydi.
  - **O‘rinbosar.** Bo‘lim sozlamalari, xizmatlar, ilovalar va xodimlarni boshqaradi.
  - **Xodim.** Murojaatlarni ko‘rib chiqadi, e’lon, hujjat, vazifa va tadbirlar bilan ishlaydi.
  - **Kuzatuvchi.** Ichki ma’lumotni faqat o‘qiydi.
- **Avtomatik bog‘lanish:**
  - dekan o‘z fakultetiga rahbar bo‘ladi;
  - kafedra mudiri o‘z kafedrasiga rahbar bo‘ladi;
  - o‘qituvchi o‘z kafedrasiga xodim bo‘ladi;
  - tyutor o‘z fakultetiga xodim bo‘ladi;
  - rektorat hamma bo‘limda kuzatuvchi bo‘ladi;
  - administrator hamma bo‘limda to‘liq huquqqa ega.

## Har bir bo‘lim o‘zi yoqadigan funksiyalar

- **E’lonlar.** Auditoriya tanlanadi (hamma, talabalar, xodimlar yoki faqat bo‘lim), «Tanishib chiqdim» tasdig‘i so‘ralishi mumkin.
- **Xizmatlar va arizalar.**
  - Shakl quruvchi: maydon turlari — matn, son, sana, tanlov va telefon.
  - Muddat ish kunlarida hisoblanadi.
  - Har bir arizaga raqam beriladi, masalan `REG-2026-0001`.
  - Holatlar: yangi → ko‘rib chiqilmoqda → ma’lumot kutilmoqda → bajarildi / rad etildi.
  - Har bir arizaning tarixi va izohlari saqlanadi.
- **Hujjatlar.** Nizom, buyruq, namuna va hisobotlar saqlanadi. Har bir hujjat hammaga ochiq yoki faqat bo‘lim uchun bo‘ladi, fayl turi haqiqiy mazmuni bo‘yicha tekshiriladi.
- **Vazifalar.** Ichki taxta: bajarilishi kerak, jarayonda, bajarildi. Ijrochi, muddat va muhimlik belgilanadi.
- **Tadbirlar.** Kalendar va ro‘yxatdan o‘tish, joylar soni cheklanadi.
- **Ilovalar.** Tashqi tizimlar (HEMIS, my.gov.uz va boshqalar) bir joyda turadi, platforma ichida yoki yangi oynada ochiladi. Platforma tashqi tizimlarning parollarini saqlamaydi, ularni brauzer eslab qoladi.
- **Xodimlar.** Lavozim va aloqa ma’lumotlari.
- **Masofaviy ta’lim.** Fakultet va kafedralar uchun guruhlar, o‘qituvchilar va o‘quv sahifalariga havolalar.

## Sahifalar

- **Bo‘limlar va xizmatlar:** katalog, qidiruv, bo‘lim sahifasi. Har bir bo‘limning to‘g‘ridan-to‘g‘ri havolasi bor (`#unit=<id>`).
- **Ish joyim:** menga biriktirilgan va yangi murojaatlar, vazifalarim, tasdiq kutayotgan e’lonlar, yaqin tadbirlar.
- **Murojaatlarim:** har bir foydalanuvchi yuborgan arizalari va ularning holati.

## Texnik

- Server: `units.js` (API), `units-rules.js` (rollar va qoidalar), `units-presets.js` (namunaviy tuzilma).
- Interfeys: `public/units-ui.js`.
- MongoDB to‘plamlari: `orgunits`, `unitmembers`, `unitposts`, `unitdocs`, `unitservices`, `unitrequests`, `unittasks`, `unitevents`. Fayllar GridFS’ning `unit_files` bucket’ida saqlanadi.
- Fayl hajmi chegarasi: `MAX_UNIT_FILE_MB` (standart 40).
- Testlar: `tests/units-api.test.js` haqiqiy Express marshrutlarini xotiradagi modellar bilan tekshiradi.
