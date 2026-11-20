// Cinematic colour grades. Every grade is a small recipe of canvas filters and compositing layers,
// so the preview and the exported PNG are coloured by exactly the same code.
import { mulberry32 } from './state.js';

export const GRADES = [
  {
    id: 'vice-sunset', name: 'Vice Sunset',
    swatch: ['#ff3d81', '#ffb03a', '#ffe375'],
    filter: 'saturate(1.2) contrast(1.08) hue-rotate(-5deg)',
    shadow: '#3b0b3f', accent: '#ffd34d', rim: '#ff7a45', deep: '#34104e',
    tintA: '#ff5c35', tintB: '#ff2f9c', wash: '#ffb347', leak: '#ffdb7a',
    blend: 'soft-light', tintAlpha: 0.50, washAlpha: 0.24, grain: 0.075,
  },
  {
    id: 'neon-miami', name: 'Neon Miami',
    swatch: ['#ff2fb4', '#7b39ff', '#31f1e3'],
    filter: 'saturate(1.34) contrast(1.18) hue-rotate(12deg)',
    shadow: '#150b4e', accent: '#3ff5ef', rim: '#ff45c8', deep: '#101652',
    tintA: '#00e5ff', tintB: '#ff1fa8', wash: '#9a4dff', leak: '#55fff2',
    blend: 'screen', tintAlpha: 0.24, washAlpha: 0.20, grain: 0.085,
  },
  {
    id: 'dusk-teal-orange', name: 'Dusk Teal-Orange',
    swatch: ['#0d6b78', '#ef8b43', '#ffd6a0'],
    filter: 'saturate(1.13) contrast(1.20) hue-rotate(-8deg)',
    shadow: '#062b3c', accent: '#ffc46b', rim: '#42d7d0', deep: '#0a2345',
    tintA: '#0aa3a6', tintB: '#ff9d3c', wash: '#ffb066', leak: '#ffd9a0',
    blend: 'soft-light', tintAlpha: 0.58, washAlpha: 0.18, grain: 0.07,
  },
  {
    id: 'chrome-night', name: 'Chrome Night',
    swatch: ['#171b7a', '#7352ff', '#22d3ff'],
    filter: 'saturate(0.82) contrast(1.28) hue-rotate(20deg) brightness(0.92)',
    shadow: '#070826', accent: '#9d8bff', rim: '#4ad8ff', deep: '#090a35',
    tintA: '#2f65ff', tintB: '#8f2dff', wash: '#2438c9', leak: '#9ad6ff',
    blend: 'overlay', tintAlpha: 0.62, washAlpha: 0.34, grain: 0.105,
  },
  {
    id: 'pink-haze', name: 'Pink Haze',
    swatch: ['#ffc7e8', '#ffd9b3', '#c9b7ff'],
    filter: 'saturate(0.82) contrast(0.94) brightness(1.10) sepia(0.10)',
    shadow: '#67416e', accent: '#ffd1ea', rim: '#ffadd8', deep: '#8c66a6',
    tintA: '#ffb6d9', tintB: '#ffe0b0', wash: '#dcb8ff', leak: '#fff0cf',
    blend: 'soft-light', tintAlpha: 0.48, washAlpha: 0.30, grain: 0.055,
  },
];

export function getGrade(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

const tileCache = new Map();

export function grainPattern(ctx, seed = 1337) {
  const key = `grain:${seed}`;
  let tile = tileCache.get(key);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tile.height = 96;
    const tctx = tile.getContext('2d');
    const image = tctx.createImageData(96, 96);
    const rng = mulberry32(seed);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 90 + Math.floor(rng() * 166);
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = Math.floor(rng() * 110);
    }
    tctx.putImageData(image, 0, 0);
    tileCache.set(key, tile);
  }
  return ctx.createPattern(tile, 'repeat');
}

let scanTile = null;

export function scanlinePattern(ctx) {
  if (!scanTile) {
    scanTile = document.createElement('canvas');
    scanTile.width = 4;
    scanTile.height = 4;
    const tctx = scanTile.getContext('2d');
    tctx.fillStyle = 'rgba(255,255,255,0.16)';
    tctx.fillRect(0, 0, 4, 1);
    tctx.fillStyle = 'rgba(0,0,0,0.20)';
    tctx.fillRect(0, 2, 4, 1);
  }
  return ctx.createPattern(scanTile, 'repeat');
}

export function applyPhotoFilter(ctx, grade, draw) {
  ctx.save();
  ctx.filter = grade.filter;
  draw();
  ctx.restore();
}

export function applyGradeLayers(ctx, box, grade, w, seed) {
  const { x, y, width, height } = box;
  ctx.save();
  ctx.globalCompositeOperation = grade.blend;
  ctx.globalAlpha = grade.tintAlpha;
  const diagonal = ctx.createLinearGradient(x, y, x + width, y + height);
  diagonal.addColorStop(0, grade.tintA);
  diagonal.addColorStop(0.55, grade.tintB);
  diagonal.addColorStop(1, grade.deep);
  ctx.fillStyle = diagonal;
  ctx.fillRect(x, y, width, height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = grade.washAlpha;
  const wash = ctx.createLinearGradient(x, y + height, x + width * 0.4, y);
  wash.addColorStop(0, grade.wash);
  wash.addColorStop(0.7, 'rgba(0,0,0,0)');
  wash.addColorStop(1, grade.leak);
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, width, height);

  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.26;
  const shade = ctx.createLinearGradient(x, y, x, y + height);
  shade.addColorStop(0, grade.deep);
  shade.addColorStop(0.45, 'rgba(255,255,255,1)');
  shade.addColorStop(1, grade.shadow);
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.20;
  const leakX = x + width * (seed % 2 === 0 ? 0.06 : 0.72);
  const leak = ctx.createLinearGradient(leakX, y + height * 0.8, leakX + width * 0.32, y - height * 0.1);
  leak.addColorStop(0, 'rgba(0,0,0,0)');
  leak.addColorStop(0.5, grade.leak);
  leak.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = leak;
  ctx.beginPath();
  ctx.moveTo(leakX, y + height);
  ctx.lineTo(leakX + width * 0.12, y + height);
  ctx.lineTo(leakX + width * 0.44, y);
  ctx.lineTo(leakX + width * 0.30, y);
  ctx.closePath();
  ctx.fill();

  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = grade.grain;
  const pattern = grainPattern(ctx, seed + 41);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, width, height);
  }

  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.10;
  const scan = scanlinePattern(ctx);
  if (scan) {
    ctx.fillStyle = scan;
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

export function applyPanelReadability(ctx, box, grade, captionRect) {
  const { x, y, width, height } = box;
  ctx.save();
  const bottom = ctx.createLinearGradient(0, y + height * 0.42, 0, y + height);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(1, grade.shadow);
  ctx.globalAlpha = captionRect ? 0.58 : 0.34;
  ctx.fillStyle = bottom;
  ctx.fillRect(x, y, width, height);

  const inner = ctx.createRadialGradient(
    x + width / 2, y + height / 2, Math.min(width, height) * 0.10,
    x + width / 2, y + height / 2, Math.max(width, height) * 0.76,
  );
  inner.addColorStop(0, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(10,2,26,0.48)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = inner;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}
