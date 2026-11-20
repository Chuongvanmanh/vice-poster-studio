// Bootstrap: fonts, URL-shot contract, live preview and the real export path.
import { applyQueryParams, createState, ensurePanelCount, SIZE_DIMENSIONS } from './state.js';
import { getLayout } from './layouts.js';
import { GRADES } from './grades.js';
import { FONTS } from './state.js';
import { loadSamplePhotos, loadUserFiles, assignPhotosToPanels, SAMPLE_NAMES } from './photos.js';
import { render } from './render.js';
import { setupUI } from './ui.js';
import { attachPanelEditor } from './panels-editor.js';

const state = createState();
const query = applyQueryParams(state, window.location.search);
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d', { alpha: false });
let ui = null;
let frame = 0;
let lastRender = null;

function schedulePreview() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paintPreview();
  });
}

function resizePreview() {
  const dims = SIZE_DIMENSIONS[state.size];
  const wrap = document.getElementById('canvas-wrap');
  const maxSide = 1000;
  const backingScale = Math.min(1, maxSide / Math.max(dims.w, dims.h));
  const w = Math.round(dims.w * backingScale);
  const h = Math.round(dims.h * backingScale);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const availableW = Math.max(120, wrap.clientWidth - 48);
  const availableH = Math.max(120, wrap.clientHeight - 48);
  const cssScale = Math.min(availableW / dims.w, availableH / dims.h);
  canvas.style.width = `${Math.floor(dims.w * cssScale)}px`;
  canvas.style.height = `${Math.floor(dims.h * cssScale)}px`;
}

function paintPreview() {
  resizePreview();
  lastRender = render(ctx, canvas.width, canvas.height, state, { showHandles: true, preview: true });
}

function refreshAll() {
  if (ui) ui.refresh();
  schedulePreview();
}

async function installPhotos(photos, { replaceSelected = false } = {}) {
  if (!photos.length) return;
  if (replaceSelected) {
    const target = state.selectedPanel;
    if (state.panels[target]) {
      state.photos.push(photos[0]);
      state.panels[target].photo = state.photos.length - 1;
      state.panels[target].autoFit = true;
    }
  } else {
    state.photos = photos;
    assignPhotosToPanels(state, getLayout(state.size, state.template));
  }
  refreshAll();
}

async function loadFiles(files) {
  const replaceSelected = document.getElementById('photo-input').dataset.replace === '1';
  if (replaceSelected) delete document.getElementById('photo-input').dataset.replace;
  try {
    const photos = await loadUserFiles(files);
    await installPhotos(photos, { replaceSelected });
    ui?.setStatus(`Loaded ${photos.length} photo${photos.length === 1 ? '' : 's'} from your device.`);
  } catch (error) {
    ui?.setStatus(String(error.message ?? error));
    console.error(error);
  }
}

async function loadSamples() {
  const names = SAMPLE_NAMES.slice(0, 6);
  try {
    const photos = await loadSamplePhotos(names);
    await installPhotos(photos);
    ui?.setStatus(`Loaded ${photos.length} sample photos.`);
  } catch (error) {
    ui?.setStatus(String(error.message ?? error));
    console.error(error);
  }
}

function exportPNG() {
  const dims = SIZE_DIMENSIONS[state.size];
  const output = document.createElement('canvas');
  output.width = dims.w;
  output.height = dims.h;
  const outCtx = output.getContext('2d', { alpha: false });
  const started = performance.now();
  render(outCtx, dims.w, dims.h, state, { showHandles: false, preview: false });
  const filename = `vice-poster-${dims.w}x${dims.h}.png`;
  output.toBlob((blob) => {
    if (!blob) {
      ui?.setStatus('Export failed — try again.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    const elapsed = Math.round(performance.now() - started);
    ui?.setStatus(`Saved ${filename} in ${elapsed} ms.`);
    window.__lastExport = { filename, width: dims.w, height: dims.h, bytes: blob.size, elapsed };
  }, 'image/png');
}

async function loadFonts() {
  const specs = ['16px "Anton Condensed"', '16px "Bebas Display"', '16px "Archivo Black"',
    '16px "Bowlby One"', '16px "Monoton"', '16px "Black Ops"', '16px "Pacifico Script"'];
  await Promise.all(specs.map((spec) => document.fonts.load(spec, 'VICE CITY')));
  await document.fonts.ready;
}

async function start() {
  ui = setupUI({
    state,
    onChange: schedulePreview,
    onFiles: loadFiles,
    onSamples: loadSamples,
    onExport: exportPNG,
  });
  attachPanelEditor(canvas, {
    getState: () => state,
    onChange: schedulePreview,
    onSelect: () => ui?.refreshTray(),
  });
  const previewObserver = new ResizeObserver(() => resizePreview());
  previewObserver.observe(document.getElementById('canvas-wrap'));
  window.addEventListener('resize', resizePreview);

  await loadFonts();
  ui.refresh();
  paintPreview();

  let initialPhotos = [];
  if (query.photoNames.length) initialPhotos = await loadSamplePhotos(query.photoNames);
  else initialPhotos = await loadSamplePhotos(['convertible', 'gasstation', 'club-dancer', 'suit', 'boulevard']);
  if (initialPhotos.length) {
    state.photos = initialPhotos;
    assignPhotosToPanels(state, getLayout(state.size, state.template));
  }
  if (query.photoNames.length && !GRADE_IDS.has(state.grade)) state.grade = GRADES[0].id;
  ui.refresh();
  paintPreview();

  if (lastRender?.diagnostics) {
    window.__vpsDiagnostics = lastRender.diagnostics;
  }
  requestAnimationFrame(() => {
    window.__shotReady = true;
  });
}

const GRADE_IDS = new Set(GRADES.map((g) => g.id));
void FONTS;
void SAMPLE_NAMES;
void ensurePanelCount;

start().catch((error) => {
  console.error(error?.stack ?? error);
  ui?.setStatus(`Startup error: ${error.message ?? error}`);
  requestAnimationFrame(() => { window.__shotReady = true; });
});
