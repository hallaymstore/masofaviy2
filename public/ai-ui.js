// HALLAYM EDU — compact draggable Groq assistant and dedicated AI workspace.
const MODES=[
  ["chat","Savol-javob"],["explain","Mavzuni tushuntirish"],["summarize","Qisqa xulosa"],
  ["simplify","Soddalashtirish"],["video","Videodars haqida"],["library","Kitob / matn izohi"],
  ["lab","Laboratoriya"],["translate","Tarjima"],["plan","O‘qish rejasi"],
  ["lesson","80 daqiqalik dars rejasi",true],["quiz","Test savollari",true],
  ["outline","Taqdimot rejasi",true],["feedback","Fikr-mulohaza",true]
];
const SOURCE_TARGETS={
  courses:"#courseDetail",videos:"#videoLessons",videoWatch:".watch-info",
  library:"#library",myBooks:"#myBooks",lab:"#labRoot",inclusion:"#inclusion"
};
const $=(sel,root=document)=>root.querySelector(sel);
const make=(tag,classes,text)=>{const node=document.createElement(tag);node.className=classes||"";if(text)node.textContent=text;return node;};
export function createAiUi({api,currentUser,onGo,voice}={}){
  let float=null,panel=null,aiPage=null,nav=null,history=[],ready=false,busy=false,teacher=false;
  let remaining=null,providerModel="",lastContentPage="courses",dragged=false,readReplies=false;
  const currentPage=()=>document.documentElement.dataset.page||"dashboard";
  const exam=()=>["finalExams","remoteExams","exam"].includes(currentPage());
  const menu=()=>MODES.filter(m=>!m[2]||teacher);
  const template=full=>'<div class="hai-top"><span class="hai-star">✦</span><div><b>HALLAYM AI</b><small class="hai-status">Groq tekshirilmoqda…</small></div>'+
    '<button type="button" class="hai-reset" title="Suhbatni tozalash" aria-label="Suhbatni tozalash">↻</button>'+
    (!full?'<button type="button" class="hai-expand" title="AI markaziga o‘tish" aria-label="AI markaziga o‘tish">⤢</button><button type="button" class="hai-hide" title="Yopish" aria-label="Yopish">×</button>':'')+'</div>'+
    '<div class="hai-intro"><b>'+(teacher?"O‘qituvchi yordamchisi":"Talaba yordamchisi")+'</b>'+
    '<span>'+(teacher?"Dars rejalari, savollar, konspekt va topshiriqlarni tez tayyorlang.":"Mavzuni tushuning, matnni qisqartiring va mustaqil o‘rganing.")+'</span></div>'+
    '<div class="hai-quick"><button type="button" data-mode="explain">Tushuntirish</button><button type="button" data-mode="summarize">Xulosa</button>'+
    (teacher?'<button type="button" data-mode="lesson">Dars rejasi</button><button type="button" data-mode="quiz">Test</button>':'<button type="button" data-mode="plan">O‘qish rejasi</button>')+'</div>'+
    '<div class="hai-history" role="log" aria-live="polite" aria-label="AI suhbat tarixi"></div>'+
    '<form class="hai-form"><label>Amal turi<select class="hai-mode">'+menu().map(m=>'<option value="'+m[0]+'">'+m[1]+'</option>').join("")+'</select></label>'+
    '<label>Material (ixtiyoriy)<textarea class="hai-context" rows="2" maxlength="6500" placeholder="Xulosa uchun matnni kiriting yoki tanlangan matnni oling"></textarea></label>'+
    '<div class="hai-gettext"><button type="button" class="hai-selected">Belgilangan matn</button><button type="button" class="hai-frompage">Sahifadan olish</button></div>'+
    '<label class="hai-prompt-label">Savolingiz<textarea class="hai-prompt" rows="2" maxlength="4000" placeholder="Savol yoki mavzu yozing…"></textarea></label>'+
    '<div class="hai-voicebar" role="group" aria-label="Ovozli AI yordamchi">'+
    '<button type="button" class="hai-voice-ask" title="Gapirib AI’dan so‘rang yoki ovozli buyruq bering">🎙 Gapirib so‘rash</button>'+
    '<button type="button" class="hai-voice-command" title="Platformani ovoz bilan boshqarish">🧭 Buyruq berish</button>'+
    '<button type="button" class="hai-voice-read" title="Oxirgi AI javobini o‘qish">🔊 O‘qib berish</button>'+
    '<label class="hai-voice-option"><input type="checkbox" class="hai-read-aloud"> Javobni ovozda o‘qish</label>'+
    '<label class="hai-voice-option"><input type="checkbox" class="hai-hands"> Doimiy tinglash</label>'+
    '<small class="hai-voice-state" role="status">Mikrofon tayyor · Alt+V</small></div>'+
    '<div class="hai-footer"><span class="hai-remaining">Kunlik limit: —</span><button class="hai-submit" type="submit">Yuborish ↗</button></div></form>';
  const containers=()=>[panel,aiPage].filter(Boolean);
  function renderHistory(){
    containers().forEach(root=>{
      const wrap=$(".hai-history",root);if(!wrap)return;
      wrap.replaceChildren();
      if(!history.length){const empty=make("div","hai-empty","HALLAYM AI tayyor. Savolingizni yozing yoki tezkor amalni tanlang.");wrap.appendChild(empty);}
      for(const item of history){
        const bubble=make("div","hai-message "+(item.role==="user"?"hai-user":"hai-answer"));
        bubble.appendChild(make("b","",item.role==="user"?"Siz":"✦ HALLAYM AI"));
        const text=make("div","hai-text",item.content);bubble.appendChild(text);
        if(item.role==="assistant"){
          const copy=make("button","hai-copy","Nusxalash");copy.type="button";
          copy.onclick=()=>navigator.clipboard?.writeText(item.content).catch(()=>{});
          bubble.appendChild(copy);
        }
        wrap.appendChild(bubble);
      }
      wrap.scrollTop=wrap.scrollHeight;
      const voiceState=voice?.listenState?.()||{};
       $(".hai-voice-state",root).textContent=voiceState.error||({listening:"Tinglayapman…",starting:"Mikrofon ulanmoqda…",retrying:"Qayta ulanmoqda…" }[voiceState.state]||"Ovozli boshqaruv · Alt+V");
       $(".hai-read-aloud",root).checked=readReplies;
       $(".hai-hands",root).checked=Boolean(voice?.enabled?.()&&voice?.handsFree?.());
       const blocked=busy;
      $(".hai-submit",root).disabled=blocked;
      $(".hai-submit",root).textContent=busy?"Javob tayyorlanmoqda…":"Yuborish ↗";
       $(".hai-submit",root).title=ready?"Groq AI javobini olish":"AI ulanmagan bo‘lsa, tugma ulanish holatini qayta tekshiradi";
      $(".hai-remaining",root).textContent="Kunlik qolgan: "+(remaining==null?"—":remaining);
      $(".hai-status",root).textContent=ready?"Groq · "+providerModel:"Groq API hali sozlanmagan";
    });
  }
  function inform(text){
    history.push({role:"assistant",content:text});if(history.length>18)history.shift();renderHistory();
  }
  async function refreshStatus(){
    try{const result=await api("/ai/status");ready=!!result.enabled;providerModel=result.model||"";remaining=result.remaining??null;}
    catch{ready=false;remaining=null;}
    renderHistory();
  }
  function takeSelection(root){
    const text=String(window.getSelection?.()?.toString()||"").trim();
    if(!text){inform("Matnni oldin belgilab oling, so‘ng ushbu tugmani bosing.");return;}
    $(".hai-context",root).value=text.slice(0,6500);
  }
  function takePage(root){
    const pageName=currentPage()==="ai"?lastContentPage:currentPage();
    const target=SOURCE_TARGETS[pageName];
    if(!target){inform("Bu sahifadan matn olish mavjud emas. Materialni qo‘lda joylang.");return;}
    const elem=$(target),content=(elem?.innerText||"").trim();
    if(!content){inform("Sahifada olinadigan matn topilmadi. Materialni kiriting.");return;}
    $(".hai-context",root).value=content.slice(0,6500);
    inform("Sahifadan matn olindi. AI'ga yuborishdan oldin materialni tekshiring.");
  }
  async function send(root){
    if(busy)return;
    const mode=$(".hai-mode",root).value,source=$(".hai-context",root).value.trim();
    let prompt=$(".hai-prompt",root).value.trim();
    if(!prompt){prompt=mode==="summarize"?"Ushbu matnni qisqacha va tushunarli xulosa qil.":mode==="simplify"?"Ushbu matnni talaba uchun soddalashtir.":"";}
    if(!prompt){$(".hai-prompt",root).focus();return;}
    if(!source&&["summarize","simplify","video","library","feedback","translate"].includes(mode)){
      inform("Bu amal uchun matn yoki konspekt kerak. Material maydoniga qo‘ying.");return;
    }
    if(!ready){
      await refreshStatus();
      if(!ready){inform("Groq AI hali serverda ishga tushmagan. Administrator GROQ_API_KEY ni yangilab, LMS xizmatini qayta ishga tushirishi kerak. Savolingiz saqlandi, keyin Yuborish tugmasini qayta bosing.");return;}
    }
    const pageName=currentPage()==="ai"?lastContentPage:currentPage();
    const conversation=history.filter(m=>m.role==="user"||m.role==="assistant").slice(-6);
    busy=true;
    history.push({role:"user",content:prompt});renderHistory();
    try{
      const result=await api("/ai/chat",{method:"POST",body:JSON.stringify({mode,prompt,page:pageName,context:source,history:conversation})});
      const answer=String(result.answer||"Javob bo‘sh.");
       history.push({role:"assistant",content:answer});
       if(readReplies&&voice?.say)void voice.say(answer.slice(0,2400));
      remaining=remaining==null?null:Math.max(0,remaining-1);
      $(".hai-prompt",root).value="";
    }catch(error){
      history.push({role:"assistant",content:error?.message||"So‘rov bajarilmadi."});
      if(error?.status===429)void refreshStatus();
    }finally{busy=false;if(history.length>18)history=history.slice(-18);renderHistory();}
  }
  function bindView(root){
    $(".hai-form",root).onsubmit=e=>{e.preventDefault();void send(root);};
    $(".hai-reset",root).onclick=()=>{history=[];renderHistory();};
    $(".hai-selected",root).onclick=()=>takeSelection(root);
    $(".hai-frompage",root).onclick=()=>takePage(root);
    $(".hai-voice-ask",root).onclick=()=>{
      const started=voice?.captureForAi?.(async text=>{
        $(".hai-prompt",root).value=text;
        renderHistory();
        await send(root);
      });
      if(!started)inform("Mikrofon ishga tushmadi. Chrome/Edge va brauzerdagi mikrofon ruxsatini tekshiring.");
      renderHistory();
    };
    $(".hai-voice-command",root).onclick=()=>{
      voice?.commandOnce?.();renderHistory();
    };
    $(".hai-voice-read",root).onclick=()=>{
      const answer=[...history].reverse().find(item=>item.role==="assistant"&&item.content);
      if(answer)void voice?.say?.(answer.content.slice(0,2400));
      else inform("Avval AI'dan javob oling.");
    };
    $(".hai-read-aloud",root).onchange=event=>{readReplies=Boolean(event.target.checked);renderHistory();};
    $(".hai-hands",root).onchange=event=>{voice?.setHandsFree?.(event.target.checked);renderHistory();};
    root.querySelectorAll("[data-mode]").forEach(btn=>btn.onclick=()=>{
      $(".hai-mode",root).value=btn.dataset.mode;
      $(".hai-prompt",root).focus();
    });
    $(".hai-expand",root)?.addEventListener("click",()=>{closePanel();onGo("ai");renderHistory();});
    $(".hai-hide",root)?.addEventListener("click",closePanel);
  }
  function inlineActions(){
    const locations=[
      ["courses","Fan bo‘yicha AI","explain"],
      ["videoWatch","Videodars AI","video"],
      ["videos","Videodarslar AI","explain"],
      ["library","Kutubxona AI","library"],
      ["myBooks","Kitob yordamchisi","library"],
      ["lab","Laboratoriya AI","lab"],
      ["inclusion","AI yordamchi","explain"]
    ];
    for(const [id,label,mode] of locations){
      const section=document.getElementById(id);
      if(!section||section.querySelector(".hai-inline"))continue;
      const header=section.querySelector(".page-head,.video-watch-head");
      if(!header)continue;
      const btn=make("button","hai-inline","✦ "+label);
      btn.type="button";
      btn.onclick=()=>{
        lastContentPage=id;
        openPanel();
        if(panel?.hidden)return;
        $(".hai-mode",panel).value=mode;
        const source=$(SOURCE_TARGETS[id]);
        $(".hai-context",panel).value=String(source?.innerText||"").trim().slice(0,6500);
        $(".hai-prompt",panel).placeholder=id==="videoWatch"?"Video haqidagi mavjud matnni tushuntir. Video transkriptini joylasangiz aniq xulosa qilaman.":"Ushbu materialni sodda tushuntir";
        $(".hai-prompt",panel).focus();
      };
      header.appendChild(btn);
    }
  }
  function mount(){
    if(float)return;
    const main=$("#main"),sidebar=$("#sidebar nav");
    if(!main||!sidebar)return;
    aiPage=make("section","page hai-page");
    aiPage.id="ai";
    aiPage.innerHTML='<div class="hai-page-title"><h1>✦ HALLAYM AI</h1><p>O‘qish va dars tayyorlashga yordam beruvchi sun’iy intellekt markazi</p></div><div class="hai-workspace">'+template(true)+'</div>';
    main.appendChild(aiPage);
    nav=make("button","hai-nav","✦ HALLAYM AI");
    nav.type="button";nav.dataset.page="ai";
    const dashboard=sidebar.querySelector('button[data-page="dashboard"]');
    dashboard?.insertAdjacentElement("afterend",nav);
    nav.onclick=()=>{onGo("ai");renderHistory();};
    float=make("div","hai-floating");float.id="haiFloating";
    float.innerHTML='<button class="hai-bubble" type="button" aria-label="HALLAYM AI yordamchini ochish" aria-expanded="false" title="AI yordamchi (surib joyini o‘zgartirish mumkin)"><span>✦</span><small>AI</small></button>';
    panel=make("aside","hai-panel");panel.id="haiPanel";panel.hidden=true;panel.innerHTML=template(false);
    document.body.append(float,panel);
    bindView(aiPage);bindView(panel);bindDrag();
    const saved=(()=>{try{return JSON.parse(sessionStorage.getItem("hai-pos")||"null");}catch{return null;}})();
    if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))place(saved.x,saved.y);
    window.addEventListener("resize",()=>{const rect=float.getBoundingClientRect();place(rect.left,rect.top);positionPanel();});
    document.addEventListener("hx:navigate",event=>{
      const destination=event.detail?.page||currentPage();
      if(destination!=="ai")lastContentPage=destination;
      closePanel();inlineActions();syncVisibility();renderHistory();
    });
    inlineActions();syncVisibility();renderHistory();
    document.addEventListener("hx:voice-state",renderHistory);
  }
  function place(x,y){
    if(!float)return;
    float.style.left=Math.max(8,Math.min(window.innerWidth-(float.offsetWidth||58)-8,x))+"px";
    float.style.top=Math.max(8,Math.min(window.innerHeight-(float.offsetHeight||58)-8,y))+"px";
    float.style.right="auto";float.style.bottom="auto";
  }
  function bindDrag(){
    const button=$(".hai-bubble",float);
    let start=null;
    button.addEventListener("pointerdown",event=>{
      if(event.button!==0)return;
      start={x:event.clientX,y:event.clientY,left:float.getBoundingClientRect().left,top:float.getBoundingClientRect().top};
      dragged=false;button.setPointerCapture?.(event.pointerId);
    });
    button.addEventListener("pointermove",event=>{
      if(!start)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;
      if(Math.hypot(dx,dy)>6)dragged=true;
      if(dragged){place(start.left+dx,start.top+dy);positionPanel();}
    });
    const stop=()=>{
      if(!start)return;start=null;
      if(dragged)sessionStorage.setItem("hai-pos",JSON.stringify({x:float.getBoundingClientRect().left,y:float.getBoundingClientRect().top}));
    };
    button.addEventListener("pointerup",stop);button.addEventListener("pointercancel",stop);
    button.addEventListener("click",event=>{
      if(dragged){event.preventDefault();dragged=false;return;}
      if(panel.hidden)openPanel();else closePanel();
    });
  }
  function positionPanel(){
    if(!panel||panel.hidden)return;
    const rect=float.getBoundingClientRect(),w=Math.min(395,window.innerWidth-16),h=Math.min(620,window.innerHeight-28);
    let x=rect.left+rect.width>w?rect.right-w:rect.left;
    let y=rect.bottom+12;
    if(y+h>window.innerHeight-8)y=Math.max(8,rect.top-h-12);
    panel.style.left=Math.max(8,Math.min(window.innerWidth-w-8,x))+"px";
    panel.style.top=y+"px";
    panel.style.right="auto";panel.style.bottom="auto";
  }
  function openPanel(){
    if(!panel||exam())return;
    panel.hidden=false;$(".hai-bubble",float).setAttribute("aria-expanded","true");
    positionPanel();renderHistory();$(".hai-prompt",panel)?.focus();
  }
  function closePanel(){
    if(!panel)return;panel.hidden=true;
    $(".hai-bubble",float)?.setAttribute("aria-expanded","false");
  }
  function syncVisibility(){
    if(!float)return;
    const hidden=!currentUser()||exam()||currentPage()==="login";
    float.hidden=hidden;
    nav.hidden=hidden;
    if(hidden)closePanel();
  }
  async function afterLogin(){
    teacher=["teacher","admin","superadmin","tech","rectorate","dean","department","tutor"].includes(currentUser()?.role);
    mount();
    // Rebuild role-specific controls if switching accounts in the same browser session.
    containers().forEach(root=>{
      const parent=root===aiPage?$(".hai-workspace",root):root;
      parent.innerHTML=template(root===aiPage);
      bindView(root);
    });
    syncVisibility();renderHistory();await refreshStatus();
  }
  function afterLogout(){
    history=[];ready=false;remaining=null;readReplies=false;closePanel();
    if(float)float.hidden=true;if(nav)nav.hidden=true;
  }
  return {afterLogin,afterLogout,open:openPanel,refreshStatus};
}
