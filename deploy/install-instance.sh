#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/masofaviy2}"
DOMAIN="${DOMAIN:-}"
MONGODB_URI="${MONGODB_URI:-}"
ANNOUNCED_IP="${ANNOUNCED_IP:-}"
ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
TURN_URLS="${TURN_URLS:-}"
TURN_USERNAME="${TURN_USERNAME:-}"
TURN_CREDENTIAL="${TURN_CREDENTIAL:-}"
PROFILE="${PROFILE:-auto}"

fail(){ echo "ERROR: $*" >&2; exit 2; }
command -v node >/dev/null || fail "Node.js kerak (>=22)"
command -v npm >/dev/null || fail "npm kerak"
command -v openssl >/dev/null || fail "openssl kerak"
[ -d "$APP_DIR" ] || fail "APP_DIR topilmadi: $APP_DIR"
[ -n "$MONGODB_URI" ] || fail "MONGODB_URI majburiy"
[ -n "$ANNOUNCED_IP" ] || fail "ANNOUNCED_IP majburiy"
[ -n "$ADMIN_PASSWORD" ] || fail "ADMIN_PASSWORD majburiy"

cd "$APP_DIR"
node_major="$(node -p "process.versions.node.split('.')[0]")"
[ "$node_major" -ge 22 ] || fail "Node.js 22+ kerak"

cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
touch .env

set_env(){
  local key="$1" value="$2"
  sed -i "/^$key=/d" .env
  printf '%s=%s\n' "$key" "$value" >> .env
}

cpu="$(nproc 2>/dev/null || echo 2)"
ram_gb="$(awk '/MemTotal/{printf "%d",$2/1024/1024}' /proc/meminfo 2>/dev/null || echo 4)"
if [ "$PROFILE" = auto ]; then
  if [ "$cpu" -le 2 ] || [ "$ram_gb" -lt 6 ]; then PROFILE=starter
  elif [ "$cpu" -le 4 ] || [ "$ram_gb" -lt 12 ]; then PROFILE=standard
  else PROFILE=pro
  fi
fi

case "$PROFILE" in
  starter)
    WORKERS=2; TARGET_ROOMS=4; MAX_ROOMS=6; MAX_PEERS=120; ROOM_PEERS=30; IN_BITRATE=900000; OUT_BITRATE=450000 ;;
  standard)
    WORKERS=$(( cpu < 4 ? cpu : 4 )); TARGET_ROOMS=8; MAX_ROOMS=12; MAX_PEERS=300; ROOM_PEERS=40; IN_BITRATE=1200000; OUT_BITRATE=600000 ;;
  pro)
    WORKERS=$(( cpu < 8 ? cpu : 8 )); TARGET_ROOMS=20; MAX_ROOMS=28; MAX_PEERS=700; ROOM_PEERS=50; IN_BITRATE=1500000; OUT_BITRATE=700000 ;;
  *) fail "PROFILE starter|standard|pro|auto bo‘lishi kerak" ;;
esac

JWT_SECRET="$(grep '^JWT_SECRET=' .env | cut -d= -f2- || true)"
[ "${#JWT_SECRET}" -ge 32 ] || JWT_SECRET="$(openssl rand -hex 32)"
SFU_SECRET="$(grep '^SFU_BRIDGE_SECRET=' .env | cut -d= -f2- || true)"
[ "${#SFU_SECRET}" -ge 32 ] || SFU_SECRET="$(openssl rand -hex 32)"

set_env NODE_ENV production
set_env PORT 10001
set_env MONGODB_URI "$MONGODB_URI"
set_env JWT_SECRET "$JWT_SECRET"
set_env ADMIN_LOGIN "$ADMIN_LOGIN"
set_env ADMIN_PASSWORD "$ADMIN_PASSWORD"
set_env APP_UTC_OFFSET_MINUTES 300
set_env PUBLIC_TIMETABLE_ENABLED true
set_env SFU_BRIDGE_URL ws://127.0.0.1:41000
set_env SFU_BRIDGE_SECRET "$SFU_SECRET"
set_env SIGNAL_IP 127.0.0.1
set_env SIGNAL_PORT 41000
set_env RTC_LISTEN_IP 0.0.0.0
set_env ANNOUNCED_IP "$ANNOUNCED_IP"
set_env RTC_BASE_PORT 50990
set_env ENABLE_RTC_TCP true
set_env MEDIASOUP_WORKERS "$WORKERS"
set_env TARGET_MIN_WORKERS "$WORKERS"
set_env TARGET_PARALLEL_ROOMS "$TARGET_ROOMS"
set_env MAX_ACTIVE_ROOMS "$MAX_ROOMS"
set_env MAX_TOTAL_PEERS "$MAX_PEERS"
set_env MAX_PEERS_PER_ROOM "$ROOM_PEERS"
set_env MAX_ROOMS_PER_WORKER 6
set_env MAX_INCOMING_BITRATE "$IN_BITRATE"
set_env LECTURE_LITE_ENABLED true
set_env LECTURE_MAX_STUDENT_AUDIO 4
set_env LECTURE_INITIAL_OUTGOING_BITRATE "$OUT_BITRATE"
[ -n "$TURN_URLS" ] && set_env TURN_URLS "$TURN_URLS"
[ -n "$TURN_USERNAME" ] && set_env TURN_USERNAME "$TURN_USERNAME"
[ -n "$TURN_CREDENTIAL" ] && set_env TURN_CREDENTIAL "$TURN_CREDENTIAL"
[ -n "$DOMAIN" ] && set_env INSTANCE_DOMAIN "$DOMAIN"

npm install
npm run build:media-client
npm run check

if command -v pm2 >/dev/null; then
  pm2 describe masofaviy2 >/dev/null 2>&1 && pm2 restart masofaviy2 --update-env || pm2 start server.js --name masofaviy2 --update-env
  pm2 describe masofaviy2-sfu >/dev/null 2>&1 && pm2 restart masofaviy2-sfu --update-env || pm2 start media-server/server.js --name masofaviy2-sfu --update-env
  pm2 save
else
  echo "WARN: pm2 topilmadi. npm i -g pm2 qilib qayta ishga tushiring."
fi

sleep 3
echo "=== HALLAYM EDU INSTANCE READY ==="
echo "Profile: $PROFILE | CPU: $cpu | RAM: ${ram_gb}GB | workers: $WORKERS | target rooms: $TARGET_ROOMS"
[ -n "$DOMAIN" ] && echo "Domain: $DOMAIN"
curl -fsS http://127.0.0.1:10001/api/health && echo
curl -fsS http://127.0.0.1:41000/health && echo
echo "Admin panelga kirib Platforma sozlamalari -> Instance boshqaruvi orqali tashkilot profilini yakunlang."
