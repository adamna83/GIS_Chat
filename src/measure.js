/**
 * Measure tool: click points on the map; cumulative distance shown in km.
 */
import * as turf from '@turf/turf';
import { state } from './state.js';

const SRC = 'tmp_measure';
const LINE = 'tmp_measure_line';
const PTS = 'tmp_measure_pts';

let active = false;
let points = [];
let resultEl = null;

function emptyFC() {
  return { type: 'FeatureCollection', features: [] };
}

function ensureTemp() {
  const map = state.map;
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: 'geojson', data: emptyFC() });
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SRC,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#00a19c', 'line-width': 2.5, 'line-dasharray': [2, 1] },
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
  if (points.length === 1) {
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: points[0] } });
  } else if (points.length >= 2) {
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } });
    feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: points[points.length - 1] } });
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}

function setResult(text) {
  if (resultEl) resultEl.textContent = text;
}

function distance() {
  if (points.length < 2) return null;
  const d = turf.length({ type: 'LineString', coordinates: points }, { units: 'kilometers' });
  return d.toFixed(3);
}

export function initMeasure(el) {
  resultEl = el;
  const map = state.map;
  map.on('click', (e) => {
    if (!active) return;
    points.push([e.lngLat.lng, e.lngLat.lat]);
    update();
    const d = distance();
    setResult(d !== null ? `Distance: ${d} km (${points.length} points)` : `Point ${points.length} \u2014 click to continue`);
  });
  map.on('dblclick', () => {
    if (!active) return;
    finish();
  });
}

export function enable() {
  if (active) return;
  active = true;
  points = [];
  ensureTemp();
  state.map.getCanvas().style.cursor = 'crosshair';
  setResult('Click points to measure. Double-click to finish.');
}

export function finish() {
  if (!active) return;
  active = false;
  state.map.getCanvas().style.cursor = '';
  const d = distance();
  setResult(d !== null ? `Finished \u2014 total ${d} km` : 'Measurement cleared.');
}

export function cancel() {
  active = false;
  points = [];
  state.map.getCanvas().style.cursor = '';
  const src = state.map.getSource(SRC);
  if (src) src.setData(emptyFC());
  setResult('');
}

export function clear() {
  points = [];
  update();
  setResult('');
}

export function isActive() {
  return active;
}

export function stopTemp() {
  cancel();
  const map = state.map;
  for (const id of [LINE, PTS]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SRC)) map.removeSource(SRC);
}
