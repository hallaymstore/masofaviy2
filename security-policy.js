// Browser origin rules for cookie-authenticated LMS and Socket.IO traffic.
// All origins are compared exactly; a substring or a sibling subdomain is not trusted.
export function normalizeAllowedOrigins(raw=''){
 const values=Array.isArray(raw)?raw:String(raw||'').split(',');
 return [...new Set(values.map(x=>String(x).trim()).filter(x=>/^https?:\/\//i.test(x)).map(x=>{
   try{const u=new URL(x);return u.origin}catch{return ''}
 }).filter(Boolean))];
}
export function originAllowed({origin,host,forwardedHost='',configuredOrigins=[],production=false}={}){
 if(!origin)return true; // Non-browser requests use authentication, not an Origin header.
 let parsed;
 try{parsed=new URL(origin)}catch{return false}
 if(!['https:','http:'].includes(parsed.protocol))return false;
 if(production&&parsed.protocol!=='https:')return false;
 if(configuredOrigins.includes(parsed.origin))return true;
 // Legitimate same-origin traffic is valid even without an ALLOWED_ORIGINS variable.
 const expected=[host,forwardedHost].filter(Boolean).map(x=>String(x).toLowerCase().trim());
 return expected.includes(parsed.host.toLowerCase());
}
export function validateProductionSecrets(env){
 if(env.NODE_ENV!=='production')return [];
 const failures=[];
 const jwt=String(env.JWT_SECRET||'');
 if(jwt.length<32||jwt==='development-secret-change-me')failures.push('JWT_SECRET: 32+ belgili maxfiy kalit majburiy');
 if(!env.MONGODB_URI)failures.push('MONGODB_URI: ma’lumotlar bazasi manzili majburiy');
 if(!env.ADMIN_PASSWORD||String(env.ADMIN_PASSWORD).length<14)failures.push('ADMIN_PASSWORD: 14+ belgili administrator paroli majburiy');
 if(String(env.ADMIN_PASSWORD||'').toLowerCase().includes('changeme'))failures.push('ADMIN_PASSWORD: namunaviy paroldan foydalanmang');
 if(env.SFU_BRIDGE_URL&&String(env.SFU_BRIDGE_SECRET||'').length<32)failures.push('SFU_BRIDGE_SECRET: 32+ belgili maxfiy kalit majburiy');
 return failures;
}
