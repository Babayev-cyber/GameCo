// Developer turntable for the procedural ships. Open /preview.html?ship=sentinel&team=1&view=side
import * as THREE from 'three';
import {createStage, detectQuality} from './stage.js';
import {createShip, flameTime} from './ships.js';

const params = new URLSearchParams(location.search);
const stage = createStage({canvas: document.getElementById('space'), quality: detectQuality()});
const {scene, camera} = stage;
await stage.planet.userData.ready;
stage.refreshEnvironment();

const kinds = ['interceptor', 'vanguard', 'sentinel'];
const only = params.get('ship');
const ships = [];
const list = only ? [only] : kinds;
list.forEach((kind, i) => {
  for (const team of (params.get('team') ? [Number(params.get('team'))] : [0, 1])) {
    const ship = createShip(kind, team);
    const both = !params.get('team');
    ship.root.position.set((i - (list.length - 1) / 2) * 60, both ? (team ? -22 : 22) : 0, 0);
    ship.root.rotation.y = Number(params.get('yaw') ?? 0.7);
    scene.add(ship.root);
    ships.push(ship);
  }
});

const view = params.get('view') || 'iso';
const dist = Number(params.get('d') || (only ? 90 : 150));
camera.position.set(view === 'side' ? dist : dist * .55, view === 'top' ? dist : dist * .32, view === 'side' ? 0 : dist * .85);
camera.lookAt(0, 0, 0);
camera.fov = Number(params.get('fov') || 40);
camera.updateProjectionMatrix();

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  flameTime.value += dt;
  for (const ship of ships) {
    if (params.get('spin') !== '0') ship.root.rotation.y += dt * .25;
    ship.update(stage.time, .8, params.get('boost') ? 1 : 0);
  }
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.documentElement.dataset.ready = '1';
