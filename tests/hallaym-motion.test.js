import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('public/hallaym-motion.css'),js=read('public/hallaym-motion.js'),html=read('public/index.html'),sw=read('public/sw.js');

test('motion layer loads last and its gate runs before first paint',()=>{
 const link=html.indexOf('/hallaym-motion.css?v=');
 for(const x of ['/hallaym-ui.css','/a11y.css','/ai-ui.css'])assert.ok(link>html.indexOf(x),x);
 const s=html.indexOf('<script src="/hallaym-motion.js?v=');
 assert.ok(s>html.indexOf('/a11y-boot.js')&&s<html.indexOf('</head>'),'sync in head, after a11y-boot');
 assert.ok(sw.includes("'/hallaym-motion.css'")&&sw.includes("'/hallaym-motion.js'"));
});

test('every motion rule is gated on html.hxm',()=>{
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,'');
 const selectors=[...rules.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)].map(m=>m[1].trim()).filter(Boolean);
 for(const sel of selectors){
  if(/view-transition|^html\.a11y-reduce-motion|^html\.hxm-vt/.test(sel))continue;
  for(const part of sel.split(/,(?![^(]*\))/))assert.ok(/html\.hx(\.hxm|\s\.hxm)|html\.hx \.hxm-|^\s*html\.hx \.hxm/.test(part.trim())||part.includes('html.hx.hxm'),part.trim());
 }
});

test('reduced motion, the a11y switch and ultra-lite devices turn motion off; weak devices get lite',()=>{
 assert.ok(js.includes("'(prefers-reduced-motion: reduce)'"));
 assert.ok(js.includes("root.classList.contains('a11y-reduce-motion')"));
 assert.ok(js.includes('ultraLite'));
 assert.ok(js.includes("root.classList.toggle('hxm-lite',ok&&lite)"));
 assert.ok(css.includes('@media (prefers-reduced-motion:reduce)'));
 assert.ok(css.includes('html.a11y-reduce-motion .hxm-r{opacity:1!important'));
});

test('live classroom and video page are never animated by this layer',()=>{
 assert.ok(js.includes('var SKIP={lesson:1,videoWatch:1}'));
 assert.ok(css.includes(':where(.page:not(#lesson):not(#videoWatch))'));
 assert.ok(!/#lesson\s*[^)]*\{/.test(css.replace(/:not\(#lesson\)/g,'')),'no rule targets #lesson directly');
});

test('hidden reveal state always resolves',()=>{
 assert.ok(js.includes('setTimeout(function(){t.forEach(function(el){if(el.classList.contains(\'hxm-r\')'));
 assert.ok(js.includes('function clearReveal(el)'));
 assert.ok(css.includes('@media print'));
});
