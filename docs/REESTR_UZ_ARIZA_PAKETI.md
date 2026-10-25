# 12-band: reestr.uz ga ro‘yxatdan o‘tkazish uchun hujjatlar paketi

**Talab:** “Raqamli hukumatning axborot tizimlari va resurslari yagona reestri” (reestr.uz) da ro‘yxatdan o‘tganlik va tegishli xulosa.

> Bu band **kod bilan yopilmaydi**. Reestrga yozuvni va xulosani faqat vakolatli operator beradi. Quyidagi paket ariza topshirishni tezlashtirish uchun tayyorlangan. Ariza topshirilgach ariza raqami va sanasi, xulosa olingach esa xulosa raqami shu faylning oxiridagi jadvalga yoziladi.

## 1. Kim, qachon, nima qiladi

| Qadam | Mas’ul | Natija |
|---|---|---|
| 1. reestr.uz portalida tashkilot (QarDTU) nomidan ERI bilan kirish | Rektor buyrug‘i bilan tayinlangan mas’ul xodim | Tashkilot kabineti |
| 2. “Axborot tizimini ro‘yxatdan o‘tkazish” arizasini to‘ldirish (2-bo‘limdagi pasport ma’lumotlari asosida) | Mas’ul xodim + HALLAYM texnik guruhi | Ariza raqami |
| 3. Ilovalarni yuklash (3-bo‘lim) | Mas’ul xodim | To‘liq ariza |
| 4. Operator so‘rovlariga javob, kamchiliklarni tuzatish | Texnik guruh | — |
| 5. Reestr yozuvi va xulosani olish, nusxasini https://kstu.uz va LMS “Muvofiqlik” bo‘limiga joylash | Mas’ul xodim | Xulosa raqami |

Talab qilinadigan hujjatlarning aniq ro‘yxati va shakli vaqt o‘tishi bilan o‘zgarishi mumkin — ariza topshirishdan oldin reestr.uz dagi amaldagi yo‘riqnomani tekshiring.

## 2. Axborot tizimi pasporti (arizaga ko‘chiriladi)

| Maydon | Qiymat |
|---|---|
| To‘liq nomi | HALLAYM EDU — masofaviy ta’limni boshqarish tizimi (Learning Management System) |
| Qisqa nomi | HALLAYM EDU LMS |
| Egasi (operatori) | Qarshi davlat texnika universiteti (QarDTU) |
| Ishlab chiquvchi | HALLAYM LLC |
| Manzil (URL) | https://hallaym.kstu.uz |
| Maqsadi | VM 559-son qarori asosida masofaviy ta’limni tashkil etish: o‘quv jarayoni, jonli darslar, videodarslar, bilim nazorati (avtoproktoring bilan), davomat, akademik qaydlar va statistika |
| Foydalanuvchilar toifalari | Superadministrator, administrator, texnik xodim, rektorat, dekanat, kafedra, o‘qituvchi, tyutor, talaba |
| Asosiy funksiyalar | Kurslarni boshqarish; o‘qitishni boshqarish (reja, topshiriq, monitoring); jonli virtual sinf (WebRTC/mediasoup SFU, ekran ulashish, elektron doska, chat, yozib olinadigan dars tarixi); videodarslar; test va imtihonlar; avtoproktoring (kamera, ekran, AI yuz tahlili, rasm-dalil, inson ko‘rigi); elektron kutubxona; SCORM 1.2; davomat; statistika va hisobotlar; ichki xabarlar va forum; inklyuziv ta’lim vositalari |
| Texnologiyalar | Node.js 22, Express 5, MongoDB (GridFS), Socket.IO, mediasoup SFU, Nginx (TLS), PWA |
| Joylashuvi | O‘zbekiston hududidagi universitet serveri (IP manzil arizaning o‘zida ko‘rsatiladi; ochiq repoga yozilmaydi) — ma’lumotlar respublikadan tashqariga chiqmaydi |
| Ishlov beriladigan shaxsiy ma’lumotlar | F.I.Sh., login, rol, guruh/fakultet, telefon/e-pochta (ixtiyoriy), davomat, baholar, proktoring signallari va rasm-dalillari (cheklangan muddat, TTL) |
| Shaxsiy ma’lumotlar bazasi | “Shaxsga doir ma’lumotlar to‘g‘risida”gi Qonun bo‘yicha ma’lumotlar bazasini ro‘yxatga olish alohida amalga oshiriladi |
| Integratsiyalar | Davlat monitoring tizimlari uchun adapter (`monitoring-export.js`) — rasmiy API kelishuvidan keyin yoqiladi; Zoom integratsiyasi (3-band) |
| Axborot xavfsizligi | `docs/KIBERXAVFSIZLIK_EKSPERTIZA_PAKETI.md` ga qarang |
| Ishga tushirilgan sana | ____ (universitet buyrug‘i bo‘yicha) |
| Mas’ul shaxs | F.I.Sh., lavozim, telefon, e-pochta: ____ |

## 3. Ilovalar ro‘yxati

1. Tizimni ishga tushirish to‘g‘risidagi rektor buyrug‘i (nusxa).
2. Ushbu pasport (PDF).
3. Texnik tavsif — `README.md` va `docs/PRODUCT_SPEC_UZ.md` asosida PDF.
4. Arxitektura sxemasi (brauzer → Nginx/TLS → Node.js ilova → MongoDB; brauzer ⇄ mediasoup SFU (UDP 50000–50031); 127.0.0.1 ichki SFU bridge).
5. Server egaligi yoki kamida 5 yillik ijara hujjati (559-son qaror, 8-band).
6. Foydalanuvchi va administrator qo‘llanmalari.
7. Axborot xavfsizligi siyosati va (olingach) Kiberxavfsizlik markazining ijobiy xulosasi — ko‘p hollarda reestr operatori shuni so‘raydi, shuning uchun 13-band ishini parallel boshlang.

## 4. Holat jurnali

| Sana | Hodisa | Raqam / izoh |
|---|---|---|
| | Ariza topshirildi | |
| | Xulosa olindi | |
