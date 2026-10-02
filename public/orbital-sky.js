import * as THREE from './three.js';
import {mulberry32} from './glsl.js';
export function createOrbitalSky(scene){
 const group=new THREE.Group();scene.add(group);const rand=mulberry32(2086),count=5200,positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),v=new THREE.Vector3();
 for(let i=0;i<count;i++){
  v.set(rand()-.5,rand()-.5,rand()-.5).normalize().multiplyScalar(14000);v.toArray(positions,i*3);
  const warm=rand(),bright=.18+Math.pow(rand(),4)*.8;colors.set([bright*(.7+warm*.3),bright*.85,bright*(1-warm*.35)],i*3);sizes[i]=.8+Math.pow(rand(),6)*2.4;
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('size',new THREE.BufferAttribute(sizes,1));
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,uniforms:{pixelRatio:{value:1}},vertexShader:'attribute vec3 color;attribute float size;uniform float pixelRatio;varying vec3 tint;void main(){tint=color;gl_PointSize=size*pixelRatio;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 tint;void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(tint,a*.85);}'});
 const stars=new THREE.Points(geo,material);stars.frustumCulled=false;stars.renderOrder=-10;group.add(stars);
 // A faint galactic dust band is baked once, keeping the sky to two draws.
 const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d'),pixels=x.createImageData(c.width,c.height);
 // Dither the very dark dust band once so low colour values do not form visible grid patterns.
 for(let py=0;py<c.height;py++)for(let px=0;px<c.width;px++){
  const center=255+Math.sin(px*Math.PI*2/1024)*64,band=Math.exp(-(((py-center)/28)**2));
  const clouds=.5+.22*Math.sin(px*.024+Math.sin(py*.037)*2)+.15*Math.sin(px*.069+py*.025),noise=rand()-.5,i=(py*c.width+px)*4;
  pixels.data[i]=1+band*clouds*7+noise;pixels.data[i+1]=2+band*clouds*8+noise;pixels.data[i+2]=4+band*clouds*13+noise;pixels.data[i+3]=255;
 }
 x.putImageData(pixels,0,0);
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const dome=new THREE.Mesh(new THREE.SphereGeometry(14500,32,16),new THREE.MeshBasicMaterial({map:texture,side:THREE.BackSide,depthWrite:false,depthTest:false}));dome.renderOrder=-11;group.add(dome);
 const loader=new THREE.TextureLoader(),planets=[];
 const ready=Promise.all([
  ['Earth',[-7200,1200,-12500],320,'earth.jpg',.28],
  ['Jupiter',[8200,2500,-10500],440,'jupiter.webp',-.12]
 ].map(([name,pos,radius,file,tilt])=>new Promise(resolve=>{
  const mat=new THREE.MeshLambertMaterial({color:0xffffff}),planet=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),mat);planet.name=name;planet.position.set(...pos);planet.rotation.set(tilt,1.4,tilt);scene.add(planet);planets.push(planet);
  loader.load('./assets/'+file,map=>{map.colorSpace=THREE.SRGBColorSpace;mat.map=map;mat.needsUpdate=true;document.documentElement.dataset[name.toLowerCase()]='loaded';resolve();},undefined,()=>{mat.color.set(name==='Earth'?0x315b8b:0x9c8069);resolve();});
 })));
 return {ready,update(camera,pixelRatio,dt){group.position.copy(camera.position);material.uniforms.pixelRatio.value=pixelRatio;for(const p of planets)p.rotation.y+=dt*.00008;}};
}
