#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/masofaviy2}"
PUBLIC_IP="${PUBLIC_IP:-213.230.97.12}"
APP_PORT="${APP_PORT:-10001}"
SFU_SIGNAL_PORT="${SFU_SIGNAL_PORT:-40000}"
RTC_BASE_PORT="${RTC_BASE_PORT:-50000}"
MEDIA_WORKERS="${MEDIA_WORKERS:-2}"

cd "$APP_DIR"

echo "[1/9] Repository update"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[2/9] Dependencies"
npm ci
npm --prefix media-server ci
npm run build:media-client
npm run check

touch .env
set_env () {
  local key="$1" value="$2"
  if grep -q "^$key=" .env; then
    sed -i "s|^$key=.*|$key=$value|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env NODE_ENV production
set_env PORT "$APP_PORT"
set_env ADMIN_LOGIN admin
set_env ADMIN_PASSWORD admin00
set_env SFU_BRIDGE_URL "ws://127.0.0.1:$SFU_SIGNAL_PORT"
set_env SIGNAL_IP 127.0.0.1
set_env SIGNAL_PORT "$SFU_SIGNAL_PORT"
set_env RTC_LISTEN_IP 0.0.0.0
set_env ANNOUNCED_IP "$PUBLIC_IP"
set_env RTC_BASE_PORT "$RTC_BASE_PORT"
set_env MEDIASOUP_WORKERS "$MEDIA_WORKERS"
set_env ENABLE_RTC_TCP true
set_env PLATFORM_VERIFY_URL "http://127.0.0.1:$APP_PORT/api/media/verify"

if ! grep -q '^SFU_BRIDGE_SECRET=.' .env; then
  set_env SFU_BRIDGE_SECRET "$(openssl rand -hex 32)"
fi

echo "[3/9] Stop only Masofaviy2 processes"
pm2 delete masofaviy2 >/dev/null 2>&1 || true
pm2 delete masofaviy2-sfu >/dev/null 2>&1 || true

echo "[4/9] Release platform port $APP_PORT"
if command -v fuser >/dev/null 2>&1; then
  fuser -k "$APP_PORT/tcp" >/dev/null 2>&1 || true
else
  PID="$(lsof -ti tcp:"$APP_PORT" 2>/dev/null | head -n1 || true)"
  [ -z "$PID" ] || kill "$PID" || true
fi
sleep 1

echo "[5/9] Start platform"
pm2 start server.js --name masofaviy2 --cwd "$APP_DIR"

echo "[6/9] Start mediasoup SFU"
pm2 start media-server/server.js --name masofaviy2-sfu --cwd "$APP_DIR"

echo "[7/9] Persist PM2"
pm2 save

echo "[8/9] Local health checks"
sleep 4
curl -fsS "http://127.0.0.1:$APP_PORT/api/health"
echo
curl -fsS "http://127.0.0.1:$APP_PORT/api/branding"
echo
curl -fsS "http://127.0.0.1:$SFU_SIGNAL_PORT/health"
echo

echo "[9/9] Process/port summary"
pm2 list
ss -ltnp | grep -E ":($APP_PORT|$SFU_SIGNAL_PORT)\\b" || true
echo
echo "IMPORTANT: firewall/NAT must allow RTC UDP/TCP ports $RTC_BASE_PORT-$((RTC_BASE_PORT+MEDIA_WORKERS-1)) to this server."
echo "Repair complete."
