import * as THREE from './three.js';
let environment;
// A small reflection map gives metal readable highlights without realtime reflections.
export function spacecraftEnvironment(){
  if(environment)return environment;
  const faces=[];
  for(let face=0;face<6;face++){
    const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,0,64);g.addColorStop(0,'#526777');g.addColorStop(.48,'#131b24');g.addColorStop(1,'#070b11');x.fillStyle=g;x.fillRect(0,0,64,64);
    if(face===2||face===4){x.fillStyle='#c8d3d8';x.fillRect(8,8,35,5);x.fillStyle='#536c80';x.fillRect(48,12,3,36);}
    faces.push(c);
  }
  environment=new THREE.CubeTexture(faces);environment.colorSpace=THREE.SRGBColorSpace;environment.needsUpdate=true;return environment;
}
