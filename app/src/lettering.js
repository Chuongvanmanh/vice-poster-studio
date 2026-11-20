// Poster lettering. One measured text block (kicker + caption + script tagline) is laid out first,
// then painted with extrusion, outline, neon rim, gradient fill, highlight, glow and shadow.
import { getGrade } from './grades.js';
import { mulberry32 } from './state.js';

const FAMILIES = {
  anton: '"Anton Condensed", "Arial Black", sans-serif',
  bebas: '"Bebas Display", "Arial Narrow", sans-serif',
  archivo: '"Archivo Black", "Arial Black", sans-serif',
  bowlby: '"Bowlby One", "Arial Black", sans-serif',
  monoton: '"Monoton", "Arial Black", sans-serif',
  blackops: '"Black Ops", "Arial Black", sans-serif',
  pacifico: '"Pacifico Script", cursive',
};

const FIXED = { kicker: 0.11, gap1: 0.025, tagline: 0.09, gap2: 0.015 };

export function fontFamily(id) {
  return FAMILIES[id] ?? FAMILIES.archivo;
}

function fontString(id, size) {
  return `${size}px ${fontFamily(id)}`;
}

function widthsFor(ctx, text, tracking) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  return { chars, widths, width: widths.reduce((a, b) => a + b, 0) + Math.max(0, chars.length - 1) * tracking };
}

function measure(ctx, text, id, size, tracking) {
  ctx.font = fontString(id, size);
  return widthsFor(ctx, text, tracking).width;
}

function splitCaptionWords(caption) {
  return caption.trim().split(/\s+/).filter(Boolean);
}

function groupWidth(ctx, words, id) {
  return measure(ctx, words.join(' '), id, 100, 0);
}

function balancedGroups(ctx, words, count, id) {
  if (count <= 1 || !words.length) return [words.join(' ')];
  if (words.length >= count) {
    const table = Array.from({ length: words.length + 1 }, () => Array(count + 1).fill(null));
    table[0][0] = { worst: 0, groups: [] };
    for (let end = 1; end <= words.length; end++) {
      for (let lines = 1; lines <= Math.min(count, end); lines++) {
        let best = null;
        for (let start = lines - 1; start < end; start++) {
          const previous = table[start][lines - 1];
          if (!previous) continue;
          const phrase = words.slice(start, end).join(' ');
          const worst = Math.max(previous.worst, groupWidth(ctx, [phrase], id));
          if (!best || worst < best.worst) best = { worst, groups: [...previous.groups, phrase] };
        }
        table[end][lines] = best;
      }
    }
    return table[words.length][count]?.groups ?? [words.join(' ')];
  }
  const groups = [...words];
  while (groups.length < count) {
    let index = 0;
    for (let i = 1; i < groups.length; i++) {
      if (groupWidth(ctx, [groups[i]], id) > groupWidth(ctx, [groups[index]], id)) index = i;
    }
    const word = groups[index];
    const cut = word.includes(' ')
      ? word.lastIndexOf(' ')
      : Math.max(1, Math.ceil(word.length / 2));
    const pieces = word.includes(' ')
      ? [word.slice(0, cut), word.slice(cut + 1)].filter(Boolean)
      : [word.slice(0, cut), word.slice(cut)].filter(Boolean);
    if (pieces.length < 2) break;
    groups.splice(index, 1, ...pieces);
  }
  return groups;
}

function metrics(ctx, id, size) {
  ctx.font = fontString(id, size);
  const m = ctx.measureText('HY');
  const ascent = m.actualBoundingBoxAscent || size * 0.74;
  const descent = m.actualBoundingBoxDescent || size * 0.20;
  return { ascent, descent, lineHeight: size * 0.92 };
}

function evaluateCandidate(ctx, size, state, lines, maxW, hasKicker, hasTagline) {
  if (!(size > 0)) return null;
  const met = metrics(ctx, state.font, size);
  const captionH = lines.length * met.lineHeight;
  const fixed = (hasKicker ? FIXED.kicker + FIXED.gap1 : 0) + (hasTagline ? FIXED.tagline + FIXED.gap2 : 0);
  const totalH = fixed * size + captionH;
  if (totalH > state.maxH) return null;

  const trackingLimit = size * 0.03;
  const tracking = Math.max(-trackingLimit, Math.min(trackingLimit, state.tracking * (state.width / 1080)));
  ctx.font = fontString(state.font, size);
  const naturalW = Math.max(...lines.map((line) => widthsFor(ctx, line, tracking).width), 0.01);
  const extrusion = size * 0.08;
  const stretch = Math.min(1.25, Math.max(1, (maxW - extrusion * 2) / Math.max(1, naturalW)));
  const captionW = naturalW * stretch + extrusion * 2;
  const kickerW = hasKicker
    ? measure(ctx, state.kicker.trim(), 'archivo', FIXED.kicker * size * 0.62, 0) + extrusion
    : 0;
  const taglineW = hasTagline
    ? measure(ctx, state.tagline.trim(), 'pacifico', FIXED.tagline * size, 0) + extrusion
    : 0;
  const blockW = Math.max(captionW, kickerW, taglineW);
  if (blockW > maxW) return null;
  return {
    size, lines, met, tracking, stretch, naturalW, captionW, blockW,
    captionH, totalH, fixed, extrusion,
    kickerH: hasKicker ? FIXED.kicker * size : 0,
    gap1: hasKicker ? FIXED.gap1 * size : 0,
    taglineH: hasTagline ? FIXED.tagline * size : 0,
    gap2: hasTagline ? FIXED.gap2 * size : 0,
  };
}

function fitCandidate(ctx, state, lines, maxW, maxH, w) {
  const hasKicker = Boolean(state.kicker.trim());
  const hasTagline = Boolean(state.tagline.trim());
  const scale = Math.max(0.75, Math.min(1.25, state.fontSize / 100));
  const scoped = { ...state, width: w, maxH, kicker: state.kicker, tagline: state.tagline };
  let lo = maxH * 0.04;
  let hi = maxH * 0.46 * scale;
  let best = null;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const candidate = evaluateCandidate(ctx, mid, scoped, lines, maxW, hasKicker, hasTagline);
    if (candidate) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (!best) best = evaluateCandidate(ctx, lo, scoped, lines, maxW, hasKicker, hasTagline);
  return best;
}

function anchorFor(position, w, h, totalW, totalH, captionMidOffset) {
  const marginX = w * 0.035;
  const panelBottom = w > h * 1.2 ? 0.90 : 0.88;
  const overlapY = h * (panelBottom - 0.12) - captionMidOffset;
  let x;
  let y;
  switch (position) {
    case 'top':
      x = (w - totalW) / 2;
      y = h * 0.055;
      break;
    case 'centre':
      x = (w - totalW) / 2;
      y = (h - totalH) / 2;
      break;
    case 'left':
      x = marginX;
      y = overlapY;
      break;
    case 'right':
      x = w - marginX - totalW;
      y = overlapY;
      break;
    default:
      x = (w - totalW) / 2;
      y = overlapY;
  }
  x = Math.max(w * 0.025, Math.min(x, w * 0.975 - totalW));
  y = Math.max(h * 0.04, Math.min(y, h * 0.96 - totalH));
  return { x, y };
}

export function layoutLettering(ctx, w, h, state) {
  const landscape = w > h * 1.2;
  const stacked = state.position === 'left' || state.position === 'right';
  const maxW = w * (landscape ? 0.64 : 0.84);
  const maxH = h * (landscape ? 0.34 : 0.28);
  const words = splitCaptionWords(state.caption);
  const candidates = [1, 2, 3]
    .map((count) => balancedGroups(ctx, words, count, state.font))
    .map((lines) => fitCandidate(ctx, state, lines, maxW, maxH, w))
    .filter(Boolean);
  candidates.sort((a, b) => b.size - a.size || a.lines.length - b.lines.length);
  const chosen = candidates[0];
  const captionMidOffset = chosen.kickerH + chosen.gap1 + chosen.captionH / 2;
  const anchor = anchorFor(state.position, w, h, chosen.blockW, chosen.totalH, captionMidOffset);
  const block = { x: anchor.x, y: anchor.y, w: chosen.blockW, h: chosen.totalH };
  const lineYs = [];
  let cursorY = block.y + chosen.kickerH + chosen.gap1;
  for (const line of chosen.lines) {
    lineYs.push(cursorY + chosen.met.ascent + (chosen.met.lineHeight - chosen.met.ascent - chosen.met.descent) / 2);
    cursorY += chosen.met.lineHeight;
  }
  const taglineY = chosen.taglineH ? block.y + block.h - chosen.taglineH / 2 : 0;
  const kickerRect = chosen.kickerH
    ? { x: block.x, y: block.y, w: block.w, h: chosen.kickerH }
    : null;
  const captionRect = chosen.lines.length
    ? { x: block.x + (block.w - chosen.captionW) / 2, y: block.y + chosen.kickerH + chosen.gap1, w: chosen.captionW, h: chosen.captionH }
    : null;
  const taglineRect = chosen.taglineH
    ? { x: block.x, y: block.y + block.h - chosen.taglineH, w: block.w, h: chosen.taglineH }
    : null;

  const badgeText = state.badge.trim();
  const badgeSize = w * 0.014;
  const badgeW = badgeText ? measure(ctx, badgeText, 'archivo', badgeSize, badgeSize * 0.12) + w * 0.032 : 0;
  const badgeH = Math.max(w * 0.032, badgeSize * 2.1);
  const badgeX = state.position === 'right' ? w * 0.035 : w - w * 0.035 - badgeW;
  const badgeY = h * 0.032;
  const badgeRect = badgeText
    ? { x: Math.max(0, badgeX), y: Math.max(0, badgeY), w: Math.min(badgeW, w), h: Math.min(badgeH, h) }
    : null;

  return { ...chosen, block, lineYs, kickerRect, captionRect, taglineRect, badgeRect, taglineY, align: stacked ? 'left' : 'center', arrangement: chosen.lines.length };
}

function drawChars(ctx, text, x, baseline, tracking, mode) {
  const info = widthsFor(ctx, text, tracking);
  let cursor = x;
  for (let i = 0; i < info.chars.length; i++) {
    if (mode === 'fill') ctx.fillText(info.chars[i], cursor, baseline);
    else ctx.strokeText(info.chars[i], cursor, baseline);
    cursor += info.widths[i] + tracking;
  }
  return info.width;
}

function drawExtrudedLine(ctx, text, centerX, baseline, size, id, tracking, grade, w, stretch = 1) {
  ctx.save();
  ctx.font = fontString(id, size);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (stretch !== 1) {
    ctx.translate(centerX, 0);
    ctx.scale(stretch, 1);
    ctx.translate(-centerX, 0);
  }

  const measureX = centerX - widthsFor(ctx, text, tracking).width / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(8,0,24,0.92)';
  ctx.shadowBlur = size * 0.20;
  ctx.shadowOffsetY = size * 0.10;
  ctx.fillStyle = 'rgba(12,0,26,0.55)';
  drawChars(ctx, text, measureX, baseline, tracking, 'fill');
  ctx.restore();

  const steps = 4;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    ctx.fillStyle = i === 1 ? '#4d0d59' : `rgba(${Math.round(58 + t * 20)},${Math.round(9 + t * 8)},${Math.round(80 + t * 20)},1)`;
    drawChars(ctx, text, measureX + i * size * 0.0125 / stretch, baseline + i * size * 0.010, tracking, 'fill');
  }

  ctx.save();
  ctx.shadowColor = grade.rim;
  ctx.shadowBlur = size * 0.22;
  ctx.strokeStyle = grade.accent;
  ctx.globalAlpha = 0.80;
  ctx.lineWidth = size * 0.060 / stretch;
  drawChars(ctx, text, measureX, baseline, tracking, 'stroke');
  ctx.restore();

  ctx.strokeStyle = '#16031f';
  ctx.lineWidth = size * 0.070 / stretch;
  drawChars(ctx, text, measureX, baseline, tracking, 'stroke');

  const totalWidth = widthsFor(ctx, text, tracking).width;
  const gradient = ctx.createLinearGradient(0, baseline - size * 0.78, 0, baseline + size * 0.20);
  gradient.addColorStop(0, '#ff51b8');
  gradient.addColorStop(0.42, '#ff8a35');
  gradient.addColorStop(0.78, '#ffd04a');
  gradient.addColorStop(1, '#fff0a0');
  ctx.fillStyle = gradient;
  drawChars(ctx, text, measureX, baseline, tracking, 'fill');

  ctx.save();
  ctx.beginPath();
  ctx.rect(measureX - size * 0.2, baseline - size * 0.86, totalWidth + size * 0.4, size * 0.42);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,248,235,0.70)';
  ctx.lineWidth = Math.max(1, size * 0.012) / stretch;
  drawChars(ctx, text, measureX, baseline - size * 0.012, tracking, 'stroke');
  ctx.restore();
  ctx.restore();
}

function drawKicker(ctx, w, h, state, layout, grade, block) {
  if (!layout.kickerRect) return;
  const { x, y, w: kw, h: kh } = layout.kickerRect;
  const skew = kh * 0.26;
  const gradient = ctx.createLinearGradient(x, y, x + kw, y + kh);
  gradient.addColorStop(0, grade.accent);
  gradient.addColorStop(0.55, grade.rim);
  gradient.addColorStop(1, '#ff4fa8');
  ctx.save();
  ctx.shadowColor = grade.rim;
  ctx.shadowBlur = kh * 0.9;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + kw, y);
  ctx.lineTo(x + kw - skew, y + kh);
  ctx.lineTo(x, y + kh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  const kickerText = state.kicker.trim();
  let kickerFont = kh * 0.62;
  ctx.font = `${kickerFont}px "Archivo Black", "Arial Black", sans-serif`;
  const natural = Math.max(1, ctx.measureText(kickerText).width);
  kickerFont = Math.min(kickerFont, kickerFont * (kw * 0.84) / natural);
  ctx.font = `${kickerFont}px "Archivo Black", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#21051f';
  ctx.fillText(kickerText, x + kw / 2, y + kh * 0.54);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = grade.accent;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = Math.max(1, h * 0.0018);
  ctx.beginPath();
  ctx.moveTo(x + skew * 0.5, y + kh * 0.5);
  ctx.lineTo(x - w * 0.03, y + kh * 0.5);
  ctx.moveTo(x + kw - skew * 0.5, y + kh * 0.5);
  ctx.lineTo(x + kw + w * 0.03, y + kh * 0.5);
  ctx.stroke();
  ctx.restore();
  void block;
}

function drawTagline(ctx, w, h, state, layout, grade) {
  if (!layout.taglineRect) return;
  const { x, w: tw } = layout.taglineRect;
  let size = layout.size * 0.40;
  ctx.save();
  ctx.font = fontString('pacifico', size);
  const natural = Math.max(1, ctx.measureText(state.tagline.trim()).width);
  size = Math.min(size, size * (tw * 0.96) / natural);
  ctx.font = fontString('pacifico', size);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.translate(x + tw / 2, layout.taglineY);
  ctx.rotate(-0.035);
  ctx.shadowColor = grade.rim;
  ctx.shadowBlur = size * 0.55;
  ctx.fillStyle = 'rgba(255,210,240,0.9)';
  ctx.fillText(state.tagline.trim(), 0, 0);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, size * 0.018);
  ctx.beginPath();
  const tw2 = ctx.measureText(state.tagline.trim()).width;
  ctx.moveTo(-tw2 / 2, size * 0.32);
  ctx.quadraticCurveTo(0, size * 0.46, tw2 / 2, size * 0.30);
  ctx.stroke();
  ctx.restore();
  void h;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function drawBadge(ctx, w, h, state, layout, grade) {
  if (!layout.badgeRect) return;
  const { x, y, w: bw, h: bh } = layout.badgeRect;
  ctx.save();
  roundRectPath(ctx, x, y, bw, bh, bh * 0.22);
  ctx.fillStyle = 'rgba(14,4,32,0.78)';
  ctx.fill();
  ctx.strokeStyle = grade.accent;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, w * 0.0014);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe7b0';
  ctx.font = `${bh * 0.42}px "Archivo Black", "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.badge.trim(), x + bw / 2, y + bh * 0.54);
  ctx.restore();
  void h;
}

export function drawLettering(ctx, w, h, state, layout) {
  const grade = getGrade(state.grade);
  drawKicker(ctx, w, h, state, layout, grade);
  layout.lineYs.forEach((baseline, i) => {
    drawExtrudedLine(ctx, layout.lines[i], layout.block.x + layout.block.w / 2, baseline, layout.size, state.font, layout.tracking, grade, w, layout.stretch);
  });
  drawTagline(ctx, w, h, state, layout, grade);
  drawBadge(ctx, w, h, state, layout, grade);
}

export function letteringDiagnostics(layout, w, h) {
  const inside = (r) => Boolean(r && r.x >= -0.001 * w && r.y >= -0.001 * h &&
    r.x + r.w <= w * 1.001 && r.y + r.h <= h * 1.001);
  const rng = mulberry32(Math.round(layout.size));
  return {
    blockInside: inside(layout.block),
    captionInside: inside(layout.captionRect),
    kickerInside: inside(layout.kickerRect),
    taglineInside: inside(layout.taglineRect),
    badgeInside: inside(layout.badgeRect),
    bottomMarginFraction: layout.block ? (h - (layout.block.y + layout.block.h)) / h : 1,
    relativeWidth: layout.block ? layout.block.w / w : 0,
    relativeHeight: layout.block ? layout.block.h / h : 0,
    captionWidthFraction: layout.captionRect ? layout.captionRect.w / w : 0,
    captionHeightFraction: layout.captionRect ? layout.captionRect.h / h : 0,
    captionLines: layout.lines.length,
    captionArrangement: layout.arrangement,
    captionSizeFraction: layout.size / h,
    relativeStretch: layout.stretch ?? 1,
    trackingRatio: layout.size ? Math.abs(layout.tracking) / layout.size : 0,
    size: layout.size,
    lines: layout.lines.length,
    jitter: rng(),
  };
}
