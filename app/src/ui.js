// Editor bindings: controls, tray, swatches, visual layout picker, keyboard shortcuts and export wiring.
import { FONTS, POSITIONS, SIZE_DIMENSIONS, changeSize, ensurePanelCount, mulberry32, randomiseStyle } from './state.js';
import { GRADES } from './grades.js';
import { getLayout, layoutIdsFor, polygonPath } from './layouts.js';
import { assignPhotosToPanels } from './photos.js';

const $ = (id) => document.getElementById(id);

function populate(select, items) {
  select.innerHTML = '';
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }
}

function drawThumbnail(canvas, layout) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#2a1054');
  bg.addColorStop(0.6, '#a52a86');
  bg.addColorStop(1, '#ff9b45');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  layout.panels.forEach((points, i) => {
    polygonPath(ctx, points, w, h);
    const fill = ctx.createLinearGradient(0, 0, w, h);
    fill.addColorStop(0, i % 2 ? '#4be8ff' : '#ff4fa8');
    fill.addColorStop(1, '#ffd45e');
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(15,4,32,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

export function setupUI({ state, onChange, onFiles, onSamples, onExport }) {
  const els = {
    photoInput: $('photo-input'), sampleBtn: $('sample-btn'), shuffleBtn: $('shuffle-btn'),
    onePhoto: $('one-photo'), tray: $('photo-tray'), photoCount: $('photo-count'), dropZone: $('drop-zone'),
    caption: $('caption-input'), tagline: $('tagline-input'), kicker: $('kicker-input'), badge: $('badge-input'),
    font: $('font-select'), grade: $('grade-select'), position: $('position-select'), layout: $('layout-select'),
    swatches: $('grade-swatches'), thumbs: $('layout-thumbs'),
    fontSize: $('font-size'), tracking: $('tracking'), panelZoom: $('panel-zoom'),
    fontSizeValue: $('font-size-value'), trackingValue: $('tracking-value'), panelZoomValue: $('panel-zoom-value'),
    rotate: $('panel-rotate'), flipX: $('panel-flip-x'), flipY: $('panel-flip-y'), replace: $('replace-photo-btn'),
    randomise: $('randomise-btn'), border: $('panel-border'), exportBtn: $('export-btn'), status: $('status'),
    exportSize: $('export-size'), previewSize: $('preview-size'), previewTemplate: $('preview-template'),
  };

  populate(els.font, FONTS);
  populate(els.grade, GRADES);
  populate(els.position, POSITIONS);

  GRADES.forEach((grade) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'grade-chip';
    chip.dataset.grade = grade.id;
    chip.title = grade.name;
    const dots = document.createElement('span');
    dots.className = 'dots';
    grade.swatch.forEach((color) => {
      const dot = document.createElement('i');
      dot.style.background = color;
      dots.appendChild(dot);
    });
    chip.appendChild(dots);
    chip.appendChild(document.createTextNode(grade.name));
    chip.addEventListener('click', () => {
      state.grade = grade.id;
      refresh();
      onChange();
    });
    els.swatches.appendChild(chip);
  });

  function refreshThumbs() {
    const dims = SIZE_DIMENSIONS[state.size];
    const thumbW = 72;
    const thumbH = Math.round(thumbW * dims.h / dims.w);
    els.thumbs.innerHTML = '';
    for (const id of layoutIdsFor(state.size)) {
      const layout = getLayout(state.size, id);
      const wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.className = `layout-thumb${state.template === id ? ' active' : ''}`;
      wrapper.title = layout.name;
      const canvas = document.createElement('canvas');
      canvas.width = thumbW;
      canvas.height = thumbH;
      drawThumbnail(canvas, layout);
      wrapper.appendChild(canvas);
      wrapper.appendChild(document.createTextNode(layout.name.split(' ')[0]));
      wrapper.addEventListener('click', () => {
        state.template = id;
        ensurePanelCount(state, layout.panels.length);
        assignPhotosToPanels(state, layout);
        refresh();
        onChange();
      });
      els.thumbs.appendChild(wrapper);
    }
  }

  function refreshTray() {
    els.tray.innerHTML = '';
    els.photoCount.textContent = `${state.photos.length} photo${state.photos.length === 1 ? '' : 's'}`;
    if (!state.photos.length) {
      const empty = document.createElement('div');
      empty.className = 'tray-empty';
      empty.textContent = 'No photos yet';
      els.tray.appendChild(empty);
      return;
    }
    state.photos.forEach((photo, index) => {
      const item = document.createElement('div');
      item.className = 'tray-item';
      item.draggable = true;
      item.title = `${photo.name} · ${photo.width}×${photo.height}`;
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = photo.name;
      item.appendChild(img);
      if (state.panels.some((p) => p.photo === index)) item.classList.add('active');
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/vps-photo', String(index));
        event.dataTransfer.effectAllowed = 'copy';
      });
      item.addEventListener('click', () => {
        const panelIndex = state.panels.findIndex((p) => p.photo === index);
        if (panelIndex >= 0) {
          state.selectedPanel = panelIndex;
          onChange();
        }
      });
      els.tray.appendChild(item);
    });
  }

  function refresh() {
    const dims = SIZE_DIMENSIONS[state.size];
    els.caption.value = state.caption;
    els.tagline.value = state.tagline;
    els.kicker.value = state.kicker;
    els.badge.value = state.badge;
    els.font.value = state.font;
    els.grade.value = state.grade;
    els.position.value = state.position;
    els.layout.value = state.template;
    els.fontSize.value = String(state.fontSize);
    els.tracking.value = String(state.tracking);
    els.onePhoto.checked = state.onePhotoEverywhere;
    els.border.checked = state.panelBorder;
    els.fontSizeValue.textContent = String(state.fontSize);
    els.trackingValue.textContent = String(state.tracking);
    const panel = state.panels[state.selectedPanel];
    els.panelZoom.value = String(panel?.zoom ?? 1);
    els.panelZoomValue.textContent = `${(panel?.zoom ?? 1).toFixed(2)}×`;
    els.exportSize.textContent = `${dims.w} × ${dims.h}`;
    els.previewSize.textContent = `${dims.w} × ${dims.h}`;
    els.previewTemplate.textContent = `${getLayout(state.size, state.template).name} · ${GRADES.find((g) => g.id === state.grade)?.name ?? state.grade}`;
    els.swatches.querySelectorAll('.grade-chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.grade === state.grade));
    document.querySelectorAll('.size-toggles button').forEach((button) => button.classList.toggle('active', button.dataset.size === state.size));
    refreshThumbs();
    refreshTray();
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  const textBindings = [
    [els.caption, 'caption'], [els.tagline, 'tagline'], [els.kicker, 'kicker'], [els.badge, 'badge'],
  ];
  textBindings.forEach(([element, key]) => element.addEventListener('input', () => {
    state[key] = element.value;
    onChange();
  }));

  const selectBindings = [
    [els.font, 'font'], [els.grade, 'grade'], [els.position, 'position'],
  ];
  selectBindings.forEach(([element, key]) => element.addEventListener('change', () => {
    state[key] = element.value;
    refresh();
    onChange();
  }));

  els.layout.addEventListener('change', () => {
    state.template = els.layout.value;
    const layout = getLayout(state.size, state.template);
    ensurePanelCount(state, layout.panels.length);
    assignPhotosToPanels(state, layout);
    refresh();
    onChange();
  });

  els.fontSize.addEventListener('input', () => {
    state.fontSize = Number(els.fontSize.value);
    els.fontSizeValue.textContent = els.fontSize.value;
    onChange();
  });
  els.tracking.addEventListener('input', () => {
    state.tracking = Number(els.tracking.value);
    els.trackingValue.textContent = els.tracking.value;
    onChange();
  });
  els.panelZoom.addEventListener('input', () => {
    const panel = state.panels[state.selectedPanel];
    if (!panel) return;
    panel.zoom = Number(els.panelZoom.value);
    panel.autoFit = false;
    els.panelZoomValue.textContent = `${panel.zoom.toFixed(2)}×`;
    onChange();
  });

  els.photoInput.addEventListener('change', () => {
    if (els.photoInput.files?.length) onFiles(els.photoInput.files);
    els.photoInput.value = '';
  });
  els.sampleBtn.addEventListener('click', onSamples);
  els.shuffleBtn.addEventListener('click', () => {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    assignPhotosToPanels(state, getLayout(state.size, state.template), { seeded: true });
    refresh();
    onChange();
  });
  els.onePhoto.addEventListener('change', () => {
    state.onePhotoEverywhere = els.onePhoto.checked;
    assignPhotosToPanels(state, getLayout(state.size, state.template));
    refresh();
    onChange();
  });
  els.replace.addEventListener('click', () => {
    els.photoInput.dataset.replace = '1';
    els.photoInput.click();
  });

  els.rotate.addEventListener('click', () => {
    const panel = state.panels[state.selectedPanel];
    if (!panel) return;
    panel.rotation = (panel.rotation + 90) % 360;
    onChange();
  });
  els.flipX.addEventListener('click', () => {
    const panel = state.panels[state.selectedPanel];
    if (!panel) return;
    panel.flipX = !panel.flipX;
    onChange();
  });
  els.flipY.addEventListener('click', () => {
    const panel = state.panels[state.selectedPanel];
    if (!panel) return;
    panel.flipY = !panel.flipY;
    onChange();
  });
  els.border.addEventListener('change', () => {
    state.panelBorder = els.border.checked;
    onChange();
  });
  els.randomise.addEventListener('click', () => {
    const rng = mulberry32((state.seed = (Math.imul(state.seed, 1103515245) + 12345) >>> 0));
    randomiseStyle(state, rng);
    ensurePanelCount(state, getLayout(state.size, state.template).panels.length);
    assignPhotosToPanels(state, getLayout(state.size, state.template));
    refresh();
    onChange();
  });
  els.exportBtn.addEventListener('click', onExport);

  document.querySelectorAll('.size-toggles button').forEach((button) => {
    button.addEventListener('click', () => {
      if (state.size === button.dataset.size) return;
      changeSize(state, button.dataset.size);
      const layout = getLayout(state.size, state.template);
      ensurePanelCount(state, layout.panels.length);
      assignPhotosToPanels(state, layout);
      refresh();
      onChange();
    });
  });

  const isTyping = (target) => target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  document.addEventListener('keydown', (event) => {
    if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'r') els.rotate.click();
    else if (key === 'f') els.flipX.click();
    else if (key === 's') els.shuffleBtn.click();
    else if (key === ' ' || key === 'spacebar') { event.preventDefault(); els.randomise.click(); }
    else if (key === 'delete' || key === 'backspace') {
      const panel = state.panels[state.selectedPanel];
      if (panel) { panel.photo = -1; onChange(); }
    }
  });

  const acceptDrop = (event) => {
    event.preventDefault();
    els.dropZone.classList.add('dragover');
  };
  ['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, acceptDrop));
  ['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, () => els.dropZone.classList.remove('dragover')));
  els.dropZone.addEventListener('drop', (event) => {
    if (event.dataTransfer?.files?.length) onFiles(event.dataTransfer.files);
  });
  document.addEventListener('paste', (event) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      event.preventDefault();
      onFiles(files);
    }
  });

  return { refresh, setStatus, refreshTray, els };
}
