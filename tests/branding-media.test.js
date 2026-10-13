import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('university logo and PWA icon support direct device uploads',()=>{
 const server=read('server.js'),upload=read('branding-media.js'),app=read('public/app.js'),html=read('public/index.html');
 assert.ok(server.includes("installBrandingUploads(app,"));
 assert.ok(server.includes("brandingMediaUrl(req.body.logoUrl,'logo')"));
 assert.ok(server.includes("brandingMediaUrl(req.body.appIconUrl,'icon')"));
 assert.ok(upload.includes("app.post('/api/admin/branding-media/:kind'"));
 assert.ok(upload.includes("app.get('/api/branding-media/:kind'"));
 assert.ok(upload.includes("['admin','superadmin'].includes(req.user.role)"));
 assert.ok(upload.includes("type.extension!=='png'"));
 assert.ok(app.includes("'brandingLogoFile','logo','logoUrl'"));
 assert.ok(html.includes('id="brandingLogoFile"'));
 assert.ok(html.includes('id="brandingIconFile"'));
});
test('proctor camera retries low resolutions and fallbacks to local Mediapipe',()=>{
 const src=read('public/app.js');
 assert.ok(src.includes('frameRate:{ideal:10,max:15}'));
 assert.ok(src.includes('video:true,audio:false'));
 assert.ok(src.includes("detector={kind:'mediapipe',instance};detectorStatus='loading'"));
 assert.ok(src.includes("studentCameraGranted=true;"));
});
