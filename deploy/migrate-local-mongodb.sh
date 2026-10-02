#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="${APP_USER:-hallaym}"
APP_DIR="${APP_DIR:-/home/$APP_USER/masofaviy2}"
ENV_FILE="$APP_DIR/.env"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/masofaviy2-mongodb}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_ROOT/atlas-$STAMP.archive.gz"
ENV_BACKUP="$APP_DIR/.env.pre-local-mongo.$STAMP"

die(){ echo "[ERROR] $*" >&2; exit 1; }
log(){ echo "[mongo-migrate] $*"; }

[[ $EUID -eq 0 ]] || die "sudo bilan ishga tushiring: sudo bash deploy/migrate-local-mongodb.sh"
[[ -f "$ENV_FILE" ]] || die ".env topilmadi: $ENV_FILE"

OLD_URI="$(grep -m1 '^MONGODB_URI=' "$ENV_FILE" | cut -d= -f2- || true)"
[[ "$OLD_URI" == mongodb* ]] || die "MONGODB_URI topilmadi yoki noto'g'ri"

DB_NAME="$(python3 - "$OLD_URI" <<'PY'
import sys
from urllib.parse import urlparse
u=urlparse(sys.argv[1])
name=(u.path or '').lstrip('/').split('?')[0]
print(name or 'masofaviy2')
PY
)"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || die "DB nomi xavfsiz formatda emas"

install_mongodb(){
  if command -v mongod >/dev/null 2>&1 && command -v mongodump >/dev/null 2>&1 && command -v mongosh >/dev/null 2>&1; then
    log "MongoDB va database tools allaqachon mavjud"
    return
  fi
  log "MongoDB 8.0 official repository tayyorlanmoqda"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -d -m 0755 /usr/share/keyrings
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
  echo "deb [ arch=amd64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list
  apt-get update
  apt-get install -y mongodb-org mongodb-database-tools
}

configure_noauth_local(){
  log "MongoDB localhost-only qilib sozlanmoqda"
  cp -a /etc/mongod.conf "/etc/mongod.conf.pre-masofaviy2.$STAMP" 2>/dev/null || true
  python3 - <<'PY'
from pathlib import Path
import re
p=Path('/etc/mongod.conf')
s=p.read_text()
lines=s.splitlines()
out=[]
skip_auth=False
for line in lines:
    if line.strip().startswith('security:'):
        skip_auth=True
        continue
    if skip_auth:
        if line and not line.startswith((' ','\t')):
            skip_auth=False
        else:
            continue
    out.append(line)
s='\n'.join(out)+'\n'
if 'net:' in s:
    if re.search(r'(?m)^\s*bindIp\s*:',s):
        s=re.sub(r'(?m)^\s*bindIp\s*:.*$','  bindIp: 127.0.0.1',s)
    else:
        s=s.replace('net:\n','net:\n  bindIp: 127.0.0.1\n',1)
else:
    s+='net:\n  port: 27017\n  bindIp: 127.0.0.1\n'
p.write_text(s)
PY
  systemctl enable mongod
  systemctl restart mongod
  sleep 2
  systemctl is-active --quiet mongod || die "mongod ishga tushmadi"
}

enable_auth(){
  python3 - <<'PY'
from pathlib import Path
p=Path('/etc/mongod.conf')
s=p.read_text()
if 'security:' not in s:
    s += '\nsecurity:\n  authorization: enabled\n'
elif 'authorization:' not in s:
    s=s.replace('security:\n','security:\n  authorization: enabled\n',1)
p.write_text(s)
PY
  systemctl restart mongod
  sleep 2
  systemctl is-active --quiet mongod || die "mongod auth bilan ishga tushmadi"
}

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
cp -a "$ENV_FILE" "$ENV_BACKUP"
chown root:root "$ENV_BACKUP"
chmod 600 "$ENV_BACKUP"

install_mongodb
configure_noauth_local

log "Atlas backup olinmoqda (URI ekranga chiqarilmaydi)"
mongodump --uri="$OLD_URI" --archive="$ARCHIVE" --gzip
chmod 600 "$ARCHIVE"
[[ -s "$ARCHIVE" ]] || die "Atlas backup bo'sh"

log "Backup lokal MongoDB ga restore qilinmoqda"
mongorestore --uri="mongodb://127.0.0.1:27017" --archive="$ARCHIVE" --gzip --drop

APP_DB_USER="masofaviy_app"
APP_DB_PASS="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
[[ ${#APP_DB_PASS} -ge 32 ]] || die "DB parol yaratilmagan"

log "Alohida MongoDB app user yaratilmoqda"
mongosh --quiet "mongodb://127.0.0.1:27017/admin" --eval "
db.getSiblingDB('admin').createUser({
  user:'$APP_DB_USER',
  pwd:'$APP_DB_PASS',
  roles:[{role:'readWrite',db:'$DB_NAME'}]
})
" >/dev/null

enable_auth

LOCAL_URI="mongodb://$APP_DB_USER:$APP_DB_PASS@127.0.0.1:27017/$DB_NAME?authSource=admin"

log ".env lokal MongoDB ga o'tkazilmoqda"
python3 - "$ENV_FILE" "$LOCAL_URI" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1]); uri=sys.argv[2]
lines=p.read_text().splitlines()
seen=False; out=[]
for line in lines:
    if line.startswith('MONGODB_URI='):
        out.append('MONGODB_URI='+uri); seen=True
    else:
        out.append(line)
if not seen: out.append('MONGODB_URI='+uri)
p.write_text('\n'.join(out)+'\n')
PY
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

log "Lokal DB autentifikatsiyasi tekshirilmoqda"
mongosh --quiet "$LOCAL_URI" --eval "db.runCommand({ping:1}).ok" | grep -q 1 || die "Lokal MongoDB ping xatosi"

log "PM2 ilova qayta ishga tushirilmoqda"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && pm2 restart masofaviy2 --update-env && pm2 save"

sleep 3
curl -fsS --max-time 8 http://127.0.0.1:10001/api/health >/dev/null || {
  log "Health check xato. Eski .env qaytarilmoqda"
  cp -a "$ENV_BACKUP" "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && pm2 restart masofaviy2 --update-env"
  die "Migratsiya rollback qilindi"
}

log "Daily backup script yozilmoqda"
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

log "Port tekshiruvi:"
ss -lntp | grep ':27017' || true
log "MongoDB status: $(systemctl is-active mongod)"
log "App health: OK"
log "DB: $DB_NAME"
log "Atlas backup: $ARCHIVE"
log "Eski .env backup: $ENV_BACKUP"
log "TAYYOR: lokal MongoDB migratsiyasi yakunlandi."
