import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const layoutsModule = read('app/src/layouts.js');
const { LAYOUTS_BY_SIZE, SIZE_DIMENSIONS } = await import(
  `data:text/javascript;base64,${Buffer.from(layoutsModule).toString('base64')}`
);

const failures = [];
let checkedLayouts = 0;
let checkedCells = 0;

const fail = (message) => failures.push(message);
const assertSource = (condition, message) => { if (!condition) fail(message); };

function toPixels(points, dims) {
  return points.map(([x, y]) => ({ x: x * dims.w, y: y * dims.h }));
}

function pointInConvex(poly, point) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(cross) < 1e-6) continue;
    const next = cross > 0 ? 1 : -1;
    if (sign === 0) sign = next;
    else if (sign !== next) return false;
  }
  return true;
}

function convexOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axisX = -(p2.y - p1.y);
      const axisY = p2.x - p1.x;
      const project = (points) => points.map((p) => p.x * axisX + p.y * axisY);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function polygonDistance(a, b) {
  if (convexOverlap(a, b)) return 0;
  let best = Infinity;
  for (const poly of [a, b]) {
    const other = poly === a ? b : a;
    for (const point of poly) {
      for (let i = 0; i < other.length; i++) {
        best = Math.min(best, pointSegmentDistance(point, other[i], other[(i + 1) % other.length]));
      }
    }
  }
  return best;
}

function polygonArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function sunVisibleFraction(sun, panels, dims) {
  let visible = 0;
  let total = 0;
  for (let gx = -12; gx <= 12; gx++) {
    for (let gy = -12; gy <= 12; gy++) {
      const u = gx / 12;
      const v = gy / 12;
      if (u * u + v * v > 1) continue;
      total++;
      const point = {
        x: (sun.x + u * sun.r) * dims.w,
        y: sun.y * dims.h + v * sun.r * dims.w,
      };
      if (!panels.some((panel) => pointInConvex(panel, point))) visible++;
    }
  }
  return total ? visible / total : 0;
}

function maxEdgeTilt(poly) {
  let tilt = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const fromHorizontal = Math.atan2(dy, dx) * 180 / Math.PI;
    const fromVertical = Math.atan2(dx, dy) * 180 / Math.PI;
    tilt = Math.max(tilt, Math.min(fromHorizontal, fromVertical));
  }
  return tilt;
}

function polygonThickness(poly) {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    const distances = poly.map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny);
    min = Math.min(min, Math.max(...distances) - Math.min(...distances));
  }
  return min;
}

for (const [sizeId, layouts] of Object.entries(LAYOUTS_BY_SIZE)) {
  const dims = SIZE_DIMENSIONS[sizeId];
  for (const [layoutId, layout] of Object.entries(layouts)) {
    checkedLayouts++;
    const label = `${sizeId}/${layoutId}`;
    const panels = layout.panels.map((points) => toPixels(points, dims));
    if (panels.length < 4 || panels.length > 6) fail(`${label}: panel count ${panels.length} outside 4..6`);

    const areas = panels.map((panel) => polygonArea(panel) / (dims.w * dims.h));
    const coverage = areas.reduce((sum, area) => sum + area, 0);
    const bounds = layout.panels.reduce((acc, points) => {
      for (const [x, y] of points) {
        acc.minX = Math.min(acc.minX, x);
        acc.maxX = Math.max(acc.maxX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxY = Math.max(acc.maxY, y);
      }
      return acc;
    }, { minX: 1, maxX: 0, minY: 1, maxY: 0 });
    const targetYEnd = dims.w > dims.h * 1.2 ? 0.90 : 0.88;
    const sun = layout.sunWindow;
    const visible = sun ? sunVisibleFraction(sun, panels, dims) : 0;
    const tilt = Math.max(...panels.map(maxEdgeTilt));
    console.log(`${label}: coverage ${(coverage * 100).toFixed(1)}%, panels ${panels.length}, min-panel ${(Math.min(...areas) * 100).toFixed(1)}%, tilt ${tilt.toFixed(1)}°, sun ${sun ? (sun.r * 100).toFixed(1) : '?'}%/${(visible * 100).toFixed(0)}% visible`);

    if (tilt > 2.001) fail(`${label}: edge tilt ${tilt.toFixed(2)}° above 2°`);
    if (coverage < 0.55) fail(`${label}: coverage ${(coverage * 100).toFixed(1)}% below 55%`);
    if (Math.abs(bounds.minX - 0.03) > 0.001 || Math.abs(bounds.maxX - 0.97) > 0.001) {
      fail(`${label}: collage x span ${bounds.minX.toFixed(3)}..${bounds.maxX.toFixed(3)}`);
    }
    if (Math.abs(bounds.minY - 0.05) > 0.001 || Math.abs(bounds.maxY - targetYEnd) > 0.001) {
      fail(`${label}: collage y span ${bounds.minY.toFixed(3)}..${bounds.maxY.toFixed(3)}`);
    }
    if (!sun || sun.r < 0.13 - 1e-6 || sun.r > 0.16 + 1e-6) fail(`${label}: sun radius ${sun?.r} outside 13..16%`);
    if (visible < 0.35 - 1e-6) fail(`${label}: sun visibility ${(visible * 100).toFixed(1)}% below 35%`);

    for (const [index, points] of layout.panels.entries()) {
      for (const [x, y] of points) {
        if (x < 0.02 - 1e-6 || x > 0.98 + 1e-6) fail(`${label}: panel ${index} x margin ${x}`);
        if (y < 0.02 - 1e-6 || y > 0.98 + 1e-6) fail(`${label}: panel ${index} y margin ${y}`);
      }
      if (areas[index] < 0.04 - 1e-6) fail(`${label}: panel ${index} area ${(areas[index] * 100).toFixed(1)}% below 4%`);
      const thickness = polygonThickness(panels[index]) / dims.w;
      if (thickness < 0.09 - 1e-6) fail(`${label}: panel ${index} thickness ${thickness.toFixed(4)} < 0.09`);
    }

    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const distance = polygonDistance(panels[i], panels[j]) / dims.w;
        if (distance < 0.012 - 1e-6) fail(`${label}: panels ${i}/${j} gutter ${distance.toFixed(4)} < 0.012`);
      }
    }

    for (let gx = 0; gx < 200; gx++) {
      for (let gy = 0; gy < 200; gy++) {
        checkedCells++;
        const point = { x: ((gx + 0.5) / 200) * dims.w, y: ((gy + 0.5) / 200) * dims.h };
        const count = panels.filter((panel) => pointInConvex(panel, point)).length;
        if (count > 1) {
          fail(`${label}: grid cell ${gx},${gy} belongs to ${count} panels`);
          gx = 200;
          gy = 200;
        }
      }
    }
  }
}

const EXPECTED_LAYOUTS = ['left-hero', 'diagonal-slash', 'flank-triptych', 'grid-slant', 'top-strip', 'asymmetric-mosaic', 'triptych'];
for (const [sizeId, layouts] of Object.entries(LAYOUTS_BY_SIZE)) {
  const ids = Object.keys(layouts);
  if (ids.length !== EXPECTED_LAYOUTS.length || EXPECTED_LAYOUTS.some((id) => !ids.includes(id))) {
    fail(`${sizeId}: expected seven Round 4 layout ids, got ${ids.join(',')}`);
  }
  const names = ids.map((id) => layouts[id].name);
  if (new Set(names).size !== names.length) fail(`${sizeId}: layout names are not distinct`);
}

const renderSource = read('app/src/render.js');
assertSource((renderSource.match(/polygonPath\(ctx, points, w, h\);/g) ?? []).length >= 6,
  'render.js: too few shared polygonPath calls');
assertSource(/polygonPath\(ctx, points, w, h\);\s*\n\s*ctx\.clip\(\)/.test(renderSource),
  'render.js: clip does not use the shared polygon path');
assertSource(!/polygonPath\([^)]*,[^)]*,[^)]*,[^)]*,/.test(renderSource),
  'render.js: polygonPath called with inset/scaled arguments');
assertSource(!/inset|scaledPoints|expandPoly/i.test(renderSource),
  'render.js: inset or scaled geometry still present');

const letteringSource = read('app/src/lettering.js');
assertSource(/\[1, 2, 3\]/.test(letteringSource), 'lettering.js: 1/2/3-line candidate evaluation missing');
assertSource(/function balancedGroups/.test(letteringSource), 'lettering.js: balanced line groups missing');
assertSource(/0\.84/.test(letteringSource) && /0\.64/.test(letteringSource), 'lettering.js: width limits missing');
assertSource(/0\.28/.test(letteringSource) && /0\.34/.test(letteringSource), 'lettering.js: height limits missing');
assertSource(/ctx\.measureText/.test(letteringSource), 'lettering.js: measured text widths missing');
assertSource(/Math\.min\(1\.25/.test(letteringSource), 'lettering.js: 1.25 stretch cap missing');
assertSource(/lineHeight: size \* 0\.92/.test(letteringSource), 'lettering.js: 0.92 line height missing');
assertSource(/size \* 0\.03/.test(letteringSource), 'lettering.js: 3% tracking cap missing');
assertSource(/panelBottom - 0\.12/.test(letteringSource), 'lettering.js: caption overlap anchor missing');
assertSource(/h \* 0\.96/.test(letteringSource), 'lettering.js: 4% bottom margin clamp missing');
assertSource(/captionWidthFraction/.test(letteringSource), 'lettering.js: caption width diagnostics missing');
assertSource(!/baseline - size \* 0\.74/.test(letteringSource), 'lettering.js: ghost outline remains');
assertSource(/const steps = 4/.test(letteringSource), 'lettering.js: extrusion not capped at 4 steps');
assertSource(/Math\.max\(1, 3 \* scale\)/.test(renderSource), 'render.js: 3px rim missing');
assertSource(/shadowBlur = 10 \* scale/.test(renderSource), 'render.js: 10px glow missing');
assertSource(/captionWidthFraction/.test(renderSource), 'render.js: caption fraction diagnostics missing');

const gradeSource = read('app/src/grades.js');
assertSource(/saturate\(1\.2\) contrast\(1\.08\)/.test(gradeSource), 'grades.js: Vice Sunset punch missing');

const stateSource = read('app/src/state.js');
assertSource(/CAPTION_TITLES = \['NEON NIGHTS'/.test(stateSource), 'state.js: punchy captions missing');
assertSource(/caption: 'NEON NIGHTS'/.test(stateSource), 'state.js: default caption missing');
assertSource(/font: 'archivo'/.test(stateSource), 'state.js: Archivo Black default font missing');
assertSource(/state\.caption = pick\(CAPTION_TITLES\)/.test(stateSource), 'state.js: randomise caption missing');

const shots = JSON.parse(read('shots.json'));
for (const shot of shots) {
  const query = new URLSearchParams(shot.query.replace(/^\?/, ''));
  const caption = query.get('caption') ?? '';
  const size = query.get('size') ?? '';
  const template = query.get('template') ?? '';
  assertSource(caption.includes(' ') && !caption.includes('\n'), `shots.json: ${shot.name} caption is not two words`);
  assertSource(Boolean(LAYOUTS_BY_SIZE[size]?.[template]), `shots.json: ${shot.name} uses unknown template ${size}/${template}`);
}

const scenerySource = read('app/src/scenery.js');
assertSource(/Math\.min\(sun\.r, 0\.16\)/.test(scenerySource), 'scenery.js: sun radius cap missing');
assertSource(/visible < 0\.35/.test(scenerySource), 'scenery.js: sun visibility threshold missing');
assertSource(/layout\.sunWindow/.test(scenerySource), 'scenery.js: sun window not used');
assertSource(!/scoreAll/.test(scenerySource), 'scenery.js: old sun enlargement path remains');

const mainSource = read('app/src/main.js');
assertSource(/new ResizeObserver/.test(mainSource), 'main.js: preview ResizeObserver missing');

const photosSource = read('app/src/photos.js');
assertSource(/requiredFocusScale/.test(photosSource), 'photos.js: focus-aware scale missing');
assertSource(/0\.18, 0\.62/.test(photosSource), 'photos.js: focus band clamp missing');

if (failures.length) {
  console.error(`FAILED ${failures.length} checks`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`OK: ${checkedLayouts} layouts, ${checkedCells} grid cells, source path checks passed`);
