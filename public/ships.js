import * as THREE from './three.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const templates=new Map();let panelMap;
function panels(){
  if(panelMap)return panelMap;
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle='#bcc1c6';x.fillRect(0,0,256,256);x.strokeStyle='#737d89';x.lineWidth=2;
  for(let i=0;i<256;i+=64){x.strokeRect(i+2,2,60,122);x.strokeRect(i+2,130,60,122);}
  x.fillStyle='#949fa7';for(let i=0;i<24;i++){const a=(i%6)*42+8,b=Math.floor(i/6)*64+12;x.fillRect(a,b,2,2);}
  panelMap=new THREE.CanvasTexture(c);panelMap.colorSpace=THREE.SRGBColorSpace;return panelMap;
}
function build(p){
  const group=new THREE.Group(),parts=new Map();group.name=`ship-${p.ship}`;group.userData.sharedShip=true;
  const armor=new THREE.MeshStandardMaterial({color:p.team===0?0x77919e:0x98776b,map:panels(),metalness:.72,roughness:.46});
  const dark=new THREE.MeshStandardMaterial({color:0x19212b,metalness:.65,roughness:.42});
  const trim=new THREE.MeshStandardMaterial({color:0x98a5af,metalness:.85,roughness:.3});
  const glass=new THREE.MeshStandardMaterial({color:0x09212d,metalness:.85,roughness:.12,emissive:0x124254,emissiveIntensity:.15});
  const glow=new THREE.MeshBasicMaterial({color:p.team===0?0x84cbdf:0xff9563});
  function part(geo,mat,x=0,y=0,z=0,rotation=null,scale=null){
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);if(rotation)mesh.rotation.set(...rotation);if(scale)mesh.scale.set(...scale);mesh.updateMatrix();
    geo.applyMatrix4(mesh.matrix);if(geo.index){const expanded=geo.toNonIndexed();geo.dispose();geo=expanded;}
    geo.deleteAttribute('normal');geo.computeVertexNormals();if(!parts.has(mat))parts.set(mat,[]);parts.get(mat).push(geo);
  }
  const box=(w,h,d,x,y,z,mat=armor,rot)=>part(new THREE.BoxGeometry(w,h,d),mat,x,y,z,rot);
  const cyl=(a,b,l,x,y,z,mat=dark)=>part(new THREE.CylinderGeometry(a,b,l,16),mat,x,y,z,[Math.PI/2,0,0]);
  const heavy=p.ship==='sentinel',fast=p.ship==='interceptor',width=heavy?5:3.2;
  const hull=new THREE.Shape();hull.moveTo(0,-21);hull.lineTo(width,-9);hull.lineTo(width+1,9);hull.lineTo(2,14);hull.lineTo(-2,14);hull.lineTo(-width-1,9);hull.lineTo(-width,-9);hull.closePath();
  part(new THREE.ExtrudeGeometry(hull,{depth:heavy?4:2.7,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.65,bevelThickness:.5}),armor,0,1.4,0,[Math.PI/2,0,0]);
  part(new THREE.SphereGeometry(1,16,10),glass,0,2,-7,null,[2,1.2,4.4]);
  box(.45,.5,12,0,3.1,4,dark);box(1.6,.1,3,0,2.5,-15,trim);
  for(const side of [-1,1]){
    const span=heavy?14:fast?11:17,wing=new THREE.Shape();wing.moveTo(3*side,-7);wing.lineTo(span*side,fast?7:0);wing.lineTo((span-2)*side,11);wing.lineTo(3*side,8);wing.closePath();
    part(new THREE.ExtrudeGeometry(wing,{depth:heavy?1.1:.5,bevelEnabled:true,bevelSegments:1,bevelSize:.25,bevelThickness:.2}),armor,0,0,0,[Math.PI/2,0,0]);
    box(.65,.65,14,side*(span-1),.15,1,dark);cyl(.35,.55,6,side*(span-1),.15,-8,trim);
    box(.16,.1,6,side*(span-3),.4,3,glow);
    const engineX=side*(heavy?7:fast?4.7:7.5),radius=heavy?2.15:1.65;
    cyl(radius,radius+.3,12,engineX,-.4,8);cyl(radius+.4,radius+.4,1.3,engineX,-.4,13,armor);cyl(radius*.75,radius,1.7,engineX,-.4,14.5,trim);cyl(radius*.65,radius*.65,.25,engineX,-.4,15.5,glow);
    for(let i=0;i<5;i++)box(heavy?3:2,.12,.5,engineX,1.5,3+i*1.35,dark);
    box(.35,4,6,side*2.8,3.1,8,armor,[0,0,-side*.22]);
    if(heavy){box(4.5,3.5,14,side*10,0,0);box(3,.15,9,side*10,1.9,1,dark);cyl(.65,.75,9,side*10,1,-10,trim);}
    const flame=new THREE.Mesh(new THREE.ConeGeometry(radius*.55,7,12),new THREE.MeshBasicMaterial({color:0x83c8ff,transparent:true,opacity:.25,depthWrite:false,blending:THREE.AdditiveBlending}));flame.rotation.x=Math.PI/2;flame.position.set(engineX,-.4,19);flame.name='engine-flame';group.add(flame);
  }
  // One draw per material. Templates share their buffers across every fighter.
  for(const [material,geometries] of parts){const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());group.add(new THREE.Mesh(merged,material));}
  return group;
}
export function createShip(p){
  const key=p.ship+':'+p.team;if(!templates.has(key))templates.set(key,build(p));
  const group=templates.get(key).clone(true);group.userData.flames=[];
  group.traverse(o=>{if(o.name==='engine-flame'){o.material=o.material.clone();group.userData.flames.push(o);}});return group;
}
export function updateShip(group,p,time){
  const throttle=p.dead?0:p.bst?1:Math.min(1,(p.speed||0)/100);
  for(const flame of group.userData.flames){flame.scale.y=.15+throttle*(1.5+.08*Math.sin(time*32));flame.material.opacity=.12+throttle*.38;flame.position.z=15.5+3.5*flame.scale.y;}
}
export function disposeShip(group){for(const flame of group.userData.flames||[])flame.material.dispose();}
