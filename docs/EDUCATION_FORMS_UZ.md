# Ta’lim shakllari: kunduzgi, kechki, sirtqi, masofaviy (2026-10)

Platforma endi universitetning barcha ta’lim shakllarini qamraydi. Masofaviy ta’lim (jonli darslar, videodarslar) avvalgidek ishlaydi. Kunduzgi va kechki auditoriya darslari, sirtqi sessiyalar va auditoriya davomati qo‘shildi.

## Guruh sozlamalari
«Tuzilma» sahifasidagi guruh kartasida yoki «Ta’lim shakllari → Guruhlar» bo‘limida quyidagilar sozlanadi:
- **Ta’lim shakli:** kunduzgi, kechki, sirtqi yoki masofaviy. Shakli belgilanmagan guruh kunduzgi hisoblanadi.
- **Smena:** 1-smena, 2-smena yoki kechki smena.
- **Kurs, ta’lim tili, daraja:** bakalavr yoki magistr.
- **Sirtqi sessiyalar:** sessiya nomi va muddatlari. Sessiya kiritilgan sirtqi guruh darslari faqat sessiya kunlarida «Bugungi darslar», jonli xonalar va avtomatik boshlanishga chiqadi. Sessiya kiritilmaguncha darslar har hafta ko‘rinadi.
- **Ommaviy tahrirlash:** guruhlarni belgilab, ta’lim shakli va smenani bir yo‘la o‘zgartirish mumkin. Dekan va kafedra mudiri faqat o‘z guruhlarini tahrirlaydi.

## Para vaqtlari
«Ta’lim shakllari → Para vaqtlari» bo‘limida har bir shakl uchun alohida jadval bor. Standart vaqtlar:
- **kunduzgi:** 08:30 dan boshlanadi, 6 para;
- **kechki:** 17:00–21:20, 3 para;
- **sirtqi:** 5 para.

Darsni jadvalga qo‘shishda guruh shakliga mos para tanlanadi va vaqt avtomatik to‘ladi. Para vaqtlarini administrator o‘zgartiradi.

## Darsning o‘tish shakli
| Shakl | Jonli xona | Davomat |
| --- | --- | --- |
| 🏫 Auditoriyada | yo‘q | o‘qituvchi ro‘yxat bo‘yicha belgilaydi yoki QR kod orqali |
| 🎥 Onlayn | bor | jonli xonaga kirish bo‘yicha (avvalgidek) |
| 🔀 Gibrid | bor | QR/ro‘yxat + jonli xona |

Shakl tanlanmagan eski darslar onlayn hisoblanadi, ya’ni avvalgi xatti-harakat o‘zgarmaydi. Auditoriya va gibrid darslarda xonaning bandligi ham tekshiriladi.

## Auditoriya davomati
- **O‘qituvchi tomoni.** O‘qituvchi bugungi darsdagi **«Davomat»** tugmasini bosadi va ikki usuldan birini tanlaydi:
  - **Ro‘yxat:** har bir talabaga «Keldi / Kechikdi / Kelmadi / Sababli» belgilanadi. «Belgilanmaganlar — keldi» tugmasi bor.
  - **QR / kod:** ekranga (yoki proyektorga) QR va 6 xonali kod chiqadi.
- **Kodning xavfsizligi.** Kod har 20 soniyada yangilanadi, shuning uchun uni chatga yuborib, darsdan tashqarida ishlatish qiyin. Noto‘g‘ri urinishlar soni cheklangan.
- **Talaba tomoni.** Talaba QR kodni telefon kamerasi bilan skanerlaydi yoki bosh sahifadagi «Auditoriyadagi darsda davomat» kartasiga kodni kiritadi. Dars boshlanganidan `LATE_AFTER_MINUTES` (standart 10) daqiqa o‘tgach belgilangan talaba «kechikdi» hisoblanadi.
- **Hisobotlar.** Davomat odatdagi `Attendance` yozuvlariga tushadi. Shuning uchun hisobotlar, statistika va elektron jurnal uni avtomatik ko‘radi.
- **QR kutubxonasi** o‘z serverimizda turadi (`public/vendor/qrcode.js`, qrcode-generator 1.4.4, MIT). Internet bo‘lmasa ham ishlaydi.
- **Cheklov.** Talaba skanerlagan paytda tizimga kirmagan bo‘lsa, kirib bo‘lguncha kod eskirib qolishi mumkin. Bunday holda talaba ekrandagi yangi kodni qo‘lda kiritadi.

## «Ta’lim shakllari» paneli
Panel rahbariyat, dekanat, kafedra va tyutorlar uchun, har kim faqat o‘z doirasini ko‘radi. Unda:
- har bir shakl bo‘yicha guruhlar, talabalar, bugungi darslar va davomat foizi;
- bugungi barcha darslar: vaqt, shakl, o‘tish shakli, o‘qituvchi, xona va davomat;
- sirtqi sessiyalar holati;
- para vaqtlari.

## Texnik
- Server: `academic-forms.js` (API), `education-forms.js` (qoidalar).
- Interfeys: `public/forms-ui.js`.
- Yangi maydonlar:
  - `Structure`: `educationForm`, `shift`, `language`, `degree`, `courseYear`, `sessions`;
  - `Schedule`: `mode`;
  - `Attendance`: `checkinAt`, `checkinMethod`.
- Hammasi ixtiyoriy, migratsiya talab qilinmaydi.
- Testlar: `tests/academic-forms.test.js` (sessiya filtri, umumiy panel, ruxsatlar, QR oqimi, ommaviy tahrirlash).
