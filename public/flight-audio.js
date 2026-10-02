// Interior drive vibration and weapon transients. One shared audio graph, no downloads.
export function createFlightAudio(getContext,isMuted){
 let context,noiseBuffer,driveGain,filter,oscillator,throttle=0,last=0,silent=true;
 function prepare(){
  context=getContext();if(!context||context.state!=='running'||isMuted())return false;
  if(driveGain)return true;
  noiseBuffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.5;
  const noise=context.createBufferSource();noise.buffer=noiseBuffer;noise.loop=true;filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=140;driveGain=context.createGain();driveGain.gain.value=0;noise.connect(filter).connect(driveGain).connect(context.destination);noise.start();
  oscillator=context.createOscillator();oscillator.type='sine';oscillator.frequency.value=38;oscillator.connect(driveGain);oscillator.start();return true;
 }
 function silence(){if(driveGain&&!silent){silent=true;driveGain.gain.cancelScheduledValues(context.currentTime);driveGain.gain.setTargetAtTime(0,context.currentTime,.08);}}
 function update(playing,me){
  if(!playing||!me||me.dead||isMuted()){silence();return;}
  const now=performance.now();if(now-last<100||!prepare())return;last=now;
  silent=false;throttle=Math.min(1,(me.speed||0)/252);driveGain.gain.setTargetAtTime(.007+throttle*.025,context.currentTime,.15);filter.frequency.setTargetAtTime(140+throttle*230,context.currentTime,.15);oscillator.frequency.setTargetAtTime(38+throttle*19,context.currentTime,.15);
 }
 function rocket(volume=1){
  if(!prepare()||volume<.02)return;const t=context.currentTime,source=context.createBufferSource(),band=context.createBiquadFilter(),gain=context.createGain();source.buffer=noiseBuffer;band.type='bandpass';band.frequency.setValueAtTime(450,t);band.frequency.exponentialRampToValueAtTime(90,t+.55);band.Q.value=.8;gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.13*volume,t+.035);gain.gain.exponentialRampToValueAtTime(.001,t+.6);source.connect(band).connect(gain).connect(context.destination);source.start();source.stop(t+.65);source.onended=()=>{source.disconnect();band.disconnect();gain.disconnect();};
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();});return {update,rocket,silence};
}
