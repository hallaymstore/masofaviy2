import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAllowedOrigins,originAllowed,validateProductionSecrets} from '../security-policy.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('browser origins must match exact scheme and host, never a suffix',()=>{
 const origins=normalizeAllowedOrigins('https://hallaym.kstu.uz,https://portal.kstu.uz,https://hallaym.kstu.uz');
 assert.deepEqual(origins,['https://hallaym.kstu.uz','https://portal.kstu.uz']);
 assert.equal(originAllowed({origin:'https://hallaym.kstu.uz',host:'hallaym.kstu.uz',configuredOrigins:[],production:true}),true);
 assert.equal(originAllowed({origin:'https://attacker.example',host:'hallaym.kstu.uz',configuredOrigins:[],production:true}),false);
 assert.equal(originAllowed({origin:'https://hallaym.kstu.uz.attacker.example',host:'hallaym.kstu.uz',configuredOrigins:[],production:true}),false);
 assert.equal(originAllowed({origin:'http://hallaym.kstu.uz',host:'hallaym.kstu.uz',configuredOrigins:[],production:true}),false);
 assert.equal(originAllowed({origin:'https://portal.kstu.uz',host:'hallaym.kstu.uz',configuredOrigins:origins,production:true}),true);
 assert.equal(originAllowed({origin:'https://other.example',host:'hallaym.kstu.uz',configuredOrigins:origins,production:true}),false);
 assert.equal(originAllowed({origin:'null',host:'hallaym.kstu.uz',production:true}),false);
});
test('production fails preflight without strong secrets, dev is not interrupted',()=>{
 assert.deepEqual(validateProductionSecrets({NODE_ENV:'development'}),[]);
 const errors=validateProductionSecrets({NODE_ENV:'production',JWT_SECRET:'weak',ADMIN_PASSWORD:'ChangeMe123!',MONGODB_URI:'mongodb://db',SFU_BRIDGE_URL:'ws://127.0.0.1:41000'});
 assert.ok(errors.some(v=>v.startsWith('JWT_SECRET')));
 assert.ok(errors.some(v=>v.startsWith('ADMIN_PASSWORD')));
 assert.ok(errors.some(v=>v.startsWith('SFU_BRIDGE_SECRET')));
 const env={NODE_ENV:'production',JWT_SECRET:'a'.repeat(64),ADMIN_PASSWORD:'Long-Unique-Admin!123',MONGODB_URI:'mongodb://db',SFU_BRIDGE_URL:'ws://127.0.0.1:41000',SFU_BRIDGE_SECRET:'b'.repeat(64)};
 assert.deepEqual(validateProductionSecrets(env),[]);
});
test('Socket.IO upgrades must use strict browser origin checks and reject demo session in production',()=>{
 const server=read('server.js');
 assert.ok(server.includes('allowRequest:(req,callback)=>callback(null,originAllowed('));
 assert.ok(server.includes("if(production&&data.id==='demo')throw"));
 assert.ok(server.includes("const securityErrors=validateProductionSecrets(process.env)"));
 assert.ok(read('scripts/security-preflight.mjs').includes('validateProductionSecrets(env)'));
});

test('production has no automatic shared-password seed and cannot run demo scripts',()=>{
 const server=read('server.js');
 assert.equal(server.includes('ensureQdtuTestAccounts'),false);
 assert.ok(server.includes("if(production)return res.status(403).json({message:'Production tizimida namunaviy foydalanuvchilarni yaratish taqiqlangan'})"));
 for(const path of ['scripts/seed-inspection-2026-10-07.mjs','scripts/seed-coursework-demo.mjs'])
   assert.ok(read(path).includes("if(process.env.NODE_ENV==='production')throw Error("));
 assert.ok(read('scripts/security-audit-accounts.mjs').includes('countDocuments('));
});
