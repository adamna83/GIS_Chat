/**
 * Left sidebar: Data Layers, Import, Measure, Draw, Plot tools.
 */
import { state, onStateChange } from './state.js';
import { addLayerFromGeoJSON, removeLayer, setLayerVisibility, zoomToLayer } from './layers.js';
import { importFiles } from './import.js';
import * as measure from './measure.js';
import * as draw from './draw.js';
import { plotCoordinates } from './plot.js';
import { toast } from './ui.js';

function el(id) {
  return document.getElementById(id);
}

function showStatus(id, text, isError = false) {
  const node = el(id);
  if (node) {
    node.textContent = text;
    node.style.color = isError ? '#ff6b6b' : '';
  }
}

function geometryLabel(types, geojson) {
  const count = geojson && geojson.features ? geojson.features.length : 0;
  const t = [...types].join(', ');
  return `${count} feature${count === 1 ? '' : 's'} \u00b7 ${t}`;
}

function renderLayers() {
  const list = el('layerList');
  if (!list) return;
  list.innerHTML = '';
  const layers = [...state.layers.values()];
  if (!layers.length) {
    list.innerHTML = '<p class="hint empty-hint">No data layers yet. Ask the assistant to load roads or land use, import a file, draw, or plot points.</p>';
    return;
  }
  for (const layer of layers) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.id = layer.id;

    const swatch = document.createElement('span');
    swatch.className = 'layer-swatch';
    swatch.style.background = layer.color || '#00a19c';

    const info = document.createElement('div');
    info.className = 'layer-info';
    const name = document.createElement('div');
    name.className = 'layer-name';
    name.textContent = layer.name;
    const sub = document.createElement('div');
    sub.className = 'layer-sub';
    sub.textContent = geometryLabel(layer.types, layer.geojson);
    info.append(name, sub);

    const actions = document.createElement('div');
    actions.className = 'layer-actions';

    const btnVis = document.createElement('button');
    btnVis.className = 'icon-btn';
    btnVis.dataset.act = 'toggle';
    btnVis.title = layer.visible ? 'Hide layer' : 'Show layer';
    btnVis.textContent = layer.visible ? '\u25c9' : '\u25cb';
    btnVis.classList.toggle('off', !layer.visible);

    const btnZoom = document.createElement('button');
    btnZoom.className = 'icon-btn';
    btnZoom.dataset.act = 'zoom';
    btnZoom.title = 'Zoom to layer';
    btnZoom.textContent = '\u25a2';

    const btnRemove = document.createElement('button');
    btnRemove.className = 'icon-btn danger';
    btnRemove.dataset.act = 'remove';
    btnRemove.title = 'Remove layer';
    btnRemove.textContent = '\u00d7';

    actions.append(btnVis, btnZoom, btnRemove);
    row.append(swatch, info, actions);
    list.appendChild(row);
  }
}

function switchTab(name) {
  document.querySelectorAll('#sideTabs .side-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll('#sideContent .side-pane').forEach((pane) => {
    pane.classList.toggle('hidden', pane.dataset.pane !== name);
  });
  if (name === 'layers') renderLayers();
  if (name !== 'draw') draw.reset();
  if (name !== 'measure') measure.cancel();
}

async function doImport() {
  const input = el('importInput');
  const files = input.files;
  if (!files.length) return;
  showStatus('importStatus', 'Reading files\u2026');
  try {
    const results = await importFiles(files);
    let added = 0;
    for (const r of results) {
      const layer = await addLayerFromGeoJSON(r.name, r.geojson);
      zoomToLayer(layer.id);
      added++;
    }
    showStatus('importStatus', `Imported ${added} file${added === 1 ? '' : 's'} \u2014 see the Layers tab.`);
    toast(`Imported ${added} file${added === 1 ? '' : 's'}`, 'success');
    switchTab('layers');
    input.value = '';
  } catch (err) {
    showStatus('importStatus', err.message, true);
    toast(`Import failed: ${err.message}`, 'error');
  }
}

export function initSidebar() {
  onStateChange(renderLayers);
  renderLayers();

  el('sideTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.side-tab');
    if (btn) switchTab(btn.dataset.tab);
  });

  el('layerList').addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    const id = btn.closest('.layer-row').dataset.id;
    if (btn.dataset.act === 'toggle') setLayerVisibility(id, !state.layers.get(id).visible);
    else if (btn.dataset.act === 'zoom') zoomToLayer(id);
    else if (btn.dataset.act === 'remove') {
      removeLayer(id);
      toast('Layer removed.', 'success');
    }
  });

  el('btnImport').addEventListener('click', doImport);

  measure.initMeasure(el('measureResult'));
  el('btnMeasureStart').addEventListener('click', () => {
    draw.reset();
    measure.enable();
  });
  el('btnMeasureClear').addEventListener('click', () => measure.clear());

  draw.initDraw(el('drawStatus'));
  document.querySelectorAll('[data-draw]').forEach((btn) => {
    btn.addEventListener('click', () => {
      measure.cancel();
      draw.start(btn.dataset.draw);
    });
  });
  el('btnDrawFinish').addEventListener('click', () => draw.finish());
  el('btnDrawCancel').addEventListener('click', () => draw.reset());

  el('btnPlot').addEventListener('click', async () => {
    const text = el('plotInput').value;
    if (!text.trim()) return;
    showStatus('plotStatus', 'Plotting\u2026');
    try {
      const res = await plotCoordinates(text, el('plotLonFirst').checked);
      showStatus('plotStatus', `${res.count} point${res.count === 1 ? '' : 's'} plotted.`);
      if (res.errors.length) showStatus('plotStatus', `${res.count} plotted; ${res.errors.length} skipped.`, true);
      toast(`Plotted ${res.count} point${res.count === 1 ? '' : 's'}`, 'success');
      switchTab('layers');
    } catch (err) {
      showStatus('plotStatus', err.message, true);
      toast(`Plot failed: ${err.message}`, 'error');
    }
  });
}
