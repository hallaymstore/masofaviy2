import {labelScore,spokenNumber,normalize} from './voice-commands.js';
export function isVisible(el){return Boolean(el?.isConnected&&!el.closest('[hidden],.hidden,[aria-hidden="true"],[inert]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')}
export function controlScope(){return [...document.querySelectorAll('dialog[open],.hxa-panel,.ux-sheet[role="dialog"],.modal:not(.hidden)')].filter(isVisible).at(-1)||[...document.querySelectorAll('#main>.page.active,#login:not(.hidden)')].find(isVisible)||document.body}
export function controlLabel(el){
  const labelled=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>document.getElementById(id)?.textContent||'').join(' ');
  const label=el.getAttribute('aria-label')||labelled||[...(el.labels||[])].map(l=>{const copy=l.cloneNode(true);copy.querySelectorAll('input,select,textarea,small').forEach(n=>n.remove());return copy.textContent}).join(' ')||el.getAttribute('title')||el.textContent||el.placeholder||el.name||'';
  return label.replace(/\s+/g,' ').trim().slice(0,160);
}
export function actions(root=controlScope()){return [...root.querySelectorAll('button,a[href],summary,[role="button"],[role="tab"],input[type="checkbox"],input[type="radio"]')].filter(el=>isVisible(el)&&!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&!el.closest('#vaDock'))}
export function fields(root=controlScope()){return [...root.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea,[contenteditable="true"]')].filter(el=>isVisible(el)&&!el.disabled&&!el.readOnly&&!el.closest('#vaDock'))}
export function findControl(query,list){
  const number=spokenNumber(query);if(number!==null)return list[number-1]?{element:list[number-1],ambiguous:false}:null;
  const ranked=list.map(element=>({element,score:labelScore(query,controlLabel(element))})).filter(x=>x.score>=.8).sort((a,b)=>b.score-a.score);
  if(!ranked.length)return null;
  return {...ranked[0],ambiguous:Boolean(ranked[1]&&ranked[0].score-ranked[1].score<.06)};
}
export function indexedActions(kind){
  const root=controlScope(),selectors={kitob:'[data-listen],[data-library-detail]',video:'[data-video-play]',fan:'[data-course]'};
  return selectors[kind]?[...root.querySelectorAll(selectors[kind])].filter(el=>isVisible(el)&&!el.disabled):actions(root);
}
export function writeField(el,value){
  if(!el||!fields().includes(el))return {ok:false,message:'Avval maydonni tanlang. «Maydonlarni ayt» deng.'};
  if(el.type==='password'||el.autocomplete==='one-time-code')return {ok:false,message:'Maxfiy maydonni klaviatura yoki ekran o‘qish dasturi orqali to‘ldiring.'};
  if(el.type==='file')return {ok:false,message:'Fayl tanlash oynasi ochiladi. Qurilmangizning fayl tanlash boshqaruvidan foydalaning.'};
  if(el.tagName==='SELECT'){
    const options=[...el.options].filter(o=>!o.disabled),number=spokenNumber(value);
    const matches=options.filter(o=>normalize(o.textContent)===normalize(value)||normalize(o.value)===normalize(value));
    const option=matches.length===1?matches[0]:number!==null?options[number-1]:null;
    if(!option)return {ok:false,message:'Variant topilmadi. Mavjud variantlar: '+options.slice(0,12).map((o,i)=>(i+1)+'. '+o.textContent).join('. ')};
    el.value=option.value;
  }else if(['checkbox','radio'].includes(el.type)){const checked=!/^(yoq|ochir|bekor)$/i.test(normalize(value));if(el.checked!==checked)el.click();return {ok:true,message:controlLabel(el)+(checked?' tanlandi.':' bekor qilindi.')}}
  else if(el.isContentEditable)el.textContent=value;
  else{
    const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;setter?setter.call(el,String(value)):el.value=String(value);
  }
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  return {ok:true,message:controlLabel(el)+' maydoni to‘ldirildi.'};
}
export function isSensitiveAction(el){return /(?:ochir|arxiv|yubor|saqla|tasdiq|yakunla|boshlash|chiqish|parol|tolov)/.test(normalize(controlLabel(el)))||Boolean(el.form&&el.type==='submit')}
