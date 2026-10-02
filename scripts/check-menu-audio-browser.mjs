import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
import {LOAD_MS,COUNTDOWN_MS} from '../public/rules.js';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>ws.once('open',resolve));
let id=0;const pending=new Map(),errors=[];
ws.on('message',raw=>{const message=JSON.parse(raw);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);});
const call=(method,params={})=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,message=>message.error?reject(Error(message.error.message)):resolve(message.result));ws.send(JSON.stringify({id:request,method,params}));});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
async function wait(expression,timeout=30000){const ends=Date.now()+timeout;while(Date.now()<ends){if(await evaluate(expression))return;await delay(80);}throw Error('Timed out: '+expression);}
async function click(selector){const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});}
const sound=`['background-music','night-music','starting-speech','match-music'].map(id=>{const a=document.getElementById(id);return {id,volume:a.volume,paused:a.paused,time:a.currentTime};})`;
try{
  await call('Runtime.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
  await call('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3001/'});
  await wait("document.getElementById('connection')?.textContent==='NETWORK ONLINE'");
  if(await evaluate("document.getElementById('sound').textContent==='SOUND OFF'"))await click('#sound');else await click('#name');
  await wait("['background-music','night-music'].every(id=>{const a=document.getElementById(id);return !a.paused&&a.currentTime>0;})");
  const menuSound=await evaluate(sound);assert.equal(menuSound[0].volume,.4);assert.equal(menuSound[1].volume,.22);
  console.log('Both menu tracks play in parallel:',menuSound);
  await click('#sound');assert.ok((await evaluate(sound)).every(track=>track.paused));await click('#sound');
  await click('#practice');const launchedAt=Date.now();
  await wait("window.marsDiagnostics().phase==='loading'");
  await wait("!document.getElementById('starting-speech').paused&&!document.getElementById('match-music').paused");
  const loadingSound=await evaluate(sound);assert.ok(loadingSound.slice(0,2).every(track=>track.paused));assert.equal(loadingSound[2].volume,.76);assert.equal(loadingSound[3].volume,.24);
  const layout=await evaluate(`(()=>{const c=document.querySelector('.launch-console'),r=c.getBoundingClientRect(),bar=document.querySelector('.launch-track').getBoundingClientRect();return {shift:new DOMMatrix(getComputedStyle(c).transform).m42,top:r.top,bottom:r.bottom,height:innerHeight,barTop:bar.top};})()`);
  assert.ok(layout.shift>0&&layout.top>=0&&layout.bottom<=layout.height);
  await mkdir('test-results',{recursive:true});const shot=await call('Page.captureScreenshot');await writeFile('test-results/loading-audio-updated.png',Buffer.from(shot.data,'base64'));
  await wait("window.marsDiagnostics().phase==='countdown'");const loadingElapsed=Date.now()-launchedAt;assert.ok(loadingElapsed>=LOAD_MS-250);
  assert.ok(await evaluate("!document.getElementById('starting-speech').paused"));
  await wait("window.marsDiagnostics().phase==='playing'");const totalElapsed=Date.now()-launchedAt;assert.ok(totalElapsed>=LOAD_MS+COUNTDOWN_MS-250);
  assert.ok(await evaluate("document.getElementById('starting-speech').paused"));
  await evaluate("document.querySelector('#hud .leave').click()");await wait("['background-music','night-music'].every(id=>!document.getElementById(id).paused)");
  assert.deepEqual(errors,[]);console.log({loadingSound,layout,loadingElapsed,totalElapsed,errors});
}finally{ws.close();}
