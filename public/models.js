import * as THREE from './three.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const loader=new GLTFLoader(),cache=new Map();
export function loadModel(name){
 if(!cache.has(name))cache.set(name,loader.loadAsync(`./assets/models/${name}.glb`).then(gltf=>{
  gltf.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());
  return {scene:gltf.scene,bounds,size,animations:gltf.animations};
 }));return cache.get(name);
}
export function modelInstance(asset,length=1,forward=false){
 const scene=asset.scene.clone(true),center=asset.bounds.getCenter(new THREE.Vector3());
 scene.position.sub(center);const normalized=new THREE.Group();normalized.add(scene);
 const scale=length/Math.max(asset.size.x,asset.size.y,asset.size.z);normalized.scale.setScalar(scale);
 const wrapper=new THREE.Group();wrapper.add(normalized);
 if(forward){const axis=asset.size.y>asset.size.x&&asset.size.y>asset.size.z?new THREE.Vector3(0,1,0):asset.size.x>asset.size.z?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);wrapper.quaternion.setFromUnitVectors(axis,new THREE.Vector3(0,0,-1));}
 wrapper.userData.uploadedModel=true;return wrapper;
}
