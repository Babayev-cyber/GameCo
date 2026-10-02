import * as THREE from './three.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SHIPS} from './rules.js';
export function createInstruments(parent){
  const group=new THREE.Group();group.name='flight-instruments';group.position.z=-.95;parent.add(group);
  const frame=new THREE.MeshStandardMaterial({color:0x17212a,metalness:.55,roughness:.42});
  const trim=new THREE.MeshStandardMaterial({color:0x52616b,metalness:.8,roughness:.32});
  const dark=new THREE.MeshStandardMaterial({color:0x080e16,metalness:.25,roughness:.7});
  const led=new THREE.MeshBasicMaterial({color:0x62b8ba}),dimLed=new THREE.MeshBasicMaterial({color:0x3b5965}),warmLed=new THREE.MeshBasicMaterial({color:0xd1aa79});
  function box(w,h,d,x,y,z,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m);return m;}
  box(2.65,.5,.45,0,-1.01,-1.1,frame);box(2.7,.055,.16,0,-.73,-1.19,trim);
  const screens=[];
  for(let i=-1;i<=1;i++){
    box(.73,.38,.05,i*.82,-.9,-.83,dark);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;canvas.getContext('2d').scale(.5,.5);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const display=new THREE.Mesh(new THREE.PlaneGeometry(.68,.33),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));display.position.set(i*.82,-.89,-.799);group.add(display);
    screens.push({ctx:canvas.getContext('2d'),texture});
    for(let j=0;j<3;j++)box(.06,.012,.012,i*.82+(j-1)*.09,-1.102,-.8,j===0?led:dimLed);
  }
  for(const side of [-1,1]){
    box(.29,.35,.38,side*1.47,-.96,-.7,frame);
    for(let i=0;i<4;i++){box(.045,.012,.04,side*1.47,-.86+i*.035,-.48,trim);}
    box(.016,.18,.016,side*1.31,-.91,-.78,led);
  }
  let last=-1000,screenIndex=0;
  function update(me,players,now){
    if(now-last<80)return;last=now;const refresh=screenIndex++%3;
    screens.forEach(({ctx:x},i)=>{
      if(me&&i!==refresh)return;
      x.fillStyle='#07121b';x.fillRect(0,0,512,256);x.strokeStyle='#173743';x.lineWidth=1;
      for(let n=0;n<512;n+=32){x.beginPath();x.moveTo(n,36);x.lineTo(n,230);x.stroke();}
      x.fillStyle='#90b7bf';x.font='16px monospace';x.fillText(['PROPULSION / VECTOR','TACTICAL / MARS ORBIT','WEAPONS / INTEGRITY'][i],18,25);
      x.fillStyle='#b4e0df';
      if(i===0){
        x.font='54px monospace';x.fillText(String(Math.round(me?.speed||0)).padStart(3,'0'),22,103);x.font='17px monospace';x.fillText('METERS / SECOND',22,134);
        x.fillStyle=me?.bst?'#ffd09c':'#66939f';x.fillText(me?.bst?'BOOST DRIVE ACTIVE':'CRUISE DRIVE ONLINE',22,167);
        x.fillStyle='#3b7180';x.fillRect(22,192,468*Math.min(1,(me?.speed||0)/252),8);x.fillStyle='#8fabb4';x.fillText('HDG '+Math.round(((me?.yaw||0)*180/Math.PI+360)%360).toString().padStart(3,'0')+'   PITCH '+Math.round((me?.pitch||0)*180/Math.PI),22,232);
      }else if(i===1){
        x.strokeStyle='#3c6571';for(let r=34;r<=90;r+=28){x.beginPath();x.arc(256,147,r,0,Math.PI*2);x.stroke();}
        x.fillStyle='#b4e0df';x.fillRect(253,143,6,9);
        if(me)for(const p of players){if(p.id===me.id||p.dead)continue;const dx=p.pos[0]-me.pos[0],dz=p.pos[2]-me.pos[2],c=Math.cos(me.yaw),s=Math.sin(me.yaw);const a=(dx*c+dz*s)*.067,b=(dz*c-dx*s)*.067;if(Math.hypot(a,b)>92)continue;x.fillStyle=p.team===me.team?'#8ccbd7':'#ed9f77';x.fillRect(253+a,144+b,6,6);}
      }else{
        x.font='18px monospace';x.fillText('HULL '+(me?.hp??'—')+' HP',22,66);x.fillStyle='#66b2aa';const max=SHIPS[me?.ship]?.hp||170;x.fillRect(22,85,468*(me?.hp||0)/max,8);
        x.fillStyle='#8dbcc4';x.fillText('PULSE LASER / ONLINE',22,131);x.fillStyle='#e1b68d';x.fillText(me?.mcd>0?'ROCKET / RELOAD '+me.mcd.toFixed(1)+'s':me?.lockProgress>=1?'ROCKET / TARGET LOCKED':'ROCKET / SEEKING TARGET',22,171);
        x.fillStyle='#658e9b';x.fillText('GUIDANCE '+Math.round((me?.lockProgress||0)*100)+'%',22,214);
      }
      screens[i].texture.needsUpdate=true;
    });
  }
  const batches=new Map();
  for(const mesh of [...group.children]){
    if(mesh.material.map)continue;mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);
    if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(mesh.geometry);group.remove(mesh);
  }
  for(const [material,parts] of batches){group.add(new THREE.Mesh(mergeGeometries(parts),material));parts.forEach(g=>g.dispose());}
  // Cockpit instruments sit in the foreground even when the uploaded shell crosses them, and still hide laser bolts behind them.
  group.traverse(o=>{if(o.isMesh){o.material.depthTest=false;o.material.depthWrite=true;o.renderOrder=o.material.map?102:101;}});
  update(null,[],0);return {group,update};
}
