// Recorded laser shot. The clip has ~90 ms of lead-in silence and a long tail, so playback skips
// the silence and fades early; voices are capped so sustained fire never piles up.
export function createLaserAudio(getContext,isMuted){
 const file=fetch('./assets/lasergun.mp3').then(r=>{if(!r.ok)throw Error('laser audio failed');return r.arrayBuffer();});
 let buffer,decoding;const voices=[];let played=0;
 function decode(context){decoding??=file.then(data=>context.decodeAudioData(data)).then(b=>{buffer=b;}).catch(()=>{});}
 function play(volume){
  const context=getContext();if(!context||context.state!=='running'||isMuted()||document.hidden)return;
  if(!buffer){decode(context);return;}
  if(voices.length>=5)voices.shift().stop();
  const t=context.currentTime,source=context.createBufferSource(),gain=context.createGain();
  source.buffer=buffer;source.playbackRate.value=.94+Math.random()*.12;
  gain.gain.setValueAtTime(volume,t);gain.gain.setValueAtTime(volume,t+.18);gain.gain.exponentialRampToValueAtTime(.001,t+.6);
  source.connect(gain).connect(context.destination);source.start(t,.09,.6);voices.push(source);played++;
  source.onended=()=>{const i=voices.indexOf(source);if(i>=0)voices.splice(i,1);source.disconnect();gain.disconnect();};
 }
 function stop(){for(const source of voices.splice(0))source.stop();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 return {
  stop,diagnostics:()=>({played,loaded:!!buffer,active:voices.length}),
  prepare(){const context=getContext();if(context)decode(context);},
  // Own shots at full level; other ships' shots fade with distance and drop out beyond ~750 m.
  shot(distance=0){const volume=distance<=0?.5:.3/(1+distance*distance/40000);if(volume>.02)play(volume);}
 };
}
