import {WebSocket} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.once('open',r));let id=0;const pending=new Map();
ws.on('message',b=>{const m=JSON.parse(b);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}});
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
const evalJS=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitPlaying(){const end=Date.now()+35000;while(Date.now()<end){if(await evalJS("window.marsDiagnostics().phase==='playing'"))return;await delay(100);}throw Error('Launch did not complete');}
const base=process.env.MARS_TEST_URL||'http://localhost:3001';
const clients=[];let input;
try{
 await call('Page.bringToFront');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});await delay(4000);
 await evalJS(`window.measureFrames=()=>new Promise(resolve=>{
 const frames=[];let draws=0,last=performance.now(),start=last;
 const proto=WebGL2RenderingContext.prototype,old=proto.drawElements,oldArrays=proto.drawArrays;
 proto.drawElements=function(...args){draws++;return old.apply(this,args)};
 proto.drawArrays=function(...args){draws++;return oldArrays.apply(this,args)};
 function finish(){const now=performance.now();
 proto.drawElements=old;proto.drawArrays=oldArrays;frames.sort((a,b)=>a-b);
 resolve({fps:+(frames.length*1000/(now-start)).toFixed(1),p95ms:frames.length?+frames[Math.floor(frames.length*.95)].toFixed(1):null,drawsPerSecond:Math.round(draws*1000/(now-start)),framesOver33ms:frames.filter(x=>x>33.4).length,diagnostics:window.marsDiagnostics?.()});}
 function frame(now){frames.push(now-last);last=now;if(now-start<6000)requestAnimationFrame(frame);}
 requestAnimationFrame(frame);setTimeout(finish,6000);});`);
 console.log('Measuring menu');const menu=await evalJS('measureFrames()');console.log(menu);
 await evalJS("document.getElementById('practice').click()");await waitPlaying();await delay(5000);
 console.log('Measuring practice');const practice=await evalJS('measureFrames()');console.log(practice);
 await evalJS("document.querySelector('#hud .leave').click();document.querySelector('[data-size=\"8\"]').click();document.getElementById('create').click()");await delay(300);
 const code=await evalJS("document.getElementById('copy').textContent");console.log('Room:',code);
 await mkdir('test-results',{recursive:true});await writeFile(`test-results/performance-${process.argv[2]||'current'}.json`,JSON.stringify({menu,practice},null,2));
 for(let i=0;i<15;i++){
  const client=new WebSocket(base.replace(/^http/,'ws'));clients.push(client);let launchId;client.on('message',b=>{const m=JSON.parse(b);if(m.phase==='loading'&&m.launchId!==launchId){launchId=m.launchId;client.send(JSON.stringify({type:'ready',launchId}));}});await new Promise(r=>client.once('open',r));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Join timed out')),10000);client.on('message',b=>{const m=JSON.parse(b);if(m.type==='error'){clearTimeout(timer);reject(Error(m.message));}if(m.type==='joined'){clearTimeout(timer);resolve();}});client.send(JSON.stringify({type:'join',code,name:'PERF '+i,ship:['interceptor','vanguard','sentinel'][i%3]}));});
 }
 await delay(200);await evalJS("document.getElementById('start').click()");await waitPlaying();await delay(5000);
 input=setInterval(()=>clients.forEach(c=>c.send(JSON.stringify({type:'input',fire:true,missile:true}))),50);
 const fleet16=await evalJS('measureFrames()');clearInterval(input);clients.forEach(c=>c.close());
 await evalJS("document.querySelector('#hud .leave').click()");
 const report={viewport:'1440 × 1050, headless Chrome on this computer',menu,practice,fleet16};
 await mkdir('test-results',{recursive:true});await writeFile(`test-results/performance-${process.argv[2]||'current'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{clearInterval(input);clients.forEach(c=>c.terminate());ws.close();}
