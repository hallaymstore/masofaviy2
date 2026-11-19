// YouTube'dagi real video URLlaridan yig'ilgan o‘zbekcha ma'ruzalar.
// Boshqa universitet/kanal ma'ruzalari — QDTU rasmiy dasturiga tenglashtirilmaydi.
// row = youtubeId | sohasi | video nomi | muallif/manba | mos yo'nalish kodlari
const RAW_UZBEK_LESSONS = String.raw`
67i5vzIEhMk|iqtisod|Buxgalteriya hisobini tashkil etish va hisob siyosati|B. Menglikulov|60410200,60410100
-JYgcfkeRRY|iqtisod|Buxgalteriya hisobi fanining predmeti va metodi|B. Menglikulov|60410200
BakVdnj5puU|iqtisod|Soliqlar — moliya va kapital bozorlar|Khan Academy Uzbek|60410300,60410500
lZXA5QI6_0k|iqtisod|Soliq setkalari va progressiv soliqqa tortish|Khan Academy Uzbek|60410300
To3X_LBshkU|iqtisod|Muqobil minimal soliq|Khan Academy Uzbek|60410300
DQE69Zp5nHc|iqtisod|Transfer narx belgilash va soliq imtiyozlari|Khan Academy Uzbek|60410300
UVSDq59HH0E|iqtisod|Statistika fanining predmeti va uslubi — 1-ma'ruza|Iqtisodiyot va turizm fakulteti|60410700
x1TE3Fyftw4|iqtisod|Statistika predmeti va uslubi|Iqtisodiyot va turizm fakulteti|60410700
815j8fg1mKE|iqtisod|Moliya bozoriga kirish — 1-dars|HBS Treyderlar Akademiyasi|60410500,60410600
3p9Otp1GwDM|iqtisod|Put — moliya bozorida sug‘urta vositasi|Khan Academy Uzbek|60410500,60410600
IqHXjisN0N4|iqtisod|Qarz halqasi: mazmuni va ta'sirlari|Khan Academy Uzbek|60410600,60410500
6zzbeY2ItyA|iqtisod|Put va qisqa muddatli savdo|Khan Academy Uzbek|60410500,60410600
KSv5sRInxqg|iqtisod|Valyutaning savdoga ta'siri|Khan Academy Uzbek|60410100,60410600
d11uPtNmbYA|iqtisod|Xejirlangan fondlar faoliyatiga kirish|Khan Academy Uzbek|60410500,60410800
POLrVmDFpLU|iqtisod|Geitnerning 4-rejasi — moliya bozorlari|Khan Academy Uzbek|60410500
yffZvwQ3Dds|it|Python dasturlashni noldan boshlash — 1-dars|O'zbekcha dasturlash darsi|60610400,60610500,60610100
awg4aBPMqsM|it|Dasturlashni noldan o‘rganish — CodeBlocks, 1-dars|O'zbekcha dasturlash darsi|60610400,60610300
p3eUfwIvFWQ|it|Python dasturlash tili — 1-dars|Lochinbek Abduxasimov|60610400,60610500
tYEVkPZzvig|it|NumPy — 1-dars, o‘zbek tilida|Data Science darslari|60610500
HUogSIxtrRk|it|Kompyuter tarmoqlari — Packet Tracer, 1-dars|Kompyuter tarmoqlari videodarsi|60610600,60611000
1o2MBkEOACo|it|Tarmoq nima? LAN, WAN va Internet|Kompyuter tarmoqlari kursi|60610300,60610600,60611000
TB-y_Twwv9c|it|Kompyuterlar qanday ishlaydi?|Khan Academy Uzbek|60610300,60610100
xiD4uq5zBw4|it|Sun'iy intellekt: qo‘llanilish sohalari va turlari|O'zbekcha informatika kursi|60610500
f3RtiXrd4YE|it|Sun'iy intellekt: FLOW bo‘yicha dars|O'zbekcha sun'iy intellekt darsi|60610500
5zcL7K_L1U0|it|Sun'iy intellekt yordamida Minecraft o‘yini yaratish|AI Coding o‘zbekcha|60610500,60610400
q_5ASbbH3Uw|it|Web dasturlash — o‘zbek tilida 4-1 dars|O'zbekcha web dasturlash|60610400,60610100
mrJkfv9XUVQ|it,energetika|Kompyuterdagi 0 va 1 nima? Elektronika noldan — 1-dars|Shukhrat Yuldashev|60610300,60710700
LQVB8IAq_bg|energetika|Elektr toki — elektrotexnika faniga kirish|Khan Academy Uzbek|60710500,60710400
bWFL8SmJ6O0|energetika|Avtomatlashtirishning elektr sxemalari — 10-dars|Muxriddin Salimov|60710900,60711000
RwwPbPBM2WI|energetika|Elektrotexnika va radiodetallar haqida|Farhod Azimov|60710700
uRP66N61fFg|energetika,it|Robototexnika — elektr toki nima? 1-dars|Bobobekov Dilshod|60711000,60710500
ZVHJlmceQcY|energetika|Kondensator — 4-dars|ELCOM|60710500,60710700
gkcGPUKjNIY|energetika|Elektromontaj — 1-dars, kirish|ELEKTROTA'LIM|60710500,60710400
MyOQCeRpf_E|energetika|Elektr sxemasida umumiy o‘tkazgich va yerlashtirgich — 60-dars|ELCOM|60710500
HSmdz2Pk9h0|energetika|Kuchlanish va tok — 1-dars|O'zbekiston Elektriklari|60710500,60710400
ooEwdK-XcYg|energetika|Elektr toki va tok kuchi|Innova fizika|60710500
ysFAwcV1KeA|energetika|Quyosh panellari qanday ishlaydi?|Energetika mavzuli videodars|60712100,60710400
XNT8qVURXjg|neftgaz|Tabiiy gazni nordon komponentlardan absorbsiya usulida tozalash — 1-qism|Neft va gaz texnologiyasi|60720500,60720600,60721100
2j-VTTJi0dc|neftgaz|Tozalangan tabiiy gazni sovutish va separatsiyalash — 2-qism|Neft va gaz texnologiyasi|60720500,60720600
YeU-vfwfPg0|neftgaz|Tozalangan tabiiy gazni quritish — 3-qism|Neft va gaz texnologiyasi|60720500,60720600
kruSXUYS7m8|neftgaz|Tabiiy gazdan metanni ajratib olish texnologiyasi — 5-qism|Neft va gaz texnologiyasi|60720500,60720600
7geZqCOuz-o|neftgaz|Tabiiy gazdan ajratilgan metan fraksiyasini siqib haydash|Neft va gaz texnologiyasi|60720500,60720600
RgyzVQGZ9qc|suv|Gidrotexnika inshootlari qurilishining qisqacha tarixi|Buxoro tabiiy resurslarni boshqarish instituti|60730600,60811300
THAD7S8td8w|suv|Gidrotexnika inshootlari asoslariga kirish|Buxoro tabiiy resurslarni boshqarish instituti|60811300,60730600
TSeigxPwkiA|suv|Gidrotexnika inshootining ostki konturi — ma'ruza|Buxoro tabiiy resurslarni boshqarish instituti|60811300,60730600
EwQ_qDIaXZI|suv|Filtratsiya teskari bosimi va filtratsiyaga qarshi choralar|Buxoro tabiiy resurslarni boshqarish instituti|60811200,60811300
rbBqcQuIRPM|suv,agro|Melioratsiya va qurilish mashinalari|Buxoro tabiiy resurslarni boshqarish instituti|60811200,60810100
RL4c_OobmvM|suv|Gidrotexnika inshootlarini qurish va ekspluatatsiya qilish|Buxoro tabiiy resurslarni boshqarish instituti|60811300
I5y9kl-0XDQ|suv|Gidrotexnika inshootlari qurilishining tarixi va suv xo‘jaligi|Buxoro tabiiy resurslarni boshqarish instituti|60811300
4k1GtRUuzko|suv|Gidrotexnika inshootlarining xavfsizligini strategik boshqarish|Buxoro tabiiy resurslarni boshqarish instituti|60730600,60811300
h3_EKgiOCLc|suv|Gidrotexnika inshootlari xavfsizligi va deklaratsiya|Buxoro tabiiy resurslarni boshqarish instituti|60811300
NLrfm2p2RtA|qurilish|Qurilish konstruksiyalarini hisoblash va loyihalash — 1-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300
HHMac57qwQE|qurilish|Loyihalashda dasturiy ta'minot — 2-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300,60730100
y1hOgIO2x0o|qurilish|LIRA-SAPR interfeysi — 3-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300
It5mhPKyv7g|qurilish|Ikki oraliqli binoning yassi ramasini qurish — 4-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300
oMWX7jqqdbE|qurilish|Rama elementlariga yuklarni joylashtirish — 6-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300
OLRItXqsJC8|qurilish|Temir-beton konstruksiyalarini ARM-SAPRda loyihalash — 7-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300
H0xlXFZQsL4|qurilish|Plitani hisoblash — 9-ma'ruza|Qurilish konstruksiyalari kafedrasi|60730300
p0MLvoXggQk|qurilish|Geografik xaritalar elementlari — geodeziya va kartografiya|Dotsent Ibraimova|60721500,60721600,60721700,60811600
I_x_qe1TZ6g|agro|No‘xat biologiyasi va yetishtirish texnologiyasi|Toshkent davlat agrar universiteti|60810400,60810700
tawjxYOTPD4|agro|Sabzavot ekinlarini ekish muddati va almashlab ekish|TDAU Masofaviy ta'lim|60810400,60810500
YtcF93Ai11I|agro|Mosh ekini: yetishtirish va hosil yig‘ish|Qishloq xo‘jaligi vazirligi|60810400
UG1KXqSoZz4|agro|Don va dukkakli ekinlarning yangi navlari|Qishloq xo‘jaligi vazirligi|60810400,60810500
8aDll28yuso|agro|Kuzgi g‘alla: urug‘ tanlash va agrotexnologiyasi|Qishloq xo‘jaligi vazirligi|60810400,60810500
ZbSMLb3x9SY|agro|Beda ekish: urug‘, o‘g‘it va sug‘orish qoidalari|O'zbekcha agro videodars|60810400,60810500
GbfS3nZub0I|agro|Bedani o‘g‘itlash: fosfor va agrotexnik choralar|O'zbekcha agro videodars|60810400,60810500
MhLsAjJ4MeQ|agro|Pomidor ko‘chatlarini dorilash|O'zbekcha agro videodars|60810500
4bbAD_f4wmY|oziqovqat|Oziq-ovqat mahsulotlarini sertifikatlash va xavfsizlik mezonlari — 1-ma'ruza|Ochiq videoma'ruza|60720100,60810700
QPxIIDyy2Yk|oziqovqat|Tayyor mahsulotlar sifat ko‘rsatkichlarini nazorat qilish — 2-ma'ruza|Ochiq videoma'ruza|60720100,60810700
AhahScOV5W8|oziqovqat|Mahsulotlar xavfsizligini ta'minlash usullari|Ochiq videoma'ruza|60720100,60810700
NsHpsZwBQCQ|oziqovqat|Ovqatlanish gigiyenasi: fan maqsadi va vazifalari|Ochiq videodars|60720100
hAVJcc7Uud0|oziqovqat|Oziq-ovqat mahsulotlari sifati va xavfsizligi|O'zbekcha sohaga oid videodars|60720100
Qkt_U5eV-V4|kimyo|Organik kimyoga kirish — 1-dars|KIMYO VOHA ZIYO|60710100
amKmLnTQMEQ|kimyo|Atom tuzilishi va kimyoviy bog‘lanish|O'zbekcha kimyo videodarsi|60710100
CVswyNwuRZk|kimyo|Kimyoviy reaksiyalar va hayot|Khan Academy Uzbek|60710100,60710200
-XnciLFZow0|kimyo|Aminokislotalar va oqsillar|O'zbekcha organik kimyo|60710200
zREDWjjaHHU|kimyo|Organik kimyo: alkanlarning olinishi|O'zbekcha kimyo darsi|60710100
zP3vMfQhays|kimyo|Kimyoviy bog‘lanish — 1-qism|O'zbekcha kimyo darsi|60710100
c1FD0YEHs7I|kimyo|Kimyoviy bog‘lanishlar — batafsil tushuntirish|Just Chemistry|60710100
o6_fPyKXpls|kimyo|Biotexnologiyada xromatografik usullar|Toshkent farmatsevtika instituti|60710200
iYRVihCiDY0|kimyo|Biosensorlar va biotransformatsiya|Toshkent farmatsevtika instituti|60710200
j-qRjub53NU|kimyo|Kimyoviy bog‘lanish va uning turlari|Jizzax politexnika instituti|60710100
VkOZ2CSRoUI|sanoat|Materialshunoslik: keramik materiallar — 13-mavzu|Andijon mashinasozlik instituti|60720300
WmaSsZ3hdj8|sanoat|Materialshunoslik: polimer materiallar — 14-mavzu|Andijon mashinasozlik instituti|60720300
b5orUeNSzwM|sanoat|Materialshunoslik: magnitli materiallar — 16-mavzu|Andijon mashinasozlik instituti|60720300
NtjEX0mfNwE|sanoat|Materialshunoslik: kompozitsion materiallar — 17-mavzu|Andijon mashinasozlik instituti|60720300
AJC44AzCw_s|sanoat|Materialshunoslik: nanotexnologiya asosidagi materiallar — 18-mavzu|Andijon mashinasozlik instituti|60720300
xYhan4k-6nM|sanoat|Materialshunoslik va konstruksion materiallar|Farg‘ona politexnika instituti|60711200,60720300
l5eYhz0f8H0|sanoat|Mashina va mexanizmlar nazariyasi: tishli mexanizmlar|Andijon mashinasozlik instituti|60712300,60720400
RZ4STGNrmVw|sanoat|Materialshunoslik faniga kirish — 1-ma'ruza|Ochiq videodars|60720300
g019K8iBm38|transport|Logistika — 1-dars: logistika nima?|O'zbekcha logistika videodarsi|61010400
beJX6aoOwsg|transport|Logistika — 2-dars: dispetcherlik|O'zbekcha logistika videodarsi|61010400
wPjUZsDtxAY|transport|Logistika — 3-dars: yuk tashish|O'zbekcha logistika videodarsi|61010400
ESJlxhQStsc|transport|Logistika — 4-dars: Power Only|O'zbekcha logistika videodarsi|61010400
JdEXhDu_dRw|transport|Multimodal va intermodal logistikaning farqi — 3-dars|O'zbekcha logistika videodarsi|61010400
BRF28nXi6Fw|transport|Xalqaro logistika asoslari — 4-dars|Furqat Alimuhammedov|61010400
VL2wOs1DEww|transport|Transport vositalarining klassifikatsiyasi|O'zbekcha avtomobil videodarsi|60711400,60730500
HpxogoAybnw|transport|Logistikani o‘rganish — 3-dars, tizim qanday ishlaydi?|Logist UZ|61010400
02RjaVbapVw|ekologiya|Biosfera — ekologiya va atrof-muhit muhofazasi|Toshkent davlat agrar universiteti|60520200,60711800
Cqsz-gmS5eQ|ekologiya|Ekologiya sohasida xalqaro hamkorlik|Ochiq universitet videodarsi|60520200
0qp2_ii-C9k|ekologiya|Ekologiya va qonun|Ochiq universitet videodarsi|60520200
ObktGwanbYs|ekologiya|Ekologik muammolar|Jizzax politexnika instituti|60520200,60711800
9qsWDLE4UaI|ekologiya|Ekologik omillar|Jizzax politexnika instituti|60520200
huXZMjt6414|ekologiya|Qishloq xo‘jaligi ekologiyasi|Ochiq universitet videodarsi|60520200
iIn2tSVyqik|ekologiya|Populyatsiyalar ekologiyasi|Ochiq universitet videodarsi|60520200
7fUYZm3mGk4|ekologiya|Tabiiy resurslar va ekologiya|Ochiq universitet videodarsi|60520200,60711800
rZRzCSVjUts|ekologiya|Ekotizim va uning tarkibi|Jizzax politexnika instituti|60520200
UzaNGSorGXE|turizm|Turizm asoslari faniga kirish — 1-ma'ruza|Iqtisodiyot va turizm fakulteti|61010100
nV4X0aLgTYE|turizm|Turizmning mamlakatga ijtimoiy-iqtisodiy ta'siri — 2-ma'ruza|Iqtisodiyot va turizm fakulteti|61010100
wY4HAbaLTN0|turizm|Turistik xizmatlar bozori — 4-ma'ruza|Iqtisodiyot va turizm fakulteti|61010100
Hipgr0Ra-yo|turizm|Turizm sohasi resurslari — 5-ma'ruza|Iqtisodiyot va turizm fakulteti|61010100
v_Mi4Y64UZY|turizm|Turizm va mehmondo‘stlik|UTAS UZ|61010100
`;
export const UZBEK_LESSONS = RAW_UZBEK_LESSONS.trim().split('\n').map(row => {
  const [id, groups, title, source, codes=''] = row.split('|');
  return {id,title,source,language:"O‘zbekcha",groups:groups.split(','),tags:codes ? codes.split(',') : []};
});
export function lessonsForProgram(program, count=5) {
  if(!program) return UZBEK_LESSONS.slice(0,count);
  const own=UZBEK_LESSONS.filter(video=>video.tags.includes(program.code));
  const related=UZBEK_LESSONS.filter(video=>video.groups.includes(program.group)&&!own.includes(video));
  return [...own,...related].slice(0,count);
}
export const LESSONS_PER_MAJOR=5;
