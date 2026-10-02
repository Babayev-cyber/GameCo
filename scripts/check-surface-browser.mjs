import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {mkdir,writeFile} from 'node:fs/promises';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));
let id=0;const pending=new Map(),errors=[];
ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text+' ('+m.params.entry.url+')');});
ws.on('close',()=>{for(const resolve of pending.values())resolve({error:{message:'Browser closed'}});pending.clear();});
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});
async function js(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms)),d='window.marsDiagnostics()';
async function wait(expression,ms=35000){const end=Date.now()+ms;while(Date.now()<end){const result=await js(expression);if(result)return result;await delay(60);}throw Error('Timeout: '+expression);}
async function screenshot(name){const r=await call('Page.captureScreenshot');await writeFile('test-results/'+name+'.png',Buffer.from(r.data,'base64'));}
function mouse(type,button='left',x=700,y=500){return call('Input.dispatchMouseEvent',{type,x,y,button,buttons:type==='mousePressed'?(button==='left'?1:2):0,clickCount:1});}
async function click(selector){const p=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await mouse('mousePressed','left',p.x,p.y);await mouse('mouseReleased','left',p.x,p.y);}
async function key(code,down){await call('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='ShiftLeft'?'Shift':code.replace('Key','').toLowerCase()});}
let cursor={x:700,y:500};
async function aimAt(target){
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',...cursor});
 for(let i=0;i<3;i++){
  const pose=await js(`${d}.surface`),myId=await js(`${d}.myId`),player=pose.soldiers.find(s=>s.id===myId);
  const delta=target.pos.map((v,i)=>v-player.pos[i]);delta[1]+=target.size*1.08;
  const yaw=-Math.atan2(delta[0],-delta[2]),pitch=Math.atan2(delta[1],Math.hypot(delta[0],delta[2])),sens=pose.aim?.0013:.0025;
  cursor.x-=Math.atan2(Math.sin(yaw-pose.yaw),Math.cos(yaw-pose.yaw))/sens;cursor.y-=(pitch-pose.pitch)/sens;
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...cursor});await delay(60);
 }
}
try{
 await call('Page.enable');await call('Runtime.enable');await call('Log.enable');await call('Log.clear');errors.length=0;await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Page.bringToFront');
 await call('Emulation.setDeviceMetricsOverride',{width:1400,height:1000,deviceScaleFactor:1,mobile:false});await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3003'});await mkdir('test-results',{recursive:true});
 await wait("document.getElementById('connection').textContent==='NETWORK ONLINE'&&document.documentElement.dataset.gunlowpoly==='loaded'");
 await click('#surface-practice');await wait(`${d}.phase==='landing'`);await screenshot('mars-landing');
 await wait(`${d}.phase==='surface'`,10000);await delay(250);await screenshot('mars-surface');
 assert.equal(await js(`${d}.surface.gunLoaded`),true);assert.equal(await js(`${d}.surface.soldiers[0].hp`),120);
 const start=await js(`${d}.surface.soldiers[0].pos`);await key('KeyW',true);await key('ShiftLeft',true);await delay(700);await key('ShiftLeft',false);await key('KeyW',false);await delay(150);
 assert.ok((await js(`${d}.surface.soldiers[0].pos`))[2]<start[2]-4,'Soldier did not sprint');
 // Lock the mouse with a real click, then aim through the actual pointer events.
 await mouse('mousePressed');await mouse('mouseReleased');await delay(100);
 await mouse('mousePressed','right');await wait(`${d}.surface.aim`);await delay(220);await screenshot('mars-gun-aim');
 const target=(await js(`${d}.surface.monsters`)).find(b=>b.type==='scout'&&!b.dead);await aimAt(target);
 const health=target.hp;await mouse('mousePressed','left',cursor.x,cursor.y);await delay(600);await screenshot('mars-laser');await mouse('mouseReleased','left',cursor.x,cursor.y);
 await wait(`${d}.surface.monsters.find(b=>b.id==='${target.id}').hp<${health}`,3000);
 assert.ok(await js(`${d}.surface.laser.played>0`),'Recorded laser audio did not play');
 await mouse('mouseReleased','right',cursor.x,cursor.y);await wait(`!${d}.surface.aim`);await js('document.exitPointerLock()');
 console.log('Landing, uploaded gun, sprint, right-click aim, server monster damage and laser MP3 passed.');
 await click('#surface-exit');
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true});await delay(200);
 await js("document.getElementById('surface-practice').click()");await wait(`${d}.phase==='surface'`);await delay(250);await screenshot('mars-surface-mobile');
 assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);
 await js("document.getElementById('surface-aim').click()");assert.equal(await js(`${d}.surface.aim`),true);
 await js("document.getElementById('surface-exit').click()");
 assert.deepEqual(errors.filter(e=>!e.includes('favicon.ico')),[]);console.log('Mobile surface layout and AIM control passed; no browser/shader errors.');
}finally{await key('KeyW',false).catch(()=>{});await key('ShiftLeft',false).catch(()=>{});ws.close();}
