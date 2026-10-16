/* HALLAYM EDU — accessibility boot: applies the saved personal accessibility settings before the page paints
   (no flash of unreadable text). Classic script, loaded in <head>. The panel (a11y.js) uses window.HxA11y. */
(function(){
  'use strict';
  var KEY='hx-a11y',root=document.documentElement;
  var DEF={textScale:100,lineHeight:'normal',letterSpacing:'normal',font:'default',contrast:'none',colorFilter:'none',reduceMotion:false,highlightLinks:false,
    bigCursor:false,readingRuler:false,strongFocus:false,clickToRead:false,ttsRate:1,captionsAlways:false,captionSize:0,announceChat:false,simpleLayout:false,voiceAssistant:false,preset:''};
  var MATRIX={ // daltonization (colour-vision correction), not simulation
    protanopia:'1 0 0 0 0 0.479 0.477 0.044 0 0 0.597 -0.689 1.091 0 0 0 0 0 1 0',
    deuteranopia:'1.437 -0.631 0.195 0 0 0 1 0 0 0 -0.184 0.186 0.998 0 0 0 0 0 1 0',
    tritanopia:'0.741 -0.407 0.666 0 0 0.075 0.585 0.340 0 0 0 0 1 0 0 0 0 0 1 0'
  };
  var CLASS_PREFIX='a11y-';
  function read(){try{var raw=localStorage.getItem(KEY);if(!raw)return null;var p=JSON.parse(raw);return p&&typeof p==='object'?p:null}catch(e){return null}}
  function merged(p){var o={},k;for(k in DEF)o[k]=DEF[k];if(p)for(k in p)if(k in DEF)o[k]=p[k];return o}
  function ensureFilters(){
    if(document.getElementById('hxA11yFilters')||!document.body)return;
    var ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.id='hxA11yFilters';svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    svg.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
    var defs=document.createElementNS(ns,'defs');
    Object.keys(MATRIX).forEach(function(name){var f=document.createElementNS(ns,'filter');f.id='hx-'+name;var m=document.createElementNS(ns,'feColorMatrix');m.setAttribute('type','matrix');m.setAttribute('values',MATRIX[name]);f.appendChild(m);defs.appendChild(f)});
    svg.appendChild(defs);document.body.appendChild(svg);
  }
  function apply(prefs){
    var p=merged(prefs);
    var keep=(root.className||'').split(/\s+/).filter(function(c){return c&&c.indexOf(CLASS_PREFIX)!==0});
    var add=[];
    if(p.textScale>100)add.push('a11y-zoom');
    if(p.lineHeight!=='normal')add.push('a11y-lh-'+p.lineHeight);
    if(p.letterSpacing!=='normal')add.push('a11y-ls-'+p.letterSpacing);
    if(p.font!=='default')add.push('a11y-font-'+p.font);
    if(p.contrast!=='none')add.push('a11y-contrast','a11y-contrast-'+p.contrast);
    if(p.colorFilter!=='none')add.push('a11y-filter-'+p.colorFilter);
    ['reduceMotion','highlightLinks','bigCursor','strongFocus','clickToRead','simpleLayout'].forEach(function(k){if(p[k])add.push('a11y-'+k.replace(/[A-Z]/g,function(c){return '-'+c.toLowerCase()}))});
    if(add.length)add.push('a11y-on');
    root.className=keep.concat(add).join(' ');
    root.style.setProperty('--a11y-zoom',String(Math.max(1,Math.min(2,(Number(p.textScale)||100)/100))));
    if(p.colorFilter&&MATRIX[p.colorFilter]){if(document.body)ensureFilters();else document.addEventListener('DOMContentLoaded',ensureFilters,{once:true})}
    try{localStorage.setItem('m2-caption-size',String(p.captionSize||0))}catch(e){}
    if(p.contrast==='dark'||p.contrast==='yellow'){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content','#000000')}
    return p;
  }
  var listeners=[];
  var api={
    defaults:DEF,
    get:function(){return merged(read())},
    apply:apply,
    set:function(prefs,opts){var p=merged(prefs);try{localStorage.setItem(KEY,JSON.stringify(p));if(!(opts&&opts.fromServer))localStorage.setItem(KEY+'-at',String(Date.now()))}catch(e){}apply(p);if(!(opts&&opts.silent))listeners.forEach(function(fn){try{fn(p)}catch(e){}});return p},
    onChange:function(fn){listeners.push(fn)},
    changedAt:function(){try{return Number(localStorage.getItem(KEY+'-at'))||0}catch(e){return 0}},
    reduceMotion:function(){return merged(read()).reduceMotion||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)}
  };
  window.HxA11y=api;
  apply(read());
})();
