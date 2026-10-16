# Inklyuziv ta’lim moduli

Imkoniyati cheklangan talabalar masofaviy ta’limda boshqalar qatori erkin o‘qishi uchun qo‘shilgan imkoniyatlar.

## 1. Kim nima qiladi

| Rol | Qayerda | Nima qiladi |
|---|---|---|
| Registrator / dekanat / admin | Foydalanuvchilar → Akkaunt yaratish yoki tahrirlash | Talabani ro‘yxatga olishda «♿ Inklyuziv ta’lim» bo‘limida ehtiyojini belgilaydi. Talabaning (vasiysining) yozma roziligi belgisi majburiy. |
| Dekan, kafedra mudiri, tyutor, admin | Universitet → Inklyuziv ta’lim | O‘z doirasidagi talabalar ro‘yxati, talaba so‘rovlarini tasdiqlash yoki rad etish, imtihondagi qo‘shimcha vaqtni belgilash |
| O‘qituvchi | Universitet → Inklyuziv ta’lim | O‘z guruhlaridagi tasdiqlangan talabalar va har bir ehtiyoj uchun dars o‘tish tavsiyalari (xodim izohlari ko‘rinmaydi) |
| Talaba | Akkaunt → Qulaylik (inklyuziv) | Barcha qulaylik sozlamalari; «Imkoniyatim cheklangan» so‘rovini yuborish |

Ehtiyoj turlari: ko‘zi ojiz, zaif ko‘ruvchi, eshitishda nuqson, harakatlanishda nuqson, nutqida nuqson, o‘qish yoki diqqat qiyinchiligi, surunkali kasallik.
Tizimga tashxis yozilmaydi, faqat ehtiyoj turi saqlanadi. Har bir o‘zgarish audit jurnaliga tushadi.

Talaba tasdiqlangach:
- unga mos sozlamalar o‘zi yoqiladi (masalan, ko‘zi ojizga ovozli yordamchi, zaif ko‘ruvchiga 150% shrift va yuqori kontrast);
- **imtihon va testlarda qo‘shimcha vaqt** avtomatik qo‘shiladi: mavzu testlari va masofaviy testlarda. Standart bo‘yicha ko‘zi ojiz va harakatda nuqsonli talabaga +50%, boshqalarga +25%. Xodim buni 0–100% oralig‘ida o‘zgartira oladi. «Tasdiq kutilmoqda» holatida qo‘shimcha vaqt berilmaydi.

## 2. Ko‘zi ojiz va zaif ko‘ruvchilar uchun

- **Ovozli yordamchi.** Pastki chap burchakdagi 🎙 tugma yoki `Alt+V`. O‘zbekcha (lotin yoki kirill) va ruscha buyruqlar: «bosh sahifa», «jadval», «kutubxona», «baholar», «xabarlar», «darsga kir», «o‘qi», «kitobni o‘qi», «to‘xta», «davom et», «keyingi», «tezroq», «kattaroq», «kontrast», «soat necha», «bildirishnomalar», «qidir oliy matematika», «yordam», «tizimdan chiq».
- **Qo‘llarsiz rejim.** Ilova ochiq paytda yordamchi doim tinglaydi.
- **Ovozli kirish.** Kirish sahifasida «🔊 Ovozli yordamchi bilan kirish» tugmasi bor. Login harflab aytiladi va qaytarib o‘qib beriladi. Parol esa xavfsizlik uchun klaviaturada yoziladi; talaba xohlasa, uni ovoz bilan aytish ham mumkin. Ikki bosqichli kod ovoz bilan aytiladi. Yordamchi bir marta yoqilgan qurilmada, shuningdek «Ovozli yordamchi» yorlig‘idan ochilganda, ekran to‘liq «Boshlash uchun istalgan joyni bosing» tugmasiga aylanadi.
- **Audio kitob.** Kutubxonada kitobni ochib, «🔊 Audio tinglash» tugmasini bosing yoki «kitobni o‘qi» deng. Matnli PDF, TXT va HTML gapma-gap o‘qiladi. Joriy gap ekranda sariq rangda ko‘rinadi. Sahifa tanlash, tezlik va klaviatura boshqaruvi bor, to‘xtagan joy eslab qolinadi.
- **Sahifani o‘qish.** «o‘qi» buyrug‘i yoki `Alt+R` joriy sahifani yoki belgilangan matnni o‘qiydi.
- **Tanlangan elementni ovozda aytish.** Tab bilan yurganda har bir tugma va maydon ovozda aytiladi. TalkBack, VoiceOver yoki NVDA ishlatilsa, bu sozlamani o‘chirish kerak, aks holda matn ikki marta eshitiladi.
- Yuqori kontrast, shriftni 200% gacha kattalashtirish, katta tugmalar va aniq fokus chizig‘i bor.

## 3. Boshqa ehtiyojlar uchun

- **Eshitishda nuqson.** Jonli darsda subtitr va ovozli signallar o‘rniga ekran chaqnashi.
- **Nutqida nuqson.** Jonli darsda chat orqali qatnashish.
- **Harakatda nuqson.** Katta tugmalar, to‘liq klaviatura va ovoz bilan boshqarish.
- **Disleksiya yoki diqqat qiyinchiligi.** Kengroq harf va qator oralig‘i, soddalashtirilgan ko‘rinish, animatsiyasiz rejim, matnni tinglash.

## 4. Bildirishnomalar va ilova (PWA)

- Dars boshlanganda va yangi xabar kelganda telefon yoki kompyuterga **push-bildirishnoma** keladi. Ilova yopiq bo‘lsa ham ishlaydi. Ilova ochiq bo‘lsa, xabar ovozda o‘qiladi.
- Yoqish tartibi: Qulaylik → «Bildirishnomalarni yoqish». iPhone’da avval Safari’da «Ulashish → Bosh ekranga qo‘shish» qilish kerak (iOS 16.4+).
- O‘rnatilgan ilova belgisini bosib turganda **tezkor yorliqlar** chiqadi: «Ovozli yordamchi», «Bugungi darslar», «Audio kutubxona», «Qulaylik sozlamalari».
- VAPID kalitlari birinchi ishga tushishda o‘zi yaratilib, bazada saqlanadi. Xohlasangiz, ularni `.env` da `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` va `VAPID_SUBJECT` (`mailto:` yoki `https://` manzil) orqali berishingiz mumkin.
- Server push xizmatlariga (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`) HTTPS orqali chiqa olishi kerak.

## 5. Halol cheklovlar

1. **O‘zbekcha ovoz qurilmaga bog‘liq.** Platforma brauzerning o‘z ovozlaridan foydalanadi. Microsoft Edge’da sifatli o‘zbekcha ovozlar bor («Microsoft Sardor/Madina Online»). Ko‘p Android telefonlarida va Chrome’da o‘zbekcha ovoz yo‘q. U holda matn turkcha yoki ruscha ovozda o‘qiladi va talaffuz buziladi. «Qulaylik» sahifasi bu holatni ochiq ko‘rsatadi. To‘liq yechim server tomonidagi o‘zbekcha TTS’dir (keyingi bosqich, 6-bo‘limga qarang).
2. **Ovozli buyruq** Chrome, Edge va Samsung Internet’da ishlaydi. Firefox’da ishlamaydi. iPhone Safari’da o‘zbek tili qo‘llanmaydi, u yerda ruscha buyruqlar ishlatiladi. Ovozni aniqlash brauzer xizmati orqali bo‘ladi, shuning uchun internet kerak.
3. **Brauzer ovozni faqat bosish yoki tugmadan keyin chiqaradi.** Shu sababli ovozli rejim «istalgan joyni bosing» ekranidan boshlanadi. Ko‘zi ojiz foydalanuvchi uchun bu bitta bosish yoki tugma.
4. **Skanerlangan PDF o‘qilmaydi.** Ichida matn qatlami yo‘q. Kutubxona bunday kitobni avval OCR qilishi kerak. Tashqi saytdagi kitoblarni ham platforma ovozda o‘qiy olmaydi: faylni kutubxonaga yuklash kerak.
5. **Push iPhone’da** faqat ilova bosh ekranga o‘rnatilganda ishlaydi. Ilova yopiq paytda kelgan bildirishnomani telefonning ekran o‘quvchisi (VoiceOver yoki TalkBack) o‘qiydi, platformaning o‘zi emas.
6. «Gadjet» (vidjet) sifatida Android va Windows’da ilova yorliqlari ishlaydi. Bosh ekrandagi jonli vidjet PWA uchun hozircha faqat Windows 11 Edge’da tajriba holatida, shuning uchun qo‘shilmadi.

## 6. Keyingi bosqich uchun tavsiyalar

- Server tomonidagi o‘zbekcha nutq sintezi (masalan, Meta MMS-TTS `uzb` ochiq modeli universitet serverida, yoki pullik Azure `uz-UZ-MadinaNeural`). Bu barcha qurilmada bir xil sifat beradi va kitobni MP3 qilib yuklab olish imkonini ochadi.
- Kutubxona uchun OCR (Tesseract `uzb`, `uzb_cyrl`): skanerlangan kitoblarni matnli qilish.
- Videodarslarga subtitr va imo-ishora tili tarjimoni oynasi.
- Imtihonlarda ekran o‘quvchi bilan proktoring qoidalarini moslashtirish (to‘liq ekran talabi va boshqalar).
