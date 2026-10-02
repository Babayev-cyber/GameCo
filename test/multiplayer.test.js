import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {botInput} from '../bot.js';
const port=3197;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}`);const messages=[];let launchId;ws.on('message',b=>{const m=JSON.parse(b);messages.push(m);if(m.phase==='loading'&&m.launchId!==launchId){launchId=m.launchId;ws.send(JSON.stringify({type:'ready',launchId}));}});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return {ws,messages,send:m=>ws.send(JSON.stringify(m)),async wait(predicate,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];await delay(10);}throw new Error('Timed out waiting for server message: '+JSON.stringify(messages.filter(m=>m.type==='state').at(-1)?.players.map(p=>({team:p.team,pos:p.pos,hp:p.hp,dead:p.dead}))));}};}
test('room capacity, host permissions, movement, combat and host transfer',async t=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});const clients=[];t.after(()=>{for(const c of clients)c.ws.terminate();server.kill();});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited ${code}`)));});
 assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);assert.equal((await fetch(`http://127.0.0.1:${port}/server.js`)).status,404);
 const a=await client();clients.push(a);a.send({type:'create',size:4,name:'Alpha',ship:'interceptor'});const me=await a.wait(m=>m.type==='joined');let state=await a.wait(m=>m.type==='state');const code=state.code;assert.match(code,/^[0-9A-F]{6}$/);
 a.send({type:'start',fill:true});assert.match((await a.wait(m=>m.type==='error')).message,/8 real players/);assert.ok(!a.messages.some(m=>m.phase==='playing'));
 for(let i=0;i<7;i++){const b=await client();clients.push(b);b.send({type:'join',code,name:`Pilot ${i}`,ship:'interceptor'});await b.wait(m=>m.type==='joined');}
 state=await a.wait(m=>m.type==='state'&&m.players.length===8);assert.equal(state.players.filter(p=>p.team===0).length,4);
 const extra=await client();clients.push(extra);extra.send({type:'join',code});assert.match((await extra.wait(m=>m.type==='error')).message,/full/);
 const b=clients[1];b.send({type:'start'});await delay(150);assert.ok(!a.messages.some(m=>m.phase==='playing'));
 a.send({type:'start'});state=await a.wait(m=>m.phase==='playing');assert.equal(state.players.find(p=>p.id===me.id).hp,170);
 assert.ok(state.players.every(p=>!p.bot));assert.equal(state.players.find(p=>p.id===me.id).pos[0],-1750);
 const approach=setInterval(()=>a.send({type:'input',boost:true}),50);await delay(11500);clearInterval(approach);a.send({type:'input'});
 // Both teams spawn in the same horizontal firing plane, facing each other.
 const firing=setInterval(()=>a.send({type:'input',fire:true}),50);t.after(()=>clearInterval(firing));
 state=await a.wait(m=>m.phase==='playing'&&m.players.some(p=>p.team===1&&p.dead),8000);assert.equal(state.players.find(p=>p.id===me.id).kills,1);clearInterval(firing);
 const moving=setInterval(()=>a.send({type:'input',thrust:1}),50);await delay(600);clearInterval(moving);state=await a.wait(m=>m.phase==='playing'&&m.players.find(p=>p.id===me.id).pos[0]>900);assert.ok(state.players.find(p=>p.id===me.id).pos.every(Number.isFinite));
 a.ws.close();state=await b.wait(m=>m.type==='state'&&m.host!==me.id);assert.equal(state.players.length,7);
 const other=await client();clients.push(other);other.send({type:'create',size:8,name:'Other'});state=await other.wait(m=>m.type==='state');assert.equal(state.size,8);assert.notEqual(state.code,code);const largeCode=state.code;other.send({type:'start'});assert.match((await other.wait(m=>m.type==='error')).message,/16 real players/);
 for(let i=0;i<15;i++){const c=await client();clients.push(c);c.send({type:'join',code:largeCode,name:`Fleet ${i}`});await c.wait(m=>m.type==='joined');}
 state=await other.wait(m=>m.type==='state'&&m.players.length===16);assert.equal(state.players.filter(p=>p.team===1).length,8);
 other.send({type:'start'});state=await other.wait(m=>m.phase==='playing');assert.equal(state.players.length,16);assert.ok(state.players.every(p=>!p.bot));
 const overflow=await client();clients.push(overflow);overflow.send({type:'join',code:largeCode});assert.match((await overflow.wait(m=>m.type==='error')).message,/full/);
 const pilot=await client();clients.push(pilot);pilot.send({type:'practice',name:'Tester',ship:'sentinel'});const pilotId=(await pilot.wait(m=>m.type==='joined')).id;
 state=await pilot.wait(m=>m.practice&&m.phase==='playing');assert.equal(state.size,1);assert.equal(state.players.length,2);assert.equal(state.players.filter(p=>p.bot).length,1);assert.equal(state.players.find(p=>p.id===pilotId).hp,320);const practiceCode=state.code;
 assert.equal((await fetch(`http://127.0.0.1:${port}/assets/mars-viking.jpg`)).headers.get('content-type'),'image/jpeg');
 const closing=setInterval(()=>pilot.send({type:'input',boost:true}),50);t.after(()=>clearInterval(closing));
 await pilot.wait(m=>m.practice&&Math.hypot(...m.players[0].pos.map((v,i)=>v-m.players[1].pos[i]))<650,20000);clearInterval(closing);pilot.send({type:'input'});
 const shooting=setInterval(()=>pilot.send({type:'input',fire:true}),50);t.after(()=>clearInterval(shooting));
 state=await pilot.wait(m=>m.practice&&m.players.some(p=>p.bot&&p.dead),8000);clearInterval(shooting);pilot.send({type:'input'});assert.equal(state.players.find(p=>p.id===pilotId).kills,1);
 state=await pilot.wait(m=>m.practice&&m.phase==='landing',2000);assert.equal(state.landingTeam,0);assert.equal(state.surface.soldiers.length,1);
 state=await pilot.wait(m=>m.practice&&m.phase==='surface',8000);assert.equal(state.surface.wave,1);assert.equal(state.surface.soldiers[0].hp,120);assert.ok(state.surface.monsters.length>=3);
 pilot.messages.length=0;pilot.send({type:'restart'});state=await pilot.wait(m=>m.practice&&m.time===300);assert.ok(state.players.every(p=>p.kills===0&&!p.dead));assert.deepEqual(state.score,[0,0]);assert.equal(state.players.find(p=>p.id===pilotId).hp,320);
 pilot.send({type:'leave'});await delay(100);const rejoin=await client();clients.push(rejoin);rejoin.send({type:'join',code:practiceCode});assert.match((await rejoin.wait(m=>m.type==='error')).message,/not found/,'empty practice room is removed with its bot');
});

test('bot steers toward capture zone when enemy is absent and never fires through a turn',()=>{
 const bot={pos:[0,0,-240],yaw:Math.PI,pitch:0,team:1};
 const capture=botInput(bot,[],10);assert.ok(capture.thrust>0);assert.equal(capture.fire,false);assert.ok(Math.abs(capture.turn)<.01);
 const enemy={pos:[500,0,-240],team:0,dead:0};const turn=botInput(bot,[enemy],10);assert.ok(Math.abs(turn.turn)>.5);assert.equal(turn.fire,false);
});
