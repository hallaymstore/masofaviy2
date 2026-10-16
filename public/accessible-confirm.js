// Native confirm blocks recognition callbacks. Voice mode uses a keyboard-accessible modal.
export function askConfirmation(message){
  if(!window.HxA11y?.get?.().voiceAssistant)return Promise.resolve(window.confirm(message));
  // Do not stack account/lesson requests over an unanswered confirmation.
  if(document.querySelector('dialog[data-va-confirm][open]'))return Promise.resolve(false);
  return new Promise(resolve=>{
    const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='va-confirm';dialog.dataset.vaConfirm='';
    dialog.setAttribute('aria-label','Amalni tasdiqlash');
    const text=document.createElement('p');text.textContent=message;
    const hint=document.createElement('p');hint.textContent='«Ha» yoki «yo‘q» deng. Klaviaturada Tab va Enter ham ishlaydi.';
    const yes=document.createElement('button'),no=document.createElement('button');yes.type=no.type='button';yes.textContent='Ha, tasdiqlayman';no.textContent='Yo‘q, bekor qilish';yes.dataset.vaAnswer='yes';no.dataset.vaAnswer='no';
    let done=false;
    const finish=accepted=>{if(done)return;done=true;dialog.close();dialog.remove();document.removeEventListener('hx:navigate',cancel);document.removeEventListener('hx:voice-logout',cancel);try{previous?.focus()}catch{}resolve(accepted)};
    const cancel=()=>finish(false);
    yes.onclick=()=>finish(true);no.onclick=cancel;
    dialog.addEventListener('cancel',e=>{e.preventDefault();cancel()});dialog.addEventListener('close',()=>{if(!done)cancel()});
    document.addEventListener('hx:navigate',cancel);document.addEventListener('hx:voice-logout',cancel);
    dialog.append(text,hint,no,yes);document.body.append(dialog);dialog.showModal();no.focus();
    document.dispatchEvent(new CustomEvent('hx:confirmation',{detail:{message:String(message)}}));
  });
}
