import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightMotion} from '../public/flight-motion.js';
const pilot=(pos,yaw=0,age=1)=>({id:'p',pos:[pos,0,0],yaw,pitch:0,age,velocity:[100,0,0],yawRate:1,pitchRate:0,dead:0});
test('flight interpolation follows snapshots, bounds prediction, and clears on redeploy',()=>{
 const motion=new FlightMotion();motion.push([pilot(0)],1000);motion.push([pilot(5,0,1.05)],1050);
 assert.equal(motion.sample('p',1105).pos[0],2.5,'remote ship is buffered 80ms');
 assert.equal(motion.sample('p',1100,true).pos[0],10,'local ship predicts 50ms ahead');
 assert.equal(motion.sample('p',5000,true).pos[0],15,'stale network samples cannot move forever');
 motion.push([pilot(600,0,0)],5100);assert.equal(motion.sample('p',5100).pos[0],600,'respawn snaps to its new position');
 motion.push([],5200);assert.equal(motion.sample('p',5200),null);
});
test('interpolation turns the short way around the yaw boundary',()=>{
 const motion=new FlightMotion(),a=pilot(0,Math.PI-.1),b=pilot(0,-Math.PI+.1,1.05);a.yawRate=b.yawRate=0;
 motion.push([a],1000);motion.push([b],1050);assert.ok(Math.abs(motion.sample('p',1105).yaw-Math.PI)<1e-8);
});
