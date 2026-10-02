import * as THREE from './three.js';
import {loadModel,modelInstance} from './models.js';
import {puffTexture,flareTexture,glowTexture} from './textures.js';
export function createCombatEffects(scene,onLaunch=()=>{}){
 const bursts=[],burstPool=[],rockets=new Map(),flashes=[],flashPool=[],modelBursts=[],assets={};
 const axis=new THREE.Vector3(0,0,-1),wanted=new THREE.Vector3();
 for(const name of ['missile','vertical_launch_missile','sparksexplosion'])loadModel(name).then(a=>{assets[name]=a;document.documentElement.dataset[name]='loaded';}).catch(()=>{document.documentElement.dataset[name]='failed';});
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gr=ctx.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#ffffff');gr.addColorStop(.12,'#ffefce');gr.addColorStop(.35,'#ff9e4466');gr.addColorStop(1,'#ff660000');ctx.fillStyle=gr;ctx.fillRect(0,0,64,64);const map=new THREE.CanvasTexture(canvas);
 const glow=new THREE.SpriteMaterial({map,color:0xffbc69,transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
 const armor=new THREE.MeshStandardMaterial({color:0xa9a69b,metalness:.65,roughness:.4});
 const bodyGeo=new THREE.CylinderGeometry(.8,.8,7,12),noseGeo=new THREE.ConeGeometry(.8,2,12),finGeo=new THREE.BoxGeometry(4,.15,2);
 function releaseFlash(f){scene.remove(f.sprite);if(flashPool.length<32)flashPool.push(f.sprite);else f.sprite.material.dispose();}
 function flash(pos,size=5){const sprite=flashPool.pop()||new THREE.Sprite(glow.clone());sprite.position.set(...pos);sprite.scale.setScalar(size);sprite.material.opacity=.65;scene.add(sprite);flashes.push({sprite,age:0,size});if(flashes.length>32)releaseFlash(flashes.shift());}
 function removeModel(b){scene.remove(b.model);for(const m of b.materials)m.dispose();}
 function modelBurst(pos){
  if(!assets.sparksexplosion||modelBursts.length>=3)return;
  const model=modelInstance(assets.sparksexplosion,18),materials=[];model.position.set(...pos);model.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.depthWrite=false;o.material.blending=THREE.AdditiveBlending;o.material.emissiveIntensity=.2;materials.push(o.material);}});scene.add(model);modelBursts.push({model,materials,age:0});
 }
 function releaseBurst(b){scene.remove(b.points);if(burstPool.length<20)burstPool.push(b);else{b.points.geometry.dispose();b.points.material.dispose();}}
 function burst(pos,large=false){
  if(large)modelBurst(pos);if(bursts.length>=20)releaseBurst(bursts.shift());
  let b=burstPool.pop();if(!b){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(240),3).setUsage(THREE.DynamicDrawUsage));const material=new THREE.PointsMaterial({map,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});const points=new THREE.Points(geometry,material);points.frustumCulled=false;b={points,velocity:new Float32Array(240)};}
  b.age=0;b.life=large?1.2:.35;b.count=large?80:24;b.points.position.set(...pos);b.points.geometry.attributes.position.array.fill(0);b.points.geometry.attributes.position.needsUpdate=true;b.points.geometry.setDrawRange(0,b.count);b.points.material.color.set(large?0xffad69:0xb9e9ff);b.points.material.size=large?2.2:1.1;b.points.material.opacity=.8;
  for(let i=0;i<b.count;i++){wanted.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize().multiplyScalar(large?20+Math.random()*65:10+Math.random()*25);wanted.toArray(b.velocity,i*3);}
  scene.add(b.points);bursts.push(b);flash(pos,large?22:4);
 }
 // Rocket launch: ignition flare, an orange light that washes the cockpit or nearby hulls, and smoke
 // blown back off the rail. Smoke sprites blend normally; hot sprites are additive HDR so they bloom.
 const puffs=[],puffPool=[],smokeMap=puffTexture(),flareMap=flareTexture(),hotMap=glowTexture();
 const ignition=new THREE.Color(4.5,2.8,1.4),fireGlow=new THREE.Color(2.2,.85,.25),smokeColor=new THREE.Color(0x8f8a84),trailSmoke=new THREE.Color(0xa29b93);
 const launchLight=new THREE.PointLight(0xff9a4a,0,80,2);scene.add(launchLight);let lightAge=1;
 const back=new THREE.Vector3(),drift=new THREE.Vector3(),origin=new THREE.Vector3();
 function releasePuff(p){scene.remove(p.s);if(puffPool.length<90)puffPool.push(p.s);else p.s.material.dispose();}
 function particle(map,pos,{color,opacity=1,size,grow=1,life,vel=null,drag=0,additive=false,delay=0,fade=1}){
  if(puffs.length>=90)releasePuff(puffs.shift());
  const s=puffPool.pop()||new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false}));
  const m=s.material;m.map=map;m.blending=additive?THREE.AdditiveBlending:THREE.NormalBlending;m.color.copy(color);m.opacity=0;m.rotation=Math.random()*Math.PI*2;
  s.position.copy(pos);s.scale.setScalar(size);s.visible=delay<=0;scene.add(s);
  puffs.push({s,age:-delay,life,size,grow,opacity,fade,drag,spin:(Math.random()-.5)*1.4,vel:vel?vel.clone():new THREE.Vector3()});
 }
 function launchBlast(pos,dir){
  origin.fromArray(pos);back.fromArray(dir).normalize().negate();
  particle(flareMap,origin,{color:ignition,size:5,grow:1.3,life:.15,additive:true,fade:2});
  particle(hotMap,origin,{color:fireGlow,size:9,grow:.7,life:.3,additive:true,fade:2});
  for(let i=0;i<10;i++){drift.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(14).addScaledVector(back,10+Math.random()*16);
   particle(smokeMap,origin,{color:smokeColor,opacity:.32+Math.random()*.15,size:2.2+Math.random()*1.6,grow:2.5+Math.random()*1.5,life:1+Math.random()*.6,vel:drift,drag:2.2,delay:Math.random()*.06});}
  launchLight.position.copy(origin);lightAge=0;
 }
 function removeRocket(r){scene.remove(r.group,r.trail);r.trail.geometry.dispose();r.trail.material.dispose();}
 function sync(missiles){
  const now=performance.now(),ids=new Set();
  for(const m of missiles){ids.add(m.id);let r=rockets.get(m.id);
   if(!r){
    const group=new THREE.Group();group.name='launched-rocket';const fins=[];
    const asset=assets[m.team===0?'vertical_launch_missile':'missile'];
    if(asset){const uploaded=modelInstance(asset,9,true);group.add(uploaded);for(let i=0;i<2;i++){const fin=new THREE.Mesh(finGeo,armor);fin.rotation.z=i*Math.PI/2;fin.position.z=2.7;group.add(fin);fins.push(fin);}}
    else{const body=new THREE.Mesh(bodyGeo,armor);body.rotation.x=Math.PI/2;group.add(body);const nose=new THREE.Mesh(noseGeo,armor);nose.rotation.x=-Math.PI/2;nose.position.z=-4.5;group.add(nose);for(let i=0;i<2;i++){const fin=new THREE.Mesh(finGeo,armor);fin.rotation.z=i*Math.PI/2;fin.position.z=2;group.add(fin);fins.push(fin);}}
    const exhaust=new THREE.Sprite(glow);exhaust.position.z=5;exhaust.scale.setScalar(3);group.add(exhaust);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(72),3).setUsage(THREE.DynamicDrawUsage));const colors=new Float32Array(72);for(let i=0;i<24;i++){const f=1-i/24;colors.set([f,f*.65,f*.3],i*3);}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setDrawRange(0,0);
    const trail=new THREE.Line(geo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));trail.frustumCulled=false;scene.add(group,trail);group.position.set(...m.pos);
    r={group,trail,exhaust,fins,age:0,target:new THREE.Vector3(...m.pos),direction:new THREE.Vector3(...m.dir),velocity:new THREE.Vector3(),updated:now,history:new Float32Array(72),historyCount:0,trailAge:0,smokeAge:0};rockets.set(m.id,r);launchBlast(m.pos,m.dir);onLaunch(m);
   }
   const elapsed=Math.max(.02,(now-r.updated)/1000);r.velocity.set(...m.pos).sub(r.target).divideScalar(elapsed);if(r.velocity.length()>350)r.velocity.setLength(350);r.target.set(...m.pos);r.direction.set(...m.dir).normalize();r.updated=now;
  }
  for(const [id,r] of rockets)if(!ids.has(id)){removeRocket(r);rockets.delete(id);}
 }
 function update(dt){
  const now=performance.now();
  for(let i=modelBursts.length-1;i>=0;i--){const b=modelBursts[i];b.age+=dt;b.model.scale.setScalar(1+b.age*.6);for(const m of b.materials)m.opacity=Math.max(0,1-b.age/.65)*.6;if(b.age>.65){removeModel(b);modelBursts.splice(i,1);}}
  for(const r of rockets.values()){
   r.age+=dt;wanted.copy(r.target).addScaledVector(r.velocity,Math.min(.1,(now-r.updated)/1000));r.group.position.lerp(wanted,1-Math.exp(-dt*28));r.group.quaternion.setFromUnitVectors(axis,r.direction);r.fins.forEach(f=>f.scale.x=Math.min(1,.25+r.age*3));
   // Ignition burn: an oversized, flickering flame while the motor spools up, and thick smoke until it is clear of the rail.
   const burn=1+Math.max(0,1-r.age/.55)*1.6,flicker=.85+Math.random()*.3;r.exhaust.scale.set(2.4*burn*flicker,(3.5+Math.min(r.age,1)*2)*burn*flicker,1);
   r.smokeAge+=dt;const smokeEvery=r.age<.8?.045:.12;if(r.age<2.5&&r.smokeAge>=smokeEvery){r.smokeAge=0;origin.copy(r.group.position).addScaledVector(r.direction,-5);drift.set(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(4);
    particle(smokeMap,origin,{color:trailSmoke,opacity:r.age<.8?.42:.22,size:1.6+Math.random(),grow:2.6,life:r.age<.8?1.3:.8,vel:drift,drag:1.5});}
   r.trailAge+=dt;if(r.trailAge>=1/30){r.trailAge=0;r.history.copyWithin(3,0,69);r.group.position.toArray(r.history);r.historyCount=Math.min(24,r.historyCount+1);r.trail.geometry.attributes.position.array.set(r.history);r.trail.geometry.attributes.position.needsUpdate=true;r.trail.geometry.setDrawRange(0,r.historyCount);}
  }
  for(let i=puffs.length-1;i>=0;i--){const p=puffs[i];p.age+=dt;if(p.age<0)continue;p.s.visible=true;const t=p.age/p.life;if(t>=1){releasePuff(p);puffs.splice(i,1);continue;}
   p.vel.multiplyScalar(Math.exp(-p.drag*dt));p.s.position.addScaledVector(p.vel,dt);p.s.scale.setScalar(p.size*(1+p.grow*(1-(1-t)*(1-t))));p.s.material.rotation+=p.spin*dt;p.s.material.opacity=p.opacity*Math.min(1,t/.06)*Math.pow(1-t,p.fade);}
  if(lightAge<.3){lightAge+=dt;const t=Math.max(0,1-lightAge/.3);launchLight.intensity=650*t*t;}else launchLight.intensity=0;
  for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.age+=dt;f.sprite.scale.setScalar(f.size*(1+f.age*2));f.sprite.material.opacity=Math.max(0,1-f.age/.16)*.65;if(f.age>.16){releaseFlash(f);flashes.splice(i,1);}}
  for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.age+=dt;if(b.age>b.life){releaseBurst(b);bursts.splice(i,1);continue;}const a=b.points.geometry.attributes.position.array;for(let j=0;j<b.count*3;j++)a[j]=b.velocity[j]*b.age;b.points.geometry.attributes.position.needsUpdate=true;b.points.material.opacity=(1-b.age/b.life)*.8;}
 }
 function clear(){sync([]);while(modelBursts.length)removeModel(modelBursts.pop());while(bursts.length)releaseBurst(bursts.pop());while(flashes.length)releaseFlash(flashes.pop());while(puffs.length)releasePuff(puffs.pop());lightAge=1;launchLight.intensity=0;}
 return {burst,sync,update,clear,flash,get active(){return flashes.length>0||lightAge<.3;}};
}
