#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/masofaviy2}"
PUBLIC_IP="${PUBLIC_IP:-213.230.97.12}"
APP_PORT="${APP_PORT:-10001}"
SFU_SIGNAL_PORT="${SFU_SIGNAL_PORT:-41000}"
RTC_BASE_PORT="${RTC_BASE_PORT:-50998}"

cd "$APP_DIR"
source ~/.nvm/nvm.sh >/dev/null 2>&1 || true

CPU="$(nproc 2>/dev/null || echo 2)"
RAM_KB="$(awk '/MemTotal/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
RAM_GB="$((RAM_KB/1024/1024))"
MEDIA_WORKERS="${MEDIA_WORKERS:-$CPU}"
[ "$MEDIA_WORKERS" -gt 4 ] && MEDIA_WORKERS=4
[ "$MEDIA_WORKERS" -lt 1 ] && MEDIA_WORKERS=1

# Current-node target is intentionally hardware-aware. 50-room profile lives in prepare-50-parallel.sh.
TARGET_ROOMS=$(( MEDIA_WORKERS * 2 ))
[ "$TARGET_ROOMS" -lt 2 ] && TARGET_ROOMS=2
[ "$TARGET_ROOMS" -gt 8 ] && TARGET_ROOMS=8
MAX_ACTIVE_ROOMS=$(( TARGET_ROOMS + 2 ))
MAX_TOTAL_PEERS=$(( TARGET_ROOMS * 80 ))
[ "$MAX_TOTAL_PEERS" -lt 160 ] && MAX_TOTAL_PEERS=160

echo "=== HALLAYM EDU PRODUCTION REPAIR ==="
echo "CPU=$CPU RAM=${RAM_GB}GB workers=$MEDIA_WORKERS targetRooms=$TARGET_ROOMS"

echo "[1/10] Repository update"
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[2/10] Dependencies / build / tests"
npm ci --no-audit --no-fund
npm --prefix media-server ci --no-audit --no-fund
npm run build:media-client
npm run check
npm test

touch .env
set_env () {
  local key="$1" value="$2"
  sed -i "/^${key}=/d" .env
  printf '%s=%s\n' "$key" "$value" >> .env
}

echo "[3/10] Normalize production media configuration"
set_env NODE_ENV production
set_env PORT "$APP_PORT"
set_env SFU_BRIDGE_URL "ws://127.0.0.1:$SFU_SIGNAL_PORT"
set_env SFU_BRIDGE_URLS "ws://127.0.0.1:$SFU_SIGNAL_PORT"
set_env SIGNAL_IP 127.0.0.1
set_env SIGNAL_PORT "$SFU_SIGNAL_PORT"
set_env RTC_LISTEN_IP 0.0.0.0
set_env ANNOUNCED_IP "$PUBLIC_IP"
set_env RTC_BASE_PORT "$RTC_BASE_PORT"
set_env MEDIASOUP_WORKERS "$MEDIA_WORKERS"
set_env ENABLE_RTC_TCP true
set_env MAX_ROOMS_PER_WORKER 3
set_env MAX_PEERS_PER_ROOM 120
set_env MAX_TOTAL_PEERS "$MAX_TOTAL_PEERS"
set_env MAX_ACTIVE_ROOMS "$MAX_ACTIVE_ROOMS"
set_env TARGET_PARALLEL_ROOMS "$TARGET_ROOMS"
set_env TARGET_MIN_WORKERS "$MEDIA_WORKERS"
set_env MAX_INCOMING_BITRATE 1200000
set_env TEACHER_MAX_INCOMING_BITRATE 3000000
set_env STUDENT_MAX_INCOMING_BITRATE 1000000
set_env MIN_LECTURE_OUTGOING_BITRATE 1200000
set_env LECTURE_LITE_ENABLED true
set_env LECTURE_MAX_STUDENT_AUDIO 4
set_env LECTURE_INITIAL_OUTGOING_BITRATE 700000
set_env STRICT_AUDIO_FLOOR false
set_env TURN_URLS "turn:rtc.hallaym.com:3478?transport=udp,turn:rtc.hallaym.com:3478?transport=tcp"
set_env PLATFORM_VERIFY_URL "http://127.0.0.1:$APP_PORT/api/media/verify"

if ! grep -q '^SFU_BRIDGE_SECRET=.' .env; then
  set_env SFU_BRIDGE_SECRET "$(openssl rand -hex 32)"
fi

echo "[4/10] Stop PM2 copies"
pm2 delete masofaviy2 >/dev/null 2>&1 || true
pm2 delete masofaviy2-sfu >/dev/null 2>&1 || true
sleep 1

echo "[5/10] Kill stale/orphan listeners"
release_port(){
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "$port/tcp" >/dev/null 2>&1 || true
  else
    for pid in $(lsof -ti tcp:"$port" 2>/dev/null || true); do kill "$pid" >/dev/null 2>&1 || true; done
  fi
}
release_port "$APP_PORT"
release_port "$SFU_SIGNAL_PORT"
sleep 2

# Kill only detached processes belonging to this project, never unrelated Node services.
for pid in $(pgrep -f "$APP_DIR/server.js" 2>/dev/null || true); do
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmd" in
    *"$APP_DIR/server.js"*) kill "$pid" >/dev/null 2>&1 || true ;;
  esac
done
for pid in $(pgrep -f "$APP_DIR/media-server/server.js" 2>/dev/null || true); do
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  case "$cmd" in
    *"$APP_DIR/media-server/server.js"*) kill "$pid" >/dev/null 2>&1 || true ;;
  esac
done
sleep 2

echo "[6/10] Start one supervised APP + one supervised SFU"
pm2 start ecosystem.config.cjs --update-env
pm2 save

echo "[7/10] Wait for stable startup"
sleep 8

echo "[8/10] Health checks"
curl -fsS "http://127.0.0.1:$APP_PORT/api/health"; echo
curl -fsS "http://127.0.0.1:$SFU_SIGNAL_PORT/health"; echo

echo "[9/10] Listener / process verification"
APP_COUNT="$(ss -lntp | grep -c ":$APP_PORT " || true)"
SFU_COUNT="$(ss -lntp | grep -c ":$SFU_SIGNAL_PORT " || true)"
echo "APP_LISTENERS=$APP_COUNT SFU_LISTENERS=$SFU_COUNT"
[ "$APP_COUNT" -eq 1 ] || { echo "ERROR: app portda aynan 1 listener bo‘lishi kerak"; exit 4; }
[ "$SFU_COUNT" -eq 1 ] || { echo "ERROR: SFU portda aynan 1 listener bo‘lishi kerak"; exit 5; }
ss -lntup | grep -E ":($APP_PORT|$SFU_SIGNAL_PORT|$RTC_BASE_PORT|$((RTC_BASE_PORT+MEDIA_WORKERS-1))|3478)\b" || true
pm2 list

echo "[10/10] Stability check"
sleep 12
curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null
curl -fsS "http://127.0.0.1:$SFU_SIGNAL_PORT/health" >/dev/null
pm2 save

echo
echo "REPAIR_OK"
echo "Current node: $MEDIA_WORKERS SFU workers, $TARGET_ROOMS target rooms, UDP+TCP RTC."
echo "TURN: rtc.hallaym.com:3478 UDP/TCP with dynamic shared-secret credentials."
echo "For 50 parallel rooms use deploy/prepare-50-parallel.sh on >=8 CPU / >=24GB RAM hardware."
