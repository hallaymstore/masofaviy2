import crypto from 'node:crypto';

const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(input){
  const buffer=Buffer.isBuffer(input)?input:Buffer.from(input);
  let bits=0,value=0,out='';
  for(const byte of buffer){
    value=(value<<8)|byte;bits+=8;
    while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5}
  }
  if(bits>0)out+=ALPHABET[(value<<(5-bits))&31];
  return out;
}

export function base32Decode(value){
  const clean=String(value||'').toUpperCase().replace(/=+$/,'').replace(/\s+/g,'');
  if(!clean||!/^[A-Z2-7]+$/.test(clean))throw new Error('TOTP secret noto‘g‘ri');
  let bits=0,acc=0;const out=[];
  for(const char of clean){
    const n=ALPHABET.indexOf(char);acc=(acc<<5)|n;bits+=5;
    if(bits>=8){out.push((acc>>>(bits-8))&255);bits-=8}
  }
  return Buffer.from(out);
}

export function generateTotpSecret(bytes=20){return base32Encode(crypto.randomBytes(bytes))}

export function totpCode(secret,now=Date.now(),stepSeconds=30,digits=6){
  const counter=Math.floor(Number(now)/1000/stepSeconds),buf=Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac=crypto.createHmac('sha1',base32Decode(secret)).update(buf).digest(),offset=mac[mac.length-1]&15;
  const binary=((mac[offset]&127)<<24)|(mac[offset+1]<<16)|(mac[offset+2]<<8)|mac[offset+3];
  return String(binary%(10**digits)).padStart(digits,'0');
}

const safeEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};

export function verifyTotp(secret,code,now=Date.now(),window=1){
  const clean=String(code||'').trim();if(!/^\d{6}$/.test(clean))return false;
  for(let w=-window;w<=window;w++)if(safeEqual(totpCode(secret,Number(now)+w*30000),clean))return true;
  return false;
}

const deriveKey=master=>crypto.createHash('sha256').update(String(master||'')).digest();

export function encryptSecret(secret,masterKey){
  if(String(masterKey||'').length<16)throw new Error('2FA shifrlash kaliti juda qisqa');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',deriveKey(masterKey),iv),encrypted=Buffer.concat([cipher.update(String(secret),'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return ['v1',iv.toString('base64url'),tag.toString('base64url'),encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload,masterKey){
  const [version,ivText,tagText,dataText]=String(payload||'').split('.');
  if(version!=='v1'||!ivText||!tagText||!dataText)throw new Error('2FA secret formati noto‘g‘ri');
  const decipher=crypto.createDecipheriv('aes-256-gcm',deriveKey(masterKey),Buffer.from(ivText,'base64url'));
  decipher.setAuthTag(Buffer.from(tagText,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText,'base64url')),decipher.final()]).toString('utf8');
}

const normalizeRecovery=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const hashRecoveryCode=value=>crypto.createHash('sha256').update(normalizeRecovery(value)).digest('hex');

export function generateRecoveryCodes(count=8){
  return Array.from({length:count},()=>{
    const raw=crypto.randomBytes(8).toString('hex').toUpperCase();
    return raw.slice(0,4)+'-'+raw.slice(4,8)+'-'+raw.slice(8,12)+'-'+raw.slice(12,16);
  });
}

export function consumeRecoveryCode(hashes,code){
  const hash=hashRecoveryCode(code),index=(hashes||[]).findIndex(x=>safeEqual(x,hash));
  if(index<0)return {ok:false,hashes:[...(hashes||[])]};
  const next=[...(hashes||[])];next.splice(index,1);return {ok:true,hashes:next};
}

export function otpauthUri({secret,account,issuer='Masofaviy2'}){
  const label=encodeURIComponent(String(issuer))+':'+encodeURIComponent(String(account));
  return 'otpauth://totp/'+label+'?secret='+encodeURIComponent(secret)+'&issuer='+encodeURIComponent(String(issuer))+'&algorithm=SHA1&digits=6&period=30';
}
