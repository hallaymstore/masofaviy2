#!/usr/bin/env bash
set -u
APP_DIR="${APP_DIR:-/home/hallaym/masofaviy2}"
cd "$APP_DIR" || exit 1
fail=0
ok(){ echo "[OK] $*"; }
warn(){ echo "[WARN] $*"; }
bad(){ echo "[FAIL] $*"; fail=1; }

[[ -f .env ]] || bad ".env topilmadi"
[[ "$(stat -c '%a' .env 2>/dev/null)" == "600" ]] && ok ".env permission 600" || warn ".env permission 600 emas"

uri="$(grep -m1 '^MONGODB_URI=' .env 2>/dev/null | cut -d= -f2-)"
if [[ "$uri" == mongodb://*127.0.0.1* ]]; then ok "MongoDB lokal"; else bad "MongoDB lokal URI emas"; fi

if ss -lnt 2>/dev/null | grep -q '127.0.0.1:27017'; then ok "MongoDB faqat localhost"; else bad "MongoDB bind tekshiruvi"; fi
if systemctl is-active --quiet mongod 2>/dev/null; then ok "mongod active"; else bad "mongod inactive"; fi

jwt="$(grep -m1 '^JWT_SECRET=' .env 2>/dev/null | cut -d= -f2-)"
[[ ${#jwt} -ge 32 ]] && ok "JWT_SECRET uzunligi" || bad "JWT_SECRET kamida 32 belgi bo‘lsin"

bridge="$(grep -m1 '^SFU_BRIDGE_SECRET=' .env 2>/dev/null | cut -d= -f2-)"
[[ ${#bridge} -ge 32 ]] && ok "SFU_BRIDGE_SECRET uzunligi" || bad "SFU_BRIDGE_SECRET kamida 32 belgi"

origins="$(grep -m1 '^ALLOWED_ORIGINS=' .env 2>/dev/null | cut -d= -f2-)"
[[ -n "$origins" ]] && ok "ALLOWED_ORIGINS sozlangan" || warn "ALLOWED_ORIGINS bo‘sh"

curl -fsS --max-time 8 http://127.0.0.1:10001/api/health >/dev/null && ok "App health" || bad "App health"
curl -fsS --max-time 8 http://127.0.0.1:41000/health >/dev/null && ok "SFU health" || bad "SFU health"

if command -v pm2 >/dev/null 2>&1; then
  pm2 ls --no-color | grep -q 'masofaviy2.*online' && ok "PM2 app online" || bad "PM2 app"
  pm2 ls --no-color | grep -q 'masofaviy2-sfu.*online' && ok "PM2 SFU online" || bad "PM2 SFU"
else
  warn "pm2 PATH da topilmadi"
fi

if [[ -x /usr/local/sbin/masofaviy2-mongodb-backup ]]; then ok "DB backup script mavjud"; else warn "DB backup script hali o‘rnatilmagan"; fi
if [[ -f /etc/cron.d/masofaviy2-mongodb-backup ]]; then ok "DB backup cron mavjud"; else warn "DB backup cron hali o‘rnatilmagan"; fi

echo "----"
if [[ $fail -eq 0 ]]; then echo "SECURITY READINESS: PASS (warninglarni ham ko‘rib chiqing)"; else echo "SECURITY READINESS: FAIL"; fi
exit $fail
