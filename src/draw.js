/**
 * Draw tool: sketch points, polylines and polygons directly on the map.
 * Click adds vertices, moving the mouse previews the next segment,
 * double-click (or Finish) commits the shape as a map layer.
 */
import { state, nextId } from './state.js';
import { addLayerFromGeoJSON, zoomToFeatures } from './layers.js';

const SRC = 'tmp_draw';
const LINE = 'tmp_draw_line';
const FILL = 'tmp_draw_fill';
const PTS = 'tmp_draw_pts';

const COLORS = { point: '#d81b60', line: '#1565c0', polygon: '#1e88e5' };

let mode = null; // 'point' | 'line' | 'polygon'
let vertices = [];
let cursor = null;
let statusEl = null;

function emptyFC() {
  return { type: 'FeatureCollection', features: [] };
}

function ensureTemp() {
  const map = state.map;
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: 'geojson', data: emptyFC() });
  map.addLayer({
    id: FILL,
    type: 'fill',
    source: SRC,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#1e88e5', 'fill-opacity': 0.25 },
  });
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#1e88e5', 'line-width': 2.5 },
  });
  map.addLayer({
    id: PTS,
    type: 'circle',
    source: SRC,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5,
      'circle-color': '#00a99a',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
}

function update() {
  const src = state.map.getSource(SRC);
  if (!src) return;
  const feats = [];
  const pts = vertices.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }));
  feats.push(...pts);

  if (mode === 'line' || mode === 'polygon') {
    const coords = vertices.length ? [...vertices] : [];
    if (cursor && coords.length) coords.push(cursor);
    if (mode === 'polygon' && coords.length >= 3) {
      feats.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
      });
    } else if (coords.length >= 2) {
      feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

export function initDraw(el, onCommit) {
  statusEl = el;
  const map = state.map;
  map.on('click', (e) => {
    if (!mode) return;
    if (mode === 'point') {
      commitPoint([e.lngLat.lng, e.lngLat.lat]);
      return;
    }
    vertices.push([e.lngLat.lng, e.lngLat.lat]);
    update();
    setStatus(`${vertices.length} vertex(es). Double-click or Finish to commit.`);
  });
  map.on('mousemove', (e) => {
    if (!mode || mode === 'point') return;
    cursor = [e.lngLat.lng, e.lngLat.lat];
    update();
  });
  map.on('dblclick', () => {
    if (mode === 'line' || mode === 'polygon') finish();
  });
}

function commitPoint(coord) {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coord } },
    ],
  };
  addLayerFromGeoJSON(`Drawing point ${nextId('draw').split('_')[1]}`, fc, { kind: 'point', color: COLORS.point }).then((layer) => {
    zoomToFeatures(layer.geojson);
  });
  reset();
}

export function start(m) {
  stopTemp();
  mode = m;
  vertices = [];
  cursor = null;
  ensureTemp();
  state.map.getCanvas().style.cursor = 'crosshair';
  update();
  setStatus(
    m === 'point'
      ? 'Click on the map to place the point.'
      : 'Click to add vertices. Double-click or Finish to commit.'
  );
}

export async function finish() {
  if (!mode || mode === 'point') return;
  const verts = vertices.map((c) => c.slice());
  if (verts.length < (mode === 'polygon' ? 3 : 2)) {
    reset();
    setStatus('Not enough vertices \u2014 cancelled.');
    return;
  }
  let geometry;
  if (mode === 'line') geometry = { type: 'LineString', coordinates: verts };
  else geometry = { type: 'Polygon', coordinates: [[...verts, verts[0]]] };
  const fc = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry }],
  };
  const label = mode === 'line' ? 'Drawing line' : 'Drawing polygon';
  const layer = await addLayerFromGeoJSON(label, fc, { kind: mode, color: COLORS[mode] });
  zoomToFeatures(layer.geojson);
  reset();
  setStatus(`${label} added.`);
}

export function reset() {
  mode = null;
  vertices = [];
  cursor = null;
  state.map.getCanvas().style.cursor = '';
  const src = state.map.getSource(SRC);
  if (src) src.setData(emptyFC());
}

export function stopTemp() {
  reset();
  const map = state.map;
  for (const id of [FILL, LINE, PTS]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SRC)) map.removeSource(SRC);
}

export function isDrawing() {
  return mode !== null;
}
