import {LANDING_MS,SOLDIER_HP,SURFACE_LIMIT,MONSTER_TYPES,terrainHeight,SURFACE_ROCKS,surfaceDirection} from './public/surface-rules.js';
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export function orbitalWinner(players){
 const teams=[0,1].map(team=>players.filter(p=>p.team===team));
 for(let team=0;team<2;team++)if(teams[team].some(p=>!p.dead)&&teams[1-team].length&&teams[1-team].every(p=>p.dead)&&teams[team].some(p=>!p.bot))return team;
 return null;
}
export function beginLanding(room,team,now){
 room.phase='landing';room.landingEndsAt=now+LANDING_MS;room.landingTeam=team;
 room.shots=[];room.missiles=[];room.booms=[];
 const humans=[...room.players.values()].filter(p=>!p.bot&&p.team===team);
 room.surface={wave:0,waveTotal:3,team,kills:0,total:0,startedAt:0,nextWaveAt:0,monsters:[],shots:[],outcome:null,
  soldiers:humans.map((p,i)=>({id:p.id,name:p.name,team,pos:[(i%4-1.5)*2,0,10+Math.floor(i/4)*2],yaw:0,pitch:0,hp:SOLDIER_HP,dead:0,kills:0,input:{},inputAt:0,lastShot:0,speed:0}))};
 for(const s of room.surface.soldiers)s.pos[1]=terrainHeight(s.pos[0],s.pos[2])+1.65;
}
function spawnWave(mission,now){
 mission.wave++;mission.nextWaveAt=0;
 const count=Math.min(16,2+mission.soldiers.length+2*(mission.wave-1));
 mission.monsters=Array.from({length:count},(_,i)=>{
  const type=i===count-1&&mission.wave>=2?'brute':i%3===1?'stalker':'scout',spec=MONSTER_TYPES[type];
  // A broad front keeps the first wave visible on disembarking. Later waves surround the squad.
  const angle=mission.wave===1?-Math.PI/2+(i-(count-1)/2)*.38:i/count*Math.PI*2-Math.PI/2;
  const d=mission.wave===1?32+i*3:36+mission.wave*5,pos=[Math.cos(angle)*d,0,Math.sin(angle)*d];for(let attempt=0;attempt<12&&blockedPosition(pos,spec.size*.4);attempt++){pos[0]+=Math.cos(angle)*2;pos[2]+=Math.sin(angle)*2;}pos[1]=terrainHeight(pos[0],pos[2]);
  return{id:`${mission.wave}-${i}`,type,pos,yaw:0,hp:spec.hp,maxHp:spec.hp,size:spec.size,dead:0,lastAttack:now,spawnedAt:now};
 });
 mission.total+=count;
 for(const s of mission.soldiers)if(!s.dead)s.hp=Math.min(SOLDIER_HP,s.hp+25);
}
function hitSphere(origin,dir,center,radius,max){
 const d=center.map((v,i)=>v-origin[i]),along=d.reduce((v,x,i)=>v+x*dir[i],0),perp=d.reduce((v,x)=>v+x*x,0)-along*along;
 if(along<=0||perp>radius*radius)return max;
 const t=Math.max(0,along-Math.sqrt(Math.max(0,radius*radius-perp)));return t<max?t:max;
}
function blockedPosition(pos,radius){return SURFACE_ROCKS.some(r=>Math.hypot(pos[0]-r.x,pos[2]-r.z)<r.r+radius);}
export function acceptSurfaceInput(room,id,message,now){
 if(room.phase!=='surface')return false;
 const s=room.surface?.soldiers.find(p=>p.id===id);if(!s||s.dead)return false;
 const finite=(x,limit)=>Number.isFinite(x)?clamp(x,-limit,limit):0;
 s.input={moveX:finite(message.moveX,1),moveZ:finite(message.moveZ,1),yaw:finite(message.yaw,1e6),pitch:finite(message.pitch,1.35),fire:!!message.fire,aim:!!message.aim,sprint:!!message.sprint};s.inputAt=now;
 return true;
}
export function surfaceSnapshot(room,now){
 const m=room.surface;if(!m)return null;
 return {team:m.team,wave:m.wave,waveTotal:m.waveTotal,kills:m.kills,total:m.total,outcome:m.outcome,nextWaveIn:Math.max(0,(m.nextWaveAt-now)/1000),
  soldiers:m.soldiers.map(({input,inputAt,lastShot,...s})=>({...s,pos:s.pos.map(v=>Math.round(v*100)/100)})),
  monsters:m.monsters.map(({lastAttack,spawnedAt,...b})=>({...b,pos:b.pos.map(v=>Math.round(v*100)/100)})),shots:m.shots};
}
export function stepSurface(room,now,dt){
 const m=room.surface;
 if(room.phase==='landing'){
  if(now<room.landingEndsAt)return;
  room.phase='surface';m.startedAt=now;spawnWave(m,now);
 }
 if(room.phase!=='surface')return;
 room.remaining=Math.max(0,480-(now-m.startedAt)/1000);
 for(const s of m.soldiers){
  if(s.dead)continue;const input=now-s.inputAt<350?s.input:{};
  if(input.yaw!==undefined){s.yaw=input.yaw;s.pitch=input.pitch;}
  const length=Math.hypot(input.moveX||0,input.moveZ||0)||1,speed=input.aim?3.4:input.sprint?10:6;
  const x=(Math.cos(s.yaw)*(input.moveX||0)-Math.sin(s.yaw)*(input.moveZ||0))/Math.max(1,length),z=(-Math.sin(s.yaw)*(input.moveX||0)-Math.cos(s.yaw)*(input.moveZ||0))/Math.max(1,length);
  s.speed=Math.hypot(x,z)*speed;const candidate=[clamp(s.pos[0]+x*speed*dt,-SURFACE_LIMIT,SURFACE_LIMIT),0,clamp(s.pos[2]+z*speed*dt,-SURFACE_LIMIT,SURFACE_LIMIT)];
  if(!blockedPosition(candidate,.4)){s.pos[0]=candidate[0];s.pos[2]=candidate[2];}s.pos[1]=terrainHeight(s.pos[0],s.pos[2])+1.65;
  if(input.fire&&now-s.lastShot>=180){
   s.lastShot=now;const aim=surfaceDirection(s.yaw,s.pitch);let best=140,target=null;
   for(const rock of SURFACE_ROCKS)best=hitSphere(s.pos,aim,[rock.x,terrainHeight(rock.x,rock.z)+rock.r*.5,rock.z],rock.r,best);
   // Sample the ground along the ray so lasers do not damage enemies through hills.
   for(let d=2;d<best;d+=2){const x=s.pos[0]+aim[0]*d,z=s.pos[2]+aim[2]*d;if(s.pos[1]+aim[1]*d<terrainHeight(x,z)){best=d;break;}}
   for(const monster of m.monsters){if(monster.dead)continue;let t=best;for(const [height,radius] of [[1.08,.66],[1.75,.4]])t=hitSphere(s.pos,aim,[monster.pos[0],monster.pos[1]+monster.size*height,monster.pos[2]],monster.size*radius,t);if(t<best){target=monster;best=t;}}
   m.shots.push({by:s.id,team:s.team,from:[...s.pos],to:s.pos.map((v,i)=>v+aim[i]*best),hit:target?.id||null});
   if(target){target.hp=Math.max(0,target.hp-24);if(!target.hp){target.dead=now;m.kills++;s.kills++;}}
  }
 }
 for(const monster of m.monsters){
  if(monster.dead)continue;const spec=MONSTER_TYPES[monster.type];let target=null,best=Infinity;
  for(const s of m.soldiers){if(s.dead)continue;const d=distance(monster.pos,s.pos);if(d<best){best=d;target=s;}}
  if(!target)continue;const dx=target.pos[0]-monster.pos[0],dz=target.pos[2]-monster.pos[2];monster.yaw=Math.atan2(dx,dz);
  const reach=.8+monster.size*.65;
  if(best>reach){
   const step=spec.speed*dt,angle=Math.atan2(dz,dx),radius=monster.size*.35;let candidate;
   const sign=Number(monster.id.split('-')[1])%2?1:-1;
   for(const turn of [0,sign*.5,-sign*.5,sign*1,-sign*1,sign*1.5,-sign*1.5,sign*2,-sign*2,Math.PI]){
    const attempt=[monster.pos[0]+Math.cos(angle+turn)*step,0,monster.pos[2]+Math.sin(angle+turn)*step];
    if(!blockedPosition(attempt,radius)){candidate=attempt;break;}
   }
   if(candidate)monster.pos=candidate;monster.pos[1]=terrainHeight(monster.pos[0],monster.pos[2]);
  }else if(now-monster.lastAttack>1100){monster.lastAttack=now;target.hp=Math.max(0,target.hp-spec.damage);if(!target.hp)target.dead=now;}
 }
 if(m.soldiers.every(s=>s.dead)||room.remaining<=0){m.outcome='failed';room.phase='ended';room.winner='MISSION FAILED';return;}
 if(m.monsters.every(b=>b.dead)){
  if(m.wave===m.waveTotal){m.outcome='cleared';room.phase='ended';room.winner=m.team===0?'ARES':'ORION';return;}
  m.nextWaveAt ||= now+5000;if(now>=m.nextWaveAt)spawnWave(m,now);
 }
}
