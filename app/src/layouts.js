const SIZE_DIMENSIONS = {
  '1080x1080': { w: 1080, h: 1080, ratio: '1:1', label: 'Square' },
  '1080x1350': { w: 1080, h: 1350, ratio: '4:5', label: 'Portrait' },
  '1920x1080': { w: 1920, h: 1080, ratio: '16:9', label: 'Landscape' },
};

const X0 = 0.03;
const X1 = 0.97;
const GX = 0.012;
const SUN_W = 0.20;
const SUN_H = 0.24;
const SUN_R = 0.13;

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

function splitStack(x0, x1, y0, y1, count, gap) {
  const height = (y1 - y0 - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => rect(x0, y0 + i * (height + gap), x1 - x0, height));
}

function splitRow(x0, x1, y0, y1, weights, gap, slantShift = 0) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const available = x1 - x0 - gap * (weights.length - 1);
  const topEdges = [x0];
  let cursor = x0;
  weights.forEach((weight, i) => {
    cursor += available * (weight / total);
    topEdges.push(cursor);
    if (i < weights.length - 1) {
      cursor += gap;
      topEdges.push(cursor);
    }
  });
  const bottomEdges = topEdges.map((edge, index) =>
    edge + (index % 2 === 0 ? slantShift : -slantShift));
  return weights.map((_, i) => {
    const left = i * 2;
    const right = left + 1;
    return [
      [topEdges[left], y0],
      [topEdges[right], y0],
      [bottomEdges[right], y1],
      [bottomEdges[left], y1],
    ];
  });
}

function buildLayout(dims, builder) {
  const landscape = dims.w > dims.h * 1.2;
  const context = {
    x0: X0,
    x1: X1,
    y0: 0.05,
    y1: landscape ? 0.90 : 0.88,
    gx: GX,
    gy: GX * dims.w / dims.h,
    sunH: SUN_H * dims.w / dims.h,
    aspect: dims.h / dims.w,
    landscape,
  };
  const result = builder(context);
  return {
    name: result.name,
    panels: result.panels,
    sunWindow: {
      x: result.sunX,
      y: context.y0 + context.sunH / 2,
      w: SUN_W,
      h: context.sunH,
      r: SUN_R,
    },
  };
}

function leftHero({ x0, x1, y0, y1, gy }) {
  const heroRight = 0.61;
  const sunRight = 0.81;
  return {
    name: 'Left Hero',
    sunX: (heroRight + GX + sunRight) / 2,
    panels: [
      rect(x0, y0, heroRight - x0, y1 - y0),
      ...splitStack(sunRight, x1, y0, y1, 3, gy),
    ],
  };
}

function diagonalSlash({ x0, x1, y0, y1, gy, sunH, aspect }) {
  const sunBottom = y0 + sunH;
  const topY1 = sunBottom - gy;
  const slant = Math.min(0.006, Math.tan(2 * Math.PI / 180) * (y1 - sunBottom - gy) * aspect * 0.75);
  return {
    name: 'Diagonal Slash',
    sunX: 0.50,
    panels: [
      rect(x0, y0, 0.38 - x0, topY1 - y0),
      rect(0.62, y0, x1 - 0.62, topY1 - y0),
      ...splitRow(x0, x1, sunBottom + gy, y1, [1, 1], GX + 2 * slant, slant),
    ],
  };
}

function flankTriptych({ x0, x1, y0, y1, gy, sunH }) {
  const sunBottom = y0 + sunH;
  const split = y0 + (y1 - y0) * 0.48;
  return {
    name: 'Flanked Centre',
    sunX: 0.50,
    panels: [
      rect(x0, y0, 0.36 - x0, split - y0),
      rect(x0, split + gy, 0.36 - x0, y1 - split - gy),
      rect(0.64, y0, x1 - 0.64, split - y0),
      rect(0.64, split + gy, x1 - 0.64, y1 - split - gy),
      rect(0.40, sunBottom + gy, 0.20, y1 - sunBottom - gy),
    ],
  };
}

function gridSlant({ x0, x1, y0, y1, gy, sunH, aspect }) {
  const sunBottom = y0 + sunH;
  const leftX1 = 0.46;
  const rightX0 = 0.66;
  const stackSplit = (y0 + sunBottom) / 2;
  const slant = Math.min(0.006, Math.tan(2 * Math.PI / 180) * (y1 - sunBottom - gy) * aspect * 0.75);
  return {
    name: 'Grid Slant',
    sunX: (leftX1 + rightX0) / 2,
    panels: [
      rect(x0, y0, leftX1 - x0, stackSplit - y0),
      rect(x0, stackSplit + gy, leftX1 - x0, sunBottom - stackSplit),
      rect(rightX0, y0, x1 - rightX0, sunBottom + gy - y0),
      ...splitRow(x0, x1, sunBottom + gy * 2, y1, [1, 1, 1], GX + 2 * slant, slant),
    ],
  };
}

function topStrip({ x0, x1, y0, y1, gy, sunH }) {
  const sunBottom = y0 + sunH;
  return {
    name: 'Top Strip',
    sunX: 0.50,
    panels: [
      rect(x0, y0, 0.38 - x0, sunBottom - y0),
      rect(0.62, y0, x1 - 0.62, sunBottom - y0),
      ...splitRow(x0, x1, sunBottom + gy, y1, [1, 1, 1, 1], GX),
    ],
  };
}

function asymmetricMosaic({ x0, x1, y0, y1, gy, sunH }) {
  const sunBottom = y0 + sunH;
  return {
    name: 'Asymmetric Mosaic',
    sunX: 0.835,
    panels: [
      rect(x0, y0, 0.44 - x0, 0.50 - y0),
      rect(x0, 0.50 + gy, 0.44 - x0, y1 - 0.50 - gy),
      rect(0.46, y0, 0.22, 0.42 - y0),
      rect(0.46, 0.42 + gy, 0.22, y1 - 0.42 - gy),
      rect(0.70, sunBottom + gy, x1 - 0.70, y1 - sunBottom - gy),
    ],
  };
}

function triptych({ x0, x1, y0, y1, gy, sunH }) {
  const sunBottom = y0 + sunH;
  return {
    name: 'Neon Triptych',
    sunX: 0.526,
    panels: [
      rect(x0, y0, 0.388 - x0, y1 - y0),
      rect(0.40, sunBottom + gy, 0.12, y1 - sunBottom - gy),
      rect(0.532, sunBottom + gy, 0.118, y1 - sunBottom - gy),
      rect(0.662, y0, x1 - 0.662, y1 - y0),
    ],
  };
}

const BUILDERS_BY_SIZE = {
  '1080x1080': {
    'left-hero': leftHero,
    'diagonal-slash': diagonalSlash,
    'flank-triptych': flankTriptych,
    'grid-slant': gridSlant,
    'top-strip': topStrip,
    'asymmetric-mosaic': asymmetricMosaic,
    triptych,
  },
  '1080x1350': {
    'left-hero': leftHero,
    'diagonal-slash': diagonalSlash,
    'flank-triptych': flankTriptych,
    'grid-slant': gridSlant,
    'top-strip': topStrip,
    'asymmetric-mosaic': asymmetricMosaic,
    triptych,
  },
  '1920x1080': {
    'left-hero': leftHero,
    'diagonal-slash': diagonalSlash,
    'flank-triptych': flankTriptych,
    'grid-slant': gridSlant,
    'top-strip': topStrip,
    'asymmetric-mosaic': asymmetricMosaic,
    triptych,
  },
};

export const LAYOUTS_BY_SIZE = Object.fromEntries(Object.entries(BUILDERS_BY_SIZE).map(([sizeId, builders]) => [
  sizeId,
  Object.fromEntries(Object.entries(builders).map(([id, builder]) => [id, buildLayout(SIZE_DIMENSIONS[sizeId], builder)])),
]));

export { SIZE_DIMENSIONS };

export function layoutsFor(sizeId) {
  return LAYOUTS_BY_SIZE[sizeId] ?? LAYOUTS_BY_SIZE['1080x1080'];
}

export function layoutIdsFor(sizeId) {
  return Object.keys(layoutsFor(sizeId));
}

export function getLayout(sizeId, templateId) {
  const set = layoutsFor(sizeId);
  return set[templateId] ?? set[Object.keys(set)[0]];
}

export function equivalentTemplate(templateId, fromSize, toSize) {
  if (fromSize === toSize) return templateId;
  return layoutsFor(toSize)[templateId] ? templateId : Object.keys(layoutsFor(toSize))[0];
}

export function panelBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, aspect: (maxX - minX) / (maxY - minY) };
}

export function polygonPath(ctx, points, w, h) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x * w, y * h);
    else ctx.lineTo(x * w, y * h);
  });
  ctx.closePath();
}

export function panelCentroid(points) {
  let x = 0, y = 0;
  for (const p of points) { x += p[0]; y += p[1]; }
  return { x: x / points.length, y: y / points.length };
}
