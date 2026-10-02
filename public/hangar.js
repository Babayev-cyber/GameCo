import * as THREE from './three.js';
import {createShip,disposeShip} from './ships.js';
import {loadModel,modelInstance} from './models.js';
import {spacecraftEnvironment} from './lighting.js';
import {SHIPS} from './rules.js';
export function setupHangar(onSelect){
 const canvas=document.getElementById('hangar-view');
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,300);camera.position.set(38,26,-48);camera.lookAt(0,0,0);
 scene.environment=spacecraftEnvironment();scene.environmentIntensity=.9;renderer.toneMappingExposure=.85;
 scene.add(new THREE.HemisphereLight(0xc2e5ff,0x151321,2));const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-15,30,-20);scene.add(light);const edge=new THREE.DirectionalLight(0xff8656,3);edge.position.set(20,8,25);scene.add(edge);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(27,64),new THREE.MeshStandardMaterial({color:0x101c27,metalness:.65,roughness:.5}));floor.rotation.x=-Math.PI/2;floor.position.y=-7;scene.add(floor);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(24,.07,4,96),new THREE.MeshBasicMaterial({color:0x36586a}));ring.rotation.x=Math.PI/2;ring.position.y=-6.9;scene.add(ring);
 let model,last=performance.now(),drag=false,lastX=0,selected='interceptor',view='ship',cockpitAsset;
 loadModel('spaceship_cockpit').then(a=>{cockpitAsset=a;document.getElementById('preview-cockpit').disabled=false;}).catch(()=>{document.getElementById('preview-cockpit').textContent='UNAVAILABLE';});
 function showModel(){if(model){scene.remove(model);if(!model.userData.uploadedModel)disposeShip(model);else model.traverse(o=>{if(o.isMesh)o.material.dispose();});}if(view==='cockpit'&&cockpitAsset){model=modelInstance(cockpitAsset,32);model.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.emissiveIntensity=.08;if(/Duct_Tape|Marker|Paper/.test(o.material.name))o.visible=false;}});}else model=createShip({ship:selected,team:0});scene.add(model);document.querySelectorAll('[data-preview]').forEach(b=>b.classList.toggle('selected',b.dataset.preview===view));}
 const specs={interceptor:{name:'INTERCEPTOR',label:'01 / LIGHT FIGHTER',role:'Fast interception. Precise strikes.',speed:105,hull:85},vanguard:{name:'VANGUARD',label:'02 / MULTIROLE FIGHTER',role:'Balanced speed and hull protection.',speed:80,hull:120},sentinel:{name:'SENTINEL',label:'03 / HEAVY DEFENDER',role:'Heavy armor. Built to hold the line.',speed:65,hull:160}};
 function select(id){selected=id;showModel();const s=specs[id];document.getElementById('hangar-class').textContent=s.label;document.getElementById('hangar-name').textContent=s.name;document.getElementById('hangar-role').textContent=s.role;document.getElementById('hangar-speed').textContent=SHIPS[id].speed+' m/s';document.getElementById('hangar-hull').textContent=SHIPS[id].hp+' HP';document.getElementById('speed-fill').style.width=s.speed/105*100+'%';document.getElementById('hull-fill').style.width=SHIPS[id].hp/320*100+'%';document.querySelectorAll('[data-ship]').forEach(b=>{b.classList.toggle('selected',b.dataset.ship===id);b.setAttribute('aria-pressed',String(b.dataset.ship===id));});onSelect(id);}
 document.querySelectorAll('[data-ship]').forEach(b=>b.onclick=()=>select(b.dataset.ship));
 document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{view=b.dataset.preview;showModel();});
 canvas.onpointerdown=e=>{drag=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(drag&&model){model.rotation.y+=(e.clientX-lastX)*.012;lastX=e.clientX;}};canvas.onpointerup=canvas.onpointercancel=()=>drag=false;
 const observer=new ResizeObserver(()=>{const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();});observer.observe(canvas);
 let lastRender=0,onScreen=true;
 new IntersectionObserver(entries=>{onScreen=entries[0].isIntersecting;}).observe(canvas);
 function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden||!onScreen||document.getElementById('menu').classList.contains('hidden'))return;if(!drag&&!matchMedia('(prefers-reduced-motion: reduce)').matches)model.rotation.y+=dt*.16;if(now-lastRender<32)return;lastRender=now;renderer.render(scene,camera);}select(selected);requestAnimationFrame(frame);
}
