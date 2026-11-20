// One render function powers both the live preview and the real PNG export. Geometry is always
// normalised first, so a caption or sun position that fits the preview also fits the export.
import { getLayout, panelBounds, polygonPath } from './layouts.js';
import { getGrade, applyPhotoFilter, applyGradeLayers, applyPanelReadability } from './grades.js';
import { drawScenery } from './scenery.js';
import { layoutLettering, drawLettering, letteringDiagnostics } from './lettering.js';
import { computeImageTransform, drawPanelImage } from './photos.js';

function pxRect(rect, w, h) {
  return rect ? { x: rect.x / w, y: rect.y / h, w: rect.w / w, h: rect.h / h } : null;
}

function drawPlaceholder(ctx, box, grade, seed) {
  const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  gradient.addColorStop(0, grade.deep);
  gradient.addColorStop(0.5, grade.shadow);
  gradient.addColorStop(1, '#11071f');
  ctx.fillStyle = gradient;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = grade.accent;
  ctx.lineWidth = Math.max(1, box.w * 0.006);
  for (let i = -box.h; i < box.w + box.h; i += box.w * 0.13) {
    ctx.beginPath();
    ctx.moveTo(box.x + i, box.y + box.h);
    ctx.lineTo(box.x + i + box.h, box.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(10, Math.min(box.w, box.h) * 0.13)}px "Archivo Black", sans-serif`;
  ctx.fillText('ADD PHOTO', box.x + box.w / 2, box.y + box.h / 2);
  ctx.restore();
  void seed;
}

function drawPanelRim(ctx, points, w, h, grade, options) {
  const scale = w / 1080;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#43e8ff';
  ctx.lineWidth = Math.max(1, 1.6 * scale);
  ctx.translate(-1.5 * scale, 0);
  polygonPath(ctx, points, w, h);
  ctx.stroke();
  ctx.translate(3 * scale, 0);
  ctx.strokeStyle = '#ff2fa8';
  polygonPath(ctx, points, w, h);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = grade.rim;
  ctx.shadowBlur = 10 * scale;
  ctx.strokeStyle = stateRim(grade, options);
  ctx.lineWidth = Math.max(1, 3 * scale);
  ctx.lineJoin = 'round';
  polygonPath(ctx, points, w, h);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(12,2,28,0.72)';
  ctx.lineWidth = Math.max(0.8, 1.2 * scale);
  polygonPath(ctx, points, w, h);
  ctx.stroke();
  ctx.restore();
}

function stateRim(grade, options) {
  return options.panelBorder === false ? hexToRgba(grade.rim, 0.45) : grade.rim;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawSelectionHandles(ctx, points, w, h, accent) {
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.5, w * 0.0024);
  polygonPath(ctx, points, w, h);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of points) {
    const sx = x * w;
    const sy = y * h;
    const size = Math.max(4, w * 0.007);
    ctx.fillStyle = '#fff5b0';
    ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    ctx.strokeStyle = '#1a0526';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - size / 2, sy - size / 2, size, size);
  }
  ctx.restore();
}

function drawPanel(ctx, w, h, state, grade, layoutPanel, index, captionRect) {
  const points = layoutPanel.points;
  const boxPx = panelBounds(points);
  const box = {
    x: boxPx.x * w, y: boxPx.y * h,
    w: boxPx.w * w, h: boxPx.h * h,
    width: boxPx.w * w, height: boxPx.h * h,
  };
  const panelState = state.panels[index];
  const photo = panelState ? state.photos[panelState.photo] : null;

  ctx.save();
  ctx.shadowColor = 'rgba(8,0,24,0.68)';
  ctx.shadowBlur = Math.max(8, w * 0.014);
  ctx.shadowOffsetY = Math.max(3, w * 0.005);
  ctx.fillStyle = '#160728';
  polygonPath(ctx, points, w, h);
  ctx.fill();
  ctx.restore();

  let focus = null;
  ctx.save();
  polygonPath(ctx, points, w, h);
  ctx.clip();
  if (photo && panelState) {
    const transform = computeImageTransform(panelState, photo, box, captionRect);
    focus = transform.focus;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    applyPhotoFilter(ctx, grade, () => drawPanelImage(ctx, photo, transform));
  } else {
    drawPlaceholder(ctx, box, grade, panelState?.cropSeed ?? 0);
  }
  applyGradeLayers(ctx, box, grade, w, (panelState?.cropSeed ?? 0) + index * 17);
  applyPanelReadability(ctx, box, grade, captionRect);
  ctx.restore();

  drawPanelRim(ctx, points, w, h, grade, { preview: true, panelBorder: state.panelBorder });
  if (state.selectedPanel === index && state.showSelection) {
    drawSelectionHandles(ctx, points, w, h, grade.accent);
  }
  return { ...box, focus };
}

export function render(ctx, w, h, state, options = {}) {
  const layout = getLayout(state.size, state.template);
  const grade = getGrade(state.grade);
  const panelBottom = Math.max(...layout.panels.flatMap((points) => points.map((point) => point[1])));
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const lettering = layoutLettering(ctx, w, h, state);
  const captionRectPx = lettering.block;
  const captionRect = pxRect(captionRectPx, w, h);
  const sun = drawScenery(ctx, w, h, state, layout, captionRect);

  const panelBoxes = layout.panels.map((points, index) =>
    drawPanel(ctx, w, h, { ...state, showSelection: Boolean(options.showHandles) }, grade, { points }, index, captionRectPx));

  drawLettering(ctx, w, h, state, lettering);

  ctx.restore();
  return {
    sun,
    lettering,
    captionRect,
    panelBoxes,
    diagnostics: {
      lettering: letteringDiagnostics(lettering, w, h),
      bottomMargin: (h - lettering.block.y - lettering.block.h) / h,
      captionWidthFraction: lettering.captionRect ? lettering.captionRect.w / w : 0,
      captionHeightFraction: lettering.captionRect ? lettering.captionRect.h / h : 0,
      captionMidFraction: lettering.captionRect ? (lettering.captionRect.y + lettering.captionRect.h / 2) / h : 0,
      taglineTopFraction: lettering.taglineRect ? lettering.taglineRect.y / h : 1,
      panelBottomFraction: panelBottom,
      captionArrangement: lettering.arrangement,
      panelCount: layout.panels.length,
      focusY: panelBoxes.filter((b) => b.focus).map((b) => b.focus.y),
      sunRadius: Math.min(sun.r, 0.18),
      sunVisible: sun.visible,
    },
  };
}
