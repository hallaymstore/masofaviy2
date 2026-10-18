# HALLAYM EDU Android ilovasi (ovozli yordamchi bilan)

Ilova platformani o‘z ichida ochadi va ovozli yordamchiga brauzer bera olmaydigan imkoniyatlarni qo‘shadi.

## Nima uchun ilova kerak

Brauzerdagi ovozli boshqaruvning uchta tabiiy cheklovi bor:
1. Brauzer har gapdan keyin mikrofonni o‘chiradi. Qayta yoqilganda telefon signal chaladi va 1–2 soniya o‘tadi.
2. Brauzer orqa fonda yoki ekran o‘chiq paytda tinglamaydi.
3. Ism aytib uyg‘otish va vidjet brauzerda yo‘q.

Ilova bularning hammasini hal qiladi:
- **Doimiy tinglash.** Ilova ochiq paytda mikrofon o‘zi qayta yonadi, hech narsa bosish kerak emas. Start signali o‘chirilgan.
- **«Madina» deb uyg‘otish.** Ilova yopiq yoki ekran o‘chiq bo‘lsa ham telefon «Madina» so‘zini kutadi. Bu internetsiz, telefonning o‘zida tanib olinadi. So‘z eshitilgach telefon qisqa titraydi, signal chaladi va buyruqni tinglaydi: «kutubxonani och», «hozirgi darsga kir», «ertangi jadval qanaqa». Kerak bo‘lsa, ilova o‘zi ochiladi va qulflangan ekran ustida ham ko‘rinadi.
- **Ilovaga kirish va chiqish:** «Madina» → «ilovani och» yoki «ilovadan chiq». «Madina» → «uxla» desa, tinglash o‘chadi.
- **Vidjet.** Bosh ekranga «HALLAYM ovozli yordamchi» vidjetini qo‘ying. Unda to‘rtta tugma bor: «Madina, tingla», «Kitoblarim», «Darsga kirish», «Bugungi jadval».
- **Bildirishnoma.** Tinglash holati doim ko‘rinib turadi. Unda «Gapirish» va «To‘xtatish» tugmalari bor.
- **Jonli dars.** Darsga kirilganda mikrofon darsga beriladi, darsdan chiqqach yordamchi yana tinglaydi.

Buyruqlarni tushunish, sahifani tahlil qilish, savollarga javob va Madina/Sardor ovozi saytning o‘zida ishlaydi. Shuning uchun saytga qo‘shilgan har bir yangilik ilovada ham darhol ishlaydi, ilovani qayta o‘rnatish shart emas.

## Sheva va talaffuz

- **Buyruq tanish.** Standart holatda Google nutq xizmati ishlatiladi: u o‘zbek tilini va turli talaffuzlarni eng yaxshi taniydi, lekin internet talab qiladi. Sozlamalarda **oflayn rejim** (Vosk) tanlansa, internetsiz va signalsiz ishlaydi, ammo aniqligi pastroq.
- **Platforma tomonida qo‘shimcha moslash.** Eshitilgan matn sheva qatlamidan o‘tadi: «kamra/kamera», «mikrafon/mikrofon», «kutupxona/kutubxona», «ochvor/ochchi/ochaqol/och», «kirvor/kir», «jo‘q/yo‘q», «tuxtat/to‘xtat», «o‘qib ber/o‘qi». So‘z biroz boshqacha eshitilsa ham (q/k, x/h, o/a, ikki harf) eng yaqin buyruq tanlanadi. Tasdiqlash, yuborish va tizimdan chiqish taxminan eshitilgan so‘z bilan hech qachon bajarilmaydi.
- **Javoblar qisqa.** Yordamchi «… deng» kabi izohlarni aytmaydi, faqat natijani aytadi.

## O‘rnatish (talaba telefoni)

1. `HALLAYM-EDU.apk` faylini telefonga yuboring (Telegram yoki havola) va oching. «Noma’lum manbalardan o‘rnatish»ga bir marta ruxsat bering.
2. Ilovani oching. Mikrofon va bildirishnoma ruxsatini bering.
3. Yordamchi panelidagi **⚙ Ilova sozlamalari** bo‘limida:
   - «O‘zbekcha oflayn ovoz modelini yuklash» (≈50 MB, bir marta, Wi-Fi tavsiya etiladi). «Madina» so‘zi shu model bilan eshitiladi.
   - «Ustidan ochishga ruxsat». Shu ruxsat bilan «Madina» deyilganda ilova o‘zi ochiladi.
   - «Batareya tejash cheklovini o‘chirish». Shunda Xiaomi, Samsung va boshqa telefonlar tinglashni o‘zi to‘xtatib qo‘ymaydi.
4. Bosh ekranga vidjet qo‘shing: ekranni bosib turing → Vidjetlar → HALLAYM EDU.

Ko‘zi ojiz talabaga bu sozlamalarni birinchi marta yaqinlari yoki tyutor qilib beradi. Keyin hammasi ovoz bilan boshqariladi.

## Halol cheklovlar

- **Batareya.** Orqa fonda tinglash batareyani sezilarli sarflaydi (taxminan 3–6% soatiga, telefonga qarab). Kerak bo‘lmaganda bildirishnomadagi «To‘xtatish» bosiladi yoki «Madina, uxla» deyiladi.
- **Telefon qayta yonganda** Android 14 va undan yangi versiyalar mikrofon xizmatini o‘zi yoqishga ruxsat bermaydi: bitta bildirishnomani bosish kerak bo‘ladi.
- **Uyg‘otuvchi so‘z** shovqinli joyda yoki uzoqdan aytilganda o‘tkazib yuborilishi, juda kamdan-kam hollarda o‘xshash so‘zdan uyg‘onishi mumkin. Sozlamalarda boshqa so‘z tanlash mumkin (masalan, «yordamchi»).
- **iPhone uchun** bu ilova ishlamaydi. iOS orqa fonda uyg‘otuvchi so‘zni faqat Siri’ga beradi. iPhone’da sayt va Siri qisqa buyruqlari ishlatiladi.
- **Sheva aniqligi** nutq xizmatiga bog‘liq. Hech bir xizmat barcha shevalarni mukammal tanimaydi, lekin platforma tomonidagi moslash ko‘p farqlarni yopadi.

## Yig‘ish (dasturchi uchun)

```bash
cd android
./gradlew assembleRelease
```

Imzolash uchun `android/keystore.properties` kerak (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`). U Git’ga qo‘shilmaydi. Fayl bo‘lmasa, debug kaliti bilan imzolanadi: sinov uchun yetadi, lekin keyingi yangilanishlar ham xuddi shu kalit bilan imzolanishi kerak. Windows’da foydalanuvchi papkasi nomida bo‘sh joy bo‘lsa, Gradle uchun `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/gtmp -Djava.io.tmpdir=C:/gtmp` o‘rnatiladi.
