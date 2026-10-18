import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchCommand,canonical} from '../public/voice-commands.js';

const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('regional speech and recognition slips reach the same command', ()=>{
  const go=t=>matchCommand(t)?.page;
  assert.equal(go('kutupxonani ochvor'),'library');
  assert.equal(go('kitobxonani och'),'library');
  assert.equal(go('jadvalni ochchi'),'schedule');
  assert.equal(go('vidiolarni ochib ber'),'videos');
  assert.equal(go('baxolarimni korsatvor'),'grades');
  assert.equal(go('kitoblarimni ochaqol'),'myBooks');
  assert.equal(go('profelni och'),'profile');
  assert.equal(matchCommand('Madina, kitobni oqiver')?.action,'listenBook');
  assert.equal(matchCommand('sahifani o‘qib ber')?.action,'readPage');
  assert.equal(matchCommand('tuxtat')?.action,'stop');
  assert.equal(matchCommand('toxtatgin')?.action,'stop');
  assert.equal(matchCommand('darsa kir')?.action,'joinLesson');
  assert.equal(matchCommand('jo‘q')?.action,'no','Qipchoq j→y');
  assert.equal(matchCommand('mikrafonni o‘chir')?.action,'pauseListening');
  assert.equal(canonical('kamrani'),'kamerani');
  assert.equal(canonical('och ber'),'och','helper verb dropped');
  // Safety: fuzzy matching never confirms, submits or logs out by itself.
  assert.notEqual(matchCommand('hahaha')?.action,'yes');
  assert.notEqual(matchCommand('tizimdan chiqsh')?.action,'logout');
});

test('inside the Android app the native microphone feeds the web assistant', async()=>{
  const calls=[];
  globalThis.window={HallaymNative:{setWebListening:on=>calls.push(['listen',on]),setSpeaking:on=>calls.push(['speak',on]),setMicBusy:on=>calls.push(['busy',on]),openSettings(){},info:()=>'{"wakeWord":"madina"}'}};
  globalThis.document={documentElement:{dataset:{page:'dashboard'}},getElementById:()=>null};
  globalThis.MutationObserver=class{observe(){}};
  const bridge=await import('../public/native-bridge.js?app');
  assert.equal(bridge.inApp(),true);
  assert.deepEqual(calls.at(-1),['busy',false]);
  const rec=bridge.nativeRecognitionFactory();const heard=[];let started=0,ended=0;
  rec.onstart=()=>started++;rec.onend=()=>ended++;rec.onresult=e=>heard.push([...e.results[0]].map(a=>a.transcript));
  rec.start();await new Promise(r=>setTimeout(r,5));
  assert.equal(started,1);assert.deepEqual(calls.at(-1),['listen',true]);
  assert.equal(window.HxNative.result(['kutupxonani och','kutubxonani och']),true);
  assert.deepEqual(heard,[['kutupxonani och','kutubxonani och']]);
  rec.abort();await new Promise(r=>setTimeout(r,5));
  assert.equal(ended,1);assert.deepEqual(calls.at(-1),['listen',false]);
  assert.equal(window.HxNative.result(['ignored']),false,'nothing is delivered after the page stopped listening');
  bridge.speakingChanged(true);assert.deepEqual(calls.at(-1),['speak',true]);
  assert.equal(bridge.appInfo().wakeWord,'madina');
  delete globalThis.window;delete globalThis.document;delete globalThis.MutationObserver;
});

test('web and app are wired together; answers are short', ()=>{
  const app=read('public/app.js'),va=read('public/voice-assistant.js'),sw=read('public/sw.js');
  assert.ok(app.includes("createVoiceAssistant({recognitionFactory:inApp()?nativeRecognitionFactory:undefined,"));
  assert.ok(va.includes('function brief(text)')&&va.includes('speakingChanged(true)'));
  assert.ok(sw.includes("'/native-bridge.js'"));
  const svc=read('android/app/src/main/java/uz/hallaym/edu/VoiceService.kt'),act=read('android/app/src/main/java/uz/hallaym/edu/MainActivity.kt'),manifest=read('android/app/src/main/AndroidManifest.xml');
  assert.ok(svc.includes('FOREGROUND_SERVICE_TYPE_MICROPHONE')&&svc.includes('fun afterWake(')&&!svc.includes('Recognizer(m, SAMPLE, grammar)'),'wake word: full offline model + real word (a wake-word-only grammar woke on every phrase)');
  assert.ok(act.includes('mediaPlaybackRequiresUserGesture = false')&&act.includes('addJavascriptInterface(Bridge(), "HallaymNative")'));
  assert.ok(manifest.includes('android:foregroundServiceType="microphone"')&&manifest.includes('.HallaymWidget'));
});
