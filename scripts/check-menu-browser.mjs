import {WebSocket} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';

const tabs=await(await fetch('http://127.0.0.1:9331/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>ws.once('open',resolve));
let id=0;const pending=new Map();
ws.on('message',raw=>{const message=JSON.parse(raw);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const request=++id;pending.set(request,message=>message.error?reject(Error(message.error.message)):resolve(message.result));
  ws.send(JSON.stringify({id:request,method,params}));
});
await mkdir('test-results',{recursive:true});
await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3001/'});
await new Promise(resolve=>setTimeout(resolve,3000));
let failures=0;
try {
  for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[1024,768],[768,1024],[390,844],[375,667],[360,640],[320,568],[844,390],[667,375],[568,320]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=900});
    await new Promise(resolve=>setTimeout(resolve,180));
    const {result}=await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      const controls=[...document.querySelectorAll('#menu button,#menu input')].filter(el=>el.getClientRects().length);
      const outside=controls.filter(el=>{const r=el.getBoundingClientRect();return r.top<0||r.left<0||r.bottom>innerHeight+.5||r.right>innerWidth+.5;}).map(el=>el.id||el.dataset.ship||el.textContent.trim());
      const overlaps=controls.filter((el,i)=>controls.slice(i+1).some(other=>{const a=el.getBoundingClientRect(),b=other.getBoundingClientRect();return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;})).map(el=>el.id||el.dataset.ship||el.textContent.trim());
      return {width:innerWidth,height:innerHeight,pageHeight:document.documentElement.scrollHeight,pageWidth:document.documentElement.scrollWidth,controls:controls.length,outside,overlaps};
    })()`});
    const metrics=result.value;
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:height/2,deltaX:0,deltaY:500});
    const scroll=await call('Runtime.evaluate',{expression:'scrollY',returnByValue:true});
    const passed=metrics.pageHeight<=height&&metrics.pageWidth<=width&&!metrics.outside.length&&!metrics.overlaps.length&&metrics.controls===13&&scroll.result.value===0;
    console.log(JSON.stringify({passed,...metrics,scrollY:scroll.result.value}));
    if(!passed)failures++;
    if([[1366,768],[390,844],[360,640],[844,390]].some(size=>size[0]===width&&size[1]===height)){
      const shot=await call('Page.captureScreenshot');await writeFile(`test-results/menu-${width}x${height}.png`,Buffer.from(shot.data,'base64'));
    }
  }
  const lobbyCheck=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async () => {
    document.getElementById('create').click();
    await new Promise(resolve=>setTimeout(resolve,800));
    const lobbyVisible=!document.getElementById('lobby').classList.contains('hidden');
    const pageLocked=['hidden','clip'].includes(getComputedStyle(document.documentElement).overflowY)&&['hidden','clip'].includes(getComputedStyle(document.body).overflowY);
    document.querySelector('#lobby .leave').click();
    await new Promise(resolve=>setTimeout(resolve,400));
    return {lobbyVisible,pageLocked,menuRestored:!document.getElementById('menu').classList.contains('hidden'),pageHeight:document.documentElement.scrollHeight,height:innerHeight};
  })()`});
  const flow=lobbyCheck.result.value;
  console.log(JSON.stringify({roomFlow:flow}));
  if(!flow?.lobbyVisible||!flow.pageLocked||!flow.menuRestored||flow.pageHeight!==flow.height)failures++;
  // Exercise the maximum roster even when no other clients are connected.
  await call('Runtime.evaluate',{expression:`document.getElementById('menu').classList.add('hidden');document.getElementById('lobby').classList.remove('hidden');document.getElementById('roster').innerHTML=Array.from({length:16},(_,i)=>'<div class="pilot"><b>PILOT '+i+'</b><span>ARES / INTERCEPTOR</span></div>').join('')`});
  for(const [width,height] of [[1366,768],[390,844],[320,568],[568,320]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:width/2,y:height/2,deltaX:0,deltaY:500});
    const {result}=await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      window.scrollTo(0,500);document.body.scrollTop=500;
      const outside=[...document.querySelectorAll('#lobby button,#roster .pilot')].filter(el=>{const r=el.getBoundingClientRect();return r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth;});
      return {width:innerWidth,height:innerHeight,outside:outside.length,scrollY,bodyScroll:document.body.scrollTop,pageHeight:document.documentElement.scrollHeight};
    })()`});
    const m=result.value;console.log(JSON.stringify({fullLobby:m}));
    if(m.outside||m.scrollY||m.bodyScroll||m.pageHeight!==height)failures++;
  }
  await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3001/'});
} finally { ws.close(); }
if(failures)throw Error(`${failures} menu viewport checks failed`);
