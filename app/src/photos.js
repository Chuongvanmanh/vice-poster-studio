// Photo intake, aspect-aware panel assignment and cover-fit crop maths. Files stay on the device:
// samples are local relative URLs and user photos use URL.createObjectURL().
import { panelBounds, SIZE_DIMENSIONS } from './layouts.js';
import { mulberry32 } from './state.js';

export const SAMPLE_NAMES = [
  'convertible', 'gasstation', 'beach-couple', 'club-dancer',
  'driver', 'skater', 'boulevard', 'suit',
];

export function sampleURL(name) {
  return `./samples/${name}.jpg`;
}

export function loadImage(url, name, kind = 'sample') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({
      id: `${kind}:${name}:${url}`,
      name,
      img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      aspect: img.naturalWidth / img.naturalHeight,
      url,
      kind,
    });
    img.onerror = () => reject(new Error(`Could not load ${name}`));
    img.src = url;
  });
}

export async function loadSamplePhotos(names) {
  const settled = await Promise.all(names.map((name) => loadImage(sampleURL(name), name).catch(() => null)));
  return settled.filter(Boolean);
}

export async function loadUserFiles(files) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  const settled = await Promise.all(list.map(async (file, index) => {
    const url = URL.createObjectURL(file);
    try {
      return await loadImage(url, file.name.replace(/\.[^.]+$/, '') || `Photo ${index + 1}`, 'upload');
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  }));
  return settled.filter(Boolean);
}

function aspectDistance(panelAspect, photoAspect) {
  return Math.abs(Math.log(panelAspect) - Math.log(photoAspect));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function panelPixelBox(points, dims) {
  const bounds = panelBounds(points);
  return {
    x: bounds.x * dims.w,
    y: bounds.y * dims.h,
    w: bounds.w * dims.w,
    h: bounds.h * dims.h,
    aspect: (bounds.w * dims.w) / (bounds.h * dims.h),
  };
}

function focusGeometry(iw, ih, state) {
  const angle = (state.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = ((state.fx ?? 0.5) - 0.5) * iw * (state.flipX ? -1 : 1);
  const localY = ((state.fy ?? 0.5) - 0.5) * ih * (state.flipY ? -1 : 1);
  return {
    angle,
    cos,
    sin,
    rWidth: Math.abs(iw * cos) + Math.abs(ih * sin),
    rHeight: Math.abs(iw * sin) + Math.abs(ih * cos),
    tx: localX * cos - localY * sin,
    ty: localX * sin + localY * cos,
  };
}

function requiredFocusScale(geom, box, targetX, targetY) {
  const dx = (targetX - 0.5) * box.w;
  const dy = (targetY - 0.5) * box.h;
  const ratio = (numerator, denominator) => denominator > 1e-3 ? numerator / denominator : 0;
  return Math.max(
    box.w / geom.rWidth,
    box.h / geom.rHeight,
    ratio(dx + box.w / 2, geom.rWidth / 2 + geom.tx),
    ratio(box.w / 2 - dx, geom.rWidth / 2 - geom.tx),
    ratio(dy + box.h / 2, geom.rHeight / 2 + geom.ty),
    ratio(box.h / 2 - dy, geom.rHeight / 2 - geom.ty),
  );
}

function defaultFocus(photo, panelBox) {
  const portrait = photo.height > photo.width;
  return { fx: 0.5, fy: portrait || panelBox.aspect > photo.aspect ? 0.30 : 0.44 };
}

export function assignPhotosToPanels(state, layout, options = {}) {
  const { seeded = false } = options;
  const rng = mulberry32((state.seed ^ 0xa55a) >>> 0);
  const dims = SIZE_DIMENSIONS[state.size] ?? SIZE_DIMENSIONS['1080x1080'];
  const panels = layout.panels.map((points, index) => {
    const bounds = panelBounds(points);
    return { index, box: panelPixelBox(points, dims), area: bounds.w * bounds.h };
  });
  const sorted = [...panels].sort((a, b) => b.area - a.area);
  const used = new Set();
  const photoCount = state.photos.length;

  for (const panel of sorted) {
    const panelState = state.panels[panel.index];
    if (!panelState) continue;
    if (photoCount === 0) {
      panelState.photo = -1;
      continue;
    }
    if (state.onePhotoEverywhere) {
      panelState.photo = 0;
      const reuse = panel.index;
      panelState.fx = 0.34 + 0.32 * ((reuse * 0.37) % 1);
      panelState.fy = 0.28 + 0.24 * ((reuse * 0.61) % 1);
      panelState.zoom = 1.02 + (reuse % 3) * 0.08;
      panelState.cropSeed = (state.seed + reuse * 7919) >>> 0;
      panelState.autoFit = true;
      continue;
    }

    let candidates = state.photos.map((photo, i) => {
      const focus = defaultFocus(photo, panel.box);
      const geom = focusGeometry(photo.width, photo.height, focus);
      const needed = requiredFocusScale(geom, panel.box, 0.5, 0.5);
      return {
        i,
        score: aspectDistance(panel.box.aspect, photo.aspect)
          + 0.50 * Math.max(0, needed - 1.35)
          + 0.05 * Math.abs(focus.fy - 0.32),
      };
    });
    if (seeded) candidates = candidates.map((c) => ({ ...c, score: c.score + rng() * 0.12 }));
    candidates.sort((a, b) => a.score - b.score);
    const fresh = candidates.find((c) => !used.has(c.i));
    const choice = fresh ?? candidates[(panel.index * 3 + (seeded ? Math.floor(rng() * candidates.length) : 0)) % candidates.length];
    const photo = state.photos[choice.i];
    const focus = defaultFocus(photo, panel.box);
    panelState.photo = choice.i;
    panelState.fx = focus.fx;
    panelState.fy = focus.fy;
    panelState.zoom = 1;
    panelState.rotation = 0;
    panelState.flipX = false;
    panelState.flipY = false;
    panelState.autoFit = true;
    if (fresh) used.add(choice.i);
    else {
      const reuse = panel.index;
      panelState.cropSeed = (state.seed + reuse * 2654435761) >>> 0;
      panelState.fx = 0.34 + 0.32 * ((reuse * 0.43) % 1);
      panelState.fy = 0.28 + 0.24 * ((reuse * 0.71) % 1);
      panelState.zoom = 1.04 + (reuse % 3) * 0.06;
    }
  }
  return panels.length;
}

export function computeImageTransform(panelState, photo, box, captionRect) {
  const iw = photo.width;
  const ih = photo.height;
  const geom = focusGeometry(iw, ih, panelState);

  let targetX = 0.5;
  let targetY = 0.5;
  if (captionRect) {
    const overlapTop = Math.max(box.y, captionRect.y);
    const overlapBottom = Math.min(box.y + box.h, captionRect.y + captionRect.h);
    const covered = Math.max(0, overlapBottom - overlapTop);
    const uncovered = Math.max(0.001, box.h - covered);
    targetY = clamp((uncovered / 2) / box.h, 0.18, 0.62);
    if (captionRect.x < box.x + box.w * 0.35) targetX = 0.56;
    if (captionRect.x + captionRect.w > box.x + box.w * 0.65) targetX = 0.44;
  }

  let scale = requiredFocusScale(geom, box, targetX, targetY) * 1.02;
  if (panelState.autoFit !== false && scale > 1.7) scale = 1.7;
  scale *= panelState.zoom || 1;

  const shiftedX = geom.tx * scale;
  const shiftedY = geom.ty * scale;
  let cx = box.x + targetX * box.w - shiftedX;
  let cy = box.y + targetY * box.h - shiftedY;
  const halfW = geom.rWidth * scale / 2;
  const halfH = geom.rHeight * scale / 2;
  if (halfW >= box.w / 2) {
    const slack = halfW - box.w / 2;
    const centerX = box.x + box.w / 2;
    cx = clamp(cx, centerX - slack, centerX + slack);
  } else cx = box.x + box.w / 2;
  if (halfH >= box.h / 2) {
    const slack = halfH - box.h / 2;
    const centerY = box.y + box.h / 2;
    cy = clamp(cy, centerY - slack, centerY + slack);
  } else cy = box.y + box.h / 2;

  return {
    cx, cy, scale, angle: geom.angle,
    flipX: panelState.flipX, flipY: panelState.flipY, iw, ih,
    focus: { x: targetX, y: targetY },
  };
}

export function drawPanelImage(ctx, photo, transform) {
  ctx.save();
  ctx.translate(transform.cx, transform.cy);
  ctx.rotate(transform.angle);
  ctx.scale((transform.flipX ? -1 : 1) * transform.scale, (transform.flipY ? -1 : 1) * transform.scale);
  ctx.drawImage(photo.img, -transform.iw / 2, -transform.ih / 2);
  ctx.restore();
}

export function nudgePanelFocus(panelState, dx, dy, box, photo) {
  const zoom = panelState.zoom || 1;
  const angle = (panelState.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const worldX = dx * cos + dy * sin;
  const worldY = -dx * sin + dy * cos;
  const photoW = (photo?.width ?? box.w) * zoom;
  const photoH = (photo?.height ?? box.h) * zoom;
  panelState.fx = Math.max(0.06, Math.min(0.94, panelState.fx - worldX / Math.max(1, photoW)));
  panelState.fy = Math.max(0.06, Math.min(0.94, panelState.fy - worldY / Math.max(1, photoH)));
  panelState.autoFit = false;
}

export function zoomPanel(panelState, delta) {
  panelState.zoom = Math.max(1, Math.min(3.2, (panelState.zoom || 1) * (delta > 0 ? 1.10 : 0.91)));
  panelState.autoFit = false;
  panelState.fx = Math.max(0.06, Math.min(0.94, panelState.fx));
  panelState.fy = Math.max(0.06, Math.min(0.94, panelState.fy));
}
