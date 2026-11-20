// Procedural Vice City scenery: sunset sky, a striped sun chosen to avoid the photo collage,
// dark ground with a neon grid, and layered palm-tree silhouettes. No external artwork.
import { panelBounds } from './layouts.js';
import { mulberry32 } from './state.js';

const SKY_STOPS = [
  [0.00, '#100b42'],
  [0.16, '#2b115e'],
  [0.34, '#6c1b86'],
  [0.50, '#d42a86'],
  [0.64, '#ff5a63'],
  [0.74, '#ff9b45'],
  [0.82, '#ffd873'],
];

function drawSky(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.86);
  for (const [at, color] of SKY_STOPS) sky.addColorStop(at, color);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const haze = ctx.createRadialGradient(w * 0.52, h * 0.70, 0, w * 0.52, h * 0.70, w * 0.78);
  haze.addColorStop(0, 'rgba(255,196,92,0.38)');
  haze.addColorStop(0.55, 'rgba(255,72,150,0.12)');
  haze.addColorStop(1, 'rgba(20,4,50,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
}

function drawStarsAndBirds(ctx, w, h, seed) {
  const rng = mulberry32(seed ^ 0x5eed);
  ctx.save();
  for (let i = 0; i < 44; i++) {
    const x = rng() * w;
    const y = rng() * h * 0.42;
    const size = (0.6 + rng() * 1.5) * (w / 1080);
    ctx.globalAlpha = 0.18 + rng() * 0.45;
    ctx.fillStyle = rng() > 0.7 ? '#ffd9f4' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = '#2a0b36';
  ctx.lineWidth = Math.max(1, w * 0.0014);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.14 + rng() * 0.72);
    const y = h * (0.20 + rng() * 0.20);
    const s = w * (0.006 + rng() * 0.004);
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.5, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.5, x + s, y);
    ctx.stroke();
  }
  ctx.restore();
}

function makeOccupancyMask(w, h, layout, captionRect) {
  const maskW = 96;
  const maskH = Math.max(24, Math.round(maskW * h / w));
  const canvas = document.createElement('canvas');
  canvas.width = maskW;
  canvas.height = maskH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  for (const panel of layout.panels) {
    ctx.beginPath();
    panel.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * maskW, y * maskH);
      else ctx.lineTo(x * maskW, y * maskH);
    });
    ctx.closePath();
    ctx.fill();
  }
  if (captionRect) {
    ctx.fillRect(captionRect.x * maskW, captionRect.y * maskH, captionRect.w * maskW, captionRect.h * maskH);
  }
  return { data: ctx.getImageData(0, 0, maskW, maskH).data, width: maskW, height: maskH };
}

function visibleFraction(mask, cx, cy, radius) {
  let visible = 0;
  let total = 0;
  for (let ring = 0; ring < 6; ring++) {
    const rr = radius * (ring + 0.5) / 6;
    const count = 8 + ring * 4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + ring * 0.13;
      const px = Math.round(cx * mask.width + Math.cos(angle) * rr);
      const py = Math.round(cy * mask.height + Math.sin(angle) * rr);
      total++;
      if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) continue;
      if (mask.data[(py * mask.width + px) * 4 + 3] < 24) visible++;
    }
  }
  return total ? visible / total : 0;
}

export function chooseSunPosition(w, h, layout, captionRect, seed) {
  const mask = makeOccupancyMask(w, h, layout, captionRect);
  const rng = mulberry32(seed ^ 0x5a17);
  const window = layout.sunWindow;
  const candidates = [];
  if (window) candidates.push({ x: window.x, y: window.y, r: window.r });
  for (let i = 0; i < 12; i++) {
    candidates.push({
      x: (window?.x ?? 0.5) + (rng() - 0.5) * (window?.w ?? 0.12) * 0.4,
      y: (window?.y ?? 0.25) + (rng() - 0.5) * (window?.h ?? 0.16) * 0.4,
      r: (window?.r ?? 0.13) + rng() * 0.02,
    });
  }
  for (let i = 0; i < 12; i++) {
    candidates.push({
      x: 0.15 + (i % 6) * 0.14 + (rng() - 0.5) * 0.018,
      y: 0.18 + Math.floor(i / 6) * 0.17 + (rng() - 0.5) * 0.018,
      r: 0.13 + rng() * 0.03,
    });
  }
  let best = null;
  let fallback = null;
  for (const c of candidates) {
    const visible = visibleFraction(mask, c.x, c.y, c.r * mask.width);
    const centreBonus = 0.075 * (1 - Math.abs(c.x - 0.5) * 2);
    const candidate = { x: c.x, y: c.y, r: Math.min(0.16, c.r), visible, score: visible + centreBonus };
    if (!fallback || candidate.score > fallback.score) fallback = candidate;
    if (candidate.visible < 0.35) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best ?? fallback;
}

function createSunDisc(radius, seed) {
  const pad = Math.ceil(radius * 0.62);
  const size = Math.ceil(radius * 2 + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  const glow = ctx.createRadialGradient(center, center, radius * 0.55, center, center, radius * 1.55);
  glow.addColorStop(0, 'rgba(255,126,120,0.44)');
  glow.addColorStop(0.42, 'rgba(255,72,158,0.20)');
  glow.addColorStop(1, 'rgba(255,45,150,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();
  const disc = ctx.createLinearGradient(0, center - radius, 0, center + radius);
  disc.addColorStop(0, '#fff3a8');
  disc.addColorStop(0.34, '#ffd447');
  disc.addColorStop(0.68, '#ff8c45');
  disc.addColorStop(1, '#ff2f91');
  ctx.fillStyle = disc;
  ctx.fillRect(center - radius, center - radius, radius * 2, radius * 2);

  ctx.globalCompositeOperation = 'destination-out';
  const rng = mulberry32(seed ^ 0x5717);
  for (let i = 0; i < 9; i++) {
    const y = center + radius * (0.08 + i * 0.104 + rng() * 0.008);
    const thickness = radius * (0.012 + i * 0.0125);
    ctx.fillRect(center - radius - 1, y, radius * 2 + 2, thickness);
  }
  ctx.restore();
  return canvas;
}

function drawSun(ctx, w, h, sun, seed) {
  const radiusPx = Math.min(sun.r, 0.16) * w;
  const disc = createSunDisc(radiusPx, seed);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.96;
  ctx.drawImage(disc, sun.x * w - disc.width / 2, sun.y * h - disc.height / 2);
  ctx.restore();
}

function drawGround(ctx, w, h, sun, showGrid) {
  const horizon = h * 0.79;
  const ground = ctx.createLinearGradient(0, horizon - h * 0.03, 0, h);
  ground.addColorStop(0, 'rgba(82,20,96,0)');
  ground.addColorStop(0.18, '#41115f');
  ground.addColorStop(0.60, '#230b44');
  ground.addColorStop(1, '#0f0527');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon - h * 0.03, w, h - horizon + h * 0.03);

  if (!showGrid) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, w, h - horizon);
  ctx.clip();
  const vanishingX = sun.x * w;
  ctx.lineWidth = Math.max(1, w * 0.0009);
  for (let i = -10; i <= 10; i++) {
    const x = w / 2 + i * w * 0.14;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,64,190,0.24)' : 'rgba(60,230,255,0.20)';
    ctx.beginPath();
    ctx.moveTo(vanishingX, horizon);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const t = (i + 1) / 12;
    const y = horizon + (h - horizon) * t * t * 1.08;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,64,190,0.22)' : 'rgba(60,230,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function palmFrond(ctx, x, y, angle, length, width, rng) {
  const ex = x + Math.cos(angle) * length;
  const ey = y + Math.sin(angle) * length * 0.48;
  const mx = x + Math.cos(angle) * length * 0.48;
  const my = y + Math.sin(angle) * length * 0.18 - length * 0.16;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx, my, ex, ey);
  ctx.quadraticCurveTo(mx, my + width, x, y);
  ctx.closePath();
  ctx.fill();
  const leaves = 5;
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 1);
    const lx = x + Math.cos(angle) * length * t + (rng() - 0.5) * length * 0.03;
    const ly = y + Math.sin(angle) * length * t * 0.46 - length * 0.10 * Math.sin(Math.PI * t);
    const side = i % 2 === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + side * length * 0.10, ly + length * (0.09 + rng() * 0.05));
    ctx.lineTo(lx + length * 0.045, ly + length * 0.02);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPalm(ctx, x, baseY, height, lean, seed, color, alpha) {
  const rng = mulberry32(seed);
  const topX = x + height * lean;
  const topY = baseY - height;
  const midX = x + height * lean * 0.35;
  const midY = baseY - height * 0.55;
  const trunkWidth = Math.max(2, height * 0.028);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.moveTo(x - trunkWidth, baseY);
  ctx.quadraticCurveTo(midX - trunkWidth * 0.65, midY, topX - trunkWidth * 0.4, topY);
  ctx.lineTo(topX + trunkWidth * 0.4, topY);
  ctx.quadraticCurveTo(midX + trunkWidth * 0.65, midY, x + trunkWidth, baseY);
  ctx.closePath();
  ctx.fill();

  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const angle = Math.PI + (i / (fronds - 1)) * Math.PI;
    const length = height * (0.30 + rng() * 0.16);
    palmFrond(ctx, topX, topY, angle, length, height * 0.018, rng);
  }
  ctx.restore();
}

function drawPalmLayers(ctx, w, h, seed) {
  drawPalm(ctx, w * 0.16, h * 0.90, h * 0.34, 0.045, seed ^ 0x11, '#6a2a7a', 0.34);
  drawPalm(ctx, w * 0.86, h * 0.90, h * 0.31, -0.055, seed ^ 0x22, '#6a2a7a', 0.30);
  drawPalm(ctx, w * 0.28, h * 0.93, h * 0.24, -0.03, seed ^ 0x33, '#541d68', 0.34);
  drawPalm(ctx, w * 0.04, h * 1.02, h * 0.64, 0.085, seed ^ 0x44, '#0c0419', 0.96);
  drawPalm(ctx, w * 0.97, h * 1.02, h * 0.58, -0.078, seed ^ 0x55, '#0b0417', 0.95);
}

export function drawScenery(ctx, w, h, state, layout, captionRect) {
  drawSky(ctx, w, h);
  drawStarsAndBirds(ctx, w, h, state.seed);
  const sun = chooseSunPosition(w, h, layout, captionRect, state.seed);
  drawSun(ctx, w, h, sun, state.seed);
  drawGround(ctx, w, h, sun, state.showGrid);
  drawPalmLayers(ctx, w, h, state.seed);
  return sun;
}

export function sceneryDiagnostics(w, h, layout, captionRect, seed) {
  const panelArea = layout.panels.reduce((sum, p) => {
    const b = panelBounds(p);
    return sum + b.w * b.h;
  }, 0);
  const sun = chooseSunPosition(w, h, layout, captionRect, seed);
  return {
    sun,
    panelAreaFraction: panelArea,
    captionInside: Boolean(captionRect && captionRect.x >= 0 && captionRect.y >= 0 &&
      captionRect.x + captionRect.w <= 1.0001 && captionRect.y + captionRect.h <= 1.0001),
  };
}
