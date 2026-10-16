# O‘zbekcha ovozli boshqaruv

Kirgandan keyin **Qulaylik → Ko‘rmaydigan** profilini tanlang. Profil va doimiy tinglash akkauntda hamda qurilmada saqlanadi. Mikrofon uchun brauzerning bir martalik ruxsati kerak; ruxsat rad etilsa vidjetdagi **Mikrofonni boshlash** tugmasini bosing. **Alt+V** ham mikrofonni boshlaydi. Vidjetdagi yozma buyruqlar aynan shu boshqaruvni ishlatadi.

| Maqsad | Buyruqlar |
| --- | --- |
| Sahifalar | «Sahifalar», «Kutubxonani ochib ber», «Jadvalimga o‘t», «Baholarim», «Fanlar», «Mening kitoblarim», «Profilim» |
| Qaytish | «Orqaga qayt», «Oldinga», «Bosh sahifa», «Yop», «Qayerdaman» |
| Tugmalar | «Tugmalarni ayt», «Birinchi tugmani bos», «Ikkinchi kitobni tingla», «Saqlash tugmasini bos» |
| Maydonlar | «Maydonlar», «Ikkinchi maydon», «Ism maydoniga o‘t», «Yoz Ali Valiyev», «Tozala», «Yubor» |
| O‘qish | «Kitobni o‘qi», «Sahifani o‘qi», «To‘xta», «Davom et», «Keyingi», «Oldingi», «Tezroq», «Sekinroq» |
| Boshqa | «Qidir matematika», «Darsga kir», «Pastga», «Tepaga», «Madina ovozi», «Sardor ovozi», «Yordam» |
| Hisob | «Tizimdan chiq», keyin «Ha» yoki «Yo‘q» |

Kitob ovozi eshitilayotganda buyruqni **«Yordamchi, …»** bilan boshlang, masalan «Yordamchi, to‘xta». Bu kitobdagi oddiy gaplarni buyruq deb qabul qilishni kamaytiradi. Qisqa javoblar vaqtida mikrofon vaqtincha to‘xtaydi. Bir nechta bir xil nomli tugma bo‘lsa raqam bilan tanlang. Ro‘yxat ayni oynadagi ko‘rinadigan, faol elementlardan olinadi; yopiq yoki rolga ruxsat berilmagan sahifalar ochilmaydi.

Ichki materiallar uchun «1-mavzuga kir», «HTML haqidagi videoni och», «Web dasturlash fanining 1-mavzusini och», «Shu mavzuning topshirig‘ini och», «2-mavzuning birinchi testini och», «Shu fanning keyingi mavzusini och» deyish mumkin. Yordamchi har buyruqda haqiqiy karta sarlavhasi, tavsifi, fan/modul yo‘li va amallarni qayta tekshiradi. Tavsiya va o‘quv yo‘lida takrorlangan video bitta variant sanaladi. Bir nechta fanda «1-mavzu» bo‘lsa, fan nomini yoki taklif qilingan variant raqamini ayting. Yopiq mavzu ichidagi materialni tanlaganda uning bo‘limi ochiladi; video/test qulfi saqlanadi. «Sahifani tushuntir», «Mavzularni sanab ber» va «HTML mavzusi haqida ma’lumot ber» ko‘rsatilgan mazmunni o‘qiydi.

Bu moslash sahifa konteksti va o‘zbekcha buyruq tahlili orqali qurilmada ishlaydi; tashqi til modeli ulanmagan. Istalgan erkin savolga ChatGPT darajasida javob berish kafolatlanmaydi. Sahifada mavjud bo‘lmagan material uchun amal yaratilmaydi; faqat yuklangan sahifa va uning boshqaruvlari tahlil qilinadi.

Yuborish va chiqish tasdiq talab qiladi. Yordamchi yoqilganida saytning avvalgi tasdiqlash oynalari ham ovoz orqali «Ha/Yo‘q» bilan ishlaydi. Maxfiy parol va OTP maydonlari ovoz bilan to‘ldirilmaydi. Fayl tanlash, brauzer mikrofon/kamera ruxsati va ayrim yangi oyna/fullscreen amallari qurilmaning o‘z boshqaruvi yoki foydalanuvchi bosishini talab qiladi.

Tanish brauzerning `SpeechRecognition` xizmati (`uz-UZ`) orqali ishlaydi; Chrome yoki Edge tavsiya qilinadi. Internet, brauzer xizmati va talaffuz tanish aniqligiga ta’sir qiladi. «Ochvor», «qaytvor», «maning» kabi buyruq variantlari, lotin/kirill va sahifa nomidagi kichik xatolar qo‘llanadi. Bu barcha o‘zbek shevalari uchun o‘qitilgan alohida akustik model emas. Ovoz brauzer tanish xizmatiga uzatilishi mumkin; platforma audio yozuvni saqlamaydi. Javoblarni Madina/Sardor o‘qiydi.

`tests/voice-control.test.js` buyruqlar, inkor, sozlama migratsiyasi, yagona mikrofon sessiyasi, kechikkan hodisalar va chegaralangan qayta ulanishni tekshiradi. Brauzer integratsiyasi nutq hodisalarini sun’iy yuborib tekshirildi; bu haqiqiy sheva audiosi bilan aniqlik o‘lchovi emas.

## Savollar va istalgan joydan topib ochish

Yordamchi buyruqdan tashqari savollarga ham javob beradi va bir necha qadamli ishni o‘zi bajaradi:

- **Dars jadvali:** «Ertangi jadval qanaqa?», «Bugun nechta dars bor?», «Dushanba kuni qanday darslar bor?», «Haftalik jadvalni ayt». Javobda vaqt, fan, o‘qituvchi, xona va dars shakli aytiladi.
- **Jonli dars:** «Hozirgi darsni och» — boshlangan guruh darsiga darhol kiradi. «Joriy dars qaysi?» — nima ketayotganini aytadi va «Darsga kiraymi?» deb so‘raydi.
- **Topshiriqlar:** «Topshiriqlarim qanaqa?», «Ertaga qaysi topshiriqlarni topshirishim kerak?», «Muddati o‘tgan vazifalarim bormi?». Shaxsiy muddat uzaytirilgan bo‘lsa, o‘sha muddat aytiladi.
- **Istalgan joydan topish:** «Amir Temur kitobini och», «Javascript videosini qo‘y», «Oliy matematika fanini och». Narsa joriy sahifada bo‘lmasa, yordamchi uni butun platformadan va «Mening kitoblarim»dan qidiradi. Keyin har bir qadamni aytib, kerakli sahifaga o‘tadi va topilgan joyni sariq ramka bilan belgilaydi.
- **Davom etish yoki boshidan:** kitob yoki videoda saqlangan joy bo‘lsa, «Oldin 42-sahifada to‘xtagansiz. Qolgan joyidan davom ettiraymi yoki boshidan boshlaymi?» deb so‘raydi va javobni kutadi. «Davom et», «boshidan» yoki raqam bilan javob beriladi.
- Bir nechta mos natija bo‘lsa, ularni raqam bilan sanab beradi. «Ikkinchisi» yoki nomini aytish mumkin. «Bekor» deyilsa, savol yopiladi.

Faqat foydalanuvchiga ruxsat etilgan ma’lumot ishlatiladi: qidiruv va jadval server tomonidagi huquqlar bilan cheklangan. Tekshiruv: `tests/voice-knowledge.test.js`.
