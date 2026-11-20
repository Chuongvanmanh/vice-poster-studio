// Pointer interaction for the preview: panel picking, drag-to-pan, wheel zoom and thumbnail drops.
import { getLayout, panelBounds } from './layouts.js';
import { SIZE_DIMENSIONS } from './state.js';
import { nudgePanelFocus, zoomPanel } from './photos.js';

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function panelAt(state, layout, nx, ny) {
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    if (pointInPolygon(nx, ny, layout.panels[i])) return i;
  }
  return -1;
}

export function attachPanelEditor(canvas, { getState, onChange, onSelect }) {
  let dragging = false;
  let last = null;
  let activePanel = -1;

  const locate = (event, state) => {
    const point = canvasPoint(canvas, event);
    const layout = getLayout(state.size, state.template);
    const nx = point.x / canvas.width;
    const ny = point.y / canvas.height;
    return { point, index: panelAt(state, layout, nx, ny), layout };
  };

  canvas.addEventListener('pointerdown', (event) => {
    const state = getState();
    const { point, index } = locate(event, state);
    if (index < 0) return;
    state.selectedPanel = index;
    activePanel = index;
    dragging = true;
    last = point;
    try { canvas.setPointerCapture(event.pointerId); } catch { }
    onSelect(index);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || last === null) return;
    const state = getState();
    const layout = getLayout(state.size, state.template);
    const panelState = state.panels[activePanel];
    const photo = state.photos[panelState?.photo ?? -1];
    if (!panelState || activePanel >= layout.panels.length) return;
    const box = panelBounds(layout.panels[activePanel]);
    const dims = SIZE_DIMENSIONS[state.size];
    const factorX = dims.w / canvas.width;
    const factorY = dims.h / canvas.height;
    const current = canvasPoint(canvas, event);
    const dx = (last.x - current.x) * factorX;
    const dy = (last.y - current.y) * factorY;
    nudgePanelFocus(panelState, dx, dy, { x: box.x * dims.w, y: box.y * dims.h, w: box.w * dims.w, h: box.h * dims.h }, photo);
    last = current;
    onChange();
  });

  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    last = null;
    activePanel = -1;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; last = null; activePanel = -1; });

  canvas.addEventListener('wheel', (event) => {
    const state = getState();
    const { index } = locate(event, state);
    const panelIndex = index >= 0 ? index : state.selectedPanel;
    const panelState = state.panels[panelIndex];
    if (!panelState) return;
    event.preventDefault();
    state.selectedPanel = panelIndex;
    zoomPanel(panelState, event.deltaY);
    onSelect(panelIndex);
    onChange();
  }, { passive: false });

  canvas.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types.includes('text/vps-photo')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  });

  canvas.addEventListener('drop', (event) => {
    const raw = event.dataTransfer?.getData('text/vps-photo');
    if (raw == null || raw === '') return;
    event.preventDefault();
    const state = getState();
    const { index } = locate(event, state);
    const target = index >= 0 ? index : state.selectedPanel;
    if (!state.panels[target]) return;
    state.panels[target].photo = Number(raw);
    state.panels[target].autoFit = true;
    state.selectedPanel = target;
    onSelect(target);
    onChange();
  });
}

function pointFromClient(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}
