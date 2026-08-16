import * as turf from '@turf/turf';
import { state, nextId, notify } from './state.js';

export const DEFAULT_COLORS = {
  point: '#d81b60',
  line: '#1565c0',
  polygon: '#1e88e5',
  mixed: '#6a1b9a',
  green: '#2e7d32',
  commercial: '#c62828',
  residential: '#f9a825',
  other: '#757575',
};

const FONT_STACK = ['Open Sans Regular'];

export function geometryTypes(geojson) {
  const types = new Set();
  for (const f of geojson.features || []) {
    const g = f.geometry && f.geometry.type;
    if (!g) continue;
    if (g === 'Point' || g === 'MultiPoint') types.add('point');
    else if (g === 'LineString' || g === 'MultiLineString') types.add('line');
    else if (g === 'Polygon' || g === 'MultiPolygon') types.add('polygon');
  }
  return types;
}

function buildStyleSpecs(geojson, { color, opacity, width, size, labels, field }) {
  const types = geometryTypes(geojson);
  const specs = [];

  // Categorized styling for polygon layers with a field (e.g. landuse_type)
  if (field && types.has('polygon')) {
    const categories = new Map();
    for (const f of geojson.features || []) {
      const v = f.properties ? f.properties[field] : undefined;
      if (v === undefined || v === null) continue;
      if (!categories.has(v)) categories.set(v, []);
      categories.get(v).push(f);
    }
    for (const [value, feats] of categories) {
      const catColor = DEFAULT_COLORS[value] || DEFAULT_COLORS.polygon;
      specs.push({
        kind: 'fill',
        filter: value,
        color: catColor,
        type: 'fill',
        paint: { 'fill-color': catColor, 'fill-opacity': opacity * 0.35 },
      });
      specs.push({
        kind: 'outline',
        filter: value,
        color: catColor,
        type: 'line',
        paint: { 'line-color': catColor, 'line-width': Math.max(1, width * 0.7) },
      });
    }
    return specs;
  }

  if (types.has('point')) {
    specs.push({
      kind: 'circle',
      type: 'circle',
      paint: {
        'circle-radius': size,
        'circle-color': color,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': opacity,
      },
    });
  }
  if (types.has('line')) {
    specs.push({
      kind: 'line',
      type: 'line',
      paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity },
    });
  }
  if (types.has('polygon')) {
    specs.push({
      kind: 'fill',
      type: 'fill',
      paint: { 'fill-color': color, 'fill-opacity': opacity * 0.25 },
    });
    specs.push({
      kind: 'outline',
      type: 'line',
      paint: { 'line-color': color, 'line-width': Math.max(1, width * 0.7) },
    });
  }
  if (labels) {
    specs.push({
      kind: 'label',
      type: 'symbol',
      layout: {
        'text-field': ['get', labels.field],
        'text-font': FONT_STACK,
        'text-size': labels.size ?? 12,
        'text-anchor': 'top',
        'text-offset': [0, 1.1],
      },
      paint: {
        'text-color': '#263238',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }
  return specs;
}

export async function addLayerFromGeoJSON(name, geojson, opts = {}) {
  const map = state.map;
  if (!map) throw new Error('Map is not initialised yet.');
  if (!map.isStyleLoaded()) await new Promise((r) => map.once('load', r));
  const id = nextId('layer');
  const sourceId = `src_${id}`;
  const types = geometryTypes(geojson);

  const color = opts.color ?? DEFAULT_COLORS[opts.kind] ?? DEFAULT_COLORS[[...types][0]] ?? DEFAULT_COLORS.mixed;
  const opacity = opts.opacity ?? 1;
  const width = opts.width ?? 3;
  const size = opts.size ?? 6;
  const styleSpecs = buildStyleSpecs(geojson, {
    color,
    opacity,
    width,
    size,
    labels: opts.labels,
    field: opts.field,
  });

  map.addSource(sourceId, { type: 'geojson', data: geojson });

  const layerIds = [];
  const layerPrefix = `ln_${id}`;
  const uniqueValues = new Set();
  for (const f of geojson.features || []) {
    const v = f.properties && f.properties[opts.field];
    if (v !== undefined && v !== null) uniqueValues.add(String(v));
  }

  styleSpecs.forEach((spec, i) => {
    const { kind, color: c, filter, ...mlSpec } = spec;
    const layerId = `${layerPrefix}_${kind}${filter !== undefined ? '_' + i : ''}`;
    const ml = { ...mlSpec, id: layerId, source: sourceId };
    if (filter !== undefined) ml.filter = ['==', opts.field, filter];
    map.addLayer(ml);
    layerIds.push(layerId);
  });

  const layer = {
    id,
    name,
    sourceId,
    layerIds,
    geojson,
    types,
    color,
    opacity,
    width,
    size,
    styleSpecs,
    labels: opts.labels,
    field: opts.field,
    uniqueValues: [...uniqueValues],
    visible: true,
    kind: opts.kind,
  };
  state.layers.set(id, layer);
  notify();
  return layer;
}

export function removeLayer(id) {
  const layer = state.layers.get(id);
  if (!layer) return;
  const map = state.map;
  for (const lid of layer.layerIds) {
    if (map.getLayer(lid)) map.removeLayer(lid);
  }
  if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId);
  state.layers.delete(id);
  notify();
}

export function setLayerVisibility(id, visible) {
  const layer = state.layers.get(id);
  if (!layer) return;
  layer.visible = visible;
  for (const lid of layer.layerIds) {
    state.map.setLayoutProperty(lid, 'visibility', visible ? 'visible' : 'none');
  }
  notify();
}

export function updateLayerStyle(id, patch) {
  const layer = state.layers.get(id);
  if (!layer) return;
  Object.assign(layer, patch);
  const map = state.map;
  for (const lid of layer.layerIds) {
    const lyr = map.getLayer(lid);
    if (!lyr) continue;
    const type = lyr.type;
    if (patch.color !== undefined) {
      if (type === 'circle') map.setPaintProperty(lid, 'circle-color', patch.color);
      else if (type === 'line') map.setPaintProperty(lid, 'line-color', patch.color);
      else if (type === 'fill') map.setPaintProperty(lid, 'fill-color', patch.color);
    }
    if (patch.opacity !== undefined) {
      if (type === 'circle') map.setPaintProperty(lid, 'circle-opacity', patch.opacity);
      else if (type === 'line') map.setPaintProperty(lid, 'line-opacity', patch.opacity);
      else if (type === 'fill') map.setPaintProperty(lid, 'fill-opacity', patch.opacity * 0.35);
    }
    if (patch.width !== undefined && type === 'line' && lid.endsWith('_line')) {
      map.setPaintProperty(lid, 'line-width', patch.width);
    }
    if (patch.size !== undefined && type === 'circle') {
      map.setPaintProperty(lid, 'circle-radius', patch.size);
    }
  }
}

export function zoomToLayer(id) {
  const layer = state.layers.get(id);
  if (!layer) return;
  zoomToFeatures(layer.geojson);
}

/** Fit the map to a GeoJSON feature collection's extent (no-op if invalid/empty). */
export function zoomToFeatures(geojson) {
  const bbox = turf.bbox(geojson);
  if (!bbox || !bbox.every(Number.isFinite)) return;
  state.map.fitBounds(
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ],
    { padding: 60, maxZoom: 16 }
  );
}

export function findLayerByName(name) {
  const n = String(name).toLowerCase();
  for (const l of state.layers.values()) {
    if (l.name.toLowerCase() === n) return l;
  }
  return null;
}
