# HALLAYM EDU — yangi tashkilotga tez o‘rnatish

Bu loyiha endi bitta OTMga qattiq bog‘lanmagan. Har bir mijoz uchun **bitta codebase + alohida .env + alohida MongoDB + alohida domen** ishlatiladi.

## 1. Server tayyorlash
Node.js 22+, npm, MongoDB, PM2, Nginx va TURN tayyor bo‘lishi kerak.

## 2. Repo
```bash
git clone https://github.com/hallaymstore/masofaviy2.git
cd masofaviy2
```

## 3. Instance konfiguratsiyasi
`deploy/instance.env.example` nusxasini xavfsiz joyga olib, DOMAIN, MONGODB_URI, ANNOUNCED_IP, ADMIN_PASSWORD va TURN ma’lumotlarini to‘ldiring.

## 4. Bir buyruqli tayyorlash
```bash
set -a
source /secure/path/customer.env
set +a
bash deploy/install-instance.sh
```

Script server quvvatiga qarab starter/standard/pro profilini tanlaydi, secretlarni yaratadi, .env ni backup qiladi, client build/check bajaradi, PM2 app+SFU ni ishga tushiradi va health check qiladi.

## 5. Admin panel
Platforma sozlamalari -> Instance boshqaruvi:
- tashkilot turi: universitet / maktab / o‘quv markazi
- instance kodi, domen, til
- shartnoma/tarif/litsenziya muddati
- foydalanuvchi va live xona limitlari
- modul yoqish/o‘chirish
- readiness va infratuzilma holati

## 6. Muhim arxitektura
Har bir tashkilot uchun DB alohida bo‘lsin. Bir mijozning ma’lumoti ikkinchi mijoz bilan aralashmaydi. Katta mijozlarda SFU node’lar alohida kengaytiriladi.
