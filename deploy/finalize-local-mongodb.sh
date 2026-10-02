#!/usr/bin/env bash
set -Eeuo pipefail

APP_USER="${APP_USER:-hallaym}"
APP_DIR="${APP_DIR:-/home/$APP_USER/masofaviy2}"
ENV_FILE="$APP_DIR/.env"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/masofaviy2-mongodb}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ENV_BACKUP="$APP_DIR/.env.pre-local-finalize.$STAMP"

die(){ echo "[ERROR] $*" >&2; exit 1; }
log(){ echo "[mongo-finalize] $*"; }

[[ $EUID -eq 0 ]] || die "sudo bilan ishga tushiring"
[[ -f "$ENV_FILE" ]] || die ".env topilmadi"

OLD_URI="$(grep -m1 '^MONGODB_URI=' "$ENV_FILE" | cut -d= -f2- || true)"
[[ "$OLD_URI" == mongodb* ]] || die "MONGODB_URI topilmadi"

DB_NAME="$(python3 - "$OLD_URI" <<'PY'
import sys
from urllib.parse import urlparse
u=urlparse(sys.argv[1])
print((u.path or '').lstrip('/').split('?')[0] or 'masofaviy2')
PY
)"
APP_DB_USER="masofaviy_app"
APP_DB_PASS="$(openssl rand -hex 24)"
LOCAL_URI="mongodb://$APP_DB_USER:$APP_DB_PASS@127.0.0.1:27017/$DB_NAME?authSource=admin"

cp -a "$ENV_FILE" "$ENV_BACKUP"
chmod 600 "$ENV_BACKUP"

log "MongoDB auth vaqtincha o‘chirilmoqda"
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/etc/mongod.conf')
s=p.read_text()
s=re.sub(r'(?m)^\s{2}authorization:\s*enabled\s*$','  authorization: disabled',s)
p.write_text(s)
PY
systemctl restart mongod
sleep 2
systemctl is-active --quiet mongod || die "mongod ishga tushmadi"

log "App DB user paroli qayta o‘rnatilmoqda"
mongosh --quiet "mongodb://127.0.0.1:27017/admin" --eval "
const a=db.getSiblingDB('admin');
if(a.getUser('$APP_DB_USER')){
  a.updateUser('$APP_DB_USER',{pwd:'$APP_DB_PASS',roles:[{role:'readWrite',db:'$DB_NAME'}]});
}else{
  a.createUser({user:'$APP_DB_USER',pwd:'$APP_DB_PASS',roles:[{role:'readWrite',db:'$DB_NAME'}]});
}
" >/dev/null

log ".env lokal MongoDB ga o‘tkazilmoqda"
python3 - "$ENV_FILE" "$LOCAL_URI" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1]); uri=sys.argv[2]
lines=p.read_text().splitlines()
out=[]; seen=False
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

log "MongoDB auth qayta yoqilmoqda"
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/etc/mongod.conf')
s=p.read_text()
s=re.sub(r'(?m)^\s{2}authorization:\s*disabled\s*$','  authorization: enabled',s)
p.write_text(s)
PY
systemctl restart mongod
sleep 2
systemctl is-active --quiet mongod || die "mongod auth bilan ishga tushmadi"

log "Lokal autentifikatsiya tekshirilmoqda"
mongosh --quiet "$LOCAL_URI" --eval "db.runCommand({ping:1}).ok" | grep -q 1 || die "DB auth ping xatosi"

log "Collection va document sonlari"
mongosh --quiet "$LOCAL_URI" --eval "print(db.getCollectionNames().length); print(db.getCollectionNames().reduce((n,c)=>n+db.getCollection(c).countDocuments({}),0))"

log "PM2 ilova restart"
sudo -u "$APP_USER" -H bash -lc "export PATH=\$PATH:/usr/local/bin:/usr/bin; cd '$APP_DIR'; command -v pm2 >/dev/null 2>&1 || export PATH=\$PATH:\$HOME/.npm-global/bin; pm2 restart masofaviy2 --update-env; pm2 save"

sleep 4
if ! curl -fsS --max-time 10 http://127.0.0.1:10001/api/health >/dev/null; then
  log "App health xato, .env rollback qilinmoqda"
  cp -a "$ENV_BACKUP" "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR'; pm2 restart masofaviy2 --update-env" || true
  die "Rollback qilindi"
fi

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

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

log "FINAL CHECK"
systemctl is-active mongod
ss -lnt | grep ':27017'
curl -fsS --max-time 10 http://127.0.0.1:10001/api/health
echo
log "TAYYOR: Atlas -> local MongoDB finalizatsiya yakunlandi"
