import {LOAD_MS} from './rules.js';
export function createLaunchSequence({assetsReady,onReady,isMuted}){
 const el=document.getElementById('launch-sequence'),video=document.getElementById('loading-video'),speech=document.getElementById('starting-speech'),number=document.getElementById('launch-number'),label=document.getElementById('launch-label'),detail=document.getElementById('launch-detail'),bar=document.getElementById('launch-progress'),track=bar.parentElement;
 let state,myId,launchId,readySent=false,offset=0,lastPhase,startedUntil=0;
 speech.volume=.76;speech.loop=true;
 function setSpeech(){if(!state||isMuted()||document.hidden||!['loading','countdown'].includes(state.phase)){speech.pause();return;}speech.play().catch(()=>{});}
 function update(m,id){
  state=m;myId=id;offset=m.serverTime-Date.now();
  if(m.phase==='loading'&&launchId!==m.launchId){
   launchId=m.launchId;readySent=false;startedUntil=0;video.currentTime=0;speech.currentTime=0;
   assetsReady.then(()=>{if(state?.launchId===launchId&&state.phase==='loading'&&!readySent){readySent=true;onReady(launchId);}}).catch(()=>{detail.textContent='Some assets could not load. Reload to retry.';});
  }
  if(m.phase!==lastPhase){
   if(m.phase==='loading'){video.play().catch(()=>{});setSpeech();}
   if(m.phase==='countdown'){video.pause();setSpeech();}
   if(['playing','landing'].includes(m.phase)&&lastPhase==='countdown'){startedUntil=Date.now()+1100;speech.pause();speech.currentTime=0;}
   if(!['loading','countdown'].includes(m.phase)){video.pause();setSpeech();}
   lastPhase=m.phase;
  }
 }
 function frame(){
  const loading=state?.phase==='loading',counting=state?.phase==='countdown',start=['playing','landing'].includes(state?.phase)&&Date.now()<startedUntil;
  el.classList.toggle('hidden',!loading&&!counting&&!start);el.classList.toggle('counting',counting||start);document.body.classList.toggle('launching',loading||counting);video.hidden=!loading;
  if(!loading&&!counting&&!start)return;
  const now=Date.now()+offset;
  if(loading){
   const progress=Math.max(0,Math.min(1,(now-(state.loadEndsAt-LOAD_MS))/LOAD_MS));bar.style.width=progress*100+'%';track.setAttribute('aria-valuenow',String(Math.round(progress*100)));label.textContent='PREPARING FOR DEPARTURE';number.textContent='';
   const humans=state.players.filter(p=>!p.bot),ready=humans.filter(p=>p.ready).length;
   detail.textContent=progress<1?'Flight systems loading · '+ready+'/'+humans.length+' pilots ready':'Waiting for flight systems · '+ready+'/'+humans.length+' pilots ready';
  }else{label.textContent=start?'FLIGHT SYSTEMS ONLINE':'ALL PILOTS READY';number.textContent=start?'START':String(Math.max(1,Math.ceil((state.startsAt-now)/1000)));detail.textContent=start?'Capture Mars. Command the orbit.':'Engines standing by · Weapons safe';bar.style.width='100%';}
 }
 function reset(){state=null;lastPhase=null;launchId=null;startedUntil=0;video.pause();speech.pause();speech.currentTime=0;el.classList.add('hidden');document.body.classList.remove('launching');}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else if(state?.phase==='loading')video.play().catch(()=>{});setSpeech();});
 return {update,frame,reset,syncSound:setSpeech};
}
