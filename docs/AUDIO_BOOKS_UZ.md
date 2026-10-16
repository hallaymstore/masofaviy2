# O‘zbekcha audio kitob va kutubxonachi paneli

## Foydalanish

- **Mening kitoblarim** har bir akkauntning shaxsiy javoni. PDF yoki UTF-8 TXT yuklang va Tinglash tugmasini bosing. Madina/Sardor, tezlik va kitob tilini tanlash mumkin. Sahifa va parcha bo‘yicha o‘tish, to‘xtatish, qayta ochib davom ettirish mavjud.
- **Oila uchun yuklash havolasi** talaba tomonidan yaratiladi: 7 kun, 20 ta kitob. Yangi havola eskisini almashtiradi, Bekor qilish darhol o‘chiradi. Yaqinlari talabaning parolini bilmasdan faqat yangi kitob qo‘shadi; mavjud kitoblarni o‘qish yoki o‘chirish huquqi yo‘q.
- **Kutubxonachi paneli** yangi `librarian` roliga, administratorlarga yoki `library.manage` huquqi berilgan akkauntga ochiladi. Administrator akkaunt yaratish/tahrirlash oynasida Kutubxonachi rolini tanlaydi. Panelga menyudan yoki Elektron kutubxona sahifasidan kiriladi.
- Panelda qurilmadan PDF yuklash, nom, mualliflar, nashr yili, tur, til, ISBN, DOI, teglar va tavsif kiritish; metama’lumotni tahrirlash, arxivlash va qayta nashr qilish bor. Nashr qilingan PDF umumiy kutubxonada ochiladi va ovozda o‘qiladi. Arxivlangan PDF oddiy foydalanuvchiga berilmaydi.
- **Qulaylik → O‘zbekcha ovoz** yordamchi, sahifani o‘qish va kitob uchun bir xil Madina/Sardor tanlovini ishlatadi. Ovozli buyruq: Alt+V. `Kitoblarim`, `Kitobni o‘qi`, `To‘xta`, `Davom et`, `Keyingi`, `Sekinroq` kabi buyruqlar bor. Mikrofon va brauzerning Uzbek SpeechRecognition qo‘llovi zarur; klaviatura va tugmalar mustaqil ishlaydi.

## PDF va saqlash

PDF.js paketdan shu server orqali tarqatiladi. Birinchi kerakli sahifa tayyorlanadi; barcha sahifalar ajratilishini kutish shart emas. Rasm ko‘rinishidagi sahifalar Tesseract bilan foydalanuvchining brauzerida OCR qilinadi. O‘zbek lotin/kirill, rus va ingliz til fayllari birinchi ishlatishda internetdan olinadi. Sifat skan aniqligiga bog‘liq. Parolli PDF uchun parolsiz nusxa kerak.

Har bir kitob 60 MB gacha. Fayl sarlavhasi tekshiriladi. Shaxsiy fayllar MongoDB `personal_books` GridFS bucketida, umumiy katalog PDFlari `library_books` bucketida turadi. Ushbu bucketlarni odatdagi MongoDB zaxirasiga qo‘shish kerak. HTML kabi bajariladigan fayllar yuklanmaydi. Tashqi manbani ovozda o‘qish o‘sha serverning CORS ruxsatiga bog‘liq; PDFni qurilmadan yuklash bu cheklovni chetlab o‘tishga hojat qoldirmaydi.

## Ovoz xizmati

Node.js **22.13+**, `npm ci`, `npm run check`, `npm test`, `npm run build:media-client`, keyin odatdagi server ishga tushiriladi.

`TTS_PROVIDER` bo‘sh bo‘lsa, `AZURE_SPEECH_KEY` va `AZURE_SPEECH_REGION` mavjudligida rasmiy Azure Speech REST API tanlanadi; boshqa holatda Edge Read Aloud ishlatiladi. `TTS_PROVIDER=edge|azure|browser` bilan tanlov aniq belgilanadi. Edge integratsiyasi `@andresaya/edge-tts` orqali Microsoft iste’molchi xizmatiga ulanadi; u rasmiy Azure API kafolatiga ega emas. Ishlab chiqarishda rasmiy xizmat kerak bo‘lsa, Azure kaliti va regionini sozlang.

Madina (`uz-UZ-MadinaNeural`) va Sardor (`uz-UZ-SardorNeural`) o‘zbek adabiy talaffuzidagi neyron ovozlar. Alohida hududiy sheva modeli kiritilmagan. Kirill o‘zbek matni lotinga o‘giriladi. Rus/ingliz gaplari uchun o‘z tilidagi ovoz tanlanadi. Internet uzilganda faqat aynan shu tildagi brauzer ovozi ishlatiladi; o‘zbekcha matn rus/ingliz ovoziga yashirin almashtirilmaydi.

Server ovozi ishlaganda matn bo‘laklari Microsoft xizmatiga yuboriladi. Autentifikatsiya, CSRF, 420 belgilik bo‘lak, parallel so‘rov chegarasi, har bir foydalanuvchi uchun jarayon doirasidagi kunlik belgi limiti va alohida audio kesh mavjud. `TTS_DAILY_CHARS`, `TTS_CACHE_MB`, `TTS_CACHE_DIR` `.env.example`da. Bir nechta app jarayoni ishlatilsa, kunlik limit har bir jarayonda alohida hisoblanadi. `data/tts-cache` ochiq web katalog emas va Gitga kiritilmaydi.

## Tekshirish

`tests/audio-books.test.js`, `tests/speech.test.js`, `tests/library-upload.test.js` til/chunking, SSML, haqiqiy Express multipart marshrutlari, GridFS interfeysi, boshqa talaba fayliga kirishni taqiqlash, oila tokeni rotatsiya/limit/bekor qilish, TTS limit/kesh/bekor qilish va kutubxonachi huquqlarini tekshiradi. Bu avtomatik testlarda ma’lumotlar bazasi va ovoz provayderi almashtiriladi; brauzer va haqiqiy provayder sinovi alohida bajariladi.
