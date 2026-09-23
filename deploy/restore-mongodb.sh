#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-/home/hallaym/masofaviy}"
BACKUP_FILE="${BACKUP_FILE:-}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-}"

[[ "$CONFIRM_RESTORE" == "YES" ]] || { echo "Tiklash ma’lumotni almashtiradi. CONFIRM_RESTORE=YES bering." >&2; exit 1; }
[[ -n "$BACKUP_FILE" && -f "$BACKUP_FILE" ]] || { echo "BACKUP_FILE mavjud archive yoki .gpg faylga ko‘rsatilishi kerak." >&2; exit 1; }
command -v mongorestore >/dev/null || { echo "mongorestore topilmadi (mongodb-database-tools)." >&2; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo "$APP_DIR/.env topilmadi" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$APP_DIR/.env"
set +a
[[ -n "${MONGODB_URI:-}" ]] || { echo "MONGODB_URI bo‘sh" >&2; exit 1; }

TMP=""
cleanup(){ [[ -n "$TMP" ]] && rm -f "$TMP"; }
trap cleanup EXIT

SOURCE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gpg ]]; then
  command -v gpg >/dev/null || { echo "gpg topilmadi." >&2; exit 1; }
  TMP="$(mktemp /tmp/masofaviy2-restore.XXXXXX.archive.gz)"
  gpg --batch --decrypt --output "$TMP" "$BACKUP_FILE"
  SOURCE="$TMP"
fi

echo "Xizmatlar to‘xtatilmoqda..."
systemctl stop masofaviy2-media.service masofaviy2.service || true
echo "MongoDB + GridFS tiklanmoqda..."
if mongorestore --uri="$MONGODB_URI" --archive="$SOURCE" --gzip --drop; then
  systemctl start masofaviy2.service masofaviy2-media.service
  "$APP_DIR/deploy/verify-production.sh"
  echo "Tiklash muvaffaqiyatli."
else
  systemctl start masofaviy2.service masofaviy2-media.service || true
  echo "Tiklash xato bilan tugadi." >&2
  exit 1
fi
