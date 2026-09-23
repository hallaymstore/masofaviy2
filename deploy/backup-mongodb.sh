#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-/home/hallaym/masofaviy}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/masofaviy2}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

command -v mongodump >/dev/null || { echo "mongodump topilmadi (mongodb-database-tools o‘rnating)." >&2; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "$APP_DIR/.env topilmadi" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$APP_DIR/.env"
set +a
[[ -n "${MONGODB_URI:-}" ]] || { echo "MONGODB_URI bo‘sh" >&2; exit 1; }

install -d -m 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/masofaviy2-$STAMP.archive.gz"

echo "MongoDB + GridFS backup: $OUT"
mongodump --uri="$MONGODB_URI" --archive="$OUT" --gzip
sha256sum "$OUT" > "$OUT.sha256"

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  command -v gpg >/dev/null || { echo "gpg topilmadi; shifrlash bajarilmadi." >&2; exit 1; }
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$OUT.gpg" "$OUT"
  sha256sum "$OUT.gpg" > "$OUT.gpg.sha256"
  rm -f "$OUT" "$OUT.sha256"
  echo "Shifrlangan backup: $OUT.gpg"
else
  if [[ "${NODE_ENV:-}" == "production" || "${REQUIRE_ENCRYPTED_BACKUPS:-false}" == "true" ]]; then
    rm -f "$OUT" "$OUT.sha256"
    echo "ERROR: production backup uchun BACKUP_GPG_RECIPIENT majburiy." >&2
    exit 1
  fi
  echo "OGOHLANTIRISH: BACKUP_GPG_RECIPIENT berilmagan; backup faqat filesystem ruxsatlari bilan himoyalangan."
fi

find "$BACKUP_DIR" -type f -name 'masofaviy2-*' -mtime "+$RETENTION_DAYS" -delete
echo "Backup tayyor."
