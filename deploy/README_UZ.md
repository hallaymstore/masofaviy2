# Universitet serveriga production deploy

Bu katalog `/home/hallaym/masofaviy` ichidagi Masofaviy2 va `media-server`ni bitta Ubuntu serverda production rejimida ishlatish uchun tayyorlangan.

## 1. Router/NAT va firewall

Platforma va mediasoup bir serverda bo‘lsa tavsiya etilgan tashqi portlar:

- TCP 80 → server:80 — Let's Encrypt va HTTP→HTTPS;
- TCP 443 → server:443 — platforma;
- UDP 50000–50031 → server:50000–50031 — mediasoup RTC; worker soni ko‘paytirilsa diapazonni mos kengaytiring;
- SSH uchun tashqi 777 ishlatilsa: TCP 777 → server:22 NAT/port-forward.

**40000 portni internetga forward qilmang.** U endi default `127.0.0.1:40000` va faqat LMS ↔ SFU bridge uchun.

Agar TURN tashqi servis (masalan, alohida TURN provider) bo‘lsa universitet serverida 3478 ochish shart emas. Mahalliy coturn o‘rnatilsa uning 3478/5349 va relay diapazoni coturn konfiguratsiyasiga ko‘ra alohida ochiladi.

Ubuntu UFW misoli:

    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 50000:50031/udp
    sudo ufw enable

Router tashqi 777 ni ichki 22 ga o‘tkazayotgan bo‘lsa UFW serverning ichki 22 portini ko‘radi.

## 2. DNS

Universitet domen/subdomenining A yozuvi serverning public IP manziliga qarasin. DNS tarqalgach:

    nslookup YOUR_DOMAIN

## 3. Environment

Repo:

    cd /home/hallaym/masofaviy
    cp .env.example .env
    cp media-server/.env.example media-server/.env

Root `.env`da kamida:

    NODE_ENV=production
    MONGODB_URI=...
    JWT_SECRET=<32+ random>
    TOTP_ENCRYPTION_KEY=<JWT_SECRET dan boshqa 32+ random>
    ADMIN_LOGIN=...
    ADMIN_PASSWORD=...
    ALLOWED_ORIGINS=https://YOUR_DOMAIN
    SFU_BRIDGE_URL=ws://127.0.0.1:40000
    SFU_BRIDGE_SECRET=<32+ random; media .env bilan aynan bir xil>
    TURN_URLS=turn:YOUR_TURN_HOST:3478,turns:YOUR_TURN_HOST:5349
    TURN_USERNAME=...
    TURN_CREDENTIAL=...
    MAX_RESOURCE_MB=1024

`media-server/.env`da:

    SIGNAL_IP=127.0.0.1
    SIGNAL_PORT=40000
    RTC_LISTEN_IP=0.0.0.0
    ANNOUNCED_IP=YOUR_PUBLIC_IP
    RTC_BASE_PORT=50000
    MEDIASOUP_WORKERS=4
    PLATFORM_VERIFY_URL=http://127.0.0.1:3000/api/media/verify
    SFU_BRIDGE_SECRET=<root .env bilan aynan bir xil>

Secret yaratish misoli:

    openssl rand -hex 32

## 4. Kodni tekshirish va build

`hallaym` user bilan:

    cd /home/hallaym/masofaviy
    bash deploy/prepare-production.sh

Skript:
- `git pull --ff-only`;
- root dependencylarni `npm ci` bilan o‘rnatadi;
- media-clientni build qiladi;
- syntax check va unit testlarni bajaradi;
- media-server dependencylarini o‘rnatib tekshiradi.

Biror check yiqilsa xizmatni yangilamang.

## 5. systemd

    cd /home/hallaym/masofaviy
    sudo APP_DIR=/home/hallaym/masofaviy APP_USER=hallaym bash deploy/install-systemd.sh

Tekshirish:

    systemctl status masofaviy2
    systemctl status masofaviy2-media
    journalctl -u masofaviy2 -n 100 --no-pager
    journalctl -u masofaviy2-media -n 100 --no-pager

## 6. TLS va Nginx

Ubuntu:

    sudo apt update
    sudo apt install -y nginx certbot

DNS va TCP 80 tayyor bo‘lgach sertifikatni oling:

    sudo systemctl stop nginx
    sudo certbot certonly --standalone -d YOUR_DOMAIN
    sudo systemctl start nginx

Nginx template:

    cd /home/hallaym/masofaviy
    sed 's/__DOMAIN__/YOUR_DOMAIN/g' deploy/nginx-masofaviy2.conf | sudo tee /etc/nginx/sites-available/masofaviy2 >/dev/null
    sudo ln -sfn /etc/nginx/sites-available/masofaviy2 /etc/nginx/sites-enabled/masofaviy2
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl reload nginx

Nginx 1 GBgacha uploadga ruxsat beradi va request bufferingni o‘chiradi, shuning uchun fayl GridFS’ga oqim bilan yoziladi.

## 7. Qabul tekshiruvi

    cd /home/hallaym/masofaviy
    sudo bash deploy/verify-production.sh

Public domen ham tekshirilsin:

    sudo DOMAIN=YOUR_DOMAIN bash deploy/verify-production.sh

Keyin real tarmoqlarda:
1. Wi‑Fi → Wi‑Fi;
2. mobil internet → universitet serveri;
3. TURN majburiy bo‘ladigan NAT;
4. 3–4 parallel xona;
5. bir xonada kamida 60 ishtirokchi;
6. Android 8 qurilma;
7. 80 daqiqalik uzluksiz sessiya.

CPU, RAM, packet loss, reconnect, audio/video sifati va participant peak protokolga yoziladi.

## 8. Yangilash

Keyingi GitHub yangilanishlari:

    cd /home/hallaym/masofaviy
    bash deploy/prepare-production.sh
    sudo systemctl restart masofaviy2 masofaviy2-media
    sudo bash deploy/verify-production.sh

Database backup/tiklash sinovi va rollback rejasi bajarilmasdan production release “yakunlangan” deb belgilanmaydi.
