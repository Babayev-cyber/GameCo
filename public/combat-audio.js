export function createCombatAudio(getContext,isMuted){
 const clips={},active=new Set(),raw={},plays={warning:0,explosion:0,lasergun:0};let prepared,warningSource,wantsWarning=false;
 for(const name of ['warning','explosion','lasergun'])raw[name]=fetch(`./assets/${name}.mp3`).then(r=>{if(!r.ok)throw Error(name+' audio failed');return r.arrayBuffer();});
 const ready=Promise.all(Object.values(raw));
 async function prepare(){
  const context=getContext();if(!context)return;
  prepared??=Promise.all(Object.entries(raw).map(async([name,p])=>{const buffer=await context.decodeAudioData((await p).slice(0));if(name==='warning'){const length=Math.min(buffer.length,Math.floor(buffer.sampleRate*3)),clip=context.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);for(let c=0;c<buffer.numberOfChannels;c++)clip.copyToChannel(buffer.getChannelData(c).subarray(0,length),c);clips[name]=clip;}else clips[name]=buffer;}));
  await prepared;
 }
 function play(name,volume=1,loop=false){
  const context=getContext();if(!context||context.state!=='running'||isMuted()||document.hidden||!clips[name]||active.size>=12)return null;
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=clips[name];source.loop=loop;gain.gain.value=volume;source.connect(gain).connect(context.destination);source.start();plays[name]++;active.add(source);source.onended=()=>{active.delete(source);source.disconnect();gain.disconnect();if(source===warningSource)warningSource=null;};return source;
 }
 function warning(threat){
  wantsWarning=threat&&!isMuted()&&!document.hidden;
  if(!wantsWarning&&warningSource){warningSource.stop();warningSource=null;}
  if(wantsWarning&&!warningSource){if(clips.warning)warningSource=play('warning',.85,true);else prepare().then(()=>{if(wantsWarning&&!warningSource)warningSource=play('warning',.85,true);}).catch(()=>{});}
 }
 function stop(){wantsWarning=false;warningSource=null;for(const source of [...active])source.stop();active.clear();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 return {ready,prepare,warning,stop,diagnostics:()=>({warningDuration:clips.warning?.duration,warningActive:!!warningSource,loaded:Object.keys(clips),plays:{...plays}}),explosion:distance=>play('explosion',Math.min(.9,1/(1+distance/400)))};
}
