# HALLAYM EDU — "Hx" dizayn tizimi (2026-10)

Platformaning yangi ko‘rinishi bitta faylda: `public/hallaym-ui.css`. U eski CSS qatlamlaridan **keyin** yuklanadi va barcha qoidalari `html.hx` ostida yozilgan. Shuning uchun eski fayllarga tegmasdan ularni bir xil uslubga keltiradi. ID, `data-*` hooklar, media, davomat va proktoring mantiqi o‘zgarmagan.

## Asosiy qarorlar

| Nima | Qiymat |
| --- | --- |
| Asosiy fon (ink) | `#0f1537` — sidebar, banner, jonli dars bloki |
| Brend rangi | admin sozlamasidagi `--brand` (standart `#0b4fd8`) |
| "Hozir / jonli / e’tibor" | za’faron `#ffb627` |
| Xavf / jonli belgisi | `#e5483b` |
| Sarlavha shrifti | Bricolage Grotesque (o‘z serverimizda, `public/fonts/`) |
| Matn shrifti | Onest (lotin, lotin-ext, kirill) |
| Asosiy matn | 14px, kartalar 22px radius |
| Belgi | to‘rt plitka: chorak doira, doira, romb, chorak doira |

Shriftlar universitet serverida turadi (CSP `font-src 'self'`), internetga chiqmasdan ishlaydi. Litsenziya: SIL OFL (`public/fonts/OFL-*.txt`).

## Tuzilmaviy tuzatishlar

- **Ikonkalar:** 4 GB va undan kam xotirali qurilmalarda ham SVG ikonkalar chiqadi. Avval ular «▣ ♙ ◉» belgilarga almashib qolardi. `icon()` endi faqat SVG umuman qo‘llab-quvvatlanmasa fallback beradi.
- **Rolga oid menyu:** eski CSS `.hidden` bo‘lgan menyu bandlarini (Statistika, Foydalanuvchilar…) talabaga ham ko‘rsatib qo‘yardi. Endi `.hidden` har doim ustun.
- **Telefon:** pastki tab bar (Asosiy, Jadval, Jonli, Fanlar, Menyu). U o‘sha `data-page` hooklardan foydalanadi, rol bo‘yicha yashirinadi, dars xonasi va tahrirlash sahifasida ko‘rinmaydi.
- **Kirish sahifasi:** label/input to‘g‘ri bog‘langan, parolni ko‘rsatish tugmasi bor (chiqishda avtomatik yashiriladi), ikki marta yuborish bloklanadi.
- **Accessibility:** "Asosiy mazmunga o‘tish" havolasi, `aria-current`, `aria-expanded`, ko‘rinadigan fokus, `prefers-reduced-motion`.
- **Joylashuv xatolari tuzatildi:** «Jonli darslar» sahifasidagi harfma-harf sinish, sidebar’dagi «Chiqish» ustma-ust tushishi, video kartadagi matn, mobil header’dagi «TalabaQarDTU».
- **Dars xonasi:** faqat rang va boshqaruv tugmalari yangilandi. O‘lchamlar `mobile-ui-compact.css` / `live-classroom-2026.css` da qoldi. Umumiy tugma va input qoidalari `#lesson` ga ta’sir qilmaydi (`:where(.page:not(#lesson))`), to‘liq ekran rejimi (`video-cinema-fallback`) avvalgidek ishlaydi.

## Qoidalar (keyingi o‘zgarishlar uchun)

1. Yangi komponent uslubi `hallaym-ui.css` ga yoziladi. Eski qatlamlarga yangi rang qo‘shilmaydi.
2. Ranglar tokenlardan olinadi (`--hx-*`). Qorong‘i rejim tokenlar orqali o‘zi ishlaydi.
3. Ko‘rinishni boshqaradigan har bir `display:` qoidasi `.hidden` ni bosib ketmasligi kerak. Buni `tests/hallaym-design-system.test.js` tekshiradi.
4. CSS yoki JS o‘zgarsa, `index.html` dagi `?v=` va `sw.js` dagi `CACHE` nomini yangilang, aks holda PWA eski faylni ko‘rsatadi.
