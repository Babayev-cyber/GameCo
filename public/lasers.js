import * as THREE from './three.js';
// Laser bolts: a camera-facing ribbon shader (white-hot core, coloured corona, travelling head,
// rippling energy), muzzle and impact flares, and short-lived point lights that flash nearby hulls.
// Colours are HDR (>1) so the bloom pass makes the beams bleed light.
const TEAM_COLOR=[new THREE.Color(0xff2414),new THREE.Color(0xff2414)];
const BOLT_SPEED=9000,LINGER=.1,MAX_BEAMS=48;

const vertexShader=`
uniform vec3 uStart,uEnd;uniform float uWidth,uMinAngle,uCore;
varying vec2 vUv;varying float vLen,vCore;
void main(){
 vec3 axis=uEnd-uStart;float len=max(length(axis),1e-3);vec3 dir=axis/len;
 vec3 p=uStart+axis*position.y;
 vec3 toCam=cameraPosition-p;float dist=max(length(toCam),1e-3);
 vec3 side=cross(dir,toCam/dist);float sl=length(side);
 side=sl>1e-4?side/sl:normalize(cross(dir,abs(dir.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
 // Never thinner than ~2 px, so distant shots still read without aliasing.
 float w=max(uWidth,dist*uMinAngle);
 p+=side*position.x*w;
 vUv=position.xy;vLen=len;vCore=clamp(uCore*uWidth/w,.2,1.);
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const fragmentShader=`
uniform vec3 uColor;uniform float uAge,uTravel,uLife,uIntensity,uSeed;
varying vec2 vUv;varying float vLen,vCore;
void main(){
 float along=vUv.y,across=abs(vUv.x),meters=along*vLen;
 float head=clamp(uAge/uTravel,0.,1.);
 float fadeT=clamp((uAge-uTravel)/max(uLife-uTravel,1e-3),0.,1.);
 float tail=fadeT*fadeT;
 float soft=1.5/vLen;
 float body=smoothstep(tail,tail+soft*4.,along)*(1.-smoothstep(head-soft,head,along));
 if(body<=.001)discard;
 float behindHead=max(head-along,0.)*vLen;
 float bolt=(1.-step(1.,head))*exp(-behindHead/10.)*2.5;
 float muzzle=exp(-meters/2.5)*1.5;
 float ripple=.82+.18*sin(meters*.75-uAge*260.+uSeed*6.283)+.08*sin(meters*.13+uAge*90.+uSeed*17.);
 float core=exp(-pow(across/(vCore*.32),2.));
 float corona=exp(-pow(across/(vCore*.95),2.))*.55+exp(-across*3.2)*.22;
 float life=1.-fadeT;life*=life;
 float energy=uIntensity*body*ripple*(1.+bolt+muzzle)*life;
 vec3 col=(uColor*corona*1.6+vec3(1.,.97,.92)*core*2.6)*energy;
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

function spriteTexture(draw){const c=document.createElement('canvas');c.width=c.height=128;draw(c.getContext('2d'),128);return new THREE.CanvasTexture(c);}
const glowMap=spriteTexture((x,s)=>{const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.15,'rgba(255,255,255,.7)');g.addColorStop(.4,'rgba(255,255,255,.18)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,s,s);});
const flareMap=spriteTexture((x,s)=>{x.globalCompositeOperation='lighter';x.translate(s/2,s/2);
 for(const [len,thick,alpha,angle] of [[s,s*.045,.95,0],[s,s*.045,.95,Math.PI/2],[s*.55,s*.025,.45,Math.PI/4],[s*.55,s*.025,.45,-Math.PI/4]]){x.save();x.rotate(angle);const g=x.createLinearGradient(-len/2,0,len/2,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.5,`rgba(255,255,255,${alpha})`);g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(-len/2,-thick/2,len,thick);x.restore();}
 const g=x.createRadialGradient(0,0,0,0,0,s*.22);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(-s/2,-s/2,s,s);});

export function createLasers(scene,{onImpact=()=>{},scale=1,standoff=true}={}){
 const geometry=new THREE.PlaneGeometry(2,1,1,24);geometry.translate(0,.5,0);
 const beams=[],beamPool=[],sprites=[],spritePool=[],lights=[];
 // A fixed light pool keeps the shader light count constant (no recompiles while firing).
 for(let i=0;i<3;i++){const light=new THREE.PointLight(0xffffff,0,90,2);light.userData.ttl=0;light.userData.peak=0;light.userData.life=1;scene.add(light);lights.push(light);}
 let nextLight=0;
 function material(){return new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  uniforms:{uStart:{value:new THREE.Vector3()},uEnd:{value:new THREE.Vector3()},uWidth:{value:1},uMinAngle:{value:.004},uCore:{value:.3},uColor:{value:new THREE.Color()},uAge:{value:0},uTravel:{value:.05},uLife:{value:.2},uIntensity:{value:1},uSeed:{value:0}}});}
 function flash(pos,color,peak,life,range){peak*=scale*scale;range*=scale;const light=lights[nextLight];nextLight=(nextLight+1)%lights.length;light.position.copy(pos);light.color.copy(color);light.distance=range;light.intensity=peak;Object.assign(light.userData,{ttl:life,life,peak});}
 function sprite(map,pos,color,size,life,delay=0,grow=1.6){
  size*=scale;
  if(sprites.length>=64)releaseSprite(sprites.shift());
  const s=spritePool.pop()||new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
  s.material.map=map;s.material.color.copy(color);s.material.opacity=0;s.material.rotation=Math.random()*Math.PI;s.position.copy(pos);s.scale.setScalar(size);s.visible=delay<=0;scene.add(s);
  sprites.push({s,age:-delay,life,size,grow,hdr:color.clone()});
 }
 function releaseSprite(e){scene.remove(e.s);if(spritePool.length<64)spritePool.push(e.s);else e.s.material.dispose();}
 const white=new THREE.Color(1,.96,.9),tmp=new THREE.Color(),start=new THREE.Vector3(),end=new THREE.Vector3(),dir=new THREE.Vector3();
 // own: fired from the viewer's guns. onViewer: the bolt strikes the viewer's ship (the HUD shows that hit).
 function fire({from,to,team,hit,own,onViewer}){
  start.fromArray(from);end.fromArray(to);dir.copy(end).sub(start);let length=dir.length();if(length<.5)return;dir.divideScalar(length);
  // Stop on the near side of the struck hull instead of its centre; bolts at the viewer stop short of the canopy.
  const gap=standoff?(onViewer?24:hit?3.5:0)*scale:0;if(gap&&length>gap*2){end.addScaledVector(dir,-gap);length-=gap;}
  const color=TEAM_COLOR[team]||TEAM_COLOR[0],travel=Math.max(.025,length/BOLT_SPEED);
  if(beams.length>=MAX_BEAMS)releaseBeam(beams.shift());
  const mesh=beamPool.pop()||new THREE.Mesh(geometry,material());mesh.frustumCulled=false;mesh.renderOrder=2;
  const u=mesh.material.uniforms;u.uStart.value.copy(start);u.uEnd.value.copy(end);u.uColor.value.copy(color);u.uAge.value=0;u.uTravel.value=travel;u.uLife.value=travel+LINGER;u.uSeed.value=Math.random();
  u.uWidth.value=(own?.07:.2)*scale;u.uCore.value=own?.4:.3;u.uIntensity.value=own?.7:1.1;
  scene.add(mesh);beams.push({mesh,age:0,life:travel+LINGER,impact:hit?{at:travel,pos:end.clone(),color,onViewer}:null});
  // Muzzle: a tight white flare inside a coloured glow, plus a light that flickers across the cockpit/hull.
  sprite(flareMap,start,tmp.copy(color).lerp(white,.5).multiplyScalar(1.6),own?.45:3,.06);
  sprite(glowMap,start,tmp.copy(color).multiplyScalar(1.1),own?.6:4,.09);
  flash(start,color,own?1.2:220,.07,own?10:50);
 }
 function impact(i){
  if(i.onViewer){flash(i.pos,i.color,90,.18,40);return;}
  sprite(flareMap,i.pos,tmp.copy(i.color).lerp(white,.6).multiplyScalar(2),4.5,.11,0,2);
  sprite(glowMap,i.pos,tmp.copy(i.color).multiplyScalar(1.3),6,.2,0,1.2);
  sprite(glowMap,i.pos,tmp.set(1,.5,.18).multiplyScalar(1.1),3,.4,.03,.7);
  flash(i.pos,i.color,320,.15,45);onImpact(i.pos.toArray());
 }
 function releaseBeam(b){scene.remove(b.mesh);if(beamPool.length<MAX_BEAMS)beamPool.push(b.mesh);else b.mesh.material.dispose();}
 function update(dt){
  for(let i=beams.length-1;i>=0;i--){const b=beams[i];b.age+=dt;b.mesh.material.uniforms.uAge.value=b.age;
   if(b.impact&&b.age>=b.impact.at){impact(b.impact);b.impact=null;}
   if(b.age>=b.life){releaseBeam(b);beams.splice(i,1);}}
  for(let i=sprites.length-1;i>=0;i--){const e=sprites[i];e.age+=dt;if(e.age<0)continue;e.s.visible=true;const t=e.age/e.life;
   if(t>=1){releaseSprite(e);sprites.splice(i,1);continue;}
   e.s.scale.setScalar(e.size*(1+t*e.grow*.6));e.s.material.opacity=1;e.s.material.color.copy(e.hdr).multiplyScalar((1-t)*(1-t)*(.85+Math.random()*.3));}
  for(const l of lights){if(l.userData.ttl<=0){l.intensity=0;continue;}l.userData.ttl-=dt;const t=Math.max(0,l.userData.ttl/l.userData.life);l.intensity=l.userData.peak*t*t;}
 }
 function clear(){while(beams.length)releaseBeam(beams.pop());while(sprites.length)releaseSprite(sprites.pop());for(const l of lights){l.userData.ttl=0;l.intensity=0;}}
 return {fire,update,clear,get active(){return beams.length+sprites.length>0;}};
}
