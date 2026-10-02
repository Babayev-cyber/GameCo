import * as THREE from 'three';
import {mulberry32} from './glsl.js';
export const PLANET_CENTER=new THREE.Vector3(850,-150,-3600);
export const PLANET_RADIUS=1700;
export function createMars(scene,renderer,{sunDir}={}){
  sunDir=sunDir?.clone().normalize()||new THREE.Vector3(-.72,.35,.30).normalize();
  const planet=new THREE.Group();planet.position.copy(PLANET_CENTER);planet.rotation.set(.08,2.15,.18);scene.add(planet);
  // Preserve the NASA geography without noise obscuring the photograph.
  const material=new THREE.MeshLambertMaterial({color:0xe6c8b5});
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS,96,64),material));
  planet.userData.ready=new Promise(resolve=>new THREE.TextureLoader().load('./assets/mars-viking.jpg',texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());material.map=texture;material.needsUpdate=true;
    document.documentElement.dataset.marsTexture='loaded';resolve();
  },undefined,()=>{material.color.set(0x9c6045);document.documentElement.dataset.marsTexture='failed';resolve();}));
  const height=PLANET_RADIUS*.009;
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS+height,64,48),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{center:{value:PLANET_CENTER},rPlanet:{value:PLANET_RADIUS},rAtmo:{value:PLANET_RADIUS+height},sunDir:{value:sunDir}},
    vertexShader:'varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`varying vec3 vWorld;uniform vec3 center,sunDir;uniform float rPlanet,rAtmo;
      void main(){vec3 rd=normalize(vWorld-cameraPosition),oc=center-cameraPosition;float t=dot(oc,rd);
      float b2=max(dot(oc,oc)-t*t,0.);float outer=sqrt(max(rAtmo*rAtmo-b2,0.));
      float path=b2<rPlanet*rPlanet?outer-sqrt(rPlanet*rPlanet-b2):2.*outer;
      float k=clamp(path/(2.*sqrt(rAtmo*rAtmo-rPlanet*rPlanet)),0.,1.);
      float day=dot(normalize(cameraPosition+rd*t-center),sunDir);
      vec3 tint=mix(vec3(.29,.39,.56),vec3(.78,.49,.31),smoothstep(-.04,.5,day));
      gl_FragColor=vec4(tint,pow(k,1.7)*smoothstep(-.12,.28,day)*.38);}`
  }));atmosphere.position.copy(PLANET_CENTER);scene.add(atmosphere);
  // Bake a faint dust veil once, rather than run turbulence for every pixel.
  const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d'),rand=mulberry32(57);
  for(let i=0;i<55;i++){
    const x=rand()*512,y=rand()*256,r=8+rand()*38,g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,'rgba(215,185,160,0.075)');g.addColorStop(1,'rgba(215,185,160,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const clouds=new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS*1.002,64,48),new THREE.MeshLambertMaterial({map:texture,transparent:true,depthWrite:false,opacity:.45}));planet.add(clouds);
  planet.userData.update=dt=>{planet.rotation.y+=dt*.00008;clouds.rotation.y+=dt*.00012;};return planet;
}
