import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('public/hallaym-ui.css'),html=read('public/index.html'),app=read('public/app.js'),sw=read('public/sw.js');

test('Hx design layer loads after every legacy stylesheet and is scoped to html.hx',()=>{
 const hx=html.indexOf('/hallaym-ui.css?v=');
 assert.ok(hx>0);
 for(const x of ['/styles.css','/premium-ui.css','/live-classroom-2026.css','/mobile-ui-compact.css','/telegram-design.css'])assert.ok(hx>html.indexOf(x),x);
 assert.ok(html.includes('<html lang="uz" class="hx"'));
 assert.ok(css.includes('html.hx{'));
 assert.ok(css.includes('html.hx[data-theme="dark"]{'));
});

test('fonts are self-hosted (CSP font-src self) and cached for the PWA',()=>{
 for(const f of ['onest-latin-wght-normal.woff2','onest-latin-ext-wght-normal.woff2','onest-cyrillic-wght-normal.woff2','bricolage-grotesque-latin-wght-normal.woff2','bricolage-grotesque-latin-ext-wght-normal.woff2']){
  assert.ok(existsSync(new URL('../public/fonts/'+f,import.meta.url)),f);
  assert.ok(css.includes('/fonts/'+f),f);
 }
 assert.ok(!css.includes('fonts.googleapis.com'));
 assert.ok(sw.includes("'/hallaym-ui.css'"));
 assert.ok(!sw.includes("/fonts/"),'fonts use the HTTP cache, not no-store refetches');
});

test('role-hidden controls stay hidden over component display rules',()=>{
 assert.ok(css.includes('html.hx.hx.hx :is(#shell,#login) :is(.hidden,[hidden])'));
 assert.ok(css.includes('html.hx #sidebar nav button.hidden{display:none!important}'));
 assert.ok(css.includes(':is(.icon-btn,#menuBtn):not(.hidden)'));
 assert.ok(css.includes('.head-actions:not(.hidden)'));
 assert.ok(css.includes(':where(.page:not(#lesson))'),'generic controls never restyle the live classroom');
 assert.ok(css.includes('html.hx:not(.video-cinema-fallback) #shell>header'),'fullscreen fallback keeps its black stage');
});

test('icons render as SVG on low-memory devices; only missing SVG support falls back',()=>{
 assert.ok(app.includes("function icon(name,fallback='•'){if(!window.SVGSVGElement)return"));
 assert.ok(!app.includes("function icon(name,fallback='•'){if(lowEndUI)return"));
 for(const name of ['search','clock','star','clipboard','layers','gear','grid','logout','exam'])assert.ok(app.includes(name+":'<"),name);
});

test('mobile tab bar reuses data-page hooks, follows role visibility and never navigates to an empty page',()=>{
 assert.ok(html.includes('<nav class="hx-tabbar"'));
 for(const p of ['dashboard','schedule','live','courses'])assert.ok(html.includes('<nav class="hx-tabbar"')&&html.split('<nav class="hx-tabbar"')[1].includes('data-page="'+p+'"'),p);
 assert.ok(app.includes("all('nav button[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page))"));
 assert.ok(app.includes('all(`nav button[data-page="${page}"]`).forEach(b=>b.classList.toggle(\'hidden\',!ok))'));
 assert.ok(app.includes("document.documentElement.dataset.page=id"));
 assert.ok(css.includes('[data-page="lesson"]'));
});

test('login keeps its form hooks and gains accessible labels, password toggle and busy state',()=>{
 for(const token of ['id="loginForm"','name="login"','name="password"','id="loginOtpWrap"','name="otp"','id="loginError"','data-landing-title','data-landing-text','data-product-name'])assert.ok(html.includes(token),token);
 assert.ok(html.includes('<label for="loginInput">Login</label>'));
 assert.ok(html.includes('<label for="passwordInput">Parol</label>'));
 assert.ok(html.includes('id="passwordToggle"'));
 assert.ok(app.includes("sb.setAttribute('aria-busy','true')"));
 assert.ok(app.includes("finally{if(sb){sb.disabled=false;sb.removeAttribute('aria-busy')}}"));
});

test('keyboard and motion preferences are respected',()=>{
 assert.ok(html.includes('class="hx-skip" href="#main"'));
 assert.ok(html.includes('<main id="main" tabindex="-1">'));
 assert.ok(html.includes('aria-expanded="false"'));
 assert.ok(css.includes('@media (prefers-reduced-motion:reduce)'));
 assert.ok(css.includes(':focus-visible'));
});
