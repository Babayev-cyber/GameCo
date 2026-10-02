export function direction(yaw,pitch){return [Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
export function weaponDirection(yaw,pitch,offsetYaw=0,offsetPitch=0){
 const forward=direction(yaw,pitch),right=[Math.cos(yaw),0,Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
 const v=forward.map((x,i)=>x+right[i]*Math.tan(offsetYaw)+up[i]*Math.tan(offsetPitch)),length=Math.hypot(...v);return v.map(x=>x/length);
}
export function acquireLock(p,players,aim,dt){
 let target=null,best=Math.cos(8*Math.PI/180);
 for(const q of players){if(q.team===p.team||q.dead)continue;const d=q.pos.map((v,i)=>v-p.pos[i]),range=Math.hypot(...d);if(range<30||range>1500)continue;const dot=d.reduce((s,v,i)=>s+v*aim[i],0)/range;if(dot>best){best=dot;target=q;}}
 if(!target){p.lockId=null;p.lockProgress=0;return;}
 if(p.lockId!==target.id){p.lockId=target.id;p.lockProgress=0;}
 p.lockProgress=Math.min(1,(p.lockProgress||0)+dt/.65);
}
