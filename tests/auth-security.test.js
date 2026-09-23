import test from 'node:test';
import assert from 'node:assert/strict';
import {base32Encode,base32Decode,totpCode,verifyTotp,encryptSecret,decryptSecret,generateRecoveryCodes,hashRecoveryCode,consumeRecoveryCode,otpauthUri} from '../auth-security.js';

test('base32 round-trip keeps secret bytes',()=>{
  const raw=Buffer.from('12345678901234567890');
  assert.deepEqual(base32Decode(base32Encode(raw)),raw);
});
test('TOTP matches RFC 6238 SHA1 vector truncated to 6 digits',()=>{
  const secret=base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpCode(secret,59_000,30,6),'287082');
  assert.equal(verifyTotp(secret,'287082',59_000,0),true);
  assert.equal(verifyTotp(secret,'000000',59_000,0),false);
});
test('2FA secret encryption is authenticated',()=>{
  const encrypted=encryptSecret('JBSWY3DPEHPK3PXP','a-master-key-that-is-long-enough');
  assert.equal(decryptSecret(encrypted,'a-master-key-that-is-long-enough'),'JBSWY3DPEHPK3PXP');
  assert.throws(()=>decryptSecret(encrypted,'wrong-key-that-is-still-long-enough'));
});
test('recovery code is one-time consumable',()=>{
  const [code]=generateRecoveryCodes(1),hash=hashRecoveryCode(code);
  const first=consumeRecoveryCode([hash],code);assert.equal(first.ok,true);assert.equal(first.hashes.length,0);
  assert.equal(consumeRecoveryCode(first.hashes,code).ok,false);
});
test('otpauth URI contains issuer account and secret',()=>{
  const uri=otpauthUri({secret:'ABC234',account:'admin@example.uz',issuer:'Masofaviy2'});
  assert.match(uri,/^otpauth:\/\/totp\//);assert.match(uri,/secret=ABC234/);assert.match(uri,/issuer=Masofaviy2/);
});
