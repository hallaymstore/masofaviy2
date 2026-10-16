// Single recognition session with bounded retries. Late events cannot restart a stopped mic.
export function createRecognition({factory,onResult=()=>{},onState=()=>{},onError=()=>{},canListen=()=>true,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let wanted=false,suspended=false,current=null,timer=null,version=0,failures=0;
  const available=()=>typeof factory==='function';
  function clear(){clearTimer(timer);timer=null}
  function schedule(delay=250){clear();if(wanted&&!suspended&&canListen())timer=setTimer(startSession,delay)}
  function startSession(){
    clear();if(!wanted||suspended||current||!canListen())return;
    if(!available()){wanted=false;onState('unsupported');onError('Bu brauzer ovozni aniqlamaydi. Chrome yoki Edge orqali oching. Tugmalar va yozma buyruq ishlaydi.','unsupported');return}
    const generation=version;let recognition;
    try{recognition=factory();current=recognition;recognition.lang='uz-UZ';recognition.continuous=true;recognition.interimResults=false;recognition.maxAlternatives=5;
      recognition.onstart=()=>{if(generation===version&&wanted)onState('listening')};
      recognition.onresult=event=>{
        if(generation!==version||!wanted||suspended)return;failures=0;
        for(let i=event.resultIndex||0;i<event.results.length;i++)if(event.results[i].isFinal!==false){const alternatives=Array.from(event.results[i]).map(x=>x.transcript).filter(Boolean);if(alternatives.length)onResult(alternatives)}
      };
      let retryDelay=250;
      recognition.onerror=event=>{
        if(generation!==version||!wanted)return;
        const code=event.error||'unknown';
        if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(code)){
          wanted=false;onState('blocked');onError(code==='audio-capture'?'Mikrofon topilmadi. Qurilma mikrofonini tekshiring.':code==='language-not-supported'?'Brauzer o‘zbekcha ovozni aniqlashni qo‘llamayapti. Boshqa Chrome yoki Edge brauzerini sinang.':'Mikrofonga ruxsat kerak. Brauzerda ruxsat bering, keyin Boshlash tugmasini bosing.',code);
        }else if(!['no-speech','aborted'].includes(code)){
          failures++;retryDelay=Math.min(15000,1000*2**failures);onState('retrying');
          if(failures===1)onError('Ovozni aniqlash aloqasi uzildi. Qayta ulanmoqda.',code);
          if(failures>=4){wanted=false;onState('blocked');onError('Ovozni aniqlashga ulanib bo‘lmadi. Internetni tekshirib, Boshlash tugmasini bosing.',code)}
        }
      };
      recognition.onend=()=>{if(current===recognition)current=null;if(generation===version&&wanted)schedule(retryDelay)};
      onState('starting');recognition.start();
    }catch(e){if(current===recognition)current=null;wanted=false;onState('blocked');onError('Mikrofonni boshlash uchun Boshlash tugmasini bosing.',e.name)}
  }
  function stop(){wanted=false;version++;clear();const old=current;current=null;try{old?.abort()}catch{}onState('paused')}
  function start(){if(wanted&&current)return;wanted=true;failures=0;version++;const old=current;current=null;try{old?.abort()}catch{}startSession()}
  function suspend(value){if(suspended===Boolean(value))return;suspended=Boolean(value);version++;clear();const old=current;current=null;try{old?.abort()}catch{}if(!suspended)schedule();else if(wanted)onState('waiting')}
  return {start,stop,suspend,available,isWanted:()=>wanted,isListening:()=>Boolean(current)&&wanted&&!suspended,destroy:stop};
}
