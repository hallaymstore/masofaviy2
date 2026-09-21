# Masofaviy2 — mahsulot talablari

## Maqsad

Universitetning dars jadvali, jonli dars, davomat, topshiriq, baholash va boshqaruv nazoratini bitta mobil-first PWA tizimida birlashtirish. Ochiq ro‘yxatdan o‘tish bo‘lmaydi: akkauntlar faqat vakolatli administrator yoki texnik xodim tomonidan yaratiladi.

## Tashkiliy model

`OTM → fakultet → kafedra → ta’lim yo‘nalishi → kurs → guruh → talaba` ierarxiyasi saqlanadi. Tugunlarni yaratish, nomini o‘zgartirish, boshqa bo‘limga ko‘chirish va arxivlash vakolat bilan boshqariladi. Faol talabasi yoki ichki bo‘limi bor tuzilma bevosita o‘chirilmaydi; avval bog‘liqliklar ko‘chiriladi yoki arxivlanadi.

## Rollar

- **Superadmin:** tizim sozlamalari, global vakolatlar, xavfsizlik va audit.
- **Admin:** tuzilma, akkaunt, jadval, hisobot va umumiy boshqaruv.
- **Tech:** akkaunt, qurilma, aloqa, dars xonalari va texnik yordam; akademik bahoni o‘zgartira olmaydi.
- **Rektorat:** OTM bo‘yicha umumiy analitika, dars monitoringi, kechikish va davomat.
- **Dekanat:** faqat o‘z fakulteti, yo‘nalishlari, guruhlari va talabalarini boshqarish.
- **Kafedra mudiri:** fanlar, o‘qituvchilar yuklamasi, kafedra jadvali va bajarilish nazorati.
- **Tyutor:** biriktirilgan guruhlar, talabalar murojaati, davomati va ogohlantirishlari.
- **O‘qituvchi:** o‘z darsi, material, topshiriq, test, davomat, baho, chat va yozuv.
- **Talaba:** o‘z jadvali, jonli dars, topshiriq, natija, xabar va murojaat.

Har bir rolning standart ruxsatlariga qo‘shimcha ravishda foydalanuvchiga alohida ruxsat `add` qilinadi yoki standart ruxsat `no` qilinadi. Har bir o‘zgarish audit jurnalida qoladi.

## Dars jadvali

- oddiy qo‘lda kiritish, nusxalash va haftalik takrorlash;
- fakultet, kafedra, guruh, fan, o‘qituvchi, sana/hafta kuni, boshlanish-tugash va dars turi;
- bir o‘qituvchi yoki guruh uchun vaqt to‘qnashuvini avtomatik bloklash;
- 80 daqiqalik yoki ixtiyoriy davomiylik;
- jadval o‘zgarsa tegishli foydalanuvchilarga bildirishnoma;
- bekor qilish, boshqa vaqtga ko‘chirish va o‘rnini bosuvchi o‘qituvchi;
- telefon uchun kunlik ko‘rinish, desktop uchun haftalik jadval;
- Excel import/eksport va keyinchalik HEMIS bilan sinxronlash.

## Jonli dars

- Mediasoup SFU: o‘qituvchi oqimi bitta server orqali talabalarga uzatiladi;
- coturn/TURN: NAT, mobil operator va yopiq tarmoqlardan ulanish;
- simulcast qatlamlari va adaptiv sifat: past internetda audio-first/144p–360p;
- o‘qituvchi kamera/ekran/oq doska, talabada standart kamera o‘chiq va mikrofon boshqaruvi;
- kutish xonasi, qo‘l ko‘tarish, moderator ruxsati, chat va fayl;
- qayta ulanish, tarmoq sifati indikatori va dars tugaganda resurslarni tozalash;
- parallel xonalar, xona sig‘imi va server yukini kuzatish;
- yozuv faqat tasdiqlangan siyosat va xabardor qilingan foydalanuvchilar bilan.

## Davomat

Kirish, chiqish, qayta ulanish va jami faol daqiqa serverda qayd etiladi. Holatlar: qatnashdi, kechikdi, qatnashmadi, sababli. Kechikish chegarasi sozlanadi. O‘qituvchi tuzatishi mumkin, lekin avvalgi va yangi qiymat auditda saqlanadi. Rektorat/dekanat fakultet, kafedra, fan, o‘qituvchi, guruh va talaba kesimida ko‘radi.

## HEMIS’da yetishmaydigan amaliy oqimlarni qoplash

- jadvaldan bevosita jonli xonaga kirish;
- real vaqt dars monitoringi va hozir onlayn bo‘lganlar;
- uzilishlarni hisobga olgan daqiqali davomat;
- kechikish bo‘yicha avtomatik ogohlantirish va rahbariyat ro‘yxati;
- o‘qituvchi/guruh vaqt to‘qnashuvini kiritish paytida to‘xtatish;
- dars ichidagi chat, oq doska, ekran ulashish va topshiriq;
- texnik muammo dalolatnomasi: qurilma, brauzer, tarmoq va vaqt;
- har bir ma’lumot o‘zgarishining audit izi;
- eski telefon va sekin internet uchun Lite rejim;
- foydalanuvchiga ortiqcha menyu ko‘rsatmaydigan aniq rol interfeysi;
- HEMIS’ni almashtirmasdan, tasdiqlangan API/import orqali akademik ma’lumotlarni uyg‘unlashtirish.

## Ta’lim jarayoni

Fan va mavzular, video/materiallar, topshiriqlar, test savollar banki, urinishlar, muddat, plagiat tekshiruvi integratsiyasi, baholash mezoni, qayta topshirish va elektron qaydnoma. Yakuniy bahoni o‘zgartirish ikki bosqichli tasdiq hamda izoh bilan amalga oshiriladi.

## Qonunchilik va maxfiylik uchun texnik talablar

- faqat zarur shaxsiy ma’lumotni yig‘ish va maqsadini ko‘rsatish;
- rozilik, maxfiylik siyosati, foydalanish qoidalari va saqlash muddatlari;
- O‘zbekistonda talab etiladigan shaxsga doir ma’lumotlarni lokalizatsiya qilish;
- biometrik/Face ID funksiyasini majburiy qilmaslik va alohida roziliksiz yoqmaslik;
- HTTPS, kuchli parol xeshi, qisqa muddatli sessiya, yangilanadigan token va 2FA;
- RBAC/ABAC: fakultet yoki guruh chegarasidan tashqaridagi ma’lumotni server darajasida bloklash;
- audit jurnalini oddiy administrator o‘chira olmasligi;
- backup, tiklash sinovi, hodisalarni aniqlash va javob rejasi;
- foydalanuvchiga o‘z ma’lumoti va faol sessiyalarini ko‘rish imkoniyati;
- eksport, tuzatish va qonuniy asos bo‘lmasa o‘chirish bo‘yicha murojaat jarayoni;
- yozib olingan darslar uchun kirish darajasi va avtomatik arxiv/o‘chirish muddati.

Yakuniy yuridik muvofiqlik universitet yuristi, axborot xavfsizligi mas’uli va shaxsga doir ma’lumotlar bazasi uchun mas’ul shaxs tomonidan tasdiqlanadi.

## Kuchsiz telefonlar uchun chegaralar

- boshlang‘ich JS/CSS hajmini minimal saqlash, sahifalarni talab bo‘yicha yuklash;
- katta kutubxonalarsiz asosiy UI, virtual ro‘yxat va sahifalash;
- rasm/video preview’larini siqish va lazy-load;
- Lite rejimda animatsiya, fon sinxronlash va ishtirokchilar videolarini cheklash;
- Android 8 darajasidagi brauzerlarda asosiy funksiyalarni progressive enhancement bilan saqlash;
- offline shell, so‘nggi jadval va yuborilmagan topshiriq qoralamasini qurilmada vaqtincha saqlash.

## Ishlab chiqarish bosqichlari

1. **Core:** login, rollar, tuzilma, foydalanuvchilar, jadval, PWA, audit.
2. **RTC:** Mediasoup worker/router/transports, TURN, xona, chat va davomat.
3. **LMS:** material, topshiriq, test, baho va bildirishnomalar.
4. **Governance:** rektorat/dekanat analitikasi, eksport, tasdiqlash oqimlari.
5. **Integration:** HEMIS va boshqa universitet tizimlari bilan tasdiqlangan integratsiya.
6. **Production:** xavfsizlik testi, yuklama testi, backup/tiklash, monitoring va reglamentlar.
