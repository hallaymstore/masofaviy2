#!/usr/bin/env bash
set -u
cd "${APP_DIR:-/home/hallaym/masofaviy2}" || exit 1
fail=0
ok(){ echo "[OK] $*"; }
warn(){ echo "[PENDING] $*"; }
bad(){ echo "[FAIL] $*"; fail=1; }

grep -q "installCompliance" server.js && ok "Compliance moduli ulangan" || bad "Compliance moduli ulanmagan"
grep -q "/api/compliance/consent" compliance.js && ok "Rozilik jurnali mavjud" || bad "Rozilik jurnali yo‘q"
grep -q "/api/compliance/privacy-request" compliance.js && ok "Shaxsiy ma’lumot so‘rovlari mavjud" || bad "Privacy workflow yo‘q"
grep -q "/api/identity/demo-face" compliance.js && ok "Demo Face ID mavjud" || bad "Demo Face ID yo‘q"
grep -q "storesFaceImage:false" compliance.js && ok "Demo yuz rasmi saqlanmaydi" || bad "Demo biometrik saqlash tekshiruvi"
grep -q "storesFaceTemplate:false" compliance.js && ok "Demo biometrik shablon saqlanmaydi" || bad "Demo template tekshiruvi"
grep -q "proctorConsentAt" lms.js && ok "Proktoring roziligi qaydi mavjud" || bad "Proktoring roziligi qaydi yo‘q"
grep -q "Audit" server.js && ok "Audit trail mavjud" || bad "Audit trail yo‘q"
grep -q "SameSite=Strict" server.js && ok "Session cookie SameSite Strict" || bad "Cookie policy"
grep -q "HttpOnly" server.js && ok "Session cookie HttpOnly" || bad "HttpOnly yo‘q"

mode="$(grep -m1 '^FACE_ID_MODE=' .env 2>/dev/null | cut -d= -f2-)"
mode="${mode:-demo}"
if [[ "$mode" == "demo" ]]; then
  ok "Face ID demo rejim aniq ajratilgan"
  warn "OneID production hali shartnoma/client kalitlaridan keyin yoqiladi"
elif [[ "$mode" == "oneid" ]]; then
  cid="$(grep -m1 '^ONEID_CLIENT_ID=' .env 2>/dev/null | cut -d= -f2-)"
  sec="$(grep -m1 '^ONEID_CLIENT_SECRET=' .env 2>/dev/null | cut -d= -f2-)"
  red="$(grep -m1 '^ONEID_REDIRECT_URI=' .env 2>/dev/null | cut -d= -f2-)"
  [[ -n "$cid" && -n "$sec" && "$red" == https://* ]] && ok "OneID production config mavjud" || bad "OneID config to‘liq emas"
else
  warn "FACE_ID_MODE=$mode"
fi

uri="$(grep -m1 '^MONGODB_URI=' .env 2>/dev/null | cut -d= -f2-)"
[[ "$uri" == mongodb://*127.0.0.1* ]] && ok "Shaxsiy ma’lumot DB lokal serverda" || bad "DB lokal emas"
ss -lnt 2>/dev/null | grep -q '127.0.0.1:27017' && ok "MongoDB internetga ochilmagan" || bad "MongoDB bind"

echo "----"
if [[ $fail -eq 0 ]]; then
  echo "COMPLIANCE READINESS: PASS WITH DECLARED PENDING ITEMS"
else
  echo "COMPLIANCE READINESS: FAIL"
fi
exit $fail
