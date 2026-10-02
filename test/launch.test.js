import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
import {LOAD_MS,COUNTDOWN_MS,SPAWN_DISTANCE} from '../public/rules.js';
test('launch freezes controls, waits for assets, then counts down five seconds',async t=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3199'},stdio:'pipe'});let ws;
 t.after(()=>{ws?.terminate();server.kill();});await new Promise((r,j)=>{server.stdout.once('data',r);server.once('error',j);});
 ws=new WebSocket('ws://127.0.0.1:3199');const messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 async function wait(fn,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){const i=messages.findIndex(fn);if(i>=0)return messages.splice(i,1)[0];await delay(10);}throw Error('Missing launch state');}
 ws.send(JSON.stringify({type:'practice',name:'Launch check'}));const initial=await wait(m=>m.phase==='loading');assert.equal(initial.startsAt-initial.loadEndsAt,COUNTDOWN_MS);assert.ok(initial.loadEndsAt-initial.serverTime<=LOAD_MS);assert.equal(Math.abs(initial.players[0].pos[2]-initial.players[1].pos[2]),SPAWN_DISTANCE);
 const spam=setInterval(()=>ws.send(JSON.stringify({type:'input',boost:true,fire:true,missile:true})),50);t.after(()=>clearInterval(spam));
 await delay(LOAD_MS+250);messages.length=0;let state=await wait(m=>m.type==='state');assert.equal(state.phase,'loading','assets gate is enforced');assert.deepEqual(state.players[0].pos,initial.players[0].pos);assert.ok(state.players.every(p=>p.hp===170));assert.equal(state.shots.length,0);assert.equal(state.missiles.length,0);
 ws.send(JSON.stringify({type:'ready',launchId:'wrong-id'}));await delay(100);messages.length=0;assert.equal((await wait(m=>m.type==='state')).phase,'loading');
 ws.send(JSON.stringify({type:'ready',launchId:initial.launchId}));const countdown=await wait(m=>m.phase==='countdown');assert.ok(countdown.startsAt-countdown.serverTime>=4900);clearInterval(spam);
 const playing=await wait(m=>m.phase==='playing',7000);assert.ok(playing.serverTime-countdown.serverTime>=4900);assert.deepEqual(playing.players[0].pos,initial.players[0].pos);assert.equal(playing.time,300);
});
