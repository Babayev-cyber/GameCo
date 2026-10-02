export const LANDING_MS=6500;
export const SOLDIER_HP=120;
export const SURFACE_LIMIT=118;
export const MONSTER_TYPES={
 scout:{name:'SCOUT',size:.8,hp:60,speed:3,damage:8,color:0xa48c58},
 stalker:{name:'STALKER',size:1.35,hp:144,speed:2.1,damage:14,color:0x815b63},
 brute:{name:'BRUTE',size:2.25,hp:336,speed:1.15,damage:24,color:0x584a59}
};
export function terrainHeight(x,z){return Math.sin(x*.043)*Math.sin(z*.037)*1.5+Math.sin((x+z)*.075)*.22+Math.exp(-(((Math.hypot(x+36,z+24)-48)/10)**2))*1.4;}
function random(seed){let a=seed;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const rand=random(208607);
export const SURFACE_ROCKS=Array.from({length:75},(_,i)=>{const angle=rand()*Math.PI*2,d=22+rand()*92;return {x:Math.cos(angle)*d,z:Math.sin(angle)*d,r:.6+rand()*2.6,rotation:rand()*6.28};});
export function surfaceDirection(yaw,pitch){return[-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
