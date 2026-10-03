#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
source ~/.nvm/nvm.sh >/dev/null 2>&1 || true

CPU=$(nproc)
RAM_KB=$(awk '/MemTotal/{print $2}' /proc/meminfo)
RAM_GB=$((RAM_KB/1024/1024))

if [ "$CPU" -lt 8 ]; then
  echo "ERROR: 50 parallel xona uchun kamida 8 logical CPU kerak. Hozir: $CPU"
  exit 2
fi
if [ "$RAM_GB" -lt 24 ]; then
  echo "ERROR: 50 parallel xona uchun kamida 24 GB RAM kerak. Hozir: ${RAM_GB} GB"
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

WORKERS=$CPU
if [ "$WORKERS" -gt 16 ]; then WORKERS=16; fi
if [ "$WORKERS" -lt 8 ]; then WORKERS=8; fi

set_env SIGNAL_PORT 41000
set_env SIGNAL_IP 127.0.0.1
set_env RTC_LISTEN_IP 0.0.0.0
set_env RTC_BASE_PORT 50990
set_env MEDIASOUP_WORKERS "$WORKERS"
set_env ENABLE_RTC_TCP true
set_env MAX_ROOMS_PER_WORKER 8
set_env MAX_PEERS_PER_ROOM 40
set_env MAX_TOTAL_PEERS 1500
set_env MAX_ACTIVE_ROOMS 60
set_env TARGET_PARALLEL_ROOMS 50
set_env TARGET_MIN_WORKERS 8
set_env CAPACITY_MIN_WORKERS 8
set_env CAPACITY_MIN_CPU 8
set_env CAPACITY_MIN_RAM_GB 24
set_env MAX_INCOMING_BITRATE 1500000
set_env LECTURE_LITE_ENABLED true
set_env LECTURE_MAX_STUDENT_AUDIO 6
set_env LECTURE_INITIAL_OUTGOING_BITRATE 700000

echo "=== BUILD / CHECK ==="
npm run build:media-client
npm run check
npm test

echo "=== RESTART MASOFAVIY2 ONLY ==="
pm2 restart masofaviy2 --update-env
pm2 restart masofaviy2-sfu --update-env
pm2 save

sleep 6
echo "=== APP HEALTH ==="
curl -fsS http://127.0.0.1:10001/api/health; echo
echo "=== SFU HEALTH ==="
curl -fsS http://127.0.0.1:41000/health; echo
echo "=== RTC PORTS ==="
ss -lntup | egrep ':(41000|5099[0-9]|5100[0-9]|3478|5349)' || true
echo "=== CAPACITY CHECK ==="
npm run capacity:check

echo
echo "PROFILE READY: 50 parallel rooms / ~1000 concurrent users / 60-room headroom."
echo "IMPORTANT: for full 50-room production stability use multiple SFU nodes or >=10 Gbps uplink."
echo "Recommended topology: 3 active SFU nodes + 1 standby; room is pinned to one node."