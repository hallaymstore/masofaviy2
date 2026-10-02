# HALLAYM EDU — Compliance readiness (Uzbekistan)

## Identity modes

### demo
FACE_ID_MODE=demo

- Kamera preview ishlaydi.
- Foydalanuvchidan alohida rozilik olinadi.
- Yuz rasmi saqlanmaydi.
- Biometrik template saqlanmaydi.
- Natija faqat demo identity event sifatida audit jurnaliga yoziladi.
- Bu OneID yoki yuridik kuchga ega biometrik identifikatsiya emas.

### oneid
FACE_ID_MODE=oneid

Production faollashtirishdan oldin:
1. OneID/e-Shartnoma orqali ariza.
2. Tashkilot va axborot tizimi hujjatlari.
3. ERI bilan shartnoma.
4. Test client_id/client_secret.
5. Redirect URI ro‘yxatdan o‘tkazish.
6. Testdan keyin production credentials.

Environment:
ONEID_CLIENT_ID=
ONEID_CLIENT_SECRET=
ONEID_REDIRECT_URI=https://hallaym.kstu.uz/api/auth/oneid/callback

## Personal data controls

- MongoDB localhost-only.
- ConsentRecord: privacy/demo_face/proctoring.
- PrivacyRequest: access/correction/restriction/deletion.
- Audit log.
- 2FA va session revoke.
- DB backup cron.
- Demo biometric image/template storage: disabled.

## Acceptance note

Security readiness PASS texnik nazoratlar ishlayotganini bildiradi.
Compliance readiness esa tashkiliy-huquqiy hujjatlarni almashtirmaydi.
OneID production integratsiyasi faqat rasmiy shartnoma va berilgan credentials bilan production deb hisoblanadi.
