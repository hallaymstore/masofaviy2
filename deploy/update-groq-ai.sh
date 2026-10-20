#!/usr/bin/env bash
# HALLAYM EDU / University Groq deploy. Run interactively as hallaym.
set -Eeuo pipefail
set +x
umask 077
APP_DIR="${APP_DIR:-$HOME/masofaviy2}"
cd "$APP_DIR" || exit 1
[[ -t 0 && -f .env && -d .git ]] || { echo "SSH terminal va mavjud .env talab qilinadi"; exit 1; }
[[ -f "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
for cmd in git npm node curl; do command -v "$cmd" >/dev/null || { echo "$cmd topilmadi"; exit 1; }; done
echo "Darslar tugagach deploy qiling: LMS qisqa muddatga qayta ishga tushadi, SFU alohida qoladi."
read -r -p "Davom etilsinmi? (ha): " confirmation
[[ "$confirmation" == "ha" ]] || exit 0
# Keep existing untracked data/backups intact. Only tracked modifications block deployment.
# Git itself will still refuse to overwrite an untracked file on fetch/checkout/pull.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Git tomonidan kuzatiladigan fayllarda lokal o'zgarish bor; ularni zaxiralang yoki stash qiling."
  git status --short --untracked-files=no
  exit 2
fi

OLD_SHA="$(git rev-parse HEAD)"
BACKUP="$HOME/.hallaym-deploy-backups"
install -d -m 700 "$BACKUP"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
cp -p .env "$BACKUP/.env-$STAMP"
chmod 600 "$BACKUP/.env-$STAMP"
printf '%s\n' "$OLD_SHA" > "$BACKUP/old-head-$STAMP.txt"
echo "[1/5] Repo va dependencies"
git fetch origin main
git switch main
git pull --ff-only origin main
[[ -f ai-assistant.js && -f public/ai-ui.js ]] || { echo "AI fayllari topilmadi"; exit 3; }
npm ci --no-audit --no-fund
npm run build:media-client
npm run check
npm test

echo "[2/5] Groq kalitini yashirin kiritish"
read -r -s -p "GROQ_API_KEY (ekranda ko'rinmaydi): " GROQ_KEY
echo
[[ "$GROQ_KEY" =~ ^gsk_[[:alnum:]_-]{20,}$ ]] || { echo "Groq key noto'g'ri"; exit 4; }
set_env(){ sed -i "/^$1=/d" .env; printf '%s=%s\n' "$1" "$2" >> .env; }
set_env GROQ_API_KEY "$GROQ_KEY"
unset GROQ_KEY
set_env GROQ_MODEL 'openai/gpt-oss-20b'
set_env AI_USER_DAILY_LIMIT '25'
set_env AI_GLOBAL_DAILY_LIMIT '500'
set_env AI_USER_RPM '3'
set_env AI_MAX_CONCURRENT '2'
chmod 600 .env

echo "[3/5] Groq haqiqiy API so'rovini tekshirish"
node --input-type=module <<'NODE'
import 'dotenv/config';
const ctrl=new AbortController();
const timer=setTimeout(()=>ctrl.abort(),20000);
try {
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',signal:ctrl.signal,headers:{
      Authorization:'Bearer '+process.env.GROQ_API_KEY,
      'Content-Type':'application/json'
    },body:JSON.stringify({
      model:process.env.GROQ_MODEL||'openai/gpt-oss-20b',
      messages:[{role:'user',content:'Reply with one word: OK'}],
      reasoning_effort:'low',max_completion_tokens:160
    })
  });
  if(!res.ok){console.error('Groq HTTP '+res.status+' — API key/kvota tekshiring');process.exitCode=1;}
  else{const data=await res.json();if(data.choices?.[0]?.message?.content)console.log('GROQ_API_OK');
       else{console.error('Groq bo‘sh javob');process.exitCode=1;}}
}catch(err){console.error('Groq tarmoqqa ulanmadi: '+err.name);process.exitCode=1;}
finally{clearTimeout(timer);}
NODE

echo "[4/5] LMS restart (SFU restart qilinmaydi)"
if command -v pm2 >/dev/null && pm2 describe masofaviy2 >/dev/null 2>&1; then
  pm2 restart masofaviy2 --update-env
  pm2 save
elif systemctl is-active --quiet masofaviy2.service; then
  sudo systemctl restart masofaviy2.service
else
  echo "PM2/systemd servisi topilmadi; startni qo'lda tekshiring"; exit 5
fi

echo "[5/5] Health-check"
sleep 5
PORT="$(sed -n 's/^PORT=//p' .env | tail -1 | tr -d '\r')"
PORT="${PORT:-3000}"
curl -fsS --max-time 12 "http://127.0.0.1:$PORT/api/health" >/dev/null
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$PORT/api/ai/status")"
[[ "$CODE" == 401 ]] || { echo "AI endpoint HTTP $CODE; 401 kutilgan"; exit 6; }
if curl -fsS --max-time 10 https://hallaym.kstu.uz/api/health >/dev/null; then
  echo "HTTPS health: OK"
else
  echo "HTTPS health: ogohlantirish, Nginx/DNS tekshiring"
fi
echo "HALLAYM_AI_DEPLOY_OK | old:$OLD_SHA | new:$(git rev-parse HEAD)"
echo "Backup directory: $BACKUP"
