import * as THREE from './three.js';
import {createSurfaceGame} from './surface-game.js';
import {createMars} from './mars.js';
import {loadModel,modelInstance} from './models.js';
import {setupHangar} from './hangar.js';
import {createShip,disposeShip,updateShip} from './ships.js';
import {FlightMotion} from './flight-motion.js';
import {adaptiveQuality} from './render-quality.js';
import {spacecraftEnvironment} from './lighting.js';
import {createInstruments} from './instruments.js';
import {createFlightAudio} from './flight-audio.js';
import {createCombatEffects} from './combat-effects.js';
import {createOrbitalSky} from './orbital-sky.js';
import {createLaunchSequence} from './launch-sequence.js';
import {createCombatAudio} from './combat-audio.js';
import {createLasers} from './lasers.js';
import {createLaserAudio} from './laser-audio.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const $=id=>document.getElementById(id);
function uiText(id,value){const node=$(id),text=String(value);if(node.textContent!==text)node.textContent=text;}
let ship='interceptor',size=4,myId,room,socket,muted=false,audio,toastTimer;
const flightAudio=createFlightAudio(()=>audio,()=>muted),laserAudio=createLaserAudio(()=>audio,()=>muted);
const combatAudio=createCombatAudio(()=>audio,()=>muted);let launch,surface;
const aimCursor={x:0,y:0};const keys=new Set();let mouseFire=false,mouseRocket=false,previousHull=null;
const motion=new FlightMotion();let lastPhase=null,lastRoster='';
try{muted=localStorage.getItem('mars-muted')==='1';}catch{}
if(muted){$('sound').textContent='SOUND OFF';$('sound').setAttribute('aria-pressed','false');}
const music=$('background-music');
music.volume=.40;
const nightMusic=$('night-music');
nightMusic.volume=.22;
const menuMusic=[music,nightMusic];
const matchMusic=$('match-music');let matchLaunchId=null;
function syncMusic(){
 launch?.syncSound();if(muted||document.hidden||room?.phase!=='playing'){combatAudio.stop();laserAudio.stop();}
 if(muted||document.hidden||room?.phase!=='playing')flightAudio.silence();
 const inMatch=['loading','countdown','playing','landing','surface'].includes(room?.phase);
 for(const track of menuMusic){if(muted||document.hidden||inMatch)track.pause();else track.play().catch(()=>{});}
 // Match soundtrack: starts from the top when the loading screen opens and loops until the match ends.
 if(!inMatch)matchLaunchId=null;else if(room.launchId!==matchLaunchId){matchLaunchId=room.launchId;matchMusic.currentTime=0;}
 matchMusic.volume=['playing','surface'].includes(room?.phase)?.45:.24;
 if(muted||document.hidden||!inMatch)matchMusic.pause();else matchMusic.play().catch(()=>{});
}
document.addEventListener('visibilitychange',syncMusic);
for(const track of menuMusic)track.addEventListener('error',()=>toast('Background music could not load. Please refresh.'));
function toast(m){$('toast').textContent=m;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4500);}
function transmit(m){if(socket?.readyState!==1)return toast('Server unavailable. Configure a multiplayer server to launch.');socket.send(JSON.stringify(m));}
function reset(){$('marswalk').hidden=false;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)$('marswalk').play().catch(()=>{});room=null;lastPhase=null;motion.clear();aimCursor.x=aimCursor.y=0;mouseFire=false;mouseRocket=false;previousHull=null;surface?.reset();launch?.reset();combatAudio.stop();effects.clear();lasers.clear();for(const model of ships.values()){scene.remove(model);disposeShip(model);}ships.clear();syncMusic();myId=null;keys.clear();document.body.classList.remove('playing','boosting');for(const id of ['lobby','hud','result'])$(id).classList.add('hidden');$('menu').classList.remove('hidden');cockpit.visible=false;$('target').classList.add('hidden');}
function connect(){if(location.hostname.endsWith('github.io')&&!window.GAME_SERVER_URL){$('connection').textContent='SERVER NOT CONFIGURED';return;}socket=new WebSocket(window.GAME_SERVER_URL||`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`);socket.onopen=()=>{$('connection').textContent='NETWORK ONLINE';};socket.onclose=()=>{$('connection').textContent='OFFLINE';if(room){reset();toast('Connection lost. Rejoin your room after reconnecting.');}setTimeout(connect,3000);};socket.onerror=()=>{};socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='error')return toast(m.message);if(m.type==='joined'){myId=m.id;return;}if(m.type==='state'){room=m;motion.push(m.players,performance.now());launch.update(m,myId);updateUI();surface.sync(m,myId);for(const shot of m.shots)laser(shot);effects.sync(m.phase==='playing'?(m.missiles||[]):[]);for(const boom of m.booms||[]){effects.burst(boom.pos,true);if(boom.kind==='missile')combatAudio.explosion(camera.position.distanceTo(new THREE.Vector3(...boom.pos)));}
 const me=m.players.find(p=>p.id===myId),incoming=m.phase==='playing'&&!me?.dead&&(m.missiles||[]).some(rocket=>rocket.target===myId&&rocket.team!==me?.team);
 $('missile-warning').classList.toggle('hidden',!incoming);combatAudio.warning(incoming);}};}
document.querySelectorAll('[data-ship]').forEach((b,index)=>b.onclick=()=>{ship=b.dataset.ship;document.querySelectorAll('[data-ship]').forEach(x=>x.classList.toggle('selected',x===b));$('ship-number').textContent=`0${index+1} — 03`;});
document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{size=Number(b.dataset.size);document.querySelectorAll('[data-size]').forEach(x=>x.classList.toggle('selected',x===b));});
function join(type){const name=$('name').value.trim()||'Pilot';try{localStorage.setItem('mars-pilot',name);}catch{}transmit({type,name,ship,size,code:$('code').value});}
$('retry').onclick=()=>{keys.clear();mouseFire=false;mouseRocket=false;previousHull=null;effects.clear();transmit({type:room.practice?'restart':'respawn'});};
$('surface-practice').onclick=()=>transmit({type:'practice',mission:'surface',name:$('name').value.trim()||'Pilot',ship});$('practice').onclick=()=>join('practice');$('restart').onclick=()=>transmit({type:'restart'});
$('create').onclick=()=>join('create');$('join').onclick=()=>join('join');$('code').onkeydown=e=>{if(e.key==='Enter')join('join');};$('start').onclick=()=>transmit({type:'start'});$('rematch').onclick=()=>transmit({type:'rematch'});document.querySelectorAll('.leave').forEach(b=>b.onclick=()=>{transmit({type:'leave'});reset();});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(room.code);toast('Room code copied.');}catch{toast(`Room code: ${room.code}`);}};
function unlockAudio(){if(muted)return;audio??=new AudioContext();audio.resume().then(()=>combatAudio.prepare()).catch(()=>{});laserAudio.prepare();syncMusic();if(menuMusic.every(track=>!track.paused)&&audio.state==='running')for(const ev of ['pointerdown','keydown','touchstart'])removeEventListener(ev,unlockAudio);}
for(const ev of ['pointerdown','keydown','touchstart'])addEventListener(ev,unlockAudio,{passive:true});
syncMusic();
$('sound').onclick=()=>{muted=!muted;try{localStorage.setItem('mars-muted',muted?'1':'0');}catch{}$('sound').textContent=muted?'SOUND OFF':'SOUND ON';$('sound').setAttribute('aria-pressed',String(!muted));syncMusic();if(!muted)unlockAudio();};
try{$('name').value=localStorage.getItem('mars-pilot')||'';}catch{}
function updateUI(){const phase=room.phase,playing=phase==='playing',active=playing||phase==='countdown',host=room.host===myId;const phaseChanged=phase!==lastPhase;if(phaseChanged){syncMusic();lastPhase=phase;}$('menu').classList.add('hidden');$('lobby').classList.toggle('hidden',phase!=='lobby');$('hud').classList.toggle('hidden',!active);$('result').classList.toggle('hidden',phase!=='ended');document.body.classList.toggle('playing',active);cockpit.visible=active;const walkVideo=$('marswalk');walkVideo.hidden=phase!=='lobby';if(phaseChanged){if(['playing','loading','countdown','landing','surface'].includes(phase))walkVideo.pause();else if(!matchMedia('(prefers-reduced-motion: reduce)').matches)walkVideo.play().catch(()=>{});}
 $('practice-info').classList.toggle('hidden',!playing||!room.practice);uiText('rematch',room.practice?'PLAY AGAIN vs KEPLER':'RETURN TO FLIGHT DECK');
 if(phase==='lobby'){uiText('copy',room.code);$('roster').replaceChildren();for(const p of room.players){const row=document.createElement('div');row.className='pilot';const name=document.createElement('b');name.textContent=`${p.team===0?'ARES':'ORION'} / ${p.name}${p.id===myId?' (YOU)':''}`;name.style.color=p.team===0?'#91d9dd':'#fa784a';const detail=document.createElement('span');detail.textContent=p.ship.toUpperCase();row.append(name,detail);$('roster').append(row);}const humanCount=room.players.filter(p=>!p.bot).length;const full=humanCount===room.size*2;$('start').disabled=!host||!full;uiText('start',full?'LAUNCH MATCH':'WAITING FOR PLAYERS · '+humanCount+'/'+room.size*2);uiText('lobby-note',`${room.players.length} / ${room.size*2} pilots · ${full?'All pilots connected. Host can launch.':'All '+room.size*2+' real players must join. No bots.'}`);}
 if(!playing){$('respawn').classList.add('hidden');document.body.classList.remove('boosting');}
 if(phaseChanged&&phase==='loading'){keys.clear();mouseFire=false;mouseRocket=false;previousHull=null;}
 if(phase==='countdown'){const p=room.players.find(p=>p.id===myId);uiText('ares',0);uiText('orion',0);uiText('timer','05:00');uiText('rocket-status','WEAPONS SAFE');uiText('speed-readout','SPEED · 0 m/s');if(p){uiText('hull',p.hp);uiText('ship-label',p.ship.toUpperCase());uiText('team-label',p.team===0?'ARES FLEET':'ORION FLEET');}document.querySelector('.reticle').classList.remove('locked','acquiring');}
 if(playing){const p=room.players.find(p=>p.id===myId);uiText('ares',Math.floor(room.score[0]));uiText('orion',Math.floor(room.score[1]));uiText('timer',`${Math.floor(room.time/60).toString().padStart(2,'0')}:${(room.time%60).toString().padStart(2,'0')}`);if(p){const bot=room.players.find(q=>q.bot);if(bot)uiText('duel-score',`${p.kills} : ${bot.kills} ELIMINATIONS`);if(previousHull!==null&&p.hp<previousHull){$('damage-flash').classList.remove('hit');void $('damage-flash').offsetWidth;$('damage-flash').classList.add('hit');}previousHull=p.hp;const locked=p.lockProgress>=1;uiText('rocket-status',p.dead?'ROCKET OFFLINE':p.mcd>0?'ROCKET RELOAD '+p.mcd.toFixed(1)+'s':locked?'TARGET LOCKED · R / RIGHT CLICK':p.lockId?'ACQUIRING '+Math.round(p.lockProgress*100)+'%':'AIM AT ENEMY TO LOCK');document.querySelector('.reticle').classList.toggle('locked',locked);document.querySelector('.reticle').classList.toggle('acquiring',!!p.lockId&&!locked);document.body.classList.toggle('boosting',!!p.bst&&!p.dead);uiText('speed-readout',(p.bst?'BOOST · ':'SPEED · ')+Math.round(p.speed||0)+' m/s');uiText('hull',p.hp);uiText('ship-label',p.ship.toUpperCase());uiText('team-label',p.team===0?'ARES FLEET':'ORION FLEET');$('respawn').classList.toggle('hidden',!p.dead);if(p.dead){keys.clear();mouseFire=false;mouseRocket=false;const remaining=Math.max(0,Math.ceil((p.dead-Date.now())/1000));uiText('retry',room.practice?'TRY AGAIN':remaining?'REDEPLOY IN '+remaining+'s':'REDEPLOY');$('retry').disabled=!room.practice&&remaining>0;}const d=Math.hypot(...p.pos);uiText('distance',`CAPTURE ZONE / ${Math.round(d)} m`);const opponents=room.players.some(q=>q.team!==p.team&&!q.dead&&Math.hypot(...q.pos)<145);uiText('objective',d<145?(opponents?'ZONE CONTESTED':'HOLD POSITION · CAPTURING'):'APPROACH CAPTURE ZONE');}}
 if(phase==='ended'){uiText('winner',room.winner==='DRAW'?'ORBIT CONTESTED.':`${room.winner} CLAIMS MARS.`);uiText('final-score',`ARES ${Math.floor(room.score[0])} — ${Math.floor(room.score[1])} ORION · ${room.players.find(p=>p.id===myId)?.kills||0} eliminations`);$('rematch').disabled=!host;}
}
window.addEventListener('keydown',e=>{if(room?.phase!=='playing'||e.target.tagName==='INPUT')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);};for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(b.dataset.key));});
setInterval(()=>{if(room?.phase==='playing')transmit({type:'input',turn:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),pitch:Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown')),thrust:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),aimYaw:Math.atan(aimCursor.x*Math.tan(camera.fov*Math.PI/360)*camera.aspect),aimPitch:Math.atan(-aimCursor.y*Math.tan(camera.fov*Math.PI/360)),fire:keys.has('Space')||mouseFire,missile:keys.has('KeyR')||mouseRocket});},50);
window.addEventListener('pointermove',e=>{if(room?.phase!=='playing'||e.pointerType!=='mouse'||e.target.closest('button,input,a'))return;aimCursor.x=Math.max(-.85,Math.min(.85,e.clientX/innerWidth*2-1));aimCursor.y=Math.max(-.7,Math.min(.7,e.clientY/innerHeight*2-1));});
// UI clicks never fire a weapon. Holding the mouse button sustains fire.
window.addEventListener('pointerdown',e=>{if(room?.phase!=='playing'||e.pointerType!=='mouse'||e.target.closest('button,input,a'))return;if(e.button===0)mouseFire=true;if(e.button===2)mouseRocket=true;});
window.addEventListener('pointerup',e=>{if(e.button===0)mouseFire=false;if(e.button===2)mouseRocket=false;});
window.addEventListener('pointercancel',()=>{mouseFire=false;mouseRocket=false;});
window.addEventListener('blur',()=>{mouseFire=false;mouseRocket=false;});
document.addEventListener('visibilitychange',()=>{mouseFire=false;mouseRocket=false;});
window.addEventListener('contextmenu',e=>{if(room?.phase==='playing'&&!e.target.closest('button,input,a'))e.preventDefault();});
// Procedural geometry and texture keep the download small.
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.05,18000);
let renderer;try{renderer=new THREE.WebGLRenderer({canvas:$('space'),antialias:devicePixelRatio<2,powerPreference:'high-performance'});}catch{toast('This device needs WebGL enabled for the 3D cockpit.');throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x03060b);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;scene.add(camera);const effects=createCombatEffects(scene,m=>{if(m.by===myId)return flightAudio.rocket();const d=camera.position.distanceTo(new THREE.Vector3(...m.pos));flightAudio.rocket(.7/(1+d*d/60000));});
surface=createSurfaceGame({renderer,send:transmit,leave:()=>{transmit({type:'leave'});reset();},laserAudio});
const quality=adaptiveQuality(renderer);scene.environment=spacecraftEnvironment();scene.environmentIntensity=.45;renderer.toneMappingExposure=1;
// HDR bloom. Lit surfaces stay below the threshold; laser cores, flashes and hot glints bleed light.
let composer=null,composerRatio=0;
try{composer=new EffectComposer(renderer,new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:devicePixelRatio<2?4:0}));composer.setSize(innerWidth,innerHeight);composer.addPass(new RenderPass(scene,camera));composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.42,.3,1.2));composer.addPass(new OutputPass());}catch(error){console.warn('Bloom unavailable, rendering directly.',error);composer=null;}
scene.add(new THREE.HemisphereLight(0x95aec5,0x24140e,.12));const sunlight=new THREE.DirectionalLight(0xfff0da,3.2);sunlight.position.set(-3500,1800,1800);sunlight.target.position.set(850,-150,-3600);scene.add(sunlight,sunlight.target);
sunlight.color.set(0xfff5ea);sunlight.intensity=2.1;
const sky=createOrbitalSky(scene);
const mars=createMars(scene,renderer);

const metal=new THREE.MeshStandardMaterial({color:0x182430,roughness:.65,metalness:.35}),rim=new THREE.MeshStandardMaterial({color:0x3a4a59,metalness:.45,roughness:.5});const cockpit=new THREE.Group();camera.add(cockpit);cockpit.position.z=-.55;cockpit.visible=false;
const cabinLight=new THREE.PointLight(0x99becb,1.3,5);cabinLight.position.set(0,.4,-.2);camera.add(cabinLight);
let instruments=createInstruments(cockpit);
const ships=new Map();function makeShip(p){const g=createShip(p);scene.add(g);return g;}
const lasers=createLasers(scene,{onImpact:pos=>effects.burst(pos)});
const fromVector=new THREE.Vector3(),sideVector=new THREE.Vector3();
function laser(shot){
 const own=shot.by===myId,from=fromVector.set(...shot.from);
 // Own guns sit below and to the right of the canopy.
 if(own){sideVector.set(1,0,0).applyQuaternion(camera.quaternion);from.addScaledVector(sideVector,3);from.y-=1.5;}
 lasers.fire({from:from.toArray(),to:shot.to,team:shot.team,hit:!!shot.hit,own,onViewer:!!myId&&shot.hit===myId});
 if(own){$('hit-confirm').textContent=shot.hit?'HIT':' ';$('hit-confirm').getAnimations().forEach(a=>a.cancel());$('hit-confirm').animate([{opacity:1},{opacity:0}],{duration:300});}
 if(room?.phase==='playing')laserAudio.shot(own?0:camera.position.distanceTo(from));
}
const targetPosition=new THREE.Vector3();
function updateTarget(playing){
 const me=room?.players.find(p=>p.id===myId),enemy=(room?.players.find(p=>p.id===me?.lockId&&!p.dead)||room?.players.find(p=>p.team!==me?.team&&!p.dead));
 const marker=$('target');marker.classList.toggle('hidden',!playing||!enemy||!!me?.dead);if(!playing||!enemy||me?.dead)return;
 targetPosition.set(...enemy.pos).project(camera);
 const pose=motion.sample(enemy.id,performance.now());if(pose)targetPosition.set(...pose.pos).project(camera);const front=targetPosition.z<1;
 const visible=front&&Math.abs(targetPosition.x)<.86&&Math.abs(targetPosition.y)<.7;
 marker.style.left=(visible?(targetPosition.x*.5+.5)*100:front?Math.max(7,Math.min(93,(targetPosition.x*.5+.5)*100)):50)+'%';
 marker.style.top=(visible?(-targetPosition.y*.5+.5)*100:front?Math.max(20,Math.min(72,(-targetPosition.y*.5+.5)*100)):22)+'%';
 const distance=Math.round(Math.hypot(...enemy.pos.map((v,i)=>v-me.pos[i])));
 $('target-label').textContent=(visible?'':front?'TURN TOWARD TARGET · ':'TARGET BEHIND · ')+enemy.name+' / '+distance+' m / HULL '+enemy.hp;
}
const cockpitReady=loadModel('spaceship_cockpit').then(asset=>{
 const interior=modelInstance(asset,10);interior.name='uploaded-cockpit';interior.position.set(0,-.85,-.15);interior.rotation.y=Math.PI/2;
 interior.traverse(o=>{if(o.isMesh){if(/Duct_Tape|Marker|Paper|LightLambert/.test(o.material.name)||/Pinched_Marker/.test(o.name))o.visible=false;o.material=new THREE.MeshPhongMaterial({color:0x394854,specular:0x52616d,shininess:36,side:THREE.DoubleSide});}});
 const panels=instruments.group;cockpit.remove(panels);cockpit.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});cockpit.clear();cockpit.position.set(0,0,0);cockpit.add(interior,panels);panels.position.y=-.06;panels.scale.setScalar(.82);document.documentElement.dataset.cockpitModel='loaded';
}).catch(error=>{toast('Cockpit model could not load. Please refresh.');throw error;});
setupHangar(id=>{ship=id;$('ship-number').textContent=({interceptor:'01',vanguard:'02',sentinel:'03'})[id]+' / 03';});
function mediaReady(element){return new Promise((resolve,reject)=>{if(element.readyState>=2)return resolve();element.addEventListener('loadeddata',resolve,{once:true});element.addEventListener('error',()=>reject(Error('Launch media could not load')),{once:true});element.load();});}
const assetsReady=Promise.all([surface.ready,mars.userData.ready,sky.ready,cockpitReady,combatAudio.ready,...['missile','vertical_launch_missile','sparksexplosion'].map(loadModel),mediaReady($('loading-video')),mediaReady($('starting-speech'))]);
assetsReady.catch(()=>toast('A launch asset could not load. Refresh to retry.'));
launch=createLaunchSequence({assetsReady,onReady:id=>transmit({type:'ready',launchId:id}),isMuted:()=>muted});
const reticle=document.querySelector('.reticle'),positionVector=new THREE.Vector3(),orientation=new THREE.Quaternion(),flightEuler=new THREE.Euler(0,0,0,'YXZ');
let lastFrame=performance.now(),lastHudFrame=0,rendering=false,localSpawn=null;
window.marsDiagnostics=()=>({drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,pixelRatio:+quality.ratio.toFixed(2),rendering,ships:ships.size,phase:room?.phase||'menu',launchId:room?.launchId,missileWarning:!$('missile-warning').classList.contains('hidden'),players:room?.players.map(p=>({id:p.id,team:p.team,hp:p.hp,pos:p.pos,dead:p.dead,lockId:p.lockId,lockProgress:p.lockProgress})),missiles:room?.missiles,myId,sound:combatAudio.diagnostics(),surface:surface.diagnostics()});
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;const playing=room?.phase==='playing',active=playing||room?.phase==='countdown';launch.frame();
 if(document.hidden)return;
 if(room?.surface&&['landing','surface','ended'].includes(room.phase)){if(!rendering){quality.reset();rendering=true;}quality.frame(now);flightAudio.silence();surface.frame(dt,now);return;}
 const visible=active||room?.phase==='ended'||matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!visible){rendering=false;flightAudio.silence();return;}if(!rendering){quality.reset();rendering=true;}
 quality.frame(now);mars.userData.update(dt);
 const me=active?room.players.find(p=>p.id===myId):null;
 flightAudio.update(playing,me);
 if(me){const pose=motion.sample(me.id,now,true);if(pose){positionVector.set(...pose.pos);if(localSpawn===null||me.age<localSpawn||camera.position.distanceToSquared(positionVector)>250000)camera.position.copy(positionVector);else camera.position.lerp(positionVector,1-Math.exp(-dt*28));localSpawn=me.age;flightEuler.set(pose.pitch,-pose.yaw,0);orientation.setFromEuler(flightEuler);camera.quaternion.slerp(orientation,1-Math.exp(-dt*28));}
  cockpit.rotation.z+=((keys.has('KeyA')?.025:keys.has('KeyD')?-.025:0)-cockpit.rotation.z)*(1-Math.exp(-dt*8));
 }else{camera.position.set(0,0,700);camera.lookAt(0,0,-3000);localSpawn=null;}
 sky.update(camera,quality.ratio,dt);
 const wantedFov=me?.bst&&!me.dead?80:72,nextFov=camera.fov+(wantedFov-camera.fov)*(1-Math.exp(-dt*5));
 if(Math.abs(camera.fov-nextFov)>.002){camera.fov=nextFov;camera.updateProjectionMatrix();}
 if(now-lastHudFrame>50){lastHudFrame=now;reticle.style.left=(aimCursor.x*.5+.5)*100+'%';reticle.style.top=(aimCursor.y*.5+.5)*100+'%';updateTarget(playing);instruments.update(me,room?.players||[],now);}
 if(active)for(const p of room.players){if(p.id===myId)continue;let model=ships.get(p.id);if(!model){model=makeShip(p);ships.set(p.id,model);}model.visible=!p.dead;const pose=motion.sample(p.id,now);if(pose){model.position.set(...pose.pos);flightEuler.set(pose.pitch,-pose.yaw,0);model.quaternion.setFromEuler(flightEuler);}updateShip(model,p,now/1000);}
 for(const [id,m] of ships)if(!active||!room.players.some(p=>p.id===id)){scene.remove(m);disposeShip(m);ships.delete(id);}
 lasers.update(dt);effects.update(dt);
 if(composer&&(lasers.active||effects.active)&&quality.ratio>=.85&&!matchMedia('(pointer:coarse)').matches){if(composerRatio!==quality.ratio){composerRatio=quality.ratio;composer.setPixelRatio(composerRatio);}composer.render(dt);}else renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer?.setSize(innerWidth,innerHeight);});connect();requestAnimationFrame(animate);
