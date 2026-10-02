import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('rocket launches, hits an enemy and respects cooldown',async t=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3198'},stdio:'pipe'});const clients=[];
 t.after(()=>{clients.forEach(c=>c.close());server.kill();});
 await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 async function client(){const c=new WebSocket('ws://localhost:3198');clients.push(c);const queue=[];let launchId;c.on('message',b=>{const m=JSON.parse(b);queue.push(m);if(m.phase==='loading'&&m.launchId!==launchId){launchId=m.launchId;c.send(JSON.stringify({type:'ready',launchId}));}});await new Promise(r=>c.once('open',r));return {send:m=>c.send(JSON.stringify(m)),async wait(fn,timeout=30000){const until=Date.now()+timeout;while(Date.now()<until){const i=queue.findIndex(fn);if(i>=0)return queue.splice(i,1)[0];await pause(10);}throw Error('Timed out');}};}
 const a=await client();a.send({type:'create'});const state=await a.wait(m=>m.type==='state');for(let i=0;i<7;i++){const b=await client();b.send({type:'join',code:state.code});await b.wait(m=>m.type==='state');}a.send({type:'start'});await a.wait(m=>m.phase==='playing');const approach=setInterval(()=>a.send({type:'input',boost:true}),50);await pause(8400);clearInterval(approach);a.send({type:'input'});await pause(400);
 const firing=setInterval(()=>a.send({type:'input',missile:true}),50);t.after(()=>clearInterval(firing));
 const launch=await a.wait(m=>m.missiles?.length);assert.equal(launch.missiles.length,1);const owner=launch.players.find(p=>p.team===0);assert.ok(owner.mcd>5);assert.ok(launch.missiles[0].target);clearInterval(firing);a.send({type:'input',aimYaw:1});
 const impact=await a.wait(m=>m.booms?.length);assert.equal(impact.booms[0].kind,'missile');assert.ok(impact.players.find(p=>p.team===1).hp<170);assert.equal(impact.missiles.length,0);clearInterval(firing);
});
