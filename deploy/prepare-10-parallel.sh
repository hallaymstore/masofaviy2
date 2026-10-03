#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
source ~/.nvm/nvm.sh >/dev/null 2>&1 || true

CPU=$(nproc)
if [ "$CPU" -lt 4 ]; then
  echo "ERROR: 10 parallel xona uchun kamida 4 logical CPU tavsiya qilinadi. Hozir: $CPU"
  exit 2
fi

cp .env ".env.capacity-backup-$(date +%Y%m%d-%H%M%S)"

set_env(){
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s#^${key}=.*#${key}=${value}#" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

set_env SIGNAL_PORT 41000
set_env SIGNAL_IP 127.0.0.1
set_env RTC_LISTEN_IP 0.0.0.0
set_env RTC_BASE_PORT 50998
set_env MEDIASOUP_WORKERS 4
set_env ENABLE_RTC_TCP true
set_env MAX_PEERS_PER_ROOM 120
set_env MAX_TOTAL_PEERS 500
set_env MAX_ACTIVE_ROOMS 12
set_env TARGET_PARALLEL_ROOMS 10
set_env MAX_INCOMING_BITRATE 1800000
set_env LECTURE_LITE_ENABLED true
set_env LECTURE_MAX_STUDENT_AUDIO 6
set_env LECTURE_INITIAL_OUTGOING_BITRATE 900000

echo '=== BUILD / CHECK ==='
npm run build:media-client
npm run check

echo '=== RESTART ONLY MASOFAVIY2 SERVICES ==='
pm2 restart masofaviy2 --update-env
pm2 restart masofaviy2-sfu --update-env
pm2 save

sleep 6
echo '=== PM2 ==='
pm2 ls

echo '=== APP HEALTH ==='
curl -fsS http://127.0.0.1:10001/api/health; echo

echo '=== SFU HEALTH ==='
curl -fsS http://127.0.0.1:41000/health; echo

echo '=== RTC PORTS ==='
ss -lntup | egrep ':(41000|50998|50999|51000|51001|3478|5349)' || true

echo '=== CAPACITY CHECK ==='
npm run capacity:check

echo
echo 'READY PROFILE: 10 parallel rooms / 4 mediasoup workers / max 500 peers configured.'
echo 'NETWORK REQUIREMENT: firewall/NAT must allow UDP 50998-51001 and TCP 50998-51001.'
echo 'TURN: keep 3478 UDP/TCP available; 5349 if TURN TLS is used.'
echo 'md-kstu, md-mongo, md-tunnel were not touched.'
