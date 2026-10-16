// Authenticated, bounded speech synthesis. Azure is preferred when configured;
// Edge Read Aloud supplies the same Uzbek voices without a subscription key.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {VOICES,VOICE_NAMES,LANGS,MAX_CHUNK,buildSsml,voiceFor,speakable,ratePct} from './tts-rules.js';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const error=(message,status=502)=>Object.assign(new Error(message),{status});

export function installTts(app,{auth,env=process.env,fetchImpl=globalThis.fetch,edgeImpl,now=()=>Date.now()}={}){
  const key=String(env.AZURE_SPEECH_KEY||'').trim();
  const region=String(env.AZURE_SPEECH_REGION||'').trim();
  if(region&&!/^[a-z0-9-]+$/.test(region))throw new Error('AZURE_SPEECH_REGION noto‘g‘ri');
  const provider=env.TTS_PROVIDER||((key&&region)?'azure':'edge');
  if(!['azure','edge','browser'].includes(provider))throw new Error('TTS_PROVIDER: azure, edge yoki browser');
  const enabled=provider!=='browser'&&(provider!=='azure'||Boolean(key&&region));
  const cacheDir=path.resolve(env.TTS_CACHE_DIR||'data/tts-cache');
  const cacheLimit=Math.max(1,Number(env.TTS_CACHE_MB)||256)*1024*1024;
  const dailyChars=Math.max(1,Number(env.TTS_DAILY_CHARS)||300000);
  const usage=new Map(),pending=new Map(),waiters=[];
  let active=0,writes=0;
  async function acquire(){
    if(active<4){active++;return}
    if(waiters.length>=24)throw error('Ovoz xizmati band. Birozdan so‘ng qayta bosing.',503);
    await new Promise(resolve=>waiters.push(resolve));
  }
  function release(){const next=waiters.shift();if(next)next();else active--}
  async function trimCache(){
    try{
      const files=await Promise.all((await fs.readdir(cacheDir)).filter(f=>f.endsWith('.mp3')).map(async f=>{const p=path.join(cacheDir,f),s=await fs.stat(p);return {p,size:s.size,at:s.mtimeMs}}));
      let total=files.reduce((sum,f)=>sum+f.size,0);
      for(const file of files.sort((a,b)=>a.at-b.at)){
        if(total<=cacheLimit)break;
        await fs.unlink(file.p).catch(()=>{});total-=file.size;
      }
    }catch{}
  }
  async function synthesize(text,options){
    await acquire();
    try{
      if(provider==='edge'){
        if(edgeImpl)return Buffer.from(await edgeImpl(text,options));
        const {EdgeTTS}=await import('@andresaya/edge-tts');
        const tts=new EdgeTTS({timeout:20000});
        const result=await tts.generate(speakable(text,options.lang),voiceFor(options.lang,options.gender),{
          rate:ratePct(options.rate),outputFormat:'audio-24khz-48kbitrate-mono-mp3',signal:AbortSignal.timeout(25000)
        });
        return Buffer.from(result.audio);
      }
      const r=await fetchImpl('https://'+region+'.tts.speech.microsoft.com/cognitiveservices/v1',{
        method:'POST',headers:{'Ocp-Apim-Subscription-Key':key,'Content-Type':'application/ssml+xml',
          'X-Microsoft-OutputFormat':'audio-24khz-48kbitrate-mono-mp3','User-Agent':'hallaym-edu'},
        body:buildSsml(text,options),signal:AbortSignal.timeout(25000)
      });
      if(!r.ok)throw error('Ovoz xizmati javob bermadi (HTTP '+r.status+')');
      return Buffer.from(await r.arrayBuffer());
    }finally{release()}
  }
  app.get('/tts-rules.js',(_req,res)=>res.type('text/javascript').set('Cache-Control','no-cache').sendFile(path.join(HERE,'public','tts-rules.js')));
  app.get('/api/tts/status',auth,(_req,res)=>res.set('Cache-Control','no-store').json({server:enabled,provider:enabled?provider:'browser',
    voices:LANGS.flatMap(lang=>['female','male'].map(gender=>({lang,gender,id:voiceFor(lang,gender),name:VOICE_NAMES[voiceFor(lang,gender)],label:VOICES[lang].label}))),maxChunk:MAX_CHUNK,dailyChars}));

  app.post('/api/tts/speak',auth,async(req,res)=>{
    let reservation=null;
    try{
      res.set('Cache-Control','private, no-store');
      if(!enabled)throw error('Server ovozi sozlanmagan. O‘zbekcha brauzer ovozini tanlang.',503);
      if(typeof req.body?.text!=='string')throw error('Matn kerak',400);
      const text=req.body.text.replace(/\s+/g,' ').trim();
      if(!text)throw error('Matn bo‘sh',400);
      if(text.length>MAX_CHUNK)throw error('Bir so‘rovda ko‘pi bilan '+MAX_CHUNK+' belgi',413);
      const lang=LANGS.includes(req.body.lang)?req.body.lang:'uz',gender=req.body.gender==='male'?'male':'female';
      const rate=Math.round(Math.min(2,Math.max(0.5,Number(req.body.rate)||1))*10)/10;
      const uid=String(req.user._id),day=new Date(now()).toISOString().slice(0,10);
      // Scope cache hashes to the user so private books cannot be probed through cache hits.
      const digest=crypto.createHash('sha256').update(JSON.stringify([uid,provider,text,lang,gender,rate])).digest('hex');
      const file=path.join(cacheDir,digest+'.mp3');
      const cached=await fs.readFile(file).catch(()=>null);
      if(cached?.length)return res.type('audio/mpeg').send(cached);
      let task=pending.get(digest);
      if(!task){
        let row=usage.get(uid);
        if(!row||row.day!==day){row={day,chars:0};usage.set(uid,row)}
        if(row.chars+text.length>dailyChars)throw error('Bugungi ovozli o‘qish limiti tugadi. Keyinroq davom eting.',429);
        row.chars+=text.length;reservation={row,chars:text.length};
        task=(async()=>{
          const audio=await synthesize(text,{lang,gender,rate});
          if(audio.length<100)throw error('Ovoz xizmati bo‘sh audio qaytardi');
          await fs.mkdir(cacheDir,{recursive:true});
          const tmp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
          try{await fs.writeFile(tmp,audio);await fs.rename(tmp,file)}finally{await fs.unlink(tmp).catch(()=>{})}
          if(++writes%20===1)void trimCache();
          return audio;
        })();
        pending.set(digest,task);
        task.finally(()=>pending.delete(digest)).catch(()=>{});
      }
      const audio=await task;reservation=null;
      res.type('audio/mpeg').send(audio);
      if(usage.size>5000)for(const [id,row] of usage)if(row.day!==day)usage.delete(id);
    }catch(e){
      if(reservation)reservation.row.chars=Math.max(0,reservation.row.chars-reservation.chars);
      const message=e.status?e.message:e.name==='TimeoutError'?'Ovoz xizmati kech javob berdi. Qayta urinib ko‘ring.':'O‘zbekcha ovoz xizmatiga ulanib bo‘lmadi. Qayta urinib ko‘ring.';
      res.status(e.status||502).json({message,fallback:'browser'});
    }
  });
  return {enabled,provider};
}
