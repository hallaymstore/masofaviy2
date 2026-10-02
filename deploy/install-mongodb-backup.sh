#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo "sudo bilan ishga tushiring"; exit 1; }
APP_DIR="/home/hallaym/masofaviy2"
OUT="/var/backups/masofaviy2-mongodb"
install -d -m 700 "$OUT"
cat >/usr/local/sbin/masofaviy2-mongodb-backup <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="/home/hallaym/masofaviy2"
OUT="/var/backups/masofaviy2-mongodb"
URI="$(grep -m1 '^MONGODB_URI=' "$APP_DIR/.env" | cut -d= -f2-)"
STAMP="$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir -p "$OUT"
mongodump --uri="$URI" --archive="$OUT/local-$STAMP.archive.gz" --gzip
find "$OUT" -type f -name 'local-*.archive.gz' -mtime +14 -delete
EOF
chmod 700 /usr/local/sbin/masofaviy2-mongodb-backup
cat >/etc/cron.d/masofaviy2-mongodb-backup <<'EOF'
30 2 * * * root /usr/local/sbin/masofaviy2-mongodb-backup >/var/log/masofaviy2-mongodb-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/masofaviy2-mongodb-backup
/usr/local/sbin/masofaviy2-mongodb-backup
echo "Backup tayyor:"
ls -lh "$OUT" | tail -5
