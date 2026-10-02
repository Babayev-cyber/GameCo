import * as THREE from 'three';
import {NOISE, mulberry32} from './glsl.js';

// Deep-space backdrop: procedural Milky Way, ~7000 coloured stars and the Sun with a HDR corona.
// The dome and stars follow the camera so they never show parallax.
export function createSky(scene, {sunDir, quality}) {
  const group = new THREE.Group();
  scene.add(group);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {sunDir: {value: sunDir.clone()}},
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 sunDir;
        ${NOISE}
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = vec3(0.0025, 0.0035, 0.007);
          vec3 gn = normalize(vec3(0.38, 0.80, 0.46));
          float gl = dot(d, gn);
          float band = exp(-gl * gl * 20.0);
          float cloud = fbm(d * 3.1 + vec3(2.0));
          float fine = ${quality === 'low' ? '0.5' : 'fbm(d * 11.0 + vec3(5.0))'};
          float dust = fbm(d * 5.5 + vec3(8.0, 1.0, 3.0));
          float lane = 1.0 - 0.8 * smoothstep(0.46, 0.72, dust) * exp(-gl * gl * 70.0);
          float mw = band * (0.25 + 1.15 * cloud) * lane * (0.65 + 0.7 * fine);
          vec3 coreDir = normalize(vec3(-0.45, 0.12, -0.88));
          float core = pow(max(dot(d, coreDir), 0.0), 5.0);
          col += mw * mix(vec3(0.05, 0.065, 0.12), vec3(0.17, 0.12, 0.085), core) * 0.9;
          col += core * band * vec3(0.10, 0.07, 0.04);
          float neb = smoothstep(0.52, 0.8, fbm(d * 2.2 + vec3(40.0))) * exp(-gl * gl * 3.0);
          col += neb * vec3(0.012, 0.018, 0.035);
          float s = max(dot(d, sunDir), 0.0);
          float disk = smoothstep(0.99991, 0.99997, s);
          col += vec3(1.0, 0.94, 0.82) * disk * 55.0;
          col += vec3(1.0, 0.82, 0.58) * pow(s, 900.0) * 6.0;
          col += vec3(1.0, 0.74, 0.46) * pow(s, 90.0) * 0.55;
          col += vec3(0.70, 0.55, 0.45) * pow(s, 9.0) * 0.045;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -20;
  dome.frustumCulled = false;
  group.add(dome);

  // Stars: magnitude follows a steep power law; denser near the galactic plane.
  const rand = mulberry32(2086);
  const count = quality === 'low' ? 3500 : 7000;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const gn = new THREE.Vector3(0.38, 0.8, 0.46).normalize();
  const tmp = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    for (;;) {
      tmp.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      const l = tmp.length();
      if (l > 1 || l < 0.01) continue;
      tmp.divideScalar(l);
      const g = tmp.dot(gn);
      if (rand() < 0.3 + 0.7 * Math.exp(-g * g * 7)) break;
    }
    tmp.multiplyScalar(8500);
    pos.set([tmp.x, tmp.y, tmp.z], i * 3);
    const mag = Math.pow(rand(), 5.5);
    const temp = rand();
    color.setRGB(0.62 + temp * 0.38, 0.72 + Math.min(temp, 1 - temp) * 0.4 + temp * 0.12, 1.0 - temp * 0.45);
    const bright = 0.16 + mag * 1.9;
    col.set([color.r * bright, color.g * bright, color.b * bright], i * 3);
    size[i] = 1.1 + mag * 3.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {scale: {value: 1}},
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
      void main(){ vColor = color; gl_PointSize = size * scale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vColor;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d); a *= a; gl_FragColor = vec4(vColor * a, a); }`,
  }));
  stars.renderOrder = -19;
  stars.frustumCulled = false;
  group.add(stars);

  return {
    group,
    follow(camera) { group.position.copy(camera.position); },
    setPixelRatio(pr) { stars.material.uniforms.scale.value = pr; },
  };
}
