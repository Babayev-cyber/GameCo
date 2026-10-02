import * as THREE from './three.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {loadModel} from './models.js';
import {createShip,disposeShip} from './ships.js';
import {createLasers} from './lasers.js';
import {MONSTER_TYPES,terrainHeight,SURFACE_ROCKS,LANDING_MS,SOLDIER_HP} from './surface-rules.js';
import {mulberry32} from './glsl.js';

export function createSurfaceGame({renderer,send,leave,laserAudio}){
 const ui=document.createElement('section');ui.id='surface-hud';ui.className='hidden';
 ui.innerHTML=`<div class="surface-top"><div><small>OPERATION / SECOND CONTACT</small><h2>MARS <span>SURFACE</span></h2></div><div class="surface-wave">WAVE <b id="surface-wave">1 / 3</b><small id="surface-enemies"></small></div><button id="surface-sound">SOUND</button><button id="surface-exit">EXIT</button></div>
 <div id="surface-landing"><small>ORBIT SECURED</small><h2>DESCENDING TO MARS</h2><p>Landing thrusters engaged. Prepare to disembark.</p><div><i id="descent-progress"></i></div></div>
 <div id="surface-role"></div><div id="surface-crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="surface-hit"></div><div id="surface-markers"></div><div id="surface-damage"></div>
 <div class="surface-bottom"><div class="surface-health"><small>SUIT INTEGRITY</small><strong id="surface-hp">120</strong><span><i id="surface-health-fill"></i></span></div><div><small id="surface-status">PULSE LASER / ONLINE</small><p>WASD move · SHIFT sprint · LEFT CLICK laser · RIGHT CLICK aim</p><small class="surface-look-hint">Click the view for mouse look. ESC releases the mouse.</small></div><div><small>SQUAD</small><strong id="surface-squad"></strong></div></div>
 <div id="surface-death" class="hidden"><small>SUIT BREACHED</small><h2>GAME OVER</h2><p>Your squad is still fighting.</p><button id="surface-redeploy">REDEPLOY</button></div>
 <div id="surface-touch"><div id="surface-stick"><i></i><span>MOVE</span></div><div class="surface-touch-actions"><button id="surface-aim">AIM</button><button id="surface-fire">LASER</button><button id="surface-sprint">SPRINT</button></div></div>`;
 document.body.append(ui);const $=id=>document.getElementById(id);
 $('surface-exit').onclick=leave;$('surface-sound').onclick=()=>document.getElementById('sound').click();$('surface-redeploy').onclick=()=>send({type:'surfaceRespawn'});
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xb9785d);scene.fog=new THREE.FogExp2(0xb9785d,.006);
 const camera=new THREE.PerspectiveCamera(74,innerWidth/innerHeight,.035,650);camera.rotation.order='YXZ';scene.add(camera);
 scene.add(new THREE.HemisphereLight(0xffd5b1,0x4b2720,1.5));const sun=new THREE.DirectionalLight(0xffead0,2.1);sun.position.set(-60,100,-40);scene.add(sun);
 const groundGeo=new THREE.PlaneGeometry(380,380,72,72);groundGeo.rotateX(-Math.PI/2);const p=groundGeo.attributes.position;
 for(let i=0;i<p.count;i++)p.setY(i,terrainHeight(p.getX(i),p.getZ(i)));groundGeo.computeVertexNormals();
 const ground=groundGeo.toNonIndexed(),colors=new Float32Array(ground.attributes.position.count*3),color=new THREE.Color(),random=mulberry32(208605);
 for(let i=0;i<ground.attributes.position.count;i+=3){const noise=random();color.setHSL(.028+noise*.014,.5,.23+noise*.04);for(let j=0;j<3;j++)color.toArray(colors,(i+j)*3);}
 ground.setAttribute('color',new THREE.BufferAttribute(colors,3));scene.add(new THREE.Mesh(ground,new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true})));groundGeo.dispose();
 const rockGeo=new THREE.IcosahedronGeometry(1,0),rockMat=new THREE.MeshLambertMaterial({color:0x9d6b51,flatShading:true}),rocks=new THREE.InstancedMesh(rockGeo,rockMat,SURFACE_ROCKS.length),dummy=new THREE.Object3D();
 SURFACE_ROCKS.forEach((r,i)=>{dummy.position.set(r.x,terrainHeight(r.x,r.z)+r.r*.45,r.z);dummy.rotation.set(.2,r.rotation,.17);dummy.scale.set(r.r,r.r*.9,r.r);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);rocks.setColorAt(i,new THREE.Color().setHSL(.04,.25,.24+(i%4)*.035));});scene.add(rocks);
 const peaks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshLambertMaterial({color:0x8d5944,flatShading:true}),24);
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=180+Math.sin(i*7)*25;dummy.position.set(Math.cos(a)*r,0,Math.sin(a)*r);dummy.rotation.set(.16,a,.12*Math.sin(i));dummy.scale.set(20+i%3*6,25+i%5*9,22);dummy.updateMatrix();peaks.setMatrixAt(i,dummy.matrix);}scene.add(peaks);
 const pad=new THREE.Mesh(new THREE.CylinderGeometry(9,9,.25,12),new THREE.MeshLambertMaterial({color:0x45434a,flatShading:true}));pad.position.set(-18,terrainHeight(-18,20)+.1,20);scene.add(pad);
 const sky=new THREE.Mesh(new THREE.SphereGeometry(550,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v;void main(){float y=normalize(v).y;vec3 c=mix(vec3(.68,.37,.24),vec3(.27,.13,.12),smoothstep(0.,.9,y));c=mix(c,vec3(.84,.59,.39),exp(-abs(y)*12.)*.5);gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}'}));scene.add(sky);
 // A single point draw gives the surface a light haze of wind-blown dust.
 const dustPositions=new Float32Array(220*3);for(let i=0;i<220;i++){dustPositions[i*3]=Math.sin(i*47.3)*120;dustPositions[i*3+1]=1+(i%11)*.7;dustPositions[i*3+2]=Math.cos(i*19.7)*120;}
 const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));scene.add(new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xf0bf8b,size:.055,transparent:true,opacity:.24,depthWrite:false})));
 const weapon=new THREE.Group();camera.add(weapon);const hands=new THREE.Group();weapon.add(hands);
 const suit=new THREE.MeshLambertMaterial({color:0xbd6b36,flatShading:true}),glove=new THREE.MeshLambertMaterial({color:0x343c41,flatShading:true});
 function limb(parent,a,b,r,mat){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r*1.1,start.distanceTo(end),6),mat);mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());parent.add(mesh);return mesh;}
 limb(hands,[.36,-.5,-.15],[.27,-.34,-.45],.07,suit);limb(hands,[-.2,-.5,-.18],[.09,-.34,-.91],.07,suit);
 const handGeo=new THREE.IcosahedronGeometry(.07,1);handGeo.scale(1,.85,1.3);
 for(const [x,y,z] of [[.26,-.29,-.46],[.09,-.29,-.91]]){const hand=new THREE.Mesh(handGeo,glove);hand.position.set(x,y,z);hands.add(hand);}
 let gun,gunLoaded=false;
 const ready=loadModel('gunlowpoly').then(async asset=>{
  const parts=[];asset.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));parts.push(g);});
  const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());const center=asset.bounds.getCenter(new THREE.Vector3());merged.translate(-center.x,-center.y,-center.z);merged.scale(1.45/asset.size.x,1.45/asset.size.x,1.45/asset.size.x);merged.rotateY(Math.PI/2);
  let material;asset.scene.traverse(o=>{if(o.isMesh&&!material)material=o.material.clone();});material.roughness=.65;material.metalness=.25;
  gun=new THREE.Mesh(merged,material);gun.position.set(.23,-.3,-.79);weapon.add(gun);await renderer.compileAsync(scene,camera);gunLoaded=true;document.documentElement.dataset.gunlowpoly='loaded';
 });
 function painted(geometry,tint,x=0,y=0,z=0){const g=geometry.toNonIndexed();g.translate(x,y,z);g.deleteAttribute('uv');const a=new Float32Array(g.attributes.position.count*3),c=new THREE.Color(tint);for(let i=0;i<a.length;i+=3)c.toArray(a,i);g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}
 const creatureMat=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}),legGeo=new THREE.CylinderGeometry(.14,.1,.65,5),armGeo=new THREE.CylinderGeometry(.12,.08,.8,5),eyeGeo=new THREE.BoxGeometry(.14,.07,.05),eyeMat=new THREE.MeshBasicMaterial({color:0xff7057});
 const soldierGeo=new THREE.CapsuleGeometry(.27,.65,2,6),helmetGeo=new THREE.IcosahedronGeometry(.3,1);
 const creatureTemplates=new Map();
 function creature(type){
  const spec=MONSTER_TYPES[type];let template=creatureTemplates.get(type);
  if(!template){const parts=[painted(new THREE.IcosahedronGeometry(.62,0),spec.color,0,1.05,0),painted(new THREE.IcosahedronGeometry(.37,0),spec.color,0,1.72,.13)];
   for(const side of [-1,1])parts.push(painted(new THREE.ConeGeometry(.1,.48,4),0xc7ab89,side*.23,2.02,.08));const body=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());template={body,limbMat:new THREE.MeshLambertMaterial({color:spec.color,flatShading:true})};creatureTemplates.set(type,template);
  }
  const root=new THREE.Group();root.scale.setScalar(spec.size);root.add(new THREE.Mesh(template.body,creatureMat));const legs=[],arms=[];
  for(const side of [-1,1]){const leg=new THREE.Mesh(legGeo,template.limbMat);leg.position.set(side*.26,.38,0);root.add(leg);legs.push(leg);const arm=new THREE.Mesh(armGeo,template.limbMat);arm.position.set(side*.67,1.05,.06);arm.rotation.z=side*.3;root.add(arm);arms.push(arm);const eye=new THREE.Mesh(eyeGeo,eyeMat);eye.position.set(side*.14,1.79,.45);root.add(eye);}
  root.userData={legs,arms};return root;
 }
 const monsters=new Map(),soldiers=new Map(),landedShips=[];let state,myId,lastPhase,lastLaunch,localYaw=0,localPitch=0,aim=false,fire=false,mouseTouch=null,recoil=0,previousHp,readyPosition=false,lastSend=0,joy={x:0,z:0},touchSprint=false;
 const keys=new Set(),goal=new THREE.Vector3(),point=new THREE.Vector3(),muzzle=new THREE.Vector3();
 const lasers=createLasers(scene,{scale:.22,standoff:false});
 function participating(){return state?.phase==='surface'&&state.surface.soldiers.some(s=>s.id===myId&&!s.dead);}
 function clearControls(){keys.clear();fire=false;aim=false;joy={x:0,z:0};touchSprint=false;mouseTouch=null;}
 function clear(){for(const {root,label} of monsters.values()){scene.remove(root);label.remove();}monsters.clear();for(const root of soldiers.values())scene.remove(root);soldiers.clear();for(const ship of landedShips){scene.remove(ship);disposeShip(ship);}landedShips.length=0;lasers.clear();clearControls();previousHp=undefined;readyPosition=false;}
 function sync(m,id){
  state=m;myId=id;const active=!!m.surface&&['landing','surface','ended'].includes(m.phase);ui.classList.toggle('hidden',!active);document.body.classList.toggle('surface-mode',active);
  if(!active){if(lastPhase==='surface'||lastPhase==='landing'||lastPhase==='ended')clear();lastPhase=m.phase;return;}
  if(m.launchId!==lastLaunch||m.phase==='landing'&&lastPhase!=='landing'){clear();lastLaunch=m.launchId;localYaw=localPitch=0;}
  if(m.phase!==lastPhase){clearControls();if(m.phase!=='surface'&&document.pointerLockElement)document.exitPointerLock();lastPhase=m.phase;}
  const me=m.surface.soldiers.find(s=>s.id===myId),leader=me||m.surface.soldiers.find(s=>!s.dead)||m.surface.soldiers[0];
  $('surface-landing').classList.toggle('hidden',m.phase!=='landing');$('surface-crosshair').classList.toggle('hidden',!me||m.phase!=='surface'||!!me.dead);
  $('surface-role').textContent=!me?'SPECTATING '+(m.surface.team===0?'ARES':'ORION')+' · Enemy fleet destroyed':m.surface.nextWaveIn>0?'SECTOR CLEAR · NEXT WAVE IN '+Math.ceil(m.surface.nextWaveIn)+'s':'ELIMINATE ALL HOSTILES';
  $('surface-wave').textContent=m.surface.wave+' / '+m.surface.waveTotal;$('surface-enemies').textContent=m.surface.monsters.filter(b=>!b.dead).length+' HOSTILES REMAIN';
  $('surface-hp').textContent=me?.hp??'—';$('surface-health-fill').style.width=(me?.hp||0)/SOLDIER_HP*100+'%';$('surface-squad').textContent=m.surface.soldiers.filter(s=>!s.dead).length+' / '+m.surface.soldiers.length;
  $('surface-death').classList.toggle('hidden',!me?.dead||m.phase!=='surface');$('surface-redeploy').disabled=!!me?.dead&&m.serverTime-me.dead<4000;
  if(me&&previousHp!==undefined&&me.hp<previousHp){$('surface-damage').getAnimations().forEach(a=>a.cancel());$('surface-damage').animate([{opacity:.6},{opacity:0}],{duration:380});}previousHp=me?.hp;
  for(const b of m.surface.monsters){if(!monsters.has(b.id)){const root=creature(b.type);root.position.set(...b.pos);scene.add(root);const label=document.createElement('div');label.className='creature-marker';label.innerHTML='<span></span><i><b></b></i>';$('surface-markers').append(label);monsters.set(b.id,{root,label});}const entry=monsters.get(b.id);entry.label.querySelector('span').textContent=MONSTER_TYPES[b.type].name+' / '+b.hp;entry.label.querySelector('b').style.width=b.hp/b.maxHp*100+'%';}
  for(const [id,entry] of monsters)if(!m.surface.monsters.some(b=>b.id===id)){scene.remove(entry.root);entry.label.remove();monsters.delete(id);}
  for(const s of m.surface.soldiers){if(s.id===myId||s.dead)continue;if(!soldiers.has(s.id)){const g=new THREE.Group();g.add(new THREE.Mesh(soldierGeo,suit));const helmet=new THREE.Mesh(helmetGeo,glove);helmet.position.y=.72;g.add(helmet);scene.add(g);soldiers.set(s.id,g);}const g=soldiers.get(s.id);g.position.set(s.pos[0],s.pos[1]-.65,s.pos[2]);g.rotation.y=s.yaw;g.visible=!s.dead;}
  for(const [id,g] of soldiers)g.visible=m.surface.soldiers.some(s=>s.id===id&&!s.dead);
  if(!landedShips.length)for(let i=0;i<m.surface.soldiers.length;i++){const ship=createShip({ship:m.players.find(p=>p.id===m.surface.soldiers[i].id)?.ship||'interceptor',team:m.surface.team});ship.scale.setScalar(.3);const x=-18-i%4*13,z=20+Math.floor(i/4)*16;ship.position.set(x,terrainHeight(x,z)+1.5,z);scene.add(ship);landedShips.push(ship);}
  for(const shot of m.surface.shots){const own=shot.by===myId;const from=own?camera.localToWorld(muzzle.set(aim?0:.23,-.2,-1.35)).toArray():shot.from;lasers.fire({...shot,from,own,hit:!!shot.hit});laserAudio.shot(own?0:camera.position.distanceTo(point.fromArray(from)));if(own){recoil=.035;if(shot.hit){$('surface-hit').textContent='HIT';$('surface-hit').getAnimations().forEach(a=>a.cancel());$('surface-hit').animate([{opacity:1},{opacity:0}],{duration:220});}}}
  if(m.phase==='ended'){document.getElementById('winner').textContent=m.surface.outcome==='cleared'?'MARS SECURED.':'MISSION FAILED.';document.getElementById('final-score').textContent=m.surface.kills+' monsters eliminated · Wave '+m.surface.wave+' / '+m.surface.waveTotal;document.getElementById('rematch').textContent=m.practice?'REPLAY OPERATION':'RETURN TO FLIGHT DECK';}
  if(leader&&!readyPosition&&m.phase==='surface'){camera.position.set(...leader.pos);readyPosition=true;}
 }
 function frame(dt,now){
  if(!state?.surface||!['landing','surface','ended'].includes(state.phase))return false;
  const me=state.surface.soldiers.find(s=>s.id===myId),view=me&&!me.dead?me:state.surface.soldiers.find(s=>!s.dead)||me||state.surface.soldiers[0];
  if(!view)return false;
  if(state.phase==='landing'){const elapsed=1-Math.max(0,Math.min(1,(state.landingEndsAt-state.serverTime-(Date.now()-receivedAt))/LANDING_MS)),ease=elapsed*elapsed*(3-2*elapsed);camera.position.set(8*(1-ease)+view.pos[0]*ease,75*(1-ease)+view.pos[1]*ease,55*(1-ease)+view.pos[2]*ease);camera.lookAt(view.pos[0],view.pos[1],view.pos[2]-20);$('descent-progress').style.width=elapsed*100+'%';}
  else{goal.set(...view.pos);camera.position.lerp(goal,1-Math.exp(-dt*25));if(me&&!me.dead){if(keys.has('ArrowLeft'))localYaw+=dt*1.5;if(keys.has('ArrowRight'))localYaw-=dt*1.5;if(keys.has('ArrowUp'))localPitch=Math.min(1.35,localPitch+dt);if(keys.has('ArrowDown'))localPitch=Math.max(-1.35,localPitch-dt);camera.rotation.set(localPitch,localYaw,0);}else camera.rotation.set(view.pitch,view.yaw,0);}
  const aiming=participating()&&aim;ui.classList.toggle('aiming',aiming);weapon.visible=gunLoaded&&!!me&&!me.dead&&state.phase==='surface';
  const moving=me?.speed>0,bob=moving?Math.sin(now*.012)*.008:Math.sin(now*.002)*.002;recoil*=Math.exp(-dt*20);
  const narrow=camera.aspect<.8;weapon.scale.setScalar(narrow?.82:1);
  if(gun){gun.position.x+=( (aiming?0:narrow?.12:.23)-gun.position.x)*(1-Math.exp(-dt*16));gun.position.y+=( (aiming?-.225:-.3)+bob-gun.position.y)*(1-Math.exp(-dt*16));gun.position.z=(narrow?-.97:aiming?-.86:-.79)+recoil;gun.rotation.x=recoil*.55;hands.position.x=gun.position.x-.23;hands.position.y=(aiming?.07:0)+bob;}
  const targetFov=aiming?49:participating()&&(keys.has('ShiftLeft')||touchSprint)?79:74;camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-dt*12));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();sky.position.copy(camera.position);
  for(const b of state.surface.monsters){const entry=monsters.get(b.id);if(!entry)continue;const {root,label}=entry;root.position.lerp(point.fromArray(b.pos),1-Math.exp(-dt*18));root.rotation.y=b.yaw;
   if(b.dead){root.rotation.z+=(Math.PI/2-root.rotation.z)*(1-Math.exp(-dt*6));root.scale.setScalar(b.size*.9);label.hidden=true;continue;}
   const gait=Math.sin(now*.009+b.id.charCodeAt(2));root.userData.legs.forEach((leg,i)=>leg.rotation.x=gait*(i?-.4:.4));root.userData.arms.forEach((arm,i)=>arm.rotation.x=gait*(i?.2:-.2));
   point.copy(root.position);point.y+=b.size*2.45;point.project(camera);const visible=point.z<1&&Math.abs(point.x)<.93&&Math.abs(point.y)<.88;label.hidden=!visible;label.style.transform=`translate3d(${(point.x*.5+.5)*innerWidth}px,${(-point.y*.5+.5)*innerHeight}px,0) translate(-50%,-100%)`;
  }
  for(let i=0;i<dustPositions.length;i+=3){dustPositions[i]+=dt*.65;if(dustPositions[i]>120)dustPositions[i]=-120;}dustGeo.attributes.position.needsUpdate=true;
  if(participating()&&now-lastSend>50){lastSend=now;send({type:'surfaceInput',moveX:Math.max(-1,Math.min(1,Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+joy.x)),moveZ:Math.max(-1,Math.min(1,Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+joy.z)),yaw:localYaw,pitch:localPitch,aim,fire:fire||keys.has('Space'),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||touchSprint});}
  lasers.update(dt);renderer.render(scene,camera);return true;
 }
 let receivedAt=0;
 const originalSync=sync;function receive(m,id){receivedAt=Date.now();originalSync(m,id);}
 window.addEventListener('keydown',e=>{if(!participating()||e.target.closest('input'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('pointerdown',e=>{if(!participating()||e.target.closest('button,input,#surface-stick'))return;if(e.pointerType==='mouse'){if(e.button===0){fire=true;if(!document.pointerLockElement)renderer.domElement.requestPointerLock?.()?.catch(()=>{});}if(e.button===2)aim=true;}else mouseTouch={id:e.pointerId,x:e.clientX,y:e.clientY};});
 window.addEventListener('pointermove',e=>{if(!participating()||e.target.closest('button,input,#surface-stick'))return;let dx,dy;if(e.pointerType==='mouse'){dx=e.movementX;dy=e.movementY;}else{if(mouseTouch?.id!==e.pointerId)return;dx=e.clientX-mouseTouch.x;dy=e.clientY-mouseTouch.y;mouseTouch.x=e.clientX;mouseTouch.y=e.clientY;}const sensitivity=aim?.0013:.0025;localYaw-=dx*sensitivity;localPitch=Math.max(-1.35,Math.min(1.35,localPitch-dy*sensitivity));});
 window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){if(e.button===0)fire=false;if(e.button===2)aim=false;}if(mouseTouch?.id===e.pointerId)mouseTouch=null;});window.addEventListener('contextmenu',e=>{if(participating())e.preventDefault();});
 window.addEventListener('blur',clearControls);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){fire=false;keys.clear();}});
 $('surface-aim').onclick=()=>{if(participating())aim=!aim;};
 for(const [id,set] of [['surface-fire',v=>fire=v],['surface-sprint',v=>touchSprint=v]]){const button=$(id);button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(participating())set(true);};for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,()=>set(false));}
 const stick=$('surface-stick');let stickId;function moveStick(e){const r=stick.getBoundingClientRect();joy.x=Math.max(-1,Math.min(1,(e.clientX-r.x-r.width/2)/40));joy.z=Math.max(-1,Math.min(1,-(e.clientY-r.y-r.height/2)/40));stick.querySelector('i').style.transform=`translate(${joy.x*28}px,${-joy.z*28}px)`;}
 stick.onpointerdown=e=>{e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(stickId);moveStick(e);};stick.onpointermove=e=>{if(e.pointerId===stickId)moveStick(e);};for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,()=>{stickId=null;joy={x:0,z:0};stick.querySelector('i').style.transform='';});
 return {ready,sync:receive,frame,reset(){state=null;clear();ui.classList.add('hidden');document.body.classList.remove('surface-mode');if(document.pointerLockElement)document.exitPointerLock();},diagnostics:()=>({aim,gunLoaded,yaw:localYaw,pitch:localPitch,monsters:state?.surface?.monsters,soldiers:state?.surface?.soldiers,laser:laserAudio.diagnostics(),phase:state?.phase})};
}
