// Typical structure of an Uzbek higher-education institution, used by «Namunaviy tuzilmani yaratish».
// Every unit gets working online services (forms) so it can start receiving requests on day one.
// Faculties and kafedras are not listed here: they are synced from the academic structure (Structure).
const sel=(label,options,required=true)=>({label,type:'select',options,required});
const txt=(label,required=true)=>({label,type:'text',required});
const area=(label,required=true)=>({label,type:'textarea',required});
const date=(label,required=true)=>({label,type:'date',required});
const num=(label,required=true)=>({label,type:'number',required});
const phone=(label='Telefon raqami',required=true)=>({label,type:'phone',required});

export const UNIT_PRESETS=[
  {code:'REK',kind:'leadership',name:'Rektorat',description:'Universitet rahbariyati: rektor va prorektorlar.',services:[
    {title:'Rektor qabuliga yozilish',audience:'all',slaDays:5,fields:[area('Murojaat mazmuni'),phone()]}
  ]},
  {code:'PRO',kind:'leadership',parent:'REK',name:'O‘quv ishlari bo‘yicha prorektor',description:'O‘quv jarayoni, jadval va sifat nazorati.'},
  {code:'PRI',kind:'leadership',parent:'REK',name:'Ilmiy ishlar va innovatsiyalar bo‘yicha prorektor',description:'Ilmiy faoliyat, doktorantura va innovatsion loyihalar.'},
  {code:'PRY',kind:'leadership',parent:'REK',name:'Yoshlar masalalari va ma’naviy-ma’rifiy ishlar bo‘yicha prorektor',description:'Yoshlar siyosati, ma’naviyat va talabalar hayoti.'},
  {code:'PRM',kind:'leadership',parent:'REK',name:'Moliya-iqtisod ishlari bo‘yicha prorektor',description:'Moliya, kontrakt va xo‘jalik faoliyati.'},
  {code:'PRX',kind:'leadership',parent:'REK',name:'Xalqaro hamkorlik bo‘yicha prorektor',description:'Xalqaro aloqalar, qo‘shma dasturlar va almashinuv.'},

  {code:'OUB',kind:'division',parent:'PRO',name:'O‘quv-uslubiy boshqarma',description:'O‘quv rejalar, dars jadvali, o‘quv yuklama va uslubiy ta’minot.',services:[
    {title:'Dars jadvaliga o‘zgartirish so‘rovi',audience:'staff',slaDays:3,fields:[txt('Fan va guruh'),txt('Hozirgi vaqt'),txt('Taklif etilayotgan vaqt'),area('Sabab')]},
    {title:'O‘quv yuklama bo‘yicha murojaat',audience:'staff',slaDays:5,fields:[txt('O‘quv yili va semestr'),area('Murojaat mazmuni')]}
  ]},
  {code:'REG',kind:'division',parent:'PRO',name:'Registrator ofisi',description:'Talabalar shaxsiy ishi, ma’lumotnomalar, transkriptlar, qayta topshirish va ko‘chirish.',services:[
    {title:'O‘qish joyidan ma’lumotnoma',audience:'students',slaDays:2,fields:[sel('Qayerga taqdim etiladi',['Harbiy komissariat','Bank','Ijtimoiy himoya bo‘limi','Pensiya jamg‘armasi','Elchixona / viza','Boshqa']),num('Nusxalar soni'),area('Qo‘shimcha izoh',false)]},
    {title:'Akademik ma’lumotnoma (transkript)',audience:'students',slaDays:5,fields:[sel('Til',['O‘zbek','Rus','Ingliz']),sel('Maqsad',['Ko‘chirish','Chet elda o‘qish','Ishga joylashish','Boshqa']),area('Izoh',false)]},
    {title:'Akademik qarzdorlikni qayta topshirish',audience:'students',slaDays:5,fields:[txt('Fan nomi'),txt('Semestr'),sel('Nazorat turi',['Oraliq nazorat','Yakuniy nazorat','Kurs ishi','Amaliyot']),area('Izoh',false)]},
    {title:'Akademik ta’til',audience:'students',slaDays:10,fields:[sel('Sabab',['Sog‘lig‘i bo‘yicha','Oilaviy sharoit','Harbiy xizmat','Homiladorlik va tug‘ish','Boshqa']),date('Boshlanish sanasi'),area('Asoslovchi izoh')]},
    {title:'O‘qishni ko‘chirish yoki tiklash',audience:'all',slaDays:10,fields:[sel('Ariza turi',['Boshqa OTMdan ko‘chirish','Boshqa OTMga ko‘chirish','Yo‘nalishni o‘zgartirish','O‘qishni tiklash']),txt('Yo‘nalish va kurs'),area('Izoh',false)]}
  ]},
  {code:'TSN',kind:'division',parent:'PRO',name:'Ta’lim sifatini nazorat qilish bo‘limi',description:'Ichki audit, so‘rovnomalar va ta’lim sifati monitoringi.',services:[
    {title:'Ta’lim sifati bo‘yicha taklif yoki shikoyat',audience:'all',slaDays:7,fields:[sel('Turi',['Taklif','Shikoyat','Minnatdorchilik']),txt('Fan, o‘qituvchi yoki bo‘lim',false),area('Mazmuni')]}
  ]},
  {code:'MTM',kind:'center',parent:'PRO',name:'Masofaviy ta’lim markazi',description:'Masofaviy ta’lim platformasi, jonli darslar, videodarslar va elektron kurslar.',modules:['announcements','services','documents','tasks','events','apps','staff','learning'],services:[
    {title:'Platformaga kira olmayapman',audience:'all',slaDays:1,fields:[txt('Login'),sel('Muammo',['Parol esdan chiqdi','Akkaunt bloklangan','Guruh yoki fan noto‘g‘ri','Boshqa']),phone()]},
    {title:'Jonli darsda texnik muammo',audience:'all',slaDays:1,fields:[sel('Muammo',['Ovoz eshitilmaydi','Video ko‘rinmaydi','Aks-sado yoki chiyillash','Darsdan chiqarib yuboradi','Ekran ulashish ishlamaydi','Boshqa']),txt('Fan va sana'),sel('Qurilma',['Telefon (Android)','Telefon (iPhone)','Noutbuk / kompyuter','Planshet']),area('Tafsilot',false)]},
    {title:'Dars yozuvi yoki materialni joylash so‘rovi',audience:'staff',slaDays:3,fields:[txt('Fan va guruh'),area('Nima joylanishi kerak')]}
  ]},
  {code:'SKB',kind:'division',parent:'PRO',name:'Sirtqi va kechki ta’lim bo‘limi',description:'Sirtqi va kechki ta’lim shaklidagi talabalar bilan ishlash.',services:[
    {title:'Sessiya chaqiruv ma’lumotnomasi',audience:'students',slaDays:2,fields:[txt('Ish joyi'),txt('Sessiya muddati')]}
  ]},
  {code:'MAG',kind:'division',parent:'PRI',name:'Magistratura bo‘limi',description:'Magistratura talabalari, dissertatsiya mavzulari va ilmiy rahbarlar.',services:[
    {title:'Magistrlik dissertatsiyasi mavzusini tasdiqlash',audience:'students',slaDays:10,fields:[txt('Mavzu'),txt('Ilmiy rahbar'),area('Qisqacha asoslash')]}
  ]},
  {code:'ILM',kind:'division',parent:'PRI',name:'Ilmiy-tadqiqotlar va innovatsiyalar bo‘limi',description:'Ilmiy maqolalar, loyihalar, patentlar, ilmiy kengash va doktorantura.',services:[
    {title:'Ilmiy maqolani ro‘yxatga olish',audience:'staff',slaDays:5,fields:[txt('Maqola nomi'),txt('Jurnal yoki konferensiya'),sel('Baza',['Scopus','Web of Science','OAK ro‘yxati','Xalqaro konferensiya','Respublika konferensiyasi','Boshqa']),num('Nashr yili'),txt('Havola yoki DOI',false)]},
    {title:'Ilmiy loyiha yoki grant taklifi',audience:'staff',slaDays:15,fields:[txt('Loyiha nomi'),txt('Grant dasturi'),area('Qisqacha mazmuni')]},
    {title:'Patent yoki dasturiy guvohnoma',audience:'staff',slaDays:10,fields:[txt('Ishlanma nomi'),sel('Turi',['Ixtiro patenti','Foydali model','EHM dasturi guvohnomasi','Ma’lumotlar bazasi']),area('Tavsif')]}
  ]},
  {code:'XAL',kind:'division',parent:'PRX',name:'Xalqaro hamkorlik bo‘limi',description:'Hamkor universitetlar, akademik almashinuv, xorijiy talabalar va qo‘shma dasturlar.',services:[
    {title:'Akademik almashinuv dasturiga ariza',audience:'all',slaDays:10,fields:[txt('Dastur (Erasmus+, hamkor OTM va h.k.)'),sel('Til darajasi',['A2','B1','B2','C1','C2','Sertifikat yo‘q']),area('Motivatsiya')]},
    {title:'Xorijiy safar uchun taklifnoma',audience:'staff',slaDays:7,fields:[txt('Mamlakat va tashkilot'),date('Safar sanasi'),area('Maqsad')]}
  ]},
  {code:'YOSH',kind:'division',parent:'PRY',name:'Yoshlar bilan ishlash, ma’naviyat va ma’rifat bo‘limi',description:'Tadbirlar, to‘garaklar, talabalar tashabbuslari va ma’naviy-ma’rifiy ishlar.',services:[
    {title:'To‘garak yoki klubga yozilish',audience:'students',slaDays:3,fields:[sel('Yo‘nalish',['Sport','Ijodiy','Intellektual (zakovat, debat)','Volontyorlik','IT va robototexnika','Til klublari']),phone()]},
    {title:'Tadbir yoki tashabbus taklifi',audience:'all',slaDays:7,fields:[txt('Tadbir nomi'),date('Taklif etilgan sana',false),area('Mazmuni')]},
    {title:'Ijtimoiy yordam so‘rovi',audience:'students',slaDays:7,fields:[sel('Holat',['Kam ta’minlangan oila','Nogironligi bor','Chin yetim','Ayollar daftari','Yoshlar daftari','Boshqa']),area('Izoh')]}
  ]},
  {code:'MKT',kind:'division',parent:'PRO',name:'Marketing va talabalar amaliyoti bo‘limi',description:'Amaliyot joylari, ish beruvchilar bilan hamkorlik va bitiruvchilar bandligi.',services:[
    {title:'Amaliyot joyi bo‘yicha ariza',audience:'students',slaDays:5,fields:[sel('Amaliyot turi',['O‘quv','Ishlab chiqarish','Bitiruv oldi']),txt('Istalgan tashkilot',false),area('Izoh',false)]},
    {title:'Bitiruvchi bandligi haqida ma’lumot',audience:'students',slaDays:5,fields:[txt('Ish joyi'),txt('Lavozim'),date('Ishga kirgan sana')]}
  ]},
  {code:'KAD',kind:'division',parent:'REK',name:'Kadrlar bo‘limi',description:'Xodimlar shaxsiy ishi, buyruqlar, ta’tillar va attestatsiya.',services:[
    {title:'Ish joyidan ma’lumotnoma',audience:'staff',slaDays:2,fields:[sel('Qayerga',['Bank','Davlat xizmatlari markazi','Elchixona / viza','Boshqa']),num('Nusxalar soni')]},
    {title:'Mehnat ta’tili arizasi',audience:'staff',slaDays:5,fields:[date('Boshlanish sanasi'),num('Kunlar soni'),area('Izoh',false)]},
    {title:'Xizmat safari',audience:'staff',slaDays:3,fields:[txt('Manzil'),date('Ketish sanasi'),date('Qaytish sanasi'),area('Maqsad')]}
  ]},
  {code:'DEV',kind:'division',parent:'REK',name:'Devonxona (hujjatlar bilan ishlash)',description:'Kiruvchi va chiquvchi xatlar, murojaatlarni ro‘yxatga olish.',services:[
    {title:'Rasmiy murojaat (xat)',audience:'all',slaDays:15,fields:[txt('Mavzu'),area('Murojaat matni'),phone('Aloqa uchun telefon',false)]}
  ]},
  {code:'YUR',kind:'division',parent:'REK',name:'Yuridik xizmat',description:'Shartnomalar, huquqiy ekspertiza va maslahatlar.',services:[
    {title:'Shartnomani huquqiy ekspertizadan o‘tkazish',audience:'staff',slaDays:5,fields:[txt('Shartnoma tarafi'),area('Shartnoma mazmuni')]}
  ]},
  {code:'BUX',kind:'division',parent:'PRM',name:'Buxgalteriya',description:'Kontrakt to‘lovlari, stipendiya, ish haqi va hisob-kitoblar.',services:[
    {title:'Kontrakt to‘lovini tasdiqlash',audience:'students',slaDays:3,fields:[date('To‘lov sanasi'),num('Summa (so‘m)'),txt('To‘lov hujjati raqami'),area('Izoh',false)]},
    {title:'Kontrakt bo‘yicha qarzdorlik ma’lumotnomasi',audience:'students',slaDays:2,fields:[txt('O‘quv yili')]},
    {title:'Ish haqi ma’lumotnomasi',audience:'staff',slaDays:3,fields:[txt('Davr (oylar)'),sel('Qayerga',['Bank','Soliq','Boshqa'])]}
  ]},
  {code:'RMB',kind:'division',parent:'PRM',name:'Rejalashtirish-moliya bo‘limi',description:'Smeta, xarajatlar rejasi va moliyaviy hisobotlar.',services:[
    {title:'Xarid yoki xarajat so‘rovi',audience:'staff',slaDays:10,fields:[txt('Nima kerak'),num('Taxminiy summa (so‘m)'),area('Asoslash')]}
  ]},
  {code:'XOJ',kind:'division',parent:'PRM',name:'Xo‘jalik bo‘limi',description:'Binolar, auditoriyalar, ta’mirlash, inventar va ta’minot.',services:[
    {title:'Ta’mirlash so‘rovi',audience:'all',slaDays:3,fields:[txt('Bino'),txt('Xona / auditoriya'),sel('Turi',['Elektr','Santexnika','Isitish','Mebel','Eshik/deraza','Boshqa']),area('Nosozlik tavsifi')]},
    {title:'Auditoriya yoki zal band qilish',audience:'staff',slaDays:2,fields:[txt('Auditoriya yoki zal'),date('Sana'),txt('Vaqt'),txt('Tadbir'),num('Ishtirokchilar soni',false)]}
  ]},
  {code:'ATM',kind:'center',parent:'PRO',name:'Axborot texnologiyalari markazi',description:'Tarmoq, kompyuterlar, akkauntlar, elektron pochta va axborot xavfsizligi.',services:[
    {title:'Texnik muammo',audience:'all',slaDays:2,fields:[sel('Turi',['Login / parol','Kompyuter yoki printer','Internet / Wi-Fi','Elektron pochta','Proyektor / ekran','Boshqa']),txt('Bino va xona'),area('Tavsif')]},
    {title:'Yangi akkaunt yoki elektron pochta',audience:'staff',slaDays:3,fields:[txt('Xodim F.I.Sh.'),txt('Bo‘lim'),sel('Kerak',['Platforma akkaunti','Korporativ pochta','Ikkalasi'])]}
  ]},
  {code:'ARM',kind:'center',parent:'PRO',name:'Axborot-resurs markazi',description:'Kutubxona fondi, elektron resurslar va ilmiy bazalarga kirish.',services:[
    {title:'Kitob yoki resurs buyurtma qilish',audience:'all',slaDays:3,fields:[txt('Kitob nomi va muallif'),sel('Shakli',['Bosma','Elektron','Ikkalasi'])]}
  ]},
  {code:'QAB',kind:'center',parent:'PRO',name:'Qabul komissiyasi',description:'Abituriyentlar, magistratura qabuli va o‘qishni ko‘chirish bo‘yicha maslahat.',services:[
    {title:'Qabul bo‘yicha savol',audience:'all',slaDays:2,fields:[sel('Yo‘nalish',['Bakalavriat','Magistratura','Ikkinchi oliy','Ko‘chirish']),area('Savol'),phone()]}
  ]},
  {code:'TTJ',kind:'service',parent:'PRY',name:'Talabalar turar joyi (TTJ)',description:'Yotoqxonaga joylashish, xonalar va maishiy masalalar.',services:[
    {title:'Yotoqxonadan joy so‘rash',audience:'students',slaDays:7,fields:[txt('Doimiy yashash viloyati va tumani'),sel('Imtiyoz',['Yo‘q','Chin yetim','Nogironligi bor','Kam ta’minlangan oila','Boshqa']),phone()]},
    {title:'Xonadagi nosozlik',audience:'students',slaDays:2,fields:[txt('Bino va xona raqami'),sel('Turi',['Elektr','Suv / santexnika','Isitish','Mebel','Eshik / qulf','Boshqa']),area('Tavsif')]},
    {title:'Boshqa xonaga ko‘chish',audience:'students',slaDays:5,fields:[txt('Hozirgi xona'),area('Sabab')]}
  ]},
  {code:'PSI',kind:'service',parent:'PRY',name:'Psixologik xizmat',description:'Talaba va xodimlar uchun maxfiy psixologik maslahat.',services:[
    {title:'Psixolog maslahatiga yozilish',audience:'all',slaDays:3,fields:[sel('Qulay vaqt',['Ertalab (9–12)','Tushdan keyin (13–17)','Onlayn']),phone('Aloqa uchun telefon',false),area('Qisqacha (ixtiyoriy)',false)]}
  ]},
  {code:'TIB',kind:'service',parent:'PRY',name:'Tibbiyot punkti',description:'Birlamchi tibbiy yordam va tibbiy ko‘riklar.',services:[
    {title:'Tibbiy ko‘rik uchun navbat',audience:'all',slaDays:3,fields:[sel('Maqsad',['Yotoqxona uchun','Sport seksiyasi uchun','Amaliyot uchun','Boshqa']),date('Qulay sana',false)]}
  ]},
  {code:'SPT',kind:'service',parent:'PRY',name:'Sport klubi',description:'Sport seksiyalari, musobaqalar va sport inshootlari.',services:[
    {title:'Sport seksiyasiga yozilish',audience:'all',slaDays:3,fields:[sel('Sport turi',['Futbol','Voleybol','Basketbol','Kurash','Boks','Shaxmat','Stol tennisi','Boshqa']),phone()]}
  ]}
];

// Services every synced faculty (dean's office) and kafedra starts with.
export const ACADEMIC_SERVICES={
  faculty:[
    {title:'Dekanatga ariza',audience:'students',slaDays:5,fields:[sel('Mavzu',['Dars qoldirish sababi','Guruh almashtirish','Imtihonga ruxsat','Boshqa']),area('Ariza matni')]},
    {title:'Sababli dars qoldirishni rasmiylashtirish',audience:'students',slaDays:3,fields:[date('Qaysi kundan'),date('Qaysi kungacha'),sel('Sabab',['Kasallik','Oilaviy sabab','Musobaqa / tadbir','Boshqa']),area('Izoh',false)]}
  ],
  kafedra:[
    {title:'Kurs ishi yoki BMI mavzusini tanlash',audience:'students',slaDays:5,fields:[txt('Mavzu'),txt('Istalgan rahbar',false)]},
    {title:'O‘qituvchi bilan konsultatsiya',audience:'students',slaDays:3,fields:[txt('Fan'),txt('O‘qituvchi'),sel('Shakli',['Auditoriyada','Onlayn']),area('Savol',false)]}
  ]
};
