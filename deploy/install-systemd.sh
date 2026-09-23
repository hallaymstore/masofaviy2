#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bu skript sudo/root bilan ishga tushiriladi." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/home/hallaym/masofaviy}"
APP_USER="${APP_USER:-hallaym}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js topilmadi. NODE_BIN=/path/to/node bilan qayta ishga tushiring." >&2
  exit 1
fi
if [[ ! -f "$APP_DIR/server.js" || ! -f "$APP_DIR/.env" || ! -f "$APP_DIR/media-server/server.js" || ! -f "$APP_DIR/media-server/.env" ]]; then
  echo "Platforma yoki .env fayllari to‘liq emas: $APP_DIR" >&2
  exit 1
fi
id "$APP_USER" >/dev/null 2>&1 || { echo "Linux user topilmadi: $APP_USER" >&2; exit 1; }

cat >/etc/systemd/system/masofaviy2.service <<EOF
[Unit]
Description=Masofaviy2 LMS
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/.env
ExecStart=$NODE_BIN $APP_DIR/server.js
Restart=always
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/masofaviy2-media.service <<EOF
[Unit]
Description=Masofaviy2 mediasoup SFU
After=network-online.target masofaviy2.service
Wants=network-online.target
Requires=masofaviy2.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/media-server
Environment=NODE_ENV=production
EnvironmentFile=$APP_DIR/media-server/.env
ExecStart=$NODE_BIN $APP_DIR/media-server/server.js
Restart=always
RestartSec=3
TimeoutStopSec=20
KillSignal=SIGTERM
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now masofaviy2.service masofaviy2-media.service
systemctl --no-pager --full status masofaviy2.service masofaviy2-media.service || true

echo
echo "Systemd o‘rnatildi. Tekshiruv: bash $APP_DIR/deploy/verify-production.sh"
