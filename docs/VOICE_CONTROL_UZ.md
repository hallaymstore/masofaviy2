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

Yuborish va chiqish tasdiq talab qiladi. Yordamchi yoqilganida saytning avvalgi tasdiqlash oynalari ham ovoz orqali «Ha/Yo‘q» bilan ishlaydi. Maxfiy parol va OTP maydonlari ovoz bilan to‘ldirilmaydi. Fayl tanlash, brauzer mikrofon/kamera ruxsati va ayrim yangi oyna/fullscreen amallari qurilmaning o‘z boshqaruvi yoki foydalanuvchi bosishini talab qiladi.

Tanish brauzerning `SpeechRecognition` xizmati (`uz-UZ`) orqali ishlaydi; Chrome yoki Edge tavsiya qilinadi. Internet, brauzer xizmati va talaffuz tanish aniqligiga ta’sir qiladi. «Ochvor», «qaytvor», «maning» kabi buyruq variantlari, lotin/kirill va sahifa nomidagi kichik xatolar qo‘llanadi. Bu barcha o‘zbek shevalari uchun o‘qitilgan alohida akustik model emas. Ovoz brauzer tanish xizmatiga uzatilishi mumkin; platforma audio yozuvni saqlamaydi. Javoblarni Madina/Sardor o‘qiydi.

`tests/voice-control.test.js` buyruqlar, inkor, sozlama migratsiyasi, yagona mikrofon sessiyasi, kechikkan hodisalar va chegaralangan qayta ulanishni tekshiradi. Brauzer integratsiyasi nutq hodisalarini sun’iy yuborib tekshirildi; bu haqiqiy sheva audiosi bilan aniqlik o‘lchovi emas.
