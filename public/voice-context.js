import {controlScope,controlLabel,isVisible} from './voice-controls.js';
import {normalize,spokenNumber} from './voice-commands.js';
import {parseContextCommand,resolveContextTargets,tokenScore} from './voice-context-rules.js';

const hidden='[hidden],.hidden,[aria-hidden="true"],[inert]';
const roles=[
  ['.video-course-path','course','.video-course-path-head h2'],['.learning-module','module','.learning-module-head b'],
  ['details[data-topic]','topic',':scope>summary .course-topic-title b'],['.learning-topic','video','.learning-topic-main h3'],
  ['.video-card','video','.video-card-body h2'],['.related-card','video','b'],['.tg-course-row','course','h2'],
  ['.course-topic-item','resource','.course-topic-item-copy strong'],['.mb-book','book','.mb-info h3'],
  ['.library-category-tile','category','b'],['.library-book-card','book','h3'],['.library-card','book','h2,h3,b'],['.lesson-row','item','h2,h3,b,strong'],
  ['.ux-ucard','item','.ux-ub b'],['article[data-search-item]','item','h2,h3,strong']
];
const selector=roles.map(r=>r[0]).join(',');
const clicks='button,a[href],summary,[role="button"],[role="tab"]';
const compact=text=>String(text||'').replace(/\s+/g,' ').trim();
function availableInTree(element,root){
  if(!element?.isConnected||!root.contains(element)||element.closest(hidden)||element.closest('#vaDock'))return false;
  if(isVisible(element))return true;
  // Closed <details> content can be reached by opening its summary. Other hidden UI stays inaccessible.
  if(!element.closest('details:not([open])'))return false;
  for(let node=element;node&&node!==root.parentElement;node=node.parentElement)if(getComputedStyle(node).display==='none'||getComputedStyle(node).visibility==='hidden')return false;
  return true;
}
function textOf(element){const clone=element.cloneNode(true);clone.querySelectorAll('script,style,input,textarea,select,[hidden],.hidden,[aria-hidden="true"],#vaDock').forEach(n=>n.remove());return compact(clone.textContent).slice(0,1400)}
function primary(container,kind){
  const candidates=[...container.querySelectorAll(clicks)].filter(b=>b.closest(selector)===container);
  if(container.matches('button,a,summary,[role="button"]'))candidates.unshift(container);
  const preferred={video:'[data-video-play],[data-topic-video]',course:'[data-course]',topic:':scope>summary',book:'[data-listen],[data-library-detail]',resource:'[data-topic-video],[data-assignment],[data-quiz],[data-quiz-review],a[href]'}[kind];
  return (preferred&&container.querySelector(preferred))||candidates.find(b=>!/ochir|arxiv|tahrir|qosh|biriktir/.test(normalize(controlLabel(b))))||null;
}
function kindFor(container,base){
  if(base!=='resource')return base;
  if(container.querySelector('[data-assignment]'))return 'assignment';
  if(container.querySelector('[data-quiz],[data-quiz-review]'))return 'quiz';
  if(container.querySelector('[data-topic-video]'))return 'video';
  return base;
}
export function contextActionLabel(element){
  const label=controlLabel(element),container=element.closest(selector);
  if(!container||container===element)return label;
  const spec=roles.find(([s])=>container.matches(s)),title=compact(spec&&container.querySelector(spec[2])?.textContent);
  return title&&!normalize(label).includes(normalize(title))?title+' — '+label:label;
}
export function createVoiceContext(){
  let anchor=null,last=null,choices=null;const ids=new WeakMap();let serial=0;
  const key=element=>{if(!ids.has(element))ids.set(element,'node-'+(++serial));return ids.get(element)};
  function snapshot(){
    const root=controlScope(),records=[];
    for(const container of root.querySelectorAll(selector)){
      if(!availableInTree(container,root))continue;
      const spec=roles.find(([s])=>container.matches(s)),kind=kindFor(container,spec[1]),title=compact(container.querySelector(spec[2])?.textContent||controlLabel(container));
      if(!title)continue;
      const element=primary(container,kind),source=element?.dataset.videoPlay||element?.dataset.topicVideo||element?.dataset.listen||element?.dataset.libraryDetail||container.dataset.topic;
      const id=source?kind+':'+source:key(container);
      const course=compact(container.closest('.video-course-path')?.querySelector('.video-course-path-head h2')?.textContent||container.querySelector('.video-card-top>span')?.textContent||'');
      const module=compact(container.closest('.learning-module')?.querySelector('.learning-module-head b')?.textContent||[...container.querySelectorAll('.video-tags span')].find(s=>/modul/i.test(s.textContent))?.textContent||'');
      const parentTopics=[...function*(el){for(let node=el.parentElement;node&&node!==root;node=node.parentElement)if(node.matches(selector))yield node}(container)];
      const path=parentTopics.reverse().map(node=>{const s=roles.find(([q])=>node.matches(q));return compact(node.querySelector(s[2])?.textContent)}).filter(Boolean).concat(course,module).join(' / ');
      const order=compact(container.querySelector('.learning-topic-order,.course-topic-number')?.textContent||'');
      const number=Number(order)||Number(normalize(title).match(/^(\d+)\s*-?\s*(?:mavzu|modul)/)?.[1])||null;
      const blocked=Boolean(element?.disabled||element?.getAttribute('aria-disabled')==='true'||container.classList.contains('is-locked'));
      const record={id,kind,title,path,course,module,number,text:textOf(container),element,container,ancestorIds:[],blocked,reason:element?.title||'Bu amal hozir faol emas.'};
      const old=records.findIndex(r=>r.id===id);
      if(old>=0){if(container.matches('.learning-topic'))records[old]=record}else records.push(record);
    }
    for(const record of records)record.ancestorIds=records.filter(r=>r!==record&&r.container.contains(record.container)).map(r=>r.id);
    // Index every remaining action, with nearby headings/labels as its context.
    for(const element of root.querySelectorAll(clicks)){
      if(!availableInTree(element,root)||records.some(r=>r.element===element))continue;
      const container=element.closest(selector)||element.closest('article,li,tr,fieldset,section,form')||element.parentElement;
      const own=compact(controlLabel(element));if(!own)continue;
      const parent=records.find(r=>r.container===container),kind=element.matches('[data-video-checkpoint],[data-quiz],[data-quiz-review],#watchCheckpointQuiz')?'quiz':element.matches('[data-assignment],[data-coursework-answer]')?'assignment':'action';
      records.push({id:key(element),kind,title:own,path:parent?[parent.path,parent.title].filter(Boolean).join(' / '):compact(container?.querySelector('h1,h2,h3,legend')?.textContent),text:container?textOf(container):own,element,container,course:parent?.course||'',module:parent?.module||'',ancestorIds:records.filter(r=>r.element!==element&&r.container.contains(element)).map(r=>r.id),blocked:Boolean(element.disabled||element.getAttribute('aria-disabled')==='true'),reason:element.title||'Tugma hozir faol emas.',number:null});
    }
    return {root,records};
  }
  function resolve(intent){const view=snapshot();const result=resolveContextTargets(intent,view.records,{anchor,last});return {...result,root:view.root}}
  function select(record){anchor=record;last=record;choices=null}
  function rememberChoices(result,intent){choices={root:result.root,intent,items:result.candidates.map(r=>({id:r.id,title:r.title,path:r.path})),until:Date.now()+90000}}
  function answer(raw){
    if(!choices||Date.now()>choices.until||controlScope()!==choices.root){choices=null;return null}
    const view=snapshot(),available=choices.items.map(item=>view.records.find(r=>r.id===item.id&&r.title===item.title&&r.path===item.path)).filter(Boolean);
    if(available.length!==choices.items.length){choices=null;return {status:'stale'}}
    const number=spokenNumber(normalize(raw).replace(/^(?:yordamchi|madina|sardor)\s+/,'').replace(/\s+(?:dengani|dagisi|ni och|och|kir)$/,''));
    let matches=number!==null?(available[number-1]?[available[number-1]]:[]):available.filter(r=>tokenScore(raw,r.title+' '+r.path)>.86);
    if(matches.length!==1)return {status:matches.length?'ambiguous':'unanswered',candidates:matches.length?matches:available,root:view.root,intent:choices.intent};
    return {status:matches[0].blocked?'blocked':'matched',target:matches[0],candidates:matches,root:view.root,intent:choices.intent};
  }
  function reveal(record){
    const root=controlScope();if(!availableInTree(record.container,root))return false;
    const parents=[];for(let node=record.container;node&&node!==root;node=node.parentElement)if(node.matches('details'))parents.push(node);
    parents.reverse().forEach(node=>{node.open=true});record.container.scrollIntoView({block:'center'});return true;
  }
  return {snapshot,resolve,select,rememberChoices,answer,reveal,parse:parseContextCommand,hasChoices:()=>Boolean(choices),clearChoices:()=>{choices=null},reset:({forget=false}={})=>{anchor=null;choices=null;if(forget)last=null},last:()=>last};
}
