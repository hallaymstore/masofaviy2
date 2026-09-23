#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
MEDIA_URL="${MEDIA_URL:-http://127.0.0.1:40000}"
DOMAIN="${DOMAIN:-}"

echo "== systemd =="
systemctl is-active --quiet masofaviy2.service && echo "masofaviy2: active" || { systemctl --no-pager status masofaviy2.service || true; exit 1; }
systemctl is-active --quiet masofaviy2-media.service && echo "masofaviy2-media: active" || { systemctl --no-pager status masofaviy2-media.service || true; exit 1; }

echo "== local LMS =="
curl -fsS "$APP_URL/api/health"; echo

echo "== local SFU =="
curl -fsS "$MEDIA_URL/health"; echo

echo "== listeners =="
ss -lntup | grep -E ':(3000|40000|5000[0-9]|500[1-3][0-9])\b' || true

if [[ -n "$DOMAIN" ]]; then
  echo "== public HTTPS =="
  curl -fsS "https://$DOMAIN/api/health"; echo
fi

echo "OK: lokal xizmatlar javob berdi."
echo "WebRTC uchun tashqi tarmoqdan UDP/NAT testi alohida bajariladi."
