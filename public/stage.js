import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createSky} from './sky.js';
import {createMars} from './mars.js';

// Sun direction as seen from the arena (toward the Sun).
export const SUN_DIR = new THREE.Vector3(-0.72, 0.35, 0.30).normalize();

export function detectQuality() {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'low' || forced === 'high') return forced;
  const coarse = matchMedia('(pointer:coarse)').matches;
  const memory = navigator.deviceMemory || 4;
  return coarse || memory <= 2 ? 'low' : 'high';
}

// Renderer, post-processing (HDR bloom + ACES), sky, Mars and lights shared by the menu and the match.
export function createStage({canvas, quality}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance', stencil: false});
  const pixelRatio = Math.min(devicePixelRatio || 1, quality === 'low' ? 1.25 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 18000);
  scene.add(camera);

  const sun = new THREE.DirectionalLight(0xfff0dc, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(5000);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x6f86a8, 0x3a2418, 0.22));

  const sky = createSky(scene, {sunDir: SUN_DIR, quality});
  sky.setPixelRatio(pixelRatio);
  const planet = createMars(scene, renderer, {sunDir: SUN_DIR, quality});

  // second scene drawn on top with a cleared depth buffer: the cockpit interior
  const cockpitScene = new THREE.Scene();
  const cockpitCamera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.02, 40);

  let composer, bloom, cockpitPass, direct = false;
  try {
    const target = new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, {type: THREE.HalfFloatType, samples: quality === 'low' ? 0 : 4});
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(innerWidth, innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    cockpitPass = new RenderPass(cockpitScene, cockpitCamera);
    cockpitPass.clear = false;
    cockpitPass.clearDepth = true;
    cockpitPass.enabled = false;
    composer.addPass(cockpitPass);
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), quality === 'low' ? 0.55 : 0.8, 0.62, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } catch (error) {
    console.warn('Post-processing unavailable, rendering directly.', error);
    direct = true;
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;
  function refreshEnvironment() {
    const old = envTarget;
    envTarget = pmrem.fromScene(scene, 0, 1, 20000);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.75;
    old?.dispose();
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = cockpitCamera.aspect = w / h;
    camera.updateProjectionMatrix();
    cockpitCamera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
  }
  addEventListener('resize', resize);

  let time = 0;
  function render(dt) {
    time += dt;
    planet.userData.update(dt, time);
    sky.follow(camera);
    if (direct) {
      renderer.toneMappingExposure = 1.0;
      renderer.render(scene, camera);
      if (cockpitPass?.enabled !== false) { renderer.clearDepth(); renderer.render(cockpitScene, cockpitCamera); }
    } else {
      composer.render(dt);
    }
  }

  return {
    renderer, scene, camera, cockpitScene, cockpitCamera, cockpitPass, planet, sky, sun, bloom, composer,
    get time() { return time; },
    render, resize, refreshEnvironment,
  };
}
