import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {writeFile,mkdir} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.once('open',r));
let id=0;const pending=new Map(),errors=[];
ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
ws.on('close',()=>{for(const resolve of pending.values())resolve({error:{message:'Browser connection closed'}});pending.clear();});
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(m.error):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const value=await evaluate(expression);if(value)return value;await delay(80);}throw Error('Browser timed out: '+expression);}
async function click(selector){const point=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await mouse('mousePressed','left',point);await mouse('mouseReleased','left',point);}
function mouse(type,button='left',point={x:720,y:525}){return call('Input.dispatchMouseEvent',{type,...point,button,buttons:type==='mousePressed'?(button==='left'?1:2):0,clickCount:1});}
function shift(down){return call('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});}
const diag='window.marsDiagnostics()';
const separation=`(()=>{const d=${diag};return Math.hypot(...d.players[0].pos.map((v,i)=>v-d.players[1].pos[i]))})()`;
async function shot(name){const s=await call('Page.captureScreenshot');await writeFile(`test-results/${name}.png`,Buffer.from(s.data,'base64'));}
try{
 await call('Runtime.enable');await call('Page.enable');await call('Page.bringToFront');
 await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3001'});
 await mkdir('test-results',{recursive:true});
 await wait("document.getElementById('connection').textContent==='NETWORK ONLINE'&&document.documentElement.dataset.cockpitModel==='loaded'");
 await wait("['earth','jupiter','marsTexture','missile','vertical_launch_missile','sparksexplosion'].every(k=>document.documentElement.dataset[k]==='loaded')");
 assert.equal(await evaluate(`${diag}.rendering`),false);
 await click('[data-ship="sentinel"]');assert.equal(await evaluate("document.getElementById('hangar-hull').textContent"),'320 HP');
 await click('[data-ship="interceptor"]');
 if(await evaluate("document.getElementById('sound').textContent==='SOUND OFF'"))await click('#sound');
 await shot('desktop');
 await click('#practice');const launchTime=Date.now();
 await wait(`${diag}.phase==='loading'`);await delay(1000);
 assert.ok(await evaluate("!document.getElementById('loading-video').paused&&document.getElementById('loading-video').currentTime>0"),'Loading video is not playing');
 assert.ok(await evaluate("!document.getElementById('starting-speech').paused&&document.getElementById('starting-speech').currentTime>0"),'Starting speech is not playing');
 await wait(`${diag}.sound.warningDuration===3`);
 assert.equal(await evaluate(separation),3500);
 await shot('loading');console.log('Loading MP4, starting speech, NASA maps and exactly 3-second warning buffer passed.');
 await wait(`${diag}.phase==='countdown'`);assert.ok(Date.now()-launchTime>=15750);
 assert.ok(await evaluate("!document.getElementById('starting-speech').paused"));
 const count=await evaluate("document.getElementById('launch-number').textContent");assert.ok(/^[1-5]$/.test(count));await shot('countdown');
 await wait(`${diag}.phase==='playing'`);assert.ok(Date.now()-launchTime>=20750);
 await wait("document.getElementById('launch-number').textContent==='START'",1500);await shot('start');
 assert.ok(await evaluate("document.getElementById('starting-speech').paused"));
 await delay(1200);await shot('cockpit');
 assert.ok(await evaluate("document.getElementById('target-label').textContent.includes('KEPLER')"));
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:950,y:400});await delay(120);
 assert.ok(await evaluate("parseFloat(document.querySelector('.reticle').style.left)>60"),'Mouse reticle is stuck');
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:720,y:525});
 await shift(true);await delay(5000);assert.ok(await evaluate("document.body.classList.contains('boosting')"));
 assert.ok(await evaluate(separation)>900,'Teams can fight within the first five seconds of boost');await shot('boost');
 await wait(`${separation}<550`,10000);await shift(false);await delay(350);
 await mouse('mousePressed');await delay(360);await shot('laser');await mouse('mouseReleased');
 await wait(`${diag}.players.some(p=>p.team===1&&p.hp<170)`);
 await wait(`${diag}.players.find(p=>p.id===${diag}.myId).lockProgress>=1`);
 await mouse('mousePressed','right');await delay(160);await mouse('mouseReleased','right');
 await wait(`${diag}.missiles.length>0`,3000);await shot('rocket-launch');
 await wait(`${diag}.sound.plays.explosion>0`,5000);
 console.log('Mouse aim, five-second separation, boost, red laser damage and locked rocket explosion passed.');
 // Back toward the capture zone so KEPLER has room to acquire and launch a missile.
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',windowsVirtualKeyCode:83});await delay(4800);
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',windowsVirtualKeyCode:83});
 await wait(`${diag}.missileWarning&&${diag}.sound.warningActive`,65000);await shot('missile-warning');
 await wait("!document.getElementById('respawn').classList.contains('hidden')",45000);await shot('game-over');
 await delay(4500);assert.ok(!await evaluate("document.getElementById('respawn').classList.contains('hidden')"),'Player automatically respawned');
 await click('#retry');await wait(`${diag}.phase==='loading'`);
 assert.ok(await evaluate("document.getElementById('hud').classList.contains('hidden')"),'GAME OVER remains above retry loading');
 await click('#launch-sequence .leave');await wait(`${diag}.phase==='menu'`);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await call('Emulation.setTouchEmulationEnabled',{enabled:true});await delay(300);
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await shot('mobile');
 await evaluate("document.getElementById('practice').click()");await wait(`${diag}.phase==='playing'`);await delay(1200);
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await shot('mobile-cockpit');
 await evaluate("document.querySelector('#hud .leave').click()");
 assert.deepEqual(errors,[]);console.log('Incoming warning, persistent GAME OVER, retry loading, mobile countdown and layout passed; no browser exceptions.');
}finally{await shift(false).catch(()=>{});ws.close();}
