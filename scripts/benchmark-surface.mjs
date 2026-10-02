import {WebSocket} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));
let id=0;const pending=new Map();ws.on('message',b=>{const m=JSON.parse(b);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}});
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
async function js(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await call('Page.bringToFront');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3005'});
 await delay(4500);await js("document.getElementById('surface-practice').click()");
 const end=Date.now()+40000;while(await js("window.marsDiagnostics().phase!=='surface'")){if(Date.now()>end)throw Error('Surface launch failed');await delay(100);}
 await delay(800);
 const report=await js(`new Promise(resolve=>{const gaps=[],draws=[];let last=performance.now(),start=last;function frame(now){gaps.push(now-last);last=now;draws.push(window.marsDiagnostics().drawCalls);if(now-start<6000)requestAnimationFrame(frame);}requestAnimationFrame(frame);setTimeout(()=>{gaps.sort((a,b)=>a-b);resolve({viewport:'1440 x 1050, headless Chrome on this computer',sampleSeconds:6,callbackRate:+(gaps.length/6).toFixed(1),p95GapMs:+gaps[Math.floor(gaps.length*.95)].toFixed(1),meanDrawCalls:+(draws.reduce((a,b)=>a+b,0)/draws.length).toFixed(1),framesOver33ms:gaps.filter(x=>x>33.4).length,diagnostics:window.marsDiagnostics()});},6000);})`);
 await mkdir('test-results',{recursive:true});await writeFile('test-results/performance-surface.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,diagnostics:{pixelRatio:report.diagnostics.pixelRatio,triangles:report.diagnostics.triangles,monsters:report.diagnostics.surface.monsters.length}},null,2));
 await js("document.getElementById('surface-exit').click()");
}finally{ws.close();}
