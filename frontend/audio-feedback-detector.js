// Detect persistent narrowband microphone squeal without replacing the native WebRTC track.
// This detector does not claim to identify acoustic echo from speech.
export function inspectFeedbackFrame(frequencies,samples,{sampleRate=48000,fftSize=2048}={}){
 if(!frequencies?.length||!samples?.length)return {tonal:false,frequency:0,rms:0};
 let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v}
 const rms=Math.sqrt(sum/samples.length);
 const width=sampleRate/fftSize;
 const from=Math.max(3,Math.ceil(480/width)),to=Math.min(frequencies.length-2,Math.floor(8500/width));
 let peak=0,peakIndex=0,total=0,seen=0;
 for(let i=from;i<=to;i++){const n=frequencies[i];total+=n;seen++;if(n>peak){peak=n;peakIndex=i}}
 if(!seen)return {tonal:false,frequency:0,rms};
 const avg=total/seen;
 const side=(frequencies[Math.max(from,peakIndex-3)]+frequencies[Math.max(from,peakIndex-2)]+frequencies[Math.min(to,peakIndex+2)]+frequencies[Math.min(to,peakIndex+3)])/4;
 const frequency=peakIndex*width;
 const tonal=rms>=.015&&peak>=135&&peak-avg>=60&&peak/(avg+7)>=2.8&&peak-side>=32;
 return {tonal,frequency,rms};
}
export function createFeedbackToneTracker({minSamples=4,minDurationMs=250,cooldownMs=12000}={}){
 let lastFrequency=0,samples=0,startedAt=0,disabledUntil=0;
 return {
  observe(frame,now=Date.now()){
   if(now<disabledUntil)return false;
   if(!frame?.tonal){samples=0;startedAt=0;lastFrequency=0;return false}
   const stable=lastFrequency&&Math.abs(frame.frequency-lastFrequency)<Math.max(100,lastFrequency*.045);
   if(!stable){startedAt=now;samples=0}
   samples++;lastFrequency=frame.frequency;
   if(samples>=minSamples&&now-startedAt>=minDurationMs){
     disabledUntil=now+cooldownMs;samples=0;startedAt=0;return true;
   }
   return false;
  },
  reset(){lastFrequency=0;samples=0;startedAt=0;disabledUntil=0}
 };
}
