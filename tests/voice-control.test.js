import test from 'node:test';
import assert from 'node:assert/strict';
import {matchCommand,spokenNumber,hasWakeWord} from '../public/voice-commands.js';
import {createRecognition} from '../public/voice-recognition.js';
import {cleanPrefs} from '../inclusion-rules.js';

test('natural Uzbek, common spoken variants and Cyrillic navigate to the correct page',()=>{
  for(const [text,page] of [
    ['Kutubxonani ochib ber','library'],['Madina, kutubxonaga o‘tkazib yubor','library'],
    ['jadvalimga o‘t','schedule'],['meni kutubxonaga olib bor','library'],['kutubxonani ochvor','library'],
    ['baholarimni ko‘rsat','grades'],['менинг китобларим','myBooks'],['kitoblarimga kir','myBooks'],
    ['fanlar va vazifalar','courses'],['profilimni och','profile'],['jonli darslarni ochib ber','live'],
    ['Yordamchi, iltimos, bosh sahifaga o‘t','dashboard'],['shaxsiy kabinet','profile'],['kutubxonaa','library']
  ])assert.equal(matchCommand(text)?.page,page,text);
});
test('control commands parse explicit actions, indexed items and preserve dictation',()=>{
  for(const [text,action] of [['orqaga qayt','back'],['oldinga','forward'],['tizimdan chiq','logout'],['yordamchini to‘xtat','pauseListening'],['keyingi','next'],['sahifalarni ayt','listPages'],['tugmalarni ayt','listActions'],['maydonlar','listFields'],['kitobni o‘qib bergin','listenBook'],['ha','yes'],['yo‘q','no']])assert.equal(matchCommand(text)?.action,action,text);
  assert.equal(matchCommand('ikkinchi kitobni tingla')?.index,2);
  assert.equal(matchCommand('uchinchi maydon')?.action,'focusField');
  assert.equal(matchCommand('birinchi tugmani bos')?.index,1);
  assert.equal(matchCommand('qidir O‘zbekiston kitoblari')?.arg,'O‘zbekiston kitoblari');
  assert.equal(matchCommand('Yordamchi, yoz Bugungi topshiriq: 5 + 7 = 12!')?.arg,'Bugungi topshiriq: 5 + 7 = 12!');
  assert.equal(matchCommand('ism maydoniga o‘t')?.arg,'ism');
});
test('negation and ordinary text do not execute sensitive actions',()=>{
  for(const text of ['tizimdan chiqma','kutubxonani ochma','saqlashni bosmang','javobni yuborma','men bugun kitob o‘qidim','ha yoki yoq','Bugungi kun haqida gap'])assert.equal(matchCommand(text),null,text);
  assert.equal(matchCommand('chiq')?.action,'close');
  assert.equal(matchCommand('saqla')?.action,'submit');
  assert.equal(hasWakeWord('Yordamchi, kitobni yop'),true);
  assert.equal(hasWakeWord('kitobda yordamchi bor'),false);
  assert.equal(spokenNumber('yigirma bir'),21);
  assert.equal(spokenNumber('ikkinchisini'),2);
});
test('hands-free preference migrates previous blind profiles and respects explicit disable',()=>{
  assert.equal(cleanPrefs({voiceAssistant:true,preset:'blind'}).voiceHandsFree,true);
  assert.equal(cleanPrefs({voiceAssistant:true,voiceHandsFree:false}).voiceHandsFree,false);
  assert.equal(cleanPrefs({}).voiceAssistant,false);
});

function fixture(){
  const sessions=[],timers=new Map(),states=[],errors=[],results=[];let id=0;
  const control=createRecognition({factory:()=>{const session={start(){this.onstart?.()},abort(){this.aborted=true;this.onend?.()}};sessions.push(session);return session},onState:x=>states.push(x),onError:(...x)=>errors.push(x),onResult:x=>results.push(x),setTimer:(f,delay)=>{timers.set(++id,{f,delay});return id},clearTimer:id=>timers.delete(id)});
  const tick=()=>{const timer=timers.entries().next().value;if(timer){timers.delete(timer[0]);timer[1].f()}};
  return {control,sessions,timers,states,errors,results,tick};
}
test('recognition owns one Uzbek session and restarts after a normal end',()=>{
  const f=fixture();f.control.start();f.control.start();assert.equal(f.sessions.length,1);
  assert.equal(f.sessions[0].lang,'uz-UZ');assert.equal(f.sessions[0].continuous,true);assert.equal(f.states.at(-1),'listening');
  f.sessions[0].onresult({resultIndex:0,results:[Object.assign([{transcript:'kutubxona'},{transcript:'kutubxonani och'}],{isFinal:true})]});assert.equal(f.results.length,1);
  f.sessions[0].onend();assert.equal(f.timers.size,1);f.tick();assert.equal(f.sessions.length,2);
  f.control.stop();assert.equal(f.timers.size,0);
});
test('suspension and late recognition callbacks cannot revive a stopped mic',()=>{
  const f=fixture();f.control.start();const first=f.sessions[0];f.control.suspend(true);assert.equal(first.aborted,true);assert.equal(f.timers.size,0);
  first.onresult({results:[[{transcript:'tizimdan chiq'}]]});assert.equal(f.results.length,0);
  f.control.suspend(false);f.tick();assert.equal(f.sessions.length,2);
  f.control.stop();first.onend();f.sessions[1].onend();assert.equal(f.timers.size,0);assert.equal(f.control.isWanted(),false);
});
test('permission denial stops retrying; network retries are bounded and delayed',()=>{
  const f=fixture();f.control.start();f.sessions[0].onerror({error:'not-allowed'});f.sessions[0].onend();assert.equal(f.control.isWanted(),false);assert.equal(f.timers.size,0);assert.equal(f.states.at(-1),'blocked');
  f.control.start();for(let n=0;n<4;n++){const r=f.sessions.at(-1);r.onerror({error:'network'});r.onend();if(n<3){assert.ok([...f.timers.values()][0].delay>=2000);f.tick()}}
  assert.equal(f.control.isWanted(),false);assert.equal(f.timers.size,0);
});
test('unsupported recognition provides a written-command fallback without a loop',()=>{
  let error='';const r=createRecognition({onError:x=>error=x});r.start();assert.equal(r.isWanted(),false);assert.match(error,/yozma buyruq/i);
});
