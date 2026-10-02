import test from 'node:test';import assert from 'node:assert/strict';import {acquireLock,weaponDirection} from '../targeting.js';
test('mouse offsets aim in the cockpit frame and locks reset outside the cone',()=>{
 const p={id:'pilot',team:0,pos:[0,0,0],lockProgress:0},enemy={id:'enemy',team:1,pos:[0,0,-1200]};
 for(let i=0;i<14;i++)acquireLock(p,[enemy],weaponDirection(0,0),.05);assert.equal(p.lockProgress,1);assert.equal(p.lockId,'enemy');
 const aimed=weaponDirection(0,0,.4,.2);assert.ok(aimed[0]>.3&&aimed[1]>.1);assert.ok(Math.abs(Math.hypot(...aimed)-1)<1e-6);acquireLock(p,[enemy],aimed,.05);assert.equal(p.lockId,null);assert.equal(p.lockProgress,0);
 acquireLock(p,[{...enemy,pos:[0,0,-1600]}],weaponDirection(0,0),.1);assert.equal(p.lockId,null);
});
