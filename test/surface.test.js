import test from 'node:test';
import assert from 'node:assert/strict';
import {orbitalWinner,beginLanding,acceptSurfaceInput,stepSurface,surfaceSnapshot} from '../surface.js';
import {LANDING_MS,terrainHeight,MONSTER_TYPES,SURFACE_ROCKS} from '../public/surface-rules.js';
function fixture(){const room={players:new Map([['a',{id:'a',name:'Alpha',team:0}],['b',{id:'b',name:'Bravo',team:0}],['enemy',{id:'enemy',team:1,dead:1}]]),remaining:300};beginLanding(room,0,1000);return room;}
test('landing requires the entire opposing fleet to be defeated',()=>{
 const players=[{team:0,dead:0},{team:0,dead:1},{team:1,dead:1},{team:1,dead:0}];assert.equal(orbitalWinner(players),null);players[3].dead=1;assert.equal(orbitalWinner(players),0);
 assert.equal(orbitalWinner([{team:0,dead:1},{team:1,dead:0,bot:true}]),null,'a bot victory preserves the pilot GAME OVER');
});
test('landing freezes controls and only the winning human squad can act on the surface',()=>{
 const room=fixture();assert.equal(acceptSurfaceInput(room,'a',{fire:true},1000),false);stepSurface(room,1000+LANDING_MS-1,.05);assert.equal(room.phase,'landing');stepSurface(room,1000+LANDING_MS,.05);assert.equal(room.phase,'surface');
 assert.equal(room.surface.soldiers.length,2);assert.equal(acceptSurfaceInput(room,'enemy',{fire:true},8000),false);
 const s=room.surface.soldiers[0],before=s.pos[2];assert.equal(acceptSurfaceInput(room,'a',{yaw:0,pitch:0,moveZ:1,sprint:true},8000),true);stepSurface(room,8050,.1);assert.ok(s.pos[2]<before);assert.ok(Number.isFinite(s.pos[1]));
 acceptSurfaceInput(room,'a',{yaw:NaN,pitch:Infinity,moveX:Infinity},8100);stepSurface(room,8150,.05);assert.ok(s.pos.every(Number.isFinite));
 const snap=surfaceSnapshot(room,8150);assert.ok(!('input' in snap.soldiers[0]));assert.ok(snap.monsters.some(b=>b.type==='stalker'));
});
test('laser damage is authoritative and three cleared waves complete the squad mission',()=>{
 const room=fixture();let now=1000+LANDING_MS;stepSurface(room,now,.05);const s=room.surface.soldiers[0];s.pos=[0,terrainHeight(0,10)+1.65,10];
 for(let wave=1;wave<=3;wave++){
  for(const monster of room.surface.monsters){monster.pos=[0,terrainHeight(0,-5),-5];const spec=MONSTER_TYPES[monster.type];assert.equal(monster.maxHp,spec.hp);const delta=monster.pos.map((v,i)=>v-s.pos[i]);delta[1]+=monster.size*1.08;
   const pitch=Math.atan2(delta[1],Math.hypot(delta[0],delta[2]));
   while(!monster.dead){now+=200;acceptSurfaceInput(room,'a',{yaw:0,pitch,fire:true},now);stepSurface(room,now,.001);}
  }
  if(wave<3){assert.equal(room.phase,'surface');now+=5100;stepSurface(room,now,.001);assert.equal(room.surface.wave,wave+1);}
 }
 assert.equal(room.phase,'ended');assert.equal(room.surface.outcome,'cleared');assert.equal(room.winner,'ARES');assert.ok(room.surface.kills>=12);
});
test('monsters attack soldiers, and lasers cannot hit through a boulder',()=>{
 const room=fixture();let now=1000+LANDING_MS;stepSurface(room,now,.05);const s=room.surface.soldiers[0],b=room.surface.monsters[0];b.pos=[s.pos[0],terrainHeight(s.pos[0],s.pos[2]),s.pos[2]+.5];stepSurface(room,now+1200,.05);assert.ok(s.hp<120);
 const rock=SURFACE_ROCKS.find(r=>r.r>2);s.pos=[rock.x,terrainHeight(rock.x,rock.z)+rock.r*.5,rock.z+8];b.pos=[rock.x,s.pos[1]-b.size*1.08,rock.z-8];room.surface.monsters=[b];const hp=b.hp;now+=2000;acceptSurfaceInput(room,'a',{yaw:0,pitch:0,fire:true},now);stepSurface(room,now,.001);assert.equal(b.hp,hp);
 room.surface.soldiers.forEach(s=>{s.dead=now;});stepSurface(room,now+50,.05);assert.equal(room.surface.outcome,'failed');assert.equal(room.phase,'ended');
});
test('monsters can approach the squad around surface rocks',()=>{
 const room=fixture();let now=1000+LANDING_MS;stepSurface(room,now,.05);room.surface.soldiers.forEach(s=>s.hp=100000);
 for(let i=0;i<1600;i++){now+=50;stepSurface(room,now,.05);}
 for(const b of room.surface.monsters)assert.ok(room.surface.soldiers.some(s=>Math.hypot(b.pos[0]-s.pos[0],b.pos[2]-s.pos[2])<3),'Monster stuck at '+JSON.stringify(b.pos));
});
