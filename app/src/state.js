// Application state and deterministic helpers. Nothing here touches the DOM or the canvas.
import { SIZE_DIMENSIONS, equivalentTemplate, layoutsFor } from './layouts.js';

export { SIZE_DIMENSIONS } from './layouts.js';

export const FONTS = [
  { id: 'anton', name: 'Anton', css: '"Anton Condensed"', sample: 'BOLD CITY' },
  { id: 'bebas', name: 'Bebas Neue', css: '"Bebas Display"', sample: 'BOLD CITY' },
  { id: 'archivo', name: 'Archivo Black', css: '"Archivo Black"', sample: 'BOLD CITY' },
  { id: 'bowlby', name: 'Bowlby One', css: '"Bowlby One"', sample: 'BOLD CITY' },
  { id: 'monoton', name: 'Monoton', css: '"Monoton"', sample: 'BOLD CITY' },
  { id: 'blackops', name: 'Black Ops One', css: '"Black Ops"', sample: 'BOLD CITY' },
  { id: 'pacifico', name: 'Pacifico', css: '"Pacifico Script"', sample: 'Bold City' },
];

export const CAPTION_TITLES = ['NEON NIGHTS', 'VICE CITY', 'SUNSET HEIST', 'LAST RIDE', 'NIGHT DRIVE', 'MIAMI HEAT'];

export const POSITIONS = [
  { id: 'bottom', name: 'Bottom' },
  { id: 'centre', name: 'Centre' },
  { id: 'top', name: 'Top' },
  { id: 'left', name: 'Left stack' },
  { id: 'right', name: 'Right stack' },
];

export const DEFAULT_STATE = {
  size: '1920x1080',
  template: 'triptych',
  grade: 'vice-sunset',
  caption: 'NEON NIGHTS',
  tagline: 'The city is yours',
  kicker: 'COMING SOON',
  badge: 'EST. 1986',
  font: 'archivo',
  fontSize: 100,
  tracking: 2,
  position: 'bottom',
  panelBorder: true,
  showGrid: true,
  seed: 1986,
  selectedPanel: 0,
  onePhotoEverywhere: false,
  photos: [],
  panels: [],
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makePanelState(index) {
  return {
    photo: -1,
    fx: 0.5,
    fy: 0.3,
    zoom: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
    cropSeed: (index * 2654435761) >>> 0,
  };
}

export function createState() {
  const state = structuredClone(DEFAULT_STATE);
  state.panels = [];
  ensurePanelCount(state, layoutsFor(state.size)['triptych'].panels.length);
  return state;
}

export function ensurePanelCount(state, count) {
  while (state.panels.length < count) state.panels.push(makePanelState(state.panels.length));
  if (state.panels.length > count) state.panels.length = count;
  if (state.selectedPanel >= count) state.selectedPanel = count - 1;
}

export function changeSize(state, sizeId, { keepTemplate = true } = {}) {
  if (!SIZE_DIMENSIONS[sizeId]) return;
  const previous = state.size;
  const template = keepTemplate ? equivalentTemplate(state.template, previous, sizeId) : Object.keys(layoutsFor(sizeId))[0];
  state.size = sizeId;
  state.template = template;
  ensurePanelCount(state, layoutsFor(sizeId)[template].panels.length);
}

export function randomiseStyle(state, rng = Math.random) {
  const gradeIds = ['vice-sunset', 'neon-miami', 'dusk-teal-orange', 'chrome-night', 'pink-haze'];
  const fontIds = FONTS.map((f) => f.id);
  const positionIds = POSITIONS.map((p) => p.id);
  const layoutIds = Object.keys(layoutsFor(state.size));
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  state.grade = pick(gradeIds);
  state.caption = pick(CAPTION_TITLES);
  state.font = pick(fontIds.filter((id) => id !== 'pacifico'));
  state.position = pick(positionIds);
  state.template = pick(layoutIds);
  state.tracking = Math.floor(rng() * 6) - 1;
  state.fontSize = Math.round(88 + rng() * 20);
  state.panelBorder = rng() > 0.3;
  state.seed = Math.floor(rng() * 0x7fffffff);
  ensurePanelCount(state, layoutsFor(state.size)[state.template].panels.length);
}

function decodeQueryText(value) {
  if (value == null) return null;
  return value.replace(/\\n/g, '\n').replace(/\+/g, ' ');
}

export function applyQueryParams(state, search) {
  const params = new URLSearchParams(search);
  const size = params.get('size');
  if (size && SIZE_DIMENSIONS[size]) changeSize(state, size, { keepTemplate: false });
  const template = params.get('template');
  if (template && layoutsFor(state.size)[template]) state.template = template;
  const grade = params.get('grade');
  if (grade) state.grade = grade;
  const caption = decodeQueryText(params.get('caption'));
  if (caption != null) state.caption = caption;
  const tagline = decodeQueryText(params.get('tagline'));
  if (tagline != null) state.tagline = tagline;
  const kicker = decodeQueryText(params.get('kicker'));
  if (kicker != null) state.kicker = kicker;
  const badge = decodeQueryText(params.get('badge'));
  if (badge != null) state.badge = badge;
  const font = params.get('font');
  if (font && FONTS.some((f) => f.id === font)) state.font = font;
  const position = params.get('position');
  if (position && POSITIONS.some((p) => p.id === position)) state.position = position;
  const tracking = params.get('tracking');
  if (tracking != null && Number.isFinite(Number(tracking))) state.tracking = Number(tracking);
  const fontSize = params.get('font-size');
  if (fontSize != null && Number.isFinite(Number(fontSize))) state.fontSize = Number(fontSize);
  const selected = params.get('select');
  if (selected != null && Number.isInteger(Number(selected))) {
    state.selectedPanel = Math.max(0, Math.min(state.panels.length - 1, Number(selected)));
  }
  const photoList = params.get('photos');
  const photos = photoList ? photoList.split(',').map((s) => s.trim()).filter(Boolean) : [];
  ensurePanelCount(state, layoutsFor(state.size)[state.template].panels.length);
  return {
    shot: params.get('shot') === '1' || params.get('shot') === 'cover' || params.get('shot') === 'editor',
    photoNames: photos,
  };
}
