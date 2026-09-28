# QarDTU Masofaviy — taqdimot va topshirish runbook

Yangilangan: 2026-09-28

## Taqdimotdan oldin

1. `https://hallaym.kstu.uz/api/health` — `ok:true`.
2. LMS va media service active.
3. SFU health — workerlar va RTC portlar ko‘rinadi.
4. Admin akkaunt bilan kirish.
5. `node deploy/seed-qdtu-structure.mjs` — rasmiy/ochiq QarDTU tuzilmasi.
6. `node deploy/seed-presentation-data.mjs` — taqdimot kontenti.
7. Bosh sahifadagi “Taqdimot tayyorligi” kartasi 100% ga yaqin bo‘lishi kerak.

## Rahbariyatga ko‘rsatish ketma-ketligi

### 1. Bosh sahifa
- Universitet miqyosidagi statistik kartalar.
- Bugungi darslar.
- Tizim health indikatorlari.
- Taqdimot tayyorligi.

### 2. Universitet
- QarDTU haqida asosiy ma’lumotlar.
- 7 fakultet.
- 12 masofaviy ta’lim yo‘nalishi.
- QarDTU raqamli ekotizimi: rasmiy sayt, Moodle, DSpace, Portfolio, BMBA.

### 3. Tuzilma
- Fakultet → kafedra → guruh iyerarxiyasi.
- `QDTU-MT-2026-*` — 2026/27 platforma ichki guruh identifikatorlari.
- Real HEMIS ID kelganda import bilan almashtiriladi.

### 4. Dars jadvali
- `teacher_login` va `group_id` orqali biriktirish.
- Vaqt/xona/o‘qituvchi/guruh to‘qnashuvini bloklash.
- Ochiq jadval linklari.

### 5. Guruh darslari
- Mediasoup SFU.
- Lecture Lite: 50 talabagacha auditoriya uchun yengil rejim.
- Talaba kamerasi default OFF; mikrofon talab bo‘yicha.
- Teacher simulcast, screen-share, Socket.IO chat.

### 6. Fanlar va vazifalar
- Kurslar.
- Resurslar.
- Mustaqil topshiriqlar.
- Testlar.
- SCORM.

### 7. O‘quv reja qamrovi
- Fan/kredit/kontent readiness.
- Yetishmayotgan resursni aniqlash.

### 8. Elektron kutubxona
- Universitet miqyosidagi va kursga bog‘langan resurslar.
- Ochiq QarDTU/BMBA/LexUZ manbalari.

### 9. Nazorat va statistika
- Davomat.
- Audit.
- Online foydalanuvchilar.
- Monitoring readiness.
- Yakuniy nazoratning shaxsan o‘tkazilishi bo‘yicha qaydlar.

## Namuna ma’lumotlari

Quyidagilar rasmiy HEMIS ma’lumoti emas:
- `PRES-*` foydalanuvchi va fan identifikatorlari;
- `[NAMUNA]` fan/topshiriq/jadval yozuvlari;
- `MT-*-1-26` taqdimot guruh kodlari.

Ular funksional oqimni ko‘rsatish uchun ishlatiladi.

## Real ma’lumotga o‘tish

1. HEMIS yoki universitet Excel/CSV eksporti olinadi.
2. Fakultet/kafedra/guruh external ID lar moslashtiriladi.
3. Foydalanuvchilar `/api/users/import` orqali yuklanadi.
4. Jadval `/api/schedules/import` orqali yuklanadi.
5. O‘quv reja Curriculum import orqali kiritiladi.
6. Namuna qatlam:
   ```bash
   node deploy/remove-presentation-data.mjs
   ```

## Admin recovery

Parolni repo yoki chatga yozmasdan reset qilish:

```bash
ADMIN_RESET_LOGIN='admin' \
ADMIN_RESET_PASSWORD='YANGI_KUCHLI_PAROL' \
node deploy/reset-admin-password.mjs
```

Bu eski sessiyalarni ham yaroqsiz qiladi.

## Muhim ishlab chiqarish eslatmasi

Taqdimot ma’lumotlari funksional tayyorlikni ko‘rsatadi. Rasmiy qabul uchun universitetning:
- real HEMIS/akademik ma’lumotlari;
- kontent ekspertizasi;
- tashqi monitoring API rekvizitlari;
- server/backup/load-test bayonnomalari
alohida qabul dalili sifatida saqlanadi.
