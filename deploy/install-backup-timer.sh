#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bu skript sudo/root bilan ishga tushiriladi." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/home/hallaym/masofaviy}"
APP_USER="${APP_USER:-hallaym}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/masofaviy2}"
BACKUP_ON_CALENDAR="${BACKUP_ON_CALENDAR:-*-*-* 02:30:00}"

[[ -f "$APP_DIR/deploy/backup-mongodb.sh" ]] || { echo "backup-mongodb.sh topilmadi" >&2; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "$APP_DIR/.env topilmadi" >&2; exit 1; }
id "$APP_USER" >/dev/null 2>&1 || { echo "Linux user topilmadi: $APP_USER" >&2; exit 1; }

install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"

cat >/etc/systemd/system/masofaviy2-backup.service <<EOF
[Unit]
Description=Masofaviy2 MongoDB and GridFS backup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=APP_DIR=$APP_DIR
Environment=BACKUP_DIR=$BACKUP_DIR
ExecStart=/usr/bin/env bash $APP_DIR/deploy/backup-mongodb.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$BACKUP_DIR
EOF

cat >/etc/systemd/system/masofaviy2-backup.timer <<EOF
[Unit]
Description=Daily Masofaviy2 backup

[Timer]
OnCalendar=$BACKUP_ON_CALENDAR
Persistent=true
RandomizedDelaySec=15m
Unit=masofaviy2-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now masofaviy2-backup.timer
systemctl list-timers masofaviy2-backup.timer --no-pager
echo "Backup timer o‘rnatildi: $BACKUP_ON_CALENDAR"
