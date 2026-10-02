import * as THREE from 'three';
import {mulberry32} from './glsl.js';

const cache = {};

function canvasTexture(size, draw, {srgb = true} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  return tex;
}

// Soft round glow used for engine halos, muzzle flashes, sparks and star flares.
export function glowTexture() {
  return cache.glow ??= canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

// Billowing, irregular puff for smoke and fireballs (many overlapping noisy blobs).
export function puffTexture() {
  return cache.puff ??= canvasTexture(128, (ctx, s) => {
    const rand = mulberry32(77);
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.pow(rand(), 0.7) * s * 0.26;
      const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
      const r = s * (0.09 + rand() * 0.15);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.16 + rand() * 0.14})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const fade = ctx.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'source-over';
  });
}

// Thin shockwave ring.
export function ringTexture() {
  return cache.ring ??= canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.30, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

// Four-point star flare for hot flashes.
export function flareTexture() {
  return cache.flare ??= canvasTexture(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, h, a] of [[s * 0.95, s * 0.035, 0.9], [s * 0.035, s * 0.95, 0.9], [s * 0.5, s * 0.02, 0.5], [s * 0.02, s * 0.5, 0.5]]) {
      const g = ctx.createLinearGradient(s / 2 - w / 2, 0, s / 2 + w / 2, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(s / 2, s / 2);
      if (h > w) ctx.rotate(Math.PI / 2);
      const L = Math.max(w, h), T = Math.min(w, h);
      const gg = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(-L / 2, -T / 2, L, T);
      ctx.restore();
    }
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}
