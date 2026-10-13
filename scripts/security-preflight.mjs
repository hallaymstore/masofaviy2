import 'dotenv/config';
import {validateProductionSecrets,normalizeAllowedOrigins} from '../security-policy.js';
const env=process.env;
const errors=validateProductionSecrets(env);
const warnings=[];
if(env.NODE_ENV!=='production')warnings.push('NODE_ENV=production o‘rnatilmagan');
if(!normalizeAllowedOrigins(env.ALLOWED_ORIGINS).length)
 warnings.push('ALLOWED_ORIGINS yo‘q: faqat same-origin so‘rovlar ishlaydi; tashqi frontend bo‘lsa uning HTTPS originini kiriting');
if(!env.TOTP_ENCRYPTION_KEY)warnings.push('TOTP_ENCRYPTION_KEY alohida kalit emas: 2FA maxfiy ma’lumotlarini JWT kalitidan mustaqil himoyalang');
if(!env.REQUIRE_IN_PERSON_IDENTITY||env.REQUIRE_IN_PERSON_IDENTITY!=='true')
 warnings.push('OTMda yuzma-yuz shaxsni aniqlash nazorati aktiv emas — tartibni mas’ullar bilan kelishing');
console.log('HALLAYM EDU / davlat ekspertizasi preflight');
console.log('Muhit:',env.NODE_ENV||'aniqlanmagan');
for(const error of errors)console.error('XATO:',error);
for(const warning of warnings)console.warn('OGOHLANTIRISH:',warning);
console.log('Natija:',errors.length?'BLOKLANGAN':'Asosiy xavfsizlik sozlamalari tekshirildi; rasmiy ekspertiza talab etiladi');
if(errors.length)process.exitCode=1;
